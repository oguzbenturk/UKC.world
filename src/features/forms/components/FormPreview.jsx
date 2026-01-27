/**
 * Form Preview Component
 * Renders a preview of the form as users will see it
 */

/* eslint-disable complexity */

import { useState } from 'react';
import { 
  Form, 
  Input, 
  Select, 
  Checkbox, 
  Radio, 
  DatePicker, 
  TimePicker,
  InputNumber,
  Rate,
  Upload,
  Button,
  Steps,
  Card,
  Typography,
  Space,
  Divider,
  Row,
  Col
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { FIELD_TYPES, WIDTH_OPTIONS } from '../constants/fieldTypes';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// Get column span from width value
const getColSpan = (width) => {
  const widthOption = WIDTH_OPTIONS.find(w => w.value === width);
  return widthOption?.span || 24;
};

// Render text-based input fields
const renderTextInput = (field, commonProps, type = 'text') => (
  <Input type={type} {...commonProps} />
);

// Render select/dropdown fields
const renderSelectField = (field, commonProps, isMulti = false) => {
  // Filter out options with empty value or label
  const validOptions = (field.options || [])
    .filter(opt => opt.value && opt.label)
    .map(opt => ({
      value: opt.value,
      label: opt.label,
    }));

  return (
    <Select
      {...commonProps}
      mode={isMulti ? 'multiple' : undefined}
      options={validOptions}
      className="w-full"
    />
  );
};

// Render radio/checkbox choice fields
const renderChoiceField = (field, isCheckbox = false) => {
  const GroupComponent = isCheckbox ? Checkbox.Group : Radio.Group;
  const ItemComponent = isCheckbox ? Checkbox : Radio;
  
  // Filter out options with empty value or label
  const validOptions = (field.options || []).filter(opt => opt.value && opt.label);
  
  return (
    <GroupComponent disabled={field.is_readonly}>
      <Space direction="vertical">
        {validOptions.map(opt => (
          <ItemComponent key={opt.value} value={opt.value}>
            {opt.label}
          </ItemComponent>
        ))}
      </Space>
    </GroupComponent>
  );
};

// Render date/time picker fields
const renderDateTimeField = (field, commonProps, variant) => {
  if (variant === 'time') {
    return <TimePicker {...commonProps} className="w-full" />;
  }
  if (variant === 'datetime') {
    return <DatePicker showTime {...commonProps} className="w-full" />;
  }
  return <DatePicker {...commonProps} className="w-full" />;
};

// Render address field
const renderAddressField = () => (
  <div className="space-y-2">
    <Input placeholder="Street Address" />
    <Row gutter={8}>
      <Col span={12}><Input placeholder="City" /></Col>
      <Col span={6}><Input placeholder="State" /></Col>
      <Col span={6}><Input placeholder="ZIP" /></Col>
    </Row>
    <Input placeholder="Country" />
  </div>
);

// Render individual field
const renderField = (field) => {
  const commonProps = {
    placeholder: field.placeholder_text,
    disabled: field.is_readonly,
  };

  const fieldType = field.field_type;

  // Text-based inputs
  if (fieldType === FIELD_TYPES.TEXT) return renderTextInput(field, commonProps);
  if (fieldType === FIELD_TYPES.EMAIL) return renderTextInput(field, commonProps, 'email');
  if (fieldType === FIELD_TYPES.PHONE) return renderTextInput(field, commonProps, 'tel');
  if (fieldType === FIELD_TYPES.URL) return renderTextInput(field, commonProps, 'url');
  if (fieldType === FIELD_TYPES.NUMBER) return <InputNumber {...commonProps} className="w-full" />;
  if (fieldType === FIELD_TYPES.TEXTAREA) return <TextArea rows={4} {...commonProps} />;

  // Select fields
  if (fieldType === FIELD_TYPES.SELECT) return renderSelectField(field, commonProps);
  if (fieldType === FIELD_TYPES.MULTISELECT) return renderSelectField(field, commonProps, true);

  // Choice fields
  if (fieldType === FIELD_TYPES.RADIO) return renderChoiceField(field);
  if (fieldType === FIELD_TYPES.CHECKBOX) return renderChoiceField(field, true);

  // Date/time fields
  if (fieldType === FIELD_TYPES.DATE) return renderDateTimeField(field, commonProps, 'date');
  if (fieldType === FIELD_TYPES.TIME) return renderDateTimeField(field, commonProps, 'time');
  if (fieldType === FIELD_TYPES.DATETIME) return renderDateTimeField(field, commonProps, 'datetime');

  // Special fields
  if (fieldType === FIELD_TYPES.FILE) {
    return <Upload><Button icon={<UploadOutlined />}>Click to Upload</Button></Upload>;
  }
  if (fieldType === FIELD_TYPES.RATING) {
    return <Rate allowHalf={field.options?.allow_half} count={field.options?.max || 5} disabled={field.is_readonly} />;
  }
  if (fieldType === FIELD_TYPES.ADDRESS) return renderAddressField();
  if (fieldType === FIELD_TYPES.HIDDEN) return null;
  if (fieldType === FIELD_TYPES.SECTION_HEADER) {
    return <Title level={4} className="mb-0">{field.field_label}</Title>;
  }
  if (fieldType === FIELD_TYPES.PARAGRAPH) {
    const htmlContent = field.default_value || field.help_text || 'Paragraph text';
    return <div className="paragraph-field-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />;
  }

  // Default fallback
  return renderTextInput(field, commonProps);
};

// Form Preview Component
const FormPreview = ({ 
  template, 
  steps = [], 
  showStepNavigation = true,
  embedded = false 
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();

  const activeStep = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Handle step navigation
  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Render form fields for current step
  const renderFields = () => {
    if (!activeStep?.fields?.length) {
      return <Text type="secondary">No fields in this step</Text>;
    }

    return (
      <Row gutter={[16, 0]}>
        {activeStep.fields
          .sort((a, b) => a.order_index - b.order_index)
          .map(field => {
            // Layout fields render differently
            if ([FIELD_TYPES.SECTION_HEADER, FIELD_TYPES.PARAGRAPH].includes(field.field_type)) {
              return (
                <Col span={24} key={field.id}>
                  <div className="my-4">
                    {renderField(field)}
                  </div>
                </Col>
              );
            }

            // Hidden fields don't render
            if (field.field_type === FIELD_TYPES.HIDDEN) {
              return null;
            }

            return (
              <Col span={getColSpan(field.width)} key={field.id}>
                <Form.Item
                  label={field.field_label}
                  name={field.field_name}
                  rules={field.is_required ? [{ required: true, message: `${field.field_label} is required` }] : []}
                  extra={field.help_text}
                  initialValue={field.default_value}
                >
                  {renderField(field)}
                </Form.Item>
              </Col>
            );
          })}
      </Row>
    );
  };

  if (!steps.length) {
    return (
      <div className={embedded ? 'p-8 text-center' : ''}>
        <Card className="text-center py-8">
          <Text type="secondary">No steps to preview</Text>
        </Card>
      </div>
    );
  }

  // Embedded mode - used inside PublicFormLayout, no outer Card wrapper
  if (embedded) {
    return (
      <div className="form-preview">
        {/* Header */}
        {template && (
          <div className="text-center p-6 border-b">
            <Title level={2} className="mb-2">{template.name}</Title>
            {template.description && (
              <Text type="secondary">{template.description}</Text>
            )}
            
            {/* Progress Steps */}
            {showStepNavigation && steps.length > 1 && (
              <div className="mt-4">
                <Steps
                  current={currentStep}
                  size="small"
                  items={steps
                    .filter(s => s.show_progress !== false)
                    .map(s => ({ title: s.title }))}
                />
              </div>
            )}
          </div>
        )}

        {/* Form Content */}
        <div className="p-6">
          {/* Step Header */}
          {steps.length > 1 && (
            <div className="mb-4">
              <Title level={4} className="mb-1">{activeStep?.title}</Title>
              {activeStep?.description && (
                <Text type="secondary">{activeStep.description}</Text>
              )}
            </div>
          )}

          <Form
            form={form}
            layout="vertical"
            requiredMark="optional"
          >
            {renderFields()}
          </Form>

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-4 border-t">
            <Button
              onClick={prevStep}
              disabled={isFirstStep}
            >
              Previous
            </Button>
            
            {isLastStep ? (
              <Button type="primary">
                Submit
              </Button>
            ) : (
              <Button type="primary" onClick={nextStep}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Standard mode - with Card wrapper
  return (
    <div className="form-preview max-w-2xl mx-auto p-4">
      {/* Header */}
      {template && (
        <div className="text-center mb-6">
          <Title level={2}>{template.name}</Title>
          {template.description && (
            <Text type="secondary">{template.description}</Text>
          )}
        </div>
      )}

      {/* Progress Steps */}
      {showStepNavigation && steps.length > 1 && (
        <Steps
          current={currentStep}
          className="mb-6"
          size="small"
          items={steps
            .filter(s => s.show_progress !== false)
            .map(s => ({ title: s.title }))}
        />
      )}

      {/* Form */}
      <Card className="mb-4">
        {/* Step Header */}
        <div className="mb-4">
          <Title level={4} className="mb-1">{activeStep?.title}</Title>
          {activeStep?.description && (
            <Text type="secondary">{activeStep.description}</Text>
          )}
        </div>

        <Divider className="my-4" />

        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
        >
          {renderFields()}
        </Form>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          onClick={prevStep}
          disabled={isFirstStep}
        >
          Previous
        </Button>
        
        {isLastStep ? (
          <Button type="primary">
            Submit
          </Button>
        ) : (
          <Button type="primary" onClick={nextStep}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
};

export default FormPreview;
