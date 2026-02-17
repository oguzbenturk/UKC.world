/**
 * Form Builder API Service
 * Handles all API calls for form templates, steps, fields, and submissions
 */

import apiClient from '@/shared/services/apiClient';

// ============================================
// FORM TEMPLATES
// ============================================

/**
 * Get all form templates with pagination
 * @param {Object} filters - { category, is_active, search, page, limit }
 * @returns {Promise<Object>} { data, total, page, limit, totalPages }
 */
export const getFormTemplates = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.is_active !== undefined) params.append('is_active', filters.is_active);
  if (filters.search) params.append('search', filters.search);
  if (filters.page) params.append('page', filters.page);
  if (filters.limit) params.append('limit', filters.limit);
  
  const queryString = params.toString();
  const url = queryString ? `/form-templates?${queryString}` : '/form-templates';
  
  const response = await apiClient.get(url);
  
  // Extract pagination metadata from headers
  const total = parseInt(response.headers['x-total-count'], 10) || 0;
  const page = parseInt(response.headers['x-page'], 10) || 1;
  const limit = parseInt(response.headers['x-limit'], 10) || 20;
  const totalPages = parseInt(response.headers['x-total-pages'], 10) || 1;
  
  return {
    data: response.data,
    total,
    page,
    limit,
    totalPages
  };
};

/**
 * Get a single form template with all steps and fields
 * @param {number} id - Template ID
 */
export const getFormTemplate = async (id) => {
  const response = await apiClient.get(`/form-templates/${id}`);
  return response.data;
};

/**
 * Create a new form template
 * @param {Object} data - { name, description, category, is_active, theme_config, settings }
 */
export const createFormTemplate = async (data) => {
  const response = await apiClient.post('/form-templates', data);
  return response.data;
};

/**
 * Update a form template
 * @param {number} id - Template ID
 * @param {Object} data - Fields to update
 */
export const updateFormTemplate = async (id, data) => {
  const response = await apiClient.patch(`/form-templates/${id}`, data);
  return response.data;
};

/**
 * Delete a form template (soft delete)
 * @param {number} id - Template ID
 */
export const deleteFormTemplate = async (id) => {
  const response = await apiClient.delete(`/form-templates/${id}`);
  return response.data;
};

/**
 * Duplicate a form template
 * @param {number} id - Template ID to duplicate
 * @param {string} name - Name for the new template
 */
export const duplicateFormTemplate = async (id, name) => {
  const response = await apiClient.post(`/form-templates/${id}/duplicate`, { name });
  return response.data;
};

/**
 * Get form template statistics
 * @param {number} id - Template ID
 */
export const getFormTemplateStats = async (id) => {
  const response = await apiClient.get(`/form-templates/${id}/stats`);
  return response.data;
};

// ============================================
// FORM STEPS
// ============================================

/**
 * Get all steps for a form template
 * @param {number} templateId - Template ID
 */
export const getFormSteps = async (templateId) => {
  const response = await apiClient.get(`/form-templates/${templateId}/steps`);
  return response.data;
};

/**
 * Create a new step in a form template
 * @param {number} templateId - Template ID
 * @param {Object} data - { title, description, order_index, show_progress, completion_message, skip_logic }
 */
export const createFormStep = async (templateId, data) => {
  const response = await apiClient.post(`/form-templates/${templateId}/steps`, data);
  return response.data;
};

/**
 * Update a step
 * @param {number} stepId - Step ID
 * @param {Object} data - Fields to update
 */
export const updateFormStep = async (stepId, data) => {
  const response = await apiClient.patch(`/form-templates/steps/${stepId}`, data);
  return response.data;
};

/**
 * Delete a step
 * @param {number} stepId - Step ID
 */
export const deleteFormStep = async (stepId) => {
  const response = await apiClient.delete(`/form-templates/steps/${stepId}`);
  return response.data;
};

/**
 * Reorder steps in a form template
 * @param {number} templateId - Template ID
 * @param {number[]} stepIds - Ordered array of step IDs
 */
export const reorderFormSteps = async (templateId, stepIds) => {
  const response = await apiClient.post(`/form-templates/${templateId}/steps/reorder`, { step_ids: stepIds });
  return response.data;
};

// ============================================
// FORM FIELDS
// ============================================

/**
 * Get all fields for a step
 * @param {number} stepId - Step ID
 */
export const getFormFields = async (stepId) => {
  const response = await apiClient.get(`/form-templates/steps/${stepId}/fields`);
  return response.data;
};

/**
 * Create a new field in a step
 * @param {number} stepId - Step ID
 * @param {Object} data - Field data
 */
export const createFormField = async (stepId, data) => {
  const response = await apiClient.post(`/form-templates/steps/${stepId}/fields`, data);
  return response.data;
};

/**
 * Update a field
 * @param {number} fieldId - Field ID
 * @param {Object} data - Fields to update
 */
export const updateFormField = async (fieldId, data) => {
  const response = await apiClient.patch(`/form-templates/fields/${fieldId}`, data);
  return response.data;
};

/**
 * Delete a field
 * @param {number} fieldId - Field ID
 */
export const deleteFormField = async (fieldId) => {
  const response = await apiClient.delete(`/form-templates/fields/${fieldId}`);
  return response.data;
};

/**
 * Reorder fields in a step
 * @param {number} stepId - Step ID
 * @param {number[]} fieldIds - Ordered array of field IDs
 */
export const reorderFormFields = async (stepId, fieldIds) => {
  const response = await apiClient.post(`/form-templates/steps/${stepId}/fields/reorder`, { field_ids: fieldIds });
  return response.data;
};

// ============================================
// FORM SUBMISSIONS
// ============================================

/**
 * Get all submissions with filters
 * @param {Object} filters - { form_template_id, status, search, start_date, end_date, limit, offset }
 */
export const getFormSubmissions = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });
  
  const queryString = params.toString();
  const url = queryString ? `/form-submissions?${queryString}` : '/form-submissions';
  
  const response = await apiClient.get(url);
  return response.data;
};

/**
 * Get a single submission
 * @param {number} id - Submission ID
 */
export const getFormSubmission = async (id) => {
  const response = await apiClient.get(`/form-submissions/${id}`);
  return response.data;
};

/**
 * Update a submission (notes, status)
 * @param {number} id - Submission ID
 * @param {Object} data - { notes, status }
 */
export const updateFormSubmission = async (id, data) => {
  const response = await apiClient.patch(`/form-submissions/${id}`, data);
  return response.data;
};

/**
 * Process a submission
 * @param {number} id - Submission ID
 * @param {string} notes - Processing notes
 */
export const processFormSubmission = async (id, notes = '') => {
  const response = await apiClient.patch(`/form-submissions/${id}/process`, { notes });
  return response.data;
};

/**
 * Archive a submission
 * @param {number} id - Submission ID
 */
export const archiveFormSubmission = async (id) => {
  const response = await apiClient.patch(`/form-submissions/${id}/archive`);
  return response.data;
};

/**
 * Delete a submission
 * @param {number} id - Submission ID
 */
export const deleteFormSubmission = async (id) => {
  const response = await apiClient.delete(`/form-submissions/${id}`);
  return response.data;
};

/**
 * Bulk process submissions
 * @param {number[]} submissionIds - Array of submission IDs
 * @param {string} notes - Processing notes
 */
export const bulkProcessSubmissions = async (submissionIds, notes = '') => {
  const response = await apiClient.post('/form-submissions/bulk-process', { 
    submission_ids: submissionIds, 
    notes 
  });
  return response.data;
};

/**
 * Get submissions for a specific template
 * @param {number} templateId - Template ID
 * @param {Object} filters - Additional filters
 */
export const getTemplateSubmissions = async (templateId, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });
  
  const queryString = params.toString();
  const url = queryString 
    ? `/form-templates/${templateId}/submissions?${queryString}` 
    : `/form-templates/${templateId}/submissions`;
  
  const response = await apiClient.get(url);
  return response.data;
};

// ============================================
// ALIASES FOR SIMPLIFIED API
// ============================================

// Alias for getFormTemplates
export const getForms = getFormTemplates;

// Alias for getFormTemplate
export const getFormById = getFormTemplate;

// Alias for getFormTemplateStats
export const getFormStats = getFormTemplateStats;

// Alias for getFormSubmissions
export const getSubmissions = getFormSubmissions;

/**
 * Update submission status
 * @param {number} id - Submission ID
 * @param {string} status - New status ('pending', 'processed', 'archived')
 */
export const updateSubmissionStatus = async (id, status) => {
  if (status === 'processed') {
    return processFormSubmission(id);
  } else if (status === 'archived') {
    return archiveFormSubmission(id);
  }
  const response = await apiClient.patch(`/form-submissions/${id}`, { status });
  return response.data;
};

/**
 * Delete a submission (alias)
 */
export const deleteSubmission = deleteFormSubmission;

/**
 * Export submissions to CSV/Excel
 * @param {number} templateId - Template ID
 * @param {string} format - 'csv' or 'xlsx'
 * @param {Object} filters - Optional filters
 */
export const exportSubmissions = async (templateId, format = 'csv', filters = {}) => {
  const params = new URLSearchParams();
  params.append('format', format);
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });
  
  const response = await apiClient.get(
    `/form-templates/${templateId}/submissions/export?${params.toString()}`,
    { responseType: 'blob' }
  );
  return response.data;
};
