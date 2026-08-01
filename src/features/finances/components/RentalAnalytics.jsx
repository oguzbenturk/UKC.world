import { useMemo } from 'react';
import { ExclamationCircleOutlined, CheckCircleFilled } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';

const MICRO_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400';

/**
 * Composition band: full-width segmented bar whose parts sum to a whole
 * (settled vs outstanding; net vs commission). Identity is carried by the
 * labeled legend chips underneath, never by color alone.
 */
const Band = ({ label, note, segments }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;
  const visible = segments.filter(s => s.value > 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className={MICRO_LABEL}>{label}</p>
        {note && <p className="text-xs font-medium text-slate-500 tabular-nums">{note}</p>}
      </div>
      <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
        {visible.map(s => (
          <div
            key={s.key}
            className="rounded-full transition-all duration-300"
            style={{ width: `${(s.value / total) * 100}%`, minWidth: 6, backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {visible.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
            <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(s.value)}</span>
            <span className="text-slate-400 tabular-nums">{((s.value / total) * 100).toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * RentalAnalytics — where the rental money stands: collection state and the
 * net/commission split of recognised revenue. All figures come from
 * /finances/summary (serviceType=rentals); nothing is derived client-side
 * beyond subtraction.
 */
const RentalAnalytics = ({ summaryData }) => {
  const metrics = useMemo(() => {
    if (!summaryData) return null;

    const revenue = summaryData.revenue || {};
    const rentalRevenue = Number(revenue.rental_revenue || 0);
    const rentalCount = Number(revenue.rental_count || 0);
    // Rental-SPECIFIC outstanding: net price of the counted rentals still marked
    // unpaid / pending_payment / failed (revenue.rental_outstanding, computed
    // server-side). Rentals are paid up-front like a service, so this is ~0 in practice.
    const outstanding = Number(revenue.rental_outstanding || 0);
    const collected = Math.max(rentalRevenue - outstanding, 0);
    const collectionRate = rentalRevenue > 0 ? (collected / rentalRevenue) * 100 : 100;
    const managerCommission = Number(summaryData.managerCommission?.total || 0);
    const commissionRate = rentalRevenue > 0 ? (managerCommission / rentalRevenue) * 100 : 0;
    const netRevenue = rentalRevenue - managerCommission;
    const netMargin = rentalRevenue > 0 ? (netRevenue / rentalRevenue) * 100 : 0;

    return { rentalRevenue, rentalCount, outstanding, collected, collectionRate, managerCommission, commissionRate, netRevenue, netMargin };
  }, [summaryData]);

  if (!metrics) {
    return <p className="py-8 text-center text-sm text-slate-400">No rental data available</p>;
  }

  if (metrics.rentalRevenue <= 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No rental revenue in this period</p>;
  }

  const rateChips = [
    { key: 'collection', label: 'Collection rate', value: `${metrics.collectionRate.toFixed(1)}%`, good: metrics.collectionRate >= 90 },
    { key: 'commission', label: 'Commission rate', value: `${metrics.commissionRate.toFixed(1)}%` },
    { key: 'margin', label: 'Net margin', value: `${metrics.netMargin.toFixed(1)}%` },
  ];

  return (
    <div className="space-y-6">
      {metrics.outstanding > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ExclamationCircleOutlined className="mt-0.5 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Outstanding rental balances</p>
            <p className="mt-0.5 text-xs text-amber-700">
              {formatCurrency(metrics.outstanding)} in rentals still marked unpaid. Consider following up with these customers.
            </p>
          </div>
        </div>
      )}

      <Band
        label="Collection"
        note={metrics.outstanding <= 0 ? (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <CheckCircleFilled /> All settled
          </span>
        ) : `${metrics.collectionRate.toFixed(1)}% collected`}
        segments={[
          { key: 'collected', label: 'Settled', value: metrics.collected, color: '#10b981' },
          { key: 'outstanding', label: 'Outstanding', value: metrics.outstanding, color: '#ef4444' },
        ]}
      />

      <Band
        label="Revenue split"
        note={`${metrics.rentalCount.toLocaleString()} rentals`}
        segments={[
          { key: 'net', label: 'Net revenue', value: metrics.netRevenue, color: '#f97316' },
          { key: 'commission', label: 'Manager commission', value: metrics.managerCommission, color: '#94a3b8' },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {rateChips.map(chip => (
          <div key={chip.key} className="rounded-2xl border border-slate-200/70 bg-slate-50/60 px-4 py-3">
            <p className={MICRO_LABEL}>{chip.label}</p>
            <p className={`mt-1.5 font-duotone-medium-condensed text-2xl leading-none tabular-nums ${
              chip.good === undefined ? 'text-slate-900' : chip.good ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {chip.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RentalAnalytics;
