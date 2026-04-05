import { useState, useEffect } from 'react';
import { Card, Empty, Spin, Segmented } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const EQUIPMENT_COLORS = ['#f97316', '#ea580c', '#fb923c', '#fdba74', '#c2410c', '#9a3412', '#f59e0b', '#d97706', '#b45309', '#92400e'];
const TREND_COLOR = '#f97316';
const STATUS_COLORS = { paid: '#10b981', pending: '#f59e0b', unpaid: '#ef4444', partial: '#6366f1', refunded: '#8b5cf6' };

const RentalBreakdownCharts = ({ dateRange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [equipmentView, setEquipmentView] = useState('bar');

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/finances/rental-breakdown', {
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
              {entry.dataKey === 'revenue' || entry.dataKey === 'avgPrice' || type === 'currency'
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

  const equipment = data?.equipment || [];
  const trends = data?.trends || [];
  const paymentStatus = data?.paymentStatus || [];

  return (
    <div className="space-y-6">
      {/* Equipment Popularity */}
      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Equipment Popularity</h3>
          {equipment.length > 0 && (
            <Segmented
              size="small"
              value={equipmentView}
              onChange={setEquipmentView}
              options={[
                { label: 'Bar', value: 'bar' },
                { label: 'Pie', value: 'pie' }
              ]}
            />
          )}
        </div>
        {equipment.length === 0 ? (
          <Empty description="No rental data in this period" />
        ) : equipmentView === 'bar' ? (
          <ResponsiveContainer width="100%" height={Math.max(280, equipment.length * 45)}>
            <BarChart data={equipment} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fontSize: 12, fill: '#334155' }}
                tickFormatter={(v) => v.length > 22 ? v.slice(0, 20) + '…' : v}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="rentals" name="Rentals" fill="#f97316" radius={[0, 6, 6, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center gap-4 lg:flex-row lg:justify-center">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={equipment}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={50}
                  label={PieLabel}
                  labelLine={false}
                >
                  {equipment.map((_, i) => (
                    <Cell key={`cell-${equipment[i]?.serviceId}`} fill={EQUIPMENT_COLORS[i % EQUIPMENT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip type="currency" />} />
                <Legend
                  formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {equipment.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {equipment.slice(0, 6).map((eq, i) => (
              <div key={eq.serviceId} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: EQUIPMENT_COLORS[i % EQUIPMENT_COLORS.length] }}>
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{eq.name}</p>
                  <p className="text-xs text-slate-500">{eq.rentals} rentals · {formatCurrency(eq.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Revenue Trend */}
      {trends.length > 1 && (
        <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trends} margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke={TREND_COLOR} strokeWidth={2} dot={{ fill: TREND_COLOR, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Payment Status Breakdown */}
      {paymentStatus.length > 0 && (
        <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Payment Status</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Count</th>
                  <th className="py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {paymentStatus.map((ps) => (
                  <tr key={ps.status} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[ps.status] || '#94a3b8' }} />
                        <span className="font-medium capitalize text-slate-800">{ps.status || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-600">{ps.count}</td>
                    <td className="py-2 text-right font-medium text-orange-600">{formatCurrency(ps.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default RentalBreakdownCharts;
