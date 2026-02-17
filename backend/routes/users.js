import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db.js';
import bcrypt from 'bcrypt';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// Rol ismine göre izin verilen alanlar
const roleSpecificFields = {
  student: ['package_hours', 'remaining_hours', 'instructor_id', 'next_lesson', 'last_lesson', 'first_name', 'last_name', 'date_of_birth', 'age', 'weight', 'address', 'city', 'country', 'postal_code', 'preferred_currency', 'bio', 'profile_image_url', 'level', 'notes'],
  instructor: [
    'first_name',
    'last_name',
    'date_of_birth',
    'age',
    'weight',
    'address',
    'city',
    'country',
    'postal_code',
    'preferred_currency',
    'bio',
    'profile_image_url',
    'level',
    'notes'
    // Removed 'status' as it doesn't exist in the users table
  ],
  manager: ['first_name', 'last_name', 'date_of_birth', 'age', 'weight', 'address', 'city', 'country', 'postal_code', 'preferred_currency'],
  sadmin: ['first_name', 'last_name', 'date_of_birth', 'age', 'weight', 'address', 'city', 'country', 'postal_code', 'preferred_currency'],
  freelancer: ['first_name', 'last_name', 'date_of_birth', 'age', 'weight', 'address', 'city', 'country', 'postal_code', 'preferred_currency', 'level', 'notes'],
  outsider: ['first_name', 'last_name', 'date_of_birth', 'age', 'address', 'city', 'country', 'postal_code', 'preferred_currency', 'profile_image_url'] // Self-registered users with limited fields
};

function getAllowedFieldsByRole(roleName) {
  const baseFields = ['email', 'phone']; // Removed 'name' since we're using first_name/last_name
  const specific = roleSpecificFields[roleName] || [];
  return baseFields.concat(specific);
}

// === CREATE USER ===
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { password, role_id } = req.body;
  
  if (!password || !role_id) {
    return res.status(400).json({ error: 'Password and role_id are required' });
  }

  console.log(`Backend: Received create user request:`, JSON.stringify({
    ...req.body,
    password: '****REDACTED****' // Don't log the actual password
  }, null, 2));

  try {
    const roleRes = await pool.query('SELECT name FROM roles WHERE id = $1', [role_id]);
    console.log(`Backend: Query result for role_id '${role_id}':`, JSON.stringify(roleRes.rows, null, 2));

    if (!roleRes.rows.length) return res.status(400).json({ error: 'Invalid role_id' });

    const roleName = roleRes.rows[0].name;
    const allowedFields = getAllowedFieldsByRole(roleName);

    const hashedPassword = await bcrypt.hash(password, 10);

    // Dynamically collect insert data
    const insertData = {
      password_hash: hashedPassword,
      role_id
    };

    // Generate name field from first_name and last_name if they exist
    if (req.body.first_name && req.body.last_name) {
      insertData.name = `${req.body.first_name} ${req.body.last_name}`;
    } else if (req.body.name) {
      insertData.name = req.body.name;
    } else {
      return res.status(400).json({ error: 'Either name or first_name + last_name are required' });
    }

    // Validate email format
    if (!req.body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if email exists (only for active users, not soft-deleted)
    const emailCheck = await pool.query(
      'SELECT id, email, deleted_at FROM users WHERE email = $1 AND deleted_at IS NULL',
      [req.body.email]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Email already exists',
        message: 'An active user with this email already exists'
      });
    }

    // Add allowed fields from request body
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        insertData[key] = req.body[key];
      }
    }

    const fields = Object.keys(insertData);
    const values = Object.values(insertData);
    const paramList = fields.map((_, i) => `$${i + 1}`);

    const query = `
      INSERT INTO users (${fields.join(', ')}, created_at, updated_at)
      VALUES (${paramList.join(', ')}, NOW(), NOW())
      RETURNING *`;

    console.log('Executing SQL:', query);
    console.log('With values:', values.map(v => typeof v === 'string' && v.length > 50 ? v.substring(0, 50) + '...' : v));

    const { rows } = await pool.query(query, values);

    // Don't return the password_hash in the response
    const { password_hash, ...userWithoutPassword } = rows[0];
    res.status(201).json(userWithoutPassword);
  } catch (err) {
    console.error('User creation failed:', err.message);
    console.error('Error details:', err);
    
    if (err.code === '23505' && err.constraint === 'users_email_key') {
      res.status(409).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: `Failed to create user: ${err.message}` });
    }
  }
});

// === READ ALL (optional ?role=student) ===
router.get('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { role } = req.query;

  let query = `
    SELECT u.*, r.name AS role_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.deleted_at IS NULL
  `;
  const params = [];

  if (role) {
    query += ` AND r.name = $1`;
    params.push(role);
  }

  query += ` ORDER BY u.created_at DESC`;

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Query failed' });
  }
});

// === USER-SPECIFIC ENDPOINTS FOR STUDENT ROLE ===

// GET all users with student or outsider role (customers who can book services)
router.get('/students', async (req, res) => {
  try {
    console.log('🔍 STUDENTS ENDPOINT: Fetching users with student and outsider roles...');
    
    // Fetch users with either 'student' or 'outsider' role for admin bookings
    const query = `
      SELECT u.*, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name IN ('student', 'outsider') AND u.deleted_at IS NULL
      ORDER BY u.first_name, u.last_name
    `;
    
    const { rows } = await pool.query(query);
    console.log(`✅ CUSTOMERS FOUND: ${rows.length} users (students + outsiders)`);
    
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching customer users:', err);
    res.status(500).json({ error: 'Failed to fetch customer users', details: err.message });
  }
});

// === GET ALL USERS FOR BOOKING PURPOSES (PUBLIC ENDPOINT WITH LIMITED FIELDS) ===
router.get('/for-booking', async (req, res) => {
  try {    const query = `
      SELECT u.id, 
             CONCAT(u.first_name, ' ', u.last_name) as name,
             u.first_name, 
             u.last_name, 
             u.email, 
             u.phone,
             r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL
      ORDER BY u.first_name, u.last_name
    `;
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching users for booking:', err);
    res.status(500).json({ error: 'Failed to fetch users for booking' });
  }
});

// === HIGH-PERFORMANCE CUSTOMERS LIST (Keyset pagination + aggregated fields) ===
// GET /users/customers/list?q=&limit=&cursor=&balance=&friendsOnly=true
// Returns: { items: [...], nextCursor: string|null, totalHint?: number }
router.get('/customers/list', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const balanceFilter = (req.query.balance || 'all').toString(); // all|unpaid|paid|pending
    const friendsOnly = req.query.friendsOnly === 'true'; // Only show friends (for group booking)
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const cursor = req.query.cursor ? req.query.cursor.toString() : null; // last seen id for keyset
    const defaultCurrency = (process.env.DEFAULT_WALLET_CURRENCY || 'EUR').toUpperCase();
    const currentUserId = req.user?.id; // The authenticated user

    // Base filters: students, outsiders, managers, trusted_customers, exclude soft-deleted users
    const balanceColumn = 'COALESCE(wb.available_amount, u.balance, 0)';
    const whereClauses = ["r.name IN ('student', 'outsider', 'manager', 'trusted_customer')", "u.deleted_at IS NULL"];
    const params = [];

    // Friends-only filter: Only show users who are accepted friends of the current user
    if (friendsOnly && currentUserId) {
      params.push(currentUserId);
      whereClauses.push(`EXISTS (
        SELECT 1 FROM user_relationships rel
        WHERE rel.status = 'accepted'
        AND ((rel.sender_id = $${params.length} AND rel.receiver_id = u.id)
             OR (rel.receiver_id = $${params.length} AND rel.sender_id = u.id))
      )`);
    }

    // Text search: prefix/contains on name/email/phone using lower() to hit indexes
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      params.push(`%${q.toLowerCase()}%`);
      params.push(`%${q.toLowerCase()}%`);
      whereClauses.push(`(lower(u.first_name || ' ' || u.last_name) LIKE $${params.length - 2} OR lower(u.email) LIKE $${params.length - 1} OR lower(u.phone) LIKE $${params.length})`);
    }

    // Balance/payment filter
    if (balanceFilter === 'unpaid') {
      whereClauses.push(`(${balanceColumn} < 0)`);
    } else if (balanceFilter === 'paid') {
      whereClauses.push(`(${balanceColumn} >= 0)`);
    } else if (balanceFilter === 'pending') {
      // We’ll post-filter via pending_count > 0; keep all here to allow index use
    }

    // Keyset pagination: order by u.id DESC; when cursor is provided, fetch records with id < cursor
    if (cursor) {
      params.push(cursor);
      whereClauses.push(`u.id < $${params.length}`);
    }

    const currencyParamIndex = params.length + 1;

    // Compose SQL - join wallet_balances using EUR (storage currency)
    // NOTE: All financial data is stored in EUR. The preferred_currency is only for display purposes.
  const sql = `
      SELECT 
        u.id,
        COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.name) AS name,
        u.email,
        u.phone,
        r.name AS role,
        ${balanceColumn} AS balance,
        COALESCE(u.preferred_currency, $${currencyParamIndex}) AS preferred_currency,
        u.created_at,
        COALESCE(pb.pending_count, 0) AS pending_count
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN wallet_balances wb
        ON wb.user_id = u.id
       AND wb.currency = 'EUR'
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS pending_count
        FROM bookings b
        WHERE b.student_user_id = u.id AND b.payment_status = 'pending' AND b.deleted_at IS NULL
      ) pb ON TRUE
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY u.id DESC
      LIMIT $${params.length + 2}
    `;

    params.push(defaultCurrency);
    // SEC-013 FIX: Use parameterized query for LIMIT value
    params.push(limit + 1);

    const { rows } = await pool.query(sql, params);

    // Determine next cursor
    let nextCursor = null;
    let items = rows;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      nextCursor = last.id;
      items = rows.slice(0, limit);
    }

    // If balanceFilter === 'pending', filter items with pending_count > 0 (small page in memory)
    if (balanceFilter === 'pending') {
      items = items.filter(r => (r.pending_count || 0) > 0);
    }

    // Compute client-facing payment_status per record without extra queries
    // Note: This is about customer account balance status, not individual booking payments
  const mapped = items.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      balance: Number(r.balance) || 0,
      preferred_currency: r.preferred_currency,
      payment_status: (Number(r.balance) || 0) < 0 ? 'overdue' : ((r.pending_count || 0) > 0 ? 'pending' : 'paid'),
    }));

    res.json({ items: mapped, nextCursor });
  } catch (err) {
    logger.error('Error fetching customers list:', err);
    res.status(500).json({ error: 'Failed to fetch customers list', details: err.message });
  }
});

// === USER PREFERENCES ===
// GET /users/preferences - Get current user's preferences
router.get('/preferences', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user preferences from user_preferences table or return defaults
    const result = await pool.query(`
      SELECT 
        email_notifications,
        sms_notifications,
        push_notifications,
        language,
        timezone,
        preferred_currency
      FROM user_preferences
      WHERE user_id = $1
    `, [userId]);
    
    if (result.rows.length > 0) {
      const prefs = result.rows[0];
      res.json({
        emailNotifications: prefs.email_notifications ?? true,
        smsNotifications: prefs.sms_notifications ?? false,
        pushNotifications: prefs.push_notifications ?? true,
        language: prefs.language || 'en',
        timezone: prefs.timezone || 'UTC',
        preferredCurrency: prefs.preferred_currency || 'EUR'
      });
    } else {
      // Return defaults
      res.json({
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: true,
        language: 'en',
        timezone: 'UTC',
        preferredCurrency: 'EUR'
      });
    }
  } catch (err) {
    logger.error('Error fetching user preferences:', err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// PUT /users/preferences - Update current user's preferences
router.put('/preferences', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      emailNotifications,
      smsNotifications,
      pushNotifications,
      language,
      timezone
    } = req.body;
    
    // Upsert user preferences
    const result = await pool.query(`
      INSERT INTO user_preferences (
        user_id,
        email_notifications,
        sms_notifications,
        push_notifications,
        language,
        timezone,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        email_notifications = COALESCE($2, user_preferences.email_notifications),
        sms_notifications = COALESCE($3, user_preferences.sms_notifications),
        push_notifications = COALESCE($4, user_preferences.push_notifications),
        language = COALESCE($5, user_preferences.language),
        timezone = COALESCE($6, user_preferences.timezone),
        updated_at = NOW()
      RETURNING *
    `, [
      userId,
      emailNotifications ?? true,
      smsNotifications ?? false,
      pushNotifications ?? true,
      language || 'en',
      timezone || 'UTC'
    ]);
    
    const prefs = result.rows[0];
    res.json({
      emailNotifications: prefs.email_notifications,
      smsNotifications: prefs.sms_notifications,
      pushNotifications: prefs.push_notifications,
      language: prefs.language,
      timezone: prefs.timezone,
      message: 'Preferences updated successfully'
    });
  } catch (err) {
    logger.error('Error updating user preferences:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// === READ ONE USER ===
// Allow all authenticated users to view their own profile, admins/managers can view any profile
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const requestedUserId = req.params.id;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;
    
    // Users can only view their own profile unless they are admin/manager
    if (requestedUserId !== String(currentUserId) && 
        !['admin', 'manager'].includes(currentUserRole)) {
      return res.status(403).json({ error: 'Access denied. You can only view your own profile.' });
    }
    
    const { rows } = await pool.query(`
      SELECT u.*, r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
    `, [requestedUserId]);

    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Query failed' });
  }
});

// === UPDATE USER ===
// Allow users to update their own profile, admins/managers can update any profile
router.put('/:id', authenticateJWT, async (req, res) => {
  const requestedUserId = req.params.id;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;
  
  // Users can only update their own profile unless they are admin/manager
  if (requestedUserId !== String(currentUserId) && 
      !['admin', 'manager'].includes(currentUserRole)) {
    return res.status(403).json({ error: 'Access denied. You can only update your own profile.' });
  }
  
  const { password, role_id } = req.body; // Add role_id here

  try {
    // Mevcut role_id'yi DB'den al
    const userQueryRes = await pool.query(`SELECT u.role_id, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [req.params.id]);
    if (!userQueryRes.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUserData = userQueryRes.rows[0];
    let roleNameToUseForFields = currentUserData.role_name;

    // If role_id is being changed, and the updater is an admin, use the new role's allowed fields
    if (role_id && req.user.role === 'admin' && role_id !== currentUserData.role_id) {
      const newRoleRes = await pool.query('SELECT name FROM roles WHERE id = $1', [role_id]);
      if (!newRoleRes.rows.length) {
        return res.status(400).json({ error: 'Invalid new role_id provided' });
      }
      roleNameToUseForFields = newRoleRes.rows[0].name;
      console.log(`Admin is changing role. Using fields for new role: ${roleNameToUseForFields}`);
    }

    const allowedFields = getAllowedFieldsByRole(roleNameToUseForFields);
    const updateData = {};

    // Populate updateData with allowed fields from req.body
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    }
    
    // Handle name concatenation for instructor or if first_name/last_name are provided
    if ((roleNameToUseForFields === 'instructor' || req.body.first_name || req.body.last_name) && (req.body.first_name || req.body.last_name)) {
      const firstName = req.body.first_name || currentUserData.first_name; // Use existing if not provided
      const lastName = req.body.last_name || currentUserData.last_name;   // Use existing if not provided
      if (firstName && lastName) {
        updateData.name = `${firstName} ${lastName}`;
      }
    }

    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    // If role_id is provided and the user is an admin, add it to updateData
    if (role_id && req.user.role === 'admin') {
      updateData.role_id = role_id;
    }

    const fields = Object.keys(updateData);
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    const values = Object.values(updateData);
    const assignments = fields.map((key, i) => `${key} = $${i + 1}`);

    assignments.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const query = `
      UPDATE users
      SET ${assignments.join(', ')}
      WHERE id = $${fields.length + 1}
      RETURNING *`;

    const { rows } = await pool.query(query, values);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const updatedUser = rows[0];
    
    // Broadcast real-time event for user update, especially important for instructors
    if (req.socketService) {
      try {
        // Get the user's role to emit appropriate events
        const roleRes = await pool.query('SELECT name FROM roles WHERE id = $1', [updatedUser.role_id]);
        const roleName = roleRes.rows[0]?.name;
        
        if (roleName === 'instructor') {
          req.socketService.emitInstructorUpdated(updatedUser);
        } else {
          req.socketService.emitToChannel('general', 'user:updated', {
            user: updatedUser,
            role: roleName
          });
        }
      } catch (socketError) {
        console.error('Error broadcasting user update:', socketError);
      }
    }

    res.json(updatedUser);
  } catch (err) {
    console.error('Update failed:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// === GET USER RELATED DATA SUMMARY ===
// Returns all related records for a user (for deletion preview)
router.get('/:id/related-data', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Check if user exists
    const userCheck = await pool.query('SELECT id, first_name, last_name, email FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userCheck.rows[0];
    
    // Get all related data counts and samples
    const [
      transactionsResult,
      walletTransactionsResult,
      bookingsResult,
      packagesResult,
      rentalsResult,
      walletBalanceResult
    ] = await Promise.all([
      // Legacy transactions
      pool.query(
        `SELECT id, amount, description, created_at 
         FROM transactions WHERE user_id = $1 
         ORDER BY created_at DESC LIMIT 5`,
        [userId]
      ),
      // Wallet transactions
      pool.query(
        `SELECT id, amount, transaction_type, description, created_at, currency
         FROM wallet_transactions WHERE user_id = $1 
         ORDER BY created_at DESC LIMIT 10`,
        [userId]
      ),
      // Bookings (non-deleted) - using correct column names: date, start_hour
      pool.query(
        `SELECT b.id, b.date, b.start_hour, s.name as service_name, b.status
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         WHERE (b.customer_user_id = $1 OR b.student_user_id = $1) AND b.deleted_at IS NULL
         ORDER BY b.date DESC LIMIT 10`,
        [userId]
      ),
      // Customer packages - using correct column names: total_hours, used_hours, remaining_hours
      pool.query(
        `SELECT cp.id, cp.remaining_hours, cp.total_hours, cp.package_name, cp.status, cp.created_at
         FROM customer_packages cp
         WHERE cp.customer_id = $1
         ORDER BY cp.created_at DESC LIMIT 10`,
        [userId]
      ),
      // Rentals - equipment_ids is jsonb, join differently
      pool.query(
        `SELECT r.id, r.start_date, r.end_date, r.equipment_ids, r.equipment_details, r.status
         FROM rentals r
         WHERE r.user_id = $1
         ORDER BY r.created_at DESC LIMIT 10`,
        [userId]
      ),
      // Wallet balance
      pool.query(
        `SELECT currency, available_amount, pending_amount, non_withdrawable_amount
         FROM wallet_balances WHERE user_id = $1`,
        [userId]
      )
    ]);
    
    // Get total counts
    const [
      transactionsCount,
      walletTransactionsCount,
      bookingsCount,
      packagesCount,
      rentalsCount
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM transactions WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM wallet_transactions WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM bookings WHERE (customer_user_id = $1 OR student_user_id = $1) AND deleted_at IS NULL', [userId]),
      pool.query('SELECT COUNT(*) as count FROM customer_packages WHERE customer_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM rentals WHERE user_id = $1', [userId])
    ]);
    
    const summary = {
      user: {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email
      },
      counts: {
        transactions: parseInt(transactionsCount.rows[0].count) || 0,
        walletTransactions: parseInt(walletTransactionsCount.rows[0].count) || 0,
        bookings: parseInt(bookingsCount.rows[0].count) || 0,
        packages: parseInt(packagesCount.rows[0].count) || 0,
        rentals: parseInt(rentalsCount.rows[0].count) || 0
      },
      samples: {
        transactions: transactionsResult.rows,
        walletTransactions: walletTransactionsResult.rows,
        bookings: bookingsResult.rows,
        packages: packagesResult.rows,
        rentals: rentalsResult.rows
      },
      walletBalance: walletBalanceResult.rows[0] || null,
      hasAnyData: (
        parseInt(transactionsCount.rows[0].count) > 0 ||
        parseInt(walletTransactionsCount.rows[0].count) > 0 ||
        parseInt(bookingsCount.rows[0].count) > 0 ||
        parseInt(packagesCount.rows[0].count) > 0 ||
        parseInt(rentalsCount.rows[0].count) > 0
      )
    };
    
    res.json(summary);
  } catch (err) {
    logger.error('Error fetching user related data:', err);
    res.status(500).json({ error: 'Failed to fetch user related data', details: err.message });
  }
});

// === DELETE USER (SOFT DELETE) ===
// Soft deletes the user by setting deleted_at timestamp and anonymizing email.
// This allows the email to be reused for new registrations.
router.delete('/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  const hardDelete = String(req.query.hardDelete || '').toLowerCase() === 'true';
  const deleteAllData = String(req.query.deleteAllData || '').toLowerCase() === 'true';
  
  try {
    await client.query('BEGIN');
    
    const userId = req.params.id;
    const adminUserId = req.user.id;
    
    // Check if user exists and is not already deleted
    const userCheck = await client.query(
      'SELECT id, first_name, last_name, email, deleted_at FROM users WHERE id = $1', 
      [userId]
    );
    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (userCheck.rows[0].deleted_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'User is already deleted' });
    }
    
    const user = userCheck.rows[0];
    
    logger.info(`Attempting to delete user: ${user.first_name} ${user.last_name} (${userId})`, {
      hardDelete,
      deleteAllData
    });
    
    // For soft delete, we don't need to check related data or delete anything else
    // We simply mark the user as deleted and anonymize their email
    
    if (hardDelete) {
      // Hard delete path - existing behavior for data cleanup
      // Check for related data
      const [
        transactionsCheck,
        walletTransactionsCheck,
        bookingsCheck,
        packagesCheck,
        rentalsCheck,
        servicesCheck
      ] = await Promise.all([
        client.query('SELECT COUNT(*) as count FROM transactions WHERE user_id = $1', [userId]),
        client.query('SELECT COUNT(*) as count FROM wallet_transactions WHERE user_id = $1', [userId]),
        client.query('SELECT COUNT(*) as count FROM bookings WHERE (customer_user_id = $1 OR instructor_user_id = $1 OR student_user_id = $1) AND deleted_at IS NULL', [userId]),
        client.query('SELECT COUNT(*) as count FROM customer_packages WHERE customer_id = $1', [userId]),
        client.query('SELECT COUNT(*) as count FROM rentals WHERE user_id = $1', [userId]),
        client.query('SELECT COUNT(*) as count FROM instructor_services WHERE instructor_id = $1', [userId])
      ]);
      
      const relatedData = {
        transactions: parseInt(transactionsCheck.rows[0].count) || 0,
        walletTransactions: parseInt(walletTransactionsCheck.rows[0].count) || 0,
        bookings: parseInt(bookingsCheck.rows[0].count) || 0,
        packages: parseInt(packagesCheck.rows[0].count) || 0,
        rentals: parseInt(rentalsCheck.rows[0].count) || 0,
        services: parseInt(servicesCheck.rows[0].count) || 0
      };
      
      const hasRelatedData = Object.values(relatedData).some(count => count > 0);
      
      // If there's related data and not deleteAllData, return error with details
      if (hasRelatedData && !deleteAllData) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'User has related data',
          message: 'This user has related records. Use deleteAllData=true to hard delete all user data.',
          relatedData,
        code: 'HAS_RELATED_DATA'
      });
    }
    
    // If deleteAllData is true, delete all related records (for hard delete)
      if (deleteAllData) {
        logger.info(`Deleting all related data for user ${userId}...`);
        
        // Delete liability_waivers FIRST (before family_members due to check constraint)
        await client.query('DELETE FROM liability_waivers WHERE user_id = $1', [userId]);
        // Also delete waivers signed for family members of this user
        await client.query(`
          DELETE FROM liability_waivers 
          WHERE family_member_id IN (SELECT id FROM family_members WHERE parent_user_id = $1)
        `, [userId]);
        
        // Delete instructor_earnings for bookings that belong to this user (before bookings)
        await client.query(`
          DELETE FROM instructor_earnings 
          WHERE booking_id IN (SELECT id FROM bookings WHERE customer_user_id = $1 OR student_user_id = $1)
        `, [userId]);
        
        // Delete all related records in parallel batches for speed
        const batch1Results = await Promise.all([
          client.query('DELETE FROM wallet_transactions WHERE user_id = $1', [userId]),
          client.query('DELETE FROM wallet_balances WHERE user_id = $1', [userId]),
          client.query('DELETE FROM transactions WHERE user_id = $1', [userId]),
          client.query('DELETE FROM notifications WHERE user_id = $1', [userId]),
          client.query('DELETE FROM user_consents WHERE user_id = $1', [userId]),
          client.query('DELETE FROM instructor_services WHERE instructor_id = $1', [userId]),
          client.query('DELETE FROM financial_events WHERE user_id = $1', [userId]),
          client.query('DELETE FROM student_accounts WHERE user_id = $1', [userId]),
          client.query('DELETE FROM instructor_service_commissions WHERE instructor_id = $1', [userId]),
          client.query('DELETE FROM event_registrations WHERE user_id = $1', [userId]),
          client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]),
        ]);
        
        // Batch 2: Tables that might have other dependencies
        const batch2Results = await Promise.all([
          client.query('DELETE FROM bookings WHERE customer_user_id = $1 OR student_user_id = $1 OR instructor_user_id = $1', [userId]),
          client.query('DELETE FROM customer_packages WHERE customer_id = $1', [userId]),
          client.query('DELETE FROM rentals WHERE user_id = $1', [userId]),
          client.query('DELETE FROM family_members WHERE parent_user_id = $1', [userId]),
          client.query('DELETE FROM member_purchases WHERE user_id = $1', [userId]),
          client.query('DELETE FROM audit_logs WHERE user_id = $1 OR target_user_id = $1', [userId]),
        ]);
        
        const totalDeleted = [...batch1Results, ...batch2Results].reduce((sum, r) => sum + (r?.rowCount || 0), 0);
        logger.info(`Deleted ${totalDeleted} related record(s) in total`);
      }
      
      // Hard delete the user
      const deleteResult = await client.query('DELETE FROM users WHERE id = $1', [userId]);
      
      if (deleteResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      
      await client.query('COMMIT');
      logger.info(`Successfully hard deleted user: ${userId}`);
      return res.status(200).json({
        success: true,
        message: 'User permanently deleted',
        deletionType: 'hard'
      });
    }
    
    // DEFAULT: Soft delete - mark user as deleted and anonymize email
    // This preserves data integrity and allows email re-registration
    const anonymizedEmail = `deleted_${userId}_${Date.now()}@deleted.plannivo.local`;
    
    const softDeleteResult = await client.query(`
      UPDATE users 
      SET 
        deleted_at = NOW(),
        deleted_by = $2,
        original_email = email,
        email = $3,
        account_status = 'deleted',
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [userId, adminUserId, anonymizedEmail]);
    
    if (softDeleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found or already deleted' });
    }
    
    await client.query('COMMIT');
    logger.info(`Successfully soft deleted user: ${userId}, email anonymized`);
    res.status(200).json({
      success: true,
      message: 'User deleted successfully. Their email can now be used for new registrations.',
      deletionType: 'soft'
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Delete failed:', err);
    
    // Provide more specific error messages
    if (err.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: 'Cannot delete user due to related data',
        details: err.detail || 'User has related records that must be handled first',
        code: 'FOREIGN_KEY_CONSTRAINT'
      });
    }
    
    res.status(500).json({ 
      error: 'Delete failed',
      details: err.message 
    });
  } finally {
    client.release();
  }
});

// === UPLOAD AVATAR ===
// Disk storage config for avatars
const avatarsDir = path.resolve(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, avatarsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
  const requestedTarget = (req.body?.targetUserId || req.body?.userId || req.user?.id || 'anonymous').toString();
  const safeOwner = requestedTarget.replace(/[^a-zA-Z0-9_-]/g, '') || 'anonymous';
    const name = `${safeOwner}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const fileFilter = function (_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image uploads are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB

router.post('/upload-avatar', authenticateJWT, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const requestedTarget = (req.body?.targetUserId || req.body?.userId || '').toString().trim();
    const actingUserId = req.user?.id ? req.user.id.toString() : null;
    const actingRole = req.user?.role || null;

    let targetUserId = actingUserId;
    let targetIsSelf = true;

    if (requestedTarget) {
      targetUserId = requestedTarget;
      targetIsSelf = actingUserId && requestedTarget === actingUserId;
      if (!targetIsSelf && !['admin', 'manager'].includes((actingRole || '').toLowerCase())) {
        return res.status(403).json({ error: 'Forbidden: insufficient role to update another user avatar' });
      }
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Unable to determine which user to update avatar for' });
    }

    const relativePath = `/uploads/avatars/${req.file.filename}`;
    const started = Date.now();
    const logMeta = {
      action: 'avatar_upload',
      userId: targetUserId,
      actorId: actingUserId,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      dest: relativePath
    };
    logger.info('[avatar] File received', logMeta);

  // Persist avatar reference for the determined user
  let updatedUser = null;
    let rowsAffected = 0;
    try {
      const updateRes = await pool.query(
        `UPDATE users SET profile_image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, profile_image_url, role_id, email, first_name, last_name`,
        [relativePath, targetUserId]
      );
      rowsAffected = updateRes.rowCount;
      updatedUser = updateRes.rows[0] || null;
      logger.info('[avatar] DB update result', { targetUserId, rowsAffected, hasUser: !!updatedUser });

      // Broadcast socket event if available
      if (updatedUser && req.socketService) {
        try {
          const roleRes = await pool.query('SELECT name FROM roles WHERE id = $1', [updatedUser.role_id]);
          const roleName = roleRes.rows[0]?.name;
          req.socketService.emitToChannel('general', 'user:updated', { user: updatedUser, role: roleName });
        } catch (sockErr) {
          logger.error('[avatar] Socket broadcast failed', { error: sockErr.message });
        }
      }
    } catch (persistErr) {
      logger.error('[avatar] Failed to persist avatar URL', { error: persistErr.message, targetUserId });
    }

    const durationMs = Date.now() - started;
    res.json({
      url: relativePath,
      user: updatedUser,
      rowsAffected,
      targetUserId,
      updatedForSelf: targetIsSelf,
      cacheBust: Date.now(),
      durationMs
    });
  } catch (err) {
    console.error('Avatar upload failed:', err);
    res.status(500).json({ error: 'Avatar upload failed' });
  }
});

router.get('/avatar/debug/self', authenticateJWT, authorizeRoles(['admin','manager','instructor','student','freelancer']), async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    const { rows } = await pool.query('SELECT id, profile_image_url FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const record = rows[0];
    let fileExists = false;
    let absolutePath = null;
    if (record.profile_image_url) {
      // Convert /uploads/avatars/abc.png -> <cwd>/uploads/avatars/abc.png
      absolutePath = path.resolve(process.cwd(), record.profile_image_url.replace('/uploads/', 'uploads/'));
      fileExists = fs.existsSync(absolutePath);
    }
    res.json({
      userId: record.id,
      profile_image_url: record.profile_image_url,
      fileExists,
      absolutePath: fileExists ? absolutePath : null,
      cwd: process.cwd()
    });
  } catch (err) {
    logger.error('[avatar-debug] Failed', { error: err.message });
    res.status(500).json({ error: 'Avatar debug failed', details: err.message });
  }
});

// === USER-SPECIFIC ENDPOINTS FOR STUDENT ROLE ===

// GET customer (student/outsider) details by ID
router.get('/:id/student-details', async (req, res) => {
  try {
    const userQuery = `
      SELECT u.*, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND r.name IN ('student', 'outsider') AND u.deleted_at IS NULL
    `;
    
    const userResult = await pool.query(userQuery, [req.params.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Get bookings for this user
    const bookingsQuery = `
      SELECT b.*, 
             i.first_name as instructor_first_name, 
             i.last_name as instructor_last_name,
             cp.package_name as customer_package_name,
             CASE 
               WHEN b.payment_status = 'package' AND cp.package_name IS NOT NULL THEN cp.package_name
               WHEN b.payment_status = 'package' THEN 'Package Hours'
               WHEN b.payment_status = 'paid' AND b.amount > 0 THEN 'Individual Payment'
               ELSE 'Paid'
             END as payment_method_display
      FROM bookings b
      LEFT JOIN users i ON i.id = b.instructor_user_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      WHERE b.student_user_id = $1 AND b.deleted_at IS NULL
      ORDER BY b.date DESC
    `;
    
    const bookingsResult = await pool.query(bookingsQuery, [req.params.id]);
    
    // Get rentals for this user
    const rentalsQuery = `
      SELECT r.*
      FROM rentals r
      WHERE r.student_user_id = $1
      ORDER BY r.start_date DESC
    `;
    
    const rentalsResult = await pool.query(rentalsQuery, [req.params.id]);
    
    const user = userResult.rows[0];
    user.bookings = bookingsResult.rows;
    user.rentals = rentalsResult.rows;
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching user with student role details:', err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Import users with student role via CSV
router.post('/import-students', authenticateJWT, async (req, res) => {
  const { csvData } = req.body;
  if (!csvData) {
    return res.status(400).json({ error: 'CSV data is required' });
  }
  try {
    // Parse CSV data (simple parser)
    const lines = csvData.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    // Get student role id
    const roleRes = await pool.query("SELECT id FROM roles WHERE name='student'");
    const studentRoleId = roleRes.rows[0]?.id;
    if (!studentRoleId) {
      return res.status(500).json({ error: 'Student role not found' });
    }
    // Insert users
    const inserted = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const userData = {};
      headers.forEach((h, idx) => userData[h] = values[idx] || null);
      // Upsert by email
      const query = `INSERT INTO users (first_name, last_name, email, phone, role_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO NOTHING
        RETURNING *`;
      const params = [userData.first_name || userData.name, userData.last_name || '', userData.email, userData.phone, studentRoleId];
      const result = await pool.query(query, params);
      if (result.rows[0]) inserted.push(result.rows[0]);
    }
    res.json({ importedCount: inserted.length, users: inserted });
  } catch (err) {
    console.error('Error importing users with student role:', err);
    res.status(500).json({ error: 'Failed to import users' });
  }
});

// Get lessons for a user with student role
router.get('/:id/lessons', authenticateJWT, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bookings WHERE student_user_id = $1 AND deleted_at IS NULL ORDER BY date DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching lessons for user:', err);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// === PROMOTE USER ROLE ===
router.post('/:id/promote-role', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role_id, role_name } = req.body;
    
    if (!role_id && !role_name) {
      return res.status(400).json({ error: 'Either role_id or role_name is required' });
    }
    
    let targetRoleId = role_id;
    
    // If role_name is provided instead of role_id, look up the role_id
    if (!targetRoleId && role_name) {
      const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [role_name]);
      if (roleResult.rows.length === 0) {
        return res.status(400).json({ error: `Role '${role_name}' not found` });
      }
      targetRoleId = roleResult.rows[0].id;
    }
    
    // Verify the target role exists
    const roleVerification = await pool.query('SELECT name FROM roles WHERE id = $1', [targetRoleId]);
    if (roleVerification.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid role_id' });
    }
    
    const newRoleName = roleVerification.rows[0].name;
    
    // Get current user data
    const currentUserResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentUser = currentUserResult.rows[0];
    
    // Update the user's role
    const updateResult = await pool.query(
      `UPDATE users 
       SET role_id = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [targetRoleId, id]
    );
    
    const updatedUser = updateResult.rows[0];
    
    // Broadcast real-time event for role change
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'user:role_changed', {
          user: updatedUser,
          previousRole: currentUser.role_name,
          newRole: newRoleName,
          promotedBy: req.user.id
        });
        
        // If promoted to instructor, emit instructor-specific event
        if (newRoleName === 'instructor') {
          req.socketService.emitInstructorUpdated(updatedUser);
        }
      } catch (socketError) {
        console.error('Error broadcasting role change:', socketError);
      }
    }
    
    res.json({
      message: `User role successfully changed to ${newRoleName}`,
      user: updatedUser,
      previousRole: currentUser.role_name,
      newRole: newRoleName
    });
    
  } catch (err) {
    console.error('Role promotion failed:', err);
    res.status(500).json({ error: 'Role promotion failed', details: err.message });
  }
});

// === GET USER PACKAGES ===
// GET /users/:id/packages - Get packages for a specific user
router.get('/:id/packages', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { serviceName, serviceType, serviceCategory } = req.query;
    
    // Build query with optional service type and category filtering
    let query = `
      SELECT 
        id,
        package_name,
        total_hours,
        used_hours,
        remaining_hours,
        purchase_date,
        expiry_date,
        status,
        purchase_price,
        lesson_service_name,
        last_used_date
      FROM customer_packages
      WHERE customer_id = $1
    `;
    
    const queryParams = [userId];
    const conditions = [];
    
    // Filter by lesson type (group/private/semi-private) from serviceType field
    if (serviceType) {
      const normalizedType = serviceType.toLowerCase();
      let lessonType = null;
      
      if (normalizedType === 'group' || normalizedType.includes('group')) {
        lessonType = 'group';
      } else if (normalizedType === 'semi-private' || normalizedType === 'semi_private' || normalizedType.includes('semi')) {
        lessonType = 'semi';
      } else if (normalizedType === 'private' || normalizedType.includes('private')) {
        lessonType = 'private';
      }
      
      if (lessonType) {
        queryParams.push(`%${lessonType}%`);
        conditions.push(`LOWER(lesson_service_name) LIKE LOWER($${queryParams.length})`);
      }
    }
    
    // Filter by discipline (foil/wing/kitesurf) from serviceCategory or serviceName
    const disciplineSource = serviceCategory || serviceName || '';
    if (disciplineSource) {
      const normalized = disciplineSource.toLowerCase();
      let discipline = null;
      
      if (normalized.includes('foil')) {
        discipline = 'foil';
      } else if (normalized.includes('wing')) {
        discipline = 'wing';
      } else if (normalized.includes('kite')) {
        discipline = 'kite';
      } else if (normalized.includes('surf')) {
        discipline = 'surf';
      }
      
      if (discipline) {
        queryParams.push(`%${discipline}%`);
        conditions.push(`LOWER(lesson_service_name) LIKE LOWER($${queryParams.length})`);
      }
    }
    
    // Apply conditions
    if (conditions.length > 0) {
      query += ` AND (${conditions.join(' AND ')})`;
    }
    
    query += `
      ORDER BY 
        CASE 
          WHEN status = 'active' THEN 1
          WHEN status = 'used_up' THEN 2
          ELSE 3
        END,
        purchase_date DESC
    `;
    
    const result = await pool.query(query, queryParams);
    
    res.json(result.rows);
    
  } catch (err) {
    console.error('Error fetching user packages:', err);
    res.status(500).json({ error: 'Failed to fetch user packages', details: err.message });
  }
});

export default router;