import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import { featureFlags } from '@/shared/config/featureFlags';
import { useStudentDashboard } from '../hooks/useStudentDashboard';
import StudentBookingWizard from './StudentBookingWizard';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';

const StudentPortalDisabled = () => (
  <div className="mx-auto max-w-4xl px-4 py-10">
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <h1 className="text-2xl font-duotone-bold-extended text-slate-900 dark:text-white">Student portal is disabled</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        Your account is active, but the student portal isn&apos;t available yet. Please contact the school if you
        believe this is a mistake.
      </p>
    </div>
  </div>
);

const StudentWelcome = ({ firstName }) => (
  <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
    <h1 className="text-3xl font-duotone-bold-extended text-slate-900 dark:text-white">
      Welcome, {firstName}
    </h1>
    <div className="mt-3 h-0.5 w-10 rounded-full bg-sky-400" />
  </div>
);

const StudentLayout = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data } = useStudentDashboard();
  const { businessCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  const storageCurrency = businessCurrency || 'EUR';
  const { data: walletSummary } = useWalletSummary({ currency: storageCurrency });

  const normalizedPath = location.pathname.replace(/\/+$/, '');
  const showHeroNav = normalizedPath === '/student/dashboard';

  const handleBookingOpen = (defaults = {}) => {
    setBookingInitialData(defaults);
    setBookingOpen(true);
  };
  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  // Handle incoming navigation state to open booking wizard (e.g., from lesson info pages)
  useEffect(() => {
    if (location.state?.openBooking || location.state?.serviceCategory || location.state?.discipline) {
      const initialData = {};
      if (location.state.serviceCategory) initialData.serviceCategory = location.state.serviceCategory;
      if (location.state.discipline) initialData.discipline = location.state.discipline;
      handleBookingOpen(initialData);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const listener = (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      setBookingInitialData(detail);
      setBookingOpen(true);
    };
    window.addEventListener('studentBooking:open', listener);
    return () => window.removeEventListener('studentBooking:open', listener);
  }, []);

  const firstName = user?.first_name || user?.name?.split(' ')[0] || 'there';
  const outletContext = useMemo(() => ({ overview: data, layout: { showHeroNav }, walletSummary }), [data, showHeroNav, walletSummary]);

  if (!featureFlags.studentPortal) {
    return <StudentPortalDisabled />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6 font-duotone-regular">
      {showHeroNav && <StudentWelcome firstName={firstName} />}
      <section className={showHeroNav ? 'mt-4' : ''}>
        <Outlet context={outletContext} />
      </section>
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
      />

    </div>
  );
};

export default StudentLayout;
