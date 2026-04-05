/**
 * Form Email Notification Service
 * Handles sending email notifications for form submissions
 */

import crypto from 'crypto';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { sendEmail } from './emailService.js';

/**
 * Generate a secure token for quick actions (approve/reject)
 * @param {number} submissionId 
 * @param {string} action - 'approve' or 'reject'
 * @param {number} expiresInHours - Default 72 hours (3 days)
 * @returns {Promise<string>} Token
 */
async function generateQuickActionToken(submissionId, action, expiresInHours = 72) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  
  await pool.query(
    `INSERT INTO form_quick_action_tokens (form_submission_id, token, action, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (form_submission_id, action) DO UPDATE 
     SET token = $2, expires_at = $4, used_at = NULL, created_at = NOW()`,
    [submissionId, token, action, expiresAt]
  );
  
  return token;
}

/**
 * Get notification templates for a form
 */
export async function getFormNotifications(formTemplateId) {
  const result = await pool.query(
    `SELECT * FROM form_email_notifications 
     WHERE form_template_id = $1 AND is_active = true
     ORDER BY notification_type`,
    [formTemplateId]
  );
  return result.rows;
}

/**
 * Create a notification template for a form
 */
export async function createNotification(notificationData) {
  const {
    form_template_id,
    notification_type,
    subject,
    body_html,
    body_text,
    recipient_type = 'submitter',
    recipient_emails,
    recipient_field_name,
    cc_emails,
    bcc_emails,
    reply_to,
    trigger_status,
    trigger_delay_minutes = 0,
    is_active = true,
    include_submission_data = true,
    include_confirmation_number = true,
    created_by
  } = notificationData;

  const result = await pool.query(
    `INSERT INTO form_email_notifications (
      form_template_id, notification_type, subject, body_html, body_text,
      recipient_type, recipient_emails, recipient_field_name,
      cc_emails, bcc_emails, reply_to, trigger_status, trigger_delay_minutes,
      is_active, include_submission_data, include_confirmation_number, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      form_template_id, notification_type, subject, body_html, body_text,
      recipient_type, recipient_emails, recipient_field_name,
      cc_emails, bcc_emails, reply_to, trigger_status, trigger_delay_minutes,
      is_active, include_submission_data, include_confirmation_number, created_by
    ]
  );
  return result.rows[0];
}

/**
 * Replace template variables with actual values
 */
function replaceTemplateVariables(template, variables) {
  if (!template) return '';
  
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value ?? '');
  }
  return result;
}

/**
 * Build submission summary HTML
 */
function buildSubmissionSummaryHtml(submissionData, formFields) {
  if (!submissionData || !formFields) return '';
  
  let html = '<table style="width: 100%; border-collapse: collapse;">';
  
  for (const field of formFields) {
    const value = submissionData[field.field_name];
    if (value === undefined || value === null || value === '') continue;
    
    // Skip hidden and layout fields
    if (['hidden', 'section_header', 'paragraph'].includes(field.field_type)) continue;
    
    let displayValue = value;
    
    // Format different types
    if (Array.isArray(value)) {
      displayValue = value.join(', ');
    } else if (typeof value === 'object') {
      displayValue = Object.entries(value)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('<br>');
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
    }
    
    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; font-weight: bold; width: 40%;">${field.field_label}</td>
        <td style="padding: 8px;">${displayValue}</td>
      </tr>`;
  }
  
  html += '</table>';
  return html;
}

/**
 * Build submission summary plain text
 */
function buildSubmissionSummaryText(submissionData, formFields) {
  if (!submissionData || !formFields) return '';
  
  let text = '';
  
  for (const field of formFields) {
    const value = submissionData[field.field_name];
    if (value === undefined || value === null || value === '') continue;
    
    // Skip hidden and layout fields
    if (['hidden', 'section_header', 'paragraph'].includes(field.field_type)) continue;
    
    let displayValue = value;
    
    if (Array.isArray(value)) {
      displayValue = value.join(', ');
    } else if (typeof value === 'object') {
      displayValue = Object.entries(value)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
    }
    
    text += `${field.field_label}: ${displayValue}\n`;
  }
  
  return text;
}

/**
 * Get form fields for a template
 */
async function getFormFields(formTemplateId) {
  const result = await pool.query(
    `SELECT ff.* FROM form_fields ff
     JOIN form_steps fs ON ff.form_step_id = fs.id
     WHERE fs.form_template_id = $1
     ORDER BY fs.order_index, ff.order_index`,
    [formTemplateId]
  );
  return result.rows;
}

/**
 * Send submission confirmation email to the person who submitted the form
 */
export async function sendSubmissionConfirmation(submission, formTemplate) {
  try {
    // Get notification template
    const notifications = await getFormNotifications(formTemplate.id);
    const confirmationTemplate = notifications.find(n => n.notification_type === 'submission_confirmation');
    
    if (!confirmationTemplate) {
      logger.debug('No submission confirmation template configured for form', { formId: formTemplate.id });
      return null;
    }
    
    // Get recipient email from submission data
    const submissionData = submission.submission_data || {};
    let recipientEmail = null;
    
    if (confirmationTemplate.recipient_type === 'submitter') {
      // Look for email field in submission
      recipientEmail = submissionData.email || submissionData.customer_email || submissionData.user_email;
    } else if (confirmationTemplate.recipient_type === 'form_field' && confirmationTemplate.recipient_field_name) {
      recipientEmail = submissionData[confirmationTemplate.recipient_field_name];
    } else if (confirmationTemplate.recipient_type === 'custom' && confirmationTemplate.recipient_emails?.length) {
      recipientEmail = confirmationTemplate.recipient_emails[0];
    }
    
    if (!recipientEmail) {
      logger.warn('No recipient email found for submission confirmation', { submissionId: submission.id });
      return null;
    }
    
    // Get form fields for summary
    const formFields = await getFormFields(formTemplate.id);
    
    // Generate view token (30 days expiry, can be used multiple times)
    const viewToken = await generateQuickActionToken(submission.id, 'view', 720); // 30 days
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Build variables
    const confirmationNumber = `${formTemplate.name?.substring(0, 3)?.toUpperCase() || 'FRM'}-${submission.id}`;
    const customerName = submissionData.name || submissionData.full_name || submissionData.first_name || 'Valued Customer';
    
    const variables = {
      form_name: formTemplate.name,
      confirmation_number: confirmationNumber,
      customer_name: customerName,
      submission_date: new Date(submission.submitted_at || submission.created_at).toLocaleDateString(),
      submission_summary: confirmationTemplate.include_submission_data 
        ? buildSubmissionSummaryHtml(submissionData, formFields) 
        : '',
      submission_summary_text: confirmationTemplate.include_submission_data 
        ? buildSubmissionSummaryText(submissionData, formFields) 
        : '',
      view_submission_link: `${frontendUrl}/api/form-submissions/${submission.id}/view/${viewToken}`,
      view_submission_button: `<a href="${frontendUrl}/api/form-submissions/${submission.id}/view/${viewToken}" style="display:inline-block;background-color:#1890ff;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;margin:10px 0;">View Your Submission</a>`,
      ...submissionData // Include all form fields as variables
    };
    
    // Replace variables in template
    const subject = replaceTemplateVariables(confirmationTemplate.subject, variables);
    const htmlBody = replaceTemplateVariables(confirmationTemplate.body_html, variables);
    const textBody = replaceTemplateVariables(confirmationTemplate.body_text, variables);
    
    // Send email
    await sendEmail({
      to: recipientEmail,
      subject,
      html: htmlBody,
      text: textBody,
      cc: confirmationTemplate.cc_emails,
      bcc: confirmationTemplate.bcc_emails,
      replyTo: confirmationTemplate.reply_to
    });
    
    // Log the email
    await pool.query(
      `INSERT INTO form_email_logs (notification_id, form_submission_id, recipient_email, subject, status, sent_at)
       VALUES ($1, $2, $3, $4, 'sent', NOW())`,
      [confirmationTemplate.id, submission.id, recipientEmail, subject]
    );
    
    logger.info('Submission confirmation email sent', { 
      submissionId: submission.id, 
      recipient: recipientEmail 
    });
    
    return { sent: true, recipient: recipientEmail };
  } catch (error) {
    logger.error('Failed to send submission confirmation email', { 
      error: error.message, 
      submissionId: submission.id 
    });
    
    // Log the failure
    await pool.query(
      `INSERT INTO form_email_logs (form_submission_id, recipient_email, subject, status, error_message)
       VALUES ($1, $2, $3, 'failed', $4)`,
      [submission.id, 'unknown', 'Submission Confirmation', error.message]
    ).catch(() => {}); // Ignore logging errors
    
    return null;
  }
}

/**
 * Send admin alert email when a new submission is received
 */
export async function sendAdminAlert(submission, formTemplate) {
  try {
    // Get notification template
    const notifications = await getFormNotifications(formTemplate.id);
    const alertTemplate = notifications.find(n => n.notification_type === 'admin_alert');
    
    if (!alertTemplate) {
      logger.debug('No admin alert template configured for form', { formId: formTemplate.id });
      return null;
    }
    
    // Get admin recipients
    let recipients = [];
    
    if (alertTemplate.recipient_type === 'admin') {
      // Get admin/manager emails from form template's notification_recipients or use defaults
      if (formTemplate.notification_recipients?.length) {
        recipients = formTemplate.notification_recipients;
      } else {
        // Get admin users
        const admins = await pool.query(
          `SELECT email FROM users WHERE role IN ('admin', 'manager') AND deleted_at IS NULL LIMIT 5`
        );
        recipients = admins.rows.map(r => r.email);
      }
    } else if (alertTemplate.recipient_type === 'custom' && alertTemplate.recipient_emails?.length) {
      recipients = alertTemplate.recipient_emails;
    }
    
    if (!recipients.length) {
      logger.warn('No admin recipients found for alert', { formId: formTemplate.id });
      return null;
    }
    
    // Generate quick action tokens (72 hours expiry)
    const approveToken = await generateQuickActionToken(submission.id, 'approve', 72);
    const rejectToken = await generateQuickActionToken(submission.id, 'reject', 72);
    
    // Get form fields for summary
    const formFields = await getFormFields(formTemplate.id);
    const submissionData = submission.submission_data || {};
    
    // Build variables
    const confirmationNumber = `${formTemplate.name?.substring(0, 3)?.toUpperCase() || 'FRM'}-${submission.id}`;
    const customerName = submissionData.name || submissionData.full_name || submissionData.first_name || 'Unknown';
    const customerEmail = submissionData.email || submissionData.customer_email || 'N/A';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    const variables = {
      form_name: formTemplate.name,
      confirmation_number: confirmationNumber,
      customer_name: customerName,
      customer_email: customerEmail,
      submission_date: new Date(submission.submitted_at || submission.created_at).toLocaleDateString(),
      submission_time: new Date(submission.submitted_at || submission.created_at).toLocaleTimeString(),
      submission_id: submission.id,
      submission_summary: buildSubmissionSummaryHtml(submissionData, formFields),
      submission_summary_text: buildSubmissionSummaryText(submissionData, formFields),
      admin_link: `${frontendUrl}/forms/${formTemplate.id}/responses/${submission.id}`,
      approve_link: `${frontendUrl}/api/form-submissions/${submission.id}/quick-action/${approveToken}/approve`,
      reject_link: `${frontendUrl}/api/form-submissions/${submission.id}/quick-action/${rejectToken}/reject`,
      approve_button: `<a href="${frontendUrl}/api/form-submissions/${submission.id}/quick-action/${approveToken}/approve" style="display:inline-block;background-color:#52c41a;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin-right:10px;">✓ Approve</a>`,
      reject_button: `<a href="${frontendUrl}/api/form-submissions/${submission.id}/quick-action/${rejectToken}/reject" style="display:inline-block;background-color:#ff4d4f;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;">✗ Reject</a>`,
      ...submissionData
    };
    
    // Replace variables
    const subject = replaceTemplateVariables(alertTemplate.subject, variables);
    const htmlBody = replaceTemplateVariables(alertTemplate.body_html, variables);
    const textBody = replaceTemplateVariables(alertTemplate.body_text, variables);
    
    // Send to all recipients
    const results = [];
    for (const recipient of recipients) {
      try {
        await sendEmail({
          to: recipient,
          subject,
          html: htmlBody,
          text: textBody,
          replyTo: customerEmail !== 'N/A' ? customerEmail : undefined
        });
        
        // Log success
        await pool.query(
          `INSERT INTO form_email_logs (notification_id, form_submission_id, recipient_email, subject, status, sent_at)
           VALUES ($1, $2, $3, $4, 'sent', NOW())`,
          [alertTemplate.id, submission.id, recipient, subject]
        );
        
        results.push({ recipient, sent: true });
      } catch (err) {
        logger.error('Failed to send admin alert to recipient', { recipient, error: err.message });
        results.push({ recipient, sent: false, error: err.message });
      }
    }
    
    logger.info('Admin alert emails processed', { 
      submissionId: submission.id, 
      results 
    });
    
    return results;
  } catch (error) {
    logger.error('Failed to send admin alert emails', { 
      error: error.message, 
      submissionId: submission.id 
    });
    return null;
  }
}

/**
 * Send status update email when submission status changes
 */
export async function sendStatusUpdateEmail(submission, formTemplate, newStatus) {
  try {
    // Get notification template for this status
    const notifications = await getFormNotifications(formTemplate.id);
    const statusTemplate = notifications.find(
      n => n.notification_type === 'status_update' && n.trigger_status === newStatus
    );
    
    if (!statusTemplate) {
      logger.debug('No status update template for status', { formId: formTemplate.id, status: newStatus });
      return null;
    }
    
    // Get recipient email from submission data
    const submissionData = submission.submission_data || {};
    const recipientEmail = submissionData.email || submissionData.customer_email || submissionData.user_email;
    
    if (!recipientEmail) {
      logger.warn('No recipient email found for status update', { submissionId: submission.id });
      return null;
    }
    
    // Build variables
    const variables = {
      form_name: formTemplate.name,
      new_status: newStatus,
      status_label: newStatus.charAt(0).toUpperCase() + newStatus.slice(1),
      customer_name: submissionData.name || submissionData.full_name || 'Valued Customer',
      submission_id: submission.id,
      ...submissionData
    };
    
    // Replace variables
    const subject = replaceTemplateVariables(statusTemplate.subject, variables);
    const htmlBody = replaceTemplateVariables(statusTemplate.body_html, variables);
    const textBody = replaceTemplateVariables(statusTemplate.body_text, variables);
    
    // Send email
    await sendEmail({
      to: recipientEmail,
      subject,
      html: htmlBody,
      text: textBody,
      replyTo: statusTemplate.reply_to
    });
    
    // Log the email
    await pool.query(
      `INSERT INTO form_email_logs (notification_id, form_submission_id, recipient_email, subject, status, sent_at)
       VALUES ($1, $2, $3, $4, 'sent', NOW())`,
      [statusTemplate.id, submission.id, recipientEmail, subject]
    );
    
    logger.info('Status update email sent', { 
      submissionId: submission.id, 
      status: newStatus,
      recipient: recipientEmail 
    });
    
    return { sent: true, recipient: recipientEmail };
  } catch (error) {
    logger.error('Failed to send status update email', { 
      error: error.message, 
      submissionId: submission.id,
      status: newStatus
    });
    return null;
  }
}

/**
 * Send booking created email notification
 */
export async function sendBookingCreatedEmail({ to, customerName, bookingDetails }) {
  const subject = `Booking Confirmed - ${bookingDetails.serviceName || 'Your Session'}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #52c41a;">Booking Confirmed! ✓</h2>
      
      <p>Dear ${customerName},</p>
      
      <p>Your booking has been successfully created and confirmed.</p>
      
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Booking Details</h3>
        <p><strong>Service:</strong> ${bookingDetails.serviceName || 'N/A'}</p>
        <p><strong>Date:</strong> ${bookingDetails.date || 'N/A'}</p>
        <p><strong>Time:</strong> ${bookingDetails.time || 'N/A'}</p>
        ${bookingDetails.instructor ? `<p><strong>Instructor:</strong> ${bookingDetails.instructor}</p>` : ''}
        ${bookingDetails.location ? `<p><strong>Location:</strong> ${bookingDetails.location}</p>` : ''}
        ${bookingDetails.confirmationNumber ? `<p><strong>Confirmation #:</strong> ${bookingDetails.confirmationNumber}</p>` : ''}
      </div>
      
      <p>If you have any questions, please don't hesitate to contact us.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      
      <p style="color: #999; font-size: 12px;">
        This is an automated confirmation email.
      </p>
    </div>
  `;

  const textBody = `
Booking Confirmed!

Dear ${customerName},

Your booking has been successfully created and confirmed.

Booking Details:
- Service: ${bookingDetails.serviceName || 'N/A'}
- Date: ${bookingDetails.date || 'N/A'}
- Time: ${bookingDetails.time || 'N/A'}
${bookingDetails.instructor ? `- Instructor: ${bookingDetails.instructor}` : ''}
${bookingDetails.location ? `- Location: ${bookingDetails.location}` : ''}
${bookingDetails.confirmationNumber ? `- Confirmation #: ${bookingDetails.confirmationNumber}` : ''}

If you have any questions, please don't hesitate to contact us.
  `.trim();

  await sendEmail({
    to,
    subject,
    html: htmlBody,
    text: textBody
  });

  logger.info('Sent booking created email', { to, service: bookingDetails.serviceName });
}

/**
 * Send account created email notification
 */
export async function sendAccountCreatedEmail({ to, customerName, loginDetails }) {
  const subject = 'Welcome! Your Account Has Been Created';
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1890ff;">Welcome to UKC.world! 🎉</h2>
      
      <p>Dear ${customerName},</p>
      
      <p>Your account has been successfully created. You can now access your bookings, view your history, and manage your profile.</p>
      
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Your Account Details</h3>
        <p><strong>Email:</strong> ${loginDetails.email}</p>
        ${loginDetails.temporaryPassword ? `<p><strong>Temporary Password:</strong> ${loginDetails.temporaryPassword}</p>` : ''}
      </div>
      
      ${loginDetails.temporaryPassword ? `
      <p style="color: #ff4d4f;"><strong>Important:</strong> Please change your password after your first login.</p>
      ` : ''}
      
      <div style="margin: 30px 0;">
        <a href="${loginDetails.loginUrl || 'https://plannivo.com/login'}" 
           style="background-color: #1890ff; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          Log In to Your Account
        </a>
      </div>
      
      <p>If you have any questions, please don't hesitate to contact us.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      
      <p style="color: #999; font-size: 12px;">
        This is an automated welcome email. If you didn't create an account, please ignore this email.
      </p>
    </div>
  `;

  const textBody = `
Welcome to UKC.world!

Dear ${customerName},

Your account has been successfully created. You can now access your bookings, view your history, and manage your profile.

Your Account Details:
- Email: ${loginDetails.email}
${loginDetails.temporaryPassword ? `- Temporary Password: ${loginDetails.temporaryPassword}` : ''}

${loginDetails.temporaryPassword ? 'Important: Please change your password after your first login.' : ''}

Log in at: ${loginDetails.loginUrl || 'https://plannivo.com/login'}

If you have any questions, please don't hesitate to contact us.
  `.trim();

  await sendEmail({
    to,
    subject,
    html: htmlBody,
    text: textBody
  });

  logger.info('Sent account created email', { to });
}

/**
 * Get available template variables for a form
 */
export function getAvailableVariables(formFields) {
  const baseVariables = [
    { name: 'form_name', description: 'Name of the form' },
    { name: 'confirmation_number', description: 'Unique confirmation number' },
    { name: 'customer_name', description: 'Name of the submitter' },
    { name: 'customer_email', description: 'Email of the submitter' },
    { name: 'submission_date', description: 'Date of submission' },
    { name: 'submission_time', description: 'Time of submission' },
    { name: 'submission_summary', description: 'HTML summary of all form fields' },
    { name: 'submission_summary_text', description: 'Plain text summary of all form fields' },
    { name: 'admin_link', description: 'Link to view submission in admin panel' },
    { name: 'new_status', description: 'New status (for status updates)' },
  ];
  
  // Add form field variables
  const fieldVariables = formFields
    .filter(f => !['section_header', 'paragraph'].includes(f.field_type))
    .map(f => ({
      name: f.field_name,
      description: f.field_label
    }));
  
  return [...baseVariables, ...fieldVariables];
}

/**
 * Send resume link email to continue form progress
 */
export async function sendResumeEmail({ to, formName, resumeLink, expiresAt }) {
  const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `Continue your ${formName} form`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1890ff;">Continue Your Form</h2>
      
      <p>You have an incomplete form that you can continue filling out.</p>
      
      <p><strong>Form:</strong> ${formName}</p>
      
      <div style="margin: 30px 0;">
        <a href="${resumeLink}" 
           style="background-color: #1890ff; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          Continue Form
        </a>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        This link will expire on ${expiresFormatted}. After that, you'll need to start a new form.
      </p>
      
      <p style="color: #666; font-size: 14px;">
        If you didn't request this email, you can safely ignore it.
      </p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      
      <p style="color: #999; font-size: 12px;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${resumeLink}" style="color: #1890ff;">${resumeLink}</a>
      </p>
    </div>
  `;

  const textBody = `
Continue Your Form

You have an incomplete form that you can continue filling out.

Form: ${formName}

Click the link below to continue:
${resumeLink}

This link will expire on ${expiresFormatted}. After that, you'll need to start a new form.

If you didn't request this email, you can safely ignore it.
  `.trim();

  await sendEmail({
    to,
    subject,
    html: htmlBody,
    text: textBody
  });

  logger.info('Sent resume link email', { to, formName });
}

export default {
  getFormNotifications,
  createNotification,
  sendSubmissionConfirmation,
  sendAdminAlert,
  sendStatusUpdateEmail,
  getAvailableVariables,
  sendResumeEmail,
  sendBookingCreatedEmail,
  sendAccountCreatedEmail
};
