import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { insertNotification } from './notificationWriter.js';

/**
 * Generate a unique link code
 * @returns {string} 8-character alphanumeric code
 */
function generateLinkCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Get all quick links (with optional filters)
 * @param {Object} filters - Optional filters
 * @param {string} userId - ID of requesting user
 * @returns {Promise<Array>} List of quick links
 */
export async function getQuickLinks({ service_type, is_active } = {}, userId) {
  const conditions = [];
  const params = [];
  let paramCount = 1;

  if (service_type) {
    conditions.push(`ql.service_type = $${paramCount++}`);
    params.push(service_type);
  }

  if (is_active !== undefined) {
    conditions.push(`ql.is_active = $${paramCount++}`);
    params.push(is_active);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      ql.*,
      u.first_name || ' ' || u.last_name as created_by_name,
      (SELECT COUNT(*) FROM quick_link_registrations qlr WHERE qlr.quick_link_id = ql.id) as registration_count
    FROM quick_links ql
    LEFT JOIN users u ON ql.created_by = u.id
    ${whereClause}
    ORDER BY ql.created_at DESC
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get a quick link by ID
 * @param {number} id - Quick link ID
 * @returns {Promise<Object|null>} Quick link or null
 */
export async function getQuickLinkById(id) {
  const query = `
    SELECT 
      ql.*,
      u.first_name || ' ' || u.last_name as created_by_name
    FROM quick_links ql
    LEFT JOIN users u ON ql.created_by = u.id
    WHERE ql.id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

/**
 * Get a quick link by code (for public access)
 * @param {string} code - Link code
 * @returns {Promise<Object|null>} Quick link or null
 */
export async function getQuickLinkByCode(code) {
  const query = `
    SELECT ql.*
    FROM quick_links ql
    WHERE ql.link_code = $1
      AND ql.is_active = true
      AND (ql.expires_at IS NULL OR ql.expires_at > NOW())
      AND (ql.max_uses IS NULL OR ql.use_count < ql.max_uses)
  `;
  const result = await pool.query(query, [code]);
  return result.rows[0] || null;
}

/**
 * Create a new quick link
 * @param {Object} data - Quick link data
 * @param {string} userId - ID of creating user
 * @returns {Promise<Object>} Created quick link
 */
export async function createQuickLink(data, userId) {
  const {
    name,
    description,
    service_type,
    service_id,
    expires_at,
    max_uses,
    require_payment,
    custom_fields
  } = data;

  // Generate unique link code
  let linkCode;
  let isUnique = false;
  while (!isUnique) {
    linkCode = generateLinkCode();
    const existing = await pool.query('SELECT id FROM quick_links WHERE link_code = $1', [linkCode]);
    isUnique = existing.rows.length === 0;
  }

  const query = `
    INSERT INTO quick_links (
      link_code, name, description, service_type, service_id,
      is_active, expires_at, max_uses, require_payment, custom_fields, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const result = await pool.query(query, [
    linkCode,
    name,
    description || null,
    service_type,
    service_id || null,
    true, // is_active defaults to true
    expires_at || null,
    max_uses || null,
    require_payment || false,
    JSON.stringify(custom_fields || {}),
    userId
  ]);

  logger.info(`Quick link created: ${linkCode} by user ${userId}`);
  return result.rows[0];
}

/**
 * Update a quick link
 * @param {number} id - Quick link ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated quick link
 */
export async function updateQuickLink(id, data) {
  const allowedFields = ['name', 'description', 'service_type', 'service_id', 'is_active', 'expires_at', 'max_uses', 'require_payment', 'custom_fields'];
  const updates = [];
  const params = [];
  let paramCount = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'custom_fields') {
        updates.push(`${field} = $${paramCount++}`);
        params.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramCount++}`);
        params.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    return getQuickLinkById(id);
  }

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const query = `
    UPDATE quick_links
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  logger.info(`Quick link ${id} updated`);
  return result.rows[0];
}

/**
 * Delete a quick link
 * @param {number} id - Quick link ID
 * @returns {Promise<boolean>} Success
 */
export async function deleteQuickLink(id) {
  const result = await pool.query('DELETE FROM quick_links WHERE id = $1', [id]);
  logger.info(`Quick link ${id} deleted`);
  return result.rowCount > 0;
}

/**
 * Get registrations for a quick link
 * @param {number} quickLinkId - Quick link ID
 * @returns {Promise<Array>} List of registrations
 */
export async function getRegistrations(quickLinkId) {
  const query = `
    SELECT 
      qlr.*,
      u.first_name || ' ' || u.last_name as linked_user_name
    FROM quick_link_registrations qlr
    LEFT JOIN users u ON qlr.user_id = u.id
    WHERE qlr.quick_link_id = $1
    ORDER BY qlr.created_at DESC
  `;
  const result = await pool.query(query, [quickLinkId]);
  return result.rows;
}

/**
 * Notify admins and managers about a new quick link registration
 * @param {Object} registration - Registration data
 * @param {Object} link - Quick link data
 * @param {Object} client - Database client (optional, for transaction)
 */
async function notifyAdminsAboutRegistration(registration, link, client = null) {
  const executor = client || pool;
  
  try {
    // Get all admin and manager users
    const adminQuery = `
      SELECT u.id, u.first_name, u.last_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name IN ('admin', 'manager')
        AND u.deleted_at IS NULL
    `;
    const adminResult = await executor.query(adminQuery);
    
    if (adminResult.rows.length === 0) {
      logger.warn('No admins/managers found to notify about quick link registration');
      return;
    }

    logger.info(`Found ${adminResult.rows.length} admins/managers to notify about registration`, {
      registrationId: registration.id,
      adminIds: adminResult.rows.map(a => a.id)
    });

    const registrantName = `${registration.first_name} ${registration.last_name}`;
    const serviceType = link.service_type || 'service';
    
    // Send notification to each admin/manager
    for (const admin of adminResult.rows) {
      const idempotencyKey = `quick-link-reg:${registration.id}:admin:${admin.id}`;
      
      logger.debug('Inserting quick link registration notification', {
        adminId: admin.id,
        registrationId: registration.id,
        idempotencyKey
      });
      
      const result = await insertNotification({
        userId: admin.id,
        title: 'New Quick Link Registration',
        message: `${registrantName} registered via quick link "${link.name}" for ${serviceType}`,
        type: 'quick_link_registration',
        data: {
          registrationId: registration.id,
          quickLinkId: link.id,
          quickLinkName: link.name,
          registrantName,
          registrantEmail: registration.email,
          serviceType: link.service_type,
          action: 'view_quick_link_registration',
          cta: {
            label: 'View Registration',
            href: `/admin/quick-links/${link.id}/registrations`
          }
        },
        idempotencyKey,
        client: executor
      });
      
      logger.info('Quick link notification insert result', { 
        adminId: admin.id, 
        result 
      });
    }
    
    logger.info(`Notified ${adminResult.rows.length} admins/managers about quick link registration`, {
      registrationId: registration.id,
      quickLinkId: link.id
    });
  } catch (error) {
    // Don't fail the registration if notification fails
    logger.error('Failed to send quick link registration notifications:', error.message);
  }
}

/**
 * Create a registration via quick link (public)
 * Does NOT create user account - admin will do that manually
 * @param {string} linkCode - Quick link code
 * @param {Object} data - Registration data
 * @returns {Promise<Object>} Created registration
 */
export async function createRegistration(linkCode, data) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get and validate quick link
    const linkResult = await client.query(
      `SELECT * FROM quick_links 
       WHERE link_code = $1 
       AND is_active = true 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR use_count < max_uses)
       FOR UPDATE`,
      [linkCode]
    );

    if (linkResult.rows.length === 0) {
      throw new Error('Invalid or expired link');
    }

    const link = linkResult.rows[0];
    const email = data.email.toLowerCase();

    // Check if already registered with this email for this link
    const existingReg = await client.query(
      'SELECT id FROM quick_link_registrations WHERE quick_link_id = $1 AND email = $2',
      [link.id, email]
    );

    if (existingReg.rows.length > 0) {
      throw new Error('You have already registered with this email');
    }

    // Create registration (without user account - admin will create it)
    const regQuery = `
      INSERT INTO quick_link_registrations (
        quick_link_id, first_name, last_name, email, phone, 
        additional_data, notes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `;

    const regResult = await client.query(regQuery, [
      link.id,
      data.first_name,
      data.last_name,
      email,
      data.phone ? `${data.phone_country_code || ''}${data.phone}` : null,
      JSON.stringify({
        ...data.additional_data,
        phone_country_code: data.phone_country_code
      } || {}),
      data.notes || null
    ]);

    // Increment use count
    await client.query(
      'UPDATE quick_links SET use_count = use_count + 1, updated_at = NOW() WHERE id = $1',
      [link.id]
    );

    await client.query('COMMIT');
    
    const registration = regResult.rows[0];
    
    logger.info(`Registration created via quick link ${linkCode}: ${email}`, { 
      registrationId: registration.id 
    });

    // Send notifications to admins/managers (after commit, non-blocking)
    notifyAdminsAboutRegistration(registration, link).catch(err => {
      logger.warn('Failed to notify admins about registration:', err.message);
    });

    return { 
      registration, 
      link
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create user account from registration (admin action)
 * @param {number} registrationId - Registration ID
 * @returns {Promise<Object>} Created user info
 */
export async function createUserFromRegistration(registrationId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get registration
    const regResult = await client.query(
      'SELECT * FROM quick_link_registrations WHERE id = $1',
      [registrationId]
    );

    if (regResult.rows.length === 0) {
      throw new Error('Registration not found');
    }

    const reg = regResult.rows[0];

    // Check if user already exists
    if (reg.user_id) {
      throw new Error('User account already exists for this registration');
    }

    const email = reg.email.toLowerCase();

    // Check if user with this email already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (existingUser.rows.length > 0) {
      // Link existing user to registration
      await client.query(
        'UPDATE quick_link_registrations SET user_id = $1, updated_at = NOW() WHERE id = $2',
        [existingUser.rows[0].id, registrationId]
      );
      await client.query('COMMIT');
      return { 
        userId: existingUser.rows[0].id, 
        userCreated: false, 
        message: 'Linked to existing user account' 
      };
    }

    // Get outsider role
    let outsiderRoleId;
    const roleResult = await client.query("SELECT id FROM roles WHERE name = 'outsider'");
    
    if (roleResult.rows.length === 0) {
      const createRoleResult = await client.query(`
        INSERT INTO roles (id, name, description, created_at, updated_at)
        VALUES ('e1a2b3c4-d5e6-47f8-9a0b-c1d2e3f4a5b6', 'outsider', 'Self-registered users with limited access', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET name = 'outsider'
        RETURNING id
      `);
      outsiderRoleId = createRoleResult.rows[0].id;
    } else {
      outsiderRoleId = roleResult.rows[0].id;
    }

    // Generate a temporary password
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Extract contact preference and phone country code from additional_data
    const additionalData = reg.additional_data || {};
    const contactPreference = additionalData.contact_preference || 'email';
    const phoneCountryCode = additionalData.phone_country_code || null;

    // Create user
    const userResult = await client.query(`
      INSERT INTO users (
        email, 
        password_hash, 
        name, 
        first_name, 
        last_name, 
        phone,
        phone_country_code,
        preferred_currency,
        role_id,
        registration_source,
        registration_complete,
        contact_preference,
        created_at, 
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'EUR', $8, 'quick_link', false, $9, NOW(), NOW())
      RETURNING id, email
    `, [
      email,
      hashedPassword,
      `${reg.first_name} ${reg.last_name}`,
      reg.first_name,
      reg.last_name,
      reg.phone || null,
      phoneCountryCode,
      outsiderRoleId,
      contactPreference
    ]);

    const userId = userResult.rows[0].id;

    // Create wallet for new user
    await client.query(
      `INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount)
       VALUES ($1, 'EUR', 0, 0, 0)
       ON CONFLICT (user_id, currency) DO NOTHING`,
      [userId]
    );

    // Link user to registration
    await client.query(
      'UPDATE quick_link_registrations SET user_id = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [userId, 'confirmed', registrationId]
    );

    await client.query('COMMIT');
    
    logger.info(`User account created from registration: ${email}`, { 
      userId, 
      registrationId,
      contactPreference
    });

    return { 
      userId, 
      email,
      userCreated: true,
      contactPreference,
      tempPassword, // Return temp password so admin can send it to user
      message: 'User account created successfully'
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update registration status
 * @param {number} id - Registration ID
 * @param {Object} data - Update data (status, notes)
 * @returns {Promise<Object>} Updated registration
 */
export async function updateRegistration(id, data) {
  const { status, notes, user_id } = data;
  const updates = ['updated_at = NOW()'];
  const params = [];
  let paramCount = 1;

  if (status) {
    updates.push(`status = $${paramCount++}`);
    params.push(status);
  }

  if (notes !== undefined) {
    updates.push(`notes = $${paramCount++}`);
    params.push(notes);
  }

  if (user_id) {
    updates.push(`user_id = $${paramCount++}`);
    params.push(user_id);
  }

  params.push(id);

  const query = `
    UPDATE quick_link_registrations
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  return result.rows[0];
}

/**
 * Delete a registration
 * @param {number} id - Registration ID
 * @returns {Promise<boolean>} Success
 */
export async function deleteRegistration(id) {
  const result = await pool.query('DELETE FROM quick_link_registrations WHERE id = $1', [id]);
  return result.rowCount > 0;
}

/**
 * Get quick link statistics
 * @returns {Promise<Object>} Statistics
 */
export async function getStatistics() {
  const query = `
    SELECT 
      COUNT(*) as total_links,
      COUNT(*) FILTER (WHERE is_active = true) as active_links,
      SUM(use_count) as total_registrations,
      COUNT(DISTINCT service_type) as service_types_used
    FROM quick_links
  `;
  const result = await pool.query(query);
  return result.rows[0];
}
