/**
 * Booking Update Cascade Service
 * Ensures data consistency when booking price or commission changes
 * All related financial data is properly updated
 */

import { pool } from '../db.js';
import { writeLessonSnapshot } from './revenueSnapshotService.js';
import { deriveLessonAmount } from '../utils/instructorEarnings.js';

class BookingUpdateCascadeService {
  /**
   * Compute the effective lesson amount for a booking (package-aware)
   */
  static async computeLessonAmount(client, booking) {
    const baseAmount = Number.parseFloat(booking.final_amount || booking.amount || 0) || 0;
    
    // For non-package bookings, use the base amount
    if (booking.payment_status !== 'package' || !booking.customer_package_id) {
      return baseAmount;
    }
    
    // For package bookings, derive lesson value from package price / hours
    try {
      const { rows } = await client.query(
        'SELECT purchase_price, total_hours, remaining_hours, used_hours, service_package_id FROM customer_packages WHERE id = $1',
        [booking.customer_package_id]
      );
      
      if (!rows.length) {
        console.warn('[computeLessonAmount] Package not found:', booking.customer_package_id);
        return baseAmount;
      }
      
      const pkg = rows[0];

      let servicePackage = null;
      if (pkg.service_package_id) {
        const serviceResult = await client.query(
          'SELECT total_hours, sessions_count, duration_hours FROM service_packages WHERE id = $1',
          [pkg.service_package_id]
        );
        servicePackage = serviceResult.rows[0] || null;
      }

      const lessonAmount = deriveLessonAmount({
        paymentStatus: booking.payment_status,
        duration: booking.duration,
        baseAmount,
        packagePrice: pkg.purchase_price,
        packageTotalHours: pkg.total_hours || servicePackage?.total_hours,
        packageRemainingHours: pkg.remaining_hours,
        packageUsedHours: pkg.used_hours,
        packageSessionsCount: servicePackage?.sessions_count,
        fallbackSessionDuration: servicePackage?.duration_hours || booking.duration,
      });

      console.log('[computeLessonAmount] Package lesson derived:', {
        bookingId: booking.id,
        packagePrice: pkg.purchase_price,
        totalHours: pkg.total_hours || servicePackage?.total_hours,
        duration: booking.duration,
        derivedAmount: lessonAmount
      });

      return lessonAmount;
    } catch (error) {
      console.warn('computeLessonAmount fallback due to error', error?.message);
      return baseAmount;
    }
  }

  /**
   * Compute instructor earnings amount from commission settings
   */
  static computeInstructorEarnings(commissionType, commissionValue, lessonAmount, duration) {
    const dur = parseFloat(duration || 1);
    if (commissionType === 'percentage') return (lessonAmount * commissionValue) / 100;
    // 'fixed' from UI is treated as fixed per hour (e.g., €20/hour * 0.5h = €10)
    if (commissionType === 'fixed' || commissionType === 'fixed_per_hour') return commissionValue * dur;
    if (commissionType === 'fixed_per_lesson') return commissionValue;
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
      
  // log: cascade booking update start
      
      // Track what needs updating
      const needsFinancialUpdate = this.needsFinancialUpdate(changes);
      const needsCommissionUpdate = this.needsCommissionUpdate(changes);
      const needsEarningsCreation = this.needsEarningsCreation(changes);
      
  // log: update requirements computed
      
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
  // eslint-disable-next-line no-console
  console.error('Cascade update failed:', error);
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
   * Update instructor earnings based on booking changes
   */
  static async updateInstructorEarnings(client, booking) {
    try {
      // Get current earnings record
      const existingEarnings = await client.query(
        'SELECT * FROM instructor_earnings WHERE booking_id = $1',
        [booking.id]
      );
      
      if (existingEarnings.rows.length === 0) {
        // Create new earnings record
        await this.createInstructorEarnings(client, booking);
        return;
      }
      
  // Recalculate commission
  const { commissionType, commissionValue } = await this.getCommissionRate(client, booking);
  const lessonAmount = await this.computeLessonAmount(client, booking);
  const instructorEarnings = this.computeInstructorEarnings(commissionType, commissionValue, lessonAmount, booking.duration);
  
  // Get booking currency (fallback to EUR if not set)
  const bookingCurrency = booking.currency || 'EUR';
      
      // Commission amount is what the instructor gets (not what company takes)
  // Update earnings record
  await client.query(`
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
        commissionValue / 100, // Store as decimal (0.25 for 25%)
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
  static async createInstructorEarnings(client, booking) {
    if (!booking.instructor_user_id) return;
    
  const { commissionType, commissionValue } = await this.getCommissionRate(client, booking);
  const lessonAmount = await this.computeLessonAmount(client, booking);
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
    
    // 1. Check for booking-specific custom commission first (this is the primary source)
    const customCommission = await client.query(
      'SELECT commission_type, commission_value FROM booking_custom_commissions WHERE booking_id = $1',
      [booking.id]
    );
    
    if (customCommission.rows.length > 0) {
      commissionType = customCommission.rows[0].commission_type;
      commissionValue = parseFloat(customCommission.rows[0].commission_value);
    } else {
      // 2. Check for service-specific commission
      const serviceCommission = await client.query(
        'SELECT commission_type, commission_value FROM instructor_service_commissions WHERE instructor_id = $1 AND service_id = $2',
        [booking.instructor_user_id, booking.service_id]
      );
      
      if (serviceCommission.rows.length > 0) {
        commissionType = serviceCommission.rows[0].commission_type;
        commissionValue = parseFloat(serviceCommission.rows[0].commission_value);
      } else {
        // 3. Fallback to default commission
        const defaultCommission = await client.query(
          'SELECT commission_type, commission_value FROM instructor_default_commissions WHERE instructor_id = $1',
          [booking.instructor_user_id]
        );
        
        if (defaultCommission.rows.length > 0) {
          commissionType = defaultCommission.rows[0].commission_type;
          commissionValue = parseFloat(defaultCommission.rows[0].commission_value);
        }
      }
    }
    
    return { commissionType, commissionValue };
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
      const oldAmount = changes._previous?.final_amount || changes._previous?.amount || 0;
      const newAmount = parseFloat(booking.final_amount || booking.amount || 0);
      const amountDifference = newAmount - oldAmount;
      
      if (Math.abs(amountDifference) > 0.01) {
        // For individual bookings (not packages), update customer balance
        if (booking.payment_status !== 'package') {
          await client.query(`
            UPDATE users 
            SET balance = balance - $1, updated_at = NOW()
            WHERE id = $2
          `, [amountDifference, booking.student_user_id]);
          
          // Create transaction record for balance change
          await client.query(`
            INSERT INTO transactions (user_id, booking_id, type, amount, description, transaction_date)
            VALUES ($1, $2, $3, $4, $5, NOW())
          `, [
            booking.student_user_id,
            booking.id,
            amountDifference > 0 ? 'charge' : 'credit',
            Math.abs(amountDifference),
            `Booking price adjustment: ${amountDifference > 0 ? 'increase' : 'decrease'} €${Math.abs(amountDifference).toFixed(2)}`
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
