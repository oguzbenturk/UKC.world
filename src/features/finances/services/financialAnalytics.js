// src/features/finances/services/financialAnalytics.js
import apiClient from '@/shared/services/apiClient';

/**
 * Financial Analytics Service
 * Provides comprehensive financial data analysis and calculations
 */
class FinancialAnalyticsService {
  
  /**
   * Get comprehensive financial summary
   */
  static async getFinancialSummary(startDate, endDate, serviceType, mode = 'accrual') {
    try {
      const response = await apiClient.get('/finances/summary', {
        params: { startDate, endDate, serviceType, mode }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get detailed revenue analytics with trends
   */
  static async getRevenueAnalytics(startDate, endDate, groupBy = 'day', mode = 'accrual', serviceType = 'all') {
    try {
      const response = await apiClient.get('/finances/revenue-analytics', {
        params: { startDate, endDate, groupBy, mode, serviceType }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get outstanding customer balances with detailed analysis
   */
  static async getOutstandingBalances(sortBy = 'balance', order = 'desc', minAmount = 0) {
    try {
      const response = await apiClient.get('/finances/outstanding-balances', {
        params: { sortBy, order, minAmount }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get customer financial analytics including CLV and payment behavior
   */
  static async getCustomerAnalytics() {
    try {
      const response = await apiClient.get('/finances/customer-analytics');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get operational metrics including booking and rental performance
   */
  static async getOperationalMetrics(startDate, endDate) {
    try {
      const response = await apiClient.get('/finances/operational-metrics', {
        params: { startDate, endDate }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Preview resolved finance settings for a given context
   */
  static async previewFinanceSettings({ serviceType, serviceId, categoryId, paymentMethod } = {}) {
    try {
      const response = await apiClient.get('/finance-settings/preview', {
        params: { serviceType, serviceId, categoryId, paymentMethod }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate specific financial reports
   */
  static async generateReport(type, startDate, endDate, format = 'json') {
    try {
      const response = await apiClient.get(`/finances/reports/${type}`, {
        params: { startDate, endDate, format }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Perform bulk financial operations
   */
  static async performBulkOperation(operation, targets, amount, description) {
    try {
      const response = await apiClient.post('/finances/bulk', {
        operation,
        targets,
        amount,
        description
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate revenue growth rate
   */
  static calculateGrowthRate(current, previous) {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Calculate customer lifetime value
   */
  static calculateCLV(totalSpent, avgMonthlySpend, avgLifespanMonths) {
    if (avgMonthlySpend && avgLifespanMonths) {
      return avgMonthlySpend * avgLifespanMonths;
    }
    return totalSpent; // Fallback to current total spent
  }

  /**
   * Categorize customers by spending level
   */
  static categorizeCustomer(totalSpent) {
    if (totalSpent > 1000) return 'VIP';
    if (totalSpent > 500) return 'High Value';
    if (totalSpent > 100) return 'Regular';
    return 'New/Low Spend';
  }

  /**
   * Calculate payment efficiency score
   */
  static calculatePaymentEfficiency(paymentCount, refundCount, avgDelayDays) {
    let score = 100;
    
    // Reduce score for refunds
    if (paymentCount > 0) {
      const refundRate = (refundCount / paymentCount) * 100;
      score -= refundRate * 2; // 2 points per 1% refund rate
    }
    
    // Reduce score for payment delays
    if (avgDelayDays > 0) {
      score -= Math.min(avgDelayDays * 2, 50); // Max 50 point reduction for delays
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get financial health indicators
   */
  static analyzeFinancialHealth(data) {
    const {
      totalRevenue,
      totalRefunds,
      customersWithDebt,
      totalCustomerDebt
      // Note: unpaidBookings removed - pay-and-go system has no unpaid bookings
    } = data;

    const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;
    const debtRatio = totalRevenue > 0 ? (totalCustomerDebt / totalRevenue) * 100 : 0;
    
    return {
      refundRate,
      debtRatio,
      riskLevel: this.calculateRiskLevel(refundRate, debtRatio, customersWithDebt),
      healthScore: this.calculateHealthScore(refundRate, debtRatio)
    };
  }

  /**
   * Calculate business risk level
   */
  static calculateRiskLevel(refundRate, debtRatio, customersWithDebt) {
    let riskScore = 0;
    
    if (refundRate > 15) riskScore += 3;
    else if (refundRate > 10) riskScore += 2;
    else if (refundRate > 5) riskScore += 1;
    
    if (debtRatio > 20) riskScore += 3;
    else if (debtRatio > 10) riskScore += 2;
    else if (debtRatio > 5) riskScore += 1;
    
    if (customersWithDebt > 20) riskScore += 2;
    else if (customersWithDebt > 10) riskScore += 1;
    
    if (riskScore >= 6) return 'High';
    if (riskScore >= 3) return 'Medium';
    return 'Low';
  }

  /**
   * Calculate overall financial health score
   */
  static calculateHealthScore(refundRate, debtRatio) {
    let score = 100;
    
    // Reduce for high refund rate
    score -= Math.min(refundRate * 2, 30);
    
    // Reduce for high debt ratio
    score -= Math.min(debtRatio * 1.5, 30);
    
    // Note: unpaidBookings penalty removed - pay-and-go system has no unpaid bookings
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Format currency values for display
   */
  static formatCurrency(amount, currency = 'EUR') {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  }

  /**
   * Format percentage values for display
   */
  static formatPercentage(value, decimals = 1) {
    return `${(value || 0).toFixed(decimals)}%`;
  }

  /**
   * Get date range presets
   */
  static getDateRangePresets() {
    const today = new Date();
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    
    return {
      today: {
        label: 'Today',
        startDate: today.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      },
      thisWeek: {
        label: 'Last 7 Days',
        startDate: oneWeekAgo.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      },
      thisMonth: {
        label: 'This Month',
        startDate: firstDayThisMonth.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      },
      lastMonth: {
        label: 'Last Month',
        startDate: firstDayLastMonth.toISOString().split('T')[0],
        endDate: lastDayLastMonth.toISOString().split('T')[0]
      },
      last30Days: {
        label: 'Last 30 Days',
        startDate: oneMonthAgo.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      },
      last90Days: {
        label: 'Last 90 Days',
        startDate: threeMonthsAgo.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      },
      lastYear: {
        label: 'Last 12 Months',
        startDate: oneYearAgo.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      }
    };
  }
}

export default FinancialAnalyticsService;
