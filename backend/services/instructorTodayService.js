// Instructor "My day" dashboard data: today's own lessons (+ participants, waiver,
// last note, package, equipment), what needs attention, and the week strip.
//
// Scope: every query is pinned to bookings.instructor_user_id = instructorId (the
// caller's own id, set by the route from req.user.id). Waiver status and notes are
// only ever looked up for participants of those lessons — there is no way to ask
// this service about an arbitrary user.
//
// No payment data: instructors never see a lesson's payment status or amounts
// here (owner decision 2026-10-08 — the former 'unpaid_checkin' attention item
// was removed). Package info is lesson progress (lesson n of m, hours left) only.
//
// Dates are plain 'YYYY-MM-DD' strings in the business timezone (pg DATE is parsed
// as a string, see db.js) — never round-tripped through a UTC Date, so a lesson at
// 02:30 local is never filed under the previous day.

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { businessDate } from './instructorPayoutService.js';
import { needsToSignWaiver } from './waiverService.js';
import { listInstructorNotes } from './instructorNotesService.js';

const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul';
const EXCLUDED_STATUSES = ['cancelled', 'pending_payment'];
const DONE_STATUSES = new Set(['completed', 'done', 'checked-out', 'checked_out', 'no_show', 'no-show']);
const DONE_CHECKOUT = new Set(['checked-out', 'early-checkout']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Plain-date helpers ──────────────────────────────────────────────────────

const toUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const addDays = (iso, days) => {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Monday of the week containing `iso`. */
export const startOfWeek = (iso) => addDays(iso, -((toUtc(iso).getUTCDay() + 6) % 7));
/** 0 = Sunday … 6 = Saturday (instructor_working_hours.day_of_week convention). */
const dayOfWeek = (iso) => toUtc(iso).getUTCDay();

export const isPlainDate = (value) => {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  return toUtc(value).toISOString().slice(0, 10) === value;
};

const minuteFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Minutes since local midnight (business timezone) for an instant. */
export function businessMinutes(instant = new Date()) {
  const parts = minuteFormatter.formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** numeric start_hour (10.5) → "10:30". */
export function formatHour(startHour) {
  const n = Number(startHour);
  if (startHour === null || startHour === undefined || !Number.isFinite(n)) return null;
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const fullName = (row) => {
  const composed = `${row.first_name || ''} ${row.last_name || ''}`.trim();
  return composed || (row.name || '').trim() || null;
};

export const initialsOf = (name) => (name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join('');

const isDone = (lesson) => DONE_STATUSES.has(String(lesson.status || '').toLowerCase())
  || DONE_CHECKOUT.has(String(lesson.checkoutStatus || '').toLowerCase());

// ─── Queries ─────────────────────────────────────────────────────────────────

const SKILL_LEVEL_SQL = `COALESCE(NULLIF(TRIM(u.level), ''), (
  SELECT sl.name
    FROM student_progress sp
    JOIN skills sk ON sk.id = sp.skill_id
    JOIN skill_levels sl ON sl.id = sk.skill_level_id
   WHERE sp.student_id = u.id
   ORDER BY sp.date_achieved DESC NULLS LAST, sp.created_at DESC
   LIMIT 1
))`;

async function loadLessons(executor, instructorId, date) {
  const { rows } = await executor.query(
    `SELECT b.id, b.date::text AS date, b.start_hour, b.duration, b.status,
            b.checkin_status, b.checkout_status, b.group_size,
            NULLIF(NULLIF(TRIM(b.location), ''), 'TBD') AS location,
            b.student_user_id, b.family_member_id,
            s.name AS service_name,
            COALESCE(NULLIF(s.lesson_category_tag, ''), s.category) AS service_category,
            pkg.id AS package_id, pkg.package_name, pkg.remaining_hours AS package_hours_left,
            pkg.total_hours AS package_total_hours, spk.sessions_count AS package_sessions,
            CASE WHEN pkg.id IS NULL THEN NULL ELSE (
              SELECT COUNT(*)::int
                FROM bookings b2
               WHERE b2.deleted_at IS NULL
                 AND COALESCE(b2.status, '') <> ALL($3::text[])
                 AND (b2.customer_package_id = pkg.id
                      OR EXISTS (SELECT 1 FROM booking_participants bp2
                                  WHERE bp2.booking_id = b2.id AND bp2.customer_package_id = pkg.id))
                 AND (b2.date, b2.start_hour) <= (b.date, b.start_hour)
            ) END AS package_lesson_index
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN LATERAL (
         SELECT cp.*
           FROM customer_packages cp
          WHERE cp.id = COALESCE(b.customer_package_id, (
                  SELECT bp.customer_package_id FROM booking_participants bp
                   WHERE bp.booking_id = b.id AND bp.customer_package_id IS NOT NULL
                   ORDER BY bp.is_primary DESC NULLS LAST
                   LIMIT 1))
       ) pkg ON TRUE
       LEFT JOIN service_packages spk ON spk.id = pkg.service_package_id
      WHERE b.instructor_user_id = $1
        AND b.date = $2::date
        AND b.deleted_at IS NULL
        AND COALESCE(b.status, '') <> ALL($3::text[])
      ORDER BY b.start_hour ASC NULLS LAST, b.id`,
    [instructorId, date, EXCLUDED_STATUSES],
  );
  return rows;
}

async function loadParticipants(executor, lessonRows) {
  const ids = lessonRows.map((r) => r.id);
  if (!ids.length) return new Map();

  const [participantsRes, studentsRes, familyRes] = await Promise.all([
    executor.query(
      `SELECT bp.booking_id, bp.user_id, bp.is_primary,
              u.name, u.first_name, u.last_name, ${SKILL_LEVEL_SQL} AS skill_level
         FROM booking_participants bp
         JOIN users u ON u.id = bp.user_id
        WHERE bp.booking_id = ANY($1::uuid[])
        ORDER BY bp.is_primary DESC NULLS LAST, bp.created_at ASC`,
      [ids],
    ),
    executor.query(
      `SELECT u.id, u.name, u.first_name, u.last_name, ${SKILL_LEVEL_SQL} AS skill_level
         FROM users u
        WHERE u.id = ANY($1::uuid[])`,
      [[...new Set(lessonRows.map((r) => r.student_user_id).filter(Boolean))]],
    ),
    executor.query(
      `SELECT id, full_name FROM family_members WHERE id = ANY($1::uuid[])`,
      [[...new Set(lessonRows.map((r) => r.family_member_id).filter(Boolean))]],
    ),
  ]);

  const students = new Map(studentsRes.rows.map((r) => [r.id, r]));
  const family = new Map(familyRes.rows.map((r) => [r.id, r]));
  const byBooking = new Map(ids.map((id) => [id, []]));
  for (const row of participantsRes.rows) {
    byBooking.get(row.booking_id)?.push({
      userId: row.user_id,
      familyMemberId: null,
      name: fullName(row),
      skillLevel: row.skill_level || null,
    });
  }

  // Single (non-group) lessons have no participant rows — the student (or the
  // family member the booking is for, under the parent's account) is the attendee.
  for (const lesson of lessonRows) {
    const list = byBooking.get(lesson.id);
    if (list.length || !lesson.student_user_id) continue;
    const student = students.get(lesson.student_user_id);
    const child = lesson.family_member_id ? family.get(lesson.family_member_id) : null;
    list.push({
      userId: lesson.student_user_id,
      familyMemberId: child ? child.id : null,
      name: child?.full_name || (student ? fullName(student) : null),
      skillLevel: child ? null : (student?.skill_level || null),
    });
  }
  return byBooking;
}

async function loadEquipment(executor, ids) {
  if (!ids.length) return new Map();
  const { rows } = await executor.query(
    `SELECT be.booking_id, e.name, e.type, e.size, e.brand
       FROM booking_equipment be
       JOIN equipment e ON e.id = be.equipment_id
      WHERE be.booking_id = ANY($1::uuid[])
      ORDER BY be.created_at ASC`,
    [ids],
  );
  const map = new Map();
  for (const row of rows) {
    const label = (row.name || [row.type, row.size].filter(Boolean).join(' ') || row.brand || '').trim();
    if (!label) continue;
    if (!map.has(row.booking_id)) map.set(row.booking_id, []);
    map.get(row.booking_id).push(label);
  }
  return map;
}

// Waiver status — only for this instructor's own lesson participants. Reuses the
// waiver service rule (signed, < 365 days old, current version). Unknown → null.
async function resolveWaiver(participant) {
  try {
    const needs = participant.familyMemberId
      ? await needsToSignWaiver(participant.familyMemberId, 'family_member')
      : await needsToSignWaiver(participant.userId, 'user');
    return !needs;
  } catch (error) {
    logger.warn('instructorToday: waiver lookup failed', { error: error?.message });
    return null;
  }
}

async function resolveLastNote(instructorId, userId) {
  try {
    const notes = await listInstructorNotes(instructorId, userId, { includePrivate: true, limit: 20 });
    const latest = [...notes]
      .filter((n) => n.note)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    if (!latest) return null;
    return { date: latest.createdAt ? businessDate(latest.createdAt) : null, text: latest.note };
  } catch (error) {
    // 403 = no relationship (e.g. a participant who joined via a partner booking).
    if (error?.status !== 403) logger.warn('instructorToday: note lookup failed', { error: error?.message });
    return null;
  }
}

async function enrichParticipants(instructorId, participantsByBooking) {
  const waiverCache = new Map();
  const noteCache = new Map();
  // Sequential on purpose: each note lookup takes a pool client; a day has a
  // handful of lessons, so this stays fast without risking pool exhaustion.
  for (const list of participantsByBooking.values()) {
    for (const p of list) {
      const waiverKey = p.familyMemberId ? `f:${p.familyMemberId}` : `u:${p.userId}`;
      if (!waiverCache.has(waiverKey)) waiverCache.set(waiverKey, await resolveWaiver(p));
      if (!p.familyMemberId && !noteCache.has(p.userId)) noteCache.set(p.userId, await resolveLastNote(instructorId, p.userId));
      p.waiverSigned = waiverCache.get(waiverKey);
      p.lastNote = p.familyMemberId ? null : noteCache.get(p.userId);
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

function mapLesson(row, participants, equipment) {
  const lessonsTotal = Number(row.package_sessions) > 0 ? Number(row.package_sessions) : null;
  return {
    id: row.id,
    date: row.date,
    startHour: formatHour(row.start_hour),
    durationHours: round2(row.duration),
    status: row.status || 'pending',
    checkinStatus: row.checkin_status || 'pending',
    checkoutStatus: row.checkout_status || 'pending',
    service: { name: row.service_name || null, category: row.service_category || null },
    groupSize: Math.max(Number(row.group_size) || 1, participants.length || 1),
    packageInfo: row.package_id ? {
      name: row.package_name || null,
      lessonIndex: row.package_lesson_index ?? null,
      lessonsTotal,
      hoursLeft: row.package_hours_left === null ? null : round2(row.package_hours_left),
      totalHours: row.package_total_hours === null ? null : round2(row.package_total_hours),
    } : null,
    participants: participants.map((p) => ({
      userId: p.userId,
      familyMemberId: p.familyMemberId,
      name: p.name,
      initials: initialsOf(p.name),
      skillLevel: p.skillLevel,
      waiverSigned: p.waiverSigned ?? null,
      lastNote: p.lastNote ?? null,
    })),
    equipment: equipment || [],
    location: row.location || null,
    _startMinutes: Number.isFinite(Number(row.start_hour)) ? Math.round(Number(row.start_hour) * 60) : null,
  };
}

function pickNextLessonId(lessons, date, today, nowMinutes) {
  if (date < today) return null;
  const open = lessons.filter((l) => !isDone(l));
  if (date > today) return open[0]?.id ?? null;
  const upcoming = open.find((l) => l._startMinutes === null
    || l._startMinutes + Math.round(l.durationHours * 60) > nowMinutes);
  return upcoming?.id ?? null;
}

function buildAttention(lessons) {
  const items = [];
  for (const lesson of lessons) {
    if (isDone(lesson)) continue;
    for (const p of lesson.participants) {
      if (p.waiverSigned === false) {
        items.push({ kind: 'waiver_missing', bookingId: lesson.id, userId: p.userId, name: p.name, startHour: lesson.startHour });
      }
    }
  }
  return items;
}

/**
 * The caller's own lessons on `date` (default: today in the business timezone).
 * `now` is injectable for tests (decides "today" and the next lesson).
 */
export async function getInstructorToday(instructorId, { date, now = new Date() } = {}) {
  const today = businessDate(now);
  const day = date && isPlainDate(date) ? date : today;
  const rows = await loadLessons(pool, instructorId, day);
  const [participantsByBooking, equipmentByBooking] = await Promise.all([
    loadParticipants(pool, rows),
    loadEquipment(pool, rows.map((r) => r.id)),
  ]);
  await enrichParticipants(instructorId, participantsByBooking);

  const lessons = rows.map((row) => mapLesson(row, participantsByBooking.get(row.id) || [], equipmentByBooking.get(row.id)));
  const nextLessonId = pickNextLessonId(lessons, day, today, businessMinutes(now));
  const attention = buildAttention(lessons);
  const hours = round2(lessons.reduce((acc, l) => acc + l.durationHours, 0));

  return {
    date: day,
    today,
    summary: {
      lessons: lessons.length,
      hours,
      firstStart: lessons.find((l) => l.startHour)?.startHour ?? null,
    },
    lessons:lessons.map(({ _startMinutes, ...rest }) => rest),
    nextLessonId,
    attention,
  };
}

/**
 * Seven days from `start` (default: Monday of the current business week):
 * lessons + hours per day, and whether the instructor is off (approved
 * time-off, or a non-working weekday in their working hours).
 */
export async function getInstructorWeek(instructorId, { start, now = new Date() } = {}) {
  const today = businessDate(now);
  const first = start && isPlainDate(start) ? start : startOfWeek(today);
  const last = addDays(first, 6);

  const [lessonsRes, timeOffRes, hoursRes] = await Promise.all([
    pool.query(
      `SELECT b.date::text AS date, COUNT(*)::int AS lessons, COALESCE(SUM(b.duration), 0) AS hours
         FROM bookings b
        WHERE b.instructor_user_id = $1
          AND b.date BETWEEN $2::date AND $3::date
          AND b.deleted_at IS NULL
          AND COALESCE(b.status, '') <> ALL($4::text[])
        GROUP BY b.date`,
      [instructorId, first, last, EXCLUDED_STATUSES],
    ),
    pool.query(
      `SELECT start_date::text AS start_date, end_date::text AS end_date
         FROM instructor_availability
        WHERE instructor_id = $1
          AND status = 'approved'
          AND start_date <= $3::date
          AND end_date >= $2::date`,
      [instructorId, first, last],
    ),
    pool.query(
      'SELECT day_of_week, is_working FROM instructor_working_hours WHERE instructor_id = $1',
      [instructorId],
    ),
  ]);

  const perDay = new Map(lessonsRes.rows.map((r) => [r.date, r]));
  const nonWorking = new Set(hoursRes.rows.filter((r) => r.is_working === false).map((r) => Number(r.day_of_week)));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(first, i);
    const row = perDay.get(date);
    const timeOff = timeOffRes.rows.some((r) => r.start_date <= date && r.end_date >= date);
    return {
      date,
      lessons: row ? Number(row.lessons) : 0,
      hours: row ? round2(row.hours) : 0,
      off: timeOff || nonWorking.has(dayOfWeek(date)),
    };
  });

  return {
    start: first,
    end: last,
    today,
    days,
    totals: {
      lessons: days.reduce((acc, d) => acc + d.lessons, 0),
      hours: round2(days.reduce((acc, d) => acc + d.hours, 0)),
    },
  };
}
