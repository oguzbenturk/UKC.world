import { useEffect, useMemo, useState } from 'react';
import { Checkbox, Switch, Typography, Space, Divider, Alert, Button } from 'antd';

const { Title, Paragraph, Text, Link } = Typography;

const TERMS_URL = import.meta.env.VITE_TERMS_URL || 'https://plannivo.com/legal/terms';
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL || 'https://plannivo.com/legal/privacy';

const defaultPreferences = {
  email: false,
  sms: false,
  whatsapp: false
};

const UserConsentModal = ({
  open,
  loading,
  consent,
  onSubmit
}) => {
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);

  const requiresAcceptance = consent?.requiresTermsAcceptance ?? true;

  useEffect(() => {
    if (!open) {
      return;
    }

    const currentPreferences = consent?.communicationPreferences || defaultPreferences;
    setPreferences({
      email: !!currentPreferences.email,
      sms: !!currentPreferences.sms,
      whatsapp: !!currentPreferences.whatsapp
    });

    setAcceptTerms(false);
  }, [open, consent]);

  const latestVersion = consent?.latestTermsVersion ?? 'current';

  const canSubmit = useMemo(() => {
    if (!requiresAcceptance) {
      return true;
    }

    return acceptTerms;
  }, [acceptTerms, requiresAcceptance]);

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

  return (
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-slate-950/85">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-10 md:justify-center">
        <div className="w-full rounded-2xl bg-white p-5 shadow-2xl sm:p-6 lg:p-8 max-h-[calc(100vh-3rem)] overflow-y-auto">
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              Consent Required
            </Title>
            <Text type="secondary">Version {latestVersion}</Text>
          </div>

          <div>
            <Paragraph>
              To keep using Plannivo you need to accept our latest
              <Link href={TERMS_URL} target="_blank" rel="noopener noreferrer"> Terms of Service</Link>
              {' '}and
              <Link href={PRIVACY_URL} target="_blank" rel="noopener noreferrer"> Privacy Policy</Link>.
            </Paragraph>
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
            <Paragraph type="secondary">
              These toggles are optional. Opt in to receive updates and booking reminders through the channels you prefer.
            </Paragraph>
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

          <div className="flex flex-col gap-6">
            <Checkbox checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)}>
              I have read and agree to the Plannivo Terms of Service and Privacy Policy.
            </Checkbox>

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
