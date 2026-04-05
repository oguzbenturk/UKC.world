import { expect, type Locator, type Page } from '@playwright/test';
import { BASE_URL } from '../../helpers';
import { dismissConsentWallIfPresent } from './dismissConsentWall';

function parseBookingDatesEnv(): string[] {
  const raw = process.env.ACADEMY_KITE_BOOKING_DATES?.trim();
  if (raw) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return ['2026-04-01', '2026-04-02', '2026-04-03'];
}

export async function closeWalletDepositSuccessIfPresent(page: Page): Promise<void> {
  const successDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Payment Successful' }) });
  if (await successDialog.isVisible().catch(() => false)) {
    await successDialog.getByRole('button', { name: 'Done' }).click();
    await expect(successDialog).toBeHidden({ timeout: 15_000 });
  }
}

export async function bookPrivateKitePackageViaWallet(page: Page): Promise<void> {
  const dates = parseBookingDatesEnv();
  expect(dates.length).toBeGreaterThanOrEqual(1);

  await page.goto(`${BASE_URL}/academy`);
  await page.waitForLoadState('domcontentloaded');
  await dismissConsentWallIfPresent(page);

  await page.getByRole('button', { name: /discover kite lessons/i }).click();
  await page.waitForURL(/\/academy\/kite-lessons/i, { timeout: 30_000 });

  const kiteCard = page.locator('div.group.relative').filter({ hasText: /Private Kitesurfing/i }).first();
  await expect(kiteCard).toBeVisible({ timeout: 25_000 });
  await kiteCard.click();

  const deluxe = page.locator('.ant-modal.deluxe-modal');
  await expect(deluxe).toBeVisible({ timeout: 15_000 });

  const starterTile = deluxe.locator('div.relative.cursor-pointer.rounded-xl').filter({ hasText: /6h/ }).filter({ hasText: /Starter Pack/i });
  await expect(starterTile.first()).toBeVisible({ timeout: 10_000 });
  await starterTile.first().click();

  await deluxe.getByRole('button', { name: 'Book Now' }).click();

  const quick = page.locator('.ant-modal:visible').filter({ has: page.getByText('Review & Pay', { exact: false }) });
  await expect(quick).toBeVisible({ timeout: 20_000 });

  await quick.getByRole('button', { name: /Wallet/i }).first().click();

  // Icon prefixes a11y name ("shopping Pay €…"); /^Pay / fails. Exclude "Pay Deposit …" when deposit tab is chosen.
  const payBtn = quick.getByRole('button', { name: /Pay / }).filter({ hasNotText: /Deposit/i });
  await expect(payBtn).toBeEnabled({ timeout: 30_000 });
  await payBtn.click();

  await expect(page.getByRole('button', { name: 'Confirm & Pay' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Confirm & Pay' }).click();

  // Do not scope with "Choose your instructor" — that placeholder disappears after a selection.
  const scheduleModal = page
    .locator('.ant-modal:visible')
    .filter({ has: page.getByRole('heading', { name: 'Schedule Session' }) });
  await expect(scheduleModal).toBeVisible({ timeout: 60_000 });

  await pickInstructor(scheduleModal, page);

  while ((await sessionRows(scheduleModal).count()) < dates.length) {
    await scheduleModal.getByRole('button', { name: '+ Add another day' }).click();
  }

  const rows = sessionRows(scheduleModal);
  await expect(rows).toHaveCount(dates.length);

  for (let i = 0; i < dates.length; i++) {
    const row = rows.nth(i);
    await pickAntPickerDate(page, row.locator('.ant-picker').first(), dates[i]);
    await pickTimeInRow(page, row, '14:00');
  }

  const bookSessions = scheduleModal.getByRole('button', { name: /Book \d+ Sessions|Book Session/ });
  await expect(bookSessions).toBeEnabled({ timeout: 30_000 });
  await bookSessions.click();

  // QuickBookingModal opens App modal.confirm — must confirm before bookings run and the Done step appears.
  const confirmBooking = page
    .locator('.ant-modal-wrap:visible')
    .filter({ has: page.getByText('Confirm Booking', { exact: true }) });
  await expect(confirmBooking).toBeVisible({ timeout: 20_000 });
  await confirmBooking.getByRole('button', { name: /Book \d+ Sessions|Book Session/ }).click();

  const doneBtn = page
    .locator('.ant-modal:visible')
    .filter({ has: page.getByRole('heading', { name: /All Done!|Invite Sent!/ }) })
    .getByRole('button', { name: 'Done' });
  await expect(doneBtn).toBeVisible({ timeout: 120_000 });
  await doneBtn.click();
  await expect(
    page.locator('.ant-modal:visible').filter({ has: page.getByRole('heading', { name: /All Done!|Invite Sent!/ }) }),
  ).toBeHidden({ timeout: 20_000 });
}

function sessionRows(scheduleModal: Locator): Locator {
  return scheduleModal
    .getByText('Date & Time')
    .locator('..')
    .locator('div.space-y-2 > div.flex.items-start.gap-2');
}

async function pickInstructor(scheduleModal: Locator, page: Page): Promise<void> {
  await scheduleModal.getByRole('combobox').first().click();
  const dropdown = page.locator('.ant-select-dropdown:visible');
  await expect(dropdown).toBeVisible({ timeout: 10_000 });

  const fromEnv = process.env.ACADEMY_KITE_INSTRUCTOR?.trim();
  // Virtualized rc-select: role=option host can sit off-viewport; portaled row text is the real hit target.
  const label = fromEnv
    ? dropdown.getByText(new RegExp(fromEnv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    : dropdown.getByText(/Any available instructor/i);
  await expect(label.first()).toBeVisible({ timeout: 15_000 });
  await label.first().click();
}

async function pickAntPickerDate(page: Page, picker: Locator, isoYmd: string): Promise<void> {
  await picker.click();
  const panel = page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)').last();
  await expect(panel).toBeVisible({ timeout: 10_000 });

  for (let attempt = 0; attempt < 24; attempt++) {
    const cell = panel.locator(`[title="${isoYmd}"]`);
    if ((await cell.count()) > 0) {
      await cell.first().click();
      return;
    }
    await panel.locator('.ant-picker-header-next-btn').click();
  }
  throw new Error(`Could not reach date ${isoYmd} in DatePicker`);
}

async function pickTimeInRow(page: Page, row: Locator, preferredStartTimeHHmm?: string): Promise<void> {
  const select = row.locator('.ant-select').last();
  await select.locator('.ant-select-selector').click();
  const dropdown = page.locator('.ant-select-dropdown:visible');
  await expect(dropdown).toBeVisible({ timeout: 10_000 });

  const env = process.env.ACADEMY_KITE_SESSION_TIME?.trim();
  const preferred = env || preferredStartTimeHHmm;

  const items = dropdown.locator('.ant-select-item-option');
  const roleOptions = dropdown.getByRole('option');

  if (preferred) {
    const esc = preferred.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // "14:00" row or "14:00 – 16:00" label
    const byPreferred = items.filter({ hasText: new RegExp(`(^|[^0-9])${esc}([^0-9]|$)`) }).first();
    if ((await byPreferred.count()) > 0) {
      await expect(byPreferred).toBeVisible({ timeout: 10_000 });
      await byPreferred.click();
      return;
    }
  }

  // Availability is per instructor/date; do not assume a fixed slot (e.g. 14:00) exists.
  const first =
    (await roleOptions.count()) > 0 ? roleOptions.first() : items.filter({ hasNotText: /pick|choose/i }).first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.click();
}
