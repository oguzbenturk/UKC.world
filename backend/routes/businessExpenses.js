// backend/routes/businessExpenses.js
// API routes for managing business expenses (manual expense entries)

import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// Expense categories for validation and reference
const EXPENSE_CATEGORIES = [
  'rent',
  'utilities',
  'salaries',
  'equipment',
  'maintenance',
  'supplies',
  'marketing',
  'insurance',
  'professional_services',
  'travel',
  'software_subscriptions',
  'bank_fees',
  'taxes',
  'other'
];

/**
 * GET /api/business-expenses
 * Get all business expenses with filtering
 */
router.get('/', authenticateJWT, authorizeRoles(['admin', 'manager', 'frontdesk']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      start_date,
      end_date,
      category,
      search,
      status = 'approved',
      sort_by = 'expense_date',
      sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;
    const whereConditions = ['be.deleted_at IS NULL'];

    if (status && status !== 'all') {
      whereConditions.push(`be.status = $${paramIndex++}`);
      params.push(status);
    }

    if (start_date) {
      whereConditions.push(`be.expense_date >= $${paramIndex++}`);
      params.push(start_date);
    }

    if (end_date) {
      whereConditions.push(`be.expense_date <= $${paramIndex++}`);
      params.push(end_date);
    }

    if (category && category !== 'all') {
      whereConditions.push(`be.category = $${paramIndex++}`);
      params.push(category);
    }

    if (search) {
      whereConditions.push(`(
        be.description ILIKE $${paramIndex} OR
        be.vendor ILIKE $${paramIndex} OR
        be.reference_number ILIKE $${paramIndex} OR
        be.notes ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    // Validate sort column
    const validSortColumns = ['expense_date', 'amount', 'category', 'created_at'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'expense_date';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get expenses with creator info
    const expensesResult = await pool.query(`
      SELECT 
        be.*,
        creator.first_name as creator_first_name,
        creator.last_name as creator_last_name,
        creator.email as creator_email,
        approver.first_name as approver_first_name,
        approver.last_name as approver_last_name
      FROM business_expenses be
      LEFT JOIN users creator ON be.created_by = creator.id
      LEFT JOIN users approver ON be.approved_by = approver.id
      ${whereClause}
      ORDER BY be.${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM business_expenses be
      ${whereClause}
    `, params);

    // Get summary by category
    const summaryResult = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM business_expenses be
      ${whereClause}
      GROUP BY category
      ORDER BY total_amount DESC
    `, params);

    // Get total expenses for the period
    const totalResult = await pool.query(`
      SELECT 
        SUM(amount) as total_expenses,
        COUNT(*) as total_count
      FROM business_expenses be
      ${whereClause}
    `, params);

    res.json({
      expenses: expensesResult.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      summary: {
        totalExpenses: parseFloat(totalResult.rows[0]?.total_expenses || 0),
        totalCount: parseInt(totalResult.rows[0]?.total_count || 0),
        byCategory: summaryResult.rows
      },
      categories: EXPENSE_CATEGORIES,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + expensesResult.rows.length < parseInt(countResult.rows[0]?.total || 0)
      }
    });
  } catch (error) {
    logger.error('Error fetching business expenses:', error);
    res.status(500).json({ error: 'Failed to fetch business expenses' });
  }
});

/**
 * GET /api/business-expenses/:id
 * Get a single expense by ID
 */
router.get('/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'frontdesk']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        be.*,
        creator.first_name as creator_first_name,
        creator.last_name as creator_last_name,
        creator.email as creator_email,
        approver.first_name as approver_first_name,
        approver.last_name as approver_last_name
      FROM business_expenses be
      LEFT JOIN users creator ON be.created_by = creator.id
      LEFT JOIN users approver ON be.approved_by = approver.id
      WHERE be.id = $1 AND be.deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching expense:', error);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

/**
 * POST /api/business-expenses
 * Create a new business expense
 */
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager', 'frontdesk']), async (req, res) => {
  try {
    const {
      amount,
      currency = 'EUR',
      category,
      subcategory,
      description,
      vendor,
      receipt_url,
      expense_date,
      payment_method,
      reference_number,
      is_recurring = false,
      recurring_frequency,
      notes
    } = req.body;

    const createdBy = req.user.id;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    if (!category || !EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({ 
        error: 'Invalid category', 
        validCategories: EXPENSE_CATEGORIES 
      });
    }

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    // Auto-approve for admin/manager, pending for frontdesk
    const status = ['admin', 'manager'].includes(req.user.role) ? 'approved' : 'pending';
    const approvedBy = status === 'approved' ? createdBy : null;

    const result = await pool.query(`
      INSERT INTO business_expenses (
        amount, currency, category, subcategory, description, vendor,
        receipt_url, expense_date, payment_method, reference_number,
        is_recurring, recurring_frequency, notes, created_by, approved_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      amount,
      currency,
      category,
      subcategory || null,
      description,
      vendor || null,
      receipt_url || null,
      expense_date || new Date().toISOString().split('T')[0],
      payment_method || null,
      reference_number || null,
      is_recurring,
      is_recurring ? recurring_frequency : null,
      notes || null,
      createdBy,
      approvedBy,
      status
    ]);

    logger.info(`Business expense created: ${result.rows[0].id} by user ${createdBy}`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating business expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

/**
 * PUT /api/business-expenses/:id
 * Update an existing expense
 */
router.put('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      amount,
      currency,
      category,
      subcategory,
      description,
      vendor,
      receipt_url,
      expense_date,
      payment_method,
      reference_number,
      is_recurring,
      recurring_frequency,
      notes,
      status
    } = req.body;

    // Check if expense exists
    const existing = await pool.query(
      'SELECT * FROM business_expenses WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (amount !== undefined) {
      updates.push(`amount = $${paramIndex++}`);
      values.push(amount);
    }
    if (currency !== undefined) {
      updates.push(`currency = $${paramIndex++}`);
      values.push(currency);
    }
    if (category !== undefined) {
      if (!EXPENSE_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }
    if (subcategory !== undefined) {
      updates.push(`subcategory = $${paramIndex++}`);
      values.push(subcategory);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (vendor !== undefined) {
      updates.push(`vendor = $${paramIndex++}`);
      values.push(vendor);
    }
    if (receipt_url !== undefined) {
      updates.push(`receipt_url = $${paramIndex++}`);
      values.push(receipt_url);
    }
    if (expense_date !== undefined) {
      updates.push(`expense_date = $${paramIndex++}`);
      values.push(expense_date);
    }
    if (payment_method !== undefined) {
      updates.push(`payment_method = $${paramIndex++}`);
      values.push(payment_method);
    }
    if (reference_number !== undefined) {
      updates.push(`reference_number = $${paramIndex++}`);
      values.push(reference_number);
    }
    if (is_recurring !== undefined) {
      updates.push(`is_recurring = $${paramIndex++}`);
      values.push(is_recurring);
    }
    if (recurring_frequency !== undefined) {
      updates.push(`recurring_frequency = $${paramIndex++}`);
      values.push(recurring_frequency);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
      if (status === 'approved') {
        updates.push(`approved_by = $${paramIndex++}`);
        values.push(req.user.id);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(`
      UPDATE business_expenses 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `, values);

    logger.info(`Business expense updated: ${id} by user ${req.user.id}`);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating business expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

/**
 * DELETE /api/business-expenses/:id
 * Soft delete an expense
 */
router.delete('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE business_expenses 
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    logger.info(`Business expense deleted: ${id} by user ${req.user.id}`);

    res.json({ message: 'Expense deleted successfully', id: result.rows[0].id });
  } catch (error) {
    logger.error('Error deleting business expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

/**
 * GET /api/business-expenses/summary/by-period
 * Get expense summary grouped by period (day/week/month)
 */
router.get('/summary/by-period', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      period = 'month' // day, week, month
    } = req.query;

    let dateFormat;
    switch (period) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        break;
      default:
        dateFormat = 'YYYY-MM';
    }

    const params = [];
    let paramIndex = 1;
    let whereConditions = ['deleted_at IS NULL', "status = 'approved'"];

    if (start_date) {
      whereConditions.push(`expense_date >= $${paramIndex++}`);
      params.push(start_date);
    }

    if (end_date) {
      whereConditions.push(`expense_date <= $${paramIndex++}`);
      params.push(end_date);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    const result = await pool.query(`
      SELECT 
        TO_CHAR(expense_date, '${dateFormat}') as period,
        category,
        SUM(amount) as total_amount,
        COUNT(*) as count
      FROM business_expenses
      ${whereClause}
      GROUP BY TO_CHAR(expense_date, '${dateFormat}'), category
      ORDER BY period DESC, total_amount DESC
    `, params);

    res.json({
      summary: result.rows,
      period
    });
  } catch (error) {
    logger.error('Error fetching expense summary:', error);
    res.status(500).json({ error: 'Failed to fetch expense summary' });
  }
});

export default router;
