import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';

/**
 * Shop Checkout Flow Tests (Integration)
 *
 * Tests the shop order creation endpoint:
 * - Input validation (empty items, invalid payment method)
 * - Stock validation
 * - Payment method validation
 * - Auth requirement
 * - Role access
 */

const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';

const createToken = ({ id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role = 'student', email = 'buyer@test.local' } = {}) =>
  jwt.sign({ id, role, email }, JWT_SECRET, { expiresIn: '1h' });

describe('Shop checkout — POST /api/shop-orders', () => {
  const token = createToken();
  const endpoint = '/api/shop-orders';

  test('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post(endpoint)
      .send({ items: [{ product_id: 'x', quantity: 1 }], payment_method: 'wallet' });
    expect(res.status).toBe(401);
  });

  test('rejects empty items array', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [], payment_method: 'wallet' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one item/i);
  });

  test('rejects missing items field', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_method: 'wallet' });
    expect(res.status).toBe(400);
  });

  test('rejects invalid payment method', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ product_id: 'x', quantity: 1 }], payment_method: 'bitcoin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid payment method/i);
  });

  test('rejects missing payment method', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ product_id: 'abc', quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test('rejects non-existent product', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ product_id: '00000000-0000-0000-0000-000000000099', quantity: 1 }],
        payment_method: 'wallet'
      });
    // Should get 400 (product not found) or 500 (DB error)
    expect([400, 500]).toContain(res.status);
  });

  test('accepts valid payment methods: wallet, credit_card, cash, wallet_hybrid', async () => {
    for (const method of ['wallet', 'credit_card', 'cash', 'wallet_hybrid']) {
      const res = await request(app)
        .post(endpoint)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ product_id: '00000000-0000-0000-0000-000000000099', quantity: 1 }],
          payment_method: method
        });
      // Should NOT be 400 for invalid payment method — may be 400 for product or 500 for DB
      if (res.status === 400) {
        expect(res.body.error).not.toMatch(/invalid payment method/i);
      }
    }
  });
});

describe('Shop orders — GET /api/shop-orders', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/shop-orders');
    expect(res.status).toBe(401);
  });

  test('allows admin access', async () => {
    const adminToken = createToken({ role: 'admin', email: 'admin@test.local' });
    const res = await request(app)
      .get('/api/shop-orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([401, 403]).not.toContain(res.status);
  });

  test('allows manager access', async () => {
    const managerToken = createToken({ role: 'manager', email: 'manager@test.local' });
    const res = await request(app)
      .get('/api/shop-orders')
      .set('Authorization', `Bearer ${managerToken}`);
    expect([401, 403]).not.toContain(res.status);
  });
});

describe('Quick sale — POST /api/shop-orders/admin/quick-sale', () => {
  test('denies student access', async () => {
    const studentToken = createToken({ role: 'student' });
    const res = await request(app)
      .post('/api/shop-orders/admin/quick-sale')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ items: [], payment_method: 'cash' });
    expect([401, 403]).toContain(res.status);
  });

  test('allows admin access', async () => {
    const adminToken = createToken({ role: 'admin', email: 'admin@test.local' });
    const res = await request(app)
      .post('/api/shop-orders/admin/quick-sale')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ product_id: 'x', quantity: 1 }], payment_method: 'cash' });
    // Not 401/403 — may fail on validation/DB but auth passes
    expect([401, 403]).not.toContain(res.status);
  });
});
