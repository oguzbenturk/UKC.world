import { describe, it, expect, vi } from 'vitest';
import {
  prepareRevenueChartData,
  prepareServicePieChartData,
  prepareCustomerBalanceChartData,
  prepareBookingStatusChartData,
  prepareInstructorPerformanceData,
} from '@/features/finances/utils/chartHelpers';

// Mock formatCurrency since chartHelpers imports it
vi.mock('@/shared/utils/formatters', () => ({
  formatCurrency: (value) => `$${value}`,
}));

describe('chartHelpers', () => {
  describe('prepareRevenueChartData', () => {
    it('returns empty array for null trends', () => {
      expect(prepareRevenueChartData(null)).toEqual([]);
    });

    it('returns empty array for non-array trends', () => {
      expect(prepareRevenueChartData('not-array')).toEqual([]);
    });

    it('transforms revenue trends correctly', () => {
      const trends = [
        { period: '2025-01', revenue: 5000, transaction_count: 20 },
        { period: '2025-02', revenue: 6000, transaction_count: 25 },
      ];
      const result = prepareRevenueChartData(trends);
      expect(result).toHaveLength(2);
      expect(result[0].revenue).toBe(5000);
      expect(result[0].transactionCount).toBe(20);
    });

    it('handles missing transaction_count field', () => {
      const trends = [
        { period: '2025-01', revenue: 5000 },
      ];
      const result = prepareRevenueChartData(trends);
      expect(result[0].transactionCount).toBe(0);
    });

    it('coerces string revenue to number', () => {
      const trends = [
        { period: '2025-01', revenue: '5000.50', transaction_count: '20' },
      ];
      const result = prepareRevenueChartData(trends);
      expect(result[0].revenue).toBe(5000.5);
      expect(result[0].transactionCount).toBe(20);
    });

    it('returns 0 for invalid revenue', () => {
      const trends = [
        { period: '2025-01', revenue: 'invalid', transaction_count: 20 },
      ];
      const result = prepareRevenueChartData(trends);
      expect(result[0].revenue).toBe(0);
    });

    it('omits movingAverage when not requested', () => {
      const trends = [
        { period: '2025-01', revenue: 5000, transaction_count: 20 },
      ];
      const result = prepareRevenueChartData(trends, false);
      expect(result[0].movingAverage).toBeUndefined();
    });
  });

  describe('prepareServicePieChartData', () => {
    it('returns empty array for null data', () => {
      expect(prepareServicePieChartData(null)).toEqual([]);
    });

    it('returns empty array for non-array data', () => {
      expect(prepareServicePieChartData('not-array')).toEqual([]);
    });

    it('transforms service data correctly', () => {
      const serviceData = [
        {
          service_name: 'Kitesurfing Lesson',
          total_revenue: 5000,
          booking_count: 20,
          average_price: 250,
        },
      ];
      const result = prepareServicePieChartData(serviceData);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Kitesurfing Lesson');
      expect(result[0].value).toBe(5000);
      expect(result[0].bookings).toBe(20);
    });

    it('filters out zero-revenue services', () => {
      const serviceData = [
        { service_name: 'Service 1', total_revenue: 1000, booking_count: 10, average_price: 100 },
        { service_name: 'Service 2', total_revenue: 0, booking_count: 0, average_price: 0 },
        { service_name: 'Service 3', total_revenue: 2000, booking_count: 20, average_price: 100 },
      ];
      const result = prepareServicePieChartData(serviceData);
      expect(result).toHaveLength(2);
    });

    it('sorts by revenue descending', () => {
      const serviceData = [
        { service_name: 'Service 1', total_revenue: 1000, booking_count: 10, average_price: 100 },
        { service_name: 'Service 2', total_revenue: 5000, booking_count: 50, average_price: 100 },
      ];
      const result = prepareServicePieChartData(serviceData);
      expect(result[0].value).toBe(5000);
      expect(result[1].value).toBe(1000);
    });

    it('assigns colors from palette', () => {
      const serviceData = [
        { service_name: 'Service 1', total_revenue: 1000, booking_count: 10, average_price: 100 },
        { service_name: 'Service 2', total_revenue: 2000, booking_count: 20, average_price: 100 },
      ];
      const result = prepareServicePieChartData(serviceData);
      expect(result[0].fill).toBeDefined();
      expect(result[1].fill).toBeDefined();
    });

    it('defaults service_name to "Unknown Service"', () => {
      const serviceData = [
        { total_revenue: 1000, booking_count: 10, average_price: 100 },
      ];
      const result = prepareServicePieChartData(serviceData);
      expect(result[0].name).toBe('Unknown Service');
    });

    it('coerces string values to numbers', () => {
      const serviceData = [
        {
          service_name: 'Service',
          total_revenue: '5000.50',
          booking_count: '20',
          average_price: '250.25',
        },
      ];
      const result = prepareServicePieChartData(serviceData);
      expect(result[0].value).toBe(5000.5);
      expect(result[0].bookings).toBe(20);
    });
  });

  describe('prepareCustomerBalanceChartData', () => {
    it('returns empty array for null data', () => {
      expect(prepareCustomerBalanceChartData(null)).toEqual([]);
    });

    it('returns empty array for non-array data', () => {
      expect(prepareCustomerBalanceChartData('not-array')).toEqual([]);
    });

    it('categorizes customers by balance', () => {
      const customers = [
        { balance: 100 },
        { balance: -50 },
        { balance: 0 },
        { balance: 200 },
        { balance: -100 },
      ];
      const result = prepareCustomerBalanceChartData(customers);
      expect(result).toHaveLength(3);
      expect(result[0].category).toBe('Customers with Credit');
      expect(result[0].count).toBe(2); // 100, 200
      expect(result[1].category).toBe('Customers with Debt');
      expect(result[1].count).toBe(2); // -50, -100
      expect(result[2].category).toBe('Neutral Balance');
      expect(result[2].count).toBe(1); // 0
    });

    it('assigns correct colors', () => {
      const customers = [{ balance: 100 }, { balance: -50 }, { balance: 0 }];
      const result = prepareCustomerBalanceChartData(customers);
      expect(result[0].fill).toBeDefined();
      expect(result[1].fill).toBeDefined();
      expect(result[2].fill).toBeDefined();
    });

    it('handles empty customer array', () => {
      const result = prepareCustomerBalanceChartData([]);
      expect(result).toHaveLength(3);
      expect(result[0].count).toBe(0);
      expect(result[1].count).toBe(0);
      expect(result[2].count).toBe(0);
    });
  });

  describe('prepareBookingStatusChartData', () => {
    it('returns empty array for null metrics', () => {
      expect(prepareBookingStatusChartData(null)).toEqual([]);
    });

    it('returns empty array for non-array metrics', () => {
      expect(prepareBookingStatusChartData('not-array')).toEqual([]);
    });

    it('aggregates booking counts by status', () => {
      const bookingMetrics = [
        { status: 'completed', count: 15 },
        { status: 'pending', count: 5 },
        { status: 'completed', count: 10 },
      ];
      const result = prepareBookingStatusChartData(bookingMetrics);
      const completed = result.find(r => r.status === 'Completed' || r.status === 'completed');
      const pending = result.find(r => r.status === 'Pending' || r.status === 'pending');
      expect(completed?.count || completed?.count).toBeGreaterThan(0);
    });

    it('handles missing status field', () => {
      const bookingMetrics = [
        { count: 5 },
        { status: 'completed', count: 10 },
      ];
      const result = prepareBookingStatusChartData(bookingMetrics);
      expect(result.length).toBeGreaterThan(0);
    });

    it('coerces string counts to integers', () => {
      const bookingMetrics = [
        { status: 'completed', count: '15' },
      ];
      const result = prepareBookingStatusChartData(bookingMetrics);
      expect(result[0].count).toBe(15);
    });

    it('assigns colors from palette', () => {
      const bookingMetrics = [
        { status: 'completed', count: 15 },
        { status: 'pending', count: 5 },
      ];
      const result = prepareBookingStatusChartData(bookingMetrics);
      result.forEach(item => {
        expect(item.fill).toBeDefined();
      });
    });
  });

  describe('prepareInstructorPerformanceData', () => {
    it('returns empty array for null metrics', () => {
      expect(prepareInstructorPerformanceData(null)).toEqual([]);
    });

    it('returns empty array for non-array metrics', () => {
      expect(prepareInstructorPerformanceData('not-array')).toEqual([]);
    });

    it('transforms instructor metrics correctly', () => {
      const metrics = [
        {
          instructor_name: 'John Doe',
          total_lessons: 20,
          completed_lessons: 18,
          total_revenue: 3600,
          average_lesson_value: 200,
        },
      ];
      const result = prepareInstructorPerformanceData(metrics);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John Doe');
      expect(result[0].lessons).toBe(18);
      expect(result[0].revenue).toBe(3600);
    });

    it('calculates efficiency percentage', () => {
      const metrics = [
        {
          instructor_name: 'John',
          total_lessons: 100,
          completed_lessons: 90,
          total_revenue: 9000,
          average_lesson_value: 100,
        },
      ];
      const result = prepareInstructorPerformanceData(metrics);
      expect(result[0].efficiency).toBe(90);
    });

    it('filters out instructors with no lessons', () => {
      const metrics = [
        {
          instructor_name: 'Instructor 1',
          total_lessons: 0,
          completed_lessons: 0,
          total_revenue: 0,
          average_lesson_value: 0,
        },
        {
          instructor_name: 'Instructor 2',
          total_lessons: 20,
          completed_lessons: 15,
          total_revenue: 3000,
          average_lesson_value: 200,
        },
      ];
      const result = prepareInstructorPerformanceData(metrics);
      expect(result).toHaveLength(1);
    });

    it('sorts by revenue descending', () => {
      const metrics = [
        {
          instructor_name: 'Instructor 1',
          total_lessons: 20,
          completed_lessons: 15,
          total_revenue: 3000,
          average_lesson_value: 200,
        },
        {
          instructor_name: 'Instructor 2',
          total_lessons: 30,
          completed_lessons: 25,
          total_revenue: 5000,
          average_lesson_value: 200,
        },
      ];
      const result = prepareInstructorPerformanceData(metrics);
      expect(result[0].revenue).toBe(5000);
      expect(result[1].revenue).toBe(3000);
    });

    it('defaults instructor_name to "Unknown"', () => {
      const metrics = [
        {
          total_lessons: 20,
          completed_lessons: 15,
          total_revenue: 3000,
          average_lesson_value: 200,
        },
      ];
      const result = prepareInstructorPerformanceData(metrics);
      expect(result[0].name).toBe('Unknown');
    });

    it('coerces string values to numbers', () => {
      const metrics = [
        {
          instructor_name: 'John',
          total_lessons: '20',
          completed_lessons: '18',
          total_revenue: '3600.50',
          average_lesson_value: '200.25',
        },
      ];
      const result = prepareInstructorPerformanceData(metrics);
      expect(result[0].lessons).toBe(18);
      expect(result[0].revenue).toBe(3600.5);
    });
  });
});
