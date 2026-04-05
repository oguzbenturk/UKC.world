import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

let app;
let pool;
let notificationWriter;
let marketingConsentService;

const createToken = (overrides = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  const payload = {
    id: overrides.id || '11111111-1111-1111-1111-111111111111',
    email: overrides.email || 'user@example.com',
    role: overrides.role || 'student'
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

describe('Notifications Routes', () => {
  const base = '/api/notifications';
  let adminToken;
  let managerToken;
  let studentToken;

  beforeAll(async () => {
    await jest.unstable_mockModule('../../../backend/db.js', () => ({
      pool: {
        query: jest.fn()
      }
    }));

    await jest.unstable_mockModule('../../../backend/services/notificationWriter.js', () => ({
      insertNotification: jest.fn()
    }));

    await jest.unstable_mockModule('../../../backend/services/marketingConsentService.js', () => ({
      filterUsersByConsent: jest.fn(),
      classifyNotification: jest.fn(),
      CHANNEL: { IN_APP: 'in_app', EMAIL: 'email', PUSH: 'push' },
      COMMUNICATION_TYPE: { MARKETING: 'marketing', TRANSACTIONAL: 'transactional' }
    }));

    ({ default: app } = await import('../../../../../backend/../backend/server.js'));
    ({ pool } = await import('../../../../../backend/../backend/db.js'));
    notificationWriter = await import('../../../../../backend/../backend/services/notificationWriter.js');
    marketingConsentService = await import('../../../../../backend/../backend/services/marketingConsentService.js');

    adminToken = createToken({ role: 'admin' });
    managerToken = createToken({ role: 'manager' });
    studentToken = createToken({ role: 'student' });
  });

  afterAll(async () => {
    // Pool cleanup handled by --forceExit
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /subscribe - Push notification subscription', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .post(`${base}/subscribe`)
        .send({
          endpoint: 'https://example.com/endpoint',
          keys: {
            p256dh: 'key123',
            auth: 'auth456'
          }
        });

      expect(response.status).toBe(401);
    });

    test('student can subscribe to push notifications', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rowCount: 1 });

      const response = await request(app)
        .post(`${base}/subscribe`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          endpoint: 'https://example.com/endpoint',
          keys: {
            p256dh: 'key123',
            auth: 'auth456'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('rejects missing endpoint', async () => {
      const response = await request(app)
        .post(`${base}/subscribe`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          keys: { p256dh: 'key123', auth: 'auth456' }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });

    test('rejects missing auth key', async () => {
      const response = await request(app)
        .post(`${base}/subscribe`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          endpoint: 'https://example.com/endpoint',
          keys: { p256dh: 'key123' }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('POST /unsubscribe - Push notification unsubscription', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .post(`${base}/unsubscribe`)
        .send({ endpoint: 'https://example.com/endpoint' });

      expect(response.status).toBe(401);
    });

    test('student can unsubscribe from push notifications', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rowCount: 1 });

      const response = await request(app)
        .post(`${base}/unsubscribe`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ endpoint: 'https://example.com/endpoint' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('rejects missing endpoint', async () => {
      const response = await request(app)
        .post(`${base}/unsubscribe`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /send - Send notifications', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .post(`${base}/send`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Test',
          message: 'Message',
          type: 'general'
        });

      expect([401, 403]).toContain(response.status);
    });

    test('admin can send notification to all subscribers', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            { user_id: '22222222-2222-2222-2222-222222222222' },
            { user_id: '33333333-3333-3333-3333-333333333333' }
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { id: '11111111-1111-1111-1111-111111111111', user_id: '22222222-2222-2222-2222-222222222222' },
            { id: '22222222-2222-2222-2222-222222222222', user_id: '33333333-3333-3333-3333-333333333333' }
          ]
        });

      jest.spyOn(notificationWriter, 'insertNotification')
        .mockResolvedValue({ inserted: true, id: '44444444-4444-4444-4444-444444444444' });

      const response = await request(app)
        .post(`${base}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'System Update',
          message: 'New feature available',
          type: 'general'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sent');
    });

    test('rejects missing title', async () => {
      const response = await request(app)
        .post(`${base}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          message: 'Test message',
          type: 'general'
        });

      expect(response.status).toBe(400);
    });

    test('rejects invalid notification type', async () => {
      const response = await request(app)
        .post(`${base}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test',
          message: 'Message',
          type: 'invalid_type'
        });

      expect(response.status).toBe(400);
    });

    test('filters marketing notifications by consent', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            { user_id: '22222222-2222-2222-2222-222222222222' },
            { user_id: '33333333-3333-3333-3333-333333333333' }
          ]
        })
        .mockResolvedValueOnce({
          rows: []
        })
        .mockResolvedValueOnce({
          rows: [
            { id: '55555555-5555-5555-5555-555555555555', user_id: '22222222-2222-2222-2222-222222222222' }
          ]
        });

      jest.spyOn(marketingConsentService, 'filterUsersByConsent')
        .mockResolvedValueOnce({
          allowed: ['22222222-2222-2222-2222-222222222222'],
          blocked: ['33333333-3333-3333-3333-333333333333']
        });

      jest.spyOn(notificationWriter, 'insertNotification')
        .mockResolvedValue({ inserted: true, id: '66666666-6666-6666-6666-666666666666' });

      const response = await request(app)
        .post(`${base}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Promo',
          message: 'Limited offer',
          type: 'promotion',
          isMarketing: true
        });

      expect(response.status).toBe(200);
      expect(response.body.blockedByConsent).toBe(1);
    });
  });

  describe('GET /user - Get user notifications', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/user`);
      expect(response.status).toBe(401);
    });

    test('student can retrieve own notifications', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            { id: '77777777-7777-7777-7777-777777777777', title: 'Test', message: 'Message', created_at: new Date() }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ count: '1' }]
        })
        .mockResolvedValueOnce({
          rows: [{ count: '0' }]
        });

      const response = await request(app)
        .get(`${base}/user`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('meta');
    });

    test('supports pagination', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get(`${base}/user?page=2&limit=10`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(10);
    });

    test('filters unread notifications when requested', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      await request(app)
        .get(`${base}/user?unreadOnly=true`)
        .set('Authorization', `Bearer ${studentToken}`);

      const calls = pool.query.mock.calls;
      expect(calls.some(call => call[0].includes('read_at IS NULL'))).toBe(true);
    });
  });

  describe('PATCH /:notificationId/read - Mark notification as read', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .patch(`${base}/77777777-7777-7777-7777-777777777777/read`);

      expect(response.status).toBe(401);
    });

    test('marks notification as read', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          { id: '77777777-7777-7777-7777-777777777777', title: 'Test', read_at: new Date() }
        ]
      });

      const response = await request(app)
        .patch(`${base}/77777777-7777-7777-7777-777777777777/read`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
    });

    test('returns 404 when notification not found', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .patch(`${base}/99999999-9999-9999-9999-999999999999/read`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /read-all - Mark all notifications as read', () => {
    test('requires authentication', async () => {
      const response = await request(app).patch(`${base}/read-all`);
      expect(response.status).toBe(401);
    });

    test('marks all user notifications as read', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rowCount: 5,
        rows: []
      });

      const response = await request(app)
        .patch(`${base}/read-all`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.updatedCount).toBe(5);
    });
  });

  describe('DELETE /clear-all - Clear all notifications', () => {
    test('requires authentication', async () => {
      const response = await request(app).delete(`${base}/clear-all`);
      expect(response.status).toBe(401);
    });

    test('deletes all user notifications', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rowCount: 3,
        rows: []
      });

      const response = await request(app)
        .delete(`${base}/clear-all`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.deletedCount).toBe(3);
    });
  });

  describe('GET /settings - Get notification settings', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/settings`);
      expect(response.status).toBe(401);
    });

    test('returns default settings when none stored', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`${base}/settings`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('weather_alerts', true);
      expect(response.body).toHaveProperty('booking_updates', true);
      expect(response.body).toHaveProperty('payment_notifications', true);
    });

    test('returns stored settings', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            weather_alerts: false,
            booking_updates: true,
            payment_notifications: true,
            general_announcements: false,
            email_notifications: true,
            push_notifications: false,
            new_booking_alerts: true
          }
        ]
      });

      const response = await request(app)
        .get(`${base}/settings`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.weather_alerts).toBe(false);
      expect(response.body.push_notifications).toBe(false);
    });
  });

  describe('PUT /settings - Update notification settings', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .put(`${base}/settings`)
        .send({ weather_alerts: false });

      expect(response.status).toBe(401);
    });

    test('updates notification settings', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            user_id: '11111111-1111-1111-1111-111111111111',
            weather_alerts: false,
            booking_updates: true,
            push_notifications: false
          }
        ]
      });

      const response = await request(app)
        .put(`${base}/settings`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          weather_alerts: false,
          push_notifications: false
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user_id');
    });

    test('validates boolean fields', async () => {
      const response = await request(app)
        .put(`${base}/settings`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          weather_alerts: 'not-a-boolean',
          booking_updates: true
        });

      expect(response.status).toBe(400);
    });
  });
});
