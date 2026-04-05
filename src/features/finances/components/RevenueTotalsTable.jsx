// src/features/finances/components/RevenueTotalsTable.jsx
import { useEffect, useState } from 'react';
import { Card, Table } from 'antd';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import { formatCurrency } from '@/shared/utils/formatters';
import FinancialAnalyticsService from '../services/financialAnalytics';
import apiClient from '@/shared/services/apiClient';
import { ensureExpensesFromSettings } from '../utils/expenseCalculations';

const toNumber = (value) => Number(value ?? 0);

const SERVICE_LABELS = {
  lesson: 'Lessons',
  rental: 'Rentals',
  accommodation: 'Accommodation',
  shop: 'Shop',
  other: 'Other'
};

const describeService = (key) => {
  if (!key) {
    return SERVICE_LABELS.other;
  }
  return SERVICE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
};

// eslint-disable-next-line complexity
function RevenueTotalsTable({ dateRange, serviceType = 'all', financialSettings: externalSettings = null }) {
  const [summary, setSummary] = useState(null);
  const [financialSettings, setFinancialSettings] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Fetch both accrual and cash mode data, plus financial settings
        const [accrualData, cashData, settingsRes] = await Promise.all([
          FinancialAnalyticsService.getFinancialSummary(
            dateRange?.startDate,
            dateRange?.endDate,
            serviceType,
            'accrual'
          ),
          FinancialAnalyticsService.getFinancialSummary(
            dateRange?.startDate,
            dateRange?.endDate,
            serviceType,
            'cash'
          ).catch(() => null),
          externalSettings
            ? Promise.resolve({ data: { settings: externalSettings } })
            : apiClient.get('/finance-settings/active').catch(() => ({ data: { settings: null } }))
        ]);
        if (mounted) {
          setSummary({
            accrual: accrualData,
            cash: cashData,
            serviceLedger: accrualData?.serviceLedger || cashData?.serviceLedger || null
          });
          setFinancialSettings(settingsRes.data?.settings || null);
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [dateRange?.startDate, dateRange?.endDate, serviceType, externalSettings]);

  // Check if we have revenue snapshots (accrual mode data)
  const hasSnapshots = (summary?.accrual?.netRevenue?.items_count || 0) > 0 || (Number(summary?.accrual?.netRevenue?.gross_total || 0) > 0);
  const serviceLedger = summary?.serviceLedger || {};
  const ledgerExpectedTotal = toNumber(serviceLedger.expectedTotal);
  const snapshotGross = toNumber(summary?.accrual?.netRevenue?.gross_total);
  const transactionalGross = toNumber(summary?.accrual?.revenue?.total_revenue);
  let gross = Math.max(snapshotGross, ledgerExpectedTotal, transactionalGross);
  const ledgerCommission = toNumber(serviceLedger.commissionTotal);
  const ledgerCommissionRate = Number(serviceLedger.commissionRate || 0);
  const ledgerRefundTotal = toNumber(serviceLedger.refundedTotal);
  
  // Calculate expenses: use snapshots if available, otherwise use cash mode calculation or financial settings
  let commission, tax, insurance, equipment, paymentFee, net;
  
  if (hasSnapshots) {
    // Use actual snapshot data (accrual mode)
    commission = toNumber(summary?.accrual?.netRevenue?.commission_total);
    tax = toNumber(summary?.accrual?.netRevenue?.tax_total);
    insurance = toNumber(summary?.accrual?.netRevenue?.insurance_total);
    equipment = toNumber(summary?.accrual?.netRevenue?.equipment_total);
    paymentFee = toNumber(summary?.accrual?.netRevenue?.payment_fee_total);
    net = toNumber(summary?.accrual?.netRevenue?.net_total);
  } else if (summary?.cash?.netRevenue) {
    // Use cash mode calculation (has proper commission logic)
    commission = toNumber(summary?.cash?.netRevenue?.commission_total);
    tax = toNumber(summary?.cash?.netRevenue?.tax_total);
    insurance = toNumber(summary?.cash?.netRevenue?.insurance_total);
    equipment = toNumber(summary?.cash?.netRevenue?.equipment_total);
    paymentFee = toNumber(summary?.cash?.netRevenue?.payment_fee_total);
    net = toNumber(summary?.cash?.netRevenue?.net_total);
  } else if (financialSettings && gross > 0) {
    // Fallback: estimate using financial settings 
    // Note: Commission calculation requires actual transaction data for accuracy
    const taxRate = (financialSettings.tax_rate_pct || 0) / 100;
    const insuranceRate = (financialSettings.insurance_rate_pct || 0) / 100;
    const equipmentRate = (financialSettings.equipment_rate_pct || 0) / 100;
    
    // Commission requires instructor earnings data which is not available in financial settings
    commission = 0; // Cannot estimate without transaction-level instructor earnings
    tax = gross * taxRate;
    insurance = gross * insuranceRate;
    equipment = gross * equipmentRate;
    const fees = financialSettings.payment_method_fees || {};
    const feeEntry = Object.entries(fees)
      .filter(([, cfg]) => cfg && (cfg.active === undefined || cfg.active))
      .map(([, cfg]) => ({ pct: Number(cfg.pct ?? cfg.percentage ?? 0), fixed: Number(cfg.fixed ?? 0) }))[0] || { pct: 0, fixed: 0 };
    const transactionCount = Number(summary?.accrual?.revenue?.total_transactions || 0);
    paymentFee = gross * (feeEntry.pct / 100) + transactionCount * feeEntry.fixed;
    net = gross - commission - tax - insurance - equipment - paymentFee;
  } else {
    // No data available - fallback to basic calculation
    commission = 0;
    tax = 0;
    insurance = 0;
    equipment = 0;
    paymentFee = 0;
    net = (summary?.accrual?.revenue?.total_revenue || 0) - (summary?.accrual?.revenue?.total_refunds || 0);
  }

  const resolvedSettings = externalSettings || financialSettings;
  if (!commission && ledgerCommission) {
    commission = ledgerCommission;
  }

  const baseCommissionRate = gross > 0 && commission > 0
    ? (commission / gross) * 100
    : (ledgerCommissionRate || 0) * 100;

  const revenueTotals = summary?.accrual?.revenue || summary?.cash?.revenue || {};
  const adjustedNetData = ensureExpensesFromSettings({
    supported: hasSnapshots,
    gross,
    net,
    commission,
    tax,
    insurance,
    equipment,
    paymentFee,
    commissionRate: baseCommissionRate
  }, {
    financialSettings: resolvedSettings,
    revenueTotals,
    refundTotal: toNumber(revenueTotals.total_refunds)
  });

  gross = toNumber(adjustedNetData?.gross ?? gross);
  commission = toNumber(adjustedNetData?.commission ?? commission);
  tax = toNumber(adjustedNetData?.tax ?? tax);
  insurance = toNumber(adjustedNetData?.insurance ?? insurance);
  equipment = toNumber(adjustedNetData?.equipment ?? equipment);
  paymentFee = toNumber(adjustedNetData?.paymentFee ?? paymentFee);
  net = toNumber(adjustedNetData?.net ?? net);

  const effectiveCommissionRate = adjustedNetData?.commissionRate ?? baseCommissionRate;

  const rows = (summary?.accrual?.netRevenue || summary?.accrual?.revenue || summary?.cash?.netRevenue)
    ? [
        { key: 'gross', label: 'Income', value: formatCurrency(gross) },
        { 
          key: 'commission', 
          label: summary?.cash?.netRevenue?.instructor_earnings_method === 'actual_earnings' 
            ? 'Instructor Earnings (Actual)' 
            : 'Commission', 
          value: `${formatCurrency(commission)}${effectiveCommissionRate > 0 ? ` (${effectiveCommissionRate.toFixed(1)}%)` : ''}` 
        },
        { key: 'tax', label: 'Tax', value: formatCurrency(tax) },
        { key: 'insurance', label: 'Insurance', value: formatCurrency(insurance) },
        { key: 'equipment', label: 'Equipment', value: formatCurrency(equipment) },
        { key: 'paymentFee', label: 'Payment Fee', value: formatCurrency(paymentFee) },
        { key: 'net', label: 'Net', value: formatCurrency(net) }
      ]
    : [];

  const expectedByService = serviceLedger.expectedByService || {};
  const commissionByService = serviceLedger.commissionByService || {};
  const countsByService = serviceLedger.countsByService || {};

  const baseServiceOrder = ['lesson', 'rental', 'accommodation'];
  const dynamicServiceKeys = new Set([
    ...Object.keys(expectedByService || {}),
    ...Object.keys(commissionByService || {}),
    ...Object.keys(countsByService || {})
  ]);
  baseServiceOrder.forEach((key) => dynamicServiceKeys.add(key));

  const orderedServiceKeys = Array.from(dynamicServiceKeys).filter(Boolean);

  const ledgerExpectedPairs = orderedServiceKeys.map((service) => [
    service,
    toNumber(expectedByService[service])
  ]);
  const ledgerServicePairs = orderedServiceKeys
    .filter((service) => commissionByService[service] !== undefined)
    .map((service) => [service, toNumber(commissionByService[service])]);
  const ledgerCountPairs = orderedServiceKeys
    .filter((service) => countsByService[service] !== undefined)
    .map((service) => [service, countsByService[service]]);
  const serviceBreakdownData = orderedServiceKeys.map((service) => {
    const expectedAmount = toNumber(expectedByService[service]);
    const commissionAmount = toNumber(commissionByService[service]);
    const completedCount = countsByService[service] ?? 0;
    const effectiveRate = expectedAmount > 0 && commissionAmount > 0
      ? `${((commissionAmount / expectedAmount) * 100).toFixed(1)}%`
      : commissionAmount > 0
        ? '—'
        : '0%';

    return {
      key: service || 'other',
      service: describeService(service),
      expectedAmount,
      commissionAmount,
      expected: formatCurrency(expectedAmount),
      commission: formatCurrency(commissionAmount),
      rate: effectiveRate,
      count: completedCount
    };
  }).filter((row) => row.expectedAmount > 0 || row.commissionAmount > 0 || row.count > 0);
  const effectiveRateLabel = ledgerCommission > 0
    ? `${(ledgerCommissionRate * 100).toFixed(1)}%`
    : '0%';

  return (
    <Card title="Total Revenues">
      <UnifiedTable density="compact">
        <Table
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[{ title: 'Item', dataIndex: 'label' }, { title: 'Amount', dataIndex: 'value' }]}
        />
      </UnifiedTable>
      {serviceBreakdownData.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Service breakdown</p>
          <UnifiedTable density="comfortable">
            <Table
              size="small"
              pagination={false}
              dataSource={serviceBreakdownData}
              columns={[
                { title: 'Service', dataIndex: 'service' },
                { title: 'Expected', dataIndex: 'expected' },
                { title: 'Commission', dataIndex: 'commission' },
                { title: 'Rate', dataIndex: 'rate' },
                { title: 'Completed', dataIndex: 'count' }
              ]}
            />
          </UnifiedTable>
        </div>
      )}
      {(ledgerCommission > 0 || (serviceLedger.entryCount || 0) > 0) && (
        <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ledger verification</p>
              <p className="text-sm text-slate-600">Commission {formatCurrency(ledgerCommission)} · {effectiveRateLabel}</p>
            </div>
            <div className="text-xs text-slate-500">
              <span>Completed entries: {serviceLedger.entryCount || 0}</span>
              {ledgerRefundTotal > 0 && (
                <span className="ml-3">Refunded: {formatCurrency(ledgerRefundTotal)}</span>
              )}
            </div>
          </div>
          {(ledgerExpectedPairs.length > 0 || ledgerServicePairs.length > 0 || ledgerCountPairs.length > 0) && (
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {ledgerExpectedPairs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expected revenue</p>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {ledgerExpectedPairs.map(([service, amount]) => (
                      <div key={`expected-${service}`} className="flex justify-between">
                        <span>{describeService(service)}</span>
                        <span>{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ledgerServicePairs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Commission by service</p>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {ledgerServicePairs.map(([service, amount]) => (
                      <div key={`commission-${service}`} className="flex justify-between">
                        <span>{describeService(service)}</span>
                        <span>{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ledgerCountPairs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed services</p>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {ledgerCountPairs.map(([service, count]) => (
                      <div key={`count-${service}`} className="flex justify-between">
                        <span>{describeService(service)}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default RevenueTotalsTable;
