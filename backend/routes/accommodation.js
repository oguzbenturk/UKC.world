import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { v4 as uuidv4 } from 'uuid';
import { lockFundsForBooking, releaseLockedFunds, getBalance, recordLegacyTransaction } from '../services/walletService.js';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';
import { logger } from '../middlewares/errorHandler.js';
import CurrencyService from '../services/currencyService.js';
import { dispatchNotification, dispatchToStaff } from '../services/notificationDispatcherUnified.js';
import { cacheMiddleware, cacheInvalidationMiddleware } from '../middlewares/cache.js';

/**
 * Extract extended pricing metadata stored inside the amenities JSONB array.
 * Meta is stored as a string entry like `__meta__{"weekend_price":80,...}`.
 */
function extractUnitMeta(unitRow) {
	const amenities = unitRow.amenities;
	if (!Array.isArray(amenities)) return {};
	const entry = amenities.find(a => typeof a === 'string' && a.startsWith('__meta__'));
	if (!entry) return {};
	try { return JSON.parse(entry.slice(8)); } catch { return {}; }
}

/**
 * Calculate total accommodation price for a date range, accounting for
 * weekend pricing, holiday/special pricing, and length-of-stay discounts.
 */
function calculateTotalPrice(checkInDate, checkOutDate, basePrice, meta) {
	const oneDay = 24 * 60 * 60 * 1000;
	const nights = Math.ceil((checkOutDate - checkInDate) / oneDay);
	if (nights <= 0) return { total: 0, nights: 0, breakdown: [] };

	const weekendPrice = meta.weekend_price ? parseFloat(meta.weekend_price) : null;
	const holidays = Array.isArray(meta.holiday_pricing) ? meta.holiday_pricing : [];
	const discounts = Array.isArray(meta.custom_discounts) ? meta.custom_discounts : [];

	let subtotal = 0;
	const breakdown = [];

	for (let i = 0; i < nights; i++) {
		const nightDate = new Date(checkInDate.getTime() + i * oneDay);
		const dateStr = nightDate.toISOString().slice(0, 10);
		const dayOfWeek = nightDate.getDay(); // 0=Sun, 5=Fri, 6=Sat

		// Check holiday pricing first (highest priority)
		let price = basePrice;
		let reason = 'standard';

		const holidayMatch = holidays.find(h =>
			h.start_date && h.end_date && h.price_per_night &&
			dateStr >= h.start_date && dateStr <= h.end_date
		);
		if (holidayMatch) {
			price = parseFloat(holidayMatch.price_per_night);
			reason = 'holiday';
		} else if (weekendPrice && (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6)) {
			price = weekendPrice;
			reason = 'weekend';
		}

		subtotal += price;
		breakdown.push({ date: dateStr, price, reason });
	}

	// Apply length-of-stay discount (best matching)
	let appliedDiscount = null;
	if (discounts.length > 0) {
		const eligible = discounts
			.filter(d => d.min_nights && nights >= d.min_nights && d.discount_value > 0)
			.sort((a, b) => (b.min_nights || 0) - (a.min_nights || 0));
		if (eligible.length > 0) {
			appliedDiscount = eligible[0];
		}
	}

	let total = subtotal;
	if (appliedDiscount) {
		if (appliedDiscount.discount_type === 'percentage') {
			total = subtotal * (1 - appliedDiscount.discount_value / 100);
		} else {
			total = subtotal - (appliedDiscount.discount_value * nights);
		}
		total = Math.max(0, total);
	}

	return { total: Math.round(total * 100) / 100, nights, subtotal, appliedDiscount, breakdown };
}

const router = Router();

// ============================================================================
// ACCOMMODATION UNITS (ROOMS) CRUD
// ============================================================================

// List all accommodation units (public for browsing, with availability)
router.get('/units', cacheMiddleware(120), async (req, res) => {
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
					AND COALESCE(b.payment_status, '') NOT IN ('pending_payment', 'failed')
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
		res.status(500).json({ error: 'Failed to list accommodation units' });
	}
});

// Get single unit by ID
router.get('/units/:id', cacheMiddleware(300), async (req, res) => {
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
					AND b.status NOT IN ('cancelled')				AND COALESCE(b.payment_status, '') NOT IN ('pending_payment', 'failed')					), '[]'
				) as bookings
			FROM accommodation_units u
			WHERE u.id = $1`,
			[id]
		);
		if (rows.length === 0) {
			return res.status(404).json({ error: 'Accommodation unit not found' });
		}

		// Also fetch only upcoming bookings (for availability calendar)
		const { rows: bookingRows } = await pool.query(
			`SELECT id, check_in_date, check_out_date, status, guests_count
			 FROM accommodation_bookings
			 WHERE unit_id = $1
			   AND status NOT IN ('cancelled', 'completed')
			   AND COALESCE(payment_status, '') NOT IN ('pending_payment', 'failed')
			   AND check_out_date >= CURRENT_DATE
			 ORDER BY check_in_date`,
			[id]
		);

		const unit = rows[0];
		unit.upcoming_bookings = bookingRows;
		res.json(unit);
	} catch (err) {
		res.status(500).json({ error: 'Failed to get accommodation unit' });
	}
});

const accomCachePatterns = ['api:GET:/api/accommodation/units*'];

// Create new accommodation unit (admin/manager only)
router.post('/units', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheInvalidationMiddleware(accomCachePatterns), async (req, res) => {
	try {
		const { 
			name, 
			type,
			category = 'own',
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
			(id, name, type, category, capacity, price_per_night, description, amenities, status, image_url, images, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
			RETURNING *`,
			[id, name, type, category || 'own', parseInt(capacity, 10), parseFloat(price_per_night), description || null, 
			 amenities ? JSON.stringify(amenities) : null, status, image_url || null,
			 images ? JSON.stringify(images) : '[]']
		);
		
		res.status(201).json(rows[0]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to create accommodation unit' });
	}
});

// Update accommodation unit
router.put('/units/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheInvalidationMiddleware(accomCachePatterns), async (req, res) => {
	try {
		const { id } = req.params;
		const { name, type, category, capacity, price_per_night, description, amenities, status, image_url, images } = req.body;
		
		const updates = [];
		const params = [];
		let paramIndex = 1;
		
		if (name !== undefined) { updates.push(`name = $${paramIndex++}`); params.push(name); }
		if (type !== undefined) { updates.push(`type = $${paramIndex++}`); params.push(type); }
		if (category !== undefined) { updates.push(`category = $${paramIndex++}`); params.push(category); }
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
		res.status(500).json({ error: 'Failed to update accommodation unit' });
	}
});

// Delete accommodation unit
router.delete('/units/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheInvalidationMiddleware(accomCachePatterns), async (req, res) => {
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
		res.status(500).json({ error: 'Failed to delete accommodation unit' });
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
		res.status(500).json({ error: 'Failed to get unit types' });
	}
});

// ============================================================================
// ACCOMMODATION BOOKINGS
// ============================================================================

// List accommodation bookings with optional status filter
router.get('/bookings', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	try {
		const { status, limit = 50, offset = 0, startDate, endDate, guestId } = req.query;
		const params = [];
		let where = 'WHERE 1=1';
		if (guestId) {
			params.push(guestId);
			where += ` AND ab.guest_id = $${params.length}`;
		}
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
				u.phone as guest_phone,
				au.name as unit_name,
				au.type as unit_type,
				au.category as unit_category
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
		res.status(500).json({ error: 'Failed to list accommodation bookings' });
	}
});

// Package-based accommodation stays (from customer_packages with check-in dates)
// Returns stays that are stored in customer_packages but don't have a corresponding accommodation_bookings record.
router.get('/package-stays', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
	try {
		const { rows } = await pool.query(
			`SELECT
				cp.id,
				cp.accommodation_unit_id AS unit_id,
				cp.customer_id            AS guest_id,
				cp.check_in_date,
				cp.check_out_date,
				1                         AS guests_count,
				cp.purchase_price         AS total_price,
				cp.status,
				cp.notes,
				cp.purchase_date          AS created_at,
				cp.updated_at,
				cp.package_name,
				u.name                    AS guest_name,
				u.email                   AS guest_email,
				u.phone                   AS guest_phone,
				COALESCE(au.name, cp.accommodation_unit_name) AS unit_name,
				au.type                   AS unit_type,
				au.category               AS unit_category,
				'package'                 AS booking_source
			 FROM customer_packages cp
			 LEFT JOIN users u  ON u.id  = cp.customer_id
			 LEFT JOIN accommodation_units au ON au.id = cp.accommodation_unit_id
			 WHERE cp.check_in_date IS NOT NULL
			   AND cp.status NOT IN ('cancelled', 'pending_payment')
			   AND (cp.includes_accommodation = true OR COALESCE(cp.accommodation_nights_total, 0) > 0)
			   AND NOT EXISTS (
			       SELECT 1 FROM accommodation_bookings ab
			       WHERE ab.guest_id      = cp.customer_id
			         AND ab.check_in_date = cp.check_in_date
			         AND ab.unit_id       = cp.accommodation_unit_id
			         AND ab.status       != 'cancelled'
			   )
			 ORDER BY cp.check_in_date DESC`
		);
		res.json(rows);
	} catch (err) {
		res.status(500).json({ error: 'Failed to list package stays' });
	}
});

// Mark an accommodation booking as completed and write snapshot
router.patch('/bookings/:id/complete', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheInvalidationMiddleware(accomCachePatterns), async (req, res) => {
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

		// Fire-and-forget manager commission calculation
		try {
			const { recordAccommodationCommission } = await import('../services/managerCommissionService.js');
			recordAccommodationCommission(row).catch(() => {});
		} catch {
			// ignore
		}

		res.json(row);
	} catch (err) {
		await client.query('ROLLBACK');
		res.status(500).json({ error: 'Failed to complete accommodation booking' });
	} finally {
		client.release();
	}
});

// Cancel a booking — refund wallet if paid
router.patch('/bookings/:id/cancel', authenticateJWT, authorizeRoles(['admin', 'manager', 'student', 'outsider', 'trusted_customer']), cacheInvalidationMiddleware(accomCachePatterns), async (req, res) => {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { id } = req.params;

		// For non-staff users, verify they own the booking before cancelling
		const userRole = (req.user.user_role || req.user.role || '').toLowerCase().replace(/[-\s]+/g, '_').trim();
		const isStaff = ['admin', 'manager', 'super_admin', 'owner'].includes(userRole);

		if (!isStaff) {
			const ownershipCheck = await client.query(
				`SELECT id FROM accommodation_bookings WHERE id = $1 AND guest_id = $2 AND status NOT IN ('cancelled', 'completed')`,
				[id, req.user.id]
			);
			if (ownershipCheck.rows.length === 0) {
				await client.query('ROLLBACK');
				return res.status(403).json({ error: 'You can only cancel your own bookings' });
			}
		}

		const { rows } = await client.query(
			`UPDATE accommodation_bookings SET status = 'cancelled', updated_by = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
			[id, req.user.id]
		);
		if (rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Accommodation booking not found' });
		}
		
		const booking = rows[0];
		
		// Refund wallet if payment was made
		if (booking.payment_status === 'paid' && booking.guest_id) {
			const refundAmount = parseFloat(booking.payment_amount || booking.total_price);
			if (refundAmount > 0) {
				try {
					await releaseLockedFunds({
						userId: booking.guest_id,
						amount: refundAmount,
						bookingId: booking.id,
						currency: 'EUR',
						client,
						reason: 'release'
					});
					
					await client.query(
						`UPDATE accommodation_bookings SET payment_status = 'refunded' WHERE id = $1`,
						[id]
					);
					booking.payment_status = 'refunded';
					logger.info(`[ACCOMMODATION] Refunded EUR ${refundAmount.toFixed(2)} to guest ${booking.guest_id} for booking ${id}`);
				} catch (refundErr) {
					logger.error('[ACCOMMODATION] Refund failed:', refundErr);
					// Still cancel the booking, but log the refund failure
				}
			}
		}
		
		await client.query('COMMIT');
		res.json(booking);
	} catch (err) {
		await client.query('ROLLBACK');
		res.status(500).json({ error: 'Failed to cancel accommodation booking' });
	} finally {
		client.release();
	}
});

// Create new accommodation booking (any authenticated user)
router.post('/bookings', authenticateJWT, cacheInvalidationMiddleware(accomCachePatterns), async (req, res) => {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const {
			unit_id,
			check_in_date,
			check_out_date,
			guests_count = 1,
			guest_id: requestedGuestId,
			notes,
			payment_method = 'wallet', // 'wallet' | 'pay_later' | 'credit_card' | 'bank_transfer'
			deposit_percent,
			deposit_amount,
			receipt_url,
			bank_account_id,
			voucher_id,
			custom_price, // staff-only price override
		} = req.body;
		const isDeposit = !!(deposit_percent && deposit_amount);

		// Staff (admin, manager, front_desk) can book for any user
		// Regular users can only book for themselves
		const userRole = (req.user.user_role || req.user.role || '').toLowerCase().replace(/[-\s]+/g, '_').trim();
		const isStaff = (
			userRole === 'admin' ||
			userRole === 'manager' ||
			userRole.startsWith('front_desk')
		);
		const guest_id = (isStaff && requestedGuestId) ? requestedGuestId : req.user.id;

		// Only trusted customers / staff can use pay_later
		const PAY_LATER_ROLES = ['admin', 'manager', 'trusted_customer'];
		if (payment_method === 'pay_later' && !PAY_LATER_ROLES.includes(userRole)) {
			await client.query('ROLLBACK');
			return res.status(403).json({ error: 'Pay Later is only available for trusted customers.' });
		}

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

		// Check for overlapping bookings.
		// Exclude: cancelled, failed payments, and credit_card pending_payment (abandoned Iyzico sessions).
		// Bank transfer deposits with pending_payment MUST block the slot while awaiting admin approval.
		const overlap = await client.query(
			`SELECT id FROM accommodation_bookings
			 WHERE unit_id = $1
			 AND status NOT IN ('cancelled')
			 AND COALESCE(payment_status, '') != 'failed'
			 AND NOT (payment_method = 'credit_card' AND COALESCE(payment_status, '') = 'pending_payment')
			 AND (check_in_date, check_out_date) OVERLAPS ($2::date, $3::date)`,
			[unit_id, check_in_date, check_out_date]
		);

		if (overlap.rows.length > 0) {
			await client.query('ROLLBACK');
			return res.status(400).json({ error: 'Unit is not available for the selected dates' });
		}

		// Calculate total price with weekend/holiday/discount support
		const meta = extractUnitMeta(unitData);
		const basePrice = parseFloat(unitData.price_per_night);
		const priceCalc = calculateTotalPrice(checkIn, checkOut, basePrice, meta);
		const nights = priceCalc.nights;
		// Staff can override the calculated price via custom_price
		const total_price = (isStaff && custom_price != null && !isNaN(parseFloat(custom_price)))
			? parseFloat(custom_price)
			: priceCalc.total;

		const bookingId = uuidv4();
		let walletTxId = null;
		let paymentStatus = 'pending';

		if (payment_method === 'wallet') {
			// Deduct from guest's wallet (lock funds)
			try {
				const balance = await getBalance(guest_id, 'EUR');
				if ((balance?.available || 0) < total_price) {
					await client.query('ROLLBACK');
					return res.status(400).json({ error: `Insufficient wallet balance. Required: €${total_price.toFixed(2)}, Available: €${(balance?.available || 0).toFixed(2)}` });
				}

				const lockResult = await lockFundsForBooking({
					userId: guest_id,
					amount: total_price,
					bookingId,
					currency: 'EUR',
					client,
					description: `Accommodation booking: ${unitData.name || 'Unit'} (${nights} night${nights !== 1 ? 's' : ''})`
				});
				walletTxId = lockResult?.id || null;
				paymentStatus = 'paid';
			} catch (walletErr) {
				await client.query('ROLLBACK');
				logger.error('[ACCOMMODATION] Wallet deduction failed:', walletErr);
				if (walletErr.message?.includes('Insufficient')) {
					return res.status(400).json({ error: walletErr.message });
				}
				return res.status(500).json({ error: 'Failed to process payment from wallet', details: walletErr.message });
			}
		}
		// credit_card: no wallet deduction, payment_status set to pending_payment
		if (payment_method === 'credit_card') {
			paymentStatus = 'pending_payment';
		}
		// bank_transfer deposit: receipt already uploaded by frontend, awaiting admin approval
		if (payment_method === 'bank_transfer') {
			if (!isDeposit || !receipt_url || !bank_account_id) {
				await client.query('ROLLBACK');
				return res.status(400).json({ error: 'Bank transfer deposits require deposit_percent, deposit_amount, receipt_url, and bank_account_id.' });
			}
			paymentStatus = 'pending_payment';
		}
		// pay_later: no wallet deduction, payment_status stays 'pending'

		// Create booking
		const { rows } = await client.query(
			`INSERT INTO accommodation_bookings
			(id, unit_id, guest_id, check_in_date, check_out_date, guests_count, total_price, status, notes, created_by, payment_status, payment_method, wallet_transaction_id, payment_amount, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12, $7, NOW(), NOW())
			RETURNING *`,
			[bookingId, unit_id, guest_id, check_in_date, check_out_date, guests_count, total_price, notes || null, req.user.id, paymentStatus, payment_method, walletTxId]
		);

		// pay_later: record an accommodation_charge so the guest's wallet reflects what they owe
		if (payment_method === 'pay_later' && total_price > 0) {
			try {
				const tx = await recordLegacyTransaction({
					client,
					userId: guest_id,
					amount: -Math.abs(total_price),
					transactionType: 'accommodation_charge',
					status: 'completed',
					direction: 'debit',
					currency: 'EUR',
					description: `Accommodation charge: ${unitData.name || 'Unit'} (${nights} night${nights !== 1 ? 's' : ''})`,
					metadata: {
						accommodationBookingId: bookingId,
						unitId: unit_id,
						checkInDate: check_in_date,
						checkOutDate: check_out_date,
						nights,
						source: 'accommodation:create:pay_later'
					},
					entityType: 'accommodation_booking',
					relatedEntityType: 'accommodation_booking',
					relatedEntityId: bookingId,
					createdBy: req.user.id,
					allowNegative: true
				});
				await client.query(
					`UPDATE accommodation_bookings SET wallet_transaction_id = $1 WHERE id = $2`,
					[tx?.id || null, bookingId]
				);
			} catch (chargeErr) {
				await client.query('ROLLBACK');
				logger.error('[ACCOMMODATION] Failed to record pay_later charge:', chargeErr);
				return res.status(500).json({ error: 'Failed to record accommodation charge', details: chargeErr.message });
			}
		}

		// Insert bank_transfer_receipts record so it appears in pending payments
		if (payment_method === 'bank_transfer' && isDeposit) {
			const depositAmt = parseFloat(deposit_amount);
			const depositPct = parseInt(deposit_percent, 10);
			const remaining = parseFloat((total_price - depositAmt).toFixed(2));
			await client.query(
				`INSERT INTO bank_transfer_receipts
				(id, user_id, accommodation_booking_id, bank_account_id, receipt_url, amount, currency, status, admin_notes, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'EUR', 'pending', $6, NOW(), NOW())`,
				[
					guest_id,
					bookingId,
					bank_account_id,
					receipt_url,
					depositAmt,
					`DEPOSIT ${depositPct}% — Paid: €${depositAmt.toFixed(2)}, Remaining: €${remaining.toFixed(2)} due on arrival`,
				]
			);
		}

		await client.query('COMMIT');

		// Return booking with unit details
		const booking = rows[0];
		booking.unit = unitData;
		booking.nights = nights;

		// Helper function to dispatch accommodation booking notifications
		const dispatchAccommodationNotifications = async () => {
			try {
				// Notify staff about new accommodation booking
				await dispatchToStaff({
					type: 'accommodation_booking',
					title: 'New Accommodation Booking',
					message: `New accommodation booking for ${unitData.name || 'Unit'} from ${check_in_date} to ${check_out_date}`,
					data: {
						bookingId,
						unitId: unit_id,
						guestId: guest_id,
						checkInDate: check_in_date,
						checkOutDate: check_out_date,
						totalPrice: total_price,
						paymentMethod: payment_method,
						paymentStatus: paymentStatus,
						cta: { label: 'View Payment', href: `/calendars/lessons?tab=pending-payments` },
					bookingType: 'accommodation'
					},
					idempotencyPrefix: `accommodation-booking:${bookingId}`,
					excludeUserIds: []
				});

				// Notify guest about their booking confirmation
				await dispatchNotification({
					userId: guest_id,
					type: 'accommodation_booking',
					title: 'Accommodation Booking Confirmed',
					message: `Your booking for ${unitData.name || 'Unit'} has been confirmed for ${nights} night(s).`,
					data: {
						bookingId,
						unitId: unit_id,
						checkInDate: check_in_date,
						checkOutDate: check_out_date,
						totalPrice: total_price,
						nights,
						cta: { label: 'View Booking', href: `/bookings/accommodation/${bookingId}` }
					},
					idempotencyKey: `accommodation-booking:${bookingId}:guest:${guest_id}`
				});
			} catch (notifErr) {
				logger.warn('Failed to dispatch accommodation booking notifications', {
					bookingId, guestId: guest_id, error: notifErr.message
				});
				// Don't fail the booking if notifications fail
			}
		};

		// Emit socket event for bank_transfer deposits so pending payments tab updates in real-time
		if (payment_method === 'bank_transfer' && isDeposit) {
			req.socketService?.emitToChannel('dashboard', 'pending-accommodation-deposit:new', {
				bookingId,
				unitId: unit_id,
				guestId: guest_id,
			});
		}

		// For credit card payments, initiate Iyzico checkout
		if (payment_method === 'credit_card') {
			try {
				// Use deposit_amount for Iyzico when this is a deposit payment
				const chargeAmount = isDeposit ? parseFloat(deposit_amount) : total_price;
				// Convert to user's preferred currency so Iyzico shows the right amount
				let iyzicoAmount = chargeAmount;
				let iyzicoCurrency = 'EUR';
				try {
					const userRow = await pool.query('SELECT preferred_currency FROM users WHERE id = $1', [guest_id]);
					const userCurrency = userRow.rows[0]?.preferred_currency;
					if (userCurrency && userCurrency !== 'EUR') {
						const converted = await CurrencyService.convertCurrency(chargeAmount, 'EUR', userCurrency);
						if (converted > 0) {
							iyzicoAmount = converted;
							iyzicoCurrency = userCurrency;
						}
					}
				} catch (convErr) {
					logger.warn('Could not convert accommodation price to user currency for Iyzico, using EUR', {
						bookingId, error: convErr.message
					});
				}

				// Use the same call signature as wallet deposit (finances.js)
				const gatewayResult = await initiateDeposit({
					amount: iyzicoAmount,
					currency: iyzicoCurrency,
					userId: guest_id,
					referenceCode: `ACC-${bookingId}`,
					metadata: {
						source: 'accommodation_booking',
						bookingId,
						unitId: unit_id,
						userId: guest_id
					}
				});

				booking.paymentPageUrl = gatewayResult.paymentPageUrl;

				// Dispatch notifications before returning
				await dispatchAccommodationNotifications();

				return res.status(201).json(booking);
			} catch (iyzicoErr) {
				logger.error('Iyzico initiation failed for accommodation booking', { bookingId, error: iyzicoErr.message });
				await pool.query(`UPDATE accommodation_bookings SET payment_status = 'failed' WHERE id = $1`, [bookingId]);
				return res.status(500).json({ error: 'Failed to initiate card payment. Please try again or use wallet.' });
			}
		}

		// Dispatch notifications
		await dispatchAccommodationNotifications();

		res.status(201).json(booking);
	} catch (err) {
		await client.query('ROLLBACK');
		res.status(500).json({ error: 'Failed to create accommodation booking' });
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
		res.status(500).json({ error: 'Failed to get bookings' });
	}
});

// Confirm a pending booking (admin/manager)
router.patch('/bookings/:id/confirm', authenticateJWT, authorizeRoles(['admin', 'manager']), cacheInvalidationMiddleware(accomCachePatterns), async (req, res) => {
	try {
		const { id } = req.params;
		const { rows } = await pool.query(
			`UPDATE accommodation_bookings SET status = 'confirmed', updated_by = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
			[id, req.user.id]
		);
		if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

		// Fire-and-forget manager commission (duplicate guard prevents double-recording if also completed later)
		try {
			const { recordAccommodationCommission } = await import('../services/managerCommissionService.js');
			recordAccommodationCommission(rows[0]).catch(() => {});
		} catch { /* ignore */ }

		res.json(rows[0]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to confirm booking' });
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
		res.status(500).json({ error: 'Failed to get booking' });
	}
});

// Delete a booking by ID (admin, manager, front_desk)
router.delete('/bookings/:id', authenticateJWT, cacheInvalidationMiddleware(accomCachePatterns), async (req, res) => {
	try {
		const { id } = req.params;
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
			return res.status(404).json({ error: 'Booking not found or not authorized to delete' });
		}
		res.json({ success: true, deleted: rows[0] });
	} catch (err) {
		logger.error('[ACCOMMODATION DELETE] error', err);
		res.status(500).json({ error: 'Failed to delete booking' });
	}
});

// ── Admin: Pending Accommodation Deposits ────────────────────────────────────

router.get('/admin/pending-deposits', authenticateJWT, authorizeRoles(['admin', 'manager', 'owner']), async (req, res) => {
	try {
		const status = req.query.status || 'pending';
		const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
		const offset = parseInt(req.query.offset, 10) || 0;

		const { rows } = await pool.query(
			`SELECT
				r.id, r.accommodation_booking_id, r.bank_account_id, r.receipt_url,
				r.amount, r.currency, r.status, r.admin_notes, r.created_at, r.reviewed_at,
				u.first_name, u.last_name, u.email,
				ab.check_in_date, ab.check_out_date, ab.guests_count, ab.total_price,
				ab.payment_method, ab.payment_status, ab.notes as booking_notes,
				au.name as unit_name, au.type as unit_type,
				ba.bank_name, ba.iban
			 FROM bank_transfer_receipts r
			 JOIN users u ON r.user_id = u.id
			 JOIN accommodation_bookings ab ON r.accommodation_booking_id = ab.id
			 JOIN accommodation_units au ON ab.unit_id = au.id
			 LEFT JOIN wallet_bank_accounts ba ON r.bank_account_id = ba.id
			 WHERE r.accommodation_booking_id IS NOT NULL AND r.status = $1
			 ORDER BY r.created_at DESC
			 LIMIT $2 OFFSET $3`,
			[status, limit, offset]
		);

		const countRes = await pool.query(
			`SELECT COUNT(*) FROM bank_transfer_receipts WHERE accommodation_booking_id IS NOT NULL AND status = $1`,
			[status]
		);

		res.json({ results: rows, pagination: { total: parseInt(countRes.rows[0].count, 10), limit, offset } });
	} catch (err) {
		logger.error('[ACCOMMODATION] pending deposits fetch error', err);
		res.status(500).json({ error: 'Failed to fetch pending accommodation deposits' });
	}
});

router.patch('/admin/pending-deposits/:id/action', authenticateJWT, authorizeRoles(['admin', 'manager', 'owner']), async (req, res) => {
	const client = await pool.connect();
	try {
		const { id } = req.params;
		const { action, reviewerNotes } = req.body;

		if (!['approve', 'reject'].includes(action)) {
			return res.status(400).json({ error: 'Action must be approve or reject' });
		}

		await client.query('BEGIN');

		const receiptRes = await client.query(
			'SELECT * FROM bank_transfer_receipts WHERE id = $1 FOR UPDATE',
			[id]
		);

		if (receiptRes.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Receipt not found' });
		}

		const receipt = receiptRes.rows[0];

		if (receipt.status !== 'pending') {
			await client.query('ROLLBACK');
			return res.status(400).json({ error: `Receipt already ${receipt.status}` });
		}

		if (!receipt.accommodation_booking_id) {
			await client.query('ROLLBACK');
			return res.status(400).json({ error: 'This receipt is not linked to an accommodation booking' });
		}

		const newStatus = action === 'approve' ? 'approved' : 'rejected';

		await client.query(
			`UPDATE bank_transfer_receipts
			 SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
			     admin_notes = CASE WHEN admin_notes IS NULL THEN $3 ELSE admin_notes || ' | ' || $3 END,
			     updated_at = NOW()
			 WHERE id = $4`,
			[newStatus, req.user.id, reviewerNotes || `${action}d by admin`, id]
		);

		if (action === 'approve') {
			await client.query(
				`UPDATE accommodation_bookings
				 SET payment_status = 'paid', status = 'confirmed', updated_at = NOW()
				 WHERE id = $1`,
				[receipt.accommodation_booking_id]
			);

			// Send approval notification to guest
			try {
				const bookingRes = await client.query(
					`SELECT ab.*, au.name as unit_name, u.id as guest_id
					 FROM accommodation_bookings ab
					 JOIN accommodation_units au ON ab.unit_id = au.id
					 JOIN users u ON ab.guest_id = u.id
					 WHERE ab.id = $1`,
					[receipt.accommodation_booking_id]
				);
				const booking = bookingRes.rows[0];
				if (booking) {
					await dispatchNotification({
						userId: booking.guest_id,
						type: 'payment',
						title: 'Deposit Approved — Booking Confirmed!',
						message: `Your deposit for ${booking.unit_name} has been approved. Your booking is confirmed.`,
						data: { bookingId: receipt.accommodation_booking_id },
						client,
					});
				}
			} catch { /* ignore notification errors */ }
		} else {
			await client.query(
				`UPDATE accommodation_bookings
				 SET payment_status = 'failed', status = 'cancelled', updated_at = NOW()
				 WHERE id = $1`,
				[receipt.accommodation_booking_id]
			);

			try {
				const bookingRes = await client.query(
					`SELECT ab.guest_id, au.name as unit_name
					 FROM accommodation_bookings ab
					 JOIN accommodation_units au ON ab.unit_id = au.id
					 WHERE ab.id = $1`,
					[receipt.accommodation_booking_id]
				);
				const booking = bookingRes.rows[0];
				if (booking) {
					await dispatchNotification({
						userId: booking.guest_id,
						type: 'payment',
						title: 'Deposit Rejected',
						message: `Your deposit receipt for ${booking.unit_name} was rejected. Please contact us for assistance.`,
						data: { bookingId: receipt.accommodation_booking_id },
						client,
					});
				}
			} catch { /* ignore notification errors */ }
		}

		await client.query('COMMIT');

		req.socketService?.emitToChannel('dashboard', 'pending-accommodation-deposit:updated', {
			receiptId: id,
			action: newStatus,
			bookingId: receipt.accommodation_booking_id,
		});

		res.json({ success: true, message: `Accommodation deposit ${newStatus} successfully` });
	} catch (err) {
		await client.query('ROLLBACK');
		logger.error('[ACCOMMODATION] pending deposit action error', err);
		res.status(500).json({ error: 'Failed to process action' });
	} finally {
		client.release();
	}
});

export default router;
