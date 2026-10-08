// KPI strip on top of the Members page (GET /member-offerings/admin/stats).
import { useTranslation } from 'react-i18next';
import { SkeletonBlock } from '@/features/instructor/earnings/components/ui';
import { useMoney } from '@/features/instructor/earnings/earningsFormat';

function Tile({ label, value, sub, onClick, active, tone = 'text-slate-900', testId }) {
  const content = (
    <>
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`text-2xl font-extrabold tabular-nums leading-tight ${tone}`}>{value}</span>
      {sub && <span className="text-xs text-slate-600">{sub}</span>}
    </>
  );
  const cls = `flex min-w-0 flex-col gap-0.5 rounded-2xl border bg-white p-3.5 text-left shadow-sm ${active ? 'border-[#00798c] ring-2 ring-[#00798c]/20' : 'border-slate-200'}`;
  if (!onClick) return <div data-testid={testId} className={cls}>{content}</div>;
  return (
    <button type="button" data-testid={testId} onClick={onClick} aria-pressed={active} className={`${cls} hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]`}>
      {content}
    </button>
  );
}

export default function MembersKpis({ stats, loading, view, onView, isDesktop }) {
  const { t } = useTranslation(['admin']);
  const { money } = useMoney(stats?.currency || 'EUR');
  const grid = isDesktop ? 'grid grid-cols-6 gap-3' : 'grid grid-cols-2 gap-2.5';
  if (loading || !stats) {
    return (
      <div className={grid} role="status" aria-label={t('admin:membersPage.loading')}>
        {Array.from({ length: isDesktop ? 6 : 4 }, (_, i) => <SkeletonBlock key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }
  const { storage } = stats;
  return (
    <div className={grid} data-testid="members-kpis">
      <Tile
        testId="kpi-active"
        label={t('admin:membersPage.kpi.active')}
        value={stats.active}
        sub={t('admin:membersPage.kpi.activePeople', { count: stats.activePeople })}
        active={view === 'active'}
        onClick={() => onView('active')}
        tone="text-emerald-700"
      />
      <Tile
        testId="kpi-expiring"
        label={t('admin:membersPage.kpi.expiring7')}
        value={stats.expiring7}
        sub={t('admin:membersPage.kpi.expiring30', { count: stats.expiring30 })}
        active={view === 'expiring'}
        onClick={() => onView('expiring')}
        tone="text-amber-800"
      />
      <Tile
        testId="kpi-expired"
        label={t('admin:membersPage.kpi.expired')}
        value={stats.expired}
        sub={t('admin:membersPage.kpi.expiredRecent', { count: stats.expiredRecent })}
        active={view === 'expired'}
        onClick={() => onView('expired')}
      />
      <Tile
        testId="kpi-storage"
        label={t('admin:membersPage.kpi.storage')}
        value={storage.capacity ? `${storage.inUse} / ${storage.capacity}` : storage.inUse}
        sub={storage.capacity
          ? t('admin:membersPage.kpi.storageFree', { count: Math.max(storage.capacity - storage.inUse, 0) })
          : t('admin:membersPage.kpi.storageNoCapacity')}
        active={view === 'storage'}
        onClick={() => onView('storage')}
      />
      <Tile
        testId="kpi-beach"
        label={t('admin:membersPage.kpi.beach')}
        value={stats.beach.active}
        sub={t('admin:membersPage.kpi.beachTotal', { count: stats.beach.memberships })}
        active={view === 'beach'}
        onClick={() => onView('beach')}
      />
      <Tile
        testId="kpi-new"
        label={t('admin:membersPage.kpi.newThisMonth')}
        value={stats.newThisMonth}
        sub={t('admin:membersPage.kpi.sold', { month: money(stats.soldThisMonth), year: money(stats.soldThisYear) })}
      />
    </div>
  );
}
