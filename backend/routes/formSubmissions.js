import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import * as formSubmissionService from '../services/formSubmissionService.js';
import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const router = express.Router();

// ============================================
// ADMIN ROUTES (Authenticated)
// ============================================

/**
 * GET /api/form-submissions
 * Get all submissions (with filters)
 */
router.get('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { form_template_id, quick_link_id, status, search, start_date, end_date, limit, offset } = req.query;
    
    const result = await formSubmissionService.getFormSubmissions({
      form_template_id: form_template_id ? parseInt(form_template_id) : undefined,
      quick_link_id: quick_link_id ? parseInt(quick_link_id) : undefined,
      status,
      search,
      start_date,
      end_date,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Error fetching form submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

/**
 * GET /api/form-submissions/:id
 * Get a specific submission by ID
 */
router.get('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const submission = await formSubmissionService.getFormSubmissionById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json(submission);
  } catch (error) {
    logger.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

/**
 * PATCH /api/form-submissions/:id/process
 * Mark a submission as processed
 */
router.patch('/:id/process', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { notes } = req.body;
    const submission = await formSubmissionService.processFormSubmission(
      req.params.id,
      req.user.id,
      notes
    );
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json(submission);
  } catch (error) {
    logger.error('Error processing submission:', error);
    res.status(500).json({ error: 'Failed to process submission' });
  }
});

/**
 * PATCH /api/form-submissions/:id/archive
 * Archive a submission
 */
router.patch('/:id/archive', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const submission = await formSubmissionService.archiveFormSubmission(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json(submission);
  } catch (error) {
    logger.error('Error archiving submission:', error);
    res.status(500).json({ error: 'Failed to archive submission' });
  }
});

/**
 * PATCH /api/form-submissions/:id
 * Update submission (notes, status)
 * Accessible by admin, manager, instructor
 */
router.patch('/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const { notes, status } = req.body;
    const submission = await formSubmissionService.updateFormSubmission(req.params.id, { notes, status });
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json(submission);
  } catch (error) {
    logger.error('Error updating submission:', error);
    res.status(500).json({ error: 'Failed to update submission' });
  }
});

/**
 * DELETE /api/form-submissions/:id
 * Delete a submission (admin only)
 */
router.delete('/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const success = await formSubmissionService.deleteFormSubmission(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json({ success: true, message: 'Submission deleted' });
  } catch (error) {
    logger.error('Error deleting submission:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

/**
 * GET /api/form-submissions/:id/quick-action/:token/:action
 * Quick action from email link (approve/reject)
 * PUBLIC ENDPOINT - Authenticated via token
 */
router.get('/:id/quick-action/:token/:action', async (req, res) => {
  const { id, token, action } = req.params;
  
  try {
    // Validate action
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).send(`
        <html>
          <head><title>Invalid Action</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #ff4d4f;">Invalid Action</h1>
            <p>The action you attempted is not valid.</p>
          </body>
        </html>
      `);
    }

    // Verify token
    const tokenResult = await pool.query(
      `SELECT * FROM form_quick_action_tokens 
       WHERE form_submission_id = $1 AND token = $2 AND action = $3`,
      [id, token, action]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(404).send(`
        <html>
          <head><title>Invalid Token</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #ff4d4f;">Invalid or Expired Link</h1>
            <p>This quick action link is invalid or has already been used.</p>
          </body>
        </html>
      `);
    }
    
    const tokenData = tokenResult.rows[0];
    
    // Check if already used
    if (tokenData.used_at) {
      return res.status(400).send(`
        <html>
          <head><title>Already Used</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #faad14;">Already Processed</h1>
            <p>This submission has already been ${action}ed on ${new Date(tokenData.used_at).toLocaleString()}.</p>
          </body>
        </html>
      `);
    }
    
    // Check if expired
    if (new Date() > new Date(tokenData.expires_at)) {
      return res.status(400).send(`
        <html>
          <head><title>Expired</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #ff4d4f;">Link Expired</h1>
            <p>This quick action link expired on ${new Date(tokenData.expires_at).toLocaleString()}.</p>
            <p>Please access the submission through the admin panel.</p>
          </body>
        </html>
      `);
    }
    
    // Update submission status
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      `UPDATE form_submissions 
       SET status = $1, processed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [newStatus, id]
    );
    
    // Mark token as used
    await pool.query(
      `UPDATE form_quick_action_tokens 
       SET used_at = NOW() 
       WHERE id = $1`,
      [tokenData.id]
    );
    
    // Get submission details for response
    const submission = await pool.query(
      `SELECT fs.*, ft.name as form_name 
       FROM form_submissions fs
       JOIN form_templates ft ON fs.form_template_id = ft.id
       WHERE fs.id = $1`,
      [id]
    );
    
    const submissionData = submission.rows[0];
    const confirmationNumber = `${submissionData.form_name?.substring(0, 3)?.toUpperCase() || 'FRM'}-${id}`;
    
    // Return success page
    const successColor = action === 'approve' ? '#52c41a' : '#ff4d4f';
    const successIcon = action === 'approve' ? '✓' : '✗';
    const actionPastTense = action === 'approve' ? 'Approved' : 'Rejected';
    
    res.send(`
      <html>
        <head>
          <title>${actionPastTense}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f5f5f5;">
          <div style="background: white; border-radius: 8px; padding: 40px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="font-size: 64px; color: ${successColor}; margin-bottom: 20px;">${successIcon}</div>
            <h1 style="color: ${successColor}; margin: 0 0 10px 0;">Submission ${actionPastTense}</h1>
            <p style="color: #666; font-size: 16px; margin: 0 0 20px 0;">
              Confirmation #${confirmationNumber}
            </p>
            <p style="color: #999; font-size: 14px; margin: 20px 0 0 0;">
              This action has been recorded. You may close this window.
            </p>
          </div>
        </body>
      </html>
    `);
    
    logger.info('Quick action completed', { 
      submissionId: id, 
      action, 
      timestamp: new Date() 
    });
    
  } catch (error) {
    logger.error('Error processing quick action:', error);
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #ff4d4f;">Error</h1>
          <p>An error occurred while processing your request.</p>
          <p style="color: #999; font-size: 14px;">Please try again or contact support.</p>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/form-submissions/:id/view/:token
 * View submission with secure token (read-only, for customers)
 * PUBLIC ENDPOINT - Authenticated via token
 */
router.get('/:id/view/:token', async (req, res) => {
  const { id, token } = req.params;
  
  try {
    // Verify token
    const tokenResult = await pool.query(
      `SELECT * FROM form_quick_action_tokens 
       WHERE form_submission_id = $1 AND token = $2 AND action = 'view'`,
      [id, token]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(404).send(`
        <html>
          <head>
            <title>Invalid Link</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f5f5f5;">
            <div style="background: white; border-radius: 8px; padding: 40px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #ff4d4f;">Invalid Link</h1>
              <p style="color: #666;">This submission link is invalid or does not exist.</p>
            </div>
          </body>
        </html>
      `);
    }
    
    const tokenData = tokenResult.rows[0];
    
    // Check if expired
    if (new Date() > new Date(tokenData.expires_at)) {
      return res.status(400).send(`
        <html>
          <head>
            <title>Link Expired</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f5f5f5;">
            <div style="background: white; border-radius: 8px; padding: 40px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #ff4d4f;">Link Expired</h1>
              <p style="color: #666;">This submission link expired on ${new Date(tokenData.expires_at).toLocaleString()}.</p>
              <p style="color: #999; font-size: 14px;">Please contact support if you need access to this submission.</p>
            </div>
          </body>
        </html>
      `);
    }
    
    // Get submission with form template
    const submission = await pool.query(
      `SELECT fs.*, ft.name as form_name, ft.theme_config
       FROM form_submissions fs
       JOIN form_templates ft ON fs.form_template_id = ft.id
       WHERE fs.id = $1`,
      [id]
    );
    
    if (submission.rows.length === 0) {
      return res.status(404).send(`
        <html>
          <head><title>Not Found</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #ff4d4f;">Submission Not Found</h1>
          </body>
        </html>
      `);
    }
    
    const submissionData = submission.rows[0];
    const confirmationNumber = `${submissionData.form_name?.substring(0, 3)?.toUpperCase() || 'FRM'}-${id}`;
    const data = submissionData.submission_data || {};
    
    // Get form fields for display
    const fieldsResult = await pool.query(
      `SELECT ff.field_label, ff.field_name, ff.field_type
       FROM form_fields ff
       JOIN form_steps fs ON ff.form_step_id = fs.id
       WHERE fs.form_template_id = $1
       ORDER BY fs.order_index, ff.order_index`,
      [submissionData.form_template_id]
    );
    
    const fields = fieldsResult.rows;
    
    // Build HTML for submission data
    let dataHtml = '';
    fields.forEach(field => {
      const value = data[field.field_name];
      if (value !== undefined && value !== null && value !== '') {
        let displayValue = value;
        
        // Format based on field type
        if (field.field_type === 'CHECKBOX' && Array.isArray(value)) {
          displayValue = value.join(', ');
        } else if (field.field_type === 'FILE' || field.field_type === 'IMAGE') {
          displayValue = `<a href="${value}" target="_blank" style="color: #1890ff;">View File</a>`;
        } else if (typeof value === 'boolean') {
          displayValue = value ? 'Yes' : 'No';
        }
        
        dataHtml += `
          <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
            <div style="color: #8c8c8c; font-size: 12px; margin-bottom: 4px;">${field.field_label}</div>
            <div style="color: #262626; font-size: 14px;">${displayValue}</div>
          </div>
        `;
      }
    });
    
    // Return formatted submission view
    res.send(`
      <html>
        <head>
          <title>Submission ${confirmationNumber}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 20px;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              border-radius: 8px 8px 0 0;
            }
            .header h1 {
              margin: 0 0 10px 0;
              font-size: 24px;
            }
            .header p {
              margin: 0;
              opacity: 0.9;
              font-size: 14px;
            }
            .content {
              padding: 30px;
            }
            .badge {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: 500;
              margin-bottom: 20px;
            }
            .badge-submitted {
              background: #d4f8dd;
              color: #389e0d;
            }
            .badge-approved {
              background: #d4f8dd;
              color: #389e0d;
            }
            .badge-rejected {
              background: #ffe4e4;
              color: #cf1322;
            }
            .badge-draft {
              background: #f0f0f0;
              color: #595959;
            }
            @media (max-width: 600px) {
              body {
                padding: 10px;
              }
              .header, .content {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${submissionData.form_name}</h1>
              <p>Confirmation #${confirmationNumber}</p>
              <p>Submitted on ${new Date(submissionData.submitted_at || submissionData.created_at).toLocaleString()}</p>
            </div>
            <div class="content">
              <span class="badge badge-${submissionData.status}">${submissionData.status.toUpperCase()}</span>
              ${dataHtml}
              ${dataHtml === '' ? '<p style="color: #8c8c8c; text-align: center;">No data submitted</p>' : ''}
            </div>
          </div>
        </body>
      </html>
    `);
    
    logger.info('Submission viewed via token', { 
      submissionId: id, 
      timestamp: new Date() 
    });
    
  } catch (error) {
    logger.error('Error viewing submission:', error);
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #ff4d4f;">Error</h1>
          <p>An error occurred while loading your submission.</p>
          <p style="color: #999; font-size: 14px;">Please try again or contact support.</p>
        </body>
      </html>
    `);
  }
});

/**
 * POST /api/form-submissions/bulk-process
 * Process multiple submissions at once
 */
router.post('/bulk-process', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { submission_ids, notes } = req.body;
    
    if (!Array.isArray(submission_ids) || submission_ids.length === 0) {
      return res.status(400).json({ error: 'submission_ids must be a non-empty array' });
    }

    const results = await Promise.all(
      submission_ids.map(id => 
        formSubmissionService.processFormSubmission(id, req.user.id, notes)
      )
    );

    res.json({ 
      success: true, 
      processed: results.filter(r => r !== null).length,
      total: submission_ids.length
    });
  } catch (error) {
    logger.error('Error bulk processing submissions:', error);
    res.status(500).json({ error: 'Failed to bulk process submissions' });
  }
});

/**
 * POST /api/form-submissions/:id/create-booking
 * Create a booking from a form submission
 */
router.post('/:id/create-booking', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const submission = await formSubmissionService.getFormSubmissionById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const submissionData = submission.submission_data || {};
    const { 
      service_id,
      booking_date,
      start_time,
      duration_hours = 1,
      instructor_id,
      notes: bookingNotes
    } = req.body;

    // Validate required fields
    if (!service_id) {
      return res.status(400).json({ error: 'service_id is required' });
    }
    if (!booking_date) {
      return res.status(400).json({ error: 'booking_date is required' });
    }

    // Map submission data to booking participant
    const firstName = submissionData.first_name || submissionData.firstName || submissionData.name?.split(' ')[0] || 'Unknown';
    const lastName = submissionData.last_name || submissionData.lastName || submissionData.name?.split(' ').slice(1).join(' ') || '';
    const email = submissionData.email || null;
    const phone = submissionData.phone || submissionData.phone_number || null;

    // Find or use provided user
    let userId = submission.user_id;
    if (!userId && email) {
      const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userCheck.rows.length > 0) {
        userId = userCheck.rows[0].id;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create the booking
      const bookingResult = await client.query(`
        INSERT INTO bookings (
          service_id,
          booking_date,
          start_time,
          duration_hours,
          instructor_id,
          status,
          notes,
          source,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, 'form_submission', $7)
        RETURNING *
      `, [
        service_id,
        booking_date,
        start_time || '09:00',
        duration_hours,
        instructor_id || null,
        bookingNotes || `Created from form submission #${submission.id}`,
        req.user.id
      ]);

      const booking = bookingResult.rows[0];

      // Add participant
      await client.query(`
        INSERT INTO booking_participants (
          booking_id,
          user_id,
          first_name,
          last_name,
          email,
          phone,
          experience_level,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        booking.id,
        userId,
        firstName,
        lastName,
        email,
        phone,
        submissionData.experience_level || submissionData.skill_level || 'beginner',
        req.user.id
      ]);

      // Update submission with booking reference
      await client.query(`
        UPDATE form_submissions 
        SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{booking_id}', $1::jsonb),
            status = 'processed',
            processed_at = NOW(),
            processed_by = $2
        WHERE id = $3
      `, [JSON.stringify(booking.id), req.user.id, submission.id]);

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        booking_id: booking.id,
        message: 'Booking created successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error creating booking from submission:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

/**
 * POST /api/form-submissions/:id/create-account
 * Create a user account from a form submission
 */
router.post('/:id/create-account', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const submission = await formSubmissionService.getFormSubmissionById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const submissionData = submission.submission_data || {};
    const { role = 'student', send_welcome_email = true } = req.body;

    // Extract user data from submission
    const email = submissionData.email;
    if (!email) {
      return res.status(400).json({ error: 'Email is required in submission data' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        error: 'User with this email already exists',
        user_id: existingUser.rows[0].id
      });
    }

    const firstName = submissionData.first_name || submissionData.firstName || submissionData.name?.split(' ')[0] || 'User';
    const lastName = submissionData.last_name || submissionData.lastName || submissionData.name?.split(' ').slice(1).join(' ') || '';
    const phone = submissionData.phone || submissionData.phone_number || null;

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create user
      const userId = uuidv4();
      const userResult = await client.query(`
        INSERT INTO users (
          id,
          email,
          password,
          first_name,
          last_name,
          phone,
          role,
          is_email_verified,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())
        RETURNING id, email, first_name, last_name, role
      `, [
        userId,
        email,
        hashedPassword,
        firstName,
        lastName,
        phone,
        role
      ]);

      const newUser = userResult.rows[0];

      // Update submission with user reference
      await client.query(`
        UPDATE form_submissions 
        SET user_id = $1,
            metadata = jsonb_set(COALESCE(metadata, '{}'), '{account_created}', 'true'::jsonb)
        WHERE id = $2
      `, [userId, submission.id]);

      await client.query('COMMIT');

      // Send welcome email with temp password
      if (send_welcome_email) {
        try {
          const { sendEmail } = await import('../services/emailService.js');
          await sendEmail({
            to: email,
            subject: 'Your Account Has Been Created',
            html: `
              <h2>Welcome!</h2>
              <p>An account has been created for you.</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> ${tempPassword}</p>
              <p>Please log in and change your password as soon as possible.</p>
            `,
            text: `Welcome! An account has been created for you.\n\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nPlease log in and change your password as soon as possible.`
          });
        } catch (emailError) {
          logger.warn('Failed to send welcome email:', emailError.message);
        }
      }

      res.status(201).json({
        success: true,
        user_id: newUser.id,
        email: newUser.email,
        temporary_password: send_welcome_email ? undefined : tempPassword,
        message: 'User account created successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error creating account from submission:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

export default router;