// backend/services/shopOrderPriceService.js
//
// Lets staff edit a shop order line-item's price AFTER the sale (many products
// are sold with no price set, so the price is added later from the customer
// drawer). The edit must keep every record that reads the order consistent
// WITHOUT touching the catalog product price.
//
// What it does, atomically inside the caller's transaction:
//   1) Convert the entered price into the order's currency (the operator may
//      type it in any active currency — backend Decimal conversion is the
//      authoritative value).
//   2) Update shop_order_items.unit_price + total_price, preserving the FIRST
//      agreed unit_price in original_unit_price on the first edit.
//   3) Re-derive shop_orders.subtotal + total_amount from the line items
//      (total_amount stays GROSS of the discounts-table discount — which is
//      subtracted at read via discountSumLateral — but net of any voucher
//      discount stored in shop_orders.discount_amount).
//   4) Rebase any layered % discount's recorded amount against the new total so
//      finance reports subtract the right figure.
//   5) Recompute the pending manager commission from the new total.
//
// When settleWallet is true (the default) it ALSO posts a wallet adjustment for
// the delta, shaped exactly like a real shop payment/refund: raising the price
// debits the customer (they are charged / balance drops, may go negative),
// lowering it credits them back. This is what registers a price in the
// customer's financial history — a product sold at 0 gets real financial
// history the moment its price is set. Pass settleWallet=false for a pure
// record fix. The catalog products.price is never written.

import Decimal from 'decimal.js';
import { logger } from '../middlewares/errorHandler.js';
import CurrencyService from './currencyService.js';
import { recordTransaction } from './walletService.js';
import { recomputeManagerCommissionForEntity } from './managerCommissionService.js';
import { computeDiscountAmount } from './discountService.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const round2 = (v) => Number(new Decimal(v || 0).toDecimalPlaces(2).toString());

export async function updateShopOrderItemPrice({
  client,
  orderId,
  itemId,
  newUnitPrice,
  reason,
  inputCurrency = null,
  settleWallet = true,
  actorId = null,
}) {
  if (!client) throw new Error('Database client is required');

  const trimmedReason = (reason || '').trim();
  if (trimmedReason.length > 500) throw httpError(400, 'reason exceeds 500 characters');
  if (!Number.isFinite(Number(newUnitPrice)) || Number(newUnitPrice) < 0) {
    throw httpError(400, 'new_unit_price must be a non-negative number');
  }

  // Lock the order then the item so a concurrent edit / refund can't race.
  const orderRes = await client.query(
    `SELECT id, user_id, order_number, currency, subtotal, discount_amount, total_amount, status, payment_status, admin_notes
       FROM shop_orders
      WHERE id = $1
      FOR UPDATE`,
    [orderId]
  );
  if (!orderRes.rows.length) throw httpError(404, 'Shop order not found');
  const order = orderRes.rows[0];
  const orderCurrency = (order.currency || 'EUR').toUpperCase();

  const itemRes = await client.query(
    `SELECT id, order_id, product_name, quantity, unit_price, total_price, original_unit_price, currency
       FROM shop_order_items
      WHERE id = $1 AND order_id = $2
      FOR UPDATE`,
    [itemId, orderId]
  );
  if (!itemRes.rows.length) throw httpError(404, 'Order item not found on this order');
  const item = itemRes.rows[0];

  // Convert the entered amount into the order's currency when the operator
  // typed it in a different one. The frontend preview uses ceil-rounding for
  // display only; this Decimal conversion is what we persist.
  const enteredCurrency = (inputCurrency || orderCurrency).toUpperCase();
  let unitInOrderCurrency = Number(newUnitPrice);
  let conversion = null;
  if (enteredCurrency !== orderCurrency) {
    try {
      unitInOrderCurrency = await CurrencyService.convertCurrency(
        Number(newUnitPrice),
        enteredCurrency,
        orderCurrency
      );
    } catch {
      throw httpError(400, `Cannot convert from ${enteredCurrency} to ${orderCurrency} — unknown currency`);
    }
    conversion = {
      from: enteredCurrency,
      to: orderCurrency,
      enteredAmount: round2(newUnitPrice),
      convertedAmount: round2(unitInOrderCurrency),
    };
  }

  const qty = Number(item.quantity) || 1;
  const oldUnitPrice = Number(item.unit_price) || 0;
  const newUnitRounded = round2(unitInOrderCurrency);
  const newItemTotal = round2(new Decimal(newUnitRounded).mul(qty));
  // Guard against DECIMAL(10,2) overflow (column max 99,999,999.99). Without
  // this, an extreme value aborts the UPDATE with an unhandled Postgres error
  // (500) instead of a clean 400.
  const DECIMAL_MAX = 99999999.99;
  if (newUnitRounded > DECIMAL_MAX) throw httpError(400, 'Unit price exceeds the maximum allowed (99,999,999.99)');
  if (newItemTotal > DECIMAL_MAX) throw httpError(400, 'Line total exceeds the maximum allowed (99,999,999.99)');
  const delta = round2(new Decimal(newItemTotal).sub(Number(item.total_price) || 0));

  // Preserve the first agreed unit price on the first edit only.
  const newOriginalUnitPrice =
    item.original_unit_price !== null && item.original_unit_price !== undefined
      ? item.original_unit_price
      : oldUnitPrice;

  await client.query(
    `UPDATE shop_order_items
        SET unit_price = $1,
            total_price = $2,
            original_unit_price = $3,
            currency = $4
      WHERE id = $5`,
    [newUnitRounded, newItemTotal, newOriginalUnitPrice, orderCurrency, itemId]
  );

  // Re-derive the order's denormalised totals from the line items.
  const sumRes = await client.query(
    `SELECT COALESCE(SUM(total_price), 0) AS subtotal FROM shop_order_items WHERE order_id = $1`,
    [orderId]
  );
  const newSubtotal = round2(sumRes.rows[0].subtotal);
  if (newSubtotal > DECIMAL_MAX) throw httpError(400, 'Order subtotal exceeds the maximum allowed (99,999,999.99)');
  const voucherDiscount = Number(order.discount_amount) || 0;
  const newTotalAmount = Math.max(0, round2(new Decimal(newSubtotal).sub(voucherDiscount)));

  const auditNote =
    `[${new Date().toISOString()}] "${item.product_name}" unit ${oldUnitPrice.toFixed(2)} -> ${newUnitRounded.toFixed(2)} ${orderCurrency}` +
    `${conversion ? ` (entered ${conversion.enteredAmount} ${conversion.from})` : ''}` +
    ` by ${actorId || 'staff'}${trimmedReason ? `: ${trimmedReason}` : ''}`;

  await client.query(
    `UPDATE shop_orders
        SET subtotal = $1,
            total_amount = $2,
            admin_notes = CASE
              WHEN admin_notes IS NULL OR admin_notes = '' THEN $3
              WHEN length(admin_notes) > 20000 THEN admin_notes
              ELSE admin_notes || E'\n' || $3
            END,
            updated_at = NOW()
      WHERE id = $4`,
    [newSubtotal, newTotalAmount, auditNote, orderId]
  );

  // Rebase any percent discount layered on this order so reports subtract the
  // correct amount against the new total. We only re-derive the discount's
  // recorded amount here; the discount's own wallet credit (posted at apply
  // time) is left untouched — the price-delta settlement above is separate.
  let discountRebased = null;
  const discRes = await client.query(
    `SELECT id, percent, amount
       FROM discounts
      WHERE entity_type = 'shop_order' AND entity_id = $1 AND participant_user_id IS NULL
      FOR UPDATE`,
    [String(orderId)]
  );
  if (discRes.rows.length) {
    const disc = discRes.rows[0];
    const pct = Number(disc.percent) || 0;
    if (pct > 0) {
      const newDiscountAmount = computeDiscountAmount(newTotalAmount, pct);
      if (Math.abs(newDiscountAmount - (Number(disc.amount) || 0)) >= 0.005) {
        await client.query(`UPDATE discounts SET amount = $1, updated_at = NOW() WHERE id = $2`, [
          newDiscountAmount,
          disc.id,
        ]);
        discountRebased = {
          id: disc.id,
          percent: pct,
          oldAmount: Number(disc.amount) || 0,
          newAmount: newDiscountAmount,
        };
      }
    }
  }

  // Settle the delta on the customer's wallet so the price change is registered
  // in their financial history (a product sold at 0 gets real history the moment
  // its price is set). We post a NEW transaction — never a reversal — so the
  // balance re-derives correctly from SUM(available_delta WHERE completed).
  // Shape it exactly like a real shop payment (charge) or refund (credit) so
  // every downstream consumer (finance shop revenue, payment history, bill)
  // treats it identically. allowNegative: an admin charge may push the wallet
  // negative (the customer then owes it).
  let walletAdjustment = null;
  if (settleWallet && Math.abs(delta) >= 0.005) {
    const isCharge = delta > 0; // price went up -> charge the customer
    const absDelta = round2(Math.abs(delta));
    await recordTransaction({
      client,
      userId: order.user_id,
      amount: isCharge ? -absDelta : absDelta,
      availableDelta: isCharge ? -absDelta : absDelta,
      currency: orderCurrency,
      transactionType: isCharge ? 'payment' : 'refund',
      direction: isCharge ? 'debit' : 'credit',
      allowNegative: true,
      description: isCharge
        ? `Price update — Order #${order.order_number}: ${item.product_name} ${oldUnitPrice.toFixed(2)} -> ${newUnitRounded.toFixed(2)} ${orderCurrency}`
        : `Price update refund — Order #${order.order_number}: ${item.product_name} ${oldUnitPrice.toFixed(2)} -> ${newUnitRounded.toFixed(2)} ${orderCurrency}`,
      // 'shop_order' charges count as shop revenue; '_refund' credits are excluded
      // (same convention the checkout / refund paths use).
      relatedEntityType: isCharge ? 'shop_order' : 'shop_order_refund',
      metadata: {
        orderId,
        orderNumber: order.order_number,
        itemId,
        productName: item.product_name,
        oldUnitPrice,
        newUnitPrice: newUnitRounded,
        delta,
        reason: trimmedReason || null,
        actorId,
        kind: 'item_price_adjustment',
      },
      idempotencyKey: `shop-item-price-adj:${orderId}:${itemId}:${Date.now()}`,
      createdBy: actorId,
    });
    walletAdjustment = { posted: true, direction: isCharge ? 'debit' : 'credit', amount: absDelta, currency: orderCurrency };
  }

  // Recompute the pending manager commission from the new (post-discount) total.
  // UPDATE-only — never moves the wallet. No-ops if there is no commission row
  // for this order or it has already been paid out.
  const commission = await recomputeManagerCommissionForEntity(client, 'shop_order', orderId);

  logger.info('Shop order item price edited', {
    orderId,
    itemId,
    productName: item.product_name,
    oldUnitPrice,
    newUnitPrice: newUnitRounded,
    orderCurrency,
    enteredCurrency,
    newSubtotal,
    newTotalAmount,
    delta,
    discountRebased: discountRebased ? discountRebased.newAmount : null,
    walletAdjustment,
    commission,
    actorId,
  });

  return {
    orderId,
    itemId,
    oldUnitPrice,
    newUnitPrice: newUnitRounded,
    currency: orderCurrency,
    conversion,
    itemTotal: newItemTotal,
    delta,
    subtotal: newSubtotal,
    totalAmount: newTotalAmount,
    discount: discountRebased,
    walletAdjustment,
    commission,
  };
}
