import { memo, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const formatWeekLabel = (isoString) => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const EarningsTrendCard = ({
  timeseries = [],
  loading = false,
  formatCurrency = (value) => value,
  pendingThreshold,
}) => {
  const chartData = useMemo(() => (
    Array.isArray(timeseries)
      ? timeseries.map((entry) => ({
          weekStart: entry.weekStart,
          label: formatWeekLabel(entry.weekStart),
          total: Number(entry.total || 0),
        }))
      : []
  ), [timeseries]);

  const maxY = useMemo(() => {
    if (!chartData.length) return 0;
    return Math.max(...chartData.map((d) => d.total), pendingThreshold?.amount || 0);
  }, [chartData, pendingThreshold?.amount]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Earnings trend</p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Last 12 weeks</h3>
        </div>
        {pendingThreshold && (
          <p className="text-xs text-slate-500 max-w-[160px] text-right">
            {pendingThreshold.meetsThreshold
              ? 'Eligible for payout now.'
              : `${formatCurrency(pendingThreshold.shortfall)} until payout threshold (${formatCurrency(pendingThreshold.amount)}).`}
          </p>
        )}
      </div>

      {loading && !chartData.length ? (
        <div className="h-48 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : !chartData.length ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-500">
          No earnings recorded yet.
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="rgba(100,116,139,0.8)" />
              <YAxis
                tickLine={false}
                axisLine={false}
                stroke="rgba(100,116,139,0.8)"
                tickFormatter={(value) => formatCurrency(value)}
                domain={[0, maxY]}
                width={72}
              />
              <Tooltip
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload;
                  if (!item) return label;
                  const startDate = new Date(item.weekStart);
                  if (Number.isNaN(startDate.getTime())) return label;
                  const endDate = new Date(startDate);
                  endDate.setUTCDate(startDate.getUTCDate() + 6);
                  return `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                }}
                formatter={(value) => [formatCurrency(value), 'Earnings']}
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#f8fafc',
                  padding: '0.75rem 1rem',
                }}
                wrapperStyle={{ zIndex: 30 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#earningsGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default memo(EarningsTrendCard);
