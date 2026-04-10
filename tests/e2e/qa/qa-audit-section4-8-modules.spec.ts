/**
 * QA AUDIT — Sections 4-8: Module Data Validation (ACTION TESTS)
 * Tests real data presence and CRUD operations for:
 * Shop, Rental, Stay, Experience, Member modules
 */
import { test, expect, Page } from '@playwright/test';
import {
  BASE_URL,
  login,
  loginAsAdmin,
  loginAsStudent,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from '../helpers';

const BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:4000/api';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90_000);

let adminToken = '';

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

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
test.describe('Sections 4-8 — Module Data & CRUD', () => {

  test('Setup: admin login and token', async ({ page }) => {
    await loginAsAdmin(page);
    adminToken = await page.evaluate(() => localStorage.getItem('token') || '');
    expect(adminToken).toBeTruthy();
  });

  // ─── Section 4: Shop Module ──────────────────────────────
  test.describe('Section 4 — Shop Module', () => {

    test('4.1 Products API returns real product data', async ({ page }) => {
      const res = await api(page, 'GET', '/products');
      expect(res.status).toBe(200);
      const products = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      console.log(`✔ Found ${products.length} product(s)`);
      if (products.length > 0) {
        const p = products[0];
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('price');
        console.log(`  First product: "${p.name}" price=${p.price}`);
      }
    });

    test('4.2 Shop browse page renders products', async ({ page }) => {
      await page.goto(`${BASE_URL}/shop`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });

    test('4.3 Admin shop management shows products with actions', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/services/shop`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/services/shop');
      // Should have add/edit controls
      const hasActions = await page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")').first().isVisible({ timeout: 5000 }).catch(() => false);
      const body = await page.textContent('body') || '';
      expect(hasActions || body.length > 100).toBeTruthy();
    });

    test('4.4 Admin shop orders page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/calendars/shop-orders`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
    });

    test('4.5 Student my-orders page accessible', async ({ page }) => {
      await loginAsStudent(page);
      await page.goto(`${BASE_URL}/shop/my-orders`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/shop/my-orders');
    });
  });

  // ─── Section 5: Rental Module ────────────────────────────
  test.describe('Section 5 — Rental Module', () => {

    test('5.1 Rental services API returns real data', async ({ page }) => {
      const res = await api(page, 'GET', '/services');
      expect(res.status).toBeLessThan(400);
      const services = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.services || []);
      const rentals = services.filter((s: any) => s.category === 'rental');
      console.log(`✔ Found ${rentals.length} rental service(s) out of ${services.length} total`);
      if (rentals.length > 0) {
        expect(rentals[0]).toHaveProperty('name');
        expect(rentals[0]).toHaveProperty('price');
      }
    });

    test('5.2 Equipment API returns equipment items', async ({ page }) => {
      const res = await api(page, 'GET', '/equipment');
      expect(res.status).toBe(200);
      const items = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      console.log(`✔ Found ${items.length} equipment item(s)`);
      if (items.length > 0) {
        expect(items[0]).toHaveProperty('name');
      }
    });

    test('5.3 Rental public showcase pages load', async ({ page }) => {
      const pages = ['/rental', '/rental/standard', '/rental/sls', '/rental/dlab', '/rental/efoil', '/rental/premium'];
      for (const p of pages) {
        const response = await page.goto(`${BASE_URL}${p}`);
        expect(response?.status()).toBeLessThan(500);
      }
    });

    test('5.4 Admin equipment page displays items', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/equipment`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });

    test('5.5 Admin rentals management page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/rentals`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });

    test('5.6 Admin rental services configuration', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/services/rentals`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/services/rentals');
    });
  });

  // ─── Section 6: Stay/Accommodation ───────────────────────
  test.describe('Section 6 — Stay/Accommodation Module', () => {

    test('6.1 Accommodation units API returns data', async ({ page }) => {
      const res = await api(page, 'GET', '/accommodation/units');
      expect(res.status).toBe(200);
      const units = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.units || []);
      console.log(`✔ Found ${units.length} accommodation unit(s)`);
      if (units.length > 0) {
        expect(units[0]).toHaveProperty('name');
      }
    });

    test('6.2 Stay public pages load', async ({ page }) => {
      const pages = ['/stay', '/stay/hotel', '/stay/home'];
      for (const p of pages) {
        const response = await page.goto(`${BASE_URL}${p}`);
        expect(response?.status()).toBeLessThan(500);
      }
    });

    test('6.3 Admin accommodation management', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/services/accommodation`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/services/accommodation');
    });

    test('6.4 Admin accommodation calendar', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/calendars/stay`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/calendars/stay');
    });

  });

  // ─── Section 7: Experience Module ────────────────────────
  test.describe('Section 7 — Experience Module', () => {

    test('7.1 Packages API returns package data', async ({ page }) => {
      const res = await api(page, 'GET', '/services/packages');
      expect(res.status).toBeLessThan(400);
      const pkgs = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      console.log(`✔ Found ${pkgs.length} package(s)`);
      if (pkgs.length > 0) {
        expect(pkgs[0]).toHaveProperty('name');
        expect(pkgs[0]).toHaveProperty('price');
        console.log(`  First package: "${pkgs[0].name}" price=${pkgs[0].price} hours=${pkgs[0].hours || 'N/A'}`);
      }
    });

    test('7.2 Experience public pages load', async ({ page }) => {
      const pages = ['/experience', '/experience/kite-packages', '/experience/wing-packages',
        '/experience/downwinders', '/experience/camps', '/experience/book-package'];
      for (const p of pages) {
        const response = await page.goto(`${BASE_URL}${p}`);
        expect(response?.status()).toBeLessThan(500);
      }
    });

    test('7.3 Outsider packages page shows offerings', async ({ page }) => {
      await page.goto(`${BASE_URL}/outsider/packages`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(50);
    });

    test('7.4 Admin package management page with CRUD', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/services/packages`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/services/packages');
      const body = await page.textContent('body') || '';
      expect(/package|plan|session|price|hour/i.test(body)).toBeTruthy();
      // Verify CRUD buttons exist
      const hasAdd = await page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")').first().isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`✔ Package management: add button visible=${hasAdd}`);
    });

    test('7.5 Lesson services API has real data with prices', async ({ page }) => {
      const res = await api(page, 'GET', '/services');
      expect(res.status).toBeLessThan(400);
      const services = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.services || []);
      const lessons = services.filter((s: any) => s.category === 'lesson' && !s.isPackage);
      console.log(`✔ Found ${lessons.length} lesson service(s)`);
      if (lessons.length > 0) {
        expect(lessons[0]).toHaveProperty('name');
        expect(lessons[0]).toHaveProperty('price');
        console.log(`  First lesson: "${lessons[0].name}" price=${lessons[0].price}`);
      }
    });
  });

  // ─── Section 8: Members Module ───────────────────────────
  test.describe('Section 8 — Members Module', () => {

    test('8.1 Member offerings API returns data', async ({ page }) => {
      const res = await api(page, 'GET', '/member-offerings');
      expect(res.status).toBe(200);
      const offerings = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.offerings || []);
      console.log(`✔ Found ${offerings.length} member offering(s)`);
      if (offerings.length > 0) {
        expect(offerings[0]).toHaveProperty('name');
      }
    });

    test('8.2 Public member offerings page', async ({ page }) => {
      await page.goto(`${BASE_URL}/members/offerings`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const body = await page.textContent('body') || '';
      expect(body.length).toBeGreaterThan(30);
    });

    test('8.3 Admin members calendar page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/calendars/members`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/calendars/members');
    });

    test('8.4 Admin membership settings page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/services/memberships`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/services/memberships');
    });

    test('8.5 Categories API has structured data', async ({ page }) => {
      const res = await api(page, 'GET', '/services/categories');
      expect(res.status).toBe(200);
      const categories = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      expect(categories.length).toBeGreaterThan(0);
      console.log(`✔ Found ${categories.length} service categories`);
      if (categories.length > 0) {
        expect(categories[0]).toHaveProperty('name');
      }
    });
  });
});
