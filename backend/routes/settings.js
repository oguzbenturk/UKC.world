import express from 'express';
import { authenticateJWT } from './auth.js';
import { pool } from '../db.js';

const router = express.Router();

// Get registration-allowed currencies (public endpoint for registration form)
router.get('/registration-currencies', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM settings WHERE key = 'allowed_registration_currencies'"
    );
    
    if (result.rows.length > 0) {
      const allowedCurrencies = result.rows[0].value;
      return res.json({ currencies: allowedCurrencies || ['EUR', 'USD', 'TRY'] });
    }
    
    // Default to EUR, USD, TRY if not configured
    res.json({ currencies: ['EUR', 'USD', 'TRY'] });
  } catch (error) {
    console.error('Error fetching registration currencies:', error);
    // Fallback to defaults on error
    res.json({ currencies: ['EUR', 'USD', 'TRY'] });
  }
});

// Get all application settings
router.get('/', authenticateJWT, async (req, res) => {
  try {
    // Check if we have a settings table, if not return default settings
    const tableExists = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'settings')"
    );
    
    if (!tableExists.rows[0].exists) {
      // Return default settings if table doesn't exist
      return res.json({
        business_info: {
          name: 'Plannivo Business Center',
          email: 'info@plannivo.com',
          phone: '+1 (555) 123-4567',
          address: '123 Beach Drive, Surftown, ST 12345'
        },
        booking_defaults: {
          defaultDuration: 120, // Default 2 hours in minutes
          allowedDurations: [60, 90, 120, 150, 180] // Available duration options in minutes
        },
        defaultCurrency: 'USD',
        allowOnlineBooking: true,
        termsAndConditions: 'Default terms and conditions...',
        logo: null
      });
    }
    
    // Get settings from database
    const result = await pool.query('SELECT key, value FROM settings');
    
    if (result.rows.length === 0) {
      // Return default settings if no settings in database
      return res.json({
        business_info: {
          name: 'Plannivo Business Center',
          email: 'info@plannivo.com',
          phone: '+1 (555) 123-4567',
          address: '123 Beach Drive, Surftown, ST 12345'
        },
        booking_defaults: {
          defaultDuration: 120, // Default 2 hours in minutes
          allowedDurations: [60, 90, 120, 150, 180] // Available duration options in minutes
        },
        defaultCurrency: 'USD',
        allowOnlineBooking: true,
        termsAndConditions: 'Default terms and conditions...',
        logo: null
      });
    }
    
    // Convert settings array to object
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    // Ensure booking_defaults exists with fallback
    if (!settings.booking_defaults) {
      settings.booking_defaults = {
        defaultDuration: 120,
        allowedDurations: [60, 90, 120, 150, 180]
      };
    }
    
    // Ensure allowed_registration_currencies exists
    if (!settings.allowed_registration_currencies) {
      settings.allowed_registration_currencies = ['EUR', 'USD', 'TRY'];
    }
    
    res.json(settings);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update specific setting
router.put('/:key', authenticateJWT, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    // Validate booking_defaults if that's what we're updating
    if (key === 'booking_defaults') {
      if (!value.defaultDuration || !Array.isArray(value.allowedDurations)) {
        return res.status(400).json({ 
          error: 'booking_defaults must include defaultDuration and allowedDurations array' 
        });
      }
      
      if (!value.allowedDurations.includes(value.defaultDuration)) {
        return res.status(400).json({ 
          error: 'defaultDuration must be one of the allowedDurations' 
        });
      }
    }
    
    const result = await pool.query(
      `INSERT INTO settings (key, value, description, updated_at) 
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify(value), `${key} configuration`]
    );
    
    res.json({ 
      success: true, 
      setting: {
        key: result.rows[0].key,
        value: result.rows[0].value
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error updating setting:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;