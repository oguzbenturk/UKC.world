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
      width={420}
      centered
      className="ukc-auth-modal"
      rootClassName="dark"
      closeIcon={<span className="text-white/40 hover:text-white transition-colors mt-2 mr-2">×</span>}
      styles={{
        content: { padding: 0, backgroundColor: 'transparent', boxShadow: 'none' },
        body: { padding: 0 }
      }}
    >
      <div className="bg-[#1a262b] p-8 sm:p-10 rounded-2xl overflow-hidden relative border border-white/5 ring-1 ring-white/10">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-[#00a8c4]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="text-center mb-10 relative z-10">
          <h2 className="text-3xl font-duotone-bold-extended text-white mb-3 tracking-tight">
            {modalConfig.title || 'Sign In'}
          </h2>
          <p className="text-gray-400 font-duotone-regular text-sm px-4">
            {modalConfig.message || 'Please enter your details to continue'}
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
              className="mb-5"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' }
              ]}
            >
              <Input 
                prefix={<MailOutlined className="text-[#00a8c4]" />}
                placeholder="Email"
                size="large"
                className="!bg-white/5 !border-white/10 hover:!border-[#00a8c4]/50 focus-within:!border-[#00a8c4] !h-12 !rounded-xl transition-all [&_input]:!bg-transparent [&_input]:!text-white [&_input::placeholder]:!text-white/60"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              name="password"
              className="mb-8"
              rules={[{ required: true, message: 'Password is required' }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-[#00a8c4]" />}
                placeholder="Password"
                size="large"
                className="!bg-white/5 !border-white/10 hover:!border-[#00a8c4]/50 focus-within:!border-[#00a8c4] !h-12 !rounded-xl transition-all [&_input]:!bg-transparent [&_input]:!text-white [&_input::placeholder]:!text-white/60 [&_.ant-input-password-icon]:!text-white/40 hover:[&_.ant-input-password-icon]:!text-white/80"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item className="mb-0">
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                block
                size="large"
                className="!h-12 !rounded-xl !bg-[#00a8c4] !border-none !font-duotone-bold !text-sm hover:!opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-[#00a8c4]/20"
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>

          <div className="relative my-8 text-center px-4">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-white/5" />
            </div>
            <span className="relative z-10 px-4 bg-[#1a262b] text-[10px] sm:text-xs font-duotone-bold text-gray-500 uppercase tracking-[0.2em]">
              Or connect with
            </span>
          </div>

          <Space direction="vertical" className="w-full" size={12}>
            <Button 
              type="default" 
              block 
              size="large"
              className="!h-12 !rounded-xl !bg-white/5 !border-white/10 !text-white !font-semibold !text-sm hover:!bg-white/10 hover:!border-white/20 transition-all"
              onClick={handleRegister}
            >
              Create New Account
            </Button>
            
            <div className="text-center pt-2">
              <Button 
                type="link" 
                onClick={handleCancel}
                className="!text-gray-500 hover:!text-[#00a8c4] !text-xs transition-colors"
              >
                Continue as Guest
              </Button>
            </div>
          </Space>
        </>
      ) : (
        <div className="text-center relative z-10 px-2">
          <p className="mb-8 text-gray-400 font-duotone-regular leading-relaxed text-sm">
            To create a full account with access to all features,
            we'll need a bit more information from you.
          </p>
          <Button 
            type="primary" 
            block 
            size="large"
            className="!h-12 !rounded-xl !bg-emerald-600 !border-none !font-duotone-bold !text-sm hover:!bg-emerald-500 transition-all shadow-lg shadow-emerald-500/10"
            onClick={handleRegister}
          >
            Go to Registration
          </Button>
          
          <div className="relative my-8 text-center px-4">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-white/5" />
            </div>
            <span className="relative z-10 px-4 bg-[#1a262b] text-xs font-duotone-bold text-gray-500 uppercase tracking-widest">
              Or
            </span>
          </div>

          <Button 
            type="link" 
            onClick={switchMode}
            className="!text-[#00a8c4] hover:!text-[#00a8c4]/80 !text-sm transition-colors"
          >
            Already have an account? Sign In
          </Button>
        </div>
      )}
      </div>
    </Modal>
  );
};

export default AuthModal;
