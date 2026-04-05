import { useMemo } from 'react';
import { Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Area, AreaChart
} from 'recharts';
import { formatCurrency } from '@/shared/utils/formatters';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';

const AVATAR_COLORS = ['#1677ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1', '#13c2c2', '#fa541c', '#2f54eb'];
export default function PaymentHistoryCharts({ trend = [], transactions = [] }) {
  // --- Monthly Trend ---
  const trendData = useMemo(() => {
    return trend.map(t => ({
      month: t.month,
      label: new Date(t.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      income: t.income,
      charges: t.charges,
      net: t.income - t.charges
    }));
  }, [trend]);

  // --- Top Spenders ---
  const topSpenders = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (t.amount >= 0) continue;
      const uid = t.user_id;
      if (!uid) continue;
      if (!map[uid]) {
        map[uid] = {
          user_id: uid,
          name: t.user?.name || 'Unknown',
          email: t.user?.email || '',
          totalSpent: 0,
          count: 0
        };
      }
      map[uid].totalSpent += Math.abs(t.amount);
      map[uid].count += 1;
    }
    return Object.values(map).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
  }, [transactions]);

  const topSpenderColumns = [
    {
      title: '#',
      key: 'rank',
      width: 40,
      render: (_, __, i) => <span className="text-xs text-slate-400 font-medium">{i + 1}</span>
    },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, r) => {
        const color = AVATAR_COLORS[r.name.charCodeAt(0) % AVATAR_COLORS.length];
        return (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar size={28} style={{ backgroundColor: color, flexShrink: 0 }}>
              {r.name[0]?.toUpperCase() || <UserOutlined />}
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium text-slate-900 truncate text-sm">{r.name}</div>
              <div className="text-xs text-slate-400 truncate">{r.email}</div>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Transactions',
      key: 'count',
      width: 100,
      render: (_, r) => <span className="text-sm text-slate-600">{r.count}</span>
    },
    {
      title: 'Total Spent',
      key: 'totalSpent',
      width: 130,
      render: (_, r) => <span className="font-semibold text-red-600">{formatCurrency(r.totalSpent)}</span>
    }
  ];

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <p className="text-xs font-semibold text-slate-600 mb-1">{label}</p>
        {payload.map((p) => (
          <p key={p.dataKey || p.name} className="text-xs" style={{ color: p.color }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Monthly Trend */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:col-span-2">
        <h4 className="mb-4 text-sm font-semibold text-slate-700">Income vs Charges Trend</h4>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="chargesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="income" name="Income" stroke="#10b981" fill="url(#incomeGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="charges" name="Charges" stroke="#ef4444" fill="url(#chargesGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">No trend data available</div>
        )}
      </div>

      {/* Top Spenders */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:col-span-2">
        <h4 className="mb-4 text-sm font-semibold text-slate-700">Top Spenders</h4>
        {topSpenders.length > 0 ? (
          <UnifiedResponsiveTable
            columns={topSpenderColumns}
            dataSource={topSpenders}
            rowKey="user_id"
            pagination={false}
            size="small"
          />
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">No data</div>
        )}
      </div>
    </div>
  );
}
