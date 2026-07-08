import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// Simple helper to map DB row to API shape
const mapRow = (r) => ({
  id: r.id,
  partName: r.part_name,
  quantity: r.quantity,
  supplier: r.supplier,
  status: r.status,
  notes: r.notes,
  paymentStatus: r.payment_status,
  costAmount: r.cost_amount === null || r.cost_amount === undefined ? null : Number(r.cost_amount),
  currency: r.currency,
  paidAt: r.paid_at,
  createdBy: r.created_by,
  orderedAt: r.ordered_at,
  receivedAt: r.received_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// GET /api/spare-parts
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const { status, paymentStatus, q } = req.query;
    const clauses = [];
    const params = [];
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      clauses.push(`payment_status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(part_name ILIKE $${params.length} OR supplier ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM spare_parts_orders ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    logger.error('SpareParts GET error:', err);
    res.status(500).json({ error: 'Failed to fetch orders', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// POST /api/spare-parts
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const {
      partName, quantity, supplier, status = 'pending', notes,
      paymentStatus = 'unpaid', costAmount, currency = 'EUR'
    } = req.body || {};
    if (!partName || !quantity) {
      return res.status(400).json({ error: 'partName and quantity are required' });
    }
    const cost = costAmount === undefined || costAmount === null || costAmount === '' ? null : Number(costAmount);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      return res.status(400).json({ error: 'costAmount must be a non-negative number' });
    }
    const paidAt = paymentStatus === 'paid' ? new Date() : null;
    const { rows } = await pool.query(
      `INSERT INTO spare_parts_orders
         (part_name, quantity, supplier, status, notes, payment_status, cost_amount, currency, paid_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [partName, Number(quantity), supplier || null, status, notes || null,
       paymentStatus, cost, currency || 'EUR', paidAt, req.user?.id || null]
    );
    res.status(201).json(mapRow(rows[0]));
  } catch (err) {
    logger.error('SpareParts POST error:', err);
    res.status(500).json({ error: 'Failed to create order', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// PATCH /api/spare-parts/:id
router.patch('/:id', authenticateJWT, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const fields = [];
    const params = [];
    const push = (col, val) => { params.push(val); fields.push(`${col} = $${params.length}`); };

    const {
      partName, quantity, supplier, status, notes, orderedAt, receivedAt,
      paymentStatus, costAmount, currency, paidAt
    } = req.body || {};
    if (partName !== undefined) push('part_name', partName);
    if (quantity !== undefined) push('quantity', Number(quantity));
    if (supplier !== undefined) push('supplier', supplier);
    if (status !== undefined) push('status', status);
    if (notes !== undefined) push('notes', notes);
    if (orderedAt !== undefined) push('ordered_at', orderedAt ? new Date(orderedAt) : null);
    if (receivedAt !== undefined) push('received_at', receivedAt ? new Date(receivedAt) : null);
    if (costAmount !== undefined) {
      const cost = costAmount === null || costAmount === '' ? null : Number(costAmount);
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
        return res.status(400).json({ error: 'costAmount must be a non-negative number' });
      }
      push('cost_amount', cost);
    }
    if (currency !== undefined) push('currency', currency || 'EUR');
    if (paymentStatus !== undefined) {
      push('payment_status', paymentStatus);
      // Keep paid_at in sync with the toggle unless the caller sets it explicitly.
      if (paidAt === undefined) push('paid_at', paymentStatus === 'paid' ? new Date() : null);
    }
    if (paidAt !== undefined) push('paid_at', paidAt ? new Date(paidAt) : null);

    if (!fields.length) return res.status(400).json({ error: 'No valid fields to update' });
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE spare_parts_orders SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapRow(rows[0]));
  } catch (err) {
    logger.error('SpareParts PATCH error:', err);
    res.status(500).json({ error: 'Failed to update order', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// DELETE /api/spare-parts/:id
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { rowCount } = await pool.query('DELETE FROM spare_parts_orders WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('SpareParts DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete order', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

export default router;
