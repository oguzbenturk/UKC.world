import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import crypto from 'crypto';

// ───────────────────────────────────────────────────────────────────────────
// Share-code generation (unguessable public token)
// ───────────────────────────────────────────────────────────────────────────
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate an unguessable url-safe share code (default 16 chars base62 ≈ 95 bits).
 */
function generateShareCode(length = 16) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Default editable document (mirrors the ukc_quote_kit prototype shape)
// ───────────────────────────────────────────────────────────────────────────
export function buildDefaultContent() {
  return {
    brand: {
      title: 'DUOTONE PRO CENTER URLA',
      subtitle: 'UKC  -  Urla, Izmir, Turkey',
      website: 'ukc.plannivo.com',
      footer_left: 'Duotone Pro Center Urla  (UKC)  |  Urla, Izmir, Turkey',
      footer_right: '',
    },
    sections: {
      intro: true,
      package_items: true,
      price_summary: true,
      included: true,
      schedule: true,
      benefits: true,
      terms: true,
    },
    intro: '',
    package_items: [],
    price_summary: {
      regular_total: '',
      savings: '',
      cash_price: '',
      regular_sub: '',
      savings_sub: '',
      cash_sub: '',
      _auto: { regular_total: true, savings: true, cash_price: true },
      _amounts: { regular_total: 0, savings: 0, cash_price: 0 },
    },
    included: [],
    schedule_note: '',
    schedule: [],
    benefits: [],
    terms: [],
  };
}

// Whitelist of fields a client is allowed to write into a proposal row.
const TOP_LEVEL_WRITABLE = [
  'title', 'prepared_for', 'customer_id', 'language', 'currency_code',
  'status', 'valid_until', 'regular_total', 'savings_total', 'cash_total',
  'is_template',
];

const VALID_STATUSES = ['draft', 'sent', 'accepted', 'expired', 'declined'];

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * List proposals (light — no heavy `content`), with optional filters.
 */
export async function listProposals({ status, q, customer_id, is_template = false } = {}) {
  const conditions = [`p.is_template = $1`];
  const params = [!!is_template];
  let i = 2;

  if (status) { conditions.push(`p.status = $${i++}`); params.push(status); }
  if (customer_id) { conditions.push(`p.customer_id = $${i++}`); params.push(customer_id); }
  if (q) {
    conditions.push(`(p.title ILIKE $${i} OR p.prepared_for ILIKE $${i})`);
    params.push(`%${q}%`);
    i += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      p.id, p.share_code, p.title, p.prepared_for, p.customer_id,
      p.language, p.currency_code, p.status, p.valid_until,
      p.regular_total, p.savings_total, p.cash_total,
      p.view_count, p.last_viewed_at, p.accepted_at,
      p.created_by, p.created_at, p.updated_at,
      (p.valid_until IS NOT NULL AND p.valid_until < CURRENT_DATE) AS is_expired,
      u.first_name || ' ' || u.last_name AS created_by_name,
      c.first_name || ' ' || c.last_name AS customer_name
    FROM proposals p
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN users c ON p.customer_id = c.id
    ${where}
    ORDER BY p.created_at DESC
  `;
  const result = await pool.query(query, params);
  return result.rows;
}

/** Full proposal (incl. content) by id — staff/authed view. */
export async function getProposalById(id) {
  const query = `
    SELECT p.*,
      (p.valid_until IS NOT NULL AND p.valid_until < CURRENT_DATE) AS is_expired,
      u.first_name || ' ' || u.last_name AS created_by_name,
      c.first_name || ' ' || c.last_name AS customer_name
    FROM proposals p
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN users c ON p.customer_id = c.id
    WHERE p.id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

/** Public-facing proposal by share code (no PII / internal fields). */
export async function getProposalByShareCode(code) {
  const result = await pool.query('SELECT * FROM proposals WHERE share_code = $1', [code]);
  const row = result.rows[0];
  if (!row) return null;

  const isExpired = row.valid_until && new Date(row.valid_until) < new Date(new Date().toDateString());

  // Public payload — deliberately excludes created_by, internal title, _source provenance.
  const content = row.content || {};
  return {
    share_code: row.share_code,
    prepared_for: row.prepared_for,
    language: row.language,
    currency_code: row.currency_code,
    status: isExpired ? 'expired' : row.status,
    valid_until: row.valid_until,
    is_expired: !!isExpired,
    accepted_at: row.accepted_at,
    content: stripInternalContent(content),
  };
}

/** Remove builder-only provenance/numeric helpers from public content. */
function stripInternalContent(content) {
  const clone = JSON.parse(JSON.stringify(content || {}));
  if (Array.isArray(clone.package_items)) {
    clone.package_items = clone.package_items.map((it) => {
      const { _source, _amounts, ...rest } = it;
      return rest;
    });
  }
  if (clone.price_summary && typeof clone.price_summary === 'object') {
    const { _amounts, _auto, ...rest } = clone.price_summary;
    clone.price_summary = rest;
  }
  return clone;
}

/** Create a new proposal with a unique share code. */
export async function createProposal(data, userId) {
  const content = data.content && Object.keys(data.content).length ? data.content : buildDefaultContent();
  const title = data.title || 'Untitled Proposal';

  // Retry on share_code unique collision (extremely unlikely).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shareCode = generateShareCode();
    try {
      const result = await pool.query(
        `INSERT INTO proposals
           (share_code, title, prepared_for, customer_id, language, currency_code,
            status, valid_until, regular_total, savings_total, cash_total, content, created_by, is_template)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          shareCode,
          title,
          data.prepared_for || null,
          data.customer_id || null,
          data.language || 'en',
          data.currency_code || 'EUR',
          VALID_STATUSES.includes(data.status) ? data.status : 'draft',
          data.valid_until || null,
          data.regular_total || 0,
          data.savings_total || 0,
          data.cash_total || 0,
          content,
          userId || null,
          !!data.is_template,
        ],
      );
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505' && attempt < 4) continue; // unique violation → retry
      throw error;
    }
  }
  throw new Error('Failed to generate a unique share code');
}

/** Partial update of an existing proposal. */
export async function updateProposal(id, data) {
  const sets = [];
  const params = [];
  let i = 1;

  for (const key of TOP_LEVEL_WRITABLE) {
    if (data[key] !== undefined) {
      if (key === 'status' && !VALID_STATUSES.includes(data[key])) continue;
      sets.push(`${key} = $${i++}`);
      params.push(data[key] === '' ? null : data[key]);
    }
  }

  if (data.content !== undefined) {
    sets.push(`content = $${i++}`);
    params.push(data.content);
  }

  if (!sets.length) return getProposalById(id);

  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const result = await pool.query(
    `UPDATE proposals SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  return result.rows[0] || null;
}

/** Duplicate a proposal (new id + new share code, reset to draft).
 *  `asTemplate` saves the copy as a reusable template; `titleSuffix` overrides the
 *  default "(copy)". When cloning FROM a template into a real proposal, pass
 *  asTemplate=false (default) — the clone becomes an editable draft. */
export async function duplicateProposal(id, userId, { asTemplate = false, titleSuffix } = {}) {
  const original = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
  const src = original.rows[0];
  if (!src) return null;

  const suffix = titleSuffix !== undefined ? titleSuffix : ' (copy)';
  return createProposal({
    title: `${src.title}${suffix}`,
    prepared_for: asTemplate ? null : src.prepared_for,
    customer_id: asTemplate ? null : src.customer_id,
    language: src.language,
    currency_code: src.currency_code,
    status: 'draft',
    valid_until: src.valid_until,
    regular_total: src.regular_total,
    savings_total: src.savings_total,
    cash_total: src.cash_total,
    content: src.content,
    is_template: asTemplate,
  }, userId);
}

export async function deleteProposal(id) {
  const result = await pool.query('DELETE FROM proposals WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

/** Set status (+ optional accepted_at stamp). */
export async function setStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) throw new Error('Invalid status');
  const acceptedClause = status === 'accepted' ? ', accepted_at = CURRENT_TIMESTAMP' : '';
  const result = await pool.query(
    `UPDATE proposals SET status = $1, updated_at = CURRENT_TIMESTAMP${acceptedClause}
     WHERE id = $2 RETURNING *`,
    [status, id],
  );
  return result.rows[0] || null;
}

/** Increment view counter on public open. */
export async function recordView(code) {
  await pool.query(
    `UPDATE proposals
       SET view_count = view_count + 1, last_viewed_at = CURRENT_TIMESTAMP
     WHERE share_code = $1`,
    [code],
  );
}

/** Customer accepts the proposal (idempotent). */
export async function acceptProposalByCode(code) {
  const result = await pool.query(
    `UPDATE proposals
       SET status = 'accepted', accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
     WHERE share_code = $1
       AND status NOT IN ('declined')
       AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
     RETURNING id, status, accepted_at`,
    [code],
  );
  return result.rows[0] || null;
}
