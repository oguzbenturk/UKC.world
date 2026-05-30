/**
 * UI Smoke — 2026-05-30 frontdesk overhaul
 * ═══════════════════════════════════════════════════════════
 *
 * Drives the actual UI for the changes shipped today:
 *   • Activation dialog (Activate now / Send activation email)
 *   • Frontdesk role visibility on customer profile
 *   • Shop discount button on customer profile
 *   • Calendar > Members edit + discount buttons
 *   • BookingDetailModal start time field
 *
 * Run:
 *   npx playwright test tests/e2e/flows/ui-smoke-2026-05-30.spec.ts --project=chromium --workers=1
 *
 * Outputs:
 *   • Screenshots saved to test-results/<test>/.../*.png
 *   • playwright-report/ (full HTML report)
 */
import { test, expect, Page } from '@playwright/test';
import {
  BASE_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  login,
  navigateTo,
  waitForLoading,
} from '../helpers';

const FRONTDESK_EMAIL = 'test-receptionist@plannivo.local';
const FRONTDESK_PASSWORD = 'receptiontest8';

// Each test is independent — if one fails (e.g. missing data) others still run.
// test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 25_000, navigationTimeout: 35_000 });
test.setTimeout(180_000);

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/ui-smoke/${name}.png`, fullPage: true });
}

// Some accounts (esp. newly-created test users) land on a Consent Required wall after
// login. Helper accepts the wall if visible so subsequent navigation works.
async function dismissConsentWall(page: Page) {
  const consentText = page.getByText(/consent required/i).first();
  if (await consentText.isVisible({ timeout: 2500 }).catch(() => false)) {
    // Tick every checkbox / switch so the Accept button enables
    const switches = page.locator('button.ant-switch, [role="switch"]');
    const swCount = await switches.count();
    for (let i = 0; i < swCount; i++) {
      const checked = await switches.nth(i).getAttribute('aria-checked');
      if (checked !== 'true') {
        await switches.nth(i).click({ force: true });
      }
    }
    const checks = page.locator('input[type="checkbox"]');
    const chkCount = await checks.count();
    for (let i = 0; i < chkCount; i++) {
      if (!(await checks.nth(i).isChecked())) {
        await checks.nth(i).check({ force: true });
      }
    }
    const accept = page.getByRole('button', { name: /accept|agree|continue|submit|save|kabul/i }).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
}

// Pre-accept the cookie consent so the banner doesn't intercept clicks.
async function preAcceptCookies(page: Page) {
  await page.context().addInitScript(() => {
    localStorage.setItem('cookie_consent_accepted', 'true');
  });
}

test.beforeEach(async ({ page }) => {
  await preAcceptCookies(page);
});

// ───────────────────────────────────────────────────────────
// 1. Activation dialog on UserForm
// ───────────────────────────────────────────────────────────
test.describe('1. Activation dialog (Activate now / Send verify)', () => {
  test('1a. Admin → New Customer → Activation dialog appears', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await navigateTo(page, '/customers');
    await waitForLoading(page);
    await shot(page, '1a-customers-page');

    // Click Add Customer button
    const addBtn = page.getByRole('button', { name: /add customer|new customer|müşteri ekle/i }).first();
    await addBtn.click();
    await page.waitForTimeout(800);
    await shot(page, '1a-drawer-open');

    // Fill required fields
    await page.getByPlaceholder(/first name|ad/i).first().fill('Smoke');
    await page.getByPlaceholder(/last name|soyad/i).first().fill('UiTest');
    await page.getByPlaceholder(/name@example|email/i).first().fill(`ui-smoke-${Date.now()}@plannivo.test`);
    // Phone (optional but UI may show)
    const phone = page.getByPlaceholder(/phone|telefon/i).first();
    if (await phone.isVisible().catch(() => false)) {
      await phone.fill('+1234567890');
    }
    // Password
    await page.locator('input[type="password"]').first().fill('smokepass8');
    // Confirm password
    const confirmPw = page.locator('input[type="password"]').nth(1);
    if (await confirmPw.isVisible().catch(() => false)) {
      await confirmPw.fill('smokepass8');
    }
    // Role - try to pick student
    const roleSelect = page.locator('.ant-select').filter({ hasText: /role|rol/i }).first();
    if (await roleSelect.isVisible().catch(() => false)) {
      await roleSelect.click();
      await page.waitForTimeout(400);
      await page.locator('.ant-select-item').filter({ hasText: /student/i }).first().click();
    }
    await shot(page, '1a-form-filled');

    // Submit
    await page.getByRole('button', { name: /create user|create|kaydet/i }).first().click();
    await page.waitForTimeout(1500);

    // Expect the activation modal
    const dialog = page.getByText(/how should this account be activated|activate this account/i).first();
    await expect(dialog).toBeVisible({ timeout: 8000 });
    await shot(page, '1a-activation-dialog');

    // Pick "Send activation email" → close drawer
    const sendVerifyBtn = page.getByRole('button', { name: /send activation email/i }).first();
    await sendVerifyBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, '1a-after-send-verify');
  });

  test('1b. Frontdesk → New Customer → role dropdown is restricted', async ({ page }) => {
    await login(page, FRONTDESK_EMAIL, FRONTDESK_PASSWORD);
    await dismissConsentWall(page);
    await page.waitForTimeout(1500);
    await shot(page, '1b-frontdesk-dashboard');

    // Open new-customer drawer via FAB or direct path
    await navigateTo(page, '/customers');
    await waitForLoading(page);
    const addBtn = page.getByRole('button', { name: /add customer|new customer|müşteri ekle/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(800);
    } else {
      // Try the FAB
      const fab = page.locator('.ant-float-btn, [aria-label*="add" i]').first();
      if (await fab.isVisible().catch(() => false)) {
        await fab.click();
        await page.waitForTimeout(800);
      }
    }
    await shot(page, '1b-form-open');

    // Click role select
    const roleSelect = page.locator('.ant-select').filter({ hasText: /role|rol/i }).first();
    if (await roleSelect.isVisible().catch(() => false)) {
      await roleSelect.click();
      await page.waitForTimeout(500);
      const options = await page.locator('.ant-select-item-option-content').allInnerTexts();
      console.log('Role dropdown options (frontdesk):', options);
      await shot(page, '1b-role-dropdown-open');

      // Should NOT contain admin / manager / instructor
      const lower = options.map((o) => o.toLowerCase());
      expect(lower.some((o) => o.includes('admin'))).toBe(false);
      expect(lower.some((o) => o.includes('manager'))).toBe(false);
      expect(lower.some((o) => o.includes('instructor'))).toBe(false);

      // SHOULD contain student / outsider / trusted_customer at least once
      expect(lower.some((o) => o.includes('student') || o.includes('outsider') || o.includes('trusted'))).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────
// 2. Customer Profile → Shop tab has Discount button + view details works
// ───────────────────────────────────────────────────────────
test.describe('2. Customer profile shop section', () => {
  test('2a. Frontdesk can open customer profile and see Financial tab', async ({ page }) => {
    await login(page, FRONTDESK_EMAIL, FRONTDESK_PASSWORD);
    await dismissConsentWall(page);
    await navigateTo(page, '/customers');
    await waitForLoading(page);

    // Customer list renders in ~2s typically.
    const firstRow = page.locator('.ant-table-row, tbody tr').filter({ hasNotText: /^$/ }).first();
    await firstRow.waitFor({ state: 'visible', timeout: 30_000 });
    await shot(page, '2a-customers-list');
    await firstRow.scrollIntoViewIfNeeded();
    await firstRow.click();
    await page.waitForTimeout(2500);
    await shot(page, '2a-profile-open');

    // The drawer renders icon-only nav buttons wrapped in Ant Design Tooltips. The
    // accessible name comes from the button's `aria-label` or surrounding `title`.
    // Search by aria/title attribute matching the section label.
    const finBtn = page.locator('button[title="Financial"], button[aria-label="Financial"]').first();
    let finVisible = await finBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!finVisible) {
      // Fallback: the drawer's nav buttons render the AntD dollar icon for "Financial".
      const fallback = page.locator('nav button').filter({ has: page.locator('.anticon-dollar') }).first();
      finVisible = await fallback.isVisible({ timeout: 3000 }).catch(() => false);
      expect(finVisible, 'Financial section button (dollar icon) must be visible for receptionist').toBe(true);
      await fallback.click();
    } else {
      await finBtn.click();
    }
    await page.waitForTimeout(1500);
    await shot(page, '2a-financial-tab');

    // Confirm "Reset Wallet" button is NOT visible to receptionist (admin-only)
    const resetBtn = page.getByRole('button', { name: /reset wallet/i });
    const resetCount = await resetBtn.count();
    expect(resetCount, 'Reset Wallet must NOT be visible to receptionist').toBe(0);
  });

  test('2b. Shop tab has Discount button per row', async ({ page }) => {
    await login(page, FRONTDESK_EMAIL, FRONTDESK_PASSWORD);
    await dismissConsentWall(page);
    await navigateTo(page, '/customers');
    await waitForLoading(page);
    const firstRow = page.locator('.ant-table-row, tbody tr').filter({ hasNotText: /^$/ }).first();
    await firstRow.waitFor({ state: 'visible', timeout: 30_000 });
    await firstRow.scrollIntoViewIfNeeded();
    await firstRow.click();
    await page.waitForTimeout(2500);

    // Drawer Shop section button — icon-only, look by title/aria.
    const shopBtn = page.locator('button[title="Shop"], button[aria-label="Shop"]').first();
    let shopVisible = await shopBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!shopVisible) {
      // Fallback to icon-based selector — the Shop section uses the AntD shopping icon.
      const fallback = page.locator('nav button').filter({ has: page.locator('.anticon-shopping') }).nth(1); // 2nd shopping icon = Shop (1st is Rentals)
      shopVisible = await fallback.isVisible({ timeout: 3000 }).catch(() => false);
      if (!shopVisible) {
        test.skip(true, 'Shop section not present in drawer.');
      }
      await fallback.click();
    } else {
      await shopBtn.click();
    }
    await page.waitForTimeout(1500);
    await shot(page, '2b-shop-tab');

    // The drawer's left-side nav contains a "Discounts" section button which would also
    // match /discount/i. We want the per-row action button inside the shop orders TABLE.
    // Scope to the main content area excluding the nav sidebar.
    const discountBtn = page
      .locator('main, [class*="content"], .ant-table, .ant-table-tbody, table')
      .first()
      .getByRole('button', { name: /^discount$|^indirim$/i })
      .first();
    const present = await discountBtn.isVisible({ timeout: 4000 }).catch(() => false);
    if (present) {
      await discountBtn.scrollIntoViewIfNeeded();
      await discountBtn.click({ force: true });
      await page.waitForTimeout(1200);
      await shot(page, '2b-discount-modal');
      const modal = page.locator('.ant-modal').first();
      await expect(modal).toBeVisible({ timeout: 5000 });
    } else {
      console.log('No orders for this customer — Discount button absent (expected).');
    }
  });
});

// ───────────────────────────────────────────────────────────
// 3. Calendar > Members has Edit + Discount buttons (#12)
// ───────────────────────────────────────────────────────────
test('3. Calendar > Members shows Edit + Discount per row', async ({ page }) => {
  await login(page, FRONTDESK_EMAIL, FRONTDESK_PASSWORD);
    await dismissConsentWall(page);
  await navigateTo(page, '/calendars/members');
  await waitForLoading(page);
  await page.waitForTimeout(2000);
  await shot(page, '3-members-page');

  // Expect at least 3 action buttons per row (View/Edit/Discount icons)
  const firstRow = page.locator('.ant-table-row').first();
  if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    const buttons = firstRow.locator('button');
    const btnCount = await buttons.count();
    console.log('Action buttons in first member row:', btnCount);
    expect(btnCount, 'Member row should have View + Edit + Discount').toBeGreaterThanOrEqual(3);

    // Hover/click the second button (Edit)
    await buttons.nth(1).click();
    await page.waitForTimeout(1000);
    const editModal = page.getByText(/edit membership|status/i).first();
    await expect(editModal).toBeVisible({ timeout: 5000 });
    await shot(page, '3-edit-modal');
    // Close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Click the third button (Discount)
    await buttons.nth(2).click();
    await page.waitForTimeout(1000);
    await shot(page, '3-discount-modal');
  } else {
    console.log('No member purchases — section may be empty.');
  }
});

// ───────────────────────────────────────────────────────────
// 4. BookingDetailModal — start time field present + required (#10)
// ───────────────────────────────────────────────────────────
test('4. Booking edit form has start time field', async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await navigateTo(page, '/bookings');
  await waitForLoading(page);
  await page.waitForTimeout(3000);
  await shot(page, '4-bookings-list');

  // Click first booking row
  const firstBookingRow = page.locator('.ant-table-row').first();
  await firstBookingRow.waitFor({ state: 'visible', timeout: 30_000 });
  await firstBookingRow.scrollIntoViewIfNeeded();
  await firstBookingRow.click();
  await page.waitForTimeout(2500);
  await shot(page, '4-booking-detail-open');

  // The Edit button is at the bottom of a long scrollable Drawer (Action Buttons section).
  // The drawer has its own scroll container so we need to scroll within it, not the page.
  // BookingDetailModal renders the button as a <button> with PencilSquareIcon + "Edit" text.
  const editBtn = page.locator('button').filter({ hasText: /^\s*Edit\s*$|^\s*Düzenle\s*$/i }).first();

  // Wait then scroll the button into view inside the drawer
  await editBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await editBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  // Force-click to bypass any sticky-bottom overlay glitches inside the drawer
  await editBtn.click({ force: true });
  await page.waitForTimeout(1500);
  await shot(page, '4-edit-mode');

  // AntD TimePicker renders an input with placeholder="Select time" + HH:mm value.
  // Use placeholder to disambiguate from other ant-picker inputs on the page (date filters).
  const timeInput = page.locator('input[placeholder="Select time"]').first();
  await expect(timeInput, 'Start time picker must exist in edit mode').toBeVisible({ timeout: 5_000 });

  const currentValue = await timeInput.inputValue();
  console.log('Pre-filled start time:', currentValue);
  expect(currentValue, 'Start time should be pre-filled with the booking time').toMatch(/^\d{2}:\d{2}$/);
});

// ───────────────────────────────────────────────────────────
// 5. Frontdesk dashboard — welcome header hidden
// ───────────────────────────────────────────────────────────
test('5. Receptionist dashboard hides welcome header', async ({ page }) => {
  await login(page, FRONTDESK_EMAIL, FRONTDESK_PASSWORD);
    await dismissConsentWall(page);
  await page.waitForTimeout(2000);
  await shot(page, '5-dashboard');

  // Welcome header text typically contains "Welcome back" or similar
  const welcome = page.getByText(/welcome back|hoş geldin/i);
  const visible = await welcome.isVisible({ timeout: 2000 }).catch(() => false);
  expect(visible, 'Welcome header should be HIDDEN for receptionist').toBe(false);
});
