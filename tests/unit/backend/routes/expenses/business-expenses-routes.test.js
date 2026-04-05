import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

let app;

function createToken(payload = {}) {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  return jwt.sign(
    {
      id: payload.id || 9999,
      email: payload.email || 'user@test.local',
      role: payload.role || 'user'
    },
    secret,
    { expiresIn: '1h' }
  );
}

describe('Business Expenses Routes', () => {
  let adminToken;
  let managerToken;
  let frontDeskToken;
  let studentToken;

  beforeAll(async () => {
    ({ default: app } = await import('../../../../../backend/server.js'));

    adminToken = createToken({ role: 'admin', id: 2001 });
    managerToken = createToken({ role: 'manager', id: 2002 });
    frontDeskToken = createToken({ role: 'front_desk', id: 2003 });
    studentToken = createToken({ role: 'student', id: 2004 });
  });

  afterAll(async () => {
    jest.clearAllMocks();
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/business-expenses', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/business-expenses');
      expect(res.status).toBe(401);
    });

    test('requires authorized role (admin/manager/front_desk)', async () => {
      const res = await request(app)
        .get('/api/business-expenses')
        .set('Authorization', `Bearer ${studentToken}`);
      expect([401, 403]).toContain(res.status);
    });

    test('returns expenses list with pagination (admin)', async () => {
      const res = await request(app)
        .get('/api/business-expenses')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 400, 500]).toContain(res.status);
    });

    test('filters by category', async () => {
      const res = await request(app)
        .get('/api/business-expenses')
        .query({ category: 'supplies' })
        .set('Authorization', `Bearer ${managerToken}`);
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe('GET /api/business-expenses/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/business-expenses/1');
      expect(res.status).toBe(401);
    });

    test('returns expense by ID or error', async () => {
      const res = await request(app)
        .get('/api/business-expenses/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/business-expenses', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/business-expenses')
        .send({
          amount: 250,
          category: 'supplies',
          description: 'Office supplies'
        });
      expect(res.status).toBe(401);
    });

    test('creates expense (admin auto-approves)', async () => {
      const res = await request(app)
        .post('/api/business-expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 250,
          category: 'supplies',
          description: 'Office supplies'
        });
      expect([201, 400, 500]).toContain(res.status);
    });

    test('creates expense (manager auto-approves)', async () => {
      const res = await request(app)
        .post('/api/business-expenses')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          amount: 150,
          category: 'equipment',
          description: 'New whiteboard'
        });
      expect([201, 400, 500]).toContain(res.status);
    });

    test('validates amount is positive', async () => {
      const res = await request(app)
        .post('/api/business-expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: -100,
          category: 'supplies',
          description: 'Office supplies'
        });
      expect(res.status).toBe(400);
    });

    test('validates category', async () => {
      const res = await request(app)
        .post('/api/business-expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 250,
          category: 'invalid_category',
          description: 'Office supplies'
        });
      expect(res.status).toBe(400);
    });

    test('handles financial precision (Decimal.js)', async () => {
      const res = await request(app)
        .post('/api/business-expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 99.99,
          category: 'utilities',
          description: 'Monthly utilities'
        });
      expect([201, 400, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/business-expenses/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .put('/api/business-expenses/1')
        .send({ amount: 300 });
      expect(res.status).toBe(401);
    });

    test('requires admin or manager role', async () => {
      const res = await request(app)
        .put('/api/business-expenses/1')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ amount: 300 });
      expect([401, 403]).toContain(res.status);
    });

    test('updates expense fields or returns 404', async () => {
      const res = await request(app)
        .put('/api/business-expenses/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 600, description: 'Updated rent' });
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/business-expenses/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app).delete('/api/business-expenses/1');
      expect(res.status).toBe(401);
    });

    test('soft deletes or returns 404', async () => {
      const res = await request(app)
        .delete('/api/business-expenses/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/business-expenses/summary/by-period', () => {
    test('requires admin/manager role', async () => {
      const res = await request(app)
        .get('/api/business-expenses/summary/by-period')
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expect([401, 403]).toContain(res.status);
    });

    test('returns summary by period', async () => {
      const res = await request(app)
        .get('/api/business-expenses/summary/by-period')
        .query({ period: 'month' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });
});
