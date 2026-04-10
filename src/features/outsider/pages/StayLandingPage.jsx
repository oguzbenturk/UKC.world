import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import hotelHeroImg from '../../../../DuotoneFonts/Burlahan/burla-han-butik-otel (1).jpg';
import stayHeroImg from '../../../../DuotoneFonts/ukcstay/WhatsApp Image 2026-03-17 at 13.14.32 (1).jpeg';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';
import FuturisticScrollCue from '@/shared/components/ui/FuturisticScrollCue';
import { UkcBrandDot } from '@/shared/components/ui/UkcBrandDot';

const StayLandingPage = () => {
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
                Stay
              </span>
            </div>
          </div>
        </div>
        <div className="flex w-full justify-center px-4 pb-3 pt-2 sm:px-6 sm:pb-5 sm:pt-3 lg:px-8">
          <FuturisticScrollCue
            ariaLabel="Scroll to accommodation options"
            onActivate={() => document.getElementById('hotel-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          />
        </div>
      </div>

      {/* Hotel Section */}
      <div id="hotel-section" className="relative min-h-[500px] flex flex-col group">
        {/* White dissolve from banner seam into photo */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32 sm:h-40 md:h-48"
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0.92) 10%, rgba(255,255,255,0.55) 32%, rgba(255,255,255,0.2) 58%, rgba(255,255,255,0.06) 78%, rgba(255,255,255,0) 100%)',
          }}
          aria-hidden
        />
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{
             backgroundImage: `url(${hotelHeroImg})`,
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0d1118]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-44 pb-20 md:py-32 w-full text-left items-start">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-4 tracking-tight text-white drop-shadow-xl uppercase">
                HOTEL STAY
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow max-w-2xl leading-relaxed">
                Stay at the peaceful Burlahan Otel in Urla while learning to kitesurf. Quality accommodation with beachfront access and full amenities.
            </p>
            
            <div className="flex flex-wrap gap-4 justify-start mt-4">
                <Button 
                ghost 
                size="large" 
                className="!text-[#00a8c4] !border-[#00a8c4]/40 hover:!border-[#00a8c4] hover:!bg-[#00a8c4]/10 !h-14 !px-8 !text-lg font-duotone-bold !rounded-md backdrop-blur-sm"
                onClick={() => navigate('/stay/hotel')}
                style={{ boxShadow: '0 0 12px rgba(0,168,196,0.1)' }}
                >
                View Details <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* Home Section */}
      <div id="home-section" className="relative min-h-[500px] flex flex-col group" style={{ scrollMarginTop: '88px' }}>
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{
             backgroundImage: `url(${stayHeroImg})`,
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0d1118]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full text-left items-start">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-4 tracking-tight text-white drop-shadow-xl uppercase">
                HOME ACCOMMODATION
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow max-w-2xl leading-relaxed">
                Stay at our cozy home accommodations. Pool studios, farm house options, and staff quarters for a more personal experience.
            </p>
            
            <div className="flex flex-wrap gap-4 justify-start mt-4">
                <Button 
                ghost 
                size="large" 
                className="!text-[#00a8c4] !border-[#00a8c4]/40 hover:!border-[#00a8c4] hover:!bg-[#00a8c4]/10 !h-14 !px-8 !text-lg font-duotone-bold !rounded-md backdrop-blur-sm"
                onClick={() => navigate('/stay/home')}
                style={{ boxShadow: '0 0 12px rgba(0,168,196,0.1)' }}
                >
                View Details <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* Contact Us Section */}
      <div className="py-16 sm:py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended mb-1 text-white uppercase tracking-tight">Need help with your stay?</h2>
          <p className="font-gotham-bold mb-3 text-xs tracking-widest flex items-baseline justify-center gap-0 text-[#00a8c4]">
            <span>UKC</span>
            <UkcBrandDot className="mx-[0.02em]" style={{ top: '0.1em' }} />
            <span>stay</span>
          </p>
          <p className="font-duotone-regular text-gray-300 mb-8 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            Our team is here to help you find the perfect accommodation to match your kitesurfing holiday.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Button
              type="primary"
              size="large"
              className="font-duotone-bold !h-14 !rounded-md !px-10 !text-lg shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
              style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
              href="/contact"
            >
              Contact Us
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
