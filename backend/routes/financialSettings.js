import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { getActiveSettings, listOverrides, resolveSettings } from '../services/financialSettingsService.js';

const router = express.Router();

// GET /api/finance-settings/active
router.get('/active', authenticateJWT, authorizeRoles(['admin', 'manager']), async (_req, res) => {
  try {
    const settings = await getActiveSettings();
    res.json({ success: true, settings });
  } catch (err) {
    logger.error('Failed to load active settings', err);
    res.status(500).json({ success: false, error: 'Failed to load active settings' });
  }
});

// GET /api/finance-settings/overrides
router.get('/overrides', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { scope_type, scope_value, settings_id, active } = req.query;
    const rows = await listOverrides({
      scope_type,
      scope_value,
      settings_id: settings_id ? Number(settings_id) : undefined,
      active: typeof active === 'string' ? active === 'true' : undefined
    });
    res.json({ success: true, overrides: rows });
  } catch (err) {
    logger.error('Failed to list overrides', err);
    res.status(500).json({ success: false, error: 'Failed to list overrides' });
  }
});

// POST /api/finance-settings
router.post('/', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { tax_rate_pct, insurance_rate_pct, equipment_rate_pct, payment_method_fees, effective_from, active } = req.body;
    await client.query('BEGIN');
    if (active === true) {
      await client.query('UPDATE financial_settings SET active = FALSE WHERE active = TRUE');
    }
    const { rows } = await client.query(
      `INSERT INTO financial_settings (
        tax_rate_pct, insurance_rate_pct, equipment_rate_pct, payment_method_fees, effective_from, active, created_by
      ) VALUES ($1,$2,$3,$4, COALESCE($5, NOW()), COALESCE($6, TRUE), $7) RETURNING *`,
      [tax_rate_pct ?? 0, insurance_rate_pct ?? 0, equipment_rate_pct ?? 0, payment_method_fees || {}, effective_from || null, active ?? true, req.user?.id || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, settings: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to create financial settings', err);
    res.status(500).json({ success: false, error: 'Failed to create settings' });
  } finally {
    client.release();
  }
});

// PATCH /api/finance-settings/:id
router.patch('/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const { tax_rate_pct, insurance_rate_pct, equipment_rate_pct, payment_method_fees, active, effective_to } = req.body;
    await client.query('BEGIN');
    if (active === true) {
      await client.query('UPDATE financial_settings SET active = FALSE WHERE active = TRUE AND id <> $1', [id]);
    }
    const fields = [];
    const params = [];
    let i = 1;
    if (tax_rate_pct != null) { fields.push(`tax_rate_pct = $${i++}`); params.push(tax_rate_pct); }
    if (insurance_rate_pct != null) { fields.push(`insurance_rate_pct = $${i++}`); params.push(insurance_rate_pct); }
    if (equipment_rate_pct != null) { fields.push(`equipment_rate_pct = $${i++}`); params.push(equipment_rate_pct); }
    if (payment_method_fees != null) { fields.push(`payment_method_fees = $${i++}`); params.push(payment_method_fees); }
    if (typeof active === 'boolean') { fields.push(`active = $${i++}`); params.push(active); }
    if (effective_to != null) { fields.push(`effective_to = $${i++}`); params.push(effective_to); }
    fields.push(`updated_at = NOW()`);
    params.push(id);
    const { rows } = await client.query(
      `UPDATE financial_settings SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    await client.query('COMMIT');
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, settings: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to update financial settings', err);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  } finally {
    client.release();
  }
});

// POST /api/finance-settings/:id/overrides
router.post('/:id/overrides', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const { scope_type, scope_value, fields, precedence = 0, active = true } = req.body;
    if (!scope_type || !scope_value || !fields) {
      return res.status(400).json({ success: false, error: 'scope_type, scope_value, fields are required' });
    }
    const { rows } = await client.query(
      `INSERT INTO financial_settings_overrides (settings_id, scope_type, scope_value, fields, precedence, active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, scope_type, scope_value, fields, precedence, active, req.user?.id || null]
    );
    res.status(201).json({ success: true, override: rows[0] });
  } catch (err) {
    logger.error('Failed to create override', err);
    res.status(500).json({ success: false, error: 'Failed to create override' });
  } finally {
    client.release();
  }
});

// PATCH /api/finance-settings/overrides/:overrideId
router.patch('/overrides/:overrideId', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const overrideId = Number(req.params.overrideId);
    const { fields, precedence, active } = req.body;
    const sets = [];
    const params = [];
    let i = 1;
    if (fields != null) { sets.push(`fields = $${i++}`); params.push(fields); }
    if (precedence != null) { sets.push(`precedence = $${i++}`); params.push(precedence); }
    if (typeof active === 'boolean') { sets.push(`active = $${i++}`); params.push(active); }
    sets.push('updated_at = NOW()');
    params.push(overrideId);
    const { rows } = await client.query(
      `UPDATE financial_settings_overrides SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, override: rows[0] });
  } catch (err) {
    logger.error('Failed to update override', err);
    res.status(500).json({ success: false, error: 'Failed to update override' });
  } finally {
    client.release();
  }
});

// GET /api/finance-settings/preview?serviceType=&serviceId=&categoryId=&paymentMethod=
router.get('/preview', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { serviceType, serviceId, categoryId, paymentMethod } = req.query;
    const context = {
      serviceType: serviceType || undefined,
      serviceId: serviceId ? Number(serviceId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      paymentMethod: paymentMethod || undefined
    };
    const settings = await resolveSettings(context);
    if (!settings) return res.status(404).json({ success: false, error: 'No active settings' });
    res.json({ success: true, context, resolved: settings });
  } catch (err) {
    logger.error('Failed to preview resolved settings', err);
    res.status(500).json({ success: false, error: 'Failed to preview settings' });
  }
});

export default router;
