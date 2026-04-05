import { useState, useEffect } from 'react';
import { Card, Empty, Spin, Segmented, Table, Avatar, Grid } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { formatCurrency } from '@/shared/utils/formatters';
import { UserOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#4f46e5', '#4338ca', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95'];
const TREND_COLOR = '#6366f1';

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const WalletDepositCharts = ({ dateRange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [topView, setTopView] = useState('bar');
  const { useBreakpoint } = Grid;
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/finances/wallet-deposits', {
        params: { startDate: dateRange.startDate, endDate: dateRange.endDate }
      });
      setData(response.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dateRange?.startDate && dateRange?.endDate) {
      loadData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const CustomTooltip = ({ active, payload, label, type }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
        <p className="mb-1 text-sm font-semibold text-slate-800">{label || payload[0]?.name}</p>
        {payload.map((entry) => (
          <p key={entry.dataKey || entry.name} className="text-xs text-slate-600">
            <span style={{ color: entry.color }}>{entry.name || entry.dataKey}: </span>
            <span className="font-medium">
              {entry.dataKey === 'total' || entry.dataKey === 'totalDeposited' || type === 'currency'
                ? formatCurrency(entry.value)
                : entry.value}
            </span>
          </p>
        ))}
      </div>
    );
  };

  const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-xs font-medium">
        {(percent * 100).toFixed(0)}%
      </text>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  const topDepositors = data?.topDepositors || [];
  const trends = data?.trends || [];
  const deposits = data?.deposits || [];

  const hasData = topDepositors.length > 0 || trends.length > 0;
  if (!hasData) {
    return (
      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <Empty description="No deposit data for this period" />
      </Card>
    );
  }

  // Prepare top depositors for charts
  const topChartData = topDepositors.map(d => ({
    name: d.name || 'Unknown',
    totalDeposited: d.totalDeposited,
    depositCount: d.depositCount,
  }));

  // Deposit table columns
  const depositColumns = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'date',
      width: 120,
      render: (t) => t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
    {
      title: 'Student',
      key: 'user',
      render: (_, r) => {
        const name = r.user?.name || 'Unknown';
        const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
        return (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar size={28} style={{ backgroundColor: color, flexShrink: 0 }}>
              {name[0]?.toUpperCase() || <UserOutlined />}
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium text-slate-900 truncate text-sm">{name}</div>
              <div className="text-xs text-slate-400 truncate">{r.user?.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (v) => <span className="font-semibold text-slate-900">{formatCurrency(v)}</span>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v) => <span className="text-slate-600 text-sm">{v || '—'}</span>,
    },
    {
      title: 'Credited By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 150,
      render: (v) => <span className="text-slate-500 text-sm">{v || '—'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {/* Top Depositors */}
        <Card
          className="rounded-3xl border border-slate-200/70 shadow-sm"
          title={
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-slate-800">Top Depositors</span>
              <Segmented
                size="small"
                value={topView}
                onChange={setTopView}
                options={[
                  { label: 'Bar', value: 'bar' },
                  { label: 'Pie', value: 'pie' },
                ]}
              />
            </div>
          }
        >
          {topChartData.length === 0 ? (
            <Empty description="No depositors" />
          ) : topView === 'bar' ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.length > 14 ? v.slice(0, 12) + '…' : v}
                />
                <Tooltip content={<CustomTooltip type="currency" />} />
                <Bar dataKey="totalDeposited" name="Total Deposited" radius={[0, 6, 6, 0]}>
                  {topChartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={topChartData}
                  dataKey="totalDeposited"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  labelLine={false}
                  label={PieLabel}
                >
                  {topChartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Deposit Trends */}
        <Card
          className="rounded-3xl border border-slate-200/70 shadow-sm"
          title={<span className="text-base font-semibold text-slate-800">Deposit Trends</span>}
        >
          {trends.length === 0 ? (
            <Empty description="No trend data" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => {
                    const [y, m] = v.split('-');
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
                  }}
                />
                <YAxis yAxisId="left" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip type="currency" />} />
                <Line yAxisId="left" type="monotone" dataKey="total" name="Amount" stroke={TREND_COLOR} strokeWidth={2.5} dot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="count" name="Count" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Recent Deposits Table */}
      <Card
        className="rounded-3xl border border-slate-200/70 shadow-sm overflow-hidden"
        title={<span className="text-base font-semibold text-slate-800">Recent Deposits</span>}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={depositColumns}
          dataSource={deposits}
          rowKey="id"
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (total) => `${total} deposit${total !== 1 ? 's' : ''}`,
          }}
          scroll={{ x: 700 }}
          size="small"
          rowClassName="hover:bg-slate-50/70 transition-colors"
        />
      </Card>
    </div>
  );
};

export default WalletDepositCharts;
