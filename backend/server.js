import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import { createServer } from 'http';
import { pool } from './db.js';

// Import services
import { cacheService } from './services/cacheService.js';
import socketService from './services/socketService.js';
import BackupService from './services/backupService.js';
import ExchangeRateService from './services/exchangeRateService.js';
import { reconciliationService } from './services/financialReconciliationService.js';

// Initialize background services
ExchangeRateService.startScheduler();

// Import routes
import authRouter, { authenticateJWT } from './routes/auth.js';
import twoFactorRouter from './routes/twoFactor.js';
import usersRouter from './routes/users.js';
import bookingsRouter from './routes/bookings.js';
import equipmentRouter from './routes/equipment.js';
import instructorsRouter from './routes/instructors.js';
import instructorFeatureRouter from './routes/instructor.js';
import studentsRouter from './routes/students.js';
import studentPortalRouter from './routes/studentPortal.js';
import financesRouter from './routes/finances.js';
import rentalsRouter from './routes/rentals.js';
import eventsRouter from './routes/events.js';
import financeDailyOperationsRouter from './routes/financeDailyOperations.js';
import accommodationRouter from './routes/accommodation.js';
import systemRouter from './routes/system.js';
import settingsRouter from './routes/settings.js';
import financeSettingsRouter from './routes/financialSettings.js';
import servicesRouter from './routes/services.js';
import productsRouter from './routes/products.js';
import ratingsRouter from './routes/ratings.js';
import rolesRouter from './routes/roles.js';
import uploadRouter from './routes/upload.js';
import instructorCommissionsRouter from './routes/instructorCommissions.js';
import debugRouter from './routes/debug.js';
import currenciesRouter from './routes/currencies.js';
import popupsRouter from './routes/popups.js';
import sparePartsRouter from './routes/spareParts.js';
import weatherRouter from './routes/weather.js';
import adminReconciliationRouter from './routes/admin-reconciliation.js';
import dashboardRouter from './routes/dashboard.js';
import notificationRealtimeService from './services/notificationRealtimeService.js';
import notificationsRouter from './routes/notifications.js';
import metricsRouter from './routes/metrics.js';
import notificationWorkersRouter from './routes/notification-workers.js';
import userConsentsRouter from './routes/userConsents.js';
import gdprRouter from './routes/gdpr.js';
import familyRouter from './routes/family.js';
import waiversRouter from './routes/waivers.js';
import auditLogsRouter from './routes/auditLogs.js';
import adminWaiversRouter from './routes/adminWaivers.js';
import adminSupportTicketsRouter from './routes/adminSupportTickets.js';
import walletRouter from './routes/wallet.js';
import paymentWebhooksRouter from './routes/paymentWebhooks.js';
import groupBookingsRouter from './routes/groupBookings.js';
import vouchersRouter from './routes/vouchers.js';
import managerCommissionsRouter from './routes/managerCommissions.js';
import memberOfferingsRouter from './routes/memberOfferings.js';
import repairRequestsRouter from './routes/repairRequests.js';
import marketingRouter from './routes/marketing.js';
import quickLinksRouter from './routes/quickLinks.js';
import userRelationshipsRouter from './routes/userRelationships.js';
import chatRouter from './routes/chat.js';
import shopOrdersRouter from './routes/shopOrders.js';
import MessageCleanupService from './services/messageCleanupService.js';
import './services/alerts/notificationAlertService.js';
import { 
  securityHeaders, 
  apiRateLimit, 
  authRateLimit,
  securityResponseHeaders,
  configureCORS
} from './middlewares/security.js';
import { 
  globalErrorHandler, 
  handleNotFound, 
  requestLogger,
  logger 
} from './middlewares/errorHandler.js';
import { triggerFinancialReconciliation } from './middlewares/financialReconciliation.js';
import { 
  memoryMonitor,
  optimizeDbPool,
  responseMetrics
} from './middlewares/performance.js';
import metricsService from './services/metricsService.js';

const app = express();
const server = createServer(app);

// Configure trust proxy for Docker/nginx setup
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Disable ETag generation for dynamic API responses to avoid 304 Not Modified
// and ensure clients always receive fresh JSON payloads
app.disable('etag');

logger.info('🔍 DEBUG: Trust proxy configuration: ' + JSON.stringify(app.get('trust proxy')));
logger.info('🔍 DEBUG: Environment: ' + (process.env.NODE_ENV || 'development'));

// Load environment variables
dotenv.config();

// Start metrics aggregation (logs every 60s)
metricsService.start(parseInt(process.env.METRICS_WINDOW_MS, 10) || 60000);

// Initialize Socket.IO for real-time updates
socketService.initialize(server);
notificationRealtimeService.initialize().catch((error) => {
  logger.error('Failed to start notification realtime service:', error);
});

// Initialize Redis Cache Service
const initializeCache = async () => {
  logger.info('🚀 Initializing Redis Cache Service...');
  try {
    // Test cache connection with read operation first
  const _existingData = await cacheService.get('server:startup');
    
    // Try a write operation to test if Redis is read-only
    await cacheService.set('server:startup', { timestamp: new Date().toISOString() }, 60);
    const testResult = await cacheService.get('server:startup');
    
    if (testResult) {
  logger.info('✅ Redis Cache Service initialized successfully (read/write)');
    } else {
  logger.info('✅ Redis Cache Service initialized (read-only mode)');
    }
  } catch (error) {
    if (error.message.includes('READONLY')) {
  logger.info('📖 Redis Cache Service initialized in read-only mode');
  logger.info('📝 Write operations will be skipped, reads will continue normally');
    } else {
  logger.warn('⚠️ Redis Cache Service initialization failed: ' + error.message);
  logger.warn('📝 Application will continue without caching');
    }
  }
};

// Initialize cache (non-blocking)
initializeCache();

// Initialize Backup Service
const initializeBackupService = async () => {
  logger.info('🚀 Initializing Backup Service...');
  try {
    const backupService = new BackupService();
    await backupService.initialize();
  logger.info('✅ Backup Service initialized successfully');
  logger.info('📅 Daily backups scheduled at 2:00 AM');
  logger.info('🗑️ Monthly cleanup scheduled for 1st day at 3:00 AM');
  } catch (error) {
  logger.warn('⚠️ Backup Service initialization failed: ' + error.message);
  logger.warn('📝 Application will continue without automatic backups');
  }
};

// Initialize backup service (non-blocking) if enabled
if (process.env.BACKUPS_ENABLED !== 'false') {
  initializeBackupService();
} else {
  logger.info('⏸️ Backup Service disabled by env (BACKUPS_ENABLED=false)');
}

// Initialize Exchange Rate Service
// No try-catch needed here strictly as startScheduler only registers cron jobs
logger.info('💱 Initializing Exchange Rate Service...');
ExchangeRateService.startScheduler();

// Initialize Financial Reconciliation Service
const initializeReconciliationService = async () => {
  logger.info('🔧 Initializing Financial Reconciliation Service...');
  try {
    // Start periodic reconciliation (every 60 minutes by default)
    const intervalMinutes = parseInt(process.env.RECONCILIATION_INTERVAL_MINUTES, 10) || 60;
    reconciliationService.startPeriodicReconciliation(intervalMinutes);
    logger.info('✅ Financial Reconciliation Service initialized successfully');
    logger.info(`🔄 Periodic reconciliation scheduled every ${intervalMinutes} minutes`);
  } catch (error) {
    logger.warn('⚠️ Financial Reconciliation Service initialization failed: ' + error.message);
    logger.warn('📝 Application will continue without automated reconciliation');
  }
};

// Initialize reconciliation service (non-blocking) if enabled
if (process.env.RECONCILIATION_ENABLED !== 'false') {
  initializeReconciliationService();
} else {
  logger.info('⏸️ Financial Reconciliation Service disabled by env (RECONCILIATION_ENABLED=false)');
}

// === SECURITY MIDDLEWARE (Applied First) ===
// Security headers
app.use(securityHeaders);
app.use(securityResponseHeaders);

// Request compression
app.use(compression());

// Performance monitoring (temporarily disabled)
// app.use(performanceMonitor);

// Request logging
app.use(requestLogger);

// Response time and cache metrics
app.use(responseMetrics);

// CORS configuration
app.use(cors(configureCORS()));

// Rate limiting - TEMPORARILY DISABLED FOR DEBUGGING
app.use('/api/auth', authRateLimit); // Stricter for auth routes (now dummy middleware)
app.use('/api', apiRateLimit); // General API rate limiting (now dummy middleware)

// Body parsing with size limits (keep raw body for webhook signature validation)
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (buf && buf.length > 0) {
      req.rawBody = buf.toString('utf8');
    } else {
      req.rawBody = '';
    }
  }
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  verify: (req, res, buf) => {
    if (buf && buf.length > 0) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));

// Prevent caching on all API endpoints (dynamic data)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Input sanitization
// app.use(sanitizeInput); // TEMPORARILY DISABLED - CAUSING HANGS

// Make socketService available to routes via middleware
app.use((req, res, next) => {
  req.socketService = socketService;
  next();
});

// Health check endpoint for Docker
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// Serve uploaded files (avatars, images) statically
// Diagnostic wrapper for static uploads to help investigate 404 issues in production
const uploadsRoot = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', (req, res, next) => {
  try {
    const fsPath = path.join(uploadsRoot, req.path); // req.path excludes '/uploads'
    // Synchronously check existence (fast path, small files); fallback to async if desired later
    let exists = false;
    try { exists = fs.existsSync(fsPath); } catch { exists = false; }
    logger.info('[uploads-access]', { url: req.originalUrl, method: req.method, fileSystemPath: fsPath, exists });
  } catch (e) {
    logger.warn('[uploads-access-error] failed pre-check', { error: e.message });
  }
  next();
}, express.static(uploadsRoot));

// Directory listing debug (temporary) - lists files under /uploads/avatars (restricted)
app.get('/api/debug/uploads/list', authenticateJWT, (req, res) => {
  try {
    // Allow only elevated roles
    const role = req.user?.role || req.user?.role_name;
    if (!['admin','manager'].includes(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const avatarsDir = path.join(uploadsRoot, 'avatars');
    let files = [];
    try { files = fs.readdirSync(avatarsDir); } catch { files = []; }
    res.json({ count: files.length, files: files.slice(0, 200) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list uploads', details: err.message });
  }
});

// Debug endpoint to check trust proxy and IP detection
app.get('/api/debug/headers', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    trustProxy: app.get('trust proxy'),
    headers: {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'user-agent': req.headers['user-agent'],
      'host': req.headers.host
    },
    connection: {
      remoteAddress: req.connection?.remoteAddress,
      socketRemoteAddress: req.socket?.remoteAddress
    },
    ip: req.ip,
    ips: req.ips,
    protocol: req.protocol,
    secure: req.secure
  });
});

// Deprecation middleware for students route
app.use('/api/students', (req, res, next) => {
  logger.warn('DEPRECATED: /api/students route is deprecated. Use /api/users/students instead.');
  res.setHeader('Warning', '299 - "Deprecated API: Use /api/users/students instead"');
  next();
});

// === ROUTES ===
app.use('/api/auth', authRouter);
app.use('/api/2fa', twoFactorRouter);
app.use('/api/user-consents', authenticateJWT, userConsentsRouter);
app.use('/api/gdpr', gdprRouter);
app.use('/api/users', authenticateJWT, usersRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/equipment', authenticateJWT, equipmentRouter);
app.use('/api/instructors', authenticateJWT, instructorsRouter);
// Feature-specific instructor self-service endpoints
app.use('/api/instructors', authenticateJWT, instructorFeatureRouter);
app.use('/api/students', authenticateJWT, familyRouter); // Family management routes (must be before studentsRouter)
app.use('/api/students', authenticateJWT, studentsRouter);
app.use('/api/waivers', waiversRouter); // Liability waiver routes (template endpoints allow public access)
app.use('/api/student', authenticateJWT, studentPortalRouter);
app.use('/api/finances', authenticateJWT, triggerFinancialReconciliation, financesRouter);
app.use('/api/rentals', authenticateJWT, triggerFinancialReconciliation, rentalsRouter);
app.use('/api/events', authenticateJWT, eventsRouter);
app.use('/api/member-offerings', memberOfferingsRouter);
app.use('/api/repair-requests', authenticateJWT, repairRequestsRouter);
app.use('/api/marketing', authenticateJWT, marketingRouter);
app.use('/api/quick-links', quickLinksRouter); // Has both public and protected routes
app.use('/api/relationships', userRelationshipsRouter); // Friend/connection management
app.use('/api/finances/daily-operations', triggerFinancialReconciliation, financeDailyOperationsRouter);
app.use('/api/accommodation', authenticateJWT, accommodationRouter);
app.use('/api/webhooks', paymentWebhooksRouter);
app.use('/api/wallet', authenticateJWT, walletRouter);
app.use('/api/shop-orders', shopOrdersRouter);
app.use('/api/group-bookings', groupBookingsRouter);
app.use('/api/system', authenticateJWT, systemRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/finance-settings', financeSettingsRouter);
app.use('/api/roles', rolesRouter);

// Public routes (no authentication required)
app.get('/api/services/categories/list', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT category FROM services ORDER BY category';
    const { rows } = await pool.query(query);
    
    const categories = rows.map(row => row.category);
    res.json(categories);
  } catch (error) {
  logger.error('Error fetching service categories: ' + error.message);
    res.status(500).json({ error: 'Failed to fetch service categories' });
  }
});

app.use('/api/services', authenticateJWT, servicesRouter);
app.use('/api/products', authenticateJWT, productsRouter);
app.use('/api/ratings', authenticateJWT, ratingsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/instructor-commissions', instructorCommissionsRouter);
app.use('/api/currencies', currenciesRouter);
app.use('/api/popups', authenticateJWT, popupsRouter);
app.use('/api/spare-parts', sparePartsRouter);
app.use('/api/debug', debugRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/notification-workers', notificationWorkersRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/admin/waivers', adminWaiversRouter);
app.use('/api/admin/support-tickets', adminSupportTicketsRouter);
app.use('/api/vouchers', vouchersRouter);
app.use('/api/manager/commissions', managerCommissionsRouter);
// Public weather route (no auth) - provides hourly wind data for calendars
app.use('/api/weather', weatherRouter);
app.use('/api/admin/financial-reconciliation', adminReconciliationRouter);
app.use('/api/chat', chatRouter);

// === WebSocket Test Endpoint ===
app.get('/api/socket/test', (req, res) => {
  try {
    const testEvent = {
      message: 'Real-time test successful',
      timestamp: new Date().toISOString(),
      type: 'test'
    };
    
    // Emit test event to all connected clients
    if (socketService && socketService.io) {
      socketService.io.emit('test:message', testEvent);
  logger.info('📡 Test real-time event emitted: ' + JSON.stringify(testEvent));
    }
    
    res.json({
      success: true,
      message: 'Test event emitted to all connected clients',
      event: testEvent
    });
  } catch (error) {
  logger.error('Error in socket test: ' + error.message);
    res.status(500).json({ error: 'Failed to emit test event' });
  }
});

// === WebSocket Stats Endpoint ===
app.get('/api/socket/stats', authenticateJWT, (req, res) => {
  try {
    const stats = socketService.getStats();
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
  logger.error('Error fetching socket stats: ' + error.message);
    res.status(500).json({ error: 'Failed to fetch socket statistics' });
  }
});

// === HEALTH CHECK ===
app.get('/', (_req, res) => {
  res.send('✅ Server is running.');
});

// === 404 HANDLER ===
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// === ERROR HANDLING ===
// Handle unhandled routes
app.use(handleNotFound);

// Global error handler (must be last)
app.use(globalErrorHandler);

// === GRACEFUL SHUTDOWN ===
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed.');

    // Close socket connections if initialized
    if (socketService && socketService.io) {
      socketService.io.close();
      logger.info('Socket.IO server closed.');
    }

    try {
      await notificationRealtimeService.shutdown();
      logger.info('Notification realtime listener shut down.');
    } catch (error) {
      logger.warn('Error shutting down notification realtime listener:', error.message);
    }

    // Close Redis cache connection only if connected
    try {
      if (cacheService && cacheService.isConnected) {
        await cacheService.close();
        logger.info('Redis cache connection closed.');
      } else {
        logger.info('Redis cache not connected; skipping close.');
      }
    } catch (error) {
      logger.warn('Error closing Redis cache connection:', error.message);
    }

  logger.info('Graceful shutdown completed.');
  // eslint-disable-next-line no-process-exit
  process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }, 30000);
};

// Handle process termination
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  if (!isShuttingDown) {
    gracefulShutdown('uncaughtException');
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// === START SERVER ===
// Initialize performance monitoring
memoryMonitor();

const PORT = process.env.BACKEND_API_PORT || 4000;
const shouldStartServer = process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;

if (shouldStartServer) {
  server.listen(PORT, () => {
    logger.info(`🚀 Backend server running on ${process.env.BACKEND_API_URL || `http://localhost:${PORT}`}`);
  
    // Optimize database connection pool if available
    if (pool) {
      optimizeDbPool(pool);
    }
    
    // Start message cleanup scheduler (5-day retention)
    try {
      MessageCleanupService.startScheduler();
      logger.info('✅ Message cleanup scheduler started');
    } catch (error) {
      logger.error('❌ Failed to start message cleanup scheduler:', error);
    }
  });
}

// Export the app for testing purposes
export default app;
