const accentColors = {
  total: 'border-l-slate-400',
  open: 'border-l-amber-400',
  in_progress: 'border-l-sky-400',
  resolved: 'border-l-emerald-400',
};

const StatPill = ({ label, value, accentKey }) => (
  <div
    className={`min-w-[130px] shrink-0 rounded-2xl border border-slate-100 border-l-[3px] bg-white px-4 py-3 shadow-sm ${accentColors[accentKey] || 'border-l-slate-300'}`}
  >
    <p className="font-gotham-medium text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-1 font-duotone-bold text-xl text-slate-900">{value}</p>
  </div>
);

const SupportDashboardStats = ({ statistics }) => {
  if (!statistics) return null;

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
      <StatPill label="Total" value={statistics.total ?? 0} accentKey="total" />
      <StatPill label="Open" value={statistics.byStatus?.open ?? 0} accentKey="open" />
      <StatPill label="In Progress" value={statistics.byStatus?.in_progress ?? 0} accentKey="in_progress" />
      <StatPill label="Resolved" value={statistics.byStatus?.resolved ?? 0} accentKey="resolved" />
    </div>
  );
};

export default SupportDashboardStats;
