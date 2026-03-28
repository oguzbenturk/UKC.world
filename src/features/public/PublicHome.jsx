import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline';
import dpcLogo from '../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';
import bgVideo from '../../../DuotoneFonts/backgroundvideo.mp4';

const PublicHome = () => {
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = React.useState(true);
  const videoRef = React.useRef(null);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted) {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  return (
    <div className="relative h-screen min-h-[600px] w-full flex items-center justify-center overflow-hidden bg-[#0f1013] text-white font-sans">
      
      {/* Background Video with Dark Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/50 to-black/80 z-10" />
        <video
          ref={videoRef}
          autoPlay
          loop
          muted={isMuted}
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
          </div>

          {/* Logo */}
          <img src={dpcLogo} alt="Duotone Pro Center Urla" style={{ height: '75px', objectFit: 'contain' }} />
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

        {/* Mute/Unmute classic icon control below Discover */}
        <button
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute video audio' : 'Mute video audio'}
          className="mt-8 inline-flex h-12 min-w-[90px] flex-col items-center justify-center rounded-md bg-black/20 opacity-70 transition hover:opacity-100"
          style={{ backdropFilter: 'blur(4px)' }}
        >
          <span className="flex items-center justify-center text-white w-full h-10">
            {isMuted ? (
              <SpeakerXMarkIcon className="h-6 w-6 text-white opacity-95 m-auto" />
            ) : (
              <SpeakerWaveIcon className="h-6 w-6 text-white opacity-95 m-auto" />
            )}
          </span>
          <span className="text-[10px] text-white/75 mt-1">{isMuted ? 'UNMUTE' : 'MUTE'}</span>
        </button>

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
