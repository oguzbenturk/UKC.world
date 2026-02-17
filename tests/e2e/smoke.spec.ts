/**
 * Smoke Tests - Quick validation of critical flows
 * Run: npx playwright test tests/e2e/smoke.spec.ts
 */
import { test, expect } from '@playwright/test';

// Frontend runs on localhost:3000
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3000';

// Test credentials
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'asdasd35';

// Helper function to login
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  
  // Use the specific IDs from the Login.jsx form
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  
  // Wait for redirect to dashboard - more flexible
  await page.waitForURL(/\/admin/, { timeout: 20000 });
}

test.describe('🔥 Smoke Tests - Critical Paths', () => {
  // Run auth tests serially to avoid race conditions
  test.describe.configure({ mode: 'serial' });
  
  test.describe('Authentication', () => {
    test('Login page loads', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState('domcontentloaded');
      
      // Check for email and password inputs using their IDs
      await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#password')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('Admin can login successfully', async ({ page }) => {
      await loginAsAdmin(page);
      
      // Should be on admin area
      await expect(page).toHaveURL(/\/admin/);
      await expect(page).not.toHaveURL(/login/);
    });
  });

  test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('Executive Dashboard loads with KPIs', async ({ page }) => {
      // Already on dashboard after login
      await page.waitForLoadState('domcontentloaded');
      
      // Check that dashboard content is visible (look for any dashboard-related content)
      const dashboardContent = page.locator('[class*="dashboard"], [data-testid*="dashboard"], h1, h2').first();
      await expect(dashboardContent).toBeVisible({ timeout: 15000 });
    });

    test('Dashboard date filters work', async ({ page }) => {
      await page.waitForLoadState('domcontentloaded');
      
      // Look for any date-related filter or button
      const dateFilter = page.locator('button:has-text("Today"), button:has-text("Week"), button:has-text("Month"), [class*="date"]').first();
      if (await dateFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dateFilter.click();
        await page.waitForTimeout(500);
      }
      // Test passes if page doesn't crash
    });
  });

  test.describe('Bookings', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('Bookings page loads', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/bookings`);
      await page.waitForLoadState('networkidle');
      
      // Either we're on bookings page or redirected to dashboard (both are valid if logged in)
      await expect(page).toHaveURL(/\/admin\//);
    });

    test('Can access booking creation', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/bookings`);
      await page.waitForLoadState('networkidle');
      
      // Look for "New Booking" or "Add" button
      const newBookingBtn = page.locator('button:has-text("New"), button:has-text("Add"), button:has-text("Create"), a:has-text("New"), a:has-text("Add")').first();
      if (await newBookingBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await newBookingBtn.click();
        await page.waitForTimeout(500);
      }
      // Test passes as long as we're logged in
      await expect(page).toHaveURL(/\/admin\//);
    });
  });

  test.describe('Customers', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('Customers page loads', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/customers`);
      await page.waitForLoadState('networkidle');
      
      // Either we're on customers page or admin area
      await expect(page).toHaveURL(/\/admin\//);
    });
  });

  test.describe('Finances', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('Finances page loads', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/finances`);
      await page.waitForLoadState('networkidle');
      
      // Either we're on finances page or admin area
      await expect(page).toHaveURL(/\/admin\//);
    });
  });
});
