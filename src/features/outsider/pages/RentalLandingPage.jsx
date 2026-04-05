import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { RightOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import StickyNavBar from '@/shared/components/navigation/StickyNavBar';
import FuturisticScrollCue from '@/shared/components/ui/FuturisticScrollCue';
import { AcademyBrandLockup } from '@/features/outsider/components/AcademyBrandLockup';
import ContactOptionsBanner from '@/features/outsider/components/ContactOptionsBanner';
import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';
import standardRentalHeroBg from '../../../../DuotoneFonts/DPSLOGOS/Website-DSC07450.jpg';

const RENTAL_NAV_ITEMS = [
  { id: 'standard-section', label: 'STANDARD RENTAL', shortLabel: 'STANDARD' },
  { id: 'sls-section', label: 'SLS RENTAL', shortLabel: 'SLS' },
  { id: 'dlab-section', label: 'D-LAB RENTAL', shortLabel: 'D-LAB' },
  { id: 'efoil-section', label: 'E-FOIL RENTAL', shortLabel: 'E-FOIL' },
];

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

      {/* Unified Sticky Category Nav */}
      <StickyNavBar
        items={RENTAL_NAV_ITEMS}
        activeItem={activeSection}
        onItemClick={(id) => scrollToSection(id)}
      />

      {/* White brand band + scroll cue (matches Academy kite-section header) */}
      <div className="flex flex-col scroll-mt-24">
        <div className="relative z-10 flex min-h-[50dvh] flex-col bg-white">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pt-16 pb-12 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8">
            <AcademyBrandLockup compact tone="whiteBanner" wrapperClassName="relative z-[1]" />
          </div>
          <div className="flex w-full justify-center px-4 pb-4 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
            <FuturisticScrollCue
              ariaLabel="Scroll to equipment rental"
              onActivate={() => scrollToSection('standard-section')}
              className="focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            />
          </div>
        </div>
      </div>

      {/* Hero / Standard Section */}
      <div id="standard-section" className="relative min-h-[500px] flex flex-col group">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 group-hover:scale-105"
          style={{
            backgroundImage: `url(${standardRentalHeroBg})`,
            backgroundPosition: 'center center',
          }}
        >
          {/* Same stack as Academy kite-lessons-hero: masked vignette + white seam only (no extra full-screen dark layer) */}
          <div
            className="absolute inset-0 z-[1]"
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.22) 22%, rgba(0,0,0,0.38) 55%, #16110d 100%)',
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
            <div className="mb-4">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended tracking-tight text-white drop-shadow-xl mb-3">
                    STANDARD EQUIPMENT RENTAL
                </h1>
                <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
                    Reliable, high-quality gear for every level.
                </p>
                <p className="text-sm sm:text-base font-duotone-regular text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
                    Not everyone needs the high end gear. Our standard rental range offers reliable, high-quality equipment perfect for progression and everyday sessions.
                </p>
            </div>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                size="large" 
                className="font-duotone-bold !h-14 !px-8 !text-lg !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
                style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
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
            <span className="font-duotone-bold text-amber-400 tracking-widest uppercase text-sm md:text-base mb-2 block">
                Strong Light Superior
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended tracking-tight text-white drop-shadow-xl mb-3">
                SLS RENTAL
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
                Lighter, stronger, more responsive.
            </p>
            <p className="text-sm sm:text-base font-duotone-regular text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
                Experience the difference with our SLS range. Lighter, stronger, and more responsive equipment for those who demand performance.
            </p>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                size="large" 
                className="font-duotone-bold !h-14 !px-8 !text-lg !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
                style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
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
            <span className="font-duotone-bold text-yellow-400 tracking-widest uppercase text-sm md:text-base mb-2 block">
                Duotone Laboratory
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended tracking-tight text-white drop-shadow-xl mb-3">
                D-LAB RENTAL
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
                The pinnacle of kiteboarding technology.
            </p>
            <p className="text-sm sm:text-base font-duotone-regular text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
                Fly the lightest, most durable, and highest performing gear on the market.
            </p>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                size="large" 
                className="font-duotone-bold !h-14 !px-8 !text-lg !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
                style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
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
            <span className="font-duotone-bold text-yellow-300 tracking-widest uppercase text-sm md:text-base mb-2 block">
                Electric Hydrofoil
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended tracking-tight text-white drop-shadow-xl mb-3">
                E-FOIL RENTAL
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
                No wind required. Electric flight.
            </p>
            <p className="text-sm sm:text-base font-duotone-regular text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
                Glide silently above the water on our premium electric hydrofoils — the most unique watersports experience on the coast.
            </p>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                size="large" 
                className="font-duotone-bold !h-14 !px-8 !text-lg !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
                style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
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
          <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended mb-3 text-white">Not sure which rental is right for you?</h2>
          <p className="font-duotone-regular text-[#e0e0e0] mb-8 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Our team is on hand to help you choose the right equipment for your level and goals. Just get in touch.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Button
              icon={<InfoCircleOutlined />}
              size="large"
              className="font-duotone-bold !h-12 !rounded-md !px-8 shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
              style={{ background: 'transparent', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.4)' }}
            >
              Read FAQ
            </Button>
            <Button
              type="primary"
              size="large"
              className="font-duotone-bold !h-12 !rounded-md !px-10 !text-base shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
              style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
              href="/contact"
            >
              Contact Us
            </Button>
          </div>
          <ContactOptionsBanner />
        </div>
      </div>

      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center" style={{ margin: '16px 0 16px 0' }}>
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla White Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '8px 0' }}
        />
      </div>
    </div>
  );
};

export default RentalLandingPage;
