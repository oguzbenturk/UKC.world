import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation(['admin']);
  if (!statistics) return null;

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
      <StatPill label={t('admin:support.stats.total')} value={statistics.total ?? 0} accentKey="total" />
      <StatPill label={t('admin:support.stats.open')} value={statistics.byStatus?.open ?? 0} accentKey="open" />
      <StatPill label={t('admin:support.stats.inProgress')} value={statistics.byStatus?.in_progress ?? 0} accentKey="in_progress" />
      <StatPill label={t('admin:support.stats.resolved')} value={statistics.byStatus?.resolved ?? 0} accentKey="resolved" />
    </div>
  );
};

export default SupportDashboardStats;
