// backend/routes/students.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';

const router = express.Router();

// GET all students and outsiders (customers)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT u.*, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name IN ('student', 'outsider')
      ORDER BY u.name
    `;
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET student or outsider by ID
router.get('/:id', async (req, res) => {
  try {
    const userQuery = `
      SELECT u.*, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND r.name IN ('student', 'outsider')
    `;
    
    const userResult = await pool.query(userQuery, [req.params.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Get bookings for this student
    const bookingsQuery = `
      SELECT b.*, i.name as instructor_name
      FROM bookings b
      LEFT JOIN users i ON i.id = b.instructor_user_id
      WHERE b.student_user_id = $1 AND b.deleted_at IS NULL
      ORDER BY b.date DESC
    `;
    
    const bookingsResult = await pool.query(bookingsQuery, [req.params.id]);
    
    // Get rentals for this student
    const rentalsQuery = `
      SELECT r.*
      FROM rentals r
      WHERE r.student_user_id = $1
      ORDER BY r.start_date DESC
    `;
    
    const rentalsResult = await pool.query(rentalsQuery, [req.params.id]);
    
    const student = userResult.rows[0];
    student.bookings = bookingsResult.rows;
    student.rentals = rentalsResult.rows;
    
    res.json(student);
  } catch (err) {
    console.error('Error fetching student:', err);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// GET /:id/shop-history - Get shop purchase history for a student
router.get('/:id/shop-history', authenticateJWT, async (req, res) => {
  try {
    const query = `
      SELECT t.*
      FROM wallet_transactions t
      WHERE t.user_id = $1 
      AND t.transaction_type IN ('product_purchase', 'shop_purchase', 'purchase')
      AND t.status != 'failed'
      ORDER BY t.created_at DESC
    `;
    
    const { rows } = await pool.query(query, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching shop history:', err);
    res.status(500).json({ error: 'Failed to fetch shop history' });
  }
});

// Import students via CSV
router.post('/import', authenticateJWT, async (req, res) => {
  const { csvData } = req.body;
  if (!csvData) {
    return res.status(400).json({ error: 'CSV data is required' });
  }
  try {
    // Parse CSV data (simple parser)
    const lines = csvData.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    // Get student role id
    const roleRes = await pool.query("SELECT id FROM roles WHERE name='student'");
    const studentRoleId = roleRes.rows[0]?.id;
    if (!studentRoleId) {
      return res.status(500).json({ error: 'Student role not found' });
    }
    // Insert users
    const inserted = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const student = {};
      headers.forEach((h, idx) => student[h] = values[idx] || null);
      // Upsert by email
      const query = `INSERT INTO users (name, email, phone, role_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO NOTHING
        RETURNING *`;
      const params = [student.name, student.email, student.phone, studentRoleId];
      const result = await pool.query(query, params);
      if (result.rows[0]) inserted.push(result.rows[0]);
    }
    res.json({ importedCount: inserted.length, students: inserted });
  } catch (err) {
    console.error('Error importing students:', err);
    res.status(500).json({ error: 'Failed to import students' });
  }
});

// Get lessons for a student
router.get('/:id/lessons', authenticateJWT, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bookings WHERE student_user_id = $1 AND deleted_at IS NULL ORDER BY date DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching lessons for student:', err);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// NOTE: Create, update and delete operations for students
// are handled by the users routes with appropriate role filtering

export default router;
