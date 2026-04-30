// src/features/manager/pages/finance/ManagerFinanceOverview.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spin, Tag, Select } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  DollarOutlined, RiseOutlined, FallOutlined, ClockCircleOutlined,
  RocketOutlined, BankOutlined, BarChartOutlined,
  WalletOutlined, SettingOutlined,
} from '@ant-design/icons';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  getManagerDashboard,
  getManagerCommissionHistory,
  getManagerUpcomingIncome,
} from '../../services/managerCommissionApi';
import StatBox from '../../components/finance/StatBox';
import { formatCurrency } from '@/shared/utils/formatters';
import dayjs from 'dayjs';

const PERIOD_OPTIONS = [
  { value: 'current_month', key: 'currentMonth' },
  { value: 'last_month', key: 'lastMonth' },
  { value: 'current_year', key: 'currentYear' },
];

function ManagerFinanceOverview() {
  const { t } = useTranslation(['manager']);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [paidHistory, setPaidHistory] = useState([]);
  const [period, setPeriod] = useState('current_month');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, upcomingRes, paidRes] = await Promise.all([
        getManagerDashboard(period),
        getManagerUpcomingIncome().catch(() => ({ success: false })),
        getManagerCommissionHistory({ status: 'paid', limit: 100 }).catch(() => ({ success: false })),
      ]);
      if (dashRes?.success) setDashboard(dashRes.data);
      if (upcomingRes?.success) setUpcoming(upcomingRes.data);
      if (paidRes?.success) setPaidHistory(paidRes.data || []);
    } catch (error) {
      message.error(error.message || t('manager:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const trendData = useMemo(() => {
    // Bucket paid commissions into months for the simple line chart
    if (!paidHistory.length) return [];
    const buckets = {};
    for (const row of paidHistory) {
      const dateStr = row.source_date || row.booking_date || row.created_at;
      if (!dateStr) continue;
      const d = dayjs(dateStr);
      if (!d.isValid()) continue;
      const key = d.format('YYYY-MM');
      if (!buckets[key]) {
        buckets[key] = { key, label: d.format('MMM YY'), total: 0 };
      }
      buckets[key].total += parseFloat(row.commission_amount || 0);
    }
    return Object.values(buckets)
      .sort((a, b) => (a.key > b.key ? 1 : -1))
      .slice(-6);
  }, [paidHistory]);

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px]"><Spin size="large" /></div>;
  }

  const { currentPeriod, previousPeriod, yearToDate, comparison } = dashboard || {};
  const changePercent = parseFloat(comparison?.earningsChangePercent) || 0;
  const isUp = changePercent >= 0;
  const totalProjected = upcoming?.totalProjected ?? 0;
  const totalPayoutsReceived = paidHistory.reduce(
    (sum, r) => sum + parseFloat(r.commission_amount || 0),
    0,
  );

  const quickLinks = [
    { to: '/manager/finance/earnings', icon: <WalletOutlined />, key: 'earnings', color: 'green' },
    { to: '/manager/finance/upcoming', icon: <RocketOutlined />, key: 'upcoming', color: 'sky' },
    { to: '/manager/finance/payouts', icon: <BankOutlined />, key: 'payouts', color: 'indigo' },
    { to: '/manager/finance/settings', icon: <SettingOutlined />, key: 'settings', color: 'slate' },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-700">{t('manager:finance.overview.subtitle')}</h2>
          <p className="text-sm text-slate-400">{t('manager:finance.overview.description')}</p>
        </div>
        <Select
          value={period}
          onChange={setPeriod}
          style={{ width: 180 }}
          size="middle"
        >
          {PERIOD_OPTIONS.map(o => (
            <Select.Option key={o.value} value={o.value}>
              {t(`manager:finance.overview.periods.${o.key}`)}
            </Select.Option>
          ))}
        </Select>
      </div>

      {/* 6 stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatBox
          label={t('manager:finance.overview.stats.thisMonthEarned')}
          value={formatCurrency(currentPeriod?.totalEarned || 0, 'EUR')}
          sub={t('manager:dashboard.stats.bookingsRentals', { bookings: currentPeriod?.breakdown?.bookings?.count || 0, rentals: currentPeriod?.breakdown?.rentals?.count || 0 })}
          color="text-green-600"
          border="border-green-100"
          icon={<DollarOutlined className="text-green-500" />}
        />
        <StatBox
          label={t('manager:finance.overview.stats.pendingPayout')}
          value={formatCurrency(currentPeriod?.pending?.amount || 0, 'EUR')}
          sub={t('manager:dashboard.stats.transactions', { count: currentPeriod?.pending?.count || 0 })}
          color="text-amber-600"
          border="border-amber-100"
          icon={<ClockCircleOutlined className="text-amber-500" />}
        />
        <StatBox
          label={t('manager:finance.overview.stats.projectedUpcoming')}
          value={formatCurrency(totalProjected, 'EUR')}
          sub={t('manager:finance.overview.stats.projectedSub', { count: upcoming?.items?.length || 0 })}
          color="text-sky-600"
          border="border-sky-100"
          icon={<RocketOutlined className="text-sky-500" />}
        />
        <StatBox
          label={t('manager:finance.overview.stats.ytd')}
          value={formatCurrency(yearToDate?.totalEarned || 0, 'EUR')}
          sub={`${t('manager:detailPanel.profile.paid')}: ${formatCurrency(yearToDate?.paid?.amount || 0, 'EUR')}`}
          color="text-blue-600"
          border="border-blue-100"
          icon={<BarChartOutlined className="text-blue-500" />}
        />
        <div className={`rounded-xl border ${isUp ? 'border-green-100' : 'border-red-100'} bg-white p-4 min-w-0`}>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            {isUp ? <RiseOutlined className="text-green-500" /> : <FallOutlined className="text-red-500" />}
            {t('manager:finance.overview.stats.vsLastMonth')}
          </div>
          <div className={`text-xl font-bold flex items-center gap-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
            {isUp ? '+' : ''}{changePercent.toFixed(1)}%
          </div>
          <div className="text-[11px] text-gray-400 mt-1 truncate">
            {t('manager:dashboard.stats.prevMonth', { amount: formatCurrency(previousPeriod?.totalEarned || 0, 'EUR') })}
          </div>
        </div>
        <StatBox
          label={t('manager:finance.overview.stats.totalPayoutsReceived')}
          value={formatCurrency(totalPayoutsReceived, 'EUR')}
          sub={t('manager:finance.overview.stats.payoutsSub', { count: paidHistory.length })}
          color="text-indigo-600"
          border="border-indigo-100"
          icon={<BankOutlined className="text-indigo-500" />}
        />
      </div>

      {/* Trend chart */}
      <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/30 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('manager:finance.overview.trend.label')}</p>
            <h3 className="text-base font-semibold text-slate-900">{t('manager:finance.overview.trend.title')}</h3>
          </div>
        </div>
        {trendData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">
            {t('manager:finance.overview.trend.empty')}
          </div>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="mgrEarningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="rgba(148,163,184,0.6)" fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  stroke="rgba(148,163,184,0.6)"
                  tickFormatter={(value) => formatCurrency(value, 'EUR')}
                  width={72}
                  fontSize={11}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value, 'EUR'), t('manager:finance.overview.trend.label')]}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.97)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.75rem',
                    color: '#1e293b',
                    padding: '0.5rem 0.75rem',
                    fontSize: '13px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="url(#mgrEarningsGradient)"
                  dot={{ r: 3, fill: '#0ea5e9' }}
                  activeDot={{ r: 5, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-3">{t('manager:finance.overview.quickLinks.title')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickLinks.map(link => (
            <Link
              key={link.key}
              to={link.to}
              className="rounded-xl border border-slate-100 bg-white p-4 hover:border-sky-200 hover:shadow-sm transition-all flex flex-col gap-2"
            >
              <Tag color={link.color} className="self-start rounded-full" bordered={false}>
                {link.icon}
              </Tag>
              <div className="text-sm font-semibold text-slate-700">
                {t(`manager:finance.overview.quickLinks.${link.key}.title`)}
              </div>
              <div className="text-xs text-slate-400">
                {t(`manager:finance.overview.quickLinks.${link.key}.description`)}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ManagerFinanceOverview;
