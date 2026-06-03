// Refresh-token service: rotating, server-side refresh tokens that let the short
// access JWT (TOKEN_EXPIRY, 2h in prod for SEC-008) be silently renewed without a
// re-login. Backs the always-on /music screen staying logged in.
//
// Security model:
//   • Each login starts a token "family" (familyId). Every refresh ROTATES the
//     token: the presented token is marked rotated and a fresh one is issued in the
//     same family.
//   • Only the SHA-256 hash of a token is stored — a DB read cannot mint sessions.
//   • Reuse detection: presenting an already-rotated token AFTER a short grace
//     window (benign-concurrency leeway for tabs sharing one httpOnly cookie) is
//     treated as theft and revokes the entire family.
//   • Sliding expiry: each rotation issues a token valid REFRESH_EXPIRY_DAYS from
//     now, so an actively-used kiosk session never lapses.
import crypto from 'crypto';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const REFRESH_EXPIRY_DAYS = parseInt(process.env.REFRESH_EXPIRY_DAYS, 10) || 60;
const REFRESH_EXPIRY_MS = REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// A token rotated within this window may be presented again without tripping
// reuse-detection — covers two tabs (sharing one httpOnly cookie) refreshing at
// once, or a request that retried. A genuine tab race fires sub-second, so this is
// kept tight; replay AFTER it is treated as theft and revokes the family.
const REUSE_GRACE_MS = 15 * 1000;

// Hard cap on how many successor tokens a single token may spawn inside the grace
// window. A genuine race spawns one sibling per concurrent tab (typically 1-2);
// anything beyond this looks like a captured token being replayed for free issuance,
// so we revoke the whole family. Bounds the grace window's blast radius.
const MAX_GRACE_SIBLINGS = 3;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const newRawToken = () => crypto.randomBytes(48).toString('base64url');

/**
 * Issue a brand-new refresh token starting a fresh family (called at login).
 * @returns {Promise<{raw: string, familyId: string, expiresAt: Date}>}
 */
export async function issueRefreshToken(userId, { userAgent = null, ip = null } = {}) {
  const raw = newRawToken();
  const familyId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, familyId, sha256(raw), expiresAt, userAgent, ip]
  );

  // Opportunistic prune of this user's dead tokens to bound table growth.
  pool.query(
    `DELETE FROM refresh_tokens
       WHERE user_id = $1
         AND (expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '1 day'))`,
    [userId]
  ).catch((err) => logger.warn('refresh_tokens prune (issue) failed', { error: err.message }));

  return { raw, familyId, expiresAt };
}

/**
 * Validate + rotate a refresh token. Runs in a transaction with row locking so
 * concurrent rotations of the same token are serialized.
 * @returns {Promise<{raw,userId,familyId,expiresAt} | {error,userId?,familyId?}>}
 *   On success returns the new raw token. On failure returns { error } where error
 *   is 'missing' | 'invalid' | 'expired' | 'revoked' | 'reuse'.
 */
export async function rotateRefreshToken(rawToken, { userAgent = null, ip = null } = {}) {
  if (!rawToken) return { error: 'missing' };

  const tokenHash = sha256(rawToken);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at
         FROM refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE`,
      [tokenHash]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'invalid' };
    }

    const row = rows[0];

    // Presenting a revoked token → revoke the whole family defensively.
    if (row.revoked_at) {
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
        [row.family_id]
      );
      await client.query('COMMIT');
      return { error: 'revoked', familyId: row.family_id, userId: row.user_id };
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return { error: 'expired' };
    }

    if (row.rotated_at) {
      const rotatedAgoMs = Date.now() - new Date(row.rotated_at).getTime();
      if (rotatedAgoMs > REUSE_GRACE_MS) {
        // Replay of an already-rotated token, well after rotation → likely theft.
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id]
        );
        await client.query('COMMIT');
        return { error: 'reuse', familyId: row.family_id, userId: row.user_id };
      }
      // Within grace → tolerate a genuine concurrent tab race, but bound how many
      // successors this one token may spawn. A captured token replayed repeatedly
      // inside the window would otherwise mint unlimited free sessions; cap it and
      // revoke the family once exceeded. (Successors of THIS token were created at
      // or after its rotated_at; later legitimate rotations of OTHER tokens in the
      // family happen long after the 15s window, so they don't inflate this count.)
      const { rows: sibRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE family_id = $1 AND created_at >= $2`,
        [row.family_id, row.rotated_at]
      );
      if (sibRows[0].n >= MAX_GRACE_SIBLINGS) {
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id]
        );
        await client.query('COMMIT');
        return { error: 'reuse', familyId: row.family_id, userId: row.user_id };
      }
      // Under the cap → fall through and issue a sibling without revoking anything.
    }

    const raw = newRawToken();
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);
    const insert = await client.query(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [row.user_id, row.family_id, sha256(raw), expiresAt, userAgent, ip]
    );

    // Mark the presented token rotated (keep the first rotation timestamp so the
    // grace window is measured from the first concurrent use).
    await client.query(
      `UPDATE refresh_tokens SET rotated_at = COALESCE(rotated_at, NOW()), replaced_by = $2 WHERE id = $1`,
      [row.id, insert.rows[0].id]
    );

    // Bound growth: drop this user's expired / long-revoked rows.
    await client.query(
      `DELETE FROM refresh_tokens
         WHERE user_id = $1 AND id <> $2
           AND (expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '1 day'))`,
      [row.user_id, insert.rows[0].id]
    );

    await client.query('COMMIT');
    return { raw, userId: row.user_id, familyId: row.family_id, expiresAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('rotateRefreshToken failed', err);
    throw err;
  } finally {
    client.release();
  }
}

/** Revoke every live token in a family (logout / compromise). */
export async function revokeFamily(familyId) {
  if (!familyId) return;
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId]
  );
}

/** Revoke the family that a raw token belongs to (used at logout). */
export async function revokeByRawToken(rawToken) {
  if (!rawToken) return;
  const { rows } = await pool.query(
    `SELECT family_id FROM refresh_tokens WHERE token_hash = $1`,
    [sha256(rawToken)]
  );
  if (rows[0]?.family_id) {
    await revokeFamily(rows[0].family_id);
  }
}

/** Revoke all of a user's refresh tokens (e.g. on password reset / admin action). */
export async function revokeAllForUser(userId) {
  if (!userId) return;
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}
