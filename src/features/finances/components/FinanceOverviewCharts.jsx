import { useMemo } from 'react';
import { Card } from 'antd';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Area, AreaChart, BarChart, Bar, Cell
} from 'recharts';
import { formatCurrency } from '@/shared/utils/formatters';

const TYPE_LABELS = {
  booking_charge:       'Lessons',
  rental_charge:        'Rentals',
  rental_payment:       'Rentals',
  package_purchase:     'Packages',
  payment:              'Shop',
  charge:               'Shop',
  service_payment:      'Services',
  debit:                'Other Charges',
};

const COLORS = ['#6366f1', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#94a3b8', '#f43f5e', '#0ea5e9'];

const EUR = (v) => formatCurrency(v);

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-xs">
      <p className="mb-2 font-semibold text-slate-700">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function FinanceOverviewCharts({ monthlyTrend = [], expenseBreakdown = [] }) {
  const trendData = useMemo(() => monthlyTrend.map(t => ({
    ...t,
    label: new Date(t.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  })), [monthlyTrend]);

  const expenseData = useMemo(() => {
    const grouped = {};
    for (const row of expenseBreakdown) {
      const label = TYPE_LABELS[row.type] || row.type;
      if (!grouped[label]) grouped[label] = { name: label, value: 0 };
      grouped[label].value += row.total;
    }
    return Object.values(grouped).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [expenseBreakdown]);

  if (trendData.length === 0 && expenseData.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Monthly Income vs Charges */}
      {trendData.length > 1 && (
        <Card
          size="small"
          title={<span className="text-sm font-semibold text-slate-700">Monthly Cash Flow</span>}
          className="rounded-2xl border border-slate-200/70 shadow-sm"
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradCharges" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={EUR} tick={{ fontSize: 11 }} width={72} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="income"  name="Income"  stroke="#6366f1" fill="url(#gradIncome)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="charges" name="Charges" stroke="#f43f5e" fill="url(#gradCharges)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Net Profit bars */}
        {trendData.length > 1 && (
          <Card
            size="small"
            title={<span className="text-sm font-semibold text-slate-700">Monthly Net Profit</span>}
            className="rounded-2xl border border-slate-200/70 shadow-sm"
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={EUR} tick={{ fontSize: 11 }} width={72} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="net" name="Net Profit" radius={[4, 4, 0, 0]}>
                  {trendData.map(entry => (
                    <Cell key={entry.month} fill={entry.net >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Charges by Type */}
        {expenseData.length > 0 && (
          <Card
            size="small"
            title={<span className="text-sm font-semibold text-slate-700">Charges by Type</span>}
            className="rounded-2xl border border-slate-200/70 shadow-sm"
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={expenseData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tickFormatter={EUR} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="value" name="Amount" radius={[0, 4, 4, 0]}>
                  {expenseData.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    </div>
  );
}
