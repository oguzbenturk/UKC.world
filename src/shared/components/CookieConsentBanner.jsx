import { useState, useEffect } from 'react';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'cookie_consent_accepted';

export default function CookieConsentBanner() {
  const { t } = useTranslation(['common']);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show the banner only if the user hasn't accepted yet
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (!accepted) {
      // Small delay so the slide-up animation is visible on first paint
      const timer = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] animate-slide-up"
      style={{
        animation: 'cookieSlideUp 0.4s ease-out forwards',
      }}
    >
      <style>{`
        @keyframes cookieSlideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <div className="bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/60 px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-slate-300 text-sm leading-relaxed text-center sm:text-left m-0">
            {t('common:cookie.message')}{' '}
            <a
              href="/privacy"
              className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
            >
              {t('common:cookie.learnMore')}
            </a>
          </p>

          <Button
            type="primary"
            size="middle"
            onClick={handleAccept}
            className="shrink-0"
          >
            {t('common:cookie.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
