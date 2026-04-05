import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

let app;
let groupBookingService;
let pool;

const createToken = (overrides = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  const payload = {
    id: overrides.id || '11111111-1111-1111-1111-111111111111',
    email: overrides.email || 'user@example.com',
    role: overrides.role || 'student'
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

describe('Group Bookings Routes', () => {
  const base = '/api/group-bookings';
  let adminToken;
  let managerToken;
  let studentToken;
  let outsiderToken;

  beforeAll(async () => {
    await jest.unstable_mockModule('../../../backend/db.js', () => ({
      pool: {
        query: jest.fn()
      }
    }));

    await jest.unstable_mockModule('../../../backend/services/groupBookingService.js', () => ({
      createGroupBooking: jest.fn(),
      inviteParticipants: jest.fn(),
      addParticipantsByUserIds: jest.fn(),
      acceptGroupBookingInvitation: jest.fn(),
      declineGroupBookingInvitation: jest.fn(),
      getGroupBookingDetails: jest.fn(),
      getUserGroupBookings: jest.fn(),
      cancelGroupBooking: jest.fn(),
      generateGenericInviteLink: jest.fn(),
      getInvitationByToken: jest.fn(),
      acceptInvitation: jest.fn(),
      declineInvitation: jest.fn(),
      processParticipantPayment: jest.fn(),
      processOrganizerPayment: jest.fn()
    }));

    ({ default: app } = await import('../../../../../backend/../backend/server.js'));
    ({ pool } = await import('../../../../../backend/../backend/db.js'));
    groupBookingService = await import('../../../../../backend/../backend/services/groupBookingService.js');

    adminToken = createToken({ role: 'admin' });
    managerToken = createToken({ role: 'manager' });
    studentToken = createToken({ role: 'student' });
    outsiderToken = createToken({ role: 'outsider' });
  });

  afterAll(async () => {
    // Pool cleanup handled by --forceExit
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST / - Create group booking', () => {
    test('requires authentication', async () => {
      const response = await request(app).post(`${base}/`).send({
        serviceId: '22222222-2222-2222-2222-222222222222',
        pricePerPerson: 50,
        scheduledDate: '2026-04-10',
        startTime: '10:00'
      });
      expect(response.status).toBe(401);
    });

    test('student can create group booking with participant IDs', async () => {
      const mockBooking = {
        id: '33333333-3333-3333-3333-333333333333',
        organizerId: '11111111-1111-1111-1111-111111111111',
        serviceId: '22222222-2222-2222-2222-222222222222',
        pricePerPerson: 50,
        status: 'pending'
      };

      jest.spyOn(groupBookingService, 'createGroupBooking')
        .mockResolvedValueOnce(mockBooking);
      jest.spyOn(groupBookingService, 'addParticipantsByUserIds')
        .mockResolvedValueOnce([
          { id: '44444444-4444-4444-4444-444444444444', status: 'invited' }
        ]);

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          serviceId: '22222222-2222-2222-2222-222222222222',
          pricePerPerson: 50,
          scheduledDate: '2026-04-10',
          startTime: '10:00',
          durationHours: 2,
          participantIds: ['44444444-4444-4444-4444-444444444444'],
          paymentModel: 'individual'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(groupBookingService.createGroupBooking).toHaveBeenCalled();
    });

    test('rejects when required fields are missing', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          pricePerPerson: 50
          // Missing serviceId, scheduledDate, startTime
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/required/i);
    });

    test('rejects invalid payment model', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          serviceId: '22222222-2222-2222-2222-222222222222',
          pricePerPerson: 50,
          scheduledDate: '2026-04-10',
          startTime: '10:00',
          paymentModel: 'invalid_model'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/payment model/i);
    });

    test('student must invite at least 1 other person unless generating link', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          serviceId: '22222222-2222-2222-2222-222222222222',
          pricePerPerson: 50,
          scheduledDate: '2026-04-10',
          startTime: '10:00'
          // No invitees or participantIds
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/at least/i);
    });

    test('allows generating shareable link without full schedule', async () => {
      const mockBooking = {
        id: '33333333-3333-3333-3333-333333333333',
        organizerId: '11111111-1111-1111-1111-111111111111'
      };

      jest.spyOn(groupBookingService, 'createGroupBooking')
        .mockResolvedValueOnce(mockBooking);
      jest.spyOn(groupBookingService, 'generateGenericInviteLink')
        .mockResolvedValueOnce({ token: 'abc123xyz', url: '/join/abc123xyz' });

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          serviceId: '22222222-2222-2222-2222-222222222222',
          generateLink: true
        });

      expect(response.status).toBe(201);
      expect(groupBookingService.generateGenericInviteLink).toHaveBeenCalled();
    });
  });

  describe('GET / - List group bookings', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/`);
      expect(response.status).toBe(401);
    });

    test('student sees their own group bookings', async () => {
      const mockBookings = [
        {
          id: '33333333-3333-3333-3333-333333333333',
          title: 'Group Lesson 1',
          status: 'active'
        }
      ];

      jest.spyOn(groupBookingService, 'getUserGroupBookings')
        .mockResolvedValueOnce(mockBookings);

      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(groupBookingService.getUserGroupBookings).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });

    test('admin sees all group bookings', async () => {
      const mockBookings = [
        { id: '33333333-3333-3333-3333-333333333333', title: 'Group Lesson 1' },
        { id: '44444444-4444-4444-4444-444444444444', title: 'Group Lesson 2' }
      ];

      jest.spyOn(groupBookingService, 'getUserGroupBookings')
        .mockResolvedValueOnce(mockBookings);

      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /:id - Get group booking details', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/33333333-3333-3333-3333-333333333333`);
      expect(response.status).toBe(401);
    });

    test('returns group booking details when found', async () => {
      const mockBooking = {
        id: '33333333-3333-3333-3333-333333333333',
        title: 'Group Lesson',
        participants: 3,
        status: 'active'
      };

      jest.spyOn(groupBookingService, 'getGroupBookingDetails')
        .mockResolvedValueOnce(mockBooking);

      const response = await request(app)
        .get(`${base}/33333333-3333-3333-3333-333333333333`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooking);
    });

    test('returns 404 when booking not found', async () => {
      jest.spyOn(groupBookingService, 'getGroupBookingDetails')
        .mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`${base}/99999999-9999-9999-9999-999999999999`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:id - Cancel group booking', () => {
    test('requires authentication', async () => {
      const response = await request(app).delete(`${base}/33333333-3333-3333-3333-333333333333`);
      expect(response.status).toBe(401);
    });

    test('organizer can cancel their booking', async () => {
      const mockResult = {
        id: '33333333-3333-3333-3333-333333333333',
        status: 'cancelled'
      };

      jest.spyOn(groupBookingService, 'cancelGroupBooking')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .delete(`${base}/33333333-3333-3333-3333-333333333333`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'cancelled');
    });

    test('admin can cancel any booking', async () => {
      const mockResult = {
        id: '33333333-3333-3333-3333-333333333333',
        status: 'cancelled'
      };

      jest.spyOn(groupBookingService, 'cancelGroupBooking')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .delete(`${base}/33333333-3333-3333-3333-333333333333`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    test('returns 404 when booking not found', async () => {
      jest.spyOn(groupBookingService, 'cancelGroupBooking')
        .mockRejectedValueOnce(new Error('Booking not found'));

      const response = await request(app)
        .delete(`${base}/99999999-9999-9999-9999-999999999999`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('Participant Management', () => {
    test('POST /accept - Accept group booking invitation', async () => {
      const mockResult = {
        id: '33333333-3333-3333-3333-333333333333',
        status: 'accepted'
      };

      jest.spyOn(groupBookingService, 'acceptGroupBookingInvitation')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .post(`${base}/33333333-3333-3333-3333-333333333333/accept`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect([200, 201]).toContain(response.status);
    });

    test('POST /decline - Decline group booking invitation', async () => {
      const mockResult = {
        id: '33333333-3333-3333-3333-333333333333',
        status: 'declined'
      };

      jest.spyOn(groupBookingService, 'declineGroupBookingInvitation')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .post(`${base}/33333333-3333-3333-3333-333333333333/decline`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect([200, 201]).toContain(response.status);
    });
  });
});
