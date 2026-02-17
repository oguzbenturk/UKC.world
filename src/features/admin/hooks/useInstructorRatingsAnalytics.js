import { useMemo } from 'react';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { ratingsAdminApi } from '../api/ratingsAdminApi';
import FinancialAnalyticsService from '@/features/finances/services/financialAnalytics';

const accumulateServiceBreakdown = (target, breakdown) => {
  if (!breakdown) return;

  const entries = [
    ['lesson', breakdown.lesson],
    ['rental', breakdown.rental],
    ['accommodation', breakdown.accommodation]
  ];

  entries.forEach(([key, value]) => {
    if (!value) return;
    const count = Number(value.count) || 0;
    const average = Number(value.average) || 0;
    target[key].count += count;
    target[key].weighted += average * count;
  });
};

const accumulateStarBuckets = (buckets, distribution) => {
  if (!distribution) return;
  for (let star = 5; star >= 1; star -= 1) {
    const index = 5 - star;
    buckets[index] += Number(distribution[star]) || 0;
  }
};

const withinTimeRange = (dateString, timeRange) => {
  if (timeRange === 'all' || !dateString) {
    return true;
  }

  const now = dayjs();
  const candidate = dayjs(dateString);

  switch (timeRange) {
    case '7d':
      return candidate.isAfter(now.subtract(7, 'day'));
    case '30d':
      return candidate.isAfter(now.subtract(30, 'day'));
    case '90d':
      return candidate.isAfter(now.subtract(90, 'day'));
    default:
      return true;
  }
};

const matchesServiceType = (item, serviceType) => {
  if (serviceType === 'all') return true;
  const breakdown = item.breakdown?.[serviceType];
  return Boolean(breakdown?.count);
};

const sortInstructors = (items, sortBy) => {
  switch (sortBy) {
    case 'count':
      return [...items].sort((a, b) => (Number(b.totalRatings) || 0) - (Number(a.totalRatings) || 0));
    case 'recent':
      return [...items].sort((a, b) => {
        const aTime = a.lastRatingAt ? dayjs(a.lastRatingAt).valueOf() : 0;
        const bTime = b.lastRatingAt ? dayjs(b.lastRatingAt).valueOf() : 0;
        return bTime - aTime;
      });
    case 'average':
    default:
      return [...items].sort((a, b) => (Number(b.averageRating) || 0) - (Number(a.averageRating) || 0));
  }
};

const applyFilters = (items, filters) => {
  const { serviceType, timeRange, limit } = filters;
  const filtered = items.filter((item) =>
    matchesServiceType(item, serviceType) && withinTimeRange(item.lastRatingAt, timeRange)
  );
  const sorted = sortInstructors(filtered, filters.sortBy);
  return sorted.slice(0, Number(limit) || sorted.length);
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const defaultAggregated = {
  instructors: [],
  totals: {
    average: 0,
    totalRatings: 0,
    fiveStarShare: 0
  },
  starBuckets: [0, 0, 0, 0, 0],
  serviceBreakdown: {
    lesson: { count: 0, average: 0 },
    rental: { count: 0, average: 0 },
    accommodation: { count: 0, average: 0 }
  }
};

const defaultCrossMetrics = {
  totalRevenue: 0,
  avgBookingValue: 0,
  instructorUtilization: 0,
  equipmentUtilization: 0,
  conversionRate: 0
};

const resolveDateRange = (timeRange) => {
  const now = dayjs().endOf('day');
  let days;

  switch (timeRange) {
    case '7d':
      days = 7;
      break;
    case '30d':
      days = 30;
      break;
    case '90d':
      days = 90;
      break;
    case 'all':
    default:
      days = 180;
      break;
  }

  const start = now.clone().subtract(days, 'day').startOf('day');
  return {
    startDate: start.format('YYYY-MM-DD'),
    endDate: now.format('YYYY-MM-DD')
  };
};

const buildCrossMetrics = (summary, operational) => {
  const revenue = summary?.revenue || {};
  const bookings = summary?.bookings || {};
  const utilization = operational?.utilization || {};
  const efficiency = operational?.efficiency || {};

  const bookingRevenue = toNumber(bookings.booking_revenue);
  const completedBookings = toNumber(bookings.completed_bookings);
  const totalRevenue = toNumber(revenue.total_revenue);
  const instructorUtilization = toNumber(utilization.instructor_utilization);
  const equipmentUtilization = toNumber(utilization.equipment_utilization);
  const conversionRate = toNumber(efficiency.conversion_rate);

  return {
    totalRevenue,
    avgBookingValue: completedBookings ? bookingRevenue / completedBookings : 0,
    instructorUtilization,
    equipmentUtilization,
    conversionRate
  };
};

const queryKey = (filters) => ['admin', 'ratings', 'overview', filters];

export const useInstructorRatingsAnalytics = (filters, { autoRefresh = false, refetchIntervalMs = 60_000 } = {}) => {
  const requestFilters = useMemo(
    () => ({
      serviceType: filters.serviceType,
      sortBy: filters.sortBy,
      limit: filters.limit
    }),
    [filters.limit, filters.serviceType, filters.sortBy]
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: queryKey(requestFilters),
    queryFn: () => ratingsAdminApi.fetchOverview(requestFilters),
    keepPreviousData: true,
    staleTime: 2 * 60_000,
    refetchInterval: autoRefresh ? refetchIntervalMs : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false
  });

  const {
    data: metricsRaw,
    isLoading: isCrossMetricsLoading,
    error: crossMetricsError
  } = useQuery({
    queryKey: ['admin', 'ratings', 'cross-metrics', filters.timeRange],
    queryFn: async () => {
      const { startDate, endDate } = resolveDateRange(filters.timeRange);
      const [summary, operational] = await Promise.all([
        FinancialAnalyticsService.getFinancialSummary(startDate, endDate, 'all'),
        FinancialAnalyticsService.getOperationalMetrics(startDate, endDate)
      ]);
      return buildCrossMetrics(summary, operational);
    },
    staleTime: 2 * 60_000,
    refetchInterval: autoRefresh ? refetchIntervalMs : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false
  });

  const aggregated = useMemo(() => {
    if (!data?.length) {
      return defaultAggregated;
    }

    const filteredInstructors = applyFilters(data, filters);

    if (!filteredInstructors.length) {
      return defaultAggregated;
    }

    const totals = {
      totalRatings: 0,
      weightedSum: 0,
      fiveStarRatings: 0,
      service: {
        lesson: { count: 0, weighted: 0 },
        rental: { count: 0, weighted: 0 },
        accommodation: { count: 0, weighted: 0 }
      }
    };

    const starBuckets = [0, 0, 0, 0, 0];

    filteredInstructors.forEach((item) => {
      const totalRatings = Number(item.totalRatings) || 0;
      const averageRating = Number(item.averageRating) || 0;

      totals.totalRatings += totalRatings;
      totals.weightedSum += averageRating * totalRatings;
      totals.fiveStarRatings += Number(item.distribution?.[5]) || 0;

      accumulateServiceBreakdown(totals.service, item.breakdown);
      accumulateStarBuckets(starBuckets, item.distribution);
    });

    const serviceBreakdown = {
      lesson: {
        count: totals.service.lesson.count,
        average: totals.service.lesson.count ? totals.service.lesson.weighted / totals.service.lesson.count : 0
      },
      rental: {
        count: totals.service.rental.count,
        average: totals.service.rental.count ? totals.service.rental.weighted / totals.service.rental.count : 0
      },
      accommodation: {
        count: totals.service.accommodation.count,
        average: totals.service.accommodation.count
          ? totals.service.accommodation.weighted / totals.service.accommodation.count
          : 0
      }
    };

    return {
      instructors: filteredInstructors,
      totals: {
        totalRatings: totals.totalRatings,
        average: totals.totalRatings ? totals.weightedSum / totals.totalRatings : 0,
        fiveStarShare: totals.totalRatings ? (totals.fiveStarRatings / totals.totalRatings) * 100 : 0
      },
      starBuckets,
      serviceBreakdown
    };
  }, [data, filters]);

  return {
    data: aggregated,
    crossMetrics: metricsRaw ?? defaultCrossMetrics,
    isCrossMetricsLoading,
    crossMetricsError,
    isLoading,
    isFetching,
    error,
    refetch
  };
};
