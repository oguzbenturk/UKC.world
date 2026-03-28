import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import {
  HomeOutlined,
  CoffeeOutlined,
  RightOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';
import StickyNavBar from '@/shared/components/navigation/StickyNavBar';

const STAY_NAV_ITEMS = [
  { id: 'hotel-section', label: 'HOTEL' },
  { id: 'home-section', label: 'HOME' },
];

const StayLandingPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});
  const [activeSection, setActiveSection] = useState('hotel-section');

  usePageSEO({
    title: 'Stay | UKC Accommodation',
    description: 'Find your perfect stay. Choose from our comfortable Burlahan Hotel or cozy Home Accommodations.'
  });

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['hotel-section', 'home-section'];
      
      const scrollPosition = window.scrollY + window.innerHeight / 3;

      for (const sectionId of sections) {
        const element = document.getElementById(sectionId);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check on mount
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleBookService = (category = 'accommodation') => {
    setBookingInitialData({ serviceCategory: category });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  // Helper to scroll to specific sections
  const scrollToSection = (sectionId) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(sectionId);
  };

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-20 selection:bg-blue-400/30 relative z-0">
      
      {/* Duotone Pro Center Urla Logo */}
      <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-[95vw] sm:w-[65vw] md:w-[48rem] max-w-[850px] z-10">
        <img
          src={new URL('@/../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg', import.meta.url).href}
          alt="Duotone Pro Center Urla Logo"
          className="w-full"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}
        />
      </div>
      
      {/* Top Category Nav - Sticky */}
      <StickyNavBar
        className="sticky top-0 z-50"
        bgColor="bg-[#0d1511]"
        items={STAY_NAV_ITEMS}
        activeItem={activeSection}
        onItemClick={(id) => scrollToSection(id)}
      />

      {/* Hotel Section */}
      <div id="hotel-section" className="relative min-h-[500px] flex flex-col group" style={{ scrollMarginTop: '88px' }}>
        {/* Background Image - Placeholder until real image provided */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/evo-rent-dacrpm.jpg')", // Cleaner placeholder
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
        {/* Background Image - Placeholder until real image provided */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/evo-sls-header.jpg')", // Cleaner placeholder
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
          <p className="font-gotham-bold text-[#00a8c4] mb-3 text-xs tracking-widest">UKC.stay</p>
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
        </div>
      </div>

      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center" style={{ margin: '48px 0 24px 0' }}>
        <img
          src={new URL('@/../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg', import.meta.url).href}
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
