import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import * as formTemplateService from '../services/formTemplateService.js';
import * as formSubmissionService from '../services/formSubmissionService.js';
import * as formEmailNotificationService from '../services/formEmailNotificationService.js';

const router = express.Router();

// ============================================
// FORM TEMPLATES ROUTES
// ============================================

/**
 * GET /api/form-templates
 * Get all form templates with pagination
 */
router.get('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { category, is_active, search, page = 1, limit = 20 } = req.query;
    const filters = {
      category,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      search
    };
    
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    
    const result = await formTemplateService.getFormTemplates(filters, req.user.id, pageNum, limitNum);
    
    // Set pagination headers
    res.set('X-Total-Count', result.total);
    res.set('X-Page', result.page);
    res.set('X-Limit', result.limit);
    res.set('X-Total-Pages', result.totalPages);
    
    res.json(result.data);
  } catch (error) {
    logger.error('Error fetching form templates:', error);
    res.status(500).json({ error: 'Failed to fetch form templates' });
  }
});

/**
 * GET /api/form-templates/:id
 * Get a specific form template with all steps and fields
 */
router.get('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const template = await formTemplateService.getFormTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Form template not found' });
    }
    res.json(template);
  } catch (error) {
    logger.error('Error fetching form template:', error);
    res.status(500).json({ error: 'Failed to fetch form template' });
  }
});

/**
 * POST /api/form-templates
 * Create a new form template
 */
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { name, description, category, is_active, is_default, theme_config, settings } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const validCategories = ['service', 'registration', 'survey', 'contact'];
    if (category && !validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const template = await formTemplateService.createFormTemplate(req.body, req.user.id);
    res.status(201).json(template);
  } catch (error) {
    logger.error('Error creating form template:', error);
    res.status(500).json({ error: 'Failed to create form template' });
  }
});

/**
 * PATCH /api/form-templates/:id
 * Update a form template
 */
router.patch('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const template = await formTemplateService.updateFormTemplate(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ error: 'Form template not found' });
    }
    res.json(template);
  } catch (error) {
    logger.error('Error updating form template:', error);
    res.status(500).json({ error: 'Failed to update form template' });
  }
});

/**
 * DELETE /api/form-templates/:id
 * Soft delete a form template
 */
router.delete('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const success = await formTemplateService.deleteFormTemplate(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Form template not found' });
    }
    res.json({ success: true, message: 'Form template deleted' });
  } catch (error) {
    if (error.message.includes('in use')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error deleting form template:', error);
    res.status(500).json({ error: 'Failed to delete form template' });
  }
});

/**
 * POST /api/form-templates/:id/duplicate
 * Duplicate a form template
 */
router.post('/:id/duplicate', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { name } = req.body;
    const template = await formTemplateService.duplicateFormTemplate(req.params.id, name, req.user.id);
    res.status(201).json(template);
  } catch (error) {
    if (error.message === 'Form template not found') {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Error duplicating form template:', error);
    res.status(500).json({ error: 'Failed to duplicate form template' });
  }
});

/**
 * GET /api/form-templates/:id/stats
 * Get submission statistics for a form template
 */
router.get('/:id/stats', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const stats = await formSubmissionService.getFormSubmissionStats(req.params.id, { start_date, end_date });
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching form stats:', error);
    res.status(500).json({ error: 'Failed to fetch form statistics' });
  }
});

/**
 * GET /api/form-templates/:id/export
 * Export form template to JSON
 */
router.get('/:id/export', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const template = await formTemplateService.getFormTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Form template not found' });
    }
    
    // Prepare export data (remove IDs and timestamps for portability)
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      template: {
        name: template.name,
        description: template.description,
        category: template.category,
        theme_config: template.theme_config,
        settings: template.settings,
        steps: (template.steps || []).map(step => ({
          title: step.title,
          description: step.description,
          order_index: step.order_index,
          show_progress: step.show_progress,
          completion_message: step.completion_message,
          skip_logic: step.skip_logic,
          fields: (step.fields || []).map(field => ({
            field_type: field.field_type,
            field_name: field.field_name,
            field_label: field.field_label,
            placeholder_text: field.placeholder_text,
            help_text: field.help_text,
            default_value: field.default_value,
            is_required: field.is_required,
            is_readonly: field.is_readonly,
            order_index: field.order_index,
            width: field.width,
            validation_rules: field.validation_rules,
            options: field.options,
            conditional_logic: field.conditional_logic,
            integration_mapping: field.integration_mapping
          }))
        }))
      }
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="form_template_${template.id}.json"`);
    res.json(exportData);
  } catch (error) {
    logger.error('Error exporting form template:', error);
    res.status(500).json({ error: 'Failed to export form template' });
  }
});

/**
 * POST /api/form-templates/import
 * Import form template from JSON
 */
router.post('/import', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { template: importData, name: overrideName } = req.body;
    
    if (!importData) {
      return res.status(400).json({ error: 'No template data provided' });
    }
    
    // Validate import data structure
    if (!importData.name && !overrideName) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    // Create the template
    const templateData = {
      name: overrideName || `${importData.name} (Imported)`,
      description: importData.description,
      category: importData.category || 'registration',
      is_active: false, // Import as inactive by default
      theme_config: importData.theme_config,
      settings: importData.settings
    };
    
    const newTemplate = await formTemplateService.createFormTemplate(templateData, req.user.id);
    
    // Create steps and fields
    if (importData.steps && Array.isArray(importData.steps)) {
      for (const stepData of importData.steps) {
        const step = await formTemplateService.createFormStep(newTemplate.id, {
          title: stepData.title,
          description: stepData.description,
          order_index: stepData.order_index,
          show_progress: stepData.show_progress !== false,
          completion_message: stepData.completion_message,
          skip_logic: stepData.skip_logic
        });
        
        // Create fields for this step
        if (stepData.fields && Array.isArray(stepData.fields)) {
          for (const fieldData of stepData.fields) {
            await formTemplateService.createFormField(step.id, {
              field_type: fieldData.field_type,
              field_name: fieldData.field_name,
              field_label: fieldData.field_label,
              placeholder_text: fieldData.placeholder_text,
              help_text: fieldData.help_text,
              default_value: fieldData.default_value,
              is_required: fieldData.is_required || false,
              is_readonly: fieldData.is_readonly || false,
              order_index: fieldData.order_index,
              width: fieldData.width || 'full',
              validation_rules: fieldData.validation_rules,
              options: fieldData.options,
              conditional_logic: fieldData.conditional_logic,
              integration_mapping: fieldData.integration_mapping
            });
          }
        }
      }
    }
    
    // Return the complete imported template
    const completeTemplate = await formTemplateService.getFormTemplateById(newTemplate.id);
    res.status(201).json(completeTemplate);
  } catch (error) {
    logger.error('Error importing form template:', error);
    res.status(500).json({ error: 'Failed to import form template' });
  }
});

/**
 * GET /api/form-templates/:id/submissions/export
 * Export submissions for a form template
 */
router.get('/:id/submissions/export', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { format = 'csv', status, start_date, end_date } = req.query;
    
    // Get all submissions for this template
    const submissions = await formSubmissionService.getFormSubmissions({
      form_template_id: req.params.id,
      status,
      start_date,
      end_date,
      limit: 10000 // High limit for export
    });
    
    if (!submissions.submissions || submissions.submissions.length === 0) {
      return res.status(404).json({ error: 'No submissions to export' });
    }
    
    // Get all unique field names
    const allFields = new Set();
    submissions.submissions.forEach(sub => {
      Object.keys(sub.submission_data || {}).forEach(key => allFields.add(key));
    });
    const fieldNames = ['id', 'created_at', 'status', ...Array.from(allFields)];
    
    if (format === 'csv') {
      // Build CSV
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      let csv = fieldNames.join(',') + '\n';
      submissions.submissions.forEach(sub => {
        const row = fieldNames.map(field => {
          if (field === 'id') return sub.id;
          if (field === 'created_at') return sub.created_at;
          if (field === 'status') return sub.status;
          return escapeCSV(sub.submission_data?.[field]);
        });
        csv += row.join(',') + '\n';
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="submissions_${req.params.id}.csv"`);
      return res.send(csv);
    }
    
    // For xlsx, return JSON that frontend can convert
    res.json({
      headers: fieldNames,
      rows: submissions.submissions.map(sub => {
        const row = {};
        fieldNames.forEach(field => {
          if (field === 'id') row[field] = sub.id;
          else if (field === 'created_at') row[field] = sub.created_at;
          else if (field === 'status') row[field] = sub.status;
          else row[field] = sub.submission_data?.[field];
        });
        return row;
      })
    });
  } catch (error) {
    logger.error('Error exporting submissions:', error);
    res.status(500).json({ error: 'Failed to export submissions' });
  }
});

// ============================================
// FORM STEPS ROUTES
// ============================================

/**
 * GET /api/form-templates/:id/steps
 * Get all steps for a form template
 */
router.get('/:id/steps', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const steps = await formTemplateService.getFormSteps(req.params.id);
    res.json(steps);
  } catch (error) {
    logger.error('Error fetching form steps:', error);
    res.status(500).json({ error: 'Failed to fetch form steps' });
  }
});

/**
 * POST /api/form-templates/:id/steps
 * Create a new step in a form template
 */
router.post('/:id/steps', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { title, description, order_index, show_progress, completion_message, skip_logic } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Step title is required' });
    }

    const step = await formTemplateService.createFormStep(req.params.id, req.body);
    res.status(201).json(step);
  } catch (error) {
    logger.error('Error creating form step:', error);
    res.status(500).json({ error: 'Failed to create form step' });
  }
});

/**
 * POST /api/form-templates/:id/steps/reorder
 * Reorder steps in a form template
 */
router.post('/:id/steps/reorder', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { step_ids } = req.body;
    
    if (!Array.isArray(step_ids)) {
      return res.status(400).json({ error: 'step_ids must be an array' });
    }

    await formTemplateService.reorderFormSteps(req.params.id, step_ids);
    res.json({ success: true, message: 'Steps reordered' });
  } catch (error) {
    logger.error('Error reordering form steps:', error);
    res.status(500).json({ error: 'Failed to reorder form steps' });
  }
});

// ============================================
// FORM STEP ROUTES (by step ID)
// ============================================

/**
 * GET /api/form-steps/:stepId
 * Get a specific step with its fields
 */
router.get('/steps/:stepId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const step = await formTemplateService.getFormStepById(req.params.stepId);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }
    res.json(step);
  } catch (error) {
    logger.error('Error fetching form step:', error);
    res.status(500).json({ error: 'Failed to fetch form step' });
  }
});

/**
 * PATCH /api/form-steps/:stepId
 * Update a step
 */
router.patch('/steps/:stepId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const step = await formTemplateService.updateFormStep(req.params.stepId, req.body);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }
    res.json(step);
  } catch (error) {
    logger.error('Error updating form step:', error);
    res.status(500).json({ error: 'Failed to update form step' });
  }
});

/**
 * DELETE /api/form-steps/:stepId
 * Delete a step and all its fields
 */
router.delete('/steps/:stepId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const success = await formTemplateService.deleteFormStep(req.params.stepId);
    if (!success) {
      return res.status(404).json({ error: 'Step not found' });
    }
    res.json({ success: true, message: 'Step deleted' });
  } catch (error) {
    logger.error('Error deleting form step:', error);
    res.status(500).json({ error: 'Failed to delete form step' });
  }
});

// ============================================
// FORM FIELDS ROUTES
// ============================================

/**
 * GET /api/form-steps/:stepId/fields
 * Get all fields for a step
 */
router.get('/steps/:stepId/fields', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const fields = await formTemplateService.getFormFields(req.params.stepId);
    res.json(fields);
  } catch (error) {
    logger.error('Error fetching form fields:', error);
    res.status(500).json({ error: 'Failed to fetch form fields' });
  }
});

/**
 * POST /api/form-steps/:stepId/fields
 * Create a new field in a step
 */
router.post('/steps/:stepId/fields', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { field_type, field_name, field_label } = req.body;
    
    if (!field_type || !field_label) {
      return res.status(400).json({ error: 'Field type and label are required' });
    }

    // Auto-generate field_name if not provided
    let finalFieldName = field_name;
    if (!finalFieldName) {
      finalFieldName = await formTemplateService.generateFieldName(field_label, req.params.stepId);
    }

    const fieldData = { ...req.body, field_name: finalFieldName };
    const field = await formTemplateService.createFormField(req.params.stepId, fieldData);
    res.status(201).json(field);
  } catch (error) {
    if (error.message.includes('form_fields_type_check')) {
      return res.status(400).json({ error: 'Invalid field type' });
    }
    logger.error('Error creating form field:', error);
    res.status(500).json({ error: 'Failed to create form field' });
  }
});

/**
 * POST /api/form-steps/:stepId/fields/reorder
 * Reorder fields in a step
 */
router.post('/steps/:stepId/fields/reorder', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { field_ids } = req.body;
    
    if (!Array.isArray(field_ids)) {
      return res.status(400).json({ error: 'field_ids must be an array' });
    }

    await formTemplateService.reorderFormFields(req.params.stepId, field_ids);
    res.json({ success: true, message: 'Fields reordered' });
  } catch (error) {
    logger.error('Error reordering form fields:', error);
    res.status(500).json({ error: 'Failed to reorder form fields' });
  }
});

/**
 * POST /api/form-fields/validate
 * Validate field configuration
 */
router.post('/fields/validate', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { field_type, field_name, field_label, validation_rules, options } = req.body;
    const errors = [];
    
    // Basic validation
    if (!field_type) {
      errors.push({ field: 'field_type', message: 'Field type is required' });
    }
    if (!field_label) {
      errors.push({ field: 'field_label', message: 'Field label is required' });
    }
    
    // Validate field type
    const validTypes = [
      'text', 'email', 'phone', 'number', 'url',
      'select', 'multiselect', 'radio', 'checkbox',
      'date', 'time', 'datetime',
      'textarea', 'file', 'signature',
      'rating', 'address', 'calculated', 'hidden',
      'section_header', 'paragraph'
    ];
    if (field_type && !validTypes.includes(field_type)) {
      errors.push({ field: 'field_type', message: `Invalid field type: ${field_type}` });
    }
    
    // Validate options for choice fields
    if (['select', 'multiselect', 'radio', 'checkbox'].includes(field_type)) {
      if (!options || !Array.isArray(options) || options.length === 0) {
        errors.push({ field: 'options', message: 'Choice fields require at least one option' });
      } else {
        options.forEach((opt, idx) => {
          if (!opt.value) {
            errors.push({ field: `options[${idx}].value`, message: 'Option value is required' });
          }
          if (!opt.label) {
            errors.push({ field: `options[${idx}].label`, message: 'Option label is required' });
          }
        });
      }
    }
    
    // Validate validation rules
    if (validation_rules) {
      if (validation_rules.min_length && validation_rules.max_length) {
        if (validation_rules.min_length > validation_rules.max_length) {
          errors.push({ field: 'validation_rules', message: 'Min length cannot exceed max length' });
        }
      }
      if (validation_rules.min_value !== undefined && validation_rules.max_value !== undefined) {
        if (validation_rules.min_value > validation_rules.max_value) {
          errors.push({ field: 'validation_rules', message: 'Min value cannot exceed max value' });
        }
      }
      if (validation_rules.pattern) {
        try {
          new RegExp(validation_rules.pattern);
        } catch {
          errors.push({ field: 'validation_rules.pattern', message: 'Invalid regex pattern' });
        }
      }
    }
    
    // Validate calculated field formula
    if (field_type === 'calculated' && options?.formula) {
      // Check for basic formula structure
      const formula = options.formula;
      const fieldPattern = /\{([^}]+)\}/g;
      const mathPattern = /^[\d\s+\-*/.(){}a-zA-Z_]+$/;
      if (!mathPattern.test(formula)) {
        errors.push({ field: 'options.formula', message: 'Invalid formula syntax' });
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ valid: false, errors });
    }
    
    res.json({ valid: true, message: 'Field configuration is valid' });
  } catch (error) {
    logger.error('Error validating field:', error);
    res.status(500).json({ error: 'Failed to validate field configuration' });
  }
});

// ============================================
// FORM FIELD ROUTES (by field ID)
// ============================================

/**
 * GET /api/form-fields/:fieldId
 * Get a specific field
 */
router.get('/fields/:fieldId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const field = await formTemplateService.getFormFieldById(req.params.fieldId);
    if (!field) {
      return res.status(404).json({ error: 'Field not found' });
    }
    res.json(field);
  } catch (error) {
    logger.error('Error fetching form field:', error);
    res.status(500).json({ error: 'Failed to fetch form field' });
  }
});

/**
 * PATCH /api/form-fields/:fieldId
 * Update a field
 */
router.patch('/fields/:fieldId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const field = await formTemplateService.updateFormField(req.params.fieldId, req.body);
    if (!field) {
      return res.status(404).json({ error: 'Field not found' });
    }
    res.json(field);
  } catch (error) {
    logger.error('Error updating form field:', error);
    res.status(500).json({ error: 'Failed to update form field' });
  }
});

/**
 * DELETE /api/form-fields/:fieldId
 * Delete a field
 */
router.delete('/fields/:fieldId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const success = await formTemplateService.deleteFormField(req.params.fieldId);
    if (!success) {
      return res.status(404).json({ error: 'Field not found' });
    }
    res.json({ success: true, message: 'Field deleted' });
  } catch (error) {
    logger.error('Error deleting form field:', error);
    res.status(500).json({ error: 'Failed to delete form field' });
  }
});

// ============================================
// FORM VERSIONING ROUTES
// ============================================

/**
 * GET /api/form-templates/:id/versions
 * Get all versions for a form template
 */
router.get('/:id/versions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const versions = await formTemplateService.getFormTemplateVersions(req.params.id);
    res.json(versions);
  } catch (error) {
    logger.error('Error fetching form versions:', error);
    res.status(500).json({ error: 'Failed to fetch form versions' });
  }
});

/**
 * POST /api/form-templates/:id/versions
 * Create a new version snapshot of the form template
 */
router.post('/:id/versions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { version_label, change_summary } = req.body;
    const version = await formTemplateService.createFormTemplateVersion(
      req.params.id, 
      { version_label, change_summary },
      req.user.id
    );
    res.status(201).json(version);
  } catch (error) {
    if (error.message === 'Form template not found') {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Error creating form version:', error);
    res.status(500).json({ error: 'Failed to create form version' });
  }
});

/**
 * GET /api/form-templates/:id/versions/:versionId
 * Get a specific version
 */
router.get('/:id/versions/:versionId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const version = await formTemplateService.getFormTemplateVersion(req.params.id, req.params.versionId);
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }
    res.json(version);
  } catch (error) {
    logger.error('Error fetching form version:', error);
    res.status(500).json({ error: 'Failed to fetch form version' });
  }
});

/**
 * POST /api/form-templates/:id/restore/:versionId
 * Restore form template to a specific version
 */
router.post('/:id/restore/:versionId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const template = await formTemplateService.restoreFormTemplateVersion(
      req.params.id, 
      req.params.versionId,
      req.user.id
    );
    if (!template) {
      return res.status(404).json({ error: 'Version not found' });
    }
    res.json(template);
  } catch (error) {
    logger.error('Error restoring form version:', error);
    res.status(500).json({ error: 'Failed to restore form version' });
  }
});

// ============================================
// FORM SUBMISSIONS ROUTES
// ============================================

/**
 * GET /api/form-templates/:id/submissions
 * Get all submissions for a form template
 */
router.get('/:id/submissions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { status, search, start_date, end_date, limit, offset } = req.query;
    
    const result = await formSubmissionService.getFormSubmissions({
      form_template_id: req.params.id,
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

// ============================================
// EMAIL NOTIFICATION ROUTES
// ============================================

/**
 * GET /api/form-templates/:id/notifications
 * Get all email notification templates for a form
 */
router.get('/:id/notifications', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const notifications = await formEmailNotificationService.getFormNotifications(req.params.id);
    
    // Get form fields for available variables
    const template = await formTemplateService.getFormTemplateById(req.params.id);
    const allFields = template?.steps?.flatMap(s => s.fields) || [];
    const availableVariables = formEmailNotificationService.getAvailableVariables(allFields);
    
    res.json({
      notifications,
      available_variables: availableVariables
    });
  } catch (error) {
    logger.error('Error fetching form notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * POST /api/form-templates/:id/notifications
 * Create a new email notification template
 */
router.post('/:id/notifications', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const notificationData = {
      ...req.body,
      form_template_id: parseInt(req.params.id),
      created_by: req.user.id
    };
    
    const notification = await formEmailNotificationService.createNotification(notificationData);
    res.status(201).json(notification);
  } catch (error) {
    logger.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

/**
 * PATCH /api/form-templates/:id/notifications/:notificationId
 * Update an email notification template
 */
router.patch('/:id/notifications/:notificationId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { notificationId } = req.params;
    const updateFields = req.body;
    
    // Build dynamic update query
    const allowedFields = [
      'notification_type', 'subject', 'body_html', 'body_text',
      'recipient_type', 'recipient_emails', 'recipient_field_name',
      'cc_emails', 'bcc_emails', 'reply_to', 'trigger_status',
      'trigger_delay_minutes', 'is_active', 'include_submission_data',
      'include_confirmation_number'
    ];
    
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    for (const field of allowedFields) {
      if (updateFields[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updateFields[field]);
        paramIndex++;
      }
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClauses.push(`updated_at = NOW()`);
    values.push(parseInt(notificationId));
    
    const pool = (await import('../db.js')).default;
    const result = await pool.query(
      `UPDATE form_email_notifications 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating notification:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

/**
 * DELETE /api/form-templates/:id/notifications/:notificationId
 * Delete an email notification template
 */
router.delete('/:id/notifications/:notificationId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const pool = (await import('../db.js')).default;
    const result = await pool.query(
      'DELETE FROM form_email_notifications WHERE id = $1 RETURNING id',
      [req.params.notificationId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ success: true, deleted_id: result.rows[0].id });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
