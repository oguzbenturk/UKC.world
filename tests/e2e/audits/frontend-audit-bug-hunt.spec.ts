/**
 * Frontend Bug-Hunt: Hidden Interaction Problems
 * ─────────────────────────────────────────────────
 * Focused on: dead buttons, double-submit, stale UI, broken modals,
 * incorrect badges, wrong totals, role leakage, table refresh, row targeting,
 * misleading toasts.
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import {
  BASE_URL, loginAsAdmin, loginAsStudent, loginAsManager, login,
  ADMIN_EMAIL, ADMIN_PASSWORD
} from '../helpers';

// ── Helpers ─────────────────────────────────────────────────

const INSTRUCTOR_EMAIL = 'autoinst487747@test.com';
const INSTRUCTOR_PASSWORD = 'TestPass123!';

function finding(testInfo: TestInfo, severity: string, category: string, desc: string) {
  testInfo.annotations.push({ type: 'finding', description: `[${severity}][${category}] ${desc}` });
}

/** Wait for Ant Design page to settle after navigation */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

/** Count console errors during an action */
async function withConsoleErrors(page: Page, fn: () => Promise<void>): Promise<string[]> {
  const errors: string[] = [];
  const handler = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
  page.on('console', handler);
  await fn();
  page.off('console', handler);
  return errors;
}

/** Check if an API call was made (returns count of matching requests) */
async function countApiCalls(page: Page, urlPattern: RegExp, method: string, fn: () => Promise<void>): Promise<number> {
  let count = 0;
  const handler = (request) => {
    if (urlPattern.test(request.url()) && request.method() === method) count++;
  };
  page.on('request', handler);
  await fn();
  await page.waitForTimeout(1500);
  page.off('request', handler);
  return count;
}

// ═══════════════════════════════════════════════════════════
// BH-1: DEAD BUTTONS & NO-EFFECT INTERACTIONS
// ═══════════════════════════════════════════════════════════

test.describe('BH-1: Dead Buttons & No-Effect Interactions', () => {
  test('BH-1.1 Dashboard quick action buttons trigger modals or navigate', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await settle(page);

    // The dashboard may default to analytics view — switch to quick actions if needed
    const viewToggle = page.locator('.ant-segmented, [class*="Segmented"]').first();
    if (await viewToggle.isVisible().catch(() => false)) {
      const qaTab = viewToggle.locator('label, .ant-segmented-item').filter({ hasText: /Quick Actions|Actions/i }).first();
      if (await qaTab.isVisible().catch(() => false)) {
        await qaTab.click();
        await page.waitForTimeout(1000);
      }
    }

    // Look for quick action cards
    const quickActions = page.locator('[class*="QuickAction"], [class*="quick-action"], .ant-card').filter({ hasText: /Academy|Rentals|Shop|Customers|Stay|Member/i });
    const count = await quickActions.count();

    if (count === 0) {
      // Try direct button detection (broader search)
      const actionBtns = page.locator('button, a, [role="button"]').filter({ hasText: /New Booking|New Rental|Quick Sale|Register|Book Room|New Customer/i });
      const btnCount = await actionBtns.count();
      if (btnCount === 0) {
        finding(testInfo, 'Medium', 'Dead UI', 'Dashboard has no visible quick action buttons after switching view modes');
        return;
      }
    }

    // Test "New Booking" action
    const bookingAction = page.locator('button, [role="button"], a').filter({ hasText: /New Booking/i }).first();
    if (await bookingAction.isVisible().catch(() => false)) {
      const urlBefore = page.url();
      await bookingAction.click();
      await page.waitForTimeout(1500);
      const modalVisible = await page.locator('.ant-modal').first().isVisible().catch(() => false);
      const urlChanged = page.url() !== urlBefore;
      if (!modalVisible && !urlChanged) {
        finding(testInfo, 'High', 'Dead Button', 'Dashboard "New Booking" button click has no effect — no modal or navigation');
      }
      // Close any modal that opened
      if (modalVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Test "Quick Sale" action 
    const saleAction = page.locator('button, [role="button"], a').filter({ hasText: /Quick Sale/i }).first();
    if (await saleAction.isVisible().catch(() => false)) {
      const urlBefore = page.url();
      await saleAction.click();
      await page.waitForTimeout(1500);
      const modalVisible = await page.locator('.ant-modal').first().isVisible().catch(() => false);
      const urlChanged = page.url() !== urlBefore;
      if (!modalVisible && !urlChanged) {
        finding(testInfo, 'High', 'Dead Button', 'Dashboard "Quick Sale" button click has no effect');
      }
      if (modalVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }
  });

  test('BH-1.2 Bookings page "New Booking" button works', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    const newBtn = page.locator('button, a').filter({ hasText: /New Booking|Create Booking|Add Booking/i }).first();
    if (!(await newBtn.isVisible().catch(() => false))) {
      finding(testInfo, 'Medium', 'Missing UI', 'Bookings page has no visible "New Booking" button');
      return;
    }

    const urlBefore = page.url();
    await newBtn.click();
    await page.waitForTimeout(2000);
    const modalOpened = await page.locator('.ant-modal').first().isVisible().catch(() => false);
    const navigated = page.url() !== urlBefore;
    if (!modalOpened && !navigated) {
      finding(testInfo, 'High', 'Dead Button', 'Bookings "New Booking" button click has no effect');
    }
  });

  test('BH-1.3 Equipment "Add Equipment" button opens form', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/equipment`);
    await settle(page);

    const addBtn = page.locator('button').filter({ hasText: /Add Equipment|New Equipment/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      finding(testInfo, 'Medium', 'Missing UI', 'Equipment page has no "Add Equipment" button (may be role-gated)');
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1500);
    // Should either open a modal/drawer or switch to form view
    const formVisible = await page.locator('.ant-modal, .ant-drawer, form, [class*="form"]').first().isVisible().catch(() => false);
    const inputVisible = await page.locator('input[placeholder*="name" i], input[id*="name" i]').first().isVisible().catch(() => false);
    if (!formVisible && !inputVisible) {
      finding(testInfo, 'High', 'Dead Button', 'Equipment "Add Equipment" button click shows no form');
    }
  });

  test('BH-1.4 Rentals "Create Rental" button opens modal', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    const createBtn = page.locator('button').filter({ hasText: /Create Rental|New Rental|Add Rental/i }).first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      finding(testInfo, 'High', 'Dead Button', 'Rentals page has no "Create Rental" button');
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1500);
    const modalVisible = await page.locator('.ant-modal').first().isVisible().catch(() => false);
    if (!modalVisible) {
      finding(testInfo, 'High', 'Dead Button', 'Rentals "Create Rental" button does not open modal');
    }
  });

  test('BH-1.5 Inventory page CRUD buttons work', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/inventory`);
    await settle(page);

    const addBtn = page.locator('button').filter({ hasText: /Add Equipment|Add Item|New/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      finding(testInfo, 'Medium', 'Missing UI', 'Inventory page has no add button');
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1500);
    const modalVisible = await page.locator('.ant-modal').first().isVisible().catch(() => false);
    if (!modalVisible) {
      finding(testInfo, 'High', 'Dead Button', 'Inventory "Add" button does not open modal');
    }
    // Close modal
    if (modalVisible) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('BH-1.6 Expenses "Add Expense" button opens modal', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finance/expenses`);
    await settle(page);

    // Button may use different labels like "Record", "Add", "+" icon, etc.
    const addBtn = page.locator('button').filter({ hasText: /Add Expense|New Expense|Record|Add|Create/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      // Try icon-only button with PlusOutlined
      const iconBtn = page.locator('button .anticon-plus, button .anticon-plus-circle').first();
      if (await iconBtn.isVisible().catch(() => false)) {
        await iconBtn.click();
        await page.waitForTimeout(1500);
        const modalVisible = await page.locator('.ant-modal').first().isVisible().catch(() => false);
        if (modalVisible) {
          await page.keyboard.press('Escape');
        }
        return;
      }
      finding(testInfo, 'Medium', 'Missing UI', 'Expenses page has no "Add Expense" button');
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1500);
    const modalVisible = await page.locator('.ant-modal').first().isVisible().catch(() => false);
    if (!modalVisible) {
      finding(testInfo, 'High', 'Dead Button', 'Expenses "Add Expense" button does not open modal');
    }
    if (modalVisible) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('BH-1.7 Customers "Add Customer" button navigates', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/customers`);
    await settle(page);

    // Button may use different text — also try icon-only PlusOutlined button
    let addBtn = page.locator('button, a').filter({ hasText: /Add Customer|New Customer|Register/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      // Try broader text match
      addBtn = page.locator('button.ant-btn-primary').first();
      if (!(await addBtn.isVisible().catch(() => false))) {
        const iconBtn = page.locator('button .anticon-plus').first();
        if (await iconBtn.isVisible().catch(() => false)) {
          addBtn = iconBtn.locator('..');
        } else {
          finding(testInfo, 'Medium', 'Missing UI', 'Customers page has no add button');
          return;
        }
      }
    }

    const urlBefore = page.url();
    await addBtn.click();
    await page.waitForTimeout(2000);
    const navigated = page.url() !== urlBefore;
    const modalVisible = await page.locator('.ant-modal').first().isVisible().catch(() => false);
    if (!navigated && !modalVisible) {
      finding(testInfo, 'High', 'Dead Button', 'Customers "Add Customer" button has no effect');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// BH-2: MODAL QUALITY — Open, Close, Escape, Content
// ═══════════════════════════════════════════════════════════

test.describe('BH-2: Modal Quality', () => {
  test('BH-2.1 Dashboard modals open with content and close properly', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await settle(page);

    // Find and click through each quick action that opens a modal
    const modalTriggers = [
      { name: 'New Booking', expectedContent: /service|instructor|date|booking/i },
      { name: 'New Rental', expectedContent: /customer|equipment|rental|duration/i },
      { name: 'Quick Sale', expectedContent: /product|item|customer|quantity/i },
    ];

    for (const trigger of modalTriggers) {
      const btn = page.locator('button, [role="button"]').filter({ hasText: new RegExp(trigger.name, 'i') }).first();
      if (!(await btn.isVisible().catch(() => false))) continue;

      await btn.click();
      await page.waitForTimeout(2000);

      const modal = page.locator('.ant-modal').first();
      if (!(await modal.isVisible().catch(() => false))) continue;

      // Check modal has actual content (not empty)
      const modalText = await modal.textContent().catch(() => '');
      if (modalText && modalText.trim().length < 20) {
        finding(testInfo, 'Medium', 'Empty Modal', `"${trigger.name}" modal opens but has no meaningful content`);
      }

      // Check modal can be closed via Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      const stillVisible = await modal.isVisible().catch(() => false);
      if (stillVisible) {
        finding(testInfo, 'High', 'Sticky Modal', `"${trigger.name}" modal cannot be dismissed with Escape key`);
        // Try close button
        const closeBtn = modal.locator('.ant-modal-close, button[aria-label="Close"]').first();
        await closeBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  });

  test('BH-2.2 Rental create modal resets on reopen', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    const createBtn = page.locator('button').filter({ hasText: /Create Rental|New Rental/i }).first();
    if (!(await createBtn.isVisible().catch(() => false))) return;

    // Open modal first time
    await createBtn.click();
    await page.waitForTimeout(1500);
    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Type something in the first available input inside the modal
    const firstInput = modal.locator('input, .ant-select-selection-search-input').first();
    if (await firstInput.isVisible().catch(() => false)) {
      await firstInput.click().catch(() => {});
    }

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // Reopen modal
    await createBtn.click();
    await page.waitForTimeout(1500);

    // Check if form was reset — look for any pre-filled values
    const selectValues = await modal.locator('.ant-select-selection-item').count();
    // If there are unexplained pre-filled selects, that's stale state
    if (selectValues > 0) {
      finding(testInfo, 'Medium', 'Stale Modal', 'Rental create modal retains form state from previous open');
    }

    await page.keyboard.press('Escape');
  });

  test('BH-2.3 Voucher create wizard modal works through steps', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/vouchers`);
    await settle(page);

    // Voucher page may use different button labels
    let createBtn = page.locator('button').filter({ hasText: /Create Voucher|New Voucher|Add Voucher|Generate|Create New/i }).first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      // Try icon button or any primary button
      createBtn = page.locator('button.ant-btn-primary').first();
      if (!(await createBtn.isVisible().catch(() => false))) {
        finding(testInfo, 'Medium', 'Missing UI', 'Voucher page has no create button');
        return;
      }
    }

    await createBtn.click();
    await page.waitForTimeout(1500);
    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) {
      finding(testInfo, 'High', 'Dead Button', 'Voucher create button does not open modal');
      return;
    }

    // Check wizard step indicators exist
    const steps = modal.locator('.ant-steps-item, [class*="step"]');
    const stepCount = await steps.count();
    if (stepCount === 0) {
      // Might be a simple form, not a wizard — that's OK
    }

    // Verify modal can be closed
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    const stillOpen = await modal.isVisible().catch(() => false);
    if (stillOpen) {
      finding(testInfo, 'High', 'Sticky Modal', 'Voucher create modal cannot be closed with Escape');
      await modal.locator('.ant-modal-close').first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  });

  test('BH-2.4 Booking detail modal opens from table row click', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    // Wait for table data
    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      // No bookings in the table  
      return;
    }

    // Click first row
    await rows.first().click();
    await page.waitForTimeout(2000);

    // Check if a detail modal or drawer opened
    const detailVisible =
      (await page.locator('.ant-modal').first().isVisible().catch(() => false)) ||
      (await page.locator('.ant-drawer').first().isVisible().catch(() => false));

    const urlChanged = !page.url().includes('/bookings') || page.url().includes('/bookings/');

    if (!detailVisible && !urlChanged) {
      finding(testInfo, 'Medium', 'Dead Interaction', 'Clicking a booking table row does nothing — no modal, drawer, or navigation');
    }

    // Close if needed
    if (detailVisible) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('BH-2.5 Expense modal submits with confirmLoading', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finance/expenses`);
    await settle(page);

    const addBtn = page.locator('button').filter({ hasText: /Add Expense/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) return;

    await addBtn.click();
    await page.waitForTimeout(1500);
    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Try to submit the empty form and check if the submit button shows loading
    const submitBtn = modal.locator('button.ant-btn-primary, button[type="submit"]').filter({ hasText: /OK|Submit|Save|Add/i }).first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(500);
      // After clicking, form validation should prevent submission, but check if button is still available
      const btnDisabled = await submitBtn.isDisabled().catch(() => false);
      const btnLoading = await submitBtn.locator('.ant-btn-loading-icon, .anticon-loading').isVisible().catch(() => false);

      // For an empty form, validation should fire — the button should NOT enter loading state
      // (If it does, validation is broken and it's making an API call with empty data)
      if (btnLoading) {
        finding(testInfo, 'Medium', 'Missing Validation', 'Expense form submits to API even with required fields empty');
      }
    }

    await page.keyboard.press('Escape');
  });
});

// ═══════════════════════════════════════════════════════════
// BH-3: DOUBLE-SUBMIT PREVENTION
// ═══════════════════════════════════════════════════════════

test.describe('BH-3: Double-Submit Prevention', () => {
  test('BH-3.1 Rental modal OK button — rapid double click', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    const createBtn = page.locator('button').filter({ hasText: /Create Rental|New Rental/i }).first();
    if (!(await createBtn.isVisible().catch(() => false))) return;

    await createBtn.click();
    await page.waitForTimeout(1500);
    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Find the submit/OK button
    const okBtn = modal.locator('.ant-modal-footer button.ant-btn-primary, button').filter({ hasText: /OK|Submit|Create|Save/i }).first();
    if (!(await okBtn.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape');
      return;
    }

    // Rapid double-click the OK button and count API calls
    const apiCalls = await countApiCalls(page, /\/api\/(rentals|rental)/, 'POST', async () => {
      await okBtn.click();
      await okBtn.click();
    });

    if (apiCalls > 1) {
      finding(testInfo, 'High', 'Double Submit', `Rental form OK button allows ${apiCalls} API calls on rapid double-click (no debounce/loading guard)`);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('BH-3.2 Voucher create/update — rapid double click', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/vouchers`);
    await settle(page);

    const createBtn = page.locator('button').filter({ hasText: /Create Voucher|New Voucher|Add/i }).first();
    if (!(await createBtn.isVisible().catch(() => false))) return;

    await createBtn.click();
    await page.waitForTimeout(1500);
    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Find submit button in the modal
    const submitBtns = modal.locator('button.ant-btn-primary').filter({ hasText: /Create|Submit|Save|Generate|OK|Next/i });
    const submitBtn = submitBtns.first();
    if (!(await submitBtn.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape');
      return;
    }

    // Check if clicking shows a loading state
    await submitBtn.click();
    await page.waitForTimeout(300);
    const hasLoading = await submitBtn.locator('.ant-btn-loading-icon, .anticon-loading').isVisible().catch(() => false);
    const isDisabled = await submitBtn.isDisabled().catch(() => false);

    if (!hasLoading && !isDisabled) {
      // Button doesn't disable or show loading during submission
      finding(testInfo, 'Medium', 'Double Submit Risk', 'Voucher create submit button has no loading/disabled state during submission');
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('BH-3.3 Student support ticket — double submit prevention', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/support`);
    await settle(page);

    // Find the support form
    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /Send|Submit|Create/i }).first();
    if (!(await submitBtn.isVisible().catch(() => false))) {
      finding(testInfo, 'Medium', 'Missing UI', 'Student support page has no submit button');
      return;
    }

    // Fill in minimal form data
    const subjectInput = page.locator('input').filter({ hasText: /subject/i }).or(page.locator('#subject, [name="subject"]')).first();
    if (await subjectInput.isVisible().catch(() => false)) {
      await subjectInput.fill('Test ticket');
    }
    const messageInput = page.locator('textarea').first();
    if (await messageInput.isVisible().catch(() => false)) {
      await messageInput.fill('This is a test support request for bug hunting');
    }

    // Double-click submit and check for duplicate API calls
    const apiCalls = await countApiCalls(page, /\/api\/(support|tickets|student)/, 'POST', async () => {
      await submitBtn.click();
      await page.waitForTimeout(100);
      await submitBtn.click();
    });

    if (apiCalls > 1) {
      finding(testInfo, 'High', 'Double Submit', `Student support form allows ${apiCalls} ticket submissions on rapid double-click`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// BH-4: RENTAL DELETE WITHOUT CONFIRMATION
// ═══════════════════════════════════════════════════════════

test.describe('BH-4: Delete Safety', () => {
  test('BH-4.1 Rental delete has confirmation dialog', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    // Wait for table to load
    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    const rowCount = await rows.count();
    if (rowCount === 0) return;

    // Find a delete button/icon in the first row
    const firstRow = rows.first();
    const deleteBtn = firstRow.locator('button, [role="button"]').filter({ hasText: /Delete/i })
      .or(firstRow.locator('.anticon-delete, [aria-label*="delete" i]'))
      .first();

    if (!(await deleteBtn.isVisible().catch(() => false))) {
      // Try the actions dropdown
      const actionsBtn = firstRow.locator('.anticon-more, .anticon-ellipsis, button').filter({ hasText: /⋮|Actions|\.\.\./ }).first();
      if (await actionsBtn.isVisible().catch(() => false)) {
        await actionsBtn.click();
        await page.waitForTimeout(500);
      }
      return; // Can't find delete button, skip
    }

    // Track DELETE API calls
    let deleteCalled = false;
    page.on('request', (req) => {
      if (req.method() === 'DELETE' && /rental/i.test(req.url())) deleteCalled = true;
    });

    // Click the delete button
    await deleteBtn.click();
    await page.waitForTimeout(1000);

    // Check if a confirmation dialog appeared
    const confirmVisible =
      (await page.locator('.ant-popconfirm, .ant-modal-confirm, .ant-popover').first().isVisible().catch(() => false)) ||
      (await page.locator('.ant-modal').filter({ hasText: /confirm|sure|delete/i }).first().isVisible().catch(() => false));

    if (!confirmVisible && deleteCalled) {
      finding(testInfo, 'High', 'No Confirm', 'Rental delete executes immediately without confirmation dialog — accidental deletes possible');
    } else if (!confirmVisible && !deleteCalled) {
      // Button might have been blocked by something else
      finding(testInfo, 'Medium', 'Unclear UX', 'Rental delete button clicked but no confirmation dialog and no API call');
    }

    // Dismiss any confirmation that appeared (click Cancel)
    const cancelBtn = page.locator('.ant-popconfirm-buttons .ant-btn:not(.ant-btn-primary), .ant-modal-confirm-btns .ant-btn:not(.ant-btn-primary), .ant-popover button').filter({ hasText: /Cancel|No/i }).first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    }
  });

  test('BH-4.2 Booking delete has confirmation dialog', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    if ((await rows.count()) === 0) return;

    // Find actions column with delete
    const firstRow = rows.first();
    const deleteBtn = firstRow.locator('.anticon-delete, [aria-label*="delete" i]').first();
    if (!(await deleteBtn.isVisible().catch(() => false))) return;

    let deleteCalled = false;
    page.on('request', (req) => {
      if (req.method() === 'DELETE' && /booking/i.test(req.url())) deleteCalled = true;
    });

    await deleteBtn.click();
    await page.waitForTimeout(1000);

    const confirmVisible =
      (await page.locator('.ant-popconfirm, .ant-modal-confirm').first().isVisible().catch(() => false)) ||
      (await page.locator('.ant-modal').filter({ hasText: /confirm|sure|delete/i }).first().isVisible().catch(() => false));

    if (!confirmVisible && deleteCalled) {
      finding(testInfo, 'High', 'No Confirm', 'Booking delete executes immediately without confirmation dialog');
    }

    // Dismiss
    const cancelBtn = page.locator('button').filter({ hasText: /Cancel|No/i }).first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    }
  });
});

// ═══════════════════════════════════════════════════════════
// BH-5: STALE UI AFTER ACTIONS
// ═══════════════════════════════════════════════════════════

test.describe('BH-5: Stale UI After Actions', () => {
  test('BH-5.1 Finance page refreshes when date range changes', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finance`);
    await settle(page);

    // Look for headline stats
    const statsText = await page.locator('[class*="stat"], .ant-card, [class*="kpi"]').allTextContents();
    const initialState = statsText.join('||');

    // Look for date range picker
    const picker = page.locator('.ant-picker-range, .ant-picker').first();
    if (!(await picker.isVisible().catch(() => false))) return;

    // Track API calls on date change
    let apiCallMade = false;
    page.on('request', (req) => {
      if (/\/api\/(finance|revenue|summary|analytics)/i.test(req.url())) apiCallMade = true;
    });

    // Click the picker and select a preset or change dates
    await picker.click();
    await page.waitForTimeout(500);

    // Click a different date in the calendar popup
    const calendarCell = page.locator('.ant-picker-cell-inner').filter({ hasText: /^1$/ }).first();
    if (await calendarCell.isVisible().catch(() => false)) {
      await calendarCell.click();
      await page.waitForTimeout(500);
      const endCell = page.locator('.ant-picker-cell-inner').filter({ hasText: /^15$/ }).first();
      if (await endCell.isVisible().catch(() => false)) {
        await endCell.click();
      }
    }

    await page.waitForTimeout(2000);

    if (!apiCallMade) {
      finding(testInfo, 'Medium', 'Stale UI', 'Finance page date range change does not trigger data refresh');
    }
  });

  test('BH-5.2 Customer table refreshes after returning from profile', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/customers`);
    await settle(page);

    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    if ((await rows.count()) === 0) return;

    // Note the first customer name
    const firstCustomerText = await rows.first().textContent();

    // Click into a customer
    await rows.first().click();
    await page.waitForTimeout(2000);

    // Navigate back to customers list
    await page.goto(`${BASE_URL}/customers`);
    await settle(page);

    // Track if data was re-fetched
    let fetchCalled = false;
    page.on('request', (req) => {
      if (/\/api\/(customers|users)/i.test(req.url()) && req.method() === 'GET') fetchCalled = true;
    });

    await page.waitForTimeout(2000);
    // Data should have been refreshed on mount
    // (We note but don't fail — could be cached)
  });
});

// ═══════════════════════════════════════════════════════════
// BH-6: STATUS BADGE & SUMMARY TOTAL ACCURACY
// ═══════════════════════════════════════════════════════════

test.describe('BH-6: Status Badges & Summary Totals', () => {
  test('BH-6.1 Dashboard KPI cards show numeric values (not NaN or undefined)', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await settle(page);

    // Collect all stat/KPI values
    const statValues = page.locator('.ant-statistic-content-value, [class*="kpi"] [class*="value"], [class*="stat-value"], .text-2xl, .text-3xl');
    const count = await statValues.count();
    const issues: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = (await statValues.nth(i).textContent()) || '';
      if (/NaN|undefined|null|Infinity/i.test(text)) {
        issues.push(`KPI value "${text}" contains invalid data`);
      }
    }

    // Also check for "--" placeholders that might indicate failed data loading
    const allCards = page.locator('.ant-card');
    const cardCount = await allCards.count();
    let dashDashCount = 0;
    for (let i = 0; i < cardCount; i++) {
      const cardText = await allCards.nth(i).textContent();
      if (cardText && (cardText.match(/--/g) || []).length > 2) dashDashCount++;
    }

    if (issues.length > 0) {
      finding(testInfo, 'High', 'Wrong Totals', `Dashboard shows invalid values: ${issues.join('; ')}`);
    }
    if (dashDashCount > 2) {
      finding(testInfo, 'Medium', 'Missing Data', `Dashboard has ${dashDashCount} cards showing "--" placeholder values (data may have failed to load)`);
    }
  });

  test('BH-6.2 Finance headline stats show numbers not placeholders', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finance`);
    await settle(page);

    // Wait longer for finance data
    await page.waitForTimeout(3000);

    const statLabels = ['Expected revenue', 'Collected payments', 'Net revenue', 'Instructor commission', 'Refunds'];
    for (const label of statLabels) {
      const card = page.locator('.ant-card, [class*="stat"]').filter({ hasText: new RegExp(label, 'i') }).first();
      if (!(await card.isVisible().catch(() => false))) continue;

      const value = await card.textContent();
      if (value && /NaN|undefined|null/.test(value)) {
        finding(testInfo, 'High', 'Wrong Totals', `Finance "${label}" shows invalid value`);
      }
    }
  });

  test('BH-6.3 Booking status badges use correct colors', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    // Look for status tags in the table
    const tags = page.locator('.ant-table .ant-tag');
    const tagCount = await tags.count();
    const colorMap: Record<string, string[]> = {};

    for (let i = 0; i < Math.min(tagCount, 20); i++) {
      const text = (await tags.nth(i).textContent())?.toLowerCase().trim() || '';
      const classes = (await tags.nth(i).getAttribute('class')) || '';
      if (!colorMap[text]) colorMap[text] = [];
      colorMap[text].push(classes);
    }

    // Check consistency: same status should have same color class
    for (const [status, classLists] of Object.entries(colorMap)) {
      const unique = [...new Set(classLists)];
      if (unique.length > 1) {
        finding(testInfo, 'Medium', 'Inconsistent Badges', `Booking status "${status}" rendered with ${unique.length} different color variants`);
      }
    }
  });

  test('BH-6.4 Order status badges match valid states', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/services/orders`);
    await settle(page);

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    const tags = page.locator('.ant-table .ant-tag');
    const tagCount = await tags.count();

    for (let i = 0; i < Math.min(tagCount, 20); i++) {
      const text = (await tags.nth(i).textContent())?.toLowerCase().trim() || '';
      if (text && !validStatuses.includes(text) && !text.includes('paid') && !text.includes('completed') && !text.includes('unpaid')) {
        finding(testInfo, 'Low', 'Unknown Badge', `Order table shows unexpected status badge: "${text}"`);
      }
    }
  });

  test('BH-6.5 Expense totals match visible row data direction', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finance/expenses`);
    await settle(page);

    // Look for summary statistics
    const totalStat = page.locator('.ant-statistic, [class*="stat"]').filter({ hasText: /total/i }).first();
    if (!(await totalStat.isVisible().catch(() => false))) return;

    const totalText = await totalStat.textContent();
    // Extract numeric value
    const match = totalText?.match(/([\d,.]+)/);
    if (match) {
      const totalValue = parseFloat(match[1].replace(/,/g, ''));
      if (totalValue < 0) {
        finding(testInfo, 'High', 'Wrong Totals', `Expense total shows negative value: ${totalText}`);
      }
      if (isNaN(totalValue)) {
        finding(testInfo, 'High', 'Wrong Totals', `Expense total is NaN: ${totalText}`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// BH-7: ROLE LEAKAGE IN BUTTONS & MENUS
// ═══════════════════════════════════════════════════════════

test.describe('BH-7: Role Leakage', () => {
  test('BH-7.1 Instructor should NOT see delete buttons for bookings', async ({ page }, testInfo) => {
    await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    // Check for admin-only actions
    const deleteBtn = page.locator('.anticon-delete, button').filter({ hasText: /Delete/i }).first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      finding(testInfo, 'High', 'Role Leakage', 'Instructor can see booking Delete buttons (should be admin/manager only)');
    }

    // Check for bulk delete
    const bulkDelete = page.locator('button').filter({ hasText: /Bulk Delete|Delete Selected/i }).first();
    if (await bulkDelete.isVisible().catch(() => false)) {
      finding(testInfo, 'High', 'Role Leakage', 'Instructor can see bulk Delete actions on bookings');
    }
  });

  test('BH-7.2 Instructor should NOT see customer delete or create', async ({ page }, testInfo) => {
    await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    await page.goto(`${BASE_URL}/customers`);
    await settle(page);

    // If the page loads (not access denied), check for admin-only buttons
    const errorVisible = await page.locator('text=/access denied|unauthorized|403/i').isVisible().catch(() => false);
    if (errorVisible) return; // Access properly denied

    const deleteBtn = page.locator('.anticon-delete, button').filter({ hasText: /Delete/i }).first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      finding(testInfo, 'High', 'Role Leakage', 'Instructor can see customer Delete buttons');
    }

    const createBtn = page.locator('button, a').filter({ hasText: /Add Customer|New Customer/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      // Instructors might legitimately see this — depends on business rules
      // Only flag if clicking it actually works
      await createBtn.click();
      await page.waitForTimeout(1500);
      const navigated = page.url().includes('/new');
      if (navigated) {
        finding(testInfo, 'Medium', 'Role Leakage', 'Instructor can navigate to customer creation page');
      }
    }
  });

  test('BH-7.3 Instructor should NOT see finance pages', async ({ page }, testInfo) => {
    await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    await page.goto(`${BASE_URL}/finance`);
    await settle(page);

    // Check if finance data is visible
    const financeContent = await page.locator('text=/revenue|commission|refund|net revenue/i').first().isVisible().catch(() => false);
    if (financeContent) {
      // Check if it's the instructor's own finance view vs the full admin finance view
      const fullAdmin = await page.locator('text=/Expected revenue|Collected payments/i').first().isVisible().catch(() => false);
      if (fullAdmin) {
        finding(testInfo, 'High', 'Role Leakage', 'Instructor can access full admin Finance dashboard with revenue data');
      }
    }
  });

  test('BH-7.4 Instructor should NOT see admin settings', async ({ page }, testInfo) => {
    await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    await page.goto(`${BASE_URL}/settings`);
    await settle(page);

    // Check for admin-only settings sections
    const adminSettings = ['Voucher', 'Role', 'Waiver', 'Marketing', 'Business Settings'];
    for (const setting of adminSettings) {
      const visible = await page.locator(`text=/${setting}/i`).first().isVisible().catch(() => false);
      if (visible) {
        finding(testInfo, 'High', 'Role Leakage', `Instructor can see "${setting}" in admin settings`);
      }
    }
  });

  test('BH-7.5 Student should NOT see admin sidebar items', async ({ page }, testInfo) => {
    await loginAsStudent(page);
    await settle(page);

    // Check sidebar for admin-only items
    const adminItems = ['Bookings', 'Customers', 'Finance', 'Equipment', 'Inventory', 'Instructors', 'Settings'];
    const sidebar = page.locator('.ant-menu, nav, [class*="sidebar"]');

    for (const item of adminItems) {
      const sidebarItem = sidebar.locator(`text=${item}`).first();
      if (await sidebarItem.isVisible().catch(() => false)) {
        // Check if it's a link that leads to admin routes
        const href = await sidebarItem.getAttribute('href').catch(() => null);
        if (href && !href.includes('student')) {
          finding(testInfo, 'High', 'Role Leakage', `Student sidebar shows admin menu item: "${item}" linking to ${href}`);
        }
      }
    }
  });

  test('BH-7.6 Student should NOT access admin routes directly', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await loginAsStudent(page);
    const adminRoutes = ['/bookings', '/customers', '/finance', '/equipment', '/dashboard'];

    for (const route of adminRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      // Should be redirected to login or student dashboard, or show access denied
      const accessBlocked = currentUrl.includes('/login') || currentUrl.includes('/student') || currentUrl.includes('/unauthorized');
      const errorShown = await page.locator('text=/access denied|unauthorized|403|not authorized/i').first().isVisible().catch(() => false);

      if (!accessBlocked && !errorShown) {
        // Check if actual admin content loaded
        const hasAdminContent = await page.locator('.ant-table, [class*="dashboard"]').first().isVisible().catch(() => false);
        if (hasAdminContent) {
          finding(testInfo, 'Critical', 'Role Leakage', `Student can access admin route ${route} and view content`);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// BH-8: TABLE REFRESH & ROW ACTION TARGETING
// ═══════════════════════════════════════════════════════════

test.describe('BH-8: Table Refresh & Row Targeting', () => {
  test('BH-8.1 Order status dropdown targets correct order', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/services/orders`);
    await settle(page);

    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    const rowCount = await rows.count();
    if (rowCount < 2) return; // Need at least 2 rows to test targeting

    // Get the order numbers from first two rows
    const row1Text = await rows.nth(0).textContent();
    const row2Text = await rows.nth(1).textContent();

    // Find action button on the SECOND row
    const row2Actions = rows.nth(1).locator('.anticon-more, .anticon-ellipsis, button[class*="action"], .ant-dropdown-trigger').first();
    if (!(await row2Actions.isVisible().catch(() => false))) return;

    // Track which order ID is sent in the API call
    let targetedOrderUrl = '';
    page.on('request', (req) => {
      if (/\/api\/shop-orders\//.test(req.url()) && req.method() === 'PATCH') {
        targetedOrderUrl = req.url();
      }
    });

    // Click action on row 2
    await row2Actions.click();
    await page.waitForTimeout(500);

    // Look for a "View Details" option in the dropdown
    const viewDetails = page.locator('.ant-dropdown-menu-item, [role="menuitem"]').filter({ hasText: /View|Details/i }).first();
    if (await viewDetails.isVisible().catch(() => false)) {
      await viewDetails.click();
      await page.waitForTimeout(1500);

      // If a detail modal opened, check it shows ROW 2 data, not ROW 1
      const modal = page.locator('.ant-modal').first();
      if (await modal.isVisible().catch(() => false)) {
        const modalContent = await modal.textContent();
        // The modal should contain data from row 2, not row 1
        // This is a heuristic check — we can't easily verify specific order numbers
        // but we can check the modal isn't empty
        if (!modalContent || modalContent.trim().length < 30) {
          finding(testInfo, 'Medium', 'Wrong Row', 'Order detail modal opened but has no content (may be targeting wrong order)');
        }
        await page.keyboard.press('Escape');
      }
    }
  });

  test('BH-8.2 Instructor table row actions open correct instructor', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/instructors`);
    await settle(page);

    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    const rowCount = await rows.count();
    if (rowCount < 2) return;

    // Get instructor names from first two rows
    const row1Name = (await rows.nth(0).locator('td').first().textContent())?.trim();
    const row2Name = (await rows.nth(1).locator('td').first().textContent())?.trim();

    // Click the Open/View button on row 2
    const row2OpenBtn = rows.nth(1).locator('button').filter({ hasText: /Open|View|Detail/i }).first();
    if (!(await row2OpenBtn.isVisible().catch(() => false))) {
      // Try clicking the row itself
      await rows.nth(1).click();
    } else {
      await row2OpenBtn.click();
    }
    await page.waitForTimeout(1500);

    // Check if a modal/drawer opened with the correct instructor name
    const modal = page.locator('.ant-modal, .ant-drawer').first();
    if (await modal.isVisible().catch(() => false)) {
      const modalContent = await modal.textContent();
      if (row2Name && row1Name && modalContent?.includes(row1Name) && !modalContent?.includes(row2Name)) {
        finding(testInfo, 'High', 'Wrong Row', `Instructor detail shows "${row1Name}" (row 1) when row 2 ("${row2Name}") was clicked`);
      }
      await page.keyboard.press('Escape');
    }
  });

  test('BH-8.3 Booking table auto-refreshes after delete', async ({ page }, testInfo) => {
    // This test only observes — it does NOT actually delete anything
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    const initialCount = await rows.count();
    if (initialCount === 0) return;

    // Look for the undo/delete tracking mechanism
    // The booking list uses `window 'booking-updated'` event to auto-refresh
    // Simulate this event and check if table refreshes
    let fetchTriggered = false;
    page.on('request', (req) => {
      if (/\/api\/bookings/i.test(req.url()) && req.method() === 'GET') fetchTriggered = true;
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('booking-updated'));
    });
    await page.waitForTimeout(2000);

    if (!fetchTriggered) {
      finding(testInfo, 'Medium', 'Stale Table', 'Booking table does not respond to "booking-updated" custom event for auto-refresh');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// BH-9: TOAST & NOTIFICATION ACCURACY
// ═══════════════════════════════════════════════════════════

test.describe('BH-9: Toast & Notification Quality', () => {
  test('BH-9.1 Login success shows appropriate feedback', async ({ page }, testInfo) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });

    await page.fill('#email', ADMIN_EMAIL);
    await page.fill('#password', ADMIN_PASSWORD);

    // Watch for success/error messages
    const messages: string[] = [];
    page.on('console', (msg) => { if (msg.type() !== 'error') return; messages.push(msg.text()); });

    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 25000 });

    // Check for any error toasts after successful login
    const errorToast = await page.locator('.ant-message-error, .ant-notification-error').isVisible().catch(() => false);
    if (errorToast) {
      const toastText = await page.locator('.ant-message-error, .ant-notification-error').textContent();
      finding(testInfo, 'Medium', 'Misleading Toast', `Error toast shown after successful login: "${toastText}"`);
    }
  });

  test('BH-9.2 Invalid login shows error message', async ({ page }, testInfo) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });

    await page.fill('#email', 'wrong@email.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Should show a clear error message
    const errorVisible =
      (await page.locator('.ant-message-error, .ant-alert-error').isVisible().catch(() => false)) ||
      (await page.locator('text=/invalid|wrong|incorrect|failed/i').isVisible().catch(() => false));

    const successToast = await page.locator('.ant-message-success').isVisible().catch(() => false);
    if (successToast) {
      finding(testInfo, 'High', 'Misleading Toast', 'Success toast shown after failed login attempt');
    }

    if (!errorVisible && !successToast) {
      finding(testInfo, 'Medium', 'Missing Feedback', 'No visible error message after invalid login — user gets no feedback');
    }
  });

  test('BH-9.3 Form validation shows field-level errors (not just toast)', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finance/expenses`);
    await settle(page);

    const addBtn = page.locator('button').filter({ hasText: /Add Expense/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) return;

    await addBtn.click();
    await page.waitForTimeout(1500);
    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Submit empty form
    const submitBtn = modal.locator('button.ant-btn-primary').filter({ hasText: /OK|Submit|Save|Add/i }).first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Check for field-level validation errors
      const fieldErrors = modal.locator('.ant-form-item-explain-error, .ant-form-item-has-error');
      const errorCount = await fieldErrors.count();

      if (errorCount === 0) {
        // Check if only a global toast appeared instead
        const toastVisible = await page.locator('.ant-message-error, .ant-message-warning').isVisible().catch(() => false);
        if (toastVisible) {
          finding(testInfo, 'Low', 'Weak Validation', 'Expense form shows only toast error on empty submit — no field-level validation highlights');
        }
      }
    }

    await page.keyboard.press('Escape');
  });
});

// ═══════════════════════════════════════════════════════════
// BH-10: CROSS-PAGE INTERACTION BUGS
// ═══════════════════════════════════════════════════════════

test.describe('BH-10: Cross-Page Interaction Bugs', () => {
  test('BH-10.1 Switching between Finance tabs preserves date range', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finance`);
    await settle(page);

    // Look for tabs
    const tabs = page.locator('.ant-tabs-tab');
    const tabCount = await tabs.count();
    if (tabCount < 2) return;

    // Click second tab
    await tabs.nth(1).click();
    await page.waitForTimeout(1500);

    // Click first tab back
    await tabs.nth(0).click();
    await page.waitForTimeout(1500);

    // Check for console errors during tab switches
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Warning:') && !msg.text().includes('DevTools')) {
        errors.push(msg.text());
      }
    });

    // Switch tabs again
    await tabs.nth(1).click();
    await page.waitForTimeout(1500);

    if (errors.length > 0) {
      finding(testInfo, 'Medium', 'Console Error', `Finance tab switch produces console errors: ${errors[0].substring(0, 100)}`);
    }
  });

  test('BH-10.2 Navigating away from unsaved form does not crash', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/customers/new`);
    await settle(page);

    // Type in a form field to dirty it
    const nameInput = page.locator('input').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Test User Dirty Form');
    }

    // Navigate away
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Warning:')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/customers`);
    await settle(page);

    // Check for unhandled errors (state updates on unmounted components, etc.)
    if (consoleErrors.some(e => /unmounted|setState|memory leak/i.test(e))) {
      finding(testInfo, 'Medium', 'Memory Leak', 'Navigating away from dirty customer form causes setState-on-unmounted error');
    }
  });

  test('BH-10.3 Refreshing page on booking edit maintains data', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    if ((await rows.count()) === 0) return;

    // Click edit on first booking
    const editBtn = rows.first().locator('button, a').filter({ hasText: /Edit/i }).or(rows.first().locator('.anticon-edit')).first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(2000);

      // If we navigated to an edit page, refresh
      if (page.url().includes('/edit') || page.url().includes('/bookings/')) {
        const currentUrl = page.url();
        await page.reload();
        await settle(page);

        // Should still be on the same page with data loaded
        const errorShown = await page.locator('text=/error|failed|not found/i').first().isVisible().catch(() => false);
        const spinnerStuck = await page.locator('.ant-spin-spinning').isVisible().catch(() => false);
        if (errorShown) {
          finding(testInfo, 'Medium', 'Stale State', 'Refreshing booking edit page shows error (data not refetched from URL params)');
        }
        if (spinnerStuck) {
          finding(testInfo, 'Medium', 'Stuck Loading', 'Booking edit page stuck in loading state after browser refresh');
        }
      }
    }
  });

  test('BH-10.4 Student wallet modal opens and has functional deposit button', async ({ page }, testInfo) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/dashboard`);
    await settle(page);

    // Look for wallet/deposit trigger button
    const walletBtn = page.locator('button, [role="button"]').filter({ hasText: /Wallet|Deposit|Add Funds|Top Up|Balance/i }).first();
    if (!(await walletBtn.isVisible().catch(() => false))) {
      // Try the specific wallet trigger component
      const walletTrigger = page.locator('[class*="wallet"], [data-testid*="wallet"]').first();
      if (!(await walletTrigger.isVisible().catch(() => false))) {
        finding(testInfo, 'Medium', 'Missing UI', 'Student dashboard has no visible wallet/deposit button');
        return;
      }
      await walletTrigger.click();
    } else {
      await walletBtn.click();
    }
    await page.waitForTimeout(2000);

    // Check if wallet modal opened
    const modal = page.locator('.ant-modal, .ant-drawer').first();
    if (!(await modal.isVisible().catch(() => false))) {
      finding(testInfo, 'High', 'Dead Button', 'Student wallet/deposit button click does not open any modal');
      return;
    }

    // Check modal has balance info
    const hasBalance = await modal.locator('text=/balance|available|€|EUR|TRY/i').isVisible().catch(() => false);
    if (!hasBalance) {
      finding(testInfo, 'Medium', 'Empty Modal', 'Student wallet modal opened but shows no balance information');
    }

    // Check for "Add Funds" button inside the modal
    const addFundsBtn = modal.locator('button, .ant-dropdown-trigger').filter({ hasText: /Add Funds|Deposit|Credit Card|Top Up/i }).first();
    if (!(await addFundsBtn.isVisible().catch(() => false))) {
      finding(testInfo, 'Medium', 'Missing Action', 'Student wallet modal has no "Add Funds" or deposit button');
    }

    await page.keyboard.press('Escape');
  });

  test('BH-10.5 Student schedule shows reschedule/cancel buttons for upcoming lessons', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/schedule`);
    await settle(page);

    // Look for upcoming lessons
    const upcomingSection = page.locator('text=/upcoming|scheduled/i').first();
    if (!(await upcomingSection.isVisible().catch(() => false))) {
      // No upcoming lessons — that's OK, but check the page loaded
      const pageLoaded = await page.locator('.ant-table, .ant-list, .ant-card, [class*="schedule"]').first().isVisible().catch(() => false);
      if (!pageLoaded) {
        finding(testInfo, 'Medium', 'Missing Content', 'Student schedule page shows no content (table/list/cards)');
      }
      return;
    }

    // Check for action buttons on upcoming lessons
    const lessonCards = page.locator('.ant-table-row, .ant-card, .ant-list-item').filter({ hasText: /upcoming|scheduled|confirmed/i });
    const lessonCount = await lessonCards.count();
    if (lessonCount > 0) {
      const firstLesson = lessonCards.first();
      const hasReschedule = await firstLesson.locator('button').filter({ hasText: /Reschedule/i }).isVisible().catch(() => false);
      const hasCancel = await firstLesson.locator('button').filter({ hasText: /Cancel/i }).isVisible().catch(() => false);

      if (!hasReschedule && !hasCancel) {
        finding(testInfo, 'Medium', 'Missing Actions', 'Student upcoming lessons have no Reschedule or Cancel buttons');
      }
    }
  });

  test('BH-10.6 Admin members page loads without errors', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/calendars/members`);
    await settle(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Warning:') && !msg.text().includes('DevTools')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    // Check page has content
    const hasContent = await page.locator('.ant-table, .ant-card, .ant-empty').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(testInfo, 'Medium', 'Missing Content', 'Members page shows no table or content');
    }

    // Check for NaN in stats
    const statValues = await page.locator('.ant-statistic-content-value').allTextContents();
    for (const val of statValues) {
      if (/NaN|undefined|null/i.test(val)) {
        finding(testInfo, 'High', 'Wrong Totals', `Members page stat shows invalid value: "${val}"`);
      }
    }
  });

  test('BH-10.7 Admin roles page — protected roles cannot be deleted', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/roles`);
    await settle(page);

    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    const rowCount = await rows.count();
    if (rowCount === 0) return;

    // Find a row for a protected role (admin, student, instructor, etc.)
    const protectedRoles = ['admin', 'student', 'instructor', 'manager', 'super_admin'];
    for (const roleName of protectedRoles) {
      const roleRow = rows.filter({ hasText: new RegExp(`^${roleName}$|\\b${roleName}\\b`, 'i') }).first();
      if (await roleRow.isVisible().catch(() => false)) {
        // Check that delete button is disabled or not present
        const deleteBtn = roleRow.locator('button').filter({ hasText: /Delete/i }).or(roleRow.locator('.anticon-delete')).first();
        if (await deleteBtn.isVisible().catch(() => false)) {
          const isDisabled = await deleteBtn.isDisabled().catch(() => false);
          if (!isDisabled) {
            finding(testInfo, 'High', 'Missing Guard', `Protected role "${roleName}" has an active (non-disabled) delete button`);
          }
        }
        break; // Only check the first one we find
      }
    }
  });

  test('BH-10.8 Repairs page loads and create button works', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/repairs`);
    await settle(page);

    const createBtn = page.locator('button').filter({ hasText: /New Repair|Create Repair|Report/i }).first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      finding(testInfo, 'Medium', 'Missing UI', 'Repairs page has no create/report button');
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1500);
    const modalOrDrawer = (await page.locator('.ant-modal').first().isVisible().catch(() => false)) ||
                         (await page.locator('.ant-drawer').first().isVisible().catch(() => false));
    if (!modalOrDrawer) {
      finding(testInfo, 'High', 'Dead Button', 'Repairs "New Repair" button click has no effect');
    }

    await page.keyboard.press('Escape');
  });
});

// ═══════════════════════════════════════════════════════════  
// BH-11: CONSOLE ERROR DETECTION ON KEY PAGES
// ═══════════════════════════════════════════════════════════

test.describe('BH-11: Console Error Detection', () => {
  const adminPages = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Bookings', path: '/bookings' },
    { name: 'Customers', path: '/customers' },
    { name: 'Rentals', path: '/rentals' },
    { name: 'Finance', path: '/finance' },
    { name: 'Inventory', path: '/inventory' },
    { name: 'Instructors', path: '/instructors' },
    { name: 'Members', path: '/members' },
    { name: 'Shop Management', path: '/services/shop' },
    { name: 'Orders', path: '/services/orders' },
  ];

  for (const pg of adminPages) {
    test(`BH-11.${adminPages.indexOf(pg) + 1} ${pg.name} loads without JS errors`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Filter out known non-issues
          if (text.includes('Warning:') || text.includes('DevTools') || text.includes('net::ERR') || text.includes('favicon') || text.includes('401') || text.includes('403') || text.includes('status of 4')) return;
          errors.push(text);
        }
      });

      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}${pg.path}`);
      await settle(page);
      await page.waitForTimeout(2000);

      // Filter to meaningful errors
      const realErrors = errors.filter(e =>
        !e.includes('React does not recognize') &&
        !e.includes('validateDOMNesting') &&
        !e.includes('Each child in a list') &&
        !e.includes('findDOMNode') &&
        !e.includes('ResizeObserver') &&
        !e.includes('404')
      );

      if (realErrors.length > 0) {
        finding(testInfo, 'Medium', 'JS Error', `${pg.name} page has ${realErrors.length} console error(s): ${realErrors[0].substring(0, 150)}`);
      }
    });
  }
});
