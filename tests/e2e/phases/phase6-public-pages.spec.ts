/**
 * Phase 6 — Public Pages
 *
 * Tests all publicly-accessible pages (no auth required):
 *   6.1  Home & Guest Landing
 *   6.2  Academy Pages (landing + sub-routes)
 *   6.3  Rental Public Pages
 *   6.4  Shop Pages
 *   6.5  Stay / Accommodation Pages
 *   6.6  Experience Pages
 *   6.7  Care / Repair Page
 *   6.8  Community & Members
 *   6.9  Help & Contact
 *   6.10 Route Accessibility Verification
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, navigateTo, expectPageLoaded, waitForLoading } from '../helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await new Promise(r => setTimeout(r, 2500)); });

/* ================================================================
   6.1  Home & Guest Landing
   ================================================================ */
test.describe('6.1 Home & Guest Landing', () => {
  test('Home page loads with branding', async ({ page }) => {
    await navigateTo(page, '/');
    await expectPageLoaded(page);
    // Expect some branding text visible
    const body = page.locator('body');
    await expect(body).toContainText(/UKC|plannivo|duotone|pro center|enter/i);
  });

  test('Home page has a CTA to guest landing', async ({ page }) => {
    await navigateTo(page, '/');
    // Look for a link/button that leads to /guest or contains "Enter"
    const cta = page.locator('a[href*="/guest"], button:has-text("Enter"), a:has-text("Enter")').first();
    await expect(cta).toBeVisible({ timeout: 10000 });
  });

  test('Guest landing page loads', async ({ page }) => {
    await navigateTo(page, '/guest');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const main = page.locator('main, #root, body');
    await expect(main.first()).toContainText(/academy|rental|shop|stay|experience|care|member|community/i);
  });

  test('Guest landing has service cards', async ({ page }) => {
    await navigateTo(page, '/guest');
    await page.waitForLoadState('networkidle');
    // Should show service bento cards linking to feature areas
    const links = page.locator('a[href*="/academy"], a[href*="/rental"], a[href*="/shop"], a[href*="/stay"], a[href*="/experience"], a[href*="/care"]');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

/* ================================================================
   6.2  Academy Pages
   ================================================================ */
test.describe('6.2 Academy Pages', () => {
  test('Academy landing page loads', async ({ page }) => {
    await navigateTo(page, '/academy');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const content = page.locator('main, #root, [class*="academy"], [class*="landing"]').first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test('Academy landing has lesson category navigation', async ({ page }) => {
    await navigateTo(page, '/academy');
    await page.waitForLoadState('networkidle');
    // Sticky tabs or links: KITE, FOIL, WING, E-FOIL, PREMIUM
    const body = page.locator('body');
    await expect(body).toContainText(/kite|foil|wing|lesson/i);
  });

  const academySubpages = [
    { name: 'Kite Lessons', path: '/academy/kite-lessons' },
    { name: 'Foil Lessons', path: '/academy/foil-lessons' },
    { name: 'Wing Lessons', path: '/academy/wing-lessons' },
    { name: 'E-Foil Lessons', path: '/academy/efoil-lessons' },
    { name: 'Premium Lessons', path: '/academy/premium-lessons' },
  ];

  for (const sub of academySubpages) {
    test(`${sub.name} page loads (${sub.path})`, async ({ page }) => {
      await navigateTo(page, sub.path);
      await expectPageLoaded(page);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);
      const body = page.locator('body');
      // Should have lesson/package content or at least not be blank
      const text = await body.innerText();
      expect(text.length).toBeGreaterThan(50);
    });
  }
});

/* ================================================================
   6.3  Rental Public Pages
   ================================================================ */
test.describe('6.3 Rental Public Pages', () => {
  test('Rental landing page loads', async ({ page }) => {
    await navigateTo(page, '/rental');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/rental|equipment|standard|sls|d-lab|e-foil/i);
  });

  const rentalSubpages = [
    { name: 'Standard Rentals', path: '/rental/standard' },
    { name: 'SLS Rentals', path: '/rental/sls' },
    { name: 'D-LAB Rentals', path: '/rental/dlab' },
    { name: 'E-Foil Rentals', path: '/rental/efoil' },
    { name: 'Book Equipment', path: '/rental/book-equipment' },
  ];

  for (const sub of rentalSubpages) {
    test(`${sub.name} page loads (${sub.path})`, async ({ page }) => {
      await navigateTo(page, sub.path);
      await expectPageLoaded(page);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);
      const body = page.locator('body');
      const text = await body.innerText();
      expect(text.length).toBeGreaterThan(50);
    });
  }
});

/* ================================================================
   6.4  Shop Pages
   ================================================================ */
test.describe('6.4 Shop Pages', () => {
  test('Shop landing page loads', async ({ page }) => {
    await navigateTo(page, '/shop');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/shop|product|categor|browse|kiteboard|wing|foil|ion|secondwind/i);
  });

  test('Shop browse page loads', async ({ page }) => {
    await navigateTo(page, '/shop/browse');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    await waitForLoading(page);
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });
});

/* ================================================================
   6.5  Stay / Accommodation Pages
   ================================================================ */
test.describe('6.5 Stay / Accommodation Pages', () => {
  test('Stay landing page loads', async ({ page }) => {
    await navigateTo(page, '/stay');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/stay|accommodation|hotel|home|room|book/i);
  });

  const staySubpages = [
    { name: 'Hotel', path: '/stay/hotel' },
    { name: 'Home', path: '/stay/home' },
    { name: 'Book Accommodation', path: '/stay/book-accommodation' },
  ];

  for (const sub of staySubpages) {
    test(`Stay ${sub.name} page loads (${sub.path})`, async ({ page }) => {
      await navigateTo(page, sub.path);
      await expectPageLoaded(page);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);
      const body = page.locator('body');
      const text = await body.innerText();
      expect(text.length).toBeGreaterThan(50);
    });
  }
});

/* ================================================================
   6.6  Experience Pages
   ================================================================ */
test.describe('6.6 Experience Pages', () => {
  test('Experience landing page loads', async ({ page }) => {
    await navigateTo(page, '/experience');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/experience|package|kite|wing|downwind|camp/i);
  });

  const experienceSubpages = [
    { name: 'Kite Packages', path: '/experience/kite-packages' },
    { name: 'Wing Packages', path: '/experience/wing-packages' },
    { name: 'Downwinders', path: '/experience/downwinders' },
    { name: 'Camps', path: '/experience/camps' },
    { name: 'Book Package', path: '/experience/book-package' },
  ];

  for (const sub of experienceSubpages) {
    test(`${sub.name} page loads (${sub.path})`, async ({ page }) => {
      await navigateTo(page, sub.path);
      await expectPageLoaded(page);
      await page.waitForLoadState('networkidle');
      await waitForLoading(page);
      const body = page.locator('body');
      const text = await body.innerText();
      expect(text.length).toBeGreaterThan(50);
    });
  }
});

/* ================================================================
   6.7  Care / Repair Page
   ================================================================ */
test.describe('6.7 Care / Repair Page', () => {
  test('Care landing page loads', async ({ page }) => {
    await navigateTo(page, '/care');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/care|repair|submit|track|equipment|request/i);
  });

  test('Care page has submit request form', async ({ page }) => {
    await navigateTo(page, '/care');
    await page.waitForLoadState('networkidle');
    // Should have form fields for repair request
    const formElements = page.locator('input, textarea, select, [role="combobox"]');
    const count = await formElements.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Care page has tracking section', async ({ page }) => {
    await navigateTo(page, '/care');
    await page.waitForLoadState('networkidle');
    // Should have a way to track existing requests
    const body = page.locator('body');
    await expect(body).toContainText(/track|status|lookup|code|token/i);
  });
});

/* ================================================================
   6.8  Community & Members
   ================================================================ */
test.describe('6.8 Community & Members', () => {
  test('Members offerings page loads', async ({ page }) => {
    await navigateTo(page, '/members/offerings');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Community team page loads', async ({ page }) => {
    await navigateTo(page, '/community/team');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('Events page loads', async ({ page }) => {
    await navigateTo(page, '/services/events');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });
});

/* ================================================================
   6.9  Help & Contact
   ================================================================ */
test.describe('6.9 Help & Contact', () => {
  test('Help page loads', async ({ page }) => {
    await navigateTo(page, '/help');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/help|support|faq|guide|question/i);
  });

  test('Help page has searchable content', async ({ page }) => {
    await navigateTo(page, '/help');
    await page.waitForLoadState('networkidle');
    // Look for a search bar or FAQ accordion
    const searchOrFaq = page.locator('input[type="search"], input[placeholder*="search" i], .ant-collapse, [class*="accordion"], [class*="faq"]').first();
    const faqText = page.locator('body');
    // Either search input or FAQ content
    const hasSearch = await searchOrFaq.isVisible().catch(() => false);
    const hasFaqContent = await faqText.innerText().then(t => /booking|payment|service|how|what/i.test(t));
    expect(hasSearch || hasFaqContent).toBeTruthy();
  });

  test('Contact page loads', async ({ page }) => {
    await navigateTo(page, '/contact');
    await expectPageLoaded(page);
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/contact|whatsapp|email|phone|instagram/i);
  });

  test('Contact page has communication channels', async ({ page }) => {
    await navigateTo(page, '/contact');
    await page.waitForLoadState('networkidle');
    // Should have clickable contact links/cards
    const channels = page.locator('a[href*="whatsapp"], a[href*="mailto"], a[href*="instagram"], a[href*="tel:"]');
    const count = await channels.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================
   6.10  Route Accessibility Verification
   ================================================================ */
test.describe('6.10 Route Accessibility Verification', () => {
  const publicRoutes = [
    '/',
    '/guest',
    '/academy',
    '/academy/kite-lessons',
    '/academy/foil-lessons',
    '/academy/wing-lessons',
    '/academy/efoil-lessons',
    '/academy/premium-lessons',
    '/rental',
    '/rental/standard',
    '/rental/sls',
    '/rental/dlab',
    '/rental/efoil',
    '/rental/book-equipment',
    '/shop',
    '/shop/browse',
    '/stay',
    '/stay/hotel',
    '/stay/home',
    '/stay/book-accommodation',
    '/experience',
    '/experience/kite-packages',
    '/experience/wing-packages',
    '/experience/downwinders',
    '/experience/camps',
    '/experience/book-package',
    '/care',
    '/members/offerings',
    '/community/team',
    '/services/events',
    '/help',
    '/contact',
  ];

  for (const route of publicRoutes) {
    test(`Public route ${route} accessible without login`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${route}`);
      // Should not redirect to login
      const url = page.url();
      expect(url).not.toContain('/login');
      // Should get a valid response (not 5xx)
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
      await page.waitForLoadState('domcontentloaded');
      const body = page.locator('body');
      await expect(body).not.toBeEmpty();
    });
  }
});
