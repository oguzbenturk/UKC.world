const SummaryMetricStrip = ({ cards = [], loading = false }) => {
  const placeholders = Array.from({ length: 4 }, (_, index) => `placeholder-${index}`);

  return (
    <section>
      <div
        className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
        data-testid="summary-strip"
      >
        {loading && !cards.length ? (
          placeholders.map((key) => (
            <div
              key={key}
              className="h-[80px] sm:h-[90px] rounded-xl border border-slate-100 bg-slate-50/70 animate-pulse"
            />
          ))
        ) : (
          cards.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-slate-100 bg-white shadow-sm px-3 py-2.5 sm:p-4 transition hover:-translate-y-0.5 hover:shadow-md hover:border-sky-200"
            >
              <header className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${card.dotClass ?? 'bg-slate-400'}`} />
                <p className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                  {card.title}
                </p>
              </header>
              <p className={`mt-1 sm:mt-2 text-base sm:text-xl font-bold tabular-nums truncate ${card.textClass ?? 'text-slate-900'}`}>
                {card.value}
              </p>
              {card.hint && (
                <p className="mt-0.5 sm:mt-1.5 text-[10px] sm:text-xs text-slate-400 truncate">
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
