import React from 'react';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';
import ReactCountryFlag from 'react-country-flag';
import { LANGUAGES } from '@/i18n/languages';
import dLogo from '../../../DuotoneFonts/DPSLOGOS/D.svg';
import dpcLogo from '../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';

const LANG_CHOSEN_KEY = 'plannivo.lang.chosen';

export const hasChosenLanguage = () => !!localStorage.getItem(LANG_CHOSEN_KEY);

const LanguageSelectModal = ({ open, onClose }) => {
  const { i18n } = useTranslation();
  const [selected, setSelected] = React.useState(null);

  const handleSelect = (code) => {
    setSelected(code);
    i18n.changeLanguage(code);
    localStorage.setItem(LANG_CHOSEN_KEY, '1');
    setTimeout(onClose, 180);
  };

  const handleDismiss = () => {
    localStorage.setItem(LANG_CHOSEN_KEY, '1');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1014]/95 p-6 shadow-2xl"
        style={{ backdropFilter: 'blur(24px)' }}
      >
        {/* Close */}
        <button
          onClick={handleDismiss}
          aria-label="Close language selector"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition hover:bg-white/10 hover:text-white/80"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#00a8c4]/50 bg-[#00a8c4]/15" style={{ boxShadow: '0 0 18px rgba(0,168,196,0.25)' }}>
            <img src={dLogo} alt="UKC" className="h-12 w-12 object-contain" />
          </div>
          <img src={dpcLogo} alt="Duotone Pro Center Urla" className="mx-auto h-16 w-auto object-contain" style={{ filter: 'brightness(1.2)' }} />
          <h2 className="mt-1 text-base font-semibold text-white">Choose your language</h2>
          <p className="mt-0.5 text-[11px] text-white/35">Saved for your next visit</p>
        </div>

        {/* Language grid — 2 columns × 3 rows */}
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={[
                  'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-150',
                  isSelected
                    ? 'border-[#00a8c4]/70 bg-[#00a8c4]/15 text-[#00a8c4]'
                    : 'border-white/8 bg-white/4 text-white hover:border-[#00a8c4]/40 hover:bg-[#00a8c4]/8',
                ].join(' ')}
              >
                <ReactCountryFlag
                  countryCode={lang.countryCode}
                  svg
                  style={{ width: '2em', height: '1.5em', borderRadius: '3px', flexShrink: 0 }}
                  aria-label={lang.name}
                />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium leading-tight">
                    {lang.nativeName}
                  </div>
                  <div className="text-[10px] text-white/35">{lang.name}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LanguageSelectModal;
