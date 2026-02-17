/**
 * Live Form Preview Component
 * Shows a real-time styled preview of the form as it's being built
 * Matches the PublicFormPage appearance exactly
 */

/* eslint-disable complexity */

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Steps, 
  Form,
  Row,
  Col,
  Typography,
  Button,
  theme
} from 'antd';
import { 
  ArrowLeftOutlined, 
  ArrowRightOutlined, 
  CheckCircleOutlined,
  HolderOutlined
} from '@ant-design/icons';
import { 
  DndContext, 
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DynamicField, { getColProps } from './DynamicField';
import { FIELD_TYPES } from '../constants/fieldTypes';

const { Title, Paragraph, Text } = Typography;

/**
 * Wrapper component to make fields clickable for selection and draggable
 * Uses the same getColProps function as DynamicField for consistent layout
 */
const SelectableFieldWrapper = ({ field, selectedFieldId, onSelectField, children }) => {
  const isSelected = selectedFieldId === field.id;
  
  // Use same responsive col props as DynamicField
  const colProps = getColProps(field.width);

  // Sortable hook for drag-and-drop
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: field.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Handle wrapper click for field selection
  const handleWrapperClick = (e) => {
    // Don't interfere with input interactions (DatePicker, Upload, Select dropdowns)
    const target = e.target;
    const isInteractiveElement = 
      target.closest('.ant-picker') || 
      target.closest('.ant-picker-dropdown') ||
      target.closest('.ant-upload') || 
      target.closest('.ant-select') ||
      target.closest('.ant-select-dropdown') ||
      target.closest('.ant-modal') ||
      target.closest('.ant-image-preview') ||
      target.closest('input') ||
      target.closest('button') ||
      target.closest('textarea') ||
      target.closest('a');
    
    if (!isInteractiveElement && onSelectField) {
      onSelectField(field.id);
    }
  };

  return (
    <Col {...colProps} style={{ minWidth: 0 }}>
      <div
        ref={setNodeRef}
        style={{ ...style, minWidth: 0, width: '100%' }}
        className={`
          group relative transition-all rounded-lg p-2
          ${isSelected 
            ? 'ring-2 ring-blue-500 ring-offset-2' 
            : 'hover:ring-2 hover:ring-blue-300 hover:ring-offset-1'
          }
          ${isDragging ? 'z-50 shadow-lg' : ''}
        `}
        onClick={handleWrapperClick}
      >
        {/* Drag Handle - only this part triggers drag */}
        <div 
          className="absolute left-1 top-1 opacity-30 group-hover:opacity-100 cursor-move z-20 p-1"
          {...attributes}
          {...listeners}
        >
          <HolderOutlined className="text-gray-400 text-lg" />
        </div>
        {/* Field content - allow normal interactions */}
        <div className="relative z-10" style={{ minWidth: 0, width: '100%', overflow: 'hidden' }}>
          {React.cloneElement(children, { skipColWrapper: true })}
        </div>
      </div>
    </Col>
  );
};

const LiveFormPreview = ({ 
  template, 
  steps = [], 
  selectedStepId, 
  selectedFieldId,
  onSelectField,
  onSelectStep,
  onReorderFields 
}) => {
  const [form] = Form.useForm();
  const [formValues, setFormValues] = useState({});
  const [activeId, setActiveId] = useState(null);
  const { token } = theme.useToken();

  // Find current step index based on selectedStepId
  const currentStep = selectedStepId 
    ? steps.findIndex(s => s.id === selectedStepId)
    : 0;
  
  // Ensure valid step
  const validCurrentStep = currentStep >= 0 && currentStep < steps.length ? currentStep : 0;

  // Get current step data - needed before handlers
  const currentStepData = steps[validCurrentStep];
  const isLastStep = validCurrentStep === steps.length - 1;
  const isFirstStep = validCurrentStep === 0;

  // Setup sensors for drag and drop - only when reordering is enabled
  const sensors = onReorderFields ? useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required to activate drag
      },
    })
  ) : null;

  // Handle drag start
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (active.id !== over?.id && currentStepData) {
      const fields = currentStepData.fields.sort((a, b) => a.order_index - b.order_index);
      const oldIndex = fields.findIndex(f => f.id === active.id);
      const newIndex = fields.findIndex(f => f.id === over?.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(fields, oldIndex, newIndex).map(f => f.id);
        if (onReorderFields) {
          onReorderFields(currentStepData.id, newOrder);
        }
      }
    }
  };

  // Apply theme configuration (for custom CSS only)
  const themeConfig = template?.theme_config || {};
  const { custom_css } = themeConfig;

  // Handle navigation
  const handleNext = () => {
    if (validCurrentStep < steps.length - 1 && onSelectStep) {
      onSelectStep(steps[validCurrentStep + 1].id);
    }
  };

  const handlePrevious = () => {
    if (validCurrentStep > 0 && onSelectStep) {
      onSelectStep(steps[validCurrentStep - 1].id);
    }
  };

  const handleValuesChange = (changed, all) => {
    setFormValues(all);
  };

  // Apply custom CSS if provided
  useEffect(() => {
    if (custom_css) {
      const styleId = 'live-preview-custom-css';
      let styleElement = document.getElementById(styleId);
      
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }
      
      styleElement.textContent = `.live-preview-container ${custom_css}`;
      
      return () => {
        const element = document.getElementById(styleId);
        if (element) {
          element.remove();
        }
      };
    }
  }, [custom_css]);

  if (!template) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Text type="secondary">No template data</Text>
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Text type="secondary" className="block mb-2">No steps added yet</Text>
          <Text type="secondary" className="text-xs">Add a step to start building your form</Text>
        </div>
      </div>
    );
  }

  // Render field with selection wrapper
  const renderFieldWithSelection = (field) => {
    // For PARAGRAPH and SECTION_HEADER, render inline with HTML support
    if (field.field_type === FIELD_TYPES.PARAGRAPH) {
      return (
        <SelectableFieldWrapper 
          key={field.id || field.field_name}
          field={field}
          selectedFieldId={selectedFieldId} 
          onSelectField={onSelectField}
        >
          <div 
            className="my-3 paragraph-field-content"
            dangerouslySetInnerHTML={{ __html: field.default_value || field.help_text || '<p>Paragraph content...</p>' }}
          />
        </SelectableFieldWrapper>
      );
    }
    
    if (field.field_type === FIELD_TYPES.SECTION_HEADER) {
      return (
        <SelectableFieldWrapper 
          key={field.id || field.field_name}
          field={field}
          selectedFieldId={selectedFieldId} 
          onSelectField={onSelectField}
        >
          <div className="form-section-header">
            <Title level={4} className="mt-4 mb-2">
              {field.field_label}
            </Title>
            {(field.default_value || field.help_text) && (
              <div 
                className="section-header-content"
                style={{ marginTop: -4, color: 'rgba(0, 0, 0, 0.45)' }}
                dangerouslySetInnerHTML={{ __html: field.default_value || field.help_text }}
              />
            )}
          </div>
        </SelectableFieldWrapper>
      );
    }

    // For all other fields, use DynamicField with skipColWrapper
    return (
      <SelectableFieldWrapper 
        key={field.id || field.field_name}
        field={field}
        selectedFieldId={selectedFieldId} 
        onSelectField={onSelectField}
      >
        <DynamicField
          field={field}
          form={form}
          allValues={formValues}
          disabled={false}
          skipColWrapper={true}
        />
      </SelectableFieldWrapper>
    );
  };

  return (
    <div className="live-preview-container min-h-screen bg-gray-50 py-8 px-4 overflow-y-auto">
      <style>
        {`
          .live-preview-container .ant-form-item-label > label {
            white-space: normal !important;
            word-break: break-word !important;
            display: inline-block !important;
            width: auto !important;
            min-width: 0 !important;
          }
          .live-preview-container .ant-col {
            min-width: 0;
          }
          .live-preview-container .ant-form-vertical .ant-form-item-label {
            padding-bottom: 4px;
          }
        `}
      </style>
      <div className="max-w-3xl mx-auto">
        {/* Main form card - matching PublicFormPage simple layout */}
        <Card 
          className="mb-4"
          style={{ borderTop: `4px solid ${token.colorPrimary}` }}
        >
          {/* Form Header - matching PublicFormPage structure */}
          <Title level={3} className="mb-2">
            {template.name || 'Untitled Form'}
          </Title>
          {template.description && (
            <Paragraph type="secondary">
              {template.description}
            </Paragraph>
          )}
          
          {/* Multi-step progress - matching PublicFormPage */}
          {steps.length > 1 && (
            <div className="mt-4">
              <Steps
                current={validCurrentStep}
                size="small"
                items={steps.map((step, index) => ({
                  title: step.title || step.step_name,
                  status: index < validCurrentStep ? 'finish' : 
                          index === validCurrentStep ? 'process' : 'wait',
                }))}
              />
            </div>
          )}
        </Card>

        {/* Step Content Card - matching PublicFormPage */}
        <Card className="mb-4">
          {currentStepData && (
            <>
              {/* Step header - matching PublicFormPage */}
              {steps.length > 1 && (
                <div className="mb-6">
                  <Title level={4} className="mb-1">
                    {currentStepData.title || currentStepData.step_name}
                  </Title>
                  {(currentStepData.description || currentStepData.step_description) && (
                    <Text type="secondary">
                      {currentStepData.description || currentStepData.step_description}
                    </Text>
                  )}
                </div>
              )}

              {/* Form fields - matching PublicFormPage */}
              <Form
                form={form}
                layout="vertical"
                onValuesChange={handleValuesChange}
                requiredMark="optional"
              >
                {sensors && onReorderFields ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={currentStepData.fields?.map(f => f.id) || []}
                      strategy={verticalListSortingStrategy}
                    >
                      <Row gutter={[16, 16]}>
                        {currentStepData.fields?.length > 0 ? (
                          currentStepData.fields
                            .sort((a, b) => a.order_index - b.order_index)
                            .map(field => renderFieldWithSelection(field))
                        ) : (
                          <Col span={24}>
                            <div className="w-full text-center py-8">
                              <Text type="secondary" className="text-sm">
                                No fields in this step yet
                              </Text>
                            </div>
                          </Col>
                        )}
                      </Row>
                    </SortableContext>
                    <DragOverlay>
                      {activeId ? (
                        <div className="bg-white shadow-lg rounded-lg p-3 border-2 border-blue-500">
                          Dragging field...
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                ) : (
                  <Row gutter={[16, 16]}>
                    {currentStepData.fields?.length > 0 ? (
                      currentStepData.fields
                        .sort((a, b) => a.order_index - b.order_index)
                        .map(field => (
                          <div key={field.id} onClick={() => onSelectField?.(field.id)} style={{ width: '100%' }}>
                            <DynamicField
                              field={field}
                              form={form}
                              allValues={formValues}
                            />
                          </div>
                        ))
                    ) : (
                      <Col span={24}>
                        <div className="w-full text-center py-8">
                          <Text type="secondary" className="text-sm">
                            No fields in this step yet
                          </Text>
                        </div>
                      </Col>
                    )}
                  </Row>
                )}

                {/* Navigation buttons - matching PublicFormPage */}
                <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 mt-8 pt-4 border-t border-gray-200">
                  <div className="flex flex-col sm:flex-row gap-2">
                    {!isFirstStep && (
                      <Button 
                        size="large"
                        icon={<ArrowLeftOutlined />}
                        onClick={handlePrevious}
                        className="w-full sm:w-auto"
                      >
                        Previous
                      </Button>
                    )}
                  </div>
                  <div className="w-full sm:w-auto">
                    {isLastStep ? (
                      <Button 
                        type="primary" 
                        size="large"
                        icon={<CheckCircleOutlined />}
                        className="w-full sm:w-auto"
                      >
                        {template.settings?.submit_button_text || 'Submit'}
                      </Button>
                    ) : (
                      <Button 
                        type="primary" 
                        size="large"
                        icon={<ArrowRightOutlined />}
                        onClick={handleNext}
                        className="w-full sm:w-auto"
                      >
                        Next
                      </Button>
                    )}
                  </div>
                </div>
              </Form>
            </>
          )}
        </Card>

        {/* Footer indicator */}
        <div className="text-center">
          <Text type="secondary" className="text-xs">
            Live Preview - Click any field to edit
          </Text>
        </div>
      </div>
    </div>
  );
};

export default LiveFormPreview;
