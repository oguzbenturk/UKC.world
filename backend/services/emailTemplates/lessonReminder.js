import { buildBrandedEmail } from './brandedLayout.js';

export function buildLessonReminderEmail({
  recipientName,
  serviceName,
  dateLabel,
  timeLabel,
  durationLabel,
  instructorName,
  location,
  scheduleUrl
}) {
  const greetingName = recipientName || 'there';
  const lessonLabel = serviceName || 'lesson';
  const subject = `Reminder: ${lessonLabel} on ${dateLabel} · ${timeLabel}`;

  const detailsText = [
    `Service: ${serviceName || 'Lesson'}`,
    `Date: ${dateLabel}`,
    `Time: ${timeLabel}`,
    durationLabel ? `Duration: ${durationLabel}` : null,
    instructorName ? `Instructor: ${instructorName}` : null,
    location ? `Location: ${location}` : null
  ].filter(Boolean).join('\n');

  const text = `Hi ${greetingName},

Friendly reminder — your ${lessonLabel} is tomorrow.

${detailsText}

${scheduleUrl ? `View schedule: ${scheduleUrl}\n\n` : ''}If you need to reschedule or cancel, please let us know as soon as possible.

See you on the water,
UKC• Duotone Pro Center Urla`;

  const html = buildBrandedEmail({
    preheader: `Your ${lessonLabel} is tomorrow at ${timeLabel}`,
    eyebrow: 'Lesson reminder',
    title: 'See you tomorrow',
    greeting: `Hi ${greetingName},`,
    bodyParagraphs: [
      `This is a friendly reminder that your <strong>${lessonLabel}</strong> is coming up tomorrow.`
    ],
    details: [
      { label: 'Service', value: serviceName || 'Lesson' },
      { label: 'Date', value: dateLabel },
      { label: 'Time', value: timeLabel },
      durationLabel ? { label: 'Duration', value: durationLabel } : null,
      instructorName ? { label: 'Instructor', value: instructorName } : null,
      location ? { label: 'Location', value: location } : null
    ].filter(Boolean),
    ctaLabel: scheduleUrl ? 'View schedule' : '',
    ctaUrl: scheduleUrl || '',
    includeRawLink: false,
    fineprint: [
      'Need to reschedule or cancel? Please contact us as soon as possible.',
      'See you on the water.'
    ]
  });

  return { subject, html, text };
}

export default { buildLessonReminderEmail };
