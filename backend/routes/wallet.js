import express from 'express';
import rateLimit from 'express-rate-limit'; // Phase 2: Rate Limit
import { body, validationResult } from 'express-validator'; // Phase 2: Validation
import { pool } from '../db.js';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { logPaymentEvent, sendPaymentAlert } from '../services/alertService.js'; // Phase 3: Monitoring
import {
  getBalance,
  getAllBalances,
  fetchTransactions,
  recordTransaction,
  getWalletSettings,
  saveWalletSettings,
  updateWalletPreferences,
  listBankAccounts,
  saveBankAccount,
  setBankAccountStatus,
  createDepositRequest,
  initiateBinancePayDeposit,
  listPaymentMethods,
  listKycDocuments,
  submitKycDocument,
  reviewKycDocument,
  updatePaymentMethodVerificationStatus,
  listUserDepositRequests,
  listDepositRequests,
  approveDepositRequest,
  rejectDepositRequest,
  requestWithdrawal,
  approveWithdrawal,
  finalizeWithdrawal,
  listWithdrawalRequests
} from '../services/walletService.js';
import { refundPayment as iyzicoRefund } from '../services/paymentGateways/iyzicoGateway.js';
import { resolveActorId } from '../utils/auditUtils.js';

// Phase 2: Rate Limiting (with Phase 3 alert on exceed)
const depositLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 5, // Max 5 istek
  message: { error: 'Çok fazla ödeme isteği. Lütfen 1 dakika bekleyin.' },
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    // Rate limit aşıldığında alert gönder
    const clientIp = getClientIp(req);
    const userId = req.user?.id;
    
    logPaymentEvent('rate_limit_exceeded', {
      userId,
      clientIp,
      endpoint: '/wallet/deposit',
      status: 'blocked'
    });
    
    // 3+ kez aşıldığında Slack alert
    sendPaymentAlert('rate_limit_exceeded', {
      userId,
      clientIp,
      endpoint: '/wallet/deposit'
    });
    
    res.status(options.statusCode).json(options.message);
  }
});

// Phase 2: IP Extraction Helper
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded 
    ? forwarded.split(',')[0].trim() 
    : req.socket?.remoteAddress || req.connection?.remoteAddress;
  
  if (process.env.NODE_ENV === 'production' && (!ip || ip === '::1')) {
    logger.warn('Invalid client IP detected', { forwarded, ip });
  }
  
  return ip || '127.0.0.1';
}

const router = express.Router();

router.get('/summary', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Currency parameter from frontend (should always be EUR for storage)
    // If not provided, default to EUR (the storage currency)
    const requestedCurrency = req.query.currency || 'EUR';

    const summary = await getBalance(userId, requestedCurrency);

    // Also fetch all currency balances so the frontend can aggregate
    const allBalances = await getAllBalances(userId);
    
    res.json({ userId, ...summary, balances: allBalances });
  } catch (error) {
    logger.error('Failed to fetch wallet summary:', error);
    res.status(500).json({ error: 'Failed to fetch wallet summary' });
  }
});

router.get('/transactions', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
    const offset = Number.parseInt(req.query.offset, 10) || 0;

    const transactions = await fetchTransactions(userId, {
      limit,
      offset,
      currency: req.query.currency,
      status: req.query.status,
      transactionType: req.query.transactionType
    });

    res.json({ userId, results: transactions, pagination: { limit, offset } });
  } catch (error) {
    logger.error('Failed to fetch wallet transactions:', error);
    res.status(500).json({ error: 'Failed to fetch wallet transactions' });
  }
});

router.get('/settings', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const includeDefaults = req.query.includeDefaults !== 'false';
    const settings = await getWalletSettings({
      scopeType: 'user',
      scopeId: userId,
      currency: req.query.currency,
      includeDefaults
    });

    res.json({ scopeType: 'user', scopeId: userId, settings });
  } catch (error) {
    logger.error('Failed to fetch wallet settings:', error);
    res.status(500).json({ error: 'Failed to fetch wallet settings' });
  }
});

router.post('/settings/preferences', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { preferences = {}, currency } = req.body || {};

    const updated = await updateWalletPreferences({
      userId,
      preferences,
      currency,
      updatedBy: resolveActorId(req)
    });

    res.json({ message: 'Wallet preferences updated', settings: updated });
  } catch (error) {
    logger.error('Failed to update wallet preferences:', error);
    res.status(500).json({ error: error.message || 'Failed to update wallet preferences' });
  }
});

router.get('/payment-methods', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const includeInactive = req.query.includeInactive === 'true';

    const results = await listPaymentMethods({
      userId,
      status: req.query.status,
      verificationStatus: req.query.verificationStatus,
      type: req.query.type,
      provider: req.query.provider,
      includeInactive,
      limit,
      offset
    });

    res.json({
      results,
      pagination: { limit, offset }
    });
  } catch (error) {
    logger.error('Failed to fetch wallet payment methods:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch wallet payment methods' });
  }
});

router.post('/payment-methods/:id/kyc-documents', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const paymentMethodId = req.params.id;
    const { documentType, fileUrl, storagePath, metadata } = req.body || {};

    if (!documentType) {
      return res.status(400).json({ error: 'documentType is required' });
    }

    const document = await submitKycDocument({
      userId,
      paymentMethodId,
      documentType,
      fileUrl,
      storagePath,
      metadata,
      submittedBy: resolveActorId(req)
    });

    res.status(201).json({ message: 'KYC document submitted', document });
  } catch (error) {
    logger.error('Failed to submit wallet KYC document:', error);
    res.status(500).json({ error: error.message || 'Failed to submit KYC document' });
  }
});

router.get('/kyc/documents', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    const results = await listKycDocuments({
      userId,
      paymentMethodId: req.query.paymentMethodId,
      status: req.query.status,
      limit,
      offset
    });

    res.json({
      results,
      pagination: { limit, offset }
    });
  } catch (error) {
    logger.error('Failed to fetch wallet KYC documents:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch KYC documents' });
  }
});

router.get('/bank-accounts', authenticateJWT, async (req, res) => {
  try {
    const scopeType = req.query.scopeType || 'global';
    const scopeId = req.query.scopeId;

    if (scopeType !== 'global' && !scopeId) {
      return res.status(400).json({ error: 'scopeId is required for non-global bank accounts' });
    }

    const accounts = await listBankAccounts({
      scopeType,
      scopeId,
      currency: req.query.currency,
      includeInactive: false
    });

    res.json({ results: accounts });
  } catch (error) {
    logger.error('Failed to fetch wallet bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch wallet bank accounts' });
  }
});

router.post('/deposit', authenticateJWT, depositLimiter, [
  body('amount').toFloat().isFloat({ min: 1, max: 50000 }).withMessage('Amount must be between 1 and 50,000'),
  body('currency').isIn(['TRY', 'EUR', 'USD', 'GBP']).withMessage('Geçersiz para birimi'),
  body('gateway').optional().isIn(['stripe', 'iyzico', 'paytr', 'binance_pay']).withMessage('Geçersiz ödeme yöntemi')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      amount,
      currency,
      method,
      metadata,
      referenceCode,
      proofUrl,
      notes,
      autoComplete,
      gateway,
      gatewayTransactionId,
      bankAccountId,
      bankReference,
      paymentMethodId,
      verification,
      idempotencyKey
    } = req.body || {};

    // IP Extraction for gateways
    const clientIp = getClientIp(req);

    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'amount is required' });
    }

    if ((method || '').toLowerCase() === 'bank_transfer' && !bankAccountId) {
      return res.status(400).json({ error: 'bankAccountId is required for bank transfer deposits' });
    }

    const result = await createDepositRequest({
      userId,
      amount,
      clientIp,
      currency,
      method,
      metadata,
      referenceCode,
      proofUrl,
      notes,
      autoComplete,
      gateway,
      gatewayTransactionId,
      bankAccountId,
      bankReference,
      paymentMethodId,
      verification,
      idempotencyKey
    });

    // Notify admins/managers of new bank transfer deposit via Socket.IO
    if ((method || '').toLowerCase() === 'bank_transfer' && req.socketService) {
      const depositNotification = {
        deposit: result.deposit,
        userName: req.user?.name || req.user?.email,
      };
      req.socketService.emitToRole('admin', 'wallet:deposit_created', depositNotification);
      req.socketService.emitToRole('manager', 'wallet:deposit_created', depositNotification);
    }

    res.status(201).json(result);
  } catch (error) {
    logger.error('Failed to create deposit request:', error);
    res.status(500).json({ error: error.message || 'Failed to create deposit request' });
  }
});

router.post('/deposit/binance-pay', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { amount, currency, metadata, redirectUrl, cancelUrl, successUrl } = req.body || {};

    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const result = await initiateBinancePayDeposit({
      userId,
      amount,
      currency,
      metadata,
      redirectUrl,
      cancelUrl,
      successUrl
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error('Failed to initiate Binance Pay deposit:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate Binance Pay deposit' });
  }
});

// GET /deposits/:id/status — user polls their deposit status after iyzico payment
router.get('/deposits/:id/status', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const depositId = req.params.id;
    if (!depositId) {
      return res.status(400).json({ error: 'Deposit ID is required' });
    }

    const { rows } = await pool.query(
      `SELECT id, status, amount, currency, method, failure_reason, metadata, created_at, completed_at
       FROM wallet_deposit_requests
       WHERE id = $1 AND user_id = $2`,
      [depositId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    const deposit = rows[0];
    res.json({
      id: deposit.id,
      status: deposit.status,
      amount: deposit.amount,
      currency: deposit.currency,
      method: deposit.method,
      failureReason: deposit.failure_reason,
      createdAt: deposit.created_at,
      completedAt: deposit.completed_at
    });
  } catch (error) {
    logger.error('Failed to fetch deposit status:', error);
    res.status(500).json({ error: 'Failed to fetch deposit status' });
  }
});

router.get('/deposits', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const status = req.query.status;
    const method = req.query.method;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const sortDirection = req.query.sortDirection;

    const results = await listUserDepositRequests({
      userId,
      status,
      method,
      limit,
      offset,
      startDate,
      endDate,
      sortDirection
    });

    res.json({
      userId,
      results,
      pagination: { limit, offset }
    });
  } catch (error) {
    logger.error('Failed to fetch wallet deposits:', error);
    res.status(500).json({ error: 'Failed to fetch wallet deposits' });
  }
});

router.get(
  '/admin/deposits',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
      const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
      const status = req.query.status;
      const method = req.query.method;
      const userIdFilter = req.query.userId;
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const sortDirection = req.query.sortDirection;

      const results = await listDepositRequests({
        userId: userIdFilter,
        status,
        method,
        limit,
        offset,
        startDate,
        endDate,
        sortDirection,
        includeUserDetails: true
      });

      res.json({
        results,
        pagination: { limit, offset }
      });
    } catch (error) {
      logger.error('Failed to fetch admin deposit requests:', error);
      res.status(500).json({ error: 'Failed to fetch wallet deposit requests' });
    }
  }
);

router.post(
  '/admin/deposits/:id/approve',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const metadata = req.body?.metadata;
      const verification = req.body?.verification;
      const notes = req.body?.notes;

      const result = await approveDepositRequest({
        requestId: req.params.id,
        processorId: resolveActorId(req),
        metadata,
        notes,
        verification
      });

      // Notify the student that their deposit was approved
      if (req.socketService && result.deposit?.userId) {
        req.socketService.emitToChannel(`user:${result.deposit.userId}`, 'wallet:deposit_approved', {
          deposit: result.deposit
        });
      }

      res.json({ message: 'Deposit approved', ...result });
    } catch (error) {
      logger.error('Failed to approve deposit request:', error);
      res.status(500).json({ error: error.message || 'Failed to approve deposit request' });
    }
  }
);

router.post(
  '/admin/deposits/:id/reject',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const { failureReason, metadata, notes } = req.body || {};

      const result = await rejectDepositRequest({
        requestId: req.params.id,
        processorId: resolveActorId(req),
        failureReason,
        metadata,
        notes
      });

      // Notify the student that their deposit was rejected
      const rejectedDeposit = result.deposit || result;
      if (req.socketService && rejectedDeposit?.userId) {
        req.socketService.emitToChannel(`user:${rejectedDeposit.userId}`, 'wallet:deposit_rejected', {
          deposit: rejectedDeposit
        });
      }

      res.json({ message: 'Deposit rejected', deposit: result });
    } catch (error) {
      logger.error('Failed to reject deposit request:', error);
      res.status(500).json({ error: error.message || 'Failed to reject deposit request' });
    }
  }
);

router.post(
  '/admin/payment-methods/:id/verification',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const { status, notes, metadata, verifiedAt } = req.body || {};

      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }

      const updated = await updatePaymentMethodVerificationStatus({
        paymentMethodId: req.params.id,
        status,
        notes,
        metadata,
        verifiedAt,
        reviewerId: resolveActorId(req)
      });

      res.json({ message: 'Payment method verification updated', paymentMethod: updated });
    } catch (error) {
      logger.error('Failed to update payment method verification:', error);
      res.status(500).json({ error: error.message || 'Failed to update payment method verification' });
    }
  }
);

router.post(
  '/admin/kyc/documents/:id/review',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const { status, reviewNotes, rejectionReason, metadata } = req.body || {};

      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }

      const document = await reviewKycDocument({
        documentId: req.params.id,
        status,
        reviewNotes,
        rejectionReason,
        metadata,
        reviewerId: resolveActorId(req)
      });

      res.json({ message: 'KYC document reviewed', document });
    } catch (error) {
      logger.error('Failed to review KYC document:', error);
      res.status(500).json({ error: error.message || 'Failed to review KYC document' });
    }
  }
);

router.post(
  '/manual-adjust',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const { userId, amount, currency, transactionType, description, metadata, allowNegative } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const numericAmount = Number.parseFloat(amount);
      if (Number.isNaN(numericAmount) || numericAmount === 0) {
        return res.status(400).json({ error: 'Amount must be a non-zero number' });
      }

      const actorId = resolveActorId(req);

      const transaction = await recordTransaction({
        userId,
        amount: numericAmount,
        transactionType: transactionType || (numericAmount > 0 ? 'manual_credit' : 'manual_debit'),
        currency,
        status: 'completed',
        metadata: metadata || {},
        description,
        createdBy: actorId,
        allowNegative: allowNegative === true
      });

      res.status(201).json({ message: 'Wallet adjusted successfully', transaction });
    } catch (error) {
      logger.error('Failed to adjust wallet manually:', error);
      res.status(500).json({ error: 'Failed to adjust wallet' });
    }
  }
);

router.get(
  '/admin/settings',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const scopeType = req.query.scopeType || 'global';
      const scopeId = req.query.scopeId;
      const includeDefaults = req.query.includeDefaults !== 'false';

      if (scopeType !== 'global' && !scopeId) {
        return res.status(400).json({ error: 'scopeId is required for non-global settings' });
      }

      const settings = await getWalletSettings({
        scopeType,
        scopeId,
        currency: req.query.currency,
        includeDefaults
      });

      res.json({ scopeType, scopeId: scopeId || null, settings });
    } catch (error) {
      logger.error('Failed to fetch admin wallet settings:', error);
      res.status(500).json({ error: 'Failed to fetch wallet settings' });
    }
  }
);

router.put(
  '/admin/settings',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const { scopeType = 'global', scopeId, currency, settings } = req.body || {};

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'settings payload is required' });
      }

      if (scopeType !== 'global' && !scopeId) {
        return res.status(400).json({ error: 'scopeId is required for non-global settings' });
      }

      const actorId = resolveActorId(req);

      const updated = await saveWalletSettings({
        scopeType,
        scopeId,
        currency,
        settings,
        updatedBy: actorId
      });

      res.json({ message: 'Wallet settings saved', settings: updated });
    } catch (error) {
      logger.error('Failed to save wallet settings:', error);
      res.status(500).json({ error: error.message || 'Failed to save wallet settings' });
    }
  }
);

router.get(
  '/admin/bank-accounts',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const scopeType = req.query.scopeType || 'global';
      const scopeId = req.query.scopeId;
      const includeInactive = req.query.includeInactive === 'true';

      if (scopeType !== 'global' && !scopeId) {
        return res.status(400).json({ error: 'scopeId is required for non-global bank accounts' });
      }

      const accounts = await listBankAccounts({
        scopeType,
        scopeId,
        currency: req.query.currency,
        includeInactive
      });

      res.json({ results: accounts });
    } catch (error) {
      logger.error('Failed to fetch admin bank accounts:', error);
      res.status(500).json({ error: 'Failed to fetch bank accounts' });
    }
  }
);

router.post(
  '/admin/bank-accounts',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const payload = req.body || {};
      const scopeType = payload.scopeType || 'global';
      const scopeId = payload.scopeId;

      if (scopeType !== 'global' && !scopeId) {
        return res.status(400).json({ error: 'scopeId is required for non-global bank accounts' });
      }

      const actorId = resolveActorId(req);

      const account = await saveBankAccount({
        id: payload.id,
        scopeType,
        scopeId,
        currency: payload.currency,
        bankName: payload.bankName,
        accountHolder: payload.accountHolder,
        accountNumber: payload.accountNumber,
        iban: payload.iban,
        swiftCode: payload.swiftCode,
        routingNumber: payload.routingNumber,
        instructions: payload.instructions,
        metadata: payload.metadata,
        isActive: payload.isActive,
        isPrimary: payload.isPrimary,
        displayOrder: payload.displayOrder,
        updatedBy: actorId
      });

      res.status(payload.id ? 200 : 201).json({ message: 'Bank account saved', account });
    } catch (error) {
      logger.error('Failed to save bank account:', error);
      if (error.message === 'Bank account not found') {
        return res.status(404).json({ error: 'Bank account not found' });
      }
      res.status(500).json({ error: error.message || 'Failed to save bank account' });
    }
  }
);

router.post(
  '/admin/bank-accounts/:id/status',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { scopeType = 'global', scopeId, isActive } = req.body || {};

      if (scopeType !== 'global' && !scopeId) {
        return res.status(400).json({ error: 'scopeId is required for non-global bank accounts' });
      }

      const actorId = resolveActorId(req);

      const account = await setBankAccountStatus({
        id,
        scopeType,
        scopeId,
        isActive,
        updatedBy: actorId
      });

      res.json({ message: 'Bank account status updated', account });
    } catch (error) {
      logger.error('Failed to update bank account status:', error);
      if (error.message === 'Bank account not found') {
        return res.status(404).json({ error: 'Bank account not found' });
      }
      res.status(500).json({ error: error.message || 'Failed to update bank account status' });
    }
  }
);

router.post('/withdrawals', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { amount, currency, payoutMethodId, metadata } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const request = await requestWithdrawal({
      userId,
      amount,
      currency,
      payoutMethodId,
      metadata
    });

    res.status(201).json({ message: 'Withdrawal request submitted', request });
  } catch (error) {
    logger.error('Failed to create withdrawal request:', error);
    res.status(500).json({ error: error.message || 'Failed to create withdrawal request' });
  }
});

router.get('/withdrawals', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    const status = req.query.status;

    const items = await listWithdrawalRequests({
      userId,
      status,
      limit,
      offset,
      includeUserDetails: false
    });

    res.json({
      userId,
      results: items,
      pagination: { limit, offset }
    });
  } catch (error) {
    logger.error('Failed to fetch wallet withdrawal requests:', error);
    res.status(500).json({ error: 'Failed to fetch wallet withdrawal requests' });
  }
});

router.post(
  '/withdrawals/:id/approve',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const updated = await approveWithdrawal({
        requestId: req.params.id,
        approverId: resolveActorId(req),
        autoApproved: Boolean(req.body.autoApproved)
      });

      res.json({ message: 'Withdrawal approval recorded', request: updated });
    } catch (error) {
      logger.error('Failed to approve withdrawal:', error);
      res.status(500).json({ error: error.message || 'Failed to approve withdrawal' });
    }
  }
);

router.post(
  '/withdrawals/:id/finalize',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const { success = true, metadata = {} } = req.body || {};
      const result = await finalizeWithdrawal({
        requestId: req.params.id,
        processorId: resolveActorId(req),
        success: success !== false,
        metadata
      });

      res.json({ message: 'Withdrawal finalization recorded', request: result });
    } catch (error) {
      logger.error('Failed to finalize withdrawal:', error);
      res.status(500).json({ error: error.message || 'Failed to finalize withdrawal' });
    }
  }
);

router.get(
  '/admin/withdrawals',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
      const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
      const status = req.query.status;
      const userIdFilter = req.query.userId;

      const results = await listWithdrawalRequests({
        userId: userIdFilter,
        status,
        limit,
        offset,
        includeUserDetails: true
      });

      res.json({
        results,
        pagination: { limit, offset }
      });
    } catch (error) {
      logger.error('Failed to fetch admin withdrawal requests:', error);
      res.status(500).json({ error: 'Failed to fetch wallet withdrawal requests' });
    }
  }
);

router.post(
  '/withdrawals/:id/reject',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const { rejectionReason, metadata = {} } = req.body || {};

      const result = await finalizeWithdrawal({
        requestId: req.params.id,
        processorId: resolveActorId(req),
        success: false,
        metadata: {
          rejectionReason,
          ...metadata
        }
      });

      res.json({ message: 'Withdrawal rejection recorded', request: result });
    } catch (error) {
      logger.error('Failed to reject withdrawal:', error);
      res.status(500).json({ error: error.message || 'Failed to reject withdrawal' });
    }
  }
);

// ===========================================================================================
// IYZICO REFUND ENDPOINTS
// ===========================================================================================

/**
 * POST /wallet/admin/refund
 * Process a refund for an Iyzico payment
 * 
 * Required: transactionId (wallet_transactions ID that contains Iyzico payment info)
 * Optional: amount (for partial refund), reason
 * 
 * Flow:
 * 1. Find original transaction with Iyzico payment info
 * 2. Call Iyzico refund API
 * 3. Create refund transaction in wallet
 * 4. Update original transaction status
 */
router.post(
  '/admin/refund',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  [
    body('transactionId').isUUID().withMessage('Valid transaction ID required'),
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
    body('reason').optional().isString().trim().isLength({ max: 500 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { transactionId, amount: requestedAmount, reason = 'Admin refund' } = req.body;
    const adminId = resolveActorId(req);

    try {
      // 1. Find original Iyzico payment transaction
      const txResult = await pool.query(
        `SELECT id, user_id, amount, currency, metadata, status, direction
         FROM wallet_transactions 
         WHERE id = $1`,
        [transactionId]
      );

      if (txResult.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const originalTx = txResult.rows[0];

      // Validate it's an Iyzico payment
      // Check both new (gateway) and old formats (paymentMethod, iyzicoPaymentId)
      const isIyzicoPayment = 
        originalTx.metadata?.gateway === 'iyzico' || 
        originalTx.payment_method === 'iyzico' ||
        originalTx.metadata?.iyzicoPaymentId;
      
      if (!isIyzicoPayment) {
        return res.status(400).json({ error: 'This transaction is not an Iyzico payment' });
      }

      // Get payment ID from metadata (new or old format)
      const paymentId = originalTx.metadata?.paymentId || 
                       originalTx.metadata?.iyzicoPaymentId || 
                       originalTx.reference_number;
      
      if (!paymentId) {
        return res.status(400).json({ error: 'Original payment ID not found in transaction' });
      }

      // Check if already refunded
      if (originalTx.metadata?.refunded) {
        return res.status(400).json({ error: 'This transaction has already been refunded' });
      }

      // Determine refund amount
      const originalAmount = Math.abs(parseFloat(originalTx.amount));
      const refundAmount = requestedAmount ? Math.min(requestedAmount, originalAmount) : originalAmount;
      const isPartialRefund = refundAmount < originalAmount;

      // 2. Call Iyzico Refund API
      // paymentTransactionId varsa direkt kullan, yoksa token ile checkoutForm.retrieve yap
      let iyzicoResult;
      try {
        iyzicoResult = await iyzicoRefund({
          paymentTransactionId: originalTx.metadata?.paymentTransactionId || null,
          paymentId: paymentId,  // Use the extracted paymentId
          token: originalTx.metadata?.token || null, // Token ile paymentTransactionId bulunabilir
          amount: refundAmount,
          currency: originalTx.currency
        });
      } catch (iyzicoError) {
        logger.error('Iyzico refund failed', { 
          error: iyzicoError.message, 
          transactionId,
          paymentId: paymentId,
          paymentTransactionId: originalTx.metadata?.paymentTransactionId,
          token: originalTx.metadata?.token
        });
        return res.status(400).json({ 
          error: 'Iyzico refund failed', 
          details: iyzicoError.message 
        });
      }

      // 3. Create refund transaction in wallet (debit - removes money from wallet)
      // Amount is NEGATIVE because money is being taken from wallet (refunded to card)
      const refundTx = await recordTransaction({
        userId: originalTx.user_id,
        amount: -refundAmount, // Negative to deduct from wallet
        transactionType: 'iyzico_refund',
        currency: originalTx.currency,
        status: 'completed',
        direction: 'debit',
        description: `Iyzico refund: ${reason}${isPartialRefund ? ' (partial)' : ''}`,
        metadata: {
          originalTransactionId: transactionId,
          originalPaymentId: paymentId,  // Use the extracted paymentId
          iyzicoRefundId: iyzicoResult.refundId,
          refundReason: reason,
          isPartialRefund,
          gateway: 'iyzico'
        },
        createdBy: adminId
      });

      // 4. Update original transaction metadata
      await pool.query(
        `UPDATE wallet_transactions 
         SET metadata = metadata || $1::jsonb, updated_at = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({
            refunded: true,
            refundedAt: new Date().toISOString(),
            refundedBy: adminId,
            refundAmount,
            refundTransactionId: refundTx.id,
            iyzicoRefundId: iyzicoResult.refundId,
            isPartialRefund
          }),
          transactionId
        ]
      );

      // Log the refund event
      logPaymentEvent('iyzico_refund_processed', {
        userId: originalTx.user_id,
        amount: refundAmount,
        currency: originalTx.currency,
        originalTransactionId: transactionId,
        refundTransactionId: refundTx.id,
        iyzicoRefundId: iyzicoResult.refundId,
        adminId,
        reason
      });

      // Send alert for refunds
      sendPaymentAlert('refund_processed', {
        userId: originalTx.user_id,
        amount: refundAmount,
        currency: originalTx.currency,
        reason,
        adminId
      });

      res.json({
        success: true,
        message: isPartialRefund ? 'Partial refund processed successfully' : 'Full refund processed successfully',
        refund: {
          refundTransactionId: refundTx.id,
          iyzicoRefundId: iyzicoResult.refundId,
          amount: refundAmount,
          currency: originalTx.currency,
          isPartialRefund,
          originalAmount
        }
      });

    } catch (error) {
      logger.error('Failed to process refund:', error);
      res.status(500).json({ error: error.message || 'Failed to process refund' });
    }
  }
);

/**
 * GET /wallet/admin/refundable-transactions
 * List Iyzico transactions that can be refunded
 */
router.get(
  '/admin/refundable-transactions',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
      const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
      const userId = req.query.userId;

      let query = `
        SELECT 
          wt.id,
          wt.user_id,
          wt.amount,
          wt.currency,
          wt.created_at,
          wt.metadata,
          wt.description,
          wt.payment_method,
          u.name as user_name,
          u.email as user_email
        FROM wallet_transactions wt
        JOIN users u ON wt.user_id = u.id
        WHERE wt.payment_method = 'iyzico'
          AND wt.direction = 'credit'
          AND wt.status = 'completed'
          AND (wt.metadata->>'refunded')::boolean IS NOT TRUE
      `;
      const params = [];

      if (userId) {
        params.push(userId);
        query += ` AND wt.user_id = $${params.length}`;
      }

      query += ` ORDER BY wt.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total
        FROM wallet_transactions wt
        WHERE wt.payment_method = 'iyzico'
          AND wt.direction = 'credit'
          AND wt.status = 'completed'
          AND (wt.metadata->>'refunded')::boolean IS NOT TRUE
      `;
      const countParams = [];
      if (userId) {
        countParams.push(userId);
        countQuery += ` AND wt.user_id = $1`;
      }
      const countResult = await pool.query(countQuery, countParams);

      res.json({
        transactions: result.rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          userName: row.user_name,
          userEmail: row.user_email,
          amount: parseFloat(row.amount),
          currency: row.currency,
          createdAt: row.created_at,
          description: row.description,
          paymentId: row.metadata?.paymentId,
          token: row.metadata?.token
        })),
        pagination: {
          limit,
          offset,
          total: parseInt(countResult.rows[0].total, 10)
        }
      });
    } catch (error) {
      logger.error('Failed to fetch refundable transactions:', error);
      res.status(500).json({ error: 'Failed to fetch refundable transactions' });
    }
  }
);

/**
 * GET /wallet/admin/refund-history
 * List all refund transactions
 */
router.get(
  '/admin/refund-history',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'owner']),
  async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
      const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

      const result = await pool.query(`
        SELECT 
          wt.id,
          wt.user_id,
          wt.amount,
          wt.currency,
          wt.created_at,
          wt.metadata,
          wt.description,
          u.name as user_name,
          u.email as user_email,
          admin.name as admin_name
        FROM wallet_transactions wt
        JOIN users u ON wt.user_id = u.id
        LEFT JOIN users admin ON wt.created_by = admin.id
        WHERE wt.transaction_type = 'iyzico_refund'
        ORDER BY wt.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      res.json({
        refunds: result.rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          userName: row.user_name,
          userEmail: row.user_email,
          amount: Math.abs(parseFloat(row.amount)),
          currency: row.currency,
          createdAt: row.created_at,
          description: row.description,
          adminName: row.admin_name,
          originalTransactionId: row.metadata?.originalTransactionId,
          iyzicoRefundId: row.metadata?.iyzicoRefundId,
          reason: row.metadata?.refundReason,
          isPartialRefund: row.metadata?.isPartialRefund
        })),
        pagination: { limit, offset }
      });
    } catch (error) {
      logger.error('Failed to fetch refund history:', error);
      res.status(500).json({ error: 'Failed to fetch refund history' });
    }
  }
);

export default router;
