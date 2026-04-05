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
import { pool } from '../db.js';
import { resolveActorId } from '../utils/auditUtils.js';
import {
  recordTransaction as recordWalletTransaction,
  recordLegacyTransaction,
  getTransactionById as getWalletTransactionById
} from '../services/walletService.js';
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
          defaultRate: settings.default_rate != null ? parseFloat(settings.default_rate) : 10,
          bookingRate: settings.booking_rate != null ? parseFloat(settings.booking_rate) : null,
          rentalRate: settings.rental_rate != null ? parseFloat(settings.rental_rate) : null,
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

    const parsedLimit = parseInt(limit);
    const result = await getManagerCommissions(managerId, {
      sourceType,
      status,
      startDate,
      endDate,
      periodMonth: period,
      page: parseInt(page) || 1,
      limit: isNaN(parsedLimit) ? 20 : parsedLimit
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
        defaultRate: settings.default_rate != null ? parseFloat(settings.default_rate) : 10,
        bookingRate: settings.booking_rate != null ? parseFloat(settings.booking_rate) : null,
        rentalRate: settings.rental_rate != null ? parseFloat(settings.rental_rate) : null,
        accommodationRate: settings.accommodation_rate != null ? parseFloat(settings.accommodation_rate) : null,
        packageRate: settings.package_rate != null ? parseFloat(settings.package_rate) : null,
        shopRate: settings.shop_rate != null ? parseFloat(settings.shop_rate) : null,
        membershipRate: settings.membership_rate != null ? parseFloat(settings.membership_rate) : null,
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
        defaultRate: settings.default_rate != null ? parseFloat(settings.default_rate) : 10,
        bookingRate: settings.booking_rate != null ? parseFloat(settings.booking_rate) : null,
        rentalRate: settings.rental_rate != null ? parseFloat(settings.rental_rate) : null,
        accommodationRate: settings.accommodation_rate != null ? parseFloat(settings.accommodation_rate) : null,
        packageRate: settings.package_rate != null ? parseFloat(settings.package_rate) : null,
        shopRate: settings.shop_rate != null ? parseFloat(settings.shop_rate) : null,
        membershipRate: settings.membership_rate != null ? parseFloat(settings.membership_rate) : null,
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

    const parsedLimit = parseInt(limit);
    const result = await getManagerCommissions(managerId, {
      sourceType,
      status,
      startDate,
      endDate,
      periodMonth: period,
      page: parseInt(page) || 1,
      limit: isNaN(parsedLimit) ? 20 : parsedLimit
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

// ============================================
// MANAGER PAYMENT ENDPOINTS
// ============================================

/**
 * @route   GET /api/manager/commissions/admin/managers/:managerId/payment-history
 * @desc    Get manager's payment/deduction history
 * @access  Admin only
 */
router.get('/admin/managers/:managerId/payment-history', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { managerId } = req.params;
    const { rows } = await pool.query(
      `SELECT id, amount, transaction_type as type, description, payment_method,
              reference_number, created_at as payment_date
       FROM wallet_transactions
       WHERE user_id = $1
         AND entity_type = 'manager_payment'
         AND status != 'cancelled'
       ORDER BY created_at DESC`,
      [managerId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error fetching manager payment history:', { error: error.message, managerId: req.params.managerId });
    res.status(500).json({ success: false, error: 'Failed to fetch payment history' });
  }
});

/**
 * @route   POST /api/manager/commissions/admin/managers/:managerId/payments
 * @desc    Record a manager payment or deduction
 * @access  Admin only
 */
router.post('/admin/managers/:managerId/payments', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { managerId } = req.params;
    const { amount, description, payment_date, payment_method = 'cash' } = req.body;

    if (!amount || !description || !payment_date) {
      return res.status(400).json({ error: 'Missing required fields: amount, description, payment_date' });
    }

    const transactionAmount = parseFloat(amount);
    const transactionType = transactionAmount < 0 ? 'deduction' : 'payment';
    const actorId = resolveActorId(req);
    const paymentDate = payment_date ? new Date(payment_date) : new Date();
    const referenceNumber = `MGR_${Date.now()}`;

    const transactionRecord = await recordLegacyTransaction({
      userId: managerId,
      amount: transactionAmount,
      transactionType,
      status: 'completed',
      direction: transactionAmount >= 0 ? 'credit' : 'debit',
      description,
      paymentMethod: payment_method || null,
      referenceNumber,
      metadata: {
        source: 'manager-commissions:payments:create',
        paymentDate: paymentDate.toISOString(),
        referenceNumber
      },
      entityType: 'manager_payment',
      relatedEntityType: 'manager',
      relatedEntityId: managerId,
      createdBy: actorId || null
    });

    res.json({
      success: true,
      transaction: transactionRecord,
      message: `Manager ${transactionType} recorded successfully`
    });
  } catch (error) {
    logger.error('Error recording manager payment:', { error: error.message, managerId: req.params.managerId });
    res.status(500).json({ error: 'Failed to record manager payment' });
  }
});

/**
 * @route   PUT /api/manager/commissions/admin/managers/:managerId/payments/:paymentId
 * @desc    Update an existing manager payment
 * @access  Admin only
 */
router.put('/admin/managers/:managerId/payments/:paymentId', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { paymentId } = req.params;
    const { amount, description, payment_date, payment_method = 'cash' } = req.body;

    if (!amount || !description || !payment_date) {
      client.release();
      return res.status(400).json({ error: 'Missing required fields: amount, description, payment_date' });
    }

    const transaction = await getWalletTransactionById(paymentId);
    if (!transaction) {
      client.release();
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (!['payment', 'deduction'].includes(transaction.transaction_type)) {
      client.release();
      return res.status(400).json({ error: 'Only payment/deduction transactions can be updated' });
    }

    const actorId = resolveActorId(req) || null;
    const newAmount = parseFloat(amount);
    const transactionType = newAmount < 0 ? 'deduction' : 'payment';

    await client.query('BEGIN');

    const originalAmount = parseFloat(transaction.amount) || 0;
    const availableDelta = parseFloat(transaction.available_delta) || originalAmount;
    const pendingDelta = parseFloat(transaction.pending_delta) || 0;
    const nonWithdrawableDelta = parseFloat(transaction.non_withdrawable_delta) || 0;

    // Cancel old transaction
    await client.query(
      `UPDATE wallet_transactions SET status = 'cancelled',
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
       WHERE id = $1`,
      [paymentId, JSON.stringify({ updatedBy: actorId, updatedAt: new Date().toISOString() })]
    );

    // Reversal
    if (Math.abs(availableDelta) > 0 || Math.abs(pendingDelta) > 0 || Math.abs(nonWithdrawableDelta) > 0) {
      await recordWalletTransaction({
        userId: transaction.user_id,
        amount: -originalAmount,
        availableDelta: -availableDelta,
        pendingDelta: -pendingDelta,
        nonWithdrawableDelta: -nonWithdrawableDelta,
        transactionType: `${transaction.transaction_type}_reversal`,
        currency: transaction.currency || 'EUR',
        description: `Reversal for manager payment ${transaction.id}`,
        metadata: { origin: 'manager-commissions:payments:update:reversal', reversedTransactionId: transaction.id },
        relatedEntityType: 'manager_payment',
        relatedEntityId: transaction.related_entity_id || transaction.id,
        createdBy: actorId,
        allowNegative: true,
        client
      });
    }

    // New replacement transaction
    const updated = await recordLegacyTransaction({
      userId: transaction.user_id,
      amount: newAmount,
      transactionType,
      status: 'completed',
      direction: newAmount >= 0 ? 'credit' : 'debit',
      description,
      paymentMethod: payment_method || null,
      referenceNumber: transaction.reference_number || `MGR_${Date.now()}`,
      metadata: {
        source: 'manager-commissions:payments:update',
        replacesTransactionId: transaction.id,
        paymentDate: (payment_date ? new Date(payment_date) : new Date()).toISOString(),
        previousAmount: originalAmount
      },
      entityType: 'manager_payment',
      relatedEntityType: 'manager',
      relatedEntityId: transaction.user_id,
      createdBy: actorId,
      client
    });

    await client.query('COMMIT');
    res.json({ success: true, transaction: updated, message: 'Manager payment updated successfully' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    logger.error('Error updating manager payment:', { error: error.message });
    res.status(500).json({ error: 'Failed to update manager payment' });
  } finally {
    client.release();
  }
});

/**
 * @route   DELETE /api/manager/commissions/admin/managers/:managerId/payments/:paymentId
 * @desc    Delete (cancel) a manager payment
 * @access  Admin only
 */
router.delete('/admin/managers/:managerId/payments/:paymentId', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { paymentId } = req.params;

    await client.query('BEGIN');

    const transaction = await getWalletTransactionById(paymentId);
    if (!transaction) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (!['payment', 'deduction'].includes(transaction.transaction_type)) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Only payment/deduction transactions can be deleted' });
    }

    const actorId = resolveActorId(req) || null;
    const originalAmount = parseFloat(transaction.amount) || 0;
    const availableDelta = parseFloat(transaction.available_delta) || originalAmount;
    const pendingDelta = parseFloat(transaction.pending_delta) || 0;
    const nonWithdrawableDelta = parseFloat(transaction.non_withdrawable_delta) || 0;

    await client.query(
      `UPDATE wallet_transactions SET status = 'cancelled',
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
       WHERE id = $1`,
      [paymentId, JSON.stringify({ cancelledBy: actorId, cancelledAt: new Date().toISOString() })]
    );

    if (Math.abs(availableDelta) > 0 || Math.abs(pendingDelta) > 0 || Math.abs(nonWithdrawableDelta) > 0) {
      await recordWalletTransaction({
        userId: transaction.user_id,
        amount: -originalAmount,
        availableDelta: -availableDelta,
        pendingDelta: -pendingDelta,
        nonWithdrawableDelta: -nonWithdrawableDelta,
        transactionType: `${transaction.transaction_type}_reversal`,
        currency: transaction.currency || 'EUR',
        description: `Reversal for manager payment ${transaction.id}`,
        metadata: { origin: 'manager-commissions:payments:delete:reversal', reversedTransactionId: transaction.id },
        relatedEntityType: 'manager_payment',
        relatedEntityId: transaction.related_entity_id || transaction.id,
        createdBy: actorId,
        allowNegative: true,
        client
      });
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Manager payment deleted successfully' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    logger.error('Error deleting manager payment:', { error: error.message });
    res.status(500).json({ error: 'Failed to delete manager payment' });
  } finally {
    client.release();
  }
});

export default router;
