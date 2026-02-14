import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import {
  RocketOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  TrophyOutlined,
  CheckOutlined,
  RightOutlined,
  CloudOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  CrownOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const AcademyLandingPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [activeSection, setActiveSection] = useState('kite-section');

  usePageSEO({
    title: 'Kite Lessons | UKC Academy',
    description: 'Learn kitesurfing with our experienced instructors. From beginner to advanced, we have packages for everyone.'
  });

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['kite-section', 'foil-section', 'wing-section', 'efoil-section', 'premium-section'];
      
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
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Helper to scroll to packages
  const scrollToPackages = () => {
    document.getElementById('packages-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Helper to scroll to specific sections
  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    setActiveSection(sectionId);
  };

  return (
    <div className="bg-[#0f1013] min-h-screen text-white font-sans pb-20">
      
      {/* Top Category Nav - Sticky */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0f1013]/80 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
            <div className="flex justify-between md:justify-center items-center overflow-x-auto py-3 md:py-5 space-x-4 md:space-x-12 scrollbar-hide">
                <button 
                  onClick={() => scrollToSection('kite-section')}
                  className={`flex items-center gap-2 text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'kite-section' 
                      ? 'text-blue-400 font-bold border-b-2 border-blue-400 pb-1 hover:text-blue-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                <RocketOutlined /> KITE
                </button>
                <button 
                  onClick={() => scrollToSection('foil-section')}
                  className={`flex items-center gap-2 text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'foil-section' 
                      ? 'text-cyan-400 font-bold border-b-2 border-cyan-400 pb-1 hover:text-cyan-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                <CloudOutlined /> FOIL
                </button>
                <button 
                  onClick={() => scrollToSection('wing-section')}
                  className={`flex items-center gap-2 text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'wing-section' 
                      ? 'text-purple-400 font-bold border-b-2 border-purple-400 pb-1 hover:text-purple-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                <GlobalOutlined /> WING
                </button>
                <button 
                  onClick={() => scrollToSection('efoil-section')}
                  className={`flex items-center gap-2 text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'efoil-section' 
                      ? 'text-yellow-400 font-bold border-b-2 border-yellow-400 pb-1 hover:text-yellow-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                <ThunderboltOutlined /> E-FOIL
                </button>
                <button 
                  onClick={() => scrollToSection('premium-section')}
                  className={`flex items-center gap-2 text-sm md:text-base font-medium transition-colors px-1 drop-shadow-md tracking-wide whitespace-nowrap ${
                    activeSection === 'premium-section' 
                      ? 'text-amber-400 font-bold border-b-2 border-amber-400 pb-1 hover:text-amber-300' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                <CrownOutlined /> PREMIUM
                </button>
            </div>
            </div>
        </div>

      {/* Hero Banner Container */}
      <div id="kite-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/kite-header.jpg.png')",
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0f1013]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <h1 className="text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white drop-shadow-xl">
                KITE LESSONS
            </h1>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                type="primary" 
                size="large" 
                className="!bg-blue-600 !border-blue-600 hover:!bg-blue-500 !h-14 !px-10 !text-lg !font-bold !rounded-lg shadow-xl shadow-blue-900/40 hover:-translate-y-1 transition-transform"
                onClick={() => navigate('/academy/kite-lessons')}
                >
                Book Your Lesson
                </Button>
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={scrollToPackages}
                >
                View Packages <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* Wing Foiling Banner Container */}
      <div id="wing-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/wing-header.png')",
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0f1013]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <h1 className="text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white drop-shadow-xl">
                WING FOILING
            </h1>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                type="primary" 
                size="large" 
                className="!bg-purple-600 !border-purple-600 hover:!bg-purple-500 !h-14 !px-10 !text-lg !font-bold !rounded-lg shadow-xl shadow-purple-900/40 hover:-translate-y-1 transition-transform"
                onClick={() => navigate('/academy/wing-lessons')}
                >
                Book Wing Lesson
                </Button>
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={scrollToPackages}
                >
                Learn More <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* Kite Foiling Banner Container */}
      <div id="foil-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/foil-lessons-header.png')",
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0f1013]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <h1 className="text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white drop-shadow-xl">
                KITE FOILING
            </h1>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                type="primary" 
                size="large" 
                className="!bg-cyan-600 !border-cyan-600 hover:!bg-cyan-500 !h-14 !px-10 !text-lg !font-bold !rounded-lg shadow-xl shadow-cyan-900/40 hover:-translate-y-1 transition-transform"
                onClick={() => navigate('/academy/foil-lessons')}
                >
                Book Foil Lesson
                </Button>
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={scrollToPackages}
                >
                Learn More <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* E-Foiling Banner Container */}
      <div id="efoil-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{ 
             backgroundImage: "url('/Images/ukc/e-foil.png')",
             backgroundPosition: 'center center'
          }}
        >
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0f1013]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <h1 className="text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white drop-shadow-xl">
                E-FOILING
            </h1>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                type="primary" 
                size="large" 
                className="!bg-green-600 !border-green-600 hover:!bg-green-500 !h-14 !px-10 !text-lg !font-bold !rounded-lg shadow-xl shadow-green-900/40 hover:-translate-y-1 transition-transform"
                onClick={() => navigate('/academy/efoil-lessons')}
                >
                Book E-Foil Session
                </Button>
                <Button 
                ghost 
                size="large" 
                className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
                onClick={scrollToPackages}
                >
                Learn More <RightOutlined className="text-xs ml-1" />
                </Button>
            </div>
        </div>
      </div>

      {/* Premium Banner Container */}
      <div id="premium-section" className="relative min-h-[500px] flex flex-col group">
        <div
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{
            backgroundImage: "url('/Images/ukc/kite-header.jpg.png')",
            backgroundPosition: 'center center'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0f1013]" />
        </div>

        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
          <h1 className="text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white drop-shadow-xl">
            PREMIUM LESSONS
          </h1>

          <div className="flex flex-wrap gap-4">
            <Button
              type="primary"
              size="large"
              className="!bg-amber-600 !border-amber-600 hover:!bg-amber-500 !h-14 !px-10 !text-lg !font-bold !rounded-lg shadow-xl shadow-amber-900/40 hover:-translate-y-1 transition-transform"
              onClick={() => navigate('/academy/premium-lessons')}
            >
              Book Premium Lesson
            </Button>
            <Button
              ghost
              size="large"
              className="!text-white !border-white/40 hover:!border-white hover:!bg-white/10 !h-14 !px-8 !text-lg !font-semibold !rounded-lg backdrop-blur-sm"
              onClick={scrollToPackages}
            >
              Learn More <RightOutlined className="text-xs ml-1" />
            </Button>
          </div>
        </div>
      </div>

       {/* FAQ Placeholder - Adding "Missing" content */}
       <div className="py-20 bg-[#0f1013]">
         <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl font-bold mb-4 text-white">Have Questions?</h2>
            <p className="text-gray-400 mb-8">Not sure which package is right for you? Our team is here to help plan your kiteboarding journey.</p>
            <div className="flex justify-center gap-4">
                 <Button icon={<InfoCircleOutlined />} size="large" className="!bg-[#1a1d26] !text-white !border-white/10 hover:!border-white/30">
                    Read FAQ
                 </Button>
                 <Button type="primary" size="large" className="!bg-blue-600 !border-none hover:!bg-blue-500">
                    Contact Us
                 </Button>
            </div>
         </div>
       </div>

    </div>
  );
};

export default AcademyLandingPage;
