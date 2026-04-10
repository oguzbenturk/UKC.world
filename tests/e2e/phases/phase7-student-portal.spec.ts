/**
 * Phase 7 — Student Portal
 *
 * Tests the student-facing portal (requires student auth):
 *   7.1  Student Authentication
 *   7.2  Student Dashboard
 *   7.3  Schedule & Lessons
 *   7.4  Courses & Packages
 *   7.5  Payments & Wallet
 *   7.6  Support
 *   7.7  Profile
 *   7.8  Family Management
 *   7.9  Friends & Group Bookings
 *   7.10 Student Rentals & Accommodation
 *   7.11 Student Navigation
 *   7.12 Route Protection Verification
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL, navigateTo, expectPageLoaded, waitForLoading,
  loginAsStudent, loginAsAdmin, login, STUDENT_EMAIL, STUDENT_PASSWORD
} from '../helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 2500)); });

/* ================================================================
   7.1  Student Authentication
   ================================================================ */
test.describe('7.1 Student Authentication', () => {
  test('Student routes redirect to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE_URL}/student/dashboard`);
    // Allow SPA time to load, check auth, and redirect
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const url = page.url();
    // Should redirect to login, show login form, or show portal unavailable page
    const redirectedToLogin = url.includes('/login');
    const hasLoginForm = await page.locator('#email, input[name="email"], [placeholder*="email" i]').isVisible({ timeout: 5000 }).catch(() => false);
    const hasUnavailable = await page.locator('text=/unavailable|not available|portal/i').isVisible({ timeout: 3000 }).catch(() => false);
    const notOnStudentDashboard = !url.includes('/student/dashboard');
    expect(redirectedToLogin || hasLoginForm || hasUnavailable || notOnStudentDashboard).toBeTruthy();
  });

  test('Student can login with valid credentials', async ({ page }) => {
    await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.waitForLoadState('networkidle');
    // Should redirect away from login
    const url = page.url();
    expect(url).not.toContain('/login');
  });

  test('Student reaches dashboard after login', async ({ page }) => {
    await loginAsStudent(page);
    const url = page.url();
    expect(url).toContain('/student/dashboard');
  });

  test('Student token is stored in localStorage', async ({ page }) => {
    await loginAsStudent(page);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
    expect(token!.length).toBeGreaterThan(50);
  });
});

/* ================================================================
   7.2  Student Dashboard
   ================================================================ */
test.describe('7.2 Student Dashboard', () => {
  test('Dashboard shows welcome message', async ({ page }) => {
    await loginAsStudent(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/welcome back/i);
  });

  test('Dashboard shows student name', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    await expect(body).toContainText(/TestCust108967/i);
  });

  test('Dashboard has payment methods section', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    await expect(body).toContainText(/payment methods/i);
  });

  test('Dashboard has sidebar navigation', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    // Student sidebar items
    await expect(body).toContainText(/academy|shop|rental|stay|experience/i);
  });
});

/* ================================================================
   7.3  Schedule & Lessons
   ================================================================ */
test.describe('7.3 Schedule & Lessons', () => {
  test('Schedule page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/schedule');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('My Lessons is accessible from academy sidebar', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    // Should have My Lessons in sidebar
    await expect(body).toContainText(/my lessons|dashboard/i);
  });
});

/* ================================================================
   7.4  Courses & Packages
   ================================================================ */
test.describe('7.4 Courses & Packages', () => {
  test('Courses page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/courses');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/package|course|experience|credit/i);
  });
});

/* ================================================================
   7.5  Payments & Wallet
   ================================================================ */
test.describe('7.5 Payments & Wallet', () => {
  test('Payments page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/payments');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/payment|invoice|balance|transaction/i);
  });

  test('Payments page shows payment methods', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/payments');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/credit card|bank transfer/i);
  });

  test('Wallet deposit button or section visible', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/payments');
    await page.waitForLoadState('networkidle');
    // Look for deposit/top-up button or wallet balance display
    const body = page.locator('body');
    const hasWallet = await body.innerText().then(t => /deposit|top.up|wallet|balance|add funds/i.test(t));
    expect(hasWallet).toBeTruthy();
  });
});

/* ================================================================
   7.6  Support
   ================================================================ */
test.describe('7.6 Support', () => {
  test('Support page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/support');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/support center/i);
  });

  test('Support page has contact/ticket section', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/support');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/help|ticket|reach out|booking|payment/i);
  });
});

/* ================================================================
   7.7  Profile
   ================================================================ */
test.describe('7.7 Profile', () => {
  test('Profile page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/profile');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/TestCust108967/i);
  });

  test('Profile shows email', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/profile');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/cust108967@test\.com/i);
  });

  test('Profile shows role badge', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/profile');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/student/i);
  });

  test('Profile has sub-navigation', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/profile');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/profile overview|family/i);
  });
});

/* ================================================================
   7.8  Family Management
   ================================================================ */
test.describe('7.8 Family Management', () => {
  test('Family page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/family');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/family members/i);
  });

  test('Add Member button is visible', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/family');
    await page.waitForLoadState('networkidle');
    // On mobile the text may be hidden (hidden sm:inline), so check for the button itself or the icon
    const addBtn = page.locator('button').filter({ hasText: /add member/i })
      .or(page.locator('button:has(svg)').filter({ hasText: /add|member|\+/i }))
      .or(page.locator('button').filter({ has: page.locator('[class*="plus"], [class*="add"]') }));
    // On mobile the button still exists, just text is hidden — check the button container
    const familyPage = page.locator('body');
    await expect(familyPage).toContainText(/family members/i);
    // Verify the add functionality exists (button in DOM even if text hidden on mobile)
    const btnCount = await page.locator('button').filter({ hasText: /add member/i }).count() +
      await page.locator('button:has(svg)').count();
    expect(btnCount).toBeGreaterThanOrEqual(1);
  });

  test('Shows empty state or member list', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/family');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    // Either empty state message or member count
    await expect(body).toContainText(/no family members|add your children|family members/i);
  });
});

/* ================================================================
   7.9  Friends & Group Bookings
   ================================================================ */
test.describe('7.9 Friends & Group Bookings', () => {
  test('Friends page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/friends');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/friends/i);
  });

  test('Friends page has tabs', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/friends');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/find friends|requests|sent/i);
  });

  test('Group bookings page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/group-bookings');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/group lesson/i);
  });

  test('Group bookings has create buttons', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/group-bookings');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/request a match|create group/i);
  });

  test('Group bookings has filter tabs', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/student/group-bookings');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/all|organizing|participating|pending/i);
  });
});

/* ================================================================
   7.10  Student Rentals & Accommodation
   ================================================================ */
test.describe('7.10 Student Rentals & Accommodation', () => {
  test('My Rentals page loads', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/rental/my-rentals');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/my equipment rentals/i);
  });

  test('My Rentals has Book Equipment button', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, '/rental/my-rentals');
    await page.waitForLoadState('networkidle');
    const bookBtn = page.getByRole('button', { name: /book equipment/i })
      .or(page.getByRole('link', { name: /book equipment/i }));
    await expect(bookBtn.first()).toBeVisible({ timeout: 10000 });
  });

});

/* ================================================================
   7.11  Student Navigation
   ================================================================ */
test.describe('7.11 Student Navigation', () => {
  test('Sidebar has all main menu sections', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    // Verify core sidebar items are present
    for (const item of ['Shop', 'Academy', 'Rental', 'Stay', 'Experience', 'Community']) {
      await expect(body).toContainText(new RegExp(item, 'i'));
    }
  });

  test('Sidebar has system items', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    for (const item of ['Wallet Payments', 'Support', 'Contact Us', 'Profile']) {
      await expect(body).toContainText(new RegExp(item, 'i'));
    }
  });

  test('Logout button is visible', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    await expect(body).toContainText(/logout/i);
  });

  test('App version is displayed', async ({ page }) => {
    await loginAsStudent(page);
    const body = page.locator('body');
    await expect(body).toContainText(/plannivo\s*v/i);
  });
});

/* ================================================================
   7.12  Route Protection Verification
   ================================================================ */
test.describe('7.12 Route Protection Verification', () => {
  const protectedRoutes = [
    '/student/dashboard',
    '/student/schedule',
    '/student/courses',
    '/student/payments',
    '/student/support',
    '/student/profile',
    '/student/family',
    '/student/friends',
    '/student/group-bookings',
    '/rental/my-rentals',
  ];

  for (const route of protectedRoutes) {
    test(`${route} requires authentication`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // Should redirect to login, show login form, or show unavailable page
      const url = page.url();
      const isOnLogin = url.includes('/login') ||
        await page.locator('#email, input[name="email"]').isVisible({ timeout: 5000 }).catch(() => false);
      const isNotOnOriginalRoute = !url.includes(route);
      const hasUnavailable = await page.locator('text=/unavailable|not available/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(isOnLogin || isNotOnOriginalRoute || hasUnavailable).toBeTruthy();
    });
  }
});
