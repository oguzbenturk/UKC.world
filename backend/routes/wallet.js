import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  getBalance,
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
import { resolveActorId } from '../utils/auditUtils.js';

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
    
    res.json({ userId, ...summary });
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

router.post('/deposit', authenticateJWT, async (req, res) => {
  try {
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
      verification
    } = req.body || {};

    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'amount is required' });
    }

    if ((method || '').toLowerCase() === 'bank_transfer' && !bankAccountId) {
      return res.status(400).json({ error: 'bankAccountId is required for bank transfer deposits' });
    }

    const result = await createDepositRequest({
      userId,
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
      initiatedBy: resolveActorId(req),
      bankAccountId,
      bankReference,
      paymentMethodId,
      verification
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error('Failed to create wallet deposit:', error);
    res.status(500).json({ error: error.message || 'Failed to create wallet deposit' });
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

export default router;
