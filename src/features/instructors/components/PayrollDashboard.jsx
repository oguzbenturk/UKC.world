import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Card, Row, Col, Statistic, Select, Spin, Alert, Table, Tag, Empty, Button, Dropdown 
} from 'antd';
import { 
  DollarCircleOutlined, CalendarOutlined, ClockCircleOutlined, 
  DownloadOutlined
} from '@ant-design/icons';
import { utils as xlsxUtils, writeFile as writeXlsxFile } from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useData } from '@/shared/hooks/useData';
import { formatCurrency } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import moment from 'moment';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

const { Option } = Select;

const latinize = (value) => {
  if (!value) return 'N/A';
  return value
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C');
};

const PayrollDashboard = forwardRef(({ instructor }, ref) => {
  const { apiClient } = useData();
  const { businessCurrency } = useCurrency();
  const [summaryData, setSummaryData] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('current_month');
  const [autoExpanded, setAutoExpanded] = useState(false);
  const computeDateRange = (period) => {
    const now = new Date();
    switch (period) {
      case 'all_time':
        return { startDate: undefined, endDate: undefined };
      case 'last_month': {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return {
          startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd')
        };
      }
      case 'last_3_months': {
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        return {
          startDate: format(startOfMonth(threeMonthsAgo), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(now), 'yyyy-MM-dd')
        };
      }
      case 'last_6_months': {
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        return {
          startDate: format(startOfMonth(sixMonthsAgo), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(now), 'yyyy-MM-dd')
        };
      }
      case 'current_year':
        return {
          startDate: format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'),
          endDate: format(now, 'yyyy-MM-dd')
        };
      case 'current_month':
      default:
        return {
          startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(now), 'yyyy-MM-dd')
        };
    }
  };

  const mapEarning = (earning) => ({
    id: earning.booking_id || earning.id,
    lesson_date: earning.lesson_date,
    service_name: earning.service_name || 'Private Lessons',
    lesson_duration: parseFloat(earning.lesson_duration || 0),
    commission_amount: parseFloat(earning.total_earnings || 0),
    lesson_amount: parseFloat(earning.lesson_amount || 0),
    commission_rate: parseFloat(earning.commission_rate || 0),
    commission_type: earning.commission_type || 'percentage',
    student_name: earning.student_name,
    status: earning.booking_status || 'completed'
  });

  const fetchDashboardData = useCallback(async () => {
    if (!instructor?.id) return;

    setIsLoading(true);
    setError(null);

    const { startDate, endDate } = computeDateRange(selectedPeriod);

  try {
      // Build URL with or without date filters based on selected period
      let url = `/finances/instructor-earnings/${instructor.id}`;
      if (startDate && endDate) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
      }
      const response = await apiClient.get(url);
      
      const rawEarnings = response.data.earnings || [];

      // Filter earnings only if a date range is applied
      let filteredEarnings = rawEarnings;
      if (selectedPeriod !== 'all_time' && startDate && endDate) {
        filteredEarnings = rawEarnings.filter(earning => {
          if (!earning.lesson_date) return false;
          const earningDate = moment.utc(earning.lesson_date);
          const start = moment.utc(startDate, 'YYYY-MM-DD').startOf('day');
          const end = moment.utc(endDate, 'YYYY-MM-DD').endOf('day');
          return earningDate.isBetween(start, end, undefined, '[]');
        });
      }

      // Transform earnings data to match the expected format
  const earningsData = filteredEarnings.map(mapEarning);
      
      setEarnings(earningsData);

      // If no data in a narrow range, auto-widen once to last 3 months
  if (earningsData.length === 0 && selectedPeriod === 'current_month' && !autoExpanded) {
        setAutoExpanded(true);
        setSelectedPeriod('last_3_months');
      }

  } catch {
      setError('Failed to load dashboard data.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, instructor?.id, selectedPeriod, autoExpanded]);

  const calculateSummary = (earningsData) => {
    const totalEarnings = earningsData.reduce((sum, e) => sum + (parseFloat(e.commission_amount) || 0), 0);
    const totalLessons = earningsData.length;
    const totalHours = earningsData.reduce((sum, e) => sum + (parseFloat(e.lesson_duration) || 0), 0);
    const averagePerLesson = totalLessons > 0 ? totalEarnings / totalLessons : 0;

    const serviceHours = earningsData.reduce((acc, e) => {
      const key = latinize(e.service_name || 'Private Lessons');
      const hours = parseFloat(e.lesson_duration) || 0;
      acc[key] = (acc[key] || 0) + hours;
      return acc;
    }, {});

    setSummaryData({
      totalEarnings,
      totalLessons,
      totalHours,
      averagePerLesson,
      serviceHours
    });
  };

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    if (earnings) {
      calculateSummary(earnings);
    }
  }, [earnings]);

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refreshData: fetchDashboardData
  }));

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large">
          <div className="p-8">Loading dashboard...</div>
        </Spin>
      </div>
    );
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon action={
      <Button size="small" type="primary" onClick={fetchDashboardData}>
        Retry
      </Button>
    } />;
  }
  const earningsColumns = [
    { 
      title: 'Lesson Date', 
      dataIndex: 'lesson_date', 
      key: 'date', 
      render: (text) => text ? moment.utc(text).format('YYYY-MM-DD') : 'N/A'
    },
    { 
      title: 'Student', 
      dataIndex: 'student_name', 
      key: 'student', 
      render: (text) => latinize(text) 
    },
    { 
      title: 'Service', 
      dataIndex: 'service_name', 
      key: 'service', 
      render: (text) => latinize(text || 'Private Lessons') 
    },
    { 
      title: 'Duration', 
      dataIndex: 'lesson_duration', 
      key: 'duration', 
      render: (text) => `${text || 0}h` 
    },
    { 
      title: 'Lesson Amount', 
      dataIndex: 'lesson_amount', 
      key: 'amount', 
      render: (text) => formatCurrency(parseFloat(text) || 0, businessCurrency || 'EUR')
    },
    { 
      title: 'Commission Rate', 
      dataIndex: 'commission_rate', 
      key: 'commission_rate', 
      render: (value, record) => {
        const rate = Number.parseFloat(value ?? 0);
        if (record.commission_type === 'fixed') {
          return formatCurrency(rate, businessCurrency || 'EUR') + '/h';
        }
        return `${rate.toFixed(2)}%`;
      }
    },
    { 
      title: 'Commission', 
      dataIndex: 'commission_amount', 
      key: 'commission', 
      render: (text) => formatCurrency(parseFloat(text) || 0, businessCurrency || 'EUR')
    },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status', 
      render: (status) => (
        <Tag color={status === 'completed' ? 'green' : status === 'confirmed' ? 'blue' : 'orange'}>
          {(status || 'pending').toUpperCase()}
        </Tag>
      )
    }
  ];

  const buildExportRows = () => earnings.map((earning) => ({
    Date: earning.lesson_date ? moment.utc(earning.lesson_date).format('YYYY-MM-DD') : 'N/A',
    Student: latinize(earning.student_name || 'N/A'),
    Service: latinize(earning.service_name || 'Private Lessons'),
    Duration: `${earning.lesson_duration || 0}h`,
    'Lesson Amount': formatCurrency(parseFloat(earning.lesson_amount) || 0, businessCurrency || 'EUR'),
    'Commission Rate': earning.commission_type === 'fixed'
      ? `${formatCurrency(Number.parseFloat(earning.commission_rate) || 0, businessCurrency || 'EUR')}/h`
      : `${Number.parseFloat(earning.commission_rate || 0).toFixed(2)}%`,
    Commission: formatCurrency(parseFloat(earning.commission_amount) || 0, businessCurrency || 'EUR'),
    Status: (earning.status || 'pending').toUpperCase()
  }));

  const buildSummaryLines = (exportedAt) => {
    if (!summaryData) return [];
    const lines = [
      ['Exported At', exportedAt],
      ['Total Lessons', summaryData.totalLessons],
      ['Total Hours', `${(summaryData.totalHours || 0).toFixed(1)}h`],
      ['Total Commission', formatCurrency(Number(summaryData.totalEarnings) || 0, businessCurrency || 'EUR')],
      ['Average Per Lesson', formatCurrency(Number(summaryData.averagePerLesson) || 0, businessCurrency || 'EUR')]
    ];

    if (summaryData.serviceHours) {
      lines.push(['Service Hours', '']);
      Object.entries(summaryData.serviceHours).forEach(([service, hours]) => {
        lines.push([`  ${service}`, `${hours.toFixed(1)}h`]);
      });
    }

    return lines;
  };

  const exportCsv = () => {
    if (!earnings.length) return;
    const exportedAt = moment().format('YYYY-MM-DD HH:mm:ss');
    const rows = buildExportRows();
    const summaryLines = buildSummaryLines(exportedAt);
    const csvContent = [
      Object.keys(rows[0]).join(','),
      ...rows.map((row) => Object.values(row).map((value) => `${value}`.replace(/,/g, ' ')).join(',')),
      '',
      'Summary,Value',
      ...summaryLines.map((line) => line.map((value) => `${value}`.replace(/,/g, ' ')).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${latinize(instructor?.name || 'instructor').replace(/\s+/g, '_')}_earnings_${selectedPeriod}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (!earnings.length) return;
    const exportedAt = moment().format('YYYY-MM-DD HH:mm:ss');
    const rows = buildExportRows();
    const summaryLines = buildSummaryLines(exportedAt);
    const worksheet = xlsxUtils.json_to_sheet(rows);
    const summarySheet = xlsxUtils.aoa_to_sheet([['Summary', 'Value'], ...summaryLines]);
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, worksheet, 'Earnings');
    xlsxUtils.book_append_sheet(workbook, summarySheet, 'Totals');
    writeXlsxFile(workbook, `${latinize(instructor?.name || 'instructor').replace(/\s+/g, '_')}_earnings_${selectedPeriod}.xlsx`);
  };

  const exportPdf = () => {
    if (!earnings.length) return;
    const exportedAt = moment().format('YYYY-MM-DD HH:mm:ss');
    const rows = buildExportRows();
    const summaryLines = buildSummaryLines(exportedAt);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text(`${latinize(instructor?.name || 'Instructor')} Earnings (${selectedPeriod.replaceAll('_', ' ')})`, 14, 14);
    doc.text(`Exported: ${exportedAt}`, 14, 20);
    autoTable(doc, {
      head: [Object.keys(rows[0])],
      body: rows.map((row) => Object.values(row)),
      startY: 26,
      styles: { fontSize: 8 }
    });
    autoTable(doc, {
      head: [['Summary', 'Value']],
      body: summaryLines,
      startY: doc.lastAutoTable.finalY + 6,
      styles: { fontSize: 8 }
    });
    doc.save(`${latinize(instructor?.name || 'instructor').replace(/\s+/g, '_')}_earnings_${selectedPeriod}.pdf`);
  };

  const exportMenuItems = [
    { key: 'csv', label: 'Export CSV' },
    { key: 'excel', label: 'Export Excel' },
    { key: 'pdf', label: 'Export PDF' }
  ];

  const handleExport = ({ key }) => {
    if (key === 'csv') exportCsv();
    if (key === 'excel') exportExcel();
    if (key === 'pdf') exportPdf();
  };

  return (
    <div className="space-y-6">
      <Card variant="outlined" style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.1)', borderRadius: '8px' }}>
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-medium text-gray-900">Earnings Overview</h3>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Dropdown menu={{ items: exportMenuItems, onClick: handleExport }}>
              <Button
                className="w-full sm:w-auto"
                icon={<DownloadOutlined />} 
              >
                Export
              </Button>
            </Dropdown>
            <Select
              value={selectedPeriod}
              onChange={setSelectedPeriod}
              className="w-full sm:w-48"
            >
              <Option value="current_month">Current Month</Option>
              <Option value="last_month">Last Month</Option>
              <Option value="last_3_months">Last 3 Months</Option>
              <Option value="last_6_months">Last 6 Months</Option>
              <Option value="current_year">Current Year</Option>
              <Option value="all_time">All History</Option>
            </Select>
          </div>
        </div>
        
        {summaryData && (
          <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} md={6}>
              <Statistic 
          title="Total Commission" 
        value={summaryData.totalEarnings} 
        precision={2} 
        formatter={(value) => formatCurrency(Number(value) || 0, businessCurrency || 'EUR')}
                prefix={<DollarCircleOutlined style={{ color: 'var(--brand-success)' }} />} 
                valueStyle={{ color: 'var(--brand-success)' }}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic 
                title="Total Lessons" 
                value={summaryData.totalLessons} 
                prefix={<CalendarOutlined style={{ color: 'var(--brand-primary)' }} />} 
                valueStyle={{ color: 'var(--brand-primary)' }}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic 
                title="Total Hours" 
                value={summaryData.totalHours} 
                precision={1} 
                prefix={<ClockCircleOutlined style={{ color: 'var(--brand-warning)' }} />} 
                valueStyle={{ color: 'var(--brand-warning)' }}
                suffix="h"
              />
            </Col>
      <Col xs={24} sm={12} md={6}>
              <Statistic 
                title="Avg. Per Lesson" 
        value={summaryData.averagePerLesson} 
        precision={2} 
        formatter={(value) => formatCurrency(Number(value) || 0, businessCurrency || 'EUR')}
                valueStyle={{ color: 'var(--brand-success)' }}
              />
            </Col>
          </Row>
        )}
        {summaryData?.serviceHours && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(summaryData.serviceHours).map(([service, hours]) => (
              <div key={service} className="rounded border border-gray-200 px-3 py-2 text-sm text-gray-700 flex justify-between">
                <span className="font-medium">{service}</span>
                <span>{hours.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Earnings Details for Selected Period">
        {earnings.length === 0 && (
          <Alert
            type="info"
            showIcon
            message={
              selectedPeriod === 'current_month'
                ? 'No earnings found for the current month. Try selecting Last 3 Months or a wider range.'
                : selectedPeriod === 'all_time'
                ? 'No earnings found.'
                : 'No earnings found for the selected period.'
            }
            style={{ marginBottom: 16 }}
          />
        )}
        <UnifiedTable title="Instructor Earnings" density="comfortable">
          <Table 
            columns={earningsColumns} 
            dataSource={earnings} 
            rowKey="id" 
            pagination={{ pageSize: 5 }}
            locale={{ emptyText: <Empty description="No earnings recorded for this period." /> }}
          />
        </UnifiedTable>
      </Card>
    </div>
  );
});

export default PayrollDashboard;