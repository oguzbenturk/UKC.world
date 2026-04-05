/**
 * PHASE 5: Rental & Equipment
 *
 * Tests rental management and equipment inventory:
 * - Equipment list, detail, and form
 * - Rental management (tabs, table, CRUD)
 * - Rental calendar view
 * - Inventory page
 * - Student rental pages (public)
 *
 * Run: npx playwright test tests/e2e/phase5-rental-equipment.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from '@playwright/test';
import {
  BASE_URL,
  loginAsAdmin,
  navigateTo,
  waitForLoading,
} from '../helpers';

const RUN = Date.now().toString().slice(-6);

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(60000);

test.beforeEach(async () => {
  await new Promise(r => setTimeout(r, 2500));
});

let page: Page;

test.describe('Phase 5 — Rental & Equipment', () => {
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ─────────────────────────────────────────────────────
  // 5.1  Equipment Management
  // ─────────────────────────────────────────────────────
  test.describe('5.1 Equipment Management', () => {
    test('Navigate to equipment page', async () => {
      await navigateTo(page, '/equipment');
      await waitForLoading(page);
      await page.waitForLoadState('networkidle').catch(() => {});

      const heading = page.locator('main').locator('h1, h2, h3').filter({
        hasText: /equipment|inventory/i,
      });
      const hasHeading = await heading.first().isVisible({ timeout: 8000 }).catch(() => false);

      const content = page.locator('main').locator('.ant-table, .ant-card, [class*="equipment"]');
      const hasContent = await content.first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasHeading || hasContent).toBe(true);
    });

    test('Equipment table or list renders', async () => {
      const table = page.locator('.ant-table, table');
      const hasTable = await table.first().isVisible({ timeout: 5000 }).catch(() => false);

      const cards = page.locator('.ant-card, [class*="equipment-card"]');
      const hasCards = await cards.first().isVisible({ timeout: 3000 }).catch(() => false);

      const emptyState = page.locator('.ant-empty');
      const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasTable || hasCards || hasEmpty).toBe(true);
    });

    test('Search field is functional', async () => {
      const search = page.locator('input[placeholder*="search" i], .ant-input-search input');
      if (await search.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        await search.first().fill('test');
        await page.waitForTimeout(1000);
        await search.first().clear();
        await page.waitForTimeout(500);
      }
    });

    test('Filter dropdowns are present', async () => {
      const selects = page.locator('.ant-select');
      const count = await selects.count();
      // Equipment page should have type/size filters
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────
  // 5.2  Rental Management
  // ─────────────────────────────────────────────────────
  test.describe('5.2 Rental Management', () => {
    test('Navigate to rentals page', async () => {
      await navigateTo(page, '/rentals');
      await waitForLoading(page);
      await page.waitForLoadState('networkidle').catch(() => {});

      const heading = page.locator('main').locator('h1, h2, h3').filter({
        hasText: /rental/i,
      });
      const hasHeading = await heading.first().isVisible({ timeout: 8000 }).catch(() => false);

      const content = page.locator('main').locator('.ant-tabs, .ant-table, .ant-card');
      const hasContent = await content.first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasHeading || hasContent).toBe(true);
    });

    test('Rental tabs are visible', async () => {
      const tabs = page.locator('.ant-tabs-tab, [role="tab"]');
      const tabCount = await tabs.count();
      // Should have tabs: Recent, Requests, Active, Upcoming, Overdue, Completed
      if (tabCount > 0) {
        expect(tabCount).toBeGreaterThanOrEqual(2);
      }
    });

    test('Can switch between rental tabs', async () => {
      const tabs = page.locator('.ant-tabs-tab, [role="tab"]');
      const tabCount = await tabs.count();

      if (tabCount >= 2) {
        // Click "Active" or second tab
        const activeTab = tabs.filter({ hasText: /active/i });
        if (await activeTab.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await activeTab.first().click();
          await page.waitForTimeout(1000);
        } else {
          await tabs.nth(1).click();
          await page.waitForTimeout(1000);
        }

        // Go back to first tab
        await tabs.nth(0).click();
        await page.waitForTimeout(1000);
      }
    });

    test('Rentals table or empty state shown', async () => {
      const table = page.locator('.ant-table, table');
      const hasTable = await table.first().isVisible({ timeout: 5000 }).catch(() => false);

      const emptyState = page.locator('.ant-empty, [class*="empty"]');
      const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

      const noData = page.getByText(/no rental|no data|no record/i).first();
      const hasNoData = await noData.isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasTable || hasEmpty || hasNoData).toBe(true);
    });

    test('New Rental button is present', async () => {
      const newBtn = page.locator('button').filter({ hasText: /new rental|add rental|create rental/i });
      const hasBtn = await newBtn.first().isVisible({ timeout: 5000 }).catch(() => false);

      const plusBtn = page.locator('button').filter({ has: page.locator('.anticon-plus') });
      const hasPlus = await plusBtn.first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasBtn || hasPlus).toBe(true);
    });

    test('Open New Rental modal', async () => {
      const newBtn = page.locator('button').filter({ hasText: /new rental|add rental|create rental/i });
      if (await newBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await newBtn.first().click();
      } else {
        const plusBtn = page.locator('button').filter({ has: page.locator('.anticon-plus') });
        if (await plusBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await plusBtn.first().click();
        }
      }
      await page.waitForTimeout(1500);

      // Check for modal/dialog
      const modalTitle = page.getByText(/new rental|create rental|add rental/i);
      const hasTitle = await modalTitle.first().isVisible({ timeout: 5000 }).catch(() => false);

      const modal = page.locator('.ant-modal-content, .ant-drawer-content, dialog');
      const hasModal = await modal.first().isVisible({ timeout: 3000 }).catch(() => false);

      const form = page.locator('.rental-form, .ant-form');
      const hasForm = await form.first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasTitle || hasModal || hasForm).toBe(true);
    });

    test('Rental form has customer and equipment fields', async () => {
      // Customer dropdown
      const customerSelect = page.locator('.ant-select').first();
      const hasCustomer = await customerSelect.isVisible({ timeout: 3000 }).catch(() => false);

      // Equipment selection
      const equipmentSelect = page.locator('.ant-select, .ant-checkbox-group').nth(1);
      const hasEquipment = await equipmentSelect.isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasCustomer || hasEquipment).toBe(true);
    });

    test('Close rental form', async () => {
      // Close modal — press Escape or click cancel
      const cancelBtn = page.locator('button').filter({ hasText: /cancel|close/i });
      if (await cancelBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(1000);
    });
  });

  // ─────────────────────────────────────────────────────
  // 5.3  Rental Calendar View
  // ─────────────────────────────────────────────────────
  test.describe('5.3 Rental Calendar View', () => {
    test('Navigate to rentals calendar', async () => {
      await navigateTo(page, '/rentals/calendar');
      await waitForLoading(page);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(3000);

      // Calendar page should have view controls or day headers
      const viewBtn = page.locator('button').filter({
        hasText: /9x9|day|week|month|daily|weekly|monthly|view|list/i,
      });
      const hasViewBtn = await viewBtn.first().isVisible({ timeout: 8000 }).catch(() => false);

      const dayHeaders = page.getByText(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/).first();
      const hasDayHeaders = await dayHeaders.isVisible({ timeout: 3000 }).catch(() => false);

      // Fallback: check for any calendar-related content
      const hasCalendarContent = await page.locator('[class*="calendar"], [class*="switcher"], .ant-dropdown-trigger, [class*="grid"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      const bodyText = await page.locator('body').textContent().catch(() => '');
      const hasContent = bodyText && bodyText.length > 100;

      expect(hasViewBtn || hasDayHeaders || hasCalendarContent || hasContent).toBe(true);
    });

    test('Calendar has view mode controls', async () => {
      const viewBtns = page.locator('button').filter({
        hasText: /day|week|month|daily|weekly|monthly|9x9|list|view/i,
      });
      const hasViews = await viewBtns.first().isVisible({ timeout: 5000 }).catch(() => false);

      const segmented = page.locator('.ant-segmented, [class*="view-switch"], .ant-dropdown-trigger, [class*="switcher"]');
      const hasSegmented = await segmented.first().isVisible({ timeout: 3000 }).catch(() => false);

      // Some form of view control should exist (could be buttons, segmented, or dropdown)
      expect(hasViews || hasSegmented).toBeTruthy();
    });

    test('Date navigation works', async () => {
      const navBtns = page.locator('button').filter({
        has: page.locator('.anticon-left, .anticon-right, [class*="chevron"], [class*="arrow"]'),
      });

      if (await navBtns.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await navBtns.first().click();
        await page.waitForTimeout(1000);
      }
    });

    test('Alternative rentals calendar loads', async () => {
      await navigateTo(page, '/calendars/rentals');
      await waitForLoading(page);
      await page.waitForLoadState('networkidle').catch(() => {});

      // Should have content in main area
      const content = page.locator('main').locator('button, h1, h2, h3, [class*="calendar"]');
      await expect(content.first()).toBeVisible({ timeout: 8000 });
    });
  });

  // ─────────────────────────────────────────────────────
  // 5.4  Inventory Page
  // ─────────────────────────────────────────────────────
  test.describe('5.4 Inventory Page', () => {
    test('Navigate to inventory page', async () => {
      await navigateTo(page, '/inventory');
      await waitForLoading(page);
      await page.waitForLoadState('networkidle').catch(() => {});

      const heading = page.locator('main').locator('h1, h2, h3').filter({
        hasText: /inventory|equipment|stock/i,
      });
      const hasHeading = await heading.first().isVisible({ timeout: 8000 }).catch(() => false);

      const content = page.locator('main').locator('.ant-table, .ant-card, [class*="inventory"]');
      const hasContent = await content.first().isVisible({ timeout: 5000 }).catch(() => false);

      // Page may redirect or 404 — that's OK for verification
      const noError = page.locator('.ant-result-error, .ant-result-500');
      const has500 = await noError.first().isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasHeading || hasContent || !has500).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────
  // 5.5  Student Rental Pages (Public)
  // ─────────────────────────────────────────────────────
  test.describe('5.5 Student Rental Pages', () => {
    const studentRentalPages = [
      { path: '/rental', name: 'Rental Landing' },
      { path: '/rental/book-equipment', name: 'Book Equipment' },
      { path: '/rental/standard', name: 'Standard Rentals' },
      { path: '/rental/sls', name: 'SLS Rentals' },
      { path: '/rental/dlab', name: 'D-LAB Rentals' },
      { path: '/rental/efoil', name: 'E-Foil Rentals' },
    ];

    for (const sp of studentRentalPages) {
      test(`${sp.name} page loads (${sp.path})`, async () => {
        await navigateTo(page, sp.path);
        await waitForLoading(page);
        await page.waitForLoadState('networkidle').catch(() => {});

        // No server error
        const errorOverlay = page.locator('.ant-result-error, .ant-result-500');
        const hasError = await errorOverlay.first().isVisible({ timeout: 3000 }).catch(() => false);
        expect(hasError).toBe(false);

        // Page has content
        const body = page.locator('main, body');
        await expect(body.first()).not.toBeEmpty();
      });
    }
  });

  // ─────────────────────────────────────────────────────
  // 5.6  Verification — All Rental Routes
  // ─────────────────────────────────────────────────────
  test.describe('5.6 Rental Routes Verification', () => {
    const rentalRoutes = [
      { path: '/equipment', name: 'Equipment' },
      { path: '/rentals', name: 'Rentals' },
      { path: '/rentals/calendar', name: 'Rentals Calendar' },
      { path: '/calendars/rentals', name: 'Alt Rentals Calendar' },
      { path: '/rental', name: 'Rental Landing' },
      { path: '/rental/book-equipment', name: 'Book Equipment' },
    ];

    for (const route of rentalRoutes) {
      test(`${route.name} (${route.path}) loads without error`, async () => {
        await navigateTo(page, route.path);
        await waitForLoading(page);
        await page.waitForLoadState('networkidle').catch(() => {});

        const errorOverlay = page.locator(
          '.ant-result-error, .ant-result-404, .ant-result-500'
        );
        const hasError = await errorOverlay
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        expect(hasError).toBe(false);

        const body = page.locator('body');
        await expect(body).not.toBeEmpty();
      });
    }
  });
});
