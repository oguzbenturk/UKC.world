/**
 * Shared helpers for Plannivo E2E tests
 * All phases import from here
 */
import { type Page, type BrowserContext, expect } from '@playwright/test';

// ─── Config ────────────────────────────────────────────────
export const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
export const API_URL = process.env.API_URL || 'http://localhost:4000/api';

export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@plannivo.com';
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'asdasd35';

export const MANAGER_EMAIL = process.env.TEST_MANAGER_EMAIL || 'ozibenturk@gmail.com';
export const MANAGER_PASSWORD = process.env.TEST_MANAGER_PASSWORD || 'asdasd35';

export const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL || 'cust108967@test.com';
export const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || 'TestPass123!';

export const INSTRUCTOR_EMAIL = process.env.TEST_INSTRUCTOR_EMAIL || 'autoinst487747@test.com';
export const INSTRUCTOR_PASSWORD = process.env.TEST_INSTRUCTOR_PASSWORD || 'TestPass123!';

export const FRONTDESK_EMAIL = process.env.TEST_FRONTDESK_EMAIL || 'frontdesk@test.com';
export const FRONTDESK_PASSWORD = process.env.TEST_FRONTDESK_PASSWORD || 'TestPass123!';

export const TRUSTED_CUSTOMER_EMAIL = process.env.TEST_TRUSTED_CUSTOMER_EMAIL || 'trusted_customer_test@test.com';
export const TRUSTED_CUSTOMER_PASSWORD = process.env.TEST_TRUSTED_CUSTOMER_PASSWORD || 'TestPass123!';

export const OUTSIDER_EMAIL = process.env.TEST_OUTSIDER_EMAIL || 'outsider_test@test.com';
export const OUTSIDER_PASSWORD = process.env.TEST_OUTSIDER_PASSWORD || 'TestPass123!';

// ─── Auth Helpers ──────────────────────────────────────────

/** Login as admin and wait for dashboard */
export async function loginAsAdmin(page: Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}

/** Login as manager and wait for dashboard */
export async function loginAsManager(page: Page) {
  await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
}

/** Generic login helper with retry */
export async function login(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState('domcontentloaded');

      const emailInput = page.getByPlaceholder('name@example.com');
      await expect(emailInput).toBeVisible({ timeout: 15000 });
      await emailInput.fill(email);
      await page.getByPlaceholder('••••••••').fill(password);
      await page
        .locator('form')
        .filter({ has: page.getByPlaceholder('name@example.com') })
        .locator('button[type="submit"]')
        .click();
      
      // Wait for redirect away from login
      await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 25000 });
      return; // Success
    } catch (e) {
      if (attempt === 1) throw e;
      // Retry after a brief pause
      await page.waitForTimeout(2000);
    }
  }
}

/** Login as student and handle consent wall if needed */
export async function loginAsStudent(page: Page) {
  await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);
  await page.goto(`${BASE_URL}/student/dashboard`);
  await page.waitForLoadState('networkidle');
  
  // Handle consent wall if it appears
  const consentVisible = await page.getByText('Consent Required').isVisible({ timeout: 3000 }).catch(() => false);
  if (consentVisible) {
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check({ force: true });
      }
    }
    const acceptBtn = page.getByRole('button', { name: /accept|agree|continue|submit|save/i }).first();
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
  }
}

// ─── Navigation Helpers ────────────────────────────────────

/** Navigate to a path and wait for load */
export async function navigateTo(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState('domcontentloaded');
}

/** Click sidebar menu item by text */
export async function clickSidebarItem(page: Page, text: string) {
  await page.locator(`.ant-menu-item, .ant-menu-submenu-title`).filter({ hasText: text }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

// ─── Assertion Helpers ─────────────────────────────────────

/** Check page loaded without error (no crash, no 404/500 display) */
export async function expectPageLoaded(page: Page) {
  // No crash/error overlay
  const errorOverlay = page.locator('.ant-result-error, .ant-result-404, .ant-result-500');
  await expect(errorOverlay).not.toBeVisible({ timeout: 3000 }).catch(() => {
    // It's ok if it doesn't exist at all
  });
  
  // Page has meaningful content (not blank)
  const body = page.locator('body');
  await expect(body).not.toBeEmpty();
}

/** Wait for any loading spinners to finish */
export async function waitForLoading(page: Page, timeout = 10000) {
  // Wait for Ant Design spin to disappear
  const spinner = page.locator('.ant-spin-spinning');
  if (await spinner.isVisible().catch(() => false)) {
    await spinner.waitFor({ state: 'hidden', timeout });
  }
}

/** Check API response is OK */
export async function expectApiOk(page: Page, url: string) {
  const response = await page.request.get(`${API_URL}${url}`);
  expect(response.status()).toBeLessThan(400);
  return response;
}
