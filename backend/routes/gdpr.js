import express from 'express';
import gdprDataExportService from '../services/gdprDataExportService.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

/**
 * @route GET /api/gdpr/export
 * @desc Export all user data (GDPR Article 15 - Right of Access)
 * @access Private (User can only export their own data)
 */
router.get('/export', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info('GDPR data export requested', { userId, email: req.user.email });

    const dataPackage = await gdprDataExportService.exportUserData(userId);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gdpr_data_export_${userId}_${Date.now()}.json"`);

    res.json({
      success: true,
      data: dataPackage
    });
  } catch (error) {
    logger.error('GDPR data export failed', { 
      userId: req.user?.id, 
      error: error.message 
    });

    res.status(500).json({
      success: false,
      message: 'Failed to export user data',
      error: error.message
    });
  }
});

/**
 * @route POST /api/gdpr/export/:userId
 * @desc Export user data by admin (for handling formal GDPR requests)
 * @access Private (Admin only)
 */
router.post('/export/:userId', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;

    logger.info('Admin GDPR data export requested', { 
      adminId: req.user.id, 
      targetUserId: userId 
    });

    const dataPackage = await gdprDataExportService.exportUserData(userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gdpr_data_export_${userId}_${Date.now()}.json"`);

    res.json({
      success: true,
      data: dataPackage,
      exportedBy: req.user.email,
      exportedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Admin GDPR data export failed', { 
      adminId: req.user?.id, 
      targetUserId: req.params.userId,
      error: error.message 
    });

    res.status(500).json({
      success: false,
      message: 'Failed to export user data',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/gdpr/anonymize
 * @desc Anonymize user data (GDPR Article 17 - Right to Erasure)
 * @access Private (User can only anonymize their own data)
 */
router.delete('/anonymize', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    logger.warn('GDPR data anonymization requested', { 
      userId, 
      email: req.user.email 
    });

    const result = await gdprDataExportService.anonymizeUserData(userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('GDPR data anonymization failed', { 
      userId: req.user?.id, 
      error: error.message 
    });

    res.status(500).json({
      success: false,
      message: 'Failed to anonymize user data',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/gdpr/anonymize/:userId
 * @desc Anonymize user data by admin (for handling formal GDPR erasure requests)
 * @access Private (Admin only)
 */
router.delete('/anonymize/:userId', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;

    logger.warn('Admin GDPR data anonymization requested', { 
      adminId: req.user.id, 
      targetUserId: userId 
    });

    const result = await gdprDataExportService.anonymizeUserData(userId);

    res.json({
      success: true,
      ...result,
      processedBy: req.user.email,
      processedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Admin GDPR data anonymization failed', { 
      adminId: req.user?.id, 
      targetUserId: req.params.userId,
      error: error.message 
    });

    res.status(500).json({
      success: false,
      message: 'Failed to anonymize user data',
      error: error.message
    });
  }
});

/**
 * @route GET /api/gdpr/rights
 * @desc Get information about GDPR rights
 * @access Public
 */
router.get('/rights', (req, res) => {
  res.json({
    success: true,
    rights: {
      rightToAccess: {
        article: 'Article 15',
        description: 'You have the right to obtain confirmation of whether personal data concerning you is being processed and access to that data.',
        howToExercise: 'Use the data export feature in your account settings or contact privacy@plannivo.com'
      },
      rightToRectification: {
        article: 'Article 16',
        description: 'You have the right to request correction of inaccurate personal data.',
        howToExercise: 'Update your profile in account settings or contact support@plannivo.com'
      },
      rightToErasure: {
        article: 'Article 17',
        description: 'You have the right to request deletion of your personal data (Right to be Forgotten). Note: Financial records must be retained for 7 years per tax law.',
        howToExercise: 'Use the data deletion feature in account settings or contact privacy@plannivo.com'
      },
      rightToRestriction: {
        article: 'Article 18',
        description: 'You have the right to request restriction of processing your personal data.',
        howToExercise: 'Contact privacy@plannivo.com'
      },
      rightToPortability: {
        article: 'Article 20',
        description: 'You have the right to receive your personal data in a structured, machine-readable format (JSON).',
        howToExercise: 'Use the data export feature to download your data as JSON'
      },
      rightToObject: {
        article: 'Article 21',
        description: 'You have the right to object to processing of your personal data.',
        howToExercise: 'Contact privacy@plannivo.com'
      },
      rightToWithdrawConsent: {
        article: 'Article 7(3)',
        description: 'You have the right to withdraw consent at any time for marketing communications.',
        howToExercise: 'Update your communication preferences in account settings'
      },
      rightToLodgeComplaint: {
        article: 'Article 77',
        description: 'You have the right to lodge a complaint with a supervisory authority.',
        howToExercise: 'Contact your local data protection authority or privacy@plannivo.com'
      }
    },
    contact: {
      privacy: 'privacy@plannivo.com',
      dataProtectionOfficer: 'dpo@plannivo.com',
      support: 'support@plannivo.com'
    },
    responseTime: 'We will respond to your request within 30 days as required by GDPR Article 12.'
  });
});

export default router;
