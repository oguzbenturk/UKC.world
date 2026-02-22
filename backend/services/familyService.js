// backend/services/familyService.js
import { pool } from '../db.js';
import crypto from 'crypto';
import { checkWaiverStatus, deleteWaiversForFamilyMember } from './waiverService.js';
import {
  logFamilyMemberChange
} from './auditLogService.js';

const DEFAULT_ACTIVITY_LIMIT = 25;

const defaultActivityCapabilities = {
  bookingsFamilyMember: false,
  bookingsParticipantType: false,
  rentalsFamilyMember: false,
  rentalsParticipantType: false,
  waiversFamilyMember: false,
  auditFamilyMember: false
};

let familyActivityCapabilitiesPromise;

const getFamilyActivityCapabilities = async (client) => {
  if (!familyActivityCapabilitiesPromise) {
    const runner = client ?? pool;
    familyActivityCapabilitiesPromise = runner
      .query(`
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('bookings', 'rentals', 'liability_waivers', 'audit_logs')
           AND column_name IN ('family_member_id', 'participant_type')
      `)
      .then(({ rows }) => {
        const hasColumn = (table, column) => rows.some((row) => row.table_name === table && row.column_name === column);
        return {
          bookingsFamilyMember: hasColumn('bookings', 'family_member_id'),
          bookingsParticipantType: hasColumn('bookings', 'participant_type'),
          rentalsFamilyMember: hasColumn('rentals', 'family_member_id'),
          rentalsParticipantType: hasColumn('rentals', 'participant_type'),
          waiversFamilyMember: hasColumn('liability_waivers', 'family_member_id'),
          auditFamilyMember: hasColumn('audit_logs', 'family_member_id')
        };
      })
      .catch((error) => {
        console.warn('Failed to inspect family activity capabilities', error.message);
        return { ...defaultActivityCapabilities };
      });
  }

  try {
    return await familyActivityCapabilitiesPromise;
  } catch (error) {
    // Reset cached promise so future calls can retry if inspection failed synchronously
    familyActivityCapabilitiesPromise = null;
    throw error;
  }
};

const normalizeActivityTypes = (types) => {
  if (!types) {
    return new Set(['booking', 'rental', 'waiver', 'audit']);
  }

  const values = Array.isArray(types)
    ? types
    : String(types)
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

  const allowed = new Set(['booking', 'rental', 'waiver', 'audit']);
  const normalized = new Set();

  values.forEach((value) => {
    if (allowed.has(value)) {
      normalized.add(value);
    }
  });

  return normalized.size > 0 ? normalized : allowed;
};

const clampActivityLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_ACTIVITY_LIMIT;
  }
  return Math.min(parsed, 100);
};

const normalizeOffset = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const normalizeDateInput = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return new Date(value.getTime());
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeDateRange = (start, end) => {
  const startDate = normalizeDateInput(start);
  const endDate = normalizeDateInput(end);

  if (startDate && endDate && startDate > endDate) {
    return { startDate: endDate, endDate: startDate };
  }

  return { startDate, endDate };
};

// Encryption key for medical notes (should be in environment variable in production)
const ENCRYPTION_KEY = process.env.MEDICAL_NOTES_ENCRYPTION_KEY || 'default-dev-key-change-in-prod-32b';
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt sensitive medical notes
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text in format: iv:encryptedData
 */
export const encryptMedicalNotes = (text) => {
  if (!text) return null;
  
  try {
    // Ensure key is 32 bytes for aes-256
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data (we need IV for decryption)
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt medical notes');
  }
};

/**
 * Decrypt medical notes
 * @param {string} encryptedText - Encrypted text in format: iv:encryptedData
 * @returns {string} - Decrypted plain text
 */
export const decryptMedicalNotes = (encryptedText) => {
  if (!encryptedText) return null;
  
  try {
    const [ivHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted format');
    }
    
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '[Unable to decrypt medical notes]';
  }
};

/**
 * Validate age is under 18
 * @param {Date|string} dateOfBirth - Date of birth
 * @returns {boolean} - True if under 18
 */
export const validateAgeUnder18 = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Adjust if birthday hasn't occurred this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    return (age - 1) < 18;
  }
  
  return age < 18;
};

/**
 * Get all family members for a parent user
 * @param {string} parentUserId - UUID of parent user
 * @returns {Array} - Array of family members
 */
export const getFamilyMembers = async (parentUserId) => {
  const query = `
    SELECT 
      id,
      parent_user_id,
      full_name,
      date_of_birth,
      relationship,
      gender,
      medical_notes,
      emergency_contact,
      photo_url,
      is_active,
      created_at,
      updated_at
    FROM family_members
    WHERE parent_user_id = $1 
      AND deleted_at IS NULL
      AND is_active = true
    ORDER BY date_of_birth DESC
  `;
  
  const result = await pool.query(query, [parentUserId]);

  const decryptedMembers = result.rows.map(member => ({
    ...member,
    medical_notes: member.medical_notes ? decryptMedicalNotes(member.medical_notes) : null,
    age: calculateAge(member.date_of_birth)
  }));

  return Promise.all(
    decryptedMembers.map(async (member) => {
      try {
        const status = await checkWaiverStatus(member.id, 'family_member');
        const hasSigned = status?.hasSigned ?? false;
        const needsAction = status?.needsToSign ?? true;

        return {
          ...member,
          waiver_status: hasSigned && !needsAction ? 'signed' : 'pending',
          waiver_has_signed: hasSigned,
          waiver_requires_action: needsAction,
          waiver_is_expired: status?.isExpired ?? false,
          waiver_needs_new_version: status?.needsNewVersion ?? false,
          waiver_last_signed: status?.lastSigned || null,
          waiver_days_since_signed: status?.daysSinceSigned ?? null,
          waiver_message: status?.message || null
        };
      } catch (error) {
        console.error('Failed to resolve waiver status for family member', member.id, error);
        return {
          ...member,
          waiver_status: 'unknown',
          waiver_has_signed: false,
          waiver_requires_action: true,
          waiver_is_expired: false,
          waiver_needs_new_version: false,
          waiver_last_signed: null,
          waiver_days_since_signed: null,
          waiver_message: 'Unable to fetch waiver status'
        };
      }
    })
  );
};

/**
 * Get a single family member by ID
 * @param {string} memberId - UUID of family member
 * @param {string} parentUserId - UUID of parent (for authorization)
 * @returns {Object|null} - Family member object or null
 */
export const getFamilyMemberById = async (memberId, parentUserId) => {
  const query = `
    SELECT 
      id,
      parent_user_id,
      full_name,
      date_of_birth,
      relationship,
      gender,
      medical_notes,
      emergency_contact,
      photo_url,
      is_active,
      created_at,
      updated_at
    FROM family_members
    WHERE id = $1 
      AND parent_user_id = $2
      AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [memberId, parentUserId]);

  if (result.rows.length === 0) {
    return null;
  }

  const member = {
    ...result.rows[0],
    medical_notes: result.rows[0].medical_notes ? decryptMedicalNotes(result.rows[0].medical_notes) : null,
    age: calculateAge(result.rows[0].date_of_birth)
  };

  try {
    const status = await checkWaiverStatus(member.id, 'family_member');
    const hasSigned = status?.hasSigned ?? false;
    const needsAction = status?.needsToSign ?? true;

    return {
      ...member,
      waiver_status: hasSigned && !needsAction ? 'signed' : 'pending',
      waiver_has_signed: hasSigned,
      waiver_requires_action: needsAction,
      waiver_is_expired: status?.isExpired ?? false,
      waiver_needs_new_version: status?.needsNewVersion ?? false,
      waiver_last_signed: status?.lastSigned || null,
      waiver_days_since_signed: status?.daysSinceSigned ?? null,
      waiver_message: status?.message || null
    };
  } catch (error) {
    console.error('Failed to resolve waiver status for family member', member.id, error);
    return {
      ...member,
      waiver_status: 'unknown',
      waiver_has_signed: false,
      waiver_requires_action: true,
      waiver_is_expired: false,
      waiver_needs_new_version: false,
      waiver_last_signed: null,
      waiver_days_since_signed: null,
      waiver_message: 'Unable to fetch waiver status'
    };
  }
};

/**
 * Create a new family member
 * Enforces maximum member limit and checks for duplicate names.
 * @param {Object} memberData - Family member data
 * @param {string} parentUserId - UUID of parent user
 * @returns {Object} - Created family member (with optional warnings array)
 */
export const createFamilyMember = async (memberData, parentUserId, actorUserId = parentUserId) => {
  const {
    full_name,
    date_of_birth,
    relationship,
    gender,
    medical_notes,
    emergency_contact,
    photo_url
  } = memberData;

  // Enforce maximum members limit (default 5)
  const MAX_MEMBERS = parseInt(process.env.FAMILY_MEMBER_LIMIT || '5', 10);
  if (Number.isFinite(MAX_MEMBERS) && MAX_MEMBERS > 0) {
    const { rows } = await pool.query(
      `SELECT COUNT(1) AS cnt FROM family_members WHERE parent_user_id = $1 AND deleted_at IS NULL AND is_active = true`,
      [parentUserId]
    );
    const currentCount = parseInt(rows?.[0]?.cnt || '0', 10);
    if (currentCount >= MAX_MEMBERS) {
      const err = new Error(`Maximum family members limit (${MAX_MEMBERS}) reached`);
      err.code = 'FAMILY_LIMIT_REACHED';
      throw err;
    }
  }
  
  // Validate age < 18 only for child-type relationships
  const childRelationships = ['son', 'daughter', 'child', 'sibling'];
  if (childRelationships.includes(relationship) && !validateAgeUnder18(date_of_birth)) {
    throw new Error('Children, sons, daughters, and siblings must be under 18 years old');
  }
  
  // Encrypt medical notes if provided
  const encryptedMedicalNotes = medical_notes ? encryptMedicalNotes(medical_notes) : null;
  
  const query = `
    INSERT INTO family_members (
      parent_user_id,
      full_name,
      date_of_birth,
      relationship,
      gender,
      medical_notes,
      emergency_contact,
      photo_url,
      is_active,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
    RETURNING 
      id,
      parent_user_id,
      full_name,
      date_of_birth,
      relationship,
      gender,
      emergency_contact,
      photo_url,
      is_active,
      created_at,
      updated_at
  `;
  
  const values = [
    parentUserId,
    full_name,
    date_of_birth,
    relationship,
    gender,
    encryptedMedicalNotes,
    emergency_contact,
    photo_url
  ];
  
  // Detect duplicate name (soft warning)
  const warnings = [];
  try {
    const dupCheck = await pool.query(
      `SELECT 1 FROM family_members 
       WHERE parent_user_id = $1 AND LOWER(TRIM(full_name)) = LOWER(TRIM($2)) 
         AND deleted_at IS NULL LIMIT 1`,
      [parentUserId, full_name]
    );
    if (dupCheck.rowCount > 0) {
      warnings.push('A family member with this name already exists.');
    }
  } catch {}

  const result = await pool.query(query, values);
  const newMember = result.rows[0];

  try {
    await logFamilyMemberChange({
      actorUserId,
      familyMemberId: newMember.id,
      targetUserId: parentUserId,
      action: 'create',
      description: `Family member ${newMember.full_name} created`,
      metadata: {
        relationship,
        warnings
      }
    });
  } catch (auditError) {
    console.warn('Failed to log family member creation audit event', auditError.message);
  }
  
  return {
    ...newMember,
    medical_notes: medical_notes || null, // Return plain text (already decrypted)
    age: calculateAge(newMember.date_of_birth),
    warnings,
    waiver_status: 'pending',
    waiver_has_signed: false,
    waiver_requires_action: true,
    waiver_is_expired: false,
    waiver_needs_new_version: false,
    waiver_last_signed: null,
    waiver_days_since_signed: null,
    waiver_message: 'Liability waiver not signed yet'
  };
};

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return '""';
  }

  const stringValue = String(value);
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return `"${stringValue}"`;
};

const formatTimestamp = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
};

export const exportFamilyMembersCsv = async (parentUserId) => {
  const members = await getFamilyMembers(parentUserId);

  const header = [
    'Parent User ID',
    'Family Member ID',
    'Full Name',
    'Relationship',
    'Date of Birth',
    'Gender',
    'Emergency Contact',
    'Waiver Status',
    'Waiver Last Signed',
    'Created At',
    'Updated At'
  ].map(escapeCsvValue).join(',');

  const rows = members.map((member) => [
    member.parent_user_id,
    member.id,
    member.full_name,
    member.relationship,
    member.date_of_birth,
    member.gender || '',
    member.emergency_contact || '',
    member.waiver_status || 'unknown',
    formatTimestamp(member.waiver_last_signed),
    formatTimestamp(member.created_at),
    formatTimestamp(member.updated_at)
  ].map(escapeCsvValue).join(','));

  return [header, ...rows].join('\r\n');
};

/**
 * Update an existing family member
 * @param {string} memberId - UUID of family member
 * @param {Object} updates - Fields to update
 * @param {string} parentUserId - UUID of parent (for authorization)
 * @returns {Object|null} - Updated family member or null
 */
export const updateFamilyMember = async (memberId, updates, parentUserId, actorUserId = parentUserId) => {
  // First verify ownership
  const existing = await getFamilyMemberById(memberId, parentUserId);
  if (!existing) {
    throw new Error('Family member not found or access denied');
  }
  
  // Validate age if date_of_birth is being updated - only for child-type relationships
  const childRelationships = ['son', 'daughter', 'child', 'sibling'];
  const effectiveRelationship = updates.relationship || existing.relationship;
  if (updates.date_of_birth && childRelationships.includes(effectiveRelationship) && !validateAgeUnder18(updates.date_of_birth)) {
    throw new Error('Children, sons, daughters, and siblings must be under 18 years old');
  }
  
  // Encrypt medical notes if provided
  if (updates.medical_notes !== undefined) {
    updates.medical_notes = updates.medical_notes ? encryptMedicalNotes(updates.medical_notes) : null;
  }
  
  // Build dynamic update query
  const allowedFields = [
    'full_name',
    'date_of_birth',
    'relationship',
    'gender',
    'medical_notes',
    'emergency_contact',
    'photo_url',
    'is_active'
  ];
  
  const updateFields = [];
  const values = [];
  let paramIndex = 1;
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      updateFields.push(`${field} = $${paramIndex}`);
      values.push(updates[field]);
      paramIndex++;
    }
  }
  
  if (updateFields.length === 0) {
    return existing; // No changes
  }
  
  updateFields.push(`updated_at = NOW()`);
  values.push(memberId, parentUserId);
  
  const query = `
    UPDATE family_members
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex} 
      AND parent_user_id = $${paramIndex + 1}
      AND deleted_at IS NULL
    RETURNING 
      id,
      parent_user_id,
      full_name,
      date_of_birth,
      relationship,
      gender,
      medical_notes,
      emergency_contact,
      photo_url,
      is_active,
      created_at,
      updated_at
  `;
  
  const result = await pool.query(query, values);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const updated = result.rows[0];
  const normalized = {
    ...updated,
    medical_notes: updated.medical_notes ? decryptMedicalNotes(updated.medical_notes) : null,
    age: calculateAge(updated.date_of_birth)
  };

  try {
    await logFamilyMemberChange({
      actorUserId,
      familyMemberId: normalized.id,
      targetUserId: parentUserId,
      action: 'update',
      description: `Family member ${normalized.full_name} updated`,
      metadata: updates
    });
  } catch (auditError) {
    console.warn('Failed to log family member update audit event', auditError.message);
  }

  try {
    const status = await checkWaiverStatus(normalized.id, 'family_member');
    const hasSigned = status?.hasSigned ?? false;
    const needsAction = status?.needsToSign ?? true;

    return {
      ...normalized,
      waiver_status: hasSigned && !needsAction ? 'signed' : 'pending',
      waiver_has_signed: hasSigned,
      waiver_requires_action: needsAction,
      waiver_is_expired: status?.isExpired ?? false,
      waiver_needs_new_version: status?.needsNewVersion ?? false,
      waiver_last_signed: status?.lastSigned || null,
      waiver_days_since_signed: status?.daysSinceSigned ?? null,
      waiver_message: status?.message || null
    };
  } catch (error) {
    console.error('Failed to resolve waiver status for family member', normalized.id, error);
    return {
      ...normalized,
      waiver_status: 'unknown',
      waiver_has_signed: false,
      waiver_requires_action: true,
      waiver_is_expired: false,
      waiver_needs_new_version: false,
      waiver_last_signed: null,
      waiver_days_since_signed: null,
      waiver_message: 'Unable to fetch waiver status'
    };
  }
};

/**
 * Retrieve combined activity timeline for a family member.
 * Aggregates bookings, rentals, waivers, and audit events.
 * @param {string} parentUserId - UUID of parent user (authorization scope)
 * @param {string} memberId - UUID of family member
 * @param {Object} options - Pagination and filtering options
 * @returns {Promise<{items: Array, total: number, count: number, limit: number, offset: number, hasMore: boolean}>}
 */
export const getFamilyMemberActivity = async (parentUserId, memberId, options = {}) => {
  const limit = clampActivityLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const types = normalizeActivityTypes(options.types);
  const { startDate, endDate } = normalizeDateRange(options.startDate, options.endDate);

  const client = await pool.connect();
  try {
    const membership = await client.query(
      `SELECT id FROM family_members
        WHERE id = $1 AND parent_user_id = $2 AND deleted_at IS NULL`,
      [memberId, parentUserId]
    );

    if (membership.rowCount === 0) {
      const error = new Error('Family member not found or access denied');
      error.code = 'FAMILY_MEMBER_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    const capabilities = await getFamilyActivityCapabilities(client);
    const subQueries = [];

    if (types.has('booking') && capabilities.bookingsFamilyMember) {
      const participantExpr = capabilities.bookingsParticipantType ? 'b.participant_type' : `'family_member'`;
      subQueries.push(`
        SELECT
          'booking:' || b.id::text AS event_id,
          'booking' AS event_type,
          b.start_time AS occurred_at,
          b.created_at,
          b.updated_at,
          b.status,
          COALESCE(srv.name, 'Lesson Booking') AS title,
          CASE WHEN instr.name IS NOT NULL THEN 'Instructor: ' || instr.name ELSE NULL END AS subtitle,
          jsonb_build_object(
            'bookingId', b.id,
            'serviceName', srv.name,
            'instructorName', instr.name,
            'startAt', b.start_time,
            'endAt', b.end_time,
            'durationHours', b.duration,
            'paymentStatus', b.payment_status,
            'finalAmount', b.final_amount,
            'amount', b.amount,
            'participantType', ${participantExpr},
            'location', b.location,
            'notes', b.notes
          ) AS metadata
        FROM (
          SELECT b.*, 
            CASE 
              WHEN b.start_hour IS NOT NULL THEN (b.date + (b.start_hour * INTERVAL '1 hour'))
              ELSE b.date::timestamp
            END AS start_time,
            CASE 
              WHEN b.start_hour IS NOT NULL AND b.duration IS NOT NULL THEN (b.date + (b.start_hour * INTERVAL '1 hour') + (b.duration * INTERVAL '1 hour'))
              WHEN b.duration IS NOT NULL THEN (b.date + (b.duration * INTERVAL '1 hour'))
              ELSE NULL
            END AS end_time
          FROM bookings b
          WHERE b.family_member_id = $1
            AND b.deleted_at IS NULL
        ) b
        LEFT JOIN services srv ON srv.id = b.service_id
        LEFT JOIN users instr ON instr.id = b.instructor_user_id
      `);
    }

    if (types.has('rental') && capabilities.rentalsFamilyMember) {
      const participantExpr = capabilities.rentalsParticipantType ? 'r.participant_type' : `'family_member'`;
      subQueries.push(`
        SELECT
          'rental:' || r.id::text AS event_id,
          'rental' AS event_type,
          r.start_date AS occurred_at,
          r.created_at,
          r.updated_at,
          r.status,
          CASE 
            WHEN array_length(r.equipment_names, 1) > 0 THEN 'Rental: ' || array_to_string(r.equipment_names, ', ')
            ELSE 'Equipment Rental'
          END AS title,
          CASE WHEN r.payment_status IS NOT NULL THEN 'Payment: ' || r.payment_status ELSE NULL END AS subtitle,
          jsonb_build_object(
            'rentalId', r.id,
            'equipmentNames', r.equipment_names,
            'startAt', r.start_date,
            'endAt', r.end_date,
            'paymentStatus', r.payment_status,
            'totalPrice', r.total_price,
            'participantType', ${participantExpr},
            'notes', r.notes,
            'status', r.status
          ) AS metadata
        FROM (
          SELECT r.*, COALESCE(
            ARRAY(
              SELECT DISTINCT item.value->>'name'
              FROM jsonb_each(COALESCE(r.equipment_details, '{}'::jsonb)) AS item
              WHERE item.value->>'name' IS NOT NULL
            ),
            ARRAY[]::text[]
          ) AS equipment_names
          FROM rentals r
          WHERE r.family_member_id = $1
        ) r
      `);
    }

    if (types.has('waiver') && capabilities.waiversFamilyMember) {
      subQueries.push(`
        SELECT
          'waiver:' || lw.id::text AS event_id,
          'waiver' AS event_type,
          lw.signed_at AS occurred_at,
          lw.created_at,
          lw.created_at AS updated_at,
          'completed' AS status,
          'Waiver version ' || lw.waiver_version AS title,
          CASE WHEN signer.name IS NOT NULL THEN 'Signed by ' || signer.name ELSE NULL END AS subtitle,
          jsonb_build_object(
            'waiverId', lw.id,
            'waiverVersion', lw.waiver_version,
            'languageCode', lw.language_code,
            'signedAt', lw.signed_at,
            'signedBy', signer.name,
            'signedByEmail', signer.email,
            'photoConsent', lw.photo_consent,
            'agreedToTerms', lw.agreed_to_terms
          ) AS metadata
        FROM liability_waivers lw
        LEFT JOIN users signer ON signer.id = lw.signer_user_id
        WHERE lw.family_member_id = $1
      `);
    }

    if (types.has('audit') && capabilities.auditFamilyMember) {
      subQueries.push(`
        SELECT
          'audit:' || al.id::text AS event_id,
          'audit' AS event_type,
          al.created_at AS occurred_at,
          al.created_at,
          al.created_at AS updated_at,
          al.action AS status,
          COALESCE(al.description, INITCAP(REPLACE(al.event_type, '.', ' '))) AS title,
          CASE WHEN actor.name IS NOT NULL THEN 'By ' || actor.name ELSE NULL END AS subtitle,
          jsonb_build_object(
            'auditId', al.id,
            'eventType', al.event_type,
            'resourceType', al.resource_type,
            'resourceId', al.resource_id,
            'actorName', actor.name,
            'actorEmail', actor.email,
            'metadata', COALESCE(al.metadata, '{}'::jsonb)
          ) AS metadata
        FROM audit_logs al
        LEFT JOIN users actor ON actor.id = al.actor_user_id
        WHERE al.family_member_id = $1
      `);
    }

    if (subQueries.length === 0) {
      return {
        items: [],
        total: 0,
        count: 0,
        limit,
        offset: 0,
        hasMore: false
      };
    }

    const unionSql = subQueries.join('\nUNION ALL\n');

    const timelineExpression = 'COALESCE(occurred_at, created_at)';
    const filterExpressions = [];
    const filterValues = [];

    if (startDate) {
      filterValues.push(startDate);
      filterExpressions.push(`${timelineExpression} >= $${1 + filterValues.length}`);
    }

    if (endDate) {
      filterValues.push(endDate);
      filterExpressions.push(`${timelineExpression} <= $${1 + filterValues.length}`);
    }

    const filterClause = filterExpressions.length ? `WHERE ${filterExpressions.join(' AND ')}` : '';

    const baseParamCount = 1; // memberId
    const limitPlaceholder = `$${baseParamCount + filterValues.length + 1}`;
    const offsetPlaceholder = `$${baseParamCount + filterValues.length + 2}`;

    const countSql = `
      WITH events AS (
        ${unionSql}
      )
      SELECT COUNT(*)::int AS total FROM events
      ${filterClause}
    `;

    const dataSql = `
      WITH events AS (
        ${unionSql}
      )
      SELECT event_id, event_type, occurred_at, created_at, updated_at, status, title, subtitle, metadata
        FROM events
        ${filterClause}
       ORDER BY occurred_at DESC NULLS LAST, created_at DESC
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countParams = [memberId, ...filterValues];
    const dataParams = [memberId, ...filterValues, limit, offset];

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(countSql, countParams),
      client.query(dataSql, dataParams)
    ]);

    const total = countRows?.[0]?.total ?? 0;
    const items = dataRows.map((row) => ({
      id: row.event_id,
      type: row.event_type,
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
      title: row.title,
      subtitle: row.subtitle,
      metadata: row.metadata || {}
    }));

    const count = items.length;
    return {
      items,
      total,
      count,
      limit,
      offset,
      hasMore: offset + count < total
    };
  } finally {
    client.release();
  }
};

/**
 * Soft delete a family member
 * @param {string} memberId - UUID of family member
 * @param {string} parentUserId - UUID of parent (for authorization)
 * @returns {boolean} - True if deleted
 */
export const deleteFamilyMember = async (memberId, parentUserId, actorUserId = parentUserId) => {
  const query = `
    UPDATE family_members
    SET deleted_at = NOW(), is_active = false
    WHERE id = $1 
      AND parent_user_id = $2
      AND deleted_at IS NULL
    RETURNING id
  `;
  
  const result = await pool.query(query, [memberId, parentUserId]);
  if (result.rowCount > 0) {
    try {
      await deleteWaiversForFamilyMember(memberId);
    } catch (error) {
      console.error('Failed to cleanup waivers for deleted family member', memberId, error);
    }

    try {
      await logFamilyMemberChange({
        actorUserId,
        familyMemberId: memberId,
        targetUserId: parentUserId,
        action: 'delete',
        description: `Family member ${memberId} deleted`
      });
    } catch (auditError) {
      console.warn('Failed to log family member deletion audit event', auditError.message);
    }
    return true;
  }

  return false;
};

/**
 * Calculate age from date of birth
 * @param {Date|string} dateOfBirth
 * @returns {number} - Age in years
 */
const calculateAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

export default {
  getFamilyMembers,
  getFamilyMemberById,
  createFamilyMember,
  updateFamilyMember,
  getFamilyMemberActivity,
  deleteFamilyMember,
  encryptMedicalNotes,
  decryptMedicalNotes,
  validateAgeUnder18,
  exportFamilyMembersCsv
};
