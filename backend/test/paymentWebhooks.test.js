import { jest } from '@jest/globals';
import request from 'supertest';

const stripeHandler = jest.fn(async () => ({ provider: 'stripe', acknowledged: true }));
const iyzicoHandler = jest.fn(async () => ({ provider: 'iyzico', acknowledged: true }));
const paytrHandler = jest.fn(async () => ({ provider: 'paytr', acknowledged: true }));
const binanceHandler = jest.fn(async () => ({ provider: 'binance_pay', acknowledged: true }));

await jest.unstable_mockModule('../services/paymentGatewayWebhookService.js', () => ({
  __esModule: true,
  handleStripeWebhook: stripeHandler,
  handleIyzicoWebhook: iyzicoHandler,
  handlePaytrWebhook: paytrHandler,
  handleBinancePayWebhook: binanceHandler
}));

const { default: app } = await import('../server.js');

describe('Payment webhook routes', () => {
  beforeEach(() => {
    stripeHandler.mockClear();
    iyzicoHandler.mockClear();
    paytrHandler.mockClear();
    binanceHandler.mockClear();
  });

  test('POST /api/webhooks/stripe delegates to stripe handler', async () => {
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'sig_test')
      .send({ id: 'evt_1', type: 'charge.succeeded' });

    expect(res.status).toBe(202);
    expect(stripeHandler).toHaveBeenCalledTimes(1);
    const context = stripeHandler.mock.calls[0][0];
    expect(context.signature).toBe('sig_test');
    expect(context.payload.type).toBe('charge.succeeded');
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
