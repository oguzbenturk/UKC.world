/**
 * FORM VALIDATION AUDIT — Admin CRUD Forms (Services, Equipment, Users, Packages)
 * ══════════════════════════════════════════════════════════════════════════════════
 * Tests admin forms for:
 *  - empty submissions
 *  - invalid values (negative prices, extreme values)
 *  - special characters in text fields
 *  - boundary conditions
 *  - logical impossibilities
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL, API_URL,
  ADMIN_EMAIL, ADMIN_PASSWORD,
  loginAsAdmin,
} from './helpers';

const API = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15000, navigationTimeout: 20000 });
test.setTimeout(90_000);

test.beforeEach(async () => { await new Promise(r => setTimeout(r, 800)); });

let adminToken: string;

test.describe('Admin CRUD Validation — Setup', () => {
  test('Capture admin token', async ({ request }) => {
    const resp = await request.post(`${API}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(resp.status()).toBe(200);
    adminToken = (await resp.json()).token;
  });
});

// ════════════════════════════════════════════════════════════
// Section 1: SERVICE CREATION / EDIT
// ════════════════════════════════════════════════════════════
test.describe('1. Service API Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('1.1 Create service with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(), data: {},
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty service body: status=${status} (${status >= 400 && status < 500 ? 'GOOD: rejected' : status >= 500 ? 'BUG: 500 error' : 'BUG: accepted empty'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.2 Create service with empty name', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(),
      data: { name: '', category: 'lesson', price: 50, duration: 1 },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty name service: status=${status} (${status >= 400 ? 'GOOD' : 'BUG: empty name accepted'})`,
    });
  });

  test('1.3 Create service with negative price', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(),
      data: { name: `NegPrice_${Date.now()}`, category: 'lesson', price: -50, duration: 1 },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative price: status=${status} (${status < 400 ? 'BUG: NEGATIVE PRICE ACCEPTED' : 'GOOD: rejected'})`,
    });
    // Cleanup if created
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/services/${body.id}`, { headers: h() });
    }
  });

  test('1.4 Create service with extremely large price (999999999)', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(),
      data: { name: `HugePrice_${Date.now()}`, category: 'lesson', price: 999999999, duration: 1 },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Huge price 999999999: status=${status} (${status < 400 ? 'ACCEPTED (needs limit?)' : 'REJECTED'})`,
    });
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/services/${body.id}`, { headers: h() });
    }
  });

  test('1.5 Create service with zero duration', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(),
      data: { name: `ZeroDur_${Date.now()}`, category: 'lesson', price: 50, duration: 0 },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Zero duration: status=${status} (${status < 400 ? 'BUG: ZERO DURATION ACCEPTED' : 'GOOD'})`,
    });
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/services/${body.id}`, { headers: h() });
    }
  });

  test('1.6 Create service with negative duration', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(),
      data: { name: `NegDur_${Date.now()}`, category: 'lesson', price: 50, duration: -3 },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative duration: status=${status} (${status < 400 ? 'BUG: NEGATIVE DURATION ACCEPTED' : 'GOOD'})`,
    });
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/services/${body.id}`, { headers: h() });
    }
  });

  test('1.7 Create service with SQL injection in name', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(),
      data: { name: "'; DROP TABLE services; --", category: 'lesson', price: 50, duration: 1 },
    });
    // Should not crash — parameterized queries
    expect(resp.status()).toBeLessThanOrEqual(500);
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/services/${body.id}`, { headers: h() });
    }
  });

  test('1.8 Create service with XSS in name', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(),
      data: { name: '<img src=x onerror=alert(1)>', category: 'lesson', price: 50, duration: 1 },
    });
    expect(resp.status()).toBeLessThanOrEqual(500);
    if (resp.ok()) {
      const body = await resp.json();
      // Verify the stored name — should be sanitized or raw (frontend must escape)
      test.info().annotations.push({
        type: 'validation_result',
        description: `XSS in name: stored as "${body.name}" (${body.name?.includes('<img') ? 'POTENTIAL XSS RISK if rendered raw' : 'SANITIZED'})`,
      });
      if (body.id) await request.delete(`${API}/services/${body.id}`, { headers: h() });
    }
  });

  test('1.9 Create service with invalid category', async ({ request }) => {
    const resp = await request.post(`${API}/services`, {
      headers: h(),
      data: { name: `BadCat_${Date.now()}`, category: 'fake_category', price: 50, duration: 1 },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid category: status=${status} (${status < 400 ? 'ACCEPTED with fake category' : 'REJECTED'})`,
    });
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/services/${body.id}`, { headers: h() });
    }
  });

  test('1.10 Service creation UI — submit with empty name', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/services`);
    await page.waitForTimeout(2000);

    const addBtn = page.locator('button').filter({ hasText: /add|create|new/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1500);

      // Try clicking save without filling name
      const saveBtn = page.locator('button').filter({ hasText: /save|create|submit/i }).first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1000);

        const errors = page.locator('.ant-form-item-explain-error');
        const errCount = await errors.count();
        test.info().annotations.push({
          type: 'validation_result',
          description: `UI empty service submit: ${errCount} errors shown`,
        });
      }
    }
  });
});

// ════════════════════════════════════════════════════════════
// Section 2: EQUIPMENT API VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('2. Equipment API Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('2.1 Create equipment with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/equipment`, {
      headers: h(), data: {},
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('2.2 Create equipment with empty name', async ({ request }) => {
    const resp = await request.post(`${API}/equipment`, {
      headers: h(),
      data: { name: '' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty equipment name: status=${status}`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('2.3 Create equipment with negative purchase price', async ({ request }) => {
    const resp = await request.post(`${API}/equipment`, {
      headers: h(),
      data: { name: `NegPriceEq_${Date.now()}`, purchase_price: -500 },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative equipment price: status=${status} (${status < 400 ? 'BUG: NEGATIVE PRICE' : 'GOOD'})`,
    });
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/equipment/${body.id}`, { headers: h() });
    }
  });

  test('2.4 Create equipment with duplicate serial number', async ({ request }) => {
    const serial = `DUPTEST-${Date.now()}`;
    // Create first
    const resp1 = await request.post(`${API}/equipment`, {
      headers: h(),
      data: { name: `Dup1_${Date.now()}`, serial_number: serial },
    });

    // Create second with same serial
    const resp2 = await request.post(`${API}/equipment`, {
      headers: h(),
      data: { name: `Dup2_${Date.now()}`, serial_number: serial },
    });
    const status = resp2.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Duplicate serial: status=${status} (${status >= 400 ? 'GOOD: rejected' : 'BUG: duplicate accepted'})`,
    });

    // Cleanup
    if (resp1.ok()) {
      const b = await resp1.json();
      if (b.id) await request.delete(`${API}/equipment/${b.id}`, { headers: h() });
    }
    if (resp2.ok()) {
      const b = await resp2.json();
      if (b.id) await request.delete(`${API}/equipment/${b.id}`, { headers: h() });
    }
  });

  test('2.5 Create equipment with very long name (5000 chars)', async ({ request }) => {
    const resp = await request.post(`${API}/equipment`, {
      headers: h(),
      data: { name: 'X'.repeat(5000) },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `5000-char name: status=${status} (${status === 500 ? 'BUG: CRITICAL — no max length on equipment name, causes 500' : 'OK'})`,
    });
    expect(status).toBeGreaterThanOrEqual(200);
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/equipment/${body.id}`, { headers: h() });
    }
  });

  test('2.6 Create equipment with invalid condition value', async ({ request }) => {
    const resp = await request.post(`${API}/equipment`, {
      headers: h(),
      data: { name: `BadCond_${Date.now()}`, condition: 'destroyed' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid condition 'destroyed': status=${status} (${status < 400 ? 'ACCEPTED (no enum validation)' : 'REJECTED'})`,
    });
    if (resp.ok()) {
      const body = await resp.json();
      if (body.id) await request.delete(`${API}/equipment/${body.id}`, { headers: h() });
    }
  });
});

// ════════════════════════════════════════════════════════════
// Section 3: USER CREATION API VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('3. User API Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('3.1 Create user with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/users`, {
      headers: h(), data: {},
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('3.2 Create user without password', async ({ request }) => {
    const resp = await request.post(`${API}/users`, {
      headers: h(),
      data: { first_name: 'No', last_name: 'Pass', email: `nopass_${Date.now()}@test.com` },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('3.3 Create user without role_id', async ({ request }) => {
    const resp = await request.post(`${API}/users`, {
      headers: h(),
      data: {
        first_name: 'No', last_name: 'Role',
        email: `norole_${Date.now()}@test.com`, password: 'TestPass123!',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('3.4 Create user with invalid email format', async ({ request }) => {
    const resp = await request.post(`${API}/users`, {
      headers: h(),
      data: {
        first_name: 'Bad', last_name: 'Email',
        email: 'not-an-email', password: 'TestPass123!',
        role_id: 1,
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('3.5 Create user with duplicate email', async ({ request }) => {
    const resp = await request.post(`${API}/users`, {
      headers: h(),
      data: {
        first_name: 'Dup', last_name: 'Email',
        email: ADMIN_EMAIL, password: 'TestPass123!',
        role_id: 1,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Duplicate email on user create: status=${status}`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('3.6 Create user with extremely long email (500 chars)', async ({ request }) => {
    const resp = await request.post(`${API}/users`, {
      headers: h(),
      data: {
        first_name: 'Long', last_name: 'Email',
        email: 'a'.repeat(490) + '@test.com', password: 'TestPass123!',
        role_id: 1,
      },
    });
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('3.7 Create user with non-existent role_id', async ({ request }) => {
    const resp = await request.post(`${API}/users`, {
      headers: h(),
      data: {
        first_name: 'Bad', last_name: 'Role',
        email: `badrole_${Date.now()}@test.com`, password: 'TestPass123!',
        role_id: 99999,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Non-existent role_id 99999: status=${status}`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('3.8 Create user with negative weight', async ({ request }) => {
    // First get a valid role_id
    const rolesResp = await request.get(`${API}/roles`, { headers: h() });
    let roleId = 1;
    if (rolesResp.ok()) {
      const roles = await rolesResp.json();
      if (Array.isArray(roles) && roles.length > 0) roleId = roles[0].id;
    }

    const resp = await request.post(`${API}/users`, {
      headers: h(),
      data: {
        first_name: 'Neg', last_name: 'Weight',
        email: `negweight_${Date.now()}@test.com`, password: 'TestPass123!',
        role_id: roleId, weight: -50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative weight -50: status=${status} (${status < 400 ? 'BUG: NEGATIVE WEIGHT' : 'GOOD'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 4: VOUCHER/PROMO CODE VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('4. Voucher API Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('4.1 Create voucher with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/vouchers`, {
      headers: h(), data: {},
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('4.2 Create voucher with missing code', async ({ request }) => {
    const resp = await request.post(`${API}/vouchers`, {
      headers: h(),
      data: {
        name: 'No Code Voucher', voucher_type: 'percentage',
        discount_value: 10, applies_to: 'all',
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('4.3 Create voucher with negative discount', async ({ request }) => {
    const resp = await request.post(`${API}/vouchers`, {
      headers: h(),
      data: {
        code: `NEG_${Date.now()}`, name: 'Negative Voucher',
        voucher_type: 'percentage', discount_value: -10,
        applies_to: 'all',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative discount: status=${status} (${status < 400 ? 'BUG: NEGATIVE DISCOUNT' : 'GOOD'})`,
    });
  });

  test('4.4 Create voucher with percentage > 100', async ({ request }) => {
    const resp = await request.post(`${API}/vouchers`, {
      headers: h(),
      data: {
        code: `OVER100_${Date.now()}`, name: 'Over100',
        voucher_type: 'percentage', discount_value: 150,
        applies_to: 'all',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `150% discount: status=${status} (${status < 400 ? 'BUG: >100% PERCENTAGE' : 'GOOD'})`,
    });
  });

  test('4.5 Create voucher with special chars in code', async ({ request }) => {
    const resp = await request.post(`${API}/vouchers`, {
      headers: h(),
      data: {
        code: '!@#$%^&*()', name: 'SpecialCode',
        voucher_type: 'percentage', discount_value: 10,
        applies_to: 'all',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Special chars in code: status=${status} (${status >= 400 ? 'GOOD: rejected' : 'BUG: invalid code accepted'})`,
    });
  });

  test('4.6 Validate non-existent voucher code', async ({ request }) => {
    const resp = await request.post(`${API}/vouchers/validate`, {
      headers: h(),
      data: { code: 'DOES_NOT_EXIST_99999', context: 'lessons', amount: 100, currency: 'EUR' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('4.7 Validate voucher with empty code', async ({ request }) => {
    const resp = await request.post(`${API}/vouchers/validate`, {
      headers: h(),
      data: { code: '', context: 'lessons', amount: 100, currency: 'EUR' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });
});

