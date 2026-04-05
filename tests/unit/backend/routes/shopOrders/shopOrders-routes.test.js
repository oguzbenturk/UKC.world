import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

let app;
let pool;
let walletService;
let voucherService;
let notificationWriter;

const createToken = (overrides = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  const payload = {
    id: overrides.id || '11111111-1111-1111-1111-111111111111',
    email: overrides.email || 'user@example.com',
    role: overrides.role || 'student'
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

describe('Shop Orders Routes', () => {
  const base = '/api/shop-orders';
  let adminToken;
  let managerToken;
  let customerToken;

  beforeAll(async () => {
    await jest.unstable_mockModule('../../../backend/db.js', () => ({
      pool: {
        query: jest.fn(),
        connect: jest.fn().mockResolvedValue({
          query: jest.fn(),
          release: jest.fn()
        })
      }
    }));

    await jest.unstable_mockModule('../../../backend/services/walletService.js', () => ({
      getBalance: jest.fn(),
      getAllBalances: jest.fn(),
      recordTransaction: jest.fn()
    }));

    await jest.unstable_mockModule('../../../backend/services/voucherService.js', () => ({
      default: {
        validateVoucher: jest.fn(),
        redeemVoucher: jest.fn(),
        applyWalletCredit: jest.fn()
      }
    }));

    await jest.unstable_mockModule('../../../backend/services/notificationWriter.js', () => ({
      insertNotification: jest.fn()
    }));

    ({ default: app } = await import('../../../../../backend/../backend/server.js'));
    ({ pool } = await import('../../../../../backend/../backend/db.js'));
    walletService = await import('../../../../../backend/../backend/services/walletService.js');
    voucherService = await import('../../../../../backend/../backend/services/voucherService.js');
    notificationWriter = await import('../../../../../backend/../backend/services/notificationWriter.js');

    adminToken = createToken({ role: 'admin' });
    managerToken = createToken({ role: 'manager' });
    customerToken = createToken({ role: 'student' });
  });

  afterAll(async () => {
    // Pool cleanup handled by --forceExit
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST / - Create shop order (checkout)', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .send({
          items: [
            {
              product_id: '22222222-2222-2222-2222-222222222222',
              quantity: 2
            }
          ],
          payment_method: 'wallet'
        });

      expect(response.status).toBe(401);
    });

    test('customer can create order with valid items', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: '22222222-2222-2222-2222-222222222222',
                name: 'Kite Bag',
                price: 150,
                stock_quantity: 10,
                image_url: 'image.jpg',
                brand: 'BrandX',
                status: 'active'
              }
            ]
          })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: '33333333-3333-3333-3333-333333333333', order_number: 'ORD-001' }] })
          .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-4444-444444444444' }] })
          .mockResolvedValueOnce({ rows: [{ preferred_currency: 'EUR' }] }),
        release: jest.fn()
      };

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient);
      jest.spyOn(walletService, 'getAllBalances').mockResolvedValueOnce([
        { currency: 'EUR', available: 500 }
      ]);

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            {
              product_id: '22222222-2222-2222-2222-222222222222',
              quantity: 2
            }
          ],
          payment_method: 'wallet',
          notes: 'Test order'
        });

      expect([200, 201]).toContain(response.status);
    });

    test('rejects order with no items', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [],
          payment_method: 'wallet'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/at least one item/i);
    });

    test('rejects invalid payment method', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 1 }],
          payment_method: 'invalid_method'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Invalid payment method/i);
    });

    test('rejects order when product is out of stock', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: '22222222-2222-2222-2222-222222222222',
                name: 'Out of Stock Item',
                price: 100,
                stock_quantity: 1,
                status: 'active'
              }
            ]
          })
          .mockResolvedValueOnce({ rowCount: 0 }), // Rollback
        release: jest.fn()
      };

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient);

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            {
              product_id: '22222222-2222-2222-2222-222222222222',
              quantity: 5 // More than available
            }
          ],
          payment_method: 'wallet'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Insufficient stock/i);
    });

    test('rejects order when product not found', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // No product found
          .mockResolvedValueOnce({ rowCount: 0 }), // Rollback
        release: jest.fn()
      };

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient);

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            {
              product_id: '99999999-9999-9999-9999-999999999999',
              quantity: 1
            }
          ],
          payment_method: 'wallet'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/no longer available/i);
    });

    test('applies valid voucher code to order', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: '22222222-2222-2222-2222-222222222222',
                name: 'Kite',
                price: 100,
                stock_quantity: 5,
                image_url: null,
                brand: null,
                status: 'active'
              }
            ]
          })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: '33333333-3333-3333-3333-333333333333' }] })
          .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-4444-444444444444' }] })
          .mockResolvedValueOnce({ rows: [{ preferred_currency: 'EUR' }] }),
        release: jest.fn()
      };

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient);
      jest.spyOn(voucherService.default, 'validateVoucher').mockResolvedValueOnce({
        valid: true,
        voucher: { id: 'v1', code: 'SAVE10', type: 'percentage' },
        discount: { discountAmount: 10 }
      });
      jest.spyOn(walletService, 'getAllBalances').mockResolvedValueOnce([
        { currency: 'EUR', available: 500 }
      ]);

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 1 }],
          payment_method: 'wallet',
          voucher_code: 'SAVE10'
        });

      expect([200, 201]).toContain(response.status);
      expect(voucherService.default.validateVoucher).toHaveBeenCalled();
    });

    test('rejects invalid voucher code', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: '22222222-2222-2222-2222-222222222222',
                name: 'Kite',
                price: 100,
                stock_quantity: 5,
                image_url: null,
                brand: null,
                status: 'active'
              }
            ]
          })
          .mockResolvedValueOnce({ rowCount: 0 }), // Rollback
        release: jest.fn()
      };

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient);
      jest.spyOn(voucherService.default, 'validateVoucher').mockResolvedValueOnce({
        valid: false,
        error: 'INVALID_CODE',
        message: 'Voucher code not found'
      });

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 1 }],
          payment_method: 'wallet',
          voucher_code: 'INVALID_CODE'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Invalid voucher/i);
    });

    test('admin can create order on behalf of customer', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: '22222222-2222-2222-2222-222222222222',
                name: 'Kite',
                price: 100,
                stock_quantity: 5,
                image_url: null,
                brand: null,
                status: 'active'
              }
            ]
          })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: '33333333-3333-3333-3333-333333333333' }] })
          .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-4444-444444444444' }] })
          .mockResolvedValueOnce({ rows: [{ preferred_currency: 'EUR' }] }),
        release: jest.fn()
      };

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient);
      jest.spyOn(walletService, 'getAllBalances').mockResolvedValueOnce([
        { currency: 'EUR', available: 500 }
      ]);

      const otherUserId = '99999999-9999-9999-9999-999999999999';
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 1 }],
          payment_method: 'wallet',
          user_id: otherUserId // Override user ID as admin
        });

      expect([200, 201]).toContain(response.status);
    });
  });

  describe('GET / - List shop orders', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/`);
      expect(response.status).toBe(401);
    });

    test('customer can see own orders', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          { id: '33333333-3333-3333-3333-333333333333', order_number: 'ORD-001', total_amount: 150, status: 'completed' }
        ]
      });

      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('admin can list all orders with filters', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            { id: '33333333-3333-3333-3333-333333333333', order_number: 'ORD-001', status: 'completed' }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] });

      const response = await request(app)
        .get(`${base}/?status=completed&page=1&limit=20`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /:id - Get order details', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/33333333-3333-3333-3333-333333333333`);
      expect(response.status).toBe(401);
    });

    test('customer can view own order', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            {
              id: '33333333-3333-3333-3333-333333333333',
              user_id: '11111111-1111-1111-1111-111111111111',
              order_number: 'ORD-001',
              total_amount: 150,
              status: 'completed'
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'item1', product_name: 'Kite', quantity: 1, unit_price: 150 }
          ]
        });

      const response = await request(app)
        .get(`${base}/33333333-3333-3333-3333-333333333333`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('order_number', 'ORD-001');
    });

    test('returns 404 when order not found', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`${base}/99999999-9999-9999-9999-999999999999`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(404);
    });

    test('customer cannot view other customer orders', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-3333-3333-333333333333',
            user_id: '22222222-2222-2222-2222-222222222222', // Different user
            order_number: 'ORD-001'
          }
        ]
      });

      const response = await request(app)
        .get(`${base}/33333333-3333-3333-3333-333333333333`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /:id/status - Update order status', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .patch(`${base}/33333333-3333-3333-3333-333333333333/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'shipped' });

      expect([401, 403]).toContain(response.status);
    });

    test('admin can update order status', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-3333-3333-333333333333',
            status: 'shipped'
          }
        ]
      });

      const response = await request(app)
        .patch(`${base}/33333333-3333-3333-3333-333333333333/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      expect([200, 201]).toContain(response.status);
    });

    test('rejects invalid status', async () => {
      const response = await request(app)
        .patch(`${base}/33333333-3333-3333-3333-333333333333/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
    });
  });
});
