import { useState } from 'react';
import { Modal, Input, Button, Typography, Space, Alert } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { MailOutlined, ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Title } = Typography;

/**
 * ForgotPasswordModal - Modal for requesting password reset email
 * 
 * Security features:
 * - Rate limited on backend (3 requests per hour)
 * - No email enumeration (always shows success message)
 * - Secure token sent via email
 */
const ForgotPasswordModal = ({ visible, onClose }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!email || !email.includes('@')) {
      message.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/auth/forgot-password', {
        email: email.trim().toLowerCase()
      });

      // Success
      setSuccess(true);
    } catch (err) {
      console.error('Password reset request failed:', err);
      // Rate limit error
      if (err.response?.status === 429) {
        setError('Too many requests. Please wait before trying again.');
      } else {
        // Still show success to prevent email enumeration
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

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      centered
      width={420}
      className="forgot-password-modal"
      destroyOnHidden
    >
      <div className="py-4">
        {!success ? (
          // Request form
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                <MailOutlined className="text-3xl text-blue-600" />
              </div>
              <Title level={4} className="mb-2">Forgot Password?</Title>
              <Text type="secondary">
                Enter your email address and we'll send you a link to reset your password.
              </Text>
            </div>

            {error && (
              <Alert
                message={error}
                type="error"
                showIcon
                className="mb-4"
                closable
                onClose={() => setError(null)}
              />
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <Input
                  prefix={<MailOutlined className="text-gray-400" />}
                  type="email"
                  name="email"
                  id="forgot-email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  size="large"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKeyPress(e)}
                  autoFocus
                />
              </div>

              <Button
                type="primary"
                size="large"
                block
                loading={loading}
                onClick={handleSubmit}
              >
                Send Reset Link
              </Button>

              <Button
                type="link"
                icon={<ArrowLeftOutlined />}
                onClick={handleClose}
                className="w-full"
              >
                Back to Login
              </Button>
            </div>
          </>
        ) : (
          // Success message
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircleOutlined className="text-3xl text-green-600" />
            </div>
            <Title level={4} className="mb-2">Check Your Email</Title>
            <Text type="secondary" className="block mb-4">
              If an account exists with <strong>{email}</strong>, you will receive a password reset link shortly.
            </Text>
            <Text type="secondary" className="block mb-6 text-sm">
              The link will expire in 1 hour for security reasons.
            </Text>
            
            <Space direction="vertical" className="w-full">
              <Alert
                message="Didn't receive the email?"
                description="Check your spam folder, or verify you entered the correct email address."
                type="info"
                showIcon
              />
              
              <Button
                type="primary"
                size="large"
                block
                onClick={handleClose}
                className="mt-4"
              >
                Return to Login
              </Button>
            </Space>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ForgotPasswordModal;
