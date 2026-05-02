// Per-customer manual percentage discount routes.
//
//   GET    /api/discounts?customer_id=<uuid>            - all discounts for a customer
//   POST   /api/discounts                                - apply a single discount (UPSERT)
//   POST   /api/discounts/bulk                           - apply same percent to multiple items
//   DELETE /api/discounts/:id                            - remove one discount
//
// Authorization: admin and manager roles only. Frontline staff who manage
// customer profiles already have one of these roles.

import { Router } from 'express';
import { pool } from '../db.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  applyDiscount,
  listDiscountsForCustomer,
  deleteDiscount,
  SUPPORTED_ENTITY_TYPES,
} from '../services/discountService.js';

const router = Router();

const STAFF_ROLES = ['admin', 'manager'];

// GET /api/discounts?customer_id=<uuid>
router.get('/', authorizeRoles(STAFF_ROLES), async (req, res) => {
  const customerId = req.query.customer_id;
  if (!customerId) {
    return res.status(400).json({ error: 'customer_id query param is required' });
  }
  try {
    const rows = await listDiscountsForCustomer(pool, customerId);
    res.json({ discounts: rows });
  } catch (err) {
    logger.error('Failed to list discounts', { error: err.message, customerId });
    res.status(500).json({ error: 'Failed to load discounts' });
  }
});

// POST /api/discounts  { customer_id, entity_type, entity_id, percent, reason? }
router.post('/', authorizeRoles(STAFF_ROLES), async (req, res) => {
  const { customer_id, entity_type, entity_id, percent, reason } = req.body || {};
  if (!customer_id || !entity_type || entity_id == null || percent == null) {
    return res.status(400).json({ error: 'customer_id, entity_type, entity_id, percent are required' });
  }
  if (!SUPPORTED_ENTITY_TYPES.includes(entity_type)) {
    return res.status(400).json({ error: `Unsupported entity_type. Must be one of: ${SUPPORTED_ENTITY_TYPES.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await applyDiscount(client, {
      customerId: customer_id,
      entityType: entity_type,
      entityId: entity_id,
      percent,
      reason,
      createdBy: req.user?.id || null,
    });
    await client.query('COMMIT');
    logger.info('Discount applied', {
      customerId: customer_id,
      entityType: entity_type,
      entityId: entity_id,
      percent,
      by: req.user?.id,
    });
    res.json({ discount: result.discount || null, deleted: !!result.deleted });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    if (status >= 500) logger.error('Failed to apply discount', { error: err.message });
    res.status(status).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/discounts/bulk  { customer_id, percent, items: [{entity_type, entity_id}], reason? }
router.post('/bulk', authorizeRoles(STAFF_ROLES), async (req, res) => {
  const { customer_id, percent, items, reason } = req.body || {};
  if (!customer_id || percent == null || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'customer_id, percent, items[] are required' });
  }
  for (const it of items) {
    if (!it.entity_type || it.entity_id == null) {
      return res.status(400).json({ error: 'each item needs entity_type and entity_id' });
    }
    if (!SUPPORTED_ENTITY_TYPES.includes(it.entity_type)) {
      return res.status(400).json({ error: `Unsupported entity_type: ${it.entity_type}` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const applied = [];
    const skipped = [];
    for (const it of items) {
      try {
        const result = await applyDiscount(client, {
          customerId: customer_id,
          entityType: it.entity_type,
          entityId: it.entity_id,
          percent,
          reason,
          createdBy: req.user?.id || null,
        });
        if (result.discount) applied.push(result.discount);
        else if (result.deleted) skipped.push({ ...it, reason: 'percent=0, removed existing' });
      } catch (err) {
        // One bad item shouldn't sink the whole batch — record and move on.
        skipped.push({ ...it, error: err.message });
      }
    }
    await client.query('COMMIT');
    logger.info('Discount bulk apply', {
      customerId: customer_id,
      percent,
      appliedCount: applied.length,
      skippedCount: skipped.length,
      by: req.user?.id,
    });
    res.json({ applied, skipped });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed bulk discount', { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/discounts/:id
router.delete('/:id', authorizeRoles(STAFF_ROLES), async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await deleteDiscount(client, id, { createdBy: req.user?.id || null });
    if (!removed) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Discount not found' });
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to delete discount', { error: err.message, id });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
