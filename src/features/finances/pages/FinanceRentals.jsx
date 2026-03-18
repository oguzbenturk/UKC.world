import { useState, useEffect, useMemo } from 'react';
import { DatePicker, Button, Empty, Grid } from 'antd';
import dayjs from 'dayjs';
import { ReloadOutlined } from '@ant-design/icons';
import TransactionHistory from '../components/TransactionHistory';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const QUICK_RANGES = [
  { key: 'thisMonth', label: 'This Month', start: () => dayjs().startOf('month'), end: () => dayjs() },
  { key: 'thisYear', label: 'This Year', start: () => dayjs().startOf('year'), end: () => dayjs() },
  { key: 'all', label: 'All', start: () => dayjs('2020-01-01'), end: () => dayjs() },
];

const FinanceRentals = () => {
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [finRes, payRes] = await Promise.all([
        apiClient.get('/finances/summary', {
          params: { startDate: dateRange.startDate, endDate: dateRange.endDate, serviceType: 'rentals', mode: 'accrual' }
        }),
        apiClient.get('/finances/transactions/payments', {
          params: { startDate: dateRange.startDate, endDate: dateRange.endDate }
        })
      ]);
      setSummaryData(finRes.data);
      setPayments(payRes.data.payments || []);
      setCustomerDirectory(payRes.data.customerDirectory || {});
    } catch (error) {
      console.error('Error loading rental finance data:', error);
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

  const handleQuickRange = (range) => {
    setDateRange({ startDate: range.start().format('YYYY-MM-DD'), endDate: range.end().format('YYYY-MM-DD') });
    setActiveQuickRange(range.key);
  };

  const stats = useMemo(() => {
    if (!summaryData) return null;
    const revenue = summaryData.revenue || {};
    const balances = summaryData.balances || {};
    return {
      revenue: Number(revenue.rental_revenue || 0),
      count: Number(revenue.rental_count || 0),
      debt: Number(balances.total_customer_debt || 0),
    };
  }, [summaryData]);

  const rentalTransactions = useMemo(() => {
    return Array.isArray(payments) ? payments.filter(p =>
      p.rental_id || p.transaction_type === 'rental_charge'
    ) : [];
  }, [payments]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Rental Finance</h1>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => handleQuickRange(r)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeQuickRange === r.key
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {r.label}
            </button>
          ))}
          {isMobile ? (
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateRange.startDate} max={dateRange.endDate}
                onChange={(e) => { setDateRange(prev => ({ ...prev, startDate: e.target.value })); setActiveQuickRange(null); }}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-xs" />
              <span className="text-xs text-slate-400">–</span>
              <input type="date" value={dateRange.endDate} min={dateRange.startDate}
                onChange={(e) => { setDateRange(prev => ({ ...prev, endDate: e.target.value })); setActiveQuickRange(null); }}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-xs" />
            </div>
          ) : (
            <RangePicker
              size="small"
              value={[dayjs(dateRange.startDate), dayjs(dateRange.endDate)]}
              onChange={handleDateRangeChange}
              allowClear={false}
              className="rounded-md"
            />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200/60">
          <p className="text-xs text-slate-500">Revenue</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {stats ? formatCurrency(stats.revenue) : '--'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200/60">
          <p className="text-xs text-slate-500">Rentals</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {stats ? stats.count : '--'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200/60">
          <p className="text-xs text-slate-500">Outstanding</p>
          <p className={`mt-1 text-lg font-semibold ${stats && stats.debt > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {stats ? formatCurrency(stats.debt) : '--'}
          </p>
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-xl bg-white ring-1 ring-slate-200/60">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-700">Transactions</h2>
          <Button size="small" icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Refresh
          </Button>
        </div>
        <div className="p-1">
          {rentalTransactions.length === 0 && !loading ? (
            <Empty description="No rental transactions for this period" className="py-10" />
          ) : (
            <TransactionHistory
              transactions={rentalTransactions}
              customerDirectory={customerDirectory}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default FinanceRentals;
