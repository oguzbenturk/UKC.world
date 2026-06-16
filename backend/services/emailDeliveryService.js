import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

// Outbound email delivery log. recordEmailSend() is called by emailService at
// send time; applyEmailEvent() is called by the Resend webhook route as the
// provider reports what happened to each message. See migration 276.

// Status progression is forward-only, but failures (bounced/complained/failed)
// always win — so a late "opened" can't mask a bounce, and an out-of-order
// "delivered" can't downgrade an "opened".
const STATUS_RANK = {
  sent: 1,
  delivery_delayed: 2,
  delivered: 3,
  opened: 4,
  clicked: 5,
  failed: 8,
  bounced: 9,
  complained: 10
};

const EVENT_STATUS = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained'
};

export function statusFromEvent(eventType) {
  return EVENT_STATUS[eventType] || null;
}

/**
 * Record one outbound email. Best-effort: never throws (a logging failure must
 * never break the actual send). Returns the new row id, or null on failure.
 */
export async function recordEmailSend({
  recipient,
  subject = null,
  notificationType = null,
  userId = null,
  relatedEntityType = null,
  relatedEntityId = null,
  messageId = null,
  providerId = null,
  status = 'sent',
  error = null
}) {
  if (!recipient) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO email_deliveries
         (recipient, subject, notification_type, user_id,
          related_entity_type, related_entity_id, message_id, provider_id, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        recipient,
        subject,
        notificationType,
        userId,
        relatedEntityType,
        relatedEntityId != null ? String(relatedEntityId) : null,
        messageId,
        providerId,
        status,
        error
      ]
    );
    return rows[0]?.id || null;
  } catch (err) {
    logger.warn('emailDelivery: recordEmailSend failed', { recipient, error: err.message });
    return null;
  }
}

/**
 * Apply a Resend webhook event to the matching delivery row.
 * Matching order: (1) provider_id (exact, for 2nd+ events of an email),
 * (2) newest unlinked send to the same recipient (+subject) within 5 days.
 */
export async function applyEmailEvent({
  eventType,
  providerId = null,
  recipient = null,
  subject = null,
  occurredAt = null,
  errorText = null
}) {
  const newStatus = EVENT_STATUS[eventType];
  if (!newStatus) return { matched: false, reason: 'unhandled_event' };

  let row = null;

  // 1) Direct match on Resend's email_id.
  if (providerId) {
    const r = await pool.query(
      `SELECT id, status FROM email_deliveries
        WHERE provider_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [providerId]
    );
    row = r.rows[0] || null;
  }

  // 2) Fallback: newest matching send not yet linked to a different provider_id.
  if (!row && recipient) {
    const params = [recipient];
    let sql =
      `SELECT id, status FROM email_deliveries
        WHERE lower(recipient) = lower($1)
          AND created_at > now() - interval '5 days'`;
    if (providerId) {
      params.push(providerId);
      sql += ` AND (provider_id IS NULL OR provider_id = $${params.length})`;
    }
    if (subject) {
      params.push(subject);
      sql += ` AND subject = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 1`;
    const r = await pool.query(sql, params);
    row = r.rows[0] || null;
  }

  if (!row) return { matched: false, reason: 'no_matching_send' };

  const curRank = STATUS_RANK[row.status] || 0;
  const newRank = STATUS_RANK[newStatus] || 0;
  const finalStatus = newRank >= curRank ? newStatus : row.status;
  const ts = occurredAt || new Date().toISOString();

  await pool.query(
    `UPDATE email_deliveries
        SET status = $2,
            provider_id = COALESCE(provider_id, $3),
            error = COALESCE($4, error),
            last_event_at = GREATEST(COALESCE(last_event_at, $5::timestamptz), $5::timestamptz),
            updated_at = now()
      WHERE id = $1`,
    [row.id, finalStatus, providerId, errorText, ts]
  );

  return { matched: true, id: row.id, status: finalStatus };
}

export async function listDeliveriesForEntity(relatedEntityType, relatedEntityId) {
  if (!relatedEntityType || relatedEntityId == null) return [];
  const { rows } = await pool.query(
    `SELECT id, recipient, subject, notification_type, status, error,
            message_id, provider_id, sent_at, last_event_at, created_at, updated_at
       FROM email_deliveries
      WHERE related_entity_type = $1 AND related_entity_id = $2
      ORDER BY created_at DESC`,
    [relatedEntityType, String(relatedEntityId)]
  );
  return rows;
}

export default {
  recordEmailSend,
  applyEmailEvent,
  listDeliveriesForEntity,
  statusFromEvent
};
