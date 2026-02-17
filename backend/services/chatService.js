/**
 * Chat Service
 * 
 * Business logic for live chat system:
 * - Conversation management (1:1 auto-created, groups/channels admin-managed)
 * - Message sending with attachments
 * - Full-text search (conversation-scoped, global for admins)
 * - Read receipts
 * - Role-based access control
 */

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { ROLES } from '../shared/utils/roleUtils.js';

class ChatService {
  /**
   * Get or create a direct conversation between two users
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @returns {Promise<Object>} Conversation object
   */
  static async getOrCreateDirectConversation(userId1, userId2) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if direct conversation already exists
      const { rows: existing } = await client.query(`
        SELECT c.id, c.type, c.created_at, c.updated_at
        FROM conversations c
        WHERE c.type = 'direct'
          AND EXISTS (
            SELECT 1 FROM conversation_participants cp1
            WHERE cp1.conversation_id = c.id AND cp1.user_id = $1
          )
          AND EXISTS (
            SELECT 1 FROM conversation_participants cp2
            WHERE cp2.conversation_id = c.id AND cp2.user_id = $2
          )
          AND (
            SELECT COUNT(*) FROM conversation_participants
            WHERE conversation_id = c.id
          ) = 2
        LIMIT 1
      `, [userId1, userId2]);
      
      if (existing.length > 0) {
        await client.query('COMMIT');
        return existing[0];
      }
      
      // Create new direct conversation
      const { rows: [conversation] } = await client.query(`
        INSERT INTO conversations (type, created_by)
        VALUES ('direct', $1)
        RETURNING id, type, created_at, updated_at
      `, [userId1]);
      
      // Add both participants
      await client.query(`
        INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation)
        VALUES 
          ($1, $2, 'member'),
          ($1, $3, 'member')
      `, [conversation.id, userId1, userId2]);
      
      // Get other user's name for display
      const { rows: [otherUser] } = await client.query(`
        SELECT name FROM users WHERE id = $1
      `, [userId2]);
      
      await client.query('COMMIT');
      
      logger.info(`Created direct conversation ${conversation.id} between users ${userId1} and ${userId2}`);
      
      // Return with name derived from other participant
      return {
        ...conversation,
        name: otherUser?.name || 'Direct Message',
        participant_count: 2
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to get/create direct conversation:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Create a group or channel (admin/manager only)
   * @param {string} creatorId - Creator user ID
   * @param {string} creatorRole - Creator role name
   * @param {string} type - 'group' or 'channel'
   * @param {string} name - Conversation name
   * @param {string[]} participantIds - Initial participant user IDs
   * @param {string} welcomeMessage - Optional welcome message
   * @returns {Promise<Object>} Conversation object
   */
  static async createGroupOrChannel(creatorId, creatorRole, type, name, participantIds = [], welcomeMessage = null) {
    // Role check: only admin/manager can create groups/channels
    const normalizedRole = creatorRole?.toLowerCase();
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(normalizedRole)) {
      throw new Error('Only admins and managers can create groups and channels');
    }
    
    if (!['group', 'channel'].includes(type)) {
      throw new Error('Type must be "group" or "channel"');
    }
    
    if (!name || name.trim().length === 0) {
      throw new Error('Name is required for groups and channels');
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create conversation
      const { rows: [conversation] } = await client.query(`
        INSERT INTO conversations (type, name, created_by)
        VALUES ($1, $2, $3)
        RETURNING id, type, name, created_by, created_at, updated_at
      `, [type, name.trim(), creatorId]);
      
      // Add creator as owner
      await client.query(`
        INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation)
        VALUES ($1, $2, 'owner')
      `, [conversation.id, creatorId]);
      
      // For channels, auto-add all users; for groups, only add specified participants
      if (type === 'channel') {
        // Get all users except the creator
        const { rows: allUsers } = await client.query(`
          SELECT id FROM users WHERE id != $1 AND deleted_at IS NULL
        `, [creatorId]);
        
        if (allUsers.length > 0) {
          const values = allUsers.map((_, i) => 
            `($1, $${i + 2}, 'member')`
          ).join(',');
          
          await client.query(`
            INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation)
            VALUES ${values}
          `, [conversation.id, ...allUsers.map(u => u.id)]);
        }
        
        logger.info(`Auto-added ${allUsers.length} users to channel "${name}"`);
      } else {
        // For groups, add only specified participants
        const uniqueParticipants = [...new Set(participantIds)].filter(id => id !== creatorId);
        
        if (uniqueParticipants.length > 0) {
          const values = uniqueParticipants.map((_, i) => 
            `($1, $${i + 2}, 'member')`
          ).join(',');
          
          await client.query(`
            INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation)
            VALUES ${values}
          `, [conversation.id, ...uniqueParticipants]);
        }
      }
      
      // Send welcome message if provided
      if (welcomeMessage && welcomeMessage.trim().length > 0) {
        await client.query(`
          INSERT INTO messages (conversation_id, sender_id, message_type, content)
          VALUES ($1, $2, 'system', $3)
        `, [conversation.id, creatorId, welcomeMessage.trim()]);
      }
      
      await client.query('COMMIT');
      
      logger.info(`Created ${type} "${name}" (ID: ${conversation.id}) by user ${creatorId}`);
      
      // Get actual participant count
      const { rows: [count] } = await client.query(`
        SELECT COUNT(*) as total FROM conversation_participants
        WHERE conversation_id = $1 AND left_at IS NULL
      `, [conversation.id]);
      
      // Return with participant count
      return {
        ...conversation,
        participant_count: parseInt(count.total) || 0
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to create ${type}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Delete a conversation (admin/manager only, or conversation owner)
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User requesting deletion
   * @param {string} userRole - User role
   * @returns {Promise<void>}
   */
  static async deleteConversation(conversationId, userId, userRole) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if conversation exists and user has permission
      const { rows: [conversation] } = await client.query(`
        SELECT c.id, c.type, c.created_by
        FROM conversations c
        WHERE c.id = $1
      `, [conversationId]);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      // Direct messages cannot be deleted
      if (conversation.type === 'direct') {
        throw new Error('Direct conversations cannot be deleted');
      }
      
      // Check permissions: admin, manager, or conversation creator
      const normalizedRole = userRole?.toLowerCase();
      const isAdminOrManager = [ROLES.ADMIN, ROLES.MANAGER].includes(normalizedRole);
      const isCreator = conversation.created_by === userId;
      
      if (!isAdminOrManager && !isCreator) {
        throw new Error('Only admins, managers, or the conversation creator can delete this conversation');
      }
      
      // Delete in order: messages -> participants -> conversation
      await client.query('DELETE FROM messages WHERE conversation_id = $1', [conversationId]);
      await client.query('DELETE FROM conversation_participants WHERE conversation_id = $1', [conversationId]);
      await client.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      
      await client.query('COMMIT');
      
      logger.info(`Deleted conversation ${conversationId} by user ${userId} (${userRole})`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to delete conversation:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get user's conversations with unread counts
   * @param {string} userId - User ID
   * @param {number} limit - Max conversations to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Conversations with metadata
   */
  static async getUserConversations(userId, limit = 50, offset = 0) {
    try {
      const { rows } = await pool.query(`
        SELECT 
          c.id,
          c.type,
          c.name,
          c.created_at,
          c.updated_at,
          cp.last_read_at,
          cp.role_in_conversation,
          COALESCE((
            SELECT COUNT(*)
            FROM messages m
            WHERE m.conversation_id = c.id
              AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
              AND m.sender_id != $1
              AND m.deleted_at IS NULL
          ), 0) as unread_count,
          (
            SELECT json_agg(json_build_object(
              'user_id', u.id,
              'name', u.name,
              'role', r.name
            ))
            FROM conversation_participants cp2
            JOIN users u ON u.id = cp2.user_id
            JOIN roles r ON r.id = u.role_id
            WHERE cp2.conversation_id = c.id
              AND cp2.left_at IS NULL
          ) as participants,
          (
            SELECT json_build_object(
              'id', m.id,
              'content', m.content,
              'message_type', m.message_type,
              'sender_id', m.sender_id,
              'sender_name', u.name,
              'created_at', m.created_at
            )
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.conversation_id = c.id
              AND m.deleted_at IS NULL
            ORDER BY m.created_at DESC
            LIMIT 1
          ) as last_message
        FROM conversations c
        JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE cp.user_id = $1
          AND cp.left_at IS NULL
        ORDER BY c.updated_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);
      
      // Process results - derive name for direct conversations
      const processedRows = rows.map(conv => {
        if (conv.type === 'direct' && !conv.name && conv.participants) {
          // Get the other participant's name for direct conversations
          const otherParticipant = conv.participants.find(p => p.user_id !== userId);
          conv.name = otherParticipant?.name || 'Direct Message';
        }
        
        // Flatten last_message fields for frontend
        if (conv.last_message) {
          conv.last_message_content = conv.last_message.content;
          conv.last_message_at = conv.last_message.created_at;
        }
        
        // Count participants
        conv.participant_count = conv.participants?.length || 0;
        
        return conv;
      });
      
      return processedRows;
    } catch (error) {
      logger.error('Failed to get user conversations:', error);
      throw error;
    }
  }
  
  /**
   * Get channels available for user to join
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Available channels
   */
  static async getAvailableChannels(userId) {
    try {
      const { rows } = await pool.query(`
        SELECT 
          c.id,
          c.name,
          c.created_at,
          (
            SELECT COUNT(*)
            FROM conversation_participants cp
            WHERE cp.conversation_id = c.id AND cp.left_at IS NULL
          ) as member_count,
          u.name as created_by_name
        FROM conversations c
        JOIN users u ON u.id = c.created_by
        WHERE c.type = 'channel'
          AND NOT EXISTS (
            SELECT 1 FROM conversation_participants cp
            WHERE cp.conversation_id = c.id 
              AND cp.user_id = $1 
              AND cp.left_at IS NULL
          )
        ORDER BY c.created_at DESC
      `, [userId]);
      
      return rows;
    } catch (error) {
      logger.error('Failed to get available channels:', error);
      throw error;
    }
  }
  
  /**
   * Join a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated conversation
   */
  static async joinChannel(channelId, userId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify it's a channel
      const { rows: [channel] } = await client.query(`
        SELECT id, type, name FROM conversations WHERE id = $1
      `, [channelId]);
      
      if (!channel) {
        throw new Error('Channel not found');
      }
      
      if (channel.type !== 'channel') {
        throw new Error('Can only join channels, not groups or direct messages');
      }
      
      // Check if already a member
      const { rows: [existing] } = await client.query(`
        SELECT id FROM conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
      `, [channelId, userId]);
      
      if (existing) {
        // Rejoin if previously left
        await client.query(`
          UPDATE conversation_participants
          SET left_at = NULL, joined_at = NOW()
          WHERE conversation_id = $1 AND user_id = $2
        `, [channelId, userId]);
      } else {
        // Add as new member
        await client.query(`
          INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation)
          VALUES ($1, $2, 'member')
        `, [channelId, userId]);
      }
      
      await client.query('COMMIT');
      
      logger.info(`User ${userId} joined channel ${channelId}`);
      
      return channel;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to join channel:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get conversation details with participants
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - Requesting user ID
   * @returns {Promise<Object>} Conversation details
   */
  static async getConversationDetails(conversationId, userId) {
    try {
      // Check user is participant
      const { rows: [participant] } = await pool.query(`
        SELECT 1 FROM conversation_participants
        WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL
      `, [conversationId, userId]);
      
      if (!participant) {
        throw new Error('User is not a participant in this conversation');
      }
      
      const { rows: [conversation] } = await pool.query(`
        SELECT 
          c.id,
          c.type,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          (
            SELECT json_agg(json_build_object(
              'user_id', u.id,
              'name', u.name,
              'email', u.email,
              'role', r.name,
              'role_in_conversation', cp2.role_in_conversation,
              'joined_at', cp2.joined_at,
              'last_read_at', cp2.last_read_at
            ))
            FROM conversation_participants cp2
            JOIN users u ON u.id = cp2.user_id
            JOIN roles r ON r.id = u.role_id
            WHERE cp2.conversation_id = c.id
              AND cp2.left_at IS NULL
          ) as participants
        FROM conversations c
        WHERE c.id = $1
      `, [conversationId]);
      
      return conversation;
    } catch (error) {
      logger.error('Failed to get conversation details:', error);
      throw error;
    }
  }
  
  /**
   * Get messages for a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - Requesting user ID
   * @param {number} limit - Max messages to return
   * @param {string} beforeMessageId - For pagination (messages before this ID)
   * @returns {Promise<Array>} Messages
   */
  static async getMessages(conversationId, userId, limit = 50, beforeMessageId = null) {
    try {
      // Check user is participant
      const { rows: [participant] } = await pool.query(`
        SELECT 1 FROM conversation_participants
        WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL
      `, [conversationId, userId]);
      
      if (!participant) {
        throw new Error('User is not a participant in this conversation');
      }
      
      let query = `
        SELECT 
          m.id,
          m.conversation_id,
          m.sender_id,
          m.message_type,
          m.content,
          m.attachment_url,
          m.attachment_filename,
          m.attachment_size,
          m.voice_duration,
          m.voice_transcript,
          m.created_at,
          m.edited_at,
          u.name as sender_name,
          r.name as sender_role,
          (
            SELECT json_agg(json_build_object(
              'user_id', cp.user_id,
              'name', u2.name
            ))
            FROM conversation_participants cp
            JOIN users u2 ON u2.id = cp.user_id
            WHERE cp.conversation_id = $1
              AND cp.last_read_at >= m.created_at
              AND cp.user_id != m.sender_id
          ) as read_by
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        JOIN roles r ON r.id = u.role_id
        WHERE m.conversation_id = $1
          AND m.deleted_at IS NULL
      `;
      
      const params = [conversationId];
      
      if (beforeMessageId) {
        query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $${params.length + 1})`;
        params.push(beforeMessageId);
      }
      
      query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
      const { rows } = await pool.query(query, params);
      
      // Reverse to get chronological order
      return rows.reverse();
    } catch (error) {
      logger.error('Failed to get messages:', error);
      throw error;
    }
  }
  
  /**
   * Send a message
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} Created message
   */
  static async sendMessage({
    conversationId,
    senderId,
    messageType = 'text',
    content = null,
    attachmentUrl = null,
    attachmentFilename = null,
    attachmentSize = null,
    voiceDuration = null,
    voiceTranscript = null
  }) {
    try {
      // Check sender is participant
      const { rows: [participant] } = await pool.query(`
        SELECT 1 FROM conversation_participants
        WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL
      `, [conversationId, senderId]);
      
      if (!participant) {
        throw new Error('User is not a participant in this conversation');
      }
      
      // Insert message
      const { rows: [message] } = await pool.query(`
        INSERT INTO messages (
          conversation_id, sender_id, message_type, content,
          attachment_url, attachment_filename, attachment_size,
          voice_duration, voice_transcript
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        conversationId, senderId, messageType, content,
        attachmentUrl, attachmentFilename, attachmentSize,
        voiceDuration, voiceTranscript
      ]);
      
      // Get sender info
      const { rows: [sender] } = await pool.query(`
        SELECT u.name, r.name as role
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1
      `, [senderId]);
      
      logger.info(`Message ${message.id} sent in conversation ${conversationId} by user ${senderId}`);
      
      return {
        ...message,
        sender_name: sender.name,
        sender_role: sender.role
      };
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }
  
  /**
   * Mark messages as read (update last_read_at)
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  static async markAsRead(conversationId, userId) {
    try {
      await pool.query(`
        UPDATE conversation_participants
        SET last_read_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
      `, [conversationId, userId]);
      
      logger.debug(`User ${userId} marked conversation ${conversationId} as read`);
    } catch (error) {
      logger.error('Failed to mark as read:', error);
      throw error;
    }
  }
  
  /**
   * Search messages with full-text search
   * @param {string} userId - Requesting user ID
   * @param {string} userRole - User role name
   * @param {string} searchQuery - Search query
   * @param {string[]} conversationIds - Optional: limit to specific conversations
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Search results
   */
  static async searchMessages(userId, userRole, searchQuery, conversationIds = null, limit = 50) {
    try {
      // Admin/manager get global search, others get conversation-scoped
      const isAdminOrManager = [ROLES.ADMIN, ROLES.MANAGER].includes(userRole);
      
      let query, params;
      
      if (isAdminOrManager && !conversationIds) {
        // Global search for admins/managers
        query = `
          SELECT 
            m.id as message_id,
            m.conversation_id,
            m.sender_id,
            u.name as sender_name,
            m.content,
            m.message_type,
            m.created_at,
            c.name as conversation_name,
            c.type as conversation_type,
            ts_rank(m.search_vector, plainto_tsquery('english', $1)) as rank
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          JOIN conversations c ON c.id = m.conversation_id
          WHERE m.deleted_at IS NULL
            AND m.search_vector @@ plainto_tsquery('english', $1)
          ORDER BY rank DESC, m.created_at DESC
          LIMIT $2
        `;
        params = [searchQuery, limit];
      } else {
        // Conversation-scoped search
        query = `
          SELECT * FROM search_messages($1, $2, $3, $4)
        `;
        params = [userId, searchQuery, conversationIds, limit];
      }
      
      const { rows } = await pool.query(query, params);
      
      logger.info(`Search "${searchQuery}" by user ${userId} returned ${rows.length} results`);
      
      return rows;
    } catch (error) {
      logger.error('Failed to search messages:', error);
      throw error;
    }
  }
  
  /**
   * Add participants to a conversation (owner/admin only)
   * @param {string} conversationId - Conversation ID
   * @param {string} requesterId - Requester user ID
   * @param {string[]} userIds - User IDs to add
   * @returns {Promise<void>}
   */
  static async addParticipants(conversationId, requesterId, userIds) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check requester is owner or admin in conversation
      const { rows: [requester] } = await client.query(`
        SELECT role_in_conversation FROM conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
      `, [conversationId, requesterId]);
      
      if (!requester || !['owner', 'admin'].includes(requester.role_in_conversation)) {
        throw new Error('Only conversation owners/admins can add participants');
      }
      
      // Add participants
      const uniqueUsers = [...new Set(userIds)];
      
      for (const userId of uniqueUsers) {
        await client.query(`
          INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation)
          VALUES ($1, $2, 'member')
          ON CONFLICT (conversation_id, user_id) 
          DO UPDATE SET left_at = NULL
        `, [conversationId, userId]);
      }
      
      await client.query('COMMIT');
      
      logger.info(`Added ${uniqueUsers.length} participants to conversation ${conversationId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to add participants:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Leave a conversation (soft leave)
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  static async leaveConversation(conversationId, userId) {
    try {
      await pool.query(`
        UPDATE conversation_participants
        SET left_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
      `, [conversationId, userId]);
      
      logger.info(`User ${userId} left conversation ${conversationId}`);
    } catch (error) {
      logger.error('Failed to leave conversation:', error);
      throw error;
    }
  }

  /**
   * Sync all users to all channels (one-time utility)
   * Ensures every user is a member of every channel
   * @returns {Promise<{usersAdded: number, channelsProcessed: number}>}
   */
  static async syncAllUsersToChannels() {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get all channels
      const channelsResult = await client.query(`
        SELECT id FROM conversations WHERE type = 'channel'
      `);

      if (channelsResult.rows.length === 0) {
        await client.query('COMMIT');
        return { usersAdded: 0, channelsProcessed: 0 };
      }

      // Get all users (exclude soft-deleted)
      const usersResult = await client.query(`
        SELECT id FROM users WHERE deleted_at IS NULL
      `);

      if (usersResult.rows.length === 0) {
        await client.query('COMMIT');
        return { usersAdded: 0, channelsProcessed: channelsResult.rows.length };
      }

      // Build bulk insert query
      const insertValues = [];
      for (const channel of channelsResult.rows) {
        for (const user of usersResult.rows) {
          insertValues.push(`('${channel.id}', '${user.id}', 'member', NOW())`);
        }
      }

      if (insertValues.length > 0) {
        await client.query(`
          INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation, joined_at)
          VALUES ${insertValues.join(',')}
          ON CONFLICT (conversation_id, user_id) DO NOTHING
        `);
      }

      await client.query('COMMIT');

      const totalInserts = insertValues.length;
      logger.info('Synced all users to all channels', {
        channelsProcessed: channelsResult.rows.length,
        usersProcessed: usersResult.rows.length,
        totalInserts
      });

      return {
        usersAdded: totalInserts,
        channelsProcessed: channelsResult.rows.length
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to sync users to channels:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default ChatService;
