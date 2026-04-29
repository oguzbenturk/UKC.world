import { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Modal, Input, Alert } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { MailOutlined, ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import './auth-modals.css';

const ForgotPasswordModal = ({ visible, onClose }) => {
  const { t } = useTranslation(['public']);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!email || !email.includes('@')) {
      message.error(t('public:forgotPassword.invalidEmail'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiClient.post('/auth/forgot-password', {
        email: email.trim().toLowerCase()
      });
      setSuccess(true);
    } catch (err) {
      console.error('Password reset request failed:', err);
      if (err.response?.status === 429) {
        setError(t('public:forgotPassword.rateLimited'));
      } else {
        setSuccess(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setSuccess(false);
    setError(null);
    onClose();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading && !success) {
      handleSubmit();
    }
  };

  const content = (
    <div className="flex flex-col bg-[#1a1c1e] text-white rounded-3xl overflow-hidden w-full relative border border-white/10 shadow-2xl p-8">
      {!success ? (
        <>
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-duotone-blue text-3xl shadow-inner">
              <MailOutlined />
            </div>
            <h2 className="font-duotone-bold-extended text-2xl text-white mb-2 uppercase tracking-tight">{t('public:forgotPassword.title')}</h2>
            <p className="font-duotone-regular text-gray-400 text-sm">
              {t('public:forgotPassword.subtitle')}
            </p>
          </div>

          {error && (
            <div className="mb-6">
              <Alert
                message={error}
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
                className="rounded-xl border-red-500/20 bg-red-500/10 text-red-400"
              />
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block font-duotone-bold text-[12px] uppercase tracking-wider text-gray-500 mb-2">
                {t('public:forgotPassword.emailLabel')}
              </label>
              <Input
                prefix={<MailOutlined style={{ color: '#6b7280', marginRight: 8 }} />}
                type="email"
                placeholder={t('public:forgotPassword.emailPlaceholder')}
                size="large"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyPress}
                className="forgot-password-input rounded-xl h-12"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#ffffff'
                }}
                styles={{
                  input: {
                    backgroundColor: 'transparent',
                    color: '#ffffff',
                    caretColor: '#ffffff'
                  }
                }}
                autoFocus
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full font-duotone-bold bg-duotone-blue text-antrasit py-4 rounded-xl hover:bg-white transition-all flex items-center justify-center gap-2 tracking-widest text-sm shadow-lg shadow-duotone-blue/20"
            >
              {loading ? t('public:forgotPassword.sending') : t('public:forgotPassword.send')}
            </button>

            <button
              onClick={handleClose}
              className="w-full font-duotone-bold text-gray-500 hover:text-white transition-colors flex items-center justify-center gap-2 text-xs tracking-widest"
            >
              <ArrowLeftOutlined /> {t('public:forgotPassword.backToLogin')}
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <div className="w-16 h-16 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-green-400 text-3xl shadow-inner">
            <CheckCircleOutlined />
          </div>
          <h2 className="font-duotone-bold-extended text-2xl text-white mb-2 uppercase tracking-tight">{t('public:forgotPassword.sent.title')}</h2>
          <p className="font-duotone-regular text-gray-400 text-sm mb-6">
            <Trans
              i18nKey="public:forgotPassword.sent.body"
              values={{ email }}
              components={{ strong: <strong className="text-white" /> }}
            />
          </p>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left mb-8">
            <h4 className="font-duotone-bold text-xs text-duotone-blue mb-2 uppercase tracking-widest">{t('public:forgotPassword.sent.didntReceive')}</h4>
            <p className="font-duotone-regular text-xs text-gray-400 leading-relaxed">
              {t('public:forgotPassword.sent.didntReceiveBody')}
            </p>
          </div>

          <button
            onClick={handleClose}
            className="w-full font-duotone-bold bg-white text-antrasit py-4 rounded-xl hover:bg-gray-100 transition-all tracking-widest text-sm"
          >
            {t('public:forgotPassword.sent.returnLogin')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      centered
      width={440}
      closable={true}
      closeIcon={<span className="text-gray-500 hover:text-white text-lg">✕</span>}
      destroyOnHidden
      styles={{
        content: {
          padding: 0,
          overflow: 'hidden',
          borderRadius: '32px',
          backgroundColor: 'transparent',
          border: 'none',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        },
        mask: {
          backgroundColor: 'rgba(0,0,0,0.5)'
        }
      }}
      className="forgot-password-modal brand-modal"
    >
      {content}
    </Modal>
  );
};

export default ForgotPasswordModal;
