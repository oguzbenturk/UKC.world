import { logger } from '../middlewares/errorHandler.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeActorId = (candidate, meta = {}) => {
  if (!candidate) {
    return null;
  }

  const value = String(candidate);

  if (!UUID_REGEX.test(value)) {
    logger.warn('Invalid actor identifier supplied for audit trail', {
      candidate: value,
      ...meta
    });
    return null;
  }

  return value;
};

/**
 * Safely resolve the acting user's UUID for audit columns.
 * Falls back to null if no authenticated user is associated with the request.
 *
 * @param {import('express').Request} req
 * @param {{ fallbackToSystem?: boolean }} [options]
 * @returns {string|null}
 */
export const resolveActorId = (req, options = {}) => {
  if (!req) {
    return options.fallbackToSystem ? resolveSystemActorId() : null;
  }

  const candidate =
    req.user?.id ||
    req.user?.user_id ||
    req.user?.userId ||
    req.auth?.userId ||
    req.session?.userId ||
    null;

  const resolved = normalizeActorId(candidate, {
    sourceKeys: Object.keys(req.user || {}),
    resolver: 'resolveActorId'
  });

  if (resolved) {
    return resolved;
  }

  return options.fallbackToSystem ? resolveSystemActorId() : null;
};

/**
 * Resolve the configured system actor UUID (for automated flows like webhooks).
 * Checks multiple environment variable fallbacks; returns null if none or invalid.
 *
 * @returns {string|null}
 */
export const resolveSystemActorId = () => {
  const candidate =
    process.env.SYSTEM_ACTOR_USER_ID ||
    process.env.AUDIT_SYSTEM_USER_ID ||
    process.env.SYSTEM_USER_ID ||
    null;

  const resolved = normalizeActorId(candidate, { resolver: 'resolveSystemActorId' });

  if (!resolved && candidate) {
    logger.error('Configured system actor identifier is not a valid UUID; audit trail entries will be null', {
      candidate
    });
  }

  return resolved;
};

/**
 * Convenience helper to append audit columns to SQL INSERT clause definitions.
 * Returns a tuple of column fragment and value array extension for parameterized queries.
 *
 * @param {string[]} columns existing column names
 * @param {any[]} values existing parameter array
 * @param {string|null} actorId resolved user id
 * @param {Object} [options]
 * @param {boolean} [options.includeUpdated=false] whether to include updated_by placeholder alongside created_by
 * @returns {{ columns: string[], values: any[] }}
 */
export const appendCreatedBy = (columns, values, actorId, options = {}) => {
  const nextColumns = [...columns, 'created_by'];
  const nextValues = [...values, actorId ?? null];

  if (options.includeUpdated) {
    nextColumns.push('updated_by');
    nextValues.push(actorId ?? null);
  }

  return { columns: nextColumns, values: nextValues };
};
