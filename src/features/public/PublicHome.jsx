import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import dpcLogo from '../../../DuotoneFonts/DPC-URLAtransparentonwhite.png';
import bgVideo from '../../../DuotoneFonts/backgroundvideo.mp4';

const PublicHome = () => {
  const navigate = useNavigate();

  return (
    <div className="relative h-screen min-h-[600px] w-full flex items-center justify-center overflow-hidden bg-[#0f1013] text-white font-sans">
      
      {/* Background Video with Dark Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/50 to-black/80 z-10" />
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src={bgVideo} type="video/mp4" />
        </video>
      </div>

      {/* Content Container - pb-32 added to lift content up and avoid overlapping footer */}
      <div className="relative z-20 flex flex-col items-center justify-center text-center px-4 max-w-5xl mx-auto w-full pb-32">
        
        {/* Brand block — centered */}
        <div className="flex flex-col items-center mb-8">
          {/* Main Brand Title */}
          <div className="flex items-baseline mb-3">
            <span className="font-gotham-medium antialiased text-white drop-shadow-2xl" style={{ fontSize: 'clamp(2.5rem, 7vw, 5rem)', fontWeight: 500, textRendering: 'geometricPrecision', letterSpacing: 0, lineHeight: 1 }}>UKC</span>
            <span style={{ display: 'inline-block', width: 'clamp(0.32rem, 0.85vw, 0.62rem)', height: 'clamp(0.32rem, 0.85vw, 0.62rem)', borderRadius: '50%', backgroundColor: '#00a8c4', marginLeft: '0.05em', marginBottom: '0.12em', flexShrink: 0 }} />
          </div>

          {/* Logo */}
          <img src={dpcLogo} alt="Duotone Pro Center Urla" style={{ height: '85px', objectFit: 'contain', filter: 'invert(1)' }} />
        </div>

{/* Description / Services Quick View */}
        <p className="font-duotone-regular max-w-xl text-base md:text-lg text-gray-300 leading-relaxed mb-10 drop-shadow-lg">
          Experience the ultimate watersports destination. Offering premium Kite, Wing, and Foil lessons, 
          top-tier Duotone equipment rentals, and luxury accommodation in the heart of Urla.
        </p>

        {/* CTA Button */}
        <div className="group relative">
          <button
            onClick={() => navigate('/guest')}
            className="font-duotone-bold bg-[#4b4f54] text-[#00a8c4] text-base py-4 px-8 rounded-md leading-none inline-flex items-center justify-center gap-4 transition-all duration-300 hover:scale-[1.02] hover:bg-[#525759]"
            style={{
              border: '1px solid rgba(0,168,196,0.6)',
              boxShadow: '0 0 10px rgba(0,168,196,0.3), 0 0 24px rgba(0,168,196,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
              letterSpacing: '0.22em',
              paddingLeft: 'calc(2rem + 0.22em)',
            }}
          >
            <span>D I S C O V E R</span>
            <span style={{ width: '1px', height: '14px', backgroundColor: 'rgba(0,168,196,0.35)', flexShrink: 0 }} />
            <ArrowRightIcon className="w-4 h-4 text-[#00a8c4] group-hover:translate-x-1 transition-transform duration-300 flex-shrink-0" />
          </button>
        </div>

      </div>

      {/* Footer Info / Decor */}
      <div className="absolute bottom-8 w-full text-center z-20">
         <div className="flex justify-center gap-8 text-xs md:text-sm tracking-widest text-gray-500 font-medium">
            <span>LESSONS</span>
            <span className="text-[#00a8c4]">•</span>
            <span>RENTALS</span>
            <span className="text-[#00a8c4]">•</span>
            <span>SHOP</span>
            <span className="text-[#00a8c4]">•</span>
            <span>STAY</span>
            <span className="text-[#00a8c4]">•</span>
            <span>EXPERIENCE</span>
         </div>
      </div>

    </div>
  );
};

export default PublicHome;
