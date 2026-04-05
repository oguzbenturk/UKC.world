/**
 * withTransaction — wraps an Express route handler that needs a DB transaction.
 *
 * Guarantees:
 *  - client is always released back to the pool (via finally)
 *  - ROLLBACK on any error or non-2xx early return
 *  - COMMIT only when handler completes without throwing
 *
 * Usage:
 *   router.post('/foo', withTransaction(async (client, req, res) => {
 *     const { rows } = await client.query('SELECT ...');
 *     if (!rows.length) return res.status(404).json({ error: 'Not found' });
 *     await client.query('INSERT ...');
 *     res.status(201).json({ success: true });
 *   }));
 */
import { pool } from '../db.js';

const withTransaction = (handler) => async (req, res, next) => {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await handler(client, req, res, next);
    if (!committed && !res.headersSent) {
      await client.query('COMMIT');
      committed = true;
    } else if (!committed) {
      // Response already sent — commit if status is 2xx, rollback otherwise
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }
      committed = true;
    }
  } catch (err) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    if (!res.headersSent) {
      next(err);
    }
  } finally {
    client.release();
  }
};

export default withTransaction;
