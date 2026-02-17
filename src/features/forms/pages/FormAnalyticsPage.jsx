/**
 * Form Analytics Page
 * Displays analytics and metrics for a specific form
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Spin,
  Button,
  DatePicker,
  Space,
  Progress,
  Table,
  Empty,
  Divider
} from 'antd';
import {
  ArrowLeftOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PercentageOutlined,
  BarChartOutlined,
  LineChartOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as formService from '../services/formService';
import { logger } from '@/shared/utils/logger';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// eslint-disable-next-line complexity
const FormAnalyticsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(30, 'days'),
    dayjs()
  ]);

  // Fetch data on mount and when dependencies change
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [formData, analyticsData] = await Promise.all([
        formService.getFormById(id),
        formService.getFormStats(id, {
          start_date: dateRange[0]?.toISOString(),
          end_date: dateRange[1]?.toISOString()
        })
      ]);
      setForm(formData);
      setAnalytics(analyticsData);
    } catch (err) {
      logger.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (dates) => {
    if (dates) {
      setDateRange(dates);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spin size="large" tip="Loading analytics..." />
      </div>
    );
  }

  if (!form) {
    return (
      <Empty
        description="Form not found"
        extra={
          <Button type="primary" onClick={() => navigate('/forms')}>
            Back to Forms
          </Button>
        }
      />
    );
  }

  const completionRate = analytics?.total_views > 0
    ? Math.round((analytics?.total_submissions / analytics?.total_views) * 100)
    : 0;

  // Step completion data for funnel
  const stepCompletionData = analytics?.step_completion || [];

  // Field error data
  const fieldErrorColumns = [
    {
      title: 'Field',
      dataIndex: 'field_name',
      key: 'field_name',
      render: (text, record) => (
        <div>
          <Text strong>{record.field_label}</Text>
          <br />
          <Text type="secondary" className="text-xs">{text}</Text>
        </div>
      )
    },
    {
      title: 'Validation Errors',
      dataIndex: 'error_count',
      key: 'error_count',
      width: 150,
      align: 'center',
      sorter: (a, b) => a.error_count - b.error_count,
      render: (count) => (
        <Text type={count > 10 ? 'danger' : 'secondary'}>{count}</Text>
      )
    },
    {
      title: 'Skip Rate',
      dataIndex: 'skip_rate',
      key: 'skip_rate',
      width: 150,
      align: 'center',
      render: (rate) => (
        <Progress
          percent={rate || 0}
          size="small"
          status={rate > 20 ? 'exception' : 'normal'}
        />
      )
    }
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/forms')}
          >
            Back
          </Button>
          <div>
            <Title level={4} className="mb-0">{form.form_name}</Title>
            <Text type="secondary">Analytics & Insights</Text>
          </div>
        </div>
        <Space>
          <RangePicker
            value={dateRange}
            onChange={handleDateChange}
            presets={[
              { label: 'Last 7 Days', value: [dayjs().subtract(7, 'days'), dayjs()] },
              { label: 'Last 30 Days', value: [dayjs().subtract(30, 'days'), dayjs()] },
              { label: 'Last 90 Days', value: [dayjs().subtract(90, 'days'), dayjs()] },
              { label: 'This Year', value: [dayjs().startOf('year'), dayjs()] }
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            Refresh
          </Button>
        </Space>
      </div>

      {/* Key Metrics */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={12} sm={6}>
          <Card className="text-center">
            <Statistic
              title="Total Views"
              value={analytics?.total_views || 0}
              prefix={<EyeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="text-center">
            <Statistic
              title="Submissions"
              value={analytics?.total_submissions || 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="text-center">
            <Statistic
              title="Completion Rate"
              value={completionRate}
              suffix="%"
              prefix={<PercentageOutlined />}
              valueStyle={{ color: completionRate >= 50 ? '#52c41a' : '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="text-center">
            <Statistic
              title="Avg. Completion Time"
              value={analytics?.avg_completion_time || 0}
              suffix="min"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Funnel & Step Completion */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BarChartOutlined />
                <span>Step Completion Funnel</span>
              </Space>
            }
          >
            {stepCompletionData.length > 0 ? (
              <div className="space-y-4">
                {stepCompletionData.map((step, index) => (
                  <div key={step.step_id || index}>
                    <div className="flex justify-between mb-1">
                      <Text>{step.step_name || `Step ${index + 1}`}</Text>
                      <Text type="secondary">{step.completion_count || 0} users</Text>
                    </div>
                    <Progress
                      percent={step.completion_rate || 0}
                      strokeColor={{
                        '0%': '#108ee9',
                        '100%': '#87d068',
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="No step data available" />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <LineChartOutlined />
                <span>Submissions Over Time</span>
              </Space>
            }
          >
            {analytics?.daily_submissions?.length > 0 ? (
              <div className="space-y-2">
                {analytics.daily_submissions.slice(-7).map((day) => (
                  <div key={day.date} className="flex items-center gap-4">
                    <Text className="w-24">{dayjs(day.date).format('MMM D')}</Text>
                    <div className="flex-1">
                      <Progress
                        percent={(day.count / Math.max(...analytics.daily_submissions.map(d => d.count))) * 100}
                        showInfo={false}
                        strokeColor="#1890ff"
                      />
                    </div>
                    <Text type="secondary" className="w-12 text-right">{day.count}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="No submission data available" />
            )}
          </Card>
        </Col>
      </Row>

      {/* Field Analytics */}
      <Card
        title="Field-Level Analytics"
        extra={
          <Link to={`/forms/${id}/responses`}>
            View All Responses
          </Link>
        }
      >
        <Table
          columns={fieldErrorColumns}
          dataSource={analytics?.field_stats || []}
          rowKey="field_name"
          pagination={false}
          locale={{
            emptyText: <Empty description="No field analytics available" />
          }}
        />
      </Card>

      <Divider />

      {/* Quick Actions */}
      <div className="flex justify-center gap-4">
        <Button onClick={() => navigate(`/forms/builder/${id}`)}>
          Edit Form
        </Button>
        <Button onClick={() => navigate(`/forms/${id}/responses`)}>
          View Responses
        </Button>
        <Button onClick={() => navigate(`/forms/preview/${id}`)}>
          Preview Form
        </Button>
      </div>
    </div>
  );
};

export default FormAnalyticsPage;
