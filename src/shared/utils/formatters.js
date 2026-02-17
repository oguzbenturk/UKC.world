// This file centralizes all your helper functions into one place
// to avoid duplication and make maintenance easier

/**
 * Formats a currency value with the appropriate symbol and decimal places
 * @param {number} value - The numeric value to format as currency
 * @param {string} currencyCode - The currency code (default: EUR)
 * @param {string} currencySymbol - The currency symbol to use (optional)
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, currencyCode = null, currencySymbol = null) {
  const numValue = parseFloat(value ?? 0) || 0;
  // If a custom symbol is provided, keep legacy behavior
  if (currencySymbol) {
    return `${currencySymbol}${numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
  const code = (currencyCode
    || (typeof window !== 'undefined' && window.__APP_CURRENCY__ && (window.__APP_CURRENCY__.business || window.__APP_CURRENCY__.user))
    || 'EUR');
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(numValue);
  } catch {
    // Safe fallback
    return `${code}${numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
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
 * Formats a date into a readable string
 * @param {Date|string} date - Date object or date string
 * @param {boolean} includeTime - Whether to include time in the output
 * @returns {string} Formatted date string
 */
export function formatDate(date, includeTime = false) {
  if (!date) return 'N/A';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  
  if (isNaN(dateObj.getTime())) return 'Invalid date';
  
  const options = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(includeTime && { hour: '2-digit', minute: '2-digit' })
  };
  
  return dateObj.toLocaleDateString('en-GB', options);
}

/**
 * Formats a duration in minutes to a readable format
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration string
 */
export function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return 'N/A';
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} hr`;
  return `${hours} hr ${remainingMinutes} min`;
}

/**
 * Formats a percentage for display
 * @param {number} value - The percentage value
 * @returns {string} Formatted percentage string
 */
export function formatModifierPercentage(value) {
  if (value === null || value === undefined) return 'N/A';
  
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return 'Invalid';
  
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
      errors[field] = rules[field].message || 'This field is required';
      isValid = false;
    } else if (rules[field].minLength && data[field]?.length < rules[field].minLength) {
      errors[field] = `Must be at least ${rules[field].minLength} characters`;
      isValid = false;
    } else if (rules[field].pattern && !rules[field].pattern.test(data[field])) {
      errors[field] = rules[field].message || 'Invalid format';
      isValid = false;
    }
  }
  
  return { isValid, errors };
}
