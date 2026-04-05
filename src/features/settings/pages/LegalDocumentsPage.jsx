import { useState, useEffect } from 'react';
import { 
  Card, 
  Tabs, 
  Button, 
  Form, 
  Input, 
  Space, 
  message, 
  Spin,
  Alert,
  Typography,
  Divider
} from 'antd';
import { 
  SaveOutlined, 
  FileTextOutlined, 
  SafetyCertificateOutlined,
  EyeOutlined 
} from '@ant-design/icons';
import apiClient from '../../../shared/services/apiClient';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const { Title, Text } = Typography;
const { TextArea } = Input;

const LegalDocumentsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState({
    terms: { version: '', content: '' },
    privacy: { version: '', content: '' },
    marketing: { content: '' }
  });
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('terms');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/legal-documents');
      const docs = response.data;
      
      setDocuments({
        terms: docs.terms || { version: '2025-10-01', content: '' },
        privacy: docs.privacy || { version: '2025-10-01', content: '' },
        marketing: docs.marketing || { content: '' }
      });

      form.setFieldsValue({
        termsVersion: docs.terms?.version || '2025-10-01',
        termsContent: docs.terms?.content || '',
        privacyVersion: docs.privacy?.version || '2025-10-01',
        privacyContent: docs.privacy?.content || '',
        marketingDescription: docs.marketing?.content || ''
      });
    } catch (error) {
      console.error('Failed to load documents:', error);
      message.error('Failed to load legal documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (docType) => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue();
      
      setSaving(true);

      const payload = {
        type: docType,
        ...(docType === 'terms' && {
          version: values.termsVersion,
          content: values.termsContent
        }),
        ...(docType === 'privacy' && {
          version: values.privacyVersion,
          content: values.privacyContent
        }),
        ...(docType === 'marketing' && {
          content: values.marketingDescription
        })
      };

      await apiClient.post('/admin/legal-documents', payload);
      message.success(`${docType === 'terms' ? 'Terms of Service' : docType === 'privacy' ? 'Privacy Policy' : 'Marketing Preferences'} saved successfully`);
      
      await fetchDocuments();
    } catch (error) {
      console.error('Failed to save:', error);
      message.error('Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean']
    ]
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" />
      </div>
    );
  }

  const tabItems = [
    {
      key: 'terms',
      label: (
        <Space>
          <FileTextOutlined />
          Terms of Service
        </Space>
      ),
      children: (
        <div className="max-w-4xl">
          <Alert
            message="Terms of Service"
            description="Users will be required to accept new versions. Update the version number to trigger re-consent."
            type="info"
            showIcon
            className="mb-6"
          />
          
          <Form form={form} layout="vertical">
            <Form.Item
              name="termsVersion"
              label="Version"
              rules={[{ required: true, message: 'Version is required' }]}
            >
              <Input placeholder="e.g., 2025-10-01" />
            </Form.Item>

            <Form.Item
              name="termsContent"
              label="Terms Content (HTML supported)"
            >
              <ReactQuill
                theme="snow"
                modules={quillModules}
                style={{ height: '400px', marginBottom: '60px' }}
              />
            </Form.Item>

            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => handleSave('terms')}
                loading={saving}
              >
                Save Terms of Service
              </Button>
              <Button
                icon={<EyeOutlined />}
                onClick={() => {
                  const win = window.open('', '_blank');
                  win.document.write(`
                    <html>
                      <head><title>Terms of Service Preview</title></head>
                      <body style="padding: 20px; font-family: sans-serif;">
                        <h1>Terms of Service</h1>
                        <p><em>Version: ${form.getFieldValue('termsVersion')}</em></p>
                        <hr/>
                        ${form.getFieldValue('termsContent') || '<p>No content</p>'}
                      </body>
                    </html>
                  `);
                }}
              >
                Preview
              </Button>
            </Space>
          </Form>
        </div>
      )
    },
    {
      key: 'privacy',
      label: (
        <Space>
          <SafetyCertificateOutlined />
          Privacy Policy
        </Space>
      ),
      children: (
        <div className="max-w-4xl">
          <Alert
            message="Privacy Policy"
            description="Users will be required to accept new versions. Update the version number to trigger re-consent."
            type="info"
            showIcon
            className="mb-6"
          />
          
          <Form form={form} layout="vertical">
            <Form.Item
              name="privacyVersion"
              label="Version"
              rules={[{ required: true, message: 'Version is required' }]}
            >
              <Input placeholder="e.g., 2025-10-01" />
            </Form.Item>

            <Form.Item
              name="privacyContent"
              label="Privacy Content (HTML supported)"
            >
              <ReactQuill
                theme="snow"
                modules={quillModules}
                style={{ height: '400px', marginBottom: '60px' }}
              />
            </Form.Item>

            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => handleSave('privacy')}
                loading={saving}
              >
                Save Privacy Policy
              </Button>
              <Button
                icon={<EyeOutlined />}
                onClick={() => {
                  const win = window.open('', '_blank');
                  win.document.write(`
                    <html>
                      <head><title>Privacy Policy Preview</title></head>
                      <body style="padding: 20px; font-family: sans-serif;">
                        <h1>Privacy Policy</h1>
                        <p><em>Version: ${form.getFieldValue('privacyVersion')}</em></p>
                        <hr/>
                        ${form.getFieldValue('privacyContent') || '<p>No content</p>'}
                      </body>
                    </html>
                  `);
                }}
              >
                Preview
              </Button>
            </Space>
          </Form>
        </div>
      )
    },
    {
      key: 'marketing',
      label: 'Marketing Preferences',
      children: (
        <div className="max-w-4xl">
          <Alert
            message="Marketing Communication Preferences"
            description="Customize the description shown to users when they configure their marketing preferences."
            type="info"
            showIcon
            className="mb-6"
          />
          
          <Form form={form} layout="vertical">
            <Form.Item
              name="marketingDescription"
              label="Description Text"
            >
              <TextArea
                rows={4}
                placeholder="These toggles are optional. Opt in to receive updates and booking reminders through the channels you prefer."
              />
            </Form.Item>

            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => handleSave('marketing')}
              loading={saving}
            >
              Save Marketing Preferences
            </Button>
          </Form>
        </div>
      )
    }
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <Title level={2}>Legal Documents & Consent Management</Title>
        <Text type="secondary">
          Manage Terms of Service, Privacy Policy, and marketing preference settings
        </Text>
      </div>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>
    </div>
  );
};

export default LegalDocumentsPage;
