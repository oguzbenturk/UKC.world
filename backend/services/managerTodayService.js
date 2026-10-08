// Manager "Today" dashboard data (GET /api/manager/today).
//
// One staff-wide snapshot of a day, built for the manager's Today-first screen:
// what needs action (lessons booked as pending by instructors, unassigned
// lessons, missing waivers, lessons not closed, instructor payout requests,
// overbooked instructors), what is happening right now (in lesson / free / next),
// instructor capacity per instructor and per hour, money tiles and the
// rentals / stays / gear strip.
//
// Money uses the same revenue definition as GET /api/finances/summary (the daily
// computeRevenueTrend legs: lessons, rentals, accommodation, memberships, shop),
// summed with Decimal. Dates are plain 'YYYY-MM-DD' strings in the business
// timezone (see instructorTodayService) — never shifted through UTC.
//
// Staff-only: the route allows admin / manager / owner / super_admin / developer.
// The personal "my commission" block is only filled when the viewer is a manager.

import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { businessDate } from './instructorPayoutService.js';
import {
  addDays,
  businessMinutes,
  formatHour,
  initialsOf,
  isPlainDate,
  startOfWeek,
} from './instructorTodayService.js';
import { getManagerCommissionSummary, getManagerOwedBalance } from './managerCommissionService.js';
import { computeRevenueTrend } from '../routes/finances.js';

const EXCLUDED_STATUSES = ['cancelled', 'canceled', 'pending_payment'];
const DONE_STATUSES = new Set(['completed', 'done', 'checked-out', 'checked_out', 'no_show', 'no-show']);
const DONE_CHECKOUT = new Set(['checked-out', 'early-checkout']);
const OPEN_FOR_CLOSING = ['confirmed', 'checked-in', 'checked_in'];
const INSTRUCTOR_ROLE_NAMES = ['instructor', 'freelancer'];
const DEFAULT_WORKING_HOURS = 8;
const HOURLY_FROM = 8;
const HOURLY_TO = 19; // last hour bucket starts at 19:00
const LIST_LIMIT = 20;
const TREND_WEEKS = 8;

const dec = (value) => {
  try {
    const d = new Decimal(value ?? 0);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};
const money = (d) => dec(d).toDecimalPlaces(2).toNumber();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const fullName = (row, prefix = '') => {
  const first = row[`${prefix}first_name`];
  const last = row[`${prefix}last_name`];
  const composed = `${first || ''} ${last || ''}`.trim();
  return composed || (row[`${prefix}name`] || '').trim() || null;
};

const isDone = (row) => DONE_STATUSES.has(String(row.status || '').toLowerCase())
  || DONE_CHECKOUT.has(String(row.checkout_status || '').toLowerCase());
const isCheckedIn = (row) => String(row.checkin_status || '').toLowerCase() === 'checked-in'
  || String(row.status || '').toLowerCase() === 'checked-in';

const minutesOf = (startHour) => (Number.isFinite(Number(startHour)) ? Math.round(Number(startHour) * 60) : null);
const timeToMinutes = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};
const minutesToHHMM = (mins) => {
  if (mins === null || mins === undefined) return null;
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const dayOfWeek = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// ─── Queries ─────────────────────────────────────────────────────────────────

const LESSON_SELECT = `
  b.id, b.date::text AS date, b.start_hour, b.duration, b.status, b.payment_status,
  b.final_amount, b.amount, b.checkin_status, b.checkout_status, b.created_at,
  b.instructor_user_id, b.student_user_id, b.family_member_id, b.group_size,
  s.name AS service_name,
  iu.name AS i_name, iu.first_name AS i_first_name, iu.last_name AS i_last_name,
  su.name AS s_name, su.first_name AS s_first_name, su.last_name AS s_last_name,
  fm.full_name AS family_name,
  cu.name AS c_name, cu.first_name AS c_first_name, cu.last_name AS c_last_name,
  cr.name AS c_role,
  (SELECT COUNT(*)::int FROM booking_participants bp WHERE bp.booking_id = b.id) AS participant_count,
  (SELECT COALESCE(NULLIF(TRIM(CONCAT(pu.first_name, ' ', pu.last_name)), ''), pu.name)
     FROM booking_participants bp JOIN users pu ON pu.id = bp.user_id
    WHERE bp.booking_id = b.id
    ORDER BY bp.is_primary DESC NULLS LAST, bp.created_at ASC LIMIT 1) AS primary_participant`;

const LESSON_JOINS = `
  LEFT JOIN services s ON s.id = b.service_id
  LEFT JOIN users iu ON iu.id = b.instructor_user_id
  LEFT JOIN users su ON su.id = b.student_user_id
  LEFT JOIN family_members fm ON fm.id = b.family_member_id
  LEFT JOIN users cu ON cu.id = b.created_by
  LEFT JOIN roles cr ON cr.id = cu.role_id`;

function lessonLabel(row) {
  const name = row.primary_participant || row.family_name || fullName(row, 's_') || null;
  const size = Math.max(Number(row.participant_count) || 0, Number(row.group_size) || 1);
  return { name, others: Math.max(size - 1, 0) };
}

function mapLessonItem(row) {
  const start = minutesOf(row.start_hour);
  const { name, others } = lessonLabel(row);
  const amount = row.final_amount ?? row.amount;
  return {
    bookingId: row.id,
    date: row.date,
    startHour: formatHour(row.start_hour),
    endHour: start === null ? null : minutesToHHMM(start + Math.round(Number(row.duration || 0) * 60)),
    durationHours: round2(row.duration),
    status: row.status || 'pending',
    service: row.service_name || null,
    student: name,
    others,
    instructor: row.instructor_user_id ? { id: row.instructor_user_id, name: fullName(row, 'i_') } : null,
    bookedBy: row.c_name || row.c_first_name ? { name: fullName(row, 'c_'), role: row.c_role || null } : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    payment: {
      status: row.payment_status || null,
      amount: amount === null || amount === undefined ? null : money(amount),
    },
  };
}

async function loadDayLessons(day) {
  const { rows } = await pool.query(
    `SELECT ${LESSON_SELECT}
       FROM bookings b ${LESSON_JOINS}
      WHERE b.date = $1::date
        AND b.deleted_at IS NULL
        AND COALESCE(b.status, '') <> ALL($2::text[])
      ORDER BY b.start_hour ASC NULLS LAST, b.id`,
    [day, EXCLUDED_STATUSES],
  );
  return rows;
}

async function loadPendingToConfirm(today) {
  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${LESSON_SELECT}
         FROM bookings b ${LESSON_JOINS}
        WHERE b.status = 'pending'
          AND b.deleted_at IS NULL
          AND b.date >= $1::date
        ORDER BY b.date ASC, b.start_hour ASC NULLS LAST, b.id
        LIMIT ${LIST_LIMIT}`,
      [today],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM bookings
        WHERE status = 'pending' AND deleted_at IS NULL AND date >= $1::date`,
      [today],
    ),
  ]);
  return { count: count.rows[0]?.n || 0, items: list.rows.map(mapLessonItem) };
}

async function loadUnassigned(today) {
  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${LESSON_SELECT}
         FROM bookings b ${LESSON_JOINS}
        WHERE b.instructor_user_id IS NULL
          AND b.deleted_at IS NULL
          AND b.date >= $1::date
          AND COALESCE(b.status, '') <> ALL($2::text[])
          AND COALESCE(b.status, '') <> ALL($3::text[])
        ORDER BY b.date ASC, b.start_hour ASC NULLS LAST, b.id
        LIMIT ${LIST_LIMIT}`,
      [today, EXCLUDED_STATUSES, [...DONE_STATUSES]],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM bookings
        WHERE instructor_user_id IS NULL AND deleted_at IS NULL AND date >= $1::date
          AND COALESCE(status, '') <> ALL($2::text[]) AND COALESCE(status, '') <> ALL($3::text[])`,
      [today, EXCLUDED_STATUSES, [...DONE_STATUSES]],
    ),
  ]);
  return { count: count.rows[0]?.n || 0, rows: list.rows };
}

/**
 * Lessons that already ended (up to 7 days back) but were never closed: still
 * confirmed / checked in, not checked out. Today's lessons count once their end
 * time has passed in the business timezone.
 */
async function loadNotClosed(today, nowMinutes) {
  const params = [addDays(today, -7), today, nowMinutes, OPEN_FOR_CLOSING];
  const where = `
    b.deleted_at IS NULL
    AND b.date >= $1::date AND b.date <= $2::date
    AND LOWER(COALESCE(b.status, '')) = ANY($4::text[])
    AND LOWER(COALESCE(b.checkout_status, '')) NOT IN ('checked-out', 'early-checkout')
    AND (b.date < $2::date OR (COALESCE(b.start_hour, 0) + COALESCE(b.duration, 0)) * 60 <= $3)`;
  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${LESSON_SELECT} FROM bookings b ${LESSON_JOINS}
        WHERE ${where}
        ORDER BY b.date ASC, b.start_hour ASC NULLS LAST, b.id
        LIMIT ${LIST_LIMIT}`,
      params,
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM bookings b WHERE ${where}`, params),
  ]);
  return { count: count.rows[0]?.n || 0, items: list.rows.map(mapLessonItem) };
}

async function loadInstructors(day, lessonInstructorIds) {
  const [users, hours, timeOff] = await Promise.all([
    pool.query(
      `SELECT u.id, u.name, u.first_name, u.last_name, u.profile_image_url
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.deleted_at IS NULL
          AND COALESCE(u.account_status, 'active') NOT IN ('deleted', 'suspended', 'banned', 'disabled')
          AND (r.name = ANY($1::text[]) OR u.id = ANY($2::uuid[]))
        ORDER BY COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.name)`,
      [INSTRUCTOR_ROLE_NAMES, lessonInstructorIds],
    ),
    pool.query(
      `SELECT instructor_id, is_working, start_time::text AS start_time, end_time::text AS end_time
         FROM instructor_working_hours WHERE day_of_week = $1`,
      [dayOfWeek(day)],
    ),
    pool.query(
      `SELECT DISTINCT instructor_id FROM instructor_availability
        WHERE status = 'approved' AND start_date <= $1::date AND end_date >= $1::date`,
      [day],
    ),
  ]);
  const hoursById = new Map(hours.rows.map((r) => [r.instructor_id, r]));
  const offIds = new Set(timeOff.rows.map((r) => r.instructor_id));
  return users.rows.map((u) => {
    const wh = hoursById.get(u.id);
    const start = wh ? timeToMinutes(wh.start_time) : null;
    const end = wh ? timeToMinutes(wh.end_time) : null;
    const notWorking = wh ? wh.is_working === false : false;
    const capacityHours = wh && start !== null && end !== null && end > start
      ? round2((end - start) / 60)
      : DEFAULT_WORKING_HOURS;
    return {
      id: u.id,
      name: fullName(u),
      avatarUrl: u.profile_image_url || null,
      off: offIds.has(u.id) || notWorking,
      workStart: start,
      workEnd: end,
      capacityHours,
    };
  });
}

/** Same rule as waiverService.needsToSignWaiver, batched: latest waiver per signer. */
async function loadMissingWaivers(dayRows) {
  const open = dayRows.filter((r) => !isDone(r));
  if (!open.length) return { count: 0, items: [] };
  const ids = open.map((r) => r.id);
  const { rows: participants } = await pool.query(
    `SELECT bp.booking_id, bp.user_id, NULL::uuid AS family_member_id,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.name) AS name
       FROM booking_participants bp JOIN users u ON u.id = bp.user_id
      WHERE bp.booking_id = ANY($1::uuid[])`,
    [ids],
  );
  const withRows = new Set(participants.map((p) => p.booking_id));
  for (const r of open) {
    if (withRows.has(r.id) || !r.student_user_id) continue;
    participants.push({
      booking_id: r.id,
      user_id: r.family_member_id ? null : r.student_user_id,
      family_member_id: r.family_member_id || null,
      name: r.family_name || fullName(r, 's_'),
    });
  }
  const userIds = [...new Set(participants.map((p) => p.user_id).filter(Boolean))];
  const familyIds = [...new Set(participants.map((p) => p.family_member_id).filter(Boolean))];
  const [userWaivers, familyWaivers, version] = await Promise.all([
    userIds.length ? pool.query(
      `SELECT DISTINCT ON (user_id) user_id AS id, signed_at, waiver_version
         FROM liability_waivers WHERE user_id = ANY($1::uuid[])
        ORDER BY user_id, signed_at DESC`,
      [userIds],
    ) : { rows: [] },
    familyIds.length ? pool.query(
      `SELECT DISTINCT ON (family_member_id) family_member_id AS id, signed_at, waiver_version
         FROM liability_waivers WHERE family_member_id = ANY($1::uuid[])
        ORDER BY family_member_id, signed_at DESC`,
      [familyIds],
    ) : { rows: [] },
    pool.query(
      `SELECT version_number FROM waiver_versions
        WHERE is_active = true AND language_code = 'en'
        ORDER BY created_at DESC LIMIT 1`,
    ),
  ]);
  const latestVersion = version.rows[0]?.version_number || null;
  const signed = new Map([...userWaivers.rows, ...familyWaivers.rows].map((w) => [w.id, w]));
  const yearAgo = Date.now() - 365 * 86400000;
  const needs = (id) => {
    const w = signed.get(id);
    if (!w) return true;
    if (new Date(w.signed_at).getTime() < yearAgo) return true;
    return Boolean(latestVersion && w.waiver_version !== latestVersion);
  };
  const byBooking = new Map(dayRows.map((r) => [r.id, r]));
  const seen = new Set();
  const items = [];
  for (const p of participants) {
    const key = p.family_member_id ? `f:${p.family_member_id}` : `u:${p.user_id}`;
    if (seen.has(key) || !needs(p.family_member_id || p.user_id)) continue;
    seen.add(key);
    const lesson = byBooking.get(p.booking_id);
    items.push({
      bookingId: p.booking_id,
      userId: p.user_id,
      familyMemberId: p.family_member_id,
      name: p.name,
      startHour: lesson ? formatHour(lesson.start_hour) : null,
    });
  }
  items.sort((a, b) => String(a.startHour || '').localeCompare(String(b.startHour || '')));
  return { count: items.length, items: items.slice(0, LIST_LIMIT) };
}

async function loadPayoutRequests() {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.amount, pr.currency, pr.preferred_method, pr.created_at,
            u.id AS user_id, u.name, u.first_name, u.last_name
       FROM instructor_payout_requests pr
       JOIN users u ON u.id = pr.instructor_id
      WHERE pr.status = 'pending'
      ORDER BY pr.created_at ASC`,
  );
  const total = rows.reduce((acc, r) => acc.plus(dec(r.amount)), new Decimal(0));
  return {
    count: rows.length,
    amount: money(total),
    oldestAt: rows[0]?.created_at ? new Date(rows[0].created_at).toISOString() : null,
    items: rows.slice(0, LIST_LIMIT).map((r) => ({
      id: r.id,
      instructor: { id: r.user_id, name: fullName(r) },
      amount: money(r.amount),
      currency: r.currency || 'EUR',
      method: r.preferred_method || null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    })),
  };
}

async function loadRentals(now) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE start_date <= $1 AND end_date >= $1)::int AS out_now,
       COALESCE(SUM(total_price) FILTER (WHERE start_date <= $1 AND end_date >= $1), 0) AS out_value,
       COUNT(*) FILTER (WHERE end_date < $1)::int AS overdue,
       COUNT(*) FILTER (WHERE start_date > $1)::int AS upcoming
     FROM rentals
     WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'completed', 'returned', 'void')`,
    [now],
  );
  const { rows: overdueRows } = await pool.query(
    `SELECT r.id, r.end_date, u.name, u.first_name, u.last_name
       FROM rentals r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.end_date < $1
        AND LOWER(COALESCE(r.status, '')) NOT IN ('cancelled', 'canceled', 'completed', 'returned', 'void')
      ORDER BY r.end_date ASC LIMIT 5`,
    [now],
  );
  const row = rows[0] || {};
  return {
    out: row.out_now || 0,
    outValue: money(row.out_value),
    overdue: row.overdue || 0,
    upcoming: row.upcoming || 0,
    overdueItems: overdueRows.map((r) => ({
      id: r.id,
      customer: fullName(r),
      minutesLate: Math.max(Math.round((now.getTime() - new Date(r.end_date).getTime()) / 60000), 0),
    })),
  };
}

async function loadStays(day) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE check_in_date = $1::date)::int AS check_ins,
       COUNT(*) FILTER (WHERE check_out_date = $1::date)::int AS check_outs,
       COUNT(DISTINCT unit_id) FILTER (WHERE check_in_date <= $1::date AND check_out_date > $1::date)::int AS occupied,
       (SELECT COUNT(*)::int FROM accommodation_units
         WHERE LOWER(COALESCE(status, 'available')) NOT IN ('inactive', 'archived', 'deleted')) AS units
     FROM accommodation_bookings
     WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')`,
    [day],
  );
  const r = rows[0] || {};
  return { checkIns: r.check_ins || 0, checkOuts: r.check_outs || 0, occupied: r.occupied || 0, units: r.units || 0 };
}

async function loadGear() {
  const [equipment, products] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS n FROM equipment WHERE LOWER(COALESCE(condition, '')) = 'poor'`),
    pool.query(
      `SELECT name FROM products
        WHERE LOWER(COALESCE(status, 'active')) = 'active'
          AND stock_quantity IS NOT NULL
          AND stock_quantity <= COALESCE(low_stock_threshold, min_stock_level, 0)
        ORDER BY stock_quantity ASC, name ASC`,
    ),
  ]);
  return {
    needsService: equipment.rows[0]?.n || 0,
    lowStock: products.rows.length,
    lowStockItems: products.rows.slice(0, 3).map((p) => p.name),
  };
}

/** Same outstanding-balance definition as /finances/summary query #4 (EUR). */
async function loadOutstanding() {
  const { rows } = await pool.query(`
    WITH customer_wallets AS (
      SELECT u.id AS user_id,
             COALESCE(SUM(wb.available_amount / COALESCE(cs.exchange_rate, 1)), 0) AS balance
        FROM users u
        LEFT JOIN wallet_balances wb ON wb.user_id = u.id
        LEFT JOIN currency_settings cs ON cs.currency_code = wb.currency AND cs.is_active = true
       WHERE u.role_id IN (SELECT id FROM roles WHERE name IN ('student', 'outsider'))
         AND u.deleted_at IS NULL
       GROUP BY u.id
    )
    SELECT COUNT(*) FILTER (WHERE balance < 0)::int AS customers,
           COALESCE(SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END), 0) AS amount
      FROM customer_wallets`);
  return { amount: money(rows[0]?.amount), customers: rows[0]?.customers || 0 };
}

async function loadMoney(today) {
  const weekStart = startOfWeek(today);
  const trendStart = addDays(weekStart, -7 * (TREND_WEEKS - 1));
  const rows = await computeRevenueTrend({ dateStart: trendStart, dateEnd: today, groupBy: 'day' });
  const byDay = new Map(rows.map((r) => [r.period, dec(r.revenue)]));
  const sumRange = (from, to) => {
    let total = new Decimal(0);
    for (let d = from; d <= to; d = addDays(d, 1)) total = total.plus(byDay.get(d) || 0);
    return total;
  };
  const daysIntoWeek = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86400000);
  const trend = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const start = addDays(trendStart, i * 7);
    const end = addDays(start, 6) > today ? today : addDays(start, 6);
    return { weekStart: start, revenue: money(sumRange(start, end)) };
  });
  return {
    currency: 'EUR',
    revenueToday: money(byDay.get(today) || 0),
    revenueSameDayLastWeek: money(byDay.get(addDays(today, -7)) || 0),
    revenueWeek: money(sumRange(weekStart, today)),
    // Same number of days of last week (Mon … same weekday), so the comparison is fair.
    revenueLastWeekSameDays: money(sumRange(addDays(weekStart, -7), addDays(weekStart, -7 + daysIntoWeek))),
    trend,
  };
}

async function loadMyCommission(managerId, today) {
  try {
    const monthStart = `${today.slice(0, 7)}-01`;
    const [summary, owed] = await Promise.all([
      getManagerCommissionSummary(managerId, { startDate: monthStart, endDate: today }),
      getManagerOwedBalance(managerId),
    ]);
    return {
      month: today.slice(0, 7),
      earned: round2(summary?.totalEarned),
      owed: round2(owed?.amount),
      currency: summary?.currency || 'EUR',
    };
  } catch (error) {
    logger.warn('managerToday: commission lookup failed', { error: error?.message });
    return null;
  }
}

// ─── Assembly ────────────────────────────────────────────────────────────────

function lessonState(row, nowMinutes, isToday) {
  if (isDone(row)) return 'done';
  if (String(row.status || '').toLowerCase() === 'pending') return 'pending';
  const start = minutesOf(row.start_hour);
  const end = start === null ? null : start + Math.round(Number(row.duration || 0) * 60);
  if (isCheckedIn(row)) return 'now';
  if (isToday && start !== null && start <= nowMinutes && end > nowMinutes) return 'now';
  return 'confirmed';
}

function buildInstructorDay(instructors, dayRows, nowMinutes, isToday) {
  const byInstructor = new Map(instructors.map((i) => [i.id, { ...i, hours: 0, lessons: [] }]));
  for (const row of dayRows) {
    if (!row.instructor_user_id) continue;
    const entry = byInstructor.get(row.instructor_user_id);
    if (!entry) continue;
    const start = minutesOf(row.start_hour);
    const durationMin = Math.round(Number(row.duration || 0) * 60);
    entry.hours = round2(entry.hours + Number(row.duration || 0));
    entry.lessons.push({
      bookingId: row.id,
      start: start === null ? null : minutesToHHMM(start),
      end: start === null ? null : minutesToHHMM(start + durationMin),
      startMinutes: start,
      endMinutes: start === null ? null : start + durationMin,
      state: lessonState(row, nowMinutes, isToday),
      student: lessonLabel(row).name,
    });
  }
  return [...byInstructor.values()];
}

/** Has a lesson (any state) overlapping [fromMin, toMin). */
function busyAt(entry, fromMin, toMin) {
  return entry.lessons.some((l) => l.startMinutes !== null && l.startMinutes < toMin && l.endMinutes > fromMin);
}

function isWorkingAt(entry, minute) {
  if (entry.off) return false;
  if (entry.workStart === null || entry.workEnd === null) return true;
  return minute >= entry.workStart && minute < entry.workEnd;
}

function suggestFreeInstructor(entries, startMin, endMin) {
  const free = entries
    .filter((e) => !e.off && isWorkingAt(e, startMin) && !busyAt(e, startMin, endMin))
    .sort((a, b) => a.hours - b.hours);
  return free[0] ? { id: free[0].id, name: free[0].name } : null;
}

export async function getManagerToday({ date, now = new Date(), viewer = null } = {}) {
  const today = businessDate(now);
  const day = date && isPlainDate(date) ? date : today;
  const isToday = day === today;
  const nowMinutes = businessMinutes(now);
  // For another day "now" is before (future day) or after (past day) every lesson.
  const dayNow = isToday ? nowMinutes : (day > today ? -1 : 24 * 60 + 1);

  const dayRows = await loadDayLessons(day);
  const lessonInstructorIds = [...new Set(dayRows.map((r) => r.instructor_user_id).filter(Boolean))];

  // Two waves (~12 queries each) so one dashboard load never takes the whole
  // pool (max 20) during a busy morning.
  const [instructors, toConfirm, unassigned, notClosed, waivers, payoutRequests] = await Promise.all([
    loadInstructors(day, lessonInstructorIds),
    loadPendingToConfirm(today),
    loadUnassigned(today),
    loadNotClosed(today, nowMinutes),
    loadMissingWaivers(dayRows),
    loadPayoutRequests(),
  ]);
  const [rentals, stays, gear, outstanding, moneyBlock, myCommission] = await Promise.all([
    loadRentals(now),
    loadStays(day),
    loadGear(),
    loadOutstanding(),
    loadMoney(today),
    viewer?.role === 'manager' && viewer?.id ? loadMyCommission(viewer.id, today) : Promise.resolve(null),
  ]);

  const entries = buildInstructorDay(instructors, dayRows, dayNow, isToday);
  const working = entries.filter((e) => !e.off || e.lessons.length);

  // Right now (only meaningful for today).
  const running = isToday ? dayRows.filter((r) => lessonState(r, nowMinutes, true) === 'now') : [];
  const upcoming = isToday
    ? dayRows.filter((r) => !isDone(r) && minutesOf(r.start_hour) !== null && minutesOf(r.start_hour) > nowMinutes)
    : [];
  const busyNow = new Set(running.map((r) => r.instructor_user_id).filter(Boolean));
  const freeNow = isToday
    ? working.filter((e) => !busyNow.has(e.id) && isWorkingAt(e, nowMinutes)
      && !e.lessons.some((l) => l.startMinutes !== null && l.startMinutes <= nowMinutes && l.endMinutes > nowMinutes))
    : [];
  const next = upcoming[0] ? mapLessonItem(upcoming[0]) : null;

  // Capacity per hour: instructors with a lesson overlapping [h, h+1).
  const hourly = [];
  for (let h = HOURLY_FROM; h <= HOURLY_TO; h += 1) {
    const from = h * 60;
    const to = from + 60;
    hourly.push({
      hour: h,
      busy: working.filter((e) => busyAt(e, from, to)).length,
      total: working.filter((e) => !e.off).length || working.length,
    });
  }

  const bookedHours = round2(dayRows.filter((r) => r.instructor_user_id).reduce((acc, r) => acc + Number(r.duration || 0), 0));
  const availableHours = round2(working.filter((e) => !e.off).reduce((acc, e) => acc + e.capacityHours, 0));
  const overbooked = entries
    .filter((e) => e.hours > Math.max(e.capacityHours, DEFAULT_WORKING_HOURS))
    .map((e) => ({ id: e.id, name: e.name, hours: e.hours }));

  const unassignedItems = unassigned.rows.map((row) => {
    const item = mapLessonItem(row);
    const start = minutesOf(row.start_hour);
    if (row.date === day && start !== null) {
      item.suggested = suggestFreeInstructor(entries, start, start + Math.round(Number(row.duration || 0) * 60));
    } else {
      item.suggested = null;
    }
    return item;
  });

  const dayHours = round2(dayRows.reduce((acc, r) => acc + Number(r.duration || 0), 0));

  return {
    date: day,
    today,
    isToday,
    nowTime: minutesToHHMM(nowMinutes),
    generatedAt: now.toISOString(),
    summary: {
      lessons: dayRows.length,
      hours: dayHours,
      instructorsWorking: working.filter((e) => e.lessons.length > 0).length,
      instructorsTotal: entries.length,
      rentalsOut: rentals.out,
      stayCheckIns: stays.checkIns,
    },
    now: {
      inLesson: running.length,
      freeNow: { count: freeNow.length, names: freeNow.map((e) => e.name).slice(0, 8) },
      startingNextHour: upcoming.filter((r) => minutesOf(r.start_hour) <= nowMinutes + 60).length,
      next,
      running: running.slice(0, 5).map((r) => {
        const item = mapLessonItem(r);
        return { bookingId: item.bookingId, student: item.student, others: item.others, instructor: item.instructor?.name || null, until: item.endHour };
      }),
    },
    actions: {
      toConfirm,
      unassigned: { count: unassigned.count, items: unassignedItems },
      waivers,
      notClosed,
      payoutRequests,
      overbooked: { count: overbooked.length, items: overbooked },
    },
    instructors: entries.map((e) => ({
      id: e.id,
      name: e.name,
      initials: initialsOf(e.name),
      avatarUrl: e.avatarUrl,
      off: e.off && e.lessons.length === 0,
      hours: e.hours,
      capacityHours: e.capacityHours,
      lessons: e.lessons.map(({ startMinutes, endMinutes, ...l }) => l),
    })),
    capacity: {
      bookedHours,
      availableHours,
      percent: availableHours > 0 ? Math.round((bookedHours / availableHours) * 100) : 0,
    },
    hourly,
    money: { ...moneyBlock, outstanding },
    myCommission,
    rentals,
    stays,
    gear,
  };
}
