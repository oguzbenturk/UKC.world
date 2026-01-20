import { describe, expect, test } from '@jest/globals';

import { __testables as walletTestables } from '../services/walletService.js';

const {
  normalizePreferences,
  mergePreferences,
  resolveDepositPolicy,
  resolveEnabledGateways,
  toBooleanFlag
} = walletTestables;

describe('walletService preference helpers', () => {
  test('normalizePreferences populates default deposit policy', () => {
    const result = normalizePreferences({});
    expect(result.depositPolicy.allowUnlimitedDeposits).toBe(true);
    expect(result.depositPolicy.maxPerTransaction).toBeNull();
  });

  test('resolveDepositPolicy parses numeric limits and boolean flags', () => {
    const policy = resolveDepositPolicy({
      allowUnlimitedDeposits: 'false',
      maxPerTransaction: '100.25',
      maxPerDay: '500',
      maxPerMonth: '2000.999'
    });

    expect(policy.allowUnlimitedDeposits).toBe(false);
    expect(policy.maxPerTransaction).toBeCloseTo(100.25, 4);
    expect(policy.maxPerDay).toBeCloseTo(500, 4);
  expect(policy.maxPerMonth).toBeCloseTo(2000.999, 4);
  });

  test('mergePreferences keeps existing structure while applying overrides', () => {
    const base = normalizePreferences({
      depositPolicy: { allowUnlimitedDeposits: true, maxPerTransaction: 50 }
    });

    const merged = mergePreferences(base, {
      depositPolicy: { allowUnlimitedDeposits: false }
    });

    expect(merged.depositPolicy.allowUnlimitedDeposits).toBe(false);
    expect(merged.depositPolicy.maxPerTransaction).toBe(50);
  });

  test('resolveEnabledGateways falls back to defaults when not configured', () => {
    const gatewaySet = resolveEnabledGateways({ enabledGateways: [] });
    expect(gatewaySet.has('stripe')).toBe(true);
    expect(gatewaySet.has('binance_pay')).toBe(true);
  });

  test('toBooleanFlag handles string values', () => {
    expect(toBooleanFlag('false', true)).toBe(false);
    expect(toBooleanFlag('yes', false)).toBe(true);
    expect(toBooleanFlag(undefined, false)).toBe(false);
  });
});
