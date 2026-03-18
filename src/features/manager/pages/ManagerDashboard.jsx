// src/features/manager/pages/ManagerDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { Spin, Tag, Table, Select, Empty, Progress, DatePicker } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  DollarOutlined, CalendarOutlined, RiseOutlined, FallOutlined,
  CheckCircleOutlined, ClockCircleOutlined, PercentageOutlined,
  ThunderboltOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { getManagerDashboard, getManagerCommissionHistory } from '../services/managerCommissionApi';
import { formatCurrency } from '@/shared/utils/formatters';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

const SOURCE_COLOR = { booking: '#1890ff', rental: '#52c41a', accommodation: '#722ed1', shop: '#fa8c16', membership: '#13c2c2', package: '#eb2f96' };
const SOURCE_TAG = { booking: 'blue', rental: 'green', accommodation: 'purple', shop: 'orange', membership: 'cyan', package: 'magenta' };
const STATUS_CFG = {
  pending: { color: 'gold', icon: <ClockCircleOutlined /> },
  paid: { color: 'green', icon: <CheckCircleOutlined /> },
  cancelled: { color: 'red', icon: null },
};

const SALARY_LABELS = {
  commission: { label: 'Commission Based', color: 'blue', icon: <PercentageOutlined /> },
  fixed_per_lesson: { label: 'Per Lesson', color: 'green', icon: <ThunderboltOutlined /> },
  monthly_salary: { label: 'Monthly Salary', color: 'purple', icon: <CalendarOutlined /> },
};

// ── Stat Box ────────────────────────────────────────────────────
function StatBox({ label, value, sub, color = 'text-gray-800', border = 'border-gray-100' }) {
  return (
    <div className={`rounded-xl border ${border} bg-white p-4 min-w-0`}>
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-bold ${color} truncate`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-1 truncate">{sub}</div>}
    </div>
  );
}

function ManagerDashboard() {
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
      else message.error('Failed to load dashboard');
    } catch (error) {
      message.error(error.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

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
      message.error(error.message || 'Failed to load commission history');
    } finally {
      setHistoryLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useEffect(() => { fetchCommissions(1); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px]"><Spin size="large" /></div>;
  }

  const { settings, currentPeriod, previousPeriod, yearToDate, comparison } = dashboardData || {};
  const salaryType = settings?.salaryType || 'commission';
  const salaryInfo = SALARY_LABELS[salaryType] || SALARY_LABELS.commission;
  const changePercent = parseFloat(comparison?.earningsChangePercent) || 0;
  const isUp = changePercent >= 0;

  // Build active rate summary
  const activeRates = salaryType === 'commission'
    ? [
        { label: 'Bookings', rate: settings?.bookingRate },
        { label: 'Rentals', rate: settings?.rentalRate },
        { label: 'Accom.', rate: settings?.accommodationRate },
        { label: 'Shop', rate: settings?.shopRate },
        { label: 'Membership', rate: settings?.membershipRate },
        { label: 'Packages', rate: settings?.packageRate },
      ].filter(r => parseFloat(r.rate) > 0)
    : [];

  // Build category breakdown from current period
  const breakdown = currentPeriod?.breakdown || {};
  const categories = [
    { key: 'bookings', label: 'Bookings', color: SOURCE_COLOR.booking },
    { key: 'rentals', label: 'Rentals', color: SOURCE_COLOR.rental },
    { key: 'accommodation', label: 'Accommodation', color: SOURCE_COLOR.accommodation },
    { key: 'shop', label: 'Shop', color: SOURCE_COLOR.shop },
    { key: 'membership', label: 'Membership', color: SOURCE_COLOR.membership },
    { key: 'packages', label: 'Packages', color: SOURCE_COLOR.package },
  ].map(c => ({ ...c, count: breakdown[c.key]?.count || 0, amount: breakdown[c.key]?.amount || 0 }))
   .filter(c => c.amount > 0 || c.count > 0);
  const maxCatAmount = Math.max(...categories.map(c => c.amount), 1);

  // Columns
  const columns = [
    {
      title: 'Date', key: 'date', width: 100,
      render: (_, r) => {
        const d = r.source_date || r.booking_date || r.created_at;
        return d ? dayjs(d).format('DD MMM YYYY') : '—';
      },
    },
    {
      title: 'Source', key: 'source', width: 110,
      render: (_, r) => {
        const t = r.source_type || 'booking';
        return <Tag color={SOURCE_TAG[t] || 'default'} className="capitalize">{t}</Tag>;
      },
    },
    {
      title: 'Details', key: 'details', ellipsis: true,
      render: (_, r) => {
        const d = r.source_details || r.metadata || {};
        const parts = [d.student_name, d.instructor_name, d.service_name].filter(Boolean);
        return <span className="text-xs text-gray-600">{parts.join(' · ') || '—'}</span>;
      },
    },
    {
      title: 'Amount', key: 'sourceAmount', width: 90, align: 'right',
      render: (_, r) => <span className="text-gray-500">{formatCurrency(r.source_amount || 0, r.source_currency || 'EUR')}</span>,
    },
    {
      title: 'Rate', key: 'rate', width: 60, align: 'center',
      render: (_, r) => {
        const rate = r.commission_rate || r.commissionRate;
        return rate ? <span className="text-purple-600 font-medium">{rate}%</span> : '—';
      },
    },
    {
      title: 'Commission', key: 'commission', width: 100, align: 'right',
      render: (_, r) => <span className="font-semibold text-green-600">{formatCurrency(r.commission_amount || 0, r.commission_currency || 'EUR')}</span>,
    },
    {
      title: 'Status', key: 'status', width: 90, align: 'center',
      render: (_, r) => {
        const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
        return <Tag color={cfg.color} icon={cfg.icon} className="capitalize">{r.status}</Tag>;
      },
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-1">
            <DollarOutlined className="text-green-500" />
            My Earnings
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Tag color={salaryInfo.color} icon={salaryInfo.icon} bordered={false} className="rounded-full">{salaryInfo.label}</Tag>
            {activeRates.length > 0 && (
              <span className="text-xs text-gray-400">
                {activeRates.map(r => `${r.label} ${r.rate}%`).join(' · ')}
              </span>
            )}
            {salaryType === 'fixed_per_lesson' && settings?.perLessonAmount > 0 && (
              <span className="text-xs text-gray-400">{formatCurrency(settings.perLessonAmount, 'EUR')}/lesson</span>
            )}
            {salaryType === 'monthly_salary' && settings?.fixedSalaryAmount > 0 && (
              <span className="text-xs text-gray-400">{formatCurrency(settings.fixedSalaryAmount, 'EUR')}/month</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox
          label="This Month"
          value={formatCurrency(currentPeriod?.totalEarned || 0, 'EUR')}
          sub={`${currentPeriod?.breakdown?.bookings?.count || 0} bookings · ${currentPeriod?.breakdown?.rentals?.count || 0} rentals`}
          color="text-green-600"
          border="border-green-100"
        />
        <StatBox
          label="Pending Payout"
          value={formatCurrency(currentPeriod?.pending?.amount || 0, 'EUR')}
          sub={`${currentPeriod?.pending?.count || 0} transactions`}
          color="text-amber-600"
          border="border-amber-100"
        />
        <StatBox
          label="Year to Date"
          value={formatCurrency(yearToDate?.totalEarned || 0, 'EUR')}
          sub={`Paid: ${formatCurrency(yearToDate?.paid?.amount || 0, 'EUR')}`}
          color="text-blue-600"
          border="border-blue-100"
        />
        <div className={`rounded-xl border ${isUp ? 'border-green-100' : 'border-red-100'} bg-white p-4 min-w-0`}>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">vs Last Month</div>
          <div className={`text-xl font-bold flex items-center gap-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
            {isUp ? <RiseOutlined /> : <FallOutlined />}
            {isUp ? '+' : ''}{changePercent.toFixed(1)}%
          </div>
          <div className="text-[11px] text-gray-400 mt-1 truncate">
            Prev: {formatCurrency(previousPeriod?.totalEarned || 0, 'EUR')}
          </div>
        </div>
      </div>

      {/* ── Category Breakdown (this month) ── */}
      {categories.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <BarChartOutlined className="text-indigo-500" />
            This Month by Category
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
                <span className="text-xs text-gray-400 w-20 text-right shrink-0">{cat.count} items</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Payment Progress (YTD) ── */}
      {(yearToDate?.totalEarned || 0) > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-green-100 bg-white p-4 text-center">
            <div className="text-lg font-bold text-green-600">{formatCurrency(yearToDate?.paid?.amount || 0, 'EUR')}</div>
            <div className="text-xs text-gray-400 mt-1">Paid (YTD)</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white p-4 text-center">
            <div className="text-lg font-bold text-amber-600">{formatCurrency(yearToDate?.pending?.amount || 0, 'EUR')}</div>
            <div className="text-xs text-gray-400 mt-1">Pending (YTD)</div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
            <div className="text-lg font-bold text-gray-700">
              {yearToDate?.totalEarned > 0 ? Math.round(((yearToDate?.paid?.amount || 0) / yearToDate.totalEarned) * 100) : 0}%
            </div>
            <div className="text-xs text-gray-400 mt-1">Collected</div>
          </div>
        </div>
      )}

      {/* ── Commission History ── */}
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <CalendarOutlined className="text-blue-500" />
            Commission History
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              placeholder="Source" allowClear style={{ width: 140 }} size="small"
              value={filters.sourceType} onChange={v => setFilters(f => ({ ...f, sourceType: v }))}
            >
              <Option value="booking">Booking</Option>
              <Option value="rental">Rental</Option>
              <Option value="accommodation">Accommodation</Option>
              <Option value="shop">Shop</Option>
              <Option value="membership">Membership</Option>
              <Option value="package">Package</Option>
            </Select>
            <Select
              placeholder="Status" allowClear style={{ width: 120 }} size="small"
              value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}
            >
              <Option value="pending">Pending</Option>
              <Option value="paid">Paid</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
            <RangePicker
              value={filters.dateRange}
              onChange={dates => setFilters(f => ({ ...f, dateRange: dates }))}
              style={{ width: 220 }} size="small"
            />
          </div>
        </div>

        {commissions.length === 0 && !historyLoading ? (
          <Empty description="No commission records found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
              showTotal: total => `${total} records`,
            }}
            onChange={p => fetchCommissions(p.current)}
          />
        )}
      </div>
    </div>
  );
}

export default ManagerDashboard;
