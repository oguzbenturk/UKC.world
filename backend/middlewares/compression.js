import compression from 'compression';

/**
 * Compression Middleware for Response Optimization
 * Compresses HTTP responses to reduce bandwidth usage
 */

/**
 * Standard compression middleware with optimized settings
 */
export const compressionMiddleware = compression({
    filter: (req, res) => {
        // Don't compress responses if the client doesn't support it
        if (req.headers['x-no-compression']) {
            return false;
        }
        
        // Don't compress responses for certain content types
        const contentType = res.get('Content-Type');
        if (contentType && (
            contentType.includes('image/') ||
            contentType.includes('video/') ||
            contentType.includes('audio/') ||
            contentType.includes('application/zip') ||
            contentType.includes('application/gzip')
        )) {
            return false;
        }
        
        // Compress responses larger than 1kb
        return compression.filter(req, res);
    },
    level: 6, // Compression level (1-9, 6 is a good balance)
    threshold: 1024, // Only compress responses > 1kb
    chunkSize: 16 * 1024, // 16kb chunks
    windowBits: 15, // Memory usage vs compression ratio
    memLevel: 8, // Memory usage (1-9)
});

/**
 * Cache headers middleware for better client-side caching
 */
export const setCacheHeaders = (options = {}) => {
    const {
        maxAge = 300, // 5 minutes default
        publicCache = false,
        noCache = false,
        staleWhileRevalidate = false
    } = options;

    return (req, res, next) => {
        if (req.method !== 'GET') {
            return next();
        }

        if (noCache) {
            res.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
        } else {
            let cacheControl = publicCache ? 'public' : 'private';
            cacheControl += `, max-age=${maxAge}`;
            
            if (staleWhileRevalidate) {
                cacheControl += `, stale-while-revalidate=${staleWhileRevalidate}`;
            }

            res.set({
                'Cache-Control': cacheControl,
                'ETag': `"${Date.now()}-${Math.random().toString(36).substr(2, 9)}"`,
                'Last-Modified': new Date().toUTCString()
            });
        }

        next();
    };
};

/**
 * Route-specific cache configurations
 */
export const apiCacheHeaders = {
    // Static data - cache for 30 minutes
    services: setCacheHeaders({ maxAge: 1800, publicCache: true, staleWhileRevalidate: 3600 }),
    
    // User data - cache for 5 minutes privately
    users: setCacheHeaders({ maxAge: 300, publicCache: false }),
    
    // Booking data - cache for 1 minute
    bookings: setCacheHeaders({ maxAge: 60, publicCache: false }),
    
    // Financial data - no cache for security
    finances: setCacheHeaders({ noCache: true }),
    
    // Equipment data - cache for 10 minutes
    equipment: setCacheHeaders({ maxAge: 600, publicCache: true }),
    
    // Settings - cache for 1 hour
    settings: setCacheHeaders({ maxAge: 3600, publicCache: false })
};

/**
 * Response optimization middleware that combines compression and caching
 */
export const responseOptimizationMiddleware = (cacheOptions = {}) => {
    return [
        compressionMiddleware,
        setCacheHeaders(cacheOptions)
    ];
};
