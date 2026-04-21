import { memo, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation(['instructor']);

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

  const thresholdAmount = pendingThreshold?.amount;

  return (
    <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('instructor:finance.earningsTrend')}</p>
          <h3 className="text-base font-semibold text-slate-900">{t('instructor:finance.last12Weeks')}</h3>
        </div>
        {pendingThreshold && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            pendingThreshold.meetsThreshold
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}>
            {pendingThreshold.meetsThreshold
              ? t('instructor:finance.eligibleForPayoutNow')
              : t('instructor:finance.toThreshold', { amount: formatCurrency(pendingThreshold.shortfall) })}
          </span>
        )}
      </div>

      {loading && !chartData.length ? (
        <div className="h-48 rounded-lg bg-slate-100/70 animate-pulse" />
      ) : !chartData.length ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">
          {t('instructor:finance.noEarningsYet')}
        </div>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="rgba(148,163,184,0.6)" fontSize={11} />
              <YAxis
                tickLine={false}
                axisLine={false}
                stroke="rgba(148,163,184,0.6)"
                tickFormatter={(value) => formatCurrency(value)}
                domain={[0, maxY]}
                width={72}
                fontSize={11}
              />
              {thresholdAmount > 0 && (
                <ReferenceLine
                  y={thresholdAmount}
                  stroke="#f59e0b"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                  label={{ value: t('instructor:finance.threshold'), position: 'right', fill: '#d97706', fontSize: 10 }}
                />
              )}
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
                formatter={(value) => [formatCurrency(value), t('instructor:finance.earnings')]}
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.97)',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.75rem',
                  color: '#1e293b',
                  padding: '0.5rem 0.75rem',
                  fontSize: '13px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                }}
                wrapperStyle={{ zIndex: 30 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#0ea5e9"
                strokeWidth={2}
                fill="url(#earningsGradient)"
                dot={false}
                activeDot={{ r: 4, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default memo(EarningsTrendCard);
