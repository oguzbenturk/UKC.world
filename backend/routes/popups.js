import express from 'express';
import popupService from '../services/popupService.js';
import { authorizeRoles as authorize } from '../middlewares/authorize.js';
import { body, query, param, validationResult } from 'express-validator';
import { logger } from '../middlewares/errorHandler.js';
import { resolveActorId } from '../utils/auditUtils.js';

const router = express.Router();

/**
 * Get active popups for current user
 * GET /api/popups/active
 */
router.get('/active', 
    // No role restriction - any authenticated user can see popups
    query('page_route').optional().isString().trim(),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const userId = req.user.id;
            const pageRoute = req.query.page_route;

            const popups = await popupService.getActivePopupsForUser(userId, pageRoute);
            
            // Get content blocks for each popup
            const popupsWithContent = await Promise.all(
                popups.map(async (popup) => {
                    const content = await popupService.getPopupContent(popup.id);
                    return { ...popup, content_blocks: content };
                })
            );

            res.json({
                success: true,
                data: popupsWithContent
            });
        } catch (error) {
            logger.error('Error getting active popups:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Check popup eligibility for current user
 * POST /api/popups/check
 */
router.post('/check',
    // No role restriction - any authenticated user can check popups
    body('currentPath').optional().isString().trim(),
    body('userAgent').optional().isString().trim(),
    body('screenWidth').optional().isInt({ min: 0 }),
    body('timeOfDay').optional().isInt({ min: 0, max: 23 }),
    body('dayOfWeek').optional().isInt({ min: 0, max: 6 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const userId = req.user.id;
            const { currentPath, userAgent, screenWidth, timeOfDay, dayOfWeek } = req.body;

            // Add safety check for popupService
            if (!popupService || typeof popupService.getEligiblePopups !== 'function') {
                logger.warn('PopupService not available or getEligiblePopups method missing');
                return res.json({ success: true, data: [] });
            }

            const eligiblePopups = await popupService.getEligiblePopups(userId, {
                currentPath,
                userAgent,
                screenWidth,
                timeOfDay,
                dayOfWeek
            });

            res.json(eligiblePopups);
        } catch (error) {
            logger.error('Error checking popup eligibility:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                data: []
            });
        }
    }
);

/**
 * Track popup events
 * POST /api/popups/track
 */
router.post('/track',
    // No role restriction - any authenticated user can track events
    body('popupId').isInt({ min: 1 }),
    body('eventType').isIn(['view', 'click', 'dismiss', 'step_change']),
    body('data').optional().isObject(),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const { popupId, eventType, data } = req.body;
            const userId = req.user.id;

            const actorId = resolveActorId(req);

            await popupService.trackPopupEvent(popupId, userId, eventType, data, actorId);

            res.status(204).send();
        } catch (error) {
            logger.error('Error tracking popup event:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Record user interaction with popup
 * POST /api/popups/:id/interact
 */
router.post('/:id/interact',
    // No role restriction - any authenticated user can interact with popups
    param('id').isInt({ min: 1 }),
    body('interaction_type').isIn(['viewed', 'dismissed', 'clicked_primary', 'clicked_secondary', 'completed_form', 'social_click', 'link_click']),
    body('interaction_data').optional().isObject(),
    body('step_number').optional().isInt({ min: 1 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const popupId = parseInt(req.params.id);
            const userId = req.user.id;
            const { interaction_type, interaction_data = {}, step_number = 1 } = req.body;

            // Add session info to interaction data
            const enrichedData = {
                ...interaction_data,
                sessionId: req.sessionID,
                pageUrl: req.get('Referer'),
                userAgent: req.get('User-Agent')
            };

            const actorId = resolveActorId(req);

            const interaction = await popupService.recordUserInteraction(
                popupId, 
                userId, 
                interaction_type, 
                enrichedData, 
                step_number,
                actorId
            );

            res.json({
                success: true,
                data: interaction,
                message: 'Interaction recorded successfully'
            });
        } catch (error) {
            logger.error('Error recording popup interaction:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Get all popup configurations (Admin only)
 * GET /api/popups
 */
router.get('/',
    authorize(['admin', 'manager']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('popup_type').optional().isString().trim(),
    query('is_active').optional().isBoolean().toBoolean(),
    query('search').optional().isString().trim(),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const limit = req.query.limit || 50;
            const offset = req.query.offset || 0;
            const filters = {
                popup_type: req.query.popup_type,
                is_active: req.query.is_active,
                search: req.query.search
            };

            const result = await popupService.getAllPopups(limit, offset, filters);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            logger.error('Error getting popups:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Get popup by ID (Admin only)
 * GET /api/popups/:id
 */
router.get('/:id',
    authorize(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const popupId = parseInt(req.params.id);

            // Get popup configuration
            const result = await popupService.getAllPopups(1, 0, {});
            const popup = result.popups.find(p => p.id === popupId);

            if (!popup) {
                return res.status(404).json({
                    success: false,
                    message: 'Popup not found'
                });
            }

            // Get content blocks and targeting rules
            const [contentBlocks, targetingRules] = await Promise.all([
                popupService.getPopupContent(popupId),
                // Add a method to get targeting rules
                // popupService.getTargetingRules(popupId)
            ]);

            res.json({
                success: true,
                data: {
                    ...popup,
                    content_blocks: contentBlocks,
                    targeting_rules: targetingRules || []
                }
            });
        } catch (error) {
            logger.error('Error getting popup:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Create new popup (Admin only)
 * POST /api/popups
 */
router.post('/',
    authorize(['admin', 'manager']),
    body('name').notEmpty().trim().isLength({ min: 1, max: 255 }),
    body('title').notEmpty().trim().isLength({ min: 1, max: 500 }),
    body('subtitle').optional().trim().isLength({ max: 500 }),
    body('body_text').optional().isString(),
    body('popup_type').optional().isIn(['welcome', 'feature', 'promotional', 'onboarding', 'feedback', 'newsletter', 'tutorial', 'social']),
    body('is_active').optional().isBoolean(),
    body('priority').optional().isInt({ min: 1, max: 10 }),
    body('content_blocks').optional().isArray(),
    body('targeting_rules').optional().isArray(),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const popup = await popupService.createPopup(req.body, req.user.id);

            res.status(201).json({
                success: true,
                data: popup,
                message: 'Popup created successfully'
            });
        } catch (error) {
            logger.error('Error creating popup:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Update popup (Admin only)
 * PUT /api/popups/:id
 */
router.put('/:id',
    authorize(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().isLength({ min: 1, max: 255 }),
    body('title').optional().trim().isLength({ min: 1, max: 500 }),
    body('subtitle').optional().trim().isLength({ max: 500 }),
    body('is_active').optional().isBoolean(),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const popupId = parseInt(req.params.id);
            const popup = await popupService.updatePopup(popupId, req.body, req.user.id);

            if (!popup) {
                return res.status(404).json({
                    success: false,
                    message: 'Popup not found'
                });
            }

            res.json({
                success: true,
                data: popup,
                message: 'Popup updated successfully'
            });
        } catch (error) {
            logger.error('Error updating popup:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Delete popup (Admin only)
 * DELETE /api/popups/:id
 */
router.delete('/:id',
    authorize(['admin']),
    param('id').isInt({ min: 1 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const popupId = parseInt(req.params.id);
            const popup = await popupService.deletePopup(popupId);

            if (!popup) {
                return res.status(404).json({
                    success: false,
                    message: 'Popup not found'
                });
            }

            res.json({
                success: true,
                message: 'Popup deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting popup:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Get popup analytics (Admin only)
 * GET /api/popups/:id/analytics
 */
router.get('/:id/analytics',
    authorize(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const popupId = parseInt(req.params.id);
            const { start_date, end_date } = req.query;

            const analytics = await popupService.getPopupAnalytics(popupId, start_date, end_date);

            res.json({
                success: true,
                data: analytics
            });
        } catch (error) {
            logger.error('Error getting popup analytics:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Get popup templates
 * GET /api/popups/templates
 */
router.get('/templates/list',
    authorize(['admin', 'manager']),
    query('template_type').optional().isString().trim(),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const templates = await popupService.getPopupTemplates(req.query.template_type);

            res.json({
                success: true,
                data: templates
            });
        } catch (error) {
            logger.error('Error getting popup templates:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

/**
 * Create popup from template
 * POST /api/popups/templates/:id/create
 */
router.post('/templates/:id/create',
    authorize(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    body('customizations').optional().isObject(),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Validation error', 
                    errors: errors.array() 
                });
            }

            const templateId = parseInt(req.params.id);
            const customizations = req.body.customizations || {};

            const popup = await popupService.createPopupFromTemplate(templateId, customizations, req.user.id);

            res.status(201).json({
                success: true,
                data: popup,
                message: 'Popup created from template successfully'
            });
        } catch (error) {
            logger.error('Error creating popup from template:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

export default router;
