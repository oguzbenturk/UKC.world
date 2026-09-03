// Compact inline stat tile (same shape as the Products page's StatBadge).
const StatTile = ({ title, value, icon, iconClass = 'text-slate-400' }) => (
  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
    {icon && <span className={`text-sm leading-none ${iconClass}`}>{icon}</span>}
    <div>
      <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-slate-400">{title}</p>
      <p className="mt-0.5 text-sm font-semibold leading-none text-slate-800">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  </div>
);

export default StatTile;
