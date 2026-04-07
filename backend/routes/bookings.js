// Backend routes loaded
import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { bookingService } from '../services/bookingService.js';
import BookingUpdateCascadeService from '../services/bookingUpdateCascadeService.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middlewares/errorHandler.js';
import { queueRatingReminder } from '../services/ratingService.js';
import bookingNotificationService from '../services/bookingNotificationService.js';
import { resolveActorId, appendCreatedBy } from '../utils/auditUtils.js';
import { recordTransaction as recordWalletTransaction, recordLegacyTransaction } from '../services/walletService.js';
import { checkAndUpgradeAfterBooking } from '../services/roleUpgradeService.js';
import { getServicePriceInCurrency } from '../services/multiCurrencyPriceService.js';
import voucherService from '../services/voucherService.js';
import { sendEmail } from '../services/emailService.js';
import { insertNotification } from '../services/notificationWriter.js';
import socketService from '../services/socketService.js';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';

const router = express.Router();
// Feature flag to optionally create cash transactions for partial package users
const BILLING_PARTIAL_PRECISION = (process.env.BILLING_PARTIAL_PRECISION === '1');
const DEFAULT_CURRENCY = process.env.DEFAULT_WALLET_CURRENCY?.toUpperCase() || 'EUR';

// Simple rate limiting map
const rateLimitMap = new Map();

// Cleanup rate limiting map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

// Rate limiting middleware for booking updates
const rateLimitBookingUpdates = (req, res, next) => {
  const key = `${req.ip}-${req.method}-${req.originalUrl}`;
  const now = Date.now();
  const windowMs = 5000; // 5 seconds
  const maxRequests = 5; // Max 5 requests per 5 seconds
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return next();
  }
  
  const rateLimit = rateLimitMap.get(key);
  
  if (now > rateLimit.resetTime) {
    rateLimit.count = 1;
    rateLimit.resetTime = now + windowMs;
    return next();
  }
  
  if (rateLimit.count >= maxRequests) {
    return res.status(429).json({ 
      error: 'Too many requests. Please wait a moment before trying again.',
      retryAfter: Math.ceil((rateLimit.resetTime - now) / 1000)
    });
  }
  
  rateLimit.count++;
  next();
};

const COMPLETED_BOOKING_STATUSES = new Set(['completed', 'done', 'checked_out']);

const resolveServiceType = (serviceRow) => {
  if (!serviceRow) {
    return 'lesson';
  }

  const candidates = [serviceRow.service_type, serviceRow.category, serviceRow.name]
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''));

  if (candidates.some((value) => value.includes('rental') || value.includes('equipment'))) {
    return 'rental';
  }

  if (candidates.some((value) => value.includes('accommodation') || value.includes('lodging') || value.includes('stay'))) {
    return 'accommodation';
  }

  return 'lesson';
};

  // Helper: restore hours to a specific customer package ID
  async function restoreHoursToPackage(client, pkgId, restoreHours) {
    if (!pkgId || !restoreHours || restoreHours <= 0) return null;
    const { rows: pkgRows } = await client.query(
      `SELECT id, package_name, total_hours, used_hours, remaining_hours, status
       FROM customer_packages WHERE id = $1`,
      [pkgId]
    );
    if (pkgRows.length === 0) return null;
    const pkg = pkgRows[0];
    const newUsed = Math.max(0, (parseFloat(pkg.used_hours) || 0) - parseFloat(restoreHours));
    const newRemaining = Math.min(
      parseFloat(pkg.total_hours) || 0,
      (parseFloat(pkg.remaining_hours) || 0) + parseFloat(restoreHours)
    );
    const newStatus = newRemaining > 0 ? 'active' : pkg.status;
    const { rows: upd } = await client.query(
      `UPDATE customer_packages
       SET used_hours = $1, remaining_hours = $2, status = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING package_name, used_hours, remaining_hours, status`,
      [newUsed, newRemaining, newStatus, pkgId]
    );
    if (upd.length === 0) return null;
    const up = upd[0];
    return {
      packageId: pkgId,
      packageName: up.package_name,
      hoursRestored: parseFloat(restoreHours),
      newUsedHours: up.used_hours,
      newRemainingHours: up.remaining_hours,
      newStatus: up.status,
    };
  }

// Get available booking slots for a date range
router.get('/available-slots', authenticateJWT, async (req, res) => {
  try {
    // Normalize query params (axios may send instructorIds[])
  const { startDate, endDate } = req.query;
    const rawInstructorIds =
      req.query.instructorIds ??
      req.query['instructorIds[]'] ??
      req.query.instructorId ??
      req.query['instructorId[]'] ??
      null;
    const normalizeIds = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter((s) => s.length > 0);
      if (typeof val === 'string') {
        // support comma-separated or single value
        return val
          .split(',')
          .map((v) => String(v).trim())
          .filter((s) => s.length > 0);
      }
      return [];
    };
    const instructorIdList = normalizeIds(rawInstructorIds);
    
    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Start date and end date are required',
        received: { startDate, endDate }
      });
    }

    // Resolve instructors
    // Priority 1: if explicit instructorIds provided, use those
    // Priority 2: fallback to role lookup (users with role 'instructor')
  const instructorsResult = { rows: [] };
    if (instructorIdList.length > 0) {
      try {
  const placeholders = instructorIdList.map((_, i) => `$${i + 1}`).join(',');
  const q = `SELECT id, name, email FROM users WHERE id IN (${placeholders}) ORDER BY name`;
  const r = await pool.query(q, instructorIdList);
        const foundIds = new Set(r.rows.map((x) => x.id));
        // Add stubs for any ids not in users table so frontend still gets slots
        const stubs = instructorIdList
          .filter((id) => !foundIds.has(id))
          .map((id) => ({ id, name: `Instructor ${id}`, email: null }));
        instructorsResult.rows = [...r.rows, ...stubs];
      } catch (e) {
        logger.error('Failed to fetch instructors by IDs', e);
        // If query by IDs fails, at least provide stubs so calendar works
        instructorsResult.rows = instructorIdList.map((id) => ({ id, name: `Instructor ${id}`, email: null }));
      }
    } else {
      try {
        const instructorsQuery = `
          SELECT u.id, u.name, u.email 
          FROM users u
          JOIN roles r ON u.role_id = r.id
          WHERE LOWER(r.name) IN ('instructor', 'manager') AND u.deleted_at IS NULL
          ORDER BY u.name
        `;
        const r = await pool.query(instructorsQuery);
        instructorsResult.rows = r.rows;
      } catch (instructorError) {
        logger.error('Failed to fetch instructors by role', instructorError);
        instructorsResult.rows = [];
      }
    }

    // If still no instructors, return an empty schedule structure for the date range instead of []
    // so the frontend can optionally show business-hours fallback.
    const noInstructors = instructorsResult.rows.length === 0;

    // Generate time slots for each day in the range
    const result = [];
    const toYMD = (d) => {
      // convert to local-date string YYYY-MM-DD
      const tz = d.getTimezoneOffset();
      const local = new Date(d.getTime() - tz * 60000);
      return local.toISOString().slice(0, 10);
    };
    const addDays = (ymd, days) => {
      const d = new Date(`${ymd}T00:00:00`);
      d.setDate(d.getDate() + days);
      return toYMD(d);
    };
    const generateHalfHourSlots = () => {
      const slots = [];
      for (let h = 8; h <= 21; h++) {
        for (let m = 0; m < 60; m += 30) {
          // stop at 21:30 inclusive
          if (h === 21 && m > 30) break;
          slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
      }
      return slots;
    };
    const standardHours = generateHalfHourSlots();

    // Collect all dates in the range
    const allDates = [];
    {
      let cursor = startDate;
      const last = endDate;
      while (true) {
        allDates.push(cursor);
        if (cursor === last) break;
        cursor = addDays(cursor, 1);
      }
    }

    // BATCH: Fetch all bookings for the entire date range in ONE query (not 1 per day)
    let allBookings = [];
    try {
      let params = [...allDates];
      const datePlaceholders = allDates.map((_, i) => `$${i + 1}`).join(',');
      let bookingsQuery = `
        SELECT 
          date::text AS date,
          instructor_user_id,
          start_hour,
          duration,
          status
        FROM bookings 
        WHERE date IN (${datePlaceholders}) AND deleted_at IS NULL AND status NOT IN ('cancelled', 'pending_payment')
      `;
      if (!noInstructors && instructorIdList.length > 0) {
        const instrPlaceholders = instructorIdList.map((_, i) => `$${allDates.length + i + 1}`).join(',');
        bookingsQuery += ` AND instructor_user_id IN (${instrPlaceholders})`;
        params = [...allDates, ...instructorIdList];
      }
      bookingsQuery += ' ORDER BY date, instructor_user_id, start_hour';
      const bookingsResult = await pool.query(bookingsQuery, params);
      allBookings = bookingsResult.rows;
    } catch (bookingError) {
      logger.error('Failed to fetch bookings for date range', bookingError);
    }

    // Fetch approved availability blocks for the date range
    const unavailableByInstructor = new Map(); // instructorId → Set<dateString>
    try {
      const availResult = await pool.query(
        `SELECT instructor_id::text, start_date::text, end_date::text
         FROM instructor_availability
         WHERE status = 'approved' AND start_date <= $2::date AND end_date >= $1::date`,
        [startDate, endDate]
      );
      for (const row of availResult.rows) {
        if (!unavailableByInstructor.has(row.instructor_id)) {
          unavailableByInstructor.set(row.instructor_id, new Set());
        }
        // Expand date range
        const cursor = new Date(`${row.start_date}T00:00:00Z`);
        const last = new Date(`${row.end_date}T00:00:00Z`);
        while (cursor <= last) {
          unavailableByInstructor.get(row.instructor_id).add(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
    } catch (availError) {
      logger.error('Failed to fetch instructor availability for slots', availError);
    }

    // Index bookings by date → instructor → booked time slots
    const bookingsByDate = new Map();
    for (const booking of allBookings) {
      const dateStr = booking.date;
      if (!bookingsByDate.has(dateStr)) {
        bookingsByDate.set(dateStr, new Map());
      }
      const dayMap = bookingsByDate.get(dateStr);
      const instructorId = booking.instructor_user_id;
      if (!dayMap.has(instructorId)) {
        dayMap.set(instructorId, new Set());
      }

      const startHourDecimal = parseFloat(booking.start_hour);
      const durationDecimal = parseFloat(booking.duration) || 1;
      const startHour = Math.floor(startHourDecimal);
      const startMinute = Math.round((startHourDecimal - startHour) * 60);
      const startTimeMinutes = startHour * 60 + startMinute;
      const durationMinutes = durationDecimal * 60;
      const endTimeMinutes = startTimeMinutes + durationMinutes;

      for (let currentMinutes = startTimeMinutes; currentMinutes < endTimeMinutes; currentMinutes += 30) {
        const hour = Math.floor(currentMinutes / 60);
        const minute = currentMinutes % 60;
        const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        dayMap.get(instructorId).add(timeSlot);
      }
    }

    // Build result from pre-indexed data (no more DB calls)
    for (const dateStr of allDates) {
      const dayMap = bookingsByDate.get(dateStr) || new Map();
      const daySlots = [];
      
      for (const instructor of (noInstructors ? [] : instructorsResult.rows)) {
        const instructorBookedSlots = dayMap.get(instructor.id) || new Set();
        const isInstructorUnavailable = unavailableByInstructor.has(instructor.id) &&
          unavailableByInstructor.get(instructor.id).has(dateStr);

        for (const time of standardHours) {
          let status;
          if (isInstructorUnavailable) {
            status = 'unavailable';
          } else if (instructorBookedSlots.has(time)) {
            status = 'booked';
          } else {
            status = 'available';
          }

          daySlots.push({
            time,
            status,
            instructorId: instructor.id,
            instructorName: instructor.name,
            date: dateStr
          });
        }
      }
      
      result.push({
        date: dateStr,
        slots: daySlots
      });
    }
    
  // If no instructors, still respond with the date structure but empty slots array
  res.json(result);
    
  } catch (error) {
    logger.error('Failed to fetch available slots', error);
    
    res.status(500).json({
      error: 'Failed to fetch available slots',
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substr(2, 9)
    });
  }
});

// GET all bookings with optional filter by user_id, role, date range
// GET /bookings - Fetch bookings WITHOUT caching for real-time updates
router.get('/', 
  authenticateJWT,
  // Removed cacheMiddleware to ensure fresh data is always returned
  async (req, res) => {
  try {
  const { student_id, instructor_id, start_date, end_date, status, service_type } = req.query;
  const DEBUG = req.query._debug === '1' || process.env.DEBUG_BOOKINGS === '1';

  const rawRole = req.user.role || '';
  const userRole = typeof rawRole === 'string' ? rawRole.toLowerCase() : rawRole;
  const userID = req.user.id;
  const canFilterByInstructor = ['admin', 'manager', 'instructor'].includes(userRole);
  const limitedRoles = new Set(['student', 'freelancer']);
    
    let query = `
      SELECT b.*, 
        s.name as student_name,
        i.name as instructor_name,
        srv.name as service_name,
        srv.category as service_category,
        srv.service_type as service_type,
        srv.duration as service_duration,
        cp.package_name as customer_package_name,
        TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date,
        COALESCE(bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value) as instructor_commission,
        t.id as transaction_id,
        creator.name as created_by_name,
        creator.email as created_by_email,
        updater.name as updated_by_name,
        updater.email as updated_by_email,
        CASE 
          WHEN t.id IS NOT NULL THEN 'Individual Payment'
          WHEN b.payment_status = 'package' AND cp.package_name IS NOT NULL THEN cp.package_name
          WHEN b.payment_status = 'package' THEN 'Package Hours'
          WHEN b.payment_status = 'paid' AND b.amount > 0 THEN 'Individual Payment'
          WHEN b.payment_status = 'paid' AND (b.amount = 0 OR b.amount IS NULL) THEN 'Package Hours'
          WHEN s.balance >= COALESCE(b.final_amount, b.amount, 0) AND COALESCE(b.final_amount, b.amount, 0) > 0 THEN 
            CONCAT('€-', COALESCE(b.final_amount, b.amount, 0))
          ELSE 'Paid'
        END as payment_method_display,
        COALESCE(
          json_agg(
            CASE 
              WHEN bp.user_id IS NOT NULL THEN 
                json_build_object(
                  'userId', bp.user_id,
                  'userName', pu.name,
                  'userEmail', pu.email,
                  'userPhone', pu.phone,
                  'isPrimary', bp.is_primary,
                  'paymentStatus', bp.payment_status,
                  'paymentAmount', bp.payment_amount,
                  'customerPackageId', bp.customer_package_id,
                  'notes', bp.notes
                )
              ELSE NULL
            END
          ) FILTER (WHERE bp.user_id IS NOT NULL),
          '[]'::json
        ) as participants
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = srv.lesson_category_tag
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
  LEFT JOIN wallet_transactions t ON t.booking_id = b.id AND t.transaction_type IN ('charge', 'booking_charge')
      LEFT JOIN booking_participants bp ON bp.booking_id = b.id
      LEFT JOIN users pu ON bp.user_id = pu.id
      LEFT JOIN users creator ON creator.id = b.created_by
      LEFT JOIN users updater ON updater.id = b.updated_by
      WHERE b.deleted_at IS NULL AND b.status != 'pending_payment'
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (student_id) {
      const p1 = `$${paramCount++}`;
      const p2 = `$${paramCount++}`;
      const p3 = `$${paramCount++}`;
      query += ` AND ( 
        b.student_user_id = ${p1}
        OR b.customer_user_id = ${p2}
        OR EXISTS (
          SELECT 1 FROM booking_participants bp2
          WHERE bp2.booking_id = b.id AND bp2.user_id = ${p3}
        )
      )`;
      params.push(student_id, student_id, student_id);
    }

    if (!student_id && limitedRoles.has(userRole)) {
      const p1 = `$${paramCount++}`;
      const p2 = `$${paramCount++}`;
      const p3 = `$${paramCount++}`;
      query += ` AND ( 
        b.student_user_id = ${p1}
        OR b.customer_user_id = ${p2}
        OR EXISTS (
          SELECT 1 FROM booking_participants bp2
          WHERE bp2.booking_id = b.id AND bp2.user_id = ${p3}
        )
      )`;
      params.push(userID, userID, userID);
    }

    if (instructor_id && canFilterByInstructor) {
      query += ` AND b.instructor_user_id = $${paramCount++}`;
      params.push(instructor_id);
    }
    
    if (start_date) {
      query += ` AND b.date >= $${paramCount++}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND b.date <= $${paramCount++}`;
      params.push(end_date);
    }
    
    if (status) {
      query += ` AND b.status = $${paramCount++}`;
      params.push(status);
    }

    // Filter by service type (rental, lesson, accommodation) — matches against service category/type/name
    if (service_type) {
      const st = service_type.toLowerCase();
      if (st === 'rental') {
        query += ` AND (LOWER(srv.category) LIKE '%rental%' OR LOWER(srv.service_type) LIKE '%rental%' OR LOWER(srv.name) LIKE '%rental%' OR LOWER(srv.name) LIKE '%equipment%')`;
      } else if (st === 'accommodation') {
        query += ` AND (LOWER(srv.category) LIKE '%accommodation%' OR LOWER(srv.service_type) LIKE '%accommodation%' OR LOWER(srv.name) LIKE '%accommodation%')`;
      } else if (st === 'lesson') {
        query += ` AND NOT (LOWER(COALESCE(srv.category,'')) LIKE '%rental%' OR LOWER(COALESCE(srv.service_type,'')) LIKE '%rental%' OR LOWER(COALESCE(srv.name,'')) LIKE '%rental%' OR LOWER(COALESCE(srv.category,'')) LIKE '%accommodation%' OR LOWER(COALESCE(srv.service_type,'')) LIKE '%accommodation%')`;
      }
    }
    
    query += ` GROUP BY b.id, b.student_user_id, b.instructor_user_id, b.service_id, b.customer_package_id, b.created_by, b.updated_by, b.date, b.start_hour, b.duration, b.group_size, b.status, b.payment_status, b.final_amount, b.amount, b.created_at, b.updated_at, b.notes, b.deleted_at, s.name, s.balance, i.name, srv.name, srv.category, srv.service_type, srv.duration, cp.package_name, bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value, t.id, creator.name, creator.email, updater.name, updater.email
               ORDER BY b.date DESC
               LIMIT $${paramCount++}`;
    
    // Safety cap: prevent unbounded result sets (default 5000, max 10000)
    const limit = Math.min(parseInt(req.query.limit) || 5000, 10000);
    params.push(limit);
    
    if (DEBUG) {
      try {
        logger.info('[DEBUG]/bookings query about to run', {
          student_id: student_id || null,
          instructor_id: instructor_id || null,
          start_date: start_date || null,
          end_date: end_date || null,
          status: status || null,
          userRole,
          userID,
          paramCount,
        });
      } catch {}
    }

    const { rows } = await pool.query(query, params);

    if (DEBUG && Array.isArray(rows)) {
      try {
        const sid = student_id;
        const total = rows.length;
        let primaryMatches = 0;
        let participantMatches = 0;
        const matchedSamples = [];
        for (const r of rows) {
          const isPrimary = sid && (r.student_user_id === sid || r.customer_user_id === sid);
          const hasParticipants = Array.isArray(r.participants) && r.participants.length > 0;
          const isParticipant = sid && hasParticipants && r.participants.some(p => p && p.userId === sid);
          if (isPrimary) primaryMatches++;
          if (isParticipant) participantMatches++;
          if ((isPrimary || isParticipant) && matchedSamples.length < 5) {
            matchedSamples.push({ id: r.id, date: r.formatted_date || r.date, start_hour: r.start_hour, reason: isPrimary ? 'primary/legacy' : 'participant' });
          }
        }
        logger.info('[DEBUG]/bookings rows fetched', {
          total,
          primaryMatches,
          participantMatches,
          sample: matchedSamples,
        });
      } catch {}
    }
    
    // Ensure dates are consistently formatted for frontend
    const normalizedBookings = rows.map(booking => {
      // Convert start_hour to startTime and calculate endTime
      let startTime = null;
      let endTime = null;
      
      if (booking.start_hour !== undefined && booking.start_hour !== null && !isNaN(booking.start_hour)) {
        const startHourFloat = parseFloat(booking.start_hour);
        
        // Add safety check for valid start hour
        if (isNaN(startHourFloat) || startHourFloat < 0 || startHourFloat > 24) {
          logger.warn('Invalid start_hour detected', { booking_id: booking.id, start_hour: booking.start_hour });
          return {
            ...booking,
            date: booking.formatted_date || booking.date,
            startTime: null,
            endTime: null,
            time: null
          };
        }

        const hours = Math.floor(startHourFloat);
        const minutes = Math.round((startHourFloat - hours) * 60);

        // Additional safety check for calculated values
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          logger.warn('Invalid calculated time values', { hours, minutes, start_hour: startHourFloat });
          return {
            ...booking,
            date: booking.formatted_date || booking.date,
            startTime: null,
            endTime: null,
            time: null
          };
        }
        
        startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        // Calculate end time based on duration
        let _duration = parseFloat(booking.duration);
        if (isNaN(_duration) || _duration <= 0) {
          _duration = 1; // Default 1 hour
        }
        const endHourFloat = startHourFloat + _duration;
        const endHours = Math.floor(endHourFloat);
        const endMinutes = Math.round((endHourFloat - endHours) * 60);
        
        // Safety check for end time calculation
        if (isNaN(endHours) || isNaN(endMinutes)) {
          logger.warn('Invalid end time calculation', { endHours, endMinutes });
          endTime = null;
        } else {
          endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
        }
      }
      
      // Replace the date field with the consistently formatted date and add time fields
      return {
        ...booking,
        date: booking.formatted_date || booking.date,
        startTime,
        endTime,
        time: startTime, // For backward compatibility
        // Map backend field names to frontend expected names
        serviceName: booking.service_name,
        userName: booking.student_name,
        studentName: booking.student_name,
        instructorName: booking.instructor_name,
        // Keep original fields for compatibility
        instructorId: booking.instructor_user_id,
        studentId: booking.student_user_id || booking.customer_user_id,
        serviceId: booking.service_id,
        // Add payment method information
        paymentMethod: booking.payment_method_display,
        isPackagePayment: booking.payment_method_display === 'Package Hours',
        // Normalize audit fields to camelCase
        createdBy: booking.created_by,
        createdByName: booking.created_by_name,
        createdByEmail: booking.created_by_email,
        createdAt: booking.created_at,
        updatedBy: booking.updated_by,
        updatedByName: booking.updated_by_name,
        updatedByEmail: booking.updated_by_email,
        updatedAt: booking.updated_at
      };
    });
    
    res.json(normalizedBookings);
  } catch (err) {
    logger.error('Failed to fetch bookings', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET calendar bookings for a specific date (must be before /:id route)
router.get('/calendar', authenticateJWT, async (req, res) => {
  try {
    const { date, instructor_id } = req.query;
    
    let query = `
      SELECT b.*, 
        s.name as student_name,
        i.name as instructor_name,
        srv.name as service_name,
        TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date,
        COALESCE(
          json_agg(
            CASE 
              WHEN bp.user_id IS NOT NULL THEN 
                json_build_object(
                  'userId', bp.user_id,
                  'userName', pu.name,
                  'userEmail', pu.email,
                  'userPhone', pu.phone,
                  'isPrimary', bp.is_primary,
                  'paymentStatus', bp.payment_status,
                  'paymentAmount', bp.payment_amount,
                  'customerPackageId', bp.customer_package_id,
                  'notes', bp.notes
                )
              ELSE NULL
            END
          ) FILTER (WHERE bp.user_id IS NOT NULL),
          '[]'::json
        ) as participants
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN booking_participants bp ON bp.booking_id = b.id
      LEFT JOIN users pu ON bp.user_id = pu.id
      WHERE b.deleted_at IS NULL AND b.status != 'pending_payment'
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by date if provided
    if (date) {
      query += ` AND b.date = $${paramCount++}`;
      params.push(date);
    }
    
    // Filter by instructor if provided
    if (instructor_id) {
      query += ` AND b.instructor_user_id = $${paramCount++}`;
      params.push(instructor_id);
    }
    
    query += ` GROUP BY b.id, b.student_user_id, b.instructor_user_id, b.service_id, b.date, b.start_hour, b.duration, b.group_size, b.status, b.payment_status, b.final_amount, b.created_at, b.updated_at, b.notes, b.deleted_at, s.name, i.name, srv.name`;
    query += ` ORDER BY b.start_hour ASC`;
    
    const { rows } = await pool.query(query, params);
    
    // Convert bookings to frontend format with time strings
    const calendarBookings = rows.map(booking => {
      let startTime = null;
      let endTime = null;
      
      if (booking.start_hour !== undefined && booking.start_hour !== null && !isNaN(booking.start_hour)) {
        const startHourFloat = parseFloat(booking.start_hour);
        const hours = Math.floor(startHourFloat);
        const minutes = Math.round((startHourFloat - hours) * 60);
        startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        // Calculate end time
        const duration = parseFloat(booking.duration) || 1;
        const endHourFloat = startHourFloat + duration;
        const endHours = Math.floor(endHourFloat);
        const endMinutes = Math.round((endHourFloat - endHours) * 60);
        endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
      }
      
      return {
        ...booking,
        date: booking.formatted_date || booking.date,
        start_time: startTime,
        end_time: endTime,
        startTime,
        endTime
      };
    });
    
    res.json(calendarBookings);
  } catch (err) {
    logger.error('Failed to fetch calendar bookings', err);
    res.status(500).json({ error: 'Failed to fetch calendar bookings' });
  }
});

/**
 * GET /bookings/preferred-instructor
 * Returns the instructor the current student has had the most recent lesson with.
 */
router.get('/preferred-instructor', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT b.instructor_user_id
       FROM bookings b
       WHERE b.deleted_at IS NULL
         AND b.instructor_user_id IS NOT NULL
         AND (b.student_user_id = $1 OR b.customer_user_id = $1
              OR EXISTS (SELECT 1 FROM booking_participants bp WHERE bp.booking_id = b.id AND bp.user_id = $1))
       ORDER BY b.date DESC, b.start_hour DESC
       LIMIT 1`,
      [userId]
    );
    res.json({ instructorId: result.rows[0]?.instructor_user_id || null });
  } catch (error) {
    logger.error('Error fetching preferred instructor', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch preferred instructor' });
  }
});

/**
 * GET /bookings/pending-partner-invites
 * Returns pending_partner bookings where the current user is a non-primary participant.
 * Must be defined BEFORE /:id to avoid Express matching "pending-partner-invites" as an ID.
 */
router.get('/pending-partner-invites', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT b.id AS "bookingId",
              b.date, b.start_hour, b.duration,
              s.name AS "serviceName",
              COALESCE(NULLIF(TRIM(u.name), ''), TRIM(CONCAT(u.first_name, ' ', u.last_name))) AS "bookerName",
              cp.remaining_hours AS "packageRemainingHours"
       FROM bookings b
       JOIN booking_participants bp ON bp.booking_id = b.id
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN users u ON u.id = b.student_user_id
       LEFT JOIN booking_participants bp2 ON bp2.booking_id = b.id AND bp2.user_id = $1
       LEFT JOIN customer_packages cp ON cp.id = bp2.customer_package_id
       WHERE b.status = 'pending_partner'
         AND bp.user_id = $1
         AND bp.is_primary = false
         AND b.deleted_at IS NULL
       ORDER BY b.created_at DESC`,
      [userId]
    );

    const invites = result.rows.map(row => ({
      bookingId: row.bookingId,
      bookerName: row.bookerName || 'Your friend',
      serviceName: row.serviceName || 'Group Lesson',
      date: row.date,
      startTime: row.start_hour != null
        ? `${Math.floor(Number(row.start_hour))}:${String(Math.round((Number(row.start_hour) % 1) * 60)).padStart(2, '0')}`
        : null,
      duration: parseFloat(row.duration) || 1,
      packageRemainingHours: row.packageRemainingHours != null ? parseFloat(row.packageRemainingHours) : null,
    }));

    res.json({ invites });
  } catch (error) {
    logger.error('Error fetching pending partner invites', { error: error?.message });
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

/**
 * GET /bookings/pending-transfers
 * Admin/Staff route to fetch all pending bank transfer receipts
 */
router.get('/pending-transfers', authenticateJWT, authorizeRoles(['admin', 'manager', 'owner', 'staff']), async (req, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    
    const query = `
      SELECT r.*,
             u.first_name, u.last_name, u.email,
             b.service_id, b.date as booking_date, b.start_hour, b.duration,
             cp.package_name, cp.lesson_service_name, cp.total_hours, cp.used_hours, cp.remaining_hours,
             ba.bank_name, ba.iban, ba.currency as bank_currency,
             so.order_number as shop_order_number, so.total_amount as shop_order_total,
             so.status as shop_order_status, so.deposit_percent as shop_deposit_percent,
             so.deposit_amount as shop_deposit_amount
      FROM bank_transfer_receipts r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN bookings b ON r.booking_id = b.id
      LEFT JOIN customer_packages cp ON r.customer_package_id = cp.id
      LEFT JOIN wallet_bank_accounts ba ON r.bank_account_id = ba.id
      LEFT JOIN shop_orders so ON r.shop_order_id = so.id
      WHERE r.status = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const countQuery = `SELECT COUNT(*) FROM bank_transfer_receipts WHERE status = $1`;
    
    const [result, countResult] = await Promise.all([
      pool.query(query, [status, limit, offset]),
      pool.query(countQuery, [status])
    ]);

    const rows = result.rows;

    // For package receipts, fetch the lessons booked under each package
    const packageIds = rows
      .filter(r => r.customer_package_id)
      .map(r => r.customer_package_id);

    let packageBookingsMap = {};
    if (packageIds.length > 0) {
      const uniqueIds = [...new Set(packageIds)];
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(',');
      const bookingsRes = await pool.query(`
        SELECT bk.id, bk.date, bk.start_hour, bk.duration, bk.status, bk.payment_status,
               bk.customer_package_id,
               srv.name as service_name,
               i.name as instructor_name
        FROM bookings bk
        LEFT JOIN services srv ON srv.id = bk.service_id
        LEFT JOIN users i ON i.id = bk.instructor_user_id
        WHERE bk.customer_package_id IN (${placeholders})
          AND bk.deleted_at IS NULL
        ORDER BY bk.date ASC, bk.start_hour ASC
      `, uniqueIds);
      for (const bk of bookingsRes.rows) {
        const pkgId = bk.customer_package_id;
        if (!packageBookingsMap[pkgId]) packageBookingsMap[pkgId] = [];
        packageBookingsMap[pkgId].push(bk);
      }
    }

    const enrichedResults = rows.map(r => ({
      ...r,
      package_bookings: r.customer_package_id ? (packageBookingsMap[r.customer_package_id] || []) : [],
    }));
    
    res.json({
      results: enrichedResults,
      pagination: {
        total: parseInt(countResult.rows[0].count, 10),
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      }
    });
  } catch (err) {
    logger.error('Error fetching pending transfers', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch pending transfers' });
  }
});

/**
 * PATCH /bookings/pending-transfers/:id/action
 * Admin explicitly approves or rejects the bank transfer
 */
router.patch('/pending-transfers/:id/action', authenticateJWT, authorizeRoles(['admin', 'manager', 'owner']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, reviewerNotes } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }
    
    await client.query('BEGIN');
    
    const receiptRes = await client.query(`
      SELECT r.*,
             so.order_number as so_order_number,
             so.deposit_percent as so_deposit_percent,
             so.deposit_amount as so_deposit_amount,
             so.total_amount as so_total_amount
      FROM bank_transfer_receipts r
      LEFT JOIN shop_orders so ON r.shop_order_id = so.id
      WHERE r.id = $1
      FOR UPDATE OF r
    `, [id]);
    if (receiptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = receiptRes.rows[0];
    if (receipt.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Receipt is already ${receipt.status}` });
    }
    
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    
    await client.query(
      `UPDATE bank_transfer_receipts 
       SET status = $1, notes = CONCAT(notes, ' | Reviewer Note: ', $2::text), updated_at = NOW() 
       WHERE id = $3`,
      [newStatus, reviewerNotes || '', id]
    );
    
    if (newStatus === 'approved') {
      const paymentAmount = parseFloat(receipt.amount) || 0;
      const paymentCurrency = receipt.currency || 'EUR';

      if (receipt.booking_id) {
        await client.query(
          `UPDATE bookings 
           SET payment_status = 'paid', status = 'confirmed', updated_at = NOW() 
           WHERE id = $1`,
          [receipt.booking_id]
        );
        logger.info('Standalone booking confirmed via bank transfer approval', { bookingId: receipt.booking_id, receiptId: id });

        // Record wallet ledger entries so the payment appears in financial history
        // Insert debit first, then credit — credit gets the later timestamp and appears
        // first in the DESC-sorted financial history (payment received → then charged)
        if (paymentAmount > 0) {
          try {
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: -paymentAmount,
              transactionType: 'booking_charge',
              status: 'completed',
              direction: 'debit',
              availableDelta: 0,
              description: `Lesson Booking Charge (Bank Transfer)`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'booking',
              relatedEntityId: receipt.booking_id,
              createdBy: req.user?.id,
              metadata: { receiptId: id, source: 'bank_transfer_approval' },
              client,
            });
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: paymentAmount,
              transactionType: 'bank_transfer_payment',
              status: 'completed',
              direction: 'credit',
              availableDelta: 0,
              description: `Bank Transfer Payment Received (Lesson)`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'booking',
              relatedEntityId: receipt.booking_id,
              createdBy: req.user?.id,
              metadata: { receiptId: id, source: 'bank_transfer_approval' },
              client,
            });
          } catch (ledgerErr) {
            logger.warn('Failed to record bank transfer wallet ledger entries', { error: ledgerErr.message, receiptId: id });
          }
        }

        try {
          req.socketService?.emitToChannel(`user:${receipt.user_id}`, 'notification:new', {
            notification: { title: 'Payment Approved', message: 'Your bank transfer was approved and lesson confirmed!', type: 'success' }
          });
        } catch (e) { /* ignore */ }
      } else if (receipt.customer_package_id) {
        await client.query(
          `UPDATE customer_packages 
           SET status = 'active'
           WHERE id = $1`,
           [receipt.customer_package_id]
        );
        logger.info('Package activated via bank transfer approval', { pkgId: receipt.customer_package_id, receiptId: id });
        
        // Confirm all bookings under this package (match both pending_payment and waiting_payment)
        const confirmedBookings = await client.query(
          `UPDATE bookings 
           SET payment_status = 'package', status = 'confirmed', updated_at = NOW() 
           WHERE customer_package_id = $1 
             AND (status = 'pending_payment' OR payment_status IN ('pending_payment', 'waiting_payment'))
           RETURNING id`,
          [receipt.customer_package_id]
        );
        logger.info('Confirmed bookings via bank transfer approval', {
          pkgId: receipt.customer_package_id,
          confirmedCount: confirmedBookings.rows.length,
        });

        // Fetch package name for the ledger description
        const pkgInfo = await client.query(
          `SELECT package_name FROM customer_packages WHERE id = $1`,
          [receipt.customer_package_id]
        );
        const pkgName = pkgInfo.rows[0]?.package_name || 'Package';

        // Record wallet ledger entries: debit first, then credit
        // Credit gets the later timestamp → appears first in DESC-sorted history
        // So users see: "Payment Received" then "Package Charge" (logical order)
        if (paymentAmount > 0) {
          try {
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: -paymentAmount,
              transactionType: 'package_purchase',
              status: 'completed',
              direction: 'debit',
              availableDelta: 0,
              description: `Package Purchase (Bank Transfer): ${pkgName}`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'customer_package',
              relatedEntityId: receipt.customer_package_id,
              createdBy: req.user?.id,
              metadata: { receiptId: id, packageName: pkgName, source: 'bank_transfer_approval' },
              client,
            });
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: paymentAmount,
              transactionType: 'bank_transfer_payment',
              status: 'completed',
              direction: 'credit',
              availableDelta: 0,
              description: `Bank Transfer Payment Received: ${pkgName}`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'customer_package',
              relatedEntityId: receipt.customer_package_id,
              createdBy: req.user?.id,
              metadata: { receiptId: id, packageName: pkgName, source: 'bank_transfer_approval' },
              client,
            });
          } catch (ledgerErr) {
            logger.warn('Failed to record bank transfer package wallet ledger entries', { error: ledgerErr.message, receiptId: id });
          }
        }
        
        try {
          req.socketService?.emitToChannel(`user:${receipt.user_id}`, 'notification:new', {
            notification: { title: 'Package Activated', message: 'Your bank transfer was approved and package is now active!', type: 'success' }
          });
        } catch (e) { /* ignore */ }
      } else if (receipt.shop_order_id) {
        // Shop order bank transfer approval — shop_order data already joined in the receipt SELECT above
        const isDeposit = parseFloat(receipt.so_deposit_percent || 0) > 0;
        const newPaymentStatus = isDeposit ? 'deposit_paid' : 'completed';

        await client.query(
          `UPDATE shop_orders SET payment_status = $2, status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [receipt.shop_order_id, newPaymentStatus]
        );
        await client.query(
          `INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
           VALUES ($1, 'pending', 'confirmed', $2, $3)`,
          [receipt.shop_order_id, req.user?.id, isDeposit
            ? `Deposit ${receipt.so_deposit_percent}% bank transfer approved by admin`
            : 'Bank transfer approved by admin']
        );
        logger.info('Shop order confirmed via bank transfer approval', { shopOrderId: receipt.shop_order_id, receiptId: id });

        if (paymentAmount > 0) {
          try {
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: -paymentAmount,
              transactionType: 'payment',
              status: 'completed',
              direction: 'debit',
              availableDelta: 0,
              description: isDeposit
                ? `Shop Deposit (Bank Transfer): Order #${receipt.so_order_number}`
                : `Shop Order Payment (Bank Transfer): Order #${receipt.so_order_number}`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'shop_order',
              relatedEntityId: String(receipt.shop_order_id),
              createdBy: req.user?.id,
              metadata: { receiptId: id, source: 'bank_transfer_approval' },
              client,
            });
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: paymentAmount,
              transactionType: 'bank_transfer_payment',
              status: 'completed',
              direction: 'credit',
              availableDelta: 0,
              description: 'Bank Transfer Payment Received (Shop)',
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'shop_order',
              relatedEntityId: String(receipt.shop_order_id),
              createdBy: req.user?.id,
              metadata: { receiptId: id, source: 'bank_transfer_approval' },
              client,
            });
          } catch (ledgerErr) {
            logger.warn('Failed to record shop order bank transfer ledger entries', { error: ledgerErr.message, receiptId: id });
          }
        }

        try {
          req.socketService?.emitToChannel(`user:${receipt.user_id}`, 'notification:new', {
            notification: { title: 'Order Confirmed', message: 'Your bank transfer was approved and your shop order is confirmed!', type: 'success' }
          });
        } catch (e) { /* ignore */ }
      }
    } else {
      if (receipt.booking_id) {
        await client.query(
          `UPDATE bookings SET payment_status = 'failed', status = 'cancelled', notes = CONCAT(notes, ' | Payment Rejected'), updated_at = NOW() WHERE id = $1`,
          [receipt.booking_id]
        );
      } else if (receipt.customer_package_id) {
        await client.query(
          `UPDATE customer_packages SET status = 'expired', notes = CONCAT(notes, ' | Payment Rejected') WHERE id = $1`,
          [receipt.customer_package_id]
        );
        await client.query(
          `UPDATE bookings SET payment_status = 'failed', status = 'cancelled', updated_at = NOW() WHERE customer_package_id = $1`,
          [receipt.customer_package_id]
        );
      } else if (receipt.shop_order_id) {
        // Restore stock and cancel the order on rejection
        const orderItemsRes = await client.query(
          'SELECT product_id, quantity FROM shop_order_items WHERE order_id = $1',
          [receipt.shop_order_id]
        );
        for (const item of orderItemsRes.rows) {
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
            [item.quantity, item.product_id]
          );
        }
        await client.query(
          `UPDATE shop_orders SET status = 'cancelled', payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [receipt.shop_order_id]
        );
        await client.query(
          `INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
           VALUES ($1, 'pending', 'cancelled', $2, $3)`,
          [receipt.shop_order_id, req.user?.id, `Bank transfer rejected by admin: ${reviewerNotes || 'No notes'}`]
        );
        logger.info('Shop order cancelled due to bank transfer rejection', { shopOrderId: receipt.shop_order_id, receiptId: id });
      }

      try {
        req.socketService?.emitToChannel(`user:${receipt.user_id}`, 'notification:new', {
          notification: { title: 'Bank Transfer Rejected', message: `Your bank transfer was rejected: ${reviewerNotes || 'No notes left'}`, type: 'error' }
        });
      } catch (e) { /* ignore */ }
    }
    
    await client.query('COMMIT');
    res.json({ success: true, message: `Receipt ${newStatus} successfully` });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Error processing bank transfer receipt', { error: err.message });
    res.status(500).json({ error: 'Failed to process action' });
  } finally {
    client.release();
  }
});

// GET a single booking by ID
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, 
        s.name as student_name,
        s.email as student_email,
        i.name as instructor_name,
        i.email as instructor_email,
        srv.name as service_name,
        srv.price as service_price,
        srv.category as service_category,
        cp.package_name,
        cp.total_hours as package_total_hours,
        cp.purchase_price as package_price,
        COALESCE(b.final_amount, b.amount, srv.price, 0) as display_amount,
        COALESCE(bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value, 0) as instructor_commission,
        COALESCE(bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed') as commission_type
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = srv.lesson_category_tag
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      WHERE b.id = $1 AND b.deleted_at IS NULL
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Get equipment for this booking
    const equipmentResult = await pool.query(`
      SELECT e.*
      FROM booking_equipment be
      JOIN equipment e ON e.id = be.equipment_id
      WHERE be.booking_id = $1
    `, [req.params.id]);
      const booking = rows[0];
    booking.equipment = equipmentResult.rows;    // Convert start_hour to startTime and calculate endTime for single booking
    if (booking.start_hour !== undefined && booking.start_hour !== null && !isNaN(booking.start_hour)) {
      const startHourFloat = parseFloat(booking.start_hour);
      
      // Add safety check for valid start hour
      if (isNaN(startHourFloat) || startHourFloat < 0 || startHourFloat > 24) {
        logger.warn('Invalid start_hour detected in single booking', { booking_id: booking.id, start_hour: booking.start_hour });
        booking.startTime = null;
        booking.endTime = null;
        booking.time = null;
      } else {
        const hours = Math.floor(startHourFloat);
        const minutes = Math.round((startHourFloat - hours) * 60);
        
        // Additional safety check for calculated values
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          logger.warn('Invalid calculated time values for single booking', { hours, minutes, start_hour: startHourFloat });
          booking.startTime = null;
          booking.endTime = null;
          booking.time = null;
        } else {
          booking.startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          
          // Calculate end time based on duration
          let _duration = parseFloat(booking.duration);
          if (isNaN(_duration) || _duration <= 0) {
            _duration = 1; // Default 1 hour
          }
          const endHourFloat = startHourFloat + _duration;
          const endHours = Math.floor(endHourFloat);
          const endMinutes = Math.round((endHourFloat - endHours) * 60);
          
          // Safety check for end time calculation
          if (isNaN(endHours) || isNaN(endMinutes)) {
            logger.warn('Invalid end time calculation for single booking', { endHours, endMinutes });
            booking.endTime = null;
          } else {
            booking.endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
          }
          
          booking.time = booking.startTime; // For backward compatibility
        }
      }
    }
    
    res.json(booking);
  } catch (err) {
    logger.error('Failed to fetch booking', err);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// CREATE a new booking
// POST /bookings - Create booking with proper package/individual lesson logic
router.post('/', 
  authenticateJWT, 
  authorizeRoles(['admin', 'manager', 'instructor', 'front_desk', 'student', 'outsider']),
  async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    
    const { 
      date, start_hour, duration, student_user_id, instructor_user_id, 
      status, amount, location, equipment_ids, use_package, service_id,
      voucherId,  // Voucher/promo code to apply
      partner_user_id,  // Optional: group partner's user ID
      partner_customer_package_id  // Optional: group partner's customer_package ID
    } = req.body;
    let walletCurrency = req.body.wallet_currency || req.body.walletCurrency || req.body.currency;
    const requestedPaymentMethod = req.body.payment_method || null;
    let finalNotes = req.body.notes || '';
    
    // If currency not provided, get from customer's preferred_currency (for price lookup)
    if (!walletCurrency && student_user_id) {
      const userCurrencyResult = await client.query(
        'SELECT preferred_currency FROM users WHERE id = $1',
        [student_user_id]
      );
      walletCurrency = userCurrencyResult.rows[0]?.preferred_currency || DEFAULT_CURRENCY;
    } else if (!walletCurrency) {
      walletCurrency = DEFAULT_CURRENCY;
    }
    // Wallet transactions MUST use the system's storage currency (EUR).
    // preferred_currency is for display/price-lookup only, not for wallet storage.
    const walletTransactionCurrency = DEFAULT_CURRENCY;
    
    // Staff roles automatically can allow negative balance (front desk can book even if customer has no balance)
    const staffRolesForNegativeBalance = ['admin', 'manager', 'front_desk', 'instructor'];
    const isStaffBooker = staffRolesForNegativeBalance.includes(req.user?.role);
    // trusted_customer with pay_later: allow negative balance so debt is tracked in wallet
    const isTrustedCustomerPayLater = req.user?.role === 'trusted_customer' && requestedPaymentMethod === 'pay_later';
    const allowNegativeBalance = req.body.allowNegativeBalance === true || isStaffBooker || isTrustedCustomerPayLater;
    
    // Staff roles automatically confirm bookings (admin, manager, front_desk)
    const staffRolesForAutoConfirm = ['admin', 'manager', 'front_desk'];
    const shouldAutoConfirm = staffRolesForAutoConfirm.includes(req.user?.role);
    let finalStatus = shouldAutoConfirm ? 'confirmed' : (status || 'pending');
    
    // Validate required fields
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Guard: check instructor availability
    if (instructor_user_id) {
      const availCheck = await client.query(
        `SELECT id FROM instructor_availability
         WHERE instructor_id = $1 AND status = 'approved'
           AND start_date <= $2::date AND end_date >= $2::date
         LIMIT 1`,
        [instructor_user_id, date]
      );
      if (availCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Instructor is unavailable on the selected date' });
      }
    }
    
    const bookingDuration = parseFloat(duration) || 1;
    
    let finalPaymentStatus = 'paid'; // Pay-and-go: default to paid for individual payments
    let finalAmount = parseFloat(amount) || 0;
    let usedPackageId = null;

    // Fetch service name, capacity limits, and discipline tags
    let bookingServiceName = null;
    let maxParticipants = null;
    let serviceDisciplineTag = null;
    let serviceLessonCategoryTag = null;
    let serviceLevelTag = null;
    let servicePrice = null;
    let serviceDurationHours = null;
    if (service_id) {
      try {
        const sres = await client.query(
          'SELECT name, max_participants, discipline_tag, lesson_category_tag, level_tag, price, duration FROM services WHERE id = $1',
          [service_id]
        );
        bookingServiceName = sres.rows[0]?.name || null;
        maxParticipants = sres.rows[0]?.max_participants || null;
        serviceDisciplineTag = sres.rows[0]?.discipline_tag || null;
        serviceLessonCategoryTag = sres.rows[0]?.lesson_category_tag || null;
        serviceLevelTag = sres.rows[0]?.level_tag || null;
        servicePrice = parseFloat(sres.rows[0]?.price) || null;
        serviceDurationHours = parseFloat(sres.rows[0]?.duration) || null;
      } catch {}
    }

    // Auto-resolve amount from service price when not provided
    if (finalAmount === 0 && amount == null && servicePrice > 0 && !use_package) {
      const dur = bookingDuration || 1;
      finalAmount = serviceDurationHours > 0
        ? parseFloat(((servicePrice / serviceDurationHours) * dur).toFixed(2))
        : servicePrice;
    }

    // Validate instructor is qualified for this service's discipline
    const forceSkipSkillCheck = req.query.force === 'true';
    if (instructor_user_id && serviceDisciplineTag && !forceSkipSkillCheck) {
      const skillResult = await client.query(
        `SELECT lesson_categories, max_level FROM instructor_skills
         WHERE instructor_id = $1 AND discipline_tag = $2`,
        [instructor_user_id, serviceDisciplineTag]
      );
      if (skillResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: 'Instructor is not qualified for this discipline',
          details: { discipline: serviceDisciplineTag, instructorId: instructor_user_id }
        });
      }
      const skill = skillResult.rows[0];
      if (serviceLessonCategoryTag && !skill.lesson_categories.includes(serviceLessonCategoryTag)) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: `Instructor is not qualified for ${serviceLessonCategoryTag} lessons in ${serviceDisciplineTag}`,
          details: { discipline: serviceDisciplineTag, category: serviceLessonCategoryTag }
        });
      }
      const levelRank = { beginner: 1, intermediate: 2, advanced: 3 };
      if (serviceLevelTag && (levelRank[skill.max_level] || 1) < (levelRank[serviceLevelTag] || 1)) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: `Instructor max level (${skill.max_level}) is insufficient for ${serviceLevelTag} lessons`,
          details: { discipline: serviceDisciplineTag, requiredLevel: serviceLevelTag, instructorLevel: skill.max_level }
        });
      }
    }
    
    // Check capacity limits for group bookings
    if (maxParticipants !== null && maxParticipants > 0) {
      // Count existing confirmed bookings for this instructor/date/time
      const capacityCheck = await client.query(`
        SELECT COUNT(*) as booking_count
        FROM bookings
        WHERE instructor_user_id = $1
          AND date = $2
          AND start_hour = $3
          AND duration = $4
          AND status IN ('confirmed', 'completed')
          AND deleted_at IS NULL
      `, [instructor_user_id, date, parseFloat(start_hour), parseFloat(bookingDuration)]);
      
      const currentBookings = parseInt(capacityCheck.rows[0]?.booking_count || 0);
      
      if (currentBookings >= maxParticipants) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'capacity_exceeded',
          message: `This time slot is at full capacity (${maxParticipants} participants). Please choose a different time.`,
          maxCapacity: maxParticipants,
          currentBookings
        });
      }
    }
    
    // Check user's choice: use package or pay individually
    if (student_user_id && use_package === true) {
      
      // Prefer the specific customer_package_id when provided by the frontend
      const requestedPackageId = req.body.customer_package_id || req.body.selected_package_id;
      let packageCheck = { rows: [] };
      
      if (requestedPackageId) {
        // Look up the specifically requested package (validates ownership + active + enough hours)
        const specificParams = [requestedPackageId, student_user_id, parseFloat(bookingDuration)];
        const specificSql = `
          SELECT id, package_name, remaining_hours, total_hours, used_hours, purchase_price, lesson_service_name, status as pkg_status
          FROM customer_packages 
          WHERE id = $1 
            AND customer_id = $2
            AND status IN ('active', 'waiting_payment') 
            AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $3)
            AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)
          LIMIT 1
        `;
        packageCheck = await client.query(specificSql, specificParams);
      }
      
      // Fallback: search by customer_id + service name if no specific package provided or it didn't match
      if (packageCheck.rows.length === 0) {
        const params = [student_user_id, parseFloat(bookingDuration)];
        let sql = `
          SELECT cp.id, cp.package_name, cp.remaining_hours, cp.total_hours, cp.used_hours, cp.purchase_price, cp.lesson_service_name, cp.status as pkg_status
          FROM customer_packages cp
          LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
          WHERE cp.customer_id = $1 
            AND cp.status IN ('active', 'waiting_payment') 
            AND (COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) >= $2)
            AND (COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) > 0)
        `;
        if (bookingServiceName) {
          // Flexible matching: check both customer_packages AND service_packages lesson_service_name
          sql += ` AND (
            cp.lesson_service_name IS NULL 
            OR LOWER(cp.lesson_service_name) = LOWER($3)
            OR LOWER(RTRIM(cp.lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
            OR LOWER(sp.lesson_service_name) = LOWER($3)
            OR LOWER(RTRIM(sp.lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
          )`;
          params.push(bookingServiceName);
        }
        sql += ' ORDER BY cp.purchase_date ASC LIMIT 1';
        packageCheck = await client.query(sql, params);
      }
      
      if (packageCheck.rows.length > 0) {
        // Customer has package hours available - use them
        const packageToUse = packageCheck.rows[0];
        const rh = packageToUse.remaining_hours;
        const uh = packageToUse.used_hours;
        const th = packageToUse.total_hours;
        const currentUsed = parseFloat(uh) || 0;
        const totalHours = parseFloat(th) || 0;
        const currentRemaining = rh !== null && rh !== undefined
          ? parseFloat(rh) || 0
          : Math.max(0, totalHours - currentUsed);
        const newRemainingHours = currentRemaining - parseFloat(bookingDuration);
        const newUsedHours = currentUsed + parseFloat(bookingDuration);
        
        // Update the package with validation
        // Check all 3 components for all_inclusive packages before marking used_up
        const packageUpdateResult = await client.query(`
          UPDATE customer_packages 
          SET used_hours = $1::numeric, 
              remaining_hours = $2::numeric,
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
            AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)
          RETURNING id, package_name, used_hours, remaining_hours, status
        `, [parseFloat(newUsedHours), parseFloat(newRemainingHours), packageToUse.id, parseFloat(bookingDuration), date]);
        
        // Validate the package was actually updated
        if (packageUpdateResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: 'Package update failed',
            message: 'The selected package could not be updated. It may have been modified by another user or no longer has sufficient hours.'
          });
        }
        
        const updatedPackage = packageUpdateResult.rows[0];
        
        finalPaymentStatus = 'package';
        // Store prorated package cost so the booking displays the correct "lesson value"
        const pkgPurchasePrice = parseFloat(packageToUse.purchase_price) || 0;
        const pkgTotalHours = parseFloat(packageToUse.total_hours) || 1;
        finalAmount = pkgPurchasePrice > 0
          ? parseFloat(((pkgPurchasePrice / pkgTotalHours) * bookingDuration).toFixed(2))
          : 0;
        usedPackageId = packageToUse.id;

        // If the package is waiting_payment (bank transfer pending admin approval),
        // mark the booking as pending_payment so it doesn't appear on the calendar
        if (packageToUse.pkg_status === 'waiting_payment') {
          finalStatus = 'pending_payment';
          finalPaymentStatus = 'pending_payment';
        }
      } else {
        return res.status(400).json({ 
          error: 'Insufficient or mismatched package',
          message: bookingServiceName
            ? `No active ${bookingServiceName} package with enough hours. Choose a matching package or pay individually.`
            : 'No active package with enough hours. Choose a package or pay individually.'
        });
      }
    }

    // ── Partner package deduction (group bookings with partner) ─────────
    let partnerPackageUsed = null;
    if (partner_user_id && partner_customer_package_id && use_package === true && usedPackageId) {
      const partnerPkgCheck = await client.query(
        `SELECT id, package_name, remaining_hours, total_hours, used_hours
         FROM customer_packages
         WHERE id = $1 AND customer_id = $2 AND status = 'active'
           AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $3)
           AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)`,
        [partner_customer_package_id, partner_user_id, parseFloat(bookingDuration)]
      );

      if (partnerPkgCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: 'Partner package insufficient',
          message: 'Your partner does not have enough remaining hours in their package for this session.'
        });
      }

      const pPkg = partnerPkgCheck.rows[0];
      const pCurrentUsed = parseFloat(pPkg.used_hours) || 0;
      const pTotalHours = parseFloat(pPkg.total_hours) || 0;
      const pCurrentRemaining = pPkg.remaining_hours != null
        ? parseFloat(pPkg.remaining_hours) || 0
        : Math.max(0, pTotalHours - pCurrentUsed);
      const pNewRemaining = pCurrentRemaining - parseFloat(bookingDuration);
      const pNewUsed = pCurrentUsed + parseFloat(bookingDuration);

      const partnerUpdateResult = await client.query(`
        UPDATE customer_packages
        SET used_hours = $1::numeric,
            remaining_hours = $2::numeric,
            last_used_date = $5,
            updated_at = CURRENT_TIMESTAMP,
            status = CASE
              WHEN $2::numeric <= 0
                AND COALESCE(rental_days_remaining, 0) <= 0
                AND COALESCE(accommodation_nights_remaining, 0) <= 0
              THEN 'used_up'
              ELSE 'active'
            END
        WHERE id = $3 AND status = 'active'
          AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $4::numeric)
        RETURNING id, package_name, used_hours, remaining_hours, status
      `, [parseFloat(pNewUsed), parseFloat(pNewRemaining), partner_customer_package_id, parseFloat(bookingDuration), date]);

      if (partnerUpdateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: 'Partner package update failed',
          message: 'Could not deduct hours from partner\'s package. It may have been modified concurrently.'
        });
      }
      partnerPackageUsed = partnerUpdateResult.rows[0];
    }
    
    // Voucher/promo code handling for individual bookings (not package-based)
    let voucherDiscount = 0;
    let appliedVoucher = null;
    let originalAmount = finalAmount;
    
    if (voucherId && use_package === false && finalAmount > 0) {
      try {
        let userRoleForVoucher = req.user?.role || 'student';
        if (student_user_id && student_user_id !== req.user?.id) {
          const ur = await client.query('SELECT role FROM users WHERE id = $1', [student_user_id]);
          userRoleForVoucher = ur.rows[0]?.role || 'student';
        }

        const voucherCode = await voucherService.resolveVoucherLookupCode(voucherId);
        if (!voucherCode) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'This voucher code does not exist',
            code: 'VOUCHER_INVALID',
          });
        }

        const voucherValidation = await voucherService.validateVoucher({
          code: voucherCode,
          userId: student_user_id,
          userRole: userRoleForVoucher,
          context: 'lessons',
          amount: finalAmount,
          currency: walletCurrency,
          serviceId: service_id != null ? String(service_id) : undefined,
        });

        if (!voucherValidation.valid) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: voucherValidation.message || voucherValidation.error || 'Invalid voucher code',
            code: 'VOUCHER_INVALID',
          });
        }

        const fullVoucher = await voucherService.getVoucherById(voucherValidation.voucher.id);
        if (!fullVoucher) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Voucher not found',
            code: 'VOUCHER_INVALID',
          });
        }
        appliedVoucher = fullVoucher;

        // Handle wallet_credit type vouchers - don't apply as discount
        if (appliedVoucher.voucher_type === 'wallet_credit') {
          logger.info('Wallet credit voucher will be applied after booking', {
            voucherId: appliedVoucher.id,
            creditAmount: appliedVoucher.discount_value,
            userId: student_user_id
          });
        } else {
          // Calculate discount for percentage/fixed amount
          const discountResult = voucherService.calculateDiscount(appliedVoucher, finalAmount, walletCurrency);
          voucherDiscount = discountResult.discountAmount;
          finalAmount = discountResult.finalAmount;

          logger.info('Voucher discount applied to booking', {
            voucherId: appliedVoucher.id,
            voucherCode: appliedVoucher.code,
            originalAmount,
            discountAmount: voucherDiscount,
            finalAmount,
            voucherType: appliedVoucher.voucher_type,
            userId: student_user_id
          });
        }
      } catch (voucherErr) {
        logger.error('Error validating voucher for booking', {
          voucherId,
          userId: student_user_id,
          error: voucherErr.message
        });
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Failed to validate voucher',
          code: 'VOUCHER_ERROR'
        });
      }
    }
    
    // Defer transactions until booking exists, so we can attach booking_id
    const isHybridPayment = requestedPaymentMethod === 'wallet_hybrid' && use_package === false && finalAmount > 0;
    const isCreditCardPayment = (requestedPaymentMethod === 'credit_card' && use_package === false && finalAmount > 0) || isHybridPayment;
    let hybridWalletDeducted = 0;
    const pendingTransactions = [];
    if (student_user_id && use_package === false) {
      if (isHybridPayment) {
        // Hybrid: deduct what we can from wallet, charge the rest via Iyzico
        try {
          const balResult = await client.query(
            `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
            [student_user_id, walletCurrency || 'EUR']
          );
          const walletAvailable = parseFloat(balResult.rows[0]?.available_amount) || 0;
          hybridWalletDeducted = Math.min(walletAvailable, finalAmount);

          if (hybridWalletDeducted > 0) {
            pendingTransactions.push({
              userId: student_user_id,
              amount: -Math.abs(hybridWalletDeducted),
              type: 'booking_charge',
              description: `Partial wallet payment for lesson: ${date} ${start_hour}:00 (${bookingDuration}h)`,
              status: 'completed',
              currency: walletTransactionCurrency,
              metadata: {
                paymentMethod: 'wallet_hybrid',
                bookingDate: date,
                walletPortion: hybridWalletDeducted,
                cardPortion: finalAmount - hybridWalletDeducted,
                source: 'student_booking_wizard'
              }
            });
          }
        } catch (walletCheckErr) {
          logger.warn('Failed to check wallet for hybrid payment, falling back to full card', {
            error: walletCheckErr.message
          });
        }
        finalPaymentStatus = 'pending_payment';
      } else if (requestedPaymentMethod === 'credit_card') {
        // Credit card: don't charge wallet — Iyzico handles the payment
        finalPaymentStatus = 'pending_payment';
      } else if (requestedPaymentMethod === 'bank_transfer') {
        // Bank transfer: don't charge wallet — manual admin approval handles the payment
        // Set to 'waiting_payment' to ensure the lesson doesn't appear on the confirmed calendar
        finalPaymentStatus = 'waiting_payment';
        finalNotes = (finalNotes ? finalNotes + ' | ' : '') + `Bank Transfer requested | Bank Account ID: ${req.body.bank_account_id || 'Not specified'}`;
      } else if (finalAmount > 0) {
        pendingTransactions.push({
          userId: student_user_id,
          amount: -Math.abs(finalAmount),
          type: 'booking_charge',
          description: `Individual lesson charge: ${date} ${start_hour}:00 (${bookingDuration}h)${voucherDiscount > 0 ? ` (voucher discount: ${voucherDiscount})` : ''}`,
          status: 'completed',
          currency: walletTransactionCurrency,
          metadata: {
            paymentMethod: requestedPaymentMethod || 'wallet',
            bookingDate: date,
            startHour: start_hour,
            durationHours: bookingDuration,
            source: 'student_booking_wizard',
            voucherId: appliedVoucher?.id || null,
            voucherCode: appliedVoucher?.code || null,
            originalAmount: originalAmount,
            voucherDiscount: voucherDiscount
          }
        });
        finalPaymentStatus = 'paid';
      } else {
        finalPaymentStatus = 'paid'; // Pay-and-go: even zero amount is considered paid
      }
    } else if (use_package !== true) {
      // Only default to 'paid' when NOT using a package
      // When use_package === true, finalPaymentStatus was already set to 'package' above
      finalPaymentStatus = 'paid'; // Pay-and-go: default to paid
    }
    
    // Insert booking with calculated payment status
    const bookingColumns = [
      'date',
      'start_hour',
      'duration',
      'student_user_id',
      'instructor_user_id',
      'customer_user_id',
      'status',
      'payment_status',
      'amount',
      'discount_percent',
      'discount_amount',
      'final_amount',
      'notes',
      'location',
      'weather_conditions',
      'service_id',
      'checkin_notes',
      'checkout_notes',
      'customer_package_id',
      'group_size'
    ];

    // Calculate final amount
    const discountAmount = req.body.discount_amount || 0;
    const calculatedFinalAmount = finalAmount - discountAmount;

    const bookingValues = [
      date,
      parseFloat(start_hour), // Ensure numeric type for PostgreSQL
      parseFloat(duration), // Allow decimal durations (was parseInt)
      student_user_id,
      instructor_user_id,
      student_user_id, // customer_user_id = student_user_id for most cases
      finalStatus,
      finalPaymentStatus, // Now properly calculated based on package availability
      parseFloat(finalAmount) || 0, // Ensure numeric type
      parseFloat(req.body.discount_percent) || 0, // Ensure numeric type
      parseFloat(discountAmount) || 0, // Ensure numeric type
      parseFloat(calculatedFinalAmount) || 0, // Ensure numeric type
      finalNotes,
      location || 'TBD',
      req.body.weather_conditions || 'Good',
      req.body.service_id,
      req.body.checkin_notes || '',
      req.body.checkout_notes || '',
      usedPackageId, // Include the package ID that was used
      (partner_user_id && partnerPackageUsed) ? 2 : 1 // group_size: 2 if partner included
    ];

    const { columns: bookingInsertColumns, values: bookingInsertValues } = appendCreatedBy(bookingColumns, bookingValues, actorId);
    const bookingPlaceholders = bookingInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
    const insertBookingQuery = `INSERT INTO bookings (${bookingInsertColumns.join(', ')}) VALUES (${bookingPlaceholders}) RETURNING *`;

    const bookingResult = await client.query(insertBookingQuery, bookingInsertValues);
    
    const booking = bookingResult.rows[0];

    // For bank transfers, insert the receipt tracking row immediately
    if (requestedPaymentMethod === 'bank_transfer' && req.body.receiptUrl) {
      const bookingDepositPercent = req.body.deposit_percent || 0;
      const isBookingDeposit = bookingDepositPercent > 0;
      const bookingReceiptAmount = isBookingDeposit
        ? parseFloat(((finalAmount || 0) * bookingDepositPercent / 100).toFixed(2))
        : (finalAmount || 0);

      await client.query(`
        INSERT INTO bank_transfer_receipts (
          user_id, booking_id, bank_account_id, receipt_url, amount, currency, status, admin_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        student_user_id,
        booking.id,
        req.body.bank_account_id || null,
        req.body.receiptUrl,
        bookingReceiptAmount,
        req.body.currency || 'EUR',
        'pending',
        isBookingDeposit ? `DEPOSIT ${bookingDepositPercent}% — Paid: ${bookingReceiptAmount} ${req.body.currency || 'EUR'}, Remaining: ${parseFloat(((finalAmount || 0) - bookingReceiptAmount).toFixed(2))} ${req.body.currency || 'EUR'} due on arrival` : null
      ]);
      
      logger.info('Bank transfer receipt recorded for individual booking', {
        userId: student_user_id, bookingId: booking.id, receiptUrl: req.body.receiptUrl,
        ...(isBookingDeposit ? { depositPercent: bookingDepositPercent, receiptAmount: bookingReceiptAmount } : {})
      });

      try {
        req.socketService?.emitToChannel('dashboard', 'pending-transfer:new', { type: 'booking', bookingId: booking.id });
      } catch (e) { /* ignore */ }
    }

    // Now create any pending transactions with booking_id
    for (const tx of (pendingTransactions || [])) {
      const walletMetadata = {
        ...(tx.metadata || {}),
        bookingId: booking.id,
        actorId
      };

      try {
        await recordWalletTransaction({
          userId: tx.userId,
          amount: tx.amount,
          transactionType: tx.type,
          currency: tx.currency,
          status: tx.status,
          description: tx.description,
          metadata: walletMetadata,
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          createdBy: actorId,
          allowNegative: allowNegativeBalance, // Staff can book even if customer has no balance
          client
        });
      } catch (walletError) {
        logger.error('Failed to record wallet ledger entry for booking charge', {
          bookingId: booking.id,
          userId: tx.userId,
          amount: tx.amount,
          error: walletError?.message
        });
        throw walletError;
      }
    }

    // If partial payment scenario, optionally auto-charge the cash portion under flag
    if (BILLING_PARTIAL_PRECISION && booking.payment_status === 'partial') {
      const cashPortion = parseFloat(booking.final_amount) || 0;
      if (cashPortion > 0 && booking.student_user_id) {
        await recordWalletTransaction({
          userId: booking.student_user_id,
          amount: -Math.abs(cashPortion),
          transactionType: 'booking_charge',
          currency: booking.currency || DEFAULT_CURRENCY,
          status: 'completed',
          description: 'Individual lesson cash portion',
          metadata: { bookingId: booking.id, actorId, source: 'partial_cash_portion' },
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          createdBy: actorId,
          allowNegative: allowNegativeBalance, // Staff can book even if customer has no balance
          client
        });
      }
    }
    
    // Validate package booking integrity
    if (usedPackageId && booking.payment_status === 'package') {
      if (!booking.customer_package_id) {
        await client.query('ROLLBACK');
        return res.status(500).json({
          error: 'Package booking integrity error',
          message: 'Package hours were deducted but booking was not properly linked to the package. Please try again.'
        });
      }
      
      const packageVerification = await client.query(`
        SELECT id, package_name, used_hours, remaining_hours, status
        FROM customer_packages 
        WHERE id = $1
      `, [usedPackageId]);
      
      if (packageVerification.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(500).json({
          error: 'Package verification failed',
          message: 'Package could not be verified after booking creation. Please try again.'
        });
      }
    }

    // ── Create booking_participants for group partner booking ──────────────
    if (partner_user_id && partnerPackageUsed && usedPackageId) {
      // Primary participant
      await client.query(
        `INSERT INTO booking_participants (booking_id, user_id, is_primary, payment_status, payment_amount, customer_package_id, package_hours_used, notes)
         VALUES ($1, $2, true, 'package', 0, $3, $4, '')`,
        [booking.id, student_user_id, usedPackageId, parseFloat(bookingDuration)]
      );
      // Partner participant
      await client.query(
        `INSERT INTO booking_participants (booking_id, user_id, is_primary, payment_status, payment_amount, customer_package_id, package_hours_used, notes)
         VALUES ($1, $2, false, 'package', 0, $3, $4, '')`,
        [booking.id, partner_user_id, partner_customer_package_id, parseFloat(bookingDuration)]
      );
    }
    
    // Add equipment associations if any
    if (equipment_ids && equipment_ids.length > 0) {
      for (const equipment_id of equipment_ids) {
        await client.query(
          'INSERT INTO booking_equipment (booking_id, equipment_id) VALUES ($1, $2)',
          [booking.id, equipment_id]
        );
      }
    }
      await client.query('COMMIT');

    // Redeem voucher if one was applied
    let voucherRedemptionInfo = null;
    if (appliedVoucher) {
      try {
        const redemptionResult = await voucherService.redeemVoucher({
          voucherId: appliedVoucher.id,
          userId: student_user_id,
          referenceType: 'booking',
          referenceId: String(booking.id),
          originalAmount,
          discountAmount: voucherDiscount,
          currency: walletCurrency,
        });
        
        voucherRedemptionInfo = {
          voucherId: appliedVoucher.id,
          code: appliedVoucher.code,
          type: appliedVoucher.voucher_type,
          discountApplied: voucherDiscount,
          originalAmount,
          finalAmount
        };
        
        // If it's a wallet_credit voucher, apply the credit now
        if (appliedVoucher.voucher_type === 'wallet_credit') {
          try {
            const creditResult = await voucherService.applyWalletCredit(
              student_user_id,
              appliedVoucher.discount_value,
              appliedVoucher.id,
              walletCurrency
            );
            voucherRedemptionInfo.walletCreditApplied = Math.abs(
              parseFloat(creditResult?.amount ?? appliedVoucher.discount_value) || 0
            );
            voucherRedemptionInfo.walletCurrency = creditResult?.currency || walletCurrency;
            
            logger.info('Wallet credit voucher applied after booking', {
              voucherId: appliedVoucher.id,
              userId: student_user_id,
              creditAmount: voucherRedemptionInfo.walletCreditApplied,
              currency: voucherRedemptionInfo.walletCurrency,
            });
          } catch (creditErr) {
            logger.error('Failed to apply wallet credit from voucher after booking', {
              voucherId: appliedVoucher.id,
              userId: student_user_id,
              error: creditErr.message
            });
          }
        }
        
        logger.info('Voucher redeemed for booking', {
          voucherId: appliedVoucher.id,
          bookingId: booking.id,
          userId: student_user_id,
          discountApplied: voucherDiscount
        });
      } catch (redeemErr) {
        logger.error('Failed to redeem voucher (booking still succeeded)', {
          voucherId: appliedVoucher.id,
          userId: student_user_id,
          error: redeemErr.message
        });
      }
    }

    // Check if user should be upgraded from outsider to student after their first booking
    let roleUpgradeInfo = null;
    if (student_user_id) {
      try {
        const upgradeResult = await checkAndUpgradeAfterBooking(student_user_id);
        if (upgradeResult.upgraded) {
          logger.info('User automatically upgraded to student after first booking', {
            userId: student_user_id,
            bookingId: booking.id,
            newRole: upgradeResult.newRole
          });
          roleUpgradeInfo = {
            upgraded: true,
            newRole: upgradeResult.newRole,
            message: 'Congratulations! You have been upgraded to a student account.'
          };
        }
      } catch (upgradeError) {
        // Log but don't fail the booking if upgrade fails
        logger.warn('Failed to check/upgrade user role after booking', {
          userId: student_user_id,
          bookingId: booking.id,
          error: upgradeError?.message
        });
      }
    }

    // Send notifications only if booking was created by student/outsider (not by staff)
    const createdByRole = req.user?.role;
    const staffRoles = ['admin', 'manager', 'instructor', 'owner'];
    const isStaffCreated = staffRoles.includes(createdByRole);
    
    if (!isStaffCreated) {
      try {
        await bookingNotificationService.sendBookingCreated({ bookingId: booking.id });
      } catch (notificationError) {
        logger.warn('Failed to dispatch booking notifications for single booking', {
          bookingId: booking.id,
          error: notificationError?.message
        });
      }
    } else {
      logger.info('Skipping booking notifications - created by staff', {
        bookingId: booking.id,
        createdBy: actorId,
        role: createdByRole
      });
    }

    // Notify partner about the group session booking
    if (partner_user_id && partnerPackageUsed) {
      try {
        const bookerName = req.user?.name || req.user?.first_name || 'Your partner';
        const sessionDate = date;
        const sessionTime = `${Math.floor(parseFloat(start_hour))}:${String(Math.round((parseFloat(start_hour) % 1) * 60)).padStart(2, '0')}`;
        await insertNotification({
          userId: partner_user_id,
          title: 'Group Session Invite',
          message: `${bookerName} wants to book a ${bookingDuration}h ${bookingServiceName || 'group'} lesson with you on ${sessionDate} at ${sessionTime}. Do you accept?`,
          type: 'booking',
          data: {
            bookingId: booking.id,
            bookerUserId: student_user_id,
            bookerName,
            date: sessionDate,
            startHour: parseFloat(start_hour),
            duration: bookingDuration,
            serviceName: bookingServiceName,
            packageRemainingHours: parseFloat(partnerPackageUsed.remaining_hours),
            action: 'partner_invite',
            cta: {
              label: 'View Invite',
              href: '/student/schedule?tab=group'
            }
          }
        });
        // Real-time push — partner invite popup
        if (req.socketService) {
          req.socketService.emitToChannel(`user:${partner_user_id}`, 'booking:partner_invite', {
            bookingId: booking.id,
            bookerName,
            serviceName: bookingServiceName || 'Group Lesson',
            date: sessionDate,
            startTime: sessionTime,
            duration: bookingDuration,
            packageRemainingHours: parseFloat(partnerPackageUsed.remaining_hours),
          });
        }
      } catch (notifErr) {
        logger.warn('Failed to notify partner about group session', {
          partnerId: partner_user_id,
          bookingId: booking.id,
          error: notifErr?.message
        });
      }
    }
    
    // Emit real-time event for booking creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:created', booking);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'created' });
        if (booking.status === 'pending_payment' || booking.payment_status === 'pending_payment') {
          req.socketService.emitToChannel('dashboard', 'pending-transfer:updated', { bookingId: booking.id });
        }
      } catch (socketError) {
        logger.warn('Failed to emit socket event:', socketError);
      }
    }
    
    // Include role upgrade info and voucher info in response
    const response = { ...booking };
    if (roleUpgradeInfo) {
      response.roleUpgrade = roleUpgradeInfo;
    }
    if (voucherRedemptionInfo) {
      response.voucher = voucherRedemptionInfo;
    }

    // For credit card payments, initiate Iyzico checkout and return payment URL
    if (isCreditCardPayment) {
      try {
        // For hybrid payments, only charge the card for the deficit (total - wallet portion)
        const cardChargeAmount = isHybridPayment
          ? Math.max(0, finalAmount - hybridWalletDeducted)
          : finalAmount;

        if (cardChargeAmount > 0) {
          const iyzicoItems = [{
            id: String(booking.service_id || booking.id),
            name: bookingServiceName || `Booking #${booking.id}`,
            price: parseFloat(cardChargeAmount).toFixed(2)
          }];

          const gatewayResult = await initiateDeposit({
            amount: cardChargeAmount,
            currency: walletCurrency || 'EUR',
            userId: student_user_id,
            referenceCode: `BKG-${booking.id}`,
            items: iyzicoItems
          });

          response.paymentPageUrl = gatewayResult.paymentPageUrl;
          if (isHybridPayment) {
            response.hybridPayment = {
              walletCharged: hybridWalletDeducted,
              cardCharge: cardChargeAmount,
              totalAmount: finalAmount
            };
          }
          logger.info('Iyzico checkout initiated for booking', {
            bookingId: booking.id,
            amount: cardChargeAmount,
            hybridWalletDeducted,
            currency: walletCurrency,
            userId: student_user_id
          });
        } else {
          // Hybrid payment fully covered by wallet (edge case)
          finalPaymentStatus = 'paid';
          await pool.query(
            `UPDATE bookings SET payment_status = 'paid' WHERE id = $1`,
            [booking.id]
          );
        }
      } catch (iyzicoErr) {
        logger.error('Failed to initiate Iyzico checkout for booking', {
          bookingId: booking.id,
          error: iyzicoErr.message
        });
        // Booking was created but payment initiation failed — mark it
        await pool.query(
          `UPDATE bookings SET payment_status = 'failed' WHERE id = $1`,
          [booking.id]
        );
        return res.status(500).json({
          error: 'payment_initiation_failed',
          message: 'Booking was created but payment could not be initiated. Please try again or use a different payment method.',
          bookingId: booking.id
        });
      }
    }
    
    res.status(201).json(response);
  } catch (err) {
    await client.query('ROLLBACK');
    
    // Handle PostgreSQL constraint violations
    if (err.code === '23505') {
      if (err.constraint === 'idx_bookings_no_overlap') {
        logger.warn('Double-booking attempted', {
          instructor: req.body?.instructor_user_id,
          date: req.body?.date,
          startHour: req.body?.start_hour,
          duration: req.body?.duration
        });
        return res.status(409).json({
          error: 'booking_conflict',
          message: 'This time slot is already booked for this instructor. Please choose a different time.'
        });
      }
      // Handle other unique constraint violations
      logger.warn('Unique constraint violation during booking creation', { constraint: err.constraint });
      return res.status(409).json({
        error: 'conflict',
        message: 'A booking with these details already exists.'
      });
    }
    
    const errorMessage = err?.message || '';
    if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('wallet')) {
      logger.warn('Booking creation failed due to wallet balance issue', {
        studentId: req.body?.student_user_id,
        error: errorMessage
      });
      return res.status(400).json({
        error: 'insufficient_wallet_balance',
        message: 'Your wallet balance is not sufficient to cover this booking.'
      });
    }

    logger.error('Error creating booking:', err);
    return res.status(500).json({ error: 'Failed to create booking' });
  } finally {
    client.release();
  }
});

// CREATE a new GROUP booking with multiple participants
// POST /bookings/group - Create group booking with multiple participants
router.post('/group', 
  authenticateJWT, 
  authorizeRoles(['admin', 'manager', 'instructor', 'front_desk', 'student']),
  async (req, res) => {
  const client = await pool.connect();
  
  try {
  logger.info('Group booking request received', { body: req.body });
    
  await client.query('BEGIN');
  const actorId = resolveActorId(req);
    
    const { 
      date, start_hour, duration, instructor_user_id, 
      status, notes, location, equipment_ids, service_id,
      participants, // Array of participant objects with payment info
      allowNegativeBalance: requestedAllowNegative // Allow wallet balance to go negative if explicitly set
    } = req.body;

    // Staff roles automatically can allow negative balance (front desk can book even if customer has no balance)
    const staffRolesForNegativeBalance = ['admin', 'manager', 'front_desk', 'instructor'];
    const isStaffBooker = staffRolesForNegativeBalance.includes(req.user?.role);
    const allowNegativeBalance = requestedAllowNegative === true || isStaffBooker;

    // Staff roles automatically confirm bookings (admin, manager, front_desk)
    const staffRolesForAutoConfirm = ['admin', 'manager', 'front_desk'];
    const shouldAutoConfirm = staffRolesForAutoConfirm.includes(req.user?.role);
    const finalStatus = shouldAutoConfirm ? 'confirmed' : (status || 'pending');

    // Normalize participants to accept older client field names and sanitize boolean fields
    const normalizedParticipants = Array.isArray(participants) ? participants.map(p => ({
      ...p,
      customerPackageId: p.customerPackageId || p.selectedPackageId || p.selected_package_id,
      // Ensure boolean fields are properly converted (empty strings, undefined, etc. become false)
      isPrimary: p.isPrimary === true || p.isPrimary === 'true',
      usePackage: p.usePackage === true || p.usePackage === 'true',
      manualCashPreference: p.manualCashPreference === true || p.manualCashPreference === 'true'
    })) : [];
    
    logger.info('Group booking parsed values', {
      date, start_hour, duration, instructor_user_id, status, location, service_id,
  participantCount: normalizedParticipants?.length
    });
    
    // Validate required fields
  if (!date || !normalizedParticipants || !Array.isArray(normalizedParticipants) || normalizedParticipants.length === 0) {
      return res.status(400).json({ error: 'Date and participants are required for group booking' });
    }
    
    // Validate start_hour constraint (align with single booking: allow 0-24 range)
    if (start_hour !== undefined && start_hour !== null) {
      const startHourNum = Number(start_hour);
      if (!Number.isFinite(startHourNum) || startHourNum < 0 || startHourNum > 24) {
        return res.status(400).json({ error: `Invalid start_hour: ${start_hour}. Must be between 00:00 and 24:00` });
      }
    }
    
    // Validate instructor_user_id
    if (!instructor_user_id) {
      return res.status(400).json({ error: 'instructor_user_id is required' });
    }
    
    // Validate participants have required fields
    for (let i = 0; i < normalizedParticipants.length; i++) {
      const participant = normalizedParticipants[i];
      if (!participant.userId) {
        return res.status(400).json({ error: `Participant ${i + 1} is missing userId` });
      }
      logger.info(`Group booking participant ${i + 1}`, {
        userId: participant.userId,
        userName: participant.userName,
        usePackage: participant.usePackage,
        paymentStatus: participant.paymentStatus,
        isPrimary: participant.isPrimary
      });
    }
    
    const bookingDuration = parseFloat(duration) || 1;

    const normalizedDate = typeof date === 'string' && date.includes('T')
      ? date.split('T')[0]
      : date;
    const startHourNumeric = Number(start_hour);

    if (!Number.isFinite(startHourNumeric)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'start_hour is required for group booking' });
    }

    const slotCheck = await client.query(
      `SELECT id, start_hour, duration, (start_hour + duration) as end_hour
       FROM bookings 
       WHERE date = $1 
         AND instructor_user_id = $2
         AND status NOT IN ('cancelled', 'pending_payment')
         AND deleted_at IS NULL
         AND (
           (start_hour <= $3 AND (start_hour + duration) > $3) OR
           (start_hour >= $3 AND start_hour < ($3 + $4))
         )`,
      [normalizedDate, instructor_user_id, startHourNumeric, bookingDuration]
    );

    if (slotCheck.rows.length > 0) {
      const conflictingBooking = slotCheck.rows[0];
      const formatTime = (hourValue) => {
        const hours = Math.floor(hourValue);
        const minutes = Math.round((hourValue - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      };

      const requestedStartTime = formatTime(startHourNumeric);
      const requestedEndTime = formatTime(startHourNumeric + bookingDuration);
      const conflictStartTime = formatTime(conflictingBooking.start_hour);
      const conflictEndTime = formatTime(conflictingBooking.start_hour + conflictingBooking.duration);

      const allBookingsQuery = await client.query(
        `SELECT start_hour, duration 
         FROM bookings 
         WHERE date = $1 
           AND instructor_user_id = $2
           AND status NOT IN ('cancelled', 'pending_payment')
           AND deleted_at IS NULL
         ORDER BY start_hour`,
        [normalizedDate, instructor_user_id]
      );

      const suggestedSlots = [];
      const workingHours = { start: 8, end: 18 };
      const existingBookings = allBookingsQuery.rows.sort((a, b) => a.start_hour - b.start_hour);

      const hasConflict = (start) => {
        const slotEnd = start + bookingDuration;
        return existingBookings.some((booking) => {
          const bookingStart = parseFloat(booking.start_hour);
          const bookingEnd = bookingStart + parseFloat(booking.duration);
          return start < bookingEnd && slotEnd > bookingStart;
        });
      };

      const addSuggestion = (start) => {
        const slotEnd = start + bookingDuration;
        const hours = Math.floor(start);
        const minutes = Math.round((start - hours) * 60);
        const slotStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        const endHours = Math.floor(slotEnd);
        const endMinutes = Math.round((slotEnd - endHours) * 60);
        const slotEndTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
        suggestedSlots.push({
          startTime: slotStartTime,
          endTime: slotEndTime,
          startHour: start,
          duration: bookingDuration
        });
      };

      const conflictingEnd = parseFloat(conflictingBooking.start_hour) + parseFloat(conflictingBooking.duration);
      let searchStart = Math.ceil((conflictingEnd + 0.5) * 2) / 2;

      for (let hour = searchStart; hour <= workingHours.end - bookingDuration; hour += 0.5) {
        if (!hasConflict(hour)) {
          addSuggestion(hour);
        }
        if (suggestedSlots.length >= 2) break;
      }

      if (suggestedSlots.length < 3) {
        const conflictingStart = parseFloat(conflictingBooking.start_hour);
        for (let hour = workingHours.start; hour <= conflictingStart - bookingDuration; hour += 0.5) {
          if (!hasConflict(hour) && hour + bookingDuration <= conflictingStart) {
            addSuggestion(hour);
          }
          if (suggestedSlots.length >= 3) break;
        }
      }

      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Time slot unavailable',
        details: {
          message: `The requested time slot ${requestedStartTime}-${requestedEndTime} conflicts with an existing booking from ${conflictStartTime}-${conflictEndTime}.`,
          conflictingSlot: {
            startTime: conflictStartTime,
            endTime: conflictEndTime
          },
          requestedSlot: {
            startTime: requestedStartTime,
            endTime: requestedEndTime
          },
          suggestedSlots,
          date: normalizedDate
        },
        conflicts: slotCheck.rows
      });
    }

  const groupSize = normalizedParticipants.length;
    
    // Find the primary participant
  const primaryParticipant = normalizedParticipants.find(p => p.isPrimary) || normalizedParticipants[0];
    
    // Get the primary participant's preferred currency for billing
    let billingCurrency = DEFAULT_CURRENCY;
    if (primaryParticipant?.userId) {
      const userCurrencyQuery = await client.query(
        'SELECT preferred_currency FROM users WHERE id = $1',
        [primaryParticipant.userId]
      );
      if (userCurrencyQuery.rows.length > 0 && userCurrencyQuery.rows[0].preferred_currency) {
        billingCurrency = userCurrencyQuery.rows[0].preferred_currency;
      }
    }
    
    // Get service info for calculations and package matching
    let servicePrice = 0;
    let serviceName = null;
    if (service_id) {
      const serviceQuery = await client.query('SELECT price, name, category, currency FROM services WHERE id = $1', [service_id]);
      if (serviceQuery.rows.length > 0) {
        serviceName = serviceQuery.rows[0].name || null;
        // Look up price in user's preferred currency
        const priceResult = await getServicePriceInCurrency(service_id, billingCurrency);
        if (priceResult && priceResult.price > 0) {
          servicePrice = priceResult.price;
        } else {
          // Fallback to default service price
          servicePrice = parseFloat(serviceQuery.rows[0].price) || 0;
        }
      }
    }
    
  // Calculate individual participant amounts
  // For group bookings, base amount per participant = servicePrice * duration
  const participantAmount = servicePrice * bookingDuration;
    
    // Process package logic for each participant
  const processedParticipants = [];
  const pendingTransactions = [];
  const packageFallbacks = [];
    let totalPackageUsers = 0;
    let totalPaidAmount = 0;
    let primaryParticipantPackageId = null;
    
  for (const participant of normalizedParticipants) {
      const processedParticipant = {
        ...participant,
        paymentAmount: participantAmount,
        actualPaymentStatus: 'paid', // Pay-and-go: default to paid
        customerPackageId: null
      };

      let cashRegistered = false;
      const registerCashPayment = (reason, overrideStatus) => {
        if (cashRegistered) return;

        const rawStatus = overrideStatus || participant.paymentStatus || 'paid';
        const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : rawStatus;
        const finalStatus = ['paid', 'partial', 'package'].includes(normalizedStatus) ? normalizedStatus : 'paid'; // Pay-and-go: default to paid
        const fallbackAmount = Number.isFinite(Number(participant.paymentAmount))
          ? Math.max(0, Number(participant.paymentAmount))
          : participantAmount;

        processedParticipant.actualPaymentStatus = finalStatus;
        processedParticipant.paymentAmount = fallbackAmount;
        processedParticipant.customerPackageId = null;
        processedParticipant.packageHoursUsed = 0;
        processedParticipant.cashHoursUsed = parseFloat(bookingDuration) || 0;

        totalPaidAmount += fallbackAmount;

        if (fallbackAmount > 0) {
          const transactionStatus = finalStatus === 'paid'
            ? 'completed'
            : (BILLING_PARTIAL_PRECISION && finalStatus === 'partial')
              ? 'completed'
              : 'pending';

          pendingTransactions.push({
            userId: participant.userId,
            amount: -Math.abs(fallbackAmount),
            type: 'booking_charge',
            description: `Group lesson charge: ${date} ${start_hour}:00 (${bookingDuration}h)`,
            status: transactionStatus
          });

          processedParticipant.cashTransactionStatus = transactionStatus;

          logger.info('📒 Group booking cash charge registered', {
            bookingDate: date,
            participantId: participant.userId,
            participantName: participant.userName,
            amount: fallbackAmount,
            paymentStatus: finalStatus,
            transactionStatus,
            reason: reason || null
          });
        }

        if (reason) {
          packageFallbacks.push({
            userId: participant.userId,
            userName: participant.userName,
            attemptedPackageId: participant.customerPackageId || null,
            reason
          });
        }

        cashRegistered = true;
      };
      
      // Handle package payment for this participant
      // Accept either explicit usePackage flag or a paymentStatus coming from UI as 'package'/'partial'
      const wantsToUsePackage = (
        participant.usePackage === true ||
        participant.usePackage === 'true' ||
        !!participant.customerPackageId ||
        (typeof participant.paymentStatus === 'string' &&
          ['package', 'partial'].includes(participant.paymentStatus.toLowerCase()))
      );

  if (wantsToUsePackage && participant.userId) {
    let packageApplied = false;
    let fallbackReason = null;

        // Prefer a specific package if provided; otherwise pick the earliest active with some hours
        let packageCheck;
        if (participant.customerPackageId) {
          // User explicitly selected this package — trust the choice, only verify
          // ownership, active status, and expiry. Skip lesson_service_name matching
          // because the frontend already filtered packages for the selected service.
          const params = [participant.customerPackageId, participant.userId, date];
          const sql = `
            SELECT cp.id, cp.package_name, cp.remaining_hours, cp.total_hours, cp.used_hours, cp.purchase_price, cp.lesson_service_name
            FROM customer_packages cp
            LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
            WHERE cp.id = $1 AND cp.customer_id = $2
              AND cp.status = 'active'
              AND (cp.expiry_date IS NULL OR cp.expiry_date >= $3)
            LIMIT 1
          `;
          packageCheck = await client.query(sql, params);
        } else {
          // Pick earliest active package matching service type/name with enough hours
          const params = [participant.userId, date];
          let sql = `
            SELECT cp.id, cp.package_name, cp.remaining_hours, cp.total_hours, cp.used_hours, cp.purchase_price, cp.lesson_service_name
            FROM customer_packages cp
            LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
            WHERE cp.customer_id = $1 
              AND cp.status = 'active' 
              AND (cp.expiry_date IS NULL OR cp.expiry_date >= $2)
          `;
          if (serviceName) {
            // Flexible matching: check both customer_packages AND service_packages lesson_service_name
            sql += ` AND (
              cp.lesson_service_name IS NULL 
              OR LOWER(cp.lesson_service_name) = LOWER($3)
              OR LOWER(RTRIM(cp.lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
              OR LOWER(sp.lesson_service_name) = LOWER($3)
              OR LOWER(RTRIM(sp.lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
            )`;
            params.push(serviceName);
          }
          sql += ' ORDER BY cp.purchase_date ASC LIMIT 1';
          packageCheck = await client.query(sql, params);
        }
        
  if (packageCheck.rows.length > 0) {
          // Participant has a matching active package; allow partial consumption
          const packageToUse = packageCheck.rows[0];
          const rh = packageToUse.remaining_hours;
          const uh = packageToUse.used_hours;
          const th = packageToUse.total_hours;
          const currentUsed = parseFloat(uh) || 0;
          const totalHours = parseFloat(th) || 0;
          const currentRemaining = rh !== null && rh !== undefined
            ? parseFloat(rh) || 0
            : Math.max(0, totalHours - currentUsed);
          const consume = Math.min(parseFloat(bookingDuration), Math.max(0, currentRemaining));
          const newRemainingHours = currentRemaining - consume;
          const newUsedHours = currentUsed + consume;
          
          // Update the package — check all 3 components for all_inclusive packages
          const packageUpdateResult = await client.query(`
            UPDATE customer_packages 
            SET used_hours = $1::numeric, 
                remaining_hours = $2::numeric,
                last_used_date = $3,
                updated_at = CURRENT_TIMESTAMP,
                status = CASE 
                  WHEN $2::numeric <= 0
                    AND COALESCE(rental_days_remaining, 0) <= 0
                    AND COALESCE(accommodation_nights_remaining, 0) <= 0
                  THEN 'used_up'
                  ELSE 'active'
                END
            WHERE id = $4 AND status = 'active' 
              AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $5::numeric)
              AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)
            RETURNING id, package_name, used_hours, remaining_hours, status, total_hours, purchase_price
          `, [parseFloat(newUsedHours), parseFloat(newRemainingHours), date, packageToUse.id, parseFloat(consume)]);
          
          if (packageUpdateResult.rows.length === 0) {
            fallbackReason = 'Selected package no longer has sufficient hours.';
          } else {
            // Determine cash portion based on package per-hour price
            const updatedPkg = packageUpdateResult.rows[0];
            const pkgTotalHours = parseFloat(updatedPkg.total_hours) || parseFloat(th) || 0;
            const pkgPrice = parseFloat(updatedPkg.purchase_price) || parseFloat(packageToUse.purchase_price) || 0;
            const packageRate = pkgTotalHours > 0 ? (pkgPrice / pkgTotalHours) : 0;

            const usedFromPackage = consume;
            const cashPortion = Math.max(0, (participantAmount) - (usedFromPackage * packageRate));

            // Set package payment details (partial or full)
            processedParticipant.customerPackageId = packageToUse.id;
            if (cashPortion > 0) {
              processedParticipant.actualPaymentStatus = 'partial';
              processedParticipant.paymentAmount = cashPortion;
            } else {
              processedParticipant.actualPaymentStatus = 'package';
              processedParticipant.paymentAmount = 0;
            }
            // Track exact hours consumed from package for this participant
            processedParticipant.packageHoursUsed = parseFloat(consume) || 0;
            // Also track cash hours used (duration - consume), never negative
            processedParticipant.cashHoursUsed = Math.max(0, parseFloat(bookingDuration) - (parseFloat(consume) || 0));
            // Count as package user if any package hours consumed
            if (usedFromPackage > 0) totalPackageUsers++;
            packageApplied = true;

            if (participant.isPrimary) {
              primaryParticipantPackageId = packageToUse.id;
            }
          }
        } else {
          // If a specific package was selected but mismatched/expired, block; otherwise gracefully fallback to individual
          if (participant.customerPackageId) {
            fallbackReason = serviceName 
              ? `Selected package doesn't match ${serviceName} or lacks hours.`
              : 'Selected package lacks remaining hours.';
          }
        }

        if (!packageApplied) {
          registerCashPayment(fallbackReason || 'Package not applied; falling back to cash.');
        }
      } else {
        registerCashPayment();
      }
      
      // Accumulate cash portions for partial/package users into totalPaidAmount
      if (
        processedParticipant.customerPackageId &&
        processedParticipant.actualPaymentStatus === 'partial' &&
        processedParticipant.paymentAmount > 0
      ) {
        totalPaidAmount += processedParticipant.paymentAmount;
      }

      processedParticipants.push(processedParticipant);
    }
    
    // Determine main booking payment status and amount
    let mainBookingPaymentStatus = 'paid'; // Pay-and-go: default to paid
    let mainBookingAmount = servicePrice * bookingDuration * groupSize;
    let mainBookingCustomerPackageId = null;
    
  if (totalPackageUsers === groupSize) {
      mainBookingPaymentStatus = 'package';
      mainBookingAmount = 0;
      mainBookingCustomerPackageId = primaryParticipantPackageId;
    } else if (totalPackageUsers > 0) {
      mainBookingPaymentStatus = 'partial';
      mainBookingAmount = totalPaidAmount;
      // Link to the primary participant's package for traceability
      mainBookingCustomerPackageId = primaryParticipantPackageId;
    } else {
      // Pay-and-go: all individual payments are considered paid
      mainBookingPaymentStatus = 'paid';
    }
    
    // Insert main booking record
    const groupBookingColumns = [
      'date',
      'start_hour',
      'duration',
      'student_user_id',
      'instructor_user_id',
      'customer_user_id',
      'status',
      'payment_status',
      'amount',
      'final_amount',
      'notes',
      'location',
      'service_id',
      'group_size',
      'max_participants',
      'customer_package_id'
    ];

    const groupBookingValues = [
      date,
      parseFloat(start_hour),
      parseFloat(duration),
      primaryParticipant.userId,
      instructor_user_id,
      primaryParticipant.userId,
      finalStatus,
      mainBookingPaymentStatus,
      parseFloat(mainBookingAmount) || 0,
      parseFloat(mainBookingAmount) || 0,
      notes || '',
      location || 'TBD',
      service_id,
      Number.parseInt(groupSize, 10),
      Math.max(Number.parseInt(groupSize, 10), 10),
      mainBookingCustomerPackageId
    ];

    const { columns: groupBookingInsertColumns, values: groupBookingInsertValues } = appendCreatedBy(groupBookingColumns, groupBookingValues, actorId);
    const groupBookingPlaceholders = groupBookingInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
    const groupBookingQuery = `INSERT INTO bookings (${groupBookingInsertColumns.join(', ')}) VALUES (${groupBookingPlaceholders}) RETURNING *`;

    const bookingResult = await client.query(groupBookingQuery, groupBookingInsertValues);
    
    const booking = bookingResult.rows[0];
    
    // Insert all participants into booking_participants table with their payment details
    for (const participant of processedParticipants) {
      const participantColumns = [
        'booking_id',
        'user_id',
        'is_primary',
        'payment_status',
        'payment_amount',
        'notes',
        'customer_package_id',
        'package_hours_used',
        'cash_hours_used'
      ];
      const participantValues = [
        booking.id,
        participant.userId,
        participant.isPrimary === true, // Ensure boolean for PostgreSQL
        participant.actualPaymentStatus,
        participant.paymentAmount,
        participant.notes || '',
        participant.customerPackageId,
        participant.packageHoursUsed || 0,
        participant.cashHoursUsed || 0
      ];
      const { columns: participantInsertColumns, values: participantInsertValues } = appendCreatedBy(participantColumns, participantValues, actorId);
      const participantPlaceholders = participantInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
      await client.query(
        `INSERT INTO booking_participants (${participantInsertColumns.join(', ')}) VALUES (${participantPlaceholders})`,
        participantInsertValues
      );
    }
    
    // After booking is created, post any pending transactions linked to this booking
    for (const tx of pendingTransactions) {
      const metadata = {
        ...(tx.metadata || {}),
        bookingId: booking.id,
        actorId,
        source: tx.metadata?.source || 'group_booking_wizard'
      };

      try {
        await recordWalletTransaction({
          userId: tx.userId,
          amount: tx.amount,
          transactionType: tx.type,
          currency: tx.currency || DEFAULT_CURRENCY,
          status: tx.status || 'completed',
          description: tx.description,
          metadata,
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          createdBy: actorId,
          allowNegative: allowNegativeBalance === true, // Allow negative balance if explicitly enabled
          client
        });
      } catch (walletError) {
        logger.error('Failed to record wallet ledger entry for group booking charge', {
          bookingId: booking.id,
          userId: tx.userId,
          amount: tx.amount,
          error: walletError?.message
        });
        throw walletError;
      }
    }
    // Optionally, under feature flag, charge partial cash portion immediately
    if (BILLING_PARTIAL_PRECISION) {
      for (const pp of processedParticipants) {
        if (pp.actualPaymentStatus === 'partial' && pp.paymentAmount > 0 && pp.cashTransactionStatus !== 'completed') {
          try {
            await recordWalletTransaction({
              userId: pp.userId,
              amount: -Math.abs(pp.paymentAmount),
              transactionType: 'booking_charge',
              currency: pp.currency || DEFAULT_CURRENCY,
              status: 'completed',
              description: 'Group lesson cash portion',
              metadata: {
                bookingId: booking.id,
                actorId,
                source: 'group_partial_cash_portion'
              },
              relatedEntityType: 'booking',
              relatedEntityId: booking.id,
              createdBy: actorId,
              allowNegative: allowNegativeBalance === true, // Allow negative balance if explicitly enabled
              client
            });
          } catch (walletError) {
            logger.error('Failed to record wallet ledger entry for group partial cash portion', {
              bookingId: booking.id,
              userId: pp.userId,
              amount: pp.paymentAmount,
              error: walletError?.message
            });
            throw walletError;
          }
        }
      }
    }

    // Add equipment associations if any
    if (equipment_ids && equipment_ids.length > 0) {
      for (const equipment_id of equipment_ids) {
        await client.query(
          'INSERT INTO booking_equipment (booking_id, equipment_id) VALUES ($1, $2)',
          [booking.id, equipment_id]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Fetch the complete booking with participants for response
    const completeBookingQuery = `
      SELECT 
        b.*,
        json_agg(
          json_build_object(
            'userId', bp.user_id,
            'userName', u.name,
            'userEmail', u.email,
            'userPhone', u.phone,
            'isPrimary', bp.is_primary,
            'paymentStatus', bp.payment_status,
            'paymentAmount', bp.payment_amount,
            'customerPackageId', bp.customer_package_id,
            'notes', bp.notes
          )
        ) as participants
      FROM bookings b
      LEFT JOIN booking_participants bp ON b.id = bp.booking_id
      LEFT JOIN users u ON bp.user_id = u.id
      WHERE b.id = $1
      GROUP BY b.id
    `;
    
    const completeBookingResult = await client.query(completeBookingQuery, [booking.id]);
    const completeBooking = completeBookingResult.rows[0];
    if (completeBooking) {
      if (packageFallbacks.length > 0) {
        completeBooking.packageFallbacks = packageFallbacks;
      }

      try {
        await BookingUpdateCascadeService.cascadeBookingUpdate(completeBooking, { _custom_commission_changed: true });
      } catch (cascadeError) {
        logger.warn('Failed to cascade instructor earnings after group booking creation', {
          bookingId: completeBooking.id,
          error: cascadeError?.message
        });
      }
    }

    // Send notifications only if booking was created by student (not by staff)
    const createdByRole = req.user?.role;
    const staffRoles = ['admin', 'manager', 'instructor', 'owner'];
    const isStaffCreated = staffRoles.includes(createdByRole);
    
    if (!isStaffCreated) {
      try {
        await bookingNotificationService.sendBookingCreated({ bookingId: booking.id });
      } catch (notificationError) {
        logger.warn('Failed to dispatch booking notifications for group booking', {
          bookingId: booking.id,
          error: notificationError?.message
        });
      }
    } else {
      logger.info('Skipping booking notifications - group booking created by staff', {
        bookingId: booking.id,
        createdBy: actorId,
        role: createdByRole
      });
    }
    
    // Emit real-time event for booking creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:created', completeBooking);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'created' });
      } catch (socketError) {
        logger.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.status(201).json(completeBooking);
  } catch (err) {
    await client.query('ROLLBACK');
  logger.error('Error creating group booking:', err);
  logger.error('Request body for group booking failure', { body: req.body });
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Failed to create group booking';
    let statusCode = 500;
    
    // Handle wallet-related errors
    if (err.message && (err.message.includes('Insufficient wallet balance') || err.message.includes('wallet'))) {
      errorMessage = err.message;
      statusCode = 400; // Bad request - business logic failure, not server error
    } else if (err.code) {
      switch (err.code) {
        case '23502': // NOT NULL violation
          errorMessage = 'Missing required field: ' + err.column;
          statusCode = 400;
          break;
        case '23503': // FOREIGN KEY violation
          errorMessage = 'Invalid reference: ' + err.detail;
          statusCode = 400;
          break;
        case '23514': // CHECK constraint violation
          if (err.constraint === 'chk_realistic_hours') {
            errorMessage = 'Invalid start time - must be between 6:00 and 23:00';
          } else {
            errorMessage = 'Data validation failed: ' + err.constraint;
          }
          statusCode = 400;
          break;
        case '22P02': // Invalid input syntax
          errorMessage = 'Invalid data format';
          statusCode = 400;
          break;
        default:
          errorMessage = 'Database error';
      }
    }
    
    res.status(statusCode).json({ error: errorMessage, code: err.code });
  } finally {
    client.release();
  }
});

// POST create a new booking from the calendar
router.post('/calendar', authenticateJWT, async (req, res) => {
  try {
    const { 
      date, time, duration, instructorId, serviceId, user, 
      amount, finalAmount, paymentStatus, checkinStatus, checkoutStatus, use_package, customerPackageId,
      allowNegativeBalance: requestedAllowNegative // Allow wallet balance to go negative if explicitly set
    } = req.body;
    
    // Staff roles automatically can allow negative balance (front desk can book even if customer has no balance)
    const staffRolesForNegativeBalance = ['admin', 'manager', 'front_desk', 'instructor'];
    const isStaffBooker = staffRolesForNegativeBalance.includes(req.user?.role);
    // trusted_customer with pay_later: allow negative balance so debt is tracked in wallet
    const isTrustedCustomerPayLater = req.user?.role === 'trusted_customer' && requestedPaymentMethod === 'pay_later';
    const allowNegativeBalance = requestedAllowNegative === true || isStaffBooker || isTrustedCustomerPayLater;
    const walletCurrencyRaw = req.body.wallet_currency || req.body.walletCurrency || req.body.currency;
    const requestedPaymentMethod = req.body.payment_method || req.body.paymentMethod || null;
    
    // Currency will be resolved later after we know the user ID
    let resolvedWalletCurrency = walletCurrencyRaw?.trim()?.toUpperCase() || null;

    if (!date || !time || !instructorId || !serviceId || !user) {
      return res.status(400).json({ error: 'Missing required booking information' });
    }
      if (!user.name || !user.email) {
      return res.status(400).json({ error: 'Missing required user information (name and email)' });
    }
    
    // Convert time string (like "09:00") to decimal hours (like 9.0)
    const [hours, minutes] = time.split(':').map(Number);
    const start_hour = hours + (minutes / 60);
    
    // Use provided duration or default to 1 hour
    const bookingDuration = parseFloat(duration) || 1.0;
    
    // Check if the user already exists in the system
    let userId;
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [user.email]
    );
    
    // Begin transaction
    const client = await pool.connect();
    try {
      const actorId = resolveActorId(req);
      await client.query('BEGIN');
      
      // If user doesn't exist, create a new user record with student role
      if (userCheck.rows.length === 0) {
        // Get student role ID
        const roleQuery = await client.query(
          'SELECT id FROM roles WHERE name = $1',
          ['student']
        );
        
        if (roleQuery.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(500).json({ error: 'Student role not found in system' });
        }
        
        const studentRoleId = roleQuery.rows[0].id;
          const newUser = await client.query(
          `INSERT INTO users (name, email, phone, role_id, password_hash, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
           RETURNING id`,
          [user.name, user.email, user.phone, studentRoleId, 'calendar_user_no_password']
        );
        userId = newUser.rows[0].id;
      } else {
        userId = userCheck.rows[0].id;
      }
      
      // Get user's preferred currency if not specified in request
      if (!resolvedWalletCurrency) {
        const userCurrencyResult = await client.query(
          'SELECT preferred_currency FROM users WHERE id = $1',
          [userId]
        );
        resolvedWalletCurrency = userCurrencyResult.rows[0]?.preferred_currency || DEFAULT_CURRENCY;
      }
      // Wallet transactions MUST use the system's storage currency (EUR).
      // preferred_currency is for display/price-lookup only, not for wallet storage.
      const walletTransactionCurrency = DEFAULT_CURRENCY;
        
      // Normalize date format to YYYY-MM-DD if it's not already
      const normalizedDate = typeof date === 'string' && date.includes('T') 
        ? date.split('T')[0] 
        : date;      // Check if the slot is still available (check for time conflicts)
      const slotCheck = await client.query(
        `SELECT id, start_hour, duration, (start_hour + duration) as end_hour
         FROM bookings 
         WHERE date = $1 
         AND instructor_user_id = $2
         AND status NOT IN ('cancelled', 'pending_payment')
         AND deleted_at IS NULL
         AND (
           (start_hour <= $3 AND (start_hour + duration) > $3) OR
           (start_hour >= $3 AND start_hour < ($3 + $4))
         )`,
        [normalizedDate, instructorId, parseFloat(start_hour), parseFloat(bookingDuration)]
      );
      
      if (slotCheck.rows.length > 0) {
        const conflictingBooking = slotCheck.rows[0];
        const requestedStartTime = `${Math.floor(start_hour).toString().padStart(2, '0')}:${Math.round((start_hour - Math.floor(start_hour)) * 60).toString().padStart(2, '0')}`;
        const requestedEndTime = `${Math.floor(start_hour + bookingDuration).toString().padStart(2, '0')}:${Math.round(((start_hour + bookingDuration) - Math.floor(start_hour + bookingDuration)) * 60).toString().padStart(2, '0')}`;
        const conflictStartTime = `${Math.floor(conflictingBooking.start_hour).toString().padStart(2, '0')}:${Math.round((conflictingBooking.start_hour - Math.floor(conflictingBooking.start_hour)) * 60).toString().padStart(2, '0')}`;
        const conflictEndTime = `${Math.floor(conflictingBooking.end_hour).toString().padStart(2, '0')}:${Math.round((conflictingBooking.end_hour - Math.floor(conflictingBooking.end_hour)) * 60).toString().padStart(2, '0')}`;
        
        // Get available time slots for suggestions
        const allBookingsQuery = await client.query(
          `SELECT start_hour, duration 
           FROM bookings 
           WHERE date = $1 
           AND instructor_user_id = $2
           AND status NOT IN ('cancelled', 'pending_payment')
           AND deleted_at IS NULL
           ORDER BY start_hour`,
          [normalizedDate, instructorId]
        );
        
        // Improved slot suggestion algorithm - find slots that don't conflict
        const suggestedSlots = [];
        const workingHours = { start: 8, end: 18 };
        const existingBookings = allBookingsQuery.rows.sort((a, b) => a.start_hour - b.start_hour);
        
        // Strategy 1: Look for slots after the conflicting booking ends
        const conflictingEnd = parseFloat(conflictingBooking.start_hour) + parseFloat(conflictingBooking.duration);
        
        // Find next available slot after the conflict with 30-minute buffer
        let searchStart = Math.ceil((conflictingEnd + 0.5) * 2) / 2;
        
        for (let hour = searchStart; hour <= workingHours.end - bookingDuration; hour += 0.5) {
          const slotEnd = hour + bookingDuration;
          let hasConflict = false;
          
          // Check if this slot conflicts with any existing booking
          for (const booking of existingBookings) {
            const bookingStart = parseFloat(booking.start_hour);
            const bookingEnd = parseFloat(booking.start_hour) + parseFloat(booking.duration);
            
            // Check for any overlap
            if ((hour < bookingEnd && slotEnd > bookingStart)) {
              hasConflict = true;
              break;
            }
          }
          
          if (!hasConflict) {
            const hours = Math.floor(hour);
            const minutes = Math.round((hour - hours) * 60);
            const slotStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            
            const endHours = Math.floor(slotEnd);
            const endMinutes = Math.round((slotEnd - endHours) * 60);
            const slotEndTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
            
            suggestedSlots.push({
              startTime: slotStartTime,
              endTime: slotEndTime,
              startHour: hour,
              duration: bookingDuration
            });
            
            // Available slot found (development logging)
          }
          
          if (suggestedSlots.length >= 2) break; // Get 2 slots after conflict
        }
        
        // Strategy 2: Look for slots before the conflicting booking starts (if we need more suggestions)
        if (suggestedSlots.length < 3) {
          const conflictingStart = parseFloat(conflictingBooking.start_hour);
          // Looking for slots before conflict (development logging)
          
          // Find available slot before the conflict
          for (let hour = workingHours.start; hour <= conflictingStart - bookingDuration; hour += 0.5) {
            const slotEnd = hour + bookingDuration;
            let hasConflict = false;
            
            // Check if this slot conflicts with any existing booking
            for (const booking of existingBookings) {
              const bookingStart = parseFloat(booking.start_hour);
              const bookingEnd = parseFloat(booking.start_hour) + parseFloat(booking.duration);
              
              // Check for any overlap
              if ((hour < bookingEnd && slotEnd > bookingStart)) {
                hasConflict = true;
                break;
              }
            }
            
            if (!hasConflict && slotEnd <= conflictingStart) { // Ensure it ends before conflict starts
              const hours = Math.floor(hour);
              const minutes = Math.round((hour - hours) * 60);
              const slotStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
              
              const endHours = Math.floor(slotEnd);
              const endMinutes = Math.round((slotEnd - endHours) * 60);
              const slotEndTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
              
              suggestedSlots.push({
                startTime: slotStartTime,
                endTime: slotEndTime,
                startHour: hour,
                duration: bookingDuration
              });
              
              // Available slot found before conflict (development logging)
            }
            
            if (suggestedSlots.length >= 3) break; // Limit to 3 total suggestions
          }
        }
        
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Time slot unavailable',
          details: {
            message: `The requested time slot ${requestedStartTime}-${requestedEndTime} conflicts with an existing booking from ${conflictStartTime}-${conflictEndTime}.`,
            conflictingSlot: {
              startTime: conflictStartTime,
              endTime: conflictEndTime
            },
            requestedSlot: {
              startTime: requestedStartTime,
              endTime: requestedEndTime
            },
            suggestedSlots: suggestedSlots,
            date: normalizedDate
          }
        });
      }
        // Get service information to determine duration if available
      const serviceQuery = await client.query(
        `SELECT duration, price, name, currency FROM services WHERE id = $1`,
        [serviceId]
      );
      // Use the pre-scheduled block duration if it exists, otherwise use service duration or default
        let serviceDuration = bookingDuration;
        let servicePrice = 0;
        let svcName = null;
        
        // Get user's preferred currency for billing
        let userBillingCurrency = resolvedWalletCurrency || DEFAULT_CURRENCY;
        if (userId && !resolvedWalletCurrency) {
          const userCurrencyQuery = await client.query(
            'SELECT preferred_currency FROM users WHERE id = $1',
            [userId]
          );
          if (userCurrencyQuery.rows.length > 0 && userCurrencyQuery.rows[0].preferred_currency) {
            userBillingCurrency = userCurrencyQuery.rows[0].preferred_currency;
          }
        }
        
        if (serviceQuery.rows.length > 0) {
          const row = serviceQuery.rows[0];
          svcName = row.name || null;
          if (!duration) {
            serviceDuration = row.duration || bookingDuration;
          }
          // Look up price in user's preferred currency
          const priceResult = await getServicePriceInCurrency(serviceId, userBillingCurrency);
          if (priceResult && priceResult.price > 0) {
            servicePrice = priceResult.price;
          } else if (row.price !== undefined && row.price !== null) {
            // Fallback to default service price
            servicePrice = parseFloat(row.price) || 0;
          }
        }

      // Handle package vs individual payment choice
  let finalPaymentStatus = 'paid'; // Pay-and-go: default to paid for individual payments
  let finalFinalAmount = parseFloat(finalAmount || amount || 0);
    let individualChargeEntry = null;

  // Server-side price recalculation: always compute the correct amount from service price × duration
  // for individual (non-package) payments, overriding whatever the frontend sent.
  // This prevents stale frontend state from causing incorrect charges.
  const serviceDurationHours = serviceQuery.rows.length > 0 ? (parseFloat(serviceQuery.rows[0].duration) || 0) : 0;
  if (use_package !== true && servicePrice > 0) {
    const dur = bookingDuration || 1;
    const serverCalculatedAmount = serviceDurationHours > 0
      ? parseFloat(((servicePrice / serviceDurationHours) * dur).toFixed(2))
      : servicePrice;
    finalFinalAmount = serverCalculatedAmount;
  }
      
  let chosenPackageId = customerPackageId || null;
  if (use_package === true) {
        // If a specific package was requested, validate it matches and has some hours remaining
        if (customerPackageId) {
          // User explicitly selected this package — trust the choice, only verify
          // ownership, active status, and expiry. Skip lesson_service_name matching.
          const params = [customerPackageId, userId, normalizedDate];
          const sql = `
            SELECT id, package_name, remaining_hours, total_hours, used_hours
            FROM customer_packages
            WHERE id = $1 AND customer_id = $2
              AND status = 'active'
              AND (expiry_date IS NULL OR expiry_date >= $3)
            LIMIT 1
          `;
          const specific = await client.query(sql, params);
          if (specific.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: 'Selected package cannot be used',
              message: svcName
                ? `Selected package doesn\'t match ${svcName} or is expired.`
                : 'Selected package is expired or not active.'
            });
          }
          const pkg = specific.rows[0];
          const rh = pkg.remaining_hours, uh = pkg.used_hours, th = pkg.total_hours;
          const currentUsed = parseFloat(uh) || 0;
          const totalHours = parseFloat(th) || 0;
          const currentRemaining = rh !== null && rh !== undefined ? parseFloat(rh) || 0 : Math.max(0, totalHours - currentUsed);
          const consumeFromPackage = Math.min(serviceDuration, Math.max(0, currentRemaining));
          const cashHours = Math.max(0, serviceDuration - consumeFromPackage);
          const newRemaining = currentRemaining - consumeFromPackage;
          const newUsed = currentUsed + consumeFromPackage;
          await client.query(`
            UPDATE customer_packages
            SET used_hours = $1::numeric,
                remaining_hours = $2::numeric,
                last_used_date = $3,
                updated_at = CURRENT_TIMESTAMP,
                status = CASE
                  WHEN $2::numeric <= 0
                    AND COALESCE(rental_days_remaining, 0) <= 0
                    AND COALESCE(accommodation_nights_remaining, 0) <= 0
                  THEN 'used_up' ELSE 'active' END
            WHERE id = $4 AND status = 'active'
              AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $5::numeric)
              AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)
          `, [newUsed, newRemaining, normalizedDate, customerPackageId, consumeFromPackage]);
          chosenPackageId = customerPackageId;

          if (cashHours > 0) {
            finalPaymentStatus = 'partial';
            // If servicePrice was not found, fall back to provided amount as hourly
            const hourly = servicePrice || (parseFloat(amount) || 0);
            finalFinalAmount = parseFloat((hourly * cashHours).toFixed(2));
          } else {
            finalPaymentStatus = 'package';
            finalFinalAmount = 0;
          }
        } else {
          // Pick earliest active matching package with any remaining hours
          const params = [userId, normalizedDate];
          let sql = `
            SELECT id, package_name, remaining_hours, total_hours, used_hours
            FROM customer_packages
            WHERE customer_id = $1
              AND status IN ('active', 'waiting_payment')
              AND (expiry_date IS NULL OR expiry_date >= $2)
          `;
          if (svcName) {
            // Flexible matching: allow singular/plural mismatch
            sql += ` AND (
              lesson_service_name IS NULL 
              OR LOWER(lesson_service_name) = LOWER($3)
              OR LOWER(RTRIM(lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
            )`;
            params.push(svcName);
          }
          sql += ' ORDER BY purchase_date ASC LIMIT 1';
          const packageCheck = await client.query(sql, params);
          if (packageCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: 'Insufficient or mismatched package',
              message: svcName
                ? `No active ${svcName} package available. Choose a matching package or pay individually.`
                : 'No active package available. Choose a package or pay individually.'
            });
          }
          const pkg = packageCheck.rows[0];
          const rh = pkg.remaining_hours, uh = pkg.used_hours, th = pkg.total_hours;
          const currentUsed = parseFloat(uh) || 0;
          const totalHours = parseFloat(th) || 0;
          const currentRemaining = rh !== null && rh !== undefined ? parseFloat(rh) || 0 : Math.max(0, totalHours - currentUsed);
          const consumeFromPackage = Math.min(serviceDuration, Math.max(0, currentRemaining));
          const cashHours = Math.max(0, serviceDuration - consumeFromPackage);
          const newRemaining = currentRemaining - consumeFromPackage;
          const newUsed = currentUsed + consumeFromPackage;
          await client.query(`
            UPDATE customer_packages
            SET used_hours = $1::numeric,
                remaining_hours = $2::numeric,
                last_used_date = $3,
                updated_at = CURRENT_TIMESTAMP,
                status = CASE
                  WHEN $2::numeric <= 0
                    AND COALESCE(rental_days_remaining, 0) <= 0
                    AND COALESCE(accommodation_nights_remaining, 0) <= 0
                  THEN 'used_up' WHEN status = 'waiting_payment' THEN 'waiting_payment' ELSE 'active' END
            WHERE id = $4 AND status IN ('active', 'waiting_payment')
              AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $5::numeric)
              AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)
          `, [newUsed, newRemaining, normalizedDate, pkg.id, consumeFromPackage]);
          chosenPackageId = pkg.id;

          if (cashHours > 0) {
            finalPaymentStatus = 'partial';
            const hourly = servicePrice || (parseFloat(amount) || 0);
            finalFinalAmount = parseFloat((hourly * cashHours).toFixed(2));
          } else {
            finalPaymentStatus = 'package';
            finalFinalAmount = 0;
          }
        }
      } else if (use_package === false && finalFinalAmount > 0) {
        individualChargeEntry = {
          userId,
          amount: -Math.abs(finalFinalAmount),
          transactionType: 'booking_charge',
          currency: walletTransactionCurrency,
          status: 'completed',
          description: `Individual lesson charge: ${normalizedDate} ${time} (${serviceDuration}h)`,
          metadata: {
            bookingDate: normalizedDate,
            startHour: time,
            durationHours: serviceDuration,
            paymentMethod: requestedPaymentMethod || 'wallet',
            source: 'calendar_booking_charge'
          }
        };
        finalPaymentStatus = 'paid'; // Mark as paid since we charged immediately
      } else {
        finalPaymentStatus = 'paid'; // Pay-and-go: even zero amount is considered paid
      }

      // Create the booking with comprehensive defaults to minimize NULLs
      const bookingColumns = [
        'student_user_id',
        'instructor_user_id',
        'customer_user_id',
        'date',
        'start_hour',
        'duration',
        'service_id',
        'status',
        'notes',
        'payment_status',
        'amount',
        'discount_percent',
        'discount_amount',
        'final_amount',
        'checkin_status',
        'checkout_status',
        'location',
        'weather_conditions',
        'feedback_comments',
        'checkin_notes',
        'checkout_notes',
        'customer_package_id',
        'created_at',
        'updated_at'
      ];
      const bookingValues = [
        userId,
        instructorId,
        userId,
        normalizedDate,
        parseFloat(start_hour),
        parseFloat(serviceDuration),
        serviceId,
        'confirmed',
        user.notes || '',
        finalPaymentStatus,
        parseFloat(finalFinalAmount) || 0.0,
        0.0,
        0.0,
        parseFloat(finalFinalAmount) || 0.0,
        checkinStatus || 'pending',
        checkoutStatus || 'pending',
        'TBD',
        'Good',
        '',
        '',
        '',
        chosenPackageId,
        new Date(),
        new Date()
      ];
      const { columns: bookingInsertColumns, values: bookingInsertValues } = appendCreatedBy(bookingColumns, bookingValues, actorId);
      const bookingPlaceholders = bookingInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
      const booking = await client.query(
        `INSERT INTO bookings (${bookingInsertColumns.join(', ')}) VALUES (${bookingPlaceholders}) RETURNING id`,
        bookingInsertValues
      );
      const bookingId = booking.rows[0].id;

      if (individualChargeEntry) {
        const metadata = {
          ...(individualChargeEntry.metadata || {}),
          bookingId,
          actorId
        };

        try {
          await recordWalletTransaction({
            ...individualChargeEntry,
            metadata,
            relatedEntityType: 'booking',
            relatedEntityId: bookingId,
            createdBy: actorId,
            allowNegative: allowNegativeBalance === true, // Allow negative balance if explicitly enabled
            client
          });
        } catch (walletError) {
          logger.error('Failed to record wallet ledger entry for calendar booking charge', {
            bookingId,
            userId: individualChargeEntry.userId,
            amount: individualChargeEntry.amount,
            error: walletError?.message
          });
          throw walletError;
        }
      }
        // Commit transaction
      await client.query('COMMIT');
      
      // Calculate startTime and endTime for response
      const hours = Math.floor(start_hour);
      const minutes = Math.round((start_hour - hours) * 60);
      const startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      const endHours = Math.floor(start_hour + serviceDuration);
      const endMinutes = Math.round(((start_hour + serviceDuration) - endHours) * 60);
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
      
      // Emit real-time event for booking creation so other clients refresh
      if (req.socketService) {
        try {
          req.socketService.emitToChannel('general', 'booking:created', {
            id: booking.rows[0].id,
            date: normalizedDate,
            startTime,
            endTime,
            time: startTime,
            duration: serviceDuration,
            instructor_user_id: instructorId,
            service_id: serviceId,
            student_user_id: userId,
            status: 'confirmed'
          });
          req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'created' });
        } catch (socketError) {
          logger.warn('Failed to emit socket event', socketError);
        }
      }

      res.status(201).json({
        success: true,
        id: booking.rows[0].id,
        bookingId: booking.rows[0].id,
        message: 'Booking confirmed successfully',
        date: normalizedDate,
        startTime,
        endTime,
        time: startTime,
        duration: serviceDuration,
        instructorId,
        userId,
        serviceId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to create booking', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE a booking
router.put('/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), rateLimitBookingUpdates, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get the current booking data before update to track changes
    const currentBookingResult = await client.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (currentBookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }
    const currentBooking = currentBookingResult.rows[0];
    
    const {
      date, start_hour, duration, student_user_id, instructor_user_id, 
      status, payment_status, amount, notes, location, equipment_ids,
      instructor_commission, instructor_commission_type,
      checkout_status, checkout_time, checkout_notes,
      checkin_status, checkin_time, checkin_notes
    } = req.body;
      // Update booking
    const updateBookingQuery = `
      UPDATE bookings
      SET 
        date = COALESCE($1, date),
        start_hour = COALESCE($2, start_hour),
        duration = COALESCE($3, duration),
        student_user_id = COALESCE($4, student_user_id),
        instructor_user_id = COALESCE($5, instructor_user_id),
        status = COALESCE($6, status),
        payment_status = COALESCE($7, payment_status),
        amount = COALESCE($8, amount),
        notes = COALESCE($9, notes),
        location = COALESCE($10, location),
        checkout_status = COALESCE($11, checkout_status),
        checkout_time = COALESCE($12, checkout_time),
        checkout_notes = COALESCE($13, checkout_notes),
        checkin_status = COALESCE($14, checkin_status),
        checkin_time = COALESCE($15, checkin_time),
        checkin_notes = COALESCE($16, checkin_notes),
        updated_at = NOW()
      WHERE id = $17
      RETURNING *
    `;
    
    const bookingResult = await client.query(updateBookingQuery, [
      date, start_hour, duration, student_user_id, instructor_user_id,
      status, payment_status, amount, notes, location,
      checkout_status, checkout_time, checkout_notes,
      checkin_status, checkin_time, checkin_notes,
      req.params.id
    ]);
    
    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    // Handle custom commission rate if provided
    if (instructor_commission !== undefined && instructor_user_id) {
      // First, delete any existing custom commission for this booking
      await client.query('DELETE FROM booking_custom_commissions WHERE booking_id = $1', [booking.id]);
      
      // If commission is provided and different from default, insert custom commission
      // Only proceed if we have a service_id
      if (instructor_commission !== null && instructor_commission !== '' && booking.service_id) {
        const commissionId = uuidv4();
        
        // Resolve the commission type: use explicitly provided type, or look up from instructor's settings
        let resolvedCommissionType = instructor_commission_type;
        if (!resolvedCommissionType) {
          const typeResult = await client.query(`
            SELECT COALESCE(
              isc.commission_type,
              icr.rate_type,
              idc.commission_type,
              'fixed'
            ) as commission_type
            FROM users u
            LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = u.id AND isc.service_id = $2
            LEFT JOIN instructor_category_rates icr ON icr.instructor_id = u.id 
              AND icr.lesson_category = (SELECT lesson_category_tag FROM services WHERE id = $2)
            LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = u.id
            WHERE u.id = $1
          `, [instructor_user_id, booking.service_id]);
          resolvedCommissionType = typeResult.rows[0]?.commission_type || 'fixed';
        }
        
        await client.query(`
          INSERT INTO booking_custom_commissions 
          (id, booking_id, instructor_id, service_id, commission_type, commission_value, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        `, [commissionId, booking.id, instructor_user_id, booking.service_id, resolvedCommissionType, instructor_commission]);
      }
    }    // Update equipment associations if provided
    if (equipment_ids) {
      // Remove current associations
      await client.query('DELETE FROM booking_equipment WHERE booking_id = $1', [booking.id]);
      
      // Add new associations
      if (equipment_ids.length > 0) {
        for (const equipment_id of equipment_ids) {
          await client.query(
            'INSERT INTO booking_equipment (booking_id, equipment_id) VALUES ($1, $2)',
            [booking.id, equipment_id]
          );
        }
      }
    }
    
    // Handle package hour deduction when booking is completed
    if (status === 'completed') {
      const bookingDuration = parseFloat(booking.duration) || 1;
      // Fetch service name for matching packages
      let svcName = null;
      if (booking.service_id) {
        try {
          const sres = await client.query('SELECT name FROM services WHERE id = $1', [booking.service_id]);
          svcName = sres.rows[0]?.name || null;
        } catch {}
      }

      // 1) PACKAGE DEDUCTION CONSOLIDATION FIX:
      // Package hours should ONLY be deducted during booking creation, NOT on completion
      // This prevents double deduction which was causing package hour inconsistencies
      if (booking.student_user_id) {
        // Only update last_used_date if this was a package booking to track usage
        if (booking.payment_status === 'package' && booking.customer_package_id) {
          try {
            await client.query(
              'UPDATE customer_packages SET last_used_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
              [booking.date, booking.customer_package_id]
            );
          } catch (e) {
            logger.warn('Failed to update package last_used_date', { error: e.message });
          }
        }
      }

      // 2) GROUP BOOKING PACKAGE DEDUCTION CONSOLIDATION FIX:
      // Similar to single bookings, package hours should only be deducted at creation, not completion
      // This prevents double deduction for group booking participants
      try {
        // Only update last_used_date for participants who used packages (for tracking purposes)
        const participantsRes = await client.query(
          'SELECT user_id, customer_package_id, payment_status FROM booking_participants WHERE booking_id = $1',
          [booking.id]
        );
        
        let packageUsers = 0;
        for (const participant of participantsRes.rows) {
          if (participant.payment_status === 'package') {
            packageUsers++;
            
            // Update last_used_date for package tracking (no hour deduction)
            if (participant.customer_package_id) {
              try {
                await client.query(
                  'UPDATE customer_packages SET last_used_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                  [booking.date, participant.customer_package_id]
                );
              } catch (e) {
                logger.warn('Failed to update last_used_date for participant package', { packageId: participant.customer_package_id, error: e.message });
              }
            }
          }
        }
        
        // Update booking payment status if participants used packages
        if (packageUsers > 0) {
          const totalParticipants = participantsRes.rows.length;
          const newStatus = packageUsers === totalParticipants ? 'package' : 'partial';
          await client.query(
            'UPDATE bookings SET payment_status = $1, updated_at = NOW() WHERE id = $2',
            [newStatus, booking.id]
          );
        }
        
      } catch (e) {
        logger.warn('Group booking package last_used_date update failed', { error: e.message });
      }
    }
    
    await client.query('COMMIT');
    
    // Get updated booking data to return in response (including payment_status changes)
    const updatedBookingResult = await pool.query(
      'SELECT * FROM bookings WHERE id = $1',
      [booking.id]
    );
    const updatedBooking = updatedBookingResult.rows[0];

    const previousStatus = (currentBooking.status || '').toLowerCase();
    const nextStatus = (updatedBooking.status || '').toLowerCase();
    const shouldQueueRatingReminder =
      COMPLETED_BOOKING_STATUSES.has(nextStatus) && !COMPLETED_BOOKING_STATUSES.has(previousStatus);

    if (shouldQueueRatingReminder) {
      const studentId = updatedBooking.student_user_id || updatedBooking.customer_user_id;
      if (studentId) {
        const instructorId = updatedBooking.instructor_user_id || null;
        const serviceId = updatedBooking.service_id || null;
        const bookingId = updatedBooking.id;
        const lessonDate = updatedBooking.date ? String(updatedBooking.date).slice(0, 10) : null;

        setImmediate(async () => {
          try {
            const [instructorRes, serviceRes] = await Promise.all([
              instructorId
                ? pool.query('SELECT name, profile_image_url FROM users WHERE id = $1', [instructorId])
                : Promise.resolve({ rows: [] }),
              serviceId
                ? pool.query('SELECT service_type, category, name FROM services WHERE id = $1', [serviceId])
                : Promise.resolve({ rows: [] })
            ]);

            const instructorRow = instructorRes.rows?.[0] || null;
            const instructorName = instructorRow?.name || null;
            const instructorAvatar = instructorRow?.profile_image_url || null;
            const serviceRow = serviceRes.rows?.[0] || null;
            const serviceType = resolveServiceType(serviceRow);
            const serviceName = serviceRow?.name || null;

            const reminderResult = await queueRatingReminder({
              bookingId,
              studentId,
              instructorId,
              instructorName,
              instructorAvatar,
              serviceId,
              serviceName,
              serviceType,
              lessonDate,
              lessonStartHour: updatedBooking.start_hour,
              lessonDurationHours: updatedBooking.duration
            });

            if (!reminderResult.queued && !['already-rated', 'already-queued'].includes(reminderResult.reason)) {
              logger.warn('Rating reminder was not queued after booking completion', {
                bookingId,
                studentId,
                instructorId,
                reason: reminderResult.reason,
                error: reminderResult.error || null
              });
            }
          } catch (reminderError) {
            logger.warn('Failed to queue rating reminder after booking completion', {
              bookingId,
              studentId,
              instructorId,
              error: reminderError.message
            });
          }

          // Fire-and-forget manager commission calculation
          try {
            const { recordBookingCommission } = await import('../services/managerCommissionService.js');
            await recordBookingCommission({
              ...updatedBooking,
              student_name: null, // Will be fetched in service if needed
              instructor_name: null,
              service_name: null
            });
          } catch (commissionError) {
            logger.warn('Failed to record manager commission after booking completion', {
              bookingId,
              error: commissionError.message
            });
          }

          try {
            await bookingNotificationService.sendLessonCompleted({ bookingId });
          } catch (notificationError) {
            logger.warn('Failed to send lesson completion notification after booking update', {
              bookingId,
              error: notificationError?.message || notificationError
            });
          }
        });
      }
    }
    
    // Send check-in notification to student when checkin_status changes to 'checked-in'
    const previousCheckinStatus = (currentBooking.checkin_status || '').toLowerCase();
    const nextCheckinStatus = (updatedBooking.checkin_status || '').toLowerCase();
    if (nextCheckinStatus === 'checked-in' && previousCheckinStatus !== 'checked-in') {
      setImmediate(async () => {
        try {
          await bookingNotificationService.sendLessonCheckedIn({ bookingId: updatedBooking.id });
        } catch (notificationError) {
          logger.warn('Failed to send lesson check-in notification after booking update', {
            bookingId: updatedBooking.id,
            error: notificationError?.message || notificationError
          });
        }
      });
    }

    // Emit real-time event for booking update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:updated', updatedBooking);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
      } catch (socketError) {
        logger.warn('Failed to emit socket event', socketError);
      }
    }

  // Send immediate response to client for fast UI feedback
  res.status(200).json(updatedBooking);

    // **📅 RESCHEDULE DETECTION: Notify student if date, time, or instructor changed**
    setImmediate(async () => {
      try {
        const dateChanged = currentBooking.date && date &&
          String(currentBooking.date).slice(0, 10) !== String(date).slice(0, 10);
        const timeChanged = currentBooking.start_hour !== null && start_hour !== undefined && 
          Number(currentBooking.start_hour) !== Number(start_hour);
        const instructorChanged = instructor_user_id && 
          currentBooking.instructor_user_id !== instructor_user_id;

        if (dateChanged || timeChanged || instructorChanged) {
          const studentId = updatedBooking.student_user_id || updatedBooking.customer_user_id;
          if (studentId) {
            // Fetch names for context
            const [studentRes, serviceRes, oldInstrRes, newInstrRes] = await Promise.all([
              pool.query('SELECT name, email FROM users WHERE id = $1', [studentId]),
              updatedBooking.service_id
                ? pool.query('SELECT name FROM services WHERE id = $1', [updatedBooking.service_id])
                : Promise.resolve({ rows: [] }),
              currentBooking.instructor_user_id
                ? pool.query('SELECT name FROM users WHERE id = $1', [currentBooking.instructor_user_id])
                : Promise.resolve({ rows: [] }),
              instructor_user_id
                ? pool.query('SELECT name FROM users WHERE id = $1', [instructor_user_id])
                : Promise.resolve({ rows: [] })
            ]);

            const student = studentRes.rows[0];
            const serviceName = serviceRes.rows[0]?.name || 'Lesson';
            const oldInstructorName = oldInstrRes.rows[0]?.name || null;
            const newInstructorName = newInstrRes.rows[0]?.name || oldInstructorName;
            const changedBy = req.user?.id || null;

            // Build human-readable change description
            const changeParts = [];
            const oldDate = currentBooking.date ? new Date(currentBooking.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
            const newDate = updatedBooking.date ? new Date(updatedBooking.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
            if (dateChanged) changeParts.push(`date changed from ${oldDate} to ${newDate}`);
            if (timeChanged) {
              const fmtTime = (h) => { const hr = Math.floor(h); const min = Math.round((h - hr) * 60); return `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}`; };
              changeParts.push(`time changed from ${fmtTime(Number(currentBooking.start_hour))} to ${fmtTime(Number(updatedBooking.start_hour))}`);
            }
            if (instructorChanged) changeParts.push(`instructor changed from ${oldInstructorName || 'TBD'} to ${newInstructorName || 'TBD'}`);
            const changeMessage = `Your ${serviceName} has been rescheduled: ${changeParts.join(', ')}.`;

            // 1) Insert into reschedule notifications table
            await pool.query(`
              INSERT INTO booking_reschedule_notifications (
                booking_id, student_user_id, changed_by,
                old_date, new_date, old_start_hour, new_start_hour,
                old_instructor_id, new_instructor_id,
                service_name, old_instructor_name, new_instructor_name,
                message, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
            `, [
              updatedBooking.id,
              studentId,
              changedBy,
              currentBooking.date ? new Date(currentBooking.date).toISOString().slice(0, 10) : null,
              updatedBooking.date ? new Date(updatedBooking.date).toISOString().slice(0, 10) : null,
              currentBooking.start_hour,
              updatedBooking.start_hour,
              currentBooking.instructor_user_id || null,
              updatedBooking.instructor_user_id || null,
              serviceName,
              oldInstructorName,
              newInstructorName,
              changeMessage
            ]);

            // 2) Create in-app notification for the student
            await insertNotification({
              userId: studentId,
              title: `${serviceName} rescheduled`,
              message: changeMessage,
              type: 'booking_rescheduled_by_admin',
              data: {
                bookingId: updatedBooking.id,
                dateChanged,
                timeChanged,
                instructorChanged,
                cta: {
                  label: 'View details',
                  href: `/student/schedule`
                }
              },
              idempotencyKey: `reschedule-by-admin:${updatedBooking.id}:${Date.now()}`
            });

            // 3) Send real-time socket event so the pop-up shows immediately if student is online
            if (req.socketService) {
              try {
                req.socketService.emitToChannel(`user:${studentId}`, 'booking:rescheduled', {
                  bookingId: updatedBooking.id,
                  message: changeMessage,
                  serviceName
                });
              } catch (e) {
                // non-blocking
              }
            }

            // 4) Send email notification to student
            if (student?.email) {
              const emailNewDate = updatedBooking.date ? new Date(updatedBooking.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
              const fmtTime = (h) => { if (h == null) return 'TBD'; const hr = Math.floor(Number(h)); const min = Math.round((Number(h) - hr) * 60); return `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}`; };

              try {
                await sendEmail({
                  to: student.email,
                  subject: `Your ${serviceName} has been rescheduled — UKC World`,
                  userId: studentId,
                  notificationType: 'booking_rescheduled',
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                      <div style="background: #0d1511; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Lesson Rescheduled</h1>
                      </div>
                      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="color: #374151; font-size: 16px;">Hi ${student.name || 'there'},</p>
                        <p style="color: #374151; font-size: 15px;">Your <strong>${serviceName}</strong> has been updated:</p>
                        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
                          ${dateChanged ? `<p style="margin: 4px 0; color: #374151;">📅 <strong>Date:</strong> ${oldDate} → <strong>${newDate}</strong></p>` : ''}
                          ${timeChanged ? `<p style="margin: 4px 0; color: #374151;">🕐 <strong>Time:</strong> ${fmtTime(currentBooking.start_hour)} → <strong>${fmtTime(updatedBooking.start_hour)}</strong></p>` : ''}
                          ${instructorChanged ? `<p style="margin: 4px 0; color: #374151;">👤 <strong>Instructor:</strong> ${oldInstructorName || 'TBD'} → <strong>${newInstructorName || 'TBD'}</strong></p>` : ''}
                        </div>
                        <p style="color: #6b7280; font-size: 14px;">Please log in to confirm you've seen this change. If you have any questions, contact us anytime.</p>
                        <div style="text-align: center; margin-top: 20px;">
                          <a href="${process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 'https://ukcworld.com'}" style="display: inline-block; background: #059669; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">View My Schedule</a>
                        </div>
                      </div>
                      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">UKC World — Your Watersport Academy</p>
                    </div>
                  `,
                  text: `Hi ${student.name || 'there'}, your ${serviceName} has been rescheduled. ${changeParts.join('. ')}. Please log in to confirm.`
                });

                // Mark email as sent
                await pool.query(`
                  UPDATE booking_reschedule_notifications
                  SET email_sent = TRUE, email_sent_at = NOW()
                  WHERE booking_id = $1 AND student_user_id = $2 AND status = 'pending'
                  ORDER BY created_at DESC LIMIT 1
                `, [updatedBooking.id, studentId]);
              } catch (emailErr) {
                logger.warn('Failed to send reschedule email', { bookingId: updatedBooking.id, error: emailErr.message });
              }
            }

            logger.info('Booking reschedule notification sent to student', {
              bookingId: updatedBooking.id,
              studentId,
              dateChanged,
              timeChanged,
              instructorChanged
            });
          }
        }
      } catch (rescheduleErr) {
        logger.warn('Failed to send reschedule notification (non-blocking)', {
          bookingId: updatedBooking?.id,
          error: rescheduleErr.message
        });
      }
    });

    // **🚀 NEW: Comprehensive Data Cascade Update**
    // Track what fields actually changed to trigger appropriate cascades
    const changes = {};
    const financialFields = ['final_amount', 'amount', 'duration'];
    const criticalFields = [...financialFields, 'instructor_user_id', 'service_id', 'student_user_id', 'status'];
    
    // Detect changes in critical fields
    criticalFields.forEach(field => {
      const oldValue = currentBooking[field];
      const newValue = updatedBooking[field];
      if (oldValue !== newValue) {
        changes[field] = newValue;
        changes._previous = changes._previous || {};
        changes._previous[field] = oldValue;
      }
    });
    
    // Special handling for instructor_commission changes
    if (instructor_commission !== undefined) {
      // Get the previous custom commission value to detect actual changes
      const previousCustomCommission = await client.query(
        'SELECT commission_value FROM booking_custom_commissions WHERE booking_id = $1',
        [booking.id]
      );
      
      const oldCommissionValue = previousCustomCommission.rows.length > 0 
        ? parseFloat(previousCustomCommission.rows[0].commission_value) 
        : null;
      const newCommissionValue = instructor_commission !== null && instructor_commission !== '' 
        ? parseFloat(instructor_commission) 
        : null;
      
      // Only flag as changed if the commission value actually changed
      if (oldCommissionValue !== newCommissionValue) {
        changes._custom_commission_changed = true;
        changes.instructor_commission = newCommissionValue;
        changes._previous = changes._previous || {};
        changes._previous.instructor_commission = oldCommissionValue;
      }
    }
    
    // If any critical financial data changed, run cascade updates
    if (Object.keys(changes).length > 0) {
      // Run cascade updates asynchronously (don't block the response)
      setImmediate(async () => {
        try {
          await BookingUpdateCascadeService.cascadeBookingUpdate(updatedBooking, changes);
        } catch (cascadeError) {
          // Log but don't fail the request - data will eventually be consistent
          logger.error('Cascade update failed (will retry)', { error: cascadeError.message });
        }
      });
    }

    // Note: transaction already committed above; do not commit again here

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to update booking', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Atomic swap of two bookings within a single transaction
// POST /bookings/swap
router.post(
  '/swap',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'instructor']),
  rateLimitBookingUpdates,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const {
        a_id,
        b_id,
        a,
        b,
        date: overrideDate,
      } = req.body || {};

      if (!a_id || !b_id || !a || !b) {
        return res.status(400).json({ error: 'a_id, b_id, and targets a,b are required' });
      }

      // Normalize inputs
      const aTarget = {
        instructor_user_id: a.instructor_user_id || a.instructorId,
        start_hour: a.start_hour != null ? parseFloat(a.start_hour) : a.start_hour,
      };
      const bTarget = {
        instructor_user_id: b.instructor_user_id || b.instructorId,
        start_hour: b.start_hour != null ? parseFloat(b.start_hour) : b.start_hour,
      };

      if (!aTarget.instructor_user_id || aTarget.start_hour == null || !bTarget.instructor_user_id || bTarget.start_hour == null) {
        return res.status(400).json({ error: 'Both targets must include instructor_user_id and start_hour' });
      }

      await client.query('BEGIN');

      // Lock both bookings for update
      const { rows: lockRows } = await client.query(
        `SELECT * FROM bookings WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [[a_id, b_id]]
      );
      if (!lockRows || lockRows.length !== 2) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found' });
      }
      const aRow = lockRows.find(r => String(r.id) === String(a_id));
      const bRow = lockRows.find(r => String(r.id) === String(b_id));

      if (!aRow || !bRow || aRow.deleted_at || bRow.deleted_at) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found or deleted' });
      }

      // Ensure same date unless explicitly overridden
      const date = overrideDate || aRow.date;
      if (!overrideDate && String(aRow.date) !== String(bRow.date)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap requires same date unless `date` override is provided' });
      }

      // Validate equal durations to maintain schedule density
      const durA = parseFloat(aRow.duration) || 1;
      const durB = parseFloat(bRow.duration) || 1;
      if (Math.abs(durA - durB) > 0.001) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap not allowed: different durations' });
      }

      // Check for overlaps against other bookings (excluding the two being swapped)
      const overlapSql = `
        SELECT id FROM bookings
        WHERE date = $1::date
          AND instructor_user_id = $2::uuid
          AND status NOT IN ('cancelled', 'pending_payment')
          AND deleted_at IS NULL
          AND id <> ALL($5::uuid[])
          AND (
            (start_hour < ($3::numeric + $4::numeric)) AND ((start_hour + duration) > $3::numeric)
          )
        LIMIT 1
      `;

      const excludeIds = [aRow.id, bRow.id];

      // Check B's new position first (free up A's target slot)
      const conflictB = await client.query(overlapSql.replace('SELECT id', 'SELECT id, start_hour, duration, instructor_user_id'), [
        date,
        bTarget.instructor_user_id,
        parseFloat(bTarget.start_hour),
        durB,
        excludeIds,
      ]);
      if (conflictB.rows.length > 0) {
        await client.query('ROLLBACK');
        const c = conflictB.rows[0];
        return res.status(409).json({
          error: 'Target slot for booking B conflicts with another booking',
          side: 'B',
          conflictWith: c?.id,
          conflictAt: { start_hour: c?.start_hour, duration: c?.duration, instructor_user_id: c?.instructor_user_id },
          target: { instructor_user_id: bTarget.instructor_user_id, start_hour: bTarget.start_hour, duration: durB, date }
        });
      }

      // Check A's new position
      const conflictA = await client.query(overlapSql.replace('SELECT id', 'SELECT id, start_hour, duration, instructor_user_id'), [
        date,
        aTarget.instructor_user_id,
        parseFloat(aTarget.start_hour),
        durA,
        excludeIds,
      ]);
      if (conflictA.rows.length > 0) {
        await client.query('ROLLBACK');
        const c = conflictA.rows[0];
        return res.status(409).json({
          error: 'Target slot for booking A conflicts with another booking',
          side: 'A',
          conflictWith: c?.id,
          conflictAt: { start_hour: c?.start_hour, duration: c?.duration, instructor_user_id: c?.instructor_user_id },
          target: { instructor_user_id: aTarget.instructor_user_id, start_hour: aTarget.start_hour, duration: durA, date }
        });
      }

      // Perform both updates in a single statement to avoid unique constraint conflicts
      const { rows: updatedRows } = await client.query(
        `WITH params AS (
           SELECT 
             $1::uuid AS a_id,
             $2::uuid AS b_id,
             $3::uuid AS a_instr,
             $4::numeric AS a_start,
             $5::uuid AS b_instr,
             $6::numeric AS b_start,
             $7::date  AS new_date
         )
         UPDATE bookings b
         SET 
           instructor_user_id = CASE WHEN b.id = p.a_id THEN p.a_instr ELSE p.b_instr END,
           start_hour = CASE WHEN b.id = p.a_id THEN p.a_start ELSE p.b_start END,
           date = p.new_date,
           updated_at = NOW()
         FROM params p
         WHERE b.id IN (p.a_id, p.b_id)
         RETURNING b.*`,
        [
          aRow.id,
          bRow.id,
          aTarget.instructor_user_id,
          parseFloat(aTarget.start_hour),
          bTarget.instructor_user_id,
          parseFloat(bTarget.start_hour),
          date,
        ]
      );

      await client.query('COMMIT');

      // Map returned rows to A and B by id
      const updatedA = updatedRows.find(r => String(r.id) === String(aRow.id));
      const updatedB = updatedRows.find(r => String(r.id) === String(bRow.id));

      // Emit socket updates (best-effort, outside of tx)
      if (req.socketService) {
        try {
          req.socketService.emitToChannel('general', 'booking:updated', updatedA);
          req.socketService.emitToChannel('general', 'booking:updated', updatedB);
          req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
        } catch (socketError) {
          logger?.warn?.('Failed to emit socket event (swap):', socketError);
        }
      }

      return res.status(200).json({ a: updatedA, b: updatedB });
    } catch (e) {
      await client.query('ROLLBACK');
      logger.error('Swap failed:', e);
      // Map common errors to clearer statuses when possible
      if (e && e.code === '23505') {
        // unique violation (if any constraint)
        return res.status(409).json({ error: 'Conflict during swap' });
      }
      return res.status(500).json({ error: 'Failed to swap bookings' });
    } finally {
      client.release();
    }
  }
);

// Parking-based swap fallback: move A to a temporary free slot, then B->A, A->B
router.post(
  '/swap-with-parking',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'instructor']),
  rateLimitBookingUpdates,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { a_id, b_id, a, b, date: overrideDate } = req.body || {};
      if (!a_id || !b_id || !a || !b) {
        return res.status(400).json({ error: 'a_id, b_id, and targets a,b are required' });
      }
      const aTarget = { instructor_user_id: a.instructor_user_id || a.instructorId, start_hour: parseFloat(a.start_hour) };
      const bTarget = { instructor_user_id: b.instructor_user_id || b.instructorId, start_hour: parseFloat(b.start_hour) };
      if (!aTarget.instructor_user_id || isNaN(aTarget.start_hour) || !bTarget.instructor_user_id || isNaN(bTarget.start_hour)) {
        return res.status(400).json({ error: 'Both targets must include instructor_user_id and start_hour' });
      }

      await client.query('BEGIN');

      // Lock both bookings
      const { rows: lockRows } = await client.query(
        `SELECT * FROM bookings WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [[a_id, b_id]]
      );
      if (!lockRows || lockRows.length !== 2) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found' });
      }
      const aRow = lockRows.find(r => String(r.id) === String(a_id));
      const bRow = lockRows.find(r => String(r.id) === String(b_id));
      if (!aRow || !bRow || aRow.deleted_at || bRow.deleted_at) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found or deleted' });
      }

      const date = overrideDate || aRow.date;
      if (!overrideDate && String(aRow.date) !== String(bRow.date)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap requires same date unless `date` override is provided' });
      }
      const durA = parseFloat(aRow.duration) || 1;
      const durB = parseFloat(bRow.duration) || 1;
      if (Math.abs(durA - durB) > 0.001) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap not allowed: different durations' });
      }

      // Helper: check overlap for an instructor/time
      const overlapCheck = async (instrId, startHour, duration, excludeIds) => {
        const sql = `SELECT id FROM bookings
          WHERE date = $1::date
            AND instructor_user_id = $2::uuid
            AND status NOT IN ('cancelled', 'pending_payment')
            AND deleted_at IS NULL
            AND id <> ALL($5::uuid[])
            AND ((start_hour < ($3::numeric + $4::numeric)) AND ((start_hour + duration) > $3::numeric))
          LIMIT 1`;
        const r = await client.query(sql, [date, instrId, parseFloat(startHour), parseFloat(duration), excludeIds]);
        return r.rows.length > 0;
      };

      const exclude = [aRow.id, bRow.id];
      // Batch: fetch ALL bookings for both instructors on this date in ONE query
      const tryInstructors = [aRow.instructor_user_id, bRow.instructor_user_id];
      const { rows: dayBookings } = await client.query(
        `SELECT instructor_user_id, start_hour::numeric AS sh, duration::numeric AS dur
         FROM bookings
         WHERE date = $1::date
           AND instructor_user_id = ANY($2::uuid[])
           AND status NOT IN ('cancelled', 'pending_payment')
           AND deleted_at IS NULL
           AND id <> ALL($3::uuid[])
        `,
        [date, tryInstructors, exclude]
      );
      // Build occupied-interval sets per instructor
      const busyMap = new Map();
      for (const b of dayBookings) {
        if (!busyMap.has(b.instructor_user_id)) busyMap.set(b.instructor_user_id, []);
        busyMap.get(b.instructor_user_id).push({ sh: parseFloat(b.sh), dur: parseFloat(b.dur) });
      }
      const overlaps = (instrId, startH, dur) => {
        const intervals = busyMap.get(instrId) || [];
        return intervals.some(iv => startH < iv.sh + iv.dur && startH + dur > iv.sh);
      };

      // Find a parking slot in pure JS (no more DB queries per slot)
      let parking = null;
      outer: for (const instr of tryInstructors) {
        for (let h = 6; h <= 21 - durA + 0.0001; h += 0.5) {
          if (!overlaps(instr, h, durA)) { parking = { instructor_user_id: instr, start_hour: h }; break outer; }
        }
      }
      if (!parking) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No temporary parking slot available to complete swap' });
      }
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [parking.instructor_user_id, parking.start_hour, date, aRow.id]
      );

      // Step 2: B -> A's original
      const aOld = { instructor_user_id: aRow.instructor_user_id, start_hour: aRow.start_hour };
      if (await overlapCheck(aOld.instructor_user_id, aOld.start_hour, durB, exclude)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A original slot became occupied' });
      }
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [aOld.instructor_user_id, aOld.start_hour, date, bRow.id]
      );

      // Step 3: A (from parking) -> B's target
      if (await overlapCheck(aTarget.instructor_user_id, aTarget.start_hour, durA, exclude)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'B target slot is occupied' });
      }
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [aTarget.instructor_user_id, aTarget.start_hour, date, aRow.id]
      );

      await client.query('COMMIT');

      // Fetch and return both updated rows
      const { rows: updated } = await client.query(`SELECT * FROM bookings WHERE id = ANY($1::uuid[])`, [[aRow.id, bRow.id]]);
      const updatedA = updated.find(r => String(r.id) === String(aRow.id));
      const updatedB = updated.find(r => String(r.id) === String(bRow.id));

      if (req.socketService) {
        try {
          req.socketService.emitToChannel('general', 'booking:updated', updatedA);
          req.socketService.emitToChannel('general', 'booking:updated', updatedB);
          req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
        } catch (socketError) {
          logger?.warn?.('Failed to emit socket event (swap-with-parking):', socketError);
        }
      }

      return res.status(200).json({ a: updatedA, b: updatedB, parking_used: parking });
    } catch (e) {
      await client.query('ROLLBACK');
      try { logger?.error?.('Swap with parking failed:', e); } catch (_) {}
      return res.status(500).json({ error: 'Failed to swap with parking' });
    } finally {
      client.release();
    }
  }
);

// Unified swap: try direct atomic swap; on conflict, fallback to parking-based swap
router.post(
  '/swap-auto',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'instructor']),
  rateLimitBookingUpdates,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { a_id, b_id, a, b, date: overrideDate } = req.body || {};
      if (!a_id || !b_id || !a || !b) {
        return res.status(400).json({ error: 'a_id, b_id, and targets a,b are required' });
      }
      const aTarget = { instructor_user_id: a.instructor_user_id || a.instructorId, start_hour: parseFloat(a.start_hour) };
      const bTarget = { instructor_user_id: b.instructor_user_id || b.instructorId, start_hour: parseFloat(b.start_hour) };
      if (!aTarget.instructor_user_id || isNaN(aTarget.start_hour) || !bTarget.instructor_user_id || isNaN(bTarget.start_hour)) {
        return res.status(400).json({ error: 'Both targets must include instructor_user_id and start_hour' });
      }

      await client.query('BEGIN');

      // Lock both bookings
      const { rows: lockRows } = await client.query(
        `SELECT * FROM bookings WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [[a_id, b_id]]
      );
      if (!lockRows || lockRows.length !== 2) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found' });
      }
      const aRow = lockRows.find(r => String(r.id) === String(a_id));
      const bRow = lockRows.find(r => String(r.id) === String(b_id));
      if (!aRow || !bRow || aRow.deleted_at || bRow.deleted_at) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found or deleted' });
      }

      const date = overrideDate || aRow.date;
      if (!overrideDate && String(aRow.date) !== String(bRow.date)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap requires same date unless `date` override is provided' });
      }
      const durA = parseFloat(aRow.duration) || 1;
      const durB = parseFloat(bRow.duration) || 1;
      if (Math.abs(durA - durB) > 0.001) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap not allowed: different durations' });
      }

      const overlapCheck = async (instrId, startHour, duration, excludeIds) => {
        const sql = `SELECT id FROM bookings
          WHERE date = $1::date
            AND instructor_user_id = $2::uuid
            AND status NOT IN ('cancelled', 'pending_payment')
            AND deleted_at IS NULL
            AND id <> ALL($5::uuid[])
            AND ((start_hour < ($3::numeric + $4::numeric)) AND ((start_hour + duration) > $3::numeric))
          LIMIT 1`;
        const r = await client.query(sql, [date, instrId, parseFloat(startHour), parseFloat(duration), excludeIds]);
        return r.rows.length > 0;
      };

      const exclude = [aRow.id, bRow.id];
      // Batch: fetch ALL bookings for both instructors on this date in ONE query
      const tryInstructors = [aRow.instructor_user_id, bRow.instructor_user_id];
      const { rows: dayBookings } = await client.query(
        `SELECT instructor_user_id, start_hour::numeric AS sh, duration::numeric AS dur
         FROM bookings
         WHERE date = $1::date
           AND instructor_user_id = ANY($2::uuid[])
           AND status NOT IN ('cancelled', 'pending_payment')
           AND deleted_at IS NULL
           AND id <> ALL($3::uuid[])
        `,
        [date, tryInstructors, exclude]
      );
      const busyMap = new Map();
      for (const b of dayBookings) {
        if (!busyMap.has(b.instructor_user_id)) busyMap.set(b.instructor_user_id, []);
        busyMap.get(b.instructor_user_id).push({ sh: parseFloat(b.sh), dur: parseFloat(b.dur) });
      }
      const overlaps = (instrId, startH, dur) => {
        const intervals = busyMap.get(instrId) || [];
        return intervals.some(iv => startH < iv.sh + iv.dur && startH + dur > iv.sh);
      };

      // Find parking slot in pure JS (no more per-slot DB queries)
      let parking = null;
      outer: for (const instr of tryInstructors) {
        for (let h = 6; h <= 21 - durA + 0.0001; h += 0.5) {
          if (!overlaps(instr, h, durA)) { parking = { instructor_user_id: instr, start_hour: h }; break outer; }
        }
      }
      if (!parking) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No temporary parking slot available to complete swap' });
      }

      // Step 1: A -> parking
      try {
        await client.query(
          `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
          [parking.instructor_user_id, parking.start_hour, date, aRow.id]
        );
      } catch (e) {
        if (e?.code === '23505') {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Parking slot became unavailable' });
        }
        throw e;
      }

      // Step 2: B -> A original
      const aOld = { instructor_user_id: aRow.instructor_user_id, start_hour: aRow.start_hour };
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [aOld.instructor_user_id, aOld.start_hour, date, bRow.id]
      );

      // Step 3: A -> target
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [aTarget.instructor_user_id, aTarget.start_hour, date, aRow.id]
      );

  await client.query('COMMIT');
      const { rows: updated2 } = await client.query(`SELECT * FROM bookings WHERE id = ANY($1::uuid[])`, [[aRow.id, bRow.id]]);
      const updatedA2 = updated2.find(r => String(r.id) === String(aRow.id));
      const updatedB2 = updated2.find(r => String(r.id) === String(bRow.id));
      if (req.socketService) {
        try {
          req.socketService.emitToChannel('general', 'booking:updated', updatedA2);
          req.socketService.emitToChannel('general', 'booking:updated', updatedB2);
          req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
        } catch (socketError) {
          logger?.warn?.('Failed to emit socket event (swap-auto parking):', socketError);
        }
      }
      return res.status(200).json({ a: updatedA2, b: updatedB2, mode: 'parking' });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      try { logger?.error?.('swap-auto failed:', e); } catch (_) {}
      if (e?.code === '23505') {
        return res.status(409).json({ error: 'Conflict detected during swap' });
      }
      return res.status(500).json({ error: 'Failed to swap (auto)' });
    } finally {
      client.release();
    }
  }
);

// Import the SoftDeleteService
import SoftDeleteService from '../services/softDeleteService.js';
import { undoManager } from '../services/undoManager.js';

/**
 * @route DELETE /api/bookings/:id
 * @desc Delete a booking with package hour restoration and balance refunds
 * @access Private (Admin/Manager)
 */
// Internal helper to delete a single booking inside a provided client/tx and capture reconciliation
async function deleteOneBookingWithinTx(client, bookingId, deletingUserId, reason) {
  // Returns { result, packagesUpdated, totalHoursRestored, balanceRefunded, refundType, bookingSnapshot }
  // Based on the main delete route body below; adapted to run within existing tx
  // Get complete booking details before deletion
  const bookingResult = await client.query(
    `SELECT b.*, s.name as service_name, s.price as service_price
     FROM bookings b
     LEFT JOIN services s ON b.service_id = s.id
     WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [bookingId]
  );
  if (bookingResult.rows.length === 0) {
    return { error: 'not_found' };
  }
  const booking = bookingResult.rows[0];
  const studentId = booking.student_user_id;
  const duration = parseFloat(booking.duration) || 0;
  const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;

  const packagesUpdated = [];
  let totalHoursRestored = 0;

  if (duration > 0) {
    const { rows: participantRows } = await client.query(
      `SELECT user_id, customer_package_id, payment_status, package_hours_used FROM booking_participants WHERE booking_id = $1`,
      [bookingId]
    );
    // Restore precisely per participant
    for (const row of participantRows) {
      if (row && row.customer_package_id && row.payment_status === 'package') {
        const restoreHours = parseFloat(row.package_hours_used) || parseFloat(duration);
        const restored = await restoreHoursToPackage(client, row.customer_package_id, restoreHours);
        if (restored) {
          packagesUpdated.push(restored);
          totalHoursRestored += restored.hoursRestored;
        }
      }
    }
    // Fallback to main booking package if no participant records exist (also handles bookings where payment_status was incorrectly saved)
    if (packagesUpdated.length === 0 && booking.customer_package_id) {
      const restored = await restoreHoursToPackage(client, booking.customer_package_id, parseFloat(duration));
      if (restored) {
        packagesUpdated.push(restored);
        totalHoursRestored += restored.hoursRestored;
      }
    }
  }

  let balanceRefunded = 0;
  let refundType = 'none';
  if (bookingAmount > 0 && studentId) {
    if (totalHoursRestored > 0) {
      refundType = 'package_hours_restored';
    } else if (booking.payment_status === 'package' || booking.customer_package_id) {
      refundType = 'package_booking_no_refund';
    } else {
      balanceRefunded = bookingAmount;
      refundType = 'balance_refund';
    }
  }

  if (balanceRefunded > 0) {
    try {
      await recordWalletTransaction({
        userId: studentId,
        amount: balanceRefunded,
        transactionType: 'booking_deleted_refund',
        description: `Booking deleted refund: ${booking.date}`,
        metadata: {
          origin: 'delete_booking_helper',
          bookingId,
          reason,
          packagesUpdated: packagesUpdated.map((pkg) => ({
            packageId: pkg.packageId,
            hours: pkg.hoursRestored
          }))
        },
        relatedEntityType: 'booking',
        relatedEntityId: bookingId,
        createdBy: deletingUserId,
        allowNegative: true, // Allow refund even if wallet has negative balance
        client
      });
    } catch (walletError) {
      logger?.error?.('Failed to record wallet refund for booking helper delete', {
        bookingId,
        studentId,
        amount: balanceRefunded,
        error: walletError?.message
      });
      throw walletError;
    }
  }

  if (balanceRefunded > 0 || totalHoursRestored > 0) {
    logger.info('Ledger transaction recorded for helper booking deletion; legacy transactions table insert skipped.');
  }

  if (studentId) {
    await client.query(
      `INSERT INTO financial_events (user_id, event_type, entity_type, entity_id, amount, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        studentId,
        'booking_deleted',
        'booking',
        bookingId,
        bookingAmount,
        JSON.stringify({
          deleted_booking: booking,
          packages_updated: packagesUpdated,
          balance_refunded: balanceRefunded,
          total_hours_restored: totalHoursRestored,
          refund_type: refundType,
          deleted_by: deletingUserId,
          deletion_reason: reason
        })
      ]
    );
  }

  await client.query(
    `UPDATE bookings SET deleted_at = NOW(), deleted_by = $1, deletion_reason = $2, updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL`,
    [deletingUserId, reason, bookingId]
  );

  return {
    result: { success: true, id: bookingId },
    packagesUpdated,
    totalHoursRestored,
    balanceRefunded,
    refundType,
    bookingSnapshot: booking,
  };
}

// eslint-disable-next-line complexity
router.delete('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
    const bookingId = req.params.id;
    const deletingUserId = req.user.id;
    const reason = (req.body && req.body.reason) || 'Administrative deletion';
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get complete booking details before deletion
        const bookingResult = await client.query(`
            SELECT b.*, s.name as service_name, s.price as service_price
            FROM bookings b
            LEFT JOIN services s ON b.service_id = s.id
            WHERE b.id = $1 AND b.deleted_at IS NULL
        `, [bookingId]);
        
        if (bookingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                error: true, 
                message: 'Booking not found or already deleted' 
            });
        }
        
        const booking = bookingResult.rows[0];
        const studentId = booking.student_user_id;
        const duration = parseFloat(booking.duration) || 0;
        const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
        
        // 1. RESTORE PACKAGE HOURS (participant-aware)
        const packagesUpdated = [];
        let totalHoursRestored = 0;

        if (duration > 0) {
            // Collect participant package usages for this booking
            const { rows: participantRows } = await client.query(
              `SELECT user_id, customer_package_id, payment_status
               FROM booking_participants
               WHERE booking_id = $1`,
              [bookingId]
            );

            // Build list of package IDs to restore based on participants who used packages
            const participantPackageIds = participantRows
              .filter(r => r && r.payment_status === 'package' && r.customer_package_id)
              .map(r => r.customer_package_id);

            // If no participant records indicate package usage, fall back to main booking's package
            const packageIdsToRestore = new Set(participantPackageIds);
            if (packageIdsToRestore.size === 0 && booking.payment_status === 'package' && booking.customer_package_id) {
              packageIdsToRestore.add(booking.customer_package_id);
            }

            if (packageIdsToRestore.size > 0) {
              for (const pkgId of packageIdsToRestore) {
                const restored = await restoreHoursToPackage(client, pkgId, parseFloat(duration));
                if (restored) {
                  packagesUpdated.push(restored);
                  totalHoursRestored += restored.hoursRestored;
                }
              }
            } else {
              logger.info('No participant package usages found to restore');
            }
        }
        
        // 2. PROCESS BALANCE REFUND based on payment method
        let balanceRefunded = 0;
        let refundType = 'none';
        
    if (bookingAmount > 0 && studentId) {
      logger.info('Processing balance refund for booking deletion');
      logger.debug?.(`Booking details: amount=${bookingAmount}, payment_status=${booking.payment_status}, customer_package_id=${booking.customer_package_id}`);
            
            // CRITICAL FIX: Only refund balance if this was actually a CASH/INDIVIDUAL payment
            // Check both package hour restoration AND original payment method
            if (totalHoursRestored > 0) {
                // Package hours were restored - no additional balance refund needed
                refundType = 'package_hours_restored';
                logger.info(`Package booking - ${totalHoursRestored}h restored, no balance refund needed`);
            } else if (booking.payment_status === 'package' || booking.customer_package_id) {
                // This was a package booking, but no hours were restored (possibly package deleted or error)
                // DO NOT refund balance - the customer never paid cash for this booking
                refundType = 'package_booking_no_refund';
                logger.warn('PACKAGE BOOKING with failed hour restoration - NO balance refund (customer never paid cash)');
                logger.info(`Preventing incorrect refund for package booking amount=${bookingAmount}`);
            } else {
                // This was genuinely an individual cash payment - refund to balance
                balanceRefunded = bookingAmount;
                refundType = 'balance_refund';
                
                const walletMetadata = {
                  bookingId,
                  deletionReason: reason,
                  refundType,
                  packagesUpdated: packagesUpdated.map((pkg) => ({
                    packageId: pkg.packageId,
                    hours: pkg.hoursRestored
                  }))
                };

                try {
                  let transactionDescription = `Booking deleted: ${booking.date}`;
                  if (totalHoursRestored > 0) {
                    transactionDescription += ` (${totalHoursRestored}h restored to packages)`;
                  }
                  if (balanceRefunded > 0) {
                    transactionDescription += ` (€${balanceRefunded} refunded)`;
                  }
                  transactionDescription += ` - ${reason}`;

                  await recordWalletTransaction({
                    userId: studentId,
                    amount: balanceRefunded,
                    transactionType: 'booking_deleted_refund',
                    status: 'completed',
                    description: transactionDescription,
                    metadata: walletMetadata,
                    relatedEntityType: 'booking',
                    relatedEntityId: bookingId,
                    createdBy: deletingUserId,
                    allowNegative: true, // Allow refund even if wallet has negative balance
                    client
                  });
                } catch (walletError) {
                  logger.error('Failed to record wallet refund for booking deletion', {
                    bookingId,
                    studentId,
                    amount: balanceRefunded,
                    error: walletError?.message
                  });
                  throw walletError;
                }
            }
        }
        
        // 3. CREATE FINANCIAL TRANSACTION RECORD
    if (balanceRefunded > 0 || totalHoursRestored > 0) {
      logger.info('Ledger transaction recorded for booking deletion; legacy transactions table insert skipped.');
    }
        
        // 4. CREATE FINANCIAL EVENT FOR AUDIT TRAIL
        if (studentId) {
            await client.query(`
                INSERT INTO financial_events (
                    user_id,
                    event_type,
                    entity_type,
                    entity_id,
                    amount,
                    metadata,
                    created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [
                studentId,
                'booking_deleted',
                'booking',
                bookingId,
                bookingAmount,
                JSON.stringify({
                    deleted_booking: booking,
                    packages_updated: packagesUpdated,
                    balance_refunded: balanceRefunded,
                    total_hours_restored: totalHoursRestored,
                    refund_type: refundType,
                    deleted_by: deletingUserId,
                    deletion_reason: reason
                })
            ]);
            
            logger.info('Created financial event for audit trail');
        }
        
    // 5. SOFT DELETE THE BOOKING
    const _deleteResult = await client.query(`
      UPDATE bookings 
      SET deleted_at = NOW(), 
        deleted_by = $1, 
        deletion_reason = $2,
        updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `, [deletingUserId, reason, bookingId]);
        
  logger.info('Booking marked as deleted');
        
        await client.query('COMMIT');
  logger.info('Delete booking transaction committed');
        
        // Emit real-time events
        if (req.socketService) {
            try {
                req.socketService.emitToChannel('general', 'booking:deleted', { 
                    id: bookingId,
                    packagesUpdated: packagesUpdated.length,
                    balanceRefunded
                });
                req.socketService.emitToChannel('general', 'dashboard:refresh', { 
                    type: 'booking', 
                    action: 'deleted',
                    userId: studentId
                });
        logger.info('Socket events emitted');
      } catch (socketError) {
        logger.warn('Failed to emit socket event:', socketError);
            }
        }
        
        // Prepare success response
        const response = {
            success: true,
            message: 'Booking deleted successfully',
            id: bookingId,
            deletedAt: new Date().toISOString(),
            packagesUpdated,
            totalHoursRestored,
            balanceRefunded,
            refundType
        };
        
        // Add specific success messages
        if (totalHoursRestored > 0 && balanceRefunded > 0) {
            response.message += `. ${totalHoursRestored} hours restored to packages and €${balanceRefunded} refunded to balance.`;
        } else if (totalHoursRestored > 0) {
            response.message += `. ${totalHoursRestored} hours restored to packages.`;
        } else if (balanceRefunded > 0) {
            response.message += `. €${balanceRefunded} refunded to balance.`;
        }
        
  logger.info('Sending delete success response');
        res.json(response);
        
    } catch (error) {
        await client.query('ROLLBACK');
  logger.error('Error deleting booking:', error);
  logger.error('Error stack:', error.stack);
        
        if (error.message === 'Booking not found or already deleted') {
            return res.status(404).json({
                error: true,
                message: 'Booking not found or already deleted'
            });
        }
        
        res.status(500).json({
            error: true,
            message: 'Failed to delete booking'
        });
    } finally {
        client.release();
    }
});

/**
 * @route POST /api/bookings/bulk-delete
 * @desc Bulk delete bookings with auto reconciliation and 10s undo token
 * @access Private (Admin/Manager)
 */
router.post('/bulk-delete', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { ids = [], reason = 'Bulk deletion' } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: true, message: 'ids[] is required' });
  }
  const deletingUserId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const perItem = [];
    for (const id of ids) {
      const r = await deleteOneBookingWithinTx(client, id, deletingUserId, reason);
      perItem.push({ id, ...r });
    }
    await client.query('COMMIT');

    // Create an undo token with the list and minimal reconciliation data
    const { token, expiresAt } = undoManager.createToken({
      type: 'bookings.bulk-delete',
      items: perItem.map(x => ({
        id: x.id,
        booking: x.bookingSnapshot,
        refundType: x.refundType,
        balanceRefunded: x.balanceRefunded,
        totalHoursRestored: x.totalHoursRestored,
        packagesUpdated: x.packagesUpdated,
      })),
      reason,
      deletedBy: deletingUserId,
    });

    res.json({
      success: true,
      deleted: perItem.filter(x => !x.error).map(x => x.id),
      failed: perItem.filter(x => x.error).map(x => ({ id: x.id, error: x.error })),
      undoToken: token,
      undoExpiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (e) {
    await client.query('ROLLBACK');
  logger.error('Bulk delete failed:', e);
    res.status(500).json({ error: true, message: 'Bulk delete failed' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/bookings/undo-delete
 * @desc Undo a recent bulk delete using token (10s window)
 * @access Private (Admin/Manager)
 */
router.post('/undo-delete', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: true, message: 'token is required' });
  const data = undoManager.redeem(token);
  if (!data || data.type !== 'bookings.bulk-delete') {
    return res.status(410).json({ error: true, message: 'Undo window expired or token invalid' });
  }
  const actorId = resolveActorId(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const restoredIds = [];
    for (const item of data.items) {
      // Only restore if booking still exists and is soft-deleted
      const { rows } = await client.query(`SELECT id, deleted_at FROM bookings WHERE id = $1`, [item.id]);
      if (rows.length && rows[0].deleted_at) {
        await client.query(`
          UPDATE bookings
          SET deleted_at = NULL,
              deleted_by = NULL,
              deletion_reason = NULL,
              status = 'confirmed',
              updated_at = NOW()
          WHERE id = $1
        `, [item.id]);

        // Reverse balance refund if any
        if (item.balanceRefunded && item.booking?.student_user_id) {
          try {
            await recordLegacyTransaction({
              userId: item.booking.student_user_id,
              amount: -Math.abs(item.balanceRefunded),
              transactionType: 'booking_delete_undo_adjustment',
              status: 'completed',
              direction: 'debit',
              description: 'Undo bulk deletion - reverse refund',
              metadata: {
                bookingId: item.id,
                action: 'undo_delete_reversal'
              },
              entityType: 'booking',
              relatedEntityType: 'booking',
              relatedEntityId: item.id,
              bookingId: item.id,
              createdBy: actorId,
              allowNegative: true,
              client
            });
          } catch (walletError) {
            logger.error('Failed to reverse wallet refund during undo-delete', {
              bookingId: item.id,
              studentId: item.booking.student_user_id,
              amount: item.balanceRefunded,
              error: walletError?.message
            });
            throw walletError;
          }
        }

        // Re-deduct any restored package hours (best-effort)
        if (item.totalHoursRestored > 0 && item.booking?.customer_package_id) {
          const pkgId = item.booking.customer_package_id;
          // Deduct hours back
          await client.query(
            `UPDATE customer_packages
             SET used_hours = GREATEST(0, COALESCE(used_hours,0) + $1),
                 remaining_hours = GREATEST(0, COALESCE(remaining_hours,0) - $1),
                 updated_at = NOW()
             WHERE id = $2`,
            [item.booking.duration || item.totalHoursRestored, pkgId]
          );
        }

        restoredIds.push(item.id);
      }
    }
    await client.query('COMMIT');
    return res.json({ success: true, restored: restoredIds });
  } catch (e) {
    await client.query('ROLLBACK');
  logger.error('Undo failed:', e);
    res.status(500).json({ error: true, message: 'Undo failed' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/bookings/restore-latest
 * @desc Restore the most recently soft-deleted booking and reverse reconciliation
 * @access Private (Admin/Manager)
 */
router.post('/restore-latest', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    const { rows } = await client.query(
      `SELECT * FROM bookings WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1`
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, message: 'No soft-deleted bookings found' });
    }
    const booking = rows[0];

    // Restore booking flags
    await client.query(
      `UPDATE bookings
       SET deleted_at = NULL,
           deleted_by = NULL,
           deletion_reason = NULL,
           status = COALESCE(NULLIF(status, 'deleted'), 'confirmed'),
           updated_at = NOW()
       WHERE id = $1`,
      [booking.id]
    );

    // Reverse user balance refund if non-package
    const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
    if (bookingAmount > 0 && booking.student_user_id && !(booking.payment_status === 'package' || booking.customer_package_id)) {
      try {
        await recordLegacyTransaction({
          userId: booking.student_user_id,
          amount: -Math.abs(bookingAmount),
          transactionType: 'booking_restore_adjustment',
          status: 'completed',
          direction: 'debit',
          description: 'Restore latest soft-delete - reverse refund',
          metadata: {
            bookingId: booking.id,
            action: 'restore_latest_reversal'
          },
          entityType: 'booking',
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          bookingId: booking.id,
          createdBy: actorId,
          allowNegative: true,
          client
        });
      } catch (walletError) {
        logger.error('Failed to reverse wallet refund during restore-latest', {
          bookingId: booking.id,
          studentId: booking.student_user_id,
          amount: bookingAmount,
          error: walletError?.message
        });
        throw walletError;
      }
    }

    // Re-deduct package hours if it was a package booking
    const duration = parseFloat(booking.duration) || 0;
    if (duration > 0) {
      // Participant-aware
      const { rows: bpRows } = await client.query(
        `SELECT customer_package_id, payment_status FROM booking_participants WHERE booking_id = $1`,
        [booking.id]
      );
      const pkgIds = bpRows
        .filter(r => r && r.payment_status === 'package' && r.customer_package_id)
        .map(r => r.customer_package_id);
      const setIds = new Set(pkgIds);
      if (setIds.size === 0 && booking.payment_status === 'package' && booking.customer_package_id) {
        setIds.add(booking.customer_package_id);
      }
      for (const pkgId of setIds) {
        await client.query(
          `UPDATE customer_packages
           SET used_hours = COALESCE(used_hours,0) + $1,
               remaining_hours = GREATEST(0, COALESCE(remaining_hours,0) - $1),
               updated_at = NOW()
           WHERE id = $2`,
          [duration, pkgId]
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true, restoredId: booking.id });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('restore-latest failed:', e);
    return res.status(500).json({ error: true, message: 'Failed to restore latest booking' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/bookings/:id/restore
 * @desc Restore a specific soft-deleted booking and reverse reconciliation
 * @access Private (Admin/Manager)
 */
router.post('/:id/restore', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    const { rows } = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, message: 'Booking not found or not deleted' });
    }
    const booking = rows[0];

    await client.query(
      `UPDATE bookings
       SET deleted_at = NULL,
           deleted_by = NULL,
           deletion_reason = NULL,
           status = COALESCE(NULLIF(status, 'deleted'), 'confirmed'),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
    if (bookingAmount > 0 && booking.student_user_id && !(booking.payment_status === 'package' || booking.customer_package_id)) {
      try {
        await recordLegacyTransaction({
          userId: booking.student_user_id,
          amount: -Math.abs(bookingAmount),
          transactionType: 'booking_restore_adjustment',
          status: 'completed',
          direction: 'debit',
          description: 'Restore soft-delete - reverse refund',
          metadata: {
            bookingId: booking.id,
            action: 'restore_specific_reversal'
          },
          entityType: 'booking',
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          bookingId: booking.id,
          createdBy: actorId,
          allowNegative: true,
          client
        });
      } catch (walletError) {
        logger.error('Failed to reverse wallet refund during restore booking', {
          bookingId: booking.id,
          studentId: booking.student_user_id,
          amount: bookingAmount,
          error: walletError?.message
        });
        throw walletError;
      }
    }

    const duration = parseFloat(booking.duration) || 0;
    if (duration > 0) {
      const { rows: bpRows } = await client.query(
        `SELECT customer_package_id, payment_status FROM booking_participants WHERE booking_id = $1`,
        [id]
      );
      const pkgIds = bpRows
        .filter(r => r && r.payment_status === 'package' && r.customer_package_id)
        .map(r => r.customer_package_id);
      const setIds = new Set(pkgIds);
      if (setIds.size === 0 && booking.payment_status === 'package' && booking.customer_package_id) {
        setIds.add(booking.customer_package_id);
      }
      for (const pkgId of setIds) {
        await client.query(
          `UPDATE customer_packages
           SET used_hours = COALESCE(used_hours,0) + $1,
               remaining_hours = GREATEST(0, COALESCE(remaining_hours,0) - $1),
               updated_at = NOW()
           WHERE id = $2`,
          [duration, pkgId]
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true, restoredId: id });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('restore by id failed:', e);
    return res.status(500).json({ error: true, message: 'Failed to restore booking' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/bookings/:id/restore
 * @desc Restore a soft deleted booking
 * @access Private (Admin only)
 * TEMPORARILY DISABLED - SoftDeleteService import issue
 */
/*
router.post('/:id/restore', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
    const bookingId = req.params.id;
    const restoringUserId = req.user.id;
    
    try {
        const result = await SoftDeleteService.restoreBooking(bookingId, restoringUserId);
        
        if (result.success) {
            // Emit real-time event for booking restoration
            if (req.socketService) {
                try {
                    req.socketService.emitToChannel('general', 'booking:restored', { id: bookingId });
                    req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'restored' });
                } catch (socketError) {
                    logger.warn('Failed to emit socket event', socketError);
                }
            }
            
            res.json({
                success: true,
                message: 'Booking restored successfully',
                data: result.data
            });
        } else {
            res.status(404).json({
                error: true,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Failed to restore booking', error);
        res.status(500).json({
            error: true,
            message: 'Failed to restore booking'
        });
    }
});
*/

/**
 * @route GET /api/bookings/deleted/list
 * @desc Get list of deleted bookings
 * @access Private (Admin only)
 */
router.get('/deleted/list', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
    try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';

    // Build filters
    const whereClauses = ['b.deleted_at IS NOT NULL'];
    const params = [];
    let idx = 1;

    if (q) {
      whereClauses.push(`((u.first_name || ' ' || u.last_name) ILIKE $${idx} OR (i.first_name || ' ' || i.last_name) ILIKE $${idx} OR s.name ILIKE $${idx} OR COALESCE(b.deletion_reason,'') ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx += 1;
    }
    if (dateFrom) {
      whereClauses.push(`b.date >= $${idx}`);
      params.push(dateFrom);
      idx += 1;
    }
    if (dateTo) {
      whereClauses.push(`b.date <= $${idx}`);
      params.push(dateTo);
      idx += 1;
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const listSql = `
      SELECT 
        b.*,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name,
        i.first_name AS instructor_first_name,
        i.last_name AS instructor_last_name,
        s.name AS service_name,
        deleted_user.first_name AS deleted_by_first_name,
        deleted_user.last_name AS deleted_by_last_name
      FROM bookings b
      LEFT JOIN users u ON b.student_user_id = u.id
      LEFT JOIN users i ON b.instructor_user_id = i.id
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN users deleted_user ON b.deleted_by = deleted_user.id
      ${whereSql}
      ORDER BY b.deleted_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const listParams = [...params, limit, offset];
    const { rows: deletedBookings } = await pool.query(listSql, listParams);

    const countSql = `
      SELECT COUNT(*) as total
      FROM bookings b
      LEFT JOIN users u ON b.student_user_id = u.id
      LEFT JOIN users i ON b.instructor_user_id = i.id
      LEFT JOIN services s ON b.service_id = s.id
      ${whereSql}
    `;
    const { rows: totalRows } = await pool.query(countSql, params);
        
        res.json({
            data: deletedBookings,
            pagination: {
                page,
                limit,
                total: parseInt(totalRows[0].total),
                totalPages: Math.ceil(totalRows[0].total / limit)
            }
        });
    } catch (error) {
  logger.error('Error fetching deleted bookings:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to fetch deleted bookings'
        });
    }
});

/**
 * @route POST /api/bookings/:id/cancel
 * @desc Cancel a booking (soft delete - keeps record but marks as cancelled)
 * @access Private
 */
// eslint-disable-next-line complexity
router.post('/:id/cancel', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { cancellation_reason = 'Admin cancellation' } = req.body;
  const _userId = req.user.id;
    const actorId = resolveActorId(req);
    
    await client.query('BEGIN');
    
  logger.info(`Cancelling booking ${id}...`);
    
    // Get booking details first
    const bookingResult = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    
    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
  const _studentId = booking.student_user_id;
    const duration = parseFloat(booking.duration) || 0;
    
    // Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Booking is already cancelled' });
    }
    
    // Restore package hours (participant-aware)
    const packagesUpdated = [];
    if (duration > 0) {
      // Look at participant package usages for this booking
      const { rows: bpRows } = await client.query(
        `SELECT customer_package_id, payment_status, package_hours_used
         FROM booking_participants WHERE booking_id = $1`,
        [id]
      );
      let restoredAny = false;
      for (const r of bpRows) {
        if (r && r.payment_status === 'package' && r.customer_package_id) {
          const restoreHours = parseFloat(r.package_hours_used) || parseFloat(duration);
          const { rows: pkgRows } = await client.query(
            `SELECT id, package_name, total_hours, used_hours, remaining_hours, status
             FROM customer_packages WHERE id = $1`,
            [r.customer_package_id]
          );
          if (pkgRows.length === 0) continue;
          const pkg = pkgRows[0];
          const newUsed = Math.max(0, (parseFloat(pkg.used_hours) || 0) - restoreHours);
          const newRemaining = Math.min(parseFloat(pkg.total_hours) || 0, (parseFloat(pkg.remaining_hours) || 0) + restoreHours);
          const newStatus = newRemaining > 0 ? 'active' : pkg.status;
          const { rows: upd } = await client.query(
            `UPDATE customer_packages
             SET used_hours = $1, remaining_hours = $2, status = $3, updated_at = NOW()
             WHERE id = $4
             RETURNING package_name, used_hours, remaining_hours, status`,
            [newUsed, newRemaining, newStatus, r.customer_package_id]
          );
          if (upd.length > 0) {
            const up = upd[0];
            packagesUpdated.push({
              packageName: up.package_name,
              hoursRestored: restoreHours,
              newUsedHours: up.used_hours,
              newRemainingHours: up.remaining_hours
            });
            restoredAny = true;
          }
        }
      }
      if (!restoredAny && booking.customer_package_id) {
        const restoreHours = parseFloat(duration);
        const { rows: pkgRows } = await client.query(
          `SELECT id, package_name, total_hours, used_hours, remaining_hours, status
           FROM customer_packages WHERE id = $1`,
          [booking.customer_package_id]
        );
        if (pkgRows.length > 0) {
          const pkg = pkgRows[0];
          const newUsed = Math.max(0, (parseFloat(pkg.used_hours) || 0) - restoreHours);
          const newRemaining = Math.min(parseFloat(pkg.total_hours) || 0, (parseFloat(pkg.remaining_hours) || 0) + restoreHours);
          const newStatus = newRemaining > 0 ? 'active' : pkg.status;
          const { rows: upd } = await client.query(
            `UPDATE customer_packages
             SET used_hours = $1, remaining_hours = $2, status = $3, updated_at = NOW()
             WHERE id = $4
             RETURNING package_name, used_hours, remaining_hours, status`,
            [newUsed, newRemaining, newStatus, booking.customer_package_id]
          );
          if (upd.length > 0) {
            const up = upd[0];
            packagesUpdated.push({
              packageName: up.package_name,
              hoursRestored: restoreHours,
              newUsedHours: up.used_hours,
              newRemainingHours: up.remaining_hours
            });
          }
        }
      }
    }
    
    // Mark booking as cancelled
    const cancelResult = await client.query(
      `UPDATE bookings 
       SET status = 'cancelled', 
           canceled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id, cancellation_reason]
    );
    
  const _cancelledBooking = cancelResult.rows[0];
    
    // Create financial event record for audit trail
    const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
    let balanceRefunded = 0;
    let refundType = 'none';
    
    // Process balance refund based on payment method
    if (bookingAmount > 0 && booking.student_user_id) {
        if (booking.package_id || booking.payment_method === 'package') {
            // Package booking - no balance refund needed as hours are restored
            refundType = 'package_hours_restored';
        } else {
            // Individual lesson payment - refund to balance
            balanceRefunded = bookingAmount;
            refundType = 'balance_refund';
            
            // Add refund to user balance
            await client.query(`
                UPDATE users 
                SET balance = COALESCE(balance, 0) + $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [balanceRefunded, booking.student_user_id]);
            
            logger.info(`Refunded €${balanceRefunded} to user balance for cancelled booking`);
        }
    }
    
    // Create financial transaction record
    let transactionDescription = `Booking cancelled: ${booking.date}`;
    if (packagesUpdated.length > 0) {
        const totalHoursRestored = packagesUpdated.reduce((sum, pkg) => sum + pkg.hoursRestored, 0);
        transactionDescription += ` (${totalHoursRestored}h restored to packages)`;
    }
    if (balanceRefunded > 0) {
        transactionDescription += ` (€${balanceRefunded} refunded)`;
    }
    transactionDescription += ` - ${cancellation_reason}`;
    
    if (balanceRefunded > 0) {
      const walletMetadata = {
        bookingId: booking.id,
        cancellationReason: cancellation_reason,
        refundType,
        packagesUpdated: packagesUpdated.map((pkg) => ({
          packageName: pkg.packageName,
          hoursRestored: pkg.hoursRestored
        }))
      };

      try {
        await recordLegacyTransaction({
          userId: booking.student_user_id,
          amount: balanceRefunded,
          transactionType: 'booking_cancelled_refund',
          status: 'completed',
          direction: 'credit',
          description: transactionDescription,
          metadata: walletMetadata,
          entityType: 'booking',
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          bookingId: booking.id,
          createdBy: actorId,
          client
        });
      } catch (walletError) {
        logger.error('Failed to record wallet refund for cancelled booking', {
          bookingId: booking.id,
          studentId: booking.student_user_id,
          amount: balanceRefunded,
          error: walletError?.message
        });
        throw walletError;
      }
    }
    
    await client.query('COMMIT');
    
    // Fire-and-forget cancel manager commission
    try {
      const { cancelCommission } = await import('../services/managerCommissionService.js');
      cancelCommission('booking', booking.id, 'Booking cancelled').catch((err) => {
        logger.warn('Manager commission cancellation failed (non-blocking):', { bookingId: booking.id, error: err.message });
      });
    } catch (commissionErr) {
      logger.warn('Failed to import manager commission service:', { error: commissionErr.message });
    }
    
    // Prepare success response
    let successMessage = 'Booking cancelled successfully';
    if (packagesUpdated.length > 0 && balanceRefunded > 0) {
        const totalHoursRestored = packagesUpdated.reduce((sum, pkg) => sum + pkg.hoursRestored, 0);
        successMessage += `. ${totalHoursRestored} hours restored to packages and €${balanceRefunded} refunded to balance.`;
    } else if (packagesUpdated.length > 0) {
        const totalHoursRestored = packagesUpdated.reduce((sum, pkg) => sum + pkg.hoursRestored, 0);
        successMessage += `. ${totalHoursRestored} hours restored to packages.`;
    } else if (balanceRefunded > 0) {
        successMessage += `. €${balanceRefunded} refunded to balance.`;
    }
    
    res.status(200).json({
      message: successMessage,
      booking: cancelResult.rows[0],
      packagesUpdated,
      balanceRefunded,
      refundType
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Failed to cancel booking' });
  } finally {
    client.release();
  }
});

// Helper: create a rental record from an approved booking (if it's a rental service and no rental exists yet)
async function ensureRentalFromBooking(client, booking, actorUserId) {
  try {
    const svcCheck = await client.query(
      `SELECT id, name, category, service_type, duration, price, currency FROM services WHERE id = $1`,
      [booking.service_id]
    );
    const svc = svcCheck.rows[0];
    if (!svc) return;

    const isRental = (
      (svc.category || '').toLowerCase().includes('rental') ||
      (svc.service_type || '').toLowerCase().includes('rental') ||
      (svc.name || '').toLowerCase().includes('rental') ||
      (svc.name || '').toLowerCase().includes('equipment')
    );
    if (!isRental) return;

    const userId = booking.student_user_id || booking.customer_user_id;

    // Check if a rental already exists for this booking's user + service + date
    const existing = await client.query(
      `SELECT id FROM rentals WHERE user_id = $1 AND equipment_ids @> $2::jsonb AND rental_date = $3 LIMIT 1`,
      [userId, JSON.stringify([booking.service_id]), booking.date]
    );
    if (existing.rows.length > 0) return; // Already has a rental

    const serviceDurationHours = parseFloat(svc.duration) || parseFloat(booking.duration) || 1;
    const bookingDate = booking.date || new Date().toISOString().split('T')[0];
    const startHour = parseFloat(booking.start_hour) || 9;
    const startDate = new Date(`${bookingDate}T${String(Math.floor(startHour)).padStart(2, '0')}:${String(Math.round((startHour % 1) * 60)).padStart(2, '0')}:00`);
    const endDate = new Date(startDate.getTime() + serviceDurationHours * 60 * 60 * 1000);

    const equipmentIds = JSON.stringify([booking.service_id]);
    const equipmentDetails = JSON.stringify({
      [svc.id]: { id: svc.id, name: svc.name, category: svc.category, price: parseFloat(svc.price) || 0, currency: svc.currency }
    });
    const totalPrice = parseFloat(booking.final_amount || booking.amount) || 0;

    const rentalResult = await client.query(
      `INSERT INTO rentals (
        user_id, equipment_ids, rental_date, start_date, end_date,
        status, total_price, payment_status, equipment_details, notes,
        created_by, family_member_id, participant_type
      ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
      RETURNING id`,
      [
        userId, equipmentIds, bookingDate,
        startDate.toISOString(), endDate.toISOString(),
        'active', totalPrice, booking.payment_status || 'paid',
        equipmentDetails, booking.notes || null, actorUserId,
        booking.family_member_id || null,
        booking.family_member_id ? 'family_member' : 'self'
      ]
    );

    if (rentalResult.rows.length > 0) {
      const rentalId = rentalResult.rows[0].id;
      await client.query(
        `INSERT INTO rental_equipment (rental_id, equipment_id, daily_rate, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [rentalId, svc.id, parseFloat(svc.price) || 0, actorUserId]
      );
      logger.info('Created rental record from approved booking', {
        bookingId: booking.id, rentalId, serviceId: svc.id, serviceName: svc.name
      });
    }
  } catch (rentalErr) {
    logger.warn('Failed to create rental record from approved booking', {
      bookingId: booking.id, error: rentalErr?.message
    });
  }
}

// PATCH /:id/status - Update booking status (for approve/decline actions from notifications)
router.patch('/:id/status', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor', 'owner']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    // Validate status
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'pending_partner'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    await client.query('BEGIN');
    
    // Get current booking
    const bookingResult = await client.query(
      'SELECT * FROM bookings WHERE id = $1',
      [id]
    );
    
    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    // Check if booking is already in a terminal/same state (no action needed)
    const terminalStatuses = ['completed', 'cancelled', 'no_show'];
    const alreadyInRequestedState = booking.status === status;
    if (terminalStatuses.includes(booking.status) || alreadyInRequestedState) {
      // If already confirmed, ensure rental record exists (idempotent)
      if (booking.status === 'confirmed' || status === 'confirmed') {
        await ensureRentalFromBooking(client, booking, req.user.id);
      }

      // Still update notifications to hide buttons, but don't change booking status
      await client.query(
        `UPDATE notifications
         SET data = jsonb_set(
           COALESCE(data, '{}'::jsonb),
           '{status}',
           '"processed"'::jsonb
         )
         WHERE (data->>'bookingId')::text = $1::text
         AND type IN ('booking_instructor', 'booking_student', 'new_booking_alert')`,
        [id]
      );
      
      await client.query('COMMIT');
      
      // Return success - the booking was already processed
      const friendlyStatus = booking.status === 'confirmed' ? 'approved' : booking.status;
      return res.json({ 
        success: true, 
        message: `This lesson has already been ${friendlyStatus}`,
        status: booking.status,
        alreadyProcessed: true
      });
    }
    
    // === Refund logic when cancelling ===
    if (status === 'cancelled') {
      const duration = parseFloat(booking.duration) || 0;

      // 1) Restore package hours (participant-aware, same pattern as POST /:id/cancel)
      if (duration > 0) {
        const { rows: bpRows } = await client.query(
          `SELECT customer_package_id, payment_status, package_hours_used
           FROM booking_participants WHERE booking_id = $1`,
          [id]
        );
        let restoredAny = false;
        for (const r of bpRows) {
          if (r && r.payment_status === 'package' && r.customer_package_id) {
            const restoreHours = parseFloat(r.package_hours_used) || duration;
            const result = await restoreHoursToPackage(client, r.customer_package_id, restoreHours);
            if (result) restoredAny = true;
          }
        }
        // Fallback: check booking-level package (also handles bookings where payment_status was incorrectly saved)
        if (!restoredAny && booking.customer_package_id) {
          await restoreHoursToPackage(client, booking.customer_package_id, duration);
        }
      }

      // 2) Refund wallet balance for non-package individual payments
      const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
      if (bookingAmount > 0 && booking.student_user_id && booking.payment_method !== 'package' && booking.payment_status !== 'package' && !booking.package_id) {
        await client.query(
          `UPDATE users SET balance = COALESCE(balance, 0) + $1, updated_at = NOW() WHERE id = $2`,
          [bookingAmount, booking.student_user_id]
        );

        try {
          await recordLegacyTransaction({
            userId: booking.student_user_id,
            amount: bookingAmount,
            transactionType: 'booking_cancelled_refund',
            status: 'completed',
            direction: 'credit',
            description: `Booking cancelled (declined): ${booking.date}`,
            metadata: { bookingId: booking.id, cancelledVia: 'status_update' },
            entityType: 'booking',
            relatedEntityType: 'booking',
            relatedEntityId: booking.id,
            bookingId: booking.id,
            createdBy: req.user.id,
            client
          });
        } catch (walletError) {
          logger.error('Failed to record wallet refund on status-cancel', {
            bookingId: booking.id, error: walletError?.message
          });
          throw walletError;
        }

        logger.info(`PATCH status cancel: Refunded €${bookingAmount} to user ${booking.student_user_id}`);
      }

      // Update canceled_at timestamp
      await client.query(
        `UPDATE bookings SET canceled_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
    }

    // Update status
    await client.query(
      `UPDATE bookings 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2`,
      [status, id]
    );

    // === Create rental record when approving a rental booking ===
    if (status === 'confirmed') {
      await ensureRentalFromBooking(client, booking, req.user.id);
    }

    // Fetch service name once for notifications (shared by confirmed & cancelled paths)
    let notifServiceName = 'Lesson';
    let notifBookingDate = '';
    if ((status === 'confirmed' || status === 'cancelled') && booking.student_user_id) {
      try {
        const svcRes = await client.query('SELECT name FROM services WHERE id = $1', [booking.service_id]);
        notifServiceName = svcRes.rows[0]?.name || 'Lesson';
        notifBookingDate = booking.date ? new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      } catch { /* non-critical */ }
    }

    // === Notify student when booking is confirmed/approved ===
    if (status === 'confirmed' && booking.student_user_id) {
      try {

        await insertNotification({
          userId: booking.student_user_id,
          title: 'Booking Confirmed',
          message: `Your ${notifServiceName} booking${notifBookingDate ? ` on ${notifBookingDate}` : ''} has been confirmed!`,
          type: 'booking_confirmed',
          data: {
            bookingId: booking.id,
            serviceId: booking.service_id,
            date: booking.date,
            link: '/student/bookings'
          },
          client
        });
      } catch (notifErr) {
        logger.warn('Failed to send booking confirmation notification to student', {
          bookingId: booking.id, studentId: booking.student_user_id, error: notifErr?.message
        });
      }
    }

    // === Notify student when booking is cancelled/declined ===
    if (status === 'cancelled' && booking.student_user_id) {
      try {
        await insertNotification({
          userId: booking.student_user_id,
          title: 'Booking Declined',
          message: `Your ${notifServiceName} booking${notifBookingDate ? ` on ${notifBookingDate}` : ''} has been declined. Any charges have been refunded.`,
          type: 'booking_declined',
          data: {
            bookingId: booking.id,
            serviceId: booking.service_id,
            date: booking.date,
            link: '/student/bookings'
          },
          client
        });
      } catch (notifErr) {
        logger.warn('Failed to send booking decline notification to student', {
          bookingId: booking.id, studentId: booking.student_user_id, error: notifErr?.message
        });
      }
    }
    
    // Update notification status for this booking
    // Set data.status to 'processed' to hide action buttons
    // Include all notification types that have action buttons for bookings
    await client.query(
      `UPDATE notifications
       SET data = jsonb_set(
         COALESCE(data, '{}'::jsonb),
         '{status}',
         '"processed"'::jsonb
       )
       WHERE (data->>'bookingId')::text = $1::text
       AND type IN ('booking_instructor', 'booking_student', 'new_booking_alert')`,
      [id]
    );
    
    // Log audit trail (non-critical — use SAVEPOINT so a failure doesn't abort the transaction)
    try {
      await client.query('SAVEPOINT audit_log_sp');
      await client.query(
        `INSERT INTO audit_logs (event_type, action, entity_type, resource_type, resource_id, actor_user_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          'booking_status_change',
          'update_booking_status',
          'booking',
          'booking',
          id,
          req.user.id,
          JSON.stringify({ oldStatus: booking.status, newStatus: status })
        ]
      );
      await client.query('RELEASE SAVEPOINT audit_log_sp');
    } catch (auditErr) {
      await client.query('ROLLBACK TO SAVEPOINT audit_log_sp').catch(() => {});
      logger.warn('Non-critical: Failed to insert audit log for booking status change', {
        bookingId: id, error: auditErr?.message
      });
    }
    
    await client.query('COMMIT');
    
    // Emit real-time notification to the student after commit
    if ((status === 'confirmed' || status === 'cancelled') && booking.student_user_id) {
      try {
        socketService.emitToChannel(`user:${booking.student_user_id}`, 'notification:new', {
          notification: {
            user_id: booking.student_user_id,
            title: status === 'confirmed' ? 'Booking Confirmed' : 'Booking Declined',
            message: status === 'confirmed'
              ? `Your ${notifServiceName} booking${notifBookingDate ? ` on ${notifBookingDate}` : ''} has been confirmed!`
              : `Your ${notifServiceName} booking${notifBookingDate ? ` on ${notifBookingDate}` : ''} has been declined.`,
            type: status === 'confirmed' ? 'booking_confirmed' : 'booking_declined',
            data: { bookingId: booking.id, serviceId: booking.service_id, date: booking.date, link: '/student/bookings' },
            created_at: new Date().toISOString()
          }
        });
      } catch (emitErr) {
        logger.warn('Failed to emit real-time notification', { error: emitErr?.message });
      }
    }

    res.json({ 
      success: true, 
      message: `Booking ${status === 'confirmed' ? 'approved' : status === 'cancelled' ? 'declined' : 'updated'}`,
      status
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating booking status:', { bookingId: id, error: error?.message, stack: error?.stack });
    res.status(500).json({ error: 'Failed to update booking status', bookingId: id });
  } finally {
    client.release();
  }
});

/**
 * POST /bookings/:id/confirm-partner
 * Partner confirms a pending_partner booking → status becomes 'confirmed'
 * The booking immediately appears on the calendar as confirmed.
 */
router.post('/:id/confirm-partner', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify this booking is pending_partner and the caller is a participant
    const result = await pool.query(
      `SELECT b.id, b.status, b.student_user_id, b.date, b.start_hour, b.duration,
              s.name AS service_name,
              bp.user_id
       FROM bookings b
       JOIN booking_participants bp ON bp.booking_id = b.id
       LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND bp.user_id = $2 AND bp.is_primary = false`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or you are not a participant' });
    }

    if (result.rows[0].status !== 'pending_partner') {
      return res.status(400).json({ error: 'Booking is not awaiting partner confirmation' });
    }

    await pool.query(
      `UPDATE bookings SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    // Notify the organizer that the partner accepted
    const booking = result.rows[0];
    const partnerName = req.user?.name || req.user?.first_name || 'Your partner';
    try {
      await insertNotification({
        userId: booking.student_user_id,
        title: 'Partner Accepted!',
        message: `${partnerName} accepted your ${booking.service_name || 'group'} lesson invite on ${booking.date}.`,
        type: 'booking',
        data: { bookingId: id, action: 'partner_accepted' }
      });
    } catch (notifErr) {
      logger.warn('Failed to notify organizer about partner acceptance', { error: notifErr?.message });
    }

    // Emit real-time events
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:updated', { id, status: 'confirmed' });
        req.socketService.emitToChannel(`user:${booking.student_user_id}`, 'notification:new', {
          title: 'Partner Accepted!',
          message: `${partnerName} accepted your lesson invite.`,
          type: 'booking'
        });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'partner_confirmed' });
      } catch (emitErr) {
        logger.warn('Failed to emit partner confirmation event', { error: emitErr?.message });
      }
    }

    res.json({ success: true, message: 'Booking confirmed by partner', status: 'confirmed' });
  } catch (error) {
    logger.error('Error confirming partner booking', { bookingId: req.params.id, error: error?.message });
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

/**
 * POST /bookings/:id/decline-partner
 * Partner declines a pending_partner booking → status becomes 'cancelled'
 * Package hours are refunded to both participants.
 */
router.post('/:id/decline-partner', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT b.id, b.status, b.student_user_id, b.duration, b.date,
              s.name AS service_name,
              bp.user_id, bp.customer_package_id
       FROM bookings b
       JOIN booking_participants bp ON bp.booking_id = b.id
       LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND bp.user_id = $2 AND bp.is_primary = false`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or you are not a participant' });
    }

    if (result.rows[0].status !== 'pending_partner') {
      return res.status(400).json({ error: 'Booking is not awaiting partner confirmation' });
    }

    const booking = result.rows[0];
    const duration = parseFloat(booking.duration) || 0;

    // Refund package hours to ALL participants
    const allParticipants = await pool.query(
      `SELECT user_id, customer_package_id, hours_used FROM booking_participants WHERE booking_id = $1`,
      [id]
    );

    for (const p of allParticipants.rows) {
      if (p.customer_package_id && duration > 0) {
        await pool.query(
          `UPDATE customer_packages SET remaining_hours = remaining_hours + $1, updated_at = NOW() WHERE id = $2`,
          [parseFloat(p.hours_used) || duration, p.customer_package_id]
        );
      }
    }

    // Cancel the booking
    await pool.query(
      `UPDATE bookings SET status = 'cancelled', canceled_at = NOW(), cancellation_reason = 'Partner declined', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Notify the organizer
    const partnerName = req.user?.name || req.user?.first_name || 'Your partner';
    try {
      await insertNotification({
        userId: booking.student_user_id,
        title: 'Partner Declined',
        message: `${partnerName} declined your ${booking.service_name || 'group'} lesson invite on ${booking.date}. Package hours have been refunded.`,
        type: 'booking',
        data: { bookingId: id, action: 'partner_declined' }
      });
    } catch (notifErr) {
      logger.warn('Failed to notify organizer about partner decline', { error: notifErr?.message });
    }

    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:updated', { id, status: 'cancelled' });
        req.socketService.emitToChannel(`user:${booking.student_user_id}`, 'notification:new', {
          title: 'Partner Declined',
          message: `${partnerName} declined your lesson invite. Hours refunded.`,
          type: 'booking'
        });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'partner_declined' });
      } catch (emitErr) {
        logger.warn('Failed to emit partner decline event', { error: emitErr?.message });
      }
    }

    res.json({ success: true, message: 'Booking declined, hours refunded', status: 'cancelled' });
  } catch (error) {
    logger.error('Error declining partner booking', { bookingId: req.params.id, error: error?.message });
    res.status(500).json({ error: 'Failed to decline booking' });
  }
});

/**
 * POST /bookings/:id/suggest-time
 * Partner suggests an alternative time for a pending_partner booking.
 * Sends a notification to the organizer with the suggested date/time.
 */
router.post('/:id/suggest-time', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { suggestedDate, suggestedTime, message: suggestionMessage } = req.body;

    if (!suggestedDate) {
      return res.status(400).json({ error: 'Suggested date is required' });
    }

    // Verify this booking is pending_partner and the caller is a non-primary participant
    const result = await pool.query(
      `SELECT b.id, b.status, b.student_user_id, b.date,
              s.name AS service_name,
              bp.user_id
       FROM bookings b
       JOIN booking_participants bp ON bp.booking_id = b.id
       LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND bp.user_id = $2 AND bp.is_primary = false`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or you are not a participant' });
    }

    if (result.rows[0].status !== 'pending_partner') {
      return res.status(400).json({ error: 'Booking is not awaiting partner confirmation' });
    }

    const booking = result.rows[0];
    const partnerName = req.user?.name || [req.user?.first_name, req.user?.last_name].filter(Boolean).join(' ') || 'Your partner';
    const timeStr = suggestedTime ? ` at ${suggestedTime}` : '';
    const msgSuffix = suggestionMessage ? ` — "${suggestionMessage}"` : '';
    const notifMsg = `${partnerName} suggested a different time for your ${booking.service_name || 'group'} lesson: ${suggestedDate}${timeStr}.${msgSuffix}`;

    try {
      await insertNotification({
        userId: booking.student_user_id,
        title: 'Time Suggestion',
        message: notifMsg,
        type: 'booking',
        data: {
          bookingId: id,
          action: 'partner_suggest_time',
          suggestedDate,
          suggestedTime,
          suggestionMessage,
        },
      });
    } catch (notifErr) {
      logger.warn('Failed to send time suggestion notification', { error: notifErr?.message });
    }

    if (req.socketService) {
      try {
        req.socketService.emitToChannel(`user:${booking.student_user_id}`, 'notification:new', {
          notification: {
            user_id: booking.student_user_id,
            title: 'Time Suggestion',
            message: notifMsg,
            type: 'booking',
            data: { bookingId: id, suggestedDate, suggestedTime },
            created_at: new Date().toISOString(),
          },
        });
      } catch (emitErr) {
        logger.warn('Failed to emit suggest-time event', { error: emitErr?.message });
      }
    }

    res.json({ success: true, message: 'Time suggestion sent to the organizer' });
  } catch (error) {
    logger.error('Error suggesting time for partner booking', { bookingId: req.params.id, error: error?.message });
    res.status(500).json({ error: 'Failed to suggest time' });
  }
});

export default router;
