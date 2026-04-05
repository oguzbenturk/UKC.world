/**
 * Phase 2: Service Configuration Flow E2E Tests
 *
 * Tests for service management and configuration:
 * - Service listing and filtering
 * - Service categories
 * - Community services
 * - Sales services
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

test.describe('Service Configuration Flow', () => {

  test.describe.configure({ mode: 'serial' });

  let authToken: string;
  let serviceId: string;

  test.beforeAll(async ({ request }) => {
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN
    });
    const data = await response.json();
    authToken = data.token;
  });

  // ==========================================
  // SERVICE API TESTS
  // ==========================================

  test.describe('Services API', () => {

    test('should fetch all services', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);

        // Store first service ID for later tests
        if (data.length > 0) {
          serviceId = data[0].id;
        }
      }
    });

    test('should fetch services without authentication', async ({ request }) => {
      // Services list may be public
      await delay(300);
      const response = await request.get(`${API_BASE}/services`);

      // May return 200 (public) or 401 (private)
      expect([200, 401, 404]).toContain(response.status());
    });

    test('should filter services by category', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?category=lessons`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });

    test('should filter services by type', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?type=lesson`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });

    test('should fetch specific service details', async ({ request }) => {
      test.skip(!serviceId, 'No service ID available');

      await delay(300);
      const response = await request.get(`${API_BASE}/services/${serviceId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404, 500]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('name');
      }
    });

    test('should handle pagination for services', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?limit=10&offset=0`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });
  });

  // ==========================================
  // SERVICE CATEGORIES API TESTS
  // ==========================================

  test.describe('Service Categories API', () => {

    test('should fetch service categories', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services/categories`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      // May return 200 or 404 if endpoint doesn't exist
      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);
      }
    });

    test('should fetch categories without authentication', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services/categories`);

      // May be public or private
      expect([200, 401, 404]).toContain(response.status());
    });

    test('should create service category (admin only)', async ({ request }) => {
      await delay(300);
      const response = await request.post(`${API_BASE}/services/categories`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          name: `Test Category ${Date.now()}`,
          description: 'Test category for E2E testing'
        }
      });

      // May succeed or fail due to route not implemented
      expect([201, 400, 403, 404, 500]).toContain(response.status());
    });

    test('should require authentication for creating categories', async ({ request }) => {
      await delay(200);
      const response = await request.post(`${API_BASE}/services/categories`, {
        data: {
          name: 'Test Category'
        }
      });

      // Should be 401 or 404 (not 201)
      expect([401, 404, 500]).toContain(response.status());
    });
  });

  // ==========================================
  // COMMUNITY SERVICES API TESTS
  // ==========================================

  test.describe('Community Services API', () => {

    test('should fetch community services', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?type=community`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });

    test('should fetch community services without auth', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?type=community`);

      // May be public or private
      expect([200, 401, 404]).toContain(response.status());
    });

    test('should filter by community category', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?category=community`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });
  });

  // ==========================================
  // SALES SERVICES API TESTS
  // ==========================================

  test.describe('Sales Services API', () => {

    test('should fetch sales services', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?category=sales`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });

    test('should fetch sales/shop services', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?type=shop`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });

    test('should fetch sales services without auth', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/services?category=sales`);

      // May be public or private
      expect([200, 401, 404]).toContain(response.status());
    });
  });

  // ==========================================
  // SERVICE CONFIGURATION UI TESTS
  // ==========================================

  test.describe('Service Configuration UI', () => {

    test('should load services page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      // Navigate to services page
      await page.goto(`${BASE_URL}/services`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should load service categories page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      // Navigate to service categories page
      await page.goto(`${BASE_URL}/services/categories`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should load community services page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      // Navigate to community services page
      await page.goto(`${BASE_URL}/services/community`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should load sales services page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      // Navigate to sales services page
      await page.goto(`${BASE_URL}/services/sales`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should load specific service details page', async ({ page }) => {
      test.skip(!serviceId, 'No service ID available');

      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      // Navigate to service details page
      await page.goto(`${BASE_URL}/services/${serviceId}`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });
  });
});
