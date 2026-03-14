/**
 * Phase 10 — Cross-Cutting Integration & Remaining Routes
 *
 * Final phase covering:
 *   10.1  Remaining Admin Routes
 *   10.2  Calendar Views (Admin)
 *   10.3  Customer & Instructor Management
 *   10.4  Cross-Role Navigation
 *   10.5  Responsive Layout Checks
 *   10.6  Full Route Coverage Verification
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL, navigateTo, expectPageLoaded, waitForLoading,
  loginAsAdmin, loginAsManager, loginAsStudent
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 2500)); });

/* ================================================================
   10.1  Remaining Admin Routes
   ================================================================ */
test.describe('10.1 Remaining Admin Routes', () => {
  test('Admin dashboard loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/dashboard');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Spare parts page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/spare-parts');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Manager commissions dashboard loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/manager/commissions');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });
});

/* ================================================================
   10.2  Calendar Views (Admin)
   ================================================================ */
test.describe('10.2 Calendar Views', () => {
  test('Members calendar loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/calendars/members');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Events calendar loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/calendars/events');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Shop orders page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/calendars/shop-orders');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });
});

/* ================================================================
   10.3  Customer & Instructor Management
   ================================================================ */
test.describe('10.3 Customer & Instructor Management', () => {
  test('Customers list page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/customers');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/customer|name|email|role/i);
  });

  test('Customers page has search functionality', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/customers');
    await page.waitForLoadState('networkidle');
    const searchElements = page.locator('input[type="search"], input[placeholder*="search" i], .ant-input-search');
    const count = await searchElements.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Instructors list page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/instructors');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/instructor|name|email|phone/i);
  });

  test('Customer new form loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/customers/new');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/first name|last name|email|password/i);
  });
});

/* ================================================================
   10.4  Cross-Role Navigation
   ================================================================ */
test.describe('10.4 Cross-Role Navigation', () => {
  test('Admin sees admin sidebar items', async ({ page }) => {
    await loginAsAdmin(page);
    const body = page.locator('body');
    await expect(body).toContainText(/dashboard/i);
    await expect(body).toContainText(/customers/i);
    await expect(body).toContainText(/finance/i);
    await expect(body).toContainText(/settings/i);
  });

  test('Manager sees manager sidebar items', async ({ page }) => {
    await loginAsManager(page);
    const body = page.locator('body');
    await expect(body).toContainText(/dashboard/i);
    await expect(body).toContainText(/customers/i);
  });

  test('Student sees student sidebar items', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    await expect(body).toContainText(/academy|shop|rental/i);
    await expect(body).toContainText(/wallet payments|support|profile/i);
  });

  test('Admin cannot access student routes', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    // Admin gets redirected away from student routes
    const url = page.url();
    expect(url).not.toContain('/student/dashboard');
  });

  test('Student cannot access admin routes', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/admin/settings`);
    await page.waitForLoadState('networkidle');
    const url = page.url();
    // Should redirect away or show unauthorized
    expect(url).not.toContain('/admin/settings');
  });
});

/* ================================================================
   10.5  Responsive Layout Checks
   ================================================================ */
test.describe('10.5 Responsive Layout Checks', () => {
  test('Admin dashboard renders without crash', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/dashboard');
    await expectPageLoaded(page);
    // No JS error crash overlay
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text).not.toMatch(/unexpected error|something went wrong|chunk load/i);
  });

  test('Page footer or version badge visible', async ({ page }) => {
    await loginAsAdmin(page);
    const body = page.locator('body');
    await expect(body).toContainText(/plannivo\s*v/i);
  });

  test('Auth token persists across navigation', async ({ page }) => {
    await loginAsAdmin(page);
    const routes = ['/dashboard', '/customers', '/bookings', '/finance/overall'];
    for (const route of routes) {
      await navigateTo(page, route);
      await page.waitForLoadState('networkidle');
      const token = await page.evaluate(() => localStorage.getItem('token'));
      expect(token).toBeTruthy();
    }
  });

  test('Logout redirects to login page', async ({ page }) => {
    await loginAsAdmin(page);
    // Open profile dropdown menu
    const profileBtn = page.getByRole('button', { name: /open profile menu/i });
    await profileBtn.click();
    // Click Logout in the dropdown
    const logoutMenuItem = page.getByRole('menuitem', { name: /logout/i });
    await logoutMenuItem.click();
    // Confirm logout in the modal
    const confirmBtn = page.getByRole('button', { name: /yes, logout/i });
    await confirmBtn.click();
    await page.waitForURL(/\/(login|guest|)$/, { timeout: 15000 });
    const url = page.url();
    const isLoggedOut = url.includes('/login') || url.includes('/guest') || url.endsWith('/');
    expect(isLoggedOut).toBeTruthy();
  });
});

/* ================================================================
   10.6  Full Route Coverage Verification
   ================================================================ */
test.describe('10.6 Full Route Coverage Verification', () => {
  // All critical admin routes that should load without error
  const criticalRoutes = [
    '/dashboard',
    '/customers',
    '/instructors',
    '/bookings',
    '/calendars/bookings',
    '/calendars/events',
    '/calendars/members',
    '/calendars/rentals',
    '/calendars/shop-orders',
    '/equipment',
    '/rentals',
    '/rentals/calendar',
    '/finance/overall',
    '/finance/daily-operations',
    '/finance/expenses',
    '/finance/wallet-deposits',
    '/finance/bank-accounts',
    '/finance/refunds',
    '/finance/settings',
    '/marketing',
    '/quick-links',
    '/forms',
    '/admin/vouchers',
    '/admin/ratings-analytics',
    '/chat',
    '/admin/support-tickets',
    '/admin/settings',
    '/admin/roles',
    '/admin/waivers',
    '/admin/legal-documents',
    '/admin/deleted-bookings',
    '/admin/manager-commissions',
    '/services/categories',
    '/services/lessons',
    '/services/rentals',
    '/services/packages',
    '/services/memberships',
    '/services/accommodation',
    '/services/shop',
  ];

  for (const route of criticalRoutes) {
    test(`Admin route ${route} loads`, async ({ page }) => {
      await loginAsAdmin(page);
      await navigateTo(page, route);
      await page.waitForLoadState('networkidle');
      const body = page.locator('body');
      await expect(body).not.toBeEmpty();
      const text = await body.innerText();
      expect(text.length).toBeGreaterThan(50);
    });
  }
});
