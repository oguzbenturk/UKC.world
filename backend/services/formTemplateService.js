import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Get all form templates with optional filters and pagination
 * @param {Object} filters - Optional filters (category, is_active, search)
 * @param {string} userId - ID of requesting user
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} Object with data, total, page, limit, totalPages
 */
export async function getFormTemplates({ category, is_active, search } = {}, userId, page = 1, limit = 20) {
  const conditions = ['ft.deleted_at IS NULL'];
  const params = [];
  let paramCount = 1;

  if (category) {
    conditions.push(`ft.category = $${paramCount++}`);
    params.push(category);
  }

  if (is_active !== undefined) {
    conditions.push(`ft.is_active = $${paramCount++}`);
    params.push(is_active);
  }

  if (search) {
    conditions.push(`(ft.name ILIKE $${paramCount} OR ft.description ILIKE $${paramCount})`);
    params.push(`%${search}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM form_templates ft
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total, 10);

  // Calculate pagination
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);

  // Get paginated data
  const query = `
    SELECT 
      ft.*,
      u.first_name || ' ' || u.last_name as created_by_name,
      (SELECT COUNT(*) FROM form_steps fs WHERE fs.form_template_id = ft.id) as step_count,
      (SELECT COUNT(*) FROM form_fields ff 
       JOIN form_steps fs ON ff.form_step_id = fs.id 
       WHERE fs.form_template_id = ft.id) as field_count,
      (SELECT COUNT(*) FROM form_submissions fsub WHERE fsub.form_template_id = ft.id) as submission_count,
      (SELECT COUNT(*) FROM quick_links ql WHERE ql.form_template_id = ft.id) as quick_link_count
    FROM form_templates ft
    LEFT JOIN users u ON ft.created_by = u.id
    ${whereClause}
    ORDER BY ft.created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  const result = await pool.query(query, [...params, limit, offset]);

  return {
    data: result.rows,
    total,
    page,
    limit,
    totalPages
  };
}

/**
 * Get a single form template by ID with all steps and fields
 * @param {number} id - Form template ID
 * @returns {Promise<Object|null>} Form template with nested structure
 */
export async function getFormTemplateById(id) {
  // Get form template
  const templateQuery = `
    SELECT 
      ft.*,
      u.first_name || ' ' || u.last_name as created_by_name
    FROM form_templates ft
    LEFT JOIN users u ON ft.created_by = u.id
    WHERE ft.id = $1 AND ft.deleted_at IS NULL
  `;
  
  const templateResult = await pool.query(templateQuery, [id]);
  
  if (templateResult.rows.length === 0) {
    return null;
  }

  const template = templateResult.rows[0];

  // Get steps
  const stepsQuery = `
    SELECT * FROM form_steps 
    WHERE form_template_id = $1 
    ORDER BY order_index ASC
  `;
  
  const stepsResult = await pool.query(stepsQuery, [id]);
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

  return template;
}

/**
 * Create a new form template
 * @param {Object} data - Form template data
 * @param {string} userId - ID of creating user
 * @returns {Promise<Object>} Created form template
 */
export async function createFormTemplate(data, userId) {
  const {
    name,
    description,
    category = 'registration',
    is_active = true,
    is_default = false,
    theme_config = {},
    settings = {}
  } = data;

  const defaultSettings = {
    allow_save_progress: true,
    show_progress_bar: true,
    require_captcha: false,
    allow_anonymous: true,
    confirmation_message: 'Thank you for your submission!',
    redirect_url: null,
    ...settings
  };

  const query = `
    INSERT INTO form_templates (
      name, description, category, is_active, is_default,
      theme_config, settings, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const result = await pool.query(query, [
    name,
    description || null,
    category,
    is_active,
    is_default,
    JSON.stringify(theme_config),
    JSON.stringify(defaultSettings),
    userId
  ]);

  logger.info(`Form template created: ${name} (ID: ${result.rows[0].id}) by user ${userId}`);
  return result.rows[0];
}

/**
 * Update a form template
 * @param {number} id - Form template ID
 * @param {Object} data - Update data
 * @returns {Promise<Object|null>} Updated form template
 */
export async function updateFormTemplate(id, data) {
  const allowedFields = ['name', 'description', 'category', 'is_active', 'is_default', 'theme_config', 'settings'];
  
  const updates = [];
  const params = [];
  let paramCount = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'theme_config' || field === 'settings') {
        updates.push(`${field} = $${paramCount++}`);
        params.push(JSON.stringify(data[field]));
        logger.info(`Updating ${field}:`, JSON.stringify(data[field]).substring(0, 200));
      } else {
        updates.push(`${field} = $${paramCount++}`);
        params.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    return getFormTemplateById(id);
  }

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const query = `
    UPDATE form_templates 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount} AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, params);
  
  if (result.rows.length === 0) {
    return null;
  }

  logger.info(`Form template updated: ID ${id}`);
  
  // Return the full template with steps instead of just the row
  return getFormTemplateById(id);
}

/**
 * Soft delete a form template
 * @param {number} id - Form template ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteFormTemplate(id) {
  // Check if template is in use by any active quick links
  const usageCheck = await pool.query(
    'SELECT COUNT(*) FROM quick_links WHERE form_template_id = $1 AND is_active = true',
    [id]
  );

  if (parseInt(usageCheck.rows[0].count) > 0) {
    throw new Error('Cannot delete form template that is in use by active quick links');
  }

  const query = `
    UPDATE form_templates 
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id
  `;

  const result = await pool.query(query, [id]);
  
  if (result.rows.length === 0) {
    return false;
  }

  logger.info(`Form template deleted: ID ${id}`);
  return true;
}

/**
 * Duplicate a form template with all steps and fields
 * @param {number} id - Form template ID to duplicate
 * @param {string} newName - Name for the new template
 * @param {string} userId - ID of user creating the duplicate
 * @returns {Promise<Object>} New form template
 */
export async function duplicateFormTemplate(id, newName, userId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get original template
    const original = await getFormTemplateById(id);
    if (!original) {
      throw new Error('Form template not found');
    }

    // Create new template
    const newTemplateQuery = `
      INSERT INTO form_templates (
        name, description, category, is_active, is_default,
        theme_config, settings, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const newTemplate = await client.query(newTemplateQuery, [
      newName || `${original.name} (Copy)`,
      original.description,
      original.category,
      true,
      false, // Don't copy is_default
      JSON.stringify(original.theme_config || {}),
      JSON.stringify(original.settings || {}),
      userId
    ]);

    const newTemplateId = newTemplate.rows[0].id;

    // Copy steps and fields
    for (const step of original.steps || []) {
      const newStepQuery = `
        INSERT INTO form_steps (
          form_template_id, title, description, order_index,
          show_progress, completion_message, skip_logic
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;

      const newStep = await client.query(newStepQuery, [
        newTemplateId,
        step.title,
        step.description,
        step.order_index,
        step.show_progress,
        step.completion_message,
        JSON.stringify(step.skip_logic || {})
      ]);

      const newStepId = newStep.rows[0].id;

      // Copy fields
      for (const field of step.fields || []) {
        const newFieldQuery = `
          INSERT INTO form_fields (
            form_step_id, field_type, field_name, field_label,
            placeholder_text, help_text, default_value, is_required,
            is_readonly, order_index, width, validation_rules,
            options, conditional_logic, integration_mapping
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `;

        await client.query(newFieldQuery, [
          newStepId,
          field.field_type,
          field.field_name,
          field.field_label,
          field.placeholder_text,
          field.help_text,
          field.default_value,
          field.is_required,
          field.is_readonly,
          field.order_index,
          field.width,
          JSON.stringify(field.validation_rules || {}),
          JSON.stringify(field.options || []),
          JSON.stringify(field.conditional_logic || {}),
          field.integration_mapping
        ]);
      }
    }

    await client.query('COMMIT');

    logger.info(`Form template duplicated: ${id} -> ${newTemplateId} by user ${userId}`);
    return getFormTemplateById(newTemplateId);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// FORM STEPS FUNCTIONS
// ============================================

/**
 * Get all steps for a form template
 * @param {number} templateId - Form template ID
 * @returns {Promise<Array>} List of steps
 */
export async function getFormSteps(templateId) {
  const query = `
    SELECT fs.*, 
           (SELECT COUNT(*) FROM form_fields ff WHERE ff.form_step_id = fs.id) as field_count
    FROM form_steps fs
    WHERE fs.form_template_id = $1
    ORDER BY fs.order_index ASC
  `;
  
  const result = await pool.query(query, [templateId]);
  return result.rows;
}

/**
 * Get a single step by ID
 * @param {number} stepId - Step ID
 * @returns {Promise<Object|null>} Step with fields
 */
export async function getFormStepById(stepId) {
  const stepQuery = `SELECT * FROM form_steps WHERE id = $1`;
  const stepResult = await pool.query(stepQuery, [stepId]);
  
  if (stepResult.rows.length === 0) {
    return null;
  }

  const step = stepResult.rows[0];

  // Get fields
  const fieldsQuery = `
    SELECT * FROM form_fields 
    WHERE form_step_id = $1 
    ORDER BY order_index ASC
  `;
  
  const fieldsResult = await pool.query(fieldsQuery, [stepId]);
  step.fields = fieldsResult.rows;

  return step;
}

/**
 * Create a new form step
 * @param {number} templateId - Form template ID
 * @param {Object} data - Step data
 * @returns {Promise<Object>} Created step
 */
export async function createFormStep(templateId, data) {
  const {
    title,
    description,
    order_index,
    show_progress = true,
    completion_message,
    skip_logic = {}
  } = data;

  // Get next order_index if not provided
  let orderIdx = order_index;
  if (orderIdx === undefined) {
    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM form_steps WHERE form_template_id = $1',
      [templateId]
    );
    orderIdx = maxOrder.rows[0].next_order;
  }

  const query = `
    INSERT INTO form_steps (
      form_template_id, title, description, order_index,
      show_progress, completion_message, skip_logic
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await pool.query(query, [
    templateId,
    title,
    description || null,
    orderIdx,
    show_progress,
    completion_message || null,
    JSON.stringify(skip_logic)
  ]);

  // Update template updated_at
  await pool.query('UPDATE form_templates SET updated_at = NOW() WHERE id = $1', [templateId]);

  logger.info(`Form step created: ${title} in template ${templateId}`);
  return result.rows[0];
}

/**
 * Update a form step
 * @param {number} stepId - Step ID
 * @param {Object} data - Update data
 * @returns {Promise<Object|null>} Updated step
 */
export async function updateFormStep(stepId, data) {
  const allowedFields = ['title', 'description', 'order_index', 'show_progress', 'completion_message', 'skip_logic'];
  
  const updates = [];
  const params = [];
  let paramCount = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'skip_logic') {
        updates.push(`${field} = $${paramCount++}`);
        params.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramCount++}`);
        params.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    return getFormStepById(stepId);
  }

  updates.push(`updated_at = NOW()`);
  params.push(stepId);

  const query = `
    UPDATE form_steps 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  
  if (result.rows.length === 0) {
    return null;
  }

  // Update template updated_at
  await pool.query(
    'UPDATE form_templates SET updated_at = NOW() WHERE id = $1',
    [result.rows[0].form_template_id]
  );

  return result.rows[0];
}

/**
 * Delete a form step and all its fields
 * @param {number} stepId - Step ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteFormStep(stepId) {
  // Get template ID for updating
  const step = await pool.query('SELECT form_template_id FROM form_steps WHERE id = $1', [stepId]);
  
  if (step.rows.length === 0) {
    return false;
  }

  const templateId = step.rows[0].form_template_id;

  // Delete step (fields will be cascade deleted)
  const result = await pool.query('DELETE FROM form_steps WHERE id = $1 RETURNING id', [stepId]);
  
  if (result.rows.length === 0) {
    return false;
  }

  // Reorder remaining steps
  await pool.query(`
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) - 1 as new_order
      FROM form_steps
      WHERE form_template_id = $1
    )
    UPDATE form_steps SET order_index = ordered.new_order
    FROM ordered WHERE form_steps.id = ordered.id
  `, [templateId]);

  // Update template updated_at
  await pool.query('UPDATE form_templates SET updated_at = NOW() WHERE id = $1', [templateId]);

  logger.info(`Form step deleted: ID ${stepId}`);
  return true;
}

/**
 * Reorder form steps
 * @param {number} templateId - Form template ID
 * @param {Array<number>} stepIds - Ordered array of step IDs
 * @returns {Promise<boolean>} Success status
 */
export async function reorderFormSteps(templateId, stepIds) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    for (let i = 0; i < stepIds.length; i++) {
      await client.query(
        'UPDATE form_steps SET order_index = $1, updated_at = NOW() WHERE id = $2 AND form_template_id = $3',
        [i, stepIds[i], templateId]
      );
    }

    await client.query('UPDATE form_templates SET updated_at = NOW() WHERE id = $1', [templateId]);
    await client.query('COMMIT');

    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// FORM FIELDS FUNCTIONS
// ============================================

/**
 * Get all fields for a step
 * @param {number} stepId - Step ID
 * @returns {Promise<Array>} List of fields
 */
export async function getFormFields(stepId) {
  const query = `
    SELECT * FROM form_fields
    WHERE form_step_id = $1
    ORDER BY order_index ASC
  `;
  
  const result = await pool.query(query, [stepId]);
  return result.rows;
}

/**
 * Get a single field by ID
 * @param {number} fieldId - Field ID
 * @returns {Promise<Object|null>} Field
 */
export async function getFormFieldById(fieldId) {
  const query = `SELECT * FROM form_fields WHERE id = $1`;
  const result = await pool.query(query, [fieldId]);
  return result.rows[0] || null;
}

/**
 * Create a new form field
 * @param {number} stepId - Step ID
 * @param {Object} data - Field data
 * @returns {Promise<Object>} Created field
 */
export async function createFormField(stepId, data) {
  const {
    field_type,
    field_name,
    field_label,
    placeholder_text,
    help_text,
    default_value,
    is_required = false,
    is_readonly = false,
    order_index,
    width = 'full',
    validation_rules = {},
    options = [],
    conditional_logic = {},
    integration_mapping
  } = data;

  // Get next order_index if not provided
  let orderIdx = order_index;
  if (orderIdx === undefined) {
    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM form_fields WHERE form_step_id = $1',
      [stepId]
    );
    orderIdx = maxOrder.rows[0].next_order;
  }

  const query = `
    INSERT INTO form_fields (
      form_step_id, field_type, field_name, field_label,
      placeholder_text, help_text, default_value, is_required,
      is_readonly, order_index, width, validation_rules,
      options, conditional_logic, integration_mapping
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `;

  const result = await pool.query(query, [
    stepId,
    field_type,
    field_name,
    field_label,
    placeholder_text || null,
    help_text || null,
    default_value || null,
    is_required,
    is_readonly,
    orderIdx,
    width,
    JSON.stringify(validation_rules),
    JSON.stringify(options),
    JSON.stringify(conditional_logic),
    integration_mapping || null
  ]);

  // Get template ID and update updated_at
  const step = await pool.query('SELECT form_template_id FROM form_steps WHERE id = $1', [stepId]);
  if (step.rows.length > 0) {
    await pool.query('UPDATE form_templates SET updated_at = NOW() WHERE id = $1', [step.rows[0].form_template_id]);
  }

  logger.info(`Form field created: ${field_name} (${field_type}) in step ${stepId}`);
  return result.rows[0];
}

/**
 * Update a form field
 * @param {number} fieldId - Field ID
 * @param {Object} data - Update data
 * @returns {Promise<Object|null>} Updated field
 */
export async function updateFormField(fieldId, data) {
  const allowedFields = [
    'field_type', 'field_name', 'field_label', 'placeholder_text',
    'help_text', 'default_value', 'is_required', 'is_readonly',
    'order_index', 'width', 'validation_rules', 'options',
    'conditional_logic', 'integration_mapping'
  ];
  
  const jsonFields = ['validation_rules', 'options', 'conditional_logic'];
  const updates = [];
  const params = [];
  let paramCount = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (jsonFields.includes(field)) {
        updates.push(`${field} = $${paramCount++}`);
        params.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramCount++}`);
        params.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    return getFormFieldById(fieldId);
  }

  updates.push(`updated_at = NOW()`);
  params.push(fieldId);

  const query = `
    UPDATE form_fields 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  
  if (result.rows.length === 0) {
    return null;
  }

  // Update template updated_at
  const step = await pool.query('SELECT form_template_id FROM form_steps WHERE id = $1', [result.rows[0].form_step_id]);
  if (step.rows.length > 0) {
    await pool.query('UPDATE form_templates SET updated_at = NOW() WHERE id = $1', [step.rows[0].form_template_id]);
  }

  return result.rows[0];
}

/**
 * Delete a form field
 * @param {number} fieldId - Field ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteFormField(fieldId) {
  // Get step and template info for updating
  const field = await pool.query(`
    SELECT ff.form_step_id, fs.form_template_id 
    FROM form_fields ff
    JOIN form_steps fs ON ff.form_step_id = fs.id
    WHERE ff.id = $1
  `, [fieldId]);
  
  if (field.rows.length === 0) {
    return false;
  }

  const { form_step_id, form_template_id } = field.rows[0];

  // Delete field
  const result = await pool.query('DELETE FROM form_fields WHERE id = $1 RETURNING id', [fieldId]);
  
  if (result.rows.length === 0) {
    return false;
  }

  // Reorder remaining fields
  await pool.query(`
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) - 1 as new_order
      FROM form_fields
      WHERE form_step_id = $1
    )
    UPDATE form_fields SET order_index = ordered.new_order
    FROM ordered WHERE form_fields.id = ordered.id
  `, [form_step_id]);

  // Update template updated_at
  await pool.query('UPDATE form_templates SET updated_at = NOW() WHERE id = $1', [form_template_id]);

  logger.info(`Form field deleted: ID ${fieldId}`);
  return true;
}

/**
 * Reorder form fields within a step
 * @param {number} stepId - Step ID
 * @param {Array<number>} fieldIds - Ordered array of field IDs
 * @returns {Promise<boolean>} Success status
 */
export async function reorderFormFields(stepId, fieldIds) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    for (let i = 0; i < fieldIds.length; i++) {
      await client.query(
        'UPDATE form_fields SET order_index = $1, updated_at = NOW() WHERE id = $2 AND form_step_id = $3',
        [i, fieldIds[i], stepId]
      );
    }

    // Update template updated_at
    const step = await client.query('SELECT form_template_id FROM form_steps WHERE id = $1', [stepId]);
    if (step.rows.length > 0) {
      await client.query('UPDATE form_templates SET updated_at = NOW() WHERE id = $1', [step.rows[0].form_template_id]);
    }

    await client.query('COMMIT');

    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate a unique field_name from label
 * @param {string} label - Field label
 * @param {number} stepId - Step ID
 * @returns {Promise<string>} Unique field name
 */
export async function generateFieldName(label, stepId) {
  // Convert label to snake_case
  let baseName = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);

  if (!baseName) {
    baseName = 'field';
  }

  // Check for uniqueness and add suffix if needed
  let fieldName = baseName;
  let counter = 1;

  while (true) {
    const existing = await pool.query(
      `SELECT ff.id FROM form_fields ff
       JOIN form_steps fs ON ff.form_step_id = fs.id
       WHERE ff.field_name = $1 AND fs.form_template_id = (
         SELECT form_template_id FROM form_steps WHERE id = $2
       )`,
      [fieldName, stepId]
    );

    if (existing.rows.length === 0) {
      break;
    }

    fieldName = `${baseName}_${counter++}`;
  }

  return fieldName;
}

// ============================================
// VERSION CONTROL FUNCTIONS
// ============================================

/**
 * Get all versions for a form template
 * @param {number} templateId - Form template ID
 * @returns {Promise<Array>} List of versions
 */
export async function getFormTemplateVersions(templateId) {
  const query = `
    SELECT 
      v.id,
      v.form_template_id,
      v.version_number,
      v.version_label,
      v.change_summary,
      v.created_at,
      u.first_name || ' ' || u.last_name as created_by_name
    FROM form_template_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.form_template_id = $1
    ORDER BY v.version_number DESC
  `;
  
  const result = await pool.query(query, [templateId]);
  return result.rows;
}

/**
 * Create a new version snapshot of a form template
 * @param {number} templateId - Form template ID
 * @param {Object} options - Version options (version_label, change_summary)
 * @param {string} userId - Creating user ID
 * @returns {Promise<Object>} Created version
 */
export async function createFormTemplateVersion(templateId, { version_label, change_summary }, userId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get current form template with all data
    const template = await getFormTemplateById(templateId);
    if (!template) {
      throw new Error('Form template not found');
    }
    
    // Get the next version number
    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM form_template_versions WHERE form_template_id = $1',
      [templateId]
    );
    const nextVersion = versionResult.rows[0].next_version;
    
    // Create snapshot data
    const snapshotData = {
      name: template.name,
      description: template.description,
      category: template.category,
      is_active: template.is_active,
      theme_config: template.theme_config,
      settings: template.settings,
      steps: template.steps.map(step => ({
        title: step.title,
        description: step.description,
        order_index: step.order_index,
        show_progress: step.show_progress,
        completion_message: step.completion_message,
        skip_logic: step.skip_logic,
        fields: step.fields.map(field => ({
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
    };
    
    // Insert version
    const insertQuery = `
      INSERT INTO form_template_versions 
        (form_template_id, version_number, version_label, snapshot_data, change_summary, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const versionInsert = await client.query(insertQuery, [
      templateId,
      nextVersion,
      version_label || `Version ${nextVersion}`,
      JSON.stringify(snapshotData),
      change_summary || null,
      userId
    ]);
    
    // Update template's current version
    await client.query(
      'UPDATE form_templates SET current_version = $1, updated_at = NOW() WHERE id = $2',
      [nextVersion, templateId]
    );
    
    await client.query('COMMIT');
    
    return versionInsert.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating form version:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a specific version
 * @param {number} templateId - Form template ID
 * @param {number} versionId - Version ID
 * @returns {Promise<Object|null>} Version with snapshot data
 */
export async function getFormTemplateVersion(templateId, versionId) {
  const query = `
    SELECT 
      v.*,
      u.first_name || ' ' || u.last_name as created_by_name
    FROM form_template_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.id = $1 AND v.form_template_id = $2
  `;
  
  const result = await pool.query(query, [versionId, templateId]);
  return result.rows[0] || null;
}

/**
 * Restore a form template to a specific version
 * @param {number} templateId - Form template ID
 * @param {number} versionId - Version ID to restore
 * @param {string} userId - Restoring user ID
 * @returns {Promise<Object>} Restored template
 */
export async function restoreFormTemplateVersion(templateId, versionId, userId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get the version to restore
    const version = await getFormTemplateVersion(templateId, versionId);
    if (!version) {
      return null;
    }
    
    const snapshot = version.snapshot_data;
    
    // First, create a backup version of current state
    await createFormTemplateVersion(templateId, {
      version_label: 'Auto-backup before restore',
      change_summary: `Backup before restoring to version ${version.version_number}`
    }, userId);
    
    // Delete existing steps and fields (cascade will handle fields)
    await client.query('DELETE FROM form_steps WHERE form_template_id = $1', [templateId]);
    
    // Update template properties
    await client.query(`
      UPDATE form_templates SET
        name = $2,
        description = $3,
        category = $4,
        is_active = $5,
        theme_config = $6,
        settings = $7,
        updated_at = NOW()
      WHERE id = $1
    `, [
      templateId,
      snapshot.name,
      snapshot.description,
      snapshot.category,
      snapshot.is_active,
      JSON.stringify(snapshot.theme_config || {}),
      JSON.stringify(snapshot.settings || {})
    ]);
    
    // Recreate steps and fields
    for (const step of snapshot.steps || []) {
      const stepInsert = await client.query(`
        INSERT INTO form_steps 
          (form_template_id, title, description, order_index, show_progress, completion_message, skip_logic)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        templateId,
        step.title,
        step.description,
        step.order_index,
        step.show_progress,
        step.completion_message,
        JSON.stringify(step.skip_logic || {})
      ]);
      
      const newStepId = stepInsert.rows[0].id;
      
      // Recreate fields for this step
      for (const field of step.fields || []) {
        await client.query(`
          INSERT INTO form_fields 
            (form_step_id, field_type, field_name, field_label, placeholder_text, help_text, 
             default_value, is_required, is_readonly, order_index, width, 
             validation_rules, options, conditional_logic, integration_mapping)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          newStepId,
          field.field_type,
          field.field_name,
          field.field_label,
          field.placeholder_text,
          field.help_text,
          field.default_value,
          field.is_required,
          field.is_readonly,
          field.order_index,
          field.width,
          JSON.stringify(field.validation_rules || {}),
          JSON.stringify(field.options || {}),
          JSON.stringify(field.conditional_logic || {}),
          field.integration_mapping
        ]);
      }
    }
    
    await client.query('COMMIT');
    
    // Return the restored template
    return await getFormTemplateById(templateId);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error restoring form version:', error);
    throw error;
  } finally {
    client.release();
  }
}

