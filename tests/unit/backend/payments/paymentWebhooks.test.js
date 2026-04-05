import { jest } from '@jest/globals';
import request from 'supertest';

const iyzicoHandler = jest.fn(async () => ({ provider: 'iyzico', acknowledged: true }));
const paytrHandler = jest.fn(async () => ({ provider: 'paytr', acknowledged: true }));
const binanceHandler = jest.fn(async () => ({ provider: 'binance_pay', acknowledged: true }));

await jest.unstable_mockModule('../../../../backend/services/paymentGatewayWebhookService.js', () => ({
  __esModule: true,
  handleIyzicoWebhook: iyzicoHandler,
  handlePaytrWebhook: paytrHandler,
  handleBinancePayWebhook: binanceHandler
}));

const { default: app } = await import('../../../../backend/server.js');

describe('Payment webhook routes', () => {
  beforeEach(() => {
    iyzicoHandler.mockClear();
    paytrHandler.mockClear();
    binanceHandler.mockClear();
  });

  test('POST /api/webhooks/iyzico delegates to iyzico handler', async () => {
    const res = await request(app)
      .post('/api/webhooks/iyzico')
      .send({ status: 'success' });

    expect(res.status).toBe(202);
    expect(iyzicoHandler).toHaveBeenCalledTimes(1);
  });

  test('POST /api/webhooks/paytr delegates to paytr handler', async () => {
    const res = await request(app)
      .post('/api/webhooks/paytr')
      .send({ status: 'ok' });

    expect(res.status).toBe(202);
    expect(paytrHandler).toHaveBeenCalledTimes(1);
  });

  test('POST /api/webhooks/binance-pay delegates to binance handler', async () => {
    const res = await request(app)
      .post('/api/webhooks/binance-pay')
      .send({ bizStatus: 'PAY_SUCCESS' });

    expect(res.status).toBe(202);
    expect(binanceHandler).toHaveBeenCalledTimes(1);
  });
});
