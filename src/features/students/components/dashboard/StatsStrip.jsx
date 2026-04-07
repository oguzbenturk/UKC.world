import { useMemo } from 'react';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';

const accentColors = {
  // Lessons
  completed: 'border-l-emerald-400',
  upcoming:  'border-l-[#00a8c4]',
  hours:     'border-l-amber-400',
  // Rentals
  rentals_completed: 'border-l-orange-500',
  rentals_upcoming: 'border-l-orange-400',
  rentals_days: 'border-l-orange-300',
  rentals_spent: 'border-l-orange-600',
  // Accommodations
  accommodations_completed: 'border-l-purple-500',
  accommodations_upcoming: 'border-l-purple-400',
  accommodations_nights: 'border-l-purple-300',
  accommodations_spent: 'border-l-purple-600',
  // Shop
  orders_completed: 'border-l-rose-500',
  orders_pending: 'border-l-rose-400',
  orders_spent: 'border-l-rose-600',
  // Wallet
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
    // Lessons
    const completedLessons = stats?.completedSessions ?? 0;
    const upcomingLessons = stats?.upcomingSessions ?? 0;
    const totalHours = stats?.totalHours ?? 0;

    // Rentals
    const completedRentals = stats?.completedRentals ?? 0;
    const upcomingRentals = stats?.upcomingRentals ?? 0;
    const totalRentalDays = stats?.totalRentalDays ?? 0;
    const totalRentalSpent = stats?.totalRentalSpent ?? 0;

    // Accommodations
    const completedAccommodations = stats?.completedAccommodations ?? 0;
    const upcomingAccommodations = stats?.upcomingAccommodations ?? 0;
    const totalAccommodationNights = stats?.totalAccommodationNights ?? 0;
    const totalAccommodationSpent = stats?.totalAccommodationSpent ?? 0;

    // Shop Orders
    const completedOrders = stats?.completedOrders ?? 0;
    const pendingOrders = stats?.pendingOrders ?? 0;
    const totalOrdersSpent = stats?.totalOrdersSpent ?? 0;

    // Wallet Balance
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
      // Lessons
      { label: 'Completed', value: completedLessons, accentKey: 'completed' },
      { label: 'Upcoming',  value: upcomingLessons,  accentKey: 'upcoming'  },
      { label: 'Total hours', value: totalHours,     accentKey: 'hours'     },
      // Rentals
      { label: 'Rentals Done', value: completedRentals, accentKey: 'rentals_completed' },
      { label: 'Rentals Upcoming', value: upcomingRentals, accentKey: 'rentals_upcoming' },
      { label: 'Rental Days', value: totalRentalDays, accentKey: 'rentals_days' },
      { label: 'Spent (Rentals)', value: formatCurrency(totalRentalSpent, userCurrency), accentKey: 'rentals_spent' },
      // Accommodations
      { label: 'Stays Done', value: completedAccommodations, accentKey: 'accommodations_completed' },
      { label: 'Stays Upcoming', value: upcomingAccommodations, accentKey: 'accommodations_upcoming' },
      { label: 'Nights', value: totalAccommodationNights, accentKey: 'accommodations_nights' },
      { label: 'Spent (Stays)', value: formatCurrency(totalAccommodationSpent, userCurrency), accentKey: 'accommodations_spent' },
      // Shop
      { label: 'Orders Done', value: completedOrders, accentKey: 'orders_completed' },
      { label: 'Orders Pending', value: pendingOrders, accentKey: 'orders_pending' },
      { label: 'Spent (Shop)', value: formatCurrency(totalOrdersSpent, userCurrency), accentKey: 'orders_spent' },
      // Wallet
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
