// src/shared/components/ui/AuthModal.jsx
// Plannivo editorial style — see docs/design-system/
import { Modal, Button, Form, Input, App } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { SIGN_IN_DISABLED_USER_MESSAGE } from '../../services/auth/authService';
import { useAuthModal } from '../../contexts/AuthModalContext';

const PALETTE = {
  bone:        '#F0EADD',
  paper:       '#F5F0E3',
  paperSoft:   '#F8F4EA',
  ink:         '#141E28',
  ink80:       'rgba(20, 30, 40, 0.80)',
  ink60:       'rgba(20, 30, 40, 0.60)',
  ink40:       'rgba(20, 30, 40, 0.42)',
  ink20:       'rgba(20, 30, 40, 0.20)',
  line:        '#D8CEB6',
  seafoam:     '#557872',
  seafoamSoft: '#A7BAB4',
};

const SERIF = '"Fraunces", "Cormorant Garamond", Georgia, serif';
const SANS  = '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const MONO  = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const AuthModal = () => {
  const { message } = App.useApp();
  const { isOpen, closeAuthModal, modalConfig } = useAuthModal();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (values) => {
    setLoading(true);
    try {
      const success = await login(values.email, values.password);
      if (success) {
        message.success('Signed in.');
        closeAuthModal();
        if (modalConfig.returnUrl) navigate(modalConfig.returnUrl);
      } else {
        message.error('Email or password is incorrect.');
      }
    } catch (error) {
      if (error?.message === SIGN_IN_DISABLED_USER_MESSAGE) {
        message.info(SIGN_IN_DISABLED_USER_MESSAGE);
      } else {
        message.error(error.message || 'Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    closeAuthModal();
    navigate('/register', { state: { returnUrl: modalConfig.returnUrl } });
  };

  const handleCancel = () => {
    form.resetFields();
    closeAuthModal();
  };

  return (
    <Modal
      open={isOpen}
      onCancel={handleCancel}
      footer={null}
      width={440}
      centered
      className="plannivo-auth-modal"
      closeIcon={
        <span
          style={{
            color: PALETTE.ink40, fontSize: 22, lineHeight: 1,
            fontFamily: SANS, fontWeight: 300,
            transition: 'color 0.2s ease',
            padding: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = PALETTE.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = PALETTE.ink40; }}
        >
          ×
        </span>
      }
      styles={{
        content: {
          padding: 0,
          backgroundColor: PALETTE.bone,
          borderRadius: 14,
          border: `1px solid ${PALETTE.line}`,
          boxShadow: '0 40px 80px -40px rgba(20, 30, 40, 0.22), 0 15px 25px -20px rgba(20, 30, 40, 0.10)',
          overflow: 'hidden',
        },
        body: { padding: 0 },
        mask: { backgroundColor: 'rgba(20, 30, 40, 0.45)', backdropFilter: 'blur(2px)' },
      }}
    >
      <style>{`
        .plannivo-auth-modal .ant-input,
        .plannivo-auth-modal .ant-input-affix-wrapper,
        .plannivo-auth-modal .ant-input-password {
          background: ${PALETTE.paperSoft} !important;
          border-color: ${PALETTE.line} !important;
          border-radius: 10px !important;
          height: 44px !important;
          font-family: ${SANS} !important;
          font-size: 0.95rem !important;
          color: ${PALETTE.ink} !important;
          box-shadow: none !important;
          transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
        }
        .plannivo-auth-modal .ant-input-affix-wrapper > input.ant-input {
          background: transparent !important;
          color: ${PALETTE.ink} !important;
        }
        .plannivo-auth-modal .ant-input::placeholder,
        .plannivo-auth-modal .ant-input-affix-wrapper > input.ant-input::placeholder {
          color: ${PALETTE.ink40} !important;
        }
        .plannivo-auth-modal .ant-input-affix-wrapper:hover,
        .plannivo-auth-modal .ant-input:hover {
          border-color: ${PALETTE.seafoamSoft} !important;
        }
        .plannivo-auth-modal .ant-input-affix-wrapper:focus-within,
        .plannivo-auth-modal .ant-input:focus {
          border-color: ${PALETTE.seafoam} !important;
          box-shadow: 0 0 0 3px rgba(85,120,114,0.15) !important;
        }
        .plannivo-auth-modal .ant-form-item-explain-error {
          font-family: ${MONO} !important;
          font-size: 0.7rem !important;
          letter-spacing: 0.06em !important;
          color: #8B4A3A !important;
          margin-top: 0.4em !important;
        }
        .plannivo-auth-modal .plan-primary-btn.ant-btn {
          background: ${PALETTE.ink} !important;
          color: ${PALETTE.bone} !important;
          border: none !important;
          border-radius: 999px !important;
          height: 44px !important;
          font-family: ${SANS} !important;
          font-size: 0.93rem !important;
          font-weight: 500 !important;
          letter-spacing: 0.005em !important;
          box-shadow: none !important;
          transition: all 0.25s ease !important;
        }
        .plannivo-auth-modal .plan-primary-btn.ant-btn:hover:not(:disabled) {
          background: ${PALETTE.seafoam} !important;
          transform: translateY(-1px);
          box-shadow: 0 8px 20px -10px rgba(85,120,114,0.5) !important;
        }
        .plannivo-auth-modal .plan-quiet-btn.ant-btn {
          background: transparent !important;
          color: ${PALETTE.ink} !important;
          border: 1px solid ${PALETTE.line} !important;
          border-radius: 999px !important;
          height: 44px !important;
          font-family: ${SANS} !important;
          font-size: 0.9rem !important;
          font-weight: 500 !important;
          transition: all 0.25s ease !important;
        }
        .plannivo-auth-modal .plan-quiet-btn.ant-btn:hover:not(:disabled) {
          border-color: ${PALETTE.seafoam} !important;
          color: ${PALETTE.seafoam} !important;
        }
      `}</style>

      <div
        style={{
          padding: '2rem 2rem 2.25rem',
          background: PALETTE.bone,
          backgroundImage: `radial-gradient(ellipse 500px 300px at 50% 0%, rgba(85,120,114,0.06), transparent 70%)`,
          color: PALETTE.ink,
          fontFamily: SANS,
        }}
      >
        {/* Brand mark + kicker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55em', marginBottom: '1.5rem' }}>
          <span
            aria-hidden="true"
            style={{
              width: 10, height: 10, borderRadius: '50%',
              background: PALETTE.seafoam,
              boxShadow: `0 0 0 3px ${PALETTE.seafoamSoft}`,
            }}
          />
          <span style={{
            fontFamily: SERIF,
            fontVariationSettings: '"opsz" 9, "SOFT" 0, "wght" 460',
            fontSize: '1.1rem',
            letterSpacing: '-0.015em',
            color: PALETTE.ink,
          }}>
            Plannivo
          </span>
        </div>

        {/* Title */}
        <h2 style={{
          fontFamily: SERIF,
          fontVariationSettings: '"opsz" 60, "SOFT" 30, "wght" 400',
          fontSize: '1.75rem',
          lineHeight: 1.08,
          letterSpacing: '-0.02em',
          color: PALETTE.ink,
          margin: '0 0 0.4em',
        }}>
          {modalConfig.title || 'Sign in.'}
        </h2>

        {/* Subtitle */}
        <p style={{
          fontFamily: SERIF,
          fontVariationSettings: '"opsz" 18, "SOFT" 0, "wght" 370',
          fontSize: '0.95rem',
          lineHeight: 1.5,
          color: PALETTE.ink80,
          margin: '0 0 1.75rem',
        }}>
          {modalConfig.message || 'Please enter your details to continue.'}
        </p>

        <Form
          form={form}
          onFinish={handleSignIn}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label={<span style={{ fontFamily: MONO, fontSize: '0.64rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: PALETTE.ink40 }}>Email</span>}
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input placeholder="you@school.com" autoComplete="email" />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span style={{ fontFamily: MONO, fontSize: '0.64rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: PALETTE.ink40 }}>Password</span>}
            rules={[{ required: true, message: 'Password is required' }]}
          >
            <Input.Password placeholder="••••••••" autoComplete="current-password" />
          </Form.Item>

          <Form.Item style={{ marginTop: '1.5rem', marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              className="plan-primary-btn"
            >
              Sign in
            </Button>
          </Form.Item>
        </Form>

        {/* Divider */}
        <div
          role="separator"
          style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            margin: '1.75rem 0 1.25rem',
          }}
        >
          <span style={{ flex: 1, height: 1, background: PALETTE.line }} />
          <span style={{
            fontFamily: MONO, fontSize: '0.6rem',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: PALETTE.ink40,
          }}>or</span>
          <span style={{ flex: 1, height: 1, background: PALETTE.line }} />
        </div>

        <Button
          type="default"
          block
          onClick={handleRegister}
          className="plan-quiet-btn"
        >
          Create an account
        </Button>

        <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0.4em 0.5em',
              fontFamily: MONO, fontSize: '0.66rem',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: PALETTE.ink40,
              cursor: 'pointer',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = PALETTE.seafoam; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = PALETTE.ink40; }}
          >
            Continue as guest
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AuthModal;
