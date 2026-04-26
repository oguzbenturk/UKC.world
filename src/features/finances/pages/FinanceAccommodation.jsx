import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, DatePicker, Space, Button, Tag, Grid } from 'antd';
import dayjs from 'dayjs';
import { HomeOutlined } from '@ant-design/icons';
import AccommodationBreakdownCharts from '../components/AccommodationBreakdownCharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const accentStyles = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' }
};

const FinanceAccommodation = () => {
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
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('year').format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisYear');
  const [summaryData, setSummaryData] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, bookingsRes] = await Promise.all([
        apiClient.get('/finances/summary', {
          params: { startDate: dateRange.startDate, endDate: dateRange.endDate, serviceType: 'accommodation', mode: 'accrual' }
        }),
        apiClient.get('/accommodation/bookings', {
          params: { startDate: dateRange.startDate, endDate: dateRange.endDate }
        })
      ]);
      setSummaryData(summaryRes.data);
      setBookings(bookingsRes.data || []);
    } catch {
      // silently handle
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

  const headlineStats = useMemo(() => {
    if (!summaryData && bookings.length === 0) {
      return [
        { key: 'revenue', label: t('manager:financePages.accommodation.stats.accommodationRevenue'), value: '--', accent: 'blue' },
        { key: 'bookings', label: t('manager:financePages.accommodation.stats.totalBookings'), value: '--', accent: 'indigo' },
        { key: 'nights', label: t('manager:financePages.accommodation.stats.totalNights'), value: '--', accent: 'emerald' },
        { key: 'avg', label: t('manager:financePages.accommodation.stats.avgRatePerNight'), value: '--', accent: 'slate' },
        { key: 'managerCommission', label: t('manager:financePages.accommodation.stats.managerCommission'), value: '--', accent: 'rose' }
      ];
    }

    const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
    const totalBookings = bookings.length;
    const totalNights = bookings.reduce((sum, b) => {
      if (!b.check_in_date || !b.check_out_date) return sum;
      const nights = dayjs(b.check_out_date).diff(dayjs(b.check_in_date), 'day');
      return sum + Math.max(0, nights);
    }, 0);
    const avgNightRate = totalNights > 0 ? totalRevenue / totalNights : 0;
    const managerCommission = Number(summaryData?.managerCommission?.total || 0);

    return [
      { key: 'revenue', label: t('manager:financePages.accommodation.stats.accommodationRevenue'), value: formatCurrency(totalRevenue), accent: 'blue' },
      { key: 'bookings', label: t('manager:financePages.accommodation.stats.totalBookings'), value: totalBookings.toLocaleString(), accent: 'indigo' },
      { key: 'nights', label: t('manager:financePages.accommodation.stats.totalNights'), value: totalNights.toLocaleString(), accent: 'emerald' },
      { key: 'avg', label: t('manager:financePages.accommodation.stats.avgRatePerNight'), value: formatCurrency(avgNightRate), accent: 'slate' },
      { key: 'managerCommission', label: t('manager:financePages.accommodation.stats.managerCommission'), value: formatCurrency(managerCommission), accent: 'rose' }
    ];
  }, [summaryData, bookings]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-blue-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <HomeOutlined style={{ fontSize: 24, color: '#3b82f6' }} />
              <h1 className="text-2xl font-semibold text-slate-900">{t('manager:financePages.accommodation.title')}</h1>
              <Tag color="blue" className="text-xs font-medium">{t('manager:financePages.accommodation.tag')}</Tag>
            </div>
            <p className="text-sm text-slate-500">{t('manager:financePages.accommodation.subtitle', { range: rangeLabel })}</p>
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
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-blue-500 focus:outline-none"
                    max={dateRange.endDate}
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => handleMobileDateChange('endDate', e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-blue-500 focus:outline-none"
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

      <AccommodationBreakdownCharts dateRange={dateRange} />
    </div>
  );
};

export default FinanceAccommodation;
