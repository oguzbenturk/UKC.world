import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

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
    image: '/Images/ukc/team.png', // Reusing team image for social/camp vibe
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
      element.scrollIntoView({ behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  return (
    <div className="bg-[#17140b] min-h-screen text-white font-sans selection:bg-yellow-500/30">
      
      {/* Sticky Navigation */}
      <div className="sticky top-0 z-50 bg-[#17140b]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 overflow-x-auto no-scrollbar">
          <div className="flex justify-center md:space-x-12 space-x-6 min-w-max py-4">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`text-sm tracking-[0.2em] font-medium transition-all duration-300 relative py-2 ${
                  activeSection === section.id 
                    ? 'text-yellow-400' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {section.label}
                {activeSection === section.id && (
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <section 
          id={section.id} 
          key={section.id} 
          className="relative h-screen min-h-[600px] w-full flex items-center justify-center overflow-hidden"
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
          <div className="relative z-20 text-center px-4 max-w-4xl mx-auto transform transition-all duration-700 hover:scale-[1.02]">
            <h2 className="text-5xl md:text-7xl font-bold mb-6 tracking-tighter text-white drop-shadow-2xl">
              {section.title}
            </h2>
            <p className="text-xl md:text-2xl text-gray-200 mb-10 font-light max-w-2xl mx-auto leading-relaxed drop-shadow-md">
              {section.description}
            </p>
            
            <button
              onClick={() => navigate(section.path)}
              className="group relative inline-flex items-center gap-3 px-8 py-4 bg-yellow-500 text-black font-bold tracking-widest text-sm hover:bg-yellow-400 transition-all duration-300 transform hover:-translate-y-1 shadow-[0_4px_14px_0_rgba(234,179,8,0.39)]"
            >
              <span>{section.buttonText}</span>
              <ArrowRightIcon className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </section>
      ))}

      {/* Explore Footer */}
      <div className="bg-[#141109] py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-500 text-sm tracking-widest mb-4">EXPLORE MORE</p>
          <div className="flex justify-center gap-8 flex-wrap">
            <span className="text-gray-400 hover:text-white cursor-pointer transition-colors" onClick={() => navigate('/academy')}>ACADEMY</span>
            <span className="text-gray-400 hover:text-white cursor-pointer transition-colors" onClick={() => navigate('/rental')}>RENTAL</span>
            <span className="text-gray-400 hover:text-white cursor-pointer transition-colors" onClick={() => navigate('/shop')}>SHOP</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExperienceLandingPage;
