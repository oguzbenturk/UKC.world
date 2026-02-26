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
 */
export const getAllRequests = async ({ status = 'pending', serviceId, skillLevel } = {}) => {
  let query = `
    SELECT glr.*,
      s.name AS service_name,
      s.category AS service_category,
      u.first_name, u.last_name, u.email, u.phone,
      u.profile_image_url
    FROM group_lesson_requests glr
    LEFT JOIN services s ON s.id = glr.service_id
    LEFT JOIN users u ON u.id = glr.user_id
    WHERE glr.deleted_at IS NULL
  `;
  const params = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND glr.status = $${paramIndex++}`;
    params.push(status);
  }

  if (serviceId) {
    query += ` AND glr.service_id = $${paramIndex++}`;
    params.push(serviceId);
  }

  if (skillLevel && skillLevel !== 'any') {
    query += ` AND (glr.skill_level = $${paramIndex++} OR glr.skill_level = 'any')`;
    params.push(skillLevel);
  }

  query += ' ORDER BY glr.preferred_date_start ASC, glr.created_at ASC';

  const result = await pool.query(query, params);
  return result.rows;
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
