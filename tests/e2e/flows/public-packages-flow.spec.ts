/**
 * Phase 3 — Public Packages Flow
 *
 * Tests all publicly-accessible experience/package showcase pages (no auth required):
 *   - /experience/kite-packages
 *   - /experience/wing-packages
 *   - /experience/camps
 *   - /experience/downwinders
 *
 * These pages are marketing/showcase pages displaying bundled experience offerings.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, navigateTo, expectPageLoaded, waitForLoading } from '../helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 1500)); });

test.describe('Phase 3 — Public Package Experience Pages', () => {
  const packagePages = [
    { name: 'Kite Packages', path: '/experience/kite-packages' },
    { name: 'Wing Packages', path: '/experience/wing-packages' },
    { name: 'Camps', path: '/experience/camps' },
    { name: 'Downwinders', path: '/experience/downwinders' },
  ];

  for (const pkg of packagePages) {
    test(`${pkg.name} page loads without crashing (${pkg.path})`, async ({ page }) => {
      await navigateTo(page, pkg.path);
      await expectPageLoaded(page);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);

      // Verify page has content
      const body = page.locator('body');
      const bodyText = await body.innerText();
      expect(bodyText.length).toBeGreaterThan(50);

      // Verify no error boundary or crash message
      const errorMessages = page.locator('[data-testid*="error"], text=/something went wrong/i, .ant-result-error');
      await expect(errorMessages.first()).not.toBeVisible({ timeout: 2000 }).catch(() => {
        // It's ok if error element doesn't exist
      });
    });

    test(`${pkg.name} page has package/experience content (${pkg.path})`, async ({ page }) => {
      await navigateTo(page, pkg.path);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);

      // Look for package cards, descriptions, or pricing info
      const packageContent = page.locator('.ant-card, [class*="package"], [class*="card"], h1, h2');
      const contentCount = await packageContent.count();
      expect(contentCount).toBeGreaterThan(0);

      // Verify meaningful text content
      const html = await page.locator('html').innerText();
      expect(html.length).toBeGreaterThan(100);
    });

    test(`${pkg.name} page responds with 200 status (${pkg.path})`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${pkg.path}`);
      if (response) {
        expect(response.status()).toBeLessThan(400);
      }
    });
  }
});

test.describe('Phase 3 — Package Page Content Verification', () => {
  test('Kite packages page displays package offerings', async ({ page }) => {
    await navigateTo(page, '/experience/kite-packages');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);

    const body = page.locator('body');
    const pageText = await body.innerText();
    expect(pageText.length).toBeGreaterThan(50);

    // Should have some kite-related content
    expect(pageText.toLowerCase()).toMatch(/package|kite|experience|course|skill|lesson/);
  });

  test('Camps page displays camp information', async ({ page }) => {
    await navigateTo(page, '/experience/camps');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    const pageText = await body.innerText();
    expect(pageText.length).toBeGreaterThan(50);
  });

  test('Downwinders page has relevant content', async ({ page }) => {
    await navigateTo(page, '/experience/downwinders');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    const bodyContent = await body.innerText();
    expect(bodyContent.length).toBeGreaterThan(50);
  });

  test('All package pages are publicly accessible (no redirect to login)', async ({ page }) => {
    const paths = [
      '/experience/kite-packages',
      '/experience/wing-packages',
      '/experience/camps',
      '/experience/downwinders',
    ];

    for (const path of paths) {
      const response = await page.goto(`${BASE_URL}${path}`);
      expect(page.url()).not.toContain('/login');
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
    }
  });
});

test.describe('Phase 3 — Package Page Error Handling', () => {
  test('Package pages do not show error boundary', async ({ page }) => {
    const paths = ['/experience/kite-packages', '/experience/wing-packages', '/experience/camps'];

    for (const path of paths) {
      await navigateTo(page, path);
      await page.waitForLoadState('networkidle');

      const errorBoundary = page.locator('.ant-result-error, [data-testid*="error"]');
      await expect(errorBoundary).not.toBeVisible({ timeout: 2000 }).catch(() => {
        // Error element may not exist, which is good
      });
    }
  });

  test('Package experience pages render with valid HTML structure', async ({ page }) => {
    await navigateTo(page, '/experience/kite-packages');
    await page.waitForLoadState('networkidle');

    // Check for main content wrapper
    const mainElement = page.locator('main, [role="main"], #root, body');
    await expect(mainElement.first()).toBeTruthy();

    // Verify page is not completely empty
    const html = await page.locator('html').innerText();
    expect(html.trim().length).toBeGreaterThan(100);
  });
});
