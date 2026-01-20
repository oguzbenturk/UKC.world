// src/features/manager/pages/ManagerDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { Spin } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { DollarOutlined } from '@ant-design/icons';
import { getManagerDashboard, getManagerCommissionHistory } from '../services/managerCommissionApi';
import CommissionSummaryCards from '../components/CommissionSummaryCards';
import CommissionBreakdownCards from '../components/CommissionBreakdownCards';
import CommissionHistoryTable from '../components/CommissionHistoryTable';

function ManagerDashboard() {
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [filters, setFilters] = useState({
    sourceType: null,
    status: null,
    dateRange: null
  });

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getManagerDashboard();
      if (response.success) {
        setDashboardData(response.data);
      } else {
        message.error('Failed to load dashboard');
      }
    } catch (error) {
      message.error(error.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCommissions = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const options = {
        page,
        limit: pagination.limit,
        sourceType: filters.sourceType,
        status: filters.status
      };
      
      if (filters.dateRange && filters.dateRange.length === 2) {
        options.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        options.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }

      const response = await getManagerCommissionHistory(options);
      if (response.success) {
        setCommissions(response.data || []);
        setPagination(prev => ({
          ...prev,
          page: response.pagination?.page || 1,
          total: response.pagination?.total || 0
        }));
      }
    } catch (error) {
      message.error(error.message || 'Failed to load commission history');
    } finally {
      setHistoryLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    fetchCommissions(1);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTableChange = (paginationConfig) => {
    fetchCommissions(paginationConfig.current);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spin size="large" />
      </div>
    );
  }

  const { settings, currentPeriod } = dashboardData || {};

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <DollarOutlined className="text-green-500" />
          My Commission Dashboard
        </h1>
        <p className="text-gray-600">
          Track your earnings from bookings and rentals. Commission rate: {settings?.defaultRate || 10}%
        </p>
      </div>

      {/* Summary Cards */}
      <CommissionSummaryCards dashboardData={dashboardData} />

      {/* Breakdown Cards */}
      <CommissionBreakdownCards currentPeriod={currentPeriod} />

      {/* Commission History */}
      <CommissionHistoryTable
        commissions={commissions}
        loading={historyLoading}
        pagination={pagination}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onTableChange={handleTableChange}
      />
    </div>
  );
}

export default ManagerDashboard;
