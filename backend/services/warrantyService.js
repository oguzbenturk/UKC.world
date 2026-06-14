import crypto from 'crypto';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { AppError, ValidationError, NotFoundError } from '../middlewares/errorHandler.js';

// ─── Tokens ──────────────────────────────────────────────────────────────────
// 8-character readable codes. Alphabet excludes 0/O/1/I/L to avoid confusion
// over phone or in a printed receipt. 31 chars × 8 positions ≈ 8.5 × 10^11
// combinations — collision-checked at insert time with up to MAX_RETRIES tries.

const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TOKEN_LENGTH = 8;
const MAX_TOKEN_RETRIES = 10;

function randomCode(length = TOKEN_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

async function generateUniqueToken(table, column) {
  for (let attempt = 0; attempt < MAX_TOKEN_RETRIES; attempt += 1) {
    const candidate = randomCode();
    const { rows } = await pool.query(
      `SELECT 1 FROM ${table} WHERE ${column} = $1 LIMIT 1`,
      [candidate]
    );
    if (rows.length === 0) return candidate;
  }
  throw new AppError('Could not allocate a unique warranty code', 500);
}

export const generateCustomerToken = () => generateUniqueToken('warranty_claims', 'customer_token');
export const generateStaffToken = () => generateUniqueToken('warranty_staff_links', 'staff_token');

// ─── Status transitions ──────────────────────────────────────────────────────

const STATUS_TRANSITIONS = {
  submitted:         ['under_review', 'rejected', 'closed'],
  under_review:      ['approved', 'rejected', 'with_manufacturer', 'awaiting_customer'],
  approved:          ['with_manufacturer', 'resolved', 'awaiting_customer'],
  with_manufacturer: ['awaiting_customer', 'resolved', 'rejected'],
  awaiting_customer: ['under_review', 'resolved', 'rejected', 'closed'],
  resolved:          ['closed'],
  rejected:          ['closed'],
  closed:            []
};

export const ALL_STATUSES = Object.keys(STATUS_TRANSITIONS);
export const TERMINAL_STATUSES = new Set(['closed']);
export const STAFF_ALLOWED_STATUSES = new Set([
  'under_review', 'approved', 'with_manufacturer', 'awaiting_customer', 'resolved'
]);

export function isValidTransition(from, to) {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Claim CRUD ──────────────────────────────────────────────────────────────

const CLAIM_COLUMNS = `
  id, customer_token, status,
  customer_name, customer_email, customer_phone,
  product_name, product_brand, product_model, product_serial,
  purchase_date, purchase_location, issue_description, preferred_language,
  total_bytes, photo_count, video_count, document_count, external_claim_number,
  external_claim_number_set_by_user_id, external_claim_number_set_by_staff_link_id,
  external_claim_number_set_by_name, external_claim_number_set_at,
  last_activity_notified_at,
  submitted_ip, submitted_user_agent,
  created_at, updated_at, deleted_at, closed_at
`;

export async function createClaim({
  customer_name,
  customer_email,
  customer_phone = null,
  product_name,
  product_brand = null,
  product_model = null,
  product_serial = null,
  purchase_date = null,
  purchase_location = null,
  issue_description,
  preferred_language = 'tr',
  submitted_ip = null,
  submitted_user_agent = null,
  external_claim_number = null,
  source = 'public_form',     // 'public_form' | 'admin'
  actor_user_id = null        // set when admin creates on behalf of customer
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const customerToken = await generateCustomerToken();

    const { rows: claimRows } = await client.query(
      `INSERT INTO warranty_claims (
        customer_token, customer_name, customer_email, customer_phone,
        product_name, product_brand, product_model, product_serial,
        purchase_date, purchase_location, issue_description,
        preferred_language, submitted_ip, submitted_user_agent,
        external_claim_number
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      RETURNING ${CLAIM_COLUMNS}`,
      [
        customerToken, customer_name, customer_email, customer_phone,
        product_name, product_brand, product_model, product_serial,
        purchase_date, purchase_location, issue_description,
        preferred_language, submitted_ip, submitted_user_agent,
        external_claim_number
      ]
    );

    const claim = claimRows[0];

    const actorKind = source === 'admin' ? 'admin' : 'customer';
    await client.query(
      `INSERT INTO warranty_claim_events
        (claim_id, event_type, actor_kind, actor_user_id, visible_to_customer, body, metadata)
       VALUES ($1, 'submitted', $2, $3, TRUE, NULL, $4::jsonb)`,
      [claim.id, actorKind, actor_user_id,
       JSON.stringify({ source, ...(external_claim_number ? { external_claim_number } : {}) })]
    );

    await client.query('COMMIT');
    return claim;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getClaimByCustomerToken(token, { includeDeleted = false } = {}) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT ${CLAIM_COLUMNS}
     FROM warranty_claims
     WHERE customer_token = $1
       ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
     LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

export async function getClaimById(id, { includeDeleted = false } = {}) {
  if (!id) return null;
  const { rows } = await pool.query(
    `SELECT ${CLAIM_COLUMNS}
     FROM warranty_claims
     WHERE id = $1
       ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function listClaims({
  status = null,
  q = null,
  page = 1,
  pageSize = 25,
  sort = 'created_desc'
} = {}) {
  const where = ['deleted_at IS NULL'];
  const params = [];

  if (status && ALL_STATUSES.includes(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  if (q && q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    const idx = params.length;
    where.push(`(
      LOWER(customer_name) LIKE $${idx} OR
      LOWER(customer_email) LIKE $${idx} OR
      LOWER(customer_token) LIKE $${idx} OR
      LOWER(product_name) LIKE $${idx} OR
      LOWER(COALESCE(external_claim_number, '')) LIKE $${idx}
    )`);
  }

  const orderBy = sort === 'created_asc' ? 'created_at ASC' : 'created_at DESC';
  const limit = Math.max(1, Math.min(100, Number(pageSize) || 25));
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;

  const { rows: items } = await pool.query(
    `SELECT ${CLAIM_COLUMNS}
     FROM warranty_claims
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM warranty_claims WHERE ${where.join(' AND ')}`,
    params
  );

  return {
    items,
    total: countRows[0]?.total ?? 0,
    page: Math.max(1, Number(page) || 1),
    pageSize: limit
  };
}

export async function getStatsForAdmin() {
  const { rows: byStatusRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM warranty_claims
     WHERE deleted_at IS NULL
     GROUP BY status`
  );
  const byStatus = byStatusRows.reduce((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, {});
  ALL_STATUSES.forEach((status) => { if (byStatus[status] === undefined) byStatus[status] = 0; });

  const open = ALL_STATUSES
    .filter((s) => s !== 'closed')
    .reduce((sum, s) => sum + (byStatus[s] || 0), 0);

  const { rows: weekRows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM warranty_claims
     WHERE deleted_at IS NULL
       AND created_at >= NOW() - INTERVAL '7 days'`
  );

  return {
    byStatus,
    openCount: open,
    last7d: weekRows[0]?.count ?? 0
  };
}

// ─── Status & note events ────────────────────────────────────────────────────

export async function updateClaimStatus(claimId, newStatus, {
  actorUserId = null,
  actorKind = 'admin',
  actorStaffLinkId = null,
  note = null
} = {}) {
  if (!ALL_STATUSES.includes(newStatus)) {
    throw new ValidationError(`Unknown status: ${newStatus}`);
  }
  if (actorKind === 'staff' && !STAFF_ALLOWED_STATUSES.has(newStatus)) {
    throw new ValidationError('Staff users cannot set this status');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: currentRows } = await client.query(
      `SELECT status FROM warranty_claims WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [claimId]
    );
    if (currentRows.length === 0) {
      throw new NotFoundError('Warranty claim not found');
    }
    const previous = currentRows[0].status;
    if (previous === newStatus) {
      await client.query('ROLLBACK');
      return getClaimById(claimId);
    }
    if (!isValidTransition(previous, newStatus)) {
      throw new ValidationError(`Invalid status transition from ${previous} to ${newStatus}`);
    }
    if (newStatus === 'rejected' && (!note || !note.trim())) {
      throw new ValidationError('A note is required when rejecting a claim');
    }

    const { rows } = await client.query(
      `UPDATE warranty_claims
         SET status = $1,
             closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE closed_at END
       WHERE id = $2
       RETURNING ${CLAIM_COLUMNS}`,
      [newStatus, claimId]
    );

    await client.query(
      `INSERT INTO warranty_claim_events
        (claim_id, event_type, actor_kind, actor_user_id, actor_staff_link_id,
         visible_to_customer, body, metadata)
       VALUES ($1, 'status_change', $2, $3, $4, TRUE, $5, $6::jsonb)`,
      [
        claimId, actorKind, actorUserId, actorStaffLinkId,
        note || null,
        JSON.stringify({ from: previous, to: newStatus })
      ]
    );

    await client.query('COMMIT');
    return { claim: rows[0], previous, next: newStatus };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function addNote(claimId, {
  body,
  visibleToCustomer,
  actorKind,
  actorUserId = null,
  actorStaffLinkId = null
}) {
  if (!body || !body.trim()) throw new ValidationError('Note body is required');
  if (typeof visibleToCustomer !== 'boolean') {
    throw new ValidationError('visibleToCustomer must be a boolean');
  }
  if (!['admin', 'staff', 'system'].includes(actorKind)) {
    throw new ValidationError('Invalid actor kind for note');
  }

  const exists = await getClaimById(claimId);
  if (!exists) throw new NotFoundError('Warranty claim not found');

  const { rows } = await pool.query(
    `INSERT INTO warranty_claim_events
      (claim_id, event_type, actor_kind, actor_user_id, actor_staff_link_id,
       visible_to_customer, body, metadata)
     VALUES ($1, 'note', $2, $3, $4, $5, $6, '{}'::jsonb)
     RETURNING id, event_type, actor_kind, actor_user_id, actor_staff_link_id,
               visible_to_customer, body, metadata, created_at`,
    [claimId, actorKind, actorUserId, actorStaffLinkId, visibleToCustomer, body.trim()]
  );
  return rows[0];
}

export async function addCustomerUpdate(claimId, { body, actorUserId }) {
  if (!body || !body.trim()) throw new ValidationError('Update body is required');
  const exists = await getClaimById(claimId);
  if (!exists) throw new NotFoundError('Warranty claim not found');
  const { rows } = await pool.query(
    `INSERT INTO warranty_claim_events
      (claim_id, event_type, actor_kind, actor_user_id,
       visible_to_customer, body, metadata)
     VALUES ($1, 'customer_update', 'admin', $2, TRUE, $3, '{}'::jsonb)
     RETURNING id, event_type, actor_kind, actor_user_id,
               visible_to_customer, body, metadata, created_at`,
    [claimId, actorUserId, body.trim()]
  );
  return { event: rows[0], claim: exists };
}

export async function getClaimEvents(claimId, { visibleToCustomerOnly = false, since = null } = {}) {
  const params = [claimId];
  let sinceClause = '';
  if (since) {
    params.push(since);
    sinceClause = `AND e.created_at > $${params.length}`;
  }
  // LEFT JOIN resolves the actor's display name so the timeline can show
  // "who" did each action (staff member name or admin name). Customer-actor
  // events resolve to NULL here and render as the generic "Customer" badge.
  const { rows } = await pool.query(
    `SELECT e.id, e.event_type, e.actor_kind, e.actor_user_id, e.actor_staff_link_id,
            e.visible_to_customer, e.body, e.metadata, e.created_at,
            COALESCE(u.name, sl.staff_name) AS actor_name
     FROM warranty_claim_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     LEFT JOIN warranty_staff_links sl ON sl.id = e.actor_staff_link_id
     WHERE e.claim_id = $1
       ${visibleToCustomerOnly ? 'AND e.visible_to_customer = TRUE' : ''}
       ${sinceClause}
     ORDER BY e.created_at ASC`,
    params
  );
  return rows;
}

// ─── Soft delete & close ─────────────────────────────────────────────────────

export async function softDeleteClaim(claimId, { actorUserId }) {
  const claim = await getClaimById(claimId);
  if (!claim) throw new NotFoundError('Warranty claim not found');

  await pool.query(
    `UPDATE warranty_claims SET deleted_at = NOW() WHERE id = $1`,
    [claimId]
  );
  await pool.query(
    `INSERT INTO warranty_claim_events
      (claim_id, event_type, actor_kind, actor_user_id,
       visible_to_customer, body, metadata)
     VALUES ($1, 'claim_deleted', 'admin', $2, FALSE, NULL, '{}'::jsonb)`,
    [claimId, actorUserId]
  );
  return claim;
}

export async function closeClaim(claimId, { actorUserId }) {
  const result = await updateClaimStatus(claimId, 'closed', { actorUserId, actorKind: 'admin' });
  await pool.query(
    `INSERT INTO warranty_claim_events
      (claim_id, event_type, actor_kind, actor_user_id,
       visible_to_customer, body, metadata)
     VALUES ($1, 'claim_closed', 'admin', $2, TRUE, NULL, '{}'::jsonb)`,
    [claimId, actorUserId]
  );
  return result.claim;
}

export async function logLinkResent(claimId, { actorUserId, target = 'customer' }) {
  await pool.query(
    `INSERT INTO warranty_claim_events
      (claim_id, event_type, actor_kind, actor_user_id,
       visible_to_customer, body, metadata)
     VALUES ($1, 'link_resent', 'admin', $2, FALSE, NULL, $3::jsonb)`,
    [claimId, actorUserId, JSON.stringify({ target })]
  );
}

// ─── Media ───────────────────────────────────────────────────────────────────

const MEDIA_COLUMNS = `
  id, claim_id, kind, filename, original_name, size_bytes, mime_type,
  storage_path, uploaded_by_kind, uploaded_by_user_id, uploaded_by_staff_link_id,
  created_at
`;

export async function listClaimMedia(claimId) {
  // Resolve the uploader's display name (staff member or admin) so galleries
  // and the ZIP manifest can attribute each file. Customer uploads have no
  // user/staff-link and surface uploader_name = NULL.
  const { rows } = await pool.query(
    `SELECT m.id, m.claim_id, m.kind, m.filename, m.original_name, m.size_bytes,
            m.mime_type, m.storage_path, m.uploaded_by_kind, m.uploaded_by_user_id,
            m.uploaded_by_staff_link_id, m.created_at,
            COALESCE(u.name, sl.staff_name) AS uploader_name
     FROM warranty_claim_media m
     LEFT JOIN users u ON u.id = m.uploaded_by_user_id
     LEFT JOIN warranty_staff_links sl ON sl.id = m.uploaded_by_staff_link_id
     WHERE m.claim_id = $1
     ORDER BY m.created_at ASC`,
    [claimId]
  );
  return rows;
}

export async function getMediaById(mediaId) {
  const { rows } = await pool.query(
    `SELECT ${MEDIA_COLUMNS} FROM warranty_claim_media WHERE id = $1 LIMIT 1`,
    [mediaId]
  );
  return rows[0] || null;
}

export async function attachMediaRecord({
  claimId,
  kind,
  filename,
  originalName,
  sizeBytes,
  mimeType,
  storagePath,
  uploadedByKind = 'customer',
  uploadedByUserId = null,
  uploadedByStaffLinkId = null
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: mediaRows } = await client.query(
      `INSERT INTO warranty_claim_media
        (claim_id, kind, filename, original_name, size_bytes, mime_type, storage_path,
         uploaded_by_kind, uploaded_by_user_id, uploaded_by_staff_link_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${MEDIA_COLUMNS}`,
      [claimId, kind, filename, originalName, sizeBytes, mimeType, storagePath,
       uploadedByKind, uploadedByUserId, uploadedByStaffLinkId]
    );

    await client.query(
      `UPDATE warranty_claims
         SET total_bytes    = total_bytes + $2,
             photo_count    = photo_count + CASE WHEN $3 = 'photo' THEN 1 ELSE 0 END,
             video_count    = video_count + CASE WHEN $3 = 'video' THEN 1 ELSE 0 END,
             document_count = document_count + CASE WHEN $3 = 'document' THEN 1 ELSE 0 END
       WHERE id = $1`,
      [claimId, sizeBytes, kind]
    );

    // Documents (the manufacturer Product Bill) are team-internal, so their
    // add/remove timeline entries must NOT surface on the customer tracking
    // page — otherwise the customer would see the document's name even though
    // the file itself is hidden from them.
    const mediaVisibleToCustomer = kind !== 'document';
    await client.query(
      `INSERT INTO warranty_claim_events
        (claim_id, event_type, actor_kind, actor_user_id, actor_staff_link_id,
         visible_to_customer, body, metadata)
       VALUES ($1, 'media_added', $2, $3, $4, $5, NULL, $6::jsonb)`,
      [claimId, uploadedByKind, uploadedByUserId, uploadedByStaffLinkId,
       mediaVisibleToCustomer,
       JSON.stringify({
         media_id: mediaRows[0].id, kind, original_name: originalName, size_bytes: sizeBytes
       })]
    );

    await client.query('COMMIT');
    return mediaRows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function detachMediaRecord(mediaId, {
  actorUserId = null,
  actorKind = 'admin',
  actorStaffLinkId = null
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `DELETE FROM warranty_claim_media
       WHERE id = $1
       RETURNING ${MEDIA_COLUMNS}`,
      [mediaId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Media not found');
    }
    const media = rows[0];

    await client.query(
      `UPDATE warranty_claims
         SET total_bytes    = GREATEST(0, total_bytes - $2),
             photo_count    = GREATEST(0, photo_count - CASE WHEN $3 = 'photo' THEN 1 ELSE 0 END),
             video_count    = GREATEST(0, video_count - CASE WHEN $3 = 'video' THEN 1 ELSE 0 END),
             document_count = GREATEST(0, document_count - CASE WHEN $3 = 'document' THEN 1 ELSE 0 END)
       WHERE id = $1`,
      [media.claim_id, media.size_bytes, media.kind]
    );

    // Mirror attachMediaRecord: a removed document stays off the customer
    // timeline (its existence was never disclosed to the customer).
    const mediaVisibleToCustomer = media.kind !== 'document';
    await client.query(
      `INSERT INTO warranty_claim_events
        (claim_id, event_type, actor_kind, actor_user_id, actor_staff_link_id,
         visible_to_customer, body, metadata)
       VALUES ($1, 'media_removed', $2, $3, $4, $5, NULL, $6::jsonb)`,
      [media.claim_id, actorKind, actorUserId, actorStaffLinkId,
       mediaVisibleToCustomer,
       JSON.stringify({
         media_id: media.id, kind: media.kind,
         original_name: media.original_name, size_bytes: media.size_bytes
       })]
    );

    await client.query('COMMIT');
    return media;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Staff links ─────────────────────────────────────────────────────────────

const STAFF_LINK_COLUMNS = `
  id, claim_id, staff_token, staff_user_id, staff_name, staff_email,
  claim_number_external, revoked_at, created_by_user_id, created_at
`;

export async function listStaffLinks(claimId, { includeRevoked = false } = {}) {
  const { rows } = await pool.query(
    `SELECT ${STAFF_LINK_COLUMNS}
     FROM warranty_staff_links
     WHERE claim_id = $1
       ${includeRevoked ? '' : 'AND revoked_at IS NULL'}
     ORDER BY created_at ASC`,
    [claimId]
  );
  return rows;
}

export async function createStaffLink(claimId, {
  staffName,
  staffEmail,
  staffUserId = null,
  createdByUserId
}) {
  if (!staffName || !staffName.trim()) throw new ValidationError('Staff name is required');
  if (!staffEmail || !staffEmail.trim()) throw new ValidationError('Staff email is required');

  const claim = await getClaimById(claimId);
  if (!claim) throw new NotFoundError('Warranty claim not found');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const staffToken = await generateStaffToken();

    const { rows } = await client.query(
      `INSERT INTO warranty_staff_links
        (claim_id, staff_token, staff_user_id, staff_name, staff_email, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${STAFF_LINK_COLUMNS}`,
      [claimId, staffToken, staffUserId, staffName.trim(), staffEmail.trim(), createdByUserId]
    );

    await client.query(
      `INSERT INTO warranty_claim_events
        (claim_id, event_type, actor_kind, actor_user_id,
         visible_to_customer, body, metadata)
       VALUES ($1, 'staff_assigned', 'admin', $2, FALSE, NULL, $3::jsonb)`,
      [claimId, createdByUserId, JSON.stringify({
        staff_link_id: rows[0].id, staff_name: staffName.trim(), staff_email: staffEmail.trim()
      })]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeStaffLink(linkId, { actorUserId }) {
  const { rows } = await pool.query(
    `UPDATE warranty_staff_links
       SET revoked_at = NOW()
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING ${STAFF_LINK_COLUMNS}`,
    [linkId]
  );
  if (rows.length === 0) {
    throw new NotFoundError('Staff link not found or already revoked');
  }
  const link = rows[0];
  await pool.query(
    `INSERT INTO warranty_claim_events
      (claim_id, event_type, actor_kind, actor_user_id,
       visible_to_customer, body, metadata)
     VALUES ($1, 'staff_revoked', 'admin', $2, FALSE, NULL, $3::jsonb)`,
    [link.claim_id, actorUserId, JSON.stringify({ staff_link_id: link.id })]
  );
  return link;
}

export async function getStaffLinkByToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT sl.${STAFF_LINK_COLUMNS.replace(/\n\s+/g, ' ').split(',').join(', sl.')},
            c.id AS claim_pk
     FROM warranty_staff_links sl
     JOIN warranty_claims c ON c.id = sl.claim_id
     WHERE sl.staff_token = $1
       AND sl.revoked_at IS NULL
       AND c.deleted_at IS NULL
     LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

export async function setStaffClaimNumber(linkId, { claimNumberExternal }) {
  if (!claimNumberExternal || !claimNumberExternal.trim()) {
    throw new ValidationError('Claim number is required');
  }
  const trimmed = claimNumberExternal.trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: linkRows } = await client.query(
      `SELECT id, claim_id, staff_name, staff_user_id
         FROM warranty_staff_links
        WHERE id = $1 AND revoked_at IS NULL`,
      [linkId]
    );
    if (linkRows.length === 0) {
      throw new NotFoundError('Staff link not found or revoked');
    }
    const link = linkRows[0];

    const { rows: claimRows } = await client.query(
      `SELECT id, external_claim_number, external_claim_number_set_by_staff_link_id
         FROM warranty_claims
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE`,
      [link.claim_id]
    );
    if (claimRows.length === 0) {
      throw new NotFoundError('Warranty claim not found');
    }
    const current = claimRows[0];

    // Ownership lock — once a manufacturer claim number exists, only the staff
    // link that originally set it may change it. An admin can still override
    // via setAdminClaimNumber(); doing so reassigns ownership to the admin and
    // locks every staff link out (set_by_staff_link_id becomes NULL).
    const ownedByThisLink = current.external_claim_number_set_by_staff_link_id === linkId;
    if (current.external_claim_number && current.external_claim_number.trim() && !ownedByThisLink) {
      throw new AppError(
        'This manufacturer claim number was set by another team member and is locked. Ask an admin to change it.',
        403
      );
    }

    await client.query(
      `UPDATE warranty_staff_links SET claim_number_external = $1 WHERE id = $2`,
      [trimmed, linkId]
    );

    const { rows: updatedClaim } = await client.query(
      `UPDATE warranty_claims
          SET external_claim_number = $1,
              external_claim_number_set_by_staff_link_id = $2,
              external_claim_number_set_by_user_id = $3,
              external_claim_number_set_by_name = $4,
              external_claim_number_set_at = NOW()
        WHERE id = $5 AND deleted_at IS NULL
        RETURNING ${CLAIM_COLUMNS}`,
      [trimmed, linkId, link.staff_user_id || null, link.staff_name, link.claim_id]
    );

    await client.query(
      `INSERT INTO warranty_claim_events
        (claim_id, event_type, actor_kind, actor_staff_link_id,
         visible_to_customer, body, metadata)
       VALUES ($1, 'claim_number_set', 'staff', $2, TRUE,
               'Manufacturer claim number recorded: ' || $3::text,
               $4::jsonb)`,
      [link.claim_id, linkId, trimmed,
       JSON.stringify({ claim_number_external: trimmed })]
    );

    await client.query('COMMIT');

    const { rows: linkOut } = await pool.query(
      `SELECT ${STAFF_LINK_COLUMNS} FROM warranty_staff_links WHERE id = $1`,
      [linkId]
    );
    return { link: linkOut[0] || null, claim: updatedClaim[0] || null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Admin override for the manufacturer claim number. Unlike the staff path this
// bypasses the ownership lock (admins are trusted to correct mistakes) and
// reassigns ownership to the acting admin, which locks staff links out until an
// admin changes it again. The override is recorded in the timeline.
export async function setAdminClaimNumber(claimId, { claimNumberExternal, actorUserId }) {
  if (!claimNumberExternal || !claimNumberExternal.trim()) {
    throw new ValidationError('Claim number is required');
  }
  const trimmed = claimNumberExternal.trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: claimRows } = await client.query(
      `SELECT id, external_claim_number, external_claim_number_set_by_name
         FROM warranty_claims
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE`,
      [claimId]
    );
    if (claimRows.length === 0) {
      throw new NotFoundError('Warranty claim not found');
    }
    const previous = claimRows[0];

    let actorName = null;
    if (actorUserId) {
      const { rows: userRows } = await client.query(
        `SELECT name FROM users WHERE id = $1`,
        [actorUserId]
      );
      actorName = userRows[0]?.name || null;
    }

    const { rows: updated } = await client.query(
      `UPDATE warranty_claims
          SET external_claim_number = $1,
              external_claim_number_set_by_user_id = $2,
              external_claim_number_set_by_staff_link_id = NULL,
              external_claim_number_set_by_name = $3,
              external_claim_number_set_at = NOW()
        WHERE id = $4 AND deleted_at IS NULL
        RETURNING ${CLAIM_COLUMNS}`,
      [trimmed, actorUserId || null, actorName, claimId]
    );

    const overrode = Boolean(
      previous.external_claim_number &&
      previous.external_claim_number.trim() &&
      previous.external_claim_number.trim() !== trimmed
    );

    await client.query(
      `INSERT INTO warranty_claim_events
        (claim_id, event_type, actor_kind, actor_user_id,
         visible_to_customer, body, metadata)
       VALUES ($1, 'claim_number_set', 'admin', $2, TRUE,
               'Manufacturer claim number recorded: ' || $3::text,
               $4::jsonb)`,
      [claimId, actorUserId || null, trimmed,
       JSON.stringify({
         claim_number_external: trimmed,
         ...(overrode ? { overrode_previous: previous.external_claim_number, override_by: previous.external_claim_number_set_by_name || null } : {})
       })]
    );

    await client.query('COMMIT');
    return { claim: updated[0] || null, overrode };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Activity notification helpers ───────────────────────────────────────────

/**
 * Recipients for activity-digest emails on a claim: the active (non-revoked)
 * staff links assigned to this claim, de-duplicated by lowercased email.
 *
 * Admins/managers are intentionally NOT included on every change — they still
 * receive the one-time "new warranty claim submitted" notification, but the
 * per-change digest is scoped to the people actually working the case so it
 * doesn't flood the whole management team.
 *
 * Each entry: { channel:'staff', email, name, userId, staffLinkId, token }
 */
export async function listClaimRecipients(claimId) {
  const { rows } = await pool.query(
    `SELECT id AS staff_link_id, staff_token, staff_name, staff_email, staff_user_id
       FROM warranty_staff_links
      WHERE claim_id = $1 AND revoked_at IS NULL`,
    [claimId]
  );

  const byEmail = new Map();
  for (const s of rows) {
    if (!s.staff_email) continue;
    byEmail.set(s.staff_email.toLowerCase(), {
      channel: 'staff',
      email: s.staff_email,
      name: s.staff_name,
      userId: s.staff_user_id || null,
      staffLinkId: s.staff_link_id,
      token: s.staff_token
    });
  }
  return Array.from(byEmail.values());
}

/**
 * Load everything the activity digest needs for one claim: the claim, the
 * events created since the last digest watermark, and the timestamp of the
 * newest such event (the watermark to advance to once emails are sent).
 */
export async function getActivityForDigest(claimId) {
  const claim = await getClaimById(claimId);
  if (!claim) return null;
  const events = await getClaimEvents(claimId, { since: claim.last_activity_notified_at || null });
  const latestTs = events.length ? events[events.length - 1].created_at : null;
  return { claim, events, latestTs };
}

export async function markActivityNotified(claimId, throughTs) {
  if (!claimId || !throughTs) return;
  await pool.query(
    `UPDATE warranty_claims SET last_activity_notified_at = $2 WHERE id = $1`,
    [claimId, throughTs]
  );
}

export default {
  generateCustomerToken,
  generateStaffToken,
  isValidTransition,
  ALL_STATUSES,
  STAFF_ALLOWED_STATUSES,
  createClaim,
  getClaimByCustomerToken,
  getClaimById,
  listClaims,
  getStatsForAdmin,
  updateClaimStatus,
  addNote,
  addCustomerUpdate,
  getClaimEvents,
  softDeleteClaim,
  closeClaim,
  logLinkResent,
  listClaimMedia,
  getMediaById,
  attachMediaRecord,
  detachMediaRecord,
  listStaffLinks,
  createStaffLink,
  revokeStaffLink,
  getStaffLinkByToken,
  setStaffClaimNumber,
  setAdminClaimNumber,
  listClaimRecipients,
  getActivityForDigest,
  markActivityNotified
};
