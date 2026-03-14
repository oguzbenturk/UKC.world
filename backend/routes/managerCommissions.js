/**
 * Manager Commission Routes
 * 
 * API endpoints for manager commission management:
 * - Manager Dashboard: View own commissions and earnings
 * - Admin: Manage commission settings for all managers
 */

import express from 'express';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  getManagerCommissionSettings,
  getManagerCommissionSummary,
  getManagerCommissions,
  upsertManagerCommissionSettings,
  getAllManagersWithCommissionSettings,
  getManagerPayrollEarnings
} from '../services/managerCommissionService.js';

const router = express.Router();

// ============================================
// MANAGER ENDPOINTS (for their own dashboard)
// ============================================

/**
 * @route   GET /api/manager/commissions/dashboard
 * @desc    Get manager's own commission dashboard summary
 * @access  Manager only
 */
router.get('/dashboard', authenticateJWT, authorizeRoles(['manager']), async (req, res) => {
  try {
    const managerId = req.user.id;
    const { period, startDate, endDate } = req.query;

    // Get current month if no period specified
    const now = new Date();
    const currentPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get summary for current period
    const currentSummary = await getManagerCommissionSummary(managerId, { periodMonth: currentPeriod });

    // Get summary for previous month for comparison
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevSummary = await getManagerCommissionSummary(managerId, { periodMonth: prevPeriod });

    // Get YTD summary
    const yearStart = `${now.getFullYear()}-01-01`;
    const ytdSummary = await getManagerCommissionSummary(managerId, { startDate: yearStart });

    // Get commission settings
    const settings = await getManagerCommissionSettings(managerId);

    res.json({
      success: true,
      data: {
        currentPeriod: {
          period: currentPeriod,
          ...currentSummary
        },
        previousPeriod: {
          period: prevPeriod,
          ...prevSummary
        },
        yearToDate: ytdSummary,
        settings: settings ? {
          commissionType: settings.commission_type,
          defaultRate: parseFloat(settings.default_rate) || 10,
          bookingRate: settings.booking_rate ? parseFloat(settings.booking_rate) : null,
          rentalRate: settings.rental_rate ? parseFloat(settings.rental_rate) : null,
          salaryType: settings.salary_type || 'commission',
          fixedSalaryAmount: parseFloat(settings.fixed_salary_amount) || 0,
          perLessonAmount: parseFloat(settings.per_lesson_amount) || 0
        } : {
          commissionType: 'flat',
          defaultRate: 10,
          salaryType: 'commission'
        },
        comparison: {
          earningsChange: currentSummary.totalEarned - prevSummary.totalEarned,
          earningsChangePercent: prevSummary.totalEarned > 0 
            ? ((currentSummary.totalEarned - prevSummary.totalEarned) / prevSummary.totalEarned * 100).toFixed(1)
            : 0
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching manager dashboard:', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

/**
 * @route   GET /api/manager/commissions/history
 * @desc    Get manager's own commission history (paginated)
 * @access  Manager only
 */
router.get('/history', authenticateJWT, authorizeRoles(['manager']), async (req, res) => {
  try {
    const managerId = req.user.id;
    const { 
      sourceType, 
      status, 
      startDate, 
      endDate, 
      period,
      page = 1, 
      limit = 20 
    } = req.query;

    const result = await getManagerCommissions(managerId, {
      sourceType,
      status,
      startDate,
      endDate,
      periodMonth: period,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 100)
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error fetching manager commission history:', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, error: 'Failed to fetch commission history' });
  }
});

/**
 * @route   GET /api/manager/commissions/summary
 * @desc    Get manager's commission summary for a specific period
 * @access  Manager only
 */
router.get('/summary', authenticateJWT, authorizeRoles(['manager']), async (req, res) => {
  try {
    const managerId = req.user.id;
    const { startDate, endDate, period } = req.query;

    const summary = await getManagerCommissionSummary(managerId, {
      startDate,
      endDate,
      periodMonth: period
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error fetching manager commission summary:', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, error: 'Failed to fetch commission summary' });
  }
});

// ============================================
// ADMIN ENDPOINTS (manage all managers)
// ============================================

/**
 * @route   GET /api/manager/commissions/admin/managers
 * @desc    Get all managers with their commission settings
 * @access  Admin only
 */
router.get('/admin/managers', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const managers = await getAllManagersWithCommissionSettings();

    res.json({
      success: true,
      data: managers
    });
  } catch (error) {
    logger.error('Error fetching managers with settings:', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch managers' });
  }
});

/**
 * @route   GET /api/manager/commissions/admin/managers/:managerId/settings
 * @desc    Get specific manager's commission settings
 * @access  Admin only
 */
router.get('/admin/managers/:managerId/settings', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { managerId } = req.params;
    const settings = await getManagerCommissionSettings(managerId);

    res.json({
      success: true,
      data: settings ? {
        id: settings.id,
        managerUserId: settings.manager_user_id,
        commissionType: settings.commission_type,
        defaultRate: parseFloat(settings.default_rate) || 10,
        bookingRate: settings.booking_rate ? parseFloat(settings.booking_rate) : null,
        rentalRate: settings.rental_rate ? parseFloat(settings.rental_rate) : null,
        accommodationRate: settings.accommodation_rate ? parseFloat(settings.accommodation_rate) : null,
        packageRate: settings.package_rate ? parseFloat(settings.package_rate) : null,
        shopRate: settings.shop_rate ? parseFloat(settings.shop_rate) : null,
        membershipRate: settings.membership_rate ? parseFloat(settings.membership_rate) : null,
        salaryType: settings.salary_type || 'commission',
        fixedSalaryAmount: parseFloat(settings.fixed_salary_amount) || 0,
        perLessonAmount: parseFloat(settings.per_lesson_amount) || 0,
        tierSettings: settings.tier_settings,
        isActive: settings.is_active,
        effectiveFrom: settings.effective_from,
        effectiveUntil: settings.effective_until,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at
      } : null
    });
  } catch (error) {
    logger.error('Error fetching manager settings:', { error: error.message, managerId: req.params.managerId });
    res.status(500).json({ success: false, error: 'Failed to fetch manager settings' });
  }
});

/**
 * @route   PUT /api/manager/commissions/admin/managers/:managerId/settings
 * @desc    Create or update manager's commission settings
 * @access  Admin only
 */
router.put('/admin/managers/:managerId/settings', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { managerId } = req.params;
    const adminId = req.user.id;
    const {
      commissionType,
      defaultRate,
      bookingRate,
      rentalRate,
      accommodationRate,
      packageRate,
      shopRate,
      membershipRate,
      salaryType,
      fixedSalaryAmount,
      perLessonAmount,
      tierSettings,
      effectiveFrom,
      effectiveUntil
    } = req.body;

    // Validate salary type
    const validSalaryTypes = ['commission', 'fixed_per_lesson', 'monthly_salary'];
    if (salaryType && !validSalaryTypes.includes(salaryType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid salary type. Must be one of: ${validSalaryTypes.join(', ')}`
      });
    }

    // Validate commission type
    const validTypes = ['flat', 'per_category', 'tiered'];
    if (commissionType && !validTypes.includes(commissionType)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid commission type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    // Validate rates (0-100)
    const rateFields = { defaultRate, bookingRate, rentalRate, accommodationRate, packageRate, shopRate, membershipRate };
    for (const [name, value] of Object.entries(rateFields)) {
      if (value !== undefined && value !== null && (value < 0 || value > 100)) {
        return res.status(400).json({
          success: false,
          error: `${name} must be between 0 and 100`
        });
      }
    }

    // Validate fixed amounts
    if (fixedSalaryAmount !== undefined && fixedSalaryAmount < 0) {
      return res.status(400).json({ success: false, error: 'Fixed salary amount must be >= 0' });
    }
    if (perLessonAmount !== undefined && perLessonAmount < 0) {
      return res.status(400).json({ success: false, error: 'Per-lesson amount must be >= 0' });
    }

    const settings = await upsertManagerCommissionSettings(managerId, {
      commissionType,
      defaultRate,
      bookingRate,
      rentalRate,
      accommodationRate,
      packageRate,
      shopRate,
      membershipRate,
      salaryType,
      fixedSalaryAmount,
      perLessonAmount,
      tierSettings,
      effectiveFrom,
      effectiveUntil
    }, adminId);

    logger.info('Manager commission settings updated', { 
      managerId, 
      adminId, 
      commissionType: settings.commission_type,
      salaryType: settings.salary_type,
      defaultRate: settings.default_rate 
    });

    res.json({
      success: true,
      message: 'Commission settings saved successfully',
      data: {
        id: settings.id,
        managerUserId: settings.manager_user_id,
        commissionType: settings.commission_type,
        defaultRate: parseFloat(settings.default_rate) || 10,
        bookingRate: settings.booking_rate ? parseFloat(settings.booking_rate) : null,
        rentalRate: settings.rental_rate ? parseFloat(settings.rental_rate) : null,
        accommodationRate: settings.accommodation_rate ? parseFloat(settings.accommodation_rate) : null,
        packageRate: settings.package_rate ? parseFloat(settings.package_rate) : null,
        shopRate: settings.shop_rate ? parseFloat(settings.shop_rate) : null,
        membershipRate: settings.membership_rate ? parseFloat(settings.membership_rate) : null,
        salaryType: settings.salary_type || 'commission',
        fixedSalaryAmount: parseFloat(settings.fixed_salary_amount) || 0,
        perLessonAmount: parseFloat(settings.per_lesson_amount) || 0,
        isActive: settings.is_active
      }
    });
  } catch (error) {
    logger.error('Error updating manager settings:', { error: error.message, managerId: req.params.managerId });
    res.status(500).json({ success: false, error: 'Failed to update manager settings' });
  }
});

/**
 * @route   GET /api/manager/commissions/admin/managers/:managerId/commissions
 * @desc    Get specific manager's commission history (admin view)
 * @access  Admin only
 */
router.get('/admin/managers/:managerId/commissions', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { managerId } = req.params;
    const { 
      sourceType, 
      status, 
      startDate, 
      endDate, 
      period,
      page = 1, 
      limit = 20 
    } = req.query;

    const result = await getManagerCommissions(managerId, {
      sourceType,
      status,
      startDate,
      endDate,
      periodMonth: period,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 100)
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error fetching manager commissions:', { error: error.message, managerId: req.params.managerId });
    res.status(500).json({ success: false, error: 'Failed to fetch commission history' });
  }
});

/**
 * @route   GET /api/manager/commissions/admin/managers/:managerId/summary
 * @desc    Get specific manager's commission summary (admin view)
 * @access  Admin only
 */
router.get('/admin/managers/:managerId/summary', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { managerId } = req.params;
    const { startDate, endDate, period } = req.query;

    const summary = await getManagerCommissionSummary(managerId, {
      startDate,
      endDate,
      periodMonth: period
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error fetching manager summary:', { error: error.message, managerId: req.params.managerId });
    res.status(500).json({ success: false, error: 'Failed to fetch commission summary' });
  }
});

/**
 * @route   GET /api/manager/commissions/admin/managers/:managerId/payroll
 * @desc    Get manager's payroll earnings breakdown (monthly + seasonal)
 * @access  Admin only
 */
router.get('/admin/managers/:managerId/payroll', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { managerId } = req.params;
    const { year } = req.query;

    const payroll = await getManagerPayrollEarnings(managerId, {
      year: year ? parseInt(year) : undefined
    });

    res.json({
      success: true,
      data: payroll
    });
  } catch (error) {
    logger.error('Error fetching manager payroll:', { error: error.message, managerId: req.params.managerId });
    res.status(500).json({ success: false, error: 'Failed to fetch payroll data' });
  }
});

export default router;
