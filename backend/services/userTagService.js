import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Lightweight user tagging service for badges / achievements.
 * Tags live in the user_tags table and have zero impact on auth/roles.
 */

export async function addTag(userId, tag, label = null, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO user_tags (user_id, tag, label, metadata)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, tag) DO NOTHING`,
      [userId, tag, label, JSON.stringify(metadata)]
    );
  } catch (err) {
    logger.warn(`Failed to add tag "${tag}" for user ${userId}:`, err.message);
  }
}

export async function removeTag(userId, tag) {
  await pool.query(
    'DELETE FROM user_tags WHERE user_id = $1 AND tag = $2',
    [userId, tag]
  );
}

export async function getUserTags(userId) {
  const { rows } = await pool.query(
    'SELECT tag, label, awarded_at, metadata FROM user_tags WHERE user_id = $1 ORDER BY awarded_at',
    [userId]
  );
  return rows;
}

export async function countUsersWithTag(tag) {
  const { rows } = await pool.query(
    'SELECT COUNT(DISTINCT user_id)::int AS total FROM user_tags WHERE tag = $1',
    [tag]
  );
  return rows[0]?.total || 0;
}
