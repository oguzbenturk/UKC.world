import { useEffect, useMemo, useState } from 'react';

const dotBase = 'h-1.5 rounded-full transition-all duration-300 cursor-pointer';

const HeroCarousel = ({
  slides = [],
  interval = 6500,
}) => {
  const validSlides = useMemo(() => slides.filter(Boolean), [slides]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!validSlides.length) return undefined;
    const id = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % validSlides.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [validSlides, interval]);

  useEffect(() => {
    if (activeIndex >= validSlides.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, validSlides]);

  if (!validSlides.length) {
    return null;
  }

  return (
    <div
      className="relative overflow-hidden rounded-lg sm:rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/40 to-white"
      data-testid="hero-carousel"
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {validSlides.map((slide, index) => (
          <article
            key={slide.id || index}
            className="min-w-full px-3.5 py-3 sm:px-6 sm:py-5 md:px-8 md:py-6 flex flex-col gap-1.5 sm:gap-2"
          >
            <header className="flex items-center gap-2">
              {slide.pill && (
                <span className={`inline-flex items-center rounded-full px-2 py-px sm:px-2.5 sm:py-0.5 text-[9px] sm:text-[11px] font-semibold tracking-wide ${slide.pill.variant ?? 'bg-sky-100 text-sky-700'}`}>
                  {slide.pill.label}
                </span>
              )}
              <p className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                {slide.eyebrow || 'Highlight'}
              </p>
            </header>
            <h2 className="text-base sm:text-xl md:text-2xl font-semibold text-slate-900 leading-snug line-clamp-2">
              {slide.title}
            </h2>
            {slide.body && (
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed line-clamp-2 sm:line-clamp-none max-w-lg">
                {slide.body}
              </p>
            )}
            {slide.cta && (slide.cta.primary || slide.cta.secondary) && (
              <div className="mt-1 flex flex-wrap gap-2">
                {slide.cta.primary && (
                  <button
                    type="button"
                    onClick={slide.cta.primary.onClick}
                    className="inline-flex items-center justify-center rounded-md sm:rounded-lg bg-sky-500 hover:bg-sky-600 active:scale-95 text-white px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-medium transition shadow-sm shadow-sky-500/20"
                  >
                    {slide.cta.primary.label}
                  </button>
                )}
                {slide.cta.secondary && (
                  <button
                    type="button"
                    onClick={slide.cta.secondary.onClick}
                    className="inline-flex items-center justify-center rounded-md sm:rounded-lg border border-slate-200 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50 active:scale-95 transition"
                  >
                    {slide.cta.secondary.label}
                  </button>
                )}
              </div>
            )}
            {slide.footer && (
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                {slide.footer}
              </p>
            )}
          </article>
        ))}
      </div>

      {validSlides.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-2 sm:pb-3">
          {validSlides.map((slide, index) => (
            <button
              key={slide.id || index}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              className={`${dotBase} ${index === activeIndex ? 'w-4 sm:w-5 bg-sky-500' : 'w-1.5 bg-slate-200 hover:bg-slate-300'}`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HeroCarousel;
