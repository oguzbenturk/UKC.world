// Headline finance totals — total revenue, refunds, instructor + manager
// commission and net — computed exactly like GET /api/finances/summary
// (accrual mode, all service types) so every dashboard shows the same figures
// as the Finances page.
//
// Revenue definition (same as /finances/summary): services CONSUMED, not
// wallet deposits —
//   lessons        getLessonFinanceBreakdown (canonical per-booking derivation)
//   rentals        rentals.total_price net of rental discounts, real statuses only
//   accommodation  wallet accommodation_charge rows
//   memberships    member_purchases.offering_price net of discounts
//   shop           shop wallet rows
// Refunds = wallet REFUND_TYPES (EUR-normalised).
// Net = revenue − refunds − instructor commission − manager commission
// (the "Net Revenue" the /dashboard KPI and the Finances page use).
//
// NOTE: /finances/summary in backend/routes/finances.js still runs its own copy
// of these queries; keep the two in sync (or switch the route to this helper).
import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { discountSumLateral } from '../utils/discountAmounts.js';
import { REFUND_TYPES, EXCLUDED_REVENUE_TYPES } from '../constants/transactions.js';
import { getLessonFinanceBreakdown } from './instructorFinanceService.js';
import { MANAGER_COMMISSION_LIVE_GUARD_SQL } from './managerCommissionService.js';

/**
 * Ledger rows that never count in customer-facing finance reports: staff
 * payouts, rows of soft-deleted bookings, hard-deleted rentals, deleted
 * packages / accommodation bookings. Identical to activeFinanceTxnFilter in
 * backend/routes/finances.js.
 */
export function activeFinanceTxnFilter(alias = 'wallet_transactions') {
  return `
    (${alias}.entity_type IS NULL OR ${alias}.entity_type NOT IN ('manager_payment','instructor_payment','manager','instructor'))
    AND (${alias}.booking_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM bookings b
       WHERE b.id = ${alias}.booking_id
         AND b.deleted_at IS NOT NULL
    ))
    AND (${alias}.rental_id IS NULL OR EXISTS (
      SELECT 1 FROM rentals r WHERE r.id = ${alias}.rental_id
    ))
    AND (${alias}.related_entity_type IS NULL
      OR ${alias}.related_entity_type <> 'customer_package'
      OR EXISTS (SELECT 1 FROM customer_packages cp WHERE cp.id = ${alias}.related_entity_id))
    AND (${alias}.related_entity_type IS NULL
      OR ${alias}.related_entity_type <> 'accommodation_booking'
      OR EXISTS (SELECT 1 FROM accommodation_bookings ab WHERE ab.id = ${alias}.related_entity_id))
  `;
}

const dec = (value) => {
  try {
    const d = new Decimal(value ?? 0);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};

/**
 * @param {{ startDate?: string|null, endDate?: string|null }} range  YYYY-MM-DD, inclusive
 * @returns {Promise<{ totalRevenue: number, lessonRevenue: number, rentalRevenue: number,
 *   accommodationRevenue: number, membershipRevenue: number, shopRevenue: number,
 *   refunds: number, instructorCommission: number, managerCommission: number,
 *   net: number, transactions: number }>}
 */
export async function getFinanceTotals({ startDate, endDate } = {}) {
  const dateStart = startDate || '1900-01-01';
  const dateEnd = endDate || '2100-01-01';

  const [wallet, rentals, lessonFinance, walletCharges, membership, shop, managerCommission] = await Promise.all([
    // Refunds + the ledger row count (EUR-normalised; amount / units-per-EUR).
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = ANY($3) THEN wallet_transactions.amount / COALESCE(cs.exchange_rate, 1) ELSE 0 END), 0) AS total_refunds,
        COUNT(*)::int AS total_transactions
      FROM wallet_transactions
      LEFT JOIN currency_settings cs ON cs.currency_code = wallet_transactions.currency AND cs.is_active = true
      WHERE transaction_date >= $1::date AND transaction_date < ($2::date + interval '1 day')
        AND status = 'completed'
        AND NOT (transaction_type = ANY($4))
        AND ${activeFinanceTxnFilter()}
    `, [dateStart, dateEnd, REFUND_TYPES, EXCLUDED_REVENUE_TYPES]),

    pool.query(`
      SELECT COALESCE(SUM(GREATEST(COALESCE(rentals.total_price, 0) - rt_disc.amt, 0)), 0) AS rental_revenue
      FROM rentals
      ${discountSumLateral('rt_disc', 'rental', 'rentals.id')}
      WHERE (
        (rental_date IS NOT NULL AND rental_date >= $1::date AND rental_date <= $2::date)
        OR (
          rental_date IS NULL AND (
            (start_date >= $1::date AND start_date < ($2::date + interval '1 day')) OR
            (end_date   >= $1::date AND end_date   < ($2::date + interval '1 day')) OR
            (start_date <  $1::date AND end_date   >  $2::date)
          )
        )
      )
      AND status IN ('active','upcoming','completed','overdue')
    `, [dateStart, dateEnd]),

    getLessonFinanceBreakdown({ startDate: dateStart, endDate: dateEnd }),

    pool.query(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'accommodation_charge' THEN ABS(amount) ELSE 0 END), 0) AS accommodation_charges
      FROM wallet_transactions
      WHERE transaction_date >= $1::date AND transaction_date < ($2::date + interval '1 day')
        AND status = 'completed'
        AND ${activeFinanceTxnFilter()}
    `, [dateStart, dateEnd]),

    pool.query(`
      SELECT COALESCE(SUM(GREATEST(COALESCE(member_purchases.offering_price, 0) - mp_disc.amt, 0)), 0) AS membership_revenue
      FROM member_purchases
      ${discountSumLateral('mp_disc', 'member_purchase', 'member_purchases.id')}
      WHERE purchased_at >= $1::date AND purchased_at < ($2::date + interval '1 day')
        AND payment_status = 'completed'
        AND status <> 'cancelled'
    `, [dateStart, dateEnd]),

    pool.query(`
      SELECT COALESCE(SUM(ABS(amount)), 0) AS shop_revenue
      FROM wallet_transactions
      WHERE transaction_date >= $1::date AND transaction_date < ($2::date + interval '1 day')
        AND status = 'completed'
        AND (
          transaction_type IN ('product_purchase', 'shop_purchase', 'merchandise_purchase')
          OR (transaction_type = 'charge' AND description ILIKE '%product%')
          OR (transaction_type = 'charge' AND description ILIKE '%shop%')
          OR (transaction_type = 'payment' AND description ILIKE '%shop order%')
          OR (related_entity_type = 'shop_order')
        )
        AND ${activeFinanceTxnFilter()}
    `, [dateStart, dateEnd]),

    pool.query(`
      SELECT COALESCE(SUM(mc.commission_amount), 0) AS total
      FROM manager_commissions mc
      WHERE mc.source_date >= $1::date AND mc.source_date <= $2::date
        AND mc.status <> 'cancelled'
        AND ${MANAGER_COMMISSION_LIVE_GUARD_SQL}
    `, [dateStart, dateEnd]),
  ]);

  const lessonRevenue = dec(lessonFinance?.totals?.revenue);
  const instructorCommission = dec(lessonFinance?.totals?.commission);
  const rentalRevenue = dec(rentals.rows[0]?.rental_revenue);
  const accommodationRevenue = dec(walletCharges.rows[0]?.accommodation_charges);
  const membershipRevenue = dec(membership.rows[0]?.membership_revenue);
  const shopRevenue = dec(shop.rows[0]?.shop_revenue);
  const refunds = dec(wallet.rows[0]?.total_refunds);
  const managerTotal = dec(managerCommission.rows[0]?.total);

  // Package PURCHASES are not added: package lessons are recognised through
  // consumption inside lessonRevenue (same as /finances/summary).
  const totalRevenue = lessonRevenue.plus(rentalRevenue).plus(accommodationRevenue)
    .plus(membershipRevenue).plus(shopRevenue);
  const net = totalRevenue.minus(refunds).minus(instructorCommission).minus(managerTotal);

  const out = (d) => d.toDecimalPlaces(2).toNumber();
  return {
    totalRevenue: out(totalRevenue),
    lessonRevenue: out(lessonRevenue),
    rentalRevenue: out(rentalRevenue),
    accommodationRevenue: out(accommodationRevenue),
    membershipRevenue: out(membershipRevenue),
    shopRevenue: out(shopRevenue),
    refunds: out(refunds),
    instructorCommission: out(instructorCommission),
    managerCommission: out(managerTotal),
    net: out(net),
    transactions: Number(wallet.rows[0]?.total_transactions) || 0,
  };
}
