import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.js';
import { getWalletAccountSummary } from '../services/walletService.js';

const router = express.Router();

/**
 * CLEAN FINANCIAL API SYSTEM
 * 
 * Single source of truth for customer financial data:
 * - Balance = SUM(all credit transactions) - SUM(all debit transactions)
 * - No complex calculations, just simple transaction arithmetic
 * - Consistent across all endpoints
 */

// ===========================================================================================
// CORE FINANCIAL CALCULATION FUNCTIONS
// ===========================================================================================

/**
 * Calculate user balance from transactions (single source of truth)
 */
async function calculateUserBalance(userId) {
  let walletSummary = null;

  try {
    walletSummary = await getWalletAccountSummary(userId);
  } catch (error) {
    if (error?.code !== '42P01') {
      console.warn('Failed to compute wallet account summary for balance calculation', {
        userId,
        error: error.message
      });
    }
  }

  const canUseWalletSummary = Boolean(
    walletSummary && (
      walletSummary.balanceId ||
      walletSummary.totalCredits > 0 ||
      walletSummary.totalDebits > 0 ||
      walletSummary.pending > 0 ||
      walletSummary.nonWithdrawable > 0
    )
  );

  if (canUseWalletSummary) {
    return {
      balance: walletSummary.available,
      totalSpent: walletSummary.totalSpent
    };
  }

  const transactionsResult = await pool.query(
    `SELECT type, amount FROM transactions WHERE user_id = $1`,
    [userId]
  );
  
  let balance = 0;
  let totalSpent = 0;
  
  for (const txn of transactionsResult.rows) {
    const amount = parseFloat(txn.amount) || 0;
    
    switch (txn.type) {
      case 'payment':
      case 'credit':
        balance += amount;
        totalSpent += amount;
        break;
      case 'refund':
      case 'booking_deleted_refund':
        balance += amount;
        // Refunds don't count as spending
        break;
      case 'charge':
      case 'debit':
      case 'service_payment':
      case 'rental_payment':
        balance -= amount;
        break;
      default:
        console.warn(`Unknown transaction type: ${txn.type}`);
    }
  }
  
  return { balance, totalSpent };
}

/**
 * Update user balance in database to match calculated balance
 */
async function syncUserBalance(userId) {
  const { balance, totalSpent } = await calculateUserBalance(userId);
  
  await pool.query(
    `UPDATE users 
     SET balance = $1, total_spent = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [balance, totalSpent, userId]
  );
  
  return { balance, totalSpent };
}

// ===========================================================================================
// API ENDPOINTS
// ===========================================================================================

/**
 * GET /api/finances/accounts/:id
 * Get user financial account information
 */
router.get('/accounts/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user basic info
    const userResult = await pool.query(
      `SELECT 
        u.id, u.name, u.email, u.role_id, r.name as role_name,
        u.balance as db_balance, u.total_spent as db_total_spent, 
        u.last_payment_date, u.account_status,
        u.created_at, u.updated_at
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Calculate actual balance from transactions
    const { balance, totalSpent } = await calculateUserBalance(id);
    
    // Sync database if there's a discrepancy
    const dbBalance = parseFloat(userResult.rows[0].db_balance) || 0;
    const dbTotalSpent = parseFloat(userResult.rows[0].db_total_spent) || 0;
    
    if (Math.abs(dbBalance - balance) > 0.01 || Math.abs(dbTotalSpent - totalSpent) > 0.01) {
      console.log(`Syncing balance for user ${id}: DB=${dbBalance}, Calculated=${balance}`);
      await syncUserBalance(id);
    }
    
    const account = userResult.rows[0];
    
    return res.status(200).json({
      id: account.id,
      name: account.name,
      email: account.email,
      role_id: account.role_id,
      role_name: account.role_name,
      balance: balance, // Always use calculated balance
      total_spent: totalSpent, // Always use calculated total spent
      lifetime_value: totalSpent, // Lifetime value = total amount ever paid
      last_payment_date: account.last_payment_date,
      account_status: account.account_status,
      created_at: account.created_at,
      updated_at: account.updated_at
    });
    
  } catch (error) {
    console.error('Error fetching account:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/finances/transactions
 * Get user transactions with optional filtering
 */
router.get('/transactions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { user_id, limit = 50, offset = 0, type, start_date, end_date } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const queryParams = [];
    let paramCount = 0;
    
    if (user_id) {
      paramCount++;
      whereClause += ` AND user_id = $${paramCount}`;
      queryParams.push(user_id);
    }
    
    if (type) {
      paramCount++;
      whereClause += ` AND type = $${paramCount}`;
      queryParams.push(type);
    }
    
    if (start_date) {
      paramCount++;
      whereClause += ` AND transaction_date >= $${paramCount}`;
      queryParams.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      whereClause += ` AND transaction_date <= $${paramCount}`;
      queryParams.push(end_date);
    }
    
    paramCount++;
    const limitClause = ` LIMIT $${paramCount}`;
    queryParams.push(parseInt(limit));
    
    paramCount++;
    const offsetClause = ` OFFSET $${paramCount}`;
    queryParams.push(parseInt(offset));
    
    const transactionsResult = await pool.query(
      `SELECT 
        id, user_id, amount, type, description, payment_method,
        reference_number, booking_id, transaction_date, currency,
        entity_type, status, created_by, created_at, updated_at
       FROM transactions
       ${whereClause}
       ORDER BY transaction_date DESC, created_at DESC
       ${limitClause} ${offsetClause}`,
      queryParams
    );
    
    return res.status(200).json(transactionsResult.rows);
    
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/finances/transactions
 * Create a new transaction
 */
router.post('/transactions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      user_id,
      amount,
      type,
      description,
      payment_method,
      reference_number,
      booking_id,
      entity_type,
      currency = 'EUR'
    } = req.body;
    
    // Validate required fields
    if (!user_id || !amount || !type) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Missing required fields: user_id, amount, type' });
    }
    
    // Validate transaction type
    const validTypes = [
      'payment', 'credit', 'refund', 'booking_deleted_refund',
      'charge', 'debit', 'service_payment', 'rental_payment'
    ];
    
    if (!validTypes.includes(type)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Invalid transaction type. Must be one of: ${validTypes.join(', ')}` });
    }
    
    // Verify user exists
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Create transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, description, payment_method, reference_number, 
          booking_id, transaction_date, currency, entity_type, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, $9, 'completed', $10)
       RETURNING *`,
      [user_id, amount, type, description, payment_method, reference_number, 
       booking_id, currency, entity_type, req.user.id]
    );
    
    // Sync user balance
    await syncUserBalance(user_id);
    
    await client.query('COMMIT');
    
    return res.status(201).json({
      message: 'Transaction created successfully',
      transaction: transactionResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating transaction:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/finances/transactions/:id
 * Delete a transaction and update user balance
 */
router.delete('/transactions/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Get transaction details first
    const transactionResult = await client.query(
      'SELECT * FROM transactions WHERE id = $1',
      [id]
    );
    
    if (transactionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    const transaction = transactionResult.rows[0];
    const userId = transaction.user_id;
    
    // Delete the transaction
    await client.query('DELETE FROM transactions WHERE id = $1', [id]);
    
    // Sync user balance (will recalculate from remaining transactions)
    await syncUserBalance(userId);
    
    await client.query('COMMIT');
    
    return res.status(200).json({
      message: 'Transaction deleted successfully',
      deletedTransaction: transaction
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting transaction:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/finances/accounts/:id/add-funds
 * Add funds to user account
 */
router.post('/accounts/:id/add-funds', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { amount, description = 'Funds added', payment_method, reference_number } = req.body;
    
    if (!amount || amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }
    
    // Create payment transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, description, payment_method, reference_number,
          transaction_date, currency, status, created_by)
       VALUES ($1, $2, 'payment', $3, $4, $5, CURRENT_TIMESTAMP, 'EUR', 'completed', $6)
       RETURNING *`,
      [id, amount, description, payment_method, reference_number, req.user.id]
    );
    
    // Sync user balance and update last payment date
    await syncUserBalance(id);
    await client.query(
      'UPDATE users SET last_payment_date = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    
    await client.query('COMMIT');
    
    return res.status(200).json({
      message: 'Funds added successfully',
      transaction: transactionResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding funds:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/finances/accounts/:id/process-refund
 * Process a refund for user
 */
router.post('/accounts/:id/process-refund', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { amount, description = 'Refund processed', booking_id, entity_type } = req.body;
    
    if (!amount || amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }
    
    // Create refund transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, description, booking_id, entity_type,
          transaction_date, currency, status, created_by)
       VALUES ($1, $2, 'refund', $3, $4, $5, CURRENT_TIMESTAMP, 'EUR', 'completed', $6)
       RETURNING *`,
      [id, amount, description, booking_id, entity_type, req.user.id]
    );
    
    // Sync user balance
    await syncUserBalance(id);
    
    await client.query('COMMIT');
    
    return res.status(200).json({
      message: 'Refund processed successfully',
      transaction: transactionResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing refund:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/finances/accounts/:id/process-charge
 * Charge user account
 */
router.post('/accounts/:id/process-charge', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { amount, description = 'Account charged', booking_id, entity_type } = req.body;
    
    if (!amount || amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }
    
    // Create charge transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, description, booking_id, entity_type,
          transaction_date, currency, status, created_by)
       VALUES ($1, $2, 'charge', $3, $4, $5, CURRENT_TIMESTAMP, 'EUR', 'completed', $6)
       RETURNING *`,
      [id, amount, description, booking_id, entity_type, req.user.id]
    );
    
    // Sync user balance
    await syncUserBalance(id);
    
    await client.query('COMMIT');
    
    return res.status(200).json({
      message: 'Charge processed successfully',
      transaction: transactionResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing charge:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/finances/balance-sync/:id
 * Manually sync user balance (for debugging/admin use)
 */
router.get('/balance-sync/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get current database balance
    const userResult = await pool.query('SELECT balance, total_spent FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const oldBalance = parseFloat(userResult.rows[0].balance) || 0;
    const oldTotalSpent = parseFloat(userResult.rows[0].total_spent) || 0;
    
    // Calculate and sync new balance
    const { balance, totalSpent } = await syncUserBalance(id);
    
    return res.status(200).json({
      message: 'Balance synced successfully',
      old_balance: oldBalance,
      new_balance: balance,
      old_total_spent: oldTotalSpent,
      new_total_spent: totalSpent,
      balance_difference: balance - oldBalance,
      total_spent_difference: totalSpent - oldTotalSpent
    });
    
  } catch (error) {
    console.error('Error syncing balance:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export const __testables = {
  calculateUserBalance
};

export default router;
