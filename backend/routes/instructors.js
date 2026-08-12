import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import { cacheMiddleware } from '../middlewares/cache.js';

// In-memory settings cache (5-min TTL — matches Redis TTL)
let _globalSettings = null;
let _globalSettingsAt = 0;

async function getCachedGlobalSettings() {
  if (_globalSettings && Date.now() - _globalSettingsAt < 300_000) return _globalSettings;
  try {
    const result = await pool.query('SELECT visible_fields, booking_link_enabled FROM team_global_settings LIMIT 1');
    _globalSettings = result.rows.length > 0 ? result.rows[0] : { visible_fields: ['bio', 'specializations', 'languages', 'experience'], booking_link_enabled: true };
  } catch {
    _globalSettings = { visible_fields: ['bio', 'specializations', 'languages', 'experience'], booking_link_enabled: true };
  }
  _globalSettingsAt = Date.now();
  return _globalSettings;
}

const router = express.Router();

// ── Staff-only commission fields on the PUBLIC list ─────────────────────────
// GET / is public (guest team browsing) so it carries no auth middleware. That
// meant `req.user` was ALWAYS undefined here and the commission block in the
// response mapper below never emitted anything — every staff caller received
// instructors with `commission_rate: undefined`.
//
// That silently broke the booking edit modal, which reads `commission_rate` to
// restore an instructor's default rate: both its "Reset" button and its
// zero-recovery guard evaluated `commission_rate || 0` and therefore wrote a
// permanent €0 per-booking commission override (5 lessons lost their earnings
// entirely this way). Mirrors the optionalAuth pattern in /services + /products:
// decode a Bearer token IF present, never reject a guest.
//
// Visibility is limited to the same staff set that may modify a booking —
// instructors must not see each other's rates.
const COMMISSION_VISIBLE_ROLES = new Set([
  'admin', 'super_admin', 'owner', 'developer', 'manager', 'receptionist', 'front_desk',
]);

const optionalAuth = (req, _res, next) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  req.user = null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      req.user = null;
    }
  }
  next();
};

const callerCanSeeCommission = (req) =>
  !!(req.user && COMMISSION_VISIBLE_ROLES.has(
    String(req.user.role || '').toLowerCase().replace(/[-\s]+/g, '_').trim(),
  ));

// Rate limiter for public API endpoints (guests)
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// GET all instructors - Public endpoint for guest browsing.
// optionalAuth runs BEFORE cacheMiddleware so the cache key can vary by
// privilege: without that, one guest response would be replayed to staff for
// the next 5 minutes (stripping commission_rate again) and, worse, a staff
// response could be served to guests.
router.get('/', publicApiLimiter, optionalAuth, cacheMiddleware(300, (req) =>
  `api:instructors:list:${req.query.context || 'all'}:${callerCanSeeCommission(req) ? 'staff' : 'public'}`
), async (req, res) => {
  try {
    const { context } = req.query;

    const globalSettings = await getCachedGlobalSettings();

    // Load per-form instructor visibility if a context was requested
    let contextAllowedIds = null; // null = no restriction
    if (context) {
      try {
        const visResult = await pool.query("SELECT value FROM settings WHERE key = 'instructor_form_visibility'");
        if (visResult.rows.length > 0) {
          const vis = visResult.rows[0].value;
          const ids = vis?.[context];
          if (Array.isArray(ids) && ids.length > 0) contextAllowedIds = ids;
        }
      } catch { /* use defaults */ }
    }

    const queryParams = [];
    let contextFilter = '';
    if (contextAllowedIds) {
      queryParams.push(contextAllowedIds);
      contextFilter = `AND u.id = ANY($1::uuid[])`;
    }

    const query = `
      SELECT u.*, r.name as role_name,
             COALESCE(idc.commission_value, 0) as commission_rate,
             COALESCE(idc.commission_type, 'percent') as commission_type,
             COALESCE(idc.self_student_commission_rate, 45) as self_student_commission_rate,
             COALESCE(
               json_agg(
                 json_build_object(
                   'discipline_tag', isk.discipline_tag,
                   'lesson_categories', isk.lesson_categories,
                   'max_level', isk.max_level
                 )
               ) FILTER (WHERE isk.id IS NOT NULL),
               '[]'::json
             ) as skills,
             tms.visible AS team_visible,
             tms.display_order AS team_display_order,
             tms.featured AS team_featured,
             tms.custom_bio AS team_custom_bio
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = u.id
      LEFT JOIN instructor_skills isk ON isk.instructor_id = u.id
      LEFT JOIN team_member_settings tms ON tms.instructor_id = u.id
      WHERE r.name IN ('instructor', 'manager') AND u.deleted_at IS NULL
        AND (tms.visible IS NULL OR tms.visible = true)
        ${contextFilter}
      GROUP BY u.id, r.name, idc.commission_value, idc.commission_type,
               idc.self_student_commission_rate,
               tms.visible, tms.display_order, tms.featured, tms.custom_bio
      ORDER BY
        CASE WHEN tms.featured = true THEN 0 ELSE 1 END,
        COALESCE(tms.display_order, 999),
        u.name
    `;

    const { rows } = await pool.query(query, queryParams);

    const visibleFields = Array.isArray(globalSettings.visible_fields) ? globalSettings.visible_fields : ['bio', 'specializations', 'languages', 'experience'];

    const sanitized = rows.map((row) => ({
      id: row.id,
      name: row.name,
      first_name: row.first_name,
      last_name: row.last_name,
      profile_image_url: row.profile_image_url,
      avatar_url: row.avatar_url,
      bio: visibleFields.includes('bio') ? (row.team_custom_bio || row.bio) : null,
      language: visibleFields.includes('languages') ? row.language : null,
      role_name: row.role_name,
      status: row.status || 'active',
      is_freelance: row.is_freelance || false,
      skills: visibleFields.includes('specializations') ? (row.skills || []) : [],
      featured: row.team_featured || false,
      created_at: visibleFields.includes('experience') ? row.created_at : null,
      booking_link_enabled: globalSettings.booking_link_enabled,
      visible_fields: visibleFields,
      ...(callerCanSeeCommission(req) ? {
        commission_rate: row.commission_rate,
        commission_type: row.commission_type,
        self_student_commission_rate: row.self_student_commission_rate
      } : {})
    }));

    res.json(sanitized);
  } catch (err) {
    logger.error('Failed to fetch instructors', err);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
});

// GET instructor by ID
router.get('/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const userQuery = `
      SELECT u.*, r.name as role_name,
             COALESCE(idc.commission_value, 0) as commission_rate,
             COALESCE(idc.commission_type, 'percent') as commission_type,
             COALESCE(idc.self_student_commission_rate, 45) as self_student_commission_rate
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = u.id
      WHERE u.id = $1 AND r.name IN ('instructor', 'manager') AND u.deleted_at IS NULL
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
    
    const instructor = sanitizeUser(userResult.rows[0]);
    instructor.bookings = bookingsResult.rows;

    res.json(instructor);
  } catch (err) {
    logger.error('Failed to fetch instructor', err);
    res.status(500).json({ error: 'Failed to fetch instructor' });  }
});

// GET instructor's services
router.get('/:id/services', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    // If user is an instructor, they should only be able to see their own services
    if (req.user.role === 'instructor' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden: You can only access your own services' });
    }
    
    // First check if the instructor/manager exists
    const instructorCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name IN ('instructor', 'manager')) AND deleted_at IS NULL`,
      [req.params.id]
    );
    
    if (instructorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Instructor not found' });
    }

    // Check if the instructor_services table exists
    try {
      await pool.query('SELECT 1 FROM instructor_services LIMIT 1');
    } catch (tableErr) {
      logger.error('instructor_services table check failed', { error: tableErr.message });
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
    
    try {
      const { rows } = await pool.query(query, [req.params.id]);

      // If no services found, return an empty array instead of a 404
      return res.json(rows);
    } catch (queryErr) {
      logger.error('Failed to fetch instructor services query', queryErr);
      return res.status(500).json({
        error: 'Database query error when fetching instructor services',
        details: queryErr.message
      });
    }
  } catch (err) {
    logger.error('Failed to fetch instructor services', err);
    res.status(500).json({ error: 'Failed to fetch instructor services', details: err.message });
  }
});

// GET instructor's lessons
router.get('/:id/lessons', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;

    // If user is an instructor, they should only be able to see their own lessons
    if (req.user.role === 'instructor' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden: You can only access your own lessons' });
    }
    
    // First check if the instructor/manager exists
    const instructorCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name IN ('instructor', 'manager')) AND deleted_at IS NULL`,
      [req.params.id]
    );
    
    if (instructorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Instructor not found' });
    }

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
        AND b.deleted_at IS NULL
      ORDER BY b.date DESC
      LIMIT $2
    `;
    
    try {
      const { rows } = await pool.query(query, [req.params.id, limit]);
      return res.json(rows);
    } catch (queryErr) {
      logger.error('Failed to fetch instructor lessons query', queryErr);
      return res.status(500).json({
        error: 'Database query error when fetching instructor lessons',
        details: queryErr.message
      });
    }
  } catch (err) {
    logger.error('Failed to fetch instructor lessons', err);
    res.status(500).json({ error: 'Failed to fetch instructor lessons', details: err.message });
  }
});

export default router;
