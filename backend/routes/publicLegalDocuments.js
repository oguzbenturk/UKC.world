import express from 'express';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

const ALLOWED_TYPES = new Set(['terms', 'privacy', 'marketing']);
const TYPE_ALIASES = {
  kvkk: 'privacy',
  gizlilik: 'privacy',
};

router.get('/:type', async (req, res) => {
  const requested = String(req.params.type || '').toLowerCase();
  const docType = TYPE_ALIASES[requested] || requested;

  if (!ALLOWED_TYPES.has(docType)) {
    return res.status(404).json({ error: 'Unknown legal document type' });
  }

  try {
    const result = await pool.query(
      `SELECT version, content, updated_at
         FROM legal_documents
        WHERE document_type = $1 AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1`,
      [docType]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      type: docType,
      version: result.rows[0].version,
      content: result.rows[0].content,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error) {
    logger.error('Error fetching public legal document:', error);
    res.status(500).json({ error: 'Failed to fetch legal document' });
  }
});

export default router;
