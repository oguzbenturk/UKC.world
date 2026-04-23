import dayjs from 'dayjs';
import i18n from '@/i18n';

// This file centralizes all your helper functions into one place
// to avoid duplication and make maintenance easier

const currentLocale = () => i18n.resolvedLanguage || i18n.language || 'en';

/**
 * Formats a currency value using the active UI locale.
 * @param {number} value
 * @param {string} currencyCode - ISO 4217 code (default: EUR or window.__APP_CURRENCY__)
 * @param {string} currencySymbol - Legacy custom-symbol path (kept for compatibility)
 * @returns {string}
 */
export function formatCurrency(value, currencyCode = null, currencySymbol = null) {
  const numValue = parseFloat(value ?? 0) || 0;
  const hasFraction = Math.abs(numValue - Math.round(numValue)) > 0.005;
  const fractionDigits = hasFraction ? 2 : 0;
  if (currencySymbol) {
    return `${currencySymbol}${numValue.toLocaleString(currentLocale(), {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })}`;
  }
  const code = (currencyCode
    || (typeof window !== 'undefined' && window.__APP_CURRENCY__ && (window.__APP_CURRENCY__.business || window.__APP_CURRENCY__.user))
    || 'EUR');
  try {
    return new Intl.NumberFormat(currentLocale(), {
      style: 'currency',
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(numValue);
  } catch {
    return `${code}${numValue.toLocaleString(currentLocale(), {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })}`;
  }
}

/**
 * Gets a color based on status for consistent styling across components
 * @param {string} status - The status string
 * @returns {string} Color code for the status
 */
export function getStatusColor(status) {
  if (!status) return 'bg-gray-400'; // Default styling for missing status

  const colors = {
    active: 'bg-green-500 text-white',
    completed: 'bg-blue-500 text-white',
    pending: 'bg-yellow-500 text-white',
    cancelled: 'bg-red-500 text-white',
    maintenance: 'bg-purple-500 text-white',
    available: 'bg-green-500 text-white',
    rented: 'bg-blue-500 text-white',
    reserved: 'bg-yellow-500 text-white',
    damaged: 'bg-red-500 text-white',
    repair: 'bg-purple-500 text-white',
    default: 'bg-gray-500 text-white'
  };

  return colors[status.toLowerCase()] || colors.default;
}

/**
 * Formats a date using the active UI locale and the day/month/year format
 * defined in `common:dateFormat`.
 */
export function formatDate(date, includeTime = false) {
  if (!date) return i18n.t('common:table.noData', { defaultValue: 'N/A' });
  const d = dayjs(date);
  if (!d.isValid()) return i18n.t('common:invalidDate', { defaultValue: 'Invalid date' });
  const key = includeTime ? 'common:dateFormat.shortWithTime' : 'common:dateFormat.short';
  return d.format(i18n.t(key));
}

/**
 * Formats a duration in minutes using translated hr/min units.
 */
export function formatDuration(minutes) {
  if (minutes == null) return i18n.t('common:table.noData', { defaultValue: 'N/A' });
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return i18n.t('common:duration.min', { count: remainingMinutes });
  if (remainingMinutes === 0) return i18n.t('common:duration.hr', { count: hours });
  return i18n.t('common:duration.hrMin', { hours, minutes: remainingMinutes });
}

/**
 * Formats a percentage for display
 * @param {number} value - The percentage value
 * @returns {string} Formatted percentage string
 */
export function formatModifierPercentage(value) {
  if (value === null || value === undefined) return i18n.t('common:table.noData', { defaultValue: 'N/A' });

  const numValue = parseFloat(value);
  if (isNaN(numValue)) return i18n.t('common:invalid', { defaultValue: 'Invalid' });

  const formatted = numValue >= 0 ? `+${numValue}%` : `${numValue}%`;
  return formatted;
}

/**
 * Formats a percentage value consistently
 * @param {number} value - The value to format as percentage
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }

  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * Returns a status badge style object based on status
 * @param {string} status - The status string
 * @returns {object} Style object for the badge
 */
export function getStatusBadge(status) {
  const color = getStatusColor(status);

  return {
    backgroundColor: `${color}20`, // Add 20% opacity
    color: color,
    borderColor: color,
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 500,
    fontSize: '0.75rem',
    border: `1px solid ${color}`
  };
}

/**
 * Generic form validation function for handling form errors
 * @param {object} data - The form data to validate
 * @param {object} rules - Validation rules object
 * @returns {object} Object containing errors and whether the validation passed
 */
export function validateForm(data, rules) {
  const errors = {};
  let isValid = true;

  for (const field in rules) {
    if (rules[field].required && (!data[field] || data[field].trim() === '')) {
      errors[field] = rules[field].message || i18n.t('common:validation.required');
      isValid = false;
    } else if (rules[field].minLength && data[field]?.length < rules[field].minLength) {
      errors[field] = i18n.t('common:validation.minLen', { count: rules[field].minLength });
      isValid = false;
    } else if (rules[field].pattern && !rules[field].pattern.test(data[field])) {
      errors[field] = rules[field].message || i18n.t('common:validation.pattern');
      isValid = false;
    }
  }

  return { isValid, errors };
}
