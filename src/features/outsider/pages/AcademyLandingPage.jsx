import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

const ACADEMY_NAV_ITEMS = [
  { id: 'kite-section', label: 'KITE' },
  { id: 'foil-section', label: 'FOIL' },
  { id: 'wing-section', label: 'WING' },
  { id: 'efoil-section', label: 'E-FOIL' },
  { id: 'premium-section', label: 'PREMIUM', shortLabel: 'VIP' },
];

const AcademyLandingPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [activeSection, setActiveSection] = useState('kite-section');
  const [imagesLoaded, setImagesLoaded] = useState({});

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

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-6 selection:bg-emerald-400/30">
      {/* Top Category Nav - Sticky (ShopLandingPage style, no icons) */}
      <StickyNavBar
        className="sticky top-0 z-50"
        bgColor="bg-[#0d1511]"
        items={ACADEMY_NAV_ITEMS}
        activeItem={activeSection}
        onItemClick={(id) => scrollToSection(id)}
      />

      {/* Hero Banner Container */}
      <div id="kite-section" className="relative min-h-[500px] sm:min-h-[600px] flex flex-col group" style={{ scrollMarginTop: '88px' }}>
        {/* Background Image with loading state */}
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
          {/* Loading skeleton */}
          {!imagesLoaded['kite'] && (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-green-900/20 animate-pulse" />
          )}
          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-[#0d1511]" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32 w-full">

            <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-[95vw] sm:w-[65vw] md:w-[48rem] max-w-[850px]">
              <img
                src={new URL('@/../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg', import.meta.url).href}
                alt="Duotone Pro Center Urla White Logo"
                className="w-full"
                style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}
              />
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended tracking-tight text-white drop-shadow-xl mb-3 mt-24">
              KITE LESSONS
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
              Start your kitesurfing journey — or take it to the next level.
            </p>
            <p className="text-sm sm:text-base font-duotone-regular text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
              From your very first kite to carving waves and chasing jumps, our IKO-certified instructors tailor every lesson to your pace. Beginners, improvers, and advanced riders all welcome.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Button
                type="primary"
                size="large"
                className="bg-[#4b4f54] text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:-translate-y-1 transition-transform w-full sm:w-auto border-none"
                onClick={() => navigate('/academy/kite-lessons')}
              >
                Book Your Lesson
              </Button>
            </div>
        </div>
      </div>

      {/* Wing Foiling Banner Container */}
      <div id="wing-section" className="relative min-h-[500px] sm:min-h-[600px] flex flex-col group" style={{ scrollMarginTop: '88px' }}>
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
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32 w-full">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-3 tracking-tight text-white drop-shadow-xl">
                WING FOILING
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
                The fastest growing watersport in the world — and easier than you think.
            </p>
            <p className="text-sm sm:text-base text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
                Combine the simplicity of a handheld wing with the magic of foiling. Our coaches will have you gliding silently above the water in just a few sessions, no prior experience needed.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Button
                type="primary"
                size="large"
                className="bg-[#4b4f54] text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:-translate-y-1 transition-transform w-full sm:w-auto border-none"
                onClick={() => navigate('/academy/wing-lessons')}
                >
                Book Wing Lesson
                </Button>
            </div>
        </div>
      </div>

      {/* Kite Foiling Banner Container */}
      <div id="foil-section" className="relative min-h-[500px] sm:min-h-[600px] flex flex-col group" style={{ scrollMarginTop: '88px' }}>
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

        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32 w-full">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-3 tracking-tight text-white drop-shadow-xl">
                KITE FOILING
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
                Take your kiting to new heights — literally.
            </p>
            <p className="text-sm sm:text-base text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
                Already comfortable on a kite? Kite foiling unlocks a whole new dimension — near-silent flight, incredible upwind performance, and speeds that will blow your mind. Built for experienced kiters ready to push their progression.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Button
                type="primary"
                size="large"
                className="bg-[#4b4f54] text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:-translate-y-1 transition-transform w-full sm:w-auto border-none"
                onClick={() => navigate('/academy/foil-lessons')}
                >
                Book Foil Lesson
                </Button>
            </div>
        </div>
      </div>

      {/* E-Foiling Banner Container */}
      <div id="efoil-section" className="relative min-h-[500px] sm:min-h-[600px] flex flex-col group" style={{ scrollMarginTop: '88px' }}>
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

        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32 w-full">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-duotone-bold-extended mb-3 tracking-tight text-white drop-shadow-xl">
                E-FOILING
            </h1>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
                No wind? No problem. Pure electric flight.
            </p>
            <p className="text-sm sm:text-base text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
                Experience the sensation of flying above the water on our Fliteboard e-foils — powered by a whisper-quiet electric motor. Zero wind required, zero prior experience needed. If you can balance, you can fly.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Button
                type="primary"
                size="large"
                className="bg-[#4b4f54] text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:-translate-y-1 transition-transform w-full sm:w-auto border-none"
                onClick={() => navigate('/academy/efoil-lessons')}
                >
                Book E-Foil Session
                </Button>
            </div>
        </div>
      </div>

      {/* Premium Banner Container */}
      <div id="premium-section" className="relative min-h-[500px] sm:min-h-[600px] flex flex-col group" style={{ scrollMarginTop: '88px' }}>
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

        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32 w-full">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-3 tracking-tight text-white drop-shadow-xl">
            PREMIUM LESSONS
          </h1>
          <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow">
            Private coaching. Exclusive experience. Rapid results.
          </p>
          <p className="text-sm sm:text-base text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
            Our Premium packages pair you with our most experienced instructors for fully personalized, one-on-one sessions. Whether you're fast-tracking your progression or simply want the best possible experience on the water — this is it.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Button
              type="primary"
              size="large"
                className="bg-[#4b4f54] text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:-translate-y-1 transition-transform w-full sm:w-auto border-none"
              onClick={() => navigate('/academy/premium-lessons')}
            >
              Book Premium Lesson
            </Button>
          </div>
        </div>
      </div>

       {/* FAQ Placeholder - Adding "Missing" content */}
      <div className="py-20 bg-[#0d1511]">
         <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl font-duotone-bold mb-4 text-white">Have Questions?</h2>
            <p className="text-gray-400 mb-8">Not sure which package is right for you? Our team is here to help plan your kiteboarding journey.</p>
            <div className="flex justify-center gap-4">
                 <Button icon={<InfoCircleOutlined />} size="large" className="!bg-[#1a1d26] !text-white !border-white/10 hover:!border-white/30 font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg drop-shadow hover:-translate-y-1 transition-transform w-full sm:w-auto">
                    Read FAQ
                 </Button>
                  <Button type="primary" size="large" className="bg-[#4b4f54] text-[#00a8c4] font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !rounded-lg shadow-xl shadow-emerald-900/40 hover:-translate-y-1 transition-transform w-full sm:w-auto border-none" onClick={() => navigate('/contact')}>
                    Contact Us
                 </Button>
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
      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center" style={{ margin: '16px 0 16px 0' }}>
        <img
          src={new URL('@/../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg', import.meta.url).href}
          alt="Duotone Pro Center Urla White Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '8px 0' }}
        />
      </div>
    </div>
  );
};

export default AcademyLandingPage;
