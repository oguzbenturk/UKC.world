// Per-customer manual percentage discount helpers.
//
// One discount row per (entity_type, entity_id). Re-applying replaces the
// existing row (UPSERT). The original price is read from the source table
// at apply time and the absolute discount amount is locked in.

import Decimal from 'decimal.js';
import { logger } from '../middlewares/errorHandler.js';
import { recordTransaction } from './walletService.js';

// Maps each supported entity to:
//   table     - the SQL table to read the original price from
//   priceCol  - column holding the price (post-voucher for bookings)
//   customerCol - the column that links the row to a user
//   currencyCol - currency column (or null if the table doesn't store one)
// idType: 'uuid' or 'int' — bookings/rentals/accommodation_bookings/customer_packages
// use UUID PKs; member_purchases/shop_orders use SERIAL integer.
// `paidStatusExpr` returns a SQL expression evaluating to TRUE when the row
// has already been paid for (so a manual % discount applied AFTER the fact
// should be refunded to the wallet, not just displayed).
const ENTITY_CONFIG = {
  booking: {
    table: 'bookings',
    priceCol: 'COALESCE(NULLIF(final_amount, 0), amount)',
    customerCol: 'student_user_id',
    currencyCol: 'currency',
    idType: 'uuid',
    paidStatusExpr: `payment_status IN ('paid', 'completed')`,
  },
  rental: {
    table: 'rentals',
    priceCol: 'total_price',
    customerCol: 'user_id',
    currencyCol: 'currency',
    idType: 'uuid',
    paidStatusExpr: `payment_status IN ('paid', 'completed')`,
  },
  accommodation_booking: {
    table: 'accommodation_bookings',
    priceCol: 'total_price',
    customerCol: 'guest_id',
    currencyCol: 'currency',
    idType: 'uuid',
    paidStatusExpr: `payment_status IN ('paid', 'completed')`,
  },
  customer_package: {
    table: 'customer_packages',
    priceCol: 'purchase_price',
    customerCol: 'customer_id',
    currencyCol: 'currency',
    idType: 'uuid',
    // Packages are recorded as bought when the row exists; treat as paid.
    paidStatusExpr: `TRUE`,
  },
  member_purchase: {
    table: 'member_purchases',
    priceCol: 'offering_price',
    customerCol: 'user_id',
    currencyCol: null,
    idType: 'int',
    paidStatusExpr: `payment_status IN ('paid', 'completed')`,
  },
  shop_order: {
    table: 'shop_orders',
    priceCol: 'total_amount',
    customerCol: 'user_id',
    currencyCol: 'currency',
    idType: 'int',
    paidStatusExpr: `payment_status IN ('paid', 'completed')`,
  },
};

// transaction_type used when crediting / reversing a discount adjustment.
// The aggregator's existing `direction === 'credit'` rule already counts this
// as "Payments received" in the bill, and the Financial History tab lists
// every row from wallet_transactions, so it'll show up there automatically.
const DISCOUNT_TX_TYPE = 'discount_adjustment';
const DISCOUNT_REVERSAL_TX_TYPE = 'discount_adjustment_reversal';

export const SUPPORTED_ENTITY_TYPES = Object.keys(ENTITY_CONFIG);

const isSupported = (entityType) => Object.hasOwn(ENTITY_CONFIG, entityType);

// Reads the original price + currency + owning customer for one entity.
// Throws if the row doesn't exist.
export async function getEntitySnapshot(client, entityType, entityId) {
  if (!isSupported(entityType)) {
    const err = new Error(`Unsupported entity_type: ${entityType}`);
    err.status = 400;
    throw err;
  }
  const cfg = ENTITY_CONFIG[entityType];
  const currencyExpr = cfg.currencyCol ? cfg.currencyCol : `NULL::text`;
  const idCast = cfg.idType === 'int' ? '::integer' : '::uuid';
  const sql = `
    SELECT
      ${cfg.priceCol} AS original_price,
      ${currencyExpr} AS currency,
      ${cfg.customerCol} AS customer_id,
      (${cfg.paidStatusExpr}) AS is_paid
    FROM ${cfg.table}
    WHERE id = $1${idCast}
    LIMIT 1
  `;
  const { rows } = await client.query(sql, [String(entityId)]);
  if (!rows.length) {
    const err = new Error(`No ${entityType} found with id ${entityId}`);
    err.status = 404;
    throw err;
  }
  return {
    originalPrice: Number(rows[0].original_price) || 0,
    currency: rows[0].currency || null,
    customerId: rows[0].customer_id,
    isPaid: !!rows[0].is_paid,
  };
}

// Find the live (non-reversed) discount-adjustment credit for a given discount.
// Returns the row if a matching credit exists with no later reversal; null otherwise.
async function findOpenDiscountAdjustment(client, discountId) {
  const { rows } = await client.query(
    `
    SELECT t.*
    FROM wallet_transactions t
    WHERE t.discount_id = $1
      AND t.transaction_type = $2
      AND t.direction = 'credit'
      AND t.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions r
        WHERE r.discount_id = t.discount_id
          AND r.transaction_type = $3
          AND r.created_at >= t.created_at
      )
    ORDER BY t.created_at DESC
    LIMIT 1
    `,
    [discountId, DISCOUNT_TX_TYPE, DISCOUNT_REVERSAL_TX_TYPE]
  );
  return rows[0] || null;
}

// Posts a debit that reverses a prior discount-adjustment credit. Used when
// the discount is removed or its amount changes (we reverse, then post fresh).
async function reverseDiscountAdjustment(client, openCredit, { reason, createdBy } = {}) {
  if (!openCredit) return null;
  const amount = Math.abs(Number(openCredit.amount) || 0);
  if (amount <= 0) return null;
  return recordTransaction({
    client,
    userId: openCredit.user_id,
    amount,
    transactionType: DISCOUNT_REVERSAL_TX_TYPE,
    direction: 'debit',
    availableDelta: -amount,
    currency: openCredit.currency,
    description: reason || 'Discount adjustment reversed',
    relatedEntityType: openCredit.related_entity_type,
    relatedEntityId: openCredit.related_entity_id,
    bookingId: openCredit.booking_id,
    rentalId: openCredit.rental_id,
    metadata: {
      reversal_of: openCredit.id,
      discount_id: openCredit.discount_id,
    },
    createdBy: createdBy || null,
    allowNegative: true,
  }).then(async (tx) => {
    if (tx?.id) {
      await client.query(`UPDATE wallet_transactions SET discount_id = $1 WHERE id = $2`, [openCredit.discount_id, tx.id]);
    }
    return tx;
  });
}

// Posts a wallet credit equal to `amount` referencing this discount row.
async function postDiscountAdjustment(client, {
  customerId, amount, currency, discountId, entityType, entityId, reason, createdBy,
}) {
  const fields = {};
  if (entityType === 'booking') fields.bookingId = entityId;
  if (entityType === 'rental') fields.rentalId = entityId;
  const tx = await recordTransaction({
    client,
    userId: customerId,
    amount,
    transactionType: DISCOUNT_TX_TYPE,
    direction: 'credit',
    availableDelta: amount,
    currency,
    description: reason ? `Discount adjustment: ${reason}` : 'Discount adjustment',
    relatedEntityType: entityType,
    relatedEntityId: String(entityId),
    metadata: { discount_id: discountId, entity_type: entityType, entity_id: String(entityId) },
    createdBy: createdBy || null,
    // A refund-style credit must never be blocked because the customer's
    // wallet was already in the red — we'd just be reducing the negative.
    allowNegative: true,
    ...fields,
  });
  if (tx?.id) {
    await client.query(`UPDATE wallet_transactions SET discount_id = $1 WHERE id = $2`, [discountId, tx.id]);
  }
  return tx;
}

// Compute the discount amount given the original price and a percent.
// Rounds half-up to 2 decimal places.
export function computeDiscountAmount(originalPrice, percent) {
  const orig = new Decimal(originalPrice || 0);
  const pct = new Decimal(percent || 0).div(100);
  return Number(orig.mul(pct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString());
}

// Upserts a single discount row inside an existing client transaction.
// Verifies the entity actually belongs to the supplied customer_id.
export async function applyDiscount(client, {
  customerId,
  entityType,
  entityId,
  percent,
  reason,
  createdBy,
}) {
  if (!customerId) throw Object.assign(new Error('customer_id required'), { status: 400 });
  if (!isSupported(entityType)) throw Object.assign(new Error(`Unsupported entity_type: ${entityType}`), { status: 400 });
  const pct = Number(percent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw Object.assign(new Error('percent must be between 0 and 100'), { status: 400 });
  }

  const snapshot = await getEntitySnapshot(client, entityType, entityId);
  if (snapshot.customerId !== customerId) {
    throw Object.assign(new Error('Entity does not belong to this customer'), { status: 403 });
  }

  // Find any existing discount row + its open wallet credit so we can reverse
  // before applying a new value. Both apply-with-new-percent AND zero-percent
  // (delete) paths reuse this lookup.
  const existing = await client.query(
    `SELECT id FROM discounts WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, String(entityId)]
  );
  const existingId = existing.rows[0]?.id || null;
  const openCredit = existingId ? await findOpenDiscountAdjustment(client, existingId) : null;

  // Zero percent means "no discount" — delete any existing row instead of
  // storing a no-op. Reverse the wallet credit first so balances stay correct.
  if (pct === 0) {
    if (openCredit) {
      await reverseDiscountAdjustment(client, openCredit, {
        reason: 'Discount removed',
        createdBy,
      });
    }
    const del = await client.query(
      `DELETE FROM discounts WHERE entity_type = $1 AND entity_id = $2 RETURNING id`,
      [entityType, String(entityId)]
    );
    return { deleted: del.rowCount > 0, snapshot };
  }

  const amount = computeDiscountAmount(snapshot.originalPrice, pct);

  // If the percent (and therefore amount) changed, reverse the old credit so
  // we can post a fresh credit reflecting the new amount. Reversing first +
  // posting fresh is simpler than computing a delta and keeps the audit trail
  // explicit (one reversal row, one new credit row).
  if (openCredit && Number(openCredit.amount) !== Number(amount)) {
    await reverseDiscountAdjustment(client, openCredit, {
      reason: 'Discount amount changed',
      createdBy,
    });
  }

  const result = await client.query(
    `
    INSERT INTO discounts (
      customer_id, entity_type, entity_id, percent, amount, currency, reason, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (entity_type, entity_id) DO UPDATE
      SET percent    = EXCLUDED.percent,
          amount     = EXCLUDED.amount,
          currency   = EXCLUDED.currency,
          reason     = EXCLUDED.reason,
          customer_id = EXCLUDED.customer_id,
          updated_at = NOW()
    RETURNING *
    `,
    [
      customerId,
      entityType,
      String(entityId),
      pct,
      amount,
      snapshot.currency,
      reason || null,
      createdBy || null,
    ]
  );

  const discount = result.rows[0];
  let adjustment = null;

  // Only post a wallet credit when (a) the entity has been paid and (b) we
  // don't already have an open credit at the same amount (e.g. a no-op
  // reapply). Unpaid items don't need a refund — staff just collect less at
  // payment time.
  const needsFresh = !openCredit || Number(openCredit.amount) !== Number(amount);
  if (snapshot.isPaid && amount > 0 && needsFresh) {
    adjustment = await postDiscountAdjustment(client, {
      customerId,
      amount,
      currency: snapshot.currency || 'EUR',
      discountId: discount.id,
      entityType,
      entityId,
      reason,
      createdBy,
    });
  }

  return { discount, snapshot, adjustment };
}

// List all discounts for a customer (used by frontend to thread into the bill
// aggregator and per-service tabs).
export async function listDiscountsForCustomer(client, customerId) {
  const { rows } = await client.query(
    `
    SELECT id, customer_id, entity_type, entity_id, percent, amount, currency,
           reason, created_by, created_at, updated_at
    FROM discounts
    WHERE customer_id = $1
    ORDER BY created_at DESC
    `,
    [customerId]
  );
  return rows;
}

export async function deleteDiscount(client, id, { createdBy } = {}) {
  // Reverse any outstanding wallet credit for this discount before deleting.
  // Once the discount row is gone, `discount_id` on past credits goes NULL
  // (ON DELETE SET NULL) so it must be reversed first.
  const openCredit = await findOpenDiscountAdjustment(client, id);
  if (openCredit) {
    await reverseDiscountAdjustment(client, openCredit, {
      reason: 'Discount removed',
      createdBy,
    });
  }
  const { rowCount } = await client.query(`DELETE FROM discounts WHERE id = $1`, [id]);
  return rowCount > 0;
}

// Logger helper used by the route to keep audit context together.
export function logDiscountApply(action, payload) {
  logger.info(`Discount ${action}`, payload);
}
