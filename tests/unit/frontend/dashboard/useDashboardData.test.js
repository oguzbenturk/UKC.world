import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import moment from 'moment';

// --- Mocks ---
const mockGetFinancialSummary = vi.fn();
const mockGetRevenueAnalytics = vi.fn();
const mockGetOperationalMetrics = vi.fn();
const mockApiGet = vi.fn();

vi.mock('@/shared/services/apiClient', () => ({
  default: { get: (...args) => mockApiGet(...args) },
}));

vi.mock('@/features/finances/services/financialAnalytics', () => ({
  default: {
    getFinancialSummary: (...args) => mockGetFinancialSummary(...args),
    getRevenueAnalytics: (...args) => mockGetRevenueAnalytics(...args),
    getOperationalMetrics: (...args) => mockGetOperationalMetrics(...args),
  },
}));

import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

const makeSummaryResponse = (overrides = {}) => ({
  revenue: { total_revenue: 5000, lesson_revenue: 3000, rental_revenue: 1800, other_revenue: 200, total_refunds: 100 },
  balances: { customers_with_debt: 2, total_customer_debt: 150 },
  bookings: { total_bookings: 50, completed_bookings: 40, booking_revenue: 3000 },
  ...overrides,
});

const makeDashboardSummary = (overrides = {}) => ({
  lessons: { upcoming: 5, active: 3, cancelled: 1, completedHours: 80, categoryBreakdown: [{ category: 'kitesurfing', hours: '60', count: '25' }] },
  rentals: { active: 4, upcoming: 2, total: 10, serviceBreakdown: [{ segment: 'dlab', serviceName: 'Half Day DLab', count: 2 }] },
  equipment: { total: 30, available: 25, unavailable: 3, needsService: 2 },
  customers: { totalUsers: 100, students: 70, instructors: 8, staff: 3, newThisMonth: 5 },
  revenue: { net: 4500, income: 5000, expenses: 500, transactions: 120 },
  services: { total: 15, categories: 3, groupServices: 5, privateServices: 10 },
  shopCustomers: { total: 15 },
  ...overrides,
});

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFinancialSummary.mockResolvedValue(makeSummaryResponse());
    mockGetRevenueAnalytics.mockResolvedValue({ trends: [{ period: '2025-01', revenue: 2000, transaction_count: 15 }] });
    mockGetOperationalMetrics.mockResolvedValue({ rentalMetrics: [{ metric_type: 'rental_analysis', completed_rentals: 20 }], instructorMetrics: [] });
    mockApiGet.mockResolvedValue({ data: makeDashboardSummary() });
  });

  it('defaults dateRange to start of year through today', () => {
    const { result } = renderHook(() => useDashboardData());
    const today = moment().format('YYYY-MM-DD');
    const yearStart = moment().startOf('year').format('YYYY-MM-DD');
    expect(result.current.dateRange.startDate).toBe(yearStart);
    expect(result.current.dateRange.endDate).toBe(today);
  });

  it('defaults activePreset to "year"', () => {
    const { result } = renderHook(() => useDashboardData());
    expect(result.current.activePreset).toBe('year');
  });

  it('fetches data on mount and populates kpis', async () => {
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kpis.totalRevenue).toBe(5000);
    expect(result.current.kpis.completedBookings).toBe(40);
    expect(result.current.kpis.avgBookingValue).toBe(75); // 3000 / 40
    expect(result.current.kpis.customersWithDebt).toBe(2);
  });

  it('populates operationalKpis from dashboard summary', async () => {
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const op = result.current.operationalKpis;
    expect(op.upcomingBookings).toBe(5);
    expect(op.activeRentals).toBe(4);
    expect(op.completedHours).toBe(80);
    expect(op.totalRentals).toBe(10);
    expect(op.equipmentNeedsService).toBe(2);
    expect(op.students).toBe(70);
    expect(op.shopCustomers).toBe(15);
  });

  it('exposes lessonCategoryBreakdown as array', async () => {
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const breakdown = result.current.operationalKpis.lessonCategoryBreakdown;
    expect(Array.isArray(breakdown)).toBe(true);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].category).toBe('kitesurfing');
  });

  it('exposes rentalServiceBreakdown as array', async () => {
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const breakdown = result.current.operationalKpis.rentalServiceBreakdown;
    expect(Array.isArray(breakdown)).toBe(true);
    expect(breakdown[0].serviceName).toBe('Half Day DLab');
  });

  it('falls back gracefully when dashboard summary API fails', async () => {
    mockApiGet.mockRejectedValue(new Error('500'));

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should still have finance kpis
    expect(result.current.kpis.totalRevenue).toBe(5000);
    // Operational kpis default to 0 / empty
    expect(result.current.operationalKpis.activeRentals).toBe(0);
    expect(result.current.operationalKpis.lessonCategoryBreakdown).toEqual([]);
  });

  it('uses month groupBy when range exceeds 90 days', async () => {
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Calculate expected groupBy based on current date
    const jan1 = new Date(`${new Date().getFullYear()}-01-01`);
    const today = new Date();
    const daysDiff = Math.floor((today - jan1) / (1000 * 60 * 60 * 24));
    const expectedGroupBy = daysDiff > 90 ? 'month' : 'day';
    expect(result.current.groupBy).toBe(expectedGroupBy);
  });

  it('transforms trendData correctly', async () => {
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trendData).toHaveLength(1);
    expect(result.current.trendData[0]).toEqual({ period: '2025-01', revenue: 2000, transactionCount: 15 });
  });

  it('sets error when all APIs fail', async () => {
    mockGetFinancialSummary.mockRejectedValue(new Error('fail'));
    mockGetRevenueAnalytics.mockRejectedValue(new Error('fail'));
    mockGetOperationalMetrics.mockRejectedValue(new Error('fail'));
    mockApiGet.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Failed to load dashboard data');
  });
});
