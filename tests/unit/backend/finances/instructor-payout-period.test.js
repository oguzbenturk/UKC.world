// resolvePeriod: the "vs previous" comparison must use the same elapsed span
// (Oct 1–7 vs Sep 1–7), not a partial current period against a full previous one.
import { describe, test, expect } from '@jest/globals';
import { resolvePeriod } from '../../../../backend/services/instructorPayoutService.js';

describe('resolvePeriod previous period is "to date"', () => {
  test('month: same days of the previous month', () => {
    expect(resolvePeriod('month', '2026-10-07').previous).toEqual({ start: '2026-09-01', end: '2026-09-07' });
  });

  test('month: clamps to the end of a shorter previous month', () => {
    expect(resolvePeriod('month', '2026-03-31').previous).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  test('week: same weekdays of the previous week (Mon-based)', () => {
    // 2026-10-07 is a Wednesday → current week Mon 10-05; previous Mon 09-28 .. Wed 09-30
    expect(resolvePeriod('week', '2026-10-07').previous).toEqual({ start: '2026-09-28', end: '2026-09-30' });
  });

  test('year: same day-of-year in the previous year', () => {
    expect(resolvePeriod('year', '2026-10-07').previous).toEqual({ start: '2025-01-01', end: '2025-10-07' });
  });

  test('all: no previous period', () => {
    expect(resolvePeriod('all', '2026-10-07').previous).toBeNull();
  });
});
