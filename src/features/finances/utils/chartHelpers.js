// src/features/finances/utils/chartHelpers.js
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * Chart Helper Utilities
 * Functions to format data for various chart components
 */

/**
 * Prepare data for revenue trend line chart
 */
export const prepareRevenueChartData = (trends, showMovingAverage = false) => {
  if (!trends || !Array.isArray(trends)) return [];
  
  return trends.map(item => ({
    period: formatPeriodLabel(item.period),
    revenue: parseFloat(item.revenue) || 0,
    transactionCount: parseInt(item.transaction_count) || 0,
    movingAverage: showMovingAverage ? calculateMovingAverage(trends, 3) : undefined
  }));
};

/**
 * Prepare data for service performance pie chart
 */
export const prepareServicePieChartData = (serviceData) => {
  if (!serviceData || !Array.isArray(serviceData)) return [];
  
  return serviceData
    .filter(item => parseFloat(item.total_revenue) > 0)
    .map((item, index) => ({
      name: item.service_name || 'Unknown Service',
      value: parseFloat(item.total_revenue) || 0,
      bookings: parseInt(item.booking_count) || 0,
      averagePrice: parseFloat(item.average_price) || 0,
      fill: CHART_COLORS[index % CHART_COLORS.length]
    }))
    .sort((a, b) => b.value - a.value);
};

/**
 * Prepare data for customer balance bar chart
 */
export const prepareCustomerBalanceChartData = (customers) => {
  if (!customers || !Array.isArray(customers)) return [];
  
  const creditCustomers = customers.filter(c => c.balance > 0).length;
  const debtCustomers = customers.filter(c => c.balance < 0).length;
  const neutralCustomers = customers.filter(c => c.balance === 0).length;
  
  return [
    { category: 'Customers with Credit', count: creditCustomers, fill: '#10B981' },
    { category: 'Customers with Debt', count: debtCustomers, fill: '#EF4444' },
    { category: 'Neutral Balance', count: neutralCustomers, fill: '#6B7280' }
  ];
};

/**
 * Prepare data for booking status distribution
 */
export const prepareBookingStatusChartData = (bookingMetrics) => {
  if (!bookingMetrics || !Array.isArray(bookingMetrics)) return [];
  
  const statusCounts = bookingMetrics.reduce((acc, metric) => {
    const status = metric.status || 'unknown';
    acc[status] = (acc[status] || 0) + parseInt(metric.count) || 0;
    return acc;
  }, {});
  
  return Object.entries(statusCounts).map(([status, count], index) => ({
    status: formatStatusLabel(status),
    count,
    fill: STATUS_COLORS[status] || CHART_COLORS[index % CHART_COLORS.length]
  }));
};

/**
 * Prepare data for instructor performance comparison
 */
export const prepareInstructorPerformanceData = (instructorMetrics) => {
  if (!instructorMetrics || !Array.isArray(instructorMetrics)) return [];
  
  return instructorMetrics
    .filter(instructor => instructor.total_lessons > 0)
    .map(instructor => ({
      name: instructor.instructor_name || 'Unknown',
      lessons: parseInt(instructor.completed_lessons) || 0,
      revenue: parseFloat(instructor.total_revenue) || 0,
      averageValue: parseFloat(instructor.average_lesson_value) || 0,
      efficiency: instructor.total_lessons ? 
        ((instructor.completed_lessons / instructor.total_lessons) * 100) : 0
    }))
    .sort((a, b) => b.revenue - a.revenue);
};

/**
 * Prepare data for payment method distribution
 */
export const preparePaymentMethodChartData = (transactions) => {
  if (!transactions || !Array.isArray(transactions)) return [];
  
  const paymentMethods = transactions.reduce((acc, transaction) => {
    const method = transaction.payment_method || 'Unknown';
    if (!acc[method]) {
      acc[method] = { count: 0, amount: 0 };
    }
    acc[method].count += 1;
    acc[method].amount += parseFloat(transaction.amount) || 0;
    return acc;
  }, {});
  
  return Object.entries(paymentMethods).map(([method, data], index) => ({
    method: formatPaymentMethodLabel(method),
    count: data.count,
    amount: data.amount,
    percentage: (data.amount / Object.values(paymentMethods)
      .reduce((sum, d) => sum + d.amount, 0) * 100),
    fill: PAYMENT_METHOD_COLORS[method] || CHART_COLORS[index % CHART_COLORS.length]
  }));
};

/**
 * Prepare data for customer lifetime value distribution
 */
export const prepareCLVDistributionData = (customers) => {
  if (!customers || !Array.isArray(customers)) return [];
  
  const segments = {
    'VIP (1000+)': customers.filter(c => c.lifetime_value >= 1000).length,
    'High Value (500-999)': customers.filter(c => c.lifetime_value >= 500 && c.lifetime_value < 1000).length,
    'Regular (100-499)': customers.filter(c => c.lifetime_value >= 100 && c.lifetime_value < 500).length,
    'New/Low Spend (<100)': customers.filter(c => c.lifetime_value < 100).length
  };
  
  return Object.entries(segments).map(([segment, count], index) => ({
    segment,
    count,
    percentage: (count / customers.length) * 100,
    fill: CLV_SEGMENT_COLORS[index]
  }));
};

/**
 * Prepare data for monthly comparison chart
 */
export const prepareMonthlyComparisonData = (currentData, previousData) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return months.map((month, index) => ({
    month,
    current: currentData[index]?.revenue || 0,
    previous: previousData[index]?.revenue || 0,
    growth: calculateGrowthRate(
      currentData[index]?.revenue || 0,
      previousData[index]?.revenue || 0
    )
  }));
};

/**
 * Prepare data for cash flow timeline
 */
export const prepareCashFlowData = (transactions) => {
  if (!transactions || !Array.isArray(transactions)) return [];
  
  // Group transactions by day
  const dailyFlow = transactions.reduce((acc, transaction) => {
    const date = transaction.transaction_date?.split('T')[0] || transaction.created_at?.split('T')[0];
    if (!date) return acc;
    
    if (!acc[date]) {
      acc[date] = { inflow: 0, outflow: 0, net: 0 };
    }
    
    const amount = parseFloat(transaction.amount) || 0;
    if (amount > 0) {
      acc[date].inflow += amount;
    } else {
      acc[date].outflow += Math.abs(amount);
    }
    acc[date].net = acc[date].inflow - acc[date].outflow;
    
    return acc;
  }, {});
  
  // Convert to array and sort by date
  return Object.entries(dailyFlow)
    .map(([date, flow]) => ({
      date: formatDateLabel(date),
      inflow: flow.inflow,
      outflow: flow.outflow,
      net: flow.net,
      cumulativeNet: 0 // Will be calculated below
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((item, index, array) => ({
      ...item,
      cumulativeNet: index === 0 ? item.net : 
        array[index - 1].cumulativeNet + item.net
    }));
};

/**
 * Calculate chart dimensions based on container
 */
export const calculateChartDimensions = (containerWidth, containerHeight, chartType) => {
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  
  switch (chartType) {
    case 'line':
    case 'area':
      return {
        width: Math.max(300, containerWidth - margin.left - margin.right),
        height: Math.max(200, containerHeight - margin.top - margin.bottom),
        margin
      };
    case 'pie':
    case 'doughnut':
      const size = Math.min(containerWidth, containerHeight) - 40;
      return {
        width: size,
        height: size,
        outerRadius: size / 2 - 10,
        innerRadius: chartType === 'doughnut' ? size / 4 : 0
      };
    case 'bar':
    case 'column':
      return {
        width: Math.max(400, containerWidth - margin.left - margin.right),
        height: Math.max(250, containerHeight - margin.top - margin.bottom),
        margin
      };
    default:
      return {
        width: containerWidth || 400,
        height: containerHeight || 300,
        margin
      };
  }
};

/**
 * Format period labels for charts
 */
export const formatPeriodLabel = (period) => {
  if (!period) return '';
  
  // Handle different period formats
  if (period.includes('-W')) {
    // Week format: "2024-W12"
  const [_year, week] = period.split('-W');
    return `W${week}`;
  } else if (period.length === 7) {
    // Month format: "2024-03"
  const [_year, month] = period.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthNames[parseInt(month) - 1] || month;
  } else if (period.length === 10) {
    // Date format: "2024-03-15"
    return new Date(period).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  return period;
};

/**
 * Format status labels
 */
export const formatStatusLabel = (status) => {
  return status.replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Format payment method labels
 */
export const formatPaymentMethodLabel = (method) => {
  const methodMap = {
    'cash': 'Cash',
    'card': 'Credit/Debit Card',
    'bank_transfer': 'Bank Transfer',
    'paypal': 'PayPal',
    'stripe': 'Online Payment',
    'unknown': 'Unknown'
  };
  
  return methodMap[method] || method;
};

/**
 * Format date labels
 */
export const formatDateLabel = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Calculate moving average for trend smoothing
 */
const calculateMovingAverage = (data, window) => {
  return data.map((_, index, array) => {
    const start = Math.max(0, index - window + 1);
    const values = array.slice(start, index + 1);
    return values.reduce((sum, item) => sum + (parseFloat(item.revenue) || 0), 0) / values.length;
  });
};

/**
 * Calculate growth rate
 */
const calculateGrowthRate = (current, previous) => {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

// Chart color palettes
export const CHART_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#84CC16', // Lime
  '#EC4899', // Pink
  '#6B7280'  // Gray
];

export const STATUS_COLORS = {
  'completed': '#10B981',
  'confirmed': '#3B82F6',
  'pending': '#F59E0B',
  'cancelled': '#EF4444',
  'no_show': '#6B7280'
};

export const PAYMENT_METHOD_COLORS = {
  'cash': '#10B981',
  'card': '#3B82F6',
  'bank_transfer': '#8B5CF6',
  'paypal': '#F59E0B',
  'stripe': '#06B6D4'
};

export const CLV_SEGMENT_COLORS = [
  '#7C3AED', // VIP - Purple
  '#2563EB', // High Value - Blue
  '#059669', // Regular - Green
  '#6B7280'  // New/Low Spend - Gray
];

/**
 * Generate tooltip formatters for different chart types
 */
export const createTooltipFormatter = (chartType, _dataKey = 'value') => {
  return {
  currency: (value) => formatCurrency(value || 0),
    percentage: (value) => `${(value || 0).toFixed(1)}%`,
    number: (value) => (value || 0).toLocaleString(),
  custom: (value, name, _props) => {
      switch (chartType) {
        case 'revenue':
      return [formatCurrency(value || 0), 'Revenue'];
        case 'count':
          return [(value || 0).toLocaleString(), 'Count'];
        case 'percentage':
          return [`${(value || 0).toFixed(1)}%`, name];
        default:
          return [value, name];
      }
    }
  };
};
