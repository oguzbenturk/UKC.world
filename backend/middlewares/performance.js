// backend/middlewares/performance.js
import compression from 'compression';
import { metricsService } from '../services/metricsService.js';
import { logger } from './errorHandler.js';

/**
 * Performance Optimization Middleware
 */

// Response compression
export const compressionMiddleware = compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
});

// Cache control headers
export const cacheControl = (duration = 3600) => {
  return (req, res, next) => {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', `public, max-age=${duration}`);
      res.setHeader('ETag', `W/"${Date.now()}"`);
    }
    next();
  };
};

// API response caching for static data
export const apiCache = (duration = 300) => {
  const cache = new Map();
  
  return (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    
    const key = req.originalUrl;
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < duration * 1000) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }
    
    const originalJson = res.json;
    res.json = function(data) {
      cache.set(key, {
        data,
        timestamp: Date.now()
      });
      res.setHeader('X-Cache', 'MISS');
      originalJson.call(this, data);
    };
    
    next();
  };
};

// Clear cache helper
export const clearCache = (pattern) => {
  // Implementation would depend on caching strategy
  // For now, just a placeholder
  console.log(`Cache cleared for pattern: ${pattern}`);
};

// Performance monitoring middleware
export const performanceMonitor = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  // Set performance header before response finishes
  const originalSend = res.send;
  res.send = function(data) {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    // Log slow requests
    if (duration > 1000) {
      logger.warn(`Slow request: ${req.method} ${req.originalUrl} took ${duration.toFixed(2)}ms`);
    }
    
    // Add performance header before sending response
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

export const responseMetrics = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const cacheStatus = res.getHeader('x-cache') || 'MISS';

    metricsService.recordRequest({
      method: req.method,
      route: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs,
      cacheStatus
    });
  });

  next();
};

// Memory monitoring
export const memoryMonitor = () => {
  const interval = setInterval(() => {
    const used = process.memoryUsage();
    const usage = {
      rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
      external: Math.round(used.external / 1024 / 1024 * 100) / 100
    };
    
    metricsService.recordMemoryUsage(usage);

    // Log memory usage if it's high
    if (usage.heapUsed > 100) {
      logger.warn('High memory usage detected', usage);
    }
  }, 30000); // Check every 30 seconds

  if (typeof interval.unref === 'function') {
    interval.unref();
  }
};

// Database connection pooling optimization
export const optimizeDbPool = (pool) => {
  // Monitor pool metrics only if pool is available
  setInterval(() => {
    if (!pool || typeof pool !== 'object') {
      return; // Skip monitoring if pool is not available
    }
    
    const { totalCount, idleCount, waitingCount } = pool;
    
    if (waitingCount > 5) {
      console.warn('Database pool congestion:', {
        total: totalCount,
        idle: idleCount,
        waiting: waitingCount
      });
    }
  }, 60000); // Check every minute
};
