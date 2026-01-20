import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const MIN_RETENTION_YEARS = 7;
const CONFIGURED_RETENTION_YEARS = Number.parseInt(process.env.AUDIT_LOG_RETENTION_YEARS || `${MIN_RETENTION_YEARS}`, 10);
const RETENTION_YEARS = Number.isFinite(CONFIGURED_RETENTION_YEARS)
  ? Math.max(CONFIGURED_RETENTION_YEARS, MIN_RETENTION_YEARS)
  : MIN_RETENTION_YEARS;
const RETENTION_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

let lastPruneTimestamp = 0;

const toJsonb = (value) => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }
    sanitized[key] = entry;
  }

  return sanitized;
};

async function enforceRetention({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastPruneTimestamp < RETENTION_PRUNE_INTERVAL_MS) {
    return;
  }

  lastPruneTimestamp = now;

  try {
    await pool.query('DELETE FROM audit_logs WHERE retain_until <= NOW()');
  } catch (error) {
    logger.warn('Failed to enforce audit log retention policy', {
      error: error.message
    });
  }
}

export async function logAuditEvent({
  eventType,
  action,
  resourceType,
  resourceId = null,
  actorUserId = null,
  targetUserId = null,
  familyMemberId = null,
  waiverId = null,
  description = null,
  metadata = null,
  ipAddress = null,
  userAgent = null
}) {
  if (!eventType || !action || !resourceType) {
    throw new Error('eventType, action, and resourceType are required for audit log entries');
  }

  const cleanedMetadata = toJsonb(metadata);

  try {
    const result = await pool.query(
      `INSERT INTO audit_logs (
        event_type,
        action,
        resource_type,
        resource_id,
        actor_user_id,
        target_user_id,
        family_member_id,
        waiver_id,
        description,
        metadata,
        ip_address,
        user_agent,
        retain_until
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, NOW() + make_interval(years => $13)
      )
      RETURNING id`,
      [
        eventType,
        action,
        resourceType,
        resourceId,
        actorUserId,
        targetUserId,
        familyMemberId,
        waiverId,
        description,
        JSON.stringify(cleanedMetadata),
        ipAddress,
        userAgent,
        RETENTION_YEARS
      ]
    );

    await enforceRetention();

    return result.rows[0]?.id || null;
  } catch (error) {
    logger.error('Failed to persist audit log entry', {
      error: error.message,
      eventType,
      action,
      resourceType
    });
    return null;
  }
}

export async function logWaiverView({
  actorUserId,
  targetUserId = null,
  familyMemberId = null,
  waiverId = null,
  metadata = {},
  ipAddress = null,
  userAgent = null
}) {
  return logAuditEvent({
    eventType: 'waiver.view',
    action: 'view',
    resourceType: 'waiver',
    resourceId: waiverId,
    actorUserId,
    targetUserId,
    familyMemberId,
    waiverId,
    metadata,
    ipAddress,
    userAgent
  });
}

export async function logWaiverModification({
  actorUserId,
  waiverId = null,
  targetUserId = null,
  familyMemberId = null,
  action = 'update',
  description = null,
  metadata = {},
  ipAddress = null,
  userAgent = null
}) {
  return logAuditEvent({
    eventType: 'waiver.modify',
    action,
    resourceType: 'waiver',
    resourceId: waiverId,
    actorUserId,
    targetUserId,
    familyMemberId,
    waiverId,
    description,
    metadata,
    ipAddress,
    userAgent
  });
}

export async function logFamilyMemberChange({
  actorUserId,
  familyMemberId = null,
  targetUserId = null,
  action,
  description = null,
  metadata = {},
  ipAddress = null,
  userAgent = null
}) {
  return logAuditEvent({
    eventType: 'family_member.change',
    action,
    resourceType: 'family_member',
    resourceId: familyMemberId,
    actorUserId,
    targetUserId,
    familyMemberId,
    description,
    metadata,
    ipAddress,
    userAgent
  });
}

export async function queryAuditLogs({
  resourceType,
  eventType,
  actorUserId,
  targetUserId,
  familyMemberId,
  waiverId,
  startDate,
  endDate,
  limit = 100,
  offset = 0
} = {}) {
  const cappedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 500);
  const normalizedOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);

  const conditions = [];
  const values = [];
  let idx = 1;

  const addCondition = (clause, value, transform) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    const finalValue = transform ? transform(value) : value;
    conditions.push(clause.replace('$idx', `$${idx}`));
    values.push(finalValue);
    idx += 1;
  };

  addCondition('resource_type = $idx', resourceType);
  addCondition('event_type = $idx', eventType);
  addCondition('actor_user_id = $idx', actorUserId);
  addCondition('target_user_id = $idx', targetUserId);
  addCondition('family_member_id = $idx', familyMemberId);
  addCondition('waiver_id = $idx', waiverId);
  addCondition('created_at >= $idx', startDate, (value) => new Date(value));
  addCondition('created_at <= $idx', endDate, (value) => new Date(value));

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      id,
      event_type AS "eventType",
      action,
      resource_type AS "resourceType",
      resource_id AS "resourceId",
      actor_user_id AS "actorUserId",
      target_user_id AS "targetUserId",
      family_member_id AS "familyMemberId",
      waiver_id AS "waiverId",
      description,
      metadata,
      ip_address AS "ipAddress",
      user_agent AS "userAgent",
      created_at AS "createdAt",
      retain_until AS "retainUntil"
    FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const { rows } = await pool.query(query, [...values, cappedLimit, normalizedOffset]);

  return {
    rows,
    pagination: {
      limit: cappedLimit,
      offset: normalizedOffset
    }
  };
}

export async function forceRetentionSweep() {
  await enforceRetention({ force: true });
}
