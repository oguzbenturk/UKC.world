import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, DatePicker, Tag, Grid } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import RentalAnalytics from '../components/RentalAnalytics';
import RentalBreakdownCharts from '../components/RentalBreakdownCharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const FinanceRentals = () => {
  const { t } = useTranslation(['manager']);

  const getQuickRanges = () => ({
    today: { label: t('manager:finances.overview.quickRanges.today'), startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().format('YYYY-MM-DD') },
    thisWeek: { label: t('manager:finances.overview.quickRanges.thisWeek'), startDate: dayjs().startOf('week').format('YYYY-MM-DD'), endDate: dayjs().endOf('week').format('YYYY-MM-DD') },
    thisMonth: { label: t('manager:finances.overview.quickRanges.thisMonth'), startDate: dayjs().startOf('month').format('YYYY-MM-DD'), endDate: dayjs().endOf('month').format('YYYY-MM-DD') },
    thisYear: { label: t('manager:finances.overview.quickRanges.thisYear'), startDate: dayjs().startOf('year').format('YYYY-MM-DD'), endDate: dayjs().endOf('year').format('YYYY-MM-DD') },
    allHistory: { label: t('manager:finances.overview.quickRanges.allHistory'), startDate: '2020-01-01', endDate: dayjs().endOf('year').format('YYYY-MM-DD') }
  });
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('month').format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisMonth');
  const [summaryData, setSummaryData] = useState(null);
  const [breakdownData, setBreakdownData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    // Single fetch shared by the hero sparkline, analytics bands and the breakdown
    // charts. Independent catches: a breakdown failure must not blank the headline stats.
    const params = { startDate: dateRange.startDate, endDate: dateRange.endDate };
    try {
      await Promise.all([
        apiClient.get('/finances/summary', { params: { ...params, serviceType: 'rentals', mode: 'accrual' } })
          .then((response) => setSummaryData(response.data))
          .catch((error) => console.error('Error loading rental finance data:', error)),
        apiClient.get('/finances/rental-breakdown', { params })
          .then((response) => setBreakdownData(response.data))
          .catch((error) => console.error('Error loading rental breakdown data:', error)),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (dates) => {
    if (dates?.[0] && dates?.[1]) {
      setDateRange({ startDate: dates[0].format('YYYY-MM-DD'), endDate: dates[1].format('YYYY-MM-DD') });
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
      setDateRange({ startDate: range.startDate, endDate: range.endDate });
      setActiveQuickRange(rangeKey);
    }
  };

  const rangeLabel = useMemo(() => {
    const start = dayjs(dateRange.startDate);
    const end = dayjs(dateRange.endDate);
    return `${start.format('MMM D, YYYY')} – ${end.format('MMM D, YYYY')}`;
  }, [dateRange]);

  const trends = useMemo(() => breakdownData?.trends || [], [breakdownData]);

  // Revenue trend chip on the hero tile: latest month vs the month before it —
  // adjacent buckets, so long ranges don't produce absurd first-vs-last swings.
  // Single-bucket ranges (e.g. "Today") have no trend to speak of — chip hidden.
  const revenueTrend = useMemo(() => {
    if (trends.length < 2) return null;
    const prev = Number(trends[trends.length - 2]?.revenue) || 0;
    const last = Number(trends[trends.length - 1]?.revenue) || 0;
    if (prev <= 0) return last > 0 ? { direction: 'up', change: 100 } : null;
    const change = ((last - prev) / prev) * 100;
    return {
      direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
      change: Math.abs(change)
    };
  }, [trends]);

  const stats = useMemo(() => {
    if (!summaryData) return null;
    const revenue = summaryData.revenue || {};
    const rentalRevenue = Number(revenue.rental_revenue || 0);
    const rentalCount = Number(revenue.rental_count || 0);
    // Rental-SPECIFIC outstanding (net price of rentals still marked unpaid/pending_payment/
    // failed), not the old account-wide total_customer_debt which mixed in lesson/membership debt.
    const outstanding = Number(revenue.rental_outstanding || 0);
    const managerCommission = Number(summaryData.managerCommission?.total || 0);
    return {
      rentalRevenue,
      rentalCount,
      outstanding,
      managerCommission,
      avgValue: rentalCount > 0 ? rentalRevenue / rentalCount : 0,
      netRevenue: rentalRevenue - managerCommission,
    };
  }, [summaryData]);

  const microLabel = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400';
  const tileValue = 'font-duotone-medium-condensed text-[27px] leading-none text-slate-900 tabular-nums';
  const secondaryTiles = stats ? [
    { key: 'count', label: t('manager:financePages.rentals.stats.totalRentals'), value: stats.rentalCount.toLocaleString() },
    { key: 'avg', label: t('manager:financePages.rentals.stats.avgRentalValue'), value: formatCurrency(stats.avgValue) },
    { key: 'managerCommission', label: t('manager:financePages.rentals.stats.managerCommission'), value: formatCurrency(stats.managerCommission) },
    { key: 'net', label: t('manager:financePages.rentals.stats.netRentalRevenue'), value: formatCurrency(stats.netRevenue) },
    { key: 'debt', label: t('manager:financePages.rentals.stats.outstanding'), value: formatCurrency(stats.outstanding), tone: stats.outstanding > 0 ? 'alert' : 'ok' },
  ] : [
    { key: 'count', label: t('manager:financePages.rentals.stats.totalRentals'), value: '--' },
    { key: 'avg', label: t('manager:financePages.rentals.stats.avgRentalValue'), value: '--' },
    { key: 'managerCommission', label: t('manager:financePages.rentals.stats.managerCommission'), value: '--' },
    { key: 'net', label: t('manager:financePages.rentals.stats.netRentalRevenue'), value: '--' },
    { key: 'debt', label: t('manager:financePages.rentals.stats.outstanding'), value: '--' },
  ];

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 sm:p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-white shadow-sm" styles={{ body: { padding: isMobile ? 16 : 24 } }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="font-duotone-medium-condensed text-[26px] uppercase tracking-wide text-slate-900">
                {t('manager:financePages.rentals.title')}
              </h1>
              <Tag color="orange" className="rounded-full text-[11px] font-semibold uppercase tracking-wider">
                {t('manager:financePages.rentals.tag')}
              </Tag>
            </div>
            <p className="text-sm text-slate-500">{t('manager:financePages.rentals.subtitle', { range: rangeLabel })}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(getQuickRanges()).map(([key, range]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleQuickRange(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activeQuickRange === key
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <div className="flex justify-start lg:justify-end">
              {isMobile ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => handleMobileDateChange('startDate', e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-orange-500 focus:outline-none"
                    max={dateRange.endDate}
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => handleMobileDateChange('endDate', e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-orange-500 focus:outline-none"
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
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          {/* Featured revenue tile — real monthly sparkline behind the number */}
          <div className="relative overflow-hidden rounded-2xl border border-orange-200/60 bg-gradient-to-br from-orange-50/80 via-white to-white p-4 sm:col-span-2 xl:col-span-2">
            <div className="relative z-10">
              <p className={microLabel}>{t('manager:financePages.rentals.stats.rentalRevenue')}</p>
              <div className="mt-2 flex items-baseline gap-2.5">
                <p className="font-duotone-medium-condensed text-4xl leading-none text-slate-900 tabular-nums">
                  {stats ? formatCurrency(stats.rentalRevenue) : '--'}
                </p>
                {revenueTrend && revenueTrend.direction !== 'stable' && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    revenueTrend.direction === 'up' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {revenueTrend.direction === 'up' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    {revenueTrend.change.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            {trends.length > 1 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 opacity-80" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trends} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="rentalHeroSpark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="revenue" stroke="#ea580c" strokeWidth={1.5} fill="url(#rentalHeroSpark)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {secondaryTiles.map((stat) => (
            <div key={stat.key} className="rounded-2xl border border-slate-200/70 bg-white p-4">
              <p className={microLabel}>{stat.label}</p>
              <p className={`mt-2 ${tileValue} ${stat.tone === 'alert' ? 'text-amber-600' : ''}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl border border-slate-200/70 shadow-sm" styles={{ body: { padding: isMobile ? 16 : 24 } }}>
        <h3 className="mb-5 font-duotone-medium-condensed text-lg uppercase tracking-wide text-slate-900">
          {t('manager:financePages.rentals.analyticsTitle')}
        </h3>
        <RentalAnalytics summaryData={summaryData} />
      </Card>

      <RentalBreakdownCharts data={breakdownData} loading={loading} />
    </div>
  );
};

export default FinanceRentals;
