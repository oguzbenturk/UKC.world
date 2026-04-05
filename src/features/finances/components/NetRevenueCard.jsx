// src/features/finances/components/NetRevenueCard.jsx
import { useMemo, useState, useEffect } from 'react';
import { Card, Tooltip, Select, Space, Grid } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';
import { sumExpenses } from '../utils/expenseCalculations';
import { buildNetData } from '../utils/netRevenue';

const buildBreakdown = (netData) => ([
  { key: 'commission', label: 'Commission', value: netData.commission },
  { key: 'tax', label: 'Tax', value: netData.tax },
  { key: 'insurance', label: 'Insurance', value: netData.insurance },
  { key: 'equipment', label: 'Equipment', value: netData.equipment },
  { key: 'paymentFee', label: 'Payment Fee', value: netData.paymentFee }
]);

const describeServiceGroup = (type) => {
  switch (type) {
    case 'all':
      return 'all services';
    case 'lesson':
      return 'lessons';
    case 'rental':
      return 'rentals';
    case 'accommodation':
      return 'accommodations';
    case 'shop':
      return 'shop sales';
    default:
      return type ? `${type} services` : 'services';
  }
};

const shortLabelForService = (type) => {
  switch (type) {
    case 'all':
      return 'All';
    case 'lesson':
      return 'Lessons';
    case 'rental':
      return 'Rentals';
    case 'accommodation':
      return 'Accomm.';
    case 'shop':
      return 'Shop';
    default:
      return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Other';
  }
};

const buildExpectedHelper = (ledger, completionCount, serviceType, serviceDescriptor, netData) => {
  if (ledger) {
    if (completionCount > 0) {
      const pluralLabel = serviceType === 'all' ? 'services' : serviceDescriptor;
      return `${completionCount} completed ${pluralLabel}`;
    }
    return serviceType === 'all'
      ? 'No completed services this range'
      : `No completed ${serviceDescriptor} this range`;
  }

  return netData.supported
    ? 'Accrual total from revenue snapshots'
    : 'Using collected totals until revenue snapshots run';
};

const resolveExpectedRevenue = (netData, revenueTotals, ledger, serviceType) => {
  if (ledger) {
    const expectedTotal = Number(ledger.expectedTotal || 0);
    const expectedByService = ledger.expectedByService || {};
    const ledgerValue = serviceType === 'all'
      ? expectedTotal
      : Number(expectedByService[serviceType] || 0);
    if (ledgerValue > 0) {
      return ledgerValue;
    }
  }

  const accrualTotal = Number(netData.gross || 0);
  if (netData.supported && accrualTotal > 0) {
    return accrualTotal;
  }
  return Number(revenueTotals.total_revenue || 0);
};

const buildMetricCards = (netData, revenueTotals, ledger, serviceType) => {
  const collectedPayments = Number(revenueTotals.total_revenue || 0);
  const refundTotal = Number(revenueTotals.total_refunds || 0);
  const transactionCount = Number(revenueTotals.total_transactions || 0);
  const expectedRevenue = resolveExpectedRevenue(netData, revenueTotals, ledger, serviceType);
  const serviceDescriptor = describeServiceGroup(serviceType);

  const completionCount = ledger
    ? (serviceType === 'all'
      ? Number(ledger.entryCount || 0)
      : Number(ledger.countsByService?.[serviceType] || 0))
    : 0;

  const expectedHelper = buildExpectedHelper(ledger, completionCount, serviceType, serviceDescriptor, netData);

  return [
    {
      key: 'expected',
      label: 'Expected revenue',
      value: formatCurrency(expectedRevenue),
      helper: expectedHelper,
    },
    {
      key: 'collected',
      label: 'Collected payments',
      value: formatCurrency(collectedPayments),
      helper: transactionCount ? `${transactionCount} payments received` : 'No payments recorded',
    },
    {
      key: 'refunds',
      label: 'Refunds issued',
      value: formatCurrency(refundTotal),
      helper: refundTotal ? 'Processed this range' : 'Nothing refunded',
    },
    {
      key: 'commission',
      label: 'Instructor commission',
      value: formatCurrency(netData.commission),
      helper: netData.commission > 0
        ? `${Number(netData.commissionRate || 0).toFixed(1)}% effective rate`
        : 'No commission captured',
    }
  ];
};

const computeTotalExpenses = (netData) => sumExpenses(netData);

/**
 * Props:
 * - summary: response from /api/finances/summary
 * - dateRange: { startDate, endDate }
 * - onModeChange?: (mode) => void
 */
function NetRevenueCard({ summary, dateRange, onModeChange, financialSettings }) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm; // treat < sm as mobile
  const [serviceType, setServiceType] = useState('all'); // all | lesson | rental | accommodation

  // Notify parent once on mount to enforce accrual mode (avoids repeated refetches on parent re-renders)
  useEffect(() => {
    if (onModeChange) onModeChange('accrual');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ledger = summary?.serviceLedger || null;
  const netData = useMemo(
    () => buildNetData(summary, ledger, financialSettings),
    [summary, ledger, financialSettings]
  );
  const breakdown = useMemo(() => buildBreakdown(netData), [netData]);
  const revenueTotals = useMemo(() => summary?.revenue || {}, [summary]);
  const metricCards = useMemo(
    () => buildMetricCards(netData, revenueTotals, ledger, serviceType),
    [netData, revenueTotals, ledger, serviceType]
  );
  const totalExpenses = useMemo(() => computeTotalExpenses(netData), [netData]);
  const lastUpdated = useMemo(() => {
    if (!summary?.generatedAt) return null;
    const parsed = new Date(summary.generatedAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleTimeString();
  }, [summary]);

  const selectOptions = useMemo(() => {
    const baseOptions = [
      { value: 'all', label: isMobile ? shortLabelForService('all') : 'All services' },
      { value: 'lesson', label: isMobile ? shortLabelForService('lesson') : 'Lessons' },
      { value: 'rental', label: isMobile ? shortLabelForService('rental') : 'Rentals' },
      { value: 'accommodation', label: isMobile ? shortLabelForService('accommodation') : 'Accommodations' }
    ];

    const seen = new Set(baseOptions.map((opt) => opt.value));
    if (ledger?.expectedByService) {
      Object.keys(ledger.expectedByService)
        .filter((key) => key && !seen.has(key))
        .forEach((key) => {
          seen.add(key);
          baseOptions.push({
            value: key,
            label: isMobile ? shortLabelForService(key) : describeServiceGroup(key)
          });
        });
    }

    return baseOptions;
  }, [ledger, isMobile]);

  useEffect(() => {
    const allowed = new Set(selectOptions.map((opt) => opt.value));
    if (!allowed.has(serviceType)) {
      setServiceType('all');
    }
  }, [selectOptions, serviceType]);

  return (
    <Card
      styles={{ header: { display: 'none' } }}
      className="rounded-3xl border border-slate-200/70"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900">Net Revenue Overview</span>
            <Tooltip
              title={
                <div>
                  {breakdown.map((b) => (
                    <div key={b.key} className="flex justify-between gap-8">
                      <span>{b.label}</span>
                      <strong>{formatCurrency(b.value)}</strong>
                    </div>
                  ))}
                </div>
              }
            >
              <InfoCircleOutlined />
            </Tooltip>
          </div>
          <p className="text-xs text-slate-500">Expected totals for every completed service in the selected range.</p>
        </div>
        <Space wrap size={isMobile ? 'small' : 'middle'}>
          <Select
            size={isMobile ? 'small' : 'middle'}
            value={serviceType}
            onChange={(v) => {
              setServiceType(v);
              if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('netRevenue:serviceType', { detail: { serviceType: v } }));
              }
            }}
            style={{ width: isMobile ? 160 : 200 }}
            popupMatchSelectWidth={false}
            options={selectOptions}
          />
        </Space>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {metricCards.map((card) => (
          <div
            key={card.key}
            className={`rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className={`mt-2 text-2xl font-semibold text-slate-900`}>{card.value}</p>
            <p className="mt-2 text-xs text-slate-500">{card.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total expenses</p>
          <p className="mt-2 text-xl font-semibold text-slate-800">{formatCurrency(totalExpenses)}</p>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            {breakdown.map((item) => (
              <div key={item.key} className="flex justify-between">
                <span>{item.label}</span>
                <span>{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net after expenses</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{formatCurrency(netData.net)}</p>
          {!netData.supported ? (
            <p className="mt-2 text-xs text-slate-500">Detailed breakdown requires revenue snapshots.</p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Net reflects expected payout after fees.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Date range: {dateRange?.startDate} — {dateRange?.endDate}</span>
        <span>
          {lastUpdated ? `Last updated ${lastUpdated}` : 'Awaiting latest snapshot'}
        </span>
      </div>
    </Card>
  );
}

export default NetRevenueCard;
