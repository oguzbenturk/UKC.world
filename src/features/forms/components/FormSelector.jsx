/* eslint-disable complexity */
/**
 * Form Selector Component
 * Searchable dropdown for selecting form templates in Quick Links
 */

import { useState, useEffect } from 'react';
import { Select, Space, Button, Tag, Tooltip, Spin, Modal } from 'antd';
import { 
  PlusOutlined, 
  EyeOutlined, 
  FormOutlined,
  FileTextOutlined 
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/shared/services/apiClient';
import FormPreview from './FormPreview';

const { Option, OptGroup } = Select;

/**
 * FormSelector - Select a form template for quick links
 * 
 * @param {Object} props
 * @param {number} props.value - Selected form template ID
 * @param {function} props.onChange - Called when selection changes
 * @param {boolean} props.disabled - Whether the selector is disabled
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.showPreview - Whether to show preview button
 * @param {boolean} props.showCreateNew - Whether to show create new button
 * @param {boolean} props.allowClear - Whether to allow clearing selection
 */
const FormSelector = ({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select a form template',
  showPreview = true,
  showCreateNew = true,
  allowClear = true,
  style
}) => {
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewForm, setPreviewForm] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch form templates
  useEffect(() => {
    const fetchForms = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get('/api/form-templates?is_active=true');
        setForms(response.data || []);
      } catch {
        setForms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchForms();
  }, []);

  // Group forms by category
  const groupedForms = forms.reduce((acc, form) => {
    const category = form.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(form);
    return acc;
  }, {});

  const categoryLabels = {
    service: 'Service Registration',
    registration: 'General Registration',
    survey: 'Survey / Feedback',
    contact: 'Contact Form',
    other: 'Other Forms'
  };

  // Handle preview
  const handlePreview = async (formId) => {
    if (!formId) return;
    
    setPreviewLoading(true);
    try {
      const response = await apiClient.get(`/api/form-templates/${formId}`);
      setPreviewForm(response.data);
      setPreviewVisible(true);
    } catch {
      // Silent fail - preview not available
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle create new form
  const handleCreateNew = () => {
    navigate('/forms/new');
  };

  // Get selected form info
  const selectedForm = forms.find(f => f.id === value);

  return (
    <div style={style}>
      <Space.Compact style={{ width: '100%' }}>
        <Select
          value={value}
          onChange={onChange}
          disabled={disabled || loading}
          placeholder={placeholder}
          allowClear={allowClear}
          showSearch
          optionFilterProp="label"
          loading={loading}
          style={{ flex: 1 }}
          notFoundContent={loading ? <Spin size="small" /> : 'No forms found'}
          dropdownRender={(menu) => (
            <>
              {menu}
              {showCreateNew && (
                <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={handleCreateNew}
                    block
                  >
                    Create New Form
                  </Button>
                </div>
              )}
            </>
          )}
        >
          {/* Option to use no custom form (default behavior) */}
          <Option value={null} label="Use Default Registration">
            <Space>
              <FileTextOutlined />
              <span>Use Default Registration Form</span>
              <Tag color="default" size="small">Built-in</Tag>
            </Space>
          </Option>
          
          {/* Grouped form options */}
          {Object.entries(groupedForms).map(([category, categoryForms]) => (
            <OptGroup key={category} label={categoryLabels[category] || category}>
              {categoryForms.map(form => (
                <Option key={form.id} value={form.id} label={form.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                      <FormOutlined />
                      <span>{form.name}</span>
                    </Space>
                    <Space size="small">
                      <Tag color="blue" size="small">
                        {form.field_count || 0} fields
                      </Tag>
                      {form.step_count > 1 && (
                        <Tag color="green" size="small">
                          {form.step_count} steps
                        </Tag>
                      )}
                    </Space>
                  </div>
                </Option>
              ))}
            </OptGroup>
          ))}
        </Select>

        {showPreview && value && (
          <Tooltip title="Preview form">
            <Button
              icon={<EyeOutlined />}
              onClick={() => handlePreview(value)}
              loading={previewLoading}
              disabled={disabled}
            />
          </Tooltip>
        )}
      </Space.Compact>

      {/* Selected form info */}
      {selectedForm && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          <Space>
            <span>{selectedForm.description || 'No description'}</span>
            {selectedForm.is_default && <Tag color="gold">Default</Tag>}
          </Space>
        </div>
      )}

      {/* Form Preview Modal */}
      <Modal
        title={previewForm?.name || 'Form Preview'}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={800}
        destroyOnHidden
      >
        {previewForm && (
          <FormPreview
            formTemplate={previewForm}
            isPreviewMode={true}
          />
        )}
      </Modal>
    </div>
  );
};

export default FormSelector;
