// src/features/finances/components/CustomerFinancialAnalytics.jsx
/* eslint-disable complexity */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Card, 
  Table, 
  Select, 
  DatePicker, 
  Row, 
  Col, 
  Statistic, 
  Tag, 
  Button,
  Input,
  Space,
  Tooltip,
  Modal,
  Tabs,
  Avatar,
  Progress,
  Alert,
  Spin
} from 'antd';
import {
  UserOutlined,
  TrophyOutlined,
  SearchOutlined,
  ExportOutlined,
  InfoCircleOutlined,
 
} from '@ant-design/icons';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import FinancialAnalyticsService from '../services/financialAnalytics';
import ReportingService from '../services/reportingService';
import { calculateCLV, calculateFinancialHealthScore } from '../utils/financialCalculations';
import { CHART_COLORS } from '../utils/chartHelpers';
import { formatCurrency, formatDate } from '@/shared/utils/formatters';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Search } = Input;

function CustomerFinancialAnalytics() {
  const [loading, setLoading] = useState(true);
  const [customerData, setCustomerData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('clv');
  const [dateRange, setDateRange] = useState([null, null]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  // Aggregate (reserved for future charts)

  // Fetch customer analytics data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = dateRange[0]?.format('YYYY-MM-DD') || null;
      const endDate = dateRange[1]?.format('YYYY-MM-DD') || null;
      
  const response = await FinancialAnalyticsService.getCustomerAnalytics(startDate, endDate);
  setCustomerData(response.details || []);
    } catch {
      // silent fail in UI
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate enhanced customer metrics
  const enhancedCustomerData = useMemo(() => {
    return customerData.map(customer => {
      const totalSpent = parseFloat(customer.total_spent) || 0;
      const totalBookings = parseInt(customer.total_bookings) || 0;
      const monthsActive = parseInt(customer.months_active) || 1;
      const daysSinceLastBooking = parseInt(customer.days_since_last_booking) || 0;
      
      const clv = calculateCLV(totalSpent, totalBookings, monthsActive);
      const avgBookingValue = totalBookings > 0 ? totalSpent / totalBookings : 0;
      const bookingFrequency = monthsActive > 0 ? totalBookings / monthsActive : 0;
      const healthScore = calculateFinancialHealthScore({
        totalSpent,
        totalBookings,
        monthsActive,
        daysSinceLastBooking,
        outstandingBalance: parseFloat(customer.outstanding_balance) || 0
      });

      // Customer segment classification
      let segment = 'New';
      if (totalSpent > 1000 && totalBookings > 10) segment = 'VIP';
      else if (totalSpent > 500 && totalBookings > 5) segment = 'Loyal';
      else if (totalSpent > 200 && totalBookings > 2) segment = 'Regular';
      else if (daysSinceLastBooking > 180) segment = 'Inactive';

      return {
        ...customer,
        clv,
        avgBookingValue,
        bookingFrequency,
        healthScore,
        segment
      };
    });
  }, [customerData]);

  // Filter and search data
  useEffect(() => {
    let filtered = enhancedCustomerData;

    // Apply search filter
    if (searchText) {
      filtered = filtered.filter(customer =>
        customer.customer_name?.toLowerCase().includes(searchText.toLowerCase()) ||
        customer.customer_email?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // Apply segment filter
    if (segmentFilter !== 'all') {
      filtered = filtered.filter(customer => customer.segment === segmentFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'clv':
          return b.clv - a.clv;
        case 'totalSpent':
          return (parseFloat(b.total_spent) || 0) - (parseFloat(a.total_spent) || 0);
        case 'bookingFrequency':
          return b.bookingFrequency - a.bookingFrequency;
        case 'healthScore':
          return b.healthScore - a.healthScore;
        case 'lastBooking':
          return new Date(b.last_booking_date || 0) - new Date(a.last_booking_date || 0);
        default:
          return 0;
      }
    });

    setFilteredData(filtered);
  }, [enhancedCustomerData, searchText, segmentFilter, sortBy]);

  // Customer segments summary
  const segmentSummary = useMemo(() => {
    const segments = enhancedCustomerData.reduce((acc, customer) => {
      const segment = customer.segment;
      if (!acc[segment]) {
        acc[segment] = { count: 0, totalSpent: 0, avgCLV: 0 };
      }
      acc[segment].count++;
      acc[segment].totalSpent += parseFloat(customer.total_spent) || 0;
      acc[segment].avgCLV += customer.clv;
      return acc;
    }, {});

    // Calculate averages
    Object.keys(segments).forEach(segment => {
      if (segments[segment].count > 0) {
        segments[segment].avgCLV = segments[segment].avgCLV / segments[segment].count;
      }
    });

    return segments;
  }, [enhancedCustomerData]);

  // Chart data preparation
  const clvDistributionData = useMemo(() => {
      const ranges = [
        { range: '0-100', min: 0, max: 100 },
        { range: '100-250', min: 100, max: 250 },
        { range: '250-500', min: 250, max: 500 },
        { range: '500-1000', min: 500, max: 1000 },
        { range: '1000+', min: 1000, max: Infinity }
      ];

    return ranges.map(({ range, min, max }) => ({
      range,
      count: enhancedCustomerData.filter(c => c.clv >= min && c.clv < max).length
    }));
  }, [enhancedCustomerData]);

  const segmentChartData = useMemo(() => {
    return Object.entries(segmentSummary).map(([segment, data], index) => ({
      name: segment,
      value: data.count,
      revenue: data.totalSpent,
      fill: CHART_COLORS[index % CHART_COLORS.length]
    }));
  }, [segmentSummary]);

  // Table columns
  const columns = [
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (text, record) => (
        <div className="flex items-center gap-3">
          <Avatar icon={<UserOutlined />} />
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-sm text-gray-500">{record.customer_email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Segment',
      dataIndex: 'segment',
      key: 'segment',
      render: (segment) => {
        const colorMap = {
          VIP: 'gold',
          Loyal: 'green',
          Regular: 'blue',
          New: 'cyan',
          Inactive: 'red'
        };
        return <Tag color={colorMap[segment]}>{segment}</Tag>;
      },
      filters: [
        { text: 'VIP', value: 'VIP' },
        { text: 'Loyal', value: 'Loyal' },
        { text: 'Regular', value: 'Regular' },
        { text: 'New', value: 'New' },
        { text: 'Inactive', value: 'Inactive' }
      ],
    },
    {
      title: 'CLV',
      dataIndex: 'clv',
      key: 'clv',
      render: (clv) => (
        <span className="font-semibold text-green-600">
          {formatCurrency(clv)}
        </span>
      ),
      sorter: (a, b) => a.clv - b.clv,
    },
    {
      title: 'Total Spent',
      dataIndex: 'total_spent',
      key: 'total_spent',
      render: (amount) => formatCurrency(parseFloat(amount) || 0),
      sorter: (a, b) => (parseFloat(a.total_spent) || 0) - (parseFloat(b.total_spent) || 0),
    },
    {
      title: 'Bookings',
      dataIndex: 'total_bookings',
      key: 'total_bookings',
      render: (count, record) => (
        <Tooltip title={`Avg value: ${formatCurrency(record.avgBookingValue)}`}>
          <span>{count}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Frequency',
      key: 'frequency',
      render: (_, record) => (
        <Tooltip title="Bookings per month">
          <span>{record.bookingFrequency.toFixed(1)}/month</span>
        </Tooltip>
      ),
    },
    {
      title: 'Health Score',
      key: 'health_score',
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Progress
            percent={record.healthScore}
            size="small"
            status={record.healthScore > 70 ? 'success' : record.healthScore > 40 ? 'normal' : 'exception'}
            showInfo={false}
            style={{ width: 60 }}
          />
          <span className="text-sm">{record.healthScore}%</span>
        </div>
      ),
    },
    {
      title: 'Last Booking',
      dataIndex: 'last_booking_date',
      key: 'last_booking_date',
      render: (date, record) => (
        <div>
          <div>{date ? formatDate(date) : 'Never'}</div>
          {record.days_since_last_booking > 0 && (
            <div className="text-sm text-gray-500">
              {record.days_since_last_booking} days ago
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button
          type="link"
          icon={<InfoCircleOutlined />}
          onClick={() => {
            setSelectedCustomer(record);
            setDetailModalVisible(true);
          }}
        >
          Details
        </Button>
      ),
    },
  ];

  const handleExport = async () => {
    try {
      await ReportingService.exportToCSV(filteredData, 'customer-analytics');
    } catch {
      // ignore export error in UI
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Customer Financial Analytics</h2>
        <Space>
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            placeholder={['Start Date', 'End Date']}
          />
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            Export
          </Button>
        </Space>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Customers"
              value={enhancedCustomerData.length}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Average CLV"
              value={enhancedCustomerData.reduce((sum, c) => sum + c.clv, 0) / enhancedCustomerData.length || 0}
              formatter={(value) => formatCurrency(value)}
              prefix={<TrophyOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="VIP Customers"
              value={segmentSummary.VIP?.count || 0}
              suffix={`(${((segmentSummary.VIP?.count || 0) / enhancedCustomerData.length * 100).toFixed(1)}%)`}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Inactive Customers"
              value={segmentSummary.Inactive?.count || 0}
              suffix={`(${((segmentSummary.Inactive?.count || 0) / enhancedCustomerData.length * 100).toFixed(1)}%)`}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Customer Segments">
            <div className="h-64" style={{ minHeight: '256px', height: '256px' }}>
              {loading || segmentChartData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    {loading ? (
                      <Spin size="small" />
                    ) : (
                      <>
                        <div className="text-lg">No customer data available</div>
                        <div className="text-sm">No customer segments found</div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200} aspect={undefined}>
                <PieChart>
                  <Pie
                    data={segmentChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {segmentChartData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="CLV Distribution">
            <div className="h-64" style={{ minHeight: '256px', height: '256px' }}>
              {loading || clvDistributionData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    {loading ? (
                      <Spin size="small" />
                    ) : (
                      <>
                        <div className="text-lg">No CLV data available</div>
                        <div className="text-sm">No customer lifetime value data found</div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200} aspect={undefined}>
                <BarChart data={clvDistributionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#1890ff" />
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4 items-center">
          <Search
            placeholder="Search customers..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 250 }}
            prefix={<SearchOutlined />}
          />
          
          <Select
            value={segmentFilter}
            onChange={setSegmentFilter}
            style={{ width: 150 }}
          >
            <Option value="all">All Segments</Option>
            <Option value="VIP">VIP</Option>
            <Option value="Loyal">Loyal</Option>
            <Option value="Regular">Regular</Option>
            <Option value="New">New</Option>
            <Option value="Inactive">Inactive</Option>
          </Select>
          
          <Select
            value={sortBy}
            onChange={setSortBy}
            style={{ width: 150 }}
          >
            <Option value="clv">Sort by CLV</Option>
            <Option value="totalSpent">Sort by Spent</Option>
            <Option value="bookingFrequency">Sort by Frequency</Option>
            <Option value="healthScore">Sort by Health</Option>
            <Option value="lastBooking">Sort by Last Booking</Option>
          </Select>
        </div>
      </Card>

      {/* Customer Table */}
      <Card>
        <UnifiedTable density="comfortable">
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="customer_id"
            loading={loading}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `${range[0]}-${range[1]} of ${total} customers`,
            }}
            scroll={{ x: 1200 }}
          />
        </UnifiedTable>
      </Card>

      {/* Customer Detail Modal */}
      <Modal
        title={`Customer Analysis - ${selectedCustomer?.customer_name}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedCustomer && (
          <Tabs
            defaultActiveKey="overview"
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Card size="small" title="Financial Metrics">
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span>Customer Lifetime Value:</span>
                            <span className="font-semibold">{formatCurrency(selectedCustomer.clv)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total Spent:</span>
                            <span>{formatCurrency(parseFloat(selectedCustomer.total_spent) || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Average Booking Value:</span>
                            <span>{formatCurrency(selectedCustomer.avgBookingValue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Outstanding Balance:</span>
                            <span className={parseFloat(selectedCustomer.outstanding_balance) > 0 ? 'text-red-600' : 'text-green-600'}>
                              {formatCurrency(parseFloat(selectedCustomer.outstanding_balance) || 0)}
                            </span>
                          </div>
                        </div>
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card size="small" title="Behavior Metrics">
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span>Total Bookings:</span>
                            <span className="font-semibold">{selectedCustomer.total_bookings}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Booking Frequency:</span>
                            <span>{selectedCustomer.bookingFrequency.toFixed(1)}/month</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Customer Since:</span>
                            <span>{formatDate(selectedCustomer.first_booking_date)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Last Booking:</span>
                            <span>{formatDate(selectedCustomer.last_booking_date)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Health Score:</span>
                            <span className="font-semibold">{selectedCustomer.healthScore}%</span>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  </Row>
                )
              },
              {
                key: 'insights',
                label: 'Insights',
                children: (
                  <div className="space-y-4">
                    {selectedCustomer.segment === 'VIP' && (
                      <Alert
                        message="VIP Customer"
                        description="This customer is in your top tier. Ensure excellent service and consider exclusive offers."
                        type="success"
                        showIcon
                      />
                    )}
                    {selectedCustomer.healthScore < 40 && (
                      <Alert
                        message="At-Risk Customer"
                        description="This customer shows signs of declining engagement. Consider re-engagement strategies."
                        type="warning"
                        showIcon
                      />
                    )}
                    {selectedCustomer.days_since_last_booking > 180 && (
                      <Alert
                        message="Inactive Customer"
                        description="This customer hasn't booked in over 6 months. Consider win-back campaigns."
                        type="error"
                        showIcon
                      />
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 rounded">
                        <div className="text-blue-800 font-medium">Revenue Potential</div>
                        <div className="text-2xl font-bold text-blue-900">
                          {selectedCustomer.clv > 500 ? 'High' : selectedCustomer.clv > 200 ? 'Medium' : 'Low'}
                        </div>
                      </div>
                      <div className="p-4 bg-green-50 rounded">
                        <div className="text-green-800 font-medium">Loyalty Level</div>
                        <div className="text-2xl font-bold text-green-900">
                          {selectedCustomer.bookingFrequency > 2 ? 'High' : selectedCustomer.bookingFrequency > 1 ? 'Medium' : 'Low'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }
            ]}
          />
        )}
      </Modal>
    </div>
  );
}

export default CustomerFinancialAnalytics;
