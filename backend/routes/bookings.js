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

  const candidates = [serviceRow.type, serviceRow.category, serviceRow.name]
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

    // Test database connection first
    try {
      await pool.query('SELECT NOW() as current_time');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return res.status(500).json({ 
        error: 'Database connection failed',
        details: dbError.message 
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
        console.error('Error fetching instructors by IDs:', e);
        // If query by IDs fails, at least provide stubs so calendar works
        instructorsResult.rows = instructorIdList.map((id) => ({ id, name: `Instructor ${id}`, email: null }));
      }
    } else {
      try {
        const instructorsQuery = `
          SELECT u.id, u.name, u.email 
          FROM users u
          JOIN roles r ON u.role_id = r.id
          WHERE LOWER(r.name) = 'instructor'
          ORDER BY u.name
        `;
        const r = await pool.query(instructorsQuery);
        instructorsResult.rows = r.rows;
      } catch (instructorError) {
        console.error('Error fetching instructors by role:', instructorError);
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

    let cursor = startDate;
    const last = endDate;
    while (true) {
      const dateStr = cursor; // exact match with query string
      
      // Get existing bookings for this date (filter by instructor IDs when provided)
      let bookingsResult;
      try {
        let params = [dateStr];
        let bookingsQuery = `
          SELECT 
            instructor_user_id,
            start_hour,
            duration,
            status
          FROM bookings 
          WHERE date = $1 AND deleted_at IS NULL
        `;
        if (!noInstructors && instructorIdList.length > 0) {
          // Filter by explicit instructor ids (UUID/text-safe)
          const placeholders = instructorIdList.map((_, i) => `$${i + 2}`).join(',');
          bookingsQuery += ` AND instructor_user_id IN (${placeholders})`;
          params = [dateStr, ...instructorIdList];
        }
        bookingsQuery += ' ORDER BY instructor_user_id, start_hour';
        bookingsResult = await pool.query(bookingsQuery, params);
        
      } catch (bookingError) {
        console.error('Error fetching bookings for', dateStr, ':', bookingError);
        bookingsResult = { rows: [] };
      }
      
      // Create a map of booked slots by instructor
      const bookedSlots = new Map();
      
      if (bookingsResult.rows.length > 0) {
        bookingsResult.rows.forEach(booking => {
          const instructorId = booking.instructor_user_id;
          if (!bookedSlots.has(instructorId)) {
            bookedSlots.set(instructorId, new Set());
          }
          
          // Parse start_hour as a decimal (e.g., 9.00, 12.50)
          const startHourDecimal = parseFloat(booking.start_hour);
          const durationDecimal = parseFloat(booking.duration) || 1;
          
          // Convert decimal hour to time slots (30-minute intervals)
          const startHour = Math.floor(startHourDecimal);
          const startMinute = Math.round((startHourDecimal - startHour) * 60);
          
          // Calculate total minutes for the booking
          const startTimeMinutes = startHour * 60 + startMinute;
          const durationMinutes = durationDecimal * 60;
          const endTimeMinutes = startTimeMinutes + durationMinutes;
          
          // Mark all 30-minute slots in the duration as booked
          for (let currentMinutes = startTimeMinutes; currentMinutes < endTimeMinutes; currentMinutes += 30) {
            const hour = Math.floor(currentMinutes / 60);
            const minute = currentMinutes % 60;
            const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            bookedSlots.get(instructorId).add(timeSlot);
          }
        });
      }

      // Generate slots for each instructor
      const daySlots = [];
      
      for (const instructor of (noInstructors ? [] : instructorsResult.rows)) {
        const instructorBookedSlots = bookedSlots.get(instructor.id) || new Set();
        
        for (const time of standardHours) {
          const status = instructorBookedSlots.has(time) ? 'booked' : 'available';
          
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
      
  // Move to next day
  if (cursor === last) break;
  cursor = addDays(cursor, 1);
    }
    
  // If no instructors, still respond with the date structure but empty slots array
  res.json(result);
    
  } catch (error) {
    console.error('Error in available-slots endpoint:', error.message);
    
    res.status(500).json({ 
      error: 'Failed to fetch available slots',
      details: error.message,
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
  const { student_id, instructor_id, start_date, end_date, status } = req.query;
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
        cp.package_name as customer_package_name,
        TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date,
        COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value) as instructor_commission,
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
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
  LEFT JOIN wallet_transactions t ON t.booking_id = b.id AND t.transaction_type IN ('charge', 'booking_charge')
      LEFT JOIN booking_participants bp ON bp.booking_id = b.id
      LEFT JOIN users pu ON bp.user_id = pu.id
      LEFT JOIN users creator ON creator.id = b.created_by
      LEFT JOIN users updater ON updater.id = b.updated_by
      WHERE b.deleted_at IS NULL
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
    
    query += ` GROUP BY b.id, b.student_user_id, b.instructor_user_id, b.service_id, b.customer_package_id, b.created_by, b.updated_by, b.date, b.start_hour, b.duration, b.group_size, b.status, b.payment_status, b.final_amount, b.amount, b.created_at, b.updated_at, b.notes, b.deleted_at, s.name, s.balance, i.name, srv.name, cp.package_name, bcc.commission_value, isc.commission_value, idc.commission_value, t.id, creator.name, creator.email, updater.name, updater.email
               ORDER BY b.date DESC`;
    
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
          console.warn('Invalid start_hour detected:', booking.start_hour, 'for booking ID:', booking.id);
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
          console.warn('Invalid calculated time values:', { hours, minutes }, 'from start_hour:', startHourFloat);
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
          console.warn('Invalid end time calculation:', { endHours, endMinutes });
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
    console.error('Error fetching bookings:', err);
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
      WHERE b.deleted_at IS NULL
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
    console.error('Error fetching calendar bookings:', err);
    res.status(500).json({ error: 'Failed to fetch calendar bookings' });
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
        COALESCE(isc.commission_value, idc.commission_value, 30) as instructor_commission,
        COALESCE(isc.commission_type, idc.commission_type, 'percentage') as commission_type
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
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
        console.warn('Invalid start_hour detected in single booking:', booking.start_hour, 'for booking ID:', booking.id);
        booking.startTime = null;
        booking.endTime = null;
        booking.time = null;
      } else {
        const hours = Math.floor(startHourFloat);
        const minutes = Math.round((startHourFloat - hours) * 60);
        
        // Additional safety check for calculated values
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          console.warn('Invalid calculated time values for single booking:', { hours, minutes }, 'from start_hour:', startHourFloat);
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
            console.warn('Invalid end time calculation for single booking:', { endHours, endMinutes });
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
    console.error('Error fetching booking:', err);
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
      status, amount, notes, location, equipment_ids, use_package, service_id,
      voucherId  // Voucher/promo code to apply
    } = req.body;
    let walletCurrency = req.body.wallet_currency || req.body.walletCurrency || req.body.currency;
    const requestedPaymentMethod = req.body.payment_method || null;
    
    // If currency not provided, get from customer's preferred_currency
    if (!walletCurrency && student_user_id) {
      const userCurrencyResult = await client.query(
        'SELECT preferred_currency FROM users WHERE id = $1',
        [student_user_id]
      );
      walletCurrency = userCurrencyResult.rows[0]?.preferred_currency || DEFAULT_CURRENCY;
    } else if (!walletCurrency) {
      walletCurrency = DEFAULT_CURRENCY;
    }
    
    // Debug: Log duration received in backend
    console.log('🔍 BACKEND BOOKING CREATE - Received duration:', {
      duration,
      type: typeof duration,
      parsed: parseFloat(duration),
      fallback: parseFloat(duration) || 1
    });
    
    // Staff roles automatically can allow negative balance (front desk can book even if customer has no balance)
    const staffRolesForNegativeBalance = ['admin', 'manager', 'front_desk', 'instructor'];
    const isStaffBooker = staffRolesForNegativeBalance.includes(req.user?.role);
    // trusted_customer with pay_later: allow negative balance so debt is tracked in wallet
    const isTrustedCustomerPayLater = req.user?.role === 'trusted_customer' && requestedPaymentMethod === 'pay_later';
    const allowNegativeBalance = req.body.allowNegativeBalance === true || isStaffBooker || isTrustedCustomerPayLater;
    
    // Staff roles automatically confirm bookings (admin, manager, front_desk)
    const staffRolesForAutoConfirm = ['admin', 'manager', 'front_desk'];
    const shouldAutoConfirm = staffRolesForAutoConfirm.includes(req.user?.role);
    const finalStatus = shouldAutoConfirm ? 'confirmed' : (status || 'pending');
    
    // Validate required fields
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    
    const bookingDuration = parseFloat(duration) || 1;
    
    let finalPaymentStatus = 'paid'; // Pay-and-go: default to paid for individual payments
    let finalAmount = parseFloat(amount) || 0;
    let usedPackageId = null;

    // Fetch service name and capacity limits
    let bookingServiceName = null;
    let maxParticipants = null;
    if (service_id) {
      try {
        const sres = await client.query('SELECT name, max_participants FROM services WHERE id = $1', [service_id]);
        bookingServiceName = sres.rows[0]?.name || null;
        maxParticipants = sres.rows[0]?.max_participants || null;
      } catch {}
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
      
      // Check if customer has available package hours matching the service type/name
      // Use flexible matching: exact match, or fuzzy match (trim 's' suffix for singular/plural)
      const params = [student_user_id, parseFloat(bookingDuration)];
      let sql = `
        SELECT id, package_name, remaining_hours, total_hours, used_hours, purchase_price, lesson_service_name
        FROM customer_packages 
        WHERE customer_id = $1 
          AND status = 'active' 
          AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $2)
          AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)
      `;
      if (bookingServiceName) {
        // Flexible matching: allow singular/plural mismatch (e.g., "Private Lesson" matches "Private Lessons")
        sql += ` AND (
          lesson_service_name IS NULL 
          OR LOWER(lesson_service_name) = LOWER($3)
          OR LOWER(RTRIM(lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
        )`;
        params.push(bookingServiceName);
      }
      sql += ' ORDER BY purchase_date ASC LIMIT 1';
      const packageCheck = await client.query(sql, params);
      
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
        const packageUpdateResult = await client.query(`
          UPDATE customer_packages 
          SET used_hours = $1::numeric, 
              remaining_hours = $2::numeric,
              last_used_date = $5,
              updated_at = CURRENT_TIMESTAMP,
              status = CASE 
                WHEN $2::numeric <= 0 THEN 'used_up'
                ELSE 'active'
              END
          WHERE id = $3 AND status = 'active' 
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
        finalAmount = 0;
        usedPackageId = packageToUse.id;
      } else {
        return res.status(400).json({ 
          error: 'Insufficient or mismatched package',
          message: bookingServiceName
            ? `No active ${bookingServiceName} package with enough hours. Choose a matching package or pay individually.`
            : 'No active package with enough hours. Choose a package or pay individually.'
        });
      }
    }
    
    // Voucher/promo code handling for individual bookings (not package-based)
    let voucherDiscount = 0;
    let appliedVoucher = null;
    let originalAmount = finalAmount;
    
    if (voucherId && use_package === false && finalAmount > 0) {
      try {
        // Validate the voucher
        const voucherValidation = await voucherService.validateVoucher(
          voucherId, 
          student_user_id, 
          'lessons',  // context for lessons
          finalAmount, 
          walletCurrency, 
          service_id
        );
        
        if (!voucherValidation.valid) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: voucherValidation.error || 'Invalid voucher code',
            code: 'VOUCHER_INVALID'
          });
        }
        
        appliedVoucher = voucherValidation.voucher;
        
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
          finalAmount = discountResult.finalPrice;
          
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
    const pendingTransactions = [];
    if (student_user_id && use_package === false) {
      if (finalAmount > 0) {
        pendingTransactions.push({
          userId: student_user_id,
          amount: -Math.abs(finalAmount),
          type: 'booking_charge',
          description: `Individual lesson charge: ${date} ${start_hour}:00 (${bookingDuration}h)${voucherDiscount > 0 ? ` (voucher discount: ${voucherDiscount})` : ''}`,
          status: 'completed',
          currency: walletCurrency,
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
    } else {
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
      'customer_package_id'
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
      notes || '',
      location || 'TBD',
      req.body.weather_conditions || 'Good',
      req.body.service_id,
      req.body.checkin_notes || '',
      req.body.checkout_notes || '',
      usedPackageId // Include the package ID that was used
    ];

    const { columns: bookingInsertColumns, values: bookingInsertValues } = appendCreatedBy(bookingColumns, bookingValues, actorId);
    const bookingPlaceholders = bookingInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
    const insertBookingQuery = `INSERT INTO bookings (${bookingInsertColumns.join(', ')}) VALUES (${bookingPlaceholders}) RETURNING *`;

    const bookingResult = await client.query(insertBookingQuery, bookingInsertValues);
    
    const booking = bookingResult.rows[0];

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
        const redemptionResult = await voucherService.redeemVoucher(
          appliedVoucher.id,
          student_user_id,
          'booking',
          booking.id,
          originalAmount,
          voucherDiscount,
          walletCurrency
        );
        
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
              appliedVoucher,
              student_user_id,
              redemptionResult.redemptionId
            );
            voucherRedemptionInfo.walletCreditApplied = creditResult.creditAmount;
            voucherRedemptionInfo.walletCurrency = creditResult.currency;
            
            logger.info('Wallet credit voucher applied after booking', {
              voucherId: appliedVoucher.id,
              userId: student_user_id,
              creditAmount: creditResult.creditAmount,
              currency: creditResult.currency
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
    
    // Emit real-time event for booking creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:created', booking);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'created' });
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
  logger.info('🔧 [Backend] Group booking request received', { body: req.body });
    
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

    // Debug: Log duration received in group booking backend
    console.log('🔍 BACKEND GROUP BOOKING - Received duration:', {
      duration,
      type: typeof duration,
      parsed: parseFloat(duration),
      fallback: parseFloat(duration) || 1
    });

    // Normalize participants to accept older client field names and sanitize boolean fields
    const normalizedParticipants = Array.isArray(participants) ? participants.map(p => ({
      ...p,
      customerPackageId: p.customerPackageId || p.selectedPackageId || p.selected_package_id,
      // Ensure boolean fields are properly converted (empty strings, undefined, etc. become false)
      isPrimary: p.isPrimary === true || p.isPrimary === 'true',
      usePackage: p.usePackage === true || p.usePackage === 'true',
      manualCashPreference: p.manualCashPreference === true || p.manualCashPreference === 'true'
    })) : [];
    
    logger.info('🔧 [Backend] Parsed values', {
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
      logger.info(`🔧 [Backend] Participant ${i + 1}` , {
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
         AND status != 'cancelled'
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
           AND status != 'cancelled'
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
          // Validate the selected package matches the service type/name when known
          const params = [participant.customerPackageId, participant.userId, date];
          let sql = `
            SELECT id, package_name, remaining_hours, total_hours, used_hours, purchase_price, lesson_service_name
            FROM customer_packages
            WHERE id = $1 AND customer_id = $2
              AND status = 'active'
              AND (expiry_date IS NULL OR expiry_date >= $3)
          `;
          if (serviceName) {
            // Flexible matching: allow singular/plural mismatch
            sql += ` AND (
              lesson_service_name IS NULL 
              OR LOWER(lesson_service_name) = LOWER($4)
              OR LOWER(RTRIM(lesson_service_name, 's')) = LOWER(RTRIM($4, 's'))
            )`;
            params.push(serviceName);
          }
          sql += ' LIMIT 1';
          packageCheck = await client.query(sql, params);
        } else {
          // Pick earliest active package matching service type/name with enough hours
          const params = [participant.userId, date];
          let sql = `
            SELECT id, package_name, remaining_hours, total_hours, used_hours, purchase_price, lesson_service_name
            FROM customer_packages 
            WHERE customer_id = $1 
              AND status = 'active' 
              AND (expiry_date IS NULL OR expiry_date >= $2)
          `;
          if (serviceName) {
            // Flexible matching: allow singular/plural mismatch
            sql += ` AND (
              lesson_service_name IS NULL 
              OR LOWER(lesson_service_name) = LOWER($3)
              OR LOWER(RTRIM(lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
            )`;
            params.push(serviceName);
          }
          sql += ' ORDER BY purchase_date ASC LIMIT 1';
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
          
          // Update the package
          const packageUpdateResult = await client.query(`
            UPDATE customer_packages 
            SET used_hours = $1::numeric, 
                remaining_hours = $2::numeric,
                last_used_date = $3,
                updated_at = CURRENT_TIMESTAMP,
                status = CASE 
                  WHEN $2::numeric <= 0 THEN 'used_up'
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
          errorMessage = 'Invalid data format: ' + err.message;
          statusCode = 400;
          break;
        default:
          errorMessage = `Database error (${err.code}): ${err.message}`;
      }
    }
    
    res.status(statusCode).json({ error: errorMessage, details: err.message, code: err.code });
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

    // Debug: Log duration received in calendar booking backend
    console.log('🔍 BACKEND CALENDAR BOOKING - Received duration:', {
      duration,
      type: typeof duration,
      parsed: parseFloat(duration),
      fallback: parseFloat(duration) || 1
    });
    
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
        
      // Normalize date format to YYYY-MM-DD if it's not already
      const normalizedDate = typeof date === 'string' && date.includes('T') 
        ? date.split('T')[0] 
        : date;      // Check if the slot is still available (check for time conflicts)
      const slotCheck = await client.query(
        `SELECT id, start_hour, duration, (start_hour + duration) as end_hour
         FROM bookings 
         WHERE date = $1 
         AND instructor_user_id = $2
         AND status != 'cancelled'
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
           AND status != 'cancelled'
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
      
  let chosenPackageId = customerPackageId || null;
  if (use_package === true) {
        // If a specific package was requested, validate it matches and has some hours remaining
        if (customerPackageId) {
          const params = [customerPackageId, userId, normalizedDate];
          let sql = `
            SELECT id, package_name, remaining_hours, total_hours, used_hours
            FROM customer_packages
            WHERE id = $1 AND customer_id = $2
              AND status = 'active'
              AND (expiry_date IS NULL OR expiry_date >= $3)
          `;
          if (svcName) {
            // Flexible matching: allow singular/plural mismatch
            sql += ` AND (
              lesson_service_name IS NULL 
              OR LOWER(lesson_service_name) = LOWER($4)
              OR LOWER(RTRIM(lesson_service_name, 's')) = LOWER(RTRIM($4, 's'))
            )`;
            params.push(svcName);
          }
          sql += ' LIMIT 1';
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
                status = CASE WHEN $2::numeric <= 0 THEN 'used_up' ELSE 'active' END
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
              AND status = 'active'
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
                status = CASE WHEN $2::numeric <= 0 THEN 'used_up' ELSE 'active' END
            WHERE id = $4 AND status = 'active'
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
          currency: resolvedWalletCurrency,
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
          console.warn('Failed to emit socket event:', socketError);
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
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Server error when creating booking: ' + error.message });
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
      instructor_commission, checkout_status, checkout_time, checkout_notes,
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
        
        await client.query(`
          INSERT INTO booking_custom_commissions 
          (id, booking_id, instructor_id, service_id, commission_type, commission_value, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'percentage', $5, NOW(), NOW())
        `, [commissionId, booking.id, instructor_user_id, booking.service_id, instructor_commission]);
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
        console.log('📦 PACKAGE CONSOLIDATION: Skipping package deduction on completion - already handled at creation');
        console.log('🔧 FIX: This prevents double deduction that was causing: "3.5h used but only 1h remaining" issue');
        
        // Only update last_used_date if this was a package booking to track usage
        if (booking.payment_status === 'package' && booking.customer_package_id) {
          try {
            await client.query(
              'UPDATE customer_packages SET last_used_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
              [booking.date, booking.customer_package_id]
            );
            console.log('📦 Updated last_used_date for package tracking (no hour deduction)');
          } catch (e) {
            console.warn('Failed to update package last_used_date:', e.message);
          }
        }
      }

      // 2) GROUP BOOKING PACKAGE DEDUCTION CONSOLIDATION FIX:
      // Similar to single bookings, package hours should only be deducted at creation, not completion
      // This prevents double deduction for group booking participants
      try {
        console.log('📦 GROUP PACKAGE CONSOLIDATION: Skipping participant package deduction on completion');
        console.log('🔧 FIX: Group booking package hours already deducted at creation - preventing double deduction');
        
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
                console.warn(`Failed to update last_used_date for participant package ${participant.customer_package_id}:`, e.message);
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
        
        console.log('📦 Updated last_used_date for group participants who used packages (no hour deduction)');
      } catch (e) {
        console.warn('Group booking package last_used_date update failed (non-blocking):', e.message);
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
        const lessonDate = updatedBooking.date ? new Date(updatedBooking.date).toISOString().split('T')[0] : null;

        setImmediate(async () => {
          try {
            const [instructorRes, serviceRes] = await Promise.all([
              instructorId
                ? pool.query('SELECT name, profile_image_url FROM users WHERE id = $1', [instructorId])
                : Promise.resolve({ rows: [] }),
              serviceId
                ? pool.query('SELECT type, category, name FROM services WHERE id = $1', [serviceId])
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
    
    // Emit real-time event for booking update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:updated', updatedBooking);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
  // Send immediate response to client for fast UI feedback
  res.status(200).json(updatedBooking);
    
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
          console.error('🔄 Cascade update failed (will retry):', cascadeError.message);
        }
      });
    }

    // Note: transaction already committed above; do not commit again here

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating booking:', error);
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
          AND status <> 'cancelled'
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
            AND status <> 'cancelled'
            AND deleted_at IS NULL
            AND id <> ALL($5::uuid[])
            AND ((start_hour < ($3::numeric + $4::numeric)) AND ((start_hour + duration) > $3::numeric))
          LIMIT 1`;
        const r = await client.query(sql, [date, instrId, parseFloat(startHour), parseFloat(duration), excludeIds]);
        return r.rows.length > 0;
      };

      const exclude = [aRow.id, bRow.id];
      // Find a parking slot (prefer A's instructor, then B's), half-hour steps between 6:00–21:00
      const tryInstructors = [aRow.instructor_user_id, bRow.instructor_user_id];
      let parking = null;
      outer: for (const instr of tryInstructors) {
        for (let h = 6; h <= 21 - durA + 0.0001; h += 0.5) {
          const busy = await overlapCheck(instr, h, durA, exclude);
          if (!busy) { parking = { instructor_user_id: instr, start_hour: h }; break outer; }
        }
      }
      if (!parking) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No temporary parking slot available to complete swap' });
      }

      // Step 1: A -> parking
      if (await overlapCheck(parking.instructor_user_id, parking.start_hour, durA, exclude)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Parking slot unexpectedly occupied' });
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
            AND status <> 'cancelled'
            AND deleted_at IS NULL
            AND id <> ALL($5::uuid[])
            AND ((start_hour < ($3::numeric + $4::numeric)) AND ((start_hour + duration) > $3::numeric))
          LIMIT 1`;
        const r = await client.query(sql, [date, instrId, parseFloat(startHour), parseFloat(duration), excludeIds]);
        return r.rows.length > 0;
      };

      const exclude = [aRow.id, bRow.id];
      // Always use parking-based swap to respect unique constraints
      const tryInstructors = [aRow.instructor_user_id, bRow.instructor_user_id];
      let parking = null;
      outer: for (const instr of tryInstructors) {
        for (let h = 6; h <= 21 - durA + 0.0001; h += 0.5) {
          const busy = await overlapCheck(instr, h, durA, exclude);
          if (!busy) { parking = { instructor_user_id: instr, start_hour: h }; break outer; }
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
    // Fallback to main booking package if no participant records exist
    if (packagesUpdated.length === 0 && booking.payment_status === 'package' && booking.customer_package_id) {
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
            message: 'Failed to delete booking: ' + error.message
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
                    console.warn('Failed to emit socket event:', socketError);
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
        console.error('Error restoring booking:', error);
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
      if (!restoredAny && booking.payment_status === 'package' && booking.customer_package_id) {
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
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
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
    
    // Check if booking is already in a terminal state
    const terminalStatuses = ['completed', 'cancelled', 'no_show'];
    if (terminalStatuses.includes(booking.status)) {
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
      return res.json({ 
        success: true, 
        message: `Booking already ${booking.status}`,
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
        // Fallback: check booking-level package
        if (!restoredAny && booking.payment_status === 'package' && booking.customer_package_id) {
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
    
    // Log audit trail
    await client.query(
      `INSERT INTO audit_logs (event_type, action, resource_type, resource_id, actor_user_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        'booking_status_change',
        'update_booking_status',
        'booking',
        id,
        req.user.id,
        JSON.stringify({ oldStatus: booking.status, newStatus: status })
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `Booking ${status === 'confirmed' ? 'approved' : status === 'cancelled' ? 'declined' : 'updated'}`,
      status
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  } finally {
    client.release();
  }
});

export default router;
