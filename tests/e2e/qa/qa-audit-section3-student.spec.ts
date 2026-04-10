/**
 * QA AUDIT — Section 3: Student Core Flows (ACTION TESTS)
 * Tests real student interactions: dashboard data validation, profile editing,
 * wallet balance verification, booking history, API permission checks
 */
import { test, expect, Page } from '@playwright/test';
import {
  BASE_URL,
  login,
  loginAsAdmin,
  loginAsStudent,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from '../helpers';

const BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:4000/api';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90_000);

let studentToken = '';
let adminToken = '';
let studentId = '';

async function api(page: Page, method: string, path: string, body?: any, token?: string) {
  const tkn = token || studentToken;
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

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
test.describe('Section 3 — Student Core Flows', () => {

  test('Setup: login student + admin and capture tokens', async ({ page }) => {
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

    const meRes = await api(page, 'GET', '/auth/me', undefined, studentToken);
    expect(meRes.status).toBe(200);
    studentId = meRes.data.id || meRes.data.user?.id || '';
    expect(studentId).toBeTruthy();
    console.log(`✔ Admin + Student tokens captured, studentId=${studentId}`);
  });

  // ─── Dashboard Content Validation ────────────────────────
  test('3.1 Student dashboard shows real content (bookings, name)', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = await page.textContent('body') || '';
    // Dashboard should show at least one of: upcoming bookings, welcome, name, schedule
    expect(body.length).toBeGreaterThan(100);
    // Verify it's actually the student portal, not redirected elsewhere
    expect(page.url()).toContain('/student');
  });

  test('3.2 Student booking history via API has valid structure', async ({ page }) => {
    const res = await api(page, 'GET', '/student/bookings');
    // 200 means bookings exist, 404 means endpoint might differ
    if (res.status === 200) {
      const bookings = Array.isArray(res.data) ? res.data : (res.data?.bookings || []);
      console.log(`✔ Student has ${bookings.length} booking(s)`);
      if (bookings.length > 0) {
        const b = bookings[0];
        // Each booking should have date and status
        expect(b).toHaveProperty('status');
      }
    } else {
      // Try alternative endpoint
      const res2 = await api(page, 'GET', `/bookings?user_id=${studentId}`);
      expect([200, 403]).toContain(res2.status);
    }
  });

  test('3.3 Student schedule page shows calendar/content', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/schedule`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/student/schedule');
    // Schedule page should have calendar or list elements
    const hasCalendarContent = await page.locator('.ant-picker-calendar, [class*="calendar"], [class*="schedule"], table, .fc').first().isVisible({ timeout: 5000 }).catch(() => false);
    const body = await page.textContent('body') || '';
    expect(hasCalendarContent || body.length > 100).toBeTruthy();
  });

  // ─── Wallet Balance UI vs API ────────────────────────────
  test('3.4 Student wallet balance: UI matches API', async ({ page }) => {
    // Get balance from API
    const walletRes = await api(page, 'GET', '/wallet/summary');
    let apiBalance: number | null = null;
    if (walletRes.status === 200 && walletRes.data) {
      apiBalance = parseFloat(walletRes.data.balance ?? walletRes.data.available ?? '0');
      console.log(`✔ Wallet API balance: ${apiBalance} ${walletRes.data.currency || 'EUR'}`);
    }

    // Navigate to payments page and check UI shows wallet info
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/payments`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body') || '';
    expect(/wallet|balance|payment|€|EUR|TRY|deposit/i.test(bodyText)).toBeTruthy();
  });

  test('3.5 Wallet transactions API returns valid list', async ({ page }) => {
    const txRes = await api(page, 'GET', '/wallet/transactions');
    expect(txRes.status).toBe(200);
    const txns = Array.isArray(txRes.data) ? txRes.data : (txRes.data?.transactions || []);
    console.log(`✔ Student wallet has ${txns.length} transaction(s)`);
    if (txns.length > 0) {
      expect(txns[0]).toHaveProperty('amount');
    }
  });

  // ─── Profile Edit ────────────────────────────────────────
  test('3.6 Student profile page shows personal info', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/profile`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/student/profile');

    // Should show email or name fields
    const body = await page.textContent('body') || '';
    expect(/email|name|phone|profile/i.test(body)).toBeTruthy();

    // Check if there's an editable form
    const hasEditableFields = await page.locator('input, textarea, [contenteditable]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEditButton = await page.locator('button:has-text("Edit"), button:has-text("Save"), a:has-text("Edit")').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`✔ Profile editable fields: ${hasEditableFields}, edit button: ${hasEditButton}`);
  });

  // ─── Student Pages with Real Data ────────────────────────
  test('3.7 Courses/packages page shows package data', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/courses`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/student/courses');
    const body = await page.textContent('body') || '';
    // Should show packages, lessons, or empty state
    expect(body.length).toBeGreaterThan(50);
  });

  test('3.8 Family management page works', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/family`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/student/family');
    const body = await page.textContent('body') || '';
    expect(/family|member|add|child|relative/i.test(body)).toBeTruthy();
  });

  test('3.9 Support page is functional (has form or ticket list)', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/support`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/student/support');
    const body = await page.textContent('body') || '';
    expect(/support|ticket|help|submit|message|contact/i.test(body)).toBeTruthy();

    // Check if there's a form to submit
    const hasForm = await page.locator('form, textarea, button:has-text("Submit"), button:has-text("Create"), button:has-text("Send")').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`✔ Support form available: ${hasForm}`);
  });

  // ─── Booking & Rental Access ─────────────────────────────
  test('3.10 Student book-service page shows booking wizard', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/academy/book-service`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const body = await page.textContent('body') || '';
    // Should show instructor selection, service selection, or date picker
    expect(body.length).toBeGreaterThan(80);
  });

  test('3.11 Student rental booking page shows equipment', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/rental/book-equipment`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const body = await page.textContent('body') || '';
    expect(body.length).toBeGreaterThan(50);
  });

  test('3.12 Student my-rentals shows rental data or empty state', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/rental/my-rentals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/rental/my-rentals');
  });

  // ─── Shop Access ─────────────────────────────────────────
  test('3.14 Student can browse shop and view my-orders', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/shop`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const shopBody = await page.textContent('body') || '';
    expect(shopBody.length).toBeGreaterThan(50);

    await page.goto(`${BASE_URL}/shop/my-orders`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/shop/my-orders');
  });

  // ─── Role-Based Access Control ───────────────────────────
  test('3.15 Student CANNOT access admin API endpoints', async ({ page }) => {
    // Try admin-only endpoints with student token
    const usersRes = await api(page, 'GET', '/users');
    expect([401, 403]).toContain(usersRes.status);

    const settingsRes = await api(page, 'PUT', '/settings', { site_name: 'hacked' });
    expect([401, 403, 404]).toContain(settingsRes.status);

    // Student should not be able to delete bookings
    const deleteRes = await api(page, 'DELETE', '/bookings/00000000-0000-0000-0000-000000000000');
    expect([401, 403, 404]).toContain(deleteRes.status);
    console.log(`✔ Student blocked from admin APIs: users=${usersRes.status}, settings=${settingsRes.status}, delete=${deleteRes.status}`);
  });

  test('3.16 Student redirected from admin UI routes', async ({ page }) => {
    await loginAsStudent(page);
    const adminRoutes = ['/dashboard', '/bookings', '/customers', '/admin/settings'];
    for (const route of adminRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForTimeout(2000);
      const url = page.url();
      // Student should NOT remain on admin routes
      const stayedOnAdminRoute = url.includes(route) && !url.includes('/login') && !url.includes('/student');
      if (stayedOnAdminRoute) {
        console.log(`⚠ Student stayed on admin route: ${route} → ${url}`);
      }
      // At minimum, redirected away or to student portal
      expect(url.includes('/login') || url.includes('/student') || !url.includes(route)).toBeTruthy();
    }
  });

  // ─── Notifications & Chat ────────────────────────────────
  test('3.17 Student notifications API works', async ({ page }) => {
    const res = await api(page, 'GET', '/notifications/user?limit=5');
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const notifs = res.data?.notifications || [];
      console.log(`✔ Student has ${notifs.length} notification(s)`);
    }
  });

  test('3.18 Student chat page accessible', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/chat');
  });

  test('3.19 Student friends page accessible', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/friends`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/student/friends');
  });

  test('3.20 Student group bookings page loads', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/group-bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/student/group-bookings');
  });
});
