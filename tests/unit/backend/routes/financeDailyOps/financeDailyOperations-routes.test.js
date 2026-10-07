import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

let app;
let dailyOperationsService;

const createToken = (overrides = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  const payload = {
    id: overrides.id || '11111111-1111-1111-1111-111111111111',
    email: overrides.email || 'user@example.com',
    role: overrides.role || 'admin'
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

describe('Finance Daily Operations Routes', () => {
  // Router is mounted at /api/finances/daily-operations (backend/server.js).
  const base = '/api/finances/daily-operations';
  let adminToken;
  let managerToken;
  let studentToken;

  beforeAll(async () => {
    // Jest ESM: mock path is relative to this file (5 levels up to repo root),
    // must be awaited before importing server.js, and must use jest.fn (not vi.fn).
    // ESM namespaces are read-only, so tests drive the mocked fn directly
    // instead of jest.spyOn(namespace, ...).
    await jest.unstable_mockModule('../../../../../backend/services/dailyOperationsService.js', () => ({
      getDailyOperations: jest.fn(),
      fetchDailyPayments: jest.fn(),
      fetchRentalsCreated: jest.fn(),
      fetchRentalsActive: jest.fn()
    }));

    ({ default: app } = await import('../../../../../backend/server.js'));
    dailyOperationsService = await import('../../../../../backend/services/dailyOperationsService.js');

    adminToken = createToken({ role: 'admin' });
    managerToken = createToken({ role: 'manager' });
    studentToken = createToken({ role: 'student' });
  });

  afterAll(async () => {
    // DB pool cleanup handled by --forceExit
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET / - Fetch daily operations', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/`);
      expect(response.status).toBe(401);
    });

    test('requires admin or manager role', async () => {
      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect([401, 403]).toContain(response.status);
    });

    test('admin can fetch daily operations with default date', async () => {
      // Service return value must be plain JSON (an asymmetric matcher here
      // would be serialized into the response body).
      const mockData = {
        date: '2026-10-07',
        lessons: 5,
        rentals: 3,
        revenue: 1250.50,
        pendingPayments: 450
      };

      dailyOperationsService.getDailyOperations.mockResolvedValueOnce(mockData);

      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockData);
      expect(dailyOperationsService.getDailyOperations).toHaveBeenCalledWith({
        date: expect.any(String),
        rentalsScope: 'both'
      });
    });

    test('manager can fetch daily operations with custom date', async () => {
      const mockData = {
        date: '2026-04-03',
        lessons: 3,
        rentals: 2,
        revenue: 800,
        pendingPayments: 200
      };

      dailyOperationsService.getDailyOperations.mockResolvedValueOnce(mockData);

      const response = await request(app)
        .get(`${base}/?date=2026-04-03&rentalsScope=owned`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockData);
      expect(dailyOperationsService.getDailyOperations).toHaveBeenCalledWith({
        date: '2026-04-03',
        rentalsScope: 'owned'
      });
    });

    test('handles service errors gracefully', async () => {
      dailyOperationsService.getDailyOperations.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    test('accepts rentalsScope query parameter', async () => {
      const mockData = { rentals: 5 };
      dailyOperationsService.getDailyOperations.mockResolvedValueOnce(mockData);

      await request(app)
        .get(`${base}/?rentalsScope=partner`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(dailyOperationsService.getDailyOperations).toHaveBeenCalledWith({
        date: expect.any(String),
        rentalsScope: 'partner'
      });
    });
  });
});
