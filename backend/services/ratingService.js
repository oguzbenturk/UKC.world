import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { insertNotification } from './notificationWriter.js';
import bookingNotificationService from './bookingNotificationService.js';

const ALLOWED_SERVICE_TYPES = new Set(['lesson', 'rental', 'accommodation']);

const ensureUuid = (value, fieldName) => {
  if (!value || typeof value !== 'string') {
    const error = new Error(`${fieldName} is required`);
    error.status = 400;
    throw error;
  }
};

const toSafeInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
};

const toIsoString = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch (error) {
    return null;
  }
};

const sanitizeRatingValue = (rating) => {
  const parsed = Number(rating);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
    const error = new Error('rating must be between 1 and 5');
    error.status = 400;
    throw error;
  }
  return Math.round(parsed);
};

const toNormalizedDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const toTimeLabel = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const totalMinutes = Math.round(numeric * 60);
  if (!Number.isFinite(totalMinutes)) {
    return null;
  }

  const minutesInDay = 24 * 60;
  const normalizedMinutes = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const resolveLessonTiming = (lessonDate, lessonStartHour, lessonDurationHours) => {
  const baseDate = toNormalizedDate(lessonDate);
  if (!baseDate) {
    return { start: null, end: null };
  }

  const lessonStart = (() => {
    const numericStart = Number(lessonStartHour);
    if (!Number.isFinite(numericStart)) {
      return new Date(baseDate);
    }

    const startOfDayUtc = new Date(Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate()
    ));

    return new Date(startOfDayUtc.getTime() + numericStart * 3600 * 1000);
  })();

  const duration = Number(lessonDurationHours);
  const lessonEnd = Number.isFinite(duration) && duration > 0
    ? new Date(lessonStart.getTime() + duration * 3600 * 1000)
    : lessonStart;

  return { start: lessonStart, end: lessonEnd };
};

export async function hasRatingForBooking(bookingId) {
  ensureUuid(bookingId, 'bookingId');
  const { rows } = await pool.query(
    `SELECT 1 FROM instructor_ratings WHERE booking_id = $1 LIMIT 1`,
    [bookingId]
  );
  return rows.length > 0;
}

export async function createRating({ bookingId, studentId, rating, feedbackText, isAnonymous = false, serviceType = 'lesson', metadata = {} }) {
  ensureUuid(bookingId, 'bookingId');
  ensureUuid(studentId, 'studentId');
  const ratingValue = sanitizeRatingValue(rating);
  const normalizedServiceType = ALLOWED_SERVICE_TYPES.has((serviceType || '').toLowerCase())
    ? (serviceType || '').toLowerCase()
    : 'lesson';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT b.id,
              b.student_user_id,
              b.customer_user_id,
              b.instructor_user_id,
              b.status,
              b.service_id,
              b.date,
              b.start_hour,
              b.duration
         FROM bookings b
        WHERE b.id = $1
          AND b.deleted_at IS NULL
        LIMIT 1`,
      [bookingId]
    );

    if (!bookingRes.rows.length) {
      const error = new Error('Booking not found');
      error.status = 404;
      throw error;
    }

    const booking = bookingRes.rows[0];

    if (![booking.student_user_id, booking.customer_user_id].includes(studentId)) {
      const error = new Error('You are not allowed to rate this booking');
      error.status = 403;
      throw error;
    }

    if (!booking.instructor_user_id) {
      const error = new Error('Booking has no instructor assigned');
      error.status = 400;
      throw error;
    }

    const bookingStatus = (booking.status || '').toLowerCase();
    if (bookingStatus && !['completed', 'checked_out', 'done'].includes(bookingStatus)) {
      const error = new Error('Lesson is not completed yet');
      error.status = 409;
      throw error;
    }

    const existingRatingRes = await client.query(
      `SELECT id FROM instructor_ratings WHERE booking_id = $1 LIMIT 1`,
      [bookingId]
    );

    if (existingRatingRes.rows.length) {
      const error = new Error('Lesson already rated');
      error.status = 409;
      throw error;
    }

    const insertRes = await client.query(
      `INSERT INTO instructor_ratings (
         booking_id,
         student_id,
         instructor_id,
         service_type,
         rating,
         feedback_text,
         is_anonymous,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::text, $7, $8::jsonb)
       RETURNING id, created_at, updated_at` ,
      [
        bookingId,
        studentId,
        booking.instructor_user_id,
        normalizedServiceType,
        ratingValue,
        feedbackText,
        Boolean(isAnonymous),
        JSON.stringify(metadata || {})
      ]
    );

    await client.query(
      `DELETE FROM notifications
        WHERE user_id = $1
          AND type = 'rating_request'
          AND data ->> 'bookingId' = $2`,
      [studentId, bookingId]
    );

    await client.query('COMMIT');

    const ratingId = insertRes.rows[0].id;

    setImmediate(async () => {
      try {
        await bookingNotificationService.sendInstructorRatedNotification({ ratingId });
      } catch (notificationError) {
        logger.warn('Failed to send instructor rating notification', {
          bookingId,
          ratingId,
          instructorId: booking.instructor_user_id,
          error: notificationError?.message || notificationError
        });
      }
    });

    return {
      id: ratingId,
      bookingId,
      instructorId: booking.instructor_user_id,
      studentId,
      rating: ratingValue,
      feedbackText: feedbackText || null,
      isAnonymous: Boolean(isAnonymous),
      serviceType: normalizedServiceType,
      metadata: metadata || {},
      createdAt: toIsoString(insertRes.rows[0].created_at),
      updatedAt: toIsoString(insertRes.rows[0].updated_at)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getInstructorRatings(instructorId, { serviceType, limit = 100, offset = 0 } = {}) {
  ensureUuid(instructorId, 'instructorId');
  const limitValue = Math.max(1, Math.min(toSafeInteger(limit, 100), 500));
  const offsetValue = Math.max(0, toSafeInteger(offset, 0));

  const params = [instructorId];
  const conditions = ['r.instructor_id = $1'];

  const normalizedServiceType = serviceType ? String(serviceType).toLowerCase() : undefined;
  const effectiveServiceType = normalizedServiceType && normalizedServiceType !== 'all' && ALLOWED_SERVICE_TYPES.has(normalizedServiceType)
    ? normalizedServiceType
    : undefined;

  if (effectiveServiceType) {
    params.push(effectiveServiceType);
    conditions.push(`r.service_type = $${params.length}`);
  }

  params.push(limitValue);
  params.push(offsetValue);

  const { rows } = await pool.query(
    `SELECT r.id,
            r.booking_id,
            r.student_id,
            r.service_type,
            r.rating,
            r.feedback_text,
            r.is_anonymous,
            r.metadata,
            r.created_at,
            r.updated_at,
            u.name AS student_name
       FROM instructor_ratings r
  LEFT JOIN users u ON u.id = r.student_id
      WHERE ${conditions.join(' AND ')}
   ORDER BY r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    studentId: row.student_id,
    studentName: row.is_anonymous ? 'Anonymous student' : (row.student_name || null),
    serviceType: row.service_type,
    rating: Number(row.rating) || 0,
    feedbackText: row.feedback_text || null,
    isAnonymous: row.is_anonymous,
  metadata: row.metadata || {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  }));
}

export async function getInstructorAverageRating(instructorId, { serviceType } = {}) {
  ensureUuid(instructorId, 'instructorId');
  const params = [instructorId];
  const conditions = ['instructor_id = $1'];

  const normalizedServiceType = serviceType ? String(serviceType).toLowerCase() : undefined;
  const effectiveServiceType = normalizedServiceType && normalizedServiceType !== 'all' && ALLOWED_SERVICE_TYPES.has(normalizedServiceType)
    ? normalizedServiceType
    : undefined;

  if (effectiveServiceType) {
    params.push(effectiveServiceType);
    conditions.push(`service_type = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT COALESCE(AVG(rating), 0) AS average_rating,
            COUNT(*) AS rating_count
       FROM instructor_ratings
      WHERE ${conditions.join(' AND ')}`,
    params
  );

  return {
    instructorId,
    averageRating: Number(rows[0]?.average_rating) || 0,
    ratingCount: Number(rows[0]?.rating_count) || 0,
    serviceType: effectiveServiceType || 'all'
  };
}

export async function getInstructorRatingStats(instructorId, { serviceType } = {}) {
  ensureUuid(instructorId, 'instructorId');
  const params = [instructorId];
  const conditions = ['instructor_id = $1'];

  const normalizedServiceType = serviceType ? String(serviceType).toLowerCase() : undefined;
  const effectiveServiceType = normalizedServiceType && normalizedServiceType !== 'all' && ALLOWED_SERVICE_TYPES.has(normalizedServiceType)
    ? normalizedServiceType
    : undefined;

  if (effectiveServiceType) {
    params.push(effectiveServiceType);
    conditions.push(`service_type = $${params.length}`);
  }

  const { rows } = await pool.query(
    `WITH data AS (
        SELECT rating
          FROM instructor_ratings
         WHERE ${conditions.join(' AND ')}
      )
      SELECT COALESCE(AVG(rating), 0) AS average_rating,
             COUNT(*) AS total_ratings,
             COUNT(*) FILTER (WHERE rating = 5) AS stars_5,
             COUNT(*) FILTER (WHERE rating = 4) AS stars_4,
             COUNT(*) FILTER (WHERE rating = 3) AS stars_3,
             COUNT(*) FILTER (WHERE rating = 2) AS stars_2,
             COUNT(*) FILTER (WHERE rating = 1) AS stars_1
        FROM data;`,
    params
  );

  const result = rows[0] || {};
  return {
    instructorId,
    averageRating: Number(result.average_rating) || 0,
    totalRatings: Number(result.total_ratings) || 0,
    distribution: {
      5: Number(result.stars_5) || 0,
      4: Number(result.stars_4) || 0,
      3: Number(result.stars_3) || 0,
      2: Number(result.stars_2) || 0,
      1: Number(result.stars_1) || 0
    },
    serviceType: effectiveServiceType || 'all'
  };
}

export async function getUnratedBookings(studentId, { limit = 20 } = {}) {
  ensureUuid(studentId, 'studentId');
  const limitValue = Math.max(1, Math.min(toSafeInteger(limit, 50), 100));

  const { rows } = await pool.query(
    `SELECT b.id,
            b.date,
            b.start_hour,
            b.duration,
            b.status,
            b.instructor_user_id,
            COALESCE(i.name, CONCAT(COALESCE(i.first_name,''),' ',COALESCE(i.last_name,''))) AS instructor_name,
            i.profile_image_url AS instructor_avatar,
            b.service_id,
            s.name AS service_name,
            s.service_type,
            ir.id AS rating_id
       FROM bookings b
  LEFT JOIN users i ON i.id = b.instructor_user_id
  LEFT JOIN services s ON s.id = b.service_id
  LEFT JOIN instructor_ratings ir ON ir.booking_id = b.id
      WHERE (b.student_user_id = $1 OR b.customer_user_id = $1)
        AND b.deleted_at IS NULL
        AND ir.id IS NULL
        AND (b.status IS NULL OR LOWER(b.status) IN ('completed','checked_out','done'))
        AND (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) < NOW()
   ORDER BY b.date DESC, b.start_hour DESC
      LIMIT $2`,
    [studentId, limitValue]
  );

  return rows.map((row) => {
    const dateValue = row.date ? new Date(row.date) : null;
    const startTs = dateValue
      ? new Date(Date.UTC(dateValue.getUTCFullYear(), dateValue.getUTCMonth(), dateValue.getUTCDate()))
      : null;
    const startTime = Number(row.start_hour);
    const startDateTime = startTs && Number.isFinite(startTime)
      ? new Date(startTs.getTime() + startTime * 3600 * 1000)
      : null;

    return {
      bookingId: row.id,
      instructor: row.instructor_user_id
        ? {
            id: row.instructor_user_id,
            name: (row.instructor_name || '').trim() || 'Instructor',
            avatar: row.instructor_avatar || null
          }
        : null,
      service: row.service_id
        ? {
            id: row.service_id,
            name: row.service_name || 'Lesson',
            type: row.service_type || 'lesson'
          }
        : null,
      status: row.status || 'completed',
      completedAt: startDateTime ? startDateTime.toISOString() : null,
      date: dateValue ? dateValue.toISOString().split('T')[0] : null
    };
  });
}

export async function getInstructorRatingOverview({
  serviceType,
  limit = 50,
  offset = 0,
  sortBy = 'average'
} = {}) {
  const normalizedServiceType = serviceType ? String(serviceType).toLowerCase() : undefined;
  const effectiveServiceType = normalizedServiceType && normalizedServiceType !== 'all' && ALLOWED_SERVICE_TYPES.has(normalizedServiceType)
    ? normalizedServiceType
    : null;

  const params = [];
  const conditions = [];

  if (effectiveServiceType) {
    params.push(effectiveServiceType);
    conditions.push(`r.service_type = $${params.length}`);
  }

  params.push(Math.max(1, Math.min(toSafeInteger(limit, 50), 200)));
  params.push(Math.max(0, toSafeInteger(offset, 0)));

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortColumn = (() => {
    switch ((sortBy || '').toLowerCase()) {
      case 'count':
        return 'total_ratings DESC, average_rating DESC';
      case 'recent':
        return 'last_rating_at DESC NULLS LAST';
      default:
        return 'average_rating DESC, total_ratings DESC';
    }
  })();

  const { rows } = await pool.query(
    `SELECT r.instructor_id,
            COALESCE(u.name, CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS instructor_name,
            u.profile_image_url AS instructor_avatar,
            COUNT(*) AS total_ratings,
            COALESCE(AVG(r.rating), 0)::numeric(10,2) AS average_rating,
            MAX(r.created_at) AS last_rating_at,
            COUNT(*) FILTER (WHERE r.rating = 5) AS stars_5,
            COUNT(*) FILTER (WHERE r.rating = 4) AS stars_4,
            COUNT(*) FILTER (WHERE r.rating = 3) AS stars_3,
            COUNT(*) FILTER (WHERE r.rating = 2) AS stars_2,
            COUNT(*) FILTER (WHERE r.rating = 1) AS stars_1,
            COUNT(*) FILTER (WHERE r.service_type = 'lesson') AS lesson_ratings,
            COALESCE(AVG(r.rating) FILTER (WHERE r.service_type = 'lesson'), 0)::numeric(10,2) AS lesson_average,
            COUNT(*) FILTER (WHERE r.service_type = 'rental') AS rental_ratings,
            COALESCE(AVG(r.rating) FILTER (WHERE r.service_type = 'rental'), 0)::numeric(10,2) AS rental_average,
            COUNT(*) FILTER (WHERE r.service_type = 'accommodation') AS accommodation_ratings,
            COALESCE(AVG(r.rating) FILTER (WHERE r.service_type = 'accommodation'), 0)::numeric(10,2) AS accommodation_average
       FROM instructor_ratings r
  LEFT JOIN users u ON u.id = r.instructor_id
      ${whereClause}
   GROUP BY r.instructor_id, instructor_name, instructor_avatar
   ORDER BY ${sortColumn}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows.map((row) => ({
    instructorId: row.instructor_id,
    instructorName: (row.instructor_name || '').trim() || 'Instructor',
    instructorAvatar: row.instructor_avatar || null,
    averageRating: Number(row.average_rating) || 0,
    totalRatings: Number(row.total_ratings) || 0,
    lastRatingAt: toIsoString(row.last_rating_at),
    distribution: {
      5: Number(row.stars_5) || 0,
      4: Number(row.stars_4) || 0,
      3: Number(row.stars_3) || 0,
      2: Number(row.stars_2) || 0,
      1: Number(row.stars_1) || 0
    },
    breakdown: {
      lesson: {
        count: Number(row.lesson_ratings) || 0,
        average: Number(row.lesson_average) || 0
      },
      rental: {
        count: Number(row.rental_ratings) || 0,
        average: Number(row.rental_average) || 0
      },
      accommodation: {
        count: Number(row.accommodation_ratings) || 0,
        average: Number(row.accommodation_average) || 0
      }
    }
  }));
}

export async function queueRatingReminder({
  bookingId,
  studentId,
  instructorId,
  instructorName,
  instructorAvatar = null,
  serviceId = null,
  serviceName = null,
  serviceType = 'lesson',
  lessonDate,
  lessonStartHour,
  lessonDurationHours
}) {
  try {
    ensureUuid(bookingId, 'bookingId');
    ensureUuid(studentId, 'studentId');
    if (instructorId) {
      ensureUuid(instructorId, 'instructorId');
    }

    const normalizedServiceType = ALLOWED_SERVICE_TYPES.has((serviceType || '').toLowerCase())
      ? (serviceType || '').toLowerCase()
      : 'lesson';

    const normalizedServiceName = typeof serviceName === 'string' && serviceName.trim().length
      ? serviceName.trim()
      : null;
    const normalizedDuration = Number(lessonDurationHours);
    const effectiveDuration = Number.isFinite(normalizedDuration) && normalizedDuration >= 0
      ? normalizedDuration
      : null;
    const startTimeLabel = toTimeLabel(lessonStartHour);

    const ratingContext = {
      bookingId,
      date: lessonDate || null,
      startTime: startTimeLabel,
      durationHours: effectiveDuration,
      instructor: instructorId
        ? {
            id: instructorId,
            name: instructorName || 'Instructor',
            avatar: instructorAvatar || null
          }
        : null,
      service: serviceId
        ? {
            id: serviceId,
            name: normalizedServiceName || null,
            type: normalizedServiceType
          }
        : normalizedServiceName
          ? {
              id: null,
              name: normalizedServiceName,
              type: normalizedServiceType
            }
          : null
    };

    const serviceLabel = normalizedServiceName || normalizedServiceType;
    const ctaHref = `/student/dashboard?rateBooking=${bookingId}`;

    const { end: lessonEnd } = resolveLessonTiming(
      lessonDate,
      lessonStartHour,
      lessonDurationHours
    );

    if (lessonEnd && lessonEnd.getTime() > Date.now()) {
      return { queued: false, reason: 'lesson-not-finished' };
    }

    const alreadyRated = await hasRatingForBooking(bookingId);
    if (alreadyRated) {
      return { queued: false, reason: 'already-rated' };
    }

    const title = 'Rate your instructor';
    const message = instructorName
      ? `How was your recent ${serviceLabel} with ${instructorName}?`
      : `How was your recent ${serviceLabel}? We'd love your feedback.`;

    const notificationData = {
      bookingId,
      instructorId: instructorId || null,
      instructorName: instructorName || null,
      instructorAvatar: instructorAvatar || null,
      serviceId: serviceId || null,
      serviceName: normalizedServiceName,
      serviceType: normalizedServiceType,
      lessonDate: lessonDate || null,
      startTime: startTimeLabel,
      durationHours: effectiveDuration,
      intent: 'rate_lesson',
      ratingContext,
      source: 'rating_reminder',
      cta: {
        label: 'Rate lesson',
        href: ctaHref
      }
    };

    const idempotencyKey = `rating-request:${bookingId}:student:${studentId}`;

    const insertResult = await insertNotification({
      userId: studentId,
      title,
      message,
      type: 'rating_request',
      data: notificationData,
      idempotencyKey
    });

    if (!insertResult.inserted) {
      const refreshResult = await pool.query(
        `UPDATE notifications
            SET read_at = NULL,
                status = 'sent',
                title = $2,
                message = $3,
                data = $4::jsonb,
                updated_at = NOW()
          WHERE user_id = $1
            AND idempotency_key = $5
        RETURNING id`,
        [studentId, title, message, JSON.stringify(notificationData), idempotencyKey]
      );

      if (refreshResult.rowCount > 0) {
        return { queued: true, reason: 'refreshed' };
      }

      return { queued: false, reason: 'already-queued' };
    }

    return { queued: true };
  } catch (error) {
    logger.warn('Failed to queue rating reminder', {
      bookingId,
      studentId,
      error: error.message
    });
    return { queued: false, reason: 'error', error: error.message };
  }
}
