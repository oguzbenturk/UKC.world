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

const deriveEffectivePackageHours = ({
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
}) => {
  const normalizedBase = safeNumber(baseAmount);
  const lessonDuration = safeNumber(duration);

  if (paymentStatus !== 'package') {
    return lessonDuration > 0 ? normalizedBase : 0;
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

export const deriveTotalEarnings = ({ lessonAmount, commissionRate, commissionType = 'percentage', lessonDuration = 1 }) => {
  const amount = safeNumber(lessonAmount);
  const rate = safeNumber(commissionRate);
  const duration = safeNumber(lessonDuration) || 1;
  
  if (rate <= 0) {
    return 0;
  }
  
  let earnings;
  if (commissionType === 'fixed') {
    // Fixed rate: commission_value is the hourly rate (e.g., €40/hour)
    earnings = rate * duration;
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
