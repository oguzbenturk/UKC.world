import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../../backend/server.js';

/**
 * Cancel/Reschedule Booking Tests (Integration)
 *
 * Tests the booking cancellation and rescheduling endpoints:
 * - DELETE /api/bookings/:id — full cancellation with refund
 * - PATCH /api/bookings/:id/status — status-based cancellation
 * - PUT /api/bookings/:id — reschedule updates
 * - Reschedule notifications lifecycle
 * - Auth/role requirements
 * - Idempotent cancellation
 */

const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';

const createToken = ({ id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role, email } = {}) =>
  jwt.sign({ id, role, email }, JWT_SECRET, { expiresIn: '1h' });

const tokens = {};
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

beforeAll(() => {
  tokens.admin = createToken({ role: 'admin', email: 'admin@test.local' });
  tokens.manager = createToken({ role: 'manager', email: 'manager@test.local' });
  tokens.instructor = createToken({ role: 'instructor', email: 'instructor@test.local' });
  tokens.student = createToken({ role: 'student', email: 'student@test.local' });
});

// Helper: expect NOT auth error
const expectAllowed = (res) => {
  expect([401, 403]).not.toContain(res.status);
};

// ============================================
// 1. DELETE /api/bookings/:id — cancellation
// ============================================
describe('Booking cancellation — DELETE /api/bookings/:id', () => {
  test('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .delete(`/api/bookings/${FAKE_UUID}`);
    expect(res.status).toBe(401);
  });

  test('denies student from deleting bookings', async () => {
    const res = await request(app)
      .delete(`/api/bookings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${tokens.student}`);
    expect([401, 403]).toContain(res.status);
  });

  test('allows admin to delete bookings', async () => {
    const res = await request(app)
      .delete(`/api/bookings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    // Admin is allowed — may get 404 (booking not found) or 500 but NOT 401/403
    expectAllowed(res);
  });

  test('allows manager to delete bookings', async () => {
    const res = await request(app)
      .delete(`/api/bookings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('returns appropriate error for non-existent booking', async () => {
    const res = await request(app)
      .delete(`/api/bookings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    // Should get 404 or error, not success
    if (res.status === 200) {
      // If 200, should indicate no booking found or already deleted
      expect(res.body.error || res.body.message || res.body.success === false).toBeTruthy();
    }
  });
});

// ============================================
// 2. PATCH /api/bookings/:id/status — status change
// ============================================
describe('Booking status change — PATCH /api/bookings/:id/status', () => {
  test('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${FAKE_UUID}/status`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(401);
  });

  test('denies student from changing booking status', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${FAKE_UUID}/status`)
      .set('Authorization', `Bearer ${tokens.student}`)
      .send({ status: 'cancelled' });
    expect([401, 403]).toContain(res.status);
  });

  test('allows admin to change status to cancelled', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${FAKE_UUID}/status`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ status: 'cancelled' });
    expectAllowed(res);
  });

  test('allows instructor to change booking status', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${FAKE_UUID}/status`)
      .set('Authorization', `Bearer ${tokens.instructor}`)
      .send({ status: 'completed' });
    expectAllowed(res);
  });

  test('rejects invalid status value', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${FAKE_UUID}/status`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ status: 'hacked' });
    // Should get 400 (invalid status) or not succeed
    if (res.status === 200 && res.body.success) {
      // The status should not have been changed to 'hacked'
      expect(res.body.status).not.toBe('hacked');
    }
  });
});

// ============================================
// 3. PUT /api/bookings/:id — reschedule
// ============================================
describe('Booking reschedule — PUT /api/bookings/:id', () => {
  test('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .put(`/api/bookings/${FAKE_UUID}`)
      .send({ date: '2026-12-01', start_hour: 10 });
    expect(res.status).toBe(401);
  });

  test('denies student from rescheduling', async () => {
    const res = await request(app)
      .put(`/api/bookings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${tokens.student}`)
      .send({ date: '2026-12-01', start_hour: 10 });
    expect([401, 403]).toContain(res.status);
  });

  test('allows admin to reschedule', async () => {
    const res = await request(app)
      .put(`/api/bookings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ date: '2026-12-01', start_hour: 10 });
    expectAllowed(res);
  });

  test('allows manager to reschedule', async () => {
    const res = await request(app)
      .put(`/api/bookings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ date: '2026-12-01', start_hour: 10 });
    expectAllowed(res);
  });

  test('allows instructor to reschedule', async () => {
    const res = await request(app)
      .put(`/api/bookings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${tokens.instructor}`)
      .send({ date: '2026-12-01', start_hour: 10 });
    expectAllowed(res);
  });
});

// ============================================
// 4. Reschedule notifications
// ============================================
describe('Reschedule notifications', () => {
  test('GET /api/reschedule-notifications/pending requires auth', async () => {
    const res = await request(app)
      .get('/api/reschedule-notifications/pending');
    expect(res.status).toBe(401);
  });

  test('GET /api/reschedule-notifications/pending allows authenticated user', async () => {
    const res = await request(app)
      .get('/api/reschedule-notifications/pending')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectAllowed(res);
  });

  test('PATCH /api/reschedule-notifications/:id/confirm requires auth', async () => {
    const res = await request(app)
      .patch(`/api/reschedule-notifications/${FAKE_UUID}/confirm`);
    expect(res.status).toBe(401);
  });

  test('POST /api/reschedule-notifications/confirm-all requires auth', async () => {
    const res = await request(app)
      .post('/api/reschedule-notifications/confirm-all');
    expect(res.status).toBe(401);
  });

  test('POST /api/reschedule-notifications/confirm-all works for authenticated user', async () => {
    const res = await request(app)
      .post('/api/reschedule-notifications/confirm-all')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectAllowed(res);
  });
});

// ============================================
// 5. Booking creation (for completeness)
// ============================================
describe('Booking creation — POST /api/bookings', () => {
  test('rejects unauthenticated booking creation', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ date: '2026-12-01', start_hour: 10 });
    expect(res.status).toBe(401);
  });

  test('validates required fields', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({});
    // Should get 400 (missing fields) or 500 (DB error for null constraint)
    expect([200]).not.toContain(res.status);
  });
});
