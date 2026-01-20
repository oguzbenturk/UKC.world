import { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag, Progress } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * LessonAnalytics - Specialized analytics for lesson revenue
 */
const LessonAnalytics = ({ summaryData, chartData = [] }) => {
  const lessonMetrics = useMemo(() => {
    if (!summaryData) return null;

    // API returns nested structure: { revenue: {...}, netRevenue: {...}, bookings: {...} }
    const revenue = summaryData.revenue || {};
    const netRevenueData = summaryData.netRevenue || {};
    const bookingsData = summaryData.bookings || {};

    const totalBookings = Number(bookingsData.completed_bookings || bookingsData.total_bookings || 0);
    const lessonRevenue = Number(revenue.lesson_revenue || 0);
    const instructorCommission = Number(netRevenueData.commission_total || 0);
    const avgBookingValue = totalBookings > 0 ? lessonRevenue / totalBookings : 0;
    const netRevenue = lessonRevenue - instructorCommission;
    const commissionRate = lessonRevenue > 0 ? (instructorCommission / lessonRevenue) * 100 : 0;

    return {
      totalBookings,
      lessonRevenue,
      instructorCommission,
      avgBookingValue,
      netRevenue,
      commissionRate
    };
  }, [summaryData]);

  const trendData = useMemo(() => {
    if (!chartData.length) return { direction: 'stable', change: 0 };
    
    const first = chartData[0]?.revenue || 0;
    const last = chartData[chartData.length - 1]?.revenue || 0;
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    
    return {
      direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
      change: Math.abs(change)
    };
  }, [chartData]);

  if (!lessonMetrics) {
    return (
      <Card>
        <p className="text-center text-slate-500">No lesson data available</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full">
            <Statistic
              title="Total Bookings"
              value={lessonMetrics.totalBookings}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              {trendData.direction === 'up' && <Tag color="green" icon={<ArrowUpOutlined />}>{trendData.change.toFixed(1)}% increase</Tag>}
              {trendData.direction === 'down' && <Tag color="red" icon={<ArrowDownOutlined />}>{trendData.change.toFixed(1)}% decrease</Tag>}
              {trendData.direction === 'stable' && <Tag>Stable</Tag>}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full">
            <Statistic
              title="Avg Booking Value"
              value={lessonMetrics.avgBookingValue}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#1890ff' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              Per lesson booking
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full">
            <Statistic
              title="Commission Rate"
              value={lessonMetrics.commissionRate}
              precision={1}
              suffix="%"
              valueStyle={{ color: '#cf1322' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              {formatCurrency(lessonMetrics.instructorCommission)} paid
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full">
            <Statistic
              title="Net Profit"
              value={lessonMetrics.netRevenue}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#52c41a' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              After commissions
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Lesson Performance Insights" className="rounded-lg">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Revenue Share</span>
                <span className="text-sm font-semibold text-slate-900">
                  {formatCurrency(lessonMetrics.lessonRevenue)}
                </span>
              </div>
              <Progress 
                percent={100} 
                strokeColor="#10b981"
                showInfo={false}
              />
            </div>
          </Col>

          <Col xs={24} md={12}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Commission Burden</span>
                <span className="text-sm font-semibold text-rose-600">
                  {lessonMetrics.commissionRate.toFixed(1)}%
                </span>
              </div>
              <Progress 
                percent={lessonMetrics.commissionRate} 
                strokeColor="#ef4444"
                showInfo={false}
              />
            </div>
          </Col>
        </Row>

        <div className="mt-4 rounded-lg bg-indigo-50 p-4">
          <div className="flex items-start gap-3">
            <ClockCircleOutlined className="text-lg text-indigo-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-indigo-900">Booking Insights</h4>
              <p className="mt-1 text-xs text-indigo-700">
                Average booking value: <strong>{formatCurrency(lessonMetrics.avgBookingValue)}</strong> with {lessonMetrics.totalBookings} total bookings generating {formatCurrency(lessonMetrics.lessonRevenue)} in revenue.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LessonAnalytics;
