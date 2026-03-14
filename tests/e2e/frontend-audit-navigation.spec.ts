/**
 * FRONTEND QA AUDIT — Layer 1-3: Navigation, Shell & Component Interaction
 * 
 * Tests global app shell, public page reachability, routing integrity,
 * and basic component rendering across all major sections.
 */
import { test, expect, Page } from '@playwright/test';
import { BASE_URL, login, loginAsAdmin, loginAsStudent, loginAsManager, ADMIN_EMAIL, ADMIN_PASSWORD, STUDENT_EMAIL, STUDENT_PASSWORD, MANAGER_EMAIL, MANAGER_PASSWORD } from './helpers';

const INSTRUCTOR_EMAIL = 'autoinst487747@test.com';
const INSTRUCTOR_PASSWORD = 'TestPass123!';
const FRONTDESK_EMAIL = 'frontdesk@test.com';
const FRONTDESK_PASSWORD = 'TestPass123!';

// Collect findings
function finding(testInfo: any, severity: string, category: string, desc: string) {
  testInfo.annotations.push({ type: 'finding', description: `[${severity}][${category}] ${desc}` });
}

// ═══════════════════════════════════════════════════════════
// SECTION 0 — PUBLIC PAGES / GUEST NAVIGATION
// ═══════════════════════════════════════════════════════════
test.describe('0. Public Pages — Guest Navigation', () => {
  test.describe.configure({ mode: 'serial' });

  test('0.1 Landing page loads with content', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    // Should show the public home / splash page
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
    // Take screenshot for reference
    await page.screenshot({ path: 'test-results/screenshots/0.1-landing.png' });
  });

  test('0.2 Guest landing (/guest) loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/guest`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
    await page.screenshot({ path: 'test-results/screenshots/0.2-guest-landing.png' });
  });

  test('0.3 Public shop page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/shop`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
    await page.screenshot({ path: 'test-results/screenshots/0.3-shop.png' });
  });

  test('0.4 Academy landing loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/academy`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.5 Rental landing loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/rental`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.6 Stay landing loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/stay`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.7 Experience landing loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/experience`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.8 Member offerings loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/members/offerings`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.9 Contact page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/contact`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.10 Community team page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/team`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.11 Help/Support page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/help`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.12 Care (repairs) page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/care`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.13 Academy sub-pages load', async ({ page }) => {
    const subPages = ['/academy/kite-lessons', '/academy/foil-lessons', '/academy/wing-lessons', '/academy/efoil-lessons', '/academy/premium-lessons'];
    for (const path of subPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      const content = await page.locator('body').textContent();
      if (!content || content.length < 20) {
        finding(test.info(), 'Medium', 'navigation', `${path} has minimal/no content`);
      }
    }
  });

  test('0.14 Rental sub-pages load', async ({ page }) => {
    const subPages = ['/rental/standard', '/rental/sls', '/rental/dlab', '/rental/efoil'];
    for (const path of subPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      const content = await page.locator('body').textContent();
      if (!content || content.length < 20) {
        finding(test.info(), 'Medium', 'navigation', `${path} has minimal/no content`);
      }
    }
  });

  test('0.15 Stay sub-pages load', async ({ page }) => {
    const subPages = ['/stay/home', '/stay/hotel', '/stay/book-accommodation'];
    for (const path of subPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('0.16 Experience sub-pages load', async ({ page }) => {
    const subPages = ['/experience/kite-packages', '/experience/wing-packages', '/experience/downwinders', '/experience/camps'];
    for (const path of subPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('0.17 Shop category pages load', async ({ page }) => {
    const categories = ['/shop/kitesurf', '/shop/wingfoil', '/shop/foiling', '/shop/efoil'];
    for (const path of categories) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('0.18 Events page loads publicly', async ({ page }) => {
    await page.goto(`${BASE_URL}/services/events`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('0.19 Direct URL refresh preserves page', async ({ page }) => {
    await page.goto(`${BASE_URL}/academy/kite-lessons`);
    await page.waitForLoadState('domcontentloaded');
    const contentBefore = await page.locator('body').textContent();
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const contentAfter = await page.locator('body').textContent();
    // Content should be similar after refresh
    expect(contentAfter!.length).toBeGreaterThan(20);
  });

  test('0.20 Browser back/forward works on public pages', async ({ page }) => {
    await page.goto(`${BASE_URL}/academy`);
    await page.waitForLoadState('domcontentloaded');
    await page.goto(`${BASE_URL}/rental`);
    await page.waitForLoadState('domcontentloaded');
    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/academy');
    await page.goForward();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/rental');
  });

  test('0.21 Non-existent route redirects gracefully', async ({ page }) => {
    await page.goto(`${BASE_URL}/this-route-does-not-exist-xyz`);
    await page.waitForLoadState('domcontentloaded');
    // Should redirect to / or show something meaningful, not crash
    const url = page.url();
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(10);
    // No error overlay
    const errorVisible = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (errorVisible) {
      finding(test.info(), 'High', 'navigation', 'Non-existent route shows error page instead of graceful redirect');
    }
  });

  test('0.22 Protected route redirects guest to login', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    // Should redirect to /login or /guest
    const url = page.url();
    if (!url.includes('/login') && !url.includes('/guest')) {
      finding(test.info(), 'Critical', 'role leakage', `Guest accessing /dashboard is NOT redirected to login — landed on ${url}`);
    }
  });

  test('0.23 Guest sidebar navigation structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/guest`);
    await page.waitForLoadState('domcontentloaded');
    // Check sidebar has expected menu items
    const menuItems = ['Shop', 'Academy', 'Rental', 'Member', 'Stay', 'Experience', 'Community', 'Contact'];
    for (const label of menuItems) {
      const item = page.locator('nav, aside, [class*="sidebar"], [class*="menu"]').getByText(label, { exact: false }).first();
      const visible = await item.isVisible().catch(() => false);
      if (!visible) {
        finding(test.info(), 'Medium', 'navigation', `Guest sidebar missing "${label}" menu item`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 1 — AUTH FRONTEND TESTS
// ═══════════════════════════════════════════════════════════
test.describe('1. Authentication Frontend', () => {
  test.describe.configure({ mode: 'serial' });

  test('1.1 Login page renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    // Check form elements
    await expect(page.locator('#email, input[name="email"], input[type="email"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#password, input[name="password"], input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/1.1-login-form.png' });
  });

  test('1.2 Login with empty fields shows validation', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email').first()).toBeVisible({ timeout: 10000 });
    // Click submit without filling
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    // Check for validation messages or disabled state
    const hasValidation = await page.locator('.ant-form-item-explain-error, .ant-form-item-has-error, [role="alert"]').first().isVisible().catch(() => false);
    const hasToast = await page.locator('.ant-message-error, .ant-notification-notice').first().isVisible().catch(() => false);
    if (!hasValidation && !hasToast) {
      finding(test.info(), 'Medium', 'validation', 'Login form submits without showing validation when fields are empty');
    }
    await page.screenshot({ path: 'test-results/screenshots/1.2-login-empty-submit.png' });
  });

  test('1.3 Login with wrong credentials shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#email').first()).toBeVisible({ timeout: 10000 });
    await page.fill('#email', 'wrong@example.com');
    await page.fill('#password', 'WrongPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    // Should show error message, not navigate away
    const stillOnLogin = page.url().includes('/login');
    expect(stillOnLogin).toBe(true);
    const hasError = await page.locator('.ant-message-error, .ant-notification-notice-error, [class*="error"], .ant-alert-error').first().isVisible().catch(() => false);
    if (!hasError) {
      finding(test.info(), 'High', 'form', 'Login with wrong credentials shows no visible error message');
    }
    await page.screenshot({ path: 'test-results/screenshots/1.3-login-wrong-creds.png' });
  });

  test('1.4 Successful admin login redirects to dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    expect(page.url()).toContain('/dashboard');
    await page.screenshot({ path: 'test-results/screenshots/1.4-admin-dashboard.png' });
  });

  test('1.5 Logout works correctly', async ({ page }) => {
    await loginAsAdmin(page);
    // Find and click logout
    // Try profile menu / avatar first
    const avatarMenu = page.locator('[class*="avatar"], [class*="user-menu"], [class*="profile"]').first();
    if (await avatarMenu.isVisible().catch(() => false)) {
      await avatarMenu.click();
      await page.waitForTimeout(500);
    }
    // Look for logout button/link
    const logoutBtn = page.getByText(/logout|sign out|çıkış/i).first();
    const logoutVisible = await logoutBtn.isVisible().catch(() => false);
    if (logoutVisible) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
      // May show confirmation modal
      const confirmBtn = page.locator('.ant-modal-confirm-btns .ant-btn-primary, .ant-btn-dangerous').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }
      // Should be back at login or home
      const url = page.url();
      const loggedOut = url.includes('/login') || url.endsWith('/') || url.includes('/guest');
      if (!loggedOut) {
        finding(test.info(), 'High', 'navigation', `Logout did not redirect correctly. Current URL: ${url}`);
      }
    } else {
      finding(test.info(), 'Medium', 'UX', 'Logout button not easily discoverable in UI');
    }
    await page.screenshot({ path: 'test-results/screenshots/1.5-after-logout.png' });
  });

  test('1.6 Register page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toBeEmpty();
    // Check for registration form elements  
    const hasForm = await page.locator('form, [class*="register"], [class*="signup"]').first().isVisible().catch(() => false);
    if (!hasForm) {
      finding(test.info(), 'Medium', 'rendering', 'Register page does not have a visible form');
    }
    await page.screenshot({ path: 'test-results/screenshots/1.6-register.png' });
  });

  test('1.7 Login loading state during auth', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('#email').first()).toBeVisible({ timeout: 10000 });
    await page.fill('#email', ADMIN_EMAIL);
    await page.fill('#password', ADMIN_PASSWORD);
    // Watch for loading spinner on submit
    const submitBtn = page.locator('button[type="submit"]').first();
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/auth/login'), { timeout: 15000 }),
      submitBtn.click(),
    ]);
    // After submit, button should show loading or be disabled briefly
    await page.screenshot({ path: 'test-results/screenshots/1.7-login-loading.png' });
  });

  test('1.8 Student login redirects to student portal', async ({ page }) => {
    await loginAsStudent(page);
    const url = page.url();
    const isStudentArea = url.includes('/student') || url.includes('/guest');
    expect(isStudentArea).toBe(true);
    await page.screenshot({ path: 'test-results/screenshots/1.8-student-dashboard.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 2 — ADMIN NAVIGATION & SHELL
// ═══════════════════════════════════════════════════════════
test.describe('2. Admin Shell & Navigation', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('2.1 Admin dashboard loads with widgets', async () => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    // Dashboard should have cards/widgets
    const cards = page.locator('.ant-card, [class*="card"], [class*="widget"], [class*="stat"]');
    const cardCount = await cards.count();
    if (cardCount < 1) {
      finding(test.info(), 'High', 'rendering', 'Admin dashboard has no visible cards/widgets');
    }
    await page.screenshot({ path: 'test-results/screenshots/2.1-admin-dashboard.png' });
  });

  test('2.2 Admin sidebar has expected menu items', async () => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    const expectedItems = ['Dashboard', 'Academy', 'Customers', 'Instructors', 'Shop', 'Finance'];
    for (const label of expectedItems) {
      const found = await page.locator('nav, aside, [class*="sidebar"]').getByText(label, { exact: false }).first().isVisible().catch(() => false);
      if (!found) {
        finding(test.info(), 'Medium', 'navigation', `Admin sidebar missing "${label}" menu item`);
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/2.2-admin-sidebar.png' });
  });

  test('2.3 Admin pages reachable via navigation', async () => {
    const adminPages = [
      ['/bookings', 'Bookings page'],
      ['/customers', 'Customers page'],
      ['/equipment', 'Equipment page'],
      ['/rentals', 'Rentals page'],
      ['/finance', 'Finance page'],
      ['/services/lessons', 'Lesson Services'],
      ['/services/shop', 'Shop Management'],
      ['/admin/settings', 'Settings'],
    ];
    for (const [path, name] of adminPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const bodyText = await page.locator('body').textContent();
      if (!bodyText || bodyText.length < 30) {
        finding(test.info(), 'High', 'navigation', `${name} (${path}) loads with minimal content`);
      }
      // Check for error overlays
      const hasError = await page.locator('.ant-result-error, .ant-result-500, .ant-result-404').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'Critical', 'navigation', `${name} (${path}) shows error page`);
      }
    }
  });

  test('2.4 Admin finance sub-pages load', async () => {
    const financePages = ['/finance', '/finance/lessons', '/finance/rentals', '/finance/shop', '/finance/accommodation', '/finance/daily-operations', '/finance/expenses'];
    for (const path of financePages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `Finance sub-page ${path} shows error`);
      }
    }
  });

  test('2.5 Admin calendar views load', async () => {
    const calendarPages = ['/calendars/lessons', '/calendars/rentals', '/calendars/stay', '/calendars/shop-orders', '/calendars/events'];
    for (const path of calendarPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `Calendar view ${path} shows error`);
      }
    }
  });

  test('2.6 Admin service management pages load', async () => {
    const servicePages = ['/services/lessons', '/services/rentals', '/services/shop', '/services/accommodation', '/services/packages', '/services/memberships', '/services/categories'];
    for (const path of servicePages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `Service page ${path} shows error`);
      }
    }
  });

  test('2.7 Admin settings & management pages load', async () => {
    const adminPages = ['/admin/settings', '/admin/roles', '/admin/waivers', '/admin/vouchers', '/admin/support-tickets', '/admin/spare-parts'];
    for (const path of adminPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `Admin page ${path} shows error`);
      }
    }
  });

  test('2.8 Page refresh preserves admin auth state', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Should still be on bookings, not redirected to login
    const url = page.url();
    expect(url).not.toContain('/login');
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 3 — INSTRUCTOR NAVIGATION
// ═══════════════════════════════════════════════════════════
test.describe('3. Instructor Shell & Navigation', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('3.1 Instructor dashboard loads', async () => {
    await page.goto(`${BASE_URL}/instructor/dashboard`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Critical', 'navigation', 'Instructor dashboard shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/3.1-instructor-dashboard.png' });
  });

  test('3.2 Instructor can access allowed pages', async () => {
    const allowedPages = ['/bookings', '/equipment', '/rentals', '/customers'];
    for (const path of allowedPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const url = page.url();
      if (url.includes('/login')) {
        finding(test.info(), 'High', 'permissions rendering', `Instructor unexpectedly redirected to login for ${path}`);
      }
    }
  });

  test('3.3 Instructor cannot access admin-only pages', async () => {
    const restrictedPages = ['/admin/settings', '/admin/roles', '/admin/spare-parts', '/admin/deleted-bookings'];
    for (const path of restrictedPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      const url = page.url();
      // Should redirect to login or show permission denied
      const blocked = url.includes('/login') || url.includes('/instructor/dashboard') || url.includes('/dashboard');
      if (!blocked) {
        // Check if the page actually rendered admin content
        const hasAdminContent = await page.locator('[class*="settings"], [class*="roles-admin"]').isVisible().catch(() => false);
        if (hasAdminContent) {
          finding(test.info(), 'Critical', 'permissions rendering', `Instructor can access admin-only page: ${path}`);
        }
      }
    }
  });

  test('3.4 Instructor sidebar does not leak admin menus', async () => {
    await page.goto(`${BASE_URL}/instructor/dashboard`);
    await page.waitForLoadState('networkidle');
    const adminOnlyLabels = ['Settings', 'Roles', 'Deleted Bookings', 'Spare Parts'];
    for (const label of adminOnlyLabels) {
      const found = await page.locator('nav, aside, [class*="sidebar"]').getByText(label, { exact: true }).isVisible().catch(() => false);
      if (found) {
        finding(test.info(), 'High', 'permissions rendering', `Instructor sidebar shows admin-only item: "${label}"`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 4 — MANAGER NAVIGATION  
// ═══════════════════════════════════════════════════════════
test.describe('4. Manager Shell & Navigation', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsManager(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('4.1 Manager dashboard loads', async () => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    await page.screenshot({ path: 'test-results/screenshots/4.1-manager-dashboard.png' });
  });

  test('4.2 Manager can access finance pages', async () => {
    const financePages = ['/finance', '/finance/lessons', '/finance/refunds', '/finance/wallet-deposits'];
    for (const path of financePages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const url = page.url();
      if (url.includes('/login')) {
        finding(test.info(), 'High', 'permissions rendering', `Manager redirected to login for ${path}`);
      }
    }
  });

  test('4.3 Manager can access admin settings', async () => {
    await page.goto(`${BASE_URL}/admin/settings`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    const url = page.url();
    if (url.includes('/login')) {
      finding(test.info(), 'Medium', 'permissions rendering', 'Manager cannot access admin settings');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 5 — STUDENT PORTAL NAVIGATION
// ═══════════════════════════════════════════════════════════
test.describe('5. Student Portal Navigation', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsStudent(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('5.1 Student dashboard loads', async () => {
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Critical', 'navigation', 'Student dashboard shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/5.1-student-dashboard.png' });
  });

  test('5.2 Student portal sub-pages load', async () => {
    const studentPages = [
      ['/student/schedule', 'Schedule'],
      ['/student/courses', 'Courses'],
      ['/student/payments', 'Payments'],
      ['/student/support', 'Support'],
      ['/student/profile', 'Profile'],
      ['/student/family', 'Family'],
    ];
    for (const [path, name] of studentPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
      if (hasError) {
        finding(test.info(), 'High', 'navigation', `Student ${name} page (${path}) shows error`);
      }
      const url = page.url();
      if (url.includes('/login')) {
        finding(test.info(), 'Critical', 'navigation', `Student ${name} page redirects to login`);
      }
    }
  });

  test('5.3 Student can access public browsing pages', async () => {
    const publicPages = ['/shop', '/academy', '/rental', '/stay', '/experience', '/members/offerings'];
    for (const path of publicPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('5.4 Student cannot access admin pages', async () => {
    const adminPages = ['/dashboard', '/admin/settings', '/admin/roles', '/bookings', '/customers'];
    for (const path of adminPages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      const url = page.url();
      // Student should be redirected away from admin pages
      const blocked = url.includes('/login') || url.includes('/student') || url.includes('/guest');
      if (!blocked) {
        finding(test.info(), 'Critical', 'permissions rendering', `Student accessed admin page: ${path} (current URL: ${url})`);
      }
    }
  });

  test('5.5 Student sidebar has correct menu items', async () => {
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    // Student should see these
    const expectedItems = ['Shop', 'Academy', 'Rental', 'Stay', 'Experience'];
    for (const label of expectedItems) {
      const found = await page.locator('nav, aside, [class*="sidebar"]').getByText(label, { exact: false }).first().isVisible().catch(() => false);
      if (!found) {
        finding(test.info(), 'Medium', 'navigation', `Student sidebar missing "${label}"`);
      }
    }
    // Student should NOT see admin items
    const forbidden = ['Instructors', 'Admin', 'Deleted Bookings'];
    for (const label of forbidden) {
      const found = await page.locator('nav, aside, [class*="sidebar"]').getByText(label, { exact: true }).isVisible().catch(() => false);
      if (found) {
        finding(test.info(), 'High', 'permissions rendering', `Student sidebar shows admin item: "${label}"`);
      }
    }
  });

  test('5.6 Student page refresh preserves state', async () => {
    await page.goto(`${BASE_URL}/student/schedule`);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/student');
    expect(page.url()).not.toContain('/login');
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 6 — FRONT DESK NAVIGATION
// ═══════════════════════════════════════════════════════════
test.describe('6. Front Desk Navigation', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, FRONTDESK_EMAIL, FRONTDESK_PASSWORD);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('6.1 Front desk dashboard loads', async () => {
    const url = page.url();
    await page.screenshot({ path: 'test-results/screenshots/6.1-frontdesk-landing.png' });
    // Front desk should land on some functional page  
    expect(url).not.toContain('/login');
  });

  test('6.2 Front desk can access operational pages', async () => {
    const pages = ['/bookings', '/customers', '/equipment', '/rentals'];
    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      const url = page.url();
      if (url.includes('/login')) {
        finding(test.info(), 'Medium', 'permissions rendering', `Front desk redirected to login for ${path}`);
      }
    }
  });
});
