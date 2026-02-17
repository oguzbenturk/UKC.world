import { pool as defaultPool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const INSERT_SQL = `
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    data,
    status,
    idempotency_key,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id`;

export async function insertNotification({
  userId,
  title,
  message,
  type = 'general',
  data = {},
  status = 'sent',
  idempotencyKey = null,
  client
} = {}) {
  if (!userId) {
    return { inserted: false, reason: 'missing-user' };
  }

  if (!title || !message) {
    return { inserted: false, reason: 'missing-content' };
  }

  const executor = client ?? defaultPool;

  if (!executor || typeof executor.query !== 'function') {
    throw new Error('No database executor available for insertNotification');
  }

  try {
    const result = await executor.query(INSERT_SQL, [
      userId,
      title,
      message,
      type ?? 'general',
      JSON.stringify(data ?? {}),
      status ?? 'sent',
      idempotencyKey
    ]);

    if (result.rowCount === 0) {
      if (typeof logger.debug === 'function') {
        logger.debug('Notification insert skipped due to idempotency', {
          userId,
          type,
          idempotencyKey
        });
      }
      return { inserted: false, reason: 'duplicate' };
    }

    return { inserted: true, id: result.rows[0]?.id ?? null };
  } catch (error) {
    logger.warn('Failed to insert notification record', {
      userId,
      type,
      idempotencyKey,
      error: error?.message
    });
    throw error;
  }
}

export default {
  insertNotification
};
