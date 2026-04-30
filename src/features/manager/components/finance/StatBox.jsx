// src/features/manager/components/finance/StatBox.jsx
function StatBox({ label, value, sub, color = 'text-gray-800', border = 'border-gray-100', icon = null }) {
  return (
    <div className={`rounded-xl border ${border} bg-white p-4 min-w-0 shadow-sm`}>
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-bold ${color} truncate`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-1 truncate">{sub}</div>}
    </div>
  );
}

export default StatBox;
