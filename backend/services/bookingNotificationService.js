import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import notificationDispatcher from './notificationDispatcher.js';
import notificationMetrics from './metrics/notificationMetrics.js';
import { insertNotification } from './notificationWriter.js';

const RATE_LESSON_INTENT = 'rate_lesson';
const VIEW_RATING_INTENT = 'view_lesson_rating';

const DEFAULT_MAX_ATTEMPTS = Number.parseInt(process.env.NOTIFICATION_MAX_ATTEMPTS ?? '4', 10) || 4;
const DEFAULT_RETRY_DELAY_MS = Number.parseInt(process.env.NOTIFICATION_RETRY_DELAY_MS ?? '2000', 10) || 2000;
const DEFAULT_RETRY_MAX_DELAY_MS = Number.parseInt(
  process.env.NOTIFICATION_RETRY_MAX_DELAY_MS ?? '60000',
  10
) || 60000;

const toIsoDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    if (value.length >= 10) {
      return value.slice(0, 10);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
};

const formatDateLabel = (isoDate) => {
  if (!isoDate) {
    return 'upcoming date';
  }

  try {
    // Parse as local date without timezone conversion
    // isoDate format is YYYY-MM-DD (e.g., "2025-01-21")
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    logger.warn('Failed to format date label for notification', { isoDate, error: error.message });
    return isoDate;
  }
};

const formatTimeLabel = (startHour) => {
  if (startHour === null || startHour === undefined || Number.isNaN(Number(startHour))) {
    return 'TBD';
  }

  const numeric = Number(startHour);
  const hours = Math.floor(numeric);
  const minutes = Math.round((numeric - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatDurationLabel = (durationHours) => {
  if (typeof durationHours !== 'number' || Number.isNaN(durationHours) || durationHours <= 0) {
    return null;
  }

  const rounded = Number.isInteger(durationHours) ? durationHours : Number(durationHours.toFixed(1));

  if (rounded === 1) {
    return '1 hour';
  }

  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display} hours`;
};

const normalizeServiceLabel = (serviceName) => {
  if (!serviceName) {
    return 'your lesson';
  }

  const trimmed = String(serviceName).trim();
  return trimmed.length ? trimmed : 'your lesson';
};

const buildBookingContext = (booking, participantsRows) => {
  const isoDate = toIsoDate(booking.date);
  const dateLabel = formatDateLabel(isoDate);
  const timeLabel = formatTimeLabel(booking.start_hour);
  const serviceName = booking.service_name || 'Lesson';
  const packageName = booking.package_name || null;
  const rawDurationHours = Number(booking.duration);
  const durationHours =
    Number.isFinite(rawDurationHours) && rawDurationHours > 0 ? rawDurationHours : null;
  const durationMinutes = typeof durationHours === 'number' ? Math.round(durationHours * 60) : null;

  const studentMap = new Map();

  participantsRows.forEach((participant) => {
    if (participant.user_id) {
      studentMap.set(participant.user_id, {
        id: participant.user_id,
        name: participant.name || 'Student',
        isPrimary: participant.is_primary || false
      });
    }
  });

  if (!studentMap.size && booking.student_id) {
    studentMap.set(booking.student_id, {
      id: booking.student_id,
      name: booking.student_name || 'Student',
      isPrimary: true
    });
  }

  const students = Array.from(studentMap.values());
  const instructor = booking.instructor_id
    ? { id: booking.instructor_id, name: booking.instructor_name || 'Instructor' }
    : null;

  return {
    booking,
    isoDate,
    dateLabel,
    timeLabel,
    serviceName,
    packageName,
    durationHours,
    durationMinutes,
    students,
    instructor
  };
};

const fetchBookingContexts = async (client, bookingIds) => {
  if (!Array.isArray(bookingIds) || !bookingIds.length) {
    return new Map();
  }

  const uniqueIds = [...new Set(bookingIds.filter(Boolean))];

  if (!uniqueIds.length) {
    return new Map();
  }

  const bookingQuery = await client.query(
    `SELECT 
       b.id,
       b.date,
       b.start_hour,
       b.duration,
       b.status,
       b.service_id,
       b.customer_package_id,
       b.created_by,
       s.id AS student_id,
       s.name AS student_name,
       i.id AS instructor_id,
       i.name AS instructor_name,
       srv.name AS service_name,
       cp.package_name
     FROM bookings b
     LEFT JOIN users s ON s.id = b.student_user_id
     LEFT JOIN users i ON i.id = b.instructor_user_id
     LEFT JOIN services srv ON srv.id = b.service_id
     LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
     WHERE b.id = ANY($1)`,
    [uniqueIds]
  );

  if (!bookingQuery.rows.length) {
    return new Map();
  }

  const participantsQuery = await client.query(
    `SELECT bp.booking_id, bp.user_id, bp.is_primary, u.name
       FROM booking_participants bp
       LEFT JOIN users u ON u.id = bp.user_id
      WHERE bp.booking_id = ANY($1)`,
    [uniqueIds]
  );

  const participantsByBookingId = new Map();

  participantsQuery.rows.forEach((participant) => {
    const list = participantsByBookingId.get(participant.booking_id) ?? [];
    list.push(participant);
    participantsByBookingId.set(participant.booking_id, list);
  });

  const contexts = new Map();

  bookingQuery.rows.forEach((bookingRow) => {
    contexts.set(
      bookingRow.id,
      buildBookingContext(bookingRow, participantsByBookingId.get(bookingRow.id) ?? [])
    );
  });

  return contexts;
};

const fetchBookingContext = async (client, bookingId) => {
  if (!bookingId) {
    return null;
  }

  const contextMap = await fetchBookingContexts(client, [bookingId]);
  return contextMap.get(bookingId) ?? null;
};

const buildStudentMessage = ({
  serviceName,
  instructorName,
  dateLabel,
  timeLabel,
  packageName
}) => {
  const base = `${serviceName || 'Lesson'} with ${instructorName || 'your instructor'} on ${dateLabel} at ${timeLabel}`;
  if (packageName) {
    return `${base}. Package: ${packageName}.`;
  }
  return `${base}.`;
};

const buildInstructorMessage = ({ serviceName, studentNames, dateLabel, timeLabel }) => {
  const studentLabel = studentNames.length ? studentNames.join(', ') : 'assigned student';
  return `${serviceName || 'Lesson'} with ${studentLabel} on ${dateLabel} at ${timeLabel}.`;
};

class BookingNotificationService {
  constructor(dispatcher = notificationDispatcher) {
    this.dispatcher = dispatcher;
    const env = process.env.NODE_ENV;
    this.queueEnabled = process.env.NOTIFICATION_QUEUE_DISABLED !== 'true' && env !== 'test';
    this.maxAttempts = DEFAULT_MAX_ATTEMPTS;
    this.retryDelayMs = DEFAULT_RETRY_DELAY_MS;
    this.maxRetryDelayMs = DEFAULT_RETRY_MAX_DELAY_MS;
  }

  configureQueue({
    enabled,
    maxAttempts,
    retryDelayMs,
    maxRetryDelayMs,
    dispatcher
  } = {}) {
    if (typeof enabled === 'boolean') {
      this.queueEnabled = enabled;
    }
    if (Number.isFinite(maxAttempts) && maxAttempts > 0) {
      this.maxAttempts = maxAttempts;
    }
    if (Number.isFinite(retryDelayMs) && retryDelayMs > 0) {
      this.retryDelayMs = retryDelayMs;
    }
    if (Number.isFinite(maxRetryDelayMs) && maxRetryDelayMs > 0) {
      this.maxRetryDelayMs = maxRetryDelayMs;
    }
    if (dispatcher) {
      this.dispatcher = dispatcher;
    }
  }

  async sendBookingCreated({ bookingId, immediate = false } = {}) {
    if (!bookingId) {
      return;
    }

    if (immediate || !this.queueEnabled) {
      try {
        await this._processBookingCreated({ bookingId });
      } catch (error) {
        // Already logged downstream; swallow to preserve legacy behavior.
      }
      return;
    }

    this._enqueueJob({
      type: 'booking-created',
      meta: { type: 'booking-created', bookingId },
      idempotencyKey: `booking-created:${bookingId}`,
      tenantKey: `booking:${bookingId}`,
      execute: () => this._processBookingCreated({ bookingId })
    });

    return Promise.resolve();
  }

  async sendLessonCompleted({ bookingId, bookingIds, immediate = false } = {}) {
    const normalizedIds = Array.isArray(bookingIds)
      ? bookingIds
      : Array.isArray(bookingId)
        ? bookingId
        : bookingId
          ? [bookingId]
          : [];

    return this.sendLessonCompletedBatch({ bookingIds: normalizedIds, immediate });
  }

  async sendLessonCompletedBatch({ bookingIds = [], immediate = false } = {}) {
    const normalizedIds = Array.from(new Set(bookingIds.filter(Boolean)));

    if (!normalizedIds.length) {
      return;
    }

    if (immediate || !this.queueEnabled) {
      try {
        await this._processLessonCompletedBatch({ bookingIds: normalizedIds });
      } catch (error) {
        // Already logged downstream; swallow to preserve legacy behavior.
      }
      return;
    }

    const sortedForKey = [...normalizedIds].sort();
    const idempotencyKey =
      normalizedIds.length === 1
        ? `lesson-completed:${normalizedIds[0]}`
        : `lesson-completed-batch:${sortedForKey.join(',')}`;
    const tenantKey = normalizedIds.length === 1 ? `booking:${normalizedIds[0]}` : undefined;

    this._enqueueJob({
      type: normalizedIds.length === 1 ? 'lesson-completed' : 'lesson-completed-batch',
      meta: { type: 'lesson-completed', bookingIds: normalizedIds },
      idempotencyKey,
      tenantKey,
      execute: () => this._processLessonCompletedBatch({ bookingIds: normalizedIds })
    });

    return Promise.resolve();
  }

  async sendInstructorRatedNotification({ ratingId, immediate = false } = {}) {
    if (!ratingId) {
      return;
    }

    if (immediate || !this.queueEnabled) {
      try {
        await this._processInstructorRatedNotification({ ratingId });
      } catch (error) {
        // Already logged downstream; swallow to preserve legacy behavior.
      }
      return;
    }

    this._enqueueJob({
      type: 'instructor-rated',
      meta: { type: 'instructor-rated', ratingId },
      idempotencyKey: `lesson-rating:${ratingId}`,
      tenantKey: `rating:${ratingId}`,
      execute: () => this._processInstructorRatedNotification({ ratingId })
    });

    return Promise.resolve();
  }

  async sendRescheduleRequest({ bookingId, studentId, newDate, newTime, reason, immediate = false } = {}) {
    if (!bookingId) {
      return;
    }

    if (immediate || !this.queueEnabled) {
      try {
        await this._processRescheduleRequest({ bookingId, studentId, newDate, newTime, reason });
      } catch (error) {
        // Already logged downstream; swallow to preserve legacy behavior.
      }
      return;
    }

    this._enqueueJob({
      type: 'reschedule-request',
      meta: { type: 'reschedule-request', bookingId, studentId },
      idempotencyKey: `reschedule-request:${bookingId}:${Date.now()}`,
      tenantKey: `booking:${bookingId}`,
      execute: () => this._processRescheduleRequest({ bookingId, studentId, newDate, newTime, reason })
    });

    return Promise.resolve();
  }

  async _processRescheduleRequest({ bookingId, studentId, newDate, newTime, reason }) {
    const client = await pool.connect();

    try {
      // Get booking details
      const bookingQuery = await client.query(
        `SELECT 
           b.id,
           b.date,
           b.start_hour,
           b.duration,
           s.id AS student_id,
           s.name AS student_name,
           i.id AS instructor_id,
           i.name AS instructor_name,
           srv.name AS service_name
         FROM bookings b
         LEFT JOIN users s ON s.id = b.student_user_id
         LEFT JOIN users i ON i.id = b.instructor_user_id
         LEFT JOIN services srv ON srv.id = b.service_id
         WHERE b.id = $1`,
        [bookingId]
      );

      if (!bookingQuery.rows.length) {
        logger.warn('Booking not found for reschedule notification', { bookingId });
        return;
      }

      const booking = bookingQuery.rows[0];
      const studentName = booking.student_name || 'A student';
      const serviceName = booking.service_name || 'Lesson';
      const instructorName = booking.instructor_name || 'TBD';
      const newDateLabel = formatDateLabel(newDate);
      const newTimeLabel = newTime || 'TBD';
      const originalDateLabel = formatDateLabel(toIsoDate(booking.date));
      const originalTimeLabel = formatTimeLabel(booking.start_hour);

      // Get all managers and admins
      const managersQuery = await client.query(
        `SELECT u.id, u.name 
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.name IN ('admin', 'manager', 'owner')
           AND u.status = 'active'
           AND u.deleted_at IS NULL`
      );

      const managers = managersQuery.rows;

      if (!managers.length) {
        logger.warn('No managers found for reschedule notification', { bookingId });
        return;
      }

      // Send notification to each manager
      const notificationData = {
        bookingId,
        type: 'reschedule_request',
        studentId: booking.student_id,
        studentName,
        serviceName,
        instructorId: booking.instructor_id,
        instructorName,
        originalDate: toIsoDate(booking.date),
        originalTime: originalTimeLabel,
        newDate,
        newTime: newTimeLabel,
        reason: reason || null,
        cta: {
          label: 'Review booking',
          href: `/bookings/calendar?view=daily&date=${newDate}&bookingId=${bookingId}`
        }
      };

      const message = reason 
        ? `${studentName} requested to reschedule their ${serviceName} from ${originalDateLabel} at ${originalTimeLabel} to ${newDateLabel} at ${newTimeLabel}. Reason: ${reason}`
        : `${studentName} requested to reschedule their ${serviceName} from ${originalDateLabel} at ${originalTimeLabel} to ${newDateLabel} at ${newTimeLabel}.`;

      await Promise.all(
        managers.map((manager) =>
          insertNotification({
            client,
            userId: manager.id,
            title: `Reschedule request: ${serviceName}`,
            message,
            type: 'reschedule_request',
            data: notificationData,
            idempotencyKey: `reschedule-request:${bookingId}:manager:${manager.id}:${Date.now()}`
          })
        )
      );

      // Also notify the instructor
      if (booking.instructor_id) {
        const instructorMessage = `${studentName} rescheduled their ${serviceName} to ${newDateLabel} at ${newTimeLabel}.`;
        await insertNotification({
          client,
          userId: booking.instructor_id,
          title: `Lesson rescheduled: ${serviceName}`,
          message: instructorMessage,
          type: 'booking_rescheduled',
          data: notificationData,
          idempotencyKey: `reschedule-request:${bookingId}:instructor:${booking.instructor_id}:${Date.now()}`
        });
      }

      logger.info('Reschedule request notifications sent', { 
        bookingId, 
        managersNotified: managers.length,
        instructorNotified: !!booking.instructor_id 
      });
    } catch (error) {
      logger.error('Failed to send reschedule notifications', { bookingId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  async _processBookingCreated({ bookingId }) {
    const client = await pool.connect();

    try {
      const context = await fetchBookingContext(client, bookingId);
      if (!context) {
        return;
      }

      const {
        booking,
        isoDate,
        dateLabel,
        timeLabel,
        serviceName,
        packageName,
        durationHours,
        durationMinutes,
        students,
        instructor
      } = context;

      // Get student names for the notification message
      const studentNames = students.map((student) => student.name).filter(Boolean);
      const studentNamesDisplay = studentNames.length > 0 ? studentNames.join(', ') : 'A student';

      // Notify each student
      await Promise.all(
        students.map((student) => {
          const data = {
            bookingId: booking.id,
            role: 'student',
            date: isoDate,
            startTime: timeLabel,
            durationHours,
            durationMinutes,
            serviceName,
            packageName,
            instructor,
            student: { id: student.id, name: student.name },
            cta: {
              label: 'View lesson schedule',
              href: isoDate ? `/student/schedule?date=${isoDate}` : '/student/schedule'
            }
          };

          const message = buildStudentMessage({
            serviceName,
            instructorName: instructor?.name,
            dateLabel,
            timeLabel,
            packageName
          });

          return insertNotification({
            client,
            userId: student.id,
            title: `Lesson booked: ${serviceName}`,
            message,
            type: 'booking_student',
            data,
            idempotencyKey: `booking-created:${booking.id}:student:${student.id}`
          });
        })
      );

      // Notify the instructor (if assigned and has new_booking_alerts enabled)
      if (instructor && students.length) {
        const instructorHasAlerts = await this._checkUserBookingAlerts(client, instructor.id);
        
        if (instructorHasAlerts) {
          const instructorData = {
            bookingId: booking.id,
            role: 'instructor',
            date: isoDate,
            startTime: timeLabel,
            durationHours,
            durationMinutes,
            serviceName,
            packageName,
            instructor,
            students,
            status: 'pending',
            actions: [
              { key: 'approve', label: 'Approve', type: 'primary' },
              { key: 'cancel', label: 'Decline', type: 'danger' }
            ],
            cta: {
              label: 'View in daily program',
              href: isoDate ? `/bookings/calendar?view=daily&date=${isoDate}&bookingId=${bookingId}` : '/bookings/calendar?view=daily'
            }
          };

          const instructorMessage = buildInstructorMessage({
            serviceName,
            studentNames,
            dateLabel,
            timeLabel
          });

          await insertNotification({
            client,
            userId: instructor.id,
            title: `New lesson: ${serviceName}`,
            message: instructorMessage,
            type: 'booking_instructor',
            data: instructorData,
            idempotencyKey: `booking-created:${booking.id}:instructor:${instructor.id}`
          });
        }
      }

      // Notify managers and admins (if they have new_booking_alerts enabled)
      await this._notifyStaffAboutNewBooking(client, {
        bookingId: booking.id,
        isoDate,
        dateLabel,
        timeLabel,
        serviceName,
        studentNamesDisplay,
        instructorName: instructor?.name || 'TBD',
        instructorId: instructor?.id,
        createdBy: booking.created_by
      });
      
    } catch (error) {
      logger.error('Failed to send booking notifications', { bookingId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if a user has new booking alerts enabled
   */
  async _checkUserBookingAlerts(client, userId) {
    try {
      const result = await client.query(
        `SELECT COALESCE(ns.new_booking_alerts, true) AS new_booking_alerts
         FROM users u
         LEFT JOIN notification_settings ns ON ns.user_id = u.id
         WHERE u.id = $1`,
        [userId]
      );
      return result.rows[0]?.new_booking_alerts !== false;
    } catch (error) {
      logger.warn('Failed to check user booking alerts preference', { userId, error: error.message });
      return true; // Default to sending if we can't check
    }
  }

  /**
   * Notify all managers and admins about a new booking
   */
  async _notifyStaffAboutNewBooking(client, { bookingId, isoDate, dateLabel, timeLabel, serviceName, studentNamesDisplay, instructorName, instructorId, createdBy }) {
    try {
      // Get all admins and managers who have new_booking_alerts enabled (or haven't set preferences)
      // Exclude the instructor AND the person who created the booking
      const staffQuery = await client.query(
        `SELECT u.id, u.name, r.name AS role_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN notification_settings ns ON ns.user_id = u.id
         WHERE r.name IN ('admin', 'manager', 'owner')
           AND u.deleted_at IS NULL
           AND COALESCE(ns.new_booking_alerts, true) = true
           AND u.id != $1
           AND u.id != $2`,
        [
          instructorId || '00000000-0000-0000-0000-000000000000',
          createdBy || '00000000-0000-0000-0000-000000000000'
        ]
      );

      if (!staffQuery.rows.length) {
        logger.debug('No staff members to notify about new booking', { bookingId });
        return;
      }

      const staffMessage = `${serviceName} for ${studentNamesDisplay} with ${instructorName} on ${dateLabel} at ${timeLabel}`;
      
      const notificationData = {
        bookingId,
        type: 'new_booking_alert',
        date: isoDate,
        startTime: timeLabel,
        serviceName,
        studentNames: studentNamesDisplay,
        instructorName,
        status: 'pending',
        actions: [
          { key: 'approve', label: 'Approve', type: 'primary' },
          { key: 'cancel', label: 'Decline', type: 'danger' }
        ],
        cta: {
          label: 'View in daily program',
          href: isoDate ? `/bookings/calendar?view=daily&date=${isoDate}&bookingId=${bookingId}` : '/bookings/calendar?view=daily'
        }
      };

      await Promise.all(
        staffQuery.rows.map((staff) =>
          insertNotification({
            client,
            userId: staff.id,
            title: `New booking request`,
            message: staffMessage,
            type: 'new_booking_alert',
            data: notificationData,
            idempotencyKey: `booking-created:${bookingId}:staff:${staff.id}`
          })
        )
      );

      logger.info('Staff notified about new booking', { 
        bookingId, 
        staffCount: staffQuery.rows.length,
        staffIds: staffQuery.rows.map(s => s.id)
      });
    } catch (error) {
      logger.error('Failed to notify staff about new booking', { bookingId, error: error.message });
      // Don't throw - staff notifications are secondary
    }
  }

  async _processLessonCompleted({ bookingId }) {
    if (!bookingId) {
      return;
    }

    await this._processLessonCompletedBatch({ bookingIds: [bookingId] });
  }

  async _processLessonCompletedBatch({ bookingIds = [] }) {
    const normalizedIds = Array.from(new Set(bookingIds.filter(Boolean)));

    if (!normalizedIds.length) {
      return;
    }

    const client = await pool.connect();

    try {
      const contextMap = await fetchBookingContexts(client, normalizedIds);

      const missingIds = normalizedIds.filter((id) => !contextMap.has(id));
      if (missingIds.length) {
        logger.warn('Booking contexts missing for completion notification', { bookingIds: missingIds });
      }

      for (const id of normalizedIds) {
        const context = contextMap.get(id);
        if (!context) {
          continue;
        }

        await this._deliverLessonCompleted({ client, context });
      }
    } catch (error) {
      logger.error('Failed to send lesson completion notification', {
        bookingIds: normalizedIds,
        error: error.message
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async _deliverLessonCompleted({ client, context }) {
    const {
      booking,
      isoDate,
      timeLabel,
      serviceName,
      durationHours,
      durationMinutes,
      students,
      instructor
    } = context;

    if (!students.length) {
      return;
    }

    const serviceLabel = normalizeServiceLabel(serviceName);
    const instructorName = instructor?.name || 'your instructor';
    const durationLabel = formatDurationLabel(durationHours);
    const messageSubject = durationLabel
      ? `${durationLabel} of ${serviceLabel}`
      : serviceLabel.charAt(0).toUpperCase() + serviceLabel.slice(1);
    const message = `${messageSubject} has been checked out by ${instructorName}. Click to rate your instructor.`;

    await Promise.all(
      students.map(async (student) => {
        await client.query(
          `DELETE FROM notifications
            WHERE user_id = $1
              AND type = 'booking_completed_student'
              AND data ->> 'bookingId' = $2`,
          [student.id, booking.id]
        );

        const ratingContext = {
          bookingId: booking.id,
          date: isoDate,
          startTime: timeLabel,
          instructor,
          service: booking.service_id
            ? { id: booking.service_id, name: serviceName }
            : serviceName
              ? { id: null, name: serviceName }
              : null
        };

        const data = {
          bookingId: booking.id,
          role: 'student',
          date: isoDate,
          startTime: timeLabel,
          durationHours,
          durationMinutes,
          serviceName,
          instructor,
          student: { id: student.id, name: student.name },
          intent: RATE_LESSON_INTENT,
          ratingContext,
          cta: {
            label: 'Rate your instructor',
            href: `/student/dashboard?rateBooking=${booking.id}`
          }
        };

          await insertNotification({
            client,
          userId: student.id,
          title: 'Lesson checked out',
          message,
          type: 'booking_completed_student',
            data,
            idempotencyKey: `lesson-completed:${booking.id}:student:${student.id}`
        });
      })
    );
  }

  async _processInstructorRatedNotification({ ratingId }) {
    const client = await pool.connect();

    try {
      const ratingQuery = await client.query(
        `SELECT ir.id,
                ir.rating,
                ir.feedback_text,
                ir.instructor_id,
                ir.student_id,
                ir.created_at,
                b.id AS booking_id,
                b.date,
                b.duration,
                srv.name AS service_name,
                s.name AS student_name,
                i.name AS instructor_name
           FROM instructor_ratings ir
           JOIN bookings b ON b.id = ir.booking_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN users s ON s.id = ir.student_id
      LEFT JOIN users i ON i.id = ir.instructor_id
          WHERE ir.id = $1`,
        [ratingId]
      );

      if (!ratingQuery.rows.length) {
        return;
      }

      const rating = ratingQuery.rows[0];
      if (!rating.instructor_id) {
        return;
      }

      const instructorId = rating.instructor_id;
      const ratingValue = Number(rating.rating) || null;
      const durationHours = Number.isFinite(Number(rating.duration)) ? Number(rating.duration) : null;
      const durationMinutes = typeof durationHours === 'number' ? Math.round(durationHours * 60) : null;
      const ratingLabel = ratingValue ? `${ratingValue}/5` : 'a new rating';
      const studentName = rating.student_name || 'A student';
      const serviceLabel = normalizeServiceLabel(rating.service_name || 'lesson');
      const messageBase = `${studentName} rated your ${serviceLabel} ${ratingLabel}.`;
      const message = rating.feedback_text
        ? `${messageBase} They left feedback for you.`
        : `${messageBase} Keep up the great work!`;

      await client.query(
        `DELETE FROM notifications
          WHERE user_id = $1
            AND type = 'lesson_rating_instructor'
            AND data ->> 'ratingId' = $2`,
        [instructorId, ratingId]
      );

      const data = {
        ratingId: rating.id,
        bookingId: rating.booking_id,
        rating: ratingValue,
        feedbackPreview: rating.feedback_text ? rating.feedback_text.slice(0, 200) : null,
        student: rating.student_id ? { id: rating.student_id, name: rating.student_name || 'Student' } : null,
        serviceName: rating.service_name || null,
        lessonDate: toIsoDate(rating.date),
        durationHours,
        durationMinutes,
        intent: VIEW_RATING_INTENT,
        cta: {
          label: 'View rating details',
          href: '/instructor/dashboard?tab=ratings'
        }
      };

      await insertNotification({
        client,
        userId: instructorId,
        title: 'New lesson rating received',
        message,
        type: 'lesson_rating_instructor',
        data,
        idempotencyKey: `lesson-rating:${ratingId}:instructor:${instructorId}`
      });
    } catch (error) {
      logger.error('Failed to send instructor rating notification', { ratingId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  _enqueueJob({ type, execute, idempotencyKey, tenantKey, meta = {}, maxAttempts }) {
    const job = {
      execute,
      idempotencyKey,
      tenantKey,
      meta,
      attempts: 0,
      maxAttempts: maxAttempts ?? this.maxAttempts,
      handleFailure: (error, currentJob) => this._handleJobFailure(error, currentJob)
    };

    this.dispatcher.enqueue(job);
    return job;
  }

  _handleJobFailure(error, job) {
    const nextAttempt = (job.attempts ?? 0) + 1;
    const maxAttempts = job.maxAttempts ?? this.maxAttempts;
    const jobType = job?.meta?.type || job?.type || 'unknown';

    if (nextAttempt >= maxAttempts) {
      notificationMetrics.recordDropped('max-attempts', { jobType });
      logger.error('Notification job reached max retries', {
        meta: job.meta ?? null,
        error: error?.message,
        attempts: nextAttempt,
        maxAttempts
      });
      this.dispatcher.releaseIdempotencyKey(job.idempotencyKey);
      if (job.onPermanentFailure) {
        job.onPermanentFailure(error, job);
      }
      return;
    }

    const delayMs = this._calculateRetryDelay(nextAttempt);
  notificationMetrics.recordRetry({ jobType });
  notificationMetrics.recordRetryScheduled({ attempt: nextAttempt, delayMs, jobType });

    logger.warn('Scheduling notification job retry', {
      meta: job.meta ?? null,
      attempt: nextAttempt,
      maxAttempts,
      delayMs,
      error: error?.message
    });

    this.dispatcher.releaseIdempotencyKey(job.idempotencyKey);

    const retryJob = {
      ...job,
      attempts: nextAttempt,
      meta: { ...job.meta, retryAttempt: nextAttempt }
    };

    setTimeout(() => {
      this.dispatcher.enqueue(retryJob);
    }, delayMs);
  }

  _calculateRetryDelay(attempt) {
    const delay = this.retryDelayMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(delay, this.maxRetryDelayMs);
  }
}

const bookingNotificationService = new BookingNotificationService();
export default bookingNotificationService;
