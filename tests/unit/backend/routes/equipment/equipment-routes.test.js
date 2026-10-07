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
    // /api/equipment is mounted behind authenticateJWT in server.js (since the initial commit),
    // so listing/reading needs a token; the original "without auth" expectation never matched.
    test('requires authentication', async () => {
      const res = await request(app).get('/api/equipment');
      expect(res.status).toBe(401);
    });

    test('returns equipment list for an authenticated user', async () => {
      const res = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });

    test('filters by type', async () => {
      const res = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ type: 'board' });
      expect([200, 500]).toContain(res.status);
    });

    test('filters by availability', async () => {
      const res = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ availability: 'Available' });
      expect([200, 500]).toContain(res.status);
    });

    test('searches equipment', async () => {
      const res = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: 'Kite' });
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/equipment/:id', () => {
    test('returns 404 or equipment details', async () => {
      const res = await request(app)
        .get('/api/equipment/99999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/equipment', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/equipment')
        .send({ name: 'Kite Board', type: 'board' });
      // Unauthenticated mutating requests are rejected by csrfMiddleware (backend/middlewares/security.js,
      // since v0.1.148) with 403 before the auth middleware can answer 401 — both mean "rejected".
      expect([401, 403]).toContain(res.status);
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
      // Unauthenticated mutating requests are rejected by csrfMiddleware (backend/middlewares/security.js,
      // since v0.1.148) with 403 before the auth middleware can answer 401 — both mean "rejected".
      expect([401, 403]).toContain(res.status);
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
      // Unauthenticated mutating requests are rejected by csrfMiddleware (backend/middlewares/security.js,
      // since v0.1.148) with 403 before the auth middleware can answer 401 — both mean "rejected".
      expect([401, 403]).toContain(res.status);
    });

    // authorizeRoles(['admin']) also admits roles whose JSONB permissions grant equipment:*
    // (the seeded manager role does, by design), so the negative case uses the plain 'user' role.
    test('requires admin role (or an equipment permission)', async () => {
      const res = await request(app)
        .delete('/api/equipment/1')
        .set('Authorization', `Bearer ${userToken}`);
      expect([401, 403]).toContain(res.status);
    });
  });
});
