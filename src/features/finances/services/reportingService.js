// src/features/finances/services/reportingService.js
import apiClient from '@/shared/services/apiClient';
import FinancialAnalyticsService from './financialAnalytics';
import { logger } from '@/shared/utils/logger';
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * Financial Reporting Service
 * Handles report generation, export, and scheduling
 */
class ReportingService {
  
  /**
   * Generate comprehensive financial report
   */
  static async generateComprehensiveReport(startDate, endDate) {
    try {
      // Fetch all necessary data
      const [
        summary,
        revenueAnalytics,
        outstandingBalances,
        customerAnalytics,
        operationalMetrics
      ] = await Promise.all([
        FinancialAnalyticsService.getFinancialSummary(startDate, endDate),
        FinancialAnalyticsService.getRevenueAnalytics(startDate, endDate),
        FinancialAnalyticsService.getOutstandingBalances(),
        FinancialAnalyticsService.getCustomerAnalytics(),
        FinancialAnalyticsService.getOperationalMetrics(startDate, endDate)
      ]);

      return {
        reportType: 'Comprehensive Financial Report',
        dateRange: { startDate, endDate },
        generatedAt: new Date().toISOString(),
        summary,
        revenueAnalytics,
        outstandingBalances,
        customerAnalytics,
        operationalMetrics,
        insights: this.generateInsights(summary, revenueAnalytics, outstandingBalances)
      };
    } catch (error) {
      logger.error('Error generating comprehensive report', { error: String(error) });
      throw error;
    }
  }

  /**
   * Generate profit & loss report
   */
  static async generateProfitLossReport(startDate, endDate) {
    try {
      const response = await apiClient.get('/finances/reports/profit-loss', {
        params: { startDate, endDate }
      });
      return response.data;
    } catch (error) {
      logger.error('Error generating P&L report', { error: String(error) });
      throw error;
    }
  }

  /**
   * Generate customer summary report
   */
  static async generateCustomerSummaryReport() {
    try {
      const response = await apiClient.get('/finances/reports/customer-summary');
      return response.data;
    } catch (error) {
      logger.error('Error generating customer summary report', { error: String(error) });
      throw error;
    }
  }

  /**
   * Export report to CSV
   */
  static async exportToCSV(reportType, startDate, endDate) {
    try {
      const response = await apiClient.get(`/finances/reports/${reportType}`, {
        params: { startDate, endDate, format: 'csv' },
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportType}-report-${startDate}-to-${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      return { success: true, message: 'Report exported successfully' };
    } catch (error) {
      logger.error('Error exporting to CSV', { error: String(error) });
      throw error;
    }
  }

  /**
   * Export report to Excel
   */
  static exportToExcel(data, filename) {
    try {
  // Convert JSON data to worksheet format (placeholder for xlsx integration)
  this.jsonToWorksheet(data);
      
      // Use a library like xlsx to create Excel file
      // For now, we'll export as CSV
  return this.exportToCSV(data, filename);
    } catch (error) {
      logger.error('Error exporting to Excel', { error: String(error) });
      throw error;
    }
  }

  /**
   * Generate PDF report
   */
  static async generatePDFReport(reportData, reportType) {
    try {
      // This would integrate with a PDF generation library
      // For now, return a formatted object that can be used by a PDF component
      return {
        type: 'pdf',
        data: reportData,
        template: this.getPDFTemplate(reportType),
        filename: `${reportType}-${new Date().toISOString().split('T')[0]}.pdf`
      };
    } catch (error) {
      logger.error('Error generating PDF report', { error: String(error) });
      throw error;
    }
  }

  /**
   * Schedule automatic report generation
   */
  static async scheduleReport(reportConfig) {
    try {
      // This would integrate with a job scheduler
      const schedule = {
        id: Date.now().toString(),
        ...reportConfig,
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      
      // Store in localStorage for demo purposes
      const existingSchedules = JSON.parse(localStorage.getItem('scheduledReports') || '[]');
      existingSchedules.push(schedule);
      localStorage.setItem('scheduledReports', JSON.stringify(existingSchedules));
      
      return { success: true, schedule };
    } catch (error) {
      logger.error('Error scheduling report', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get scheduled reports
   */
  static getScheduledReports() {
    try {
      return JSON.parse(localStorage.getItem('scheduledReports') || '[]');
    } catch (error) {
      logger.error('Error getting scheduled reports', { error: String(error) });
      return [];
    }
  }

  /**
   * Cancel scheduled report
   */
  static cancelScheduledReport(scheduleId) {
    try {
      const existingSchedules = JSON.parse(localStorage.getItem('scheduledReports') || '[]');
      const updatedSchedules = existingSchedules.filter(s => s.id !== scheduleId);
      localStorage.setItem('scheduledReports', JSON.stringify(updatedSchedules));
      return { success: true };
    } catch (error) {
      logger.error('Error canceling scheduled report', { error: String(error) });
      throw error;
    }
  }

  /**
   * Generate insights from financial data
   */
  static generateInsights(summary, revenueAnalytics, outstandingBalances) {
    const insights = [];
    
    // Revenue insights
    if (summary.revenue && summary.revenue.total_revenue > 0) {
      const refundRate = (summary.revenue.total_refunds / summary.revenue.total_revenue) * 100;
      if (refundRate > 10) {
        insights.push({
          type: 'warning',
          category: 'Revenue',
          message: `High refund rate detected: ${refundRate.toFixed(1)}%. Consider reviewing service quality.`,
          value: refundRate,
          recommendation: 'Review recent customer feedback and service delivery processes.'
        });
      }
    }
    
    // Customer balance insights
    if (outstandingBalances.summary) {
      const { totalDebt, customersWithDebt } = outstandingBalances.summary;
      if (totalDebt > 1000) {
        insights.push({
          type: 'warning',
          category: 'Customer Debt',
          message: `Total customer debt is ${formatCurrency(totalDebt)} across ${customersWithDebt} customers.`,
          value: totalDebt,
          recommendation: 'Implement proactive payment follow-up procedures.'
        });
      }
    }
    
    // Growth insights
    if (revenueAnalytics.trends && revenueAnalytics.trends.length > 1) {
      const recent = revenueAnalytics.trends.slice(-2);
      if (recent.length === 2) {
        const growthRate = FinancialAnalyticsService.calculateGrowthRate(
          recent[1].revenue, 
          recent[0].revenue
        );
        
        if (growthRate > 20) {
          insights.push({
            type: 'success',
            category: 'Growth',
            message: `Strong revenue growth: ${growthRate.toFixed(1)}% in the last period.`,
            value: growthRate,
            recommendation: 'Consider expanding successful services or marketing strategies.'
          });
        } else if (growthRate < -10) {
          insights.push({
            type: 'warning',
            category: 'Growth',
            message: `Revenue decline: ${growthRate.toFixed(1)}% in the last period.`,
            value: growthRate,
            recommendation: 'Analyze market conditions and consider promotional strategies.'
          });
        }
      }
    }
    
    return insights;
  }

  /**
   * Get PDF template configuration
   */
  static getPDFTemplate(reportType) {
    const templates = {
      'comprehensive': {
        title: 'Comprehensive Financial Report',
        sections: ['summary', 'revenue', 'balances', 'customers', 'operations'],
        layout: 'detailed'
      },
      'profit-loss': {
        title: 'Profit & Loss Statement',
        sections: ['revenue', 'expenses', 'profit'],
        layout: 'simple'
      },
      'customer-summary': {
        title: 'Customer Financial Summary',
        sections: ['customers', 'balances'],
        layout: 'table'
      }
    };
    
    return templates[reportType] || templates['comprehensive'];
  }

  /**
   * Convert JSON data to worksheet format
   */
  static jsonToWorksheet(data) {
    if (!Array.isArray(data)) {
      data = [data];
    }
    
    const headers = Object.keys(data[0] || {});
    const rows = data.map(item => headers.map(header => item[header] || ''));
    
    return [headers, ...rows];
  }

  /**
   * Get report templates
   */
  static getReportTemplates() {
    return [
      {
        id: 'comprehensive',
        name: 'Comprehensive Financial Report',
        description: 'Complete overview of all financial metrics and analytics',
        sections: ['Revenue Analytics', 'Customer Balances', 'Operational Metrics', 'Insights'],
        frequency: ['daily', 'weekly', 'monthly']
      },
      {
        id: 'profit-loss',
        name: 'Profit & Loss Statement',
        description: 'Traditional P&L statement with revenue and expense breakdown',
        sections: ['Revenue', 'Expenses', 'Net Profit'],
        frequency: ['monthly', 'quarterly', 'yearly']
      },
      {
        id: 'customer-summary',
        name: 'Customer Financial Summary',
        description: 'Customer-focused financial analysis and behavior patterns',
        sections: ['Customer Lifetime Value', 'Payment Behavior', 'Outstanding Balances'],
        frequency: ['weekly', 'monthly']
      },
      {
        id: 'operational',
        name: 'Operational Finance Report',
        description: 'Business operations financial performance metrics',
        sections: ['Booking Performance', 'Instructor Earnings', 'Equipment ROI'],
        frequency: ['weekly', 'monthly']
      }
    ];
  }

  /**
   * Validate report parameters
   */
  static validateReportParams(startDate, endDate, reportType) {
    const errors = [];
    
    if (!startDate) {
      errors.push('Start date is required');
    }
    
    if (!endDate) {
      errors.push('End date is required');
    }
    
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      errors.push('Start date must be before end date');
    }
    
    const validReportTypes = ['comprehensive', 'profit-loss', 'customer-summary', 'operational'];
    if (reportType && !validReportTypes.includes(reportType)) {
      errors.push('Invalid report type');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get report history
   */
  static async getReportHistory() {
    try {
      // Mock data for now - in real app this would be an API call
      return [
        {
          id: '1',
          type: 'Financial Summary',
          status: 'completed',
          generatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          generatedBy: 'Admin User',
          format: 'PDF',
          fileSize: '2.4 MB',
          downloadUrl: '/reports/financial-summary-1.pdf'
        },
        {
          id: '2',
          type: 'Revenue Analytics',
          status: 'completed',
          generatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          generatedBy: 'Manager User',
          format: 'Excel',
          fileSize: '1.8 MB',
          downloadUrl: '/reports/revenue-analytics-2.xlsx'
        },
        {
          id: '3',
          type: 'Customer Analysis',
          status: 'failed',
          generatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          generatedBy: 'Admin User',
          format: 'PDF',
          fileSize: null,
          downloadUrl: null,
          error: 'Insufficient data for the selected period'
        }
      ];
    } catch (error) {
      logger.error('Error fetching report history', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get scheduled reports
   */
  static async getScheduledReports() {
    try {
      // Mock data for now - in real app this would be an API call
      return [
        {
          id: '1',
          name: 'Weekly Financial Summary',
          type: 'Financial Summary',
          schedule: 'Weekly (Monday)',
          format: 'PDF',
          recipients: ['admin@plannivo.com', 'manager@plannivo.com'],
          status: 'active',
          nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          lastRun: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: '2',
          name: 'Monthly Revenue Analysis',
          type: 'Revenue Analytics',
          schedule: 'Monthly (1st)',
          format: 'Excel',
          recipients: ['finance@plannivo.com'],
          status: 'active',
          nextRun: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
          lastRun: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];
    } catch (error) {
      logger.error('Error fetching scheduled reports', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get report generation status
   */
  static getReportStatus(reportId) {
    // In a real application, this would check job queue status
    return {
      id: reportId,
      status: 'completed', // pending, processing, completed, failed
      progress: 100,
      estimatedCompletion: null,
      downloadUrl: `/reports/${reportId}.pdf`
    };
  }

  /**
   * Get scheduled reports
   */
  static async getScheduledReports() {
    // Mock data for scheduled reports
    return [
      {
        id: 1,
        name: 'Weekly Financial Summary',
        type: 'financial-summary',
        schedule: 'weekly',
        nextRun: '2025-07-28T08:00:00Z',
        lastRun: '2025-07-21T08:00:00Z',
        status: 'active',
        recipients: ['admin@plannivo.com', 'manager@plannivo.com']
      },
      {
        id: 2,
        name: 'Monthly P&L Report',
        type: 'profit-loss',
        schedule: 'monthly',
        nextRun: '2025-08-01T09:00:00Z',
        lastRun: '2025-07-01T09:00:00Z',
        status: 'active',
        recipients: ['ceo@plannivo.com']
      }
    ];
  }

  /**
   * Get report history
   */
  static async getReportHistory() {
    // Mock data for report history
    return [
      {
        id: 'rpt_001',
        name: 'Financial Summary - July 2025',
        type: 'financial-summary',
        generatedAt: '2025-07-21T08:00:00Z',
        generatedBy: 'System',
        status: 'completed',
        fileSize: '2.3 MB',
        downloadUrl: '/reports/financial-summary-july-2025.pdf',
        parameters: {
          startDate: '2025-07-01',
          endDate: '2025-07-21',
          format: 'pdf'
        }
      },
      {
        id: 'rpt_002',
        name: 'Revenue Analytics - Q2 2025',
        type: 'revenue-analytics',
        generatedAt: '2025-07-15T14:30:00Z',
        generatedBy: 'admin@plannivo.com',
        status: 'completed',
        fileSize: '1.8 MB',
        downloadUrl: '/reports/revenue-analytics-q2-2025.xlsx',
        parameters: {
          startDate: '2025-04-01',
          endDate: '2025-06-30',
          format: 'excel'
        }
      },
      {
        id: 'rpt_003',
        name: 'Customer Analysis Report',
        type: 'customer-analytics',
        generatedAt: '2025-07-10T11:15:00Z',
        generatedBy: 'manager@plannivo.com',
        status: 'completed',
        fileSize: '3.1 MB',
        downloadUrl: '/reports/customer-analysis-2025.pdf',
        parameters: {
          startDate: '2025-01-01',
          endDate: '2025-07-10',
          format: 'pdf'
        }
      }
    ];
  }
}

export default ReportingService;
