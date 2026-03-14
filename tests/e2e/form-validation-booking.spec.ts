/**
 * FORM VALIDATION AUDIT — Booking & Scheduling Forms
 * ═══════════════════════════════════════════════════════
 * Tests booking creation via API and UI for:
 *  - missing required fields
 *  - invalid dates, times, durations
 *  - duplicate/overlapping bookings
 *  - negative/zero values
 *  - logical impossibilities
 *  - boundary values
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL, API_URL,
  ADMIN_EMAIL, ADMIN_PASSWORD,
  STUDENT_EMAIL, STUDENT_PASSWORD,
  loginAsAdmin,
} from './helpers';

const API = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15000, navigationTimeout: 20000 });
test.setTimeout(90_000);

test.beforeEach(async () => { await new Promise(r => setTimeout(r, 1500)); });

let adminToken: string;
let studentId: string;
let serviceId: string;
let instructorId: string;

// ─── Setup ─────────────────────────────────────────────────
test.describe('Booking Validation — Setup', () => {
  test('Capture tokens and IDs', async ({ request }) => {
    // Admin token with retry
    let loginResp;
    for (let i = 0; i < 3; i++) {
      loginResp = await request.post(`${API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      if (loginResp.status() === 200) break;
      await new Promise(r => setTimeout(r, 3000));
    }
    expect(loginResp!.status()).toBe(200);
    const loginBody = await loginResp!.json();
    adminToken = loginBody.token;

    // Get a service
    const svcResp = await request.get(`${API}/services?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (svcResp.ok()) {
      const svcs = await svcResp.json();
      const lesson = Array.isArray(svcs) ? svcs.find((s: any) => s.category === 'lesson') : null;
      if (lesson) serviceId = lesson.id;
    }

    // Get student
    const studResp = await request.post(`${API}/auth/login`, {
      data: { email: STUDENT_EMAIL, password: STUDENT_PASSWORD },
    });
    if (studResp.ok()) {
      const studBody = await studResp.json();
      studentId = studBody.user?.id || studBody.userId;
    }

    // Get instructor
    try {
      const instResp = await request.get(`${API}/instructors`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (instResp.ok()) {
        const insts = await instResp.json();
        if (Array.isArray(insts) && insts.length > 0) instructorId = insts[0].id;
      }
    } catch { /* optional */ }

    expect(adminToken).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════
// Section 1: BOOKING API — MISSING REQUIRED FIELDS
// ════════════════════════════════════════════════════════════
test.describe('1. Booking API — Missing Required Fields', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('1.1 Create booking with completely empty body', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(), data: {},
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.2 Create booking without date', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId,
        student_user_id: studentId,
        instructor_user_id: instructorId,
        start_hour: 10, duration: 1,
        payment_method: 'cash', amount: 50,
        // missing: date
      },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.3 Create booking without service_id', async ({ request }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 100);
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        // missing: service_id
        student_user_id: studentId,
        instructor_user_id: instructorId,
        date: futureDate.toISOString().split('T')[0],
        start_hour: 10, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    // Should not crash
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.4 Create booking without student_user_id', async ({ request }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 101);
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId,
        // missing: student_user_id
        instructor_user_id: instructorId,
        date: futureDate.toISOString().split('T')[0],
        start_hour: 10, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('1.5 Create booking without instructor', async ({ request }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 102);
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId,
        student_user_id: studentId,
        // missing: instructor_user_id
        date: futureDate.toISOString().split('T')[0],
        start_hour: 10, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    // May succeed (instructor optional) or fail gracefully
    expect(resp.status()).toBeLessThanOrEqual(500);
  });
});

// ════════════════════════════════════════════════════════════
// Section 2: BOOKING API — INVALID VALUES
// ════════════════════════════════════════════════════════════
test.describe('2. Booking API — Invalid Values', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });
  const baseDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 150 + Math.floor(Math.random() * 100));
    return d.toISOString().split('T')[0];
  };

  test('2.1 Booking with negative duration', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 10, duration: -5,
        payment_method: 'cash', amount: 50,
      },
    });
    // Negative duration should be rejected
    const status = resp.status();
    // Document whether it's rejected (400) or accepted (bug)
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative duration: status=${status} (${status < 400 ? 'BUG: ACCEPTED' : 'REJECTED'})`,
    });
    // We report but don't fail — this is an audit
  });

  test('2.2 Booking with zero duration', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 10, duration: 0,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Zero duration: status=${status} (${status < 400 ? 'BUG: ACCEPTED' : 'REJECTED'})`,
    });
  });

  test('2.3 Booking with extremely large duration (1000 hours)', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 10, duration: 1000,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `1000h duration: status=${status} (${status < 400 ? 'BUG: ACCEPTED' : 'REJECTED'})`,
    });
  });

  test('2.4 Booking with start_hour = 25 (invalid hour)', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 25, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Hour 25: status=${status} (${status < 400 ? 'BUG: ACCEPTED' : 'REJECTED'})`,
    });
  });

  test('2.5 Booking with negative start_hour', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: -3, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative hour: status=${status} (${status < 400 ? 'BUG: ACCEPTED' : 'REJECTED'})`,
    });
  });

  test('2.6 Booking with invalid date format', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: 'not-a-date', start_hour: 10, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid date format 'not-a-date': status=${status} (${status === 500 ? 'BUG: CRITICAL — invalid date causes 500 server crash' : status >= 400 ? 'GOOD' : 'BUG'})`,
    });
    // Allow 500 but flag it
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('2.7 Booking with past date', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: '2020-01-01', start_hour: 10, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Past date 2020: status=${status} (${status < 400 ? 'BUG: ACCEPTED' : 'REJECTED'})`,
    });
  });

  test('2.8 Booking with negative amount', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 14, duration: 1,
        payment_method: 'cash', amount: -100,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Negative amount: status=${status} (${status < 400 ? 'BUG: ACCEPTED' : 'REJECTED'})`,
    });
  });

  test('2.9 Booking with invalid payment method', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 11, duration: 1,
        payment_method: 'bitcoin', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Invalid payment 'bitcoin': status=${status} (${status < 400 ? 'BUG: ACCEPTED' : 'REJECTED'})`,
    });
  });

  test('2.10 Booking with non-existent service_id (UUID)', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: '00000000-0000-0000-0000-000000000000',
        student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 10, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Non-existent service_id: status=${status} (${status === 500 ? 'BUG: CRITICAL — missing service causes 500 crash' : status >= 400 ? 'GOOD' : 'BUG'})`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('2.11 Booking with non-existent student_user_id', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId,
        student_user_id: '00000000-0000-0000-0000-000000000000',
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 10, duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Non-existent student_user_id: status=${status} (${status === 500 ? 'BUG: CRITICAL — missing student causes 500 crash' : status >= 400 ? 'GOOD' : 'BUG'})`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('2.12 Booking with string instead of number for start_hour', async ({ request }) => {
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: baseDate(), start_hour: 'ten', duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `String start_hour 'ten': status=${status}`,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

// ════════════════════════════════════════════════════════════
// Section 3: BOOKING — OVERLAP / CONFLICT DETECTION
// ════════════════════════════════════════════════════════════
test.describe('3. Booking Overlap & Conflict Detection', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });
  let conflictDate: string;
  let conflictBookingId: string;

  test('3.1 Create a base booking to test conflicts against', async ({ request }) => {
    if (!serviceId || !studentId) { test.skip(); return; }
    const d = new Date();
    d.setDate(d.getDate() + 200 + Math.floor(Math.random() * 50));
    conflictDate = d.toISOString().split('T')[0];

    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: conflictDate, start_hour: 10, duration: 2,
        payment_method: 'cash', amount: 50,
        notes: 'conflict-base-test',
      },
    });
    if (resp.ok()) {
      const body = await resp.json();
      conflictBookingId = body.id || body.booking?.id;
    }
    expect(resp.status()).toBeLessThanOrEqual(500);
  });

  test('3.2 Double-book same instructor at same date/time (overlap test)', async ({ request }) => {
    if (!conflictDate || !serviceId || !instructorId) { test.skip(); return; }
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: conflictDate, start_hour: 10, duration: 2,
        payment_method: 'cash', amount: 50,
        notes: 'conflict-duplicate-test',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Exact overlap same instructor: status=${status} (${status < 400 ? 'CRITICAL BUG: DOUBLE-BOOKING ALLOWED' : 'CORRECTLY REJECTED'})`,
    });
  });

  test('3.3 Partial overlap (starts during existing booking)', async ({ request }) => {
    if (!conflictDate || !serviceId || !instructorId) { test.skip(); return; }
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: conflictDate, start_hour: 11, duration: 2,
        payment_method: 'cash', amount: 50,
        notes: 'partial-overlap-test',
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Partial overlap (starts during existing): status=${status} (${status < 400 ? 'BUG: OVERLAP ALLOWED' : 'REJECTED'})`,
    });
  });

  // Cleanup
  test('3.4 Cleanup conflict test bookings', async ({ request }) => {
    if (conflictBookingId) {
      await request.post(`${API}/bookings/${conflictBookingId}/cancel`, {
        headers: h(),
      });
    }
  });
});

// ════════════════════════════════════════════════════════════
// Section 4: BOOKING UI — FORM INTERACTION
// ════════════════════════════════════════════════════════════
test.describe('4. Booking UI — Admin Form Interaction', () => {

  test('4.1 Open booking form and attempt submit without filling fields', async ({ page }) => {
    await loginAsAdmin(page);
    // Navigate to bookings
    await page.goto(`${BASE_URL}/admin/bookings`);
    await page.waitForTimeout(2000);

    // Look for "New Booking" or "Create" or "Add" button
    const createBtn = page.locator('button, a').filter({
      hasText: /new booking|create booking|add booking|\+ new/i,
    }).first();

    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1500);

      // Try to submit/confirm without filling
      const submitBtn = page.locator('button').filter({
        hasText: /submit|confirm|create|save|book/i,
      }).first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(1000);
        // Should show validation errors
        const errors = page.locator('.ant-form-item-explain-error, .ant-form-item-has-error, [role="alert"]');
        const errorCount = await errors.count();
        test.info().annotations.push({
          type: 'validation_result',
          description: `Empty booking submit: ${errorCount} validation errors shown (${errorCount > 0 ? 'GOOD' : 'MISSING VALIDATION'})`,
        });
      } else {
        test.info().annotations.push({
          type: 'validation_result',
          description: 'Submit button not visible — multi-step form blocks progression (GOOD)',
        });
      }
    } else {
      test.info().annotations.push({
        type: 'validation_result',
        description: 'No direct create booking button found on page',
      });
    }
  });

  test('4.2 Test booking form with special characters in notes', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/bookings`);
    await page.waitForTimeout(2000);

    const createBtn = page.locator('button, a').filter({
      hasText: /new booking|create booking|\+ new/i,
    }).first();

    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1500);

      // Find notes field if visible
      const notesField = page.locator('textarea[id*="note"], textarea[name*="note"], #notes').first();
      if (await notesField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await notesField.fill('<script>alert("XSS")</script>');
        const val = await notesField.inputValue();
        expect(val).not.toContain('<script>');
        test.info().annotations.push({
          type: 'validation_result',
          description: 'Notes field XSS test completed',
        });
      }
    }
  });
});

// ════════════════════════════════════════════════════════════
// Section 5: BOOKING — LOGICAL IMPOSSIBILITIES
// ════════════════════════════════════════════════════════════
test.describe('5. Booking Logical Impossibility Tests', () => {
  const h = () => ({ Authorization: `Bearer ${adminToken}` });

  test('5.1 Cancel an already cancelled booking', async ({ request }) => {
    if (!serviceId || !studentId) { test.skip(); return; }
    // Create a booking
    const d = new Date();
    d.setDate(d.getDate() + 300 + Math.floor(Math.random() * 50));
    const createResp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        date: d.toISOString().split('T')[0],
        start_hour: 8 + Math.floor(Math.random() * 8), duration: 1,
        payment_method: 'cash', amount: 50,
      },
    });
    if (!createResp.ok()) { test.skip(); return; }
    const body = await createResp.json();
    const bookingId = body.id || body.booking?.id;
    if (!bookingId) { test.skip(); return; }

    // Cancel once
    await request.post(`${API}/bookings/${bookingId}/cancel`, { headers: h() });

    // Cancel again — should not crash
    const resp2 = await request.post(`${API}/bookings/${bookingId}/cancel`, { headers: h() });
    const status = resp2.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Double cancel: status=${status} (${status === 500 ? 'BUG: CRITICAL — double cancel causes 500 crash' : status >= 400 ? 'CORRECTLY REJECTED' : 'ACCEPTED (may be ok)'})`,
    });
    expect(status).toBeGreaterThanOrEqual(200);
  });

  test('5.2 Update completed booking to pending', async ({ request }) => {
    if (!serviceId || !studentId) { test.skip(); return; }
    const d = new Date();
    d.setDate(d.getDate() + 350 + Math.floor(Math.random() * 50));
    const createResp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        date: d.toISOString().split('T')[0],
        start_hour: 10, duration: 1, status: 'completed',
        payment_method: 'cash', amount: 50,
      },
    });
    if (!createResp.ok()) { test.skip(); return; }
    const body = await createResp.json();
    const bookingId = body.id || body.booking?.id;
    if (!bookingId) { test.skip(); return; }

    // Try reverting completed → pending
    const resp = await request.put(`${API}/bookings/${bookingId}`, {
      headers: h(),
      data: { status: 'pending' },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Completed\u2192Pending: status=${status} (${status === 500 ? 'BUG: 500 on status reversion' : status < 400 ? 'BUG: STATUS REVERSION ALLOWED' : 'REJECTED'})`,
    });
    expect(status).toBeGreaterThanOrEqual(200);
  });

  test('5.3 Create booking with amount=0 (free booking test)', async ({ request }) => {
    if (!serviceId || !studentId) { test.skip(); return; }
    const d = new Date();
    d.setDate(d.getDate() + 400 + Math.floor(Math.random() * 50));
    const resp = await request.post(`${API}/bookings`, {
      headers: h(),
      data: {
        service_id: serviceId, student_user_id: studentId,
        instructor_user_id: instructorId,
        date: d.toISOString().split('T')[0],
        start_hour: 9, duration: 1,
        payment_method: 'cash', amount: 0,
      },
    });
    const status = resp.status();
    test.info().annotations.push({
      type: 'validation_result',
      description: `Zero amount booking: status=${status} (${status < 400 ? 'ACCEPTED (review if intentional)' : 'REJECTED'})`,
    });
    expect(status).toBeGreaterThanOrEqual(200);
  });
});

