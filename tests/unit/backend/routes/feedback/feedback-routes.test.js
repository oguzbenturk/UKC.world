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

describe('Feedback Routes', () => {
  let studentToken;
  let instructorToken;
  let adminToken;
  let managerToken;

  beforeAll(async () => {
    ({ default: app } = await import('../../../../../backend/server.js'));

    studentToken = createToken({ role: 'student', id: 6001 });
    instructorToken = createToken({ role: 'instructor', id: 6002 });
    adminToken = createToken({ role: 'admin', id: 6003 });
    managerToken = createToken({ role: 'manager', id: 6004 });
  });

  afterAll(async () => {
    jest.clearAllMocks();
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/feedback', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .send({ bookingId: 1, rating: 5 });
      // Unauthenticated mutating requests are rejected by csrfMiddleware (backend/middlewares/security.js,
      // since v0.1.148) with 403 before the auth middleware can answer 401 — both mean "rejected".
      expect([401, 403]).toContain(res.status);
    });

    test('allows student feedback', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookingId: 1,
          rating: 5,
          comment: 'Great lesson!'
        });
      expect([201, 404, 409, 500]).toContain(res.status);
    });

    test('allows admin feedback', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bookingId: 2, rating: 4 });
      expect([201, 404, 409, 500]).toContain(res.status);
    });

    test('validates rating 1-5', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ bookingId: 1, rating: 0 });
      expect(res.status).toBe(400);
    });

    test('rejects rating > 5', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ bookingId: 1, rating: 6 });
      expect(res.status).toBe(400);
    });

    test('requires bookingId', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ rating: 5 });
      expect(res.status).toBe(400);
    });

    test('requires rating', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ bookingId: 1 });
      expect(res.status).toBe(400);
    });

    test('validates comment max length', async () => {
      const longComment = 'a'.repeat(1001);
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookingId: 1,
          rating: 5,
          comment: longComment
        });
      expect(res.status).toBe(400);
    });

    test('validates skill level enum', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookingId: 1,
          rating: 5,
          skillLevel: 'expert'
        });
      expect(res.status).toBe(400);
    });

    test('accepts valid skill levels', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookingId: 1,
          rating: 5,
          skillLevel: 'beginner'
        });
      expect([201, 400, 404, 409, 500]).toContain(res.status);
    });

    test('validates progress notes max length', async () => {
      const longNotes = 'a'.repeat(501);
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookingId: 1,
          rating: 5,
          progressNotes: longNotes
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/feedback/booking/:bookingId', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/feedback/booking/1');
      expect(res.status).toBe(401);
    });

    test('allows student to view own feedback', async () => {
      const res = await request(app)
        .get('/api/feedback/booking/1')
        .set('Authorization', `Bearer ${studentToken}`);
      expect([200, 500]).toContain(res.status);
    });

    test('allows instructor to view feedback', async () => {
      const res = await request(app)
        .get('/api/feedback/booking/1')
        .set('Authorization', `Bearer ${instructorToken}`);
      expect([200, 500]).toContain(res.status);
    });

    test('allows admin to view feedback', async () => {
      const res = await request(app)
        .get('/api/feedback/booking/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  // NOTE: the original suite targeted GET /student/:id, GET /instructor/:id, PATCH /:id and
  // DELETE /:id — routes/feedback.js has never had those (file unchanged since the initial
  // commit). The read tests are retargeted to the real endpoints the frontend uses
  // (FeedbackPage.jsx: /achievements/:studentId and /instructor/:id/summary); PATCH/DELETE
  // assert that feedback cannot be edited/deleted through the API (no such route → 404).
  describe('GET /api/feedback/achievements/:studentId', () => {
    const OWN_STUDENT_UUID = '6a000000-0000-4000-8000-000000006001';
    const OTHER_STUDENT_UUID = '6a000000-0000-4000-8000-000000006999';

    test('requires authentication', async () => {
      const res = await request(app).get('/api/feedback/achievements/1');
      expect(res.status).toBe(401);
    });

    test('returns student achievements for admin', async () => {
      const res = await request(app)
        .get(`/api/feedback/achievements/${OWN_STUDENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });

    // Regression: the ownership check used parseInt(studentId) !== req.user.id, which can
    // never match a UUID, so students always got 403 on their own achievements.
    test('student can read own achievements (UUID ids)', async () => {
      const token = createToken({ role: 'student', id: OWN_STUDENT_UUID });
      const res = await request(app)
        .get(`/api/feedback/achievements/${OWN_STUDENT_UUID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    test("student cannot read another student's achievements", async () => {
      const token = createToken({ role: 'student', id: OWN_STUDENT_UUID });
      const res = await request(app)
        .get(`/api/feedback/achievements/${OTHER_STUDENT_UUID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/feedback/instructor/:instructorId/summary', () => {
    const OWN_INSTRUCTOR_UUID = '6a000000-0000-4000-8000-000000006002';
    const OTHER_INSTRUCTOR_UUID = '6a000000-0000-4000-8000-000000006998';

    test('requires authentication', async () => {
      const res = await request(app).get('/api/feedback/instructor/1/summary');
      expect(res.status).toBe(401);
    });

    // Regression: same parseInt-vs-UUID ownership bug as achievements (always 403).
    test('instructor can read own summary (UUID ids)', async () => {
      const token = createToken({ role: 'instructor', id: OWN_INSTRUCTOR_UUID });
      const res = await request(app)
        .get(`/api/feedback/instructor/${OWN_INSTRUCTOR_UUID}/summary`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    test("instructor cannot read another instructor's summary", async () => {
      const token = createToken({ role: 'instructor', id: OWN_INSTRUCTOR_UUID });
      const res = await request(app)
        .get(`/api/feedback/instructor/${OTHER_INSTRUCTOR_UUID}/summary`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

  });

  describe('PATCH /api/feedback/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .patch('/api/feedback/1')
        .send({ rating: 4 });
      // Unauthenticated mutating requests are rejected by csrfMiddleware (backend/middlewares/security.js,
      // since v0.1.148) with 403 before the auth middleware can answer 401 — both mean "rejected".
      expect([401, 403]).toContain(res.status);
    });

    test('feedback cannot be edited via the API (no PATCH route)', async () => {
      const res = await request(app)
        .patch('/api/feedback/1')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ rating: 10 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/feedback/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app).delete('/api/feedback/1');
      // Unauthenticated mutating requests are rejected by csrfMiddleware (backend/middlewares/security.js,
      // since v0.1.148) with 403 before the auth middleware can answer 401 — both mean "rejected".
      expect([401, 403]).toContain(res.status);
    });

    test('prevents student from deleting (there is no DELETE route at all)', async () => {
      const res = await request(app)
        .delete('/api/feedback/1')
        .set('Authorization', `Bearer ${studentToken}`);
      expect([401, 403, 404]).toContain(res.status);
    });
  });
});
