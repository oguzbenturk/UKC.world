/**
 * Booking Update Cascade Service
 * Ensures data consistency when booking price or commission changes
 * All related financial data is properly updated
 */

import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { writeLessonSnapshot } from './revenueSnapshotService.js';
import { deriveLessonAmount } from '../utils/instructorEarnings.js';

class BookingUpdateCascadeService {
  /**
   * Pre-fetch all package-level data needed by computeLessonAmount, so a
   * cascade that recomputes earnings for every booking on a package can
   * pass the same context in instead of re-querying per booking.
   */
  static async loadPackageContext(client, packageId) {
    if (!packageId) return null;
    const { rows } = await client.query(
      `SELECT cp.purchase_price, cp.total_hours, cp.remaining_hours, cp.used_hours,
              cp.service_package_id,
              sp.total_hours        AS sp_total_hours,
              sp.sessions_count     AS sp_sessions_count,
              sp.rental_service_id  AS sp_rental_service_id,
              sp.accommodation_unit_id AS sp_accommodation_unit_id,
              sp.rental_days        AS sp_rental_days,
              sp.accommodation_nights AS sp_accommodation_nights,
              sp.package_hourly_rate AS sp_package_hourly_rate,
              (SELECT amount FROM discounts
                 WHERE entity_type = 'customer_package' AND entity_id = cp.id::text
                 LIMIT 1) AS discount_amount,
              (SELECT price FROM services WHERE id = sp.rental_service_id) AS rental_price,
              (SELECT price_per_night FROM accommodation_units WHERE id = sp.accommodation_unit_id) AS accom_price_per_night
         FROM customer_packages cp
         LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
        WHERE cp.id = $1`,
      [packageId]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      packageId,
      pkg: {
        purchase_price: r.purchase_price,
        total_hours: r.total_hours,
        remaining_hours: r.remaining_hours,
        used_hours: r.used_hours,
        service_package_id: r.service_package_id,
      },
      servicePackage: r.service_package_id ? {
        total_hours: r.sp_total_hours,
        sessions_count: r.sp_sessions_count,
        rental_service_id: r.sp_rental_service_id,
        accommodation_unit_id: r.sp_accommodation_unit_id,
        rental_days: r.sp_rental_days,
        accommodation_nights: r.sp_accommodation_nights,
        package_hourly_rate: r.sp_package_hourly_rate,
      } : null,
      discountAmount: r.discount_amount,
      rentalPrice: r.rental_price,
      accomPricePerNight: r.accom_price_per_night,
    };
  }

  /**
   * Compute the effective lesson amount for a booking (package-aware).
   * `pkgContext` (optional) is the result of `loadPackageContext` for the
   * booking's customer_package — pass it when recomputing many bookings on
   * the same package to avoid re-querying invariant data per iteration.
   */
  static async computeLessonAmount(client, booking, pkgContext = null) {
    const baseAmount = new Decimal(booking.final_amount || booking.amount || 0);

    // For non-package bookings without a package reference, use the base amount (with service price fallback)
    if (!booking.customer_package_id || (booking.payment_status !== 'package' && booking.payment_status !== 'partial')) {
      if (baseAmount.gt(0)) return baseAmount.toNumber();
      // Fallback: derive from service price when booking has no amount
      if (booking.service_id) {
        try {
          const { rows: svcRows } = await client.query(
            'SELECT price, duration FROM services WHERE id = $1', [booking.service_id]
          );
          if (svcRows.length > 0) {
            const svcPrice = new Decimal(svcRows[0].price || 0);
            const svcDuration = new Decimal(svcRows[0].duration || 1);
            const bkgDuration = new Decimal(booking.duration || 1);
            if (svcPrice.gt(0)) return svcPrice.div(svcDuration).mul(bkgDuration).toDecimalPlaces(2).toNumber();
          }
        } catch { /* ignore */ }
      }
      return baseAmount.toNumber();
    }

    try {
      const ctx = pkgContext && pkgContext.packageId === booking.customer_package_id
        ? pkgContext
        : await this.loadPackageContext(client, booking.customer_package_id);

      if (!ctx) {
        logger.warn('[computeLessonAmount] Package not found: ' + booking.customer_package_id);
        return baseAmount.toNumber();
      }

      const { pkg, servicePackage, discountAmount, rentalPrice, accomPricePerNight } = ctx;

      // Treat any active per-package discount as effectively reducing the
      // purchase price for downstream commission math. Mirrors the behaviour
      // of an admin price edit so both paths affect commission identically.
      let basePrice = new Decimal(pkg.purchase_price || 0);
      if (discountAmount != null) {
        basePrice = Decimal.max(new Decimal(0), basePrice.sub(new Decimal(discountAmount || 0)));
      }

      // Derive lesson-only portion of the package price
      let effectivePackagePrice = basePrice;
      if (servicePackage) {
        const storedHourlyRate = new Decimal(servicePackage.package_hourly_rate || 0);
        const pkgTotalHours = new Decimal(pkg.total_hours || servicePackage.total_hours || 0);
        if (storedHourlyRate.gt(0) && pkgTotalHours.gt(0)) {
          // Use explicitly stored per-hour lesson rate
          effectivePackagePrice = storedHourlyRate.mul(pkgTotalHours);
        } else {
          const rentalDays = parseInt(servicePackage.rental_days) || 0;
          const accomNights = parseInt(servicePackage.accommodation_nights) || 0;
          const rentalCost = rentalDays > 0 && servicePackage.rental_service_id
            ? new Decimal(rentalDays).mul(new Decimal(rentalPrice || 0))
            : new Decimal(0);
          const accomCost = accomNights > 0 && servicePackage.accommodation_unit_id
            ? new Decimal(accomNights).mul(new Decimal(accomPricePerNight || 0))
            : new Decimal(0);
          const deductions = rentalCost.add(accomCost);
          if (deductions.gt(0)) {
            // Subtract proportionally so the discount-adjusted basePrice keeps
            // its share. Without scaling we'd subtract the full undiscounted
            // rental/accom cost from a discounted total, drifting the lesson
            // portion below the intended split.
            const fullPrice = new Decimal(pkg.purchase_price || 0);
            const ratio = fullPrice.gt(0) ? basePrice.div(fullPrice) : new Decimal(0);
            const scaledDeductions = deductions.mul(ratio);
            effectivePackagePrice = Decimal.max(new Decimal(0), effectivePackagePrice.sub(scaledDeductions));
          }
        }
      }

      // For partial bookings, force package derivation (use paymentStatus 'package' and baseAmount 0
      // so deriveLessonAmount uses the package hourly rate, not the cash amount)
      const isPartial = booking.payment_status === 'partial';
      const lessonAmount = deriveLessonAmount({
        paymentStatus: 'package',
        duration: booking.duration,
        baseAmount: 0,
        packagePrice: effectivePackagePrice.toNumber(),
        packageTotalHours: pkg.total_hours || servicePackage?.total_hours,
        packageRemainingHours: pkg.remaining_hours,
        packageUsedHours: pkg.used_hours,
        packageSessionsCount: servicePackage?.sessions_count,
        fallbackSessionDuration: (servicePackage?.total_hours && servicePackage?.sessions_count ? servicePackage.total_hours / servicePackage.sessions_count : null) || booking.duration,
      });

      // For 'partial' group bookings, total lesson value = package per-person value + cash portion
      if (isPartial && baseAmount.gt(0)) {
        return new Decimal(lessonAmount).add(baseAmount).toDecimalPlaces(2).toNumber();
      }

      return lessonAmount;
    } catch (error) {
      logger.warn('computeLessonAmount fallback due to error: ' + error?.message);
      return baseAmount.toNumber();
    }
  }

  /**
   * Compute instructor earnings amount from commission settings
   */
  static computeInstructorEarnings(commissionType, commissionValue, lessonAmount, duration) {
    const dur = new Decimal(duration || 1);
    const commission = new Decimal(commissionValue);
    const lesson = new Decimal(lessonAmount);
    if (commissionType === 'percentage') return lesson.mul(commission).div(100).toDecimalPlaces(2).toNumber();
    // 'fixed' from UI is treated as fixed per hour (e.g., €20/hour * 0.5h = €10)
    if (commissionType === 'fixed' || commissionType === 'fixed_per_hour') return commission.mul(dur).toDecimalPlaces(2).toNumber();
    if (commissionType === 'fixed_per_lesson') return commission.toDecimalPlaces(2).toNumber();
    return 0;
  }
  
  /**
   * Handle all cascade updates when a booking is modified
   * @param {Object} booking - Updated booking data
   * @param {Object} changes - What fields were changed
   */
  static async cascadeBookingUpdate(booking, changes) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Track what needs updating
      const needsFinancialUpdate = this.needsFinancialUpdate(changes);
      const needsCommissionUpdate = this.needsCommissionUpdate(changes);
      const needsEarningsCreation = this.needsEarningsCreation(changes);
      
      if (needsFinancialUpdate || needsCommissionUpdate || needsEarningsCreation) {
  // log: updating instructor earnings
        // 1. Update instructor earnings (or create if booking just completed)
        await this.updateInstructorEarnings(client, booking);
        
        // 2. Update revenue snapshots  
        await this.updateRevenueSnapshots(client, booking);
        
        // 3. Update customer balance (if price changed)
        if (changes.final_amount !== undefined || changes.amount !== undefined) {
          await this.updateCustomerBalance(client, booking, changes);
        }
        
        // 4. Update package calculations (if using packages)
        if (booking.payment_status === 'package' && changes.final_amount !== undefined) {
          await this.updatePackageCalculations(client, booking, changes);
        }
        
        // 5. Invalidate cached analytics
        await this.invalidateAnalyticsCache(booking);
        
  // log: cascade update completed
      } else {
  // log: no cascade updates needed
      }
      
      await client.query('COMMIT');
      
    } catch (error) {
      await client.query('ROLLBACK');
  logger.error('Cascade update failed', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Check if changes require financial updates
   */
  static needsFinancialUpdate(changes) {
    return changes.final_amount !== undefined || 
           changes.amount !== undefined || 
           changes.duration !== undefined ||
           changes.instructor_user_id !== undefined;
  }

  /**
   * Check if booking status changed to completed (earnings should be created)
   */
  static needsEarningsCreation(changes) {
    const COMPLETED_STATUSES = ['completed', 'done', 'checked_out'];
    const previousStatus = changes._previous?.status?.toLowerCase();
    const newStatus = changes.status?.toLowerCase();
    
    // Trigger earnings creation when transitioning TO a completed status
    return newStatus && 
           COMPLETED_STATUSES.includes(newStatus) && 
           !COMPLETED_STATUSES.includes(previousStatus || '');
  }
  
  /**
   * Check if changes require commission updates
   */
  static needsCommissionUpdate(changes) {
    return changes.instructor_commission !== undefined ||
           changes.instructor_user_id !== undefined ||
           changes.service_id !== undefined ||
           changes._custom_commission_changed; // Added flag for custom commission changes
  }
  
  /**
   * Update instructor earnings based on booking changes.
   * `pkgContext` is forwarded to computeLessonAmount when present.
   */
  static async updateInstructorEarnings(client, booking, pkgContext = null) {
    try {
      // Get current earnings record
      const existingEarnings = await client.query(
        'SELECT * FROM instructor_earnings WHERE booking_id = $1',
        [booking.id]
      );

      if (existingEarnings.rows.length === 0) {
        // Create new earnings record
        await this.createInstructorEarnings(client, booking, pkgContext);
        return;
      }

  // Recalculate commission
  const { commissionType, commissionValue } = await this.getCommissionRate(client, booking);
  let lessonAmount = await this.computeLessonAmount(client, booking, pkgContext);

  // For group/semi-private bookings using packages, lessonAmount is per-person.
  // Multiply by group_size to get the true total lesson value.
  const groupSize = Math.max(1, parseInt(booking.group_size) || 1);
  if (booking.payment_status === 'package' && groupSize > 1) {
    lessonAmount = new Decimal(lessonAmount).mul(groupSize).toDecimalPlaces(2).toNumber();
  }

  const instructorEarnings = this.computeInstructorEarnings(commissionType, commissionValue, lessonAmount, booking.duration);

  // Get booking currency (fallback to EUR if not set)
  const bookingCurrency = booking.currency || 'EUR';

      // Commission amount is what the instructor gets (not what company takes)
  // Update earnings record
  const updateResult = await client.query(`
        UPDATE instructor_earnings 
        SET 
          commission_rate = $1,
          total_earnings = $2,
          lesson_amount = $3,
          lesson_duration = $4,
          currency = $5,
          updated_at = NOW()
        WHERE booking_id = $6
        RETURNING *
      `, [
        commissionValue / 100,
        instructorEarnings,     // What instructor gets for this lesson
        lessonAmount,           // Price of this lesson (or derived from package)
        booking.duration || 1,
        bookingCurrency,        // Currency from the booking
        booking.id
      ]);
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Create new instructor earnings record
   */
  static async createInstructorEarnings(client, booking, pkgContext = null) {
    if (!booking.instructor_user_id) return;

  const { commissionType, commissionValue } = await this.getCommissionRate(client, booking);
  let lessonAmount = await this.computeLessonAmount(client, booking, pkgContext);

  // For group/semi-private bookings using packages, lessonAmount is per-person.
  // Multiply by group_size to get the true total lesson value.
  const groupSize = Math.max(1, parseInt(booking.group_size) || 1);
  if (booking.payment_status === 'package' && groupSize > 1) {
    lessonAmount = new Decimal(lessonAmount).mul(groupSize).toDecimalPlaces(2).toNumber();
  }

  const instructorEarnings = this.computeInstructorEarnings(commissionType, commissionValue, lessonAmount, booking.duration);

  // Get booking currency (fallback to EUR if not set)
  const bookingCurrency = booking.currency || 'EUR';

  if (lessonAmount > 0) {
      await client.query(`
        INSERT INTO instructor_earnings 
        (instructor_id, booking_id, base_rate, commission_rate, total_earnings, lesson_amount, lesson_date, lesson_duration, currency)
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9)
        RETURNING *
      `, [
        booking.instructor_user_id,
        booking.id,
        commissionValue,         // Store percentage value as base_rate
        commissionValue / 100,   // Store as decimal for commission_rate (0.25 for 25%)
    instructorEarnings,      // What instructor gets for this lesson
    lessonAmount,            // Price of this lesson (or derived from package)
        booking.date,           // Use booking date or fallback to current date
        booking.duration || 1,
        bookingCurrency          // Currency from the booking
      ]);
    }
  }
  
  /**
   * Get commission rate for booking
   */
  static async getCommissionRate(client, booking) {
    let commissionType = 'percentage';
    let commissionValue = 50; // Default fallback

    // 0. Self-student override: if the student is personally linked to THIS instructor,
    //    use the instructor's configured self-student commission (default 45%).
    if (booking.student_user_id && booking.instructor_user_id) {
      const selfStudent = await client.query(
        `SELECT u.self_student_of_instructor_id,
                COALESCE(idc.self_student_commission_rate, 45) AS rate
           FROM users u
           LEFT JOIN instructor_default_commissions idc
                  ON idc.instructor_id = $2
          WHERE u.id = $1`,
        [booking.student_user_id, booking.instructor_user_id]
      );
      const row = selfStudent.rows[0];
      if (row && row.self_student_of_instructor_id === booking.instructor_user_id) {
        return {
          commissionType: 'percentage',
          commissionValue: new Decimal(row.rate).toNumber(),
        };
      }
    }

    // 1. Check for booking-specific custom commission first (this is the primary source)
    const customCommission = await client.query(
      'SELECT commission_type, commission_value FROM booking_custom_commissions WHERE booking_id = $1',
      [booking.id]
    );
    
    if (customCommission.rows.length > 0) {
      commissionType = customCommission.rows[0].commission_type;
      commissionValue = new Decimal(customCommission.rows[0].commission_value).toNumber();
    } else {
      // 2. Check for service-specific commission
      const serviceCommission = await client.query(
        'SELECT commission_type, commission_value FROM instructor_service_commissions WHERE instructor_id = $1 AND service_id = $2',
        [booking.instructor_user_id, booking.service_id]
      );

      if (serviceCommission.rows.length > 0) {
        commissionType = serviceCommission.rows[0].commission_type;
        commissionValue = new Decimal(serviceCommission.rows[0].commission_value).toNumber();
      } else {
        // 3. Check for lesson-category-level rate
        let foundCategoryRate = false;
        if (booking.service_id) {
          const groupSize = Math.max(1, Number(booking.group_size) || 1);
          const categoryRate = await client.query(
            `SELECT icr.rate_type, icr.rate_value
             FROM instructor_category_rates icr
             JOIN services s ON icr.lesson_category = (
               CASE
                 WHEN s.lesson_category_tag = 'supervision' AND $3::int > 1
                   THEN 'semi-private-supervision'
                 ELSE s.lesson_category_tag
               END
             )
             WHERE icr.instructor_id = $1 AND s.id = $2`,
            [booking.instructor_user_id, booking.service_id, groupSize]
          );
          if (categoryRate.rows.length > 0) {
            commissionType = categoryRate.rows[0].rate_type;
            commissionValue = new Decimal(categoryRate.rows[0].rate_value).toNumber();
            foundCategoryRate = true;
          }
        }

        if (!foundCategoryRate) {
          // 4. Fallback to default commission
          const defaultCommission = await client.query(
            'SELECT commission_type, commission_value FROM instructor_default_commissions WHERE instructor_id = $1',
            [booking.instructor_user_id]
          );

          if (defaultCommission.rows.length > 0) {
            commissionType = defaultCommission.rows[0].commission_type;
            commissionValue = new Decimal(defaultCommission.rows[0].commission_value).toNumber();
          }
        }
      }
    }
    
    return { commissionType, commissionValue };
  }
  
  /**
   * Recompute instructor_earnings snapshot rows for every completed booking
   * tied to a customer package. Called after the package's purchase_price is
   * edited or its discount changes so per-lesson lesson_amount + total_earnings
   * track the new per-hour value.
   *
   * Fixed-rate (and fixed_per_lesson) instructors are unaffected because
   * computeInstructorEarnings keys their earnings off duration, not lesson
   * amount — so even though we re-run, total_earnings stays the same for them.
   *
   * Returns { updated: number, skipped: number }.
   */
  static async recomputeEarningsForPackageBookings(client, packageId) {
    const summary = { updated: 0, skipped: 0 };
    const pkgContext = await this.loadPackageContext(client, packageId);
    const { rows: bookings } = await client.query(
      `SELECT b.*
         FROM bookings b
        WHERE b.customer_package_id = $1
          AND b.deleted_at IS NULL
          AND LOWER(TRIM(COALESCE(b.status, ''))) IN ('completed', 'done', 'checked_out')
          AND b.instructor_user_id IS NOT NULL`,
      [packageId]
    );

    for (const booking of bookings) {
      try {
        await this.updateInstructorEarnings(client, booking, pkgContext);
        summary.updated += 1;
      } catch (err) {
        summary.skipped += 1;
        logger.warn('Failed to recompute earnings for package booking', {
          packageId, bookingId: booking.id, error: err.message
        });
      }
    }

    return summary;
  }

  /**
   * Update revenue snapshots
   */
  static async updateRevenueSnapshots(_client, _booking) {
  // Skipping revenue snapshot update due to UUID/integer schema mismatch
  // TODO: Fix revenue_items.entity_id to use UUID instead of integer
  // The revenue_items table expects integer entity_id but bookings use UUID
  return { skipped: true, reason: 'schema_mismatch' };
  }
  
  /**
   * Update customer balance when booking price changes
   */
  static async updateCustomerBalance(client, booking, changes) {
    if (!booking.student_user_id) return;
    
    try {
      const oldAmount = new Decimal(changes._previous?.final_amount || changes._previous?.amount || 0);
      const newAmount = new Decimal(booking.final_amount || booking.amount || 0);
      const amountDifference = newAmount.sub(oldAmount);

      if (amountDifference.abs().gt(0.01)) {
        // For individual bookings (not packages), update customer balance
        if (booking.payment_status !== 'package') {
          await client.query(`
            UPDATE users
            SET balance = balance - $1, updated_at = NOW()
            WHERE id = $2
          `, [amountDifference.toNumber(), booking.student_user_id]);

          // Create transaction record for balance change
          await client.query(`
            INSERT INTO transactions (user_id, booking_id, type, amount, description, transaction_date)
            VALUES ($1, $2, $3, $4, $5, NOW())
          `, [
            booking.student_user_id,
            booking.id,
            amountDifference.gt(0) ? 'charge' : 'credit',
            amountDifference.abs().toNumber(),
            `Booking price adjustment: ${amountDifference.gt(0) ? 'increase' : 'decrease'} €${amountDifference.abs().toDecimalPlaces(2).toNumber()}`
          ]);
        }
      }
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Update package calculations when price changes
   */
  static async updatePackageCalculations(client, booking, changes) {
    if (!booking.customer_package_id) return;
    
    try {
      // For package bookings, we may need to recalculate per-hour value
      const packageResult = await client.query(
        'SELECT * FROM customer_packages WHERE id = $1',
        [booking.customer_package_id]
      );
      
      if (packageResult.rows.length > 0) {
        const packageData = packageResult.rows[0];
        
        // Log the change for audit purposes
        await client.query(`
          INSERT INTO package_usage_log (package_id, booking_id, action, details, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [
          booking.customer_package_id,
          booking.id,
          'price_adjustment',
          JSON.stringify({
            old_amount: changes._previous?.final_amount || changes._previous?.amount,
            new_amount: booking.final_amount || booking.amount,
            package_name: packageData.package_name
          })
        ]);
      }
      
    } catch (error) {
      // Don't throw - this is non-critical
    }
  }
  
  /**
   * Invalidate cached analytics and trigger refresh
   */
  static async invalidateAnalyticsCache(_booking) {
    try {
      // In a production system, you'd invalidate Redis cache here
      // Could trigger background job to refresh analytics
      // await scheduleAnalyticsRefresh(['instructor_earnings', 'revenue_analytics', 'customer_analytics']);
      
    } catch (error) {
      // Don't throw - this is non-critical
    }
  }
}

export default BookingUpdateCascadeService;
