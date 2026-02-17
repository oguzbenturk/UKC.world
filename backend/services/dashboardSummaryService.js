import { pool } from '../db.js';
import { cacheService } from './cacheService.js';

const UPCOMING_LESSON_STATUSES = ['pending', 'scheduled', 'confirmed', 'in_progress'];
const ACTIVE_LESSON_STATUSES = ['in_progress', 'active'];
const COMPLETED_LESSON_STATUSES = ['completed', 'done', 'checked_out'];
const CANCELLED_LESSON_STATUSES = ['cancelled', 'canceled'];

const ACTIVE_RENTAL_STATUSES = ['active', 'in_progress'];
const UPCOMING_RENTAL_STATUSES = ['pending', 'reserved', 'scheduled'];
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
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(UPCOMING_LESSON_STATUSES)}]) AND date >= CURRENT_DATE THEN 1 ELSE 0 END)::int AS upcoming,
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(ACTIVE_LESSON_STATUSES)}]) THEN 1 ELSE 0 END)::int AS active,
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(CANCELLED_LESSON_STATUSES)}]) THEN 1 ELSE 0 END)::int AS cancelled,
      COALESCE(SUM(duration), 0)::numeric AS total_hours,
      COALESCE(SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(COMPLETED_LESSON_STATUSES)}]) THEN duration ELSE 0 END), 0)::numeric AS completed_hours,
      COALESCE(SUM(final_amount), 0)::numeric AS total_revenue
    FROM bookings
    ${bookingConditions.length ? `WHERE ${bookingConditions.join(' AND ')}` : ''}
  `;

  const rentalParams = [];
  const rentalConditions = [];
  if (startTimestamp) {
    rentalParams.push(startTimestamp);
    rentalConditions.push(`start_date >= $${rentalParams.length}::timestamptz`);
  }
  if (endTimestamp) {
    rentalParams.push(endTimestamp);
    rentalConditions.push(`end_date <= $${rentalParams.length}::timestamptz`);
  }

  const rentalsQuery = `
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(ACTIVE_RENTAL_STATUSES)}]) THEN 1 ELSE 0 END)::int AS active,
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(UPCOMING_RENTAL_STATUSES)}]) THEN 1 ELSE 0 END)::int AS upcoming,
      SUM(CASE WHEN status = ANY(ARRAY[${toSqlTextArray(COMPLETED_RENTAL_STATUSES)}]) THEN 1 ELSE 0 END)::int AS completed,
      COALESCE(SUM(total_price), 0)::numeric AS total_revenue,
      COALESCE(SUM(CASE WHEN payment_status = ANY(ARRAY['paid', 'completed']) THEN total_price ELSE 0 END), 0)::numeric AS paid_revenue
    FROM rentals
    ${rentalConditions.length ? `WHERE ${rentalConditions.join(' AND ')}` : ''}
  `;

  const revenueParams = [];
  const revenueConditions = ["COALESCE(status, 'completed') NOT IN ('void', 'cancelled', 'pending')"];
  if (startTimestamp) {
    revenueParams.push(startTimestamp);
    revenueConditions.push(`COALESCE(transaction_date, created_at) >= $${revenueParams.length}::timestamptz`);
  }
  if (endTimestamp) {
    revenueParams.push(endTimestamp);
    revenueConditions.push(`COALESCE(transaction_date, created_at) <= $${revenueParams.length}::timestamptz`);
  }

  const revenueQuery = `
    SELECT
      COUNT(*)::int AS total_transactions,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::numeric AS income,
      COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0)::numeric AS expenses,
      COALESCE(SUM(amount), 0)::numeric AS net,
      COALESCE(SUM(CASE WHEN type = 'service_payment' AND amount > 0 THEN amount ELSE 0 END), 0)::numeric AS service_revenue,
      COALESCE(SUM(CASE WHEN type = 'rental_payment' AND amount > 0 THEN amount ELSE 0 END), 0)::numeric AS rental_revenue
    FROM transactions
    WHERE ${revenueConditions.join(' AND ')}
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
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE r.name = 'student')::int AS students,
      COUNT(*) FILTER (WHERE r.name = 'instructor')::int AS instructors,
      COUNT(*) FILTER (WHERE r.name IN ('admin', 'manager', 'owner'))::int AS staff,
      COUNT(*) FILTER (WHERE u.created_at >= date_trunc('month', CURRENT_DATE))::int AS new_this_month
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
  `;

  const [bookingsResult, rentalsResult, revenueResult, servicesResult, equipmentResult, customersResult] = await Promise.all([
  pool.query(bookingsQuery, bookingParams),
  pool.query(rentalsQuery, rentalParams),
    pool.query(revenueQuery, revenueParams),
    pool.query(servicesQuery),
    pool.query(equipmentQuery),
    pool.query(customersQuery)
  ]);

  const bookingsRow = bookingsResult.rows[0] || {};
  const rentalsRow = rentalsResult.rows[0] || {};
  const revenueRow = revenueResult.rows[0] || {};
  const servicesRow = servicesResult.rows[0] || {};
  const equipmentRow = equipmentResult.rows[0] || {};
  const customersRow = customersResult.rows[0] || {};

  const lessons = {
    total: toNumber(bookingsRow.total),
    completed: toNumber(bookingsRow.completed),
    upcoming: toNumber(bookingsRow.upcoming),
    active: toNumber(bookingsRow.active),
    cancelled: toNumber(bookingsRow.cancelled),
    totalHours: toNumber(bookingsRow.total_hours),
    completedHours: toNumber(bookingsRow.completed_hours),
    totalRevenue: toNumber(bookingsRow.total_revenue)
  };
  lessons.averageDuration = lessons.total > 0 ? lessons.totalHours / lessons.total : 0;
  lessons.completionRate = lessons.total > 0 ? lessons.completed / lessons.total : 0;

  const rentals = {
    total: toNumber(rentalsRow.total),
    active: toNumber(rentalsRow.active),
    upcoming: toNumber(rentalsRow.upcoming),
    completed: toNumber(rentalsRow.completed),
    totalRevenue: toNumber(rentalsRow.total_revenue),
    paidRevenue: toNumber(rentalsRow.paid_revenue)
  };
  rentals.averageRevenue = rentals.total > 0 ? rentals.totalRevenue / rentals.total : 0;

  const revenue = {
    transactions: toNumber(revenueRow.total_transactions),
    income: toNumber(revenueRow.income),
    expenses: toNumber(revenueRow.expenses),
    net: toNumber(revenueRow.net),
    serviceRevenue: toNumber(revenueRow.service_revenue),
    rentalRevenue: toNumber(revenueRow.rental_revenue)
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
    totalUsers: toNumber(customersRow.total_users),
    students: toNumber(customersRow.students),
    instructors: toNumber(customersRow.instructors),
    staff: toNumber(customersRow.staff),
    newThisMonth: toNumber(customersRow.new_this_month)
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
    customers
  };

  // Cache for 2 minutes (120 seconds) - balances freshness with performance
  try {
    await cacheService.set(cacheKey, result, 120);
  } catch {
    // Cache write failed, continue anyway
  }

  return result;
}
