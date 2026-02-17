// src/shared/components/ui/AuthModal.jsx
import { Modal, Button, Form, Input, Divider, Space, App } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAuthModal } from '../../contexts/AuthModalContext';

const AuthModal = () => {
  const { message } = App.useApp();
  const { isOpen, closeAuthModal, modalConfig } = useAuthModal();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('signin'); // 'signin' or 'register'

  const handleSignIn = async (values) => {
    setLoading(true);
    try {
      const success = await login(values.email, values.password);
      if (success) {
        message.success('Successfully signed in!');
        closeAuthModal();
        
        // Redirect to return URL if specified
        if (modalConfig.returnUrl) {
          navigate(modalConfig.returnUrl);
        }
      } else {
        message.error('Invalid email or password');
      }
    } catch (error) {
      message.error(error.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    // Close modal and navigate to full registration page
    closeAuthModal();
    navigate('/register', { 
      state: { returnUrl: modalConfig.returnUrl } 
    });
  };

  const handleCancel = () => {
    form.resetFields();
    closeAuthModal();
  };

  const switchMode = () => {
    form.resetFields();
    setMode(mode === 'signin' ? 'register' : 'signin');
  };

  return (
    <Modal
      open={isOpen}
      onCancel={handleCancel}
      footer={null}
      width={400}
      centered
    >
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold mb-2">
          {modalConfig.title}
        </h2>
        <p className="text-gray-600">
          {modalConfig.message}
        </p>
      </div>

      {mode === 'signin' ? (
        <>
          <Form
            form={form}
            onFinish={handleSignIn}
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Please enter your email' },
                { type: 'email', message: 'Please enter a valid email' }
              ]}
            >
              <Input 
                prefix={<MailOutlined />}
                placeholder="Email"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Please enter your password' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Password"
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                block
                size="large"
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>

          <Divider plain>Or</Divider>

          <Space direction="vertical" className="w-full">
            <Button 
              type="default" 
              block 
              size="large"
              onClick={handleRegister}
            >
              Create New Account
            </Button>
            
            <div className="text-center">
              <Button 
                type="link" 
                onClick={handleCancel}
                className="text-gray-500"
              >
                Continue as Guest
              </Button>
            </div>
          </Space>
        </>
      ) : (
        <div className="text-center">
          <p className="mb-4">
            To create a full account with access to all features,
            we'll need a bit more information from you.
          </p>
          <Button 
            type="primary" 
            block 
            size="large"
            onClick={handleRegister}
          >
            Go to Registration
          </Button>
          <Divider plain>Or</Divider>
          <Button 
            type="link" 
            onClick={switchMode}
          >
            Already have an account? Sign In
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default AuthModal;
