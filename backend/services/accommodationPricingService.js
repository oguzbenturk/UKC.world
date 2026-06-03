/**
 * Per-night price computation for accommodation bookings, accounting for
 * weekend pricing, holiday/special pricing, occupancy (guest-count) pricing,
 * and length-of-stay discounts.
 *
 * Pricing metadata lives inside the unit's `amenities` JSONB array as a
 * `__meta__{...}` string entry (legacy schema choice).
 *
 * Occupancy-aware pricing (added 2026-06): when `meta.occupancy_pricing_enabled`
 * is set, the standard / weekend / holiday nightly rate is resolved per guest
 * count from the matching `*_occupancy_pricing` list, falling back to the flat
 * rate when a given occupancy isn't specified. Keep this logic in sync with the
 * frontend mirror at src/shared/utils/accommodationPricing.js.
 */

export function extractUnitMeta(unitRow) {
	const amenities = unitRow?.amenities;
	if (!Array.isArray(amenities)) return {};
	const entry = amenities.find(a => typeof a === 'string' && a.startsWith('__meta__'));
	if (!entry) return {};
	try { return JSON.parse(entry.slice(8)); } catch { return {}; }
}

/**
 * Resolve a per-night rate for a given guest count from an occupancy list
 * (`[{ guests, price_per_night }]`). Exact match wins; otherwise the highest
 * defined occupancy that is <= guests; otherwise the lowest defined occupancy;
 * otherwise the supplied flat fallback.
 */
export function pickOccupancyRate(list, guests, fallback) {
	if (!Array.isArray(list) || list.length === 0) return fallback;
	const g = Number(guests) || 1;
	const valid = list
		.map(o => ({ guests: Number(o?.guests), price: parseFloat(o?.price_per_night) }))
		.filter(o => Number.isFinite(o.guests) && o.guests > 0 && Number.isFinite(o.price));
	if (valid.length === 0) return fallback;
	const exact = valid.find(o => o.guests === g);
	if (exact) return exact.price;
	const lower = valid.filter(o => o.guests <= g).sort((a, b) => b.guests - a.guests);
	if (lower.length) return lower[0].price;
	return valid.sort((a, b) => a.guests - b.guests)[0].price;
}

export function calculateTotalPrice(checkInDate, checkOutDate, basePrice, meta, guestsCount = 1) {
	const oneDay = 24 * 60 * 60 * 1000;
	const nights = Math.ceil((checkOutDate - checkInDate) / oneDay);
	if (nights <= 0) return { total: 0, nights: 0, subtotal: 0, appliedDiscount: null, breakdown: [] };

	const base = parseFloat(basePrice) || 0;
	const enabled = !!meta.occupancy_pricing_enabled;
	const stdOcc = enabled ? meta.occupancy_pricing : null;
	const wkndOcc = enabled ? meta.weekend_occupancy_pricing : null;
	// Treat a flat weekend rate as "set" only when > 0 (legacy truthiness: 0 / '' / null disable weekend pricing).
	const weekendFlat = meta.weekend_price > 0 ? parseFloat(meta.weekend_price) : null;
	const holidays = Array.isArray(meta.holiday_pricing) ? meta.holiday_pricing : [];
	const discounts = Array.isArray(meta.custom_discounts) ? meta.custom_discounts : [];

	const standardRate = pickOccupancyRate(stdOcc, guestsCount, base);
	const hasWeekend = weekendFlat != null || (Array.isArray(wkndOcc) && wkndOcc.length > 0);
	const weekendRate = hasWeekend
		? pickOccupancyRate(wkndOcc, guestsCount, weekendFlat != null ? weekendFlat : standardRate)
		: null;

	let subtotal = 0;
	const breakdown = [];

	for (let i = 0; i < nights; i++) {
		const nightDate = new Date(checkInDate.getTime() + i * oneDay);
		const dateStr = nightDate.toISOString().slice(0, 10);
		const dayOfWeek = nightDate.getDay(); // 0=Sun, 5=Fri, 6=Sat

		let price = standardRate;
		let reason = 'standard';

		// Flat holiday rate matches only when > 0 (legacy truthiness); occupancy-only
		// holidays match only while occupancy pricing is enabled.
		const holidayMatch = holidays.find(h =>
			h.start_date && h.end_date &&
			(h.price_per_night > 0 || (enabled && Array.isArray(h.occupancy_pricing) && h.occupancy_pricing.length > 0)) &&
			dateStr >= h.start_date && dateStr <= h.end_date
		);
		if (holidayMatch) {
			const holFallback = holidayMatch.price_per_night > 0
				? parseFloat(holidayMatch.price_per_night)
				: standardRate;
			price = pickOccupancyRate(enabled ? holidayMatch.occupancy_pricing : null, guestsCount, holFallback);
			reason = 'holiday';
		} else if (hasWeekend && (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6)) {
			price = weekendRate;
			reason = 'weekend';
		}

		subtotal += price;
		breakdown.push({ date: dateStr, price, reason });
	}

	let appliedDiscount = null;
	if (discounts.length > 0) {
		const eligible = discounts
			.filter(d => d.min_nights && nights >= d.min_nights && d.discount_value > 0)
			.sort((a, b) => (b.min_nights || 0) - (a.min_nights || 0));
		if (eligible.length > 0) {
			appliedDiscount = eligible[0];
		}
	}

	let total = subtotal;
	if (appliedDiscount) {
		if (appliedDiscount.discount_type === 'percentage') {
			total = subtotal * (1 - appliedDiscount.discount_value / 100);
		} else {
			total = subtotal - (appliedDiscount.discount_value * nights);
		}
		total = Math.max(0, total);
	}

	return { total: Math.round(total * 100) / 100, nights, subtotal, appliedDiscount, breakdown };
}
