const colorScale = ['bg-emerald-200', 'bg-emerald-300', 'bg-emerald-400', 'bg-emerald-500'];

const LessonStatusHeatmap = ({ breakdown = [] }) => {
  if (!breakdown.length) {
    return (
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Lesson activity</h2>
        <p className="mt-2 text-sm text-slate-500">Book a few sessions to unlock insights.</p>
      </section>
    );
  }

  const maxValue = breakdown.reduce((max, item) => Math.max(max, item.count), 0) || 1;

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Lesson activity</h2>
        <p className="text-xs text-slate-500">Status distribution across all upcoming and past bookings.</p>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {breakdown.map((item) => {
          const intensityIndex = Math.min(colorScale.length - 1, Math.floor((item.count / maxValue) * (colorScale.length - 1)));
          return (
            <div
              key={item.status}
              className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:shadow-sm`}
            >
              <span className={`inline-block rounded-lg px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-100 ${colorScale[intensityIndex]}`}>
                {item.status}
              </span>
              <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{item.count}</p>
              <p className="text-xs text-slate-500">sessions</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default LessonStatusHeatmap;
