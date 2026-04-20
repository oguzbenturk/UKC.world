import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import {
  RocketOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  TrophyOutlined,
  CheckOutlined,
  CloudOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  CrownOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StickyNavBar from '@/shared/components/navigation/StickyNavBar';
import FuturisticScrollCue from '@/shared/components/ui/FuturisticScrollCue';
import { AcademyBrandLockup } from '@/features/outsider/components/AcademyBrandLockup';
import ContactOptionsBanner from '@/features/outsider/components/ContactOptionsBanner';
import GoogleReviewsStrip from '@/shared/components/ui/GoogleReviewsStrip';

const ACADEMY_NAV_KEYS = [
  { id: 'kite-section', key: 'kite' },
  { id: 'foil-section', key: 'foil' },
  { id: 'wing-section', key: 'wing' },
  { id: 'efoil-section', key: 'efoil' },
  { id: 'premium-section', key: 'premium', shortKey: 'premiumShort' },
];

const AcademyLandingPage = () => {
  const { t } = useTranslation(['outsider']);
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [activeSection, setActiveSection] = useState('kite-section');
  const [imagesLoaded, setImagesLoaded] = useState({});

  const academyNavItems = ACADEMY_NAV_KEYS.map((n) => ({
    id: n.id,
    label: t(`outsider:academy.nav.${n.key}`),
    ...(n.shortKey ? { shortLabel: t(`outsider:academy.nav.${n.shortKey}`) } : {}),
  }));

  usePageSEO({
    title: 'Kite Lessons | UKC Academy',
    description: 'Learn kitesurfing with our experienced instructors. From beginner to advanced, we have packages for everyone.'
  });

  const handleImageLoad = (sectionId) => {
    setImagesLoaded(prev => ({ ...prev, [sectionId]: true }));
  };

  // Helper to scroll to specific sections while respecting sticky navbar
  const scrollToSection = (sectionId) => {
    const target = document.getElementById(sectionId);
    if (!target) return;

    // smooth scroll and rely on section scrollMarginTop for offset
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(sectionId);
  };

  const scrollToKiteLessonsHero = () => {
    const target = document.getElementById('kite-lessons-hero');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection('kite-section');
  };

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-8 selection:bg-emerald-400/30">
      {/* Top Category Nav - Sticky (ShopLandingPage style, no icons) */}
      <StickyNavBar
        className="sticky top-0 z-50"
        bgColor="bg-[#0d1511]"
        items={academyNavItems}
        activeItem={activeSection}
        onItemClick={(id) => scrollToSection(id)}
      />

      {/* Kite: white brand band + image hero — shared nav anchor */}
      <div id="kite-section" className="flex flex-col scroll-mt-24">
        <div className="relative z-10 flex min-h-[50dvh] flex-col bg-white">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pt-16 pb-12 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8">
            <AcademyBrandLockup compact tone="whiteBanner" wrapperClassName="relative z-[1]" />
          </div>
          <div className="flex w-full justify-center px-4 pb-4 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
            <FuturisticScrollCue
              ariaLabel="Scroll to Kite lessons"
              onActivate={scrollToKiteLessonsHero}
              className="focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            />
          </div>
        </div>

        {/* Kite lessons image hero — scroll target from white banner chevron */}
        <div
          id="kite-lessons-hero"
          className="relative min-h-[32rem] scroll-mt-24 sm:min-h-[40rem] flex flex-col group"
        >
          <div className="absolute inset-0 z-0">
            <img
              src="/Images/ukc/kite-header.jpg.png"
              alt="Kite lessons background"
              className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-1000 ${
                imagesLoaded['kite'] ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => handleImageLoad('kite')}
              fetchpriority="high"
            />
            {!imagesLoaded['kite'] && (
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-green-900/20 animate-pulse" />
            )}
            {/* Vignette: stays light under the banner seam (masked), then ramps up — avoids muddy gray band */}
            <div
              className="absolute inset-0 z-[1]"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.22) 22%, rgba(0,0,0,0.38) 55%, #0d1511 100%)',
                maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 6%, black 22%, black 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 6%, black 22%, black 100%)',
              }}
              aria-hidden
            />
            {/* Long soft dissolve: white banner seam → clear photo (separate from vignette) */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32 sm:h-40 md:h-48"
              style={{
                background:
                  'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0.92) 10%, rgba(255,255,255,0.55) 32%, rgba(255,255,255,0.2) 58%, rgba(255,255,255,0.06) 78%, rgba(255,255,255,0) 100%)',
              }}
              aria-hidden
            />
          </div>

          <div className="relative z-10 flex w-full max-w-7xl flex-grow flex-col justify-center mx-auto px-4 py-24 sm:px-6 md:py-32 lg:px-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended tracking-tight leading-tight text-white drop-shadow-xl mb-4">
              {t('outsider:academy.sections.kite.title')}
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-4 drop-shadow leading-tight">
              {t('outsider:academy.sections.kite.tagline')}
            </p>
            <p className="text-sm sm:text-base font-duotone-regular text-white max-w-lg leading-relaxed">
              {t('outsider:academy.sections.kite.description')}
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Button
                type="primary"
                size="large"
                className="bg-[#4b4f54] hover:!bg-[#4b4f54] text-[#00a8c4] hover:!text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:scale-[1.02] active:scale-95 transition-all duration-150 w-full sm:w-auto border-none"
                onClick={() => navigate('/academy/kite-lessons')}
              >
                {t('outsider:academy.sections.kite.cta')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Wing Foiling Banner Container */}
      <div
        id="wing-section"
        className="group relative mt-24 flex min-h-[32rem] flex-col scroll-mt-24 sm:mt-32 sm:min-h-[40rem]"
      >
        {/* Background Image with loading state */}
        <div className="absolute inset-0 z-0">
          <img
            src="/Images/ukc/wing-header.png"
            alt="Wing foiling background"
            className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-1000 ${
              imagesLoaded['wing'] ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => handleImageLoad('wing')}
            loading="lazy"
          />
          {!imagesLoaded['wing'] && (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-fuchsia-900/20 animate-pulse" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-[#0d1511]" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex w-full max-w-7xl flex-grow flex-col justify-center mx-auto px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-4 tracking-tight leading-tight text-white drop-shadow-xl">
            {t('outsider:academy.sections.wing.title')}
          </h1>
          <p className="text-lg sm:text-xl font-duotone-regular text-white mb-4 drop-shadow leading-tight">
            {t('outsider:academy.sections.wing.tagline')}
          </p>
          <p className="text-sm sm:text-base font-duotone-regular text-white max-w-lg leading-relaxed">
            {t('outsider:academy.sections.wing.description')}
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button
              type="primary"
              size="large"
              className="bg-[#4b4f54] hover:!bg-[#4b4f54] text-[#00a8c4] hover:!text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:scale-[1.02] active:scale-95 transition-all duration-150 w-full sm:w-auto border-none"
              onClick={() => navigate('/academy/wing-lessons')}
            >
              {t('outsider:academy.sections.wing.cta')}
            </Button>
          </div>
        </div>
      </div>

      {/* Kite Foiling Banner Container */}
      <div
        id="foil-section"
        className="group relative mt-24 flex min-h-[32rem] flex-col scroll-mt-24 sm:mt-32 sm:min-h-[40rem]"
      >
        <div className="absolute inset-0 z-0">
          <img
            src="/Images/ukc/foil-lessons-header.png"
            alt="Kite foiling background"
            className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-1000 ${
              imagesLoaded['foil'] ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => handleImageLoad('foil')}
            loading="lazy"
          />
          {!imagesLoaded['foil'] && (
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 to-blue-900/20 animate-pulse" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-[#0d1511]" />
        </div>

        <div className="relative z-10 flex w-full max-w-7xl flex-grow flex-col justify-center mx-auto px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-4 tracking-tight leading-tight text-white drop-shadow-xl">
            {t('outsider:academy.sections.foil.title')}
          </h1>
          <p className="text-lg sm:text-xl font-duotone-regular text-white mb-4 drop-shadow leading-tight">
            {t('outsider:academy.sections.foil.tagline')}
          </p>
          <p className="text-sm sm:text-base font-duotone-regular text-white max-w-lg leading-relaxed">
            {t('outsider:academy.sections.foil.description')}
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button
              type="primary"
              size="large"
              className="bg-[#4b4f54] hover:!bg-[#4b4f54] text-[#00a8c4] hover:!text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:scale-[1.02] active:scale-95 transition-all duration-150 w-full sm:w-auto border-none"
              onClick={() => navigate('/academy/foil-lessons')}
            >
              {t('outsider:academy.sections.foil.cta')}
            </Button>
          </div>
        </div>
      </div>

      {/* E-Foiling Banner Container */}
      <div
        id="efoil-section"
        className="group relative mt-24 flex min-h-[32rem] flex-col scroll-mt-24 sm:mt-32 sm:min-h-[40rem]"
      >
        <div className="absolute inset-0 z-0">
          <img
            src="/Images/ukc/e-foil.png"
            alt="E-foiling background"
            className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-1000 ${
              imagesLoaded['efoil'] ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => handleImageLoad('efoil')}
            loading="lazy"
          />
          {!imagesLoaded['efoil'] && (
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-900/20 to-green-900/20 animate-pulse" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-[#0d1511]" />
        </div>

        <div className="relative z-10 flex w-full max-w-7xl flex-grow flex-col justify-center mx-auto px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-duotone-bold-extended mb-4 tracking-tight leading-tight text-white drop-shadow-xl">
            {t('outsider:academy.sections.efoil.title')}
          </h1>
          <p className="text-lg sm:text-xl font-duotone-regular text-white mb-4 drop-shadow leading-tight">
            {t('outsider:academy.sections.efoil.tagline')}
          </p>
          <p className="text-sm sm:text-base font-duotone-regular text-white max-w-lg leading-relaxed">
            {t('outsider:academy.sections.efoil.description')}
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button
              type="primary"
              size="large"
              className="bg-[#4b4f54] hover:!bg-[#4b4f54] text-[#00a8c4] hover:!text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:scale-[1.02] active:scale-95 transition-all duration-150 w-full sm:w-auto border-none"
              onClick={() => navigate('/academy/efoil-lessons')}
            >
              {t('outsider:academy.sections.efoil.cta')}
            </Button>
          </div>
        </div>
      </div>

      {/* Premium Banner Container */}
      <div
        id="premium-section"
        className="group relative mt-24 flex min-h-[32rem] flex-col scroll-mt-24 sm:mt-32 sm:min-h-[40rem]"
      >
        <div className="absolute inset-0 z-0">
          <img
            src="/Images/ukc/kite-header.jpg.png"
            alt="Premium lessons background"
            className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-1000 ${
              imagesLoaded['premium'] ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => handleImageLoad('premium')}
            loading="lazy"
          />
          {!imagesLoaded['premium'] && (
            <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 to-orange-900/20 animate-pulse" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-[#0d1511]" />
        </div>

        <div className="relative z-10 flex w-full max-w-7xl flex-grow flex-col justify-center mx-auto px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-4 tracking-tight leading-tight text-white drop-shadow-xl">
            {t('outsider:academy.sections.premium.title')}
          </h1>
          <p className="text-lg sm:text-xl font-duotone-regular text-white mb-4 drop-shadow leading-tight">
            {t('outsider:academy.sections.premium.tagline')}
          </p>
          <p className="text-sm sm:text-base font-duotone-regular text-white max-w-lg leading-relaxed">
            {t('outsider:academy.sections.premium.description')}
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button
              type="primary"
              size="large"
              className="bg-[#4b4f54] hover:!bg-[#4b4f54] text-[#00a8c4] hover:!text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:scale-[1.02] active:scale-95 transition-all duration-150 w-full sm:w-auto border-none"
              onClick={() => navigate('/academy/premium-lessons')}
            >
              {t('outsider:academy.sections.premium.cta')}
            </Button>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-[#0d1511] py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl sm:text-4xl font-duotone-bold-extended mb-4 tracking-tight leading-tight text-white">
              {t('outsider:academy.faq.title')}
            </h2>
            <p className="mb-6 font-duotone-regular text-lg leading-relaxed text-gray-400 sm:text-xl">
              {t('outsider:academy.faq.description')}
            </p>
            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row sm:gap-8">
              <Button
                icon={<InfoCircleOutlined />}
                size="large"
                className="!bg-[#1a1d26] !text-white !border-white/10 hover:!border-white/30 font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg drop-shadow hover:scale-[1.02] active:scale-95 transition-all duration-150 w-full sm:w-auto"
              >
                {t('outsider:common.readFaq')}
              </Button>
              <Button
                type="primary"
                size="large"
                className="bg-[#4b4f54] hover:!bg-[#4b4f54] text-[#00a8c4] hover:!text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:scale-[1.02] active:scale-95 transition-all duration-150 w-full sm:w-auto border-none"
                onClick={() => navigate('/contact')}
              >
                {t('outsider:common.contactUs')}
              </Button>
            </div>
            <ContactOptionsBanner />
          </div>
        </div>
      </div>

       <style>{`
         .scrollbar-hide::-webkit-scrollbar,
         .no-scrollbar::-webkit-scrollbar {
           display: none;
         }
         .scrollbar-hide,
         .no-scrollbar {
           -ms-overflow-style: none;
           scrollbar-width: none;
         }
       `}</style>

      <GoogleReviewsStrip />

      <div className="flex w-full flex-col items-center justify-center px-4 pt-12 pb-24 sm:px-6 sm:pt-16 sm:pb-32 lg:px-8">
        <AcademyBrandLockup />
      </div>
    </div>
  );
};

export default AcademyLandingPage;
