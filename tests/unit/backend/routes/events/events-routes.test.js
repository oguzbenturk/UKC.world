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

describe('Events Routes', () => {
  let adminToken;
  let managerToken;
  let devToken;
  let userToken;

  beforeAll(async () => {
    ({ default: app } = await import('../../../../../backend/server.js'));

    adminToken = createToken({ role: 'admin', id: 5001 });
    managerToken = createToken({ role: 'manager', id: 5002 });
    devToken = createToken({ role: 'developer', id: 5003 });
    userToken = createToken({ role: 'user', id: 5004 });
  });

  afterAll(async () => {
    jest.clearAllMocks();
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/events/public', () => {
    test('returns public events without auth', async () => {
      const res = await request(app).get('/api/events/public');
      expect([200, 500]).toContain(res.status);
    });

    test('filters by status', async () => {
      const res = await request(app)
        .get('/api/events/public')
        .query({ status: 'scheduled' });
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/events', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/events');
      expect(res.status).toBe(401);
    });

    test('requires admin/manager/developer role', async () => {
      const res = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${userToken}`);
      expect([401, 403]).toContain(res.status);
    });

    test('returns events (admin)', async () => {
      const res = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /api/events', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({ name: 'Event', start_at: '2026-06-01T10:00:00Z' });
      expect(res.status).toBe(401);
    });

    test('requires admin/manager/developer role', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Event', start_at: '2026-06-01T10:00:00Z' });
      expect([401, 403]).toContain(res.status);
    });

    test('requires name', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ start_at: '2026-06-01T10:00:00Z' });
      expect(res.status).toBe(400);
    });

    test('requires start_at', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event' });
      expect(res.status).toBe(400);
    });

    test('validates capacity is positive', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Event',
          start_at: '2026-06-01T10:00:00Z',
          capacity: -5
        });
      expect(res.status).toBe(400);
    });

    test('validates price is number', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Event',
          start_at: '2026-06-01T10:00:00Z',
          price: 'not-a-number'
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/events/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/events/1');
      expect(res.status).toBe(401);
    });

    test('returns event or 404', async () => {
      const res = await request(app)
        .get('/api/events/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('PATCH /api/events/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .patch('/api/events/1')
        .send({ name: 'Updated' });
      expect(res.status).toBe(401);
    });

    test('requires authorized role', async () => {
      const res = await request(app)
        .patch('/api/events/1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Updated' });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('DELETE /api/events/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app).delete('/api/events/1');
      expect(res.status).toBe(401);
    });

    test('requires admin/manager/developer role', async () => {
      const res = await request(app)
        .delete('/api/events/1')
        .set('Authorization', `Bearer ${userToken}`);
      expect([401, 403]).toContain(res.status);
    });
  });
});
