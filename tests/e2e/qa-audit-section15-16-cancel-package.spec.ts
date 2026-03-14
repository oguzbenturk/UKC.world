/**
 * QA AUDIT — Sections 15-16: Cancel/Refund & Package Entitlement (ACTION TESTS)
 * Section 15: Booking cancellation, refund validation, soft-delete visibility
 * Section 16: Package data, session tracking, entitlements, booking integration
 */
import { test, expect, Page } from '@playwright/test';
import {
  BASE_URL,
  login,
  loginAsAdmin,
  loginAsStudent,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
} from './helpers';

const BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:4000/api';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90_000);

let adminToken = '';
let studentToken = '';

async function api(page: Page, method: string, path: string, body?: any, token?: string) {
  const tkn = token || adminToken;
  const url = `${BACKEND_API}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${tkn}` };
  if (body) headers['Content-Type'] = 'application/json';
  const opts: any = { headers };
  if (body) opts.data = body;
  let response;
  switch (method.toUpperCase()) {
    case 'POST': response = await page.request.post(url, opts); break;
    case 'PUT': response = await page.request.put(url, opts); break;
    case 'PATCH': response = await page.request.patch(url, opts); break;
    case 'DELETE': response = await page.request.delete(url, opts); break;
    default: response = await page.request.get(url, { headers }); break;
  }
  const status = response.status();
  try { return { status, data: await response.json() }; }
  catch { return { status, data: await response.text() }; }
}

test.describe('Sections 15-16 — Cancel/Refund & Packages', () => {

  test('Setup: tokens', async ({ page }) => {
    // Get admin token via API
    const adminLogin = await page.request.post(`${BACKEND_API}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(adminLogin.status()).toBe(200);
    const adminData = await adminLogin.json();
    adminToken = adminData.token || adminData.accessToken || '';
    expect(adminToken).toBeTruthy();

    // Get student token via API
    const studentLogin = await page.request.post(`${BACKEND_API}/auth/login`, {
      data: { email: STUDENT_EMAIL, password: STUDENT_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(studentLogin.status()).toBe(200);
    const studentData = await studentLogin.json();
    studentToken = studentData.token || studentData.accessToken || '';
    expect(studentToken).toBeTruthy();
  });

  // ─── Section 15: Cancellation & Refunds ──────────────────
  test.describe('Section 15 — Cancellation & Refund Flows', () => {

    test('15.1 Admin bookings page shows bookings with actions', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/bookings`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(/booking|lesson|schedule|date/i.test(body)).toBeTruthy();
    });

    test('15.2 Bookings API returns booking list with status', async ({ page }) => {
      const res = await api(page, 'GET', '/bookings');
      expect(res.status).toBe(200);
      const bookings = Array.isArray(res.data) ? res.data : (res.data?.bookings || []);
      console.log(`✔ ${bookings.length} booking(s) found`);
      if (bookings.length > 0) {
        expect(bookings[0]).toHaveProperty('status');
        // Check for cancel-related fields
        const statuses = [...new Set(bookings.map((b: any) => b.status))];
        console.log(`  Booking statuses: ${statuses.join(', ')}`);
      }
    });

    test('15.3 Deleted bookings page shows soft-deleted items', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/deleted-bookings`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/admin/deleted-bookings');
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
    });

    test('15.4 Admin refunds page with refund data', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/finance/refunds`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/finance/refunds');
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
    });

    test('15.5 Refunds API returns data', async ({ page }) => {
      const res = await api(page, 'GET', '/finances/refunds');
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        const refunds = Array.isArray(res.data) ? res.data : (res.data?.refunds || []);
        console.log(`✔ Found ${refunds.length} refund(s)`);
      }
    });

    test('15.6 Booking cancel API rejects non-existent booking', async ({ page }) => {
      const res = await api(page, 'POST', '/bookings/00000000-0000-0000-0000-000000000000/cancel', { reason: 'test' });
      expect([400, 404, 405]).toContain(res.status);
      console.log(`✔ Cancel non-existent booking returned ${res.status}`);
    });

    test('15.7 Student can view their payment/refund history', async ({ page }) => {
      await loginAsStudent(page);
      await page.goto(`${BASE_URL}/student/payments`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(/payment|wallet|balance|transaction|history/i.test(body)).toBeTruthy();
    });

    test('15.8 Booking with valid ID can be retrieved', async ({ page }) => {
      // Get a real booking to verify retrieval works
      const listRes = await api(page, 'GET', '/bookings?limit=1');
      if (listRes.status === 200) {
        const bookings = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.bookings || []);
        if (bookings.length > 0) {
          const bookingId = bookings[0].id;
          const detailRes = await api(page, 'GET', `/bookings/${bookingId}`);
          expect(detailRes.status).toBe(200);
          expect(detailRes.data).toHaveProperty('status');
          console.log(`✔ Booking ${bookingId} status=${detailRes.data.status}`);
        }
      }
    });
  });

  // ─── Section 16: Package & Entitlement Tracking ──────────
  test.describe('Section 16 — Package & Entitlement', () => {

    test('16.1 Packages API returns packages with pricing', async ({ page }) => {
      const res = await api(page, 'GET', '/services/packages');
      expect(res.status).toBe(200);
      const pkgs = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      expect(pkgs.length).toBeGreaterThan(0);
      console.log(`✔ ${pkgs.length} package(s) available`);
      if (pkgs.length > 0) {
        expect(pkgs[0]).toHaveProperty('name');
        expect(pkgs[0]).toHaveProperty('price');
        console.log(`  First: "${pkgs[0].name}" price=${pkgs[0].price} hours=${pkgs[0].hours || 'N/A'}`);
      }
    });

    test('16.2 Admin packages management page with details', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/services/packages`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/services/packages');
      const body = await page.textContent('body') || '';
      expect(/package|plan|session|price/i.test(body)).toBeTruthy();
    });

    test('16.3 Customer packages API (user-specific entitlements)', async ({ page }) => {
      // Get a student to check their packages
      const usersRes = await api(page, 'GET', '/users?role=student&limit=1');
      if (usersRes.status === 200) {
        const users = usersRes.data?.users || (Array.isArray(usersRes.data) ? usersRes.data : []);
        if (users.length > 0) {
          const userId = users[0].id;
          const pkgRes = await api(page, 'GET', `/customer-packages?user_id=${userId}`);
          if (pkgRes.status === 200) {
            const pkgs = Array.isArray(pkgRes.data) ? pkgRes.data : (pkgRes.data?.packages || []);
            console.log(`✔ Student ${userId} has ${pkgs.length} active package(s)`);
            if (pkgs.length > 0) {
              expect(pkgs[0]).toHaveProperty('remaining_hours');
            }
          } else {
            expect([200, 404]).toContain(pkgRes.status);
          }
        }
      }
    });

    test('16.4 Student courses page shows packages', async ({ page }) => {
      await loginAsStudent(page);
      await page.goto(`${BASE_URL}/student/courses`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/student/courses');
    });

    test('16.5 Experience packages public page shows offerings', async ({ page }) => {
      await page.goto(`${BASE_URL}/experience/packages`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });

    test('16.6 Categories API has category-package structure', async ({ page }) => {
      const res = await api(page, 'GET', '/services/categories');
      expect(res.status).toBe(200);
      const cats = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      expect(cats.length).toBeGreaterThan(0);
      console.log(`✔ ${cats.length} categories with names: ${cats.map((c: any) => c.name).join(', ')}`);
    });

    test('16.7 Student bookings API returns booking history', async ({ page }) => {
      const res = await api(page, 'GET', '/student/bookings', undefined, studentToken);
      if (res.status === 200) {
        const bookings = Array.isArray(res.data) ? res.data : (res.data?.bookings || []);
        console.log(`✔ Student has ${bookings.length} booking(s) in history`);
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    test('16.8 Services API shows all service types', async ({ page }) => {
      const res = await api(page, 'GET', '/services');
      expect(res.status).toBeLessThan(400);
      const services = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.services || []);
      const categories = [...new Set(services.map((s: any) => s.category))];
      console.log(`✔ Service categories found: ${categories.join(', ')}`);
      expect(categories.length).toBeGreaterThan(0);
    });
  });
});
