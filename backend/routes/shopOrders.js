// backend/routes/shopOrders.js
// API routes for shop order management

import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import socketService from '../services/socketService.js';
import { getBalance, getAllBalances, recordTransaction, getEntityNetCharges } from '../services/walletService.js';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';
import voucherService from '../services/voucherService.js';
import { dispatchNotification, dispatchToStaff } from '../services/notificationDispatcherUnified.js';
import CurrencyService from '../services/currencyService.js';
import { addTag } from '../services/userTagService.js';
import { cacheMiddleware, cacheInvalidationMiddleware } from '../middlewares/cache.js';
import { discountSumLateral } from '../utils/discountAmounts.js';
import { isStaffNegativeBalanceRole } from '../constants/roles.js';
import { updateShopOrderItemPrice } from '../services/shopOrderPriceService.js';
import { applyDiscount, computeDiscountAmount, reverseOpenDiscountCreditsForEntity } from '../services/discountService.js';

const router = express.Router();

// Adjust per-variant stock inside products.variants JSONB for one order line.
//
// A variant is identified by size label AND colour, so a colour×size matrix
// (e.g. "XS Blue" vs "XS Red", same size label) decrements/restores only the
// exact combination sold. Fallbacks keep legacy single-colour and scraped
// products working: if the order line recorded no colour, or the variant
// carries no colour field, we fall back to matching on size label alone.
//
//   restore=false → sale: floor at 0 (GREATEST). restore=true → cancel/refund.
//
// No-ops when no size was recorded or the product has no variants array.
async function adjustVariantStock(client, { productId, size, color, qty, restore }) {
  if (!size) return;
  const quantityExpr = restore
    ? `(elem->>'quantity')::int + $1`
    : `GREATEST(0, (elem->>'quantity')::int - $1)`;
  await client.query(
    `
    UPDATE products
    SET variants = (
      SELECT jsonb_agg(
        CASE
          WHEN elem->>'label' = $2
               AND ($4::text IS NULL OR elem->>'color' IS NULL OR elem->>'color' = $4)
          THEN jsonb_set(elem, '{quantity}', to_jsonb(${quantityExpr}))
          ELSE elem
        END
      )
      FROM jsonb_array_elements(variants) AS elem
    ),
    updated_at = NOW()
    WHERE id = $3 AND variants IS NOT NULL
    `,
    [qty, size, productId, color ?? null]
  );
}

// Resolve the unit price for a chosen (size, colour) combination from a
// product's variants JSONB, falling back to the base product price. Matches a
// variant by size label AND colour, with the same legacy fallbacks as
// adjustVariantStock (no colour recorded, or a colour-less variant).
function resolveVariantUnitPrice(product, selectedSize, selectedColor) {
  const base = parseFloat(product.price) || 0;
  if (!selectedSize || !product.variants) return base;
  let variants = product.variants;
  if (typeof variants === 'string') {
    try { variants = JSON.parse(variants); } catch { return base; }
  }
  if (!Array.isArray(variants)) return base;
  const match = variants.find((v) =>
    (v.label === selectedSize || v.size === selectedSize) &&
    (!selectedColor || !v.color || v.color === selectedColor)
  );
  const price = match?.price ?? match?.price_final;
  return price != null ? parseFloat(price) : base;
}

// Helper to notify admins and managers about a new shop order
async function notifyAdminsNewOrder(order, items, buyerName) {
  try {
    const itemSummary = items.length <= 3
      ? items.map(i => `${i.product_name} x${i.quantity}`).join(', ')
      : `${items.slice(0, 2).map(i => `${i.product_name} x${i.quantity}`).join(', ')} +${items.length - 2} more`;

    await dispatchToStaff({
      type: 'shop_order',
      title: 'New Shop Order',
      message: `${buyerName} placed order #${order.order_number} (${itemSummary}) - Total: €${parseFloat(order.total_amount).toFixed(2)}`,
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        totalAmount: order.total_amount,
        itemCount: items.length,
        link: `/services/shop?orderId=${order.id}`
      },
      idempotencyPrefix: `shop-order:${order.id}`,
      roles: ['admin', 'manager']
    });
  } catch (err) {
    logger.warn('Failed to notify admins about new shop order:', err.message);
  }
}

// Helper to emit socket events safely
const emitSocketEvent = (event, data) => {
  try {
    socketService.emitToChannel('general', event, data);
  } catch (err) {
    logger.warn(`Failed to emit socket event ${event}:`, err.message);
  }
};

// Helper to get order with items
async function getOrderWithItems(orderId, client = pool) {
  const orderResult = await client.query(`
    SELECT
      o.*,
      u.first_name,
      u.last_name,
      u.email,
      u.phone,
      COALESCE(d.amt, 0) AS total_discount_amount,
      GREATEST(COALESCE(o.total_amount, 0) - COALESCE(d.amt, 0), 0) AS total_after_discount
    FROM shop_orders o
    LEFT JOIN users u ON o.user_id = u.id
    ${discountSumLateral('d', 'shop_order', 'o.id')}
    WHERE o.id = $1
  `, [orderId]);

  if (orderResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await client.query(`
    SELECT * FROM shop_order_items WHERE order_id = $1 ORDER BY id
  `, [orderId]);

  return {
    ...orderResult.rows[0],
    items: itemsResult.rows
  };
}

// Create a new order (customer checkout)
router.post('/', authenticateJWT, cacheInvalidationMiddleware(['api:shop:orders:*', 'api:shop:stats:*']), async (req, res) => {
  const client = await pool.connect();

  try {
    let userId = req.user.id;
    const {
      items,
      payment_method,
      notes,
      shipping_address,
      use_wallet = true,
      voucher_code,
      user_id: overrideUserId,
      created_at: overrideCreatedAt,
      allowNegativeBalance,
      deposit_percent,
      deposit_amount,
      bank_account_id,
      receipt_url,
      discount_percent, // Optional staff % discount (FAB "New Sale"), applied atomically below
      discount_reason
    } = req.body;

    // Front-desk staff (admin/manager/owner/super_admin + front_desk/receptionist)
    // may create an order on behalf of a customer AND let that customer's wallet go
    // negative — same rule as bookings/rentals/accommodation. Backdating stays
    // admin-level only (see canBackdate below), so receptionists can sell but not
    // rewrite order history.
    const isStaffSeller = isStaffNegativeBalanceRole(req.user.role);
    const canBackdate = ['admin', 'manager', 'super_admin', 'owner'].includes(req.user.role);
    if (overrideUserId && isStaffSeller) {
      userId = overrideUserId;
    }

    // Check the buyer's role — trusted_customer is always allowed to go negative
    const { rows: buyerRoleRows } = await client.query(
      `SELECT r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [userId]
    );
    const buyerRole = buyerRoleRows[0]?.role_name || null;
    const buyerIsTrusted = buyerRole === 'trusted_customer';

    // allowNegativeBalance: staff seller override OR buyer is trusted_customer
    const canGoNegative = (allowNegativeBalance === true && isStaffSeller) || buyerIsTrusted;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    if (!payment_method || !['wallet', 'credit_card', 'cash', 'wallet_hybrid', 'bank_transfer'].includes(payment_method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    if (payment_method === 'bank_transfer' && !receipt_url) {
      return res.status(400).json({ error: 'A proof of payment (receipt) is required for bank transfer orders' });
    }

    await client.query('BEGIN');

    // Calculate order totals and validate stock
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      // Get product with current price and stock
      const productResult = await client.query(`
        SELECT id, name, price, stock_quantity, image_url, brand, status, variants
        FROM products
        WHERE id = $1 AND status = 'active'
      `, [item.product_id]);

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Product ${item.product_name || item.product_id} is no longer available` 
        });
      }

      const product = productResult.rows[0];

      // Check stock
      if (product.stock_quantity < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}` 
        });
      }

      // Charge the price of the SELECTED variant (size/colour), not the base
      // product price. The base price is derived from the lowest variant price
      // in ProductForm, so without this every size was billed the cheapest
      // variant's price. Mirrors the quick-sale path; resolveVariantUnitPrice
      // falls back to the base price when the variant has no price set.
      const unitPrice = resolveVariantUnitPrice(product, item.selected_size, item.selected_color);

      // Never sell a line at EUR0. When a product (or the chosen variant) has no
      // price set, resolveVariantUnitPrice falls back to base price 0 — that
      // used to silently create a 0-priced order line that under-charged the
      // customer and corrupted their financial history (see the Ocean
      // Sunglasses incident). Reject the sale so staff must price the product
      // first instead of shipping a phantom-free item.
      if (!(Number(unitPrice) > 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `${product.name}${item.selected_size ? ` (${item.selected_size})` : ''} has no price set. Set a product/variant price before selling it.`,
          code: 'ZERO_PRICE_ITEM',
        });
      }

      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url,
        brand: product.brand,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: itemTotal,
        selected_size: item.selected_size || null,
        selected_color: item.selected_color || null,
        selected_variant: item.selected_variant ? JSON.stringify(item.selected_variant) : null
      });
    }

    const itemSummary = validatedItems.length <= 3
      ? validatedItems.map(i => `${i.product_name} x${i.quantity}`).join(', ')
      : `${validatedItems.slice(0, 2).map(i => `${i.product_name} x${i.quantity}`).join(', ')} +${validatedItems.length - 2} more`;

    const totalAmount = subtotal; // Can add tax/shipping logic here

    // Voucher/promo code handling
    let voucherDiscount = 0;
    let appliedVoucher = null;
    let discountInfo = null;

    if (voucher_code && subtotal > 0) {
      try {
        const voucherValidation = await voucherService.validateVoucher({
          code: voucher_code,
          userId,
          userRole: req.user.role,
          context: 'shop',
          amount: subtotal,
          currency: 'EUR'
        });

        if (!voucherValidation.valid) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: voucherValidation.message || 'Invalid voucher code',
            code: 'VOUCHER_INVALID'
          });
        }

        appliedVoucher = voucherValidation.voucher;
        discountInfo = voucherValidation.discount;

        // Handle wallet_credit type vouchers — don't apply as price discount
        if (appliedVoucher.type === 'wallet_credit') {
          // Will be applied after order creation
          voucherDiscount = 0;
        } else if (discountInfo) {
          voucherDiscount = discountInfo.discountAmount || 0;
          // Don't let discount exceed the subtotal
          voucherDiscount = Math.min(voucherDiscount, subtotal);
        }

        logger.info(`Voucher ${voucher_code} applied to shop order: -${voucherDiscount} EUR`);
      } catch (err) {
        logger.error('Voucher validation error:', err);
        // Non-blocking: proceed without voucher
        appliedVoucher = null;
        voucherDiscount = 0;
      }
    }

    const finalAmount = subtotal - voucherDiscount;

    // Staff percentage discount (separate `discounts` table + reversible wallet
    // credit), mirroring POST /admin/quick-sale. Unlike the voucher discount
    // (which is baked into total_amount), this keeps the order at gross and is
    // applied atomically AFTER payment below. We factor it into the wallet check
    // so the customer only needs to cover the NET (post-discount) amount — the
    // FAB "New Sale" drawer previously applied it as a second request AFTER order
    // creation, so the balance guard here rejected affordable discounted sales.
    // Only staff sellers may apply a discount — this is the public customer
    // checkout endpoint too, so a customer must never be able to discount their
    // own order by sending discount_percent.
    const staffDiscPct = isStaffSeller ? Math.max(0, Math.min(100, Number(discount_percent) || 0)) : 0;
    const staffDiscountAmount = staffDiscPct > 0 ? computeDiscountAmount(finalAmount, staffDiscPct) : 0;
    const netPayable = Math.round((finalAmount - staffDiscountAmount) * 100) / 100;
    // The gross debit is followed immediately by the discount credit in the same
    // transaction, so it may dip up to the discount amount below the available
    // balance without ever committing a negative — treat that as allowed.
    const effectiveAllowNegative = canGoNegative || staffDiscountAmount > 0;

    // Check wallet balance if paying by wallet
    // Aggregate all wallet currency balances into EUR equivalent
    let hybridWalletDeducted = 0;
    let walletDeductionPlan = []; // Array of { currency, amount } to deduct from each wallet

    // Get user's preferred currency for Iyzico gateway
    const userCurrResult = await client.query('SELECT preferred_currency FROM users WHERE id = $1', [userId]);
    const userPreferredCurrency = userCurrResult.rows[0]?.preferred_currency || 'EUR';

    // Helper: calculate total EUR-equivalent wallet balance and build deduction plan
    async function calculateWalletDeduction(maxDeductEUR) {
      const allBalances = await getAllBalances(userId);
      let remaining = maxDeductEUR;
      const plan = [];

      // Deduct from EUR wallet first, then other currencies
      const sorted = allBalances.sort((a, b) => (a.currency === 'EUR' ? -1 : b.currency === 'EUR' ? 1 : 0));

      for (const bal of sorted) {
        if (remaining <= 0) break;
        if (bal.available <= 0) continue;

        const availableInEUR = bal.currency === 'EUR'
          ? bal.available
          : await CurrencyService.convertCurrency(bal.available, bal.currency, 'EUR');

        const deductEUR = Math.min(availableInEUR, remaining);
        const deductNative = bal.currency === 'EUR'
          ? deductEUR
          : await CurrencyService.convertCurrency(deductEUR, 'EUR', bal.currency);

        // Don't deduct more than available in native currency
        const actualDeductNative = Math.min(deductNative, bal.available);
        const actualDeductEUR = bal.currency === 'EUR'
          ? actualDeductNative
          : await CurrencyService.convertCurrency(actualDeductNative, bal.currency, 'EUR');

        if (actualDeductNative > 0) {
          plan.push({ currency: bal.currency, amount: Math.round(actualDeductNative * 100) / 100 });
          remaining -= actualDeductEUR;
        }
      }

      return { totalDeductedEUR: Math.round((maxDeductEUR - Math.max(0, remaining)) * 100) / 100, plan };
    }

    if (payment_method === 'wallet' && use_wallet) {
      const { totalDeductedEUR, plan } = await calculateWalletDeduction(finalAmount);

      // Guard against the NET (post-discount) amount — that's the customer's real cost.
      if (totalDeductedEUR < netPayable - 0.01 && !canGoNegative) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient wallet balance. Required: €${netPayable.toFixed(2)}, Available: €${totalDeductedEUR.toFixed(2)}`
        });
      }

      if (effectiveAllowNegative && totalDeductedEUR < finalAmount - 0.01) {
        // Charge the full gross now; for a staff-discount sale the shortfall
        // (<= the discount) is credited straight back below. For a negative-balance
        // override with no discount, the wallet genuinely goes negative.
        const shortfall = Math.round((finalAmount - totalDeductedEUR) * 100) / 100;
        // Add remaining as EUR deduction (will create negative balance)
        const existingEUR = plan.find(p => p.currency === 'EUR');
        if (existingEUR) {
          existingEUR.amount = Math.round((existingEUR.amount + shortfall) * 100) / 100;
        } else {
          plan.push({ currency: 'EUR', amount: shortfall });
        }
        hybridWalletDeducted = finalAmount;
        walletDeductionPlan = plan;
      } else {
        hybridWalletDeducted = totalDeductedEUR;
        walletDeductionPlan = plan;
      }
    } else if (payment_method === 'wallet_hybrid' || payment_method === 'credit_card') {
      // Hybrid / credit_card: deduct what we can from wallet, charge the rest via card
      const { totalDeductedEUR, plan } = await calculateWalletDeduction(finalAmount);
      hybridWalletDeducted = totalDeductedEUR;
      walletDeductionPlan = plan;
    }

    // Build wallet deduction data to store on order (deducted ONLY after Iyzico callback confirms)
    const walletDeductionData = (hybridWalletDeducted > 0 && walletDeductionPlan.length > 0)
      ? { totalDeductedEUR: hybridWalletDeducted, plan: walletDeductionPlan }
      : null;

    // Allow admin/manager to backdate orders (not receptionists)
    const orderCreatedAt = (canBackdate && overrideCreatedAt) ? new Date(overrideCreatedAt) : new Date();

    // Deposit fields
    const depositPct = parseInt(deposit_percent, 10) || 0;
    const depositAmt = depositPct > 0
      ? parseFloat(deposit_amount) || parseFloat((finalAmount * depositPct / 100).toFixed(2))
      : 0;

    // Create the order
    const orderResult = await client.query(`
      INSERT INTO shop_orders (
        user_id, status, payment_method, payment_status,
        subtotal, discount_amount, total_amount, notes, shipping_address,
        voucher_id, voucher_code, wallet_deduction_data, created_at,
        deposit_percent, deposit_amount
      )
      VALUES ($1, 'pending', $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [userId, payment_method, subtotal, voucherDiscount, finalAmount, notes || null, shipping_address || null,
        appliedVoucher?.id || null, appliedVoucher?.code || null, walletDeductionData ? JSON.stringify(walletDeductionData) : null, orderCreatedAt,
        depositPct, depositAmt]);

    const order = orderResult.rows[0];

    // Insert order items
    for (const item of validatedItems) {
      await client.query(`
        INSERT INTO shop_order_items (
          order_id, product_id, product_name, product_image, brand,
          quantity, unit_price, total_price, selected_size, selected_color, selected_variant
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        order.id,
        item.product_id,
        item.product_name,
        item.product_image,
        item.brand,
        item.quantity,
        item.unit_price,
        item.total_price,
        item.selected_size,
        item.selected_color,
        item.selected_variant
      ]);

      // Decrease top-level stock
      await client.query(`
        UPDATE products 
        SET stock_quantity = stock_quantity - $1, updated_at = NOW()
        WHERE id = $2
      `, [item.quantity, item.product_id]);

      // Decrease variant-level stock for the exact colour×size combination sold.
      await adjustVariantStock(client, {
        productId: item.product_id,
        size: item.selected_size,
        color: item.selected_color,
        qty: item.quantity,
        restore: false,
      });
    }

    // Process credit_card payment via Iyzico (wallet deduction deferred to callback)
    if (payment_method === 'credit_card') {
      // For deposit orders, charge only the deposit amount; otherwise charge the full amount
      const baseChargeEUR = depositPct > 0 ? depositAmt : finalAmount;
      const cardChargeAmountEUR = Math.max(0, baseChargeEUR - hybridWalletDeducted);

      if (cardChargeAmountEUR > 0) {
       try {
           // Convert card charge amount to user's preferred currency for Iyzico
           // Iyzico rejects amounts >= 100,000 in any currency
           const IYZICO_MAX = 99999.99;
           let cardChargeConverted = cardChargeAmountEUR;
           let chargeCurrency = userPreferredCurrency;
           if (userPreferredCurrency !== 'EUR') {
             const converted = await CurrencyService.convertCurrency(cardChargeAmountEUR, 'EUR', userPreferredCurrency);
             if (converted >= IYZICO_MAX) {
               await client.query('ROLLBACK');
               const maxCardEUR = await CurrencyService.convertCurrency(IYZICO_MAX, userPreferredCurrency, 'EUR');
               const minWalletEUR = (finalAmount - maxCardEUR).toFixed(2);
               const minWalletLocal = await CurrencyService.convertCurrency(parseFloat(minWalletEUR), 'EUR', userPreferredCurrency);
               return res.status(400).json({
                 error: `Card amount (${converted.toFixed(2)} ${userPreferredCurrency}) exceeds the payment gateway limit of ${IYZICO_MAX.toLocaleString()} ${userPreferredCurrency}. Please add at least €${minWalletEUR} (${minWalletLocal.toFixed(2)} ${userPreferredCurrency}) to your wallet first to reduce the card portion.`
               });
             } else {
               cardChargeConverted = converted;
             }
           }

           // Map items for Iyzico
           // Iyzico requires sum of basket items price to equal total price exactly.
           let iyzicoItems = validatedItems.map(i => ({
               id: String(i.product_id),
               name: i.product_name,
               category1: 'Shop',
               category2: 'Retail',
               itemType: 'PHYSICAL',
               price: parseFloat(i.total_price).toFixed(2)
           }));

           // Adjust basket item prices to match the card charge amount
           // (accounts for voucher discount + wallet deduction)
           const originalItemsTotal = validatedItems.reduce((sum, i) => sum + parseFloat(i.total_price), 0);
           if (originalItemsTotal > 0) {
             const ratio = cardChargeConverted / originalItemsTotal;
             let runningTotal = 0;
             iyzicoItems = iyzicoItems.map((item, index) => {
               if (index === iyzicoItems.length - 1) {
                 const lastPrice = Math.round((cardChargeConverted - runningTotal) * 100) / 100;
                 return { ...item, price: Math.max(0.01, lastPrice).toFixed(2) };
               }
               const adjustedPrice = Math.round(parseFloat(item.price) * ratio * 100) / 100;
               runningTotal += adjustedPrice;
               return { ...item, price: Math.max(0.01, adjustedPrice).toFixed(2) };
             });
           }

           const gatewayResult = await initiateDeposit({
               amount: cardChargeConverted,
               currency: chargeCurrency,
               userId: userId,
               referenceCode: order.order_number,
               items: iyzicoItems
           });

           // Store the Iyzico token on the order for reliable callback matching
           await client.query('UPDATE shop_orders SET gateway_token = $1 WHERE id = $2', [gatewayResult.gatewayTransactionId, order.id]);
           await client.query('COMMIT'); 
           
           const completeOrder = await getOrderWithItems(order.id);
           
           return res.status(201).json({
              success: true,
              paymentPageUrl: gatewayResult.paymentPageUrl,
              order: completeOrder,
              ...(hybridWalletDeducted > 0 && {
                hybridPayment: {
                  walletCharged: hybridWalletDeducted,
                  cardCharge: cardChargeAmountEUR,
                  totalAmount: finalAmount
                }
              })
           });
       } catch (err) {
           await client.query('ROLLBACK');
           logger.error('Iyzico Payment Init Failed', err);
           return res.status(500).json({ error: 'Failed to initiate payment gateway' });
       }
      } else {
        // Wallet covered everything — no card charge needed, deduct wallet immediately
        for (const wd of walletDeductionPlan) {
          await recordTransaction({
            client,
            userId,
            amount: -wd.amount,
            currency: wd.currency,
            transactionType: 'payment',
            direction: 'debit',
            availableDelta: -wd.amount,
            description: `${itemSummary} - Order #${order.order_number}`,
            relatedEntityType: 'shop_order',
            metadata: { orderId: order.id, orderNumber: order.order_number, deductedCurrency: wd.currency, deductedAmount: wd.amount }
          });
        }
        await client.query(`
          UPDATE shop_orders SET payment_status = 'completed', status = 'confirmed', confirmed_at = NOW(), wallet_deduction_data = NULL WHERE id = $1
        `, [order.id]);
        await client.query(`
          INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
          VALUES ($1, 'pending', 'confirmed', $2, 'Payment completed via wallet (auto-deducted on card checkout)')
        `, [order.id, userId]);
      }
    }

    // Process wallet payment
    if (payment_method === 'wallet' && use_wallet) {
      // Deduct from each currency wallet according to deduction plan
      for (const wd of walletDeductionPlan) {
        await recordTransaction({
          client,
          userId,
          amount: -wd.amount,
          currency: wd.currency,
          transactionType: 'payment',
          direction: 'debit',
          availableDelta: -wd.amount,
          allowNegative: effectiveAllowNegative,
          description: `${itemSummary} - Order #${order.order_number}${voucherDiscount > 0 ? ` (voucher: €${voucherDiscount.toFixed(2)})` : ''}${staffDiscountAmount > 0 ? ` (discount: €${staffDiscountAmount.toFixed(2)})` : ''}`,
          relatedEntityType: 'shop_order',
          metadata: { orderId: order.id, orderNumber: order.order_number, deductedCurrency: wd.currency, deductedAmount: wd.amount }
        });
      }

      // Update order payment status
      await client.query(`
        UPDATE shop_orders 
        SET payment_status = 'completed', status = 'confirmed', confirmed_at = $2
        WHERE id = $1
      `, [order.id, orderCreatedAt]);

      // Log status change
      await client.query(`
        INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, 'pending', 'confirmed', $2, 'Payment completed via wallet')
      `, [order.id, userId]);
    }

    // Process cash payment — auto-confirm order (payment collected on pickup/delivery)
    if (payment_method === 'cash') {
      await client.query(`
        UPDATE shop_orders 
        SET status = 'confirmed', payment_status = 'pending', confirmed_at = $2
        WHERE id = $1
      `, [order.id, orderCreatedAt]);

      await client.query(`
        INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, 'pending', 'confirmed', $2, 'Order confirmed — cash payment on pickup/delivery')
      `, [order.id, userId]);
    }

    // Process hybrid wallet+card payment (wallet deduction deferred to callback)
    if (payment_method === 'wallet_hybrid') {
      const cardChargeAmount = Math.max(0, finalAmount - hybridWalletDeducted);

      if (cardChargeAmount > 0) {
        // Initiate Iyzico for the remaining card portion
        try {
          // Convert to user's preferred currency for Iyzico
          // Iyzico rejects amounts >= 100,000 in any currency
          const IYZICO_MAX_HYBRID = 99999.99;
          let cardChargeConverted = cardChargeAmount;
          let chargeCurrency = userPreferredCurrency;
          if (userPreferredCurrency !== 'EUR') {
            const converted = await CurrencyService.convertCurrency(cardChargeAmount, 'EUR', userPreferredCurrency);
            if (converted >= IYZICO_MAX_HYBRID) {
              await client.query('ROLLBACK');
              const maxCardEUR = await CurrencyService.convertCurrency(IYZICO_MAX_HYBRID, userPreferredCurrency, 'EUR');
              const minWalletEUR = (finalAmount - maxCardEUR).toFixed(2);
              const minWalletLocal = await CurrencyService.convertCurrency(parseFloat(minWalletEUR), 'EUR', userPreferredCurrency);
              return res.status(400).json({
                error: `Card amount (${converted.toFixed(2)} ${userPreferredCurrency}) exceeds the payment gateway limit of ${IYZICO_MAX_HYBRID.toLocaleString()} ${userPreferredCurrency}. Please add at least €${minWalletEUR} (${minWalletLocal.toFixed(2)} ${userPreferredCurrency}) to your wallet first to reduce the card portion.`
              });
            } else {
              cardChargeConverted = converted;
            }
          }

          const iyzicoItems = [{
            id: String(order.id),
            name: `Shop Order #${order.order_number} (card portion)`,
            category1: 'Shop',
            category2: 'Retail',
            itemType: 'PHYSICAL',
            price: parseFloat(cardChargeConverted).toFixed(2)
          }];

          const gatewayResult = await initiateDeposit({
            amount: cardChargeConverted,
            currency: chargeCurrency,
            userId: userId,
            referenceCode: order.order_number,
            items: iyzicoItems
          });

          // Store the Iyzico token on the order for reliable callback matching
          await client.query('UPDATE shop_orders SET gateway_token = $1 WHERE id = $2', [gatewayResult.gatewayTransactionId, order.id]);
          await client.query('COMMIT');
          const completeOrder = await getOrderWithItems(order.id);

          return res.status(201).json({
            success: true,
            paymentPageUrl: gatewayResult.paymentPageUrl,
            order: completeOrder,
            hybridPayment: {
              walletCharged: hybridWalletDeducted,
              cardCharge: cardChargeAmount,
              totalAmount: finalAmount
            }
          });
        } catch (iyzicoErr) {
          await client.query('ROLLBACK');
          logger.error('Iyzico hybrid payment init failed', iyzicoErr);
          return res.status(500).json({ error: 'Failed to initiate card payment for remaining amount' });
        }
      } else {
        // Wallet covered everything (edge case) — deduct immediately, no Iyzico needed
        for (const wd of walletDeductionPlan) {
          await recordTransaction({
            client,
            userId,
            amount: -wd.amount,
            currency: wd.currency,
            transactionType: 'payment',
            direction: 'debit',
            availableDelta: -wd.amount,
            description: `${itemSummary} - Order #${order.order_number}`,
            relatedEntityType: 'shop_order',
            metadata: { orderId: order.id, orderNumber: order.order_number, deductedCurrency: wd.currency, deductedAmount: wd.amount }
          });
        }
        await client.query(`
          UPDATE shop_orders SET payment_status = 'completed', status = 'confirmed', confirmed_at = NOW(), wallet_deduction_data = NULL WHERE id = $1
        `, [order.id]);
        await client.query(`
          INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
          VALUES ($1, 'pending', 'confirmed', $2, 'Payment completed via wallet (hybrid)')
        `, [order.id, userId]);
      }
    }

    // Process bank_transfer payment — order held pending admin receipt approval
    if (payment_method === 'bank_transfer') {
      if (receipt_url) {
        const receiptAmount = depositPct > 0 ? depositAmt : finalAmount;
        const adminNotes = depositPct > 0
          ? `DEPOSIT ${depositPct}% — Paid: ${receiptAmount} EUR, Remaining: ${parseFloat((finalAmount - receiptAmount).toFixed(2))} EUR due on delivery.`
          : null;

        await client.query(`
          INSERT INTO bank_transfer_receipts (
            user_id, shop_order_id, bank_account_id, receipt_url, amount, currency, status, admin_notes
          ) VALUES ($1, $2, $3, $4, $5, 'EUR', 'pending', $6)
        `, [userId, order.id, bank_account_id || null, receipt_url, receiptAmount, adminNotes]);
      }

      await client.query(`
        UPDATE shop_orders SET payment_status = 'waiting_payment' WHERE id = $1
      `, [order.id]);

      await client.query(`
        INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, 'pending', 'pending', $2, $3)
      `, [order.id, userId, depositPct > 0
          ? `Bank transfer deposit (${depositPct}%) — awaiting admin approval`
          : 'Bank transfer — awaiting admin approval']);

      try {
        req.socketService?.emitToChannel('dashboard', 'pending-transfer:new', {
          type: 'shop_order', orderId: order.id
        });
      } catch (_) { /* non-critical */ }
    }

    // Apply the staff % discount INSIDE the same transaction (atomic). The order
    // row now exists; for a wallet sale it's already payment_status='completed',
    // so applyDiscount records the discounts-table row AND posts the matching
    // reversible wallet credit (net = gross − discount). For cash/bank_transfer
    // (still unpaid) it just records the row and staff collect the net later.
    // Replaces the FAB's fragile post-creation second request, so a failure can
    // no longer leave the order stuck at full price.
    if (staffDiscPct > 0) {
      await applyDiscount(client, {
        customerId: userId,
        entityType: 'shop_order',
        entityId: order.id,
        percent: staffDiscPct,
        reason: discount_reason || 'Discount applied at sale creation',
        createdBy: req.user.id,
      });
    }

    await client.query('COMMIT');

    // Get complete order with items
    const completeOrder = await getOrderWithItems(order.id);

    // Redeem the voucher after successful order creation
    if (appliedVoucher) {
      try {
        if (appliedVoucher.type === 'wallet_credit') {
          // Apply wallet credit
          await voucherService.applyWalletCredit(
            userId, discountInfo?.walletCredit || 0, appliedVoucher.id, 'EUR'
          );
        }
        await voucherService.redeemVoucher({
          voucherId: appliedVoucher.id,
          userId,
          referenceType: 'shop',
          referenceId: String(order.id),
          originalAmount: subtotal,
          discountAmount: voucherDiscount,
          currency: 'EUR'
        });
        logger.info(`Voucher ${appliedVoucher.code} redeemed for shop order ${order.order_number}`);
      } catch (err) {
        logger.error('Voucher redemption error (non-blocking):', err);
      }
    }

    // Tag user as shop_customer (idempotent — ON CONFLICT DO NOTHING)
    addTag(userId, 'shop_customer', 'Shop Customer', { firstOrderId: order.id });

    // Emit socket event to notify admins
    emitSocketEvent('shop:newOrder', {
      orderId: order.id,
      orderNumber: order.order_number,
      totalAmount: finalAmount,
      itemCount: validatedItems.length
    });

    // Send in-app notifications to admins/managers
    const buyerResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1', [userId]
    );
    const buyer = buyerResult.rows[0];
    const buyerName = buyer
      ? [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.email || 'A customer'
      : 'A customer';
    notifyAdminsNewOrder(completeOrder, validatedItems, buyerName);

    // Check for low stock and emit alerts
    for (const item of validatedItems) {
      const stockCheck = await pool.query(`
        SELECT id, name, stock_quantity, low_stock_threshold
        FROM products
        WHERE id = $1 AND stock_quantity <= COALESCE(low_stock_threshold, 5)
      `, [item.product_id]);

      if (stockCheck.rows.length > 0) {
        const product = stockCheck.rows[0];
        emitSocketEvent('shop:lowStock', {
          productId: product.id,
          productName: product.name,
          currentStock: product.stock_quantity,
          threshold: product.low_stock_threshold || 5
        });
      }
    }

    logger.info(`Shop order created: ${order.order_number} by user ${userId}`);

    // Fire-and-forget manager commission for paid shop orders
    if (completeOrder.payment_status === 'completed') {
      try {
        const { recordShopCommission } = await import('../services/managerCommissionService.js');
        recordShopCommission(completeOrder).catch(() => {});
      } catch {
        // ignore
      }
    }

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: completeOrder
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating shop order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

// Get current user's orders
router.get('/my-orders', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);
    const offset = (pageNumber - 1) * limitNumber;

    let whereClause = 'WHERE o.user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      const statuses = String(status)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (statuses.length === 1) {
        whereClause += ` AND o.status = $${paramIndex++}`;
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        whereClause += ` AND o.status = ANY($${paramIndex++}::text[])`;
        params.push(statuses);
      }
    }

    // Get orders with item count
    const ordersResult = await pool.query(`
      SELECT 
        o.*,
        (SELECT COUNT(*) FROM shop_order_items WHERE order_id = o.id) as item_count,
        (SELECT json_agg(json_build_object(
          'id', oi.id,
          'product_name', oi.product_name,
          'product_image', oi.product_image,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'selected_size', oi.selected_size,
          'selected_color', oi.selected_color
        )) FROM shop_order_items oi WHERE oi.order_id = o.id) as items
      FROM shop_orders o
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limitNumber, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM shop_orders o ${whereClause}
    `, params);

    res.json({
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: pageNumber,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limitNumber)
    });

  } catch (error) {
    logger.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /my-orders/unread-counts - Get unread message counts for user's orders
 */
router.get('/my-orders/unread-counts', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const isStaff = ['admin', 'manager', 'super_admin'].includes(userRole);

    let result;
    if (isStaff) {
      // Staff sees unread customer messages
      result = await pool.query(`
        SELECT m.order_id, COUNT(*) as unread_count
        FROM shop_order_messages m
        WHERE m.is_staff = false AND m.is_read = false
        GROUP BY m.order_id
      `);
    } else {
      // Customer sees unread staff messages on their orders
      result = await pool.query(`
        SELECT m.order_id, COUNT(*) as unread_count
        FROM shop_order_messages m
        JOIN shop_orders o ON o.id = m.order_id
        WHERE o.user_id = $1 AND m.is_staff = true AND m.is_read = false
        GROUP BY m.order_id
      `, [userId]);
    }

    const counts = {};
    result.rows.forEach(r => { counts[r.order_id] = parseInt(r.unread_count); });
    res.json({ unreadCounts: counts });
  } catch (error) {
    logger.error('Error fetching unread counts:', error);
    res.status(500).json({ error: 'Failed to fetch unread counts' });
  }
});

// Admin: Get specific user's orders (must be before /:id to avoid route conflict in Express 5)
router.get('/admin/user/:userId', authenticateJWT, authorizeRoles(['admin', 'manager', 'front_desk', 'receptionist'], 'finances:read'), async (req, res) => {
  try {
    const { userId } = req.params;
    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const offset = (pageNum - 1) * limitNum;

    const ordersResult = await pool.query(`
      SELECT
        o.*,
        COALESCE(d.amt, 0) AS total_discount_amount,
        GREATEST(COALESCE(o.total_amount, 0) - COALESCE(d.amt, 0), 0) AS total_after_discount,
        (SELECT COUNT(*) FROM shop_order_items WHERE order_id = o.id) as item_count,
        (SELECT json_agg(json_build_object(
          'id', oi.id,
          'product_name', oi.product_name,
          'product_image', oi.product_image,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'selected_size', oi.selected_size,
          'selected_color', oi.selected_color
        )) FROM shop_order_items oi WHERE oi.order_id = o.id) as items
      FROM shop_orders o
      ${discountSumLateral('d', 'shop_order', 'o.id')}
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limitNum, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM shop_orders WHERE user_id = $1
    `, [userId]);

    res.json({
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: pageNum,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum)
    });

  } catch (error) {
    logger.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch user orders' });
  }
});

// Get single order details
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await getOrderWithItems(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check authorization - user can only see their own orders unless admin/manager/frontdesk
    if (order.user_id !== userId && !['admin', 'manager', 'front_desk', 'receptionist', 'owner'].includes(userRole)) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }

    // Get status history
    const historyResult = await pool.query(`
      SELECT
        h.*,
        u.first_name,
        u.last_name
      FROM shop_order_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.order_id = $1
      ORDER BY h.created_at DESC
    `, [orderId]);

    // Get bank transfer receipt if applicable
    let receipt = null;
    if (order.payment_method === 'bank_transfer') {
      const receiptResult = await pool.query(`
        SELECT receipt_url, amount, currency, status, admin_notes, created_at
        FROM bank_transfer_receipts
        WHERE shop_order_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [orderId]);
      if (receiptResult.rows.length > 0) {
        receipt = receiptResult.rows[0];
      }
    }

    res.json({
      ...order,
      status_history: historyResult.rows,
      receipt
    });

  } catch (error) {
    logger.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Admin: Get all orders
router.get('/admin/all', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheMiddleware(120, (req) => `api:shop:orders:all:${req.query.page || 1}:${req.query.limit || 20}:${req.query.status || ''}:${req.query.payment_status || ''}:${req.query.search || ''}:${req.query.date_from || ''}:${req.query.date_to || ''}:${req.query.category || ''}:${req.query.subcategory || ''}`), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      payment_status,
      category,
      subcategory,
      search,
      date_from,
      date_to,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;
    let whereConditions = [];

    if (status && status !== 'all') {
      whereConditions.push(`o.status = $${paramIndex++}`);
      params.push(status);
    }

    if (payment_status && payment_status !== 'all') {
      whereConditions.push(`o.payment_status = $${paramIndex++}`);
      params.push(payment_status);
    }

    // Product-type filters: keep orders that contain at least one item whose
    // product matches the given category / subcategory. Subcategory matching
    // includes children (e.g. 'harnesses' also matches 'harnesses-kite').
    if (category && category !== 'all') {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM shop_order_items soi
        JOIN products p ON p.id = soi.product_id
        WHERE soi.order_id = o.id AND p.category = $${paramIndex++}
      )`);
      params.push(category);
    }

    if (subcategory && subcategory !== 'all') {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM shop_order_items soi
        JOIN products p ON p.id = soi.product_id
        WHERE soi.order_id = o.id
          AND (p.subcategory = $${paramIndex} OR p.subcategory LIKE $${paramIndex + 1})
      )`);
      params.push(subcategory, `${subcategory}-%`);
      paramIndex += 2;
    }

    if (search) {
      whereConditions.push(`(
        o.order_number ILIKE $${paramIndex} OR
        u.first_name ILIKE $${paramIndex} OR
        u.last_name ILIKE $${paramIndex} OR
        u.email ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (date_from) {
      whereConditions.push(`o.created_at >= $${paramIndex++}`);
      params.push(date_from);
    }

    if (date_to) {
      whereConditions.push(`o.created_at <= $${paramIndex++}`);
      params.push(date_to);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';

    // Validate sort column
    const validSortColumns = ['created_at', 'total_amount', 'status', 'order_number'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const ordersResult = await pool.query(`
      SELECT
        o.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        -- Staff line-item % discounts live in the separate discounts table and never
        -- mutate o.total_amount, so the headline revenue must subtract them at read time.
        COALESCE(d.amt, 0) AS total_discount_amount,
        GREATEST(COALESCE(o.total_amount, 0) - COALESCE(d.amt, 0), 0) AS total_after_discount,
        (SELECT COUNT(*) FROM shop_order_items WHERE order_id = o.id) as item_count,
        (SELECT json_agg(json_build_object(
          'id', oi.id,
          'product_name', oi.product_name,
          'product_image', oi.product_image,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'selected_size', oi.selected_size,
          'selected_color', oi.selected_color
        )) FROM shop_order_items oi WHERE oi.order_id = o.id) as items
      FROM shop_orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${discountSumLateral('d', 'shop_order', 'o.id')}
      ${whereClause}
      ORDER BY o.${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) 
      FROM shop_orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${whereClause}
    `, params);

    // Get summary stats. total_revenue is discount-net (subtracts the discounts-table
    // amount that o.total_amount keeps gross of) so it reconciles with total_after_discount.
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped_count,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
        COALESCE(SUM(GREATEST(COALESCE(o.total_amount, 0) - COALESCE(d.amt, 0), 0)) FILTER (WHERE o.payment_status = 'completed'), 0) as total_revenue
      FROM shop_orders o
      ${discountSumLateral('d', 'shop_order', 'o.id')}
    `);

    res.json({
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      stats: statsResult.rows[0]
    });

  } catch (error) {
    logger.error('Error fetching all orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Admin: Update order status
router.patch('/:id/status', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheInvalidationMiddleware(['api:shop:orders:*', 'api:shop:stats:*']), async (req, res) => {
  const client = await pool.connect();

  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const { status, admin_notes } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await client.query('BEGIN');

    // Get current order
    const currentOrder = await client.query(`
      SELECT * FROM shop_orders WHERE id = $1
    `, [orderId]);

    if (currentOrder.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const previousStatus = currentOrder.rows[0].status;

    // Update status with appropriate timestamps
    let updateFields = ['status = $1', 'updated_at = NOW()'];
    const updateParams = [status];
    let paramIndex = 2;

    if (admin_notes) {
      updateFields.push(`admin_notes = $${paramIndex++}`);
      updateParams.push(admin_notes);
    }

    // Add timestamp based on status
    if (status === 'confirmed') {
      updateFields.push('confirmed_at = NOW()');
    } else if (status === 'shipped') {
      updateFields.push('shipped_at = NOW()');
    } else if (status === 'delivered') {
      updateFields.push('delivered_at = NOW()');
    } else if (status === 'cancelled') {
      updateFields.push('cancelled_at = NOW()');
    }

    // Handle cancellation - restore stock
    if (status === 'cancelled' && previousStatus !== 'cancelled') {
      const orderItems = await client.query(`
        SELECT product_id, quantity, selected_size, selected_color FROM shop_order_items WHERE order_id = $1
      `, [orderId]);

      for (const item of orderItems.rows) {
        await client.query(`
          UPDATE products
          SET stock_quantity = stock_quantity + $1, updated_at = NOW()
          WHERE id = $2
        `, [item.quantity, item.product_id]);

        // Restore the exact colour×size combination's variant stock.
        await adjustVariantStock(client, {
          productId: item.product_id,
          size: item.selected_size,
          color: item.selected_color,
          qty: item.quantity,
          restore: true,
        });
      }
    }

    // Handle refund - if payment was completed, refund to wallet
    if (status === 'refunded' && currentOrder.rows[0].payment_status === 'completed') {
      const order = currentOrder.rows[0];

      // Refund the ACTUAL wallet charges per currency (a hybrid order may have debited
      // TRY/USD, not EUR), outstanding portion only. Fall back to legacy EUR total only
      // when the order has no wallet charge on the ledger (card-only/pre-ledger).
      const netCharges = await getEntityNetCharges({ client, shopOrderId: orderId });
      const refunds = netCharges.length
        ? netCharges
        : [{ currency: 'EUR', amount: parseFloat(order.total_amount) }];
      for (const rc of refunds) {
        await recordTransaction({
          client,
          userId: order.user_id,
          amount: rc.amount,
          currency: rc.currency,
          transactionType: 'refund',
          direction: 'credit',
          availableDelta: rc.amount,
          description: `Refund for Order #${order.order_number}`,
          relatedEntityType: 'shop_order_refund',
          // Note: orderId is INTEGER, not UUID, so we store it in metadata instead
          metadata: { orderId, orderNumber: order.order_number },
          idempotencyKey: `shop-order-refund:${orderId}:${rc.currency}`,
        });
      }

      updateFields.push(`payment_status = 'refunded'`);
    }

    updateParams.push(orderId);
    
    await client.query(`
      UPDATE shop_orders 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, updateParams);

    // Log status change
    await client.query(`
      INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, $2, $3, $4, $5)
    `, [orderId, previousStatus, status, userId, admin_notes || null]);

    await client.query('COMMIT');

    const updatedOrder = await getOrderWithItems(orderId);

    // Notify the customer about their order status change (fire-and-forget)
    const statusMessages = {
      confirmed:  { title: 'Order Confirmed', message: `Your order ${updatedOrder.order_number} has been confirmed and is being prepared.` },
      processing: { title: 'Order Being Processed', message: `Your order ${updatedOrder.order_number} is now being processed.` },
      shipped:    { title: 'Order Shipped', message: `Great news! Your order ${updatedOrder.order_number} has been shipped and is on its way.` },
      delivered:  { title: 'Order Delivered', message: `Your order ${updatedOrder.order_number} has been delivered. Enjoy!` },
      cancelled:  { title: 'Order Cancelled', message: `Your order ${updatedOrder.order_number} has been cancelled.${admin_notes ? ` Note: ${admin_notes}` : ''}` },
      refunded:   { title: 'Order Refunded', message: `Your order ${updatedOrder.order_number} has been refunded. The amount has been credited to your wallet.` },
    };
    const notifContent = statusMessages[status];
    if (notifContent && updatedOrder.user_id) {
      dispatchNotification({
        userId: updatedOrder.user_id,
        type: 'shop_order',
        title: notifContent.title,
        message: notifContent.message,
        data: {
          orderId,
          orderNumber: updatedOrder.order_number,
          newStatus: status,
          previousStatus,
          cta: { label: 'View Order', href: '/shop/orders' }
        },
        idempotencyKey: `shop-order-status:${orderId}:${status}`
      }).catch((err) => logger.error('Failed to notify customer of order status change', { err, orderId }));
    }

    // Emit socket event for order update
    emitSocketEvent('shop:orderStatusChanged', {
      orderId,
      orderNumber: updatedOrder.order_number,
      previousStatus,
      newStatus: status,
      customerId: updatedOrder.user_id
    });

    logger.info(`Order ${orderId} status changed from ${previousStatus} to ${status} by ${userId}`);

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: updatedOrder
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  } finally {
    client.release();
  }
});

// Admin/manager: edit a single line-item's price after the sale.
//
// Records-only: re-derives the order subtotal/total, rebases any layered %
// discount, and recomputes the manager commission — WITHOUT moving the
// customer's wallet and WITHOUT touching the catalog product price. The price
// may be entered in any active currency (input_currency); it is converted to
// the order's currency server-side. See updateShopOrderItemPrice.
router.patch(
  '/:orderId/items/:itemId/price',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  cacheInvalidationMiddleware(['api:shop:orders:*', 'api:shop:stats:*']),
  async (req, res) => {
    const orderId = parseInt(req.params.orderId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) {
      return res.status(400).json({ error: 'Invalid order or item id' });
    }

    const { new_unit_price, reason, input_currency, settle_wallet } = req.body || {};
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await updateShopOrderItemPrice({
        client,
        orderId,
        itemId,
        newUnitPrice: Number(new_unit_price),
        reason,
        inputCurrency: input_currency || null,
        settleWallet: settle_wallet !== false,
        actorId: req.user.id,
      });
      const order = await getOrderWithItems(orderId, client);
      await client.query('COMMIT');

      return res.json({ success: true, order, edit: result });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      const status = error.statusCode || 500;
      if (status >= 500) {
        logger.error('Failed to edit shop order item price:', {
          orderId, itemId, error: error.message, stack: error.stack,
        });
      }
      return res.status(status).json({ error: error.message || 'Failed to edit item price' });
    } finally {
      client.release();
    }
  }
);

// Admin: Get low stock products
router.get('/admin/low-stock', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, brand, stock_quantity, low_stock_threshold, image_url, category
      FROM products
      WHERE stock_quantity <= COALESCE(low_stock_threshold, 5)
        AND status = 'active'
      ORDER BY stock_quantity ASC
    `);

    res.json({
      products: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    logger.error('Error fetching low stock products:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

// Admin: Get order statistics
router.get('/admin/stats', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheMiddleware(300, (req) => `api:shop:stats:${req.query.period || '30d'}`), async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let dateFilter = '';
    if (period === '7d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
    } else if (period === '30d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    } else if (period === '90d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
    }

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_orders,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_orders,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped_orders,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as total_revenue,
        COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as avg_order_value
      FROM shop_orders
      WHERE 1=1 ${dateFilter}
    `);

    // Get daily orders for the period
    const dailyStats = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as revenue
      FROM shop_orders
      WHERE 1=1 ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    res.json({
      summary: stats.rows[0],
      daily: dailyStats.rows
    });

  } catch (error) {
    logger.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Cancel order (customer can cancel pending orders)
router.post('/:id/cancel', authenticateJWT, cacheInvalidationMiddleware(['api:shop:orders:*', 'api:shop:stats:*']), async (req, res) => {
  const client = await pool.connect();

  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const { reason } = req.body;

    await client.query('BEGIN');

    const orderResult = await client.query(`
      SELECT * FROM shop_orders WHERE id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check if user owns the order
    if (order.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to cancel this order' });
    }

    // Only allow cancellation of pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot cancel order with status "${order.status}". Contact support for assistance.` 
      });
    }

    // Restore stock
    const orderItems = await client.query(`
      SELECT product_id, quantity, selected_size, selected_color FROM shop_order_items WHERE order_id = $1
    `, [orderId]);

    for (const item of orderItems.rows) {
      await client.query(`
        UPDATE products
        SET stock_quantity = stock_quantity + $1, updated_at = NOW()
        WHERE id = $2
      `, [item.quantity, item.product_id]);

      // Restore the exact colour×size combination's variant stock.
      await adjustVariantStock(client, {
        productId: item.product_id,
        size: item.selected_size,
        color: item.selected_color,
        qty: item.quantity,
        restore: true,
      });
    }

    // Refund if payment was made
    if (order.payment_status === 'completed') {
      // Refund the ACTUAL wallet charges per currency, outstanding portion only.
      // Fall back to legacy EUR total only when no wallet charge exists on the ledger.
      const netCharges = await getEntityNetCharges({ client, shopOrderId: orderId });
      const refunds = netCharges.length
        ? netCharges
        : [{ currency: 'EUR', amount: parseFloat(order.total_amount) }];
      for (const rc of refunds) {
        await recordTransaction({
          client,
          userId,
          amount: rc.amount,
          currency: rc.currency,
          transactionType: 'refund',
          direction: 'credit',
          availableDelta: rc.amount,
          description: `Refund for cancelled Order #${order.order_number}`,
          relatedEntityType: 'shop_order_refund',
          // Note: orderId is INTEGER, not UUID, so we store it in metadata instead
          metadata: { orderId, orderNumber: order.order_number },
          idempotencyKey: `shop-order-refund:${orderId}:${rc.currency}`,
        });
      }
    }

    // Update order status
    await client.query(`
      UPDATE shop_orders 
      SET status = 'cancelled', 
          payment_status = CASE WHEN payment_status = 'completed' THEN 'refunded' ELSE payment_status END,
          cancelled_at = NOW(),
          admin_notes = COALESCE(admin_notes || E'\n', '') || 'Cancelled by customer: ' || $1
      WHERE id = $2
    `, [reason || 'No reason provided', orderId]);

    // Log status change
    await client.query(`
      INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, $2, 'cancelled', $3, $4)
    `, [orderId, order.status, userId, `Cancelled by customer: ${reason || 'No reason provided'}`]);

    await client.query('COMMIT');

    const updatedOrder = await getOrderWithItems(orderId);

    // Fire-and-forget cancel commission
    try {
      const { cancelCommission } = await import('../services/managerCommissionService.js');
      cancelCommission('shop', orderId, 'order_cancelled').catch(() => {});
    } catch { /* ignore */ }

    emitSocketEvent('shop:orderStatusChanged', {
      orderId,
      orderNumber: updatedOrder.order_number,
      previousStatus: order.status,
      newStatus: 'cancelled',
      customerId: updatedOrder.user_id
    });

    logger.info(`Order ${orderId} cancelled by customer ${userId}`);

    res.json({
      success: true,
      message: 'Order cancelled successfully' + (order.payment_status === 'completed' ? '. Refund processed to your wallet.' : ''),
      order: updatedOrder
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

// Admin: Permanently delete an order (and restore stock for non-final states).
// Child rows (items, status history, messages) cascade-delete via FK.
// Bank transfer receipts SET NULL (preserved for audit).
router.delete('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheInvalidationMiddleware(['api:shop:orders:*', 'api:shop:stats:*']), async (req, res) => {
  const client = await pool.connect();

  try {
    const orderId = req.params.id;

    await client.query('BEGIN');

    const orderResult = await client.query('SELECT * FROM shop_orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Restore stock when the order had not already been cancelled/refunded
    // (those flows already returned items to inventory).
    const stockAlreadyReturned = ['cancelled', 'refunded'].includes(order.status);
    if (!stockAlreadyReturned) {
      const orderItems = await client.query(
        'SELECT product_id, quantity, selected_size, selected_color FROM shop_order_items WHERE order_id = $1',
        [orderId]
      );

      for (const item of orderItems.rows) {
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, item.product_id]
        );

        // Restore the exact colour×size combination's variant stock.
        await adjustVariantStock(client, {
          productId: item.product_id,
          size: item.selected_size,
          color: item.selected_color,
          qty: item.quantity,
          restore: true,
        });
      }
    }

    // Settle the wallet BEFORE erasing the order — this endpoint used to delete
    // the order + discounts rows while leaving every wallet transaction behind,
    // which either kept the customer's money (wallet-paid order, debits never
    // refunded) or left a free-money discount credit orphaned against an order
    // id that no longer exists (staff then had to hand-clean the ledger in the
    // finances UI and routinely missed rows). Skip when the order was already
    // cancelled/refunded — those flows have settled the wallet already.
    if (order.user_id && order.payment_status === 'completed') {
      // 1. Reverse any still-open discount-adjustment credit. For a wallet sale
      //    this re-debits the credit so the gross charge can be refunded in full
      //    below; for a cash/card sale it claws back the credit that never had a
      //    matching debit in the first place.
      await reverseOpenDiscountCreditsForEntity(client, 'shop_order', orderId, {
        reason: `Order #${order.order_number} deleted`,
        createdBy: req.user.id,
      });

      // 2. Refund the remaining net wallet charge per currency (nothing to do
      //    for cash/card orders — they never debited the wallet).
      const netCharges = await getEntityNetCharges({ client, shopOrderId: orderId });
      for (const rc of netCharges) {
        if (!(rc.amount > 0)) continue;
        await recordTransaction({
          client,
          userId: order.user_id,
          amount: rc.amount,
          currency: rc.currency,
          transactionType: 'refund',
          direction: 'credit',
          availableDelta: rc.amount,
          description: `Refund for deleted Order #${order.order_number}`,
          relatedEntityType: 'shop_order_refund',
          // orderId is INTEGER, not UUID, so it lives in metadata
          metadata: { orderId: Number(orderId), orderNumber: order.order_number },
          createdBy: req.user.id,
          idempotencyKey: `shop-order-refund:${orderId}:${rc.currency}`,
          allowNegative: true,
        });
      }
    }

    // Clean up the order's manual line-item discounts. They live in the separate
    // `discounts` table (not on shop_orders) with no FK cascade, so without this
    // a deleted order leaves orphan discount rows behind. Their wallet credits
    // were reversed above, so the ledger nets to zero for this order.
    await client.query(
      "DELETE FROM discounts WHERE entity_type = 'shop_order' AND entity_id = $1",
      [String(orderId)]
    );

    await client.query('DELETE FROM shop_orders WHERE id = $1', [orderId]);

    await client.query('COMMIT');

    try {
      const { cancelCommission } = await import('../services/managerCommissionService.js');
      cancelCommission('shop', orderId, 'order_deleted').catch(() => {});
    } catch { /* ignore */ }

    emitSocketEvent('shop:orderDeleted', {
      orderId,
      orderNumber: order.order_number
    });

    logger.info(`Order ${orderId} (${order.order_number}) deleted by admin ${req.user.id}`);

    res.json({ success: true, message: 'Order deleted', stockRestored: !stockAlreadyReturned });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  } finally {
    client.release();
  }
});

// Admin/Staff: Create order on behalf of customer (Quick Sale from Front Desk)
router.post('/admin/quick-sale', authenticateJWT, authorizeRoles(['admin', 'manager', 'front_desk', 'receptionist'], 'finances:write'), cacheInvalidationMiddleware(['api:shop:orders:*', 'api:shop:stats:*']), async (req, res) => {
  const client = await pool.connect();

  try {
    const staffUserId = req.user.id;
    const {
      user_id, // Customer's user_id (optional for walk-in)
      items,
      payment_method = 'cash',
      notes,
      discount_percent, // Optional staff discount, applied atomically below
      discount_reason
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    if (!['wallet', 'credit_card', 'cash', 'card'].includes(payment_method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    await client.query('BEGIN');

    // Calculate order totals and validate stock
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const productResult = await client.query(`
        SELECT id, name, price, stock_quantity, image_url, brand, status, variants
        FROM products
        WHERE id = $1 AND status = 'active'
      `, [item.product_id]);

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Product ${item.product_name || item.product_id} is not available`
        });
      }

      const product = productResult.rows[0];

      if (product.stock_quantity < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}`
        });
      }

      // Resolve the per-variant price for the chosen colour×size combo, server-side
      // (don't trust a client-sent price). Falls back to the base product price.
      const unitPrice = resolveVariantUnitPrice(product, item.selected_size, item.selected_color);

      // Reject 0-priced lines (unpriced product/variant) — same guard as the
      // main order path, so a quick-sale can't silently under-charge and
      // corrupt the customer's balance/history.
      if (!(Number(unitPrice) > 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `${product.name}${item.selected_size ? ` (${item.selected_size})` : ''} has no price set. Set a product/variant price before selling it.`,
          code: 'ZERO_PRICE_ITEM',
        });
      }

      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url,
        brand: product.brand,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: itemTotal,
        selected_size: item.selected_size || null,
        selected_color: item.selected_color || null
      });
    }

    const totalAmount = subtotal;

    const itemSummary = validatedItems.length <= 3
      ? validatedItems.map(i => `${i.product_name} x${i.quantity}`).join(', ')
      : `${validatedItems.slice(0, 2).map(i => `${i.product_name} x${i.quantity}`).join(', ')} +${validatedItems.length - 2} more`;

    // Quick-sale is always invoked by staff (route is gated to admin/manager/front_desk/receptionist),
    // so staff can always complete the sale even if the customer's wallet is empty — the customer
    // simply goes negative. trusted_customer is also allowed to go negative.
    const actorRole = (req.user?.role || '').toLowerCase();
    const isStaffSeller = ['admin', 'manager', 'front_desk', 'receptionist'].includes(actorRole);
    let buyerIsTrusted = false;
    if (payment_method === 'wallet' && user_id) {
      const { rows: buyerRoleRows } = await client.query(
        `SELECT r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
        [user_id]
      );
      buyerIsTrusted = buyerRoleRows[0]?.role_name === 'trusted_customer';
    }
    const allowNegative = isStaffSeller || buyerIsTrusted;

    // Create the order (user_id can be null for walk-in customers)
    // Note: Store staffUserId in notes since created_by column doesn't exist
    const staffNote = notes ? `${notes} | Staff: ${staffUserId}` : `Staff sale by: ${staffUserId}`;
    const orderResult = await client.query(`
      INSERT INTO shop_orders (
        user_id, status, payment_method, payment_status, 
        subtotal, total_amount, notes
      )
      VALUES ($1, 'confirmed', $2, 'completed', $3, $4, $5)
      RETURNING *
    `, [user_id || null, payment_method === 'card' ? 'credit_card' : payment_method, subtotal, totalAmount, staffNote]);

    const order = orderResult.rows[0];

    // Insert order items and update stock
    for (const item of validatedItems) {
      await client.query(`
        INSERT INTO shop_order_items (
          order_id, product_id, product_name, product_image, brand,
          quantity, unit_price, total_price, selected_size, selected_color
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        order.id,
        item.product_id,
        item.product_name,
        item.product_image,
        item.brand,
        item.quantity,
        item.unit_price,
        item.total_price,
        item.selected_size,
        item.selected_color
      ]);

      // Decrease top-level stock
      await client.query(`
        UPDATE products
        SET stock_quantity = stock_quantity - $1, updated_at = NOW()
        WHERE id = $2
      `, [item.quantity, item.product_id]);

      // Decrease the exact colour×size combination's variant stock.
      await adjustVariantStock(client, {
        productId: item.product_id,
        size: item.selected_size,
        color: item.selected_color,
        qty: item.quantity,
        restore: false,
      });
    }

    // Process wallet payment if applicable
    if (payment_method === 'wallet' && user_id) {
      await recordTransaction({
        client,
        userId: user_id,
        amount: -totalAmount,
        currency: 'EUR',
        transactionType: 'payment',
        direction: 'debit',
        availableDelta: -totalAmount,
        description: `${itemSummary} - Order #${order.order_number} (Staff Sale)`,
        relatedEntityType: 'shop_order',
        // No relatedEntityId — wallet_transactions.related_entity_id is UUID and
        // shop_orders.id is SERIAL int. Numeric id stays in metadata.
        createdBy: staffUserId,
        allowNegative,
        metadata: { orderId: order.id, orderNumber: order.order_number, staffId: staffUserId }
      });
    }

    // Apply the staff discount INSIDE the same transaction (atomic). Previously
    // the FAB applied it as a second POST /discounts after the sale, so a failed
    // second call left the order at full price. The order row already exists and
    // is payment_status='completed', so applyDiscount records the discounts-table
    // row and (for a wallet sale) posts the matching wallet credit.
    //
    // skipWalletCredit for cash/card: this route hardcodes payment_status
    // 'completed' for EVERY payment method, but only a wallet sale debits the
    // wallet at GROSS (which the credit then compensates). Cash/card staff
    // sales collect the NET price in person — posting the credit anyway handed
    // the customer the discount a second time as free wallet money.
    const discPct = Math.max(0, Math.min(100, Number(discount_percent) || 0));
    if (discPct > 0 && user_id) {
      await applyDiscount(client, {
        customerId: user_id,
        entityType: 'shop_order',
        entityId: order.id,
        percent: discPct,
        reason: discount_reason || 'Quick sale discount',
        createdBy: staffUserId,
        skipWalletCredit: payment_method !== 'wallet',
      });
    }

    // Log status in history
    await client.query(`
      INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, 'pending', 'confirmed', $2, $3)
    `, [order.id, staffUserId, `Quick sale by staff. Payment: ${payment_method}`]);

    await client.query('COMMIT');

    const completeOrder = await getOrderWithItems(order.id);

    emitSocketEvent('shop:newOrder', {
      orderId: order.id,
      orderNumber: order.order_number,
      totalAmount: completeOrder.total_amount,
      itemCount: (completeOrder.items || []).length,
      source: 'quick_sale'
    });

    logger.info(`Quick sale #${order.order_number} created by staff ${staffUserId} for customer ${user_id || 'walk-in'}`);

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      order: completeOrder
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating quick sale:', error);
    res.status(500).json({ error: 'Failed to create sale' });
  } finally {
    client.release();
  }
});

// ============ ORDER MESSAGES ============

/**
 * GET /:id/messages - Get messages for an order
 * Both the order owner and admin/manager can view messages
 */
router.get('/:id/messages', authenticateJWT, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify order exists and user has access
    const order = await pool.query('SELECT id, user_id FROM shop_orders WHERE id = $1', [orderId]);
    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const isOwner = order.rows[0].user_id === userId;
    const isStaff = ['admin', 'manager', 'super_admin'].includes(userRole);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const messages = await pool.query(`
      SELECT m.*, u.first_name, u.last_name, u.profile_image_url
      FROM shop_order_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.order_id = $1
      ORDER BY m.created_at ASC
    `, [orderId]);

    // Mark unread messages as read for this user
    if (isStaff) {
      await pool.query(
        `UPDATE shop_order_messages SET is_read = true WHERE order_id = $1 AND is_staff = false AND is_read = false`,
        [orderId]
      );
    } else {
      await pool.query(
        `UPDATE shop_order_messages SET is_read = true WHERE order_id = $1 AND is_staff = true AND is_read = false`,
        [orderId]
      );
    }

    res.json({ messages: messages.rows });
  } catch (error) {
    logger.error('Error fetching order messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /:id/messages - Send a message on an order
 */
router.post('/:id/messages', authenticateJWT, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify order exists and user has access
    const order = await pool.query('SELECT id, user_id FROM shop_orders WHERE id = $1', [orderId]);
    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const isOwner = order.rows[0].user_id === userId;
    const isStaff = ['admin', 'manager', 'super_admin'].includes(userRole);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await pool.query(`
      INSERT INTO shop_order_messages (order_id, user_id, message, is_staff)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [orderId, userId, message.trim(), isStaff]);

    // Fetch with user info
    const full = await pool.query(`
      SELECT m.*, u.first_name, u.last_name, u.profile_image_url
      FROM shop_order_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.id = $1
    `, [result.rows[0].id]);

    res.status(201).json({ message: full.rows[0] });
  } catch (error) {
    logger.error('Error sending order message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
