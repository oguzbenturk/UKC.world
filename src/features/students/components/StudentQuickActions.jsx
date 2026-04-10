import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PlusIcon, CalendarDaysIcon, WrenchScrewdriverIcon, AcademicCapIcon, ShoppingBagIcon, WalletIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAIChat } from '@/shared/contexts/AIChatContext';

const STUDENT_ROLES = ['student', 'trusted_customer'];
const HIDDEN_EXACT_PATHS = ['/', '/login', '/register', '/reset-password', '/academy', '/guest'];
const HIDDEN_PATH_PREFIXES = ['/shop', '/f/', '/quick/', '/group-invitation/'];

const StudentQuickActions = () => {
  const { user, isAuthenticated } = useAuth();
  const { openChat } = useAIChat();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const isHidden =
    HIDDEN_EXACT_PATHS.includes(location.pathname) ||
    HIDDEN_PATH_PREFIXES.some((p) => location.pathname.startsWith(p));

  const isStudent =
    isAuthenticated &&
    user &&
    STUDENT_ROLES.includes(user.role?.toLowerCase?.() || '');

  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  if (!isStudent || isHidden) return null;

  const handleAction = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3">
      {/* Action menu */}
      {isOpen && (
        <div className="flex flex-col items-end gap-2 mb-1 animate-in fade-in slide-in-from-bottom-3 duration-200">
          {[
            { path: '/academy',          label: 'Visit Lessons',    icon: AcademicCapIcon,        gradient: 'linear-gradient(135deg, #33c4d9, #007a8f)' },
            { path: '/rental',           label: 'Visit Rentals',    icon: WrenchScrewdriverIcon,  gradient: 'linear-gradient(135deg, #f59e0b, #b45309)' },
            { path: '/shop',             label: 'Visit Shop',       icon: ShoppingBagIcon,        gradient: 'linear-gradient(135deg, #8b5cf6, #5b21b6)' },
            { path: '/student/schedule', label: 'Visit My Lessons', icon: CalendarDaysIcon,       gradient: 'linear-gradient(135deg, #10b981, #047857)' },
            { path: null,                label: 'My Wallet',        icon: WalletIcon,             gradient: 'linear-gradient(135deg, #00a8c4, #004f5e)', event: 'studentWallet:open' },
            { path: null,                label: 'Talk to Kai',      icon: SparklesIcon,           gradient: 'linear-gradient(135deg, #ec4899, #be185d)', action: 'openChat' },
          ].map(({ path, label, icon: Icon, gradient, event, action }) => (
            <button
              key={label}
              onClick={() => {
                setIsOpen(false);
                if (action === 'openChat') {
                  openChat();
                } else if (event) {
                  window.dispatchEvent(new CustomEvent(event));
                } else {
                  navigate(path);
                }
              }}
              className="flex items-center gap-3 rounded-2xl border border-[#00a8c4]/20 bg-white/90 px-5 py-3 text-sm font-semibold text-slate-800 shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:border-[#00a8c4]/40 whitespace-nowrap"
              style={{ boxShadow: '0 4px 16px -2px rgba(0,168,196,0.18)' }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ background: gradient }}
              >
                <Icon className="h-4 w-4" />
              </span>
              {label}
            </button>
          ))}
        </div>
      )}

      {/*
        FAB — outer wrapper handles fab-float so glow rings
        (which extend beyond the 56px touch target) are never clipped.
      */}
      <div
        className="relative flex h-14 w-14 items-center justify-center fab-float"
        style={{ marginBottom: 'env(keyboard-inset-height, 0px)' }}
      >
        {/* Outer aura — duotone-blue radial glow */}
        <div
          className="pointer-events-none absolute -inset-5 rounded-full fab-glow"
          style={{
            background: 'radial-gradient(circle, rgba(0,168,196,0.30) 0%, transparent 70%)',
            animationDelay: '0.5s',
          }}
        />
        {/* Spinning arc ring — duotone two-tone sweep */}
        <div
          className="pointer-events-none absolute -inset-[6px] rounded-full animate-spin"
          style={{
            animationDuration: '6s',
            background: 'conic-gradient(from 0deg, #00a8c4 0%, #ffffff 18%, transparent 38%, transparent 68%, #005f70 82%, #00a8c4 100%)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))',
            opacity: 0.9,
          }}
        />
        {/* Close inner halo */}
        <div
          className="pointer-events-none absolute -inset-1 rounded-full fab-glow"
          style={{ background: 'radial-gradient(circle, rgba(0,168,196,0.5) 0%, transparent 60%)' }}
        />

        {/* The actual button */}
        <button
          onClick={() => setIsOpen((o) => !o)}
          className="group relative h-14 w-14 rounded-full"
          title={isOpen ? 'Close' : 'Quick Actions'}
          aria-label={isOpen ? 'Close' : 'Quick Actions'}
          aria-expanded={isOpen}
        >
          {/* Sphere — duotone-blue to deep teal */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
            style={{
              background: 'linear-gradient(145deg, #33c4d9 0%, #00a8c4 38%, #007a8f 70%, #004f5e 100%)',
              boxShadow:
                '0 10px 30px -4px rgba(0,168,196,0.65), 0 3px 10px rgba(0,0,0,0.18), inset 0 1.5px 0 rgba(255,255,255,0.28)',
            }}
          >
            {/* Specular gloss cap — top-left white highlight */}
            <div
              className="absolute rounded-full bg-white/35"
              style={{
                top: '-5px',
                left: '4px',
                width: '36px',
                height: '20px',
                transform: 'rotate(-16deg)',
                filter: 'blur(5px)',
              }}
            />
            {/* Edge vignette for depth */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle at 65% 65%, rgba(0,30,40,0.25) 0%, transparent 70%)',
              }}
            />
          </div>

          {/* UKC. label — shown when closed */}
          <div
            className={`absolute inset-0 flex items-center justify-center text-white transition-all duration-200 ${
              isOpen ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
            }`}
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))' }}
          >
            <span className="font-gotham-bold text-[13px] tracking-tight leading-none">
              UKC.
            </span>
          </div>

          {/* X icon — shown when open */}
          <div
            className={`absolute inset-0 flex items-center justify-center text-white transition-all duration-200 ${
              isOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-75'
            }`}
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))' }}
          >
            <PlusIcon className="h-[20px] w-[20px] rotate-45" strokeWidth={2.5} />
          </div>
        </button>
      </div>
    </div>
  );
};

export default StudentQuickActions;
