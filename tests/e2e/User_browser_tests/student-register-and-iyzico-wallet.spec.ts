/**
 * One flow: register from /login → dashboard → My Wallet → Iyzico deposit (sandbox), then /academy kite
 * private package (6h Starter Pack) paid with wallet and three scheduled sessions (default dates 2026-04-01..03, 14:00).
 *
 * Optional: ACADEMY_KITE_BOOKING_DATES (comma YYYY-MM-DD). ACADEMY_KITE_INSTRUCTOR — pin instructor; ACADEMY_KITE_SESSION_TIME (HH:mm) — preferred slot if listed; otherwise first available time is chosen.
 * Commission / finance API checks live in `commission-verify-package-bookings.spec.ts` (separate login).
 *
 * Reuses the same browser session. Writes `.browser-student-credentials.json` for other tooling.
 *
 * Run:
 *   npx playwright test tests/e2e/User_browser_tests/student-register-and-iyzico-wallet.spec.ts --project=chromium --workers=1
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { BASE_URL } from '../helpers';
import { writeBrowserStudentCredentials } from './shared/browserStudentCredentialsStore';
import { dismissConsentWallIfPresent } from './shared/dismissConsentWall';
import {
  getIyzicoCardHolderName,
  getIyzicoTestCard,
  getWalletDepositAmountTry,
} from './shared/studentPersona';
import { bookPrivateKitePackageViaWallet, closeWalletDepositSuccessIfPresent } from './shared/academyKiteWalletBooking';

const REG_PASSWORD = 'TestPass123!';

function registrationEmail(): string {
  const fixed = process.env.REGISTER_TEST_EMAIL?.trim();
  if (fixed) return fixed;
  return 'mehmetural+e2e.' + Date.now() + '@gmail.com';
}

async function openPreferredCurrencyAndChooseTRY(dialog: Locator, page: Page): Promise<void> {
  await dialog.locator('.ant-select').nth(1).locator('.ant-select-selector').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item')
    .filter({ hasText: /TRY|Turkish Lira/ })
    .first()
    .click();
}

async function registerFromLoginModal(page: Page): Promise<string> {
  const email = registrationEmail();

  await page.goto(BASE_URL + '/login');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByPlaceholder('name@example.com')).toBeVisible({ timeout: 15000 });

  const createBtn = page.getByRole('button', { name: /create account/i });
  const n = await createBtn.count();
  let clicked = false;
  for (let i = 0; i < n; i++) {
    const btn = createBtn.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      clicked = true;
      break;
    }
  }
  expect(clicked).toBe(true);

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog.locator('#first_name')).toBeVisible({ timeout: 15000 });

  await dialog.locator('#first_name').fill('Mehmet');
  await dialog.locator('#last_name').fill('Ural');
  await dialog.locator('#email').fill(email);
  await dialog.locator('#password').fill(REG_PASSWORD);
  await dialog.locator('#confirm_password').fill(REG_PASSWORD);

  await dialog.getByRole('button', { name: /Continue/i }).click();
  await expect(dialog.locator('#phone')).toBeVisible({ timeout: 10000 });

  await dialog.locator('#phone').fill('5321234567');

  const dob = dialog.locator('#date_of_birth');
  await dob.click();
  await dob.fill('01/11/1995');
  await page.keyboard.press('Enter');

  await dialog.locator('#weight').fill('75');
  await openPreferredCurrencyAndChooseTRY(dialog, page);

  await dialog.getByRole('button', { name: /Continue/i }).click();
  await expect(dialog.locator('#address')).toBeVisible({ timeout: 10000 });

  await dialog.locator('#address').fill('İskele Cd. No: 12');
  await dialog.locator('#city').fill('Urla');
  await dialog.locator('#zip_code').fill('35430');

  const responsePromise = page
    .waitForResponse(
      (resp) => resp.url().includes('/auth/register') && resp.request().method() === 'POST',
      { timeout: 25000 },
    )
    .catch(() => null);

  await dialog.getByRole('button', { name: /Finish/i }).click();
  const response = await responsePromise;

  if (response) {
    expect([200, 201]).toContain(response.status());
  }

  await expect
    .poll(async () => await page.evaluate(() => localStorage.getItem('token')), { timeout: 20000 })
    .toMatch(/.{20,}/);

  writeBrowserStudentCredentials({ email, password: REG_PASSWORD });
  return email;
}

test.use({ actionTimeout: 25000, navigationTimeout: 45000 });
test.setTimeout(520_000);

test.beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 500));
});

test('Register student, Iyzico wallet top-up, then book kite package with wallet', async ({ page, context }) => {
  test.slow();
  await registerFromLoginModal(page);

  await page.goto(BASE_URL + '/student/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await dismissConsentWallIfPresent(page);
  await expect(page.getByRole('button', { name: /open profile menu/i })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /open profile menu/i }).click();
  await page.getByRole('menuitem', { name: /My Wallet/i }).click();

  const addFundsTrigger = page.getByRole('button', { name: /add funds/i });
  await expect(addFundsTrigger).toBeVisible({ timeout: 15_000 });
  await addFundsTrigger.click();

  const fundMenu = page.locator('.ant-dropdown-menu:visible');
  const creditCardItem = fundMenu
    .getByRole('menuitem', { name: /credit card/i })
    .or(fundMenu.getByText('Credit Card', { exact: true }));
  await expect(creditCardItem.first()).toBeVisible({ timeout: 10_000 });
  await creditCardItem.first().click();

  // StudentWalletModal + WalletDepositModal can both mount; duplicate id="amount" → scope, don't use #amount globally.
  const walletDepositModal = page
    .getByRole('dialog')
    .filter({ has: page.getByText('Deposit Amount') })
    .filter({ has: page.getByPlaceholder('Min 10') });

  const amount = getWalletDepositAmountTry();
  const amountInput = walletDepositModal.getByPlaceholder('Min 10');
  await expect(amountInput).toBeVisible({ timeout: 15_000 });
  await amountInput.fill(String(amount));

  const popupPromise = context.waitForEvent('page', { timeout: 90_000 });
  await walletDepositModal.getByRole('button', { name: /Deposit|Continue to Payment/ }).click();
  const pay = await popupPromise;
  await pay.waitForLoadState('domcontentloaded');

  const card = getIyzicoTestCard();
  const holder = getIyzicoCardHolderName();

  await pay.locator('#ccname').fill(holder);
  await pay.locator('#ccnumber').fill(card.number);
  await pay.locator('#ccexp').fill(card.exp);
  await pay.locator('#cccvc').fill(card.cvc);

  const payBtn = pay.locator('#iyz-payment-button');
  await expect(payBtn).toBeVisible({ timeout: 60000 });
  await payBtn.click();

  const sms = pay.locator('#smsCode');
  await expect(sms).toBeVisible({ timeout: 120000 });
  await sms.fill(card.smsCode);

  const submitSms = pay.locator('form#iyzico-3ds-callback-form button[type="submit"]');
  if (await submitSms.isVisible().catch(() => false)) {
    await submitSms.click();
  } else {
    await pay.locator('form#iyzico-3ds-callback-form').evaluate((f: HTMLFormElement) => f.requestSubmit());
  }

  await expect(page.getByRole('heading', { name: 'Payment Successful' })).toBeVisible({ timeout: 180000 });

  await closeWalletDepositSuccessIfPresent(page);
  await bookPrivateKitePackageViaWallet(page);
});
