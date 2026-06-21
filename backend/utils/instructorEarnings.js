import { logger } from '../middlewares/errorHandler.js';

const safeNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return 0;
  }
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

export const deriveEffectivePackageHours = ({
  packageTotalHours,
  packageRemainingHours,
  packageUsedHours,
  packageSessionsCount,
  fallbackSessionDuration,
}) => {
  const candidates = [];

  const totalHours = safeNumber(packageTotalHours);
  if (totalHours > 0) {
    candidates.push(totalHours);
  }

  const used = safeNumber(packageUsedHours);
  const remaining = safeNumber(packageRemainingHours);
  if (used + remaining > 0) {
    candidates.push(used + remaining);
  }

  const sessions = safeNumber(packageSessionsCount);
  const duration = safeNumber(fallbackSessionDuration);
  if (sessions > 0 && duration > 0) {
    candidates.push(sessions * duration);
  }

  const effective = candidates.find((value) => value > 0);
  return Number.isFinite(effective) && effective > 0 ? effective : 0;
};

export const deriveLessonAmount = ({
  paymentStatus,
  duration,
  baseAmount,
  packagePrice,
  packageTotalHours,
  packageRemainingHours,
  packageUsedHours,
  packageSessionsCount,
  fallbackSessionDuration,
  servicePrice,
  serviceDuration,
}) => {
  const normalizedBase = safeNumber(baseAmount);
  const lessonDuration = safeNumber(duration);

  if (paymentStatus !== 'package') {
    if (lessonDuration > 0 && normalizedBase > 0) return normalizedBase;
    // Fallback: derive from service price when booking has no amount
    const svcPrice = safeNumber(servicePrice);
    const svcDuration = safeNumber(serviceDuration);
    if (svcPrice > 0 && lessonDuration > 0) {
      const derived = svcDuration > 0 ? (svcPrice / svcDuration) * lessonDuration : svcPrice;
      return Number.parseFloat(derived.toFixed(2));
    }
    return 0;
  }

  const price = safeNumber(packagePrice);
  if (price <= 0 || lessonDuration <= 0) {
    return normalizedBase;
  }

  const effectiveHours = deriveEffectivePackageHours({
    packageTotalHours,
    packageRemainingHours,
    packageUsedHours,
    packageSessionsCount,
    fallbackSessionDuration: fallbackSessionDuration || lessonDuration,
  });

  if (effectiveHours > 0) {
    const pricePerHour = price / effectiveHours;
    if (Number.isFinite(pricePerHour) && pricePerHour > 0) {
      const derived = pricePerHour * lessonDuration;
      if (Number.isFinite(derived) && derived > 0) {
        return Number.parseFloat(derived.toFixed(2));
      }
    }
  }

  const sessions = safeNumber(packageSessionsCount);
  if (sessions > 0) {
    const perSession = price / sessions;
    if (Number.isFinite(perSession) && perSession > 0) {
      return Number.parseFloat(perSession.toFixed(2));
    }
  }

  if (normalizedBase > 0) {
    return normalizedBase;
  }

  if (price > 0) {
    logger.debug?.('deriveLessonAmount fallback using package price', { price });
    return Number.parseFloat(price.toFixed(2));
  }

  return 0;
};

/**
 * Realized lesson value for a PARTIAL package booking (some hours drawn from the
 * package, the remaining hours settled in cash).
 *
 * `packageValueFullDuration` is the package-rate value of the WHOLE booked
 * duration (package per-hour rate × duration). The historical bug added the
 * cash on TOP of this full-duration value, which double-counted the hour the
 * cash already paid for — inflating both the manager commission base and any
 * percentage instructor's earnings (e.g. a 2h lesson covering 1 package hour +
 * €60 cash was valued at 2h×rate + €60 instead of ~2h×rate).
 *
 * Here the cash settles the hours the package could not cover, priced at the
 * package per-hour rate: we attribute the cash to the hours it pays for, value
 * only the package-drawn hours at the package rate, and add the cash back. With
 * cash priced at the package rate this collapses to `duration × packageRate`
 * (the cash no longer inflates the total); when the cash exceeds the whole
 * lesson's package value the cash floors the result so we never under-count real
 * money paid.
 */
export const partialLessonValue = ({ packageValueFullDuration, duration, cashAmount }) => {
  const pkgValue = safeNumber(packageValueFullDuration);
  const dur = safeNumber(duration);
  const cash = Math.max(0, safeNumber(cashAmount));
  if (pkgValue <= 0) return Number.parseFloat(cash.toFixed(2));
  if (cash <= 0 || dur <= 0) return Number.parseFloat(pkgValue.toFixed(2));
  const perHour = pkgValue / dur;
  const cashHours = perHour > 0 ? Math.min(dur, cash / perHour) : 0;
  const packageHours = Math.max(0, dur - cashHours);
  return Number.parseFloat((packageHours * perHour + cash).toFixed(2));
};

export const deriveTotalEarnings = ({ lessonAmount, commissionRate, commissionType = 'percentage', lessonDuration = 1 }) => {
  const amount = safeNumber(lessonAmount);
  const rate = safeNumber(commissionRate);
  const duration = safeNumber(lessonDuration) || 1;
  
  if (rate <= 0) {
    return 0;
  }
  
  let earnings;
  if (commissionType === 'fixed' || commissionType === 'fixed_per_hour') {
    // Fixed per hour: commission_value is the hourly rate (e.g., €40/hour).
    // (Aligns with computeInstructorEarnings, which treats 'fixed' and
    // 'fixed_per_hour' identically — previously these were silently valued as a
    // percentage here, badly under/over-paying fixed-rate instructors.)
    earnings = rate * duration;
  } else if (commissionType === 'fixed_per_lesson') {
    // Flat amount per lesson regardless of duration.
    earnings = rate;
  } else {
    // Percentage: commission_value is a percentage of the lesson amount
    if (amount <= 0) {
      return 0;
    }
    earnings = (amount * rate) / 100;
  }
  
  return Number.isFinite(earnings) && earnings > 0 ? Number.parseFloat(earnings.toFixed(2)) : 0;
};

export const toNumber = safeNumber;
