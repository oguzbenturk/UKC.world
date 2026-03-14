/**
 * Phase 9 — Admin Settings
 *
 * Tests admin settings and configuration pages:
 *   9.1  Main Settings Page
 *   9.2  Roles Management
 *   9.3  Waivers Management
 *   9.4  Legal Documents
 *   9.5  Deleted Bookings
 *   9.6  Manager Commissions
 *   9.7  Finance Settings
 *   9.8  Service Parameters
 *   9.9  Route Verification
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL, navigateTo, expectPageLoaded, waitForLoading,
  loginAsAdmin
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 2500)); });

/* ================================================================
   9.1  Main Settings Page
   ================================================================ */
test.describe('9.1 Main Settings Page', () => {
  test('Navigate to admin settings', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/settings');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Settings page has configuration sections', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/settings');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    // Should have expandable sections: Forecast, Finance, Calendar, Currency, etc.
    await expect(body).toContainText(/forecast|finance|calendar|currency|booking|profile|password/i);
  });

  test('Settings page has profile section', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/settings');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/profile|language|timezone|theme/i);
  });

  test('Settings page has password change section', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/settings');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/password|change|current/i);
  });
});

/* ================================================================
   9.2  Roles Management
   ================================================================ */
test.describe('9.2 Roles Management', () => {
  test('Navigate to roles page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/roles');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Roles page shows system roles', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/roles');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);
    const body = page.locator('body');
    // Should show standard roles
    await expect(body).toContainText(/admin|manager|instructor|student/i);
  });

  test('Roles page has role management actions', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/roles');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    // Should have edit, view, or manage actions
    await expect(body).toContainText(/permission|edit|view|assign|user/i);
  });
});

/* ================================================================
   9.3  Waivers Management
   ================================================================ */
test.describe('9.3 Waivers Management', () => {
  test('Navigate to waivers page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/waivers');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Waivers page has summary statistics', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/waivers');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/waiver|total|valid|signed|expired|missing/i);
  });

  test('Waivers page has filters', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/waivers');
    await page.waitForLoadState('networkidle');
    // Look for search or filter elements
    const body = page.locator('body');
    await expect(body).toContainText(/search|filter|status|sort|all|student/i);
  });

  test('Waivers page has export option', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/waivers');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/export|csv|download|refresh/i);
  });
});

/* ================================================================
   9.4  Legal Documents
   ================================================================ */
test.describe('9.4 Legal Documents', () => {
  test('Navigate to legal documents page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/legal-documents');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Legal documents has document type tabs', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/legal-documents');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    // Should have tabs: Terms of Service, Privacy Policy, Marketing Preferences
    await expect(body).toContainText(/terms|privacy|marketing/i);
  });

  test('Legal documents has editor', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/legal-documents');
    await page.waitForLoadState('networkidle');
    // Look for rich text editor or version field
    const body = page.locator('body');
    await expect(body).toContainText(/version|save|edit|document/i);
  });
});

/* ================================================================
   9.5  Deleted Bookings
   ================================================================ */
test.describe('9.5 Deleted Bookings', () => {
  test('Navigate to deleted bookings page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/deleted-bookings');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    const text = await body.innerText();
    // Page should have meaningful content (heading, table, or loading text)
    expect(text.length).toBeGreaterThan(50);
  });

  test('Deleted bookings has search and date filters', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/deleted-bookings');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/search|date|filter|deleted|booking/i);
  });

  test('Deleted bookings table or empty state', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/deleted-bookings');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);
    const body = page.locator('body');
    const text = await body.innerText();
    const hasContent = /student|service|booking|amount|restore|no data|no deleted/i.test(text);
    expect(hasContent).toBeTruthy();
  });
});

/* ================================================================
   9.6  Manager Commissions
   ================================================================ */
test.describe('9.6 Manager Commissions', () => {
  test('Navigate to manager commissions page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/manager-commissions');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Commissioner page has manager table or settings', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/manager-commissions');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/commission|manager|rate|booking|rental/i);
  });
});

/* ================================================================
   9.7  Finance Settings
   ================================================================ */
test.describe('9.7 Finance Settings', () => {
  test('Navigate to finance settings page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/finance/settings');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Finance settings has configuration options', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/finance/settings');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/rate|fee|payment|accounting|tax|calculation/i);
  });
});

/* ================================================================
   9.8  Service Parameters
   ================================================================ */
test.describe('9.8 Service Parameters', () => {
  const serviceRoutes = [
    { path: '/services/categories', name: 'Service Categories' },
    { path: '/services/lessons', name: 'Lesson Parameters' },
    { path: '/services/rentals', name: 'Rental Parameters' },
    { path: '/services/packages', name: 'Service Packages' },
    { path: '/services/memberships', name: 'Memberships' },
    { path: '/services/accommodation', name: 'Accommodation Units' },
    { path: '/services/shop', name: 'Shop Products' },
  ];

  for (const route of serviceRoutes) {
    test(`${route.name} page loads (${route.path})`, async ({ page }) => {
      await loginAsAdmin(page);
      await navigateTo(page, route.path);
      await expectPageLoaded(page);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);
      const body = page.locator('body');
      const text = await body.innerText();
      expect(text.length).toBeGreaterThan(100);
      // Verify no error overlay
      const errorResult = page.locator('.ant-result-404, .ant-result-500, .ant-result-error');
      const hasError = await errorResult.isVisible().catch(() => false);
      expect(hasError).toBeFalsy();
    });
  }
});

/* ================================================================
   9.9  Route Verification
   ================================================================ */
test.describe('9.9 Route Verification', () => {
  const settingsRoutes = [
    { path: '/admin/settings', name: 'Main Settings' },
    { path: '/admin/roles', name: 'Roles Management' },
    { path: '/admin/waivers', name: 'Waivers' },
    { path: '/admin/legal-documents', name: 'Legal Documents' },
    { path: '/admin/deleted-bookings', name: 'Deleted Bookings' },
    { path: '/admin/manager-commissions', name: 'Manager Commissions' },
    { path: '/finance/settings', name: 'Finance Settings' },
    { path: '/finance/refunds', name: 'Payment Refunds' },
  ];

  for (const route of settingsRoutes) {
    test(`${route.name} (${route.path}) loads without error`, async ({ page }) => {
      await loginAsAdmin(page);
      await navigateTo(page, route.path);
      await expectPageLoaded(page);
      await page.waitForLoadState('networkidle');
      const body = page.locator('body');
      const text = await body.innerText();
      expect(text.length).toBeGreaterThan(50);
      const errorResult = page.locator('.ant-result-404, .ant-result-500, .ant-result-error');
      const hasError = await errorResult.isVisible().catch(() => false);
      expect(hasError).toBeFalsy();
    });
  }
});
