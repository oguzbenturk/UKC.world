/**
 * Waiver Service
 * 
 * Business logic for liability waiver management:
 * - Signature submission and storage
 * - Waiver status checking
 * - Version management
 * - IP address and user agent capture
 * - Signature image storage
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import {
  logWaiverModification
} from './auditLogService.js';
import {
  dispatchWaiverSigned
} from './waiverNotificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory for storing signature images
const SIGNATURE_STORAGE_DIR = path.join(__dirname, '../uploads/signatures');
const SIGNATURE_MAX_KB = Number.parseInt(process.env.SIGNATURE_MAX_SIZE_KB || process.env.SIGNATURE_MAX_SIZE || '500', 10);
const SIGNATURE_MAX_BYTES = Number.isFinite(SIGNATURE_MAX_KB) && SIGNATURE_MAX_KB > 0
  ? SIGNATURE_MAX_KB * 1024
  : 500 * 1024;
const SIGNATURE_STORAGE_TYPE = (process.env.SIGNATURE_STORAGE_TYPE || 'local').toLowerCase();
const SIGNATURE_CDN_BASE_URL = process.env.SIGNATURE_CDN_BASE_URL
  ? process.env.SIGNATURE_CDN_BASE_URL.replace(/\/$/, '')
  : null;
const SIGNATURE_LOCAL_PREFIX = process.env.SIGNATURE_LOCAL_PREFIX || '/uploads/signatures';
const SIGNATURE_BACKUP_DIR = process.env.SIGNATURE_BACKUP_DIR
  ? (path.isAbsolute(process.env.SIGNATURE_BACKUP_DIR)
      ? process.env.SIGNATURE_BACKUP_DIR
      : path.join(__dirname, process.env.SIGNATURE_BACKUP_DIR))
  : path.join(__dirname, '../backups/signatures');
const SIGNATURE_BACKUP_ENABLED = (process.env.SIGNATURE_BACKUP_ENABLED || 'true').toLowerCase() !== 'false';

/**
 * Ensure signature storage directory exists
 */
async function ensureSignatureDirectory() {
  try {
    await fs.access(SIGNATURE_STORAGE_DIR);
  } catch {
    await fs.mkdir(SIGNATURE_STORAGE_DIR, { recursive: true });
  }
}

async function ensureBackupDirectory() {
  if (!SIGNATURE_BACKUP_ENABLED) {
    return;
  }

  try {
    await fs.access(SIGNATURE_BACKUP_DIR);
  } catch {
    await fs.mkdir(SIGNATURE_BACKUP_DIR, { recursive: true });
  }
}

async function backupSignatureFile(filename, buffer) {
  if (!SIGNATURE_BACKUP_ENABLED) {
    return;
  }

  await ensureBackupDirectory();

  const backupPath = path.join(SIGNATURE_BACKUP_DIR, filename);
  try {
    await fs.writeFile(backupPath, buffer);
  } catch (error) {
    console.warn('Failed to create signature backup', backupPath, error.message);
  }
}

function getSignaturePublicUrl(storedPath) {
  if (!storedPath) {
    return null;
  }

  if (SIGNATURE_CDN_BASE_URL) {
    const cleanPath = storedPath.startsWith('/') ? storedPath.slice(1) : storedPath;
    return `${SIGNATURE_CDN_BASE_URL}/${cleanPath}`;
  }

  return storedPath;
}

function resolveLocalSignaturePath(storedPath) {
  if (!storedPath) {
    return null;
  }

  const sanitized = storedPath.replace(/^\/+/, '');
  return path.join(__dirname, '..', sanitized);
}

async function deleteSignatureImage(storedPath) {
  if (!storedPath) {
    return;
  }

  if (SIGNATURE_STORAGE_TYPE !== 'local') {
    // Remote storage cleanup (S3, etc.) should be handled via dedicated jobs when enabled
    return;
  }

  const absolutePath = resolveLocalSignaturePath(storedPath);
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Failed to delete signature image', absolutePath, error.message);
    }
  }

  if (SIGNATURE_BACKUP_ENABLED) {
    const filename = path.basename(storedPath);
    const backupPath = path.join(SIGNATURE_BACKUP_DIR, filename);
    try {
      await fs.unlink(backupPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn('Failed to delete signature backup', backupPath, error.message);
      }
    }
  }
}

async function compressSignatureBuffer(buffer, mimeType) {
  const baseTransformer = sharp(buffer, { failOn: 'none' })
    .trim()
    .resize({
      width: 900,
      height: 600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .withMetadata({});

  if (mimeType === 'image/png') {
    return baseTransformer
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true,
        quality: 80,
      })
      .toBuffer();
  }

  return baseTransformer
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({
      quality: 80,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer();
}

async function ensureCompressedWithinLimit(originalBuffer, mimeType) {
  let compressed = await compressSignatureBuffer(originalBuffer, mimeType);

  if (compressed.length <= SIGNATURE_MAX_BYTES) {
    return compressed;
  }

  if (mimeType === 'image/png') {
    // Try with further palette reduction
    compressed = await sharp(originalBuffer, { failOn: 'none' })
      .resize({
        width: 900,
        height: 600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        colors: 32,
        palette: true,
        quality: 70,
      })
      .toBuffer();

    if (compressed.length <= SIGNATURE_MAX_BYTES) {
      return compressed;
    }
  } else {
    let quality = 70;
    while (quality >= 40) {
      const attempt = await sharp(originalBuffer, { failOn: 'none' })
        .resize({
          width: 900,
          height: 600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({
          quality,
          mozjpeg: true,
          chromaSubsampling: '4:4:4',
        })
        .toBuffer();

      if (attempt.length <= SIGNATURE_MAX_BYTES) {
        return attempt;
      }

      quality -= 10;
    }
  }

  throw new Error(`Signature image is too large (max ${Math.round(SIGNATURE_MAX_BYTES / 1024)}KB)`);
}

/**
 * Save base64 signature image to filesystem
 * @param {string} signatureData - Base64 encoded image (data:image/png;base64,...)
 * @param {string} userId - User ID for filename
 * @returns {Promise<string>} - Relative path to saved image
 */
async function saveSignatureImage(signatureData, userId) {
  await ensureSignatureDirectory();

  const matches = signatureData.match(/^data:(image\/(png|jpeg));base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid signature data format');
  }

  const mimeType = matches[1];
  const extension = matches[2];
  const base64Data = matches[3];
  const originalBuffer = Buffer.from(base64Data, 'base64');

  const optimizedBuffer = await ensureCompressedWithinLimit(originalBuffer, mimeType);

  const timestamp = Date.now();
  const filename = `${uuidv4()}_${userId}_${timestamp}.${extension}`;
  const filePath = path.join(SIGNATURE_STORAGE_DIR, filename);

  await fs.writeFile(filePath, optimizedBuffer);
  await backupSignatureFile(filename, optimizedBuffer);

  const storedPath = `${SIGNATURE_LOCAL_PREFIX.replace(/\/$/, '')}/${filename}`;

  return {
    storedPath,
    optimizedBase64: `data:${mimeType};base64,${optimizedBuffer.toString('base64')}`,
  };
}

/**
 * Submit a new liability waiver with digital signature
 * @param {Object} waiverData - Waiver submission data
 * @returns {Promise<Object>} - Created waiver record (without sensitive data)
 */
export async function submitWaiver(waiverData) {
  const {
    user_id,
    family_member_id,
    signer_user_id,
    waiver_version,
    language_code,
    signature_data,
    ip_address,
    user_agent,
    agreed_to_terms,
    photo_consent,
  } = waiverData;

  try {
    // Validate that exactly one of user_id or family_member_id is provided
    if ((!user_id && !family_member_id) || (user_id && family_member_id)) {
      throw new Error('Must provide either user_id OR family_member_id');
    }

    // Verify that the waiver version exists
    const versionCheck = await pool.query(
      `SELECT id, version_number, is_active 
       FROM waiver_versions 
       WHERE version_number = $1 AND language_code = $2`,
      [waiver_version, language_code]
    );

    if (versionCheck.rows.length === 0) {
      throw new Error(`Waiver version ${waiver_version} (${language_code}) not found`);
    }

    if (!versionCheck.rows[0].is_active) {
      throw new Error(`Waiver version ${waiver_version} is not active`);
    }

    // If signing for a family member, verify ownership
    if (family_member_id) {
      const familyCheck = await pool.query(
        `SELECT parent_user_id FROM family_members WHERE id = $1 AND deleted_at IS NULL`,
        [family_member_id]
      );

      if (familyCheck.rows.length === 0) {
        throw new Error('Family member not found');
      }

      if (familyCheck.rows[0].parent_user_id !== signer_user_id) {
        throw new Error('You can only sign waivers for your own family members');
      }
    }

    // Check if waiver already exists (prevent duplicates)
    const existingWaiver = user_id
      ? await pool.query(
          `SELECT id FROM liability_waivers WHERE user_id = $1 ORDER BY signed_at DESC LIMIT 1`,
          [user_id]
        )
      : await pool.query(
          `SELECT id FROM liability_waivers WHERE family_member_id = $1 ORDER BY signed_at DESC LIMIT 1`,
          [family_member_id]
        );

    if (existingWaiver.rows.length > 0) {
      // Check if existing waiver is recent (within last 30 days)
      const existingWaiverDetails = await pool.query(
        `SELECT signed_at, waiver_version, signature_image_url FROM liability_waivers WHERE id = $1`,
        [existingWaiver.rows[0].id]
      );

      const daysSinceSigned = Math.floor(
        (Date.now() - new Date(existingWaiverDetails.rows[0].signed_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Allow re-signing if version changed or more than 30 days passed
      if (daysSinceSigned < 30 && existingWaiverDetails.rows[0].waiver_version === waiver_version) {
        return {
          id: existingWaiver.rows[0].id,
          message: 'Waiver already signed recently',
          already_signed: true,
          signature_public_url: getSignaturePublicUrl(existingWaiverDetails.rows[0].signature_image_url),
        };
      }
    }

    // Save signature image to filesystem
    const { storedPath: signatureImageUrl, optimizedBase64 } = await saveSignatureImage(
      signature_data,
      user_id || family_member_id
    );

    // Insert waiver record into database
    const result = await pool.query(
      `INSERT INTO liability_waivers (
        user_id,
        family_member_id,
        signer_user_id,
        waiver_version,
        language_code,
        signature_image_url,
        signature_data,
        ip_address,
        user_agent,
        agreed_to_terms,
        photo_consent,
        signed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id, user_id, family_member_id, signer_user_id, waiver_version, language_code, 
                signature_image_url, ip_address, agreed_to_terms, photo_consent, signed_at, created_at`,
      [
        user_id || null,
        family_member_id || null,
        signer_user_id,
        waiver_version,
        language_code,
        signatureImageUrl,
        optimizedBase64, // Store compressed base64 for backup
        ip_address,
        user_agent,
        agreed_to_terms,
        photo_consent,
      ]
    );

    const savedWaiver = result.rows[0];

    try {
      await logWaiverModification({
        actorUserId: signer_user_id,
        waiverId: savedWaiver.id,
        targetUserId: user_id || null,
        familyMemberId: family_member_id || null,
        action: existingWaiver.rows.length > 0 ? 'update' : 'create',
        description: existingWaiver.rows.length > 0
          ? 'Waiver re-signed or version updated'
          : 'Initial waiver submission',
        metadata: {
          waiverVersion: waiver_version,
          languageCode: language_code
        },
        ipAddress: ip_address,
        userAgent: user_agent
      });
    } catch (auditError) {
      console.warn('Failed to log waiver submission audit event (service)', auditError.message);
    }

    dispatchWaiverSigned({
      waiver: {
        ...savedWaiver,
        signature_public_url: getSignaturePublicUrl(savedWaiver.signature_image_url)
      },
      signerUserId: signer_user_id,
      targetUserId: user_id || null,
      familyMemberId: family_member_id || null
    }).catch((notificationError) => {
      console.warn('Failed to dispatch waiver signed notifications', notificationError?.message || notificationError);
    });

    return {
      ...savedWaiver,
      signature_public_url: getSignaturePublicUrl(savedWaiver.signature_image_url),
    };
  } catch (error) {
    console.error('Error submitting waiver:', error);
    throw error;
  }
}

/**
 * Check if user or family member needs to sign a waiver
 * @param {string} id - User ID or family member ID
 * @param {string} type - 'user' or 'family_member'
 * @returns {Promise<boolean>} - True if needs to sign
 */
export async function needsToSignWaiver(id, type = 'user') {
  try {
    const column = type === 'user' ? 'user_id' : 'family_member_id';

    const result = await pool.query(
      `SELECT id, signed_at, waiver_version 
       FROM liability_waivers 
       WHERE ${column} = $1 
       ORDER BY signed_at DESC 
       LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return true; // No waiver found, needs to sign
    }

    // Check if waiver is recent (within 365 days)
    const lastWaiver = result.rows[0];
    const daysSinceSigned = Math.floor((Date.now() - new Date(lastWaiver.signed_at).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceSigned > 365) {
      return true; // Waiver expired after 1 year
    }

    // Check if there's a newer waiver version available
    const latestVersion = await pool.query(
      `SELECT version_number FROM waiver_versions 
       WHERE is_active = true AND language_code = 'en' 
       ORDER BY created_at DESC LIMIT 1`
    );

    if (latestVersion.rows.length > 0 && latestVersion.rows[0].version_number !== lastWaiver.waiver_version) {
      return true; // New version available, needs to sign again
    }

    return false; // Valid waiver exists
  } catch (error) {
    console.error('Error checking waiver status:', error);
    throw error;
  }
}

/**
 * Get detailed waiver status for user or family member
 * @param {string} id - User ID or family member ID
 * @param {string} type - 'user' or 'family_member'
 * @returns {Promise<Object>} - Status object with details
 */
export async function checkWaiverStatus(id, type = 'user') {
  try {
    const column = type === 'user' ? 'user_id' : 'family_member_id';

    const result = await pool.query(
      `SELECT 
        id,
        user_id,
        family_member_id,
        signer_user_id,
        waiver_version,
        language_code,
        signature_image_url,
        ip_address,
        agreed_to_terms,
        photo_consent,
        signed_at,
        created_at
       FROM liability_waivers 
       WHERE ${column} = $1 
       ORDER BY signed_at DESC 
       LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return {
        hasSigned: false,
        needsToSign: true,
        message: 'No waiver found. Please sign the liability waiver.',
      };
    }

    const waiver = result.rows[0];
    const daysSinceSigned = Math.floor((Date.now() - new Date(waiver.signed_at).getTime()) / (1000 * 60 * 60 * 24));

    // Check if expired (365 days)
    if (daysSinceSigned > 365) {
      return {
        hasSigned: true,
        needsToSign: true,
        isExpired: true,
        lastSigned: waiver.signed_at,
        daysSinceSigned,
        message: 'Your waiver has expired. Please sign a new one.',
        currentWaiverId: waiver.id
      };
    }

    // Check if new version available
    const latestVersion = await pool.query(
      `SELECT version_number FROM waiver_versions 
       WHERE is_active = true AND language_code = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [waiver.language_code]
    );

    const needsNewVersion = latestVersion.rows.length > 0 && latestVersion.rows[0].version_number !== waiver.waiver_version;

    return {
      hasSigned: true,
      needsToSign: needsNewVersion,
      isExpired: false,
      lastSigned: waiver.signed_at,
      daysSinceSigned,
      currentVersion: waiver.waiver_version,
      latestVersion: latestVersion.rows[0]?.version_number,
      needsNewVersion,
      signatureUrl: getSignaturePublicUrl(waiver.signature_image_url),
      photoConsent: waiver.photo_consent,
      message: needsNewVersion 
        ? `A new waiver version (${latestVersion.rows[0].version_number}) is available. Please sign the updated waiver.`
        : 'Waiver is valid and up to date.',
      currentWaiverId: waiver.id
    };
  } catch (error) {
    console.error('Error checking waiver status:', error);
    throw error;
  }
}

/**
 * Get waiver history for user or family member
 * @param {string} id - User ID or family member ID
 * @param {string} type - 'user' or 'family_member'
 * @returns {Promise<Array>} - Array of waiver records
 */
export async function getWaiverHistory(id, type = 'user') {
  try {
    const column = type === 'user' ? 'user_id' : 'family_member_id';

    const result = await pool.query(
      `SELECT 
        id,
        waiver_version,
        language_code,
        signature_image_url,
        ip_address,
        agreed_to_terms,
        photo_consent,
        signed_at
       FROM liability_waivers 
       WHERE ${column} = $1 
       ORDER BY signed_at DESC`,
      [id]
    );

    return result.rows.map((row) => ({
      ...row,
      signature_public_url: getSignaturePublicUrl(row.signature_image_url),
    }));
  } catch (error) {
    console.error('Error fetching waiver history:', error);
    throw error;
  }
}

/**
 * Get specific waiver version by ID
 * @param {string} versionId - Waiver version UUID
 * @returns {Promise<Object>} - Waiver version record
 */
export async function getWaiverVersion(versionId) {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        version_number,
        language_code,
        content,
        is_active,
        effective_date,
        created_at
       FROM waiver_versions 
       WHERE id = $1`,
      [versionId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching waiver version:', error);
    throw error;
  }
}

/**
 * Get latest active waiver version for a language
 * @param {string} languageCode - Language code (default: 'en')
 * @returns {Promise<Object>} - Latest active waiver version
 */
export async function getLatestActiveVersion(languageCode = 'en') {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        version_number,
        language_code,
        content,
        is_active,
        effective_date,
        created_at
       FROM waiver_versions 
       WHERE is_active = true AND language_code = $1 
       ORDER BY effective_date DESC, created_at DESC 
       LIMIT 1`,
      [languageCode]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching latest waiver version:', error);
    throw error;
  }
}

/**
 * Create a new waiver version (admin only)
 * @param {Object} versionData - Waiver version data
 * @returns {Promise<Object>} - Created waiver version
 */
export async function createWaiverVersion(versionData) {
  const { version_number, language_code, content, is_active, effective_date, created_by } = versionData;

  try {
    // If setting as active, deactivate all other versions for this language
    if (is_active) {
      await pool.query(
        `UPDATE waiver_versions SET is_active = false WHERE language_code = $1`,
        [language_code]
      );
    }

    const result = await pool.query(
      `INSERT INTO waiver_versions (
        version_number,
        language_code,
        content,
        is_active,
        effective_date,
        created_by,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id, version_number, language_code, content, is_active, effective_date, created_at`,
      [version_number, language_code, content, is_active, effective_date, created_by]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error creating waiver version:', error);
    throw error;
  }
}

async function deleteWaiversBy(column, value) {
  const { rows } = await pool.query(
    `SELECT id, signature_image_url FROM liability_waivers WHERE ${column} = $1`,
    [value]
  );

  if (rows.length === 0) {
    return 0;
  }

  await pool.query(`DELETE FROM liability_waivers WHERE ${column} = $1`, [value]);

  await Promise.all(
    rows.map(async (row) => {
      try {
        await deleteSignatureImage(row.signature_image_url);
      } catch (error) {
        console.warn('Failed to cleanup signature image for waiver', row.id, error.message);
      }
    })
  );

  return rows.length;
}

export async function deleteWaiverById(waiverId) {
  const { rows } = await pool.query(
    `SELECT signature_image_url FROM liability_waivers WHERE id = $1`,
    [waiverId]
  );

  if (rows.length === 0) {
    return false;
  }

  await pool.query(`DELETE FROM liability_waivers WHERE id = $1`, [waiverId]);

  await deleteSignatureImage(rows[0].signature_image_url);
  return true;
}

export async function deleteWaiversForFamilyMember(familyMemberId) {
  return deleteWaiversBy('family_member_id', familyMemberId);
}

export async function deleteWaiversForUser(userId) {
  return deleteWaiversBy('user_id', userId);
}

/**
 * Helper: Get signer user details (for display purposes)
 * @param {string} signerId - Signer user ID
 * @returns {Promise<Object>} - User details
 */
export async function getSignerDetails(signerId) {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email FROM users WHERE id = $1`,
      [signerId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching signer details:', error);
    throw error;
  }
}

export function generateSignaturePublicUrl(signaturePath) {
  return getSignaturePublicUrl(signaturePath);
}
