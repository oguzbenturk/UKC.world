/**
 * Group Lesson Request Service
 * 
 * Handles the solo-student group lesson request flow:
 * - Students submit requests indicating they want a group lesson but have no partner
 * - Managers/admins review requests and match compatible students together
 * - When matched, a group booking is created and students are notified
 */

import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middlewares/errorHandler.js';
import { createGroupBooking, addParticipantsByUserIds } from './groupBookingService.js';

/**
 * Create a new group lesson request
 */
export const createGroupLessonRequest = async ({
  userId,
  serviceId,
  preferredDateStart,
  preferredDateEnd,
  preferredTimeOfDay = 'any',
  preferredDurationHours = 1,
  skillLevel = 'beginner',
  notes
}) => {
  const id = uuidv4();
  const result = await pool.query(`
    INSERT INTO group_lesson_requests (
      id, user_id, service_id,
      preferred_date_start, preferred_date_end,
      preferred_time_of_day, preferred_duration_hours,
      skill_level, notes, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW(), NOW())
    RETURNING *
  `, [
    id, userId, serviceId,
    preferredDateStart, preferredDateEnd || null,
    preferredTimeOfDay, preferredDurationHours,
    skillLevel, notes || null
  ]);

  return result.rows[0];
};

/**
 * Get requests for the current user
 */
export const getUserRequests = async (userId) => {
  const result = await pool.query(`
    SELECT glr.*,
      s.name AS service_name,
      s.category AS service_category
    FROM group_lesson_requests glr
    LEFT JOIN services s ON s.id = glr.service_id
    WHERE glr.user_id = $1
      AND glr.deleted_at IS NULL
    ORDER BY glr.created_at DESC
  `, [userId]);

  return result.rows;
};

/**
 * Get all pending requests (for admin/manager matching view)
 * Also includes student-organized group bookings so admins can see them
 */
export const getAllRequests = async ({ status = 'pending', serviceId, skillLevel } = {}) => {
  // 1) Fetch group lesson requests (solo students seeking partners)
  let reqQuery = `
    SELECT glr.*,
      s.name AS service_name,
      s.category AS service_category,
      u.name AS user_name,
      u.first_name, u.last_name, u.email AS user_email, u.phone,
      u.profile_image_url,
      u.weight, u.date_of_birth,
      'request' AS source
    FROM group_lesson_requests glr
    LEFT JOIN services s ON s.id = glr.service_id
    LEFT JOIN users u ON u.id = glr.user_id
    WHERE glr.deleted_at IS NULL
  `;
  const reqParams = [];
  let reqParamIndex = 1;

  if (status) {
    reqQuery += ` AND glr.status = $${reqParamIndex++}`;
    reqParams.push(status);
  }

  if (serviceId) {
    reqQuery += ` AND glr.service_id = $${reqParamIndex++}`;
    reqParams.push(serviceId);
  }

  if (skillLevel && skillLevel !== 'any') {
    reqQuery += ` AND (glr.skill_level = $${reqParamIndex++} OR glr.skill_level = 'any')`;
    reqParams.push(skillLevel);
  }

  reqQuery += ' ORDER BY glr.preferred_date_start ASC, glr.created_at ASC';

  // 2) Fetch student-organized group bookings
  // Only include group bookings that have an actual calendar booking (booking_id IS NOT NULL).
  // Filter by the LINKED BOOKING status (b.status) so the result exactly matches what is
  // visible in the calendar, regardless of what gb.status says.
  let bookingStatusesForGb;
  if (!status || status === '') {
    bookingStatusesForGb = ['pending', 'pending_partner', 'confirmed', 'cancelled', 'completed', 'no_show'];
  } else if (status === 'pending') {
    bookingStatusesForGb = ['pending', 'pending_partner'];
  } else if (status === 'pending_partner') {
    bookingStatusesForGb = ['pending_partner'];
  } else if (status === 'confirmed' || status === 'matched') {
    bookingStatusesForGb = ['confirmed'];
  } else if (status === 'cancelled' || status === 'expired') {
    bookingStatusesForGb = ['cancelled'];
  } else {
    bookingStatusesForGb = [status];
  }

  let gbQuery = `
    SELECT
      gb.id, gb.organizer_id AS user_id, gb.service_id,
      gb.booking_id AS calendar_booking_id,
      gb.scheduled_date AS preferred_date_start,
      NULL AS preferred_date_end,
      gb.start_time AS preferred_time_of_day,
      gb.duration_hours AS preferred_duration_hours,
      NULL AS skill_level,
      gb.notes, b.status, gb.created_at, gb.updated_at,
      gb.title, gb.price_per_person, gb.max_participants, gb.currency,
      s.name AS service_name,
      s.category AS service_category,
      u.name AS user_name,
      u.first_name, u.last_name, u.email AS user_email, u.phone,
      u.profile_image_url,
      COALESCE(inst.name, CONCAT(inst.first_name, ' ', inst.last_name)) AS instructor_name,
      'group_booking' AS source,
      (SELECT COUNT(*) FROM group_booking_participants p WHERE p.group_booking_id = gb.id) AS participant_count,
      (SELECT COALESCE(json_agg(json_build_object(
        'name', COALESCE(NULLIF(TRIM(pu.name), ''), NULLIF(TRIM(CONCAT(pu.first_name, ' ', pu.last_name)), ''), NULLIF(TRIM(p2.full_name), ''), p2.email),
        'payment_status', p2.payment_status,
        'status', p2.status,
        'is_organizer', p2.is_organizer
      ) ORDER BY p2.is_organizer DESC, p2.created_at ASC), '[]'::json)
      FROM group_booking_participants p2
      LEFT JOIN users pu ON pu.id = p2.user_id
      WHERE p2.group_booking_id = gb.id) AS participants
    FROM group_bookings gb
    LEFT JOIN services s ON s.id = gb.service_id
    LEFT JOIN users u ON u.id = gb.organizer_id
    LEFT JOIN users inst ON inst.id = gb.instructor_id
    INNER JOIN bookings b ON b.id = gb.booking_id AND b.deleted_at IS NULL
    WHERE b.status = ANY($1::text[])
  `;
  const gbParams = [bookingStatusesForGb];
  let gbParamIndex = 2;

  if (serviceId) {
    gbQuery += ` AND gb.service_id = $${gbParamIndex++}`;
    gbParams.push(serviceId);
  }

  gbQuery += ' ORDER BY gb.scheduled_date ASC, gb.created_at ASC';

  // 3) Fetch pending lesson bookings from the bookings table
  // Map request statuses to booking statuses
  let bookingStatuses;
  if (!status || status === '') {
    // "All statuses" — show all non-deleted bookings
    bookingStatuses = ['pending', 'pending_partner', 'confirmed', 'cancelled', 'completed', 'no_show'];
  } else if (status === 'pending') {
    bookingStatuses = ['pending', 'pending_partner'];
  } else if (status === 'pending_partner') {
    bookingStatuses = ['pending_partner'];
  } else if (status === 'confirmed' || status === 'matched') {
    bookingStatuses = ['confirmed'];
  } else if (status === 'cancelled') {
    bookingStatuses = ['cancelled'];
  } else {
    bookingStatuses = [status];
  }

  let bkQuery = `
    SELECT
      b.id, b.customer_user_id AS user_id, b.service_id,
      b.date AS preferred_date_start,
      NULL AS preferred_date_end,
      CASE WHEN b.start_hour IS NOT NULL
        THEN LPAD(FLOOR(b.start_hour)::text, 2, '0') || ':' || LPAD((((b.start_hour - FLOOR(b.start_hour)) * 60)::int)::text, 2, '0')
        ELSE NULL END AS preferred_time_of_day,
      b.duration AS preferred_duration_hours,
      NULL AS skill_level,
      b.notes, b.status, b.created_at, b.updated_at,
      NULL AS title,
      b.final_amount AS price_per_person,
      b.group_size AS max_participants,
      b.currency,
      s.name AS service_name,
      s.category AS service_category,
      COALESCE(NULLIF(TRIM(cu.name), ''), TRIM(CONCAT(cu.first_name, ' ', cu.last_name))) AS user_name,
      cu.first_name, cu.last_name, cu.email AS user_email, cu.phone,
      cu.profile_image_url,
      COALESCE(NULLIF(TRIM(inst.name), ''), TRIM(CONCAT(inst.first_name, ' ', inst.last_name))) AS instructor_name,
      b.payment_status,
      b.payment_method,
      'lesson_booking' AS source
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    LEFT JOIN users cu ON cu.id = b.customer_user_id
    LEFT JOIN users inst ON inst.id = b.instructor_user_id
    WHERE b.deleted_at IS NULL
      AND b.status = ANY($1::text[])
  `;
  const bkParams = [bookingStatuses];
  let bkParamIndex = 2;

  if (serviceId) {
    bkQuery += ` AND b.service_id = $${bkParamIndex++}`;
    bkParams.push(serviceId);
  }

  bkQuery += ' ORDER BY b.date ASC, b.created_at ASC';

  const [reqResult, gbResult, bkResult] = await Promise.all([
    pool.query(reqQuery, reqParams),
    pool.query(gbQuery, gbParams),
    pool.query(bkQuery, bkParams)
  ]);

  // Merge and sort by created_at descending (newest first)
  const combined = [...reqResult.rows, ...gbResult.rows, ...bkResult.rows];
  combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return combined;
};

/**
 * Cancel a request (by the student)
 */
export const cancelRequest = async (requestId, userId) => {
  const result = await pool.query(`
    UPDATE group_lesson_requests
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1 AND user_id = $2 AND status = 'pending' AND deleted_at IS NULL
    RETURNING *
  `, [requestId, userId]);

  if (result.rows.length === 0) {
    throw new Error('Request not found or already processed');
  }

  return result.rows[0];
};

/**
 * Admin cancel a request
 */
export const adminCancelRequest = async (requestId) => {
  const result = await pool.query(`
    UPDATE group_lesson_requests
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1 AND status = 'pending' AND deleted_at IS NULL
    RETURNING *
  `, [requestId]);

  if (result.rows.length === 0) {
    throw new Error('Request not found or already processed');
  }

  return result.rows[0];
};

/**
 * Match multiple requests together into a group booking
 * 
 * This is the core matching operation used by admin/manager:
 * 1. Validates all request IDs exist and are pending
 * 2. Creates a group booking with those students as participants
 * 3. Marks all requests as matched
 * 4. Returns the created group booking
 */
export const matchRequests = async ({
  requestIds,
  matchedBy,
  // Group booking config (admin can override)
  title,
  instructorId,
  scheduledDate,
  startTime,
  durationHours = 1,
  pricePerPerson,
  currency = 'EUR',
  notes
}) => {
  if (!requestIds || requestIds.length < 2) {
    throw new Error('At least 2 requests are required to create a group');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch all requests and validate
    const requestsResult = await client.query(`
      SELECT glr.*, u.first_name, u.last_name, u.email
      FROM group_lesson_requests glr
      LEFT JOIN users u ON u.id = glr.user_id
      WHERE glr.id = ANY($1)
        AND glr.status = 'pending'
        AND glr.deleted_at IS NULL
    `, [requestIds]);

    if (requestsResult.rows.length !== requestIds.length) {
      const foundIds = requestsResult.rows.map(r => r.id);
      const missing = requestIds.filter(id => !foundIds.includes(id));
      throw new Error(`Some requests are not available for matching: ${missing.join(', ')}`);
    }

    const requests = requestsResult.rows;

    // All requests must be for the same service
    const serviceIds = [...new Set(requests.map(r => r.service_id))];
    if (serviceIds.length > 1) {
      throw new Error('All requests must be for the same lesson type');
    }

    const serviceId = serviceIds[0];

    // Use provided values or derive from requests
    const finalDate = scheduledDate || requests[0].preferred_date_start;
    const finalDuration = durationHours || requests[0].preferred_duration_hours || 1;
    const participantCount = requests.length;

    // Fetch service for default pricing if not provided
    let finalPrice = pricePerPerson;
    if (!finalPrice) {
      const serviceResult = await client.query(
        'SELECT base_price, price FROM services WHERE id = $1',
        [serviceId]
      );
      if (serviceResult.rows.length > 0) {
        finalPrice = parseFloat(serviceResult.rows[0].base_price || serviceResult.rows[0].price || 0);
      }
    }

    // 2. Create the group booking (first matched student becomes nominal organizer)
    const primaryUserId = requests[0].user_id;
    const otherUserIds = requests.slice(1).map(r => r.user_id);
    
    const groupBooking = await createGroupBooking({
      organizerId: primaryUserId,
      serviceId,
      instructorId: instructorId || null,
      title: title || `Group Lesson — ${requests.map(r => r.first_name || 'Student').join(' & ')}`,
      description: `Matched group lesson with ${participantCount} participants`,
      maxParticipants: Math.max(participantCount, 2),
      minParticipants: 2,
      pricePerPerson: finalPrice || 0,
      currency: currency || 'EUR',
      scheduledDate: finalDate,
      startTime: startTime || '09:00',
      endTime: null,
      durationHours: finalDuration,
      notes: notes || 'Created by matching group lesson requests',
      createdBy: matchedBy,
      paymentModel: 'individual', // Each matched student pays individually
    });

    const groupBookingId = groupBooking.id;

    // 3. Add the remaining users as participants
    if (otherUserIds.length > 0) {
      await addParticipantsByUserIds(groupBookingId, primaryUserId, otherUserIds);
    }

    // 3. Mark all requests as matched
    await client.query(`
      UPDATE group_lesson_requests
      SET status = 'matched',
          matched_group_booking_id = $1,
          matched_at = NOW(),
          matched_by = $2,
          updated_at = NOW()
      WHERE id = ANY($3)
    `, [groupBookingId, matchedBy, requestIds]);

    await client.query('COMMIT');

    logger.info('Group lesson requests matched', {
      requestIds,
      groupBookingId,
      matchedBy,
      participantCount
    });

    return {
      groupBooking,
      matchedRequests: requests.map(r => ({
        id: r.id,
        userId: r.user_id,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        email: r.email
      }))
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to match group lesson requests', { error: error.message, requestIds });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get a single request by ID
 */
export const getRequestById = async (requestId) => {
  const result = await pool.query(`
    SELECT glr.*,
      s.name AS service_name,
      u.first_name, u.last_name, u.email
    FROM group_lesson_requests glr
    LEFT JOIN services s ON s.id = glr.service_id
    LEFT JOIN users u ON u.id = glr.user_id
    WHERE glr.id = $1 AND glr.deleted_at IS NULL
  `, [requestId]);

  return result.rows[0] || null;
};

/**
 * Expire old pending requests (can be called by a scheduled job)
 */
export const expirePendingRequests = async (daysOld = 30) => {
  const result = await pool.query(`
    UPDATE group_lesson_requests
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending'
      AND deleted_at IS NULL
      AND preferred_date_end < NOW() - INTERVAL '1 day'
      OR (preferred_date_end IS NULL AND preferred_date_start < NOW() - make_interval(days => $1))
    RETURNING id
  `, [daysOld]);

  if (result.rows.length > 0) {
    logger.info(`Expired ${result.rows.length} old group lesson requests`);
  }

  return result.rows.length;
};
