import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePageSEO } from '@/shared/utils/seo';
import { useAuth } from '@/shared/hooks/useAuth';
import { SIGN_IN_DISABLED_USER_MESSAGE } from '@/shared/services/auth/authService';
import RegisterModal from '../components/RegisterModal';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

/**
 * Login — Plannivo editorial style.
 * Depth comes from layered cream surfaces (bone → paper → paper-soft),
 * the product-frame shadow, horizon-line signature, and marginalia.
 * See docs/design-system/ for tokens + rationale.
 */

const P = {
  bone:        '#F0EADD',
  paper:       '#F5F0E3',
  paperSoft:   '#F8F4EA',
  ink:         '#141E28',
  ink80:       'rgba(20, 30, 40, 0.80)',
  ink60:       'rgba(20, 30, 40, 0.60)',
  ink40:       'rgba(20, 30, 40, 0.42)',
  ink20:       'rgba(20, 30, 40, 0.20)',
  ink10:       'rgba(20, 30, 40, 0.10)',
  line:        '#D8CEB6',
  lineSoft:    '#E3DAC4',
  seafoam:     '#557872',
  seafoamSoft: '#A7BAB4',
  clay:        '#B9876D',
  sand:        '#E5DCC8',
};

const SERIF = '"Fraunces", "Cormorant Garamond", Georgia, serif';
const SANS  = '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const MONO  = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const FRAME_SHADOW =
  '0 1px 0 rgba(255, 255, 255, 0.8) inset,' +
  '0 40px 80px -40px rgba(20, 30, 40, 0.22),' +
  '0 15px 25px -20px rgba(20, 30, 40, 0.12)';

const FEATURE_LIST = [
  { num: '01', title: 'Bookings & calendar',     copy: 'Lessons, rentals, group matching, no-show windows.' },
  { num: '02', title: 'Students & CRM',          copy: 'Progress logs, waivers, family groups, gear preferences.' },
  { num: '03', title: 'Finance & payroll',       copy: 'Iyzico, Stripe, cash-at-centre, instructor commissions.' },
  { num: '04', title: 'Instructors & inventory', copy: 'Availability, payroll, gear life, repair workflows.' },
];

/** Format time as HH:MM local. Harmless marginalia. */
const useClock = () => {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};

const Login = () => {
  usePageSEO({
    title: 'Sign in · Plannivo',
    description: 'Sign in to manage your Plannivo platform.',
    path: '/login',
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login, error: authError, clearError } = useAuth();
  const didPrefill = useRef(false);
  const clock = useClock();

  useEffect(() => {
    if (didPrefill.current) return;
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
    localStorage.removeItem('rememberedPassword');
    didPrefill.current = true;
    if (location.state?.showForgotPassword) setShowForgotPasswordModal(true);
  }, [location.state]);

  useEffect(() => {
    if (authError) setError(getFriendlyError(authError));
  }, [authError]);

  useEffect(() => () => clearError?.(), [clearError]);

  const getFriendlyError = (msg) => {
    if (!msg) return '';
    if (msg === SIGN_IN_DISABLED_USER_MESSAGE) return msg;
    const lower = msg.toLowerCase();
    if (lower.includes('authentication')) return 'Email or password is incorrect.';
    if (lower.includes('network'))        return 'Could not reach server. Check your connection.';
    if (lower.includes('token'))          return 'Session expired. Please sign in again.';
    return msg;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError?.();
    setError('');
    if (!email.trim())    { setError('Please enter your email address'); return; }
    if (!password.trim()) { setError('Please enter your password');      return; }

    setIsLoading(true);
    try {
      const result = await login(email, password);
      if (result) {
        if (rememberMe) localStorage.setItem('rememberedEmail', email);
        else            localStorage.removeItem('rememberedEmail');
        navigate('/admin/dashboard');
      } else {
        setError('Email or password is incorrect.');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: P.bone,
        backgroundImage: [
          `radial-gradient(ellipse 1200px 500px at 50% -5%,  rgba(85, 120, 114, 0.08), transparent 65%)`,
          `radial-gradient(ellipse 900px  400px at 100% 45%, rgba(185, 135, 109, 0.06), transparent 65%)`,
          `radial-gradient(ellipse 900px  400px at 0%   85%, rgba(85, 120, 114, 0.05), transparent 65%)`,
        ].join(', '),
        color: P.ink,
        fontFamily: SANS,
        fontFeatureSettings: '"ss01","ss02"',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Paper grain — shared with landing page */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          opacity: 0.55, mixBlendMode: 'multiply',
          backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.08  0 0 0 0 0.12  0 0 0 0 0.16  0 0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          zIndex: 0,
        }}
      />

      {/* Top hairline — signature from plannivo.com */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 1, background: P.line, zIndex: 1,
        }}
      />

      <style>{`
        .login-shell {
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 1024px) {
          .login-shell { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; gap: 4.5rem !important; align-items: center; }
          .login-right { display: block !important; }
        }
        .plan-input {
          width: 100%;
          padding: 0.95em 1.1em;
          background: ${P.bone};
          border: 1px solid ${P.line};
          border-radius: 10px;
          font-family: ${SANS};
          font-size: 0.95rem;
          color: ${P.ink};
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
        }
        .plan-input::placeholder { color: ${P.ink40}; }
        .plan-input:hover { border-color: ${P.seafoamSoft}; }
        .plan-input:focus {
          outline: none;
          border-color: ${P.seafoam};
          box-shadow: 0 0 0 3px rgba(85, 120, 114, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.35);
          background: ${P.paperSoft};
        }
        .plan-btn-primary {
          position: relative;
          overflow: hidden;
          background: ${P.ink};
          color: ${P.bone};
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset, 0 10px 24px -12px rgba(20, 30, 40, 0.4);
          transition: all 0.25s ease;
        }
        .plan-btn-primary::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 40%);
          pointer-events: none;
        }
        .plan-btn-primary:hover:not(:disabled) {
          background: ${P.seafoam};
          transform: translateY(-1px);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset, 0 12px 28px -10px rgba(85, 120, 114, 0.6);
        }
        .plan-btn-primary:hover:not(:disabled) svg.arrow { transform: translateX(3px); }
        .plan-btn-primary svg.arrow { transition: transform 0.25s ease; }
        .plan-link-btn {
          background: transparent;
          border: none;
          padding: 0;
          color: ${P.ink60};
          cursor: pointer;
          transition: color 0.2s ease, border-color 0.2s ease;
        }
        .plan-link-btn:hover { color: ${P.seafoam}; }
        .plan-feature-row {
          transition: background 0.35s ease, padding-left 0.35s ease;
          position: relative;
        }
        .plan-feature-row:hover {
          background: linear-gradient(to bottom, transparent, rgba(85, 120, 114, 0.05));
        }
        .plan-feature-row::before {
          content: '';
          position: absolute; left: 0; top: 1.35rem; bottom: 1.35rem;
          width: 0;
          background: ${P.seafoam};
          transition: width 0.25s ease;
        }
        .plan-feature-row:hover::before { width: 2px; }
        .plan-reveal { opacity: 0; transform: translateY(8px); animation: plan-rise 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards; animation-delay: var(--d, 0ms); }
        @keyframes plan-rise { to { opacity: 1; transform: translateY(0); } }
        .horizon-line {
          stroke-dasharray: 1600;
          stroke-dashoffset: 1600;
          animation: draw 2.4s cubic-bezier(0.22, 1, 0.36, 1) 0.3s forwards;
        }
        .horizon-dot  { opacity: 0; animation: fade-in 1s ease 1.8s forwards; }
        .horizon-text { opacity: 0; animation: fade-in 1s ease 2.1s forwards; }
        @keyframes draw { to { stroke-dashoffset: 0; } }
        @keyframes fade-in { to { opacity: 1; } }
        .pulse {
          animation: pulse 2.4s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.72); }
        }
        @media (prefers-reduced-motion: reduce) {
          .plan-reveal, .horizon-line, .horizon-dot, .horizon-text, .pulse {
            animation: none; opacity: 1; transform: none; stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* ── Masthead ────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.5rem clamp(1.25rem, 4vw, 3.5rem) 1.25rem',
          maxWidth: 1400,
          margin: '0 auto',
        }}
      >
        <a
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.55em',
            textDecoration: 'none',
            color: P.ink,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 11, height: 11, borderRadius: '50%',
              background: P.seafoam,
              boxShadow: `0 0 0 4px ${P.seafoamSoft}`,
            }}
          />
          <span style={{
            fontFamily: SERIF,
            fontVariationSettings: '"opsz" 9, "SOFT" 0, "wght" 460',
            fontSize: '1.35rem',
            letterSpacing: '-0.02em',
          }}>
            Plannivo
          </span>
        </a>

        <span style={{
          fontFamily: MONO,
          fontSize: '0.66rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: P.ink40,
        }}>
          Member sign-in · v2
        </span>
      </header>

      {/* Horizon rule under masthead */}
      <div
        aria-hidden="true"
        style={{
          height: 1,
          margin: '0 clamp(1.25rem, 4vw, 3.5rem)',
          background: `linear-gradient(to right, transparent, ${P.line} 8%, ${P.line} 92%, transparent)`,
          position: 'relative', zIndex: 2,
        }}
      />

      {/* ── Main shell ─────────────────────────────────────────────── */}
      <main
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'grid',
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(2.5rem, 7vh, 5.5rem) clamp(1.25rem, 4vw, 3.5rem) clamp(2rem, 5vh, 4rem)',
          gap: '2.5rem',
        }}
        className="login-shell"
      >
        {/* ── LEFT · Form in a paper card ─────────────────────────── */}
        <section className="plan-reveal" style={{ '--d': '0ms' }}>
          {/* Kicker */}
          <p
            style={{
              fontFamily: MONO,
              fontSize: '0.7rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: P.ink40,
              margin: '0 0 1em',
              display: 'flex', alignItems: 'center', gap: '0.6em',
            }}
          >
            <span style={{
              display: 'inline-block',
              padding: '3px 8px',
              background: P.ink,
              color: P.bone,
              borderRadius: 3,
              fontSize: '0.62rem',
              letterSpacing: '0.08em',
              fontWeight: 500,
            }}>00</span>
            Welcome back
          </p>

          {/* Headline */}
          <h1 style={{
            fontFamily: SERIF,
            fontVariationSettings: '"opsz" 96, "SOFT" 40, "wght" 400',
            fontSize: 'clamp(2rem, 3.6vw, 2.8rem)',
            lineHeight: 1.04,
            letterSpacing: '-0.022em',
            color: P.ink,
            margin: '0 0 0.5em',
            maxWidth: '14ch',
          }}>
            Sign in,{' '}
            <em style={{
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 96, "SOFT" 80, "wght" 380',
              color: P.seafoam,
            }}>
              get to work.
            </em>
          </h1>

          {/* Lede */}
          <p style={{
            fontFamily: SERIF,
            fontVariationSettings: '"opsz" 18, "SOFT" 0, "wght" 370',
            fontSize: '1.05rem',
            lineHeight: 1.55,
            color: P.ink80,
            margin: '0 0 2.5rem',
            maxWidth: '38ch',
          }}>
            Your calendar, your students, your season — held together in one calm, continuous surface.
          </p>

          {/* ── Form card ── */}
          <div
            style={{
              background: P.paperSoft,
              border: `1px solid ${P.line}`,
              borderRadius: 14,
              padding: 'clamp(1.5rem, 3vw, 2rem)',
              boxShadow: FRAME_SHADOW,
              position: 'relative',
              maxWidth: 460,
            }}
          >
            {/* Editorial corner marker — "01" */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -11,
                left: 24,
                background: P.bone,
                padding: '0 0.6em',
                fontFamily: MONO,
                fontSize: '0.6rem',
                letterSpacing: '0.18em',
                color: P.ink40,
                textTransform: 'uppercase',
              }}
            >
              Credentials
            </span>

            {/* Error */}
            {error && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem 0.95rem',
                  marginBottom: '1.25rem',
                  borderRadius: 8,
                  background: error === SIGN_IN_DISABLED_USER_MESSAGE
                    ? 'rgba(185, 135, 109, 0.10)'
                    : 'rgba(139, 74, 58, 0.08)',
                  border: `1px solid ${
                    error === SIGN_IN_DISABLED_USER_MESSAGE
                      ? 'rgba(185, 135, 109, 0.30)'
                      : 'rgba(139, 74, 58, 0.26)'
                  }`,
                  color: error === SIGN_IN_DISABLED_USER_MESSAGE ? '#6B4A37' : '#7a3f32',
                  fontFamily: SANS,
                  fontSize: '0.86rem',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.1rem' }}>
                <label
                  htmlFor="login-email"
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
                  id="login-email"
                  className="plan-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@school.com"
                  required
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'baseline', marginBottom: '0.5em',
                }}>
                  <label
                    htmlFor="login-password"
                    style={{
                      fontFamily: MONO,
                      fontSize: '0.6rem',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: P.ink40,
                    }}
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPasswordModal(true)}
                    className="plan-link-btn"
                    style={{
                      fontFamily: MONO,
                      fontSize: '0.6rem',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Forgot?
                  </button>
                </div>
                <input
                  id="login-password"
                  className="plan-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>

              {/* Remember me */}
              <label
                htmlFor="remember-me"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.6em',
                  margin: '0 0 1.5rem',
                  fontFamily: SANS,
                  fontSize: '0.86rem',
                  color: P.ink60,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    width: 15, height: 15,
                    accentColor: P.seafoam,
                    cursor: 'pointer',
                  }}
                />
                Stay signed in on this device
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="plan-btn-primary"
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.65em',
                  padding: '1em 1.6em',
                  border: 'none',
                  borderRadius: 999,
                  fontFamily: SANS,
                  fontSize: '0.94rem',
                  fontWeight: 500,
                  letterSpacing: '0.005em',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.65 : 1,
                }}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" fill="none" />
                      <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <span aria-hidden="true" style={{
                      width: 1, height: 12,
                      background: 'rgba(240, 234, 221, 0.3)',
                      margin: '0 0.15em',
                    }} />
                    <svg className="arrow" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>

              <p style={{
                margin: '1.5rem 0 0',
                textAlign: 'center',
                fontFamily: SANS,
                fontSize: '0.86rem',
                color: P.ink60,
              }}>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(true)}
                  className="plan-link-btn"
                  style={{
                    color: P.ink,
                    fontFamily: SANS,
                    fontSize: '0.86rem',
                    fontWeight: 500,
                    borderBottom: `1px solid ${P.ink20}`,
                    paddingBottom: 1,
                  }}
                >
                  Create an account
                </button>
              </p>
            </form>
          </div>

          {/* Marginalia below card */}
          <p style={{
            marginTop: '1.5rem',
            fontFamily: MONO,
            fontSize: '0.62rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: P.ink40,
          }}>
            Encrypted transport · Session cookies · GDPR-ready
          </p>
        </section>

        {/* ── RIGHT · Editorial feature list ──────────────────────── */}
        <aside
          className="login-right plan-reveal"
          style={{ display: 'none', '--d': '180ms' }}
        >
          <p style={{
            fontFamily: MONO,
            fontSize: '0.7rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: P.ink40,
            margin: '0 0 1.25em',
            display: 'flex', alignItems: 'center', gap: '0.6em',
          }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 8px',
              background: P.ink,
              color: P.bone,
              borderRadius: 3,
              fontSize: '0.62rem',
              letterSpacing: '0.08em',
              fontWeight: 500,
            }}>01</span>
            A single surface
          </p>

          <h2 style={{
            fontFamily: SERIF,
            fontVariationSettings: '"opsz" 96, "SOFT" 40, "wght" 400',
            fontSize: 'clamp(1.7rem, 2.8vw, 2.3rem)',
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            margin: '0 0 1.75rem',
          }}>
            Ten tools{' '}
            <em style={{
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 96, "SOFT" 80, "wght" 380',
              color: P.seafoam,
            }}>collapsed</em>
            <br />
            into one quiet interface.
          </h2>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {FEATURE_LIST.map((f) => (
              <li
                key={f.num}
                className="plan-feature-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3.5ch 1fr',
                  gap: '1.25rem',
                  padding: '1.35rem 1.25rem 1.35rem 0.75rem',
                  borderTop: `1px solid ${P.line}`,
                }}
              >
                <span style={{
                  fontFamily: MONO,
                  fontSize: '0.68rem',
                  letterSpacing: '0.1em',
                  color: P.ink40,
                  paddingTop: '0.3em',
                }}>{f.num}</span>
                <div>
                  <h3 style={{
                    fontFamily: SERIF,
                    fontVariationSettings: '"opsz" 30, "SOFT" 20, "wght" 500',
                    fontSize: '1.15rem',
                    letterSpacing: '-0.012em',
                    margin: '0 0 0.4em',
                    color: P.ink,
                  }}>{f.title}</h3>
                  <p style={{
                    margin: 0,
                    fontFamily: SANS,
                    fontSize: '0.92rem',
                    lineHeight: 1.55,
                    color: P.ink60,
                    maxWidth: '36ch',
                  }}>{f.copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </main>

      {/* ── Horizon art — bottom signature ───────────────────────── */}
      <svg
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          display: 'block',
          width: '100%',
          height: 'clamp(3rem, 7vh, 5rem)',
          color: P.ink,
          position: 'relative',
          zIndex: 2,
          marginTop: 'clamp(1.5rem, 4vh, 3rem)',
        }}
      >
        <line
          className="horizon-line"
          x1="40" y1="80" x2="1400" y2="80"
          stroke="currentColor" strokeWidth="1" strokeOpacity="0.28"
        />
        <circle className="horizon-dot" cx="1220" cy="80" r="46" fill="none" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.35" />
        <circle className="horizon-dot" cx="1220" cy="80" r="20" fill="none" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.55" />
        <circle className="horizon-dot" cx="1220" cy="80" r="3"  fill="currentColor" opacity="0.6" />
        <text x="40"   y="68" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="currentColor" fillOpacity="0.45" letterSpacing="2" className="horizon-text">N 38°22′ · Urla</text>
        <text x="1040" y="68" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="currentColor" fillOpacity="0.45" letterSpacing="2" className="horizon-text">{clock} — local</text>
        <text x="40"  y="102" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="currentColor" fillOpacity="0.45" letterSpacing="2" className="horizon-text">LIVE FROM THE BEACH</text>
      </svg>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer
        style={{
          position: 'relative',
          zIndex: 2,
          borderTop: `1px solid ${P.line}`,
          padding: '1rem clamp(1.25rem, 4vw, 3.5rem)',
          maxWidth: 1400,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          fontFamily: MONO,
          fontSize: '0.64rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: P.ink40,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6em' }}>
          <span
            aria-hidden="true"
            className="pulse"
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: P.seafoam,
              boxShadow: `0 0 0 3px ${P.seafoamSoft}`,
              display: 'inline-block',
            }}
          />
          Plannivo · Urla, TR / Hamburg, DE
        </span>
        <span>© {new Date().getFullYear()} Plannivo · Est. Urla</span>
      </footer>

      {/* Modals */}
      <RegisterModal
        visible={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSuccess={() => setShowRegisterModal(false)}
      />
      <ForgotPasswordModal
        visible={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </div>
  );
};

export default Login;
