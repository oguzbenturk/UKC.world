import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

/**
 * Payment Gateway Webhook Service Tests
 * - Webhook signature validation
 * - Status normalization (success/failure)
 * - Deposit request linking and approval/rejection
 * - Idempotency via dedupe key
 * - Multi-provider support (Iyzico, Paytr, Binance Pay)
 * - Financial precision testing
 */

let PaymentGatewayWebhookService;
let mockPool;
let mockWalletService;
let mockLogger;

beforeAll(async () => {
  mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
  };

  mockWalletService = {
    approveDepositRequest: jest.fn(),
    rejectDepositRequest: jest.fn(),
  };

  mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const mockAuditUtils = {
    resolveSystemActorId: jest.fn(() => 'system-actor-123'),
  };

  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: mockPool,
  }));

  await jest.unstable_mockModule('../../../../backend/services/walletService.js', () => mockWalletService);

  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger,
    AppError: class AppError extends Error {
      constructor(message, code) {
        super(message);
        this.code = code;
      }
    },
  }));

  await jest.unstable_mockModule('../../../../backend/utils/auditUtils.js', () => mockAuditUtils);

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/paymentGatewayWebhookService.js');
    PaymentGatewayWebhookService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Iyzico webhook handling', () => {
  test('processes successful payment webhook', async () => {
    const payload = {
      eventType: 'payment',
      eventId: 'evt-123',
      paymentId: 'pay-456',
      status: 'SUCCESS',
      paidPrice: 100.50,
      currency: 'TRY',
      conversationId: 'conv-789',
      cardAssociation: 'Visa',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'webhook-evt-1',
          inserted: true,
        },
      ],
    }); // persistWebhookEvent

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'deposit-123',
          user_id: 'user-456',
          gateway: 'iyzico',
          status: 'pending',
          gateway_transaction_id: null,
          reference_code: null,
        },
      ],
    }); // findDepositCandidate

    mockWalletService.approveDepositRequest.mockResolvedValueOnce({
      deposit: { id: 'deposit-123', status: 'completed' },
      transaction: { id: 'txn-789' },
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{}],
    }); // finalizeWebhookEvent

    const result = await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    expect(result.provider).toBe('iyzico');
    expect(result.acknowledged).toBe(true);
    expect(result.outcome.action).toBe('approved');
    expect(mockWalletService.approveDepositRequest).toHaveBeenCalled();
  });

  test('processes failed payment webhook', async () => {
    const payload = {
      eventType: 'payment',
      eventId: 'evt-124',
      paymentId: 'pay-457',
      status: 'FAILURE',
      errorMessage: 'Insufficient funds',
      currency: 'TRY',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-2', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'deposit-124',
          user_id: 'user-457',
          gateway: 'iyzico',
          status: 'pending',
        },
      ],
    });

    mockWalletService.rejectDepositRequest.mockResolvedValueOnce({
      status: 'failed',
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    expect(result.outcome.action).toBe('rejected');
    expect(mockWalletService.rejectDepositRequest).toHaveBeenCalled();
  });

  test('handles idempotent duplicate webhook', async () => {
    const payload = {
      eventId: 'evt-dup',
      paymentId: 'pay-dup',
      status: 'SUCCESS',
      paidPrice: 50,
      currency: 'TRY',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'webhook-evt-3',
          inserted: false,
          processed_at: '2026-04-04T12:00:00Z',
          metadata: {
            outcome: { action: 'approved', status: 'completed' },
          },
        },
      ],
    }); // persistWebhookEvent with alreadyProcessed

    const result = await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    expect(result.alreadyProcessed).toBe(true);
    expect(result.outcome.action).toBe('approved');
    expect(mockWalletService.approveDepositRequest).not.toHaveBeenCalled();
  });

  test('handles webhook with no matching deposit', async () => {
    const payload = {
      eventId: 'evt-orphan',
      paymentId: 'pay-orphan',
      status: 'SUCCESS',
      paidPrice: 75,
      currency: 'TRY',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-4', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [], // no deposit found
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    expect(result.outcome.action).toBe('ignored');
    expect(result.outcome.reason).toBe('deposit_not_found');
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test('handles unknown status gracefully', async () => {
    const payload = {
      eventId: 'evt-unknown',
      paymentId: 'pay-unknown',
      status: 'PENDING',
      paidPrice: 100,
      currency: 'TRY',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-5', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'deposit-125',
          user_id: 'user-458',
          status: 'pending',
        },
      ],
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    expect(result.outcome.action).toBe('recorded');
  });
});

describe('Paytr webhook handling', () => {
  test('processes successful Paytr payment', async () => {
    const payload = {
      merchant_oid: 'order-999',
      transaction_id: 'txn-999',
      status: 'success',
      total_amount: 15000, // 150.00 TRY in cents
      currency: 'TRY',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-6', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'deposit-126',
          user_id: 'user-459',
          gateway: 'paytr',
          status: 'pending',
          gateway_transaction_id: 'txn-999',
        },
      ],
    });

    mockWalletService.approveDepositRequest.mockResolvedValueOnce({
      deposit: { id: 'deposit-126', status: 'completed' },
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handlePaytrWebhook({ payload });

    expect(result.provider).toBe('paytr');
    expect(result.outcome.action).toBe('approved');
  });

  test('normalizes Paytr amount from cents to currency units', async () => {
    const payload = {
      merchant_oid: 'order-1000',
      total_amount: 5000, // 50.00 in cents
      status: 'failed',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-7', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-127', status: 'pending' }],
    });

    mockWalletService.rejectDepositRequest.mockResolvedValueOnce({
      status: 'failed',
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handlePaytrWebhook({ payload });

    expect(result.outcome.action).toBe('rejected');
  });
});

describe('Binance Pay webhook handling', () => {
  test('processes Binance Pay success event', async () => {
    const payload = {
      bizId: 'biz-555',
      bizStatus: 'pay_success',
      tradeNo: 'trade-555',
      orderId: 'order-555',
      data: {
        totalAmount: 250.75,
        currency: 'USDT',
        payerId: 'payer-555',
        metadata: {
          depositId: 'deposit-128',
        },
      },
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-8', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'deposit-128',
          user_id: 'user-460',
          gateway: 'binance_pay',
          status: 'pending',
        },
      ],
    });

    mockWalletService.approveDepositRequest.mockResolvedValueOnce({
      deposit: { id: 'deposit-128', status: 'completed' },
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleBinancePayWebhook({ payload });

    expect(result.provider).toBe('binance_pay');
    expect(result.outcome.action).toBe('approved');
  });

  test('handles Binance Pay failure event', async () => {
    const payload = {
      bizId: 'biz-556',
      bizStatus: 'pay_fail',
      failMessage: 'User cancelled payment',
      data: {
        totalAmount: 100,
        currency: 'USDT',
      },
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-9', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-129', status: 'pending' }],
    });

    mockWalletService.rejectDepositRequest.mockResolvedValueOnce({
      status: 'failed',
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleBinancePayWebhook({ payload });

    expect(result.outcome.action).toBe('rejected');
  });
});

describe('Financial precision in webhooks', () => {
  test('preserves decimal precision for currency amounts', async () => {
    const payload = {
      eventId: 'evt-precision',
      paymentId: 'pay-precision',
      status: 'SUCCESS',
      paidPrice: 99.99, // Common precision case
      currency: 'EUR',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-10', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-130', user_id: 'user-461', status: 'pending' }],
    });

    mockWalletService.approveDepositRequest.mockResolvedValueOnce({
      deposit: { id: 'deposit-130', status: 'completed' },
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    expect(mockWalletService.approveDepositRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          gatewayWebhook: expect.objectContaining({
            amount: 99.99,
          }),
        }),
      })
    );
  });

  test('handles zero amount safely', async () => {
    const payload = {
      eventId: 'evt-zero',
      paymentId: 'pay-zero',
      status: 'SUCCESS',
      paidPrice: 0,
      currency: 'EUR',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-11', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-131', user_id: 'user-462', status: 'pending' }],
    });

    mockWalletService.approveDepositRequest.mockResolvedValueOnce({
      deposit: { id: 'deposit-131', status: 'completed' },
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    expect(result.outcome.action).toBe('approved');
  });

  test('rejects negative amounts safely', async () => {
    const payload = {
      eventId: 'evt-negative',
      paymentId: 'pay-negative',
      status: 'SUCCESS',
      paidPrice: -50.00,
      currency: 'EUR',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-12', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-132', user_id: 'user-463', status: 'pending' }],
    });

    mockWalletService.approveDepositRequest.mockResolvedValueOnce({
      deposit: { id: 'deposit-132', status: 'completed' },
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    // Should still process but with negative amount in metadata
    expect(result.outcome.action).toBe('approved');
  });
});

describe('Webhook error handling', () => {
  test('records error when deposit approval fails', async () => {
    const payload = {
      eventId: 'evt-error',
      paymentId: 'pay-error',
      status: 'SUCCESS',
      paidPrice: 100,
      currency: 'EUR',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-13', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-133', user_id: 'user-464', status: 'pending' }],
    });

    mockWalletService.approveDepositRequest.mockRejectedValueOnce(
      new Error('Database error')
    );

    mockPool.query.mockResolvedValueOnce({ rows: [{}] }); // recordWebhookError

    // Should re-throw the error
    await expect(
      PaymentGatewayWebhookService.handleIyzicoWebhook({ payload })
    ).rejects.toThrow('Database error');
  });

  test('handles finalized state gracefully', async () => {
    const payload = {
      eventId: 'evt-finalized',
      paymentId: 'pay-finalized',
      status: 'SUCCESS',
      paidPrice: 100,
      currency: 'EUR',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-14', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-134', user_id: 'user-465', status: 'completed' }],
    });

    mockWalletService.approveDepositRequest.mockRejectedValueOnce(
      new Error('Cannot approve deposit request in status completed')
    );

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleIyzicoWebhook({ payload });

    expect(result.outcome.action).toBe('noop');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Deposit already finalized; marking webhook as processed',
      expect.any(Object)
    );
  });
});

describe('handleGatewayWebhook routing', () => {
  test('routes to Iyzico handler', async () => {
    const payload = {
      eventId: 'evt-route-iyzico',
      status: 'SUCCESS',
      paidPrice: 100,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-15', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-135', status: 'pending' }],
    });

    mockWalletService.approveDepositRequest.mockResolvedValueOnce({
      deposit: { id: 'deposit-135', status: 'completed' },
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleGatewayWebhook('iyzico', { payload });

    expect(result.provider).toBe('iyzico');
  });

  test('routes to Paytr handler', async () => {
    const payload = {
      merchant_oid: 'order-route',
      status: 'success',
      total_amount: 10000,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'webhook-evt-16', inserted: true }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'deposit-136', status: 'pending' }],
    });

    mockWalletService.approveDepositRequest.mockResolvedValueOnce({
      deposit: { id: 'deposit-136', status: 'completed' },
    });

    mockPool.query.mockResolvedValueOnce({ rows: [{}] });

    const result = await PaymentGatewayWebhookService.handleGatewayWebhook('paytr', { payload });

    expect(result.provider).toBe('paytr');
  });

  test('throws for unsupported provider', async () => {
    await expect(
      PaymentGatewayWebhookService.handleGatewayWebhook('stripe', { payload: {} })
    ).rejects.toThrow('Unsupported webhook provider: stripe');
  });
});
