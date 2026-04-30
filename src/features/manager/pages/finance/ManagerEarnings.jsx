// src/features/manager/pages/finance/ManagerEarnings.jsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Spin, Tag, Table, Select, Empty, Progress, DatePicker } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  DollarOutlined, CalendarOutlined, RiseOutlined, FallOutlined,
  CheckCircleOutlined, ClockCircleOutlined, PercentageOutlined,
  ThunderboltOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { getManagerDashboard, getManagerCommissionHistory } from '../../services/managerCommissionApi';
import StatBox from '../../components/finance/StatBox';
import { formatCurrency } from '@/shared/utils/formatters';
import { SOURCE_COLOR, SOURCE_TAG } from '../../constants/commissionSources';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

const STATUS_CFG = {
  pending: { color: 'gold', icon: <ClockCircleOutlined /> },
  paid: { color: 'green', icon: <CheckCircleOutlined /> },
  cancelled: { color: 'red', icon: null },
};

function ManagerEarnings() {
  const { t } = useTranslation(['manager']);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0 });
  const [filters, setFilters] = useState({ sourceType: null, status: null, dateRange: null });

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getManagerDashboard();
      if (response.success) setDashboardData(response.data);
      else message.error(t('manager:errors.loadFailed'));
    } catch (error) {
      message.error(error.message || t('manager:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchCommissions = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const options = { page, limit: pagination.limit, sourceType: filters.sourceType, status: filters.status };
      if (filters.dateRange?.length === 2) {
        options.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        options.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      const response = await getManagerCommissionHistory(options);
      if (response.success) {
        setCommissions(response.data || []);
        setPagination(prev => ({ ...prev, page: response.pagination?.page || 1, total: response.pagination?.total || 0 }));
      }
    } catch (error) {
      message.error(error.message || t('manager:errors.loadFailed'));
    } finally {
      setHistoryLoading(false);
    }
  }, [filters, pagination.limit, t]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useEffect(() => { fetchCommissions(1); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px]"><Spin size="large" /></div>;
  }

  const { settings, currentPeriod, previousPeriod, yearToDate, comparison } = dashboardData || {};
  const salaryType = settings?.salaryType || 'commission';
  const SALARY_LABELS = {
    commission: { label: t('manager:dashboard.salaryTypes.commission'), color: 'blue', icon: <PercentageOutlined /> },
    fixed_per_lesson: { label: t('manager:dashboard.salaryTypes.fixed_per_lesson'), color: 'green', icon: <ThunderboltOutlined /> },
    monthly_salary: { label: t('manager:dashboard.salaryTypes.monthly_salary'), color: 'purple', icon: <CalendarOutlined /> },
  };
  const salaryInfo = SALARY_LABELS[salaryType] || SALARY_LABELS.commission;
  const changePercent = parseFloat(comparison?.earningsChangePercent) || 0;
  const isUp = changePercent >= 0;

  const activeRates = salaryType === 'commission'
    ? [
        { label: t('manager:dashboard.categoryBreakdown.bookings'), rate: settings?.bookingRate },
        { label: t('manager:dashboard.categoryBreakdown.rentals'), rate: settings?.rentalRate },
        { label: t('manager:dashboard.categoryBreakdown.accommodation'), rate: settings?.accommodationRate },
        { label: t('manager:dashboard.categoryBreakdown.shop'), rate: settings?.shopRate },
        { label: t('manager:dashboard.categoryBreakdown.membership'), rate: settings?.membershipRate },
        { label: t('manager:dashboard.categoryBreakdown.packages'), rate: settings?.packageRate },
      ].filter(r => parseFloat(r.rate) > 0)
    : [];

  const breakdown = currentPeriod?.breakdown || {};
  const categories = [
    { key: 'bookings', label: t('manager:dashboard.categoryBreakdown.bookings'), color: SOURCE_COLOR.booking },
    { key: 'rentals', label: t('manager:dashboard.categoryBreakdown.rentals'), color: SOURCE_COLOR.rental },
    { key: 'accommodation', label: t('manager:dashboard.categoryBreakdown.accommodation'), color: SOURCE_COLOR.accommodation },
    { key: 'shop', label: t('manager:dashboard.categoryBreakdown.shop'), color: SOURCE_COLOR.shop },
    { key: 'membership', label: t('manager:dashboard.categoryBreakdown.membership'), color: SOURCE_COLOR.membership },
    { key: 'packages', label: t('manager:dashboard.categoryBreakdown.packages'), color: SOURCE_COLOR.package },
  ].map(c => ({ ...c, count: breakdown[c.key]?.count || 0, amount: breakdown[c.key]?.amount || 0 }))
   .filter(c => c.amount > 0 || c.count > 0);
  const maxCatAmount = Math.max(...categories.map(c => c.amount), 1);

  const columns = [
    {
      title: t('manager:dashboard.history.columns.date'), key: 'date', width: 100,
      render: (_, r) => {
        const d = r.source_date || r.booking_date || r.created_at;
        return d ? dayjs(d).format('DD MMM YYYY') : '—';
      },
    },
    {
      title: t('manager:dashboard.history.columns.source'), key: 'source', width: 110,
      render: (_, r) => {
        const t = r.source_type || 'booking';
        return <Tag color={SOURCE_TAG[t] || 'default'} className="capitalize">{t}</Tag>;
      },
    },
    {
      title: t('manager:dashboard.history.columns.details'), key: 'details', ellipsis: true,
      render: (_, r) => {
        const d = r.source_details || r.metadata || {};
        const parts = [d.student_name, d.instructor_name, d.service_name].filter(Boolean);
        return <span className="text-xs text-gray-600">{parts.join(' · ') || '—'}</span>;
      },
    },
    {
      title: t('manager:dashboard.history.columns.amount'), key: 'sourceAmount', width: 90, align: 'right',
      render: (_, r) => <span className="text-gray-500">{formatCurrency(r.source_amount || 0, r.source_currency || 'EUR')}</span>,
    },
    {
      title: t('manager:dashboard.history.columns.rate'), key: 'rate', width: 60, align: 'center',
      render: (_, r) => {
        const rate = r.commission_rate || r.commissionRate;
        return rate ? <span className="text-purple-600 font-medium">{rate}%</span> : '—';
      },
    },
    {
      title: t('manager:dashboard.history.columns.commission'), key: 'commission', width: 100, align: 'right',
      render: (_, r) => <span className="font-semibold text-green-600">{formatCurrency(r.commission_amount || 0, r.commission_currency || 'EUR')}</span>,
    },
    {
      title: t('manager:dashboard.history.columns.status'), key: 'status', width: 90, align: 'center',
      render: (_, r) => {
        const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
        return <Tag color={cfg.color} icon={cfg.icon} className="capitalize">{r.status}</Tag>;
      },
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-1">
            <DollarOutlined className="text-green-500" />
            {t('manager:dashboard.title')}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Tag color={salaryInfo.color} icon={salaryInfo.icon} bordered={false} className="rounded-full">{salaryInfo.label}</Tag>
            {activeRates.length > 0 && (
              <span className="text-xs text-gray-400">
                {activeRates.map(r => `${r.label} ${r.rate}%`).join(' · ')}
              </span>
            )}
            {salaryType === 'fixed_per_lesson' && settings?.perLessonAmount > 0 && (
              <span className="text-xs text-gray-400">{formatCurrency(settings.perLessonAmount, 'EUR')}{t('manager:detailPanel.profile.perLesson')}</span>
            )}
            {salaryType === 'monthly_salary' && settings?.fixedSalaryAmount > 0 && (
              <span className="text-xs text-gray-400">{formatCurrency(settings.fixedSalaryAmount, 'EUR')}{t('manager:detailPanel.profile.perMonth')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox
          label={t('manager:dashboard.stats.thisMonth')}
          value={formatCurrency(currentPeriod?.totalEarned || 0, 'EUR')}
          sub={t('manager:dashboard.stats.bookingsRentals', { bookings: currentPeriod?.breakdown?.bookings?.count || 0, rentals: currentPeriod?.breakdown?.rentals?.count || 0 })}
          color="text-green-600"
          border="border-green-100"
        />
        <StatBox
          label={t('manager:dashboard.stats.pendingPayout')}
          value={formatCurrency(currentPeriod?.pending?.amount || 0, 'EUR')}
          sub={t('manager:dashboard.stats.transactions', { count: currentPeriod?.pending?.count || 0 })}
          color="text-amber-600"
          border="border-amber-100"
        />
        <StatBox
          label={t('manager:dashboard.stats.yearToDate')}
          value={formatCurrency(yearToDate?.totalEarned || 0, 'EUR')}
          sub={`${t('manager:detailPanel.profile.paid')}: ${formatCurrency(yearToDate?.paid?.amount || 0, 'EUR')}`}
          color="text-blue-600"
          border="border-blue-100"
        />
        <div className={`rounded-xl border ${isUp ? 'border-green-100' : 'border-red-100'} bg-white p-4 min-w-0`}>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t('manager:dashboard.stats.vsLastMonth')}</div>
          <div className={`text-xl font-bold flex items-center gap-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
            {isUp ? <RiseOutlined /> : <FallOutlined />}
            {isUp ? '+' : ''}{changePercent.toFixed(1)}%
          </div>
          <div className="text-[11px] text-gray-400 mt-1 truncate">
            {t('manager:dashboard.stats.prevMonth', { amount: formatCurrency(previousPeriod?.totalEarned || 0, 'EUR') })}
          </div>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <BarChartOutlined className="text-indigo-500" />
            {t('manager:dashboard.categoryBreakdown.title')}
          </h3>
          <div className="space-y-3">
            {categories.map(cat => (
              <div key={cat.key} className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="w-28 text-sm text-gray-600 shrink-0">{cat.label}</span>
                <div className="flex-1">
                  <Progress
                    percent={Math.round((cat.amount / maxCatAmount) * 100)}
                    strokeColor={cat.color}
                    format={() => formatCurrency(cat.amount, 'EUR')}
                    size="small"
                  />
                </div>
                <span className="text-xs text-gray-400 w-20 text-right shrink-0">{t('manager:dashboard.stats.items', { count: cat.count })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(yearToDate?.totalEarned || 0) > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-green-100 bg-white p-4 text-center">
            <div className="text-lg font-bold text-green-600">{formatCurrency(yearToDate?.paid?.amount || 0, 'EUR')}</div>
            <div className="text-xs text-gray-400 mt-1">{t('manager:dashboard.stats.paid_ytd')}</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white p-4 text-center">
            <div className="text-lg font-bold text-amber-600">{formatCurrency(yearToDate?.pending?.amount || 0, 'EUR')}</div>
            <div className="text-xs text-gray-400 mt-1">{t('manager:dashboard.stats.pending_ytd')}</div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
            <div className="text-lg font-bold text-gray-700">
              {yearToDate?.totalEarned > 0 ? Math.round(((yearToDate?.paid?.amount || 0) / yearToDate.totalEarned) * 100) : 0}%
            </div>
            <div className="text-xs text-gray-400 mt-1">{t('manager:dashboard.stats.collected')}</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <CalendarOutlined className="text-blue-500" />
            {t('manager:dashboard.history.title')}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              placeholder={t('manager:dashboard.history.filters.source')} allowClear style={{ width: 140 }} size="small"
              value={filters.sourceType} onChange={v => setFilters(f => ({ ...f, sourceType: v }))}
            >
              <Option value="booking">{t('manager:dashboard.history.filters.booking')}</Option>
              <Option value="rental">{t('manager:dashboard.history.filters.rental')}</Option>
              <Option value="accommodation">{t('manager:dashboard.history.filters.accommodation')}</Option>
              <Option value="shop">{t('manager:dashboard.history.filters.shop')}</Option>
              <Option value="membership">{t('manager:dashboard.history.filters.membership')}</Option>
              <Option value="package">{t('manager:dashboard.history.filters.package')}</Option>
            </Select>
            <Select
              placeholder={t('manager:dashboard.history.filters.status')} allowClear style={{ width: 120 }} size="small"
              value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}
            >
              <Option value="pending">{t('manager:dashboard.history.filters.pending')}</Option>
              <Option value="paid">{t('manager:dashboard.history.filters.paid')}</Option>
              <Option value="cancelled">{t('manager:dashboard.history.filters.cancelled')}</Option>
            </Select>
            <RangePicker
              value={filters.dateRange}
              onChange={dates => setFilters(f => ({ ...f, dateRange: dates }))}
              style={{ width: 220 }} size="small"
            />
          </div>
        </div>

        {commissions.length === 0 && !historyLoading ? (
          <Empty description={t('manager:dashboard.history.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            columns={columns}
            dataSource={commissions}
            rowKey="id"
            loading={historyLoading}
            size="small"
            scroll={{ x: 700 }}
            pagination={{
              current: pagination.page,
              total: pagination.total,
              pageSize: pagination.limit,
              showSizeChanger: false,
              size: 'small',
              showTotal: total => t('manager:dashboard.history.total', { count: total }),
            }}
            onChange={p => fetchCommissions(p.current)}
          />
        )}
      </div>
    </div>
  );
}

export default ManagerEarnings;
