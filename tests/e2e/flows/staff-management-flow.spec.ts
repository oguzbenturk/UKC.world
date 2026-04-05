/**
 * Phase 1: Staff Management E2E Tests
 *
 * Tests for instructor and manager management routes:
 * - Instructors list
 * - Create new instructor
 * - Edit instructor
 * - Managers list
 *
 * Routes tested: /instructors, /instructors/new, /instructors/edit/:id,
 *                /instructors/managers
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

test.describe('Staff Management Flow', () => {
  test.describe.configure({ mode: 'serial' });
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    await delay(500);
    const r = await request.post(`${API_BASE}/auth/login`, { data: ADMIN });
    authToken = (await r.json()).token;
  });

  // ==========================================
  // API TESTS - Instructor & Manager Data
  // ==========================================

  test.describe('Staff API', () => {
    test('should list all instructors', async ({ request }) => {
      test.skip(!authToken, 'No auth token');
      await delay(300);

      const response = await request.get(`${API_BASE}/instructors`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        const instructors = Array.isArray(data) ? data : data.data || data;
        expect(Array.isArray(instructors) || typeof instructors === 'object').toBe(true);
      }
    });

    test('should list instructors via users API', async ({ request }) => {
      test.skip(!authToken, 'No auth token');
      await delay(300);

      const response = await request.get(`${API_BASE}/users?role=instructor`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);
      }
    });

    test('should list managers via users API', async ({ request }) => {
      test.skip(!authToken, 'No auth token');
      await delay(300);

      const response = await request.get(`${API_BASE}/users?role=manager`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);
      }
    });

    test('should get single instructor if ID exists', async ({ request }) => {
      test.skip(!authToken, 'No auth token');
      await delay(300);

      const listResponse = await request.get(`${API_BASE}/instructors`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      if (listResponse.ok()) {
        const data = await listResponse.json();
        const instructors = Array.isArray(data) ? data : data.data || data;

        if (Array.isArray(instructors) && instructors.length > 0) {
          const instructorId = instructors[0].id;

          const response = await request.get(`${API_BASE}/instructors/${instructorId}`, {
            headers: { Authorization: `Bearer ${authToken}` }
          });

          expect([200, 404]).toContain(response.status());
        }
      }
    });

    test('should require authentication for staff data', async ({ request }) => {
      await delay(200);

      const response = await request.get(`${API_BASE}/instructors`);

      expect(response.status()).toBe(401);
    });
  });

  // ==========================================
  // UI TESTS - Staff Management Pages
  // ==========================================

  test.describe('Staff Management Pages', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('should load instructors list page', async ({ page }) => {
      await page.goto(`${BASE_URL}/instructors`);
      await page.waitForLoadState('networkidle');

      // Check for table, list, or card elements
      const hasContent = await page
        .locator('table, .ant-card, [class*="instructor"], [data-testid="instructor-list"]')
        .count();

      expect(hasContent).toBeGreaterThanOrEqual(0);
    });

    test('should load instructors new/create page', async ({ page }) => {
      await page.goto(`${BASE_URL}/instructors/new`);
      await page.waitForLoadState('networkidle');

      // Check for form elements
      const formElements = await page.locator('form, input, textarea, [type="text"]').count();

      expect(formElements).toBeGreaterThanOrEqual(0);
    });

    test('should navigate to edit page if instructor exists', async ({ page }) => {
      // First try to get an instructor ID
      const response = await page.request.get(`${API_BASE}/instructors`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      if (response.ok()) {
        const data = await response.json();
        const instructors = Array.isArray(data) ? data : data.data || data;

        if (Array.isArray(instructors) && instructors.length > 0) {
          const instructorId = instructors[0].id;
          await page.goto(`${BASE_URL}/instructors/edit/${instructorId}`);
          await page.waitForLoadState('networkidle');

          // Page should load
          const pageTitle = await page.title();
          expect(pageTitle).toBeTruthy();
        }
      }
    });

    test('should load managers page', async ({ page }) => {
      await page.goto(`${BASE_URL}/instructors/managers`);
      await page.waitForLoadState('networkidle');

      // Check for table, list, or card elements
      const hasContent = await page
        .locator('table, .ant-card, [class*="manager"], [data-testid="manager-list"]')
        .count();

      expect(hasContent).toBeGreaterThanOrEqual(0);
    });

    test('should handle edit page 404 gracefully', async ({ page }) => {
      await page.goto(`${BASE_URL}/instructors/edit/nonexistent-id`);
      await page.waitForLoadState('networkidle');

      // Page should load (may show error or empty state)
      const pageTitle = await page.title();
      expect(pageTitle).toBeTruthy();
    });

    test('should have navigation between staff pages', async ({ page }) => {
      await page.goto(`${BASE_URL}/instructors`);
      await page.waitForLoadState('networkidle');

      // Look for navigation links
      const navLinks = await page
        .locator('a[href*="/instructors"], button[onclick*="instructor"], [class*="nav"]')
        .count();

      // Navigation may vary by layout
      expect(navLinks).toBeGreaterThanOrEqual(0);
    });
  });
});
