import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

const PublicHome = () => {
  const navigate = useNavigate();

  return (
    <div className="relative h-screen min-h-[600px] w-full flex items-center justify-center overflow-hidden bg-[#0f1013] text-white font-sans">
      
      {/* Background Image with Dark Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/50 to-black/80 z-10" />
        {/* Using a high impact action shot */}
        <img 
          src="/Images/ukc/kite-header.jpg.png" 
          alt="UKC World Kitesurfing"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Content Container - pb-32 added to lift content up and avoid overlapping footer */}
      <div className="relative z-20 flex flex-col items-center justify-center text-center px-4 max-w-5xl mx-auto w-full pb-32">
        
        {/* Main Brand Title */}
        <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter text-white mb-2 drop-shadow-2xl">
          UKC<span className="text-yellow-500">.</span>WORLD
        </h1>
        
        {/* Subtitle / Designation */}
        <h2 className="text-xl md:text-3xl font-light tracking-[0.3em] text-gray-200 mb-8 uppercase border-b border-yellow-500/50 pb-4 inline-block">
          Duotone Pro Center
        </h2>

        {/* Powered By */}
        <p className="text-sm md:text-base text-gray-400 tracking-widest font-medium mb-12 uppercase opacity-80">
          Powered by UKC
        </p>

        {/* Description / Services Quick View */}
        <p className="max-w-2xl text-lg md:text-xl text-gray-300 font-light leading-relaxed mb-12 drop-shadow-lg">
          Experience the ultimate watersports destination. Offering premium Kite, Wing, and Foil lessons, 
          top-tier Duotone equipment rentals, and luxury accommodation in the heart of Urla.
        </p>

        {/* The "Visible Enough" Button */}
        <div className="group relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
          <button
            onClick={() => navigate('/guest')}
            className="relative bg-black text-white text-xl md:text-2xl font-bold py-6 px-12 md:px-16 rounded-lg leading-none flex items-center gap-4 hover:bg-neutral-900 transition-all duration-300 transform hover:scale-[1.02] border border-yellow-500/30"
          >
            <span>ENTER THE WORLD</span>
            <ArrowRightIcon className="w-8 h-8 text-yellow-500 group-hover:translate-x-2 transition-transform duration-300" />
          </button>
        </div>

      </div>

      {/* Footer Info / Decor */}
      <div className="absolute bottom-8 w-full text-center z-20">
         <div className="flex justify-center gap-8 text-xs md:text-sm tracking-widest text-gray-500 font-medium">
            <span>LESSONS</span>
            <span className="text-yellow-500">•</span>
            <span>RENTALS</span>
            <span className="text-yellow-500">•</span>
            <span>SHOP</span>
            <span className="text-yellow-500">•</span>
            <span>STAY</span>
            <span className="text-yellow-500">•</span>
            <span>EXPERIENCE</span>
         </div>
      </div>

    </div>
  );
};

export default PublicHome;
