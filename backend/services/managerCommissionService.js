/**
 * Manager Commission Service
 * 
 * Handles manager commission calculation and tracking from bookings and rentals.
 * 
 * Business Rules (from MANAGER_COMMISSION_SYSTEM_PLAN.md):
 * - Manager gets commission from ALL lessons and rentals in the center
 * - Commission calculated at lesson/rental COMPLETION (not at creation)
 * - Manager: 10% from raw price
 * - Instructor: 35% from raw price (handled separately in instructorFinanceService)
 * - All amounts converted to EUR for commission calculation
 * - Payment methods: bank transfer, wallet, or external
 * - No tax/VAT tracking needed
 */

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import CurrencyService from './currencyService.js';
import { deriveLessonAmount, toNumber } from '../utils/instructorEarnings.js';
import { getActiveDiscountAmount as sharedGetActiveDiscountAmount } from '../utils/discountAmounts.js';
import BookingUpdateCascadeService from './bookingUpdateCascadeService.js';

// Filters manager_commissions rows to those whose source booking/rental is still
// alive (not soft-deleted / cancelled). Without this, orphan commission rows for
// deleted bookings or cancelled rentals inflate dashboard totals. Embed in a
// WHERE clause; expects `mc` as the manager_commissions alias.
export const MANAGER_COMMISSION_LIVE_GUARD_SQL = `(
  mc.source_type NOT IN ('booking','rental')
  OR (mc.source_type = 'booking' AND EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = mc.source_id::uuid
      AND b.deleted_at IS NULL
      AND LOWER(TRIM(COALESCE(b.status, ''))) IN ('completed', 'done', 'checked_out')
  ))
  OR (mc.source_type = 'rental' AND EXISTS (
    SELECT 1 FROM rentals r
    WHERE r.id = mc.source_id::uuid
      AND LOWER(TRIM(COALESCE(r.status, ''))) NOT IN ('cancelled', 'canceled')
  ))
)`;

// Default commission rate (10%)
const DEFAULT_MANAGER_COMMISSION_RATE = 10.0;

/**
 * Get manager commission settings
 * @param {string} managerUserId - Manager user ID
 * @returns {Promise<Object|null>} Commission settings or null
 */
export async function getManagerCommissionSettings(managerUserId) {
  try {
    const result = await pool.query(
      `SELECT * FROM manager_commission_settings 
       WHERE manager_user_id = $1 
       AND is_active = true
       AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
       AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
       ORDER BY created_at DESC 
       LIMIT 1`,
      [managerUserId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching manager commission settings:', { error: error.message, managerUserId });
    return null;
  }
}

/**
 * Get the default manager for the system (for now, single manager assumed)
 * Returns the first active manager user
 * @returns {Promise<Object|null>} Manager user or null
 */
export async function getDefaultManager() {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email 
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'manager' 
       AND u.deleted_at IS NULL 
       ORDER BY u.created_at ASC 
       LIMIT 1`
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching default manager:', { error: error.message });
    return null;
  }
}

/**
 * Calculate commission rate based on settings and source type
 * @param {Object} settings - Manager commission settings
 * @param {string} sourceType - 'booking', 'rental', 'accommodation', 'package'
 * @returns {number} Commission rate percentage
 */
function getCommissionRate(settings, sourceType) {
  if (!settings) {
    return DEFAULT_MANAGER_COMMISSION_RATE;
  }

  const type = settings.commission_type || 'flat';

  if (type === 'flat') {
    const rate = parseFloat(settings.default_rate);
    return Number.isFinite(rate) ? rate : DEFAULT_MANAGER_COMMISSION_RATE;
  }

  if (type === 'per_category') {
    switch (sourceType) {
      case 'booking':
        return parseFloat(settings.booking_rate) || 0;
      case 'rental':
        return parseFloat(settings.rental_rate) || 0;
      case 'accommodation':
        return parseFloat(settings.accommodation_rate) || 0;
      case 'package':
        return parseFloat(settings.package_rate) || 0;
      case 'shop':
        return parseFloat(settings.shop_rate) || 0;
      case 'membership':
        return parseFloat(settings.membership_rate) || 0;
      default:
        return 0;
    }
  }

  // TODO: Implement tiered commission based on volume
  // if (type === 'tiered') { ... }

  const fallbackRate = parseFloat(settings.default_rate);
  return Number.isFinite(fallbackRate) ? fallbackRate : DEFAULT_MANAGER_COMMISSION_RATE;
}

/**
 * Calculate and record manager commission for a completed booking
 * @param {Object} booking - The completed booking object
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} Created commission record or null
 */
export async function recordBookingCommission(booking, options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the manager (for now, use the default/first manager)
    const manager = await getDefaultManager();
    if (!manager) {
      logger.warn('No manager found for commission calculation, skipping', { bookingId: booking.id });
      await client.query('ROLLBACK');
      return null;
    }

    // Check if commission already exists for this booking
    const existingResult = await client.query(
      `SELECT id FROM manager_commissions 
       WHERE source_type = 'booking' AND source_id = $1 AND status != 'cancelled'`,
      [booking.id]
    );

    if (existingResult.rows.length > 0) {
      logger.warn('Commission already exists for booking, skipping', { 
        bookingId: booking.id, 
        existingCommissionId: existingResult.rows[0].id 
      });
      await client.query('ROLLBACK');
      return null;
    }

    // Get manager commission settings
    const settings = await getManagerCommissionSettings(manager.id);
    const commissionRate = getCommissionRate(settings, 'booking');

    if (commissionRate <= 0) {
      logger.info('Booking commission rate is 0%, skipping', { bookingId: booking.id });
      await client.query('ROLLBACK');
      return null;
    }

    // Get the booking amount via the shared helper so creation, update, and
    // discount-cascade paths all agree on the post-discount total. The helper
    // handles: package-derived lesson value (with package discount), group
    // size multiplication for package-paid groups, and per-booking discount
    // subtraction (entity-wide + per-participant, summed). One source of
    // truth — replaces ~80 lines of bespoke per-path math that used to drift.
    const sourceCurrency = booking.currency || 'EUR';
    let sourceAmount = await BookingUpdateCascadeService.computeBookingTotalAmount(client, booking);

    if (sourceAmount <= 0) {
      logger.warn('Booking has no amount for commission calculation', { bookingId: booking.id });
      await client.query('ROLLBACK');
      return null;
    }

    // Convert to EUR for commission calculation
    let amountInEur = sourceAmount;
    if (sourceCurrency !== 'EUR') {
      try {
        amountInEur = await CurrencyService.convertCurrency(sourceAmount, sourceCurrency, 'EUR');
      } catch (convError) {
        logger.warn('Currency conversion failed, using original amount', {
          error: convError.message,
          sourceAmount,
          sourceCurrency
        });
        amountInEur = sourceAmount;
      }
    }

    // Calculate commission amount
    const commissionAmount = (amountInEur * commissionRate) / 100;

    // Get period (YYYY-MM format)
    const bookingDate = booking.date ? new Date(booking.date) : new Date();
    const periodMonth = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}`;

    // Create commission record
    const result = await client.query(
      `INSERT INTO manager_commissions (
        manager_user_id,
        source_type,
        source_id,
        source_amount,
        source_currency,
        commission_rate,
        commission_amount,
        commission_currency,
        period_month,
        status,
        source_date,
        calculated_at,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
      RETURNING *`,
      [
        manager.id,
        'booking',
        booking.id,
        sourceAmount,
        sourceCurrency,
        commissionRate,
        commissionAmount,
        'EUR',
        periodMonth,
        'pending',
        bookingDate,
        JSON.stringify({
          studentName: booking.student_name || null,
          instructorName: booking.instructor_name || null,
          serviceName: booking.service_name || null,
          duration: booking.duration || null,
          calculatedBy: 'system'
        })
      ]
    );

    await client.query('COMMIT');

    const commission = result.rows[0];
    logger.info('Manager commission recorded for booking', {
      commissionId: commission.id,
      bookingId: booking.id,
      managerId: manager.id,
      amount: commissionAmount,
      rate: commissionRate
    });

    return commission;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording booking commission:', { 
      error: error.message, 
      bookingId: booking.id,
      stack: error.stack
    });
    return null;
  } finally {
    client.release();
  }
}

/**
 * Calculate and record manager commission for a completed rental
 * @param {Object} rental - The completed rental object
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} Created commission record or null
 */
export async function recordRentalCommission(rental, options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the manager (for now, use the default/first manager)
    const manager = await getDefaultManager();
    if (!manager) {
      logger.warn('No manager found for commission calculation, skipping', { rentalId: rental.id });
      await client.query('ROLLBACK');
      return null;
    }

    // Check if commission already exists for this rental
    const existingResult = await client.query(
      `SELECT id FROM manager_commissions 
       WHERE source_type = 'rental' AND source_id = $1 AND status != 'cancelled'`,
      [rental.id]
    );

    if (existingResult.rows.length > 0) {
      logger.warn('Commission already exists for rental, skipping', { 
        rentalId: rental.id, 
        existingCommissionId: existingResult.rows[0].id 
      });
      await client.query('ROLLBACK');
      return null;
    }

    // Get manager commission settings
    const settings = await getManagerCommissionSettings(manager.id);
    const commissionRate = getCommissionRate(settings, 'rental');

    if (commissionRate <= 0) {
      logger.info('Rental commission rate is 0%, skipping', { rentalId: rental.id });
      await client.query('ROLLBACK');
      return null;
    }

    // Get the rental amount — for package rentals derive value from package price
    let sourceAmount = parseFloat(rental.total_price) || 0;
    const sourceCurrency = rental.currency || 'EUR';

    if (sourceAmount <= 0 && rental.payment_status === 'package' && rental.customer_package_id) {
      try {
        const pkgRes = await client.query(
          `SELECT cp.id, cp.purchase_price, cp.currency,
                  sp.rental_days, sp.price as sp_price,
                  sp.package_daily_rate, sp.rental_service_id,
                  cs.exchange_rate
           FROM customer_packages cp
           LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
           LEFT JOIN currency_settings cs ON cs.currency_code = cp.currency
           WHERE cp.id = $1`,
          [rental.customer_package_id]
        );
        if (pkgRes.rows.length > 0) {
          const pkg = pkgRes.rows[0];
          const totalDays = toNumber(pkg.rental_days) || 1;
          const daysUsed = toNumber(rental.rental_days_used) || 1;

          // Use stored daily rate if available
          const storedDailyRate = toNumber(pkg.package_daily_rate);
          if (storedDailyRate > 0) {
            sourceAmount = Math.round(storedDailyRate * daysUsed * 100) / 100;
          } else {
            // Fallback: use linked rental service price
            let dailyRate = 0;
            if (pkg.rental_service_id) {
              try {
                const { rows: rRows } = await client.query(
                  'SELECT price FROM services WHERE id = $1', [pkg.rental_service_id]
                );
                dailyRate = toNumber(rRows[0]?.price) || 0;
              } catch { /* ignore */ }
            }
            if (dailyRate > 0) {
              sourceAmount = Math.round(dailyRate * daysUsed * 100) / 100;
            } else {
              // Last fallback: proportional from full package price minus
              // the package discount (so a discounted package's rentals see
              // their fair-share reduction).
              let pkgPrice = toNumber(pkg.purchase_price);
              if (pkg.currency && pkg.currency !== 'EUR' && toNumber(pkg.exchange_rate) > 0) {
                pkgPrice = Math.round((pkgPrice / toNumber(pkg.exchange_rate)) * 100) / 100;
              }
              const pkgDiscount = await getActiveDiscountAmount(client, 'customer_package', pkg.id);
              const effectivePkgPrice = Math.max(0, pkgPrice - pkgDiscount);
              sourceAmount = Math.round((effectivePkgPrice / totalDays * daysUsed) * 100) / 100;
            }
          }
          logger.info('Derived package rental value for manager commission', {
            rentalId: rental.id, packageId: rental.customer_package_id,
            derivedAmount: sourceAmount, storedDailyRate, totalDays, daysUsed
          });
        }
      } catch (err) {
        logger.warn('Failed to derive package rental value', { rentalId: rental.id, error: err.message });
      }
    }

    if (sourceAmount <= 0) {
      logger.warn('Rental has no amount for commission calculation', { rentalId: rental.id });
      await client.query('ROLLBACK');
      return null;
    }

    // Always subtract any active manual discount on this rental — including
    // package-paid rentals where staff applied a per-rental adjustment on top
    // of the package. The previous gate (skip when payment_status='package')
    // silently dropped those discounts from manager commissions.
    const rentalDiscount = await getActiveDiscountAmount(client, 'rental', rental.id);
    if (rentalDiscount > 0) {
      sourceAmount = Number.parseFloat(Math.max(0, sourceAmount - rentalDiscount).toFixed(2));
    }

    // Convert to EUR for commission calculation
    let amountInEur = sourceAmount;
    if (sourceCurrency !== 'EUR') {
      try {
        amountInEur = await CurrencyService.convertCurrency(sourceAmount, sourceCurrency, 'EUR');
      } catch (convError) {
        logger.warn('Currency conversion failed, using original amount', {
          error: convError.message,
          sourceAmount,
          sourceCurrency
        });
        amountInEur = sourceAmount;
      }
    }

    // Calculate commission amount
    const commissionAmount = (amountInEur * commissionRate) / 100;

    // Get period (YYYY-MM format)
    const rentalDate = rental.start_date ? new Date(rental.start_date) : new Date();
    const periodMonth = `${rentalDate.getFullYear()}-${String(rentalDate.getMonth() + 1).padStart(2, '0')}`;

    // Create commission record
    const result = await client.query(
      `INSERT INTO manager_commissions (
        manager_user_id,
        source_type,
        source_id,
        source_amount,
        source_currency,
        commission_rate,
        commission_amount,
        commission_currency,
        period_month,
        status,
        source_date,
        calculated_at,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
      RETURNING *`,
      [
        manager.id,
        'rental',
        rental.id,
        sourceAmount,
        sourceCurrency,
        commissionRate,
        commissionAmount,
        'EUR',
        periodMonth,
        'pending',
        rentalDate,
        JSON.stringify({
          customerName: rental.customer_name || null,
          equipmentName: rental.equipment_name || null,
          startDate: rental.start_date || null,
          endDate: rental.end_date || null,
          calculatedBy: 'system'
        })
      ]
    );

    await client.query('COMMIT');

    const commission = result.rows[0];
    logger.info('Manager commission recorded for rental', {
      commissionId: commission.id,
      rentalId: rental.id,
      managerId: manager.id,
      amount: commissionAmount,
      rate: commissionRate
    });

    return commission;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording rental commission:', { 
      error: error.message, 
      rentalId: rental.id,
      stack: error.stack
    });
    return null;
  } finally {
    client.release();
  }
}

// Recompute pending manager_commissions for every booking that consumed the
// given customer package. Called after the package's purchase_price has been
// edited so future payouts reflect the new lesson value.
//
// Skips rows where payout_id IS NOT NULL: once a commission has been paid
// out we treat it as immutable history. Cancelled rows are also skipped.
//
// Runs inside the caller's transaction (no own pool.connect / BEGIN).
//
// Mirrors the source-amount derivation used by recordBookingCommission so
// values stay consistent: stored package_hourly_rate first, otherwise
// subtract rental + accommodation costs from purchase_price.
export async function recomputeManagerCommissionsForPackage(client, packageId) {
  const summary = { updated: 0, skippedPaidOut: 0, skippedNoChange: 0 };

  // Pull the package + its service_packages metadata once. Same query shape
  // as recordBookingCommission so the math matches.
  const pkgRes = await client.query(
    `SELECT cp.id AS pkg_id, cp.purchase_price, cp.total_hours, cp.remaining_hours,
            cp.used_hours, cp.currency,
            sp.package_hourly_rate, sp.rental_service_id, sp.accommodation_unit_id,
            sp.rental_days, sp.accommodation_nights,
            sp.sessions_count, sp.total_hours AS sp_total_hours,
            cs.exchange_rate
       FROM customer_packages cp
  LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
  LEFT JOIN currency_settings cs ON cs.currency_code = cp.currency
      WHERE cp.id = $1`,
    [packageId]
  );
  if (!pkgRes.rows.length) return summary;
  const pkg = pkgRes.rows[0];

  // Convert package price to EUR if stored in another currency.
  let pkgPriceEur = toNumber(pkg.purchase_price);
  if (pkg.currency && pkg.currency !== 'EUR' && toNumber(pkg.exchange_rate) > 0) {
    pkgPriceEur = Math.round((pkgPriceEur / toNumber(pkg.exchange_rate)) * 100) / 100;
  }

  // Subtract any active per-package discount so manager commission tracks
  // actual realized revenue, not the headline pre-discount price.
  const { rows: discRows } = await client.query(
    `SELECT amount FROM discounts WHERE entity_type='customer_package' AND entity_id=$1`,
    [String(packageId)]
  );
  if (discRows.length) {
    const discountAmount = toNumber(discRows[0].amount);
    pkgPriceEur = Math.max(0, pkgPriceEur - discountAmount);
  }

  // Derive the lesson-only portion of the package.
  const storedHourlyRate = toNumber(pkg.package_hourly_rate);
  const pkgTotalHours = toNumber(pkg.total_hours) || toNumber(pkg.sp_total_hours);
  let effectiveLessonPrice = pkgPriceEur;
  if (storedHourlyRate > 0 && pkgTotalHours > 0) {
    effectiveLessonPrice = storedHourlyRate * pkgTotalHours;
  } else {
    let rentalCost = 0;
    let accomCost = 0;
    const rentalDays = parseInt(pkg.rental_days, 10) || 0;
    const accomNights = parseInt(pkg.accommodation_nights, 10) || 0;
    if (rentalDays > 0 && pkg.rental_service_id) {
      try {
        const { rows } = await client.query('SELECT price FROM services WHERE id = $1', [pkg.rental_service_id]);
        rentalCost = rentalDays * (toNumber(rows[0]?.price) || 0);
      } catch { /* ignore */ }
    }
    if (accomNights > 0 && pkg.accommodation_unit_id) {
      try {
        const { rows } = await client.query('SELECT price_per_night FROM accommodation_units WHERE id = $1', [pkg.accommodation_unit_id]);
        accomCost = accomNights * (toNumber(rows[0]?.price_per_night) || 0);
      } catch { /* ignore */ }
    }
    if (rentalCost + accomCost > 0) {
      effectiveLessonPrice = Math.max(0, pkgPriceEur - rentalCost - accomCost);
    }
  }

  // Pull every editable commission row tied to this package's bookings.
  const cmsRes = await client.query(
    `SELECT mc.id, mc.commission_rate, mc.source_amount, mc.commission_amount,
            mc.payout_id, mc.status,
            b.id AS booking_id, b.duration, b.payment_status, b.group_size,
            b.final_amount, b.amount, b.currency AS booking_currency,
            b.customer_package_id
       FROM manager_commissions mc
       JOIN bookings b ON b.id = mc.source_id::uuid
      WHERE mc.source_type = 'booking'
        AND b.customer_package_id = $1
        AND b.deleted_at IS NULL
        AND mc.status != 'cancelled'`,
    [packageId]
  );

  for (const row of cmsRes.rows) {
    if (row.payout_id) {
      summary.skippedPaidOut += 1;
      continue;
    }

    let newSourceAmount;
    const isPackagePayment = row.payment_status === 'package' || row.payment_status === 'partial';
    if (isPackagePayment) {
      const perPersonAmount = deriveLessonAmount({
        paymentStatus: 'package',
        duration: toNumber(row.duration),
        baseAmount: 0,
        packagePrice: effectiveLessonPrice,
        packageTotalHours: pkgTotalHours,
        packageRemainingHours: toNumber(pkg.remaining_hours),
        packageUsedHours: toNumber(pkg.used_hours),
        packageSessionsCount: toNumber(pkg.sessions_count),
        fallbackSessionDuration: toNumber(row.duration),
      });
      const groupSize = Math.max(1, parseInt(row.group_size, 10) || 1);
      if (row.payment_status === 'partial') {
        const cashAmount = parseFloat(row.final_amount) || parseFloat(row.amount) || 0;
        newSourceAmount = Number.parseFloat((perPersonAmount + cashAmount).toFixed(2));
      } else {
        newSourceAmount = Number.parseFloat((perPersonAmount * (groupSize > 1 ? groupSize : 1)).toFixed(2));
      }
      // Subtract any active per-booking discount on top of the package
      // discount that already shaped `effectiveLessonPrice`. Without this
      // step, manager commissions on package-paid bookings ignored the
      // booking-level discount entirely.
      const bookingDiscount = await getActiveDiscountAmount(client, 'booking', row.booking_id);
      if (bookingDiscount > 0) {
        newSourceAmount = Number.parseFloat(Math.max(0, newSourceAmount - bookingDiscount).toFixed(2));
      }
    } else {
      // Non-package payment: source_amount tracks the booking's own price,
      // which the package edit doesn't affect — leave it alone.
      summary.skippedNoChange += 1;
      continue;
    }

    // Convert to EUR if booking currency differs.
    let amountInEur = newSourceAmount;
    const bookingCurrency = row.booking_currency || 'EUR';
    if (bookingCurrency !== 'EUR') {
      try {
        amountInEur = await CurrencyService.convertCurrency(newSourceAmount, bookingCurrency, 'EUR');
      } catch {
        amountInEur = newSourceAmount;
      }
    }

    const rate = toNumber(row.commission_rate);
    const newCommissionAmount = Number.parseFloat(((amountInEur * rate) / 100).toFixed(2));

    const oldSourceAmount = toNumber(row.source_amount);
    const oldCommissionAmount = toNumber(row.commission_amount);
    if (Math.abs(oldSourceAmount - newSourceAmount) < 0.005 &&
        Math.abs(oldCommissionAmount - newCommissionAmount) < 0.005) {
      summary.skippedNoChange += 1;
      continue;
    }

    await client.query(
      `UPDATE manager_commissions
          SET source_amount = $1,
              commission_amount = $2,
              notes = COALESCE(notes || ' | ', '') || $3,
              updated_at = NOW()
        WHERE id = $4`,
      [
        newSourceAmount,
        newCommissionAmount,
        `Recomputed after package price edit (${oldSourceAmount.toFixed(2)} -> ${newSourceAmount.toFixed(2)})`,
        row.id,
      ]
    );
    summary.updated += 1;
  }

  return summary;
}

// Maps a discount entity_type to the matching manager_commissions source_type
// + the source-row metadata needed to re-derive the post-discount price.
//
// Package-paid bookings/rentals are deliberately skipped here: their commission
// follows the package's own price, so the package-level discount path
// (recomputeManagerCommissionsForPackage) already handles them.
const ENTITY_COMMISSION_MAP = {
  booking: {
    sourceType: 'booking',
    table: 'bookings',
    priceCol: 'COALESCE(NULLIF(final_amount, 0), amount)',
    currencyCol: 'currency',
    idType: 'uuid',
    skipExpr: `payment_status IN ('package', 'partial')`,
  },
  rental: {
    sourceType: 'rental',
    table: 'rentals',
    priceCol: 'total_price',
    currencyCol: null,
    idType: 'uuid',
    skipExpr: `payment_status = 'package'`,
  },
  accommodation_booking: {
    sourceType: 'accommodation',
    table: 'accommodation_bookings',
    priceCol: 'total_price',
    currencyCol: null,
    idType: 'uuid',
    skipExpr: null,
  },
  member_purchase: {
    sourceType: 'membership',
    table: 'member_purchases',
    priceCol: 'offering_price',
    currencyCol: null,
    idType: 'int',
    skipExpr: null,
  },
  shop_order: {
    sourceType: 'shop',
    table: 'shop_orders',
    priceCol: 'total_amount',
    currencyCol: 'currency',
    idType: 'int',
    skipExpr: null,
  },
};

// Per-entity source-row SELECT, built once at module load and reused per call.
//
// For bookings we project the entire row (`*`) so package-paid recompute can
// hand the booking off to BookingUpdateCascadeService.computeBookingTotalAmount
// — which expects every column it'd see on a booking-fetch path. Other
// entities only need price/currency/skip flags so they keep their narrow
// SELECTs.
const ENTITY_BASE_SELECT = Object.fromEntries(
  Object.entries(ENTITY_COMMISSION_MAP).map(([type, cfg]) => {
    if (type === 'booking') {
      return [type, `SELECT b.*,
              ${cfg.priceCol} AS base_price,
              ${cfg.currencyCol ? cfg.currencyCol : `'EUR'::text`} AS currency,
              ${cfg.skipExpr ? `(${cfg.skipExpr})` : `FALSE`} AS skip_pkg
         FROM ${cfg.table} b
        WHERE b.id = $1::uuid
        LIMIT 1`];
    }
    return [
      type,
      `SELECT ${cfg.priceCol} AS base_price,
              ${cfg.currencyCol ? cfg.currencyCol : `'EUR'::text`} AS currency,
              ${cfg.skipExpr ? `(${cfg.skipExpr})` : `FALSE`} AS skip_pkg
         FROM ${cfg.table}
        WHERE id = $1${cfg.idType === 'int' ? '::integer' : '::uuid'}
        LIMIT 1`,
    ];
  })
);

// Re-export from the shared util so existing callers keep working. The
// implementation lives in `utils/discountAmounts.js` to avoid a circular
// import between this service and bookingUpdateCascadeService (which both
// need to read the active discount total).
export const getActiveDiscountAmount = sharedGetActiveDiscountAmount;

// Re-derives source_amount + commission_amount for the active commission row
// tied to a single non-package source entity, after its manual discount has
// been applied / changed / removed. Mirrors the recordX paths so the math
// stays consistent: read the entity's base price, subtract any active
// discount, convert to EUR, multiply by the row's stored commission_rate.
//
// For package-paid BOOKINGS we hand the row off to
// BookingUpdateCascadeService.computeBookingTotalAmount so the post-discount
// total uses the same lesson-amount derivation as instructor earnings (single
// source of truth — no parallel math). This means a per-booking discount on
// a package-paid booking now propagates correctly; previously the function
// short-circuited with `skipped: 'package_paid'` and the per-booking discount
// never reached the manager commission row.
//
// No-ops when:
//   - the entity_type isn't in ENTITY_COMMISSION_MAP
//   - a non-booking entity is package-paid (still skipped — packages drive
//     their own recompute path which handles those)
//   - the commission row has been paid out (immutable history)
//   - amounts haven't actually changed
//
// Runs inside the caller's transaction.
export async function recomputeManagerCommissionForEntity(client, entityType, entityId) {
  const cfg = ENTITY_COMMISSION_MAP[entityType];
  if (!cfg) return { skipped: 'unsupported_entity_type' };

  const { rows: entityRows } = await client.query(
    ENTITY_BASE_SELECT[entityType],
    [String(entityId)]
  );
  if (!entityRows.length) return { skipped: 'entity_not_found' };
  const entity = entityRows[0];

  let newSourceAmount;
  if (entity.skip_pkg && entityType === 'booking') {
    // Package-paid booking — derive total via the shared helper so the
    // discount math (package + per-booking) is identical to what the
    // instructor earnings path produces.
    const total = await BookingUpdateCascadeService.computeBookingTotalAmount(client, entity);
    newSourceAmount = Number.parseFloat(total.toFixed(2));
  } else if (entity.skip_pkg) {
    // Other package-paid entities (rentals) — leave to the package cascade
    // which already handles them.
    return { skipped: 'package_paid' };
  } else {
    const basePrice = toNumber(entity.base_price);
    const discountAmount = await getActiveDiscountAmount(client, entityType, entityId);
    newSourceAmount = Number.parseFloat(Math.max(0, basePrice - discountAmount).toFixed(2));
  }

  const { rows: cmsRows } = await client.query(
    `SELECT id, commission_rate, source_amount, commission_amount, payout_id, source_currency
       FROM manager_commissions
      WHERE source_type = $1
        AND source_id = $2
        AND status != 'cancelled'
      ORDER BY created_at DESC
      LIMIT 1`,
    [cfg.sourceType, String(entityId)]
  );
  if (!cmsRows.length) return { skipped: 'no_commission' };
  const cms = cmsRows[0];
  if (cms.payout_id) return { skipped: 'paid_out' };

  const sourceCurrency = entity.currency || cms.source_currency || 'EUR';
  let amountInEur = newSourceAmount;
  if (sourceCurrency !== 'EUR') {
    try {
      amountInEur = await CurrencyService.convertCurrency(newSourceAmount, sourceCurrency, 'EUR');
    } catch {
      amountInEur = newSourceAmount;
    }
  }

  const rate = toNumber(cms.commission_rate);
  const newCommissionAmount = Number.parseFloat(((amountInEur * rate) / 100).toFixed(2));

  const oldSourceAmount = toNumber(cms.source_amount);
  const oldCommissionAmount = toNumber(cms.commission_amount);
  if (Math.abs(oldSourceAmount - newSourceAmount) < 0.005 &&
      Math.abs(oldCommissionAmount - newCommissionAmount) < 0.005) {
    return { skipped: 'no_change' };
  }

  await client.query(
    `UPDATE manager_commissions
        SET source_amount = $1,
            commission_amount = $2,
            notes = COALESCE(notes || ' | ', '') || $3,
            updated_at = NOW()
      WHERE id = $4`,
    [
      newSourceAmount,
      newCommissionAmount,
      `Recomputed after discount change (${oldSourceAmount.toFixed(2)} -> ${newSourceAmount.toFixed(2)})`,
      cms.id,
    ]
  );

  logger.info('Manager commission recomputed after discount change', {
    entityType,
    entityId: String(entityId),
    sourceType: cfg.sourceType,
    commissionId: cms.id,
    oldSourceAmount,
    newSourceAmount,
    oldCommissionAmount,
    newCommissionAmount,
  });

  return {
    updated: true,
    commissionId: cms.id,
    oldSourceAmount,
    newSourceAmount,
    oldCommissionAmount,
    newCommissionAmount,
  };
}

/**
 * Cancel a commission (e.g., when booking/rental is cancelled or refunded)
 * @param {string} sourceType - 'booking' or 'rental'
 * @param {string} sourceId - The booking or rental ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object|null>} Updated commission or null
 */
export async function cancelCommission(sourceType, sourceId, reason = 'cancelled') {
  try {
    const sid = String(sourceId);
    const result = await pool.query(
      `UPDATE manager_commissions 
       SET status = 'cancelled', 
           notes = COALESCE(notes || ' | ', '') || $1,
           updated_at = NOW()
       WHERE source_type = $2 AND source_id = $3 AND status = 'pending'
       RETURNING *`,
      [`Cancelled: ${reason}`, sourceType, sid]
    );

    if (result.rows.length > 0) {
      logger.info('Manager commission cancelled', {
        commissionId: result.rows[0].id,
        sourceType,
        sourceId,
        reason
      });
    }

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error cancelling commission:', { error: error.message, sourceType, sourceId });
    return null;
  }
}

/**
 * Generic helper – record a manager commission for any source type.
 * Follows the same pattern as recordBookingCommission / recordRentalCommission
 * but is parameterised so we don't duplicate 80 lines per category.
 *
 * `discountEntityType` (optional) — the discounts table entity_type used for
 * this source. When provided, any active manual discount is subtracted from
 * the source amount before computing commission, mirroring the booking/rental
 * paths so a pre-existing discount doesn't get ignored at record time.
 */
async function recordGenericCommission(sourceType, { id, amount, currency, date, metadata, discountEntityType }) {
  const sourceId = String(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const manager = await getDefaultManager();
    if (!manager) {
      await client.query('ROLLBACK');
      return null;
    }

    // Duplicate guard
    const dup = await client.query(
      `SELECT id FROM manager_commissions WHERE source_type = $1 AND source_id = $2 AND status != 'cancelled'`,
      [sourceType, sourceId]
    );
    if (dup.rows.length > 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const settings = await getManagerCommissionSettings(manager.id);
    const commissionRate = getCommissionRate(settings, sourceType);
    if (commissionRate <= 0) {
      await client.query('ROLLBACK');
      return null;
    }

    let sourceAmount = parseFloat(amount) || 0;
    if (sourceAmount <= 0) {
      await client.query('ROLLBACK');
      return null;
    }

    if (discountEntityType) {
      const disc = await getActiveDiscountAmount(client, discountEntityType, id);
      if (disc > 0) {
        sourceAmount = Number.parseFloat(Math.max(0, sourceAmount - disc).toFixed(2));
      }
    }

    const sourceCurrency = currency || 'EUR';
    let amountInEur = sourceAmount;
    if (sourceCurrency !== 'EUR') {
      try {
        amountInEur = await CurrencyService.convertCurrency(sourceAmount, sourceCurrency, 'EUR');
      } catch {
        amountInEur = sourceAmount;
      }
    }

    const commissionAmount = (amountInEur * commissionRate) / 100;
    const sourceDate = date ? new Date(date) : new Date();
    const periodMonth = `${sourceDate.getFullYear()}-${String(sourceDate.getMonth() + 1).padStart(2, '0')}`;

    const result = await client.query(
      `INSERT INTO manager_commissions (
        manager_user_id, source_type, source_id,
        source_amount, source_currency,
        commission_rate, commission_amount, commission_currency,
        period_month, status, source_date, calculated_at, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
      RETURNING *`,
      [
        manager.id, sourceType, sourceId,
        sourceAmount, sourceCurrency,
        commissionRate, commissionAmount, 'EUR',
        periodMonth, 'pending', sourceDate,
        JSON.stringify({ ...metadata, calculatedBy: 'system' })
      ]
    );

    await client.query('COMMIT');
    const commission = result.rows[0];
    logger.info(`Manager commission recorded for ${sourceType}`, {
      commissionId: commission.id, sourceId, managerId: manager.id,
      amount: commissionAmount, rate: commissionRate
    });
    return commission;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Error recording ${sourceType} commission:`, { error: error.message, sourceId });
    return null;
  } finally {
    client.release();
  }
}

/**
 * Record manager commission for a completed accommodation booking
 */
export async function recordAccommodationCommission(booking) {
  return recordGenericCommission('accommodation', {
    id: booking.id,
    amount: booking.total_price,
    currency: booking.currency || 'EUR',
    date: booking.check_in_date || booking.created_at,
    discountEntityType: 'accommodation_booking',
    metadata: {
      guestId: booking.guest_id || null,
      unitId: booking.unit_id || null,
      checkIn: booking.check_in_date || null,
      checkOut: booking.check_out_date || null,
      guestsCount: booking.guests_count || null
    }
  });
}

/**
 * Record manager commission for a completed/paid shop order
 */
export async function recordShopCommission(order) {
  return recordGenericCommission('shop', {
    id: order.id,
    amount: order.total_amount,
    currency: order.currency || 'EUR',
    date: order.confirmed_at || order.created_at,
    discountEntityType: 'shop_order',
    metadata: {
      orderNumber: order.order_number || null,
      customerName: order.customer_name || null,
      itemCount: order.item_count || null
    }
  });
}

/**
 * Record manager commission for a membership / seasonal pass purchase
 */
export async function recordMembershipCommission(purchase) {
  return recordGenericCommission('membership', {
    id: purchase.id,
    amount: purchase.offering_price || purchase.price,
    currency: purchase.currency || 'EUR',
    date: purchase.purchased_at || purchase.created_at,
    discountEntityType: 'member_purchase',
    metadata: {
      offeringName: purchase.offering_name || null,
      userId: purchase.user_id || null,
      durationDays: purchase.duration_days || null
    }
  });
}

/**
 * Record manager commission for a package purchase
 */
export async function recordPackageCommission(pkg) {
  return recordGenericCommission('package', {
    id: pkg.id,
    amount: pkg.purchase_price,
    currency: pkg.currency || 'EUR',
    date: pkg.purchase_date || pkg.created_at,
    metadata: {
      packageName: pkg.package_name || null,
      customerId: pkg.customer_id || null,
      totalHours: pkg.total_hours || null,
      packageType: pkg.package_type || null
    }
  });
}

/**
 * Get manager's commission summary for a period
 * @param {string} managerUserId - Manager user ID
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} Commission summary
 */
export async function getManagerCommissionSummary(managerUserId, options = {}) {
  const { startDate, endDate, periodMonth } = options;

  try {
    let whereClause = 'WHERE mc.manager_user_id = $1';
    const params = [managerUserId];
    let paramIndex = 2;

    if (periodMonth) {
      whereClause += ` AND mc.period_month = $${paramIndex}`;
      params.push(periodMonth);
      paramIndex++;
    } else {
      if (startDate) {
        whereClause += ` AND mc.source_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }
      if (endDate) {
        whereClause += ` AND mc.source_date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }
    }

    // Lesson commissions: only rows whose booking still exists, is not soft-deleted, and is completed
    whereClause += ` AND (
      mc.source_type IS DISTINCT FROM 'booking'
      OR EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.id = mc.source_id::uuid
          AND b.deleted_at IS NULL
          AND LOWER(TRIM(COALESCE(b.status, ''))) IN ('completed', 'done', 'checked_out')
      )
    )`;

    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE mc.status != 'cancelled') as active_count,
        COUNT(*) FILTER (WHERE mc.status = 'cancelled') as cancelled_count,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.status = 'cancelled'), 0) as cancelled_amount,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.status != 'cancelled'), 0) as total_earned,
        COUNT(*) FILTER (WHERE mc.source_type = 'booking') as booking_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'rental') as rental_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'accommodation') as accommodation_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'shop') as shop_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'membership') as membership_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'package') as package_count,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'booking' AND mc.status != 'cancelled'), 0) as booking_commission,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'rental' AND mc.status != 'cancelled'), 0) as rental_commission,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'accommodation' AND mc.status != 'cancelled'), 0) as accommodation_commission,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'shop' AND mc.status != 'cancelled'), 0) as shop_commission,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'membership' AND mc.status != 'cancelled'), 0) as membership_commission,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'package' AND mc.status != 'cancelled'), 0) as package_commission
       FROM manager_commissions mc
       ${whereClause}`,
      params
    );

    // Get actual payments + deductions from wallet_transactions.
    // Both reduce what the manager is still owed: payments are money paid out,
    // deductions are amounts forgiven/clawed back. Pending must subtract both.
    const paymentsResult = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_paid,
         COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_deducted,
         COUNT(*) FILTER (WHERE amount > 0) as payment_count,
         COUNT(*) FILTER (WHERE amount < 0) as deduction_count
       FROM wallet_transactions
       WHERE user_id = $1
         AND entity_type = 'manager_payment'
         AND transaction_type IN ('payment', 'deduction')
         AND status != 'cancelled'`,
      [managerUserId]
    );

    const row = result.rows[0];
    const totalEarned = parseFloat(row.total_earned) || 0;
    const totalPaid = parseFloat(paymentsResult.rows[0]?.total_paid) || 0;
    const totalDeducted = parseFloat(paymentsResult.rows[0]?.total_deducted) || 0;
    const pendingAmount = Math.max(totalEarned - totalPaid - totalDeducted, 0);

    return {
      pending: {
        count: parseInt(row.active_count) || 0,
        amount: pendingAmount
      },
      paid: {
        count: parseInt(paymentsResult.rows[0]?.payment_count) || 0,
        amount: totalPaid
      },
      deducted: {
        count: parseInt(paymentsResult.rows[0]?.deduction_count) || 0,
        amount: totalDeducted
      },
      cancelled: {
        count: parseInt(row.cancelled_count) || 0,
        amount: parseFloat(row.cancelled_amount) || 0
      },
      totalEarned,
      breakdown: {
        bookings: {
          count: parseInt(row.booking_count) || 0,
          amount: parseFloat(row.booking_commission) || 0
        },
        rentals: {
          count: parseInt(row.rental_count) || 0,
          amount: parseFloat(row.rental_commission) || 0
        },
        accommodation: {
          count: parseInt(row.accommodation_count) || 0,
          amount: parseFloat(row.accommodation_commission) || 0
        },
        shop: {
          count: parseInt(row.shop_count) || 0,
          amount: parseFloat(row.shop_commission) || 0
        },
        membership: {
          count: parseInt(row.membership_count) || 0,
          amount: parseFloat(row.membership_commission) || 0
        },
        packages: {
          count: parseInt(row.package_count) || 0,
          amount: parseFloat(row.package_commission) || 0
        }
      },
      currency: 'EUR'
    };
  } catch (error) {
    logger.error('Error fetching manager commission summary:', { error: error.message, managerUserId });
    throw error;
  }
}

/**
 * Get manager's commission history (paginated)
 * @param {string} managerUserId - Manager user ID
 * @param {Object} options - Filter and pagination options
 * @returns {Promise<Object>} Commission list with pagination
 */
export async function getManagerCommissions(managerUserId, options = {}) {
  const { 
    sourceType, 
    status, 
    startDate, 
    endDate, 
    periodMonth,
    page = 1, 
    limit = 20 
  } = options;

  try {
    let whereClause = 'WHERE mc.manager_user_id = $1';
    const params = [managerUserId];
    let paramIndex = 2;

    if (sourceType) {
      whereClause += ` AND mc.source_type = $${paramIndex}`;
      params.push(sourceType);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND mc.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (periodMonth) {
      whereClause += ` AND mc.period_month = $${paramIndex}`;
      params.push(periodMonth);
      paramIndex++;
    } else {
      if (startDate) {
        whereClause += ` AND mc.source_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }
      if (endDate) {
        whereClause += ` AND mc.source_date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }
    }

    // Manager Comm. — Lessons: hide rows for soft-deleted or non-completed bookings
    whereClause += ` AND (
      mc.source_type IS DISTINCT FROM 'booking'
      OR EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.id = mc.source_id::uuid
          AND b.deleted_at IS NULL
          AND LOWER(TRIM(COALESCE(b.status, ''))) IN ('completed', 'done', 'checked_out')
      )
    )`;

    const offset = limit ? (page - 1) * limit : 0;

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM manager_commissions mc ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total) || 0;

    // Get results (limit=0 means fetch all)
    const result = await pool.query(
      `SELECT 
        mc.*,
        CASE 
          WHEN mc.source_type = 'booking' THEN (
            SELECT jsonb_build_object(
              'student_name', COALESCE(s.name, 'Unknown'),
              'instructor_name', COALESCE(i.name, 'Unknown'),
              'service_name', COALESCE(srv.name, 'Unknown'),
              'date', b.date,
              'duration', b.duration,
              'group_size', COALESCE(b.group_size, 1),
              'participant_names', (
                SELECT string_agg(u2.first_name || ' ' || u2.last_name, ', ' ORDER BY bp.is_primary DESC, u2.first_name)
                FROM booking_participants bp
                JOIN users u2 ON u2.id = bp.user_id
                WHERE bp.booking_id = b.id
              )
            )
            FROM bookings b
            LEFT JOIN users s ON s.id = b.student_user_id
            LEFT JOIN users i ON i.id = b.instructor_user_id
            LEFT JOIN services srv ON srv.id = b.service_id
            WHERE b.id = mc.source_id::uuid
          )
          WHEN mc.source_type = 'rental' THEN (
            SELECT jsonb_build_object(
              'customer_name', COALESCE(c.name, 'Unknown'),
              'equipment_name', COALESCE(s.name, 'Unknown'),
              'start_date', r.start_date,
              'end_date', r.end_date,
              'duration', s.duration
            )
            FROM rentals r
            LEFT JOIN users c ON c.id = r.user_id
            LEFT JOIN rental_equipment re ON re.rental_id = r.id
            LEFT JOIN services s ON s.id = re.equipment_id
            WHERE r.id = mc.source_id::uuid
            LIMIT 1
          )
          WHEN mc.source_type = 'accommodation' THEN (
            SELECT jsonb_build_object(
              'guest_name', COALESCE(u.name, 'Unknown'),
              'check_in', ab.check_in_date,
              'check_out', ab.check_out_date,
              'guests_count', ab.guests_count
            )
            FROM accommodation_bookings ab
            LEFT JOIN users u ON u.id = ab.guest_id
            WHERE ab.id = regexp_replace(mc.source_id, '^pkg-accom-', '')::uuid
          )
          WHEN mc.source_type = 'shop' THEN (
            SELECT jsonb_build_object(
              'customer_name', COALESCE(u.name, 'Unknown'),
              'order_number', o.order_number,
              'item_count', (SELECT COUNT(*) FROM shop_order_items oi WHERE oi.order_id = o.id)
            )
            FROM shop_orders o
            LEFT JOIN users u ON u.id = o.user_id
            WHERE o.id = mc.source_id::integer
          )
          WHEN mc.source_type = 'membership' THEN (
            SELECT jsonb_build_object(
              'customer_name', COALESCE(u.name, 'Unknown'),
              'offering_name', COALESCE(mo.name, 'Unknown'),
              'duration_days', mo.duration_days
            )
            FROM member_purchases mp
            LEFT JOIN users u ON u.id = mp.user_id
            LEFT JOIN member_offerings mo ON mo.id = mp.offering_id
            WHERE mp.id = mc.source_id::integer
          )
          WHEN mc.source_type = 'package' THEN (
            SELECT jsonb_build_object(
              'customer_name', COALESCE(u.name, 'Unknown'),
              'package_name', COALESCE(sp.name, 'Unknown'),
              'total_hours', sp.total_hours
            )
            FROM customer_packages cp2
            LEFT JOIN users u ON u.id = cp2.customer_id
            LEFT JOIN service_packages sp ON sp.id = cp2.service_package_id
            WHERE cp2.id = mc.source_id::uuid
          )
          ELSE NULL
        END as source_details
       FROM manager_commissions mc
       ${whereClause}
       ORDER BY mc.source_date DESC, mc.created_at DESC
       ${limit ? `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}` : ''}`,
      limit ? [...params, limit, offset] : params
    );

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: limit ? Math.ceil(total / limit) : 1
      }
    };
  } catch (error) {
    logger.error('Error fetching manager commissions:', { error: error.message, managerUserId });
    throw error;
  }
}

/**
 * Create or update manager commission settings (admin only)
 * @param {string} managerUserId - Manager user ID
 * @param {Object} settings - Commission settings
 * @param {string} createdBy - Admin user ID
 * @returns {Promise<Object>} Created/updated settings
 */
export async function upsertManagerCommissionSettings(managerUserId, settings, createdBy) {
  const {
    commissionType = 'flat',
    defaultRate = DEFAULT_MANAGER_COMMISSION_RATE,
    bookingRate,
    rentalRate,
    accommodationRate,
    packageRate,
    shopRate,
    membershipRate,
    tierSettings,
    effectiveFrom = new Date().toISOString().slice(0, 10),
    effectiveUntil,
    salaryType = 'commission',
    fixedSalaryAmount = 0,
    perLessonAmount = 0
  } = settings;

  try {
    // Check if settings exist for this manager
    const existingResult = await pool.query(
      'SELECT id FROM manager_commission_settings WHERE manager_user_id = $1 AND is_active = true',
      [managerUserId]
    );

    if (existingResult.rows.length > 0) {
      // Update existing
      const result = await pool.query(
        `UPDATE manager_commission_settings SET
          commission_type = $1,
          default_rate = $2,
          booking_rate = $3,
          rental_rate = $4,
          accommodation_rate = $5,
          package_rate = $6,
          tier_settings = $7,
          effective_from = $8,
          effective_until = $9,
          salary_type = $10,
          fixed_salary_amount = $11,
          per_lesson_amount = $12,
          shop_rate = $13,
          membership_rate = $14,
          updated_at = NOW()
         WHERE id = $15
         RETURNING *`,
        [
          commissionType,
          defaultRate,
          bookingRate || null,
          rentalRate || null,
          accommodationRate || null,
          packageRate || null,
          tierSettings ? JSON.stringify(tierSettings) : null,
          effectiveFrom || null,
          effectiveUntil || null,
          salaryType,
          fixedSalaryAmount || 0,
          perLessonAmount || 0,
          shopRate || null,
          membershipRate || null,
          existingResult.rows[0].id
        ]
      );

      logger.info('Manager commission settings updated', {
        settingsId: result.rows[0].id,
        managerUserId,
        updatedBy: createdBy
      });

      return result.rows[0];
    } else {
      // Create new
      const result = await pool.query(
        `INSERT INTO manager_commission_settings (
          manager_user_id,
          commission_type,
          default_rate,
          booking_rate,
          rental_rate,
          accommodation_rate,
          package_rate,
          tier_settings,
          is_active,
          effective_from,
          effective_until,
          created_by,
          salary_type,
          fixed_salary_amount,
          per_lesson_amount,
          shop_rate,
          membership_rate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          managerUserId,
          commissionType,
          defaultRate,
          bookingRate || null,
          rentalRate || null,
          accommodationRate || null,
          packageRate || null,
          tierSettings ? JSON.stringify(tierSettings) : null,
          effectiveFrom || null,
          effectiveUntil || null,
          createdBy,
          salaryType,
          fixedSalaryAmount || 0,
          perLessonAmount || 0,
          shopRate || null,
          membershipRate || null
        ]
      );

      logger.info('Manager commission settings created', {
        settingsId: result.rows[0].id,
        managerUserId,
        createdBy
      });

      return result.rows[0];
    }
  } catch (error) {
    logger.error('Error upserting manager commission settings:', { 
      error: error.message, 
      managerUserId 
    });
    throw error;
  }
}

/**
 * Get all managers with their commission settings (admin view)
 * @returns {Promise<Array>} List of managers with settings
 */
export async function getAllManagersWithCommissionSettings() {
  try {
    const result = await pool.query(
      `SELECT 
        u.id,
        u.name,
        u.email,
        u.profile_image_url,
        mcs.id as settings_id,
        mcs.commission_type,
        mcs.default_rate,
        mcs.booking_rate,
        mcs.rental_rate,
        mcs.accommodation_rate,
        mcs.package_rate,
        mcs.shop_rate,
        mcs.membership_rate,
        mcs.salary_type,
        mcs.fixed_salary_amount,
        mcs.per_lesson_amount,
        mcs.is_active as settings_active,
        mcs.effective_from,
        mcs.effective_until,
        (
          SELECT COALESCE(SUM(mc2.commission_amount), 0)
          FROM manager_commissions mc2
          WHERE mc2.manager_user_id = u.id
            AND (
              mc2.source_type IS DISTINCT FROM 'booking'
              OR EXISTS (
                SELECT 1 FROM bookings b2
                WHERE b2.id = mc2.source_id::uuid
                  AND b2.deleted_at IS NULL
                  AND LOWER(TRIM(COALESCE(b2.status, ''))) IN ('completed', 'done', 'checked_out')
              )
            )
        ) as total_commission,
        (
          SELECT COALESCE(SUM(ABS(amount)), 0)
          FROM wallet_transactions
          WHERE user_id = u.id
            AND entity_type = 'manager_payment'
            AND transaction_type IN ('payment', 'deduction')
            AND status != 'cancelled'
        ) as total_paid
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN manager_commission_settings mcs ON mcs.manager_user_id = u.id AND mcs.is_active = true
       WHERE r.name = 'manager' AND u.deleted_at IS NULL
       ORDER BY u.name ASC`
    );

    return result.rows.map(row => {
      const totalCommission = parseFloat(row.total_commission) || 0;
      const totalPaid = parseFloat(row.total_paid) || 0;
      const pending = Math.max(totalCommission - totalPaid, 0);

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        profileImage: row.profile_image_url,
        settings: row.settings_id ? {
          id: row.settings_id,
          commissionType: row.commission_type || 'flat',
          defaultRate: parseFloat(row.default_rate) || DEFAULT_MANAGER_COMMISSION_RATE,
          bookingRate: row.booking_rate ? parseFloat(row.booking_rate) : null,
          rentalRate: row.rental_rate ? parseFloat(row.rental_rate) : null,
          accommodationRate: row.accommodation_rate ? parseFloat(row.accommodation_rate) : null,
          packageRate: row.package_rate ? parseFloat(row.package_rate) : null,
          shopRate: row.shop_rate ? parseFloat(row.shop_rate) : null,
          membershipRate: row.membership_rate ? parseFloat(row.membership_rate) : null,
          salaryType: row.salary_type || 'commission',
          fixedSalaryAmount: parseFloat(row.fixed_salary_amount) || 0,
          perLessonAmount: parseFloat(row.per_lesson_amount) || 0,
          isActive: row.settings_active,
          effectiveFrom: row.effective_from,
          effectiveUntil: row.effective_until
        } : null,
        pendingCommission: pending,
        paidCommission: totalPaid
      };
    });
  } catch (error) {
    logger.error('Error fetching managers with commission settings:', { error: error.message });
    throw error;
  }
}

/**
 * Get manager payroll earnings broken down by month (seasonal view)
 * @param {string} managerUserId - Manager user ID
 * @param {Object} options - { year }
 * @returns {Promise<Object>} Payroll breakdown by month
 */
export async function getManagerPayrollEarnings(managerUserId, options = {}) {
  const year = options.year || new Date().getFullYear();

  try {
    const settings = await getManagerCommissionSettings(managerUserId);
    const salaryType = settings?.salary_type || 'commission';

    // Get commission earnings grouped by month
    const commissionResult = await pool.query(
      `SELECT 
        mc.period_month,
        COUNT(*) FILTER (WHERE mc.source_type = 'booking' AND mc.status != 'cancelled') as booking_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'rental' AND mc.status != 'cancelled') as rental_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'accommodation' AND mc.status != 'cancelled') as accommodation_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'package' AND mc.status != 'cancelled') as package_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'shop' AND mc.status != 'cancelled') as shop_count,
        COUNT(*) FILTER (WHERE mc.source_type = 'membership' AND mc.status != 'cancelled') as membership_count,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'booking' AND mc.status != 'cancelled'), 0) as booking_earnings,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'rental' AND mc.status != 'cancelled'), 0) as rental_earnings,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'accommodation' AND mc.status != 'cancelled'), 0) as accommodation_earnings,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'package' AND mc.status != 'cancelled'), 0) as package_earnings,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'shop' AND mc.status != 'cancelled'), 0) as shop_earnings,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.source_type = 'membership' AND mc.status != 'cancelled'), 0) as membership_earnings,
        COALESCE(SUM(mc.commission_amount) FILTER (WHERE mc.status != 'cancelled'), 0) as total_commission
       FROM manager_commissions mc
       WHERE mc.manager_user_id = $1
         AND mc.period_month LIKE $2
         AND (
           mc.source_type IS DISTINCT FROM 'booking'
           OR EXISTS (
             SELECT 1 FROM bookings b
             WHERE b.id = mc.source_id::uuid
               AND b.deleted_at IS NULL
               AND LOWER(TRIM(COALESCE(b.status, ''))) IN ('completed', 'done', 'checked_out')
           )
         )
       GROUP BY mc.period_month
       ORDER BY mc.period_month`,
      [managerUserId, `${year}-%`]
    );

    // Get actual payments from wallet_transactions for this year
    const paymentsResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid
       FROM wallet_transactions
       WHERE user_id = $1
         AND entity_type = 'manager_payment'
         AND transaction_type = 'payment'
         AND status != 'cancelled'
         AND EXTRACT(YEAR FROM created_at) = $2`,
      [managerUserId, year]
    );
    const yearTotalPaid = parseFloat(paymentsResult.rows[0]?.total_paid) || 0;

    // Build months array (Jan-Dec)
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const pm = `${year}-${String(m).padStart(2, '0')}`;
      const row = commissionResult.rows.find(r => r.period_month === pm);
      
      let grossAmount = 0;
      if (salaryType === 'monthly_salary') {
        grossAmount = parseFloat(settings?.fixed_salary_amount) || 0;
      } else if (salaryType === 'fixed_per_lesson') {
        const lessonCount = parseInt(row?.booking_count) || 0;
        grossAmount = lessonCount * (parseFloat(settings?.per_lesson_amount) || 0);
      } else {
        grossAmount = parseFloat(row?.total_commission) || 0;
      }

      months.push({
        period: pm,
        month: m,
        monthName: new Date(year, m - 1, 1).toLocaleString('en', { month: 'long' }),
        bookings: { count: parseInt(row?.booking_count) || 0, earnings: parseFloat(row?.booking_earnings) || 0 },
        rentals: { count: parseInt(row?.rental_count) || 0, earnings: parseFloat(row?.rental_earnings) || 0 },
        accommodation: { count: parseInt(row?.accommodation_count) || 0, earnings: parseFloat(row?.accommodation_earnings) || 0 },
        packages: { count: parseInt(row?.package_count) || 0, earnings: parseFloat(row?.package_earnings) || 0 },
        shop: { count: parseInt(row?.shop_count) || 0, earnings: parseFloat(row?.shop_earnings) || 0 },
        membership: { count: parseInt(row?.membership_count) || 0, earnings: parseFloat(row?.membership_earnings) || 0 },
        grossAmount,
      });
    }

    // Calculate seasonal totals (Q1-Q4)
    const seasons = [
      { name: 'Winter', label: 'Q1 (Jan-Mar)', months: [1, 2, 3] },
      { name: 'Spring', label: 'Q2 (Apr-Jun)', months: [4, 5, 6] },
      { name: 'Summer', label: 'Q3 (Jul-Sep)', months: [7, 8, 9] },
      { name: 'Autumn', label: 'Q4 (Oct-Dec)', months: [10, 11, 12] }
    ].map(s => {
      const seasonMonths = months.filter(m => s.months.includes(m.month));
      return {
        ...s,
        grossAmount: seasonMonths.reduce((sum, m) => sum + m.grossAmount, 0),
        bookingCount: seasonMonths.reduce((sum, m) => sum + m.bookings.count, 0),
        rentalCount: seasonMonths.reduce((sum, m) => sum + m.rentals.count, 0),
      };
    });

    const yearTotal = months.reduce((sum, m) => sum + m.grossAmount, 0);

    return {
      year,
      salaryType,
      settings: settings ? {
        commissionType: settings.commission_type,
        defaultRate: parseFloat(settings.default_rate) || 0,
        fixedSalaryAmount: parseFloat(settings.fixed_salary_amount) || 0,
        perLessonAmount: parseFloat(settings.per_lesson_amount) || 0
      } : null,
      months,
      seasons,
      totals: {
        gross: yearTotal,
        paid: yearTotalPaid,
        pending: Math.max(yearTotal - yearTotalPaid, 0)
      },
      currency: 'EUR'
    };
  } catch (error) {
    logger.error('Error fetching manager payroll earnings:', { error: error.message, managerUserId });
    throw error;
  }
}

/**
 * Get a manager's projected/upcoming income from:
 *  1) already-existing pending commission rows (manager_commissions.status = 'pending')
 *  2) projections for upcoming bookings/rentals/accommodation/shop/membership/packages
 *     that are on the schedule but have not produced a commission row yet
 *
 * NOTE on scoping: bookings/rentals/accommodation/shop/membership/packages tables
 * do not carry a manager_id column — the system is single-manager (see
 * getDefaultManager()). All upcoming center activity is therefore projected for
 * the requesting manager.
 *
 * @param {string} managerUserId - The manager user ID (from req.user.id)
 * @returns {Promise<Object>} Upcoming income summary
 */
export async function getManagerUpcomingIncome(managerUserId) {
  const ITEM_CAP = 200;

  try {
    // Manager settings drive the rate and salary type.
    const settings = await getManagerCommissionSettings(managerUserId);
    const salaryType = settings?.salary_type || 'commission';
    const perLessonAmount = parseFloat(settings?.per_lesson_amount) || 0;
    const isCommissionType = salaryType === 'commission';
    const isPerLesson = salaryType === 'fixed_per_lesson';
    const isMonthlySalary = salaryType === 'monthly_salary';

    // Helper: project commission for a single source row given its EUR amount.
    const projectFor = (sourceType, amountEur) => {
      if (isMonthlySalary) return { rate: null, amount: 0 };
      if (isPerLesson) {
        // Per-lesson only applies to bookings; other categories yield nothing
        // since the per-lesson model is per booked lesson.
        if (sourceType === 'booking') return { rate: null, amount: perLessonAmount };
        return { rate: null, amount: 0 };
      }
      const rate = getCommissionRate(settings, sourceType);
      const amt = (parseFloat(amountEur) || 0) * (rate / 100);
      return { rate, amount: amt };
    };

    // -------------------------------------------------
    // 1) Existing pending commission rows for this manager
    // -------------------------------------------------
    const pendingRowsRes = await pool.query(
      `SELECT
         mc.id,
         mc.source_type,
         mc.source_id,
         mc.source_amount,
         mc.source_currency,
         mc.commission_rate,
         mc.commission_amount,
         mc.source_date,
         mc.status,
         mc.metadata
       FROM manager_commissions mc
       WHERE mc.manager_user_id = $1
         AND mc.status = 'pending'
       ORDER BY mc.source_date ASC, mc.created_at ASC`,
      [managerUserId]
    );

    // Track source_ids per type that already have a commission row, so the
    // projection step below skips them (avoids double-counting).
    const haveCommission = {
      booking: new Set(),
      rental: new Set(),
      accommodation: new Set(),
      shop: new Set(),
      membership: new Set(),
      package: new Set()
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = [];

    for (const row of pendingRowsRes.rows) {
      if (haveCommission[row.source_type]) {
        haveCommission[row.source_type].add(String(row.source_id));
      }
      const md = row.metadata || {};
      items.push({
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        date: row.source_date instanceof Date
          ? row.source_date.toISOString().slice(0, 10)
          : (row.source_date ? String(row.source_date).slice(0, 10) : null),
        sourceAmount: parseFloat(row.source_amount) || 0,
        sourceCurrency: row.source_currency || 'EUR',
        projectedCommission: parseFloat(row.commission_amount) || 0,
        commissionRate: row.commission_rate != null ? parseFloat(row.commission_rate) : null,
        status: 'pending_commission',
        sourceDetails: {
          studentName: md.studentName || md.customerName || md.guestName || null,
          instructorName: md.instructorName || null,
          serviceName: md.serviceName || md.equipmentName || md.offeringName || md.packageName || null
        }
      });
    }

    // ID lists for NOT-IN filters (UUIDs and integers handled per-type)
    const bookingIdList = [...haveCommission.booking];
    const rentalIdList = [...haveCommission.rental];
    const accomIdList = [...haveCommission.accommodation];
    const shopIdList = [...haveCommission.shop];
    const memberIdList = [...haveCommission.membership];
    const packageIdList = [...haveCommission.package];

    // FX rates cached up-front so per-row currency conversion stays in-memory
    // (avoids ~2 SELECTs per item × 1,200 items in the worst case).
    const ratesRes = await pool.query(
      `SELECT currency_code, exchange_rate FROM currency_settings WHERE is_active = true`
    );
    const fxRates = new Map(
      ratesRes.rows.map(r => [r.currency_code, parseFloat(r.exchange_rate) || 1])
    );
    const toEur = (amount, currency) => {
      const numeric = parseFloat(amount) || 0;
      if (numeric <= 0) return 0;
      if (!currency || currency === 'EUR') return numeric;
      const fromRate = fxRates.get(currency);
      const toRate = fxRates.get('EUR');
      if (!fromRate || !toRate) return numeric;
      return Math.round((numeric / fromRate) * toRate * 100) / 100;
    };

    // -------------------------------------------------
    // 2) Projections from the calendar / scheduled items
    //    (six independent SELECTs run in parallel)
    // -------------------------------------------------
    const shopIdNums = shopIdList.map(v => Number(v)).filter(Number.isFinite);
    const memberIdNums = memberIdList.map(v => Number(v)).filter(Number.isFinite);

    const [bookingsRes, rentalsRes, accomRes, shopRes, memberRes, packagesRes] = await Promise.all([
      pool.query(
        `SELECT
           b.id,
           b.date,
           b.duration,
           b.status,
           b.payment_status,
           b.final_amount,
           b.amount,
           b.currency,
           s.name AS student_name,
           i.name AS instructor_name,
           srv.name AS service_name
         FROM bookings b
         LEFT JOIN users s ON s.id = b.student_user_id
         LEFT JOIN users i ON i.id = b.instructor_user_id
         LEFT JOIN services srv ON srv.id = b.service_id
         WHERE b.deleted_at IS NULL
           AND b.date >= CURRENT_DATE
           AND LOWER(TRIM(COALESCE(b.status, ''))) NOT IN ('cancelled', 'no_show', 'pending_payment', 'completed', 'done', 'checked_out', 'checked-out')
           AND ($1::uuid[] IS NULL OR b.id <> ALL($1::uuid[]))
         ORDER BY b.date ASC, b.start_hour ASC NULLS LAST
         LIMIT $2`,
        [bookingIdList.length ? bookingIdList : null, ITEM_CAP]
      ),
      pool.query(
        `SELECT
           r.id,
           r.start_date,
           r.end_date,
           r.status,
           r.total_price,
           u.name AS customer_name,
           (
             SELECT string_agg(s2.name, ', ')
             FROM rental_equipment re2
             LEFT JOIN services s2 ON s2.id = re2.equipment_id
             WHERE re2.rental_id = r.id
           ) AS equipment_name
         FROM rentals r
         LEFT JOIN users u ON u.id = r.user_id
         WHERE LOWER(TRIM(COALESCE(r.status, ''))) IN ('active', 'upcoming', 'pending', 'overdue')
           AND r.end_date >= CURRENT_DATE
           AND ($1::uuid[] IS NULL OR r.id <> ALL($1::uuid[]))
         ORDER BY r.start_date ASC
         LIMIT $2`,
        [rentalIdList.length ? rentalIdList : null, ITEM_CAP]
      ),
      pool.query(
        `SELECT
           ab.id,
           ab.check_in_date,
           ab.check_out_date,
           ab.status,
           ab.total_price,
           u.name AS guest_name,
           au.name AS unit_name
         FROM accommodation_bookings ab
         LEFT JOIN users u ON u.id = ab.guest_id
         LEFT JOIN accommodation_units au ON au.id = ab.unit_id
         WHERE ab.check_out_date >= CURRENT_DATE
           AND LOWER(TRIM(COALESCE(ab.status, ''))) NOT IN ('cancelled', 'completed')
           AND ($1::uuid[] IS NULL OR ab.id <> ALL($1::uuid[]))
         ORDER BY ab.check_in_date ASC
         LIMIT $2`,
        [accomIdList.length ? accomIdList : null, ITEM_CAP]
      ),
      pool.query(
        `SELECT
           o.id,
           o.created_at,
           o.confirmed_at,
           o.status,
           o.total_amount,
           o.currency,
           o.order_number,
           u.name AS customer_name
         FROM shop_orders o
         LEFT JOIN users u ON u.id = o.user_id
         WHERE LOWER(TRIM(COALESCE(o.status, ''))) IN ('pending', 'confirmed', 'processing', 'shipped')
           AND ($1::int[] IS NULL OR o.id <> ALL($1::int[]))
         ORDER BY COALESCE(o.confirmed_at, o.created_at) ASC
         LIMIT $2`,
        [shopIdNums.length ? shopIdNums : null, ITEM_CAP]
      ),
      pool.query(
        `SELECT
           mp.id,
           mp.purchased_at,
           mp.expires_at,
           mp.status,
           mp.payment_status,
           mp.offering_price,
           mp.offering_currency,
           mp.offering_name,
           u.name AS user_name
         FROM member_purchases mp
         LEFT JOIN users u ON u.id = mp.user_id
         WHERE LOWER(TRIM(COALESCE(mp.status, ''))) IN ('pending', 'pending_payment', 'active')
           AND (mp.expires_at IS NULL OR mp.expires_at >= NOW())
           AND ($1::int[] IS NULL OR mp.id <> ALL($1::int[]))
         ORDER BY mp.purchased_at ASC
         LIMIT $2`,
        [memberIdNums.length ? memberIdNums : null, ITEM_CAP]
      ),
      pool.query(
        `SELECT
           cp.id,
           cp.purchase_date,
           cp.purchase_price,
           cp.currency,
           cp.package_name,
           cp.status,
           u.name AS customer_name,
           sp.name AS sp_name
         FROM customer_packages cp
         LEFT JOIN users u ON u.id = cp.customer_id
         LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
         WHERE LOWER(TRIM(COALESCE(cp.status, ''))) = 'active'
           AND ($1::uuid[] IS NULL OR cp.id <> ALL($1::uuid[]))
         ORDER BY cp.purchase_date ASC
         LIMIT $2`,
        [packageIdList.length ? packageIdList : null, ITEM_CAP]
      )
    ]);

    for (const r of bookingsRes.rows) {
      const sourceCurrency = r.currency || 'EUR';
      const sourceAmount = parseFloat(r.final_amount) || parseFloat(r.amount) || 0;
      const amountEur = toEur(sourceAmount, sourceCurrency);
      const { rate, amount } = projectFor('booking', amountEur);
      const dateStr = r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : (r.date ? String(r.date).slice(0, 10) : null);
      const lowered = String(r.status || '').toLowerCase();
      const statusLabel = ['checked-in', 'checked_in'].includes(lowered) ? 'in_progress' : 'scheduled';
      items.push({
        id: r.id,
        sourceType: 'booking',
        sourceId: r.id,
        date: dateStr,
        sourceAmount,
        sourceCurrency,
        projectedCommission: amount,
        commissionRate: rate,
        status: statusLabel,
        sourceDetails: {
          studentName: r.student_name || null,
          instructorName: r.instructor_name || null,
          serviceName: r.service_name || null
        }
      });
    }

    for (const r of rentalsRes.rows) {
      const sourceAmount = parseFloat(r.total_price) || 0;
      const sourceCurrency = 'EUR'; // rentals table has no currency column
      const amountEur = toEur(sourceAmount, sourceCurrency);
      const { rate, amount } = projectFor('rental', amountEur);
      const dateStr = r.start_date instanceof Date
        ? r.start_date.toISOString().slice(0, 10)
        : (r.start_date ? String(r.start_date).slice(0, 10) : null);
      const statusLabel = ['active', 'overdue'].includes(String(r.status || '').toLowerCase())
        ? 'in_progress'
        : 'scheduled';
      items.push({
        id: r.id,
        sourceType: 'rental',
        sourceId: r.id,
        date: dateStr,
        sourceAmount,
        sourceCurrency,
        projectedCommission: amount,
        commissionRate: rate,
        status: statusLabel,
        sourceDetails: {
          studentName: r.customer_name || null,
          instructorName: null,
          serviceName: r.equipment_name || null
        }
      });
    }

    for (const r of accomRes.rows) {
      const sourceAmount = parseFloat(r.total_price) || 0;
      const sourceCurrency = 'EUR';
      const amountEur = toEur(sourceAmount, sourceCurrency);
      const { rate, amount } = projectFor('accommodation', amountEur);
      const dateStr = r.check_in_date instanceof Date
        ? r.check_in_date.toISOString().slice(0, 10)
        : (r.check_in_date ? String(r.check_in_date).slice(0, 10) : null);
      const checkIn = r.check_in_date ? new Date(r.check_in_date) : null;
      checkIn?.setHours(0, 0, 0, 0);
      const statusLabel = checkIn && checkIn <= today ? 'in_progress' : 'scheduled';
      items.push({
        id: r.id,
        sourceType: 'accommodation',
        sourceId: r.id,
        date: dateStr,
        sourceAmount,
        sourceCurrency,
        projectedCommission: amount,
        commissionRate: rate,
        status: statusLabel,
        sourceDetails: {
          studentName: r.guest_name || null,
          instructorName: null,
          serviceName: r.unit_name || null
        }
      });
    }

    for (const r of shopRes.rows) {
      const sourceAmount = parseFloat(r.total_amount) || 0;
      const sourceCurrency = r.currency || 'EUR';
      const amountEur = toEur(sourceAmount, sourceCurrency);
      const { rate, amount } = projectFor('shop', amountEur);
      const refDate = r.confirmed_at || r.created_at;
      const dateStr = refDate instanceof Date
        ? refDate.toISOString().slice(0, 10)
        : (refDate ? String(refDate).slice(0, 10) : null);
      items.push({
        id: r.id,
        sourceType: 'shop',
        sourceId: r.id,
        date: dateStr,
        sourceAmount,
        sourceCurrency,
        projectedCommission: amount,
        commissionRate: rate,
        status: 'in_progress',
        sourceDetails: {
          studentName: r.customer_name || null,
          instructorName: null,
          serviceName: r.order_number || null
        }
      });
    }

    for (const r of memberRes.rows) {
      const sourceAmount = parseFloat(r.offering_price) || 0;
      const sourceCurrency = r.offering_currency || 'EUR';
      const amountEur = toEur(sourceAmount, sourceCurrency);
      const { rate, amount } = projectFor('membership', amountEur);
      const refDate = r.purchased_at;
      const dateStr = refDate instanceof Date
        ? refDate.toISOString().slice(0, 10)
        : (refDate ? String(refDate).slice(0, 10) : null);
      items.push({
        id: r.id,
        sourceType: 'membership',
        sourceId: r.id,
        date: dateStr,
        sourceAmount,
        sourceCurrency,
        projectedCommission: amount,
        commissionRate: rate,
        status: 'in_progress',
        sourceDetails: {
          studentName: r.user_name || null,
          instructorName: null,
          serviceName: r.offering_name || null
        }
      });
    }

    for (const r of packagesRes.rows) {
      const sourceAmount = parseFloat(r.purchase_price) || 0;
      const sourceCurrency = r.currency || 'EUR';
      const amountEur = toEur(sourceAmount, sourceCurrency);
      const { rate, amount } = projectFor('package', amountEur);
      const refDate = r.purchase_date;
      const dateStr = refDate instanceof Date
        ? refDate.toISOString().slice(0, 10)
        : (refDate ? String(refDate).slice(0, 10) : null);
      items.push({
        id: r.id,
        sourceType: 'package',
        sourceId: r.id,
        date: dateStr,
        sourceAmount,
        sourceCurrency,
        projectedCommission: amount,
        commissionRate: rate,
        status: 'in_progress',
        sourceDetails: {
          studentName: r.customer_name || null,
          instructorName: null,
          serviceName: r.package_name || r.sp_name || null
        }
      });
    }

    // -------------------------------------------------
    // Aggregate
    // -------------------------------------------------
    const byCategory = {
      bookings:      { count: 0, amount: 0 },
      rentals:       { count: 0, amount: 0 },
      accommodation: { count: 0, amount: 0 },
      shop:          { count: 0, amount: 0 },
      membership:    { count: 0, amount: 0 },
      packages:      { count: 0, amount: 0 }
    };

    const typeToCategory = {
      booking: 'bookings',
      rental: 'rentals',
      accommodation: 'accommodation',
      shop: 'shop',
      membership: 'membership',
      package: 'packages'
    };

    let totalProjected = 0;
    for (const it of items) {
      const cat = typeToCategory[it.sourceType];
      if (!cat) continue;
      byCategory[cat].count += 1;
      byCategory[cat].amount += parseFloat(it.projectedCommission) || 0;
      totalProjected += parseFloat(it.projectedCommission) || 0;
    }

    // Round monetary amounts to 2 decimals
    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].amount = round2(byCategory[cat].amount);
    }
    totalProjected = round2(totalProjected);

    // Sort items by date ASC (nulls last) and cap to ITEM_CAP
    items.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    const cappedItems = items.slice(0, ITEM_CAP).map(it => ({
      ...it,
      sourceAmount: round2(it.sourceAmount),
      projectedCommission: round2(it.projectedCommission)
    }));

    return {
      totalProjected,
      byCategory,
      items: cappedItems
    };
  } catch (error) {
    logger.error('Error fetching manager upcoming income:', { error: error.message, managerUserId, stack: error.stack });
    throw error;
  }
}

export default {
  getManagerCommissionSettings,
  getDefaultManager,
  recordBookingCommission,
  recordRentalCommission,
  cancelCommission,
  getManagerCommissionSummary,
  getManagerCommissions,
  upsertManagerCommissionSettings,
  getAllManagersWithCommissionSettings,
  getManagerPayrollEarnings,
  getManagerUpcomingIncome
};
