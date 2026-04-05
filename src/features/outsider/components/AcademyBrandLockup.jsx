import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';
import { UkcBrandDot } from '@/shared/components/ui/UkcBrandDot';

/** White Duotone SVG → solid UKC cyan on light backgrounds (filter tuned to #00a8c4) */
export const LOGO_WHITE_TO_BRAND_CYAN_FILTER =
  'brightness(0) saturate(100%) invert(64%) sepia(57%) saturate(676%) hue-rotate(145deg) brightness(95%) contrast(91%)';

/** Duotone Pro Center Urla + Powered By UKC — `light` / `anthracite` / `whiteBanner` = cyan logo; whiteBanner tagline anthracite + emerald dot; dark = white tagline. */
export function AcademyBrandLockup({ wrapperClassName = '', compact = false, tone = 'dark' }) {
  const onLight = tone === 'light';
  const onAnthracite = tone === 'anthracite';
  const onWhiteBanner = tone === 'whiteBanner';
  const logoCyan = onLight || onAnthracite || onWhiteBanner;
  const taglineShadow =
    onLight || onWhiteBanner ? undefined : { textShadow: '0 1px 2px rgba(0,0,0,0.45)' };
  const taglineTextClass = onWhiteBanner ? 'text-[#4b4f54]' : onLight ? 'text-slate-500' : 'text-white';
  const logoFilter = logoCyan
    ? LOGO_WHITE_TO_BRAND_CYAN_FILTER
    : 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))';
  return (
    <div
      className={`flex flex-col items-center gap-8 sm:gap-12 ${compact ? 'w-full max-w-3xl sm:max-w-4xl md:max-w-5xl' : 'w-full max-w-5xl lg:max-w-6xl'} ${wrapperClassName}`}
    >
      <img
        src={dpsLogo}
        alt="Duotone Pro Center Urla"
        className={`h-auto ${compact ? 'w-[112%] max-w-none sm:w-full sm:max-w-4xl' : 'w-full max-w-5xl'}`}
        style={{
          filter: logoFilter,
        }}
      />
      <p
        className={`flex flex-wrap items-baseline justify-center gap-x-2 text-center font-gotham-bold tracking-normal leading-tight ${taglineTextClass} ${compact ? 'mt-3 sm:mt-5 text-lg sm:text-xl md:text-2xl' : 'text-lg sm:text-xl md:text-2xl'}`}
        style={taglineShadow}
      >
        <span>Powered By</span>
        <span className={`inline-flex items-baseline whitespace-nowrap font-gotham-bold ${taglineTextClass}`}>
          <span style={{ letterSpacing: '0.1em' }}>UKC</span>
          <UkcBrandDot className="ml-[0.03em]" style={{ top: '-0.02em' }} />
        </span>
      </p>
    </div>
  );
}
