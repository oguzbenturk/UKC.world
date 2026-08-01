import { useMemo, useState } from 'react';
import { Card, Empty, Spin, Segmented } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, LabelList
} from 'recharts';
import dayjs from 'dayjs';
import { formatCurrency } from '@/shared/utils/formatters';

const ACCENT = '#f97316';
const ACCENT_DEEP = '#ea580c';
const MICRO_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400';
const SECTION_TITLE = 'font-duotone-medium-condensed text-lg uppercase tracking-wide text-slate-900';

// Actual rentals.payment_status values: paid / unpaid / pending_payment (card awaiting
// confirmation) / package (package-funded, €0) / failed (gateway init failed).
// Reserved status colors — always rendered with a label, never color alone.
const STATUS_COLORS = {
  paid: '#10b981',
  unpaid: '#ef4444',
  pending_payment: '#f59e0b',
  package: '#6366f1',
  failed: '#e11d48',
  refunded: '#8b5cf6'
};
const STATUS_LABELS = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  pending_payment: 'Pending payment',
  package: 'Package-funded',
  failed: 'Payment failed',
  refunded: 'Refunded'
};
const statusLabel = (status) => STATUS_LABELS[status] || (status ? status.replace(/_/g, ' ') : 'Unknown');
const statusColor = (status) => STATUS_COLORS[status] || '#94a3b8';

const compactCurrency = (value) => {
  const v = Number(value) || 0;
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(1)}k`;
  return `€${Math.round(v)}`;
};

const monthTick = (month) => {
  const d = dayjs(`${month}-01`);
  return d.isValid() ? d.format("MMM 'YY") : month;
};

const TooltipShell = ({ title, rows }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
    <p className="mb-1.5 text-sm font-semibold text-slate-800">{title}</p>
    {rows.map((row) => (
      <p key={row.label} className="flex items-center justify-between gap-6 text-xs text-slate-500">
        {row.label}
        <span className="font-semibold text-slate-800 tabular-nums">{row.value}</span>
      </p>
    ))}
  </div>
);

const EquipmentTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const eq = payload[0]?.payload;
  if (!eq) return null;
  return (
    <TooltipShell
      title={eq.name}
      rows={[
        { label: 'Rentals', value: eq.rentals },
        { label: 'Revenue', value: formatCurrency(eq.revenue) },
        { label: 'Avg / rental', value: formatCurrency(eq.avgPrice) },
      ]}
    />
  );
};

const TrendTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <TooltipShell
      title={monthTick(point.month)}
      rows={[
        { label: 'Revenue', value: formatCurrency(point.revenue) },
        { label: 'Rentals', value: point.rentals },
      ]}
    />
  );
};

// Presentational: data is fetched once by FinanceRentals and shared with RentalAnalytics.
const RentalBreakdownCharts = ({ data, loading }) => {
  const [metric, setMetric] = useState('rentals');

  const equipment = data?.equipment || [];
  const trends = data?.trends || [];
  const paymentStatus = useMemo(() => data?.paymentStatus || [], [data]);

  const totalStatusCount = useMemo(
    () => paymentStatus.reduce((sum, ps) => sum + (Number(ps.count) || 0), 0),
    [paymentStatus]
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  const isRevenueMetric = metric === 'revenue';

  return (
    <div className="space-y-5">
      {/* Equipment popularity — ranked bars, one metric at a time */}
      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className={SECTION_TITLE}>Equipment Popularity</h3>
          {equipment.length > 0 && (
            <Segmented
              size="small"
              value={metric}
              onChange={setMetric}
              options={[
                { label: 'Rentals', value: 'rentals' },
                { label: 'Revenue', value: 'revenue' }
              ]}
            />
          )}
        </div>
        {equipment.length === 0 ? (
          <Empty description="No rental data in this period" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(260, equipment.length * 42)}>
              <BarChart data={equipment} layout="vertical" margin={{ left: 8, right: 52, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={190}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(v) => v.length > 32 ? v.slice(0, 30) + '…' : v}
                />
                <Tooltip content={<EquipmentTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey={metric} fill={ACCENT} radius={[0, 4, 4, 0]} barSize={16}>
                  <LabelList
                    dataKey={metric}
                    position="right"
                    fill="#64748b"
                    fontSize={11}
                    formatter={(v) => isRevenueMetric ? compactCurrency(v) : v}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {equipment.slice(0, 6).map((eq, i) => (
                <div
                  key={eq.serviceId}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 transition-colors hover:border-orange-200 hover:bg-orange-50/40"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-orange-600 font-duotone-bold text-sm text-white">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{eq.name}</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {eq.rentals} rentals · {formatCurrency(eq.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Revenue trend — monthly, real buckets only */}
      {trends.length > 1 && (
        <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
          <h3 className={`${SECTION_TITLE} mb-4`}>Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trends} margin={{ left: 4, right: 16, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="rentalTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickFormatter={monthTick}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={52}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickFormatter={compactCurrency}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={ACCENT_DEEP}
                strokeWidth={2}
                fill="url(#rentalTrendFill)"
                dot={false}
                activeDot={{ r: 4, fill: ACCENT_DEEP, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Payment status — share band + detail table */}
      {paymentStatus.length > 0 && (
        <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
          <h3 className={`${SECTION_TITLE} mb-4`}>Payment Status</h3>

          {totalStatusCount > 0 && (
            <div className="mb-5">
              <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
                {paymentStatus.map((ps) => (
                  <div
                    key={ps.status}
                    className="rounded-full"
                    style={{
                      width: `${((Number(ps.count) || 0) / totalStatusCount) * 100}%`,
                      minWidth: 6,
                      backgroundColor: statusColor(ps.status)
                    }}
                    title={`${statusLabel(ps.status)}: ${ps.count}`}
                  />
                ))}
              </div>
              <p className={`mt-2 ${MICRO_LABEL}`}>Share of rentals by payment status</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 text-right font-semibold">Count</th>
                  <th className="py-2 pr-4 text-right font-semibold">Share</th>
                  <th className="py-2 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {paymentStatus.map((ps) => (
                  <tr key={ps.status} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor(ps.status) }} />
                        <span className="font-medium text-slate-800">{statusLabel(ps.status)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-600 tabular-nums">{ps.count}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-400 tabular-nums">
                      {totalStatusCount > 0 ? `${(((Number(ps.count) || 0) / totalStatusCount) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-800 tabular-nums">{formatCurrency(ps.revenue)}</td>
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
