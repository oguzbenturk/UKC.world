import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { formatCurrency } from '@/shared/utils/formatters';

const STATUS_BADGE = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function PayoutStatusBadge({ status }) {
  const { t } = useTranslation(['manager']);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[status] || STATUS_BADGE.cancelled}`}>
      {t(`manager:financePages.payoutRequests.status.${status}`, status)}
    </span>
  );
}

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

function InstructorCell({ row }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {row.instructorAvatar ? (
        <img src={row.instructorAvatar} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
      ) : (
        <span className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center flex-shrink-0">
          {initials(row.instructorName)}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate m-0">{row.instructorName || '—'}</p>
        {row.instructorEmail && <p className="text-xs text-slate-400 truncate m-0">{row.instructorEmail}</p>}
      </div>
    </div>
  );
}

/**
 * Plain Tailwind table of payout requests (DESIGN.md table pattern).
 * `mode="pending"` shows Pay / Decline actions, `mode="history"` shows the decision.
 */
export default function PayoutRequestsTable({ rows, mode = 'pending', onPay, onDecline, hideInstructor = false }) {
  const { t } = useTranslation(['manager']);
  const isPending = mode === 'pending';
  const methodLabel = (m) => (m ? t(`manager:financePages.payoutRequests.methods.${m}`, m) : t('manager:financePages.payoutRequests.methods.none'));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
            {!hideInstructor && <th className="text-left px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.instructor')}</th>}
            <th className="text-left px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.date')}</th>
            <th className="text-right px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.requested')}</th>
            {isPending && <th className="text-right px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.available')}</th>}
            <th className="text-left px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.method')}</th>
            <th className="text-left px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.note')}</th>
            {isPending ? (
              <th className="text-right px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.actions')}</th>
            ) : (
              <>
                <th className="text-left px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.status')}</th>
                <th className="text-left px-5 py-3 font-semibold">{t('manager:financePages.payoutRequests.columns.decision')}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const exceeds = isPending && row.available != null && Number(row.amount) > Number(row.available) + 0.005;
            return (
              <tr key={row.id} className={`border-b border-slate-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                {!hideInstructor && <td className="px-5 py-3.5"><InstructorCell row={row} /></td>}
                <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{row.createdAt ? dayjs(row.createdAt).format('DD MMM YYYY, HH:mm') : '—'}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(row.amount, row.currency)}</td>
                {isPending && (
                  <td className={`px-5 py-3.5 text-right whitespace-nowrap ${exceeds ? 'text-amber-600 font-medium' : 'text-slate-600'}`}>
                    {row.available == null ? '—' : formatCurrency(row.available, row.currency)}
                  </td>
                )}
                <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{methodLabel(row.preferredMethod)}</td>
                <td className="px-5 py-3.5 text-slate-600 max-w-xs"><span className="line-clamp-2">{row.note || '—'}</span></td>
                {isPending ? (
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex gap-2">
                      <button type="button" onClick={() => onPay?.(row)}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium shadow-sm hover:bg-sky-500 transition-colors">
                        {t('manager:financePages.payoutRequests.actions.pay')}
                      </button>
                      <button type="button" onClick={() => onDecline?.(row)}
                        className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors">
                        {t('manager:financePages.payoutRequests.actions.decline')}
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-5 py-3.5"><PayoutStatusBadge status={row.status} /></td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {row.status === 'paid' && row.paidAmount != null && (
                        <p className="m-0 text-slate-700">{t('manager:financePages.payoutRequests.paidAmount', { amount: formatCurrency(row.paidAmount, row.currency) })}</p>
                      )}
                      {row.adminNote && <p className="m-0">{row.adminNote}</p>}
                      {(row.decidedAt || row.decidedByName) && (
                        <p className="m-0 text-slate-400">
                          {row.decidedAt ? dayjs(row.decidedAt).format('DD MMM YYYY') : ''}
                          {row.decidedByName ? ` · ${t('manager:financePages.payoutRequests.decidedBy', { name: row.decidedByName })}` : ''}
                        </p>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
