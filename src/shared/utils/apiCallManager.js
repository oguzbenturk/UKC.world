// src/shared/utils/apiCallManager.js
/**
 * API Call Manager to prevent duplicate/overlapping API calls
 * and implement caching to reduce server load
 */

class ApiCallManager {  constructor() {
    this.pendingCalls = new Map();
    this.cache = new Map();
    this.cacheTimeout = 30000; // Increased from 5 seconds to 30 seconds cache
  }

  /**
   * Execute an API call with deduplication and caching
   * @param {string} key - Unique identifier for the API call
   * @param {Function} apiCall - The API function to call
   * @param {number} cacheTime - Cache time in ms (default: 5000)
   * @returns {Promise} The API call result
   */
  async execute(key, apiCall, cacheTime = this.cacheTimeout) {
    // Check if we have a cached result
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cacheTime) {
      return cached.data;
    }

    // Check if there's already a pending call for this key
    if (this.pendingCalls.has(key)) {
      return this.pendingCalls.get(key);
    }

    // Create the API call promise
    const promise = apiCall()
      .then(result => {
        // Cache the result
        this.cache.set(key, {
          data: result,
          timestamp: Date.now()
        });
        return result;
      })
      .catch(error => {
        // Don't cache errors
        throw error;
      })
      .finally(() => {
        // Remove from pending calls
        this.pendingCalls.delete(key);
      });

    // Store the pending promise
    this.pendingCalls.set(key, promise);

    return promise;
  }

  /**
   * Clear cache for a specific key or all cache
   * @param {string} key - Optional key to clear, if not provided clears all
   */
  clearCache(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Clear expired cache entries
   */
  cleanExpiredCache() {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }
}

// Create a singleton instance
export const apiCallManager = new ApiCallManager();

// Clean expired cache every 30 seconds
setInterval(() => {
  apiCallManager.cleanExpiredCache();
}, 30000);

export default apiCallManager;
