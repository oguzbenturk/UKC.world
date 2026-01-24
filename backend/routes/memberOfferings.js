// backend/routes/memberOfferings.js
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { getBalance, recordTransaction } from '../services/walletService.js';

const router = Router();

const ADMIN_ROLES = ['admin', 'manager', 'developer', 'front_desk'];

// ==================================================
// PUBLIC ROUTES (Authenticated users)
// ==================================================

/**
 * GET /member-offerings
 * Get all active offerings (for all authenticated users)
 */
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id,
        name,
        description,
        price,
        period,
        features,
        icon,
        badge,
        badge_color,
        highlighted,
        duration_days,
        image_url,
        use_image_background,
        card_style,
        button_text,
        gradient_color,
        text_color,
        gradient_opacity
      FROM member_offerings
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id ASC
    `);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching member offerings:', error);
    res.status(500).json({ error: 'Failed to fetch offerings' });
  }
});

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
    body('paymentMethod').isIn(['wallet', 'cash', 'card', 'transfer']).withMessage('Invalid payment method'),
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
      const { paymentMethod } = req.body;

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

      // Calculate expiration date
      let expiresAt = null;
      if (offering.duration_days) {
        expiresAt = new Date();
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
      } else {
        // For cash/card/transfer payments, set as pending until admin confirms
        paymentStatus = paymentMethod === 'cash' ? 'pending' : 'pending';
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
          payment_status
        )
        VALUES ($1, $2, $3, $4, NOW(), $5, 'active', $6, $7)
        RETURNING *
      `, [
        userId,
        offeringId,
        offering.name,
        offering.price,
        expiresAt,
        paymentMethod,
        paymentStatus
      ]);

      await client.query('COMMIT');

      logger.info(`Member purchase created: user=${userId}, offering=${offering.name}, method=${paymentMethod}`);

      res.status(201).json({
        message: paymentStatus === 'completed' 
          ? 'Purchase successful!' 
          : 'Purchase recorded. Please complete payment at reception.',
        purchase,
        paymentStatus
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
      SELECT * FROM member_offerings
      ORDER BY sort_order ASC, id ASC
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
        gradient_opacity = 70
      } = req.body;

      const { rows: [offering] } = await pool.query(`
        INSERT INTO member_offerings (
          name, description, price, period, features, icon, 
          badge, badge_color, highlighted, is_active, sort_order, duration_days, 
          image_url, use_image_background, card_style, button_text, gradient_color, text_color, gradient_opacity
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `, [
        name, description, price, period, JSON.stringify(features), icon,
        badge, badge_color, highlighted, is_active, sort_order, duration_days, 
        image_url, use_image_background ?? true, card_style, button_text, gradient_color, text_color, gradient_opacity
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
        gradient_opacity
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
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        id, name, description, price, period, 
        features ? JSON.stringify(features) : null, 
        icon, badge, badge_color, highlighted, is_active, sort_order, 
        duration_days, image_url, use_image_background, card_style, button_text, gradient_color, text_color, gradient_opacity
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
        mo.name as current_offering_name
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
      const { status, payment_status, notes } = req.body;

      const { rows: [purchase] } = await pool.query(`
        UPDATE member_purchases SET
          status = COALESCE($2, status),
          payment_status = COALESCE($3, payment_status),
          notes = COALESCE($4, notes),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, status, payment_status, notes]);

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
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId, offeringId, paymentMethod, notes } = req.body;

      // Get the offering
      const { rows: [offering] } = await pool.query(`
        SELECT * FROM member_offerings WHERE id = $1
      `, [offeringId]);

      if (!offering) {
        return res.status(404).json({ error: 'Offering not found' });
      }

      // Calculate expiration date
      let expiresAt = null;
      if (offering.duration_days) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + offering.duration_days);
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
          created_by
        )
        VALUES ($1, $2, $3, $4, NOW(), $5, 'active', $6, 'completed', $7, $8)
        RETURNING *
      `, [
        userId,
        offeringId,
        offering.name,
        offering.price,
        expiresAt,
        paymentMethod,
        notes,
        req.user.id
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

export default router;
