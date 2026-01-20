import Redis from 'ioredis';
import { metricsService } from './metricsService.js';

/**
 * Cache Service for Redis Operations
 * Provides a unified interface for caching operations across the application
 * Handles read-only Redis gracefully for development environments
 */
class CacheService {
    constructor() {
        this.isReadOnly = false;
        this.isConnected = false;
        this.isDisabled = process.env.DISABLE_REDIS === 'true';
        
        if (this.isDisabled) {
            console.log('🚫 Redis is disabled via DISABLE_REDIS=true');
            return;
        }
        
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
            lazyConnect: true, // Connect only when needed
        });

        // Handle Redis connection events
        this.redis.on('connect', () => {
            console.log('✅ Redis connected successfully');
            this.isConnected = true;
        });

        this.redis.on('error', (err) => {
            console.error('❌ Redis connection error:', err.message);
            // Check if it's a read-only error
            if (err.message.includes('READONLY')) {
                this.isReadOnly = true;
                console.log('📖 Redis is in read-only mode - write operations will be skipped');
            }
        });

        this.redis.on('close', () => {
            console.log('🔌 Redis connection closed');
            this.isConnected = false;
        });
    }

    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @returns {Object|null} - Parsed cached data or null if not found
     */
    async get(key) {
        if (this.isDisabled) {
            metricsService.recordCacheResult({ bypassed: true });
            return null;
        }
        try {
            const result = await this.redis.get(key);
            const value = result ? JSON.parse(result) : null;
            metricsService.recordCacheResult({ hit: Boolean(result) });
            return value;
        } catch (error) {
            console.error('Cache get error:', error);
            metricsService.recordCacheResult({ bypassed: true });
            return null;
        }
    }

    /**
     * Set a value in cache with TTL
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in seconds (default: 300)
     */
    async set(key, value, ttl = 300) {
        if (this.isDisabled) {
            metricsService.recordCacheResult({ bypassed: true });
            return;
        }
        try {
            // Skip write operations if Redis is read-only
            if (this.isReadOnly) {
                console.log(`📖 Skipping cache SET for ${key} (Redis is read-only)`);
                metricsService.recordCacheResult({ bypassed: true });
                return;
            }
            
            await this.redis.setex(key, ttl, JSON.stringify(value));
        } catch (error) {
            // Check if this is a read-only error
            if (error.message.includes('READONLY')) {
                this.isReadOnly = true;
                console.log('📖 Redis detected as read-only - future write operations will be skipped');
            } else {
                console.error('Cache set error:', error);
            }
            metricsService.recordCacheResult({ bypassed: true });
        }
    }

    /**
     * Delete cache keys by pattern
     * @param {string} pattern - Redis key pattern (e.g., 'user:*')
     */
    async del(pattern) {
        if (this.isDisabled) {
            return;
        }
        try {
            // Skip write operations if Redis is read-only
            if (this.isReadOnly) {
                console.log(`📖 Skipping cache DEL for ${pattern} (Redis is read-only)`);
                return;
            }
            
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } catch (error) {
            // Check if this is a read-only error
            if (error.message.includes('READONLY')) {
                this.isReadOnly = true;
                console.log('📖 Redis detected as read-only - future write operations will be skipped');
            } else {
                console.error('Cache delete error:', error);
            }
            metricsService.recordCacheResult({ bypassed: true });
        }
    }

    /**
     * Increment a counter in cache
     * @param {string} key - Cache key
     * @param {number} increment - Amount to increment (default: 1)
     * @param {number} ttl - TTL for the key if it doesn't exist
     * @returns {number} - New value after increment
     */
    async incr(key, increment = 1, ttl = 3600) {
        try {
            // Skip write operations if Redis is read-only
            if (this.isReadOnly) {
                console.log(`📖 Skipping cache INCR for ${key} (Redis is read-only)`);
                return 0;
            }
            
            const value = await this.redis.incrby(key, increment);
            if (value === increment) {
                // Key was just created, set TTL
                await this.redis.expire(key, ttl);
            }
            return value;
        } catch (error) {
            // Check if this is a read-only error
            if (error.message.includes('READONLY')) {
                this.isReadOnly = true;
                console.log('📖 Redis detected as read-only - future write operations will be skipped');
                return 0;
            } else {
                console.error('Cache increment error:', error);
                return 0;
            }
        }
    }

    /**
     * Check if a key exists in cache
     * @param {string} key - Cache key
     * @returns {boolean} - True if key exists
     */
    async exists(key) {
        try {
            const exists = await this.redis.exists(key) === 1;
            metricsService.recordCacheResult({ hit: exists });
            return exists;
        } catch (error) {
            console.error('Cache exists error:', error);
            metricsService.recordCacheResult({ bypassed: true });
            return false;
        }
    }

    /**
     * Get cache statistics for monitoring
     * @returns {Object} - Cache statistics
     */
    async getStats() {
        try {
            const info = await this.redis.info('memory');
            const keyspace = await this.redis.info('keyspace');
            return {
                memory: info,
                keyspace: keyspace,
                connected: this.redis.status === 'ready'
            };
        } catch (error) {
            console.error('Cache stats error:', error);
            metricsService.recordCacheResult({ bypassed: true });
            return { connected: false };
        }
    }

    /**
     * Clear all cache (use with caution)
     */
    async flush() {
        try {
            // Skip write operations if Redis is read-only
            if (this.isReadOnly) {
                console.log('📖 Skipping cache FLUSH (Redis is read-only)');
                return;
            }
            
            await this.redis.flushall();
            console.log('🧹 Cache cleared successfully');
        } catch (error) {
            // Check if this is a read-only error
            if (error.message.includes('READONLY')) {
                this.isReadOnly = true;
                console.log('📖 Redis detected as read-only - flush operation skipped');
            } else {
                console.error('Cache flush error:', error);
            }
        }
    }

    /**
     * Close Redis connection
     */
    async close() {
        try {
            if (this.isDisabled) return;
            const client = this.redis;
            if (!client || typeof client.quit !== 'function') return;
            await client.quit();
        } catch (error) {
            console.error('Cache close error:', error);
            metricsService.recordCacheResult({ bypassed: true });
        }
    }
}

// Export singleton instance
export const cacheService = new CacheService();
