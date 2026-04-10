/**
 * /api/admin/kai — Kai AI Admin Dashboard API
 *
 * JWT-authenticated admin/manager endpoints for reviewing Kai conversations,
 * viewing stats, and flagging conversations.
 */

import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// ── GET /conversations — List Kai conversations with filters ──────────────────
router.get('/conversations', async (req, res) => {
  try {
    const { page = 1, limit = 25, userRole, userId, search, dateFrom, dateTo } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (userRole) {
      params.push(userRole);
      conditions.push(`ks.user_role = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      conditions.push(`ks.user_id = $${params.length}::uuid`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`ks.updated_at >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`ks.updated_at < ($${params.length}::date + interval '1 day')`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`ks.messages::text ILIKE $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT ks.session_id, ks.user_id, ks.user_role,
                COALESCE(u.name, 'Guest') AS user_name,
                jsonb_array_length(COALESCE(ks.messages, '[]'::jsonb)) AS message_count,
                ks.summary,
                ks.created_at, ks.updated_at,
                (SELECT COUNT(*) FROM kai_conversation_flags kcf WHERE kcf.session_id = ks.session_id) AS flag_count
         FROM kai_sessions ks
         LEFT JOIN users u ON u.id = ks.user_id
         ${whereClause}
         ORDER BY ks.updated_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset],
      ),
      pool.query(
        `SELECT COUNT(*) FROM kai_sessions ks ${whereClause}`,
        params,
      ),
    ]);

    res.json({
      conversations: dataRes.rows.map((r) => ({
        sessionId: r.session_id,
        userId: r.user_id,
        userName: r.user_name,
        userRole: r.user_role,
        messageCount: parseInt(r.message_count) || 0,
        hasSummary: !!r.summary,
        flagCount: parseInt(r.flag_count) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('KaiAdmin GET /conversations error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// ── GET /conversations/:sessionId — Full conversation replay ──────────────────
router.get('/conversations/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { rows } = await pool.query(
      `SELECT ks.session_id, ks.user_id, ks.user_role, ks.messages, ks.summary,
              ks.created_at, ks.updated_at,
              COALESCE(u.name, 'Guest') AS user_name, u.email AS user_email
       FROM kai_sessions ks
       LEFT JOIN users u ON u.id = ks.user_id
       WHERE ks.session_id = $1`,
      [sessionId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversation not found' });

    const session = rows[0];
    const { rows: flags } = await pool.query(
      `SELECT kcf.id, kcf.flag_type, kcf.note, kcf.created_at,
              COALESCE(u.name, 'System') AS flagged_by_name
       FROM kai_conversation_flags kcf
       LEFT JOIN users u ON u.id = kcf.flagged_by
       WHERE kcf.session_id = $1
       ORDER BY kcf.created_at DESC`,
      [sessionId],
    );

    res.json({
      sessionId: session.session_id,
      userId: session.user_id,
      userName: session.user_name,
      userEmail: session.user_email,
      userRole: session.user_role,
      messages: session.messages || [],
      summary: session.summary,
      flags,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    });
  } catch (err) {
    console.error('KaiAdmin GET /conversations/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// ── GET /stats — Aggregate statistics ─────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [totalRes, roleRes, recentRes, avgRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM kai_sessions`),
      pool.query(
        `SELECT user_role, COUNT(*) AS count
         FROM kai_sessions
         GROUP BY user_role
         ORDER BY count DESC`,
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE updated_at >= NOW() - interval '1 day') AS today,
           COUNT(*) FILTER (WHERE updated_at >= NOW() - interval '7 days') AS this_week,
           COUNT(*) FILTER (WHERE updated_at >= NOW() - interval '30 days') AS this_month
         FROM kai_sessions`,
      ),
      pool.query(
        `SELECT ROUND(AVG(jsonb_array_length(COALESCE(messages, '[]'::jsonb))), 1) AS avg_messages
         FROM kai_sessions
         WHERE updated_at >= NOW() - interval '30 days'`,
      ),
    ]);

    res.json({
      totalConversations: parseInt(totalRes.rows[0].total),
      today: parseInt(recentRes.rows[0].today),
      thisWeek: parseInt(recentRes.rows[0].this_week),
      thisMonth: parseInt(recentRes.rows[0].this_month),
      avgMessagesPerConversation: parseFloat(avgRes.rows[0].avg_messages) || 0,
      byRole: roleRes.rows.map((r) => ({
        role: r.user_role || 'unknown',
        count: parseInt(r.count),
      })),
    });
  } catch (err) {
    console.error('KaiAdmin GET /stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── POST /conversations/:sessionId/flag — Flag a conversation ─────────────────
router.post('/conversations/:sessionId/flag', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { flagType = 'review', note } = req.body;
    const flaggedBy = req.user?.id || null;

    const { rows } = await pool.query(
      `INSERT INTO kai_conversation_flags (session_id, flagged_by, flag_type, note)
       VALUES ($1, $2, $3, $4)
       RETURNING id, flag_type, created_at`,
      [sessionId, flaggedBy, flagType, note || null],
    );

    res.status(201).json({
      id: rows[0].id,
      flagType: rows[0].flag_type,
      createdAt: rows[0].created_at,
      message: 'Conversation flagged successfully.',
    });
  } catch (err) {
    console.error('KaiAdmin POST /flag error:', err);
    res.status(500).json({ error: 'Failed to flag conversation' });
  }
});

export default router;
