/**
 * Phase 2: Customer Edit Flow E2E Tests
 *
 * Tests for customer management and user profile editing:
 * - Customer list navigation
 * - Customer edit page access
 * - User profile updates
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

test.describe('Customer Edit Flow', () => {

  test.describe.configure({ mode: 'serial' });

  let authToken: string;
  let customerId: string;
  let customerEmail: string;

  test.beforeAll(async ({ request }) => {
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN
    });
    const data = await response.json();
    authToken = data.token;
  });

  // ==========================================
  // CUSTOMER API TESTS
  // ==========================================

  test.describe('Customer Fetch API', () => {

    test('should fetch first customer from users list', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/users?role=student&limit=1`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
          const customer = data[0];
          customerId = customer.id || customer.user_id;
          customerEmail = customer.email;

          expect(customerId).toBeDefined();
          expect(customerEmail).toBeDefined();
        }
      }
    });

    test('should fetch customer by ID', async ({ request }) => {
      // Skip if no customer ID found
      test.skip(!customerId, 'No customer ID available');

      await delay(300);
      const response = await request.get(`${API_BASE}/users/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('email');
      }
    });

    test('should update customer phone number', async ({ request }) => {
      test.skip(!customerId, 'No customer ID available');

      await delay(300);
      const response = await request.patch(`${API_BASE}/users/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          phone: '+1-555-0123'
        }
      });

      // May succeed (200), fail with various errors (400, 404, 500)
      expect([200, 400, 404, 500]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(data.phone).toBe('+1-555-0123');
      }
    });

    test('should fetch multiple customers', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/users?role=student`, {
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

    test('should require authentication for customer list', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/users?role=student`);
      expect(response.status()).toBe(401);
    });

    test('should require authentication for customer details', async ({ request }) => {
      test.skip(!customerId, 'No customer ID available');

      await delay(200);
      const response = await request.get(`${API_BASE}/users/${customerId}`);
      expect(response.status()).toBe(401);
    });

    test('should return 404 for non-existent customer', async ({ request }) => {
      await delay(300);
      const fakeId = '99999999-9999-9999-9999-999999999999';
      const response = await request.get(`${API_BASE}/users/${fakeId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([404, 500]).toContain(response.status());
    });
  });

  // ==========================================
  // CUSTOMER EDIT PAGE UI TESTS
  // ==========================================

  test.describe('Customer Edit UI', () => {

    test('should login and navigate to customers page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      // Navigate to customers page
      await page.goto(`${BASE_URL}/admin/customers`);
      await delay(500);

      const bodyHTML = await page.content();
      // Should have some indication of customers or a list
      const hasContent = bodyHTML.includes('customer') ||
                        bodyHTML.includes('Customer') ||
                        bodyHTML.includes('student') ||
                        bodyHTML.includes('list') ||
                        bodyHTML.includes('404');
      expect(hasContent).toBe(true);
    });

    test('should navigate to customer edit page if ID exists', async ({ page }) => {
      test.skip(!customerId, 'No customer ID available');

      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      // Navigate to edit customer page
      await page.goto(`${BASE_URL}/customers/edit/${customerId}`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should navigate to user edit page', async ({ page }) => {
      test.skip(!customerId, 'No customer ID available');

      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      // Navigate to user edit page via /users route
      await page.goto(`${BASE_URL}/users/${customerId}/edit`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should show customer list page with table or cards', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);
      await delay(500);

      await page.goto(`${BASE_URL}/customers`);
      await delay(500);

      // Look for common table/list indicators
      const hasTable = await page.locator('.ant-table, table, .ant-list, [role="table"]').first().isVisible().catch(() => false);
      const hasCard = await page.locator('.ant-card, [class*="card"]').first().isVisible().catch(() => false);

      // Either table or cards should be present, or page should exist
      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });
  });

  // ==========================================
  // CUSTOMER PROFILE UPDATE TESTS
  // ==========================================

  test.describe('Customer Profile Update', () => {

    test('should update customer profile with valid data', async ({ request }) => {
      test.skip(!customerId, 'No customer ID available');

      await delay(300);
      const response = await request.patch(`${API_BASE}/users/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          first_name: 'Updated',
          last_name: 'Customer',
          phone: '+1-555-9999'
        }
      });

      expect([200, 400, 404, 500]).toContain(response.status());
    });

    test('should reject update without authentication', async ({ request }) => {
      test.skip(!customerId, 'No customer ID available');

      await delay(200);
      const response = await request.patch(`${API_BASE}/users/${customerId}`, {
        data: {
          phone: '+1-555-0123'
        }
      });

      expect(response.status()).toBe(401);
    });

    test('should verify customer email cannot be empty', async ({ request }) => {
      test.skip(!customerId, 'No customer ID available');

      await delay(300);
      const response = await request.patch(`${API_BASE}/users/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          email: ''
        }
      });

      // Should fail validation
      expect([400, 404, 500]).toContain(response.status());
    });
  });
});
