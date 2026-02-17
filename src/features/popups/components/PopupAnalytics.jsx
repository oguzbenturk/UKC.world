import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Select,
  DatePicker,
  Space,
  Typography,
  Empty,
  Spin,
  Progress
} from 'antd';
import {
  EyeOutlined,
  ThunderboltOutlined,
  CloseOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

const { RangePicker } = DatePicker;
const { Title } = Typography;
const { Option } = Select;

// eslint-disable-next-line complexity
const PopupAnalytics = ({ popupId }) => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('7d');
  const [dateRange, setDateRange] = useState(null);

  const loadAnalytics = useCallback(async () => {
    if (!popupId) return;
    
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (timeRange && timeRange !== 'custom') {
        params.append('period', timeRange);
      }
      if (dateRange) {
        params.append('startDate', dateRange[0].format('YYYY-MM-DD'));
        params.append('endDate', dateRange[1].format('YYYY-MM-DD'));
      }

      const response = await fetch(`/api/popups/${popupId}/analytics?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [popupId, timeRange, dateRange]);

  useEffect(() => {
    if (popupId) {
      loadAnalytics();
    }
  }, [popupId, loadAnalytics]);

  if (!popupId) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <Empty 
          description="Select a popup to view analytics"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <Empty description="No analytics data available" />
      </div>
    );
  }

  const { overview, events, performance } = analytics;

  const eventColumns = [
    {
      title: 'Event Type',
      dataIndex: 'event_type',
      key: 'event_type',
      render: (type) => {
        const icons = {
          view: <EyeOutlined style={{ color: '#1890ff' }} />,
          click: <ThunderboltOutlined style={{ color: '#52c41a' }} />,
          dismiss: <CloseOutlined style={{ color: '#ff4d4f' }} />
        };
        return (
          <Space>
            {icons[type]}
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </Space>
        );
      }
    },
    {
      title: 'Count',
      dataIndex: 'count',
      key: 'count',
      sorter: (a, b) => a.count - b.count
    },
    {
      title: 'Percentage',
      dataIndex: 'percentage',
      key: 'percentage',
      render: (percentage) => `${percentage.toFixed(1)}%`
    },
    {
      title: 'Trend',
      key: 'trend',
      render: (_, record) => (
        <Progress 
          percent={record.percentage} 
          size="small" 
          showInfo={false}
          strokeColor={
            record.event_type === 'view' ? '#1890ff' :
            record.event_type === 'click' ? '#52c41a' : '#ff4d4f'
          }
        />
      )
    }
  ];

  const conversionRate = overview.totalClicks > 0 
    ? ((overview.totalClicks / overview.totalViews) * 100).toFixed(1)
    : 0;

  const dismissalRate = overview.totalDismissals > 0
    ? ((overview.totalDismissals / overview.totalViews) * 100).toFixed(1)
    : 0;

  return (
    <div style={{ padding: '16px' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: '24px' }}>
        <Col>
          <Title level={4}>Popup Analytics</Title>
        </Col>
        <Col>
          <Space>
            <Select
              value={timeRange}
              onChange={setTimeRange}
              style={{ width: 120 }}
            >
              <Option value="1d">Last 24h</Option>
              <Option value="7d">Last 7 days</Option>
              <Option value="30d">Last 30 days</Option>
              <Option value="90d">Last 90 days</Option>
              <Option value="custom">Custom</Option>
            </Select>
            {timeRange === 'custom' && (
              <RangePicker
                onChange={setDateRange}
                style={{ width: 240 }}
              />
            )}
          </Space>
        </Col>
      </Row>

      {/* Overview Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Views"
              value={overview.totalViews || 0}
              prefix={<EyeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Clicks"
              value={overview.totalClicks || 0}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Conversion Rate"
              value={conversionRate}
              suffix="%"
              prefix={<TrophyOutlined />}
              valueStyle={{ 
                color: conversionRate > 10 ? '#52c41a' : 
                       conversionRate > 5 ? '#faad14' : '#ff4d4f' 
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Dismissal Rate"
              value={dismissalRate}
              suffix="%"
              prefix={<CloseOutlined />}
              valueStyle={{ 
                color: dismissalRate < 30 ? '#52c41a' : 
                       dismissalRate < 50 ? '#faad14' : '#ff4d4f' 
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Event Breakdown */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} lg={12}>
          <UnifiedTable title="Event Breakdown" density="compact">
            <Table
              dataSource={events || []}
              columns={eventColumns}
              pagination={false}
              size="small"
              rowKey="event_type"
            />
          </UnifiedTable>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Performance Metrics" size="small">
            <Row gutter={[8, 8]}>
              <Col span={24}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Engagement Score</span>
                    <span>{performance?.engagementScore || 0}/100</span>
                  </div>
                  <Progress 
                    percent={performance?.engagementScore || 0} 
                    strokeColor={{
                      '0%': '#ff4d4f',
                      '50%': '#faad14',
                      '100%': '#52c41a'
                    }}
                  />
                </div>
              </Col>
              <Col span={24}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>User Satisfaction</span>
                    <span>{performance?.satisfactionScore || 0}/100</span>
                  </div>
                  <Progress 
                    percent={performance?.satisfactionScore || 0}
                    strokeColor={{
                      '0%': '#ff4d4f',
                      '50%': '#faad14', 
                      '100%': '#52c41a'
                    }}
                  />
                </div>
              </Col>
              <Col span={24}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Effectiveness</span>
                    <span>{performance?.effectivenessScore || 0}/100</span>
                  </div>
                  <Progress 
                    percent={performance?.effectivenessScore || 0}
                    strokeColor={{
                      '0%': '#ff4d4f',
                      '50%': '#faad14',
                      '100%': '#52c41a'
                    }}
                  />
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* User Feedback */}
      {analytics.feedback && analytics.feedback.length > 0 && (
        <Row>
          <Col span={24}>
            <UnifiedTable title="Recent User Feedback" density="compact">
              <Table
                dataSource={analytics.feedback}
                columns={[
                  {
                    title: 'Date',
                    dataIndex: 'created_at',
                    key: 'created_at',
                    render: (date) => new Date(date).toLocaleDateString()
                  },
                  {
                    title: 'Rating',
                    dataIndex: 'rating',
                    key: 'rating',
                    render: (rating) => '⭐'.repeat(rating || 0)
                  },
                  {
                    title: 'Comment',
                    dataIndex: 'comment',
                    key: 'comment',
                    ellipsis: true
                  }
                ]}
                pagination={{ pageSize: 5 }}
                size="small"
                rowKey="id"
              />
            </UnifiedTable>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default PopupAnalytics;
