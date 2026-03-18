// src/features/dashboard/hooks/useDashboardData.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import moment from 'moment';
import apiClient from '@/shared/services/apiClient';
import FinancialAnalyticsService from '@/features/finances/services/financialAnalytics';

const number = (v) => Number(v || 0);

export const useDashboardData = () => {
  const [dateRange, setDateRange] = useState({
    startDate: moment().startOf('year').format('YYYY-MM-DD'),
    endDate: moment().endOf('year').format('YYYY-MM-DD')
  });
  const [activePreset, setActivePreset] = useState('year');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [ops, setOps] = useState(null);
  const [dashboardSummary, setDashboardSummary] = useState(null);

  // Phase 3: smart groupBy — month for ranges > 90 days
  const groupBy = useMemo(() => {
    const start = moment(dateRange.startDate);
    const end = moment(dateRange.endDate);
    return end.diff(start, 'days') > 90 ? 'month' : 'day';
  }, [dateRange]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, analyticsRes, opsRes, dashSummaryRes] = await Promise.all([
        FinancialAnalyticsService.getFinancialSummary(dateRange.startDate, dateRange.endDate),
        FinancialAnalyticsService.getRevenueAnalytics(dateRange.startDate, dateRange.endDate, groupBy),
        FinancialAnalyticsService.getOperationalMetrics(dateRange.startDate, dateRange.endDate),
        apiClient.get('/dashboard/summary', { params: { startDate: dateRange.startDate, endDate: dateRange.endDate } })
          .then(r => r.data)
          .catch(() => null)
      ]);
      setSummary(summaryRes);
      setAnalytics(analyticsRes);
      setOps(opsRes);
      setDashboardSummary(dashSummaryRes);
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const kpis = useMemo(() => {
    const revenue = summary?.revenue || {};
    const balances = summary?.balances || {};
    const bookings = summary?.bookings || {};
    const rentalMetrics = Array.isArray(ops?.rentalMetrics) ? ops.rentalMetrics : [];
    const rentalOverview = rentalMetrics.find((metric) => metric.metric_type === 'rental_analysis') || rentalMetrics[0] || {};
    const totalRevenue = number(revenue.total_revenue);
    const lessonRevenue = number(revenue.lesson_revenue);
    const rentalRevenue = number(revenue.rental_revenue);
    const otherRevenue = number(revenue.other_revenue);
    const totalRefunds = number(revenue.total_refunds);

    const totalBookings = number(bookings.total_bookings);
    const completedBookings = number(bookings.completed_bookings);
    const bookingRevenue = number(bookings.booking_revenue);
    const avgBookingValue = completedBookings > 0 ? (bookingRevenue / completedBookings) : 0;
    const completedRentals = number(rentalOverview.completed_rentals ?? rentalOverview.total_completed ?? rentalOverview.total_rentals);

    const customersWithDebt = number(balances.customers_with_debt);
    const totalCustomerDebt = number(balances.total_customer_debt);

    return {
      totalRevenue,
      lessonRevenue,
      rentalRevenue,
      otherRevenue,
      totalRefunds,
      totalBookings,
      completedBookings,
      completedRentals,
      avgBookingValue,
      customersWithDebt,
      totalCustomerDebt
    };
  }, [summary, ops]);

  // Phase 2: operational KPIs from /api/dashboard/summary
  const operationalKpis = useMemo(() => {
    const ds = dashboardSummary || {};
    const lessons = ds.lessons || {};
    const rentals = ds.rentals || {};
    const equip = ds.equipment || {};
    const cust = ds.customers || {};
    const rev = ds.revenue || {};
    const svc = ds.services || {};

    return {
      upcomingBookings: number(lessons.upcoming),
      activeBookings: number(lessons.active),
      cancelledBookings: number(lessons.cancelled),
      activeRentals: number(rentals.active),
      upcomingRentals: number(rentals.upcoming),
      equipmentTotal: number(equip.total),
      equipmentAvailable: number(equip.available),
      equipmentUnavailable: number(equip.unavailable),
      equipmentNeedsService: number(equip.needsService),
      totalCustomers: number(cust.totalCustomers),
      students: number(cust.students),
      outsiders: number(cust.outsiders),
      trustedCustomers: number(cust.trustedCustomers),
      instructors: number(cust.instructors),
      staff: number(cust.staff),
      newThisMonth: number(cust.newThisMonth),
      netRevenue: number(rev.net),
      income: number(rev.income),
      expenses: number(rev.expenses),
      transactions: number(rev.transactions),
      instructorPayouts: number(rev.instructorPayouts),
      instructorCommissions: number(rev.instructorCommissions),
      grossLessonRevenue: number(rev.grossLessonRevenue),
      grossRentalRevenue: number(rentals.totalRevenue),
      paidRentalRevenue: number(rentals.paidRevenue),
      completedRentals: number(rentals.completed),
      totalServices: number(svc.total),
      serviceCategories: number(svc.categories),
      groupServices: number(svc.groupServices),
      privateServices: number(svc.privateServices),
      completedHours: number(lessons.completedHours),
      lessonCategoryBreakdown: Array.isArray(lessons.categoryBreakdown) ? lessons.categoryBreakdown : [],
      rentalServiceBreakdown: Array.isArray(rentals.serviceBreakdown) ? rentals.serviceBreakdown : [],
      totalRentals: number(rentals.total),
      accommodationTotalNights: number((ds.accommodation || {}).totalNights),
      accommodationTotalBookings: number((ds.accommodation || {}).totalBookings),
      accommodationUnitBreakdown: Array.isArray((ds.accommodation || {}).unitBreakdown) ? ds.accommodation.unitBreakdown : [],
      membershipTotal: number((ds.membership || {}).totalActive),
      membershipBreakdown: Array.isArray((ds.membership || {}).offeringBreakdown) ? ds.membership.offeringBreakdown : [],
      shopCustomers: number((ds.shopCustomers || {}).total),
    };
  }, [dashboardSummary]);

  const trendData = useMemo(() => {
    const trends = analytics?.trends || [];
    return trends.map(t => ({ period: t.period, revenue: number(t.revenue), transactionCount: number(t.transaction_count) }));
  }, [analytics]);

  const instructorData = useMemo(() => {
    const rows = ops?.instructorMetrics || [];
    return rows.slice(0, 5).map(r => ({ name: r.instructor_name, revenue: number(r.total_revenue) }));
  }, [ops]);

  return {
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
    groupBy,
    fetchAll,
  };
};
