import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';

const router = express.Router();

// Simple helper to map DB row to API shape
const mapRow = (r) => ({
  id: r.id,
  partName: r.part_name,
  quantity: r.quantity,
  supplier: r.supplier,
  status: r.status,
  notes: r.notes,
  createdBy: r.created_by,
  orderedAt: r.ordered_at,
  receivedAt: r.received_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// GET /api/spare-parts
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const { status, q } = req.query;
    const clauses = [];
    const params = [];
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
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
    console.error('SpareParts GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch orders', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// POST /api/spare-parts
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const { partName, quantity, supplier, status = 'pending', notes } = req.body || {};
    if (!partName || !quantity) {
      return res.status(400).json({ error: 'partName and quantity are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO spare_parts_orders (part_name, quantity, supplier, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [partName, Number(quantity), supplier || null, status, notes || null, req.user?.id || null]
    );
    res.status(201).json(mapRow(rows[0]));
  } catch (err) {
    console.error('SpareParts POST error:', err.message);
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

    const { partName, quantity, supplier, status, notes, orderedAt, receivedAt } = req.body || {};
    if (partName !== undefined) push('part_name', partName);
    if (quantity !== undefined) push('quantity', Number(quantity));
    if (supplier !== undefined) push('supplier', supplier);
    if (status !== undefined) push('status', status);
    if (notes !== undefined) push('notes', notes);
    if (orderedAt !== undefined) push('ordered_at', orderedAt ? new Date(orderedAt) : null);
    if (receivedAt !== undefined) push('received_at', receivedAt ? new Date(receivedAt) : null);

    if (!fields.length) return res.status(400).json({ error: 'No valid fields to update' });
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE spare_parts_orders SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapRow(rows[0]));
  } catch (err) {
    console.error('SpareParts PATCH error:', err.message);
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
    console.error('SpareParts DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete order', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

export default router;
