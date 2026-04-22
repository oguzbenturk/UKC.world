import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, DatePicker, Space, Button, Tag, Grid } from 'antd';
import dayjs from 'dayjs';
import { BankOutlined } from '@ant-design/icons';
import WalletDepositCharts from '../components/WalletDepositCharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const accentStyles = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' }
};

export default function WalletDepositsAdmin() {
  const { t } = useTranslation(['manager']);
  const screens = useBreakpoint();

  const getQuickRanges = () => ({
    thisWeek: {
      label: t('manager:finances.overview.quickRanges.thisWeek'),
      startDate: dayjs().startOf('week').format('YYYY-MM-DD'),
      endDate: dayjs().endOf('week').format('YYYY-MM-DD')
    },
    thisMonth: {
      label: t('manager:finances.overview.quickRanges.thisMonth'),
      startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
      endDate: dayjs().endOf('month').format('YYYY-MM-DD')
    },
    thisYear: {
      label: t('manager:finances.overview.quickRanges.thisYear'),
      startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
      endDate: dayjs().endOf('year').format('YYYY-MM-DD')
    },
    allHistory: {
      label: t('manager:finances.overview.quickRanges.allHistory'),
      startDate: '2020-01-01',
      endDate: dayjs().endOf('year').format('YYYY-MM-DD')
    }
  });
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('year').format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisYear');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/finances/wallet-deposits', {
        params: { startDate: dateRange.startDate, endDate: dateRange.endDate, limit: 1 }
      });
      setStats(res.data.stats);
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
    if (!stats) {
      return [
        { key: 'total', label: t('manager:financePages.walletDeposits.stats.totalDeposited'), value: '--', accent: 'indigo' },
        { key: 'count', label: t('manager:financePages.walletDeposits.stats.depositCount'), value: '--', accent: 'blue' },
        { key: 'users', label: t('manager:financePages.walletDeposits.stats.uniqueStudents'), value: '--', accent: 'emerald' },
        { key: 'avg', label: t('manager:financePages.walletDeposits.stats.avgDeposit'), value: '--', accent: 'slate' }
      ];
    }

    return [
      { key: 'total', label: t('manager:financePages.walletDeposits.stats.totalDeposited'), value: formatCurrency(stats.totalAmount), accent: 'indigo' },
      { key: 'count', label: t('manager:financePages.walletDeposits.stats.depositCount'), value: stats.totalCount.toLocaleString(), accent: 'blue' },
      { key: 'users', label: t('manager:financePages.walletDeposits.stats.uniqueStudents'), value: stats.uniqueUsers.toLocaleString(), accent: 'emerald' },
      { key: 'avg', label: t('manager:financePages.walletDeposits.stats.avgDeposit'), value: formatCurrency(stats.avgAmount), accent: 'slate' }
    ];
  }, [stats, t]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-3 sm:p-6">
      <Card className="rounded-2xl sm:rounded-3xl border border-slate-200/70 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BankOutlined style={{ fontSize: 24, color: '#6366f1' }} />
              <h1 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-semibold text-slate-900 m-0`}>{t('manager:financePages.walletDeposits.title')}</h1>
              <Tag color="purple" className="text-xs font-medium">{t('manager:financePages.walletDeposits.tag')}</Tag>
            </div>
            <p className="text-sm text-slate-500 m-0">{t('manager:financePages.walletDeposits.subtitle', { range: rangeLabel })}</p>
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {headlineStats.map((stat) => {
            const accent = accentStyles[stat.accent] || accentStyles.slate;
            return (
              <div
                key={stat.key}
                className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 m-0">
                  {stat.label}
                </p>
                <p className={`mt-2 text-2xl font-semibold m-0 ${accent.text}`}>
                  {stat.value}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      <WalletDepositCharts dateRange={dateRange} />
    </div>
  );
}