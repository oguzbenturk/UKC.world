import { test, expect } from '@playwright/test';

test.describe('Navbar centering analysis', () => {
  test('screenshot navbar at mobile width and measure centering', async ({ browser }) => {
    // Create a context with mobile viewport (414px = iPhone XR-ish, common mobile width)
    const context = await browser.newContext({
      viewport: { width: 414, height: 896 },
      deviceScaleFactor: 2, // Retina display like user's phone
    });
    const page = await context.newPage();

    // Navigate to guest page
    await page.goto('/guest', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Let fonts and styles load

    // Screenshot the full page to see what user sees
    await page.screenshot({ path: 'tests/e2e/screenshots/fullpage-414.png', fullPage: false });
    
    // Screenshot the full navbar
    const navbar = page.locator('nav').first();
    await navbar.screenshot({ path: 'tests/e2e/screenshots/navbar-mobile-414.png' });

    // Now measure using clientWidth (which excludes scrollbar) vs innerWidth
    const measurements = await page.evaluate(() => {
      const nav = document.querySelector('nav');
      const navRect = nav.getBoundingClientRect();

      // Key: document.documentElement.clientWidth excludes scrollbar
      // window.innerWidth includes scrollbar
      const clientWidth = document.documentElement.clientWidth;
      const innerWidth = window.innerWidth;
      const scrollbarWidth = innerWidth - clientWidth;

      // Find the absolute center overlay
      const centerChildren = nav.children;
      let centerOverlay = null;
      for (let i = 0; i < centerChildren.length; i++) {
        const cs = getComputedStyle(centerChildren[i]);
        if (cs.position === 'absolute') {
          centerOverlay = centerChildren[i];
          break;
        }
      }
      const centerOverlayRect = centerOverlay ? centerOverlay.getBoundingClientRect() : null;

      // Find the branding (UKC.) link
      const navLinks = nav.querySelectorAll('a');
      let brandingRect = null;
      navLinks.forEach(link => {
        const text = link.textContent.trim();
        if ((text === 'UKC.' || text === 'UKC.Shop') && link.offsetWidth > 0) {
          const r = link.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            brandingRect = {
              left: r.left,
              right: r.right,
              width: r.width,
              centerX: r.left + r.width / 2,
              text: text
            };
          }
        }
      });

      // Find hamburger and sign in
      const hamburger = nav.querySelector('button[aria-label="Open sidebar"]');
      const hamburgerRect = hamburger ? hamburger.getBoundingClientRect() : null;
      
      let signInRect = null;
      nav.querySelectorAll('a, button').forEach(btn => {
        if (btn.textContent.includes('Sign In')) {
          signInRect = btn.getBoundingClientRect();
        }
      });

      // Check all positioned ancestors of nav
      let ancestors = [];
      let el = nav;
      while (el && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        ancestors.push({
          tag: el.tagName,
          class: el.className?.substring?.(0, 80) || '',
          width: el.getBoundingClientRect().width,
          left: el.getBoundingClientRect().left,
          position: cs.position,
          display: cs.display,
          overflow: cs.overflow
        });
        el = el.parentElement;
      }

      const visualCenter = clientWidth / 2; // True visual center (no scrollbar)

      return {
        innerWidth,
        clientWidth,
        scrollbarWidth,
        visualCenter,
        nav: { left: navRect.left, right: navRect.right, width: navRect.width },
        navCenter: navRect.left + navRect.width / 2,
        centerOverlay: centerOverlayRect ? { left: centerOverlayRect.left, right: centerOverlayRect.right, width: centerOverlayRect.width } : null,
        hamburger: hamburgerRect ? { left: hamburgerRect.left, right: hamburgerRect.right, width: hamburgerRect.width } : null,
        signIn: signInRect ? { left: signInRect.left, right: signInRect.right, width: signInRect.width } : null,
        branding: brandingRect,
        brandingOffsetFromVisualCenter: brandingRect ? (brandingRect.centerX - clientWidth / 2) : null,
        brandingOffsetFromNavCenter: brandingRect ? (brandingRect.centerX - (navRect.left + navRect.width / 2)) : null,
        ancestors: ancestors.slice(0, 5),
      };
    });

    console.log('\n========== NAVBAR CENTERING ANALYSIS ==========');
    console.log(`window.innerWidth: ${measurements.innerWidth}px`);
    console.log(`document.clientWidth: ${measurements.clientWidth}px`);
    console.log(`Scrollbar width: ${measurements.scrollbarWidth}px`);
    console.log(`Visual center (clientWidth/2): ${measurements.visualCenter}px`);
    console.log(`Nav: left=${measurements.nav.left}, right=${measurements.nav.right}, width=${measurements.nav.width}`);
    console.log(`Nav center: ${measurements.navCenter}px`);
    console.log('');
    console.log(`Center overlay: ${JSON.stringify(measurements.centerOverlay)}`);
    console.log(`Hamburger: ${JSON.stringify(measurements.hamburger)}`);
    console.log(`Sign In: ${JSON.stringify(measurements.signIn)}`);
    console.log(`Branding: ${JSON.stringify(measurements.branding)}`);
    console.log('');
    console.log(`Branding offset from VISUAL center: ${measurements.brandingOffsetFromVisualCenter?.toFixed(2)}px`);
    console.log(`Branding offset from NAV center: ${measurements.brandingOffsetFromNavCenter?.toFixed(2)}px`);
    console.log('');
    console.log('Ancestors (nav → html):');
    measurements.ancestors.forEach((a, i) => {
      console.log(`  ${i}: <${a.tag}> width=${a.width} left=${a.left} pos=${a.position} display=${a.display} class="${a.class}"`);
    });
    
    if (measurements.branding && measurements.hamburger && measurements.signIn) {
      const leftGap = measurements.branding.left - measurements.hamburger.right;
      const rightGap = measurements.signIn.left - measurements.branding.right;
      console.log('');
      console.log(`Space between hamburger right and UKC left: ${leftGap.toFixed(1)}px`);
      console.log(`Space between UKC right and SignIn left: ${rightGap.toFixed(1)}px`);
      console.log(`Difference: ${(leftGap - rightGap).toFixed(1)}px (positive = more space on left)`);
    }
    
    console.log('================================================\n');

    // Now add a red line at exact center of viewport for visual verification
    await page.evaluate(() => {
      const line = document.createElement('div');
      line.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-0.5px);width:1px;height:64px;background:red;z-index:99999;pointer-events:none';
      document.body.appendChild(line);
    });
    await navbar.screenshot({ path: 'tests/e2e/screenshots/navbar-with-centerline.png' });

    await context.close();
  });
});
