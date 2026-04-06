import { useEffect, useMemo, useState } from 'react';

const dotBase = 'h-1.5 w-6 rounded-full transition-colors duration-300';

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
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid="hero-carousel"
    >
      <div
        className="flex transition-transform duration-500"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {validSlides.map((slide, index) => (
          <article
            key={slide.id || index}
            className="min-w-full px-6 py-8 md:px-10 md:py-10 flex flex-col gap-3"
          >
            <header className="flex items-center gap-3">
              {slide.pill && (
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${slide.pill.variant ?? 'bg-sky-100 text-sky-700'}`}>
                  {slide.pill.label}
                </span>
              )}
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {slide.eyebrow || 'Instructor Highlight'}
              </p>
            </header>
            <h2 className="text-2xl md:text-3xl font-semibold text-slate-900 leading-snug">
              {slide.title}
            </h2>
            {slide.body && (
              <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                {slide.body}
              </p>
            )}
            {slide.cta && (
              <div className="mt-4 flex flex-wrap gap-3">
                {slide.cta.primary && (
                  <button
                    type="button"
                    onClick={slide.cta.primary.onClick}
                    className="inline-flex items-center justify-center rounded-md bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-sm font-medium transition"
                  >
                    {slide.cta.primary.label}
                  </button>
                )}
                {slide.cta.secondary && (
                  <button
                    type="button"
                    onClick={slide.cta.secondary.onClick}
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    {slide.cta.secondary.label}
                  </button>
                )}
              </div>
            )}
            {slide.footer && (
              <footer className="mt-auto pt-4 text-xs text-slate-500">
                {slide.footer}
              </footer>
            )}
          </article>
        ))}
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
        {validSlides.map((slide, index) => (
          <button
            key={slide.id || index}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            className={`${dotBase} ${index === activeIndex ? 'bg-sky-500' : 'bg-slate-200'}`}
            onClick={() => setActiveIndex(index)}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroCarousel;
