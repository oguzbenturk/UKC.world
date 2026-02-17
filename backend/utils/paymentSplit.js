// Pure helpers for computing package/cash splits and detecting package intent

/**
 * Compute how many hours to consume from package and cash, and cash amount.
 * @param {object} opts
 * @param {number} opts.servicePrice - per-hour service price (EUR)
 * @param {number} opts.duration - booked hours
 * @param {number} opts.packageRemaining - remaining hours in package
 * @param {number} [opts.packagePrice] - package purchase price (EUR), optional for rate
 * @param {number} [opts.packageTotalHours] - total hours in package to compute per-hour package rate
 */
export function splitPackageAndCash({ servicePrice, duration, packageRemaining, packagePrice = 0, packageTotalHours = 0 }) {
  const dur = Math.max(0, Number(duration) || 0);
  const perHour = Math.max(0, Number(servicePrice) || 0);
  const remaining = Math.max(0, Number(packageRemaining) || 0);

  const packageHours = Math.min(dur, remaining);
  const cashHours = Math.max(0, dur - packageHours);

  // Package per-hour rate based on purchase price/totalHours; fallback 0 if unknown
  const pkgRate = packageTotalHours > 0 ? (Number(packagePrice) || 0) / Number(packageTotalHours) : 0;
  const cashAmount = cashHours * perHour - packageHours * Math.max(0, perHour - pkgRate);
  // Guard against tiny negative due to rounding
  return {
    packageHours: Number(packageHours.toFixed(2)),
    cashHours: Number(cashHours.toFixed(2)),
    cashAmount: Number(Math.max(0, cashAmount).toFixed(2)),
  };
}

/**
 * Infer if participant intends to use a package based on flags/fields sent from UI
 */
export function wantsToUsePackage(participant) {
  if (!participant) return false;
  const status = (participant.paymentStatus || '').toString().toLowerCase();
  return participant.usePackage === true
    || participant.usePackage === 'true'
    || !!participant.customerPackageId
    || status === 'package'
    || status === 'partial';
}
