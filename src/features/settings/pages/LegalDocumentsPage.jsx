import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['admin']);
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
      message.error(t('admin:legal.toast.loadError'));
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
      message.success(docType === 'terms' ? t('admin:legal.toast.termsSaved') : docType === 'privacy' ? t('admin:legal.toast.privacySaved') : t('admin:legal.toast.marketingSaved'));

      await fetchDocuments();
    } catch (error) {
      console.error('Failed to save:', error);
      message.error(t('admin:legal.toast.saveError'));
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
          {t('admin:legal.tabs.terms')}
        </Space>
      ),
      children: (
        <div className="max-w-4xl">
          <Alert
            message={t('admin:legal.terms.alertTitle')}
            description={t('admin:legal.terms.alertDescription')}
            type="info"
            showIcon
            className="mb-6"
          />

          <Form form={form} layout="vertical">
            <Form.Item
              name="termsVersion"
              label={t('admin:legal.terms.versionLabel')}
              rules={[{ required: true, message: t('admin:legal.terms.versionRequired') }]}
            >
              <Input placeholder={t('admin:legal.terms.versionPlaceholder')} />
            </Form.Item>

            <Form.Item
              name="termsContent"
              label={t('admin:legal.terms.contentLabel')}
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
                {t('admin:legal.terms.save')}
              </Button>
              <Button
                icon={<EyeOutlined />}
                onClick={async () => {
                  const { sanitizeHtml } = await import('@/shared/utils/sanitizeHtml');
                  const html = `<html><head><title>Terms of Service Preview</title></head><body style="padding:20px;font-family:sans-serif"><h1>Terms of Service</h1><p><em>Version: ${sanitizeHtml(form.getFieldValue('termsVersion') || '')}</em></p><hr/>${sanitizeHtml(form.getFieldValue('termsContent') || '<p>No content</p>')}</body></html>`;
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                }}
              >
                {t('admin:legal.terms.preview')}
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
          {t('admin:legal.tabs.privacy')}
        </Space>
      ),
      children: (
        <div className="max-w-4xl">
          <Alert
            message={t('admin:legal.privacy.alertTitle')}
            description={t('admin:legal.privacy.alertDescription')}
            type="info"
            showIcon
            className="mb-6"
          />

          <Form form={form} layout="vertical">
            <Form.Item
              name="privacyVersion"
              label={t('admin:legal.privacy.versionLabel')}
              rules={[{ required: true, message: t('admin:legal.privacy.versionRequired') }]}
            >
              <Input placeholder={t('admin:legal.privacy.versionPlaceholder')} />
            </Form.Item>

            <Form.Item
              name="privacyContent"
              label={t('admin:legal.privacy.contentLabel')}
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
                {t('admin:legal.privacy.save')}
              </Button>
              <Button
                icon={<EyeOutlined />}
                onClick={async () => {
                  const { sanitizeHtml } = await import('@/shared/utils/sanitizeHtml');
                  const html = `<html><head><title>Privacy Policy Preview</title></head><body style="padding:20px;font-family:sans-serif"><h1>Privacy Policy</h1><p><em>Version: ${sanitizeHtml(form.getFieldValue('privacyVersion') || '')}</em></p><hr/>${sanitizeHtml(form.getFieldValue('privacyContent') || '<p>No content</p>')}</body></html>`;
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                }}
              >
                {t('admin:legal.privacy.preview')}
              </Button>
            </Space>
          </Form>
        </div>
      )
    },
    {
      key: 'marketing',
      label: t('admin:legal.tabs.marketing'),
      children: (
        <div className="max-w-4xl">
          <Alert
            message={t('admin:legal.marketing.alertTitle')}
            description={t('admin:legal.marketing.alertDescription')}
            type="info"
            showIcon
            className="mb-6"
          />

          <Form form={form} layout="vertical">
            <Form.Item
              name="marketingDescription"
              label={t('admin:legal.marketing.descriptionLabel')}
            >
              <TextArea
                rows={4}
                placeholder={t('admin:legal.marketing.descriptionPlaceholder')}
              />
            </Form.Item>

            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => handleSave('marketing')}
              loading={saving}
            >
              {t('admin:legal.marketing.save')}
            </Button>
          </Form>
        </div>
      )
    }
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <Title level={2}>{t('admin:legal.title')}</Title>
        <Text type="secondary">{t('admin:legal.subtitle')}</Text>
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
