// backend/routes/rentals.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { authenticateJWT } from './auth.js';
import { requireWaiver, checkFamilyMemberWaiver } from '../middlewares/waiverCheck.js';
import { resolveActorId } from '../utils/auditUtils.js';
import { recordLegacyTransaction } from '../services/walletService.js';
import { forceDeleteRental } from '../services/rentalCleanupService.js';

const router = Router();

/**
 * Get all rentals with enriched data
 */
// Instructors should not access rentals (UI hidden) – enforce 403 server-side
const ALLOW_ROLES_EXCEPT_INSTRUCTOR = ['admin', 'manager'];

router.get('/', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
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
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      GROUP BY r.id, u.name, u.email
      ORDER BY r.created_at DESC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get recent rentals with enriched data (limited)
 */
router.get('/recent', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
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
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      GROUP BY r.id, u.name, u.email
      ORDER BY r.created_at DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, [limit]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching recent rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all active rentals with enriched data
 */
router.get('/active', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
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
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'active'
      GROUP BY r.id, u.name, u.email
      ORDER BY r.created_at DESC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching active rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all upcoming rentals with enriched data
 */
router.get('/upcoming', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
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
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'upcoming'
      GROUP BY r.id, u.name, u.email
      ORDER BY r.start_date ASC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching upcoming rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all overdue rentals with enriched data
 */
router.get('/overdue', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
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
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'overdue'
      GROUP BY r.id, u.name, u.email
      ORDER BY r.end_date ASC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching overdue rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all completed rentals with enriched data
 */
router.get('/completed', authenticateJWT, authorizeRoles(ALLOW_ROLES_EXCEPT_INSTRUCTOR), async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.name as customer_name,
        u.email as customer_email,
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
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.status = 'completed'
      GROUP BY r.id, u.name, u.email
      ORDER BY r.end_date DESC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching completed rentals:', error);
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
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
      WHERE r.id = $1
      GROUP BY r.id, u.name, u.email, u.phone
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching rental:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a new rental
 */
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager']), requireWaiver, checkFamilyMemberWaiver, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
  const actorId = resolveActorId(req);
  const actorRoleRaw = req.user?.role;
  const actorRole = typeof actorRoleRaw === 'string' ? actorRoleRaw.toLowerCase() : null;
  const allowNegativeBalance = actorRole ? ['admin', 'manager', 'owner'].includes(actorRole) : false;
    
    const { 
      user_id, // Changed from customer_id to user_id to match frontend
      equipment_ids, 
      rental_date,
      status = 'active', // Changed default from 'upcoming' to 'active' 
      notes,
      start_date,
      end_date,
      total_price,
      payment_status = 'unpaid',
      family_member_id,
      currency: requestedCurrency
    } = req.body;
    
    // Storage currency is always EUR (base currency)
    // The requestedCurrency is tracked for audit purposes only
    const storageCurrency = 'EUR';
    const inputCurrency = requestedCurrency || 'EUR';
    
    console.log('Creating rental with data:', req.body);
    
    // Validate required fields
    if (!user_id) {
      throw new Error('User ID is required');
    }
    
    if (!equipment_ids || !Array.isArray(equipment_ids) || equipment_ids.length === 0) {
      throw new Error('At least one equipment/service must be selected');
    }
    
    // Calculate rental duration and price based on selected services if not provided
    let calculatedTotalPrice = total_price || 0;
    const equipmentDetails = {};
    
    if (equipment_ids && equipment_ids.length > 0) {
      for (const equipmentId of equipment_ids) {
        const serviceResult = await client.query(
          'SELECT id, name, duration, price, currency, category FROM services WHERE id = $1',
          [equipmentId]
        );
        
        if (serviceResult.rows.length > 0) {
          const service = serviceResult.rows[0];
          const servicePrice = parseFloat(service.price) || 0;
          
          if (!total_price) {
            calculatedTotalPrice += servicePrice;
          }
          
          equipmentDetails[equipmentId] = {
            id: service.id,
            name: service.name,
            category: service.category,
            price: servicePrice,
            currency: service.currency
          };
        }
      }
    }
    
    // Use provided dates or default to current day
    const rentalStartDate = start_date || new Date().toISOString();
    const rentalEndDate = end_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const rentalDateFormatted = rental_date || new Date().toISOString().split('T')[0];
    
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
        participant_type
      ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13) RETURNING *`,
      [
        user_id, 
        JSON.stringify(equipment_ids),
        rentalDateFormatted,
        rentalStartDate, 
        rentalEndDate, 
        status, 
        calculatedTotalPrice, 
        payment_status,
        JSON.stringify(equipmentDetails),
        notes,
        actorId || null,
        family_member_id || null,
        (family_member_id ? 'family_member' : 'self')
      ]
    );
    
    const rental = rentalResult.rows[0];
    
    // CREATE FINANCIAL TRANSACTION FOR RENTAL CHARGE
    if (calculatedTotalPrice > 0) {
      const equipmentNames = Object.values(equipmentDetails).map(item => item.name).join(', ');
      const description = `Rental charge: ${equipmentNames} (${rentalDateFormatted})`;
      let walletChargeSucceeded = false;

      try {
        await recordLegacyTransaction({
          client,
          userId: user_id,
          amount: -Math.abs(calculatedTotalPrice),
          transactionType: 'rental_charge',
          status: 'completed',
          direction: 'debit',
          description,
          currency: storageCurrency, // Always store in EUR
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
          console.warn('Skipping wallet charge due to insufficient balance', {
            rentalId: rental.id,
            userId: user_id,
            amount: calculatedTotalPrice
          });
        } else {
          console.error('Failed to record rental charge in wallet ledger', {
            rentalId: rental.id,
            userId: user_id,
            amount: calculatedTotalPrice,
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
    
    // Fetch the complete rental data using the rental_details view
    const { rows } = await client.query(
      'SELECT * FROM rental_details WHERE id = $1',
      [rental.id]
    );
    const completeRental = rows[0];
    
    // Broadcast real-time event for rental creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:created', completeRental);
      } catch (socketError) {
        console.error('Error broadcasting rental creation:', socketError);
      }
    }
    
    res.status(201).json(completeRental);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating rental:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Update a rental
 */
router.put('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    
    const { id } = req.params;
    const { 
      customer_id, 
      equipment_ids, 
      status, 
      notes,
      rental_date, // Use rental_date from frontend
      participant_type 
    } = req.body;

    console.log(`[PUT /rentals/${id}] Received payload:`, req.body);

    // Get current rental to preserve original start time if no new date is provided
    const currentRentalResult = await client.query(
      'SELECT * FROM rentals WHERE id = $1',
      [id]
    );
    
    if (currentRentalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental not found' });
    }

    const existingRental = currentRentalResult.rows[0];
    
    // Determine the correct user_id to update
    const finalUserId = customer_id || existingRental.user_id;
    if (!finalUserId) {
      throw new Error('Customer ID is missing or invalid.');
    }

    // Use the date from the form, fallback to existing, finally fallback to now
    const rentalDate = rental_date ? new Date(rental_date) : (existingRental.start_date ? new Date(existingRental.start_date) : new Date());
    const rentalDateFormatted = rentalDate.toISOString().split('T')[0];

    // Determine final values for other fields, preserving existing if not provided
    const finalStatus = status || existingRental.status;
    const finalNotes = notes !== undefined ? notes : existingRental.notes;
    const finalEquipmentIds = equipment_ids || existingRental.equipment_ids || [];
    const finalParticipantType = participant_type || existingRental.participant_type || 'single';

    // Update the rental record
    const rentalResult = await client.query(
      `UPDATE rentals 
       SET 
         user_id = $1, 
         status = $2, 
         notes = $3, 
         updated_at = NOW(),
         equipment_ids = $4::jsonb,
         rental_date = $5,
         participant_type = $6
       WHERE id = $7 RETURNING *`,
      [finalUserId, finalStatus, finalNotes, JSON.stringify(finalEquipmentIds), rentalDateFormatted, finalParticipantType, id]
    );

    const updatedRental = rentalResult.rows[0];

    // Also update rental_equipment join table for compatibility
    // Only update if equipment_ids were actually provided in the request
    if (equipment_ids && equipment_ids.length > 0) {
      await client.query('DELETE FROM rental_equipment WHERE rental_id = $1', [id]);
      for (const equipmentId of equipment_ids) {
        await client.query(
          'INSERT INTO rental_equipment (rental_id, equipment_id, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [id, equipmentId, actorId || null]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Fetch the complete updated rental data for the response
    const { rows } = await client.query(
      'SELECT * FROM rental_details WHERE id = $1',
      [id]
    );
    const completeRental = rows[0];

    // Broadcast real-time event for rental update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:updated', completeRental);
      } catch (socketError) {
        console.error('Error broadcasting rental update:', socketError);
      }
    }

    res.json(completeRental);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating rental:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Delete a rental
 */
router.delete('/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
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
    console.error('Error fetching active rentals:', error);
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
    console.error('Error fetching upcoming rentals:', error);
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
    console.error('Error fetching overdue rentals:', error);
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
    console.error('Error fetching completed rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark a rental as activated
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
    
    // Broadcast real-time event for rental activation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:activated', result.rows[0]);
      } catch (socketError) {
        console.error('Error broadcasting rental activation:', socketError);
      }
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error activating rental:', error);
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
        console.error('Error broadcasting rental completion:', socketError);
      }
    }
    
    const completed = result.rows[0];

    // Fire-and-forget rental snapshot
    try {
      const { writeRentalSnapshot } = await import('../services/revenueSnapshotService.js');
      writeRentalSnapshot(completed).catch(() => {});
    } catch {}

    // Fire-and-forget manager commission calculation
    try {
      const { recordRentalCommission } = await import('../services/managerCommissionService.js');
      recordRentalCommission(completed).catch((err) => {
        console.error('Manager commission calculation failed (non-blocking):', err.message);
      });
    } catch (commissionErr) {
      console.error('Failed to import manager commission service:', commissionErr.message);
    }

    res.json(completed);
  } catch (error) {
    console.error('Error completing rental:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark a rental as cancelled
 */
router.patch('/:id/cancel', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE rentals SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    
    // Broadcast real-time event for rental cancellation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'rental:cancelled', result.rows[0]);
      } catch (socketError) {
        console.error('Error broadcasting rental cancellation:', socketError);
      }
    }

    // Fire-and-forget cancel manager commission
    try {
      const { cancelCommission } = await import('../services/managerCommissionService.js');
      cancelCommission('rental', id, 'Rental cancelled').catch((err) => {
        console.error('Manager commission cancellation failed (non-blocking):', err.message);
      });
    } catch (commissionErr) {
      console.error('Failed to import manager commission service:', commissionErr.message);
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error cancelling rental:', error);
    res.status(500).json({ error: error.message });
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
    console.error('Error marking deposit as returned:', error);
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
        r.created_at,
        r.updated_at,
        EXTRACT(EPOCH FROM (r.end_date - r.start_date))/3600 as duration_hours,
        COALESCE(
          json_agg(
            json_build_object(
              'id', s.id,
              'name', s.name,
              'service_type', s.service_type,
              'daily_rate', COALESCE(re.daily_rate, s.price)
            )
          ) FILTER (WHERE s.id IS NOT NULL), 
          '[]'::json
        ) as equipment
  FROM rentals r
      LEFT JOIN rental_equipment re ON r.id = re.rental_id
      LEFT JOIN services s ON re.equipment_id = s.id
  WHERE r.user_id = $1
      GROUP BY r.id
  ORDER BY r.start_date DESC
    `;
    
    const { rows } = await pool.query(query, [userId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user rentals:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
