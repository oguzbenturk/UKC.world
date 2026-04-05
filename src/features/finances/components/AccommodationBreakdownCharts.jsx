import { useState, useEffect } from 'react';
import { Card, Empty, Spin, Segmented } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const UNIT_COLORS = ['#3b82f6', '#2563eb', '#60a5fa', '#93c5fd', '#1d4ed8', '#1e40af', '#0ea5e9', '#0284c7', '#0369a1', '#075985'];
const TREND_COLOR = '#3b82f6';
const STATUS_COLORS = { confirmed: '#10b981', pending: '#f59e0b', cancelled: '#ef4444', completed: '#3b82f6', unknown: '#94a3b8' };

const AccommodationBreakdownCharts = ({ dateRange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [unitView, setUnitView] = useState('bar');

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/finances/accommodation-breakdown', {
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
              {entry.dataKey === 'revenue' || type === 'currency'
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

  const units = data?.units || [];
  const trends = data?.trends || [];
  const bookingStatus = data?.bookingStatus || [];

  return (
    <div className="space-y-6">
      {/* Unit Popularity */}
      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Unit Popularity</h3>
          {units.length > 0 && (
            <Segmented
              size="small"
              value={unitView}
              onChange={setUnitView}
              options={[
                { label: 'Bar', value: 'bar' },
                { label: 'Pie', value: 'pie' }
              ]}
            />
          )}
        </div>
        {units.length === 0 ? (
          <Empty description="No accommodation data in this period" />
        ) : unitView === 'bar' ? (
          <ResponsiveContainer width="100%" height={Math.max(280, units.length * 45)}>
            <BarChart data={units} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
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
              <Bar dataKey="bookings" name="Bookings" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center gap-4 lg:flex-row lg:justify-center">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={units}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={50}
                  label={PieLabel}
                  labelLine={false}
                >
                  {units.map((_, i) => (
                    <Cell key={`cell-${units[i]?.unitId}`} fill={UNIT_COLORS[i % UNIT_COLORS.length]} />
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
        {units.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {units.slice(0, 6).map((unit, i) => (
              <div key={unit.unitId} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: UNIT_COLORS[i % UNIT_COLORS.length] }}>
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{unit.name}</p>
                  <p className="text-xs text-slate-500">{unit.bookings} bookings · {unit.totalNights} nights · {formatCurrency(unit.revenue)}</p>
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
              <Line type="monotone" dataKey="bookings" name="Bookings" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Booking Status Breakdown */}
      {bookingStatus.length > 0 && (
        <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Booking Status</h3>
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
                {bookingStatus.map((bs) => (
                  <tr key={bs.status} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[bs.status] || '#94a3b8' }} />
                        <span className="font-medium capitalize text-slate-800">{bs.status || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-600">{bs.count}</td>
                    <td className="py-2 text-right font-medium text-blue-600">{formatCurrency(bs.revenue)}</td>
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

export default AccommodationBreakdownCharts;
