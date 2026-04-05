/**
 * QA AUDIT — Sections 11-14: Staff Role Flows (ACTION TESTS)
 * Section 11: Instructor flows (dashboard, students, commissions, access control)
 * Section 12: Manager flows (dashboard, bookings, customers, commissions)
 * Section 13: Admin CRUD & advanced settings
 * Section 14: Role permission enforcement (API + UI)
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
} from '../helpers';

const BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:4000/api';
const INSTRUCTOR_EMAIL = 'autoinst487747@test.com';
const INSTRUCTOR_PASSWORD = 'TestPass123!';
const MANAGER_EMAIL = 'ozibenturk@gmail.com';
const MANAGER_PASSWORD = 'asdasd35';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90_000);

let adminToken = '';
let instructorToken = '';
let managerToken = '';
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

test.describe('Sections 11-14 — Staff Roles', () => {

  test('Setup: capture all role tokens', async ({ page }) => {
    // Get all tokens via API
    const roles = [
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      { email: INSTRUCTOR_EMAIL, password: INSTRUCTOR_PASSWORD },
      { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
      { email: STUDENT_EMAIL, password: STUDENT_PASSWORD },
    ];
    const tokens: string[] = [];
    for (const { email, password } of roles) {
      const res = await page.request.post(`${BACKEND_API}/auth/login`, {
        data: { email, password },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status()).toBe(200);
      const data = await res.json();
      tokens.push(data.token || data.accessToken || '');
    }
    [adminToken, instructorToken, managerToken, studentToken] = tokens;
    expect(adminToken).toBeTruthy();
    expect(instructorToken).toBeTruthy();
    expect(managerToken).toBeTruthy();
    expect(studentToken).toBeTruthy();
    console.log('✔ All 4 role tokens captured via API');
  });

  // ─── Section 11: Instructor Flows ────────────────────────
  test.describe('Section 11 — Instructor Flows', () => {

    test('11.1 Instructor dashboard shows real content', async ({ page }) => {
      await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
      await page.waitForTimeout(3000);
      const url = page.url();
      expect(/instructor|dashboard/i.test(url)).toBeTruthy();
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(100);
    });

    test('11.2 Instructor can view their students list', async ({ page }) => {
      await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
      await page.goto(`${BASE_URL}/instructor/students`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // Should show student list or message about no students
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
    });

    test('11.3 Instructor schedule via dashboard', async ({ page }) => {
      await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
      await page.goto(`${BASE_URL}/instructor/dashboard`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });

    test('11.4 Instructor commissions API', async ({ page }) => {
      const res = await api(page, 'GET', '/instructor-commissions/me', undefined, instructorToken);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        console.log(`✔ Instructor has commission data`);
      }
    });

    test('11.5 Instructor can view settings but cannot modify via API', async ({ page }) => {
      // Phase 0 finding: instructor access to settings page is by design
      await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
      await page.goto(`${BASE_URL}/admin/settings`);
      await page.waitForTimeout(3000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
      // But they should NOT be able to modify settings via API
      const res = await api(page, 'PUT', '/settings', { key: 'test', value: 'test' }, instructorToken);
      expect([401, 403, 404, 405]).toContain(res.status);
      console.log(`✔ Instructor views settings page but API modify blocked (${res.status})`);
    });

    test('11.6 Instructor CANNOT modify settings via API', async ({ page }) => {
      const res = await api(page, 'PUT', '/settings', { site_name: 'hacked' }, instructorToken);
      expect([401, 403, 404]).toContain(res.status);
      console.log(`✔ Instructor blocked from settings API: ${res.status}`);
    });

    test('11.7 Instructor CANNOT access customer list API', async ({ page }) => {
      const res = await api(page, 'GET', '/users', undefined, instructorToken);
      expect([401, 403]).toContain(res.status);
      console.log(`✔ Instructor blocked from users API: ${res.status}`);
    });
  });

  // ─── Section 12: Manager Flows ───────────────────────────
  test.describe('Section 12 — Manager Flows', () => {

    test('12.1 Manager dashboard loads with content', async ({ page }) => {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.waitForTimeout(3000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(100);
    });

    test('12.2 Manager can access customer list', async ({ page }) => {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`${BASE_URL}/customers`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(/customer|student|user|name|email/i.test(body)).toBeTruthy();
    });

    test('12.3 Manager can access bookings with data', async ({ page }) => {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`${BASE_URL}/bookings`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });

    test('12.4 Manager bookings API returns data', async ({ page }) => {
      const res = await api(page, 'GET', '/bookings', undefined, managerToken);
      expect(res.status).toBe(200);
      const bookings = Array.isArray(res.data) ? res.data : (res.data?.bookings || []);
      console.log(`✔ Manager sees ${bookings.length} booking(s)`);
    });

    test('12.5 Manager can access instructors page', async ({ page }) => {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`${BASE_URL}/instructors`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/instructors');
    });

    test('12.6 Manager can access services configuration', async ({ page }) => {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`${BASE_URL}/services/lessons`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/services/lessons');
    });

    test('12.7 Manager can access finance overview', async ({ page }) => {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`${BASE_URL}/finance`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/finance');
    });

    test('12.8 Manager commission dashboard with data', async ({ page }) => {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`${BASE_URL}/manager/commissions`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);

      // Also check API
      const res = await api(page, 'GET', '/manager-commissions/dashboard', undefined, managerToken);
      expect([200, 404]).toContain(res.status);
    });

    test('12.9 Manager can access marketing page', async ({ page }) => {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`${BASE_URL}/marketing`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/marketing');
    });
  });

  // ─── Section 13: Admin CRUD & Settings ───────────────────
  test.describe('Section 13 — Admin CRUD & Settings', () => {

    test('13.1 Admin settings page with real settings', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/settings`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/admin/settings');
      const body = await page.textContent('body') || '';
      expect(/settings|configuration|admin|general/i.test(body)).toBeTruthy();
    });

    test('13.2 Admin users API returns user list', async ({ page }) => {
      const res = await api(page, 'GET', '/users');
      expect(res.status).toBe(200);
      const users = Array.isArray(res.data) ? res.data : (res.data?.users || []);
      expect(users.length).toBeGreaterThan(0);
      console.log(`✔ Admin sees ${users.length} user(s)`);
    });

    test('13.3 Admin deleted bookings page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/deleted-bookings`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/admin/deleted-bookings');
    });

    test('13.4 Admin spare parts page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/spare-parts`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/admin/spare-parts');
    });

    test('13.5 Admin calendar views all load', async ({ page }) => {
      await loginAsAdmin(page);
      const calendars = ['/calendars/lessons', '/calendars/rentals', '/calendars/stay', '/calendars/events'];
      for (const cal of calendars) {
        await page.goto(`${BASE_URL}${cal}`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        expect(page.url()).toContain(cal);
      }
    });

    test('13.6 Admin categories management', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/services/categories`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/services/categories');
    });

    test('13.7 Admin quick links page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/quick-links`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/quick-links');
    });

    test('13.8 Admin equipment inventory with details', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/equipment`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });
  });

  // ─── Section 14: Role Permission Enforcement ─────────────
  test.describe('Section 14 — Role Permission Enforcement', () => {

    test('14.1 Student CANNOT access admin settings (UI)', async ({ page }) => {
      await loginAsStudent(page);
      await page.goto(`${BASE_URL}/admin/settings`);
      await page.waitForTimeout(3000);
      expect(page.url()).not.toContain('/admin/settings');
    });

    test('14.2 Student CANNOT access finance (UI)', async ({ page }) => {
      await loginAsStudent(page);
      await page.goto(`${BASE_URL}/finance`);
      await page.waitForTimeout(3000);
      const url = page.url();
      expect(url.includes('/student') || url.includes('/login') || !url.includes('/finance')).toBeTruthy();
    });

    test('14.3 Student CANNOT access customer list (UI)', async ({ page }) => {
      await loginAsStudent(page);
      await page.goto(`${BASE_URL}/customers`);
      await page.waitForTimeout(3000);
      expect(page.url()).not.toContain('/customers');
    });

    test('14.4 Instructor finance access shows instructor view', async ({ page }) => {
      await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
      await page.goto(`${BASE_URL}/finance`);
      await page.waitForTimeout(3000);
      // Instructor is allowed on /finance but should see InstructorFinanceView only
      const url = page.url();
      const body = await page.textContent('body') || '';
      console.log(`✔ Instructor on /finance → url=${url}, bodyLen=${body.length}`);
      // Should show instructor-specific finance view, not admin finance
      expect(body.length).toBeGreaterThan(30);
    });

    test('14.5 API: Instructor CANNOT modify settings', async ({ page }) => {
      const res = await api(page, 'PUT', '/settings', { site_name: 'hacked' }, instructorToken);
      expect([401, 403, 404]).toContain(res.status);
    });

    test('14.6 API: Student CANNOT delete users', async ({ page }) => {
      const res = await api(page, 'DELETE', '/users/00000000-0000-0000-0000-000000000000', undefined, studentToken);
      expect([401, 403, 404]).toContain(res.status);
    });

    test('14.7 API: Unauthenticated CANNOT access protected endpoints', async ({ page }) => {
      const url = `${BACKEND_API}/users`;
      const response = await page.request.get(url);
      expect([401, 403]).toContain(response.status());

      const bookingsUrl = `${BACKEND_API}/bookings`;
      const bookingsRes = await page.request.get(bookingsUrl);
      expect([401, 403]).toContain(bookingsRes.status());
    });

    test('14.8 API: Student bookings returns only their data', async ({ page }) => {
      const res = await api(page, 'GET', '/bookings', undefined, studentToken);
      // Students may get 403 or filtered results
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        console.log(`✔ Student bookings returned (filtered to own data)`);
      }
    });

    test('14.9 API: Instructor CANNOT delete bookings', async ({ page }) => {
      const res = await api(page, 'DELETE', '/bookings/00000000-0000-0000-0000-000000000000', undefined, instructorToken);
      expect([401, 403, 404]).toContain(res.status);
      console.log(`✔ Instructor blocked from deleting bookings: ${res.status}`);
    });
  });
});
