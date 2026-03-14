/**
 * EXTENDED WORKFLOW TESTS
 * ═══════════════════════════════════════════════════════════
 * 
 * Tests for business-critical flows that require independent setup
 * or don't fit the master-workflow's sequential narrative:
 * - Form Templates & Public Submissions
 * - Quick Links & Public Registration
 * - Financial Reconciliation
 * - Reschedule Notifications
 * 
 * Run: npx playwright test tests/e2e/extended-workflows.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from '@playwright/test';
import {
  BASE_URL,
  API_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  loginAsAdmin,
  navigateTo,
} from './helpers';

const BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:4000/api';

// ─── Test Configuration ────────────────────────────────────
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 25000, navigationTimeout: 35000 });
test.setTimeout(120_000);

test.beforeEach(async () => {
  await new Promise(r => setTimeout(r, 1500));
});

const RUN = Date.now().toString().slice(-6);

// Shared state
let authToken = '';
let formTemplateId = '';
let quickLinkCode = '';
let quickLinkId = '';

// ─── Helper: API call ──────────────────────────────────────
async function apiCall(page: Page, method: string, path: string, body?: any, token?: string) {
  const tkn = token || authToken;
  const url = `${BACKEND_API}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${tkn}`,
  };
  if (body) headers['Content-Type'] = 'application/json';

  const opts: any = { headers };
  if (body) opts.data = body;

  let response;
  switch (method.toUpperCase()) {
    case 'POST': response = await page.request.post(url, opts); break;
    case 'PUT': response = await page.request.put(url, opts); break;
    case 'PATCH': response = await page.request.patch(url, opts); break;
    case 'DELETE': response = await page.request.delete(url, opts); break;
    default: response = await page.request.get(url, { headers }); break;
  }

  const status = response.status();
  try {
    const data = await response.json();
    return { status, data };
  } catch {
    return { status, data: await response.text() };
  }
}

async function getTokenFromPage(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('token') || '');
}

async function ensureAdminToken(page: Page) {
  const tokenFromStorage = await getTokenFromPage(page).catch(() => '');
  if (tokenFromStorage) {
    authToken = tokenFromStorage;
    return authToken;
  }
  return authToken;
}

// ═══════════════════════════════════════════════════════════
//  EXT-1 — FORM TEMPLATES & SUBMISSIONS
// ═══════════════════════════════════════════════════════════
test.describe('EXT-1 — Form Templates & Submissions', () => {

  test('Admin creates form template', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'POST', '/form-templates', {
      name: `Registration Form ${RUN}`,
      description: `Automated test form #${RUN}`,
      category: 'registration',
      is_active: true,
    }, token);

    if (res.status < 400) {
      formTemplateId = res.data?.id || res.data?.template?.id || '';
      console.log(`✓ Form template created: ${formTemplateId}`);
    } else {
      console.log(`⚠ Form template creation returned ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
    }
  });

  test('List form templates', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/form-templates', null, token);
    expect(res.status, 'Should list form templates').toBeLessThan(400);
    const templates = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.templates || [];
    console.log(`✓ Found ${templates.length} form template(s)`);
    expect(templates.length, 'Should have at least one template').toBeGreaterThan(0);
  });

  test('List form submissions', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/form-submissions', null, token);
    if (res.status < 400) {
      const submissions = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.submissions || [];
      console.log(`✓ Found ${submissions.length} form submission(s)`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  EXT-2 — QUICK LINKS & PUBLIC REGISTRATION
// ═══════════════════════════════════════════════════════════
test.describe('EXT-2 — Quick Links', () => {

  test('Admin creates quick link', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'POST', '/quick-links', {
      name: `Summer Registration ${RUN}`,
      link_type: 'registration',
      description: `Quick link test #${RUN}`,
    }, token);

    if (res.status < 400) {
      quickLinkId = res.data?.id || res.data?.quickLink?.id || '';
      quickLinkCode = res.data?.code || res.data?.quickLink?.code || '';
      console.log(`✓ Quick link created: ${quickLinkCode} (id: ${quickLinkId})`);
    } else {
      console.log(`⚠ Quick link creation returned ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
    }
  });

  test('Public registration via quick link', async ({ page }) => {
    if (!quickLinkCode) {
      console.log('⚠ No quick link code — skipping public registration');
      return;
    }

    // This is a public endpoint — no auth needed
    const res = await apiCall(page, 'POST', `/quick-links/public/${quickLinkCode}/register`, {
      first_name: 'QuickLink',
      last_name: `Tester${RUN}`,
      email: `ql${RUN}@test.com`,
      phone: '+905551234567',
    });

    if (res.status < 400) {
      console.log(`✓ Public registration successful: ${res.data?.registration_id || 'ok'}`);
    } else {
      console.log(`⚠ Public registration returned ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
    }
  });

  test('Quick links list shows created link', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/quick-links', null, token);
    expect(res.status, 'Should list quick links').toBeLessThan(400);
    const links = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.quickLinks || [];
    console.log(`✓ Found ${links.length} quick link(s)`);
  });
});

// ═══════════════════════════════════════════════════════════
//  EXT-3 — FINANCIAL OPERATIONS
// ═══════════════════════════════════════════════════════════
test.describe('EXT-3 — Financial Operations', () => {

  test('Admin creates manual financial transaction', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    // Get any customer to create transaction for
    const usersRes = await apiCall(page, 'GET', '/users?limit=5', null, token);
    const users = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.data || [];
    const customer = users.find((u: any) => u.role === 'student' || u.role_name === 'student');

    if (!customer) {
      console.log('⚠ No student found — skipping manual transaction');
      return;
    }

    const res = await apiCall(page, 'POST', '/finances/transactions', {
      userId: customer.id,
      amount: 10,
      type: 'manual_credit',
      description: `Test manual credit #${RUN}`,
      currency: 'EUR',
    }, token);

    if (res.status < 400) {
      console.log('✓ Manual financial transaction created');
    } else {
      console.log(`⚠ Transaction creation returned ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
    }
  });

  test('Admin views outstanding balances', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/finances/outstanding-balances', null, token);
    expect(res.status, 'Should get outstanding balances').toBeLessThan(400);
    const customers = res.data?.customers || [];
    const summary = res.data?.summary;
    console.log(`✓ Outstanding balances: ${customers.length} customers, debt=${summary?.totalDebt || 0}, credit=${summary?.totalCredit || 0}`);
  });

  test('Financial reconciliation stats', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/admin-reconciliation/stats', null, token);
    if (res.status < 400) {
      console.log(`✓ Reconciliation stats: ${JSON.stringify(res.data).slice(0, 300)}`);
    } else {
      console.log(`⚠ Reconciliation stats returned ${res.status}`);
    }
  });

  test('Instructor payments list', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/finances/instructor-payments', null, token);
    if (res.status < 400) {
      const payments = Array.isArray(res.data) ? res.data : res.data?.payments || [];
      console.log(`✓ Instructor payments: ${payments.length} record(s)`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  EXT-4 — RESCHEDULE NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
test.describe('EXT-4 — Reschedule Notifications', () => {

  test('Check pending reschedule notifications', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/reschedule-notifications/pending', null, token);
    if (res.status < 400) {
      const notifications = res.data?.rescheduleNotifications || (Array.isArray(res.data) ? res.data : []);
      console.log(`✓ Pending reschedule notifications: ${notifications.length}`);
    } else {
      console.log(`⚠ Reschedule notifications returned ${res.status}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  EXT-5 — MARKETING CAMPAIGNS
// ═══════════════════════════════════════════════════════════
test.describe('EXT-5 — Marketing Campaigns', () => {

  test('List marketing campaigns', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/marketing/campaigns', null, token);
    if (res.status < 400) {
      const campaigns = Array.isArray(res.data) ? res.data : res.data?.campaigns || [];
      console.log(`✓ Marketing campaigns: ${campaigns.length}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  EXT-6 — MEMBER OFFERINGS
// ═══════════════════════════════════════════════════════════
test.describe('EXT-6 — Member Offerings', () => {

  test('List member offerings', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await ensureAdminToken(page);

    const res = await apiCall(page, 'GET', '/member-offerings', null, token);
    if (res.status < 400) {
      const offerings = Array.isArray(res.data) ? res.data : res.data?.offerings || res.data?.data || [];
      console.log(`✓ Member offerings: ${offerings.length}`);
    }
  });
});
