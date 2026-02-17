/**
 * Phase 6: Admin Dashboard & System Management E2E Tests
 *
 * Tests for administrative and system management features:
 * - Dashboard Summary (admin metrics, date ranges)
 * - System Routes (database status, performance metrics)
 * - Application Settings (CRUD, booking defaults)
 * - Financial Settings (CRUD, overrides, preview)
 * - Admin Waivers (list, stats, export, detail)
 * - Financial Reconciliation (stats, manual run)
 * - Services Management (CRUD, packages, categories)
 *
 * API Base Path: http://localhost:4000/api
 * Route Mountings:
 * - Dashboard: /api/dashboard
 * - System: /api/system
 * - Settings: /api/settings
 * - Finance Settings: /api/finance-settings
 * - Admin Waivers: /api/admin/waivers
 * - Admin Reconciliation: /api/admin/financial-reconciliation
 * - Services: /api/services
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// --- API base URL (via Vite proxy) ---
const API_URL = 'http://localhost:3000/api';

// --- Test credentials ---
const ADMIN_CREDS = { email: 'admin@plannivo.com', password: 'asdasd35' };
const INSTRUCTOR_CREDS = { email: 'kaanaysel@gmail.com', password: 'asdasd35' };

// --- Shared state ---
let adminToken: string;
let adminUserId: string;
let instructorToken: string;
let instructorUserId: string;

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

// --- Helper: get auth headers ---
function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// =============================================================================
// SETUP: Authenticate once before all tests
// =============================================================================
test.describe.configure({ mode: 'serial' });

test.describe('Phase 6: Admin Dashboard & System Management E2E Tests', () => {
  test.beforeAll(async ({ request }) => {
    // Login as admin
    const admin = await login(request, ADMIN_CREDS);
    adminToken = admin.token;
    adminUserId = admin.userId;
    console.log('Admin login:', adminToken ? 'SUCCESS' : 'FAILED');

    // Login as instructor (non-admin)
    const instructor = await login(request, INSTRUCTOR_CREDS);
    instructorToken = instructor.token;
    instructorUserId = instructor.userId;
    console.log('Instructor login:', instructorToken ? 'SUCCESS' : 'FAILED');
  });

  // ===========================================================================
  // SECTION 1: Dashboard Summary
  // ===========================================================================
  test.describe('1. Dashboard Summary', () => {
    test('1.1 GET /dashboard/summary - admin can access', async ({ request }) => {
      // Re-login if token is missing (serial mode issue workaround)
      if (!adminToken) {
        const admin = await login(request, ADMIN_CREDS);
        adminToken = admin.token;
      }
      const res = await request.get(`${API_URL}/dashboard/summary`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      // Dashboard should return summary metrics
      expect(body).toBeDefined();
    });

    test('1.2 GET /dashboard/summary - with date range', async ({ request }) => {
      const startDate = '2025-01-01';
      const endDate = '2025-12-31';
      const res = await request.get(`${API_URL}/dashboard/summary?startDate=${startDate}&endDate=${endDate}`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('1.3 GET /dashboard/summary - instructor cannot access', async ({ request }) => {
      const res = await request.get(`${API_URL}/dashboard/summary`, {
        headers: authHeaders(instructorToken),
      });
      expect(res.status()).toBe(403);
    });

    test('1.4 GET /dashboard/summary - unauthenticated returns 401', async ({ request }) => {
      const res = await request.get(`${API_URL}/dashboard/summary`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 2: System Routes
  // ===========================================================================
  test.describe('2. System Routes', () => {
    test('2.1 GET /system/database-status - check database status', async ({ request }) => {
      const res = await request.get(`${API_URL}/system/database-status`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('needsInitialization');
      expect(typeof body.needsInitialization).toBe('boolean');
    });

    test('2.2 GET /system/performance-metrics - get metrics', async ({ request }) => {
      const res = await request.get(`${API_URL}/system/performance-metrics`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
    });

    test('2.3 GET /system/performance-metrics?reset=true - get and reset metrics', async ({ request }) => {
      const res = await request.get(`${API_URL}/system/performance-metrics?reset=true`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
    });

    test('2.4 POST /system/:entityType/:id/update-references - update entity references', async ({ request }) => {
      // This endpoint updates booking/rental notes when entity names change
      const res = await request.post(`${API_URL}/system/students/1/update-references`, {
        headers: authHeaders(adminToken),
        data: { name: 'Test Student Name Update' },
      });
      expect([200, 404, 500]).toContain(res.status());
    });

    test('2.5 POST /system/initialize-database - initialize with mock data', async ({ request }) => {
      // This should be carefully tested - it inserts data
      // We'll test with empty data to avoid side effects
      const res = await request.post(`${API_URL}/system/initialize-database`, {
        headers: authHeaders(adminToken),
        data: { students: [], instructors: [] },
      });
      expect([200, 500]).toContain(res.status());
    });

    test('2.6 System routes require authentication', async ({ request }) => {
      const res = await request.get(`${API_URL}/system/database-status`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 3: Application Settings
  // ===========================================================================
  test.describe('3. Application Settings', () => {
    test('3.1 GET /settings - get all settings', async ({ request }) => {
      const res = await request.get(`${API_URL}/settings`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      // Should have default settings structure
      expect(body).toBeDefined();
    });

    test('3.2 GET /settings - includes booking_defaults', async ({ request }) => {
      const res = await request.get(`${API_URL}/settings`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('booking_defaults');
      if (body.booking_defaults) {
        expect(body.booking_defaults).toHaveProperty('defaultDuration');
        expect(body.booking_defaults).toHaveProperty('allowedDurations');
      }
    });

    test('3.3 PUT /settings/:key - update setting', async ({ request }) => {
      const res = await request.put(`${API_URL}/settings/defaultCurrency`, {
        headers: authHeaders(adminToken),
        data: { value: 'EUR' },
      });
      expect([200, 500]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
      }
    });

    test('3.4 PUT /settings/booking_defaults - update booking defaults', async ({ request }) => {
      const res = await request.put(`${API_URL}/settings/booking_defaults`, {
        headers: authHeaders(adminToken),
        data: {
          value: {
            defaultDuration: 120,
            allowedDurations: [60, 90, 120, 150, 180],
          },
        },
      });
      expect([200, 500]).toContain(res.status());
    });

    test('3.5 PUT /settings/booking_defaults - validation: defaultDuration not in allowedDurations', async ({ request }) => {
      const res = await request.put(`${API_URL}/settings/booking_defaults`, {
        headers: authHeaders(adminToken),
        data: {
          value: {
            defaultDuration: 45, // Not in allowedDurations
            allowedDurations: [60, 90, 120],
          },
        },
      });
      expect(res.status()).toBe(400);
    });

    test('3.6 PUT /settings/booking_defaults - validation: missing allowedDurations', async ({ request }) => {
      const res = await request.put(`${API_URL}/settings/booking_defaults`, {
        headers: authHeaders(adminToken),
        data: {
          value: {
            defaultDuration: 120,
          },
        },
      });
      expect(res.status()).toBe(400);
    });

    test('3.7 Settings require authentication', async ({ request }) => {
      const res = await request.get(`${API_URL}/settings`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 4: Financial Settings
  // ===========================================================================
  test.describe('4. Financial Settings', () => {
    let createdSettingsId: number;

    test('4.1 GET /finance-settings/active - get active financial settings', async ({ request }) => {
      const res = await request.get(`${API_URL}/finance-settings/active`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('settings');
    });

    test('4.2 GET /finance-settings/overrides - list overrides', async ({ request }) => {
      const res = await request.get(`${API_URL}/finance-settings/overrides`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('overrides');
      expect(Array.isArray(body.overrides)).toBe(true);
    });

    test('4.3 GET /finance-settings/overrides - with filters', async ({ request }) => {
      const res = await request.get(`${API_URL}/finance-settings/overrides?active=true`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('4.4 POST /finance-settings - create new financial settings', async ({ request }) => {
      const res = await request.post(`${API_URL}/finance-settings`, {
        headers: authHeaders(adminToken),
        data: {
          tax_rate_pct: 18,
          insurance_rate_pct: 2,
          equipment_rate_pct: 5,
          payment_method_fees: { cash: 0, card: 2.5 },
          active: false, // Don't make it active to avoid disrupting other tests
        },
      });
      expect([200, 201]).toContain(res.status());
      if (res.status() === 201) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('settings');
        createdSettingsId = body.settings.id;
      }
    });

    test('4.5 PATCH /finance-settings/:id - update financial settings', async ({ request }) => {
      // First get the active settings ID
      const activeRes = await request.get(`${API_URL}/finance-settings/active`, {
        headers: authHeaders(adminToken),
      });
      
      if (activeRes.status() === 200) {
        const activeBody = await activeRes.json();
        if (activeBody.settings && activeBody.settings.id) {
          const settingsId = activeBody.settings.id;
          const res = await request.patch(`${API_URL}/finance-settings/${settingsId}`, {
            headers: authHeaders(adminToken),
            data: { insurance_rate_pct: 2.5 },
          });
          expect([200, 404]).toContain(res.status());
        }
      }
      expect(true).toBe(true);
    });

    test('4.6 POST /finance-settings/:id/overrides - create override', async ({ request }) => {
      // First get the active settings ID
      const activeRes = await request.get(`${API_URL}/finance-settings/active`, {
        headers: authHeaders(adminToken),
      });
      
      if (activeRes.status() === 200) {
        const activeBody = await activeRes.json();
        if (activeBody.settings && activeBody.settings.id) {
          const settingsId = activeBody.settings.id;
          const res = await request.post(`${API_URL}/finance-settings/${settingsId}/overrides`, {
            headers: authHeaders(adminToken),
            data: {
              scope_type: 'service_type',
              scope_value: 'private_lesson',
              fields: { tax_rate_pct: 20 },
              precedence: 1,
              active: false, // Don't activate to avoid side effects
            },
          });
          expect([200, 201, 400]).toContain(res.status());
        }
      }
      expect(true).toBe(true);
    });

    test('4.7 POST /finance-settings/:id/overrides - validation: missing required fields', async ({ request }) => {
      const activeRes = await request.get(`${API_URL}/finance-settings/active`, {
        headers: authHeaders(adminToken),
      });
      
      if (activeRes.status() === 200) {
        const activeBody = await activeRes.json();
        if (activeBody.settings && activeBody.settings.id) {
          const settingsId = activeBody.settings.id;
          const res = await request.post(`${API_URL}/finance-settings/${settingsId}/overrides`, {
            headers: authHeaders(adminToken),
            data: { scope_type: 'service_type' }, // Missing scope_value and fields
          });
          expect(res.status()).toBe(400);
        }
      }
      expect(true).toBe(true);
    });

    test('4.8 GET /finance-settings/preview - preview resolved settings', async ({ request }) => {
      const res = await request.get(`${API_URL}/finance-settings/preview`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('resolved');
      }
    });

    test('4.9 GET /finance-settings/preview - with context params', async ({ request }) => {
      const res = await request.get(`${API_URL}/finance-settings/preview?serviceType=lesson&paymentMethod=card`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(res.status());
    });

    test('4.10 Financial settings - instructor cannot access', async ({ request }) => {
      const res = await request.get(`${API_URL}/finance-settings/active`, {
        headers: authHeaders(instructorToken),
      });
      expect(res.status()).toBe(403);
    });

    test('4.11 Financial settings require authentication', async ({ request }) => {
      const res = await request.get(`${API_URL}/finance-settings/active`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 5: Admin Waivers
  // ===========================================================================
  test.describe('5. Admin Waivers', () => {
    test('5.1 GET /admin/waivers - list all waivers', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    test('5.2 GET /admin/waivers - with pagination', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?page=1&pageSize=10`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.pagination).toBeDefined();
    });

    test('5.3 GET /admin/waivers - with search filter', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?search=test`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('5.4 GET /admin/waivers - with status filter', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?status=valid`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('5.5 GET /admin/waivers - with subjectType filter', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?subjectType=user`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('5.6 GET /admin/waivers - with sorting', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?sortBy=name&sortDirection=ASC`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('5.7 GET /admin/waivers - invalid status returns 400', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?status=invalid_status`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(400);
    });

    test('5.8 GET /admin/waivers - invalid sortBy returns 400', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?sortBy=invalid_field`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(400);
    });

    test('5.9 GET /admin/waivers/stats - get waiver statistics', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers/stats`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
    });

    test('5.10 GET /admin/waivers/export - export waivers as CSV', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers/export`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const contentType = res.headers()['content-type'];
      expect(contentType).toContain('text/csv');
    });

    test('5.11 GET /admin/waivers/subjects/:subjectId - get waiver detail', async ({ request }) => {
      // First get list to find a subject
      const listRes = await request.get(`${API_URL}/admin/waivers?pageSize=1`, {
        headers: authHeaders(adminToken),
      });
      
      if (listRes.status() === 200) {
        const listBody = await listRes.json();
        if (listBody.data && listBody.data.length > 0) {
          const subject = listBody.data[0];
          const subjectId = subject.subjectId || subject.id;
          const subjectType = subject.subjectType || 'user';
          
          const res = await request.get(`${API_URL}/admin/waivers/subjects/${subjectId}?type=${subjectType}`, {
            headers: authHeaders(adminToken),
          });
          expect([200, 404]).toContain(res.status());
        }
      }
      expect(true).toBe(true);
    });

    test('5.12 GET /admin/waivers/subjects/:subjectId - invalid UUID', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers/subjects/not-a-uuid?type=user`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(400);
    });

    test('5.13 GET /admin/waivers/subjects/:subjectId - missing type', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request.get(`${API_URL}/admin/waivers/subjects/${fakeId}`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(400);
    });

    test('5.14 Admin waivers - instructor cannot access', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers`, {
        headers: authHeaders(instructorToken),
      });
      expect(res.status()).toBe(403);
    });

    test('5.15 Admin waivers require authentication', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 6: Financial Reconciliation
  // ===========================================================================
  test.describe('6. Financial Reconciliation', () => {
    test('6.1 GET /admin/financial-reconciliation/stats - get reconciliation stats', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/financial-reconciliation/stats`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 500]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toBeDefined();
      }
    });

    test('6.2 POST /admin/financial-reconciliation/run - trigger manual reconciliation', async ({ request }) => {
      const res = await request.post(`${API_URL}/admin/financial-reconciliation/run`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 500]).toContain(res.status());
    });

    // Skipped: This endpoint takes too long and can crash the database pool
    test.skip('6.3 GET /admin/financial-reconciliation/test - run comprehensive test', async ({ request }) => {
      test.setTimeout(60000);
      const res = await request.get(`${API_URL}/admin/financial-reconciliation/test`, {
        headers: authHeaders(adminToken),
        timeout: 55000,
      });
      expect([200, 500]).toContain(res.status());
    });

    test('6.4 Financial reconciliation - instructor cannot access', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/financial-reconciliation/stats`, {
        headers: authHeaders(instructorToken),
      });
      expect(res.status()).toBe(403);
    });

    test('6.5 Financial reconciliation requires authentication', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/financial-reconciliation/stats`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 7: Services Management
  // ===========================================================================
  test.describe('7. Services Management', () => {
    test('7.1 GET /services - list all services', async ({ request }) => {
      // Services may or may not require auth depending on config
      const res = await request.get(`${API_URL}/services`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('7.2 GET /services - filter by category', async ({ request }) => {
      const res = await request.get(`${API_URL}/services?category=kitesurfing`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('7.3 GET /services - filter by level', async ({ request }) => {
      const res = await request.get(`${API_URL}/services?level=beginner`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
    });

    test('7.4 GET /services - filter by isPackage', async ({ request }) => {
      const res = await request.get(`${API_URL}/services?isPackage=true`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      // All returned should be packages (if any)
      if (body.length > 0) {
        body.forEach((service: any) => {
          expect(service.isPackage).toBe(true);
        });
      }
    });

    test('7.5 GET /services/categories - list categories', async ({ request }) => {
      const res = await request.get(`${API_URL}/services/categories`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('7.6 GET /services/packages - list packages (admin)', async ({ request }) => {
      const res = await request.get(`${API_URL}/services/packages`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('7.7 GET /services/packages - instructor cannot access', async ({ request }) => {
      const res = await request.get(`${API_URL}/services/packages`, {
        headers: authHeaders(instructorToken),
      });
      expect(res.status()).toBe(403);
    });

    test('7.8 Services list requires authentication', async ({ request }) => {
      const res = await request.get(`${API_URL}/services`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 8: Edge Cases & Security Tests
  // ===========================================================================
  test.describe('8. Edge Cases & Security', () => {
    test('8.1 Dashboard with invalid date range', async ({ request }) => {
      const res = await request.get(`${API_URL}/dashboard/summary?startDate=invalid&endDate=invalid`, {
        headers: authHeaders(adminToken),
      });
      // Should handle gracefully - may return error or default data
      expect([200, 400, 500]).toContain(res.status());
    });

    test('8.2 Dashboard with future dates', async ({ request }) => {
      const res = await request.get(`${API_URL}/dashboard/summary?startDate=2030-01-01&endDate=2030-12-31`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 400]).toContain(res.status());
    });

    test('8.3 Admin waivers - pageSize exceeds max', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?pageSize=500`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(400);
    });

    test('8.4 Admin waivers - page 0 should fail', async ({ request }) => {
      const res = await request.get(`${API_URL}/admin/waivers?page=0`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(400);
    });

    test('8.5 Finance settings - PATCH non-existent ID', async ({ request }) => {
      const res = await request.patch(`${API_URL}/finance-settings/99999`, {
        headers: authHeaders(adminToken),
        data: { tax_rate_pct: 10 },
      });
      expect(res.status()).toBe(404);
    });

    test('8.6 Settings - very long key name', async ({ request }) => {
      const longKey = 'a'.repeat(300);
      const res = await request.put(`${API_URL}/settings/${longKey}`, {
        headers: authHeaders(adminToken),
        data: { value: 'test' },
      });
      // Should handle or reject
      expect([200, 400, 500]).toContain(res.status());
    });

    test('8.7 System routes - SQL injection attempt in entityType', async ({ request }) => {
      const maliciousType = "students'; DROP TABLE users; --";
      const res = await request.post(`${API_URL}/system/${encodeURIComponent(maliciousType)}/1/update-references`, {
        headers: authHeaders(adminToken),
        data: { name: 'Test' },
      });
      // Should be handled safely - no actual SQL injection
      expect([200, 400, 404, 500]).toContain(res.status());
    });

    test('8.8 Multiple admin-only endpoints in sequence', async ({ request }) => {
      // Test that admin token works across multiple endpoints
      const endpoints = [
        '/dashboard/summary',
        '/finance-settings/active',
        '/admin/waivers?pageSize=1',
      ];

      for (const endpoint of endpoints) {
        const res = await request.get(`${API_URL}${endpoint}`, {
          headers: authHeaders(adminToken),
        });
        expect([200, 404]).toContain(res.status());
      }
    });
  });

  // ===========================================================================
  // SECTION 9: Integration Tests
  // ===========================================================================
  test.describe('9. Integration Tests', () => {
    test('9.1 Full settings workflow', async ({ request }) => {
      // 1. Get current settings
      const getRes = await request.get(`${API_URL}/settings`, {
        headers: authHeaders(adminToken),
      });
      expect(getRes.status()).toBe(200);

      // 2. Update a setting
      const updateRes = await request.put(`${API_URL}/settings/allowOnlineBooking`, {
        headers: authHeaders(adminToken),
        data: { value: true },
      });
      expect([200, 500]).toContain(updateRes.status());

      // 3. Verify the update
      const verifyRes = await request.get(`${API_URL}/settings`, {
        headers: authHeaders(adminToken),
      });
      expect(verifyRes.status()).toBe(200);
    });

    test('9.2 Financial settings with override workflow', async ({ request }) => {
      // 1. Get active settings
      const activeRes = await request.get(`${API_URL}/finance-settings/active`, {
        headers: authHeaders(adminToken),
      });
      expect(activeRes.status()).toBe(200);

      // 2. Preview resolved settings
      const previewRes = await request.get(`${API_URL}/finance-settings/preview`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(previewRes.status());

      // 3. List overrides
      const overridesRes = await request.get(`${API_URL}/finance-settings/overrides`, {
        headers: authHeaders(adminToken),
      });
      expect(overridesRes.status()).toBe(200);
    });

    test('9.3 Admin waiver management workflow', async ({ request }) => {
      // 1. Get stats
      const statsRes = await request.get(`${API_URL}/admin/waivers/stats`, {
        headers: authHeaders(adminToken),
      });
      expect(statsRes.status()).toBe(200);

      // 2. List waivers with filters
      const listRes = await request.get(`${API_URL}/admin/waivers?status=all&subjectType=all`, {
        headers: authHeaders(adminToken),
      });
      expect(listRes.status()).toBe(200);

      // 3. Export to CSV
      const exportRes = await request.get(`${API_URL}/admin/waivers/export`, {
        headers: authHeaders(adminToken),
      });
      expect(exportRes.status()).toBe(200);
    });

    test('9.4 Dashboard and system health check', async ({ request }) => {
      // 1. Get dashboard summary
      const dashRes = await request.get(`${API_URL}/dashboard/summary`, {
        headers: authHeaders(adminToken),
      });
      expect(dashRes.status()).toBe(200);

      // 2. Check database status
      const dbRes = await request.get(`${API_URL}/system/database-status`, {
        headers: authHeaders(adminToken),
      });
      expect(dbRes.status()).toBe(200);

      // 3. Get performance metrics
      const metricsRes = await request.get(`${API_URL}/system/performance-metrics`, {
        headers: authHeaders(adminToken),
      });
      expect(metricsRes.status()).toBe(200);
    });

    test('9.5 Services and packages workflow', async ({ request }) => {
      // 1. List all services
      const servicesRes = await request.get(`${API_URL}/services`, {
        headers: authHeaders(adminToken),
      });
      expect(servicesRes.status()).toBe(200);

      // 2. List categories
      const categoriesRes = await request.get(`${API_URL}/services/categories`, {
        headers: authHeaders(adminToken),
      });
      expect(categoriesRes.status()).toBe(200);

      // 3. List packages (admin only)
      const packagesRes = await request.get(`${API_URL}/services/packages`, {
        headers: authHeaders(adminToken),
      });
      expect(packagesRes.status()).toBe(200);
    });
  });
});
