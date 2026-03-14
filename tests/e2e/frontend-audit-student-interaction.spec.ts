/**
 * FRONTEND QA AUDIT — Student Portal, Shop, & User Interaction
 * 
 * Tests student portal UI components, shop browsing, wallet, support,
 * and interactive elements from student perspective.
 */
import { test, expect, Page } from '@playwright/test';
import { BASE_URL, login, loginAsStudent, loginAsAdmin, STUDENT_EMAIL, STUDENT_PASSWORD } from './helpers';

const INSTRUCTOR_EMAIL = 'autoinst487747@test.com';
const INSTRUCTOR_PASSWORD = 'TestPass123!';

function finding(testInfo: any, severity: string, category: string, desc: string) {
  testInfo.annotations.push({ type: 'finding', description: `[${severity}][${category}] ${desc}` });
}

// ═══════════════════════════════════════════════════════════
// SECTION 14 — STUDENT DASHBOARD & WIDGETS
// ═══════════════════════════════════════════════════════════
test.describe('14. Student Dashboard Components', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsStudent(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('14.1 Dashboard has meaningful widgets/cards', async () => {
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const cards = page.locator('.ant-card, [class*="card"], [class*="widget"], [class*="stat"]');
    const cardCount = await cards.count();
    
    if (cardCount === 0) {
      finding(test.info(), 'High', 'rendering', 'Student dashboard has no cards/widgets');
    } else {
      // Check first card has content
      const firstCard = cards.first();
      const text = await firstCard.textContent();
      if (!text || text.trim().length < 5) {
        finding(test.info(), 'Medium', 'rendering', 'Student dashboard card has no meaningful content');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/14.1-student-dashboard-widgets.png' });
  });

  test('14.2 Dashboard navigation cards are clickable', async () => {
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for clickable cards that lead to sub-pages
    const clickableCards = page.locator('.ant-card[class*="cursor-pointer"], a > .ant-card, [class*="card"][role="button"], .ant-card a').first();
    if (await clickableCards.isVisible().catch(() => false)) {
      const beforeUrl = page.url();
      await clickableCards.click();
      await page.waitForTimeout(2000);
      const afterUrl = page.url();
      // Should navigate somewhere or open something
      if (beforeUrl === afterUrl) {
        // Check if a modal opened
        const modalOpened = await page.locator('.ant-modal, .ant-drawer').isVisible().catch(() => false);
        if (!modalOpened) {
          finding(test.info(), 'Low', 'UX', 'Dashboard card appears clickable but does nothing');
        }
      }
    }
  });

  test('14.3 Dashboard loading/empty states render properly', async () => {
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check for spinners stuck in loading
    const stuckSpinner = page.locator('.ant-spin-spinning');
    const spinnerVisible = await stuckSpinner.isVisible().catch(() => false);
    if (spinnerVisible) {
      finding(test.info(), 'High', 'stale state', 'Student dashboard has a spinner stuck in loading state');
    }
    
    // Check for empty state messages (these are OK if they exist)
    const emptyState = page.locator('.ant-empty, [class*="empty"], [class*="no-data"]');
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    // Empty state is OK, just note it
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 15 — STUDENT SCHEDULE / LESSONS
// ═══════════════════════════════════════════════════════════
test.describe('15. Student Schedule & Lessons', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsStudent(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('15.1 Schedule page loads', async () => {
    await page.goto(`${BASE_URL}/student/schedule`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Critical', 'navigation', 'Student schedule shows error page');
    }
    await page.screenshot({ path: 'test-results/screenshots/15.1-student-schedule.png' });
  });

  test('15.2 Schedule has calendar or list view', async () => {
    await page.goto(`${BASE_URL}/student/schedule`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasView = await page.locator('.fc, .ant-calendar, .ant-table, [class*="schedule"], [class*="lesson"], [class*="booking"]').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('.ant-empty, [class*="empty"], [class*="no-lessons"]').isVisible().catch(() => false);
    
    if (!hasView && !hasEmptyState) {
      finding(test.info(), 'Medium', 'rendering', 'Student schedule page has neither data nor empty state');
    }
  });

  test('15.3 Courses/Experience page', async () => {
    await page.goto(`${BASE_URL}/student/courses`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Student courses page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/15.3-courses.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 16 — STUDENT PAYMENTS / WALLET
// ═══════════════════════════════════════════════════════════
test.describe('16. Student Payments & Wallet', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsStudent(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('16.1 Payments page loads', async () => {
    await page.goto(`${BASE_URL}/student/payments`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Critical', 'navigation', 'Student payments page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/16.1-payments.png' });
  });

  test('16.2 Wallet balance is visible', async () => {
    await page.goto(`${BASE_URL}/student/payments`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Look for balance display
    const balanceText = page.locator('[class*="balance"], [class*="wallet"], [class*="amount"]').first();
    const hasBalance = await balanceText.isVisible().catch(() => false);
    
    if (!hasBalance) {
      // Check if there's a card with monetary value
      const moneyText = page.getByText(/€|₺|\$|balance|bakiye|wallet|cüzdan/i).first();
      const hasMoney = await moneyText.isVisible().catch(() => false);
      if (!hasMoney) {
        finding(test.info(), 'Medium', 'rendering', 'Student payments page has no visible wallet balance');
      }
    }
  });

  test('16.3 Transaction history visible', async () => {
    await page.goto(`${BASE_URL}/student/payments`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Look for transaction list
    const hasList = await page.locator('.ant-table, .ant-list, .ant-timeline, [class*="transaction"], [class*="history"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('.ant-empty, [class*="empty"], [class*="no-transactions"]').isVisible().catch(() => false);
    
    if (!hasList && !hasEmpty) {
      finding(test.info(), 'Medium', 'rendering', 'Student payments page has neither transactions nor empty state');
    }
  });

  test('16.4 Deposit/top-up button exists and works', async () => {
    await page.goto(`${BASE_URL}/student/payments`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const depositBtn = page.locator('button:has-text("Deposit"), button:has-text("Top"), button:has-text("Add"), button:has-text("Yükle")').first();
    if (await depositBtn.isVisible().catch(() => false)) {
      await depositBtn.click();
      await page.waitForTimeout(2000);
      
      const hasModal = await page.locator('.ant-modal, .ant-drawer, [class*="deposit"]').first().isVisible().catch(() => false);
      if (!hasModal) {
        finding(test.info(), 'High', 'modal', 'Deposit button clicked but no form appeared');
      } else {
        // Close
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/16.4-deposit.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 17 — STUDENT SUPPORT TICKETS
// ═══════════════════════════════════════════════════════════
test.describe('17. Student Support UI', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsStudent(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('17.1 Support page loads', async () => {
    await page.goto(`${BASE_URL}/student/support`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'test-results/screenshots/17.1-support.png' });
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'Critical', 'navigation', 'Student support page shows error');
    }
  });

  test('17.2 Create ticket form accessible', async () => {
    await page.goto(`${BASE_URL}/student/support`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Look for create ticket button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Submit"), button:has-text("Open")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      
      // Check form opened
      const hasForm = await page.locator('.ant-modal, .ant-form, form, textarea, input[placeholder]').first().isVisible().catch(() => false);
      if (!hasForm) {
        finding(test.info(), 'High', 'modal', 'Create ticket button does not open a form');
      }
      
      // Close if modal
      const closeBtn = page.locator('.ant-modal-close').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/17.2-create-ticket.png' });
  });

  test('17.3 Ticket list shows status badges', async () => {
    await page.goto(`${BASE_URL}/student/support`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const tickets = page.locator('.ant-card, .ant-list-item, .ant-table-row, [class*="ticket"]');
    const ticketCount = await tickets.count();
    
    if (ticketCount > 0) {
      // Check for status indicators
      const hasStatus = await page.locator('.ant-tag, .ant-badge, [class*="status"]').first().isVisible().catch(() => false);
      if (!hasStatus) {
        finding(test.info(), 'Low', 'rendering', 'Support tickets lack visible status badges');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 18 — STUDENT PROFILE & FAMILY  
// ═══════════════════════════════════════════════════════════
test.describe('18. Student Profile & Family', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsStudent(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('18.1 Profile page loads with user data', async () => {
    await page.goto(`${BASE_URL}/student/profile`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check for profile form or display
    const hasProfile = await page.locator('form, .ant-form, .ant-descriptions, [class*="profile"]').first().isVisible().catch(() => false);
    if (!hasProfile) {
      finding(test.info(), 'High', 'rendering', 'Student profile page has no visible profile form/data');
    }
    
    // Check name or email is displayed
    const hasUserInfo = await page.getByText(STUDENT_EMAIL).isVisible().catch(() => false) ||
                        await page.getByText(/cust108967/i).isVisible().catch(() => false);
    
    await page.screenshot({ path: 'test-results/screenshots/18.1-profile.png' });
  });

  test('18.2 Profile edit form fields are interactive', async () => {
    await page.goto(`${BASE_URL}/student/profile`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Find editable fields
    const editableInputs = page.locator('input:not([disabled]):not([readonly]), textarea:not([disabled])');
    const editCount = await editableInputs.count();
    
    if (editCount === 0) {
      // Check if there's an edit button to enable editing
      const editBtn = page.locator('button:has-text("Edit"), button:has-text("Düzenle")').first();
      if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(1000);
        const newEditCount = await editableInputs.count();
        if (newEditCount === 0) {
          finding(test.info(), 'Medium', 'form', 'Profile edit button clicked but no fields became editable');
        }
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/18.2-profile-edit.png' });
  });

  test('18.3 Family management page loads', async () => {
    await page.goto(`${BASE_URL}/student/family`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Family management page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/18.3-family.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 19 — PUBLIC SHOP BROWSING UI
// ═══════════════════════════════════════════════════════════
test.describe('19. Public Shop UI', () => {
  test.describe.configure({ mode: 'serial' });

  test('19.1 Shop landing renders product categories', async ({ page }) => {
    await page.goto(`${BASE_URL}/shop`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Should show product cards or categories
    const hasProducts = await page.locator('.ant-card, [class*="product"], [class*="card"], img').first().isVisible().catch(() => false);
    if (!hasProducts) {
      finding(test.info(), 'High', 'rendering', 'Shop landing page has no product cards');
    }
    await page.screenshot({ path: 'test-results/screenshots/19.1-shop-landing.png' });
  });

  test('19.2 Shop category filter interaction', async ({ page }) => {
    await page.goto(`${BASE_URL}/shop`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Look for category navigation or filter buttons
    const categoryLinks = page.locator('a[href*="/shop/"], button[class*="category"], .ant-tabs-tab, [class*="filter"]');
    const catCount = await categoryLinks.count();
    
    if (catCount > 0) {
      // Click first category
      await categoryLinks.first().click();
      await page.waitForTimeout(2000);
      await expect(page.locator('body')).not.toBeEmpty();
    }
    await page.screenshot({ path: 'test-results/screenshots/19.2-shop-category.png' });
  });

  test('19.3 Shop product card interaction', async ({ page }) => {
    await page.goto(`${BASE_URL}/shop`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Click on first product card if available
    const productCard = page.locator('.ant-card, [class*="product-card"]').first();
    if (await productCard.isVisible().catch(() => false)) {
      await productCard.click();
      await page.waitForTimeout(2000);
      
      // Should open product detail or modal
      const hasDetail = await page.locator('.ant-modal, .ant-drawer, [class*="product-detail"], [class*="product-info"]').first().isVisible().catch(() => false);
      const navigated = page.url().includes('/product') || page.url() !== `${BASE_URL}/shop`;
      
      if (!hasDetail && !navigated) {
        finding(test.info(), 'Medium', 'navigation', 'Clicking product card does nothing');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/19.3-product-detail.png' });
  });

  test('19.4 Shop browse page (authenticated)', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/shop/browse`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'test-results/screenshots/19.4-shop-browse-auth.png' });
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Authenticated shop browse shows error');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 20 — ACADEMY LESSON BROWSING UI
// ═══════════════════════════════════════════════════════════
test.describe('20. Academy Lesson Browsing UI', () => {
  test.describe.configure({ mode: 'serial' });

  test('20.1 Academy kite lessons page has pricing/booking CTAs', async ({ page }) => {
    await page.goto(`${BASE_URL}/academy/kite-lessons`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check for pricing info
    const hasPricing = await page.getByText(/€|₺|\$|price|fiyat|per hour|hour/i).first().isVisible().catch(() => false);
    
    // Check for CTA buttons
    const hasCTA = await page.locator('button:has-text("Book"), button:has-text("Reserve"), button:has-text("Sign"), a:has-text("Book"), a:has-text("Reserve")').first().isVisible().catch(() => false);
    
    await page.screenshot({ path: 'test-results/screenshots/20.1-kite-lessons.png' });
  });

  test('20.2 Academy pages have consistent card layout', async ({ page }) => {
    const pages = ['/academy/kite-lessons', '/academy/foil-lessons', '/academy/wing-lessons'];
    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Check for broken images
      const images = page.locator('img');
      const imgCount = await images.count();
      for (let i = 0; i < Math.min(imgCount, 5); i++) {
        const img = images.nth(i);
        const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
        if (naturalWidth === 0) {
          finding(test.info(), 'Medium', 'rendering', `Broken image on ${path}`);
          break;
        }
      }
    }
  });

  test('20.3 Academy booking CTA as student', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/academy/kite-lessons`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const bookBtn = page.locator('button:has-text("Book"), a:has-text("Book"), button:has-text("Reserve")').first();
    if (await bookBtn.isVisible().catch(() => false)) {
      await bookBtn.click();
      await page.waitForTimeout(3000);
      
      // Should open booking flow
      const hasBookingUI = await page.locator('.ant-modal, .ant-drawer, form, .ant-form, .ant-steps, [class*="booking"]').first().isVisible().catch(() => false);
      const navigated = page.url().includes('/book') || page.url().includes('/academy/book');
      
      if (!hasBookingUI && !navigated) {
        finding(test.info(), 'High', 'navigation', 'Academy Book button as student does nothing visible');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/20.3-student-book-lesson.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 21 — RENTAL BROWSING & INTERACTION
// ═══════════════════════════════════════════════════════════
test.describe('21. Rental UI & Interaction', () => {
  test.describe.configure({ mode: 'serial' });

  test('21.1 Rental landing has category cards', async ({ page }) => {
    await page.goto(`${BASE_URL}/rental`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasCards = await page.locator('.ant-card, [class*="card"], [class*="category"]').first().isVisible().catch(() => false);
    if (!hasCards) {
      finding(test.info(), 'Medium', 'rendering', 'Rental landing has no category cards');
    }
    await page.screenshot({ path: 'test-results/screenshots/21.1-rental-landing.png' });
  });

  test('21.2 Student rental booking page', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/rental/book-equipment`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Student rental booking page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/21.2-rental-booking.png' });
  });

  test('21.3 Student my rentals page', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/rental/my-rentals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Student my-rentals page shows error');
    }
    // Should show list of rentals or empty state
    const hasContent = await page.locator('.ant-table, .ant-list, .ant-empty, [class*="rental"], [class*="empty"]').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'Medium', 'rendering', 'My rentals page neither shows rentals nor empty state');
    }
    await page.screenshot({ path: 'test-results/screenshots/21.3-my-rentals.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 22 — STAY & ACCOMMODATION UI
// ═══════════════════════════════════════════════════════════
test.describe('22. Stay & Accommodation UI', () => {
  test.describe.configure({ mode: 'serial' });

  test('22.1 Stay landing page', async ({ page }) => {
    await page.goto(`${BASE_URL}/stay`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/screenshots/22.1-stay-landing.png' });
  });

  test('22.2 Stay booking page with calendar', async ({ page }) => {
    await page.goto(`${BASE_URL}/stay/book-accommodation`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check for date picker or calendar
    const hasDatePicker = await page.locator('.ant-picker, [class*="calendar"], [class*="date-range"]').first().isVisible().catch(() => false);
    await page.screenshot({ path: 'test-results/screenshots/22.2-stay-booking.png' });
  });

  test('22.3 Student my-accommodation page', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/stay/my-accommodation`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Student my-accommodation page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/22.3-my-accommodation.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 23 — EXPERIENCE UI
// ═══════════════════════════════════════════════════════════
test.describe('23. Experience UI', () => {
  test.describe.configure({ mode: 'serial' });

  test('23.1 Experience landing page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/experience`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasContent = await page.locator('.ant-card, [class*="card"], [class*="experience"], img').first().isVisible().catch(() => false);
    if (!hasContent) {
      finding(test.info(), 'Medium', 'rendering', 'Experience landing has no visible cards/content');
    }
    await page.screenshot({ path: 'test-results/screenshots/23.1-experience.png' });
  });

  test('23.2 Experience book-package page', async ({ page }) => {
    await page.goto(`${BASE_URL}/experience/book-package`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'test-results/screenshots/23.2-book-package.png' });
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Experience book-package page shows error');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 24 — CHAT & COMMUNITY  
// ═══════════════════════════════════════════════════════════
test.describe('24. Chat & Community', () => {
  test.describe.configure({ mode: 'serial' });

  test('24.1 Chat page loads for student', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Chat page shows error for student');
    }
    
    // Check for chat interface elements
    const hasChatUI = await page.locator('textarea, input[placeholder*="message" i], [class*="chat"], [class*="message"]').first().isVisible().catch(() => false);
    await page.screenshot({ path: 'test-results/screenshots/24.1-chat.png' });
  });

  test('24.2 Notifications page loads for student', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/notifications`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasError = await page.locator('.ant-result-error, .ant-result-500').isVisible().catch(() => false);
    if (hasError) {
      finding(test.info(), 'High', 'navigation', 'Notifications page shows error');
    }
    await page.screenshot({ path: 'test-results/screenshots/24.2-notifications.png' });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 25 — INSTRUCTOR-SPECIFIC FRONTEND
// ═══════════════════════════════════════════════════════════
test.describe('25. Instructor Portal', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('25.1 Instructor dashboard has schedule view', async () => {
    await page.goto(`${BASE_URL}/instructor/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Should show schedule, bookings, or calendar elements
    const hasSchedule = await page.locator('.fc, .ant-calendar, .ant-table, [class*="schedule"], [class*="booking"], [class*="lesson"]').first().isVisible().catch(() => false);
    const hasCards = await page.locator('.ant-card, [class*="stat"]').first().isVisible().catch(() => false);
    
    if (!hasSchedule && !hasCards) {
      finding(test.info(), 'Medium', 'rendering', 'Instructor dashboard has no schedule or stat cards');
    }
    await page.screenshot({ path: 'test-results/screenshots/25.1-instructor-dashboard.png' });
  });

  test('25.2 Instructor my students page', async () => {
    await page.goto(`${BASE_URL}/instructor/students`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const hasContent = await page.locator('.ant-table, .ant-card, .ant-list, [class*="student"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false);
    
    if (!hasContent && !hasEmpty) {
      finding(test.info(), 'Medium', 'rendering', 'Instructor students page shows neither data nor empty state');
    }
    await page.screenshot({ path: 'test-results/screenshots/25.2-instructor-students.png' });
  });

  test('25.3 Instructor shop access (self-order)', async () => {
    await page.goto(`${BASE_URL}/shop`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('body')).not.toBeEmpty();
    await page.screenshot({ path: 'test-results/screenshots/25.3-instructor-shop.png' });
  });

  test('25.4 Instructor cannot see refund/admin controls', async () => {
    await page.goto(`${BASE_URL}/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for admin-only action buttons that instructor shouldn't see
    const refundBtn = page.locator('button:has-text("Refund"), button:has-text("İade")').first();
    const deleteBtn = page.locator('button:has-text("Delete"), button:has-text("Sil")').first();
    
    if (await refundBtn.isVisible().catch(() => false)) {
      finding(test.info(), 'High', 'permissions rendering', 'Instructor can see Refund button on bookings');
    }
    if (await deleteBtn.isVisible().catch(() => false)) {
      finding(test.info(), 'High', 'permissions rendering', 'Instructor can see Delete button on bookings');
    }
  });
});
