// Membership list: a table on desktop (with selection for bulk reminders),
// cards on mobile. Renew / Win back open the assign drawer prefilled.
import { useTranslation } from 'react-i18next';
import { Dropdown } from 'antd';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '@/features/instructor/earnings/components/earningsStyles';
import { useMoney } from '@/features/instructor/earnings/earningsFormat';
import { memberState } from '../../membersFormat';
import { MemberStatusChip, PersonAvatar, useTypeLabel } from './MemberParts';

const fmtDate = (iso, locale) => (iso ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso)) : '—');

function RowActions({ purchase, canManage, onRenew, onOpenCustomer, onEdit, onDiscount, onDelete, compact }) {
  const { t } = useTranslation(['admin']);
  const state = memberState(purchase);
  const renewLabel = state === 'expired' ? t('admin:membersPage.actions.winBack') : t('admin:membersPage.actions.renew');
  const showRenew = state !== 'cancelled' && state !== 'upcoming';
  const items = [
    { key: 'customer', label: t('admin:membersPage.actions.openCustomer') },
    { key: 'edit', label: t('admin:membersPage.actions.edit') },
    { key: 'discount', label: t('admin:membersPage.actions.discount') },
    ...(canManage ? [{ type: 'divider' }, { key: 'delete', danger: true, label: t('admin:membersPage.actions.delete') }] : []),
  ];
  const onMenu = ({ key }) => {
    if (key === 'customer') onOpenCustomer(purchase);
    if (key === 'edit') onEdit(purchase);
    if (key === 'discount') onDiscount(purchase);
    if (key === 'delete') onDelete(purchase);
  };
  return (
    <div className="flex items-center justify-end gap-1.5">
      {showRenew && (
        <button
          type="button"
          onClick={() => onRenew(purchase)}
          className={`${state === 'expired' ? secondaryButtonClass : primaryButtonClass} ${compact ? 'h-9 px-3' : 'h-9 px-3.5'} text-sm`}
        >
          {renewLabel}
        </button>
      )}
      <Dropdown trigger={['click']} menu={{ items, onClick: onMenu }} placement="bottomRight">
        <button
          type="button"
          aria-label={t('admin:membersPage.actions.more', { name: purchase.user_name || '' })}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </Dropdown>
    </div>
  );
}

function BoxCell({ purchase, shared }) {
  const { t } = useTranslation(['admin']);
  if (purchase.storage_unit == null) return <span className="text-slate-400">—</span>;
  const state = memberState(purchase);
  const isShared = shared.has(Number(purchase.storage_unit));
  return (
    <span className={`text-sm font-semibold tabular-nums ${state === 'expired' ? 'text-slate-500' : 'text-slate-900'}`}>
      #{purchase.storage_unit}
      {state === 'expired' && <span className="ml-1 text-xs font-medium text-slate-500">{t('admin:membersPage.boxFreed')}</span>}
      {isShared && state !== 'expired' && <span className="ml-1 text-xs font-medium text-amber-800">{t('admin:membersPage.boxShared')}</span>}
    </span>
  );
}

export default function MembersList({
  items, isDesktop, selected, onToggle, onToggleAll, canManage, shared, ...actions
}) {
  const { t, i18n } = useTranslation(['admin']);
  const { money } = useMoney('EUR');
  const typeLabel = useTypeLabel();
  const locale = i18n?.language || 'en';

  if (!isDesktop) {
    return (
      <ul className="flex flex-col gap-2.5" data-testid="members-list">
        {items.map((p) => (
          <li key={p.id} className={`${cardClass} flex flex-col gap-2.5 p-3.5`}>
            <div className="flex items-start gap-3">
              <PersonAvatar name={p.user_name} src={p.user_avatar} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <button type="button" onClick={() => actions.onOpenCustomer(p)} className="truncate text-left text-[15px] font-semibold text-slate-900 hover:text-[#00687a]">
                  {p.user_name || p.user_email}
                </button>
                <span className="truncate text-[13px] text-slate-600">
                  {typeLabel(p.offering_family, p.offering_duration)}
                  {p.storage_unit != null ? ` · #${p.storage_unit}` : ''}
                </span>
              </div>
              <MemberStatusChip purchase={p} />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
              <span className="text-xs tabular-nums text-slate-600">
                {fmtDate(p.purchased_at, locale)} → {fmtDate(p.expires_at, locale)} · {money(p.offering_price || 0)}
              </span>
              <RowActions purchase={p} canManage={canManage} compact {...actions} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const allSelected = items.length > 0 && items.every((p) => selected.has(p.id));
  return (
    <section className={`${cardClass} overflow-hidden`} data-testid="members-list">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(items)}
                  aria-label={t('admin:membersPage.selectAll')}
                  className="h-4 w-4 accent-[#00798c]"
                />
              </th>
              <th className="px-3 py-2.5">{t('admin:membersPage.col.member')}</th>
              <th className="min-w-[180px] px-3 py-2.5">{t('admin:membersPage.col.membership')}</th>
              <th className="px-3 py-2.5">{t('admin:membersPage.col.status')}</th>
              <th className="px-3 py-2.5">{t('admin:membersPage.col.period')}</th>
              <th className="px-3 py-2.5">{t('admin:membersPage.col.box')}</th>
              <th className="px-3 py-2.5 text-right">{t('admin:membersPage.col.paid')}</th>
              <th className="px-4 py-2.5"><span className="sr-only">{t('admin:membersPage.col.actions')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((p) => (
              <tr key={p.id} className={selected.has(p.id) ? 'bg-cyan-50/40' : 'hover:bg-slate-50'}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => onToggle(p.id)}
                    aria-label={t('admin:membersPage.selectOne', { name: p.user_name || '' })}
                    className="h-4 w-4 accent-[#00798c]"
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={p.user_name} src={p.user_avatar} size="sm" />
                    <div className="flex min-w-0 flex-col">
                      <button type="button" onClick={() => actions.onOpenCustomer(p)} className="truncate text-left font-semibold text-slate-900 hover:text-[#00687a]">
                        {p.user_name || p.user_email}
                      </button>
                      <span className="truncate text-xs text-slate-500">{p.user_email}</span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900">{p.offering_name || p.current_offering_name}</span>
                    <span className="text-xs text-slate-500">{typeLabel(p.offering_family, p.offering_duration)}</span>
                  </div>
                </td>
                <td className="px-3 py-3"><MemberStatusChip purchase={p} /></td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">{fmtDate(p.purchased_at, locale)} → {fmtDate(p.expires_at, locale)}</td>
                <td className="px-3 py-3"><BoxCell purchase={p} shared={shared} /></td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{money(p.offering_price || 0)}</td>
                <td className="px-4 py-3"><RowActions purchase={p} canManage={canManage} {...actions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
