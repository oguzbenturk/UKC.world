/**
 * Pattern: mock API with known numbers → open UI → assert displayed values match.
 * Run (frontend + backend up): npx playwright test tests/e2e/flows/ui-mirrors-api-calculations.spec.ts --project=chromium
 * Interactive UI: npx playwright test --ui tests/e2e/flows/ui-mirrors-api-calculations.spec.ts
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, loginAsAdmin } from '../helpers';
import { expectLocatorMoneyApprox, parseMoneyFromText } from '../helpers/calculationExpect';

test.describe.configure({ timeout: 60_000 });

const MOCK_CUSTOMER = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'E2E Calc Customer',
  email: 'e2e-calc@test.local',
  phone: '',
  role: 'student',
  /** Ground truth from "API" — UI must reflect this (staff sees EUR in customers table). */
  balance: 250.25,
  preferred_currency: 'EUR',
  payment_status: 'paid' as const,
};

test.describe('UI reflects mocked API data (calculation / display parity)', () => {
  test('Customers list shows name and balance from /users/customers/list mock', async ({ page }) => {
    await page.route('**/api/users/customers/list**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [MOCK_CUSTOMER],
          nextCursor: null,
        }),
      });
    });

    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText(MOCK_CUSTOMER.name)).toBeVisible({ timeout: 20_000 });

    const row = page.locator('tr', { hasText: MOCK_CUSTOMER.name }).first();
    await expect(row).toBeVisible();

    const balanceCell = row.locator('td').nth(4);
    await expectLocatorMoneyApprox(balanceCell, MOCK_CUSTOMER.balance, 0.02);
  });

  test('parseMoneyFromText handles typical EUR formatting', () => {
    expect(parseMoneyFromText('€250.25')).toBe(250.25);
    expect(parseMoneyFromText('-€1,234.56')).toBe(-1234.56);
    expect(parseMoneyFromText('250,25')).toBe(250.25);
  });
});
