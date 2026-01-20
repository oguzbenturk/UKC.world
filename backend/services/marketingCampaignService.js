import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Get all marketing campaigns
 * @param {Object} filters - Optional filters (type, status)
 * @returns {Promise<Array>} List of campaigns
 */
export async function getAllCampaigns(filters = {}) {
  const { type, status } = filters;
  
  const whereConditions = [];
  const params = [];
  let paramCount = 1;

  if (type) {
    whereConditions.push(`type = $${paramCount++}`);
    params.push(type);
  }

  if (status) {
    whereConditions.push(`status = $${paramCount++}`);
    params.push(status);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      mc.*,
      u.first_name || ' ' || u.last_name as created_by_name
    FROM marketing_campaigns mc
    LEFT JOIN users u ON mc.created_by = u.id
    ${whereClause}
    ORDER BY mc.created_at DESC
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get campaign by ID
 * @param {number} campaignId
 * @returns {Promise<Object>} Campaign
 */
export async function getCampaignById(campaignId) {
  const query = 'SELECT * FROM marketing_campaigns WHERE id = $1';
  const result = await pool.query(query, [campaignId]);
  
  if (result.rows.length === 0) {
    throw new Error('Campaign not found');
  }
  
  return result.rows[0];
}

/**
 * Create a new campaign
 * @param {Object} data - Campaign data
 * @param {string} userId - Creator user ID
 * @returns {Promise<Object>} Created campaign
 */
export async function createCampaign(data, userId) {
  const {
    name,
    type,
    templateType,
    audience,
    emailSubject,
    emailContent,
    emailHtml,
    popupTitle,
    popupMessage,
    popupButtonText,
    popupButtonUrl,
    popupImageUrl,
    popupStyle,
    smsContent,
    whatsappContent,
    whatsappMediaUrl,
    questionText,
    questionSubtitle,
    questionBgImage,
    questionBgColor,
    questionTextColor,
    questionIconType,
    questionAnswers,
    sendImmediately,
    scheduleDate
  } = data;

  const query = `
    INSERT INTO marketing_campaigns (
      name, type, template_type, audience,
      email_subject, email_content, email_html,
      popup_title, popup_message, popup_button_text, popup_button_url, popup_image_url, popup_style,
      sms_content, whatsapp_content, whatsapp_media_url,
      question_text, question_subtitle, question_bg_image, question_bg_color, question_text_color, question_icon_type, question_answers,
      send_immediately, schedule_date, status, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 'draft', $26
    )
    RETURNING *
  `;

  const result = await pool.query(query, [
    name, type, templateType || null, audience,
    emailSubject || null, emailContent || null, emailHtml || null,
    popupTitle || null, popupMessage || null, popupButtonText || null, 
    popupButtonUrl || null, popupImageUrl || null, JSON.stringify(popupStyle || {}),
    smsContent || null, whatsappContent || null, whatsappMediaUrl || null,
    questionText || null, questionSubtitle || null, questionBgImage || null, 
    questionBgColor || null, questionTextColor || null, questionIconType || 'question', 
    JSON.stringify(questionAnswers || []),
    sendImmediately || false, scheduleDate || null, userId
  ]);

  logger.info('Marketing campaign created', { campaignId: result.rows[0].id, type, name });
  return result.rows[0];
}

/**
 * Update campaign
 * @param {number} campaignId
 * @param {Object} updates
 * @returns {Promise<Object>} Updated campaign
 */
export async function updateCampaign(campaignId, updates) {
  const allowedFields = [
    'name', 'template_type', 'audience', 'email_subject', 'email_content', 'email_html',
    'popup_title', 'popup_message', 'popup_button_text', 'popup_button_url', 
    'popup_image_url', 'popup_style', 'sms_content', 'whatsapp_content', 'whatsapp_media_url',
    'question_text', 'question_subtitle', 'question_bg_image', 'question_bg_color', 
    'question_text_color', 'question_icon_type', 'question_answers',
    'status', 'schedule_date', 'send_immediately'
  ];

  const setClauses = [];
  const params = [];
  let paramCount = 1;

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramCount++}`);
      const value = (key === 'popup_style' || key === 'question_answers') 
        ? JSON.stringify(updates[key]) 
        : updates[key];
      params.push(value);
    }
  });

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  setClauses.push('updated_at = NOW()');
  params.push(campaignId);

  const query = `
    UPDATE marketing_campaigns
    SET ${setClauses.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  
  if (result.rows.length === 0) {
    throw new Error('Campaign not found');
  }

  logger.info('Campaign updated', { campaignId });
  return result.rows[0];
}

/**
 * Delete campaign
 * @param {number} campaignId
 */
export async function deleteCampaign(campaignId) {
  const query = 'DELETE FROM marketing_campaigns WHERE id = $1';
  await pool.query(query, [campaignId]);
  logger.info('Campaign deleted', { campaignId });
}

/**
 * Update campaign analytics
 * @param {number} campaignId
 * @param {Object} analytics - { sent, opened, clicked, converted }
 */
export async function updateCampaignAnalytics(campaignId, analytics) {
  const { sent, opened, clicked, converted } = analytics;
  
  const updates = [];
  const params = [];
  let paramCount = 1;

  if (sent !== undefined) {
    updates.push(`sent_count = sent_count + $${paramCount++}`);
    params.push(sent);
  }
  if (opened !== undefined) {
    updates.push(`opened_count = opened_count + $${paramCount++}`);
    params.push(opened);
  }
  if (clicked !== undefined) {
    updates.push(`clicked_count = clicked_count + $${paramCount++}`);
    params.push(clicked);
  }
  if (converted !== undefined) {
    updates.push(`converted_count = converted_count + $${paramCount++}`);
    params.push(converted);
  }

  params.push(campaignId);

  const query = `
    UPDATE marketing_campaigns
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
  `;

  await pool.query(query, params);
}
