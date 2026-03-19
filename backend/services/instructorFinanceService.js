import { pool } from '../db.js';
import { deriveLessonAmount, deriveTotalEarnings, toNumber } from '../utils/instructorEarnings.js';

const mapEarningRow = (row) => {
  const lessonDuration = toNumber(row.lesson_duration);
  const baseAmount = toNumber(row.base_amount);
  const commissionRate = toNumber(row.commission_rate);
  const commissionType = row.commission_type || 'fixed';
  const groupSize = Math.max(1, toNumber(row.group_size) || 1);

  // For combo/all-inclusive packages, derive lesson-only portion of the price
  let effectivePackagePrice = toNumber(row.package_price);
  const isPackageOrPartial = (row.payment_status === 'package' || row.payment_status === 'partial') && effectivePackagePrice > 0;
  if (isPackageOrPartial) {
    const storedHourlyRate = toNumber(row.pkg_hourly_rate);
    const pkgTotalHours = toNumber(row.package_total_hours);
    if (storedHourlyRate > 0 && pkgTotalHours > 0) {
      // Use explicitly stored per-hour lesson rate × total hours to get lesson portion
      effectivePackagePrice = storedHourlyRate * pkgTotalHours;
    } else {
      // Fallback: subtract rental + accommodation costs from total price
      const rentalCost = toNumber(row.pkg_rental_days) * toNumber(row.pkg_rental_daily_rate);
      const accomCost = toNumber(row.pkg_accom_nights) * toNumber(row.pkg_accom_nightly_rate);
      if (rentalCost + accomCost > 0) {
        effectivePackagePrice = Math.max(0, effectivePackagePrice - rentalCost - accomCost);
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

  // For partial bookings, add the cash portion to the package-derived amount
  if (isPartial && baseAmount > 0) {
    lessonAmount = Number.parseFloat((lessonAmount + baseAmount).toFixed(2));
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

export async function getInstructorEarningsData(instructorId, { startDate, endDate } = {}) {
  const client = await pool.connect();
  try {
    let query = `
      SELECT 
        b.id as booking_id,
        b.date as lesson_date,
        b.start_hour,
        b.duration as lesson_duration,
        COALESCE(b.final_amount, b.amount, 0) as base_amount,
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
        srv.lesson_category_tag as lesson_category,
        cp.package_name,
        CASE
          WHEN cp.currency IS NOT NULL AND cp.currency != 'EUR' AND cs_pkg.exchange_rate > 0
          THEN ROUND(cp.purchase_price / cs_pkg.exchange_rate, 2)
          ELSE cp.purchase_price
        END as package_price,
        cp.total_hours as package_total_hours,
        cp.remaining_hours as package_remaining_hours,
        cp.used_hours as package_used_hours,
        sp.sessions_count as package_sessions_count,
        COALESCE(sp.rental_days, 0) as pkg_rental_days,
        COALESCE(sp.accommodation_nights, 0) as pkg_accom_nights,
        COALESCE(rental_srv.price, 0) as pkg_rental_daily_rate,
        COALESCE(accom_unit.price_per_night, 0) as pkg_accom_nightly_rate,
        sp.package_hourly_rate as pkg_hourly_rate,
        COALESCE(bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value, 0) as commission_rate,
        COALESCE(bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed') as commission_type
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
      LEFT JOIN services rental_srv ON rental_srv.id = sp.rental_service_id
      LEFT JOIN accommodation_units accom_unit ON accom_unit.id = sp.accommodation_unit_id
      LEFT JOIN currency_settings cs_pkg ON cs_pkg.currency_code = cp.currency
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = srv.lesson_category_tag
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      WHERE b.instructor_user_id = $1
        AND b.deleted_at IS NULL
        AND b.status = 'completed'
    `;

    const params = [instructorId];
    let paramIndex = 2;

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

    const { rows } = await client.query(query, params);
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
  } finally {
    client.release();
  }
}

export async function getInstructorPayrollHistory(instructorId, options = {}) {
  const { limit } = options;
  const params = [instructorId];
  let limitClause = '';

  if (Number.isInteger(limit) && limit > 0) {
    params.push(limit);
    limitClause = ' LIMIT $2';
  }

  const { rows } = await pool.query(
    `SELECT 
        id,
        amount,
        transaction_type as type,
        description,
        payment_method,
        reference_number,
        created_at as payment_date
      FROM wallet_transactions 
      WHERE user_id = $1 
        AND transaction_type IN ('payment', 'deduction')
        AND (entity_type IS NULL OR entity_type = 'instructor_payment')
        AND status != 'cancelled'
      ORDER BY created_at DESC${limitClause}`,
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

  const lastPaymentQuery = `
    SELECT amount, created_at
    FROM wallet_transactions
    WHERE user_id = $1 AND transaction_type = 'payment'
      AND (entity_type IS NULL OR entity_type = 'instructor_payment')
      AND status != 'cancelled'
    ORDER BY created_at DESC
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
      COALESCE(b.final_amount, b.amount, 0) as base_amount,
      b.payment_status,
      b.group_size,
      CASE
        WHEN cp.currency IS NOT NULL AND cp.currency != 'EUR' AND cs_pkg.exchange_rate > 0
        THEN ROUND(cp.purchase_price / cs_pkg.exchange_rate, 2)
        ELSE cp.purchase_price
      END as package_price,
      cp.total_hours as package_total_hours,
      cp.remaining_hours as package_remaining_hours,
      cp.used_hours as package_used_hours,
      sp.sessions_count as package_sessions_count,
      srv.duration as fallback_session_duration,
      COALESCE(bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value, 0) as commission_rate,
      COALESCE(bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed') as commission_type
    FROM bookings b
    JOIN users u ON u.id = b.instructor_user_id
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN services srv ON srv.id = b.service_id
    LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
    LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
    LEFT JOIN currency_settings cs_pkg ON cs_pkg.currency_code = cp.currency
    LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
    LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
    LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = srv.lesson_category_tag
    LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
    WHERE b.deleted_at IS NULL AND b.status = 'completed'
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
          AND b.status = 'completed'
          AND b.deleted_at IS NULL
      )
    GROUP BY wt.user_id
  `;

  const [bookingsRes, paymentsRes] = await Promise.all([
    pool.query(bookingsQuery),
    pool.query(paymentsQuery),
  ]);

  const result = {};

  // Derive per-booking earnings using the same logic as getInstructorEarningsData
  for (const row of bookingsRes.rows) {
    const id = row.instructor_user_id;
    if (!result[id]) {
      result[id] = { totalEarned: 0, totalPaid: 0, balance: 0 };
    }

    const lessonDuration = toNumber(row.lesson_duration);
    let lessonAmount = deriveLessonAmount({
      paymentStatus: row.payment_status,
      duration: lessonDuration,
      baseAmount: toNumber(row.base_amount),
      packagePrice: toNumber(row.package_price),
      packageTotalHours: toNumber(row.package_total_hours),
      packageRemainingHours: toNumber(row.package_remaining_hours),
      packageUsedHours: toNumber(row.package_used_hours),
      packageSessionsCount: toNumber(row.package_sessions_count),
      fallbackSessionDuration: toNumber(row.fallback_session_duration) || lessonDuration,
    });

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

  return result;
}
