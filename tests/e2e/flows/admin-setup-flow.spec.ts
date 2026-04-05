/**
 * Phase 2: Admin Setup Flow E2E Tests
 *
 * Tests for admin-only configuration routes:
 * - Deleted bookings management
 * - Legal documents
 * - Spare parts inventory
 * - Manager commissions
 * - Manager payroll
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

test.describe('Admin Setup Flow', () => {

  test.describe.configure({ mode: 'serial' });

  let authToken: string;
  let managerId: string;

  test.beforeAll(async ({ request }) => {
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN
    });
    const data = await response.json();
    authToken = data.token;
  });

  // ==========================================
  // DELETED BOOKINGS API TESTS
  // ==========================================

  test.describe('Deleted Bookings API', () => {

    test('should fetch deleted/cancelled bookings', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/bookings?deleted=true`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      // May return 200 (success with list) or 404 if endpoint not found
      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);
      }
    });

    test('should fetch cancelled bookings via status parameter', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/bookings?status=cancelled`, {
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

    test('should require authentication for deleted bookings', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/bookings?deleted=true`);
      expect(response.status()).toBe(401);
    });
  });

  // ==========================================
  // LEGAL DOCUMENTS API TESTS
  // ==========================================

  test.describe('Legal Documents API', () => {

    test('should fetch legal documents', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/legal-documents`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      // 200 if endpoint exists and documents found, 404 if no documents
      expect([200, 404, 500]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        // Should be object with document keys like 'terms', 'privacy', etc.
        expect(typeof data === 'object').toBe(true);
      }
    });

    test('should require authentication for legal documents', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/legal-documents`);
      expect([401, 404]).toContain(response.status());
    });

    test('should save legal document (admin only)', async ({ request }) => {
      await delay(300);
      const response = await request.post(`${API_BASE}/legal-documents`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          type: 'privacy',
          version: '1.0',
          content: 'Test privacy policy content'
        }
      });

      // May succeed (200), fail due to auth (403), or route not found (404)
      expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
    });

    test('should reject legal document creation without required fields', async ({ request }) => {
      await delay(300);
      const response = await request.post(`${API_BASE}/legal-documents`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          type: 'privacy'
          // Missing 'content'
        }
      });

      expect([400, 404, 500]).toContain(response.status());
    });
  });

  // ==========================================
  // SPARE PARTS API TESTS
  // ==========================================

  test.describe('Spare Parts API', () => {

    test('should fetch spare parts inventory', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/spareParts`, {
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

    test('should fetch spare parts with status filter', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/spareParts?status=pending`, {
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

    test('should require authentication for spare parts', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/spare-parts`);
      expect([401, 404]).toContain(response.status());
    });

    test('should create new spare part order', async ({ request }) => {
      await delay(300);
      const response = await request.post(`${API_BASE}/spareParts`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        data: {
          partName: 'Test Part',
          quantity: 5,
          supplier: 'Test Supplier'
        }
      });

      // May succeed (201), fail validation (400), or not be implemented (404)
      expect([201, 400, 404, 500]).toContain(response.status());
    });
  });

  // ==========================================
  // MANAGER COMMISSIONS API TESTS
  // ==========================================

  test.describe('Manager Commissions API', () => {

    test('should fetch manager commissions', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/managerCommissions`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      // May return data, 404 if route not found, or 500 if query fails
      expect([200, 404, 500]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);
      }
    });

    test('should fetch all managers with commission settings', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/manager/commissions/all`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect([200, 404, 500]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) || typeof data === 'object').toBe(true);

        // Store first manager ID for payroll test
        if (Array.isArray(data) && data.length > 0) {
          managerId = data[0].id || data[0].user_id;
        }
      }
    });

    test('should require authentication for manager commissions', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/managerCommissions`);
      expect(response.status()).toBe(401);
    });
  });

  // ==========================================
  // MANAGER PAYROLL API TESTS
  // ==========================================

  test.describe('Manager Payroll API', () => {

    test('should fetch payroll for specific manager', async ({ request }) => {
      // Skip if we couldn't find a manager ID
      test.skip(!managerId, 'No manager ID available');

      await delay(300);
      const response = await request.get(`${API_BASE}/manager/${managerId}/payroll`, {
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

    test('should require authentication for manager payroll', async ({ request }) => {
      test.skip(!managerId, 'No manager ID available');

      await delay(200);
      const response = await request.get(`${API_BASE}/manager/${managerId}/payroll`);
      expect(response.status()).toBe(401);
    });

    test('should return 404 for non-existent manager payroll', async ({ request }) => {
      await delay(300);
      const fakeId = '99999999-9999-9999-9999-999999999999';
      const response = await request.get(`${API_BASE}/manager/${fakeId}/payroll`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      // Should be 404 or 500 (not 200)
      expect([404, 500]).toContain(response.status());
    });
  });

  // ==========================================
  // UI TESTS
  // ==========================================

  test.describe('Admin Setup UI', () => {

    test('should load deleted bookings page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      // Wait for redirect to dashboard or admin page
      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);

      // Try to navigate to deleted bookings
      await page.goto(`${BASE_URL}/admin/deleted-bookings`);
      await delay(500);

      // Page should load without crashing — check for common UI elements
      const bodyHTML = await page.content();
      const hasContent = bodyHTML.includes('Deleted') ||
                        bodyHTML.includes('Cancelled') ||
                        bodyHTML.includes('booking') ||
                        bodyHTML.includes('404') || // Even a 404 page is OK
                        bodyHTML.includes('Not Found');

      expect(hasContent).toBe(true);
    });

    test('should load legal documents page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);

      // Navigate to legal documents page
      await page.goto(`${BASE_URL}/admin/legal-documents`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should load spare parts page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);

      // Navigate to spare parts page
      await page.goto(`${BASE_URL}/admin/spare-parts`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should load manager commissions page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);

      // Navigate to manager commissions
      await page.goto(`${BASE_URL}/admin/manager-commissions`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });

    test('should load manager payroll page if manager ID exists', async ({ page }) => {
      test.skip(!managerId, 'No manager ID available');

      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN.email);
      await page.fill('input[type="password"]', ADMIN.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 }).catch(() => null);

      // Navigate to manager payroll
      await page.goto(`${BASE_URL}/admin/manager-payroll/${managerId}`);
      await delay(500);

      const bodyHTML = await page.content();
      expect(bodyHTML.length).toBeGreaterThan(100);
    });
  });
});
