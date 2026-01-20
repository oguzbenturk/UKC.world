import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import * as quickLinksService from '../services/quickLinksService.js';

const router = express.Router();

// ============================================
// PROTECTED ROUTES (Admin/Manager only)
// ============================================

/**
 * GET /api/quick-links
 * Get all quick links
 */
router.get('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { service_type, is_active } = req.query;
    const filters = {
      service_type,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined
    };
    
    const links = await quickLinksService.getQuickLinks(filters, req.user.id);
    res.json(links);
  } catch (error) {
    logger.error('Error fetching quick links:', error);
    res.status(500).json({ error: 'Failed to fetch quick links' });
  }
});

/**
 * GET /api/quick-links/statistics
 * Get quick link statistics
 */
router.get('/statistics', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const stats = await quickLinksService.getStatistics();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching quick link statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/quick-links/:id
 * Get a specific quick link by ID
 */
router.get('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const link = await quickLinksService.getQuickLinkById(req.params.id);
    if (!link) {
      return res.status(404).json({ error: 'Quick link not found' });
    }
    res.json(link);
  } catch (error) {
    logger.error('Error fetching quick link:', error);
    res.status(500).json({ error: 'Failed to fetch quick link' });
  }
});

/**
 * POST /api/quick-links
 * Create a new quick link
 */
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { name, description, service_type, service_id, expires_at, max_uses, require_payment, custom_fields } = req.body;
    
    if (!name || !service_type) {
      return res.status(400).json({ error: 'Name and service type are required' });
    }

    const validServiceTypes = ['accommodation', 'lesson', 'rental', 'shop'];
    if (!validServiceTypes.includes(service_type)) {
      return res.status(400).json({ error: 'Invalid service type' });
    }

    const link = await quickLinksService.createQuickLink(req.body, req.user.id);
    res.status(201).json(link);
  } catch (error) {
    logger.error('Error creating quick link:', error);
    res.status(500).json({ error: 'Failed to create quick link' });
  }
});

/**
 * PATCH /api/quick-links/:id
 * Update a quick link
 */
router.patch('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const link = await quickLinksService.updateQuickLink(req.params.id, req.body);
    if (!link) {
      return res.status(404).json({ error: 'Quick link not found' });
    }
    res.json(link);
  } catch (error) {
    logger.error('Error updating quick link:', error);
    res.status(500).json({ error: 'Failed to update quick link' });
  }
});

/**
 * DELETE /api/quick-links/:id
 * Delete a quick link
 */
router.delete('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const deleted = await quickLinksService.deleteQuickLink(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Quick link not found' });
    }
    res.json({ message: 'Quick link deleted successfully' });
  } catch (error) {
    logger.error('Error deleting quick link:', error);
    res.status(500).json({ error: 'Failed to delete quick link' });
  }
});

/**
 * GET /api/quick-links/:id/registrations
 * Get registrations for a quick link
 */
router.get('/:id/registrations', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const registrations = await quickLinksService.getRegistrations(req.params.id);
    res.json(registrations);
  } catch (error) {
    logger.error('Error fetching registrations:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

/**
 * PATCH /api/quick-links/registrations/:id
 * Update a registration (status, notes, link to user)
 */
router.patch('/registrations/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const registration = await quickLinksService.updateRegistration(req.params.id, req.body);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    res.json(registration);
  } catch (error) {
    logger.error('Error updating registration:', error);
    res.status(500).json({ error: 'Failed to update registration' });
  }
});

/**
 * DELETE /api/quick-links/registrations/:id
 * Delete a registration
 */
router.delete('/registrations/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const deleted = await quickLinksService.deleteRegistration(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    res.json({ message: 'Registration deleted successfully' });
  } catch (error) {
    logger.error('Error deleting registration:', error);
    res.status(500).json({ error: 'Failed to delete registration' });
  }
});

/**
 * POST /api/quick-links/registrations/:id/create-account
 * Create user account from registration (admin action)
 */
router.post('/registrations/:id/create-account', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const result = await quickLinksService.createUserFromRegistration(req.params.id);
    res.json(result);
  } catch (error) {
    logger.error('Error creating user from registration:', error);
    if (error.message === 'Registration not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'User account already exists for this registration') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create user account' });
  }
});

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

/**
 * GET /api/quick-links/public/:code
 * Get quick link details by code (public)
 */
router.get('/public/:code', async (req, res) => {
  try {
    const link = await quickLinksService.getQuickLinkByCode(req.params.code);
    if (!link) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }
    
    // Return limited info for public view
    res.json({
      id: link.id,
      name: link.name,
      description: link.description,
      service_type: link.service_type,
      service_id: link.service_id,
      require_payment: link.require_payment,
      custom_fields: link.custom_fields
    });
  } catch (error) {
    logger.error('Error fetching public quick link:', error);
    res.status(500).json({ error: 'Failed to fetch link details' });
  }
});

/**
 * POST /api/quick-links/public/:code/register
 * Register via quick link (public)
 */
router.post('/public/:code/register', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, additional_data, notes } = req.body;
    
    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const result = await quickLinksService.createRegistration(req.params.code, req.body);
    
    res.status(201).json({
      message: 'Registration successful',
      registration_id: result.registration.id,
      service_type: result.link.service_type,
      service_name: result.link.name
    });
  } catch (error) {
    logger.error('Error creating registration:', error);
    if (error.message === 'Invalid or expired link') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to complete registration' });
  }
});

export default router;
