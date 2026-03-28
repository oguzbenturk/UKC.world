import { useState } from 'react';
import { Modal, Input, Button, Space, Alert } from 'antd';
import { MailOutlined, ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

/**
 * ForgotPasswordModal - Modal for requesting password reset email
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
      await apiClient.post('/auth/forgot-password', {
        email: email.trim().toLowerCase()
      });
      setSuccess(true);
    } catch (err) {
      console.error('Password reset request failed:', err);
      if (err.response?.status === 429) {
        setError('Too many requests. Please wait before trying again.');
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
            <h2 className="font-duotone-bold-extended text-2xl text-white mb-2 uppercase tracking-tight">Forgot Password?</h2>
            <p className="font-duotone-regular text-gray-400 text-sm">
              Enter your email and we'll send you a link to reset your password.
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
                Email Address
              </label>
              <Input
                prefix={<MailOutlined className="text-gray-600 mr-2" />}
                type="email"
                placeholder="name@example.com"
                size="large"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyPress}
                className="bg-white/5 border-white/10 rounded-xl text-white h-12 focus:border-duotone-blue focus:ring-duotone-blue"
                autoFocus
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full font-duotone-bold bg-duotone-blue text-antrasit py-4 rounded-xl hover:bg-white transition-all flex items-center justify-center gap-2 tracking-widest text-sm shadow-lg shadow-duotone-blue/20"
            >
              {loading ? 'SENDING...' : 'SEND RESET LINK'}
            </button>

            <button
              onClick={handleClose}
              className="w-full font-duotone-bold text-gray-500 hover:text-white transition-colors flex items-center justify-center gap-2 text-xs tracking-widest"
            >
              <ArrowLeftOutlined /> BACK TO LOGIN
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <div className="w-16 h-16 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-green-400 text-3xl shadow-inner">
            <CheckCircleOutlined />
          </div>
          <h2 className="font-duotone-bold-extended text-2xl text-white mb-2 uppercase tracking-tight">Check Your Email</h2>
          <p className="font-duotone-regular text-gray-400 text-sm mb-6">
            If an account exists with <strong className="text-white">{email}</strong>, you will receive a reset link shortly.
          </p>
          
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left mb-8">
            <h4 className="font-duotone-bold text-xs text-duotone-blue mb-2 uppercase tracking-widest">Didn't receive it?</h4>
            <p className="font-duotone-regular text-xs text-gray-400 leading-relaxed">
              Check your spam folder or verify you entered the correct address. The link expires in 1 hour.
            </p>
          </div>
          
          <button
            onClick={handleClose}
            className="w-full font-duotone-bold bg-white text-antrasit py-4 rounded-xl hover:bg-gray-100 transition-all tracking-widest text-sm"
          >
            RETURN TO LOGIN
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
          backdropFilter: 'blur(8px)',
          backgroundColor: 'rgba(0,0,0,0.4)'
        }
      }}
      className="forgot-password-modal brand-modal"
    >
      {content}
    </Modal>
  );
};

export default ForgotPasswordModal;
