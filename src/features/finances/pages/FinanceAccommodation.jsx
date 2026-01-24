import { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Space, Button, Tag, Grid, Table, Statistic, Row, Col, Empty } from 'antd';
import dayjs from 'dayjs';
import { ReloadOutlined, HomeOutlined, CalendarOutlined, DollarOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const accentStyles = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
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
 * FinanceAccommodation - Finance view for accommodation/stay revenue
 */
const FinanceAccommodation = () => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisMonth');
  const [summaryData, setSummaryData] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFinancialData();
    loadBookingsData();
  }, [dateRange]);

  const loadFinancialData = async () => {
    try {
      const response = await apiClient.get('/finances/summary', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          serviceType: 'accommodation',
          mode: 'accrual'
        }
      });
      setSummaryData(response.data);
    } catch (error) {
      console.error('Error loading financial data:', error);
    }
  };

  const loadBookingsData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/accommodation/bookings', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        }
      });
      setBookings(response.data || []);
    } catch (error) {
      console.error('Error loading bookings:', error);
      setBookings([]);
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

  // Calculate stats from bookings
  const stats = useMemo(() => {
    const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed').length;
    const totalNights = bookings.reduce((sum, b) => {
      const checkIn = dayjs(b.check_in_date);
      const checkOut = dayjs(b.check_out_date);
      return sum + checkOut.diff(checkIn, 'day');
    }, 0);

    return {
      totalRevenue,
      totalBookings,
      confirmedBookings,
      totalNights,
      avgNightRate: totalNights > 0 ? totalRevenue / totalNights : 0
    };
  }, [bookings]);

  const headlineStats = useMemo(() => {
    return [
      { key: 'total', label: 'Total Accommodation Revenue', value: formatCurrency(stats.totalRevenue), accent: 'blue' },
      { key: 'bookings', label: 'Total Bookings', value: stats.totalBookings.toString(), accent: 'indigo' },
      { key: 'nights', label: 'Total Nights', value: stats.totalNights.toString(), accent: 'emerald' },
      { key: 'avg', label: 'Avg. Rate/Night', value: formatCurrency(stats.avgNightRate), accent: 'slate' }
    ];
  }, [stats]);

  const columns = [
    {
      title: 'Guest',
      key: 'guest',
      render: (_, record) => record.guest_name || record.user_name || 'Unknown'
    },
    {
      title: 'Unit',
      dataIndex: 'unit_name',
      key: 'unit_name'
    },
    {
      title: 'Check-in',
      dataIndex: 'check_in_date',
      key: 'check_in',
      render: (date) => date ? dayjs(date).format('MMM D, YYYY') : '-'
    },
    {
      title: 'Check-out',
      dataIndex: 'check_out_date',
      key: 'check_out',
      render: (date) => date ? dayjs(date).format('MMM D, YYYY') : '-'
    },
    {
      title: 'Nights',
      key: 'nights',
      render: (_, record) => {
        const checkIn = dayjs(record.check_in_date);
        const checkOut = dayjs(record.check_out_date);
        return checkOut.diff(checkIn, 'day');
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = {
          confirmed: 'green',
          pending: 'gold',
          cancelled: 'red',
          completed: 'blue'
        };
        return <Tag color={colors[status] || 'default'}>{status || 'Unknown'}</Tag>;
      }
    },
    {
      title: 'Amount',
      dataIndex: 'total_price',
      key: 'total_price',
      render: (amount) => formatCurrency(amount || 0),
      align: 'right'
    }
  ];

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-blue-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <HomeOutlined style={{ fontSize: 24, color: '#3b82f6' }} />
              <h1 className="text-2xl font-semibold text-slate-900">Accommodation Finance</h1>
              <Tag color="blue" className="text-xs font-medium">Stay</Tag>
            </div>
            <p className="text-sm text-slate-500">Accommodation & Stay Revenue · {rangeLabel}</p>
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
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            <CalendarOutlined style={{ marginRight: 8 }} />
            Accommodation Bookings
          </h3>
          <Button
            size={isMobile ? 'small' : 'middle'}
            icon={<ReloadOutlined />}
            onClick={loadBookingsData}
          >
            Refresh
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={bookings}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No accommodation bookings found for this period"
              />
            )
          }}
        />
      </Card>
    </div>
  );
};

export default FinanceAccommodation;
