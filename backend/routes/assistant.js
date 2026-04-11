import express from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

const router = express.Router();

const guestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please wait a moment before trying again.' },
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please wait a moment before trying again.' },
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1];
  if (!bearerToken) {
    req.user = null;
    return next();
  }
  try {
    req.user = jwt.verify(bearerToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    req.user = null;
  }
  next();
};

const adaptiveLimiter = (req, res, next) => {
  if (req.user?.id) return authLimiter(req, res, next);
  return guestLimiter(req, res, next);
};

router.post('/', optionalAuth, adaptiveLimiter, async (req, res) => {
  try {
    const { message, image, userName: clientUserName, sessionId } = req.body;

    if ((!message || typeof message !== 'string' || message.trim().length === 0) && !image) {
      return res.status(400).json({ error: 'Message or image is required' });
    }
    if (message && message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    }
    if (image && image.length > 7 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 5MB)' });
    }

    const webhookUrl = process.env.N8N_ASSISTANT_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_ASSISTANT_SECRET;

    if (!webhookUrl) {
      return res.status(503).json({ error: 'Assistant service not configured' });
    }

    // Normalize DB role names to n8n workflow role keys
    const normalizeRole = (role) => {
      const roleMap = { customer: 'student', super_admin: 'admin' };
      return roleMap[role] || role || 'outsider';
    };

    const payload = {
      message: (message || '').trim(),
      userId: req.user?.id || 'guest',
      userRole: normalizeRole(req.user?.role),
      userName: clientUserName || req.user?.email || 'Guest',
      sessionId: sessionId || null,
    };
    if (image) payload.image = image;

    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Plannivo-Secret': webhookSecret || '',
      },
      timeout: 30000,
    });

    const result = response.data;
    console.log('n8n response:', JSON.stringify(result).slice(0, 500));
    const answer = result?.response || result?.output || result?.text || (typeof result === 'string' ? result : null) || 'No response received.';
    res.json({ response: answer });
  } catch (error) {
    console.error('Assistant proxy error:', error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Assistant took too long to respond. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to get response from assistant.' });
  }
});

export default router;
