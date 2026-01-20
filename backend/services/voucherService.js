/**
 * Voucher Service
 * 
 * Handles all voucher/promo code/gift business logic including:
 * - Code validation and eligibility checking
 * - Discount calculation for different voucher types
 * - Redemption tracking
 * - Wallet credit application
 * - Campaign management
 */

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Voucher types and their handlers
 */
const VOUCHER_TYPES = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
  WALLET_CREDIT: 'wallet_credit',
  FREE_SERVICE: 'free_service',
  PACKAGE_UPGRADE: 'package_upgrade'
};

/**
 * Application scopes
 */
const APPLIES_TO = {
  ALL: 'all',
  LESSONS: 'lessons',
  RENTALS: 'rentals',
  ACCOMMODATION: 'accommodation',
  PACKAGES: 'packages',
  WALLET: 'wallet',
  SPECIFIC: 'specific'
};

/**
 * Get voucher by code (case-insensitive)
 * @param {string} code - The voucher code
 * @returns {Object|null} The voucher or null
 */
export async function getVoucherByCode(code) {
  const result = await pool.query(
    `SELECT * FROM voucher_codes WHERE UPPER(code) = UPPER($1)`,
    [code]
  );
  return result.rows[0] || null;
}

/**
 * Get voucher by ID
 * @param {string} id - The voucher UUID
 * @returns {Object|null} The voucher or null
 */
export async function getVoucherById(id) {
  const result = await pool.query(
    `SELECT * FROM voucher_codes WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Check if a user has already used a voucher
 * @param {string} voucherId - The voucher UUID
 * @param {string} userId - The user UUID
 * @returns {number} Number of times used by this user
 */
export async function getUserRedemptionCount(voucherId, userId) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM voucher_redemptions 
     WHERE voucher_id = $1 AND user_id = $2 AND status = 'completed'`,
    [voucherId, userId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Check if user is a first-time purchaser
 * @param {string} userId - The user UUID
 * @returns {boolean} True if user has no prior purchases
 */
export async function isFirstTimePurchaser(userId) {
  // Check bookings
  const bookings = await pool.query(
    `SELECT 1 FROM bookings WHERE user_id = $1 AND status != 'cancelled' LIMIT 1`,
    [userId]
  );
  if (bookings.rows.length > 0) return false;
  
  // Check customer packages
  const packages = await pool.query(
    `SELECT 1 FROM customer_packages WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [userId]
  );
  if (packages.rows.length > 0) return false;
  
  // Check rentals
  const rentals = await pool.query(
    `SELECT 1 FROM rentals WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (rentals.rows.length > 0) return false;
  
  return true;
}

/**
 * Check if user is assigned a private voucher
 * @param {string} voucherId - The voucher UUID
 * @param {string} userId - The user UUID
 * @returns {boolean} True if user is assigned or voucher is not private
 */
export async function isUserAssignedVoucher(voucherId, userId) {
  const voucher = await getVoucherById(voucherId);
  if (!voucher) return false;
  
  // Public vouchers don't need assignment
  if (voucher.visibility === 'public') return true;
  
  // Check allowed_user_ids array
  if (voucher.allowed_user_ids && Array.isArray(voucher.allowed_user_ids)) {
    if (voucher.allowed_user_ids.includes(userId)) return true;
  }
  
  // Check user_vouchers table for private assignment
  const result = await pool.query(
    `SELECT 1 FROM user_vouchers 
     WHERE voucher_id = $1 AND user_id = $2 AND is_available = true`,
    [voucherId, userId]
  );
  
  return result.rows.length > 0;
}

/**
 * Check if user role is allowed for this voucher
 * @param {Object} voucher - The voucher object
 * @param {string} userRole - The user's role
 * @returns {boolean} True if role is allowed
 */
export function isRoleAllowed(voucher, userRole) {
  if (voucher.visibility !== 'role_based') return true;
  if (!voucher.allowed_roles || !Array.isArray(voucher.allowed_roles)) return true;
  if (voucher.allowed_roles.length === 0) return true;
  
  return voucher.allowed_roles.includes(userRole);
}

/**
 * Validate a voucher code for a specific context
 * @param {Object} params - Validation parameters
 * @param {string} params.code - The voucher code
 * @param {string} params.userId - The user ID
 * @param {string} params.userRole - The user's role
 * @param {string} params.context - Application context (lessons, rentals, accommodation, packages, wallet)
 * @param {number} params.amount - Purchase amount for minimum check
 * @param {string} [params.serviceId] - Specific service ID for targeted vouchers
 * @param {string} [params.currency] - Currency code (default EUR)
 * @returns {Object} Validation result with voucher details or error
 */
export async function validateVoucher({ code, userId, userRole, context, amount, serviceId, currency = 'EUR' }) {
  try {
    // Get the voucher
    const voucher = await getVoucherByCode(code);
    
    if (!voucher) {
      return { valid: false, error: 'INVALID_CODE', message: 'This voucher code does not exist' };
    }
    
    // Check if active
    if (!voucher.is_active) {
      return { valid: false, error: 'INACTIVE', message: 'This voucher is no longer active' };
    }
    
    // Check date validity
    const now = new Date();
    if (voucher.valid_from && new Date(voucher.valid_from) > now) {
      return { valid: false, error: 'NOT_YET_VALID', message: 'This voucher is not yet active' };
    }
    if (voucher.valid_until && new Date(voucher.valid_until) < now) {
      return { valid: false, error: 'EXPIRED', message: 'This voucher has expired' };
    }
    
    // Check max total uses
    if (voucher.max_total_uses && voucher.total_uses >= voucher.max_total_uses) {
      return { valid: false, error: 'FULLY_REDEEMED', message: 'This voucher has reached its maximum uses' };
    }
    
    // Check user-specific usage limits
    const userUsageCount = await getUserRedemptionCount(voucher.id, userId);
    
    if (voucher.usage_type === 'single_global' && voucher.total_uses >= 1) {
      return { valid: false, error: 'ALREADY_USED', message: 'This voucher has already been used' };
    }
    
    if (voucher.usage_type === 'single_per_user' && userUsageCount >= 1) {
      return { valid: false, error: 'ALREADY_USED_BY_USER', message: 'You have already used this voucher' };
    }
    
    if (voucher.max_uses_per_user && userUsageCount >= voucher.max_uses_per_user) {
      return { valid: false, error: 'USER_LIMIT_REACHED', message: 'You have reached the maximum uses for this voucher' };
    }
    
    // Check visibility and access
    if (voucher.visibility === 'private') {
      const isAssigned = await isUserAssignedVoucher(voucher.id, userId);
      if (!isAssigned) {
        return { valid: false, error: 'NOT_AUTHORIZED', message: 'This voucher is not available for your account' };
      }
    }
    
    if (!isRoleAllowed(voucher, userRole)) {
      return { valid: false, error: 'ROLE_NOT_ALLOWED', message: 'This voucher is not available for your account type' };
    }
    
    // Check first purchase requirement
    if (voucher.requires_first_purchase) {
      const isFirst = await isFirstTimePurchaser(userId);
      if (!isFirst) {
        return { valid: false, error: 'NOT_FIRST_PURCHASE', message: 'This voucher is only valid for first-time purchases' };
      }
    }
    
    // Check application scope
    if (voucher.applies_to !== 'all' && voucher.applies_to !== context) {
      return { 
        valid: false, 
        error: 'WRONG_CONTEXT', 
        message: `This voucher can only be used for ${voucher.applies_to}` 
      };
    }
    
    // Check specific service ID for targeted vouchers
    if (voucher.applies_to === 'specific' && serviceId) {
      const appliesIds = voucher.applies_to_ids || [];
      if (!appliesIds.includes(serviceId)) {
        return { valid: false, error: 'NOT_APPLICABLE', message: 'This voucher cannot be applied to this item' };
      }
    }
    
    // Check excluded services
    if (voucher.excludes_ids && Array.isArray(voucher.excludes_ids) && serviceId) {
      if (voucher.excludes_ids.includes(serviceId)) {
        return { valid: false, error: 'EXCLUDED_ITEM', message: 'This voucher cannot be applied to this item' };
      }
    }
    
    // Check minimum purchase amount
    if (voucher.min_purchase_amount && amount < voucher.min_purchase_amount) {
      return { 
        valid: false, 
        error: 'MINIMUM_NOT_MET', 
        message: `Minimum purchase of ${voucher.min_purchase_amount} ${voucher.currency || 'EUR'} required` 
      };
    }
    
    // Check currency compatibility (for fixed amount vouchers)
    if (voucher.voucher_type === VOUCHER_TYPES.FIXED_AMOUNT || 
        voucher.voucher_type === VOUCHER_TYPES.WALLET_CREDIT) {
      if (voucher.currency && voucher.currency !== currency) {
        return { 
          valid: false, 
          error: 'CURRENCY_MISMATCH', 
          message: `This voucher is only valid for ${voucher.currency} purchases` 
        };
      }
    }
    
    // Calculate the discount
    const discountInfo = calculateDiscount(voucher, amount, currency);
    
    // Voucher is valid!
    return {
      valid: true,
      voucher: {
        id: voucher.id,
        code: voucher.code,
        name: voucher.name,
        type: voucher.voucher_type,
        description: voucher.description
      },
      discount: discountInfo
    };
    
  } catch (error) {
    logger.error('Error validating voucher', { code, userId, error: error.message });
    return { valid: false, error: 'SYSTEM_ERROR', message: 'Unable to validate voucher at this time' };
  }
}

/**
 * Calculate the discount amount for a voucher
 * @param {Object} voucher - The voucher object
 * @param {number} amount - The purchase amount
 * @param {string} currency - The currency code
 * @returns {Object} Discount details
 */
export function calculateDiscount(voucher, amount, currency = 'EUR') {
  const result = {
    type: voucher.voucher_type,
    originalAmount: amount,
    discountAmount: 0,
    finalAmount: amount,
    walletCredit: 0,
    freeService: null,
    packageUpgrade: null
  };
  
  switch (voucher.voucher_type) {
    case VOUCHER_TYPES.PERCENTAGE: {
      // Calculate percentage discount
      let discount = (amount * voucher.discount_value) / 100;
      
      // Apply max discount cap if set
      if (voucher.max_discount && discount > voucher.max_discount) {
        discount = voucher.max_discount;
      }
      
      result.discountAmount = Math.round(discount * 100) / 100; // Round to 2 decimals
      result.finalAmount = Math.max(0, amount - result.discountAmount);
      result.displayText = `${voucher.discount_value}% off`;
      break;
    }
    
    case VOUCHER_TYPES.FIXED_AMOUNT: {
      // Fixed amount discount
      result.discountAmount = Math.min(voucher.discount_value, amount);
      result.finalAmount = Math.max(0, amount - result.discountAmount);
      result.displayText = `${voucher.discount_value} ${voucher.currency || currency} off`;
      break;
    }
    
    case VOUCHER_TYPES.WALLET_CREDIT: {
      // Wallet credit doesn't affect purchase amount, just adds credit
      result.walletCredit = voucher.discount_value;
      result.displayText = `${voucher.discount_value} ${voucher.currency || currency} wallet credit`;
      break;
    }
    
    case VOUCHER_TYPES.FREE_SERVICE: {
      // Free service - the service ID is in applies_to_ids
      result.freeService = {
        serviceIds: voucher.applies_to_ids || [],
        description: voucher.description
      };
      result.displayText = 'Free service included';
      break;
    }
    
    case VOUCHER_TYPES.PACKAGE_UPGRADE: {
      // Package upgrade details in metadata
      result.packageUpgrade = voucher.metadata || {};
      result.displayText = 'Package upgrade';
      break;
    }
    
    default:
      result.displayText = 'Discount applied';
  }
  
  return result;
}

/**
 * Redeem a voucher (record the usage)
 * @param {Object} params - Redemption parameters
 * @param {string} params.voucherId - The voucher UUID
 * @param {string} params.userId - The user UUID
 * @param {string} params.referenceType - Type of transaction (booking, package, rental, wallet)
 * @param {string} params.referenceId - ID of the related transaction
 * @param {number} params.originalAmount - Original purchase amount
 * @param {number} params.discountAmount - Discount applied
 * @param {string} [params.currency] - Currency code
 * @param {Object} [client] - Database client for transaction
 * @returns {Object} Redemption record
 */
export async function redeemVoucher({ 
  voucherId, 
  userId, 
  referenceType, 
  referenceId, 
  originalAmount, 
  discountAmount,
  currency = 'EUR',
  client = null 
}) {
  const db = client || pool;
  
  try {
    // Create redemption record
    const redemptionResult = await db.query(
      `INSERT INTO voucher_redemptions (
        voucher_id, user_id, reference_type, reference_id,
        original_amount, discount_applied, currency, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
      RETURNING *`,
      [voucherId, userId, referenceType, referenceId, originalAmount, discountAmount, currency]
    );
    
    // Increment total_uses counter
    await db.query(
      `UPDATE voucher_codes SET total_uses = total_uses + 1, updated_at = NOW() WHERE id = $1`,
      [voucherId]
    );
    
    // If user has this voucher in user_vouchers (private voucher), mark as used
    await db.query(
      `UPDATE user_vouchers 
       SET is_available = false, redeemed_at = NOW() 
       WHERE voucher_id = $1 AND user_id = $2 AND is_available = true`,
      [voucherId, userId]
    );
    
    logger.info('Voucher redeemed successfully', {
      voucherId,
      userId,
      referenceType,
      referenceId,
      discountAmount
    });
    
    return redemptionResult.rows[0];
    
  } catch (error) {
    logger.error('Error redeeming voucher', { voucherId, userId, error: error.message });
    throw error;
  }
}

/**
 * Apply wallet credit from a voucher
 * @param {string} userId - The user UUID
 * @param {number} amount - Credit amount
 * @param {string} voucherId - Source voucher ID
 * @param {string} currency - Currency code
 * @param {Object} [client] - Database client for transaction
 * @returns {Object} Wallet transaction record
 */
export async function applyWalletCredit(userId, amount, voucherId, currency = 'EUR', client = null) {
  const db = client || pool;
  
  try {
    // Get or create wallet
    let wallet = await db.query(
      `SELECT * FROM wallets WHERE user_id = $1`,
      [userId]
    );
    
    if (wallet.rows.length === 0) {
      wallet = await db.query(
        `INSERT INTO wallets (user_id, balance, currency) VALUES ($1, 0, $2) RETURNING *`,
        [userId, currency]
      );
    }
    
    const walletId = wallet.rows[0].id;
    
    // Add credit transaction
    const transaction = await db.query(
      `INSERT INTO wallet_transactions (
        wallet_id, user_id, type, amount, currency, 
        description, status, reference_type, reference_id
      ) VALUES ($1, $2, 'credit', $3, $4, $5, 'completed', 'voucher', $6)
      RETURNING *`,
      [walletId, userId, amount, currency, 'Voucher credit', voucherId]
    );
    
    // Update wallet balance
    await db.query(
      `UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [amount, walletId]
    );
    
    logger.info('Wallet credit applied from voucher', { userId, amount, voucherId });
    
    return transaction.rows[0];
    
  } catch (error) {
    logger.error('Error applying wallet credit', { userId, amount, voucherId, error: error.message });
    throw error;
  }
}

// ============ Admin Functions ============

/**
 * Create a new voucher code
 * @param {Object} voucherData - Voucher details
 * @param {string} createdBy - Admin user ID
 * @returns {Object} Created voucher
 */
export async function createVoucher(voucherData, createdBy) {
  const {
    code,
    name,
    description,
    voucher_type,
    discount_value,
    max_discount,
    min_purchase_amount,
    currency = 'EUR',
    applies_to = 'all',
    applies_to_ids,
    excludes_ids,
    usage_type = 'multi_limited',
    max_total_uses,
    max_uses_per_user = 1,
    valid_from,
    valid_until,
    is_active = true,
    visibility = 'public',
    requires_first_purchase = false,
    allowed_roles,
    allowed_user_ids,
    can_combine = false,
    campaign_id,
    metadata
  } = voucherData;
  
  // Validate unique code
  const existing = await getVoucherByCode(code);
  if (existing) {
    throw new Error('A voucher with this code already exists');
  }
  
  const result = await pool.query(
    `INSERT INTO voucher_codes (
      code, name, description, voucher_type, discount_value, max_discount,
      min_purchase_amount, currency, applies_to, applies_to_ids, excludes_ids,
      usage_type, max_total_uses, max_uses_per_user, valid_from, valid_until,
      is_active, visibility, requires_first_purchase, allowed_roles, 
      allowed_user_ids, can_combine, campaign_id, metadata, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
    RETURNING *`,
    [
      code.toUpperCase(),
      name,
      description,
      voucher_type,
      discount_value,
      max_discount,
      min_purchase_amount,
      currency,
      applies_to,
      applies_to_ids ? JSON.stringify(applies_to_ids) : null,
      excludes_ids ? JSON.stringify(excludes_ids) : null,
      usage_type,
      max_total_uses,
      max_uses_per_user,
      valid_from,
      valid_until,
      is_active,
      visibility,
      requires_first_purchase,
      allowed_roles ? JSON.stringify(allowed_roles) : null,
      allowed_user_ids ? JSON.stringify(allowed_user_ids) : null,
      can_combine,
      campaign_id,
      metadata ? JSON.stringify(metadata) : null,
      createdBy
    ]
  );
  
  logger.info('Voucher created', { code: code.toUpperCase(), createdBy });
  
  return result.rows[0];
}

/**
 * Update a voucher
 * @param {string} id - Voucher UUID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated voucher
 */
export async function updateVoucher(id, updates) {
  const allowedFields = [
    'name', 'description', 'discount_value', 'max_discount', 'min_purchase_amount',
    'applies_to', 'applies_to_ids', 'excludes_ids', 'max_total_uses', 'max_uses_per_user',
    'valid_from', 'valid_until', 'is_active', 'visibility', 'requires_first_purchase',
    'allowed_roles', 'allowed_user_ids', 'can_combine', 'campaign_id', 'metadata'
  ];
  
  const setClauses = [];
  const values = [];
  let paramIndex = 1;
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      
      // JSON fields need stringify
      if (['applies_to_ids', 'excludes_ids', 'allowed_roles', 'allowed_user_ids', 'metadata'].includes(key)) {
        values.push(value ? JSON.stringify(value) : null);
      } else {
        values.push(value);
      }
      paramIndex++;
    }
  }
  
  if (setClauses.length === 0) {
    return getVoucherById(id);
  }
  
  setClauses.push(`updated_at = NOW()`);
  values.push(id);
  
  const result = await pool.query(
    `UPDATE voucher_codes SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  
  return result.rows[0];
}

/**
 * Delete a voucher (soft delete by setting is_active = false)
 * @param {string} id - Voucher UUID
 * @returns {boolean} Success
 */
export async function deleteVoucher(id) {
  await pool.query(
    `UPDATE voucher_codes SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [id]
  );
  return true;
}

/**
 * List vouchers with filters
 * @param {Object} filters - Filter options
 * @returns {Object} Paginated voucher list
 */
export async function listVouchers(filters = {}) {
  const {
    page = 1,
    limit = 20,
    is_active,
    voucher_type,
    visibility,
    campaign_id,
    search
  } = filters;
  
  const conditions = [];
  const values = [];
  let paramIndex = 1;
  
  if (is_active !== undefined) {
    conditions.push(`vc.is_active = $${paramIndex++}`);
    values.push(is_active);
  }
  
  if (voucher_type) {
    conditions.push(`vc.voucher_type = $${paramIndex++}`);
    values.push(voucher_type);
  }
  
  if (visibility) {
    conditions.push(`vc.visibility = $${paramIndex++}`);
    values.push(visibility);
  }
  
  if (campaign_id) {
    conditions.push(`vc.campaign_id = $${paramIndex++}`);
    values.push(campaign_id);
  }
  
  if (search) {
    conditions.push(`(vc.code ILIKE $${paramIndex} OR vc.name ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM voucher_codes vc ${whereClause}`,
    values
  );
  
  const total = parseInt(countResult.rows[0].count, 10);
  const offset = (page - 1) * limit;
  
  values.push(limit, offset);
  
  const result = await pool.query(
    `SELECT vc.*, 
            u.first_name || ' ' || u.last_name as created_by_name,
            camp.name as campaign_name
     FROM voucher_codes vc
     LEFT JOIN users u ON vc.created_by = u.id
     LEFT JOIN voucher_campaigns camp ON vc.campaign_id = camp.id
     ${whereClause}
     ORDER BY vc.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    values
  );
  
  return {
    vouchers: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Generate bulk voucher codes
 * @param {Object} params - Generation parameters
 * @param {number} params.count - Number of codes to generate
 * @param {string} params.prefix - Code prefix
 * @param {Object} params.template - Voucher template (same as createVoucher params minus code)
 * @param {string} createdBy - Admin user ID
 * @returns {Array} Generated vouchers
 */
export async function generateBulkVouchers({ count, prefix = '', template }, createdBy) {
  const vouchers = [];
  
  for (let i = 0; i < count; i++) {
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const code = `${prefix}${randomPart}`;
    
    try {
      const voucher = await createVoucher({ ...template, code }, createdBy);
      vouchers.push(voucher);
    } catch (error) {
      // If duplicate, retry with different code
      if (error.message.includes('already exists')) {
        i--; // Retry this iteration
        continue;
      }
      throw error;
    }
  }
  
  return vouchers;
}

/**
 * Assign a private voucher to a user
 * @param {string} voucherId - Voucher UUID
 * @param {string} userId - User UUID
 * @param {string} [source] - Source of assignment (admin, referral, etc.)
 * @returns {Object} Assignment record
 */
export async function assignVoucherToUser(voucherId, userId, source = 'admin') {
  const result = await pool.query(
    `INSERT INTO user_vouchers (voucher_id, user_id, source)
     VALUES ($1, $2, $3)
     ON CONFLICT (voucher_id, user_id) DO UPDATE SET is_available = true, assigned_at = NOW()
     RETURNING *`,
    [voucherId, userId, source]
  );
  
  return result.rows[0];
}

/**
 * Get vouchers assigned to a user
 * @param {string} userId - User UUID
 * @param {boolean} onlyAvailable - Only return available vouchers
 * @returns {Array} User's vouchers
 */
export async function getUserVouchers(userId, onlyAvailable = true) {
  const availableCondition = onlyAvailable ? 'AND uv.is_available = true' : '';
  
  const result = await pool.query(
    `SELECT vc.*, uv.assigned_at, uv.is_available, uv.redeemed_at
     FROM user_vouchers uv
     JOIN voucher_codes vc ON uv.voucher_id = vc.id
     WHERE uv.user_id = $1 
       AND vc.is_active = true
       AND (vc.valid_until IS NULL OR vc.valid_until > NOW())
       ${availableCondition}
     ORDER BY uv.assigned_at DESC`,
    [userId]
  );
  
  return result.rows;
}

/**
 * Get redemption history for a voucher
 * @param {string} voucherId - Voucher UUID
 * @returns {Array} Redemption records
 */
export async function getVoucherRedemptions(voucherId) {
  const result = await pool.query(
    `SELECT vr.*, u.first_name, u.last_name, u.email
     FROM voucher_redemptions vr
     JOIN users u ON vr.user_id = u.id
     WHERE vr.voucher_id = $1
     ORDER BY vr.redeemed_at DESC`,
    [voucherId]
  );
  
  return result.rows;
}

// ============ Campaign Functions ============

/**
 * Create a voucher campaign
 * @param {Object} campaignData - Campaign details
 * @param {string} createdBy - Admin user ID
 * @returns {Object} Created campaign
 */
export async function createCampaign(campaignData, createdBy) {
  const { name, description, start_date, end_date, budget, is_active = true, metadata } = campaignData;
  
  const result = await pool.query(
    `INSERT INTO voucher_campaigns (name, description, start_date, end_date, budget, is_active, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [name, description, start_date, end_date, budget, is_active, metadata ? JSON.stringify(metadata) : null, createdBy]
  );
  
  return result.rows[0];
}

/**
 * Get campaign statistics
 * @param {string} campaignId - Campaign UUID
 * @returns {Object} Campaign with statistics
 */
export async function getCampaignStats(campaignId) {
  const result = await pool.query(
    `SELECT 
      c.*,
      COUNT(DISTINCT v.id) as total_vouchers,
      SUM(v.total_uses) as total_redemptions,
      SUM(r.discount_applied) as total_discount_given
     FROM voucher_campaigns c
     LEFT JOIN voucher_codes v ON v.campaign_id = c.id
     LEFT JOIN voucher_redemptions r ON r.voucher_id = v.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [campaignId]
  );
  
  return result.rows[0];
}

export default {
  // Validation & redemption
  validateVoucher,
  calculateDiscount,
  redeemVoucher,
  applyWalletCredit,
  
  // Lookups
  getVoucherByCode,
  getVoucherById,
  getUserVouchers,
  getVoucherRedemptions,
  
  // Admin CRUD
  createVoucher,
  updateVoucher,
  deleteVoucher,
  listVouchers,
  generateBulkVouchers,
  assignVoucherToUser,
  
  // Campaigns
  createCampaign,
  getCampaignStats,
  
  // Constants
  VOUCHER_TYPES,
  APPLIES_TO
};
