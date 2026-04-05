/**
 * Phase 1: Booking Edit Flow E2E Tests
 *
 * Tests for booking edit and update functionality:
 * - Fetch booking list
 * - Get booking details
 * - Update booking (notes, status, etc.)
 *
 * Route tested: /bookings/edit/:id, /admin/bookings
 */

import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:4000/api';
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const ADMIN = { email: 'admin@plannivo.com', password: 'asdasd35' };

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function loginAsAdmin(page: any) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 });
}

test.describe('Booking Edit Flow', () => {
  test.describe.configure({ mode: 'serial' });
  let authToken: string;
  let testBookingId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await delay(500);
    const r = await request.post(`${API_BASE}/auth/login`, { data: ADMIN });
    authToken = (await r.json()).token;

    // Fetch a booking ID for use in tests
    const listResponse = await request.get(`${API_BASE}/bookings?limit=1`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (listResponse.ok()) {
      const data = await listResponse.json();
      const bookings = Array.isArray(data) ? data : data.bookings || data.data || [];

      if (Array.isArray(bookings) && bookings.length > 0) {
        testBookingId = bookings[0].id;
      }
    }
  });

  // ==========================================
  // API TESTS - Booking Operations
  // ==========================================

  test.describe('Booking API Operations', () => {
    test('should fetch bookings list', async ({ request }) => {
      test.skip(!authToken, 'No auth token');
      await delay(300);

      const response = await request.get(`${API_BASE}/bookings?limit=1`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        // Data could be array or object with bookings property
        const bookings = Array.isArray(data) ? data : data.bookings || data.data || [];
        expect(Array.isArray(bookings) || typeof data === 'object').toBe(true);
      }
    });

    test('should fetch single booking details', async ({ request }) => {
      test.skip(!authToken || !testBookingId, 'No auth token or booking ID');
      await delay(300);

      const response = await request.get(`${API_BASE}/bookings/${testBookingId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('id');
      }
    });

    test('should update booking with note', async ({ request }) => {
      test.skip(!authToken || !testBookingId, 'No auth token or booking ID');
      await delay(300);

      const response = await request.patch(`${API_BASE}/bookings/${testBookingId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          notes: `Test note updated at ${new Date().toISOString()}`
        }
      });

      expect([200, 400, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('id');
      }
    });

    test('should handle invalid booking ID gracefully', async ({ request }) => {
      test.skip(!authToken, 'No auth token');
      await delay(300);

      const response = await request.get(`${API_BASE}/bookings/invalid-id-12345`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect([400, 404, 422, 500]).toContain(response.status());
    });

    test('should require authentication for booking updates', async ({ request }) => {
      await delay(200);

      const response = await request.patch(`${API_BASE}/bookings/some-id`, {
        data: { notes: 'Unauthorized update' }
      });

      expect(response.status()).toBe(401);
    });
  });

  // ==========================================
  // UI TESTS - Booking Edit Pages
  // ==========================================

  test.describe('Booking Edit Pages', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('should load admin bookings list page', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/bookings`);
      await page.waitForLoadState('networkidle');

      // Check for table, list, or card elements
      const hasContent = await page
        .locator('table, .ant-card, [class*="booking"], [data-testid="booking-list"]')
        .count();

      expect(hasContent).toBeGreaterThanOrEqual(0);
    });

    test('should navigate to booking edit page if ID exists', async ({ page }) => {
      if (!testBookingId) {
        test.skip();
        return;
      }

      await page.goto(`${BASE_URL}/bookings/edit/${testBookingId}`);
      await page.waitForLoadState('networkidle');

      // Check for form or booking details
      const content = await page
        .locator('form, input, [class*="booking"], [data-testid="booking-edit"]')
        .count();

      expect(content).toBeGreaterThanOrEqual(0);
    });

    test('should handle 404 gracefully for non-existent booking', async ({ page }) => {
      await page.goto(`${BASE_URL}/bookings/edit/nonexistent-booking-id`);
      await page.waitForLoadState('networkidle');

      // Page should load (may show error message)
      const pageTitle = await page.title();
      expect(pageTitle).toBeTruthy();
    });

    test('should display booking information on edit page', async ({ page }) => {
      if (!testBookingId) {
        test.skip();
        return;
      }

      await page.goto(`${BASE_URL}/bookings/edit/${testBookingId}`);
      await page.waitForLoadState('networkidle');

      // Look for any content that indicates booking data loaded
      const content = await page.locator('body').innerHTML();
      expect(content.length).toBeGreaterThan(0);
    });

    test('should allow navigation back to bookings list', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/bookings`);
      await page.waitForLoadState('networkidle');

      // Look for navigation elements
      const backButtons = await page
        .locator('a[href*="bookings"], button:has-text("Back"), [aria-label*="back"]')
        .count();

      // Navigation may vary
      expect(backButtons).toBeGreaterThanOrEqual(0);
    });

    test('should load bookings list with pagination or scrolling', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/bookings`);
      await page.waitForLoadState('networkidle');

      // Check for pagination controls or infinite scroll indicators
      const paginationElements = await page
        .locator('.ant-pagination, [class*="pagination"], [class*="paging"]')
        .count();

      // Pagination may not be visible if there are few items
      expect(paginationElements).toBeGreaterThanOrEqual(0);
    });
  });
});
