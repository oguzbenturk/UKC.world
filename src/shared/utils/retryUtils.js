// src/shared/utils/retryUtils.js
/**
 * Retry utility with exponential backoff
 * Specifically designed to handle rate limiting (429) errors
 */

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the specified time
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 10000)
 * @param {Function} options.shouldRetry - Function to determine if error should trigger retry
 * @returns {Promise} Promise that resolves with the function result or rejects with the final error
 */
export const retryWithBackoff = async (fn, options = {}) => {
  const {
    maxRetries = 2, // Reduced from 3 to 2
    baseDelay = 2000, // Increased from 1000 to 2000
    maxDelay = 15000, // Increased from 10000 to 15000
    shouldRetry = (error) => {
      // By default, retry on rate limiting (429) and network errors
      return error.response?.status === 429 || 
             error.code === 'NETWORK_ERROR' ||
             !error.response; // Network timeout or connection error
    }
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error;
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );
      
      console.warn(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError;
};

/**
 * Retry specifically for API calls with rate limiting awareness
 * @param {Function} apiCall - API call function
 * @param {Object} options - Retry options (same as retryWithBackoff)
 * @returns {Promise} Promise that resolves with the API response
 */
export const retryApiCall = (apiCall, options = {}) => {
  return retryWithBackoff(apiCall, {
    maxRetries: 2, // Reduced from 3 to 2
    baseDelay: 3000, // Increased from 2000 to 3000
    maxDelay: 20000, // Increased from 15000 to 20000
    shouldRetry: (error) => {
      const status = error.response?.status;
      // Retry on rate limiting, server errors, and network issues
      return status === 429 || 
             status >= 500 ||
             error.code === 'NETWORK_ERROR' ||
             !error.response;
    },
    ...options
  });
};

/**
 * Create a debounced version of a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
};

/**
 * Create a throttled version of a function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export const throttle = (fn, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

export default {
  retryWithBackoff,
  retryApiCall,
  debounce,
  throttle,
  sleep
};
