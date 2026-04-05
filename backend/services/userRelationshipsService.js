/**
 * User Relationships Service
 * Manages friend/connection relationships between users for group bookings
 */

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { insertNotification } from './notificationWriter.js';

/**
 * Send a friend request to another user
 */
export const sendFriendRequest = async (senderId, receiverId, message = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if sender and receiver are different
    if (senderId === receiverId) {
      throw new Error('You cannot send a friend request to yourself');
    }

    // Check if receiver exists and is a valid user (student role)
    const receiverResult = await client.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [receiverId]
    );

    if (receiverResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const receiver = receiverResult.rows[0];

    // Check if relationship already exists (in either direction)
    const existingResult = await client.query(
      `SELECT id, status, sender_id, receiver_id 
       FROM user_relationships 
       WHERE (sender_id = $1 AND receiver_id = $2) 
          OR (sender_id = $2 AND receiver_id = $1)`,
      [senderId, receiverId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      
      if (existing.status === 'accepted') {
        throw new Error('You are already connected with this user');
      }
      
      if (existing.status === 'pending') {
        if (existing.sender_id === senderId) {
          throw new Error('You have already sent a friend request to this user');
        } else {
          // The other user already sent us a request - auto-accept it
          await client.query(
            `UPDATE user_relationships 
             SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [existing.id]
          );
          
          await client.query('COMMIT');
          
          logger.info('Friend request auto-accepted (mutual request)', { senderId, receiverId });
          return { status: 'accepted', message: 'Friend request accepted! You are now connected.' };
        }
      }
      
      if (existing.status === 'blocked') {
        throw new Error('Unable to send friend request to this user');
      }
      
      if (existing.status === 'declined') {
        // Allow re-sending if previously declined (update existing record)
        await client.query(
          `UPDATE user_relationships 
           SET status = 'pending', message = $3, updated_at = NOW(), declined_at = NULL
           WHERE id = $1`,
          [existing.id, message]
        );
        
        // Get sender name for notification
        const senderResult = await client.query(
          `SELECT COALESCE(name, CONCAT(first_name, ' ', last_name)) as full_name 
           FROM users WHERE id = $1`,
          [senderId]
        );
        const senderName = senderResult.rows[0]?.full_name || 'Someone';
        
        // Notify receiver
        await insertNotification({
          userId: receiverId,
          title: 'Friend Request',
          message: `${senderName} sent you a friend request`,
          type: 'friend_request',
          data: {
            relationshipId: existing.id,
            senderId,
            senderName,
            status: 'pending',
            actions: [
              { key: 'accept', label: 'Accept', type: 'primary' },
              { key: 'decline', label: 'Decline', type: 'danger' }
            ]
          },
          client
        });
        
        await client.query('COMMIT');
        return { status: 'pending', message: 'Friend request sent' };
      }
    }

    // Create new relationship
    const result = await client.query(
      `INSERT INTO user_relationships (sender_id, receiver_id, message, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [senderId, receiverId, message]
    );

    const relationshipId = result.rows[0].id;

    // Get sender name for notification
    const senderResult = await client.query(
      `SELECT COALESCE(name, CONCAT(first_name, ' ', last_name)) as full_name 
       FROM users WHERE id = $1`,
      [senderId]
    );
    const senderName = senderResult.rows[0]?.full_name || 'Someone';

    // Notify receiver
    await insertNotification({
      userId: receiverId,
      title: 'Friend Request',
      message: `${senderName} sent you a friend request`,
      type: 'friend_request',
      data: {
        relationshipId,
        senderId,
        senderName,
        status: 'pending',
        actions: [
          { key: 'accept', label: 'Accept', type: 'primary' },
          { key: 'decline', label: 'Decline', type: 'danger' }
        ]
      },
      idempotencyKey: `friend-request:${relationshipId}`,
      client
    });

    await client.query('COMMIT');

    logger.info('Friend request sent', { senderId, receiverId, relationshipId });
    return { status: 'pending', relationshipId, message: 'Friend request sent' };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error sending friend request', { senderId, receiverId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Accept a friend request
 */
export const acceptFriendRequest = async (userId, relationshipId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the relationship
    const result = await client.query(
      `SELECT * FROM user_relationships WHERE id = $1`,
      [relationshipId]
    );

    if (result.rows.length === 0) {
      throw new Error('Friend request not found');
    }

    const relationship = result.rows[0];

    // Verify the user is the receiver
    if (relationship.receiver_id !== userId) {
      throw new Error('You are not authorized to accept this request');
    }

    if (relationship.status === 'accepted') {
      return { success: true, message: 'Already connected' };
    }

    if (relationship.status !== 'pending') {
      throw new Error('This friend request cannot be accepted');
    }

    // Update status
    await client.query(
      `UPDATE user_relationships 
       SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [relationshipId]
    );

    // Update notification status
    await client.query(
      `UPDATE notifications
       SET data = jsonb_set(
         COALESCE(data, '{}'::jsonb),
         '{status}',
         '"processed"'::jsonb
       ),
       updated_at = NOW()
       WHERE user_id = $1
       AND type = 'friend_request'
       AND (data->>'relationshipId')::text = $2::text`,
      [userId, relationshipId]
    );

    // Get receiver name to notify sender
    const receiverResult = await client.query(
      `SELECT COALESCE(name, CONCAT(first_name, ' ', last_name)) as full_name 
       FROM users WHERE id = $1`,
      [userId]
    );
    const receiverName = receiverResult.rows[0]?.full_name || 'Someone';

    // Notify sender that request was accepted
    await insertNotification({
      userId: relationship.sender_id,
      title: 'Friend Request Accepted',
      message: `${receiverName} accepted your friend request! You can now invite them to group lessons.`,
      type: 'friend_request_accepted',
      data: {
        relationshipId,
        receiverId: userId,
        receiverName,
        cta: {
          label: 'View Friends',
          href: '/student/friends'
        }
      },
      client
    });

    await client.query('COMMIT');

    logger.info('Friend request accepted', { userId, relationshipId });
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error accepting friend request', { userId, relationshipId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Decline a friend request
 */
export const declineFriendRequest = async (userId, relationshipId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the relationship
    const result = await client.query(
      `SELECT * FROM user_relationships WHERE id = $1`,
      [relationshipId]
    );

    if (result.rows.length === 0) {
      throw new Error('Friend request not found');
    }

    const relationship = result.rows[0];

    // Verify the user is the receiver
    if (relationship.receiver_id !== userId) {
      throw new Error('You are not authorized to decline this request');
    }

    if (relationship.status === 'declined') {
      return { success: true, message: 'Already declined' };
    }

    // Update status
    await client.query(
      `UPDATE user_relationships 
       SET status = 'declined', declined_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [relationshipId]
    );

    // Update notification status
    await client.query(
      `UPDATE notifications
       SET data = jsonb_set(
         COALESCE(data, '{}'::jsonb),
         '{status}',
         '"processed"'::jsonb
       ),
       updated_at = NOW()
       WHERE user_id = $1
       AND type = 'friend_request'
       AND (data->>'relationshipId')::text = $2::text`,
      [userId, relationshipId]
    );

    await client.query('COMMIT');

    logger.info('Friend request declined', { userId, relationshipId });
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error declining friend request', { userId, relationshipId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Remove a friend (unfriend)
 */
export const removeFriend = async (userId, friendId) => {
  const result = await pool.query(
    `DELETE FROM user_relationships 
     WHERE status = 'accepted'
       AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
     RETURNING id`,
    [userId, friendId]
  );

  if (result.rows.length === 0) {
    throw new Error('You are not connected with this user');
  }

  logger.info('Friend removed', { userId, friendId });
  return { success: true };
};

/**
 * Block a user
 */
export const blockUser = async (userId, blockedUserId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for existing relationship
    const existing = await client.query(
      `SELECT id, sender_id FROM user_relationships 
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)`,
      [userId, blockedUserId]
    );

    if (existing.rows.length > 0) {
      // Update existing relationship to blocked
      // Make sure the blocker is recorded as sender
      if (existing.rows[0].sender_id === userId) {
        await client.query(
          `UPDATE user_relationships SET status = 'blocked', updated_at = NOW() WHERE id = $1`,
          [existing.rows[0].id]
        );
      } else {
        // Delete existing and create new with correct direction
        await client.query(`DELETE FROM user_relationships WHERE id = $1`, [existing.rows[0].id]);
        await client.query(
          `INSERT INTO user_relationships (sender_id, receiver_id, status)
           VALUES ($1, $2, 'blocked')`,
          [userId, blockedUserId]
        );
      }
    } else {
      // Create new blocked relationship
      await client.query(
        `INSERT INTO user_relationships (sender_id, receiver_id, status)
         VALUES ($1, $2, 'blocked')`,
        [userId, blockedUserId]
      );
    }

    await client.query('COMMIT');
    logger.info('User blocked', { userId, blockedUserId });
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error blocking user', { userId, blockedUserId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get list of friends (accepted connections)
 */
export const getFriends = async (userId) => {
  const result = await pool.query(
    `SELECT 
       CASE WHEN r.sender_id = $1 THEN r.receiver_id ELSE r.sender_id END as friend_id,
       r.id as relationship_id,
       r.accepted_at,
       u.first_name,
       u.last_name,
       u.email,
       u.avatar_url,
       COALESCE(u.name, CONCAT(u.first_name, ' ', u.last_name)) as full_name
     FROM user_relationships r
     JOIN users u ON u.id = CASE WHEN r.sender_id = $1 THEN r.receiver_id ELSE r.sender_id END
     WHERE (r.sender_id = $1 OR r.receiver_id = $1)
       AND r.status = 'accepted'
       AND u.deleted_at IS NULL
     ORDER BY r.accepted_at DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Get pending friend requests (received)
 */
export const getPendingRequests = async (userId) => {
  const result = await pool.query(
    `SELECT 
       r.id as relationship_id,
       r.sender_id,
       r.message,
       r.created_at,
       u.first_name,
       u.last_name,
       u.email,
       u.avatar_url,
       COALESCE(u.name, CONCAT(u.first_name, ' ', u.last_name)) as full_name
     FROM user_relationships r
     JOIN users u ON u.id = r.sender_id
     WHERE r.receiver_id = $1
       AND r.status = 'pending'
       AND u.deleted_at IS NULL
     ORDER BY r.created_at DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Get sent friend requests (pending)
 */
export const getSentRequests = async (userId) => {
  const result = await pool.query(
    `SELECT 
       r.id as relationship_id,
       r.receiver_id,
       r.message,
       r.created_at,
       u.first_name,
       u.last_name,
       u.email,
       u.avatar_url,
       COALESCE(u.name, CONCAT(u.first_name, ' ', u.last_name)) as full_name
     FROM user_relationships r
     JOIN users u ON u.id = r.receiver_id
     WHERE r.sender_id = $1
       AND r.status = 'pending'
       AND u.deleted_at IS NULL
     ORDER BY r.created_at DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Check if two users are friends
 */
export const areFriends = async (userId1, userId2) => {
  const result = await pool.query(
    `SELECT 1 FROM user_relationships 
     WHERE status = 'accepted'
       AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
     LIMIT 1`,
    [userId1, userId2]
  );

  return result.rows.length > 0;
};

/**
 * Get relationship status between two users
 */
export const getRelationshipStatus = async (userId, otherUserId) => {
  const result = await pool.query(
    `SELECT status, sender_id, receiver_id, id as relationship_id
     FROM user_relationships 
     WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
     LIMIT 1`,
    [userId, otherUserId]
  );

  if (result.rows.length === 0) {
    return { status: 'none' };
  }

  const rel = result.rows[0];
  return {
    status: rel.status,
    relationshipId: rel.relationship_id,
    isSender: rel.sender_id === userId
  };
};

/**
 * Cancel a sent friend request
 */
export const cancelFriendRequest = async (userId, relationshipId) => {
  const result = await pool.query(
    `DELETE FROM user_relationships 
     WHERE id = $1 AND sender_id = $2 AND status = 'pending'
     RETURNING id`,
    [relationshipId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Friend request not found or already processed');
  }

  logger.info('Friend request cancelled', { userId, relationshipId });
  return { success: true };
};

export default {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
  getFriends,
  getPendingRequests,
  getSentRequests,
  areFriends,
  getRelationshipStatus,
  cancelFriendRequest
};
