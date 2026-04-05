import { useState, useEffect } from 'react';
import { Card, Empty, Spin, Segmented } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const OFFERING_COLORS = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#6d28d9', '#5b21b6', '#4c1d95', '#9333ea', '#a855f7', '#d946ef'];
const TREND_COLOR = '#7c3aed';
const METHOD_COLORS = { wallet: '#7c3aed', cash: '#10b981', card: '#f59e0b', credit_card: '#f59e0b', transfer: '#3b82f6', pay_later: '#ef4444' };
const STATUS_COLORS = { active: '#10b981', expired: '#94a3b8', cancelled: '#ef4444', pending: '#f59e0b' };

const MembershipBreakdownCharts = ({ dateRange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offeringView, setOfferingView] = useState('bar');

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/finances/membership-breakdown', {
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

  const offerings = data?.offerings || [];
  const trends = data?.trends || [];
  const paymentMethods = data?.paymentMethods || [];
  const membershipStatus = data?.membershipStatus || [];

  return (
    <div className="space-y-6">
      {/* Membership Offering Popularity */}
      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Membership Plans</h3>
          {offerings.length > 0 && (
            <Segmented
              size="small"
              value={offeringView}
              onChange={setOfferingView}
              options={[
                { label: 'Bar', value: 'bar' },
                { label: 'Pie', value: 'pie' }
              ]}
            />
          )}
        </div>
        {offerings.length === 0 ? (
          <Empty description="No membership sales in this period" />
        ) : offeringView === 'bar' ? (
          <ResponsiveContainer width="100%" height={Math.max(280, offerings.length * 55)}>
            <BarChart data={offerings} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                type="category"
                dataKey="name"
                width={200}
                tick={{ fontSize: 12, fill: '#334155' }}
                tickFormatter={(v) => v.length > 28 ? v.slice(0, 26) + '…' : v}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="purchases" name="Purchases" fill="#7c3aed" radius={[0, 6, 6, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center gap-4 lg:flex-row lg:justify-center">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={offerings}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={50}
                  label={PieLabel}
                  labelLine={false}
                >
                  {offerings.map((_, i) => (
                    <Cell key={`cell-${offerings[i]?.offeringId}`} fill={OFFERING_COLORS[i % OFFERING_COLORS.length]} />
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
        {offerings.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {offerings.map((o, i) => (
              <div key={o.offeringId} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: OFFERING_COLORS[i % OFFERING_COLORS.length] }}>
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{o.name}</p>
                  <p className="text-xs text-slate-500">{o.purchases} sold · {formatCurrency(o.revenue)}</p>
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

      {/* Payment & Status Summary */}
      {(paymentMethods.length > 0 || membershipStatus.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {paymentMethods.length > 0 && (
            <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Payment Methods</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4">Method</th>
                      <th className="py-2 pr-4 text-right">Count</th>
                      <th className="py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentMethods.map((pm) => (
                      <tr key={pm.method} className="border-b border-slate-100">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: METHOD_COLORS[pm.method] || '#94a3b8' }} />
                            <span className="font-medium capitalize text-slate-800">{pm.method?.replace('_', ' ') || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-600">{pm.count}</td>
                        <td className="py-2 text-right font-medium text-purple-600">{formatCurrency(pm.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {membershipStatus.length > 0 && (
            <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Membership Status</h3>
              <div className="space-y-3">
                {membershipStatus.map((ms) => {
                  const total = membershipStatus.reduce((sum, s) => sum + s.count, 0);
                  const pct = total > 0 ? (ms.count / total) * 100 : 0;
                  return (
                    <div key={ms.status} className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[ms.status] || '#94a3b8' }} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium capitalize text-slate-800">{ms.status}</span>
                          <span className="text-sm text-slate-600">{ms.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[ms.status] || '#94a3b8' }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default MembershipBreakdownCharts;
