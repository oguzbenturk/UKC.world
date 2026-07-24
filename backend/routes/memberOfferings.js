// backend/routes/memberOfferings.js
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { getBalance, getAllBalances, recordTransaction, getEntityNetCharges } from '../services/walletService.js';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';
import CurrencyService from '../services/currencyService.js';
import { dispatchNotification } from '../services/notificationDispatcherUnified.js';
import { recordMembershipCommission, cancelCommission } from '../services/managerCommissionService.js';
import { METHOD_PAYMENT_TX_TYPE } from '../constants/transactions.js';
import { applyDiscount, computeDiscountAmount } from '../services/discountService.js';

const router = Router();

const ADMIN_ROLES = ['admin', 'manager', 'developer', 'front_desk', 'receptionist'];

// ==================================================
// PUBLIC ROUTES (No authentication required)
// ==================================================

/**
 * GET /member-offerings
 * Get all active offerings (PUBLIC - for guests and authenticated users)
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        mo.id,
        mo.name,
        mo.description,
        mo.price,
        mo.period,
        mo.features,
        mo.icon,
        mo.badge,
        mo.badge_color,
        mo.highlighted,
        mo.beach_fee_amount,
        mo.duration_days,
        mo.image_url,
        mo.use_image_background,
        mo.card_style,
        mo.button_text,
        mo.gradient_color,
        mo.text_color,
        mo.gradient_opacity,
        mo.category,
        mo.total_capacity,
        mo.group_key,
        CASE
          WHEN mo.category = 'storage' AND mo.total_capacity IS NOT NULL THEN
            mo.total_capacity - COALESCE(storage_global.cnt, 0)
          ELSE NULL
        END AS available_count
      FROM member_offerings mo
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT mp.storage_unit) AS cnt
        FROM member_purchases mp
        JOIN member_offerings mo2 ON mo2.id = mp.offering_id
        WHERE mo2.category = 'storage'
          AND mp.status IN ('active', 'pending', 'pending_payment')
          AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
          AND mp.storage_unit IS NOT NULL
      ) storage_global ON mo.category = 'storage'
      WHERE mo.is_active = TRUE
      ORDER BY mo.sort_order ASC, mo.id ASC
    `);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching member offerings:', error);
    res.status(500).json({ error: 'Failed to fetch offerings' });
  }
});

// ==================================================
// AUTHENTICATED ROUTES
// ==================================================

/**
 * GET /member-offerings/my-purchases
 * Get current user's purchases/subscriptions
 */
router.get('/my-purchases', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(`
      SELECT 
        mp.*,
        mo.name as current_offering_name,
        mo.description as current_offering_description,
        mo.icon,
        mo.period
      FROM member_purchases mp
      LEFT JOIN member_offerings mo ON mp.offering_id = mo.id
      WHERE mp.user_id = $1
      ORDER BY mp.purchased_at DESC
    `, [userId]);

    res.json(rows);
  } catch (error) {
    logger.error('Error fetching user purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

/**
 * POST /member-offerings/:offeringId/purchase
 * Purchase an offering
 */
router.post(
  '/:offeringId/purchase',
  authenticateJWT,
  [
    body('paymentMethod').isIn(['wallet', 'cash', 'card', 'credit_card', 'transfer', 'bank_transfer', 'pay_later']).withMessage('Invalid payment method'),
    body('startDate').optional().isISO8601().withMessage('Invalid start date'),
    body('depositPercent').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid deposit percent'),
    body('depositAmount').optional().isFloat({ min: 0 }).withMessage('Invalid deposit amount'),
    body('bankAccountId').optional().isUUID().withMessage('Invalid bank account ID'),
    body('receiptUrl').optional().isString().withMessage('Invalid receipt URL'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userId = req.user.id;
      const { offeringId } = req.params;
      const { paymentMethod, startDate, depositPercent, depositAmount, bankAccountId, receiptUrl } = req.body;

      // Get the offering
      const { rows: [offering] } = await client.query(`
        SELECT * FROM member_offerings WHERE id = $1 AND is_active = TRUE
      `, [offeringId]);

      if (!offering) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Offering not found or inactive' });
      }

      // Check if user already has an active purchase for this offering
      const { rows: existingPurchases } = await client.query(`
        SELECT id FROM member_purchases 
        WHERE user_id = $1 AND offering_id = $2 AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
      `, [userId, offeringId]);

      if (existingPurchases.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'You already have an active subscription for this offering' });
      }

      // Storage capacity check — GLOBAL DISTINCT, matching the auto-assign block below.
      // DISTINCT so a SHARED box (multiple rows, same storage_unit) counts once; global so
      // boxes occupied via OTHER storage plans count too. Same predicate everywhere.
      if (offering.category === 'storage' && offering.total_capacity != null) {
        const { rows: [{ cnt }] } = await client.query(`
          SELECT COUNT(DISTINCT mp.storage_unit)::int AS cnt
          FROM member_purchases mp
          JOIN member_offerings mo2 ON mo2.id = mp.offering_id
          WHERE mo2.category = 'storage'
            AND mp.status IN ('active', 'pending', 'pending_payment')
            AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
            AND mp.storage_unit IS NOT NULL
        `);

        if (cnt >= offering.total_capacity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'No storage slots available — all units are currently occupied' });
        }
      }

      // Calculate expiration date from startDate (or today)
      const baseDate = startDate ? new Date(startDate) : new Date();
      let expiresAt = null;
      if (offering.duration_days) {
        expiresAt = new Date(baseDate);
        expiresAt.setDate(expiresAt.getDate() + offering.duration_days);
      }

      // Handle wallet payment
      let paymentStatus = 'completed';
      // Capture the wallet/cash debit so we can stamp it with the purchase id AFTER the
      // member_purchases INSERT below. Without metadata.memberPurchaseId the refund/cancel
      // path (getEntityNetCharges) can't locate the charge and the customer never gets
      // credited back. (The admin sale path already stores memberPurchaseId; the customer
      // paths historically did not — this closes that gap going forward.)
      let walletDebitTxId = null;
      if (paymentMethod === 'wallet') {
        const price = parseFloat(offering.price);
        const offeringCurrency = offering.currency || 'EUR';

        // Find a wallet balance that can cover the price
        // First try the offering currency, then try any other currency with sufficient converted balance
        let payCurrency = offeringCurrency;
        let payAmount = price;
        let walletBalance = await getBalance(userId, offeringCurrency);

        if (walletBalance.available < price) {
          // Try other currencies
          const allBalances = await getAllBalances(userId);
          let found = false;
          for (const bal of allBalances) {
            if (bal.currency === offeringCurrency || bal.available <= 0) continue;
            try {
              const convertedPrice = await CurrencyService.convertCurrency(price, offeringCurrency, bal.currency);
              if (bal.available >= convertedPrice) {
                payCurrency = bal.currency;
                payAmount = convertedPrice;
                walletBalance = bal;
                found = true;
                break;
              }
            } catch { /* skip if conversion unavailable */ }
          }
          if (!found) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: 'Insufficient wallet balance',
              required: price,
              currency: offeringCurrency,
              available: walletBalance.available
            });
          }
        }

        // Deduct from wallet using service
        const walletTx = await recordTransaction({
          client, // Pass the existing transaction client
          userId,
          amount: -payAmount,
          currency: payCurrency,
          transactionType: 'payment',
          direction: 'debit',
          availableDelta: -payAmount, // Explicitly reduce availability
          description: `Purchase: ${offering.name}`,
          relatedEntityType: 'member_purchase',
          metadata: {
            offeringId,
            offeringName: offering.name
          }
        });
        walletDebitTxId = walletTx?.id || null;
      } else if (paymentMethod === 'cash' || paymentMethod === 'pay_later') {
        // For cash/pay_later payments, create negative balance (pay at center)
        // This allows the customer to owe money that they'll pay in person
        const currency = 'EUR';
        const price = parseFloat(offering.price);
        
        const cashTx = await recordTransaction({
          client, // Pass the existing transaction client
          userId,
          amount: -price,
          currency,
          transactionType: 'payment',
          direction: 'debit',
          availableDelta: -price, // Create negative balance
          description: `Purchase (Pay at Center): ${offering.name}`,
          relatedEntityType: 'member_purchase',
          metadata: {
            offeringId,
            offeringName: offering.name,
            paymentPending: true
          },
          allowNegative: true // Allow negative balance for pay at center
        });
        walletDebitTxId = cashTx?.id || null;

        paymentStatus = 'pending'; // Set as pending until payment received
      } else if (paymentMethod === 'credit_card' || paymentMethod === 'card') {
        paymentStatus = 'pending_payment';
      } else if (paymentMethod === 'bank_transfer' || paymentMethod === 'transfer') {
        paymentStatus = 'pending';
      } else {
        paymentStatus = 'pending';
      }

      const isBankTransfer = paymentMethod === 'bank_transfer' || paymentMethod === 'transfer';
      const isCreditCard = paymentMethod === 'credit_card' || paymentMethod === 'card';
      const isDeposit = depositPercent > 0;
      // Card & bank transfer start as pending_payment; card is confirmed via Iyzico callback, bank via admin
      const purchaseStatus = (isBankTransfer || isCreditCard) ? 'pending_payment' : 'active';

      // Assign storage unit number — units are shared across ALL storage offerings
      let storageUnit = null;
      if (offering.category === 'storage' && offering.total_capacity) {
        const { rows: occupied } = await client.query(`
          SELECT DISTINCT mp.storage_unit
          FROM member_purchases mp
          JOIN member_offerings mo2 ON mo2.id = mp.offering_id
          WHERE mo2.category = 'storage'
            AND mp.status IN ('active', 'pending', 'pending_payment')
            AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
            AND mp.storage_unit IS NOT NULL
          ORDER BY mp.storage_unit
        `);
        const usedUnits = new Set(occupied.map(r => r.storage_unit));
        for (let u = 1; u <= offering.total_capacity; u++) {
          if (!usedUnits.has(u)) { storageUnit = u; break; }
        }
      }

      // Create the purchase record
      const { rows: [purchase] } = await client.query(`
        INSERT INTO member_purchases (
          user_id,
          offering_id,
          offering_name,
          offering_price,
          purchased_at,
          expires_at,
          status,
          payment_method,
          payment_status,
          storage_unit,
          beach_fee_amount
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        userId,
        offeringId,
        offering.name,
        offering.price,
        baseDate,
        expiresAt,
        purchaseStatus,
        paymentMethod,
        paymentStatus,
        storageUnit,
        offering.beach_fee_amount ?? offering.price
      ]);

      // Stamp the wallet/cash debit with the new purchase id so a later admin cancel can
      // find and refund it (member_purchases.id isn't known until the INSERT above).
      if (walletDebitTxId) {
        await client.query(
          `UPDATE wallet_transactions
              SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('memberPurchaseId', $1::text)
            WHERE id = $2`,
          [purchase.id, walletDebitTxId]
        );
      }

      // For bank transfers (full or deposit), create a receipt record for admin approval
      // Deposit-by-card goes through Iyzico instead — no receipt needed here
      const isDepositByBank = isDeposit && isBankTransfer;
      const needsAdminApproval = isBankTransfer || isDepositByBank;
      if (isBankTransfer) {
        const price = parseFloat(offering.price);
        const receiptAmount = isDeposit
          ? (depositAmount || parseFloat((price * depositPercent / 100).toFixed(2)))
          : price;

        const depositNotes = isDeposit
          ? `DEPOSIT ${depositPercent}% via bank transfer — Paid: ${receiptAmount} EUR, Remaining: ${parseFloat((price - receiptAmount).toFixed(2))} EUR due on arrival. Full price: ${price} EUR`
          : null;

        await client.query(`
          INSERT INTO bank_transfer_receipts (
            user_id, member_purchase_id, bank_account_id, receipt_url, amount, currency, status, admin_notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          userId,
          purchase.id,
          bankAccountId || null,
          receiptUrl || null,
          receiptAmount,
          'EUR',
          'pending',
          depositNotes
        ]);
      }

      await client.query('COMMIT');

      logger.info(`Member purchase created: user=${userId}, offering=${offering.name}, method=${paymentMethod}`);

      // Emit real-time event for pending membership payments
      if (needsAdminApproval) {
        req.socketService?.emitToChannel('dashboard', 'pending-membership-payment:new', {
          purchaseId: purchase.id,
          userId,
          offeringName: offering.name,
        });
      }

      // Fire-and-forget manager commission for ACTIVE membership sales (wallet,
      // cash, pay-at-center). Card & bank transfer start pending_payment and record
      // later — on the Iyzico callback / on bank-transfer approval respectively.
      // Commission base is beach-fee only (see recordMembershipCommission); pure
      // storage records nothing. category isn't a purchase column, so attach it.
      if (purchaseStatus === 'active') {
        recordMembershipCommission({ ...purchase, category: offering.category }).catch(() => {});
      }

      // For credit card payments (full or deposit), initiate Iyzico checkout
      const isCardPayment = paymentMethod === 'credit_card' || paymentMethod === 'card';
      const isDepositByCard = isDeposit && isCardPayment;
      if (isCardPayment) {
        try {
          // Deposit-by-card charges only the deposit amount; full card charges full price
          const price = parseFloat(offering.price);
          let iyzicoAmount = isDepositByCard
            ? (depositAmount || parseFloat((price * depositPercent / 100).toFixed(2)))
            : price;
          let iyzicoCurrency = 'EUR';

          // Convert to user's preferred currency for Iyzico checkout
          try {
            const { rows: [userRow] } = await pool.query(
              'SELECT preferred_currency FROM users WHERE id = $1', [userId]
            );
            const userPrefCurrency = userRow?.preferred_currency;
            if (userPrefCurrency && userPrefCurrency !== 'EUR') {
              const converted = await CurrencyService.convertCurrency(iyzicoAmount, 'EUR', userPrefCurrency);
              if (converted > 0) {
                iyzicoAmount = converted;
                iyzicoCurrency = userPrefCurrency;
              }
            }
          } catch (convErr) {
            logger.warn('Currency conversion failed for membership Iyzico, falling back to EUR', { error: convErr.message });
          }

          const itemName = isDepositByCard
            ? `${offering.name} (${depositPercent}% Deposit)`
            : offering.name;

          const gatewayResult = await initiateDeposit({
            amount: iyzicoAmount,
            currency: iyzicoCurrency,
            userId,
            clientIp: req.ip,
            referenceCode: `MO-${purchase.id}`,
            items: [{
              id: `offering-${offeringId}`,
              name: itemName,
              price: parseFloat(iyzicoAmount).toFixed(2)
            }]
          });

          // Store the Iyzico token so callback can find this purchase reliably
          const iyzicoToken = gatewayResult.gatewayTransactionId || gatewayResult.session?.token;
          if (iyzicoToken) {
            await pool.query(
              `UPDATE member_purchases SET gateway_transaction_id = $1 WHERE id = $2`,
              [iyzicoToken, purchase.id]
            );
          }

          return res.status(201).json({
            message: 'Redirecting to payment...',
            purchase,
            paymentStatus,
            paymentPageUrl: gatewayResult.paymentPageUrl
          });
        } catch (iyzicoErr) {
          logger.error('Iyzico initiation failed for member offering purchase', { purchaseId: purchase.id, error: iyzicoErr.message });
          // Update purchase to failed
          await pool.query(`UPDATE member_purchases SET payment_status = 'failed' WHERE id = $1`, [purchase.id]);
          return res.status(500).json({ error: 'Failed to initiate card payment. Please try again or use wallet.' });
        }
      }

      res.status(201).json({
        message: isBankTransfer
          ? (isDeposit
              ? 'Deposit receipt submitted! Your membership will be activated after admin approval. Remaining balance is due on arrival.'
              : 'Transfer receipt submitted! Your membership will be activated after admin approval.')
          : paymentStatus === 'completed' 
            ? 'Purchase successful!' 
            : 'Purchase recorded. Please complete payment at reception.',
        purchase,
        paymentStatus,
        pendingApproval: isBankTransfer,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing purchase:', error);
      res.status(500).json({ error: 'Failed to process purchase' });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /member-offerings/purchases/:id/cancel
 * Cancel a pending_payment purchase (user abandoned Iyzico / payment failed)
 */
router.post('/purchases/:id/cancel', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const { rows } = await pool.query(
      `UPDATE member_purchases
         SET status = 'cancelled', payment_status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status = 'pending_payment'
       RETURNING *`,
      [id, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No pending purchase found to cancel' });
    }

    cancelCommission('membership', rows[0].id, 'purchase_cancelled').catch(() => {});

    logger.info(`Cancelled abandoned purchase ${id} for user ${userId}`);
    res.json({ message: 'Purchase cancelled', purchase: rows[0] });
  } catch (err) {
    logger.error('Error cancelling purchase:', err);
    res.status(500).json({ error: 'Failed to cancel purchase' });
  }
});

// ==================================================
// ADMIN ROUTES
// ==================================================

/**
 * GET /member-offerings/admin/all
 * Get all offerings including inactive (Admin only)
 */
router.get('/admin/all', authenticateJWT, authorizeRoles(ADMIN_ROLES), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT mo.*,
        CASE 
          WHEN mo.category = 'storage' AND mo.total_capacity IS NOT NULL THEN
            mo.total_capacity - COALESCE(storage_global.cnt, 0)
          ELSE NULL
        END AS available_count
      FROM member_offerings mo
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT mp.storage_unit) AS cnt
        FROM member_purchases mp
        JOIN member_offerings mo2 ON mo2.id = mp.offering_id
        WHERE mo2.category = 'storage'
          AND mp.status IN ('active', 'pending', 'pending_payment')
          AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
          AND mp.storage_unit IS NOT NULL
      ) storage_global ON mo.category = 'storage'
      ORDER BY mo.sort_order ASC, mo.id ASC
    `);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching all offerings:', error);
    res.status(500).json({ error: 'Failed to fetch offerings' });
  }
});

/**
 * GET /member-offerings/admin/:offeringId/storage-units
 * Staff-only. Returns the full 1..total_capacity box grid for a storage offering,
 * with GLOBAL occupancy (across ALL storage offerings — same set available_count uses).
 * Occupied boxes list occupant name(s) + nearest (MAX) expiry. Free boxes => occupied:false.
 * Occupied boxes stay selectable in the UI so staff can deliberately SHARE one box.
 */
router.get('/admin/:offeringId/storage-units', authenticateJWT, authorizeRoles(ADMIN_ROLES), async (req, res) => {
  try {
    const { offeringId } = req.params;

    const { rows: [offering] } = await pool.query(
      `SELECT id, category, total_capacity FROM member_offerings WHERE id = $1`,
      [offeringId]
    );
    if (!offering) return res.status(404).json({ error: 'Offering not found' });
    if (offering.category !== 'storage') {
      return res.status(400).json({ error: 'Offering is not a storage plan' });
    }
    // Storage plan exists but no box count configured yet (total_capacity NULL/0). Return an
    // empty grid with a flag so the UI can guide staff to set "Total Capacity" in
    // Settings → Memberships, instead of surfacing an error.
    if (offering.total_capacity == null || offering.total_capacity <= 0) {
      return res.json({
        offeringId: Number(offeringId),
        totalCapacity: offering.total_capacity || 0,
        units: [],
        unconfigured: true,
      });
    }

    // GLOBAL occupied set — identical predicate to available_count and the customer
    // auto-assign. One row per occupied box, with occupants aggregated (a box can be shared).
    const { rows: occRows } = await pool.query(`
      SELECT mp.storage_unit AS unit,
             ARRAY_AGG(
               NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')
               ORDER BY u.first_name, u.last_name
             ) FILTER (WHERE u.id IS NOT NULL) AS occupants,
             MAX(mp.expires_at) AS expires_at
      FROM member_purchases mp
      JOIN member_offerings mo2 ON mo2.id = mp.offering_id
      LEFT JOIN users u ON u.id = mp.user_id
      WHERE mo2.category = 'storage'
        AND mp.status IN ('active', 'pending', 'pending_payment')
        AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
        AND mp.storage_unit IS NOT NULL
      GROUP BY mp.storage_unit
    `);

    const byUnit = new Map(occRows.map(r => [Number(r.unit), r]));

    const units = [];
    for (let u = 1; u <= offering.total_capacity; u++) {
      const row = byUnit.get(u);
      const occupants = (row?.occupants || []).filter(Boolean);
      units.push({
        unit: u,
        // occupied = the box appears in the GLOBAL occupied set (matches COUNT(DISTINCT)
        // availability). Derive from row PRESENCE, not occupants.length — an orphaned/
        // deleted-user row still consumes the box, so it must read as occupied.
        occupied: !!row,
        occupants: occupants.length ? occupants : (row ? ['Unknown'] : []),
        expiresAt: row?.expires_at || null,
      });
    }

    res.json({
      offeringId: Number(offeringId),
      totalCapacity: offering.total_capacity,
      units,
    });
  } catch (error) {
    logger.error('Error fetching storage units:', error);
    res.status(500).json({ error: 'Failed to fetch storage units' });
  }
});

/**
 * POST /member-offerings
 * Create a new offering (Admin only)
 */
router.post(
  '/',
  authenticateJWT,
  authorizeRoles(ADMIN_ROLES),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('price').isNumeric().withMessage('Price must be a number'),
    body('period').isIn(['day', 'month', 'season', 'year']).withMessage('Invalid period'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { 
        name, 
        description, 
        price, 
        period, 
        features = [], 
        icon = 'star', 
        badge, 
        badge_color = 'blue',
        highlighted = false, 
        is_active = true, 
        sort_order = 0,
        duration_days,
        image_url,
        use_image_background,
        card_style = 'simple',
        button_text = 'Choose Plan',
        gradient_color,
        text_color = 'dark',
        gradient_opacity = 70,
        category = 'membership',
        total_capacity,
        beach_fee_amount
      } = req.body;

      // Commissionable (beach-fee) portion. Non-storage offerings are fully
      // commissionable (beach = price). Storage offerings use the explicit beach
      // portion (the rest is storage, which earns the manager nothing); default 0.
      const beachFee = category === 'storage'
        ? (beach_fee_amount != null ? Number(beach_fee_amount) : 0)
        : Number(price);

      const { rows: [offering] } = await pool.query(`
        INSERT INTO member_offerings (
          name, description, price, period, features, icon,
          badge, badge_color, highlighted, is_active, sort_order, duration_days,
          image_url, use_image_background, card_style, button_text, gradient_color, text_color, gradient_opacity,
          category, total_capacity, beach_fee_amount
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING *
      `, [
        name, description, price, period, JSON.stringify(features), icon,
        badge, badge_color, highlighted, is_active, sort_order, duration_days,
        image_url, use_image_background ?? true, card_style, button_text, gradient_color, text_color, gradient_opacity,
        category, total_capacity || null, beachFee
      ]);

      logger.info(`Member offering created: ${name} by user ${req.user.id}`);
      res.status(201).json(offering);
    } catch (error) {
      logger.error('Error creating offering:', error);
      res.status(500).json({ error: 'Failed to create offering' });
    }
  }
);

/**
 * POST /member-offerings/batch
 * Create multiple offerings at once with shared visuals but different durations/prices
 */
router.post(
  '/batch',
  authenticateJWT,
  authorizeRoles(ADMIN_ROLES),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('tiers').isArray({ min: 1 }).withMessage('At least one tier is required'),
    body('tiers.*.price').isNumeric().withMessage('Each tier must have a price'),
    body('tiers.*.duration_days').isInt({ min: 1 }).withMessage('Each tier must have duration_days'),
    body('tiers.*.label').notEmpty().withMessage('Each tier must have a label'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await pool.connect();
    try {
      const {
        name, description, features = [], icon = 'CrownOutlined',
        badge, badge_color = 'gold', highlighted = false, image_url, tiers,
        category = 'membership', total_capacity
      } = req.body;

      await client.query('BEGIN');
      const results = [];

      const tierColorByDays = (d) => {
        if (d <= 1) return 'sky';
        if (d <= 7) return 'indigo';
        if (d <= 31) return 'purple';
        if (d <= 180) return 'emerald';
        return 'gold';
      };

      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const tierName = `${name} - ${tier.label}`;
        const tierColor = tier.color || tierColorByDays(tier.duration_days);
        const period = tier.duration_days <= 1 ? 'day'
          : tier.duration_days <= 7 ? 'day'
          : tier.duration_days <= 31 ? 'month'
          : tier.duration_days <= 180 ? 'season'
          : 'year';

        // Beach-fee (commissionable) portion per tier. Non-storage → full tier
        // price; storage → explicit tier beach portion (rest is storage), default 0.
        const tierBeachFee = category === 'storage'
          ? (tier.beach_fee_amount != null ? Number(tier.beach_fee_amount) : 0)
          : Number(tier.price);

        const { rows: [offering] } = await client.query(`
          INSERT INTO member_offerings (
            name, description, price, period, features, icon,
            badge, badge_color, highlighted, is_active, sort_order, duration_days,
            image_url, card_style, button_text, category, total_capacity, beach_fee_amount
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, 'simple', 'Choose Plan', $13, $14, $15)
          RETURNING *
        `, [
          tierName, description, tier.price, period,
          JSON.stringify(features), icon, badge, tierColor,
          highlighted, i, tier.duration_days, image_url,
          category, total_capacity || null, tierBeachFee
        ]);
        results.push(offering);
      }

      await client.query('COMMIT');
      logger.info(`Batch member offerings created: ${name} (${tiers.length} tiers) by user ${req.user.id}`);
      res.status(201).json(results);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating batch offerings:', error);
      res.status(500).json({ error: 'Failed to create offerings' });
    } finally {
      client.release();
    }
  }
);

/**
 * PUT /member-offerings/:id
 * Update an offering (Admin only)
 */
router.put(
  '/:id',
  authenticateJWT,
  authorizeRoles(ADMIN_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        name, 
        description, 
        price, 
        period, 
        features, 
        icon, 
        badge,
        badge_color,
        highlighted, 
        is_active, 
        sort_order,
        duration_days,
        image_url,
        use_image_background,
        card_style,
        button_text,
        gradient_color,
        text_color,
        gradient_opacity,
        category,
        total_capacity,
        group_key,
        beach_fee_amount
      } = req.body;

      const { rows: [offering] } = await pool.query(`
        UPDATE member_offerings SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          price = COALESCE($4, price),
          period = COALESCE($5, period),
          features = COALESCE($6, features),
          icon = COALESCE($7, icon),
          badge = $8,
          badge_color = COALESCE($9, badge_color),
          highlighted = COALESCE($10, highlighted),
          is_active = COALESCE($11, is_active),
          sort_order = COALESCE($12, sort_order),
          duration_days = $13,
          image_url = $14,
          use_image_background = COALESCE($15, use_image_background),
          card_style = COALESCE($16, card_style),
          button_text = COALESCE($17, button_text),
          gradient_color = $18,
          text_color = COALESCE($19, text_color),
          gradient_opacity = COALESCE($20, gradient_opacity),
          category = COALESCE($21, category),
          total_capacity = $22,
          group_key = $23,
          -- Beach-fee (commissionable) portion: non-storage offerings are always
          -- fully commissionable (beach = effective price); storage offerings use
          -- the supplied beach portion, keeping the existing value (or 0) if absent.
          beach_fee_amount = CASE
            WHEN COALESCE($21, category) = 'storage'
              THEN COALESCE($24, beach_fee_amount, 0)
            ELSE COALESCE($4, price)
          END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        id, name, description, price, period,
        features ? JSON.stringify(features) : null,
        icon, badge, badge_color, highlighted, is_active, sort_order,
        duration_days, image_url, use_image_background, card_style, button_text, gradient_color, text_color, gradient_opacity,
        category, total_capacity !== undefined ? (total_capacity || null) : null,
        group_key !== undefined ? (group_key || null) : null,
        beach_fee_amount != null ? Number(beach_fee_amount) : null
      ]);

      if (!offering) {
        return res.status(404).json({ error: 'Offering not found' });
      }

      logger.info(`Member offering updated: ${id} by user ${req.user.id}`);
      res.json(offering);
    } catch (error) {
      logger.error('Error updating offering:', error);
      res.status(500).json({ error: 'Failed to update offering' });
    }
  }
);

/**
 * DELETE /member-offerings/:id
 * Soft delete an offering (Admin only)
 */
router.delete('/:id', authenticateJWT, authorizeRoles(ADMIN_ROLES), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: [offering] } = await pool.query(`
      UPDATE member_offerings SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (!offering) {
      return res.status(404).json({ error: 'Offering not found' });
    }

    logger.info(`Member offering deactivated: ${id} by user ${req.user.id}`);
    res.json({ message: 'Offering deactivated', offering });
  } catch (error) {
    logger.error('Error deleting offering:', error);
    res.status(500).json({ error: 'Failed to delete offering' });
  }
});

/**
 * GET /member-offerings/admin/purchases
 * Get all purchases (Admin only)
 */
router.get('/admin/purchases', authenticateJWT, authorizeRoles(ADMIN_ROLES), async (req, res) => {
  try {
    const { status, userId, from, to } = req.query;
    const filters = [];
    const values = [];

    if (status) {
      values.push(status);
      filters.push(`mp.status = $${values.length}`);
    }
    if (userId) {
      values.push(userId);
      filters.push(`mp.user_id = $${values.length}`);
    }
    if (from) {
      values.push(from);
      filters.push(`mp.purchased_at >= $${values.length}::timestamptz`);
    }
    if (to) {
      values.push(to);
      filters.push(`mp.purchased_at <= $${values.length}::timestamptz`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const { rows } = await pool.query(`
      SELECT
        mp.*,
        u.name as user_name,
        u.email as user_email,
        mo.name as current_offering_name,
        mo.category as offering_category,
        mo.period as offering_period,
        CASE
          WHEN mp.status = 'cancelled' THEN 'cancelled'
          WHEN mp.expires_at IS NULL THEN mp.status
          WHEN mp.expires_at < NOW() THEN 'expired'
          ELSE mp.status
        END as computed_status
      FROM member_purchases mp
      JOIN users u ON mp.user_id = u.id
      LEFT JOIN member_offerings mo ON mp.offering_id = mo.id
      ${whereClause}
      ORDER BY mp.purchased_at DESC
    `, values);

    res.json(rows);
  } catch (error) {
    logger.error('Error fetching all purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

/**
 * PUT /member-offerings/admin/purchases/:id
 * Update a purchase (Admin only - for confirming payments, etc.)
 */
router.put(
  '/admin/purchases/:id',
  authenticateJWT,
  authorizeRoles(ADMIN_ROLES),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, payment_status, notes, expires_at } = req.body;

      const { rows: [purchase] } = await pool.query(`
        UPDATE member_purchases SET
          status = COALESCE($2, status),
          payment_status = COALESCE($3, payment_status),
          notes = COALESCE($4, notes),
          expires_at = COALESCE($5, expires_at),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, status, payment_status, notes, expires_at || null]);

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      logger.info(`Member purchase updated: ${id} by admin ${req.user.id}`);
      res.json(purchase);
    } catch (error) {
      logger.error('Error updating purchase:', error);
      res.status(500).json({ error: 'Failed to update purchase' });
    }
  }
);

/**
 * POST /member-offerings/admin/purchases/:id/cancel
 * Admin delete/cancel of a single customer membership with full financial reversal.
 * Soft-cancels (status='cancelled') so history + the linked bank-transfer receipt stay
 * intact, refunds the customer's wallet for exactly what was charged (idempotent,
 * post-a-credit-only — never cancel-the-charge-plus-reversal, which double-undoes), and
 * releases the storage box (cancelled rows fall out of the COUNT(DISTINCT) occupancy
 * predicate). Manager commission, if any pending one exists, is cancelled after commit.
 * Body: { reason?, refundWallet=true }.
 */
router.post('/admin/purchases/:id/cancel', authenticateJWT, authorizeRoles(['admin', 'manager', 'developer', 'owner']), async (req, res) => {
  const { id } = req.params;
  const { reason = null, refundWallet = true } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row-lock the purchase so a concurrent edit/refund/cancel can't race us.
    const { rows: [purchase] } = await client.query(
      `SELECT * FROM member_purchases WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!purchase) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Membership not found' });
    }
    // Already cancelled → idempotent success, refund nothing again.
    if (purchase.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.json({ message: 'Membership already cancelled', purchase, refunded: false, refunds: [], refundAmount: 0, refundCurrency: null });
    }

    // Refund EXACTLY the outstanding wallet charge, per currency. getEntityNetCharges
    // nets the charge against any prior refund (and sums member_purchase_refund rows),
    // so a retried cancel returns nothing and the idempotencyKey makes a duplicate a no-op.
    // No fallback to offering_price: an admin CASH sale debits availableDelta 0, so it
    // correctly refunds nothing (the wallet was never charged).
    const refunds = [];
    if (refundWallet) {
      const netCharges = await getEntityNetCharges({ client, memberPurchaseId: id });
      for (const rc of netCharges) {
        if (!(rc.amount > 0)) continue;
        await recordTransaction({
          client,
          userId: purchase.user_id,
          amount: rc.amount,
          currency: rc.currency,
          transactionType: 'refund',
          direction: 'credit',
          availableDelta: rc.amount,
          description: `Membership cancelled: ${purchase.offering_name}${purchase.storage_unit ? ` (unit #${purchase.storage_unit})` : ''}`,
          createdBy: req.user.id,
          relatedEntityType: 'member_purchase_refund',
          // member_purchases.id is INT; related_entity_id is UUID — keep the id in metadata.
          metadata: { memberPurchaseId: Number(id), offeringId: purchase.offering_id, reason },
          idempotencyKey: `member-purchase-refund:${id}:${rc.currency}`,
          allowNegative: true,
        });
        refunds.push({ currency: rc.currency, amount: rc.amount });
      }
    }

    await client.query(
      `UPDATE member_purchases
          SET status = 'cancelled', payment_status = 'cancelled', updated_at = NOW()
        WHERE id = $1`,
      [id]
    );

    // Resolve any still-pending bank-transfer receipt so a later "Approve" in the
    // pending-payments queue can't resurrect this cancelled membership (and re-consume
    // its storage box). 'rejected' is the same terminal value the reject action uses.
    await client.query(
      `UPDATE bank_transfer_receipts
          SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW(),
              admin_notes = CASE WHEN admin_notes IS NULL THEN 'Membership cancelled by admin'
                                 ELSE admin_notes || ' | Membership cancelled by admin' END
        WHERE member_purchase_id = $1 AND status = 'pending'`,
      [id, req.user.id]
    );

    await client.query('COMMIT');

    // After commit, non-fatal: cancel any PENDING manager commission for this membership
    // (already-paid commissions are immutable history and left alone). Admin-sold
    // memberships never recorded one, so this is usually a no-op.
    cancelCommission('membership', id, reason || 'admin_cancelled').catch(() => {});

    const refundAmount = refunds.reduce((s, r) => s + r.amount, 0);
    logger.info(`Admin cancelled membership ${id} (user ${purchase.user_id}) by ${req.user.id}; refunded=${refunds.length > 0} amount=${refundAmount}`);
    return res.json({
      message: 'Membership cancelled',
      purchase: { ...purchase, status: 'cancelled', payment_status: 'cancelled' },
      refunded: refunds.length > 0,
      refunds,
      refundAmount,
      refundCurrency: refunds[0]?.currency || null,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already settled */ }
    logger.error('Error cancelling membership (admin):', err);
    return res.status(500).json({ error: 'Failed to cancel membership' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /member-offerings/admin/purchases/:id
 * Admin HARD delete of a single customer membership. Same full financial reversal
 * as the cancel endpoint (idempotent wallet refund, storage box released, pending
 * bank-transfer receipt resolved, pending manager commission cancelled) — but the
 * row is then physically removed so the membership disappears from EVERY surface
 * (active list, purchase history, analytics), unlike cancel which keeps a
 * "cancelled" record for the books.
 *
 * Safe because the only FK into member_purchases (bank_transfer_receipts) is
 * ON DELETE SET NULL; refund wallet_transactions reference the id only via metadata.
 * Body: { reason?, refundWallet=true }.
 */
router.delete('/admin/purchases/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'developer', 'owner']), async (req, res) => {
  const { id } = req.params;
  const { reason = null, refundWallet = true } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row-lock the purchase so a concurrent edit/refund/cancel can't race us.
    const { rows: [purchase] } = await client.query(
      `SELECT * FROM member_purchases WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!purchase) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Membership not found' });
    }

    // Refund EXACTLY the outstanding wallet charge, per currency — only if this
    // membership isn't already cancelled (a cancel already refunded). getEntityNetCharges
    // nets the charge against any prior refund, so this is idempotent regardless.
    const refunds = [];
    if (refundWallet && purchase.status !== 'cancelled') {
      const netCharges = await getEntityNetCharges({ client, memberPurchaseId: id });
      for (const rc of netCharges) {
        if (!(rc.amount > 0)) continue;
        await recordTransaction({
          client,
          userId: purchase.user_id,
          amount: rc.amount,
          currency: rc.currency,
          transactionType: 'refund',
          direction: 'credit',
          availableDelta: rc.amount,
          description: `Membership deleted: ${purchase.offering_name}${purchase.storage_unit ? ` (unit #${purchase.storage_unit})` : ''}`,
          createdBy: req.user.id,
          relatedEntityType: 'member_purchase_refund',
          metadata: { memberPurchaseId: Number(id), offeringId: purchase.offering_id, reason },
          idempotencyKey: `member-purchase-refund:${id}:${rc.currency}`,
          allowNegative: true,
        });
        refunds.push({ currency: rc.currency, amount: rc.amount });
      }
    }

    // Resolve any still-pending bank-transfer receipt so it can't be approved later.
    // (The FK is ON DELETE SET NULL, so after the row is gone an Approve couldn't
    // resurrect it anyway, but resolving it keeps the pending queue clean.)
    await client.query(
      `UPDATE bank_transfer_receipts
          SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW(),
              admin_notes = CASE WHEN admin_notes IS NULL THEN 'Membership deleted by admin'
                                 ELSE admin_notes || ' | Membership deleted by admin' END
        WHERE member_purchase_id = $1 AND status = 'pending'`,
      [id, req.user.id]
    );

    // Drop the per-membership manual discount row (keyed by text id, no FK).
    await client.query(
      `DELETE FROM discounts WHERE entity_type = 'member_purchase' AND entity_id = $1`,
      [String(id)]
    );

    // Physically remove the membership.
    await client.query(`DELETE FROM member_purchases WHERE id = $1`, [id]);

    await client.query('COMMIT');

    // After commit, non-fatal: cancel any PENDING manager commission for this membership.
    cancelCommission('membership', id, reason || 'admin_deleted').catch(() => {});

    const refundAmount = refunds.reduce((s, r) => s + r.amount, 0);
    logger.info(`Admin DELETED membership ${id} (user ${purchase.user_id}) by ${req.user.id}; refunded=${refunds.length > 0} amount=${refundAmount}`);
    return res.json({
      message: 'Membership deleted',
      deleted: true,
      refunded: refunds.length > 0,
      refunds,
      refundAmount,
      refundCurrency: refunds[0]?.currency || null,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already settled */ }
    logger.error('Error deleting membership (admin):', err);
    return res.status(500).json({ error: 'Failed to delete membership' });
  } finally {
    client.release();
  }
});

/**
 * POST /member-offerings/admin/purchases
 * Create a purchase for a user (Admin only - for manual/reception purchases)
 */
router.post(
  '/admin/purchases',
  authenticateJWT,
  authorizeRoles(ADMIN_ROLES),
  [
    body('userId').isUUID().withMessage('User ID must be a valid UUID'),
    body('offeringId').isInt().withMessage('Offering ID is required'),
    body('paymentMethod').isIn(['wallet', 'cash', 'card', 'transfer']).withMessage('Invalid payment method'),
    body('startDate').optional().isISO8601().withMessage('Invalid start date'),
    body('endDate').optional().isISO8601().withMessage('Invalid end date'),
    body('storageUnit').optional({ nullable: true }).isInt({ min: 1 }).withMessage('storageUnit must be a positive integer'),
    body('discountPercent').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('discountPercent must be 0-100'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await pool.connect();
    try {
      const { userId, offeringId, paymentMethod, notes, startDate, endDate, storageUnit: requestedUnit, discountPercent } = req.body;

      await client.query('BEGIN');

      // Get the offering
      const { rows: [offering] } = await client.query(`
        SELECT * FROM member_offerings WHERE id = $1
      `, [offeringId]);

      if (!offering) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Offering not found' });
      }

      const isStorage = offering.category === 'storage' && offering.total_capacity != null;

      // A "Daily" offering (duration_days === 1) is billed as a PER-DAY rate: when staff
      // pick an end date the price scales by the inclusive day span (start..end). The whole
      // price scales (beach + storage portions both), so the beach/storage ratio — and thus
      // the manager-commission base — is preserved. Backend is authoritative: it recomputes
      // the span from the dates rather than trusting any client-sent total.
      const baseDate = startDate ? new Date(startDate) : new Date();
      let effectiveDays = offering.duration_days;   // may be null (unlimited)
      let priceMultiplier = 1;
      if (offering.duration_days === 1 && endDate && startDate) {
        // Both dates are YYYY-MM-DD → UTC midnight, so the diff is an exact day multiple.
        const span = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;
        effectiveDays = Math.max(1, span);
        priceMultiplier = effectiveDays;
      }

      // Calculate expiration from baseDate + effectiveDays (matches the prior
      // baseDate + duration_days formula, so a single-day pass is unchanged).
      let expiresAt = null;
      if (effectiveDays) {
        expiresAt = new Date(baseDate);
        expiresAt.setDate(expiresAt.getDate() + effectiveDays);
      }

      // Round to 2dp so the integer-day multiply can't leave float noise on the wallet charge.
      const round2 = (n) => Math.round(n * 100) / 100;
      const effectivePrice = round2(Number(offering.price) * priceMultiplier);
      const effectiveBeachFee = round2(Number(offering.beach_fee_amount ?? offering.price) * priceMultiplier);

      // Resolve the storage box (if any). Staff may PICK a specific box — including an
      // occupied one — to deliberately SHARE it (same storage_unit on each person). If no box
      // is picked we auto-assign the first GLOBALLY-free box (matching the customer route).
      let storageUnit = null;
      if (isStorage) {
        // Serialize concurrent auto-assigns so two requests can't grab the same free box.
        // Xact-scoped (auto-released on COMMIT/ROLLBACK). Deliberate shares are allowed
        // regardless of the lock, so this never blocks sharing.
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('storage_unit_assign'))`);

        // GLOBAL occupied set — identical predicate to available_count + the customer route.
        const { rows: occupied } = await client.query(`
          SELECT DISTINCT mp.storage_unit AS unit
          FROM member_purchases mp
          JOIN member_offerings mo2 ON mo2.id = mp.offering_id
          WHERE mo2.category = 'storage'
            AND mp.status IN ('active', 'pending', 'pending_payment')
            AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
            AND mp.storage_unit IS NOT NULL
        `);
        const usedUnits = new Set(occupied.map(r => Number(r.unit)));
        const occupiedDistinct = usedUnits.size;

        if (requestedUnit != null) {
          // Staff picked a specific box.
          const u = Number(requestedUnit);
          if (!Number.isInteger(u) || u < 1 || u > offering.total_capacity) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Storage box must be between 1 and ${offering.total_capacity}` });
          }
          // Occupied box => deliberate SHARE => allow unconditionally (DISTINCT count is
          // unchanged, so it's fine even at full capacity). A brand-new (free) box consumes a
          // slot, so it still requires capacity.
          if (!usedUnits.has(u) && occupiedDistinct >= offering.total_capacity) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No storage slots available — all units are currently occupied' });
          }
          storageUnit = u;
        } else {
          // Auto-assign the first globally-free box.
          if (occupiedDistinct >= offering.total_capacity) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No storage slots available — all units are currently occupied' });
          }
          for (let u = 1; u <= offering.total_capacity; u++) {
            if (!usedUnits.has(u)) { storageUnit = u; break; }
          }
        }
      }

      const { rows: [purchase] } = await client.query(`
        INSERT INTO member_purchases (
          user_id,
          offering_id,
          offering_name,
          offering_price,
          purchased_at,
          expires_at,
          status,
          payment_method,
          payment_status,
          notes,
          created_by,
          storage_unit,
          beach_fee_amount
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, 'completed', $8, $9, $10, $11)
        RETURNING *
      `, [
        userId,
        offeringId,
        offering.name,
        effectivePrice,
        baseDate,
        expiresAt,
        paymentMethod,
        notes,
        req.user.id,
        storageUnit,
        effectiveBeachFee
      ]);

      await client.query('COMMIT');

      // Mirror the sale into wallet_transactions so it appears in the customer's financial
      // history. Runs on its OWN connection (NOT the transaction above) and AFTER commit, so a
      // wallet-log failure can never roll back / lose the already-committed purchase — keeping
      // the prior non-fatal behavior.
      //   wallet            → one REAL debit (balance moves; staff-gated allowNegative).
      //   cash/card/transfer → a zero-delta charge+payment PAIR (debit membership_charge,
      //     then credit cash_payment/card_payment/bank_transfer_payment) so history shows
      //     both the charge and how it was settled, income counts once via the credit leg,
      //     and the balance never moves — same pattern as bank-transfer receipt approval.
      const discPct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
      const discAmount = discPct > 0 ? computeDiscountAmount(effectivePrice, discPct) : 0;

      try {
        const price = parseFloat(effectivePrice) || 0;
        if (price > 0) {
          const txCurrency = offering.currency || 'EUR';
          const label = `${isStorage ? 'Storage' : 'Membership'} purchase: ${offering.name}${priceMultiplier > 1 ? ` (${effectiveDays} days)` : ''}${storageUnit ? ` (unit #${storageUnit})` : ''}`;
          const txMetadata = {
            offeringId,
            offeringName: offering.name,
            memberPurchaseId: purchase.id,
            category: offering.category,
            storageUnit,
            adminSale: true,
          };
          const baseTx = {
            userId,
            currency: txCurrency,
            paymentMethod,
            createdBy: req.user.id,
            relatedEntityType: 'member_purchase',
            // No relatedEntityId — wallet_transactions.related_entity_id is UUID-typed and
            // member_purchases.id is SERIAL int. Numeric id lives in metadata for lookup.
            metadata: txMetadata,
            allowNegative: true,
          };
          if (paymentMethod === 'wallet') {
            // Wallet payments allow negative because the route is gated to staff and they've
            // already decided this customer should be sold to even with insufficient balance.
            await recordTransaction({
              ...baseTx,
              amount: -price,
              transactionType: 'payment',
              direction: 'debit',
              availableDelta: -price,
              description: label,
            });
          } else {
            // Debit first, then credit — the credit's later timestamp sorts it first in
            // DESC history ("Payment Received" above "Charge"), matching bookings.js.
            // Charge leg at GROSS (finances nets the discounts table off debit totals);
            // payment leg at NET of the staff discount — the cash actually collected.
            const netReceived = Math.max(0, parseFloat((price - discAmount).toFixed(2)));
            await recordTransaction({
              ...baseTx,
              amount: -price,
              transactionType: 'membership_charge',
              direction: 'debit',
              availableDelta: 0,
              description: label,
            });
            if (netReceived > 0) {
              await recordTransaction({
                ...baseTx,
                amount: netReceived,
                transactionType: METHOD_PAYMENT_TX_TYPE[paymentMethod] || 'cash_payment',
                direction: 'credit',
                availableDelta: 0,
                description: `Payment received (${paymentMethod}): ${offering.name}${discAmount > 0 ? ` (net of €${discAmount.toFixed(2)} discount)` : ''}`,
              });
            }
          }
        }
      } catch (txErr) {
        // Non-fatal: the member_purchases row is already committed; if the wallet log fails we
        // surface a warning rather than failing the sale.
        logger.warn('Failed to mirror admin member purchase to wallet_transactions', {
          purchaseId: purchase.id,
          userId,
          offeringId,
          error: txErr.message,
        });
      }

      // Fire-and-forget manager commission for the reception/admin sale. This path
      // historically recorded NOTHING — most memberships are sold here, so the
      // manager was never paid. Base is beach-fee only (storage excluded); pure
      // storage records nothing. Runs after commit, non-fatal.
      recordMembershipCommission({ ...purchase, category: offering.category }).catch(() => {});

      // Staff discount, applied server-side after the wallet mirror (same
      // debit-then-credit ordering the old drawer-driven POST /discounts flow
      // had). Non-wallet ("Paid") sales collected the NET price in person, so
      // skipWalletCredit suppresses the compensating credit — the payment leg
      // above is already net of the discount. Non-fatal, own transaction.
      if (discPct > 0) {
        const discClient = await pool.connect();
        try {
          await discClient.query('BEGIN');
          await applyDiscount(discClient, {
            customerId: userId,
            entityType: 'member_purchase',
            entityId: purchase.id,
            percent: discPct,
            reason: 'Discount applied at membership creation',
            createdBy: req.user.id,
            skipWalletCredit: paymentMethod !== 'wallet',
          });
          await discClient.query('COMMIT');
        } catch (discErr) {
          try { await discClient.query('ROLLBACK'); } catch { /* ignore */ }
          logger.warn('Failed to apply membership creation discount', {
            purchaseId: purchase.id, userId, discPct, error: discErr.message,
          });
        } finally {
          discClient.release();
        }
      }

      logger.info(`Member purchase created by admin: user=${userId}, offering=${offering.name}${storageUnit ? `, unit=#${storageUnit}` : ''}`);
      res.status(201).json(purchase);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* already settled */ }
      logger.error('Error creating admin purchase:', error);
      res.status(500).json({ error: 'Failed to create purchase' });
    } finally {
      client.release();
    }
  }
);

/**
 * GET /member-offerings/user/:userId/purchases
 * Get purchases for a specific user (Admin only - for profile view)
 */
router.get('/user/:userId/purchases', authenticateJWT, authorizeRoles(ADMIN_ROLES), async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate UUID format to prevent DB type errors
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(userId)) {
      return res.json([]);
    }

    const { rows } = await pool.query(`
      SELECT 
        mp.*,
        mo.name as current_offering_name,
        mo.description as current_offering_description,
        mo.icon,
        mo.period
      FROM member_purchases mp
      LEFT JOIN member_offerings mo ON mp.offering_id = mo.id
      WHERE mp.user_id = $1
      ORDER BY mp.purchased_at DESC
    `, [userId]);

    res.json(rows);
  } catch (error) {
    logger.error('Error fetching user purchases:', error);
    res.status(500).json({ error: 'Failed to fetch user purchases' });
  }
});

// ==================================================
// PENDING MEMBERSHIP PAYMENTS (Admin approval workflow)
// ==================================================

/**
 * GET /member-offerings/admin/pending-payments
 * List bank transfer receipts linked to membership purchases
 */
router.get('/admin/pending-payments', authenticateJWT, authorizeRoles(ADMIN_ROLES), async (req, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT r.*,
             u.first_name, u.last_name, u.email,
             mp.offering_name, mp.offering_price, mp.purchased_at as purchase_date,
             mp.status as purchase_status, mp.payment_method,
             mo.description as offering_description, mo.period, mo.duration_days, mo.icon,
             ba.bank_name, ba.iban, ba.currency as bank_currency
      FROM bank_transfer_receipts r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN member_purchases mp ON r.member_purchase_id = mp.id
      LEFT JOIN member_offerings mo ON mp.offering_id = mo.id
      LEFT JOIN wallet_bank_accounts ba ON r.bank_account_id = ba.id
      WHERE r.member_purchase_id IS NOT NULL AND r.status = $1
        AND (mp.status IS NULL OR mp.status <> 'cancelled')
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*)
      FROM bank_transfer_receipts r
      LEFT JOIN member_purchases mp ON r.member_purchase_id = mp.id
      WHERE r.member_purchase_id IS NOT NULL AND r.status = $1
        AND (mp.status IS NULL OR mp.status <> 'cancelled')
    `;

    const [result, countResult] = await Promise.all([
      pool.query(query, [status, limit, offset]),
      pool.query(countQuery, [status])
    ]);

    res.json({
      results: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count, 10),
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      }
    });
  } catch (err) {
    logger.error('Error fetching pending membership payments:', err);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});

/**
 * PATCH /member-offerings/admin/pending-payments/:id/action
 * Approve or reject a membership bank transfer receipt
 */
router.patch('/admin/pending-payments/:id/action', authenticateJWT, authorizeRoles(['admin', 'manager', 'owner']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, reviewerNotes } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    await client.query('BEGIN');

    const receiptRes = await client.query(
      'SELECT * FROM bank_transfer_receipts WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (receiptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = receiptRes.rows[0];

    if (receipt.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Receipt already ${receipt.status}` });
    }

    if (!receipt.member_purchase_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This receipt is not linked to a membership purchase' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Captured for after-commit manager-commission recording (approve path).
    let approvedPurchase = null;

    await client.query(
      `UPDATE bank_transfer_receipts
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
           admin_notes = CASE WHEN admin_notes IS NULL THEN $3 ELSE admin_notes || ' | ' || $3 END,
           updated_at = NOW()
       WHERE id = $4`,
      [newStatus, req.user.id, reviewerNotes || `${action}d by admin`, id]
    );

    const paymentAmount = parseFloat(receipt.amount) || 0;
    const paymentCurrency = receipt.currency || 'EUR';

    if (newStatus === 'approved') {
      // Never resurrect a membership an admin already cancelled/deleted. Lock and check
      // its current status before activating (the receipt alone isn't enough — the
      // membership may have been cancelled while this receipt sat in the queue).
      const mpRes = await client.query(
        `SELECT mp.*, mo.category AS offering_category
           FROM member_purchases mp
           LEFT JOIN member_offerings mo ON mo.id = mp.offering_id
          WHERE mp.id = $1
          FOR UPDATE OF mp`,
        [receipt.member_purchase_id]
      );
      if (mpRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Membership not found' });
      }
      if (mpRes.rows[0].status === 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This membership was cancelled and cannot be reactivated. Create a new membership instead.' });
      }
      approvedPurchase = mpRes.rows[0];

      // Activate the membership
      await client.query(
        `UPDATE member_purchases SET status = 'active', payment_status = 'completed', updated_at = NOW() WHERE id = $1`,
        [receipt.member_purchase_id]
      );

      // Record wallet transactions for audit trail (credit then debit)
      await recordTransaction({
        client,
        userId: receipt.user_id,
        amount: paymentAmount,
        currency: paymentCurrency,
        transactionType: 'deposit',
        direction: 'credit',
        availableDelta: 0,
        description: `Bank transfer received: Membership payment`,
        metadata: { memberPurchaseId: receipt.member_purchase_id, receiptId: receipt.id }
      });

      await recordTransaction({
        client,
        userId: receipt.user_id,
        amount: -paymentAmount,
        currency: paymentCurrency,
        transactionType: 'payment',
        direction: 'debit',
        availableDelta: 0,
        description: `Membership payment applied`,
        metadata: { memberPurchaseId: receipt.member_purchase_id, receiptId: receipt.id }
      });

      // Send notification
      try {
        await dispatchNotification({
          userId: receipt.user_id,
          type: 'payment',
          title: 'Membership Activated!',
          message: 'Your bank transfer has been approved and your membership is now active.',
          data: { memberPurchaseId: receipt.member_purchase_id },
          client
        });
      } catch { /* ignore notification errors */ }

    } else {
      // Reject: cancel the membership
      await client.query(
        `UPDATE member_purchases SET status = 'cancelled', payment_status = 'failed', notes = CONCAT(COALESCE(notes, ''), ' | Payment Rejected'), updated_at = NOW() WHERE id = $1`,
        [receipt.member_purchase_id]
      );

      cancelCommission('membership', receipt.member_purchase_id, 'payment_rejected').catch(() => {});

      try {
        await dispatchNotification({
          userId: receipt.user_id,
          type: 'payment',
          title: 'Payment Rejected',
          message: 'Your bank transfer for the membership was rejected. Please contact support for details.',
          data: { memberPurchaseId: receipt.member_purchase_id },
          client
        });
      } catch { /* ignore notification errors */ }
    }

    await client.query('COMMIT');

    // Fire-and-forget manager commission once a bank-transfer membership is
    // approved/activated (previously this path recorded none). Base is beach-fee
    // only; pure storage records nothing. recordMembershipCommission de-dupes, so a
    // re-approval can't double-record.
    if (newStatus === 'approved' && approvedPurchase) {
      recordMembershipCommission({ ...approvedPurchase, category: approvedPurchase.offering_category }).catch(() => {});
    }

    // Emit real-time event
    req.socketService?.emitToChannel('dashboard', 'pending-membership-payment:updated', {
      receiptId: id,
      action: newStatus,
      memberPurchaseId: receipt.member_purchase_id,
    });

    res.json({ success: true, message: `Membership payment ${newStatus} successfully` });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Error processing membership payment action:', err);
    res.status(500).json({ error: 'Failed to process action' });
  } finally {
    client.release();
  }
});

export default router;
