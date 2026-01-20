// backend/routes/debug.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { v4 as uuidv4 } from 'uuid';
import { resolveActorId, appendCreatedBy } from '../utils/auditUtils.js';

const router = express.Router();

// Debug endpoint to check booking data - DEVELOPER ONLY
router.get('/bookings', authenticateJWT, authorizeRoles(['developer', 'admin']), async (req, res) => {
  try {
    console.log('DEBUG: Checking bookings table structure and data');
    
    // Check if the bookings table exists
    const tableCheckQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'bookings'
      );
    `;
    
    const tableExists = await pool.query(tableCheckQuery);
    console.log('Bookings table exists:', tableExists.rows[0].exists);
    
    if (!tableExists.rows[0].exists) {
      return res.status(404).json({ 
        error: 'Bookings table does not exist',
        tables: await listAllTables()
      });
    }
    
    // Get table structure
    const tableStructureQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings';
    `;
    
    const tableStructure = await pool.query(tableStructureQuery);
    
    // Count bookings
    const countQuery = `SELECT COUNT(*) FROM bookings;`;
    const bookingCount = await pool.query(countQuery);
    
    // Get some sample bookings
    const sampleQuery = `
      SELECT b.*, 
        s.name as student_name, 
        i.name as instructor_name,
        TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      ORDER BY b.date DESC
      LIMIT 5;
    `;
    
    const sampleBookings = await pool.query(sampleQuery);
    
    // Return detailed debug info
    return res.json({
      tableExists: tableExists.rows[0].exists,
      tableStructure: tableStructure.rows,
      bookingCount: parseInt(bookingCount.rows[0].count),
      sampleBookings: sampleBookings.rows
    });
    
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

// Helper function to list all tables
async function listAllTables() {
  try {
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public';
    `;
    
    const result = await pool.query(query);
    return result.rows.map(row => row.table_name);
  } catch (error) {
    console.error('Error listing tables:', error);
    return [];
  }
}

// Create a test booking for today
router.post('/create-test-booking', authenticateJWT, authorizeRoles(['developer', 'admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get a random instructor
    const instructorQuery = await client.query(`
      SELECT u.id FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name = 'instructor'
      LIMIT 1
    `);
    
    // Get a random student
    const studentQuery = await client.query(`
      SELECT u.id FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name = 'student'
      LIMIT 1
    `);
    
    // Get a service
    const serviceQuery = await client.query(`
      SELECT id FROM services
      LIMIT 1
    `);
    
    // If we don't have required data, create it
    let instructorId = instructorQuery.rows[0]?.id;
    let studentId = studentQuery.rows[0]?.id;
    let serviceId = serviceQuery.rows[0]?.id;
    
    // Create default service if needed
    if (!serviceId) {
      const newService = await client.query(`
        INSERT INTO services (name, description, price, duration)
        VALUES ('Debug Test Service', 'Test service for debugging', 100, 2)
        RETURNING id
      `);
      serviceId = newService.rows[0].id;
    }
    
    // Create today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Log what we've found
    console.log('Debug create-test-booking values:', {
      today,
      studentId: studentId || 'Not found',
      instructorId: instructorId || 'Not found',
      serviceId: serviceId || 'Not found'
    });
    
    // Generate default UUIDs if needed
    const defaultStudentId = studentId || '11111111-1111-1111-1111-111111111111';
    const defaultInstructorId = instructorId || '22222222-2222-2222-2222-222222222222';
    const defaultServiceId = serviceId || '33333333-3333-3333-3333-333333333333';
    const actorId = resolveActorId(req);
    const bookingId = uuidv4();

    // Create the test booking
    const bookingColumns = [
      'id',
      'date',
      'start_hour',
      'duration',
      'student_user_id',
      'instructor_user_id',
      'service_id',
      'status',
      'notes',
      'created_at',
      'updated_at'
    ];
    const bookingValues = [
      bookingId,
      today,
      9,
      2,
      defaultStudentId,
      defaultInstructorId,
      defaultServiceId,
      'confirmed',
      'Test booking created via debug endpoint',
      new Date(),
      new Date()
    ];
    const { columns: bookingInsertColumns, values: bookingInsertValues } = appendCreatedBy(bookingColumns, bookingValues, actorId);
    const bookingPlaceholders = bookingInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
    const bookingResult = await client.query(
      `INSERT INTO bookings (${bookingInsertColumns.join(', ')}) VALUES (${bookingPlaceholders}) RETURNING id`,
      bookingInsertValues
    );
    
    await client.query('COMMIT');
    
    // Fetch the created booking with full details
    const newBookingQuery = await pool.query(`
      SELECT b.*, 
        s.name as student_name, 
        i.name as instructor_name,
        TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      WHERE b.id = $1
    `, [bookingResult.rows[0].id]);
    
    res.status(201).json({
      success: true,
      message: 'Test booking created successfully',
      booking: newBookingQuery.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating test booking:', err);
    res.status(500).json({ 
      error: 'Failed to create test booking',
      details: err.message 
    });
  } finally {
    client.release();
  }
});

// Debug endpoint to get bookings without authentication
router.get('/all-bookings', authenticateJWT, authorizeRoles(['developer', 'admin']), async (req, res) => {
  try {
    console.log('DEBUG: Getting all bookings without authentication');
    
    // Create a sample booking in the database if none exist
    const countQuery = await pool.query('SELECT COUNT(*) FROM bookings');
    const bookingCount = parseInt(countQuery.rows[0].count);
    
    if (bookingCount === 0) {
      console.log('No bookings found, creating a sample booking');
      
      // Get an instructor
      const instructorQuery = await pool.query(`
        SELECT u.id FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'instructor'
        LIMIT 1
      `);
      
      // Get a student
      const studentQuery = await pool.query(`
        SELECT u.id FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'student'
        LIMIT 1
      `);
      
      // Get a service
      const serviceQuery = await pool.query(`
        SELECT id FROM services
        LIMIT 1
      `);
      
      // Create the booking only if we have the required data
      if (instructorQuery.rows.length > 0 && 
          studentQuery.rows.length > 0 && 
          serviceQuery.rows.length > 0) {
        
        const instructorId = instructorQuery.rows[0].id;
        const studentId = studentQuery.rows[0].id;
        const serviceId = serviceQuery.rows[0].id;
        
        // Today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        
        const actorId = resolveActorId(req);
        const sampleId = uuidv4();
        const sampleColumns = [
          'id',
          'date',
          'start_hour',
          'duration',
          'student_user_id',
          'instructor_user_id',
          'service_id',
          'status',
          'notes',
          'created_at',
          'updated_at'
        ];
        const sampleValues = [
          sampleId,
          today,
          10,
          2,
          studentId,
          instructorId,
          serviceId,
          'confirmed',
          'Sample booking created for debugging',
          new Date(),
          new Date()
        ];
        const { columns: sampleInsertColumns, values: sampleInsertValues } = appendCreatedBy(sampleColumns, sampleValues, actorId);
        const samplePlaceholders = sampleInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');

        await pool.query(
          `INSERT INTO bookings (${sampleInsertColumns.join(', ')}) VALUES (${samplePlaceholders})`,
          sampleInsertValues
        );
        
        console.log('Sample booking created');
      } else {
        console.log('Could not create sample booking - missing required data');
      }
    }
    
    // Get all bookings
    const bookingsQuery = `
      SELECT b.*, 
        s.name as student_name, 
        i.name as instructor_name,
        TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      ORDER BY b.date DESC
    `;
    
    console.log('Executing query to get all bookings');
    const bookingsResult = await pool.query(bookingsQuery);
    
    console.log(`Found ${bookingsResult.rows.length} bookings`);
    if (bookingsResult.rows.length > 0) {
      console.log('First booking:', JSON.stringify(bookingsResult.rows[0]));
    }
    
    res.json(bookingsResult.rows);
  } catch (error) {
    console.error('Error getting all bookings:', error);
    res.status(500).json({ 
      error: 'Failed to get bookings',
      details: error.message 
    });
  }
});

export default router;
