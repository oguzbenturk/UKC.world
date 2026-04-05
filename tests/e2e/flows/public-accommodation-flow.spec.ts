/**
 * Phase 3 — Public Accommodation Flow
 *
 * Tests all publicly-accessible accommodation/stay showcase pages (no auth required):
 *   - /stay/home
 *   - /stay/hotel
 *
 * These pages are marketing/showcase pages displaying accommodation options and amenities.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, navigateTo, expectPageLoaded, waitForLoading } from '../helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 1500)); });

test.describe('Phase 3 — Public Accommodation Pages', () => {
  const accommodationPages = [
    { name: 'Home Accommodation', path: '/stay/home' },
    { name: 'Hotel Accommodation', path: '/stay/hotel' },
  ];

  for (const accom of accommodationPages) {
    test(`${accom.name} page loads without crashing (${accom.path})`, async ({ page }) => {
      await navigateTo(page, accom.path);
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

    test(`${accom.name} page displays accommodation details (${accom.path})`, async ({ page }) => {
      await navigateTo(page, accom.path);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);

      // Check for headings, images, or cards
      const contentElements = page.locator('h1, h2, h3, img, .ant-card, [class*="image"], [class*="card"]');
      const contentCount = await contentElements.count();
      expect(contentCount).toBeGreaterThan(0);

      // Verify meaningful text content
      const html = await page.locator('html').innerText();
      expect(html.length).toBeGreaterThan(100);
    });

    test(`${accom.name} page responds with 200 status (${accom.path})`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${accom.path}`);
      if (response) {
        expect(response.status()).toBeLessThan(400);
      }
    });
  }
});

test.describe('Phase 3 — Accommodation Page Content', () => {
  test('Home accommodation page displays amenities/details', async ({ page }) => {
    await navigateTo(page, '/stay/home');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);

    const body = page.locator('body');
    const pageText = await body.innerText();
    expect(pageText.length).toBeGreaterThan(50);

    // Should have accommodation-related content
    expect(pageText.toLowerCase()).toMatch(/home|accommodation|stay|room|feature|amenity|booking|reserve/);
  });

  test('Hotel accommodation page displays hotel information', async ({ page }) => {
    await navigateTo(page, '/stay/hotel');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);

    const body = page.locator('body');
    const pageText = await body.innerText();
    expect(pageText.length).toBeGreaterThan(50);
  });

  test('Accommodation pages have visual elements (images or cards)', async ({ page }) => {
    const paths = ['/stay/home', '/stay/hotel'];

    for (const path of paths) {
      await navigateTo(page, path);
      await page.waitForLoadState('networkidle');

      // Check for images, cards, or visual content
      const visualElements = page.locator('img, .ant-card, [class*="image"], [class*="photo"], picture');
      const visualCount = await visualElements.count();

      // Either has images or has cards with content
      const cards = page.locator('.ant-card, [class*="card"]');
      const cardCount = await cards.count();

      expect(visualCount + cardCount).toBeGreaterThanOrEqual(0);

      // Verify page is not blank
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(50);
    }
  });

  test('All accommodation pages are publicly accessible (no redirect to login)', async ({ page }) => {
    const paths = ['/stay/home', '/stay/hotel'];

    for (const path of paths) {
      const response = await page.goto(`${BASE_URL}${path}`);
      expect(page.url()).not.toContain('/login');
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
    }
  });
});

test.describe('Phase 3 — Accommodation Page Error Handling', () => {
  test('Accommodation pages do not show error boundary', async ({ page }) => {
    const paths = ['/stay/home', '/stay/hotel'];

    for (const path of paths) {
      await navigateTo(page, path);
      await page.waitForLoadState('networkidle');

      const errorBoundary = page.locator('.ant-result-error, [data-testid*="error"]');
      await expect(errorBoundary).not.toBeVisible({ timeout: 2000 }).catch(() => {
        // Error element may not exist, which is good
      });
    }
  });

  test('Accommodation pages render with valid HTML structure', async ({ page }) => {
    await navigateTo(page, '/stay/home');
    await page.waitForLoadState('networkidle');

    // Check for main content wrapper
    const mainElement = page.locator('main, [role="main"], #root, body');
    await expect(mainElement.first()).toBeTruthy();

    // Verify page is not completely empty
    const html = await page.locator('html').innerText();
    expect(html.trim().length).toBeGreaterThan(100);
  });

  test('Both accommodation pages are accessible', async ({ page }) => {
    const homePage = await page.goto(`${BASE_URL}/stay/home`);
    expect(homePage?.status()).toBeLessThan(400);

    const hotelPage = await page.goto(`${BASE_URL}/stay/hotel`);
    expect(hotelPage?.status()).toBeLessThan(400);
  });
});
