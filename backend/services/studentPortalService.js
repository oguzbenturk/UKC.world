import { pool } from '../db.js';
import { logger, NotFoundError } from '../middlewares/errorHandler.js';
import { validate as uuidValidate } from 'uuid';
import { getRecommendedProductsForRole } from './recommendationService.js';
import { getUnratedBookings as fetchUnratedBookings } from './ratingService.js';
import bookingNotificationService from './bookingNotificationService.js';

const DEFAULT_PAGE_SIZE = 20;

const toIso = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch (error) {
    return null;
  }
};

const coalesceNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parseJsonField = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const roundCurrency = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
};

const parseDateSafe = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const PAYMENT_TYPES = new Set(['payment', 'credit']);
const REFUND_TYPES = new Set(['package_refund', 'refund', 'booking_deleted_refund']);
const CHARGE_TYPES = new Set([
  'package_purchase',
  'booking_charge',
  'charge',
  'debit',
  'service_payment',
  'rental_payment',
  'rental_charge',
  'booking_restore_adjustment'
]);

export const computeTransactionAggregates = (transactions = []) => {
  let payments = 0;
  let charges = 0;
  let refunds = 0;
  let lastPaymentAt = null;

  transactions.forEach((transaction) => {
    const amount = coalesceNumber(transaction?.amount);
    if (!Number.isFinite(amount) || amount === 0) return;

    const type = (transaction?.type || '').toLowerCase();
    const createdAt = parseDateSafe(transaction?.createdAt);

    if (PAYMENT_TYPES.has(type) && amount > 0) {
      payments += amount;
      if (createdAt && (!lastPaymentAt || createdAt > lastPaymentAt)) {
        lastPaymentAt = createdAt;
      }
      return;
    }

    if (REFUND_TYPES.has(type) && amount > 0) {
      refunds += amount;
      return;
    }

    if (amount < 0 || CHARGE_TYPES.has(type)) {
      // Treat negative amounts or known charge types as consumption
      charges += Math.abs(amount);
    }
  });

  // CRITICAL FIX: Refunds cannot exceed actual payments made
  // Otherwise we're giving back money that was never paid
  const maxAllowableRefunds = Math.min(payments, refunds);
  
  // Refunds can only offset up to the amount of accumulated charges,
  // but also cannot exceed what was actually paid
  const effectiveRefunds = Math.min(maxAllowableRefunds, charges);
  const netCharges = Math.max(0, charges - effectiveRefunds);
  const balance = payments - netCharges;

  return {
    balance: roundCurrency(balance),
    totalSpent: roundCurrency(netCharges),
    lastPaymentAt
  };
};

const findLatestSucceededPaymentIntent = (paymentIntents = []) => {
  return paymentIntents.reduce((latest, intent) => {
    if (!intent?.createdAt) return latest;
    const status = (intent.status || '').toLowerCase();
    if (!['succeeded', 'completed'].includes(status)) return latest;

    const createdAt = parseDateSafe(intent.createdAt);
    if (!createdAt) return latest;

    if (!latest || createdAt > latest) {
      return createdAt;
    }
    return latest;
  }, null);
};

let userColumnCapabilitiesPromise;

const getDefaultUserColumnCapabilities = () => ({
  language: false,
  preferred_currency: false,
  communication_preferences: false,
  emergency_contact: false,
  package_hours: false,
  remaining_hours: false
});

async function getUserColumnCapabilities(client) {
  if (!userColumnCapabilitiesPromise) {
    const runner = client ?? pool;
    userColumnCapabilitiesPromise = runner
      .query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'`
      )
      .then(({ rows }) => {
        const columnSet = rows.reduce((acc, { column_name: columnName }) => {
          acc[columnName] = true;
          return acc;
        }, {});
        return {
          language: Boolean(columnSet.language),
          preferred_currency: Boolean(columnSet.preferred_currency),
          communication_preferences: Boolean(columnSet.communication_preferences),
          emergency_contact: Boolean(columnSet.emergency_contact),
          package_hours: Boolean(columnSet.package_hours),
          remaining_hours: Boolean(columnSet.remaining_hours)
        };
      })
      .catch((error) => {
        logger.warn('Failed to inspect users table columns', { error: error.message });
        return getDefaultUserColumnCapabilities();
      });
  }

  return userColumnCapabilitiesPromise;
}

let transactionColumnCapabilitiesPromise;

const getDefaultTransactionColumnCapabilities = () => ({
  rental_id: false
});

async function getWalletTransactionColumnCapabilities(client) {
  if (!transactionColumnCapabilitiesPromise) {
    const runner = client ?? pool;
    transactionColumnCapabilitiesPromise = runner
      .query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'wallet_transactions'`
      )
      .then(({ rows }) => {
        const columnSet = rows.reduce((acc, { column_name: columnName }) => {
          acc[columnName] = true;
          return acc;
        }, {});
        return {
          rental_id: Boolean(columnSet.rental_id)
        };
      })
      .catch((error) => {
        logger.warn('Failed to inspect wallet_transactions table columns', { error: error.message });
        return getDefaultTransactionColumnCapabilities();
      });
  }

  return transactionColumnCapabilitiesPromise;
}

const normalizeStudentId = (studentId) => {
  if (studentId === null || typeof studentId === 'undefined') {
    return '';
  }

  if (typeof studentId === 'string') {
    return studentId.trim();
  }

  return String(studentId).trim();
};

const requireValidStudentId = (studentId) => {
  const normalized = normalizeStudentId(studentId);
  return normalized && uuidValidate(normalized) ? normalized : null;
};

const buildFallbackStudentOverview = (studentId, fallbackUser = {}) => {
  const fallbackId = studentId || fallbackUser.id || null;
  const fallbackEmail = fallbackUser.email || null;
  const resolvedFirstName = fallbackUser.firstName || fallbackUser.first_name || null;
  const resolvedLastName = fallbackUser.lastName || fallbackUser.last_name || null;

  let fallbackName = fallbackUser.name || fallbackUser.fullName || null;
  if (!fallbackName && (resolvedFirstName || resolvedLastName)) {
    fallbackName = `${resolvedFirstName || ''} ${resolvedLastName || ''}`.trim();
  }
  if (!fallbackName && fallbackEmail) {
    fallbackName = fallbackEmail.split('@')[0];
  }
  if (!fallbackName) {
    fallbackName = 'Student';
  }

  const resolvedPreferredCurrency = fallbackUser.preferredCurrency || fallbackUser.preferred_currency || 'EUR';
  const resolvedPackageHours = Number(fallbackUser.packageHours ?? fallbackUser.package_hours ?? 0) || 0;
  const resolvedRemainingHours = Number(fallbackUser.remainderHours ?? fallbackUser.remainingHours ?? fallbackUser.remaining_hours ?? 0) || 0;

  const student = {
    id: fallbackId,
    name: fallbackName,
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    email: fallbackEmail,
    phone: fallbackUser.phone || null,
    level: fallbackUser.level || null,
    avatar:
      fallbackUser.profileImageUrl ||
      fallbackUser.profile_image_url ||
      fallbackUser.avatar ||
      null,
    notes: null,
  preferredCurrency: resolvedPreferredCurrency,
  remainderHours: resolvedRemainingHours,
  packageHours: resolvedPackageHours,
    createdAt: null,
    updatedAt: null,
    emergencyContact: null,
    communicationPreferences: null,
    account: {
      balance: 0,
      totalSpent: 0,
      lastPaymentAt: null
    }
  };

  return {
    student,
    metrics: {
      totalHours: 0,
      completedLessons: 0,
      upcomingLessons: 0,
      accountBalance: 0,
      totalSpent: 0,
      lastPayment: null
    },
    heroSession: null,
    stats: {
      completedSessions: 0,
      upcomingSessions: 0,
      totalHours: 0,
      nextSessionAt: null,
      completionPercent: 0
    },
    packages: [],
    upcomingSessions: [],
    nextLessons: [],
    previousLessons: [],
    progress: [],
    instructorNotes: [],
    notifications: [],
    payments: [],
    recommendedProducts: [],
    recommendations: [],
    unratedBookings: [],
    supportTickets: []
  };
};

const FALLBACK_PG_ERROR_CODES = new Set([
  '42P01', // undefined table
  '42P07', // duplicate table/index
  '42703', // undefined column
  '42704', // undefined object
  '22P02', // invalid text representation
  '57P01', // admin shutdown
  '53300', // too many connections
  '55P03' // lock not available
]);

const FALLBACK_SYSTEM_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN'
]);

const shouldFallbackForError = (error) => {
  if (!error) return false;

  const queue = [error];
  const visited = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const status = current.status ?? current.statusCode;
    if (status === 404) return true;

    const code = current.code || current.sqlState || current.errno;
    if (typeof code === 'string') {
      if (FALLBACK_PG_ERROR_CODES.has(code) || FALLBACK_SYSTEM_ERROR_CODES.has(code)) {
        return true;
      }
    }

    if (typeof current.message === 'string') {
      const normalizedMessage = current.message.toLowerCase();
      if (
        (normalizedMessage.includes('connection') || normalizedMessage.includes('timeout')) &&
        (normalizedMessage.includes('refused') ||
          normalizedMessage.includes('closed') ||
          normalizedMessage.includes('terminated') ||
          normalizedMessage.includes('timeout'))
      ) {
        return true;
      }
    }

    if (Array.isArray(current.errors)) {
      queue.push(...current.errors);
    }

    if (current.original) {
      queue.push(current.original);
    }

    if (current.cause) {
      queue.push(current.cause);
    }
  }

  return false;
};

export async function getStudentOverview(studentId, options = {}) {
  const { fallbackUser } = options;
  const normalizedStudentId = normalizeStudentId(studentId);
  const fallbackOverview = buildFallbackStudentOverview(normalizedStudentId, fallbackUser);

  if (!normalizedStudentId) {
    logger.warn('Student overview requested without a student id');
    return fallbackOverview;
  }

  if (!uuidValidate(normalizedStudentId)) {
    logger.warn('Student overview requested with invalid id format', {
      studentId: normalizedStudentId
    });
    return fallbackOverview;
  }

  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    if (shouldFallbackForError(error)) {
      logger.warn('Unable to acquire DB connection for student overview, returning fallback', {
        studentId: normalizedStudentId || null,
        code: error.code,
        message: error.message
      });
      return fallbackOverview;
    }

    throw error;
  }

  try {
    const { rows: tableRows } = await client.query(`
      SELECT
        to_regclass('student_accounts') AS student_accounts,
        to_regclass('customer_packages') AS customer_packages,
        to_regclass('student_progress') AS student_progress,
        to_regclass('notifications') AS notifications,
    to_regclass('payment_intents') AS payment_intents,
    to_regclass('wallet_transactions') AS wallet_transactions,
        to_regclass('booking_participants') AS booking_participants,
  to_regclass('student_support_requests') AS student_support_requests,
  to_regclass('instructor_student_notes') AS instructor_student_notes,
  to_regclass('instructor_ratings') AS instructor_ratings,
  to_regclass('recommended_products') AS recommended_products,
  to_regclass('wallet_balances') AS wallet_balances,
  to_regclass('rentals') AS rentals
    `);

    const tableMap = tableRows[0] || {};
  const hasStudentAccounts = Boolean(tableMap.student_accounts);
  const hasCustomerPackages = Boolean(tableMap.customer_packages);
  const hasStudentProgress = Boolean(tableMap.student_progress);
  const hasNotifications = Boolean(tableMap.notifications);
  const hasPaymentIntents = Boolean(tableMap.payment_intents);
  const hasWalletTransactions = Boolean(tableMap.wallet_transactions);
  const hasBookingParticipants = Boolean(tableMap.booking_participants);
  const hasSupportRequests = Boolean(tableMap.student_support_requests);
  const hasInstructorStudentNotes = Boolean(tableMap.instructor_student_notes);
  const hasInstructorRatings = Boolean(tableMap.instructor_ratings);
  const hasRecommendedProductsTable = Boolean(tableMap.recommended_products);
  const hasWalletBalances = Boolean(tableMap.wallet_balances);
  const hasRentalsTable = Boolean(tableMap.rentals);

    if (!hasStudentAccounts || !hasCustomerPackages || !hasStudentProgress || !hasNotifications || !hasPaymentIntents || !hasWalletTransactions || !hasSupportRequests || !hasInstructorStudentNotes || !hasInstructorRatings || !hasRecommendedProductsTable || !hasWalletBalances) {
      logger.debug('Student portal table availability', {
        hasStudentAccounts,
        hasCustomerPackages,
        hasStudentProgress,
        hasNotifications,
        hasPaymentIntents,
        hasWalletTransactions,
        hasBookingParticipants,
        hasSupportRequests,
        hasInstructorStudentNotes,
        hasInstructorRatings,
        hasRecommendedProductsTable,
        hasWalletBalances,
        hasRentalsTable
      });
    }

    const userColumns = await getUserColumnCapabilities(client);
    const transactionColumns = hasWalletTransactions
      ? await getWalletTransactionColumnCapabilities(client)
      : getDefaultTransactionColumnCapabilities();
    const hasLanguageColumn = userColumns.language;
    const hasPreferredCurrencyColumn = userColumns.preferred_currency;
    const hasCommunicationPreferencesColumn = userColumns.communication_preferences;
    const hasEmergencyContactColumn = userColumns.emergency_contact;
    const hasPackageHoursColumn = userColumns.package_hours;
    const hasRemainingHoursColumn = userColumns.remaining_hours;
  const hasTransactionRentalIdColumn = transactionColumns.rental_id;

    const profileSelectFields = [
      'u.id',
      'u.name',
      'u.first_name',
      'u.last_name',
      'u.email',
      'u.phone',
      'u.level',
      'u.profile_image_url',
      'u.notes',
      hasPreferredCurrencyColumn ? 'u.preferred_currency' : 'NULL::text AS preferred_currency',
      hasPackageHoursColumn ? 'u.package_hours' : 'NULL::numeric AS package_hours',
      hasRemainingHoursColumn ? 'u.remaining_hours' : 'NULL::numeric AS remaining_hours',
      hasLanguageColumn ? 'u.language' : 'NULL::text AS language',
      'u.created_at',
      'u.updated_at',
      hasEmergencyContactColumn ? 'u.emergency_contact' : 'NULL::json AS emergency_contact',
      hasCommunicationPreferencesColumn ? 'u.communication_preferences' : 'NULL::json AS communication_preferences',
      hasStudentAccounts ? 'sa.balance' : 'NULL::numeric AS balance',
      hasStudentAccounts ? 'sa.total_spent' : 'NULL::numeric AS total_spent',
      hasStudentAccounts ? 'sa.last_payment_date' : 'NULL::timestamp AS last_payment_date',
      hasStudentAccounts ? 'sa.user_id AS account_user_id' : 'NULL::uuid AS account_user_id'
    ];

    const now = new Date();
    const profileQuery = `SELECT ${profileSelectFields.join(',\n                ')}
           FROM users u
          ${hasStudentAccounts ? 'LEFT JOIN student_accounts sa ON sa.user_id = u.id' : ''}
          WHERE u.id = $1`;

    const ratingSelectProjection = hasInstructorRatings
      ? `ir.id AS rating_id,
         ir.rating AS rating_value,
         ir.feedback_text AS rating_feedback,
         ir.service_type AS rating_service_type,
         ir.is_anonymous AS rating_is_anonymous,
         ir.created_at AS rating_created_at,
         ir.metadata AS rating_metadata`
      : `NULL::uuid AS rating_id,
         NULL::smallint AS rating_value,
         NULL::text AS rating_feedback,
         NULL::text AS rating_service_type,
         NULL::boolean AS rating_is_anonymous,
         NULL::timestamptz AS rating_created_at,
         NULL::jsonb AS rating_metadata`;

    const ratingJoinClause = hasInstructorRatings ? 'LEFT JOIN instructor_ratings ir ON ir.booking_id = b.id' : '';

  const previousLessonsPromise = client.query(
      `SELECT b.id,
              b.date,
              b.start_hour,
              b.duration,
              b.status,
              b.location,
              b.notes,
              b.payment_status,
              b.service_id,
              s.name AS service_name,
              s.service_type,
              s.level AS service_level,
              s.duration AS service_default_duration,
              i.id AS instructor_id,
              COALESCE(i.name, CONCAT(COALESCE(i.first_name,''),' ',COALESCE(i.last_name,''))) AS instructor_name,
              i.profile_image_url AS instructor_avatar,
              (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) AS start_ts,
              ${ratingSelectProjection}
         FROM bookings b
    LEFT JOIN users i ON i.id = b.instructor_user_id
    LEFT JOIN services s ON s.id = b.service_id
    ${ratingJoinClause}
        WHERE (b.student_user_id = $1 OR b.customer_user_id = $1)
          AND b.deleted_at IS NULL
          AND (b.status IS NULL OR b.status NOT IN ('cancelled','archived'))
          AND (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) < NOW()
     ORDER BY start_ts DESC
        LIMIT 10`,
      [normalizedStudentId]
    );

    const instructorNotesPromise = hasInstructorStudentNotes
      ? client.query(
          `SELECT n.id,
                  n.instructor_id,
                  n.student_id,
                  n.booking_id,
                  n.note_text,
                  n.visibility,
                  n.is_pinned,
                  n.metadata,
                  n.created_at,
                  n.updated_at,
                  COALESCE(i.name, CONCAT(COALESCE(i.first_name,''),' ',COALESCE(i.last_name,''))) AS instructor_name,
                  i.profile_image_url AS instructor_avatar
             FROM instructor_student_notes n
        LEFT JOIN users i ON i.id = n.instructor_id
            WHERE n.student_id = $1
              AND (n.visibility = 'student_visible' OR n.visibility IS NULL)
        ORDER BY n.is_pinned DESC, n.created_at DESC
           LIMIT 25`,
          [normalizedStudentId]
        )
      : Promise.resolve({ rows: [] });

    const [
      profileRes,
      upcomingRes,
      statsRes,
      packagesRes,
      progressRes,
      notificationsRes,
      paymentIntentsRes,
      transactionsRes,
      supportRes,
      previousLessonsRes,
      instructorNotesRes
    ] = await Promise.all([
      client.query(profileQuery, [normalizedStudentId]),
      client.query(
        `SELECT b.id, b.date, b.start_hour, b.duration, b.status,
                b.location, b.payment_status, b.customer_package_id,
                b.service_id, s.name AS service_name,
                i.id AS instructor_id,
                COALESCE(i.name, CONCAT(COALESCE(i.first_name,''),' ',COALESCE(i.last_name,''))) AS instructor_name,
                (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) AS start_ts
           FROM bookings b
           LEFT JOIN users i ON i.id = b.instructor_user_id
           LEFT JOIN services s ON s.id = b.service_id
          WHERE (b.student_user_id = $1 OR b.customer_user_id = $1)
            AND b.deleted_at IS NULL
            AND (b.status IS NULL OR b.status NOT IN ('cancelled','archived'))
            AND (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) >= NOW()
       ORDER BY start_ts ASC
          LIMIT 5`,
        [normalizedStudentId]
      ),
      client.query(
        `SELECT COUNT(*) FILTER (WHERE (b.status IS NULL OR b.status <> 'cancelled') AND (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) < NOW()) AS completed_count,
                COUNT(*) FILTER (WHERE (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) >= NOW()) AS upcoming_count,
                COALESCE(SUM(b.duration) FILTER (WHERE b.status IS NULL OR b.status <> 'cancelled'),0) AS total_hours,
                MIN((b.date::timestamptz + (b.start_hour * INTERVAL '1 hour'))) FILTER (WHERE (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) > NOW()) AS next_session_at
           FROM bookings b
          WHERE (b.student_user_id = $1 OR b.customer_user_id = $1)
            AND b.deleted_at IS NULL`,
        [normalizedStudentId]
      ),
      hasCustomerPackages
        ? client.query(
            `SELECT cp.id,
                    cp.package_name,
                    cp.total_hours,
                    cp.used_hours,
                    cp.remaining_hours,
                    cp.expiry_date,
                    cp.status,
                    cp.lesson_service_name,
                    cp.purchase_price,
                    cp.currency,
                    cp.last_used_date
               FROM customer_packages cp
              WHERE cp.customer_id = $1
              ORDER BY cp.created_at DESC
              LIMIT 10`,
            [normalizedStudentId]
          )
        : Promise.resolve({ rows: [] }),
      hasStudentProgress
        ? client.query(
            `SELECT sp.id,
                    sp.skill_id,
                    s.name AS skill_name,
                    sl.name AS level_name,
                    sp.date_achieved,
                    sp.notes,
                    sp.created_at
               FROM student_progress sp
               LEFT JOIN skills s ON s.id = sp.skill_id
               LEFT JOIN skill_levels sl ON sl.id = s.skill_level_id
              WHERE sp.student_id = $1
              ORDER BY sp.date_achieved DESC NULLS LAST, sp.created_at DESC
              LIMIT 20`,
            [normalizedStudentId]
          )
        : Promise.resolve({ rows: [] }),
      hasNotifications
        ? client.query(
            `SELECT n.id, n.title, n.message, n.type, n.status, n.created_at, n.read_at
               FROM notifications n
              WHERE n.user_id = $1
              ORDER BY n.created_at DESC
              LIMIT 10`,
            [normalizedStudentId]
          )
        : Promise.resolve({ rows: [] }),
      hasPaymentIntents
        ? client.query(
            `SELECT pi.id,
                    pi.stripe_payment_intent_id,
                    pi.amount,
                    pi.currency,
                    pi.status,
                    pi.booking_id,
                    pi.created_at,
                    pi.updated_at,
                    b.service_id,
                    s.name AS service_name
               FROM payment_intents pi
          LEFT JOIN bookings b ON b.id = pi.booking_id
          LEFT JOIN services s ON s.id = b.service_id
              WHERE pi.user_id = $1
           ORDER BY pi.created_at DESC
              LIMIT 10`,
            [normalizedStudentId]
          )
        : Promise.resolve({ rows: [] }),
      hasWalletTransactions
        ? (() => {
            const transactionSelectFields = [
              'wt.id',
              'wt.amount',
              'wt.available_delta',
              'wt.pending_delta',
              'wt.direction',
              'wt.currency',
              'wt.transaction_type AS type',
              'wt.status',
              'wt.description',
              'wt.payment_method',
              'wt.reference_number',
              'wt.booking_id',
              hasTransactionRentalIdColumn ? 'wt.rental_id' : 'NULL::uuid AS rental_id',
              'COALESCE(wt.transaction_date, wt.created_at) AS effective_date',
              'wt.transaction_date',
              'wt.created_at',
              'wt.updated_at',
              'b.service_id',
              's.name AS service_name',
              'b.date AS booking_date',
              'b.start_hour AS booking_start_hour'
            ];

            const canJoinRentals = hasTransactionRentalIdColumn && hasRentalsTable;

            if (canJoinRentals) {
              transactionSelectFields.push('r.start_date AS rental_start_date');
              transactionSelectFields.push('r.end_date AS rental_end_date');
              transactionSelectFields.push('r.total_price AS rental_total_price');
              transactionSelectFields.push('r.status AS rental_status');
            } else {
              transactionSelectFields.push('NULL::timestamptz AS rental_start_date');
              transactionSelectFields.push('NULL::timestamptz AS rental_end_date');
              transactionSelectFields.push('NULL::numeric AS rental_total_price');
              transactionSelectFields.push('NULL::text AS rental_status');
            }

            if (hasBookingParticipants) {
              transactionSelectFields.push('bp.user_id AS participant_user_id');
            } else {
              transactionSelectFields.push('NULL::uuid AS participant_user_id');
            }

            const transactionJoins = [
              'LEFT JOIN bookings b ON b.id = wt.booking_id',
              'LEFT JOIN services s ON s.id = b.service_id'
            ];

            if (canJoinRentals) {
              transactionJoins.push('LEFT JOIN rentals r ON r.id = wt.rental_id');
            }

            if (hasBookingParticipants) {
              transactionJoins.push('LEFT JOIN booking_participants bp ON bp.booking_id = wt.booking_id');
            }

            const transactionWhereParts = ['(wt.user_id = $1)'];
            transactionWhereParts.push('(COALESCE(b.student_user_id, b.customer_user_id) = $1)');
            if (canJoinRentals) {
              transactionWhereParts.push('(r.user_id = $1)');
            }
            if (hasBookingParticipants) {
              transactionWhereParts.push('(bp.user_id = $1)');
            }

            const transactionPredicate = transactionWhereParts
              .map((clause) => `(${clause})`)
              .join(' OR ');

            const transactionQuery = `
              SELECT ${transactionSelectFields.join(',\n                     ')}
                FROM wallet_transactions wt
                ${transactionJoins.join('\n                ')}
               WHERE ${transactionPredicate}
            ORDER BY COALESCE(wt.transaction_date, wt.created_at) DESC, wt.created_at DESC
               LIMIT 30`;

            return client.query(transactionQuery, [normalizedStudentId]);
          })()
        : Promise.resolve({ rows: [] }),
      hasSupportRequests
        ? client.query(
            `SELECT sr.id, sr.status, sr.priority, sr.created_at
               FROM student_support_requests sr
              WHERE sr.student_id = $1
           ORDER BY sr.created_at DESC
              LIMIT 3`,
            [normalizedStudentId]
          )
        : Promise.resolve({ rows: [] })
    ]);

    const rowsOf = (result) => (Array.isArray(result?.rows) ? result.rows : []);
    const firstRowOf = (result) => rowsOf(result)[0];

    const profileRow = firstRowOf(profileRes);
    if (!profileRow) {
      logger.warn('Student profile not found when building overview', {
        studentId: normalizedStudentId
      });
      return fallbackOverview;
    }

    const upcomingSessions = rowsOf(upcomingRes).map((row) => {
      const startTs = row.start_ts ? new Date(row.start_ts) : null;
      const endTs = startTs ? new Date(startTs.getTime() + coalesceNumber(row.duration, 1) * 3600 * 1000) : null;
      return {
        bookingId: row.id,
        date: row.date,
        startTime: startTs ? startTs.toISOString() : null,
        endTime: endTs ? endTs.toISOString() : null,
        status: row.status || 'scheduled',
        location: row.location || 'TBD',
        paymentStatus: row.payment_status || 'pending',
        instructor: row.instructor_id
          ? {
              id: row.instructor_id,
              name: (row.instructor_name || '').trim() || 'Instructor'
            }
          : null,
        service: row.service_id
          ? {
              id: row.service_id,
              name: row.service_name || 'Lesson'
            }
          : null
      };
    });

      const previousLessons = rowsOf(previousLessonsRes).map((row) => {
        const startTs = row.start_ts ? new Date(row.start_ts) : null;
        const durationHours = coalesceNumber(row.duration, row.service_default_duration || 1);
        const endTs = startTs ? new Date(startTs.getTime() + durationHours * 3600 * 1000) : null;
        const rating = row.rating_id
          ? {
              id: row.rating_id,
              value: coalesceNumber(row.rating_value),
              feedback: row.rating_feedback || null,
              serviceType: row.rating_service_type || 'lesson',
              isAnonymous: Boolean(row.rating_is_anonymous),
              createdAt: toIso(row.rating_created_at),
              metadata: parseJsonField(row.rating_metadata) || {}
            }
          : null;

        const instructorName = (row.instructor_name || '').trim();

        return {
          bookingId: row.id,
          date: row.date,
          startTime: startTs ? startTs.toISOString() : null,
          endTime: endTs ? endTs.toISOString() : null,
          durationHours,
          status: row.status || 'completed',
          location: row.location || null,
          notes: row.notes || null,
          paymentStatus: row.payment_status || 'completed',
          instructor: row.instructor_id
            ? {
                id: row.instructor_id,
                name: instructorName || 'Instructor',
                avatar: row.instructor_avatar || null
              }
            : null,
          service: row.service_id
            ? {
                id: row.service_id,
                name: row.service_name || 'Lesson',
                type: row.service_type || 'lesson',
                level: row.service_level || null
              }
            : null,
          rating,
          canRate: !rating && ((row.status || '').toLowerCase() === 'completed' || !row.status),
          serviceType: row.service_type || rating?.serviceType || 'lesson'
        };
      });

  const statsRow = firstRowOf(statsRes) || {};
    const packages = rowsOf(packagesRes).map((row) => {
      const totalHours = coalesceNumber(row.total_hours);
      const usedHours = coalesceNumber(row.used_hours);
      const remainingHours = coalesceNumber(row.remaining_hours, Math.max(totalHours - usedHours, 0));
      const utilisation = totalHours > 0 ? Math.round((usedHours / totalHours) * 100) : 0;
      const expiryDate = row.expiry_date ? new Date(row.expiry_date) : null;
      const daysToExpiry = expiryDate ? Math.round((expiryDate.getTime() - now.getTime()) / 86400000) : null;
      return {
        id: row.id,
        name: row.package_name || 'Package',
        lessonType: row.lesson_service_name || null,
        totalHours,
        usedHours,
        remainingHours,
        utilisation,
        status: row.status || (remainingHours > 0 ? 'active' : 'used_up'),
        expiresAt: expiryDate ? expiryDate.toISOString() : null,
        expiryWarning: daysToExpiry !== null && daysToExpiry <= 7,
        daysToExpiry,
        lastUsedAt: toIso(row.last_used_date),
        price: coalesceNumber(row.purchase_price),
        currency: row.currency || profileRow.preferred_currency || 'EUR'
      };
    });

  const progressEntries = rowsOf(progressRes).map((row) => ({
      id: row.id,
      skillId: row.skill_id,
      skillName: row.skill_name || 'Skill',
      levelName: row.level_name || null,
      dateAchieved: row.date_achieved ? row.date_achieved.toISOString().split('T')[0] : null,
      notes: row.notes || null,
      createdAt: toIso(row.created_at)
    }));

    const instructorNotes = rowsOf(instructorNotesRes).map((row) => {
      const instructorName = (row.instructor_name || '').trim();
      return {
        id: row.id,
        bookingId: row.booking_id,
        visibility: row.visibility || 'student_visible',
        isPinned: Boolean(row.is_pinned),
        note: row.note_text,
        metadata: parseJsonField(row.metadata) || {},
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        instructor: row.instructor_id
          ? {
              id: row.instructor_id,
              name: instructorName || 'Instructor',
              avatar: row.instructor_avatar || null
            }
          : null
      };
    });

  const notifications = rowsOf(notificationsRes).map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type || 'general',
      status: row.status || 'sent',
      createdAt: toIso(row.created_at),
      readAt: toIso(row.read_at)
    }));

    let unratedBookings = [];

    if (hasInstructorRatings) {
      try {
        unratedBookings = await fetchUnratedBookings(normalizedStudentId, { limit: 10 });
      } catch (error) {
        logger.warn('Failed to fetch unrated bookings from rating service', {
          studentId: normalizedStudentId,
          error: error.message
        });
        unratedBookings = [];
      }
    }

    if (!unratedBookings.length) {
      unratedBookings = previousLessons
        .filter((lesson) => lesson.canRate)
        .map((lesson) => ({
          bookingId: lesson.bookingId,
          instructor: lesson.instructor,
          service: lesson.service,
          serviceType: lesson.serviceType,
          completedAt: lesson.endTime || lesson.startTime,
          date: lesson.date
        }));
    }

  const paymentIntentRows = rowsOf(paymentIntentsRes);
  const transactionRows = rowsOf(transactionsRes);

    if (!transactionRows.length && !paymentIntentRows.length) {
      logger.debug('Student overview has no payment records', { studentId: normalizedStudentId });
    } else {
      logger.debug('Student payment aggregation', {
        studentId: normalizedStudentId,
        paymentIntentCount: paymentIntentRows.length,
        transactionCount: transactionRows.length
      });
    }

    const paymentIntentEntries = paymentIntentRows.map((row) => ({
      id: row.id,
      paymentIntentId: row.stripe_payment_intent_id,
      amount: coalesceNumber(row.amount),
      currency: row.currency || profileRow.preferred_currency || 'EUR',
      status: row.status,
      bookingId: row.booking_id,
      serviceName: row.service_name || null,
      description: row.service_name ? `Payment for ${row.service_name}` : 'Payment',
      paymentMethod: 'card',
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
      source: 'payment_intent',
      referenceNumber: null,
      type: row.status === 'succeeded' ? 'payment' : 'pending'
    }));

    const transactionEntriesRaw = transactionRows.map((row) => {
      const availableDelta = coalesceNumber(row.available_delta);
      const pendingDelta = coalesceNumber(row.pending_delta);
      let amount = availableDelta !== 0 ? availableDelta : coalesceNumber(row.amount);
      if (amount === 0 && pendingDelta !== 0) {
        amount = pendingDelta;
      }
      if (row.direction === 'debit' && amount > 0) {
        amount = -amount;
      } else if (row.direction === 'credit' && amount < 0) {
        amount = Math.abs(amount);
      }

      const createdAtIso = toIso(row.effective_date || row.transaction_date || row.created_at);
      const type = row.type || (amount >= 0 ? 'credit' : 'charge');
      const serviceName = row.service_name || null;
      const rentalDescriptor = row.rental_start_date
        ? `Rental ${new Date(row.rental_start_date).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}`
        : null;

      let description = row.description || null;
      if (!description) {
        if (serviceName) {
          description = type === 'refund' ? `Refund for ${serviceName}` : `Payment for ${serviceName}`;
        } else if (rentalDescriptor) {
          description = type === 'refund' ? `Rental refund - ${rentalDescriptor}` : `Rental charge - ${rentalDescriptor}`;
        } else {
          description = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Transaction';
        }
      }

      const status = row.status || 'completed';

      return {
        id: row.id,
        amount,
        currency: row.currency || profileRow.preferred_currency || 'EUR',
        status,
        bookingId: row.booking_id,
        rentalId: row.rental_id || null,
  lessonDate: row.booking_date || null,
  lessonStartTime: row.booking_start_hour || null,
        serviceName,
        description,
        paymentMethod: row.payment_method || null,
        createdAt: createdAtIso,
  transactionDate: toIso(row.transaction_date),
        updatedAt: toIso(row.updated_at),
        referenceNumber: row.reference_number || null,
        type,
        source: 'transaction',
        direction: row.direction || null,
        participantUserId: row.participant_user_id || null
      };
    });

    const transactionEntries = [];
    const seenTransactionIds = new Set();
    for (const entry of transactionEntriesRaw) {
      if (entry?.id) {
        if (seenTransactionIds.has(entry.id)) continue;
        seenTransactionIds.add(entry.id);
      }
      transactionEntries.push(entry);
    }

    const transactionSummary = computeTransactionAggregates(transactionEntries);
    const latestSucceededPaymentIntent = findLatestSucceededPaymentIntent(paymentIntentEntries);

    const payments = [...paymentIntentEntries, ...transactionEntries]
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 20);

    const lastPaymentEntry = payments.find((entry) => Number(entry.amount) > 0 && (entry.type === 'payment' || entry.type === 'credit'))
      || payments.find((entry) => Number(entry.amount) > 0);

  const supportTickets = rowsOf(supportRes).map((row) => ({
      id: row.id,
      status: row.status,
      priority: row.priority,
      createdAt: toIso(row.created_at)
    }));

    const heroSession = upcomingSessions[0] || null;
    const completionPercent = packages.length
      ? Math.min(100, Math.round(
          (packages.reduce((acc, pkg) => acc + pkg.usedHours, 0) /
            packages.reduce((acc, pkg) => acc + pkg.totalHours, 0 || 1)) * 100
        ))
      : Math.min(100, Math.round((coalesceNumber(statsRow.completed_count) / Math.max(coalesceNumber(statsRow.completed_count) + coalesceNumber(statsRow.upcoming_count), 1)) * 100));

    const hasLinkedAccountRow = Boolean(profileRow.account_user_id);
    const existingBalance = coalesceNumber(profileRow.balance);
    const existingTotalSpent = coalesceNumber(profileRow.total_spent);
    let resolvedBalance = existingBalance;
    let resolvedTotalSpent = existingTotalSpent;
    let resolvedLastPaymentAt = toIso(profileRow.last_payment_date);

    if (transactionEntries.length) {
      const balanceDiff = Math.abs(existingBalance - transactionSummary.balance);
      const totalSpentDiff = Math.abs(existingTotalSpent - transactionSummary.totalSpent);

      if (!hasLinkedAccountRow || balanceDiff > 0.01) {
        resolvedBalance = transactionSummary.balance;
      }

      if (!hasLinkedAccountRow || totalSpentDiff > 0.01) {
        resolvedTotalSpent = transactionSummary.totalSpent;
      }

      if (!resolvedLastPaymentAt && transactionSummary.lastPaymentAt) {
        resolvedLastPaymentAt = transactionSummary.lastPaymentAt.toISOString();
      }
    }

    if (!resolvedLastPaymentAt && latestSucceededPaymentIntent) {
      resolvedLastPaymentAt = latestSucceededPaymentIntent.toISOString();
    }

    resolvedBalance = roundCurrency(resolvedBalance);
    resolvedTotalSpent = roundCurrency(resolvedTotalSpent);

    if (transactionEntries.length && Math.abs(existingBalance - resolvedBalance) > 0.01) {
      logger.debug('Student account balance reconciled from transactions', {
        studentId,
        existingBalance,
        resolvedBalance
      });
    }

    const metrics = {
      totalHours: coalesceNumber(statsRow.total_hours),
      completedLessons: coalesceNumber(statsRow.completed_count),
      upcomingLessons: coalesceNumber(statsRow.upcoming_count),
      accountBalance: resolvedBalance,
      totalSpent: resolvedTotalSpent,
      lastPayment: lastPaymentEntry
        ? {
            amount: roundCurrency(coalesceNumber(lastPaymentEntry.amount)),
            currency: lastPaymentEntry.currency || profileRow.preferred_currency || 'EUR',
            status: lastPaymentEntry.status || 'completed',
            date: lastPaymentEntry.createdAt,
            description: lastPaymentEntry.description,
            referenceNumber: lastPaymentEntry.referenceNumber,
            paymentMethod: lastPaymentEntry.paymentMethod
          }
        : null
    };

    const recommendedProducts = hasRecommendedProductsTable
      ? await getRecommendedProductsForRole('student', 8)
      : [];

    return {
      student: {
        id: profileRow.id,
        name: profileRow.name || `${profileRow.first_name || ''} ${profileRow.last_name || ''}`.trim() || 'Student',
        firstName: profileRow.first_name,
        lastName: profileRow.last_name,
        email: profileRow.email,
        phone: profileRow.phone,
        level: profileRow.level,
        avatar: profileRow.profile_image_url || null,
        notes: profileRow.notes || null,
        preferredCurrency: profileRow.preferred_currency || 'EUR',
        remainderHours: coalesceNumber(profileRow.remaining_hours),
        packageHours: coalesceNumber(profileRow.package_hours),
        createdAt: toIso(profileRow.created_at),
        updatedAt: toIso(profileRow.updated_at),
        emergencyContact: parseJsonField(profileRow.emergency_contact),
        communicationPreferences: parseJsonField(profileRow.communication_preferences),
        account: {
          balance: resolvedBalance,
          totalSpent: resolvedTotalSpent,
          lastPaymentAt: resolvedLastPaymentAt
        }
      },
      metrics,
      heroSession,
      stats: {
        completedSessions: coalesceNumber(statsRow.completed_count),
        upcomingSessions: coalesceNumber(statsRow.upcoming_count),
        totalHours: coalesceNumber(statsRow.total_hours),
        nextSessionAt: toIso(statsRow.next_session_at),
        completionPercent
      },
      packages,
      upcomingSessions,
      nextLessons: upcomingSessions,
      previousLessons,
      progress: progressEntries,
      instructorNotes,
      notifications,
      payments,
      recommendedProducts,
      recommendations: recommendedProducts,
      unratedBookings,
      supportTickets
    };
  } catch (error) {
    if (shouldFallbackForError(error)) {
      logger.warn('Falling back to empty student overview after error', {
        studentId: normalizedStudentId,
        code: error.code,
        message: error.message
      });
      return fallbackOverview;
    }

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function getStudentSchedule(studentId, { startDate, endDate, limit = 100 } = {}) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    logger.warn('Student schedule requested with invalid id format', { studentId });
    return [];
  }

  const client = await pool.connect();
  try {
    const { rows: tableRows } = await client.query(`SELECT to_regclass('booking_participants') AS booking_participants`);
    const hasParticipantTable = Boolean(tableRows[0]?.booking_participants);

    const params = [normalizedStudentId];
    const conditions = [`(b.student_user_id = $1 OR b.customer_user_id = $1)`];

    if (startDate) {
      params.push(startDate);
      conditions.push(`b.date >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`b.date <= $${params.length}`);
    }

    params.push(Math.min(limit, 500));

    const participantSelect = hasParticipantTable
      ? `json_agg(bp.*) FILTER (WHERE bp.user_id IS NOT NULL) AS participant_rows`
      : `NULL::json AS participant_rows`;
    const participantJoin = hasParticipantTable ? 'LEFT JOIN booking_participants bp ON bp.booking_id = b.id' : '';

    const query = `
      SELECT b.id,
             b.date,
             b.start_hour,
             b.duration,
             b.status,
             b.location,
             b.notes,
             b.payment_status,
             b.weather_conditions,
             b.customer_package_id,
             b.service_id,
             s.name AS service_name,
             s.level AS service_level,
             s.service_type,
             s.duration AS service_default_duration,
             i.id AS instructor_id,
             COALESCE(i.name, CONCAT(COALESCE(i.first_name,''),' ',COALESCE(i.last_name,''))) AS instructor_name,
             i.phone AS instructor_phone,
             i.email AS instructor_email,
       (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) AS start_ts,
       (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour') + (COALESCE(b.duration,1) * INTERVAL '1 hour')) AS end_ts,
       ${participantSelect}
        FROM bookings b
   LEFT JOIN users i ON i.id = b.instructor_user_id
   LEFT JOIN services s ON s.id = b.service_id
   ${participantJoin}
       WHERE ${conditions.join(' AND ')}
         AND b.deleted_at IS NULL
    GROUP BY b.id, s.id, i.id
    ORDER BY start_ts ASC
       LIMIT $${params.length}`;

    const { rows } = await client.query(query, params);

    return rows.map((row) => {
      const startTs = row.start_ts ? new Date(row.start_ts) : null;
      const endTs = row.end_ts ? new Date(row.end_ts) : null;
      const participants = hasParticipantTable && Array.isArray(row.participant_rows)
        ? row.participant_rows.map((participant) => ({
            id: participant.user_id,
            isPrimary: participant.is_primary,
            paymentStatus: participant.payment_status,
            paymentAmount: coalesceNumber(participant.payment_amount),
            notes: participant.notes,
            customerPackageId: participant.customer_package_id
          }))
        : [];
      return {
        bookingId: row.id,
        date: row.date,
        startTime: startTs ? startTs.toISOString() : null,
        endTime: endTs ? endTs.toISOString() : null,
        durationHours: coalesceNumber(row.duration, row.service_default_duration || 1),
        status: row.status || 'scheduled',
        location: row.location || 'TBD',
        notes: row.notes || null,
        paymentStatus: row.payment_status || 'pending',
        weatherConditions: row.weather_conditions || null,
        service: row.service_id
          ? {
              id: row.service_id,
              name: row.service_name || 'Lesson',
              level: row.service_level,
              type: row.service_type,
              defaultDuration: coalesceNumber(row.service_default_duration || 1)
            }
          : null,
        instructor: row.instructor_id
          ? {
              id: row.instructor_id,
              name: (row.instructor_name || '').trim() || 'Instructor',
              phone: row.instructor_phone,
              email: row.instructor_email
            }
          : null,
        participants
      };
    });
  } finally {
    client.release();
  }
}

export async function updateStudentBooking(studentId, bookingId, payload = {}) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    throw new NotFoundError('Student not found');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT b.*, (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) AS start_ts
         FROM bookings b
        WHERE b.id = $1
          AND (b.student_user_id = $2 OR b.customer_user_id = $2)
          AND b.deleted_at IS NULL
        LIMIT 1`,
      [bookingId, normalizedStudentId]
    );

    if (!bookingRes.rows.length) {
      const err = new Error('Booking not found');
      err.status = 404;
      throw err;
    }

    const booking = bookingRes.rows[0];
    const action = (payload.action || '').toLowerCase();

    if (action === 'cancel') {
      if (booking.status === 'cancelled') {
        await client.query('ROLLBACK');
        return { success: true, bookingId, status: 'cancelled' };
      }

      const result = await client.query(
        `UPDATE bookings
            SET status = 'cancelled',
                updated_at = NOW(),
                notes = CONCAT(COALESCE(notes,'')::text, '\n[Student cancelled on ', NOW()::text, ']')
          WHERE id = $1
        RETURNING status, updated_at`,
        [bookingId]
      );

      await client.query('COMMIT');
      return {
        success: true,
        bookingId,
        status: result.rows[0].status,
        updatedAt: toIso(result.rows[0].updated_at)
      };
    }

    if (action === 'reschedule') {
      const { newDate, newStartHour, reason } = payload;
      logger.info('Reschedule request received', { bookingId, newDate, newStartHour, reason, payload });
      
      if (!newDate || typeof newStartHour === 'undefined' || newStartHour === null) {
        logger.warn('Reschedule validation failed', { newDate, newStartHour, typeofNewStartHour: typeof newStartHour });
        const err = new Error('newDate and newStartHour are required to reschedule');
        err.status = 400;
        throw err;
      }

      const targetRes = await client.query(
        `SELECT COUNT(*) AS conflict_count
           FROM bookings
          WHERE instructor_user_id = $1
            AND date = $2
            AND deleted_at IS NULL
            AND id <> $3
            AND ((start_hour <= $4 AND start_hour + duration > $4)
                 OR (start_hour >= $4 AND start_hour < $4 + $5))`,
        [
          booking.instructor_user_id,
          newDate,
          bookingId,
          Number(newStartHour),
          Number(booking.duration) || 1
        ]
      );

      if (Number(targetRes.rows[0]?.conflict_count || 0) > 0) {
        const err = new Error('Requested time is no longer available');
        err.status = 409;
        throw err;
      }

      const result = await client.query(
        `UPDATE bookings
            SET date = $1,
                start_hour = $2,
                updated_at = NOW(),
                notes = CONCAT(COALESCE(notes,'')::text, E'\n[Student rescheduled on ', NOW()::text, ']', $3::text)
          WHERE id = $4
        RETURNING date, start_hour, updated_at`,
        [
          newDate,
          Number(newStartHour),
          reason ? ` Reason: ${reason}` : '',
          bookingId
        ]
      );

      await client.query('COMMIT');

      // Convert newStartHour to time string (e.g., "14:30")
      const hours = Math.floor(Number(newStartHour));
      const minutes = Math.round((Number(newStartHour) - hours) * 60);
      const newTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

      // Send notification to managers
      try {
        await bookingNotificationService.sendRescheduleRequest({
          bookingId,
          studentId,
          newDate,
          newTime,
          reason
        });
      } catch (notifyError) {
        logger.warn('Failed to send reschedule notification', { bookingId, error: notifyError.message });
        // Don't fail the reschedule if notification fails
      }

      return {
        success: true,
        bookingId,
        date: result.rows[0].date,
        startHour: Number(result.rows[0].start_hour),
        updatedAt: toIso(result.rows[0].updated_at)
      };
    }

    await client.query('ROLLBACK');
    const err = new Error('Unsupported booking update action');
    err.status = 400;
    throw err;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStudentCourses(studentId) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    logger.warn('Student courses requested with invalid id format', { studentId });
    return [];
  }

  const client = await pool.connect();
  try {
    const hasResourcesRes = await client.query("SELECT to_regclass('course_resources') AS table_ref");
    const hasCourseResources = Boolean(hasResourcesRes.rows[0]?.table_ref);

    const resourcesCte = hasCourseResources
      ? `, resources AS (
          SELECT r.course_id,
                 COUNT(*) AS resource_count
            FROM course_resources r
        GROUP BY r.course_id
        )`
      : '';

    const resourceSelect = hasCourseResources
      ? 'COALESCE(resources.resource_count, 0) AS resource_count'
      : '0 AS resource_count';

    const resourceJoin = hasCourseResources ? 'LEFT JOIN resources ON resources.course_id = s.id' : '';

    const { rows } = await client.query(
      `WITH lessons AS (
          SELECT b.service_id,
                 COUNT(*) FILTER (WHERE b.status = 'completed') AS completed_count,
                 COUNT(*) FILTER (WHERE b.status IS NULL OR b.status <> 'cancelled') AS total_count,
                 MIN(b.date) AS first_date,
                 MAX(b.date) AS last_date
            FROM bookings b
           WHERE (b.student_user_id = $1 OR b.customer_user_id = $1)
             AND b.service_id IS NOT NULL
             AND b.deleted_at IS NULL
        GROUP BY b.service_id
        )${resourcesCte}
        SELECT s.id,
               s.name,
               s.description,
               s.level,
               s.service_type,
               s.duration,
               s.includes,
               lessons.completed_count,
               lessons.total_count,
               lessons.first_date,
               lessons.last_date,
               ${resourceSelect}
          FROM services s
     LEFT JOIN lessons ON lessons.service_id = s.id
     ${resourceJoin}
         WHERE lessons.service_id IS NOT NULL
      ORDER BY lessons.last_date DESC NULLS LAST, s.name ASC
         LIMIT 50`,
      [normalizedStudentId]
    );

    return rows.map((row) => {
      const completed = coalesceNumber(row.completed_count);
      const total = coalesceNumber(row.total_count);
      return {
        courseId: row.id,
        name: row.name,
        description: row.description,
        level: row.level,
        serviceType: row.service_type,
        durationHours: coalesceNumber(row.duration, 1),
        includes: row.includes,
        progress: {
          completedLessons: completed,
          totalLessons: total,
          percent: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
          firstLessonDate: row.first_date ? row.first_date.toISOString().split('T')[0] : null,
          lastLessonDate: row.last_date ? row.last_date.toISOString().split('T')[0] : null
        },
        resourceCount: coalesceNumber(row.resource_count)
      };
    });
  } finally {
    client.release();
  }
}

export async function getStudentResources(studentId, courseId) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    logger.warn('Student resources requested with invalid id format', { studentId, courseId });
    return [];
  }

  const client = await pool.connect();
  try {
    const hasResourcesRes = await client.query("SELECT to_regclass('course_resources') AS table_ref");
    const hasCourseResources = Boolean(hasResourcesRes.rows[0]?.table_ref);

    if (!hasCourseResources) {
      return [];
    }

    const entitlementRes = await client.query(
      `SELECT 1
         FROM bookings b
        WHERE (b.student_user_id = $1 OR b.customer_user_id = $1)
          AND b.service_id = $2
          AND b.deleted_at IS NULL
        LIMIT 1`,
      [studentId, courseId]
      [normalizedStudentId, courseId]
    );

    if (!entitlementRes.rows.length) {
      const err = new Error('Course access not found');
      err.status = 403;
      throw err;
    }

    const { rows } = await client.query(
      `SELECT r.id,
              r.course_id,
              r.title,
              r.description,
              r.resource_type,
              r.resource_url,
              r.requires_ack,
              r.created_at,
              r.updated_at
         FROM course_resources r
        WHERE r.course_id = $1
        ORDER BY r.created_at ASC`,
      [courseId]
    );

    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      type: row.resource_type,
      url: row.resource_url,
      requiresAcknowledgement: !!row.requires_ack,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at)
    }));
  } finally {
    client.release();
  }
}

export async function getStudentInvoices(studentId, { page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    logger.warn('Student invoices requested with invalid id format', { studentId });
    return {
      invoices: [],
      pagination: {
        page: Math.max(page, 1),
        limit: Math.max(1, Math.min(limit, 100)),
        total: 0
      },
      balance: 0
    };
  }

  const client = await pool.connect();
  try {
    const { rows: tableRows } = await client.query(`
      SELECT 
        to_regclass('payment_intents') AS payment_intents,
        to_regclass('student_accounts') AS student_accounts
    `);
    const hasPaymentIntents = Boolean(tableRows[0]?.payment_intents);
    const hasStudentAccounts = Boolean(tableRows[0]?.student_accounts);

    const pageSize = Math.max(1, Math.min(limit, 100));
    const offset = (Math.max(page, 1) - 1) * pageSize;

    if (!hasPaymentIntents) {
      const balanceValue = hasStudentAccounts
        ? coalesceNumber((await client.query(`SELECT balance FROM student_accounts WHERE user_id = $1`, [normalizedStudentId])).rows[0]?.balance)
        : 0;

      return {
        invoices: [],
        pagination: {
          page: Math.max(page, 1),
          limit: pageSize,
          total: 0
        },
        balance: balanceValue
      };
    }

    const [{ rows }, countRes, balanceRes] = await Promise.all([
      client.query(
        `SELECT pi.id,
                pi.stripe_payment_intent_id,
                pi.amount,
                pi.currency,
                pi.status,
                pi.booking_id,
                pi.description,
                pi.created_at,
                pi.updated_at,
                b.date AS lesson_date,
                b.start_hour,
                s.name AS service_name
           FROM payment_intents pi
      LEFT JOIN bookings b ON b.id = pi.booking_id
      LEFT JOIN services s ON s.id = b.service_id
          WHERE pi.user_id = $1
       ORDER BY pi.created_at DESC
          LIMIT $2 OFFSET $3`,
        [normalizedStudentId, pageSize, offset]
      ),
      client.query(
        `SELECT COUNT(*) AS total
           FROM payment_intents
          WHERE user_id = $1`,
        [normalizedStudentId]
      ),
      hasStudentAccounts
        ? client.query(
            `SELECT balance FROM student_accounts WHERE user_id = $1`,
            [normalizedStudentId]
          )
        : Promise.resolve({ rows: [{ balance: 0 }] })
    ]);

    const invoices = rows.map((row) => {
      const startHour = Number(row.start_hour);
      const startTime = Number.isFinite(startHour)
        ? `${String(Math.floor(startHour)).padStart(2, '0')}:${String(Math.round((startHour - Math.floor(startHour)) * 60)).padStart(2, '0')}`
        : null;
      return {
        id: row.id,
        paymentIntentId: row.stripe_payment_intent_id,
        amount: coalesceNumber(row.amount),
        currency: row.currency,
        status: row.status,
        bookingId: row.booking_id,
        description: row.description || `Payment for ${row.service_name || 'lesson'}`,
        lessonDate: row.lesson_date ? row.lesson_date.toISOString().split('T')[0] : null,
        lessonStartTime: startTime,
        serviceName: row.service_name,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at)
      };
    });

    return {
      invoices,
      pagination: {
        page: Math.max(page, 1),
        limit: pageSize,
        total: Number(countRes.rows[0]?.total || 0)
      },
      balance: coalesceNumber(balanceRes.rows[0]?.balance)
    };
  } finally {
    client.release();
  }
}

export async function createStudentSupportRequest(studentId, payload = {}) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    throw new NotFoundError('Student not found');
  }

  const { subject, message, channel = 'portal', priority = 'normal', metadata = {} } = payload;
  if (!subject || !message) {
    const err = new Error('subject and message are required');
    err.status = 400;
    throw err;
  }

  const { rows: tableRows } = await pool.query(`SELECT to_regclass('student_support_requests') AS student_support_requests`);
  if (!tableRows[0]?.student_support_requests) {
    logger.warn('student_support_requests table missing while creating ticket', { studentId: normalizedStudentId });
    const err = new Error('Support request storage is unavailable');
    err.status = 503;
    throw err;
  }

  const result = await pool.query(
    `INSERT INTO student_support_requests (student_id, subject, message, channel, priority, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING id, status, created_at`,
    [normalizedStudentId, subject.trim(), message.trim(), channel, priority, metadata]
  );

  return {
    id: result.rows[0].id,
    status: result.rows[0].status,
    createdAt: toIso(result.rows[0].created_at)
  };
}

export async function getStudentPreferences(studentId) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    throw new NotFoundError('Student not found');
  }

  const { rows: tableRows } = await pool.query(`SELECT to_regclass('notification_settings') AS notification_settings`);
  const hasNotificationSettings = Boolean(tableRows[0]?.notification_settings);

  const userColumns = await getUserColumnCapabilities();
  const languageSelect = userColumns.language ? 'u.language' : 'NULL::text AS language';
  const currencySelect = userColumns.preferred_currency ? 'u.preferred_currency' : 'NULL::text AS preferred_currency';
  const communicationSelect = userColumns.communication_preferences ? 'u.communication_preferences' : 'NULL::json AS communication_preferences';

  const { rows } = hasNotificationSettings
    ? await pool.query(
        `SELECT ns.weather_alerts,
                ns.booking_updates,
                ns.payment_notifications,
                ns.general_announcements,
                ns.email_notifications,
                ns.push_notifications,
                ${languageSelect},
                ${currencySelect},
                ${communicationSelect}
           FROM users u
      LEFT JOIN notification_settings ns ON ns.user_id = u.id
           WHERE u.id = $1`,
          [normalizedStudentId]
      )
    : await pool.query(
        `SELECT NULL::boolean AS weather_alerts,
                NULL::boolean AS booking_updates,
                NULL::boolean AS payment_notifications,
                NULL::boolean AS general_announcements,
                NULL::boolean AS email_notifications,
                NULL::boolean AS push_notifications,
                ${languageSelect},
                ${currencySelect},
                ${communicationSelect}
           FROM users u
            WHERE u.id = $1`,
          [normalizedStudentId]
      );

  if (!rows.length) {
    const err = new Error('Student not found');
    err.status = 404;
    throw err;
  }

  const row = rows[0];
  const communicationPreferences = parseJsonField(row.communication_preferences) || {};
  const savedNotifications = communicationPreferences.notifications || {};
  const fallbackNotification = (value, key) => {
    if (value !== null && typeof value !== 'undefined') return value;
    if (typeof savedNotifications[key] !== 'undefined') return savedNotifications[key];
    return true;
  };
  return {
    notifications: {
      weatherAlerts: fallbackNotification(row.weather_alerts, 'weatherAlerts'),
      bookingUpdates: fallbackNotification(row.booking_updates, 'bookingUpdates'),
      paymentNotifications: fallbackNotification(row.payment_notifications, 'paymentNotifications'),
      generalAnnouncements: fallbackNotification(row.general_announcements, 'generalAnnouncements'),
      emailNotifications: fallbackNotification(row.email_notifications, 'emailNotifications'),
      pushNotifications: fallbackNotification(row.push_notifications, 'pushNotifications')
    },
    preferences: {
      language: row.language || 'en',
      currency: row.preferred_currency || 'EUR',
      communication: communicationPreferences
    }
  };
}

export async function updateStudentProfile(studentId, payload = {}) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    throw new NotFoundError('Student not found');
  }

  const {
    firstName,
    lastName,
    phone,
    language,
    emergencyContact,
    communicationPreferences
  } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userColumns = await getUserColumnCapabilities(client);
    const hasLanguageColumn = userColumns.language;
    const hasEmergencyContactColumn = userColumns.emergency_contact;
    const hasCommunicationPreferencesColumn = userColumns.communication_preferences;

    const params = [];
    const setters = [];

    params.push(firstName ?? null);
    setters.push(`first_name = COALESCE($${params.length}, first_name)`);

    params.push(lastName ?? null);
    setters.push(`last_name = COALESCE($${params.length}, last_name)`);

    params.push(phone ?? null);
    setters.push(`phone = COALESCE($${params.length}, phone)`);

    if (hasLanguageColumn) {
      params.push(language ?? null);
      setters.push(`language = COALESCE($${params.length}, language)`);
    }

    if (hasEmergencyContactColumn) {
      params.push(emergencyContact ? JSON.stringify(emergencyContact) : null);
      setters.push(`emergency_contact = COALESCE($${params.length}, emergency_contact)`);
    }

    if (hasCommunicationPreferencesColumn) {
      params.push(communicationPreferences ? JSON.stringify(communicationPreferences) : null);
      setters.push(`communication_preferences = COALESCE($${params.length}, communication_preferences)`);
    }

    setters.push('updated_at = NOW()');

    params.push(normalizedStudentId);

    const returningFields = [
      'id',
      'first_name',
      'last_name',
      'phone',
      hasLanguageColumn ? 'language' : 'NULL::text AS language',
      hasEmergencyContactColumn ? 'emergency_contact' : 'NULL::json AS emergency_contact',
      hasCommunicationPreferencesColumn ? 'communication_preferences' : 'NULL::json AS communication_preferences',
      'updated_at'
    ];

    const result = await client.query(
      `UPDATE users
          SET ${setters.join(',\n              ')}
        WHERE id = $${params.length}
        RETURNING ${returningFields.join(', ')}`,
      params
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      const err = new Error('Student not found');
      err.status = 404;
      throw err;
    }

    const row = result.rows[0];
    const parsedCommunicationPreferences = parseJsonField(row.communication_preferences);
    const resolvedLanguage = hasLanguageColumn
      ? row.language
      : language ?? parsedCommunicationPreferences?.language ?? 'en';

    await client.query('COMMIT');

    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      language: resolvedLanguage,
      emergencyContact: row.emergency_contact,
      communicationPreferences: row.communication_preferences,
      updatedAt: toIso(row.updated_at)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateStudentNotificationSettings(studentId, payload = {}) {
  const normalizedStudentId = requireValidStudentId(studentId);

  if (!normalizedStudentId) {
    throw new NotFoundError('Student not found');
  }

  const {
    weatherAlerts = true,
    bookingUpdates = true,
    paymentNotifications = true,
    generalAnnouncements = true,
    emailNotifications = true,
    pushNotifications = true
  } = payload;

  const { rows: tableRows } = await pool.query(`SELECT to_regclass('notification_settings') AS notification_settings`);
  const hasNotificationSettings = Boolean(tableRows[0]?.notification_settings);

  if (!hasNotificationSettings) {
    const { rows } = await pool.query(
      `SELECT communication_preferences
         FROM users
          WHERE id = $1`,
      [normalizedStudentId]
    );

    if (!rows.length) {
      const err = new Error('Student not found');
      err.status = 404;
      throw err;
    }

    const currentPrefs = parseJsonField(rows[0].communication_preferences) || {};
    const updatedPrefs = {
      ...currentPrefs,
      notifications: {
        weatherAlerts,
        bookingUpdates,
        paymentNotifications,
        generalAnnouncements,
        emailNotifications,
        pushNotifications
      }
    };

    await pool.query(
      `UPDATE users
          SET communication_preferences = $1::jsonb,
              updated_at = NOW()
        WHERE id = $2`,
      [JSON.stringify(updatedPrefs), normalizedStudentId]
    );

    return {
      weatherAlerts,
      bookingUpdates,
      paymentNotifications,
      generalAnnouncements,
      emailNotifications,
      pushNotifications
    };
  }

  const result = await pool.query(
    `INSERT INTO notification_settings (
        user_id,
        weather_alerts,
        booking_updates,
        payment_notifications,
        general_announcements,
        email_notifications,
        push_notifications,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
ON CONFLICT (user_id)
  DO UPDATE SET
    weather_alerts = EXCLUDED.weather_alerts,
    booking_updates = EXCLUDED.booking_updates,
    payment_notifications = EXCLUDED.payment_notifications,
    general_announcements = EXCLUDED.general_announcements,
    email_notifications = EXCLUDED.email_notifications,
    push_notifications = EXCLUDED.push_notifications,
    updated_at = NOW()
RETURNING weather_alerts,
          booking_updates,
          payment_notifications,
          general_announcements,
          email_notifications,
          push_notifications;
`,
    [
      normalizedStudentId,
      weatherAlerts,
      bookingUpdates,
      paymentNotifications,
      generalAnnouncements,
      emailNotifications,
      pushNotifications
    ]
  );

  const row = result.rows[0];
  return {
    weatherAlerts: row.weather_alerts,
    bookingUpdates: row.booking_updates,
    paymentNotifications: row.payment_notifications,
    generalAnnouncements: row.general_announcements,
    emailNotifications: row.email_notifications,
    pushNotifications: row.push_notifications
  };
}

export async function getStudentRecommendations(studentId) {
  try {
    const { rows: recommendationTableRows } = await pool.query(
      `SELECT to_regclass('recommended_products') AS recommended_products`
    );

    if (recommendationTableRows[0]?.recommended_products) {
      const curated = await getRecommendedProductsForRole('student', 8);
      if (curated.length) {
        return curated;
      }
    }
  } catch (error) {
    logger.warn('Unable to load curated product recommendations', {
      studentId,
      error: error.message
    });
  }

  try {
    const { rows } = await pool.query(
      `WITH student_levels AS (
          SELECT u.level, COUNT(*)
            FROM bookings b
            JOIN users u ON u.id = b.student_user_id
           WHERE b.instructor_user_id IN (
                 SELECT instructor_user_id
                   FROM bookings
                  WHERE student_user_id = $1 OR customer_user_id = $1)
             AND b.deleted_at IS NULL
        GROUP BY u.level
        ORDER BY COUNT(*) DESC
          LIMIT 1
        ),
        available_services AS (
          SELECT s.id, s.name, s.level, s.category, s.service_type, s.duration, s.price
            FROM services s
           WHERE s.service_type IN ('private','semi-private','group')
        )
        SELECT s.id,
               s.name,
               s.level,
               s.category,
               s.service_type,
               s.duration,
               s.price
          FROM available_services s
          LEFT JOIN student_levels sl ON true
         WHERE sl.level IS NULL OR s.level = sl.level
      ORDER BY s.price DESC NULLS LAST, s.duration DESC
         LIMIT 4`,
      [studentId]
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      category: row.category,
      serviceType: row.service_type,
      durationHours: coalesceNumber(row.duration, 1),
      price: coalesceNumber(row.price)
    }));
  } catch (error) {
    logger.warn('Failed to compute student recommendations', { studentId, error: error.message });
    return [];
  }
}
