import { Router } from 'express';
// Update this import to match how pool is exported in db.js
import { pool } from '../db.js';
import metricsService from '../services/metricsService.js';

const router = Router();

// Check if database needs initialization
router.get('/database-status', async (req, res) => {
  try {
    // Check users table with student role as an indicator
    const result = await pool.query(`
      SELECT COUNT(*) 
      FROM users u 
      JOIN roles r ON u.role_id = r.id 
      WHERE r.name = 'student'
    `);
    const count = parseInt(result.rows[0].count);
    
    // If there are no records, the database needs initialization
    const needsInitialization = count === 0;
    
    res.json({ needsInitialization });
  } catch (error) {
    console.error('Error checking database status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize database with mock data
router.post('/initialize-database', async (req, res) => {
  try {
    const mockData = req.body;
    const client = await pool.connect();
    
    try {
      // Begin transaction
      await client.query('BEGIN');
        // Insert students
      if (mockData.students && Array.isArray(mockData.students)) {
        // Get student role ID
        const studentRoleResult = await client.query('SELECT id FROM roles WHERE name = $1', ['student']);
        if (studentRoleResult.rows.length === 0) {
          throw new Error('Student role not found');
        }
        const studentRoleId = studentRoleResult.rows[0].id;
        
        for (const student of mockData.students) {
          await client.query(
            'INSERT INTO users (name, email, phone, level, notes, role_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
            [
              student.name, 
              student.email, 
              student.phone || '', 
              student.level || 'beginner', 
              student.notes || '',
              studentRoleId
            ]
          );
        }
      }
        // Insert instructors
      if (mockData.instructors && Array.isArray(mockData.instructors)) {
        // Get instructor role ID
        const instructorRoleResult = await client.query('SELECT id FROM roles WHERE name = $1', ['instructor']);
        if (instructorRoleResult.rows.length === 0) {
          throw new Error('Instructor role not found');
        }
        const instructorRoleId = instructorRoleResult.rows[0].id;
        
        for (const instructor of mockData.instructors) {
          await client.query(
            'INSERT INTO users (name, email, phone, bio, level, notes, role_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
            [
              instructor.name, 
              instructor.email, 
              instructor.phone || '', 
              instructor.bio || '',
              instructor.certification_level || 'intermediate',
              instructor.notes || '',
              instructorRoleId
            ]
          );
        }
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
      res.json({ success: true, message: 'Database initialized successfully' });
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route to update entity references
router.post('/:entityType/:id/update-references', async (req, res) => {
  try {
    const { entityType, id } = req.params;
    const updatedData = req.body;
      if (entityType === 'students' && updatedData.name) {
      await pool.query(
        'UPDATE bookings SET notes = CONCAT(notes, \' (Updated student name: \', $1, \')\') WHERE student_user_id = $2',
        [updatedData.name, id]
      );
    }
    
    if (entityType === 'instructors' && updatedData.name) {
      await pool.query(
        'UPDATE bookings SET notes = CONCAT(notes, \' (Updated instructor name: \', $1, \')\') WHERE instructor_user_id = $2',
        [updatedData.name, id]
      );
    }
    
    if (entityType === 'equipment' && updatedData.name) {
      await pool.query(
        'UPDATE rentals SET notes = CONCAT(notes, \' (Updated equipment name: \', $1, \')\') WHERE equipment_id = $2',
        [updatedData.name, id]
      );
    }
    
    res.json({ success: true, message: 'References updated successfully' });
  } catch (error) {
    console.error('Error updating references:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/performance-metrics', (req, res) => {
  try {
    const reset = req.query.reset === 'true';
    const snapshot = metricsService.getSnapshot({ reset });
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
