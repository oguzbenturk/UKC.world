import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightIcon,
  PauseIcon,
  PlayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from '@heroicons/react/24/outline';
import dpcLogo from '../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';
import { UkcBrandDot, UkcBrandWordmark } from '@/shared/components/ui/UkcBrandDot';
import bgVideo from '../../../DuotoneFonts/backgroundvideo.mp4';

const formatVideoTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const PublicHome = () => {
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = React.useState(true);
  const [isPlaying, setIsPlaying] = React.useState(true);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const videoRef = React.useRef(null);
  const seekingRef = React.useRef(false);
  const userToggledRef = React.useRef(false);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    let cancelled = false;

    const tryAutoPlay = () => {
      if (cancelled || !v) return;
      // Only force muted if user hasn't explicitly toggled sound
      if (!userToggledRef.current) {
        v.muted = true;
      }
      const playPromise = v.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    };

    const onTime = () => {
      if (!seekingRef.current) setCurrentTime(v.currentTime);
    };
    const syncDuration = () => {
      const d = v.duration;
      if (Number.isFinite(d)) setDuration(d);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', syncDuration);
    v.addEventListener('loadeddata', tryAutoPlay);
    v.addEventListener('canplay', tryAutoPlay);
    v.addEventListener('durationchange', syncDuration);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    tryAutoPlay();
    syncDuration();
    setCurrentTime(v.currentTime);
    setIsPlaying(!v.paused);

    return () => {
      cancelled = true;
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', syncDuration);
      v.removeEventListener('loadeddata', tryAutoPlay);
      v.removeEventListener('canplay', tryAutoPlay);
      v.removeEventListener('durationchange', syncDuration);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    userToggledRef.current = true;
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
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-[#0f1013] text-white font-sans">
      
      {/* Background Video with Dark Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/50 to-black/80 z-10" />
        <video
          ref={videoRef}
          autoPlay
          loop
          muted={isMuted}
          preload="auto"
          playsInline
          className="w-full h-full object-cover"
        >
          <source src={bgVideo} type="video/mp4" />
        </video>
      </div>

      {/* Single column: one gap scale (gap-8 sm:gap-10) between every adjacent block — desc↔Discover = Discover↔mute */}
      <div className="relative z-20 mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-6 text-center sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 sm:gap-10 lg:gap-[56px] pb-28 sm:pb-32 lg:pb-36">
          <UkcBrandWordmark
            className="drop-shadow-2xl"
            rootStyle={{
              fontSize: 'clamp(2.5rem, 7vw, 5rem)',
              lineHeight: 1,
            }}
            dotStyle={{
              width: '0.22em',
              height: '0.22em',
            }}
          />
          <img src={dpcLogo} alt="Duotone Pro Center Urla" className="h-14 w-auto object-contain sm:h-20" />
          <p className="max-w-md font-duotone-regular text-sm leading-relaxed text-gray-300 drop-shadow-lg sm:max-w-2xl sm:text-base md:text-lg">
            Experience the ultimate watersports destination. Offering premium Kite, Wing, and Foil lessons,
            top-tier Duotone equipment rentals, and luxury accommodation in the heart of Urla.
          </p>

          <div className="group relative">
            <button
              onClick={() => navigate('/guest')}
              className="inline-flex items-center justify-center gap-4 rounded-md bg-[#4b4f54] px-8 py-4 font-duotone-bold text-base leading-none text-[#00a8c4] transition-all duration-300 hover:scale-[1.02] hover:bg-[#525759]"
              style={{
                border: '1px solid rgba(0,168,196,0.6)',
                boxShadow: '0 0 10px rgba(0,168,196,0.3), 0 0 24px rgba(0,168,196,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
                letterSpacing: '0.22em',
                paddingLeft: 'calc(2rem + 0.22em)',
              }}
            >
              <span>D I S C O V E R</span>
              <span style={{ width: '1px', height: '14px', backgroundColor: 'rgba(0,168,196,0.35)', flexShrink: 0 }} />
              <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-[#00a8c4] transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>

          <button
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute video audio' : 'Mute video audio'}
            className="inline-flex h-12 min-w-[104px] flex-col items-center justify-center gap-1 rounded-md border border-white/10 bg-black/20 px-3 opacity-80 transition hover:opacity-100 sm:h-16 sm:min-w-[128px] sm:px-4"
            style={{ backdropFilter: 'blur(4px)' }}
          >
            <span className="flex h-8 w-full items-center justify-center text-white sm:h-9">
              {isMuted ? (
                <SpeakerXMarkIcon className="m-auto h-6 w-6 text-white opacity-95" />
              ) : (
                <SpeakerWaveIcon className="m-auto h-6 w-6 text-white opacity-95" />
              )}
            </span>
            <span className="mt-1 text-[10px] tracking-wide text-white/75">{isMuted ? 'UNMUTE' : 'MUTE'}</span>
          </button>
        </div>
      </div>

      {/* Bottom: video-width controls + padded footer row */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col gap-1.5 pb-2 sm:gap-2 sm:pb-4 lg:pb-5">
        <div className="mx-auto w-full max-w-[calc(100vw-1.5rem)] bg-transparent px-1 py-1 sm:max-w-[calc(100vw-2rem)] sm:px-2 sm:py-1.5 lg:max-w-[calc(100vw-2.5rem)]">
          <div className="flex w-full flex-col gap-0.5">
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause video' : 'Play video'}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/[0.08] text-white/90 transition hover:bg-white/[0.14] sm:h-8 sm:w-8"
              >
                {isPlaying ? (
                  <PauseIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                ) : (
                  <PlayIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                )}
              </button>
              <input
                type="range"
                aria-label="Video progress"
                min={0}
                max={Number.isFinite(duration) && duration > 0 ? duration : 0}
                step={0.1}
                value={Number.isFinite(currentTime) ? currentTime : 0}
                onPointerDown={() => {
                  seekingRef.current = true;
                }}
                onPointerUp={() => {
                  seekingRef.current = false;
                }}
                onPointerCancel={() => {
                  seekingRef.current = false;
                }}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  const t = parseFloat(e.target.value, 10);
                  if (Number.isFinite(t)) {
                    v.currentTime = t;
                    setCurrentTime(t);
                  }
                }}
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#00a8c4]"
              />
            </div>
            <div className="flex w-full items-center gap-2">
              <span className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 justify-between tabular-nums text-[9px] text-white/60 sm:text-[10px]">
                <span>{formatVideoTime(currentTime)}</span>
                <span>{formatVideoTime(duration)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 text-center sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] font-medium tracking-widest text-gray-200 sm:gap-x-12 sm:text-xs md:text-sm">
            <span>LESSONS</span>
            <span className="inline-flex items-center" style={{ fontSize: '0.62rem' }}>
              <UkcBrandDot style={{ top: 0 }} />
            </span>
            <span>RENTALS</span>
            <span className="inline-flex items-center" style={{ fontSize: '0.62rem' }}>
              <UkcBrandDot style={{ top: 0 }} />
            </span>
            <span>SHOP</span>
            <span className="inline-flex items-center" style={{ fontSize: '0.62rem' }}>
              <UkcBrandDot style={{ top: 0 }} />
            </span>
            <span>STAY</span>
            <span className="inline-flex items-center" style={{ fontSize: '0.62rem' }}>
              <UkcBrandDot style={{ top: 0 }} />
            </span>
            <span>EXPERIENCE</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default PublicHome;
