// backend/routes/memberOfferings.js
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { getBalance, recordTransaction } from '../services/walletService.js';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';
import CurrencyService from '../services/currencyService.js';

const router = Router();

const ADMIN_ROLES = ['admin', 'manager', 'developer', 'front_desk'];

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

      // Storage capacity check
      if (offering.category === 'storage' && offering.total_capacity != null) {
        const { rows: [{ cnt }] } = await client.query(`
          SELECT COUNT(*)::int AS cnt FROM member_purchases
          WHERE offering_id = $1 AND status IN ('active', 'pending')
            AND (expires_at IS NULL OR expires_at > NOW())
        `, [offeringId]);

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
      if (paymentMethod === 'wallet') {
        // Use wallet service to ensure compatibility with wallet_balances table
        // Assume default currency is EUR for now
        const currency = 'EUR';
        const price = parseFloat(offering.price);

        const walletBalance = await getBalance(userId, currency);
        
        if (walletBalance.available < price) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: 'Insufficient wallet balance',
            required: price,
            available: walletBalance.available
          });
        }

        // Deduct from wallet using service
        await recordTransaction({
          client, // Pass the existing transaction client
          userId,
          amount: price,
          currency,
          transactionType: 'payment',
          direction: 'debit',
          availableDelta: -price, // Explicitly reduce availability
          description: `Purchase: ${offering.name}`,
          metadata: {
            offeringId,
            offeringName: offering.name
          }
        });
      } else if (paymentMethod === 'cash' || paymentMethod === 'pay_later') {
        // For cash/pay_later payments, create negative balance (pay at center)
        // This allows the customer to owe money that they'll pay in person
        const currency = 'EUR';
        const price = parseFloat(offering.price);
        
        await recordTransaction({
          client, // Pass the existing transaction client
          userId,
          amount: price,
          currency,
          transactionType: 'payment',
          direction: 'debit',
          availableDelta: -price, // Create negative balance
          description: `Purchase (Pay at Center): ${offering.name}`,
          metadata: {
            offeringId,
            offeringName: offering.name,
            paymentPending: true
          },
          allowNegative: true // Allow negative balance for pay at center
        });
        
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
          storage_unit
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        storageUnit
      ]);

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

      // Fire-and-forget manager commission for completed membership purchases
      if (paymentStatus === 'completed') {
        try {
          const { recordMembershipCommission } = await import('../services/managerCommissionService.js');
          recordMembershipCommission(purchase).catch(() => {});
        } catch {
          // ignore
        }
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
        total_capacity
      } = req.body;

      const { rows: [offering] } = await pool.query(`
        INSERT INTO member_offerings (
          name, description, price, period, features, icon, 
          badge, badge_color, highlighted, is_active, sort_order, duration_days, 
          image_url, use_image_background, card_style, button_text, gradient_color, text_color, gradient_opacity,
          category, total_capacity
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *
      `, [
        name, description, price, period, JSON.stringify(features), icon,
        badge, badge_color, highlighted, is_active, sort_order, duration_days, 
        image_url, use_image_background ?? true, card_style, button_text, gradient_color, text_color, gradient_opacity,
        category, total_capacity || null
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

        const { rows: [offering] } = await client.query(`
          INSERT INTO member_offerings (
            name, description, price, period, features, icon,
            badge, badge_color, highlighted, is_active, sort_order, duration_days,
            image_url, card_style, button_text, category, total_capacity
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, 'simple', 'Choose Plan', $13, $14)
          RETURNING *
        `, [
          tierName, description, tier.price, period,
          JSON.stringify(features), icon, badge, tierColor,
          highlighted, i, tier.duration_days, image_url,
          category, total_capacity || null
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
        total_capacity
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
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        id, name, description, price, period, 
        features ? JSON.stringify(features) : null, 
        icon, badge, badge_color, highlighted, is_active, sort_order, 
        duration_days, image_url, use_image_background, card_style, button_text, gradient_color, text_color, gradient_opacity,
        category, total_capacity !== undefined ? (total_capacity || null) : null
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
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId, offeringId, paymentMethod, notes, startDate } = req.body;

      // Get the offering
      const { rows: [offering] } = await pool.query(`
        SELECT * FROM member_offerings WHERE id = $1
      `, [offeringId]);

      if (!offering) {
        return res.status(404).json({ error: 'Offering not found' });
      }

      // Storage capacity check
      if (offering.category === 'storage' && offering.total_capacity != null) {
        const { rows: [{ cnt }] } = await pool.query(`
          SELECT COUNT(*)::int AS cnt FROM member_purchases
          WHERE offering_id = $1 AND status IN ('active', 'pending')
            AND (expires_at IS NULL OR expires_at > NOW())
        `, [offeringId]);

        if (cnt >= offering.total_capacity) {
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

      // Assign storage unit number for storage offerings
      let storageUnit = null;
      if (offering.category === 'storage' && offering.total_capacity) {
        const { rows: occupied } = await pool.query(`
          SELECT storage_unit FROM member_purchases
          WHERE offering_id = $1 AND status IN ('active', 'pending', 'pending_payment')
            AND (expires_at IS NULL OR expires_at > NOW())
            AND storage_unit IS NOT NULL
          ORDER BY storage_unit
        `, [offeringId]);
        const usedUnits = new Set(occupied.map(r => r.storage_unit));
        for (let u = 1; u <= offering.total_capacity; u++) {
          if (!usedUnits.has(u)) { storageUnit = u; break; }
        }
      }

      const { rows: [purchase] } = await pool.query(`
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
          storage_unit
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, 'completed', $8, $9, $10)
        RETURNING *
      `, [
        userId,
        offeringId,
        offering.name,
        offering.price,
        baseDate,
        expiresAt,
        paymentMethod,
        notes,
        req.user.id,
        storageUnit
      ]);

      logger.info(`Member purchase created by admin: user=${userId}, offering=${offering.name}`);
      res.status(201).json(purchase);
    } catch (error) {
      logger.error('Error creating admin purchase:', error);
      res.status(500).json({ error: 'Failed to create purchase' });
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
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) FROM bank_transfer_receipts
      WHERE member_purchase_id IS NOT NULL AND status = $1
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
        amount: paymentAmount,
        currency: paymentCurrency,
        transactionType: 'payment',
        direction: 'debit',
        availableDelta: 0,
        description: `Membership payment applied`,
        metadata: { memberPurchaseId: receipt.member_purchase_id, receiptId: receipt.id }
      });

      // Send notification
      try {
        await client.query(`
          INSERT INTO notifications (user_id, type, title, message, data)
          VALUES ($1, 'payment', 'Membership Activated!', $2, $3)
        `, [
          receipt.user_id,
          'Your bank transfer has been approved and your membership is now active.',
          JSON.stringify({ memberPurchaseId: receipt.member_purchase_id })
        ]);
      } catch { /* ignore notification errors */ }

    } else {
      // Reject: cancel the membership
      await client.query(
        `UPDATE member_purchases SET status = 'cancelled', payment_status = 'failed', notes = CONCAT(COALESCE(notes, ''), ' | Payment Rejected'), updated_at = NOW() WHERE id = $1`,
        [receipt.member_purchase_id]
      );

      try {
        await client.query(`
          INSERT INTO notifications (user_id, type, title, message, data)
          VALUES ($1, 'payment', 'Payment Rejected', $2, $3)
        `, [
          receipt.user_id,
          'Your bank transfer for the membership was rejected. Please contact support for details.',
          JSON.stringify({ memberPurchaseId: receipt.member_purchase_id })
        ]);
      } catch { /* ignore notification errors */ }
    }

    await client.query('COMMIT');

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
