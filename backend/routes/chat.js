/**
 * Chat Routes
 * 
 * REST API endpoints for live chat system:
 * - Conversations (1:1, groups, channels)
 * - Messages with attachments
 * - Full-text search
 * - Read receipts
 * 
 * Authentication: All endpoints require JWT
 * Authorization: Role-based (admin/manager for certain actions)
 */

import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import ChatService from '../services/chatService.js';
import MessageCleanupService from '../services/messageCleanupService.js';
import { logger } from '../middlewares/errorHandler.js';
import { ROLES } from '../shared/utils/roleUtils.js';

const router = express.Router();

// Rate limiting for message sending
const messageRateLimits = new Map();
const MESSAGE_RATE_LIMIT = 20; // messages per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

// Cleanup rate limits every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of messageRateLimits.entries()) {
    if (now > data.resetTime) {
      messageRateLimits.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Rate limiting middleware
const rateLimitMessages = (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) return next();
  
  const now = Date.now();
  
  if (!messageRateLimits.has(userId)) {
    messageRateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const limit = messageRateLimits.get(userId);
  
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (limit.count >= MESSAGE_RATE_LIMIT) {
    return res.status(429).json({ 
      error: 'Too many messages. Please slow down.',
      retryAfter: Math.ceil((limit.resetTime - now) / 1000)
    });
  }
  
  limit.count++;
  next();
};

// ============================================
// CONVERSATION ROUTES
// ============================================

/**
 * GET /api/chat/conversations
 * Get user's conversations with unread counts
 */
router.get('/conversations', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const conversations = await ChatService.getUserConversations(userId, limit, offset);
    
    res.json({ 
      conversations,
      count: conversations.length,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /api/chat/channels/available
 * Get channels available to join
 */
router.get('/channels/available', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const channels = await ChatService.getAvailableChannels(userId);
    
    res.json({ channels });
  } catch (error) {
    logger.error('Error fetching available channels:', error);
    res.status(500).json({ error: 'Failed to fetch available channels' });
  }
});

/**
 * POST /api/chat/channels/:id/join
 * Join a channel
 */
router.post('/channels/:id/join', authenticateJWT, async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.user.id;
    
    const channel = await ChatService.joinChannel(channelId, userId);
    
    res.json({ message: 'Joined channel successfully', channel });
  } catch (error) {
    logger.error('Error joining channel:', error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Failed to join channel' });
  }
});

/**
 * GET /api/chat/conversations/:id
 * Get conversation details
 */
router.get('/conversations/:id', authenticateJWT, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.user.id;
    
    const conversation = await ChatService.getConversationDetails(conversationId, userId);
    
    res.json(conversation);
  } catch (error) {
    logger.error('Error fetching conversation details:', error);
    const status = error.message.includes('not a participant') ? 403 : 500;
    res.status(status).json({ error: error.message || 'Failed to fetch conversation' });
  }
});

/**
 * POST /api/chat/conversations/direct
 * Get or create a direct conversation with another user
 */
router.post('/conversations/direct', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { otherUserId } = req.body;
    
    if (!otherUserId) {
      return res.status(400).json({ error: 'otherUserId is required' });
    }
    
    if (otherUserId === userId) {
      return res.status(400).json({ error: 'Cannot create conversation with yourself' });
    }
    
    const conversation = await ChatService.getOrCreateDirectConversation(userId, otherUserId);
    
    res.json(conversation);
  } catch (error) {
    logger.error('Error creating direct conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * POST /api/chat/conversations/group
 * Create a group conversation (admin/manager only)
 */
router.post('/conversations/group', 
  authenticateJWT, 
  authorizeRoles([ROLES.ADMIN, ROLES.MANAGER]), 
  async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { name, participantIds = [], welcomeMessage } = req.body;
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Group name is required' });
      }
      
      const conversation = await ChatService.createGroupOrChannel(
        userId, 
        userRole, 
        'group', 
        name, 
        participantIds,
        welcomeMessage
      );
      
      res.status(201).json(conversation);
    } catch (error) {
      logger.error('Error creating group:', error);
      res.status(500).json({ error: error.message || 'Failed to create group' });
    }
  }
);

/**
 * POST /api/chat/conversations/channel
 * Create a channel (admin/manager only)
 */
router.post('/conversations/channel', 
  authenticateJWT, 
  authorizeRoles([ROLES.ADMIN, ROLES.MANAGER]), 
  async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { name, participantIds = [], welcomeMessage } = req.body;
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Channel name is required' });
      }
      
      const conversation = await ChatService.createGroupOrChannel(
        userId, 
        userRole, 
        'channel', 
        name, 
        participantIds,
        welcomeMessage
      );
      
      res.status(201).json(conversation);
    } catch (error) {
      logger.error('Error creating channel:', error);
      res.status(500).json({ error: error.message || 'Failed to create channel' });
    }
  }
);

/**
 * DELETE /api/chat/conversations/:id
 * Delete a conversation (admin/manager only, or conversation owner)
 */
router.delete('/conversations/:id', 
  authenticateJWT,
  async (req, res) => {
    try {
      const conversationId = req.params.id;
      const userId = req.user.id;
      const userRole = req.user.role;
      
      await ChatService.deleteConversation(conversationId, userId, userRole);
      
      res.json({ message: 'Conversation deleted successfully' });
    } catch (error) {
      logger.error('Error deleting conversation:', error);
      const status = error.message.includes('permission') || error.message.includes('Only admins') ? 403 : 
                     error.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: error.message || 'Failed to delete conversation' });
    }
  }
);

/**
 * POST /api/chat/conversations/:id/participants
 * Add participants to a conversation (owner/admin only)
 */
router.post('/conversations/:id/participants', authenticateJWT, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const requesterId = req.user.id;
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    await ChatService.addParticipants(conversationId, requesterId, userIds);
    
    res.json({ message: 'Participants added successfully' });
  } catch (error) {
    logger.error('Error adding participants:', error);
    const status = error.message.includes('Only conversation') ? 403 : 500;
    res.status(status).json({ error: error.message || 'Failed to add participants' });
  }
});

/**
 * POST /api/chat/conversations/:id/leave
 * Leave a conversation
 */
router.post('/conversations/:id/leave', authenticateJWT, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.user.id;
    
    await ChatService.leaveConversation(conversationId, userId);
    
    res.json({ message: 'Left conversation successfully' });
  } catch (error) {
    logger.error('Error leaving conversation:', error);
    res.status(500).json({ error: 'Failed to leave conversation' });
  }
});

// ============================================
// MESSAGE ROUTES
// ============================================

/**
 * GET /api/chat/conversations/:id/messages
 * Get messages for a conversation
 */
router.get('/conversations/:id/messages', authenticateJWT, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const beforeMessageId = req.query.before || null;
    
    const messages = await ChatService.getMessages(conversationId, userId, limit, beforeMessageId);
    
    res.json({ 
      messages,
      count: messages.length,
      conversationId
    });
  } catch (error) {
    logger.error('Error fetching messages:', error);
    const status = error.message.includes('not a participant') ? 403 : 500;
    res.status(status).json({ error: error.message || 'Failed to fetch messages' });
  }
});

/**
 * POST /api/chat/conversations/:id/messages
 * Send a message
 */
router.post('/conversations/:id/messages', 
  authenticateJWT, 
  rateLimitMessages,
  async (req, res) => {
    try {
      const conversationId = req.params.id;
      const senderId = req.user.id;
      const {
        messageType = 'text',
        content,
        attachmentUrl,
        attachmentFilename,
        attachmentSize,
        voiceDuration,
        voiceTranscript
      } = req.body;
      
      // Validation
      if (messageType === 'text' && (!content || content.trim().length === 0)) {
        return res.status(400).json({ error: 'Message content is required' });
      }
      
      if (['image', 'file', 'voice'].includes(messageType) && !attachmentUrl) {
        return res.status(400).json({ error: 'Attachment URL is required for this message type' });
      }
      
      const message = await ChatService.sendMessage({
        conversationId,
        senderId,
        messageType,
        content: content?.trim() || null,
        attachmentUrl,
        attachmentFilename,
        attachmentSize,
        voiceDuration,
        voiceTranscript
      });
      
      // Socket.IO will broadcast this message in real-time
      // (handled in socketService.js)
      
      res.status(201).json(message);
    } catch (error) {
      logger.error('Error sending message:', error);
      const status = error.message.includes('not a participant') ? 403 : 500;
      res.status(status).json({ error: error.message || 'Failed to send message' });
    }
  }
);

/**
 * POST /api/chat/conversations/:id/read
 * Mark conversation as read
 */
router.post('/conversations/:id/read', authenticateJWT, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.user.id;
    
    await ChatService.markAsRead(conversationId, userId);
    
    res.json({ message: 'Marked as read' });
  } catch (error) {
    logger.error('Error marking as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ============================================
// SEARCH ROUTES
// ============================================

/**
 * GET /api/chat/search
 * Search messages with full-text search
 * Admin/manager: global search
 * Others: conversation-scoped search
 */
router.get('/search', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.roleName;
    const query = req.query.q || req.query.query;
    const conversationIds = req.query.conversations ? 
      req.query.conversations.split(',') : null;
    const limit = parseInt(req.query.limit) || 50;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const results = await ChatService.searchMessages(
      userId, 
      userRole, 
      query.trim(), 
      conversationIds, 
      limit
    );
    
    res.json({ 
      results,
      count: results.length,
      query: query.trim(),
      scope: [ROLES.ADMIN, ROLES.MANAGER].includes(userRole) ? 'global' : 'conversations'
    });
  } catch (error) {
    logger.error('Error searching messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * GET /api/chat/admin/stats
 * Get chat system statistics (admin only)
 */
router.get('/admin/stats', 
  authenticateJWT, 
  authorizeRoles([ROLES.ADMIN, ROLES.MANAGER]), 
  async (req, res) => {
    try {
      const stats = await MessageCleanupService.getCleanupStats();
      
      res.json(stats);
    } catch (error) {
      logger.error('Error fetching chat stats:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  }
);

/**
 * POST /api/chat/admin/cleanup
 * Manually trigger message cleanup (admin only)
 */
router.post('/admin/cleanup', 
  authenticateJWT, 
  authorizeRoles([ROLES.ADMIN]), 
  async (req, res) => {
    try {
      const result = await MessageCleanupService.runManualCleanup();
      
      res.json({ 
        message: 'Cleanup completed',
        ...result
      });
    } catch (error) {
      logger.error('Error running manual cleanup:', error);
      res.status(500).json({ error: 'Failed to run cleanup' });
    }
  }
);

// ============================================
// HEALTH CHECK
// ============================================

/**
 * GET /api/chat/health
 * Check chat service health
 */
router.get('/health', async (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'chat',
    timestamp: new Date().toISOString(),
    features: {
      conversations: true,
      messaging: true,
      search: true,
      retention: '5 days',
      realtime: 'socket.io'
    }
  });
});

export default router;
