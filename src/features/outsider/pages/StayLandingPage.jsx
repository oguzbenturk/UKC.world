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
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    setActiveSection(sectionId);
  };

  return (
    <div className="bg-[#0d1118] min-h-screen text-white font-sans pb-20 selection:bg-blue-400/30">
      
      {/* Top Category Nav - Sticky */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0d1118]/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
            <div className="flex justify-between md:justify-center items-center overflow-x-auto py-3 md:py-5 space-x-4 md:space-x-12 scrollbar-hide">
                <button 
                  onClick={() => scrollToSection('hotel-section')}
                  className={`flex items-center gap-2 text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'hotel-section' 
                      ? 'text-blue-400 font-bold border-b-2 border-blue-400 pb-1 hover:text-blue-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                <CoffeeOutlined /> HOTEL
                </button>
                <button 
                  onClick={() => scrollToSection('home-section')}
                  className={`flex items-center gap-2 text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'home-section' 
                      ? 'text-sky-400 font-bold border-b-2 border-sky-400 pb-1 hover:text-sky-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                <HomeOutlined /> HOME
                </button>
            </div>
          </div>
      </div>

      {/* Hotel Section */}
      <div id="hotel-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image - Placeholder until real image provided */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/care.png')", // Placeholder
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0d1118]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <span className="text-blue-400 font-bold tracking-widest uppercase text-sm md:text-base mb-2 block">
                Burlahan Otel
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-white drop-shadow-xl">
                HOTEL STAY
            </h1>
            <p className="text-gray-200 text-lg md:text-xl max-w-2xl mb-8 drop-shadow-md">
                Stay at the peaceful Burlahan Otel in Urla while learning to kitesurf. Quality accommodation with beachfront access and full amenities.
            </p>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={() => navigate('/stay/hotel')}
                >
                View Details <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* Home Section */}
      <div id="home-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image - Placeholder until real image provided */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/team.png')", // Placeholder
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0d1118]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <span className="text-sky-400 font-bold tracking-widest uppercase text-sm md:text-base mb-2 block">
                Authentic Experience
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-white drop-shadow-xl">
                HOME ACCOMMODATION
            </h1>
            <p className="text-gray-200 text-lg md:text-xl max-w-2xl mb-8 drop-shadow-md">
                Stay at our cozy home accommodations. Pool studios, farm house options, and staff quarters for a more personal experience.
            </p>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={() => navigate('/stay/home')}
                >
                View Details <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
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
