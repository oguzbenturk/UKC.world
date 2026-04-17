export function AcademyBrandLockup({ wrapperClassName = '', compact = false, tone = 'dark' }) {
  const textClass = tone === 'light' || tone === 'anthracite' || tone === 'whiteBanner'
    ? 'text-neutral-800'
    : 'text-white';

  return (
    <div
      className={`flex flex-col items-center gap-4 ${compact ? 'w-full max-w-3xl sm:max-w-4xl md:max-w-5xl' : 'w-full max-w-5xl lg:max-w-6xl'} ${wrapperClassName}`}
    >
      <p
        className={`flex items-baseline justify-center gap-x-2 font-gotham-bold tracking-normal leading-tight ${textClass} ${compact ? 'text-lg sm:text-xl md:text-2xl' : 'text-lg sm:text-xl md:text-2xl'}`}
      >
        <span>Powered by</span>
        <span className="font-gotham-bold" style={{ letterSpacing: '0.05em' }}>Plannivo</span>
      </p>
    </div>
  );
}
