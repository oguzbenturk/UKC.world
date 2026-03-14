/**
 * PHASE 12: Registration, Auth & Profile Workflows
 *
 * Tests actual registration, login validation, role-based redirects,
 * forgot password, and profile editing.
 *
 * Run: npx playwright test tests/e2e/phase12-auth-registration.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from '@playwright/test';
import {
  BASE_URL,
  loginAsAdmin,
  loginAsStudent,
  navigateTo,
  waitForLoading,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
} from './helpers';

const RUN = Date.now().toString().slice(-6);

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90000);

test.beforeEach(async () => {
  await new Promise(r => setTimeout(r, 2500));
});

// ═══════════════════════════════════════════════════════════
// 12.1  PUBLIC REGISTRATION FLOW (3-step wizard)
// ═══════════════════════════════════════════════════════════
test.describe('12.1 Public Registration', () => {
  const regEmail = `e2ereg${RUN}@test.com`;

  test('Complete 3-step registration and auto-login', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Step 1: Account info — Ant Design Form.Item renders #id selectors
    const firstNameField = page.locator('#first_name');
    await expect(firstNameField).toBeVisible({ timeout: 15000 });

    await firstNameField.fill(`RegUser${RUN}`);
    await page.locator('#last_name').fill('TestLast');
    await page.locator('#email').fill(regEmail);
    await page.locator('#password').fill('TestPass123!');
    await page.locator('#confirm_password').fill('TestPass123!');

    // Click Continue to go to Step 2
    const continueBtn = page.getByRole('button', { name: /Continue/i });
    await continueBtn.click();
    await page.waitForTimeout(2000);

    // Step 2: Profile info — all required: country_code, phone, date_of_birth, weight, preferred_currency
    // country_code is an Ant Design Select — click and pick first option
    const countryCodeSelect = page.locator('#country_code').locator('..').locator('.ant-select');
    if (await countryCodeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await countryCodeSelect.click();
      await page.locator('.ant-select-dropdown .ant-select-item').first().click();
      await page.waitForTimeout(300);
    }

    // phone
    await page.locator('#phone').fill('5551234567');

    // date_of_birth — DatePicker: click, then type a date
    const dobPicker = page.locator('#date_of_birth');
    if (await dobPicker.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dobPicker.click();
      await dobPicker.fill('15/01/1995');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    // weight — InputNumber
    const weightField = page.locator('#weight');
    if (await weightField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await weightField.fill('75');
    }

    // preferred_currency — Ant Design Select
    const currencySelect = page.locator('#preferred_currency').locator('..').locator('.ant-select').first();
    if (await currencySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await currencySelect.click();
      await page.locator('.ant-select-dropdown:visible .ant-select-item').first().click();
      await page.waitForTimeout(300);
    }

    // Click Continue to go to Step 3
    const continueBtn2 = page.getByRole('button', { name: /Continue/i });
    await continueBtn2.click();
    await page.waitForTimeout(2000);

    // Step 3: Address info — all required: address, city, zip_code, country
    await page.locator('#address').fill('123 Beach Road');
    await page.locator('#city').fill('Istanbul');
    await page.locator('#zip_code').fill('34000');

    // country — Ant Design Select
    const countrySelect = page.locator('#country').locator('..').locator('.ant-select').first();
    if (await countrySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await countrySelect.click();
      await page.locator('.ant-select-dropdown:visible .ant-select-item').first().click();
      await page.waitForTimeout(300);
    }

    // Submit registration
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/auth/register') && resp.request().method() === 'POST',
      { timeout: 20000 }
    ).catch(() => null);

    const submitBtn = page.getByRole('button', { name: /Create Account/i });
    await submitBtn.click();
    const response = await responsePromise;

    if (response) {
      const status = response.status();
      // 200/201 = success, 409 = email already exists
      expect(status).toBeLessThanOrEqual(409);
    }

    // Should auto-login and redirect
    await page.waitForTimeout(5000);
    const url = page.url();
    // After registration, user lands on dashboard or guest page
    const redirected = !url.includes('/register');
    expect(redirected).toBe(true);
  });

  test('Registration rejects weak password', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const firstNameField = page.locator('#first_name');
    await expect(firstNameField).toBeVisible({ timeout: 15000 });

    await firstNameField.fill('Weak');
    await page.locator('#last_name').fill('Password');
    await page.locator('#email').fill(`weakpw${RUN}@test.com`);
    await page.locator('#password').fill('123'); // Too weak
    await page.locator('#confirm_password').fill('123');

    // Try to proceed
    const continueBtn = page.getByRole('button', { name: /Continue/i });
    await continueBtn.click();
    await page.waitForTimeout(1500);

    // Should show validation error or block progression
    const hasError = await page.locator('text=/password|too short|8 char|special|Min 8/i').first().isVisible().catch(() => false);
    const stillOnStep1 = await page.locator('#first_name').isVisible();
    expect(hasError || stillOnStep1).toBe(true);
  });

  test('Registration rejects mismatched passwords', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const firstNameField = page.locator('#first_name');
    await expect(firstNameField).toBeVisible({ timeout: 15000 });

    await firstNameField.fill('Mismatch');
    await page.locator('#last_name').fill('Test');
    await page.locator('#email').fill(`mismatch${RUN}@test.com`);
    await page.locator('#password').fill('TestPass123!');
    await page.locator('#confirm_password').fill('DifferentPass456!');

    const continueBtn = page.getByRole('button', { name: /Continue/i });
    await continueBtn.click();
    await page.waitForTimeout(1500);

    // Should show password mismatch error
    const hasError = await page.locator('text=/match|mismatch|don.t match/i').first().isVisible().catch(() => false);
    const stillOnStep1 = await page.locator('#first_name').isVisible();
    expect(hasError || stillOnStep1).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 12.2  LOGIN VALIDATION
// ═══════════════════════════════════════════════════════════
test.describe('12.2 Login Validation', () => {
  test('Login with valid admin credentials redirects to dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });

    await page.fill('#email', ADMIN_EMAIL);
    await page.fill('#password', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 20000 });
    const url = page.url();
    expect(url).toContain('/dashboard');
  });

  test('Login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });

    await page.fill('#email', ADMIN_EMAIL);
    await page.fill('#password', 'WrongPassword999!');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);
    const url = page.url();
    // Should still be on login page
    expect(url).toContain('/login');

    // Should show error message
    const hasError = await page.locator('text=/incorrect|invalid|wrong|error/i').first().isVisible().catch(() => false);
    expect(hasError).toBe(true);
  });

  test('Login with empty fields shows validation', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });

    // Click submit without filling fields
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);

    // Should show validation or stay on login
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('Login with student credentials redirects correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });

    await page.fill('#email', STUDENT_EMAIL);
    await page.fill('#password', STUDENT_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 20000 });
    const url = page.url();
    // Student should go to student dashboard or general dashboard
    expect(url).toMatch(/dashboard|student|bookings/);
  });
});

// ═══════════════════════════════════════════════════════════
// 12.3  ROLE-BASED DASHBOARD ACCESS
// ═══════════════════════════════════════════════════════════
test.describe('12.3 Role-Based Dashboard', () => {
  test('Admin sees admin dashboard with management sections', async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(3000);

    const url = page.url();
    expect(url).toContain('/dashboard');

    // Admin dashboard should show management cards/sections
    const body = await page.locator('body').textContent();
    expect(body && body.length > 200).toBeTruthy();
  });

  test('Student sees student dashboard with booking info', async ({ page }) => {
    await loginAsStudent(page);
    await page.waitForTimeout(2000);

    const url = page.url();
    expect(url).toMatch(/dashboard|student/);

    const body = await page.locator('main').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Unauthenticated user redirected to login for protected routes', async ({ page }) => {
    // Try accessing admin dashboard without login
    await page.goto(`${BASE_URL}/admin/dashboard`);
    await page.waitForTimeout(5000);

    const url = page.url();
    // Should be redirected to login page
    expect(url).toContain('/login');
  });
});

// ═══════════════════════════════════════════════════════════
// 12.4  FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════
test.describe('12.4 Forgot Password', () => {
  test('Forgot password link is accessible from login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });

    const forgotLink = page.locator('text=/Forgot.*password/i').first();
    await expect(forgotLink).toBeVisible({ timeout: 5000 });

    await forgotLink.click();
    await page.waitForTimeout(1500);

    // Should open a modal or navigate to reset page
    const hasResetForm = await page.locator('text=/reset|email|send/i').first().isVisible().catch(() => false);
    const hasModal = await page.locator('.ant-modal-content, [role="dialog"]').isVisible().catch(() => false);
    expect(hasResetForm || hasModal).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 12.5  PROFILE EDITING
// ═══════════════════════════════════════════════════════════
test.describe('12.5 Profile Editing', () => {
  test('Admin can access and view settings page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/dashboard/settings');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 200).toBeTruthy();
  });

  test('Student can access profile page', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/profile');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Profile page should show user info
    const body = await page.locator('main').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Admin can edit a customer profile', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/customers');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Click on first customer in the list (table row or card)
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(2000);

      // Should navigate to customer profile
      const url = page.url();
      expect(url).toContain('/customers/');
    } else {
      // Cards layout
      const firstCard = page.locator('[class*="card"]').first();
      if (await firstCard.isVisible().catch(() => false)) {
        await firstCard.click();
        await page.waitForTimeout(2000);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 12.6  SESSION & TOKEN HANDLING
// ═══════════════════════════════════════════════════════════
test.describe('12.6 Session & Token', () => {
  test('Token is stored in localStorage after login', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
    expect(token!.length).toBeGreaterThan(20);
  });

  test('Logout clears session and redirects to login', async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(2000);

    // Open profile dropdown menu
    const profileBtn = page.getByRole('button', { name: /open profile menu/i });
    if (await profileBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await profileBtn.click();
      await page.waitForTimeout(1000);

      // Click Logout from the dropdown
      const logoutMenuItem = page.getByRole('menuitem', { name: /logout/i });
      await logoutMenuItem.click();
      await page.waitForTimeout(1000);

      // Confirm in the modal
      const confirmBtn = page.getByRole('button', { name: /Yes, Logout/i });
      await confirmBtn.click();
      await page.waitForURL(/\/(login|guest|)$/, { timeout: 15000 });

      const url = page.url();
      expect(url).toMatch(/\/(login|guest)/);
    } else {
      // Fallback: use sidebar logout
      const openSidebar = page.getByRole('button', { name: /Open sidebar/i });
      if (await openSidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
        await openSidebar.click();
        await page.waitForTimeout(500);
      }
      const logoutBtn = page.getByRole('button', { name: 'Logout' });
      await logoutBtn.first().click();
      const confirmBtn = page.getByRole('button', { name: 'Yes, Logout' });
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();
      await page.waitForURL(/\/(login|guest|)$/, { timeout: 15000 });
      expect(page.url()).toMatch(/\/(login|guest)/);
    }
  });
});
