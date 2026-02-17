// src/features/finances/components/RevenueAnalyticsDashboard.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Row, Col, Spin, Alert, Statistic, Button, Grid, Segmented, Progress, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import FinancialAnalyticsService from '../services/financialAnalytics';
import { 
  prepareRevenueChartData, 
  prepareServicePieChartData,
  createTooltipFormatter
} from '../utils/chartHelpers';
import { formatCurrency } from '@/shared/utils/formatters';

const { useBreakpoint } = Grid;

const DEFAULT_KPIS = {
  totalTransactions: 0,
  collectedRevenue: 0,
  lessonRevenue: 0,
  rentalRevenue: 0,
  lessonPercentage: 0,
  rentalPercentage: 0,
  missingTransactions: 0,
  calculatedMissing: 0,
  outstandingBalances: 0,
  serviceRevenueTotal: 0
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const resolveWithFallback = (primary, fallback) => {
  if (primary !== 0) {
    return primary;
  }
  return fallback !== 0 ? fallback : primary;
};

// eslint-disable-next-line complexity
function RevenueAnalyticsDashboard({ dateRange, onDateRangeChange: _onDateRangeChange, serviceType = 'all' }) {
  const mode = 'accrual';
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [chartType, setChartType] = useState('line');
  const [groupBy, setGroupBy] = useState('day');

  // Fetch revenue analytics data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [summary, analytics] = await Promise.all([
        FinancialAnalyticsService.getFinancialSummary(dateRange.startDate, dateRange.endDate, serviceType, mode),
        FinancialAnalyticsService.getRevenueAnalytics(dateRange.startDate, dateRange.endDate, groupBy, mode, serviceType)
      ]);
      
      setData({ summary, analytics });
  } catch {
      setError('Failed to load revenue analytics data');
    } finally {
      setLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate, groupBy, mode, serviceType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!data?.analytics?.trends) return [];
    return prepareRevenueChartData(data.analytics.trends);
  }, [data]);

  const serviceChartData = useMemo(() => {
    if (!data?.analytics?.servicePerformance) return [];
    return prepareServicePieChartData(data.analytics.servicePerformance);
  }, [data]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const summary = data?.summary;
    if (!summary) {
      return DEFAULT_KPIS;
    }

    const revenue = summary.revenue || {};
    const ledger = summary.serviceLedger || {};
    const ledgerTotals = ledger.expectedByService || {};
  const balances = summary.balances || {};

    const serviceRevenueTotal = Object.values(ledgerTotals).reduce(
      (sum, value) => sum + toNumber(value),
      0
    ) || (toNumber(revenue.total_revenue) || 0);
    const collectedRevenue = resolveWithFallback(
      toNumber(revenue.total_revenue),
      toNumber(ledger.expectedTotal)
    );
    const lessonRevenue = resolveWithFallback(
      toNumber(revenue.lesson_revenue),
      toNumber(ledgerTotals.lesson)
    );
    const rentalRevenue = resolveWithFallback(
      toNumber(revenue.rental_revenue),
      toNumber(ledgerTotals.rental)
    );
    const totalTransactions = resolveWithFallback(
      toNumber(revenue.total_transactions),
      toNumber(ledger.entryCount)
    );
    const denominator = serviceRevenueTotal > 0 ? serviceRevenueTotal : collectedRevenue;
    const lessonPercentage = denominator > 0 ? (lessonRevenue / denominator) * 100 : 0;
    const rentalPercentage = denominator > 0 ? (rentalRevenue / denominator) * 100 : 0;
    const outstandingBalances = toNumber(balances.total_customer_debt);
    const calculatedMissing = Math.max(0, serviceRevenueTotal - collectedRevenue);
    const missingTransactions = outstandingBalances !== 0 ? outstandingBalances : calculatedMissing;

    return {
      totalTransactions,
      collectedRevenue,
      lessonRevenue,
      rentalRevenue,
      lessonPercentage,
      rentalPercentage,
      missingTransactions,
      calculatedMissing,
      outstandingBalances,
      serviceRevenueTotal
    };
  }, [data]);

  const serviceDescriptor = useMemo(() => {
    switch (serviceType) {
      case 'lesson':
        return 'lesson revenue';
      case 'rental':
        return 'rental revenue';
      case 'accommodation':
        return 'accommodation revenue';
      case 'shop':
        return 'shop revenue';
      case 'all':
      default:
        return 'all services';
    }
  }, [serviceType]);

  const kpiCardStyles = useMemo(
    () => ({ body: { display: 'flex', flexDirection: 'column', gap: 8, height: '100%' } }),
    []
  );

  const chartTotals = useMemo(() => {
    if (!chartData.length) {
      return {
        totalSeriesRevenue: 0,
        totalTransactions: 0,
        averageTransactionValue: 0,
        peakPeriod: null,
        peakRevenue: 0,
        trendDirection: 'No data',
        trendDelta: 0
      };
    }

    const totalSeriesRevenue = chartData.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const totalTransactions = chartData.reduce((sum, item) => sum + (item.transactionCount || 0), 0);
    const averageTransactionValue = totalTransactions > 0 ? totalSeriesRevenue / totalTransactions : 0;
    const peakEntry = chartData.reduce((max, item) => (item.revenue > max.revenue ? item : max), chartData[0]);
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    const baseline = first?.revenue || 0;
    let trendDelta = 0;

    if (baseline > 0) {
      trendDelta = ((last.revenue - baseline) / baseline) * 100;
    } else if (last.revenue > 0) {
      trendDelta = 100;
    }

    let trendDirection = 'Stable';
    if (trendDelta > 5) trendDirection = 'Growing';
    if (trendDelta < -5) trendDirection = 'Declining';

    return {
      totalSeriesRevenue,
      totalTransactions,
      averageTransactionValue,
      peakPeriod: peakEntry?.period || null,
      peakRevenue: peakEntry?.revenue || 0,
      trendDirection,
      trendDelta
    };
  }, [chartData]);

  const recentPeriods = useMemo(() => {
    if (!chartData.length) return [];
    return [...chartData].slice(-6).reverse();
  }, [chartData]);

  const totalServiceRevenue = useMemo(
    () => serviceChartData.reduce((sum, entry) => sum + (entry.value || 0), 0),
    [serviceChartData]
  );

  const chartTooltipFormatter = useCallback((value, name) => {
    if (name === 'Revenue') {
      return [formatCurrency(value), 'Revenue'];
    }
    if (name === 'Transactions') {
      return [`${Number(value || 0).toLocaleString()} transactions`, 'Transactions'];
    }
    return [value, name];
  }, []);

  const groupByOptions = [
    { label: 'Daily', value: 'day' },
    { label: 'Weekly', value: 'week' },
    { label: 'Monthly', value: 'month' }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Error Loading Data"
        description={error}
        type="error"
        action={
          <Button size="small" danger onClick={fetchData}>
            Try Again
          </Button>
        }
      />
    );
  }

  // Mobile card view (compact, text-first, minimal charts)
  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Revenue Overview</h2>
            <p className="text-xs text-slate-500">Performance across {serviceDescriptor}</p>
          </div>
          <Button icon={<ReloadOutlined />} onClick={fetchData} size="small" />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Card size="small" className="h-full" styles={kpiCardStyles}>
            <Statistic
              title="Total Transactions"
              value={kpis.collectedRevenue}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: 'var(--brand-success)' }}
            />
            <div className="text-xs text-gray-500 mt-1">{Number(kpis.totalTransactions || 0).toLocaleString()} transactions recorded</div>
            <div className="text-xs text-gray-500">
              {dateRange.startDate} to {dateRange.endDate}
            </div>
          </Card>

          <Card size="small" className="h-full" styles={kpiCardStyles}>
            <div className="flex justify-between gap-3">
              <div className="flex-1">
                <div className="text-xs text-gray-500">Lesson Revenue</div>
                <div className="text-base font-semibold">{formatCurrency(kpis.lessonRevenue)}</div>
                <div className="text-xs text-gray-500">{kpis.lessonPercentage.toFixed(1)}% of total</div>
              </div>
              <div className="flex-1 text-right">
                <div className="text-xs text-gray-500">Rental Revenue</div>
                <div className="text-base font-semibold">{formatCurrency(kpis.rentalRevenue)}</div>
                <div className="text-xs text-gray-500">{kpis.rentalPercentage.toFixed(1)}% of total</div>
              </div>
            </div>
          </Card>

          <Card size="small" className="h-full" styles={kpiCardStyles}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500">Missing Transactions</div>
                <div className="text-base font-semibold">{formatCurrency(kpis.missingTransactions)}</div>
                <div className="text-xs text-gray-500">Outstanding balances across customers</div>
                <div className="text-xs text-gray-400">
                  {`Ledger delta: ${formatCurrency(kpis.calculatedMissing)}`}
                </div>
              </div>
              <Tag color={kpis.missingTransactions > 0 ? 'red' : 'green'}>
                {kpis.missingTransactions > 0 ? 'Review' : 'Balanced'}
              </Tag>
            </div>
          </Card>
        </div>

        <Card title="Top Services" size="small">
          <div className="space-y-2">
            {serviceChartData.length === 0 ? (
              <div className="text-center text-gray-500 py-6 text-sm">No service data</div>
            ) : (
              serviceChartData.slice(0, 5).map((service, idx) => {
                const share = totalServiceRevenue > 0 ? (service.value / totalServiceRevenue) * 100 : 0;
                return (
                  <div key={service.name} className="rounded border border-gray-100 p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag color={idx === 0 ? 'blue' : 'default'}>#{idx + 1}</Tag>
                        <div className="text-sm font-medium">{service.name}</div>
                      </div>
                      <div className="text-sm font-semibold">{formatCurrency(service.value)}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {service.bookings} bookings • Avg {formatCurrency(service.averagePrice)}
                    </div>
                    <Progress percent={Number(share.toFixed(1))} showInfo={false} strokeColor={service.fill} className="mt-2" />
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card title="Insights" size="small">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Avg transaction</span>
              <span className="font-medium">{formatCurrency(chartTotals.averageTransactionValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Peak period</span>
              <span className="font-medium">{chartTotals.peakPeriod || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Trend</span>
              <span className="font-medium">{chartTotals.trendDirection}</span>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const chartTypeOptions = [
    { label: 'Line', value: 'line' },
    { label: 'Area', value: 'area' },
    { label: 'Bar', value: 'bar' }
  ];

  const trendPositive = chartTotals.trendDelta >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Revenue Analytics</h2>
          <p className="text-sm text-slate-500">Detailed performance across {serviceDescriptor}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            options={groupByOptions}
            value={groupBy}
            onChange={(value) => setGroupBy(String(value))}
            size="middle"
          />
          <Segmented
            options={chartTypeOptions}
            value={chartType}
            onChange={(value) => setChartType(String(value))}
            size="middle"
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} title="Refresh data" />
        </div>
      </div>

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full" styles={kpiCardStyles}>
            <div className="flex items-start justify-between">
              <Statistic
                title="Total Transactions"
                value={kpis.collectedRevenue}
                formatter={(value) => formatCurrency(value)}
                valueStyle={{ color: 'var(--brand-success)' }}
              />
              <Tag color="green" bordered={false} className="mt-1 capitalize">{serviceDescriptor}</Tag>
            </div>
            <div className="text-sm text-gray-500 mt-2">{Number(kpis.totalTransactions || 0).toLocaleString()} transactions recorded</div>
            <div className="text-sm text-gray-500">
              {dateRange.startDate} to {dateRange.endDate}
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full" styles={kpiCardStyles}>
            <div className="flex items-start justify-between">
              <Statistic
                title="Lesson Revenue"
                value={kpis.lessonRevenue}
                formatter={(value) => formatCurrency(value)}
                valueStyle={{ color: 'var(--brand-primary)' }}
              />
              <Tag color="blue" bordered={false}>{kpis.lessonPercentage.toFixed(1)}%</Tag>
            </div>
            <div className="text-sm text-gray-500 mt-2">Share of total revenue</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full" styles={kpiCardStyles}>
            <div className="flex items-start justify-between">
              <Statistic
                title="Rental Revenue"
                value={kpis.rentalRevenue}
                formatter={(value) => formatCurrency(value)}
                valueStyle={{ color: '#722ed1' }}
              />
              <Tag color="purple" bordered={false}>{kpis.rentalPercentage.toFixed(1)}%</Tag>
            </div>
            <div className="text-sm text-gray-500 mt-2">Share of total revenue</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="h-full" styles={kpiCardStyles}>
            <div className="flex items-start justify-between">
              <Statistic
                title="Missing Transactions"
                value={kpis.missingTransactions}
                formatter={(value) => formatCurrency(value)}
                valueStyle={{ color: kpis.missingTransactions > 0 ? '#cf1322' : 'var(--brand-success)' }}
              />
              <Tag color={kpis.missingTransactions > 0 ? 'red' : 'green'} bordered={false}>
                {kpis.missingTransactions > 0 ? 'Review' : 'Balanced'}
              </Tag>
            </div>
            <div className="text-sm text-gray-500 mt-2">Outstanding customer balances across the app</div>
            <div className="text-sm text-gray-400">
              {`${formatCurrency(kpis.serviceRevenueTotal)} - ${formatCurrency(kpis.collectedRevenue)} = ${formatCurrency(kpis.calculatedMissing)}`}
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Revenue & Transactions" className="w-full">
        <div className="h-80" style={{ minHeight: '320px' }}>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="text-lg">No data available</div>
                <div className="text-sm">Try adjusting the date range or check back later</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              {chartType === 'line' && (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis yAxisId="left" tickFormatter={(value) => formatCurrency(value)} width={90} />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false} width={60} />
                  <Tooltip formatter={chartTooltipFormatter} />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--brand-primary)"
                    strokeWidth={2}
                    dot={false}
                    name="Revenue"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="transactionCount"
                    stroke="var(--brand-success)"
                    strokeDasharray="4 3"
                    name="Transactions"
                  />
                </LineChart>
              )}
              {chartType === 'area' && (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis yAxisId="left" tickFormatter={(value) => formatCurrency(value)} width={90} />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false} width={60} />
                  <Tooltip formatter={chartTooltipFormatter} />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--brand-primary)"
                    fill="var(--brand-primary)"
                    fillOpacity={0.3}
                    name="Revenue"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="transactionCount"
                    stroke="var(--brand-success)"
                    strokeDasharray="4 3"
                    name="Transactions"
                  />
                </AreaChart>
              )}
              {chartType === 'bar' && (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis yAxisId="left" tickFormatter={(value) => formatCurrency(value)} width={90} />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false} width={60} />
                  <Tooltip formatter={chartTooltipFormatter} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" fill="var(--brand-primary)" name="Revenue" />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="transactionCount"
                    stroke="var(--brand-success)"
                    strokeDasharray="4 3"
                    name="Transactions"
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Revenue by Service">
            <div className="h-64" style={{ minHeight: '256px' }}>
              {serviceChartData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <div className="text-lg">No service data available</div>
                    <div className="text-sm">No services have generated revenue in this period</div>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={serviceChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                    >
                      {serviceChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={createTooltipFormatter('revenue').currency} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Service Performance Details">
            <div className="space-y-3">
              {serviceChartData.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No service performance data available</div>
              ) : (
                serviceChartData.slice(0, 5).map((service, index) => {
                  const share = totalServiceRevenue > 0 ? (service.value / totalServiceRevenue) * 100 : 0;
                  return (
                    <div key={service.name} className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Tag color={index === 0 ? 'blue' : index === 1 ? 'green' : 'default'} bordered={false}>
                            #{index + 1}
                          </Tag>
                          <div className="font-medium text-slate-800">{service.name}</div>
                        </div>
                        <div className="text-sm font-semibold text-slate-800">
                          {formatCurrency(service.value)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {service.bookings} bookings • Avg {formatCurrency(service.averagePrice)}
                      </div>
                      <div className="mt-3">
                        <Progress percent={Number(share.toFixed(1))} showInfo={false} strokeColor={service.fill} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Recent Period Performance">
        {recentPeriods.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No recent period data available</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentPeriods.map((period) => {
              const average = period.transactionCount > 0 ? period.revenue / period.transactionCount : 0;
              return (
                <div
                  key={period.period}
                  className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{period.period}</div>
                      <div className="text-xs text-slate-500">
                        {Number(period.transactionCount || 0).toLocaleString()} transactions
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-800">{formatCurrency(period.revenue)}</div>
                      <div className="text-xs text-slate-500">Avg {formatCurrency(average)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Revenue Insights">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4">
            <div className="text-xs font-semibold uppercase text-blue-600">Avg Transaction Value</div>
            <div className="mt-2 text-2xl font-semibold text-blue-900">
              {formatCurrency(chartTotals.averageTransactionValue)}
            </div>
            <div className="text-xs text-blue-700 mt-1">
              Across {Number(chartTotals.totalTransactions || 0).toLocaleString()} transactions
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
            <div className="text-xs font-semibold uppercase text-emerald-600">Peak Revenue Period</div>
            {chartTotals.peakPeriod ? (
              <>
                <div className="mt-2 text-lg font-semibold text-emerald-800">{chartTotals.peakPeriod}</div>
                <div className="text-xs text-emerald-600 mt-1">
                  {formatCurrency(chartTotals.peakRevenue)} captured
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-emerald-700">No peak period identified yet</div>
            )}
          </div>

          <div
            className={`rounded-2xl border p-4 ${trendPositive ? 'border-emerald-100 bg-emerald-50/80' : 'border-rose-100 bg-rose-50/80'}`}
          >
            <div className={`text-xs font-semibold uppercase ${trendPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
              Revenue Momentum
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              {trendPositive ? (
                <ArrowUpOutlined className="text-emerald-500" />
              ) : (
                <ArrowDownOutlined className="text-rose-500" />
              )}
              <span className={`text-xl font-semibold ${trendPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                {Math.abs(chartTotals.trendDelta).toFixed(1)}%
              </span>
            </div>
            <div className="text-xs text-slate-600 mt-1">{chartTotals.trendDirection}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default RevenueAnalyticsDashboard;
