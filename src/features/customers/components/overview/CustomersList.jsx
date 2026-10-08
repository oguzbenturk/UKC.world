// Customer list: a table on desktop, cards on mobile. "Uses" badges show what each
// customer buys (lessons, shop, membership, rentals, stays); balance is labelled
// "owes" / "credit" in text, never by colour alone.
import { useTranslation } from 'react-i18next';
import { Dropdown } from 'antd';
import { cardClass, secondaryButtonClass } from '@/features/instructor/earnings/components/earningsStyles';
import { useMoney } from '@/features/instructor/earnings/earningsFormat';
import { MessageIcon } from '@/features/instructor/dashboard/components/DashboardIcons';
import { PersonAvatar } from '@/features/members/components/overview/MemberParts';

const BADGE = {
  lessons: 'bg-cyan-50 text-[#00687a]',
  shop: 'bg-violet-50 text-violet-800',
  member_active: 'bg-emerald-50 text-emerald-800',
  member: 'bg-slate-100 text-slate-700',
  rentals: 'bg-amber-50 text-amber-900',
  stays: 'bg-indigo-50 text-indigo-800',
};

export function SegmentBadges({ segments = [] }) {
  const { t } = useTranslation(['manager']);
  if (!segments.length) return <span className="text-xs text-slate-500">{t('manager:customersPage.uses.none')}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {segments.map((s) => (
        <span key={s} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${BADGE[s] || BADGE.member}`}>
          {t(`manager:customersPage.uses.${s}`)}
        </span>
      ))}
    </span>
  );
}

function Balance({ value, money }) {
  const { t } = useTranslation(['manager']);
  const n = Number(value) || 0;
  if (n < 0) {
    return (
      <span className="flex flex-col items-end leading-tight">
        <span className="font-semibold tabular-nums text-rose-700">{money(Math.abs(n))}</span>
        <span className="text-[11px] font-semibold text-rose-700">{t('manager:customersPage.balance.owes')}</span>
      </span>
    );
  }
  if (n > 0) {
    return (
      <span className="flex flex-col items-end leading-tight">
        <span className="font-semibold tabular-nums text-emerald-700">{money(n)}</span>
        <span className="text-[11px] font-semibold text-emerald-700">{t('manager:customersPage.balance.credit')}</span>
      </span>
    );
  }
  return <span className="tabular-nums text-slate-500">{money(0)}</span>;
}

// last_activity_at is a business-date string (YYYY-MM-DD): "today", "3 days ago", or a date.
function lastActivityLabel(c, t, locale) {
  if (!c.last_activity_at) return t('manager:customersPage.never');
  const [y, m, d] = c.last_activity_at.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - then) / 86400000);
  if (days <= 60) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
  const opts = { day: 'numeric', month: 'short', ...(y !== today.getFullYear() ? { year: 'numeric' } : {}) };
  return new Intl.DateTimeFormat(locale, opts).format(then);
}

function RowActions({ customer, canManage, onMessage, opening, onBook, onOpen, onEdit, onDelete, compact }) {
  const { t } = useTranslation(['manager']);
  const owes = Number(customer.balance) < 0;
  const items = [
    { key: 'open', label: t('manager:customersPage.actions.open') },
    { key: 'book', label: t('manager:customersPage.actions.book') },
    ...(canManage ? [
      { key: 'edit', label: t('manager:customersPage.actions.edit') },
      { type: 'divider' },
      { key: 'delete', danger: true, label: t('manager:customersPage.actions.delete') },
    ] : []),
  ];
  const onMenu = ({ key }) => {
    if (key === 'open') onOpen(customer);
    if (key === 'book') onBook(customer);
    if (key === 'edit') onEdit(customer);
    if (key === 'delete') onDelete(customer);
  };
  return (
    <div className="flex items-center justify-end gap-1.5">
      {owes && (
        <button type="button" onClick={() => onOpen(customer)} className={`${secondaryButtonClass} h-9 px-3 text-sm`}>
          {t('manager:customersPage.actions.collect')}
        </button>
      )}
      {!compact && !owes && (
        <button type="button" onClick={() => onBook(customer)} className={`${secondaryButtonClass} h-9 px-3 text-sm`}>
          {t('manager:customersPage.actions.book')}
        </button>
      )}
      <button
        type="button"
        onClick={() => onMessage(customer.id)}
        disabled={opening === customer.id}
        aria-label={t('manager:customersPage.actions.message', { name: customer.name || '' })}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] disabled:opacity-50"
      >
        <MessageIcon size={18} />
      </button>
      <Dropdown trigger={['click']} menu={{ items, onClick: onMenu }} placement="bottomRight">
        <button
          type="button"
          aria-label={t('manager:customersPage.actions.more', { name: customer.name || '' })}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </Dropdown>
    </div>
  );
}

function SortHead({ k, sort, onSort, children, align = 'left' }) {
  return (
    <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : ''}`} aria-sort={sort === k ? (['name', 'owes'].includes(k) ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 ${sort === k ? 'text-slate-900' : ''}`}>
        {children}
        {sort === k && <span aria-hidden="true">↓</span>}
      </button>
    </th>
  );
}

export default function CustomersList({ items, isDesktop, canManage, sort, onSort, ...actions }) {
  const { t, i18n } = useTranslation(['manager']);
  const { money } = useMoney('EUR');
  const locale = i18n?.language || 'en';

  if (!isDesktop) {
    return (
      <ul className="flex flex-col gap-2.5" data-testid="customers-list">
        {items.map((c) => (
          <li key={c.id} className={`${cardClass} flex flex-col gap-2.5 p-3.5`}>
            <div className="flex items-start gap-3">
              <PersonAvatar name={c.name} src={c.profile_image_url} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <button type="button" onClick={() => actions.onOpen(c)} className="truncate text-left text-[15px] font-semibold text-slate-900 hover:text-[#00687a]">
                  {c.name || c.email}
                </button>
                <SegmentBadges segments={c.segments} />
              </div>
              <Balance value={c.balance} money={money} />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
              <span className="min-w-0 truncate text-xs tabular-nums text-slate-600">
                {lastActivityLabel(c, t, locale)} · {t('manager:customersPage.spent', { amount: money(c.lifetime_spend || 0) })}
              </span>
              <RowActions customer={c} canManage={canManage} compact {...actions} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className={`${cardClass} overflow-hidden`} data-testid="customers-list">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <SortHead sort={sort} onSort={onSort} k="name">{t('manager:customersPage.col.customer')}</SortHead>
              <th className="px-3 py-2.5">{t('manager:customersPage.col.uses')}</th>
              <SortHead sort={sort} onSort={onSort} k="recent">{t('manager:customersPage.col.lastActivity')}</SortHead>
              <SortHead sort={sort} onSort={onSort} k="spend" align="right">{t('manager:customersPage.col.spend')}</SortHead>
              <SortHead sort={sort} onSort={onSort} k="owes" align="right">{t('manager:customersPage.col.balance')}</SortHead>
              <th className="px-4 py-2.5"><span className="sr-only">{t('manager:customersPage.col.actions')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={c.name} src={c.profile_image_url} size="sm" />
                    <div className="flex min-w-0 flex-col">
                      <button type="button" onClick={() => actions.onOpen(c)} className="truncate text-left font-semibold text-slate-900 hover:text-[#00687a]">
                        {c.name || c.email}
                      </button>
                      <span className="truncate text-xs text-slate-500">{c.email}{c.phone ? ` · ${c.phone}` : ''}</span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3"><SegmentBadges segments={c.segments} /></td>
                <td className="px-3 py-3 text-slate-700">{lastActivityLabel(c, t, locale)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{money(c.lifetime_spend || 0)}</td>
                <td className="px-3 py-3 text-right"><Balance value={c.balance} money={money} /></td>
                <td className="px-4 py-3"><RowActions customer={c} canManage={canManage} {...actions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
