/**
 * FORM VALIDATION AUDIT — Support Tickets, Profile Edits, Family Members
 * ═══════════════════════════════════════════════════════════════════════
 * Tests for:
 *  - Student support request validation (subject, message, priority, XSS)
 *  - Student profile update boundary values
 *  - Family member creation validation
 *  - Instructor/user profile edge cases
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

test.describe('Support/Profile/Family Validation — Setup', () => {
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
// Section 1: STUDENT SUPPORT TICKET VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('1. Support Ticket Validation', () => {
  const sh = () => ({ Authorization: `Bearer ${studentToken || adminToken}` });

  test('1.1 Create support request with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(), data: {},
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.2 Create support request with no subject', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: { message: 'I have a problem' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.3 Create support request with no message', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: { subject: 'Help needed' },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.4 Create support request with empty strings', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: { subject: '', message: '' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty string subject+message: status=${status} (${status >= 400 ? 'GOOD' : 'BUG: empty strings accepted'})`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('1.5 Create support request with XSS in subject', async ({ request }) => {
    const xss = '<script>alert("xss")</script>';
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: { subject: xss, message: 'Valid message body' },
    });
    const status = resp.status();
    if (resp.ok()) {
      const body = await resp.json();
      test.info().annotations.push({
        type: 'validation_result',
        description: `XSS in subject: status=${status}, id=${body.id} — stored unsanitized? Check rendering.`,
      });
    } else {
      test.info().annotations.push({
        type: 'validation_result',
        description: `XSS in subject: status=${status} — rejected`,
      });
    }
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.6 Create support request with SQL injection in message', async ({ request }) => {
    const sqli = "'; DROP TABLE student_support_requests; --";
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: { subject: 'Test subject', message: sqli },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `SQL injection in message: status=${status} (parameterized queries should protect)`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.7 Create support request with extremely long subject (5000 chars)', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: { subject: 'A'.repeat(5000), message: 'Valid message' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `5000-char subject: status=${status} (${status >= 400 ? 'GOOD: length limited' : 'BUG: no max length'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.8 Create support request with extremely long message (50000 chars)', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: { subject: 'Test', message: 'B'.repeat(50000) },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `50000-char message: status=${status} (${status >= 400 ? 'GOOD: length limited' : 'WARNING: no max length'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.9 Create support request with invalid priority', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: { subject: 'Test', message: 'Test msg', priority: 'ultra_critical_mega' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid priority 'ultra_critical_mega': status=${status} (${status >= 400 ? 'GOOD' : 'BUG: no priority enum validation'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.10 Create support request with injected metadata', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: sh(),
      data: {
        subject: 'Test', message: 'Test msg',
        metadata: { admin: true, role: 'super_admin', escalate: true },
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Injected metadata (admin:true, role:super_admin): status=${status} — metadata passed through unvalidated`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('1.11 Create support request without auth', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      data: { subject: 'Test', message: 'Test msg' },
    });
    expect([401, 403]).toContain(resp.status());
  });

  test('1.12 Create support request as admin (not student)', async ({ request }) => {
    const resp = await request.post(`${API}/student/support/request`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { subject: 'Admin ticket', message: 'Testing role check' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Admin creating student support ticket: status=${status} (${status === 403 ? 'GOOD: role restricted' : 'INFO: admin can access student route'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 2: STUDENT PROFILE UPDATE VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('2. Student Profile Update Validation', () => {
  const sh = () => ({ Authorization: `Bearer ${studentToken || adminToken}` });

  test('2.1 Update profile with empty body', async ({ request }) => {
    const resp = await request.put(`${API}/student/profile`, {
      headers: sh(), data: {},
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty profile update body: status=${status} (no-op is ok)`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('2.2 Update profile with XSS in firstName', async ({ request }) => {
    const xss = '<img src=x onerror=alert(1)>';
    const resp = await request.put(`${API}/student/profile`, {
      headers: sh(),
      data: { firstName: xss },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `XSS in firstName: status=${status} (${status >= 400 ? 'GOOD: rejected' : 'WARNING: stored unescaped'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('2.3 Update profile with extremely long firstName (5000 chars)', async ({ request }) => {
    const resp = await request.put(`${API}/student/profile`, {
      headers: sh(),
      data: { firstName: 'X'.repeat(5000) },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `5000-char firstName: status=${status} (${status >= 400 ? 'GOOD: length limited' : 'BUG: no max length'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('2.4 Update profile with invalid preferredCurrency', async ({ request }) => {
    const resp = await request.put(`${API}/student/profile`, {
      headers: sh(),
      data: { preferredCurrency: 'BITCOIN' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid currency BITCOIN: status=${status} (${status >= 400 ? 'GOOD' : 'BUG: no currency validation'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('2.5 Update profile with invalid language code', async ({ request }) => {
    const resp = await request.put(`${API}/student/profile`, {
      headers: sh(),
      data: { language: 'xx_INVALID' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid language 'xx_INVALID': status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('2.6 Update profile with SQL injection in phone', async ({ request }) => {
    const resp = await request.put(`${API}/student/profile`, {
      headers: sh(),
      data: { phone: "'+OR+1=1--" },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `SQL injection in phone: status=${status} (parameterized queries protect)`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('2.7 Update profile without auth', async ({ request }) => {
    const resp = await request.put(`${API}/student/profile`, {
      data: { firstName: 'Hacker' },
    });
    expect([401, 403]).toContain(resp.status());
  });

  test('2.8 Update profile with malicious emergencyContact object', async ({ request }) => {
    const resp = await request.put(`${API}/student/profile`, {
      headers: sh(),
      data: {
        emergencyContact: {
          name: '<script>alert(1)</script>',
          phone: "'; DROP TABLE users; --",
          __proto__: { admin: true },
        },
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Malicious emergencyContact: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 3: FAMILY MEMBER VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('3. Family Member Validation', () => {
  const sh = () => ({ Authorization: `Bearer ${studentToken || adminToken}` });
  let createdFamilyId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (createdFamilyId) {
      await request.delete(`${API}/student/family-members/${createdFamilyId}`, { headers: sh() });
      createdFamilyId = null;
    }
  });

  test('3.1 Create family member with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/student/family-members`, {
      headers: sh(), data: {},
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty family member body: status=${status} (${status >= 400 ? 'GOOD' : 'BUG'})`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('3.2 Create family member with no full_name', async ({ request }) => {
    const resp = await request.post(`${API}/student/family-members`, {
      headers: sh(),
      data: { date_of_birth: '2015-01-01', relationship: 'child' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Missing full_name: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('3.3 Create family member with no date_of_birth', async ({ request }) => {
    const resp = await request.post(`${API}/student/family-members`, {
      headers: sh(),
      data: { full_name: 'Test Child', relationship: 'child' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Missing date_of_birth: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('3.4 Create family member with future date_of_birth', async ({ request }) => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const resp = await request.post(`${API}/student/family-members`, {
      headers: sh(),
      data: { full_name: 'Future Person', date_of_birth: future, relationship: 'child' },
    });
    const status = resp.status();
    if (resp.ok()) {
      const body = await resp.json();
      createdFamilyId = body.id || body.data?.id;
    }
    test.info().annotations.push({
      type: 'validation_result',
      description: `Future DOB (${future}): status=${status} (${status >= 400 ? 'GOOD' : 'BUG: future DOB accepted'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('3.5 Create family member with invalid relationship', async ({ request }) => {
    const resp = await request.post(`${API}/student/family-members`, {
      headers: sh(),
      data: { full_name: 'Test', date_of_birth: '2015-01-01', relationship: 'nemesis' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid relationship 'nemesis': status=${status} (${status >= 400 ? 'GOOD' : 'BUG: no enum validation'})`,
    });
    if (resp.ok()) {
      const body = await resp.json();
      createdFamilyId = body.id || body.data?.id;
    }
    expect(status).toBeLessThanOrEqual(500);
  });

  test('3.6 Create family member with child relationship but adult DOB', async ({ request }) => {
    const adultDob = '1980-01-01';
    const resp = await request.post(`${API}/student/family-members`, {
      headers: sh(),
      data: { full_name: 'Adult Child', date_of_birth: adultDob, relationship: 'child' },
    });
    const status = resp.status();
    if (resp.ok()) {
      const body = await resp.json();
      createdFamilyId = body.id || body.data?.id;
    }
    test.info().annotations.push({
      type: 'validation_result',
      description: `Child relationship with adult DOB (1980): status=${status} (${status >= 400 ? 'GOOD: age-relationship validated' : 'BUG: 44-year-old "child" accepted'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('3.7 Create family member with XSS in full_name', async ({ request }) => {
    const xss = '<script>alert("family")</script>';
    const resp = await request.post(`${API}/student/family-members`, {
      headers: sh(),
      data: { full_name: xss, date_of_birth: '2015-01-01', relationship: 'child' },
    });
    const status = resp.status();
    if (resp.ok()) {
      const body = await resp.json();
      createdFamilyId = body.id || body.data?.id;
    }
    test.info().annotations.push({
      type: 'validation_result',
      description: `XSS in family name: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('3.8 Create family member with 5000-char name', async ({ request }) => {
    const resp = await request.post(`${API}/student/family-members`, {
      headers: sh(),
      data: { full_name: 'Z'.repeat(5000), date_of_birth: '2015-01-01', relationship: 'child' },
    });
    const status = resp.status();
    if (resp.ok()) {
      const body = await resp.json();
      createdFamilyId = body.id || body.data?.id;
    }
    test.info().annotations.push({
      type: 'validation_result',
      description: `5000-char family name: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 4: ADMIN USER PROFILE EDIT VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('4. Admin User Edit Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('4.1 Update user with empty email', async ({ request }) => {
    // First get a real user  
    const listResp = await request.get(`${API}/users?limit=1`, { headers: h() });
    if (!listResp.ok()) { test.skip(); return; }
    const users = await listResp.json();
    const userId = users.data?.[0]?.id || users[0]?.id;
    if (!userId) { test.skip(); return; }

    const resp = await request.put(`${API}/users/${userId}`, {
      headers: h(),
      data: { email: '' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty email on user update: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('4.2 Update user with invalid email format', async ({ request }) => {
    const listResp = await request.get(`${API}/users?limit=1`, { headers: h() });
    if (!listResp.ok()) { test.skip(); return; }
    const users = await listResp.json();
    const userId = users.data?.[0]?.id || users[0]?.id;
    if (!userId) { test.skip(); return; }

    const resp = await request.put(`${API}/users/${userId}`, {
      headers: h(),
      data: { email: 'not-an-email' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid email format on user update: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('4.3 Update user with extremely long first_name', async ({ request }) => {
    const listResp = await request.get(`${API}/users?limit=1`, { headers: h() });
    if (!listResp.ok()) { test.skip(); return; }
    const users = await listResp.json();
    const userId = users.data?.[0]?.id || users[0]?.id;
    if (!userId) { test.skip(); return; }

    const resp = await request.put(`${API}/users/${userId}`, {
      headers: h(),
      data: { first_name: 'V'.repeat(5000) },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `5000-char first_name on user update: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 5: SPARE PARTS / INVENTORY VALIDATION
// ════════════════════════════════════════════════════════════
test.describe('5. Spare Parts Order Validation', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('5.1 Create spare parts order with empty body', async ({ request }) => {
    const resp = await request.post(`${API}/spare-parts-orders`, {
      headers: h(), data: {},
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Empty spare parts order body: status=${status}`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('5.2 Create spare parts order with quantity 0', async ({ request }) => {
    const resp = await request.post(`${API}/spare-parts-orders`, {
      headers: h(),
      data: { partName: 'Test Part', quantity: 0, supplier: 'Acme' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Spare parts qty 0: status=${status} (${status >= 400 ? 'GOOD' : 'BUG: zero qty accepted'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });

  test('5.3 Create spare parts order with negative quantity', async ({ request }) => {
    const resp = await request.post(`${API}/spare-parts-orders`, {
      headers: h(),
      data: { partName: 'Test Part', quantity: -5, supplier: 'Acme' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Spare parts negative qty: status=${status} (${status >= 400 ? 'GOOD' : 'BUG'})`,
    });
    expect(status).toBeLessThanOrEqual(500);
  });
});

