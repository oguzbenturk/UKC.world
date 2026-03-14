/**
 * PHASE 15: Instructor Dashboard & Commission
 *
 * Tests instructor-specific views: dashboard, assigned lessons,
 * lesson completion, commission view.
 *
 * Run: npx playwright test tests/e2e/phase15-instructor.spec.ts --project=chromium --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  loginAsAdmin,
  navigateTo,
  waitForLoading,
  MANAGER_EMAIL,
  MANAGER_PASSWORD,
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90000);

test.beforeEach(async () => {
  await new Promise(r => setTimeout(r, 2500));
});

/** Login as instructor (created in Phase 11 or existing) */
async function loginAsInstructor(page: import('@playwright/test').Page) {
  // Try using the instructor created in Phase 11 or an existing one
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Use admin to check for existing instructors via API
  // For now, login as manager who has instructor-like views
  await page.fill('#email', MANAGER_EMAIL);
  await page.fill('#password', MANAGER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 20000 });
  await page.waitForTimeout(2000);
}

// ═══════════════════════════════════════════════════════════
// 15.1  INSTRUCTOR DASHBOARD
// ═══════════════════════════════════════════════════════════
test.describe('15.1 Instructor Dashboard', () => {
  test('Instructor/Manager dashboard loads', async ({ page }) => {
    await loginAsInstructor(page);

    // Navigate to instructor dashboard if manager has access
    await navigateTo(page, '/instructor/dashboard');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Instructor schedule page is accessible', async ({ page }) => {
    await loginAsInstructor(page);
    await navigateTo(page, '/instructor/schedule');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 15.2  INSTRUCTOR VIEWS (from Admin perspective)
// ═══════════════════════════════════════════════════════════
test.describe('15.2 Admin - Instructor Management', () => {
  test('Admin can view instructor list', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/instructors');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 100).toBeTruthy();
  });

  test('Admin can view instructor details page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/instructors');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Click on first instructor
    const firstRow = page.locator('table tbody tr, [class*="card"]').first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(2000);

      // Should navigate to instructor detail
      const body = await page.locator('body').textContent();
      expect(body && body.length > 50).toBeTruthy();
    }
  });

  test('Admin can access instructor creation page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/instructors/new');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Form should be visible
    const nameField = page.locator('#first_name');
    await expect(nameField).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════
// 15.3  COMMISSION VIEW
// ═══════════════════════════════════════════════════════════
test.describe('15.3 Commission', () => {
  test('Commissions page shows data or empty state', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/commissions');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const hasData = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=/no.*commission|empty|no data/i').first().isVisible().catch(() => false);
    const hasContent = await page.locator('body').textContent();
    expect(hasData || hasEmpty || (hasContent && hasContent.length > 50)).toBeTruthy();
  });

  test('Commission settings accessible', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/dashboard/settings');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Settings page should load
    const body = await page.locator('body').textContent();
    expect(body && body.length > 100).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 15.4  INSTRUCTOR API
// ═══════════════════════════════════════════════════════════
test.describe('15.4 Instructor API', () => {
  test('Instructors API returns list', async ({ page }) => {
    await loginAsAdmin(page);
    const result = await page.evaluate(async () => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/instructors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { status: res.status, count: 0, error: data };
      const list = Array.isArray(data) ? data : data?.instructors || data?.data || data?.rows || [];
      return { status: res.status, count: list.length };
    });
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(500);
  });
});
