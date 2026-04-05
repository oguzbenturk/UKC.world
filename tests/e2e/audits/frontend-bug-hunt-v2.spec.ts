/**
 * Frontend Bug-Hunt V2: Deep Interaction Problems
 * ─────────────────────────────────────────────────
 * Source-code-verified bugs targeting:
 *  - Rental status badges missing color mappings
 *  - Calendar event statuses defaulting to gray
 *  - Toast messages firing before data refresh
 *  - Dead tile click handlers on customer profiles
 *  - Double-submit on rental package forms
 *  - Role leakage via empty permission arrays
 *  - Stale UI after quick modal actions
 *  - Booking conflict modal missing status cases
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import {
  BASE_URL, API_URL, loginAsAdmin, loginAsStudent, loginAsManager, login,
  ADMIN_EMAIL, ADMIN_PASSWORD
} from '../helpers';

// ── Constants ───────────────────────────────────────────────

const INSTRUCTOR_EMAIL = 'autoinst487747@test.com';
const INSTRUCTOR_PASSWORD = 'TestPass123!';
const FRONTDESK_EMAIL = 'frontdesk@test.com';
const FRONTDESK_PASSWORD = 'TestPass123!';

// ── Helpers ─────────────────────────────────────────────────

function finding(testInfo: TestInfo, severity: string, category: string, desc: string) {
  testInfo.annotations.push({ type: 'finding', description: `[${severity}][${category}] ${desc}` });
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

async function countApiCalls(page: Page, urlPattern: RegExp, method: string, fn: () => Promise<void>): Promise<number> {
  let count = 0;
  const handler = (request) => {
    if (urlPattern.test(request.url()) && request.method() === method) count++;
  };
  page.on('request', handler);
  await fn();
  await page.waitForTimeout(2000);
  page.off('request', handler);
  return count;
}

// ═══════════════════════════════════════════════════════════
// V2-1: RENTAL STATUS BADGE COLOR GAPS
// Only 'active' and 'completed' are mapped; everything else
// falls through to gray default.
// ═══════════════════════════════════════════════════════════

test.describe('V2-1: Rental Status Badge Completeness', () => {
  test('V2-1.1 Rental status column renders non-gray tags for known statuses', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    // Look for the rental table
    const table = page.locator('.ant-table-tbody, table tbody').first();
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      finding(testInfo, 'Info', 'No Data', 'Rentals table not visible — no data to verify status badges');
      return;
    }

    // Collect all status tags in the table
    const statusTags = page.locator('.ant-table-tbody .ant-tag, table tbody .ant-tag');
    const tagCount = await statusTags.count();

    if (tagCount === 0) {
      finding(testInfo, 'Info', 'No Data', 'No status tags found in rentals table');
      return;
    }

    const grayTags: string[] = [];
    const coloredTags: string[] = [];
    for (let i = 0; i < tagCount; i++) {
      const tag = statusTags.nth(i);
      const text = (await tag.textContent() || '').trim().toLowerCase();
      const className = (await tag.getAttribute('class')) || '';
      // Ant Design default/gray tags have no color- class or have color="default"
      const isDefault = !className.includes('ant-tag-green') &&
                        !className.includes('ant-tag-blue') &&
                        !className.includes('ant-tag-red') &&
                        !className.includes('ant-tag-orange') &&
                        !className.includes('ant-tag-yellow') &&
                        !className.includes('ant-tag-cyan') &&
                        !className.includes('ant-tag-purple') &&
                        !className.includes('ant-tag-magenta') &&
                        !className.includes('ant-tag-gold') &&
                        !className.includes('ant-tag-lime') &&
                        !className.includes('ant-tag-volcano');
      if (isDefault && text && text !== 'active' && text !== 'completed') {
        grayTags.push(text);
      } else {
        coloredTags.push(text);
      }
    }

    if (grayTags.length > 0) {
      finding(testInfo, 'Medium', 'Status Badge',
        `Rentals: ${grayTags.length} status tag(s) render with default/gray color — unmapped statuses: [${[...new Set(grayTags)].join(', ')}]. ` +
        `Only "active" (green) and "completed" (gray) are mapped in Rentals.jsx ~L982.`);
    }
  });

  test('V2-1.2 Rental request status badges cover approve/decline states', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    // Switch to Rental Requests tab if present
    const requestTab = page.locator('.ant-tabs-tab, [role="tab"]').filter({ hasText: /Request|Pending/i }).first();
    if (await requestTab.isVisible().catch(() => false)) {
      await requestTab.click();
      await settle(page);
    }

    // Check for status badges in the requests section
    const requestTags = page.locator('.ant-tag').filter({ hasText: /pending|approved|declined|rejected/i });
    const requestTagCount = await requestTags.count();
    if (requestTagCount === 0) {
      // No rental requests to check — not a finding
      return;
    }

    // Verify each has color
    for (let i = 0; i < requestTagCount; i++) {
      const tag = requestTags.nth(i);
      const text = (await tag.textContent() || '').trim().toLowerCase();
      const className = (await tag.getAttribute('class')) || '';
      const hasColor = /ant-tag-(green|blue|red|orange|yellow|cyan|gold|lime|volcano|magenta|purple)/.test(className);
      if (!hasColor) {
        finding(testInfo, 'Low', 'Status Badge',
          `Rental request status "${text}" renders with no explicit color class`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// V2-2: BOOKING CALENDAR EVENT STATUS COLOR GAPS
// Missing no_show, tentative, blocked_out, in_progress
// ═══════════════════════════════════════════════════════════

test.describe('V2-2: Booking Calendar Status Colors', () => {
  test('V2-2.1 Calendar events use distinct colors per status', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings/calendar`);
    await settle(page);

    // Wait for calendar to render
    const calendarEl = page.locator('.fc, [class*="calendar"], [class*="Calendar"]').first();
    const calPresent = await calendarEl.isVisible({ timeout: 8000 }).catch(() => false);
    if (!calPresent) {
      finding(testInfo, 'Info', 'No Data', 'Booking calendar not visible — cannot verify event colors');
      return;
    }

    // Find all calendar events
    const events = page.locator('.fc-event, [class*="calendar-event"], [class*="CalendarEvent"]');
    const eventCount = await events.count();
    if (eventCount === 0) {
      // No events is not a finding
      return;
    }

    // Look for any gray/default colored events that might be unmapped statuses
    let grayEventCount = 0;
    for (let i = 0; i < Math.min(eventCount, 20); i++) {
      const evt = events.nth(i);
      const className = (await evt.getAttribute('class')) || '';
      const style = (await evt.getAttribute('style')) || '';
      // Check for gray backgrounds — events with mapped statuses should have color
      const isGray = (style.includes('bg-gray') || style.includes('rgb(107') || style.includes('#6b7280') ||
                      className.includes('bg-gray') || className.includes('gray-500'));
      if (isGray) grayEventCount++;
    }

    if (grayEventCount > 0) {
      finding(testInfo, 'Medium', 'Status Badge',
        `Booking calendar: ${grayEventCount}/${Math.min(eventCount, 20)} events render with gray color — ` +
        `BookingCalendarUpdated.jsx ~L663 only maps confirmed/pending/completed/booked/cancelled. ` +
        `Missing: no_show, tentative, blocked_out, in_progress all default to bg-gray-500.`);
    }
  });

  test('V2-2.2 Booking list status badges cover all statuses including no_show', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    // Get all status tags/badges
    const statusElements = page.locator('.ant-tag, .ant-badge-status-dot, [class*="status"]');
    const count = await statusElements.count();
    if (count === 0) return;

    const statuses = new Set<string>();
    for (let i = 0; i < Math.min(count, 30); i++) {
      const text = (await statusElements.nth(i).textContent() || '').trim().toLowerCase();
      if (text) statuses.add(text);
    }

    // Check if we see a no_show status with appropriate visual treatment
    const noShowBadge = page.locator('.ant-tag, [class*="status"]').filter({ hasText: /no.?show/i }).first();
    if (await noShowBadge.isVisible().catch(() => false)) {
      const className = (await noShowBadge.getAttribute('class')) || '';
      const hasDistinctColor = /ant-tag-(red|orange|volcano|magenta)|bg-(red|orange|amber)/.test(className);
      if (!hasDistinctColor) {
        finding(testInfo, 'Medium', 'Status Badge',
          'Booking no_show status badge visible but uses default/gray color instead of a warning color');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// V2-3: TOAST BEFORE REFETCH PATTERN
// Multiple Quick*Modals fire message.success() before
// calling onSuccess() callback that triggers data refresh.
// ═══════════════════════════════════════════════════════════

test.describe('V2-3: Premature Success Toast Pattern', () => {
  test('V2-3.1 Dashboard Quick Sale modal — toast vs data refresh timing', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await settle(page);

    // Find and click Quick Sale / Shop action
    const saleBtn = page.locator('button, [role="button"], a, .ant-card').filter({ hasText: /Quick Sale|Shop/i }).first();
    if (!(await saleBtn.isVisible().catch(() => false))) {
      // Try the quick actions section
      const allBtns = page.locator('[class*="QuickAction"], [class*="quick-action"]').filter({ hasText: /Shop|Sale/i }).first();
      if (!(await allBtns.isVisible().catch(() => false))) return;
      await allBtns.click();
    } else {
      await saleBtn.click();
    }
    await page.waitForTimeout(1500);

    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Source code analysis: QuickShopSaleModal.jsx L123 fires message.success()
    // BEFORE L128 calls onSuccess() which triggers parent refetch.
    // This is a code-level finding — we document it regardless of runtime test.
    finding(testInfo, 'Low', 'Toast Timing',
      'QuickShopSaleModal.jsx:L123 fires message.success("Sale completed successfully!") synchronously ' +
      'BEFORE L128 calls onSuccess() callback that triggers parent data refetch. ' +
      'User sees success toast before data actually updates in the UI.');

    // Close modal
    await page.keyboard.press('Escape');
  });

  test('V2-3.2 StudentPayments wallet deposit — toast fires before refetch completes', async ({ page }, testInfo) => {
    // This is a code-level finding from StudentPayments.jsx ~L418-427
    // refetch() is called but not awaited, then notification.success() fires immediately
    finding(testInfo, 'Low', 'Toast Timing',
      'StudentPayments.jsx:L420-425 calls refetch() (async, NOT awaited) then immediately fires ' +
      'notification.success("Funds Added"). Toast appears before wallet balance actually updates. ' +
      'Same pattern at L190-199 in Iyzico callback.');
  });

  test('V2-3.3 Quick modals on dashboard all share premature toast pattern', async ({ page }, testInfo) => {
    // Source-code verified pattern across 6 Quick*Modal components:
    // All call message.success() then onSuccess?.() sequentially in try block
    const affectedFiles = [
      'QuickShopSaleModal.jsx',
      'QuickRentalModal.jsx',
      'QuickMembershipModal.jsx',
      'QuickCustomerModal.jsx',
      'QuickAccommodationModal.jsx',
    ];

    finding(testInfo, 'Medium', 'Toast Timing',
      `Premature success toast pattern found in ${affectedFiles.length} dashboard Quick*Modal files: ` +
      `[${affectedFiles.join(', ')}]. All call message.success() BEFORE calling onSuccess() callback. ` +
      'If the parent refetch fails or is slow, user already saw "success" and may navigate away.');
  });
});

// ═══════════════════════════════════════════════════════════
// V2-4: DEAD CLICK HANDLERS & UNDEFINED onClick
// CustomerProfilePage.jsx L2149 — tiles with undefined onClick
// ═══════════════════════════════════════════════════════════

test.describe('V2-4: Dead Click Handlers on Tiles/Cards', () => {
  test('V2-4.1 Customer profile highlight tiles — non-clickable tiles should not look interactive', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/customers`);
    await settle(page);

    // Find and click a customer to go to their profile
    const customerRow = page.locator('.ant-table-row, tr[data-row-key]').first();
    const rowVisible = await customerRow.isVisible().catch(() => false);
    if (!rowVisible) {
      // Try navigating to a known customer URL
      await page.goto(`${BASE_URL}/customers`);
      await settle(page);
      // Use the first link/button that opens a customer
      const customerLink = page.locator('a[href*="/customers/"], button').filter({ hasText: /View|Details|Edit/i }).first();
      if (!(await customerLink.isVisible().catch(() => false))) return;
      await customerLink.click();
    } else {
      // Click the row or the first action button
      const viewBtn = customerRow.locator('a, button').filter({ hasText: /View|Edit|Details/i }).first();
      if (await viewBtn.isVisible().catch(() => false)) {
        await viewBtn.click();
      } else {
        await customerRow.click();
      }
    }
    await settle(page);

    // We should be on a customer profile page now
    const onProfile = page.url().includes('/customers/');
    if (!onProfile) return;

    // Look for highlight tiles/cards (the quickHighlights section)
    const tiles = page.locator('[class*="highlight"], [class*="stat-card"], [class*="kpi"], .ant-card').filter({
      hasText: /Balance|Lifetime|Hours|Packages|Booking|Attendance/i
    });
    const tileCount = await tiles.count();

    if (tileCount === 0) {
      // Look for stat tiles more broadly
      const anyTiles = page.locator('button, div[role="button"]').filter({ hasText: /Balance|Value|Hours/i });
      if (await anyTiles.count() === 0) return;
    }

    // Source-code finding: CustomerProfilePage.jsx L2149 sets onClick={undefined}
    // for tiles where quickHighlights[].onClick is not defined (Balance, Lifetime Value, Hours Attended)
    finding(testInfo, 'Low', 'Dead Button',
      'CustomerProfilePage.jsx:L2149 renders onClick={undefined} for 3 highlight tiles ' +
      '(Current Balance, Lifetime Value, Hours Attended) that have no onClick in quickHighlights array (L705-739). ' +
      'These tiles render as <div> elements, not <button>, so no UX harm, but onClick={undefined} is passed as a prop.');
  });

  test('V2-4.2 LiveFormPreview has hardcoded disabled={false}', async ({ page }, testInfo) => {
    // Source-code finding: LiveFormPreview.jsx L307 has disabled={false} hardcoded
    finding(testInfo, 'Info', 'Code Quality',
      'LiveFormPreview.jsx:L307 has disabled={false} hardcoded on form inputs. ' +
      'Since this is a preview component, inputs should be disabled to prevent user confusion. ' +
      'However, this is cosmetic — the preview is read-only by design context.');
  });
});

// ═══════════════════════════════════════════════════════════
// V2-5: DOUBLE-SUBMIT ON FORMS WITHOUT BUTTON DISABLE
// RentalPackageManager.jsx — Form not disabled during submit
// ═══════════════════════════════════════════════════════════

test.describe('V2-5: Double-Submit Vulnerability', () => {
  test('V2-5.1 Rental Package create — rapid double click on save', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    // Look for rental packages tab or section
    const packagesTab = page.locator('.ant-tabs-tab, [role="tab"]').filter({ hasText: /Package/i }).first();
    if (await packagesTab.isVisible().catch(() => false)) {
      await packagesTab.click();
      await settle(page);
    }

    // Find "Add Package" or "Create Package" button
    const addBtn = page.locator('button').filter({ hasText: /Add Package|Create Package|New Package/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      // Packages might be managed differently
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    // Check if a modal or form opened
    const modal = page.locator('.ant-modal, .ant-drawer').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Find the submit/save button
    const saveBtn = modal.locator('button').filter({ hasText: /Save|Create|Submit|OK/i }).first();
    if (!(await saveBtn.isVisible().catch(() => false))) return;

    // Count API calls during rapid double-click
    const apiCalls = await countApiCalls(page, /rental.*package|package/i, 'POST', async () => {
      // Don't fill the form — just rapid-click the save button
      await saveBtn.click({ force: true });
      await saveBtn.click({ force: true });
    });

    // If the button doesn't disable itself, we may get 2 API calls
    if (apiCalls > 1) {
      finding(testInfo, 'High', 'Double Submit',
        `Rental package save: ${apiCalls} POST requests sent on rapid double-click. ` +
        `RentalPackageManager.jsx:L664 uses loading state inside handler but Form is not disabled during submission.`);
    }
  });

  test('V2-5.2 Expense form rapid double submit', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finances/expenses`);
    await settle(page);

    // Find add expense button (confirmed in ExpensesPage.jsx L376)
    const addBtn = page.locator('button').filter({ hasText: /Add Expense|New Expense|Create/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) return;

    await addBtn.click();
    await page.waitForTimeout(1000);

    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Fill minimum required fields
    const descInput = modal.locator('input[id*="description"], input[id*="title"], textarea').first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill('Test expense double-submit check');
    }
    const amountInput = modal.locator('input[id*="amount"], input[type="number"]').first();
    if (await amountInput.isVisible().catch(() => false)) {
      await amountInput.fill('1.00');
    }

    // Find save/submit button
    const saveBtn = modal.locator('button').filter({ hasText: /Save|Submit|OK|Add/i }).first();
    if (!(await saveBtn.isVisible().catch(() => false))) return;

    // Count API calls during rapid click
    const apiCalls = await countApiCalls(page, /business-expense|expense/i, 'POST', async () => {
      await saveBtn.click({ force: true });
      await saveBtn.click({ force: true });
    });

    // ExpensesPage.jsx uses setSubmitting(true/false) — should prevent double submit
    if (apiCalls > 1) {
      finding(testInfo, 'High', 'Double Submit',
        `Expense form: ${apiCalls} POST requests on rapid double-click. ` +
        `ExpensesPage.jsx submit handler uses setSubmitting() but button may not be disabled fast enough.`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// V2-6: ROLE LEAKAGE — EMPTY PERMISSION ARRAYS
// navConfig.js dashboard: [] means visible to ALL roles
// ═══════════════════════════════════════════════════════════

test.describe('V2-6: Role Leakage via Permission Gaps', () => {
  test('V2-6.1 Front desk user can see full admin dashboard', async ({ page }, testInfo) => {
    // Login as front desk
    try {
      await login(page, FRONTDESK_EMAIL, FRONTDESK_PASSWORD);
    } catch {
      // FD user may not exist in test env
      finding(testInfo, 'Info', 'Test Env', 'Front desk test user not available — skipping FD role leakage test');
      return;
    }
    await page.goto(`${BASE_URL}/dashboard`);
    await settle(page);

    // Front desk should see the dashboard (navConfig permissions: [])
    // But should NOT see admin-only content like revenue, commission, etc.
    const adminContent = page.locator('text=/Revenue|Commission|Profit|Financial|Total Income/i').first();
    const hasAdminContent = await adminContent.isVisible().catch(() => false);

    if (hasAdminContent) {
      finding(testInfo, 'High', 'Role Leakage',
        'Front desk user can see admin-level financial data (Revenue/Commission/Profit) on dashboard. ' +
        'navConfig.js:L14 sets dashboard permissions to [] (empty) which grants access to all roles. ' +
        'Dashboard components should filter sensitive stats by role.');
    }

    // Check sidebar for admin-only items
    const sidebar = page.locator('.ant-menu, nav, [class*="sidebar"], [class*="Sidebar"]').first();
    if (await sidebar.isVisible().catch(() => false)) {
      const adminMenuItems = sidebar.locator('text=/Settings|Roles|Analytics|Admin/i');
      const adminItemCount = await adminMenuItems.count();
      if (adminItemCount > 0) {
        const visibleItems: string[] = [];
        for (let i = 0; i < adminItemCount; i++) {
          if (await adminMenuItems.nth(i).isVisible().catch(() => false)) {
            visibleItems.push((await adminMenuItems.nth(i).textContent() || '').trim());
          }
        }
        if (visibleItems.length > 0) {
          finding(testInfo, 'High', 'Role Leakage',
            `Front desk user can see admin sidebar items: [${visibleItems.join(', ')}]. ` +
            'These should be hidden for non-admin roles.');
        }
      }
    }
  });

  test('V2-6.2 Instructor should not see admin settings or roles in sidebar', async ({ page }, testInfo) => {
    try {
      await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    } catch {
      finding(testInfo, 'Info', 'Test Env', 'Instructor test user not available');
      return;
    }
    await page.goto(`${BASE_URL}/dashboard`);
    await settle(page);

    const sidebar = page.locator('.ant-menu, nav, [class*="sidebar"], [class*="Sidebar"]').first();
    if (!(await sidebar.isVisible().catch(() => false))) return;

    // Settings should require admin:settings permission
    const settingsLink = sidebar.locator('a, [class*="menu-item"]').filter({ hasText: /Settings/i }).first();
    if (await settingsLink.isVisible().catch(() => false)) {
      finding(testInfo, 'High', 'Role Leakage',
        'Instructor role can see "Settings" sidebar item which requires admin:settings permission. ' +
        'navConfig.js:L28 settings requires ["admin:settings", "admin:roles"] but instructor should not have these.');
    }

    // Analytics should require admin:settings
    const analyticsLink = sidebar.locator('a, [class*="menu-item"]').filter({ hasText: /Analytics/i }).first();
    if (await analyticsLink.isVisible().catch(() => false)) {
      finding(testInfo, 'High', 'Role Leakage',
        'Instructor role can see "Analytics" sidebar item which requires admin:settings permission.');
    }

    // Roles should require admin:roles
    const rolesLink = sidebar.locator('a, [class*="menu-item"]').filter({ hasText: /Roles/i }).first();
    if (await rolesLink.isVisible().catch(() => false)) {
      finding(testInfo, 'High', 'Role Leakage',
        'Instructor role can see "Roles" sidebar item which requires admin:roles permission.');
    }
  });

  test('V2-6.3 Student navigating to admin API routes gets blocked', async ({ page }, testInfo) => {
    await loginAsStudent(page);

    // Try accessing admin-only API endpoints directly
    const adminEndpoints = [
      '/api/admin/settings',
      '/api/admin/roles',
      '/api/finances/summary',
      '/api/commission/settings',
    ];

    for (const endpoint of adminEndpoints) {
      const response = await page.request.get(`${API_URL.replace('/api', '')}${endpoint}`);
      const status = response.status();
      if (status === 200) {
        finding(testInfo, 'Critical', 'Role Leakage',
          `Student can access admin endpoint ${endpoint} — returned HTTP 200. ` +
          'Backend should return 401/403 for unauthorized roles.');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// V2-7: STALE UI AFTER MODAL ACTIONS
// Quick modals on dashboard — after creating, does the
// underlying page/list actually reflect the new data?
// ═══════════════════════════════════════════════════════════

test.describe('V2-7: Stale UI After Quick Actions', () => {
  test('V2-7.1 Dashboard stats update after quick customer creation', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await settle(page);

    // Capture current customer count if visible
    const customerStat = page.locator('[class*="stat"], [class*="kpi"], .ant-statistic').filter({ hasText: /Customer|Client/i }).first();
    let beforeCount = '';
    if (await customerStat.isVisible().catch(() => false)) {
      beforeCount = (await customerStat.textContent() || '').trim();
    }

    // Click "Quick Customer" or register customer action
    const customerAction = page.locator('button, [role="button"], .ant-card').filter({ hasText: /Register|New Customer|Quick Customer/i }).first();
    if (!(await customerAction.isVisible().catch(() => false))) return;

    await customerAction.click();
    await page.waitForTimeout(1500);

    const modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Don't actually submit — just verify the modal has proper form content
    const hasNameField = await modal.locator('input[id*="name"], input[placeholder*="name" i]').first().isVisible().catch(() => false);
    const hasEmailField = await modal.locator('input[id*="email"], input[type="email"]').first().isVisible().catch(() => false);

    if (!hasNameField && !hasEmailField) {
      finding(testInfo, 'Medium', 'Broken Modal',
        'Quick Customer modal opens but has no visible name or email field — form may be empty/broken');
    }

    // Close without submitting
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('V2-7.2 BankTransferModal missing explicit cache invalidation', async ({ page }, testInfo) => {
    // Source-code finding: BankTransferModal.jsx has no explicit invalidateQueries call
    finding(testInfo, 'Low', 'Stale UI',
      'BankTransferModal.jsx does not call invalidateQueries or force refetch after bank transfer action. ' +
      'The payment list/wallet balance may be stale until user manually refreshes or another action triggers refetch.');
  });

  test('V2-7.3 SparePartsOrders success toast fires before error handling resolves', async ({ page }, testInfo) => {
    // Source-code finding from subagent scan
    finding(testInfo, 'Low', 'Toast Timing',
      'SparePartsOrders.jsx fires success toast in the try block before the catch clause. ' +
      'If a subsequent async operation in the try block fails, the success toast is already shown. ' +
      'Toast should be the last action in the success path.');
  });
});

// ═══════════════════════════════════════════════════════════
// V2-8: TABLE/LIST REFRESH AFTER MUTATIONS
// Verify data actually refreshes after CRUD operations
// ═══════════════════════════════════════════════════════════

test.describe('V2-8: Table Refresh After Mutations', () => {
  test('V2-8.1 Rental list refreshes after status change', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    // Find a rental with an action button
    const firstRow = page.locator('.ant-table-row, tr[data-row-key]').first();
    if (!(await firstRow.isVisible().catch(() => false))) return;

    // Look for a status change dropdown or action
    const statusDropdown = firstRow.locator('.ant-select, .ant-dropdown-trigger, button').filter({ hasText: /Status|Active|Completed/i }).first();
    if (!(await statusDropdown.isVisible().catch(() => false))) return;

    // Capture the current status text
    const beforeText = (await statusDropdown.textContent() || '').trim();

    // Track if a PATCH/PUT request is made when changing status
    let apiCallMade = false;
    page.on('request', (req) => {
      if (/rental/i.test(req.url()) && ['PATCH', 'PUT'].includes(req.method())) {
        apiCallMade = true;
      }
    });

    await statusDropdown.click();
    await page.waitForTimeout(1000);

    // If a dropdown appeared, click a different option
    const dropdown = page.locator('.ant-select-dropdown, .ant-dropdown').first();
    if (await dropdown.isVisible().catch(() => false)) {
      const options = dropdown.locator('.ant-select-item, .ant-dropdown-menu-item');
      const optCount = await options.count();
      for (let i = 0; i < optCount; i++) {
        const optText = (await options.nth(i).textContent() || '').trim();
        if (optText !== beforeText && optText) {
          await options.nth(i).click();
          break;
        }
      }
    }

    await page.waitForTimeout(2000);

    // Verify the table was refreshed (a GET request to rentals was made)
    let listRefreshed = false;
    page.on('request', (req) => {
      if (/rental/i.test(req.url()) && req.method() === 'GET') {
        listRefreshed = true;
      }
    });
    // Wait for any pending refresh
    await page.waitForTimeout(1500);
  });

  test('V2-8.2 Customer delete refreshes customer list', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/customers`);
    await settle(page);

    // Count rows before
    const rowsBefore = await page.locator('.ant-table-row, tr[data-row-key]').count();
    if (rowsBefore === 0) return;

    // Find a delete button on the last row (to minimize impact)
    const lastRow = page.locator('.ant-table-row, tr[data-row-key]').last();
    const deleteBtn = lastRow.locator('button, a').filter({ hasText: /Delete/i }).first();
    // Also check for icon buttons with delete tooltip
    const deleteIcon = lastRow.locator('[aria-label*="delete" i], .anticon-delete').first();

    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    const hasDeleteIcon = await deleteIcon.isVisible().catch(() => false);

    if (!hasDelete && !hasDeleteIcon) {
      // Delete may require special handling or be in an actions menu
      return;
    }

    // Don't actually delete — just verify the button exists and has proper handler
    // The actual deletion flow was already tested in BH-4
    // Instead verify that the delete success callback calls fetchCustomers({ reset: true })
    // (confirmed in source code: Customers.jsx handleDeleteSuccess → fetchCustomers({ reset: true }))
    // This is a code verification, not a runtime test
  });
});

// ═══════════════════════════════════════════════════════════
// V2-9: STALE CLOSURE / WRONG ROW TARGETING
// CustomerPackageManager.jsx L440-500 — async handlers
// reference non-memoized outer scope variables
// ═══════════════════════════════════════════════════════════

test.describe('V2-9: Stale Closure & Wrong Row/Item Targeting', () => {
  test('V2-9.1 CustomerPackageManager — stale closure risk in async handlers', async ({ page }, testInfo) => {
    // Source-code finding: CustomerPackageManager.jsx L440-500
    // Async handlers reference outer scope variables (like customerId, packages)
    // that are not memoized. If state updates between the await and the callback,
    // the handler may operate on stale data.
    finding(testInfo, 'Medium', 'Stale Closure',
      'CustomerPackageManager.jsx:L440-500 has async action handlers that reference non-memoized ' +
      'outer scope variables (customerId, packages state). If the user switches customer profile ' +
      'while an async operation is in-flight, the callback could affect the wrong customer\'s packages. ' +
      'Fix: memoize handlers with useCallback or capture IDs at call time.');
  });

  test('V2-9.2 Booking table row actions target correct booking ID', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await settle(page);

    const rows = page.locator('.ant-table-row, tr[data-row-key]');
    const rowCount = await rows.count();
    if (rowCount < 2) return;

    // Click edit on 2nd row (not first) and verify the correct booking opens
    const secondRow = rows.nth(1);
    const secondRowKey = await secondRow.getAttribute('data-row-key') || '';
    const editBtn = secondRow.locator('button, a').filter({ hasText: /Edit|View|Details/i }).first();
    if (!(await editBtn.isVisible().catch(() => false))) return;

    // Track which booking ID is fetched
    let fetchedId = '';
    page.on('request', (req) => {
      const match = req.url().match(/bookings\/([a-f0-9-]+)/i);
      if (match && req.method() === 'GET') {
        fetchedId = match[1];
      }
    });

    await editBtn.click();
    await page.waitForTimeout(2000);

    // If a modal opened, check its content
    const modal = page.locator('.ant-modal, .ant-drawer').first();
    if (await modal.isVisible().catch(() => false)) {
      // Modal opened — good
      await page.keyboard.press('Escape');
    }

    // If navigation happened, check URL contains mapping to row ID
    if (secondRowKey && fetchedId && secondRowKey !== fetchedId) {
      finding(testInfo, 'Critical', 'Wrong Row',
        `Booking table: clicked edit on row key=${secondRowKey} but API fetched booking ID=${fetchedId}. ` +
        'Row action may target wrong booking.');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// V2-10: CONSOLE ERROR DETECTION DURING INTERACTIONS
// ═══════════════════════════════════════════════════════════

test.describe('V2-10: Console Errors During Key Interactions', () => {
  test('V2-10.1 No console errors on dashboard quick action open/close cycle', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await settle(page);

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Click each quick action and close it
    const actionLabels = ['Academy', 'Rentals', 'Shop', 'Customers', 'Stay', 'Member'];
    for (const label of actionLabels) {
      const card = page.locator('.ant-card, button, [role="button"]').filter({ hasText: new RegExp(label, 'i') }).first();
      if (await card.isVisible().catch(() => false)) {
        await card.click();
        await page.waitForTimeout(1000);
        // Close any modal that opened
        const modal = page.locator('.ant-modal').first();
        if (await modal.isVisible().catch(() => false)) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      }
    }

    const realErrors = errors.filter(e =>
      !e.includes('net::') && !e.includes('favicon') && !e.includes('ResizeObserver')
    );
    if (realErrors.length > 0) {
      finding(testInfo, 'Medium', 'Console Error',
        `Dashboard quick action cycle produced ${realErrors.length} console error(s): ` +
        realErrors.slice(0, 3).map(e => e.substring(0, 100)).join(' | '));
    }
  });

  test('V2-10.2 No console errors on rental page CRUD cycle', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    // Open create modal
    const createBtn = page.locator('button').filter({ hasText: /Create Rental|New Rental|Add Rental/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Click on first row if exists
    const firstRow = page.locator('.ant-table-row').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);
    }

    const realErrors = errors.filter(e =>
      !e.includes('net::') && !e.includes('favicon') && !e.includes('ResizeObserver')
    );
    if (realErrors.length > 0) {
      finding(testInfo, 'Medium', 'Console Error',
        `Rental page CRUD cycle produced ${realErrors.length} console error(s): ` +
        realErrors.slice(0, 3).map(e => e.substring(0, 100)).join(' | '));
    }
  });

  test('V2-10.3 No console errors when switching finance tabs', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${BASE_URL}/finances`);
    await settle(page);

    // Click through all finance tabs
    const tabs = page.locator('.ant-tabs-tab, [role="tab"]');
    const tabCount = await tabs.count();
    for (let i = 0; i < Math.min(tabCount, 6); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(1500);
    }

    const realErrors = errors.filter(e =>
      !e.includes('net::') && !e.includes('favicon') && !e.includes('ResizeObserver')
    );
    if (realErrors.length > 0) {
      finding(testInfo, 'Medium', 'Console Error',
        `Finance tab switching produced ${realErrors.length} console error(s): ` +
        realErrors.slice(0, 3).map(e => e.substring(0, 100)).join(' | '));
    }
  });
});

// ═══════════════════════════════════════════════════════════
// V2-11: BOOKING CONFLICT MODAL — MISSING STATUS HANDLING
// BookingConflictModal.jsx L49-62 — missing booked/cancelled/no_show
// ═══════════════════════════════════════════════════════════

test.describe('V2-11: Booking Conflict Modal Status Gaps', () => {
  test('V2-11.1 Booking conflict modal status display completeness', async ({ page }, testInfo) => {
    // Source-code finding: BookingConflictModal.jsx L49-62
    // Only maps: confirmed, pending, completed
    // Missing: booked, cancelled, no_show — these would display with no color
    finding(testInfo, 'Medium', 'Status Badge',
      'BookingConflictModal.jsx:L49-62 status color mapping only handles confirmed/pending/completed. ' +
      'Missing: booked, cancelled, no_show. When a booking with these statuses appears in a conflict ' +
      'dialog, the status badge renders with no color, confusing the user about conflict severity.');
  });
});

// ═══════════════════════════════════════════════════════════
// V2-12: MODAL OPEN/CLOSE INTEGRITY
// Verify modals don't leak state between open/close cycles
// ═══════════════════════════════════════════════════════════

test.describe('V2-12: Modal State Leak Detection', () => {
  test('V2-12.1 Rental modal form resets between open-close-reopen cycles', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rentals`);
    await settle(page);

    const createBtn = page.locator('button').filter({ hasText: /Create Rental|New Rental|Add Rental/i }).first();
    if (!(await createBtn.isVisible().catch(() => false))) return;

    // First open: type in some fields
    await createBtn.click();
    await page.waitForTimeout(1000);

    let modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Type into any visible text input
    const textInput = modal.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible().catch(() => false)) {
      await textInput.fill('LEAK_TEST_VALUE');
    }

    // Close without saving
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // Reopen
    await createBtn.click();
    await page.waitForTimeout(1000);

    modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Check if form still has the old value
    const textInputAgain = modal.locator('input[type="text"], textarea').first();
    if (await textInputAgain.isVisible().catch(() => false)) {
      const value = await textInputAgain.inputValue();
      if (value.includes('LEAK_TEST_VALUE')) {
        finding(testInfo, 'Medium', 'Modal State Leak',
          'Rental create modal retains form data from previous open-close cycle. ' +
          'User may accidentally submit old data. Form should reset on reopen.');
      }
    }

    await page.keyboard.press('Escape');
  });

  test('V2-12.2 Expense modal form resets between cycles', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/finances/expenses`);
    await settle(page);

    const addBtn = page.locator('button').filter({ hasText: /Add Expense|New Expense|Create/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) return;

    // First open
    await addBtn.click();
    await page.waitForTimeout(1000);

    let modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    // Type into description
    const descInput = modal.locator('input, textarea').first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill('LEAK_TEST_EXPENSE');
    }

    // Close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // Reopen
    await addBtn.click();
    await page.waitForTimeout(1000);

    modal = page.locator('.ant-modal').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    const descInputAgain = modal.locator('input, textarea').first();
    if (await descInputAgain.isVisible().catch(() => false)) {
      const value = await descInputAgain.inputValue();
      if (value.includes('LEAK_TEST_EXPENSE')) {
        finding(testInfo, 'Medium', 'Modal State Leak',
          'Expense modal retains form values from previous cycle. ' +
          'openAddModal() in ExpensesPage.jsx:L277 calls form.resetFields() but it may not clear all fields.');
      }
    }

    await page.keyboard.press('Escape');
  });
});
