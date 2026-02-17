import express from 'express';
import { logger } from '../middlewares/errorHandler.js';
import * as formSubmissionService from '../services/formSubmissionService.js';
import * as formAnalyticsService from '../services/formAnalyticsService.js';
import * as formEmailNotificationService from '../services/formEmailNotificationService.js';
import { formSubmissionRateLimit } from '../middlewares/security-clean.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// ============================================
// PUBLIC FORM ROUTES (No Authentication)
// ============================================

/**
 * GET /api/public/forms/:code
 * Get a form by quick link code (for public form rendering)
 * No authentication required
 */
router.get('/:code', async (req, res) => {
  try {
    const result = await formSubmissionService.getFormByQuickLinkCode(req.params.code);
    
    if (!result) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }

    // If using default form (no custom form template)
    if (result.use_default_form) {
      return res.status(404).json({ error: 'No form template configured for this link' });
    }

    const form = result.form_template;
    const quickLink = result.quick_link;

    // Generate a session ID for this form view
    const sessionId = uuidv4();

    // Track form view event
    await formAnalyticsService.trackEvent({
      formTemplateId: form.id,
      quickLinkId: quickLink.id,
      eventType: 'form_view',
      sessionId,
      metadata: {},
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent'),
      referrer: req.get('Referer')
    }).catch(err => logger.warn('Failed to track form view:', err.message));

    // Return flattened response matching frontend expectations
    res.json({
      ...form,
      quick_link_id: quickLink.id,
      quick_link_code: quickLink.link_code,
      session_id: sessionId
    });
  } catch (error) {
    logger.error('Error fetching public form:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

/**
 * POST /api/public/forms/:code/submit
 * Submit a form (public endpoint)
 * No authentication required
 * Rate limited to prevent spam
 */
router.post('/:code/submit', formSubmissionRateLimit, async (req, res) => {
  try {
    const { session_id, submission_data, metadata } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    if (!submission_data || typeof submission_data !== 'object') {
      return res.status(400).json({ error: 'Submission data is required' });
    }

    // Get the form to find IDs
    const result = await formSubmissionService.getFormByQuickLinkCode(req.params.code);
    if (!result || !result.form_template) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }

    const { quick_link, form_template } = result;

    // Validate submission data against form template
    const validationErrors = await formSubmissionService.validateSubmission(submission_data, form_template.id);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        errors: validationErrors
      });
    }

    // Enrich metadata with request info
    const enrichedMetadata = {
      ...metadata,
      user_agent: req.get('User-Agent'),
      ip_address: req.ip || req.connection.remoteAddress,
      referrer: req.get('Referer'),
      submitted_from_url: req.get('Origin')
    };

    // Create the submission
    const submission = await formSubmissionService.createFormSubmission({
      quick_link_id: quick_link.id,
      form_template_id: form_template.id,
      session_id,
      submission_data,
      metadata: enrichedMetadata,
      user_id: null // Public submission, no user
    });

    // Track form submission event
    await formAnalyticsService.trackEvent({
      formTemplateId: form_template.id,
      quickLinkId: quick_link.id,
      eventType: 'form_submit',
      sessionId: session_id,
      metadata: { submission_id: submission.id },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent'),
      referrer: req.get('Referer')
    }).catch(err => logger.warn('Failed to track form submission:', err.message));

    // Send email notifications (non-blocking)
    Promise.all([
      formEmailNotificationService.sendSubmissionConfirmation(submission, form_template),
      formEmailNotificationService.sendAdminAlert(submission, form_template)
    ]).catch(err => logger.warn('Failed to send form submission emails:', err.message));

    res.status(201).json({
      success: true,
      submission_id: submission.id,
      message: form_template.settings?.success_message || 'Thank you for your submission!'
    });
  } catch (error) {
    logger.error('Error submitting public form:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

/**
 * GET /api/public/forms/:code/submission/:sessionId
 * Get a submission by session ID (for users to view their submission)
 * No authentication required
 */
router.get('/:code/submission/:sessionId', async (req, res) => {
  try {
    const submission = await formSubmissionService.getFormSubmissionBySessionId(req.params.sessionId);
    
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Only return limited information for public viewing
    res.json({
      id: submission.id,
      status: submission.status,
      submitted_at: submission.submitted_at,
      form_name: submission.form_template_name
    });
  } catch (error) {
    logger.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

/**
 * PATCH /api/public/forms/:code/submission/:sessionId
 * Update a draft submission (before final submit)
 * No authentication required
 */
router.patch('/:code/submission/:sessionId', async (req, res) => {
  try {
    const { submission_data, current_step } = req.body;

    const submission = await formSubmissionService.getFormSubmissionBySessionId(req.params.sessionId);
    
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Only allow updates to draft submissions
    if (submission.status !== 'draft') {
      return res.status(400).json({ error: 'Cannot update a submitted form' });
    }

    const updatedSubmission = await formSubmissionService.updateFormSubmission(
      submission.id,
      {
        submission_data,
        metadata: { 
          ...submission.metadata,
          current_step,
          last_updated: new Date().toISOString()
        }
      }
    );

    res.json({
      success: true,
      submission_id: updatedSubmission.id
    });
  } catch (error) {
    logger.error('Error updating submission:', error);
    res.status(500).json({ error: 'Failed to update submission' });
  }
});

/**
 * POST /api/public/forms/:code/save-draft
 * Save form progress as a draft
 * No authentication required
 */
router.post('/:code/save-draft', async (req, res) => {
  try {
    const { session_id, submission_data, current_step, metadata } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Get the form to find IDs
    const result = await formSubmissionService.getFormByQuickLinkCode(req.params.code);
    if (!result || !result.form_template) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }

    const { quick_link, form_template } = result;

    // Check if a draft already exists for this session
    const existingSubmission = await formSubmissionService.getFormSubmissionBySessionId(session_id);

    if (existingSubmission) {
      // Update existing draft
      const updatedSubmission = await formSubmissionService.updateFormSubmission(
        existingSubmission.id,
        {
          submission_data,
          metadata: {
            ...existingSubmission.metadata,
            ...metadata,
            current_step,
            last_updated: new Date().toISOString()
          }
        }
      );
      return res.json({
        success: true,
        submission_id: updatedSubmission.id,
        is_new: false
      });
    }

    // Create new draft
    const enrichedMetadata = {
      ...metadata,
      current_step,
      user_agent: req.get('User-Agent'),
      ip_address: req.ip || req.connection.remoteAddress,
      is_draft: true
    };

    const submission = await formSubmissionService.createFormSubmission({
      quick_link_id: quick_link.id,
      form_template_id: form_template.id,
      session_id,
      status: 'draft',
      submission_data,
      metadata: enrichedMetadata,
      user_id: null
    });

    res.status(201).json({
      success: true,
      submission_id: submission.id,
      is_new: true
    });
  } catch (error) {
    logger.error('Error saving draft:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

/**
 * POST /api/public/forms/:code/send-resume-link
 * Send email with link to resume form progress
 * No authentication required
 */
router.post('/:code/send-resume-link', async (req, res) => {
  try {
    const { session_id, email, submission_id } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!session_id && !submission_id) {
      return res.status(400).json({ error: 'Session ID or submission ID is required' });
    }

    // Get the form
    const result = await formSubmissionService.getFormByQuickLinkCode(req.params.code);
    if (!result || !result.form_template) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const { form_template } = result;

    // Get the draft submission
    let submission;
    if (submission_id) {
      submission = await formSubmissionService.getFormSubmissionById(submission_id);
    } else {
      submission = await formSubmissionService.getFormSubmissionBySessionId(session_id);
    }

    if (!submission || submission.status !== 'draft') {
      return res.status(404).json({ error: 'Draft not found or already submitted' });
    }

    // Generate resume link with session ID
    const baseUrl = process.env.FRONTEND_URL || 'https://plannivo.com';
    const resumeLink = `${baseUrl}/forms/${req.params.code}?session_id=${session_id || submission.session_id}`;

    // Send email using the email notification service
    const { sendResumeEmail } = await import('../services/formEmailNotificationService.js');
    
    await sendResumeEmail({
      to: email,
      formName: form_template.name,
      resumeLink,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    });

    res.json({ 
      success: true, 
      message: 'Resume link sent to your email'
    });
  } catch (error) {
    logger.error('Error sending resume link:', error);
    res.status(500).json({ error: 'Failed to send resume link' });
  }
});

export default router;
