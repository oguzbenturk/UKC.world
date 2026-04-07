import { useEffect, useCallback } from 'react';
import { App } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import realTimeService from '@/shared/services/realTimeService';

const STATUS_BADGE = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-sky-50 text-sky-700 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const fmtCurrency = (amount, currency = 'EUR') => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};

export default function PendingDepositsTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pending-deposits'] });
    queryClient.invalidateQueries({ queryKey: ['pending-deposits-count'] });
  }, [queryClient]);

  useEffect(() => {
    realTimeService.on('wallet:deposit_created', invalidate);
    return () => realTimeService.off('wallet:deposit_created', invalidate);
  }, [invalidate]);

  const { data: deposits = [], isLoading } = useQuery({
    queryKey: ['pending-deposits'],
    queryFn: async () => {
      const res = await apiClient.get('/wallet/admin/deposits?status=pending&method=bank_transfer&limit=100');
      return res.data?.results || [];
    },
    refetchInterval: 30000,
    staleTime: 0,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }) => {
      if (action === 'approve') {
        return apiClient.post(`/wallet/admin/deposits/${id}/approve`);
      }
      return apiClient.post(`/wallet/admin/deposits/${id}/reject`, { failureReason: 'Rejected by admin' });
    },
    onSuccess: (_, variables) => {
      message.success(`Deposit ${variables.action === 'approve' ? 'approved' : 'rejected'} successfully`);
      invalidate();
    },
    onError: (err) => {
      message.error(err?.response?.data?.error || 'Action failed');
    },
  });

  const handleAction = (id, action) => {
    const msg = action === 'approve'
      ? 'Approve this deposit? The amount will be added to the customer\'s wallet.'
      : 'Reject this deposit? No balance will be added.';
    if (!window.confirm(msg)) return;
    actionMutation.mutate({ id, action });
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Pending Bank Transfer Deposits</h3>
        {isLoading && <span className="text-sm text-slate-400">Loading...</span>}
      </div>

      {!isLoading && deposits.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No pending deposits</div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  <th className="text-left px-5 py-3 font-semibold">Customer</th>
                  <th className="text-right px-5 py-3 font-semibold">Amount</th>
                  <th className="text-left px-5 py-3 font-semibold">Notes</th>
                  <th className="text-left px-5 py-3 font-semibold">Receipt</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-right px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((dep, idx) => {
                  const badgeCls = STATUS_BADGE[dep.status] || STATUS_BADGE.pending;
                  return (
                    <tr key={dep.id} className={`border-b border-slate-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{fmtDate(dep.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-800">{dep.user?.name || dep.user?.email || '—'}</p>
                        {dep.user?.email && dep.user?.name && (
                          <p className="text-xs text-slate-400">{dep.user.email}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {fmtCurrency(dep.amount, dep.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 max-w-[200px] truncate">{dep.notes || '—'}</td>
                      <td className="px-5 py-3.5">
                        {dep.proofUrl ? (
                          <a
                            href={dep.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-sky-600 hover:text-sky-800 transition-colors"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeCls}`}>
                          {dep.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleAction(dep.id, 'approve')}
                            disabled={actionMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction(dep.id, 'reject')}
                            disabled={actionMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium border border-rose-200 hover:bg-rose-100 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
