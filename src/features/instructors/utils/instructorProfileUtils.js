/**
 * Utility functions for instructor profile components
 * Centralizes common formatting and validation logic
 */

/**
 * Format currency with proper symbol and locale
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: business currency)
 * @returns {string} Formatted currency string
 */
import { formatCurrency as globalFormatCurrency } from '@/shared/utils/formatters';

export const formatCurrency = (amount, currency) => {
  const defaultCurrency = (typeof window !== 'undefined' && window.__APP_CURRENCY__?.businessCurrency) || 'EUR';
  return globalFormatCurrency(Number(amount) || 0, currency || defaultCurrency);
};

/**
 * Format commission display (percentage or fixed amount)
 * @param {number} value - Commission value
 * @param {string} type - Commission type ('percentage' or 'fixed')
 * @returns {string} Formatted commission string
 */
export const formatCommission = (value, type) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 'Not set';
  }
  
  if (type === 'percentage') {
    return `${value}%`;
  } else if (type === 'fixed') {
    return formatCurrency(value);
  }
  
  return value.toString();
};

/**
 * Calculate commission amount based on lesson price
 * @param {number} lessonPrice - Base lesson price
 * @param {number} commissionValue - Commission value
 * @param {string} commissionType - Commission type ('percentage', 'fixed', 'fixed_per_hour', 'fixed_per_lesson')
 * @param {number} duration - Duration in hours (used for 'fixed' and 'fixed_per_hour' types)
 * @returns {number} Calculated commission amount
 */
export const calculateCommission = (lessonPrice, commissionValue, commissionType, duration = 1) => {
  if (!commissionValue) {
    return 0;
  }
  
  if (commissionType === 'percentage') {
    if (!lessonPrice) return 0;
    return (lessonPrice * commissionValue) / 100;
  } else if (commissionType === 'fixed_per_lesson') {
    // Flat rate regardless of duration
    return commissionValue;
  } else if (commissionType === 'fixed' || commissionType === 'fixed_per_hour') {
    // Per hour rate - multiply by duration
    return commissionValue * (duration || 1);
  }
  
  return 0;
};

/**
 * Validate commission values
 * @param {number} value - Commission value to validate
 * @param {string} type - Commission type
 * @returns {object} Validation result with isValid and message
 */
export const validateCommission = (value, type) => {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, message: 'Commission value is required' };
  }
  
  const numValue = parseFloat(value);
  
  if (isNaN(numValue)) {
    return { isValid: false, message: 'Commission value must be a number' };
  }
  
  if (numValue < 0) {
    return { isValid: false, message: 'Commission value cannot be negative' };
  }
  
  if (type === 'percentage' && numValue > 100) {
    return { isValid: false, message: 'Percentage cannot exceed 100%' };
  }
  
  if (type === 'fixed' && numValue > 10000) {
    return { isValid: false, message: 'Fixed amount seems unreasonably high' };
  }
  
  return { isValid: true, message: '' };
};

/**
 * Format date for display in instructor profile
 * @param {string|Date} date - Date to format
 * @param {string} format - Format type ('short', 'long', 'month-year')
 * @returns {string} Formatted date string
 */
export const formatProfileDate = (date, format = 'short') => {
  if (!date) return 'N/A';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }
  
  const options = {
    short: { year: 'numeric', month: 'short', day: 'numeric' },
    long: { year: 'numeric', month: 'long', day: 'numeric' },
    'month-year': { year: 'numeric', month: 'long' }
  };
  
  return dateObj.toLocaleDateString('en-US', options[format] || options.short);
};

/**
 * Format duration in hours to human-readable string
 * @param {number} hours - Duration in hours
 * @returns {string} Formatted duration string
 */
export const formatDuration = (hours) => {
  if (!hours || isNaN(hours)) return '0h';
  
  const numHours = parseFloat(hours);
  
  if (numHours < 1) {
    const minutes = Math.round(numHours * 60);
    return `${minutes}m`;
  }
  
  if (numHours % 1 === 0) {
    return `${numHours}h`;
  }
  
  const wholeHours = Math.floor(numHours);
  const minutes = Math.round((numHours - wholeHours) * 60);
  return `${wholeHours}h ${minutes}m`;
};

/**
 * Get status color for various instructor-related statuses
 * @param {string} status - Status value
 * @param {string} type - Status type ('booking', 'payment', 'instructor')
 * @returns {string} Ant Design color for Tag component
 */
export const getStatusColor = (status, type = 'booking') => {
  if (!status) return 'default';
  
  const statusColors = {
    booking: {
      pending: 'orange',
      confirmed: 'blue',
      'checked-in': 'cyan',
      completed: 'green',
      cancelled: 'red'
    },
    payment: {
      paid: 'green',
      package: 'blue',
      partial: 'orange',
      refunded: 'purple',
      overdue: 'red'
    },
    instructor: {
      active: 'green',
      inactive: 'red',
      pending: 'orange',
      suspended: 'red'
    }
  };
  
  return statusColors[type]?.[status.toLowerCase()] || 'default';
};

/**
 * Calculate statistics for instructor performance
 * @param {Array} earnings - Array of earnings data
 * @param {Array} lessons - Array of lessons data
 * @returns {object} Calculated statistics
 */
export const calculateInstructorStats = (earnings = [], lessons = []) => {
  const totalEarnings = earnings.reduce((sum, e) => sum + parseFloat(e.commission_amount || 0), 0);
  const completedLessons = lessons.filter(l => l.status === 'completed').length;
  const totalHours = lessons.reduce((sum, l) => sum + parseFloat(l.duration || 0), 0);
  const avgEarningsPerLesson = completedLessons > 0 ? totalEarnings / completedLessons : 0;
  const avgEarningsPerHour = totalHours > 0 ? totalEarnings / totalHours : 0;
  
  // Recent activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentLessons = lessons.filter(l => new Date(l.date) >= thirtyDaysAgo);
  
  return {
    totalEarnings,
    completedLessons,
    totalHours,
    avgEarningsPerLesson,
    avgEarningsPerHour,
    recentActivity: recentLessons.length,
    utilizationRate: totalHours > 0 ? (completedLessons / (totalHours / 1.5)) * 100 : 0 // Assuming 1.5h avg lesson
  };
};

/**
 * Export data to CSV format
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Filename for the export
 * @param {Array} columns - Optional column configuration
 */
export const exportToCSV = (data, filename, columns = null) => {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }
  
  let headers, rows;
  
  if (columns) {
    headers = columns.map(col => col.title || col.key);
    rows = data.map(item => 
      columns.map(col => {
        const value = item[col.dataIndex || col.key];
        return typeof value === 'object' ? JSON.stringify(value) : (value || '');
      })
    );
  } else {
    headers = Object.keys(data[0]);
    rows = data.map(item => 
      headers.map(header => {
        const value = item[header];
        return typeof value === 'object' ? JSON.stringify(value) : (value || '');
      })
    );
  }
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(field => `"${field}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

/**
 * Generate user-friendly error messages for instructor profile operations
 * @param {Error} error - Error object
 * @param {string} operation - Operation that failed
 * @returns {string} User-friendly error message
 */
// eslint-disable-next-line complexity
export const getInstructorErrorMessage = (error, operation = 'operation') => {
  if (!error) return `Failed to complete ${operation}. Please try again.`;
  
  if (error.response) {
    const status = error.response.status;
    const message = error.response.data?.message || error.response.data?.error;
    
    switch (status) {
      case 400:
        return `Invalid data provided for ${operation}. Please check your inputs.`;
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return `You don't have permission to perform this ${operation}.`;
      case 404:
        return `The requested instructor data was not found.`;
      case 409:
        return message || `Conflict occurred during ${operation}. Please check for duplicates.`;
      case 500:
        return `Server error occurred during ${operation}. Please contact support if this persists.`;
      default:
        return message || `Failed to complete ${operation}. Please try again.`;
    }
  }
  
  if (error.request) {
    return `Unable to connect to the server. Please check your internet connection.`;
  }
  
  return error.message || `An unexpected error occurred during ${operation}.`;
};
