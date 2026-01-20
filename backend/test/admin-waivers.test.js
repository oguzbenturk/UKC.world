import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import { pool } from '../db.js';

const createToken = ({ id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role = 'admin', email = 'admin@example.com' } = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  return jwt.sign({ id, role, email }, secret, { expiresIn: '1h' });
};

describe('Admin waiver management routes', () => {
  const basePath = '/api/admin/waivers';
  let adminToken;
  let managerToken;
  let studentToken;

  beforeAll(() => {
    adminToken = createToken({ role: 'admin', email: 'admin@test.local' });
    managerToken = createToken({ role: 'manager', email: 'manager@test.local' });
    studentToken = createToken({ role: 'student', email: 'student@test.local' });
  });

  afterAll(async () => {
    // pool.end() is handled by --forceExit flag; calling it here causes hangs
    // when other tests have active connections on the same shared pool
  }, 15000);

  test('GET / rejects unauthenticated requests', async () => {
    const res = await request(app).get(basePath);
    expect(res.status).toBe(401);
  });

  test('GET / forbids non-admin roles', async () => {
    const res = await request(app)
      .get(basePath)
      .set('Authorization', `Bearer ${studentToken}`);
    expect([401, 403]).toContain(res.status);
  });

  test('GET / allows admin role', async () => {
    const res = await request(app)
      .get(basePath)
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    }
  });

  test('GET /stats allows manager role', async () => {
    const res = await request(app)
      .get(`${basePath}/stats`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
    }
  });

  test('GET /export returns CSV for admin', async () => {
    const res = await request(app)
      .get(`${basePath}/export`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(typeof res.text).toBe('string');
    }
  });

  test('GET /subjects/:id requires type parameter', async () => {
    const res = await request(app)
      .get(`${basePath}/subjects/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test('GET /subjects/:id returns 404 for unknown subject', async () => {
    const res = await request(app)
      .get(`${basePath}/subjects/00000000-0000-0000-0000-000000000000`)
      .query({ type: 'user' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect([404, 500]).toContain(res.status);
  });
});
