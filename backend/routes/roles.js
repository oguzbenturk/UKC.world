import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';

const router = express.Router();

// Helpers
const parsePermissions = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
};

const PROTECTED_ROLE_NAMES = new Set([
  'super_admin',
  'admin',
  'manager',
  'instructor',
  'student',
  'customer',
  'freelancer'
]);

// List roles with assignment counts
router.get('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (_req, res) => {
  try {
    const sql = `
      SELECT r.id, r.name, r.description, r.permissions, r.created_at, r.updated_at,
             COUNT(u.id)::int AS user_count
      FROM roles r
      LEFT JOIN users u ON u.role_id = r.id
      GROUP BY r.id
      ORDER BY r.name ASC`;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list roles', details: err.message });
  }
});

// Get role by id
router.get('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, description, permissions, created_at, updated_at FROM roles WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Role not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch role', details: err.message });
  }
});

// Create a new role
router.post('/', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { name, description = '', permissions } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Ensure unique name
    const exists = await pool.query('SELECT 1 FROM roles WHERE lower(name) = lower($1)', [name.trim()]);
    if (exists.rowCount > 0) return res.status(409).json({ error: 'Role name already exists' });

    const perms = parsePermissions(permissions);
    const insert = await pool.query(
      `INSERT INTO roles (name, description, permissions, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, name, description, permissions, created_at, updated_at`,
      [name.trim(), description, perms]
    );
    res.status(201).json(insert.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create role', details: err.message });
  }
});

// Update role
router.patch('/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { name, description, permissions } = req.body || {};

    // Fetch current
    const current = await pool.query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Role not found' });
    const role = current.rows[0];

    // If renaming, ensure unique and not protected rename conflict check only for duplicates
    if (name && name.trim().toLowerCase() !== role.name?.toLowerCase()) {
      const exists = await pool.query('SELECT 1 FROM roles WHERE lower(name) = lower($1)', [name.trim()]);
      if (exists.rowCount > 0) return res.status(409).json({ error: 'Role name already exists' });
    }

    const newName = name?.trim() || role.name;
    const newDesc = description !== undefined ? description : role.description;
    const newPerms = permissions !== undefined ? parsePermissions(permissions) : role.permissions;

    const update = await pool.query(
      `UPDATE roles SET name = $1, description = $2, permissions = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, description, permissions, created_at, updated_at`,
      [newName, newDesc, newPerms, req.params.id]
    );
    res.json(update.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role', details: err.message });
  }
});

// Delete role (only when not assigned and not protected)
router.delete('/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const roleRes = await pool.query('SELECT id, name FROM roles WHERE id = $1', [req.params.id]);
    if (!roleRes.rows.length) return res.status(404).json({ error: 'Role not found' });
    const { name } = roleRes.rows[0];
    if (name && PROTECTED_ROLE_NAMES.has(name)) {
      return res.status(400).json({ error: `Protected role '${name}' cannot be deleted` });
    }

    const countRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM users WHERE role_id = $1', [req.params.id]);
    if ((countRes.rows[0]?.cnt || 0) > 0) {
      return res.status(400).json({ error: 'Cannot delete a role that is assigned to users' });
    }

    await pool.query('DELETE FROM roles WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete role', details: err.message });
  }
});

// Assign role to user (alt to existing users route)
router.patch('/:id/assign', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    // Verify role
    const roleRes = await pool.query('SELECT id, name FROM roles WHERE id = $1', [req.params.id]);
    if (!roleRes.rows.length) return res.status(404).json({ error: 'Role not found' });

    // Verify user
    const userRes = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });

    const upd = await pool.query(
      'UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, role_id',
      [req.params.id, user_id]
    );
    res.json({ message: 'Role assigned', user: upd.rows[0], role: roleRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign role', details: err.message });
  }
});

export default router;
