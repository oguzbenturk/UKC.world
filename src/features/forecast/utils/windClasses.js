/**
 * Wind speed color classes based on speed thresholds
 */

export const getBeaufortClasses = (speed) => {
  if (speed < 2) return 'bg-sky-100 text-sky-700';
  if (speed < 4) return 'bg-green-100 text-green-700';
  if (speed < 6) return 'bg-lime-100 text-lime-700';
  if (speed < 8) return 'bg-yellow-100 text-yellow-800';
  if (speed < 10) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

export const getKnotsClasses = (normalizedSpeed) => {
  if (normalizedSpeed < 8) return 'bg-sky-100 text-sky-700';
  if (normalizedSpeed < 12) return 'bg-green-100 text-green-700';
  if (normalizedSpeed < 16) return 'bg-lime-100 text-lime-700';
  if (normalizedSpeed < 20) return 'bg-yellow-100 text-yellow-800';
  if (normalizedSpeed < 25) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

export const getWindClasses = (speed, unit = 'knts') => {
  if (speed == null) return 'bg-slate-100 text-slate-600';
  
  // Handle Beaufort scale separately
  if (unit === 'beaufort') {
    return getBeaufortClasses(speed);
  }
  
  // Convert to knots for consistent thresholds
  let normalizedSpeed = speed;
  if (unit === 'kmh') {
    normalizedSpeed = speed / 1.852;
  } else if (unit === 'mph') {
    normalizedSpeed = speed / 1.151;
  }
  
  return getKnotsClasses(normalizedSpeed);
};