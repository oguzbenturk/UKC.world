import express from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

const router = express.Router();

const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please wait a moment before trying again.' },
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
    req.user = jwt.verify(bearerToken, process.env.JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
};

router.post('/', assistantLimiter, optionalAuth, async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    }

    const webhookUrl = process.env.N8N_ASSISTANT_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_ASSISTANT_SECRET;

    if (!webhookUrl) {
      return res.status(503).json({ error: 'Assistant service not configured' });
    }

    const payload = {
      message: message.trim(),
      userId: req.user?.id || 'guest',
      userRole: req.user?.role || 'outsider',
      userName: req.user?.name || 'Guest',
      conversationHistory: conversationHistory || [],
    };

    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Plannivo-Secret': webhookSecret || '',
      },
      timeout: 30000,
    });

    res.json({ response: response.data.response || response.data.output || 'No response received.' });
  } catch (error) {
    console.error('Assistant proxy error:', error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Assistant took too long to respond. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to get response from assistant.' });
  }
});

export default router;
