/**
 * Live Form Preview Component
 * Shows a real-time styled preview of the form as it's being built
 * Matches the PublicFormPage appearance exactly
 */

/* eslint-disable complexity */

import { useState, useEffect } from 'react';
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
  CheckCircleOutlined 
} from '@ant-design/icons';
import DynamicField, { getColProps } from './DynamicField';
import { FIELD_TYPES } from '../constants/fieldTypes';

const { Title, Paragraph, Text } = Typography;

/**
 * Wrapper component to make fields clickable for selection
 * Uses the same getColProps function as DynamicField for consistent layout
 */
const SelectableFieldWrapper = ({ field, selectedFieldId, onSelectField, children }) => {
  const isSelected = selectedFieldId === field.id;
  
  // Use same responsive col props as DynamicField
  const colProps = getColProps(field.width);

  return (
    <Col {...colProps}>
      <div
        className={`
          cursor-pointer transition-all rounded-lg
          ${isSelected 
            ? 'ring-2 ring-blue-500 ring-offset-2' 
            : 'hover:ring-2 hover:ring-blue-300 hover:ring-offset-1'
          }
        `}
        onClick={(e) => {
          e.stopPropagation();
          if (onSelectField) {
            onSelectField(field.id);
          }
        }}
      >
        {children}
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
  onSelectStep 
}) => {
  const [form] = Form.useForm();
  const [formValues, setFormValues] = useState({});
  const { token } = theme.useToken();

  // Find current step index based on selectedStepId
  const currentStep = selectedStepId 
    ? steps.findIndex(s => s.id === selectedStepId)
    : 0;
  
  // Ensure valid step
  const validCurrentStep = currentStep >= 0 && currentStep < steps.length ? currentStep : 0;

  // Apply theme configuration (for custom CSS only)
  const themeConfig = template?.theme_config || {};
  const { custom_css } = themeConfig;

  // Get current step data
  const currentStepData = steps[validCurrentStep];
  const isLastStep = validCurrentStep === steps.length - 1;
  const isFirstStep = validCurrentStep === 0;

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
          field={{ ...field, width: 'full' }} // PARAGRAPH always full width
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
          field={{ ...field, width: 'full' }} // SECTION_HEADER always full width
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
                <Row gutter={[16, 0]}>
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
