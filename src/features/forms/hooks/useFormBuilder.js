/**
 * useFormBuilder Hook
 * Manages form builder state and operations
 */

/* eslint-disable no-console */

import { useState, useCallback, useEffect, useRef } from 'react';
import { App } from 'antd';
import * as formService from '../services/formService';
import { FIELD_DEFAULTS } from '../constants/fieldTypes';

export function useFormBuilder(templateId) {
  // Use App context for message - store in ref to avoid dependency issues
  const { message } = App.useApp();
  const messageRef = useRef(message);
  messageRef.current = message;
  
  // Helper to show messages without adding to dependencies
  const showMessage = useCallback((type, content, duration) => {
    messageRef.current[type](content, duration);
  }, []);
  
  // State
  const [template, setTemplate] = useState(null);
  const [steps, setSteps] = useState([]);
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // History for undo/redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Auto-save timer
  const autoSaveTimer = useRef(null);
  
  // Keep a ref to the latest steps state to avoid stale closures
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // Get selected step
  const selectedStep = steps.find(s => s.id === selectedStepId);
  
  // Get selected field
  const selectedField = selectedStep?.fields?.find(f => f.id === selectedFieldId);

  // Load template
  const loadTemplate = useCallback(async () => {
    if (!templateId) return;
    
    try {
      setLoading(true);
      const data = await formService.getFormTemplate(templateId);
      setTemplate(data);
      setSteps(data.steps || []);
      
      // Select first step if exists
      if (data.steps?.length > 0) {
        setSelectedStepId(data.steps[0].id);
      }
    } catch (error) {
      showMessage('error', 'Failed to load form template');
      console.error('Error loading template:', error);
    } finally {
      setLoading(false);
    }
  }, [templateId, showMessage]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  // Save to history for undo/redo
  const saveToHistory = useCallback((newSteps) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.stringify(newSteps));
    setHistory(newHistory.slice(-50)); // Keep last 50 states
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setSteps(JSON.parse(history[newIndex]));
      setHasChanges(true);
    }
  }, [history, historyIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setSteps(JSON.parse(history[newIndex]));
      setHasChanges(true);
    }
  }, [history, historyIndex]);

  // Update template settings
  const updateTemplate = useCallback(async (updates) => {
    try {
      setSaving(true);
      const updated = await formService.updateFormTemplate(templateId, updates);
      // Merge the updated fields with the existing template to preserve steps
      setTemplate(prev => ({ ...prev, ...updated }));
      showMessage('success', 'Form settings saved');
    } catch (error) {
      showMessage('error', 'Failed to save settings');
      console.error('Error updating template:', error);
    } finally {
      setSaving(false);
    }
  }, [templateId, showMessage]);

  // ============================================
  // STEP OPERATIONS
  // ============================================

  // Add new step
  const addStep = useCallback(async (data = {}) => {
    try {
      // Use the most current steps state
      const currentSteps = stepsRef.current;
      const newStep = await formService.createFormStep(templateId, {
        title: data.title || `Step ${currentSteps.length + 1}`,
        description: data.description || '',
        order_index: currentSteps.length,
        show_progress: true,
      });
      
      const updatedSteps = [...currentSteps, { ...newStep, fields: [] }];
      setSteps(updatedSteps);
      setSelectedStepId(newStep.id);
      setSelectedFieldId(null);
      saveToHistory(updatedSteps);
      setHasChanges(true);
      
      return newStep;
    } catch (error) {
      showMessage('error', 'Failed to add step');
      console.error('Error adding step:', error);
    }
  }, [templateId, saveToHistory, showMessage]);

  // Update step
  const updateStep = useCallback(async (stepId, updates) => {
    try {
      await formService.updateFormStep(stepId, updates);
      
      // Use the most current steps state
      const updatedSteps = stepsRef.current.map(s => 
        s.id === stepId ? { ...s, ...updates } : s
      );
      setSteps(updatedSteps);
      saveToHistory(updatedSteps);
      setHasChanges(true);
    } catch (error) {
      showMessage('error', 'Failed to update step');
      console.error('Error updating step:', error);
    }
  }, [saveToHistory, showMessage]);

  // Delete step
  const deleteStep = useCallback(async (stepId) => {
    try {
      await formService.deleteFormStep(stepId);
      
      // Use the most current steps state
      const updatedSteps = stepsRef.current.filter(s => s.id !== stepId);
      setSteps(updatedSteps);
      
      // Select another step if the deleted one was selected
      if (selectedStepId === stepId) {
        setSelectedStepId(updatedSteps[0]?.id || null);
        setSelectedFieldId(null);
      }
      
      saveToHistory(updatedSteps);
      setHasChanges(true);
      showMessage('success', 'Step deleted');
    } catch (error) {
      showMessage('error', 'Failed to delete step');
      console.error('Error deleting step:', error);
    }
  }, [selectedStepId, saveToHistory, showMessage]);

  // Reorder steps
  const reorderSteps = useCallback(async (stepIds) => {
    try {
      await formService.reorderFormSteps(templateId, stepIds);
      
      // Use the most current steps state
      const currentSteps = stepsRef.current;
      const reorderedSteps = stepIds.map((id, index) => {
        const step = currentSteps.find(s => s.id === id);
        return { ...step, order_index: index };
      });
      
      setSteps(reorderedSteps);
      saveToHistory(reorderedSteps);
      setHasChanges(true);
    } catch (error) {
      showMessage('error', 'Failed to reorder steps');
      console.error('Error reordering steps:', error);
    }
  }, [templateId, saveToHistory, showMessage]);

  // ============================================
  // FIELD OPERATIONS
  // ============================================

  // Add field to step
  const addField = useCallback(async (stepId, fieldType, insertIndex = null) => {
    // Use ref to get the most current steps state
    const currentSteps = stepsRef.current;
    const step = currentSteps.find(s => s.id === stepId);
    if (!step) return;

    const defaults = FIELD_DEFAULTS[fieldType] || {};
    const fieldCount = step.fields?.length || 0;
    const orderIndex = insertIndex !== null ? insertIndex : fieldCount;

    try {
      const newField = await formService.createFormField(stepId, {
        field_type: fieldType,
        field_label: `New ${fieldType.replace('_', ' ')} field`,
        order_index: orderIndex,
        is_required: false,
        ...defaults,
      });

      // Use the most current steps state when updating
      const updatedSteps = stepsRef.current.map(s => {
        if (s.id !== stepId) return s;
        
        const fields = [...(s.fields || [])];
        if (insertIndex !== null) {
          fields.splice(insertIndex, 0, newField);
        } else {
          fields.push(newField);
        }
        return { ...s, fields };
      });

      setSteps(updatedSteps);
      setSelectedFieldId(newField.id);
      saveToHistory(updatedSteps);
      setHasChanges(true);
      
      return newField;
    } catch (error) {
      showMessage('error', 'Failed to add field');
      console.error('Error adding field:', error);
    }
  }, [saveToHistory, showMessage]);

  // Update field
  const updateField = useCallback(async (fieldId, updates) => {
    try {
      await formService.updateFormField(fieldId, updates);
      
      // Use the most current steps state
      const updatedSteps = stepsRef.current.map(s => ({
        ...s,
        fields: s.fields?.map(f => 
          f.id === fieldId ? { ...f, ...updates } : f
        ),
      }));
      
      setSteps(updatedSteps);
      saveToHistory(updatedSteps);
      setHasChanges(true);
    } catch (error) {
      showMessage('error', 'Failed to update field');
      console.error('Error updating field:', error);
    }
  }, [saveToHistory, showMessage]);

  // Delete field
  const deleteField = useCallback(async (fieldId) => {
    try {
      await formService.deleteFormField(fieldId);
      
      // Use the most current steps state
      const updatedSteps = stepsRef.current.map(s => ({
        ...s,
        fields: s.fields?.filter(f => f.id !== fieldId),
      }));
      
      setSteps(updatedSteps);
      
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
      }
      
      saveToHistory(updatedSteps);
      setHasChanges(true);
      showMessage('success', 'Field deleted');
    } catch (error) {
      showMessage('error', 'Failed to delete field');
      console.error('Error deleting field:', error);
    }
  }, [selectedFieldId, saveToHistory, showMessage]);

  // Duplicate field
  const duplicateField = useCallback(async (fieldId) => {
    // Use the most current steps state
    const currentSteps = stepsRef.current;
    const step = currentSteps.find(s => s.fields?.some(f => f.id === fieldId));
    const field = step?.fields?.find(f => f.id === fieldId);
    
    if (!step || !field) return;

    try {
      const newField = await formService.createFormField(step.id, {
        field_type: field.field_type,
        field_label: `${field.field_label} (Copy)`,
        field_name: `${field.field_name}_copy`,
        placeholder_text: field.placeholder_text,
        help_text: field.help_text,
        default_value: field.default_value,
        is_required: field.is_required,
        is_readonly: field.is_readonly,
        order_index: field.order_index + 1,
        width: field.width,
        validation_rules: field.validation_rules,
        options: field.options,
        conditional_logic: field.conditional_logic,
      });

      // Use the most current steps state when updating
      const updatedSteps = stepsRef.current.map(s => {
        if (s.id !== step.id) return s;
        
        const fields = [...(s.fields || [])];
        const fieldIndex = fields.findIndex(f => f.id === fieldId);
        fields.splice(fieldIndex + 1, 0, newField);
        return { ...s, fields };
      });

      setSteps(updatedSteps);
      setSelectedFieldId(newField.id);
      saveToHistory(updatedSteps);
      setHasChanges(true);
      showMessage('success', 'Field duplicated');
      
      return newField;
    } catch (error) {
      showMessage('error', 'Failed to duplicate field');
      console.error('Error duplicating field:', error);
    }
  }, [saveToHistory, showMessage]);

  // Helper function to reorder fields within a step
  const reorderFieldsInStep = (step, fieldIds) => {
    const reorderedFields = fieldIds.map((id, index) => {
      const field = step.fields.find(f => f.id === id);
      return { ...field, order_index: index };
    });
    return { ...step, fields: reorderedFields };
  };

  // Reorder fields within a step
  const reorderFields = useCallback(async (stepId, fieldIds) => {
    try {
      await formService.reorderFormFields(stepId, fieldIds);
      
      // Use the most current steps state
      const updatedSteps = stepsRef.current.map(s => {
        if (s.id !== stepId) return s;
        return reorderFieldsInStep(s, fieldIds);
      });
      
      setSteps(updatedSteps);
      saveToHistory(updatedSteps);
      setHasChanges(true);
    } catch (error) {
      showMessage('error', 'Failed to reorder fields');
      console.error('Error reordering fields:', error);
    }
  }, [saveToHistory, showMessage]);

  // Move field to different step
  const moveFieldToStep = useCallback(async (fieldId, fromStepId, toStepId, insertIndex = null) => {
    // Use the most current steps state
    const currentSteps = stepsRef.current;
    const fromStep = currentSteps.find(s => s.id === fromStepId);
    const field = fromStep?.fields?.find(f => f.id === fieldId);
    
    if (!field || fromStepId === toStepId) return;

    try {
      // Delete from old step
      await formService.deleteFormField(fieldId);
      
      // Create in new step
      const newField = await formService.createFormField(toStepId, {
        ...field,
        order_index: insertIndex || 0,
      });

      // Use the most current steps state when updating
      const updatedSteps = stepsRef.current.map(s => {
        if (s.id === fromStepId) {
          return { ...s, fields: s.fields.filter(f => f.id !== fieldId) };
        }
        if (s.id === toStepId) {
          const fields = [...(s.fields || [])];
          if (insertIndex !== null) {
            fields.splice(insertIndex, 0, newField);
          } else {
            fields.push(newField);
          }
          return { ...s, fields };
        }
        return s;
      });

      setSteps(updatedSteps);
      setSelectedFieldId(newField.id);
      saveToHistory(updatedSteps);
      setHasChanges(true);
      
      return newField;
    } catch (error) {
      showMessage('error', 'Failed to move field');
      console.error('Error moving field:', error);
    }
  }, [saveToHistory, showMessage]);

  // Manual save function to mark changes as saved
  const saveChanges = useCallback(async () => {
    if (!hasChanges || saving) return;
    
    try {
      setSaving(true);
      // All changes are already persisted to backend via individual operations
      // This just marks the state as saved
      setHasChanges(false);
      showMessage('success', 'Changes saved');
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  }, [hasChanges, saving, showMessage]);

  return {
    // State
    template,
    steps,
    selectedStepId,
    selectedFieldId,
    selectedStep,
    selectedField,
    loading,
    saving,
    hasChanges,
    
    // Actions
    saveChanges,
    
    // History
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo,
    redo,
    
    // Selection
    setSelectedStepId,
    setSelectedFieldId,
    
    // Template
    updateTemplate,
    reloadTemplate: loadTemplate,
    
    // Steps
    addStep,
    updateStep,
    deleteStep,
    reorderSteps,
    
    // Fields
    addField,
    updateField,
    deleteField,
    duplicateField,
    reorderFields,
    moveFieldToStep,
  };
}
