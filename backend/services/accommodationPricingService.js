/**
 * Per-night price computation for accommodation bookings, accounting for
 * weekend pricing, holiday/special pricing, and length-of-stay discounts.
 *
 * Pricing metadata lives inside the unit's `amenities` JSONB array as a
 * `__meta__{...}` string entry (legacy schema choice).
 */

export function extractUnitMeta(unitRow) {
	const amenities = unitRow?.amenities;
	if (!Array.isArray(amenities)) return {};
	const entry = amenities.find(a => typeof a === 'string' && a.startsWith('__meta__'));
	if (!entry) return {};
	try { return JSON.parse(entry.slice(8)); } catch { return {}; }
}

export function calculateTotalPrice(checkInDate, checkOutDate, basePrice, meta) {
	const oneDay = 24 * 60 * 60 * 1000;
	const nights = Math.ceil((checkOutDate - checkInDate) / oneDay);
	if (nights <= 0) return { total: 0, nights: 0, subtotal: 0, appliedDiscount: null, breakdown: [] };

	const weekendPrice = meta.weekend_price ? parseFloat(meta.weekend_price) : null;
	const holidays = Array.isArray(meta.holiday_pricing) ? meta.holiday_pricing : [];
	const discounts = Array.isArray(meta.custom_discounts) ? meta.custom_discounts : [];

	let subtotal = 0;
	const breakdown = [];

	for (let i = 0; i < nights; i++) {
		const nightDate = new Date(checkInDate.getTime() + i * oneDay);
		const dateStr = nightDate.toISOString().slice(0, 10);
		const dayOfWeek = nightDate.getDay(); // 0=Sun, 5=Fri, 6=Sat

		let price = basePrice;
		let reason = 'standard';

		const holidayMatch = holidays.find(h =>
			h.start_date && h.end_date && h.price_per_night &&
			dateStr >= h.start_date && dateStr <= h.end_date
		);
		if (holidayMatch) {
			price = parseFloat(holidayMatch.price_per_night);
			reason = 'holiday';
		} else if (weekendPrice && (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6)) {
			price = weekendPrice;
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
