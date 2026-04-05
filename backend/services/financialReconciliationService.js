import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { appendCreatedBy, resolveSystemActorId } from '../utils/auditUtils.js';

/**
 * Automated Financial Reconciliation Service
 * 
 * This service runs periodic checks to ensure financial data integrity
 * and automatically fixes discrepancies between stored values and transaction ledger.
 */

class FinancialReconciliationService {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      totalChecks: 0,
      discrepanciesFound: 0,
      discrepanciesFixed: 0,
      errors: 0
    };
  }

  parseNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  roundCurrency(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
  }

  parseDateSafe(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async calculateUserFinancials(userId) {
    const query = `
      SELECT 
        id, amount, type, status, description, payment_method,
        COALESCE(transaction_date, created_at) as effective_date,
        created_at
      FROM transactions 
      WHERE user_id = $1 
      ORDER BY effective_date DESC, id DESC
    `;
    
    const { rows } = await pool.query(query, [userId]);
    
    let balance = 0;
    let totalSpent = 0;
    let lastPaymentAt = null;

    for (const transaction of rows) {
      const amount = this.parseNumber(transaction.amount);
      const type = (transaction.type || '').toLowerCase();
      const effectiveDate = this.parseDateSafe(transaction.effective_date);

      balance += amount;

      const updateLastPayment = () => {
        if (effectiveDate && (!lastPaymentAt || effectiveDate > lastPaymentAt)) {
          lastPaymentAt = effectiveDate;
        }
      };

      switch (type) {
        case 'payment':
        case 'credit':
          if (amount !== 0) {
            totalSpent += Math.abs(amount);
            updateLastPayment();
          }
          break;
        case 'package_refund':
        case 'refund':
        case 'booking_deleted_refund':
          if (amount > 0) {
            updateLastPayment();
          }
          break;
        case 'package_purchase':
        case 'booking_charge':
        case 'charge':
        case 'debit':
        case 'service_payment':
        case 'rental_payment':
          break;
        default:
          if (amount > 0) {
            totalSpent += amount;
            updateLastPayment();
          }
      }
    }

    return {
      balance: this.roundCurrency(balance),
      totalSpent: this.roundCurrency(totalSpent),
      lastPaymentAt,
      transactionCount: rows.length
    };
  }

  async checkAndFixUser(user) {
    try {
      const calculated = await this.calculateUserFinancials(user.id);
      const storedBalance = this.parseNumber(user.stored_balance);
      const storedTotalSpent = this.parseNumber(user.stored_total_spent);

      const balanceDiff = Math.abs(storedBalance - calculated.balance);
      const totalSpentDiff = Math.abs(storedTotalSpent - calculated.totalSpent);
      const TOLERANCE = 0.01;

      if (balanceDiff > TOLERANCE || totalSpentDiff > TOLERANCE) {
        logger.info('Financial discrepancy detected', {
          userId: user.id,
          email: user.email,
          storedBalance,
          calculatedBalance: calculated.balance,
          balanceDiff,
          storedTotalSpent,
          calculatedTotalSpent: calculated.totalSpent,
          totalSpentDiff
        });

        // Auto-fix the discrepancy
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          if (user.has_account) {
            // Update existing record
            await client.query(`
              UPDATE student_accounts 
              SET balance = $1, 
                  total_spent = $2, 
                  last_payment_date = $3,
                  updated_at = NOW()
              WHERE user_id = $4
            `, [
              calculated.balance,
              calculated.totalSpent,
              calculated.lastPaymentAt,
              user.id
            ]);
          } else {
            // Create new record
            const systemActorId = resolveSystemActorId();
            const baseColumns = ['user_id', 'balance', 'total_spent', 'last_payment_date'];
            const baseValues = [
              user.id,
              calculated.balance,
              calculated.totalSpent,
              calculated.lastPaymentAt
            ];
            const { columns, values } = appendCreatedBy(baseColumns, baseValues, systemActorId);
            const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

            await client.query(`
              INSERT INTO student_accounts (${columns.join(', ')}, created_at, updated_at)
              VALUES (${placeholders}, NOW(), NOW())
            `, values);
          }

          await client.query('COMMIT');
          
          logger.info('Financial discrepancy auto-fixed', {
            userId: user.id,
            email: user.email,
            action: user.has_account ? 'updated' : 'created',
            newBalance: calculated.balance,
            newTotalSpent: calculated.totalSpent
          });

          this.stats.discrepanciesFixed++;
          return { fixed: true, discrepancy: true };

        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      return { fixed: false, discrepancy: false };

    } catch (error) {
      logger.error('Error checking user financial data', {
        userId: user.id,
        email: user.email,
        error: error.message
      });
      this.stats.errors++;
      return { fixed: false, discrepancy: false, error: error.message };
    }
  }

  async runReconciliation(options = {}) {
    if (this.isRunning) {
      logger.warn('Financial reconciliation already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      logger.info('Starting automated financial reconciliation', options);

      // Get users with transactions
      const query = `
        SELECT u.id, u.name, u.email, 
               sa.user_id as has_account,
               sa.balance as stored_balance,
               sa.total_spent as stored_total_spent,
               (SELECT COUNT(*) FROM transactions WHERE user_id = u.id) as transaction_count
        FROM users u
        LEFT JOIN student_accounts sa ON sa.user_id = u.id
        WHERE EXISTS (SELECT 1 FROM transactions WHERE user_id = u.id)
        ORDER BY u.created_at DESC
        ${options.limit ? `LIMIT ${parseInt(options.limit, 10)}` : ''}
      `;

      const { rows: users } = await pool.query(query);
      
      let checkedUsers = 0;
      let discrepanciesFound = 0;

      for (const user of users) {
        const result = await this.checkAndFixUser(user);
        checkedUsers++;
        
        if (result.discrepancy) {
          discrepanciesFound++;
          this.stats.discrepanciesFound++;
        }
        
        this.stats.totalChecks++;
      }

      const duration = Date.now() - startTime;
      this.lastRun = new Date();

      logger.info('Financial reconciliation completed', {
        duration: `${duration}ms`,
        usersChecked: checkedUsers,
        discrepanciesFound,
        discrepanciesFixed: this.stats.discrepanciesFixed,
        errors: this.stats.errors
      });

      return {
        success: true,
        usersChecked: checkedUsers,
        discrepanciesFound,
        discrepanciesFixed: this.stats.discrepanciesFixed,
        duration
      };

    } catch (error) {
      logger.error('Financial reconciliation failed', { error: error.message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Schedule periodic reconciliation (call this on server startup)
  startPeriodicReconciliation(intervalMinutes = 60) {
    const intervalMs = intervalMinutes * 60 * 1000;
    
    logger.info('Starting periodic financial reconciliation', { 
      intervalMinutes,
      nextRun: new Date(Date.now() + intervalMs).toISOString()
    });

    // Run initial check after 5 minutes
    setTimeout(() => {
      this.runReconciliation({ source: 'periodic' }).catch(error => {
        logger.error('Periodic reconciliation failed', { error: error.message });
      });
    }, 5 * 60 * 1000);

    // Then run every intervalMinutes
    setInterval(() => {
      this.runReconciliation({ source: 'periodic' }).catch(error => {
        logger.error('Periodic reconciliation failed', { error: error.message });
      });
    }, intervalMs);
  }

  // Trigger reconciliation when financial transactions are created/updated
  async onTransactionChange(userId, transactionData = {}) {
    logger.info('Transaction change detected, triggering reconciliation', {
      userId,
      transactionData
    });

    try {
      const user = await pool.query(`
        SELECT u.id, u.name, u.email, 
               sa.user_id as has_account,
               sa.balance as stored_balance,
               sa.total_spent as stored_total_spent
        FROM users u
        LEFT JOIN student_accounts sa ON sa.user_id = u.id
        WHERE u.id = $1
      `, [userId]);

      if (user.rows.length > 0) {
        await this.checkAndFixUser(user.rows[0]);
      }
    } catch (error) {
      logger.error('Transaction-triggered reconciliation failed', {
        userId,
        error: error.message
      });
    }
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      lastRun: this.lastRun
    };
  }
}

// Export singleton instance
const reconciliationService = new FinancialReconciliationService();

export { reconciliationService, FinancialReconciliationService };