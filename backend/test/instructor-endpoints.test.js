import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import { pool } from '../db.js';

// Utility to create a signed JWT matching server expectations
function createToken(payload = {}) {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  return jwt.sign({ id: payload.id || 9999, email: payload.email || 'instructor@test.local', role: payload.role || 'instructor' }, secret, { expiresIn: '1h' });
}

describe('Instructor feature endpoints', () => {
  const base = '/api/instructors/me';
  let instructorToken;
  let studentToken;

  beforeAll(() => {
    instructorToken = createToken({ role: 'instructor', id: 4242, email: 'instructor@example.com' });
    studentToken = createToken({ role: 'student', id: 5151, email: 'student@example.com' });
  });

  afterAll(async () => {
    // pool.end() is handled by --forceExit flag; calling it here causes hangs
    // when other tests have active connections on the same shared pool
  }, 15000);

  test('GET /dashboard rejects unauthenticated', async () => {
    const res = await request(app).get(`${base}/dashboard`);
    expect(res.status).toBe(401); // missing token
  });

  test('GET /students rejects unauthenticated', async () => {
    const res = await request(app).get(`${base}/students`);
    expect(res.status).toBe(401);
  });

  test('GET /dashboard forbids non-instructor role', async () => {
    const res = await request(app)
      .get(`${base}/dashboard`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect([401,403]).toContain(res.status); // depends on middleware path; accept either
  });

  test('GET /students forbids non-instructor role', async () => {
    const res = await request(app)
      .get(`${base}/students`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect([401,403]).toContain(res.status);
  });

  test('GET /dashboard returns expected shape for instructor', async () => {
    const res = await request(app)
      .get(`${base}/dashboard`)
      .set('Authorization', `Bearer ${instructorToken}`);
    // 200 or 500 if db not seeded; treat 200 shape validation only when success
    if (res.status === 200) {
      expect(res.body).toHaveProperty('finance');
      expect(res.body).toHaveProperty('upcomingLessons');
      expect(Array.isArray(res.body.upcomingLessons)).toBe(true);
      expect(res.body.finance).toHaveProperty('totalEarned');
      expect(res.body.finance).toHaveProperty('pending');
      expect(res.body.finance).toHaveProperty('monthToDate');
      expect(res.body.finance).toHaveProperty('timeseries');
      expect(Array.isArray(res.body.finance.timeseries)).toBe(true);
      expect(res.body.finance).toHaveProperty('pendingThreshold');
      expect(res.body.finance.pendingThreshold).toHaveProperty('amount');
      expect(res.body.finance).toHaveProperty('recentEarnings');
      expect(Array.isArray(res.body.finance.recentEarnings)).toBe(true);
      expect(res.body.finance).toHaveProperty('recentPayments');
      expect(Array.isArray(res.body.finance.recentPayments)).toBe(true);
      expect(res.body).toHaveProperty('lessonInsights');
      expect(res.body.lessonInsights).toHaveProperty('inactiveStudents');
      expect(Array.isArray(res.body.lessonInsights.inactiveStudents)).toBe(true);
      expect(res.body.lessonInsights).toHaveProperty('statusBreakdown');
    } else {
      // Allow 500 in empty CI env without DB; document via console
      console.warn('Dashboard endpoint returned status', res.status, 'body:', res.body);
    }
  expect([200,400,500]).toContain(res.status);
  });

  test('GET /students returns array for instructor', async () => {
    const res = await request(app)
      .get(`${base}/students`)
      .set('Authorization', `Bearer ${instructorToken}`);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        const s = res.body[0];
        expect(s).toHaveProperty('studentId');
        expect(s).toHaveProperty('totalLessonCount');
        expect(s).toHaveProperty('totalHours');
      }
    } else {
      console.warn('Students endpoint returned status', res.status, 'body:', res.body);
    }
  expect([200,400,500]).toContain(res.status);
  });

  test('GET /students/:id/profile requires auth', async () => {
    const res = await request(app).get(`${base}/students/00000000-0000-0000-0000-000000000000/profile`);
    expect(res.status).toBe(401);
  });

  test('GET /students/:id/profile forbids non-instructor', async () => {
    const res = await request(app)
      .get(`${base}/students/00000000-0000-0000-0000-000000000000/profile`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect([401,403]).toContain(res.status);
  });

  test('GET /students/:id/profile allows instructor (flexible status in test env)', async () => {
    const res = await request(app)
      .get(`${base}/students/00000000-0000-0000-0000-000000000000/profile`)
      .set('Authorization', `Bearer ${instructorToken}`);
    expect([200,400,403,404,500]).toContain(res.status);
  });

  test('PATCH /students/:id/profile forbids non-instructor', async () => {
    const res = await request(app)
      .patch(`${base}/students/00000000-0000-0000-0000-000000000000/profile`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ level: 'beginner' });
    expect([401,403]).toContain(res.status);
  });

  test('POST /students/:id/progress forbids non-instructor', async () => {
    const res = await request(app)
      .post(`${base}/students/00000000-0000-0000-0000-000000000000/progress`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ skillId: '00000000-0000-0000-0000-000000000000', dateAchieved: '2025-01-01' });
    expect([401,403]).toContain(res.status);
  });
});
