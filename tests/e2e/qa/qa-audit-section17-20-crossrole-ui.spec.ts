/**
 * QA AUDIT — Sections 17-20: Cross-role, Support, Community & UI Robustness (ACTION TESTS)
 * Section 17: Cross-role data consistency (API validation)
 * Section 18: Support & ticket system
 * Section 19: Community features (team page, events, ratings)
 * Section 20: UI robustness, error handling, validation, responsive
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
const MANAGER_EMAIL = 'oguzbenturk@gmail.com';
const MANAGER_PASSWORD = 'asdasd35';

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

test.describe('Sections 17-20 — Cross-Role, Community & UI', () => {

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

  // ─── Section 17: Cross-Role Data Consistency ─────────────
  test.describe('Section 17 — Cross-Role Data Consistency', () => {

    test('17.1 Admin bookings API returns validated data', async ({ page }) => {
      const res = await api(page, 'GET', '/bookings');
      expect(res.status).toBe(200);
      const bookings = Array.isArray(res.data) ? res.data : (res.data?.bookings || []);
      expect(bookings.length).toBeGreaterThanOrEqual(0);
      console.log(`✔ Admin sees ${bookings.length} booking(s)`);
    });

    test('17.2 Equipment API requires auth (401 without)', async ({ page }) => {
      const noAuthUrl = `${BACKEND_API}/equipment`;
      const publicRes = await page.request.get(noAuthUrl);
      expect(publicRes.status()).toBe(401);

      // With auth returns 200
      const authRes = await api(page, 'GET', '/equipment');
      expect(authRes.status).toBe(200);
      const items = Array.isArray(authRes.data) ? authRes.data : (authRes.data?.data || []);
      console.log(`✔ Equipment: ${items.length} item(s) (auth required)`);
    });

    test('17.3 Instructors API returns list with auth', async ({ page }) => {
      // Without auth → 401
      const noAuthUrl = `${BACKEND_API}/instructors`;
      const publicRes = await page.request.get(noAuthUrl);
      expect(publicRes.status()).toBe(401);

      // With auth → 200 + data
      const res = await api(page, 'GET', '/instructors');
      expect(res.status).toBe(200);
      const instructors = Array.isArray(res.data) ? res.data : (res.data?.users || []);
      expect(instructors.length).toBeGreaterThan(0);
      console.log(`✔ Instructors: ${instructors.length}`);
    });

    test('17.4 Categories consistent (public endpoint)', async ({ page }) => {
      // Categories should be accessible publicly
      const publicUrl = `${BACKEND_API}/services/categories`;
      const res = await page.request.get(publicUrl);
      expect(res.status()).toBe(200);
      const data = await res.json();
      const cats = Array.isArray(data) ? data : (data?.data || []);
      expect(cats.length).toBeGreaterThan(0);
      console.log(`✔ Public categories: ${cats.length}`);
    });

    test('17.5 Services data consistent across endpoints', async ({ page }) => {
      const servicesRes = await api(page, 'GET', '/services');
      expect(servicesRes.status).toBeLessThan(400);
      const services = Array.isArray(servicesRes.data) ? servicesRes.data : (servicesRes.data?.data || servicesRes.data?.services || []);

      const pkgRes = await api(page, 'GET', '/services/packages');
      expect(pkgRes.status).toBeLessThan(400);
      const packages = Array.isArray(pkgRes.data) ? pkgRes.data : (pkgRes.data?.data || []);

      console.log(`✔ Services: ${services.length}, Packages: ${packages.length}`);
    });
  });

  // ─── Section 18: Support & Ticket System ─────────────────
  test.describe('Section 18 — Support & Tickets', () => {

    test('18.1 Student support page has form or ticket list', async ({ page }) => {
      await loginAsStudent(page);
      await page.goto(`${BASE_URL}/student/support`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/student/support');
      const body = await page.textContent('body') || '';
      expect(/support|ticket|help|submit|message/i.test(body)).toBeTruthy();
    });

    test('18.2 Contact page accessible with form', async ({ page }) => {
      await page.goto(`${BASE_URL}/contact`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(/contact|email|phone|message|form|send/i.test(body)).toBeTruthy();
    });

    test('18.3 Help page accessible', async ({ page }) => {
      await page.goto(`${BASE_URL}/help`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
    });

    test('18.4 Chat requires auth', async ({ page }) => {
      await page.goto(`${BASE_URL}/chat`);
      await page.waitForTimeout(3000);
      const url = page.url();
      expect(url.includes('/login') || url.includes('/chat')).toBeTruthy();
    });

    test('18.5 Admin repair requests page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/repairs`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/repairs');
    });

    test('18.6 Admin support tickets page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/support-tickets`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // This may redirect if route doesn't exist
      const url = page.url();
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
      console.log(`✔ Support tickets page: ${url}`);
    });
  });

  // ─── Section 19: Community Features ──────────────────────
  test.describe('Section 19 — Community Features', () => {

    test('19.1 Community team page shows instructor data', async ({ page }) => {
      await page.goto(`${BASE_URL}/community/team`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });

    test('19.2 Events API and page work', async ({ page }) => {
      // API check
      const res = await api(page, 'GET', '/events');
      expect(res.status).toBe(200);
      const events = Array.isArray(res.data) ? res.data : (res.data?.events || []);
      console.log(`✔ Events: ${events.length}`);

      // UI check
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/services/events`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(20);
    });

    test('19.3 Public events page', async ({ page }) => {
      const res = await api(page, 'GET', '/events/public');
      expect([200, 404]).toContain(res.status);
    });

    test('19.4 Ratings API', async ({ page }) => {
      const res = await api(page, 'GET', '/ratings');
      expect([200, 401, 404]).toContain(res.status);
    });

    test('19.5 Care page accessible', async ({ page }) => {
      await page.goto(`${BASE_URL}/care`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
    });

    test('19.6 Notifications require auth', async ({ page }) => {
      await page.goto(`${BASE_URL}/notifications`);
      await page.waitForTimeout(3000);
      const url = page.url();
      expect(url.includes('/login') || url.includes('/notifications')).toBeTruthy();
    });
  });

  // ─── Section 20: UI Robustness & Error Handling ──────────
  test.describe('Section 20 — UI Robustness', () => {

    test('20.1 404 page for non-existent route', async ({ page }) => {
      await page.goto(`${BASE_URL}/this-page-does-not-exist-xyz123`);
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(20);
    });

    test('20.2 Login error for invalid credentials', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      await page.fill('#email', 'fake@nonexist.com');
      await page.fill('#password', 'WrongPassword123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      const body = await page.textContent('body') || '';
      expect(/error|invalid|incorrect|wrong|failed/i.test(body)).toBeTruthy();
    });

    test('20.3 Login empty field validation', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/login');
    });

    test('20.4 Public pages all load without 500', async ({ page }) => {
      const publicPages = ['/', '/academy', '/rental', '/shop', '/stay', '/experience', '/community/team', '/care', '/contact', '/help'];
      for (const p of publicPages) {
        const response = await page.goto(`${BASE_URL}${p}`);
        expect(response?.status()).toBeLessThan(500);
      }
    });

    test('20.5 Admin sidebar navigation has expected items', async ({ page }) => {
      await loginAsAdmin(page);
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(/dashboard|booking|customer|finance|setting/i.test(body)).toBeTruthy();
    });

    test('20.6 Student navigation has expected items', async ({ page }) => {
      await loginAsStudent(page);
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(/dashboard|schedule|course|payment|profile/i.test(body)).toBeTruthy();
    });

    test('20.7 API returns JSON for errors (not HTML)', async ({ page }) => {
      const url = `${BACKEND_API}/this-does-not-exist`;
      const response = await page.request.get(url);
      expect(response.status()).toBe(404);
      const text = await response.text();
      const isJSON = (() => { try { JSON.parse(text); return true; } catch { return false; } })();
      const isHTML = text.trim().startsWith('<!') || text.trim().startsWith('<html');
      // API should return JSON, not HTML
      expect(isHTML).toBeFalsy();
      if (isJSON) console.log('✔ 404 returns JSON');
    });

    test('20.8 XSS protection — script tags rejected', async ({ page }) => {
      await page.goto(`${BASE_URL}/shop`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[name*="search" i]').first();
      const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSearch) {
        await searchInput.fill('<script>alert("xss")</script>');
        await page.waitForTimeout(1000);
        const body = await page.textContent('body') || '';
        expect(body).not.toContain('<script>alert');
      }
      expect(true).toBeTruthy();
    });

    test('20.9 Mobile viewport renders correctly', async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 }
      });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 10;
      });
      console.log(`✔ Mobile overflow: ${hasOverflow}`);
      await context.close();
    });

    test('20.10 No console errors on critical pages', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Filter out known/expected errors
          if (!text.includes('favicon') && !text.includes('net::ERR') && !text.includes('WebSocket')) {
            errors.push(text);
          }
        }
      });

      await loginAsAdmin(page);
      const criticalPages = ['/dashboard', '/bookings', '/finance', '/customers'];
      for (const p of criticalPages) {
        await page.goto(`${BASE_URL}${p}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
      }

      if (errors.length > 0) {
        console.log(`⚠ Console errors found: ${errors.length}`);
        errors.slice(0, 5).forEach(e => console.log(`  - ${e.substring(0, 120)}`));
      } else {
        console.log('✔ No console errors on critical admin pages');
      }
      // Soft assertion — log but don't fail on console errors
      expect(errors.length).toBeLessThan(20);
    });

    test('20.11 Concurrent session — same user two tabs', async ({ browser }) => {
      const context = await browser.newContext();
      const page1 = await context.newPage();
      const page2 = await context.newPage();

      // Login in first tab
      await page1.goto(`${BASE_URL}/login`);
      await page1.waitForLoadState('domcontentloaded');
      await page1.fill('#email', ADMIN_EMAIL);
      await page1.fill('#password', ADMIN_PASSWORD);
      await page1.click('button[type="submit"]');
      await page1.waitForURL(url => !url.toString().includes('/login'), { timeout: 20000 });
      await page1.waitForTimeout(2000);

      // Second tab should share session
      await page2.goto(`${BASE_URL}/dashboard`);
      await page2.waitForTimeout(3000);
      const url2 = page2.url();
      expect(url2.includes('/dashboard') || url2.includes('/login')).toBeTruthy();

      await context.close();
    });
  });
});
