const SummaryMetricStrip = ({ cards = [], loading = false }) => {
  const placeholders = Array.from({ length: 4 }, (_, index) => `placeholder-${index}`);

  return (
    <section className="relative">
      <div className="md:hidden mb-3 text-xs text-slate-500 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
        Swipe to explore your metrics
      </div>
      <div
        className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 xl:grid-cols-4 md:gap-4 md:overflow-visible scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200"
        data-testid="summary-strip"
      >
        {loading && !cards.length ? (
          placeholders.map((key) => (
            <div
              key={key}
              className="h-28 min-w-[220px] md:min-w-0 rounded-2xl border border-slate-200 bg-slate-100/70 animate-pulse"
            />
          ))
        ) : (
          cards.map((card) => (
            <article
              key={card.title}
              className="group min-w-[220px] md:min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <header className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${card.dotClass ?? 'bg-slate-400'}`} />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {card.title}
                </p>
              </header>
              <p className={`mt-3 text-2xl font-semibold text-slate-900 ${card.textClass ?? ''}`}>
                {card.value}
              </p>
              {card.hint && (
                <p className="mt-2 text-xs text-slate-500">
                  {card.hint}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default SummaryMetricStrip;
