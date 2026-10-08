import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { cacheService } from './cacheService.js';
import { deriveLessonAmount, deriveTotalEarnings, toNumber as toNum, partialLessonValue } from '../utils/instructorEarnings.js';
import { discountSumLateral } from '../utils/discountAmounts.js';
import { MANAGER_COMMISSION_LIVE_GUARD_SQL } from './managerCommissionService.js';
import { getFinanceTotals } from './financeTotalsService.js';

// Bookings store a local date + start_hour; "now" is compared in the business timezone.
const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul';

const UPCOMING_LESSON_STATUSES = ['pending', 'scheduled', 'confirmed', 'in_progress'];
const ACTIVE_LESSON_STATUSES = ['in_progress', 'active'];
const COMPLETED_LESSON_STATUSES = ['completed', 'done', 'checked_out'];
const CANCELLED_LESSON_STATUSES = ['cancelled', 'canceled'];

// Rentals that are out with the customer right now regardless of dates
// ('overdue' = past end_date, not returned yet).
const ACTIVE_RENTAL_STATUSES = ['active', 'in_progress', 'overdue'];
// 'upcoming' is the status the rentals module writes (routes/rentals.js);
// pending/reserved/scheduled are legacy values kept for old rows.
const UPCOMING_RENTAL_STATUSES = ['upcoming', 'pending', 'reserved', 'scheduled'];
const COMPLETED_RENTAL_STATUSES = ['completed', 'returned', 'closed'];

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeTimestamp(value, { endOfDay = false } = {}) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  if (typeof value === 'string' && value.length <= 10) {
    if (endOfDay) {
      parsed.setUTCHours(23, 59, 59, 999);
    } else {
      parsed.setUTCHours(0, 0, 0, 0);
    }
  }

  return parsed.toISOString();
}

function toSqlTextArray(values) {
  return values
    .map((value) => `'${value.replace(/'/g, "''")}'`)
    .join(', ');
}

export async function getDashboardSummary({ startDate, endDate } = {}) {
  const startDateOnly = normalizeDateOnly(startDate);
  const endDateOnly = normalizeDateOnly(endDate);
  
  // Generate cache key based on date range
  const cacheKey = `dashboard:summary:${startDateOnly || 'all'}:${endDateOnly || 'all'}`;
  
  // Try cache first (cache for 2 minutes for real-time feel while reducing DB load)
  try {
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }
  } catch {
    // Cache miss or error, continue to fetch from DB
  }

  const startTimestamp = normalizeTimestamp(startDate);
  const endTimestamp = normalizeTimestamp(endDate, { endOfDay: true });

  const bookingParams = [];
  const bookingConditions = [];
  if (startDateOnly) {
    bookingParams.push(startDateOnly);
    bookingConditions.push(`date >= $${bookingParams.length}::date`);
  }
  if (endDateOnly) {
    bookingParams.push(endDateOnly);
    bookingConditions.push(`date <= $${bookingParams.length}::date`);
  }

  const bookingsQuery = `
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(COMPLETED_LESSON_STATUSES)}]) THEN 1 ELSE 0 END)::int AS completed,
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(CANCELLED_LESSON_STATUSES)}]) THEN 1 ELSE 0 END)::int AS cancelled,
      COALESCE(SUM(duration), 0)::numeric AS total_hours,
      COALESCE(SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(COMPLETED_LESSON_STATUSES)}]) THEN duration ELSE 0 END), 0)::numeric AS completed_hours,
      -- Only completed lessons contribute to revenue; previously cancelled /
      -- pending bookings' final_amount inflated the headline total_revenue.
      COALESCE(SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(COMPLETED_LESSON_STATUSES)}])
                        THEN GREATEST(COALESCE(final_amount, 0) - bk_disc.amt, 0) ELSE 0 END), 0)::numeric AS total_revenue
    FROM bookings
    ${discountSumLateral('bk_disc', 'booking', 'bookings.id')}
    ${bookingConditions.length ? `WHERE ${bookingConditions.join(' AND ')}` : ''}
  `;

  // Upcoming / running lessons are measured from NOW with no range end: the
  // dashboard range always ends today, which used to limit "upcoming" to the
  // rest of today. Lesson start/end are local (date + start_hour).
  const bookingsNowQuery = `
    WITH now_local AS (SELECT (NOW() AT TIME ZONE $1) AS ts),
    b AS (
      SELECT status,
             (date + COALESCE(start_hour, 0) * INTERVAL '1 hour') AS starts_at,
             (date + (COALESCE(start_hour, 0) + COALESCE(duration, 0)) * INTERVAL '1 hour') AS ends_at
        FROM bookings, now_local
       WHERE deleted_at IS NULL
         AND date >= now_local.ts::date - 1
    )
    SELECT
      COUNT(*) FILTER (WHERE b.status = ANY(ARRAY[${toSqlTextArray(UPCOMING_LESSON_STATUSES)}])
                         AND b.starts_at > now_local.ts)::int AS upcoming,
      COUNT(*) FILTER (WHERE b.status = ANY(ARRAY[${toSqlTextArray([...UPCOMING_LESSON_STATUSES, ...ACTIVE_LESSON_STATUSES, 'checked-in', 'checked_in'])}])
                         AND b.starts_at <= now_local.ts AND b.ends_at > now_local.ts)::int AS active
    FROM b, now_local
  `;

  // Rentals are "in" a date window when they overlap it — start_date <= rangeEnd
  // AND end_date >= rangeStart. The previous implementation required the rental to
  // fit fully inside the window, which dropped multi-month rentals from totals.
  const rentalParams = [];
  const rentalConditions = [];
  if (endTimestamp) {
    rentalParams.push(endTimestamp);
    rentalConditions.push(`start_date <= $${rentalParams.length}::timestamptz`);
  }
  if (startTimestamp) {
    rentalParams.push(startTimestamp);
    rentalConditions.push(`end_date >= $${rentalParams.length}::timestamptz`);
  }

  const rentalsQuery = `
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(COMPLETED_RENTAL_STATUSES)}]) THEN 1 ELSE 0 END)::int AS completed,
      -- Revenue must exclude cancelled/void rentals: their total_price is retained on
      -- the row (cancel only flips status), and the manager-commission leg already drops
      -- cancelled rentals, so counting them here over-stated Gross + Net Rental Revenue.
      COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'void') THEN GREATEST(COALESCE(total_price, 0) - rt_disc.amt, 0) ELSE 0 END), 0)::numeric AS total_revenue,
      COALESCE(SUM(CASE WHEN payment_status = ANY(ARRAY['paid', 'completed']) AND status NOT IN ('cancelled', 'void') THEN GREATEST(COALESCE(total_price, 0) - rt_disc.amt, 0) ELSE 0 END), 0)::numeric AS paid_revenue
    FROM rentals
    ${discountSumLateral('rt_disc', 'rental', 'rentals.id')}
    ${rentalConditions.length ? `WHERE ${rentalConditions.join(' AND ')}` : ''}
  `;

  // Active = out right now (an active/overdue status, or a booked rental whose
  // window contains now); upcoming = booked and starting later, no range end.
  const RENTAL_ACTIVE_NOW_SQL = `(status = ANY(ARRAY[${toSqlTextArray(ACTIVE_RENTAL_STATUSES)}])
      OR (status = ANY(ARRAY[${toSqlTextArray(UPCOMING_RENTAL_STATUSES)}]) AND start_date <= NOW() AND end_date >= NOW()))`;
  const RENTAL_UPCOMING_SQL = `(status = ANY(ARRAY[${toSqlTextArray(UPCOMING_RENTAL_STATUSES)}]) AND start_date > NOW())`;
  const rentalsNowQuery = `
    SELECT
      COUNT(*) FILTER (WHERE ${RENTAL_ACTIVE_NOW_SQL})::int AS active,
      COUNT(*) FILTER (WHERE ${RENTAL_UPCOMING_SQL})::int AS upcoming
    FROM rentals
  `;

  const managerCommissionParams = [];
  const managerCommissionConditions = [`mc.status <> 'cancelled'`];
  if (startDateOnly) {
    managerCommissionParams.push(startDateOnly);
    managerCommissionConditions.push(`mc.source_date >= $${managerCommissionParams.length}::date`);
  }
  if (endDateOnly) {
    managerCommissionParams.push(endDateOnly);
    managerCommissionConditions.push(`mc.source_date <= $${managerCommissionParams.length}::date`);
  }
  managerCommissionConditions.push(MANAGER_COMMISSION_LIVE_GUARD_SQL);
  const managerCommissionQuery = `
    SELECT COALESCE(SUM(mc.commission_amount), 0)::numeric AS total
    FROM manager_commissions mc
    WHERE ${managerCommissionConditions.join(' AND ')}
  `;

  const servicesQuery = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(DISTINCT category)::int AS categories,
      COUNT(*) FILTER (WHERE service_type = 'group')::int AS group_services,
      COUNT(*) FILTER (WHERE service_type = 'private')::int AS private_services
    FROM services
  `;

  const equipmentQuery = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE LOWER(availability) = 'available')::int AS available,
      COUNT(*) FILTER (WHERE LOWER(availability) IN ('maintenance', 'unavailable', 'reserved'))::int AS unavailable,
      COUNT(*) FILTER (WHERE LOWER(condition) IN ('needs repair', 'maintenance', 'poor'))::int AS needs_service
    FROM equipment
  `;

  const customersQuery = `
    SELECT
      COUNT(*) FILTER (WHERE r.name IN ('student', 'outsider', 'trusted_customer'))::int AS total_customers,
      COUNT(*) FILTER (WHERE r.name = 'student')::int AS students,
      COUNT(*) FILTER (WHERE r.name = 'outsider')::int AS outsiders,
      COUNT(*) FILTER (WHERE r.name = 'trusted_customer')::int AS trusted_customers,
      COUNT(*) FILTER (WHERE r.name = 'instructor')::int AS instructors,
      COUNT(*) FILTER (WHERE r.name IN ('admin', 'manager', 'owner'))::int AS staff,
      COUNT(*) FILTER (WHERE r.name IN ('student', 'outsider', 'trusted_customer') AND u.created_at >= date_trunc('month', CURRENT_DATE))::int AS new_this_month
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.deleted_at IS NULL
  `;

  // Category breakdown: completed booking hours grouped by service category
  const bookingCategoryQuery = `
    SELECT
      COALESCE(LOWER(s.category), 'other') AS category,
      COALESCE(SUM(b.duration), 0)::numeric AS hours,
      COUNT(*)::int AS count
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.status = ANY(ARRAY[${toSqlTextArray(COMPLETED_LESSON_STATUSES)}])
    ${bookingConditions.length ? `AND ${bookingConditions.map(c => c.replace(/^date\b/, 'b.date')).join(' AND ')}` : ''}
    GROUP BY LOWER(s.category)
    ORDER BY hours DESC
  `;

  // Rental service breakdown: active-now + upcoming rentals by rental service
  // (rentals.equipment_ids holds rental SERVICE ids). Same "now" definition as
  // the active/upcoming counts; it used to be empty because rentals with the
  // real 'upcoming' status were never matched.
  const rentalBreakdownQuery = `
    SELECT
      s.name AS service_name,
      COUNT(*)::int AS count
    FROM (
      SELECT * FROM rentals
       WHERE ${RENTAL_ACTIVE_NOW_SQL} OR ${RENTAL_UPCOMING_SQL}
    ) r, LATERAL jsonb_array_elements_text(r.equipment_ids) AS eid(id)
    LEFT JOIN services s ON s.id::text = eid.id
    WHERE r.equipment_ids IS NOT NULL AND jsonb_array_length(r.equipment_ids) > 0
    GROUP BY s.id, s.name
    ORDER BY count DESC
    LIMIT 15
  `;

  // Accommodation unit-level breakdown: nights per unit within date range
  const accommodationParams = [];
  const accommodationConditions = [];
  if (startDateOnly) {
    accommodationParams.push(startDateOnly);
    accommodationConditions.push(`ab.check_in_date >= $${accommodationParams.length}::date`);
  }
  if (endDateOnly) {
    accommodationParams.push(endDateOnly);
    accommodationConditions.push(`ab.check_in_date <= $${accommodationParams.length}::date`);
  }

  const accommodationQuery = `
    SELECT
      au.name AS unit_name,
      COUNT(ab.id)::int AS booking_count,
      COALESCE(SUM(ab.check_out_date - ab.check_in_date), 0)::int AS total_nights
    FROM accommodation_bookings ab
    JOIN accommodation_units au ON au.id = ab.unit_id
    WHERE ab.status NOT IN ('cancelled')
    ${accommodationConditions.length ? `AND ${accommodationConditions.join(' AND ')}` : ''}
    GROUP BY au.id, au.name
    ORDER BY total_nights DESC
    LIMIT 10
  `;

  // Membership offering breakdown: active and total purchases grouped by offering
  const membershipParams = [];
  const membershipConditions = [];
  if (startTimestamp) {
    membershipParams.push(startTimestamp);
    membershipConditions.push(`mp.purchased_at >= $${membershipParams.length}::timestamptz`);
  }
  if (endTimestamp) {
    membershipParams.push(endTimestamp);
    membershipConditions.push(`mp.purchased_at <= $${membershipParams.length}::timestamptz`);
  }

  // Active members = memberships active right now, whatever their purchase
  // date; total_purchased = bought inside the selected range ("new in range").
  const membershipInRange = membershipConditions.length ? membershipConditions.join(' AND ') : 'TRUE';
  const MEMBER_ACTIVE_SQL = `mp.status = 'active' AND (mp.expires_at IS NULL OR mp.expires_at > NOW())`;
  const membershipQuery = `
    SELECT
      COALESCE(mo.name, 'Unknown') AS offering_name,
      COUNT(*) FILTER (WHERE ${MEMBER_ACTIVE_SQL})::int AS active_count,
      COUNT(*) FILTER (WHERE ${membershipInRange})::int AS total_purchased
    FROM member_purchases mp
    LEFT JOIN member_offerings mo ON mo.id = mp.offering_id
    GROUP BY mo.id, mo.name
    HAVING COUNT(*) FILTER (WHERE ${MEMBER_ACTIVE_SQL}) > 0
        OR COUNT(*) FILTER (WHERE ${membershipInRange}) > 0
    ORDER BY active_count DESC, total_purchased DESC
    LIMIT 10
  `;

  // Shop customer count from user_tags
  const shopCustomersQuery = `
    SELECT COUNT(DISTINCT user_id)::int AS total
    FROM user_tags
    WHERE tag = 'shop_customer'
  `;

  // Instructor commission data: all completed bookings with commission info
  const instructorCommParams = [];
  const instructorCommConditions = ['b.deleted_at IS NULL', `b.status = ANY(ARRAY[${toSqlTextArray(COMPLETED_LESSON_STATUSES)}])`];
  if (startDateOnly) {
    instructorCommParams.push(startDateOnly);
    instructorCommConditions.push(`b.date >= $${instructorCommParams.length}::date`);
  }
  if (endDateOnly) {
    instructorCommParams.push(endDateOnly);
    instructorCommConditions.push(`b.date <= $${instructorCommParams.length}::date`);
  }
  const instructorCommQuery = `
    SELECT
      b.duration as lesson_duration,
      GREATEST(COALESCE(b.final_amount, b.amount, 0) - bk_disc.amt, 0) as base_amount,
      b.payment_status,
      b.group_size,
      CASE
        WHEN cp.currency IS NOT NULL AND cp.currency != 'EUR' AND cs_pkg.exchange_rate > 0
        THEN ROUND(GREATEST(cp.purchase_price - cp_disc.amt, 0) / cs_pkg.exchange_rate, 2)
        ELSE cp.purchase_price - cp_disc.amt
      END as package_price,
      cp.total_hours as package_total_hours,
      cp.remaining_hours as package_remaining_hours,
      cp.used_hours as package_used_hours,
      sp.sessions_count as package_sessions_count,
      sp.package_hourly_rate as pkg_hourly_rate,
      COALESCE(sp.rental_days, 0) as pkg_rental_days,
      COALESCE(sp.accommodation_nights, 0) as pkg_accom_nights,
      COALESCE(rental_srv.price, 0) as pkg_rental_daily_rate,
      COALESCE(accom_unit.price_per_night, 0) as pkg_accom_nightly_rate,
      srv.duration as fallback_session_duration,
      srv.price as service_price,
      COALESCE(bcc.commission_value, isc.commission_value, icr.rate_value,
        -- Rescue is captain-rate-only: no rescue rate ⇒ €0 (no default fallback).
        (CASE WHEN srv.lesson_category_tag = 'rescue_boat' THEN NULL ELSE idc.commission_value END), 0) as commission_rate,
      COALESCE(bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed') as commission_type
    FROM bookings b
    LEFT JOIN services srv ON srv.id = b.service_id
    LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
    LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
    LEFT JOIN services rental_srv ON rental_srv.id = sp.rental_service_id
    LEFT JOIN accommodation_units accom_unit ON accom_unit.id = sp.accommodation_unit_id
    LEFT JOIN currency_settings cs_pkg ON cs_pkg.currency_code = cp.currency
    LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
    LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
    LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = (
      CASE
        WHEN srv.lesson_category_tag = 'supervision' AND COALESCE(b.group_size, 1) > 1
          THEN 'semi-private-supervision'
        ELSE srv.lesson_category_tag
      END
    )
    LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
    ${discountSumLateral('bk_disc', 'booking', 'b.id')}
    ${discountSumLateral('cp_disc', 'customer_package', 'cp.id')}
    WHERE b.instructor_user_id IS NOT NULL AND ${instructorCommConditions.join(' AND ')}
  `;

  const [bookingsResult, bookingsNowResult, rentalsResult, rentalsNowResult, financeTotals, servicesResult, equipmentResult, customersResult, bookingCategoryResult, rentalBreakdownResult, accommodationResult, membershipResult, shopCustomersResult, instructorCommResult, managerCommResult] = await Promise.all([
    pool.query(bookingsQuery, bookingParams),
    pool.query(bookingsNowQuery, [BUSINESS_TZ]),
    pool.query(rentalsQuery, rentalParams),
    pool.query(rentalsNowQuery),
    getFinanceTotals({ startDate: startDateOnly, endDate: endDateOnly }),
    pool.query(servicesQuery),
    pool.query(equipmentQuery),
    pool.query(customersQuery),
    pool.query(bookingCategoryQuery, bookingParams),
    pool.query(rentalBreakdownQuery),
    pool.query(accommodationQuery, accommodationParams),
    pool.query(membershipQuery, membershipParams),
    pool.query(shopCustomersQuery),
    pool.query(instructorCommQuery, instructorCommParams),
    pool.query(managerCommissionQuery, managerCommissionParams)
  ]);

  const bookingsRow = bookingsResult.rows[0] || {};
  const rentalsRow = rentalsResult.rows[0] || {};
  const bookingsNowRow = bookingsNowResult.rows[0] || {};
  const rentalsNowRow = rentalsNowResult.rows[0] || {};
  const servicesRow = servicesResult.rows[0] || {};
  const equipmentRow = equipmentResult.rows[0] || {};
  const customersRow = customersResult.rows[0] || {};

  // Compute total instructor commissions owed and gross lesson revenue
  let totalInstructorCommissions = 0;
  let totalGrossLessonRevenue = 0;
  for (const row of instructorCommResult.rows) {
    const lessonDuration = toNum(row.lesson_duration);
    const groupSize = Math.max(1, toNum(row.group_size) || 1);

    let effectivePackagePrice = toNum(row.package_price);
    const isPackageOrPartial = (row.payment_status === 'package' || row.payment_status === 'partial') && effectivePackagePrice > 0;
    if (isPackageOrPartial) {
      const storedHourlyRate = toNum(row.pkg_hourly_rate);
      const pkgTotalHours = toNum(row.package_total_hours);
      if (storedHourlyRate > 0 && pkgTotalHours > 0) {
        effectivePackagePrice = storedHourlyRate * pkgTotalHours;
      } else {
        const rentalCost = toNum(row.pkg_rental_days) * toNum(row.pkg_rental_daily_rate);
        const accomCost = toNum(row.pkg_accom_nights) * toNum(row.pkg_accom_nightly_rate);
        if (rentalCost + accomCost > 0) {
          effectivePackagePrice = Math.max(0, effectivePackagePrice - rentalCost - accomCost);
        }
      }
    }

    const isPartial = row.payment_status === 'partial' && isPackageOrPartial;
    let lessonAmount = deriveLessonAmount({
      paymentStatus: isPartial ? 'package' : row.payment_status,
      duration: lessonDuration,
      baseAmount: isPartial ? 0 : toNum(row.base_amount),
      packagePrice: effectivePackagePrice,
      packageTotalHours: toNum(row.package_total_hours),
      packageRemainingHours: toNum(row.package_remaining_hours),
      packageUsedHours: toNum(row.package_used_hours),
      packageSessionsCount: toNum(row.package_sessions_count),
      fallbackSessionDuration: toNum(row.fallback_session_duration) || lessonDuration,
      servicePrice: toNum(row.service_price),
      serviceDuration: toNum(row.fallback_session_duration),
    });
    // M1: value package-drawn hours + cash via the shared helper instead of
    // stacking the full cash on the full-duration package value (was a double-
    // count that inflated the dashboard "commissions owed" KPI).
    if (isPartial && toNum(row.base_amount) > 0) {
      lessonAmount = partialLessonValue({ packageValueFullDuration: lessonAmount, duration: lessonDuration, cashAmount: toNum(row.base_amount) });
    }
    if (row.payment_status === 'package' && groupSize > 1) {
      lessonAmount = Number.parseFloat((lessonAmount * groupSize).toFixed(2));
    }
    totalGrossLessonRevenue += lessonAmount;
    totalInstructorCommissions += deriveTotalEarnings({
      lessonAmount,
      commissionRate: toNum(row.commission_rate),
      commissionType: row.commission_type,
      lessonDuration,
    });
  }
  totalInstructorCommissions = Number(totalInstructorCommissions.toFixed(2));
  totalGrossLessonRevenue = Number(totalGrossLessonRevenue.toFixed(2));

  const lessons = {
    total: toNumber(bookingsRow.total),
    completed: toNumber(bookingsRow.completed),
    upcoming: toNumber(bookingsNowRow.upcoming),
    active: toNumber(bookingsNowRow.active),
    cancelled: toNumber(bookingsRow.cancelled),
    totalHours: toNumber(bookingsRow.total_hours),
    completedHours: toNumber(bookingsRow.completed_hours),
    totalRevenue: toNumber(bookingsRow.total_revenue)
  };
  lessons.averageDuration = lessons.total > 0 ? lessons.totalHours / lessons.total : 0;
  lessons.completionRate = lessons.total > 0 ? lessons.completed / lessons.total : 0;
  lessons.categoryBreakdown = (bookingCategoryResult.rows || []).map(row => ({
    category: row.category,
    hours: toNumber(row.hours),
    count: toNumber(row.count)
  }));

  const rentals = {
    total: toNumber(rentalsRow.total),
    active: toNumber(rentalsNowRow.active),
    upcoming: toNumber(rentalsNowRow.upcoming),
    completed: toNumber(rentalsRow.completed),
    totalRevenue: toNumber(rentalsRow.total_revenue),
    paidRevenue: toNumber(rentalsRow.paid_revenue)
  };
  rentals.averageRevenue = rentals.total > 0 ? rentals.totalRevenue / rentals.total : 0;
  rentals.serviceBreakdown = (rentalBreakdownResult.rows || []).map(row => ({
    serviceName: row.service_name,
    count: toNumber(row.count)
  }));

  const managerCommissionTotal = toNumber((managerCommResult.rows[0] || {}).total);
  // Headline money comes from the shared finance totals (same definition as
  // GET /finances/summary), replacing the legacy `transactions` table that no
  // code writes any more (it made Net Revenue "0 − manager commission").
  //   income       = total revenue of services consumed
  //   expenses     = −(refunds + instructor commission + manager commission), money out
  //   net          = revenue − refunds − instructor commission − manager commission
  //                  (the "Net Revenue" of the Finances page and the /dashboard KPI)
  //   transactions = wallet ledger rows counted by /finances/summary
  const revenue = {
    transactions: financeTotals.transactions,
    income: financeTotals.totalRevenue,
    expenses: new Decimal(financeTotals.refunds).plus(financeTotals.instructorCommission)
      .plus(financeTotals.managerCommission).negated().toDecimalPlaces(2).toNumber(),
    net: financeTotals.net,
    refunds: financeTotals.refunds,
    serviceRevenue: financeTotals.lessonRevenue,
    rentalRevenue: financeTotals.rentalRevenue,
    // Earned by instructors on completed lessons in the range (lesson finance
    // ledger); previously read from the empty legacy table, so always 0.
    instructorPayouts: financeTotals.instructorCommission,
    instructorCommissions: totalInstructorCommissions,
    managerCommission: managerCommissionTotal,
    grossLessonRevenue: totalGrossLessonRevenue
  };

  const services = {
    total: toNumber(servicesRow.total),
    categories: toNumber(servicesRow.categories),
    groupServices: toNumber(servicesRow.group_services),
    privateServices: toNumber(servicesRow.private_services)
  };

  const equipment = {
    total: toNumber(equipmentRow.total),
    available: toNumber(equipmentRow.available),
    unavailable: toNumber(equipmentRow.unavailable),
    needsService: toNumber(equipmentRow.needs_service)
  };

  const customers = {
    totalCustomers: toNumber(customersRow.total_customers),
    students: toNumber(customersRow.students),
    outsiders: toNumber(customersRow.outsiders),
    trustedCustomers: toNumber(customersRow.trusted_customers),
    instructors: toNumber(customersRow.instructors),
    staff: toNumber(customersRow.staff),
    newThisMonth: toNumber(customersRow.new_this_month)
  };

  const accommodationUnits = (accommodationResult.rows || []).map(row => ({
    unitName: row.unit_name,
    bookingCount: toNumber(row.booking_count),
    totalNights: toNumber(row.total_nights),
  }));
  const accommodation = {
    totalBookings: accommodationUnits.reduce((s, u) => s + u.bookingCount, 0),
    totalNights: accommodationUnits.reduce((s, u) => s + u.totalNights, 0),
    unitBreakdown: accommodationUnits,
  };

  const membershipRows = (membershipResult.rows || []).map(row => ({
    offeringName: row.offering_name,
    activeCount: toNumber(row.active_count),
    totalPurchased: toNumber(row.total_purchased),
  }));
  const membership = {
    totalActive: membershipRows.reduce((s, m) => s + m.activeCount, 0),
    newInRange: membershipRows.reduce((s, m) => s + m.totalPurchased, 0),
    offeringBreakdown: membershipRows,
  };

  const shopCustomers = {
    total: toNumber((shopCustomersResult.rows[0] || {}).total),
  };

  const rangeProvided = Boolean(startDateOnly || endDateOnly);

  const result = {
    timeframe: {
      range: rangeProvided ? 'custom' : 'lifetime',
      start: startDateOnly || null,
      end: endDateOnly || null
    },
    generatedAt: new Date().toISOString(),
    lessons,
    rentals,
    revenue,
    services,
    equipment,
    customers,
    accommodation,
    membership,
    shopCustomers
  };

  // Cache for 2 minutes (120 seconds) - balances freshness with performance
  try {
    await cacheService.set(cacheKey, result, 120);
  } catch {
    // Cache write failed, continue anyway
  }

  return result;
}
