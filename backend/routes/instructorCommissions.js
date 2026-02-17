// backend/routes/instructorCommissions.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';

const router = express.Router();

// Get all commissions for an instructor
router.get('/instructors/:instructorId/commissions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId } = req.params;
  
  try {
    // First check if the instructor exists
    const instructorCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name = 'instructor')`,
      [instructorId]
    );
    
    if (instructorCheck.rows.length === 0) {
      console.log(`Instructor ${instructorId} not found`);
      return res.status(404).json({ error: 'Instructor not found' });
    }
    
    console.log(`Fetching commissions for instructor ${instructorId}`);
    
    // Get default commission for the instructor
    const defaultCommissionResult = await pool.query(
      `SELECT commission_type, commission_value 
       FROM instructor_default_commissions 
       WHERE instructor_id = $1`,
      [instructorId]
    );
    
    // Log the SQL query for debugging
    const commissionQuery = `
      SELECT isc.service_id, isc.commission_type, isc.commission_value,
              s.name as service_name, s.category, s.level
       FROM instructor_service_commissions isc
       JOIN services s ON isc.service_id = s.id
       WHERE isc.instructor_id = $1
       ORDER BY s.name
    `;
    console.log('Commission query:', commissionQuery);
    
    // Get service-specific commissions
    const commissionResult = await pool.query(commissionQuery, [instructorId]);
    
    console.log(`Found ${commissionResult.rows.length} service commissions`);
    
    // Format the response
    const response = {
      defaultCommission: defaultCommissionResult.rows.length > 0 
        ? {
            type: defaultCommissionResult.rows[0].commission_type,
            value: defaultCommissionResult.rows[0].commission_value
          }
        : {
            type: 'fixed', // Default to fixed rate (hourly)
            value: 50 // Default €50/hour
          },
      commissions: commissionResult.rows.map(row => ({
        key: row.service_id,
        serviceId: row.service_id,
        serviceName: row.service_name,
        serviceCategory: row.category,
        serviceLevel: row.level,
        commissionType: row.commission_type,
        commissionValue: row.commission_value
      }))
    };
    
    res.json(response);
  } catch (err) {
    console.error('Error fetching instructor commissions:', err);
    res.status(500).json({ error: 'Failed to fetch commissions', details: err.message });
  }
});

// Update default commission for an instructor
router.put('/instructors/:instructorId/default-commission', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId } = req.params;
  const { commissionType, commissionValue } = req.body;
  
  if (!commissionType || commissionValue === undefined) {
    return res.status(400).json({ error: 'Commission type and value are required' });
  }
  
  try {
    // Check if a default commission already exists
    const existingResult = await pool.query(
      'SELECT id FROM instructor_default_commissions WHERE instructor_id = $1',
      [instructorId]
    );
    
    let result;
    
    if (existingResult.rows.length > 0) {
      // Update existing default commission
      result = await pool.query(
        `UPDATE instructor_default_commissions
         SET commission_type = $1, commission_value = $2, updated_at = NOW()
         WHERE instructor_id = $3
         RETURNING *`,
        [commissionType, commissionValue, instructorId]
      );
    } else {
      // Insert new default commission
      result = await pool.query(
        `INSERT INTO instructor_default_commissions
         (instructor_id, commission_type, commission_value, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING *`,
        [instructorId, commissionType, commissionValue]
      );
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating default commission:', err);
    res.status(500).json({ error: 'Failed to update default commission' });
  }
});

// Add or update a service-specific commission
router.put('/instructors/:instructorId/commissions/:serviceId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId, serviceId } = req.params;
  const { commissionType, commissionValue } = req.body;
  
  if (!commissionType || commissionValue === undefined) {
    return res.status(400).json({ error: 'Commission type and value are required' });
  }
  
  try {
    // Check if the service exists
    const serviceResult = await pool.query(
      'SELECT id FROM services WHERE id = $1',
      [serviceId]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    // Check if a commission already exists for this instructor-service pair
    const existingResult = await pool.query(
      'SELECT id FROM instructor_service_commissions WHERE instructor_id = $1 AND service_id = $2',
      [instructorId, serviceId]
    );
    
    let result;
    
    if (existingResult.rows.length > 0) {
      // Update existing commission
      result = await pool.query(
        `UPDATE instructor_service_commissions
         SET commission_type = $1, commission_value = $2, updated_at = NOW()
         WHERE instructor_id = $3 AND service_id = $4
         RETURNING *`,
        [commissionType, commissionValue, instructorId, serviceId]
      );
    } else {
      // Insert new commission
      result = await pool.query(
        `INSERT INTO instructor_service_commissions
         (instructor_id, service_id, commission_type, commission_value, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [instructorId, serviceId, commissionType, commissionValue]
      );
    }
    
    // Get the service details to return a complete response
    const serviceDetails = await pool.query(
      'SELECT name, category, level FROM services WHERE id = $1',
      [serviceId]
    );
    
    const commission = {
      ...result.rows[0],
      serviceName: serviceDetails.rows[0].name,
      serviceCategory: serviceDetails.rows[0].category,
      serviceLevel: serviceDetails.rows[0].level
    };
    
    res.json(commission);
  } catch (err) {
    console.error('Error updating service commission:', err);
    res.status(500).json({ error: 'Failed to update service commission' });
  }
});

// Add a new service commission
router.post('/instructors/:instructorId/commissions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId } = req.params;
  const { serviceId, commissionType, commissionValue } = req.body;
  
  if (!serviceId || !commissionType || commissionValue === undefined) {
    return res.status(400).json({ error: 'Service ID, commission type, and value are required' });
  }
  
  try {
    // Check if the service exists
    const serviceResult = await pool.query(
      'SELECT id, name, category, level FROM services WHERE id = $1',
      [serviceId]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    // Check if a commission already exists for this instructor-service pair
    const existingResult = await pool.query(
      'SELECT id FROM instructor_service_commissions WHERE instructor_id = $1 AND service_id = $2',
      [instructorId, serviceId]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'Commission already exists for this service' });
    }
    
    // Insert new commission
    const result = await pool.query(
      `INSERT INTO instructor_service_commissions
       (instructor_id, service_id, commission_type, commission_value, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [instructorId, serviceId, commissionType, commissionValue]
    );
    
    const commission = {
      ...result.rows[0],
      serviceName: serviceResult.rows[0].name,
      serviceCategory: serviceResult.rows[0].category,
      serviceLevel: serviceResult.rows[0].level
    };
    
    res.status(201).json(commission);
  } catch (err) {
    console.error('Error adding service commission:', err);
    res.status(500).json({ error: 'Failed to add service commission' });
  }
});

// Delete a service commission
router.delete('/instructors/:instructorId/commissions/:serviceId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId, serviceId } = req.params;
  
  try {
    const result = await pool.query(
      'DELETE FROM instructor_service_commissions WHERE instructor_id = $1 AND service_id = $2 RETURNING id',
      [instructorId, serviceId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commission not found' });
    }
    
    res.status(200).json({ message: 'Commission deleted successfully' });
  } catch (err) {
    console.error('Error deleting service commission:', err);
    res.status(500).json({ error: 'Failed to delete service commission' });
  }
});

export default router;
