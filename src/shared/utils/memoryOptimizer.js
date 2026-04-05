/**
 * Memory optimization utilities for development monitoring
 */

class MemoryOptimizer {
  static logMemoryUsage(label = 'Memory Usage') {
    if (typeof performance !== 'undefined' && performance.memory) {
      const memory = performance.memory;
      console.log(`🧠 ${label}:`, {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
        usage: `${((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1)}%`
      });
      
      // Warn if memory usage is high
      const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      if (usagePercent > 70) {
        console.warn(`⚠️ High memory usage detected: ${usagePercent.toFixed(1)}%`);
      }
    }
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  static clearLargeObjects(...objects) {
    objects.forEach(obj => {
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
          delete obj[key];
        });
      }
    });
  }

  static startMemoryMonitoring(interval = 30000) {
    if (process.env.NODE_ENV !== 'development') return;
    
    const monitor = () => {
      this.logMemoryUsage('Periodic Memory Check');
    };
    
    const monitorInterval = setInterval(monitor, interval);
    
    // Return cleanup function
    return () => clearInterval(monitorInterval);
  }
}

export default MemoryOptimizer;
