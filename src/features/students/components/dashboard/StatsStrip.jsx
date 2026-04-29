import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import accommodationApi from '@/shared/services/accommodationApi';
import LessonsSection from './LessonsSection';
import RentalsSection from './RentalsSection';

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
  // Memberships
  memberships_active: 'border-l-[#93c47d]',
  memberships_expired: 'border-l-slate-400',
  // Wallet
  balance:   'border-l-violet-400',
};

const StatPill = ({ label, value, accentKey }) => (
  <div className={`min-w-[140px] shrink-0 rounded-2xl border border-slate-100 border-l-[3px] bg-white px-4 py-3 shadow-sm ${accentColors[accentKey] || 'border-l-slate-300'}`}>
    <p className="font-gotham-medium text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-1 font-duotone-bold text-xl text-slate-900">{value}</p>
  </div>
);

const CollapsibleStatGroup = ({ label, items, isExpanded, onToggle, children }) => (
  <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
    <button
      onClick={onToggle}
      className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors"
    >
      <h3 className="font-duotone-bold text-sm text-slate-900 uppercase tracking-wide">{label}</h3>
      <ChevronDownIcon className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
    </button>

    {isExpanded && (
      <>
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/30 overflow-x-auto">
          <div className="flex gap-3 scrollbar-none">
            {items.map((item) => (
              <StatPill key={item.accentKey} label={item.label} value={item.value} accentKey={item.accentKey} />
            ))}
          </div>
        </div>
        {children && (
          <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/30 space-y-3">
            {children}
          </div>
        )}
      </>
    )}
  </div>
);

const fetchMyPurchases = async () => {
  const { data } = await apiClient.get('/member-offerings/my-purchases');
  return data;
};

const MembershipCards = ({ purchases }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(['student']);
  if (!purchases || purchases.length === 0) return null;

  const active = purchases.filter(p => p.status === 'active' && (!p.expires_at || new Date(p.expires_at) > new Date()));
  if (active.length === 0) return null;

  return (
    <div className="space-y-2">
      {active.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => navigate('/members/offerings')}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#93c47d]/30 bg-gradient-to-r from-[#93c47d]/5 to-transparent px-4 py-3 text-left hover:bg-[#93c47d]/10 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="font-duotone-bold text-sm text-slate-900 truncate">{p.offering_name || p.name || 'Membership'}</p>
            {p.expires_at && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {t('student:dashboard.statsStrip.membership.expires', { date: new Date(p.expires_at).toLocaleDateString() })}
              </p>
            )}
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            {t('student:dashboard.statsStrip.membership.owned')}
          </span>
        </button>
      ))}
    </div>
  );
};

const STATUS_STYLE = {
  pending:    { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending' },
  confirmed:  { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Confirmed' },
  completed:  { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Completed' },
  cancelled:  { bg: 'bg-red-50', text: 'text-red-700', label: 'Cancelled' },
  checked_in: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Checked In' },
};

const AccommodationCards = ({ bookings, formatPrice }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(['student']);
  if (!bookings || bookings.length === 0) return null;

  // Show upcoming/current first, then recent past — max 4
  const now = dayjs();
  const upcoming = bookings.filter(b => b.status !== 'cancelled' && dayjs(b.check_out_date).isAfter(now));
  const past = bookings.filter(b => b.status === 'completed' || dayjs(b.check_out_date).isBefore(now)).slice(0, 2);
  const visible = [...upcoming, ...past].slice(0, 4);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map(b => {
        const checkIn = dayjs(b.check_in_date);
        const checkOut = dayjs(b.check_out_date);
        const nights = checkOut.diff(checkIn, 'day');
        const isCurrent = checkIn.isBefore(now) && checkOut.isAfter(now);
        const status = STATUS_STYLE[b.status] || STATUS_STYLE.pending;

        return (
          <button
            key={b.id}
            type="button"
            onClick={() => navigate('/accommodation')}
            className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              isCurrent
                ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50'
                : 'border-purple-200/50 bg-gradient-to-r from-purple-50/30 to-transparent hover:bg-purple-50/40'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-duotone-bold text-sm text-slate-900 truncate">
                  {b.unit?.name || `Stay #${b.unit_id}`}
                </p>
                {isCurrent && (
                  <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    {t('student:dashboard.statsStrip.accommodation.now')}
                  </span>
                )}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {checkIn.format('MMM D')} → {checkOut.format('MMM D')} &middot; {t('student:dashboard.statsStrip.accommodation.nightCount', { count: nights })}
                {b.guests_count > 1 && <> &middot; {t('student:dashboard.statsStrip.accommodation.guests', { count: b.guests_count })}</>}
              </p>
            </div>
            <span className="shrink-0 font-duotone-bold text-sm text-purple-600">
              {formatPrice(b.total_price, b.currency)}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const StatsStrip = ({ stats, businessCurrency, upcomingLessons = [], pastLessons = [], upcomingRentalsList = [], pastRentalsList = [] }) => {
  const { t } = useTranslation(['student']);
  const { formatDualCurrency, convertCurrency, userCurrency } = useCurrency();
  const storageCurrency = businessCurrency || 'EUR';
  const { data: walletSummary } = useWalletSummary({ enabled: true, currency: storageCurrency });
  const { data: myPurchases = [] } = useQuery({
    queryKey: ['my-member-purchases'],
    queryFn: fetchMyPurchases,
    staleTime: 5 * 60_000,
  });
  const { data: myAccommodations = [] } = useQuery({
    queryKey: ['my-accommodation-bookings'],
    queryFn: () => accommodationApi.getMyBookings(),
    staleTime: 5 * 60_000,
  });

  const [expandedSections, setExpandedSections] = useState({
    lessons: true,
    rentals: false,
    accommodations: false,
    shop: false,
    memberships: false,
    wallet: false
  });

  const statGroups = useMemo(() => {
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

    // Memberships
    const activeMemberships = Array.isArray(myPurchases)
      ? myPurchases.filter(p => p.status === 'active' && (!p.expires_at || new Date(p.expires_at) > new Date()))
      : [];
    const expiredMemberships = Array.isArray(myPurchases)
      ? myPurchases.filter(p => p.status !== 'active' || (p.expires_at && new Date(p.expires_at) <= new Date()))
      : [];

    // Wallet Balance — kept in storageCurrency so the dashboard pill matches
    // the StudentWalletModal's dual-currency display.
    const allBalances = walletSummary?.balances;
    let totalBalance = 0;
    if (Array.isArray(allBalances) && allBalances.length > 0) {
      totalBalance = allBalances.reduce((sum, row) => {
        const amt = Number(row.available) || 0;
        if (amt === 0) return sum;
        if (row.currency === storageCurrency || !convertCurrency) return sum + amt;
        return sum + convertCurrency(amt, row.currency, storageCurrency);
      }, 0);
    } else {
      const singleAmt = Number(walletSummary?.available) || 0;
      const singleCur = walletSummary?.currency || storageCurrency;
      totalBalance = (singleCur === storageCurrency || !convertCurrency) ? singleAmt : convertCurrency(singleAmt, singleCur, storageCurrency);
    }

    return {
      lessons: {
        label: t('student:dashboard.statsStrip.lessons'),
        items: [
          { label: t('student:dashboard.statsStrip.stats.completed'), value: completedLessons, accentKey: 'completed' },
          { label: t('student:dashboard.statsStrip.stats.upcoming'),  value: upcomingLessons,  accentKey: 'upcoming'  },
          { label: t('student:dashboard.statsStrip.stats.totalHours'), value: totalHours,      accentKey: 'hours'     },
        ]
      },
      rentals: {
        label: t('student:dashboard.statsStrip.rentals'),
        items: [
          { label: t('student:dashboard.statsStrip.stats.completed'), value: completedRentals, accentKey: 'rentals_completed' },
          { label: t('student:dashboard.statsStrip.stats.upcoming'), value: upcomingRentals, accentKey: 'rentals_upcoming' },
          { label: t('student:dashboard.statsStrip.stats.days'), value: totalRentalDays, accentKey: 'rentals_days' },
          { label: t('student:dashboard.statsStrip.stats.spent'), value: formatDualCurrency(totalRentalSpent, storageCurrency), accentKey: 'rentals_spent' },
        ]
      },
      accommodations: {
        label: t('student:dashboard.statsStrip.accommodations'),
        items: [
          { label: t('student:dashboard.statsStrip.stats.completed'), value: completedAccommodations, accentKey: 'accommodations_completed' },
          { label: t('student:dashboard.statsStrip.stats.upcoming'), value: upcomingAccommodations, accentKey: 'accommodations_upcoming' },
          { label: t('student:dashboard.statsStrip.stats.nights'), value: totalAccommodationNights, accentKey: 'accommodations_nights' },
          { label: t('student:dashboard.statsStrip.stats.spent'), value: formatDualCurrency(totalAccommodationSpent, storageCurrency), accentKey: 'accommodations_spent' },
        ]
      },
      shop: {
        label: t('student:dashboard.statsStrip.shop'),
        items: [
          { label: t('student:dashboard.statsStrip.stats.completed'), value: completedOrders, accentKey: 'orders_completed' },
          { label: t('student:dashboard.statsStrip.stats.pending'), value: pendingOrders, accentKey: 'orders_pending' },
          { label: t('student:dashboard.statsStrip.stats.spent'), value: formatDualCurrency(totalOrdersSpent, storageCurrency), accentKey: 'orders_spent' },
        ]
      },
      memberships: {
        label: t('student:dashboard.statsStrip.memberships'),
        items: [
          { label: t('student:dashboard.statsStrip.stats.active'), value: activeMemberships.length, accentKey: 'memberships_active' },
          { label: t('student:dashboard.statsStrip.stats.expired'), value: expiredMemberships.length, accentKey: 'memberships_expired' },
        ]
      },
      wallet: {
        label: t('student:dashboard.statsStrip.wallet'),
        items: [
          { label: t('student:dashboard.statsStrip.stats.balance'), value: formatDualCurrency(totalBalance, storageCurrency), accentKey: 'balance' },
        ]
      }
    };
  }, [t, stats, walletSummary, myPurchases, formatDualCurrency, convertCurrency, storageCurrency, userCurrency]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <div className="space-y-3">
      {Object.entries(statGroups).map(([key, group]) => (
        <CollapsibleStatGroup
          key={key}
          label={group.label}
          items={group.items}
          isExpanded={expandedSections[key]}
          onToggle={() => toggleSection(key)}
        >
          {key === 'lessons' && (upcomingLessons.length > 0 || pastLessons.length > 0) && (
            <LessonsSection upcoming={upcomingLessons} past={pastLessons} />
          )}
          {key === 'rentals' && (upcomingRentalsList.length > 0 || pastRentalsList.length > 0) && (
            <RentalsSection upcoming={upcomingRentalsList} past={pastRentalsList} />
          )}
          {key === 'accommodations' && (
            <AccommodationCards
              bookings={myAccommodations}
              formatPrice={(price, cur) => formatDualCurrency(price || 0, cur || storageCurrency)}
            />
          )}
          {key === 'memberships' && <MembershipCards purchases={myPurchases} />}
        </CollapsibleStatGroup>
      ))}
    </div>
  );
};

export default StatsStrip;
