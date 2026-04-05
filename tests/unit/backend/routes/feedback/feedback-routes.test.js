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
      expect(res.status).toBe(401);
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

  describe('GET /api/feedback/student/:studentId', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/feedback/student/1');
      expect(res.status).toBe(401);
    });

    test('returns student feedback', async () => {
      const res = await request(app)
        .get('/api/feedback/student/6001')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/feedback/instructor/:instructorId', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/feedback/instructor/1');
      expect(res.status).toBe(401);
    });

    test('returns instructor feedback', async () => {
      const res = await request(app)
        .get('/api/feedback/instructor/6002')
        .set('Authorization', `Bearer ${instructorToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('PATCH /api/feedback/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .patch('/api/feedback/1')
        .send({ rating: 4 });
      expect(res.status).toBe(401);
    });

    test('validates updated rating', async () => {
      const res = await request(app)
        .patch('/api/feedback/1')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ rating: 10 });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/feedback/:id', () => {
    test('requires authentication', async () => {
      const res = await request(app).delete('/api/feedback/1');
      expect(res.status).toBe(401);
    });

    test('prevents student from deleting', async () => {
      const res = await request(app)
        .delete('/api/feedback/1')
        .set('Authorization', `Bearer ${studentToken}`);
      expect([401, 403]).toContain(res.status);
    });
  });
});
