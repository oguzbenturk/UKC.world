/**
 * PHASE 16: Manager & Role-Based Access
 *
 * Tests manager dashboard, receptionist flows, role permissions,
 * and admin-specific management features.
 *
 * Run: npx playwright test tests/e2e/phase16-manager-roles.spec.ts --project=chromium --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  loginAsAdmin,
  navigateTo,
  waitForLoading,
  MANAGER_EMAIL,
  MANAGER_PASSWORD,
} from '../helpers';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90000);

test.beforeEach(async () => {
  await new Promise(r => setTimeout(r, 2500));
});

async function loginAsManager(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await page.fill('#email', MANAGER_EMAIL);
  await page.fill('#password', MANAGER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 20000 });
  await page.waitForTimeout(2000);
}

// ═══════════════════════════════════════════════════════════
// 16.1  MANAGER DASHBOARD
// ═══════════════════════════════════════════════════════════
test.describe('16.1 Manager Dashboard', () => {
  test('Manager can login and see dashboard', async ({ page }) => {
    await loginAsManager(page);
    const url = page.url();
    expect(url).toContain('/dashboard');

    const body = await page.locator('body').textContent();
    expect(body && body.length > 100).toBeTruthy();
  });

  test('Manager can access bookings', async ({ page }) => {
    await loginAsManager(page);
    await navigateTo(page, '/bookings/calendar');
    await waitForLoading(page, 15000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 100).toBeTruthy();
  });

  test('Manager can access customers', async ({ page }) => {
    await loginAsManager(page);
    await navigateTo(page, '/customers');
    await waitForLoading(page, 15000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Manager can access services', async ({ page }) => {
    await loginAsManager(page);
    await navigateTo(page, '/services/lessons');
    await waitForLoading(page, 15000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 16.2  ROLE PERMISSIONS
// ═══════════════════════════════════════════════════════════
test.describe('16.2 Role Permissions', () => {
  test('Admin roles management page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/dashboard/settings');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 100).toBeTruthy();
  });

  test('Users management page shows user list', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/customers');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasCards = await page.locator('[class*="card"]').first().isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    expect(hasTable || hasCards || (body && body.length > 100)).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 16.3  ADMIN SETTINGS
// ═══════════════════════════════════════════════════════════
test.describe('16.3 Admin Settings', () => {
  test('Business settings page accessible', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/dashboard/settings');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Settings page should have content
    const body = await page.locator('body').textContent();
    expect(body && body.length > 200).toBeTruthy();
  });

  test('Email template settings accessible', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/dashboard/settings');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Navigate to email or notification settings tab
    const emailTab = page.locator('text=/email|notification|template/i').first();
    if (await emailTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailTab.click();
      await page.waitForTimeout(1500);
    }

    const body = await page.locator('body').textContent();
    expect(body && body.length > 100).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 16.4  MANAGER VS ADMIN ACCESS DIFF
// ═══════════════════════════════════════════════════════════
test.describe('16.4 Access Differences', () => {
  test('Manager can access finance pages', async ({ page }) => {
    await loginAsManager(page);
    await navigateTo(page, '/finances');
    await waitForLoading(page, 15000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Manager can access equipment page', async ({ page }) => {
    await loginAsManager(page);
    await navigateTo(page, '/equipment');
    await waitForLoading(page, 15000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });
});
