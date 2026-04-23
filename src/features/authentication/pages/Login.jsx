import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/shared/utils/antdStatic';
import { usePageSEO } from '@/shared/utils/seo';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import { SIGN_IN_DISABLED_USER_MESSAGE } from '@/shared/services/auth/authService';
import RegisterModal from '../components/RegisterModal';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import dpcLogo from '../../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';
import { UkcBrandDot } from '@/shared/components/ui/UkcBrandDot';

const DashboardIcon = (props) => (
  <svg {...props} viewBox="0 0 20 20" fill="currentColor">
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
);

const CalendarIcon = (props) => (
  <svg {...props} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
  </svg>
);

const EquipmentIcon = (props) => (
  <svg {...props} viewBox="0 0 20 20" fill="currentColor">
    <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
  </svg>
);

const FinanceIcon = (props) => (
  <svg {...props} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
  </svg>
);

const UsersIcon = (props) => (
  <svg {...props} viewBox="0 0 20 20" fill="currentColor">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
);

const FEATURE_CONFIG = [
  { key: 'dashboard', Icon: DashboardIcon },
  { key: 'lessons', Icon: CalendarIcon },
  { key: 'rentals', Icon: EquipmentIcon },
  { key: 'finance', Icon: FinanceIcon },
  { key: 'community', Icon: UsersIcon },
];

const Login = () => {
  const { t } = useTranslation(['public', 'errors']);
  usePageSEO({
    title: 'Login | UKC•',
    description: 'Sign in to manage lessons, rentals, customers, and operations at Duotone Pro Center Urla.',
    path: '/login'
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

  useEffect(() => {
    if (!didPrefill.current) {
      const rememberedEmail = localStorage.getItem('rememberedEmail');
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRememberMe(true);
      }
      localStorage.removeItem('rememberedPassword');
      didPrefill.current = true;

      if (location.state?.showForgotPassword) {
        setShowForgotPasswordModal(true);
      }
    }
  }, [location.state]);

  useEffect(() => {
    if (authError) {
      setError(getFriendlyError(authError));
    }
  }, [authError]);

  useEffect(() => {
    return () => clearError?.();
  }, [clearError]);

  const getFriendlyError = (msg) => {
    if (!msg) return '';
    if (msg === SIGN_IN_DISABLED_USER_MESSAGE) return msg;
    const lower = msg.toLowerCase();
    if (lower.includes('authentication')) {
      return t('public:login.errors.incorrect');
    }
    if (lower.includes('network')) {
      return t('public:login.errors.networkError');
    }
    if (lower.includes('token')) {
      return t('public:login.errors.sessionExpired');
    }
    return msg;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError?.();
    setError('');

    if (!email.trim()) {
      setError(t('public:login.errors.enterEmail'));
      return;
    }
    if (!password.trim()) {
      setError(t('public:login.errors.enterPassword'));
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result) {
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
        navigate('/admin/dashboard');
      } else {
        setError(t('public:login.errors.incorrect'));
      }
    } catch (err) {
      setError(err.message || t('public:login.errors.genericFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setShowForgotPasswordModal(true);
  };

  const brandName = t('public:brand.name');

  return (
    <div className="min-h-screen bg-[#0f1013] relative overflow-hidden flex items-center justify-center py-4 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-0 -left-4 w-96 h-96 opacity-40 animate-blob pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,168,196,0.3) 0%, rgba(0,168,196,0) 70%)' }}></div>
      <div className="absolute top-0 -right-4 w-96 h-96 opacity-40 animate-blob animation-delay-2000 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(75,79,84,0.4) 0%, rgba(75,79,84,0) 70%)' }}></div>
      <div className="absolute -bottom-8 left-20 w-96 h-96 opacity-40 animate-blob animation-delay-4000 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,168,196,0.2) 0%, rgba(0,168,196,0) 70%)' }}></div>

      <div className="relative w-full max-w-5xl">
        <div className="lg:flex lg:items-stretch overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">

          <div className="w-full lg:w-1/2 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <span className="font-gotham-bold text-4xl text-white tracking-tight inline-flex items-baseline">
                  UKC
                  <UkcBrandDot className="ml-[0.08em]" style={{ top: '-0.02em' }} />
                </span>
              </div>

              <img
                src={dpcLogo}
                alt={brandName}
                className="h-10 w-auto mx-auto mb-5"
              />

              <h1 className="font-duotone-bold-extended text-2xl text-white mb-2 uppercase tracking-tight">{t('public:login.title')}</h1>
              <p className="font-duotone-regular text-gray-400 text-sm">
                {t('public:login.welcome', { brand: brandName })}
              </p>
            </div>

            {error && (
              <div
                className={
                  error === SIGN_IN_DISABLED_USER_MESSAGE
                    ? 'bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 mb-6'
                    : 'bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6'
                }
              >
                <p
                  className={
                    error === SIGN_IN_DISABLED_USER_MESSAGE
                      ? 'font-duotone-regular text-amber-200/90 text-sm text-center'
                      : 'font-duotone-regular text-red-400 text-sm text-center'
                  }
                >
                  {error}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-duotone-bold text-xs uppercase tracking-wider text-gray-400 mb-2">
                  {t('public:login.emailLabel')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full font-duotone-regular bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-duotone-blue/50 focus:border-duotone-blue/50 transition-all"
                  placeholder={t('public:login.emailPlaceholder')}
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block font-duotone-bold text-xs uppercase tracking-wider text-gray-400">
                    {t('public:login.passwordLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="font-duotone-regular text-xs text-duotone-blue hover:text-duotone-blue/80 transition-colors"
                  >
                    {t('public:login.forgotPassword')}
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full font-duotone-regular bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-duotone-blue/50 focus:border-duotone-blue/50 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded bg-white/5 border-white/10 text-duotone-blue focus:ring-duotone-blue focus:ring-offset-black"
                />
                <label htmlFor="remember-me" className="ml-2 font-duotone-regular text-sm text-gray-400">
                  {t('public:login.rememberMe')}
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full font-duotone-bold bg-antrasit border border-duotone-blue/30 text-duotone-blue py-3 px-6 rounded-xl hover:bg-[#525759] hover:border-duotone-blue/60 transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  boxShadow: '0 0 15px rgba(0,168,196,0.1)',
                  letterSpacing: '0.1em'
                }}
              >
                {isLoading ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <>
                    {t('public:login.signIn')}
                    <div className="w-px h-3 bg-duotone-blue/30 mx-1 group-hover:bg-duotone-blue/60 transition-colors"></div>
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 text-center lg:hidden">
              <p className="font-duotone-regular text-sm text-gray-500 mb-4">
                {t('public:login.mobileNoAccount')}
              </p>
              <button
                onClick={() => setShowRegisterModal(true)}
                className="font-duotone-bold text-xs uppercase tracking-widest text-white hover:text-duotone-blue transition-colors underline underline-offset-8"
              >
                {t('public:login.createAccountLink')}
              </button>
            </div>
          </div>

          <div className="hidden lg:flex lg:w-1/2 p-8 bg-white/5 border-l border-white/5 flex-col justify-between">
            <div>
              <h2 className="font-duotone-bold-extended text-xl text-white mb-4">{t('public:login.rightTagline')}</h2>
              <div className="space-y-4">
                {FEATURE_CONFIG.map(({ key, Icon }) => (
                  <div key={key} className="flex items-center gap-4 group">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-duotone-blue border border-white/10 group-hover:bg-duotone-blue group-hover:text-white transition-all duration-300">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-duotone-regular text-gray-300">{t(`public:login.features.${key}`)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 p-6 rounded-2xl bg-duotone-blue/10 border border-duotone-blue/20">
              <p className="font-duotone-regular text-sm text-gray-300 mb-6 italic">
                {t('public:login.rightQuote')}
              </p>
              <div className="flex flex-col gap-4">
                <p className="font-duotone-bold text-xs uppercase tracking-widest text-duotone-blue">
                  {t('public:login.rightNewHere')}
                </p>
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="font-duotone-bold bg-white text-antrasit py-3 px-6 rounded-xl hover:bg-gray-100 transition-all text-center tracking-widest"
                >
                  {t('public:login.rightCreateCta')}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

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
