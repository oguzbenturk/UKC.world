import express from 'express';
import { pool } from '../db.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { authenticateJWT } from './auth.js';

const router = express.Router();

// GET all equipment
router.get('/', async (req, res) => {
  try {
    const { type, availability, search } = req.query;
    
    let query = `
      SELECT * FROM equipment
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (type) {
      query += ` AND type = $${paramCount++}`;
      params.push(type);
    }
    
    if (availability) {
      query += ` AND availability = $${paramCount++}`;
      params.push(availability);
    }
    
    if (search) {
      query += ` AND (
        name ILIKE $${paramCount} OR
        brand ILIKE $${paramCount} OR
        model ILIKE $${paramCount} OR
        serial_number ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ` ORDER BY name`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching equipment:', err);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// GET equipment by ID
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM equipment WHERE id = $1', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    // Get bookings where this equipment is used
    const bookingResult = await pool.query(`
      SELECT b.*
      FROM booking_equipment be
      JOIN bookings b ON b.id = be.booking_id
      WHERE be.equipment_id = $1
      ORDER BY b.date DESC
    `, [req.params.id]);
    
    const rentalsResult = await pool.query(`
      SELECT r.*
      FROM rental_equipment re
      JOIN rentals r ON r.id = re.rental_id
      WHERE re.equipment_id = $1
      ORDER BY r.start_date DESC
    `, [req.params.id]);
    
    const equipment = rows[0];
    equipment.bookings = bookingResult.rows;
    equipment.rentals = rentalsResult.rows;
    
    res.json(equipment);
  } catch (err) {
    console.error('Error fetching equipment:', err);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// CREATE equipment
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { 
      name, type, size, brand, model, serial_number, purchase_date,
      purchase_price, condition, last_serviced_date, availability,
      location, notes, image_url
    } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Check if serial number is unique if provided
    if (serial_number) {
      const existingResult = await pool.query(
        'SELECT id FROM equipment WHERE serial_number = $1',
        [serial_number]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Serial number must be unique' });
      }
    }
    
    const insertQuery = `
      INSERT INTO equipment (
        name, type, size, brand, model, serial_number, purchase_date,
        purchase_price, condition, last_serviced_date, availability,
        location, notes, image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
      const { rows } = await pool.query(insertQuery, [
      name, type || 'General', size, brand, model, serial_number, purchase_date,
      purchase_price, condition || 'Good', last_serviced_date, 
      availability || 'Available', location, notes, image_url
    ]);

    // Emit real-time event for equipment creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'equipment:created', rows[0]);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'equipment', action: 'created' });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating equipment:', err);
    res.status(500).json({ error: 'Failed to create equipment' });
  }
});

// UPDATE equipment
router.put('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { 
      name, type, size, brand, model, serial_number, purchase_date,
      purchase_price, condition, last_serviced_date, availability,
      location, notes, image_url
    } = req.body;
    
    // Check if equipment exists
    const checkResult = await pool.query(
      'SELECT id FROM equipment WHERE id = $1',
      [req.params.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    // Check if serial number is unique if provided
    if (serial_number) {
      const existingResult = await pool.query(
        'SELECT id FROM equipment WHERE serial_number = $1 AND id != $2',
        [serial_number, req.params.id]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Serial number must be unique' });
      }
    }
    
    const updateQuery = `
      UPDATE equipment
      SET 
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        size = COALESCE($3, size),
        brand = COALESCE($4, brand),
        model = COALESCE($5, model),
        serial_number = COALESCE($6, serial_number),
        purchase_date = COALESCE($7, purchase_date),
        purchase_price = COALESCE($8, purchase_price),
        condition = COALESCE($9, condition),
        last_serviced_date = COALESCE($10, last_serviced_date),
        availability = COALESCE($11, availability),
        location = COALESCE($12, location),
        notes = COALESCE($13, notes),
        image_url = COALESCE($14, image_url),
        updated_at = NOW()
      WHERE id = $15
      RETURNING *
    `;
      const { rows } = await pool.query(updateQuery, [
      name, type, size, brand, model, serial_number, purchase_date,
      purchase_price, condition, last_serviced_date, availability,
      location, notes, image_url, req.params.id
    ]);

    // Emit real-time event for equipment update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'equipment:updated', rows[0]);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'equipment', action: 'updated' });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating equipment:', err);
    res.status(500).json({ error: 'Failed to update equipment' });
  }
});

// DELETE equipment
router.delete('/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if equipment exists
    const checkResult = await client.query(
      'SELECT id FROM equipment WHERE id = $1',
      [req.params.id]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    // Check if equipment is being used in bookings or rentals
    const usageResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM booking_equipment WHERE equipment_id = $1) +
        (SELECT COUNT(*) FROM rental_equipment WHERE equipment_id = $1) as usage_count
    `, [req.params.id]);
    
    if (parseInt(usageResult.rows[0].usage_count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Cannot delete equipment that is being used in bookings or rentals' 
      });
    }
    
    // Delete equipment
    await client.query('DELETE FROM equipment WHERE id = $1', [req.params.id]);
    
    await client.query('COMMIT');
    
    res.json({ message: 'Equipment deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting equipment:', err);
    res.status(500).json({ error: 'Failed to delete equipment' });
  } finally {
    client.release();
  }
});

export default router;
