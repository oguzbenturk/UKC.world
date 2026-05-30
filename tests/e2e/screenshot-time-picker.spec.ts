/**
 * Visual capture of the new AntD TimePicker in BookingDetailModal edit mode.
 */
import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

test('Capture TimePicker visual', async ({ page }) => {
  test.setTimeout(60_000);

  await page.context().addInitScript(() => {
    localStorage.setItem('cookie_consent_accepted', 'true');
  });

  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('http://localhost:3000/bookings');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  const firstBookingRow = page.locator('.ant-table-row').first();
  await firstBookingRow.waitFor({ state: 'visible', timeout: 30_000 });
  await firstBookingRow.click();
  await page.waitForTimeout(2500);

  const editBtn = page.locator('button').filter({ hasText: /^\s*Edit\s*$|^\s*Düzenle\s*$/i }).first();
  await editBtn.scrollIntoViewIfNeeded();
  await editBtn.click({ force: true });
  await page.waitForTimeout(1500);

  // Screenshot edit form
  await page.screenshot({ path: 'test-results/ui-smoke/timepicker-closed.png', fullPage: false });

  // Click the picker to open dropdown — scope to the booking detail drawer's TimePicker
  const timeInput = page.locator('input[placeholder="Select time"]').first();
  await timeInput.click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: 'test-results/ui-smoke/timepicker-open.png', fullPage: false });

  await expect(page.locator('.ant-picker-dropdown').first()).toBeVisible({ timeout: 5000 });
});
