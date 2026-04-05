/** Max hours treated as a simple "hourly" lesson row for pro-rata (excludes days/weeks). */
export const MAX_HOURS_FOR_HOURLY_PRO_RATA = 48;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Parse a duration row into numeric hours when it is a short hourly lesson option.
 * @param {object} dur
 * @returns {number|null}
 */
export function parseLessonDurationHours(dur) {
  if (!dur) return null;
  if (dur.hoursNumeric != null && Number.isFinite(Number(dur.hoursNumeric))) {
    const h = Number(dur.hoursNumeric);
    if (h > 0 && h <= MAX_HOURS_FOR_HOURLY_PRO_RATA) return h;
    return null;
  }
  const s = String(dur.hours || '').trim().toLowerCase();
  if (s.endsWith('h')) {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 && n <= MAX_HOURS_FOR_HOURLY_PRO_RATA ? n : null;
  }
  return null;
}

/**
 * Use the shortest hourly option as the rate anchor: price/hours = hourly rate.
 * @param {object[]} durations
 * @returns {{ hourlyRate: number, anchorDur: object, anchorHours: number } | null}
 */
export function inferHourlyProRataBase(durations) {
  if (!Array.isArray(durations) || durations.length === 0) return null;
  const rows = durations
    .map((d) => {
      const h = parseLessonDurationHours(d);
      const price = Number(d.price);
      if (h == null || !Number.isFinite(price) || price <= 0) return null;
      return { d, h, price };
    })
    .filter(Boolean);
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.h - b.h);
  const anchor = rows[0];
  return {
    hourlyRate: anchor.price / anchor.h,
    anchorDur: anchor.d,
    anchorHours: anchor.h,
  };
}

export function roundCurrency(amount) {
  return round2(amount);
}

/**
 * @param {{ hourlyRate: number, anchorDur: object }} base from inferHourlyProRataBase
 * @param {number} customHours
 */
export function buildCustomProRataDuration(base, customHours) {
  if (!base || !Number.isFinite(Number(customHours))) return null;
  const h = Number(customHours);
  if (h < 0.5 || h > MAX_HOURS_FOR_HOURLY_PRO_RATA) return null;
  const { anchorDur, hourlyRate } = base;
  const price = roundCurrency(hourlyRate * h);
  return {
    ...anchorDur,
    hours: `${h}h`,
    hoursNumeric: h,
    label: 'Custom length',
    sessions: `${h} hour session`,
    price,
    isCustomProRata: true,
  };
}
