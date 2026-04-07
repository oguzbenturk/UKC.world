import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../../backend/server.js';
import { pool } from '../../../../backend/db.js';

function createToken(payload = {}) {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  return jwt.sign(
    { id: payload.id || 9999, email: payload.email || 'test@test.local', role: payload.role || 'instructor' },
    secret,
    { expiresIn: '1h' }
  );
}

// We use a real DB for these tests.
// The DB must have at least one user with role 'instructor' or 'manager' and one with role 'student'.
// Tests that need a real instructor row will skip if none exists.

describe('Instructor Availability API', () => {
  // Use valid UUIDs that don't exist in the DB — queries return empty results gracefully
  const instructorToken = createToken({ role: 'instructor', id: '00000000-0000-0000-0000-000000000001' });
  const adminToken = createToken({ role: 'admin', id: '00000000-0000-0000-0000-000000000002' });
  const studentToken = createToken({ role: 'student', id: '00000000-0000-0000-0000-000000000003' });

  // ── Auth / Role guards ────────────────────────────────────────────────────

  test('GET /me/availability — rejects unauthenticated', async () => {
    const res = await request(app).get('/api/instructors/me/availability');
    expect(res.status).toBe(401);
  });

  test('GET /me/availability — rejects student role', async () => {
    const res = await request(app)
      .get('/api/instructors/me/availability')
      .set('Authorization', `Bearer ${studentToken}`);
    expect([401, 403]).toContain(res.status);
  });

  test('GET /me/availability — allows instructor role', async () => {
    const res = await request(app)
      .get('/api/instructors/me/availability')
      .set('Authorization', `Bearer ${instructorToken}`);
    // 200 (empty array) because the user id doesn't exist in DB — that's fine
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  test('POST /me/availability — rejects missing start_date', async () => {
    const res = await request(app)
      .post('/api/instructors/me/availability')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ end_date: '2099-01-10', type: 'off_day' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start_date/i);
  });

  test('POST /me/availability — rejects end_date before start_date', async () => {
    const res = await request(app)
      .post('/api/instructors/me/availability')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ start_date: '2099-01-10', end_date: '2099-01-05', type: 'off_day' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_date/i);
  });

  // ── GET /instructors/unavailable ─────────────────────────────────────────

  test('GET /unavailable — rejects unauthenticated', async () => {
    const res = await request(app).get('/api/instructors/unavailable?startDate=2099-01-01&endDate=2099-01-31');
    expect(res.status).toBe(401);
  });

  test('GET /unavailable — rejects missing params', async () => {
    const res = await request(app)
      .get('/api/instructors/unavailable')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/startDate/i);
  });

  test('GET /unavailable — returns an object for a valid date range', async () => {
    const res = await request(app)
      .get('/api/instructors/unavailable?startDate=2099-01-01&endDate=2099-01-31')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
    expect(Array.isArray(res.body)).toBe(false);
  });

  // ── Admin endpoints ───────────────────────────────────────────────────────

  test('GET /:instructorId/availability — rejects non-admin/manager', async () => {
    const res = await request(app)
      .get('/api/instructors/some-id/availability')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect([403]).toContain(res.status);
  });

  test('POST /:instructorId/availability — rejects non-admin/manager', async () => {
    const res = await request(app)
      .post('/api/instructors/some-id/availability')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ start_date: '2099-01-01', end_date: '2099-01-05' });
    expect([403]).toContain(res.status);
  });

  test('POST /:instructorId/availability — admin gets 404 for non-existent instructor', async () => {
    const res = await request(app)
      .post('/api/instructors/00000000-0000-0000-0000-000000000000/availability')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ start_date: '2099-01-01', end_date: '2099-01-05', type: 'off_day' });
    expect([404, 409]).toContain(res.status); // 404 if not found, 409 if somehow overlap
  });

  test('PATCH /:instructorId/availability/:id — rejects invalid status', async () => {
    const res = await request(app)
      .patch('/api/instructors/some-id/availability/some-entry-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  test('DELETE /me/availability/:id — rejects unauthenticated', async () => {
    const res = await request(app).delete('/api/instructors/me/availability/some-id');
    // The availability router applies authenticateJWT per-route; no token → 401 or 403
    expect([401, 403]).toContain(res.status);
  });

  // ── Booking guard integration (409 on unavailable instructor) ────────────
  // This is a lighter check since we don't seed a real instructor+availability in unit tests.
  // The real guard is integration-tested by the availability route itself.

  test('POST /bookings — returns 400 without date (guard prerequisite)', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructor_user_id: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });
});
