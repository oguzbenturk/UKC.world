import { jest } from '@jest/globals';

const initiateDepositMock = jest.fn(async () => ({}));

await jest.unstable_mockModule('../services/paymentGateways/index.js', () => ({
  __esModule: true,
  getGateway: () => ({ initiateDeposit: initiateDepositMock }),
  supportedGateways: ['stripe', 'binance_pay']
}));

const { initiateGatewayDeposit } = await import('../services/paymentGatewayService.js');

describe('paymentGatewayService initiateGatewayDeposit', () => {
  const baseParams = {
    amount: 10,
    currency: 'eur',
    userId: 'user-1',
    metadata: { method: 'card' }
  };

  afterEach(() => {
    initiateDepositMock.mockReset();
    initiateDepositMock.mockImplementation(async () => ({}));
  });

  test('rejects non-positive amounts', async () => {
    await expect(
      initiateGatewayDeposit({ ...baseParams, gateway: 'stripe', amount: 0 })
    ).rejects.toThrow('Deposit amount must be greater than zero');
  });

  test('normalizes currency and enforces 3DS for card deposits', async () => {
    await initiateGatewayDeposit({ ...baseParams, gateway: 'stripe' });

    expect(initiateDepositMock).toHaveBeenCalledTimes(1);
    const callArgs = initiateDepositMock.mock.calls[0][0];
    expect(callArgs.currency).toBe('EUR');
    expect(callArgs.metadata.requireThreeDS).toBe(true);
    expect(callArgs.metadata.enforceThreeDS).toBe(true);
  });

  test('does not force 3DS flags for non-card methods', async () => {
    await initiateGatewayDeposit({
      ...baseParams,
      gateway: 'binance_pay',
      metadata: { method: 'binance_pay' }
    });

    expect(initiateDepositMock).toHaveBeenCalledTimes(1);
    const callArgs = initiateDepositMock.mock.calls[0][0];
    expect(callArgs.metadata.requireThreeDS).toBeUndefined();
    expect(callArgs.metadata.enforceThreeDS).toBeUndefined();
  });

  test('generates an idempotency key when not provided', async () => {
    await initiateGatewayDeposit({ ...baseParams, gateway: 'stripe' });

    const callArgs = initiateDepositMock.mock.calls[0][0];
    expect(typeof callArgs.idempotencyKey).toBe('string');
    expect(callArgs.idempotencyKey.length).toBeGreaterThan(10);
    expect(callArgs.metadata.idempotencyKey).toBe(callArgs.idempotencyKey);
  });

  test('honours provided idempotency key', async () => {
    const customKey = 'custom-key-123';
    await initiateGatewayDeposit({ ...baseParams, gateway: 'stripe', idempotencyKey: customKey });

    const callArgs = initiateDepositMock.mock.calls[0][0];
    expect(callArgs.idempotencyKey).toBe(customKey);
    expect(callArgs.metadata.idempotencyKey).toBe(customKey);
  });

  test('retries transient failures when retryAttempts provided', async () => {
    const transientError = new Error('Timeout');
    transientError.retryable = true;

    initiateDepositMock.mockImplementationOnce(() => {
      throw transientError;
    }).mockImplementationOnce(async () => ({ status: 'ok' }));

    await initiateGatewayDeposit({
      ...baseParams,
      gateway: 'stripe',
      retryAttempts: 2
    });

    expect(initiateDepositMock).toHaveBeenCalledTimes(2);
  });

  test('throws after exhausting retries', async () => {
    initiateDepositMock.mockImplementation(() => {
      const error = new Error('temporarily unavailable');
      error.retryable = true;
      throw error;
    });

    await expect(
      initiateGatewayDeposit({
        ...baseParams,
        gateway: 'stripe',
        retryAttempts: 2
      })
    ).rejects.toThrow('temporarily unavailable');

    expect(initiateDepositMock).toHaveBeenCalledTimes(2);
  });
});
