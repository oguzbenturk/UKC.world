import { jest, describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { stubExports } from '../../../../helpers/esmMockExports.js';

const WALLET_SERVICE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../backend/services/walletService.js');

let app;
let pool;
let walletService;
let voucherService;
let notificationWriter;

const CUSTOMER_ID = '11111111-1111-1111-1111-111111111111';
const PRODUCT_ID = '22222222-2222-2222-2222-222222222222';
const ORDER_ID = '33333333-3333-3333-3333-333333333333';

const createToken = (overrides = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  const payload = {
    id: overrides.id || CUSTOMER_ID,
    email: overrides.email || 'user@example.com',
    role: overrides.role || 'student'
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

/**
 * The checkout route issues ~15 queries whose order changes whenever the route
 * grows (buyer-role lookup, preferred currency, variant stock, status history…).
 * The original fixed `mockResolvedValueOnce` chains broke on every such change,
 * so queries are now answered by SQL pattern. Unmatched queries get an empty
 * result, COUNT(*) queries a count of 1.
 */
const routedQuery = (routes = []) => jest.fn(async (sql) => {
  const text = typeof sql === 'string' ? sql : sql?.text || '';
  for (const [pattern, result] of routes) {
    if (pattern.test(text)) {
      return typeof result === 'function' ? result(text) : result;
    }
  }
  if (/SELECT COUNT\(\*\)/i.test(text)) return { rows: [{ count: '1' }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});

// After COMMIT the route re-reads the order via getOrderWithItems (pool.query).
const orderReadRoutes = (order = {}) => [
  [/FROM shop_orders o\s+LEFT JOIN users u/, {
    rows: [{ id: ORDER_ID, order_number: 'ORD-001', user_id: CUSTOMER_ID, status: 'confirmed', payment_status: 'completed', ...order }],
    rowCount: 1
  }]
];

const makeClient = (routes) => ({ query: routedQuery(routes), release: jest.fn() });

const productRow = (overrides = {}) => ({
  id: PRODUCT_ID,
  name: 'Kite Bag',
  price: 150,
  stock_quantity: 10,
  image_url: 'image.jpg',
  brand: 'BrandX',
  status: 'active',
  variants: null,
  ...overrides
});

const checkoutRoutes = (product) => [
  [/FROM products\s+WHERE id = \$1 AND status = 'active'/, { rows: product ? [product] : [], rowCount: product ? 1 : 0 }],
  [/INSERT INTO shop_orders/, { rows: [{ id: ORDER_ID, order_number: 'ORD-001', user_id: CUSTOMER_ID, status: 'pending' }], rowCount: 1 }],
];

describe('Shop Orders Routes', () => {
  const base = '/api/shop-orders';
  let adminToken;
  let managerToken;
  let customerToken;

  beforeAll(async () => {
    await jest.unstable_mockModule('../../../../../backend/db.js', () => ({
      pool: {
        query: jest.fn(),
        connect: jest.fn()
      }
    }));

    // stubExports: every real walletService export becomes a jest.fn() so the
    // modules server.js pulls in transitively still link under ESM.
    await jest.unstable_mockModule('../../../../../backend/services/walletService.js', () => stubExports(WALLET_SERVICE_PATH, {
      getBalance: jest.fn(),
      getAllBalances: jest.fn(),
      recordTransaction: jest.fn()
    }));

    await jest.unstable_mockModule('../../../../../backend/services/voucherService.js', () => ({
      default: {
        validateVoucher: jest.fn(),
        redeemVoucher: jest.fn(),
        applyWalletCredit: jest.fn()
      }
    }));

    await jest.unstable_mockModule('../../../../../backend/services/notificationWriter.js', () => ({
      insertNotification: jest.fn()
    }));

    ({ default: app } = await import('../../../../../backend/server.js'));
    ({ pool } = await import('../../../../../backend/db.js'));
    walletService = await import('../../../../../backend/services/walletService.js');
    voucherService = await import('../../../../../backend/services/voucherService.js');
    notificationWriter = await import('../../../../../backend/services/notificationWriter.js');

    adminToken = createToken({ role: 'admin', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    managerToken = createToken({ role: 'manager', id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    customerToken = createToken({ role: 'student' });
  });

  afterAll(async () => {
    // Pool cleanup handled by --forceExit
  }, 15000);

  // Full reset (not just clear): un-consumed mockResolvedValueOnce values used to
  // leak from one test into the next (e.g. a queued order row answered a later
  // test's auth lookup), making results depend on test order.
  beforeEach(() => {
    jest.resetAllMocks();
    pool.query.mockImplementation(routedQuery());
    pool.connect.mockResolvedValue(makeClient());
    walletService.getAllBalances.mockResolvedValue([{ currency: 'EUR', available: 500 }]);
    walletService.recordTransaction.mockResolvedValue({ id: 'tx-1' });
  });

  describe('POST / - Create shop order (checkout)', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .send({
          items: [
            {
              product_id: PRODUCT_ID,
              quantity: 2
            }
          ],
          payment_method: 'wallet'
        });

      // CSRF middleware (backend/middlewares/security.js, since v0.1.148) rejects
      // cookie-less, Bearer-less mutations with 403 before auth runs; either way
      // the unauthenticated request is refused.
      expect([401, 403]).toContain(response.status);
    });

    test('customer can create order with valid items', async () => {
      const mockClient = makeClient(checkoutRoutes(productRow()));
      pool.connect.mockResolvedValueOnce(mockClient);
      pool.query.mockImplementation(routedQuery(orderReadRoutes()));

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            {
              product_id: PRODUCT_ID,
              quantity: 2
            }
          ],
          payment_method: 'wallet',
          notes: 'Test order'
        });

      expect([200, 201]).toContain(response.status);
      // 2 × €150 debited from the EUR wallet, inside the checkout transaction
      expect(walletService.recordTransaction).toHaveBeenCalledWith(expect.objectContaining({
        userId: CUSTOMER_ID,
        amount: -300,
        currency: 'EUR',
        relatedEntityType: 'shop_order'
      }));
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
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
          items: [{ product_id: PRODUCT_ID, quantity: 1 }],
          payment_method: 'invalid_method'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Invalid payment method/i);
    });

    test('rejects order when product is out of stock', async () => {
      const mockClient = makeClient(checkoutRoutes(productRow({ name: 'Out of Stock Item', price: 100, stock_quantity: 1 })));
      pool.connect.mockResolvedValueOnce(mockClient);

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            {
              product_id: PRODUCT_ID,
              quantity: 5 // More than available
            }
          ],
          payment_method: 'wallet'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Insufficient stock/i);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('rejects order when product not found', async () => {
      const mockClient = makeClient(checkoutRoutes(null));
      pool.connect.mockResolvedValueOnce(mockClient);

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
      const mockClient = makeClient(checkoutRoutes(productRow({ name: 'Kite', price: 100, stock_quantity: 5, image_url: null, brand: null })));
      pool.connect.mockResolvedValueOnce(mockClient);
      pool.query.mockImplementation(routedQuery(orderReadRoutes()));
      voucherService.default.validateVoucher.mockResolvedValueOnce({
        valid: true,
        voucher: { id: 'v1', code: 'SAVE10', type: 'percentage' },
        discount: { discountAmount: 10 }
      });

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ product_id: PRODUCT_ID, quantity: 1 }],
          payment_method: 'wallet',
          voucher_code: 'SAVE10'
        });

      expect([200, 201]).toContain(response.status);
      expect(voucherService.default.validateVoucher).toHaveBeenCalled();
      // €100 − €10 voucher = €90 debited
      expect(walletService.recordTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: -90 }));
      expect(voucherService.default.redeemVoucher).toHaveBeenCalledTimes(1);
    });

    test('rejects invalid voucher code', async () => {
      const mockClient = makeClient(checkoutRoutes(productRow({ name: 'Kite', price: 100, stock_quantity: 5, image_url: null, brand: null })));
      pool.connect.mockResolvedValueOnce(mockClient);
      voucherService.default.validateVoucher.mockResolvedValueOnce({
        valid: false,
        error: 'INVALID_CODE',
        message: 'Invalid voucher: code not found'
      });

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ product_id: PRODUCT_ID, quantity: 1 }],
          payment_method: 'wallet',
          voucher_code: 'INVALID_CODE'
        });

      expect(response.status).toBe(400);
      // Route forwards the voucher service's message and tags it VOUCHER_INVALID
      expect(response.body.error).toMatch(/Invalid voucher/i);
      expect(response.body.code).toBe('VOUCHER_INVALID');
    });

    test('admin can create order on behalf of customer', async () => {
      const mockClient = makeClient(checkoutRoutes(productRow({ name: 'Kite', price: 100, stock_quantity: 5, image_url: null, brand: null })));
      pool.connect.mockResolvedValueOnce(mockClient);
      pool.query.mockImplementation(routedQuery(orderReadRoutes()));

      const otherUserId = '99999999-9999-9999-9999-999999999999';
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product_id: PRODUCT_ID, quantity: 1 }],
          payment_method: 'wallet',
          user_id: otherUserId // Override user ID as admin
        });

      expect([200, 201]).toContain(response.status);
      // The order (and wallet debit) belongs to the customer, not the admin
      expect(walletService.getAllBalances).toHaveBeenCalledWith(otherUserId);
      expect(walletService.recordTransaction).toHaveBeenCalledWith(expect.objectContaining({ userId: otherUserId }));
    });
  });

  // There is no `GET /api/shop-orders/` list endpoint: customers list via
  // GET /my-orders and staff via GET /admin/all (both return { orders, total, … }).
  describe('GET / - List shop orders', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/my-orders`);
      expect(response.status).toBe(401);
    });

    test('customer can see own orders', async () => {
      pool.query.mockImplementation(routedQuery([
        [/FROM shop_orders o\s+WHERE o.user_id = \$1/, {
          rows: [{ id: ORDER_ID, order_number: 'ORD-001', total_amount: 150, status: 'completed' }]
        }]
      ]));

      const response = await request(app)
        .get(`${base}/my-orders`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.orders)).toBe(true);
      expect(response.body.orders[0].order_number).toBe('ORD-001');
      // scoped to the caller
      const listCall = pool.query.mock.calls.find(([sql]) => /WHERE o.user_id = \$1/.test(sql));
      expect(listCall[1][0]).toBe(CUSTOMER_ID);
    });

    test('admin can list all orders with filters', async () => {
      pool.query.mockImplementation(routedQuery([
        [/customer_balances/, {
          rows: [{ id: ORDER_ID, order_number: 'ORD-001', status: 'completed' }]
        }],
        [/SELECT COUNT\(\*\)/, { rows: [{ count: '100' }] }]
      ]));

      const response = await request(app)
        .get(`${base}/admin/all?status=completed&page=1&limit=20`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(100);
      expect(response.body.orders).toHaveLength(1);
    });
  });

  describe('GET /:id - Get order details', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/${ORDER_ID}`);
      expect(response.status).toBe(401);
    });

    test('customer can view own order', async () => {
      pool.query.mockImplementation(routedQuery([
        [/FROM shop_orders o\s+LEFT JOIN users u/, {
          rows: [
            {
              id: ORDER_ID,
              user_id: CUSTOMER_ID,
              order_number: 'ORD-001',
              total_amount: 150,
              status: 'completed'
            }
          ]
        }],
        [/FROM shop_order_items WHERE order_id/, {
          rows: [
            { id: 'item1', product_name: 'Kite', quantity: 1, unit_price: 150 }
          ]
        }]
      ]));

      const response = await request(app)
        .get(`${base}/${ORDER_ID}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('order_number', 'ORD-001');
      expect(response.body.items).toHaveLength(1);
    });

    test('returns 404 when order not found', async () => {
      const response = await request(app)
        .get(`${base}/99999999-9999-9999-9999-999999999999`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(404);
    });

    test('customer cannot view other customer orders', async () => {
      pool.query.mockImplementation(routedQuery([
        [/FROM shop_orders o\s+LEFT JOIN users u/, {
          rows: [
            {
              id: ORDER_ID,
              user_id: '22222222-2222-2222-2222-222222222222', // Different user
              order_number: 'ORD-001'
            }
          ]
        }]
      ]));

      const response = await request(app)
        .get(`${base}/${ORDER_ID}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /:id/status - Update order status', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .patch(`${base}/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'shipped' });

      expect([401, 403]).toContain(response.status);
    });

    test('admin can update order status', async () => {
      const mockClient = makeClient([
        [/SELECT \* FROM shop_orders WHERE id = \$1/, {
          rows: [{ id: ORDER_ID, user_id: CUSTOMER_ID, order_number: 'ORD-001', status: 'confirmed', payment_status: 'completed' }]
        }],
        [/UPDATE shop_orders/, { rows: [{ id: ORDER_ID, status: 'shipped' }], rowCount: 1 }]
      ]);
      pool.connect.mockResolvedValueOnce(mockClient);
      pool.query.mockImplementation(routedQuery(orderReadRoutes()));

      const response = await request(app)
        .patch(`${base}/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      expect([200, 201]).toContain(response.status);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('rejects invalid status', async () => {
      const response = await request(app)
        .patch(`${base}/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
    });
  });
});
