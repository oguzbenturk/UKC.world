import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Input, Button, Typography, Spin, Alert, Space, Form } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { LockOutlined, CheckCircleOutlined, CloseCircleOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';


const { Text, Title, Paragraph } = Typography;

const Logo = () => (
  <div className="flex items-center justify-center gap-2 mb-6">
    <span className="font-gotham-bold text-3xl text-white" style={{ letterSpacing: '0.05em' }}>Plannivo</span>
  </div>
);

/**
 * ResetPassword - Page for resetting password via email link
 * 
 * URL format: /reset-password?token=xxx&email=xxx
 * 
 * Security features:
 * - Token validation before showing form
 * - Password strength requirements
 * - Rate limited on backend
 * - Token expires after 1 hour
 */
const ResetPassword = () => {
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
  const [error, setError] = useState(null);

  // Validate token on mount
  useEffect(() => {
    validateToken();
  }, [token, email]);

  const validateToken = async () => {
    if (!token || !email) {
      setError('Invalid password reset link. Please request a new one.');
      setValidating(false);
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.post('/auth/validate-reset-token', { token, email });

      if (response.data.valid) {
        setTokenValid(true);
      } else {
        setError(response.data.error || 'This password reset link has expired or is invalid. Please request a new one.');
      }
    } catch (err) {
      console.error('Token validation failed:', err);
      setError(err.response?.data?.error || 'Unable to validate reset link. Please try again later.');
    } finally {
      setValidating(false);
      setLoading(false);
    }
  };

  const handleSubmit = async (values) => {
    const { password, confirmPassword } = values;

    if (password !== confirmPassword) {
      message.error('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      message.error('Password must be at least 8 characters long');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await apiClient.post('/auth/reset-password', { token, email, password });

      if (response.data.success) {
        setSuccess(true);
        message.success('Password reset successfully!');
      } else {
        setError(response.data.error || 'Failed to reset password. Please try again.');
      }
    } catch (err) {
      console.error('Password reset failed:', err);
      setError(err.response?.data?.error || 'Unable to reset password. Please try again later.');
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

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1013] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center shadow-2xl">
          <Spin size="large" />
          <p className="font-duotone-regular mt-6 text-gray-400">
            Validating your reset link...
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-[#0f1013] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center shadow-2xl">
          <div className="w-20 h-20 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-green-400 shadow-inner">
            <CheckCircleOutlined className="text-4xl" />
          </div>
          <h2 className="font-duotone-bold-extended text-2xl text-white mb-4 uppercase tracking-tight">Success!</h2>
          <p className="font-duotone-regular text-gray-400 mb-8">
            Your password has been reset successfully. You can now log in with your new password.
          </p>
          <button
            onClick={goToLogin}
            className="w-full font-duotone-bold bg-white text-antrasit py-4 rounded-xl hover:bg-gray-100 transition-all tracking-widest text-sm shadow-lg"
          >
            GO TO LOGIN
          </button>
        </div>
      </div>
    );
  }

  // Error/Invalid token state
  if (!tokenValid || error) {
    return (
      <div className="min-h-screen bg-[#0f1013] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center shadow-2xl">
          <div className="w-20 h-20 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-red-400 shadow-inner">
            <CloseCircleOutlined className="text-4xl" />
          </div>
          <h2 className="font-duotone-bold-extended text-2xl text-white mb-4 uppercase tracking-tight">Link Invalid</h2>
          <p className="font-duotone-regular text-gray-400 mb-6">
            {error || 'This password reset link has expired or is invalid.'}
          </p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left mb-8">
            <p className="font-duotone-regular text-xs text-duotone-blue leading-relaxed m-0">
              ℹ️ Reset links expire after 1 hour for security reasons.
            </p>
          </div>
          <div className="space-y-4">
            <button
              onClick={requestNewLink}
              className="w-full font-duotone-bold bg-duotone-blue text-antrasit py-4 rounded-xl hover:bg-white transition-all tracking-widest text-sm shadow-lg shadow-duotone-blue/20"
            >
              REQUEST NEW LINK
            </button>
            <button
              onClick={goToLogin}
              className="w-full font-duotone-bold text-gray-500 hover:text-white transition-colors tracking-widest text-xs"
            >
              RETURN TO LOGIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Password reset form
  return (
    <div className="min-h-screen bg-[#0f1013] relative overflow-hidden flex items-center justify-center py-12 px-4 shadow-inner">
      {/* Background blobs */}
      <div className="absolute top-0 -left-4 w-96 h-96 opacity-40 animate-blob pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(30,58,138,0.2) 0%, rgba(30,58,138,0) 70%)' }}></div>
      <div className="absolute -bottom-8 right-20 w-96 h-96 opacity-40 animate-blob animation-delay-4000 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(75,79,84,0.3) 0%, rgba(75,79,84,0) 70%)' }}></div>

      <div className="relative w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 sm:p-12 shadow-2xl">
        <div className="text-center mb-8">
          <Logo />
          <h1 className="font-duotone-bold-extended text-2xl text-white mb-2 uppercase tracking-tight">Reset Password</h1>
          <p className="font-duotone-regular text-gray-400 text-sm">
            Enter a new password for <strong className="text-white">{email}</strong>
          </p>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="dark-form"
        >
          <Form.Item
            name="password"
            label={<span className="font-duotone-bold text-[12px] uppercase tracking-wider text-gray-500">New Password</span>}
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 8, message: 'Password must be at least 8 characters' },
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
            label={<span className="font-duotone-bold text-[12px] uppercase tracking-wider text-gray-500">Confirm Password</span>}
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm your password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Passwords do not match'));
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
            <h4 className="font-duotone-bold text-[10px] text-duotone-blue mb-2 uppercase tracking-widest">Requirements:</h4>
            <ul className="list-none p-0 m-0 space-y-1">
              <li className="font-duotone-regular text-[11px] text-gray-400 flex items-center gap-2">
                <span className="w-1 h-1 bg-duotone-blue rounded-full"></span> At least 8 characters long
              </li>
              <li className="font-duotone-regular text-[11px] text-gray-400 flex items-center gap-2">
                <span className="w-1 h-1 bg-duotone-blue rounded-full"></span> Choose a strong, unique password
              </li>
            </ul>
          </div>

          <Form.Item className="mb-4">
            <button
              type="submit"
              className="w-full font-duotone-bold bg-duotone-blue text-antrasit py-4 rounded-xl hover:bg-white transition-all tracking-widest text-sm shadow-lg shadow-duotone-blue/20"
            >
              {submitting ? 'RESETTING...' : 'RESET PASSWORD'}
            </button>
          </Form.Item>

          <button
            type="button"
            onClick={goToLogin}
            className="w-full font-duotone-bold text-gray-500 hover:text-white transition-colors tracking-widest text-xs"
          >
            CANCEL AND RETURN
          </button>
        </Form>
      </div>
    </div>
  );
};

export default ResetPassword;
