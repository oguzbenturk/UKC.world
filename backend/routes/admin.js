import express from 'express';
import { authenticateJWT } from './auth.js';
import { pool } from '../db.js';

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
    console.error('Error fetching legal documents:', error);
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
    console.error('Error saving legal document:', error);
    res.status(500).json({ error: 'Failed to save legal document' });
  }
});

export default router;
