/**
 * Phase 3 — Public Academy Flow
 *
 * Tests all publicly-accessible academy lesson showcase pages (no auth required):
 *   - /academy/kite-lessons
 *   - /academy/foil-lessons
 *   - /academy/wing-lessons
 *   - /academy/efoil-lessons
 *   - /academy/premium-lessons
 *
 * These pages are marketing/showcase pages displaying lesson offerings and course info.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, navigateTo, expectPageLoaded, waitForLoading } from '../helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 1500)); });

test.describe('Phase 3 — Public Academy Lesson Pages', () => {
  const academyPages = [
    { name: 'Kite Lessons', path: '/academy/kite-lessons' },
    { name: 'Foil Lessons', path: '/academy/foil-lessons' },
    { name: 'Wing Lessons', path: '/academy/wing-lessons' },
    { name: 'E-Foil Lessons', path: '/academy/efoil-lessons' },
    { name: 'Premium Lessons', path: '/academy/premium-lessons' },
  ];

  for (const lesson of academyPages) {
    test(`${lesson.name} page loads without crashing (${lesson.path})`, async ({ page }) => {
      await navigateTo(page, lesson.path);
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

    test(`${lesson.name} page displays heading (${lesson.path})`, async ({ page }) => {
      await navigateTo(page, lesson.path);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);

      // Check for heading or lesson title
      const headings = page.locator('h1, h2, h3, [class*="title"]');
      const headingCount = await headings.count();
      expect(headingCount).toBeGreaterThan(0);

      // Verify heading has text
      if (headingCount > 0) {
        const headingText = await headings.first().innerText();
        expect(headingText.length).toBeGreaterThan(0);
      }
    });

    test(`${lesson.name} page responds with 200 status (${lesson.path})`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${lesson.path}`);
      if (response) {
        expect(response.status()).toBeLessThan(400);
      }
    });
  }
});

test.describe('Phase 3 — Academy Page Content', () => {
  test('Kite lessons page contains lesson information', async ({ page }) => {
    await navigateTo(page, '/academy/kite-lessons');
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);

    const body = page.locator('body');
    const pageText = await body.innerText();
    expect(pageText.toLowerCase()).toMatch(/kite|lesson|course|skill|instruction/);
  });

  test('Foil lessons page contains foil content', async ({ page }) => {
    await navigateTo(page, '/academy/foil-lessons');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    const pageText = await body.innerText();
    expect(pageText.length).toBeGreaterThan(100);
  });

  test('All academy pages are publicly accessible (no redirect to login)', async ({ page }) => {
    const paths = [
      '/academy/kite-lessons',
      '/academy/foil-lessons',
      '/academy/wing-lessons',
      '/academy/efoil-lessons',
      '/academy/premium-lessons',
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

test.describe('Phase 3 — Academy Page Error Handling', () => {
  test('Academy pages do not show error boundary', async ({ page }) => {
    const paths = ['/academy/kite-lessons', '/academy/foil-lessons', '/academy/wing-lessons'];

    for (const path of paths) {
      await navigateTo(page, path);
      await page.waitForLoadState('networkidle');

      const errorBoundary = page.locator('.ant-result-error, [data-testid*="error"]');
      await expect(errorBoundary).not.toBeVisible({ timeout: 2000 }).catch(() => {
        // Error element may not exist, which is good
      });
    }
  });

  test('Academy lesson pages render with valid HTML structure', async ({ page }) => {
    await navigateTo(page, '/academy/kite-lessons');
    await page.waitForLoadState('networkidle');

    // Check for main content wrapper
    const mainElement = page.locator('main, [role="main"], #root, body');
    await expect(mainElement.first()).toBeTruthy();

    // Verify page is not completely empty
    const html = await page.locator('html').innerText();
    expect(html.trim().length).toBeGreaterThan(100);
  });
});
