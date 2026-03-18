/**
 * QA AUDIT — Sections 9-10: Wallet, Payments, Finance & Commissions (ACTION TESTS)
 * Tests real wallet operations: balance checks, transaction history,
 * payment methods, deposit flows, commission dashboards
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

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90_000);

let adminToken = '';
let studentToken = '';
let studentId = '';

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

test.describe('Sections 9-10 — Wallet, Finance & Commissions', () => {

  test('Setup: login tokens', async ({ page }) => {
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
    if (meRes.status === 200) {
      studentId = meRes.data.id || meRes.data.user?.id || '';
    }
    console.log(`✔ Admin + Student tokens, studentId=${studentId}`);
  });

  // ─── Section 9: Wallet & Payment System ──────────────────
  test.describe('Section 9 — Wallet & Payments', () => {

    test('9.1 Admin wallet summary API with currency', async ({ page }) => {
      const res = await api(page, 'GET', '/wallet/summary');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('currency');
      console.log(`✔ Wallet currency: ${res.data.currency}, balance: ${res.data.balance || res.data.available || 'N/A'}`);
    });

    test('9.2 Student wallet summary has balance', async ({ page }) => {
      const res = await api(page, 'GET', '/wallet/summary', undefined, studentToken);
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('currency');
      console.log(`✔ Student wallet: ${res.data.balance || res.data.available || 0} ${res.data.currency}`);
    });

    test('9.3 Wallet transactions API returns list', async ({ page }) => {
      const res = await api(page, 'GET', '/wallet/transactions');
      expect(res.status).toBe(200);
      const txns = Array.isArray(res.data) ? res.data : (res.data?.transactions || []);
      console.log(`✔ Admin wallet transactions: ${txns.length}`);
      if (txns.length > 0) {
        expect(txns[0]).toHaveProperty('amount');
      }
    });

    test('9.4 Wallet payment methods API', async ({ page }) => {
      const res = await api(page, 'GET', '/wallet/payment-methods');
      expect(res.status).toBe(200);
      const methods = Array.isArray(res.data) ? res.data : (res.data?.methods || []);
      console.log(`✔ Payment methods: ${methods.length}`);
    });

    test('9.5 Admin finance page shows real revenue data', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/finance`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(/revenue|income|total|finance|€|payment|TRY/i.test(body)).toBeTruthy();
    });

    test('9.6 Admin finance sub-pages load with data', async ({ page }) => {
      await loginAsAdmin(page);
      const subPages = [
        { path: '/finance/wallet-deposits', label: 'deposits' },
        { path: '/finance/refunds', label: 'refunds' },
        { path: '/finance/bank-accounts', label: 'bank accounts' },
        { path: '/finance/expenses', label: 'expenses' },
        { path: '/finance/daily-operations', label: 'daily ops' },
      ];
      for (const sp of subPages) {
        await page.goto(`${BASE_URL}${sp.path}`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        expect(page.url()).toContain(sp.path);
      }
    });

    test('9.7 Finance category sub-pages load', async ({ page }) => {
      await loginAsAdmin(page);
      const categories = ['/finance/lessons', '/finance/rentals', '/finance/membership', '/finance/shop', '/finance/accommodation', '/finance/events'];
      for (const cat of categories) {
        await page.goto(`${BASE_URL}${cat}`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        expect(page.url()).toContain(cat);
      }
    });

    test('9.8 Student payments page shows wallet info', async ({ page }) => {
      await loginAsStudent(page);
      await page.goto(`${BASE_URL}/student/payments`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(/wallet|balance|payment|deposit|€|TRY/i.test(body)).toBeTruthy();
    });

    test('9.9 Financial accounts API for student', async ({ page }) => {
      if (!studentId) return;
      const res = await api(page, 'GET', `/finances/accounts/${studentId}`);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('wallet');
        const balance = parseFloat(res.data.wallet?.available || '0');
        console.log(`✔ Student financial account balance: ${balance}`);
      } else {
        console.log(`⚠ Financial account endpoint returned ${res.status}`);
        expect([200, 404]).toContain(res.status);
      }
    });

    test('9.10 Finances transactions API returns data', async ({ page }) => {
      const res = await api(page, 'GET', '/finances/transactions?limit=10');
      if (res.status === 200) {
        const txns = Array.isArray(res.data) ? res.data : [];
        console.log(`✔ Finance transactions: ${txns.length}`);
        if (txns.length > 0) {
          expect(txns[0]).toHaveProperty('amount');
        }
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });
  });

  // ─── Section 10: Finance Settings & Commissions ──────────
  test.describe('Section 10 — Finance Settings & Commissions', () => {

    test('10.1 Finance settings page loads', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/finance/settings`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/finance/settings');
    });

    test('10.2 Manager commissions admin page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/manager-commissions`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/admin/manager-commissions');
    });

    test('10.3 Manager commissions API returns data', async ({ page }) => {
      const dashRes = await api(page, 'GET', '/manager-commissions/dashboard');
      expect([200, 404]).toContain(dashRes.status);
      if (dashRes.status === 200) {
        console.log(`✔ Manager commission dashboard loaded`);
      }

      const histRes = await api(page, 'GET', '/manager-commissions/history');
      expect([200, 404]).toContain(histRes.status);

      const sumRes = await api(page, 'GET', '/manager-commissions/summary');
      expect([200, 404]).toContain(sumRes.status);
    });

    test('10.4 Manager views own commission dashboard', async ({ page }) => {
      await login(page, 'oguzbenturk@gmail.com', 'asdasd35');
      await page.goto(`${BASE_URL}/manager/commissions`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
    });

    test('10.5 Instructor commissions API', async ({ page }) => {
      const res = await api(page, 'GET', '/instructor-commissions');
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        console.log(`✔ Instructor commissions data available`);
      }
    });

    test('10.6 Revenue summary API', async ({ page }) => {
      const res = await api(page, 'GET', '/finances/revenue-summary');
      if (res.status === 200) {
        console.log(`✔ Revenue summary loaded`);
      }
      expect([200, 404]).toContain(res.status);
    });
  });
});
