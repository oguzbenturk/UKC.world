import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../../backend/server.js';

function createToken(payload = {}) {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  return jwt.sign(
    { id: payload.id || '00000000-0000-0000-0000-000000000099', email: payload.email || 'test@test.local', role: payload.role || 'admin' },
    secret,
    { expiresIn: '1h' }
  );
}

const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

describe('Admin Event Registration Endpoints', () => {
  const adminToken = createToken({ role: 'admin', id: '00000000-0000-0000-0000-000000000001' });
  const outsiderToken = createToken({ role: 'outsider', id: '00000000-0000-0000-0000-000000000004' });

  // ── POST /events/:eventId/registrations ─────────────────────────────────

  test('POST — rejects unauthenticated', async () => {
    const res = await request(app)
      .post(`/api/events/${NON_EXISTENT_UUID}/registrations`)
      .send({ user_id: NON_EXISTENT_UUID });
    expect([401, 403]).toContain(res.status);
  });

  test('POST — rejects outsider role', async () => {
    const res = await request(app)
      .post(`/api/events/${NON_EXISTENT_UUID}/registrations`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ user_id: NON_EXISTENT_UUID });
    expect([401, 403]).toContain(res.status);
  });

  test('POST — rejects missing user_id', async () => {
    const res = await request(app)
      .post(`/api/events/${NON_EXISTENT_UUID}/registrations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user_id/i);
  });

  test('POST — returns 404 for non-existent event', async () => {
    const res = await request(app)
      .post(`/api/events/${NON_EXISTENT_UUID}/registrations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: NON_EXISTENT_UUID });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/event/i);
  });

  // ── DELETE /events/:eventId/registrations/:userId ───────────────────────

  test('DELETE — rejects unauthenticated', async () => {
    const res = await request(app)
      .delete(`/api/events/${NON_EXISTENT_UUID}/registrations/${NON_EXISTENT_UUID}`);
    expect([401, 403]).toContain(res.status);
  });

  test('DELETE — rejects outsider role', async () => {
    const res = await request(app)
      .delete(`/api/events/${NON_EXISTENT_UUID}/registrations/${NON_EXISTENT_UUID}`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect([401, 403]).toContain(res.status);
  });

  test('DELETE — returns 404 for non-existent registration', async () => {
    const res = await request(app)
      .delete(`/api/events/${NON_EXISTENT_UUID}/registrations/${NON_EXISTENT_UUID}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/registration/i);
  });

  // ── GET /events/:eventId/registrations ──────────────────────────────────

  test('GET — rejects outsider role', async () => {
    const res = await request(app)
      .get(`/api/events/${NON_EXISTENT_UUID}/registrations`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect([401, 403]).toContain(res.status);
  });

  test('GET — returns array for valid event (may be empty)', async () => {
    const res = await request(app)
      .get(`/api/events/${NON_EXISTENT_UUID}/registrations`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
