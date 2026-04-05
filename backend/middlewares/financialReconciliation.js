import { reconciliationService } from '../services/financialReconciliationService.js';
import { logger } from './errorHandler.js';

/**
 * Middleware to automatically trigger financial reconciliation
 * when transactions are created, updated, or deleted
 */

export const triggerFinancialReconciliation = (req, res, next) => {
  // Store the original end function
  const originalEnd = res.end;
  
  // Override res.end to trigger reconciliation after successful responses
  res.end = function(...args) {
    // Call the original end function first
    originalEnd.apply(this, args);
    
    // Only trigger reconciliation for successful responses (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Extract user ID from various sources
      let userId = null;
      
      if (req.body?.user_id) {
        userId = req.body.user_id;
      } else if (req.body?.userId) {
        userId = req.body.userId;
      } else if (req.params?.userId) {
        userId = req.params.userId;
      } else if (req.params?.id && req.baseUrl?.includes('user')) {
        userId = req.params.id;
      } else if (req.user?.id) {
        userId = req.user.id;
      }

      // Check if this is a transaction-related endpoint
      const isTransactionEndpoint = req.originalUrl?.includes('/transaction') ||
                                  req.originalUrl?.includes('/payment') ||
                                  req.originalUrl?.includes('/finance') ||
                                  req.originalUrl?.includes('/booking') ||
                                  req.originalUrl?.includes('/package');

      if (userId && isTransactionEndpoint) {
        // Trigger reconciliation asynchronously (don't block the response)
        setImmediate(() => {
          reconciliationService.onTransactionChange(userId, {
            method: req.method,
            url: req.originalUrl,
            body: req.body
          }).catch(error => {
            logger.warn('Auto-reconciliation failed', {
              userId,
              url: req.originalUrl,
              error: error.message
            });
          });
        });
      }
    }
  };
  
  next();
};

/**
 * Express route to manually trigger reconciliation
 * PUT /api/admin/reconcile-finances
 */
export const manualReconciliation = async (req, res) => {
  try {
    const options = {
      source: 'manual',
      triggeredBy: req.user?.id || 'unknown',
      limit: req.body?.limit || null
    };

    const result = await reconciliationService.runReconciliation(options);
    
    res.json({
      success: true,
      message: 'Financial reconciliation completed successfully',
      ...result
    });
  } catch (error) {
    logger.error('Manual reconciliation failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Financial reconciliation failed',
      error: error.message
    });
  }
};

/**
 * Express route to get reconciliation stats
 * GET /api/admin/reconcile-finances/stats
 */
export const getReconciliationStats = (req, res) => {
  try {
    const stats = reconciliationService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get reconciliation stats',
      error: error.message
    });
  }
};