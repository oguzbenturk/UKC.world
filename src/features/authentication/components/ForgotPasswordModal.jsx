// ForgotPasswordModal — Plannivo editorial style.
// See docs/design-system/ for tokens + rationale.
import { useState } from 'react';
import { Modal } from 'antd';
import apiClient from '@/shared/services/apiClient';

const P = {
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
  clay:        '#B9876D',
};

const SERIF = '"Fraunces", "Cormorant Garamond", Georgia, serif';
const SANS  = '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const MONO  = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const FRAME_SHADOW =
  '0 1px 0 rgba(255, 255, 255, 0.8) inset,' +
  '0 40px 80px -40px rgba(20, 30, 40, 0.22),' +
  '0 15px 25px -20px rgba(20, 30, 40, 0.12)';

const ForgotPasswordModal = ({ visible, onClose }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiClient.post('/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      });
      setSuccess(true);
    } catch (err) {
      console.error('Password reset request failed:', err);
      if (err.response?.status === 429) {
        setError('Too many requests. Please wait before trying again.');
      } else {
        // Always show success for non-429 to avoid leaking account existence.
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading && !success) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      centered
      width={440}
      closable={true}
      destroyOnHidden
      className="plannivo-forgot-modal"
      closeIcon={
        <span
          style={{
            color: P.ink40, fontSize: 22, lineHeight: 1,
            fontFamily: SANS, fontWeight: 300,
            transition: 'color 0.2s ease',
            padding: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = P.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = P.ink40; }}
        >
          ×
        </span>
      }
      styles={{
        content: {
          padding: 0,
          backgroundColor: P.bone,
          borderRadius: 14,
          border: `1px solid ${P.line}`,
          boxShadow: FRAME_SHADOW,
          overflow: 'hidden',
        },
        body: { padding: 0 },
        mask: {
          backgroundColor: 'rgba(20, 30, 40, 0.45)',
          backdropFilter: 'blur(2px)',
        },
      }}
    >
      <style>{`
        .plannivo-forgot-modal .plan-input {
          width: 100%;
          padding: 0.95em 1.1em;
          background: ${P.paperSoft};
          border: 1px solid ${P.line};
          border-radius: 10px;
          font-family: ${SANS};
          font-size: 0.95rem;
          color: ${P.ink};
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
        }
        .plannivo-forgot-modal .plan-input::placeholder { color: ${P.ink40}; }
        .plannivo-forgot-modal .plan-input:hover { border-color: ${P.seafoamSoft}; }
        .plannivo-forgot-modal .plan-input:focus {
          outline: none;
          border-color: ${P.seafoam};
          box-shadow: 0 0 0 3px rgba(85, 120, 114, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.35);
        }
        .plannivo-forgot-modal .plan-btn-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 0.55em;
          width: 100%;
          padding: 0.95em 1.6em;
          background: ${P.ink};
          color: ${P.bone};
          border: none;
          border-radius: 999px;
          font-family: ${SANS};
          font-size: 0.93rem; font-weight: 500;
          letter-spacing: 0.005em;
          cursor: pointer;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset, 0 10px 24px -12px rgba(20, 30, 40, 0.4);
          transition: all 0.25s ease;
        }
        .plannivo-forgot-modal .plan-btn-primary:hover:not(:disabled) {
          background: ${P.seafoam};
          transform: translateY(-1px);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset, 0 12px 28px -10px rgba(85, 120, 114, 0.6);
        }
        .plannivo-forgot-modal .plan-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .plannivo-forgot-modal .plan-btn-primary .arrow { transition: transform 0.25s ease; }
        .plannivo-forgot-modal .plan-btn-primary:hover:not(:disabled) .arrow { transform: translateX(3px); }
        .plannivo-forgot-modal .plan-back-link {
          display: inline-flex; align-items: center; gap: 0.5em;
          background: transparent; border: none; padding: 0.4em 0.2em;
          font-family: ${MONO}; font-size: 0.64rem;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: ${P.ink60};
          cursor: pointer;
          transition: color 0.2s ease;
        }
        .plannivo-forgot-modal .plan-back-link:hover { color: ${P.seafoam}; }
      `}</style>

      <div
        style={{
          padding: '2rem 2rem 2.25rem',
          background: P.bone,
          backgroundImage: `radial-gradient(ellipse 520px 320px at 50% 0%, rgba(85,120,114,0.08), transparent 70%)`,
          color: P.ink,
          fontFamily: SANS,
        }}
      >
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55em', marginBottom: '1.5rem' }}>
          <span
            aria-hidden="true"
            style={{
              width: 10, height: 10, borderRadius: '50%',
              background: P.seafoam,
              boxShadow: `0 0 0 3px ${P.seafoamSoft}`,
            }}
          />
          <span style={{
            fontFamily: SERIF,
            fontVariationSettings: '"opsz" 9, "SOFT" 0, "wght" 460',
            fontSize: '1.1rem',
            letterSpacing: '-0.015em',
          }}>
            Plannivo
          </span>
        </div>

        {!success ? (
          <>
            {/* Kicker */}
            <p style={{
              fontFamily: MONO,
              fontSize: '0.68rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: P.ink40,
              margin: '0 0 1em',
              display: 'flex', alignItems: 'center', gap: '0.6em',
            }}>
              <span style={{
                display: 'inline-block',
                padding: '3px 8px',
                background: P.ink, color: P.bone,
                borderRadius: 3,
                fontSize: '0.6rem',
                letterSpacing: '0.08em',
                fontWeight: 500,
              }}>00</span>
              Password reset
            </p>

            {/* Title + subtitle */}
            <h2 style={{
              fontFamily: SERIF,
              fontVariationSettings: '"opsz" 60, "SOFT" 30, "wght" 400',
              fontSize: '1.75rem',
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              color: P.ink,
              margin: '0 0 0.4em',
            }}>
              Forgot your{' '}
              <em style={{
                fontStyle: 'italic',
                fontVariationSettings: '"opsz" 60, "SOFT" 80, "wght" 380',
                color: P.seafoam,
              }}>password?</em>
            </h2>

            <p style={{
              fontFamily: SERIF,
              fontVariationSettings: '"opsz" 18, "SOFT" 0, "wght" 370',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              color: P.ink80,
              margin: '0 0 1.75rem',
            }}>
              Drop your email and we'll send a reset link. It expires in one hour.
            </p>

            {/* Error */}
            {error && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem 0.95rem',
                  marginBottom: '1.25rem',
                  borderRadius: 8,
                  background: 'rgba(139, 74, 58, 0.08)',
                  border: '1px solid rgba(139, 74, 58, 0.26)',
                  color: '#7a3f32',
                  fontFamily: SANS,
                  fontSize: '0.86rem',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            {/* Email field */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="forgot-email"
                style={{
                  display: 'block',
                  fontFamily: MONO,
                  fontSize: '0.6rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: P.ink40,
                  marginBottom: '0.5em',
                }}
              >
                Email
              </label>
              <input
                id="forgot-email"
                className="plan-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="you@school.com"
                autoComplete="email"
                autoFocus
              />
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="plan-btn-primary"
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" fill="none" />
                    <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  Send reset link
                  <svg className="arrow" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>

            {/* Back link */}
            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button type="button" onClick={handleClose} className="plan-back-link">
                ← Back to sign in
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Success state */}
            <p style={{
              fontFamily: MONO,
              fontSize: '0.68rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: P.ink40,
              margin: '0 0 1em',
              display: 'flex', alignItems: 'center', gap: '0.6em',
            }}>
              <span style={{
                display: 'inline-block',
                padding: '3px 8px',
                background: P.seafoam, color: P.bone,
                borderRadius: 3,
                fontSize: '0.6rem',
                letterSpacing: '0.08em',
                fontWeight: 500,
              }}>01</span>
              Sent
            </p>

            <h2 style={{
              fontFamily: SERIF,
              fontVariationSettings: '"opsz" 60, "SOFT" 30, "wght" 400',
              fontSize: '1.75rem',
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              color: P.ink,
              margin: '0 0 0.4em',
            }}>
              Check{' '}
              <em style={{
                fontStyle: 'italic',
                fontVariationSettings: '"opsz" 60, "SOFT" 80, "wght" 380',
                color: P.seafoam,
              }}>your inbox.</em>
            </h2>

            <p style={{
              fontFamily: SERIF,
              fontVariationSettings: '"opsz" 18, "SOFT" 0, "wght" 370',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              color: P.ink80,
              margin: '0 0 1.5rem',
            }}>
              If an account exists with <strong style={{ color: P.ink, fontWeight: 500 }}>{email}</strong>, a reset link is on its way.
            </p>

            {/* Didn't receive it? */}
            <div
              style={{
                background: P.paperSoft,
                border: `1px solid ${P.line}`,
                borderRadius: 10,
                padding: '1rem 1.1rem',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{
                fontFamily: MONO,
                fontSize: '0.6rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: P.ink40,
                margin: '0 0 0.6em',
              }}>Didn't receive it?</p>
              <p style={{
                margin: 0,
                fontFamily: SANS,
                fontSize: '0.85rem',
                lineHeight: 1.5,
                color: P.ink80,
              }}>
                Check your spam folder, or confirm the address was correct. The link expires in one hour.
              </p>
            </div>

            <button type="button" onClick={handleClose} className="plan-btn-primary">
              Return to sign in
              <svg className="arrow" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ForgotPasswordModal;
