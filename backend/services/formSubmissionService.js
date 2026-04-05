import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import crypto from 'crypto';
import { sendEmail } from './emailService.js';

/**
 * Generate a unique session ID for form submissions
 * @returns {string} 32-character session ID
 */
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Get all form submissions with filters
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} List of submissions
 */
export async function getFormSubmissions({
  form_template_id,
  quick_link_id,
  status,
  search,
  start_date,
  end_date,
  limit = 50,
  offset = 0
} = {}) {
  const conditions = [];
  const params = [];
  let paramCount = 1;

  if (form_template_id) {
    conditions.push(`fsub.form_template_id = $${paramCount++}`);
    params.push(form_template_id);
  }

  if (quick_link_id) {
    conditions.push(`fsub.quick_link_id = $${paramCount++}`);
    params.push(quick_link_id);
  }

  if (status) {
    conditions.push(`fsub.status = $${paramCount++}`);
    params.push(status);
  }

  if (search) {
    conditions.push(`(
      fsub.submission_data::text ILIKE $${paramCount} OR
      fsub.notes ILIKE $${paramCount}
    )`);
    params.push(`%${search}%`);
    paramCount++;
  }

  if (start_date) {
    conditions.push(`fsub.created_at >= $${paramCount++}`);
    params.push(start_date);
  }

  if (end_date) {
    conditions.push(`fsub.created_at <= $${paramCount++}`);
    params.push(end_date);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      fsub.*,
      ft.name as form_name,
      ft.category as form_category,
      ql.name as quick_link_name,
      ql.link_code as quick_link_code,
      u.first_name || ' ' || u.last_name as user_name,
      u.email as user_email,
      pb.first_name || ' ' || pb.last_name as processed_by_name
    FROM form_submissions fsub
    LEFT JOIN form_templates ft ON fsub.form_template_id = ft.id
    LEFT JOIN quick_links ql ON fsub.quick_link_id = ql.id
    LEFT JOIN users u ON fsub.user_id = u.id
    LEFT JOIN users pb ON fsub.processed_by = pb.id
    ${whereClause}
    ORDER BY fsub.created_at DESC
    LIMIT $${paramCount++} OFFSET $${paramCount}
  `;

  params.push(limit, offset);
  const result = await pool.query(query, params);

  // Get total count
  const countQuery = `
    SELECT COUNT(*) FROM form_submissions fsub
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params.slice(0, -2)); // Remove limit/offset

  return {
    submissions: result.rows,
    total: parseInt(countResult.rows[0].count),
    limit,
    offset
  };
}

/**
 * Get a single submission by ID
 * @param {number} id - Submission ID
 * @returns {Promise<Object|null>} Submission with form details
 */
export async function getFormSubmissionById(id) {
  const query = `
    SELECT 
      fsub.*,
      ft.name as form_name,
      ft.category as form_category,
      ql.name as quick_link_name,
      ql.link_code as quick_link_code,
      u.first_name || ' ' || u.last_name as user_name,
      u.email as user_email,
      pb.first_name || ' ' || pb.last_name as processed_by_name
    FROM form_submissions fsub
    LEFT JOIN form_templates ft ON fsub.form_template_id = ft.id
    LEFT JOIN quick_links ql ON fsub.quick_link_id = ql.id
    LEFT JOIN users u ON fsub.user_id = u.id
    LEFT JOIN users pb ON fsub.processed_by = pb.id
    WHERE fsub.id = $1
  `;

  const result = await pool.query(query, [id]);
  
  if (result.rows.length === 0) {
    return null;
  }

  const submission = result.rows[0];

  // Get form structure for display
  const formQuery = `
    SELECT 
      fs.title as step_title,
      ff.field_name,
      ff.field_label,
      ff.field_type,
      ff.order_index
    FROM form_steps fs
    JOIN form_fields ff ON ff.form_step_id = fs.id
    WHERE fs.form_template_id = $1
    ORDER BY fs.order_index, ff.order_index
  `;

  const formResult = await pool.query(formQuery, [submission.form_template_id]);
  submission.form_fields = formResult.rows;

  return submission;
}

/**
 * Get submission by session ID (for resuming drafts)
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Submission
 */
export async function getFormSubmissionBySessionId(sessionId) {
  const query = `
    SELECT * FROM form_submissions 
    WHERE session_id = $1 AND status = 'draft'
  `;

  const result = await pool.query(query, [sessionId]);
  return result.rows[0] || null;
}

/**
 * Create a new form submission
 * @param {Object} data - Submission data
 * @returns {Promise<Object>} Created submission
 */
export async function createFormSubmission(data) {
  const {
    quick_link_id,
    form_template_id,
    submission_data = {},
    metadata = {},
    status = 'submitted',
    user_id = null,
    session_id = null  // Allow passing existing session_id for drafts
  } = data;

  // Use provided session_id or generate a new one
  const sessionId = session_id || generateSessionId();
  const submittedAt = status === 'submitted' ? new Date() : null;

  const query = `
    INSERT INTO form_submissions (
      quick_link_id, form_template_id, session_id, status,
      submission_data, metadata, user_id, submitted_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const result = await pool.query(query, [
    quick_link_id || null,
    form_template_id,
    sessionId,
    status,
    JSON.stringify(submission_data),
    JSON.stringify(metadata),
    user_id,
    submittedAt
  ]);

  // If linked to a quick link, increment use_count
  if (quick_link_id && status === 'submitted') {
    await pool.query(
      'UPDATE quick_links SET use_count = use_count + 1 WHERE id = $1',
      [quick_link_id]
    );
  }

  // Send notification emails for submitted forms
  if (status === 'submitted') {
    try {
      await sendFormSubmissionNotifications(result.rows[0], form_template_id, quick_link_id);
    } catch (emailError) {
      logger.error('Failed to send form submission notifications:', emailError);
      // Don't fail the submission if email fails
    }
  }

  logger.info(`Form submission created: ID ${result.rows[0].id} (${status})`);
  return result.rows[0];
}

/**
 * Update a form submission (save draft or update status)
 * @param {number} id - Submission ID
 * @param {Object} data - Update data
 * @returns {Promise<Object|null>} Updated submission
 */
export async function updateFormSubmission(id, data) {
  const allowedFields = ['submission_data', 'status', 'notes', 'metadata', 'user_id'];
  
  const updates = [];
  const params = [];
  let paramCount = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'submission_data' || field === 'metadata') {
        updates.push(`${field} = $${paramCount++}`);
        params.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramCount++}`);
        params.push(data[field]);
      }
    }
  }

  // Handle status change to submitted
  if (data.status === 'submitted') {
    updates.push(`submitted_at = NOW()`);
  }

  if (updates.length === 0) {
    return getFormSubmissionById(id);
  }

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const query = `
    UPDATE form_submissions 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

/**
 * Process a submission (mark as processed)
 * @param {number} id - Submission ID
 * @param {string} processedBy - User ID of processor
 * @param {string} notes - Processing notes
 * @returns {Promise<Object|null>} Updated submission
 */
export async function processFormSubmission(id, processedBy, notes) {
  const query = `
    UPDATE form_submissions 
    SET status = 'processed', 
        processed_at = NOW(), 
        processed_by = $2,
        notes = COALESCE($3, notes),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await pool.query(query, [id, processedBy, notes]);
  
  if (result.rows.length > 0) {
    logger.info(`Form submission processed: ID ${id} by user ${processedBy}`);
  }
  
  return result.rows[0] || null;
}

/**
 * Archive a submission
 * @param {number} id - Submission ID
 * @returns {Promise<Object|null>} Updated submission
 */
export async function archiveFormSubmission(id) {
  const query = `
    UPDATE form_submissions 
    SET status = 'archived', updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

/**
 * Delete a submission (GDPR compliance)
 * @param {number} id - Submission ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteFormSubmission(id) {
  const result = await pool.query(
    'DELETE FROM form_submissions WHERE id = $1 RETURNING id',
    [id]
  );
  
  if (result.rows.length > 0) {
    logger.info(`Form submission deleted: ID ${id}`);
    return true;
  }
  
  return false;
}

/**
 * Get form for public display by quick link code
 * @param {string} linkCode - Quick link code
 * @returns {Promise<Object|null>} Form template with structure
 */
export async function getFormByQuickLinkCode(linkCode) {
  // Get quick link and verify it's valid
  const linkQuery = `
    SELECT ql.*, ft.id as form_template_id, ft.name as form_name
    FROM quick_links ql
    LEFT JOIN form_templates ft ON ql.form_template_id = ft.id
    WHERE ql.link_code = $1
      AND ql.is_active = true
      AND (ql.expires_at IS NULL OR ql.expires_at > NOW())
      AND (ql.max_uses IS NULL OR ql.use_count < ql.max_uses)
  `;

  const linkResult = await pool.query(linkQuery, [linkCode]);
  
  if (linkResult.rows.length === 0) {
    return null;
  }

  const quickLink = linkResult.rows[0];

  // If no custom form template, return default structure
  if (!quickLink.form_template_id) {
    return {
      quick_link: quickLink,
      form_template: null,
      use_default_form: true
    };
  }

  // Get form template with steps and fields
  const templateQuery = `
    SELECT 
      ft.id, ft.name, ft.description, ft.category,
      ft.theme_config, ft.settings, ft.published_version, ft.is_active,
      CASE WHEN ft.published_version IS NOT NULL THEN 'published' ELSE 'draft' END as status
    FROM form_templates ft
    WHERE ft.id = $1 AND ft.is_active = true AND ft.deleted_at IS NULL
  `;

  const templateResult = await pool.query(templateQuery, [quickLink.form_template_id]);
  
  if (templateResult.rows.length === 0) {
    return {
      quick_link: quickLink,
      form_template: null,
      use_default_form: true
    };
  }

  const template = templateResult.rows[0];

  // Get steps
  const stepsQuery = `
    SELECT * FROM form_steps 
    WHERE form_template_id = $1 
    ORDER BY order_index ASC
  `;
  
  const stepsResult = await pool.query(stepsQuery, [template.id]);
  template.steps = stepsResult.rows;

  // Get fields for each step
  for (const step of template.steps) {
    const fieldsQuery = `
      SELECT * FROM form_fields 
      WHERE form_step_id = $1 
      ORDER BY order_index ASC
    `;
    
    const fieldsResult = await pool.query(fieldsQuery, [step.id]);
    step.fields = fieldsResult.rows;
  }

  return {
    quick_link: quickLink,
    form_template: template,
    use_default_form: false
  };
}

/**
 * Validate submission data against form template
 * @param {Object} submissionData - Data to validate
 * @param {number} formTemplateId - Form template ID
 * @returns {Promise<Object>} Validation result
 */
export async function validateSubmission(submissionData, formTemplateId) {
  const errors = [];

  // Get form fields
  const fieldsQuery = `
    SELECT ff.*, fs.title as step_title
    FROM form_fields ff
    JOIN form_steps fs ON ff.form_step_id = fs.id
    WHERE fs.form_template_id = $1
    ORDER BY fs.order_index, ff.order_index
  `;

  const fieldsResult = await pool.query(fieldsQuery, [formTemplateId]);
  const fields = fieldsResult.rows;

  for (const field of fields) {
    const value = submissionData[field.field_name];
    const validationRules = field.validation_rules || {};

    // Check required
    if (field.is_required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: field.field_name,
        message: `${field.field_label} is required`,
        type: 'required'
      });
      continue;
    }

    if (value === undefined || value === null || value === '') {
      continue; // Skip other validations for empty optional fields
    }

    // Type-specific validations
    switch (field.field_type) {
      case 'email':
        // Accept any string if it's not empty (per user request to allow every email)
        /* 
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push({
            field: field.field_name,
            message: `${field.field_label} must be a valid email address`,
            type: 'format'
          });
        }
        */
        break;

      case 'phone':
        // Accept any string (per user request to allow every phone number)
        /*
        if (!/^\+?[\d\s\-()]{7,20}$/.test(value)) {
          errors.push({
            field: field.field_name,
            message: `${field.field_label} must be a valid phone number`,
            type: 'format'
          });
        }
        */
        break;

      case 'url':
        try {
          new URL(value);
        } catch {
          errors.push({
            field: field.field_name,
            message: `${field.field_label} must be a valid URL`,
            type: 'format'
          });
        }
        break;

      case 'number':
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push({
            field: field.field_name,
            message: `${field.field_label} must be a number`,
            type: 'format'
          });
        } else {
          if (validationRules.min_value !== undefined && num < validationRules.min_value) {
            errors.push({
              field: field.field_name,
              message: `${field.field_label} must be at least ${validationRules.min_value}`,
              type: 'min_value'
            });
          }
          if (validationRules.max_value !== undefined && num > validationRules.max_value) {
            errors.push({
              field: field.field_name,
              message: `${field.field_label} must be at most ${validationRules.max_value}`,
              type: 'max_value'
            });
          }
        }
        break;
    }

    // String length validations
    if (typeof value === 'string') {
      if (validationRules.min_length && value.length < validationRules.min_length) {
        errors.push({
          field: field.field_name,
          message: `${field.field_label} must be at least ${validationRules.min_length} characters`,
          type: 'min_length'
        });
      }
      if (validationRules.max_length && value.length > validationRules.max_length) {
        errors.push({
          field: field.field_name,
          message: `${field.field_label} must be at most ${validationRules.max_length} characters`,
          type: 'max_length'
        });
      }
      if (validationRules.pattern) {
        // Skip predefined pattern names that are already handled by type-specific validation above
        const predefinedPatterns = ['email', 'phone', 'url'];
        if (!predefinedPatterns.includes(validationRules.pattern)) {
          try {
            const regex = new RegExp(validationRules.pattern);
            if (!regex.test(value)) {
              errors.push({
                field: field.field_name,
                message: validationRules.custom_error_message || `${field.field_label} format is invalid`,
                type: 'pattern'
              });
            }
          } catch {
            // Invalid regex pattern, skip
          }
        }
      }
    }

    // Select/radio validation - check if value is in options
    if (['select', 'radio'].includes(field.field_type) && field.options) {
      const validValues = field.options.map(opt => opt.value);
      if (!validValues.includes(value)) {
        errors.push({
          field: field.field_name,
          message: `${field.field_label} must be one of the allowed options`,
          type: 'invalid_option'
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get submission statistics for a form template
 * @param {number} formTemplateId - Form template ID
 * @returns {Promise<Object>} Statistics
 */
export async function getFormSubmissionStats(formTemplateId) {
  const query = `
    SELECT 
      COUNT(*) FILTER (WHERE status = 'submitted') as submitted_count,
      COUNT(*) FILTER (WHERE status = 'processed') as processed_count,
      COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
      COUNT(*) FILTER (WHERE status = 'archived') as archived_count,
      COUNT(*) as total_count,
      AVG(EXTRACT(EPOCH FROM (submitted_at - created_at))) FILTER (WHERE submitted_at IS NOT NULL) as avg_completion_time_seconds
    FROM form_submissions
    WHERE form_template_id = $1
  `;

  const result = await pool.query(query, [formTemplateId]);
  return result.rows[0];
}

/**
 * Send notification emails for a form submission
 * @param {Object} submission - The form submission
 * @param {number} formTemplateId - Form template ID
 * @param {number} quickLinkId - Quick link ID (optional)
 */
async function sendFormSubmissionNotifications(submission, formTemplateId, quickLinkId) {
  // Get form template and quick link info for notification config
  const templateQuery = `
    SELECT 
      ft.name as form_name,
      ft.settings,
      ql.notification_recipients
    FROM form_templates ft
    LEFT JOIN quick_links ql ON ql.id = $2
    WHERE ft.id = $1
  `;
  
  const result = await pool.query(templateQuery, [formTemplateId, quickLinkId]);
  if (result.rows.length === 0) return;
  
  const { form_name, settings, notification_recipients } = result.rows[0];
  
  // Determine recipients - check quick link first, then form settings
  let recipients = [];
  if (notification_recipients && notification_recipients.length > 0) {
    recipients = notification_recipients;
  } else if (settings?.notification_emails) {
    recipients = Array.isArray(settings.notification_emails) 
      ? settings.notification_emails 
      : [settings.notification_emails];
  }
  
  // If no recipients configured, get admin emails
  if (recipients.length === 0) {
    const adminQuery = `
      SELECT email FROM users 
      WHERE role = 'admin' AND deleted_at IS NULL 
      LIMIT 3
    `;
    const adminResult = await pool.query(adminQuery);
    recipients = adminResult.rows.map(r => r.email);
  }
  
  if (recipients.length === 0) {
    logger.info('No notification recipients configured for form submission');
    return;
  }
  
  // Format submission data for email
  const submissionData = submission.submission_data || {};
  const dataRows = Object.entries(submissionData)
    .map(([key, value]) => {
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
      return `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>${key}</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${displayValue}</td></tr>`;
    })
    .join('');
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1890ff;">New Form Submission</h2>
      <p>A new submission has been received for <strong>${form_name}</strong>.</p>
      
      <h3>Submission Details</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tbody>
          ${dataRows}
        </tbody>
      </table>
      
      <p style="margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/forms/${formTemplateId}/responses" 
           style="background: #1890ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          View in Dashboard
        </a>
      </p>
      
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
      <p style="color: #666; font-size: 12px;">
        Submitted at: ${new Date(submission.created_at).toLocaleString()}<br />
        Submission ID: ${submission.id}
      </p>
    </div>
  `;
  
  const textContent = `
New Form Submission

Form: ${form_name}

Submission Data:
${Object.entries(submissionData).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n')}

Submitted at: ${new Date(submission.created_at).toLocaleString()}
Submission ID: ${submission.id}
  `;
  
  // Send to each recipient
  for (const email of recipients) {
    try {
      await sendEmail({
        to: email,
        subject: `New Form Submission: ${form_name}`,
        html: htmlContent,
        text: textContent,
        skipConsentCheck: true, // Transactional email
        notificationType: 'form_submission'
      });
      logger.info(`Form submission notification sent to ${email}`);
    } catch (emailErr) {
      logger.error(`Failed to send notification to ${email}:`, emailErr);
    }
  }
}

