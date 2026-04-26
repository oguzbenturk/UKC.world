import cron from 'node-cron';
import { pool } from '../db.js';
import { sendEmail } from '../services/emailService.js';
import { buildLessonReminderEmail } from '../services/emailTemplates/lessonReminder.js';
import { logger } from '../middlewares/errorHandler.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ukc.plannivo.com';
const SCHEDULE_EXPRESSION = '*/15 * * * *';

const formatDateLabel = (isoDate) => {
  if (!isoDate) return 'upcoming date';
  const [year, month, day] = String(isoDate).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return String(isoDate).slice(0, 10);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTimeLabel = (startHour) => {
  const numeric = Number(startHour);
  if (!Number.isFinite(numeric)) return 'TBD';
  const hours = Math.floor(numeric);
  const minutes = Math.round((numeric - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatDurationLabel = (durationHours) => {
  const numeric = Number(durationHours);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric === 1) return '1 hour';
  const display = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
  return `${display} hours`;
};

/**
 * Find confirmed bookings whose start time falls into the 24h-ahead window
 * and that haven't been sent a reminder yet. We use a 23h-25h window so a
 * 15-minute cron cadence reliably catches every booking exactly once.
 */
async function findDueBookings() {
  const sql = `
    SELECT
      b.id,
      b.date,
      b.start_hour,
      b.duration,
      b.location,
      s.name        AS service_name,
      u.id          AS recipient_id,
      u.email       AS recipient_email,
      COALESCE(u.first_name, u.name) AS recipient_name,
      i.name        AS instructor_name
    FROM bookings b
    JOIN users u
      ON u.id = COALESCE(b.customer_user_id, b.student_user_id)
     AND u.deleted_at IS NULL
    LEFT JOIN users i ON i.id = b.instructor_user_id
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.status = 'confirmed'
      AND b.deleted_at IS NULL
      AND b.reminder_sent_at IS NULL
      AND u.email IS NOT NULL
      AND (b.date + (b.start_hour * INTERVAL '1 hour'))
            BETWEEN (NOW() + INTERVAL '23 hours')
                AND (NOW() + INTERVAL '25 hours')
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

async function sendReminderForBooking(booking) {
  const dateLabel = formatDateLabel(booking.date);
  const timeLabel = formatTimeLabel(booking.start_hour);
  const durationLabel = formatDurationLabel(booking.duration);
  const location = booking.location && booking.location !== 'TBD' ? booking.location : null;
  const scheduleUrl = `${FRONTEND_URL.replace(/\/$/, '')}/student/schedule`;

  const { subject, html, text } = buildLessonReminderEmail({
    recipientName: booking.recipient_name,
    serviceName: booking.service_name,
    dateLabel,
    timeLabel,
    durationLabel,
    instructorName: booking.instructor_name,
    location,
    scheduleUrl
  });

  await sendEmail({
    to: booking.recipient_email,
    subject,
    html,
    text,
    userId: booking.recipient_id,
    notificationType: 'lesson_reminder_24h'
  });

  await pool.query(
    'UPDATE bookings SET reminder_sent_at = NOW() WHERE id = $1',
    [booking.id]
  );
}

export async function runLessonReminderTick() {
  let due;
  try {
    due = await findDueBookings();
  } catch (error) {
    logger.error('Lesson reminder job: failed to query due bookings', { error: error.message });
    return { sent: 0, failed: 0 };
  }

  if (!due.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const booking of due) {
    try {
      await sendReminderForBooking(booking);
      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error('Lesson reminder job: failed to send reminder', {
        bookingId: booking.id,
        error: error.message
      });
    }
  }

  logger.info('Lesson reminder job tick complete', { sent, failed, considered: due.length });
  return { sent, failed };
}

let scheduledTask = null;

export function startLessonReminderJob() {
  if (scheduledTask) {
    logger.warn('Lesson reminder job is already running');
    return scheduledTask;
  }

  scheduledTask = cron.schedule(SCHEDULE_EXPRESSION, () => {
    runLessonReminderTick().catch((error) => {
      logger.error('Lesson reminder job: unhandled error in tick', { error: error.message });
    });
  });

  logger.info('Lesson reminder cron job scheduled', { expression: SCHEDULE_EXPRESSION });
  return scheduledTask;
}

export function stopLessonReminderJob() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Lesson reminder cron job stopped');
  }
}

export default {
  startLessonReminderJob,
  stopLessonReminderJob,
  runLessonReminderTick
};
