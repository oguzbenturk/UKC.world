import { pool } from '../db.js';
import { logger } from './errorHandler.js';

/**
 * Layer 1 — Shared secret validation (service-to-service auth).
 * Every request from n8n to /api/agent/* must carry:
 *   X-Kai-Agent-Secret: <KAI_AGENT_SECRET env value>
 *   X-Requesting-User-Id: <userId>
 *   X-Requesting-User-Role: <roleName>
 */
export const authenticateAgentRequest = (req, res, next) => {
  const secret = req.headers['x-kai-agent-secret'] || req.headers['x-plannivo-secret'];

  if (!process.env.KAI_AGENT_SECRET) {
    logger.error('KAI_AGENT_SECRET env var is not set — agent API is disabled');
    return res.status(503).json({ error: 'Agent API not configured' });
  }

  if (!secret || secret !== process.env.KAI_AGENT_SECRET) {
    logger.warn('Agent API: invalid or missing X-Kai-Agent-Secret', {
      ip: req.ip,
      path: req.path,
      hasSecret: Boolean(secret),
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId   = req.headers['x-requesting-user-id'] || req.query.userId;
  const userRole = req.headers['x-requesting-user-role'] || req.query.userRole;

  req.agent = { userId: userId || 'guest', role: userRole || 'outsider' };
  next();
};

/**
 * Layer 2 — DB role re-verification for write operations.
 * Re-queries the DB to confirm the claimed role matches the stored role.
 * Prevents a compromised n8n from escalating privileges via header spoofing.
 * Apply this middleware to all POST/PATCH/PUT/DELETE agent routes.
 */
export const verifyAgentIdentity = async (req, res, next) => {
  try {
    const { userId, role: claimedRole } = req.agent;

    // Guest sessions have no DB record
    if (!userId || userId === 'guest') {
      req.agent.role = 'outsider';
      return next();
    }

    const { rows } = await pool.query(
      `SELECT u.id, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );

    if (!rows.length) {
      logger.warn('Agent API: verifyAgentIdentity — user not found', { userId });
      return res.status(403).json({ error: 'Forbidden: user not found' });
    }

    const actualRole = rows[0].role;

    // DB uses legacy role names that assistant.js normalizes before sending to n8n
    // (e.g. 'customer' → 'student', 'super_admin' → 'admin'). Mirror that mapping here.
    const DB_ROLE_ALIASES = { customer: 'student', super_admin: 'admin' };
    const normalizedActualRole = DB_ROLE_ALIASES[actualRole] || actualRole;

    if (normalizedActualRole !== claimedRole) {
      logger.warn('Agent API: role mismatch — possible spoofing attempt', {
        userId,
        claimedRole,
        actualRole,
        normalizedActualRole,
        ip: req.ip,
        path: req.path,
      });
      return res.status(403).json({ error: 'Forbidden: role verification failed' });
    }

    next();
  } catch (err) {
    logger.error('Agent API: verifyAgentIdentity error', err);
    res.status(500).json({ error: 'Internal server error during identity verification' });
  }
};

/**
 * Layer 3 — Role gate factory.
 * Usage: requireRole(['admin', 'manager'])
 * trusted_customer inherits all student-level access automatically.
 */
export const requireRole = (allowedRoles) => (req, res, next) => {
  const { role } = req.agent;
  const allowed = new Set(allowedRoles);

  // trusted_customer inherits student access
  if (allowed.has('student')) allowed.add('trusted_customer');
  // owner inherits management-level roles
  if (allowed.has('admin') || allowed.has('manager') || allowed.has('instructor')) {
    allowed.add('owner');
  }

  if (!allowed.has(role)) {
    return res.status(403).json({
      error: `Forbidden: this action requires role ${allowedRoles.join(' or ')}`,
    });
  }
  next();
};
