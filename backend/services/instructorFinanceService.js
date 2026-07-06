import { pool } from '../db.js';
import { deriveLessonAmount, deriveTotalEarnings, toNumber, partialLessonValue } from '../utils/instructorEarnings.js';
import { discountSumLateral } from '../utils/discountAmounts.js';
import { MANAGER_COMMISSION_LIVE_GUARD_SQL } from './managerCommissionService.js';

// A lesson is "completed" (and therefore earns the instructor commission) when it
// reaches ANY terminal-completed status — not just 'completed'. The booking cascade
// credits the instructor (and the manager commission) for 'done'/'checked_out' too
// (see bookings.js COMPLETED_BOOKING_STATUSES + serviceRevenueLedger), so the
// earnings engine MUST count the same set or the instructor dashboard / payroll /
// balances under-count by silently dropping done/checked_out lessons.
const COMPLETED_BOOKING_STATUSES = ['completed', 'done', 'checked_out'];

const mapEarningRow = (row) => {
  const lessonDuration = toNumber(row.lesson_duration);
  const baseAmount = toNumber(row.base_amount);
  const commissionRate = toNumber(row.commission_rate);
  const commissionType = row.commission_type || 'fixed';
  const groupSize = Math.max(1, toNumber(row.group_size) || 1);

  // For combo/all-inclusive packages, derive lesson-only portion of the price.
  // `package_price` is already discount-adjusted (cp.purchase_price - cp_disc.amt).
  let effectivePackagePrice = toNumber(row.package_price);
  // K3: the discount ratio (post-discount base / full price). The stored
  // hourly-rate branch derives off the FULL rate, so we must re-apply this
  // ratio or the displayed earnings ignore the package discount entirely
  // (over-displaying vs the stored snapshot + manager commission).
  const discountRatio = row.package_discount_ratio != null ? toNumber(row.package_discount_ratio) : 1;
  const isPackageOrPartial = (row.payment_status === 'package' || row.payment_status === 'partial') && effectivePackagePrice > 0;
  if (isPackageOrPartial) {
    const storedHourlyRate = toNumber(row.pkg_hourly_rate);
    const pkgTotalHours = toNumber(row.package_total_hours);
    if (storedHourlyRate > 0 && pkgTotalHours > 0) {
      // Stored per-hour lesson rate × total hours, scaled by the discount ratio.
      effectivePackagePrice = storedHourlyRate * pkgTotalHours * (discountRatio || 1);
    } else {
      // Fallback: subtract rental + accommodation costs (ratio-scaled, like the
      // cascade) from the discount-adjusted base.
      const rentalCost = toNumber(row.pkg_rental_days) * toNumber(row.pkg_rental_daily_rate);
      const accomCost = toNumber(row.pkg_accom_nights) * toNumber(row.pkg_accom_nightly_rate);
      if (rentalCost + accomCost > 0) {
        effectivePackagePrice = Math.max(0, effectivePackagePrice - (rentalCost + accomCost) * (discountRatio || 1));
      }
    }
  }

  // For partial payment bookings (mix of package + cash), derive package portion
  // separately, then add the cash portion back
  const isPartial = row.payment_status === 'partial' && isPackageOrPartial;
  let lessonAmount = deriveLessonAmount({
    paymentStatus: isPartial ? 'package' : row.payment_status,
    duration: lessonDuration,
    baseAmount: isPartial ? 0 : baseAmount,
    packagePrice: effectivePackagePrice,
    packageTotalHours: toNumber(row.package_total_hours),
    packageRemainingHours: toNumber(row.package_remaining_hours),
    packageUsedHours: toNumber(row.package_used_hours),
    packageSessionsCount: toNumber(row.package_sessions_count),
    fallbackSessionDuration: toNumber(row.service_duration) || lessonDuration,
    servicePrice: toNumber(row.service_price),
    serviceDuration: toNumber(row.service_duration),
  });

  // H5: for partial bookings the package covers only part of the lesson; value
  // the package-drawn hours + cash via the SAME helper the cascade writer uses,
  // so this detail view matches the stored snapshot instead of double-counting
  // the cash hour (was `lessonAmount + baseAmount`).
  if (isPartial && baseAmount > 0) {
    lessonAmount = partialLessonValue({ packageValueFullDuration: lessonAmount, duration: lessonDuration, cashAmount: baseAmount });
  }

  // For group/semi-private bookings using packages, deriveLessonAmount returns
  // per-person amount. Multiply by group_size to get the true lesson total.
  if (row.payment_status === 'package' && groupSize > 1) {
    lessonAmount = Number.parseFloat((lessonAmount * groupSize).toFixed(2));
  }

  const totalEarnings = deriveTotalEarnings({ lessonAmount, commissionRate, commissionType, lessonDuration });

  // Build participant names display
  const participantNames = row.participant_names || null;
  const displayStudentName = participantNames && groupSize > 1
    ? participantNames
    : row.student_name;

  return {
    booking_id: row.booking_id,
    lesson_date: row.lesson_date
      ? (row.lesson_date instanceof Date ? row.lesson_date.toISOString() : String(row.lesson_date))
      : null,
    start_hour: row.start_hour,
    lesson_duration: lessonDuration,
    base_amount: baseAmount,
    final_amount: toNumber(row.final_amount),
    payment_status: row.payment_status,
    booking_status: row.booking_status,
    student_name: displayStudentName,
    service_name: row.service_name,
    service_price: toNumber(row.service_price),
    service_duration: toNumber(row.service_duration),
    group_size: groupSize,
    participant_names: participantNames,
    package_name: row.package_name,
    package_price: toNumber(row.package_price),
    package_total_hours: toNumber(row.package_total_hours),
    package_remaining_hours: toNumber(row.package_remaining_hours),
    package_used_hours: toNumber(row.package_used_hours),
    package_sessions_count: toNumber(row.package_sessions_count),
    commission_rate: commissionRate,
    commission_type: commissionType,
    lesson_amount: lessonAmount,
    total_earnings: totalEarnings,
    commission_amount: totalEarnings,
    currency: row.currency || 'EUR',
    lesson_category: row.lesson_category || null,
  };
};

export async function getInstructorEarningsData(
  instructorId,
  { startDate, endDate, statuses = COMPLETED_BOOKING_STATUSES } = {},
) {
  try {
    let query = `
      SELECT
        b.id as booking_id,
        b.date as lesson_date,
        b.start_hour,
        b.duration as lesson_duration,
        GREATEST(COALESCE(b.final_amount, b.amount, 0) - bk_disc.amt, 0) as base_amount,
        b.final_amount,
        b.payment_status,
        b.status as booking_status,
        b.currency,
        b.group_size,
        s.name as student_name,
        srv.name as service_name,
        (
          SELECT string_agg(u.first_name || ' ' || u.last_name, ', ' ORDER BY bp.is_primary DESC, u.first_name)
          FROM booking_participants bp
          JOIN users u ON u.id = bp.user_id
          WHERE bp.booking_id = b.id
        ) as participant_names,
        srv.price as service_price,
        srv.duration as service_duration,
        CASE
          WHEN srv.lesson_category_tag = 'supervision' AND COALESCE(b.group_size, 1) > 1
            THEN 'semi-private-supervision'
          ELSE srv.lesson_category_tag
        END as lesson_category,
        cp.package_name,
        CASE
          WHEN cp.currency IS NOT NULL AND cp.currency != 'EUR' AND cs_pkg.exchange_rate > 0
          THEN ROUND(GREATEST(cp.purchase_price - cp_disc.amt, 0) / cs_pkg.exchange_rate, 2)
          ELSE COALESCE(cp.purchase_price - cp_disc.amt, gb_sp.price)
        END as package_price,
        CASE WHEN cp.purchase_price > 0
             THEN GREATEST(cp.purchase_price - COALESCE(cp_disc.amt, 0), 0) / cp.purchase_price
             ELSE 1 END as package_discount_ratio,
        COALESCE(cp.total_hours, gb_sp.total_hours) as package_total_hours,
        cp.remaining_hours as package_remaining_hours,
        cp.used_hours as package_used_hours,
        COALESCE(sp.sessions_count, gb_sp.sessions_count) as package_sessions_count,
        COALESCE(sp.rental_days, 0) as pkg_rental_days,
        COALESCE(sp.accommodation_nights, 0) as pkg_accom_nights,
        COALESCE(rental_srv.price, 0) as pkg_rental_daily_rate,
        COALESCE(accom_unit.price_per_night, 0) as pkg_accom_nightly_rate,
        sp.package_hourly_rate as pkg_hourly_rate,
        COALESCE(
          CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
               THEN COALESCE(idc.self_student_commission_rate, 45) END,
          bcc.commission_value, isc.commission_value, icr.rate_value,
          -- Rescue is captain-rate-only: when no explicit rescue rate is set the
          -- captain earns nothing (do NOT fall back to the default commission).
          -- Regular lessons are unaffected and keep the default fallback.
          (CASE WHEN srv.lesson_category_tag = 'rescue_boat' THEN NULL ELSE idc.commission_value END), 0
        ) as commission_rate,
        COALESCE(
          CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
               THEN 'percentage' END,
          bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed'
        ) as commission_type
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
      LEFT JOIN services rental_srv ON rental_srv.id = sp.rental_service_id
      LEFT JOIN accommodation_units accom_unit ON accom_unit.id = sp.accommodation_unit_id
      LEFT JOIN currency_settings cs_pkg ON cs_pkg.currency_code = cp.currency
      LEFT JOIN group_bookings gb ON gb.booking_id = b.id
      LEFT JOIN service_packages gb_sp ON gb_sp.id = gb.package_id
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
      WHERE b.instructor_user_id = $1
        AND b.deleted_at IS NULL
    `;

    const params = [instructorId];
    let paramIndex = 2;

    const statusList = Array.isArray(statuses) && statuses.length ? statuses : COMPLETED_BOOKING_STATUSES;
    query += ` AND b.status = ANY($${paramIndex}::text[])`;
    params.push(statusList);
    paramIndex += 1;

    if (startDate) {
      query += ` AND b.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex += 1;
    }

    if (endDate) {
      query += ` AND b.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex += 1;
    }

    query += ' ORDER BY b.date DESC, b.start_hour DESC';

    const { rows } = await pool.query(query, params);
    const earnings = rows.map(mapEarningRow);

    const totals = earnings.reduce(
      (acc, earning) => {
        acc.totalEarnings += earning.total_earnings || 0;
        acc.totalLessons += 1;
        acc.totalHours += earning.lesson_duration || 0;
        return acc;
      },
      { totalEarnings: 0, totalLessons: 0, totalHours: 0 }
    );

    return {
      earnings,
      totals: {
        totalEarnings: Number(totals.totalEarnings.toFixed(2)),
        totalLessons: totals.totalLessons,
        totalHours: Number(totals.totalHours.toFixed(2)),
      },
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Lesson finance breakdown for the /finance/lessons page (Service Popularity +
 * Instructor Performance) AND the headline lesson-revenue / instructor-commission
 * totals. Reuses the SAME per-booking derivation as getInstructorEarningsData
 * (mapEarningRow → deriveLessonAmount / partialLessonValue / deriveTotalEarnings)
 * so the page reconciles exactly with instructor payroll: discounts are netted,
 * package lessons are valued at their package-price share, partial (package+cash)
 * bookings are valued without double-counting the cash hour, group/semi-private
 * bookings are scaled by group_size, self-student bookings use the 45% override,
 * and instructor_category_rates are honoured.
 *
 * `statuses` defaults to the finance "completed" set so it matches the headline
 * cards (LEDGER_COMPLETED_BOOKING_STATUSES = completed/done/checked_out).
 */
export async function getLessonFinanceBreakdown({
  startDate,
  endDate,
  statuses = COMPLETED_BOOKING_STATUSES,
} = {}) {
  const query = `
    SELECT
      b.instructor_user_id,
      COALESCE(iu.first_name || ' ' || iu.last_name, iu.email) AS instructor_name,
      srv.id AS service_id,
      b.id as booking_id,
      b.date as lesson_date,
      b.start_hour,
      b.duration as lesson_duration,
      GREATEST(COALESCE(b.final_amount, b.amount, 0) - bk_disc.amt, 0) as base_amount,
      b.final_amount,
      b.payment_status,
      b.status as booking_status,
      b.currency,
      b.group_size,
      s.name as student_name,
      srv.name as service_name,
      (
        SELECT string_agg(u.first_name || ' ' || u.last_name, ', ' ORDER BY bp.is_primary DESC, u.first_name)
        FROM booking_participants bp
        JOIN users u ON u.id = bp.user_id
        WHERE bp.booking_id = b.id
      ) as participant_names,
      srv.price as service_price,
      srv.duration as service_duration,
      CASE
        WHEN srv.lesson_category_tag = 'supervision' AND COALESCE(b.group_size, 1) > 1
          THEN 'semi-private-supervision'
        ELSE srv.lesson_category_tag
      END as lesson_category,
      cp.package_name,
      CASE
        WHEN cp.currency IS NOT NULL AND cp.currency != 'EUR' AND cs_pkg.exchange_rate > 0
        THEN ROUND(GREATEST(cp.purchase_price - cp_disc.amt, 0) / cs_pkg.exchange_rate, 2)
        ELSE COALESCE(cp.purchase_price - cp_disc.amt, gb_sp.price)
      END as package_price,
      CASE WHEN cp.purchase_price > 0
           THEN GREATEST(cp.purchase_price - COALESCE(cp_disc.amt, 0), 0) / cp.purchase_price
           ELSE 1 END as package_discount_ratio,
      COALESCE(cp.total_hours, gb_sp.total_hours) as package_total_hours,
      cp.remaining_hours as package_remaining_hours,
      cp.used_hours as package_used_hours,
      COALESCE(sp.sessions_count, gb_sp.sessions_count) as package_sessions_count,
      COALESCE(sp.rental_days, 0) as pkg_rental_days,
      COALESCE(sp.accommodation_nights, 0) as pkg_accom_nights,
      COALESCE(rental_srv.price, 0) as pkg_rental_daily_rate,
      COALESCE(accom_unit.price_per_night, 0) as pkg_accom_nightly_rate,
      sp.package_hourly_rate as pkg_hourly_rate,
      COALESCE(
        CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
             THEN COALESCE(idc.self_student_commission_rate, 45) END,
        bcc.commission_value, isc.commission_value, icr.rate_value,
        -- Rescue is captain-rate-only: when no explicit rescue rate is set the
        -- captain earns nothing (do NOT fall back to the default commission).
        -- Keeps this surface consistent with getInstructorEarningsData above,
        -- so payout balances reconcile with recorded instructor_earnings.
        (CASE WHEN srv.lesson_category_tag = 'rescue_boat' THEN NULL ELSE idc.commission_value END), 0
      ) as commission_rate,
      COALESCE(
        CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
             THEN 'percentage' END,
        bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed'
      ) as commission_type
    FROM bookings b
    JOIN users iu ON iu.id = b.instructor_user_id
    LEFT JOIN users s ON s.id = b.student_user_id
    LEFT JOIN services srv ON srv.id = b.service_id
    LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
    LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
    LEFT JOIN services rental_srv ON rental_srv.id = sp.rental_service_id
    LEFT JOIN accommodation_units accom_unit ON accom_unit.id = sp.accommodation_unit_id
    LEFT JOIN currency_settings cs_pkg ON cs_pkg.currency_code = cp.currency
    LEFT JOIN group_bookings gb ON gb.booking_id = b.id
    LEFT JOIN service_packages gb_sp ON gb_sp.id = gb.package_id
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
    WHERE b.deleted_at IS NULL
      AND b.instructor_user_id IS NOT NULL
      AND b.status = ANY($1::text[])
  `;

  const params = [Array.isArray(statuses) && statuses.length ? statuses : COMPLETED_BOOKING_STATUSES];
  let q = query;
  let idx = 2;
  if (startDate) { q += ` AND b.date >= $${idx}`; params.push(startDate); idx += 1; }
  if (endDate) { q += ` AND b.date <= $${idx}`; params.push(endDate); idx += 1; }

  const { rows } = await pool.query(q, params);

  const instructorMap = new Map();
  const serviceMap = new Map();
  let totalRevenue = 0;
  let totalCommission = 0;
  let totalBookings = 0;
  let totalHours = 0;

  for (const row of rows) {
    const mapped = mapEarningRow(row);
    const revenue = toNumber(mapped.lesson_amount);
    const commission = toNumber(mapped.commission_amount);
    const hours = toNumber(mapped.lesson_duration);

    totalRevenue += revenue;
    totalCommission += commission;
    totalBookings += 1;
    totalHours += hours;

    const instId = row.instructor_user_id;
    if (!instructorMap.has(instId)) {
      instructorMap.set(instId, {
        instructorId: instId,
        name: row.instructor_name,
        bookings: 0,
        hours: 0,
        revenue: 0,
        commission: 0,
      });
    }
    const inst = instructorMap.get(instId);
    inst.bookings += 1;
    inst.hours += hours;
    inst.revenue += revenue;
    inst.commission += commission;

    const svcId = row.service_id;
    if (svcId) {
      if (!serviceMap.has(svcId)) {
        serviceMap.set(svcId, { serviceId: svcId, name: row.service_name, bookings: 0, revenue: 0 });
      }
      const svc = serviceMap.get(svcId);
      svc.bookings += 1;
      svc.revenue += revenue;
    }
  }

  const round2 = (n) => Number(toNumber(n).toFixed(2));

  const services = Array.from(serviceMap.values())
    .map((s) => ({
      serviceId: s.serviceId,
      name: s.name,
      bookings: s.bookings,
      revenue: round2(s.revenue),
      avgPrice: s.bookings > 0 ? round2(s.revenue / s.bookings) : 0,
    }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 20);

  const instructors = Array.from(instructorMap.values())
    .map((i) => ({
      instructorId: i.instructorId,
      name: i.name,
      bookings: i.bookings,
      hours: round2(i.hours),
      revenue: round2(i.revenue),
      commission: round2(i.commission),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  return {
    services,
    instructors,
    totals: {
      revenue: round2(totalRevenue),
      commission: round2(totalCommission),
      bookings: totalBookings,
      hours: round2(totalHours),
    },
  };
}

export async function getInstructorPayrollHistory(instructorId, options = {}) {
  const { limit } = options;
  const params = [instructorId];
  let limitClause = '';

  if (Number.isInteger(limit) && limit > 0) {
    params.push(limit);
    limitClause = ' LIMIT $2';
  }

  // payment_date = the manager-entered date (stored in metadata.paymentDate),
  // NOT created_at (the row-insertion time). createStaffPayment lets created_at
  // default to NOW() and keeps the chosen date only in metadata, and an edit
  // cancels+re-inserts (created_at = NOW()) — so surfacing created_at would show
  // the entry time and silently re-date a row to today on every edit. The
  // replacement row carries metadata.paymentDate forward, so COALESCE is stable.
  const { rows } = await pool.query(
    `SELECT
        id,
        amount,
        transaction_type as type,
        description,
        payment_method,
        reference_number,
        COALESCE((metadata->>'paymentDate')::timestamptz, created_at) as payment_date
      FROM wallet_transactions
      WHERE user_id = $1
        AND transaction_type IN ('payment', 'deduction')
        AND (entity_type IS NULL OR entity_type = 'instructor_payment')
        AND status != 'cancelled'
      ORDER BY COALESCE((metadata->>'paymentDate')::timestamptz, created_at) DESC${limitClause}`,
    params
  );
  return rows;
}

export async function getInstructorPaymentsSummary(instructorId) {
  const summaryQuery = `
    SELECT 
      COALESCE(SUM(amount), 0) AS net_payments,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_paid
    FROM wallet_transactions
    WHERE user_id = $1
      AND transaction_type IN ('payment', 'deduction')
      AND (entity_type IS NULL OR entity_type = 'instructor_payment')
      AND status != 'cancelled';
  `;

  // Last payout date = manager-entered date (metadata.paymentDate), aliased back
  // to created_at so getInstructorDashboard's lastPayout.created_at keeps working.
  const lastPaymentQuery = `
    SELECT amount, COALESCE((metadata->>'paymentDate')::timestamptz, created_at) AS created_at
    FROM wallet_transactions
    WHERE user_id = $1 AND transaction_type = 'payment'
      AND (entity_type IS NULL OR entity_type = 'instructor_payment')
      AND status != 'cancelled'
    ORDER BY COALESCE((metadata->>'paymentDate')::timestamptz, created_at) DESC
    LIMIT 1;
  `;

  const [summaryRes, lastPaymentRes] = await Promise.all([
    pool.query(summaryQuery, [instructorId]),
    pool.query(lastPaymentQuery, [instructorId])
  ]);

  return {
    netPayments: toNumber(summaryRes.rows?.[0]?.net_payments),
    totalPaid: toNumber(summaryRes.rows?.[0]?.total_paid),
    lastPayment: lastPaymentRes.rows?.[0] || null,
  };
}

/**
 * Get earnings & payments summary for all instructors in a single query.
 * Returns a map: { [instructorId]: { totalEarned, totalPaid, balance } }
 */
export async function getAllInstructorBalances() {
  // Query all completed bookings with package + commission info,
  // then derive earnings in JS to stay consistent with the per-instructor endpoint.
  const bookingsQuery = `
    SELECT 
      b.instructor_user_id,
      b.id as booking_id,
      b.duration as lesson_duration,
      GREATEST(COALESCE(b.final_amount, b.amount, 0) - bk_disc.amt, 0) as base_amount,
      b.payment_status,
      b.group_size,
      CASE
        WHEN cp.currency IS NOT NULL AND cp.currency != 'EUR' AND cs_pkg.exchange_rate > 0
        THEN ROUND(GREATEST(cp.purchase_price - cp_disc.amt, 0) / cs_pkg.exchange_rate, 2)
        ELSE COALESCE(cp.purchase_price - cp_disc.amt, gb_sp.price)
      END as package_price,
      CASE WHEN cp.purchase_price > 0
           THEN GREATEST(cp.purchase_price - COALESCE(cp_disc.amt, 0), 0) / cp.purchase_price
           ELSE 1 END as package_discount_ratio,
      sp.package_hourly_rate as pkg_hourly_rate,
      COALESCE(sp.rental_days, 0) as pkg_rental_days,
      COALESCE(sp.accommodation_nights, 0) as pkg_accom_nights,
      COALESCE(rental_srv.price, 0) as pkg_rental_daily_rate,
      COALESCE(accom_unit.price_per_night, 0) as pkg_accom_nightly_rate,
      COALESCE(cp.total_hours, gb_sp.total_hours) as package_total_hours,
      cp.remaining_hours as package_remaining_hours,
      cp.used_hours as package_used_hours,
      COALESCE(sp.sessions_count, gb_sp.sessions_count) as package_sessions_count,
      srv.duration as fallback_session_duration,
      COALESCE(
        CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
             THEN COALESCE(idc.self_student_commission_rate, 45) END,
        bcc.commission_value, isc.commission_value, icr.rate_value,
        -- Rescue is captain-rate-only: when no explicit rescue rate is set the
        -- captain earns nothing (do NOT fall back to the default commission).
        -- Keeps this surface consistent with getInstructorEarningsData above,
        -- so payout balances reconcile with recorded instructor_earnings.
        (CASE WHEN srv.lesson_category_tag = 'rescue_boat' THEN NULL ELSE idc.commission_value END), 0
      ) as commission_rate,
      COALESCE(
        CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
             THEN 'percentage' END,
        bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed'
      ) as commission_type
    FROM bookings b
    JOIN users u ON u.id = b.instructor_user_id
    LEFT JOIN users s ON s.id = b.student_user_id
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN services srv ON srv.id = b.service_id
    LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
    LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
    LEFT JOIN services rental_srv ON rental_srv.id = sp.rental_service_id
    LEFT JOIN accommodation_units accom_unit ON accom_unit.id = sp.accommodation_unit_id
    LEFT JOIN currency_settings cs_pkg ON cs_pkg.currency_code = cp.currency
    LEFT JOIN group_bookings gb ON gb.booking_id = b.id
    LEFT JOIN service_packages gb_sp ON gb_sp.id = gb.package_id
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
    WHERE b.deleted_at IS NULL AND b.status = ANY($1::text[])
      AND u.deleted_at IS NULL
  `;

  const paymentsQuery = `
    SELECT 
      wt.user_id as instructor_id,
      COALESCE(SUM(wt.amount), 0) as total_paid
    FROM wallet_transactions wt
    JOIN users u ON u.id = wt.user_id
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE wt.transaction_type IN ('payment', 'deduction')
      AND (wt.entity_type IS NULL OR wt.entity_type = 'instructor_payment')
      AND wt.status != 'cancelled'
      AND u.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.instructor_user_id = u.id
          AND b.status = ANY($1::text[])
          AND b.deleted_at IS NULL
      )
    GROUP BY wt.user_id
  `;

  const [bookingsRes, paymentsRes] = await Promise.all([
    pool.query(bookingsQuery, [COMPLETED_BOOKING_STATUSES]),
    pool.query(paymentsQuery, [COMPLETED_BOOKING_STATUSES]),
  ]);

  const result = {};

  // Derive per-booking earnings using the same logic as getInstructorEarningsData
  for (const row of bookingsRes.rows) {
    const id = row.instructor_user_id;
    if (!result[id]) {
      result[id] = { totalEarned: 0, totalPaid: 0, balance: 0 };
    }

    const lessonDuration = toNumber(row.lesson_duration);
    // H6: partial bookings draw some hours from the package and pay the rest in
    // cash. deriveLessonAmount would return cash-ONLY for 'partial' (dropping the
    // package hours and undervaluing the instructor). Force the package
    // derivation, then value package-drawn hours + cash via the shared helper —
    // matching the cascade writer and the detail view. package_price here is
    // already discount-adjusted (cp.purchase_price - cp_disc.amt).
    const isPartialBal = row.payment_status === 'partial' && toNumber(row.package_price) > 0;
    const baseAmountBal = toNumber(row.base_amount);
    // Derive the lesson-ONLY portion (combo packages subtract rental/accom; a
    // stored hourly rate is used directly) scaled by the package discount ratio —
    // matching mapEarningRow + the cascade. Previously this passed the FULL
    // package_price straight in, over-valuing combo/hourly-rate package lessons.
    let effPkgPriceBal = toNumber(row.package_price);
    const ratioBal = row.package_discount_ratio != null ? toNumber(row.package_discount_ratio) : 1;
    if ((row.payment_status === 'package' || row.payment_status === 'partial') && effPkgPriceBal > 0) {
      const hrBal = toNumber(row.pkg_hourly_rate);
      const thBal = toNumber(row.package_total_hours);
      if (hrBal > 0 && thBal > 0) {
        effPkgPriceBal = hrBal * thBal * (ratioBal || 1);
      } else {
        const rcBal = toNumber(row.pkg_rental_days) * toNumber(row.pkg_rental_daily_rate);
        const acBal = toNumber(row.pkg_accom_nights) * toNumber(row.pkg_accom_nightly_rate);
        if (rcBal + acBal > 0) effPkgPriceBal = Math.max(0, effPkgPriceBal - (rcBal + acBal) * (ratioBal || 1));
      }
    }
    let lessonAmount = deriveLessonAmount({
      paymentStatus: isPartialBal ? 'package' : row.payment_status,
      duration: lessonDuration,
      baseAmount: isPartialBal ? 0 : baseAmountBal,
      packagePrice: effPkgPriceBal,
      packageTotalHours: toNumber(row.package_total_hours),
      packageRemainingHours: toNumber(row.package_remaining_hours),
      packageUsedHours: toNumber(row.package_used_hours),
      packageSessionsCount: toNumber(row.package_sessions_count),
      fallbackSessionDuration: toNumber(row.fallback_session_duration) || lessonDuration,
    });
    if (isPartialBal && baseAmountBal > 0) {
      lessonAmount = partialLessonValue({ packageValueFullDuration: lessonAmount, duration: lessonDuration, cashAmount: baseAmountBal });
    }

    // For group/semi-private bookings using packages, multiply by group_size
    const groupSize = Math.max(1, toNumber(row.group_size) || 1);
    if (row.payment_status === 'package' && groupSize > 1) {
      lessonAmount = Number.parseFloat((lessonAmount * groupSize).toFixed(2));
    }

    const earnings = deriveTotalEarnings({
      lessonAmount,
      commissionRate: toNumber(row.commission_rate),
      commissionType: row.commission_type,
      lessonDuration,
    });

    result[id].totalEarned += earnings;
  }

  // Round after summing
  for (const id of Object.keys(result)) {
    result[id].totalEarned = Number(result[id].totalEarned.toFixed(2));
  }

  for (const row of paymentsRes.rows) {
    const id = row.instructor_id;
    if (!result[id]) {
      result[id] = { totalEarned: 0, totalPaid: 0, balance: 0 };
    }
    result[id].totalPaid = Number(Number(row.total_paid).toFixed(2));
  }

  for (const id of Object.keys(result)) {
    result[id].balance = Number((result[id].totalEarned - result[id].totalPaid).toFixed(2));
  }

  /** Instructor-only snapshot before merging manager commissions */
  const instructorOnly = {};
  for (const id of Object.keys(result)) {
    instructorOnly[id] = {
      totalEarned: result[id].totalEarned,
      totalPaid: result[id].totalPaid,
      balance: result[id].balance,
    };
  }

  // Manager commission earned — same visibility rules as the manager commission
  // list/summary: the shared guard also checks RENTAL liveness, which the old
  // inline booking-only copy missed (pending commissions on cancelled/deleted
  // rentals counted into the balances page).
  const mgrEarnedSql = `
    SELECT
      mc.manager_user_id,
      COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.status != 'cancelled'), 0)::numeric AS total_earned
    FROM manager_commissions mc
    WHERE ${MANAGER_COMMISSION_LIVE_GUARD_SQL}
    GROUP BY mc.manager_user_id
  `;
  // Payments and deductions both reduce what the manager is still owed, but only
  // actual payments count as "paid" — mirroring getManagerCommissionSummary. The
  // old payment-only query silently ignored deduction rows (e.g. clawed-back
  // advances), overstating the manager's owed balance on the instructors page.
  const mgrPaidSql = `
    SELECT user_id,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::numeric AS total_paid,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)::numeric AS total_deducted
    FROM wallet_transactions
    WHERE entity_type = 'manager_payment'
      AND transaction_type IN ('payment', 'deduction')
      AND status != 'cancelled'
    GROUP BY user_id
  `;

  const [mgrEarnedRes, mgrPaidRes] = await Promise.all([
    pool.query(mgrEarnedSql),
    pool.query(mgrPaidSql),
  ]);

  const mgrEarnedMap = {};
  for (const row of mgrEarnedRes.rows) {
    mgrEarnedMap[row.manager_user_id] = toNumber(row.total_earned);
  }
  const mgrPaidMap = {};
  for (const row of mgrPaidRes.rows) {
    mgrPaidMap[row.user_id] = {
      paid: toNumber(row.total_paid),
      deducted: toNumber(row.total_deducted),
    };
  }

  const mergedIds = new Set([
    ...Object.keys(instructorOnly),
    ...Object.keys(mgrEarnedMap),
    ...Object.keys(mgrPaidMap),
  ]);

  const merged = {};
  for (const id of mergedIds) {
    const inst = instructorOnly[id] || { totalEarned: 0, totalPaid: 0, balance: 0 };
    const mEarn = mgrEarnedMap[id] || 0;
    const mPaid = mgrPaidMap[id]?.paid || 0;
    const mDeducted = mgrPaidMap[id]?.deducted || 0;
    // Clamped at 0 like getManagerCommissionSummary's pending: an overpaid
    // manager owes nothing, but the surplus doesn't eat into instructor payroll.
    const mBal = Math.max(Number((mEarn - mPaid - mDeducted).toFixed(2)), 0);
    const hasManager = mEarn > 0 || mPaid > 0 || mDeducted > 0;

    merged[id] = {
      totalEarned: Number((inst.totalEarned + mEarn).toFixed(2)),
      totalPaid: Number((inst.totalPaid + mPaid).toFixed(2)),
      // NOT totalEarned - totalPaid: the manager side subtracts deductions and
      // clamps at 0, so the combined owed is the sum of the two owed figures.
      balance: Number((inst.balance + mBal).toFixed(2)),
      instructor: {
        totalEarned: inst.totalEarned,
        totalPaid: inst.totalPaid,
        balance: inst.balance,
      },
      manager: hasManager
        ? { totalEarned: mEarn, totalPaid: mPaid, totalDeducted: mDeducted, balance: mBal }
        : null,
    };
  }

  return merged;
}
