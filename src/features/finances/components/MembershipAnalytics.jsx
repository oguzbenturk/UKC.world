import { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag, Progress } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, CrownOutlined, GiftOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * MembershipAnalytics - Specialized analytics for membership/package revenue
 */
const MembershipAnalytics = ({ summaryData, chartData = [] }) => {
  const membershipMetrics = useMemo(() => {
    if (!summaryData) return null;

    // API returns nested structure: { revenue: {...}, netRevenue: {...} }
    const revenue = summaryData.revenue || {};

    const totalMembership = Number(revenue.membership_revenue || 0);
    const vipRevenue = Number(revenue.vip_membership_revenue || 0);
    const packageRevenue = Number(revenue.package_revenue || 0);
    const vipShare = totalMembership > 0 ? (vipRevenue / totalMembership) * 100 : 0;
    const packageShare = totalMembership > 0 ? (packageRevenue / totalMembership) * 100 : 0;

    return {
      totalMembership,
      vipRevenue,
      packageRevenue,
      vipShare,
      packageShare
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

  if (!membershipMetrics) {
    return (
      <Card>
        <p className="text-center text-slate-500">No membership data available</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card className="h-full">
            <Statistic
              title="Total Membership Revenue"
              value={membershipMetrics.totalMembership}
              formatter={(value) => formatCurrency(value)}
              prefix={<CrownOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              {trendData.direction === 'up' && <Tag color="green" icon={<ArrowUpOutlined />}>{trendData.change.toFixed(1)}% increase</Tag>}
              {trendData.direction === 'down' && <Tag color="red" icon={<ArrowDownOutlined />}>{trendData.change.toFixed(1)}% decrease</Tag>}
              {trendData.direction === 'stable' && <Tag>Stable</Tag>}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="h-full">
            <Statistic
              title="VIP Memberships"
              value={membershipMetrics.vipRevenue}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#1890ff' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              {membershipMetrics.vipShare.toFixed(1)}% of total
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="h-full">
            <Statistic
              title="Package Sales"
              value={membershipMetrics.packageRevenue}
              formatter={(value) => formatCurrency(value)}
              prefix={<GiftOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              {membershipMetrics.packageShare.toFixed(1)}% of total
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Membership Breakdown" className="rounded-lg">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CrownOutlined className="text-indigo-600" />
                  <span className="text-sm text-slate-600">VIP Memberships</span>
                </div>
                <span className="text-sm font-semibold text-indigo-600">
                  {formatCurrency(membershipMetrics.vipRevenue)}
                </span>
              </div>
              <Progress 
                percent={membershipMetrics.vipShare} 
                strokeColor="#5b21b6"
                showInfo={true}
                format={(percent) => `${percent?.toFixed(1)}%`}
              />
            </div>
          </Col>

          <Col xs={24} md={12}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GiftOutlined className="text-emerald-600" />
                  <span className="text-sm text-slate-600">Package Sales</span>
                </div>
                <span className="text-sm font-semibold text-emerald-600">
                  {formatCurrency(membershipMetrics.packageRevenue)}
                </span>
              </div>
              <Progress 
                percent={membershipMetrics.packageShare} 
                strokeColor="#10b981"
                showInfo={true}
                format={(percent) => `${percent?.toFixed(1)}%`}
              />
            </div>
          </Col>
        </Row>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-indigo-50 p-4">
            <div className="flex items-start gap-3">
              <CrownOutlined className="text-lg text-indigo-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-indigo-900">VIP Performance</h4>
                <p className="mt-1 text-xs text-indigo-700">
                  VIP memberships contribute <strong>{membershipMetrics.vipShare.toFixed(1)}%</strong> of total membership revenue with <strong>{formatCurrency(membershipMetrics.vipRevenue)}</strong> generated.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <GiftOutlined className="text-lg text-emerald-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-emerald-900">Package Performance</h4>
                <p className="mt-1 text-xs text-emerald-700">
                  Package sales represent <strong>{membershipMetrics.packageShare.toFixed(1)}%</strong> of membership revenue with <strong>{formatCurrency(membershipMetrics.packageRevenue)}</strong> in sales.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MembershipAnalytics;
