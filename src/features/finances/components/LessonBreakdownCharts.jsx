import { useState, useEffect } from 'react';
import { Card, Empty, Spin, Segmented } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const SERVICE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#4f46e5', '#7c3aed', '#5b21b6', '#4338ca', '#6d28d9'];
const INSTRUCTOR_COLORS = ['#10b981', '#059669', '#34d399', '#6ee7b7', '#047857', '#065f46', '#14b8a6', '#0d9488', '#0e7490', '#0891b2'];

const LessonBreakdownCharts = ({ dateRange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serviceView, setServiceView] = useState('bar');

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/finances/lesson-breakdown', {
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
              {entry.dataKey === 'revenue' || entry.dataKey === 'commission' || entry.dataKey === 'avgPrice' || type === 'currency'
                ? formatCurrency(entry.value) 
                : entry.value}
            </span>
          </p>
        ))}
      </div>
    );
  };

  const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name: _name }) => {
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

  const services = data?.services || [];
  const instructors = data?.instructors || [];

  return (
    <div className="space-y-6">
      {/* Service Popularity */}
      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Service Popularity</h3>
          {services.length > 0 && (
            <Segmented
              size="small"
              value={serviceView}
              onChange={setServiceView}
              options={[
                { label: 'Bar', value: 'bar' },
                { label: 'Pie', value: 'pie' }
              ]}
            />
          )}
        </div>
        {services.length === 0 ? (
          <Empty description="No lesson bookings in this period" />
        ) : serviceView === 'bar' ? (
          <ResponsiveContainer width="100%" height={Math.max(280, services.length * 45)}>
            <BarChart data={services} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={140} 
                tick={{ fontSize: 12, fill: '#334155' }}
                tickFormatter={(v) => v.length > 20 ? v.slice(0, 18) + '…' : v}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="bookings" name="Bookings" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center gap-4 lg:flex-row lg:justify-center">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={services}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={50}
                  label={PieLabel}
                  labelLine={false}
                >
                  {services.map((_, i) => (
                    <Cell key={`cell-${services[i]?.serviceId}`} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />
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
        {services.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 6).map((s, i) => (
              <div key={s.serviceId} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: SERVICE_COLORS[i % SERVICE_COLORS.length] }}>
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.bookings} bookings · {formatCurrency(s.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Instructor Performance */}
      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Instructor Performance</h3>
        {instructors.length === 0 ? (
          <Empty description="No instructor data in this period" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(280, instructors.length * 50)}>
              <BarChart data={instructors} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={130} 
                  tick={{ fontSize: 12, fill: '#334155' }}
                  tickFormatter={(v) => v.length > 18 ? v.slice(0, 16) + '…' : v}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[0, 6, 6, 0]} barSize={16} />
                <Bar dataKey="commission" name="Commission" fill="#f59e0b" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Instructor</th>
                    <th className="py-2 pr-4 text-right">Bookings</th>
                    <th className="py-2 pr-4 text-right">Hours</th>
                    <th className="py-2 pr-4 text-right">Revenue</th>
                    <th className="py-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {instructors.map((inst, i) => (
                    <tr key={inst.instructorId} className="border-b border-slate-100">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: INSTRUCTOR_COLORS[i % INSTRUCTOR_COLORS.length] }}>
                            {inst.name.charAt(0)}
                          </div>
                          <span className="font-medium text-slate-800">{inst.name}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-600">{inst.bookings}</td>
                      <td className="py-2 pr-4 text-right text-slate-600">{inst.hours}h</td>
                      <td className="py-2 pr-4 text-right font-medium text-emerald-600">{formatCurrency(inst.revenue)}</td>
                      <td className="py-2 text-right font-medium text-amber-600">{formatCurrency(inst.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default LessonBreakdownCharts;
