import { cacheService } from '../services/cacheService.js';

/**
 * Cache middleware for Express routes
 * Automatically caches GET request responses and serves cached data on subsequent requests
 */
export const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
    return async (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        // Generate cache key
        const key = keyGenerator 
            ? keyGenerator(req) 
            : `api:${req.method}:${req.originalUrl}`;
        
        try {
            // Try to get cached response
            const cached = await cacheService.get(key);
            if (cached) {
                return res.json(cached);
            }
            
            // Store original json method
            const originalJsonMethod = res.json;
            
            // Override json method for caching
            res.json = function(data) {
                // Cache the response before sending (don't await, run async)
                if (res.statusCode === 200) {
                    cacheService.set(key, data, ttl).catch(err => 
                        console.warn('Cache set failed:', err)
                    );
                }
                // Call original method with proper context
                return originalJsonMethod.call(this, data);
            };

            next();
        } catch (error) {
            console.error('Cache middleware error:', error);
            next();
        }
    };
};

/**
 * Cache invalidation middleware
 * Invalidates cache patterns when data is modified
 */
export const cacheInvalidationMiddleware = (patterns) => {
    return async (req, res, next) => {
        // Store original methods
        const originalJson = res.json;
        const originalSend = res.send;

        // Override response methods to invalidate cache after successful operations
        const invalidateCache = async () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                for (const pattern of patterns) {
                    const cachePattern = typeof pattern === 'function' ? pattern(req) : pattern;
                    await cacheService.del(cachePattern);
                    console.log(`🧹 Invalidated cache pattern: ${cachePattern}`);
                }
            }
        };

        res.json = function(data) {
            invalidateCache();
            return originalJson.call(this, data);
        };

        res.send = function(data) {
            invalidateCache();
            return originalSend.call(this, data);
        };

        next();
    };
};

/**
 * Cache key generators for common patterns
 */
export const cacheKeyGenerators = {
    /**
     * Generate cache key for user-specific data
     */
    userSpecific: (req) => {
        const userId = req.user?.id || req.params.userId || 'anonymous';
        return `api:user:${userId}:${req.method}:${req.path}`;
    },

    /**
     * Generate cache key for date-range queries
     */
    dateRange: (req) => {
        const { startDate, endDate } = req.query;
        return `api:${req.path}:${startDate || 'all'}:${endDate || 'all'}`;
    },

    /**
     * Generate cache key for booking queries
     */
    bookings: (req) => {
        const { instructorId, startDate, endDate, status } = req.query;
        return `api:bookings:${instructorId || 'all'}:${startDate || 'all'}:${endDate || 'all'}:${status || 'all'}`;
    },

    /**
     * Generate cache key for service listings
     */
    services: (req) => {
        const { category, level } = req.query;
        return `api:services:${category || 'all'}:${level || 'all'}`;
    }
};

/**
 * Common cache invalidation patterns
 */
export const cacheInvalidationPatterns = {
    bookings: ['api:bookings:*', 'api:*bookings*'],
    users: ['api:user:*', 'api:users:*'],
    services: ['api:services:*'],
    instructors: ['api:instructors:*', 'api:user:*'],
    students: ['api:students:*', 'api:user:*'],
    transactions: ['api:transactions:*', 'api:finances:*']
};

/**
 * Rate limiting with Redis
 */
export const rateLimitMiddleware = (maxRequests = 100, windowSeconds = 3600) => {
    return async (req, res, next) => {
        const identifier = req.ip || req.user?.id || 'anonymous';
        const key = `rate_limit:${identifier}`;

        try {
            const requests = await cacheService.incr(key, 1, windowSeconds);
            
            if (requests > maxRequests) {
                return res.status(429).json({
                    error: 'Too many requests',
                    retryAfter: windowSeconds
                });
            }

            // Add rate limit headers
            res.set({
                'X-RateLimit-Limit': maxRequests,
                'X-RateLimit-Remaining': Math.max(0, maxRequests - requests),
                'X-RateLimit-Reset': Date.now() + (windowSeconds * 1000)
            });

            next();
        } catch (error) {
            console.error('Rate limit middleware error:', error);
            next();
        }
    };
};
