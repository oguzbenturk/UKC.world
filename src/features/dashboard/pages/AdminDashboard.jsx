// src/features/dashboard/pages/AdminDashboard.jsx
import { useState, useCallback, memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Row, Col, Alert, Spin, Button, Tooltip, Modal, Card, Dropdown } from 'antd';
import {
  SettingOutlined,
  DownOutlined,
  CalendarOutlined,
  PlusCircleOutlined,
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

const PRESET_LABELS = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
  custom: 'Custom',
};

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

const formatCategoryBreakdown = (breakdown) => {
  if (!breakdown || breakdown.length === 0) return null;
  return breakdown
    .filter(b => Number(b.hours) > 0)
    .map(b => `${Number(b.hours).toFixed(0)}h ${b.category}`)
    .join(' • ');
};

const formatRentalBreakdown = (breakdown) => {
  if (!breakdown || breakdown.length === 0) return null;
  return breakdown
    .filter(b => Number(b.count) > 0)
    .map(b => `${b.count}× ${b.serviceName}`)
    .join(' • ');
};

const getHighlightStats = (kpis, operationalKpis, currencySymbol) => {
  const completionRate = getCompletionRateLabel(kpis);
  const categoryLine = formatCategoryBreakdown(operationalKpis?.lessonCategoryBreakdown);
  const avgVal = Number(kpis?.avgBookingValue || 0);
  const avgLine = avgVal > 0 ? `Avg ${currencySymbol}${avgVal.toFixed(0)} / booking` : null;

  const bookingSubtitles = [
    `${completionRate} completion • ${Number(operationalKpis?.completedHours || 0).toFixed(0)}h total`,
    categoryLine,
    avgLine,
  ].filter(Boolean);

  const rentalBreakdownLine = formatRentalBreakdown(operationalKpis?.rentalServiceBreakdown);
  const rentalSubtitles = [
    `${operationalKpis?.activeRentals || 0} active • ${operationalKpis?.upcomingRentals || 0} upcoming`,
    rentalBreakdownLine,
  ].filter(Boolean);

  // Accommodation
  const accNights = operationalKpis?.accommodationTotalNights || 0;
  const accBookings = operationalKpis?.accommodationTotalBookings || 0;
  const accUnits = operationalKpis?.accommodationUnitBreakdown || [];
  const accSubtitles = accBookings > 0
    ? [`${accNights} night${accNights !== 1 ? 's' : ''} • ${accUnits.length} unit${accUnits.length !== 1 ? 's' : ''}`]
    : ['No active bookings'];

  // Membership
  const memTotal = operationalKpis?.membershipTotal || 0;
  const memBreakdown = operationalKpis?.membershipBreakdown || [];
  const memSubtitles = memBreakdown.length > 0
    ? memBreakdown.slice(0, 3).map(m => `${m.offeringName}: ${m.activeCount} active`)
    : ['No active memberships'];

  return [
    {
      label: 'Bookings completed',
      value: kpis?.completedBookings?.toLocaleString?.() || '0',
      subtitles: bookingSubtitles,
      dotClass: 'bg-sky-400'
    },
    {
      label: 'Total Rentals',
      value: (operationalKpis?.totalRentals || 0).toLocaleString(),
      subtitles: rentalSubtitles,
      dotClass: 'bg-violet-400'
    },
    {
      label: 'Total Accommodation',
      value: accBookings.toLocaleString(),
      subtitles: accSubtitles,
      dotClass: 'bg-amber-400',
      expandable: accUnits.length > 0,
      expandContent: accUnits.slice(0, 3).map(u => ({
        label: u.unitName,
        value: `${u.totalNights} night${u.totalNights !== 1 ? 's' : ''}`,
      })),
    },
    {
      label: 'Total Members',
      value: memTotal.toLocaleString(),
      subtitles: memSubtitles,
      dotClass: 'bg-rose-400'
    },
    {
      label: 'Shop Customers',
      value: (operationalKpis?.shopCustomers || 0).toLocaleString(),
      subtitles: ['Users with at least one shop order'],
      dotClass: 'bg-orange-400'
    }
  ];
};

const initialWidgetVisibility = {
  revenueBreakdown: true,
  operationalStatus: true,
  people: true,
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
  operationalKpis,
  onDateChange,
  onDatePresetChange,
  activePreset,
  customizeMode,
  onCustomizeToggle,
  currencySymbol,
}) => {
  const { start, end } = resolveRange(dateRange);
  const windowDays = Math.max(end.diff(start, 'days') + 1, 1);
  const highlightStats = getHighlightStats(kpis, operationalKpis, currencySymbol);
  const [expandedCardIdx, setExpandedCardIdx] = useState(null);

  const handleCardClick = (idx, stat) => {
    if (!stat.expandable) return;
    setExpandedCardIdx(prev => prev === idx ? null : idx);
  };

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

  // Handle native date input changes – auto-adjust the other bound so the
  // user can freely pick any date without the browser graying out options.
  const handleStartDateChange = (e) => {
    const newStart = e.target.value;
    if (!newStart) return;
    onDateChange('start', newStart);
    // If the new start is after the current end, push end forward
    if (moment(newStart).isAfter(end)) {
      onDateChange('end', newStart);
    }
  };

  const handleEndDateChange = (e) => {
    const newEnd = e.target.value;
    if (!newEnd) return;
    onDateChange('end', newEnd);
    // If the new end is before the current start, pull start back
    if (moment(newEnd).isBefore(start)) {
      onDateChange('start', newEnd);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Title + Controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        {/* Title Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
             {/* Quick Action Links */}
             <div className="flex items-center gap-2 flex-wrap">
               <Link to="/bookings" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:border-sky-400 hover:text-sky-600 transition-colors">
                 <PlusCircleOutlined /> Booking
               </Link>
               <Link to="/rentals" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:border-violet-400 hover:text-violet-600 transition-colors">
                 <PlusCircleOutlined /> Rental
               </Link>
               <Link to="/calendar/lessons" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                 <CalendarOutlined /> Calendar
               </Link>
             </div>

             {/* Date Range + Preset */}
             <div className="flex items-center gap-2 flex-wrap">
               <div className="flex items-center bg-slate-50 p-1 rounded-lg border border-slate-200 min-w-0">
                  <input
                    type="date"
                    value={start.format('YYYY-MM-DD')}
                    onChange={handleStartDateChange}
                    className="bg-transparent border-0 text-slate-600 text-xs sm:text-sm font-medium focus:ring-0 px-2 sm:px-3 cursor-pointer w-[7.5rem] sm:w-auto"
                  />
                  <span className="text-slate-400 text-xs px-1">→</span>
                  <input
                    type="date"
                    value={end.format('YYYY-MM-DD')}
                    onChange={handleEndDateChange}
                    className="bg-transparent border-0 text-slate-600 text-xs sm:text-sm font-medium focus:ring-0 px-2 sm:px-3 cursor-pointer w-[7.5rem] sm:w-auto"
                  />
               </div>

               <Dropdown
                 menu={{ items: presetMenuItems, onClick: handlePresetClick }}
                 trigger={['click']}
               >
                 <Button className="h-10 px-4 rounded-lg border-slate-200 hover:border-sky-500 hover:text-sky-600 font-medium">
                   {PRESET_LABELS[activePreset] || 'Custom'} <DownOutlined className="text-xs ml-2 opacity-50" />
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

      </div>

      {/* Stats Cards - Highlight Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {highlightStats.map((stat, idx) => (
          <div
            key={stat.label}
            className={`group relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 ${stat.expandable ? 'cursor-pointer select-none' : ''}`}
            onClick={() => handleCardClick(idx, stat)}
          >
            <div className="flex flex-col gap-1 relative z-10">
              <div className="flex items-center gap-2 mb-2">
                 <div className={`h-2 w-2 rounded-full ${stat.dotClass}`} />
                 <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {stat.label}
                 </span>
                 {stat.expandable && (
                   <DownOutlined className={`ml-auto text-slate-300 text-xs transition-transform duration-200 ${expandedCardIdx === idx ? 'rotate-180' : ''}`} />
                 )}
              </div>
              <div className="text-4xl font-bold text-slate-800 tracking-tight">
                {stat.value}
              </div>
              <div className="flex flex-col gap-1 mt-2">
                {(stat.subtitles || []).map((line, i) => (
                  <div key={i} className="text-sm font-medium text-slate-500 bg-slate-50 self-start px-2 py-1 rounded">
                    {line}
                  </div>
                ))}
              </div>
              {stat.expandable && expandedCardIdx === idx && (stat.expandContent || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                  {stat.expandContent.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 truncate mr-2">{item.label}</span>
                      <span className="font-semibold text-slate-700 whitespace-nowrap">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
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
          <ChartCard title="Top Staff by Commission Earned" isLoading={loading}>
            {instructorData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={instructorData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tickFormatter={(v) => `${currencySymbol}${v}`} stroke="#6b7280" />
                  <YAxis type="category" dataKey="name" width={120} stroke="#6b7280" />
                  <RechartsTooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="revenue" fill="#10b981" name="Commission" />
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

// Phase 2: Revenue Breakdown Row
const RevenueBreakdownRow = memo(({ isVisible, kpis, loading, currencySymbol, onShowModal }) => {
  if (!isVisible) return null;

  return (
    <Row gutter={[24, 24]}>
    </Row>
  );
});
RevenueBreakdownRow.displayName = 'RevenueBreakdownRow';

// Phase 2: Operational Status Row
const OperationalStatusRow = memo(({ isVisible, operationalKpis, kpis, loading, currencySymbol }) => {
  if (!isVisible) return null;

  const gross = operationalKpis.grossLessonRevenue || 0;
  const commissions = operationalKpis.instructorCommissions || 0;
  // Lessons-only manager commission (was: full cross-source-type total, which made
  // shop/rental/etc. commissions deflate the lesson Net Revenue KPI).
  const managerCommission = Number(kpis?.managerCommissionByService?.booking) || 0;
  const net = gross - commissions - managerCommission;

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} sm={6}>
        <KpiCard
          title="Gross Lessons"
          value={gross}
          prefix={currencySymbol}
          precision={2}
          color="#10b981"
          note="Revenue from completed lessons"
          isLoading={loading}
        />
      </Col>
      <Col xs={24} sm={6}>
        <KpiCard
          title="Instructor Payouts"
          value={commissions}
          prefix={currencySymbol}
          precision={2}
          color="#f59e0b"
          note="Commissions owed to instructors"
          isLoading={loading}
        />
      </Col>
      <Col xs={24} sm={6}>
        <KpiCard
          title="Manager Comm. · Lessons"
          value={managerCommission}
          prefix={currencySymbol}
          precision={2}
          color="#e11d48"
          note="Lessons-only — rentals shown separately"
          isLoading={loading}
        />
      </Col>
      <Col xs={24} sm={6}>
        <KpiCard
          title="Net Lesson Revenue"
          value={net}
          prefix={currencySymbol}
          precision={2}
          color={net >= 0 ? '#3b82f6' : '#ef4444'}
          note="Gross − instructor − manager (lessons)"
          isLoading={loading}
        />
      </Col>
    </Row>
  );
});
OperationalStatusRow.displayName = 'OperationalStatusRow';

const RentalRevenueRow = memo(({ isVisible, operationalKpis, kpis, loading, currencySymbol }) => {
  if (!isVisible) return null;

  const grossRental = operationalKpis.grossRentalRevenue || 0;
  const managerRentalCommission = Number(kpis?.managerCommissionByService?.rental) || 0;
  const netRental = grossRental - managerRentalCommission;

  return (
    <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
      <Col xs={24} sm={8}>
        <KpiCard
          title="Gross Rentals"
          value={grossRental}
          prefix={currencySymbol}
          precision={2}
          color="#8b5cf6"
          note="Total rental services sold"
          isLoading={loading}
        />
      </Col>
      <Col xs={24} sm={8}>
        <KpiCard
          title="Manager Comm. · Rentals"
          value={managerRentalCommission}
          prefix={currencySymbol}
          precision={2}
          color="#e11d48"
          note="Manager share of rental revenue"
          isLoading={loading}
        />
      </Col>
      <Col xs={24} sm={8}>
        <KpiCard
          title="Net Rental Revenue"
          value={netRental}
          prefix={currencySymbol}
          precision={2}
          color={netRental >= 0 ? '#3b82f6' : '#ef4444'}
          note="Gross rentals − manager (rentals)"
          isLoading={loading}
        />
      </Col>
    </Row>
  );
});
RentalRevenueRow.displayName = 'RentalRevenueRow';

// Phase 2: People Row
const PeopleRow = memo(({ isVisible, operationalKpis, loading }) => {
  if (!isVisible) return null;

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} sm={12} lg={8}>
        <KpiCard
          title="Total Customers"
          value={operationalKpis.totalCustomers}
          color="#6366f1"
          isLoading={loading}
        />
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <KpiCard
          title="Students"
          value={operationalKpis.students}
          color="#3b82f6"
          isLoading={loading}
        />
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <KpiCard
          title="Instructors"
          value={operationalKpis.instructors}
          color="#10b981"
          isLoading={loading}
        />
      </Col>
    </Row>
  );
});
PeopleRow.displayName = 'PeopleRow';

const DashboardBody = memo(({
  dateRange,
  onDateChange,
  onDatePresetChange,
  activePreset,
  customizeMode,
  onCustomizeToggle,
  visibleWidgets,
  onWidgetVisibilityChange,
  loading,
  kpis,
  operationalKpis,
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
        operationalKpis={operationalKpis || {}}
        onDateChange={onDateChange}
        onDatePresetChange={onDatePresetChange}
        activePreset={activePreset}
        customizeMode={customizeMode}
        onCustomizeToggle={onCustomizeToggle}
        currencySymbol={currencySymbol}
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

        <RevenueBreakdownRow
          isVisible={visibleWidgets.revenueBreakdown}
          kpis={kpis}
          loading={loading}
          currencySymbol={currencySymbol}
          onShowModal={onShowModal}
        />

        <OperationalStatusRow
          isVisible={visibleWidgets.operationalStatus}
          operationalKpis={operationalKpis}
          kpis={kpis}
          loading={loading}
          currencySymbol={currencySymbol}
        />

        <RentalRevenueRow
          isVisible={visibleWidgets.operationalStatus}
          operationalKpis={operationalKpis}
          kpis={kpis}
          loading={loading}
          currencySymbol={currencySymbol}
        />

        <PeopleRow
          isVisible={visibleWidgets.people}
          operationalKpis={operationalKpis}
          loading={loading}
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

export default function AdminDashboard() {
  usePageSEO({
    title: 'Admin Dashboard | Plannivo',
    description: 'High-level overview of lessons, rentals, finances, and operational KPIs.',
    path: '/admin/dashboard'
  });

  const { businessCurrency, currencySymbol } = useCurrency();

  const {
    dateRange,
    setDateRange,
    activePreset,
    setActivePreset,
    loading,
    error,
    kpis,
    operationalKpis,
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
    let startDate;
    let endDate;

    if (preset === 'today') {
        startDate = moment();
        endDate = moment();
    } else if (preset === 'week') {
      startDate = moment().startOf('week');
      endDate = moment().endOf('week');
    } else if (preset === 'month') {
      startDate = moment().startOf('month');
      endDate = moment().endOf('month');
    } else if (preset === 'year') {
      startDate = moment().startOf('year');
      endDate = moment().endOf('year');
    } else {
      return;
    }

    setActivePreset(preset);
    setDateRange({
      startDate: startDate.format('YYYY-MM-DD'),
      endDate: endDate.format('YYYY-MM-DD'),
    });
  }, [setDateRange, setActivePreset]);

  const handleDateRangeChange = useCallback((type, value) => {
    setActivePreset('custom');
    setDateRange(prev => ({
      ...prev,
      [type === 'start' ? 'startDate' : 'endDate']: value,
    }));
  }, [setDateRange, setActivePreset]);

  const handleCustomizeToggle = useCallback(() => {
    setCustomizeMode(prev => !prev);
  }, []);

  // Only show full-screen spinner on very first load (no data yet)
  const hasAnyData = kpis.completedBookings || kpis.totalRevenue || operationalKpis.totalCustomers;
  if (loading && !hasAnyData) {
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
        <div className="absolute top-0 left-0 w-96 h-96 bg-sky-200/30 rounded-full filter blur-3xl opacity-50" />
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-indigo-200/30 rounded-full filter blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-pink-200/30 rounded-full filter blur-3xl opacity-50" />
      </div>

      <div className={`transition-opacity duration-200 ${loading && hasAnyData ? 'opacity-50 pointer-events-none' : ''}`}>
        <DashboardBody
          dateRange={dateRange}
          onDateChange={handleDateRangeChange}
          onDatePresetChange={setDateRangePreset}
          activePreset={activePreset}
          customizeMode={customizeMode}
          onCustomizeToggle={handleCustomizeToggle}
          visibleWidgets={visibleWidgets}
          onWidgetVisibilityChange={handleWidgetVisibilityChange}
          loading={loading}
          kpis={kpis}
          operationalKpis={operationalKpis}
          trendData={trendData}
          instructorData={instructorData}
          onShowModal={handleShowModal}
          currencySymbol={currencySymbol || (businessCurrency === 'TRY' ? '₺' : '€')}
        />
      </div>
      {loading && hasAnyData && (
        <div className="fixed top-4 right-4 z-50 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
          <Spin size="small" />
          <span className="text-sm text-slate-600">Updating...</span>
        </div>
      )}

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
