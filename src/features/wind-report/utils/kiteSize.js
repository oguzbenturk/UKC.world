export const MIN_WEIGHT = 40;
export const MAX_WEIGHT = 120;
export const WEIGHT_STORAGE_KEY = 'plannivo.windReport.weight';

// Duotone Kiteboarding range — current line-up tops out at 15 m².
export const MIN_KITE_SQM = 5;
export const MAX_KITE_SQM = 15;

export const calcKiteSize = (weight, windKn) => {
  if (!windKn || windKn < 1) return null;
  if (!weight) return null;
  const base = (weight / windKn) * 2.5;
  // Whole integers only — no half sizes (5, 6, 7 … 15)
  return Math.max(MIN_KITE_SQM, Math.min(MAX_KITE_SQM, Math.round(base)));
};

export const initialWeight = (profileWeight) => {
  if (typeof window !== 'undefined') {
    const stored = Number(window.localStorage.getItem(WEIGHT_STORAGE_KEY));
    if (stored >= MIN_WEIGHT && stored <= MAX_WEIGHT) return stored;
  }
  if (profileWeight >= MIN_WEIGHT && profileWeight <= MAX_WEIGHT) return Math.round(profileWeight);
  return 75;
};
