import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ContactOptionsBanner from '@/features/outsider/components/ContactOptionsBanner';
import GoogleReviewsStrip from '@/shared/components/ui/GoogleReviewsStrip';
import { Button } from 'antd';
import {
  HomeOutlined,
  CoffeeOutlined,
  RightOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';
const hotelHeroImg = '/Images/ukc/burlahan-hotel.jpg';
const stayHeroImg = '/Images/ukc/stay-home.jpeg';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';
import FuturisticScrollCue from '@/shared/components/ui/FuturisticScrollCue';
import { UkcBrandDot } from '@/shared/components/ui/UkcBrandDot';

const StayLandingPage = () => {
  const { t } = useTranslation(['outsider']);
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Stay | UKC Accommodation',
    description: 'Find your perfect stay. Choose from our comfortable Burlahan Hotel or cozy Home Accommodations.'
  });

  const handleBookService = (category = 'accommodation') => {
    setBookingInitialData({ serviceCategory: category });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-20 selection:bg-blue-400/30 relative z-0">

      {/* ── White brand banner ── */}
      <div className="relative z-10 flex min-h-[28dvh] flex-col bg-white">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pt-10 pb-6 sm:px-6 sm:pt-12 sm:pb-8 lg:px-8">
          <div className="flex flex-col items-center relative z-[1]">
            <div className="flex items-baseline">
              <span
                className="font-gotham-bold antialiased text-[#1a1a1a]"
                style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', letterSpacing: '0.1em', textRendering: 'geometricPrecision' }}
              >
                UKC
              </span>
              <UkcBrandDot style={{ width: '0.13em', height: '0.13em', top: '-0.04em', fontSize: 'clamp(3rem, 8vw, 6rem)', marginLeft: '0.04em', marginRight: '0.18em' }} />
              <span
                className="font-gotham-bold antialiased bg-gradient-to-r from-blue-500 to-sky-500 bg-clip-text text-transparent"
                style={{ letterSpacing: '0.02em', fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', textRendering: 'geometricPrecision' }}
              >
                {t('outsider:stay.brandSubtitle')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex w-full justify-center px-4 pb-3 pt-2 sm:px-6 sm:pb-5 sm:pt-3 lg:px-8">
          <FuturisticScrollCue
            ariaLabel="Scroll to accommodation options"
            onActivate={() => document.getElementById('home-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          />
        </div>
      </div>

      {/* Home Accommodation Section — first */}
      <div id="home-section" className="relative min-h-[500px] flex flex-col group overflow-hidden" style={{ scrollMarginTop: '88px' }}>
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{
            backgroundImage: `url(${stayHeroImg})`,
            backgroundPosition: 'center center',
          }}
        >
          <div
            className="absolute inset-0 z-[1]"
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.22) 22%, rgba(0,0,0,0.38) 55%, #0d1511 100%)',
              maskImage:
                'linear-gradient(to bottom, transparent 0%, transparent 6%, black 22%, black 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, transparent 6%, black 22%, black 100%)',
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32 sm:h-40 md:h-48"
            style={{
              background:
                'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0.92) 10%, rgba(255,255,255,0.55) 32%, rgba(255,255,255,0.2) 58%, rgba(255,255,255,0.06) 78%, rgba(255,255,255,0) 100%)',
            }}
            aria-hidden
          />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended tracking-tight text-white drop-shadow-xl mb-3 uppercase">
            {t('outsider:stay.sections.home.title')}
          </h1>
          <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
            {t('outsider:stay.sections.home.tagline')}
          </p>
          <p className="text-sm sm:text-base font-duotone-regular text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
            {t('outsider:stay.sections.home.description')}
          </p>
          <div className="flex flex-wrap gap-4">
            <Button
              size="large"
              className="font-duotone-bold !h-14 !px-8 !text-lg !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
              style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
              onClick={() => navigate('/stay/home')}
            >
              {t('outsider:common.viewDetails')} <RightOutlined className="text-xs ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Hotel Stay Section — second */}
      <div id="hotel-section" className="relative min-h-[500px] flex flex-col group overflow-hidden">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{
            backgroundImage: `url(${hotelHeroImg})`,
            backgroundPosition: 'center center',
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0d1511]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended tracking-tight text-white drop-shadow-xl mb-3 uppercase">
            {t('outsider:stay.sections.hotel.title')}
          </h1>
          <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
            {t('outsider:stay.sections.hotel.tagline')}
          </p>
          <p className="text-sm sm:text-base font-duotone-regular text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
            {t('outsider:stay.sections.hotel.description')}
          </p>
          <div className="flex flex-wrap gap-4">
            <Button
              size="large"
              className="font-duotone-bold !h-14 !px-8 !text-lg !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
              style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
              onClick={() => navigate('/stay/hotel')}
            >
              {t('outsider:common.viewDetails')} <RightOutlined className="text-xs ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Contact Us Section */}
      <div className="py-16 sm:py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended mb-1 text-white uppercase tracking-tight">{t('outsider:stay.faq.title')}</h2>
          <p className="font-gotham-bold mb-3 text-xs tracking-widest flex items-baseline justify-center gap-0 text-[#00a8c4]">
            <span>UKC</span>
            <UkcBrandDot className="mx-[0.02em]" style={{ top: '0.1em' }} />
            <span>{t('outsider:stay.brandSubtitle')}</span>
          </p>
          <p className="font-duotone-regular text-gray-300 mb-8 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            {t('outsider:stay.faq.description')}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Button
              type="primary"
              size="large"
              className="font-duotone-bold !h-14 !rounded-md !px-10 !text-lg shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
              style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
              href="/contact"
            >
              {t('outsider:common.contactUs')}
            </Button>
          </div>
          <ContactOptionsBanner />
        </div>
      </div>

      <GoogleReviewsStrip />

      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center" style={{ margin: '48px 0 24px 0' }}>
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla White Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '8px 0' }}
        />
      </div>

      {/* Booking Wizard Modal */}
      {bookingOpen && (
        <StudentBookingWizard 
          open={bookingOpen} 
          onClose={handleBookingClose}
          initialData={bookingInitialData}
        />
      )}
    </div>
  );
};

export default StayLandingPage;
