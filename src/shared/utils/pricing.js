// Shared pricing utilities for booking/package calculations
// Supports fractional hours and rounding to granularity (default 0.25h = 15min)

import Decimal from 'decimal.js';

/**
 * Get service price in a specific currency from the prices array
 * Falls back to the default price if the currency is not found
 * @param {Object} service - Service object with price and prices array
 * @param {string} targetCurrency - Target currency code (e.g., 'EUR', 'TRY')
 * @returns {{ price: number, currency: string }}
 */
export function getServicePriceInCurrency(service, targetCurrency) {
  if (!service) return { price: 0, currency: 'EUR' };
  
  // Try to find price in target currency from the prices array
  if (targetCurrency && service.prices && Array.isArray(service.prices)) {
    const currencyPrice = service.prices.find(
      p => p.currencyCode === targetCurrency || p.currency_code === targetCurrency
    );
    if (currencyPrice && currencyPrice.price > 0) {
      return { price: currencyPrice.price, currency: targetCurrency };
    }
  }
  
  // Fallback to default service price/currency
  return { price: service.price || 0, currency: service.currency || 'EUR' };
}

/**
 * Get package price in a specific currency from the prices array
 * Falls back to the default price if the currency is not found
 * @param {Object} pkg - Package object with price and prices array
 * @param {string} targetCurrency - Target currency code (e.g., 'EUR', 'TRY')
 * @returns {{ price: number, currency: string }}
 */
export function getPackagePriceInCurrency(pkg, targetCurrency) {
  if (!pkg) return { price: 0, currency: 'EUR' };
  
  // Try to find price in target currency from the prices array
  if (targetCurrency && pkg.prices && Array.isArray(pkg.prices)) {
    const currencyPrice = pkg.prices.find(
      p => p.currencyCode === targetCurrency || p.currency_code === targetCurrency
    );
    if (currencyPrice && currencyPrice.price > 0) {
      return { price: currencyPrice.price, currency: targetCurrency };
    }
  }
  
  // Fallback to default package price/currency
  return { price: pkg.price || 0, currency: pkg.currency || 'EUR' };
}

/**
 * Round hours to the nearest step (e.g., 0.25 for 15 minutes)
 * @param {number} hours
 * @param {number} step
 * @returns {number}
 */
export function roundHours(hours, step = 0.25) {
  if (!isFinite(hours)) return 0;
  const h = new Decimal(hours);
  const s = new Decimal(step);
  // Round to nearest multiple of step
  const rounded = h.div(s).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(s);
  return rounded.toNumber();
}

/**
 * Compute how many hours are billable after deducting package hours
 * @param {number} plannedHours - lesson duration in hours
 * @param {number} packageHoursAvailable - remaining package hours available to use
 * @param {number} step - rounding step (0.25 => 15 minutes)
 * @returns {number} billable hours
 */
export function computeChargeableHours(plannedHours, packageHoursAvailable = 0, step = 0.25) {
  const planned = new Decimal(plannedHours || 0);
  const avail = new Decimal(packageHoursAvailable || 0);
  const usedFromPackage = Decimal.min(planned, avail);
  const remaining = planned.minus(usedFromPackage);
  const remainingNum = Math.max(0, remaining.toNumber());
  return roundHours(remainingNum, step);
}

/**
 * Compute final price for a booking after deducting package hours.
 * @param {Object} params
 * @param {number} params.plannedHours - planned lesson duration in hours
 * @param {number} params.hourlyRate - service price per hour
 * @param {number} [params.packageHoursAvailable=0] - remaining package hours to deduct
 * @param {number} [params.step=0.25] - rounding step in hours
 * @param {number} [params.participants=1] - participant multiplier (for simple group calc)
 * @returns {number} final price to charge
 */
export function computeBookingPrice({ plannedHours, hourlyRate, packageHoursAvailable = 0, step = 0.25, participants = 1 }) {
  const billableHours = computeChargeableHours(plannedHours, packageHoursAvailable, step);
  const rate = new Decimal(hourlyRate || 0);
  const ppl = new Decimal(participants || 1);
  const price = new Decimal(billableHours).mul(rate).mul(ppl);
  // Keep 2 decimals for currency
  return Number(price.toFixed(2));
}

/**
 * Convenience breakdown for UI/debugging
 */
export function getPricingBreakdown({ plannedHours, hourlyRate, packageHoursAvailable = 0, step = 0.25, participants = 1 }) {
  const usedFromPackage = Math.min(plannedHours || 0, packageHoursAvailable || 0);
  const chargeableHours = computeChargeableHours(plannedHours, packageHoursAvailable, step);
  const total = computeBookingPrice({ plannedHours, hourlyRate, packageHoursAvailable, step, participants });
  return {
    plannedHours: roundHours(plannedHours || 0, step),
    usedFromPackage: roundHours(usedFromPackage, step),
    chargeableHours,
    hourlyRate,
    participants,
    total
  };
}
