import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

await jest.unstable_mockModule('../services/walletService.js', () => {
  const asyncNoop = jest.fn(async () => undefined);
  return {
    __esModule: true,
    getBalance: asyncNoop,
    fetchTransactions: asyncNoop,
    recordTransaction: asyncNoop,
    recordLegacyTransaction: asyncNoop,
    getTransactionById: asyncNoop,
    getWalletAccountSummary: asyncNoop,
    calculateAvailableBalance: asyncNoop,
    lockFundsForBooking: asyncNoop,
    releaseLockedFunds: asyncNoop,
    applyDiscountsAndFees: asyncNoop,
    requestWithdrawal: asyncNoop,
    approveWithdrawal: asyncNoop,
    finalizeWithdrawal: asyncNoop,
    listWithdrawalRequests: asyncNoop,
    getWalletSettings: asyncNoop,
    saveWalletSettings: asyncNoop,
    updateWalletPreferences: asyncNoop,
    listBankAccounts: jest.fn(async () => []),
    getBankAccountById: asyncNoop,
    saveBankAccount: asyncNoop,
    setBankAccountStatus: asyncNoop,
    listPaymentMethods: jest.fn(async () => []),
    getPaymentMethodById: asyncNoop,
    submitKycDocument: jest.fn(async () => ({})),
    listKycDocuments: jest.fn(async () => []),
    reviewKycDocument: asyncNoop,
    updatePaymentMethodVerificationStatus: asyncNoop,
    createDepositRequest: jest.fn(async () => ({})),
    initiateBinancePayDeposit: jest.fn(async () => ({})),
    listUserDepositRequests: jest.fn(async () => []),
    listDepositRequests: asyncNoop,
    approveDepositRequest: asyncNoop,
    rejectDepositRequest: asyncNoop,
    __testables: {},
    default: {}
  };
});

const walletServiceModule = await import('../services/walletService.js');

const { default: app } = await import('../server.js');

const DEFAULT_USER_ID = '11111111-1111-1111-1111-111111111111';

function createToken(payload = {}) {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  return jwt.sign(
    {
      id: payload.id || DEFAULT_USER_ID,
      email: payload.email || 'user@test.local',
      role: payload.role || 'student'
    },
    secret,
    { expiresIn: '1h' }
  );
}

describe('Wallet deposit routes', () => {
  let userToken;
  let adminToken;
  const userId = DEFAULT_USER_ID;

  beforeAll(() => {
    userToken = createToken({ id: userId, role: 'student' });
    adminToken = createToken({ id: '99999999-9999-9999-9999-999999999999', role: 'owner' });
  });

  afterEach(() => {
    jest.clearAllMocks();
    walletServiceModule.listBankAccounts.mockResolvedValue([]);
  });

  test('POST /api/wallet/deposit requires authentication', async () => {
    const res = await request(app).post('/api/wallet/deposit').send({ amount: 10 });
    expect(res.status).toBe(401);
  });

  test('POST /api/wallet/deposit validates payload', async () => {
    walletServiceModule.createDepositRequest.mockImplementation(() => {
      throw new Error('createDepositRequest should not be called for invalid payload');
    });

    const res = await request(app)
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  expect(walletServiceModule.createDepositRequest).not.toHaveBeenCalled();
  });

  test('POST /api/wallet/deposit forwards to service and returns result', async () => {
    const mockResponse = {
      deposit: { id: 'dep-1', status: 'pending' },
      transaction: null,
      gatewaySession: { provider: 'stripe', clientSecret: 'secret_123' }
    };
    walletServiceModule.createDepositRequest.mockResolvedValue(mockResponse);

    const payload = {
      amount: 125.5,
      currency: 'EUR',
      method: 'card',
      referenceCode: 'INV-42'
    };

    const res = await request(app)
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${userToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(mockResponse);
    expect(walletServiceModule.createDepositRequest).toHaveBeenCalledWith({
      userId,
      amount: payload.amount,
      currency: payload.currency,
      method: payload.method,
      metadata: undefined,
      referenceCode: payload.referenceCode,
      proofUrl: undefined,
      notes: undefined,
      autoComplete: undefined,
      gateway: undefined,
      gatewayTransactionId: undefined,
      initiatedBy: userId,
      bankAccountId: undefined,
      bankReference: undefined,
      paymentMethodId: undefined,
      verification: undefined
    });
  });

  test('POST /api/wallet/deposit enforces bank account for bank transfers', async () => {
    const res = await request(app)
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 50, method: 'bank_transfer' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(walletServiceModule.createDepositRequest).not.toHaveBeenCalled();
  });

  test('GET /api/wallet/bank-accounts returns configured accounts', async () => {
    const mockAccounts = [{ id: 'acct-1', bankName: 'Mock Bank' }];
    walletServiceModule.listBankAccounts.mockResolvedValue(mockAccounts);

    const res = await request(app)
      .get('/api/wallet/bank-accounts')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: mockAccounts });
    expect(walletServiceModule.listBankAccounts).toHaveBeenCalledWith({
      scopeType: 'global',
      scopeId: undefined,
      currency: undefined,
      includeInactive: false
    });
  });

  test('GET /api/wallet/deposits returns user deposit history', async () => {
    walletServiceModule.listUserDepositRequests.mockResolvedValue([
      { id: 'dep-1', status: 'pending' },
      { id: 'dep-2', status: 'completed' }
    ]);

    const res = await request(app)
      .get('/api/wallet/deposits?limit=10&offset=5&status=pending')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('userId', userId);
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(walletServiceModule.listUserDepositRequests).toHaveBeenCalledWith({
      userId,
      status: 'pending',
      method: undefined,
      limit: 10,
      offset: 5,
      startDate: undefined,
      endDate: undefined,
      sortDirection: undefined
    });
  });

  test('POST /api/wallet/deposit/binance-pay returns session details', async () => {
    const mockResponse = {
      deposit: { id: 'dep-binance' },
      paymentSession: { provider: 'binance_pay', checkoutUrl: 'https://pay.binance.com/xyz' }
    };
    walletServiceModule.initiateBinancePayDeposit.mockResolvedValue(mockResponse);

    const res = await request(app)
      .post('/api/wallet/deposit/binance-pay')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 50, currency: 'EUR' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(mockResponse);
    expect(walletServiceModule.initiateBinancePayDeposit).toHaveBeenCalledWith({
      userId,
      amount: 50,
      currency: 'EUR',
      metadata: undefined,
      redirectUrl: undefined,
      cancelUrl: undefined,
      successUrl: undefined
    });
  });

  test('GET /api/wallet/payment-methods returns methods for user', async () => {
    const mockMethods = [{ id: 'pm-1', verificationStatus: 'verified' }];
    walletServiceModule.listPaymentMethods.mockResolvedValue(mockMethods);

    const res = await request(app)
      .get('/api/wallet/payment-methods?verificationStatus=verified&limit=10')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: mockMethods, pagination: { limit: 10, offset: 0 } });
    expect(walletServiceModule.listPaymentMethods).toHaveBeenCalledWith({
      userId,
      status: undefined,
      verificationStatus: 'verified',
      type: undefined,
      provider: undefined,
      includeInactive: false,
      limit: 10,
      offset: 0
    });
  });

  test('POST /api/wallet/payment-methods/:id/kyc-documents validates document type', async () => {
    const res = await request(app)
      .post('/api/wallet/payment-methods/pm-1/kyc-documents')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(walletServiceModule.submitKycDocument).not.toHaveBeenCalled();
  });

  test('POST /api/wallet/payment-methods/:id/kyc-documents forwards to service', async () => {
    const mockDoc = { id: 'doc-1', status: 'pending' };
    walletServiceModule.submitKycDocument.mockResolvedValue(mockDoc);

    const res = await request(app)
      .post('/api/wallet/payment-methods/pm-1/kyc-documents')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ documentType: 'identity_card', metadata: { country: 'NL' } });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'KYC document submitted', document: mockDoc });
    expect(walletServiceModule.submitKycDocument).toHaveBeenCalledWith({
      userId,
      paymentMethodId: 'pm-1',
      documentType: 'identity_card',
      fileUrl: undefined,
      storagePath: undefined,
      metadata: { country: 'NL' },
      submittedBy: userId
    });
  });

  test('GET /api/wallet/kyc/documents returns submitted documents', async () => {
    walletServiceModule.listKycDocuments.mockResolvedValue([{ id: 'doc-1' }]);

    const res = await request(app)
      .get('/api/wallet/kyc/documents')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [{ id: 'doc-1' }], pagination: { limit: 50, offset: 0 } });
    expect(walletServiceModule.listKycDocuments).toHaveBeenCalledWith({
      userId,
      paymentMethodId: undefined,
      status: undefined,
      limit: 50,
      offset: 0
    });
  });

  test('POST /api/admin/wallet/payment-methods/:id/verification validates status', async () => {
    const res = await request(app)
      .post('/api/wallet/admin/payment-methods/pm-1/verification')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(walletServiceModule.updatePaymentMethodVerificationStatus).not.toHaveBeenCalled();
  });

  test('POST /api/admin/wallet/payment-methods/:id/verification forwards to service', async () => {
    walletServiceModule.updatePaymentMethodVerificationStatus.mockResolvedValue({ id: 'pm-1', verificationStatus: 'verified' });

    const res = await request(app)
      .post('/api/wallet/admin/payment-methods/pm-1/verification')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'verified', metadata: { reviewer: 'ops' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Payment method verification updated',
      paymentMethod: { id: 'pm-1', verificationStatus: 'verified' }
    });
    expect(walletServiceModule.updatePaymentMethodVerificationStatus).toHaveBeenCalledWith({
      paymentMethodId: 'pm-1',
      status: 'verified',
      notes: undefined,
      metadata: { reviewer: 'ops' },
      verifiedAt: undefined,
      reviewerId: '99999999-9999-9999-9999-999999999999'
    });
  });

  test('POST /api/admin/wallet/kyc/documents/:id/review forwards to service', async () => {
    walletServiceModule.reviewKycDocument.mockResolvedValue({ id: 'doc-1', status: 'approved' });

    const res = await request(app)
      .post('/api/wallet/admin/kyc/documents/doc-1/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', reviewNotes: 'looks good' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'KYC document reviewed', document: { id: 'doc-1', status: 'approved' } });
    expect(walletServiceModule.reviewKycDocument).toHaveBeenCalledWith({
      documentId: 'doc-1',
      status: 'approved',
      reviewNotes: 'looks good',
      rejectionReason: undefined,
      metadata: undefined,
      reviewerId: '99999999-9999-9999-9999-999999999999'
    });
  });
});
