import { useEffect, useMemo, useState } from 'react';
import { Checkbox, Switch, Typography, Space, Divider, Alert, Button, Spin, Collapse } from 'antd';
import { InfoCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import apiClient from '../../../shared/services/apiClient';

const { Title, Paragraph, Text } = Typography;

const defaultPreferences = {
  email: true,
  sms: true,
  whatsapp: true
};

const UserConsentModal = ({
  open,
  loading,
  consent,
  onSubmit
}) => {
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [acceptPrivacy, setAcceptPrivacy] = useState(true);
  const [acceptMarketing, setAcceptMarketing] = useState(true);
  const [acceptDataProcessing, setAcceptDataProcessing] = useState(true);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [documents, setDocuments] = useState(null);
  const [loadingDocuments, setLoadingDocuments] = useState(true);

  const requiresAcceptance = consent?.requiresTermsAcceptance ?? true;

  useEffect(() => {
    if (open) {
      fetchDocuments();
    }
  }, [open]);

  const fetchDocuments = async () => {
    try {
      setLoadingDocuments(true);
      const response = await apiClient.get('/admin/legal-documents');
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to load legal documents:', error);
    } finally {
      setLoadingDocuments(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    // Always default to true (pre-selected)
    setPreferences({
      email: true,
      sms: true,
      whatsapp: true
    });

    setAcceptTerms(true);
    setAcceptPrivacy(true);
    setAcceptMarketing(true);
    setAcceptDataProcessing(true);
  }, [open, consent]);

  const latestVersion = consent?.latestTermsVersion ?? 'current';

  const canSubmit = useMemo(() => {
    if (!requiresAcceptance) {
      return true;
    }

    return acceptTerms && acceptPrivacy && acceptMarketing && acceptDataProcessing;
  }, [acceptTerms, acceptPrivacy, acceptMarketing, acceptDataProcessing, requiresAcceptance]);

  const handlePreferenceChange = (key) => (value) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    await onSubmit({
      acceptTerms: true,
      termsVersion: latestVersion,
      allowEmail: preferences.email,
      allowSms: preferences.sms,
      allowWhatsapp: preferences.whatsapp
    });
  };
  if (!open) {
    return null;
  }

  if (loadingDocuments) {
    return (
      <div className="fixed inset-0 z-[2000] overflow-y-auto bg-slate-950/85">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-10 md:justify-center">
          <div className="w-full rounded-2xl bg-white p-5 shadow-2xl sm:p-6 lg:p-8">
            <div className="flex items-center justify-center py-12">
              <Spin size="large" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const termsVersion = documents?.terms?.version || latestVersion;
  const marketingDescription = documents?.marketing?.content || 'These toggles are optional. Opt in to receive updates and booking reminders through the channels you prefer.';

  return (
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-slate-950/85">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-10 md:justify-center">
        <div className="w-full rounded-2xl bg-white p-5 shadow-2xl sm:p-6 lg:p-8 max-h-[calc(100vh-3rem)] overflow-y-auto">
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              Consent Required
            </Title>
            <Text type="secondary">Version {termsVersion}</Text>
          </div>

          <div>
            <Paragraph>
              To keep using Plannivo you need to accept our latest Terms of Service and Privacy Policy.
            </Paragraph>

            <Collapse
              className="my-4 bg-gray-50 border border-gray-200 rounded-lg"
              ghost
              items={[
                ...(documents?.terms?.content ? [{
                  key: 'terms',
                  label: <span className="font-medium flex items-center gap-2"><FileTextOutlined /> Terms of Service Preview</span>,
                  children: (
                    <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      <div dangerouslySetInnerHTML={{ __html: documents.terms.content }} />
                    </div>
                  )
                }] : []),
                ...(documents?.privacy?.content ? [{
                  key: 'privacy',
                  label: <span className="font-medium flex items-center gap-2"><FileTextOutlined /> Privacy Policy Preview</span>,
                  children: (
                    <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      <div dangerouslySetInnerHTML={{ __html: documents.privacy.content }} />
                    </div>
                  )
                }] : [])
              ]}
            />

            <Alert
              message="You can update marketing preferences anytime from your profile."
              type="info"
              showIcon
            />
          </div>

          <Divider />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Title level={5} style={{ marginBottom: 0 }}>Marketing Communication Preferences</Title>
              <Button 
                type="link" 
                size="small"
                onClick={() => setPreferences({ email: true, sms: true, whatsapp: true })}
              >
                Select All
              </Button>
            </div>
            
            <Collapse 
              ghost 
              items={[{
                key: '1',
                label: <span className="text-gray-500 flex items-center gap-2"><InfoCircleOutlined /> Why we ask for this? (Click to read details)</span>,
                children: (
                  <div 
                    className="prose prose-sm max-w-none text-gray-600 mb-4 bg-gray-50 p-4 rounded-lg"
                    dangerouslySetInnerHTML={{ __html: marketingDescription }} 
                  />
                )
              }]}
            />

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div>
                  <Text strong>Email</Text>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    Booking confirmations, schedules, and product updates.
                  </Paragraph>
                </div>
                <div className="sm:shrink-0">
                  <Switch checked={preferences.email} onChange={handlePreferenceChange('email')} />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div>
                  <Text strong>SMS</Text>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    Time-sensitive alerts like schedule changes or weather conditions.
                  </Paragraph>
                </div>
                <div className="sm:shrink-0">
                  <Switch checked={preferences.sms} onChange={handlePreferenceChange('sms')} />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div>
                  <Text strong>WhatsApp</Text>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    Concierge support, quick check-ins, and travel assistance.
                  </Paragraph>
                </div>
                <div className="sm:shrink-0">
                  <Switch checked={preferences.whatsapp} onChange={handlePreferenceChange('whatsapp')} />
                </div>
              </div>
            </Space>
          </div>

          <Divider />

          <div className="space-y-3">
            <Title level={5} style={{ marginBottom: 8 }}>Required Consents</Title>
            <Text type="secondary" className="block mb-4">Please read and accept all statements below to continue.</Text>
            
            <Checkbox 
              checked={acceptTerms} 
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="w-full"
            >
              I have read and agree to the Terms of Service
            </Checkbox>

            <Checkbox 
              checked={acceptPrivacy} 
              onChange={(e) => setAcceptPrivacy(e.target.checked)}
              className="w-full"
            >
              I have read and agree to the Privacy Policy
            </Checkbox>

            <Checkbox 
              checked={acceptMarketing} 
              onChange={(e) => setAcceptMarketing(e.target.checked)}
              className="w-full"
            >
              I consent to receive marketing communications (you can change this anytime)
            </Checkbox>

            <Checkbox 
              checked={acceptDataProcessing} 
              onChange={(e) => setAcceptDataProcessing(e.target.checked)}
              className="w-full"
            >
              I consent to the processing of my personal data as described in the Privacy Policy
            </Checkbox>

            <Alert
              message="Liability Waiver"
              description="You will sign the liability waiver in person at the Duotone Pro Center before your first lesson. Please bring a valid government-issued ID."
              type="info"
              showIcon
              className="mt-4"
            />
          </div>

          <Divider />

          <div className="flex flex-col gap-6">
            <Button
              type="primary"
              size="large"
              block
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={loading}
            >
              {requiresAcceptance ? 'Agree & Continue' : 'Save Preferences'}
            </Button>
          </div>
          </Space>
        </div>
      </div>
    </div>
  );
};

export default UserConsentModal;
