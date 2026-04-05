import express from 'express';
import { pool } from '../db.js';
import { ROLE_IDS } from '../constants/roles.js';

export function generateRoleRouter(roleName) {
  const roleId = ROLE_IDS[roleName];
  if (!roleId) throw new Error(`Invalid role name: ${roleName}`);
  const router = express.Router();

  // === CREATE ===
  router.post('/', async (req, res) => {
    const { name, email, phone, level, notes = '' } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, phone, level, notes, role_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
        [name, email, phone, level, notes, roleId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('Insert failed:', err);
      res.status(500).json({ error: 'Insert failed' });
    }
  });

  // === READ ALL ===
  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT u.*, r.name AS role_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE r.id = $1
        ORDER BY u.created_at DESC
      `, [roleId]);
      res.json(rows);
    } catch (err) {
      console.error('Query failed:', err);
      res.status(500).json({ error: 'Query failed' });
    }
  });

  // === READ ONE ===
  router.get('/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT u.*, r.name AS role_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND r.id = $2
      `, [req.params.id, roleId]);

      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('Query failed:', err);
      res.status(500).json({ error: 'Query failed' });
    }
  });

  // === UPDATE ===
  router.put('/:id', async (req, res) => {
    const { name, email, phone, level, notes } = req.body;

    try {
      const { rows } = await pool.query(`
        UPDATE users SET
          name = $1,
          email = $2,
          phone = $3,
          level = $4,
          notes = $5,
          updated_at = NOW()
        WHERE id = $6 AND role_id = $7
        RETURNING *`,
        [name, email, phone, level, notes, req.params.id, roleId]
      );

      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('Update failed:', err);
      res.status(500).json({ error: 'Update failed' });
    }
  });

  // === DELETE ===
  router.delete('/:id', async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM users WHERE id = $1 AND role_id = $2`,
        [req.params.id, roleId]
      );

      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      res.status(204).send();
    } catch (err) {
      console.error('Delete failed:', err);
      res.status(500).json({ error: 'Delete failed' });
    }
  });

  return router;
}

/*
import express from 'express';
import { generateRoleRouter } from '../utils/generateRoleRouter.js';

const router = express.Router();

// Roller için otomatik router oluştur
router.use('/admins', generateRoleRouter('admin'));
router.use('/managers', generateRoleRouter('manager'));
router.use('/instructors', generateRoleRouter('instructor'));
router.use('/freelancers', generateRoleRouter('freelancer'));
// students ayrı router olarak zaten tanımlı olabilir

export default router;
*/