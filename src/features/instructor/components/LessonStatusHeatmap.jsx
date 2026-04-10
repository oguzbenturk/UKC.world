const statusColors = {
  completed: { badge: 'bg-emerald-100 text-emerald-700', accent: 'bg-emerald-500', ring: 'ring-emerald-100' },
  confirmed: { badge: 'bg-sky-100 text-sky-700', accent: 'bg-sky-500', ring: 'ring-sky-100' },
  pending: { badge: 'bg-amber-100 text-amber-700', accent: 'bg-amber-500', ring: 'ring-amber-100' },
  cancelled: { badge: 'bg-rose-100 text-rose-700', accent: 'bg-rose-500', ring: 'ring-rose-100' },
  'no-show': { badge: 'bg-slate-100 text-slate-600', accent: 'bg-slate-400', ring: 'ring-slate-100' },
};

const getStatusColor = (status) => {
  const key = (status || '').toLowerCase().replace(/_/g, '-');
  return statusColors[key] || { badge: 'bg-slate-100 text-slate-600', accent: 'bg-slate-400', ring: 'ring-slate-100' };
};

const LessonStatusHeatmap = ({ breakdown = [] }) => {
  if (!breakdown.length) {
    return (
      <section className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4">
        <h2 className="text-sm font-semibold text-slate-900">Lesson activity</h2>
        <p className="mt-1 text-[10px] sm:text-xs text-slate-400">Book sessions to unlock insights.</p>
      </section>
    );
  }

  const total = breakdown.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4 space-y-2 sm:space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Lesson activity</h2>
        <span className="text-[10px] text-slate-400 tabular-nums">{total} total</span>
      </header>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
        {breakdown.map((item) => {
          const colors = getStatusColor(item.status);
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <div
              key={item.status}
              className={`rounded-lg sm:rounded-xl border border-slate-100 bg-white p-2 sm:p-3 transition hover:-translate-y-0.5 hover:shadow-sm ring-1 ${colors.ring}`}
            >
              <span className={`inline-block rounded px-1.5 py-px text-[8px] sm:text-[10px] font-semibold uppercase tracking-wide ${colors.badge}`}>
                {item.status}
              </span>
              <p className="mt-1 sm:mt-2 text-lg sm:text-2xl font-bold text-slate-900 tabular-nums">{item.count}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${colors.accent} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[8px] sm:text-[10px] tabular-nums text-slate-400">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default LessonStatusHeatmap;
