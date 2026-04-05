import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

let app;
let groupLessonRequestService;

const createToken = (overrides = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  const payload = {
    id: overrides.id || '11111111-1111-1111-1111-111111111111',
    email: overrides.email || 'user@example.com',
    role: overrides.role || 'student'
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

describe('Group Lesson Requests Routes', () => {
  const base = '/api/group-lesson-requests';
  let adminToken;
  let managerToken;
  let studentToken;

  beforeAll(async () => {
    await jest.unstable_mockModule('../../../backend/services/groupLessonRequestService.js', () => ({
      createGroupLessonRequest: jest.fn(),
      getUserRequests: jest.fn(),
      getAllRequests: jest.fn(),
      cancelRequest: jest.fn(),
      adminCancelRequest: jest.fn(),
      matchRequests: jest.fn(),
      getRequestById: jest.fn()
    }));

    await jest.unstable_mockModule('../../../backend/db.js', () => ({
      pool: { query: jest.fn() }
    }));

    ({ default: app } = await import('../../../backend/server.js'));
    groupLessonRequestService = await import('../../../backend/services/groupLessonRequestService.js');

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

  describe('POST / - Submit group lesson request', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .send({
          serviceId: '22222222-2222-2222-2222-222222222222',
          preferredDateStart: '2026-04-10'
        });
      expect(response.status).toBe(401);
    });

    test('student can submit group lesson request', async () => {
      const mockRequest = {
        id: '33333333-3333-3333-3333-333333333333',
        userId: '11111111-1111-1111-1111-111111111111',
        serviceId: '22222222-2222-2222-2222-222222222222',
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      jest.spyOn(groupLessonRequestService, 'createGroupLessonRequest')
        .mockResolvedValueOnce(mockRequest);

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          serviceId: '22222222-2222-2222-2222-222222222222',
          preferredDateStart: '2026-04-10',
          preferredDateEnd: '2026-04-17',
          preferredTimeOfDay: 'morning',
          preferredDurationHours: 2,
          skillLevel: 'intermediate',
          notes: 'Flexible on dates'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('request');
      expect(groupLessonRequestService.createGroupLessonRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: '22222222-2222-2222-2222-222222222222',
          preferredDateStart: '2026-04-10'
        })
      );
    });

    test('rejects request missing serviceId', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          preferredDateStart: '2026-04-10'
          // Missing serviceId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/serviceId/i);
    });

    test('rejects request missing preferredDateStart', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          serviceId: '22222222-2222-2222-2222-222222222222'
          // Missing preferredDateStart
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/preferredDateStart/i);
    });
  });

  describe('GET / - List group lesson requests', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/`);
      expect(response.status).toBe(401);
    });

    test('student sees only their own requests', async () => {
      const mockRequests = [
        {
          id: '33333333-3333-3333-3333-333333333333',
          status: 'pending',
          serviceId: '22222222-2222-2222-2222-222222222222'
        }
      ];

      jest.spyOn(groupLessonRequestService, 'getUserRequests')
        .mockResolvedValueOnce(mockRequests);

      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('requests');
      expect(response.body.requests).toEqual(mockRequests);
      expect(groupLessonRequestService.getUserRequests).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });

    test('admin sees all requests with optional filters', async () => {
      const mockRequests = [
        { id: '33333333-3333-3333-3333-333333333333', status: 'pending' },
        { id: '44444444-4444-4444-4444-444444444444', status: 'pending' }
      ];

      jest.spyOn(groupLessonRequestService, 'getAllRequests')
        .mockResolvedValueOnce(mockRequests);

      const response = await request(app)
        .get(`${base}/?status=pending&serviceId=22222222-2222-2222-2222-222222222222&skillLevel=intermediate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.requests).toEqual(mockRequests);
      expect(groupLessonRequestService.getAllRequests).toHaveBeenCalledWith({
        status: 'pending',
        serviceId: '22222222-2222-2222-2222-222222222222',
        skillLevel: 'intermediate'
      });
    });

    test('manager sees all requests', async () => {
      jest.spyOn(groupLessonRequestService, 'getAllRequests')
        .mockResolvedValueOnce([]);

      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(groupLessonRequestService.getAllRequests).toHaveBeenCalled();
    });
  });

  describe('DELETE /:id - Cancel request', () => {
    test('requires authentication', async () => {
      const response = await request(app).delete(`${base}/33333333-3333-3333-3333-333333333333`);
      expect(response.status).toBe(401);
    });

    test('student can cancel own request', async () => {
      const mockResult = {
        id: '33333333-3333-3333-3333-333333333333',
        status: 'cancelled'
      };

      jest.spyOn(groupLessonRequestService, 'cancelRequest')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .delete(`${base}/33333333-3333-3333-3333-333333333333`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Request cancelled');
      expect(groupLessonRequestService.cancelRequest).toHaveBeenCalledWith(
        '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111'
      );
    });

    test('admin can cancel any request', async () => {
      const mockResult = {
        id: '33333333-3333-3333-3333-333333333333',
        status: 'cancelled'
      };

      jest.spyOn(groupLessonRequestService, 'adminCancelRequest')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .delete(`${base}/33333333-3333-3333-3333-333333333333`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(groupLessonRequestService.adminCancelRequest).toHaveBeenCalledWith('33333333-3333-3333-3333-333333333333');
    });

    test('returns 404 when request not found', async () => {
      jest.spyOn(groupLessonRequestService, 'cancelRequest')
        .mockRejectedValueOnce(new Error('Request not found'));

      const response = await request(app)
        .delete(`${base}/99999999-9999-9999-9999-999999999999`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /match - Match requests into group booking', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .post(`${base}/match`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          requestIds: ['33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'],
          title: 'Group Lesson',
          instructorId: '55555555-5555-5555-5555-555555555555',
          scheduledDate: '2026-04-10',
          startTime: '10:00',
          durationHours: 2,
          pricePerPerson: 50
        });

      expect([401, 403]).toContain(response.status);
    });

    test('manager can match at least 2 requests into group booking', async () => {
      const mockResult = {
        groupBooking: {
          id: '66666666-6666-6666-6666-666666666666',
          title: 'Group Lesson',
          status: 'pending'
        },
        matchedRequests: [
          { id: '33333333-3333-3333-3333-333333333333', status: 'matched' },
          { id: '44444444-4444-4444-4444-444444444444', status: 'matched' }
        ]
      };

      jest.spyOn(groupLessonRequestService, 'matchRequests')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .post(`${base}/match`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          requestIds: ['33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'],
          title: 'Group Lesson',
          instructorId: '55555555-5555-5555-5555-555555555555',
          scheduledDate: '2026-04-10',
          startTime: '10:00',
          durationHours: 2,
          pricePerPerson: 50,
          currency: 'EUR'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('groupBooking');
      expect(response.body.matchedRequests.length).toBe(2);
    });

    test('rejects when less than 2 request IDs provided', async () => {
      const response = await request(app)
        .post(`${base}/match`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          requestIds: ['33333333-3333-3333-3333-333333333333'],
          title: 'Group Lesson'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/at least 2/i);
    });

    test('rejects when requestIds is not an array', async () => {
      const response = await request(app)
        .post(`${base}/match`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          requestIds: 'not-an-array',
          title: 'Group Lesson'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /mark-matched - Mark requests as matched', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .post(`${base}/mark-matched`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          requestIds: ['33333333-3333-3333-3333-333333333333'],
          bookingId: '66666666-6666-6666-6666-666666666666'
        });

      expect([401, 403]).toContain(response.status);
    });

    test('admin can mark requests as matched to existing booking', async () => {
      const mockPoolResponse = {
        rowCount: 1,
        rows: [
          {
            id: '33333333-3333-3333-3333-333333333333',
            status: 'matched',
            matched_at: new Date().toISOString()
          }
        ]
      };

      // Mock pool.query is already set up
      const { pool } = await import('../../../backend/db.js');
      jest.spyOn(pool, 'query').mockResolvedValueOnce(mockPoolResponse);

      const response = await request(app)
        .post(`${base}/mark-matched`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          requestIds: ['33333333-3333-3333-3333-333333333333'],
          bookingId: '66666666-6666-6666-6666-666666666666'
        });

      expect([200, 201]).toContain(response.status);
      expect(response.body).toHaveProperty('message');
    });

    test('rejects when requestIds is not an array', async () => {
      const response = await request(app)
        .post(`${base}/mark-matched`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          requestIds: 'not-an-array',
          bookingId: '66666666-6666-6666-6666-666666666666'
        });

      expect(response.status).toBe(400);
    });

    test('rejects when requestIds array is empty', async () => {
      const response = await request(app)
        .post(`${base}/mark-matched`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          requestIds: [],
          bookingId: '66666666-6666-6666-6666-666666666666'
        });

      expect(response.status).toBe(400);
    });
  });
});
