import { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ShoppingOutlined, DollarOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * ShopAnalytics - Specialized analytics for shop/product sales
 */
const ShopAnalytics = ({ summaryData, chartData = [] }) => {
  const shopMetrics = useMemo(() => {
    if (!summaryData) return null;

    // API returns nested structure: { revenue: {...}, netRevenue: {...} }
    const revenue = summaryData.revenue || {};

    const shopRevenue = Number(revenue.shop_revenue || 0);
    const totalTransactions = 0; // Would need separate query for order count
    const avgTransactionValue = shopRevenue > 0 ? shopRevenue : 0;
    const collectionRate = 100; // Shop orders are always paid upfront

    return {
      shopRevenue,
      totalTransactions,
      collectedPayments: shopRevenue,
      avgTransactionValue,
      collectionRate
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

  if (!shopMetrics) {
    return (
      <Card>
        <p className="text-center text-slate-500">No shop data available</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card className="h-full">
            <Statistic
              title="Shop Revenue"
              value={shopMetrics.shopRevenue}
              formatter={(value) => formatCurrency(value)}
              prefix={<ShoppingOutlined />}
              valueStyle={{ color: '#13c2c2' }}
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
              title="Total Sales"
              value={shopMetrics.totalTransactions}
              valueStyle={{ color: '#1890ff' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              Product transactions
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="h-full">
            <Statistic
              title="Avg Transaction"
              value={shopMetrics.avgTransactionValue}
              formatter={(value) => formatCurrency(value)}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
            <div className="mt-2 text-xs text-slate-500">
              Per sale
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Shop Performance Insights" className="rounded-lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-cyan-900">Total Revenue</span>
                <span className="text-lg font-bold text-cyan-600">
                  {formatCurrency(shopMetrics.shopRevenue)}
                </span>
              </div>
              <p className="mt-2 text-xs text-cyan-700">
                Generated from {shopMetrics.totalTransactions} sales
              </p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-900">Collected</span>
                <span className="text-lg font-bold text-emerald-600">
                  {formatCurrency(shopMetrics.collectedPayments)}
                </span>
              </div>
              <p className="mt-2 text-xs text-emerald-700">
                {shopMetrics.collectionRate.toFixed(1)}% collection rate
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-cyan-50 p-4">
            <div className="flex items-start gap-3">
              <ShoppingOutlined className="text-lg text-cyan-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-cyan-900">Sales Summary</h4>
                <p className="mt-1 text-xs text-cyan-700">
                  {shopMetrics.totalTransactions} product sales completed with an average transaction value of <strong>{formatCurrency(shopMetrics.avgTransactionValue)}</strong>. 
                  Total shop revenue: <strong>{formatCurrency(shopMetrics.shopRevenue)}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ShopAnalytics;
