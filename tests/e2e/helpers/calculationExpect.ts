/**
 * Helpers for asserting that UI text matches expected numeric / money values
 * from APIs or shared formulas (E2E + calculation parity).
 */
import { expect, type Locator } from '@playwright/test';

/**
 * Parse a single money-ish token from visible text (e.g. "€1,234.56", "-€50.00", "250,25 €").
 * Returns null if no number found.
 */
export function parseMoneyFromText(raw: string): number | null {
  if (!raw) return null;
  const isNegative =
    /^[\s]*-/.test(raw) ||
    /-\s*[€$₺£]/.test(raw) ||
    /[€$₺£]\s*-\s*\d/.test(raw) ||
    /\(\s*[\d.,]+\s*\)/.test(raw);
  const normalized = raw
    .replace(/\u2212/g, '-')
    .replace(/[^\d.,]/g, ' ')
    .trim();
  const m = normalized.match(/\d[\d.,]*/);
  if (!m) return null;
  let s = m[0].replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, '');
    }
  }
  let n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  if (isNegative) n = -Math.abs(n);
  return n;
}

/** Assert a locator's text parses to a number within tolerance. */
export async function expectLocatorMoneyApprox(
  locator: Locator,
  expected: number,
  tolerance = 0.02,
  message?: string
) {
  await expect(locator).toBeVisible();
  const text = (await locator.textContent()) || '';
  const parsed = parseMoneyFromText(text);
  expect(parsed, message || `Could not parse money from: ${JSON.stringify(text)}`).not.toBeNull();
  expect(
    Math.abs((parsed as number) - expected),
    message || `expected ~${expected}, got ${parsed} from ${JSON.stringify(text)}`
  ).toBeLessThanOrEqual(tolerance);
}
