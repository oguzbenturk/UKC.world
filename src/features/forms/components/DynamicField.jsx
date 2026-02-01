/* eslint-disable complexity */
/**
 * Dynamic Field Component
 * Renders form fields dynamically based on field type
 * Includes validation and conditional logic support
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
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

  // Pattern
  if (validationRules.pattern) {
    rules.push({
      pattern: validationRules.pattern,
      message: validationRules.pattern_message || 'Invalid format',
    });
  }

  return rules;
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
const ToggleField = ({ field, disabled, value, onChange }) => {
  return (
    <Space className="toggle-field">
      <Switch 
        disabled={disabled}
        checked={value}
        onChange={onChange}
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
 * File Upload Field - Uploads files to server for public forms
 * Uses /api/upload/form-submission endpoint (public, rate-limited)
 */
const FileUploadField = ({ field, disabled, value, onChange }) => {
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Initialize from value prop
  useEffect(() => {
    if (value && Array.isArray(value) && value.length > 0 && fileList.length === 0) {
      setFileList(value.map(f => ({
        ...f,
        status: 'done',
        url: f.url
      })));
    }
  }, [value, fileList.length]);

  const customUpload = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const response = await fetch('/api/upload/form-submission', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      onSuccess(result, file);
    } catch (error) {
      console.error('File upload error:', error);
      onError(error);
    } finally {
      setUploading(false);
    }
  };

  const handleChange = ({ fileList: newFileList }) => {
    setFileList(newFileList);
    
    // Pass to form with uploaded file info
    if (onChange) {
      const fileData = newFileList
        .filter(f => f.status === 'done' && (f.response?.url || f.url))
        .map(f => ({
          uid: f.uid,
          name: f.name,
          type: f.type,
          size: f.size,
          url: f.response?.url || f.url,
          status: 'done'
        }));
      onChange(fileData);
    }
  };

  // Determine accepted file types
  const acceptTypes = field.options?.accept || 'image/*,.pdf,.doc,.docx';

  return (
    <div>
      <Dragger
        name="file"
        multiple={field.options?.multiple || false}
        accept={acceptTypes}
        maxCount={field.options?.max_files || 1}
        disabled={disabled || uploading}
        fileList={fileList}
        onChange={handleChange}
        customRequest={customUpload}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          {uploading ? 'Uploading...' : 'Click or drag file to upload'}
        </p>
        <p className="ant-upload-hint">
          {acceptTypes.includes('pdf') 
            ? 'Accepted: Images, PDF, Word documents' 
            : `Accepted: ${acceptTypes}`}
        </p>
      </Dragger>
      {field.help_text && (
        <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
          {field.help_text}
        </div>
      )}
    </div>
  );
};

/**
 * Image Upload Field - With preview (Professional styling)
 * Uploads images to server using /api/upload/form-submission endpoint
 */
const ImageUploadField = ({ field, disabled, value, onChange }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Initialize from value prop
  useEffect(() => {
    if (value && Array.isArray(value) && value.length > 0 && fileList.length === 0) {
      setFileList(value.map(f => ({
        ...f,
        status: 'done',
        url: f.url
      })));
    }
  }, [value, fileList.length]);

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

  const customUpload = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const response = await fetch('/api/upload/form-submission', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      onSuccess(result, file);
    } catch (error) {
      console.error('Image upload error:', error);
      onError(error);
    } finally {
      setUploading(false);
    }
  };

  const handleChange = async ({ fileList: newFileList }) => {
    // For preview, add base64 if not already present
    const processedList = await Promise.all(
      newFileList.map(async (file) => {
        if (file.originFileObj && !file.preview && file.status !== 'done') {
          try {
            file.preview = await getBase64(file.originFileObj);
          } catch {
            // Ignore errors
          }
        }
        return file;
      })
    );
    
    setFileList(processedList);
    
    // Pass to form with uploaded file info (only completed uploads)
    if (onChange) {
      const fileData = processedList
        .filter(f => f.status === 'done' && (f.response?.url || f.url))
        .map(f => ({
          uid: f.uid,
          name: f.name,
          type: f.type,
          size: f.size,
          url: f.response?.url || f.url,
          status: 'done'
        }));
      onChange(fileData);
    }
  };

  const uploadButton = (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      color: '#718096'
    }}>
      <div style={{ 
        width: 64, 
        height: 64, 
        borderRadius: '50%', 
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        border: '2px dashed #90cdf4'
      }}>
        <PlusOutlined style={{ fontSize: 24, color: '#0077b6' }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#2d3748' }}>
        {uploading ? 'Uploading...' : (field.placeholder_text || 'Click to upload photo')}
      </div>
      <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 4 }}>
        JPG, PNG or WebP
      </div>
    </div>
  );

  return (
    <div>
      <Upload
        listType="picture-card"
        fileList={fileList}
        onPreview={handlePreview}
        onChange={handleChange}
        customRequest={customUpload}
        disabled={disabled || uploading}
        accept="image/*"
        maxCount={field.options?.max_files || 1}
        className="professional-image-upload"
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
      {field.help_text && (
        <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
          {field.help_text}
        </div>
      )}
    </div>
  );
};

/**
 * Country Selector Field - With flags
 */
const COUNTRIES = [
  // Comprehensive country list with ISO code, name, flag, and phone code
    { code: 'AF', name: 'Afghanistan', flag: '🇦🇫', phone: '+93' },
    { code: 'AL', name: 'Albania', flag: '🇦🇱', phone: '+355' },
    { code: 'DZ', name: 'Algeria', flag: '🇩🇿', phone: '+213' },
    { code: 'AS', name: 'American Samoa', flag: '🇦🇸', phone: '+1-684' },
    { code: 'AD', name: 'Andorra', flag: '🇦🇩', phone: '+376' },
    { code: 'AO', name: 'Angola', flag: '🇦🇴', phone: '+244' },
    { code: 'AI', name: 'Anguilla', flag: '🇦🇮', phone: '+1-264' },
    { code: 'AQ', name: 'Antarctica', flag: '🇦🇶', phone: '' },
    { code: 'AG', name: 'Antigua and Barbuda', flag: '🇦🇬', phone: '+1-268' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷', phone: '+54' },
    { code: 'AM', name: 'Armenia', flag: '🇦🇲', phone: '+374' },
    { code: 'AW', name: 'Aruba', flag: '🇦🇼', phone: '+297' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺', phone: '+61' },
    { code: 'AT', name: 'Austria', flag: '🇦🇹', phone: '+43' },
    { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿', phone: '+994' },
    { code: 'BS', name: 'Bahamas', flag: '🇧🇸', phone: '+1-242' },
    { code: 'BH', name: 'Bahrain', flag: '🇧🇭', phone: '+973' },
    { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', phone: '+880' },
    { code: 'BB', name: 'Barbados', flag: '🇧🇧', phone: '+1-246' },
    { code: 'BY', name: 'Belarus', flag: '🇧🇾', phone: '+375' },
    { code: 'BE', name: 'Belgium', flag: '🇧🇪', phone: '+32' },
    { code: 'BZ', name: 'Belize', flag: '🇧🇿', phone: '+501' },
    { code: 'BJ', name: 'Benin', flag: '🇧🇯', phone: '+229' },
    { code: 'BM', name: 'Bermuda', flag: '🇧🇲', phone: '+1-441' },
    { code: 'BT', name: 'Bhutan', flag: '🇧🇹', phone: '+975' },
    { code: 'BO', name: 'Bolivia', flag: '🇧🇴', phone: '+591' },
    { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦', phone: '+387' },
    { code: 'BW', name: 'Botswana', flag: '🇧🇼', phone: '+267' },
    { code: 'BR', name: 'Brazil', flag: '🇧🇷', phone: '+55' },
    { code: 'IO', name: 'British Indian Ocean Territory', flag: '🇮🇴', phone: '+246' },
    { code: 'BN', name: 'Brunei', flag: '🇧🇳', phone: '+673' },
    { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', phone: '+359' },
    { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', phone: '+226' },
    { code: 'BI', name: 'Burundi', flag: '🇧🇮', phone: '+257' },
    { code: 'KH', name: 'Cambodia', flag: '🇰🇭', phone: '+855' },
    { code: 'CM', name: 'Cameroon', flag: '🇨🇲', phone: '+237' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦', phone: '+1' },
    { code: 'CV', name: 'Cape Verde', flag: '🇨🇻', phone: '+238' },
    { code: 'KY', name: 'Cayman Islands', flag: '🇰🇾', phone: '+1-345' },
    { code: 'CF', name: 'Central African Republic', flag: '🇨🇫', phone: '+236' },
    { code: 'TD', name: 'Chad', flag: '🇹🇩', phone: '+235' },
    { code: 'CL', name: 'Chile', flag: '🇨🇱', phone: '+56' },
    { code: 'CN', name: 'China', flag: '🇨🇳', phone: '+86' },
    { code: 'CX', name: 'Christmas Island', flag: '🇨🇽', phone: '+61' },
    { code: 'CC', name: 'Cocos Islands', flag: '🇨🇨', phone: '+61' },
    { code: 'CO', name: 'Colombia', flag: '🇨🇴', phone: '+57' },
    { code: 'KM', name: 'Comoros', flag: '🇰🇲', phone: '+269' },
    { code: 'CG', name: 'Congo', flag: '🇨🇬', phone: '+242' },
    { code: 'CD', name: 'Congo (DRC)', flag: '🇨🇩', phone: '+243' },
    { code: 'CK', name: 'Cook Islands', flag: '🇨🇰', phone: '+682' },
    { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', phone: '+506' },
    { code: 'CI', name: 'Côte d’Ivoire', flag: '🇨🇮', phone: '+225' },
    { code: 'HR', name: 'Croatia', flag: '🇭🇷', phone: '+385' },
    { code: 'CU', name: 'Cuba', flag: '🇨🇺', phone: '+53' },
    { code: 'CY', name: 'Cyprus', flag: '🇨🇾', phone: '+357' },
    { code: 'CZ', name: 'Czechia', flag: '🇨🇿', phone: '+420' },
    { code: 'DK', name: 'Denmark', flag: '🇩🇰', phone: '+45' },
    { code: 'DJ', name: 'Djibouti', flag: '🇩🇯', phone: '+253' },
    { code: 'DM', name: 'Dominica', flag: '🇩🇲', phone: '+1-767' },
    { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴', phone: '+1-809' },
    { code: 'EC', name: 'Ecuador', flag: '🇪🇨', phone: '+593' },
    { code: 'EG', name: 'Egypt', flag: '🇪🇬', phone: '+20' },
    { code: 'SV', name: 'El Salvador', flag: '🇸🇻', phone: '+503' },
    { code: 'GQ', name: 'Equatorial Guinea', flag: '🇬🇶', phone: '+240' },
    { code: 'ER', name: 'Eritrea', flag: '🇪🇷', phone: '+291' },
    { code: 'EE', name: 'Estonia', flag: '🇪🇪', phone: '+372' },
    { code: 'SZ', name: 'Eswatini', flag: '🇸🇿', phone: '+268' },
    { code: 'ET', name: 'Ethiopia', flag: '🇪🇹', phone: '+251' },
    { code: 'FJ', name: 'Fiji', flag: '🇫🇯', phone: '+679' },
    { code: 'FI', name: 'Finland', flag: '🇫🇮', phone: '+358' },
    { code: 'FR', name: 'France', flag: '🇫🇷', phone: '+33' },
    { code: 'GA', name: 'Gabon', flag: '🇬🇦', phone: '+241' },
    { code: 'GM', name: 'Gambia', flag: '🇬🇲', phone: '+220' },
    { code: 'GE', name: 'Georgia', flag: '🇬🇪', phone: '+995' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪', phone: '+49' },
    { code: 'GH', name: 'Ghana', flag: '🇬🇭', phone: '+233' },
    { code: 'GR', name: 'Greece', flag: '🇬🇷', phone: '+30' },
    { code: 'GD', name: 'Grenada', flag: '🇬🇩', phone: '+1-473' },
    { code: 'GT', name: 'Guatemala', flag: '🇬🇹', phone: '+502' },
    { code: 'GN', name: 'Guinea', flag: '🇬🇳', phone: '+224' },
    { code: 'GW', name: 'Guinea-Bissau', flag: '🇬🇼', phone: '+245' },
    { code: 'GY', name: 'Guyana', flag: '🇬🇾', phone: '+592' },
    { code: 'HT', name: 'Haiti', flag: '🇭🇹', phone: '+509' },
    { code: 'HN', name: 'Honduras', flag: '🇭🇳', phone: '+504' },
    { code: 'HK', name: 'Hong Kong', flag: '🇭🇰', phone: '+852' },
    { code: 'HU', name: 'Hungary', flag: '🇭🇺', phone: '+36' },
    { code: 'IS', name: 'Iceland', flag: '🇮🇸', phone: '+354' },
    { code: 'IN', name: 'India', flag: '🇮🇳', phone: '+91' },
    { code: 'ID', name: 'Indonesia', flag: '🇮🇩', phone: '+62' },
    { code: 'IR', name: 'Iran', flag: '🇮🇷', phone: '+98' },
    { code: 'IQ', name: 'Iraq', flag: '🇮🇶', phone: '+964' },
    { code: 'IE', name: 'Ireland', flag: '🇮🇪', phone: '+353' },
    { code: 'IL', name: 'Israel', flag: '🇮🇱', phone: '+972' },
    { code: 'IT', name: 'Italy', flag: '🇮🇹', phone: '+39' },
    { code: 'JM', name: 'Jamaica', flag: '🇯🇲', phone: '+1-876' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵', phone: '+81' },
    { code: 'JO', name: 'Jordan', flag: '🇯🇴', phone: '+962' },
    { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿', phone: '+7' },
    { code: 'KE', name: 'Kenya', flag: '🇰🇪', phone: '+254' },
    { code: 'KI', name: 'Kiribati', flag: '🇰🇮', phone: '+686' },
    { code: 'KW', name: 'Kuwait', flag: '🇰🇼', phone: '+965' },
    { code: 'KG', name: 'Kyrgyzstan', flag: '🇰🇬', phone: '+996' },
    { code: 'LA', name: 'Laos', flag: '🇱🇦', phone: '+856' },
    { code: 'LV', name: 'Latvia', flag: '🇱🇻', phone: '+371' },
    { code: 'LB', name: 'Lebanon', flag: '🇱🇧', phone: '+961' },
    { code: 'LS', name: 'Lesotho', flag: '🇱🇸', phone: '+266' },
    { code: 'LR', name: 'Liberia', flag: '🇱🇷', phone: '+231' },
    { code: 'LY', name: 'Libya', flag: '🇱🇾', phone: '+218' },
    { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮', phone: '+423' },
    { code: 'LT', name: 'Lithuania', flag: '🇱🇹', phone: '+370' },
    { code: 'LU', name: 'Luxembourg', flag: '🇱🇺', phone: '+352' },
    { code: 'MO', name: 'Macao', flag: '🇲🇴', phone: '+853' },
    { code: 'MG', name: 'Madagascar', flag: '🇲🇬', phone: '+261' },
    { code: 'MW', name: 'Malawi', flag: '🇲🇼', phone: '+265' },
    { code: 'MY', name: 'Malaysia', flag: '🇲🇾', phone: '+60' },
    { code: 'MV', name: 'Maldives', flag: '🇲🇻', phone: '+960' },
    { code: 'ML', name: 'Mali', flag: '🇲🇱', phone: '+223' },
    { code: 'MT', name: 'Malta', flag: '🇲🇹', phone: '+356' },
    { code: 'MH', name: 'Marshall Islands', flag: '🇲🇭', phone: '+692' },
    { code: 'MR', name: 'Mauritania', flag: '🇲🇷', phone: '+222' },
    { code: 'MU', name: 'Mauritius', flag: '🇲🇺', phone: '+230' },
    { code: 'MX', name: 'Mexico', flag: '🇲🇽', phone: '+52' },
    { code: 'FM', name: 'Micronesia', flag: '🇫🇲', phone: '+691' },
    { code: 'MD', name: 'Moldova', flag: '🇲🇩', phone: '+373' },
    { code: 'MC', name: 'Monaco', flag: '🇲🇨', phone: '+377' },
    { code: 'MN', name: 'Mongolia', flag: '🇲🇳', phone: '+976' },
    { code: 'ME', name: 'Montenegro', flag: '🇲🇪', phone: '+382' },
    { code: 'MS', name: 'Montserrat', flag: '🇲🇸', phone: '+1-664' },
    { code: 'MA', name: 'Morocco', flag: '🇲🇦', phone: '+212' },
    { code: 'MZ', name: 'Mozambique', flag: '🇲🇿', phone: '+258' },
    { code: 'MM', name: 'Myanmar', flag: '🇲🇲', phone: '+95' },
    { code: 'NA', name: 'Namibia', flag: '🇳🇦', phone: '+264' },
    { code: 'NR', name: 'Nauru', flag: '🇳🇷', phone: '+674' },
    { code: 'NP', name: 'Nepal', flag: '🇳🇵', phone: '+977' },
    { code: 'NL', name: 'Netherlands', flag: '🇳🇱', phone: '+31' },
    { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', phone: '+64' },
    { code: 'NI', name: 'Nicaragua', flag: '🇳🇮', phone: '+505' },
    { code: 'NE', name: 'Niger', flag: '🇳🇪', phone: '+227' },
    { code: 'NG', name: 'Nigeria', flag: '🇳🇬', phone: '+234' },
    { code: 'NU', name: 'Niue', flag: '🇳🇺', phone: '+683' },
    { code: 'NF', name: 'Norfolk Island', flag: '🇳🇫', phone: '+672' },
    { code: 'KP', name: 'North Korea', flag: '🇰🇵', phone: '+850' },
    { code: 'MK', name: 'North Macedonia', flag: '🇲🇰', phone: '+389' },
    { code: 'NO', name: 'Norway', flag: '🇳🇴', phone: '+47' },
    { code: 'OM', name: 'Oman', flag: '🇴🇲', phone: '+968' },
    { code: 'PK', name: 'Pakistan', flag: '🇵🇰', phone: '+92' },
    { code: 'PW', name: 'Palau', flag: '🇵🇼', phone: '+680' },
    { code: 'PS', name: 'Palestine', flag: '🇵🇸', phone: '+970' },
    { code: 'PA', name: 'Panama', flag: '🇵🇦', phone: '+507' },
    { code: 'PG', name: 'Papua New Guinea', flag: '🇵🇬', phone: '+675' },
    { code: 'PY', name: 'Paraguay', flag: '🇵🇾', phone: '+595' },
    { code: 'PE', name: 'Peru', flag: '🇵🇪', phone: '+51' },
    { code: 'PH', name: 'Philippines', flag: '🇵🇭', phone: '+63' },
    { code: 'PL', name: 'Poland', flag: '🇵🇱', phone: '+48' },
    { code: 'PT', name: 'Portugal', flag: '🇵🇹', phone: '+351' },
    { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷', phone: '+1-787' },
    { code: 'QA', name: 'Qatar', flag: '🇶🇦', phone: '+974' },
    { code: 'RO', name: 'Romania', flag: '🇷🇴', phone: '+40' },
    { code: 'RU', name: 'Russia', flag: '🇷🇺', phone: '+7' },
    { code: 'RW', name: 'Rwanda', flag: '🇷🇼', phone: '+250' },
    { code: 'KN', name: 'Saint Kitts and Nevis', flag: '🇰🇳', phone: '+1-869' },
    { code: 'LC', name: 'Saint Lucia', flag: '🇱🇨', phone: '+1-758' },
    { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨', phone: '+1-784' },
    { code: 'WS', name: 'Samoa', flag: '🇼🇸', phone: '+685' },
    { code: 'SM', name: 'San Marino', flag: '🇸🇲', phone: '+378' },
    { code: 'ST', name: 'Sao Tome and Principe', flag: '🇸🇹', phone: '+239' },
    { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', phone: '+966' },
    { code: 'SN', name: 'Senegal', flag: '🇸🇳', phone: '+221' },
    { code: 'RS', name: 'Serbia', flag: '🇷🇸', phone: '+381' },
    { code: 'SC', name: 'Seychelles', flag: '🇸🇨', phone: '+248' },
    { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱', phone: '+232' },
    { code: 'SG', name: 'Singapore', flag: '🇸🇬', phone: '+65' },
    { code: 'SK', name: 'Slovakia', flag: '🇸🇰', phone: '+421' },
    { code: 'SI', name: 'Slovenia', flag: '🇸🇮', phone: '+386' },
    { code: 'SB', name: 'Solomon Islands', flag: '🇸🇧', phone: '+677' },
    { code: 'SO', name: 'Somalia', flag: '🇸🇴', phone: '+252' },
    { code: 'ZA', name: 'South Africa', flag: '🇿🇦', phone: '+27' },
    { code: 'KR', name: 'South Korea', flag: '🇰🇷', phone: '+82' },
    { code: 'SS', name: 'South Sudan', flag: '🇸🇸', phone: '+211' },
    { code: 'ES', name: 'Spain', flag: '🇪🇸', phone: '+34' },
    { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', phone: '+94' },
    { code: 'SD', name: 'Sudan', flag: '🇸🇩', phone: '+249' },
    { code: 'SR', name: 'Suriname', flag: '🇸🇷', phone: '+597' },
    { code: 'SE', name: 'Sweden', flag: '🇸🇪', phone: '+46' },
    { code: 'CH', name: 'Switzerland', flag: '🇨🇭', phone: '+41' },
    { code: 'SY', name: 'Syria', flag: '🇸🇾', phone: '+963' },
    { code: 'TW', name: 'Taiwan', flag: '🇹🇼', phone: '+886' },
    { code: 'TJ', name: 'Tajikistan', flag: '🇹🇯', phone: '+992' },
    { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', phone: '+255' },
    { code: 'TH', name: 'Thailand', flag: '🇹🇭', phone: '+66' },
    { code: 'TL', name: 'Timor-Leste', flag: '🇹🇱', phone: '+670' },
    { code: 'TG', name: 'Togo', flag: '🇹🇬', phone: '+228' },
    { code: 'TO', name: 'Tonga', flag: '🇹🇴', phone: '+676' },
    { code: 'TT', name: 'Trinidad and Tobago', flag: '🇹🇹', phone: '+1-868' },
    { code: 'TN', name: 'Tunisia', flag: '🇹🇳', phone: '+216' },
    { code: 'TR', name: 'Turkey', flag: '🇹🇷', phone: '+90' },
    { code: 'TM', name: 'Turkmenistan', flag: '🇹🇲', phone: '+993' },
    { code: 'TC', name: 'Turks and Caicos Islands', flag: '🇹🇨', phone: '+1-649' },
    { code: 'TV', name: 'Tuvalu', flag: '🇹🇻', phone: '+688' },
    { code: 'UG', name: 'Uganda', flag: '🇺🇬', phone: '+256' },
    { code: 'UA', name: 'Ukraine', flag: '🇺🇦', phone: '+380' },
    { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', phone: '+971' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', phone: '+44' },
    { code: 'US', name: 'United States', flag: '🇺🇸', phone: '+1' },
    { code: 'UY', name: 'Uruguay', flag: '🇺🇾', phone: '+598' },
    { code: 'UZ', name: 'Uzbekistan', flag: '🇺🇿', phone: '+998' },
    { code: 'VU', name: 'Vanuatu', flag: '🇻🇺', phone: '+678' },
    { code: 'VA', name: 'Vatican City', flag: '🇻🇦', phone: '+39' },
    { code: 'VE', name: 'Venezuela', flag: '🇻🇪', phone: '+58' },
    { code: 'VN', name: 'Vietnam', flag: '🇻🇳', phone: '+84' },
    { code: 'VI', name: 'Virgin Islands (U.S.)', flag: '🇻🇮', phone: '+1-340' },
    { code: 'YE', name: 'Yemen', flag: '🇾🇪', phone: '+967' },
    { code: 'ZM', name: 'Zambia', flag: '🇿🇲', phone: '+260' },
    { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', phone: '+263' },
  ];

/**
 * Helper to render input for each field type
 */
function renderFieldInput(field, disabled, allValues) {
  // Check if this is a nationality field - be more comprehensive
  const fieldNameLower = field.field_name?.toLowerCase() || '';
  const fieldLabelLower = field.field_label?.toLowerCase() || '';
  const isNationality = fieldNameLower.includes('nationality') || 
                        fieldLabelLower.includes('nationality') ||
                        fieldNameLower.includes('citizen') ||
                        fieldLabelLower.includes('citizen');
  
  // Debug logging
  if (fieldNameLower.includes('nationality') || fieldLabelLower.includes('nationality')) {
    console.log('🔍 Nationality field detected:', {
      field_name: field.field_name,
      field_label: field.field_label,
      field_type: field.field_type,
      isNationality,
      hasOptions: !!field.options,
      optionsCount: field.options?.length
    });
  }

  // COUNTRY or NATIONALITY use the comprehensive COUNTRIES list
  if (field.field_type === FIELD_TYPES.COUNTRY || isNationality) {
    return (
      <Select
        showSearch
        allowClear
        disabled={disabled}
        placeholder={field.placeholder_text || (isNationality ? 'Select your nationality' : 'Select country')}
        optionFilterProp="label"
        className="w-full"
        suffixIcon={<GlobalOutlined />}
        dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
        virtual
        options={COUNTRIES.map(country => ({
          value: country.name,
          label: `${country.flag} ${country.name}`,
        }))}
        filterOption={(input, option) =>
          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
        }
      />
    );
  }

  // Select and Multi-select fields
  if (field.field_type === FIELD_TYPES.SELECT || field.field_type === FIELD_TYPES.MULTISELECT) {
    // If this is a nationality field, override options with COUNTRIES
    const options = isNationality ? COUNTRIES.map(c => ({ value: c.name, label: `${c.flag} ${c.name}` })) : (field.options || []);
    
    // Log when dropdown opens
    const handleDropdownOpen = (open) => {
      if (open) {
        console.log('🔍 SELECT dropdown opened:', {
          field_name: field.field_name,
          field_label: field.field_label,
          field_type: field.field_type,
          isNationality,
          hasOptions: !!field.options,
          originalOptionsCount: field.options?.length,
          finalOptionsCount: options.length,
          firstOriginalOptions: field.options?.slice(0, 3),
          firstFinalOptions: options.slice(0, 3)
        });
      }
    };

    return (
      <Select
        showSearch
        allowClear
        disabled={disabled}
        placeholder={field.placeholder_text || 'Select'}
        optionFilterProp="label"
        className="w-full"
        virtual
        mode={field.field_type === FIELD_TYPES.MULTISELECT ? 'multiple' : undefined}
        options={options.map(o => ({ value: o.value ?? o.label ?? o, label: o.label ?? o.value ?? o }))}
        filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
        onDropdownVisibleChange={handleDropdownOpen}
      />
    );
  }

  // Choice fields (radio / checkbox)
  if (field.field_type === FIELD_TYPES.RADIO || field.field_type === FIELD_TYPES.CHECKBOX) {
    const opts = (field.options || []).map(o => ({ label: o.label ?? o.value ?? o, value: o.value ?? o.label ?? o }));
    if (field.field_type === FIELD_TYPES.RADIO) return <Radio.Group disabled={disabled}>{opts.map(o => <Radio key={o.value} value={o.value}>{o.label}</Radio>)}</Radio.Group>;
    return <Checkbox.Group disabled={disabled} options={opts} />;
  }

  // Text-based inputs
  if (field.field_type === FIELD_TYPES.TEXT || field.field_type === FIELD_TYPES.EMAIL || field.field_type === FIELD_TYPES.PHONE || field.field_type === FIELD_TYPES.NUMBER) {
    const inputType = field.field_type === FIELD_TYPES.EMAIL ? 'email' : (field.field_type === FIELD_TYPES.PHONE ? 'tel' : (field.field_type === FIELD_TYPES.NUMBER ? 'number' : 'text'));
    return <Input type={inputType} placeholder={field.placeholder_text} disabled={disabled} />;
  }

  if (field.field_type === FIELD_TYPES.TEXTAREA) {
    return <TextArea rows={4} placeholder={field.placeholder_text} disabled={disabled} />;
  }

  // Date/time
  if (field.field_type === FIELD_TYPES.DATE) return <DatePicker className="w-full" disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.TIME) return <TimePicker className="w-full" disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.DATETIME) return <DatePicker showTime className="w-full" disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.DATE_RANGE) return <RangePicker className="w-full" disabled={disabled} />;

  // File / Image
  if (field.field_type === FIELD_TYPES.FILE || field.field_type === FIELD_TYPES.FILE_UPLOAD) {
    return <FileUploadField field={field} disabled={disabled} />;
  }
  if (field.field_type === FIELD_TYPES.IMAGE) {
    return <ImageUploadField field={field} disabled={disabled} />;
  }

  // Toggle / Consent / Slider / Rating / Signature / Address / Calculated
  if (field.field_type === FIELD_TYPES.TOGGLE) return <ToggleField field={field} disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.CONSENT) return <ConsentField field={field} disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.SLIDER) return <SliderField field={field} disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.RATING) return <Rate allowHalf={field.options?.allow_half} count={field.options?.max || 5} disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.SIGNATURE) return <SignatureField field={field} disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.ADDRESS) return <AddressField field={field} disabled={disabled} />;
  if (field.field_type === FIELD_TYPES.CALCULATED) return <CalculatedField field={field} allValues={allValues} />;

  // Default - simple input
  return <Input placeholder={field.placeholder_text} disabled={disabled} />;
}

const CountryField = ({ field, disabled, value, onChange }) => {
  const showFlags = field.options?.show_flags !== false;
  
  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      value={value}
      onChange={onChange}
      placeholder={field.placeholder_text || 'Select country'}
      optionFilterProp="label"
      className="w-full"
      suffixIcon={<GlobalOutlined />}
      dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
      virtual
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
 * Consent Field - Terms acceptance checkbox (Professional styling)
 * Note: When used with Form.Item valuePropName="checked", 
 * Ant Design passes the value as "checked" prop
 */
const ConsentField = ({ field, disabled, value, onChange, checked }) => {
  // Support both 'value' and 'checked' props (for compatibility with Form.Item valuePropName)
  const isChecked = checked !== undefined ? checked : value;
  // Get consent text from options.consent_text, options[0].label, or fallback
  const consentText = field.options?.consent_text 
    || (Array.isArray(field.options) && field.options[0]?.label)
    || 'I agree to the Terms and Conditions';
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
    <div className="consent-field-wrapper">
      <Checkbox 
        disabled={disabled} 
        checked={isChecked} 
        onChange={(e) => onChange?.(e.target.checked)}
        className="consent-checkbox"
      >
        <span className="consent-text">{renderLabel()}</span>
      </Checkbox>
    </div>
  );
};

/**
 * Get column span based on field width setting
 * Returns responsive props for Ant Design Col component
 * Mobile (xs): quarter/third → half, half stays half, full stays full
 * Tablet (sm): minimum half width for better layout
 * Desktop (md+): use specified width
 */
const getColProps = (width) => {
  const baseSpan = {
    'full': 24,
    'half': 12,
    'third': 8,
    'quarter': 6,
    'two-thirds': 16,
  }[width] || 24;

  return {
    xs: baseSpan === 6 || baseSpan === 8 ? 12 : baseSpan, // Portrait phones: quarter/third → half
    sm: Math.max(baseSpan, 12), // Landscape phones & tablets: minimum half-width
    md: baseSpan, // Desktop: use specified width
  };
};

/**
 * Main Dynamic Field Component
 * Memoized for performance optimization
 */
const DynamicField = React.memo(({ 
  field, 
  form: _form,
  allValues = {},
  disabled = false,
  showLabel = true,
  skipColWrapper = false  // Allow parent to handle Col wrapper
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

  // Helper to conditionally wrap content in Col
  const wrapInCol = (content, span = 24) => {
    if (skipColWrapper) return content;
    return <Col span={span}>{content}</Col>;
  };

  // Layout fields render differently
  if (field.field_type === FIELD_TYPES.SECTION_HEADER) {
    if (!isVisible) return null;
    const htmlContent = field.default_value || field.help_text;
    const colProps = getColProps(field.width);
    const content = (
      <div className="form-section-header">
        <Title level={4} className="mt-4 mb-2">
          {field.field_label}
        </Title>
        {htmlContent && (
          <div 
            className="section-header-content"
            style={{ marginTop: -4, color: 'rgba(0, 0, 0, 0.45)' }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </div>
    );
    if (skipColWrapper) return content;
    return <Col {...colProps}>{content}</Col>;
  }

  if (field.field_type === FIELD_TYPES.PARAGRAPH) {
    if (!isVisible) return null;
    const htmlContent = field.default_value || field.help_text;
    const colProps = getColProps(field.width);
    const content = (
      <div 
        className="my-3 paragraph-field-content"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    );
    if (skipColWrapper) return content;
    return <Col {...colProps}>{content}</Col>;
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

  const colProps = getColProps(field.width);
  const rules = buildValidationRules(field);

  const formItem = (
    <Form.Item
      name={field.field_name}
      label={showLabel ? field.field_label : undefined}
      rules={rules}
      extra={field.help_text}
      initialValue={field.default_value}
      valuePropName={[FIELD_TYPES.CHECKBOX, FIELD_TYPES.TOGGLE, FIELD_TYPES.CONSENT].includes(field.field_type) ? 'checked' : 'value'}
      className="dynamic-field-item"
      style={{ minWidth: 0 }}
    >
      {renderFieldInput(field, disabled, allValues)}
    </Form.Item>
  );

  if (skipColWrapper) {
    return (
      <div style={{ minWidth: 0, width: '100%' }}>
        {formItem}
      </div>
    );
  }

  return (
    <Col {...colProps} style={{ minWidth: 0 }}>
      {formItem}
    </Col>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal performance
  return (
    prevProps.field.id === nextProps.field.id &&
    prevProps.field.width === nextProps.field.width &&
    prevProps.field.field_type === nextProps.field.field_type &&
    prevProps.disabled === nextProps.disabled &&
    JSON.stringify(prevProps.allValues) === JSON.stringify(nextProps.allValues)
  );
});

// Export getColProps for use in other components (like LiveFormPreview)
export { getColProps };
export default DynamicField;
