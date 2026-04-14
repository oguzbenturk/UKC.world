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
import { dispatchNotification, dispatchToStaff } from '../services/notificationDispatcherUnified.js';
import { getDashboardSummary } from '../services/dashboardSummaryService.js';
import bookingNotificationService from '../services/bookingNotificationService.js';
import { logAuditEvent } from '../services/auditLogService.js';

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
      const { q, query } = req.query;
      const searchTerm = (q || query || '').trim();
      if (searchTerm.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters' });
      }

      const search = `%${searchTerm}%`;
      const { rows } = await pool.query(
        `SELECT u.id,
                COALESCE(u.name, TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,''))) AS name,
                u.email, u.phone, r.name AS role,
                COALESCE(wb.available_amount, 0) AS wallet_balance,
                COALESCE(wb.currency, 'EUR') AS currency
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN wallet_balances wb ON wb.user_id = u.id
         WHERE u.deleted_at IS NULL
           AND (
             u.name       ILIKE $1
             OR u.first_name ILIKE $1
             OR u.last_name  ILIKE $1
             OR (u.first_name || ' ' || u.last_name) ILIKE $1
             OR u.email   ILIKE $1
             OR u.phone   ILIKE $1
           )
         ORDER BY COALESCE(u.name, u.first_name) NULLS LAST
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

    // Return all wallet balances so Kai can report both EUR and TRY if present
    const { rows } = await pool.query(
      `SELECT currency, available_amount
       FROM wallet_balances
       WHERE user_id = $1
       ORDER BY CASE WHEN currency = 'EUR' THEN 0 ELSE 1 END, available_amount DESC`,
      [id],
    );

    if (!rows.length) {
      return res.json({ userId: id, currency: 'EUR', availableAmount: 0 });
    }

    // Return primary (EUR preferred) and include others
    const primary = rows[0];
    const allBalances = rows.map(r => ({ currency: r.currency, amount: toNum(r.available_amount) }));
    res.json({
      userId: id,
      currency: primary.currency,
      availableAmount: toNum(primary.available_amount),
      allBalances,
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
      `SELECT cp.id, cp.package_name, cp.total_hours, cp.used_hours, cp.remaining_hours,
              cp.status, cp.expiry_date, cp.lesson_service_name,
              s.id AS service_id, s.name AS service_name
       FROM customer_packages cp
       LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
       LEFT JOIN services s ON LOWER(s.name) = LOWER(COALESCE(cp.lesson_service_name, sp.lesson_service_name))
       WHERE cp.customer_id = $1
       ORDER BY cp.created_at DESC`,
      [id],
    );

    res.json(
      rows.map((p) => ({
        packageId: p.id,
        packageName: p.package_name,
        serviceId: p.service_id || null,
        serviceName: p.service_name || p.lesson_service_name || null,
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
// Supports: package-based (customerPackageId), wallet, or cash/card payment.
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
      customerPackageId,
      paymentMethod = customerPackageId ? 'package' : 'cash',
      notes = '',
    } = req.body;

    // Force student to only book for themselves
    let studentUserId = req.body.customerId || req.body.studentId || userId;
    if (student.has(role)) {
      studentUserId = userId;
    }

    // Students can ONLY book from packages — no wallet/cash/card
    if (student.has(role) && !customerPackageId) {
      return res.status(400).json({ error: 'Students must book from a package. Provide customerPackageId.' });
    }

    if (!serviceId || !date || startHour == null) {
      return res.status(400).json({ error: 'serviceId, date, and startHour are required' });
    }

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
      const bookingDuration = toNum(service.duration) || 1;
      const amount = toNum(service.price) || 0;

      let finalPaymentStatus = 'pending';
      let finalAmount = amount;
      let usedPackageId = null;

      // ── Package-based booking ──────────────────────────────────────────
      if (customerPackageId) {
        const { rows: pkgRows } = await client.query(
          `SELECT id, package_name, remaining_hours, total_hours, used_hours, purchase_price, status
           FROM customer_packages
           WHERE id = $1 AND customer_id = $2
             AND status IN ('active', 'waiting_payment')
             AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $3)
             AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)`,
          [customerPackageId, studentUserId, bookingDuration],
        );
        if (!pkgRows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Package not found, not active, or insufficient hours remaining' });
        }
        const pkg = pkgRows[0];
        const currentUsed = toNum(pkg.used_hours) || 0;
        const currentRemaining = pkg.remaining_hours != null
          ? toNum(pkg.remaining_hours)
          : Math.max(0, (toNum(pkg.total_hours) || 0) - currentUsed);
        const newUsed = currentUsed + bookingDuration;
        const newRemaining = currentRemaining - bookingDuration;

        const { rows: updatedPkg } = await client.query(
          `UPDATE customer_packages
           SET used_hours = $1::numeric, remaining_hours = $2::numeric,
               last_used_date = $5,
               updated_at = CURRENT_TIMESTAMP,
               status = CASE
                 WHEN $2::numeric <= 0
                   AND COALESCE(rental_days_remaining, 0) <= 0
                   AND COALESCE(accommodation_nights_remaining, 0) <= 0
                 THEN 'used_up'
                 WHEN status = 'waiting_payment' THEN 'waiting_payment'
                 ELSE 'active'
               END
           WHERE id = $3 AND status IN ('active', 'waiting_payment')
             AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $4::numeric)
           RETURNING id, package_name, used_hours, remaining_hours, status`,
          [newUsed, newRemaining, customerPackageId, bookingDuration, date],
        );
        if (!updatedPkg.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Package update failed — hours may have changed' });
        }

        finalPaymentStatus = pkg.status === 'waiting_payment' ? 'pending_payment' : 'package';
        const pkgPrice = toNum(pkg.purchase_price) || 0;
        const pkgTotal = toNum(pkg.total_hours) || 1;
        finalAmount = pkgPrice > 0 ? parseFloat(((pkgPrice / pkgTotal) * bookingDuration).toFixed(2)) : 0;
        usedPackageId = customerPackageId;

      // ── Wallet payment ─────────────────────────────────────────────────
      } else if (paymentMethod === 'wallet') {
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
        finalPaymentStatus = 'paid';
      }

      const bookingStatus = finalPaymentStatus === 'pending_payment' ? 'pending_payment' : 'confirmed';

      const { rows: bookingRows } = await client.query(
        `INSERT INTO bookings (
           service_id, student_user_id, instructor_user_id,
           date, start_hour, duration, customer_package_id,
           status, payment_status, amount, final_amount,
           notes, location, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'TBD', $13, $13)
         RETURNING id`,
        [
          serviceId,
          studentUserId,
          instructorId || null,
          date,
          parseFloat(startHour),
          bookingDuration,
          usedPackageId,
          bookingStatus,
          finalPaymentStatus,
          finalAmount,
          finalAmount,
          notes || '',
          userId,
        ],
      );

      const bookingId = bookingRows[0].id;

      // Deduct from wallet if applicable
      if (paymentMethod === 'wallet' && !customerPackageId && amount > 0) {
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

      // Notify all participants: student, instructor, admin, manager, frontdesk
      try {
        await bookingNotificationService.sendBookingCreated({ bookingId });
      } catch (notifErr) {
        logger.warn('Agent POST /bookings: notification dispatch failed', {
          bookingId,
          error: notifErr?.message,
        });
      }

      logAuditEvent({
        eventType: 'kai.booking.create',
        action: 'create',
        resourceType: 'booking',
        resourceId: bookingId,
        actorUserId: userId,
        description: `Kai created booking for ${service.name} on ${date}`,
        metadata: { via: 'kai', role, serviceId, date, startHour, paymentMethod: customerPackageId ? 'package' : paymentMethod },
      }).catch((e) => logger.warn('Kai audit log failed (booking create)', e.message));

      res.status(201).json({
        bookingId,
        serviceName: service.name,
        date,
        startHour: parseFloat(startHour),
        amount: finalAmount,
        paymentMethod: customerPackageId ? 'package' : paymentMethod,
        packageUsed: usedPackageId ? true : false,
        status: bookingStatus,
        message: customerPackageId
          ? `Booking confirmed from package for ${service.name} on ${date} at ${startHour}:00.`
          : `Booking confirmed for ${service.name} on ${date} at ${startHour}:00.`,
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

      const { userId: actorId, role: actorRole } = req.agent;

      // Target a single user
      if (targetUserId) {
        await dispatchNotification({ userId: targetUserId, type, title, message });
        logAuditEvent({
          eventType: 'kai.notification.send',
          action: 'create',
          resourceType: 'notification',
          actorUserId: actorId,
          targetUserId,
          description: `Kai sent notification: ${title}`,
          metadata: { via: 'kai', role: actorRole, type },
        }).catch((e) => logger.warn('Kai audit log failed (notify)', e.message));
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
        const ids = rows.map((id) => id.id);
        await Promise.all(ids.map((id) => dispatchNotification({ userId: id, type, title, message })));
        logAuditEvent({
          eventType: 'kai.notification.send',
          action: 'create',
          resourceType: 'notification',
          actorUserId: actorId,
          description: `Kai sent bulk notification to role ${targetRole}: ${title}`,
          metadata: { via: 'kai', role: actorRole, targetRole, type, count: ids.length },
        }).catch((e) => logger.warn('Kai audit log failed (notify bulk)', e.message));
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

      const { userId: emailActorId, role: emailActorRole } = req.agent;
      logAuditEvent({
        eventType: 'kai.email.send',
        action: 'create',
        resourceType: 'email',
        actorUserId: emailActorId,
        description: `Kai sent email to ${to}: ${subject}`,
        metadata: { via: 'kai', role: emailActorRole, to, subject },
      }).catch((e) => logger.warn('Kai audit log failed (email)', e.message));

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
      `SELECT id, code, voucher_type, discount_value, applies_to,
              max_total_uses, total_uses, valid_from, valid_until, is_active
       FROM voucher_codes
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
    if (v.max_total_uses && v.total_uses >= v.max_total_uses) {
      return res.json({ valid: false, reason: 'Code has reached its usage limit' });
    }

    res.json({
      valid: true,
      code: v.code,
      discountType: v.voucher_type,
      discountValue: toNum(v.discount_value),
      applicableServices: v.applies_to,
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
    const { messages, summary, kbSnapshot, kbFetchedAt } = req.body;

    // n8n's Save Session node sends userId/userRole in the body because it doesn't
    // forward the user headers — use body values, fall back to agent middleware values.
    const agentUserId   = req.agent.userId;
    const agentUserRole = req.agent.role;
    const userId   = (req.body.userId   && req.body.userId   !== 'guest') ? req.body.userId   : agentUserId;
    const userRole = (req.body.userRole && req.body.userRole !== 'outsider') ? req.body.userRole : agentUserRole;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages must be an array' });
    }

    // Keep only the last 30 messages to prevent unbounded growth
    const trimmed = messages.slice(-30);

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

// ── GET /staff — List instructors (all authenticated roles) ──────────────────
router.get('/staff', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE LOWER(r.name) = 'instructor'
         AND u.deleted_at IS NULL
       ORDER BY u.name`,
    );
    res.json({ instructors: rows });
  } catch (err) {
    logger.error('Agent GET /staff error', err);
    res.status(500).json({ error: 'Failed to fetch instructors' });
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

// ── POST /bookings/:id/status — Update booking status (admin/manager/instructor) ─
router.post(
  '/bookings/:id/status',
  requireRole(['admin', 'manager', 'instructor', 'owner']),
  verifyAgentIdentity,
  async (req, res) => {
    try {
      const { userId, role } = req.agent;
      const { id } = req.params;
      const status = (req.body?.status || req.query.status || '').toLowerCase();

      const ALLOWED = ['confirmed', 'completed', 'pending', 'cancelled'];
      if (!ALLOWED.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${ALLOWED.join(', ')}` });
      }

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

      if (role === 'instructor' && booking.instructor_user_id !== userId) {
        return res.status(403).json({ error: 'You can only update your own bookings' });
      }

      if (status === 'cancelled') {
        await pool.query(
          `UPDATE bookings
           SET status = 'cancelled',
               cancellation_reason = $2,
               canceled_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [id, `Cancelled by ${role} via Kai`],
        );
      } else {
        await pool.query(
          `UPDATE bookings SET status = $2, updated_at = NOW() WHERE id = $1`,
          [id, status],
        );
      }

      res.json({
        success: true,
        bookingId: id,
        studentName: booking.student_name,
        previousStatus: booking.status,
        newStatus: status,
        message: `Booking marked as ${status}.`,
      });
    } catch (err) {
      logger.error('Agent POST /bookings/:id/status error', err);
      res.status(500).json({ error: 'Failed to update booking status' });
    }
  },
);

// ── POST /bookings/:id/reschedule — Student self-reschedule (24h window) ────────
router.post(
  '/bookings/:id/reschedule',
  requireRole(['student', 'trusted_customer']),
  verifyAgentIdentity,
  async (req, res) => {
    try {
      const { userId } = req.agent;
      const { id } = req.params;
      const newDate = req.query.newDate || req.body?.newDate;
      const newHour = req.query.newHour ?? req.body?.newHour;

      if (!newDate || newHour == null) {
        return res.status(400).json({ error: 'newDate and newHour are required' });
      }

      const { rows } = await pool.query(
        `SELECT b.id, b.date, b.start_hour, b.status,
                (b.date + (b.start_hour * INTERVAL '1 hour')) AS start_ts,
                u.name AS student_name
         FROM bookings b
         LEFT JOIN users u ON u.id = $2
         WHERE b.id = $1
           AND (b.student_user_id = $2 OR b.customer_user_id = $2)
           AND b.deleted_at IS NULL`,
        [id, userId],
      );

      if (!rows.length) return res.status(404).json({ error: 'Booking not found or not yours' });
      if (rows[0].status === 'cancelled') {
        return res.status(400).json({ error: 'Cannot reschedule a cancelled booking' });
      }

      const hoursUntil = (new Date(rows[0].start_ts) - new Date()) / 3600000;
      if (hoursUntil < 24) {
        return res.status(400).json({
          error: `Reschedule window passed (${Math.round(hoursUntil)}h until lesson). Contact WhatsApp: +90 507 138 91 96`,
        });
      }

      await pool.query(
        `UPDATE bookings SET date = $1, start_hour = $2, updated_at = NOW() WHERE id = $3`,
        [newDate, parseFloat(newHour), id],
      );

      const studentName = rows[0].student_name || 'Student';
      dispatchToStaff({
        type: 'booking_update',
        title: 'Booking Rescheduled via Kai',
        message: `${studentName} rescheduled a lesson to ${newDate} at ${newHour}:00 via Kai.`,
        roles: ['super_admin', 'admin', 'manager', 'owner', 'frontdesk'],
      }).catch((e) => logger.warn('Kai reschedule staff notify failed', e.message));

      logAuditEvent({
        eventType: 'kai.booking.reschedule',
        action: 'update',
        resourceType: 'booking',
        resourceId: id,
        actorUserId: userId,
        description: `Kai rescheduled booking to ${newDate} at ${newHour}:00`,
        metadata: { via: 'kai', role: 'student', newDate, newHour },
      }).catch((e) => logger.warn('Kai audit log failed (reschedule)', e.message));

      res.json({ success: true, message: `Booking rescheduled to ${newDate} at ${newHour}:00.` });
    } catch (err) {
      logger.error('Agent POST /bookings/:id/reschedule error', err);
      res.status(500).json({ error: 'Failed to reschedule booking' });
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
      `&timezone=Europe%2FIstanbul&wind_speed_unit=kn`;

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

export default router;

