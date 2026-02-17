import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Track a form analytics event
 * @param {Object} params - Event parameters
 * @returns {Promise<Object>} Created event record
 */
export async function trackEvent({
  formTemplateId,
  quickLinkId = null,
  eventType,
  sessionId = null,
  userId = null,
  metadata = {},
  ipAddress = null,
  userAgent = null,
  referrer = null
}) {
  try {
    const query = `
      INSERT INTO form_analytics_events (
        form_template_id,
        quick_link_id,
        event_type,
        session_id,
        user_id,
        metadata,
        ip_address,
        user_agent,
        referrer
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await pool.query(query, [
      formTemplateId,
      quickLinkId,
      eventType,
      sessionId,
      userId,
      JSON.stringify(metadata),
      ipAddress,
      userAgent,
      referrer
    ]);

    return result.rows[0];
  } catch (error) {
    // Don't throw - analytics should not break main flow
    logger.warn('Failed to track analytics event:', error.message);
    return null;
  }
}

/**
 * Get analytics summary for a form
 * @param {number} formTemplateId - Form template ID
 * @param {Object} options - Date range options
 * @returns {Promise<Object>} Analytics summary
 */
export async function getFormAnalytics(formTemplateId, { startDate, endDate } = {}) {
  const conditions = ['form_template_id = $1'];
  const params = [formTemplateId];
  let paramCount = 2;

  if (startDate) {
    conditions.push(`created_at >= $${paramCount++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`created_at <= $${paramCount++}`);
    params.push(endDate);
  }

  const whereClause = conditions.join(' AND ');

  // Get event counts by type
  const countsQuery = `
    SELECT 
      event_type,
      COUNT(*) as count
    FROM form_analytics_events
    WHERE ${whereClause}
    GROUP BY event_type
  `;

  const countsResult = await pool.query(countsQuery, params);

  const eventCounts = {};
  countsResult.rows.forEach(row => {
    eventCounts[row.event_type] = parseInt(row.count);
  });

  // Calculate metrics
  const views = eventCounts.form_view || 0;
  const submissions = eventCounts.form_submit || 0;
  const starts = eventCounts.form_start || views; // form_start or fallback to views
  const completionRate = starts > 0 ? ((submissions / starts) * 100).toFixed(1) : 0;
  const dropOffRate = starts > 0 ? (((starts - submissions) / starts) * 100).toFixed(1) : 0;

  // Get daily breakdown for chart
  const dailyQuery = `
    SELECT 
      DATE(created_at) as date,
      event_type,
      COUNT(*) as count
    FROM form_analytics_events
    WHERE ${whereClause}
    GROUP BY DATE(created_at), event_type
    ORDER BY date ASC
  `;

  const dailyResult = await pool.query(dailyQuery, params);

  // Group by date
  const dailyData = {};
  dailyResult.rows.forEach(row => {
    const dateStr = row.date.toISOString().split('T')[0];
    if (!dailyData[dateStr]) {
      dailyData[dateStr] = { date: dateStr, views: 0, submissions: 0 };
    }
    if (row.event_type === 'form_view') {
      dailyData[dateStr].views = parseInt(row.count);
    } else if (row.event_type === 'form_submit') {
      dailyData[dateStr].submissions = parseInt(row.count);
    }
  });

  // Get unique sessions count
  const sessionsQuery = `
    SELECT COUNT(DISTINCT session_id) as unique_sessions
    FROM form_analytics_events
    WHERE ${whereClause} AND session_id IS NOT NULL
  `;

  const sessionsResult = await pool.query(sessionsQuery, params);
  const uniqueSessions = parseInt(sessionsResult.rows[0]?.unique_sessions || 0);

  // Get top referrers
  const referrersQuery = `
    SELECT 
      referrer,
      COUNT(*) as count
    FROM form_analytics_events
    WHERE ${whereClause} AND referrer IS NOT NULL AND referrer != ''
    GROUP BY referrer
    ORDER BY count DESC
    LIMIT 10
  `;

  const referrersResult = await pool.query(referrersQuery, params);

  return {
    summary: {
      total_views: views,
      total_submissions: submissions,
      unique_sessions: uniqueSessions,
      completion_rate: parseFloat(completionRate),
      drop_off_rate: parseFloat(dropOffRate)
    },
    event_counts: eventCounts,
    daily_data: Object.values(dailyData),
    top_referrers: referrersResult.rows
  };
}

/**
 * Get step-by-step analytics
 * @param {number} formTemplateId - Form template ID
 * @returns {Promise<Array>} Step analytics
 */
export async function getStepAnalytics(formTemplateId) {
  const query = `
    SELECT 
      metadata->>'step_id' as step_id,
      metadata->>'step_index' as step_index,
      COUNT(*) FILTER (WHERE event_type = 'step_change') as step_views,
      COUNT(*) FILTER (WHERE event_type = 'step_complete') as step_completions
    FROM form_analytics_events
    WHERE form_template_id = $1 
      AND (event_type = 'step_change' OR event_type = 'step_complete')
      AND metadata->>'step_id' IS NOT NULL
    GROUP BY metadata->>'step_id', metadata->>'step_index'
    ORDER BY (metadata->>'step_index')::int ASC NULLS LAST
  `;

  const result = await pool.query(query, [formTemplateId]);
  return result.rows;
}

/**
 * Track step change event
 * @param {Object} params - Step change parameters
 */
export async function trackStepChange({
  formTemplateId,
  quickLinkId,
  sessionId,
  stepId,
  stepIndex,
  direction
}) {
  return trackEvent({
    formTemplateId,
    quickLinkId,
    eventType: 'step_change',
    sessionId,
    metadata: { step_id: stepId, step_index: stepIndex, direction }
  });
}
