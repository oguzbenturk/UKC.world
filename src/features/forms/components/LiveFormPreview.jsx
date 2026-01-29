/**
 * Live Form Preview Component
 * Shows a real-time styled preview of the form as it's being built
 * Mimics the PublicFormPage appearance with theme/branding
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
  Progress
} from 'antd';
import { 
  ArrowLeftOutlined, 
  ArrowRightOutlined, 
  CheckCircleOutlined 
} from '@ant-design/icons';
import DynamicField from './DynamicField';
import { FIELD_TYPES } from '../constants/fieldTypes';

const { Title, Paragraph, Text } = Typography;

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

  // Find current step index based on selectedStepId
  const currentStep = selectedStepId 
    ? steps.findIndex(s => s.id === selectedStepId)
    : 0;
  
  // Ensure valid step
  const validCurrentStep = currentStep >= 0 && currentStep < steps.length ? currentStep : 0;

  // Apply theme configuration
  const themeConfig = template?.theme_config || {};
  const {
    background_color = '#f0f9ff',
    primary_color = '#1890ff',
    card_background = '#ffffff',
    text_color = '#000000',
    logo_url,
    header_text,
    header_subtitle,
    custom_css
  } = themeConfig;

  // Get current step data
  const currentStepData = steps[validCurrentStep];
  const isLastStep = validCurrentStep === steps.length - 1;
  const isFirstStep = validCurrentStep === 0;

  // Calculate progress
  const progressPercent = steps.length > 0
    ? Math.round(((validCurrentStep + 1) / steps.length) * 100) 
    : 0;

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

  return (
    <div 
      className="live-preview-container h-full overflow-y-auto p-4"
      style={{ 
        backgroundColor: background_color,
        color: text_color 
      }}
    >
      <div className="max-w-3xl mx-auto">
        {/* Header with logo and branding */}
        {(logo_url || header_text) && (
          <div className="text-center mb-6">
            {logo_url && (
              <div className="mb-4">
                <img 
                  src={logo_url} 
                  alt="Logo" 
                  className="h-16 mx-auto object-contain"
                  onError={(e) => e.target.style.display = 'none'}
                />
              </div>
            )}
            {header_text && (
              <Title level={2} className="mb-2" style={{ color: text_color }}>
                {header_text}
              </Title>
            )}
            {header_subtitle && (
              <Paragraph type="secondary" className="text-sm">
                {header_subtitle}
              </Paragraph>
            )}
          </div>
        )}

        {/* Main form card */}
        <Card 
          className="shadow-lg"
          style={{ 
            backgroundColor: card_background,
            borderColor: primary_color 
          }}
        >
          {/* Form header */}
          <div className="mb-6">
            <Title level={3} className="mb-2" style={{ color: text_color }}>
              {template.name || 'Untitled Form'}
            </Title>
            {template.description && (
              <Paragraph type="secondary" className="text-sm">
                {template.description}
              </Paragraph>
            )}

            {/* Progress bar for multi-step forms */}
            {steps.length > 1 && (
              <div className="mt-4">
                <Progress 
                  percent={progressPercent} 
                  strokeColor={primary_color}
                  size="small"
                  showInfo={false}
                />
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>Step {validCurrentStep + 1} of {steps.length}</span>
                  <span>{progressPercent}% Complete</span>
                </div>
              </div>
            )}
          </div>

          {/* Steps indicator */}
          {steps.length > 1 && (
            <Steps
              current={validCurrentStep}
              size="small"
              className="mb-6"
              items={steps.map((step, index) => ({
                title: step.title,
                status: index < validCurrentStep ? 'finish' : 
                        index === validCurrentStep ? 'process' : 'wait',
              }))}
            />
          )}

          {/* Current step content */}
          {currentStepData && (
            <>
              {/* Step header */}
              <div className="mb-6">
                <Title level={4} className="mb-1" style={{ color: text_color }}>
                  {currentStepData.title}
                </Title>
                {currentStepData.description && (
                  <Text type="secondary" className="text-sm">
                    {currentStepData.description}
                  </Text>
                )}
              </div>

              {/* Form fields */}
              <Form
                form={form}
                layout="vertical"
                onValuesChange={handleValuesChange}
              >
                <Row gutter={[16, 0]}>
                  {currentStepData.fields?.length > 0 ? (
                    currentStepData.fields
                      .sort((a, b) => a.order_index - b.order_index)
                      .map(field => {
                        // Get field width for proper grid sizing
                        const getColSpan = (width) => {
                          switch (width) {
                            case 'quarter': return 6;
                            case 'third': return 8;
                            case 'half': return 12;
                            case 'two-thirds': return 16;
                            case 'three-quarters': return 18;
                            default: return 24;
                          }
                        };

                        return (
                          <Col 
                            key={field.id || field.field_name}
                            span={getColSpan(field.width)}
                          >
                            <div
                              className={`
                                cursor-pointer transition-all rounded-lg p-1
                                ${selectedFieldId === field.id 
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
                              {/* Render PARAGRAPH and SECTION_HEADER inline to avoid double Col */}
                              {field.field_type === FIELD_TYPES.PARAGRAPH ? (
                                <div 
                                  className="my-3 paragraph-field-content"
                                  dangerouslySetInnerHTML={{ __html: field.default_value || field.help_text || '<p>Paragraph content...</p>' }}
                                />
                              ) : field.field_type === FIELD_TYPES.SECTION_HEADER ? (
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
                              ) : (
                                <DynamicField
                                  field={field}
                                  form={form}
                                  allValues={formValues}
                                  disabled={false}
                                />
                              )}
                            </div>
                          </Col>
                        );
                      })
                  ) : (
                    <div className="w-full text-center py-8">
                      <Text type="secondary" className="text-sm">
                        No fields in this step yet
                      </Text>
                    </div>
                  )}
                </Row>
              </Form>

              {/* Navigation buttons */}
              <div className="flex justify-between gap-3 mt-8 pt-6 border-t">
                <div className="flex gap-2">
                  {!isFirstStep && (
                    <Button 
                      size="large"
                      icon={<ArrowLeftOutlined />}
                      onClick={handlePrevious}
                    >
                      Previous
                    </Button>
                  )}
                </div>
                <div>
                  {isLastStep ? (
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<CheckCircleOutlined />}
                      style={{ 
                        backgroundColor: primary_color,
                        borderColor: primary_color 
                      }}
                    >
                      {template.settings?.submit_button_text || 'Submit'}
                    </Button>
                  ) : (
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<ArrowRightOutlined />}
                      onClick={handleNext}
                      style={{ 
                        backgroundColor: primary_color,
                        borderColor: primary_color 
                      }}
                    >
                      Next
                    </Button>
                  )}
                </div>
              </div>

              {/* Completion message for last step */}
              {isLastStep && currentStepData.completion_message && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <Text className="text-sm">{currentStepData.completion_message}</Text>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Footer */}
        <div className="text-center mt-6">
          <Text type="secondary" className="text-xs">
            Live Preview - Changes update automatically
          </Text>
        </div>
      </div>
    </div>
  );
};

export default LiveFormPreview;
