// Validation for the "Instructor dashboard wind" settings form — mirrors
// validateInstructorDashboardSetting in backend/routes/settings.js.
export const WIND_KN_LIMITS = Object.freeze({ min: 5, max: 40 });

const inRange = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))
  && Number(v) >= WIND_KN_LIMITS.min && Number(v) <= WIND_KN_LIMITS.max;

/** { min?: 'range', max?: 'range', order?: true } — empty object when valid. */
export function validateWindForm({ min, max }) {
  const errors = {};
  if (!inRange(min)) errors.min = 'range';
  if (!inRange(max)) errors.max = 'range';
  if (!errors.min && !errors.max && Number(min) >= Number(max)) errors.order = true;
  return errors;
}
