import { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Space, Button, Tag, Grid, Spin } from 'antd';
import dayjs from 'dayjs';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

import RevenueAnalyticsDashboard from '../components/RevenueAnalyticsDashboard';
import FinanceOverviewCharts from '../components/FinanceOverviewCharts';
import InstructorFinanceView from '../components/InstructorFinanceView';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const QUICK_RANGES = [
  { key: 'today', label: 'Today', start: () => dayjs(), end: () => dayjs() },
  { key: 'thisWeek', label: 'This Week', start: () => dayjs().startOf('week'), end: () => dayjs().endOf('week') },
  { key: 'thisMonth', label: 'This Month', start: () => dayjs().startOf('month'), end: () => dayjs().endOf('month') },
  { key: 'thisYear', label: 'This Year', start: () => dayjs().startOf('year'), end: () => dayjs().endOf('year') },
  { key: 'allHistory', label: 'All History', start: () => dayjs('2020-01-01'), end: () => dayjs().endOf('year') }
];

const SERVICE_TYPES = [
  { key: 'all', label: 'All', color: 'blue' },
  { key: 'lessons', label: 'Lessons', color: 'green' },
  { key: 'rentals', label: 'Rentals', color: 'orange' },
  { key: 'membership', label: 'Membership', color: 'purple' },
  { key: 'shop', label: 'Shop', color: 'cyan' }
];

const accentStyles = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' }
};

function FinanceAdminView({ defaultFilter = 'all' }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('year').format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisYear');
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [serviceType, setServiceType] = useState(defaultFilter);
  const mode = 'accrual';

  // Fetch comprehensive overview data
  useEffect(() => {
    let mounted = true;
    setOverviewLoading(true);
    apiClient.get('/finances/overview', {
      params: { start_date: dateRange.startDate, end_date: dateRange.endDate }
    })
      .then(({ data }) => { if (mounted) setOverviewData(data); })
      .catch(() => {})
      .finally(() => { if (mounted) setOverviewLoading(false); });
    return () => { mounted = false; };
  }, [dateRange]);

  const handleDateRangeChange = (dates) => {
    if (dates && dates.length === 2) {
      setDateRange({
        startDate: dates[0].format('YYYY-MM-DD'),
        endDate: dates[1].format('YYYY-MM-DD')
      });
      setActiveQuickRange(null);
    } else {
      setDateRange({
        startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
        endDate: dayjs().endOf('year').format('YYYY-MM-DD')
      });
      setActiveQuickRange('thisYear');
    }
  };

  const handleMobileDateChange = (field, value) => {
    setDateRange((prev) => ({
      ...prev,
      [field]: value
    }));
    setActiveQuickRange(null);
  };

  const handleQuickRange = (rangeKey) => {
    const range = QUICK_RANGES.find(r => r.key === rangeKey);
    if (range) {
      setDateRange({
        startDate: range.start().format('YYYY-MM-DD'),
        endDate: range.end().format('YYYY-MM-DD')
      });
      setActiveQuickRange(rangeKey);
    }
  };

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
    const start = dayjs(dateRange.startDate).format('MMM D, YYYY');
    const end = dayjs(dateRange.endDate).format('MMM D, YYYY');
    return `${start} – ${end}`;
  }, [dateRange]);

  // Overview headline stats from the new comprehensive endpoint
  const overviewStats = useMemo(() => {
    const h = overviewData?.headline;
    if (!h) return null;
    const net = h.net ?? (h.totalIncome - h.totalCharges);
    return [
      {
        key: 'income',
        label: 'Total Income',
        sublabel: 'All credits to wallets',
        value: formatCurrency(h.totalIncome),
        raw: h.totalIncome,
        accent: 'emerald',
        icon: <ArrowUpOutlined className="text-emerald-500" />,
        helper: `${formatCurrency(h.totalDeposits)} in deposits`
      },
      {
        key: 'charges',
        label: 'Total Charges',
        sublabel: 'All debits from wallets',
        value: formatCurrency(h.totalCharges),
        raw: h.totalCharges,
        accent: 'rose',
        icon: <ArrowDownOutlined className="text-rose-500" />,
        helper: `${h.totalTransactions.toLocaleString()} transactions`
      },
      {
        key: 'net',
        label: 'Net Profit',
        sublabel: 'Charges − Refunds − Commission',
        value: formatCurrency(h.totalCharges - h.totalRefunds - h.instructorCommission),
        raw: h.totalCharges - h.totalRefunds - h.instructorCommission,
        accent: (h.totalCharges - h.totalRefunds - h.instructorCommission) >= 0 ? 'indigo' : 'rose',
        icon: null,
        helper: null
      },
      {
        key: 'refunds',
        label: 'Refunds Issued',
        sublabel: 'Money returned to customers',
        value: formatCurrency(h.totalRefunds),
        raw: h.totalRefunds,
        accent: 'amber',
        icon: null,
        helper: null
      },
      {
        key: 'commission',
        label: 'Instructor Commission',
        sublabel: 'Paid to instructors',
        value: formatCurrency(h.instructorCommission),
        raw: h.instructorCommission,
        accent: 'slate',
        icon: null,
        helper: null
      }
    ];
  }, [overviewData]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="m-0 text-2xl font-semibold text-slate-900">Finance Management - Overview</h1>
            </div>
            <p className="m-0 text-sm text-slate-500">All money in & out across every service · {rangeLabel}</p>
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
                value={[dayjs(dateRange.startDate), dayjs(dateRange.endDate)]}
                onChange={handleDateRangeChange}
                allowClear={false}
                className="rounded-xl border border-slate-200 px-2 py-1 shadow-sm"
                presets={QUICK_RANGES.map(r => ({
                  label: r.label,
                  value: [r.start(), r.end()]
                }))}
              />
            )}
          </Space>
        </div>

        {/* Quick range buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {QUICK_RANGES.map(r => (
            <Button
              key={r.key}
              size="small"
              type={activeQuickRange === r.key ? 'primary' : 'default'}
              className="rounded-full"
              onClick={() => handleQuickRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {/* Overview headline stats */}
        <Spin spinning={overviewLoading}>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(overviewStats || [
              { key: 'income',     label: 'Total Income',         sublabel: 'All credits to wallets',        value: '--', accent: 'emerald', icon: <ArrowUpOutlined />,   helper: null },
              { key: 'charges',    label: 'Total Charges',        sublabel: 'All debits from wallets',       value: '--', accent: 'rose',    icon: <ArrowDownOutlined />, helper: null },
              { key: 'net',        label: 'Net Profit',           sublabel: 'Charges − Refunds − Commission', value: '--', accent: 'indigo', icon: null, helper: null },
              { key: 'refunds',    label: 'Refunds Issued',       sublabel: 'Money returned to customers',  value: '--', accent: 'amber',   icon: null, helper: null },
              { key: 'commission', label: 'Instructor Commission', sublabel: 'Paid to instructors',          value: '--', accent: 'slate',   icon: null, helper: null }
            ]).map((stat) => {
              const accent = accentStyles[stat.accent] || accentStyles.slate;
              return (
                <div
                  key={stat.key}
                  className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur"
                >
                  <div className="flex items-center justify-between">
                    <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {stat.label}
                    </p>
                    {stat.icon}
                  </div>
                  {stat.sublabel && (
                    <p className="m-0 text-[10px] text-slate-400">{stat.sublabel}</p>
                  )}
                  <p className={`m-0 mt-3 text-2xl font-semibold ${accent.text}`}>
                    {stat.value}
                  </p>
                  {stat.helper && (
                    <p className="m-0 mt-1 text-xs text-slate-500">{stat.helper}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Spin>
      </Card>

      {/* Charts */}
      <Spin spinning={overviewLoading}>
        <FinanceOverviewCharts
          monthlyTrend={overviewData?.monthlyTrend || []}
          expenseBreakdown={overviewData?.expenseBreakdown || []}
        />
      </Spin>

      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Service filter:</span>
          {SERVICE_TYPES.map(s => (
            <Tag
              key={s.key}
              color={serviceType === s.key ? s.color : undefined}
              className="cursor-pointer select-none text-xs"
              onClick={() => setServiceType(s.key)}
            >
              {s.label}
            </Tag>
          ))}
        </div>
        <RevenueAnalyticsDashboard
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          mode={mode}
          serviceType={serviceType}
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

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 text-center shadow-sm">
        <div className="text-4xl mb-4">🔧</div>
        <h2 className="text-xl font-semibold text-amber-800 mb-2">Under Maintenance</h2>
        <p className="text-amber-700">
          The Finance Overview page is currently being updated. Please check back soon.
        </p>
      </Card>
    </div>
  );
}

export default Finance;
