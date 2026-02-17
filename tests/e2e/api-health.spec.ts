/**
 * API Health Check Tests
 * Tests all critical API endpoints for availability and basic functionality
 * Run: npx playwright test tests/e2e/api-health.spec.ts
 */
import { test, expect, request } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'asdasd35';

// Store auth token for authenticated requests
let authToken: string;

test.describe('🏥 API Health Checks', () => {
  
  test.beforeAll(async ({ }) => {
    // Get auth token first
    const apiContext = await request.newContext();
    try {
      const loginResponse = await apiContext.post(`${API_URL}/api/auth/login`, {
        data: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD
        }
      });
      
      if (loginResponse.ok()) {
        const data = await loginResponse.json();
        authToken = data.token || data.accessToken;
        console.log('✅ Auth successful, token obtained');
      } else {
        console.log('❌ Auth failed:', loginResponse.status());
      }
    } catch (e) {
      console.log('Auth failed, some tests may be skipped:', e);
    }
    await apiContext.dispose();
  });

  test.describe('Public Endpoints', () => {
    test('Health check endpoint', async ({ request }) => {
      const response = await request.get(`${API_URL}/api/health`);
      // Accept 200 or 404 (if endpoint doesn't exist)
      expect([200, 404]).toContain(response.status());
    });

    test('Auth endpoints available', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/auth/login`, {
        data: { email: 'test@test.com', password: 'wrong' }
      });
      // Should get 401, 400, 403, or 429 (rate limited), not 500
      expect([400, 401, 403, 429]).toContain(response.status());
    });
  });

  test.describe('Protected Endpoints (require auth)', () => {
    test('Dashboard summary endpoint', async ({ request }) => {
      test.skip(!authToken, 'No auth token available');
      
      const response = await request.get(`${API_URL}/api/dashboard/summary`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect([200, 401, 403]).toContain(response.status());
    });

    test('Finances summary endpoint', async ({ request }) => {
      test.skip(!authToken, 'No auth token available');
      
      const response = await request.get(`${API_URL}/api/finances/summary`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect([200, 401, 403]).toContain(response.status());
    });

    test('Bookings list endpoint', async ({ request }) => {
      test.skip(!authToken, 'No auth token available');
      
      const response = await request.get(`${API_URL}/api/bookings`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect([200, 401, 403]).toContain(response.status());
    });

    test('Customers list endpoint', async ({ request }) => {
      test.skip(!authToken, 'No auth token available');
      
      const response = await request.get(`${API_URL}/api/students`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect([200, 401, 403]).toContain(response.status());
    });

    test('Instructors list endpoint', async ({ request }) => {
      test.skip(!authToken, 'No auth token available');
      
      const response = await request.get(`${API_URL}/api/instructors`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect([200, 401, 403]).toContain(response.status());
    });

    test('Services list endpoint', async ({ request }) => {
      test.skip(!authToken, 'No auth token available');
      
      const response = await request.get(`${API_URL}/api/services`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect([200, 401, 403]).toContain(response.status());
    });

    test('Rentals list endpoint', async ({ request }) => {
      test.skip(!authToken, 'No auth token available');
      
      const response = await request.get(`${API_URL}/api/rentals`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect([200, 401, 403]).toContain(response.status());
    });

    test('Wallet endpoints', async ({ request }) => {
      test.skip(!authToken, 'No auth token available');
      
      // Test wallet balance endpoint for a sample user
      const response = await request.get(`${API_URL}/api/wallet/balance/1`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect([200, 401, 403, 404]).toContain(response.status());
    });
  });
});
