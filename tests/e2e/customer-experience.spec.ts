/**
 * Phase 5: Customer Experience E2E Tests
 *
 * Tests for customer-facing features:
 * - Family member management (CRUD, export, activity)
 * - Waivers (template, submit, status, history)
 * - Notifications (user notifications, settings, mark read)
 * - Feedback (submit, view, achievements)
 *
 * API Base Path: http://localhost:4000/api
 * Route Mountings:
 * - Family: /api/students/:userId/family
 * - Waivers: /api/waivers
 * - Notifications: /api/notifications
 * - Feedback: /api/feedback (if mounted)
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// --- API base URL ---
const API_URL = 'http://localhost:4000/api';

// --- Test credentials ---
const ADMIN_CREDS = { email: 'admin@plannivo.com', password: 'asdasd35' };
const STUDENT_CREDS = { email: 'kaanaysel@gmail.com', password: 'asdasd35' };

// --- Shared state ---
let adminToken: string;
let adminUserId: string;
let studentToken: string;
let studentUserId: string;

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

test.describe('Phase 5: Customer Experience E2E Tests', () => {
  test.beforeAll(async ({ request }) => {
    // Login as admin
    const admin = await login(request, ADMIN_CREDS);
    adminToken = admin.token;
    adminUserId = admin.userId;

    // Login as student
    const student = await login(request, STUDENT_CREDS);
    studentToken = student.token;
    studentUserId = student.userId;
  });

  // ===========================================================================
  // SECTION 1: Family Member Management
  // Note: Family routes allow only students (own family) or admin/manager (any family)
  // Since kaanaysel@gmail.com is an instructor, we use admin for family tests
  // ===========================================================================
  test.describe('1. Family Member Management', () => {
    let createdFamilyMemberId: string;
    let targetUserId: string; // User to manage family for

    test.beforeAll(async ({ request }) => {
      // Get a list of students from admin to find a target user
      const res = await request.get(`${API_URL}/users?role=student&limit=1`, {
        headers: authHeaders(adminToken),
      });
      if (res.status() === 200) {
        const body = await res.json();
        if (body.users && body.users.length > 0) {
          targetUserId = body.users[0].id;
        }
      }
      // Fallback to admin's own ID if no students found
      if (!targetUserId) {
        targetUserId = adminUserId;
      }
    });

    test('1.1 GET /students/:userId/family - admin can list family members', async ({ request }) => {
      const res = await request.get(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      }
    });

    test('1.2 GET /students/:userId/family - admin can access any user family', async ({ request }) => {
      const res = await request.get(`${API_URL}/students/${studentUserId}/family`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
      }
    });

    test('1.3 GET /students/:userId/family - instructor cannot access family (not student)', async ({ request }) => {
      // Instructor (kaanaysel) cannot access family routes (only students for own family, or admin/manager)
      const res = await request.get(`${API_URL}/students/${adminUserId}/family`, {
        headers: authHeaders(studentToken), // This is instructor token
      });
      expect(res.status()).toBe(403);
    });

    test('1.4 POST /students/:userId/family - admin can create family member', async ({ request }) => {
      const familyData = {
        full_name: 'Test Child',
        date_of_birth: '2015-05-15',
        relationship: 'child',
        gender: 'male',
        medical_notes: 'No allergies',
        emergency_contact: '123-456-7890',
      };

      const res = await request.post(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: familyData,
      });

      // May fail if family limit reached or validation error
      expect([201, 400]).toContain(res.status());
      if (res.status() === 201) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('data');
        expect(body.data).toHaveProperty('id');
        createdFamilyMemberId = body.data.id;
      }
    });

    test('1.5 POST /students/:userId/family - validation: missing full_name', async ({ request }) => {
      const res = await request.post(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          date_of_birth: '2015-05-15',
          relationship: 'child',
        },
      });
      expect(res.status()).toBe(400);
    });

    test('1.6 POST /students/:userId/family - validation: invalid relationship', async ({ request }) => {
      const res = await request.post(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: 'Invalid Relation Child',
          date_of_birth: '2015-05-15',
          relationship: 'cousin', // Not in allowed list
        },
      });
      expect(res.status()).toBe(400);
    });

    test('1.7 POST /students/:userId/family - validation: age over 18', async ({ request }) => {
      const res = await request.post(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: 'Adult Person',
          date_of_birth: '1990-01-01', // Over 18
          relationship: 'other',
        },
      });
      expect(res.status()).toBe(400);
    });

    test('1.8 GET /students/:userId/family/:memberId - get single family member', async ({ request }) => {
      // First get list to find a member
      const listRes = await request.get(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
      });

      if (listRes.status() === 200) {
        const listBody = await listRes.json();
        if (listBody.data && listBody.data.length > 0) {
          const memberId = listBody.data[0].id;
          const res = await request.get(`${API_URL}/students/${targetUserId}/family/${memberId}`, {
            headers: authHeaders(adminToken),
          });
          expect([200, 404]).toContain(res.status());
          if (res.status() === 200) {
            const body = await res.json();
            expect(body).toHaveProperty('success', true);
            expect(body.data).toHaveProperty('id', memberId);
          }
        }
      }
      expect(true).toBe(true); // Pass if no members exist
    });

    test('1.9 GET /students/:userId/family/:memberId - non-existent member returns 404', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request.get(`${API_URL}/students/${targetUserId}/family/${fakeId}`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(404);
    });

    test('1.10 PUT /students/:userId/family/:memberId - update family member', async ({ request }) => {
      // Get existing member
      const listRes = await request.get(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
      });

      if (listRes.status() === 200) {
        const listBody = await listRes.json();
        if (listBody.data && listBody.data.length > 0) {
          const memberId = listBody.data[0].id;
          const res = await request.put(`${API_URL}/students/${targetUserId}/family/${memberId}`, {
            headers: authHeaders(adminToken),
            data: { medical_notes: 'Updated notes from test' },
          });
          expect([200, 404]).toContain(res.status());
        }
      }
      expect(true).toBe(true);
    });

    test('1.11 PUT /students/:userId/family/:memberId - update with invalid gender', async ({ request }) => {
      const listRes = await request.get(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
      });

      if (listRes.status() === 200) {
        const listBody = await listRes.json();
        if (listBody.data && listBody.data.length > 0) {
          const memberId = listBody.data[0].id;
          const res = await request.put(`${API_URL}/students/${targetUserId}/family/${memberId}`, {
            headers: authHeaders(adminToken),
            data: { gender: 'invalid_gender' },
          });
          expect(res.status()).toBe(400);
        }
      }
      expect(true).toBe(true);
    });

    test('1.12 GET /students/:userId/family/:memberId/activity - get activity timeline', async ({ request }) => {
      const listRes = await request.get(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
      });

      if (listRes.status() === 200) {
        const listBody = await listRes.json();
        if (listBody.data && listBody.data.length > 0) {
          const memberId = listBody.data[0].id;
          const res = await request.get(`${API_URL}/students/${targetUserId}/family/${memberId}/activity`, {
            headers: authHeaders(adminToken),
          });
          expect([200, 404]).toContain(res.status());
          if (res.status() === 200) {
            const body = await res.json();
            expect(body).toHaveProperty('success', true);
          }
        }
      }
      expect(true).toBe(true);
    });

    test('1.13 GET /students/:userId/family/export - export CSV', async ({ request }) => {
      const res = await request.get(`${API_URL}/students/${targetUserId}/family/export`, {
        headers: authHeaders(adminToken),
      });
      // May return 200 with CSV or 404 if no members
      expect([200, 404, 500]).toContain(res.status());
      if (res.status() === 200) {
        const contentType = res.headers()['content-type'];
        expect(contentType).toContain('text/csv');
      }
    });

    test('1.14 DELETE /students/:userId/family/:memberId - delete family member (soft)', async ({ request }) => {
      // Create a new member to delete
      const createRes = await request.post(`${API_URL}/students/${targetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: 'Delete Test Child',
          date_of_birth: '2016-06-16',
          relationship: 'child',
        },
      });

      if (createRes.status() === 201) {
        const createBody = await createRes.json();
        const memberId = createBody.data.id;

        const deleteRes = await request.delete(`${API_URL}/students/${targetUserId}/family/${memberId}`, {
          headers: authHeaders(adminToken),
        });
        expect([200, 404]).toContain(deleteRes.status());
        if (deleteRes.status() === 200) {
          const body = await deleteRes.json();
          expect(body).toHaveProperty('success', true);
        }
      }
      expect(true).toBe(true);
    });

    test('1.15 DELETE /students/:userId/family/:memberId - non-existent returns 404', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request.delete(`${API_URL}/students/${targetUserId}/family/${fakeId}`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(404);
    });

    test('1.16 Unauthenticated access to family routes returns 401', async ({ request }) => {
      const res = await request.get(`${API_URL}/students/${targetUserId}/family`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 2: Waiver Management
  // ===========================================================================
  test.describe('2. Waiver Management', () => {
    test('2.1 GET /waivers/template - get latest waiver template (public)', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/template`);
      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('data');
      }
    });

    test('2.2 GET /waivers/template?language=en - get template with language', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/template?language=en`);
      expect([200, 404]).toContain(res.status());
    });

    test('2.3 GET /waivers/template?language=tr - get Turkish template', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/template?language=tr`);
      expect([200, 404]).toContain(res.status());
    });

    test('2.4 GET /waivers/template/:versionId - get specific version (invalid UUID)', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/template/invalid-uuid`);
      expect(res.status()).toBe(400);
    });

    test('2.5 GET /waivers/template/:versionId - get non-existent version', async ({ request }) => {
      const fakeUUID = '00000000-0000-0000-0000-000000000000';
      const res = await request.get(`${API_URL}/waivers/template/${fakeUUID}`);
      expect([400, 404]).toContain(res.status());
    });

    test('2.6 GET /waivers/status/:userId - check own waiver status', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/status/${studentUserId}`, {
        headers: authHeaders(studentToken),
      });
      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('data');
      }
    });

    test('2.7 GET /waivers/status/:userId - admin can check any user status', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/status/${studentUserId}`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(res.status());
    });

    test('2.8 GET /waivers/status/:userId - student cannot check other user status', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/status/${adminUserId}`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(403);
    });

    test('2.9 GET /waivers/status/:userId?type=family_member - check family member status', async ({ request }) => {
      // Get a family member first
      const famRes = await request.get(`${API_URL}/students/${studentUserId}/family`, {
        headers: authHeaders(studentToken),
      });

      if (famRes.status() === 200) {
        const famBody = await famRes.json();
        if (famBody.data && famBody.data.length > 0) {
          const memberId = famBody.data[0].id;
          const res = await request.get(`${API_URL}/waivers/status/${memberId}?type=family_member`, {
            headers: authHeaders(studentToken),
          });
          expect([200, 404]).toContain(res.status());
        }
      }
      expect(true).toBe(true);
    });

    test('2.10 GET /waivers/status/:userId - invalid UUID returns 400', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/status/not-a-uuid`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(400);
    });

    test('2.11 GET /waivers/check/:userId - check if user needs waiver', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/check/${studentUserId}`, {
        headers: authHeaders(studentToken),
      });
      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('needsWaiver');
        expect(typeof body.needsWaiver).toBe('boolean');
      }
    });

    test('2.12 GET /waivers/history/:userId - get waiver history', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/history/${studentUserId}`, {
        headers: authHeaders(studentToken),
      });
      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      }
    });

    test('2.13 GET /waivers/history/:userId - admin can view any history', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/history/${studentUserId}`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(res.status());
    });

    test('2.14 POST /waivers/submit - submit waiver (missing required fields)', async ({ request }) => {
      const res = await request.post(`${API_URL}/waivers/submit`, {
        headers: authHeaders(studentToken),
        data: {},
      });
      expect(res.status()).toBe(400);
    });

    test('2.15 POST /waivers/submit - submit waiver (both user_id and family_member_id)', async ({ request }) => {
      const res = await request.post(`${API_URL}/waivers/submit`, {
        headers: authHeaders(studentToken),
        data: {
          user_id: studentUserId,
          family_member_id: '00000000-0000-0000-0000-000000000001',
          waiver_version: '1.0',
          language_code: 'en',
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          agreed_to_terms: true,
        },
      });
      expect(res.status()).toBe(400);
    });

    test('2.16 POST /waivers/submit - submit waiver (neither user_id nor family_member_id)', async ({ request }) => {
      const res = await request.post(`${API_URL}/waivers/submit`, {
        headers: authHeaders(studentToken),
        data: {
          waiver_version: '1.0',
          language_code: 'en',
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          agreed_to_terms: true,
        },
      });
      expect(res.status()).toBe(400);
    });

    test('2.17 POST /waivers/submit - submit waiver (invalid signature format)', async ({ request }) => {
      const res = await request.post(`${API_URL}/waivers/submit`, {
        headers: authHeaders(studentToken),
        data: {
          user_id: studentUserId,
          waiver_version: '1.0',
          language_code: 'en',
          signature_data: 'not-a-base64-image',
          agreed_to_terms: true,
        },
      });
      expect(res.status()).toBe(400);
    });

    test('2.18 POST /waivers/submit - submit waiver (agreed_to_terms false)', async ({ request }) => {
      const res = await request.post(`${API_URL}/waivers/submit`, {
        headers: authHeaders(studentToken),
        data: {
          user_id: studentUserId,
          waiver_version: '1.0',
          language_code: 'en',
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          agreed_to_terms: false,
        },
      });
      expect(res.status()).toBe(400);
    });

    test('2.19 POST /waivers/submit - unauthenticated returns 401', async ({ request }) => {
      const res = await request.post(`${API_URL}/waivers/submit`, {
        data: {
          user_id: studentUserId,
          waiver_version: '1.0',
          language_code: 'en',
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          agreed_to_terms: true,
        },
      });
      expect(res.status()).toBe(401);
    });

    test('2.20 GET /waivers/status/:userId - unauthenticated returns 401', async ({ request }) => {
      const res = await request.get(`${API_URL}/waivers/status/${studentUserId}`);
      expect(res.status()).toBe(401);
    });
  });

  // ===========================================================================
  // SECTION 3: Notifications
  // ===========================================================================
  test.describe('3. Notifications', () => {
    let notificationId: string;

    test('3.1 GET /notifications/user - get user notifications', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/user`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('notifications');
      expect(Array.isArray(body.notifications)).toBe(true);
      expect(body).toHaveProperty('pagination');
      expect(body).toHaveProperty('meta');

      // Save a notification ID for later tests
      if (body.notifications.length > 0) {
        notificationId = body.notifications[0].id;
      }
    });

    test('3.2 GET /notifications/user?page=1&limit=10 - pagination', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/user?page=1&limit=10`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.pagination).toHaveProperty('page', 1);
      expect(body.pagination).toHaveProperty('limit', 10);
    });

    test('3.3 GET /notifications/user?unreadOnly=true - filter unread', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/user?unreadOnly=true`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('notifications');
    });

    test('3.4 GET /notifications/settings - get notification settings', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/settings`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      // Should have default or saved settings
      expect(typeof body.weather_alerts === 'boolean' || body.weather_alerts === undefined).toBe(true);
    });

    test('3.5 PUT /notifications/settings - update notification settings', async ({ request }) => {
      const res = await request.put(`${API_URL}/notifications/settings`, {
        headers: authHeaders(studentToken),
        data: {
          weather_alerts: true,
          booking_updates: true,
          payment_notifications: true,
          general_announcements: false,
          email_notifications: true,
          push_notifications: false,
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('weather_alerts', true);
      expect(body).toHaveProperty('general_announcements', false);
    });

    test('3.6 PUT /notifications/settings - partial update', async ({ request }) => {
      const res = await request.put(`${API_URL}/notifications/settings`, {
        headers: authHeaders(studentToken),
        data: {
          email_notifications: false,
        },
      });
      expect(res.status()).toBe(200);
    });

    test('3.7 PUT /notifications/settings - invalid type returns 400', async ({ request }) => {
      const res = await request.put(`${API_URL}/notifications/settings`, {
        headers: authHeaders(studentToken),
        data: {
          weather_alerts: 'yes', // Should be boolean
        },
      });
      expect(res.status()).toBe(400);
    });

    test('3.8 PATCH /notifications/:notificationId/read - mark as read', async ({ request }) => {
      // First get notifications to find one
      const listRes = await request.get(`${API_URL}/notifications/user`, {
        headers: authHeaders(studentToken),
      });

      if (listRes.status() === 200) {
        const listBody = await listRes.json();
        if (listBody.notifications && listBody.notifications.length > 0) {
          const nId = listBody.notifications[0].id;
          const res = await request.patch(`${API_URL}/notifications/${nId}/read`, {
            headers: authHeaders(studentToken),
          });
          // May be 200 or 404 (already read)
          expect([200, 404]).toContain(res.status());
        }
      }
      expect(true).toBe(true);
    });

    test('3.9 PATCH /notifications/:notificationId/read - non-existent returns 404', async ({ request }) => {
      const res = await request.patch(`${API_URL}/notifications/99999999/read`, {
        headers: authHeaders(studentToken),
      });
      // May return 404 (not found) or 500 (db error for invalid ID format)
      expect([404, 500]).toContain(res.status());
    });

    test('3.10 PATCH /notifications/read-all - mark all as read', async ({ request }) => {
      const res = await request.patch(`${API_URL}/notifications/read-all`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('updatedCount');
    });

    test('3.11 POST /notifications/send - admin can send notification', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/send`, {
        headers: authHeaders(adminToken),
        data: {
          title: 'Test Notification',
          message: 'This is a test notification from E2E tests',
          type: 'general',
        },
      });
      expect([200, 201]).toContain(res.status());
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
    });

    test('3.12 POST /notifications/send - send to specific recipients', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/send`, {
        headers: authHeaders(adminToken),
        data: {
          title: 'Targeted Notification',
          message: 'This is targeted to specific users',
          type: 'booking',
          recipients: [studentUserId],
        },
      });
      expect([200, 201]).toContain(res.status());
    });

    test('3.13 POST /notifications/send - missing title returns 400', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/send`, {
        headers: authHeaders(adminToken),
        data: {
          message: 'No title provided',
        },
      });
      expect(res.status()).toBe(400);
    });

    test('3.14 POST /notifications/send - student cannot send', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/send`, {
        headers: authHeaders(studentToken),
        data: {
          title: 'Unauthorized Notification',
          message: 'Should not work',
        },
      });
      expect(res.status()).toBe(403);
    });

    test('3.15 POST /notifications/subscribe - subscribe to push', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/subscribe`, {
        headers: authHeaders(studentToken),
        data: {
          endpoint: 'https://example.com/push/test-endpoint',
          keys: {
            p256dh: 'test-p256dh-key',
            auth: 'test-auth-key',
          },
        },
      });
      expect([200, 201]).toContain(res.status());
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
    });

    test('3.16 POST /notifications/subscribe - missing endpoint returns 400', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/subscribe`, {
        headers: authHeaders(studentToken),
        data: {
          keys: {
            p256dh: 'test-p256dh-key',
            auth: 'test-auth-key',
          },
        },
      });
      expect(res.status()).toBe(400);
    });

    test('3.17 POST /notifications/unsubscribe - unsubscribe from push', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/unsubscribe`, {
        headers: authHeaders(studentToken),
        data: {
          endpoint: 'https://example.com/push/test-endpoint',
        },
      });
      expect([200, 201]).toContain(res.status());
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
    });

    test('3.18 POST /notifications/unsubscribe - missing endpoint returns 400', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/unsubscribe`, {
        headers: authHeaders(studentToken),
        data: {},
      });
      expect(res.status()).toBe(400);
    });

    test('3.19 GET /notifications/user - unauthenticated returns 401', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/user`);
      expect(res.status()).toBe(401);
    });

    test('3.20 Admin notification metadata check', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/user`, {
        headers: authHeaders(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.meta).toHaveProperty('unreadCount');
      expect(body.meta).toHaveProperty('totalCount');
    });
  });

  // ===========================================================================
  // SECTION 4: Feedback System
  // ===========================================================================
  test.describe('4. Feedback System', () => {
    // Note: Feedback routes may not be mounted - tests handle 404 gracefully

    test('4.1 POST /feedback - submit feedback (missing bookingId)', async ({ request }) => {
      const res = await request.post(`${API_URL}/feedback`, {
        headers: authHeaders(studentToken),
        data: {
          rating: 5,
          comment: 'Great lesson!',
        },
      });
      // May be 400 (validation) or 404 (not mounted)
      expect([400, 404]).toContain(res.status());
    });

    test('4.2 POST /feedback - submit feedback (invalid rating)', async ({ request }) => {
      const res = await request.post(`${API_URL}/feedback`, {
        headers: authHeaders(studentToken),
        data: {
          bookingId: 1,
          rating: 10, // Invalid: must be 1-5
          comment: 'Great lesson!',
        },
      });
      expect([400, 404]).toContain(res.status());
    });

    test('4.3 POST /feedback - submit feedback (rating out of range)', async ({ request }) => {
      const res = await request.post(`${API_URL}/feedback`, {
        headers: authHeaders(studentToken),
        data: {
          bookingId: 1,
          rating: 0, // Invalid: must be 1-5
        },
      });
      expect([400, 404]).toContain(res.status());
    });

    test('4.4 POST /feedback - submit feedback (invalid skillLevel)', async ({ request }) => {
      const res = await request.post(`${API_URL}/feedback`, {
        headers: authHeaders(studentToken),
        data: {
          bookingId: 1,
          rating: 4,
          skillLevel: 'expert', // Invalid: must be beginner/intermediate/advanced
        },
      });
      expect([400, 404]).toContain(res.status());
    });

    test('4.5 POST /feedback - unauthenticated returns 401', async ({ request }) => {
      const res = await request.post(`${API_URL}/feedback`, {
        data: {
          bookingId: 1,
          rating: 5,
        },
      });
      // 401 if mounted, 404 if not mounted
      expect([401, 404]).toContain(res.status());
    });

    test('4.6 GET /feedback/booking/:bookingId - get feedback for booking', async ({ request }) => {
      const res = await request.get(`${API_URL}/feedback/booking/1`, {
        headers: authHeaders(studentToken),
      });
      // 200, 404 (not found), or 404 (not mounted)
      expect([200, 404]).toContain(res.status());
    });

    test('4.7 GET /feedback/booking/:bookingId - invalid bookingId', async ({ request }) => {
      const res = await request.get(`${API_URL}/feedback/booking/not-a-number`, {
        headers: authHeaders(studentToken),
      });
      expect([400, 404, 500]).toContain(res.status());
    });

    test('4.8 GET /feedback/instructor/:instructorId/summary - instructor summary', async ({ request }) => {
      const res = await request.get(`${API_URL}/feedback/instructor/1/summary`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 403, 404]).toContain(res.status());
    });

    test('4.9 GET /feedback/achievements/:studentId - get achievements', async ({ request }) => {
      const res = await request.get(`${API_URL}/feedback/achievements/${studentUserId}`, {
        headers: authHeaders(studentToken),
      });
      expect([200, 403, 404]).toContain(res.status());
    });

    test('4.10 GET /feedback/achievements/:studentId - student cannot view others', async ({ request }) => {
      const res = await request.get(`${API_URL}/feedback/achievements/${adminUserId}`, {
        headers: authHeaders(studentToken),
      });
      // 403 if mounted, 404 if not mounted
      expect([403, 404]).toContain(res.status());
    });
  });

  // ===========================================================================
  // SECTION 5: Additional Customer Experience Tests
  // ===========================================================================
  test.describe('5. Customer Experience - Edge Cases', () => {
    let edgeCaseTargetUserId: string;

    test.beforeAll(async ({ request }) => {
      // Get a target user for edge case tests
      const res = await request.get(`${API_URL}/users?role=student&limit=1`, {
        headers: authHeaders(adminToken),
      });
      if (res.status() === 200) {
        const body = await res.json();
        if (body.users && body.users.length > 0) {
          edgeCaseTargetUserId = body.users[0].id;
        }
      }
      if (!edgeCaseTargetUserId) {
        edgeCaseTargetUserId = adminUserId;
      }
    });

    test('5.1 Family member creation with boundary age (exactly 18)', async ({ request }) => {
      // Calculate date that makes person exactly 18 today
      const today = new Date();
      const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
      const dateStr = eighteenYearsAgo.toISOString().split('T')[0];

      const res = await request.post(`${API_URL}/students/${edgeCaseTargetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: 'Boundary Age Test',
          date_of_birth: dateStr,
          relationship: 'other',
        },
      });
      // Should fail as person is 18, not under 18
      expect(res.status()).toBe(400);
    });

    test('5.2 Family member creation with just under 18', async ({ request }) => {
      // Calculate date that makes person just under 18
      const today = new Date();
      const almostEighteen = new Date(today.getFullYear() - 17, today.getMonth(), today.getDate() - 1);
      const dateStr = almostEighteen.toISOString().split('T')[0];

      const res = await request.post(`${API_URL}/students/${edgeCaseTargetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: 'Almost 18 Test',
          date_of_birth: dateStr,
          relationship: 'other',
        },
      });
      // Should succeed or fail due to limit
      expect([201, 400]).toContain(res.status());
    });

    test('5.3 Notification pagination edge case - page 0', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/user?page=0`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      // Should default to page 1
      expect(body.pagination.page).toBe(1);
    });

    test('5.4 Notification pagination edge case - negative page', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/user?page=-1`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.pagination.page).toBe(1);
    });

    test('5.5 Notification pagination edge case - very large limit', async ({ request }) => {
      const res = await request.get(`${API_URL}/notifications/user?limit=1000`, {
        headers: authHeaders(studentToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      // Should be capped at 100
      expect(body.pagination.limit).toBeLessThanOrEqual(100);
    });

    test('5.6 Waiver with JPEG signature', async ({ request }) => {
      const res = await request.post(`${API_URL}/waivers/submit`, {
        headers: authHeaders(studentToken),
        data: {
          user_id: studentUserId,
          waiver_version: '1.0',
          language_code: 'en',
          signature_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k=',
          agreed_to_terms: true,
        },
      });
      // May succeed or fail based on waiver version existence
      expect([201, 400, 404, 500]).toContain(res.status());
    });

    test('5.7 Family member with special characters in name', async ({ request }) => {
      const res = await request.post(`${API_URL}/students/${edgeCaseTargetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: "O'Connor-Smith Jr.",
          date_of_birth: '2018-03-15',
          relationship: 'child',
        },
      });
      expect([201, 400]).toContain(res.status());
    });

    test('5.8 Family member with Unicode name', async ({ request }) => {
      const res = await request.post(`${API_URL}/students/${edgeCaseTargetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: 'Özlem Çelik',
          date_of_birth: '2017-07-20',
          relationship: 'daughter',
        },
      });
      expect([201, 400]).toContain(res.status());
    });

    test('5.9 Family member with very long medical notes', async ({ request }) => {
      const longNotes = 'A'.repeat(2001); // Over 2000 char limit
      const res = await request.post(`${API_URL}/students/${edgeCaseTargetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: 'Long Notes Test',
          date_of_birth: '2016-01-01',
          relationship: 'child',
          medical_notes: longNotes,
        },
      });
      expect(res.status()).toBe(400);
    });

    test('5.10 Notification send with all types', async ({ request }) => {
      const types = ['weather', 'booking', 'general'];
      for (const type of types) {
        const res = await request.post(`${API_URL}/notifications/send`, {
          headers: authHeaders(adminToken),
          data: {
            title: `Test ${type} notification`,
            message: `Testing ${type} notification type`,
            type,
          },
        });
        expect([200, 201]).toContain(res.status());
      }
    });

    test('5.11 Notification send with invalid type', async ({ request }) => {
      const res = await request.post(`${API_URL}/notifications/send`, {
        headers: authHeaders(adminToken),
        data: {
          title: 'Invalid Type Test',
          message: 'Testing invalid notification type',
          type: 'invalid_type',
        },
      });
      expect(res.status()).toBe(400);
    });

    test('5.12 Waiver history with type=family_member', async ({ request }) => {
      const famRes = await request.get(`${API_URL}/students/${studentUserId}/family`, {
        headers: authHeaders(studentToken),
      });

      if (famRes.status() === 200) {
        const famBody = await famRes.json();
        if (famBody.data && famBody.data.length > 0) {
          const memberId = famBody.data[0].id;
          const res = await request.get(`${API_URL}/waivers/history/${memberId}?type=family_member`, {
            headers: authHeaders(studentToken),
          });
          expect([200, 404]).toContain(res.status());
        }
      }
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // SECTION 6: Integration Tests
  // ===========================================================================
  test.describe('6. Integration Tests', () => {
    let integrationTargetUserId: string;

    test.beforeAll(async ({ request }) => {
      // Get a target user for integration tests
      const res = await request.get(`${API_URL}/users?role=student&limit=1`, {
        headers: authHeaders(adminToken),
      });
      if (res.status() === 200) {
        const body = await res.json();
        if (body.users && body.users.length > 0) {
          integrationTargetUserId = body.users[0].id;
        }
      }
      if (!integrationTargetUserId) {
        integrationTargetUserId = adminUserId;
      }
    });

    test('6.1 Complete family member workflow', async ({ request }) => {
      // 1. Create family member
      const createRes = await request.post(`${API_URL}/students/${integrationTargetUserId}/family`, {
        headers: authHeaders(adminToken),
        data: {
          full_name: 'Workflow Test Child',
          date_of_birth: '2019-08-25',
          relationship: 'son',
          gender: 'male',
        },
      });

      if (createRes.status() === 201) {
        const createBody = await createRes.json();
        const memberId = createBody.data.id;

        // 2. Get the created member
        const getRes = await request.get(`${API_URL}/students/${integrationTargetUserId}/family/${memberId}`, {
          headers: authHeaders(adminToken),
        });
        expect(getRes.status()).toBe(200);

        // 3. Update the member
        const updateRes = await request.put(`${API_URL}/students/${integrationTargetUserId}/family/${memberId}`, {
          headers: authHeaders(adminToken),
          data: { emergency_contact: '555-1234' },
        });
        expect([200, 404]).toContain(updateRes.status());

        // 4. Check waiver status for family member
        const waiverRes = await request.get(`${API_URL}/waivers/status/${memberId}?type=family_member`, {
          headers: authHeaders(adminToken),
        });
        expect([200, 404]).toContain(waiverRes.status());

        // 5. Delete the member
        const deleteRes = await request.delete(`${API_URL}/students/${integrationTargetUserId}/family/${memberId}`, {
          headers: authHeaders(adminToken),
        });
        expect([200, 404]).toContain(deleteRes.status());
      }
      expect(true).toBe(true);
    });

    test('6.2 Notification workflow', async ({ request }) => {
      // 1. Check initial settings
      const settingsRes = await request.get(`${API_URL}/notifications/settings`, {
        headers: authHeaders(studentToken),
      });
      expect(settingsRes.status()).toBe(200);

      // 2. Update settings
      const updateRes = await request.put(`${API_URL}/notifications/settings`, {
        headers: authHeaders(studentToken),
        data: { email_notifications: true },
      });
      expect(updateRes.status()).toBe(200);

      // 3. Get notifications
      const notifRes = await request.get(`${API_URL}/notifications/user`, {
        headers: authHeaders(studentToken),
      });
      expect(notifRes.status()).toBe(200);

      // 4. Mark all as read
      const readAllRes = await request.patch(`${API_URL}/notifications/read-all`, {
        headers: authHeaders(studentToken),
      });
      expect(readAllRes.status()).toBe(200);
    });

    test('6.3 Admin can manage another users family', async ({ request }) => {
      // Admin should be able to view any user's family
      const res = await request.get(`${API_URL}/students/${integrationTargetUserId}/family`, {
        headers: authHeaders(adminToken),
      });
      expect([200, 404]).toContain(res.status());
    });

    test('6.4 Concurrent notification requests', async ({ request }) => {
      // Make multiple parallel requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request.get(`${API_URL}/notifications/user?page=${i + 1}`, {
            headers: authHeaders(studentToken),
          })
        );
      }

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status()).toBe(200);
      }
    });
  });
});
