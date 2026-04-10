/**
 * /api/agent — Kai AI Agent API
 *
 * Server-to-server API exclusively for n8n tool calls.
 * Authentication: X-Kai-Agent-Secret header (see authenticateAgent middleware).
 * All responses are flat, AI-friendly JSON — no deep nesting, no extra UI fields.
 *
 * Middleware applied at mount point in server.js:
 *   authenticateAgentRequest  → validates X-Kai-Agent-Secret + extracts req.agent
 *   verifyAgentIdentity       → applied per-route on all write operations
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { requireRole, verifyAgentIdentity } from '../middlewares/authenticateAgent.js';
import { sendEmail } from '../services/emailService.js';
import { dispatchNotification } from '../services/notificationDispatcherUnified.js';
import { getDashboardSummary } from '../services/dashboardSummaryService.js';

const router = express.Router();

// Apply verifyAgentIdentity globally (not just write routes) to prevent role spoofing on reads
router.use(verifyAgentIdentity);

// Rate limiter keyed by userId (not IP) since all n8n calls share one IP
const agentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.headers['x-requesting-user-id'] || req.ip,
  message: { error: 'Agent rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

router.use(agentRateLimit);

// n8n 2.15 toolHttpRequest requires model-filled params in the URL (not body).
// This middleware merges query params into req.body for POST requests so route
// handlers can keep reading from req.body as before.
router.use((req, _res, next) => {
  if (req.method === 'POST' && req.query && Object.keys(req.query).length > 0) {
    req.body = { ...(req.body || {}), ...req.query };
  }
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const toNum = (v) => (v == null ? null : parseFloat(v));

/** Returns YYYY-MM-DD range for a period string */
function periodToDateRange(period) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  if (period === 'today') {
    return { start: today, end: today };
  }
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { start, end: today };
  }
  if (period === 'month') {
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    return { start, end: today };
  }
  // Default: today
  return { start: today, end: today };
}

// ── GET /me — Own profile (any authenticated role) ────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const { userId } = req.agent;
    if (!userId || userId === 'guest') {
      return res.json({ userId: 'guest', role: 'outsider', name: 'Guest' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, r.name AS role, u.phone, u.created_at
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );

    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];
    res.json({
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      memberSince: u.created_at,
    });
  } catch (err) {
    logger.error('Agent /me error', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── GET /customers/search?q= — Search customers (admin, manager) ──────────────
router.get(
  '/customers/search',
  requireRole(['admin', 'manager']),
  async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters' });
      }

      const search = `%${q.trim()}%`;
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.phone, r.name AS role,
                COALESCE(wb.available_amount, 0) AS wallet_balance,
                COALESCE(wb.currency, 'EUR') AS currency
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN wallet_balances wb ON wb.user_id = u.id
         WHERE u.deleted_at IS NULL
           AND (u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1)
         ORDER BY u.name
         LIMIT 20`,
        [search],
      );

      res.json(
        rows.map((u) => ({
          customerId: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          walletBalance: toNum(u.wallet_balance),
          currency: u.currency,
        })),
      );
    } catch (err) {
      logger.error('Agent /customers/search error', err);
      res.status(500).json({ error: 'Failed to search customers' });
    }
  },
);

// ── GET /customers/:id — Customer profile (admin, manager, instructor scoped) ─
router.get('/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.agent;
    const allowed = new Set(['admin', 'manager', 'owner', 'trusted_customer']);

    // Instructors can only view their own students
    if (role === 'instructor') {
      const { rows: check } = await pool.query(
        `SELECT 1 FROM bookings
         WHERE instructor_user_id = $1
           AND student_user_id = $2
           AND deleted_at IS NULL
         LIMIT 1`,
        [userId, id],
      );
      if (!check.length) {
        return res.status(403).json({ error: 'Forbidden: not your student' });
      }
    } else if (!allowed.has(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, r.name AS role, u.created_at,
              COUNT(DISTINCT b.id) AS total_lessons
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN bookings b ON b.student_user_id = u.id AND b.deleted_at IS NULL
       WHERE u.id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id, u.name, u.email, u.phone, r.name, u.created_at`,
      [id],
    );

    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });

    const u = rows[0];
    res.json({
      customerId: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      totalLessons: parseInt(u.total_lessons, 10),
      memberSince: u.created_at,
    });
  } catch (err) {
    logger.error('Agent /customers/:id error', err);
    res.status(500).json({ error: 'Failed to fetch customer profile' });
  }
});

// ── GET /customers/:id/wallet — Wallet balance ────────────────────────────────
router.get('/customers/:id/wallet', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);

    // Students can only check their own wallet
    if (!mgmt.has(role)) {
      if (userId !== id) {
        return res.status(403).json({ error: 'Forbidden: you can only view your own wallet' });
      }
    }

    const { rows } = await pool.query(
      `SELECT currency, available_amount
       FROM wallet_balances
       WHERE user_id = $1
       ORDER BY available_amount DESC
       LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      return res.json({ userId: id, currency: 'EUR', availableAmount: 0 });
    }

    res.json({
      userId: id,
      currency: rows[0].currency,
      availableAmount: toNum(rows[0].available_amount),
    });
  } catch (err) {
    logger.error('Agent /customers/:id/wallet error', err);
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
});

// ── GET /customers/:id/bookings — Booking history for a customer ──────────────
router.get('/customers/:id/bookings', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);

    if (!mgmt.has(role)) {
      // Instructor: only their own students
      if (role === 'instructor') {
        const { rows: check } = await pool.query(
          `SELECT 1 FROM bookings
           WHERE instructor_user_id = $1 AND student_user_id = $2 AND deleted_at IS NULL
           LIMIT 1`,
          [userId, id],
        );
        if (!check.length) return res.status(403).json({ error: 'Forbidden: not your student' });
      } else {
        // Students can only see their own bookings
        if (userId !== id) return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const { rows } = await pool.query(
      `SELECT b.id, b.date, b.start_hour, b.duration, b.status, b.payment_status,
              b.final_amount, b.amount, b.notes,
              srv.name AS service_name, srv.service_type,
              i.name AS instructor_name
       FROM bookings b
       LEFT JOIN services srv ON srv.id = b.service_id
       LEFT JOIN users i ON i.id = b.instructor_user_id
       WHERE b.student_user_id = $1 AND b.deleted_at IS NULL
       ORDER BY b.date DESC, b.start_hour DESC
       LIMIT 50`,
      [id],
    );

    res.json(
      rows.map((b) => ({
        bookingId: b.id,
        date: b.date,
        startHour: toNum(b.start_hour),
        duration: toNum(b.duration),
        status: b.status,
        paymentStatus: b.payment_status,
        amount: toNum(b.final_amount ?? b.amount),
        serviceName: b.service_name,
        serviceType: b.service_type,
        instructorName: b.instructor_name,
        notes: b.notes,
      })),
    );
  } catch (err) {
    logger.error('Agent /customers/:id/bookings error', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// ── GET /customers/:id/packages — Lesson packages remaining ──────────────────
router.get('/customers/:id/packages', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);

    if (!mgmt.has(role)) {
      if (role === 'instructor') {
        const { rows: check } = await pool.query(
          `SELECT 1 FROM bookings
           WHERE instructor_user_id = $1 AND student_user_id = $2 AND deleted_at IS NULL
           LIMIT 1`,
          [userId, id],
        );
        if (!check.length) return res.status(403).json({ error: 'Forbidden: not your student' });
      } else if (userId !== id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const { rows } = await pool.query(
      `SELECT id, package_name, lesson_service_name, total_hours, used_hours, remaining_hours, status, expiry_date
       FROM customer_packages
       WHERE customer_id = $1 AND status IN ('active', 'waiting_payment')
       ORDER BY created_at DESC`,
      [id],
    );

    res.json(
      rows.map((p) => ({
        packageId: p.id,
        packageName: p.package_name,
        lessonType: p.lesson_service_name,
        totalHours: toNum(p.total_hours),
        usedHours: toNum(p.used_hours),
        remainingHours: toNum(p.remaining_hours),
        status: p.status,
        expiresAt: p.expiry_date,
      })),
    );
  } catch (err) {
    logger.error('Agent /customers/:id/packages error', err);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// ── POST /customers — Create new customer (admin, manager) ────────────────────
router.post(
  '/customers',
  requireRole(['admin', 'manager']),
  verifyAgentIdentity,
  async (req, res) => {
    try {
      const { name, email, phone } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: 'name and email are required' });
      }

      // Get the 'student' role ID
      const { rows: roleRows } = await pool.query(
        `SELECT id FROM roles WHERE LOWER(name) = 'student' LIMIT 1`,
      );
      if (!roleRows.length) return res.status(500).json({ error: 'Student role not found' });
      const studentRoleId = roleRows[0].id;

      // Check for existing email
      const { rows: existing } = await pool.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
        [email],
      );
      if (existing.length) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }

      // Insert with a temporary password (user must reset on first login)
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, phone, role_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, name, email, phone`,
        [name.trim(), email.toLowerCase().trim(), phone || null, studentRoleId],
      );

      const newUser = rows[0];
      res.status(201).json({
        customerId: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        message: 'Customer created. They will need to set a password via forgot-password flow.',
      });
    } catch (err) {
      logger.error('Agent POST /customers error', err);
      res.status(500).json({ error: 'Failed to create customer' });
    }
  },
);

// ── GET /available-slots — Lesson time blocks available on a date ─────────────
// Returns the 4 standard 2-hour lesson blocks with availability status.
router.get('/available-slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });

    // Standard 2-hour lesson blocks (decimal start hours)
    const blocks = [
      { label: '09:00 – 11:00', start: 9, end: 11 },
      { label: '11:30 – 13:30', start: 11.5, end: 13.5 },
      { label: '14:00 – 16:00', start: 14, end: 16 },
      { label: '16:30 – 18:30', start: 16.5, end: 18.5 },
    ];

    // Fetch all non-cancelled bookings on the given date
    const { rows: bookings } = await pool.query(
      `SELECT start_hour, duration, instructor_user_id
       FROM bookings
       WHERE date = $1
         AND status NOT IN ('cancelled', 'pending_payment')
         AND deleted_at IS NULL`,
      [date],
    );

    // Count active instructors for capacity estimation
    const { rows: instructorRows } = await pool.query(
      `SELECT COUNT(DISTINCT u.id) AS cnt
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE LOWER(r.name) = 'instructor' AND u.deleted_at IS NULL`,
    );
    const totalInstructors = parseInt(instructorRows[0]?.cnt) || 1;

    const slots = blocks.map((block) => {
      // Count how many bookings overlap with this block
      const overlapping = bookings.filter((b) => {
        const bStart = parseFloat(b.start_hour);
        const bEnd = bStart + (parseFloat(b.duration) || 1);
        return bStart < block.end && bEnd > block.start;
      });

      // Count unique instructors booked in this block
      const bookedInstructors = new Set(
        overlapping.filter((b) => b.instructor_user_id).map((b) => b.instructor_user_id),
      );

      const available = bookedInstructors.size < totalInstructors;

      return {
        label: block.label,
        startHour: block.start,
        available,
        bookingCount: overlapping.length,
      };
    });

    res.json({ date, slots });
  } catch (err) {
    logger.error('Agent GET /available-slots error', err);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// ── GET /bookings — List bookings with filters ────────────────────────────────
router.get('/bookings', async (req, res) => {
  try {
    const { userId, role } = req.agent;
    const { date, start_date, end_date, instructorId, customerId, limit = 50 } = req.query;
    const mgmt = new Set(['admin', 'manager', 'owner']);

    const params = [];
    const conditions = ['b.deleted_at IS NULL'];

    if (mgmt.has(role)) {
      if (date) { params.push(date); conditions.push(`b.date = $${params.length}`); }
      if (start_date) { params.push(start_date); conditions.push(`b.date >= $${params.length}`); }
      if (end_date) { params.push(end_date); conditions.push(`b.date <= $${params.length}`); }
      if (instructorId) { params.push(instructorId); conditions.push(`b.instructor_user_id = $${params.length}`); }
      if (customerId) { params.push(customerId); conditions.push(`b.student_user_id = $${params.length}`); }
    } else if (role === 'instructor') {
      params.push(userId);
      conditions.push(`b.instructor_user_id = $${params.length}`);
      if (date) { params.push(date); conditions.push(`b.date = $${params.length}`); }
      if (start_date) { params.push(start_date); conditions.push(`b.date >= $${params.length}`); }
      if (end_date) { params.push(end_date); conditions.push(`b.date <= $${params.length}`); }
    } else {
      // student / trusted_customer: own bookings only
      params.push(userId);
      conditions.push(`b.student_user_id = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    params.push(Math.min(parseInt(limit, 10) || 50, 100));

    const { rows } = await pool.query(
      `SELECT b.id, b.date, b.start_hour, b.duration, b.status, b.payment_status,
              COALESCE(b.final_amount, b.amount) AS amount,
              s.name AS student_name,
              i.name AS instructor_name,
              srv.name AS service_name,
              srv.service_type
       FROM bookings b
       LEFT JOIN users s ON s.id = b.student_user_id
       LEFT JOIN users i ON i.id = b.instructor_user_id
       LEFT JOIN services srv ON srv.id = b.service_id
       WHERE ${where}
       ORDER BY b.date DESC, b.start_hour DESC
       LIMIT $${params.length}`,
      params,
    );

    res.json(
      rows.map((b) => ({
        bookingId: b.id,
        date: b.date,
        startHour: toNum(b.start_hour),
        duration: toNum(b.duration),
        status: b.status,
        paymentStatus: b.payment_status,
        amount: toNum(b.amount),
        studentName: b.student_name,
        instructorName: b.instructor_name,
        serviceName: b.service_name,
        serviceType: b.service_type,
      })),
    );
  } catch (err) {
    logger.error('Agent GET /bookings error', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// ── GET /bookings/mine — Own upcoming bookings (alias for student/instructor) ──
router.get('/bookings/mine', async (req, res) => {
  const { userId, role } = req.agent;
  const column = role === 'instructor' ? 'b.instructor_user_id' : 'b.student_user_id';

  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.date, b.start_hour, b.duration, b.status, b.payment_status,
              COALESCE(b.final_amount, b.amount) AS amount,
              s.name AS student_name,
              i.name AS instructor_name,
              srv.name AS service_name
       FROM bookings b
       LEFT JOIN users s ON s.id = b.student_user_id
       LEFT JOIN users i ON i.id = b.instructor_user_id
       LEFT JOIN services srv ON srv.id = b.service_id
       WHERE ${column} = $1 AND b.deleted_at IS NULL
         AND b.date >= CURRENT_DATE
       ORDER BY b.date ASC, b.start_hour ASC
       LIMIT 20`,
      [userId],
    );

    res.json(
      rows.map((b) => ({
        bookingId: b.id,
        date: b.date,
        startHour: toNum(b.start_hour),
        duration: toNum(b.duration),
        status: b.status,
        paymentStatus: b.payment_status,
        amount: toNum(b.amount),
        studentName: b.student_name,
        instructorName: b.instructor_name,
        serviceName: b.service_name,
      })),
    );
  } catch (err) {
    logger.error('Agent GET /bookings/mine error', err);
    res.status(500).json({ error: 'Failed to fetch your bookings' });
  }
});

// ── GET /bookings/:id — Single booking (scoped) ───────────────────────────────
router.get('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.agent;

    const { rows } = await pool.query(
      `SELECT b.id, b.date, b.start_hour, b.duration, b.status, b.payment_status,
              COALESCE(b.final_amount, b.amount) AS amount,
              b.notes, b.student_user_id, b.instructor_user_id,
              s.name AS student_name,
              i.name AS instructor_name,
              srv.name AS service_name,
              srv.service_type
       FROM bookings b
       LEFT JOIN users s ON s.id = b.student_user_id
       LEFT JOIN users i ON i.id = b.instructor_user_id
       LEFT JOIN services srv ON srv.id = b.service_id
       WHERE b.id = $1 AND b.deleted_at IS NULL`,
      [id],
    );

    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });

    const b = rows[0];
    const mgmt = new Set(['admin', 'manager', 'owner']);

    if (!mgmt.has(role)) {
      if (role === 'instructor' && b.instructor_user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if ((role === 'student' || role === 'trusted_customer') && b.student_user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    res.json({
      bookingId: b.id,
      date: b.date,
      startHour: toNum(b.start_hour),
      duration: toNum(b.duration),
      status: b.status,
      paymentStatus: b.payment_status,
      amount: toNum(b.amount),
      notes: b.notes,
      studentName: b.student_name,
      instructorName: b.instructor_name,
      serviceName: b.service_name,
      serviceType: b.service_type,
    });
  } catch (err) {
    logger.error('Agent GET /bookings/:id error', err);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// ── POST /bookings — Create a booking ─────────────────────────────────────────
// Always runs verifyAgentIdentity to prevent role spoofing on writes.
// For students, student_user_id is ALWAYS forced to req.agent.userId.
router.post(
  '/bookings',
  verifyAgentIdentity,
  async (req, res) => {
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);
    const student = new Set(['student', 'trusted_customer']);

    if (!mgmt.has(role) && !student.has(role)) {
      return res.status(403).json({ error: 'Instructors cannot create bookings' });
    }

    const {
      serviceId,
      date,
      startHour,
      instructorId,
      paymentMethod = 'cash',
      customerPackageId,
      notes = '',
    } = req.body;

    // Force student to only book for themselves
    let studentUserId = req.body.customerId || req.body.studentId || userId;
    if (student.has(role)) {
      studentUserId = userId;
    }

    if (!serviceId || !date || startHour == null) {
      return res.status(400).json({ error: 'serviceId, date, and startHour are required' });
    }

    const isPackagePayment = paymentMethod === 'package' || !!customerPackageId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get service details
      const { rows: svcRows } = await client.query(
        `SELECT id, name, duration, price FROM services WHERE id = $1`,
        [serviceId],
      );
      if (!svcRows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Service not found' });
      }
      const service = svcRows[0];
      const duration = toNum(service.duration) || 1;
      const amount = toNum(service.price) || 0;

      let resolvedPackageId = null;

      // Package-based booking — validate & deduct hours
      if (isPackagePayment) {
        // If customerPackageId given, use it; otherwise find the best active package
        if (customerPackageId) {
          const { rows: pkgRows } = await client.query(
            `SELECT id, customer_id, remaining_hours, status, expiry_date
             FROM customer_packages WHERE id = $1 FOR UPDATE`,
            [customerPackageId],
          );
          if (!pkgRows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Package not found' });
          }
          const pkg = pkgRows[0];
          if (pkg.customer_id !== studentUserId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'This package does not belong to you' });
          }
          if (pkg.status !== 'active' && pkg.status !== 'waiting_payment') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Package is ${pkg.status}, not active` });
          }
          if (pkg.expiry_date && new Date(pkg.expiry_date) < new Date(date)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Package expires before the booking date' });
          }
          if (toNum(pkg.remaining_hours) < duration) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: `Not enough hours. Remaining: ${toNum(pkg.remaining_hours)}h, Required: ${duration}h`,
            });
          }
          resolvedPackageId = pkg.id;
        } else {
          // Auto-select the best active package with enough hours
          const { rows: pkgRows } = await client.query(
            `SELECT id, remaining_hours, expiry_date FROM customer_packages
             WHERE customer_id = $1 AND status = 'active'
               AND remaining_hours >= $2
               AND (expiry_date IS NULL OR expiry_date >= $3::date)
             ORDER BY expiry_date ASC NULLS LAST, remaining_hours ASC
             LIMIT 1
             FOR UPDATE`,
            [studentUserId, duration, date],
          );
          if (!pkgRows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No active package with enough remaining hours found' });
          }
          resolvedPackageId = pkgRows[0].id;
        }

        // Deduct hours from the package
        const newUsed = duration;
        await client.query(
          `UPDATE customer_packages
           SET used_hours = used_hours + $1,
               remaining_hours = remaining_hours - $1,
               last_used_date = $2::date,
               status = CASE WHEN remaining_hours - $1 <= 0 THEN 'used_up' ELSE status END,
               updated_at = NOW()
           WHERE id = $3`,
          [newUsed, date, resolvedPackageId],
        );
      }

      // Wallet check — MANDATORY when paying by wallet
      if (paymentMethod === 'wallet') {
        const { rows: walletRows } = await client.query(
          `SELECT available_amount FROM wallet_balances WHERE user_id = $1 ORDER BY available_amount DESC LIMIT 1`,
          [studentUserId],
        );
        const balance = toNum(walletRows[0]?.available_amount) || 0;
        if (balance < amount) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Insufficient wallet balance. Available: €${balance}, Required: €${amount}`,
            balance,
            required: amount,
          });
        }
      }

      const finalPaymentMethod = isPackagePayment ? 'package' : paymentMethod;
      const finalAmount = isPackagePayment ? 0 : amount;
      const paymentStatus = isPackagePayment ? 'package' : (paymentMethod === 'wallet' ? 'paid' : 'pending');

      const { rows: bookingRows } = await client.query(
        `INSERT INTO bookings (
           service_id, student_user_id, instructor_user_id,
           date, start_hour, duration,
           status, payment_method, payment_status, amount, final_amount,
           customer_package_id,
           notes, location, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'TBD', $14, $14)
         RETURNING id`,
        [
          serviceId,
          studentUserId,
          instructorId || null,
          date,
          parseFloat(startHour),
          duration,
          'confirmed',
          finalPaymentMethod,
          paymentStatus,
          finalAmount,
          finalAmount,
          resolvedPackageId,
          notes || '',
          userId,
        ],
      );

      const bookingId = bookingRows[0].id;

      // Deduct from wallet if applicable
      if (paymentMethod === 'wallet' && amount > 0) {
        await client.query(
          `INSERT INTO wallet_transactions (
             user_id, booking_id, amount, currency, direction,
             transaction_type, description, created_at
           ) VALUES ($1, $2, $3, 'EUR', 'debit', 'booking_charge', $4, NOW())`,
          [studentUserId, bookingId, amount, `Booking: ${service.name} on ${date}`],
        );

        await client.query(
          `UPDATE wallet_balances SET available_amount = available_amount - $1, updated_at = NOW()
           WHERE user_id = $2`,
          [amount, studentUserId],
        );
      }

      await client.query('COMMIT');

      const responseMsg = isPackagePayment
        ? `Booking confirmed for ${service.name} on ${date} at ${startHour}:00 (${duration}h deducted from your package).`
        : `Booking confirmed for ${service.name} on ${date} at ${startHour}:00.`;

      res.status(201).json({
        bookingId,
        serviceName: service.name,
        date,
        startHour: parseFloat(startHour),
        amount: finalAmount,
        paymentMethod: finalPaymentMethod,
        packageUsed: !!resolvedPackageId,
        status: 'confirmed',
        message: responseMsg,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Agent POST /bookings error', err);
      res.status(500).json({ error: 'Failed to create booking' });
    } finally {
      client.release();
    }
  },
);

// ── GET /schedule/mine — Own upcoming schedule ────────────────────────────────
router.get('/schedule/mine', async (req, res) => {
  const { userId, role } = req.agent;
  const column = role === 'instructor' ? 'b.instructor_user_id' : 'b.student_user_id';
  const { date } = req.query;

  try {
    const params = [userId];
    let dateCond = 'b.date >= CURRENT_DATE';
    if (date) {
      params.push(date);
      dateCond = `b.date = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT b.id, b.date, b.start_hour, b.duration, b.status,
              s.name AS student_name,
              i.name AS instructor_name,
              srv.name AS service_name
       FROM bookings b
       LEFT JOIN users s ON s.id = b.student_user_id
       LEFT JOIN users i ON i.id = b.instructor_user_id
       LEFT JOIN services srv ON srv.id = b.service_id
       WHERE ${column} = $1 AND ${dateCond} AND b.deleted_at IS NULL
         AND b.status NOT IN ('cancelled', 'no_show')
       ORDER BY b.date ASC, b.start_hour ASC
       LIMIT 30`,
      params,
    );

    res.json({
      userId,
      role,
      schedule: rows.map((b) => ({
        bookingId: b.id,
        date: b.date,
        startHour: toNum(b.start_hour),
        duration: toNum(b.duration),
        status: b.status,
        studentName: b.student_name,
        instructorName: b.instructor_name,
        serviceName: b.service_name,
      })),
    });
  } catch (err) {
    logger.error('Agent GET /schedule/mine error', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// ── GET /schedule/instructor/:id — Instructor schedule (admin, manager) ───────
router.get(
  '/schedule/instructor/:id',
  requireRole(['admin', 'manager']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { date } = req.query;

      const params = [id];
      let dateCond = 'b.date >= CURRENT_DATE';
      if (date) {
        params.push(date);
        dateCond = `b.date = $${params.length}`;
      }

      // Verify the instructor exists
      const { rows: instrRows } = await pool.query(
        `SELECT u.name FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1 AND LOWER(r.name) = 'instructor' AND u.deleted_at IS NULL`,
        [id],
      );
      if (!instrRows.length) return res.status(404).json({ error: 'Instructor not found' });

      const { rows } = await pool.query(
        `SELECT b.id, b.date, b.start_hour, b.duration, b.status,
                s.name AS student_name,
                srv.name AS service_name
         FROM bookings b
         LEFT JOIN users s ON s.id = b.student_user_id
         LEFT JOIN services srv ON srv.id = b.service_id
         WHERE b.instructor_user_id = $1 AND ${dateCond} AND b.deleted_at IS NULL
           AND b.status NOT IN ('cancelled', 'no_show')
         ORDER BY b.date ASC, b.start_hour ASC
         LIMIT 30`,
        params,
      );

      res.json({
        instructorId: id,
        instructorName: instrRows[0].name,
        schedule: rows.map((b) => ({
          bookingId: b.id,
          date: b.date,
          startHour: toNum(b.start_hour),
          duration: toNum(b.duration),
          status: b.status,
          studentName: b.student_name,
          serviceName: b.service_name,
        })),
      });
    } catch (err) {
      logger.error('Agent GET /schedule/instructor/:id error', err);
      res.status(500).json({ error: 'Failed to fetch instructor schedule' });
    }
  },
);

// ── GET /finance/summary?period= — Revenue summary (admin, manager) ───────────
router.get(
  '/finance/summary',
  requireRole(['admin', 'manager']),
  async (req, res) => {
    try {
      const { period = 'today' } = req.query;
      const { start, end } = periodToDateRange(period);

      const summary = await getDashboardSummary({ startDate: start, endDate: end });

      // Return only the AI-relevant fields; strip internal UI specifics
      res.json({
        period,
        startDate: start,
        endDate: end,
        totalRevenue: summary.totalRevenue ?? summary.revenue ?? 0,
        bookingsCount: summary.bookingsCount ?? summary.totalBookings ?? 0,
        byServiceType: summary.byServiceType ?? summary.revenueByType ?? {},
        currency: 'EUR',
      });
    } catch (err) {
      logger.error('Agent GET /finance/summary error', err);
      // Fallback: raw SQL if service fails
      try {
        const { period = 'today' } = req.query;
        const { start, end } = periodToDateRange(period);
        const { rows } = await pool.query(
          `SELECT
             COUNT(b.id) AS booking_count,
             COALESCE(SUM(COALESCE(b.final_amount, b.amount)), 0) AS total_revenue,
             COALESCE(SUM(CASE WHEN srv.service_type ILIKE '%lesson%' THEN COALESCE(b.final_amount, b.amount) ELSE 0 END), 0) AS lessons_revenue,
             COALESCE(SUM(CASE WHEN srv.service_type ILIKE '%rental%' THEN COALESCE(b.final_amount, b.amount) ELSE 0 END), 0) AS rentals_revenue
           FROM bookings b
           LEFT JOIN services srv ON srv.id = b.service_id
           WHERE b.date BETWEEN $1 AND $2
             AND b.deleted_at IS NULL
             AND b.status NOT IN ('cancelled', 'no_show')`,
          [start, end],
        );
        const r = rows[0];
        res.json({
          period,
          startDate: start,
          endDate: end,
          totalRevenue: toNum(r.total_revenue),
          bookingsCount: parseInt(r.booking_count, 10),
          byServiceType: {
            lessons: toNum(r.lessons_revenue),
            rentals: toNum(r.rentals_revenue),
          },
          currency: 'EUR',
        });
      } catch (fallbackErr) {
        logger.error('Agent GET /finance/summary fallback error', fallbackErr);
        res.status(500).json({ error: 'Failed to fetch financial summary' });
      }
    }
  },
);

// ── GET /finance/wallet-deposits — Recent wallet top-ups (admin, manager) ─────
router.get(
  '/finance/wallet-deposits',
  requireRole(['admin', 'manager']),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT wd.id, wd.amount, wd.currency, wd.status, wd.method,
                wd.created_at, wd.completed_at,
                u.name AS user_name, u.email
         FROM wallet_deposit_requests wd
         LEFT JOIN users u ON u.id = wd.user_id
         WHERE wd.created_at >= NOW() - INTERVAL '7 days'
         ORDER BY wd.created_at DESC
         LIMIT 30`,
      );

      res.json(
        rows.map((d) => ({
          depositId: d.id,
          amount: toNum(d.amount),
          currency: d.currency,
          status: d.status,
          method: d.method,
          userName: d.user_name,
          userEmail: d.email,
          createdAt: d.created_at,
          completedAt: d.completed_at,
        })),
      );
    } catch (err) {
      logger.error('Agent GET /finance/wallet-deposits error', err);
      res.status(500).json({ error: 'Failed to fetch wallet deposits' });
    }
  },
);

// ── GET /finance/expenses?period= — Business expenses (admin, manager) ────────
router.get(
  '/finance/expenses',
  requireRole(['admin', 'manager']),
  async (req, res) => {
    try {
      const { period = 'month' } = req.query;
      const { start, end } = periodToDateRange(period);

      const { rows } = await pool.query(
        `SELECT id, amount, currency, category, description, expense_date, created_at
         FROM business_expenses
         WHERE expense_date BETWEEN $1 AND $2
           AND deleted_at IS NULL
         ORDER BY expense_date DESC
         LIMIT 50`,
        [start, end],
      );

      const total = rows.reduce((sum, r) => sum + (toNum(r.amount) || 0), 0);

      res.json({
        period,
        startDate: start,
        endDate: end,
        totalExpenses: total,
        count: rows.length,
        expenses: rows.map((e) => ({
          id: e.id,
          amount: toNum(e.amount),
          currency: e.currency,
          category: e.category,
          description: e.description,
          date: e.expense_date,
        })),
      });
    } catch (err) {
      logger.error('Agent GET /finance/expenses error', err);
      res.status(500).json({ error: 'Failed to fetch expenses' });
    }
  },
);

// ── GET /notes/:studentId — Notes for a student ───────────────────────────────
router.get('/notes/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);

    if (!mgmt.has(role)) {
      if (role === 'instructor') {
        // Instructor can only view notes for their own students
        const { rows: check } = await pool.query(
          `SELECT 1 FROM bookings
           WHERE instructor_user_id = $1 AND student_user_id = $2 AND deleted_at IS NULL
           LIMIT 1`,
          [userId, studentId],
        );
        if (!check.length) return res.status(403).json({ error: 'Forbidden: not your student' });
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const { rows } = await pool.query(
      `SELECT kn.id, kn.note_text, kn.created_at, kn.updated_at,
              i.name AS instructor_name,
              ksd.google_doc_url
       FROM kai_notes kn
       LEFT JOIN users i ON i.id = kn.instructor_id
       LEFT JOIN kai_student_docs ksd ON ksd.student_id = kn.student_id
       WHERE kn.student_id = $1
       ORDER BY kn.created_at DESC
       LIMIT 50`,
      [studentId],
    );

    const docUrl = rows[0]?.google_doc_url || null;

    res.json({
      studentId,
      googleDocUrl: docUrl,
      notes: rows.map((n) => ({
        noteId: n.id,
        text: n.note_text,
        instructorName: n.instructor_name,
        createdAt: n.created_at,
        updatedAt: n.updated_at,
      })),
    });
  } catch (err) {
    logger.error('Agent GET /notes/:studentId error', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// ── POST /notes/:studentId — Add a note (instructor scoped, admin, manager) ───
router.post(
  '/notes/:studentId',
  verifyAgentIdentity,
  async (req, res) => {
    try {
      const { studentId } = req.params;
      const { userId, role } = req.agent;
      const mgmt = new Set(['admin', 'manager', 'owner']);

      if (!mgmt.has(role)) {
        if (role !== 'instructor') return res.status(403).json({ error: 'Forbidden' });
        // Instructor can only note their own students
        const { rows: check } = await pool.query(
          `SELECT 1 FROM bookings
           WHERE instructor_user_id = $1 AND student_user_id = $2 AND deleted_at IS NULL
           LIMIT 1`,
          [userId, studentId],
        );
        if (!check.length) return res.status(403).json({ error: 'Forbidden: not your student' });
      }

      const { note } = req.body;
      if (!note || !note.trim()) {
        return res.status(400).json({ error: 'note text is required' });
      }

      // Verify student exists
      const { rows: studentRows } = await pool.query(
        `SELECT u.name FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [studentId],
      );
      if (!studentRows.length) return res.status(404).json({ error: 'Student not found' });

      const { rows } = await pool.query(
        `INSERT INTO kai_notes (student_id, instructor_id, note_text, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, created_at`,
        [studentId, role === 'instructor' ? userId : null, note.trim()],
      );

      // Check if student already has a Google Doc
      const { rows: docRows } = await pool.query(
        `SELECT google_doc_id, google_doc_url FROM kai_student_docs WHERE student_id = $1`,
        [studentId],
      );

      res.status(201).json({
        noteId: rows[0].id,
        studentId,
        studentName: studentRows[0].name,
        note: note.trim(),
        createdAt: rows[0].created_at,
        // Pass back doc info so n8n can decide whether to create or append
        googleDocExists: docRows.length > 0,
        googleDocId: docRows[0]?.google_doc_id || null,
        googleDocUrl: docRows[0]?.google_doc_url || null,
      });
    } catch (err) {
      logger.error('Agent POST /notes/:studentId error', err);
      res.status(500).json({ error: 'Failed to add note' });
    }
  },
);

// ── POST /student-docs — Save Google Doc reference after n8n creates it ───────
router.post(
  '/student-docs',
  verifyAgentIdentity,
  requireRole(['admin', 'manager', 'instructor']),
  async (req, res) => {
    try {
      const { studentId, googleDocId, googleDocUrl } = req.body;
      if (!studentId || !googleDocId || !googleDocUrl) {
        return res.status(400).json({ error: 'studentId, googleDocId, and googleDocUrl are required' });
      }

      await pool.query(
        `INSERT INTO kai_student_docs (student_id, google_doc_id, google_doc_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_id) DO NOTHING`,
        [studentId, googleDocId, googleDocUrl],
      );

      res.json({ success: true, studentId, googleDocUrl });
    } catch (err) {
      logger.error('Agent POST /student-docs error', err);
      res.status(500).json({ error: 'Failed to save Google Doc reference' });
    }
  },
);

// ── POST /notify — Send in-app notification (admin, manager) ──────────────────
router.post(
  '/notify',
  requireRole(['admin', 'manager']),
  verifyAgentIdentity,
  async (req, res) => {
    try {
      const { targetUserId, targetRole, title, message, type = 'general' } = req.body;

      if (!title || !message) {
        return res.status(400).json({ error: 'title and message are required' });
      }

      // Target a single user
      if (targetUserId) {
        await dispatchNotification({ userId: targetUserId, type, title, message });
        return res.json({ success: true, notified: [targetUserId] });
      }

      // Target all users of a role
      if (targetRole) {
        const { rows } = await pool.query(
          `SELECT u.id FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE LOWER(r.name) = LOWER($1) AND u.deleted_at IS NULL`,
          [targetRole],
        );
        const ids = rows.map((r) => r.id);
        await Promise.all(ids.map((id) => dispatchNotification({ userId: id, type, title, message })));
        return res.json({ success: true, notified: ids });
      }

      return res.status(400).json({ error: 'Either targetUserId or targetRole is required' });
    } catch (err) {
      logger.error('Agent POST /notify error', err);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  },
);

// ── POST /email — Send email via SMTP (admin, manager) ────────────────────────
router.post(
  '/email',
  requireRole(['admin', 'manager']),
  verifyAgentIdentity,
  async (req, res) => {
    try {
      const { to, subject, body: emailBody } = req.body;
      if (!to || !subject || !emailBody) {
        return res.status(400).json({ error: 'to, subject, and body are required' });
      }

      await sendEmail({ to, subject, html: emailBody, text: emailBody });

      res.json({ success: true, to, subject });
    } catch (err) {
      logger.error('Agent POST /email error', err);
      res.status(500).json({ error: 'Failed to send email', detail: err.message });
    }
  },
);

// ── GET /vouchers/validate?code= — Validate promo code (student+) ─────────────
router.get('/vouchers/validate', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'code is required' });

    const { rows } = await pool.query(
      `SELECT id, code, discount_type, discount_value, applicable_services,
              max_uses, used_count, valid_from, valid_until, is_active
       FROM vouchers
       WHERE UPPER(code) = UPPER($1) AND is_active = true`,
      [code.trim()],
    );

    if (!rows.length) {
      return res.json({ valid: false, reason: 'Code not found or inactive' });
    }

    const v = rows[0];
    const now = new Date();

    if (v.valid_from && new Date(v.valid_from) > now) {
      return res.json({ valid: false, reason: 'Code not yet valid' });
    }
    if (v.valid_until && new Date(v.valid_until) < now) {
      return res.json({ valid: false, reason: 'Code has expired' });
    }
    if (v.max_uses && v.used_count >= v.max_uses) {
      return res.json({ valid: false, reason: 'Code has reached its usage limit' });
    }

    res.json({
      valid: true,
      code: v.code,
      discountType: v.discount_type,
      discountValue: toNum(v.discount_value),
      applicableServices: v.applicable_services,
      validUntil: v.valid_until,
    });
  } catch (err) {
    logger.error('Agent GET /vouchers/validate error', err);
    res.status(500).json({ error: 'Failed to validate voucher' });
  }
});

// ── GET /session/:sessionId — Fetch conversation session (n8n internal) ────────
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { rows } = await pool.query(
      `SELECT session_id, user_id, user_role, messages, summary, kb_snapshot, kb_fetched_at, updated_at
       FROM kai_sessions
       WHERE session_id = $1`,
      [sessionId],
    );

    if (!rows.length) {
      return res.json({
        sessionId,
        exists: false,
        messages: [],
        summary: null,
        kbSnapshot: null,
        kbFetchedAt: null,
      });
    }

    const s = rows[0];
    res.json({
      sessionId: s.session_id,
      exists: true,
      userId: s.user_id,
      userRole: s.user_role,
      messages: s.messages,
      summary: s.summary,
      kbSnapshot: s.kb_snapshot,
      kbFetchedAt: s.kb_fetched_at,
      updatedAt: s.updated_at,
    });
  } catch (err) {
    logger.error('Agent GET /session/:sessionId error', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// ── POST /session/:sessionId — Save/update conversation session (n8n internal) ─
router.post('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, role: userRole } = req.agent;
    const { messages, summary, kbSnapshot, kbFetchedAt } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages must be an array' });
    }

    // Keep only the last 50 messages to prevent unbounded growth
    const trimmed = messages.slice(-50);

    await pool.query(
      `INSERT INTO kai_sessions (session_id, user_id, user_role, messages, summary, kb_snapshot, kb_fetched_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (session_id) DO UPDATE
         SET messages     = EXCLUDED.messages,
             summary      = COALESCE(EXCLUDED.summary, kai_sessions.summary),
             user_role    = EXCLUDED.user_role,
             kb_snapshot  = COALESCE(EXCLUDED.kb_snapshot, kai_sessions.kb_snapshot),
             kb_fetched_at = COALESCE(EXCLUDED.kb_fetched_at, kai_sessions.kb_fetched_at),
             updated_at   = NOW()`,
      [
        sessionId,
        (!userId || userId === 'guest') ? null : userId,
        userRole,
        JSON.stringify(trimmed),
        summary || null,
        kbSnapshot || null,
        kbFetchedAt || null,
      ],
    );

    res.json({ success: true, sessionId, messageCount: trimmed.length });
  } catch (err) {
    logger.error('Agent POST /session/:sessionId error', err);
    res.status(500).json({ error: 'Failed to save session' });
  }
});

// ── GET /services — List lesson services + pricing (all roles) ───────────────
router.get('/services', async (req, res) => {
  try {
    const { category, level } = req.query;
    const params = [];
    const conditions = [];

    if (category) {
      params.push(category);
      conditions.push(`s.category = $${params.length}`);
    }
    if (level) {
      params.push(level);
      conditions.push(`s.level = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.description, s.category, s.level, s.service_type,
              s.duration, s.price, s.currency, s.max_participants,
              s.includes, s.lesson_category_tag
       FROM services s
       ${where}
       ORDER BY s.category, s.price`,
      params,
    );

    res.json({ services: rows.map((s) => ({ ...s, price: toNum(s.price), duration: toNum(s.duration) })) });
  } catch (err) {
    logger.error('Agent GET /services error', err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// ── GET /accommodation/units — List accommodation units (all roles) ───────────
router.get('/accommodation/units', async (req, res) => {
  try {
    const { type } = req.query;
    const params = [];
    let extra = '';

    if (type) {
      params.push(type);
      extra = `AND LOWER(au.type) = LOWER($${params.length})`;
    }

    const { rows } = await pool.query(
      `SELECT au.id, au.name, au.type, au.status, au.capacity,
              au.price_per_night, au.description, au.amenities
       FROM accommodation_units au
       WHERE LOWER(au.status) = 'available' ${extra}
       ORDER BY au.price_per_night`,
      params,
    );

    res.json({ units: rows.map((u) => ({ ...u, pricePerNight: toNum(u.price_per_night), price_per_night: undefined })) });
  } catch (err) {
    logger.error('Agent GET /accommodation/units error', err);
    res.status(500).json({ error: 'Failed to fetch accommodation units' });
  }
});

// ── GET /accommodation/bookings/mine — My accommodation bookings ─────────────
router.get('/accommodation/bookings/mine', async (req, res) => {
  try {
    const { userId, role } = req.agent;
    const isAdmin = ['admin', 'manager', 'owner'].includes(role);
    const params = isAdmin ? [] : [userId];

    const { rows } = await pool.query(
      `SELECT ab.id, ab.unit_id, au.name AS unit_name, au.type AS unit_type,
              ab.check_in_date, ab.check_out_date, ab.guests_count,
              ab.total_price, ab.status, ab.notes,
              u.name AS guest_name
       FROM accommodation_bookings ab
       JOIN accommodation_units au ON ab.unit_id = au.id
       JOIN users u ON ab.guest_id = u.id
       WHERE ab.status != 'cancelled' ${isAdmin ? '' : 'AND ab.guest_id = $1'}
       ORDER BY ab.check_in_date DESC
       LIMIT 20`,
      params,
    );

    res.json({ bookings: rows.map((b) => ({ ...b, totalPrice: toNum(b.total_price), total_price: undefined })) });
  } catch (err) {
    logger.error('Agent GET /accommodation/bookings/mine error', err);
    res.status(500).json({ error: 'Failed to fetch accommodation bookings' });
  }
});

// ── POST /accommodation/bookings — Create accommodation booking ───────────────
router.post('/accommodation/bookings', verifyAgentIdentity, async (req, res) => {
  try {
    const { userId, role } = req.agent;
    const { unitId, checkInDate, checkOutDate, guestsCount, notes, guestId } = req.body;
    const isAdmin = ['admin', 'manager', 'owner'].includes(role);
    const targetGuestId = isAdmin && guestId ? guestId : userId;

    if (!unitId || !checkInDate || !checkOutDate) {
      return res.status(400).json({ error: 'unitId, checkInDate, checkOutDate are required' });
    }

    const unitRes = await pool.query(
      `SELECT id, name, price_per_night, status FROM accommodation_units WHERE id = $1`,
      [unitId],
    );
    if (!unitRes.rows.length) return res.status(404).json({ error: 'Accommodation unit not found' });
    const unit = unitRes.rows[0];
    if (unit.status.toLowerCase() !== 'available') {
      return res.status(400).json({ error: `Unit is currently ${unit.status}` });
    }

    const nights = Math.max(
      1,
      Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24)),
    );
    const totalPrice = toNum(unit.price_per_night) * nights;

    const { rows } = await pool.query(
      `INSERT INTO accommodation_bookings
         (unit_id, guest_id, check_in_date, check_out_date, guests_count, total_price, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8)
       RETURNING id, status`,
      [unitId, targetGuestId, checkInDate, checkOutDate, guestsCount || 1, totalPrice, notes || null, userId],
    );

    res.json({
      bookingId: rows[0].id,
      unitName: unit.name,
      checkInDate,
      checkOutDate,
      nights,
      totalPrice,
      status: rows[0].status,
      message: `Accommodation booked for ${nights} night(s). Total: ${totalPrice}.`,
    });
  } catch (err) {
    logger.error('Agent POST /accommodation/bookings error', err);
    res.status(500).json({ error: 'Failed to create accommodation booking' });
  }
});

// ── POST /bookings/:id/cancel — Cancel a lesson booking ──────────────────────
router.post(
  '/bookings/:id/cancel',
  requireRole(['admin', 'manager', 'instructor', 'owner']),
  verifyAgentIdentity,
  async (req, res) => {
    try {
      const { userId, role } = req.agent;
      const { id } = req.params;
      const reason = req.query.reason || req.body?.reason;

      const bookingRes = await pool.query(
        `SELECT b.id, b.status, b.instructor_user_id,
                s.name AS student_name
         FROM bookings b
         LEFT JOIN users s ON s.id = b.student_user_id
         WHERE b.id = $1 AND b.deleted_at IS NULL`,
        [id],
      );
      if (!bookingRes.rows.length) return res.status(404).json({ error: 'Booking not found' });
      const booking = bookingRes.rows[0];
      if (booking.status === 'cancelled') {
        return res.status(400).json({ error: 'Booking is already cancelled' });
      }
      if (role === 'instructor' && booking.instructor_user_id !== userId) {
        return res.status(403).json({ error: 'You can only cancel your own bookings' });
      }

      const cancellationNote = reason ? `Cancelled by ${role}: ${reason}` : `Cancelled by ${role}`;
      await pool.query(
        `UPDATE bookings
         SET status = 'cancelled',
             cancellation_reason = $2,
             canceled_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [id, cancellationNote],
      );

      res.json({
        success: true,
        bookingId: id,
        studentName: booking.student_name,
        message: 'Booking cancelled successfully.',
      });
    } catch (err) {
      logger.error('Agent POST /bookings/:id/cancel error', err);
      res.status(500).json({ error: 'Failed to cancel booking' });
    }
  },
);

// ── GET /weather — Wind/weather forecast for a date (Urla, Izmir) ────────────
router.get('/weather', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const lat = 38.3222;
    const lon = 26.7636;

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m` +
      `&start_date=${targetDate}&end_date=${targetDate}` +
      `&timezone=Europe%2FIstanbul&wind_speed_unit=knots`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Weather API unavailable');
    const data = await response.json();

    const times = data.hourly?.time || [];
    const dirToCardinal = (deg) => {
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      return dirs[Math.round(deg / 45) % 8];
    };

    const keyHours = [9, 12, 15, 18];
    const forecast = keyHours
      .map((h) => {
        const idx = times.findIndex((t) => t.includes(`T${String(h).padStart(2, '0')}:00`));
        if (idx === -1) return null;
        return {
          time: `${h}:00`,
          windKnots: Math.round(data.hourly.wind_speed_10m[idx]),
          gustsKnots: Math.round(data.hourly.wind_gusts_10m[idx]),
          windDirection: dirToCardinal(data.hourly.wind_direction_10m[idx]),
          tempC: Math.round(data.hourly.temperature_2m[idx]),
        };
      })
      .filter(Boolean);

    res.json({ date: targetDate, location: 'Urla, Izmir', forecast });
  } catch (err) {
    logger.error('Agent GET /weather error', err);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// ── GET /equipment — List available rental equipment (all roles) ──────────────
router.get('/equipment', async (req, res) => {
  try {
    const { type } = req.query;
    const params = [];
    let extra = '';

    if (type) {
      params.push(type);
      extra = `AND LOWER(e.type) = LOWER($${params.length})`;
    }

    const { rows } = await pool.query(
      `SELECT e.id, e.name, e.type, e.size, e.brand, e.model,
              e.condition, e.availability, e.notes, e.location
       FROM equipment e
       WHERE LOWER(e.availability) = 'available' ${extra}
       ORDER BY e.type, e.name`,
      params,
    );

    res.json({ equipment: rows });
  } catch (err) {
    logger.error('Agent GET /equipment error', err);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// ── GET /member-offerings — List VIP memberships + passes (all roles) ────────
router.get('/member-offerings', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, price, period, features, badge,
              badge_color, duration_days, category
       FROM member_offerings
       WHERE is_active = true
       ORDER BY sort_order, id`,
    );

    res.json({ offerings: rows.map((o) => ({ ...o, price: toNum(o.price) })) });
  } catch (err) {
    logger.error('Agent GET /member-offerings error', err);
    res.status(500).json({ error: 'Failed to fetch member offerings' });
  }
});

// ── GET /member-offerings/mine — My active subscriptions ─────────────────────
router.get('/member-offerings/mine', async (req, res) => {
  try {
    const { userId: agentUserId, role } = req.agent;
    const isAdmin = ['admin', 'manager', 'owner'].includes(role);
    const targetUserId = isAdmin && req.query.userId ? req.query.userId : agentUserId;

    const { rows } = await pool.query(
      `SELECT mp.id, mp.offering_name, mp.offering_price, mp.offering_currency,
              mp.purchased_at, mp.expires_at, mp.status, mp.payment_method
       FROM member_purchases mp
       WHERE mp.user_id = $1 AND mp.status = 'active'
       ORDER BY mp.purchased_at DESC`,
      [targetUserId],
    );

    res.json({ subscriptions: rows.map((s) => ({ ...s, offeringPrice: toNum(s.offering_price), offering_price: undefined })) });
  } catch (err) {
    logger.error('Agent GET /member-offerings/mine error', err);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// ── GET /knowledge-base — KB entries filtered by role (for system prompt) ─────
router.get('/knowledge-base', async (req, res) => {
  try {
    const role = req.query.role || 'outsider';
    const { rows } = await pool.query(
      `SELECT category, title, content
       FROM kai_knowledge_base
       WHERE is_active = true AND $1 = ANY(applicable_roles)
       ORDER BY category, sort_order, title`,
      [role],
    );
    res.json({ entries: rows });
  } catch (err) {
    logger.error('Agent GET /knowledge-base error', err);
    res.status(500).json({ error: 'Failed to fetch knowledge base' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUPER AGENT TOOLS — Rentals, Progress, Family, Shop, Group Lessons,
//                      Feedback, Waivers, Instructor Skills
// ═══════════════════════════════════════════════════════════════════════════════

// ── RENTALS ──────────────────────────────────────────────────────────────────

// GET /rentals/mine — User's rentals (student: own, admin: optional customerId)
router.get('/rentals/mine', async (req, res) => {
  try {
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);
    const targetId = mgmt.has(role) && req.query.customerId ? req.query.customerId : userId;

    const { rows } = await pool.query(
      `SELECT r.id, r.start_date, r.end_date, r.status, r.total_price, r.payment_status, r.notes,
              r.created_at
       FROM rentals r
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [targetId],
    );

    res.json(rows.map((r) => ({
      rentalId: r.id,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      totalPrice: toNum(r.total_price),
      paymentStatus: r.payment_status,
      notes: r.notes,
      createdAt: r.created_at,
    })));
  } catch (err) {
    logger.error('Agent GET /rentals/mine error', err);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

// GET /rentals/:id — Single rental detail
router.get('/rentals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);

    const { rows } = await pool.query(
      `SELECT r.id, r.user_id, r.start_date, r.end_date, r.status, r.total_price,
              r.payment_status, r.notes, r.created_at,
              u.name AS customer_name
       FROM rentals r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = $1`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Rental not found' });
    if (!mgmt.has(role) && rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const r = rows[0];
    res.json({
      rentalId: r.id,
      customerName: r.customer_name,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      totalPrice: toNum(r.total_price),
      paymentStatus: r.payment_status,
      notes: r.notes,
      createdAt: r.created_at,
    });
  } catch (err) {
    logger.error('Agent GET /rentals/:id error', err);
    res.status(500).json({ error: 'Failed to fetch rental' });
  }
});

// ── STUDENT PROGRESS ─────────────────────────────────────────────────────────

// GET /progress/:studentId — Skill data, lesson count, avg rating
router.get('/progress/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);

    if (!mgmt.has(role) && role !== 'instructor' && userId !== studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (role === 'instructor') {
      const { rows: check } = await pool.query(
        `SELECT 1 FROM bookings WHERE instructor_user_id = $1 AND student_user_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [userId, studentId],
      );
      if (!check.length) return res.status(403).json({ error: 'Not your student' });
    }

    const [userRes, bookingRes, ratingRes] = await Promise.all([
      pool.query(`SELECT name, email FROM users WHERE id = $1`, [studentId]),
      pool.query(
        `SELECT COUNT(*) AS total_lessons,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed_lessons
         FROM bookings WHERE student_user_id = $1 AND deleted_at IS NULL`,
        [studentId],
      ),
      pool.query(
        `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS feedback_count
         FROM feedback WHERE student_id = $1`,
        [studentId],
      ),
    ]);

    const user = userRes.rows[0];
    const booking = bookingRes.rows[0];
    const rating = ratingRes.rows[0];

    res.json({
      studentId,
      name: user?.name || 'Unknown',
      totalLessons: parseInt(booking?.total_lessons) || 0,
      completedLessons: parseInt(booking?.completed_lessons) || 0,
      averageRating: toNum(rating?.avg_rating),
      feedbackCount: parseInt(rating?.feedback_count) || 0,
    });
  } catch (err) {
    logger.error('Agent GET /progress/:studentId error', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// GET /feedback/:bookingId — Lesson feedback for a booking
router.get('/feedback/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);

    const { rows } = await pool.query(
      `SELECT f.rating, f.comment, f.skill_level, f.progress_notes, f.created_at,
              b.student_user_id, b.instructor_user_id
       FROM feedback f
       JOIN bookings b ON b.id = f.booking_id
       WHERE f.booking_id = $1`,
      [bookingId],
    );
    if (!rows.length) return res.status(404).json({ error: 'No feedback for this booking' });
    const f = rows[0];
    if (!mgmt.has(role) && userId !== f.student_user_id && userId !== f.instructor_user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({
      rating: f.rating,
      comment: f.comment,
      skillLevel: f.skill_level,
      progressNotes: f.progress_notes,
      createdAt: f.created_at,
    });
  } catch (err) {
    logger.error('Agent GET /feedback/:bookingId error', err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// ── FAMILY ───────────────────────────────────────────────────────────────────

// GET /family — User's family members
router.get('/family', async (req, res) => {
  try {
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);
    const targetId = mgmt.has(role) && req.query.userId ? req.query.userId : userId;

    const { rows } = await pool.query(
      `SELECT id, full_name, date_of_birth, relationship, gender, medical_notes, emergency_contact, is_active
       FROM family_members
       WHERE parent_user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at`,
      [targetId],
    );

    res.json(rows.map((fm) => ({
      id: fm.id,
      fullName: fm.full_name,
      dateOfBirth: fm.date_of_birth,
      relationship: fm.relationship,
      gender: fm.gender,
      medicalNotes: fm.medical_notes,
      emergencyContact: fm.emergency_contact,
      isActive: fm.is_active,
    })));
  } catch (err) {
    logger.error('Agent GET /family error', err);
    res.status(500).json({ error: 'Failed to fetch family members' });
  }
});

// POST /family — Add family member
router.post('/family', verifyAgentIdentity, async (req, res) => {
  try {
    const { userId } = req.agent;
    const { fullName, dateOfBirth, relationship, gender, medicalNotes, emergencyContact } = req.body;

    if (!fullName || !dateOfBirth || !relationship) {
      return res.status(400).json({ error: 'fullName, dateOfBirth, and relationship are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO family_members (parent_user_id, full_name, date_of_birth, relationship, gender, medical_notes, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, date_of_birth, relationship`,
      [userId, fullName.trim(), dateOfBirth, relationship, gender || null, medicalNotes || null, emergencyContact || null],
    );

    res.status(201).json({
      id: rows[0].id,
      fullName: rows[0].full_name,
      dateOfBirth: rows[0].date_of_birth,
      relationship: rows[0].relationship,
      message: `Family member ${fullName} added successfully.`,
    });
  } catch (err) {
    logger.error('Agent POST /family error', err);
    res.status(500).json({ error: 'Failed to add family member' });
  }
});

// ── SHOP / PRODUCTS ──────────────────────────────────────────────────────────

// GET /products — Browse product catalog
router.get('/products', async (req, res) => {
  try {
    const { category, search } = req.query;
    const params = [];
    const conditions = [`status = 'active'`];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }

    const { rows } = await pool.query(
      `SELECT id, name, description, category, subcategory, brand, price, currency,
              stock_quantity, image_url, is_featured
       FROM products
       WHERE ${conditions.join(' AND ')}
       ORDER BY is_featured DESC, name
       LIMIT 30`,
      params,
    );

    res.json(rows.map((p) => ({
      productId: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      subcategory: p.subcategory,
      brand: p.brand,
      price: toNum(p.price),
      currency: p.currency,
      inStock: (p.stock_quantity || 0) > 0,
      imageUrl: p.image_url,
      featured: p.is_featured,
    })));
  } catch (err) {
    logger.error('Agent GET /products error', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /products/:id — Single product detail
router.get('/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, description_detailed, category, subcategory, brand,
              price, original_price, currency, stock_quantity, image_url, images, sizes, colors, variants
       FROM products WHERE id = $1 AND status = 'active'`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    const p = rows[0];
    res.json({
      productId: p.id,
      name: p.name,
      description: p.description,
      detailedDescription: p.description_detailed,
      category: p.category,
      subcategory: p.subcategory,
      brand: p.brand,
      price: toNum(p.price),
      originalPrice: toNum(p.original_price),
      currency: p.currency,
      inStock: (p.stock_quantity || 0) > 0,
      stockQuantity: p.stock_quantity,
      imageUrl: p.image_url,
      images: p.images,
      sizes: p.sizes,
      colors: p.colors,
      variants: p.variants,
    });
  } catch (err) {
    logger.error('Agent GET /products/:id error', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// GET /shop-orders/mine — User's order history
router.get('/shop-orders/mine', async (req, res) => {
  try {
    const { userId, role } = req.agent;
    const mgmt = new Set(['admin', 'manager', 'owner']);
    const targetId = mgmt.has(role) && req.query.customerId ? req.query.customerId : userId;

    const { rows } = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.payment_method, o.payment_status,
              o.total_amount, o.currency, o.created_at,
              COALESCE(
                json_agg(json_build_object(
                  'name', oi.product_name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price
                )) FILTER (WHERE oi.id IS NOT NULL), '[]'
              ) AS items
       FROM shop_orders o
       LEFT JOIN shop_order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [targetId],
    );

    res.json(rows.map((o) => ({
      orderId: o.id,
      orderNumber: o.order_number,
      status: o.status,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      totalAmount: toNum(o.total_amount),
      currency: o.currency,
      items: o.items,
      createdAt: o.created_at,
    })));
  } catch (err) {
    logger.error('Agent GET /shop-orders/mine error', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST /shop-orders — Create shop order
router.post(
  '/shop-orders',
  verifyAgentIdentity,
  async (req, res) => {
    const { userId, role } = req.agent;
    const student = new Set(['student', 'trusted_customer']);
    const { items, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required with at least one item' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let subtotal = 0;
      const orderItems = [];

      for (const item of items) {
        const { rows: pRows } = await client.query(
          `SELECT id, name, price, currency, stock_quantity, image_url FROM products WHERE id = $1 AND status = 'active'`,
          [item.productId],
        );
        if (!pRows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Product ${item.productId} not found` });
        }
        const p = pRows[0];
        const qty = parseInt(item.quantity) || 1;
        if ((p.stock_quantity || 0) < qty) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `${p.name} is out of stock` });
        }
        const lineTotal = toNum(p.price) * qty;
        subtotal += lineTotal;
        orderItems.push({ product: p, qty, lineTotal });
      }

      const { rows: orderRows } = await client.query(
        `INSERT INTO shop_orders (user_id, status, payment_method, payment_status, subtotal, total_amount, currency, notes)
         VALUES ($1, 'pending', 'cash', 'pending', $2, $2, 'EUR', $3)
         RETURNING id, order_number`,
        [userId, subtotal, notes || null],
      );
      const order = orderRows[0];

      for (const oi of orderItems) {
        await client.query(
          `INSERT INTO shop_order_items (order_id, product_id, product_name, product_image, brand, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)`,
          [order.id, oi.product.id, oi.product.name, oi.product.image_url, oi.qty, toNum(oi.product.price), oi.lineTotal],
        );
        await client.query(
          `UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = NOW() WHERE id = $2`,
          [oi.qty, oi.product.id],
        );
      }

      await client.query('COMMIT');
      res.status(201).json({
        orderId: order.id,
        orderNumber: order.order_number,
        totalAmount: subtotal,
        itemCount: orderItems.length,
        status: 'pending',
        message: `Order ${order.order_number} created successfully (${orderItems.length} items, total: EUR ${subtotal}).`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Agent POST /shop-orders error', err);
      res.status(500).json({ error: 'Failed to create order' });
    } finally {
      client.release();
    }
  },
);

// ── GROUP LESSON REQUESTS ────────────────────────────────────────────────────

// GET /group-lesson-requests/mine — User's requests
router.get('/group-lesson-requests/mine', async (req, res) => {
  try {
    const { userId } = req.agent;
    const { rows } = await pool.query(
      `SELECT glr.id, glr.preferred_date_start, glr.preferred_date_end,
              glr.preferred_time_of_day, glr.preferred_duration_hours,
              glr.skill_level, glr.status, glr.notes, glr.created_at,
              s.name AS service_name
       FROM group_lesson_requests glr
       JOIN services s ON s.id = glr.service_id
       WHERE glr.user_id = $1 AND glr.deleted_at IS NULL
       ORDER BY glr.created_at DESC
       LIMIT 10`,
      [userId],
    );

    res.json(rows.map((r) => ({
      requestId: r.id,
      serviceName: r.service_name,
      dateStart: r.preferred_date_start,
      dateEnd: r.preferred_date_end,
      timeOfDay: r.preferred_time_of_day,
      durationHours: toNum(r.preferred_duration_hours),
      skillLevel: r.skill_level,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
    })));
  } catch (err) {
    logger.error('Agent GET /group-lesson-requests/mine error', err);
    res.status(500).json({ error: 'Failed to fetch group lesson requests' });
  }
});

// POST /group-lesson-requests — Submit a group lesson request
router.post('/group-lesson-requests', verifyAgentIdentity, async (req, res) => {
  try {
    const { userId } = req.agent;
    const { serviceId, preferredDateStart, preferredDateEnd, preferredTimeOfDay, skillLevel, notes } = req.body;

    if (!serviceId || !preferredDateStart) {
      return res.status(400).json({ error: 'serviceId and preferredDateStart are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO group_lesson_requests (user_id, service_id, preferred_date_start, preferred_date_end, preferred_time_of_day, skill_level, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status`,
      [userId, serviceId, preferredDateStart, preferredDateEnd || null, preferredTimeOfDay || 'any', skillLevel || 'beginner', notes || null],
    );

    res.status(201).json({
      requestId: rows[0].id,
      status: rows[0].status,
      message: 'Group lesson request submitted. We will match you with other students and notify you!',
    });
  } catch (err) {
    logger.error('Agent POST /group-lesson-requests error', err);
    res.status(500).json({ error: 'Failed to submit group lesson request' });
  }
});

// ── FEEDBACK & RATINGS ───────────────────────────────────────────────────────

// POST /feedback — Submit lesson feedback
router.post('/feedback', verifyAgentIdentity, async (req, res) => {
  try {
    const { userId } = req.agent;
    const { bookingId, rating, comment } = req.body;

    if (!bookingId || !rating) {
      return res.status(400).json({ error: 'bookingId and rating (1-5) are required' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Verify booking belongs to user
    const { rows: bRows } = await pool.query(
      `SELECT id, student_user_id, instructor_user_id FROM bookings WHERE id = $1 AND deleted_at IS NULL`,
      [bookingId],
    );
    if (!bRows.length) return res.status(404).json({ error: 'Booking not found' });
    if (bRows[0].student_user_id !== userId) {
      return res.status(403).json({ error: 'You can only leave feedback for your own bookings' });
    }

    // Check for existing feedback
    const { rows: existing } = await pool.query(
      `SELECT id FROM feedback WHERE booking_id = $1`, [bookingId],
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Feedback already submitted for this booking' });
    }

    await pool.query(
      `INSERT INTO feedback (booking_id, student_id, instructor_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [bookingId, userId, bRows[0].instructor_user_id, parseInt(rating), comment || null],
    );

    res.status(201).json({ message: `Thank you! Your ${rating}-star feedback has been recorded.` });
  } catch (err) {
    logger.error('Agent POST /feedback error', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// GET /instructor-ratings/:id — Instructor rating summary
router.get('/instructor-ratings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT ROUND(AVG(rating), 1) AS avg_rating,
              COUNT(*) AS total_reviews,
              COUNT(*) FILTER (WHERE rating = 5) AS five_star,
              COUNT(*) FILTER (WHERE rating = 4) AS four_star,
              COUNT(*) FILTER (WHERE rating = 3) AS three_star,
              COUNT(*) FILTER (WHERE rating <= 2) AS low_star
       FROM instructor_ratings
       WHERE instructor_id = $1`,
      [id],
    );
    const r = rows[0];
    const { rows: nameRows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [id]);

    res.json({
      instructorId: id,
      instructorName: nameRows[0]?.name || 'Unknown',
      averageRating: toNum(r.avg_rating),
      totalReviews: parseInt(r.total_reviews) || 0,
      breakdown: {
        fiveStar: parseInt(r.five_star) || 0,
        fourStar: parseInt(r.four_star) || 0,
        threeStar: parseInt(r.three_star) || 0,
        lowStar: parseInt(r.low_star) || 0,
      },
    });
  } catch (err) {
    logger.error('Agent GET /instructor-ratings/:id error', err);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// ── WAIVERS ──────────────────────────────────────────────────────────────────

// GET /waivers/status — User's current waiver status
router.get('/waivers/status', async (req, res) => {
  try {
    const { userId } = req.agent;

    const { rows: waiverRows } = await pool.query(
      `SELECT id, waiver_version, signed_at, photo_consent
       FROM liability_waivers
       WHERE user_id = $1
       ORDER BY signed_at DESC
       LIMIT 1`,
      [userId],
    );

    const { rows: familyRows } = await pool.query(
      `SELECT fm.id, fm.full_name,
              (SELECT lw.signed_at FROM liability_waivers lw WHERE lw.family_member_id = fm.id ORDER BY lw.signed_at DESC LIMIT 1) AS waiver_signed_at
       FROM family_members fm
       WHERE fm.parent_user_id = $1 AND fm.deleted_at IS NULL AND fm.is_active = true`,
      [userId],
    );

    const userWaiver = waiverRows[0];
    res.json({
      userWaiverSigned: !!userWaiver,
      userWaiverDate: userWaiver?.signed_at || null,
      userWaiverVersion: userWaiver?.waiver_version || null,
      photoConsent: userWaiver?.photo_consent || false,
      familyMembers: familyRows.map((fm) => ({
        id: fm.id,
        name: fm.full_name,
        waiverSigned: !!fm.waiver_signed_at,
        waiverDate: fm.waiver_signed_at,
      })),
    });
  } catch (err) {
    logger.error('Agent GET /waivers/status error', err);
    res.status(500).json({ error: 'Failed to fetch waiver status' });
  }
});

// ── INSTRUCTOR SKILLS ────────────────────────────────────────────────────────

// GET /instructors/by-skill — Find instructors by discipline and level
router.get('/instructors/by-skill', async (req, res) => {
  try {
    const { discipline, level } = req.query;
    if (!discipline) {
      return res.status(400).json({ error: 'discipline is required (kite, wing, kite_foil, efoil, premium)' });
    }

    const params = [discipline];
    let levelCondition = '';
    if (level) {
      const levelOrder = { beginner: 1, intermediate: 2, advanced: 3 };
      const requiredLevel = levelOrder[level] || 1;
      // Instructor's max_level must be >= required level
      params.push(level);
      levelCondition = `AND (
        CASE is2.max_level WHEN 'advanced' THEN 3 WHEN 'intermediate' THEN 2 ELSE 1 END
        >= CASE $${params.length} WHEN 'advanced' THEN 3 WHEN 'intermediate' THEN 2 ELSE 1 END
      )`;
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.name, is2.discipline_tag, is2.lesson_categories, is2.max_level,
              COALESCE(ROUND(AVG(ir.rating), 1), 0) AS avg_rating,
              COUNT(ir.id) AS review_count
       FROM instructor_skills is2
       JOIN users u ON u.id = is2.instructor_id AND u.deleted_at IS NULL
       LEFT JOIN instructor_ratings ir ON ir.instructor_id = u.id
       WHERE is2.discipline_tag = $1 ${levelCondition}
       GROUP BY u.id, u.name, is2.discipline_tag, is2.lesson_categories, is2.max_level
       ORDER BY avg_rating DESC, review_count DESC`,
      params,
    );

    res.json(rows.map((r) => ({
      instructorId: r.id,
      name: r.name,
      discipline: r.discipline_tag,
      lessonCategories: r.lesson_categories,
      maxLevel: r.max_level,
      avgRating: toNum(r.avg_rating),
      reviewCount: parseInt(r.review_count) || 0,
    })));
  } catch (err) {
    logger.error('Agent GET /instructors/by-skill error', err);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
});

// ── INSTRUCTOR RECOMMENDATION ────────────────────────────────────────────────

// GET /instructors/recommend — Best match for a lesson (category + level + date)
router.get('/instructors/recommend', async (req, res) => {
  try {
    const { discipline, level, date } = req.query;
    if (!discipline) {
      return res.status(400).json({ error: 'discipline is required' });
    }

    const levelOrder = { beginner: 1, intermediate: 2, advanced: 3 };
    const requiredLevel = levelOrder[level] || 1;

    // Find instructors with matching skills, ordered by rating
    const { rows: candidates } = await pool.query(
      `SELECT u.id, u.name, is2.max_level,
              COALESCE(ROUND(AVG(ir.rating), 1), 0) AS avg_rating,
              COUNT(ir.id) AS review_count
       FROM instructor_skills is2
       JOIN users u ON u.id = is2.instructor_id AND u.deleted_at IS NULL
       LEFT JOIN instructor_ratings ir ON ir.instructor_id = u.id
       WHERE is2.discipline_tag = $1
         AND (CASE is2.max_level WHEN 'advanced' THEN 3 WHEN 'intermediate' THEN 2 ELSE 1 END >= $2)
       GROUP BY u.id, u.name, is2.max_level
       ORDER BY avg_rating DESC, review_count DESC
       LIMIT 5`,
      [discipline, requiredLevel],
    );

    // If date provided, check availability
    let results = candidates;
    if (date && candidates.length > 0) {
      const instructorIds = candidates.map((c) => c.id);
      const { rows: busyRows } = await pool.query(
        `SELECT DISTINCT instructor_user_id FROM bookings
         WHERE date = $1 AND instructor_user_id = ANY($2)
           AND status NOT IN ('cancelled', 'pending_payment') AND deleted_at IS NULL`,
        [date, instructorIds],
      );
      const busySet = new Set(busyRows.map((r) => r.instructor_user_id));
      results = candidates.map((c) => ({
        ...c,
        availableOnDate: !busySet.has(c.id),
      }));
    }

    res.json(results.slice(0, 3).map((r) => ({
      instructorId: r.id,
      name: r.name,
      maxLevel: r.max_level,
      avgRating: toNum(r.avg_rating),
      reviewCount: parseInt(r.review_count) || 0,
      availableOnDate: r.availableOnDate ?? null,
    })));
  } catch (err) {
    logger.error('Agent GET /instructors/recommend error', err);
    res.status(500).json({ error: 'Failed to recommend instructors' });
  }
});

export default router;

