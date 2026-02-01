// src/features/dashboard/pages/ExecutiveDashboard.jsx
import { useState, useCallback, memo, useMemo } from 'react';
import { Row, Col, Alert, Spin, Button, Tooltip, Modal, Card, Dropdown } from 'antd';
import {
  SettingOutlined,
  DownOutlined
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import moment from 'moment';
import { formatCurrency } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { usePageSEO } from '@/shared/utils/seo';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import CustomizePanel from '../components/CustomizePanel';
import { useDashboardData } from '../hooks/useDashboardData';

const resolveRange = (dateRange) => {
  const fallbackEnd = moment();
  const fallbackStart = fallbackEnd.clone().subtract(6, 'days');

  const start = dateRange?.startDate ? moment(dateRange.startDate) : fallbackStart;
  const end = dateRange?.endDate ? moment(dateRange.endDate) : fallbackEnd;

  if (end.isBefore(start)) {
    return { start: fallbackStart, end: fallbackEnd };
  }

  return { start, end };
};

const getCompletionRateLabel = (kpis) => {
  const completed = Number(kpis?.completedBookings || 0);
  const total = Number(kpis?.totalBookings || 0);
  if (!total) return '—';
  return `${((completed / total) * 100).toFixed(1)}%`;
};

const getHighlightStats = (kpis) => {
  const completionRate = getCompletionRateLabel(kpis);
  return [
    {
      label: 'Bookings completed',
      value: kpis?.completedBookings?.toLocaleString?.() || '0',
      helper: `${completionRate} completion rate`,
      dotClass: 'bg-sky-400'
    }
  ];
};

const initialWidgetVisibility = {
  kpiRow1: true,
  kpiRow2: true,
  revenueTrend: true,
  topInstructors: true,
};

const getVisibleWidgets = () => {
  try {
    const saved = localStorage.getItem('dashboardWidgetVisibility');
    return saved ? { ...initialWidgetVisibility, ...JSON.parse(saved) } : initialWidgetVisibility;
  } catch {
    return initialWidgetVisibility;
  }
};

const DashboardHeader = memo(({
  dateRange,
  kpis,
  onDateChange,
  onDatePresetChange,
  customizeMode,
  onCustomizeToggle,
}) => {
  const { start, end } = resolveRange(dateRange);
  const windowDays = Math.max(end.diff(start, 'days') + 1, 1);
  const highlightStats = getHighlightStats(kpis);

  // Dropdown menu items for quick presets
  const presetMenuItems = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
  ];

  const handlePresetClick = ({ key }) => {
    onDatePresetChange(key);
  };

  // Handle native date input changes
  const handleStartDateChange = (e) => {
    const newStart = e.target.value;
    if (newStart) {
      onDateChange('start', newStart);
    }
  };

  const handleEndDateChange = (e) => {
    const newEnd = e.target.value;
    if (newEnd) {
      onDateChange('end', newEnd);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Title + Controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        {/* Title Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center">
                <LineChart style={{ width: 24, height: 24 }} />
            </div>
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight m-0">
                  Operational Health
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-slate-500 text-sm font-normal">
                    Performance Overview • {windowDays} Days analyzed
                  </span>
                </div>
            </div>
          </div>
          
          {/* Controls Group */}
          <div className="flex items-center gap-3">
             <div className="flex items-center bg-slate-50 p-1 rounded-lg border border-slate-200">
                <input
                  type="date"
                  value={start.format('YYYY-MM-DD')}
                  onChange={handleStartDateChange}
                  max={end.format('YYYY-MM-DD')}
                  className="bg-transparent border-0 text-slate-600 text-sm font-medium focus:ring-0 px-3 cursor-pointer"
                />
                <span className="text-slate-400 text-xs px-1">➜</span>
                <input
                  type="date"
                  value={end.format('YYYY-MM-DD')}
                  onChange={handleEndDateChange}
                  min={start.format('YYYY-MM-DD')}
                  max={moment().format('YYYY-MM-DD')}
                  className="bg-transparent border-0 text-slate-600 text-sm font-medium focus:ring-0 px-3 cursor-pointer"
                />
             </div>

              <Dropdown
                menu={{ items: presetMenuItems, onClick: handlePresetClick }}
                trigger={['click']}
              >
                <Button className="h-10 px-4 rounded-lg border-slate-200 hover:border-sky-500 hover:text-sky-600 font-medium">
                  {windowDays > 300 ? 'This Year' : windowDays > 25 ? 'This Month' : 'Custom'} <DownOutlined className="text-xs ml-2 opacity-50" />
                </Button>
              </Dropdown>

              <Tooltip title="Customize Dashboard">
                <Button
                  icon={<SettingOutlined />}
                  onClick={onCustomizeToggle}
                  className={`h-10 w-10 flex items-center justify-center rounded-lg border-slate-200 transition-colors
                    ${customizeMode ? 'bg-sky-50 text-sky-600 border-sky-200' : 'hover:bg-slate-50 text-slate-400 hover:text-slate-600'}
                  `}
                />
              </Tooltip>
          </div>
        </div>

      </div>

      {/* Stats Cards - Highlight Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {highlightStats.map((stat) => (
          <div
            key={stat.label}
            className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex flex-col gap-1 relative z-10">
              <div className="flex items-center gap-2 mb-2">
                 <div className={`h-2 w-2 rounded-full ${stat.dotClass}`} />
                 <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {stat.label}
                 </span>
              </div>
              <div className="text-4xl font-bold text-slate-800 tracking-tight">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-slate-500 bg-slate-50 self-start px-2 py-1 rounded mt-2">
                {stat.helper}
              </div>
            </div>
            
            {/* Subtle decorative background blob */}
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-sky-50 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700 opacity-60" />
          </div>
        ))}
      </div>
    </div>
  );
});

DashboardHeader.displayName = 'DashboardHeader';

const KpiPrimaryRow = memo(({ isVisible, dateRange, kpis, loading, onShowModal }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} sm={12} lg={8}>
        <KpiCard
          title="Completed Bookings"
          value={kpis.completedBookings}
          color="#3b82f6"
          note={`Out of ${kpis.totalBookings} total`}
          breakdown={{
            'Completed Bookings': kpis.completedBookings,
            'Total Bookings': kpis.totalBookings,
            'Completion Rate': `${((kpis.completedBookings / kpis.totalBookings) * 100 || 0).toFixed(1)}%`,
          }}
          onCardClick={onShowModal}
          isLoading={loading}
        />
      </Col>

      <Col xs={24} sm={12} lg={8}>
        <KpiCard
          title="Completed Rentals"
          value={kpis.completedRentals}
          color="#8b5cf6"
          note="Rental agreements completed"
          isLoading={loading}
        />
      </Col>
    </Row>
  );
});

KpiPrimaryRow.displayName = 'KpiPrimaryRow';

const KpiSecondaryRow = memo(({ isVisible, kpis, loading, currencySymbol }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} sm={12} lg={8}>
        <KpiCard
          title="Avg. Booking Value"
          value={kpis.avgBookingValue}
          prefix={currencySymbol || '€'}
          precision={2}
          isLoading={loading}
        />
      </Col>

      <Col xs={24} sm={12} lg={8}>
        <KpiCard
          title="Customers with Debt"
          value={kpis.customersWithDebt}
          color="#6366f1"
          note="Customers with outstanding balance"
          isLoading={loading}
        />
      </Col>
    </Row>
  );
});

KpiSecondaryRow.displayName = 'KpiSecondaryRow';

const PerformanceCharts = memo(({
  showRevenueTrend,
  trendData,
  loading,
  currencySymbol,
}) => {
  if (!showRevenueTrend) {
    return null;
  }

  return (
    <Row gutter={[24, 24]}>
      {showRevenueTrend && (
        <Col xs={24}>
          <ChartCard title="Revenue Trend" isLoading={loading}>
            {trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="period" stroke="#6b7280" />
                  <YAxis tickFormatter={(v) => `${currencySymbol}${v}`} stroke="#6b7280" />
                  <RechartsTooltip formatter={(v) => formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Col>
      )}
    </Row>
  );
});

PerformanceCharts.displayName = 'PerformanceCharts';

const InsightsRow = memo(({
  showTopInstructors,
  instructorData,
  loading,
  currencySymbol,
}) => {
  if (!showTopInstructors) {
    return null;
  }

  return (
    <Row gutter={[24, 24]}>
      {showTopInstructors && (
        <Col xs={24}>
          <ChartCard title="Top Instructors by Revenue" isLoading={loading}>
            {instructorData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={instructorData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tickFormatter={(v) => `${currencySymbol}${v}`} stroke="#6b7280" />
                  <YAxis type="category" dataKey="name" width={120} stroke="#6b7280" />
                  <RechartsTooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Col>
      )}
    </Row>
  );
});

InsightsRow.displayName = 'InsightsRow';

const DashboardBody = memo(({
  dateRange,
  onDateChange,
  onDatePresetChange,
  customizeMode,
  onCustomizeToggle,
  visibleWidgets,
  onWidgetVisibilityChange,
  loading,
  kpis,
  trendData,
  instructorData,
  onShowModal,
  currencySymbol,
}) => (
  <div className="relative px-4 py-8 sm:px-6 lg:px-8">
    <div className="max-w-8xl mx-auto space-y-6">
      <DashboardHeader
        dateRange={dateRange}
        kpis={kpis || {}}
        onDateChange={onDateChange}
        onDatePresetChange={onDatePresetChange}
        customizeMode={customizeMode}
        onCustomizeToggle={onCustomizeToggle}
      />

      <div className="space-y-6">
        {customizeMode && (
          <Card
            className="rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg backdrop-blur-sm"
            bodyStyle={{ padding: '16px 20px' }}
          >
            <CustomizePanel
              visibleWidgets={visibleWidgets}
              onVisibilityChange={onWidgetVisibilityChange}
              initialWidgets={initialWidgetVisibility}
            />
          </Card>
        )}

        <KpiPrimaryRow
          isVisible={visibleWidgets.kpiRow1}
          dateRange={dateRange}
          kpis={kpis}
          loading={loading}
          onShowModal={onShowModal}
        />

        <KpiSecondaryRow
          isVisible={visibleWidgets.kpiRow2}
          kpis={kpis}
          loading={loading}
          currencySymbol={currencySymbol}
        />

        <PerformanceCharts
          showRevenueTrend={visibleWidgets.revenueTrend}
          trendData={trendData}
          loading={loading}
          currencySymbol={currencySymbol}
        />

        <InsightsRow
          showTopInstructors={visibleWidgets.topInstructors}
          instructorData={instructorData}
          loading={loading}
          currencySymbol={currencySymbol}
        />
      </div>
    </div>
  </div>
));

DashboardBody.displayName = 'DashboardBody';

export default function ExecutiveDashboard() {
  usePageSEO({
    title: 'Executive Dashboard | Plannivo',
    description: 'High-level overview of lessons, rentals, finances, and operational KPIs.',
    path: '/admin/dashboard'
  });

  const { businessCurrency, currencySymbol } = useCurrency();

  const {
    dateRange,
    setDateRange,
    loading,
    error,
    kpis,
    trendData,
    instructorData,
    fetchAll,
  } = useDashboardData();

  const [modalInfo, setModalInfo] = useState({ visible: false, title: '', content: null });
  const [customizeMode, setCustomizeMode] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState(getVisibleWidgets());

  const handleShowModal = useCallback((title, data) => {
    setModalInfo({ visible: true, title, content: data });
  }, []);

  const handleCancelModal = useCallback(() => {
    setModalInfo({ visible: false, title: '', content: null });
  }, []);

  const handleWidgetVisibilityChange = useCallback((widget, isVisible) => {
    setVisibleWidgets(prev => {
      const newVisibility = { ...prev, [widget]: isVisible };
      localStorage.setItem('dashboardWidgetVisibility', JSON.stringify(newVisibility));
      return newVisibility;
    });
  }, []);

  const setDateRangePreset = useCallback((preset) => {
    const endDate = moment();
    let startDate;

    if (preset === 'today') {
        startDate = moment();
    } else if (preset === 'week') {
      startDate = moment().startOf('week');
    } else if (preset === 'month') {
      startDate = moment().startOf('month');
    } else if (preset === 'year') {
      startDate = moment().startOf('year');
    } else {
      return;
    }

    setDateRange({
      startDate: startDate.format('YYYY-MM-DD'),
      endDate: endDate.format('YYYY-MM-DD'),
    });
  }, [setDateRange]);

  const handleDateRangeChange = useCallback((type, value) => {
    setDateRange(prev => ({
      ...prev,
      [type === 'start' ? 'startDate' : 'endDate']: value,
    }));
  }, [setDateRange]);

  const handleCustomizeToggle = useCallback(() => {
    setCustomizeMode(prev => !prev);
  }, []);

  if (loading && !kpis.completedBookings) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <Alert
          type="error"
          message="Dashboard Error"
          description={error}
          action={<Button onClick={fetchAll}>Retry</Button>}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-sky-200/30 rounded-full filter blur-3xl opacity-50 animate-blob" />
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-indigo-200/30 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-2000" />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-pink-200/30 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-4000" />
      </div>

      <DashboardBody
        dateRange={dateRange}
        onDateChange={handleDateRangeChange}
        onDatePresetChange={setDateRangePreset}
        customizeMode={customizeMode}
        onCustomizeToggle={handleCustomizeToggle}
        visibleWidgets={visibleWidgets}
        onWidgetVisibilityChange={handleWidgetVisibilityChange}
        loading={loading}
        kpis={kpis}
        trendData={trendData}
        instructorData={instructorData}
        onShowModal={handleShowModal}
        currencySymbol={currencySymbol || (businessCurrency === 'TRY' ? '₺' : '€')}
      />

      <Modal
        title={modalInfo.title}
        open={modalInfo.visible}
        onCancel={handleCancelModal}
        footer={null}
        className="modern-modal"
      >
        {modalInfo.content && (
          <div className="space-y-4 pt-4">
            {Object.entries(modalInfo.content).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-600">{key}</span>
                <span className="font-semibold text-lg">
                  {typeof value === 'number' ? formatCurrency(value) : value}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
