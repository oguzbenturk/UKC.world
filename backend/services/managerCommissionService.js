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
      `SELECT id, name, email 
       FROM users 
       WHERE role = 'manager' 
       AND deleted_at IS NULL 
       ORDER BY created_at ASC 
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
    return parseFloat(settings.default_rate) || DEFAULT_MANAGER_COMMISSION_RATE;
  }

  if (type === 'per_category') {
    switch (sourceType) {
      case 'booking':
        return parseFloat(settings.booking_rate) || parseFloat(settings.default_rate) || DEFAULT_MANAGER_COMMISSION_RATE;
      case 'rental':
        return parseFloat(settings.rental_rate) || parseFloat(settings.default_rate) || DEFAULT_MANAGER_COMMISSION_RATE;
      case 'accommodation':
        return parseFloat(settings.accommodation_rate) || parseFloat(settings.default_rate) || DEFAULT_MANAGER_COMMISSION_RATE;
      case 'package':
        return parseFloat(settings.package_rate) || parseFloat(settings.default_rate) || DEFAULT_MANAGER_COMMISSION_RATE;
      default:
        return parseFloat(settings.default_rate) || DEFAULT_MANAGER_COMMISSION_RATE;
    }
  }

  // TODO: Implement tiered commission based on volume
  // if (type === 'tiered') { ... }

  return parseFloat(settings.default_rate) || DEFAULT_MANAGER_COMMISSION_RATE;
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

    // Get the booking amount (use final_amount if available, otherwise amount)
    const sourceAmount = parseFloat(booking.final_amount) || parseFloat(booking.amount) || 0;
    const sourceCurrency = booking.currency || 'EUR';

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
        booking_date,
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

    // Get the rental amount (use total_price)
    const sourceAmount = parseFloat(rental.total_price) || 0;
    const sourceCurrency = rental.currency || 'EUR';

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
        booking_date,
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
    const result = await pool.query(
      `UPDATE manager_commissions 
       SET status = 'cancelled', 
           notes = COALESCE(notes || ' | ', '') || $1,
           updated_at = NOW()
       WHERE source_type = $2 AND source_id = $3 AND status = 'pending'
       RETURNING *`,
      [`Cancelled: ${reason}`, sourceType, sourceId]
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
        whereClause += ` AND booking_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }
      if (endDate) {
        whereClause += ` AND booking_date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }
    }

    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        COALESCE(SUM(commission_amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(commission_amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
        COALESCE(SUM(commission_amount) FILTER (WHERE status = 'cancelled'), 0) as cancelled_amount,
        COALESCE(SUM(commission_amount) FILTER (WHERE status IN ('pending', 'paid')), 0) as total_earned,
        COUNT(*) FILTER (WHERE source_type = 'booking') as booking_count,
        COUNT(*) FILTER (WHERE source_type = 'rental') as rental_count,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'booking' AND status != 'cancelled'), 0) as booking_commission,
        COALESCE(SUM(commission_amount) FILTER (WHERE source_type = 'rental' AND status != 'cancelled'), 0) as rental_commission
       FROM manager_commissions
       ${whereClause}`,
      params
    );

    const row = result.rows[0];
    return {
      pending: {
        count: parseInt(row.pending_count) || 0,
        amount: parseFloat(row.pending_amount) || 0
      },
      paid: {
        count: parseInt(row.paid_count) || 0,
        amount: parseFloat(row.paid_amount) || 0
      },
      cancelled: {
        count: parseInt(row.cancelled_count) || 0,
        amount: parseFloat(row.cancelled_amount) || 0
      },
      totalEarned: parseFloat(row.total_earned) || 0,
      breakdown: {
        bookings: {
          count: parseInt(row.booking_count) || 0,
          amount: parseFloat(row.booking_commission) || 0
        },
        rentals: {
          count: parseInt(row.rental_count) || 0,
          amount: parseFloat(row.rental_commission) || 0
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
        whereClause += ` AND mc.booking_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }
      if (endDate) {
        whereClause += ` AND mc.booking_date <= $${paramIndex}`;
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
              'duration', b.duration
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
              'equipment_name', COALESCE(e.name, 'Unknown'),
              'start_date', r.start_date,
              'end_date', r.end_date
            )
            FROM rentals r
            LEFT JOIN users c ON c.id = r.customer_id
            LEFT JOIN equipment e ON e.id = r.equipment_id
            WHERE r.id = mc.source_id::uuid
          )
          ELSE NULL
        END as source_details
       FROM manager_commissions mc
       ${whereClause}
       ORDER BY mc.booking_date DESC, mc.created_at DESC
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
    tierSettings,
    effectiveFrom,
    effectiveUntil
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
          updated_at = NOW()
         WHERE id = $10
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
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11)
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
          createdBy
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
        mcs.is_active as settings_active,
        mcs.effective_from,
        mcs.effective_until,
        (
          SELECT COALESCE(SUM(commission_amount) FILTER (WHERE status = 'pending'), 0)
          FROM manager_commissions WHERE manager_user_id = u.id
        ) as pending_commission,
        (
          SELECT COALESCE(SUM(commission_amount) FILTER (WHERE status = 'paid'), 0)
          FROM manager_commissions WHERE manager_user_id = u.id
        ) as paid_commission
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN manager_commission_settings mcs ON mcs.manager_user_id = u.id AND mcs.is_active = true
       WHERE r.name = 'manager' AND u.deleted_at IS NULL
       ORDER BY u.name ASC`
    );

    return result.rows.map(row => ({
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
        isActive: row.settings_active,
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until
      } : null,
      pendingCommission: parseFloat(row.pending_commission) || 0,
      paidCommission: parseFloat(row.paid_commission) || 0
    }));
  } catch (error) {
    logger.error('Error fetching managers with commission settings:', { error: error.message });
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
  getAllManagersWithCommissionSettings
};
