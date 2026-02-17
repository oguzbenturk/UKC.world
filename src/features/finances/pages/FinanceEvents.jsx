import { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Space, Button, Tag, Grid, Table, Empty } from 'antd';
import dayjs from 'dayjs';
import { ReloadOutlined, CalendarOutlined, TeamOutlined, DollarOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const accentStyles = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600' },
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
 * FinanceEvents - Finance view for events revenue
 */
const FinanceEvents = () => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisMonth');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadEventsData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/events', {
        params: {
          from: dateRange.startDate,
          to: dateRange.endDate
        }
      });
      setEvents(response.data || []);
    } catch {
      // Silently handle error
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Load data when dateRange changes
  useEffect(() => {
    loadEventsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

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

  // Calculate stats from events
  const stats = useMemo(() => {
    // Filter only paid events (those with price > 0)
    const paidEvents = events.filter(e => Number(e.price || 0) > 0);
    const freeEvents = events.filter(e => !e.price || Number(e.price) === 0);
    
    // Calculate potential revenue (price * registrations for each event)
    const totalRevenue = paidEvents.reduce((sum, e) => {
      const price = Number(e.price || 0);
      const registrations = Number(e.registration_count || 0);
      return sum + (price * registrations);
    }, 0);

    const totalEvents = events.length;
    const totalRegistrations = events.reduce((sum, e) => sum + Number(e.registration_count || 0), 0);
    const completedEvents = events.filter(e => e.status === 'completed').length;

    return {
      totalRevenue,
      totalEvents,
      paidEvents: paidEvents.length,
      freeEvents: freeEvents.length,
      totalRegistrations,
      completedEvents,
      avgTicketPrice: paidEvents.length > 0 
        ? paidEvents.reduce((sum, e) => sum + Number(e.price || 0), 0) / paidEvents.length 
        : 0
    };
  }, [events]);

  const headlineStats = useMemo(() => {
    return [
      { key: 'total', label: 'Total Event Revenue', value: formatCurrency(stats.totalRevenue), accent: 'blue' },
      { key: 'events', label: 'Total Events', value: stats.totalEvents.toString(), accent: 'violet' },
      { key: 'registrations', label: 'Total Registrations', value: stats.totalRegistrations.toString(), accent: 'emerald' },
      { key: 'avg', label: 'Avg. Ticket Price', value: formatCurrency(stats.avgTicketPrice), accent: 'slate' }
    ];
  }, [stats]);

  const columns = [
    {
      title: 'Event Name',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <div>
          <div className="font-medium">{name}</div>
          {record.event_type && <div className="text-xs text-slate-500">{record.event_type}</div>}
        </div>
      )
    },
    {
      title: 'Date',
      dataIndex: 'start_at',
      key: 'start_at',
      render: (date) => date ? dayjs(date).format('MMM D, YYYY HH:mm') : '-'
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      render: (location) => location || '-'
    },
    {
      title: 'Capacity',
      key: 'capacity',
      render: (_, record) => {
        const capacity = record.capacity || '∞';
        const registrations = record.registration_count || 0;
        return `${registrations} / ${capacity}`;
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = {
          draft: 'default',
          published: 'blue',
          cancelled: 'red',
          completed: 'green'
        };
        return <Tag color={colors[status] || 'default'}>{status || 'Unknown'}</Tag>;
      }
    },
    {
      title: 'Ticket Price',
      dataIndex: 'price',
      key: 'price',
      render: (price) => price ? formatCurrency(price) : <Tag color="green">Free</Tag>,
      align: 'right'
    },
    {
      title: 'Revenue',
      key: 'revenue',
      render: (_, record) => {
        const price = Number(record.price || 0);
        const registrations = Number(record.registration_count || 0);
        const revenue = price * registrations;
        return revenue > 0 ? formatCurrency(revenue) : '-';
      },
      align: 'right'
    }
  ];

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-violet-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarOutlined style={{ fontSize: 24, color: '#8b5cf6' }} />
              <h1 className="text-2xl font-semibold text-slate-900">Events Finance</h1>
              <Tag color="purple" className="text-xs font-medium">Events</Tag>
            </div>
            <p className="text-sm text-slate-500">Event Tickets & Registration Revenue · {rangeLabel}</p>
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
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-violet-500 focus:outline-none"
                    max={dateRange.endDate}
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => handleMobileDateChange('endDate', e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-violet-500 focus:outline-none"
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

      {/* Secondary Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
              <TeamOutlined className="text-lg text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Paid Events</p>
              <p className="text-xl font-semibold text-violet-600">{stats.paidEvents}</p>
            </div>
          </div>
        </Card>
        <Card className="rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
              <CalendarOutlined className="text-lg text-green-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Free Events</p>
              <p className="text-xl font-semibold text-green-600">{stats.freeEvents}</p>
            </div>
          </div>
        </Card>
        <Card className="rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <DollarOutlined className="text-lg text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Completed Events</p>
              <p className="text-xl font-semibold text-blue-600">{stats.completedEvents}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            <CalendarOutlined style={{ marginRight: 8 }} />
            Events List
          </h3>
          <Button
            size={isMobile ? 'small' : 'middle'}
            icon={<ReloadOutlined />}
            onClick={loadEventsData}
          >
            Refresh
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={events}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No events found for this period"
              />
            )
          }}
        />
      </Card>
    </div>
  );
};

export default FinanceEvents;
