/**
 * Shared client-side accommodation price computation.
 *
 * Mirrors backend/services/accommodationPricingService.js exactly so the price
 * shown before booking matches what the server charges. Pricing metadata lives
 * inside the unit's `amenities` JSONB array as a `__meta__{...}` string entry
 * (legacy schema choice — see extractUnitMeta).
 *
 * Occupancy-aware pricing (added 2026-06): when `meta.occupancy_pricing_enabled`
 * is set, the standard / weekend / holiday nightly rate is resolved per guest
 * count from the matching `*_occupancy_pricing` list, falling back to the flat
 * rate when a given occupancy isn't specified.
 *
 * Per-person pricing (added 2026-06): when `meta.pricing_per_person` is set, the
 * resolved nightly rate is treated as a PER-GUEST price and multiplied by the
 * guest count (e.g. €70/night → €140 for 2 guests). This composes with occupancy
 * pricing: the per-occupancy rate becomes the per-person rate for that guest
 * count (e.g. "2 guests → €70" means €70 per person → €140 for 2).
 */
import dayjs from 'dayjs';

/** Parse the `__meta__{...}` pricing object out of a unit's amenities. */
export function extractUnitMeta(unit) {
  let amenities = unit?.amenities;
  if (typeof amenities === 'string') {
    try { amenities = JSON.parse(amenities); } catch { return {}; }
  }
  if (!Array.isArray(amenities)) return {};
  const entry = amenities.find((a) => typeof a === 'string' && a.startsWith('__meta__'));
  if (!entry) return {};
  try { return JSON.parse(entry.slice(8)); } catch { return {}; }
}

/**
 * Resolve a per-night rate for a given guest count from an occupancy list
 * (`[{ guests, price_per_night }]`). Exact match wins; otherwise the highest
 * defined occupancy that is ≤ guests; otherwise the lowest defined occupancy;
 * otherwise the supplied flat fallback.
 */
export function pickOccupancyRate(list, guests, fallback) {
  if (!Array.isArray(list) || list.length === 0) return fallback;
  const g = Number(guests) || 1;
  const valid = list
    .map((o) => ({ guests: Number(o?.guests), price: parseFloat(o?.price_per_night) }))
    .filter((o) => Number.isFinite(o.guests) && o.guests > 0 && Number.isFinite(o.price));
  if (valid.length === 0) return fallback;
  const exact = valid.find((o) => o.guests === g);
  if (exact) return exact.price;
  const lower = valid.filter((o) => o.guests <= g).sort((a, b) => b.guests - a.guests);
  if (lower.length) return lower[0].price;
  return valid.sort((a, b) => a.guests - b.guests)[0].price;
}

/** Standard (non-weekend, non-holiday) nightly rate for a guest count. */
export function resolveNightlyRate(meta, basePrice, guests = 1) {
  const base = parseFloat(basePrice) || 0;
  const list = meta?.occupancy_pricing_enabled ? meta.occupancy_pricing : null;
  return pickOccupancyRate(list, guests, base);
}

/**
 * Whether per-person pricing is active for a unit. When on, the resolved nightly
 * rate (flat or per-occupancy) is multiplied by the guest count.
 */
export function isPerPersonPricing(meta) {
  return !!meta?.pricing_per_person;
}

/** Multiply the nightly rate by this when summing a stay (1 unless per-person). */
export function guestPriceMultiplier(meta, guests = 1) {
  return isPerPersonPricing(meta) ? Math.max(1, Number(guests) || 1) : 1;
}

/**
 * Compute the full stay total with weekend / holiday / length-of-stay discount
 * and occupancy-aware nightly rates.
 *
 * @param {object}  args
 * @param {dayjs.Dayjs|string|Date} args.checkIn
 * @param {dayjs.Dayjs|string|Date} args.checkOut
 * @param {number}  args.basePrice  unit.price_per_night
 * @param {object}  args.meta       extracted __meta__ object
 * @param {number}  args.guests     occupancy (guests_count)
 */
export function computeAccommodationPrice({ checkIn, checkOut, basePrice, meta = {}, guests = 1 }) {
  const ci = checkIn ? dayjs(checkIn).startOf('day') : null;
  const co = checkOut ? dayjs(checkOut).startOf('day') : null;
  const base = parseFloat(basePrice) || 0;
  const nights = ci && co ? co.diff(ci, 'day') : 0;

  const perPerson = isPerPersonPricing(meta);
  const guestMultiplier = perPerson ? Math.max(1, Number(guests) || 1) : 1;

  const empty = {
    total: 0, subtotal: 0, nights: 0,
    weekendNights: 0, holidayNights: 0, standardNights: 0,
    discount: null, standardRate: base, weekendRate: null, breakdown: [],
    perPerson, guestMultiplier, guests: Number(guests) || 1,
  };
  if (!ci || !co || nights <= 0) return empty;

  const enabled = !!meta.occupancy_pricing_enabled;
  const stdOcc = enabled ? meta.occupancy_pricing : null;
  const wkndOcc = enabled ? meta.weekend_occupancy_pricing : null;
  // Treat a flat weekend rate as "set" only when > 0 (legacy truthiness: 0 / '' / null disable weekend pricing).
  const weekendFlat = meta.weekend_price > 0 ? parseFloat(meta.weekend_price) : null;
  const holidays = Array.isArray(meta.holiday_pricing) ? meta.holiday_pricing : [];
  const discounts = Array.isArray(meta.custom_discounts) ? meta.custom_discounts : [];

  const standardRate = pickOccupancyRate(stdOcc, guests, base);
  const hasWeekend = weekendFlat != null || (Array.isArray(wkndOcc) && wkndOcc.length > 0);
  const weekendRate = hasWeekend
    ? pickOccupancyRate(wkndOcc, guests, weekendFlat != null ? weekendFlat : standardRate)
    : null;

  let subtotal = 0;
  let weekendNights = 0;
  let holidayNights = 0;
  let standardNights = 0;
  const breakdown = [];

  for (let i = 0; i < nights; i++) {
    const nightDate = ci.add(i, 'day');
    const dateStr = nightDate.format('YYYY-MM-DD');
    const dow = nightDate.day(); // 0=Sun, 5=Fri, 6=Sat

    const holidayMatch = holidays.find((h) =>
      h.start_date && h.end_date &&
      (h.price_per_night > 0 || (enabled && Array.isArray(h.occupancy_pricing) && h.occupancy_pricing.length > 0)) &&
      dateStr >= h.start_date && dateStr <= h.end_date,
    );

    let price;
    if (holidayMatch) {
      const holFallback = holidayMatch.price_per_night > 0
        ? parseFloat(holidayMatch.price_per_night)
        : standardRate;
      price = pickOccupancyRate(enabled ? holidayMatch.occupancy_pricing : null, guests, holFallback);
      holidayNights++;
    } else if (hasWeekend && (dow === 0 || dow === 5 || dow === 6)) {
      price = weekendRate;
      weekendNights++;
    } else {
      price = standardRate;
      standardNights++;
    }
    const nightTotal = price * guestMultiplier;
    subtotal += nightTotal;
    breakdown.push({ date: dateStr, price: nightTotal, perPersonRate: price, reason: holidayMatch ? 'holiday' : (price === weekendRate && hasWeekend && (dow === 0 || dow === 5 || dow === 6) ? 'weekend' : 'standard') });
  }

  let discount = null;
  if (discounts.length > 0) {
    const eligible = discounts
      .filter((d) => d.min_nights && nights >= d.min_nights && d.discount_value > 0)
      .sort((a, b) => (b.min_nights || 0) - (a.min_nights || 0));
    if (eligible.length > 0) discount = eligible[0];
  }

  let total = subtotal;
  if (discount) {
    total = discount.discount_type === 'percentage'
      ? subtotal * (1 - discount.discount_value / 100)
      : subtotal - (discount.discount_value * nights);
    total = Math.max(0, total);
  }

  return {
    total: Math.round(total * 100) / 100,
    subtotal,
    nights,
    weekendNights,
    holidayNights,
    standardNights,
    discount,
    standardRate,
    weekendRate,
    breakdown,
    perPerson,
    guestMultiplier,
    guests: Number(guests) || 1,
  };
}
