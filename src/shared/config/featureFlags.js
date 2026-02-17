const coerceBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
};

export const featureFlags = Object.freeze({
  instructorDashboardRevamp: coerceBoolean(import.meta.env?.VITE_INSTRUCTOR_DASHBOARD_REVAMP, true),
  studentPortal: coerceBoolean(import.meta.env?.VITE_STUDENT_PORTAL, true),
});

export const isFeatureEnabled = (flagName) => {
  if (!flagName) return false;
  if (Object.prototype.hasOwnProperty.call(featureFlags, flagName)) {
    return featureFlags[flagName];
  }
  return false;
};
