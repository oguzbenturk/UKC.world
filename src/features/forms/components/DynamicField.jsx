/* eslint-disable complexity */
/**
 * Dynamic Field Component
 * Renders form fields dynamically based on field type
 * Includes validation and conditional logic support
 */

import { useState, useEffect, useRef } from 'react';
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
  Space,
  Row,
  Col,
  Typography,
  Switch,
  Image,
  Slider
} from 'antd';
import { InboxOutlined, PlusOutlined, GlobalOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { FIELD_TYPES } from '../constants/fieldTypes';

const { Paragraph, Title } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;
const { RangePicker } = DatePicker;

/**
 * Build validation rules from field configuration
 */
const buildValidationRules = (field) => {
  const rules = [];

  // Required validation
  if (field.is_required) {
    rules.push({
      required: true,
      message: field.validation_rules?.required_message || `${field.field_label} is required`,
    });
  }

  // Type-specific validations
  switch (field.field_type) {
    case FIELD_TYPES.EMAIL:
      rules.push({
        type: 'email',
        message: 'Please enter a valid email address',
      });
      break;

    case FIELD_TYPES.URL:
      rules.push({
        type: 'url',
        message: 'Please enter a valid URL',
      });
      break;

    case FIELD_TYPES.PHONE:
      rules.push({
        pattern: /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/,
        message: 'Please enter a valid phone number',
      });
      break;

    default:
      break;
  }

  // Custom validation rules from field config
  const validationRules = field.validation_rules || {};

  // Min length
  if (validationRules.min_length) {
    rules.push({
      min: validationRules.min_length,
      message: validationRules.min_message || `Minimum ${validationRules.min_length} characters required`,
    });
  }

  // Max length
  if (validationRules.max_length) {
    rules.push({
      max: validationRules.max_length,
      message: validationRules.max_message || `Maximum ${validationRules.max_length} characters allowed`,
    });
  }

  // Pattern (regex)
  if (validationRules.pattern) {
    rules.push({
      pattern: new RegExp(validationRules.pattern),
      message: validationRules.pattern_message || 'Invalid format',
    });
  }

  return rules;
};

/**
 * Render the input component based on field type
 */
const renderFieldInput = (field, disabled = false, allValues = {}) => {
  const commonProps = {
    placeholder: field.placeholder_text,
    disabled: disabled || field.is_readonly,
  };

  switch (field.field_type) {
    case FIELD_TYPES.TEXT:
      return <Input {...commonProps} />;

    case FIELD_TYPES.EMAIL:
      return <Input type="email" {...commonProps} />;

    case FIELD_TYPES.PHONE:
      return <Input type="tel" {...commonProps} />;

    case FIELD_TYPES.NUMBER:
      return (
        <InputNumber
          {...commonProps}
          min={field.validation_rules?.min}
          max={field.validation_rules?.max}
          step={field.validation_rules?.step || 1}
          className="w-full"
        />
      );

    case FIELD_TYPES.URL:
      return <Input type="url" {...commonProps} />;

    case FIELD_TYPES.SELECT:
      return (
        <Select
          {...commonProps}
          allowClear
          showSearch
          optionFilterProp="label"
          options={field.options?.map(opt => ({
            value: opt.value,
            label: opt.label,
          }))}
          className="w-full"
        />
      );

    case FIELD_TYPES.MULTISELECT:
      return (
        <Select
          {...commonProps}
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          options={field.options?.map(opt => ({
            value: opt.value,
            label: opt.label,
          }))}
          className="w-full"
        />
      );

    case FIELD_TYPES.RADIO:
      return (
        <Radio.Group disabled={commonProps.disabled}>
          <Space direction="vertical">
            {field.options?.map(opt => (
              <Radio key={opt.value} value={opt.value}>
                {opt.label}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      );

    case FIELD_TYPES.CHECKBOX:
      return (
        <Checkbox.Group disabled={commonProps.disabled}>
          <Space direction="vertical">
            {field.options?.map(opt => (
              <Checkbox key={opt.value} value={opt.value}>
                {opt.label}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      );

    case FIELD_TYPES.DATE:
      return (
        <DatePicker
          {...commonProps}
          className="w-full"
          format="YYYY-MM-DD"
        />
      );

    case FIELD_TYPES.DATE_RANGE:
      return (
        <RangePicker
          {...commonProps}
          className="w-full"
          format="YYYY-MM-DD"
        />
      );

    case FIELD_TYPES.TIME:
      return (
        <TimePicker
          {...commonProps}
          className="w-full"
          format="HH:mm"
        />
      );

    case FIELD_TYPES.DATETIME:
      return (
        <DatePicker
          showTime
          {...commonProps}
          className="w-full"
          format="YYYY-MM-DD HH:mm"
        />
      );

    case FIELD_TYPES.TEXTAREA:
      return (
        <TextArea
          rows={field.options?.rows || 4}
          maxLength={field.validation_rules?.max_length}
          showCount={!!field.validation_rules?.max_length}
          {...commonProps}
        />
      );

    case FIELD_TYPES.FILE:
      return (
        <Dragger
          name="file"
          multiple={field.options?.multiple || false}
          accept={field.options?.accept}
          maxCount={field.options?.max_files || 1}
          disabled={commonProps.disabled}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag file to upload</p>
          {field.options?.accept && (
            <p className="ant-upload-hint">Accepted: {field.options.accept}</p>
          )}
        </Dragger>
      );

    case FIELD_TYPES.IMAGE:
      return <ImageUploadField field={field} disabled={commonProps.disabled} />;

    case FIELD_TYPES.TOGGLE:
      return (
        <ToggleField
          field={field}
          disabled={commonProps.disabled}
        />
      );

    case FIELD_TYPES.COUNTRY:
      return <CountryField field={field} disabled={commonProps.disabled} />;

    case FIELD_TYPES.RATING:
      return (
        <Rate
          allowHalf={field.options?.allow_half}
          count={field.options?.max || 5}
          disabled={commonProps.disabled}
        />
      );

    case FIELD_TYPES.SIGNATURE:
      return <SignatureField field={field} disabled={commonProps.disabled} />;

    case FIELD_TYPES.ADDRESS:
      return <AddressField field={field} disabled={commonProps.disabled} />;

    case FIELD_TYPES.CALCULATED:
      return <CalculatedField field={field} allValues={allValues} />;

    case FIELD_TYPES.SLIDER:
      return <SliderField field={field} disabled={commonProps.disabled} />;

    case FIELD_TYPES.CONSENT:
      return <ConsentField field={field} disabled={commonProps.disabled} />;

    case FIELD_TYPES.HIDDEN:
      return <Input type="hidden" />;

    default:
      return <Input {...commonProps} />;
  }
};

/**
 * Signature Field - Canvas-based signature pad
 */
const SignatureField = ({ field, disabled }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const startDrawing = (e) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Get signature as base64
  const getSignatureData = () => {
    if (!hasSignature) return null;
    return canvasRef.current?.toDataURL('image/png');
  };

  // Expose method to parent form
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.getSignatureData = getSignatureData;
    }
  });

  return (
    <div className="signature-field">
      <canvas
        ref={canvasRef}
        width={field.options?.width || 400}
        height={field.options?.height || 150}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{
          border: '1px solid #d9d9d9',
          borderRadius: '6px',
          backgroundColor: disabled ? '#f5f5f5' : '#fff',
          cursor: disabled ? 'not-allowed' : 'crosshair',
          touchAction: 'none',
          width: '100%',
          maxWidth: field.options?.width || 400
        }}
      />
      {!disabled && (
        <div className="mt-2">
          <button
            type="button"
            onClick={clearSignature}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Clear Signature
          </button>
        </div>
      )}
      {field.help_text && (
        <p className="text-gray-500 text-xs mt-1">{field.help_text || 'Sign above'}</p>
      )}
    </div>
  );
};

/**
 * Calculated Field - Auto-computed based on formula
 */
const CalculatedField = ({ field, allValues }) => {
  const [result, setResult] = useState('');

  useEffect(() => {
    const formula = field.options?.formula || '';
    if (!formula) {
      setResult('');
      return;
    }

    try {
      // Simple formula parser: supports +, -, *, / and field references like {field_name}
      let expression = formula;
      
      // Replace field references with values
      const fieldPattern = /\{([^}]+)\}/g;
      expression = expression.replace(fieldPattern, (match, fieldName) => {
        const value = allValues[fieldName];
        if (value === undefined || value === null || value === '') {
          return '0';
        }
        const num = parseFloat(value);
        return isNaN(num) ? '0' : num.toString();
      });

      // Safely evaluate the expression (only allow numbers and math operators)
      if (!/^[\d\s+\-*/.()]+$/.test(expression)) {
        setResult('Invalid formula');
        return;
      }

      // Use Function constructor for safe math evaluation
      const computed = Function(`"use strict"; return (${expression})`)();
      
      // Format result
      const format = field.options?.format || 'number';
      if (format === 'currency') {
        setResult(new Intl.NumberFormat('en-US', { 
          style: 'currency', 
          currency: field.options?.currency || 'EUR' 
        }).format(computed));
      } else if (format === 'percentage') {
        setResult(`${(computed * 100).toFixed(field.options?.decimals || 0)}%`);
      } else {
        setResult(computed.toFixed(field.options?.decimals || 2));
      }
    } catch {
      setResult('Error');
    }
  }, [allValues, field.options]);

  return (
    <div className="calculated-field">
      <div 
        className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-lg font-medium"
        style={{ 
          backgroundColor: field.options?.backgroundColor || '#f5f5f5',
          color: field.options?.textColor || '#333'
        }}
      >
        {result || '—'}
      </div>
      {field.options?.formula && (
        <p className="text-gray-400 text-xs mt-1">
          Formula: {field.options.formula}
        </p>
      )}
    </div>
  );
};

/**
 * Address Field - Composite field with multiple inputs
 */
const AddressField = ({ field, disabled }) => {
  return (
    <div className="space-y-3">
      <Form.Item
        name={[field.field_name, 'street']}
        noStyle
      >
        <Input placeholder="Street Address" disabled={disabled} />
      </Form.Item>
      <Form.Item
        name={[field.field_name, 'street2']}
        noStyle
      >
        <Input placeholder="Apartment, suite, etc. (optional)" disabled={disabled} />
      </Form.Item>
      <Row gutter={12}>
        <Col span={10}>
          <Form.Item name={[field.field_name, 'city']} noStyle>
            <Input placeholder="City" disabled={disabled} />
          </Form.Item>
        </Col>
        <Col span={7}>
          <Form.Item name={[field.field_name, 'state']} noStyle>
            <Input placeholder="State" disabled={disabled} />
          </Form.Item>
        </Col>
        <Col span={7}>
          <Form.Item name={[field.field_name, 'zip']} noStyle>
            <Input placeholder="ZIP Code" disabled={disabled} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name={[field.field_name, 'country']} noStyle>
        <Input placeholder="Country" disabled={disabled} />
      </Form.Item>
    </div>
  );
};

/**
 * Toggle Field - Yes/No switch
 */
const ToggleField = ({ field, disabled }) => {
  return (
    <Space className="toggle-field">
      <Switch 
        disabled={disabled}
        checkedChildren={field.options?.true_label || 'Yes'}
        unCheckedChildren={field.options?.false_label || 'No'}
      />
      {field.help_text && (
        <span className="text-gray-500 text-sm">{field.help_text}</span>
      )}
    </Space>
  );
};

/**
 * Image Upload Field - With preview
 */
const ImageUploadField = ({ field, disabled }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [fileList, setFileList] = useState([]);

  const handlePreview = async (file) => {
    if (!file.url && !file.preview) {
      file.preview = await getBase64(file.originFileObj);
    }
    setPreviewImage(file.url || file.preview);
    setPreviewOpen(true);
  };

  const getBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });

  const handleChange = ({ fileList: newFileList }) => setFileList(newFileList);

  const uploadButton = (
    <div>
      <PlusOutlined />
      <div style={{ marginTop: 8 }}>Upload</div>
    </div>
  );

  return (
    <>
      <Upload
        listType="picture-card"
        fileList={fileList}
        onPreview={handlePreview}
        onChange={handleChange}
        disabled={disabled}
        accept="image/*"
        maxCount={field.options?.max_files || 1}
        beforeUpload={() => false}
      >
        {fileList.length >= (field.options?.max_files || 1) ? null : uploadButton}
      </Upload>
      {previewImage && (
        <Image
          wrapperStyle={{ display: 'none' }}
          preview={{
            visible: previewOpen,
            onVisibleChange: (visible) => setPreviewOpen(visible),
          }}
          src={previewImage}
        />
      )}
    </>
  );
};

/**
 * Country Selector Field - With flags
 */
const COUNTRIES = [
  { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱' },
];

const CountryField = ({ field, disabled }) => {
  const showFlags = field.options?.show_flags !== false;
  
  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      placeholder={field.placeholder_text || 'Select country'}
      optionFilterProp="label"
      className="w-full"
      suffixIcon={<GlobalOutlined />}
      options={COUNTRIES.map(country => ({
        value: country.code,
        label: showFlags ? `${country.flag} ${country.name}` : country.name,
      }))}
      filterOption={(input, option) =>
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      }
    />
  );
};

/**
 * Slider Field - Numeric range slider
 */
const SliderField = ({ field, disabled }) => {
  const [currentValue, setCurrentValue] = useState(field.default_value || field.options?.min || 0);
  const min = field.options?.min || 0;
  const max = field.options?.max || 100;
  const step = field.options?.step || 1;
  const showValue = field.options?.show_value !== false;
  const showMarks = field.options?.show_marks === true;
  const unit = field.options?.unit || '';

  // Generate marks if enabled
  const marks = showMarks ? {
    [min]: `${min}${unit}`,
    [max]: `${max}${unit}`,
  } : undefined;

  return (
    <div className="slider-field">
      <Row gutter={16} align="middle">
        <Col flex="auto">
          <Slider
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            marks={marks}
            tooltip={{ formatter: (value) => `${value}${unit}` }}
            onChange={setCurrentValue}
            value={currentValue}
          />
        </Col>
        {showValue && (
          <Col flex="80px">
            <InputNumber
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              value={currentValue}
              onChange={setCurrentValue}
              style={{ width: '100%' }}
              addonAfter={unit || undefined}
            />
          </Col>
        )}
      </Row>
      {field.help_text && (
        <p className="text-gray-500 text-xs mt-1">{field.help_text}</p>
      )}
    </div>
  );
};

/**
 * Consent Field - Terms acceptance checkbox
 */
const ConsentField = ({ field, disabled }) => {
  const consentText = field.options?.consent_text || 'I agree to the Terms and Conditions';
  const privacyLink = field.options?.privacy_link || '';
  const termsLink = field.options?.terms_link || '';

  // Build the label with optional links
  const renderLabel = () => {
    // If there are links, render them inline
    if (termsLink || privacyLink) {
      return (
        <span className="consent-label">
          {consentText}
          {(termsLink || privacyLink) && (
            <span className="consent-links ml-1">
              {termsLink && (
                <a 
                  href={termsLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms
                </a>
              )}
              {termsLink && privacyLink && ' & '}
              {privacyLink && (
                <a 
                  href={privacyLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
              )}
            </span>
          )}
        </span>
      );
    }
    
    return consentText;
  };

  return (
    <div className="consent-field">
      <Checkbox disabled={disabled}>
        <span className="flex items-start gap-2">
          <SafetyCertificateOutlined className="text-green-600 mt-1" />
          <span>{renderLabel()}</span>
        </span>
      </Checkbox>
    </div>
  );
};

/**
 * Get column span based on field width setting
 */
const getColSpan = (width) => {
  const widthMap = {
    'full': 24,
    'half': 12,
    'third': 8,
    'quarter': 6,
    'two-thirds': 16,
  };
  return widthMap[width] || 24;
};

/**
 * Main Dynamic Field Component
 */
const DynamicField = ({ 
  field, 
  form: _form,
  allValues = {},
  disabled = false,
  showLabel = true 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  // Evaluate conditional logic
  useEffect(() => {
    if (!field.conditional_logic?.conditions?.length) {
      setIsVisible(true);
      return;
    }

    const { conditions, action } = field.conditional_logic;
    let conditionsMet = true;

    for (const condition of conditions) {
      const fieldValue = allValues[condition.field];
      let matches = false;

      switch (condition.operator) {
        case 'equals':
          matches = fieldValue === condition.value;
          break;
        case 'not_equals':
          matches = fieldValue !== condition.value;
          break;
        case 'contains':
          matches = String(fieldValue || '').includes(condition.value);
          break;
        case 'not_contains':
          matches = !String(fieldValue || '').includes(condition.value);
          break;
        case 'greater_than':
          matches = Number(fieldValue) > Number(condition.value);
          break;
        case 'less_than':
          matches = Number(fieldValue) < Number(condition.value);
          break;
        case 'is_empty':
          matches = !fieldValue || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
          break;
        case 'is_not_empty':
          matches = !!fieldValue && fieldValue !== '' && (!Array.isArray(fieldValue) || fieldValue.length > 0);
          break;
        default:
          matches = true;
      }

      if (!matches) {
        conditionsMet = false;
        break;
      }
    }

    // Apply action based on conditions
    if (action === 'show') {
      setIsVisible(conditionsMet);
    } else if (action === 'hide') {
      setIsVisible(!conditionsMet);
    }
  }, [field.conditional_logic, allValues]);

  // Layout fields render differently
  if (field.field_type === FIELD_TYPES.SECTION_HEADER) {
    if (!isVisible) return null;
    return (
      <Col span={24}>
        <Title level={4} className="mt-4 mb-2">
          {field.field_label}
        </Title>
        {field.help_text && (
          <Paragraph type="secondary" className="mb-4">
            {field.help_text}
          </Paragraph>
        )}
      </Col>
    );
  }

  if (field.field_type === FIELD_TYPES.PARAGRAPH) {
    if (!isVisible) return null;
    return (
      <Col span={24}>
        <Paragraph type="secondary" className="my-3">
          {field.default_value || field.help_text}
        </Paragraph>
      </Col>
    );
  }

  // Hidden fields
  if (field.field_type === FIELD_TYPES.HIDDEN) {
    return (
      <Form.Item
        name={field.field_name}
        initialValue={field.default_value}
        hidden
      >
        <Input type="hidden" />
      </Form.Item>
    );
  }

  // Don't render if not visible
  if (!isVisible) return null;

  const colSpan = getColSpan(field.width);
  const rules = buildValidationRules(field);

  return (
    <Col span={colSpan}>
      <Form.Item
        name={field.field_name}
        label={showLabel ? field.field_label : undefined}
        rules={rules}
        extra={field.help_text}
        initialValue={field.default_value}
        valuePropName={[FIELD_TYPES.CHECKBOX, FIELD_TYPES.TOGGLE, FIELD_TYPES.CONSENT].includes(field.field_type) ? 'checked' : 'value'}
      >
        {renderFieldInput(field, disabled, allValues)}
      </Form.Item>
    </Col>
  );
};

export default DynamicField;
