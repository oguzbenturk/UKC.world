import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { App, Spin } from 'antd';
import { useAuth } from '@/shared/hooks/useAuth';
import { featureFlags } from '@/shared/config/featureFlags';
import { useStudentDashboard } from '../hooks/useStudentDashboard';
import StudentBookingWizard from './StudentBookingWizard';
import StudentQuickActions from './StudentQuickActions';
import { getPreferredCurrency } from '../utils/getPreferredCurrency';
import { getWalletBalance } from '../utils/getWalletBalance';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import WaiverModal from '@/features/compliance/components/WaiverModal';
import * as waiverApi from '@/features/compliance/services/waiverApi';

const DEFAULT_WAIVER_MODAL_STATE = {
  open: false,
  userId: null,
  userType: 'user',
  origin: null,
  participantName: null,
};

const useInitialWaiverPrompt = ({ user, initialWaiverCheckDone, setInitialWaiverCheckDone, openWaiverModal }) => {
  useEffect(() => {
    if (!user?.id || initialWaiverCheckDone) {
      return;
    }

    let cancelled = false;

    const runCheck = async () => {
      try {
        const needsWaiver = await waiverApi.needsToSignWaiver(String(user.id), 'user');
        if (!cancelled && needsWaiver) {
          const participantName = user?.first_name
            ? `${user.first_name} ${user?.last_name ?? ''}`.trim()
            : user?.name ?? null;
          openWaiverModal({ userId: user.id, userType: 'user', origin: 'initial', participantName });
        }
      } finally {
        if (!cancelled) {
          setInitialWaiverCheckDone(true);
        }
      }
    };

    runCheck();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.first_name, user?.last_name, user?.name, initialWaiverCheckDone, openWaiverModal, setInitialWaiverCheckDone]);
};

const StudentPortalDisabled = () => (
  <div className="mx-auto max-w-4xl px-4 py-10">
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Student portal is disabled</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        Your account is active, but the student portal isn&apos;t available yet. Please contact the school if you
        believe this is a mistake.
      </p>
    </div>
  </div>
);

const StudentProgressOverview = ({ loading, completed, upcoming, completionPercent, className }) => {
  const baseClasses = 'flex flex-col items-start gap-2 rounded-2xl bg-white/10 px-5 py-4 text-sm shadow-inner backdrop-blur';
  return (
    <div className={className ? `${baseClasses} ${className}` : baseClasses}>
    {loading ? (
      <Spin size="small" />
    ) : (
      <>
        <span className="text-xs uppercase tracking-wider text-white/70">Lesson Progress</span>
        <span className="text-lg font-semibold">{completed} completed · {upcoming} upcoming</span>
        <div className="flex w-full items-center gap-3 pt-1">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/30">
            <span className="block h-full rounded-full bg-lime-300" style={{ width: `${completionPercent}%` }} />
          </div>
          <span className="text-sm font-medium">{completionPercent}%</span>
        </div>
      </>
    )}
    </div>
  );
};

const StudentHeader = ({
  fullName,
  ratingsReminders = [],
  onRateLesson,
}) => (
  <header className="rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 p-6 text-white shadow-lg dark:border-slate-700">
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div className="flex-1">
        <p className="text-sm uppercase tracking-widest text-white/70">Welcome back</p>
        <h1 className="mt-1 text-3xl font-semibold">{fullName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/80">
          Track your lessons, manage packages, and stay on top of payments—from any device.
        </p>
      </div>
      {ratingsReminders.length > 0 && (
        <div className="flex flex-col items-start gap-2 rounded-2xl bg-white/10 px-5 py-4 text-sm shadow-inner backdrop-blur md:w-64">
          <span className="text-xs uppercase tracking-wider text-white/70">Pending Ratings</span>
          <span className="text-lg font-semibold">{ratingsReminders.length} lesson{ratingsReminders.length > 1 ? 's' : ''} to rate</span>
          <button
            type="button"
            onClick={() => onRateLesson?.(ratingsReminders[0])}
            className="mt-1 rounded-full bg-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/30"
          >
            Rate now
          </button>
        </div>
      )}
    </div>
  </header>
);

const StudentLayout = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { data, isLoading, refetch } = useStudentDashboard();
  const { userCurrency, getCurrencySymbol, convertCurrency, businessCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});
  
  // Storage currency is always EUR (base currency)
  const storageCurrency = businessCurrency || 'EUR';
  // Query wallet in storage currency (EUR)
  const { data: walletSummary } = useWalletSummary({ currency: storageCurrency });
  const { notification } = App.useApp();
  const [waiverModalState, setWaiverModalState] = useState(() => ({ ...DEFAULT_WAIVER_MODAL_STATE }));
  const waiverResolverRef = useRef(null);
  const [initialWaiverCheckDone, setInitialWaiverCheckDone] = useState(false);
  const normalizedPath = location.pathname.replace(/\/+$/, '');
  const showHeroNav = normalizedPath === '/student/dashboard';
  const currency = useMemo(() => {
    const fallback = userCurrency ? { code: userCurrency, symbol: getCurrencySymbol(userCurrency) } : undefined;
    return getPreferredCurrency(user, walletSummary, data, fallback);
  }, [user, walletSummary, data, userCurrency, getCurrencySymbol]);
  
  // Get raw balance in storage currency (EUR)
  const rawWalletBalance = useMemo(() => {
    if (typeof walletSummary?.available === 'number') {
      return Number(walletSummary.available);
    }
    const extracted = getWalletBalance(data, user);
    return typeof extracted === 'number' && Number.isFinite(extracted) ? extracted : 0;
  }, [walletSummary, data, user]);
  
  // Convert balance from EUR to user's display currency
  const displayCurrency = currency?.code || userCurrency || storageCurrency;
  const walletBalance = useMemo(() => {
    if (!rawWalletBalance || rawWalletBalance === 0) {
      return 0;
    }
    // Convert from storage currency (EUR) to display currency
    if (convertCurrency && displayCurrency !== storageCurrency) {
      return convertCurrency(rawWalletBalance, storageCurrency, displayCurrency);
    }
    return rawWalletBalance;
  }, [rawWalletBalance, convertCurrency, storageCurrency, displayCurrency]);
  const handleWalletOpen = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wallet:open'));
      window.dispatchEvent(new CustomEvent('studentWallet:open'));
    }
  };
  const handleBookingOpen = (defaults = {}) => {
    setBookingInitialData(defaults);
    setBookingOpen(true);
  };
  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const openWaiverModal = useCallback(({ userId, userType = 'user', origin = null, participantName = null }) => {
    if (!userId) {
      return;
    }
    setWaiverModalState({
      open: true,
      userId: String(userId),
      userType: userType === 'family_member' ? 'family_member' : 'user',
      origin,
      participantName,
    });
  }, []);

  const ensureWaiverSignature = useCallback(async ({ userId, userType = 'user', participantName = null } = {}) => {
    if (!userId) {
      return false;
    }

    return new Promise((resolve) => {
      waiverResolverRef.current = resolve;
      openWaiverModal({ userId, userType, origin: 'booking', participantName });
    });
  }, [openWaiverModal]);

  useInitialWaiverPrompt({
    user,
    initialWaiverCheckDone,
    setInitialWaiverCheckDone,
    openWaiverModal,
  });

  const resetWaiverState = useCallback(() => {
    setWaiverModalState({ ...DEFAULT_WAIVER_MODAL_STATE });
  }, []);

  const handleWaiverSuccess = useCallback(() => {
    const { participantName } = waiverModalState;
    resetWaiverState();
    notification.success({
      message: 'Waiver Signed Successfully!',
      description: participantName
        ? `Thanks for signing the liability waiver for ${participantName}. You can continue with your booking now.`
        : 'Thank you for completing the liability waiver. You can now book lessons and rent equipment.',
      placement: 'bottomRight',
      duration: 5,
    });
    waiverResolverRef.current?.(true);
    waiverResolverRef.current = null;
    refetch();
  }, [notification, refetch, resetWaiverState, waiverModalState]);

  const handleWaiverCancel = useCallback(() => {
    const { origin } = waiverModalState;
    resetWaiverState();
    waiverResolverRef.current?.(false);
    waiverResolverRef.current = null;
    notification.warning({
      message: origin === 'booking' ? 'Booking Blocked' : 'Waiver Not Signed',
      description: origin === 'booking'
        ? 'Please sign the liability waiver to finish submitting your booking request.'
        : 'You must sign the liability waiver to book lessons or rent equipment. You can return to it from your profile any time.',
      placement: 'bottomRight',
      duration: 6,
    });
  }, [notification, resetWaiverState, waiverModalState]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }
    const listener = (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      setBookingInitialData(detail);
      setBookingOpen(true);
    };
    window.addEventListener('studentBooking:open', listener);
    return () => {
      window.removeEventListener('studentBooking:open', listener);
    };
  }, []);

  const metrics = useMemo(() => ({
    completed: data?.stats?.completedSessions ?? 0,
    upcoming: data?.stats?.upcomingSessions ?? 0,
    completionPercent: Math.min(100, Math.round(data?.stats?.completionPercent ?? 0))
  }), [data]);

  const fullName = user?.first_name ? `${user.first_name} ${user?.last_name ?? ''}`.trim() : user?.name || 'Student';
  const outletContext = useMemo(() => ({ overview: data, layout: { showHeroNav } }), [data, showHeroNav]);

  if (!featureFlags.studentPortal) {
    return <StudentPortalDisabled />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
      {showHeroNav && (
        <>
          <StudentHeader
            fullName={fullName}
            ratingsReminders={data?.ratingsReminders ?? []}
            onRateLesson={(booking) => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('student:rateLesson', { detail: booking }));
              }
            }}
          />
        </>
      )}
      <section className={showHeroNav ? 'mt-6' : ''}>
        <Outlet context={outletContext} />
      </section>
      <StudentQuickActions
        onOpenWallet={handleWalletOpen}
        onOpenBooking={() => handleBookingOpen({})}
        onBookAccommodation={() => handleBookingOpen({ preferredCategory: 'accommodation' })}
        onBookRental={() => handleBookingOpen({ preferredCategory: 'rental' })}
        onBuyPackage={() => {
          // Open booking wizard with buy package mode
          // Setting showBuyPackages: true would need to be handled in the wizard
          handleBookingOpen({ showBuyPackages: true });
        }}
        onRateLesson={() => {
          // Dispatch event to trigger rating modal from dashboard
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('student:rateLesson'));
          }
        }}
        ratingsCount={data?.ratingsReminders?.length ?? 0}
        currency={currency}
        balance={walletBalance}
      />
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
        ensureWaiverSignature={ensureWaiverSignature}
      />
      {waiverModalState.open ? (
        <WaiverModal
          open={waiverModalState.open}
          userId={waiverModalState.userId}
          userType={waiverModalState.userType}
          onSuccess={handleWaiverSuccess}
          onCancel={handleWaiverCancel}
        />
      ) : null}
    </div>
  );
};

export default StudentLayout;
