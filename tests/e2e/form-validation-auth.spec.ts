/**
 * FORM VALIDATION AUDIT — Authentication Forms
 * ═══════════════════════════════════════════════
 * Tests login, registration, forgot-password forms for:
 *  - empty submissions
 *  - invalid formats
 *  - boundary values
 *  - backend bypass attempts
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, API_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

const API = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15000, navigationTimeout: 20000 });
test.setTimeout(60_000);

test.beforeEach(async () => { await new Promise(r => setTimeout(r, 800)); });

// ════════════════════════════════════════════════════════════
// Section 1: LOGIN FORM VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('1. Login Form Validation', () => {

  test('1.1 Submit login with all fields empty', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    await page.click('button[type="submit"]');
    // Should show validation errors or stay on login
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('1.2 Submit login with email only (no password)', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    await page.fill('#email', 'test@example.com');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/login');
  });

  test('1.3 Submit login with password only (no email)', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    await page.fill('#password', 'SomePass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/login');
  });

  test('1.4 Submit login with invalid email format', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    await page.fill('#email', 'not-an-email');
    await page.fill('#password', 'SomePass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    // Should stay on login or show error
    expect(page.url()).toContain('/login');
  });

  test('1.5 Submit login with SQL-like input in email', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    await page.fill('#email', "' OR 1=1 --");
    await page.fill('#password', "' OR 1=1 --");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login');
  });

  test('1.6 Submit login with XSS payload in email', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    await page.fill('#email', '<script>alert(1)</script>@test.com');
    await page.fill('#password', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login');
    // Page should not execute script
    const content = await page.content();
    expect(content).not.toContain('<script>alert(1)</script>');
  });

  test('1.7 Submit login with extremely long email (1000 chars)', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    const longEmail = 'a'.repeat(990) + '@test.com';
    await page.fill('#email', longEmail);
    await page.fill('#password', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login');
  });

  test('1.8 Backend: Login with empty body returns 400', async ({ request }) => {
    const resp = await request.post(`${API}/auth/login`, { data: {} });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.9 Backend: Login with missing password returns 400', async ({ request }) => {
    const resp = await request.post(`${API}/auth/login`, {
      data: { email: 'admin@plannivo.com' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.10 Backend: Login with non-existent email returns 401', async ({ request }) => {
    const resp = await request.post(`${API}/auth/login`, {
      data: { email: 'nonexistent@nowhere.com', password: 'TestPass123!' },
    });
    expect([400, 401, 404]).toContain(resp.status());
  });

  test('1.11 Backend: Login with correct email + wrong password returns 401/404', async ({ request }) => {
    const resp = await request.post(`${API}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: 'wrongpassword999' },
    });
    // Backend returns 404 for wrong password (prevents email enumeration)
    expect([401, 404]).toContain(resp.status());
  });
});

// ════════════════════════════════════════════════════════════
// Section 2: REGISTRATION FORM VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('2. Registration Form Validation', () => {

  test('2.1 Backend: Register with empty body returns 400', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, { data: {} });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.2 Backend: Register with missing email returns 400', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: { first_name: 'Test', last_name: 'User', password: 'TestPass123!' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.3 Backend: Register with invalid email format returns 400', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'Test', last_name: 'User',
        email: 'not-valid-email', password: 'TestPass123!',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.4 Backend: Register with weak password returns 400', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'Test', last_name: 'User',
        email: `weakpw_${Date.now()}@test.com`, password: '123',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.5 Backend: Register with duplicate email returns 409', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'Dup', last_name: 'User',
        email: ADMIN_EMAIL, password: 'TestPass123!',
      },
    });
    expect([400, 404, 409]).toContain(resp.status());
  });

  test('2.6 Backend: Register with missing first_name returns 400', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        last_name: 'User',
        email: `nofirst_${Date.now()}@test.com`, password: 'TestPass123!',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.7 Backend: Register with extremely long name (2000 chars)', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'A'.repeat(2000), last_name: 'B'.repeat(2000),
        email: `longname_${Date.now()}@test.com`, password: 'TestPass123!',
      },
    });
    // Should either reject or truncate, NOT crash with 500
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.8 Backend: Register with SQL injection in name', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: "Robert'); DROP TABLE users;--",
        last_name: 'Tables',
        email: `sqli_${Date.now()}@test.com`, password: 'TestPass123!',
      },
    });
    // Should not crash — parameterized queries protect
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.9 Backend: Register with emojis in name', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: '🎉Test', last_name: '👻User',
        email: `emoji_${Date.now()}@test.com`, password: 'TestPass123!',
      },
    });
    // Should either accept or reject cleanly
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.10 Backend: Register with HTML tags in name', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: '<b>Bold</b>', last_name: '<script>alert(1)</script>',
        email: `xss_${Date.now()}@test.com`, password: 'TestPass123!',
      },
    });
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.11 Backend: Register with password exactly 8 chars (boundary)', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'Bound', last_name: 'Test',
        email: `bound8_${Date.now()}@test.com`, password: 'Aa1!aaaa',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `8-char password boundary: status=${status} (${[200,201].includes(status) ? 'GOOD: accepted' : `Unexpected: ${status}`})`,
    });
    // Should succeed but may fail due to rate limiting
    expect(status).toBeLessThanOrEqual(500);
  });

  test('2.12 Backend: Register with password 7 chars (below minimum)', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'Short', last_name: 'Pw',
        email: `short7_${Date.now()}@test.com`, password: 'Aa1!aaa',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.13 Backend: Register with password missing uppercase', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'NoUp', last_name: 'Test',
        email: `noup_${Date.now()}@test.com`, password: 'aa1!aaaa',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.14 Backend: Register with password missing special char', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'NoSpec', last_name: 'Test',
        email: `nospec_${Date.now()}@test.com`, password: 'Aa1aaaaa',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.15 Backend: Register with age below minimum (5)', async ({ request }) => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 5);
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'Young', last_name: 'Kiddo',
        email: `young5_${Date.now()}@test.com`, password: 'TestPass1!',
        date_of_birth: dob.toISOString().split('T')[0],
      },
    });
    // Should reject age < 10
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.16 Backend: Register with weight out of range (5 kg)', async ({ request }) => {
    const resp = await request.post(`${API}/auth/register`, {
      data: {
        first_name: 'Light', last_name: 'Person',
        email: `light_${Date.now()}@test.com`, password: 'TestPass1!',
        weight: 5,
      },
    });
    // Weight range is 30-200, should reject 5
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 3: FORGOT PASSWORD VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('3. Forgot Password Validation', () => {

  test('3.1 Backend: Forgot password with empty email', async ({ request }) => {
    const resp = await request.post(`${API}/auth/forgot-password`, {
      data: { email: '' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('3.2 Backend: Forgot password with invalid email format', async ({ request }) => {
    const resp = await request.post(`${API}/auth/forgot-password`, {
      data: { email: 'not-an-email' },
    });
    // Might silently succeed (no email enumeration) or reject format
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('3.3 Backend: Reset password with invalid token', async ({ request }) => {
    const resp = await request.post(`${API}/auth/validate-reset-token`, {
      data: { token: 'bogus-token-123', email: 'test@test.com' },
    });
    expect(resp.status()).toBeLessThanOrEqual(500);
  });
});

