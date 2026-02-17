import { pool } from '../db.js';
import { cacheService } from './cacheService.js';
import { appendCreatedBy } from '../utils/auditUtils.js';

/**
 * Optimized Booking Service with Caching Layer
 * Implements high-performance booking operations with Redis caching
 */
class BookingService {
    
    /**
     * Get bookings by date range with caching
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {number|null} instructorId - Optional instructor filter
     * @param {string|null} status - Optional status filter
     * @returns {Array} - Array of booking objects
     */
    async getBookingsByDateRange(startDate, endDate, instructorId = null, status = null) {
        const cacheKey = `bookings:${startDate}:${endDate}:${instructorId || 'all'}:${status || 'all'}`;
        
        // Try cache first
        const bookings = await cacheService.get(cacheKey);
        if (bookings) {
            console.log(`🎯 Cache HIT for bookings query: ${cacheKey}`);
            return bookings;
        }

        console.log(`❌ Cache MISS for bookings query: ${cacheKey}`);

        // Build optimized query with proper indexing
        let query = `
            SELECT 
                b.id, 
                b.date, 
                b.start_hour, 
                b.duration, 
                b.status,
                b.final_amount, 
                b.notes,
                b.service_id,
                b.created_at,
                b.updated_at,
                s.name as student_name, 
                s.email as student_email,
                s.phone as student_phone,
                i.name as instructor_name, 
                i.email as instructor_email,
                srv.name as service_name, 
                srv.category as service_category,
                srv.level as service_level,
                srv.price as service_price
            FROM bookings b
            LEFT JOIN users s ON b.student_user_id = s.id
            LEFT JOIN users i ON b.instructor_user_id = i.id
            LEFT JOIN services srv ON b.service_id = srv.id
            WHERE b.date BETWEEN $1 AND $2
        `;

        const params = [startDate, endDate];
        let paramIndex = 2;

        // Add status filter
        if (status && status !== 'all') {
            query += ` AND b.status = $${++paramIndex}`;
            params.push(status);
        } else {
            // Exclude cancelled bookings by default for performance
            query += ` AND b.status != 'cancelled'`;
        }
        
        // Add instructor filter
        if (instructorId) {
            query += ` AND b.instructor_user_id = $${++paramIndex}`;
            params.push(instructorId);
        }

        query += ` ORDER BY b.date, b.start_hour`;

        try {
            const { rows } = await pool.query(query, params);
            
            // Cache for 5 minutes (300 seconds)
            await cacheService.set(cacheKey, rows, 300);
            console.log(`💾 Cached bookings query result: ${cacheKey}`);
            
            return rows;
        } catch (error) {
            console.error('Error fetching bookings by date range:', error);
            throw error;
        }
    }

    /**
     * Get instructor availability with caching
     * @param {number} instructorId - Instructor ID
     * @param {string} date - Date (YYYY-MM-DD)
     * @returns {Array} - Available time slots
     */
    async getInstructorAvailability(instructorId, date) {
        const cacheKey = `availability:instructor:${instructorId}:${date}`;
        
        const availability = await cacheService.get(cacheKey);
        if (availability) {
            return availability;
        }

        // Get existing bookings for the day
        const query = `
            SELECT start_hour, duration
            FROM bookings 
            WHERE instructor_user_id = $1 
              AND date = $2 
              AND status IN ('confirmed', 'pending')
            ORDER BY start_hour
        `;

        try {
            const { rows: existingBookings } = await pool.query(query, [instructorId, date]);
            
            // Generate available slots (assuming 8:00-21:00 working hours)
            const workingHours = Array.from({length: 13}, (_, i) => i + 8); // 8:00-20:00
            const availableSlots = [];
            
            for (const hour of workingHours) {
                const isBooked = existingBookings.some(booking => {
                    const bookingStart = parseInt(booking.start_hour);
                    const bookingEnd = bookingStart + parseFloat(booking.duration);
                    return hour >= bookingStart && hour < bookingEnd;
                });
                
                if (!isBooked) {
                    availableSlots.push({
                        hour: hour,
                        time: `${hour.toString().padStart(2, '0')}:00`
                    });
                }
            }

            // Cache for 10 minutes
            await cacheService.set(cacheKey, availableSlots, 600);
            
            return availableSlots;
        } catch (error) {
            console.error('Error fetching instructor availability:', error);
            throw error;
        }
    }

    /**
     * Create a new booking with cache invalidation
     * @param {Object} bookingData - Booking details
     * @returns {Object} - Created booking
     */
    async createBooking(bookingData) {
        const {
            student_user_id,
            instructor_user_id,
            service_id,
            date,
            start_hour,
            duration,
            notes,
            final_amount,
            status,
            created_by,
            createdBy,
            actorId
        } = bookingData;

        const auditActorId = created_by || createdBy || actorId || null;
        const bookingStatus = status || 'pending';
        const now = new Date();
        const columns = [
            'student_user_id',
            'instructor_user_id',
            'service_id',
            'date',
            'start_hour',
            'duration',
            'notes',
            'final_amount',
            'status',
            'created_at',
            'updated_at'
        ];
        const values = [
            student_user_id,
            instructor_user_id,
            service_id,
            date,
            start_hour,
            duration,
            notes ?? '',
            final_amount ?? 0,
            bookingStatus,
            now,
            now
        ];
        if (bookingData.family_member_id) {
            columns.push('family_member_id');
            values.push(bookingData.family_member_id);
        }
        const { columns: insertColumns, values: insertValues } = appendCreatedBy(columns, values, auditActorId);
        const placeholders = insertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
        const query = `
            INSERT INTO bookings (${insertColumns.join(', ')})
            VALUES (${placeholders})
            RETURNING *
        `;

        try {
            const { rows } = await pool.query(query, insertValues);

            // Invalidate relevant caches
            await this.invalidateBookingCaches(date, instructor_user_id, student_user_id);

            console.log(`✅ Created new booking: ${rows[0].id}`);
            return rows[0];
        } catch (error) {
            console.error('Error creating booking:', error);
            throw error;
        }
    }

    /**
     * Update booking status with cache invalidation
     * @param {number} bookingId - Booking ID
     * @param {string} status - New status
     * @param {number} userId - User making the change
     * @returns {Object} - Updated booking
     */
    async updateBookingStatus(bookingId, status, _userId) {
        // First get the existing booking to know what caches to invalidate
        const existingBooking = await this.getBookingById(bookingId);
        if (!existingBooking) {
            throw new Error('Booking not found');
        }

        const query = `
            UPDATE bookings 
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `;

        try {
            const { rows } = await pool.query(query, [status, bookingId]);

            // Invalidate relevant caches
            await this.invalidateBookingCaches(
                existingBooking.date,
                existingBooking.instructor_user_id,
                existingBooking.student_user_id
            );

            console.log(`✅ Updated booking ${bookingId} status to: ${status}`);
            return rows[0];
        } catch (error) {
            console.error('Error updating booking status:', error);
            throw error;
        }
    }

    /**
     * Get booking by ID with caching
     * @param {number} bookingId - Booking ID
     * @returns {Object|null} - Booking object or null
     */
    async getBookingById(bookingId) {
        const cacheKey = `booking:${bookingId}`;
        
        const booking = await cacheService.get(cacheKey);
        if (booking) {
            return booking;
        }

        const query = `
            SELECT 
                b.*,
                s.name as student_name, 
                s.email as student_email,
                i.name as instructor_name, 
                i.email as instructor_email,
                srv.name as service_name, 
                srv.category as service_category
            FROM bookings b
            LEFT JOIN users s ON b.student_user_id = s.id
            LEFT JOIN users i ON b.instructor_user_id = i.id
            LEFT JOIN services srv ON b.service_id = srv.id
            WHERE b.id = $1
        `;

        try {
            const { rows } = await pool.query(query, [bookingId]);
            const booking = rows.length > 0 ? rows[0] : null;

            // Cache individual bookings for 15 minutes
            if (booking) {
                await cacheService.set(cacheKey, booking, 900);
            }

            return booking;
        } catch (error) {
            console.error('Error fetching booking by ID:', error);
            throw error;
        }
    }

    /**
     * Get user bookings (student or instructor) with caching
     * @param {number} userId - User ID
     * @param {string} role - 'student' or 'instructor'
     * @param {number} limit - Number of results to return
     * @param {number} offset - Offset for pagination
     * @returns {Array} - Array of bookings
     */
    async getUserBookings(userId, role, limit = 20, offset = 0) {
        const cacheKey = `user_bookings:${userId}:${role}:${limit}:${offset}`;
        
        const bookings = await cacheService.get(cacheKey);
        if (bookings) {
            return bookings;
        }

        const roleField = role === 'instructor' ? 'instructor_user_id' : 'student_user_id';
        const otherRoleField = role === 'instructor' ? 'student_user_id' : 'instructor_user_id';
        const otherRoleName = role === 'instructor' ? 'student_name' : 'instructor_name';

        const query = `
            SELECT 
                b.*,
                u.name as ${otherRoleName},
                u.email as ${role === 'instructor' ? 'student_email' : 'instructor_email'},
                srv.name as service_name,
                srv.category as service_category
            FROM bookings b
            LEFT JOIN users u ON b.${otherRoleField} = u.id
            LEFT JOIN services srv ON b.service_id = srv.id
            WHERE b.${roleField} = $1
            ORDER BY b.date DESC, b.start_hour DESC
            LIMIT $2 OFFSET $3
        `;

        try {
            const { rows } = await pool.query(query, [userId, limit, offset]);

            // Cache for 5 minutes
            await cacheService.set(cacheKey, rows, 300);

            return rows;
        } catch (error) {
            console.error('Error fetching user bookings:', error);
            throw error;
        }
    }

    /**
     * Invalidate booking-related caches
     * @param {string} date - Booking date
     * @param {number} instructorId - Instructor ID
     * @param {number} studentId - Student ID
     */
    async invalidateBookingCaches(date, instructorId, studentId) {
        const patterns = [
            `bookings:*`,
            `availability:instructor:${instructorId}:*`,
            `user_bookings:${instructorId}:*`,
            `user_bookings:${studentId}:*`,
            `booking:*`
        ];

        for (const pattern of patterns) {
            await cacheService.del(pattern);
        }

        console.log(`🧹 Invalidated booking caches for date: ${date}`);
    }

    /**
     * Get booking statistics with caching
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Object} - Booking statistics
     */
    async getBookingStats(startDate, endDate) {
        const cacheKey = `booking_stats:${startDate}:${endDate}`;
        
        const stats = await cacheService.get(cacheKey);
        if (stats) {
            return stats;
        }

        const query = `
            SELECT 
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
                SUM(CASE WHEN status = 'confirmed' THEN final_amount ELSE 0 END) as confirmed_revenue,
                AVG(final_amount) as average_booking_value
            FROM bookings 
            WHERE date BETWEEN $1 AND $2
        `;

        try {
            const { rows } = await pool.query(query, [startDate, endDate]);
            const stats = rows[0];

            // Cache for 30 minutes
            await cacheService.set(cacheKey, stats, 1800);

            return stats;
        } catch (error) {
            console.error('Error fetching booking statistics:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const bookingService = new BookingService();
