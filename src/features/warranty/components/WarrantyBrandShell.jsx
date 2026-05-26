import React from 'react';
import { Link } from 'react-router-dom';
import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';

// Dark brand shell for /care/warranty. Pulls the same atmosphere as the
// existing CareLandingPage (deep oil-slick background, Duotone cyan accent
// #00a8c4) but adds gradient mesh + grain + dot grid so a long form doesn't
// feel like an empty void.
export default function WarrantyBrandShell({ children, showLogo = true }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0d1511] text-white selection:bg-teal-400/30">
      {/* keyframes once, scoped via class name */}
      <style>{`
        @keyframes warrantyFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .warranty-fade-up {
          animation: warrantyFadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .warranty-meridian::before,
        .warranty-meridian::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(0,168,196,0.35), transparent);
        }
      `}</style>

      {/* Atmospheric gradient mesh */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[680px] w-[1300px] blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(20,184,166,0.22), transparent 70%)' }}
        />
        <div
          className="absolute top-[420px] -left-32 h-[420px] w-[640px] blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(8,145,178,0.16), transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 right-0 h-[520px] w-[720px] blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(5,150,105,0.12), transparent 70%)' }}
        />
      </div>

      {/* Grain noise overlay — gives the dark plate some film-like texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"
        }}
      />

      {/* Subtle dot grid for spatial reference */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)'
        }}
      />

      <div className="relative z-10">
        {showLogo && (
          <div className="pt-10 sm:pt-14 pb-2 warranty-fade-up">
            <Link
              to="/care"
              aria-label="Duotone Pro Center Urla"
              className="block mx-auto w-[180px] sm:w-[220px] opacity-90 transition hover:opacity-100"
            >
              <img
                src={dpsLogo}
                alt="Duotone Pro Center Urla"
                className="w-full"
                style={{ filter: 'drop-shadow(0 4px 18px rgba(0,168,196,0.25))' }}
              />
            </Link>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
