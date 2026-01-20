import { useState, useEffect, useMemo } from 'react';
import { Card, Tabs, DatePicker, Space, Button, Tag } from 'antd';
import moment from 'moment';
import { ReloadOutlined } from '@ant-design/icons';

import RevenueAnalyticsDashboard from '../components/RevenueAnalyticsDashboard';
import NetRevenueCard from '../components/NetRevenueCard';
import DailyOperationsPage from '../components/DailyOperationsPage.jsx';
import TransactionHistory from '../components/TransactionHistory';
import InstructorFinanceView from '../components/InstructorFinanceView';
import { useAuth } from '@/shared/hooks/useAuth';
import { useData } from '@/shared/hooks/useData';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;

const accentStyles = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' }
};

const EMPTY_HEADLINE_STATS = [
  { key: 'expected', label: 'Expected revenue', value: '--', accent: 'indigo', helper: null },
  { key: 'collected', label: 'Collected payments', value: '--', accent: 'emerald', helper: null },
  { key: 'net', label: 'Net revenue', value: '--', accent: 'slate', helper: null },
  { key: 'commission', label: 'Instructor commission', value: '--', accent: 'rose', helper: null },
  { key: 'refunds', label: 'Refunds', value: '--', accent: 'amber', helper: null }
];

const coerceNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
};

const pickNumber = (...values) => {
  for (const value of values) {
    const numeric = coerceNumber(value);
    if (numeric !== null) {
      return numeric;
    }
  }
  return 0;
};

const resolveLedger = (summary) => summary?.serviceLedger || null;

const resolveExpectedRevenue = (summary, ledger) => {
  const ledgerValue = coerceNumber(ledger?.expectedTotal) || 0;
  const snapshotGross = coerceNumber(summary?.netRevenue?.gross_total) || 0;
  const transactionalGross = coerceNumber(summary?.revenue?.total_revenue) || 0;
  return Math.max(ledgerValue, snapshotGross, transactionalGross);
};

const resolveCollectedPayments = (summary) => pickNumber(
  summary?.revenue?.total_revenue,
  summary?.netRevenue?.gross_total
);

const resolveRefundsAmount = (summary, ledger) => pickNumber(
  ledger?.statusBreakdown?.refunded?.amount,
  summary?.netRevenue?.refund_total,
  summary?.revenue?.total_refunds
);

const resolveCommissionAmount = (summary, ledger) => pickNumber(
  ledger?.commissionTotal,
  summary?.netRevenue?.commission_total
);

const resolveCommissionRate = (summary, ledger) => {
  const directRate = coerceNumber(ledger?.commissionRate);
  if (directRate !== null) {
    return directRate * 100;
  }
  const commission = pickNumber(
    summary?.netRevenue?.commission_total,
    0
  );
  const gross = pickNumber(
    summary?.netRevenue?.gross_total,
    summary?.revenue?.total_revenue
  );
  if (gross <= 0 || commission <= 0) {
    return 0;
  }
  return (commission / gross) * 100;
};

const resolveNetRevenue = (summary, collected, refunds, commission) => pickNumber(
  summary?.netRevenue?.net_total,
  collected - refunds - commission
);

const resolveCompletedCount = (ledger) => coerceNumber(ledger?.entryCount) || 0;

const resolveTransactionCount = (summary) => coerceNumber(summary?.revenue?.total_transactions) || 0;

const buildCompletedHelper = (count) => (
  count > 0 ? `${count} completed services` : 'No completed services'
);

const buildTransactionsHelper = (count) => (
  count > 0 ? `${count} payments received` : 'No payments recorded'
);

const buildRefundHelper = (amount) => (amount > 0 ? 'Includes issued refunds' : null);

const buildCommissionHelper = (amount, rate) => {
  if (amount <= 0) {
    return 'No commission captured this range';
  }
  return rate > 0 ? `${rate.toFixed(1)}% effective rate` : 'Commission recorded';
};

const buildHeadlineStats = (summary) => {
  if (!summary) {
    return EMPTY_HEADLINE_STATS;
  }

  const ledger = resolveLedger(summary);
  const expected = resolveExpectedRevenue(summary, ledger);
  const collected = resolveCollectedPayments(summary);
  const refunds = resolveRefundsAmount(summary, ledger);
  const commission = resolveCommissionAmount(summary, ledger);
  const commissionRate = resolveCommissionRate(summary, ledger);
  const net = resolveNetRevenue(summary, collected, refunds, commission);

  const completedCount = resolveCompletedCount(ledger);
  const transactionCount = resolveTransactionCount(summary);

  return [
    {
      key: 'expected',
      label: 'Expected revenue',
      value: formatCurrency(expected),
      accent: 'indigo',
      helper: buildCompletedHelper(completedCount)
    },
    {
      key: 'collected',
      label: 'Collected payments',
      value: formatCurrency(collected),
      accent: 'emerald',
      helper: buildTransactionsHelper(transactionCount)
    },
    {
      key: 'net',
      label: 'Net revenue',
      value: formatCurrency(net),
      accent: 'slate',
      helper: null
    },
    {
      key: 'commission',
      label: 'Instructor commission',
      value: formatCurrency(commission),
      accent: 'rose',
      helper: buildCommissionHelper(commission, commissionRate)
    },
    {
      key: 'refunds',
      label: 'Refunds',
      value: formatCurrency(refunds),
      accent: 'amber',
      helper: buildRefundHelper(refunds)
    }
  ];
};

function FinanceAdminView({ defaultFilter = 'all' }) {
  const [activeTab, setActiveTab] = useState('revenue');
  const [dateRange, setDateRange] = useState({
    startDate: moment().subtract(30, 'days').format('YYYY-MM-DD'),
    endDate: moment().format('YYYY-MM-DD')
  });
  const [summaryData, setSummaryData] = useState(null);
  const [serviceType, setServiceType] = useState(defaultFilter);
  const mode = 'accrual';
  const [isMobile, setIsMobile] = useState(false);
  const [financialSettings, setFinancialSettings] = useState(null);
  const {
    payments = [],
    loadPaymentsData,
    students = [],
    instructors = []
  } = useData();

  const customerDirectory = useMemo(() => {
    const map = new Map();
    const register = (person) => {
      if (!person || typeof person !== 'object') {
        return;
      }
      const id = person.id || person.user_id;
      if (!id) {
        return;
      }
      const label = person.name || person.fullName || person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
      if (label) {
        map.set(String(id), label);
      }
    };

    students.forEach(register);
    instructors.forEach(register);

    return map;
  }, [students, instructors]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    let mounted = true;
    apiClient.get('/finance-settings/active')
      .then(({ data }) => {
        if (mounted) {
          setFinancialSettings(data?.settings || null);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleDateRangeChange = (dates) => {
    if (dates && dates.length === 2) {
      setDateRange({
        startDate: dates[0].format('YYYY-MM-DD'),
        endDate: dates[1].format('YYYY-MM-DD')
      });
    } else {
      setDateRange({
        startDate: moment().subtract(30, 'days').format('YYYY-MM-DD'),
        endDate: moment().format('YYYY-MM-DD')
      });
    }
  };

  const handleMobileDateChange = (field, value) => {
    setDateRange((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  useEffect(() => {
    let mounted = true;
    import('../services/financialAnalytics').then(({ default: FinancialAnalyticsService }) => {
      FinancialAnalyticsService.getFinancialSummary(dateRange.startDate, dateRange.endDate, serviceType, mode)
        .then((data) => { if (mounted) setSummaryData(data); })
        .catch(() => {});
    });
    return () => { mounted = false; };
  }, [dateRange, serviceType, mode]);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.serviceType) {
        setServiceType(event.detail.serviceType);
      }
    };
    window.addEventListener('netRevenue:serviceType', handler);
    return () => window.removeEventListener('netRevenue:serviceType', handler);
  }, []);

  const rangeLabel = useMemo(() => {
    const start = dateRange?.startDate ? moment(dateRange.startDate).format('MMM D, YYYY') : null;
    const end = dateRange?.endDate ? moment(dateRange.endDate).format('MMM D, YYYY') : null;
    if (start && end) {
      return `${start} → ${end}`;
    }
    return 'Select a range';
  }, [dateRange?.startDate, dateRange?.endDate]);

  const pageTitle = useMemo(() => {
    const titles = {
      all: 'Finance Management - Overall',
      lessons: 'Finance Management - Lessons',
      rentals: 'Finance Management - Rentals',
      membership: 'Finance Management - Membership & Packages',
      shop: 'Finance Management - Shop Sales'
    };
    return titles[serviceType] || titles.all;
  }, [serviceType]);

  const filterDescription = useMemo(() => {
    const descriptions = {
      all: 'All Revenue Sources',
      lessons: 'Lesson & Booking Revenue',
      rentals: 'Equipment Rental Revenue',
      membership: 'VIP Memberships & Package Sales',
      shop: 'Product & Merchandise Sales'
    };
    return descriptions[serviceType] || descriptions.all;
  }, [serviceType]);

  const filterBadgeConfig = useMemo(() => {
    const configs = {
      all: { label: 'All', color: 'blue' },
      lessons: { label: 'Lessons', color: 'green' },
      rentals: { label: 'Rentals', color: 'orange' },
      membership: { label: 'Membership', color: 'purple' },
      shop: { label: 'Shop', color: 'cyan' }
    };
    return configs[serviceType] || configs.all;
  }, [serviceType]);

  const headlineStats = useMemo(() => buildHeadlineStats(summaryData), [summaryData]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{pageTitle}</h1>
              {serviceType !== 'all' && (
                <Tag color={filterBadgeConfig.color} className="text-xs font-medium">
                  {filterBadgeConfig.label}
                </Tag>
              )}
            </div>
            <p className="text-sm text-slate-500">{filterDescription} · {rangeLabel}</p>
          </div>
          <Space wrap size="small" className="justify-start lg:justify-end">
            {isMobile ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => handleMobileDateChange('startDate', e.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
                  max={dateRange.endDate}
                />
                <span className="text-xs text-slate-500">to</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => handleMobileDateChange('endDate', e.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
                  min={dateRange.startDate}
                />
              </div>
            ) : (
              <RangePicker
                size="middle"
                value={[moment(dateRange.startDate), moment(dateRange.endDate)]}
                onChange={handleDateRangeChange}
                allowClear={false}
                className="rounded-xl border border-slate-200 px-2 py-1 shadow-sm"
                presets={[
                  { label: 'Last 7 days', value: [moment().subtract(6, 'days'), moment()] },
                  { label: 'Last 30 days', value: [moment().subtract(29, 'days'), moment()] },
                  { label: 'This month', value: [moment().startOf('month'), moment().endOf('day')] }
                ]}
              />
            )}
          </Space>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {headlineStats.map((stat) => {
            const accent = accentStyles[stat.accent] || accentStyles.slate;
            return (
              <div
                key={stat.key}
                className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
                <p className={`mt-2 text-2xl font-semibold ${accent.text}`}>
                  {stat.value}
                </p>
                {stat.helper && (
                  <p className="mt-2 text-xs text-slate-500">
                    {stat.helper}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-6">
          <NetRevenueCard
            summary={summaryData}
            dateRange={dateRange}
            financialSettings={financialSettings}
          />
        </div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="large"
          className="finance-tabs"
          tabBarStyle={{ marginBottom: 24, overflowX: 'auto' }}
          items={[
            {
              key: 'revenue',
              label: 'Revenue Analytics',
              className: 'min-h-full',
              children: (
                <RevenueAnalyticsDashboard
                  dateRange={dateRange}
                  onDateRangeChange={handleDateRangeChange}
                  mode={mode}
                  serviceType={serviceType}
                />
              )
            },
            {
              key: 'dailyOps',
              label: 'Daily Operations',
              className: 'min-h-full',
              children: <DailyOperationsPage />
            },
            {
              key: 'transactions',
              label: 'Transactions',
              className: 'min-h-full',
              children: (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      size={isMobile ? 'small' : 'middle'}
                      icon={<ReloadOutlined />}
                      onClick={loadPaymentsData}
                    >
                      Refresh
                    </Button>
                  </div>
                  <TransactionHistory
                    transactions={Array.isArray(payments) ? payments : []}
                    customerDirectory={customerDirectory}
                  />
                </div>
              )
            }
          ]}
        />
      </Card>
    </div>
  );
}

function Finance({ defaultFilter = 'all' }) {
  const { user } = useAuth();
  const role = user?.role?.toLowerCase?.();

  const instructorProfile = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name || user.fullName || 'Instructor',
      email: user.email,
      phone: user.phone,
      status: user.status,
      created_at: user.created_at,
      avatar: user.avatar_url || user.avatar
    };
  }, [user]);

  if (role === 'instructor' && instructorProfile?.id) {
    return <InstructorFinanceView instructor={instructorProfile} />;
  }

  return <FinanceAdminView defaultFilter={defaultFilter} />;
}

export default Finance;
