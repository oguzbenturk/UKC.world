// "Renewals due this week" — active memberships ending within 7 days (stats endpoint).
import { useTranslation } from 'react-i18next';
import { cardClass, secondaryButtonClass } from '@/features/instructor/earnings/components/earningsStyles';
import { EmptyState, SectionTitle } from '@/features/instructor/earnings/components/ui';
import { SendIcon } from '@/features/instructor/earnings/components/EarningsIcons';
import { daysUntil } from '../../membersFormat';
import { PersonAvatar } from './MemberParts';

export default function RenewalsDue({ renewals = [], sending, onRemind, onOpen }) {
  const { t } = useTranslation(['admin']);
  const whenLabel = (iso) => {
    const left = daysUntil(iso);
    if (left == null) return '';
    if (left <= 0) return t('admin:membersPage.state.endsToday');
    if (left === 1) return t('admin:membersPage.state.endsTomorrow');
    return t('admin:membersPage.state.daysLeft', { count: left });
  };
  return (
    <section className={`${cardClass} flex flex-col gap-3 p-4`} data-testid="renewals-due">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{t('admin:membersPage.renewals.title')}</SectionTitle>
        {renewals.length > 1 && (
          <button
            type="button"
            disabled={sending}
            onClick={() => onRemind(renewals.map((r) => r.id))}
            className={`${secondaryButtonClass} h-9 px-3 text-sm`}
          >
            <SendIcon size={15} />
            {t('admin:membersPage.renewals.remindAll', { count: renewals.length })}
          </button>
        )}
      </div>
      {renewals.length === 0 ? (
        <EmptyState title={t('admin:membersPage.renewals.empty')} className="py-4" />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {renewals.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <PersonAvatar name={r.userName} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <button type="button" onClick={() => onOpen?.(r)} className="truncate text-left text-sm font-semibold text-slate-900 hover:text-[#00687a]">
                  {r.userName}
                </button>
                <span className="truncate text-xs text-slate-600">
                  {r.offeringName}{r.storageUnit != null ? ` · #${r.storageUnit}` : ''} · {whenLabel(r.expiresAt)}
                </span>
              </div>
              <button
                type="button"
                disabled={sending}
                onClick={() => onRemind([r.id])}
                aria-label={t('admin:membersPage.renewals.remindOne', { name: r.userName })}
                className={`${secondaryButtonClass} h-9 shrink-0 px-3 text-sm`}
              >
                {t('admin:membersPage.renewals.remind')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
