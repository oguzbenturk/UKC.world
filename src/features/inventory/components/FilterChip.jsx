// Pill toggles for the category / size / sub-type rails. Active colour matches the
// page's primary button (slate-900) rather than a page-specific accent.
export const FilterChip = ({ active, label, count, onClick, small = false }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition ${
      small ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
    } ${
      active
        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
    }`}
  >
    {label}
    {count !== undefined && (
      <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
        {count}
      </span>
    )}
  </button>
);

export const ChipRail = ({ label, children }) => (
  <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
    {label && (
      <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
    )}
    {children}
  </div>
);

export default FilterChip;
