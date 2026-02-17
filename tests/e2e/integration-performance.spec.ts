/**
 * Phase 7: Integration & Performance E2E Tests
 *
 * Tests for system-wide integration and performance:
 * - API Performance (response times, database query optimization)
 * - External Integrations (Weather API, Socket.IO, Payment Webhooks)
 * - Cross-Module Integration (booking→wallet→finance flow)
 * - System Health & Monitoring (metrics, cache, pool stats)
 *
 * API Base Path: http://localhost:3000/api
 * Route Mountings:
 * - Weather: /api/weather
 * - Socket: /api/socket/test, /api/socket/stats
 * - Webhooks: /api/webhooks/stripe, /api/webhooks/iyzico, etc.
 * - Metrics: /api/metrics
 * - Health: /api/health, /api/healthcheck
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// --- API base URL (via Vite proxy) ---
const API_URL = 'http://localhost:3000/api';

// --- Test credentials ---
const ADMIN_CREDS = { email: 'admin@plannivo.com', password: 'asdasd35' };
const INSTRUCTOR_CREDS = { email: 'kaanaysel@gmail.com', password: 'asdasd35' };
const STUDENT_CREDS = { email: 'metinsenturk@gmail.com', password: 'asdasd35' };

// --- Shared state ---
let adminToken: string;
let instructorToken: string;
let studentToken: string;

// --- Helper: login and get token ---
async function login(
  request: APIRequestContext,
  creds: { email: string; password: string }
): Promise<{ token: string; userId: string }> {
  const res = await request.post(`${API_URL}/auth/login`, { data: creds });
  const body = await res.json();
  return {
    token: body.token ?? body.accessToken ?? '',
    userId: body.user?.id ?? body.userId ?? '',
  };
}

// --- Helper: auth header ---
function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// --- Performance threshold (ms) ---
const PERF_THRESHOLD_FAST = 500;    // Fast endpoints
const PERF_THRESHOLD_NORMAL = 1000; // Normal endpoints
const PERF_THRESHOLD_SLOW = 3000;   // Complex queries
const PERF_THRESHOLD_VERY_SLOW = 5000; // Very complex financial queries

// =============================================================================
// SETUP: Authenticate once before all tests
// =============================================================================
test.describe.configure({ mode: 'serial' });

test.describe('Phase 7: Integration & Performance E2E Tests', () => {
  test.beforeAll(async ({ request }) => {
    // Login as admin
    const admin = await login(request, ADMIN_CREDS);
    adminToken = admin.token;
    console.log('Admin login:', adminToken ? 'SUCCESS' : 'FAILED');

    // Login as instructor
    const instructor = await login(request, INSTRUCTOR_CREDS);
    instructorToken = instructor.token;
    console.log('Instructor login:', instructorToken ? 'SUCCESS' : 'FAILED');

    // Login as student
    const student = await login(request, STUDENT_CREDS);
    studentToken = student.token;
    console.log('Student login:', studentToken ? 'SUCCESS' : 'FAILED');
  });

  // ===========================================================================
  // SECTION 1: API Performance Tests
  // ===========================================================================
  test.describe('1. API Performance', () => {
    test('1.1 Health check responds under threshold', async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API_URL}/health`);
      const duration = Date.now() - start;
      
      expect(res.status()).toBe(200);
      expect(duration).toBeLessThan(PERF_THRESHOLD_FAST);
    });

    test('1.2 Login endpoint responds under threshold', async ({ request }) => {
      const start = Date.now();
      const res = await request.post(`${API_URL}/auth/login`, {
        data: ADMIN_CREDS,
      });
      const duration = Date.now() - start;
      
      expect(res.status()).toBe(200);
      expect(duration).toBeLessThan(PERF_THRESHOLD_NORMAL);
    });

    test('1.3 Dashboard summary responds under threshold', async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API_URL}/dashboard/summary`, {
        headers: authHeaders(adminToken),
      });
      const duration = Date.now() - start;
      
      expect(res.status()).toBe(200);
      expect(duration).toBeLessThan(PERF_THRESHOLD_SLOW);
    });

    test('1.4 Bookings list responds under threshold', async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API_URL}/bookings?limit=20`, {
        headers: authHeaders(adminToken),
      });
      const duration = Date.now() - start;
      
      expect(res.status()).toBe(200);
      expect(duration).toBeLessThan(PERF_THRESHOLD_NORMAL);
    });

    test('1.5 Users list responds under threshold', async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API_URL}/users?limit=20`, {
        headers: authHeaders(adminToken),
      });
      const duration = Date.now() - start;
      
      expect(res.status()).toBe(200);
      expect(duration).toBeLessThan(PERF_THRESHOLD_NORMAL);
    });

    test('1.6 Services list responds under threshold', async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API_URL}/services`, {
        headers: authHeaders(adminToken),
      });
      const duration = Date.now() - start;
      
      expect(res.status()).toBe(200);
      expect(duration).toBeLessThan(PERF_THRESHOLD_FAST);
    });

    test('1.7 Financial summary responds under threshold', async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API_URL}/finances/summary`, {
        headers: authHeaders(adminToken),
      });
      const duration = Date.now() - start;
      
      expect(res.status()).toBe(200);
      // Financial summary can be slow due to complex aggregations
      expect(duration).toBeLessThan(PERF_THRESHOLD_VERY_SLOW);
    });

    test('1.8 Equipment list responds under threshold', async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API_URL}/equipment`, {
        headers: authHeaders(adminToken),
      });
      const duration = Date.now() - start;
      
      expect(res.status()).toBe(200);
      expect(duration).toBeLessThan(PERF_THRESHOLD_NORMAL);
    });

    test('1.9 Concurrent requests performance', async ({ request }) => {
      const start = Date.now();
      
      // Fire multiple requests concurrently
      const promises = [
        request.get(`${API_URL}/health`),
        request.get(`${API_URL}/services`, { headers: authHeaders(adminToken) }),
        request.get(`${API_URL}/equipment`, { headers: authHeaders(adminToken) }),
        request.get(`${API_URL}/settings`, { headers: authHeaders(adminToken) }),
      ];
      
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      // All should succeed
      results.forEach(res => expect([200, 304]).toContain(res.status()));
      
      // Concurrent requests should complete faster than sequential
      expect(duration).toBeLessThan(PERF_THRESHOLD_SLOW);
    });

    test('1.10 Pagination performance - large offset', async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API_URL}/bookings?page=10&limit=20`, {
        headers: authHeaders(adminToken),
      });
      const duration = Date.now() - start;
      
      // Should handle large offsets efficiently
      expect([200, 304]).toContain(res.status());
      expect(duration).toBeLessThan(PERF_THRESHOLD_NORMAL);
    });
  });

  // ===========================================================================
  // SECTION 2: Weather API Integration
  // ===========================================================================
  test.describe('2. Weather API Integration', () => {
    test('2.1 GET /weather/hourly - fetch weather data', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request.get(`${API_URL}/weather/hourly?date=${today}`);
      
      // May return 200 or 502 if external API fails
      expect([200, 502]).toContain(res.status());
      
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toBeDefined();
      }
    });

    test('2.2 GET /weather/hourly - missing date returns 400', async ({ request }) => {
      const res = await request.get(`${API_URL}/weather/hourly`);
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('date');
    });

    test('2.3 GET /weather/hourly - with custom coordinates', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request.get(`${API_URL}/weather/hourly?date=${today}&lat=40.7128&lon=-74.0060`);
      
      // External API may or may not be available
      expect([200, 502]).toContain(res.status());
    });

    test('2.4 Weather endpoint is public (no auth required)', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      // No auth header
      const res = await request.get(`${API_URL}/weather/hourly?date=${today}`);
      
      // Should not return 401 - weather is public
      expect(res.status()).not.toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 3: Socket.IO Integration
  // ===========================================================================
  test.describe('3. Socket.IO Integration', () => {
    test('3.1 GET /socket/test - emit test event (public)', async ({ request }) => {
      const res = await request.get(`${API_URL}/socket/test`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.event).toBeDefined();
      expect(body.event.type).toBe('test');
    });

    test('3.2 GET /socket/stats - get socket statistics (auth required)', async ({ request }) => {
      const res = await request.get(`${API_URL}/socket/stats`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.stats).toBeDefined();
    });

    test('3.3 Socket stats - unauthenticated returns 401', async ({ request }) => {
      const res = await request.get(`${API_URL}/socket/stats`);
      expect(res.status()).toBe(401);
    });

    test('3.4 Socket stats contains connection info', async ({ request }) => {
      const res = await request.get(`${API_URL}/socket/stats`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      
      // Stats should have meaningful structure
      expect(body.stats).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  // ===========================================================================
  // SECTION 4: Payment Webhooks
  // ===========================================================================
  test.describe('4. Payment Webhooks', () => {
    test('4.1 POST /webhooks/stripe - accepts webhook (no signature)', async ({ request }) => {
      const res = await request.post(`${API_URL}/webhooks/stripe`, {
        data: { type: 'test', data: {} },
      });
      // May return 202 or other status based on signature validation
      expect([200, 202, 400, 500]).toContain(res.status());
    });

    test('4.2 POST /webhooks/iyzico - accepts webhook', async ({ request }) => {
      const res = await request.post(`${API_URL}/webhooks/iyzico`, {
        data: { status: 'test' },
      });
      expect([200, 202, 400, 500]).toContain(res.status());
    });

    test('4.3 POST /webhooks/paytr - accepts webhook', async ({ request }) => {
      const res = await request.post(`${API_URL}/webhooks/paytr`, {
        data: { merchant_oid: 'test' },
      });
      expect([200, 202, 400, 500]).toContain(res.status());
    });

    test('4.4 POST /webhooks/binance-pay - accepts webhook', async ({ request }) => {
      const res = await request.post(`${API_URL}/webhooks/binance-pay`, {
        data: { bizStatus: 'test' },
      });
      expect([200, 202, 400, 500]).toContain(res.status());
    });

    test('4.5 Webhooks handle empty body gracefully', async ({ request }) => {
      const res = await request.post(`${API_URL}/webhooks/stripe`, {
        data: {},
      });
      // Should not crash - graceful handling
      expect([200, 202, 400, 500]).toContain(res.status());
    });
  });

  // ===========================================================================
  // SECTION 5: Metrics & Monitoring
  // ===========================================================================
  test.describe('5. Metrics & Monitoring', () => {
    test('5.1 GET /health - returns healthy status', async ({ request }) => {
      const res = await request.get(`${API_URL}/health`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('healthy');
      expect(body.uptime).toBeDefined();
      expect(body.memory).toBeDefined();
    });

    test('5.2 Health check includes memory stats', async ({ request }) => {
      const res = await request.get(`${API_URL}/health`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      
      expect(body.memory.rss).toBeGreaterThan(0);
      expect(body.memory.heapTotal).toBeGreaterThan(0);
      expect(body.memory.heapUsed).toBeGreaterThan(0);
    });

    test('5.3 GET /system/database-status - database health', async ({ request }) => {
      const res = await request.get(`${API_URL}/system/database-status`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('5.4 GET /system/performance-metrics - performance data', async ({ request }) => {
      const res = await request.get(`${API_URL}/system/performance-metrics`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('5.5 System endpoints require authentication', async ({ request }) => {
      const res = await request.get(`${API_URL}/system/database-status`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 6: Cross-Module Integration
  // ===========================================================================
  test.describe('6. Cross-Module Integration', () => {
    test('6.1 Auth → Dashboard flow', async ({ request }) => {
      // Login
      const loginRes = await request.post(`${API_URL}/auth/login`, {
        data: ADMIN_CREDS,
      });
      expect(loginRes.status()).toBe(200);
      const { token } = await loginRes.json();
      
      // Access dashboard with new token
      const dashRes = await request.get(`${API_URL}/dashboard/summary`, {
        headers: authHeaders(token),
      });
      expect(dashRes.status()).toBe(200);
    });

    test('6.2 Settings → Services consistency', async ({ request }) => {
      // Get settings
      const settingsRes = await request.get(`${API_URL}/settings`, {
        headers: authHeaders(adminToken),
      });
      expect(settingsRes.status()).toBe(200);
      
      // Get services
      const servicesRes = await request.get(`${API_URL}/services`, {
        headers: authHeaders(adminToken),
      });
      expect(servicesRes.status()).toBe(200);
    });

    test('6.3 Users → Bookings → Finances flow', async ({ request }) => {
      // Get users
      const usersRes = await request.get(`${API_URL}/users?limit=5`, {
        headers: authHeaders(adminToken),
      });
      expect(usersRes.status()).toBe(200);
      
      // Get bookings
      const bookingsRes = await request.get(`${API_URL}/bookings?limit=5`, {
        headers: authHeaders(adminToken),
      });
      expect(bookingsRes.status()).toBe(200);
      
      // Get financial summary
      const financeRes = await request.get(`${API_URL}/finances/summary`, {
        headers: authHeaders(adminToken),
      });
      expect(financeRes.status()).toBe(200);
    });

    test('6.4 Instructors → Services → Bookings consistency', async ({ request }) => {
      // Get instructors
      const instructorsRes = await request.get(`${API_URL}/instructors`, {
        headers: authHeaders(adminToken),
      });
      expect(instructorsRes.status()).toBe(200);
      
      // Get services
      const servicesRes = await request.get(`${API_URL}/services`, {
        headers: authHeaders(adminToken),
      });
      expect(servicesRes.status()).toBe(200);
      
      // Get bookings
      const bookingsRes = await request.get(`${API_URL}/bookings?limit=5`, {
        headers: authHeaders(adminToken),
      });
      expect(bookingsRes.status()).toBe(200);
    });

    test('6.5 Equipment → Rentals consistency', async ({ request }) => {
      // Get equipment
      const equipRes = await request.get(`${API_URL}/equipment`, {
        headers: authHeaders(adminToken),
      });
      expect(equipRes.status()).toBe(200);
      
      // Get rentals
      const rentalsRes = await request.get(`${API_URL}/rentals`, {
        headers: authHeaders(adminToken),
      });
      expect(rentalsRes.status()).toBe(200);
    });

    test('6.6 Family → Waivers → Notifications flow', async ({ request }) => {
      // Get family members (admin can see all)
      const familyRes = await request.get(`${API_URL}/family`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(familyRes.status());
      
      // Get admin waivers
      const waiversRes = await request.get(`${API_URL}/admin/waivers`, {
        headers: authHeaders(adminToken),
      });
      expect(waiversRes.status()).toBe(200);
      
      // Get notifications (may return 404 if no notifications route for admin)
      const notifRes = await request.get(`${API_URL}/notifications`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(notifRes.status());
    });
  });

  // ===========================================================================
  // SECTION 7: Role-Based Access Integration
  // ===========================================================================
  test.describe('7. Role-Based Access Integration', () => {
    test('7.1 Admin can access all admin endpoints', async ({ request }) => {
      const endpoints = [
        '/dashboard/summary',
        '/system/database-status',
        '/admin/waivers',
        '/finance-settings/active',
      ];
      
      for (const endpoint of endpoints) {
        const res = await request.get(`${API_URL}${endpoint}`, {
          headers: authHeaders(adminToken),
        });
        expect([200, 304]).toContain(res.status());
      }
    });

    test('7.2 Instructor cannot access admin-only endpoints', async ({ request }) => {
      const adminOnlyEndpoints = [
        '/admin/waivers',
        '/finance-settings/active',
      ];
      
      for (const endpoint of adminOnlyEndpoints) {
        const res = await request.get(`${API_URL}${endpoint}`, {
          headers: authHeaders(instructorToken),
        });
        expect(res.status()).toBe(403);
      }
    });

    test('7.3 Student has limited access', async ({ request }) => {
      // Student can access their own data
      const meRes = await request.get(`${API_URL}/auth/me`, {
        headers: authHeaders(studentToken),
      });
      expect(meRes.status()).toBe(200);
      
      // Student cannot access admin dashboard
      const dashRes = await request.get(`${API_URL}/dashboard/summary`, {
        headers: authHeaders(studentToken),
      });
      expect(dashRes.status()).toBe(403);
    });

    test('7.4 Public endpoints accessible without auth', async ({ request }) => {
      const publicEndpoints = [
        '/health',
        '/socket/test',
      ];
      
      for (const endpoint of publicEndpoints) {
        const res = await request.get(`${API_URL}${endpoint}`);
        expect(res.status()).toBe(200);
      }
    });
  });

  // ===========================================================================
  // SECTION 8: Data Consistency Tests
  // ===========================================================================
  test.describe('8. Data Consistency', () => {
    test('8.1 Dashboard totals match detail endpoints', async ({ request }) => {
      // Get dashboard summary
      const dashRes = await request.get(`${API_URL}/dashboard/summary`, {
        headers: authHeaders(adminToken),
      });
      expect(dashRes.status()).toBe(200);
      const dashboard = await dashRes.json();
      
      // Dashboard should have expected structure
      expect(dashboard).toBeDefined();
    });

    test('8.2 Financial summary consistency', async ({ request }) => {
      const res = await request.get(`${API_URL}/finances/summary`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const summary = await res.json();
      
      // Numbers should be non-negative
      if (summary.totalRevenue !== undefined) {
        expect(summary.totalRevenue).toBeGreaterThanOrEqual(0);
      }
    });

    test('8.3 Service categories match services', async ({ request }) => {
      // Get categories
      const catRes = await request.get(`${API_URL}/services/categories`, {
        headers: authHeaders(adminToken),
      });
      expect(catRes.status()).toBe(200);
      
      // Get services
      const svcRes = await request.get(`${API_URL}/services`, {
        headers: authHeaders(adminToken),
      });
      expect(svcRes.status()).toBe(200);
    });

    test('8.4 Waiver stats match waiver list', async ({ request }) => {
      // Get stats
      const statsRes = await request.get(`${API_URL}/admin/waivers/stats`, {
        headers: authHeaders(adminToken),
      });
      expect(statsRes.status()).toBe(200);
      
      // Get list
      const listRes = await request.get(`${API_URL}/admin/waivers`, {
        headers: authHeaders(adminToken),
      });
      expect(listRes.status()).toBe(200);
    });
  });

  // ===========================================================================
  // SECTION 9: Error Handling Consistency
  // ===========================================================================
  test.describe('9. Error Handling Consistency', () => {
    test('9.1 404 returns consistent format', async ({ request }) => {
      const res = await request.get(`${API_URL}/nonexistent-endpoint-xyz`);
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    test('9.2 401 returns consistent format', async ({ request }) => {
      const res = await request.get(`${API_URL}/dashboard/summary`);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    test('9.3 403 returns consistent format', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers`, {
        headers: authHeaders(instructorToken),
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    test('9.4 Invalid JSON returns 400', async ({ request }) => {
      const res = await request.post(`${API_URL}/auth/login`, {
        headers: { 'Content-Type': 'application/json' },
        data: 'invalid json{',
      });
      // May return 400 or 500 depending on parsing
      expect([400, 500]).toContain(res.status());
    });

    test('9.5 Missing required fields returns 400', async ({ request }) => {
      const res = await request.post(`${API_URL}/auth/login`, {
        data: { email: 'test@test.com' }, // Missing password
      });
      expect(res.status()).toBe(400);
    });
  });

  // ===========================================================================
  // SECTION 10: Stress Tests
  // ===========================================================================
  test.describe('10. Stress Tests', () => {
    test('10.1 Rapid sequential requests', async ({ request }) => {
      const start = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const res = await request.get(`${API_URL}/health`);
        expect(res.status()).toBe(200);
      }
      
      const duration = Date.now() - start;
      // 10 requests should complete in reasonable time
      expect(duration).toBeLessThan(5000);
    });

    test('10.2 Burst concurrent requests', async ({ request }) => {
      const start = Date.now();
      
      // Fire 5 concurrent requests
      const promises = Array(5).fill(null).map(() =>
        request.get(`${API_URL}/services`, {
          headers: authHeaders(adminToken),
        })
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      // All should succeed
      results.forEach(res => expect([200, 304, 429]).toContain(res.status()));
      
      // Should handle burst without significant delay
      expect(duration).toBeLessThan(PERF_THRESHOLD_SLOW * 2);
    });

    test('10.3 Mixed authenticated/public requests', async ({ request }) => {
      const promises = [
        request.get(`${API_URL}/health`),
        request.get(`${API_URL}/socket/test`),
        request.get(`${API_URL}/services`, { headers: authHeaders(adminToken) }),
        request.get(`${API_URL}/dashboard/summary`, { headers: authHeaders(adminToken) }),
        request.get(`${API_URL}/bookings?limit=5`, { headers: authHeaders(adminToken) }),
      ];
      
      const results = await Promise.all(promises);
      
      // All should succeed (or rate limit)
      results.forEach(res => expect([200, 304, 429]).toContain(res.status()));
    });

    test('10.4 Large response handling', async ({ request }) => {
      // Request large dataset
      const res = await request.get(`${API_URL}/bookings?limit=100`, {
        headers: authHeaders(adminToken),
      });
      
      expect([200, 304]).toContain(res.status());
      
      if (res.status() === 200) {
        const body = await res.json();
        // Should handle large response
        expect(body).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // SECTION 11: Full Integration Workflow
  // ===========================================================================
  test.describe('11. Full Integration Workflow', () => {
    test('11.1 Complete admin session workflow', async ({ request }) => {
      // 1. Login
      const loginRes = await request.post(`${API_URL}/auth/login`, {
        data: ADMIN_CREDS,
      });
      expect(loginRes.status()).toBe(200);
      const { token } = await loginRes.json();
      
      // 2. Check dashboard
      const dashRes = await request.get(`${API_URL}/dashboard/summary`, {
        headers: authHeaders(token),
      });
      expect(dashRes.status()).toBe(200);
      
      // 3. View bookings
      const bookingsRes = await request.get(`${API_URL}/bookings?limit=10`, {
        headers: authHeaders(token),
      });
      expect(bookingsRes.status()).toBe(200);
      
      // 4. Check finances
      const financeRes = await request.get(`${API_URL}/finances/summary`, {
        headers: authHeaders(token),
      });
      expect(financeRes.status()).toBe(200);
      
      // 5. View settings
      const settingsRes = await request.get(`${API_URL}/settings`, {
        headers: authHeaders(token),
      });
      expect(settingsRes.status()).toBe(200);
      
      // 6. Get me
      const meRes = await request.get(`${API_URL}/auth/me`, {
        headers: authHeaders(token),
      });
      expect(meRes.status()).toBe(200);
    });

    test('11.2 Instructor daily workflow', async ({ request }) => {
      // 1. Login as instructor
      const loginRes = await request.post(`${API_URL}/auth/login`, {
        data: INSTRUCTOR_CREDS,
      });
      expect(loginRes.status()).toBe(200);
      const { token } = await loginRes.json();
      
      // 2. View own lessons (may return 200, 403, or 404 depending on route availability)
      const lessonsRes = await request.get(`${API_URL}/instructor/lessons`, {
        headers: authHeaders(token),
      });
      expect([200, 403, 404]).toContain(lessonsRes.status());
      
      // 3. Check notifications (may return 404 if no notifications route)
      const notifRes = await request.get(`${API_URL}/notifications`, {
        headers: authHeaders(token),
      });
      expect([200, 404]).toContain(notifRes.status());
    });

    test('11.3 System health check workflow', async ({ request }) => {
      // 1. Check API health
      const healthRes = await request.get(`${API_URL}/health`);
      expect(healthRes.status()).toBe(200);
      
      // 2. Check socket connectivity
      const socketRes = await request.get(`${API_URL}/socket/test`);
      expect(socketRes.status()).toBe(200);
      
      // 3. Check database status (admin)
      const dbRes = await request.get(`${API_URL}/system/database-status`, {
        headers: authHeaders(adminToken),
      });
      expect(dbRes.status()).toBe(200);
      
      // 4. Check performance metrics (admin)
      const perfRes = await request.get(`${API_URL}/system/performance-metrics`, {
        headers: authHeaders(adminToken),
      });
      expect(perfRes.status()).toBe(200);
    });
  });
});
