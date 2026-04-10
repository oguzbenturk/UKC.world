import { useState, useEffect } from 'react';

const STORAGE_KEY = 'cookie_consent_accepted';

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (!accepted) {
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setClosing(true);
    setTimeout(() => setVisible(false), 350);
  };

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes cookieSlideIn {
          from {
            transform: translateY(calc(100% + 24px));
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes cookieSlideOut {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(calc(100% + 24px));
            opacity: 0;
          }
        }
      `}</style>

      <div
        className="fixed z-[9999] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-[420px]"
        style={{
          animation: closing
            ? 'cookieSlideOut 0.35s cubic-bezier(0.4, 0, 1, 1) forwards'
            : 'cookieSlideIn 0.5s cubic-bezier(0, 0, 0.2, 1) forwards',
        }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(62, 75, 80, 0.97) 0%, rgba(55, 68, 74, 0.97) 50%, rgba(48, 62, 68, 0.97) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '16px',
            border: '1px solid rgba(0, 168, 196, 0.15)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.03) inset, 0 1px 0 rgba(255, 255, 255, 0.04) inset',
            padding: '20px',
          }}
        >
          {/* Subtle top-edge highlight */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(0, 168, 196, 0.3), transparent)',
            }}
          />

          {/* Icon + Title row */}
          <div className="flex items-center gap-2.5 mb-3">
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'rgba(0, 168, 196, 0.12)',
                border: '1px solid rgba(0, 168, 196, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00a8c4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
                <path d="M8.5 8.5v.01" />
                <path d="M16 15.5v.01" />
                <path d="M12 12v.01" />
                <path d="M11 17v.01" />
                <path d="M7 14v.01" />
              </svg>
            </div>
            <span
              className="font-duotone-bold"
              style={{
                color: '#ffffff',
                fontSize: '14px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Cookies
            </span>
          </div>

          {/* Body text */}
          <p
            style={{
              color: 'rgba(203, 213, 225, 0.85)',
              fontSize: '13px',
              lineHeight: '1.6',
              margin: '0 0 16px 0',
              fontFamily: "'Gotham', 'Inter', sans-serif",
            }}
          >
            We use essential cookies to keep things running smoothly.
            By staying on this site you agree to our{' '}
            <a
              href="/privacy"
              style={{
                color: '#00a8c4',
                textDecoration: 'none',
                borderBottom: '1px solid rgba(0, 168, 196, 0.3)',
                transition: 'border-color 0.2s, color 0.2s',
              }}
              onMouseOver={(e) => {
                e.target.style.borderBottomColor = '#00a8c4';
                e.target.style.color = '#2dd4e8';
              }}
              onMouseOut={(e) => {
                e.target.style.borderBottomColor = 'rgba(0, 168, 196, 0.3)';
                e.target.style.color = '#00a8c4';
              }}
            >
              cookie policy
            </a>.
          </p>

          {/* Accept button */}
          <button
            onClick={handleAccept}
            className="font-duotone-bold"
            style={{
              width: '100%',
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid rgba(0, 168, 196, 0.4)',
              background: 'linear-gradient(135deg, rgba(0, 168, 196, 0.18) 0%, rgba(0, 168, 196, 0.08) 100%)',
              color: '#00a8c4',
              fontSize: '13px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              outline: 'none',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 168, 196, 0.3) 0%, rgba(0, 168, 196, 0.15) 100%)';
              e.currentTarget.style.borderColor = 'rgba(0, 168, 196, 0.6)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 168, 196, 0.15)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 168, 196, 0.18) 0%, rgba(0, 168, 196, 0.08) 100%)';
              e.currentTarget.style.borderColor = 'rgba(0, 168, 196, 0.4)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.97)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </>
  );
}
