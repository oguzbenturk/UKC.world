// Segment tiles on top of the Customers page (GET /users/customers/segments).
// Each tile filters the list; the active one is marked with a ring + aria-pressed.
import { useTranslation } from 'react-i18next';
import { SkeletonBlock } from '@/features/instructor/earnings/components/ui';
import { useMoney } from '@/features/instructor/earnings/earningsFormat';

function Tile({ label, value, sub, active, onClick, tone = 'text-slate-900', testId, compact }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 flex-col gap-0.5 rounded-2xl border bg-white text-left shadow-sm hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] ${compact ? 'p-2.5' : 'p-3.5'} ${active ? 'border-[#00798c] ring-2 ring-[#00798c]/20' : 'border-slate-200'}`}
    >
      <span className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`font-extrabold tabular-nums leading-tight ${compact ? 'text-xl' : 'text-2xl'} ${tone}`}>{value}</span>
      {sub && <span className="truncate text-xs text-slate-600">{sub}</span>}
    </button>
  );
}

export default function CustomerTiles({ data, loading, segment, activity, onSegment, onActivity, isDesktop }) {
  const { t } = useTranslation(['manager']);
  const { money } = useMoney(data?.currency || 'EUR');
  const grid = isDesktop ? 'grid grid-cols-9 gap-3' : 'grid grid-cols-3 gap-2';
  if (loading || !data) {
    return (
      <div className={grid} role="status" aria-label={t('manager:customersPage.loading')}>
        {Array.from({ length: isDesktop ? 9 : 6 }, (_, i) => <SkeletonBlock key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }
  const s = data.segments;
  const pct = (n) => (data.total ? Math.round((n / data.total) * 100) : 0);
  const seg = (key) => ({ active: segment === key, onClick: () => onSegment(segment === key ? 'all' : key) });
  const compact = !isDesktop;
  return (
    <div className={grid} data-testid="customer-tiles">
      <Tile testId="tile-total" compact={compact} label={t('manager:customersPage.tiles.total')} value={data.total}
        sub={t('manager:customersPage.tiles.newThisMonth', { count: data.newThisMonth })}
        active={segment === 'all' && activity === 'any'} onClick={() => { onSegment('all'); onActivity('any'); }} />
      <Tile testId="tile-lessons" compact={compact} label={t('manager:customersPage.seg.lessons')} value={s.lessons}
        sub={t('manager:customersPage.tiles.share', { pct: pct(s.lessons) })} {...seg('lessons')} />
      <Tile testId="tile-shop" compact={compact} label={t('manager:customersPage.seg.shop')} value={s.shop}
        sub={t('manager:customersPage.tiles.share', { pct: pct(s.shop) })} {...seg('shop')} />
      <Tile testId="tile-members" compact={compact} label={t('manager:customersPage.seg.members')} value={s.members}
        sub={t('manager:customersPage.tiles.membersActive', { count: s.membersActive })} {...seg('members')} />
      <Tile testId="tile-rentals" compact={compact} label={t('manager:customersPage.seg.rentals')} value={s.rentals}
        sub={t('manager:customersPage.tiles.share', { pct: pct(s.rentals) })} {...seg('rentals')} />
      <Tile testId="tile-stays" compact={compact} label={t('manager:customersPage.seg.stays')} value={s.stays}
        sub={t('manager:customersPage.tiles.share', { pct: pct(s.stays) })} {...seg('stays')} />
      <Tile testId="tile-active" compact={compact} label={t('manager:customersPage.tiles.active30')} value={data.active30}
        sub={t('manager:customersPage.tiles.inactive', { count: data.inactive30 })} tone="text-emerald-700"
        active={activity === 'active'} onClick={() => onActivity(activity === 'active' ? 'any' : 'active')} />
      <Tile testId="tile-owes" compact={compact} label={t('manager:customersPage.seg.owes')} value={data.owes.count}
        sub={money(Math.abs(data.owes.total))} tone={data.owes.count ? 'text-rose-700' : 'text-slate-900'} {...seg('owes')} />
      <Tile testId="tile-credit" compact={compact} label={t('manager:customersPage.seg.credit')} value={data.credit.count}
        sub={money(data.credit.total)} {...seg('credit')} />
    </div>
  );
}
