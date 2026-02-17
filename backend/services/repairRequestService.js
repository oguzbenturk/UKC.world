import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { insertNotification } from './notificationWriter.js';

/**
 * Get all repair requests (admin/manager) or user's own requests
 * @param {Object} filters - Optional filters (status, priority, userId)
 * @param {string} requestingUserId - ID of user making the request
 * @param {string} userRole - Role of requesting user
 * @returns {Promise<Array>} List of repair requests
 */
export async function getRepairRequests({ status, priority, userId }, requestingUserId, userRole) {
  const whereConditions = [];
  const params = [];
  let paramCount = 1;

  // Regular users can only see their own requests
  if (userRole !== 'admin' && userRole !== 'manager') {
    whereConditions.push(`rr.user_id = $${paramCount++}`);
    params.push(requestingUserId);
  } else if (userId) {
    // Admin/Manager can filter by specific user
    whereConditions.push(`rr.user_id = $${paramCount++}`);
    params.push(userId);
  }

  if (status) {
    whereConditions.push(`rr.status = $${paramCount++}`);
    params.push(status);
  }

  if (priority) {
    whereConditions.push(`rr.priority = $${paramCount++}`);
    params.push(priority);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      rr.*,
      u.first_name || ' ' || u.last_name as user_name,
      u.email as user_email,
      assigned_u.first_name || ' ' || assigned_u.last_name as assigned_to_name
    FROM repair_requests rr
    LEFT JOIN users u ON rr.user_id = u.id
    LEFT JOIN users assigned_u ON rr.assigned_to = assigned_u.id
    ${whereClause}
    ORDER BY rr.created_at DESC
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Create a new repair request
 * @param {Object} data - Repair request data
 * @param {string} userId - ID of user creating the request
 * @returns {Promise<Object>} Created repair request
 */
export async function createRepairRequest(data, userId) {
  const {
    equipmentType,
    itemName,
    description,
    photos = [],
    priority,
    location
  } = data;

  const query = `
    INSERT INTO repair_requests (
      user_id, equipment_type, item_name, description, 
      photos, priority, location, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    RETURNING *
  `;

  const result = await pool.query(query, [
    userId,
    equipmentType,
    itemName,
    description,
    JSON.stringify(photos),
    priority,
    location || null
  ]);

  logger.info('Repair request created', { 
    requestId: result.rows[0].id, 
    userId, 
    equipmentType 
  });

  return result.rows[0];
}

/**
 * Update repair request status (admin/manager only)
 * @param {number} requestId - Request ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated request
 */
export async function updateRepairRequest(requestId, updates) {
  const { status, assignedTo, notes } = updates;
  
  // First get the current repair request to compare changes and get user_id
  const currentResult = await pool.query(
    'SELECT * FROM repair_requests WHERE id = $1',
    [requestId]
  );
  
  if (currentResult.rows.length === 0) {
    throw new Error('Repair request not found');
  }
  
  const currentRepair = currentResult.rows[0];
  const setClauses = [];
  const params = [];
  let paramCount = 1;

  if (status) {
    setClauses.push(`status = $${paramCount++}`);
    params.push(status);
  }

  if (assignedTo !== undefined) {
    setClauses.push(`assigned_to = $${paramCount++}`);
    params.push(assignedTo);
  }

  if (notes !== undefined) {
    setClauses.push(`notes = $${paramCount++}`);
    params.push(notes);
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(requestId);

  const query = `
    UPDATE repair_requests
    SET ${setClauses.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  const updatedRepair = result.rows[0];

  logger.info('Repair request updated', { requestId, updates });
  
  // Send notification to the user who submitted the request
  try {
    const statusChanged = status && status !== currentRepair.status;
    // Normalize empty strings and null to allow proper comparison
    const currentNotes = currentRepair.notes || '';
    const newNotes = notes || '';
    const notesAdded = newNotes && newNotes !== currentNotes;
    
    logger.info('Repair notification check', { 
      statusChanged, 
      notesAdded, 
      status, 
      currentStatus: currentRepair.status,
      newNotes: newNotes ? newNotes.substring(0, 50) : null,
      currentNotes: currentNotes ? currentNotes.substring(0, 50) : null,
      userId: currentRepair.user_id
    });
    
    if (statusChanged || notesAdded) {
      const statusLabels = {
        pending: 'Pending',
        in_progress: 'In Progress',
        completed: 'Completed',
        cancelled: 'Cancelled'
      };
      
      let notificationTitle = '';
      let notificationMessage = '';
      
      if (statusChanged && notesAdded) {
        notificationTitle = 'Repair Request Updated';
        notificationMessage = `Your repair request for "${updatedRepair.item_name}" has been updated to ${statusLabels[status] || status}. Admin note: ${notes}`;
      } else if (statusChanged) {
        notificationTitle = 'Repair Request Status Changed';
        notificationMessage = `Your repair request for "${updatedRepair.item_name}" is now ${statusLabels[status] || status}.`;
      } else if (notesAdded) {
        notificationTitle = 'New Note on Repair Request';
        notificationMessage = `Admin added a note to your repair request for "${updatedRepair.item_name}": ${notes}`;
      }
      
      logger.info('Sending repair notification', { 
        userId: currentRepair.user_id, 
        title: notificationTitle,
        type: 'repair_update'
      });
      
      await insertNotification({
        userId: currentRepair.user_id,
        title: notificationTitle,
        message: notificationMessage,
        type: 'repair_update',
        data: {
          repairRequestId: requestId,
          itemName: updatedRepair.item_name,
          oldStatus: currentRepair.status,
          newStatus: status || currentRepair.status,
          hasNotes: !!notesAdded,
          cta: {
            label: 'View Details',
            href: '/repairs'
          }
        }
      });
      
      logger.info('Repair notification sent successfully');
    } else {
      logger.info('No notification needed - no status or notes changes detected');
    }
  } catch (notifError) {
    // Don't fail the update if notification fails
    logger.error('Failed to send repair update notification:', notifError);
  }
  
  return updatedRepair;
}

/**
 * Get repair request statistics
 * @returns {Promise<Object>} Statistics
 */
export async function getRepairStatistics() {
  const query = `
    SELECT 
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
      COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_count,
      COUNT(*) as total_count
    FROM repair_requests
  `;

  const result = await pool.query(query);
  return result.rows[0];
}

/**
 * Get comments for a repair request
 * @param {number} repairRequestId - Repair request ID
 * @param {string} userId - Current user ID
 * @param {string} userRole - Current user role
 * @returns {Promise<Array>} List of comments
 */
export async function getRepairComments(repairRequestId, userId, userRole) {
  // First verify the user has access to this repair request
  const repairQuery = await pool.query(
    'SELECT user_id FROM repair_requests WHERE id = $1',
    [repairRequestId]
  );
  
  if (repairQuery.rows.length === 0) {
    throw new Error('Repair request not found');
  }
  
  const repairOwnerId = repairQuery.rows[0].user_id;
  // Compare as strings to handle UUID comparison properly
  const isOwner = String(repairOwnerId) === String(userId);
  const isAdminOrManager = ['admin', 'manager'].includes(userRole);
  
  logger.info('Repair comment access check', { 
    repairRequestId, 
    repairOwnerId, 
    userId, 
    isOwner, 
    isAdminOrManager, 
    userRole 
  });
  
  if (!isOwner && !isAdminOrManager) {
    throw new Error('You do not have access to this repair request');
  }
  
  // Build query - exclude internal comments for non-admin/manager users
  let query = `
    SELECT 
      c.id,
      c.repair_request_id,
      c.user_id,
      c.message,
      c.is_internal,
      c.created_at,
      u.first_name,
      u.last_name,
      r.name as user_role
    FROM repair_request_comments c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE c.repair_request_id = $1
  `;
  
  if (!isAdminOrManager) {
    query += ' AND c.is_internal = FALSE';
  }
  
  query += ' ORDER BY c.created_at ASC';
  
  const result = await pool.query(query, [repairRequestId]);
  return result.rows;
}

/**
 * Add a comment to a repair request
 * @param {number} repairRequestId - Repair request ID
 * @param {string} userId - Comment author user ID
 * @param {string} userRole - Comment author role
 * @param {string} message - Comment message
 * @param {boolean} isInternal - Whether this is an internal comment
 * @returns {Promise<Object>} Created comment
 */
export async function addRepairComment(repairRequestId, userId, userRole, message, isInternal = false) {
  // First verify the user has access to this repair request
  const repairQuery = await pool.query(
    'SELECT user_id, item_name FROM repair_requests WHERE id = $1',
    [repairRequestId]
  );
  
  if (repairQuery.rows.length === 0) {
    throw new Error('Repair request not found');
  }
  
  const repairRequest = repairQuery.rows[0];
  const repairOwnerId = repairRequest.user_id;
  // Compare as strings to handle UUID comparison properly
  const isOwner = String(repairOwnerId) === String(userId);
  const isAdminOrManager = ['admin', 'manager'].includes(userRole);
  
  logger.info('Repair comment add access check', { 
    repairRequestId, 
    repairOwnerId, 
    userId, 
    isOwner, 
    isAdminOrManager, 
    userRole 
  });
  
  if (!isOwner && !isAdminOrManager) {
    throw new Error('You do not have access to this repair request');
  }
  
  // Insert the comment
  const insertQuery = `
    INSERT INTO repair_request_comments (repair_request_id, user_id, message, is_internal)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  
  const result = await pool.query(insertQuery, [repairRequestId, userId, message, isInternal]);
  const newComment = result.rows[0];
  
  // Get user details for the response
  const userQuery = await pool.query(
    'SELECT u.first_name, u.last_name, r.name as role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = $1',
    [userId]
  );
  const userDetails = userQuery.rows[0];
  
  // Send notification if not an internal comment
  if (!isInternal) {
    try {
      // Notify the other party (admin notifies user, user notifies admin)
      if (isAdminOrManager) {
        // Admin/manager replied - notify the customer
        await insertNotification({
          userId: repairRequest.user_id,
          title: 'New Reply on Repair Request',
          message: `Staff replied to your repair request for "${repairRequest.item_name}": ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
          type: 'repair_comment',
          data: {
            repairRequestId,
            itemName: repairRequest.item_name,
            commentId: newComment.id,
            cta: {
              label: 'View Conversation',
              href: '/repairs'
            }
          }
        });
      } else {
        // Customer replied - notify all admins and managers
        const adminQuery = await pool.query(
          `SELECT u.id FROM users u 
           JOIN roles r ON u.role_id = r.id 
           WHERE r.name IN ('admin', 'manager') AND u.deleted_at IS NULL`
        );
        
        for (const admin of adminQuery.rows) {
          await insertNotification({
            userId: admin.id,
            title: 'Customer Reply on Repair Request',
            message: `Customer replied to repair request for "${repairRequest.item_name}": ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
            type: 'repair_comment',
            data: {
              repairRequestId,
              itemName: repairRequest.item_name,
              commentId: newComment.id,
              customerUserId: userId,
              cta: {
                label: 'View Conversation',
                href: '/repairs'
              }
            }
          });
        }
      }
    } catch (notifError) {
      logger.error('Failed to send repair comment notification:', notifError);
    }
  }
  
  return {
    ...newComment,
    first_name: userDetails.first_name,
    last_name: userDetails.last_name,
    user_role: userDetails.role
  };
}
