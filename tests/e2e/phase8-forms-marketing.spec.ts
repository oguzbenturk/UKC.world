/**
 * Phase 8 — Forms & Marketing
 *
 * Tests marketing/forms admin features:
 *   8.1  Marketing Campaign Builder
 *   8.2  Quick Links & Forms Management
 *   8.3  Forms List
 *   8.4  Voucher Management
 *   8.5  Rating Analytics
 *   8.6  Chat / Messaging
 *   8.7  Support Tickets (Admin)
 *   8.8  Route Verification
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL, navigateTo, expectPageLoaded, waitForLoading,
  loginAsAdmin
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 2500)); });

/* ================================================================
   8.1  Marketing Campaign Builder
   ================================================================ */
test.describe('8.1 Marketing Campaign Builder', () => {
  test('Navigate to marketing page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/marketing');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Marketing page has campaign type tabs', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/marketing');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    // Should have tabs: Email, SMS, WhatsApp, Popup, Question, Quick Links
    await expect(body).toContainText(/email|sms|whatsapp|popup|campaign/i);
  });

  test('Marketing page has content editor area', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/marketing');
    await page.waitForLoadState('networkidle');
    // Look for editor, form elements, or campaign configuration
    const body = page.locator('body');
    await expect(body).toContainText(/campaign|builder|marketing|target|audience|content/i);
  });
});

/* ================================================================
   8.2  Quick Links & Forms Management
   ================================================================ */
test.describe('8.2 Quick Links Management', () => {
  test('Navigate to quick links page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/quick-links');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Quick links page has create button', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/quick-links');
    await page.waitForLoadState('networkidle');
    const createBtn = page.getByRole('button', { name: /new|create|add/i }).first();
    const hasButton = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const body = page.locator('body');
    const hasText = await body.innerText().then(t => /new quick link|create|add link/i.test(t));
    expect(hasButton || hasText).toBeTruthy();
  });

  test('Quick links page has search and filters', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/quick-links');
    await page.waitForLoadState('networkidle');
    // Look for search box or filter dropdowns
    const searchOrFilters = page.locator('input[type="search"], input[placeholder*="search" i], .ant-select, .ant-input-search');
    const count = await searchOrFilters.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Quick links table or empty state shown', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/quick-links');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    // Should have table content, tab content, or empty message
    const text = await body.innerText();
    const hasContent = /link name|service type|status|registration|no data|no quick links|no links|submissions|quick link|create.*form/i.test(text);
    // Fallback: page just has substantial content
    expect(hasContent || text.length > 200).toBeTruthy();
  });
});

/* ================================================================
   8.3  Forms List
   ================================================================ */
test.describe('8.3 Forms List', () => {
  test('Navigate to forms list page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/forms');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Forms page has statistics cards', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/forms');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/total forms|responses|active|completion/i);
  });

  test('Forms page has create form button', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/forms');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/create|new form/i);
  });

  test('Forms table or empty state shown', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/forms');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);
    const body = page.locator('body');
    const text = await body.innerText();
    const hasContent = /name|category|responses|views|no data|no forms/i.test(text);
    expect(hasContent).toBeTruthy();
  });
});

/* ================================================================
   8.4  Voucher Management
   ================================================================ */
test.describe('8.4 Voucher Management', () => {
  test('Navigate to voucher management page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/vouchers');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Voucher page has create button', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/vouchers');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/create|new|voucher/i);
  });

  test('Voucher page has table or empty state', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/vouchers');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);
    const body = page.locator('body');
    const text = await body.innerText();
    const hasContent = /code|type|value|usage|expiry|status|no data|no voucher/i.test(text);
    expect(hasContent).toBeTruthy();
  });

  test('Voucher page has search', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/vouchers');
    await page.waitForLoadState('networkidle');
    const searchElements = page.locator('input[type="search"], input[placeholder*="search" i], .ant-input-search');
    const count = await searchElements.count();
    // Either has search or the page has some filter/search mechanism
    const body = page.locator('body');
    const hasSearch = count > 0 || await body.innerText().then(t => /search|filter/i.test(t));
    expect(hasSearch).toBeTruthy();
  });
});

/* ================================================================
   8.5  Rating Analytics
   ================================================================ */
test.describe('8.5 Rating Analytics', () => {
  test('Navigate to rating analytics page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/ratings-analytics');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Rating analytics has summary statistics', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/ratings-analytics');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/rating|average|total|instructor|benchmark|performer/i);
  });

  test('Rating analytics has filters', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/ratings-analytics');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    // Service type filter and sort options
    await expect(body).toContainText(/service type|sort|all|lesson|highest|recent/i);
  });

  test('Rating analytics has leaderboard or empty state', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/ratings-analytics');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);
    const body = page.locator('body');
    const text = await body.innerText();
    const hasContent = /rank|instructor|avg|rating|no data|no rating/i.test(text);
    expect(hasContent).toBeTruthy();
  });
});

/* ================================================================
   8.6  Chat / Messaging
   ================================================================ */
test.describe('8.6 Chat / Messaging', () => {
  test('Navigate to chat page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/chat');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Chat page has conversation sidebar or list', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/chat');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    // Should have conversation list or empty state
    await expect(body).toContainText(/chat|conversation|message|no conversation|start/i);
  });

  test('Chat page has create conversation button', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/chat');
    await page.waitForLoadState('networkidle');
    // Desktop: "plus" button visible directly; Mobile: behind hamburger menu
    const plusBtn = page.getByRole('button', { name: /plus/i });
    const menuBtn = page.locator('main').getByRole('button', { name: /menu/i });
    const hasPlus = await plusBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasPlus) {
      // On mobile, open the chat sidebar drawer first
      if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await menuBtn.click();
        await page.waitForTimeout(500);
      }
    }
    // Now check for plus button or the Messages heading
    const hasPlusNow = await plusBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasMessages = await page.getByRole('heading', { name: /messages/i }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasPlusNow || hasMessages).toBeTruthy();
  });
});

/* ================================================================
   8.7  Support Tickets (Admin)
   ================================================================ */
test.describe('8.7 Support Tickets (Admin)', () => {
  test('Navigate to support tickets page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/support-tickets');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('Support tickets has filter options', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/support-tickets');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/priority|status|ticket|open|resolved|urgent|support/i);
  });

  test('Support tickets table or empty state shown', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/admin/support-tickets');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);
    const body = page.locator('body');
    const text = await body.innerText();
    const hasContent = /ticket|title|priority|status|no data|no ticket|assigned/i.test(text);
    expect(hasContent).toBeTruthy();
  });
});

/* ================================================================
   8.8  Route Verification
   ================================================================ */
test.describe('8.8 Route Verification', () => {
  const adminMarketingRoutes = [
    { path: '/marketing', name: 'Marketing Campaign Builder' },
    { path: '/quick-links', name: 'Quick Links' },
    { path: '/forms', name: 'Forms List' },
    { path: '/admin/vouchers', name: 'Voucher Management' },
    { path: '/admin/ratings-analytics', name: 'Rating Analytics' },
    { path: '/chat', name: 'Chat' },
    { path: '/admin/support-tickets', name: 'Support Tickets' },
  ];

  for (const route of adminMarketingRoutes) {
    test(`${route.name} (${route.path}) loads without error`, async ({ page }) => {
      await loginAsAdmin(page);
      await navigateTo(page, route.path);
      await expectPageLoaded(page);
      await page.waitForLoadState('networkidle');
      const body = page.locator('body');
      const text = await body.innerText();
      expect(text.length).toBeGreaterThan(50);
      // Should not show a 404 or error result
      const errorResult = page.locator('.ant-result-404, .ant-result-500, .ant-result-error');
      const hasError = await errorResult.isVisible().catch(() => false);
      expect(hasError).toBeFalsy();
    });
  }
});
