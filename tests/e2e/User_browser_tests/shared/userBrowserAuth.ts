import { expect, type Page } from '@playwright/test';
import { BASE_URL, login } from '../../helpers';
import { getUserBrowserStudentEmail, getUserBrowserStudentPassword } from './studentPersona';
import { dismissConsentWallIfPresent } from './dismissConsentWall';

/** Log in as the user-browser student and land on student dashboard with consent handled. */
export async function loginUserBrowserStudent(page: Page): Promise<void> {
  const email = getUserBrowserStudentEmail();
  const password = getUserBrowserStudentPassword();
  await login(page, email, password);
  await page.goto(BASE_URL + '/student/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await dismissConsentWallIfPresent(page);
  await expect(page.getByRole('button', { name: /open profile menu/i })).toBeVisible({ timeout: 20_000 });
}
