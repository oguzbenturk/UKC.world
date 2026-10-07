import { jest, describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';

/**
 * Accommodation route tests (mocked db).
 *
 * History: this suite was never wired up — its beforeAll returned early
 * ("Routes tests need proper path resolution - skipping for now"), so `app`
 * and `pool` were undefined and every test crashed. It also targeted an API
 * that doesn't exist (public /units, PATCH /units/:id, integer ids, base_price).
 * Rewritten against the current router (backend/routes/accommodation.js):
 *   - the whole router is mounted behind authenticateJWT (server.js), so even
 *     GET /units needs a token;
 *   - units are updated with PUT, ids are UUIDs, price field is price_per_night;
 *   - DELETE /units/:id is allowed for admin AND manager.
 */

let app;
let pool;
let client;

const UNIT_ID = '7a1c3c52-5b0e-4f53-9d0e-0f6f2b1d0001';
const MISSING_UNIT_ID = '7a1c3c52-5b0e-4f53-9d0e-0f6f2b1d0999';

function createToken(payload = {}) {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  return jwt.sign(
    {
      id: payload.id || '7a1c3c52-5b0e-4f53-9d0e-0f6f2b1d9999',
      email: payload.email || 'user@test.local',
      role: payload.role || 'student'
    },
    secret,
    { expiresIn: '1h' }
  );
}

describe('Accommodation Routes', () => {
  let adminToken;
  let managerToken;
  let guestToken;

  beforeAll(async () => {
    await jest.unstable_mockModule('../../../../../backend/db.js', () => ({
      pool: {
        query: jest.fn(),
        connect: jest.fn()
      }
    }));

    ({ default: app } = await import('../../../../../backend/server.js'));
    ({ pool } = await import('../../../../../backend/db.js'));

    adminToken = createToken({ role: 'admin', id: '7a1c3c52-5b0e-4f53-9d0e-0f6f2b1d1001', email: 'admin@test.local' });
    managerToken = createToken({ role: 'manager', id: '7a1c3c52-5b0e-4f53-9d0e-0f6f2b1d1002', email: 'manager@test.local' });
    guestToken = createToken({ role: 'student', id: '7a1c3c52-5b0e-4f53-9d0e-0f6f2b1d1003', email: 'guest@test.local' });
  });

  afterAll(async () => {
    // Pool cleanup handled by --forceExit
  }, 15000);

  // Full reset so queued mockResolvedValueOnce values can't leak between tests.
  beforeEach(() => {
    jest.resetAllMocks();
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    client = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(client);
  });

  describe('GET /api/accommodation/units', () => {
    test('GET /units requires authentication (router is mounted behind authenticateJWT)', async () => {
      const res = await request(app).get('/api/accommodation/units');
      expect(res.status).toBe(401);
    });

    test('GET /units returns list for an authenticated user', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: UNIT_ID,
            name: 'Room A',
            type: 'private',
            price_per_night: 100,
            status: 'Available',
            capacity: 2,
            upcoming_bookings: []
          }
        ]
      });

      const res = await request(app)
        .get('/api/accommodation/units')
        .set('Authorization', `Bearer ${guestToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: UNIT_ID, name: 'Room A' });
    });

    test('GET /units filters by status', async () => {
      const res = await request(app)
        .get('/api/accommodation/units')
        .set('Authorization', `Bearer ${guestToken}`)
        .query({ status: 'Available' });
      expect(res.status).toBe(200);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/u\.status = \$1/);
      expect(params[0]).toBe('Available');
    });

    test('GET /units filters by type', async () => {
      const res = await request(app)
        .get('/api/accommodation/units')
        .set('Authorization', `Bearer ${guestToken}`)
        .query({ type: 'private' });
      expect(res.status).toBe(200);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/u\.type = \$1/);
      expect(params[0]).toBe('private');
    });

    test('GET /units hides units booked over the requested date range', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: UNIT_ID, name: 'Booked', upcoming_bookings: [{ check_in_date: '2026-05-02', check_out_date: '2026-05-04' }] },
          { id: MISSING_UNIT_ID, name: 'Free', upcoming_bookings: [] }
        ]
      });

      const res = await request(app)
        .get('/api/accommodation/units')
        .set('Authorization', `Bearer ${guestToken}`)
        .query({ checkIn: '2026-05-01', checkOut: '2026-05-05' });
      expect(res.status).toBe(200);
      expect(res.body.map((u) => u.name)).toEqual(['Free']);
    });
  });

  describe('GET /api/accommodation/units/:id', () => {
    test('GET /units/:id returns unit details', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: UNIT_ID,
              name: 'Room A',
              type: 'private',
              price_per_night: 100,
              status: 'Available',
              bookings: []
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'b1', check_in_date: '2026-05-01', check_out_date: '2026-05-03' }] });

      const res = await request(app)
        .get(`/api/accommodation/units/${UNIT_ID}`)
        .set('Authorization', `Bearer ${guestToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: UNIT_ID, name: 'Room A' });
      expect(res.body.upcoming_bookings).toHaveLength(1);
    });

    test('GET /units/:id returns 404 when not found', async () => {
      const res = await request(app)
        .get(`/api/accommodation/units/${MISSING_UNIT_ID}`)
        .set('Authorization', `Bearer ${guestToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/accommodation/units', () => {
    test('POST /units requires authentication', async () => {
      const res = await request(app)
        .post('/api/accommodation/units')
        .send({
          name: 'New Room',
          type: 'private',
          price_per_night: 100,
          capacity: 2
        });
      // CSRF middleware (backend/middlewares/security.js, since v0.1.148) rejects cookie-less,
      // Bearer-less mutations with 403 before auth runs; either way the request is refused.
      expect([401, 403]).toContain(res.status);
    });

    test('POST /units requires admin or manager role', async () => {
      const res = await request(app)
        .post('/api/accommodation/units')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          name: 'New Room',
          type: 'private',
          price_per_night: 100,
          capacity: 2
        });
      expect(res.status).toBe(403);
      expect(pool.query).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO accommodation_units/), expect.anything());
    });

    test('POST /units creates unit with valid data (admin)', async () => {
      pool.query.mockImplementation(async (sql, params) => {
        if (/INSERT INTO accommodation_units/.test(sql)) {
          return { rows: [{ id: params[0], name: params[1], type: params[2], capacity: params[4], price_per_night: params[5], status: params[8] }] };
        }
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app)
        .post('/api/accommodation/units')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Room B',
          type: 'private',
          price_per_night: 100,
          capacity: 2
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Room B', type: 'private', capacity: 2, price_per_night: 100, status: 'Available' });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('POST /units requires name field', async () => {
      const res = await request(app)
        .post('/api/accommodation/units')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'private',
          price_per_night: 100,
          capacity: 2
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });
  });

  describe('PUT /api/accommodation/units/:id', () => {
    test('PUT /units/:id requires authentication', async () => {
      const res = await request(app)
        .put(`/api/accommodation/units/${UNIT_ID}`)
        .send({ name: 'Updated Room' });
      // CSRF middleware rejects cookie-less, Bearer-less mutations with 403 before auth runs.
      expect([401, 403]).toContain(res.status);
    });

    test('PUT /units/:id requires admin or manager role', async () => {
      const res = await request(app)
        .put(`/api/accommodation/units/${UNIT_ID}`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ name: 'Updated Room' });
      expect(res.status).toBe(403);
    });

    test('PUT /units/:id returns 404 when not found', async () => {
      const res = await request(app)
        .put(`/api/accommodation/units/${MISSING_UNIT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Room' });
      expect(res.status).toBe(404);
    });

    test('PUT /units/:id rejects an empty update', async () => {
      const res = await request(app)
        .put(`/api/accommodation/units/${UNIT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('PUT /units/:id updates unit fields', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: UNIT_ID,
            name: 'Updated Room',
            type: 'private',
            price_per_night: 150
          }
        ]
      });

      const res = await request(app)
        .put(`/api/accommodation/units/${UNIT_ID}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Updated Room',
          price_per_night: 150
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Updated Room', price_per_night: 150 });
      const [sql, params] = pool.query.mock.calls.find(([q]) => /UPDATE accommodation_units/.test(q));
      expect(sql).toMatch(/name = \$1, price_per_night = \$2, updated_at = NOW\(\) WHERE id = \$3/);
      expect(params).toEqual(['Updated Room', 150, UNIT_ID]);
    });
  });

  describe('DELETE /api/accommodation/units/:id', () => {
    test('DELETE /units/:id requires authentication', async () => {
      const res = await request(app).delete(`/api/accommodation/units/${UNIT_ID}`);
      // CSRF middleware rejects cookie-less, Bearer-less mutations with 403 before auth runs.
      expect([401, 403]).toContain(res.status);
    });

    test('DELETE /units/:id requires admin or manager role', async () => {
      const res = await request(app)
        .delete(`/api/accommodation/units/${UNIT_ID}`)
        .set('Authorization', `Bearer ${guestToken}`);
      expect(res.status).toBe(403);
    });

    test('DELETE /units/:id refuses when the unit has active bookings', async () => {
      client.query.mockImplementation(async (sql) => {
        if (/SELECT COUNT\(\*\) FROM accommodation_bookings/.test(sql)) return { rows: [{ count: '2' }] };
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app)
        .delete(`/api/accommodation/units/${UNIT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    test('DELETE /units/:id returns 404 when not found', async () => {
      client.query.mockImplementation(async (sql) => {
        if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ count: '0' }] };
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app)
        .delete(`/api/accommodation/units/${MISSING_UNIT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('DELETE /units/:id deletes unit successfully', async () => {
      client.query.mockImplementation(async (sql) => {
        if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ count: '0' }] };
        if (/DELETE FROM accommodation_units/.test(sql)) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app)
        .delete(`/api/accommodation/units/${UNIT_ID}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('POST /api/accommodation/bookings', () => {
    test('POST /bookings requires authentication', async () => {
      const res = await request(app)
        .post('/api/accommodation/bookings')
        .send({
          unit_id: UNIT_ID,
          check_in_date: '2026-05-01',
          check_out_date: '2026-05-05'
        });
      // CSRF middleware rejects cookie-less, Bearer-less mutations with 403 before auth runs.
      expect([401, 403]).toContain(res.status);
    });

    test('POST /bookings rejects missing fields and rolls back its transaction', async () => {
      const res = await request(app)
        .post('/api/accommodation/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ unit_id: UNIT_ID });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
      // The handler opens BEGIN first; releasing without ROLLBACK would hand an
      // open transaction to the next pool borrower.
      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    test('POST /bookings rejects check-out before check-in and rolls back', async () => {
      const res = await request(app)
        .post('/api/accommodation/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ unit_id: UNIT_ID, check_in_date: '2026-05-05', check_out_date: '2026-05-01' });
      expect(res.status).toBe(400);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('POST /bookings returns 404 for an unknown unit', async () => {
      const res = await request(app)
        .post('/api/accommodation/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          unit_id: MISSING_UNIT_ID,
          check_in_date: '2026-05-01',
          check_out_date: '2026-05-05'
        });
      expect(res.status).toBe(404);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('GET /api/accommodation/bookings', () => {
    test('GET /bookings returns bookings list', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '7a1c3c52-5b0e-4f53-9d0e-0f6f2b1d2001',
            unit_id: UNIT_ID,
            check_in_date: '2026-05-01'
          }
        ]
      });

      const res = await request(app)
        .get('/api/accommodation/bookings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    test('GET /bookings is staff-only', async () => {
      const res = await request(app)
        .get('/api/accommodation/bookings')
        .set('Authorization', `Bearer ${guestToken}`);
      expect(res.status).toBe(403);
    });
  });
});
