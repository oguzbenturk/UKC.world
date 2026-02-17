import { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag, Progress, Alert } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ToolOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * RentalAnalytics - Specialized analytics for rental revenue
 */
const RentalAnalytics = ({ summaryData, chartData = [] }) => {
  const rentalMetrics = useMemo(() => {
    if (!summaryData) return null;

    // API returns nested structure: { revenue: {...}, netRevenue: {...}, balances: {...} }
    const revenue = summaryData.revenue || {};
    const balances = summaryData.balances || {};

    const rentalRevenue = Number(revenue.rental_revenue || 0);
    const outstandingBalance = Number(balances.total_customer_debt || 0);
    const collectedPayments = Number(balances.total_customer_credit || 0);
    const avgRentalValue = rentalRevenue > 0 ? rentalRevenue / 10 : 0; // Placeholder for actual rental count
    const collectionRate = rentalRevenue > 0 ? 100 : 0;
    const overdueAmount = outstandingBalance;

    return {
      totalRentals: 0, // Would need separate query for actual count
      rentalRevenue,
      outstandingBalance,
      collectedPayments,
      avgRentalValue,
      collectionRate,
      overdueAmount
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

  if (!rentalMetrics) {
    return (
      <Card>
        <p className="text-center text-slate-500">No rental data available</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {rentalMetrics.overdueAmount > 0 && (
        <Alert
          message="Outstanding Rentals Detected"
          description={`${formatCurrency(rentalMetrics.overdueAmount)} in uncollected rental payments. Consider following up with customers.`}
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full">
            <Statistic
              title="Total Rentals"
              value={rentalMetrics.totalRentals}
              prefix={<ToolOutlined />}
              valueStyle={{ color: '#fa8c16' }}
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
              title="Avg Rental Value"
              value={rentalMetrics.avgRentalValue}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#1890ff' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              Per rental transaction
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full">
            <Statistic
              title="Collection Rate"
              value={rentalMetrics.collectionRate}
              precision={1}
              suffix="%"
              valueStyle={{ color: rentalMetrics.collectionRate >= 90 ? '#52c41a' : '#faad14' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              {formatCurrency(rentalMetrics.collectedPayments)} collected
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full">
            <Statistic
              title="Outstanding"
              value={rentalMetrics.outstandingBalance}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: rentalMetrics.outstandingBalance > 0 ? '#cf1322' : '#52c41a' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              {rentalMetrics.outstandingBalance > 0 ? 'Needs follow-up' : 'All settled'}
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Rental Performance Insights" className="rounded-lg">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Revenue Collected</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {formatCurrency(rentalMetrics.collectedPayments)}
                </span>
              </div>
              <Progress 
                percent={rentalMetrics.collectionRate} 
                strokeColor="#10b981"
                showInfo={true}
                format={(percent) => `${percent?.toFixed(1)}%`}
              />
            </div>
          </Col>

          <Col xs={24} md={12}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Outstanding Balance</span>
                <span className="text-sm font-semibold text-rose-600">
                  {formatCurrency(rentalMetrics.outstandingBalance)}
                </span>
              </div>
              <Progress 
                percent={rentalMetrics.outstandingBalance > 0 ? ((rentalMetrics.outstandingBalance / rentalMetrics.rentalRevenue) * 100) : 0}
                strokeColor="#ef4444"
                showInfo={true}
                format={(percent) => `${percent?.toFixed(1)}%`}
              />
            </div>
          </Col>
        </Row>

        <div className="mt-4 rounded-lg bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <ToolOutlined className="text-lg text-orange-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-orange-900">Equipment Utilization</h4>
              <p className="mt-1 text-xs text-orange-700">
                {rentalMetrics.totalRentals} rentals processed with an average value of <strong>{formatCurrency(rentalMetrics.avgRentalValue)}</strong>. 
                Collection rate: <strong>{rentalMetrics.collectionRate.toFixed(1)}%</strong>
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default RentalAnalytics;
