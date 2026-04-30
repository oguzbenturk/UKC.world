import { logger } from '../../middlewares/errorHandler.js';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://ukc.plannivo.com').replace(/\/$/, '');

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const formatDate = (isoOrDate) => {
  if (!isoOrDate) return null;
  const iso = String(isoOrDate).slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
};

const formatTime = (startHour) => {
  const numeric = Number(startHour);
  if (!Number.isFinite(numeric)) return null;
  const hours = Math.floor(numeric);
  const minutes = Math.round((numeric - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatDuration = (durationHours) => {
  const numeric = Number(durationHours);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric === 1) return '1h';
  return Number.isInteger(numeric) ? `${numeric}h` : `${numeric.toFixed(1)}h`;
};

// Dashboard path per role. Mirrors the role → home redirect in AppRoutes.jsx.
const ROLE_DASHBOARD = {
  instructor: '/instructor/dashboard',
  admin: '/dashboard',
  super_admin: '/dashboard',
  manager: '/dashboard',
  owner: '/dashboard',
  frontdesk: '/dashboard',
  student: '/student/dashboard',
  trusted_customer: '/student/dashboard',
  outsider: '/'
};

const dashboardLink = (data = {}) => {
  // Prefer the deep link the dispatcher already attached (jumps straight to
  // the booking in the daily calendar). Fall back to a role-based dashboard.
  const cta = data?.cta;
  if (cta?.href && typeof cta.href === 'string') {
    const label = cta.label || 'Open lesson';
    return `<a href="${FRONTEND_URL}${cta.href}">${escapeHtml(label)} →</a>`;
  }
  const role = (data?.recipientRole || 'instructor').toLowerCase();
  const path = ROLE_DASHBOARD[role] || ROLE_DASHBOARD.instructor;
  return `<a href="${FRONTEND_URL}${path}">Open dashboard →</a>`;
};

const detailsBlock = ({ serviceName, dateLabel, timeLabel, durationLabel, studentName, location }) => {
  const lines = [
    serviceName ? `📚 <b>${escapeHtml(serviceName)}</b>` : null,
    dateLabel ? `📅 ${escapeHtml(dateLabel)}` : null,
    timeLabel ? `🕐 ${escapeHtml(timeLabel)}${durationLabel ? ` (${durationLabel})` : ''}` : null,
    studentName ? `👤 ${escapeHtml(studentName)}` : null,
    location ? `📍 ${escapeHtml(location)}` : null
  ].filter(Boolean);
  return lines.join('\n');
};

export function buildLessonAssigned(data = {}) {
  const { serviceName, date, startHour, duration, studentName, location, isReassignment = false } = data;
  const dateLabel = formatDate(date);
  const timeLabel = formatTime(startHour);
  const durationLabel = formatDuration(duration);
  const heading = isReassignment
    ? '🔁 <b>Lesson reassigned to you</b>'
    : '✨ <b>New lesson assigned</b>';

  return [
    heading,
    '',
    detailsBlock({ serviceName, dateLabel, timeLabel, durationLabel, studentName, location }),
    '',
    dashboardLink(data)
  ].join('\n');
}

export function buildLessonRescheduled(data = {}) {
  const { serviceName, oldDate, newDate, oldStartHour, newStartHour, oldLocation, newLocation, duration, studentName } = data;
  const oldDateLabel = formatDate(oldDate);
  const newDateLabel = formatDate(newDate);
  const oldTimeLabel = formatTime(oldStartHour);
  const newTimeLabel = formatTime(newStartHour);
  const dateChanged = oldDateLabel && newDateLabel && oldDateLabel !== newDateLabel;
  const timeChanged = oldTimeLabel && newTimeLabel && oldTimeLabel !== newTimeLabel;
  const locationChanged = (oldLocation || newLocation) && oldLocation !== newLocation;
  const durationLabel = formatDuration(duration);

  const changeLines = [];
  if (dateChanged) changeLines.push(`📅 ${escapeHtml(oldDateLabel)} → <b>${escapeHtml(newDateLabel)}</b>`);
  if (timeChanged) changeLines.push(`🕐 ${escapeHtml(oldTimeLabel)} → <b>${escapeHtml(newTimeLabel)}</b>`);
  if (locationChanged) changeLines.push(`📍 ${escapeHtml(oldLocation || '—')} → <b>${escapeHtml(newLocation || '—')}</b>`);

  return [
    '🔄 <b>Lesson rescheduled</b>',
    '',
    serviceName ? `📚 <b>${escapeHtml(serviceName)}</b>${studentName ? ` · ${escapeHtml(studentName)}` : ''}` : null,
    durationLabel ? `⏱ ${durationLabel}` : null,
    '',
    ...changeLines,
    '',
    dashboardLink(data)
  ].filter((line) => line !== null).join('\n');
}

export function buildLessonUnassigned(data = {}) {
  const { serviceName, date, startHour, studentName, newInstructorName } = data;
  const dateLabel = formatDate(date);
  const timeLabel = formatTime(startHour);
  const lines = [
    '↪️ <b>Lesson removed from your schedule</b>',
    ''
  ];
  if (serviceName) lines.push(`📚 ${escapeHtml(serviceName)}`);
  if (dateLabel || timeLabel) lines.push(`📅 ${escapeHtml(dateLabel || '')}${timeLabel ? ` · ${escapeHtml(timeLabel)}` : ''}`);
  if (studentName) lines.push(`👤 ${escapeHtml(studentName)}`);
  if (newInstructorName) lines.push(`\nReassigned to <b>${escapeHtml(newInstructorName)}</b>.`);
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

export function buildLessonCompleted(data = {}) {
  const { serviceName, date, startHour, duration, studentName } = data;
  const dateLabel = formatDate(date);
  const timeLabel = formatTime(startHour);
  const durationLabel = formatDuration(duration);
  const lines = [
    '✅ <b>Lesson completed</b>',
    ''
  ];
  if (serviceName) lines.push(`📚 ${escapeHtml(serviceName)}`);
  if (dateLabel || timeLabel) {
    lines.push(`📅 ${escapeHtml(dateLabel || '')}${timeLabel ? ` · ${escapeHtml(timeLabel)}` : ''}${durationLabel ? ` (${durationLabel})` : ''}`);
  }
  if (studentName) lines.push(`👤 ${escapeHtml(studentName)}`);
  lines.push('', '<i>The student has been asked to rate the lesson.</i>');
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

export function buildLessonCancelled(data = {}) {
  const { serviceName, date, startHour, studentName, reason } = data;
  const dateLabel = formatDate(date);
  const timeLabel = formatTime(startHour);
  const lines = [
    '❌ <b>Lesson cancelled</b>',
    ''
  ];
  if (serviceName) lines.push(`📚 ${escapeHtml(serviceName)}`);
  if (dateLabel || timeLabel) lines.push(`📅 ${escapeHtml(dateLabel || '')}${timeLabel ? ` · ${escapeHtml(timeLabel)}` : ''}`);
  if (studentName) lines.push(`👤 ${escapeHtml(studentName)}`);
  if (reason) lines.push(`\n<i>${escapeHtml(reason)}</i>`);
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

export function buildLinkSuccess({ name }) {
  return [
    '✅ <b>Telegram connected!</b>',
    '',
    name ? `Hi ${escapeHtml(name)}, your Plannivo account is now linked.` : 'Your Plannivo account is now linked.',
    '',
    'You will receive Telegram messages here when:',
    '• A new lesson is assigned to you',
    '• A lesson time, date, or location changes',
    '• A lesson is cancelled',
    '',
    'Send /unlink anytime to stop receiving notifications.'
  ].join('\n');
}

export function buildLinkExpired() {
  return [
    '⏱ <b>This link has expired.</b>',
    '',
    'Open Plannivo and click "Connect Telegram" again to get a fresh link.'
  ].join('\n');
}

export function buildLinkInvalid() {
  return [
    '❓ <b>Unknown or invalid link code.</b>',
    '',
    'Open Plannivo, go to your profile, and use the "Connect Telegram" button to get a working link.'
  ].join('\n');
}

export function buildLinkAlreadyUsed() {
  return [
    'ℹ️ <b>This link has already been used.</b>',
    '',
    'If you want to relink, open Plannivo and request a fresh code.'
  ].join('\n');
}

export function buildUnlinkSuccess() {
  return [
    '👋 <b>Telegram unlinked.</b>',
    '',
    'You will no longer receive lesson notifications here. To reconnect, open your profile in Plannivo.'
  ].join('\n');
}

export function buildStatusLinked({ name }) {
  return [
    '✅ Linked to Plannivo' + (name ? ` as ${escapeHtml(name)}` : '') + '.',
    'Send /unlink to disconnect.'
  ].join('\n');
}

export function buildStatusUnlinked() {
  return [
    '🔌 Not linked.',
    '',
    'Open Plannivo, go to your profile, and click "Connect Telegram" to get started.'
  ].join('\n');
}

export function buildHelp() {
  return [
    '<b>Plannivo Bot</b>',
    '',
    'Commands:',
    '/start <code> — link your account',
    '/status — check link state',
    '/unlink — disconnect',
    '/help — show this message'
  ].join('\n');
}

export function buildBookingStudent(data = {}) {
  const { serviceName, date, startTime, durationHours, instructor, packageName } = data;
  const dateLabel = formatDate(date);
  const durationLabel = formatDuration(durationHours);
  const instructorName = instructor?.name;

  const lines = ['🎉 <b>Lesson booked</b>', ''];
  if (serviceName) lines.push(`📚 <b>${escapeHtml(serviceName)}</b>`);
  if (dateLabel || startTime) {
    lines.push(`📅 ${escapeHtml(dateLabel || '')}${startTime ? ` · ${escapeHtml(String(startTime))}` : ''}${durationLabel ? ` (${durationLabel})` : ''}`);
  }
  if (instructorName) lines.push(`👨‍🏫 ${escapeHtml(instructorName)}`);
  if (packageName) lines.push(`🎟 ${escapeHtml(packageName)}`);
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

export function buildBookingCheckedInStudent(data = {}) {
  const { serviceName, date, startTime, durationHours, instructor } = data;
  const dateLabel = formatDate(date);
  const durationLabel = formatDuration(durationHours);
  const instructorName = instructor?.name;

  const lines = ['🟢 <b>You\'re checked in</b>', ''];
  if (serviceName) lines.push(`📚 ${escapeHtml(serviceName)}`);
  if (dateLabel || startTime) {
    lines.push(`📅 ${escapeHtml(dateLabel || '')}${startTime ? ` · ${escapeHtml(String(startTime))}` : ''}${durationLabel ? ` (${durationLabel})` : ''}`);
  }
  if (instructorName) lines.push(`👨‍🏫 ${escapeHtml(instructorName)}`);
  lines.push('', '<i>Have a great lesson!</i>');
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

export function buildBookingCompletedStudent(data = {}) {
  const { serviceName, instructor } = data;
  const instructorName = instructor?.name;

  const lines = ['🎓 <b>Lesson complete</b>', ''];
  if (serviceName) lines.push(`📚 ${escapeHtml(serviceName)}`);
  if (instructorName) lines.push(`👨‍🏫 ${escapeHtml(instructorName)}`);
  lines.push('', '<i>How was your lesson? Tap below to rate.</i>');
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

export function buildLessonRatingInstructor(data = {}) {
  const { serviceName, studentName, rating } = data;
  const stars = Number.isFinite(Number(rating))
    ? '⭐'.repeat(Math.max(0, Math.min(5, Math.round(Number(rating)))))
    : null;

  const lines = ['⭐ <b>New lesson rating</b>', ''];
  if (serviceName) lines.push(`📚 ${escapeHtml(serviceName)}`);
  if (studentName) lines.push(`👤 ${escapeHtml(studentName)}`);
  if (stars) lines.push(`Rating: ${stars}`);
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

export function buildRentalCustomer(data = {}) {
  const { equipmentNames, date, totalPrice, paymentStatus } = data;
  const dateLabel = formatDate(date);
  const equipmentLabel = Array.isArray(equipmentNames)
    ? equipmentNames.join(', ')
    : (equipmentNames || null);

  const lines = ['🛟 <b>Rental confirmed</b>', ''];
  if (equipmentLabel) lines.push(`🎒 ${escapeHtml(equipmentLabel)}`);
  if (dateLabel) lines.push(`📅 ${escapeHtml(dateLabel)}`);
  if (totalPrice != null) lines.push(`💰 ${escapeHtml(String(totalPrice))}`);
  if (paymentStatus) lines.push(`💳 ${escapeHtml(String(paymentStatus))}`);
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

export function buildNewBookingAlert(data = {}) {
  const { serviceName, date, startTime, studentNames, instructorName, serviceType, status } = data;
  const dateLabel = formatDate(date);
  const isRental = serviceType === 'rental';
  const heading = isRental
    ? '🛟 <b>New rental request</b>'
    : '📥 <b>New booking request</b>';

  const lines = [heading, ''];
  if (serviceName) lines.push(`📚 <b>${escapeHtml(serviceName)}</b>`);
  if (dateLabel || startTime) {
    lines.push(`📅 ${escapeHtml(dateLabel || '')}${startTime ? ` · ${escapeHtml(String(startTime))}` : ''}`);
  }
  if (studentNames) lines.push(`👤 ${escapeHtml(String(studentNames))}`);
  if (instructorName && instructorName !== 'TBD') lines.push(`👨‍🏫 ${escapeHtml(String(instructorName))}`);
  if (status === 'pending') lines.push('\n<i>Awaiting approval.</i>');
  lines.push('', dashboardLink(data));
  return lines.join('\n');
}

// Adapter for the legacy `booking_instructor` payload shape produced by
// bookingNotificationService._processBookingCreated — converts it into the
// fields buildLessonAssigned expects.
function adaptBookingInstructorData(data = {}) {
  const startTimeStr = typeof data.startTime === 'string' ? data.startTime : null;
  let startHour = null;
  if (startTimeStr && /^\d{1,2}:\d{2}$/.test(startTimeStr)) {
    const [h, m] = startTimeStr.split(':').map(Number);
    startHour = h + (m / 60);
  }
  const studentName = Array.isArray(data.students)
    ? data.students.map((s) => s?.name).filter(Boolean).join(', ')
    : (data.studentName || null);
  return {
    serviceName: data.serviceName || null,
    date: data.date || null,
    startHour,
    duration: data.durationHours ?? null,
    studentName,
    location: data.location || null
  };
}

export function buildTelegramMessageForType(type, data) {
  try {
    switch (type) {
      case 'booking_assigned':
        return buildLessonAssigned(data);
      case 'booking_instructor':
        return buildLessonAssigned(adaptBookingInstructorData(data));
      case 'booking_reassigned_instructor':
        return buildLessonAssigned({ ...data, isReassignment: true });
      case 'booking_rescheduled_instructor':
        return buildLessonRescheduled(data);
      case 'booking_unassigned_instructor':
        return buildLessonUnassigned(data);
      case 'booking_cancelled_instructor':
        return buildLessonCancelled(data);
      case 'booking_completed_instructor':
        return buildLessonCompleted(data);
      case 'new_booking_alert':
      case 'new_rental_alert':
        return buildNewBookingAlert(data);
      case 'booking_student':
        return buildBookingStudent(data);
      case 'booking_checkin_student':
        return buildBookingCheckedInStudent(data);
      case 'booking_completed_student':
        return buildBookingCompletedStudent(data);
      case 'lesson_rating_instructor':
        return buildLessonRatingInstructor(data);
      case 'rental_customer':
        return buildRentalCustomer(data);
      default:
        return null;
    }
  } catch (error) {
    logger.warn('Failed to build Telegram message', { type, error: error.message });
    return null;
  }
}

export default {
  buildLessonAssigned,
  buildLessonRescheduled,
  buildLessonUnassigned,
  buildLessonCancelled,
  buildLinkSuccess,
  buildLinkExpired,
  buildLinkInvalid,
  buildLinkAlreadyUsed,
  buildUnlinkSuccess,
  buildStatusLinked,
  buildStatusUnlinked,
  buildHelp,
  buildTelegramMessageForType
};
