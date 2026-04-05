// src/shared/utils/performance.js
import { logger } from './logger';

/**
 * Performance Optimization Utilities
 */

// Debounce function to limit function calls
export const debounce = (func, wait, immediate = false) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
};

// Throttle function to limit function calls
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Memoization with expiration
export const memoizeWithExpiration = (fn, expiration = 5 * 60 * 1000) => {
  const cache = new Map();
  
  return (...args) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < expiration) {
      return cached.value;
    }
    
    const value = fn(...args);
    cache.set(key, { value, timestamp: Date.now() });
    
    // Clean up expired entries periodically
    if (cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of cache.entries()) {
        if (now - v.timestamp > expiration) {
          cache.delete(k);
        }
      }
    }
    
    return value;
  };
};

// Image lazy loading utility
export const createImageLazyLoader = () => {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.remove('lazy');
          imageObserver.unobserve(img);
        }
      });
    });

    return {
      observe: (img) => imageObserver.observe(img),
      disconnect: () => imageObserver.disconnect()
    };
  }
  
  // Fallback for browsers without IntersectionObserver
  return {
    observe: (img) => {
      img.src = img.dataset.src;
      img.classList.remove('lazy');
    },
    disconnect: () => {}
  };
};

// Virtual scrolling utility for large lists
export class VirtualScroller {
  constructor(container, itemHeight, buffer = 5) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.buffer = buffer;
    this.items = [];
    this.visibleItems = [];
    this.scrollTop = 0;
    this.containerHeight = 0;
    
    this.handleScroll = throttle(this.updateVisibleItems.bind(this), 16);
    this.container.addEventListener('scroll', this.handleScroll);
  }

  setItems(items) {
    this.items = items;
    this.updateVisibleItems();
  }

  updateVisibleItems() {
    this.scrollTop = this.container.scrollTop;
    this.containerHeight = this.container.clientHeight;
    
    const startIndex = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.buffer);
    const endIndex = Math.min(
      this.items.length - 1,
      Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight) + this.buffer
    );
    
    this.visibleItems = this.items.slice(startIndex, endIndex + 1).map((item, index) => ({
      ...item,
      index: startIndex + index
    }));
    
    return this.visibleItems;
  }

  destroy() {
    this.container.removeEventListener('scroll', this.handleScroll);
  }
}

// Bundle size analyzer (development only)
export const analyzeBundleSize = () => {
  if (import.meta.env.MODE === 'development') {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    
    const analysis = {
      scripts: scripts.map(script => ({
        src: script.src,
        async: script.async,
        defer: script.defer
      })),
      styles: styles.map(style => ({
        href: style.href,
        media: style.media
      })),
      totalScripts: scripts.length,
      totalStyles: styles.length
    };
    
    logger.debug('Bundle Analysis', analysis);
    return analysis;
  }
};

// Performance monitoring hooks
export const usePerformanceMonitor = (componentName) => {
  React.useEffect(() => {
    const start = performance.now();
    
    return () => {
      const duration = performance.now() - start;
      if (duration > 100) { // Log components that take > 100ms
        logger.performance(`Component: ${componentName}`, duration);
      }
    };
  }, [componentName]);
};

// Memory usage monitor (disabled by default to reduce console noise)
export const monitorMemoryUsage = (forceLog = false) => {
  if ('memory' in performance) {
    const memInfo = performance.memory;
    const usage = {
      used: Math.round(memInfo.usedJSHeapSize / 1024 / 1024),
      total: Math.round(memInfo.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024)
    };
      // Silent memory monitoring - no console output unless critically high (>150MB)
    if (forceLog || usage.used > 150) {
      logger.warn('Critical memory usage', usage);
    }
    
    return usage;
  }
  return null;
};

// Network quality detection
export const detectNetworkQuality = () => {
  if ('connection' in navigator) {
    const connection = navigator.connection;
    return {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData
    };
  }
  return null;
};

// Preload critical resources
export const preloadResource = (href, as, type = null) => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = as;
  if (type) link.type = type;
  document.head.appendChild(link);
};

// Code splitting utilities
export const loadComponentDynamically = (importFn, fallback = null) => {
  return React.lazy(() => 
    importFn().catch(error => {
      logger.error('Dynamic import failed', { error: error.message });
      return { default: fallback || (() => React.createElement('div', null, 'Failed to load component')) };
    })
  );
};

// Performance metrics collection
export const collectWebVitals = (onPerfEntry) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    }).catch(error => {
      // Web Vitals not available in this environment
    });
  }
};
