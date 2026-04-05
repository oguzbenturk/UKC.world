// src/features/finances/utils/financialCalculations.js

/**
 * Financial Calculations Utility
 * Contains business logic for financial calculations
 */

/**
 * Calculate revenue growth rate
 */
export const calculateGrowthRate = (current, previous) => {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Calculate Average Revenue Per Customer (ARPC)
 */
export const calculateARPC = (totalRevenue, customerCount) => {
  if (!customerCount || customerCount === 0) return 0;
  return totalRevenue / customerCount;
};

/**
 * Calculate Customer Lifetime Value (CLV)
 */
export const calculateCLV = (avgMonthlySpend, avgLifespanMonths, churnRate = 0) => {
  if (churnRate > 0) {
    return avgMonthlySpend / churnRate;
  }
  return avgMonthlySpend * avgLifespanMonths;
};

/**
 * Calculate profit margin
 */
export const calculateProfitMargin = (revenue, costs) => {
  if (!revenue || revenue === 0) return 0;
  return ((revenue - costs) / revenue) * 100;
};

/**
 * Calculate payment efficiency metrics
 */
export const calculatePaymentEfficiency = (totalPayments, onTimePayments) => {
  if (!totalPayments || totalPayments === 0) return 0;
  return (onTimePayments / totalPayments) * 100;
};

/**
 * Calculate refund rate
 */
export const calculateRefundRate = (totalRefunds, totalRevenue) => {
  if (!totalRevenue || totalRevenue === 0) return 0;
  return (totalRefunds / totalRevenue) * 100;
};

/**
 * Calculate debt-to-revenue ratio
 */
export const calculateDebtRatio = (totalDebt, totalRevenue) => {
  if (!totalRevenue || totalRevenue === 0) return 0;
  return (totalDebt / totalRevenue) * 100;
};

/**
 * Calculate booking conversion rate
 */
export const calculateBookingConversionRate = (completedBookings, totalBookings) => {
  if (!totalBookings || totalBookings === 0) return 0;
  return (completedBookings / totalBookings) * 100;
};

/**
 * Calculate average transaction value
 */
export const calculateAverageTransactionValue = (totalRevenue, transactionCount) => {
  if (!transactionCount || transactionCount === 0) return 0;
  return totalRevenue / transactionCount;
};

/**
 * Calculate seasonal index
 */
export const calculateSeasonalIndex = (periodRevenue, averageRevenue) => {
  if (!averageRevenue || averageRevenue === 0) return 1;
  return periodRevenue / averageRevenue;
};

/**
 * Calculate customer retention rate
 */
export const calculateRetentionRate = (returningCustomers, totalCustomers) => {
  if (!totalCustomers || totalCustomers === 0) return 0;
  return (returningCustomers / totalCustomers) * 100;
};

/**
 * Calculate equipment utilization rate
 */
export const calculateEquipmentUtilization = (hoursUsed, hoursAvailable) => {
  if (!hoursAvailable || hoursAvailable === 0) return 0;
  return (hoursUsed / hoursAvailable) * 100;
};

/**
 * Calculate instructor efficiency
 */
export const calculateInstructorEfficiency = (completedLessons, scheduledLessons) => {
  if (!scheduledLessons || scheduledLessons === 0) return 0;
  return (completedLessons / scheduledLessons) * 100;
};

/**
 * Financial health scoring
 */
export const calculateFinancialHealthScore = (metrics) => {
  const {
    profitMargin = 0,
    paymentEfficiency = 0,
    refundRate = 0,
    debtRatio = 0,
    growthRate = 0
  } = metrics;

  let score = 100;
  
  // Profit margin impact (0-40 points)
  if (profitMargin > 20) score += 0; // Excellent
  else if (profitMargin > 10) score -= 5; // Good
  else if (profitMargin > 0) score -= 15; // Fair
  else score -= 40; // Poor
  
  // Payment efficiency impact (0-20 points)
  if (paymentEfficiency > 90) score += 0; // Excellent
  else if (paymentEfficiency > 80) score -= 5; // Good
  else if (paymentEfficiency > 70) score -= 10; // Fair
  else score -= 20; // Poor
  
  // Refund rate impact (0-20 points)
  if (refundRate < 2) score += 0; // Excellent
  else if (refundRate < 5) score -= 5; // Good
  else if (refundRate < 10) score -= 10; // Fair
  else score -= 20; // Poor
  
  // Debt ratio impact (0-20 points)
  if (debtRatio < 5) score += 0; // Excellent
  else if (debtRatio < 10) score -= 5; // Good
  else if (debtRatio < 20) score -= 10; // Fair
  else score -= 20; // Poor
  
  return Math.max(0, Math.min(100, score));
};

/**
 * Risk assessment scoring
 */
export const calculateRiskScore = (metrics) => {
  const {
    debtRatio = 0,
    refundRate = 0,
    growthRate = 0,
    cashFlowRatio = 1,
    customerConcentration = 0
  } = metrics;

  let riskScore = 0;
  
  // Debt ratio risk
  if (debtRatio > 25) riskScore += 30;
  else if (debtRatio > 15) riskScore += 20;
  else if (debtRatio > 10) riskScore += 10;
  
  // Refund rate risk
  if (refundRate > 15) riskScore += 25;
  else if (refundRate > 10) riskScore += 15;
  else if (refundRate > 5) riskScore += 5;
  
  // Growth rate risk
  if (growthRate < -20) riskScore += 25;
  else if (growthRate < -10) riskScore += 15;
  else if (growthRate < 0) riskScore += 5;
  
  // Cash flow risk
  if (cashFlowRatio < 0.5) riskScore += 20;
  else if (cashFlowRatio < 0.8) riskScore += 10;
  
  return Math.min(100, riskScore);
};

/**
 * Forecast revenue using linear regression
 */
export const forecastRevenue = (historicalData, periodsAhead = 3) => {
  if (!historicalData || historicalData.length < 2) return [];
  
  const n = historicalData.length;
  const x = historicalData.map((_, index) => index);
  const y = historicalData.map(item => item.revenue || 0);
  
  // Calculate linear regression coefficients
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumXX = x.reduce((total, xi) => total + xi * xi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Generate forecasts
  const forecasts = [];
  for (let i = 1; i <= periodsAhead; i++) {
    const futureX = n + i - 1;
    const forecastValue = slope * futureX + intercept;
    forecasts.push({
      period: futureX,
      revenue: Math.max(0, forecastValue),
      isForcast: true
    });
  }
  
  return forecasts;
};

/**
 * Calculate moving average
 */
export const calculateMovingAverage = (data, windowSize = 3) => {
  if (!data || data.length < windowSize) return data;
  
  const result = [];
  for (let i = windowSize - 1; i < data.length; i++) {
    const window = data.slice(i - windowSize + 1, i + 1);
    const average = window.reduce((sum, value) => sum + (value.revenue || 0), 0) / windowSize;
    result.push({
      ...data[i],
      movingAverage: average
    });
  }
  
  return result;
};

/**
 * Calculate percentage change
 */
export const calculatePercentageChange = (newValue, oldValue) => {
  if (!oldValue || oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
};

/**
 * Calculate compound annual growth rate (CAGR)
 */
export const calculateCAGR = (beginningValue, endingValue, numberOfYears) => {
  if (!beginningValue || beginningValue <= 0 || !numberOfYears || numberOfYears <= 0) return 0;
  return (Math.pow(endingValue / beginningValue, 1 / numberOfYears) - 1) * 100;
};

/**
 * Calculate break-even point
 */
export const calculateBreakEvenPoint = (fixedCosts, variableCostPerUnit, pricePerUnit) => {
  const contributionMargin = pricePerUnit - variableCostPerUnit;
  if (contributionMargin <= 0) return null;
  return fixedCosts / contributionMargin;
};

/**
 * Calculate return on investment (ROI)
 */
export const calculateROI = (gain, cost) => {
  if (!cost || cost === 0) return 0;
  return ((gain - cost) / cost) * 100;
};

/**
 * Validate financial calculations
 */
export const validateFinancialData = (data) => {
  const errors = [];
  
  if (data.revenue !== undefined && data.revenue < 0) {
    errors.push('Revenue cannot be negative');
  }
  
  if (data.costs !== undefined && data.costs < 0) {
    errors.push('Costs cannot be negative');
  }
  
  if (data.growthRate !== undefined && Math.abs(data.growthRate) > 1000) {
    errors.push('Growth rate seems unrealistic');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};
