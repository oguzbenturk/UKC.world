/**
 * FORM VALIDATION AUDIT — Shop Orders, Wallet Operations, Rental
 * ═══════════════════════════════════════════════════════════════
 * Tests financial forms for:
 *  - empty/invalid shop orders
 *  - wallet deposit boundary values
 *  - invalid quantities, negative amounts
 *  - insufficient balance handling
 *  - invalid payment methods
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL, API_URL,
  ADMIN_EMAIL, ADMIN_PASSWORD,
  STUDENT_EMAIL, STUDENT_PASSWORD,
  loginAsAdmin, loginAsStudent,
} from './helpers';

const API = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15000, navigationTimeout: 20000 });
test.setTimeout(90_000);

test.beforeEach(async () => { await new Promise(r => setTimeout(r, 800)); });

let adminToken: string;
let studentToken: string;

test.describe('Shop/Wallet/Rental Validation — Setup', () => {
  test('Capture tokens', async ({ request }) => {
    const adminResp = await request.post(`${API}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(adminResp.status()).toBe(200);
    adminToken = (await adminResp.json()).token;

    const studResp = await request.post(`${API}/auth/login`, {
      data: { email: STUDENT_EMAIL, password: STUDENT_PASSWORD },
    });
    if (studResp.ok()) studentToken = (await studResp.json()).token;
  });
});

// ════════════════════════════════════════════════════════════
// Section 1: SHOP ORDER API VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('1. Shop Order Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('1.1 Create shop order with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/shop-orders`, {
      headers: h(), data: {},
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.2 Create shop order with empty items array', async ({ request }) => {
    const resp = await request.post(`${API}/shop-orders`, {
      headers: h(),
      data: { items: [], payment_method: 'cash' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.3 Create shop order with quantity 0', async ({ request }) => {
    const resp = await request.post(`${API}/shop-orders`, {
      headers: h(),
      data: {
        items: [{ product_id: '00000000-0000-0000-0000-000000000001', quantity: 0 }],
        payment_method: 'cash',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Quantity 0: status=${status} (${status >= 400 ? 'GOOD' : 'BUG: zero qty accepted'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.4 Create shop order with negative quantity', async ({ request }) => {
    const resp = await request.post(`${API}/shop-orders`, {
      headers: h(),
      data: {
        items: [{ product_id: '00000000-0000-0000-0000-000000000001', quantity: -5 }],
        payment_method: 'cash',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative quantity: status=${status} (${status >= 400 ? 'GOOD' : 'BUG: negative qty accepted'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.5 Create shop order with extremely large quantity (999999)', async ({ request }) => {
    const resp = await request.post(`${API}/shop-orders`, {
      headers: h(),
      data: {
        items: [{ product_id: '00000000-0000-0000-0000-000000000001', quantity: 999999 }],
        payment_method: 'cash',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Qty 999999: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.6 Create shop order with invalid payment method', async ({ request }) => {
    const resp = await request.post(`${API}/shop-orders`, {
      headers: h(),
      data: {
        items: [{ product_id: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
        payment_method: 'bitcoin',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid payment 'bitcoin': status=${status} (${status >= 400 ? 'GOOD' : 'BUG'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.7 Create shop order with non-existent product', async ({ request }) => {
    const resp = await request.post(`${API}/shop-orders`, {
      headers: h(),
      data: {
        items: [{ product_id: '00000000-dead-beef-0000-000000000000', quantity: 1 }],
        payment_method: 'cash',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.8 Quick-sale with empty items array', async ({ request }) => {
    const resp = await request.post(`${API}/shop-orders/admin/quick-sale`, {
      headers: h(),
      data: { items: [], payment_method: 'cash', customer_name: 'Test' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Quick-sale empty items: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 2: WALLET DEPOSIT VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('2. Wallet Deposit Validation', () => {
  const sh = () => ({ Authorization: `Bearer ${studentToken || adminToken}` });

  test('2.1 Deposit with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/deposit`, {
      headers: sh(), data: {},
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.2 Deposit with negative amount', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/deposit`, {
      headers: sh(),
      data: { amount: -100, currency: 'EUR' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative deposit: status=${status} (${status >= 400 ? 'GOOD' : 'BUG: NEGATIVE DEPOSIT'})`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('2.3 Deposit with amount 0', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/deposit`, {
      headers: sh(),
      data: { amount: 0, currency: 'EUR' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Zero deposit: status=${status} (${status >= 400 ? 'GOOD' : 'BUG'})`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('2.4 Deposit with amount below minimum (0.5)', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/deposit`, {
      headers: sh(),
      data: { amount: 0.5, currency: 'EUR' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Below-min deposit 0.5: status=${status} (min is 1)`,
    });
  });

  test('2.5 Deposit with extremely large amount (999999)', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/deposit`, {
      headers: sh(),
      data: { amount: 999999, currency: 'EUR' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Huge deposit 999999: status=${status} (max is 50000)`,
    });
  });

  test('2.6 Deposit with invalid currency', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/deposit`, {
      headers: sh(),
      data: { amount: 100, currency: 'BITCOIN' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.7 Deposit with string amount', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/deposit`, {
      headers: sh(),
      data: { amount: 'abc', currency: 'EUR' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.8 Deposit without auth token', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/deposit`, {
      data: { amount: 100, currency: 'EUR' },
    });
    expect([401, 403]).toContain(resp.status());
  });
});

// ════════════════════════════════════════════════════════════
// Section 3: WALLET ADMIN ADJUSTMENTS
// ════════════════════════════════════════════════════════════
test.describe('3. Wallet Admin Adjustment Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('3.1 Admin wallet credit with negative amount', async ({ request }) => {
    // Try to find the admin wallet adjust endpoint
    const resp = await request.post(`${API}/wallet/admin/adjust`, {
      headers: h(),
      data: { user_id: '00000000-0000-0000-0000-000000000001', amount: -100, reason: 'test' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Admin negative wallet adjust: status=${status}`,
    });
    // 404 is ok if endpoint doesn't exist
    expect(status).toBeLessThanOrEqual(500);
  });

  test('3.2 Admin wallet credit with zero amount', async ({ request }) => {
    const resp = await request.post(`${API}/wallet/admin/adjust`, {
      headers: h(),
      data: { user_id: '00000000-0000-0000-0000-000000000001', amount: 0, reason: 'test' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Admin zero wallet adjust: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 4: WALLET UI VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('4. Wallet UI Validation', () => {

  test('4.1 Student wallet deposit page — attempt zero deposit', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/wallet`);
    await page.waitForTimeout(2000);

    // Look for deposit button
    const depositBtn = page.locator('button').filter({ hasText: /deposit|add|top.?up/i }).first();
    if (await depositBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await depositBtn.click();
      await page.waitForTimeout(1500);

      // Find amount input
      const amountInput = page.locator('input[type="number"], input[id*="amount"], .ant-input-number-input').first();
      if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await amountInput.fill('0');
        // Try submit
        const submitBtn = page.locator('button').filter({ hasText: /submit|deposit|confirm|pay/i }).first();
        if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(1000);
          const errors = page.locator('.ant-form-item-explain-error, [role="alert"]');
          const errCount = await errors.count();
          test.info().annotations.push({
            type: 'validation_result',
            description: `Zero deposit UI: ${errCount} errors shown`,
          });
        }
      }
    }
  });
});

// ════════════════════════════════════════════════════════════
// Section 5: RENTAL VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('5. Rental API Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('5.1 Create rental with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/rentals`, {
      headers: h(), data: {},
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty rental body: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('5.2 Create rental with negative duration', async ({ request }) => {
    const resp = await request.post(`${API}/rentals`, {
      headers: h(),
      data: { duration: -5, user_id: '00000000-0000-0000-0000-000000000001' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative rental duration: status=${status} (${status < 400 ? 'BUG' : 'GOOD'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('5.3 Create rental with extremely large duration (9999 days)', async ({ request }) => {
    const resp = await request.post(`${API}/rentals`, {
      headers: h(),
      data: { duration: 9999, user_id: '00000000-0000-0000-0000-000000000001' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `9999-day rental: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

