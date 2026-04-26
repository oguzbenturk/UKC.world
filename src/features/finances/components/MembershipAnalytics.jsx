import { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag, Progress } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, CrownOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * MembershipAnalytics - Specialized analytics for membership revenue
 */
const MembershipAnalytics = ({ summaryData, chartData = [] }) => {
  const membershipMetrics = useMemo(() => {
    if (!summaryData) return null;

    const revenue = summaryData.revenue || {};
    const balances = summaryData.balances || {};

    const membershipRevenue = Number(revenue.membership_revenue || revenue.vip_membership_revenue || 0);
    const membershipCount = Number(revenue.membership_count || 0);
    const outstandingBalance = Number(balances.total_customer_debt || 0);
    const avgValue = membershipCount > 0 ? membershipRevenue / membershipCount : 0;
    const managerCommission = Number(summaryData.managerCommission?.total || 0);
    const netRevenue = membershipRevenue - managerCommission;

    return {
      membershipRevenue,
      membershipCount,
      avgValue,
      outstandingBalance,
      managerCommission,
      netRevenue
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
              value={membershipMetrics.membershipRevenue}
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
              title="Avg Membership Value"
              value={membershipMetrics.avgValue}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#1890ff' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              Per membership purchase
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="h-full">
            <Statistic
              title="Outstanding"
              value={membershipMetrics.outstandingBalance}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: membershipMetrics.outstandingBalance > 0 ? '#cf1322' : '#52c41a' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              {membershipMetrics.outstandingBalance > 0 ? 'Needs follow-up' : 'All settled'}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="h-full">
            <Statistic
              title="Manager Commission"
              value={membershipMetrics.managerCommission}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#e11d48' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              Configured rate · paid to manager
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="h-full">
            <Statistic
              title="Net Membership Revenue"
              value={membershipMetrics.netRevenue}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#52c41a' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              After manager commission
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Membership Performance" className="rounded-lg">
        <div className="rounded-lg bg-purple-50 p-4">
          <div className="flex items-start gap-3">
            <CrownOutlined className="text-lg text-purple-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-purple-900">Membership Sales</h4>
              <p className="mt-1 text-xs text-purple-700">
                Total membership revenue of <strong>{formatCurrency(membershipMetrics.membershipRevenue)}</strong> with 
                an average value of <strong>{formatCurrency(membershipMetrics.avgValue)}</strong> per purchase.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MembershipAnalytics;
