/**
 * PHASE 1: Authentication & Smoke Tests
 * 
 * Tests:
 * - Login page renders
 * - Admin login works
 * - Manager login works
 * - Dashboard loads with content
 * - All main navigation pages load without error
 * - Logout works
 * 
 * Run: npx playwright test tests/e2e/phase1-auth-smoke.spec.ts --headed
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  loginAsAdmin,
  loginAsManager,
  navigateTo,
  expectPageLoaded,
  waitForLoading,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from '../helpers';

test.describe('Phase 1: Authentication & Smoke', () => {

  // ─── 1.1 Login Page ─────────────────────────────────────
  test.describe('1.1 Login Page', () => {
    test('Login page loads with form', async ({ page }) => {
      await navigateTo(page, '/login');
      
      await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('Shows error on invalid credentials', async ({ page }) => {
      await navigateTo(page, '/login');
      await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });
      
      await page.fill('#email', 'wrong@email.com');
      await page.fill('#password', 'wrongpassword');
      await page.click('button[type="submit"]');
      
      // Login page uses custom TailwindCSS error div with text-red-300
      await expect(
        page.getByText('Email or password is incorrect').or(page.getByText('Login failed'))
      ).toBeVisible({ timeout: 10000 });
    });

    test('Shows validation on empty submit', async ({ page }) => {
      await navigateTo(page, '/login');
      await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });
      
      // Inputs have HTML5 required attribute - check native validation
      const emailInvalid = await page.locator('#email').evaluate(
        (el) => !el.validity.valid
      );
      expect(emailInvalid).toBe(true);
    });
  });

  // ─── 1.2 Admin Login ────────────────────────────────────
  test.describe('1.2 Admin Login', () => {
    test('Admin can login and reaches dashboard', async ({ page }) => {
      await loginAsAdmin(page);
      
      // Should be on some admin/dashboard page
      const url = page.url();
      expect(url).toMatch(/\/(dashboard|admin)/);
      
      // Dashboard should have content
      await waitForLoading(page);
      await expectPageLoaded(page);
    });

    test('Dashboard shows authenticated content', async ({ page }) => {
      await loginAsAdmin(page);
      await waitForLoading(page);
      
      // Dashboard may not render KPIs with empty DB, but sidebar + nav must be visible
      await expect(
        page.getByRole('link', { name: 'Dashboard' }).or(page.getByText('Operational Health'))
      ).toBeVisible({ timeout: 15000 });
    });
  });

  // ─── 1.3 Manager Login ──────────────────────────────────
  test.describe('1.3 Manager Login', () => {
    test('Manager can login and reaches dashboard', async ({ page }) => {
      await loginAsManager(page);
      
      const url = page.url();
      expect(url).toMatch(/\/(dashboard|admin)/);
      
      await waitForLoading(page);
      await expectPageLoaded(page);
    });
  });

  // ─── 1.4 Navigation Smoke ───────────────────────────────
  test.describe('1.4 Staff Page Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await waitForLoading(page);
    });

    const staffPages = [
      { path: '/bookings', name: 'Bookings' },
      { path: '/bookings/calendar', name: 'Booking Calendar' },
      { path: '/customers', name: 'Customers' },
      { path: '/equipment', name: 'Equipment' },
      { path: '/rentals', name: 'Rentals' },
      { path: '/finance', name: 'Finance' },
      { path: '/finance/daily-operations', name: 'Daily Operations' },
      { path: '/instructors', name: 'Instructors' },
      { path: '/services/accommodation', name: 'Accommodation' },
      { path: '/services/lessons', name: 'Lesson Services' },
      { path: '/services/rentals', name: 'Rental Services' },
      { path: '/services/shop', name: 'Shop Management' },
      { path: '/services/memberships', name: 'Memberships' },
      { path: '/services/categories', name: 'Categories' },
      { path: '/calendars/lessons', name: 'Lessons Calendar' },
      { path: '/calendars/rentals', name: 'Rentals Calendar' },
      { path: '/calendars/stay', name: 'Stay Calendar' },
      { path: '/calendars/shop-orders', name: 'Shop Orders' },
      { path: '/calendars/events', name: 'Events Calendar' },
      { path: '/calendars/members', name: 'Members Calendar' },
      { path: '/chat', name: 'Chat' },
      { path: '/notifications', name: 'Notifications' },
    ];

    for (const { path, name } of staffPages) {
      test(`${name} page loads (${path})`, async ({ page }) => {
        await navigateTo(page, path);
        await waitForLoading(page, 15000);
        await expectPageLoaded(page);
      });
    }
  });

  // ─── 1.5 Admin-Only Pages ───────────────────────────────
  test.describe('1.5 Admin/Manager Pages', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await waitForLoading(page);
    });

    const adminPages = [
      { path: '/admin/settings', name: 'Settings' },
      { path: '/admin/roles', name: 'Roles' },
      { path: '/admin/waivers', name: 'Waivers' },
      { path: '/admin/legal-documents', name: 'Legal Documents' },
      { path: '/admin/vouchers', name: 'Vouchers' },
      { path: '/admin/ratings-analytics', name: 'Ratings Analytics' },
      { path: '/admin/manager-commissions', name: 'Manager Commissions' },
      { path: '/finance/settings', name: 'Finance Settings' },
      { path: '/finance/refunds', name: 'Refunds' },
      { path: '/finance/wallet-deposits', name: 'Wallet Deposits' },
      { path: '/finance/bank-accounts', name: 'Bank Accounts' },
      { path: '/services/packages', name: 'Packages' },
      { path: '/marketing', name: 'Marketing' },
      { path: '/quick-links', name: 'Quick Links' },
      { path: '/forms', name: 'Forms' },
      { path: '/inventory', name: 'Inventory' },
    ];

    for (const { path, name } of adminPages) {
      test(`${name} page loads (${path})`, async ({ page }) => {
        await navigateTo(page, path);
        await waitForLoading(page, 15000);
        await expectPageLoaded(page);
      });
    }
  });

  // ─── 1.6 Public Pages ───────────────────────────────────
  test.describe('1.6 Public Pages (no auth needed)', () => {
    const publicPages = [
      { path: '/', name: 'Home' },
      { path: '/guest', name: 'Guest Landing' },
      { path: '/shop', name: 'Shop Landing' },
      { path: '/shop/browse', name: 'Shop Browse' },
      { path: '/academy', name: 'Academy Landing' },
      { path: '/academy/kite-lessons', name: 'Kite Lessons' },
      { path: '/academy/foil-lessons', name: 'Foil Lessons' },
      { path: '/academy/wing-lessons', name: 'Wing Lessons' },
      { path: '/academy/efoil-lessons', name: 'E-Foil Lessons' },
      { path: '/academy/premium-lessons', name: 'Premium Lessons' },
      { path: '/rental', name: 'Rental Landing' },
      { path: '/rental/standard', name: 'Standard Rental' },
      { path: '/rental/sls', name: 'SLS Rental' },
      { path: '/rental/dlab', name: 'D-Lab Rental' },
      { path: '/rental/efoil', name: 'E-Foil Rental' },
      { path: '/rental/premium', name: 'Premium Rental' },
      { path: '/stay', name: 'Stay Landing' },
      { path: '/stay/book-accommodation', name: 'Book Accommodation' },
      { path: '/experience', name: 'Experience Landing' },
      { path: '/experience/book-package', name: 'Book Package' },
      { path: '/experience/kite-packages', name: 'Kite Packages' },
      { path: '/experience/wing-packages', name: 'Wing Packages' },
      { path: '/experience/downwinders', name: 'Downwinders' },
      { path: '/experience/camps', name: 'Camps' },
      { path: '/care', name: 'Care Landing' },
      { path: '/contact', name: 'Contact' },
      { path: '/help', name: 'Help & Support' },
      { path: '/members/offerings', name: 'Member Offerings' },
    ];

    for (const { path, name } of publicPages) {
      test(`${name} page loads (${path})`, async ({ page }) => {
        await navigateTo(page, path);
        await waitForLoading(page, 15000);
        await expectPageLoaded(page);
      });
    }
  });

  // ─── 1.7 Logout ─────────────────────────────────────────
  test.describe('1.7 Logout', () => {
    test('User can logout', async ({ page }) => {
      await loginAsAdmin(page);
      await waitForLoading(page);
      
      // On mobile, sidebar is collapsed — open it first
      const openSidebar = page.getByRole('button', { name: /Open sidebar/i });
      if (await openSidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
        await openSidebar.click();
        await page.waitForTimeout(500);
      }
      
      // Sidebar has a "Logout" button that triggers a confirmation modal
      const logoutBtn = page.getByRole('button', { name: 'Logout' });
      await logoutBtn.first().click();
      
      // Confirmation modal appears with "Yes, Logout" button
      const confirmBtn = page.getByRole('button', { name: 'Yes, Logout' });
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();
      
      // Should be back on login page
      await page.waitForURL(/\/login/, { timeout: 10000 });
      await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    });
  });
});
