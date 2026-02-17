// backend/routes/family.js
import express from 'express';
import { body, param } from 'express-validator';
import { authenticateJWT } from './auth.js';
import { authorizeRoles, validateInput } from '../middlewares/authorize.js';
import familyService from '../services/familyService.js';

const router = express.Router();

/**
 * Middleware to ensure user can only access their own family
 * Students can only access their own family members
 * Admins can access any family
 */
const ensureOwnFamily = (req, res, next) => {
  const userRole = req.user?.role;
  const requestedUserId = req.params.userId;
  const authenticatedUserId = req.user?.id;
  
  // Admins and managers can access any family
  if (userRole === 'admin' || userRole === 'manager' || userRole === 'owner') {
    return next();
  }
  
  // Students and outsiders can only access their own family
  if ((userRole === 'student' || userRole === 'outsider') && requestedUserId === authenticatedUserId) {
    return next();
  }
  
  return res.status(403).json({ 
    error: 'Forbidden: You can only access your own family members' 
  });
};

// Relationships that require under-18 age validation
const CHILD_RELATIONSHIPS = ['son', 'daughter', 'child', 'sibling'];

// Validation rules
const createFamilyMemberValidation = [
  body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 255 }).withMessage('Full name must be between 2 and 255 characters'),
  body('date_of_birth')
    .notEmpty().withMessage('Date of birth is required')
    .isDate().withMessage('Invalid date format'),
  body('relationship')
    .trim()
    .notEmpty().withMessage('Relationship is required')
    .isIn(['son', 'daughter', 'child', 'spouse', 'sibling', 'parent', 'other']).withMessage('Invalid relationship type'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer_not_to_say']).withMessage('Invalid gender'),
  body('medical_notes')
    .optional()
    .isString()
    .isLength({ max: 2000 }).withMessage('Medical notes must be less than 2000 characters'),
  body('emergency_contact')
    .optional()
    .isString()
    .isLength({ max: 50 }).withMessage('Emergency contact must be less than 50 characters'),
  body('photo_url')
    .optional()
    .isURL().withMessage('Invalid photo URL'),
  // Custom validation: age under 18 only for child relationships
  body('date_of_birth').custom((value, { req }) => {
    const relationship = req.body.relationship;
    if (CHILD_RELATIONSHIPS.includes(relationship)) {
      const isUnder18 = familyService.validateAgeUnder18(value);
      if (!isUnder18) {
        throw new Error('Children, sons, daughters, and siblings must be under 18 years old');
      }
    }
    return true;
  })
];

const updateFamilyMemberValidation = [
  body('full_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Full name must be between 2 and 255 characters'),
  body('date_of_birth')
    .optional()
    .isDate().withMessage('Invalid date format'),
  body('relationship')
    .optional()
    .isIn(['son', 'daughter', 'child', 'spouse', 'sibling', 'parent', 'other']).withMessage('Invalid relationship type'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer_not_to_say']).withMessage('Invalid gender'),
  body('medical_notes')
    .optional()
    .isString()
    .isLength({ max: 2000 }).withMessage('Medical notes must be less than 2000 characters'),
  body('emergency_contact')
    .optional()
    .isString()
    .isLength({ max: 50 }).withMessage('Emergency contact must be less than 50 characters'),
  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean'),
  // Custom validation: age under 18 only for child relationships
  body('date_of_birth').custom((value, { req }) => {
    if (!value) return true;
    // Get relationship from request body or it might be existing member relationship
    const relationship = req.body.relationship;
    if (relationship && CHILD_RELATIONSHIPS.includes(relationship)) {
      const isUnder18 = familyService.validateAgeUnder18(value);
      if (!isUnder18) {
        throw new Error('Children, sons, daughters, and siblings must be under 18 years old');
      }
    }
    return true;
  })
];

// GET /api/students/:userId/family - List all family members for a student
router.get(
  '/:userId/family',
  authenticateJWT,
  ensureOwnFamily,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const familyMembers = await familyService.getFamilyMembers(userId);
      
      res.json({
        success: true,
        count: familyMembers.length,
        data: familyMembers
      });
    } catch (error) {
      console.error('Error fetching family members:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch family members',
        message: error.message 
      });
    }
  }
);

// GET /api/students/:userId/family/export - Export family members as CSV
router.get(
  '/:userId/family/export',
  authenticateJWT,
  ensureOwnFamily,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const csv = await familyService.exportFamilyMembersCsv(userId);
      const timestamp = new Date().toISOString().split('T')[0];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="family-members-${timestamp}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Error exporting family members CSV:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export family members',
        message: error.message
      });
    }
  }
);

// GET /api/students/:userId/family/:memberId - Get single family member
router.get(
  '/:userId/family/:memberId',
  authenticateJWT,
  ensureOwnFamily,
  async (req, res) => {
    try {
      const { userId, memberId } = req.params;
      const member = await familyService.getFamilyMemberById(memberId, userId);
      
      if (!member) {
        return res.status(404).json({ 
          success: false,
          error: 'Family member not found' 
        });
      }
      
      res.json({
        success: true,
        data: member
      });
    } catch (error) {
      console.error('Error fetching family member:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch family member',
        message: error.message 
      });
    }
  }
);

// GET /api/students/:userId/family/:memberId/activity - Get combined activity timeline
router.get(
  '/:userId/family/:memberId/activity',
  authenticateJWT,
  ensureOwnFamily,
  async (req, res) => {
    try {
      const { userId, memberId } = req.params;
      const { limit, offset, types, startDate, endDate } = req.query;

      const data = await familyService.getFamilyMemberActivity(userId, memberId, {
        limit,
        offset,
        types: Array.isArray(types) ? types : types,
        startDate,
        endDate
      });

      res.json({
        success: true,
        data
      });
    } catch (error) {
      if (error?.status === 404 || error?.code === 'FAMILY_MEMBER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: 'Family member not found'
        });
      }

      console.error('Error fetching family member activity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch family member activity',
        message: error.message
      });
    }
  }
);

// POST /api/students/:userId/family - Create new family member
router.post(
  '/:userId/family',
  authenticateJWT,
  ensureOwnFamily,
  validateInput(createFamilyMemberValidation),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const memberData = req.body;
      
  const newMember = await familyService.createFamilyMember(memberData, userId, req.user.id);
      const response = {
        success: true,
        message: 'Family member created successfully',
        data: newMember
      };
      // If service returned warnings, include them for UI to optionally display
      if (Array.isArray(newMember?.warnings) && newMember.warnings.length > 0) {
        response.warnings = newMember.warnings;
      }
      res.status(201).json(response);
    } catch (error) {
      console.error('Error creating family member:', error);
      
      if (error.message.includes('under 18')) {
        return res.status(400).json({ 
          success: false,
          error: error.message 
        });
      }
      if (error.code === 'FAMILY_LIMIT_REACHED') {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: error.code
        });
      }
      
      res.status(500).json({ 
        success: false,
        error: 'Failed to create family member',
        message: error.message 
      });
    }
  }
);

// PUT /api/students/:userId/family/:memberId - Update family member
router.put(
  '/:userId/family/:memberId',
  authenticateJWT,
  ensureOwnFamily,
  validateInput(updateFamilyMemberValidation),
  async (req, res) => {
    try {
      const { userId, memberId } = req.params;
      const updates = req.body;
      
  const updatedMember = await familyService.updateFamilyMember(memberId, updates, userId, req.user.id);
      
      if (!updatedMember) {
        return res.status(404).json({ 
          success: false,
          error: 'Family member not found' 
        });
      }
      
      res.json({
        success: true,
        message: 'Family member updated successfully',
        data: updatedMember
      });
    } catch (error) {
      console.error('Error updating family member:', error);
      
      if (error.message.includes('under 18') || error.message.includes('not found')) {
        return res.status(400).json({ 
          success: false,
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false,
        error: 'Failed to update family member',
        message: error.message 
      });
    }
  }
);

// DELETE /api/students/:userId/family/:memberId - Soft delete family member
router.delete(
  '/:userId/family/:memberId',
  authenticateJWT,
  ensureOwnFamily,
  async (req, res) => {
    try {
      const { userId, memberId } = req.params;
      
  const deleted = await familyService.deleteFamilyMember(memberId, userId, req.user.id);
      
      if (!deleted) {
        return res.status(404).json({ 
          success: false,
          error: 'Family member not found' 
        });
      }
      
      res.json({
        success: true,
        message: 'Family member deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting family member:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to delete family member',
        message: error.message 
      });
    }
  }
);

export default router;
