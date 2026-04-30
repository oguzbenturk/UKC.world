import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { createServer } from 'http';
import Decimal from 'decimal.js';
import { pool } from './db.js';
import { verifyPayment } from './services/paymentGateways/iyzicoGateway.js';
import { approveDepositRequest as approveDepositFromCallback } from './services/walletService.js';
import { resolveSystemActorId } from './utils/auditUtils.js';

// Import services
import { cacheService } from './services/cacheService.js';
import socketService from './services/socketService.js';
import BackupService from './services/backupService.js';
import ExchangeRateService from './services/exchangeRateService.js';
import { reconciliationService } from './services/financialReconciliationService.js';
import voucherService from './services/voucherService.js';

// Import routes
import jwt from 'jsonwebtoken';
import authRouter, { authenticateJWT } from './routes/auth.js';
import { authorizeRoles } from './middlewares/authorize.js';
import twoFactorRouter from './routes/twoFactor.js';
import usersRouter from './routes/users.js';
import bookingsRouter from './routes/bookings.js';
import equipmentRouter from './routes/equipment.js';
import instructorsRouter from './routes/instructors.js';
import instructorFeatureRouter from './routes/instructor.js';
import instructorAvailabilityRouter from './routes/instructorAvailability.js';
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
import instructorSkillsRouter from './routes/instructorSkills.js';
import debugRouter from './routes/debug.js';
import currenciesRouter from './routes/currencies.js';
import sparePartsRouter from './routes/spareParts.js';
import teamSettingsRouter from './routes/teamSettings.js';
import weatherRouter from './routes/weather.js';
import googleReviewsRouter from './routes/googleReviews.js';
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
import feedbackRouter from './routes/feedback.js';
import groupBookingsRouter from './routes/groupBookings.js';
import { processParticipantPayment, processOrganizerPayment } from './services/groupBookingService.js';
import groupLessonRequestsRouter from './routes/groupLessonRequests.js';
import rescheduleNotificationsRouter from './routes/rescheduleNotifications.js';
import vouchersRouter from './routes/vouchers.js';
import managerCommissionsRouter from './routes/managerCommissions.js';
import memberOfferingsRouter from './routes/memberOfferings.js';
import repairRequestsRouter from './routes/repairRequests.js';
import marketingRouter from './routes/marketing.js';
import quickLinksRouter from './routes/quickLinks.js';
import userRelationshipsRouter from './routes/userRelationships.js';
import chatRouter from './routes/chat.js';
import shopOrdersRouter from './routes/shopOrders.js';
import businessExpensesRouter from './routes/businessExpenses.js';
import formTemplatesRouter from './routes/formTemplates.js';
import formSubmissionsRouter from './routes/formSubmissions.js';
import publicFormsRouter from './routes/publicForms.js';
import adminRouter from './routes/admin.js';
import assistantRouter from './routes/assistant.js';
import agentRouter from './routes/agent.js';
import { authenticateAgentRequest } from './middlewares/authenticateAgent.js';
import MessageCleanupService from './services/messageCleanupService.js';
import { startLessonReminderJob } from './jobs/lessonReminderJob.js';
import './services/alerts/notificationAlertService.js';
import telegramRouter from './routes/telegram.js';
import { initialize as initializeTelegramBot, pruneStaleLinkCodes } from './services/telegramService.js';
import { attachTelegramHandlers } from './services/telegramBotHandlers.js';
import {
  securityHeaders,
  apiRateLimit,
  authRateLimit,
  sanitizeInput,
  securityResponseHeaders,
  configureCORS,
  csrfMiddleware,
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
import { applyDisableLoginEnvPrecedence, isAuthCreationDisabled } from './utils/loginLock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load backend/.env first, then project root .env for any keys not already set (e.g. DISABLE_LOGIN only in root).
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });
// Root .env must win over backend/.env for DISABLE_LOGIN (db.js loads backend with override:true early).
applyDisableLoginEnvPrecedence(__dirname);

const app = express();
const server = createServer(app);

// Configure trust proxy for Docker/nginx setup
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Disable ETag generation for dynamic API responses to avoid 304 Not Modified
// and ensure clients always receive fresh JSON payloads
app.disable('etag');

logger.info('🔍 DEBUG: Trust proxy configuration: ' + JSON.stringify(app.get('trust proxy')));
logger.info('🔍 DEBUG: Environment: ' + (process.env.NODE_ENV || 'development'));

logger.info(
  `Auth lock DISABLE_LOGIN effective=${isAuthCreationDisabled() ? 'ON' : 'OFF'} (raw DISABLE_LOGIN=${JSON.stringify(process.env.DISABLE_LOGIN ?? '')})`,
);

if (isAuthCreationDisabled()) {
  logger.warn(
    'DISABLE_LOGIN is active: new sign-in, registration, 2FA completion, and all existing JWT/API + socket sessions are rejected until DISABLE_LOGIN is cleared and the server restarts.',
  );
}

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
app.use(compression({ threshold: 1024 }));

// Performance monitoring (temporarily disabled)
// app.use(performanceMonitor);

// Request logging
app.use(requestLogger);

// Response time and cache metrics
app.use(responseMetrics);

// CORS configuration
// Payment gateway callbacks bypass CORS (iyzico POSTs from sandbox-api.iyzipay.com / api.iyzipay.com)
const globalCors = cors(configureCORS());
const callbackCors = cors({ origin: ['https://sandbox-api.iyzipay.com', 'https://api.iyzipay.com'], methods: ['GET', 'POST', 'OPTIONS'], credentials: false });
app.use((req, res, next) => {
  if (req.path.startsWith('/api/finances/callback/')) {
    return callbackCors(req, res, next);
  }
  globalCors(req, res, next);
});

// Rate limiting
app.use('/api/auth', authRateLimit); // Stricter for auth routes (20 req / 15 min in production)
app.use('/api', apiRateLimit); // General API rate limiting

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

// SEC-046 FIX: Input sanitization re-enabled with robust xss library
// This prevents XSS attacks by sanitizing all incoming data
app.use(sanitizeInput());

// CSRF protection — double-submit cookie pattern
// Skips Bearer-token requests and server-to-server callback paths automatically
app.use('/api', csrfMiddleware);

// Make socketService available to routes via middleware
app.use((req, res, next) => {
  req.socketService = socketService;
  next();
});

// SEC-032 FIX: Health check endpoint - minimal info for public, detailed for authenticated
app.get('/api/health', (req, res) => {
  // Public health check - minimal information
  const basicHealth = {
    status: 'healthy',
    timestamp: new Date().toISOString()
  };

  // Check if request has valid authentication
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

      // Only admin/super_admin get detailed metrics (not while emergency login lock is on)
      if (
        verified &&
        (verified.role === 'admin' || verified.role === 'super_admin') &&
        !isAuthCreationDisabled()
      ) {
        return res.status(200).json({
          ...basicHealth,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.version,
          environment: process.env.NODE_ENV
        });
      }
    } catch (err) {
      // Invalid token, just return basic health
    }
  }

  // Return minimal health info for unauthenticated requests
  res.status(200).json(basicHealth);
});

// SEC-044 FIX: SSL validation endpoint removed - no longer needed
// If SSL validation is needed again, use certbot's webroot method or DNS challenge

// Serve uploaded files with access control
// Public: images, service-images, form-backgrounds, form-logos
// Protected: form-submissions, chat-files, voice-messages, chat-images
const uploadsRoot = path.resolve(__dirname, 'uploads');
app.use('/uploads', (req, res, next) => {
  const protectedPrefixes = [
    '/form-submissions/',
    '/chat-files/',
    '/voice-messages/',
    '/chat-images/'
  ];

  const isProtectedPath = protectedPrefixes.some(prefix => req.path.startsWith(prefix));
  if (isProtectedPath) {
    return authenticateJWT(req, res, next);
  }

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

// SEC-022 FIX: Debug endpoints - only available in development or with admin auth
// Directory listing debug (temporary) - lists files under /uploads/avatars (restricted)
app.get('/api/debug/uploads/list', authenticateJWT, (req, res) => {
  // Only allow in development or for super_admin in production
  if (process.env.NODE_ENV !== 'development') {
    const role = req.user?.role || req.user?.role_name;
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Debug endpoints disabled in production' });
    }
  }

  try {
    // Allow only elevated roles
    const role = req.user?.role || req.user?.role_name;
    if (!['admin','manager','super_admin'].includes(role)) {
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

// Deprecation middleware for students route
app.use('/api/students', (req, res, next) => {
  logger.warn('DEPRECATED: /api/students route is deprecated. Use /api/users/students instead.');
  res.setHeader('Warning', '299 - "Deprecated API: Use /api/users/students instead"');
  next();
});

// === ROUTES ===
app.use('/api/auth', authRouter);
app.use('/api/2fa', twoFactorRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/user-consents', authenticateJWT, userConsentsRouter);
app.use('/api/gdpr', gdprRouter);
app.use('/api/users', authenticateJWT, usersRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/equipment', authenticateJWT, equipmentRouter);
// Instructor availability MUST be mounted before instructorsRouter to prevent
// the generic /:id route from swallowing /me/availability and /unavailable paths.
app.use('/api/instructors', instructorAvailabilityRouter);
app.use('/api/instructors', instructorsRouter); // Auth handled per-route (GET / is public)
// Feature-specific instructor self-service endpoints
app.use('/api/instructors', authenticateJWT, instructorFeatureRouter);
// Instructor skills (teaching qualifications per discipline)
app.use('/api/instructors', instructorSkillsRouter);
app.use('/api/students', authenticateJWT, familyRouter); // Family management routes (must be before studentsRouter)
app.use('/api/students', authenticateJWT, studentsRouter);
app.use('/api/waivers', waiversRouter); // Liability waiver routes (template endpoints allow public access)
app.use('/api/student', authenticateJWT, studentPortalRouter);

// Iyzico callback - MUST be before authenticateJWT middleware for /api/finances
// This is called by iyzico after the user completes payment on the checkout form.
// SECURITY:
//   - Rate limited: max 30 requests per IP per 5 minutes (legitimate flow = 1 per payment)
//   - Token validated: must be non-empty string with reasonable length
//   - Token verified: cryptographically verified with iyzico API (verifyPayment)
//   - Idempotent: deposit status checked before approval (no double-crediting)
//   - No user input used in SQL: only the iyzico-verified token is used as lookup key
const iyzicoCallbackLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,                  // max 30 per IP (generous enough for legitimate multi-tab)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment callback attempts. Please wait.' }
});

app.post('/api/finances/callback/iyzico', iyzicoCallbackLimiter, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { token } = req.body;
    logger.info('Iyzico callback received', { 
      token: token ? `${token.substring(0, 8)}...` : null, 
      ip: req.ip,
      bodyKeys: Object.keys(req.body || {}),
      contentType: req.headers['content-type'],
      method: req.method
    });

    if (!token || typeof token !== 'string' || token.length < 10 || token.length > 512) {
      logger.warn('Iyzico callback: invalid or missing token', { ip: req.ip, tokenLength: token?.length, bodyKeys: Object.keys(req.body || {}) });
      throw new Error('Invalid token in callback');
    }

    // Verify payment with Iyzico
    const payment = await verifyPayment(token);
    logger.info('Iyzico payment verified', { 
      paymentId: payment.paymentId,
      paidPrice: payment.paidPrice,
      currency: payment.currency,
      basketId: payment.raw?.basketId,
      conversationId: payment.raw?.conversationId,
      hasCardUserKey: !!payment.cardUserKey
    });

    // Save cardUserKey for saved card feature if returned by Iyzico
    if (payment.cardUserKey) {
      try {
        const basketId = payment.raw?.basketId || '';
        const userIdMatch = basketId.match(/^USR_(.+?)_TRX_/);
        const cardUserId = userIdMatch?.[1];
        if (cardUserId && cardUserId !== 'GUEST') {
          await pool.query(
            `UPDATE users SET iyzico_card_user_key = $1 WHERE id = $2 AND (iyzico_card_user_key IS NULL OR iyzico_card_user_key != $1)`,
            [payment.cardUserKey, cardUserId]
          );
          logger.info('Saved Iyzico cardUserKey for user', { userId: cardUserId });
        }
      } catch (cardKeyErr) {
        logger.warn('Failed to save cardUserKey (non-blocking)', { error: cardKeyErr.message });
      }
    }

    // Find the matching deposit request by gateway_transaction_id (the iyzico token)
    const depositResult = await pool.query(
      `SELECT id, user_id, status, amount, currency, metadata FROM wallet_deposit_requests
       WHERE gateway_transaction_id = $1
       LIMIT 1`,
      [token]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (depositResult.rows.length === 0) {
      // No deposit request found — check if this is a shop order payment
      // Primary lookup: by gateway_token (reliable — stored on the order)
      // Fallback: by conversationId/order_number (Iyzico may not return conversationId in retrieve response)
      const conversationId = payment.raw?.conversationId;
      logger.info('No deposit request found, checking for shop order', { token, conversationId, rawKeys: Object.keys(payment.raw || {}) });

      // Try to find shop order: first by gateway_token, then by conversationId
      let orderResult = await pool.query(
        `SELECT id, user_id, order_number, status, payment_status, total_amount, subtotal, discount_amount, voucher_id, voucher_code, currency, wallet_deduction_data, deposit_percent, deposit_amount
         FROM shop_orders
         WHERE gateway_token = $1 AND payment_method IN ('credit_card', 'wallet_hybrid')
         LIMIT 1`,
        [token]
      );

      // Fallback: try by conversationId (order_number)
      if (orderResult.rows.length === 0 && conversationId && conversationId.startsWith('ORD-')) {
        orderResult = await pool.query(
          `SELECT id, user_id, order_number, status, payment_status, total_amount, subtotal, discount_amount, voucher_id, voucher_code, currency, wallet_deduction_data, deposit_percent, deposit_amount
           FROM shop_orders
           WHERE order_number = $1 AND payment_method IN ('credit_card', 'wallet_hybrid')
           LIMIT 1`,
          [conversationId]
        );
      }

      if (orderResult.rows.length > 0) {
        const order = orderResult.rows[0];

        // Idempotent: skip if already completed
        if (order.payment_status === 'completed' || order.payment_status === 'deposit_paid') {
          logger.info('Shop order already completed, skipping (idempotent)', { orderNumber: order.order_number });
          return res.redirect(`${frontendUrl}/payment/callback?status=success&type=shop&order=${order.order_number}`);
        }

        // Execute deferred wallet deductions now that card payment is confirmed
        if (order.wallet_deduction_data && order.wallet_deduction_data.plan) {
          try {
            const { recordTransaction: recordWalletTx } = await import('./services/walletService.js');
            const orderItemsResult = await pool.query(
              'SELECT product_name, quantity FROM shop_order_items WHERE order_id = $1',
              [order.id]
            );
            const orderItems = orderItemsResult.rows;
            const itemSummary = orderItems.length <= 3
              ? orderItems.map(i => `${i.product_name} x${i.quantity}`).join(', ')
              : `${orderItems.slice(0, 2).map(i => `${i.product_name} x${i.quantity}`).join(', ')} +${orderItems.length - 2} more`;
            const txDescription = itemSummary ? `${itemSummary} - Order #${order.order_number}` : `Shop Order #${order.order_number}`;
            for (const wd of order.wallet_deduction_data.plan) {
              await recordWalletTx({
                userId: order.user_id,
                amount: -wd.amount,
                currency: wd.currency,
                transactionType: 'payment',
                direction: 'debit',
                availableDelta: -wd.amount,
                description: txDescription,
                relatedEntityType: 'shop_order',
                metadata: { orderId: order.id, orderNumber: order.order_number, hybridPayment: true, walletPortion: order.wallet_deduction_data.totalDeductedEUR, deductedCurrency: wd.currency, deductedAmount: wd.amount, gatewayCurrency: payment.currency, gatewayAmount: payment.paidPrice, provider: 'iyzico', paymentId: payment.paymentId }
              });
            }
            logger.info('Wallet deductions executed for shop order', { orderNumber: order.order_number, deductions: order.wallet_deduction_data.plan });
          } catch (walletErr) {
            logger.error('Failed to execute wallet deductions for shop order', { orderNumber: order.order_number, error: walletErr.message });
            // Card payment is confirmed — don't fail the callback, but flag the order so admins can see it
            try {
              await pool.query(
                `UPDATE shop_orders SET admin_notes = COALESCE(admin_notes, '') || ' | WALLET_DEDUCTION_FAILED: ' || $2, updated_at = NOW() WHERE id = $1`,
                [order.id, walletErr.message]
              );
            } catch (_) { /* best-effort */ }
          }
        }

        // Update shop order — atomic: only succeeds if still pending_payment (prevents double-processing)
        const isDepositOrder = parseFloat(order.deposit_percent || 0) > 0;
        const newPaymentStatus = isDepositOrder ? 'deposit_paid' : 'completed';
        const orderUpdateResult = await pool.query(`
          UPDATE shop_orders
          SET payment_status = $2,
              status = 'confirmed',
              confirmed_at = NOW(),
              updated_at = NOW(),
              wallet_deduction_data = NULL
          WHERE id = $1 AND payment_status = 'pending_payment'
          RETURNING id
        `, [order.id, newPaymentStatus]);
        if (orderUpdateResult.rowCount === 0) {
          logger.warn('Iyzico Callback: Shop order already processed by concurrent request, skipping', { orderId: order.id, token });
          return res.redirect(`${frontendUrl}/payment/callback?status=success&type=shop&order=${order.order_number}`);
        }

        // Log status change in history
        const systemActorId = resolveSystemActorId() || order.user_id;
        const historyNote = isDepositOrder
          ? `Deposit ${order.deposit_percent}% (€${order.deposit_amount}) paid via Iyzico — remaining due on delivery (paymentId: ${payment.paymentId})`
          : `Payment completed via Iyzico (paymentId: ${payment.paymentId})`;
        await pool.query(`
          INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
          VALUES ($1, $2, 'confirmed', $3, $4)
        `, [order.id, order.status, systemActorId, historyNote]);

        logger.info('Shop order confirmed via Iyzico callback', { 
          orderId: order.id, 
          orderNumber: order.order_number,
          userId: order.user_id,
          paymentId: payment.paymentId
        });

        // Notify admins and user via socket
        try {
          socketService.emitToChannel('general', 'shop:orderPaid', {
            orderId: order.id,
            orderNumber: order.order_number,
            totalAmount: order.total_amount,
            paymentMethod: 'credit_card'
          });
          socketService.emitToChannel(`user:${order.user_id}`, 'shop:myOrderConfirmed', {
            orderId: order.id,
            orderNumber: order.order_number,
            totalAmount: order.total_amount,
            completedAt: new Date().toISOString()
          });
        } catch (socketErr) {
          logger.warn('Failed to emit shop order socket events', { error: socketErr.message });
        }

        // Clear the user's cart via socket (they were redirected away)
        try {
          socketService.emitToChannel(`user:${order.user_id}`, 'shop:clearCart', {
            orderNumber: order.order_number
          });
        } catch (_) { /* non-critical */ }

        // Redeem voucher if one was applied to this order
        if (order.voucher_id) {
          try {
            // Check if it's a wallet_credit voucher
            const voucherResult = await pool.query(
              `SELECT voucher_type, discount_value, currency FROM voucher_codes WHERE id = $1`,
              [order.voucher_id]
            );
            if (voucherResult.rows.length > 0 && voucherResult.rows[0].voucher_type === 'wallet_credit') {
              await voucherService.applyWalletCredit(
                order.user_id, voucherResult.rows[0].discount_value, order.voucher_id, order.currency || 'EUR'
              );
            }
            await voucherService.redeemVoucher({
              voucherId: order.voucher_id,
              userId: order.user_id,
              referenceType: 'shop',
              referenceId: String(order.id),
              originalAmount: new Decimal(order.subtotal || 0).toNumber(),
              discountAmount: new Decimal(order.discount_amount || 0).toNumber(),
              currency: order.currency || 'EUR'
            });
            logger.info(`Voucher ${order.voucher_code} redeemed via Iyzico callback for order ${order.order_number}`);
          } catch (voucherErr) {
            logger.error('Voucher redemption error in Iyzico callback (non-blocking):', voucherErr);
          }
        }

        // Fire-and-forget manager commission for card-paid shop orders
        try {
          const { recordShopCommission } = await import('./services/managerCommissionService.js');
          recordShopCommission(order).catch(() => {});
        } catch { /* ignore */ }

        return res.redirect(`${frontendUrl}/payment/callback?status=success&type=shop&order=${order.order_number}`);
      }

      // Check if this is a booking credit card payment (BKG-{bookingId})
      if (conversationId && conversationId.startsWith('BKG-')) {
        const bookingId = conversationId.replace('BKG-', '');
        const bookingResult = await pool.query(
          `SELECT id, student_user_id, date, start_hour, duration, amount, payment_status, status, service_id
           FROM bookings
           WHERE id = $1 AND payment_status = 'pending_payment'
           LIMIT 1`,
          [bookingId]
        );

        if (bookingResult.rows.length === 0) {
          // Check if already paid (idempotent)
          const alreadyPaid = await pool.query(
            `SELECT id, payment_status FROM bookings WHERE id = $1 AND payment_status = 'paid' LIMIT 1`,
            [bookingId]
          );
          if (alreadyPaid.rows.length > 0) {
            logger.info('Booking already paid, skipping (idempotent)', { bookingId });
            return res.redirect(`${frontendUrl}/payment/callback?status=success&type=booking&bookingId=${bookingId}`);
          }
          logger.error('Iyzico Callback: No matching pending booking found', { conversationId, bookingId, token });
          return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=booking_not_found`);
        }

        const booking = bookingResult.rows[0];

        // Update booking payment status to paid
        await pool.query(
          `UPDATE bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );

        logger.info('Booking payment confirmed via Iyzico callback', {
          bookingId: booking.id,
          userId: booking.student_user_id,
          amount: booking.amount,
          paymentId: payment.paymentId
        });

        // Notify via socket
        try {
          socketService.emitToChannel('general', 'booking:updated', {
            bookingId: booking.id,
            paymentStatus: 'paid',
            paymentMethod: 'credit_card'
          });
          socketService.emitToChannel(`user:${booking.student_user_id}`, 'booking:payment_confirmed', {
            bookingId: booking.id,
            amount: booking.amount,
            completedAt: new Date().toISOString()
          });
          socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'payment_confirmed' });
        } catch (socketErr) {
          logger.warn('Failed to emit booking payment socket events', { error: socketErr.message });
        }

        return res.redirect(`${frontendUrl}/payment/callback?status=success&type=booking&bookingId=${bookingId}`);
      }

      // Check if this is a group booking participant payment (GBKP-{participantId})
      if (conversationId && conversationId.startsWith('GBKP-')) {
        const participantId = conversationId.replace('GBKP-', '');
        try {
          // Get participant to find userId
          const partCheck = await pool.query(
            `SELECT id, user_id, payment_status FROM group_booking_participants WHERE id = $1 LIMIT 1`,
            [participantId]
          );
          if (partCheck.rows.length === 0) {
            logger.error('Iyzico Callback: No matching group booking participant', { conversationId, participantId });
            return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=participant_not_found`);
          }
          if (partCheck.rows[0].payment_status === 'paid') {
            logger.info('Group booking participant already paid (idempotent)', { participantId });
            return res.redirect(`${frontendUrl}/payment/callback?status=success&type=group_booking`);
          }

          await processParticipantPayment({
            participantId,
            userId: partCheck.rows[0].user_id,
            paymentMethod: 'credit_card'
          });

          logger.info('Group booking participant payment confirmed via Iyzico', { participantId, paymentId: payment.paymentId });

          try {
            socketService.emitToChannel(`user:${partCheck.rows[0].user_id}`, 'booking:payment_confirmed', {
              participantId,
              completedAt: new Date().toISOString()
            });
            socketService.emitToChannel('general', 'dashboard:refresh', { type: 'group_booking', action: 'payment_confirmed' });
          } catch (socketErr) {
            logger.warn('Failed to emit group booking payment socket events', { error: socketErr.message });
          }

          return res.redirect(`${frontendUrl}/payment/callback?status=success&type=group_booking`);
        } catch (gbErr) {
          logger.error('Group booking participant payment failed in Iyzico callback', { participantId, error: gbErr.message });
          return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=group_payment_error`);
        }
      }

      // Check if this is a group booking organizer pay-all (GBKO_{groupBookingId}_{userId})
      if (conversationId && conversationId.startsWith('GBKO_')) {
        // UUID format: 8-4-4-4-12 hex chars. Split by underscore delimiter.
        const gbkoParts = conversationId.slice(5).split('_'); // Remove 'GBKO_' prefix
        const groupBookingId = gbkoParts[0];
        const organizerId = gbkoParts[1];
        try {
          await processOrganizerPayment({
            groupBookingId,
            organizerId,
            paymentMethod: 'credit_card'
          });

          logger.info('Group booking organizer payment confirmed via Iyzico', { groupBookingId, organizerId, paymentId: payment.paymentId });

          try {
            socketService.emitToChannel(`user:${organizerId}`, 'booking:payment_confirmed', {
              groupBookingId,
              completedAt: new Date().toISOString()
            });
            socketService.emitToChannel('general', 'dashboard:refresh', { type: 'group_booking', action: 'payment_confirmed' });
          } catch (socketErr) {
            logger.warn('Failed to emit group booking organizer payment socket events', { error: socketErr.message });
          }

          return res.redirect(`${frontendUrl}/payment/callback?status=success&type=group_booking`);
        } catch (gbErr) {
          logger.error('Group booking organizer payment failed in Iyzico callback', { groupBookingId, organizerId, error: gbErr.message });
          return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=group_payment_error`);
        }
      }

      // === Member Offering purchase — look up by token first, then conversationId ===
      const moByToken = await pool.query(
        `SELECT id, user_id, payment_status, offering_name, offering_price FROM member_purchases WHERE gateway_transaction_id = $1 LIMIT 1`,
        [token]
      );
      if (moByToken.rows.length > 0 || (conversationId && conversationId.startsWith('MO-'))) {
        const purchaseId = moByToken.rows.length > 0
          ? moByToken.rows[0].id
          : conversationId.replace('MO-', '');
        try {
          const moResult = moByToken.rows.length > 0
            ? moByToken
            : await pool.query(
                `SELECT id, user_id, payment_status, offering_name, offering_price FROM member_purchases WHERE id = $1`,
                [purchaseId]
              );

          if (moResult.rows.length === 0) {
            logger.error('Iyzico Callback: Member offering purchase not found', { purchaseId, token });
            return res.redirect(`${frontendUrl}/payment/callback?status=failed&type=membership&reason=purchase_not_found`);
          }

          const mo = moResult.rows[0];

          // Idempotent: if already paid, just redirect success
          if (mo.payment_status === 'completed' || mo.payment_status === 'paid') {
            return res.redirect(`${frontendUrl}/payment/callback?status=success&type=membership`);
          }

          // Update payment status and activate membership
          await pool.query(
            `UPDATE member_purchases SET payment_status = 'completed', status = 'active' WHERE id = $1`,
            [purchaseId]
          );

          const paidAmount = new Decimal(payment.paidPrice || mo.offering_price || 0).toNumber();
          const paidCurrency = payment.currency || 'TRY';

          // Record wallet transactions: credit (card payment in) then debit (membership charge)
          try {
            const { recordTransaction: recordWalletTx } = await import('./services/walletService.js');
            // Credit: payment received via card
            await recordWalletTx({
              userId: mo.user_id,
              amount: paidAmount,
              currency: paidCurrency,
              transactionType: 'deposit',
              direction: 'credit',
              description: `Card payment for: ${mo.offering_name}`,
              metadata: { purchaseId, paymentId: payment.paymentId, method: 'credit_card' }
            });
            // Debit: membership purchase charge
            await recordWalletTx({
              userId: mo.user_id,
              amount: -paidAmount,
              currency: paidCurrency,
              transactionType: 'payment',
              direction: 'debit',
              description: `Membership purchase: ${mo.offering_name}`,
              metadata: { purchaseId, offeringName: mo.offering_name, method: 'credit_card' }
            });
          } catch (walletErr) {
            logger.warn('Failed to record wallet transactions for membership card payment (non-blocking)', { purchaseId, error: walletErr.message });
          }

          logger.info('Iyzico Callback: Member offering purchase confirmed', {
            purchaseId,
            userId: mo.user_id,
            paymentId: payment.paymentId,
            paidPrice: payment.paidPrice
          });

          try {
            socketService.emitToChannel(`user:${mo.user_id}`, 'membership:payment_confirmed', {
              purchaseId,
              offeringName: mo.offering_name,
              completedAt: new Date().toISOString()
            });
            socketService.emitToChannel('general', 'dashboard:refresh', { type: 'membership', action: 'payment_confirmed' });
          } catch (socketErr) {
            logger.warn('Failed to emit membership payment socket events', { error: socketErr.message });
          }

          // Fire-and-forget manager commission for card-paid membership
          try {
            const { recordMembershipCommission } = await import('./services/managerCommissionService.js');
            recordMembershipCommission(mo).catch(() => {});
          } catch { /* ignore */ }

          return res.redirect(`${frontendUrl}/payment/callback?status=success&type=membership`);
        } catch (moErr) {
          logger.error('Member offering payment failed in Iyzico callback', { purchaseId, error: moErr.message });
          return res.redirect(`${frontendUrl}/payment/callback?status=failed&type=membership&reason=membership_payment_error`);
        }
      }

      // === Accommodation booking (ACC-{bookingId}) ===
      if (conversationId && conversationId.startsWith('ACC-')) {
        const accBookingId = conversationId.replace('ACC-', '');
        try {
          const accResult = await pool.query(
            `SELECT id, guest_id, payment_status, total_price FROM accommodation_bookings WHERE id = $1`,
            [accBookingId]
          );

          if (accResult.rows.length === 0) {
            logger.error('Iyzico Callback: Accommodation booking not found', { accBookingId, token });
            return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=booking_not_found`);
          }

          const accBooking = accResult.rows[0];

          // Idempotent
          if (accBooking.payment_status === 'paid') {
            return res.redirect(`${frontendUrl}/payment/callback?status=success&type=accommodation`);
          }

          // Update payment status
          await pool.query(
            `UPDATE accommodation_bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
            [accBookingId]
          );

          logger.info('Iyzico Callback: Accommodation booking payment confirmed', {
            bookingId: accBookingId,
            userId: accBooking.guest_id,
            paymentId: payment.paymentId,
            paidPrice: payment.paidPrice
          });

          try {
            socketService.emitToChannel(`user:${accBooking.guest_id}`, 'booking:payment_confirmed', {
              bookingId: accBookingId,
              amount: accBooking.total_price,
              completedAt: new Date().toISOString()
            });
            socketService.emitToChannel('general', 'dashboard:refresh', { type: 'accommodation', action: 'payment_confirmed' });
          } catch (socketErr) {
            logger.warn('Failed to emit accommodation payment socket events', { error: socketErr.message });
          }

          return res.redirect(`${frontendUrl}/payment/callback?status=success&type=accommodation`);
        } catch (accErr) {
          logger.error('Accommodation booking payment failed in Iyzico callback', { accBookingId, error: accErr.message });
          return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=accommodation_payment_error`);
        }
      }

      // === Package purchase — look up by iyzico token first (most reliable) ===
      const pkgByToken = await pool.query(
        `SELECT id, customer_id AS user_id, status, package_name, pending_voucher_id, pending_voucher_meta
         FROM customer_packages WHERE gateway_transaction_id = $1 LIMIT 1`,
        [token]
      );
      if (pkgByToken.rows.length > 0 || (conversationId && conversationId.startsWith('PKG-'))) {
        const customerPackageId = pkgByToken.rows.length > 0
          ? pkgByToken.rows[0].id
          : conversationId.replace('PKG-', '');
        try {
          const pkgResult = pkgByToken.rows.length > 0
            ? pkgByToken
            : await pool.query(
                `SELECT id, customer_id AS user_id, status, package_name, pending_voucher_id, pending_voucher_meta
                 FROM customer_packages WHERE id = $1`,
                [customerPackageId]
              );

          if (pkgResult.rows.length === 0) {
            logger.error('Iyzico Callback: Package not found', { customerPackageId, token });
            return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=package_not_found`);
          }

          const cp = pkgResult.rows[0];

          const tryRedeemPendingPackageVoucher = async (row) => {
            const pendingVid = row.pending_voucher_id;
            const pendingMetaRaw = row.pending_voucher_meta;
            if (!pendingVid || !pendingMetaRaw) return;
            // Run redemption + wallet credit in one transaction so a partial failure rolls back both
            const vClient = await pool.connect();
            try {
              await vClient.query('BEGIN');
              const meta =
                typeof pendingMetaRaw === 'string' ? JSON.parse(pendingMetaRaw) : pendingMetaRaw;
              const orig = new Decimal(meta.originalPrice || 0).toNumber();
              const disc = new Decimal(meta.voucherDiscount || 0).toNumber();
              const finalP = meta.finalPrice != null
                ? new Decimal(meta.finalPrice).toNumber()
                : new Decimal(Math.max(0, orig - disc)).toNumber();
              const vCur = meta.priceCurrency || payment.currency || 'EUR';
              await voucherService.redeemVoucher({
                voucherId: pendingVid,
                userId: row.user_id,
                referenceType: 'package',
                referenceId: customerPackageId,
                originalAmount: orig,
                discountAmount: disc,
                finalAmount: finalP,
                currency: vCur,
                client: vClient
              });
              if (meta.voucherType === 'wallet_credit' && meta.discountValue != null) {
                await voucherService.applyWalletCredit(
                  row.user_id,
                  new Decimal(meta.discountValue || 0).toNumber(),
                  pendingVid,
                  vCur,
                  vClient
                );
              }
              await vClient.query(
                `UPDATE customer_packages SET pending_voucher_id = NULL, pending_voucher_meta = NULL, updated_at = NOW() WHERE id = $1`,
                [customerPackageId]
              );
              await vClient.query('COMMIT');
              logger.info('Voucher redeemed after Iyzico package payment', {
                customerPackageId,
                voucherId: pendingVid,
                userId: row.user_id
              });
            } catch (voucherPkgErr) {
              await vClient.query('ROLLBACK').catch(() => {});
              logger.error('Package voucher redemption after Iyzico failed — rolled back, voucher still pending', {
                customerPackageId,
                voucherId: pendingVid,
                error: voucherPkgErr.message
              });
              // Stamp the package so admins can see that manual redemption is needed
              await pool.query(
                `UPDATE customer_packages SET notes = COALESCE(notes, '') || ' | VOUCHER_REDEMPTION_FAILED: ' || $2, updated_at = NOW() WHERE id = $1`,
                [customerPackageId, voucherPkgErr.message]
              ).catch(() => {});
            } finally {
              vClient.release();
            }
          };

          // Idempotent: finish pending voucher if a prior run activated the row but did not clear voucher state
          if (cp.status === 'active') {
            await tryRedeemPendingPackageVoucher(cp);
            return res.redirect(`${frontendUrl}/payment/callback?status=success&type=package_purchase`);
          }

          // Activate the package — atomic: only succeeds if still pending_payment (prevents double-processing)
          const activationResult = await pool.query(
            `UPDATE customer_packages
             SET status = 'active',
                 notes = COALESCE(notes, '') || ' | Iyzico payment confirmed',
                 updated_at = NOW()
             WHERE id = $1 AND status = 'pending_payment'
             RETURNING id`,
            [customerPackageId]
          );
          if (activationResult.rowCount === 0) {
            logger.warn('Iyzico Callback: Package already processed by concurrent request, skipping', { customerPackageId, token });
            return res.redirect(`${frontendUrl}/payment/callback?status=success&type=package_purchase`);
          }

          await tryRedeemPendingPackageVoucher(cp);

          // Upgrade outsider → student now that a paid package exists
          try {
            const userRow = await pool.query(`SELECT role FROM users WHERE id = $1`, [cp.user_id]);
            if (userRow.rows[0]?.role === 'outsider') {
              const { upgradeOutsiderToStudent } = await import('./services/roleUpgradeService.js');
              await upgradeOutsiderToStudent(cp.user_id);
              logger.info('Outsider upgraded to student after credit-card package payment', { userId: cp.user_id, customerPackageId });
            }
          } catch (upgradeErr) {
            logger.warn('Role upgrade after package payment failed (non-blocking)', { userId: cp.user_id, error: upgradeErr.message });
          }

          try {
            const { recordTransaction: recordWalletTx } = await import('./services/walletService.js');
            await recordWalletTx({
              userId: cp.user_id,
              amount: new Decimal(payment.paidPrice || 0).negated().toNumber(),
              transactionType: 'package_purchase',
              status: 'completed',
              direction: 'debit',
              availableDelta: 0, // Don't change wallet balance — payment was via credit card
              description: `Package Purchase (Credit Card): ${cp.package_name}`,
              currency: payment.currency || 'EUR',
              paymentMethod: 'credit_card',
              referenceNumber: payment.paymentId,
              metadata: {
                packageId: customerPackageId,
                provider: 'iyzico',
                paymentId: payment.paymentId,
                paidPrice: payment.paidPrice,
                gatewayCurrency: payment.currency,
                gatewayAmount: payment.paidPrice,
                source: 'iyzico:callback:package-purchase'
              },
              entityType: 'customer_package',
              relatedEntityType: 'customer_package',
              relatedEntityId: customerPackageId,
              createdBy: cp.user_id,
            });
          } catch (txErr) {
            logger.warn('Failed to record package purchase wallet transaction from Iyzico callback', {
              customerPackageId, error: txErr.message
            });
          }

          logger.info('Iyzico Callback: Package purchase payment confirmed', {
            customerPackageId,
            userId: cp.user_id,
            paymentId: payment.paymentId,
            paidPrice: payment.paidPrice
          });

          try {
            socketService.emitToChannel(`user:${cp.user_id}`, 'package:payment_confirmed', {
              customerPackageId,
              completedAt: new Date().toISOString()
            });
            socketService.emitToChannel('general', 'dashboard:refresh', { type: 'package_purchase', action: 'payment_confirmed' });
          } catch (socketErr) {
            logger.warn('Failed to emit package payment socket events', { error: socketErr.message });
          }

          return res.redirect(`${frontendUrl}/payment/callback?status=success&type=package_purchase`);
        } catch (pkgErr) {
          logger.error('Package purchase payment failed in Iyzico callback', { customerPackageId, error: pkgErr.message });
          return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=package_payment_error`);
        }
      }

      // Neither deposit request, shop order, booking, group booking, nor package found
      logger.error('Iyzico Callback: No matching deposit request, shop order, booking, or group booking found', { token, conversationId });
      return res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=no_match`);
    }

    const depositRow = depositResult.rows[0];
    const targetUserId = depositRow.user_id;

    // Only approve if not already completed (idempotent check)
    if (depositRow.status !== 'completed') {
      const processorId = resolveSystemActorId() || targetUserId;
      
      const approvalResult = await approveDepositFromCallback({
        requestId: depositRow.id,
        processorId,
        metadata: {
          gatewayCallback: {
            provider: 'iyzico',
            paymentId: payment.paymentId,
            paidPrice: payment.paidPrice,
            currency: payment.currency,
            gatewayCurrency: payment.currency,
            gatewayAmount: payment.paidPrice,
            exchangeRate: depositRow.currency !== payment.currency && depositRow.amount
              ? parseFloat((parseFloat(payment.paidPrice) / parseFloat(depositRow.amount)).toFixed(6))
              : 1,
            token,
            conversationId: payment.raw?.conversationId
          }
        },
        notes: 'Wallet Top-up via Credit Card'
      });

      logger.info('Deposit approved via Iyzico callback', { 
        depositId: depositRow.id,
        userId: targetUserId
      });

      // Notify the user in real-time so the frontend auto-detects completion
      try {
        socketService.emitToChannel(`user:${targetUserId}`, 'wallet:deposit_approved', {
          depositId: depositRow.id,
          amount: approvalResult?.deposit?.amount || depositRow.amount,
          currency: approvalResult?.deposit?.currency || depositRow.currency,
          completedAt: new Date().toISOString()
        });
      } catch (socketErr) {
        logger.warn('Failed to emit deposit_approved socket event', { error: socketErr.message });
      }

      // Handle rental payment: debit wallet for rental charge and update rental status
      const depositMeta = typeof depositRow.metadata === 'string' ? JSON.parse(depositRow.metadata) : (depositRow.metadata || {});
      if (depositMeta.type === 'rental_payment' && depositMeta.rentalId) {
        try {
          const { recordLegacyTransaction: recordRentalCharge } = await import('./services/walletService.js');
          await recordRentalCharge({
            userId: targetUserId,
            amount: -Math.abs(depositRow.amount),
            transactionType: 'rental_charge',
            status: 'completed',
            direction: 'debit',
            description: `Rental payment (credit card) - Rental #${depositMeta.rentalId}`,
            currency: depositRow.currency,
            metadata: { rentalId: depositMeta.rentalId, paymentMethod: 'credit_card', depositId: depositRow.id, source: 'iyzico_callback' },
            entityType: 'rental',
            relatedEntityType: 'rental',
            relatedEntityId: depositMeta.rentalId,
            rentalId: depositMeta.rentalId
          });
          await pool.query(
            'UPDATE rentals SET payment_status = $1, updated_at = NOW() WHERE id = $2',
            ['paid', depositMeta.rentalId]
          );
          socketService.emitToChannel(`user:${targetUserId}`, 'rental:payment_confirmed', {
            rentalId: depositMeta.rentalId,
            depositId: depositRow.id,
            amount: depositRow.amount,
            completedAt: new Date().toISOString()
          });
          logger.info('Rental payment processed via deposit callback', {
            rentalId: depositMeta.rentalId, depositId: depositRow.id, userId: targetUserId
          });
        } catch (rentalErr) {
          logger.error('Failed to process rental payment after deposit approval', {
            rentalId: depositMeta.rentalId, depositId: depositRow.id, error: rentalErr.message
          });
        }
      }
    } else {
      logger.info('Deposit already completed, skipping (idempotent)', { 
        depositId: depositRow.id,
        userId: targetUserId 
      });
    }

    // Redirect to payment callback page — the original tab handles the receipt via Socket.IO
    res.redirect(`${frontendUrl}/payment/callback?status=success`);

  } catch (error) {
    logger.error('Iyzico Callback Failed', { 
      error: error.message, 
      stack: error.stack,
      bodyKeys: Object.keys(req.body || {}),
      hasToken: !!req.body?.token,
      ip: req.ip
    });

    // If payment verification failed, cancel any pending_payment customer package tied to this token
    // and cancel the associated pending lesson bookings so they don't block instructor slots.
    const failedToken = req.body?.token;
    if (failedToken && error.message?.includes('Payment not successful')) {
      try {
        const cancelledPkg = await pool.query(
          `UPDATE customer_packages
           SET status = 'cancelled',
               notes = COALESCE(notes, '') || ' | Cancelled: Iyzico payment failed',
               updated_at = NOW()
           WHERE gateway_transaction_id = $1 AND status = 'pending_payment'
           RETURNING id`,
          [failedToken]
        );
        logger.info('Cancelled pending_payment package after Iyzico payment failure', { token: failedToken });

        if (cancelledPkg.rows.length > 0) {
          const customerPackageId = cancelledPkg.rows[0].id;
          await pool.query(
            `UPDATE bookings
             SET status = 'cancelled', updated_at = NOW()
             WHERE customer_package_id = $1 AND status = 'pending' AND payment_method = 'package'`,
            [customerPackageId]
          );
          logger.info('Cancelled pending lesson bookings after Iyzico payment failure', { customerPackageId });
        }
      } catch (cancelErr) {
        logger.warn('Failed to cancel pending package/bookings after payment failure', { error: cancelErr.message });
      }
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/payment/callback?status=failed`);
  }
});

// Iyzico GET callback — browser may arrive here via GET (refresh, direct nav, back button).
// SECURITY: GET must NEVER process payments or mutate state. It only redirects to the frontend.
// All actual payment processing happens exclusively in the POST handler above.
app.get('/api/finances/callback/iyzico', iyzicoCallbackLimiter, (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  // Just redirect to the frontend payment callback page.
  // The POST handler already processed the payment; this is only for the browser tab
  // that iyzico redirected. The frontend will pick up the result via Socket.IO or query params.
  const status = req.query.status || 'pending';
  res.redirect(`${frontendUrl}/payment/callback?status=${encodeURIComponent(status)}`);
});

// Safety-net error handler for iyzico callback routes.
// Ensures ANY uncaught error (e.g. from middleware before the handler) results in
// a redirect instead of a raw JSON error page that confuses users.
app.use('/api/finances/callback/iyzico', (err, req, res, _next) => {
  logger.error('Iyzico callback safety-net caught an error', { error: err.message, stack: err.stack, method: req.method });
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendUrl}/payment/callback?status=failed&reason=server_error`);
});

app.use('/api/finances', authenticateJWT, triggerFinancialReconciliation, financesRouter);
app.use('/api/rentals', authenticateJWT, triggerFinancialReconciliation, rentalsRouter);
app.use('/api/events', (req, res, next) => {
  const isPublicEventsRead = req.method === 'GET' && (
    req.path === '/public' ||
    req.path === '/public/' ||
    req.path.startsWith('/public/')
  );

  if (isPublicEventsRead) {
    return next();
  }

  return authenticateJWT(req, res, next);
}, eventsRouter);
app.use('/api/member-offerings', memberOfferingsRouter);
app.use('/api/repair-requests', repairRequestsRouter);
app.use('/api/marketing', authenticateJWT, marketingRouter);
app.use('/api/quick-links', authenticateJWT, quickLinksRouter);
app.use('/api/form-templates', authenticateJWT, formTemplatesRouter);
app.use('/api/form-submissions', authenticateJWT, formSubmissionsRouter);
app.use('/api/public/forms', publicFormsRouter); // Public form access

// Public accommodation units endpoint for guest browsing (showroom)
app.get('/api/accommodation/units/public', async (req, res) => {
  try {
    const { type } = req.query;
    const params = [];
    let where = "WHERE status = 'Available'"; // Only show available units to guests
    
    if (type) {
      params.push(type);
      where += ` AND type = $${params.length}`;
    }
    
    const query = `
      SELECT 
        id, name, type, category, capacity, price_per_night, description, 
        amenities, image_url, images
      FROM accommodation_units
      ${where}
      ORDER BY name ASC
    `;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    logger.error('Error fetching public accommodation units:', err);
    res.status(500).json({ error: 'Failed to fetch accommodation units' });
  }
});

app.use('/api/relationships', authenticateJWT, userRelationshipsRouter);
app.use('/api/finances/daily-operations', authenticateJWT, triggerFinancialReconciliation, financeDailyOperationsRouter);
app.use('/api/accommodation', authenticateJWT, accommodationRouter);
app.use('/api/webhooks', paymentWebhooksRouter);
app.use('/api/wallet', authenticateJWT, walletRouter);
app.use('/api/shop-orders', authenticateJWT, shopOrdersRouter);
app.use('/api/shop/orders', authenticateJWT, shopOrdersRouter); // Alias for QuickShopSaleModal
app.use('/api/business-expenses', authenticateJWT, businessExpensesRouter);
app.use('/api/group-bookings', groupBookingsRouter);
app.use('/api/group-lesson-requests', groupLessonRequestsRouter);
app.use('/api/reschedule-notifications', rescheduleNotificationsRouter);
app.use('/api/system', authenticateJWT, systemRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/finance-settings', authenticateJWT, financeSettingsRouter);
app.use('/api/roles', authenticateJWT, rolesRouter);
app.use('/api/team-settings', teamSettingsRouter);

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

app.use('/api/services', (req, res, next) => {
  // Keep guest-facing package catalog public for academy pages
  const isPublicServiceRead = req.method === 'GET' && (
    req.path === '/' ||
    req.path === '/categories' ||
    req.path === '/categories/' ||
    req.path === '/packages/public' ||
    req.path === '/packages/public/' ||
    req.path.startsWith('/packages/public/')
  );

  if (isPublicServiceRead) {
    return next();
  }

  return authenticateJWT(req, res, next);
}, servicesRouter);
app.use('/api/products', productsRouter); // Auth handled per-route for guest browsing
app.use('/api/shop/products', productsRouter); // Alias - auth handled per-route
app.use('/api/ratings', authenticateJWT, ratingsRouter);
app.use('/api/upload', authenticateJWT, uploadRouter);
app.use('/api/instructor-commissions', authenticateJWT, instructorCommissionsRouter);
app.use('/api/currencies', authenticateJWT, currenciesRouter);
app.use('/api/spare-parts', authenticateJWT, sparePartsRouter);
app.use('/api/debug', authenticateJWT, debugRouter);
app.use('/api/dashboard', authenticateJWT, dashboardRouter);
app.use('/api/notifications', authenticateJWT, notificationsRouter);
app.use('/api/notification-workers', authenticateJWT, notificationWorkersRouter);
// SEC-035: Metrics endpoint requires admin authentication
app.use('/api/metrics', authenticateJWT, authorizeRoles(['admin', 'super_admin']), metricsRouter);
app.use('/api/audit-logs', authenticateJWT, auditLogsRouter);
app.use('/api/admin/waivers', authenticateJWT, adminWaiversRouter);
app.use('/api/admin/support-tickets', authenticateJWT, adminSupportTicketsRouter);
app.use('/api/admin/financial-reconciliation', authenticateJWT, adminReconciliationRouter);
app.use('/api/admin', authenticateJWT, adminRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/agent', authenticateAgentRequest, agentRouter);
app.use('/api/vouchers', authenticateJWT, vouchersRouter);
app.use('/api/manager/commissions', authenticateJWT, managerCommissionsRouter);
// Public weather route (no auth) - provides hourly wind data for calendars
app.use('/api/weather', weatherRouter);
// Public Google Reviews route (no auth) - cached 1h, no key exposed to frontend
app.use('/api/google-reviews', googleReviewsRouter);
app.use('/api/feedback', authenticateJWT, feedbackRouter);
app.use('/api/chat', authenticateJWT, chatRouter);

// === WebSocket Test Endpoint ===
// SEC-020 FIX: Only available in development or requires authentication
app.get('/api/socket/test', (req, res, next) => {
  // Only allow in development mode without auth
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  // In production, require admin authentication
  return authenticateJWT(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
  });
}, (req, res) => {
  try {
    const testEvent = {
      message: 'Real-time test successful',
      timestamp: new Date().toISOString(),
      type: 'test',
      triggeredBy: req.user ? req.user.id : 'development'
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
const gracefulShutdown = (signal) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  const forceTimer = setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }, 30000);

  const finalize = async () => {
    try {
      await notificationRealtimeService.shutdown();
      logger.info('Notification realtime listener shut down.');
    } catch (error) {
      logger.warn('Error shutting down notification realtime listener:', error.message);
    }

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
    clearTimeout(forceTimer);
    // eslint-disable-next-line no-process-exit
    process.exit(0);
  };

  const closeHttpServer = () => {
    if (typeof server.closeAllConnections === 'function') {
      try {
        server.closeAllConnections();
      } catch (e) {
        logger.warn('closeAllConnections failed:', e.message);
      }
    }
    server.close(() => {
      logger.info('HTTP server closed.');
      finalize().catch((err) => {
        logger.warn('Shutdown finalize error:', err?.message || err);
        clearTimeout(forceTimer);
        // eslint-disable-next-line no-process-exit
        process.exit(0);
      });
    });
  };

  // Socket.IO keeps HTTP sockets open; closing it inside server.close() deadlocks (callback never runs).
  if (socketService?.io) {
    try {
      socketService.io.disconnectSockets(true);
    } catch (e) {
      logger.warn('disconnectSockets failed:', e.message);
    }
    socketService.io.close(() => {
      logger.info('Socket.IO server closed.');
      closeHttpServer();
    });
  } else {
    closeHttpServer();
  }
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

    // Start 24h-ahead lesson reminder cron (every 15 min)
    try {
      startLessonReminderJob();
      logger.info('✅ Lesson reminder cron started');
    } catch (error) {
      logger.error('❌ Failed to start lesson reminder cron:', error);
    }

    // Initialize Telegram bot (registers webhook + attaches command handlers).
    // Non-blocking — server stays up even if the bot fails to authenticate.
    initializeTelegramBot({
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || null,
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
      attachHandlers: attachTelegramHandlers
    }).catch((error) => {
      logger.warn('Telegram bot initialization error (continuing without Telegram)', {
        error: error?.message
      });
    });

    // Daily prune of stale telegram_link_codes rows (consumed >30d ago,
    // expired >7d ago) so the table doesn't grow unbounded.
    try {
      cron.schedule('15 4 * * *', () => {
        pruneStaleLinkCodes().catch((error) => {
          logger.warn('pruneStaleLinkCodes cron failed', { error: error.message });
        });
      }, { scheduled: true, timezone: 'Europe/Istanbul' });
      logger.info('✅ Telegram link-code prune cron scheduled');
    } catch (error) {
      logger.error('❌ Failed to schedule telegram prune cron:', error);
    }

    // Auto-cancel stale pending_payment member purchases (abandoned Iyzico flows)
    const STALE_PURCHASE_INTERVAL = 15 * 60 * 1000; // every 15 min
    const STALE_PURCHASE_THRESHOLD = 30; // minutes
    setInterval(async () => {
      try {
        const { rowCount } = await pool.query(
          `UPDATE member_purchases
             SET status = 'cancelled', payment_status = 'cancelled'
           WHERE status = 'pending_payment'
             AND payment_method IN ('credit_card', 'card')
             AND purchased_at < NOW() - INTERVAL '${STALE_PURCHASE_THRESHOLD} minutes'`
        );
        if (rowCount > 0) {
          logger.info(`Auto-cancelled ${rowCount} stale pending_payment member purchase(s)`);
        }
      } catch (err) {
        logger.warn('Stale purchase cleanup error:', err.message);
      }
    }, STALE_PURCHASE_INTERVAL);
    logger.info(`🧹 Stale purchase cleanup scheduled every ${STALE_PURCHASE_INTERVAL / 60000} min (threshold: ${STALE_PURCHASE_THRESHOLD} min)`);

    // Auto-cancel stale pending_payment customer packages (abandoned Iyzico flows)
    const STALE_PKG_INTERVAL = 15 * 60 * 1000; // every 15 min
    const STALE_PKG_THRESHOLD_HOURS = 2; // hours
    setInterval(async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: stalePkgs } = await client.query(
          `UPDATE customer_packages
              SET status = 'cancelled',
                  notes = COALESCE(notes, '') || ' | Auto-cancelled: payment not completed',
                  updated_at = NOW()
            WHERE status = 'pending_payment'
              AND payment_method = 'credit_card'
              AND created_at < NOW() - INTERVAL '${STALE_PKG_THRESHOLD_HOURS} hours'
            RETURNING id`
        );
        if (stalePkgs.length > 0) {
          const packageIds = stalePkgs.map(r => r.id);
          const { rowCount: cancelledBookings } = await client.query(
            `UPDATE bookings
                SET status = 'cancelled', updated_at = NOW()
              WHERE customer_package_id = ANY($1::uuid[])
                AND status = 'pending'
                AND payment_method = 'package'`,
            [packageIds]
          );
          await client.query('COMMIT');
          logger.info(`Auto-cancelled ${stalePkgs.length} stale pending_payment package(s) and ${cancelledBookings} associated lesson booking(s)`);
        } else {
          await client.query('ROLLBACK');
        }
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        logger.warn('Stale package cleanup error:', err.message);
      } finally {
        client.release();
      }
    }, STALE_PKG_INTERVAL);
    logger.info(`🧹 Stale package cleanup scheduled every ${STALE_PKG_INTERVAL / 60000} min (threshold: ${STALE_PKG_THRESHOLD_HOURS}h)`);

    // Auto-reject stale bank_transfer_receipts (no admin review after 7 days)
    const STALE_BANK_TRANSFER_INTERVAL = 60 * 60 * 1000; // every hour
    const STALE_BANK_TRANSFER_DAYS = 7;
    setInterval(async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Reject stale receipts
        const { rows: staleReceipts } = await client.query(
          `UPDATE bank_transfer_receipts
              SET status = 'rejected',
                  admin_notes = COALESCE(admin_notes, '') || ' | Auto-rejected: no admin review within 7 days',
                  updated_at = NOW()
            WHERE status = 'pending'
              AND created_at < NOW() - INTERVAL '${STALE_BANK_TRANSFER_DAYS} days'
            RETURNING id, customer_package_id, shop_order_id, booking_id, member_purchase_id`
        );
        if (staleReceipts.length > 0) {
          const pkgIds = staleReceipts.map(r => r.customer_package_id).filter(Boolean);
          const orderIds = staleReceipts.map(r => r.shop_order_id).filter(Boolean);
          const memberPurchaseIds = staleReceipts.map(r => r.member_purchase_id).filter(Boolean);
          if (pkgIds.length > 0) {
            await client.query(
              `UPDATE customer_packages SET status = 'cancelled', notes = COALESCE(notes, '') || ' | Auto-cancelled: bank transfer not verified', updated_at = NOW()
                WHERE id = ANY($1::uuid[]) AND status = 'waiting_payment'`,
              [pkgIds]
            );
          }
          if (orderIds.length > 0) {
            await client.query(
              `UPDATE shop_orders SET payment_status = 'cancelled', status = 'cancelled', updated_at = NOW()
                WHERE id = ANY($1::uuid[]) AND payment_status = 'waiting_payment'`,
              [orderIds]
            );
          }
          if (memberPurchaseIds.length > 0) {
            await client.query(
              `UPDATE member_purchases SET status = 'cancelled', payment_status = 'cancelled', updated_at = NOW()
                WHERE id = ANY($1::uuid[]) AND status = 'waiting_payment'`,
              [memberPurchaseIds]
            );
          }
          await client.query('COMMIT');
          logger.info(`Auto-rejected ${staleReceipts.length} stale bank transfer receipt(s) and cancelled associated records`);
        } else {
          await client.query('ROLLBACK');
        }
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        logger.warn('Stale bank transfer cleanup error:', err.message);
      } finally {
        client.release();
      }
    }, STALE_BANK_TRANSFER_INTERVAL);
    logger.info(`🧹 Stale bank transfer cleanup scheduled every ${STALE_BANK_TRANSFER_INTERVAL / 60000} min (threshold: ${STALE_BANK_TRANSFER_DAYS} days)`);
  });
}

// Export the app for testing purposes
export default app;
