import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { cacheMiddleware, cacheInvalidationMiddleware } from '../middlewares/cache.js';
import { cacheService } from '../services/cacheService.js';
import { getSpot, SPOT_LIST } from '../services/weather/spots.js';

const SETTINGS_CACHE_PATTERNS = ['api:GET:/api/settings*'];

// ─── instructor_dashboard: wind card on the instructor "My day" dashboard ────
// { wind_spot, wind_min_kn, wind_max_kn } — the spot whose /weather/report feeds
// the card and the knots range the card calls "good". Editable by admin/manager
// (owner/super_admin as their superset) only — NOT through the roles JSONB
// `settings:write` fallback that authorizeRoles applies to other roles.
export const INSTRUCTOR_DASHBOARD_DEFAULTS = Object.freeze({ wind_spot: 'gulbahce', wind_min_kn: 12, wind_max_kn: 25 });
export const WIND_KN_RANGE = Object.freeze({ min: 5, max: 40 });
const INSTRUCTOR_DASHBOARD_EDITORS = new Set(['admin', 'manager', 'owner', 'super_admin']);

/** Returns { value } (normalised) or { error }. */
export function validateInstructorDashboardSetting(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'instructor_dashboard must be an object { wind_spot, wind_min_kn, wind_max_kn }' };
  }
  const spot = typeof raw.wind_spot === 'string' ? raw.wind_spot.trim() : '';
  if (!getSpot(spot)) {
    return { error: `wind_spot must be one of: ${SPOT_LIST.map((s) => s.id).join(', ')}` };
  }
  const toKn = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const min = toKn(raw.wind_min_kn);
  const max = toKn(raw.wind_max_kn);
  for (const [name, v] of [['wind_min_kn', min], ['wind_max_kn', max]]) {
    if (!Number.isFinite(v) || v < WIND_KN_RANGE.min || v > WIND_KN_RANGE.max) {
      return { error: `${name} must be a number between ${WIND_KN_RANGE.min} and ${WIND_KN_RANGE.max} knots` };
    }
  }
  if (min >= max) return { error: 'wind_min_kn must be lower than wind_max_kn' };
  return { value: { wind_spot: spot, wind_min_kn: min, wind_max_kn: max } };
}

const router = express.Router();

// Get registration-allowed currencies (public endpoint for registration form)
router.get('/registration-currencies', cacheMiddleware(3600), async (req, res) => {
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
    logger.error('Error fetching registration currencies:', error);
    // Fallback to defaults on error
    res.json({ currencies: ['EUR', 'USD', 'TRY'] });
  }
});

// Get all application settings
router.get('/', authenticateJWT, cacheMiddleware(1800), async (req, res) => {
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
    logger.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update specific setting
// Writing settings is staff-only: previously ANY logged-in user (incl. self-registered
// outsiders) could overwrite business settings such as security.password_min_length.
router.put('/:key', authenticateJWT, authorizeRoles(['admin', 'manager', 'owner', 'super_admin']), cacheInvalidationMiddleware(SETTINGS_CACHE_PATTERNS), async (req, res) => {
  try {
    const { key } = req.params;
    let { value } = req.body || {};

    if (key === 'instructor_dashboard') {
      const role = String(req.user?.role || '').toLowerCase();
      if (!INSTRUCTOR_DASHBOARD_EDITORS.has(role)) {
        return res.status(403).json({ error: 'Only an admin or manager can change the instructor dashboard settings' });
      }
      const checked = validateInstructorDashboardSetting(value);
      if (checked.error) return res.status(400).json({ error: checked.error, code: 'VALIDATION_ERROR' });
      value = checked.value;
    }

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

    // Drop the cached GET /settings BEFORE answering (the invalidation middleware
    // runs fire-and-forget), so a client refetching right after the save — e.g.
    // the instructor dashboard's wind card — never reads the old value.
    await cacheService.del('api:GET:/api/settings*');
    
    res.json({ 
      success: true, 
      setting: {
        key: result.rows[0].key,
        value: result.rows[0].value
      }
    });
  } catch (error) {
    logger.error('Error updating setting:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;