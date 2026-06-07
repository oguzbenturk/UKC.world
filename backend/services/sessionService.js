// Session invalidation: force a user to re-authenticate mid-session when their
// access level changes (e.g. an admin changes their role). Without this, the role
// is baked into the access JWT at login and authorizeRoles trusts the token's role
// (auth.js), so a role change leaves the old token granting the OLD role until it
// expires — producing confusing 403s when the frontend (which reads the fresh role
// from /auth/me) shows the new UI but API calls fail.
//
// Two layers, so the fix degrades gracefully if Redis is unavailable:
//   1. Redis marker `session_revoked_after:<userId>` = epoch seconds of the change.
//      authenticateJWT rejects any access token whose `iat` predates it (immediate).
//   2. revokeAllForUser() revokes the rotating refresh tokens (DB), so a stale
//      session cannot silently renew past the access token's lifetime.
import { cacheService } from './cacheService.js';
import { revokeAllForUser } from './refreshTokenService.js';
import { logger } from '../middlewares/errorHandler.js';

const SESSION_REVOKE_PREFIX = 'session_revoked_after:';

// Parse a jsonwebtoken-style duration (number = seconds, '45s'/'30m'/'2h'/'7d',
// or a bare numeric string = seconds) into seconds. Falls back to 24h.
function parseExpirySeconds(value, fallback = 24 * 60 * 60) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = s.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return n * mult;
}

// The marker only needs to outlive the longest-lived access token minted before the
// change; after that, every pre-change token is already expired. Add a small buffer
// and a sane floor.
const MARKER_TTL_SECONDS = Math.max(parseExpirySeconds(process.env.TOKEN_EXPIRY) + 60, 300);

/**
 * Invalidate all of a user's existing sessions. Call after a role/permission change.
 * Non-fatal: logs and continues if a layer fails, so the triggering action (e.g. the
 * role update) still succeeds.
 * @param {string} userId
 * @param {object} [opts]
 * @param {string} [opts.reason] - free-text reason for logging.
 */
export async function invalidateUserSessions(userId, { reason = 'security_change' } = {}) {
  if (!userId) return;
  const nowSeconds = Math.floor(Date.now() / 1000);
  try {
    await cacheService.set(`${SESSION_REVOKE_PREFIX}${userId}`, nowSeconds, MARKER_TTL_SECONDS);
  } catch (err) {
    logger.warn('invalidateUserSessions: failed to set access-token marker', { userId, error: err.message });
  }
  try {
    await revokeAllForUser(userId);
  } catch (err) {
    logger.warn('invalidateUserSessions: failed to revoke refresh tokens', { userId, error: err.message });
  }
  logger.info('User sessions invalidated', { userId, reason });
}

/**
 * Return the epoch-seconds threshold before which this user's access tokens are
 * invalid, or null if none. Resilient: returns null on any error so auth never
 * breaks when Redis is down.
 * @param {string} userId
 * @returns {Promise<number|null>}
 */
export async function getSessionRevokedAfter(userId) {
  if (!userId) return null;
  try {
    const value = await cacheService.get(`${SESSION_REVOKE_PREFIX}${userId}`);
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

export default { invalidateUserSessions, getSessionRevokedAfter };
