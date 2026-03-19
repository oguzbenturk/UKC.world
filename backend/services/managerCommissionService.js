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

    // Get the booking amount — for package bookings derive the actual lesson
    // value from the package price, exactly like instructor earnings does.
    let sourceAmount = parseFloat(booking.final_amount) || parseFloat(booking.amount) || 0;
    const sourceCurrency = booking.currency || 'EUR';

    if (booking.customer_package_id &&
        (booking.payment_status === 'package' || booking.payment_status === 'partial')) {
      const cashAmount = sourceAmount; // Preserve the cash portion for partial
      try {
        const pkgRes = await client.query(
          `SELECT cp.purchase_price, cp.total_hours, cp.remaining_hours, cp.used_hours,
                  cp.service_package_id, cp.currency,
                  sp.sessions_count, sp.total_hours as sp_total_hours,
                  sp.package_hourly_rate, sp.rental_service_id, sp.accommodation_unit_id,
                  sp.rental_days, sp.accommodation_nights,
                  cs.exchange_rate
           FROM customer_packages cp
           LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
           LEFT JOIN currency_settings cs ON cs.currency_code = cp.currency
           WHERE cp.id = $1`,
          [booking.customer_package_id]
        );
        if (pkgRes.rows.length > 0) {
          const pkg = pkgRes.rows[0];
          // Convert package price to EUR if needed
          let pkgPrice = toNumber(pkg.purchase_price);
          if (pkg.currency && pkg.currency !== 'EUR' && toNumber(pkg.exchange_rate) > 0) {
            pkgPrice = Math.round((pkgPrice / toNumber(pkg.exchange_rate)) * 100) / 100;
          }

          // Derive lesson-only portion using stored hourly rate or subtraction fallback
          const storedHourlyRate = toNumber(pkg.package_hourly_rate);
          const pkgTotalHours = toNumber(pkg.total_hours) || toNumber(pkg.sp_total_hours);
          let effectivePackagePrice = pkgPrice;

          if (storedHourlyRate > 0 && pkgTotalHours > 0) {
            effectivePackagePrice = storedHourlyRate * pkgTotalHours;
          } else {
            // Fallback: subtract rental + accommodation costs
            let rentalCost = 0;
            let accomCost = 0;
            const rentalDays = parseInt(pkg.rental_days) || 0;
            const accomNights = parseInt(pkg.accommodation_nights) || 0;
            if (rentalDays > 0 && pkg.rental_service_id) {
              try {
                const { rows: rRows } = await client.query(
                  'SELECT price FROM services WHERE id = $1', [pkg.rental_service_id]
                );
                rentalCost = rentalDays * (toNumber(rRows[0]?.price) || 0);
              } catch { /* ignore */ }
            }
            if (accomNights > 0 && pkg.accommodation_unit_id) {
              try {
                const { rows: aRows } = await client.query(
                  'SELECT price_per_night FROM accommodation_units WHERE id = $1', [pkg.accommodation_unit_id]
                );
                accomCost = accomNights * (toNumber(aRows[0]?.price_per_night) || 0);
              } catch { /* ignore */ }
            }
            if (rentalCost + accomCost > 0) {
              effectivePackagePrice = Math.max(0, pkgPrice - rentalCost - accomCost);
            }
          }

          sourceAmount = deriveLessonAmount({
            paymentStatus: 'package', // Always treat as package for derivation
            duration: booking.duration,
            baseAmount: 0,
            packagePrice: effectivePackagePrice,
            packageTotalHours: pkgTotalHours,
            packageRemainingHours: toNumber(pkg.remaining_hours),
            packageUsedHours: toNumber(pkg.used_hours),
            packageSessionsCount: toNumber(pkg.sessions_count),
            fallbackSessionDuration: booking.duration,
          });

          // For fully package-paid group bookings, multiply per-person amount by group_size
          // For partial bookings, add the per-person package portion to the cash amount
          const groupSize = Math.max(1, parseInt(booking.group_size) || 1);
          if (booking.payment_status === 'partial') {
            // packagePortion (per-person) + cashAmount (all cash participants)
            sourceAmount = Number.parseFloat((sourceAmount + cashAmount).toFixed(2));
          } else if (groupSize > 1) {
            sourceAmount = Number.parseFloat((sourceAmount * groupSize).toFixed(2));
          }

          logger.info('Derived package lesson value for manager commission', {
            bookingId: booking.id, packageId: booking.customer_package_id,
            derivedAmount: sourceAmount, effectivePackagePrice, storedHourlyRate,
            fullPackagePrice: pkgPrice, groupSize
          });
        }
      } catch (err) {
        logger.warn('Failed to derive package lesson value', { bookingId: booking.id, error: err.message });
      }
    }

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
          `SELECT cp.purchase_price, cp.currency,
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
              // Last fallback: proportional from full package price
              let pkgPrice = toNumber(pkg.purchase_price);
              if (pkg.currency && pkg.currency !== 'EUR' && toNumber(pkg.exchange_rate) > 0) {
                pkgPrice = Math.round((pkgPrice / toNumber(pkg.exchange_rate)) * 100) / 100;
              }
              sourceAmount = Math.round((pkgPrice / totalDays * daysUsed) * 100) / 100;
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
 */
async function recordGenericCommission(sourceType, { id, amount, currency, date, metadata }) {
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

    const sourceAmount = parseFloat(amount) || 0;
    if (sourceAmount <= 0) {
      await client.query('ROLLBACK');
      return null;
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
    let whereClause = 'WHERE manager_user_id = $1';
    const params = [managerUserId];
    let paramIndex = 2;

    if (periodMonth) {
      whereClause += ` AND period_month = $${paramIndex}`;
      params.push(periodMonth);
      paramIndex++;
    } else {
      if (startDate) {
        whereClause += ` AND source_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }
      if (endDate) {
        whereClause += ` AND source_date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }
    }

    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status != 'cancelled') as active_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        COALESCE(SUM(commission_amount) FILTER (WHERE status = 'cancelled'), 0) as cancelled_amount,
        COALESCE(SUM(commission_amount) FILTER (WHERE status != 'cancelled'), 0) as total_earned,
        COUNT(*) FILTER (WHERE source_type = 'booking') as booking_count,
        COUNT(*) FILTER (WHERE source_type = 'rental') as rental_count,
        COUNT(*) FILTER (WHERE source_type = 'accommodation') as accommodation_count,
        COUNT(*) FILTER (WHERE source_type = 'shop') as shop_count,
        COUNT(*) FILTER (WHERE source_type = 'membership') as membership_count,
        COUNT(*) FILTER (WHERE source_type = 'package') as package_count,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'booking' AND status != 'cancelled'), 0) as booking_commission,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'rental' AND status != 'cancelled'), 0) as rental_commission,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'accommodation' AND status != 'cancelled'), 0) as accommodation_commission,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'shop' AND status != 'cancelled'), 0) as shop_commission,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'membership' AND status != 'cancelled'), 0) as membership_commission,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'package' AND status != 'cancelled'), 0) as package_commission
       FROM manager_commissions
       ${whereClause}`,
      params
    );

    // Get actual payments from wallet_transactions
    const paymentsResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid,
              COUNT(*) as payment_count
       FROM wallet_transactions
       WHERE user_id = $1
         AND entity_type = 'manager_payment'
         AND transaction_type = 'payment'
         AND status != 'cancelled'`,
      [managerUserId]
    );

    const row = result.rows[0];
    const totalEarned = parseFloat(row.total_earned) || 0;
    const totalPaid = parseFloat(paymentsResult.rows[0]?.total_paid) || 0;
    const pendingAmount = Math.max(totalEarned - totalPaid, 0);

    return {
      pending: {
        count: parseInt(row.active_count) || 0,
        amount: pendingAmount
      },
      paid: {
        count: parseInt(paymentsResult.rows[0]?.payment_count) || 0,
        amount: totalPaid
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

    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM manager_commissions mc ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total) || 0;

    // Get paginated results
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
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
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
          SELECT COALESCE(SUM(commission_amount), 0)
          FROM manager_commissions WHERE manager_user_id = u.id
        ) as total_commission,
        (
          SELECT COALESCE(SUM(amount), 0)
          FROM wallet_transactions 
          WHERE user_id = u.id 
            AND entity_type = 'manager_payment'
            AND transaction_type = 'payment'
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
        period_month,
        COUNT(*) FILTER (WHERE source_type = 'booking' AND status != 'cancelled') as booking_count,
        COUNT(*) FILTER (WHERE source_type = 'rental' AND status != 'cancelled') as rental_count,
        COUNT(*) FILTER (WHERE source_type = 'accommodation' AND status != 'cancelled') as accommodation_count,
        COUNT(*) FILTER (WHERE source_type = 'package' AND status != 'cancelled') as package_count,
        COUNT(*) FILTER (WHERE source_type = 'shop' AND status != 'cancelled') as shop_count,
        COUNT(*) FILTER (WHERE source_type = 'membership' AND status != 'cancelled') as membership_count,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'booking' AND status != 'cancelled'), 0) as booking_earnings,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'rental' AND status != 'cancelled'), 0) as rental_earnings,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'accommodation' AND status != 'cancelled'), 0) as accommodation_earnings,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'package' AND status != 'cancelled'), 0) as package_earnings,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'shop' AND status != 'cancelled'), 0) as shop_earnings,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'membership' AND status != 'cancelled'), 0) as membership_earnings,
        COALESCE(SUM(commission_amount) FILTER (WHERE status != 'cancelled'), 0) as total_commission
       FROM manager_commissions
       WHERE manager_user_id = $1
         AND period_month LIKE $2
       GROUP BY period_month
       ORDER BY period_month`,
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
  getManagerPayrollEarnings
};
