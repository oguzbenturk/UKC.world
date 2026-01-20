import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Get all support tickets for admin management
 * @param {Object} filters - Optional filters (status, priority, studentId)
 * @returns {Promise<Array>} List of support tickets with student info
 */
export async function getAllSupportTickets(filters = {}) {
  const { status, priority, studentId } = filters;
  
  const whereConditions = [];
  const params = [];
  let paramCount = 1;

  if (status) {
    whereConditions.push(`ssr.status = $${paramCount++}`);
    params.push(status);
  }

  if (priority) {
    whereConditions.push(`ssr.priority = $${paramCount++}`);
    params.push(priority);
  }

  if (studentId) {
    whereConditions.push(`ssr.student_id = $${paramCount++}`);
    params.push(studentId);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}` 
    : '';

  const query = `
    SELECT 
      ssr.id,
      ssr.student_id,
      ssr.subject,
      ssr.message,
      ssr.channel,
      ssr.priority,
      ssr.status,
      ssr.metadata,
      ssr.created_at,
      ssr.updated_at,
      ssr.resolved_at,
      u.name as student_name,
      u.email as student_email
    FROM student_support_requests ssr
    JOIN users u ON ssr.student_id = u.id
    ${whereClause}
    ORDER BY 
      CASE ssr.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
      END,
      ssr.created_at DESC
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Update support ticket status
 * @param {string} ticketId - Ticket UUID
 * @param {string} status - New status (open, in_progress, resolved, closed)
 * @returns {Promise<Object>} Updated ticket
 */
export async function updateSupportTicketStatus(ticketId, status) {
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const query = `
    UPDATE student_support_requests
    SET 
      status = $1,
      updated_at = NOW(),
      resolved_at = CASE WHEN $1 IN ('resolved', 'closed') THEN NOW() ELSE resolved_at END
    WHERE id = $2
    RETURNING *
  `;

  const result = await pool.query(query, [status, ticketId]);
  
  if (result.rows.length === 0) {
    throw new Error('Support ticket not found');
  }

  logger.info(`Support ticket ${ticketId} status updated to ${status}`);
  return result.rows[0];
}

/**
 * Add internal note to support ticket metadata
 * @param {string} ticketId - Ticket UUID
 * @param {string} note - Admin note
 * @param {string} adminId - Admin user ID
 * @returns {Promise<Object>} Updated ticket
 */
export async function addTicketNote(ticketId, note, adminId) {
  const query = `
    UPDATE student_support_requests
    SET 
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{notes}',
        COALESCE(metadata->'notes', '[]'::jsonb) || jsonb_build_object(
          'timestamp', to_jsonb(NOW()),
          'admin_id', to_jsonb($2::text),
          'note', to_jsonb($3)
        )
      ),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await pool.query(query, [ticketId, adminId, note]);
  
  if (result.rows.length === 0) {
    throw new Error('Support ticket not found');
  }

  return result.rows[0];
}

/**
 * Get ticket statistics for dashboard
 * @returns {Promise<Object>} Ticket counts by status and priority
 */
export async function getTicketStatistics() {
  const query = `
    SELECT 
      status,
      priority,
      COUNT(*)::integer as count
    FROM student_support_requests
    GROUP BY status, priority
    ORDER BY status, priority
  `;

  const result = await pool.query(query);
  
  const stats = {
    byStatus: {},
    byPriority: {},
    total: 0
  };

  result.rows.forEach(row => {
    if (!stats.byStatus[row.status]) {
      stats.byStatus[row.status] = 0;
    }
    if (!stats.byPriority[row.priority]) {
      stats.byPriority[row.priority] = 0;
    }
    
    stats.byStatus[row.status] += row.count;
    stats.byPriority[row.priority] += row.count;
    stats.total += row.count;
  });

  return stats;
}
