// src/features/finances/components/OperationalMetricsDashboard.jsx
/* eslint-disable complexity */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Select, 
  DatePicker, 
  Space, 
  Button, 
  Table, 
  Tag, 
  Progress,
  Alert,
  Spin,
  Grid
} from 'antd';
import {
  DollarOutlined,
  TeamOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  ReloadOutlined,
  ExportOutlined
} from '@ant-design/icons';
import { 
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import FinancialAnalyticsService from '../services/financialAnalytics';
import ReportingService from '../services/reportingService';
import { CHART_COLORS, createTooltipFormatter } from '../utils/chartHelpers';
import { formatCurrency } from '@/shared/utils/formatters';
import moment from 'moment';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

const { Option } = Select;
const { RangePicker } = DatePicker;

function OperationalMetricsDashboard() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md; // treat < md as mobile
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [dateRange, setDateRange] = useState([null, null]);
  const [metricType, setMetricType] = useState('revenue');
  // const [comparisonPeriod, setComparisonPeriod] = useState('previous');

  // Handle mobile native date input changes
  const handleMobileDateChange = (field, value) => {
    const newRange = [...dateRange];
    if (field === 'start') {
      newRange[0] = value ? moment(value) : null;
    } else {
      newRange[1] = value ? moment(value) : null;
    }
    setDateRange(newRange);
  };

  // Fetch operational metrics data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = dateRange[0]?.format('YYYY-MM-DD') || null;
      const endDate = dateRange[1]?.format('YYYY-MM-DD') || null;
      
      const response = await FinancialAnalyticsService.getOperationalMetrics(startDate, endDate);
      setData(response || {});
    } catch {
      // Swallow error to avoid noisy logs in UI
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate KPIs and trends
  const kpis = useMemo(() => {
    if (!data.efficiency) return {};
    
    const efficiency = data.efficiency;
    const utilization = data.utilization || {};
    const performance = data.performance || {};
    
    return {
      conversionRate: parseFloat(efficiency.conversion_rate) || 0,
      averageBookingValue: parseFloat(efficiency.average_booking_value) || 0,
      instructorUtilization: parseFloat(utilization.instructor_utilization) || 0,
      equipmentUtilization: parseFloat(utilization.equipment_utilization) || 0,
      revenuePerCustomer: parseFloat(performance.revenue_per_customer) || 0,
      bookingCancellationRate: parseFloat(efficiency.cancellation_rate) || 0,
      repeatCustomerRate: parseFloat(performance.repeat_customer_rate) || 0,
      profitMargin: parseFloat(performance.profit_margin) || 0
    };
  }, [data]);

  // Prepare chart data for trends
  const trendsData = useMemo(() => {
    if (!data.trends) return [];
    
    return data.trends.map(item => ({
      period: item.period,
      revenue: parseFloat(item.revenue) || 0,
      bookings: parseInt(item.bookings) || 0,
      customers: parseInt(item.customers) || 0,
      conversion_rate: parseFloat(item.conversion_rate) || 0,
      avg_booking_value: parseFloat(item.avg_booking_value) || 0
    }));
  }, [data]);

  // Service performance data
  const servicePerformanceData = useMemo(() => {
    if (!data.servicePerformance) return [];
    
    return data.servicePerformance.map((service, index) => ({
      ...service,
      fill: CHART_COLORS[index % CHART_COLORS.length]
    }));
  }, [data]);

  // Instructor performance data
  const instructorPerformanceData = useMemo(() => {
    if (!data.instructorPerformance) return [];
    
    return data.instructorPerformance.map(instructor => ({
      ...instructor,
      utilization_rate: parseFloat(instructor.utilization_rate) || 0,
      avg_rating: parseFloat(instructor.avg_rating) || 0,
      total_revenue: parseFloat(instructor.total_revenue) || 0
    }));
  }, [data]);

  // Equipment utilization data
  const equipmentData = useMemo(() => {
    if (!data.equipmentUtilization) return [];
    
    return data.equipmentUtilization.map((equipment, index) => ({
      ...equipment,
      utilization_rate: parseFloat(equipment.utilization_rate) || 0,
      revenue: parseFloat(equipment.revenue) || 0,
      fill: CHART_COLORS[index % CHART_COLORS.length]
    }));
  }, [data]);

  // Performance indicators with status
  const getPerformanceStatus = (value, thresholds) => {
    if (value >= thresholds.excellent) return { status: 'success', text: 'Excellent' };
    if (value >= thresholds.good) return { status: 'processing', text: 'Good' };
    if (value >= thresholds.fair) return { status: 'warning', text: 'Fair' };
    return { status: 'error', text: 'Poor' };
  };

  // Instructor performance table columns
  const instructorColumns = [
    {
      title: 'Instructor',
      dataIndex: 'instructor_name',
      key: 'instructor_name',
      render: (name) => <span className="font-medium">{name}</span>
    },
    {
      title: 'Bookings',
      dataIndex: 'total_bookings',
      key: 'total_bookings',
      sorter: (a, b) => a.total_bookings - b.total_bookings
    },
    {
      title: 'Revenue',
      dataIndex: 'total_revenue',
      key: 'total_revenue',
      render: (revenue) => formatCurrency(revenue),
      sorter: (a, b) => a.total_revenue - b.total_revenue
    },
    {
      title: 'Utilization',
      dataIndex: 'utilization_rate',
      key: 'utilization_rate',
      render: (rate) => (
        <div className="flex items-center gap-2">
          <Progress 
            percent={rate} 
            size="small" 
            status={rate > 75 ? 'success' : rate > 50 ? 'normal' : 'exception'}
            showInfo={false}
            style={{ width: 60 }}
          />
          <span>{rate.toFixed(1)}%</span>
        </div>
      ),
      sorter: (a, b) => a.utilization_rate - b.utilization_rate
    },
    {
      title: 'Avg Rating',
      dataIndex: 'avg_rating',
      key: 'avg_rating',
      render: (rating) => (
        <Tag color={rating >= 4.5 ? 'green' : rating >= 4.0 ? 'blue' : 'orange'}>
          {rating.toFixed(1)} ⭐
        </Tag>
      ),
      sorter: (a, b) => a.avg_rating - b.avg_rating
    },
    {
      title: 'Avg per Booking',
      key: 'avg_per_booking',
      render: (_, record) => formatCurrency(record.total_revenue / record.total_bookings || 0)
    }
  ];

  const handleExport = async () => {
    try {
      await ReportingService.exportToCSV(data, 'operational-metrics');
    } catch {
      // Ignore export error in UI; ReportingService should surface messages
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`w-full ${isMobile ? 'flex flex-col gap-2 items-start' : 'flex justify-between items-center'}`}>
        <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-gray-800`}>Operational Metrics</h2>
        <Space wrap size={isMobile ? 'small' : 'middle'} className={`${isMobile ? 'w-full justify-start' : ''}`}>
          {isMobile ? (
            // Native date inputs on mobile - no popup issues  
            <div className="flex gap-1 items-center">
              <input
                type="date"
                value={dateRange[0]?.format('YYYY-MM-DD') || ''}
                onChange={(e) => handleMobileDateChange('start', e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
                max={dateRange[1]?.format('YYYY-MM-DD') || ''}
              />
              <span className="text-xs text-gray-500">to</span>
              <input
                type="date"
                value={dateRange[1]?.format('YYYY-MM-DD') || ''}
                onChange={(e) => handleMobileDateChange('end', e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
                min={dateRange[0]?.format('YYYY-MM-DD') || ''}
              />
            </div>
          ) : (
            // Ant Design RangePicker on desktop
            <RangePicker
              size={isMobile ? 'small' : 'middle'}
              style={isMobile ? { width: '100%' } : undefined}
              value={dateRange}
              onChange={setDateRange}
              placeholder={['Start Date', 'End Date']}
            />
          )}
          <Button size={isMobile ? 'small' : 'middle'} icon={<ReloadOutlined />} onClick={fetchData} title="Refresh">
            {isMobile ? null : 'Refresh'}
          </Button>
          <Button size={isMobile ? 'small' : 'middle'} icon={<ExportOutlined />} onClick={handleExport} title="Export">
            {isMobile ? null : 'Export'}
          </Button>
        </Space>
      </div>

      {/* Key Performance Indicators */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Conversion Rate"
              value={kpis.conversionRate}
              suffix="%"
              valueStyle={{ 
                color: kpis.conversionRate > 15 ? 'var(--brand-success)' : kpis.conversionRate > 10 ? 'var(--brand-primary)' : '#cf1322' 
              }}
              prefix={kpis.conversionRate > 15 ? <RiseOutlined /> : <FallOutlined />}
            />
            <div className="text-sm text-gray-500 mt-2">
              {getPerformanceStatus(kpis.conversionRate, { excellent: 20, good: 15, fair: 10 }).text}
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Avg Booking Value"
              value={kpis.averageBookingValue}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: 'var(--brand-primary)' }}
              prefix={<DollarOutlined />}
            />
            <div className="text-sm text-gray-500 mt-2">
              {kpis.averageBookingValue > 100 ? 'High value' : 'Standard'}
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Instructor Utilization"
              value={kpis.instructorUtilization}
              suffix="%"
              valueStyle={{ 
                color: kpis.instructorUtilization > 75 ? 'var(--brand-success)' : kpis.instructorUtilization > 50 ? 'var(--brand-primary)' : 'var(--brand-warning)' 
              }}
              prefix={<TeamOutlined />}
            />
            <div className="text-sm text-gray-500 mt-2">
              {getPerformanceStatus(kpis.instructorUtilization, { excellent: 80, good: 60, fair: 40 }).text}
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Repeat Customer Rate"
              value={kpis.repeatCustomerRate}
              suffix="%"
              valueStyle={{ 
                color: kpis.repeatCustomerRate > 40 ? 'var(--brand-success)' : kpis.repeatCustomerRate > 25 ? 'var(--brand-primary)' : 'var(--brand-warning)' 
              }}
              prefix={<TrophyOutlined />}
            />
            <div className="text-sm text-gray-500 mt-2">
              Customer loyalty metric
            </div>
          </Card>
        </Col>
      </Row>

      {/* Secondary KPIs */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Equipment Utilization"
              value={kpis.equipmentUtilization}
              suffix="%"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Revenue per Customer"
              value={kpis.revenuePerCustomer}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Cancellation Rate"
              value={kpis.bookingCancellationRate}
              suffix="%"
              valueStyle={{ 
                color: kpis.bookingCancellationRate < 5 ? 'var(--brand-success)' : kpis.bookingCancellationRate < 10 ? 'var(--brand-warning)' : '#cf1322' 
              }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Profit Margin"
              value={kpis.profitMargin}
              suffix="%"
              valueStyle={{ 
                color: kpis.profitMargin > 30 ? 'var(--brand-success)' : kpis.profitMargin > 20 ? 'var(--brand-primary)' : 'var(--brand-warning)' 
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Performance Trends */}
  <Card title="Performance Trends">
        <div className="mb-4">
          <Select
            value={metricType}
            onChange={setMetricType}
    size={isMobile ? 'small' : 'middle'}
    style={{ width: isMobile ? 180 : 200 }}
          >
            <Option value="revenue">Revenue Trends</Option>
            <Option value="bookings">Booking Trends</Option>
            <Option value="conversion">Conversion Rate</Option>
            <Option value="avg_value">Average Booking Value</Option>
          </Select>
        </div>
        
        <div className="h-80" style={{ minHeight: '320px', height: '320px' }}>
          {loading || trendsData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                {loading ? (
                  <Spin size="large" />
                ) : (
                  <>
                    <div className="text-lg">No operational data available</div>
                    <div className="text-sm">No metrics found for this period</div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300} aspect={undefined}>
            {metricType === 'revenue' && (
              <ComposedChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis yAxisId="revenue" orientation="left" tickFormatter={(value) => formatCurrency(value)} />
                <YAxis yAxisId="bookings" orientation="right" />
                <RechartsTooltip formatter={createTooltipFormatter('revenue').currency} />
                <Legend />
                <Bar yAxisId="revenue" dataKey="revenue" fill="var(--brand-primary)" name="Revenue" />
                <Line yAxisId="bookings" type="monotone" dataKey="bookings" stroke="var(--brand-success)" name="Bookings" />
              </ComposedChart>
            )}
            
            {metricType === 'bookings' && (
              <AreaChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <RechartsTooltip />
                <Legend />
                <Area type="monotone" dataKey="bookings" stroke="var(--brand-primary)" fill="var(--brand-primary)" fillOpacity={0.3} name="Bookings" />
              </AreaChart>
            )}
            
            {metricType === 'conversion' && (
              <LineChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <RechartsTooltip formatter={(value) => [`${value}%`, 'Conversion Rate']} />
                <Legend />
                <Line type="monotone" dataKey="conversion_rate" stroke="#722ed1" strokeWidth={2} name="Conversion Rate" />
              </LineChart>
            )}
            
            {metricType === 'avg_value' && (
              <BarChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <RechartsTooltip formatter={createTooltipFormatter('avg_value').currency} />
                <Legend />
                <Bar dataKey="avg_booking_value" fill="#13c2c2" name="Average Booking Value" />
              </BarChart>
            )}
          </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Service Performance and Equipment Utilization */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Service Performance">
            <div className="h-64" style={{ minHeight: '256px', height: '256px' }}>
              {loading || servicePerformanceData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    {loading ? (
                      <Spin size="small" />
                    ) : (
                      <>
                        <div className="text-lg">No service data available</div>
                        <div className="text-sm">No service performance data found</div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200} aspect={undefined}>
                <PieChart>
                  <Pie
                    data={servicePerformanceData}
                    dataKey="revenue"
                    nameKey="service_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ service_name, revenue }) => `${service_name}: ${formatCurrency(revenue)}`}
                  >
                    {servicePerformanceData.map((entry) => (
                      <Cell key={`cell-${entry.service_name}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={createTooltipFormatter('revenue').currency} />
                </PieChart>
              </ResponsiveContainer>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="Equipment Utilization">
            <div className="h-64" style={{ minHeight: '256px', height: '256px' }}>
              {loading || equipmentData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    {loading ? (
                      <Spin size="small" />
                    ) : (
                      <>
                        <div className="text-lg">No equipment data available</div>
                        <div className="text-sm">No equipment utilization data found</div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200} aspect={undefined}>
                <BarChart data={equipmentData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => `${value}%`} />
                  <YAxis type="category" dataKey="equipment_type" />
                  <RechartsTooltip formatter={(value) => [`${value}%`, 'Utilization']} />
                  <Bar dataKey="utilization_rate" fill="#722ed1" />
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Instructor Performance Table */}
    <Card title="Instructor Performance">
        <UnifiedTable density={isMobile ? 'compact' : 'comfortable'}>
          <Table
            columns={instructorColumns}
            dataSource={instructorPerformanceData}
            rowKey="instructor_id"
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true
            }}
            scroll={{ x: isMobile ? 'max-content' : 800 }}
          />
        </UnifiedTable>
      </Card>

      {/* Operational Insights */}
      <Card title="Operational Insights">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-800">Performance Highlights</h4>
              
              {kpis.conversionRate > 20 && (
                <Alert
                  message="Excellent Conversion Rate"
                  description={`Your ${kpis.conversionRate.toFixed(1)}% conversion rate is above industry average.`}
                  type="success"
                  showIcon
                />
              )}
              
              {kpis.instructorUtilization < 50 && (
                <Alert
                  message="Low Instructor Utilization"
                  description="Consider optimizing schedules or marketing to increase bookings."
                  type="warning"
                  showIcon
                />
              )}
              
              {kpis.bookingCancellationRate > 10 && (
                <Alert
                  message="High Cancellation Rate"
                  description="Review cancellation policies and customer communication."
                  type="error"
                  showIcon
                />
              )}
            </div>
          </Col>
          
          <Col xs={24} md={12}>
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-800">Optimization Opportunities</h4>
              
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 bg-blue-50 rounded">
                  <div className="text-blue-800 font-medium">Peak Hours</div>
                  <div className="text-sm text-blue-600">
                    Optimize staffing during high-demand periods
                  </div>
                </div>
                
                <div className="p-3 bg-green-50 rounded">
                  <div className="text-green-800 font-medium">Equipment ROI</div>
                  <div className="text-sm text-green-600">
                    Focus on high-utilization equipment types
                  </div>
                </div>
                
                <div className="p-3 bg-purple-50 rounded">
                  <div className="text-purple-800 font-medium">Customer Retention</div>
                  <div className="text-sm text-purple-600">
                    {kpis.repeatCustomerRate > 40 ? 'Strong retention' : 'Opportunity for loyalty programs'}
                  </div>
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

export default OperationalMetricsDashboard;
