/**
 * Waiver API Service
 * 
 * Handles liability waiver operations:
 * - Fetching waiver templates
 * - Submitting signed waivers
 * - Checking waiver status
 */

import apiClient from '@/shared/services/apiClient';
import { compressSignature } from '@/shared/utils/imageCompression';

const DEFAULT_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 300;

// Cache for waiver templates (to avoid redundant API calls)
const templateCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error) => {
  if (!error) return false;
  if (error.code === 'ERR_CANCELED') return false;

  if (error.response) {
    const status = error.response.status;
    return status >= 500 && status < 600; // retry on server errors
  }

  if (error.request) {
    // No response received (network issue)
    return true;
  }

  return false;
};

async function requestWithRetry(requestFn, { retries = DEFAULT_RETRY_ATTEMPTS, delay = BASE_RETRY_DELAY_MS } = {}) {
  let attempt = 0;
  let lastError;

  while (attempt < retries) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === retries - 1) {
        throw error;
      }

      const backoffDelay = delay * 2 ** attempt;
      await wait(backoffDelay);
      attempt += 1;
    }
  }

  throw lastError;
}

/**
 * Get the latest active waiver template with caching
 * @param {string} language - Language code (default: 'en')
 * @param {boolean} forceRefresh - Skip cache and fetch fresh data
 * @returns {Promise<Object>} Waiver template with content and version
 */
export const getWaiverTemplate = async (language = 'en', forceRefresh = false) => {
  const cacheKey = `template_${language}`;
  
  // Check cache first (unless force refresh)
  if (!forceRefresh && templateCache.has(cacheKey)) {
    const cached = templateCache.get(cacheKey);
    const age = Date.now() - cached.timestamp;
    
    if (age < CACHE_TTL_MS) {
      return cached.data;
    }
  }
  
  try {
    const response = await requestWithRetry(() =>
      apiClient.get('/waivers/template', {
        params: { language },
      })
    );
    
    const data = response.data.data;
    
    // Store in cache
    templateCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
    
    return data;
  } catch (error) {
    throw new Error(mapError(error));
  }
};

/**
 * Get a specific waiver version by ID
 * @param {string} versionId - UUID of the waiver version
 * @param {string} language - Language code (default: 'en')
 * @returns {Promise<Object>} Specific waiver version
 */
export const getWaiverVersion = async (versionId, language = 'en') => {
  try {
    const response = await requestWithRetry(() =>
      apiClient.get(`/waivers/template/${versionId}`, {
        params: { language },
      })
    );
    return response.data.data;
  } catch (error) {
    throw new Error(mapError(error));
  }
};

/**
 * Submit a signed waiver with automatic signature compression
 * @param {Object} waiverData - Waiver submission data
 * @param {string} waiverData.user_id - User ID (optional if family_member_id provided)
 * @param {string} waiverData.family_member_id - Family member ID (optional if user_id provided)
 * @param {string} waiverData.waiver_version - Waiver version string
 * @param {string} waiverData.language_code - Language code
 * @param {string} waiverData.signature_data - Base64 encoded signature image (PNG)
 * @param {boolean} waiverData.agreed_to_terms - Must be true
 * @param {boolean} waiverData.photo_consent - Optional photo consent
 * @param {boolean} skipCompression - Skip signature compression (default: false)
 * @returns {Promise<Object>} Submission confirmation with signature ID
 */
export const submitWaiver = async (waiverData, { skipCompression = false } = {}) => {
  try {
    // Compress signature before submission to reduce upload size
    const processedData = { ...waiverData };
    
    if (!skipCompression && waiverData.signature_data) {
      processedData.signature_data = await compressSignature(waiverData.signature_data);
    }
    
    const response = await requestWithRetry(() => apiClient.post('/waivers/submit', processedData));
    return response.data.data;
  } catch (error) {
    throw new Error(mapError(error));
  }
};

/**
 * Check waiver status for a user or family member
 * @param {string} userId - UUID of user or family member
 * @param {string} type - Type: 'user' or 'family_member' (default: 'user')
 * @returns {Promise<Object>} Waiver status information
 */
export const checkWaiverStatus = async (userId, type = 'user') => {
  try {
    const response = await requestWithRetry(() =>
      apiClient.get(`/waivers/status/${userId}`, {
        params: { type },
      })
    );
    return response.data.data;
  } catch (error) {
    throw new Error(mapError(error));
  }
};

/**
 * Check if user needs to sign waiver (simplified)
 * @param {string} userId - UUID of user or family member
 * @param {string} type - Type: 'user' or 'family_member' (default: 'user')
 * @returns {Promise<boolean>} True if waiver signature is required
 */
export const needsToSignWaiver = async (userId, type = 'user') => {
  try {
    const response = await requestWithRetry(() =>
      apiClient.get(`/waivers/check/${userId}`, {
        params: { type },
      })
    );
    return response.data.needsWaiver;
  } catch (error) {
    throw new Error(mapError(error));
  }
};

/**
 * Get waiver history for a user
 * @param {string} userId - UUID of user or family member
 * @param {string} type - Type: 'user' or 'family_member' (default: 'user')
 * @returns {Promise<Array>} Array of waiver signatures
 */
export const getWaiverHistory = async (userId, type = 'user') => {
  try {
    const response = await requestWithRetry(() =>
      apiClient.get(`/waivers/history/${userId}`, {
        params: { type },
      })
    );
    return response.data.data;
  } catch (error) {
    throw new Error(mapError(error));
  }
};

/**
 * Validate waiver submission data before sending to API
 * @param {Object} data - Waiver data to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validateWaiverSubmission = (data) => {
  const errors = [];

  // Must have either user_id or family_member_id
  if (!data.user_id && !data.family_member_id) {
    errors.push('Either user_id or family_member_id is required');
  }

  // Both cannot be provided
  if (data.user_id && data.family_member_id) {
    errors.push('Cannot provide both user_id and family_member_id');
  }

  // Waiver version is required
  if (!data.waiver_version || typeof data.waiver_version !== 'string') {
    errors.push('Waiver version is required');
  }

  // Language code is required
  if (!data.language_code || typeof data.language_code !== 'string') {
    errors.push('Language code is required');
  }

  // Signature data is required and must be base64 PNG
  if (!data.signature_data || typeof data.signature_data !== 'string') {
    errors.push('Signature data is required');
  } else if (!data.signature_data.startsWith('data:image/png;base64,')) {
    errors.push('Signature must be a base64 encoded PNG image');
  }

  // Must agree to terms
  if (data.agreed_to_terms !== true) {
    errors.push('You must agree to the terms');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Convert signature canvas to base64 PNG data
 * @param {Object} signatureRef - React ref to SignatureCanvas
 * @returns {string|null} Base64 PNG data or null if empty
 */
export const getSignatureData = (signatureRef) => {
  if (!signatureRef || !signatureRef.current) {
    return null;
  }

  // Check if signature is empty
  if (signatureRef.current.isEmpty()) {
    return null;
  }

  // Get base64 PNG data
  return signatureRef.current.toDataURL('image/png');
};

/**
 * Clear signature canvas
 * @param {Object} signatureRef - React ref to SignatureCanvas
 */
export const clearSignature = (signatureRef) => {
  if (signatureRef && signatureRef.current) {
    signatureRef.current.clear();
  }
};

/**
 * Extract error message from API error response
 * @param {Error} error - Axios error object
 * @returns {string} Error message
 */
const mapError = (error) => {
  if (error.response) {
    // Server responded with error
    const message = error.response.data?.error 
      || error.response.data?.message 
      || 'An error occurred while processing your request';
    return message;
  } else if (error.request) {
    // Request made but no response
    return 'Unable to connect to server. Please check your internet connection.';
  } else {
    // Error in request setup
    return error.message || 'An unexpected error occurred';
  }
};

// Export all functions
export default {
  getWaiverTemplate,
  getWaiverVersion,
  submitWaiver,
  checkWaiverStatus,
  needsToSignWaiver,
  getWaiverHistory,
  validateWaiverSubmission,
  getSignatureData,
  clearSignature,
};
