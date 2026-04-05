// src/shared/utils/requestThrottle.js

/**
 * Simple request throttling utility to prevent rate limiting
 */
class RequestThrottle {
  constructor(maxConcurrent = 1, delayBetweenRequests = 1000) { // Reduced concurrent and increased delay
    this.maxConcurrent = maxConcurrent;
    this.delayBetweenRequests = delayBetweenRequests;
    this.activeRequests = 0;
    this.queue = [];
    this.lastRequestTime = 0;
  }

  async execute(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.queue.length === 0 || this.activeRequests >= this.maxConcurrent) {
      return;
    }

    // Ensure minimum delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.delayBetweenRequests) {
      setTimeout(() => this.processQueue(), this.delayBetweenRequests - timeSinceLastRequest);
      return;
    }

    const { requestFn, resolve, reject } = this.queue.shift();
    this.activeRequests++;
    this.lastRequestTime = Date.now();

    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      // Process next request after a small delay
      setTimeout(() => this.processQueue(), 100);
    }
  }
}

// Global throttle instance with aggressive throttling
const globalThrottle = new RequestThrottle(1, 1000); // Max 1 concurrent, 1000ms between requests

export default globalThrottle;
