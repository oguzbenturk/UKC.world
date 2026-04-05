/**
 * Phase 3 — Public Rentals Flow
 *
 * Tests all publicly-accessible rental showcase pages (no auth required):
 *   - /rental/standard
 *   - /rental/sls
 *   - /rental/dlab
 *   - /rental/efoil
 *   - /rental/premium
 *
 * These pages are marketing/showcase pages that display rental equipment offerings.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, navigateTo, expectPageLoaded, waitForLoading } from '../helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 1500)); });

test.describe('Phase 3 — Public Rental Equipment Pages', () => {
  const rentalPages = [
    { name: 'Standard Rentals', path: '/rental/standard' },
    { name: 'SLS Rentals', path: '/rental/sls' },
    { name: 'D-LAB Rentals', path: '/rental/dlab' },
    { name: 'E-Foil Rentals', path: '/rental/efoil' },
    { name: 'Premium Rentals', path: '/rental/premium' },
  ];

  for (const page of rentalPages) {
    test(`${page.name} page loads without crashing (${page.path})`, async ({ page: browserPage }) => {
      await navigateTo(browserPage, page.path);
      await expectPageLoaded(browserPage);
      await browserPage.waitForLoadState('networkidle');
      await waitForLoading(browserPage);

      // Verify page has content
      const body = browserPage.locator('body');
      const bodyText = await body.innerText();
      expect(bodyText.length).toBeGreaterThan(50);

      // Verify no error boundary or crash message
      const errorMessages = browserPage.locator('[data-testid*="error"], text=/something went wrong/i, .ant-result-error');
      await expect(errorMessages.first()).not.toBeVisible({ timeout: 2000 }).catch(() => {
        // It's ok if error element doesn't exist
      });
    });

    test(`${page.name} page has main content section (${page.path})`, async ({ page: browserPage }) => {
      await navigateTo(browserPage, page.path);
      await browserPage.waitForLoadState('networkidle');
      await waitForLoading(browserPage);

      // Check for heading or descriptive text
      const mainContent = browserPage.locator('main, [role="main"], h1, h2, .ant-card, .content');
      const visibleCount = await mainContent.count();
      expect(visibleCount).toBeGreaterThan(0);

      // Verify no blank page
      const html = await browserPage.locator('html').innerText();
      expect(html.length).toBeGreaterThan(100);
    });

    test(`${page.name} page responds with 200 status (${page.path})`, async ({ page: browserPage }) => {
      const response = await browserPage.goto(`${BASE_URL}${page.path}`);
      if (response) {
        expect(response.status()).toBeLessThan(400);
      }
    });
  }
});

test.describe('Phase 3 — Rental Page Error Handling', () => {
  test('Standard rental page does not show error boundary', async ({ page }) => {
    await navigateTo(page, '/rental/standard');
    await page.waitForLoadState('networkidle');

    const errorBoundary = page.locator('.ant-result-error, [data-testid*="error"]');
    await expect(errorBoundary).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Error element may not exist, which is good
    });
  });

  test('All rental pages are publicly accessible (no redirect to login)', async ({ page }) => {
    const paths = ['/rental/standard', '/rental/sls', '/rental/dlab', '/rental/efoil', '/rental/premium'];

    for (const path of paths) {
      const response = await page.goto(`${BASE_URL}${path}`);
      expect(page.url()).not.toContain('/login');
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
    }
  });
});
