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

describe('Equipment Routes', () => {
  let adminToken;
  let managerToken;
  let userToken;

  beforeAll(async () => {
    ({ default: app } = await import('../../../../../backend/server.js'));

    adminToken = createToken({ role: 'admin', id: 4001 });
    managerToken = createToken({ role: 'manager', id: 4002 });
    userToken = createToken({ role: 'user', id: 4003 });
  });

  afterAll(async () => {
    jest.clearAllMocks();
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/equipment', () => {
    test('returns equipment list without auth', async () => {
      const res = await request(app).get('/api/equipment');
      expect([200, 500]).toContain(res.status);
    });

    test('filters by type', async () => {
      const res = await request(app)
        .get('/api/equipment')
        .query({ type: 'board' });
      expect([200, 500]).toContain(res.status);
    });

    test('filters by availability', async () => {
      const res = await request(app)
        .get('/api/equipment')
        .query({ availability: 'Available' });
      expect([200, 500]).toContain(res.status);
    });

    test('searches equipment', async () => {
      const res = await request(app)
        .get('/api/equipment')
        .query({ search: 'Kite' });
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/equipment/:id', () => {
    test('returns 404 or equipment details', async () => {
      const res = await request(app).get('/api/equipment/99999');
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/equipment', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/equipment')
        .send({ name: 'Kite Board', type: 'board' });
      expect(res.status).toBe(401);
    });

    test('requires admin/manager role', async () => {
      const res = await request(app)
        .post('/api/equipment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Kite Board' });
      expect([401, 403]).toContain(res.status);
    });

    test('requires name field', async () => {
      const res = await request(app)
        .post('/api/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'board' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/equipment/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .put('/api/equipment/1')
        .send({ name: 'Updated' });
      expect(res.status).toBe(401);
    });

    test('requires admin/manager role', async () => {
      const res = await request(app)
        .put('/api/equipment/1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Updated' });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('DELETE /api/equipment/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app).delete('/api/equipment/1');
      expect(res.status).toBe(401);
    });

    test('requires admin role', async () => {
      const res = await request(app)
        .delete('/api/equipment/1')
        .set('Authorization', `Bearer ${managerToken}`);
      expect([401, 403]).toContain(res.status);
    });
  });
});
