import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PayoutRequestsTable from './PayoutRequestsTable';
import { PayPayoutModal, DeclinePayoutModal } from './PayoutActionModals';
import { usePayoutRequestList } from '../../hooks/usePayoutRequests';

/**
 * Pending payout requests of ONE instructor, for the admin instructor detail
 * drawer. Renders nothing when the instructor has no pending request.
 */
export default function InstructorPayoutRequestsPanel({ instructorId, onChanged }) {
  const { t } = useTranslation(['manager']);
  const { data: rows = [] } = usePayoutRequestList('pending', { enabled: !!instructorId });
  const [payTarget, setPayTarget] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const mine = useMemo(() => rows.filter((r) => String(r.instructorId) === String(instructorId)), [rows, instructorId]);

  if (!mine.length) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/60 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide m-0">{t('manager:financePages.payoutRequests.instructorPanel.pending')}</h3>
        <Link to="/finance/payout-requests" className="text-xs font-medium text-sky-600 hover:text-sky-800 transition-colors">
          {t('manager:financePages.payoutRequests.instructorPanel.viewAll')}
        </Link>
      </div>
      <PayoutRequestsTable rows={mine} mode="pending" hideInstructor onPay={setPayTarget} onDecline={setDeclineTarget} />
      <PayPayoutModal request={payTarget} open={!!payTarget} onClose={() => setPayTarget(null)} onDone={onChanged} />
      <DeclinePayoutModal request={declineTarget} open={!!declineTarget} onClose={() => setDeclineTarget(null)} onDone={onChanged} />
    </div>
  );
}
