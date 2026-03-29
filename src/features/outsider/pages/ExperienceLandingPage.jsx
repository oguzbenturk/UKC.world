import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import StickyNavBar from '@/shared/components/navigation/StickyNavBar';
import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';

const sections = [
  {
    id: 'kite-packages',
    label: 'KITE PACKAGES',
    title: 'KITE PACKAGES',
    image: '/Images/ukc/kite-header.jpg.png', // Reusing kite header
    description: 'Complete kitesurfing holiday packages tailored to your level.',
    path: '/experience/kite-packages',
    buttonText: 'VIEW PACKAGES'
  },
  {
    id: 'wing-packages',
    label: 'WING PACKAGES',
    title: 'WING PACKAGES',
    image: '/Images/ukc/wing-header.png', // Reusing wing header
    description: 'Experience the freedom of wing foiling with our comprehensive packages.',
    path: '/experience/wing-packages',
    buttonText: 'VIEW PACKAGES'
  },
  {
    id: 'downwinders',
    label: 'DOWNWINDERS',
    title: 'DOWNWINDERS',
    image: '/Images/ukc/rebel-dlab-header.jpg', // Using another action shot
    description: 'Unforgettable downwind journeys along the stunning coastline.',
    path: '/experience/downwinders',
    buttonText: 'EXPLORE ROUTES'
  },
  {
    id: 'camps',
    label: 'CAMPS',
    title: 'CAMPS',
    image: '/Images/ukc/evo-sls-header.jpg', // Replace watermark with clean action shot
    description: 'Join our exclusive camps for intensive training and community vibes.',
    path: '/experience/camps',
    buttonText: 'JOIN A CAMP'
  }
];

const ExperienceLandingPage = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('kite-packages');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 3;
      
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      // Use smooth scroll and rely on section scrollMarginTop for offset
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans selection:bg-yellow-500/30 relative z-0">
      
      {/* Duotone Pro Center Urla Logo */}
      <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-[95vw] sm:w-[65vw] md:w-[48rem] max-w-[850px] z-20 pointer-events-none">
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla Logo"
          className="w-full"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}
        />
      </div>
      
      {/* Sticky Navigation */}
      <StickyNavBar
        className="sticky top-0 z-50"
        bgColor="bg-[#0d1511]"
        items={sections}
        activeItem={activeSection}
        onItemClick={(id) => scrollToSection(id)}
      />

      {/* Sections */}
      {sections.map((section) => (
        <section 
          id={section.id} 
          key={section.id} 
          className="relative min-h-[500px] sm:min-h-[600px] w-full flex flex-col group overflow-hidden"
          style={{ scrollMarginTop: '88px' }}
        >
          {/* Background Image with Dark Gradient Overlay */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80 z-10" />
            <img 
              src={section.image} 
              alt={section.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Content */}
          <div className="relative z-20 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32 w-full text-left items-start">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold-extended mb-4 tracking-tight text-white drop-shadow-xl uppercase">
              {section.title}
            </h2>
            <p className="text-lg sm:text-xl font-duotone-regular text-white mb-2 drop-shadow max-w-2xl leading-relaxed">
              {section.description}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-8">
              <button
                onClick={() => navigate(section.path)}
                className="group relative inline-flex items-center gap-3 px-10 py-4 bg-[#4b4f54] text-[#00a8c4] font-duotone-bold tracking-widest text-sm hover:scale-[1.02] active:scale-95 transition-all duration-200 border border-[#00a8c4]/30 rounded-md shadow-[0_0_12px_rgba(0,168,196,0.15)]"
              >
                <span>{section.buttonText}</span>
                <ArrowRightIcon className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </section>
      ))}

      {/* Contact Us Section */}
      <div className="py-16 sm:py-20 border-t border-white/5 bg-[#0d1511]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended mb-1 text-white uppercase tracking-tight">Have questions about our packages?</h2>
          <p className="font-gotham-bold text-yellow-400 mb-3 text-xs tracking-widest uppercase">UKC.experience</p>
          <p className="font-duotone-regular text-gray-300 mb-8 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            Our team is here to help you choose the right experience bundle for your level and goals.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <button
              className="font-duotone-bold h-14 rounded-md px-10 text-lg shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
              style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
              onClick={() => navigate('/contact')}
            >
              Contact Us
            </button>
          </div>
        </div>
      </div>

      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center py-12" style={{ background: '#0d1511' }}>
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla White Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '8px 0' }}
        />
      </div>
    </div>
  );
};

export default ExperienceLandingPage;
