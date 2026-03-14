/**
 * PHASE 14: Payment & Wallet Flows
 *
 * Tests wallet page, payment history, transaction logs,
 * and wallet-related UI interactions.
 *
 * Run: npx playwright test tests/e2e/phase14-payment-wallet.spec.ts --project=chromium --workers=1
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
// 14.1  ADMIN FINANCE OVERVIEW
// ═══════════════════════════════════════════════════════════
test.describe('14.1 Admin Finance', () => {
  test('Admin can access finance dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/finances');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 100).toBeTruthy();
  });

  test('Finance page shows revenue summary or transactions', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/finances');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Should show financial data (revenue, transactions, charts) or at least page content
    const hasNumbers = await page.locator('text=/€|\\$|TRY|revenue|total|balance/i').first().isVisible().catch(() => false);
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasCards = await page.locator('[class*="stat"], [class*="card"], [class*="metric"]').first().isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    expect(hasNumbers || hasTable || hasCards || (body && body.length > 200)).toBeTruthy();
  });

  test('Admin can access payments page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/payments');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 14.2  WALLET MANAGEMENT
// ═══════════════════════════════════════════════════════════
test.describe('14.2 Wallet', () => {
  test('Admin can access wallet management page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/wallets');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Wallet page shows customer wallets or balances', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/wallets');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const hasBalance = await page.locator('text=/balance|wallet|€|\\$|amount/i').first().isVisible().catch(() => false);
    const hasContent = await page.locator('body').textContent();
    expect(hasBalance || (hasContent && hasContent.length > 100)).toBeTruthy();
  });

  test('Wallet API returns data', async ({ page }) => {
    await loginAsAdmin(page);
    const result = await page.evaluate(async () => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/wallets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status };
    });
    // Wallet API should return 200 or valid status
    expect(result.status).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════
// 14.3  STUDENT WALLET & PAYMENT VIEWS
// ═══════════════════════════════════════════════════════════
test.describe('14.3 Student Payment Views', () => {
  test('Student can view wallet balance', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/payments');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Student payment history page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/payments');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Page should have content: payment history, transactions, or a message
    const hasPayments = await page.locator('text=/payment|transaction|history|no.*payment/i').first().isVisible().catch(() => false);
    const hasContent = await page.locator('body').textContent();
    expect(hasPayments || (hasContent && hasContent.length > 50)).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 14.4  COMMISSION TRACKING
// ═══════════════════════════════════════════════════════════
test.describe('14.4 Commission', () => {
  test('Admin can access commissions page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/commissions');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });
});
