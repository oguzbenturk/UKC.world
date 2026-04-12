import express from 'express';
import { authenticateJWT } from './auth.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  const userRole = req.user?.role || req.user?.role_name;
  if (!['admin', 'manager', 'developer'].includes(userRole?.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get legal documents
router.get('/legal-documents', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT document_type, version, content, updated_at
      FROM legal_documents
      WHERE is_active = true
      ORDER BY document_type
    `);

    const documents = {};
    result.rows.forEach(row => {
      documents[row.document_type] = {
        version: row.version,
        content: row.content,
        updatedAt: row.updated_at
      };
    });

    res.json(documents);
  } catch (error) {
    logger.error('Error fetching legal documents:', error);
    res.status(500).json({ error: 'Failed to fetch legal documents' });
  }
});

// Save/Update legal document (Admin only)
router.post('/legal-documents', authenticateJWT, requireAdmin, async (req, res) => {
  const { type, version, content } = req.body;

  if (!type || !content) {
    return res.status(400).json({ error: 'Type and content are required' });
  }

  const allowedTypes = ['terms', 'privacy', 'marketing'];
  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid document type' });
  }

  try {
    // Deactivate old versions
    await pool.query(`
      UPDATE legal_documents
      SET is_active = false
      WHERE document_type = $1
    `, [type]);

    // Insert new version
    await pool.query(`
      INSERT INTO legal_documents (document_type, version, content, is_active, created_by)
      VALUES ($1, $2, $3, true, $4)
    `, [type, version || null, content, req.user.userId]);

    res.json({ message: 'Legal document saved successfully' });
  } catch (error) {
    logger.error('Error saving legal document:', error);
    res.status(500).json({ error: 'Failed to save legal document' });
  }
});

// ── GET /kai/sessions — List Kai conversation sessions (admin/manager only) ────
router.get('/kai/sessions', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0',  10), 0);
    const role   = req.query.role   || null;
    const search = req.query.search || null;
    // unansweredOnly: only return sessions where Kai said it couldn't help
    const unansweredOnly = req.query.unansweredOnly === 'true';

    const conditions = [];
    const params     = [];

    if (role) {
      params.push(role);
      conditions.push(`ks.user_role = $${params.length}`);
    }

    // Phrases that indicate Kai couldn't answer (Turkish + English).
    const UNANSWERED_PHRASES = [
      'bilgim yok', 'bilmiyorum', 'yardımcı olamıyorum',
      'bu konuda bilgim', 'cevap veremiyorum', 'whatsapp',
      "i don't have information", 'i cannot help', "i don't know",
      'cannot assist', 'unable to help',
    ];
    // Double any single quotes so they are safe inside SQL string literals
    const sqlPhrase = (p) => p.replace(/'/g, "''");
    const phraseChecks = UNANSWERED_PHRASES
      .map(p => `lower(msg->>'content') LIKE '%${sqlPhrase(p)}%'`)
      .join(' OR ');

    if (unansweredOnly) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM jsonb_array_elements(ks.messages) AS msg
          WHERE msg->>'role' = 'assistant' AND (${phraseChecks})
        )`
      );
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(
        `(lower(u.name) LIKE $${params.length}
          OR lower(u.email) LIKE $${params.length}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(ks.messages) AS msg
            WHERE lower(msg->>'content') LIKE $${params.length}
          ))`
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         ks.session_id,
         ks.user_role,
         ks.updated_at,
         ks.created_at,
         jsonb_array_length(ks.messages) AS message_count,
         u.name,
         u.email,
         EXISTS (
           SELECT 1 FROM jsonb_array_elements(ks.messages) AS msg
           WHERE msg->>'role' = 'assistant' AND (${phraseChecks})
         ) AS has_unanswered,
         -- Last user message for inline preview
         (SELECT m.val->>'content'
          FROM jsonb_array_elements(ks.messages) WITH ORDINALITY AS m(val, ord)
          WHERE m.val->>'role' = 'user' OR m.val->>'type' = 'human'
          ORDER BY m.ord DESC
          LIMIT 1
         ) AS last_user_message
       FROM kai_sessions ks
       LEFT JOIN users u ON u.id = ks.user_id
       ${where}
       ORDER BY ks.updated_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total
       FROM kai_sessions ks
       LEFT JOIN users u ON u.id = ks.user_id
       ${where}`,
      params,
    );

    res.json({
      sessions: rows,
      total: parseInt(countRows[0].total, 10),
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Error fetching Kai sessions:', error);
    res.status(500).json({ error: 'Failed to fetch Kai sessions' });
  }
});

// ── GET /kai/sessions/:sessionId — Full conversation detail ───────────────────
router.get('/kai/sessions/:sessionId', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { rows } = await pool.query(
      `SELECT ks.session_id, ks.user_role, ks.messages, ks.summary,
              ks.created_at, ks.updated_at,
              u.name, u.email, u.id AS user_id
       FROM kai_sessions ks
       LEFT JOIN users u ON u.id = ks.user_id
       WHERE ks.session_id = $1`,
      [sessionId],
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session: rows[0] });
  } catch (error) {
    logger.error('Error fetching Kai session detail:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// ── GET /kai/sessions/stats — Quick summary stats ─────────────────────────────
router.get('/kai/stats', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const UNANSWERED_PHRASES = [
      'bilgim yok', 'bilmiyorum', 'yardımcı olamıyorum',
      'bu konuda bilgim', 'cevap veremiyorum', 'whatsapp',
      "i don't have information", 'i cannot help', "i don't know",
      'cannot assist', 'unable to help',
    ];
    const sqlPhrase = (p) => p.replace(/'/g, "''");
    const phraseChecks = UNANSWERED_PHRASES.map(p => `lower(msg->>'content') LIKE '%${sqlPhrase(p)}%'`).join(' OR ');

    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                                         AS total_sessions,
        COUNT(*) FILTER (WHERE ks.user_role = 'outsider')               AS outsider_sessions,
        COUNT(*) FILTER (WHERE ks.user_role = 'student')                AS student_sessions,
        COUNT(*) FILTER (WHERE ks.user_role IN ('instructor','admin','manager')) AS staff_sessions,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(ks.messages) AS msg
          WHERE msg->>'role' = 'assistant' AND (${phraseChecks})
        ))                                                               AS unanswered_sessions,
        SUM(jsonb_array_length(ks.messages))                            AS total_messages
      FROM kai_sessions ks
    `);

    res.json({ stats: rows[0] });
  } catch (error) {
    logger.error('Error fetching Kai stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
