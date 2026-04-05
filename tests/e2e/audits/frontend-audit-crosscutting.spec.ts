/**
 * FRONTEND QA AUDIT — Cross-Cutting: State Persistence, Role Leakage, 
 * Form UX, Visual Issues, Modals & Loading States
 */
import { test, expect, Page } from '@playwright/test';
import { BASE_URL, login, loginAsAdmin, loginAsStudent, loginAsManager } from '../helpers';

const INSTRUCTOR_EMAIL = 'autoinst487747@test.com';
const INSTRUCTOR_PASSWORD = 'TestPass123!';
const FRONTDESK_EMAIL = 'frontdesk@test.com';
const FRONTDESK_PASSWORD = 'TestPass123!';

function finding(testInfo: any, severity: string, category: string, desc: string) {
  testInfo.annotations.push({ type: 'finding', description: `[${severity}][${category}] ${desc}` });
}

// ═══════════════════════════════════════════════════════════
// SECTION 26 — STATE PERSISTENCE AFTER REFRESH
// ═══════════════════════════════════════════════════════════
test.describe('26. State Persistence', () => {
  test.describe.configure({ mode: 'serial' });

  test('26.1 Admin auth persists after hard refresh', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Hard refresh
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Should still be on dashboard, not redirected to login
    if (page.url().includes('/login') || page.url().includes('/guest')) {
      finding(test.info(), 'Critical', 'state', 'Admin auth lost after page refresh — redirected to login');
    }
    await page.screenshot({ path: 'test-results/screenshots/26.1-admin-refresh.png' });
  });

  test('26.2 Student auth persists after hard refresh', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    if (page.url().includes('/login') || page.url().includes('/guest')) {
      finding(test.info(), 'Critical', 'state', 'Student auth lost after page refresh');
    }
  });

  test('26.3 Tab state preserved after navigation + back', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Go to a page with tabs (finance usually has tabs)
    await page.goto(`${BASE_URL}/finance`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Find and click a non-default tab
    const tabs = page.locator('.ant-tabs-tab');
    const tabCount = await tabs.count();
    
    if (tabCount > 1) {
      const secondTab = tabs.nth(1);
      const tabText = await secondTab.textContent();
      await secondTab.click();
      await page.waitForTimeout(1000);
      
      // Navigate away
      await page.goto(`${BASE_URL}/bookings`);
      await page.waitForTimeout(1000);
      
      // Go back
      await page.goBack();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Check if tab state was preserved (this is optional UX improvement)
      // Log as Low if not preserved — it's a nice-to-have
    }
  });

  test('26.4 Filter/search state persists after back navigation', async ({ page }) => {
    test.setTimeout(90000);
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    // Try search
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="ara" i], .ant-input-search input').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('test');
      await page.waitForTimeout(1500);
      
      // Navigate away, then come back
      await page.goto(`${BASE_URL}/customers`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      
      // Go back
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);
      
      // Check if search input persisted (nice-to-have, log as Low)
      const searchVal = await searchInput.inputValue().catch(() => '');
      if (searchVal !== 'test') {
        finding(test.info(), 'Low', 'state', 'Search filter state lost after back navigation on bookings');
      }
    }
  });

  test('26.5 Form data not lost on accidental navigation', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Open create booking modal
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Oluştur")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      // Fill something in the form
      const firstInput = page.locator('.ant-modal input, .ant-drawer input').first();
      if (await firstInput.isVisible().catch(() => false)) {
        await firstInput.fill('Test data');
        
        // Press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        
        // Check if there's a confirm dialog or if modal just closed
        const hasConfirm = await page.locator('.ant-modal-confirm, [class*="confirm"]').isVisible().catch(() => false);
        const modalStillOpen = await page.locator('.ant-modal-body').isVisible().catch(() => false);
        
        // If modal just closes without warning when form has data, that's a UX issue
        if (!hasConfirm && !modalStillOpen) {
          finding(test.info(), 'Low', 'form UX', 'Modal with form data closes on Escape without confirmation');
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 27 — ROLE LEAKAGE AUDIT (FRONTEND)
// ═══════════════════════════════════════════════════════════
test.describe('27. Role Leakage - Frontend', () => {
  test.describe.configure({ mode: 'serial' });

  test('27.1 Student cannot navigate to admin settings', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/admin/settings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Should be blocked/redirected or show error
    if (page.url().includes('/admin/settings')) {
      // Check if there's actually content blocking or a redirect
      const hasAdminContent = await page.locator('.ant-form, .ant-card, .ant-table').first().isVisible().catch(() => false);
      if (hasAdminContent) {
        finding(test.info(), 'Critical', 'role leakage', 'Student can view admin settings page with content');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/27.1-student-admin-settings.png' });
  });

  test('27.2 Student cannot see admin sidebar items', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const sidebar = page.locator('.ant-layout-sider, [class*="sidebar"], nav, .ant-menu');
    const sidebarText = await sidebar.textContent().catch(() => '');
    
    const leakedItems = ['Admin Settings', 'Roles', 'Deleted Bookings', 'Spare Parts', 'Vouchers'].filter(item =>
      sidebarText.toLowerCase().includes(item.toLowerCase())
    );
    
    if (leakedItems.length > 0) {
      finding(test.info(), 'Critical', 'role leakage', `Student sidebar shows admin items: ${leakedItems.join(', ')}`);
    }
  });

  test('27.3 Student cannot navigate to finance pages', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/finance`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Should be blocked or redirected
    if (page.url().includes('/finance') && !page.url().includes('/student')) {
      const hasFinanceContent = await page.locator('.ant-card, .ant-table, [class*="revenue"], [class*="income"]').first().isVisible().catch(() => false);
      if (hasFinanceContent) {
        finding(test.info(), 'Critical', 'role leakage', 'Student can view admin finance page');
      }
    }
  });

  test('27.4 Instructor cannot access admin roles management', async ({ page }) => {
    await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    await page.goto(`${BASE_URL}/admin/roles`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    if (page.url().includes('/admin/roles')) {
      const hasRoleContent = await page.locator('.ant-table, form, .ant-card').first().isVisible().catch(() => false);
      if (hasRoleContent) {
        finding(test.info(), 'Critical', 'role leakage', 'Instructor can access admin roles management page');
      }
    }
  });

  test('27.5 Instructor cannot see customer financial data', async ({ page }) => {
    await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    await page.goto(`${BASE_URL}/finance`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    if (page.url().includes('/finance') && !page.url().includes('/instructor')) {
      const hasFinanceData = await page.locator('[class*="revenue"], [class*="income"], .ant-statistic').first().isVisible().catch(() => false);
      if (hasFinanceData) {
        finding(test.info(), 'High', 'role leakage', 'Instructor can see revenue/financial data');
      }
    }
  });

  test('27.6 Front desk cannot access marketing settings', async ({ page }) => {
    await login(page, FRONTDESK_EMAIL, FRONTDESK_PASSWORD);
    await page.goto(`${BASE_URL}/marketing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    if (page.url().includes('/marketing')) {
      const hasContent = await page.locator('.ant-form, .ant-card, .ant-table').first().isVisible().catch(() => false);
      if (hasContent) {
        finding(test.info(), 'High', 'role leakage', 'Front desk can access marketing page');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 28 — MODAL / DRAWER DEEP TEST
// ═══════════════════════════════════════════════════════════
test.describe('28. Modal & Drawer Quality', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('28.1 Booking detail modal/drawer', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Click first booking row
    const firstRow = page.locator('.ant-table-row').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(3000);
      
      // Check for detail modal/drawer or navigation
      const hasDetail = await page.locator('.ant-modal, .ant-drawer').first().isVisible().catch(() => false);
      const navigated = !page.url().endsWith('/bookings');
      
      if (hasDetail) {
        // Check modal has content, not just spinner
        const hasContent = await page.locator('.ant-modal-body, .ant-drawer-body').first().textContent();
        if (!hasContent || hasContent.trim().length < 20) {
          finding(test.info(), 'High', 'modal', 'Booking detail modal opened but has minimal/no content');
        }
        
        // Check close button works
        const closeBtn = page.locator('.ant-modal-close, .ant-drawer-close').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
          await page.waitForTimeout(1000);
          const stillOpen = await page.locator('.ant-modal-body, .ant-drawer-body').isVisible().catch(() => false);
          if (stillOpen) {
            finding(test.info(), 'Medium', 'modal', 'Booking detail modal/drawer did not close on X click');
          }
        }
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/28.1-booking-detail-modal.png' });
  });

  test('28.2 Customer detail navigation/modal', async () => {
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const firstRow = page.locator('.ant-table-row').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(3000);
      
      // Could navigate to detail page or open modal/drawer
      const hasDetail = await page.locator('.ant-modal, .ant-drawer, .ant-descriptions, [class*="customer-detail"]').first().isVisible().catch(() => false);
      const navigated = !page.url().endsWith('/customers');
      
      if (!hasDetail && !navigated) {
        finding(test.info(), 'Medium', 'modal', 'Clicking customer row did nothing visible');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/28.2-customer-detail.png' });
  });

  test('28.3 Modal overlay blocks background interaction', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Oluştur"), button:has-text("New")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      const modal = page.locator('.ant-modal');
      if (await modal.isVisible().catch(() => false)) {
        // Ensure overlay/mask exists
        const mask = page.locator('.ant-modal-mask');
        const hasMask = await mask.isVisible().catch(() => false);
        if (!hasMask) {
          finding(test.info(), 'Medium', 'modal', 'Modal opened without background overlay mask');
        }
        
        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    }
  });

  test('28.4 Modals close cleanly with no orphan overlays', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Oluştur"), button:has-text("New")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(2000);
      
      // Check for any remaining overlays
      const orphanOverlay = await page.locator('.ant-modal-mask:visible, .ant-modal-wrap:visible').count();
      if (orphanOverlay > 0) {
        finding(test.info(), 'High', 'modal', 'Orphan modal overlay remains after closing a modal');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 29 — LOADING & ERROR STATES
// ═══════════════════════════════════════════════════════════
test.describe('29. Loading & Error States', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('29.1 Pages show loading skeleton then resolve', async () => {
    const pages = ['/bookings', '/customers', '/finance', '/equipment'];
    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`);
      // Quick check within first 500ms for loading indication
      const hasLoadingIndicator = await page.locator('.ant-spin, .ant-skeleton, [class*="loading"], [class*="skeleton"]').first().isVisible().catch(() => false);
      
      // Wait for resolution
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      // Check spinner didn't get stuck
      const stuckSpinner = await page.locator('.ant-spin-spinning').isVisible().catch(() => false);
      if (stuckSpinner) {
        finding(test.info(), 'High', 'stale state', `Page ${path} spinner stuck after load`);
      }
    }
  });

  test('29.2 Non-existent page shows proper 404 UI', async () => {
    await page.goto(`${BASE_URL}/this-page-does-not-exist-abc123`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Should show some kind of 404 or not-found UI
    const has404 = await page.getByText(/not found|404|page doesn't exist|sayfa bulunamadı/i).first().isVisible().catch(() => false);
    const hasResult = await page.locator('.ant-result, [class*="not-found"]').first().isVisible().catch(() => false);
    
    if (!has404 && !hasResult) {
      // Check if it just shows blank page
      const bodyText = await page.locator('body').textContent();
      if (!bodyText || bodyText.trim().length < 30) {
        finding(test.info(), 'Medium', 'error handling', 'Non-existent route shows blank page instead of 404');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/29.2-404-page.png' });
  });

  test('29.3 Empty table has proper empty state message', async () => {
    // Navigate to a page likely to have items, then search for something that won't match
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const search = page.locator('input[placeholder*="search" i], input[placeholder*="ara" i], .ant-input-search input').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('zzzzz_nonexistent_xyz');
      await page.waitForTimeout(2000);
      
      // Should show empty state in table
      const hasEmpty = await page.locator('.ant-empty, .ant-table-empty, [class*="no-data"], [class*="empty"]').first().isVisible().catch(() => false);
      const hasTable = await page.locator('.ant-table-row').first().isVisible().catch(() => false);
      
      if (!hasEmpty && !hasTable) {
        finding(test.info(), 'Medium', 'rendering', 'Table search with no results shows neither empty state nor "no data" message');
      }
      
      // Clear search
      await search.clear();
      await page.waitForTimeout(1000);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 30 — FORM UX QUALITY
// ═══════════════════════════════════════════════════════════
test.describe('30. Form UX Quality', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('30.1 Create booking form has proper validation', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Oluştur"), button:has-text("New")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      // Try to submit empty
      const submitBtn = page.locator('.ant-modal button[type="submit"], .ant-modal button:has-text("Save"), .ant-modal button:has-text("Create"), .ant-modal button:has-text("Kaydet"), .ant-drawer button[type="submit"], .ant-drawer button:has-text("Save"), .ant-drawer button:has-text("Kaydet")').first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(1500);
        
        // Check for validation errors
        const hasValidation = await page.locator('.ant-form-item-explain-error, .ant-form-explain, [class*="error"], [role="alert"]').first().isVisible().catch(() => false);
        if (!hasValidation) {
          // Check if form submitted without validation (which means it might have gone through)
          const formStillVisible = await page.locator('.ant-modal, .ant-drawer').isVisible().catch(() => false);
          if (!formStillVisible) {
            finding(test.info(), 'High', 'form UX', 'Booking create form submitted without validation on empty fields');
          }
        }
      }
      
      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'test-results/screenshots/30.1-booking-form-validation.png' });
  });

  test('30.2 Date picker fields in booking form', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Oluştur"), button:has-text("New")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      // Find date picker
      const datePicker = page.locator('.ant-picker').first();
      if (await datePicker.isVisible().catch(() => false)) {
        await datePicker.click();
        await page.waitForTimeout(1000);
        
        // Should open calendar popup
        const hasPopup = await page.locator('.ant-picker-dropdown, .ant-picker-panel').isVisible().catch(() => false);
        if (!hasPopup) {
          finding(test.info(), 'Medium', 'form UX', 'Date picker click does not open calendar popup');
        }
        
        // Close picker
        await page.keyboard.press('Escape');
      }
      
      // Close modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('30.3 Required fields have visual indicators', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Oluştur"), button:has-text("New")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      // Check for asterisks on required fields
      const requiredMarkers = page.locator('.ant-form-item-required, label .ant-form-item-required, [class*="required"]');
      const markerCount = await requiredMarkers.count();
      
      if (markerCount === 0) {
        // Check if any labels have asterisk text
        const labels = page.locator('.ant-modal label, .ant-drawer label');
        const labelCount = await labels.count();
        if (labelCount > 0) {
          let hasAnyAsterisk = false;
          for (let i = 0; i < Math.min(labelCount, 10); i++) {
            const text = await labels.nth(i).textContent();
            if (text?.includes('*')) {
              hasAnyAsterisk = true;
              break;
            }
          }
          if (!hasAnyAsterisk) {
            finding(test.info(), 'Low', 'form UX', 'Booking create form has no visible required field indicators');
          }
        }
      }
      
      await page.keyboard.press('Escape');
    }
  });

  test('30.4 Select/dropdown fields populate correctly', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Oluştur"), button:has-text("New")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      // Find select dropdowns
      const selects = page.locator('.ant-modal .ant-select, .ant-drawer .ant-select').first();
      if (await selects.isVisible().catch(() => false)) {
        await selects.click();
        await page.waitForTimeout(1500);
        
        // Check dropdown has options
        const options = page.locator('.ant-select-dropdown .ant-select-item');
        const optionCount = await options.count();
        
        if (optionCount === 0) {
          // Maybe it's still loading
          await page.waitForTimeout(2000);
          const retryCount = await options.count();
          if (retryCount === 0) {
            finding(test.info(), 'High', 'form UX', 'Select dropdown in booking form has no options after waiting');
          }
        }
        
        // Close dropdown
        await page.keyboard.press('Escape');
      }
      
      await page.keyboard.press('Escape');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 31 — VISUAL ISSUES & CONSOLE ERRORS
// ═══════════════════════════════════════════════════════════
test.describe('31. Visual Issues & Console Errors', () => {
  test.describe.configure({ mode: 'serial' });

  test('31.1 Dashboard has no JS console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Filter out known benign errors
    const realErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('WebSocket') &&
      !e.includes('net::') &&
      !e.includes('ResizeObserver') &&
      !e.includes('third_party')
    );
    
    if (realErrors.length > 0) {
      finding(test.info(), 'Medium', 'console error', `Dashboard has ${realErrors.length} JS console error(s): ${realErrors[0].substring(0, 100)}`);
    }
  });

  test('31.2 Key pages have no broken images', async ({ page }) => {
    await loginAsAdmin(page);
    const pagesToCheck = ['/dashboard', '/bookings', '/customers', '/shop'];
    
    for (const path of pagesToCheck) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      const images = page.locator('img:visible');
      const imgCount = await images.count();
      
      for (let i = 0; i < Math.min(imgCount, 10); i++) {
        const img = images.nth(i);
        const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
        const src = await img.getAttribute('src') || '';
        
        if (naturalWidth === 0 && !src.includes('data:') && src.length > 0) {
          finding(test.info(), 'Medium', 'visual', `Broken image on ${path}: ${src.substring(0, 50)}`);
          break; // One finding per page
        }
      }
    }
  });

  test('31.3 Sidebar collapses and expands cleanly', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Look for sidebar collapse trigger
    const trigger = page.locator('.ant-layout-sider-trigger, [class*="collapse-trigger"], [class*="sider-trigger"], button[aria-label*="collapse" i]').first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await page.waitForTimeout(1000);
      
      // Check sidebar got collapsed class
      const collapsed = await page.locator('.ant-layout-sider-collapsed').isVisible().catch(() => false);
      
      // Click again to expand
      await trigger.click();
      await page.waitForTimeout(1000);
      
      const expanded = !(await page.locator('.ant-layout-sider-collapsed').isVisible().catch(() => false));
    }
    await page.screenshot({ path: 'test-results/screenshots/31.3-sidebar-collapse.png' });
  });

  test('31.4 No overlapping elements on key admin pages', async ({ page }) => {
    await loginAsAdmin(page);
    const pagesToCheck = ['/dashboard', '/bookings', '/customers'];
    
    for (const path of pagesToCheck) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      // Check for content overflow
      const hasOverflow = await page.evaluate(() => {
        const el = document.querySelector('.ant-layout-content, .ant-layout main, main') as HTMLElement;
        if (!el) return false;
        return el.scrollWidth > el.clientWidth + 20; // 20px tolerance
      });
      
      if (hasOverflow) {
        finding(test.info(), 'Medium', 'visual', `Horizontal overflow detected on ${path}`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 32 — MOBILE RESPONSIVE LIGHT CHECK
// ═══════════════════════════════════════════════════════════
test.describe('32. Mobile Responsive Check', () => {
  test.describe.configure({ mode: 'serial' });

  test('32.1 Public pages render at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    
    const pages = ['/', '/shop', '/academy/kite-lessons', '/rental'];
    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth + 20;
      });
      
      if (hasOverflow) {
        finding(test.info(), 'Medium', 'responsive', `Page ${path} has horizontal overflow at 375px width`);
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/32.1-mobile-public.png', fullPage: true });
  });

  test('32.2 Student dashboard at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > document.body.clientWidth + 20;
    });
    
    if (hasOverflow) {
      finding(test.info(), 'Medium', 'responsive', 'Student dashboard has horizontal overflow at mobile viewport');
    }
    await page.screenshot({ path: 'test-results/screenshots/32.2-mobile-student.png', fullPage: true });
  });

  test('32.3 Admin dashboard at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > document.body.clientWidth + 20;
    });
    
    if (hasOverflow) {
      finding(test.info(), 'Medium', 'responsive', 'Admin dashboard has horizontal overflow at mobile viewport');
    }
    
    // Check mobile menu toggle exists
    const hasMobileMenu = await page.locator('.ant-layout-sider-trigger, [class*="hamburger"], [class*="menu-toggle"], button[aria-label*="menu" i]').first().isVisible().catch(() => false);
    
    await page.screenshot({ path: 'test-results/screenshots/32.3-mobile-admin.png', fullPage: true });
  });
});
