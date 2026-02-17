// src/features/dashboard/hooks/useDashboardData.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import moment from 'moment';
import FinancialAnalyticsService from '@/features/finances/services/financialAnalytics';

const number = (v) => Number(v || 0);

export const useDashboardData = () => {
  const [dateRange, setDateRange] = useState({
    startDate: moment().subtract(30, 'days').format('YYYY-MM-DD'),
    endDate: moment().format('YYYY-MM-DD')
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [ops, setOps] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, analyticsRes, opsRes] = await Promise.all([
        FinancialAnalyticsService.getFinancialSummary(dateRange.startDate, dateRange.endDate),
        FinancialAnalyticsService.getRevenueAnalytics(dateRange.startDate, dateRange.endDate, 'day'),
        FinancialAnalyticsService.getOperationalMetrics(dateRange.startDate, dateRange.endDate)
      ]);
      setSummary(summaryRes);
      setAnalytics(analyticsRes);
      setOps(opsRes);
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

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
    loading,
    error,
    kpis,
    trendData,
    instructorData,
    fetchAll,
  };
};
