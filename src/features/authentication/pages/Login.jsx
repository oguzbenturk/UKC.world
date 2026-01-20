import { useState, useEffect, useRef } from 'react';
import { message } from '@/shared/utils/antdStatic';
import { usePageSEO } from '@/shared/utils/seo';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import RegisterModal from '../components/RegisterModal';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

// Feature icons as static components (not recreated on each render)
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

const AIIcon = (props) => (
  <svg {...props} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
  </svg>
);

// Static features data
const FEATURES = [
  { text: 'Dashboard Analytics', Icon: DashboardIcon },
  { text: 'Easy Booking', Icon: CalendarIcon },
  { text: 'Equipment & Rentals', Icon: EquipmentIcon },
  { text: 'Track Finances', Icon: FinanceIcon },
  { text: 'User Management', Icon: UsersIcon },
  { text: 'AI-Powered Insights', Icon: AIIcon },
];

const Login = () => {
  usePageSEO({
    title: 'Login | Plannivo',
    description: 'Sign in to manage lessons, rentals, customers, and operations.',
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

  // Load remembered email on mount
  useEffect(() => {
    if (!didPrefill.current) {
      const rememberedEmail = localStorage.getItem('rememberedEmail');
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRememberMe(true);
      }
      // Cleanup old password storage
      localStorage.removeItem('rememberedPassword');
      didPrefill.current = true;
      
      // Check if navigated with state to show forgot password modal
      if (location.state?.showForgotPassword) {
        setShowForgotPasswordModal(true);
      }
    }
  }, [location.state]);

  // Sync auth error to local state
  useEffect(() => {
    if (authError) {
      setError(getFriendlyError(authError));
    }
  }, [authError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearError?.();
  }, [clearError]);

  const getFriendlyError = (msg) => {
    if (!msg) return '';
    const lower = msg.toLowerCase();
    if (lower.includes('authentication')) {
      return 'Email or password is incorrect.';
    }
    if (lower.includes('network')) {
      return 'Could not reach server. Check your connection.';
    }
    if (lower.includes('token')) {
      return 'Session expired. Please sign in again.';
    }
    return msg;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError?.();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(email, password);
      
      if (result) {
        // Save email if remember me is checked
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
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

  const handleForgotPassword = () => {
    setShowForgotPasswordModal(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Scrollable container */}
      <div className="min-h-screen overflow-y-auto py-8 px-4">
        <div className="max-w-md mx-auto lg:max-w-4xl">
          
          {/* Main Card */}
          <div className="bg-slate-800/90 backdrop-blur rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden">
            <div className="lg:flex">
              
              {/* Login Form Section */}
              <div className="p-6 sm:p-8 lg:w-1/2">
                {/* Logo & Header */}
                <div className="text-center mb-6">
                  <img 
                    src="/logo.png?v=3" 
                    alt="Plannivo" 
                    className="w-48 h-auto mx-auto mb-4"
                  />
                  <h1 className="text-2xl font-bold text-white">Member Login</h1>
                  <p className="text-slate-400 text-sm mt-1">
                    Access your dashboard and manage activities
                  </p>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-900/30 border border-red-800/50 rounded-lg p-3 mb-4">
                    <p className="text-red-300 text-sm text-center">{error}</p>
                  </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-3 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label htmlFor="password" className="text-sm font-medium text-slate-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs text-sky-400 hover:text-sky-300"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      id="remember"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500"
                    />
                    <label htmlFor="remember" className="ml-2 text-sm text-slate-300">
                      Remember me
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </form>

                {/* Mobile: Register CTA */}
                <div className="mt-6 pt-4 border-t border-slate-700 lg:hidden">
                  <p className="text-slate-400 text-sm text-center mb-3">
                    Don't have an account?
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(true)}
                    className="w-full py-2.5 border border-sky-500 text-sky-400 hover:bg-sky-500/10 font-medium rounded-lg transition-colors"
                  >
                    Create Account
                  </button>
                </div>
              </div>

              {/* Features Section - Desktop */}
              <div className="hidden lg:block lg:w-1/2 p-8 bg-slate-900/50">
                <h2 className="text-xl font-bold text-white mb-2">Welcome to Plannivo</h2>
                <p className="text-slate-400 text-sm mb-6">
                  Complete management solution for kitesurfing schools and rentals.
                </p>

                <div className="grid grid-cols-1 gap-3">
                  {FEATURES.map(({ text, Icon }) => (
                    <div key={text} className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-sky-400 flex-shrink-0" />
                      <span className="text-slate-300 text-sm">{text}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 pt-6 border-t border-slate-700">
                  <p className="text-slate-400 text-sm mb-3">
                    Don't have an account?
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(true)}
                    className="w-full py-2.5 border border-sky-500 text-sky-400 hover:bg-sky-500/10 font-medium rounded-lg transition-colors"
                  >
                    Create Account
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: Features below the card */}
          <div className="mt-6 lg:hidden">
            <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4 text-center">
                Why Plannivo?
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {FEATURES.map(({ text, Icon }) => (
                  <div key={text} className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-sky-400 flex-shrink-0" />
                    <span className="text-slate-300 text-xs">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Register Modal */}
      <RegisterModal
        visible={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSuccess={() => setShowRegisterModal(false)}
      />
      
      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        visible={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </div>
  );
};

export default Login;
