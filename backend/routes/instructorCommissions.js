// backend/routes/instructorCommissions.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// Get all commissions for an instructor
router.get('/instructors/:instructorId/commissions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId } = req.params;
  
  try {
    // First check if the instructor/manager exists
    const instructorCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name IN ('instructor', 'manager'))`,
      [instructorId]
    );
    
    if (instructorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Instructor not found' });
    }

    // Get default commission for the instructor
    const defaultCommissionResult = await pool.query(
      `SELECT commission_type, commission_value, self_student_commission_rate
       FROM instructor_default_commissions
       WHERE instructor_id = $1`,
      [instructorId]
    );
    
    const commissionQuery = `
      SELECT isc.service_id, isc.commission_type, isc.commission_value,
              s.name as service_name, s.category, s.level
       FROM instructor_service_commissions isc
       JOIN services s ON isc.service_id = s.id
       WHERE isc.instructor_id = $1
       ORDER BY s.name
    `;

    // Get service-specific commissions
    const commissionResult = await pool.query(commissionQuery, [instructorId]);
    
    // Format the response
    const response = {
      defaultCommission: defaultCommissionResult.rows.length > 0
        ? {
            type: defaultCommissionResult.rows[0].commission_type,
            value: defaultCommissionResult.rows[0].commission_value,
            selfStudentRate: defaultCommissionResult.rows[0].self_student_commission_rate ?? 45
          }
        : {
            type: 'fixed', // Default to fixed rate (hourly)
            value: 50, // Default €50/hour
            selfStudentRate: 45
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
    logger.error('Error fetching instructor commissions:', err);
    res.status(500).json({ error: 'Failed to fetch commissions', details: err.message });
  }
});

// Update default commission for an instructor
router.put('/instructors/:instructorId/default-commission', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId } = req.params;
  const { commissionType, commissionValue, selfStudentRate } = req.body;

  if (!commissionType || commissionValue === undefined) {
    return res.status(400).json({ error: 'Commission type and value are required' });
  }

  if (selfStudentRate !== undefined && selfStudentRate !== null) {
    const n = Number(selfStudentRate);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return res.status(400).json({ error: 'selfStudentRate must be between 0 and 100' });
    }
  }

  const ssRate = (selfStudentRate === undefined || selfStudentRate === null)
    ? 45
    : Number(selfStudentRate);

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
         SET commission_type = $1, commission_value = $2,
             self_student_commission_rate = $3, updated_at = NOW()
         WHERE instructor_id = $4
         RETURNING *`,
        [commissionType, commissionValue, ssRate, instructorId]
      );
    } else {
      // Insert new default commission
      result = await pool.query(
        `INSERT INTO instructor_default_commissions
         (instructor_id, commission_type, commission_value, self_student_commission_rate, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [instructorId, commissionType, commissionValue, ssRate]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Error updating default commission:', err);
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
    logger.error('Error updating service commission:', err);
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
    logger.error('Error adding service commission:', err);
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
    logger.error('Error deleting service commission:', err);
    res.status(500).json({ error: 'Failed to delete service commission' });
  }
});

// ============ CATEGORY RATE ENDPOINTS ============

// Get all category rates for an instructor
router.get('/instructors/:instructorId/category-rates', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT id, lesson_category, rate_type, rate_value
       FROM instructor_category_rates
       WHERE instructor_id = $1
       ORDER BY lesson_category`,
      [instructorId]
    );

    res.json({ categoryRates: rows });
  } catch (err) {
    logger.error('Error fetching category rates:', err);
    res.status(500).json({ error: 'Failed to fetch category rates' });
  }
});

// Bulk upsert category rates for an instructor
router.put('/instructors/:instructorId/category-rates', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId } = req.params;
  const { rates } = req.body;

  if (!Array.isArray(rates)) {
    return res.status(400).json({ error: 'rates must be an array' });
  }

  const VALID_CATEGORIES = ['private', 'semi-private', 'group', 'supervision'];
  const VALID_TYPES = ['fixed', 'percentage'];

  for (const r of rates) {
    if (!VALID_CATEGORIES.includes(r.lessonCategory)) {
      return res.status(400).json({ error: `Invalid lesson category: ${r.lessonCategory}` });
    }
    if (!VALID_TYPES.includes(r.rateType || 'fixed')) {
      return res.status(400).json({ error: `Invalid rate type: ${r.rateType}` });
    }
    if (r.rateValue === undefined || r.rateValue === null || Number(r.rateValue) < 0) {
      return res.status(400).json({ error: 'Rate value must be a non-negative number' });
    }
    if (r.rateType === 'percentage' && Number(r.rateValue) > 100) {
      return res.status(400).json({ error: 'Percentage rate cannot exceed 100' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const results = [];
    for (const r of rates) {
      const { rows } = await client.query(
        `INSERT INTO instructor_category_rates
           (instructor_id, lesson_category, rate_type, rate_value, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (instructor_id, lesson_category)
         DO UPDATE SET rate_type = $3, rate_value = $4, updated_at = NOW()
         RETURNING *`,
        [instructorId, r.lessonCategory, r.rateType || 'fixed', r.rateValue]
      );
      results.push(rows[0]);
    }

    await client.query('COMMIT');
    res.json({ categoryRates: results });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Error upserting category rates:', err);
    res.status(500).json({ error: 'Failed to save category rates' });
  } finally {
    client.release();
  }
});

// Delete a specific category rate
router.delete('/instructors/:instructorId/category-rates/:category', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId, category } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM instructor_category_rates WHERE instructor_id = $1 AND lesson_category = $2 RETURNING id',
      [instructorId, category]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category rate not found' });
    }

    res.json({ message: 'Category rate deleted successfully' });
  } catch (err) {
    logger.error('Error deleting category rate:', err);
    res.status(500).json({ error: 'Failed to delete category rate' });
  }
});

export default router;
