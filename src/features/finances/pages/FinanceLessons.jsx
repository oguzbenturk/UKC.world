import { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Space, Button, Tag, Grid } from 'antd';
import dayjs from 'dayjs';
import { ReloadOutlined, CalendarOutlined } from '@ant-design/icons';
import LessonAnalytics from '../components/LessonAnalytics';
import TransactionHistory from '../components/TransactionHistory';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const accentStyles = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
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
    endDate: dayjs().format('YYYY-MM-DD')
  },
  thisMonth: {
    label: 'This Month',
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  },
  thisYear: {
    label: 'This Year',
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  },
  allHistory: {
    label: 'All History',
    startDate: '2020-01-01',
    endDate: dayjs().format('YYYY-MM-DD')
  }
});

/**
 * FinanceLessons - Finance view for lesson revenue
 */
const FinanceLessons = () => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisMonth');
  const [summaryData, setSummaryData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [customerDirectory, setCustomerDirectory] = useState({});

  useEffect(() => {
    loadFinancialData();
    loadPaymentsData();
  }, [dateRange]);

  const loadFinancialData = async () => {
    try {
      const response = await apiClient.get('/finances/summary', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          serviceType: 'lessons',
          mode: 'accrual'
        }
      });
      setSummaryData(response.data);
    } catch (error) {
      console.error('Error loading financial data:', error);
    }
  };

  const loadPaymentsData = async () => {
    try {
      const response = await apiClient.get('/finances/transactions', {
        params: {
          start_date: dateRange.startDate,
          end_date: dateRange.endDate,
          limit: 1000
        }
      });
      // The finances endpoint returns an array of transactions directly
      setPayments(response.data || []);
      // Build customer directory from transactions
      const directory = {};
      (response.data || []).forEach(txn => {
        if (txn.user_id && txn.user_name) {
          directory[txn.user_id] = txn.user_name;
        }
      });
      setCustomerDirectory(directory);
    } catch (error) {
      console.error('Error loading payments:', error);
    }
  };

  const handleDateRangeChange = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange({
        startDate: dates[0].format('YYYY-MM-DD'),
        endDate: dates[1].format('YYYY-MM-DD')
      });
      setActiveQuickRange(null); // Clear quick range when custom dates selected
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
        { key: 'lessons', label: 'Lesson Revenue', value: '--', accent: 'indigo' },
        { key: 'bookings', label: 'Total Bookings', value: '--', accent: 'emerald' },
        { key: 'commission', label: 'Instructor Commissions', value: '--', accent: 'amber' },
        { key: 'net', label: 'Net Lesson Revenue', value: '--', accent: 'slate' }
      ];
    }

    // API returns nested structure: { revenue: {...}, netRevenue: {...}, bookings: {...} }
    const revenue = summaryData.revenue || {};
    const netRevenueData = summaryData.netRevenue || {};
    const bookingsData = summaryData.bookings || {};
    
    const lessonRevenue = Number(revenue.lesson_revenue || 0);
    const totalBookings = Number(bookingsData.completed_bookings || bookingsData.total_bookings || 0);
    const instructorCommission = Number(netRevenueData.commission_total || 0);
    const netRevenue = lessonRevenue - instructorCommission;

    return [
      { key: 'lessons', label: 'Lesson Revenue', value: formatCurrency(lessonRevenue), accent: 'indigo' },
      { key: 'bookings', label: 'Total Bookings', value: totalBookings.toLocaleString(), accent: 'emerald' },
      { key: 'commission', label: 'Instructor Commissions', value: formatCurrency(instructorCommission), accent: 'amber' },
      { key: 'net', label: 'Net Lesson Revenue', value: formatCurrency(netRevenue), accent: 'slate' }
    ];
  }, [summaryData]);

  // Filter lesson transactions only
  const lessonTransactions = useMemo(() => {
    return Array.isArray(payments) ? payments.filter(p => 
      p.booking_id || p.transaction_type === 'booking_charge'
    ) : [];
  }, [payments]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">Lesson Finance</h1>
              <Tag color="green" className="text-xs font-medium">Lessons</Tag>
            </div>
            <p className="text-sm text-slate-500">Lesson & Booking Revenue · {rangeLabel}</p>
          </div>
          <div className="flex flex-col gap-3">
            {/* Quick Range Buttons */}
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
            {/* Date Range Picker */}
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
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Lesson Revenue Analytics</h3>
        <LessonAnalytics
          summaryData={summaryData}
          chartData={[]}
        />
      </Card>

      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Lesson Transactions</h3>
          <Button
            size={isMobile ? 'small' : 'middle'}
            icon={<ReloadOutlined />}
            onClick={loadPaymentsData}
          >
            Refresh
          </Button>
        </div>
        <TransactionHistory
          transactions={lessonTransactions}
          customerDirectory={customerDirectory}
        />
      </Card>
    </div>
  );
};

export default FinanceLessons;
