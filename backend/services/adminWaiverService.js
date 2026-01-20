import { pool } from '../db.js';
import {
  generateSignaturePublicUrl,
  checkWaiverStatus,
  getWaiverHistory
} from './waiverService.js';
import { logWaiverView } from './auditLogService.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const WAIVER_EXPIRY_DAYS = Number.isFinite(Number.parseInt(process.env.WAIVER_EXPIRY_DAYS, 10))
  ? Math.max(Number.parseInt(process.env.WAIVER_EXPIRY_DAYS, 10), 1)
  : 365;

const BASE_DATA_CTE = `
WITH latest_waivers AS (
  SELECT
    lw.*,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(lw.user_id::text, lw.family_member_id::text)
      ORDER BY lw.signed_at DESC NULLS LAST, lw.created_at DESC NULLS LAST
    ) AS row_number
  FROM liability_waivers lw
),
subjects AS (
  SELECT
    u.id::text AS subject_id,
    'user'::text AS subject_type,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
      NULLIF(TRIM(u.name), ''),
      u.email,
      'Unnamed Student'
    ) AS display_name,
    u.first_name,
    u.last_name,
    u.email,
    NULL::uuid AS parent_user_id,
    NULL::text AS relationship,
    u.created_at
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
  WHERE COALESCE(r.name, 'student') IN ('student', 'customer')
  UNION ALL
  SELECT
    fm.id::text AS subject_id,
    'family'::text AS subject_type,
    COALESCE(NULLIF(TRIM(fm.full_name), ''), 'Family Member') AS display_name,
    NULL::text AS first_name,
    NULL::text AS last_name,
    NULL::text AS email,
    fm.parent_user_id,
    fm.relationship,
    fm.created_at
  FROM family_members fm
  WHERE fm.deleted_at IS NULL
),
latest_versions AS (
  SELECT DISTINCT ON (wv.language_code)
    wv.language_code,
    wv.version_number,
    wv.effective_date,
    wv.created_at
  FROM waiver_versions wv
  WHERE wv.is_active = true
  ORDER BY wv.language_code, wv.effective_date DESC NULLS LAST, wv.created_at DESC NULLS LAST
),
base_data AS (
  SELECT
    s.subject_id,
    s.subject_type,
    s.display_name,
    s.first_name,
    s.last_name,
    s.email,
    COALESCE(s.email, parent.email) AS contact_email,
    s.parent_user_id,
    s.relationship,
    s.created_at,
    parent.id AS parent_id,
    parent.first_name AS parent_first_name,
    parent.last_name AS parent_last_name,
    parent.email AS parent_email,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', parent.first_name, parent.last_name)), ''), parent.email) AS parent_display_name,
    lw.id AS waiver_id,
    lw.signed_at,
    lw.waiver_version,
    COALESCE(lw.language_code, 'en') AS language_code,
    lw.photo_consent,
    lw.agreed_to_terms,
    lw.signer_user_id,
    signer.first_name AS signer_first_name,
    signer.last_name AS signer_last_name,
    signer.email AS signer_email,
    lw.signature_image_url,
    lw.ip_address,
    lw.user_agent,
    lw.created_at AS waiver_created_at,
  NULL::timestamp AS waiver_updated_at,
    lv.version_number AS latest_version,
    CASE
      WHEN lw.id IS NULL THEN 'missing'
      WHEN lw.signed_at < NOW() - INTERVAL '${WAIVER_EXPIRY_DAYS} days' THEN 'expired'
      WHEN lv.version_number IS NOT NULL AND lv.version_number <> lw.waiver_version THEN 'outdated'
      ELSE 'valid'
    END AS waiver_status,
    CASE
      WHEN lw.id IS NULL THEN 4
      WHEN lw.signed_at < NOW() - INTERVAL '${WAIVER_EXPIRY_DAYS} days' THEN 3
      WHEN lv.version_number IS NOT NULL AND lv.version_number <> lw.waiver_version THEN 2
      ELSE 1
    END AS waiver_status_rank
  FROM subjects s
  LEFT JOIN latest_waivers lw ON lw.row_number = 1 AND (
    (s.subject_type = 'user' AND lw.user_id::text = s.subject_id)
    OR (s.subject_type = 'family' AND lw.family_member_id::text = s.subject_id)
  )
  LEFT JOIN latest_versions lv ON lv.language_code = COALESCE(lw.language_code, 'en')
  LEFT JOIN users parent ON s.parent_user_id = parent.id
  LEFT JOIN users signer ON lw.signer_user_id = signer.id
)
`;

const STATUS_FILTERS = new Set(['valid', 'expired', 'outdated', 'missing', 'pending', 'signed']);
const TYPE_FILTERS = new Set(['user', 'family']);
const SORTABLE_COLUMNS = {
  name: 'display_name',
  signedAt: 'signed_at',
  status: 'waiver_status_rank',
  updated: 'waiver_created_at'
};

function buildWhereClause({ search, status, subjectType }, initialValues = [], alias = 'base_data') {
  const values = [...initialValues];
  const conditions = [];

  if (search && typeof search === 'string') {
    const trimmed = search.trim();
    if (trimmed) {
      const idx = values.length + 1;
      values.push(`%${trimmed}%`);
      conditions.push(`(${alias}.display_name ILIKE $${idx} OR ${alias}.email ILIKE $${idx} OR ${alias}.contact_email ILIKE $${idx} OR ${alias}.parent_display_name ILIKE $${idx})`);
    }
  }

  if (status && STATUS_FILTERS.has(status)) {
    if (status === 'pending') {
      conditions.push(`${alias}.waiver_status IN ('missing','expired','outdated')`);
    } else if (status === 'signed') {
      conditions.push(`${alias}.waiver_status != 'missing'`);
    } else {
      const idx = values.length + 1;
      values.push(status);
      conditions.push(`${alias}.waiver_status = $${idx}`);
    }
  }

  if (subjectType && TYPE_FILTERS.has(subjectType)) {
    const idx = values.length + 1;
    values.push(subjectType);
    conditions.push(`${alias}.subject_type = $${idx}`);
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, values };
}

function normalizePageSize(pageSize) {
  const parsed = Number.parseInt(pageSize, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function resolveSort(sortBy, sortDirection) {
  const columnKey = SORTABLE_COLUMNS[sortBy] ? sortBy : 'name';
  const column = SORTABLE_COLUMNS[columnKey];
  const direction = (typeof sortDirection === 'string' && sortDirection.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';

  if (columnKey === 'status') {
    return `${column} ${direction}, display_name ASC`;
  }

  if (columnKey === 'signedAt') {
    return `${column} ${direction} NULLS LAST, display_name ASC`;
  }

  if (columnKey === 'updated') {
    return `${column} ${direction} NULLS LAST, display_name ASC`;
  }

  return `${column} ${direction}, subject_id ASC`;
}

function mapRowToSummary(row) {
  const parent = row.parent_user_id ? {
    id: row.parent_id,
    name: row.parent_display_name,
    email: row.parent_email
  } : null;

  const signer = row.signer_user_id ? {
    id: row.signer_user_id,
    name: [row.signer_first_name, row.signer_last_name].filter(Boolean).join(' ').trim() || row.signer_email || null,
    email: row.signer_email || null
  } : null;

  return {
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    name: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    contactEmail: row.contact_email,
    relationship: row.relationship,
    parent,
    status: row.waiver_status,
    signedAt: row.signed_at,
    waiverId: row.waiver_id,
    waiverVersion: row.waiver_version,
    latestVersion: row.latest_version,
    languageCode: row.language_code,
    photoConsent: row.photo_consent,
    signer,
    signatureUrl: generateSignaturePublicUrl(row.signature_image_url),
    ipAddress: row.ip_address,
    userAgent: row.user_agent
  };
}

export async function listAdminWaivers({
  page = 1,
  pageSize,
  search,
  status,
  subjectType,
  sortBy,
  sortDirection
} = {}) {
  const normalizedPage = Number.isFinite(Number.parseInt(page, 10)) && Number.parseInt(page, 10) > 0
    ? Number.parseInt(page, 10)
    : 1;
  const normalizedPageSize = normalizePageSize(pageSize);
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const { clause, values } = buildWhereClause({ search, status, subjectType }, [], 'bd');
  const orderBy = resolveSort(sortBy, sortDirection);

  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;
  values.push(normalizedPageSize, offset);

  const query = `${BASE_DATA_CTE}
  SELECT
    bd.subject_id,
    bd.subject_type,
    bd.display_name,
    bd.first_name,
    bd.last_name,
    bd.email,
    bd.contact_email,
    bd.parent_user_id,
    bd.parent_id,
    bd.parent_first_name,
    bd.parent_last_name,
    bd.parent_email,
    bd.parent_display_name,
    bd.relationship,
    bd.waiver_id,
    bd.waiver_status,
    bd.signed_at,
    bd.waiver_version,
    bd.latest_version,
    bd.language_code,
    bd.photo_consent,
    bd.signer_user_id,
    bd.signer_first_name,
    bd.signer_last_name,
    bd.signer_email,
    bd.signature_image_url,
    bd.ip_address,
    bd.user_agent,
    COUNT(*) OVER() AS total_count
  FROM base_data bd
  ${clause}
  ORDER BY ${orderBy}
  LIMIT $${limitIdx} OFFSET $${offsetIdx};`;

  const { rows } = await pool.query(query, values);
  const totalCount = rows.length > 0 ? Number.parseInt(rows[0].total_count, 10) : 0;
  const pageCount = totalCount > 0 ? Math.ceil(totalCount / normalizedPageSize) : 0;

  return {
    items: rows.map(mapRowToSummary),
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: totalCount,
      pageCount
    }
  };
}

export async function getAdminWaiverDetail({
  subjectId,
  subjectType,
  actorUserId,
  ipAddress,
  userAgent
}) {
  if (!subjectId || !subjectType || !TYPE_FILTERS.has(subjectType)) {
    throw new Error('subjectId and valid subjectType are required');
  }

  const typeKey = subjectType === 'family' ? 'family' : 'user';

  const detailQuery = `${BASE_DATA_CTE}
  SELECT * FROM base_data WHERE subject_id = $1 AND subject_type = $2 LIMIT 1;`;

  const { rows } = await pool.query(detailQuery, [subjectId, typeKey]);

  if (rows.length === 0) {
    return null;
  }

  const subjectRow = rows[0];
  const subjectSummary = mapRowToSummary(subjectRow);

  const waiverType = subjectType === 'family' ? 'family_member' : 'user';
  const [status, history] = await Promise.all([
    checkWaiverStatus(subjectId, waiverType),
    getWaiverHistory(subjectId, waiverType)
  ]);

  await logWaiverView({
    actorUserId,
    waiverId: subjectSummary.waiverId || null,
    targetUserId: subjectType === 'family' ? subjectRow.parent_user_id : subjectId,
    familyMemberId: subjectType === 'family' ? subjectId : null,
    metadata: {
      viewScope: 'admin-waiver-detail',
      subjectType,
      subjectId
    },
    ipAddress,
    userAgent
  }).catch(() => null);

  return {
    subject: subjectSummary,
    status,
    history
  };
}

export async function getAdminWaiverStats({ search, status, subjectType } = {}) {
  const { clause, values } = buildWhereClause({ search, status, subjectType }, [], 'bd');

  const statsQuery = `${BASE_DATA_CTE}
  SELECT
    COUNT(*) FILTER (WHERE bd.subject_type = 'user') AS total_users,
    COUNT(*) FILTER (WHERE bd.subject_type = 'family') AS total_family,
    COUNT(*) FILTER (WHERE bd.subject_type = 'user' AND bd.waiver_status = 'valid') AS users_valid,
    COUNT(*) FILTER (WHERE bd.subject_type = 'user' AND bd.waiver_status IN ('missing','expired','outdated')) AS users_pending,
    COUNT(*) FILTER (WHERE bd.subject_type = 'family' AND bd.waiver_status = 'valid') AS family_valid,
    COUNT(*) FILTER (WHERE bd.subject_type = 'family' AND bd.waiver_status IN ('missing','expired','outdated')) AS family_pending,
    COUNT(*) FILTER (WHERE bd.waiver_status = 'valid') AS total_valid,
    COUNT(*) FILTER (WHERE bd.waiver_status = 'outdated') AS total_outdated,
    COUNT(*) FILTER (WHERE bd.waiver_status = 'expired') AS total_expired,
    COUNT(*) FILTER (WHERE bd.waiver_status = 'missing') AS total_missing
  FROM base_data bd
  ${clause};`;

  const { rows } = await pool.query(statsQuery, values);
  const stats = rows[0] || {};

  const usersTotal = Number.parseInt(stats.total_users || 0, 10);
  const familyTotal = Number.parseInt(stats.total_family || 0, 10);
  const usersValid = Number.parseInt(stats.users_valid || 0, 10);
  const familyValid = Number.parseInt(stats.family_valid || 0, 10);
  const totalValid = Number.parseInt(stats.total_valid || 0, 10);
  const totalOutdated = Number.parseInt(stats.total_outdated || 0, 10);
  const totalExpired = Number.parseInt(stats.total_expired || 0, 10);
  const totalMissing = Number.parseInt(stats.total_missing || 0, 10);

  const totalSubjects = usersTotal + familyTotal;
  const totalPending = totalSubjects - totalValid;

  return {
    totals: {
      users: usersTotal,
      family: familyTotal,
      subjects: totalSubjects
    },
    valid: {
      users: usersValid,
      family: familyValid,
      overall: totalValid
    },
    pending: {
      users: Number.parseInt(stats.users_pending || 0, 10),
      family: Number.parseInt(stats.family_pending || 0, 10),
      overall: totalPending
    },
    breakdown: {
      valid: totalValid,
      outdated: totalOutdated,
      expired: totalExpired,
      missing: totalMissing
    },
    completionRate: totalSubjects > 0 ? Math.round((totalValid / totalSubjects) * 1000) / 10 : 0
  };
}

function buildCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value).replace(/"/g, '""');
  if (str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str}"`;
  }
  return str;
}

export async function exportAdminWaiversCsv({ search, status, subjectType } = {}) {
  const { clause, values } = buildWhereClause({ search, status, subjectType }, [], 'bd');
  const exportQuery = `${BASE_DATA_CTE}
  SELECT
    bd.subject_id,
    bd.subject_type,
    bd.display_name,
    bd.email,
    bd.contact_email,
    bd.parent_display_name,
    bd.parent_email,
    bd.relationship,
    bd.waiver_status,
    bd.signed_at,
    bd.waiver_version,
    bd.latest_version,
    bd.language_code,
    bd.photo_consent,
    bd.signer_first_name,
    bd.signer_last_name,
    bd.signer_email
  FROM base_data bd
  ${clause}
  ORDER BY bd.display_name ASC;`;

  const { rows } = await pool.query(exportQuery, values);

  const header = [
    'Subject Name',
    'Type',
    'Email',
    'Contact Email',
    'Parent / Guardian',
    'Parent Email',
    'Relationship',
    'Status',
    'Signed At',
    'Waiver Version',
    'Latest Version',
    'Language',
    'Photo Consent',
    'Signer Name',
    'Signer Email'
  ];

  const lines = [header.join(',')];

  for (const row of rows) {
    const signerName = [row.signer_first_name, row.signer_last_name].filter(Boolean).join(' ').trim();
    const record = [
      buildCsvValue(row.display_name),
      buildCsvValue(row.subject_type),
      buildCsvValue(row.email || ''),
      buildCsvValue(row.contact_email || ''),
      buildCsvValue(row.parent_display_name || ''),
      buildCsvValue(row.parent_email || ''),
      buildCsvValue(row.relationship || ''),
      buildCsvValue(row.waiver_status),
      buildCsvValue(row.signed_at ? new Date(row.signed_at).toISOString() : ''),
      buildCsvValue(row.waiver_version || ''),
      buildCsvValue(row.latest_version || ''),
      buildCsvValue(row.language_code || 'en'),
      buildCsvValue(row.photo_consent ? 'Yes' : 'No'),
      buildCsvValue(signerName),
      buildCsvValue(row.signer_email || '')
    ];

    lines.push(record.join(','));
  }

  return lines.join('\n');
}
