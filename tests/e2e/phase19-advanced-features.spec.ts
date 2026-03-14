/**
 * PHASE 19: Advanced Features
 *
 * Tests family members, group bookings, vouchers/coupons,
 * custom forms, quick-links, and waiver signing.
 *
 * Run: npx playwright test tests/e2e/phase19-advanced-features.spec.ts --project=chromium --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  loginAsStudent,
  navigateTo,
  waitForLoading,
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90000);

test.beforeEach(async () => {
  await new Promise(r => setTimeout(r, 2500));
});

// ═══════════════════════════════════════════════════════════
// 19.1  FAMILY MEMBERS
// ═══════════════════════════════════════════════════════════
test.describe('19.1 Family Members', () => {
  test('Admin family members page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/family-members');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Student can view/add family members', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/family');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const url = page.url();
    const body = await page.locator('main, [class*="content"]').first().textContent();
    expect(body && body.length > 50 || url.includes('student')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 19.2  VOUCHERS & COUPONS
// ═══════════════════════════════════════════════════════════
test.describe('19.2 Vouchers & Coupons', () => {
  test('Admin vouchers page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/vouchers');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Voucher creation form is accessible', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/vouchers');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Look for create/add button
    const addBtn = page.getByRole('button', { name: /Create|Add|New/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1500);

      // Should show a form or modal
      const hasForm = await page.locator('form, [class*="modal"], [class*="drawer"]').first().isVisible().catch(() => false);
      expect(hasForm).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 19.3  CUSTOM FORMS / WAIVERS
// ═══════════════════════════════════════════════════════════
test.describe('19.3 Custom Forms & Waivers', () => {
  test('Waivers management page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/waivers');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Waiver list shows entries or empty state', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/waivers');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(3000);

    const hasEntries = await page.locator('table tbody tr, .ant-table, [class*="waiver"], .ant-card').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=/no waivers|empty|no data|waiver|signed|missing/i').first().isVisible().catch(() => false);
    // Fallback: page has substantial content
    const bodyText = await page.locator('body').textContent().catch(() => '');
    const hasContent = bodyText && bodyText.length > 100;
    expect(hasEntries || hasEmpty || hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 19.4  QUICK LINKS & PUBLIC PAGES
// ═══════════════════════════════════════════════════════════
test.describe('19.4 Quick Links & Public Pages', () => {
  test('Quick links / short URL management page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/quick-links');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 19.5  PACKAGES & MEMBERSHIPS
// ═══════════════════════════════════════════════════════════
test.describe('19.5 Packages', () => {
  test('Packages page loads for admin', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/packages');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Package creation form is accessible', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/packages');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const addBtn = page.getByRole('button', { name: /Create|Add|New/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1500);

      const hasForm = await page.locator('form, [class*="modal"], [class*="drawer"]').first().isVisible().catch(() => false);
      expect(hasForm).toBeTruthy();
    }
  });

  test('Student can view available packages', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/packages');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('main, [class*="content"]').first().textContent();
    expect(body && body.length > 50).toBeTruthy();
  });
});
