/**
 * FRONTEND QA AUDIT — Gap-Filling Tests
 * 
 * Covers routes, modals, forms, tables, and drawers that were
 * NOT exercised (or only page-load-only) in the original 4 spec files.
 * Prioritized by business importance.
 */
import { test, expect, Page } from '@playwright/test';
import { BASE_URL, login, loginAsAdmin, loginAsStudent, loginAsManager, ADMIN_EMAIL, ADMIN_PASSWORD, STUDENT_EMAIL, STUDENT_PASSWORD, MANAGER_EMAIL, MANAGER_PASSWORD } from './helpers';

const INSTRUCTOR_EMAIL = 'autoinst487747@test.com';
const INSTRUCTOR_PASSWORD = 'TestPass123!';

function finding(testInfo: any, severity: string, category: string, desc: string) {
  testInfo.annotations.push({ type: 'finding', description: `[${severity}][${category}] ${desc}` });
}

// ═══════════════════════════════════════════════════════════
// GAP-1 — INSTRUCTOR MANAGEMENT (admin)
// ═══════════════════════════════════════════════════════════
test.describe('GAP-1. Instructor Management (Admin)', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('G1.1 /instructors page loads with table', async () => {
    await page.goto(`${BASE_URL}/instructors`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasTable = await page.locator('.ant-table, .ant-list, .ant-card').first().isVisible().catch(() => false);
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Critical', 'navigation', '/instructors page shows error');
    }
    if (!hasTable) {
      finding(test.info(), 'High', 'rendering', '/instructors page has no table/list');
    }
    await page.screenshot({ path: 'test-results/screenshots/G1.1-instructors.png' });
  });

  test('G1.2 Instructor detail row click', async () => {
    await page.goto(`${BASE_URL}/instructors`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const row = page.locator('.ant-table-row, .ant-list-item, .ant-card').first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForTimeout(3000);

      const hasDetail = await page.locator('.ant-modal, .ant-drawer, .ant-descriptions, [class*="detail"]').first().isVisible().catch(() => false);
      const navigated = !page.url().endsWith('/instructors');
      if (!hasDetail && !navigated) {
        finding(test.info(), 'Medium', 'navigation', 'Clicking instructor row did nothing');
      }
      // Go back if navigated
      if (navigated) await page.goBack();
    }
    await page.screenshot({ path: 'test-results/screenshots/G1.2-instructor-detail.png' });
  });

  test('G1.3 Create instructor button opens form', async () => {
    await page.goto(`${BASE_URL}/instructors`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const createBtn = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New"), button:has-text("Oluştur"), a:has-text("Create"), a:has-text("Add")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(3000);

      const hasForm = await page.locator('.ant-modal, .ant-drawer, form, .ant-form').first().isVisible().catch(() => false);
      const navigated = page.url().includes('/instructors/new');
      if (!hasForm && !navigated) {
        finding(test.info(), 'High', 'modal', 'Create instructor button does not open form or navigate');
      }
      if (navigated) {
        // Check form page has fields
        const inputCount = await page.locator('input, textarea, .ant-select').count();
        if (inputCount === 0) {
          finding(test.info(), 'High', 'form', 'Instructor create page has no input fields');
        }
        await page.goBack();
      }
    } else {
      finding(test.info(), 'Medium', 'UX', '/instructors page has no create/add button');
    }
    await page.screenshot({ path: 'test-results/screenshots/G1.3-instructor-create.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-2 — INVENTORY PAGE
// ═══════════════════════════════════════════════════════════
test.describe('GAP-2. Inventory Page', () => {
  test('G2.1 /inventory page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/inventory`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', '/inventory page shows error');
    }

    const hasContent = await page.locator('.ant-table, .ant-card, .ant-list, table').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'Medium', 'rendering', '/inventory page has no table or content');
    }
    await page.screenshot({ path: 'test-results/screenshots/G2.1-inventory.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-3 — CUSTOMER DETAIL & PROFILE
// ═══════════════════════════════════════════════════════════
test.describe('GAP-3. Customer Detail Pages', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  let customerId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('G3.1 Navigate to first customer detail', async () => {
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const row = page.locator('.ant-table-row').first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForTimeout(3000);

      // Capture URL for customer ID
      const url = page.url();
      const match = url.match(/\/customers\/([^/]+)/);
      if (match) customerId = match[1];

      const hasContent = await page.locator('.ant-descriptions, .ant-card, .ant-tabs, form, [class*="detail"]').first().isVisible().catch(() => false);
      if (!hasContent) {
        finding(test.info(), 'High', 'rendering', 'Customer detail page has no visible data');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/G3.1-customer-detail.png' });
  });

  test('G3.2 Customer profile sub-page', async () => {
    if (!customerId) {
      // Try direct URL with a known pattern
      await page.goto(`${BASE_URL}/customers`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const row = page.locator('.ant-table-row').first();
      if (await row.isVisible().catch(() => false)) {
        await row.click();
        await page.waitForTimeout(3000);
        const url = page.url();
        const match = url.match(/\/customers\/([^/]+)/);
        if (match) customerId = match[1];
      }
    }

    if (customerId) {
      await page.goto(`${BASE_URL}/customers/${customerId}/profile`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', 'Customer profile sub-page shows error');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/G3.2-customer-profile.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-4 — FINANCE SUB-PAGES (6 untested)
// ═══════════════════════════════════════════════════════════
test.describe('GAP-4. Finance Sub-Pages', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  const financePages = [
    { path: '/finance/settings', name: 'Finance Settings' },
    { path: '/finance/membership', name: 'Finance Membership' },
    { path: '/finance/events', name: 'Finance Events' },
    { path: '/finance/payment-history', name: 'Finance Payment History' },
    { path: '/finance/wallet-deposits', name: 'Wallet Deposits Admin' },
    { path: '/finance/bank-accounts', name: 'Bank Accounts' },
  ];

  for (const fp of financePages) {
    test(`G4 ${fp.name} page loads`, async () => {
      await page.goto(`${BASE_URL}${fp.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `${fp.name} page (${fp.path}) shows error`);
      }

      const hasContent = await page.locator('.ant-table, .ant-card, .ant-form, .ant-descriptions, .ant-list, .ant-tabs, table, [class*="stat"]').first().isVisible().catch(() => false);
      if (!hasContent) {
        const hasEmpty = await page.locator('.ant-empty, [class*="empty"]').isVisible().catch(() => false);
        if (!hasEmpty) {
          finding(test.info(), 'Medium', 'rendering', `${fp.name} page has no content or empty state`);
        }
      }
      await page.screenshot({ path: `test-results/screenshots/G4-${fp.path.replace(/\//g, '-')}.png` });
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GAP-5 — ADMIN SYSTEM PAGES (4 untested)
// ═══════════════════════════════════════════════════════════
test.describe('GAP-5. Admin System Pages', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  const adminPages = [
    { path: '/admin/legal-documents', name: 'Legal Documents' },
    { path: '/admin/manager-commissions', name: 'Manager Commissions' },
    { path: '/admin/deleted-bookings', name: 'Deleted Bookings' },
    { path: '/admin/spare-parts', name: 'Spare Parts' },
  ];

  for (const ap of adminPages) {
    test(`G5 ${ap.name} page loads`, async () => {
      await page.goto(`${BASE_URL}${ap.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `${ap.name} page shows error`);
      }

      const hasContent = await page.locator('.ant-table, .ant-card, .ant-form, .ant-descriptions, .ant-list, table').first().isVisible().catch(() => false);
      if (!hasContent) {
        const hasEmpty = await page.locator('.ant-empty, [class*="empty"], [class*="no-data"]').isVisible().catch(() => false);
        if (!hasEmpty) {
          finding(test.info(), 'Medium', 'rendering', `${ap.name} page has no content or empty state`);
        }
      }
      await page.screenshot({ path: `test-results/screenshots/G5-${ap.path.replace(/\//g, '-')}.png` });
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GAP-6 — STUDENT GROUP BOOKINGS & FRIENDS
// ═══════════════════════════════════════════════════════════
test.describe('GAP-6. Student Group Bookings & Friends', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsStudent(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('G6.1 /student/friends page loads', async () => {
    await page.goto(`${BASE_URL}/student/friends`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Student friends page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/G6.1-student-friends.png' });
  });

  test('G6.2 /student/group-bookings page loads', async () => {
    await page.goto(`${BASE_URL}/student/group-bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Student group bookings page shows error');
    }
    const hasContent = await page.locator('.ant-card, .ant-table, .ant-list, .ant-empty, [class*="booking"]').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'Medium', 'rendering', 'Group bookings page has no content or empty state');
    }
    await page.screenshot({ path: 'test-results/screenshots/G6.2-group-bookings.png' });
  });

  test('G6.3 /student/group-bookings/request page', async () => {
    await page.goto(`${BASE_URL}/student/group-bookings/request`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Group booking request page shows error');
    }
    
    const hasForm = await page.locator('form, .ant-form, input, .ant-select, .ant-steps').first().isVisible().catch(() => false);
    if (!hasForm) {
      finding(test.info(), 'Medium', 'rendering', 'Group booking request page has no form');
    }
    await page.screenshot({ path: 'test-results/screenshots/G6.3-group-request.png' });
  });

  test('G6.4 /student/group-bookings/history page', async () => {
    await page.goto(`${BASE_URL}/student/group-bookings/history`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Group booking history page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/G6.4-group-history.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-7 — STUDENT MY ORDERS & ACADEMY BOOK SERVICE
// ═══════════════════════════════════════════════════════════
test.describe('GAP-7. Student My Orders & Book Service', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsStudent(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('G7.1 /shop/my-orders page loads', async () => {
    await page.goto(`${BASE_URL}/shop/my-orders`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'My Orders page shows error');
    }
    const hasContent = await page.locator('.ant-table, .ant-list, .ant-card, .ant-empty').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'Medium', 'rendering', 'My Orders page has no content or empty state');
    }
    await page.screenshot({ path: 'test-results/screenshots/G7.1-my-orders.png' });
  });

  test('G7.2 /academy/book-service page loads', async () => {
    await page.goto(`${BASE_URL}/academy/book-service`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Academy book-service page shows error');
    }
    const hasForm = await page.locator('form, .ant-form, .ant-steps, .ant-select, [class*="booking"], [class*="wizard"]').first().isVisible().catch(() => false);
    if (!hasForm) {
      finding(test.info(), 'Medium', 'rendering', 'Academy book-service page has no booking form/wizard');
    }
    await page.screenshot({ path: 'test-results/screenshots/G7.2-academy-book-service.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-8 — SETTINGS, GDPR, ACCOMMODATION, REPAIRS (auth'd)
// ═══════════════════════════════════════════════════════════
test.describe('GAP-8. Auth General Pages', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('G8.1 /settings page loads', async () => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasContent = await page.locator('form, .ant-form, .ant-card, .ant-tabs, .ant-descriptions').first().isVisible().catch(() => false);
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', '/settings page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/G8.1-settings.png' });
  });

  test('G8.2 /privacy/gdpr page loads', async () => {
    await page.goto(`${BASE_URL}/privacy/gdpr`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', '/privacy/gdpr page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/G8.2-gdpr.png' });
  });

  test('G8.3 /accommodation page loads', async () => {
    await page.goto(`${BASE_URL}/accommodation`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Medium', 'navigation', '/accommodation page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/G8.3-accommodation.png' });
  });

  test('G8.4 /repairs page loads', async () => {
    await page.goto(`${BASE_URL}/repairs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Medium', 'navigation', '/repairs page shows error');
    }
    const hasContent = await page.locator('.ant-table, .ant-card, .ant-form, .ant-list, .ant-empty').first().isVisible().catch(() => false);
    await page.screenshot({ path: 'test-results/screenshots/G8.4-repairs.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-9 — MANAGER COMMISSIONS & SERVICES ACCOMMODATION
// ═══════════════════════════════════════════════════════════
test.describe('GAP-9. Manager Routes', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsManager(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('G9.1 /manager/commissions page loads', async () => {
    await page.goto(`${BASE_URL}/manager/commissions`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Manager commissions page shows error');
    }
    const hasContent = await page.locator('.ant-table, .ant-card, .ant-descriptions, .ant-list').first().isVisible().catch(() => false);
    if (!hasContent) {
      const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false);
      if (!hasEmpty) {
        finding(test.info(), 'Medium', 'rendering', 'Manager commissions page has no content');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/G9.1-manager-commissions.png' });
  });

  test('G9.2 /services/accommodation page loads', async () => {
    await page.goto(`${BASE_URL}/services/accommodation`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Medium', 'navigation', '/services/accommodation page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/G9.2-services-accommodation.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-10 — REGISTER FORM INTERACTION
// ═══════════════════════════════════════════════════════════
test.describe('GAP-10. Register & Forgot Password Forms', () => {
  test('G10.1 Register page form fields are interactive', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Check form fields exist
    const inputs = page.locator('input:not([type="hidden"])');
    const inputCount = await inputs.count();
    
    if (inputCount === 0) {
      finding(test.info(), 'High', 'form', 'Register page has no input fields');
    } else {
      // Try filling name/email fields
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[placeholder*="ad" i], #name, #firstName').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('Test User');
      }
      
      const emailInput = page.locator('input[name="email"], input[type="email"], #email').first();
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill('testregister@example.com');
      }
      
      const passwordInput = page.locator('input[name="password"], input[type="password"], #password').first();
      if (await passwordInput.isVisible().catch(() => false)) {
        await passwordInput.fill('TestPass123!');
      }

      // Check submit button exists
      const submitBtn = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign Up"), button:has-text("Kayıt")').first();
      if (!(await submitBtn.isVisible().catch(() => false))) {
        finding(test.info(), 'Medium', 'form', 'Register page has no visible submit button');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/G10.1-register-form.png' });
  });

  test('G10.2 Forgot password flow accessible from login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const forgotLink = page.locator('a:has-text("Forgot"), a:has-text("Reset"), a:has-text("Şifremi unuttum"), button:has-text("Forgot")').first();
    if (await forgotLink.isVisible().catch(() => false)) {
      await forgotLink.click();
      await page.waitForTimeout(3000);

      // Should show email input for reset
      const hasResetForm = await page.locator('input[type="email"], input[name="email"], #email, .ant-modal input').first().isVisible().catch(() => false);
      if (!hasResetForm) {
        finding(test.info(), 'Medium', 'form', 'Forgot password flow does not show email input');
      }
    } else {
      finding(test.info(), 'Medium', 'UX', 'Login page has no "Forgot Password" link');
    }
    await page.screenshot({ path: 'test-results/screenshots/G10.2-forgot-password.png' });
  });

  test('G10.3 /reset-password page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/reset-password`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Without token it should show error or redirect — that's OK
    const hasContent = await page.locator('body').textContent();
    await page.screenshot({ path: 'test-results/screenshots/G10.3-reset-password.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-11 — CONTACT FORM INTERACTION
// ═══════════════════════════════════════════════════════════
test.describe('GAP-11. Contact Page Form', () => {
  test('G11.1 Contact page form interaction', async ({ page }) => {
    await page.goto(`${BASE_URL}/contact`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasForm = await page.locator('form, .ant-form, textarea, input[name="email"], input[name="message"]').first().isVisible().catch(() => false);
    if (hasForm) {
      // Fill contact form
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[placeholder*="ad" i]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('Test Contact');
      }
      
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill('test@example.com');
      }
      
      const messageArea = page.locator('textarea').first();
      if (await messageArea.isVisible().catch(() => false)) {
        await messageArea.fill('This is a test message from the QA audit.');
      }
      
      // DON'T submit — just verify fields work
    } else {
      // It might be a static contact page with just address/phone info
      const hasContactInfo = await page.getByText(/email|phone|address|telefon|adres/i).first().isVisible().catch(() => false);
      if (!hasContactInfo) {
        finding(test.info(), 'Medium', 'rendering', 'Contact page has neither form nor contact info');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/G11.1-contact-form.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-12 — DASHBOARD QUICK MODALS
// ═══════════════════════════════════════════════════════════
test.describe('GAP-12. Dashboard Quick Action Modals', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('G12.1 Dashboard quick action buttons exist', async () => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Look for quick action buttons (these typically appear as icon buttons or a "+" menu)
    const quickBtns = page.locator('button:has-text("Quick"), button:has-text("Hızlı"), [class*="quick-action"], .ant-float-btn, button[class*="fab"]');
    const btnCount = await quickBtns.count();

    // Also check for "+" or add buttons 
    const addBtns = page.locator('button:has-text("+"), button[aria-label*="add" i], button[aria-label*="create" i]');
    const addCount = await addBtns.count();

    if (btnCount === 0 && addCount === 0) {
      // Quick actions might be in dropdown menus
      const dropdown = page.locator('.ant-dropdown-trigger, [class*="dropdown"]').first();
      if (await dropdown.isVisible().catch(() => false)) {
        await dropdown.click();
        await page.waitForTimeout(1500);
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/G12.1-dashboard-quick-actions.png' });
  });

  test('G12.2 Try opening a booking from dashboard', async () => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Click on any booking/card in the dashboard
    const bookingCard = page.locator('.ant-card:has-text("Booking"), .ant-card:has-text("Reservation"), [class*="booking-card"]').first();
    if (await bookingCard.isVisible().catch(() => false)) {
      await bookingCard.click();
      await page.waitForTimeout(3000);

      const hasDetail = await page.locator('.ant-modal, .ant-drawer').first().isVisible().catch(() => false);
      const navigated = !page.url().endsWith('/dashboard');
      if (hasDetail || navigated) {
        // Good — something happened
      }
      // Close if modal
      if (hasDetail) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/G12.2-dashboard-booking-click.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-13 — FORM BUILDER
// ═══════════════════════════════════════════════════════════
test.describe('GAP-13. Form Builder', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('G13.1 Forms list page interaction', async () => {
    await page.goto(`${BASE_URL}/forms`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Check for a create form button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), a:has-text("Create")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(3000);

      // Should navigate to builder or open modal
      const navigatedToBuilder = page.url().includes('/forms/builder');
      const hasModal = await page.locator('.ant-modal, .ant-drawer').isVisible().catch(() => false);
      
      if (!navigatedToBuilder && !hasModal) {
        finding(test.info(), 'Medium', 'navigation', 'Forms create button does not navigate to builder or open modal');
      }

      if (navigatedToBuilder) {
        // Check builder has canvas/drag area
        const hasBuilder = await page.locator('[class*="canvas"], [class*="builder"], [class*="drag"], .ant-form').first().isVisible().catch(() => false);
        if (!hasBuilder) {
          finding(test.info(), 'Medium', 'rendering', 'Form builder page has no canvas/builder area');
        }
        await page.goBack();
        await page.waitForTimeout(1000);
      }
      if (hasModal) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    }

    // Ensure any lingering modal is closed before clicking rows
    for (let attempt = 0; attempt < 3; attempt++) {
      const remainingModal = await page.locator('.ant-modal').isVisible().catch(() => false);
      if (!remainingModal) break;
      // Try close button first, then Escape
      const closeBtn = page.locator('.ant-modal-close').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(1000);
    }

    // Check that modal was closed successfully
    const stillBlocking = await page.locator('.ant-modal').isVisible().catch(() => false);
    if (stillBlocking) {
      finding(test.info(), 'High', 'modal', 'Create New Form modal cannot be dismissed — blocks interaction with form list');
    }
    await page.screenshot({ path: 'test-results/screenshots/G13.1-forms-list.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-14 — CALENDAR VIEWS (deeper check)
// ═══════════════════════════════════════════════════════════
test.describe('GAP-14. Calendar Views Deep', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  const calendarPages = [
    '/calendars/shop-orders',
    '/calendars/academy',
    '/calendars/rentals',
    '/calendars/stay',
    '/calendars/events',
    '/calendars/members',
  ];

  for (const path of calendarPages) {
    test(`G14 ${path} has calendar component`, async () => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      const hasCalendar = await page.locator('.fc, .fc-view, .ant-fullcalendar, [class*="calendar"], .ant-table, .ant-card').first().isVisible().catch(() => false);
      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `Calendar page ${path} shows error`);
      }
      if (!hasCalendar && !hasError) {
        const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false);
        if (!hasEmpty) {
          finding(test.info(), 'Medium', 'rendering', `Calendar page ${path} has no calendar or table`);
        }
      }

      // Try clicking a date/cell if calendar exists
      const calCell = page.locator('.fc-daygrid-day, .fc-timegrid-slot, .ant-fullcalendar-date').first();
      if (await calCell.isVisible().catch(() => false)) {
        await calCell.click();
        await page.waitForTimeout(1500);
      }

      await page.screenshot({ path: `test-results/screenshots/G14${path.replace(/\//g, '-')}.png` });
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GAP-15 — SERVICES PARAMETER PAGES (deeper)
// ═══════════════════════════════════════════════════════════
test.describe('GAP-15. Services Parameter Pages', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });
  test.afterAll(async () => { await page.close(); });

  const servicePages = [
    { path: '/services/lessons', name: 'Lessons' },
    { path: '/services/rentals', name: 'Rentals' },
    { path: '/services/memberships', name: 'Memberships' },
    { path: '/services/events', name: 'Events' },
    { path: '/services/categories', name: 'Categories' },
    { path: '/services/packages', name: 'Packages' },
    { path: '/services/accommodation', name: 'Accommodation' },
  ];

  for (const sp of servicePages) {
    test(`G15 ${sp.name} page has table or form`, async () => {
      await page.goto(`${BASE_URL}${sp.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `${sp.name} service page shows error`);
      }

      const hasContent = await page.locator('.ant-table, .ant-card, .ant-form, .ant-list, table, form').first().isVisible().catch(() => false);
      if (!hasContent && !hasError) {
        const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false);
        if (!hasEmpty) {
          finding(test.info(), 'Medium', 'rendering', `${sp.name} service page has no content`);
        }
      }

      // Try clicking create/add button if exists
      const addBtn = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")').first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(2000);
        const hasModal = await page.locator('.ant-modal, .ant-drawer').isVisible().catch(() => false);
        if (hasModal) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } else {
          // May have navigated
          if (!page.url().includes(sp.path)) {
            await page.goBack();
          }
        }
      }

      await page.screenshot({ path: `test-results/screenshots/G15-${sp.name.toLowerCase()}.png` });
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GAP-16 — BOOKING EDIT PAGE
// ═══════════════════════════════════════════════════════════
test.describe('GAP-16. Booking Edit Page', () => {
  test('G16.1 Navigate to booking edit', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Find first row and look for edit action
    const row = page.locator('.ant-table-row').first();
    if (await row.isVisible().catch(() => false)) {
      // Look for edit button in the row
      const editBtn = row.locator('button:has-text("Edit"), a:has-text("Edit"), [class*="edit"], button[aria-label*="edit" i]').first();
      if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(3000);

        const navigated = page.url().includes('/bookings/edit');
        const hasModal = await page.locator('.ant-modal, .ant-drawer').isVisible().catch(() => false);
        
        if (navigated) {
          const hasForm = await page.locator('form, .ant-form, input, .ant-select').first().isVisible().catch(() => false);
          if (!hasForm) {
            finding(test.info(), 'High', 'form', 'Booking edit page has no form fields');
          }
        }
      } else {
        // Try clicking the row to open detail, then look for edit in detail view
        await row.click();
        await page.waitForTimeout(3000);
        
        const editInDetail = page.locator('button:has-text("Edit"), a:has-text("Edit")').first();
        if (await editInDetail.isVisible().catch(() => false)) {
          await editInDetail.click();
          await page.waitForTimeout(3000);
        }
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/G16.1-booking-edit.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-17 — OUTSIDER PACKAGES PAGE
// ═══════════════════════════════════════════════════════════
test.describe('GAP-17. Public Outsider Routes', () => {
  test('G17.1 /outsider/packages page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/outsider/packages`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Medium', 'navigation', '/outsider/packages shows error');
    }
    const hasContent = await page.locator('.ant-card, [class*="package"], img').first().isVisible().catch(() => false);
    await page.screenshot({ path: 'test-results/screenshots/G17.1-outsider-packages.png' });
  });

  test('G17.2 /services/events public page', async ({ page }) => {
    await page.goto(`${BASE_URL}/services/events`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const hasContent = await page.locator('.ant-table, .ant-card, .ant-list, .ant-empty').first().isVisible().catch(() => false);
    await page.screenshot({ path: 'test-results/screenshots/G17.2-services-events.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// GAP-18 — ADMIN EXECUTIVE DASHBOARD  
// ═══════════════════════════════════════════════════════════
test.describe('GAP-18. Admin Executive Dashboard', () => {
  test('G18.1 /admin/dashboard loads (if different from /dashboard)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // It might redirect to /dashboard — that's fine
    const hasContent = await page.locator('.ant-card, .ant-statistic, [class*="chart"], canvas, .ant-table').first().isVisible().catch(() => false);
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Medium', 'navigation', '/admin/dashboard page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/G18.1-admin-dashboard.png' });
  });
});
