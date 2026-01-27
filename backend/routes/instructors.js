import express from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';

const router = express.Router();

// Rate limiter for public API endpoints (guests)
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// GET all instructors - Public endpoint for guest browsing - Public endpoint for guest browsing
router.get('/', publicApiLimiter, async (req, res) => {
  try {
    const query = `
      SELECT u.*, r.name as role_name, 
             COALESCE(idc.commission_value, 0) as commission_rate,
             COALESCE(idc.commission_type, 'percent') as commission_type
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = u.id
      WHERE r.name = 'instructor' AND u.deleted_at IS NULL
      ORDER BY u.name
    `;
    
    const { rows } = await pool.query(query);
    
    // Always return sanitized data (for guests and authenticated users)
    // Guests don't need sensitive information like commission details
    const sanitized = rows.map((row) => ({
      id: row.id,
      name: row.name,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      profile_image_url: row.profile_image_url,
      avatar_url: row.avatar_url,
      bio: row.bio,
      language: row.language,
      role_name: row.role_name,
      // Hide commission details from guests
      ...(req.user ? {
        commission_rate: row.commission_rate,
        commission_type: row.commission_type
      } : {})
    }));

    res.json(sanitized);
  } catch (err) {
    console.error('Error fetching instructors:', err);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
});

// GET instructor by ID
router.get('/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const userQuery = `
      SELECT u.*, r.name as role_name,
             COALESCE(idc.commission_value, 0) as commission_rate,
             COALESCE(idc.commission_type, 'percent') as commission_type
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = u.id
      WHERE u.id = $1 AND r.name = 'instructor' AND u.deleted_at IS NULL
    `;
    
    const userResult = await pool.query(userQuery, [req.params.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Instructor not found' });
    }
    
    // Get bookings for this instructor
    const bookingsQuery = `
      SELECT b.*, s.name as student_name
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      WHERE b.instructor_user_id = $1
      ORDER BY b.date DESC
    `;
    
    const bookingsResult = await pool.query(bookingsQuery, [req.params.id]);
    
    const instructor = userResult.rows[0];
    instructor.bookings = bookingsResult.rows;
    
    res.json(instructor);
  } catch (err) {
    console.error('Error fetching instructor:', err);
    res.status(500).json({ error: 'Failed to fetch instructor' });  }
});

// GET instructor's services
router.get('/:id/services', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    // If user is an instructor, they should only be able to see their own services
    if (req.user.role === 'instructor' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden: You can only access your own services' });
    }
    
    // Get services assigned to this instructor
    console.log(`Fetching services for instructor ${req.params.id}`);
    
    // First check if the instructor exists
    const instructorCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name = 'instructor') AND deleted_at IS NULL`,
      [req.params.id]
    );
    
    if (instructorCheck.rows.length === 0) {
      console.log(`Instructor ${req.params.id} not found`);
      return res.status(404).json({ error: 'Instructor not found' });
    }
    
    console.log(`Instructor ${req.params.id} exists, proceeding to fetch services`);
    
    // Check if the instructor_services table exists
    try {
      await pool.query('SELECT 1 FROM instructor_services LIMIT 1');
      console.log('instructor_services table exists');
    } catch (tableErr) {
      console.error('Error checking instructor_services table:', tableErr.message);
      return res.status(500).json({ 
        error: 'Database schema issue: instructor_services table may not exist',
        details: tableErr.message
      });
    }
      // Now fetch services
    const query = `
      SELECT s.*
      FROM services s
      JOIN instructor_services ins ON s.id = ins.service_id
      WHERE ins.instructor_id = $1
      ORDER BY s.name
    `;
    
    console.log('SQL query:', query);
    console.log('Params:', [req.params.id]);
    
    try {
      const { rows } = await pool.query(query, [req.params.id]);
      console.log(`Found ${rows.length} services for instructor ${req.params.id}`);
      
      // If no services found, return an empty array instead of a 404
      return res.json(rows);
    } catch (queryErr) {
      console.error('Error executing services query:', queryErr);
      return res.status(500).json({ 
        error: 'Database query error when fetching instructor services',
        details: queryErr.message
      });
    }
  } catch (err) {
    console.error('Error fetching instructor services:', err);
    res.status(500).json({ error: 'Failed to fetch instructor services', details: err.message });
  }
});

// GET instructor's lessons
router.get('/:id/lessons', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    console.log(`Fetching lessons for instructor ${req.params.id}, limit: ${limit}`);
    
    // If user is an instructor, they should only be able to see their own lessons
    if (req.user.role === 'instructor' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden: You can only access your own lessons' });
    }
    
    // First check if the instructor exists
    const instructorCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name = 'instructor') AND deleted_at IS NULL`,
      [req.params.id]
    );
    
    if (instructorCheck.rows.length === 0) {
      console.log(`Instructor ${req.params.id} not found`);
      return res.status(404).json({ error: 'Instructor not found' });
    }
    
    console.log(`Instructor ${req.params.id} exists, proceeding to fetch lessons`);
      // Get recent lessons for this instructor
    const query = `
      SELECT 
        b.id, 
        b.date, 
        b.start_hour, 
        b.duration, 
        b.status, 
        b.payment_status,
        b.amount,
        b.final_amount,
        s.name as student_name, 
        sv.name as service_name,
        sv.id as service_id
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN services sv ON sv.id = b.service_id
      WHERE b.instructor_user_id = $1
      ORDER BY b.date DESC
      LIMIT $2
    `;
    
    console.log('Lessons SQL query:', query);
    console.log('Lessons query params:', [req.params.id, limit]);
    
    try {
      const { rows } = await pool.query(query, [req.params.id, limit]);
      console.log(`Found ${rows.length} lessons for instructor ${req.params.id}`);
      return res.json(rows);
    } catch (queryErr) {
      console.error('Error executing lessons query:', queryErr);
      return res.status(500).json({ 
        error: 'Database query error when fetching instructor lessons',
        details: queryErr.message
      });
    }
  } catch (err) {
    console.error('Error fetching instructor lessons:', err);
    res.status(500).json({ error: 'Failed to fetch instructor lessons', details: err.message });
  }
});

export default router;
