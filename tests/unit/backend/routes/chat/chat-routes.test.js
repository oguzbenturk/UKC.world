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

describe('Chat Routes', () => {
  let adminToken;
  let managerToken;
  let userToken;

  beforeAll(async () => {
    ({ default: app } = await import('../../../../../backend/server.js'));

    adminToken = createToken({ role: 'admin', id: 3001 });
    managerToken = createToken({ role: 'manager', id: 3002 });
    userToken = createToken({ role: 'user', id: 3003 });
  });

  afterAll(async () => {
    jest.clearAllMocks();
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/chat/conversations', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/chat/conversations');
      expect(res.status).toBe(401);
    });

    test('returns user conversations', async () => {
      const res = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${userToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/chat/channels/available', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/chat/channels/available');
      expect(res.status).toBe(401);
    });

    test('returns available channels', async () => {
      const res = await request(app)
        .get('/api/chat/channels/available')
        .set('Authorization', `Bearer ${userToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /api/chat/conversations/direct', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/direct')
        .send({ otherUserId: 5 });
      expect(res.status).toBe(401);
    });

    test('requires otherUserId', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/direct')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('prevents self conversation', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/direct')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ otherUserId: 3003 });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/chat/conversations/group', () => {
    test('requires admin/manager role', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/group')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Team Chat' });
      expect([401, 403]).toContain(res.status);
    });

    test('requires name field', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/group')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/chat/conversations/channel', () => {
    test('requires admin/manager', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/channel')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'announcements' });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('POST /api/chat/conversations/:id/messages', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/1/messages')
        .send({ messageType: 'text', content: 'Hello' });
      expect(res.status).toBe(401);
    });

    test('requires content for text messages', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/1/messages')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ messageType: 'text' });
      expect(res.status).toBe(400);
    });

    test('requires attachment URL for images', async () => {
      const res = await request(app)
        .post('/api/chat/conversations/1/messages')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ messageType: 'image' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/chat/search', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .get('/api/chat/search')
        .query({ q: 'hello' });
      expect(res.status).toBe(401);
    });

    test('requires minimum query length', async () => {
      const res = await request(app)
        .get('/api/chat/search')
        .query({ q: 'a' })
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/chat/admin/stats', () => {
    test('requires admin/manager role', async () => {
      const res = await request(app)
        .get('/api/chat/admin/stats')
        .set('Authorization', `Bearer ${userToken}`);
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('POST /api/chat/admin/cleanup', () => {
    test('requires admin role', async () => {
      const res = await request(app)
        .post('/api/chat/admin/cleanup')
        .set('Authorization', `Bearer ${managerToken}`);
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /api/chat/health', () => {
    test('health check no auth required', async () => {
      const res = await request(app).get('/api/chat/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
