import { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Space, Button, Tag, Grid } from 'antd';
import dayjs from 'dayjs';
import MembershipAnalytics from '../components/MembershipAnalytics';
import MembershipBreakdownCharts from '../components/MembershipBreakdownCharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const accentStyles = {
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' }
};

// Quick date range presets
const getQuickRanges = () => ({
  today: {
    label: 'Today',
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  },
  thisWeek: {
    label: 'This Week',
    startDate: dayjs().startOf('week').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('week').format('YYYY-MM-DD')
  },
  thisMonth: {
    label: 'This Month',
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('month').format('YYYY-MM-DD')
  },
  thisYear: {
    label: 'This Year',
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('year').format('YYYY-MM-DD')
  },
  allHistory: {
    label: 'All History',
    startDate: '2020-01-01',
    endDate: dayjs().endOf('year').format('YYYY-MM-DD')
  }
});

/**
 * FinanceMembership - Finance view for membership revenue
 */
const FinanceMembership = () => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('month').format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisMonth');
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFinancialData();
  }, [dateRange]);

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/finances/summary', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          serviceType: 'membership',
          mode: 'accrual'
        }
      });
      setSummaryData(response.data);
    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange({
        startDate: dates[0].format('YYYY-MM-DD'),
        endDate: dates[1].format('YYYY-MM-DD')
      });
      setActiveQuickRange(null);
    }
  };

  const handleMobileDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
    setActiveQuickRange(null);
  };

  const handleQuickRange = (rangeKey) => {
    const ranges = getQuickRanges();
    const range = ranges[rangeKey];
    if (range) {
      setDateRange({
        startDate: range.startDate,
        endDate: range.endDate
      });
      setActiveQuickRange(rangeKey);
    }
  };

  const rangeLabel = useMemo(() => {
    const start = dayjs(dateRange.startDate);
    const end = dayjs(dateRange.endDate);
    return `${start.format('MMM D, YYYY')} – ${end.format('MMM D, YYYY')}`;
  }, [dateRange]);

  const headlineStats = useMemo(() => {
    if (!summaryData) {
      return [
        { key: 'revenue', label: 'Membership Revenue', value: '--', accent: 'purple' },
        { key: 'count', label: 'Total Purchases', value: '--', accent: 'emerald' },
        { key: 'avg', label: 'Avg Membership Value', value: '--', accent: 'slate' },
        { key: 'debt', label: 'Outstanding', value: '--', accent: 'amber' },
      ];
    }

    const revenue = summaryData.revenue || {};
    const balances = summaryData.balances || {};
    const membershipRevenue = Number(revenue.membership_revenue || 0);
    const membershipCount = Number(revenue.membership_count || 0);
    const debt = Number(balances.total_customer_debt || 0);
    const avgValue = membershipCount > 0 ? membershipRevenue / membershipCount : 0;

    return [
      { key: 'revenue', label: 'Membership Revenue', value: formatCurrency(membershipRevenue), accent: 'purple' },
      { key: 'count', label: 'Total Purchases', value: membershipCount.toLocaleString(), accent: 'emerald' },
      { key: 'avg', label: 'Avg Membership Value', value: formatCurrency(avgValue), accent: 'slate' },
      { key: 'debt', label: 'Outstanding', value: formatCurrency(debt), accent: debt > 0 ? 'amber' : 'slate' },
    ];
  }, [summaryData]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-purple-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">Membership Finance</h1>
              <Tag color="purple" className="text-xs font-medium">Membership</Tag>
            </div>
            <p className="text-sm text-slate-500">Membership Sales & Revenue · {rangeLabel}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(getQuickRanges()).map(([key, range]) => (
                <Button
                  key={key}
                  size="small"
                  type={activeQuickRange === key ? 'primary' : 'default'}
                  onClick={() => handleQuickRange(key)}
                  className={`rounded-lg ${activeQuickRange === key ? '' : 'border-slate-200 bg-white/70 hover:bg-slate-50'}`}
                >
                  {range.label}
                </Button>
              ))}
            </div>
            <Space wrap size="small" className="justify-start lg:justify-end">
              {isMobile ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => handleMobileDateChange('startDate', e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-purple-500 focus:outline-none"
                    max={dateRange.endDate}
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => handleMobileDateChange('endDate', e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-purple-500 focus:outline-none"
                    min={dateRange.startDate}
                  />
                </div>
              ) : (
                <RangePicker
                  size="middle"
                  value={[dayjs(dateRange.startDate), dayjs(dateRange.endDate)]}
                  onChange={handleDateRangeChange}
                  allowClear={false}
                  className="rounded-xl border border-slate-200 shadow-sm"
                />
              )}
            </Space>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Membership Revenue Analytics</h3>
        <MembershipAnalytics
          summaryData={summaryData}
          chartData={[]}
        />
      </Card>

      <MembershipBreakdownCharts dateRange={dateRange} />
    </div>
  );
};

export default FinanceMembership;
