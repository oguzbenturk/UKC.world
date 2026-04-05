/**
 * API verification: log in as **manager** (default) or admin, resolve the **booking owner** by name search or env id,
 * complete their pending lesson rows, assert instructor earnings + (admin-only) manager commission rows.
 *
 * Booking owner: set `COMMISSION_E2E_STUDENT_ID` to a user uuid, or `COMMISSION_E2E_STUDENT_SEARCH` (default "Mehmet Ural")
 * to resolve via `GET /api/users/for-booking?q=…` using the **logged-in** JWT.
 *
 * Manager JWT is sufficient for: user search, GET/PUT `/bookings`, GET `/finances/instructor-earnings/:id`.
 * `/manager/commissions/admin/*` requires **admin** — the helper still logs in with TEST_ADMIN_EMAIL for that block only.
 *
 * UI login: COMMISSION_E2E_EMAIL / COMMISSION_E2E_PASSWORD, else TEST_MANAGER_EMAIL / TEST_MANAGER_PASSWORD.
 * Session dates: ACADEMY_KITE_BOOKING_DATES or default 2026-04-01..03. COMMISSION_VERIFY_EXPECTED_SESSIONS if fewer pending rows.
 * GET /bookings never returns status=pending_payment.
 *
 * Run:
 *   npx playwright test tests/e2e/User_browser_tests/commission-verify-package-bookings.spec.ts --project=chromium --workers=1
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, login, MANAGER_EMAIL, MANAGER_PASSWORD } from '../helpers';
import { dismissConsentWallIfPresent } from './shared/dismissConsentWall';
import { verifyCommissionsAfterQuickPackageBookings } from './shared/commissionVerification';

const COMMISSION_E2E_EMAIL = process.env.COMMISSION_E2E_EMAIL?.trim() || MANAGER_EMAIL;
const COMMISSION_E2E_PASSWORD = process.env.COMMISSION_E2E_PASSWORD || MANAGER_PASSWORD;

test.use({ actionTimeout: 25_000, navigationTimeout: 45_000 });
test.setTimeout(180_000);

test.beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 500));
});

test('Commission verification (instructor earnings + manager) for package bookings', async ({ page }) => {
  test.slow();
  await login(page, COMMISSION_E2E_EMAIL, COMMISSION_E2E_PASSWORD);

  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('domcontentloaded');
  await dismissConsentWallIfPresent(page);

  const token = await page.evaluate(() => localStorage.getItem('token') || '');
  expect(token.length, 'expected JWT in localStorage after login').toBeGreaterThan(20);

  await verifyCommissionsAfterQuickPackageBookings(page);
});
