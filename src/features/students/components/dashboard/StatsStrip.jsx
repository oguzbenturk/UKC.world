import { useMemo } from 'react';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';

const accentColors = {
  completed: 'border-l-emerald-400',
  upcoming:  'border-l-[#00a8c4]',
  hours:     'border-l-amber-400',
  balance:   'border-l-violet-400',
};

const StatPill = ({ label, value, accentKey }) => (
  <div className={`min-w-[140px] shrink-0 rounded-2xl border border-slate-100 border-l-[3px] bg-white px-4 py-3 shadow-sm ${accentColors[accentKey] || 'border-l-slate-300'}`}>
    <p className="font-gotham-medium text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-1 font-duotone-bold text-xl text-slate-900">{value}</p>
  </div>
);

const StatsStrip = ({ stats, businessCurrency }) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const storageCurrency = businessCurrency || 'EUR';
  const { data: walletSummary } = useWalletSummary({ enabled: true, currency: storageCurrency });

  const items = useMemo(() => {
    const completedLessons = stats?.completedSessions ?? 0;
    const upcomingLessons = stats?.upcomingSessions ?? 0;
    const totalHours = stats?.totalHours ?? 0;

    const allBalances = walletSummary?.balances;
    let totalBalance = 0;
    if (Array.isArray(allBalances) && allBalances.length > 0) {
      totalBalance = allBalances.reduce((sum, row) => {
        const amt = Number(row.available) || 0;
        if (amt === 0) return sum;
        if (row.currency === userCurrency || !convertCurrency) return sum + amt;
        return sum + convertCurrency(amt, row.currency, userCurrency);
      }, 0);
    } else {
      const singleAmt = Number(walletSummary?.available) || 0;
      const singleCur = walletSummary?.currency || 'EUR';
      totalBalance = (singleCur === userCurrency || !convertCurrency) ? singleAmt : convertCurrency(singleAmt, singleCur, userCurrency);
    }

    return [
      { label: 'Completed', value: completedLessons, accentKey: 'completed' },
      { label: 'Upcoming',  value: upcomingLessons,  accentKey: 'upcoming'  },
      { label: 'Total hours', value: totalHours,     accentKey: 'hours'     },
      { label: 'Balance', value: formatCurrency(totalBalance, userCurrency), accentKey: 'balance' },
    ];
  }, [stats, walletSummary, formatCurrency, convertCurrency, userCurrency]);

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-none lg:grid lg:grid-cols-4 lg:overflow-visible">
      {items.map((item) => (
        <StatPill key={item.accentKey} label={item.label} value={item.value} accentKey={item.accentKey} />
      ))}
    </div>
  );
};

export default StatsStrip;
