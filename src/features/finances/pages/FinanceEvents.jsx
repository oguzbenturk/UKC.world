import { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Space, Button, Tag, Grid } from 'antd';
import dayjs from 'dayjs';
import { CalendarOutlined } from '@ant-design/icons';
import EventsBreakdownCharts from '../components/EventsBreakdownCharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const accentStyles = {
  violet: { bg: 'bg-violet-50', text: 'text-violet-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
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
    endDate: dayjs().endOf('week').format('YYYY-MM-DD')
  },
  thisMonth: {
    label: 'This Month',
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('month').format('YYYY-MM-DD')
  },
  thisYear: {
    label: 'This Year',
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('year').format('YYYY-MM-DD')
  },
  allHistory: {
    label: 'All History',
    startDate: '2020-01-01',
    endDate: dayjs().endOf('year').format('YYYY-MM-DD')
  }
});

const FinanceEvents = () => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('year').format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisYear');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/events', {
        params: { from: dateRange.startDate, to: dateRange.endDate }
      });
      setEvents(response.data || []);
    } catch {
      setEvents([]);
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
    if (events.length === 0 && loading) {
      return [
        { key: 'revenue', label: 'Event Revenue', value: '--', accent: 'violet' },
        { key: 'events', label: 'Total Events', value: '--', accent: 'blue' },
        { key: 'registrations', label: 'Total Registrations', value: '--', accent: 'emerald' },
        { key: 'avg', label: 'Avg. Ticket Price', value: '--', accent: 'slate' }
      ];
    }

    const paidEvents = events.filter(e => Number(e.price || 0) > 0);
    const totalRevenue = paidEvents.reduce((sum, e) => {
      return sum + (Number(e.price || 0) * Number(e.registration_count || 0));
    }, 0);
    const totalEvents = events.length;
    const totalRegistrations = events.reduce((sum, e) => sum + Number(e.registration_count || 0), 0);
    const avgTicketPrice = paidEvents.length > 0
      ? paidEvents.reduce((sum, e) => sum + Number(e.price || 0), 0) / paidEvents.length
      : 0;

    return [
      { key: 'revenue', label: 'Event Revenue', value: formatCurrency(totalRevenue), accent: 'violet' },
      { key: 'events', label: 'Total Events', value: totalEvents.toLocaleString(), accent: 'blue' },
      { key: 'registrations', label: 'Total Registrations', value: totalRegistrations.toLocaleString(), accent: 'emerald' },
      { key: 'avg', label: 'Avg. Ticket Price', value: formatCurrency(avgTicketPrice), accent: 'slate' }
    ];
  }, [events, loading]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-violet-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarOutlined style={{ fontSize: 24, color: '#8b5cf6' }} />
              <h1 className="text-2xl font-semibold text-slate-900">Events Finance</h1>
              <Tag color="purple" className="text-xs font-medium">Community</Tag>
            </div>
            <p className="text-sm text-slate-500">Event Tickets & Registration Revenue · {rangeLabel}</p>
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

      <EventsBreakdownCharts dateRange={dateRange} />
    </div>
  );
};

export default FinanceEvents;
