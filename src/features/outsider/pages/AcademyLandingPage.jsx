import { useState } from 'react';
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
  InfoCircleOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const AcademyLandingPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Kite Lessons | UKC Academy',
    description: 'Learn kitesurfing with our experienced instructors. From beginner to advanced, we have packages for everyone.'
  });

  const handleBookService = (category = 'lesson') => {
    setBookingInitialData({ serviceCategory: category });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  // Helper to scroll to packages
  const scrollToPackages = () => {
    document.getElementById('packages-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-[#0f1013] min-h-screen text-white font-sans pb-20">
      
      {/* Hero Banner Container */}
      <div className="relative min-h-[500px] flex flex-col group">
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

        {/* Top Category Nav */}
        <div className="relative z-20 border-b border-white/10 bg-black/20 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-center space-x-12 py-5 overflow-x-auto">
                <button className="flex items-center gap-2 text-blue-400 font-bold border-b-2 border-blue-400 pb-1 px-1 drop-shadow-md tracking-wide">
                <RocketOutlined /> KITE
                </button>
                <button className="flex items-center gap-2 text-white/70 hover:text-white font-medium transition-colors px-1 drop-shadow-md tracking-wide">
                <CloudOutlined /> FOIL
                </button>
                <button className="flex items-center gap-2 text-white/70 hover:text-white font-medium transition-colors px-1 drop-shadow-md tracking-wide">
                <GlobalOutlined /> WING
                </button>
                <button className="flex items-center gap-2 text-white/70 hover:text-white font-medium transition-colors px-1 drop-shadow-md tracking-wide">
                <ThunderboltOutlined /> E-FOIL
                </button>
            </div>
            </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
            <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight text-white drop-shadow-xl">
                KITE LESSONS
            </h1>
            <div className="flex flex-wrap gap-4 text-blue-100 text-sm md:text-base mb-10 items-center font-medium opacity-90">
                <span className="flex items-center gap-2 bg-blue-500/20 px-3 py-1 rounded-full border border-blue-400/30 backdrop-blur-sm">
                    <CheckOutlined className="text-blue-400" /> IKO Certified
                </span>
                <span className="flex items-center gap-2 bg-blue-500/20 px-3 py-1 rounded-full border border-blue-400/30 backdrop-blur-sm">
                    <CloudOutlined className="text-blue-400" /> Thermal Winds
                </span>
                <span className="flex items-center gap-2 bg-blue-500/20 px-3 py-1 rounded-full border border-blue-400/30 backdrop-blur-sm">
                    <RocketOutlined className="text-blue-400" /> All Gear Included
                </span>
            </div>
            
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
      <div className="relative min-h-[500px] flex flex-col group">
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
            <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight text-white drop-shadow-xl">
                WING FOILING
            </h1>
            <div className="flex flex-wrap gap-4 text-purple-100 text-sm md:text-base mb-10 items-center font-medium opacity-90">
                <span className="flex items-center gap-2 bg-purple-500/20 px-3 py-1 rounded-full border border-purple-400/30 backdrop-blur-sm">
                    <CheckOutlined className="text-purple-400" /> Expert Coaching
                </span>
                <span className="flex items-center gap-2 bg-purple-500/20 px-3 py-1 rounded-full border border-purple-400/30 backdrop-blur-sm">
                    <GlobalOutlined className="text-purple-400" /> Latest Gear
                </span>
                <span className="flex items-center gap-2 bg-purple-500/20 px-3 py-1 rounded-full border border-purple-400/30 backdrop-blur-sm">
                    <RocketOutlined className="text-purple-400" /> Perfect Spot
                </span>
            </div>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                type="primary" 
                size="large" 
                className="!bg-purple-600 !border-purple-600 hover:!bg-purple-500 !h-14 !px-10 !text-lg !font-bold !rounded-lg shadow-xl shadow-purple-900/40 hover:-translate-y-1 transition-transform"
                onClick={() => handleBookService('wing')}
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
      <div className="relative min-h-[500px] flex flex-col group">
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
            <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight text-white drop-shadow-xl">
                KITE FOILING
            </h1>
            <div className="flex flex-wrap gap-4 text-cyan-100 text-sm md:text-base mb-10 items-center font-medium opacity-90">
                <span className="flex items-center gap-2 bg-cyan-500/20 px-3 py-1 rounded-full border border-cyan-400/30 backdrop-blur-sm">
                    <CheckOutlined className="text-cyan-400" /> Advanced Training
                </span>
                <span className="flex items-center gap-2 bg-cyan-500/20 px-3 py-1 rounded-full border border-cyan-400/30 backdrop-blur-sm">
                    <CloudOutlined className="text-cyan-400" /> Premium Foils
                </span>
                <span className="flex items-center gap-2 bg-cyan-500/20 px-3 py-1 rounded-full border border-cyan-400/30 backdrop-blur-sm">
                    <RocketOutlined className="text-cyan-400" /> Silent Flight
                </span>
            </div>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                type="primary" 
                size="large" 
                className="!bg-cyan-600 !border-cyan-600 hover:!bg-cyan-500 !h-14 !px-10 !text-lg !font-bold !rounded-lg shadow-xl shadow-cyan-900/40 hover:-translate-y-1 transition-transform"
                onClick={() => handleBookService('foil')}
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
      <div className="relative min-h-[500px] flex flex-col group">
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
            <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight text-white drop-shadow-xl">
                E-FOILING
            </h1>
            <div className="flex flex-wrap gap-4 text-green-100 text-sm md:text-base mb-10 items-center font-medium opacity-90">
                <span className="flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-full border border-green-400/30 backdrop-blur-sm">
                    <CheckOutlined className="text-green-400" /> Electric Power
                </span>
                <span className="flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-full border border-green-400/30 backdrop-blur-sm">
                    <ThunderboltOutlined className="text-green-400" /> No Wind Needed
                </span>
                <span className="flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-full border border-green-400/30 backdrop-blur-sm">
                    <RocketOutlined className="text-green-400" /> Instant Fun
                </span>
            </div>
            
            <div className="flex flex-wrap gap-4">
                <Button 
                type="primary" 
                size="large" 
                className="!bg-green-600 !border-green-600 hover:!bg-green-500 !h-14 !px-10 !text-lg !font-bold !rounded-lg shadow-xl shadow-green-900/40 hover:-translate-y-1 transition-transform"
                onClick={() => handleBookService('efoil')}
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

      {/* Learning Path Section */}
      <div className="relative py-20 md:py-24 bg-gradient-to-b from-[#0f1013] to-[#13151a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">Your Learning Journey</h2>
                <p className="text-gray-400 max-w-2xl mx-auto">Follow our proven progression system designed to take you from total beginner to independent rider safely and efficiently.</p>
            </div>
        
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {/* Path Arrow Connectors (Desktop only) */}
            <div className="hidden lg:block absolute top-1/2 left-[25%] -translate-y-1/2 w-8 text-white/5 text-4xl font-bold -ml-4 z-0">›››</div>
            <div className="hidden lg:block absolute top-1/2 left-[50%] -translate-y-1/2 w-8 text-white/5 text-4xl font-bold -ml-4 z-0">›››</div>
            <div className="hidden lg:block absolute top-1/2 left-[75%] -translate-y-1/2 w-8 text-white/5 text-4xl font-bold -ml-4 z-0">›››</div>

            {/* Step 1: Discover */}
            <div className="bg-[#1a1d26] rounded-2xl p-8 border border-white/5 relative z-10 hover:border-blue-500/50 transition-all hover:shadow-2xl hover:shadow-blue-900/10 h-full flex flex-col group">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">Discover</h3>
                        <p className="text-blue-400/80 text-sm font-medium mt-1">1 - 2 hours</p>
                    </div>
                    <div className="bg-blue-500/10 w-10 h-10 rounded-full flex items-center justify-center text-blue-400 font-bold">1</div>
                </div>
                <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> 1x Instructor
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> Kite Control Basics
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> Safety Systems
                </li>
                </ul>
                <div className="mt-auto pt-6 border-t border-white/5">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Starting from</p>
                <p className="flex items-baseline gap-1">
                    <span className="text-white text-2xl font-bold">€150</span>
                    <span className="text-gray-500">/day</span>
                </p>
                </div>
            </div>

            {/* Step 2: Water Start */}
            <div className="bg-[#1a1d26] rounded-2xl p-8 border border-white/5 relative z-10 hover:border-blue-500/50 transition-all hover:shadow-2xl hover:shadow-blue-900/10 h-full flex flex-col group">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">Water Start</h3>
                        <p className="text-blue-400/80 text-sm font-medium mt-1">3 - 5 hours</p>
                    </div>
                    <div className="bg-blue-500/10 w-10 h-10 rounded-full flex items-center justify-center text-blue-400 font-bold">2</div>
                </div>
                <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> Private Lessons
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> Body Dragging
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> First Board Starts
                </li>
                </ul>
                <div className="mt-auto pt-6 border-t border-white/5">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Starting from</p>
                <p className="flex items-baseline gap-1">
                    <span className="text-white text-2xl font-bold">€90</span>
                    <span className="text-gray-500">/person</span>
                </p>
                </div>
            </div>

            {/* Step 3: Ride Upwind */}
            <div className="bg-[#1a1d26] rounded-2xl p-8 border border-white/5 relative z-10 hover:border-blue-500/50 transition-all hover:shadow-2xl hover:shadow-blue-900/10 h-full flex flex-col group">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">Ride Upwind</h3>
                        <p className="text-blue-400/80 text-sm font-medium mt-1">6 - 9 hours</p>
                    </div>
                    <div className="bg-blue-500/10 w-10 h-10 rounded-full flex items-center justify-center text-blue-400 font-bold">3</div>
                </div>
                <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> Consistent Riding
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> Speed Control
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> First Transitions
                </li>
                </ul>
                <div className="mt-auto pt-6 border-t border-white/5">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Starting from</p>
                <p className="flex items-baseline gap-1">
                    <span className="text-white text-2xl font-bold">€90</span>
                    <span className="text-gray-500">/person</span>
                </p>
                </div>
            </div>

            {/* Step 4: Independent Rider */}
            <div className="bg-[#1a1d26] rounded-2xl p-8 border border-white/5 relative z-10 hover:border-blue-500/50 transition-all hover:shadow-2xl hover:shadow-blue-900/10 h-full flex flex-col group">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">Independent</h3>
                        <p className="text-blue-400/80 text-sm font-medium mt-1">10+ hours</p>
                    </div>
                    <div className="bg-blue-500/10 w-10 h-10 rounded-full flex items-center justify-center text-blue-400 font-bold">4</div>
                </div>
                <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> Upwind Riding
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> Self-Rescue
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckOutlined className="text-blue-500 mt-1" /> IKO Certification
                </li>
                </ul>
                <div className="mt-auto pt-6 border-t border-white/5">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Starting from</p>
                <p className="flex items-baseline gap-1">
                    <span className="text-white text-2xl font-bold">€200</span>
                    <span className="text-gray-500">/day</span>
                </p>
                </div>
            </div>      
            </div>
        </div>
      </div>

      {/* Packages Section */}
      <div id="packages-section" className="bg-[#0b0c10] py-24 relative overflow-hidden">
        {/* Background Decorative Blobs */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px]"></div>
            <div className="absolute bottom-[20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[100px]"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">Flexible Lesson Packages</h2>
                <p className="text-gray-400">Choose the perfect package for your progression goals</p>
            </div>
            <button 
              className="text-blue-400 hover:text-blue-300 text-sm font-semibold flex items-center gap-2 transition-colors py-2 px-4 rounded-lg hover:bg-blue-500/10"
              onClick={() => navigate('/academy/kite-lessons')}
            >
              <TeamOutlined /> Compare All Options <RightOutlined className="text-xs" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Beginner Private */}
            <div className="bg-[#1a1d26] rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-blue-900/20 transition-all duration-300 group border border-white/5 hover:border-blue-500/30 flex flex-col">
              <div className="p-8 flex-grow">
                <div className="w-14 h-14 bg-blue-500/10 rounded-xl flex items-center justify-center mb-6 text-blue-400">
                    <SafetyCertificateOutlined className="text-3xl" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Private Course</h3>
                <p className="text-gray-400 mb-6 text-sm">The fastest way to learn with 1-on-1 instruction focused entirely on you.</p>
                
                <div className="h-px bg-white/5 mb-6"></div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-green-400 mt-1 flex-shrink-0" /> 
                    <span><strong>1 Instructor</strong> per student</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-green-400 mt-1 flex-shrink-0" /> 
                    <span>Radio Helmet Communication</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-green-400 mt-1 flex-shrink-0" /> 
                    <span>Personalized Progression</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-green-400 mt-1 flex-shrink-0" /> 
                    <span>Full Gear Included</span>
                  </li>
                </ul>
              </div>
              <div className="p-8 bg-[#15171e] border-t border-white/5">
                <div className="mb-4">
                    <p className="text-xs text-gray-400 uppercase font-semibold">Starting from</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">€150</span>
                        <span className="text-sm font-normal text-gray-400">/day</span>
                    </div>
                </div>
                <Button 
                    type="primary" 
                    block 
                    className="!bg-blue-600 hover:!bg-blue-500 !border-none !h-12 !font-bold !rounded-lg text-base shadow-lg shadow-blue-900/20"
                    onClick={() => navigate('/academy/kite-lessons')}
                >
                    Book Private
                </Button>
              </div>
            </div>

            {/* Group Course - Featured */}
            <div className="bg-[#1a1d26] rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/10 transition-all duration-300 group border border-blue-500/30 relative flex flex-col transform md:-translate-y-4">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-cyan-400"></div>
              <div className="absolute top-4 right-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  POPULAR
              </div>
              
              <div className="p-8 flex-grow">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center mb-6 text-blue-400">
                    <TeamOutlined className="text-3xl" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Semi-Private</h3>
                <p className="text-gray-400 mb-6 text-sm">Perfect balance of instruction and practice time. Learn with a friend!</p>
                
                <div className="h-px bg-white/5 mb-6"></div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-blue-400 mt-1 flex-shrink-0" /> 
                    <span><strong>2 Students</strong> per instructor</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-blue-400 mt-1 flex-shrink-0" /> 
                    <span>Discounted Rate</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-blue-400 mt-1 flex-shrink-0" /> 
                    <span>Learn by Watching</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-blue-400 mt-1 flex-shrink-0" /> 
                    <span>Fun Social Atmosphere</span>
                  </li>
                </ul>
              </div>
              <div className="p-8 bg-[#15171e] border-t border-white/5">
                <div className="mb-4">
                    <p className="text-xs text-gray-400 uppercase font-semibold">Starting from</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">€90</span>
                        <span className="text-sm font-normal text-gray-400">/day per person</span>
                    </div>
                </div>
                <Button 
                    type="primary" 
                    block 
                    className="!bg-gradient-to-r !from-blue-600 !to-cyan-500 hover:!from-blue-500 hover:!to-cyan-400 !border-none !h-12 !font-bold !rounded-lg text-base shadow-lg shadow-blue-500/25"
                    onClick={() => navigate('/academy/kite-lessons')}
                >
                    Book Group
                </Button>
              </div>
            </div>

             {/* Premium Coaching */}
             <div className="bg-[#1a1d26] rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-blue-900/20 transition-all duration-300 group border border-white/5 hover:border-yellow-500/30 flex flex-col">
              <div className="p-8 flex-grow">
                <div className="w-14 h-14 bg-yellow-500/10 rounded-xl flex items-center justify-center mb-6 text-yellow-500">
                    <TrophyOutlined className="text-3xl" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Pro Coaching</h3>
                <p className="text-gray-400 mb-6 text-sm">Advanced training for autonomous riders looking to master new tricks.</p>
                
                <div className="h-px bg-white/5 mb-6"></div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-yellow-500 mt-1 flex-shrink-0" /> 
                    <span><strong>Pro Instructor</strong> (Senior)</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-yellow-500 mt-1 flex-shrink-0" /> 
                    <span>Video Analysis</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-yellow-500 mt-1 flex-shrink-0" /> 
                    <span>Trick Progression</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <CheckOutlined className="text-yellow-500 mt-1 flex-shrink-0" /> 
                    <span>Advanced Gear Demo</span>
                  </li>
                </ul>
              </div>
              <div className="p-8 bg-[#15171e] border-t border-white/5">
                <div className="mb-4">
                    <p className="text-xs text-gray-400 uppercase font-semibold">Starting from</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">€200</span>
                        <span className="text-sm font-normal text-gray-400">/day</span>
                    </div>
                </div>
                <Button 
                    type="primary" 
                    block 
                    className="!bg-white !text-black hover:!bg-gray-200 !border-none !h-12 !font-bold !rounded-lg text-base"
                    onClick={() => navigate('/academy/kite-lessons')}
                >
                    Book Pro
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

       {/* Excellence Section */}
       <div className="bg-[#13151a] py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-10 text-white text-center">Why Choose UKC Academy?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Feature 1 */}
                <div className="bg-[#1a1d26] p-8 rounded-2xl border border-white/5 flex flex-col gap-4 items-center text-center hover:bg-[#20242e] transition-colors">
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-2">
                    <SafetyCertificateOutlined className="text-3xl text-blue-400" />
                </div>
                <div>
                    <h4 className="font-bold text-white text-xl mb-2">IKO Certified Instructors</h4>
                    <p className="text-gray-400 text-sm leading-relaxed">Safety first priority with internationally recognized certification standards and years of teaching experience.</p>
                </div>
                </div>

                {/* Feature 2 */}
                <div className="bg-[#1a1d26] p-8 rounded-2xl border border-white/5 flex flex-col gap-4 items-center text-center hover:bg-[#20242e] transition-colors">
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-2">
                    <RocketOutlined className="text-3xl text-blue-400" />
                </div>
                <div>
                    <h4 className="font-bold text-white text-xl mb-2">Premium Duotone Gear</h4>
                    <p className="text-gray-400 text-sm leading-relaxed">Learn faster and safer with the latest top-of-the-line equipment from Duotone, renewed every season.</p>
                </div>
                </div>

                {/* Feature 3 */}
                <div className="bg-[#1a1d26] p-8 rounded-2xl border border-white/5 flex flex-col gap-4 items-center text-center hover:bg-[#20242e] transition-colors">
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-2">
                    <CloudOutlined className="text-3xl text-blue-400" />
                </div>
                <div>
                    <h4 className="font-bold text-white text-xl mb-2">Perfect Conditions</h4>
                    <p className="text-gray-400 text-sm leading-relaxed">Consistent thermal winds and shallow, flat water make Urla one of the best learning spots in the world.</p>
                </div>
                </div>
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

       {/* Sticky Bottom Bar */}
       <div className="fixed bottom-0 left-0 right-0 bg-[#0f1013]/90 backdrop-blur-xl border-t border-white/10 p-4 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
            <div className="flex flex-col">
                <span className="text-gray-400 text-xs uppercase tracking-wider">Starting from</span>
                <div className="flex items-baseline gap-2">
                    <span className="text-white font-bold text-xl">€90</span>
                    <span className="text-gray-500 text-sm">/person</span>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="hidden md:flex flex-col items-end justify-center mr-4">
                    <span className="text-green-400 text-xs font-bold flex items-center gap-1"><CheckOutlined /> Available Tomorrow</span>
                    <span className="text-gray-500 text-xs">Book online instantly</span>
                </div>
                <Button 
                    type="primary"
                    size="large"
                    className="!bg-blue-600 hover:!bg-blue-500 !border-none !px-8 !h-12 !font-bold !rounded-lg shadow-lg shadow-blue-600/20"
                    onClick={() => navigate('/academy/kite-lessons')}
                >
                    Book Now
                </Button>
            </div>
        </div>
       </div>

      {/* Booking Wizard Modal */}
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
      />
    </div>
  );
};

export default AcademyLandingPage;
