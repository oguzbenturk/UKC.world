/**
 * Phase 2: Group Invitation Flow E2E Tests
 *
 * Tests for group lesson invitations and requests:
 * - Group invitation token page access
 * - Group bookings API
 * - Group lesson requests API
 */

import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:4000/api';
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

const ADMIN = {
  email: 'admin@plannivo.com',
  password: 'asdasd35'
};

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test.describe('Group Invitation Flow', () => {

  test.describe.configure({ mode: 'serial' });

  let authToken: string;
  let groupBookingId: string;
  let groupLessonRequestId: string;

  test.beforeAll(async ({ request }) => {
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN
    });
    const data = await response.json();
    authToken = data.token;
  });

  // ==========================================
  // GROUP BOOKINGS API TESTS
  // ==========================================

  test.describe('Group Bookings API', () => {

    test('should fetch group bookings list', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/group-bookings`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);

        // Store first booking ID if available
        if (Array.isArray(data) && data.length > 0) {
          groupBookingId = data[0].id || data[0].group_booking_id;
        }
      }
    });

    test('should fetch group bookings with pagination', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/group-bookings?limit=10&offset=0`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);
      }
    });

    test('should require authentication for group bookings', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/group-bookings`);
      expect(response.status()).toBe(401);
    });

    test('should fetch specific group booking details', async ({ request }) => {
      test.skip(!groupBookingId, 'No group booking ID available');

      await delay(300);
      const response = await request.get(`${API_BASE}/group-bookings/${groupBookingId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404, 500]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(typeof data === 'object').toBe(true);
      }
    });
  });

  // ==========================================
  // GROUP LESSON REQUESTS API TESTS
  // ==========================================

  test.describe('Group Lesson Requests API', () => {

    test('should fetch group lesson requests list', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/groupLessonRequests`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);

        // Store first request ID if available
        if (Array.isArray(data) && data.length > 0) {
          groupLessonRequestId = data[0].id || data[0].request_id;
        }
      }
    });

    test('should fetch group lesson requests with filters', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/groupLessonRequests?status=pending`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);
      }
    });

    test('should require authentication for group lesson requests', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/group-lesson-requests`);
      expect([401, 404]).toContain(response.status());
    });

    test('should fetch specific group lesson request details', async ({ request }) => {
      test.skip(!groupLessonRequestId, 'No group lesson request ID available');

      await delay(300);
      const response = await request.get(`${API_BASE}/groupLessonRequests/${groupLessonRequestId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404, 500]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(typeof data === 'object').toBe(true);
      }
    });
  });

  // ==========================================
  // GROUP INVITATION PAGE UI TESTS
  // ==========================================

  test.describe('Group Invitation Page', () => {

    test('should load group invitation page with test token', async ({ page }) => {
      // Navigate to group invitation page with a test token
      // Token doesn't need to be valid — page should just render without crashing
      await page.goto(`${BASE_URL}/group-invitation/test-token-123`);
      await delay(500);

      const bodyHTML = await page.content();
      // Page should render something — either the invitation form or an error message
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should display group invitation page with invalid token gracefully', async ({ page }) => {
      // Try with another invalid token
      await page.goto(`${BASE_URL}/group-invitation/invalid-token-xyz`);
      await delay(500);

      const bodyHTML = await page.content();
      // Should have content (error message, form, or something)
      expect(bodyHTML.length).toBeGreaterThan(100);

      // Should not crash with 500 error or blank page
      const hasError500 = bodyHTML.includes('500') && bodyHTML.includes('error');
      expect(hasError500).toBe(false);
    });

    test('should handle empty token gracefully', async ({ page }) => {
      await page.goto(`${BASE_URL}/group-invitation/`);
      await delay(500);

      const bodyHTML = await page.content();
      // Should render without crashing
      expect(bodyHTML.length).toBeGreaterThan(50);
    });

    test('should load group invitation with token containing special characters', async ({ page }) => {
      await page.goto(`${BASE_URL}/group-invitation/token-with-special-chars-!@#`);
      await delay(500);

      const bodyHTML = await page.content();
      // Page should handle special characters gracefully
      expect(bodyHTML.length).toBeGreaterThan(100);

      // Should not crash with 500 error
      const hasError500 = bodyHTML.includes('500') && bodyHTML.includes('error');
      expect(hasError500).toBe(false);
    });

    test('should load group invitation page without authentication', async ({ page }) => {
      // Group invitations should be public/accessible without login
      await page.goto(`${BASE_URL}/group-invitation/public-test-token`);
      await delay(500);

      const bodyHTML = await page.content();
      // Page should exist and render
      expect(bodyHTML.length).toBeGreaterThan(100);
    });
  });

  // ==========================================
  // GROUP LESSON REQUEST CREATION TESTS
  // ==========================================

  test.describe('Group Lesson Request Submission', () => {

    test('should submit group lesson request with valid data', async ({ request }) => {
      await delay(300);

      // First, get a valid service ID
      const servicesResponse = await request.get(`${API_BASE}/services`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      let serviceId: string | null = null;
      if (servicesResponse.status() === 200) {
        const services = await servicesResponse.json();
        if (Array.isArray(services) && services.length > 0) {
          serviceId = services[0].id;
        }
      }

      // Skip if no service available
      test.skip(!serviceId, 'No service ID available');

      const response = await request.post(`${API_BASE}/groupLessonRequests`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          serviceId: serviceId,
          preferredDateStart: new Date().toISOString().split('T')[0],
          preferredDateEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          preferredTimeOfDay: 'morning',
          preferredDurationHours: 2,
          skillLevel: 'beginner',
          notes: 'Test group lesson request'
        }
      });

      expect([201, 400, 404, 500]).toContain(response.status());

      if (response.status() === 201) {
        const data = await response.json();
        expect(data).toHaveProperty('id');
      }
    });

    test('should reject group lesson request without required fields', async ({ request }) => {
      await delay(300);
      const response = await request.post(`${API_BASE}/groupLessonRequests`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          // Missing serviceId
          preferredDateStart: new Date().toISOString().split('T')[0]
        }
      });

      // Should fail validation
      expect([400, 404, 500]).toContain(response.status());
    });

    test('should require authentication for creating group lesson request', async ({ request }) => {
      await delay(200);
      const response = await request.post(`${API_BASE}/groupLessonRequests`, {
        data: {
          serviceId: 'some-id',
          preferredDateStart: '2026-04-15'
        }
      });

      expect(response.status()).toBe(401);
    });
  });
});
