// Customer segments for the staff Customers page.
//
// One derived table (customerActivitySql) gives, per customer, what they use and
// how recently: lessons, shop, beach & storage memberships, rentals, stays, the
// last activity date and an approximate lifetime spend. It feeds both the segment
// counts (GET /users/customers/segments) and the per-row columns + filters of
// GET /users/customers/list (?insights=1).
//
// Definitions (all ignore cancelled / soft-deleted rows):
//   lessons   student on a booking, or a participant of one
//   shop      a shop order not cancelled / refunded
//   members   any membership purchase (activeMember: still valid now)
//   rentals   a rental; stays: an accommodation booking (guest)
//   lastActivity  latest of: lesson date ≤ today, shop order, rental start ≤ today,
//                 membership purchase ≤ now, stay check-in ≤ today
//   active30  lastActivity within 30 days, any booked lesson from 30 days ago on
//             (incl. upcoming), or a membership valid now
//   lifetimeSpend completed lessons (student) + rentals + shop + memberships + stays,
//             at list price (the wallet ledger stays the money-exact source)
// Dates are business-timezone 'YYYY-MM-DD' strings (businessDate), inlined after a
// strict format check so the fragment can be embedded in queries with their own
// positional parameters.

import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { businessDate } from './instructorPayoutService.js';

const CUSTOMER_ROLES_SQL = "('student', 'outsider', 'trusted_customer')";
const LESSON_EXCLUDED = "('cancelled', 'canceled')";
const LESSON_COMPLETED = "('completed', 'done', 'checked_out', 'checked-out')";

const isoDate = (value) => {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Invalid date: ${s}`);
  return s;
};

export function businessDates(now = new Date()) {
  const today = businessDate(now);
  const d = new Date(`${today}T00:00:00Z`);
  const minus30 = new Date(d.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  return { today, minus30, monthStart };
}

/** Wallet balance of a customer in EUR (same expression as the customers list). */
export const WALLET_EUR_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT SUM(
      CASE
        WHEN wb.currency = 'EUR' THEN wb.available_amount
        WHEN cs.exchange_rate IS NOT NULL AND cs.exchange_rate > 0 THEN wb.available_amount / cs.exchange_rate
        ELSE wb.available_amount
      END
    ) AS bal_eur
    FROM wallet_balances wb
    LEFT JOIN currency_settings cs ON cs.currency_code = wb.currency
    WHERE wb.user_id = u.id
  ) wbal ON true`;

/**
 * Per-customer activity, one row per user id (column `uid`). Embed as a derived
 * table: `LEFT JOIN (${customerActivitySql(dates)}) ca ON ca.uid = u.id`.
 */
export function customerActivitySql({ today, minus30 }) {
  const t = isoDate(today);
  const m30 = isoDate(minus30);
  return `
    SELECT x.uid,
           BOOL_OR(x.kind = 'lesson') AS has_lessons,
           BOOL_OR(x.kind = 'shop') AS has_shop,
           BOOL_OR(x.kind = 'member') AS has_member,
           BOOL_OR(x.kind = 'member' AND x.valid_now) AS active_member,
           BOOL_OR(x.kind = 'rental') AS has_rentals,
           BOOL_OR(x.kind = 'stay') AS has_stays,
           MAX(x.activity_date) FILTER (WHERE x.activity_date <= '${t}'::date) AS last_activity,
           BOOL_OR(x.kind = 'lesson' AND x.activity_date >= '${m30}'::date) AS recent_lesson,
           COALESCE(SUM(x.spend), 0) AS lifetime_spend
      FROM (
        SELECT b.student_user_id AS uid, 'lesson' AS kind, b.date AS activity_date, false AS valid_now,
               CASE WHEN b.status IN ${LESSON_COMPLETED} THEN COALESCE(b.final_amount, b.amount, 0) ELSE 0 END AS spend
          FROM bookings b
         WHERE b.deleted_at IS NULL AND b.student_user_id IS NOT NULL
           AND COALESCE(b.status, '') NOT IN ${LESSON_EXCLUDED}
        UNION ALL
        SELECT bp.user_id, 'lesson', b.date, false, 0
          FROM booking_participants bp
          JOIN bookings b ON b.id = bp.booking_id
         WHERE b.deleted_at IS NULL AND bp.user_id IS NOT NULL
           AND bp.user_id IS DISTINCT FROM b.student_user_id
           AND COALESCE(b.status, '') NOT IN ${LESSON_EXCLUDED}
        UNION ALL
        SELECT so.user_id, 'shop', (so.created_at)::date, false, COALESCE(so.total_amount, 0)
          FROM shop_orders so
         WHERE so.user_id IS NOT NULL AND COALESCE(so.status, '') NOT IN ('cancelled', 'refunded')
        UNION ALL
        SELECT mp.user_id, 'member', (mp.purchased_at)::date,
               (mp.expires_at IS NULL OR mp.expires_at >= NOW()),
               COALESCE(mp.offering_price, 0)
          FROM member_purchases mp
         WHERE mp.user_id IS NOT NULL AND mp.status <> 'cancelled'
        UNION ALL
        SELECT r.user_id, 'rental', (r.start_date)::date, false, COALESCE(r.total_price, 0)
          FROM rentals r
         WHERE r.user_id IS NOT NULL AND COALESCE(r.status, '') NOT IN ('cancelled', 'canceled')
        UNION ALL
        SELECT ab.guest_id, 'stay', ab.check_in_date, false, COALESCE(ab.total_price, 0)
          FROM accommodation_bookings ab
         WHERE ab.guest_id IS NOT NULL AND COALESCE(ab.status, '') NOT IN ('cancelled', 'canceled')
      ) x
     GROUP BY x.uid`;
}

/** SQL boolean: the customer was active in the last 30 days (alias `ca`). */
export const active30Sql = (minus30) => `(
  COALESCE(ca.last_activity >= '${isoDate(minus30)}'::date, false)
  OR COALESCE(ca.recent_lesson, false)
  OR COALESCE(ca.active_member, false))`;

/** Customer segment filter values accepted by the list endpoint (?segment=). */
export const CUSTOMER_SEGMENTS = ['lessons', 'shop', 'members', 'rentals', 'stays', 'owes', 'credit', 'new', 'none'];

/**
 * WHERE fragment for a segment filter (aliases: ca = activity, u = users,
 * balanceExpr = the wallet balance expression), or null.
 */
export function segmentWhere(segment, { balanceExpr, monthStart }) {
  switch (segment) {
    case 'lessons': return 'COALESCE(ca.has_lessons, false)';
    case 'shop': return 'COALESCE(ca.has_shop, false)';
    case 'members': return 'COALESCE(ca.has_member, false)';
    case 'rentals': return 'COALESCE(ca.has_rentals, false)';
    case 'stays': return 'COALESCE(ca.has_stays, false)';
    case 'owes': return `(${balanceExpr}) < 0`;
    case 'credit': return `(${balanceExpr}) > 0`;
    case 'new': return `u.created_at >= '${isoDate(monthStart)}'::date`;
    case 'none': return 'ca.uid IS NULL';
    default: return null;
  }
}

/** Segment list of one row returned with ?insights=1 (fixed order). */
export function rowSegments(row) {
  const out = [];
  if (row.has_lessons) out.push('lessons');
  if (row.has_shop) out.push('shop');
  if (row.has_member) out.push(row.active_member ? 'member_active' : 'member');
  if (row.has_rentals) out.push('rentals');
  if (row.has_stays) out.push('stays');
  return out;
}

const n = (v) => Number(v) || 0;

/** Counts for the segment tiles. */
export async function getCustomerSegmentCounts({ db = pool, now = new Date() } = {}) {
  const dates = businessDates(now);
  const balanceExpr = 'COALESCE(wbal.bal_eur, u.balance, 0)';
  const { rows } = await db.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE r.name = 'student')::int AS students,
      COUNT(*) FILTER (WHERE r.name = 'trusted_customer')::int AS trusted,
      COUNT(*) FILTER (WHERE r.name = 'outsider')::int AS outsiders,
      COUNT(*) FILTER (WHERE COALESCE(ca.has_lessons, false))::int AS lessons,
      COUNT(*) FILTER (WHERE COALESCE(ca.has_shop, false))::int AS shop,
      COUNT(*) FILTER (WHERE COALESCE(ca.has_member, false))::int AS members,
      COUNT(*) FILTER (WHERE COALESCE(ca.active_member, false))::int AS members_active,
      COUNT(*) FILTER (WHERE COALESCE(ca.has_rentals, false))::int AS rentals,
      COUNT(*) FILTER (WHERE COALESCE(ca.has_stays, false))::int AS stays,
      COUNT(*) FILTER (WHERE ${active30Sql(dates.minus30)})::int AS active30,
      COUNT(*) FILTER (WHERE ca.uid IS NULL)::int AS no_activity,
      COUNT(*) FILTER (WHERE ${balanceExpr} < 0)::int AS owes,
      COALESCE(SUM(${balanceExpr}) FILTER (WHERE ${balanceExpr} < 0), 0) AS owes_total,
      COUNT(*) FILTER (WHERE ${balanceExpr} > 0)::int AS credit,
      COALESCE(SUM(${balanceExpr}) FILTER (WHERE ${balanceExpr} > 0), 0) AS credit_total,
      COUNT(*) FILTER (WHERE u.created_at >= '${dates.monthStart}'::date)::int AS new_this_month,
      MAX(u.created_at) AS last_created_at
    FROM users u
    JOIN roles r ON r.id = u.role_id
    ${WALLET_EUR_LATERAL}
    LEFT JOIN (${customerActivitySql(dates)}) ca ON ca.uid = u.id
    WHERE r.name IN ${CUSTOMER_ROLES_SQL} AND u.deleted_at IS NULL
  `);
  const row = rows[0] || {};
  const total = n(row.total);
  const active30 = n(row.active30);
  return {
    asOf: dates.today,
    currency: 'EUR',
    total,
    roles: { students: n(row.students), trusted: n(row.trusted), outsiders: n(row.outsiders) },
    segments: {
      lessons: n(row.lessons),
      shop: n(row.shop),
      members: n(row.members),
      membersActive: n(row.members_active),
      rentals: n(row.rentals),
      stays: n(row.stays),
    },
    active30,
    inactive30: Math.max(total - active30, 0),
    noActivity: n(row.no_activity),
    owes: { count: n(row.owes), total: new Decimal(row.owes_total || 0).abs().toDecimalPlaces(2).toNumber() },
    credit: { count: n(row.credit), total: new Decimal(row.credit_total || 0).toDecimalPlaces(2).toNumber() },
    newThisMonth: n(row.new_this_month),
    lastCreatedAt: row.last_created_at ? new Date(row.last_created_at).toISOString() : null,
  };
}
