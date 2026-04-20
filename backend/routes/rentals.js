// backend/routes/rentals.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { authenticateJWT } from './auth.js';
import { requireWaiver, checkFamilyMemberWaiver } from '../middlewares/waiverCheck.js';
import { resolveActorId } from '../utils/auditUtils.js';
import { recordLegacyTransaction, createDepositRequest, getAllBalances } from '../services/walletService.js';
import { forceDeleteRental } from '../services/rentalCleanupService.js';
import CurrencyService from '../services/currencyService.js';
import bookingNotificationService from '../services/bookingNotificationService.js';
import { dispatchNotification } from '../services/notificationDispatcherUnified.js';
import { logger } from '../middlewares/errorHandler.js';
import { cacheMiddleware, cacheInvalidationMiddleware } from '../middlewares/cache.js';

const RENTAL_CACHE_PATTERNS = ['api:GET:/api/rentals*'];

const router = Router();

// Record a manager commission for a rental. Awaited so the commission row
// lands before the response returns — fire-and-forget was losing work under
// nodemon reloads. Never throws; logs the failure and returns null instead.
async function safeRecordRentalCommission(rental, context) {
  if (!rental) return null;
  try {
    const { recordRentalCommission } = await import('../services/managerCommissionService.js');
    return await recordRentalCommission(rental);
  } catch (err) {
    logger.error('Manager commission calculation failed', {
      rentalId: rental.id,
      context,
      error: err?.message,
    });
    return null;
  }
}

/**
 * Get all rentals with enriched data
 */
// Instructors should not access rentals (UI hidden) – enforce 403 server-side
const ALLOW_ROLES_EXCEPT_INSTRUCTOR = ['admin', 'manager'];

router.get('/', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), cacheMiddleware(600), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
    const query = `
      SELECT
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      GROUP BY r.id, u.name, u.email, creator.name
      ORDER BY r.created_at DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, [limit]);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching all rentals', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get recent rentals with enriched data (limited)
 */
router.get('/recent', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), cacheMiddleware(120), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      GROUP BY r.id, u.name, u.email, creator.name
      ORDER BY r.created_at DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, [limit]);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching recent rentals', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all active rentals with enriched data
 */
router.get('/active', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), cacheMiddleware(60), async (req, res) => {
  try {
    const query = `
      SELECT
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'active'
      GROUP BY r.id, u.name, u.email, creator.name
      ORDER BY r.created_at DESC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching active rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all upcoming rentals with enriched data
 */
router.get('/upcoming', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), cacheMiddleware(120), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'upcoming'
      GROUP BY r.id, u.name, u.email, creator.name
      ORDER BY r.start_date ASC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching upcoming rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all overdue rentals with enriched data
 */
router.get('/overdue', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), cacheMiddleware(120), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'overdue'
      GROUP BY r.id, u.name, u.email, creator.name
      ORDER BY r.end_date ASC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching overdue rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all completed rentals with enriched data
 */
router.get('/completed', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), cacheMiddleware(300), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'completed'
      GROUP BY r.id, u.name, u.email, creator.name
      ORDER BY r.end_date DESC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching completed rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all pending rentals (awaiting approval)
 */
router.get('/pending', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), cacheMiddleware(60), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'pending'
      GROUP BY r.id, u.name, u.email, creator.name
      ORDER BY r.created_at DESC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching pending rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get rental by ID with enriched data
 */
router.get('/:id', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        u.phone as customer_phone,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.id = $1
      GROUP BY r.id, u.name, u.email, u.phone, creator.name
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    logger.error('Error fetching rental:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a new rental
 */
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor', 'student', 'outsider']), cacheInvalidationMiddleware(RENTAL_CACHE_PATTERNS), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
  const actorId = resolveActorId(req);
  const actorRoleRaw = req.user?.role;
  const actorRole = typeof actorRoleRaw === 'string' ? actorRoleRaw.toLowerCase() : null;
  const isStaff = actorRole ? ['admin', 'manager', 'owner', 'instructor'].includes(actorRole) : false;
  const allowNegativeBalance = actorRole ? ['admin', 'manager', 'owner'].includes(actorRole) : false;
    
    const { 
      user_id, // Changed from customer_id to user_id to match frontend
      equipment_ids, 
      rental_date,
      status: requestedStatus = 'active',
      notes,
      start_date,
      end_date,
      total_price,
      payment_status = 'unpaid',
      family_member_id,
      currency: requestedCurrency,
      use_package = false,
      customer_package_id,
      rental_days = 1,
      payment_method = 'wallet'
    } = req.body;

    // Non-staff users get 'pending' status requiring admin approval; staff can set any status
    const status = isStaff ? requestedStatus : 'pending';
    
    // Storage currency is always EUR (base currency)
    // The requestedCurrency is tracked for audit purposes only
    const storageCurrency = 'EUR';
    const inputCurrency = requestedCurrency || 'EUR';
    
    
    // Validate required fields
    if (!user_id) {
      throw new Error('User ID is required');
    }
    
    if (!equipment_ids || !Array.isArray(equipment_ids) || equipment_ids.length === 0) {
      throw new Error('At least one equipment/service must be selected');
    }
    
    // Calculate rental duration and price based on selected services if not provided
    const daysToUse = parseInt(rental_days) || 1;
    let calculatedTotalPrice = total_price || 0;
    const equipmentDetails = {};
    
    if (equipment_ids && equipment_ids.length > 0) {
      for (const equipmentId of equipment_ids) {
        const serviceResult = await client.query(
          'SELECT id, name, duration, price, currency, category, description, image_url, service_type FROM services WHERE id = $1',
          [equipmentId]
        );
        
        if (serviceResult.rows.length > 0) {
          const service = serviceResult.rows[0];
          const servicePrice = parseFloat(service.price) || 0;
          
          if (!total_price) {
            calculatedTotalPrice += servicePrice * daysToUse;
          }
          
          equipmentDetails[equipmentId] = {
            id: service.id,
            name: service.name,
            category: service.category,
            price: servicePrice,
            currency: service.currency,
            description: service.description,
            duration: service.duration,
            imageUrl: service.image_url,
            serviceType: service.service_type
          };
        }
      }
    }
    
    // Use provided dates or default to current day
    const rentalStartDate = start_date || new Date().toISOString();
    const rentalEndDate = end_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const rentalDateFormatted = rental_date || new Date().toISOString().split('T')[0];
    
    // Track package usage
    let usedPackageId = null;
    let finalPaymentStatus = payment_status;
    let skipWalletCharge = false;

    // Payment method routing (credit card / pay later / wallet)
    if (payment_method === 'credit_card') {
      finalPaymentStatus = 'pending_payment';
      skipWalletCharge = true;
    } else if (payment_method === 'pay_later') {
      finalPaymentStatus = 'unpaid';
      skipWalletCharge = true;
    }
    
    // Handle package-based rental
    if (use_package && customer_package_id && user_id) {
      // Verify package belongs to user and has enough rental days
      const packageCheck = await client.query(`
        SELECT id, customer_id, package_name, rental_days_remaining, rental_days_used, rental_days_total,
               includes_rental, status
        FROM customer_packages 
        WHERE id = $1 
          AND customer_id = $2 
          AND status = 'active'
          AND includes_rental = true
          AND rental_days_remaining >= $3
      `, [customer_package_id, user_id, daysToUse]);
      
      if (packageCheck.rows.length === 0) {
        // Check if package exists but doesn't have enough days
        const fallbackCheck = await client.query(`
          SELECT rental_days_remaining, includes_rental, status FROM customer_packages 
          WHERE id = $1 AND customer_id = $2
        `, [customer_package_id, user_id]);
        
        if (fallbackCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Package not found or does not belong to this customer' });
        }
        
        const pkg = fallbackCheck.rows[0];
        if (!pkg.includes_rental) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'This package does not include rental days' });
        }
        if (pkg.status !== 'active') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'This package is no longer active' });
        }
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient rental days. Only ${pkg.rental_days_remaining || 0} days remaining, but ${daysToUse} required.` 
        });
      }
      
      const packageToUse = packageCheck.rows[0];
      const currentUsed = parseInt(packageToUse.rental_days_used) || 0;
      const currentRemaining = parseInt(packageToUse.rental_days_remaining) || 0;
      const newUsedDays = currentUsed + daysToUse;
      const newRemainingDays = currentRemaining - daysToUse;
      
      // Get remaining hours and accommodation to check if fully used
      const fullPackageCheck = await client.query(
        'SELECT remaining_hours, accommodation_nights_remaining FROM customer_packages WHERE id = $1',
        [customer_package_id]
      );
      const lessonHoursRemaining = parseFloat(fullPackageCheck.rows[0]?.remaining_hours) || 0;
      const accommodationNightsRemaining = parseInt(fullPackageCheck.rows[0]?.accommodation_nights_remaining) || 0;
      const isFullyUsed = lessonHoursRemaining <= 0 && newRemainingDays <= 0 && accommodationNightsRemaining <= 0;
      const newStatus = isFullyUsed ? 'used_up' : 'active';
      
      // Update the package
      const packageUpdateResult = await client.query(`
        UPDATE customer_packages 
        SET rental_days_used = $1, 
            rental_days_remaining = $2,
            last_used_date = $3,
            status = $4,
            updated_at = NOW()
        WHERE id = $5 AND status = 'active' AND rental_days_remaining >= $6
        RETURNING id, package_name, rental_days_used, rental_days_remaining
      `, [newUsedDays, newRemainingDays, rentalDateFormatted, newStatus, customer_package_id, daysToUse]);
      
      if (packageUpdateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Package update failed. It may have been modified by another user or no longer has sufficient days.'
        });
      }
      
      
      usedPackageId = customer_package_id;
      finalPaymentStatus = 'package';
      skipWalletCharge = true;
      calculatedTotalPrice = 0; // No charge when using package
    }
    
    // Create the rental record with all the new fields
    const rentalResult = await client.query(
      `INSERT INTO rentals (
        user_id, 
        equipment_ids, 
        rental_date,
        start_date, 
        end_date, 
        status, 
        total_price, 
        payment_status,
        equipment_details,
        notes,
        created_by,
        family_member_id,
        participant_type,
        customer_package_id
      ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14) RETURNING *`,
      [
        user_id, 
        JSON.stringify(equipment_ids),
        rentalDateFormatted,
        rentalStartDate, 
        rentalEndDate, 
        status, 
        calculatedTotalPrice, 
        finalPaymentStatus,
        JSON.stringify(equipmentDetails),
        notes,
        actorId || null,
        family_member_id || null,
        (family_member_id ? 'family_member' : 'self'),
        usedPackageId
      ]
    );
    
    const rental = rentalResult.rows[0];
    
    // CREATE FINANCIAL TRANSACTION FOR RENTAL CHARGE (skip if using package)
    if (calculatedTotalPrice > 0 && !skipWalletCharge) {
      const equipmentNames = Object.values(equipmentDetails).map(item => item.name).join(', ');
      const description = `Rental charge: ${equipmentNames} (${rentalDateFormatted})`;
      let walletChargeSucceeded = false;

      // Resolve which wallet currency to debit from (user may have TRY, EUR, etc.)
      let chargeCurrency = storageCurrency;
      let chargeAmount = calculatedTotalPrice;

      const allBalances = await getAllBalances(user_id);
      const eurBalance = allBalances.find(b => b.currency === 'EUR');
      const eurAvailable = eurBalance?.available || 0;

      if (eurAvailable < calculatedTotalPrice && !allowNegativeBalance) {
        // EUR balance insufficient — find another currency the user can afford
        const sorted = allBalances
          .filter(b => b.available > 0 && b.currency !== 'EUR')
          .sort((a, b) => b.available - a.available);

        for (const bal of sorted) {
          try {
            const priceInWalletCurrency = await CurrencyService.convertCurrency(
              calculatedTotalPrice, storageCurrency, bal.currency
            );
            if (priceInWalletCurrency > 0 && bal.available >= priceInWalletCurrency) {
              chargeCurrency = bal.currency;
              chargeAmount = Math.round(priceInWalletCurrency * 100) / 100;
              break;
            }
          } catch (convErr) {
            logger.warn('Failed to convert rental price to wallet currency', {
              rentalId: rental.id, fromCurrency: storageCurrency,
              toWalletCurrency: bal.currency, error: convErr.message
            });
          }
        }
      }

      try {
        await recordLegacyTransaction({
          client,
          userId: user_id,
          amount: -Math.abs(chargeAmount),
          transactionType: 'rental_charge',
          status: 'completed',
          direction: 'debit',
          description,
          currency: chargeCurrency,
          metadata:
            {
              equipmentIds: equipment_ids,
              equipmentDetails,
              rentalDate: rentalDateFormatted,
              rentalStartDate,
              rentalEndDate,
              source: 'rentals:create',
              inputCurrency // Track original input currency for audit
            },
          entityType: 'rental',
          relatedEntityType: 'rental',
          relatedEntityId: rental.id,
          rentalId: rental.id,
          createdBy: actorId || null,
          allowNegative: allowNegativeBalance
        });
        walletChargeSucceeded = true;
      } catch (walletError) {
        const isInsufficientBalance =
          typeof walletError?.message === 'string' && walletError.message.includes('Insufficient wallet balance');

        if (isInsufficientBalance) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Insufficient wallet balance',
            message: 'Your wallet balance is too low. Please top up your wallet or choose a different payment method.'
          });
        } else {
          logger.error('Failed to record rental charge in wallet ledger', {
            rentalId: rental.id,
            userId: user_id,
            amount: chargeAmount,
            error: walletError?.message
          });
          throw walletError;
        }
      }

      // Update rental payment status to paid since we charged immediately
      if (walletChargeSucceeded) {
        await client.query(
          'UPDATE rentals SET payment_status = $1, updated_at = NOW() WHERE id = $2',
          ['paid', rental.id]
        );
      }
    }
    
    // Also create records in rental_equipment table for compatibility
    for (const equipmentId of equipment_ids) {
      const equipmentInfo = equipmentDetails[equipmentId];
      if (equipmentInfo) {
        await client.query(
          'INSERT INTO rental_equipment (rental_id, equipment_id, daily_rate, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [rental.id, equipmentId, equipmentInfo.price || 0, actorId || null]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Fetch the complete rental data with enriched equipment info
    const { rows } = await pool.query(
      `SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration,
              'description', s.description,
              'imageUrl', s.image_url,
              'category', s.category
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.id = $1
      GROUP BY r.id, u.name, u.email, creator.name`,
      [rental.id]
    );
    const completeRental = rows[0];
    
    // Broadcast real-time event for rental creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:created', completeRental);
      } catch (socketError) {
        logger.error('Error broadcasting rental creation:', socketError);
      }
    }

    // Send rental notifications (customer + staff)
    try {
      await bookingNotificationService.sendRentalCreated({ rentalId: rental.id });
    } catch (notifError) {
      logger.warn('Failed to dispatch rental notifications', {
        rentalId: rental.id,
        error: notifError?.message
      });
    }

    // For credit card payments, create a deposit record and initiate Iyzico checkout
    const response = { ...completeRental };
    if (payment_method === 'credit_card' && calculatedTotalPrice > 0) {
      try {
        // Use the customer's preferred currency for Iyzico (e.g. TRY)
        // Iyzico can't charge EUR from a TRY card — must match user's currency
        const userRow = await pool.query(
          'SELECT preferred_currency FROM users WHERE id = $1',
          [user_id]
        );
        const userCurrency = userRow.rows[0]?.preferred_currency || inputCurrency || 'EUR';

        // Convert EUR price to user's currency so Iyzico charges in their currency
        let chargeAmount = calculatedTotalPrice;
        if (userCurrency !== storageCurrency) {
          try {
            chargeAmount = await CurrencyService.convertCurrency(calculatedTotalPrice, storageCurrency, userCurrency);
          } catch (convErr) {
            logger.warn('Currency conversion failed, falling back to EUR', { error: convErr.message });
            // Fall back to EUR if conversion fails
          }
        }

        const depositResult = await createDepositRequest({
          userId: user_id,
          amount: chargeAmount,
          currency: userCurrency,
          method: 'card',
          gateway: 'iyzico',
          metadata: { type: 'rental_payment', rentalId: rental.id, storageCurrency, storageAmount: calculatedTotalPrice },
          referenceCode: `RNT-${rental.id}`,
          clientIp: req.ip,
          initiatedBy: actorId || user_id,
        });

        response.depositId = depositResult.deposit?.id;
        response.paymentPageUrl = depositResult.gatewaySession?.paymentPageUrl;

      } catch (iyzicoErr) {
        logger.error('Failed to initiate Iyzico checkout for rental', {
          rentalId: rental.id,
          error: iyzicoErr.message,
        });
        await pool.query(
          'UPDATE rentals SET payment_status = $1, updated_at = NOW() WHERE id = $2',
          ['failed', rental.id]
        );
        return res.status(500).json({
          error: 'payment_initiation_failed',
          message: 'Rental was created but payment could not be initiated. Please try again.',
          rentalId: rental.id,
        });
      }
    }
    
    res.status(201).json(response);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating rental:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Update a rental
 */
router.put('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheInvalidationMiddleware(RENTAL_CACHE_PATTERNS), async (req, res) => {
  const { id } = req.params;
  const {
    customer_id,
    equipment_ids,
    status,
    notes,
    rental_date,
    total_price
  } = req.body;

  const parsedTotalPrice =
    total_price == null || total_price === '' ? null : Number(total_price);
  if (parsedTotalPrice !== null && !(Number.isFinite(parsedTotalPrice) && parsedTotalPrice >= 0)) {
    return res.status(400).json({ error: 'Invalid total price' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);

    const currentRentalResult = await client.query(
      'SELECT * FROM rentals WHERE id = $1',
      [id]
    );

    if (currentRentalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental not found' });
    }

    const existingRental = currentRentalResult.rows[0];

    const finalUserId = customer_id || existingRental.user_id;
    if (!finalUserId) {
      throw new Error('Customer ID is missing or invalid.');
    }

    const rentalDate = rental_date ? new Date(rental_date) : (existingRental.start_date ? new Date(existingRental.start_date) : new Date());
    const rentalDateFormatted = rentalDate.toISOString().split('T')[0];

    const finalStatus = status || existingRental.status;
    const finalNotes = notes !== undefined ? notes : existingRental.notes;
    const finalEquipmentIds = equipment_ids || existingRental.equipment_ids || [];
    const finalTotalPrice = parsedTotalPrice !== null ? parsedTotalPrice : existingRental.total_price;

    // participant_type uses values ('self' | 'family_member') that don't
    // correspond to the drawer's 'single' | 'multiple' modes, so we preserve
    // the existing value instead of overwriting it from the request body.
    const rentalResult = await client.query(
      `UPDATE rentals
       SET
         user_id = $1,
         status = $2,
         notes = $3,
         updated_at = NOW(),
         equipment_ids = $4::jsonb,
         rental_date = $5,
         total_price = $6
       WHERE id = $7 RETURNING *`,
      [finalUserId, finalStatus, finalNotes, JSON.stringify(finalEquipmentIds), rentalDateFormatted, finalTotalPrice, id]
    );

    const updatedRental = rentalResult.rows[0];

    // Also update rental_equipment join table for compatibility
    // Only update if equipment_ids were actually provided in the request
    if (equipment_ids && equipment_ids.length > 0) {
      const prices = await client.query(
        'SELECT id, price FROM services WHERE id = ANY($1::uuid[])',
        [equipment_ids]
      );
      const priceMap = new Map(prices.rows.map((r) => [r.id, parseFloat(r.price) || 0]));
      await client.query('DELETE FROM rental_equipment WHERE rental_id = $1', [id]);
      for (const equipmentId of equipment_ids) {
        await client.query(
          'INSERT INTO rental_equipment (rental_id, equipment_id, daily_rate, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [id, equipmentId, priceMap.get(equipmentId) || 0, actorId || null]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Fetch the complete updated rental data for the response
    const { rows } = await pool.query(
      `SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
        u.phone as customer_phone,
        creator.name as created_by_name,
        COALESCE(
          json_object_agg(
            s.id, json_build_object(
              'id', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate,
              'duration', s.duration,
              'description', s.description,
              'imageUrl', s.image_url,
              'category', s.category
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '{}'::json
        ) as equipment_details,
        array_agg(s.id) FILTER (WHERE s.id IS NOT NULL) as equipment_ids
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users creator ON r.created_by = creator.id
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.id = $1
      GROUP BY r.id, u.name, u.email, u.phone, creator.name`,
      [id]
    );
    const completeRental = rows[0];

    // Broadcast real-time event for rental update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:updated', completeRental);
      } catch (socketError) {
        logger.error('Error broadcasting rental update:', socketError);
      }
    }

    // If this edit transitioned the rental into an earning state
    // (pending → active | completed), record the manager commission.
    // recordRentalCommission() is idempotent so this is safe even if the
    // status was already active/completed.
    const prevStatus = existingRental.status;
    const newStatus = completeRental.status;
    if (prevStatus !== newStatus && (newStatus === 'active' || newStatus === 'completed')) {
      await safeRecordRentalCommission(completeRental, `put:${prevStatus}->${newStatus}`);
    }

    res.json(completeRental);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating rental:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Delete a rental
 */
router.delete('/:id', authenticateJWT, authorizeRoles(['admin']), cacheInvalidationMiddleware(RENTAL_CACHE_PATTERNS), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    const { id } = req.params;

    const result = await forceDeleteRental({
      client,
      rentalId: id,
      actorId,
      issueRefund: true,
      includeWalletSummary: false
    });

    await client.query('COMMIT');

    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:deleted', {
          id,
          refunded: result.refundDetails.refundIssued
        });
      } catch (socketError) {
        // Silent error for socket broadcasting
      }
    }

    res.json({
      message: 'Rental deleted successfully',
      rental: result.rental,
      refunded: result.refundDetails.refundIssued,
      refundDetails: result.refundDetails,
      cleanup: result.cleanup
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Get all active rentals
 * Returns rentals with status 'active'
 */
router.get('/active', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rentals WHERE status = 'active'");
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching active rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all upcoming rentals
 * Returns rentals with status 'upcoming'
 */
router.get('/upcoming', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rentals WHERE status = 'upcoming'");
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching upcoming rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all overdue rentals
 * Returns rentals with status 'overdue'
 */
router.get('/overdue', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rentals WHERE status = 'overdue'");
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching overdue rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all completed rentals
 * Returns rentals with status 'completed'
 */
router.get('/completed', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rentals WHERE status = 'completed'");
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching completed rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark a rental as activated (approve a pending rental)
 */
router.patch('/:id/activate', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE rentals SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const rental = result.rows[0];

    // Record manager commission on approval — at this point the customer is
    // committed and payment has been captured, so the commission is earned.
    // If the rental is later cancelled, cancelCommission() reverses it.
    await safeRecordRentalCommission(rental, 'activate');
    
    // Broadcast real-time event for rental activation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:activated', rental);
      } catch (socketError) {
        logger.error('Error broadcasting rental activation:', socketError);
      }
    }
    
    // Notify the student that their rental has been approved
    if (rental.user_id) {
      try {
        const equipmentLabel = rental.equipment_details
          ? Object.values(typeof rental.equipment_details === 'string' ? JSON.parse(rental.equipment_details) : rental.equipment_details)
              .map(e => e.name).filter(Boolean).join(', ') || 'Equipment'
          : 'Equipment';
        const rentalDate = rental.rental_date
          ? new Date(rental.rental_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : '';
        await dispatchNotification({
          userId: rental.user_id,
          type: 'rental_approved',
          title: 'Rental Approved',
          message: `Your rental of ${equipmentLabel}${rentalDate ? ` on ${rentalDate}` : ''} has been approved!`,
          data: { rentalId: rental.id, link: '/student/my-rentals' },
        });
        // Emit real-time notification
        if (req.socketService) {
          req.socketService.emitToChannel(`user:${rental.user_id}`, 'notification:new', {
            notification: {
              user_id: rental.user_id,
              title: 'Rental Approved',
              message: `Your rental of ${equipmentLabel}${rentalDate ? ` on ${rentalDate}` : ''} has been approved!`,
              type: 'rental_approved',
              data: { rentalId: rental.id, link: '/student/my-rentals' },
              created_at: new Date().toISOString(),
            },
          });
        }
      } catch (notifErr) {
        logger.warn('Failed to send rental approval notification', { rentalId: id, error: notifErr?.message });
      }
    }
    
    res.json(rental);
  } catch (error) {
    logger.error('Error activating rental:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark a rental as completed
 */
router.patch('/:id/complete', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE rentals SET status = 'completed', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    
    // Broadcast real-time event for rental completion
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:completed', result.rows[0]);
      } catch (socketError) {
        logger.error('Error broadcasting rental completion:', socketError);
      }
    }
    
    const completed = result.rows[0];

    // Fire-and-forget rental snapshot
    try {
      const { writeRentalSnapshot } = await import('../services/revenueSnapshotService.js');
      writeRentalSnapshot(completed).catch(() => {});
    } catch {}

    // Record manager commission — safe (idempotent) if already recorded on activate.
    await safeRecordRentalCommission(completed, 'complete');

    res.json(completed);
  } catch (error) {
    logger.error('Error completing rental:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark a rental as cancelled (decline a pending rental or cancel an active one)
 */
router.patch('/:id/cancel', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    
    // Fetch current rental before updating
    const currentResult = await client.query('SELECT * FROM rentals WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental not found' });
    }
    const rental = currentResult.rows[0];
    const wasPending = rental.status === 'pending';
    
    // Update status
    const result = await client.query(
      `UPDATE rentals SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    const cancelledRental = result.rows[0];
    
    // Refund wallet if the rental was charged (pending or active with paid status)
    const chargedAmount = parseFloat(rental.total_price) || 0;
    if (chargedAmount > 0 && rental.user_id && rental.payment_status === 'paid' && !rental.customer_package_id) {
      try {
        await recordLegacyTransaction({
          client,
          userId: rental.user_id,
          amount: Math.abs(chargedAmount),
          transactionType: 'rental_cancelled_refund',
          status: 'completed',
          direction: 'credit',
          description: `Rental ${wasPending ? 'declined' : 'cancelled'} — refund`,
          metadata: { rentalId: rental.id, cancelledVia: 'admin_action' },
          entityType: 'rental',
          relatedEntityType: 'rental',
          relatedEntityId: rental.id,
          rentalId: rental.id,
          createdBy: req.user.id,
        });
        logger.info(`Refunded €${chargedAmount} for rental ${id} to user ${rental.user_id}`);
      } catch (refundErr) {
        logger.error('Failed to refund rental charge', { rentalId: id, error: refundErr?.message });
        throw refundErr;
      }
    }
    
    // Restore package rental days if package-based
    if (rental.customer_package_id) {
      const startMs = new Date(rental.start_date).getTime();
      const endMs = new Date(rental.end_date).getTime();
      const daysToRestore = Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
      try {
        await client.query(
          `UPDATE customer_packages
           SET rental_days_used = GREATEST(rental_days_used - $1, 0),
               rental_days_remaining = rental_days_remaining + $1,
               status = CASE WHEN status = 'used_up' THEN 'active' ELSE status END,
               updated_at = NOW()
           WHERE id = $2`,
          [daysToRestore, rental.customer_package_id]
        );
        logger.info(`Restored ${daysToRestore} rental day(s) to package ${rental.customer_package_id}`);
      } catch (pkgErr) {
        logger.error('Failed to restore package rental days', { rentalId: id, error: pkgErr?.message });
      }
    }
    
    await client.query('COMMIT');
    
    // Broadcast real-time event for rental cancellation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:cancelled', cancelledRental);
      } catch (socketError) {
        logger.error('Error broadcasting rental cancellation:', socketError);
      }
    }
    
    // Notify the student that their rental has been declined/cancelled
    if (rental.user_id) {
      try {
        const equipmentLabel = rental.equipment_details
          ? Object.values(typeof rental.equipment_details === 'string' ? JSON.parse(rental.equipment_details) : rental.equipment_details)
              .map(e => e.name).filter(Boolean).join(', ') || 'Equipment'
          : 'Equipment';
        const rentalDate = rental.rental_date
          ? new Date(rental.rental_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : '';
        const title = wasPending ? 'Rental Declined' : 'Rental Cancelled';
        const message = wasPending
          ? `Your rental of ${equipmentLabel}${rentalDate ? ` on ${rentalDate}` : ''} has been declined. Any charges have been refunded.`
          : `Your rental of ${equipmentLabel}${rentalDate ? ` on ${rentalDate}` : ''} has been cancelled.`;
        await dispatchNotification({
          userId: rental.user_id,
          type: 'rental_declined',
          title,
          message,
          data: { rentalId: rental.id, link: '/student/my-rentals' },
        });
        if (req.socketService) {
          req.socketService.emitToChannel(`user:${rental.user_id}`, 'notification:new', {
            notification: {
              user_id: rental.user_id,
              title,
              message,
              type: 'rental_declined',
              data: { rentalId: rental.id, link: '/student/my-rentals' },
              created_at: new Date().toISOString(),
            },
          });
        }
      } catch (notifErr) {
        logger.warn('Failed to send rental decline notification', { rentalId: id, error: notifErr?.message });
      }
    }

    // Fire-and-forget cancel manager commission
    try {
      const { cancelCommission } = await import('../services/managerCommissionService.js');
      cancelCommission('rental', id, 'Rental cancelled').catch((err) => {
        logger.error('Manager commission cancellation failed (non-blocking):', err.message);
      });
    } catch (commissionErr) {
      logger.error('Failed to import manager commission service:', commissionErr.message);
    }
    
    res.json(cancelledRental);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Error cancelling rental:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Mark a rental deposit as returned
 */
router.patch('/:id/deposit-returned', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE rentals SET deposit_returned = true, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error marking deposit as returned:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get rentals for a specific user with equipment details
 */
router.get('/user/:userId', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        r.id,
        r.user_id,
        r.start_date AS rental_date,
        r.end_date,
        r.total_price,
        r.status,
        r.payment_status,
        r.customer_package_id,
        r.notes,
        r.created_at,
        r.updated_at,
        EXTRACT(EPOCH FROM (r.end_date - r.start_date))/3600 as duration_hours,
        sp.package_daily_rate,
        COALESCE(
          json_agg(
            json_build_object(
              'id', s.id,
              'name', s.name,
              'service_type', s.service_type,
              'daily_rate', COALESCE(re.daily_rate, s.price),
              'duration', s.duration,
              'description', s.description,
              'category', s.category,
              'image_url', s.image_url
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '[]'::json
        ) as equipment
  FROM rentals r
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      LEFT JOIN customer_packages cp ON r.customer_package_id = cp.id
      LEFT JOIN service_packages sp ON cp.service_package_id = sp.id
  WHERE r.user_id = $1
      GROUP BY r.id, sp.package_daily_rate
  ORDER BY r.start_date DESC
    `;
    
    const { rows } = await pool.query(query, [userId]);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching user rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
