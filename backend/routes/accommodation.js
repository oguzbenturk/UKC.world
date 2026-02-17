import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ============================================================================
// ACCOMMODATION UNITS (ROOMS) CRUD
// ============================================================================

// List all accommodation units (public for browsing, with availability)
router.get('/units', async (req, res) => {
	try {
		const { status, type, checkIn, checkOut, guests, limit = 50, offset = 0 } = req.query;
		const params = [];
		let where = 'WHERE 1=1';
		
		if (status) {
			params.push(status);
			where += ` AND u.status = $${params.length}`;
		}
		if (type) {
			params.push(type);
			where += ` AND u.type = $${params.length}`;
		}
		if (guests) {
			params.push(parseInt(guests, 10));
			where += ` AND u.capacity >= $${params.length}`;
		}
		
		params.push(parseInt(limit, 10));
		params.push(parseInt(offset, 10));
		
		let query = `
			SELECT u.*,
				COALESCE(
					(SELECT json_agg(json_build_object(
						'id', b.id,
						'check_in_date', b.check_in_date,
						'check_out_date', b.check_out_date,
						'status', b.status
					))
					FROM accommodation_bookings b 
					WHERE b.unit_id = u.id 
					AND b.status NOT IN ('cancelled')
					AND b.check_out_date >= CURRENT_DATE
					), '[]'
				) as upcoming_bookings
			FROM accommodation_units u
			${where}
			ORDER BY u.name ASC
			LIMIT $${params.length - 1} OFFSET $${params.length}
		`;
		
		const { rows } = await pool.query(query, params);
		
		// If date range provided, filter out unavailable units
		let result = rows;
		if (checkIn && checkOut) {
			result = rows.filter(unit => {
				const bookings = unit.upcoming_bookings || [];
				return !bookings.some(b => {
					const bStart = new Date(b.check_in_date);
					const bEnd = new Date(b.check_out_date);
					const qStart = new Date(checkIn);
					const qEnd = new Date(checkOut);
					return bStart < qEnd && bEnd > qStart;
				});
			});
		}
		
		res.json(result);
	} catch (err) {
		res.status(500).json({ error: 'Failed to list accommodation units', details: err.message });
	}
});

// Get single unit by ID
router.get('/units/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const { rows } = await pool.query(
			`SELECT u.*,
				COALESCE(
					(SELECT json_agg(json_build_object(
						'id', b.id,
						'check_in_date', b.check_in_date,
						'check_out_date', b.check_out_date,
						'status', b.status,
						'guests_count', b.guests_count
					) ORDER BY b.check_in_date)
					FROM accommodation_bookings b 
					WHERE b.unit_id = u.id 
					AND b.status NOT IN ('cancelled')
					), '[]'
				) as bookings
			FROM accommodation_units u
			WHERE u.id = $1`,
			[id]
		);
		if (rows.length === 0) {
			return res.status(404).json({ error: 'Accommodation unit not found' });
		}
		res.json(rows[0]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to get accommodation unit', details: err.message });
	}
});

// Create new accommodation unit (admin/manager only)
router.post('/units', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	try {
		const { 
			name, 
			type, 
			capacity, 
			price_per_night, 
			description, 
			amenities,
			status = 'Available',
			image_url,
			images
		} = req.body;
		
		if (!name || !type || !capacity || !price_per_night) {
			return res.status(400).json({ error: 'Name, type, capacity, and price_per_night are required' });
		}
		
		const id = uuidv4();
		const { rows } = await pool.query(
			`INSERT INTO accommodation_units 
			(id, name, type, capacity, price_per_night, description, amenities, status, image_url, images, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
			RETURNING *`,
			[id, name, type, parseInt(capacity, 10), parseFloat(price_per_night), description || null, 
			 amenities ? JSON.stringify(amenities) : null, status, image_url || null,
			 images ? JSON.stringify(images) : '[]']
		);
		
		res.status(201).json(rows[0]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to create accommodation unit', details: err.message });
	}
});

// Update accommodation unit
router.put('/units/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	try {
		const { id } = req.params;
		const { name, type, capacity, price_per_night, description, amenities, status, image_url, images } = req.body;
		
		const updates = [];
		const params = [];
		let paramIndex = 1;
		
		if (name !== undefined) { updates.push(`name = $${paramIndex++}`); params.push(name); }
		if (type !== undefined) { updates.push(`type = $${paramIndex++}`); params.push(type); }
		if (capacity !== undefined) { updates.push(`capacity = $${paramIndex++}`); params.push(parseInt(capacity, 10)); }
		if (price_per_night !== undefined) { updates.push(`price_per_night = $${paramIndex++}`); params.push(parseFloat(price_per_night)); }
		if (description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(description); }
		if (amenities !== undefined) { updates.push(`amenities = $${paramIndex++}`); params.push(JSON.stringify(amenities)); }
		if (status !== undefined) { updates.push(`status = $${paramIndex++}`); params.push(status); }
		if (image_url !== undefined) { updates.push(`image_url = $${paramIndex++}`); params.push(image_url); }
		if (images !== undefined) { updates.push(`images = $${paramIndex++}`); params.push(JSON.stringify(images)); }
		
		if (updates.length === 0) {
			return res.status(400).json({ error: 'No fields to update' });
		}
		
		updates.push(`updated_at = NOW()`);
		params.push(id);
		
		const { rows } = await pool.query(
			`UPDATE accommodation_units SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
			params
		);
		
		if (rows.length === 0) {
			return res.status(404).json({ error: 'Accommodation unit not found' });
		}
		
		res.json(rows[0]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to update accommodation unit', details: err.message });
	}
});

// Delete accommodation unit
router.delete('/units/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { id } = req.params;
		
		// Check for active bookings
		const bookings = await client.query(
			`SELECT COUNT(*) FROM accommodation_bookings WHERE unit_id = $1 AND status NOT IN ('cancelled', 'completed')`,
			[id]
		);
		
		if (parseInt(bookings.rows[0].count, 10) > 0) {
			await client.query('ROLLBACK');
			return res.status(400).json({ error: 'Cannot delete unit with active bookings' });
		}
		
		// Delete all associated bookings (cancelled/completed) first to avoid FK constraint
		await client.query(
			`DELETE FROM accommodation_bookings WHERE unit_id = $1`,
			[id]
		);
		
		const { rowCount } = await client.query(
			`DELETE FROM accommodation_units WHERE id = $1`,
			[id]
		);
		
		if (rowCount === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Accommodation unit not found' });
		}
		
		await client.query('COMMIT');
		res.json({ success: true, message: 'Accommodation unit deleted' });
	} catch (err) {
		await client.query('ROLLBACK');
		res.status(500).json({ error: 'Failed to delete accommodation unit', details: err.message });
	} finally {
		client.release();
	}
});

// Get unit types for dropdown
router.get('/unit-types', async (req, res) => {
	try {
		const { rows } = await pool.query(
			`SELECT DISTINCT type FROM accommodation_units ORDER BY type`
		);
		const defaultTypes = ['Room', 'Suite', 'Apartment', 'Villa', 'Bungalow', 'Cabin'];
		const existingTypes = rows.map(r => r.type);
		const allTypes = [...new Set([...defaultTypes, ...existingTypes])].sort();
		res.json(allTypes);
	} catch (err) {
		res.status(500).json({ error: 'Failed to get unit types', details: err.message });
	}
});

// ============================================================================
// ACCOMMODATION BOOKINGS
// ============================================================================

// List accommodation bookings with optional status filter
router.get('/bookings', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	try {
		const { status, limit = 50, offset = 0, startDate, endDate } = req.query;
		const params = [];
		let where = 'WHERE 1=1';
		if (status) {
			params.push(status);
			where += ` AND ab.status = $${params.length}`;
		}
		if (startDate) {
			params.push(startDate);
			where += ` AND ab.check_in_date >= $${params.length}`;
		}
		if (endDate) {
			params.push(endDate);
			where += ` AND ab.check_out_date <= $${params.length}`;
		}
		params.push(parseInt(limit, 10));
		params.push(parseInt(offset, 10));
		const { rows } = await pool.query(
			`SELECT 
				ab.*,
				u.name as guest_name,
				u.email as guest_email,
				au.name as unit_name,
				au.type as unit_type
			 FROM accommodation_bookings ab
			 LEFT JOIN users u ON ab.guest_id = u.id
			 LEFT JOIN accommodation_units au ON ab.unit_id = au.id
			 ${where}
			 ORDER BY ab.check_in_date DESC
			 LIMIT $${params.length - 1} OFFSET $${params.length}`,
			params
		);
		res.json(rows);
	} catch (err) {
		res.status(500).json({ error: 'Failed to list accommodation bookings', details: err.message });
	}
});

// Mark an accommodation booking as completed and write snapshot
router.patch('/bookings/:id/complete', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { id } = req.params;
		const upd = await client.query(
			`UPDATE accommodation_bookings
			 SET status = 'completed', updated_at = NOW()
			 WHERE id = $1
			 RETURNING *`,
			[id]
		);
		if (upd.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Accommodation booking not found' });
		}
		const row = upd.rows[0];
		await client.query('COMMIT');

		// Fire-and-forget snapshot write
		try {
			const { writeAccommodationSnapshot } = await import('../services/revenueSnapshotService.js');
			const payload = {
				id: row.id,
				total_price: row.total_price,
				start_date: row.check_in_date,
				end_date: row.check_out_date,
				guests: row.guests_count,
				service_id: row.unit_id,
				payment_method: row.payment_method || null,
			};
			writeAccommodationSnapshot(payload).catch(() => {});
		} catch {
			// ignore
		}

		res.json(row);
	} catch (err) {
		await client.query('ROLLBACK');
		res.status(500).json({ error: 'Failed to complete accommodation booking', details: err.message });
	} finally {
		client.release();
	}
});

// Cancel a booking
router.patch('/bookings/:id/cancel', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	try {
		const { id } = req.params;
		const { rows } = await pool.query(
			`UPDATE accommodation_bookings SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
			[id]
		);
		if (rows.length === 0) return res.status(404).json({ error: 'Accommodation booking not found' });
		res.json(rows[0]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to cancel accommodation booking', details: err.message });
	}
});

// Create new accommodation booking (any authenticated user)
router.post('/bookings', authenticateJWT, async (req, res) => {
	const client = await pool.connect();
	try {
		   await client.query('BEGIN');
		   const { 
			   unit_id, 
			   check_in_date, 
			   check_out_date, 
			   guests_count = 1,
			   guest_id: requestedGuestId,
			   notes 
		   } = req.body;

		   // DEBUG LOG
		   console.log('[BOOKING] req.user:', req.user);
		   console.log('[BOOKING] requestedGuestId:', requestedGuestId);
		// Staff (admin, manager, front_desk) can book for any user
		// Regular users can only book for themselves
			 // Staff (admin, manager, front_desk) can book for any user
			 // Regular users can only book for themselves
			 const userRole = (req.user.user_role || req.user.role || '').toLowerCase().replace(/[-\s]+/g, '_').trim();
			 const isStaff = (
				 userRole === 'admin' ||
				 userRole === 'manager' ||
				 userRole.startsWith('front_desk')
			 );
			 const guest_id = (isStaff && requestedGuestId) ? requestedGuestId : req.user.id;
		
		if (!unit_id || !check_in_date || !check_out_date) {
			return res.status(400).json({ error: 'unit_id, check_in_date, and check_out_date are required' });
		}
		
		// Validate dates
		const checkIn = new Date(check_in_date);
		const checkOut = new Date(check_out_date);
		if (checkOut <= checkIn) {
			return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
		}
		
		// Get unit details and check availability
		const unit = await client.query(
			`SELECT * FROM accommodation_units WHERE id = $1`,
			[unit_id]
		);
		
		if (unit.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Accommodation unit not found' });
		}
		
		const unitData = unit.rows[0];
		
		if (unitData.status !== 'Available') {
			await client.query('ROLLBACK');
			return res.status(400).json({ error: 'Unit is not available' });
		}
		
		if (guests_count > unitData.capacity) {
			await client.query('ROLLBACK');
			return res.status(400).json({ error: `Unit capacity is ${unitData.capacity} guests` });
		}
		
		// Check for overlapping bookings
		const overlap = await client.query(
			`SELECT id FROM accommodation_bookings 
			 WHERE unit_id = $1 
			 AND status NOT IN ('cancelled')
			 AND (check_in_date, check_out_date) OVERLAPS ($2::date, $3::date)`,
			[unit_id, check_in_date, check_out_date]
		);
		
		if (overlap.rows.length > 0) {
			await client.query('ROLLBACK');
			return res.status(400).json({ error: 'Unit is not available for the selected dates' });
		}
		
		// Calculate total price
		const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
		const total_price = nights * parseFloat(unitData.price_per_night);
		
		// Create booking
		const id = uuidv4();
		const { rows } = await client.query(
			`INSERT INTO accommodation_bookings 
			(id, unit_id, guest_id, check_in_date, check_out_date, guests_count, total_price, status, notes, created_by, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, NOW(), NOW())
			RETURNING *`,
			[id, unit_id, guest_id, check_in_date, check_out_date, guests_count, total_price, notes || null, req.user.id]
		);
		
		await client.query('COMMIT');
		
		// Return booking with unit details
		const booking = rows[0];
		booking.unit = unitData;
		booking.nights = nights;
		
		res.status(201).json(booking);
	} catch (err) {
		await client.query('ROLLBACK');
		res.status(500).json({ error: 'Failed to create accommodation booking', details: err.message });
	} finally {
		client.release();
	}
});

// Get user's own bookings
router.get('/my-bookings', authenticateJWT, async (req, res) => {
	try {
		const guest_id = req.user.id;
		const { rows } = await pool.query(
			`SELECT b.*, 
				json_build_object(
					'id', u.id,
					'name', u.name,
					'type', u.type,
					'capacity', u.capacity,
					'amenities', u.amenities
				) as unit
			FROM accommodation_bookings b
			JOIN accommodation_units u ON b.unit_id = u.id
			WHERE b.guest_id = $1
			ORDER BY b.check_in_date DESC`,
			[guest_id]
		);
		res.json(rows);
	} catch (err) {
		res.status(500).json({ error: 'Failed to get bookings', details: err.message });
	}
});

// Confirm a pending booking (admin/manager)
router.patch('/bookings/:id/confirm', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	try {
		const { id } = req.params;
		const { rows } = await pool.query(
			`UPDATE accommodation_bookings SET status = 'confirmed', updated_by = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
			[id, req.user.id]
		);
		if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
		res.json(rows[0]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to confirm booking', details: err.message });
	}
});

// Get single booking by ID
router.get('/bookings/:id', authenticateJWT, async (req, res) => {
	try {
		const { id } = req.params;
		const { rows } = await pool.query(
			`SELECT b.*, 
				json_build_object(
					'id', u.id,
					'name', u.name,
					'type', u.type,
					'capacity', u.capacity,
					'price_per_night', u.price_per_night,
					'amenities', u.amenities,
					'description', u.description
				) as unit,
				json_build_object(
					'id', g.id,
					'name', g.name,
					'email', g.email,
					'phone', g.phone
				) as guest
			FROM accommodation_bookings b
			JOIN accommodation_units u ON b.unit_id = u.id
			LEFT JOIN users g ON b.guest_id = g.id
			WHERE b.id = $1`,
			[id]
		);
		if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
		
		// Check authorization - user can only see their own booking or admin/manager can see all
		const booking = rows[0];
		const isOwner = booking.guest_id === req.user.id;
		const isAdmin = ['admin', 'manager'].includes(req.user.role);
		
		if (!isOwner && !isAdmin) {
			return res.status(403).json({ error: 'Not authorized to view this booking' });
		}
		
		res.json(booking);
	} catch (err) {
		res.status(500).json({ error: 'Failed to get booking', details: err.message });
	}
});

// Delete a booking by ID (admin, manager, front_desk)
router.delete('/bookings/:id', authenticateJWT, async (req, res) => {
	try {
		const { id } = req.params;
		console.log('[ACCOMMODATION DELETE] user:', req.user?.id, 'role:', req.user?.role || req.user?.user_role);
		// Normalize role and determine staff
		const userRole = (req.user.user_role || req.user.role || '').toLowerCase().replace(/[-\s]+/g, '_').trim();
		const isStaff = (
			userRole === 'admin' ||
			userRole === 'manager' ||
			userRole.startsWith('front_desk')
		);
		const { rows } = await pool.query(
			`DELETE FROM accommodation_bookings WHERE id = $1 AND ($2 = TRUE OR created_by = $3) RETURNING *`,
			[id, isStaff, req.user.id]
		);
		if (rows.length === 0) {
			console.log('[ACCOMMODATION DELETE] not found or unauthorized', { id, isStaff, user: req.user.id });
			return res.status(404).json({ error: 'Booking not found or not authorized to delete' });
		}
		console.log('[ACCOMMODATION DELETE] deleted booking', rows[0].id);
		res.json({ success: true, deleted: rows[0] });
	} catch (err) {
		console.error('[ACCOMMODATION DELETE] error', err);
		res.status(500).json({ error: 'Failed to delete booking', details: err.message });
	}
});

export default router;
