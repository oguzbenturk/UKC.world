import { pool } from '../db.js';
import { deriveLessonAmount, deriveTotalEarnings, toNumber } from '../utils/instructorEarnings.js';

const mapEarningRow = (row) => {
  const lessonDuration = toNumber(row.lesson_duration);
  const baseAmount = toNumber(row.base_amount);
  const commissionRate = toNumber(row.commission_rate);
  const commissionType = row.commission_type || 'percentage';

  const lessonAmount = deriveLessonAmount({
    paymentStatus: row.payment_status,
    duration: lessonDuration,
    baseAmount,
    packagePrice: toNumber(row.package_price),
    packageTotalHours: toNumber(row.package_total_hours),
    packageRemainingHours: toNumber(row.package_remaining_hours),
    packageUsedHours: toNumber(row.package_used_hours),
    packageSessionsCount: toNumber(row.package_sessions_count),
    fallbackSessionDuration: toNumber(row.service_duration) || lessonDuration,
  });

  const totalEarnings = deriveTotalEarnings({ lessonAmount, commissionRate, commissionType, lessonDuration });

  return {
    booking_id: row.booking_id,
    lesson_date: row.lesson_date ? row.lesson_date.toISOString() : null,
    start_hour: row.start_hour,
    lesson_duration: lessonDuration,
    base_amount: baseAmount,
    final_amount: toNumber(row.final_amount),
    payment_status: row.payment_status,
    booking_status: row.booking_status,
    student_name: row.student_name,
    service_name: row.service_name,
    service_price: toNumber(row.service_price),
    service_duration: toNumber(row.service_duration),
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
        s.name as student_name,
        srv.name as service_name,
        srv.price as service_price,
        srv.duration as service_duration,
        cp.package_name,
        cp.purchase_price as package_price,
        cp.total_hours as package_total_hours,
        cp.remaining_hours as package_remaining_hours,
        cp.used_hours as package_used_hours,
        sp.sessions_count as package_sessions_count,
        COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50.0) as commission_rate,
        COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type, 'percentage') as commission_type
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
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
        type,
        description,
        payment_method,
        reference_number,
        created_at as payment_date
      FROM transactions 
      WHERE user_id = $1 
        AND type IN ('payment', 'deduction')
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
    FROM transactions
    WHERE user_id = $1
      AND type IN ('payment', 'deduction');
  `;

  const lastPaymentQuery = `
    SELECT amount, created_at
    FROM transactions
    WHERE user_id = $1 AND type = 'payment'
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
