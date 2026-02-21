import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { RightOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';

const RentalLandingPage = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('standard-section');

  usePageSEO({
    title: 'Rentals | Duotone Pro Center Urla',
    description: 'Premium Kitesurfing, Wing, and Foil Rentals. Choose from Standard, SLS, and D-LAB equipment.'
  });


  useEffect(() => {
    const handleScroll = () => {
      const sections = ['standard-section', 'sls-section', 'dlab-section', 'efoil-section'];
      
      // Determine which section is currently active based on scroll position
      // The section that occupies the middle of the screen is considered active
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

  // Helper to scroll to specific sections
  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    setActiveSection(sectionId);
  };

  const viewDetails = (path) => {
    navigate(path);
  };

  return (
    <div className="bg-[#16110d] min-h-screen text-white font-sans pb-20 selection:bg-orange-400/30">
      
      {/* Top Category Nav - Sticky */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#16110d]/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
            {/* Segment tabs */}
            <div className="flex justify-between md:justify-center items-center overflow-x-auto py-3 md:py-4 space-x-4 md:space-x-12 scrollbar-hide">
                <button 
                  onClick={() => scrollToSection('standard-section')}
                  className={`text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'standard-section' 
                      ? 'text-orange-400 font-bold border-b-2 border-orange-400 pb-1 hover:text-orange-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                STANDARD
                </button>
                <button 
                  onClick={() => scrollToSection('sls-section')}
                  className={`text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'sls-section' 
                      ? 'text-amber-400 font-bold border-b-2 border-amber-400 pb-1 hover:text-amber-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                SLS
                </button>
                <button 
                  onClick={() => scrollToSection('dlab-section')}
                  className={`text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'dlab-section' 
                      ? 'text-yellow-400 font-bold border-b-2 border-yellow-400 pb-1 hover:text-yellow-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                D-LAB
                </button>
                <button 
                  onClick={() => scrollToSection('efoil-section')}
                  className={`text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'efoil-section' 
                      ? 'text-yellow-300 font-bold border-b-2 border-yellow-300 pb-1 hover:text-yellow-200' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                E-FOIL
                </button>
            </div>
          </div>
      </div>

      {/* Hero / Standard Section */}
      <div id="standard-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/evo-rent-standart.png')",
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#16110d]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <div className="mb-4">
                <span className="text-orange-400 font-bold tracking-widest uppercase text-sm md:text-base mb-2 block">
                    We are Duotone Pro Center Urla - Powered by UKC
                </span>
                <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-white drop-shadow-xl">
                    STANDARD RENTAL
                </h1>
                <p className="text-gray-200 text-lg md:text-xl max-w-2xl mb-8 drop-shadow-md">
                    Not everyone needs the high end gear. Our standard rental range offers reliable, high-quality equipment perfect for progression and everyday sessions.
                </p>
            </div>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={() => viewDetails('/rental/standard')}
                >
                View Details <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* SLS Section */}
      <div id="sls-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/evo-sls-rent.png')",
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#16110d]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <span className="text-amber-400 font-bold tracking-widest uppercase text-sm md:text-base mb-2 block">
                Strong Light Superior
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-white drop-shadow-xl">
                SLS RENTAL
            </h1>
            <p className="text-gray-200 text-lg md:text-xl max-w-2xl mb-8 drop-shadow-md">
                Experience the difference with our SLS range. Lighter, stronger, and more responsive equipment for those who demand performance.
            </p>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={() => viewDetails('/rental/sls')}
                >
                View Details <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* D-LAB Section */}
      <div id="dlab-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/rebel-dlab-rent.png')",
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#16110d]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <span className="text-yellow-400 font-bold tracking-widest uppercase text-sm md:text-base mb-2 block">
                Duotone Laboratory
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-white drop-shadow-xl">
                D-LAB RENTAL
            </h1>
            <p className="text-gray-200 text-lg md:text-xl max-w-2xl mb-8 drop-shadow-md">
                The pinnacle of kiteboarding technology. Fly the lightest, most durable, and highest performing gear on the market.
            </p>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={() => viewDetails('/rental/dlab')}
                >
                View Details <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* E-Foil Section */}
      <div id="efoil-section" className="relative min-h-[500px] flex flex-col group">
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/e-foil.png')",
             backgroundPosition: 'center center'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#16110d]"></div>
        </div>

        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <span className="text-yellow-300 font-bold tracking-widest uppercase text-sm md:text-base mb-2 block">
                Electric Hydrofoil
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-white drop-shadow-xl">
                E-FOIL RENTAL
            </h1>
            <p className="text-gray-200 text-lg md:text-xl max-w-2xl mb-8 drop-shadow-md">
                No wind required. Glide silently above the water on our premium electric hydrofoils — the most unique watersports experience on the coast.
            </p>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={() => viewDetails('/rental/efoil')}
                >
                View Details <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* Contact Us Section */}
      <div className="py-16 sm:py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-white">Not sure which rental is right for you?</h2>
          <p className="text-gray-400 mb-8 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Our team is on hand to help you choose the right equipment for your level and goals. Just get in touch.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Button
              icon={<InfoCircleOutlined />}
              size="large"
              className="!bg-[#1a1d26] !text-white !border-white/10 hover:!border-white/30 !h-12 !rounded-lg"
            >
              Read FAQ
            </Button>
            <Button
              type="primary"
              size="large"
              className="!bg-orange-600 !border-none hover:!bg-orange-500 !h-12 !rounded-lg !font-semibold"
              href="/contact"
            >
              Contact Us
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default RentalLandingPage;
