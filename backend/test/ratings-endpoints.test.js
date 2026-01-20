import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

let app;
let pool;
let ratingService;

const createToken = (overrides = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  const payload = {
    id: overrides.id || '22222222-2222-2222-2222-222222222222',
    email: overrides.email || 'user@example.com',
    role: overrides.role || 'student'
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

describe('Ratings admin endpoints', () => {
  const base = '/api/ratings';
  let adminToken;
  let managerToken;
  let instructorToken;

  beforeAll(async () => {
    await jest.unstable_mockModule('../services/ratingService.js', () => ({
      createRating: jest.fn(),
      getUnratedBookings: jest.fn(),
      getInstructorRatings: jest.fn(),
      getInstructorAverageRating: jest.fn(),
      getInstructorRatingStats: jest.fn(),
      hasRatingForBooking: jest.fn(),
      getInstructorRatingOverview: jest.fn(),
      queueRatingReminder: jest.fn()
    }));

    ({ default: app } = await import('../server.js'));
    ({ pool } = await import('../db.js'));
    ratingService = await import('../services/ratingService.js');

    adminToken = createToken({ role: 'admin' });
    managerToken = createToken({ role: 'manager' });
    instructorToken = createToken({ role: 'instructor' });
  });

  afterAll(async () => {
    // pool.end() is handled by --forceExit flag; calling it here causes hangs
    // when other tests have active connections on the same shared pool
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /overview requires authentication and elevated role', async () => {
    const unauthenticated = await request(app).get(`${base}/overview`);
    expect(unauthenticated.status).toBe(401);

    const forbidden = await request(app)
      .get(`${base}/overview`)
      .set('Authorization', `Bearer ${instructorToken}`);
    expect([401, 403]).toContain(forbidden.status);
  });

  test('GET /overview returns instructor data for admin', async () => {
    const mockRows = [
      {
        instructorId: 'inst-1',
        instructorName: 'Alice',
        instructorAvatar: null,
        averageRating: 4.6,
        totalRatings: 12,
        lastRatingAt: '2025-09-10T10:00:00.000Z',
        distribution: { 5: 8, 4: 3, 3: 1, 2: 0, 1: 0 },
        breakdown: {
          lesson: { count: 10, average: 4.7 },
          rental: { count: 2, average: 4.2 },
          accommodation: { count: 0, average: 0 }
        }
      }
    ];

    const spy = jest.spyOn(ratingService, 'getInstructorRatingOverview').mockResolvedValueOnce(mockRows);

    const response = await request(app)
      .get(`${base}/overview?limit=5&serviceType=lesson&sortBy=count`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ instructors: mockRows });
    expect(spy).toHaveBeenCalledWith({
      serviceType: 'lesson',
      limit: 5,
      offset: undefined,
      sortBy: 'count'
    });
  });

  test('GET /overview accepts manager role', async () => {
    jest.spyOn(ratingService, 'getInstructorRatingOverview').mockResolvedValueOnce([]);

    const response = await request(app)
      .get(`${base}/overview`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ instructors: [] });
  });
});
