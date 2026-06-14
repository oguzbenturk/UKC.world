import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WhatsAppOutlined, PhoneFilled } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { analyticsService } from '@/shared/services/analyticsService';

// Sticky WhatsApp + Call buttons for guests (logged-out visitors) on public/
// landing pages. Hidden entirely once anyone is authenticated — authenticated
// users get their own bottom-right FABs (GlobalFAB / StudentQuickActions), so
// this never collides with them.

// Contact details — WhatsApp shares the same number as every tel: link in the app.
const WHATSAPP_NUMBER = '905071389196';
const PHONE_NUMBER = '+905071389196';

// Auth-flow / utility routes where the contact buttons should not appear even
// for logged-out visitors. Everything else a guest can reach is a public page.
const HIDDEN_EXACT_PATHS = ['/login', '/register', '/reset-password', '/verify-email'];
const HIDDEN_PATH_PREFIXES = ['/payment/', '/spotify/'];

const FloatingContactButtons = () => {
  const { t } = useTranslation(['outsider']);
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // Only guests see these buttons.
  if (isAuthenticated) return null;

  const isHidden =
    HIDDEN_EXACT_PATHS.includes(location.pathname) ||
    HIDDEN_PATH_PREFIXES.some((p) => location.pathname.startsWith(p));
  if (isHidden) return null;

  const whatsappLabel = t('outsider:contactBanner.floatingContact.whatsapp', 'WhatsApp');
  const callLabel = t('outsider:contactBanner.floatingContact.call', 'Ara');

  return (
    <div
      className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3 print:hidden"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* WhatsApp */}
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={whatsappLabel}
        title={whatsappLabel}
        onClick={() => analyticsService.track('whatsapp_click', { source: 'floating_button' })}
        className="group flex h-14 w-14 items-center justify-center rounded-full text-white no-underline shadow-2xl ring-1 ring-emerald-600/20 transition-all duration-200 hover:scale-105 hover:brightness-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        style={{ background: '#25D366' }}
      >
        <WhatsAppOutlined style={{ fontSize: 30 }} />
      </a>

      {/* Call */}
      <a
        href={`tel:${PHONE_NUMBER}`}
        aria-label={callLabel}
        title={callLabel}
        onClick={() => analyticsService.track('call_click', { source: 'floating_button' })}
        className="group flex h-14 w-14 items-center justify-center rounded-full text-white no-underline shadow-2xl ring-1 ring-cyan-700/20 transition-all duration-200 hover:scale-105 hover:brightness-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        style={{ background: 'linear-gradient(135deg, #33c4d9, #007a8f)' }}
      >
        <PhoneFilled style={{ fontSize: 26 }} />
      </a>
    </div>
  );
};

export default FloatingContactButtons;
