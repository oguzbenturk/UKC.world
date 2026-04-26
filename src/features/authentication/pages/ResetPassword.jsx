import { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Spin, Form } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { LockOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

import dpcLogo from '../../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';

const Logo = () => (
  <div className="flex items-center justify-center gap-2 mb-6">
    <img src={dpcLogo} alt="UKC•" style={{ height: '50px', objectFit: 'contain' }} />
  </div>
);

const ResetPassword = () => {
  const { t } = useTranslation(['public']);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tokenError, setTokenError] = useState(null);
  const [formError, setFormError] = useState(null);

  // Mirrors backend regex: 1 lowercase, 1 uppercase, 1 digit, 1 special (@$!%*?&), min 8 chars.
  const STRONG_PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  useEffect(() => {
    validateToken();
  }, [token, email]);

  const validateToken = async () => {
    if (!token || !email) {
      setTokenError(t('public:resetPassword.errors.invalidLink'));
      setValidating(false);
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.post('/auth/validate-reset-token', { token, email });

      if (response.data.valid) {
        setTokenValid(true);
      } else {
        setTokenError(response.data.error || t('public:resetPassword.errors.expiredLink'));
      }
    } catch (err) {
      console.error('Token validation failed:', err);
      setTokenError(err.response?.data?.error || t('public:resetPassword.errors.validateFailed'));
    } finally {
      setValidating(false);
      setLoading(false);
    }
  };

  const handleSubmit = async (values) => {
    const { password, confirmPassword } = values;
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError(t('public:resetPassword.errors.passwordsMismatch'));
      return;
    }

    if (!STRONG_PW.test(password)) {
      setFormError('Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character (@$!%*?&).');
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiClient.post('/auth/reset-password', { token, email, password });

      if (response.data.success) {
        setSuccess(true);
        message.success(t('public:resetPassword.successToast'));
      } else {
        setFormError(response.data.error || t('public:resetPassword.errors.resetFailed'));
      }
    } catch (err) {
      console.error('Password reset failed:', err);
      setFormError(err.response?.data?.error || t('public:resetPassword.errors.resetGenericFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const goToLogin = () => {
    navigate('/login');
  };

  const requestNewLink = () => {
    navigate('/login', { state: { showForgotPassword: true } });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1013] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center shadow-2xl">
          <Spin size="large" />
          <p className="font-duotone-regular mt-6 text-gray-400">
            {t('public:resetPassword.validating')}
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0f1013] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center shadow-2xl">
          <div className="w-20 h-20 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-green-400 shadow-inner">
            <CheckCircleOutlined className="text-4xl" />
          </div>
          <h2 className="font-duotone-bold-extended text-2xl text-white mb-4 uppercase tracking-tight">{t('public:resetPassword.success.title')}</h2>
          <p className="font-duotone-regular text-gray-400 mb-8">
            {t('public:resetPassword.success.body')}
          </p>
          <button
            onClick={goToLogin}
            className="w-full font-duotone-bold bg-white text-antrasit py-4 rounded-xl hover:bg-gray-100 transition-all tracking-widest text-sm shadow-lg"
          >
            {t('public:resetPassword.success.goLogin')}
          </button>
        </div>
      </div>
    );
  }

  if (!tokenValid || tokenError) {
    return (
      <div className="min-h-screen bg-[#0f1013] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center shadow-2xl">
          <div className="w-20 h-20 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-red-400 shadow-inner">
            <CloseCircleOutlined className="text-4xl" />
          </div>
          <h2 className="font-duotone-bold-extended text-2xl text-white mb-4 uppercase tracking-tight">{t('public:resetPassword.invalid.title')}</h2>
          <p className="font-duotone-regular text-gray-400 mb-6">
            {tokenError || t('public:resetPassword.invalid.defaultBody')}
          </p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left mb-8">
            <p className="font-duotone-regular text-xs text-duotone-blue leading-relaxed m-0">
              ℹ️ {t('public:resetPassword.invalid.expiry')}
            </p>
          </div>
          <div className="space-y-4">
            <button
              onClick={requestNewLink}
              className="w-full font-duotone-bold bg-duotone-blue text-antrasit py-4 rounded-xl hover:bg-white transition-all tracking-widest text-sm shadow-lg shadow-duotone-blue/20"
            >
              {t('public:resetPassword.invalid.requestNew')}
            </button>
            <button
              onClick={goToLogin}
              className="w-full font-duotone-bold text-gray-500 hover:text-white transition-colors tracking-widest text-xs"
            >
              {t('public:resetPassword.invalid.return')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1013] relative overflow-hidden flex items-center justify-center py-12 px-4 shadow-inner">
      <div className="absolute top-0 -left-4 w-96 h-96 opacity-40 animate-blob pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,168,196,0.2) 0%, rgba(0,168,196,0) 70%)' }}></div>
      <div className="absolute -bottom-8 right-20 w-96 h-96 opacity-40 animate-blob animation-delay-4000 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(75,79,84,0.3) 0%, rgba(75,79,84,0) 70%)' }}></div>

      <div className="relative w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 sm:p-12 shadow-2xl">
        <div className="text-center mb-8">
          <Logo />
          <h1 className="font-duotone-bold-extended text-2xl text-white mb-2 uppercase tracking-tight">{t('public:resetPassword.title')}</h1>
          <p className="font-duotone-regular text-gray-400 text-sm">
            <Trans
              i18nKey="public:resetPassword.subtitle"
              values={{ email }}
              components={{ strong: <strong className="text-white" /> }}
            />
          </p>
        </div>

        {formError && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 mb-6">
            <p className="font-duotone-regular text-red-300 text-sm text-center m-0">
              {formError}
            </p>
          </div>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="dark-form"
        >
          <Form.Item
            name="password"
            label={<span className="font-duotone-bold text-[12px] uppercase tracking-wider text-gray-500">{t('public:resetPassword.fields.newPassword')}</span>}
            rules={[
              { required: true, message: t('public:resetPassword.errors.enterPassword') },
              { min: 8, message: t('public:resetPassword.errors.passwordMinValidation') },
              {
                pattern: STRONG_PW,
                message: 'Must include uppercase, lowercase, a number, and a special character (@$!%*?&).'
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-gray-600 mr-2" />}
              placeholder="••••••••"
              size="large"
              className="bg-white/5 border-white/10 rounded-xl text-white h-12 focus:border-duotone-blue focus:ring-duotone-blue"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label={<span className="font-duotone-bold text-[12px] uppercase tracking-wider text-gray-500">{t('public:resetPassword.fields.confirmPassword')}</span>}
            dependencies={['password']}
            rules={[
              { required: true, message: t('public:resetPassword.errors.confirmRequired') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('public:resetPassword.errors.passwordsMismatch')));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-gray-600 mr-2" />}
              placeholder="••••••••"
              size="large"
              className="bg-white/5 border-white/10 rounded-xl text-white h-12 focus:border-duotone-blue focus:ring-duotone-blue"
              autoComplete="new-password"
            />
          </Form.Item>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left mb-8">
            <h4 className="font-duotone-bold text-[10px] text-duotone-blue mb-2 uppercase tracking-widest">{t('public:resetPassword.requirementsTitle')}</h4>
            <ul className="list-none p-0 m-0 space-y-1">
              <li className="font-duotone-regular text-[11px] text-gray-400 flex items-center gap-2">
                <span className="w-1 h-1 bg-duotone-blue rounded-full"></span> {t('public:resetPassword.requirementLength')}
              </li>
              <li className="font-duotone-regular text-[11px] text-gray-400 flex items-center gap-2">
                <span className="w-1 h-1 bg-duotone-blue rounded-full"></span> {t('public:resetPassword.requirementStrong')}
              </li>
            </ul>
          </div>

          <Form.Item className="mb-4">
            <button
              type="submit"
              className="w-full font-duotone-bold bg-duotone-blue text-antrasit py-4 rounded-xl hover:bg-white transition-all tracking-widest text-sm shadow-lg shadow-duotone-blue/20"
            >
              {submitting ? t('public:resetPassword.submitting') : t('public:resetPassword.submit')}
            </button>
          </Form.Item>

          <button
            type="button"
            onClick={goToLogin}
            className="w-full font-duotone-bold text-gray-500 hover:text-white transition-colors tracking-widest text-xs"
          >
            {t('public:resetPassword.cancelReturn')}
          </button>
        </Form>
      </div>
    </div>
  );
};

export default ResetPassword;
