import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Input, Button, Typography, Spin, Alert, Space, Form } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { LockOutlined, CheckCircleOutlined, CloseCircleOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Title, Paragraph } = Typography;

// Static logo component
const Logo = () => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 200 60" 
    className="h-10 w-auto"
    aria-label="Plannivo Logo"
  >
    <text
      x="100"
      y="40"
      textAnchor="middle"
      fontFamily="'Segoe UI', system-ui, -apple-system, sans-serif"
      fontSize="28"
      fontWeight="700"
      fill="#1890ff"
      letterSpacing="1"
    >
      Plannivo
    </text>
  </svg>
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-8">
          <Spin size="large" />
          <Paragraph className="mt-4 text-gray-600">
            Validating your reset link...
          </Paragraph>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <div className="text-center py-4">
            <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircleOutlined className="text-4xl text-green-600" />
            </div>
            <Title level={3} className="mb-2">Password Reset Successful!</Title>
            <Paragraph className="text-gray-600 mb-6">
              Your password has been reset successfully. You can now log in with your new password.
            </Paragraph>
            <Button 
              type="primary" 
              size="large" 
              block 
              onClick={goToLogin}
            >
              Go to Login
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Error/Invalid token state
  if (!tokenValid || error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <div className="text-center py-4">
            <div className="w-20 h-20 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <CloseCircleOutlined className="text-4xl text-red-600" />
            </div>
            <Title level={3} className="mb-2">Link Expired or Invalid</Title>
            <Paragraph className="text-gray-600 mb-4">
              {error || 'This password reset link has expired or is invalid.'}
            </Paragraph>
            <Alert
              message="Password reset links expire after 1 hour for security reasons."
              type="info"
              showIcon
              className="mb-6 text-left"
            />
            <Space direction="vertical" className="w-full">
              <Button 
                type="primary" 
                size="large" 
                block 
                onClick={requestNewLink}
              >
                Request New Reset Link
              </Button>
              <Button 
                type="link" 
                block 
                onClick={goToLogin}
              >
                Return to Login
              </Button>
            </Space>
          </div>
        </Card>
      </div>
    );
  }

  // Password reset form
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <Logo />
          <Title level={3} className="mt-4 mb-2">Reset Your Password</Title>
          <Text type="secondary">
            Enter a new password for <strong>{email}</strong>
          </Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="password"
            label="New Password"
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 8, message: 'Password must be at least 8 characters' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-gray-400" />}
              placeholder="Enter new password"
              size="large"
              iconRender={(visible) => 
                visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
              }
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Confirm Password"
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
              prefix={<LockOutlined className="text-gray-400" />}
              placeholder="Confirm new password"
              size="large"
              iconRender={(visible) => 
                visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
              }
            />
          </Form.Item>

          <Alert
            message="Password Requirements"
            description={
              <ul className="list-disc pl-4 mt-1 mb-0 text-sm">
                <li>At least 8 characters long</li>
                <li>Choose a strong, unique password</li>
              </ul>
            }
            type="info"
            showIcon
            className="mb-4"
          />

          <Form.Item className="mb-2">
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
            >
              Reset Password
            </Button>
          </Form.Item>

          <Button
            type="link"
            block
            onClick={goToLogin}
          >
            Cancel and Return to Login
          </Button>
        </Form>
      </Card>
    </div>
  );
};

export default ResetPassword;
