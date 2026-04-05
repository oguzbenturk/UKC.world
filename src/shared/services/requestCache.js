// src/shared/services/requestCache.js
/**
 * Request Cache Manager
 * Prevents duplicate API requests and implements request debouncing
 */

class RequestCache {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.debounceTimers = new Map();
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    this.DEBOUNCE_DURATION = 100; // 100ms
  }

  /**
   * Get cache key for a request
   */
  getCacheKey(config) {
    const { method, url, params, data } = config;
    return `${method}-${url}-${JSON.stringify(params || {})}-${JSON.stringify(data || {})}`;
  }

  /**
   * Check if cached response is still valid
   */
  isCacheValid(cacheEntry) {
    return Date.now() - cacheEntry.timestamp < this.CACHE_DURATION;
  }

  /**
   * Get cached response if available and valid
   */
  getCachedResponse(config) {
    const key = this.getCacheKey(config);
    const cacheEntry = this.cache.get(key);
    
    if (cacheEntry && this.isCacheValid(cacheEntry)) {
      return Promise.resolve(cacheEntry.response);
    }
    
    return null;
  }

  /**
   * Cache a response
   */
  cacheResponse(config, response) {
    const key = this.getCacheKey(config);
    this.cache.set(key, {
      response: { ...response },
      timestamp: Date.now()
    });
  }

  /**
   * Get or create a pending request to prevent duplicates
   */
  getPendingRequest(config, requestFn) {
    const key = this.getCacheKey(config);
    
    // If there's already a pending request, return it
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }
    
    // Create new request and cache it
    const requestPromise = requestFn()
      .then(response => {
        // Cache successful response
        this.cacheResponse(config, response);
        // Remove from pending requests
        this.pendingRequests.delete(key);
        return response;
      })
      .catch(error => {
        // Remove from pending requests on error
        this.pendingRequests.delete(key);
        throw error;
      });
    
    this.pendingRequests.set(key, requestPromise);
    return requestPromise;
  }

  /**
   * Debounce a request
   */
  debounceRequest(config, requestFn) {
    const key = this.getCacheKey(config);
    
    return new Promise((resolve, reject) => {
      // Clear existing timer
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key));
      }
      
      // Set new timer
      const timer = setTimeout(async () => {
        try {
          this.debounceTimers.delete(key);
          
          // Check cache first
          const cachedResponse = this.getCachedResponse(config);
          if (cachedResponse) {
            resolve(await cachedResponse);
            return;
          }
          
          // Execute request with deduplication
          const response = await this.getPendingRequest(config, requestFn);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      }, this.DEBOUNCE_DURATION);
      
      this.debounceTimers.set(key, timer);
    });
  }

  /**
   * Clear cache for specific patterns
   */
  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    
    for (const [key, value] of this.cache.entries()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all pending requests
   */
  clearPendingRequests() {
    this.pendingRequests.clear();
    
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      debounceTimers: this.debounceTimers.size
    };
  }
}

// Export singleton instance
export const requestCache = new RequestCache();
export default requestCache;
