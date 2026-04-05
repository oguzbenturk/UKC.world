/**
 * FRONTEND QA AUDIT — Admin Component Interaction & CRUD
 * 
 * Tests admin panel interactive components: tables, modals, forms,
 * filters, tabs, dropdowns, status changes, and state updates.
 */
import { test, expect, Page } from '@playwright/test';
import { BASE_URL, loginAsAdmin, waitForLoading } from '../helpers';

function finding(testInfo: any, severity: string, category: string, desc: string) {
  testInfo.annotations.push({ type: 'finding', description: `[${severity}][${category}] ${desc}` });
}

async function safeClick(page: Page, locator: any, timeout = 5000) {
  try {
    await locator.click({ timeout });
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 7 — BOOKINGS PAGE COMPONENTS
// ═══════════════════════════════════════════════════════════
test.describe('7. Bookings Page — Tables & Interaction', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('7.1 Bookings table renders with data', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for table or card list
    const hasTable = await page.locator('.ant-table, table, [class*="booking-list"], [class*="card"]').first().isVisible().catch(() => false);
    if (!hasTable) {
      finding(test.info(), 'High', 'rendering', 'Bookings page has no visible table or list');
    }
    await page.screenshot({ path: 'test-results/screenshots/7.1-bookings-table.png' });
  });

  test('7.2 Bookings table has action column or buttons', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Look for action buttons, edit icons, or action columns
    const hasActions = await page.locator('.ant-table-cell button, .ant-btn, [class*="action"]').first().isVisible().catch(() => false);
    const hasTableRows = await page.locator('.ant-table-row, tr[data-row-key]').first().isVisible().catch(() => false);
    
    if (hasTableRows && !hasActions) {
      finding(test.info(), 'Medium', 'UX', 'Bookings table rows have no visible action buttons');
    }
  });

  test('7.3 Bookings filter/search functionality', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Look for search input or filter controls
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="ara" i], .ant-input-search input').first();
    const hasSearch = await searchInput.isVisible().catch(() => false);
    
    const filterBtn = page.locator('button:has-text("Filter"), button:has-text("Filtre"), .ant-btn:has(.ant-btn-icon)').first();
    const hasFilter = await filterBtn.isVisible().catch(() => false);
    
    // Look for tabs or date filters
    const hasTabs = await page.locator('.ant-tabs, .ant-radio-group, .ant-segmented').first().isVisible().catch(() => false);
    const hasDatePicker = await page.locator('.ant-picker, [class*="date"]').first().isVisible().catch(() => false);
    
    if (!hasSearch && !hasFilter && !hasTabs && !hasDatePicker) {
      finding(test.info(), 'Medium', 'UX', 'Bookings page has no visible search, filter, or tab controls');
    }
    
    // If there's a search, test it
    if (hasSearch) {
      await searchInput.fill('test');
      await page.waitForTimeout(1500);
      await searchInput.clear();
      await page.waitForTimeout(1000);
    }
    
    await page.screenshot({ path: 'test-results/screenshots/7.3-bookings-filters.png' });
  });

  test('7.4 Bookings page has create booking button', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), button:has-text("Oluştur"), button:has-text("Yeni"), a:has-text("Create"), a:has-text("New")').first();
    const hasCreate = await createBtn.isVisible().catch(() => false);
    if (!hasCreate) {
      finding(test.info(), 'Medium', 'UX', 'Bookings page has no visible create/add button');
    }
  });

  test('7.5 Booking create modal/form opens', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Try clicking create button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), a:has-text("Create Booking"), a:has-text("New Booking")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);

      // Check if modal or form opened
      const hasModal = await page.locator('.ant-modal, .ant-drawer, [class*="modal"], [class*="drawer"]').first().isVisible().catch(() => false);
      const hasForm = await page.locator('form, .ant-form').first().isVisible().catch(() => false);
      const navigatedToForm = page.url().includes('/edit') || page.url().includes('/new') || page.url().includes('/create');

      if (!hasModal && !hasForm && !navigatedToForm) {
        finding(test.info(), 'High', 'modal', 'Create booking button clicked but no form/modal appeared');
      }
      
      // Close modal if open
      const closeBtn = page.locator('.ant-modal-close, .ant-drawer-close').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/7.5-booking-create.png' });
  });

  test('7.6 Booking calendar view works', async () => {
    await page.goto(`${BASE_URL}/bookings/calendar`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasCalendar = await page.locator('.fc, [class*="calendar"], .ant-picker-calendar, [class*="fullcalendar"]').first().isVisible().catch(() => false);
    if (!hasCalendar) {
      finding(test.info(), 'High', 'rendering', 'Booking calendar view does not render a calendar component');
    }
    await page.screenshot({ path: 'test-results/screenshots/7.6-booking-calendar.png' });
  });

  test('7.7 Booking status pills/badges render correctly', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for status badges/pills
    const statusBadges = page.locator('.ant-tag, .ant-badge, [class*="status"], [class*="badge"]');
    const badgeCount = await statusBadges.count();
    if (badgeCount > 0) {
      // Verify badges have text content
      const firstBadge = statusBadges.first();
      const text = await firstBadge.textContent();
      if (!text || text.trim().length === 0) {
        finding(test.info(), 'Low', 'rendering', 'Booking status badges are empty (no text)');
      }
    }
  });

  test('7.8 Bookings pagination or load more works', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const pagination = page.locator('.ant-pagination, [class*="pagination"]').first();
    const hasPagination = await pagination.isVisible().catch(() => false);
    
    if (hasPagination) {
      // Click next page if available
      const nextBtn = page.locator('.ant-pagination-next:not(.ant-pagination-disabled)').first();
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(1500);
        // Should still show table
        const hasTable = await page.locator('.ant-table, table').first().isVisible().catch(() => false);
        if (!hasTable) {
          finding(test.info(), 'High', 'table/list', 'Bookings table disappears after pagination');
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 8 — CUSTOMERS PAGE INTERACTION
// ═══════════════════════════════════════════════════════════
test.describe('8. Customers Page — Tables & Search', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('8.1 Customers table renders', async () => {
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const hasTable = await page.locator('.ant-table, table, [class*="user-list"], [class*="customer"]').first().isVisible().catch(() => false);
    if (!hasTable) {
      finding(test.info(), 'High', 'rendering', 'Customers page has no visible table/list');
    }
    await page.screenshot({ path: 'test-results/screenshots/8.1-customers.png' });
  });

  test('8.2 Customer search works', async () => {
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="ara" i], .ant-input-search input').first();
    if (await searchInput.isVisible().catch(() => false)) {
      // Get initial row count
      const initialRows = await page.locator('.ant-table-row, tr[data-row-key]').count();
      
      await searchInput.fill('admin');
      await page.waitForTimeout(2000);
      
      const filteredRows = await page.locator('.ant-table-row, tr[data-row-key]').count();
      // Search should filter results (may become fewer rows)
      
      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(1500);
      
      const clearedRows = await page.locator('.ant-table-row, tr[data-row-key]').count();
      if (clearedRows === 0 && initialRows > 0) {
        finding(test.info(), 'High', 'stale state', 'Clearing customer search results in empty table');
      }
    } else {
      finding(test.info(), 'Medium', 'UX', 'Customer page has no search input');
    }
  });

  test('8.3 Customer detail page opens', async () => {
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Click on first customer row or link
    const firstRow = page.locator('.ant-table-row, tr[data-row-key]').first();
    if (await firstRow.isVisible().catch(() => false)) {
      // Try clicking the row or a link within it
      const link = firstRow.locator('a').first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
      } else {
        await firstRow.click();
      }
      await page.waitForTimeout(2000);
      
      // Should navigate to detail or open modal
      const detailOpened = page.url().includes('/customers/') || 
                           await page.locator('.ant-modal, .ant-drawer').isVisible().catch(() => false);
      if (!detailOpened) {
        finding(test.info(), 'Medium', 'navigation', 'Clicking customer row does nothing');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/8.3-customer-detail.png' });
  });

  test('8.4 Create customer button and form', async () => {
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), a:has-text("Create"), a:has-text("New Customer")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      // Should open form or navigate
      const hasForm = await page.locator('form, .ant-form, .ant-modal form').first().isVisible().catch(() => false);
      const navigated = page.url().includes('/new') || page.url().includes('/create');
      
      if (!hasForm && !navigated) {
        finding(test.info(), 'High', 'modal', 'Create customer button clicked but no form appeared');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/8.4-create-customer.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 9 — EQUIPMENT PAGE INTERACTION
// ═══════════════════════════════════════════════════════════
test.describe('9. Equipment Page — CRUD & Modals', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('9.1 Equipment page loads with data', async () => {
    await page.goto(`${BASE_URL}/equipment`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const hasContent = await page.locator('.ant-table, .ant-card, [class*="equipment"], table').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'High', 'rendering', 'Equipment page has no visible content');
    }
    await page.screenshot({ path: 'test-results/screenshots/9.1-equipment.png' });
  });

  test('9.2 Equipment create modal', async () => {
    await page.goto(`${BASE_URL}/equipment`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const addBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New"), button:has-text("Ekle")').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(2000);
      
      const hasModal = await page.locator('.ant-modal, .ant-drawer').first().isVisible().catch(() => false);
      if (hasModal) {
        // Check form fields exist
        const inputs = await page.locator('.ant-modal input, .ant-modal .ant-select, .ant-drawer input').count();
        if (inputs < 1) {
          finding(test.info(), 'Medium', 'form', 'Equipment create modal has no form inputs');
        }
        
        // Test closing modal with X
        const closeBtn = page.locator('.ant-modal-close, .ant-drawer-close').first();
        await closeBtn.click();
        await page.waitForTimeout(500);
        const modalGone = !(await page.locator('.ant-modal:visible, .ant-drawer:visible').isVisible().catch(() => false));
        if (!modalGone) {
          finding(test.info(), 'Medium', 'modal', 'Equipment modal does not close with X button');
        }
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/9.2-equipment-modal.png' });
  });

  test('9.3 Equipment filter/tabs interaction', async () => {
    await page.goto(`${BASE_URL}/equipment`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for tabs or filter options
    const tabs = page.locator('.ant-tabs-tab, .ant-segmented-item, .ant-radio-button-wrapper');
    const tabCount = await tabs.count();
    
    if (tabCount > 1) {
      // Click second tab
      await tabs.nth(1).click();
      await page.waitForTimeout(1500);
      // Content should update
      const hasContent = await page.locator('.ant-table, .ant-card, [class*="equipment"]').first().isVisible().catch(() => false);
      if (!hasContent) {
        finding(test.info(), 'Medium', 'stale state', 'Equipment tab switch results in no content');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 10 — RENTALS PAGE INTERACTION
// ═══════════════════════════════════════════════════════════
test.describe('10. Rentals Page — Components', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('10.1 Rentals page loads', async () => {
    await page.goto(`${BASE_URL}/rentals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const hasContent = await page.locator('.ant-table, .ant-card, table, [class*="rental"]').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'High', 'rendering', 'Rentals page has no visible content');
    }
    await page.screenshot({ path: 'test-results/screenshots/10.1-rentals.png' });
  });

  test('10.2 Rentals create flow', async () => {
    await page.goto(`${BASE_URL}/rentals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), button:has-text("Rent")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      const hasForm = await page.locator('.ant-modal, .ant-drawer, form, .ant-form').first().isVisible().catch(() => false);
      if (!hasForm) {
        finding(test.info(), 'High', 'modal', 'Rental create button does nothing');
      } else {
        // Close
        const closeBtn = page.locator('.ant-modal-close, .ant-drawer-close').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
        }
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/10.2-rental-create.png' });
  });

  test('10.3 Rentals calendar view', async () => {
    await page.goto(`${BASE_URL}/rentals/calendar`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await expect(page.locator('body')).not.toBeEmpty();
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Rentals calendar view shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/10.3-rental-calendar.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 11 — FINANCE PAGES INTERACTION
// ═══════════════════════════════════════════════════════════
test.describe('11. Finance Pages — Dashboards & Tables', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('11.1 Finance main page loads with widgets', async () => {
    await page.goto(`${BASE_URL}/finance`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasWidgets = await page.locator('.ant-card, [class*="stat"], [class*="widget"], [class*="revenue"]').first().isVisible().catch(() => false);
    if (!hasWidgets) {
      finding(test.info(), 'Medium', 'rendering', 'Finance page has no visible widgets/cards');
    }
    await page.screenshot({ path: 'test-results/screenshots/11.1-finance.png' });
  });

  test('11.2 Finance date picker interaction', async () => {
    await page.goto(`${BASE_URL}/finance`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const datePicker = page.locator('.ant-picker, .ant-picker-range').first();
    if (await datePicker.isVisible().catch(() => false)) {
      await datePicker.click();
      await page.waitForTimeout(1000);
      
      // Calendar popup should appear
      const popover = page.locator('.ant-picker-dropdown, .ant-picker-panel').first();
      const hasPopover = await popover.isVisible().catch(() => false);
      if (!hasPopover) {
        finding(test.info(), 'Medium', 'modal', 'Finance date picker click does not open calendar');
      }
      
      // Close by pressing Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('11.3 Finance tabs/navigation between sub-pages', async () => {
    await page.goto(`${BASE_URL}/finance`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for tab-like navigation
    const tabs = page.locator('.ant-tabs-tab, .ant-menu-item, a[href*="/finance/"]');
    const tabCount = await tabs.count();
    
    if (tabCount > 0) {
      // Click first finance sub-tab
      await tabs.first().click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: 'test-results/screenshots/11.3-finance-tabs.png' });
  });

  test('11.4 Finance lessons sub-page', async () => {
    await page.goto(`${BASE_URL}/finance/lessons`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const hasContent = await page.locator('.ant-table, .ant-card, table').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'Medium', 'rendering', 'Finance lessons page has no table/content');
    }
  });

  test('11.5 Finance daily operations', async () => {
    await page.goto(`${BASE_URL}/finance/daily-operations`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const hasContent = await page.locator('.ant-table, .ant-card, table, [class*="payment"]').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'Medium', 'rendering', 'Finance daily operations has no visible content');
    }
    await page.screenshot({ path: 'test-results/screenshots/11.5-daily-ops.png' });
  });

  test('11.6 Finance refunds page', async () => {
    await page.goto(`${BASE_URL}/finance/refunds`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('body')).not.toBeEmpty();
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Finance refunds page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/11.6-refunds.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 12 — SHOP MANAGEMENT PAGES  
// ═══════════════════════════════════════════════════════════
test.describe('12. Shop Management — Admin', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('12.1 Shop management page loads', async () => {
    await page.goto(`${BASE_URL}/services/shop`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const hasContent = await page.locator('.ant-table, .ant-card, table, [class*="product"]').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'High', 'rendering', 'Shop management page has no visible content');
    }
    await page.screenshot({ path: 'test-results/screenshots/12.1-shop-mgmt.png' });
  });

  test('12.2 Shop orders page', async () => {
    await page.goto(`${BASE_URL}/calendars/shop-orders`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('body')).not.toBeEmpty();
    await page.screenshot({ path: 'test-results/screenshots/12.2-shop-orders.png' });
  });

  test('12.3 Create product modal', async () => {
    await page.goto(`${BASE_URL}/services/shop`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const addBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(2000);
      
      const hasModal = await page.locator('.ant-modal, .ant-drawer').first().isVisible().catch(() => false);
      if (hasModal) {
        await page.screenshot({ path: 'test-results/screenshots/12.3-product-modal.png' });
        // Close
        const closeBtn = page.locator('.ant-modal-close, .ant-drawer-close').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
        }
      } else {
        finding(test.info(), 'Medium', 'modal', 'Add product button did not open a modal/drawer');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 13 — VOUCHERS, WAIVERS, ROLES ADMIN
// ═══════════════════════════════════════════════════════════
test.describe('13. Admin Settings & Management', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('13.1 Voucher management loads', async () => {
    await page.goto(`${BASE_URL}/admin/vouchers`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.1-vouchers.png' });
    const hasTable = await page.locator('.ant-table, table, .ant-card').first().isVisible().catch(() => false);
    if (!hasTable) {
      finding(test.info(), 'Medium', 'rendering', 'Voucher page has no visible voucher list');
    }
  });

  test('13.2 Support tickets page loads', async () => {
    await page.goto(`${BASE_URL}/admin/support-tickets`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.2-support-tickets.png' });
  });

  test('13.3 Roles admin page loads', async () => {
    await page.goto(`${BASE_URL}/admin/roles`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.3-roles.png' });
    const hasContent = await page.locator('.ant-table, .ant-card, table, [class*="role"]').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'Medium', 'rendering', 'Roles page has no visible content');
    }
  });

  test('13.4 Settings page loads', async () => {
    await page.goto(`${BASE_URL}/admin/settings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.4-settings.png' });
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Settings page shows error');
    }
  });

  test('13.5 Waiver management page', async () => {
    await page.goto(`${BASE_URL}/admin/waivers`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.5-waivers.png' });
  });

  test('13.6 Instructor ratings analytics page', async () => {
    await page.goto(`${BASE_URL}/admin/ratings-analytics`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.6-ratings.png' });
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Medium', 'navigation', 'Ratings analytics page shows error');
    }
  });

  test('13.7 Marketing page', async () => {
    await page.goto(`${BASE_URL}/marketing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.7-marketing.png' });
  });

  test('13.8 Quick links page', async () => {
    await page.goto(`${BASE_URL}/quick-links`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.8-quicklinks.png' });
  });

  test('13.9 Forms builder page', async () => {
    await page.goto(`${BASE_URL}/forms`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/screenshots/13.9-forms.png' });
  });
});
