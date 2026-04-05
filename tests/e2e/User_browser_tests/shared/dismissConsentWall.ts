import { expect, type Page } from '@playwright/test';

/**
 * Full-page consent / onboarding after first login or register.
 * The primary action is often below the fold — scroll into view before clicking.
 */
export async function dismissConsentWallIfPresent(page: Page): Promise<void> {
  const agreeBtn = page.getByRole('button', { name: 'Agree & Continue' });
  try {
    await agreeBtn.waitFor({ state: 'attached', timeout: 15_000 });
  } catch {
    return;
  }

  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    const box = checkboxes.nth(i);
    await box.scrollIntoViewIfNeeded();
    if (!(await box.isChecked())) {
      await box.check({ force: true });
    }
  }

  const modalBody = page.locator('.ant-modal-wrap:visible .ant-modal-body').first();
  if (await modalBody.isVisible().catch(() => false)) {
    await modalBody.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  } else {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  }

  await agreeBtn.scrollIntoViewIfNeeded();
  await agreeBtn.click();

  await expect(agreeBtn).toBeHidden({ timeout: 30_000 });
}
