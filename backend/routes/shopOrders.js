// backend/routes/shopOrders.js
// API routes for shop order management

import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import socketService from '../services/socketService.js';
import { getBalance, getAllBalances, recordTransaction } from '../services/walletService.js';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';
import voucherService from '../services/voucherService.js';
import { dispatchToStaff } from '../services/notificationDispatcherUnified.js';
import CurrencyService from '../services/currencyService.js';
import { addTag } from '../services/userTagService.js';

const router = express.Router();

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
        link: `/services/shop-orders`
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
      u.phone
    FROM shop_orders o
    LEFT JOIN users u ON o.user_id = u.id
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
router.post('/', authenticateJWT, async (req, res) => {
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
      receipt_url
    } = req.body;

    // Allow admin/manager to create orders on behalf of a customer
    const isAdmin = ['admin', 'manager', 'super_admin', 'owner'].includes(req.user.role);
    if (overrideUserId && isAdmin) {
      userId = overrideUserId;
    }

    // allowNegativeBalance is restricted to admin/manager only
    const canGoNegative = allowNegativeBalance === true && isAdmin;

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
        SELECT id, name, price, stock_quantity, image_url, brand, status
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

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url,
        brand: product.brand,
        quantity: item.quantity,
        unit_price: product.price,
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

      if (totalDeductedEUR < finalAmount - 0.01 && !canGoNegative) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient wallet balance. Required: €${finalAmount.toFixed(2)}, Available: €${totalDeductedEUR.toFixed(2)}`
        });
      }

      if (canGoNegative && totalDeductedEUR < finalAmount - 0.01) {
        // Admin override: create deduction plan for full amount from primary currency (EUR)
        // The wallet will go negative
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

    // Allow admin/manager to backdate orders
    const orderCreatedAt = (isAdmin && overrideCreatedAt) ? new Date(overrideCreatedAt) : new Date();

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

      // Decrease variant-level stock when a size was selected
      if (item.selected_size) {
        await client.query(`
          UPDATE products
          SET variants = (
            SELECT jsonb_agg(
              CASE
                WHEN elem->>'label' = $2
                THEN jsonb_set(elem, '{quantity}', to_jsonb(GREATEST(0, (elem->>'quantity')::int - $1)))
                ELSE elem
              END
            )
            FROM jsonb_array_elements(variants) AS elem
          ),
          updated_at = NOW()
          WHERE id = $3 AND variants IS NOT NULL
        `, [item.quantity, item.selected_size, item.product_id]);
      }
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
          allowNegative: canGoNegative,
          description: `${itemSummary} - Order #${order.order_number}${voucherDiscount > 0 ? ` (discount: €${voucherDiscount.toFixed(2)})` : ''}`,
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
    const buyerName = buyerResult.rows[0]
      ? `${buyerResult.rows[0].first_name} ${buyerResult.rows[0].last_name}`.trim()
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

    // Check authorization - user can only see their own orders unless admin/manager
    if (order.user_id !== userId && !['admin', 'manager'].includes(userRole)) {
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

    res.json({
      ...order,
      status_history: historyResult.rows
    });

  } catch (error) {
    logger.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Admin: Get specific user's orders
router.get('/admin/user/:userId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

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
          'total_price', oi.total_price,
          'selected_size', oi.selected_size,
          'selected_color', oi.selected_color
        )) FROM shop_order_items oi WHERE oi.order_id = o.id) as items
      FROM shop_orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM shop_orders WHERE user_id = $1
    `, [userId]);

    res.json({
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });

  } catch (error) {
    logger.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch user orders' });
  }
});

// Admin: Get all orders
router.get('/admin/all', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      payment_status,
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

    // Get summary stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped_count,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as total_revenue
      FROM shop_orders
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
router.patch('/:id/status', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
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
        SELECT product_id, quantity, selected_size FROM shop_order_items WHERE order_id = $1
      `, [orderId]);

      for (const item of orderItems.rows) {
        await client.query(`
          UPDATE products 
          SET stock_quantity = stock_quantity + $1, updated_at = NOW()
          WHERE id = $2
        `, [item.quantity, item.product_id]);

        // Restore variant-level stock
        if (item.selected_size) {
          await client.query(`
            UPDATE products
            SET variants = (
              SELECT jsonb_agg(
                CASE
                  WHEN elem->>'label' = $2
                  THEN jsonb_set(elem, '{quantity}', to_jsonb((elem->>'quantity')::int + $1))
                  ELSE elem
                END
              )
              FROM jsonb_array_elements(variants) AS elem
            ),
            updated_at = NOW()
            WHERE id = $3 AND variants IS NOT NULL
          `, [item.quantity, item.selected_size, item.product_id]);
        }
      }
    }

    // Handle refund - if payment was completed, refund to wallet
    if (status === 'refunded' && currentOrder.rows[0].payment_status === 'completed') {
      const order = currentOrder.rows[0];
      
      // Refund to wallet using walletService
      await recordTransaction({
        client,
        userId: order.user_id,
        amount: parseFloat(order.total_amount),
        currency: 'EUR',
        transactionType: 'refund',
        direction: 'credit',
        availableDelta: parseFloat(order.total_amount),
        description: `Refund for Order #${order.order_number}`,
        relatedEntityType: 'shop_order_refund',
        // Note: orderId is INTEGER, not UUID, so we store it in metadata instead
        metadata: { orderId, orderNumber: order.order_number }
      });

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
router.get('/admin/stats', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
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
router.post('/:id/cancel', authenticateJWT, async (req, res) => {
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
      SELECT product_id, quantity, selected_size FROM shop_order_items WHERE order_id = $1
    `, [orderId]);

    for (const item of orderItems.rows) {
      await client.query(`
        UPDATE products 
        SET stock_quantity = stock_quantity + $1, updated_at = NOW()
        WHERE id = $2
      `, [item.quantity, item.product_id]);

      // Restore variant-level stock
      if (item.selected_size) {
        await client.query(`
          UPDATE products
          SET variants = (
            SELECT jsonb_agg(
              CASE
                WHEN elem->>'label' = $2
                THEN jsonb_set(elem, '{quantity}', to_jsonb((elem->>'quantity')::int + $1))
                ELSE elem
              END
            )
            FROM jsonb_array_elements(variants) AS elem
          ),
          updated_at = NOW()
          WHERE id = $3 AND variants IS NOT NULL
        `, [item.quantity, item.selected_size, item.product_id]);
      }
    }

    // Refund if payment was made
    if (order.payment_status === 'completed') {
      // Refund to wallet using walletService
      await recordTransaction({
        client,
        userId,
        amount: parseFloat(order.total_amount),
        currency: 'EUR',
        transactionType: 'refund',
        direction: 'credit',
        availableDelta: parseFloat(order.total_amount),
        description: `Refund for cancelled Order #${order.order_number}`,
        relatedEntityType: 'shop_order_refund',
        // Note: orderId is INTEGER, not UUID, so we store it in metadata instead
        metadata: { orderId, orderNumber: order.order_number }
      });
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

// Admin/Staff: Create order on behalf of customer (Quick Sale from Front Desk)
router.post('/admin/quick-sale', authenticateJWT, authorizeRoles(['admin', 'manager', 'front_desk']), async (req, res) => {
  const client = await pool.connect();

  try {
    const staffUserId = req.user.id;
    const { 
      user_id, // Customer's user_id (optional for walk-in)
      items, 
      payment_method = 'cash',
      notes
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
        SELECT id, name, price, stock_quantity, image_url, brand, status
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

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url,
        brand: product.brand,
        quantity: item.quantity,
        unit_price: product.price,
        total_price: itemTotal
      });
    }

    const totalAmount = subtotal;

    const itemSummary = validatedItems.length <= 3
      ? validatedItems.map(i => `${i.product_name} x${i.quantity}`).join(', ')
      : `${validatedItems.slice(0, 2).map(i => `${i.product_name} x${i.quantity}`).join(', ')} +${validatedItems.length - 2} more`;

    // For wallet payment, check customer's wallet balance
    if (payment_method === 'wallet' && user_id) {
      const walletBalance = await getBalance(user_id, 'EUR');
      const balance = walletBalance.available || 0;
      
      if (balance < totalAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient wallet balance. Required: €${totalAmount.toFixed(2)}, Available: €${balance.toFixed(2)}` 
        });
      }
    }

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
          quantity, unit_price, total_price
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        order.id,
        item.product_id,
        item.product_name,
        item.product_image,
        item.brand,
        item.quantity,
        item.unit_price,
        item.total_price
      ]);

      // Decrease stock
      await client.query(`
        UPDATE products 
        SET stock_quantity = stock_quantity - $1, updated_at = NOW()
        WHERE id = $2
      `, [item.quantity, item.product_id]);
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
        metadata: { orderId: order.id, orderNumber: order.order_number, staffId: staffUserId }
      });
    }

    // Log status in history
    await client.query(`
      INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, 'pending', 'confirmed', $2, $3)
    `, [order.id, staffUserId, `Quick sale by staff. Payment: ${payment_method}`]);

    await client.query('COMMIT');

    const completeOrder = await getOrderWithItems(order.id);

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
