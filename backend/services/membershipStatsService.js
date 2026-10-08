// Membership overview for the staff Members page (GET /member-offerings/admin/stats).
//
// The stored member_purchases.status is never moved to 'expired' (nothing runs a
// status-sync job), so every figure here uses the EFFECTIVE status derived from
// the expiry date — the same rule as computed_status on GET /admin/purchases:
//   cancelled stays cancelled; no expiry → stored status; past expiry → expired.
// Deriving it in SQL (instead of a nightly job rewriting rows) means the status is
// always right at the moment it is read, and editing expires_at "re-activates" a
// membership without any extra step.
//
// Families and durations come from the offering, not its name or `period`:
//   beach   = group_key 'beach_pass'          storage = category 'storage'
//   duration bucket from duration_days (1 day, 7 week, ~30 month, ≥90 season, ≥360 year)
// (the `period` column is unreliable — a 7-day storage offer is stored as 'day').

import { pool } from '../db.js';

// Month / year boundaries for "new this month" and "sold" follow the business day.
const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul';

/** Effective status of a member_purchases row (alias `mp`). */
export const effectiveStatusSql = (alias = 'mp') => `(
  CASE
    WHEN ${alias}.status = 'cancelled' THEN 'cancelled'
    WHEN ${alias}.expires_at IS NULL THEN ${alias}.status
    WHEN ${alias}.expires_at < NOW() THEN 'expired'
    ELSE ${alias}.status
  END)`;

/** Family of an offering (alias `mo`): beach | storage | other. */
export const familySql = (alias = 'mo') => `(
  CASE
    WHEN ${alias}.category = 'storage' THEN 'storage'
    WHEN ${alias}.group_key = 'beach_pass' THEN 'beach'
    ELSE COALESCE(NULLIF(${alias}.category, ''), 'other')
  END)`;

/** Duration bucket of an offering (alias `mo`) from duration_days. */
export const durationBucketSql = (alias = 'mo') => `(
  CASE
    WHEN ${alias}.duration_days IS NULL THEN 'other'
    WHEN ${alias}.duration_days <= 1 THEN 'day'
    WHEN ${alias}.duration_days <= 7 THEN 'week'
    WHEN ${alias}.duration_days <= 45 THEN 'month'
    WHEN ${alias}.duration_days < 360 THEN 'season'
    ELSE 'year'
  END)`;

/** Status filter values accepted by GET /admin/purchases (?status=). */
export const PURCHASE_STATUS_FILTERS = ['active', 'expiring', 'expired', 'pending', 'cancelled', 'upcoming'];

/**
 * WHERE fragment for an effective-status filter, or null for "all".
 *  - active    effective active (includes expiring soon)
 *  - expiring  effective active and ending within `expiringDays` days
 *  - expired   past expiry (never cancelled)
 *  - pending   pending / pending_payment
 *  - upcoming  starts (purchased_at) in the future and not cancelled
 */
export function purchaseStatusWhere(status, { alias = 'mp', expiringDays = 30 } = {}) {
  const cs = effectiveStatusSql(alias);
  const days = Math.max(1, Math.min(Number(expiringDays) || 30, 365));
  switch (status) {
    case 'active': return `${cs} = 'active'`;
    case 'expiring': return `${cs} = 'active' AND ${alias}.expires_at IS NOT NULL AND ${alias}.expires_at < NOW() + INTERVAL '${days} days'`;
    case 'expired': return `${cs} = 'expired'`;
    case 'pending': return `${cs} IN ('pending', 'pending_payment')`;
    case 'cancelled': return `${cs} = 'cancelled'`;
    case 'upcoming': return `${alias}.status <> 'cancelled' AND ${alias}.purchased_at > NOW()`;
    default: return null;
  }
}

// Storage occupancy uses the SAME predicate as the box picker
// (GET /member-offerings/admin/:offeringId/storage-units): live statuses, not past expiry.
const LIVE_BOX_SQL = `mp.status IN ('active', 'pending', 'pending_payment')
  AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
  AND mp.storage_unit IS NOT NULL`;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (v) => Math.round(num(v) * 100) / 100;

/**
 * @param {{ db?: import('pg').Pool, expiringSoonDays?: number }} [options]
 */
export async function getMembershipStats({ db = pool } = {}) {
  const cs = effectiveStatusSql('mp');
  const family = familySql('mo');

  const [totalsRes, typesRes, boxesRes, renewalsRes, capacityRes] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${cs} = 'active')::int AS active,
        COUNT(DISTINCT mp.user_id) FILTER (WHERE ${cs} = 'active')::int AS active_people,
        COUNT(*) FILTER (WHERE ${cs} = 'active' AND mp.expires_at < NOW() + INTERVAL '7 days')::int AS expiring_7,
        COUNT(*) FILTER (WHERE ${cs} = 'active' AND mp.expires_at < NOW() + INTERVAL '30 days')::int AS expiring_30,
        COUNT(*) FILTER (WHERE ${cs} = 'expired')::int AS expired,
        COUNT(*) FILTER (WHERE ${cs} = 'expired' AND mp.expires_at > NOW() - INTERVAL '30 days')::int AS expired_recent,
        COUNT(*) FILTER (WHERE ${cs} IN ('pending', 'pending_payment'))::int AS pending,
        COUNT(*) FILTER (WHERE ${cs} = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE mp.status <> 'cancelled' AND mp.purchased_at > NOW())::int AS upcoming,
        COUNT(*) FILTER (WHERE ${family} = 'storage')::int AS storage_total,
        COUNT(*) FILTER (WHERE ${family} = 'storage' AND ${cs} = 'active')::int AS storage_active,
        COUNT(*) FILTER (WHERE ${family} = 'beach')::int AS beach_total,
        COUNT(*) FILTER (WHERE ${family} = 'beach' AND ${cs} = 'active')::int AS beach_active,
        COUNT(*) FILTER (WHERE mp.status <> 'cancelled' AND mp.purchased_at >= date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1)::int AS new_this_month,
        COALESCE(SUM(mp.offering_price) FILTER (WHERE mp.status <> 'cancelled' AND mp.purchased_at >= date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1), 0) AS sold_this_month,
        COALESCE(SUM(mp.offering_price) FILTER (WHERE mp.status <> 'cancelled' AND mp.purchased_at >= date_trunc('year', NOW() AT TIME ZONE $1) AT TIME ZONE $1), 0) AS sold_this_year,
        MODE() WITHIN GROUP (ORDER BY mp.offering_currency) AS currency
      FROM member_purchases mp
      LEFT JOIN member_offerings mo ON mo.id = mp.offering_id
    `, [BUSINESS_TZ]),
    db.query(`
      SELECT ${family} AS family, ${durationBucketSql('mo')} AS duration,
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE ${cs} = 'active')::int AS active
        FROM member_purchases mp
        LEFT JOIN member_offerings mo ON mo.id = mp.offering_id
       GROUP BY 1, 2
       ORDER BY 1, 2
    `),
    db.query(`
      SELECT mp.storage_unit AS unit,
             MIN(mp.expires_at) AS ends_at,
             MIN(mp.purchased_at) AS starts_at,
             COUNT(*)::int AS holders,
             (ARRAY_AGG(COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.name)
                        ORDER BY mp.expires_at NULLS LAST))[1] AS holder
        FROM member_purchases mp
        JOIN member_offerings mo ON mo.id = mp.offering_id AND mo.category = 'storage'
        LEFT JOIN users u ON u.id = mp.user_id
       WHERE ${LIVE_BOX_SQL}
       GROUP BY mp.storage_unit
       ORDER BY mp.storage_unit
    `),
    db.query(`
      SELECT mp.id, mp.user_id, mp.offering_id, mp.storage_unit, mp.expires_at,
             COALESCE(mp.offering_name, mo.name) AS offering_name,
             ${family} AS family,
             COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.name) AS user_name
        FROM member_purchases mp
        LEFT JOIN member_offerings mo ON mo.id = mp.offering_id
        LEFT JOIN users u ON u.id = mp.user_id
       WHERE ${cs} = 'active' AND mp.expires_at < NOW() + INTERVAL '7 days'
       ORDER BY mp.expires_at ASC
       LIMIT 20
    `),
    // Box numbers are shared across ALL storage offerings, so the physical
    // capacity is the largest total_capacity any storage offering carries.
    db.query(`SELECT MAX(total_capacity)::int AS capacity FROM member_offerings WHERE category = 'storage'`),
  ]);

  const r = totalsRes.rows[0] || {};
  const capacity = num(capacityRes.rows[0]?.capacity) || null;
  const weekAhead = Date.now() + 7 * 24 * 3600 * 1000;
  const boxes = boxesRes.rows.map((b) => {
    const ends = b.ends_at ? new Date(b.ends_at).getTime() : null;
    const starts = b.starts_at ? new Date(b.starts_at).getTime() : null;
    let state = 'used';
    if (starts && starts > Date.now()) state = 'starting';
    else if (ends && ends < weekAhead) state = 'ending';
    return {
      unit: num(b.unit),
      state,
      holders: num(b.holders),
      holder: b.holder || null,
      endsAt: b.ends_at ? new Date(b.ends_at).toISOString() : null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    currency: r.currency || 'EUR',
    total: num(r.total),
    active: num(r.active),
    activePeople: num(r.active_people),
    expiring7: num(r.expiring_7),
    expiring30: num(r.expiring_30),
    expired: num(r.expired),
    expiredRecent: num(r.expired_recent),
    pending: num(r.pending),
    cancelled: num(r.cancelled),
    upcoming: num(r.upcoming),
    storage: {
      memberships: num(r.storage_total),
      active: num(r.storage_active),
      inUse: boxes.length,
      capacity,
      boxes,
    },
    beach: { memberships: num(r.beach_total), active: num(r.beach_active) },
    newThisMonth: num(r.new_this_month),
    soldThisMonth: money(r.sold_this_month),
    soldThisYear: money(r.sold_this_year),
    types: typesRes.rows.map((t) => ({
      key: `${t.family}:${t.duration}`,
      family: t.family,
      duration: t.duration,
      count: num(t.count),
      active: num(t.active),
    })),
    renewalsDue: renewalsRes.rows.map((x) => ({
      id: x.id,
      userId: x.user_id,
      userName: x.user_name || null,
      offeringId: x.offering_id,
      offeringName: x.offering_name || null,
      family: x.family,
      storageUnit: x.storage_unit == null ? null : num(x.storage_unit),
      expiresAt: x.expires_at ? new Date(x.expires_at).toISOString() : null,
    })),
  };
}
