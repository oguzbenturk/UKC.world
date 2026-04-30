// src/features/manager/pages/ManagerHomeDashboard.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spin, Tag, Row, Col, Empty } from 'antd';
import {
  DollarOutlined, RiseOutlined, FallOutlined, CalendarOutlined,
  PlusCircleOutlined, ShopOutlined, TeamOutlined, AppstoreOutlined,
  ArrowRightOutlined, ThunderboltOutlined, ToolOutlined,
} from '@ant-design/icons';
import { message } from '@/shared/utils/antdStatic';
import { getManagerDashboard } from '../services/managerCommissionApi';
import { formatCurrency } from '@/shared/utils/formatters';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import KpiCard from '@/features/dashboard/components/KpiCard';
import StatBox from '../components/finance/StatBox';

function QuickLink({ to, icon, label, accent = 'sky' }) {
  const colorMap = {
    sky: 'hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50',
    emerald: 'hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50',
    violet: 'hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50',
    amber: 'hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50',
    rose: 'hover:border-rose-400 hover:text-rose-600 hover:bg-rose-50',
    indigo: 'hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50',
  };
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-600 transition-colors ${colorMap[accent] || colorMap.sky}`}
    >
      {icon}
      {label}
    </Link>
  );
}

function SectionCard({ title, icon, children, action }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 m-0">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function ManagerHomeDashboard() {
  const { t } = useTranslation(['manager']);
  const { businessCurrency, getCurrencySymbol } = useCurrency();
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [earnings, setEarnings] = useState(null);

  const fetchEarnings = useCallback(async () => {
    setEarningsLoading(true);
    try {
      const response = await getManagerDashboard();
      if (response.success) setEarnings(response.data);
    } catch (error) {
      message.error(error.message || t('manager:errors.loadFailed'));
    } finally {
      setEarningsLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchEarnings(); }, [fetchEarnings]);

  const {
    loading: opsLoading,
    kpis,
    operationalKpis,
  } = useDashboardData();

  const symbol = getCurrencySymbol(businessCurrency || 'EUR');

  const { currentPeriod, previousPeriod, yearToDate, comparison } = earnings || {};
  const changePercent = parseFloat(comparison?.earningsChangePercent) || 0;
  const isUp = changePercent >= 0;

  const lowStock = useMemo(() => {
    const total = operationalKpis?.equipmentTotal || 0;
    const needsService = operationalKpis?.equipmentNeedsService || 0;
    const unavailable = operationalKpis?.equipmentUnavailable || 0;
    return { total, needsService, unavailable };
  }, [operationalKpis]);

  if (earningsLoading && !earnings) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-sky-200/30 rounded-full filter blur-3xl opacity-50" />
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-indigo-200/30 rounded-full filter blur-3xl opacity-50" />
      </div>

      <div className="relative px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight m-0">
              {t('manager:home.title', 'Manager Home')}
            </h1>
            <p className="text-sm text-slate-500 mt-1 m-0">
              {t('manager:home.subtitle', 'Run your academy and track your earnings.')}
            </p>
          </div>
        </div>

        {/* Personal Earnings — Top */}
        <SectionCard
          title={t('manager:home.earnings.title', 'My Earnings')}
          icon={<DollarOutlined className="text-green-500" />}
          action={
            <Link
              to="/manager/finance/earnings"
              className="text-xs font-medium text-sky-600 hover:text-sky-700 flex items-center gap-1"
            >
              {t('manager:home.earnings.viewDetails', 'View earnings details')} <ArrowRightOutlined />
            </Link>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatBox
              label={t('manager:dashboard.stats.thisMonth')}
              value={formatCurrency(currentPeriod?.totalEarned || 0, 'EUR')}
              sub={t('manager:dashboard.stats.bookingsRentals', {
                bookings: currentPeriod?.breakdown?.bookings?.count || 0,
                rentals: currentPeriod?.breakdown?.rentals?.count || 0,
              })}
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
              sub={`${t('manager:detailPanel.profile.paid', 'Paid')}: ${formatCurrency(yearToDate?.paid?.amount || 0, 'EUR')}`}
              color="text-blue-600"
              border="border-blue-100"
            />
            <div className={`rounded-xl border ${isUp ? 'border-green-100' : 'border-red-100'} bg-white p-4 min-w-0 shadow-sm`}>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                {t('manager:dashboard.stats.vsLastMonth')}
              </div>
              <div className={`text-xl font-bold flex items-center gap-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                {isUp ? <RiseOutlined /> : <FallOutlined />}
                {isUp ? '+' : ''}{changePercent.toFixed(1)}%
              </div>
              <div className="text-[11px] text-gray-400 mt-1 truncate">
                {t('manager:dashboard.stats.prevMonth', { amount: formatCurrency(previousPeriod?.totalEarned || 0, 'EUR') })}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Quick Links */}
        <SectionCard
          title={t('manager:home.quickLinks.title', 'Quick Links')}
          icon={<ThunderboltOutlined className="text-amber-500" />}
        >
          <div className="flex flex-wrap gap-2">
            <QuickLink
              to="/bookings"
              icon={<PlusCircleOutlined />}
              label={t('manager:home.quickLinks.createBooking', 'Create Booking')}
              accent="sky"
            />
            <QuickLink
              to="/calendars/lessons"
              icon={<CalendarOutlined />}
              label={t('manager:home.quickLinks.viewCalendar', 'View Calendar')}
              accent="emerald"
            />
            <QuickLink
              to="/manager/finance/earnings"
              icon={<DollarOutlined />}
              label={t('manager:home.quickLinks.myEarnings', 'My Earnings')}
              accent="violet"
            />
            <QuickLink
              to="/manager/finance/upcoming"
              icon={<RiseOutlined />}
              label={t('manager:home.quickLinks.upcomingIncome', 'Upcoming Income')}
              accent="amber"
            />
            <QuickLink
              to="/customers"
              icon={<TeamOutlined />}
              label={t('manager:home.quickLinks.customers', 'Customers')}
              accent="rose"
            />
            <QuickLink
              to="/inventory"
              icon={<AppstoreOutlined />}
              label={t('manager:home.quickLinks.inventory', 'Inventory')}
              accent="indigo"
            />
          </div>
        </SectionCard>

        {/* Operational — Academy at a glance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight m-0 flex items-center gap-2">
              <ShopOutlined className="text-sky-500" />
              {t('manager:home.operational.title', 'Academy at a Glance')}
            </h2>
            <Link
              to="/admin/dashboard"
              className="text-xs font-medium text-sky-600 hover:text-sky-700 flex items-center gap-1"
            >
              {t('manager:home.operational.fullDashboard', 'Full dashboard')} <ArrowRightOutlined />
            </Link>
          </div>
        </div>

        {/* People & customers */}
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.totalCustomers', 'Total Customers')}
              value={operationalKpis?.totalCustomers || 0}
              color="#6366f1"
              isLoading={opsLoading}
              note={t('manager:home.kpi.newThisMonth', '{{count}} new this month', { count: operationalKpis?.newThisMonth || 0 })}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.students', 'Students')}
              value={operationalKpis?.students || 0}
              color="#3b82f6"
              isLoading={opsLoading}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.instructors', 'Instructors')}
              value={operationalKpis?.instructors || 0}
              color="#10b981"
              isLoading={opsLoading}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.shopCustomers', 'Shop Customers')}
              value={operationalKpis?.shopCustomers || 0}
              color="#f97316"
              isLoading={opsLoading}
            />
          </Col>
        </Row>

        {/* Lessons / Bookings */}
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.upcomingBookings', 'Upcoming Bookings')}
              value={operationalKpis?.upcomingBookings || 0}
              color="#0ea5e9"
              isLoading={opsLoading}
              note={t('manager:home.kpi.activeNow', '{{count}} active now', { count: operationalKpis?.activeBookings || 0 })}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.completedHours', 'Completed Hours')}
              value={(operationalKpis?.completedHours || 0).toFixed(0)}
              color="#22c55e"
              isLoading={opsLoading}
              note={kpis?.completedBookings ? t('manager:home.kpi.completedBookings', '{{count}} bookings done', { count: kpis.completedBookings }) : null}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.activeRentals', 'Active Rentals')}
              value={operationalKpis?.activeRentals || 0}
              color="#8b5cf6"
              isLoading={opsLoading}
              note={t('manager:home.kpi.upcomingRentals', '{{count}} upcoming', { count: operationalKpis?.upcomingRentals || 0 })}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.totalRentals', 'Total Rentals')}
              value={operationalKpis?.totalRentals || 0}
              color="#a855f7"
              isLoading={opsLoading}
            />
          </Col>
        </Row>

        {/* Revenue snapshot */}
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.grossLessons', 'Gross Lessons')}
              value={operationalKpis?.grossLessonRevenue || 0}
              prefix={symbol}
              precision={2}
              color="#10b981"
              isLoading={opsLoading}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.grossRentals', 'Gross Rentals')}
              value={operationalKpis?.grossRentalRevenue || 0}
              prefix={symbol}
              precision={2}
              color="#8b5cf6"
              isLoading={opsLoading}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.netRevenue', 'Net Revenue')}
              value={operationalKpis?.netRevenue || 0}
              prefix={symbol}
              precision={2}
              color="#3b82f6"
              isLoading={opsLoading}
              note={t('manager:home.kpi.afterCommissions', 'After commissions')}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.outstandingDebt', 'Outstanding Debt')}
              value={kpis?.totalCustomerDebt || 0}
              prefix={symbol}
              precision={2}
              color="#ef4444"
              isLoading={opsLoading}
              note={t('manager:home.kpi.customersOwing', '{{count}} customers', { count: kpis?.customersWithDebt || 0 })}
            />
          </Col>
        </Row>

        {/* Accommodation + Memberships */}
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.accommodationBookings', 'Accommodation')}
              value={operationalKpis?.accommodationTotalBookings || 0}
              color="#f59e0b"
              isLoading={opsLoading}
              note={t('manager:home.kpi.totalNights', '{{count}} nights', { count: operationalKpis?.accommodationTotalNights || 0 })}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.activeMembers', 'Active Members')}
              value={operationalKpis?.membershipTotal || 0}
              color="#ec4899"
              isLoading={opsLoading}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.totalServices', 'Services')}
              value={operationalKpis?.totalServices || 0}
              color="#06b6d4"
              isLoading={opsLoading}
              note={t('manager:home.kpi.categories', '{{count}} categories', { count: operationalKpis?.serviceCategories || 0 })}
            />
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <KpiCard
              title={t('manager:home.kpi.transactions', 'Transactions')}
              value={operationalKpis?.transactions || 0}
              color="#64748b"
              isLoading={opsLoading}
            />
          </Col>
        </Row>

        {/* Inventory health */}
        <SectionCard
          title={t('manager:home.inventory.title', 'Inventory Health')}
          icon={<ToolOutlined className="text-orange-500" />}
          action={
            <Link
              to="/equipment"
              className="text-xs font-medium text-sky-600 hover:text-sky-700 flex items-center gap-1"
            >
              {t('manager:home.inventory.manage', 'Manage equipment')} <ArrowRightOutlined />
            </Link>
          }
        >
          {opsLoading ? (
            <div className="flex justify-center py-6"><Spin /></div>
          ) : lowStock.total === 0 ? (
            <Empty description={t('manager:home.inventory.empty', 'No equipment tracked')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox
                label={t('manager:home.inventory.total', 'Total')}
                value={lowStock.total}
                color="text-slate-700"
                border="border-slate-100"
              />
              <StatBox
                label={t('manager:home.inventory.available', 'Available')}
                value={operationalKpis?.equipmentAvailable || 0}
                color="text-green-600"
                border="border-green-100"
              />
              <StatBox
                label={t('manager:home.inventory.unavailable', 'Unavailable')}
                value={lowStock.unavailable}
                color="text-amber-600"
                border="border-amber-100"
              />
              <StatBox
                label={t('manager:home.inventory.needsService', 'Needs Service')}
                value={lowStock.needsService}
                color={lowStock.needsService > 0 ? 'text-red-600' : 'text-slate-700'}
                border={lowStock.needsService > 0 ? 'border-red-100' : 'border-slate-100'}
              />
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
