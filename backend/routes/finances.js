import express from 'express';
import { pool } from '../db.js';
import { computeCashNetRevenue } from '../services/cashModeAggregator.js';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { getInstructorEarningsData, getInstructorPayrollHistory, getAllInstructorBalances } from '../services/instructorFinanceService.js';
import { resolveActorId } from '../utils/auditUtils.js';
import {
  getWalletAccountSummary,
  recordTransaction as recordWalletTransaction,
  recordLegacyTransaction,
  fetchTransactions as fetchWalletTransactions,
  getTransactionById as getWalletTransactionById
} from '../services/walletService.js';
import { fetchCustomerPackagesByIds, forceDeleteCustomerPackage, mapWalletTransactionForResponse } from '../services/customerPackageService.js';
import { fetchRentalsByIds, forceDeleteRental } from '../services/rentalCleanupService.js';
import {
  syncServiceRevenueLedger,
  getServiceLedgerTotals,
  LEDGER_COMPLETED_BOOKING_STATUSES,
  LEDGER_NEGATIVE_STATUSES
} from '../services/serviceRevenueLedger.js';
import { initiateDeposit, verifyPayment } from '../services/paymentGateways/iyzicoGateway.js';

const router = express.Router();
const NET_REVENUE_ENABLED = process.env.NET_REVENUE_ENABLED === 'true';

const CREDIT_TRANSACTION_TYPES = new Set(['credit', 'manual_credit', 'wallet_deposit', 'refund', 'booking_deleted_refund', 'package_refund']);
const DEBIT_TRANSACTION_TYPES = new Set(['charge', 'debit', 'payment', 'service_payment', 'rental_payment', 'rental_charge', 'booking_charge', 'package_purchase']);
const PACKAGE_CASCADE_STRATEGIES = new Set(['delete-all-lessons', 'charge-used']);
const DEFAULT_PACKAGE_STRATEGY = 'delete-all-lessons';

// ===========================================================================================
// IYZICO PAYMENT CALLBACKS
// ===========================================================================================
// NOTE: Both POST and GET Iyzico callback handlers are in server.js
// They are registered BEFORE route mounting so they run without authenticateJWT.
// No callback routes are needed here.

function resolveWalletAmount(transactionType, rawAmount) {
  const numeric = Number.parseFloat(rawAmount);
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.0001) {
    return 0;
  }

  if (CREDIT_TRANSACTION_TYPES.has(transactionType)) {
    return Math.abs(numeric);
  }

  if (DEBIT_TRANSACTION_TYPES.has(transactionType)) {
    return -Math.abs(numeric);
  }

  return numeric;
}



// ===========================================================================================
// CORE FINANCIAL CALCULATION FUNCTIONS
// ===========================================================================================

/**
 * Calculate user balance from transactions (single source of truth)
 * @param {string} userId - User ID
 * @param {string} [currency] - Currency to query (defaults to EUR - the storage currency)
 * NOTE: All financial data is stored in EUR. Always pass 'EUR' or let it default.
 */
async function calculateUserBalance(userId, currency = 'EUR') {
  try {
    // Always use EUR as the storage currency
    // The frontend handles conversion to display currency
    const storageCurrency = currency || 'EUR';
    
    const walletSummary = await getWalletAccountSummary(userId, storageCurrency);

    if (!walletSummary) {
      return { balance: 0, totalSpent: 0, walletSummary: null };
    }

    return {
      balance: walletSummary.available ?? 0,
      totalSpent: walletSummary.totalSpent ?? walletSummary.totalDebits ?? 0,
      walletSummary
    };
  } catch (error) {
    logger.error('Failed to compute wallet account summary', {
      userId,
      error: error?.message
    });
    throw error;
  }
}

function mapTransactionRow(row) {
  if (!row) {
    return null;
  }

  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const toNumber = (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const bookingId = row.booking_id
    ?? (row.related_entity_type === 'booking' ? row.related_entity_id : null)
    ?? metadata.bookingId
    ?? null;
  const rentalId = row.rental_id
    ?? (row.related_entity_type === 'rental' ? row.related_entity_id : null)
    ?? metadata.rentalId
    ?? null;
  const paymentMethod = row.payment_method ?? metadata.paymentMethod ?? null;
  const referenceNumber = row.reference_number ?? metadata.referenceNumber ?? null;
  const entityType = row.entity_type ?? row.related_entity_type ?? metadata.entityType ?? null;

  return {
    id: row.id,
    user_id: row.user_id,
    amount: toNumber(row.amount),
    type: row.transaction_type,
    description: row.description || metadata.description || null,
    payment_method: paymentMethod,
    reference_number: referenceNumber,
    booking_id: bookingId,
    rental_id: rentalId,
    entity_type: entityType,
    status: row.status,
    transaction_date: row.transaction_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    currency: row.currency,
    direction: row.direction,
    metadata
  };
}

async function loadTransactionById(_client, id) {
  const transaction = await getWalletTransactionById(id);
  return transaction || null;
}

async function resolveTransactionDependencies(client, transactionRow) {
  const dependencies = { bookings: [], packages: [], rentals: [] };

  if (!transactionRow) {
    return dependencies;
  }

  const bookingIds = [];
  const metadata = transactionRow.metadata && typeof transactionRow.metadata === 'object'
    ? transactionRow.metadata
    : {};

  if (transactionRow.related_entity_type === 'booking' && transactionRow.related_entity_id) {
    bookingIds.push(transactionRow.related_entity_id);
  }

  if (metadata.bookingId) {
    bookingIds.push(metadata.bookingId);
  }

  if (Array.isArray(metadata.bookingIds)) {
    bookingIds.push(...metadata.bookingIds.filter(Boolean));
  }

  const uniqueBookingIds = [...new Set(bookingIds.filter(Boolean))];

  if (uniqueBookingIds.length > 0) {
    try {
      const { rows } = await client.query(
        `SELECT b.id, b.date, b.start_hour, b.duration, b.status, b.payment_status,
                b.student_user_id, b.instructor_user_id, s.name AS service_name
           FROM bookings b
      LEFT JOIN services s ON s.id = b.service_id
          WHERE b.id = ANY($1)
            AND b.deleted_at IS NULL`,
        [uniqueBookingIds]
      );

      dependencies.bookings = rows.map((row) => ({
        id: row.id,
        date: row.date,
        start_hour: row.start_hour,
        duration: row.duration,
        status: row.status,
        payment_status: row.payment_status,
        service_name: row.service_name,
        student_user_id: row.student_user_id,
        instructor_user_id: row.instructor_user_id
      }));
    } catch (error) {
      logger.warn('Failed to resolve transaction booking dependencies', {
        transactionId: transactionRow.id,
        error: error.message
      });
    }
  }

  const packageIds = new Set();

  if (transactionRow.related_entity_type === 'customer_package' && transactionRow.related_entity_id) {
    packageIds.add(transactionRow.related_entity_id);
  }

  if (metadata.packageId) {
    packageIds.add(metadata.packageId);
  }

  if (metadata.customerPackageId) {
    packageIds.add(metadata.customerPackageId);
  }

  if (Array.isArray(metadata.packageIds)) {
    metadata.packageIds.filter(Boolean).forEach((value) => packageIds.add(value));
  }

  if (packageIds.size > 0) {
    try {
      dependencies.packages = await fetchCustomerPackagesByIds(client, [...packageIds]);
    } catch (error) {
      logger.warn('Failed to resolve transaction package dependencies', {
        transactionId: transactionRow.id,
        error: error.message
      });
    }
  }

  const rentalIds = new Set();

  if (transactionRow.related_entity_type === 'rental' && transactionRow.related_entity_id) {
    rentalIds.add(transactionRow.related_entity_id);
  }

  if (transactionRow.rental_id) {
    rentalIds.add(transactionRow.rental_id);
  }

  if (metadata.rentalId) {
    rentalIds.add(metadata.rentalId);
  }

  if (metadata.rental_id) {
    rentalIds.add(metadata.rental_id);
  }

  if (Array.isArray(metadata.rentalIds)) {
    metadata.rentalIds.filter(Boolean).forEach((value) => rentalIds.add(value));
  }

  if (rentalIds.size > 0) {
    try {
      dependencies.rentals = await fetchRentalsByIds(client, [...rentalIds]);
    } catch (error) {
      logger.warn('Failed to resolve transaction rental dependencies', {
        transactionId: transactionRow.id,
        error: error.message
      });
    }
  }

  return dependencies;
}

// ===========================================================================================
// API ENDPOINTS
// ===========================================================================================

/**
 * Custom middleware to allow users to view their own financial data
 * OR allow admin/managers to view anyone's financial data
 */
const authorizeFinancialAccess = async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.id;
    
    // Allow if user is viewing their own data
    if (currentUserId === id) {
      return next();
    }
    
    // Otherwise, check if user has admin/manager role
    const roleResult = await pool.query(
      `SELECT r.name as role_name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1`,
      [currentUserId]
    );

    const userRole = roleResult.rows[0]?.role_name;
    
    if (userRole && ['admin', 'manager'].includes(userRole)) {
      return next();
    }
    
    return res.status(403).json({ 
      error: 'Access denied. You can only view your own financial data.' 
    });
    
  } catch (error) {
  logger.error('Authorization error:', error);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
};

/**
 * GET /api/finances/accounts/:id
 * Get user financial account information
 * NOTE: All financial data is stored in EUR (base currency).
 * The frontend handles conversion to user's preferred display currency.
 */
router.get('/accounts/:id', authenticateJWT, authorizeFinancialAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user basic info including preferred_currency
    const userResult = await pool.query(
      `SELECT 
        u.id, u.name, u.email, u.role_id, r.name as role_name,
        u.balance as db_balance, u.total_spent as db_total_spent, 
        u.last_payment_date, u.account_status,
        u.preferred_currency,
        u.created_at, u.updated_at
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const account = userResult.rows[0];
    const userPreferredCurrency = account.preferred_currency || 'EUR';
    
    // Try user's preferred currency first, then fallback to EUR
    let walletCurrency = userPreferredCurrency;
    let { balance, totalSpent, walletSummary } = await calculateUserBalance(id, walletCurrency);

    // If no balance found in preferred currency, try EUR
    if (walletCurrency !== 'EUR' && (!walletSummary || (walletSummary.available === 0 && walletSummary.totalCredits === 0))) {
      const eurResult = await calculateUserBalance(id, 'EUR');
      if (eurResult.walletSummary && (eurResult.walletSummary.available !== 0 || eurResult.walletSummary.totalCredits !== 0)) {
        balance = eurResult.balance;
        totalSpent = eurResult.totalSpent;
        walletSummary = eurResult.walletSummary;
        walletCurrency = 'EUR';
      }
    }

    // Last resort: check if user has balance in ANY currency
    if (!walletSummary || (walletSummary.available === 0 && walletSummary.totalCredits === 0)) {
      try {
        const anyBalance = await pool.query(
          `SELECT currency, available_amount FROM wallet_balances WHERE user_id = $1 AND (available_amount != 0) LIMIT 1`,
          [id]
        );
        if (anyBalance.rows.length > 0) {
          const foundCurrency = anyBalance.rows[0].currency;
          const anyResult = await calculateUserBalance(id, foundCurrency);
          if (anyResult.walletSummary) {
            balance = anyResult.balance;
            totalSpent = anyResult.totalSpent;
            walletSummary = anyResult.walletSummary;
            walletCurrency = foundCurrency;
          }
        }
      } catch (_) { /* fallback, non-critical */ }
    }

    const responseBody = {
      id: account.id,
      name: account.name,
      email: account.email,
      role_id: account.role_id,
      role_name: account.role_name,
      balance,
      total_spent: totalSpent,
      lifetime_value: totalSpent,
      last_payment_date: account.last_payment_date || walletSummary?.lastCreditAt || null,
      account_status: account.account_status,
      preferred_currency: userPreferredCurrency,
      storage_currency: walletCurrency, // Actual currency of the balance values
      created_at: account.created_at,
      updated_at: account.updated_at
    };

    if (walletSummary) {
      responseBody.wallet = {
        available: walletSummary.available,
        pending: walletSummary.pending,
        non_withdrawable: walletSummary.nonWithdrawable,
        total_credits: walletSummary.totalCredits,
        total_debits: walletSummary.totalDebits,
        total_spent: walletSummary.totalSpent,
        last_credit_at: walletSummary.lastCreditAt,
        last_transaction_at: walletSummary.lastTransactionAt,
        currency: walletCurrency
      };
    }

    return res.status(200).json(responseBody);
    
  } catch (error) {
  logger.error('Error fetching account:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/finances/transactions
 * Get user transactions with optional filtering
 */
/**
 * GET /api/finances/transactions/payments
 * Get all payments including VIP memberships, package purchases, and wallet transactions
 * Used by FinanceMembership page for transaction history table
 */
router.get('/transactions/payments', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Get VIP membership purchases from member_purchases
    const memberPurchasesQuery = `
      SELECT 
        mp.id::text as id,
        mp.user_id,
        u.name as user_name,
        u.email as user_email,
        'membership' as transaction_type,
        mp.offering_price as amount,
        mp.offering_currency as currency,
        mp.offering_name as description,
        mp.purchased_at as date,
        mp.payment_status as status,
        mp.payment_method
      FROM member_purchases mp
      JOIN users u ON u.id = mp.user_id
      WHERE mp.purchased_at >= $1::date AND mp.purchased_at <= $2::date
        AND mp.payment_status = 'completed'
      ORDER BY mp.purchased_at DESC
    `;

    // Get package purchases from wallet_transactions
    const packageTransactionsQuery = `
      SELECT 
        wt.id::text as id,
        wt.user_id,
        u.name as user_name,
        u.email as user_email,
        wt.transaction_type,
        ABS(wt.amount) as amount,
        wt.currency,
        wt.description,
        wt.transaction_date as date,
        wt.status,
        wt.payment_method
      FROM wallet_transactions wt
      JOIN users u ON u.id = wt.user_id
      WHERE wt.transaction_date >= $1::date AND wt.transaction_date <= $2::date
        AND wt.status = 'completed'
        AND wt.transaction_type = 'package_purchase'
      ORDER BY wt.transaction_date DESC
    `;

    const [memberPurchases, packageTransactions] = await Promise.all([
      pool.query(memberPurchasesQuery, [startDate, endDate]),
      pool.query(packageTransactionsQuery, [startDate, endDate])
    ]);

    // Combine and sort by date
    const allPayments = [...memberPurchases.rows, ...packageTransactions.rows]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Create customer directory for the frontend
    const customerDirectory = {};
    allPayments.forEach(payment => {
      if (!customerDirectory[payment.user_id]) {
        customerDirectory[payment.user_id] = {
          id: payment.user_id,
          name: payment.user_name,
          email: payment.user_email
        };
      }
    });

    return res.status(200).json({
      payments: allPayments,
      customerDirectory
    });
  } catch (error) {
    logger.error('Error fetching payments:', error);
    return res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

router.get('/transactions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const {
      user_id,
      limit = 50,
      offset = 0,
      type,
      start_date,
      end_date,
      status,
      direction,
      currency
    } = req.query;

    const options = {
      limit: Number.parseInt(limit, 10) || 50,
      offset: Number.parseInt(offset, 10) || 0,
      transactionType: type || undefined,
      startDate: start_date || undefined,
      endDate: end_date || undefined,
      status: status || undefined,
      direction: direction || undefined,
      currency: currency || undefined
    };

    const rows = await fetchWalletTransactions(user_id || undefined, options);

    // Enrich shop order transaction descriptions with actual item names
    const shopOrderRows = rows.filter(r => r.related_entity_type === 'shop_order');
    let itemsByOrderId = {};
    if (shopOrderRows.length > 0) {
      const orderIds = [...new Set(shopOrderRows.map(r => {
        const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
        return meta.orderId;
      }).filter(Boolean))];
      if (orderIds.length > 0) {
        const itemsResult = await pool.query(
          'SELECT order_id, product_name, quantity FROM shop_order_items WHERE order_id = ANY($1)',
          [orderIds]
        );
        for (const item of itemsResult.rows) {
          if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
          itemsByOrderId[item.order_id].push(item);
        }
      }
    }

    // Calculate stats from ALL matching transactions (no limit) for accurate totals
    const statsFilters = [];
    const statsParams = [];
    let sIdx = 0;
    statsFilters.push(`status != 'cancelled'`);
    statsFilters.push(`NOT (status = 'pending' AND available_delta = 0 AND payment_method = 'credit_card')`);
    if (options.startDate) { statsParams.push(new Date(options.startDate)); statsFilters.push(`transaction_date >= $${++sIdx}`); }
    if (options.endDate) { statsParams.push(new Date(options.endDate)); statsFilters.push(`transaction_date <= $${++sIdx}`); }
    if (options.transactionType) { statsParams.push(options.transactionType); statsFilters.push(`transaction_type = $${++sIdx}`); }
    if (user_id) { statsParams.push(user_id); statsFilters.push(`user_id = $${++sIdx}`); }
    const statsWhere = statsFilters.length > 0 ? `WHERE ${statsFilters.join(' AND ')}` : '';
    const [statsResult, breakdownResult, trendResult] = await Promise.all([
      pool.query(`
        SELECT
          count(*) as total_count,
          COALESCE(sum(CASE WHEN direction = 'credit' THEN abs(amount) ELSE 0 END), 0) as total_income,
          COALESCE(sum(CASE WHEN direction = 'debit' THEN abs(amount) ELSE 0 END), 0) as total_charges
        FROM wallet_transactions
        ${statsWhere}
      `, statsParams),
      pool.query(`
        SELECT transaction_type, direction, count(*)::int as count, COALESCE(sum(abs(amount)), 0) as total
        FROM wallet_transactions
        ${statsWhere}
        GROUP BY transaction_type, direction
        ORDER BY total DESC
      `, statsParams),
      pool.query(`
        SELECT
          to_char(transaction_date, 'YYYY-MM') as month,
          COALESCE(sum(CASE WHEN direction = 'credit' THEN abs(amount) ELSE 0 END), 0) as income,
          COALESCE(sum(CASE WHEN direction = 'debit' THEN abs(amount) ELSE 0 END), 0) as charges
        FROM wallet_transactions
        ${statsWhere}
        GROUP BY to_char(transaction_date, 'YYYY-MM')
        ORDER BY month
      `, statsParams)
    ]);
    const statsRow = statsResult.rows[0];
    const totalIncome = parseFloat(statsRow.total_income) || 0;
    const totalCharges = parseFloat(statsRow.total_charges) || 0;

    // Enrich transactions with user names
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length > 0) {
      const usersResult = await pool.query(
        'SELECT id, first_name, last_name, email FROM users WHERE id = ANY($1)',
        [userIds]
      );
      for (const u of usersResult.rows) {
        userMap[u.id] = { name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email, email: u.email };
      }
    }

    const mapped = rows.map(row => {
      const mappedRow = mapTransactionRow(row);
      if (row.related_entity_type === 'shop_order') {
        const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        const items = meta.orderId ? itemsByOrderId[meta.orderId] : null;
        if (items && items.length > 0) {
          const itemSummary = items.length <= 3
            ? items.map(i => `${i.product_name} x${i.quantity}`).join(', ')
            : `${items.slice(0, 2).map(i => `${i.product_name} x${i.quantity}`).join(', ')} +${items.length - 2} more`;
          mappedRow.description = meta.orderNumber
            ? `${itemSummary} - Order #${meta.orderNumber}`
            : itemSummary;
        }
      }
      mappedRow.user = userMap[row.user_id] || null;
      return mappedRow;
    });
    return res.status(200).json({
      transactions: mapped,
      stats: {
        totalIncome,
        totalCharges,
        net: totalIncome - totalCharges,
        total: parseInt(statsRow.total_count) || 0
      },
      breakdown: breakdownResult.rows.map(r => ({
        type: r.transaction_type,
        direction: r.direction,
        count: r.count,
        total: parseFloat(r.total) || 0
      })),
      trend: trendResult.rows.map(r => ({
        month: r.month,
        income: parseFloat(r.income) || 0,
        charges: parseFloat(r.charges) || 0
      }))
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/finances/transactions
 * Create a new transaction
 */
router.post('/transactions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
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

    if (!user_id || amount === undefined || amount === null || !type) {
      return res.status(400).json({ message: 'Missing required fields: user_id, amount, type' });
    }

    const validTypes = [
      'payment', 'credit', 'refund', 'booking_deleted_refund', 'package_refund',
      'charge', 'debit', 'service_payment', 'rental_payment', 'package_purchase'
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: `Invalid transaction type. Must be one of: ${validTypes.join(', ')}` });
    }

    const actorId = resolveActorId(req);
    const numericAmount = Number.parseFloat(amount);

    if (!Number.isFinite(numericAmount) || Math.abs(numericAmount) < 0.0001) {
      return res.status(400).json({ message: 'Amount must be a valid non-zero number' });
    }

    const walletAmount = resolveWalletAmount(type, numericAmount);

    if (walletAmount === 0) {
      return res.status(400).json({ message: 'Transaction amount results in no wallet change' });
    }

    const transactionRecord = await recordWalletTransaction({
      userId: user_id,
      amount: walletAmount,
      transactionType: type,
      currency,
      description: description || null,
      paymentMethod: payment_method || null,
      referenceNumber: reference_number || null,
      bookingId: booking_id || null,
      entityType: entity_type || null,
      metadata: {
        origin: 'finances_manual_transaction',
        paymentMethod: payment_method || null,
        referenceNumber: reference_number || null,
        bookingId: booking_id || null,
        entityType: entity_type || null
      },
      relatedEntityType: entity_type || null,
      relatedEntityId: booking_id || null,
      createdBy: actorId || null,
      allowNegative: walletAmount < 0
    });

    const { walletSummary } = await calculateUserBalance(user_id);

    return res.status(201).json({
      message: 'Transaction created successfully',
      transaction: mapTransactionRow(transactionRecord),
      wallet: walletSummary || null
    });
  } catch (error) {
    logger.error('Error creating transaction:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/transactions/:id/dependencies', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const transaction = await loadTransactionById(client, id);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const dependencies = await resolveTransactionDependencies(client, transaction);

    const hasDependencies =
      (dependencies.bookings?.length || 0) > 0 ||
      (dependencies.packages?.length || 0) > 0 ||
      (dependencies.rentals?.length || 0) > 0;

    return res.status(200).json({
      transaction: mapTransactionRow(transaction),
      dependencies,
      hasDependencies
    });
  } catch (error) {
    logger.error('Error fetching transaction dependencies:', error);
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
  const hardDelete = String(req.query.hardDelete || req.body?.hardDelete || '').toLowerCase() === 'true';
  
  logger.info('🗑️ Delete transaction request received', {
    user: req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : 'No user',
    transactionId: req.params.id,
    method: req.method,
    url: req.url,
    path: req.path,
    force: req.query.force,
    hardDelete
  });
  
  const client = await pool.connect();
  let transaction = null;
  const actorId = resolveActorId(req) || null;
  const cancellationReason = req.body?.reason || null;
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const forceDelete = String(req.query.force || '').toLowerCase() === 'true';
    const cascade = req.body?.cascade && typeof req.body.cascade === 'object' ? req.body.cascade : {};
    const cascadePackagesRaw = Array.isArray(cascade.packages) ? cascade.packages : [];
    const cascadeRentalsRaw = Array.isArray(cascade.rentals) ? cascade.rentals : [];

    const cascadePackageSelections = new Map();
    for (const rawEntry of cascadePackagesRaw) {
      if (!rawEntry) {
        continue;
      }

      let packageId = null;
      let strategy = null;
      let allowNegative = undefined;

      if (typeof rawEntry === 'string') {
        packageId = rawEntry;
      } else if (typeof rawEntry === 'object') {
        packageId = rawEntry.id || rawEntry.packageId || rawEntry.package_id || null;
        strategy = typeof rawEntry.strategy === 'string' ? rawEntry.strategy : null;
        if (typeof rawEntry.allowNegative === 'boolean') {
          allowNegative = rawEntry.allowNegative;
        }
      }

      if (!packageId) {
        continue;
      }

      const existing = cascadePackageSelections.get(packageId) || {};
      cascadePackageSelections.set(packageId, {
        id: packageId,
        strategy: strategy || existing.strategy || null,
        allowNegative:
          allowNegative !== undefined
            ? allowNegative
            : existing.allowNegative
      });
    }

    const cascadePackages = Array.from(cascadePackageSelections.values());
    const cascadePackageIds = cascadePackages.map((entry) => entry.id);
    const cascadeRentals = [...new Set(cascadeRentalsRaw.filter(Boolean))];

    transaction = await loadTransactionById(client, id);

    if (!transaction) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const dependencies = await resolveTransactionDependencies(client, transaction);
    const hasDependencies =
      (dependencies.bookings?.length || 0) > 0 ||
      (dependencies.packages?.length || 0) > 0 ||
      (dependencies.rentals?.length || 0) > 0;

    if (hasDependencies && !forceDelete) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Transaction has linked bookings, packages, or rentals that must be removed first.',
        transaction: mapTransactionRow(transaction),
        dependencies,
        hasDependencies: true
      });
    }

    const allowedPackageIds = new Set((dependencies.packages || []).map((pkg) => pkg.id));
    for (const packageId of cascadePackageIds) {
      if (!allowedPackageIds.has(packageId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Selected package is not linked to this transaction.',
          packageId
        });
      }
    }

    const allowedRentalIds = new Set((dependencies.rentals || []).map((rental) => rental.id));
    for (const rentalId of cascadeRentals) {
      if (!allowedRentalIds.has(rentalId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Selected rental is not linked to this transaction.',
          rentalId
        });
      }
    }

    const cascadeResults = { packages: [], rentals: [] };

    if (cascadePackages.length > 0) {
      for (const packageEntry of cascadePackages) {
        const packageId = packageEntry.id;
        const packageStrategy = PACKAGE_CASCADE_STRATEGIES.has(packageEntry.strategy)
          ? packageEntry.strategy
          : DEFAULT_PACKAGE_STRATEGY;
        const usageSettlement = packageStrategy === 'charge-used'
          ? {
              mode: 'charge-used',
              allowNegative:
                packageEntry.allowNegative !== undefined
                  ? packageEntry.allowNegative
                  : true,
              requestedBy: actorId || null
            }
          : null;

        const result = await forceDeleteCustomerPackage({
          client,
          packageId,
          actorId,
          issueRefund: false,
          expectedCustomerId: transaction.user_id,
          includeWalletSummary: false,
          usageSettlement
        });
        cascadeResults.packages.push({
          ...result,
          packageId,
          strategy: packageStrategy
        });
      }
    }

    if (cascadeRentals.length > 0) {
      for (const rentalId of cascadeRentals) {
        const result = await forceDeleteRental({
          client,
          rentalId,
          actorId,
          issueRefund: false,
          expectedCustomerId: transaction.user_id,
          includeWalletSummary: false
        });
        cascadeResults.rentals.push(result);
      }
    }

    const originalAmount = Number.parseFloat(transaction.amount) || 0;
    const availableDelta = Number.parseFloat(transaction.available_delta) || originalAmount;
    const pendingDelta = Number.parseFloat(transaction.pending_delta) || 0;
    const nonWithdrawableDelta = Number.parseFloat(transaction.non_withdrawable_delta) || 0;

    const cancellationMetadata = {
      cancelledAt: new Date().toISOString(),
      cancelledBy: actorId,
      cancellationReason,
      cancellationOrigin: 'finances_transaction_delete'
    };

    await client.query(
      `UPDATE wallet_transactions
       SET status = 'cancelled',
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        JSON.stringify(cancellationMetadata)
      ]
    );

    transaction = {
      ...transaction,
      status: 'cancelled',
      metadata: {
        ...(transaction.metadata && typeof transaction.metadata === 'object' ? transaction.metadata : {}),
        ...cancellationMetadata
      }
    };

    // CRITICAL: hardDelete mode permanently deletes without creating reversal transactions
    // Use this to clean up corrupted wallet history (e.g., pay_later refund chains)
    if (hardDelete) {
      // Just delete the transaction record directly - no reversal, no balance adjustment
      await client.query('DELETE FROM wallet_transactions WHERE id = $1', [id]);
      
      // Resolve the currency from the transaction, falling back to user's preferred currency
      let txCurrency = transaction.currency;
      if (!txCurrency) {
        const userPrefRow = await client.query('SELECT preferred_currency FROM users WHERE id = $1', [transaction.user_id]);
        txCurrency = userPrefRow.rows[0]?.preferred_currency || 'EUR';
      }

      // Check if there are any remaining transactions for this user/currency
      const remainingTxns = await client.query(
        `SELECT COUNT(*) as count FROM wallet_transactions 
         WHERE user_id = $1 AND currency = $2 AND status != 'cancelled'`,
        [transaction.user_id, txCurrency]
      );
      
      const hasRemainingTransactions = parseInt(remainingTxns.rows[0]?.count || 0, 10) > 0;
      
      if (hasRemainingTransactions) {
        // Recalculate wallet balance from remaining transactions
        await client.query(
          `INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount, updated_at)
           SELECT 
             user_id,
             currency,
             COALESCE(SUM(available_delta), 0),
             COALESCE(SUM(pending_delta), 0),
             COALESCE(SUM(non_withdrawable_delta), 0),
             NOW()
           FROM wallet_transactions
           WHERE user_id = $1 AND currency = $2 AND status != 'cancelled'
           GROUP BY user_id, currency
           ON CONFLICT (user_id, currency) DO UPDATE SET
             available_amount = EXCLUDED.available_amount,
             pending_amount = EXCLUDED.pending_amount,
             non_withdrawable_amount = EXCLUDED.non_withdrawable_amount,
             updated_at = NOW()`,
          [transaction.user_id, txCurrency]
        );
      } else {
        // No remaining transactions - reset wallet balance to zero or delete the record
        await client.query(
          `UPDATE wallet_balances 
           SET available_amount = 0, pending_amount = 0, non_withdrawable_amount = 0, 
               last_transaction_at = NULL, updated_at = NOW()
           WHERE user_id = $1 AND currency = $2`,
          [transaction.user_id, txCurrency]
        );
        
        // Also update the legacy users.balance column
        await client.query(
          `UPDATE users SET balance = 0, updated_at = NOW() WHERE id = $1`,
          [transaction.user_id]
        );
        
        logger.info('All transactions deleted - wallet balance reset to zero', {
          userId: transaction.user_id,
          currency: transaction.currency || 'EUR'
        });
      }
      
      logger.info('Transaction hard-deleted (no reversal created)', {
        transactionId: id,
        userId: transaction.user_id,
        amount: originalAmount
      });
    } else if (Math.abs(availableDelta) > 0 || Math.abs(pendingDelta) > 0 || Math.abs(nonWithdrawableDelta) > 0) {
      // Truncate transaction type to avoid varchar(50) overflow from repeated reversals
      let reversalType = transaction.transaction_type;
      if (reversalType.includes('_reversal')) {
        // Already a reversal - just use 'transaction_reversal' to avoid infinite growth
        reversalType = 'transaction_reversal';
      } else {
        reversalType = `${reversalType}_reversal`;
      }
      // Ensure it fits in varchar(50)
      if (reversalType.length > 50) {
        reversalType = 'transaction_reversal';
      }
      
      await recordWalletTransaction({
        userId: transaction.user_id,
        amount: -originalAmount,
        availableDelta: -availableDelta,
        pendingDelta: -pendingDelta,
        nonWithdrawableDelta: -nonWithdrawableDelta,
        transactionType: reversalType,
        currency: transaction.currency || 'EUR',
        description: `Reversal for cancelled transaction ${transaction.id}`,
        metadata: {
          origin: 'finances_transaction_delete',
          reversedTransactionId: transaction.id,
          cancellationReason
        },
        relatedEntityType: transaction.related_entity_type || null,
        relatedEntityId: transaction.related_entity_id || null,
        createdBy: actorId,
        allowNegative: (-originalAmount) < 0,
        client
      });
    }

    await client.query('COMMIT');

    const { walletSummary } = await calculateUserBalance(transaction.user_id);

    return res.status(200).json({
      message: hardDelete ? 'Transaction permanently deleted (no reversal)' : 'Transaction deleted successfully',
      deletedTransaction: mapTransactionRow(transaction),
      hasDependencies,
      dependenciesHandled: hasDependencies && forceDelete,
      hardDeleted: hardDelete,
      wallet: walletSummary || null,
      cascadeResults: {
        packages: cascadeResults.packages.map((pkgResult) => ({
          packageId: pkgResult.packageId,
          strategy: pkgResult.strategy,
          package: pkgResult.package,
          cleanup: pkgResult.cleanup,
          refundDetails: pkgResult.refundDetails,
          usageSummary: pkgResult.usageSummary || null,
          settlementTransaction: pkgResult.usageSettlementTransaction
            ? mapWalletTransactionForResponse(pkgResult.usageSettlementTransaction)
            : null
        })),
        rentals: cascadeResults.rentals.map((rentalResult) => ({
          rental: rentalResult.rental,
          cleanup: rentalResult.cleanup,
          refundDetails: rentalResult.refundDetails
        }))
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');

    const isNegativeBalanceError =
      error?.message?.toLowerCase()?.includes('insufficient wallet balance') ||
      (error?.code === '23514' && /wallet available amount cannot be negative/i.test(error?.message || ''));

    if (isNegativeBalanceError) {
      const walletSummary = transaction
        ? await getWalletAccountSummary(transaction.user_id, transaction.currency || 'EUR')
        : null;

      const reversalDelta = transaction
        ? Number.parseFloat(transaction.available_delta) || Number.parseFloat(transaction.amount) || 0
        : 0;
      const attemptedDebit = reversalDelta < 0 ? Math.abs(reversalDelta) : 0;
      const availableBalance = typeof walletSummary?.available === 'number'
        ? walletSummary.available
        : Number(walletSummary?.available ?? 0);
      const shortage = attemptedDebit > 0 ? Math.max(0, attemptedDebit - availableBalance) : 0;

      return res.status(409).json({
        message: 'Cannot delete transaction because the wallet balance would become negative.',
        details: 'Top up the user\'s wallet or reverse later transactions before retrying.',
        transactionId: transaction?.id ?? null,
        attemptedDebit,
        availableBalance,
        shortage: shortage > 0 ? shortage : null,
        wallet: walletSummary
      });
    }

    logger.error('Error deleting transaction:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      transactionId: req.params.id
    });
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/finances/accounts/:id/add-funds
 * Add funds to user account
 * NOTE: All financial transactions are stored in EUR (base currency) for consistency.
 * The frontend displays amounts converted to user's preferred currency when needed.
 */
router.post('/accounts/:id/add-funds', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description = 'Funds added', payment_method, reference_number, currency } = req.body;

    const numericAmount = Number.parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Use the currency specified by admin, or fall back to user's preferred currency
    // This ensures funds go to the correct wallet row for multi-currency users
    let targetCurrency = currency;
    if (!targetCurrency) {
      const userRow = await pool.query('SELECT preferred_currency FROM users WHERE id = $1', [id]);
      targetCurrency = userRow.rows[0]?.preferred_currency || 'EUR';
    }

    const actorId = resolveActorId(req);

    const transactionRecord = await recordWalletTransaction({
      userId: id,
      amount: resolveWalletAmount('payment', numericAmount),
      transactionType: 'payment',
      currency: targetCurrency,
      description: description || 'Funds added',
      paymentMethod: payment_method || null,
      referenceNumber: reference_number || null,
      metadata: {
        origin: 'finances_add_funds',
        paymentMethod: payment_method || null,
        referenceNumber: reference_number || null,
        inputCurrency: currency || null // Track what admin entered for audit
      },
      createdBy: actorId || null
    });

    const { walletSummary } = await calculateUserBalance(id, targetCurrency);

    return res.status(200).json({
      message: 'Funds added successfully',
      transaction: mapTransactionRow(transactionRecord),
      wallet: walletSummary || null
    });
  } catch (error) {
    logger.error('Error adding funds:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/finances/accounts/:id/reset-balance
 * ADMIN ONLY: Reset wallet balance by deleting all transactions and setting to specified amount
 * Use this to fix corrupted wallet histories from pay_later refund chains
 */
router.post('/accounts/:id/reset-balance', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { targetBalance = 0, reason, currency = 'EUR' } = req.body;
    const actorId = resolveActorId(req);

    if (!reason) {
      return res.status(400).json({ message: 'Reason is required for audit trail' });
    }

    const numericTarget = Number.parseFloat(targetBalance);
    if (!Number.isFinite(numericTarget) || numericTarget < 0) {
      return res.status(400).json({ message: 'Target balance must be a non-negative number' });
    }

    // Verify user exists
    const userCheck = await client.query('SELECT id, name, email FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const user = userCheck.rows[0];

    await client.query('BEGIN');

    // Get current balance info before reset (across all currencies)
    const beforeBalance = await getWalletAccountSummary(id, currency);
    const allBalances = await client.query(
      'SELECT currency, available_amount FROM wallet_balances WHERE user_id = $1',
      [id]
    );

    // Count transactions being deleted (ALL currencies)
    const txCountResult = await client.query(
      'SELECT COUNT(*) as count FROM wallet_transactions WHERE user_id = $1',
      [id]
    );
    const deletedTransactionCount = parseInt(txCountResult.rows[0].count, 10);

    // Delete ALL wallet transactions for this user (all currencies)
    await client.query(
      'DELETE FROM wallet_transactions WHERE user_id = $1',
      [id]
    );

    // Reset ALL wallet balances to 0
    await client.query(
      `UPDATE wallet_balances
       SET available_amount = 0, pending_amount = 0, non_withdrawable_amount = 0, updated_at = NOW()
       WHERE user_id = $1`,
      [id]
    );
    // Ensure the target currency balance row exists
    await client.query(
      `INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount, updated_at)
       VALUES ($1, $2, 0, 0, 0, NOW())
       ON CONFLICT (user_id, currency) DO NOTHING`,
      [id, currency]
    );

    // If target balance > 0, create a single clean transaction for the correct amount
    let adjustmentTransaction = null;
    if (numericTarget > 0) {
      adjustmentTransaction = await recordWalletTransaction({
        userId: id,
        amount: numericTarget,
        transactionType: 'balance_adjustment',
        currency,
        description: `Balance reset by admin: ${reason}`,
        metadata: {
          origin: 'admin_balance_reset',
          reason,
          previousBalance: beforeBalance?.available || 0,
          deletedTransactions: deletedTransactionCount,
          resetBy: actorId
        },
        createdBy: actorId,
        client
      });
    }

    await client.query('COMMIT');

    // Log the reset for audit
    logger.warn('ADMIN: Wallet balance reset', {
      userId: id,
      userName: user.name,
      userEmail: user.email,
      previousBalance: beforeBalance?.available || 0,
      previousBalances: allBalances.rows.map(r => ({ currency: r.currency, amount: parseFloat(r.available_amount) })),
      newBalance: numericTarget,
      deletedTransactions: deletedTransactionCount,
      reason,
      resetBy: actorId
    });

    const afterBalance = await getWalletAccountSummary(id, currency);

    return res.status(200).json({
      message: 'Wallet balance reset successfully',
      user: { id: user.id, name: user.name, email: user.email },
      previousBalance: beforeBalance?.available || 0,
      newBalance: afterBalance?.available || 0,
      deletedTransactions: deletedTransactionCount,
      adjustmentTransaction: adjustmentTransaction ? mapTransactionRow(adjustmentTransaction) : null
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error resetting wallet balance:', error);
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
  try {
    const { id } = req.params;
    const { amount, description = 'Refund processed', booking_id, entity_type, currency } = req.body;

    const numericAmount = Number.parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Use the currency specified by admin, or fall back to user's preferred currency
    let targetCurrency = currency;
    if (!targetCurrency) {
      const userRow = await pool.query('SELECT preferred_currency FROM users WHERE id = $1', [id]);
      targetCurrency = userRow.rows[0]?.preferred_currency || 'EUR';
    }

    const actorId = resolveActorId(req);

    const transactionRecord = await recordWalletTransaction({
      userId: id,
      amount: resolveWalletAmount('refund', numericAmount),
      transactionType: 'refund',
      currency: targetCurrency,
      description: description || 'Refund processed',
      bookingId: booking_id || null,
      entityType: entity_type || null,
      metadata: {
        origin: 'finances_process_refund',
        bookingId: booking_id || null,
        entityType: entity_type || null,
        inputCurrency: currency || null
      },
      relatedEntityType: entity_type || null,
      relatedEntityId: booking_id || null,
      createdBy: actorId || null
    });

    const { walletSummary } = await calculateUserBalance(id, targetCurrency);

    return res.status(200).json({
      message: 'Refund processed successfully',
      transaction: mapTransactionRow(transactionRecord),
      wallet: walletSummary || null
    });
  } catch (error) {
    logger.error('Error processing refund:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/finances/accounts/:id/process-charge
 * Charge user account
 */
router.post('/accounts/:id/process-charge', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description = 'Account charged', booking_id, entity_type, currency } = req.body;

    const numericAmount = Number.parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Use the currency specified by admin, or fall back to user's preferred currency
    let targetCurrency = currency;
    if (!targetCurrency) {
      const userRow = await pool.query('SELECT preferred_currency FROM users WHERE id = $1', [id]);
      targetCurrency = userRow.rows[0]?.preferred_currency || 'EUR';
    }

    const actorId = resolveActorId(req);

    const transactionRecord = await recordWalletTransaction({
      userId: id,
      amount: resolveWalletAmount('charge', numericAmount),
      transactionType: 'charge',
      currency: targetCurrency,
      description: description || 'Account charged',
      bookingId: booking_id || null,
      entityType: entity_type || null,
      metadata: {
        origin: 'finances_process_charge',
        bookingId: booking_id || null,
        entityType: entity_type || null,
        inputCurrency: currency || null
      },
      relatedEntityType: entity_type || null,
      relatedEntityId: booking_id || null,
      createdBy: actorId || null,
      allowNegative: true
    });

    const { walletSummary } = await calculateUserBalance(id, targetCurrency);

    return res.status(200).json({
      message: 'Charge processed successfully',
      transaction: mapTransactionRow(transactionRecord),
      wallet: walletSummary || null
    });
  } catch (error) {
    logger.error('Error processing charge:', error);
    return res.status(500).json({ message: 'Internal server error' });
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

    const { balance, totalSpent, walletSummary } = await calculateUserBalance(id);

    return res.status(200).json({
      message: 'Balance recalculated successfully',
      old_balance: oldBalance,
      new_balance: balance,
      old_total_spent: oldTotalSpent,
      new_total_spent: totalSpent,
      balance_difference: balance - oldBalance,
      total_spent_difference: totalSpent - oldTotalSpent,
      wallet: walletSummary || null
    });
    
  } catch (error) {
  logger.error('Error syncing balance:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===========================================================================================
// DEBUG ENDPOINT (REMOVE IN PRODUCTION)
// ===========================================================================================

/**
 * DEBUG: Get user balance (admin only)
 */
router.get('/debug/accounts/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
  logger.debug(`🐛 DEBUG: Getting balance for user ${id}`);
    
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
    
    const account = userResult.rows[0];
    
    const result = {
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
    };
    
  logger.debug(`🐛 DEBUG: Returning data for ${account.name}:`, { balance, totalSpent });
    
    return res.status(200).json(result);
    
  } catch (error) {
  logger.error('Debug endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DEBUG: Get user transactions (admin only)
 */
router.get('/debug/transactions/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
  logger.debug(`🐛 DEBUG: Getting transactions for user ${id}`);
    
    const query = `
      SELECT 
        id,
        user_id,
  amount,
  transaction_type AS type,
        description,
        payment_method,
        reference_number,
        booking_id,
        rental_id,
  entity_type,
        related_entity_type,
        related_entity_id,
        status,
        currency,
        direction,
        created_by,
        created_at,
        updated_at,
        metadata
      FROM wallet_transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const result = await pool.query(query, [id]);
    
  logger.debug(`🐛 DEBUG: Found ${result.rows.length} transactions`);
    
    return res.status(200).json(result.rows);
    
  } catch (error) {
  logger.error('Debug transactions endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to check current user authentication
router.get('/debug/current-user', authenticateJWT, (req, res) => {
  logger.debug('🔍 Debug: Current user check');
  logger.debug('User object:', req.user);
  
  res.json({
    authenticated: !!req.user,
    user: req.user ? {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      twoFactorVerified: req.user.twoFactorVerified
    } : null,
    canDeleteTransactions: req.user && ['admin', 'manager'].includes(req.user.role),
    timestamp: new Date().toISOString()
  });
});

/**
 * @route POST /api/finances/bulk-statistics
 * @desc Get financial statistics for multiple users at once (BLAZING FAST bulk operation)
 * @access Private
 */
router.post('/bulk-statistics', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const startTime = performance.now();
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    if (userIds.length > 1000) { // Increased limit for better bulk performance
      return res.status(400).json({ error: 'Maximum 1000 users per bulk request' });
    }
    
    // Create placeholders for the IN clause
    const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
    
    // OPTIMIZED QUERY that calculates balance from transactions (like calculateUserBalance function)
    const query = `
      SELECT 
        u.id as user_id,
        u.name,
        u.email,
        COALESCE(
          (SELECT SUM(CASE WHEN wt.status <> 'cancelled' THEN wt.amount ELSE 0 END)
             FROM wallet_transactions wt 
            WHERE wt.user_id = u.id), 
          0
        ) as balance,
        COUNT(DISTINCT b.id) as total_bookings,
        COALESCE(SUM(CASE WHEN b.status = 'completed' THEN COALESCE(b.final_amount, b.amount, 0) ELSE 0 END), 0) as total_spent,
        COALESCE(MAX(b.date), null) as last_booking_date,
        COALESCE(
          (SELECT s.name 
           FROM bookings b2 
           JOIN services s ON b2.service_id = s.id 
           WHERE b2.student_user_id = u.id 
           ORDER BY b2.date DESC, b2.created_at DESC
           LIMIT 1), 
          'N/A'
        ) as last_used_service
      FROM users u
      LEFT JOIN bookings b ON u.id = b.student_user_id AND b.deleted_at IS NULL
      WHERE u.id IN (${placeholders})
      GROUP BY u.id, u.name, u.email
      ORDER BY u.name`;
    
    const result = await pool.query(query, userIds);
  const _queryTime = performance.now() - startTime; // eslint-disable-line no-unused-vars
    
    // ULTRA-FAST response formatting
    const statisticsMap = {};
    result.rows.forEach(row => {
      statisticsMap[row.user_id] = {
        balance: parseFloat(row.balance) || 0,
        totalBookings: parseInt(row.total_bookings) || 0,
        totalSpent: parseFloat(row.total_spent) || 0,
        lastBookingDate: row.last_booking_date,
        last_used_service: row.last_used_service
      };
    });
    
    // Ensure all requested users have an entry, even if no data found
    userIds.forEach(userId => {
      if (!statisticsMap[userId]) {
        statisticsMap[userId] = {
          balance: 0,
          totalBookings: 0,
          totalSpent: 0,
          lastBookingDate: null,
          last_used_service: 'N/A'
        };
      }
    });
    
    const totalTime = performance.now() - startTime;
    
    res.json({
      success: true,
      data: statisticsMap,
      count: userIds.length,
      processingTime: `${totalTime.toFixed(2)}ms`
    });
  } catch (error) {
  logger.error('❌ Error fetching bulk financial statistics:', error);
    res.status(500).json({ error: 'Failed to fetch bulk financial statistics' });
  }
});

/**
 * @route POST /api/finances/bulk-bookings
 * @desc Get bookings for multiple users at once (BLAZING FAST bulk operation)
 * @access Private
 */
router.post('/bulk-bookings', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const startTime = performance.now();
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    if (userIds.length > 1000) { // Increased limit for better bulk performance
      return res.status(400).json({ error: 'Maximum 1000 users per bulk request' });
    }
    
    // Create placeholders for the IN clause
    const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
    
    // OPTIMIZED QUERY with correct column names
    const query = `
      SELECT 
        b.id,
        b.student_user_id,
        b.instructor_user_id,
        b.service_id,
        b.date,
        b.start_hour,
        b.duration,
        b.status,
        b.payment_status,
        b.amount,
        b.final_amount,
        b.created_at,
        b.updated_at,
        COALESCE(s.name, 'Unknown Service') as service_name,
        COALESCE(u.name, 'Unknown Instructor') as instructor_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN users u ON b.instructor_user_id = u.id
      WHERE b.student_user_id IN (${placeholders})
      ORDER BY b.student_user_id, b.date DESC, b.start_hour DESC`;
    
    const result = await pool.query(query, userIds);
  const _queryTime = performance.now() - startTime; // eslint-disable-line no-unused-vars
    
    // ULTRA-FAST grouping by user ID
    const bookingsMap = {};
    userIds.forEach(userId => {
      bookingsMap[userId] = [];
    });
    
    result.rows.forEach(booking => {
      const userId = booking.student_user_id;
      if (bookingsMap[userId]) {
        bookingsMap[userId].push(booking);
      }
    });
    
    const totalTime = performance.now() - startTime;
    
    res.json({
      success: true,
      data: bookingsMap,
      count: userIds.length,
      totalBookings: result.rows.length,
      processingTime: `${totalTime.toFixed(2)}ms`
    });
  } catch (error) {
  logger.error('❌ Error fetching bulk bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bulk bookings' });
  }
});

// Test route to check if finances routes are working
router.get('/test-no-auth', authenticateJWT, authorizeRoles(['admin']), (req, res) => {
  logger.info('🔧 Test route hit successfully');
  res.json({ message: 'Finances routes are working!', timestamp: new Date().toISOString() });
});

// Test route to check if auth is working
router.get('/test', authenticateJWT, (req, res) => {
  logger.info('🔧 Authenticated test route hit successfully');
  res.json({ 
    message: 'Finances routes with auth are working!', 
    user: req.user?.id, 
    timestamp: new Date().toISOString() 
  });
});

/**
 * GET /api/finances/instructor-balances
 * Get earnings & payment summaries for all instructors (bulk)
 */
router.get('/instructor-balances',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res) => {
  try {
    const balances = await getAllInstructorBalances();
    res.json(balances);
  } catch (error) {
    logger.error('Error fetching instructor balances:', error);
    res.status(500).json({ error: 'Failed to fetch instructor balances' });
  }
});

/**
 * GET /api/finances/instructor-earnings/:instructorId
 * Get instructor earnings, commission data and payment history
 */
router.get('/instructor-earnings/:instructorId', 
  authenticateJWT, 
  authorizeRoles(['admin', 'manager', 'instructor']), 
  async (req, res) => {
  
  logger.debug('[DEBUG] 🚀 INSTRUCTOR EARNINGS ENDPOINT HIT!');
  logger.debug('[DEBUG] Request params:', JSON.stringify(req.params));
  logger.debug('[DEBUG] Request user:', req.user?.id, 'role:', req.user?.role);
  
  try {
    const instructorId = req.params.instructorId;
    const { startDate, endDate } = req.query;
    
  logger.debug('[DEBUG] Date filters:', { startDate, endDate });
    
    const { earnings, totals } = await getInstructorEarningsData(instructorId, { startDate, endDate });
    const payrollHistory = await getInstructorPayrollHistory(instructorId);

    const responseData = {
      earnings,
      payrollHistory,
      totalEarnings: totals.totalEarnings,
      totalLessons: totals.totalLessons,
      totalHours: totals.totalHours,
    };

  logger.debug('[DEBUG] Normalized sample:', earnings[0]);
  logger.debug('[DEBUG] Sending response:', responseData);

    res.json(responseData);
    
  } catch (error) {
    logger.debug('[DEBUG] ❌ CATCH BLOCK: Error occurred:', error.message);
    logger.error('❌ Error in instructor earnings endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch instructor earnings' });
  }
});

/**
 * POST /api/finances/instructor-payments
 * Record a new instructor payment or deduction
 */
router.post('/instructor-payments', 
  authenticateJWT, 
  authorizeRoles(['admin', 'manager']), 
  async (req, res) => {
  
  try {
    const {
      instructor_id,
      amount,
      description,
      payment_date,
      payment_method = 'cash',
      type
    } = req.body;

  logger.debug('[DEBUG] Recording instructor payment:', { instructor_id, amount, description, payment_date, type });

    // Validate required fields
    if (!instructor_id || !amount || !description || !payment_date) {
      return res.status(400).json({ 
        error: 'Missing required fields: instructor_id, amount, description, payment_date' 
      });
    }

    // Determine transaction type based on amount
    const transactionType = amount < 0 ? 'deduction' : 'payment';
    const transactionAmount = parseFloat(amount);

    // Create transaction record
    const actorId = resolveActorId(req);
    const paymentDate = payment_date ? new Date(payment_date) : new Date();
    const referenceNumber = `INST_${Date.now()}`;
    const transactionRecord = await recordLegacyTransaction({
      userId: instructor_id,
      amount: transactionAmount,
      transactionType,
      status: 'completed',
      direction: transactionAmount >= 0 ? 'credit' : 'debit',
      description,
      paymentMethod: payment_method || null,
      referenceNumber,
      metadata: {
        source: 'finances:instructor-payments:create',
        requestedType: type || null,
        paymentDate: paymentDate.toISOString(),
        referenceNumber
      },
      entityType: 'instructor_payment',
      relatedEntityType: 'instructor',
      relatedEntityId: instructor_id,
      createdBy: actorId || null
    });

    const mapped = mapTransactionRow(transactionRecord);

    logger.debug('[DEBUG] Instructor wallet transaction created:', mapped);

    res.json({
      success: true,
      transaction: mapped,
      message: `Instructor ${transactionType} recorded successfully`
    });

  } catch (error) {
  logger.error('Error recording instructor payment:', error);
    res.status(500).json({ error: 'Failed to record instructor payment' });
  }
});

/**
 * PUT /api/finances/instructor-payments/:id
 * Update an existing instructor payment
 */
router.put('/instructor-payments/:id', 
  authenticateJWT, 
  authorizeRoles(['admin', 'manager']), 
  async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      amount,
      description,
      payment_date,
      payment_method = 'cash'
    } = req.body;

    logger.debug('[DEBUG] Updating instructor payment:', { id, amount, description, payment_date });

    if (!amount || !description || !payment_date) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, description, payment_date' 
      });
    }

    const transaction = await getWalletTransactionById(id);

    if (!transaction) {
      return res.status(404).json({ error: 'Instructor payment not found in wallet ledger' });
    }

    if (!['payment', 'deduction'].includes(transaction.transaction_type)) {
      return res.status(400).json({ error: 'Only instructor payment transactions can be updated with this endpoint.' });
    }

    const actorId = resolveActorId(req) || null;
    const paymentDate = payment_date ? new Date(payment_date) : new Date();
    const newAmount = parseFloat(amount);
    const transactionType = newAmount < 0 ? 'deduction' : 'payment';

    await client.query('BEGIN');

    const originalAmount = Number.parseFloat(transaction.amount) || 0;
    const availableDelta = Number.parseFloat(transaction.available_delta) || originalAmount;
    const pendingDelta = Number.parseFloat(transaction.pending_delta) || 0;
    const nonWithdrawableDelta = Number.parseFloat(transaction.non_withdrawable_delta) || 0;

    const cancellationMetadata = {
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
      updateOrigin: 'finances:instructor-payments:update',
      replacedByTransactionType: transactionType,
      replacedAt: paymentDate.toISOString()
    };

    await client.query(
      `UPDATE wallet_transactions
         SET status = 'cancelled',
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(cancellationMetadata)]
    );

    if (Math.abs(availableDelta) > 0 || Math.abs(pendingDelta) > 0 || Math.abs(nonWithdrawableDelta) > 0) {
      await recordWalletTransaction({
        userId: transaction.user_id,
        amount: -originalAmount,
        availableDelta: -availableDelta,
        pendingDelta: -pendingDelta,
        nonWithdrawableDelta: -nonWithdrawableDelta,
        transactionType: `${transaction.transaction_type}_reversal`,
        currency: transaction.currency || 'EUR',
        description: `Reversal for instructor payment ${transaction.id}`,
        metadata: {
          origin: 'finances:instructor-payments:update:reversal',
          reversedTransactionId: transaction.id
        },
        relatedEntityType: transaction.related_entity_type || 'instructor_payment',
        relatedEntityId: transaction.related_entity_id || transaction.id,
        createdBy: actorId,
        allowNegative: (-originalAmount) < 0,
        client
      });
    }

    const updatedTransaction = await recordLegacyTransaction({
      userId: transaction.user_id,
      amount: newAmount,
      transactionType,
      status: 'completed',
      direction: newAmount >= 0 ? 'credit' : 'debit',
      description,
      paymentMethod: payment_method || null,
      referenceNumber: transaction.reference_number || `INST_${Date.now()}`,
      metadata: {
        source: 'finances:instructor-payments:update',
        replacesTransactionId: transaction.id,
        paymentDate: paymentDate.toISOString(),
        previousAmount: originalAmount,
        requestedType: transactionType
      },
      entityType: 'instructor_payment',
      relatedEntityType: 'instructor',
      relatedEntityId: transaction.user_id,
      createdBy: actorId,
      client
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      transaction: mapTransactionRow(updatedTransaction),
      replacedTransactionId: transaction.id,
      message: 'Instructor payment updated successfully'
    });

  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Failed to rollback instructor payment update:', rollbackError);
    }
    logger.error('Error updating instructor payment:', error);
    res.status(500).json({ error: 'Failed to update instructor payment' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/finances/instructor-payments/:id
 * Delete an instructor payment
 */
router.delete('/instructor-payments/:id', 
  authenticateJWT, 
  authorizeRoles(['admin', 'manager']), 
  async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    logger.debug('[DEBUG] Deleting instructor payment:', { id });

    await client.query('BEGIN');

    const transaction = await getWalletTransactionById(id);

    if (!transaction) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Instructor payment not found in wallet ledger' });
    }

    if (!['payment', 'deduction'].includes(transaction.transaction_type)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only instructor payment transactions can be deleted with this endpoint.' });
    }

    const actorId = resolveActorId(req) || null;
    const originalAmount = Number.parseFloat(transaction.amount) || 0;
    const availableDelta = Number.parseFloat(transaction.available_delta) || originalAmount;
    const pendingDelta = Number.parseFloat(transaction.pending_delta) || 0;
    const nonWithdrawableDelta = Number.parseFloat(transaction.non_withdrawable_delta) || 0;

    const cancellationMetadata = {
      cancelledAt: new Date().toISOString(),
      cancelledBy: actorId,
      cancellationOrigin: 'finances:instructor-payments:delete'
    };

    await client.query(
      `UPDATE wallet_transactions
         SET status = 'cancelled',
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(cancellationMetadata)]
    );

    if (Math.abs(availableDelta) > 0 || Math.abs(pendingDelta) > 0 || Math.abs(nonWithdrawableDelta) > 0) {
      await recordWalletTransaction({
        userId: transaction.user_id,
        amount: -originalAmount,
        availableDelta: -availableDelta,
        pendingDelta: -pendingDelta,
        nonWithdrawableDelta: -nonWithdrawableDelta,
        transactionType: `${transaction.transaction_type}_reversal`,
        currency: transaction.currency || 'EUR',
        description: `Reversal for instructor payment ${transaction.id}`,
        metadata: {
          origin: 'finances:instructor-payments:delete:reversal',
          reversedTransactionId: transaction.id
        },
        relatedEntityType: transaction.related_entity_type || 'instructor_payment',
        relatedEntityId: transaction.related_entity_id || transaction.id,
        createdBy: actorId,
        allowNegative: (-originalAmount) < 0,
        client
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Instructor payment deleted successfully'
    });

  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Failed to rollback instructor payment deletion:', rollbackError);
    }
    logger.error('Error deleting instructor payment:', error);
    res.status(500).json({ error: 'Failed to delete instructor payment' });
  } finally {
    client.release();
  }
});

// Add catch-all middleware for debugging
router.use('/transactions/:id', (req, res, next) => {
  logger.warn('🚨 Transaction route hit', {
    method: req.method,
    id: req.params.id,
    url: req.originalUrl,
    hasAuthHeader: !!req.headers.authorization
  });
  next();
});

// ===========================================================================================
// COMPREHENSIVE FINANCE DASHBOARD ENDPOINTS
// ===========================================================================================

/**
 * GET /api/finances/summary
 * Get comprehensive financial summary with analytics
 */
router.get('/summary', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
  const { startDate, endDate, serviceType, mode = 'accrual' } = req.query;
    
    // Use parameterized queries for better security and proper type handling
    const dateStart = startDate || '1900-01-01';
    const dateEnd = endDate || '2100-01-01';
    
    // Revenue analytics by category (standardized types)
    const { PAYMENT_TYPES, REFUND_TYPES, EXCLUDED_REVENUE_TYPES } = await import('../constants/transactions.js');

    // Build net revenue query params (needed before Promise.all)
    const paramsAccrual = [dateStart, dateEnd];
    let accrualExtra = '';
    if (serviceType && serviceType !== 'all') {
      paramsAccrual.push(serviceType);
      accrualExtra = ` AND service_type = $${paramsAccrual.length}`;
    }

    // ── Run ALL independent queries in parallel ──────────────────
    const [
      walletResult,
      rentalResult,
      netRevenue,
      balancesResult,
      bookingsResult,
      commissionResult,
      walletChargesResult,
      membershipResult,
      packageResult,
      shopResult,
    ] = await Promise.all([

      // 1. Wallet revenue & refunds
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN transaction_type = ANY($3) THEN amount ELSE 0 END), 0) AS total_revenue,
          COALESCE(SUM(CASE WHEN transaction_type = ANY($4) THEN amount ELSE 0 END), 0) AS total_refunds,
          COUNT(*) AS total_transactions
        FROM wallet_transactions
        WHERE transaction_date >= $1::date AND transaction_date <= $2::date
          AND status = 'completed'
          AND NOT (transaction_type = ANY($5))
      `, [dateStart, dateEnd, PAYMENT_TYPES, REFUND_TYPES, EXCLUDED_REVENUE_TYPES]),

      // 2. Rental revenue
      pool.query(`
        SELECT COALESCE(SUM(total_price), 0) AS rental_revenue,
          COUNT(*) AS rental_count
        FROM rentals
        WHERE (
          (rental_date IS NOT NULL AND rental_date >= $1::date AND rental_date <= $2::date)
          OR (
            rental_date IS NULL AND (
              (start_date >= $1::date AND start_date <= $2::date) OR
              (end_date   >= $1::date AND end_date   <= $2::date) OR
              (start_date <  $1::date AND end_date   >  $2::date)
            )
          )
        )
        AND status IN ('completed','returned','closed','active')
      `, [dateStart, dateEnd]),

      // 3. Net revenue (accrual or cash)
      (mode === 'cash')
        ? computeCashNetRevenue({ dateStart, dateEnd, serviceType })
        : pool.query(`
            SELECT
              COALESCE(SUM(gross_amount), 0)               AS gross_total,
              COALESCE(SUM(commission_amount), 0)          AS commission_total,
              COALESCE(SUM(tax_amount), 0)                 AS tax_total,
              COALESCE(SUM(insurance_amount), 0)           AS insurance_total,
              COALESCE(SUM(equipment_amount), 0)           AS equipment_total,
              COALESCE(SUM(payment_fee_amount), 0)         AS payment_fee_total,
              COALESCE(SUM(net_amount), 0)                 AS net_total,
              COUNT(*)                                     AS items_count
            FROM revenue_items
            WHERE fulfillment_date >= $1::date AND fulfillment_date <= $2::date${accrualExtra}
          `, paramsAccrual).then(r => r.rows[0]),

      // 4. Outstanding balances
      pool.query(`
        WITH customer_wallets AS (
          SELECT
            u.id AS user_id,
            COALESCE(SUM(wb.available_amount), 0) AS balance
          FROM users u
          LEFT JOIN wallet_balances wb ON wb.user_id = u.id
          WHERE u.role_id IN (SELECT id FROM roles WHERE name IN ('student', 'outsider'))
            AND u.deleted_at IS NULL
          GROUP BY u.id
        )
        SELECT
          COUNT(*) FILTER (WHERE balance > 0) AS customers_with_credit,
          COUNT(*) FILTER (WHERE balance < 0) AS customers_with_debt,
          COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS total_customer_credit,
          COALESCE(SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END), 0) AS total_customer_debt,
          COALESCE(AVG(balance), 0) AS average_balance
        FROM customer_wallets
      `),

      // 5. Booking analytics
      pool.query(`
        WITH normalized AS (
          SELECT
            b.id,
            regexp_replace(lower(trim(b.status)), '[^a-z0-9]+', '_', 'g') AS normalized_status,
            regexp_replace(lower(trim(b.payment_status)), '[^a-z0-9]+', '_', 'g') AS normalized_payment_status,
            COALESCE(
              NULLIF(b.final_amount, 0),
              NULLIF(b.amount, 0),
              COALESCE(inst.hourly_rate, 0) * COALESCE(b.duration, 0),
              0
            ) AS revenue_amount
          FROM bookings b
          LEFT JOIN users inst ON inst.id = b.instructor_user_id
          WHERE b.created_at >= $1::date
            AND b.created_at < ($2::date + interval '1 day')
            AND b.deleted_at IS NULL
        )
        SELECT
          COUNT(*) FILTER (WHERE NOT (normalized_status = ANY($3::text[]))) AS total_bookings,
          COUNT(*) FILTER (WHERE normalized_status = ANY($4::text[])) AS completed_bookings,
          COUNT(*) FILTER (WHERE normalized_status = ANY($5::text[])) AS cancelled_bookings,
          COUNT(*) FILTER (WHERE normalized_payment_status = 'paid' AND NOT (normalized_status = ANY($3::text[]))) AS paid_bookings,
          COUNT(*) FILTER (WHERE normalized_payment_status = 'unpaid' AND NOT (normalized_status = ANY($3::text[]))) AS unpaid_bookings,
          COALESCE(SUM(CASE WHEN normalized_status = ANY($4::text[]) THEN revenue_amount ELSE 0 END), 0) AS booking_revenue
        FROM normalized
      `, [dateStart, dateEnd, LEDGER_NEGATIVE_STATUSES, LEDGER_COMPLETED_BOOKING_STATUSES, ['cancelled', 'canceled']]),

      // 6. Instructor commission
      pool.query(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN b.customer_package_id IS NOT NULL AND COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type) = 'fixed' THEN
                COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) * b.duration
              WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 THEN
                ((cp.purchase_price / cp.total_hours) * b.duration) *
                COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
              WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0 THEN
                (cp.purchase_price / sp.sessions_count) *
                COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
              WHEN bcc.commission_type = 'fixed' THEN
                COALESCE(bcc.commission_value, 0) * b.duration
              WHEN isc.commission_type = 'fixed' THEN
                COALESCE(isc.commission_value, 0) * b.duration
              WHEN idc.commission_type = 'fixed' THEN
                COALESCE(idc.commission_value, 0) * b.duration
              WHEN bcc.commission_type = 'percentage' THEN
                COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(bcc.commission_value, 50) / 100
              WHEN isc.commission_type = 'percentage' THEN
                COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(isc.commission_value, 50) / 100
              WHEN idc.commission_type = 'percentage' THEN
                COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(idc.commission_value, 50) / 100
              ELSE
                COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * 0.50
            END
          ), 0) AS total_commission
        FROM bookings b
        LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
        LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
        LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
        LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
        LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
        WHERE b.created_at >= $1::date AND b.created_at < ($2::date + interval '1 day')
          AND b.deleted_at IS NULL
          AND regexp_replace(lower(trim(b.status)), '[^a-z0-9]+', '_', 'g') = ANY($3::text[])
      `, [dateStart, dateEnd, LEDGER_COMPLETED_BOOKING_STATUSES]),

      // 7. Wallet charges (booking_charge, rental_charge, accommodation_charge)
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN transaction_type = 'booking_charge' THEN ABS(amount) ELSE 0 END), 0) AS lesson_charges,
          COALESCE(SUM(CASE WHEN transaction_type = 'rental_charge' THEN ABS(amount) ELSE 0 END), 0) AS rental_charges,
          COALESCE(SUM(CASE WHEN transaction_type = 'accommodation_charge' THEN ABS(amount) ELSE 0 END), 0) AS accommodation_charges
        FROM wallet_transactions
        WHERE transaction_date >= $1::date AND transaction_date <= $2::date
          AND status = 'completed'
      `, [dateStart, dateEnd]),

      // 8. Membership revenue
      pool.query(`
        SELECT COALESCE(SUM(offering_price), 0) AS membership_revenue,
          COUNT(*) AS membership_count
        FROM member_purchases
        WHERE purchased_at >= $1::date AND purchased_at <= $2::date
          AND payment_status = 'completed'
      `, [dateStart, dateEnd]),

      // 9. Package revenue
      pool.query(`
        SELECT COALESCE(SUM(purchase_price), 0) AS package_revenue
        FROM customer_packages
        WHERE purchase_date >= $1::date AND purchase_date <= $2::date
          AND status IN ('active', 'completed', 'expired')
      `, [dateStart, dateEnd]),

      // 10. Shop revenue
      pool.query(`
        SELECT COALESCE(SUM(ABS(amount)), 0) AS shop_revenue,
          COUNT(*) AS shop_order_count
        FROM wallet_transactions
        WHERE transaction_date >= $1::date AND transaction_date <= $2::date
          AND status = 'completed'
          AND (
            transaction_type IN ('product_purchase', 'shop_purchase', 'merchandise_purchase')
            OR (transaction_type = 'charge' AND description ILIKE '%product%')
            OR (transaction_type = 'charge' AND description ILIKE '%shop%')
            OR (transaction_type = 'payment' AND description ILIKE '%shop order%')
            OR (related_entity_type = 'shop_order')
          )
      `, [dateStart, dateEnd]),
    ]);

    // ── Extract values from parallel results ─────────────────────
    const lessonRevenue = parseFloat(bookingsResult.rows[0]?.booking_revenue) || 0;
    const rentalRevenue = parseFloat(rentalResult.rows[0].rental_revenue) || 0;
    const rentalCount = parseInt(rentalResult.rows[0].rental_count) || 0;
    const instructorCommission = parseFloat(commissionResult.rows[0]?.total_commission) || 0;
    const walletLessonCharges = parseFloat(walletChargesResult.rows[0]?.lesson_charges) || 0;
    const walletRentalCharges = parseFloat(walletChargesResult.rows[0]?.rental_charges) || 0;
    const walletAccommodationCharges = parseFloat(walletChargesResult.rows[0]?.accommodation_charges) || 0;
    const membershipRevenue = parseFloat(membershipResult.rows[0]?.membership_revenue) || 0;
    const membershipCount = parseInt(membershipResult.rows[0]?.membership_count) || 0;
    const packageRevenue = parseFloat(packageResult.rows[0]?.package_revenue) || 0;
    const totalMembershipRevenue = membershipRevenue + packageRevenue;
    const shopRevenue = parseFloat(shopResult.rows[0]?.shop_revenue) || 0;
    const shopOrderCount = parseInt(shopResult.rows[0]?.shop_order_count) || 0;

    // Use the higher of: booking table revenue OR wallet charges for lessons
    // This handles cases where bookings may be paid via package (no wallet charge) or cash (wallet charge)
    const effectiveLessonRevenue = Math.max(lessonRevenue, walletLessonCharges);
    
    // For rentals, use rentals table as primary source, wallet charges as fallback
    const effectiveRentalRevenue = Math.max(rentalRevenue, walletRentalCharges);
    
    // Other revenue: accommodation charges (not wallet deposits, which are just customer funds)
    const otherRevenue = walletAccommodationCharges;
    
    // Total revenue = actual services consumed, not wallet deposits
    const totalRevenue = effectiveLessonRevenue + effectiveRentalRevenue + otherRevenue + totalMembershipRevenue + shopRevenue;

    const revenueResult = {
      rows: [{
        total_revenue: totalRevenue,
        lesson_revenue: effectiveLessonRevenue,
        rental_revenue: effectiveRentalRevenue,
        membership_revenue: totalMembershipRevenue,
        vip_membership_revenue: membershipRevenue,
        package_revenue: packageRevenue,
        shop_revenue: shopRevenue,
        other_revenue: otherRevenue,
        other_revenue_breakdown: {
          accommodation_charges: walletAccommodationCharges,
          // Keep for debugging - show what was in wallet vs what was consumed
          wallet_lesson_charges: walletLessonCharges,
          wallet_rental_charges: walletRentalCharges,
          booking_table_revenue: lessonRevenue,
          rentals_table_revenue: rentalRevenue
        },
        total_refunds: walletResult.rows[0].total_refunds,
        total_transactions: walletResult.rows[0].total_transactions,
        rental_count: rentalCount,
        shop_order_count: shopOrderCount,
        membership_count: membershipCount
      }]
    };

    let serviceLedger = null;
    try {
      await syncServiceRevenueLedger({ dateStart, dateEnd, truncate: false });
      serviceLedger = await getServiceLedgerTotals({ dateStart, dateEnd });
    } catch (ledgerError) {
      logger.warn('Failed to compute service revenue ledger summary', {
        error: ledgerError?.message,
        dateStart,
        dateEnd
      });
    }

    // Apply service type filtering to response
    const finalRevenue = { ...revenueResult.rows[0] };
    if (serviceType && serviceType !== 'all') {
      switch (serviceType) {
        case 'lessons':
          // Only show lesson revenue
          finalRevenue.total_revenue = finalRevenue.lesson_revenue;
          finalRevenue.rental_revenue = 0;
          finalRevenue.membership_revenue = 0;
          finalRevenue.vip_membership_revenue = 0;
          finalRevenue.package_revenue = 0;
          finalRevenue.shop_revenue = 0;
          finalRevenue.other_revenue = 0;
          break;
        case 'rentals':
          // Only show rental revenue
          finalRevenue.total_revenue = finalRevenue.rental_revenue;
          finalRevenue.lesson_revenue = 0;
          finalRevenue.membership_revenue = 0;
          finalRevenue.vip_membership_revenue = 0;
          finalRevenue.package_revenue = 0;
          finalRevenue.shop_revenue = 0;
          finalRevenue.other_revenue = 0;
          break;
        case 'membership':
          // Show only membership revenue (not lesson packages)
          finalRevenue.total_revenue = finalRevenue.vip_membership_revenue;
          finalRevenue.membership_revenue = finalRevenue.vip_membership_revenue;
          finalRevenue.package_revenue = 0;
          finalRevenue.lesson_revenue = 0;
          finalRevenue.rental_revenue = 0;
          finalRevenue.shop_revenue = 0;
          finalRevenue.other_revenue = 0;
          break;
        case 'shop':
          // Only show shop revenue
          finalRevenue.total_revenue = finalRevenue.shop_revenue;
          finalRevenue.lesson_revenue = 0;
          finalRevenue.rental_revenue = 0;
          finalRevenue.membership_revenue = 0;
          finalRevenue.vip_membership_revenue = 0;
          finalRevenue.package_revenue = 0;
          finalRevenue.other_revenue = 0;
          break;
        case 'accommodation':
          // Only show accommodation revenue (stored in other_revenue from wallet accommodation_charges)
          finalRevenue.total_revenue = finalRevenue.other_revenue;
          finalRevenue.lesson_revenue = 0;
          finalRevenue.rental_revenue = 0;
          finalRevenue.membership_revenue = 0;
          finalRevenue.vip_membership_revenue = 0;
          finalRevenue.package_revenue = 0;
          finalRevenue.shop_revenue = 0;
          break;
        case 'events':
          // Events revenue is tracked separately via events table, zero out wallet-based revenue
          finalRevenue.total_revenue = 0;
          finalRevenue.lesson_revenue = 0;
          finalRevenue.rental_revenue = 0;
          finalRevenue.membership_revenue = 0;
          finalRevenue.vip_membership_revenue = 0;
          finalRevenue.package_revenue = 0;
          finalRevenue.shop_revenue = 0;
          finalRevenue.other_revenue = 0;
          break;
      }
    }

    // Override commission_total with calculated instructor commission
    // The revenue_items table may be empty, but we can calculate from bookings
    const finalNetRevenue = {
      ...netRevenue,
      commission_total: instructorCommission || parseFloat(netRevenue?.commission_total) || 0,
      instructor_commission: instructorCommission
    };

    res.json({
      success: true,
      dateRange: { startDate, endDate },
      serviceType: serviceType || 'all',
      revenue: finalRevenue,
      netRevenue: finalNetRevenue,
      balances: balancesResult.rows[0],
      bookings: bookingsResult.rows[0],
      serviceLedger,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
  logger.error('Error fetching financial summary:', error);
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
});

/**
 * GET /api/finances/lesson-breakdown
 * Get lesson service popularity and instructor performance data for charts
 */
router.get('/lesson-breakdown', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateStart = startDate || '1900-01-01';
    const dateEnd = endDate || '2100-01-01';

    // Service popularity: group bookings by service
    // For package bookings (amount=0), attribute proportional revenue from the package purchase price
    const serviceQuery = `
      SELECT 
        s.id AS service_id,
        s.name AS service_name,
        COUNT(b.id) AS booking_count,
        COALESCE(SUM(
          CASE 
            WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 
              THEN (cp.purchase_price / cp.total_hours) * b.duration
            WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0
              THEN cp.purchase_price / sp.sessions_count
            ELSE COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0)
          END
        ), 0) AS total_revenue,
        COALESCE(AVG(
          CASE 
            WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 
              THEN (cp.purchase_price / cp.total_hours) * b.duration
            WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0
              THEN cp.purchase_price / sp.sessions_count
            ELSE COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0)
          END
        ), 0) AS avg_price
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
      WHERE b.created_at >= $1::date AND b.created_at < ($2::date + interval '1 day')
        AND b.deleted_at IS NULL
      GROUP BY s.id, s.name
      ORDER BY booking_count DESC
      LIMIT 20
    `;
    const serviceResult = await pool.query(serviceQuery, [dateStart, dateEnd]);

    // Instructor performance: group bookings by instructor
    // Commission logic matches /finances/summary for consistency
    const instructorQuery = `
      SELECT 
        u.id AS instructor_id,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) AS instructor_name,
        COUNT(b.id) AS booking_count,
        COALESCE(SUM(b.duration), 0) AS total_hours,
        COALESCE(SUM(
          CASE 
            WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 
              THEN (cp.purchase_price / cp.total_hours) * b.duration
            WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0
              THEN cp.purchase_price / sp.sessions_count
            ELSE COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0)
          END
        ), 0) AS total_revenue,
        COALESCE(SUM(
          CASE 
            -- Package bookings with fixed hourly rate commission
            WHEN b.customer_package_id IS NOT NULL AND COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type) = 'fixed' THEN
              COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) * b.duration
            -- Package bookings with percentage commission (total_hours based)
            WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 THEN
              ((cp.purchase_price / cp.total_hours) * b.duration) * 
              COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
            -- Package bookings with percentage commission (sessions_count based)
            WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0 THEN
              (cp.purchase_price / sp.sessions_count) * 
              COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
            -- Standalone bookings with fixed hourly rate
            WHEN bcc.commission_type = 'fixed' THEN 
              COALESCE(bcc.commission_value, 0) * b.duration
            WHEN isc.commission_type = 'fixed' THEN 
              COALESCE(isc.commission_value, 0) * b.duration
            WHEN idc.commission_type = 'fixed' THEN 
              COALESCE(idc.commission_value, 0) * b.duration
            -- Standalone bookings with percentage commission
            WHEN bcc.commission_type = 'percentage' THEN 
              COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(bcc.commission_value, 50) / 100
            WHEN isc.commission_type = 'percentage' THEN 
              COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(isc.commission_value, 50) / 100
            WHEN idc.commission_type = 'percentage' THEN 
              COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(idc.commission_value, 50) / 100
            -- Fallback: 50% of lesson amount
            ELSE 
              COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * 0.50
          END
        ), 0) AS total_commission
      FROM bookings b
      JOIN users u ON u.id = b.instructor_user_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      WHERE b.created_at >= $1::date AND b.created_at < ($2::date + interval '1 day')
        AND b.deleted_at IS NULL
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY total_revenue DESC
      LIMIT 20
    `;
    const instructorResult = await pool.query(instructorQuery, [dateStart, dateEnd]);

    res.json({
      success: true,
      services: serviceResult.rows.map(r => ({
        serviceId: r.service_id,
        name: r.service_name,
        bookings: parseInt(r.booking_count),
        revenue: parseFloat(r.total_revenue),
        avgPrice: parseFloat(r.avg_price)
      })),
      instructors: instructorResult.rows.map(r => ({
        instructorId: r.instructor_id,
        name: r.instructor_name,
        bookings: parseInt(r.booking_count),
        hours: parseFloat(r.total_hours),
        revenue: parseFloat(r.total_revenue),
        commission: parseFloat(r.total_commission)
      }))
    });
  } catch (error) {
    logger.error('Error fetching lesson breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch lesson breakdown' });
  }
});

/**
 * GET /api/finances/rental-breakdown
 * Get equipment popularity and rental analytics data for charts
 */
router.get('/rental-breakdown', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateStart = startDate || '1900-01-01';
    const dateEnd = endDate || '2100-01-01';

    // Date filter for rentals (same logic as /finances/summary)
    const rentalDateFilter = `
      (
        (r.rental_date IS NOT NULL AND r.rental_date >= $1::date AND r.rental_date <= $2::date)
        OR (
          r.rental_date IS NULL AND (
            (r.start_date >= $1::date AND r.start_date <= $2::date) OR
            (r.end_date   >= $1::date AND r.end_date   <= $2::date) OR
            (r.start_date <  $1::date AND r.end_date   >  $2::date)
          )
        )
      )
      AND r.status IN ('completed','returned','closed','active')
    `;

    // Equipment popularity: expand equipment_ids JSONB array and join to services
    const equipmentQuery = `
      SELECT 
        s.id AS service_id,
        s.name AS service_name,
        COUNT(r.id) AS rental_count,
        COALESCE(SUM(r.total_price), 0) AS total_revenue,
        COALESCE(AVG(r.total_price), 0) AS avg_price
      FROM rentals r
      CROSS JOIN LATERAL jsonb_array_elements_text(r.equipment_ids) AS eid
      JOIN services s ON s.id = eid::uuid
      WHERE ${rentalDateFilter}
        AND r.equipment_ids IS NOT NULL
        AND jsonb_array_length(r.equipment_ids) > 0
      GROUP BY s.id, s.name
      ORDER BY rental_count DESC
      LIMIT 20
    `;
    const equipmentResult = await pool.query(equipmentQuery, [dateStart, dateEnd]);

    // Monthly trend for rental revenue
    const trendQuery = `
      SELECT 
        TO_CHAR(COALESCE(r.rental_date, r.start_date), 'YYYY-MM') AS month,
        COUNT(r.id) AS rental_count,
        COALESCE(SUM(r.total_price), 0) AS revenue
      FROM rentals r
      WHERE ${rentalDateFilter}
      GROUP BY month
      ORDER BY month
    `;
    const trendResult = await pool.query(trendQuery, [dateStart, dateEnd]);

    // Payment status breakdown
    const statusQuery = `
      SELECT 
        r.payment_status,
        COUNT(r.id) AS count,
        COALESCE(SUM(r.total_price), 0) AS revenue
      FROM rentals r
      WHERE ${rentalDateFilter}
      GROUP BY r.payment_status
      ORDER BY count DESC
    `;
    const statusResult = await pool.query(statusQuery, [dateStart, dateEnd]);

    res.json({
      success: true,
      equipment: equipmentResult.rows.map(r => ({
        serviceId: r.service_id,
        name: r.service_name,
        rentals: parseInt(r.rental_count),
        revenue: parseFloat(r.total_revenue),
        avgPrice: parseFloat(r.avg_price)
      })),
      trends: trendResult.rows.map(r => ({
        month: r.month,
        rentals: parseInt(r.rental_count),
        revenue: parseFloat(r.revenue)
      })),
      paymentStatus: statusResult.rows.map(r => ({
        status: r.payment_status,
        count: parseInt(r.count),
        revenue: parseFloat(r.revenue)
      }))
    });
  } catch (error) {
    logger.error('Error fetching rental breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch rental breakdown' });
  }
});

/**
 * GET /api/finances/membership-breakdown
 * Get membership offering popularity and purchase analytics
 */
router.get('/membership-breakdown', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateStart = startDate || '1900-01-01';
    const dateEnd = endDate || '2100-01-01';

    // Offering popularity: group purchases by offering
    const offeringQuery = `
      SELECT 
        mp.offering_id,
        mp.offering_name AS name,
        COUNT(mp.id) AS purchase_count,
        COALESCE(SUM(mp.offering_price), 0) AS total_revenue,
        COALESCE(AVG(mp.offering_price), 0) AS avg_price
      FROM member_purchases mp
      WHERE mp.purchased_at >= $1::date AND mp.purchased_at < ($2::date + interval '1 day')
        AND mp.payment_status = 'completed'
      GROUP BY mp.offering_id, mp.offering_name
      ORDER BY purchase_count DESC
      LIMIT 20
    `;
    const offeringResult = await pool.query(offeringQuery, [dateStart, dateEnd]);

    // Monthly trend
    const trendQuery = `
      SELECT 
        TO_CHAR(mp.purchased_at, 'YYYY-MM') AS month,
        COUNT(mp.id) AS purchase_count,
        COALESCE(SUM(mp.offering_price), 0) AS revenue
      FROM member_purchases mp
      WHERE mp.purchased_at >= $1::date AND mp.purchased_at < ($2::date + interval '1 day')
        AND mp.payment_status = 'completed'
      GROUP BY month
      ORDER BY month
    `;
    const trendResult = await pool.query(trendQuery, [dateStart, dateEnd]);

    // Payment method breakdown
    const methodQuery = `
      SELECT 
        mp.payment_method,
        COUNT(mp.id) AS count,
        COALESCE(SUM(mp.offering_price), 0) AS revenue
      FROM member_purchases mp
      WHERE mp.purchased_at >= $1::date AND mp.purchased_at < ($2::date + interval '1 day')
        AND mp.payment_status = 'completed'
      GROUP BY mp.payment_method
      ORDER BY count DESC
    `;
    const methodResult = await pool.query(methodQuery, [dateStart, dateEnd]);

    // Active vs expired breakdown
    const statusQuery = `
      SELECT 
        CASE 
          WHEN mp.status = 'cancelled' THEN 'cancelled'
          WHEN mp.expires_at IS NOT NULL AND mp.expires_at < NOW() THEN 'expired'
          ELSE mp.status
        END AS computed_status,
        COUNT(mp.id) AS count
      FROM member_purchases mp
      WHERE mp.purchased_at >= $1::date AND mp.purchased_at < ($2::date + interval '1 day')
        AND mp.payment_status = 'completed'
      GROUP BY computed_status
      ORDER BY count DESC
    `;
    const statusResult = await pool.query(statusQuery, [dateStart, dateEnd]);

    res.json({
      success: true,
      offerings: offeringResult.rows.map(r => ({
        offeringId: r.offering_id,
        name: r.name,
        purchases: parseInt(r.purchase_count),
        revenue: parseFloat(r.total_revenue),
        avgPrice: parseFloat(r.avg_price)
      })),
      trends: trendResult.rows.map(r => ({
        month: r.month,
        purchases: parseInt(r.purchase_count),
        revenue: parseFloat(r.revenue)
      })),
      paymentMethods: methodResult.rows.map(r => ({
        method: r.payment_method,
        count: parseInt(r.count),
        revenue: parseFloat(r.revenue)
      })),
      membershipStatus: statusResult.rows.map(r => ({
        status: r.computed_status,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    logger.error('Error fetching membership breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch membership breakdown' });
  }
});

/**
 * GET /api/finances/accommodation-breakdown
 * Get accommodation unit popularity, booking trends, and status breakdown
 */
router.get('/accommodation-breakdown', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateStart = startDate || '1900-01-01';
    const dateEnd = endDate || '2100-01-01';

    // Unit popularity: bookings per unit, revenue per unit
    const unitQuery = `
      SELECT
        au.id AS unit_id,
        au.name AS unit_name,
        au.type AS unit_type,
        COUNT(ab.id)::int AS bookings,
        COALESCE(SUM(ab.total_price), 0)::numeric AS revenue,
        COALESCE(SUM(
          CASE WHEN ab.check_out_date IS NOT NULL AND ab.check_in_date IS NOT NULL
               THEN (ab.check_out_date::date - ab.check_in_date::date)
               ELSE 0 END
        ), 0)::int AS total_nights
      FROM accommodation_bookings ab
      JOIN accommodation_units au ON au.id = ab.unit_id
      WHERE ab.check_in_date >= $1::date AND ab.check_out_date <= ($2::date + interval '1 day')
      GROUP BY au.id, au.name, au.type
      ORDER BY revenue DESC
    `;
    const unitResult = await pool.query(unitQuery, [dateStart, dateEnd]);

    // Monthly trends
    const trendQuery = `
      SELECT
        TO_CHAR(ab.check_in_date, 'YYYY-MM') AS month,
        COUNT(ab.id)::int AS bookings,
        COALESCE(SUM(ab.total_price), 0)::numeric AS revenue,
        COALESCE(SUM(
          CASE WHEN ab.check_out_date IS NOT NULL AND ab.check_in_date IS NOT NULL
               THEN (ab.check_out_date::date - ab.check_in_date::date)
               ELSE 0 END
        ), 0)::int AS total_nights
      FROM accommodation_bookings ab
      WHERE ab.check_in_date >= $1::date AND ab.check_out_date <= ($2::date + interval '1 day')
      GROUP BY TO_CHAR(ab.check_in_date, 'YYYY-MM')
      ORDER BY month ASC
    `;
    const trendResult = await pool.query(trendQuery, [dateStart, dateEnd]);

    // Booking status breakdown
    const statusQuery = `
      SELECT
        COALESCE(ab.status, 'unknown') AS status,
        COUNT(ab.id)::int AS count,
        COALESCE(SUM(ab.total_price), 0)::numeric AS revenue
      FROM accommodation_bookings ab
      WHERE ab.check_in_date >= $1::date AND ab.check_out_date <= ($2::date + interval '1 day')
      GROUP BY ab.status
      ORDER BY revenue DESC
    `;
    const statusResult = await pool.query(statusQuery, [dateStart, dateEnd]);

    res.json({
      units: unitResult.rows.map(r => ({
        unitId: r.unit_id,
        name: r.unit_name || 'Unknown Unit',
        type: r.unit_type || 'unknown',
        bookings: r.bookings,
        revenue: parseFloat(r.revenue) || 0,
        totalNights: r.total_nights
      })),
      trends: trendResult.rows.map(r => ({
        month: r.month,
        bookings: r.bookings,
        revenue: parseFloat(r.revenue) || 0,
        totalNights: r.total_nights
      })),
      bookingStatus: statusResult.rows.map(r => ({
        status: r.status,
        count: r.count,
        revenue: parseFloat(r.revenue) || 0
      }))
    });
  } catch (error) {
    logger.error('Error fetching accommodation breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch accommodation breakdown' });
  }
});

/**
 * GET /api/finances/events-breakdown
 * Get event type breakdown, registration trends, and revenue analysis
 */
router.get('/events-breakdown', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateStart = startDate || '1900-01-01';
    const dateEnd = endDate || '2100-01-01';

    // Event popularity: registrations and revenue per event
    const eventQuery = `
      SELECT
        e.id AS event_id,
        e.name,
        e.event_type,
        e.status,
        COALESCE(e.price, 0)::numeric AS ticket_price,
        COALESCE(
          (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'registered'),
          0
        )::int AS registrations,
        COALESCE(e.capacity, 0)::int AS capacity,
        (COALESCE(e.price, 0) * COALESCE(
          (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'registered'),
          0
        ))::numeric AS revenue
      FROM events e
      WHERE e.start_at >= $1::date AND e.start_at <= ($2::date + interval '1 day')
        AND e.deleted_at IS NULL
      ORDER BY revenue DESC
    `;
    const eventResult = await pool.query(eventQuery, [dateStart, dateEnd]);

    // Monthly trends
    const trendQuery = `
      SELECT
        TO_CHAR(e.start_at, 'YYYY-MM') AS month,
        COUNT(e.id)::int AS events,
        COALESCE(SUM(
          (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'registered')
        ), 0)::int AS registrations,
        COALESCE(SUM(
          e.price * (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'registered')
        ), 0)::numeric AS revenue
      FROM events e
      WHERE e.start_at >= $1::date AND e.start_at <= ($2::date + interval '1 day')
        AND e.deleted_at IS NULL
      GROUP BY TO_CHAR(e.start_at, 'YYYY-MM')
      ORDER BY month ASC
    `;
    const trendResult = await pool.query(trendQuery, [dateStart, dateEnd]);

    // Event status breakdown
    const statusQuery = `
      SELECT
        COALESCE(e.status, 'unknown') AS status,
        COUNT(e.id)::int AS count,
        COALESCE(SUM(
          e.price * (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'registered')
        ), 0)::numeric AS revenue
      FROM events e
      WHERE e.start_at >= $1::date AND e.start_at <= ($2::date + interval '1 day')
        AND e.deleted_at IS NULL
      GROUP BY e.status
      ORDER BY count DESC
    `;
    const statusResult = await pool.query(statusQuery, [dateStart, dateEnd]);

    res.json({
      events: eventResult.rows.map(r => ({
        eventId: r.event_id,
        name: r.name || 'Unknown Event',
        eventType: r.event_type || 'general',
        status: r.status,
        ticketPrice: parseFloat(r.ticket_price) || 0,
        registrations: r.registrations,
        capacity: r.capacity,
        revenue: parseFloat(r.revenue) || 0
      })),
      trends: trendResult.rows.map(r => ({
        month: r.month,
        events: r.events,
        registrations: r.registrations,
        revenue: parseFloat(r.revenue) || 0
      })),
      eventStatus: statusResult.rows.map(r => ({
        status: r.status,
        count: r.count,
        revenue: parseFloat(r.revenue) || 0
      }))
    });
  } catch (error) {
    logger.error('Error fetching events breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch events breakdown' });
  }
});

/**
 * GET /api/finances/overview
 * Comprehensive financial overview using wallet_transactions as the source of truth.
 * Returns: headline stats, service breakdown, monthly trend, expense breakdown.
 */
router.get('/overview', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const startDate = start_date || '2020-01-01';
    const endDate = end_date || new Date().toISOString().slice(0, 10);

    // ── Headline stats: credits vs debits from wallet_transactions ──────────
    const headlineResult = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0)   AS total_income,
        COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount ELSE 0 END), 0)   AS total_charges,
        COUNT(*)::int                                                               AS total_transactions,
        -- money deposited by customers (wallet top-ups)
        COALESCE(SUM(CASE WHEN transaction_type IN ('wallet_deposit','manual_credit','credit') THEN amount ELSE 0 END), 0) AS total_deposits,
        -- actual service charges collected
        COALESCE(SUM(CASE WHEN transaction_type IN ('booking_charge','rental_charge','rental_payment','service_payment') THEN amount ELSE 0 END), 0) AS service_revenue,
        -- shop sales
        COALESCE(SUM(CASE WHEN transaction_type IN ('payment','charge') AND direction='debit' THEN amount ELSE 0 END), 0) AS shop_revenue,
        -- refunds issued
        COALESCE(SUM(CASE WHEN transaction_type IN ('refund','booking_deleted_refund','package_refund') THEN amount ELSE 0 END), 0) AS total_refunds,
        -- package purchases
        COALESCE(SUM(CASE WHEN transaction_type = 'package_purchase' THEN amount ELSE 0 END), 0) AS package_revenue
      FROM wallet_transactions
      WHERE status = 'completed'
        AND created_at::date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    const h = headlineResult.rows[0];
    const totalIncome  = parseFloat(h.total_income)   || 0;
    const totalCharges = parseFloat(h.total_charges)  || 0;
    const net = totalIncome - totalCharges;

    // ── Service revenue breakdown ─────────────────────────────────────────
    const serviceBreakdownResult = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'booking_charge' THEN amount ELSE 0 END), 0)                               AS lesson_revenue,
        COALESCE(SUM(CASE WHEN transaction_type IN ('rental_charge','rental_payment') THEN amount ELSE 0 END), 0)            AS rental_revenue,
        COALESCE(SUM(CASE WHEN transaction_type = 'package_purchase' THEN amount ELSE 0 END), 0)                             AS membership_revenue,
        COALESCE(SUM(CASE WHEN transaction_type IN ('payment','charge') AND direction='debit' THEN amount ELSE 0 END), 0)    AS shop_revenue,
        COALESCE(SUM(CASE WHEN transaction_type IN ('wallet_deposit','manual_credit','credit') THEN amount ELSE 0 END), 0)   AS deposits
      FROM wallet_transactions
      WHERE status = 'completed'
        AND created_at::date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    const sb = serviceBreakdownResult.rows[0];

    // ── Monthly trend ──────────────────────────────────────────────────────
    const trendResult = await pool.query(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') AS month,
        COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0) AS charges
      FROM wallet_transactions
      WHERE status = 'completed'
        AND created_at::date BETWEEN $1 AND $2
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `, [startDate, endDate]);

    // ── Instructor commissions paid ────────────────────────────────────────
    const commissionResult = await pool.query(`
      SELECT COALESCE(SUM(ie.total_earnings), 0) AS instructor_commission
      FROM instructor_earnings ie
      WHERE ie.lesson_date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    const commission = parseFloat(commissionResult.rows[0]?.instructor_commission) || 0;

    // ── Expense breakdown by transaction type ──────────────────────────────
    const expenseResult = await pool.query(`
      SELECT
        transaction_type,
        COALESCE(SUM(amount), 0) AS total,
        COUNT(*)::int            AS count
      FROM wallet_transactions
      WHERE status = 'completed'
        AND direction = 'debit'
        AND created_at::date BETWEEN $1 AND $2
      GROUP BY transaction_type
      ORDER BY total DESC
    `, [startDate, endDate]);

    res.json({
      headline: {
        totalIncome,
        totalCharges,
        net,
        totalRefunds:     parseFloat(h.total_refunds)    || 0,
        totalDeposits:    parseFloat(h.total_deposits)   || 0,
        serviceRevenue:   parseFloat(h.service_revenue)  || 0,
        instructorCommission: commission,
        totalTransactions: h.total_transactions
      },
      serviceBreakdown: {
        lessons:    parseFloat(sb.lesson_revenue)      || 0,
        rentals:    parseFloat(sb.rental_revenue)      || 0,
        memberships: parseFloat(sb.membership_revenue) || 0,
        shop:       parseFloat(sb.shop_revenue)        || 0,
        deposits:   parseFloat(sb.deposits)            || 0
      },
      monthlyTrend: trendResult.rows.map(r => ({
        month:   r.month,
        income:  parseFloat(r.income)  || 0,
        charges: parseFloat(r.charges) || 0,
        net:     (parseFloat(r.income) || 0) - (parseFloat(r.charges) || 0)
      })),
      expenseBreakdown: expenseResult.rows.map(r => ({
        type:  r.transaction_type,
        total: parseFloat(r.total) || 0,
        count: r.count
      }))
    });
  } catch (err) {
    console.error('GET /finances/overview error:', err);
    res.status(500).json({ error: 'Failed to fetch financial overview' });
  }
});

/**
 * GET /api/finances/wallet-deposits
 * Wallet deposit / manual credit transactions with user info
 * All amounts normalised to base currency (EUR) using currency_settings rates
 */
router.get('/wallet-deposits', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 200, 500);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    const dateConditions = [];
    const params = [];
    let paramIdx = 1;

    dateConditions.push(`wt.transaction_type IN ('manual_credit', 'wallet_deposit')`);

    if (startDate) {
      dateConditions.push(`wt.created_at >= $${paramIdx}::date`);
      params.push(startDate);
      paramIdx++;
    }
    if (endDate) {
      dateConditions.push(`wt.created_at < ($${paramIdx}::date + interval '1 day')`);
      params.push(endDate);
      paramIdx++;
    }

    const whereClause = dateConditions.length > 0 ? `WHERE ${dateConditions.join(' AND ')}` : '';

    // amount_eur converts every row to EUR using the live exchange rate
    const amountEur = `(wt.amount / COALESCE(cs.exchange_rate, 1))`;
    const joinRates = `LEFT JOIN currency_settings cs ON cs.currency_code = wt.currency AND cs.is_active = true`;

    // Summary stats (in EUR)
    const statsQuery = `
      SELECT
        COUNT(*)::int AS total_count,
        COALESCE(SUM(${amountEur}), 0) AS total_amount,
        COUNT(DISTINCT wt.user_id)::int AS unique_users,
        CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(${amountEur}), 0) / COUNT(*) ELSE 0 END AS avg_amount
      FROM wallet_transactions wt
      ${joinRates}
      ${whereClause}
    `;

    // Deposit list with user info (keep original + EUR equivalent)
    const listQuery = `
      SELECT
        wt.id,
        wt.user_id,
        wt.amount,
        wt.currency,
        ${amountEur} AS amount_eur,
        wt.transaction_type,
        wt.status,
        wt.description,
        wt.payment_method,
        wt.reference_number,
        wt.created_at,
        wt.created_by,
        u.name AS user_name,
        u.email AS user_email,
        cb.name AS created_by_name
      FROM wallet_transactions wt
      ${joinRates}
      LEFT JOIN users u ON u.id = wt.user_id
      LEFT JOIN users cb ON cb.id = wt.created_by
      ${whereClause}
      ORDER BY wt.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    // Monthly trends (in EUR)
    const trendsQuery = `
      SELECT
        TO_CHAR(wt.created_at, 'YYYY-MM') AS month,
        COUNT(*)::int AS count,
        COALESCE(SUM(${amountEur}), 0) AS total
      FROM wallet_transactions wt
      ${joinRates}
      ${whereClause}
      GROUP BY month
      ORDER BY month
    `;

    // Top depositors (in EUR)
    const topQuery = `
      SELECT
        wt.user_id,
        u.name AS user_name,
        u.email AS user_email,
        COUNT(*)::int AS deposit_count,
        COALESCE(SUM(${amountEur}), 0) AS total_deposited
      FROM wallet_transactions wt
      ${joinRates}
      LEFT JOIN users u ON u.id = wt.user_id
      ${whereClause}
      GROUP BY wt.user_id, u.name, u.email
      ORDER BY total_deposited DESC
      LIMIT 10
    `;

    const listParams = [...params, limit, offset];

    const [statsResult, listResult, trendsResult, topResult] = await Promise.all([
      pool.query(statsQuery, params),
      pool.query(listQuery, listParams),
      pool.query(trendsQuery, params),
      pool.query(topQuery, params),
    ]);

    const stats = statsResult.rows[0];

    res.json({
      stats: {
        totalCount: stats.total_count,
        totalAmount: parseFloat(stats.total_amount) || 0,
        uniqueUsers: stats.unique_users,
        avgAmount: parseFloat(stats.avg_amount) || 0,
      },
      deposits: listResult.rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        amount: parseFloat(r.amount_eur) || 0,
        type: r.transaction_type,
        status: r.status,
        description: r.description,
        createdAt: r.created_at,
        user: { name: r.user_name, email: r.user_email },
        createdBy: r.created_by_name,
      })),
      trends: trendsResult.rows.map(r => ({
        month: r.month,
        count: r.count,
        total: parseFloat(r.total) || 0,
      })),
      topDepositors: topResult.rows.map(r => ({
        userId: r.user_id,
        name: r.user_name,
        email: r.user_email,
        depositCount: r.deposit_count,
        totalDeposited: parseFloat(r.total_deposited) || 0,
      })),
      pagination: { limit, offset },
    });
  } catch (error) {
    logger.error('Error fetching wallet deposits:', error);
    res.status(500).json({ error: 'Failed to fetch wallet deposits' });
  }
});

/**
 * GET /api/finances/revenue-analytics
 * Get detailed revenue breakdown and trends
 */
router.get('/revenue-analytics', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
  const { startDate, endDate, groupBy = 'day', mode = 'accrual', serviceType } = req.query;
    
    const dateFormat = groupBy === 'month' ? 'YYYY-MM' : 
                      groupBy === 'week' ? 'YYYY-"W"IW' : 'YYYY-MM-DD';
    
    // Use parameterized queries for better security and proper type handling
    const dateStart = startDate || '1900-01-01';
    const dateEnd = endDate || '2100-01-01';
    
    // Revenue trends over time (snapshots if enabled)
    let trendsResult;
    let useAccrual = NET_REVENUE_ENABLED && mode === 'accrual';

    if (useAccrual) {
      // Accrual-based trends from snapshots
      const params = [dateStart, dateEnd];
      let extra = '';
      if (serviceType && serviceType !== 'all') {
        params.push(serviceType);
        extra = ` AND service_type = $${params.length}`;
      }
      const trendsNetQuery = `
        SELECT 
          TO_CHAR(fulfillment_date, '${dateFormat}')                         AS period,
          COALESCE(SUM(gross_amount), 0)                                     AS gross,
          COALESCE(SUM(net_amount), 0)                                       AS net,
          COALESCE(SUM(commission_amount), 0)                                AS commission,
          COALESCE(SUM(tax_amount), 0)                                       AS tax,
          COALESCE(SUM(insurance_amount), 0)                                 AS insurance,
          COALESCE(SUM(equipment_amount), 0)                                 AS equipment,
          COALESCE(SUM(payment_fee_amount), 0)                               AS payment_fee,
          COUNT(*)                                                           AS items_count
        FROM revenue_items
        WHERE fulfillment_date >= $1::date AND fulfillment_date <= $2::date${extra}
        GROUP BY TO_CHAR(fulfillment_date, '${dateFormat}')
        ORDER BY period
      `;
      trendsResult = await pool.query(trendsNetQuery, params);

      // Fallback to cash basis if no accrual data exists
      if (trendsResult.rows.length === 0) {
        useAccrual = false;
      }
    }
    
    if (!useAccrual) {
      // Cash-based trends from transactions
      // Use standardized constants
      const { PAYMENT_TYPES, EXCLUDED_REVENUE_TYPES } = await import('../constants/transactions.js');
      let includeTypes = PAYMENT_TYPES;
      if (serviceType && serviceType !== 'all') {
        const { SERVICE_TYPE_TO_PAYMENT_TYPES } = await import('../constants/transactions.js');
        includeTypes = SERVICE_TYPE_TO_PAYMENT_TYPES[serviceType] || PAYMENT_TYPES;
      }
      const params = [dateStart, dateEnd, includeTypes, EXCLUDED_REVENUE_TYPES];
      const trendsQuery = `
        SELECT 
          TO_CHAR(transaction_date, '${dateFormat}') as period,
          COALESCE(SUM(CASE WHEN transaction_type = ANY($3) THEN amount ELSE 0 END), 0) as revenue,
          COUNT(CASE WHEN transaction_type = ANY($3) THEN 1 END) as transaction_count
        FROM wallet_transactions
        WHERE transaction_date >= $1::date AND transaction_date <= $2::date
          AND status = 'completed'
          AND NOT (transaction_type = ANY($4))
        GROUP BY TO_CHAR(transaction_date, '${dateFormat}')
        ORDER BY period
      `;
      trendsResult = await pool.query(trendsQuery, params);
    }
    
    // Service performance analytics
  const serviceQuery = `
      SELECT 
        s.name as service_name,
        s.category,
        COUNT(b.id) as booking_count,
        COALESCE(SUM(b.final_amount), 0) as total_revenue,
        COALESCE(AVG(b.final_amount), 0) as average_price
      FROM services s
      LEFT JOIN bookings b ON s.id = b.service_id 
        AND b.date >= $1::date
        AND b.date <= $2::date
    AND b.status = 'completed'
    AND b.deleted_at IS NULL
      GROUP BY s.id, s.name, s.category
      ORDER BY total_revenue DESC
    `;
    
    const serviceResult = await pool.query(serviceQuery, [dateStart, dateEnd]);
    
    if (useAccrual) {
      // Normalize to common shape expected by charts: revenue + transaction_count
      res.json({
        success: true,
        trends: trendsResult.rows.map(r => ({
          period: r.period,
          revenue: parseFloat(r.net),
          transaction_count: parseInt(r.items_count)
        })),
        servicePerformance: serviceResult.rows,
        groupBy,
        dateRange: { startDate, endDate }
      });
    } else {
      res.json({
        success: true,
        trends: trendsResult.rows,
        servicePerformance: serviceResult.rows,
        groupBy,
        dateRange: { startDate, endDate }
      });
    }
    
  } catch (error) {
  logger.error('Error fetching revenue analytics:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

/**
 * GET /api/finances/outstanding-balances
 * Get detailed customer balance information
 */
router.get('/outstanding-balances', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { sortBy = 'balance', order = 'desc', minAmount = 0 } = req.query;
    
    const validSortColumns = ['balance', 'name', 'email', 'last_payment_date', 'total_spent'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'balance';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.balance,
        u.total_spent,
        u.last_payment_date,
        u.created_at as customer_since,
        COUNT(b.id) as total_bookings,
        COUNT(CASE WHEN b.payment_status = 'unpaid' THEN 1 END) as unpaid_bookings,
        COALESCE(SUM(CASE WHEN b.payment_status = 'unpaid' THEN b.final_amount ELSE 0 END), 0) as unpaid_amount
      FROM users u
      LEFT JOIN bookings b ON u.id = b.student_user_id AND b.deleted_at IS NULL
      WHERE u.role_id IN (SELECT id FROM roles WHERE name IN ('student', 'outsider'))
        AND u.deleted_at IS NULL
        AND ABS(u.balance) >= $1
      GROUP BY u.id, u.name, u.email, u.balance, u.total_spent, u.last_payment_date, u.created_at
      ORDER BY ${sortColumn} ${sortOrder}
    `;
    
    const result = await pool.query(query, [minAmount]);
    
    // Calculate summary stats
    const summary = result.rows.reduce((acc, customer) => {
      if (customer.balance > 0) {
        acc.totalCredit += customer.balance;
        acc.customersWithCredit++;
      } else if (customer.balance < 0) {
        acc.totalDebt += Math.abs(customer.balance);
        acc.customersWithDebt++;
      }
      acc.totalUnpaidAmount += parseFloat(customer.unpaid_amount);
      return acc;
    }, {
      totalCredit: 0,
      totalDebt: 0,
      customersWithCredit: 0,
      customersWithDebt: 0,
      totalUnpaidAmount: 0
    });
    
    res.json({
      success: true,
      customers: result.rows,
      summary,
      filters: { sortBy, order, minAmount }
    });
    
  } catch (error) {
  logger.error('Error fetching outstanding balances:', error);
    res.status(500).json({ error: 'Failed to fetch outstanding balances' });
  }
});

/**
 * GET /api/finances/customer-analytics
 * Get detailed customer financial analytics
 */
router.get('/customer-analytics', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    // Customer lifetime value analysis
    const clvQuery = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.total_spent as lifetime_value,
        u.balance,
        COUNT(b.id) as total_bookings,
        COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as completed_bookings,
        MIN(b.date) as first_booking_date,
        MAX(b.date) as last_booking_date,
        COALESCE(AVG(b.final_amount), 0) as average_booking_value,
        -- Customer segments based on spending
        CASE 
          WHEN u.total_spent > 1000 THEN 'VIP'
          WHEN u.total_spent > 500 THEN 'High Value'
          WHEN u.total_spent > 100 THEN 'Regular'
          ELSE 'New/Low Spend'
        END as customer_segment
      FROM users u
      LEFT JOIN bookings b ON u.id = b.student_user_id
      WHERE u.role_id IN (SELECT id FROM roles WHERE name IN ('student', 'outsider'))
      GROUP BY u.id, u.name, u.email, u.total_spent, u.balance
      ORDER BY u.total_spent DESC
    `;
    
    const clvResult = await pool.query(clvQuery);
    
    // Payment behavior analysis
    const paymentBehaviorQuery = `
      SELECT 
        u.id,
        u.name,
        COUNT(wt.id) as total_transactions,
        COALESCE(AVG(EXTRACT(EPOCH FROM (wt.created_at - b.created_at))/86400), 0) as avg_payment_delay_days,
        COUNT(CASE WHEN wt.transaction_type = 'payment' THEN 1 END) as payment_count,
        COUNT(CASE WHEN wt.transaction_type = 'refund' THEN 1 END) as refund_count
      FROM users u
      LEFT JOIN wallet_transactions wt ON u.id = wt.user_id AND wt.status = 'completed'
      LEFT JOIN bookings b ON wt.booking_id = b.id
      WHERE u.role_id IN (SELECT id FROM roles WHERE name IN ('student', 'outsider'))
      GROUP BY u.id, u.name
      HAVING COUNT(wt.id) > 0
      ORDER BY avg_payment_delay_days DESC
    `;
    
    const paymentBehaviorResult = await pool.query(paymentBehaviorQuery);
    
    res.json({
      success: true,
      customerLifetimeValue: clvResult.rows,
      paymentBehavior: paymentBehaviorResult.rows
    });
    
  } catch (error) {
  logger.error('Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

/**
 * GET /api/finances/operational-metrics
 * Get operational finance tracking metrics
 */
router.get('/operational-metrics', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Validate date format to prevent injection (YYYY-MM-DD)
    const dateRx = /^\d{4}-\d{2}-\d{2}$/;
    const hasDateRange = startDate && endDate && dateRx.test(startDate) && dateRx.test(endDate);
    
    // Build parameterized date filter for bookings
    let bookingDateFilter = '';
    let bookingParams = [];
    if (hasDateRange) {
      bookingDateFilter = 'AND date >= $1 AND date <= $2';
      bookingParams = [startDate, endDate];
    }
    
    // Booking performance metrics
    const bookingMetricsQuery = `
      SELECT 
        status,
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(final_amount), 0) as total_amount,
        COALESCE(AVG(final_amount), 0) as average_amount
      FROM bookings 
      WHERE deleted_at IS NULL ${bookingDateFilter}
      GROUP BY status, payment_status
      ORDER BY status, payment_status
    `;
    
    const bookingMetricsResult = await pool.query(bookingMetricsQuery, bookingParams);
    
    // Equipment rental analysis (if rentals table exists)
    const rentalMetricsQuery = `
      SELECT 
        'rental_analysis' as metric_type,
        COUNT(*) as total_rentals,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_rentals,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_rentals,
        COALESCE(SUM(total_price), 0) as total_rental_revenue,
        COALESCE(AVG(total_price), 0) as average_rental_value
      FROM rentals 
      WHERE created_at >= $1::timestamp
        AND created_at <= $2::timestamp
        AND status NOT IN ('cancelled', 'canceled')
    `;
    
    let rentalMetricsResult = { rows: [] };
    try {
      const rentalStart = startDate || '1900-01-01';
      const rentalEnd = endDate || '2100-01-01';
      rentalMetricsResult = await pool.query(rentalMetricsQuery, [rentalStart, rentalEnd]);
    } catch (e) {
      logger.debug('Rentals table not available for metrics', e);
    }
    
    // Instructor performance metrics - calculate actual instructor earnings (commission)
    // Build parameterized date filter for the JOIN clause
    let instrDateFilter = '';
    let instrParams = [];
    if (hasDateRange) {
      instrDateFilter = 'AND b.date >= $1 AND b.date <= $2';
      instrParams = [startDate, endDate];
    }
    
    const instructorMetricsQuery = `
      SELECT 
        u.id,
        u.name as instructor_name,
        COUNT(b.id) as total_lessons,
        COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as completed_lessons,
        COALESCE(SUM(
          CASE 
            WHEN b.status = 'completed' THEN
              CASE 
                WHEN b.customer_package_id IS NOT NULL AND COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type) = 'fixed' THEN
                  COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) * b.duration
                WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 THEN
                  ((cp.purchase_price / cp.total_hours) * b.duration) * 
                  COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
                WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0 THEN
                  (cp.purchase_price / sp.sessions_count) * 
                  COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
                WHEN bcc.commission_type = 'fixed' THEN 
                  COALESCE(bcc.commission_value, 0) * b.duration
                WHEN isc.commission_type = 'fixed' THEN 
                  COALESCE(isc.commission_value, 0) * b.duration
                WHEN idc.commission_type = 'fixed' THEN 
                  COALESCE(idc.commission_value, 0) * b.duration
                WHEN bcc.commission_type = 'percentage' THEN 
                  COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(bcc.commission_value, 50) / 100
                WHEN isc.commission_type = 'percentage' THEN 
                  COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(isc.commission_value, 50) / 100
                WHEN idc.commission_type = 'percentage' THEN 
                  COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(idc.commission_value, 50) / 100
                ELSE 
                  COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * 0.50
              END
            ELSE 0
          END
        ), 0) as total_revenue,
        COALESCE(AVG(
          CASE 
            WHEN b.status = 'completed' THEN
              CASE 
                WHEN b.customer_package_id IS NOT NULL AND COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type) = 'fixed' THEN
                  COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) * b.duration
                WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 THEN
                  ((cp.purchase_price / cp.total_hours) * b.duration) * 
                  COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
                WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0 THEN
                  (cp.purchase_price / sp.sessions_count) * 
                  COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
                WHEN bcc.commission_type = 'fixed' THEN 
                  COALESCE(bcc.commission_value, 0) * b.duration
                WHEN isc.commission_type = 'fixed' THEN 
                  COALESCE(isc.commission_value, 0) * b.duration
                WHEN idc.commission_type = 'fixed' THEN 
                  COALESCE(idc.commission_value, 0) * b.duration
                WHEN bcc.commission_type = 'percentage' THEN 
                  COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(bcc.commission_value, 50) / 100
                WHEN isc.commission_type = 'percentage' THEN 
                  COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(isc.commission_value, 50) / 100
                WHEN idc.commission_type = 'percentage' THEN 
                  COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(idc.commission_value, 50) / 100
                ELSE 
                  COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * 0.50
              END
          END
        ), 0) as average_lesson_value
      FROM users u
      LEFT JOIN bookings b ON u.id = b.instructor_user_id ${instrDateFilter} AND b.deleted_at IS NULL
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = u.id AND isc.service_id = b.service_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = u.id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
      WHERE u.role_id IN (SELECT id FROM roles WHERE name IN ('instructor', 'manager'))
      AND u.deleted_at IS NULL
      GROUP BY u.id, u.name
      ORDER BY total_revenue DESC
    `;
    
    const instructorMetricsResult = await pool.query(instructorMetricsQuery, instrParams);
    
    res.json({
      success: true,
      bookingMetrics: bookingMetricsResult.rows,
      rentalMetrics: rentalMetricsResult.rows,
      instructorMetrics: instructorMetricsResult.rows,
      dateRange: { startDate, endDate }
    });
    
  } catch (error) {
  logger.error('Error fetching operational metrics:', error);
    res.status(500).json({ error: 'Failed to fetch operational metrics' });
  }
});

/**
 * GET /api/finances/reports/:type
 * Generate specific financial reports
 */
router.get('/reports/:type', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate, format = 'json' } = req.query;
    
    let reportData = {};
    
    switch (type) {
      case 'profit-loss': {
        const { PAYMENT_TYPES, REFUND_TYPES } = await import('../constants/transactions.js');
        const dateStart = startDate || '1900-01-01';
        const dateEnd = endDate || '2100-01-01';
        const plQuery = `
          SELECT 
            'Revenue' as category,
            COALESCE(SUM(CASE WHEN transaction_type = ANY($3) THEN amount ELSE 0 END), 0) as amount
          FROM wallet_transactions
          WHERE transaction_date >= $1::date
            AND transaction_date <= $2::date
            AND status = 'completed'
          UNION ALL
          SELECT 
            'Refunds' as category,
            COALESCE(SUM(CASE WHEN transaction_type = ANY($4) THEN -amount ELSE 0 END), 0) as amount
          FROM wallet_transactions
          WHERE transaction_date >= $1::date
            AND transaction_date <= $2::date
            AND status = 'completed'
        `;
        const plResult = await pool.query(plQuery, [dateStart, dateEnd, PAYMENT_TYPES, REFUND_TYPES]);
        reportData = { type: 'Profit & Loss', data: plResult.rows };
        break;
      }
        
      case 'customer-summary':
        const customerQuery = `
          SELECT 
            u.name,
            u.email,
            u.balance,
            u.total_spent,
            COUNT(b.id) as total_bookings,
            MAX(b.date) as last_booking_date
          FROM users u
          LEFT JOIN bookings b ON u.id = b.student_user_id
          WHERE u.role_id IN (SELECT id FROM roles WHERE name IN ('student', 'outsider'))
          GROUP BY u.id, u.name, u.email, u.balance, u.total_spent
          ORDER BY u.total_spent DESC
        `;
        const customerResult = await pool.query(customerQuery);
        reportData = { type: 'Customer Summary', data: customerResult.rows };
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(reportData.data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      report: reportData,
      generatedAt: new Date().toISOString(),
      dateRange: { startDate, endDate }
    });
    
  } catch (error) {
  logger.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
  ].join('\n');
  
  return csvContent;
}

/**
 * POST /api/finances/bulk-operations
 * Perform bulk financial operations
 */
router.post('/bulk-operations', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { operation, targets, amount, description } = req.body;
    
    if (!operation || !targets || !Array.isArray(targets)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid bulk operation request' });
    }
    
  const results = [];
  const actorId = resolveActorId(req);
    
    for (const target of targets) {
      try {
        let result;
        
        switch (operation) {
          case 'add_credit': {
            const transactionRecord = await recordLegacyTransaction({
              client,
              userId: target.user_id,
              amount: resolveWalletAmount('credit', amount),
              transactionType: 'credit',
              status: 'completed',
              direction: amount >= 0 ? 'credit' : 'debit',
              description: description || 'Bulk credit addition',
              metadata: {
                origin: 'finances_bulk_add_credit',
                requestedAmount: amount
              },
              createdBy: actorId || null
            });
            result = mapTransactionRow(transactionRecord);
            break;
          }
          case 'apply_charge': {
            const transactionRecord = await recordLegacyTransaction({
              client,
              userId: target.user_id,
              amount: resolveWalletAmount('charge', amount),
              transactionType: 'charge',
              status: 'completed',
              direction: 'debit',
              description: description || 'Bulk charge',
              metadata: {
                origin: 'finances_bulk_apply_charge',
                requestedAmount: amount
              },
              createdBy: actorId || null,
              allowNegative: true
            });
            result = mapTransactionRow(transactionRecord);
            break;
          }
            
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
        
  results.push({ user_id: target.user_id, success: true, transaction: result });
        
      } catch (error) {
        results.push({ user_id: target.user_id, success: false, error: error.message });
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      operation,
      results,
      processed: targets.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error('Error in bulk operations:', error);
    res.status(500).json({ error: 'Bulk operation failed' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/finances/expenses
 * Get expenses (negative transactions) with filtering
 */
router.get('/expenses', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      start_date,
      end_date,
      category,
      search
    } = req.query;

    let query = `
      SELECT 
        wt.id,
        wt.amount,
        wt.transaction_type,
        wt.description,
        wt.payment_method,
        wt.reference_number,
        wt.created_at,
        wt.metadata,
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email
      FROM wallet_transactions wt
      LEFT JOIN users u ON wt.user_id = u.id
      WHERE wt.amount < 0
    `;

    const params = [];
    let paramCount = 1;

    if (start_date) {
      query += ` AND wt.created_at >= $${paramCount++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND wt.created_at <= $${paramCount++}`;
      params.push(end_date);
    }

    if (category) {
      query += ` AND wt.transaction_type = $${paramCount++}`;
      params.push(category);
    }

    if (search) {
      query += ` AND (wt.description ILIKE $${paramCount} OR wt.reference_number ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Add ordering and pagination
    query += ` ORDER BY wt.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get expense categories summary
    const categoriesQuery = `
      SELECT 
        transaction_type,
        COUNT(*) as count,
        SUM(ABS(amount)) as total
      FROM wallet_transactions
      WHERE amount < 0
      ${start_date ? `AND created_at >= $1` : ''}
      ${end_date ? `AND created_at <= $${start_date ? '2' : '1'}` : ''}
      GROUP BY transaction_type
      ORDER BY total DESC
    `;
    const categoryParams = [];
    if (start_date) categoryParams.push(start_date);
    if (end_date) categoryParams.push(end_date);
    const categoriesResult = await pool.query(categoriesQuery, categoryParams);

    res.json({
      expenses: result.rows.map(row => ({
        ...row,
        amount: Math.abs(parseFloat(row.amount)) // Return as positive for display
      })),
      total,
      categories: categoriesResult.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + result.rows.length < total
      }
    });
  } catch (error) {
    logger.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

export const __testables = {
  calculateUserBalance
};

// ===========================================================================================
// DEPOSITS (IYZICO)
// ===========================================================================================

/**
 * @route POST /api/finances/deposit
 * @desc Initiate a wallet deposit via Iyzico
 * @access Private
 */
router.post('/deposit', authenticateJWT, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const gatewayResult = await initiateDeposit({
      amount,
      currency,
      userId,
      metadata: { 
          source: 'student_wallet',
          userId: userId
      }
    });

    res.json(gatewayResult);

  } catch (error) {
    logger.error('Deposit initiation failed', error);
    res.status(500).json({ error: 'Failed to initiate deposit' });
  }
});

// NOTE: POST /api/finances/callback/iyzico is handled in server.js BEFORE route mounting
// This ensures the callback runs first without authentication middleware conflicts

export default router;
