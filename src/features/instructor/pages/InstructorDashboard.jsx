import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstructorDashboard } from '../hooks/useInstructorDashboard';
import { useInstructorStudents } from '../hooks/useInstructorStudents';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { usePullToRefresh } from '@/shared/hooks/usePullToRefresh';
import { analyticsService } from '@/shared/services/analyticsService';
import { CalendarProvider } from '@/features/bookings/components/contexts/CalendarContext';
import EarningsTrendCard from '../components/EarningsTrendCard';
import HeroCarousel from '../components/HeroCarousel';
import SummaryMetricStrip from '../components/SummaryMetricStrip';
import FinanceTabs from '../components/FinanceTabs';
import UpcomingLessonsAccordion from '../components/UpcomingLessonsAccordion';
import StudentCheckInPanel from '../components/StudentCheckInPanel';
import LessonStatusHeatmap from '../components/LessonStatusHeatmap';
import FloatingQuickAction from '../components/FloatingQuickAction';
import InstructorRatingsCard from '../components/InstructorRatingsCard';

const BookingDrawer = lazy(() => import('@/features/bookings/components/components/BookingDrawer'));

const formatNumber = (value) => {
  if (value === undefined || value === null) return '—';
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateShort = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDayLabel = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const numberNoDecimals = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const placeholderKeys = Array.from({ length: 6 }, (_, index) => index);

const computeInstructorName = (user) => {
  if (!user) return 'Instructor';
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Instructor';
  }
  return user.name || user.email || 'Instructor';
};

const computeTodaysLessonsCount = (upcomingLessons) => {
  if (!Array.isArray(upcomingLessons) || !upcomingLessons.length) return 0;
  const todayKey = new Date().toISOString().split('T')[0];
  return upcomingLessons.reduce((count, lesson) => {
    if (!lesson?.startTime) return count;
    const lessonDate = new Date(lesson.startTime);
    if (Number.isNaN(lessonDate.getTime())) return count;
    return lessonDate.toISOString().split('T')[0] === todayKey ? count + 1 : count;
  }, 0);
};

const computePendingHint = (pendingThresholdInfo, formatAmount) => {
  if (!pendingThresholdInfo) return 'Awaiting confirmation';
  if (pendingThresholdInfo.meetsThreshold) return 'Eligible to request payout.';
  return `${formatAmount(pendingThresholdInfo.shortfall)} until payout threshold`;
};

const buildHeroSlides = (data, pendingThresholdInfo, nextLesson, formatAmount, navigate) => {
  if (!data) return [];
  const slides = [];

  if (pendingThresholdInfo) {
    slides.push({
      id: 'payout',
      eyebrow: 'Pending earnings',
      title: `${formatAmount(data.finance.pending)} ready to unlock`,
      body: pendingThresholdInfo.meetsThreshold
        ? 'Great news! You can request a payout whenever it suits you.'
        : `${formatAmount(pendingThresholdInfo.shortfall)} more in confirmed lessons will make your payout available.`,
      pill: {
        label: pendingThresholdInfo.meetsThreshold ? 'Action ready' : 'Keep momentum',
      },
      cta: pendingThresholdInfo.meetsThreshold
        ? {
          primary: {
            label: 'Go to payouts',
            onClick: () => navigate('/finance'),
          },
        }
        : {},
    });
  }

  if (nextLesson) {
    slides.push({
      id: 'next-lesson',
      eyebrow: 'Next on your calendar',
      title: `${nextLesson.studentName} at ${formatDateShort(nextLesson.startTime)}`,
      body: 'Jump into the booking board for last-minute adjustments and notes.',
      pill: {
        label: "Today's focus",
        variant: 'bg-emerald-100 text-emerald-700',
      },
      cta: {
        primary: {
          label: 'View calendar',
          onClick: () => navigate('/bookings/calendar'),
        },
      },
    });
  }

  slides.push({
    id: 'students',
    eyebrow: 'Momentum',
    title: `${numberNoDecimals.format(data?.studentStats?.activeThisMonth ?? 0)} students engaged this month`,
    body: 'Keep streaks going with timely notes and follow-ups for your roster.',
    pill: {
      label: 'Roster health',
      variant: 'bg-sky-500 text-white',
    },
    cta: {
      primary: {
        label: 'Open my students',
        onClick: () => navigate('/instructor/students'),
      },
    },
    footer: data?.lessonInsights?.inactiveStudents?.length
      ? `${data.lessonInsights.inactiveStudents.length} students await a check-in`
      : 'All students have booked recently — great work!'
  });

  return slides;
};

const buildSummaryCards = (data, todaysLessonsCount, nextLesson, formatAmount, pendingHint) => {
  if (!data) return [];
  return [
    {
      title: 'Active Students',
      value: numberNoDecimals.format(data.studentStats?.activeThisMonth ?? 0),
      hint: `${numberNoDecimals.format(data.studentStats?.uniqueStudents ?? 0)} total in roster`,
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
    },
    {
      title: "Today's Lessons",
      value: numberNoDecimals.format(todaysLessonsCount),
      hint: `${numberNoDecimals.format(data.upcomingLessons?.length ?? 0)} upcoming overall`,
      dotClass: 'bg-sky-500',
      textClass: 'text-sky-600',
    },
    {
      title: 'Next Lesson',
      value: nextLesson ? formatDateShort(nextLesson.startTime) : 'None scheduled',
      hint: nextLesson?.studentName ? `With ${nextLesson.studentName}` : 'Stay ready for new bookings',
      dotClass: 'bg-violet-500',
      textClass: 'text-violet-600',
    },
    {
      title: 'Pending Payout',
      value: formatAmount(data.finance?.pending),
      hint: pendingHint,
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-600',
    },
  ];
};

const buildQuickActions = (navigate, onNewBooking) => ([
  {
    title: 'Manage Students',
    description: 'Review levels, notes, and progress',
    icon: '\uD83D\uDC65',
    onClick: () => navigate('/instructor/students'),
  },
  {
    title: 'Lesson Calendar',
    description: 'Adjust availability and reschedule',
    icon: '\uD83D\uDCC5',
    onClick: () => navigate('/bookings/calendar'),
  },
  {
    title: 'New Booking',
    description: 'Schedule a lesson for a student',
    icon: '\u2795',
    onClick: onNewBooking,
  },
]);

const groupLessonsByDay = (upcomingLessons) => {
  if (!Array.isArray(upcomingLessons) || !upcomingLessons.length) return [];
  const groups = new Map();
  upcomingLessons.forEach((lesson) => {
    if (!lesson?.startTime) return;
    const lessonDate = new Date(lesson.startTime);
    if (Number.isNaN(lessonDate.getTime())) return;
    const key = lessonDate.toISOString().split('T')[0];
    if (!groups.has(key)) {
      groups.set(key, { label: formatDayLabel(lessonDate), lessons: [] });
    }
    groups.get(key).lessons.push(lesson);
  });
  return Array.from(groups.values());
};

const rankTopStudents = (students) => {
  if (!Array.isArray(students) || !students.length) return [];
  return [...students]
    .sort((a, b) => (b.totalHours || 0) - (a.totalHours || 0))
    .slice(0, 5);
};

const buildNudgeMessages = (pendingThresholdInfo, inactiveStudents, formatAmount, navigate, inactiveWindowDays) => {
  const nudges = [];
  if (pendingThresholdInfo && !pendingThresholdInfo.meetsThreshold) {
    nudges.push({
      id: 'payout-shortfall',
      title: 'Keep the payout streak alive',
      body: `${formatAmount(pendingThresholdInfo.shortfall)} more in confirmed lessons will unlock your payout. Consider offering a package or sending a reminder.`,
      action: {
        label: 'Send reminder',
        onClick: () => navigate('/instructor/students'),
      },
    });
  }
  if (inactiveStudents?.length) {
    nudges.push({
      id: 'inactive-students',
      title: 'Bring back inactive students',
      body: `${inactiveStudents.length} students have been quiet for ${inactiveWindowDays || 30}+ days. A quick check-in goes a long way.`,
      action: {
        label: 'Open check-in list',
        onClick: () => document.getElementById('instructor-checkin')?.scrollIntoView({ behavior: 'smooth' }),
      },
    });
  }
  return nudges;
};

const InstructorDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, refetch, lastUpdated } = useInstructorDashboard(0);
  const { students, loading: studentsLoading, error: studentsError } = useInstructorStudents();
  const { formatCurrency, businessCurrency } = useCurrency();
  const [financeTab, setFinanceTab] = useState('overview');
  const [bookingDrawerOpen, setBookingDrawerOpen] = useState(false);
  const viewLoggedRef = useRef(false);

  const currencyCode = businessCurrency || 'EUR';
  const formatAmount = useCallback(
    (value = 0) => formatCurrency(value || 0, currencyCode),
    [formatCurrency, currencyCode],
  );

  const handleRefresh = useCallback(() => {
    analyticsService.track('instructor_dashboard_refreshed');
    refetch();
  }, [refetch]);

  usePullToRefresh(() => {
    analyticsService.track('instructor_dashboard_pull_refresh');
    refetch();
  }, { threshold: 90, maxScroll: 30 });

  useEffect(() => {
    if (!viewLoggedRef.current) {
      viewLoggedRef.current = true;
      analyticsService.track('instructor_dashboard_viewed');
    }
  }, []);

  const instructorName = useMemo(() => computeInstructorName(user), [user]);

  const nextLesson = useMemo(() => data?.upcomingLessons?.[0] ?? null, [data]);

  const todaysLessonsCount = useMemo(
    () => computeTodaysLessonsCount(data?.upcomingLessons),
    [data?.upcomingLessons],
  );

  const pendingThresholdInfo = data?.finance?.pendingThreshold;
  const pendingCardHint = useMemo(
    () => computePendingHint(pendingThresholdInfo, formatAmount),
    [pendingThresholdInfo, formatAmount],
  );

  const heroSlides = useMemo(
    () => buildHeroSlides(data, pendingThresholdInfo, nextLesson, formatAmount, navigate),
    [data, pendingThresholdInfo, nextLesson, formatAmount, navigate],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(data, todaysLessonsCount, nextLesson, formatAmount, pendingCardHint),
    [data, todaysLessonsCount, nextLesson, formatAmount, pendingCardHint],
  );

  const financeSummary = data?.finance || null;

  const handleStudentNavigate = useCallback((studentId) => {
    if (!studentId) return;
    navigate(`/instructor/students/${studentId}`);
  }, [navigate]);

  const handleCreateBooking = useCallback(() => {
    analyticsService.track('instructor_dashboard_fab_clicked');
    setBookingDrawerOpen(true);
  }, []);

  const quickActions = useMemo(() => buildQuickActions(navigate, handleCreateBooking), [navigate, handleCreateBooking]);

  const groupedLessons = useMemo(
    () => groupLessonsByDay(data?.upcomingLessons),
    [data?.upcomingLessons],
  );

  const topStudents = useMemo(() => rankTopStudents(students), [students]);

  const inactiveStudents = useMemo(
    () => data?.lessonInsights?.inactiveStudents ?? [],
    [data?.lessonInsights?.inactiveStudents],
  );
  const statusBreakdown = data?.lessonInsights?.statusBreakdown || [];

  const isRefreshing = loading && !!data;
  const showSkeleton = loading && !data;

  if (showSkeleton) {
    return (
      <div className="space-y-6 p-4 md:p-6 pb-24 md:pb-10">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <>
      <InstructorDashboardView
        instructorName={instructorName}
        nextLesson={nextLesson}
        onRefresh={handleRefresh}
        refreshing={isRefreshing}
        lastUpdated={lastUpdated}
        heroSlides={heroSlides}
        error={error}
        studentsError={studentsError}
        summaryCards={summaryCards}
        loading={loading}
        dataAvailable={Boolean(data)}
        financeSummary={financeSummary}
        financeTab={financeTab}
        onFinanceTabChange={setFinanceTab}
        formatAmount={formatAmount}
        groupedLessons={groupedLessons}
        quickActions={quickActions}
        topStudents={topStudents}
        studentsLoading={studentsLoading}
        onStudentNavigate={handleStudentNavigate}
        inactiveStudents={inactiveStudents}
        statusBreakdown={statusBreakdown}
        onCreateBooking={handleCreateBooking}
        onViewStudents={() => navigate('/instructor/students')}
      />

      {bookingDrawerOpen && (
        <Suspense fallback={null}>
          <CalendarProvider>
            <BookingDrawer
              isOpen={bookingDrawerOpen}
              onClose={() => setBookingDrawerOpen(false)}
              prefilledInstructor={{ id: user?.id, name: user?.name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() }}
              onBookingCreated={() => {
                setBookingDrawerOpen(false);
                refetch();
              }}
            />
          </CalendarProvider>
        </Suspense>
      )}
    </>
  );
};

const InstructorDashboardView = ({
  instructorName,
  nextLesson,
  onRefresh,
  refreshing,
  lastUpdated,
  heroSlides,
  error,
  studentsError,
  summaryCards,
  loading,
  dataAvailable,
  financeSummary,
  financeTab,
  onFinanceTabChange,
  formatAmount,
  groupedLessons,
  quickActions,
  topStudents,
  studentsLoading,
  onStudentNavigate,
  onViewStudents,
  inactiveStudents,
  statusBreakdown,
  onCreateBooking,
}) => (
  <div className="space-y-4 p-4 md:p-5 pb-20 md:pb-8">
    <HeroSection
      name={instructorName}
      nextLesson={nextLesson}
      onRefresh={onRefresh}
      refreshing={refreshing}
      lastUpdated={lastUpdated}
      slides={heroSlides}
      quickActions={quickActions}
    />

    {error && (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
    )}
    {studentsError && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{studentsError}</div>
    )}

    <SummaryMetricStrip cards={summaryCards} loading={loading && !dataAvailable} />

    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="space-y-4 xl:col-span-2">
        <FinanceOverview
          finance={financeSummary}
          loading={loading}
          formatAmount={formatAmount}
          onTabChange={onFinanceTabChange}
          activeTab={financeTab}
        />
        <UpcomingLessonsAccordion groupedLessons={groupedLessons} loading={loading} />
      </div>
      <aside className="space-y-4">
        <InstructorRatingsCard limit={3} />
        <LessonStatusHeatmap breakdown={statusBreakdown} />
      </aside>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" id="instructor-checkin">
      <TopStudentsList
        students={topStudents}
        loading={studentsLoading}
        onSelect={onStudentNavigate}
        onViewAll={onViewStudents}
      />
      <StudentCheckInPanel
        students={inactiveStudents}
        loading={loading}
        onSelect={onStudentNavigate}
      />
    </div>

    <FloatingQuickAction label="Create booking" onClick={onCreateBooking} />
  </div>
);

const HeroSection = ({ name, nextLesson, onRefresh, refreshing, lastUpdated, slides, quickActions = [] }) => (
  <section className="rounded-xl md:rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/30 to-white shadow-sm p-3 sm:p-5 md:p-6 space-y-2 sm:space-y-3">
    <div className="flex items-start sm:items-center justify-between gap-2">
      <div className="space-y-0.5 sm:space-y-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-sky-500 animate-pulse" />
          <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dashboard</p>
        </div>
        <h1 className="text-lg sm:text-2xl md:text-3xl font-semibold text-slate-900 truncate">Welcome back, {name}</h1>
        <p className="text-xs sm:text-sm text-slate-500 line-clamp-2">
          {nextLesson ? (
            <>
              Next: <span className="font-semibold text-slate-800">{nextLesson.studentName}</span> at {formatDateShort(nextLesson.startTime)}
            </>
          ) : (
            <>All caught up. Use the quick actions below to plan ahead.</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-60 shadow-sm"
        >
          {refreshing ? '\u21BB' : 'Refresh'}
        </button>
        {lastUpdated && (
          <p className="text-[10px] text-slate-400 hidden sm:block">
            {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto] gap-2 sm:gap-3 items-stretch">
      <HeroCarousel slides={slides} />
      {quickActions.length > 0 && (
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-1.5 sm:gap-2 lg:w-44">
          {quickActions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={action.onClick}
              className="text-center lg:text-left rounded-lg border border-slate-100 bg-white/80 backdrop-blur-sm px-2 py-2 sm:px-3.5 sm:py-2.5 hover:bg-sky-50 hover:border-sky-200 active:scale-[0.97] transition group"
            >
              {action.icon && <span className="text-base lg:hidden block">{action.icon}</span>}
              <div className="flex items-center gap-2">
                {action.icon && <span className="text-sm hidden lg:block">{action.icon}</span>}
                <div>
                  <p className="text-[11px] sm:text-sm font-medium text-slate-800 group-hover:text-sky-700 transition">{action.title}</p>
                  <p className="text-[10px] text-slate-400 hidden lg:block">{action.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
);

const FinanceOverviewSummary = ({ finance, loading, formatAmount, pendingInfo, pendingHint }) => {
  const effectivePendingHint = pendingInfo?.meetsThreshold ? 'Eligible to request payout now.' : pendingHint;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <FinanceTile label="Total Earned" value={formatAmount(finance?.totalEarned)} accent="text-emerald-600" />
        <FinanceTile label="Month to Date" value={formatAmount(finance?.monthToDate)} accent="text-sky-600" />
        <FinanceTile label="Pending" value={formatAmount(finance?.pending)} accent="text-amber-600" hint={effectivePendingHint} />
        <FinanceTile label="Paid Out" value={formatAmount(finance?.totalPaid)} accent="text-violet-600" hint={`Net ${formatAmount(finance?.netPayments)}`} />
      </div>

      <EarningsTrendCard
        timeseries={finance?.timeseries}
        loading={loading}
        formatCurrency={formatAmount}
        pendingThreshold={pendingInfo}
      />

      <div className="rounded-xl border border-slate-100 p-4 bg-gradient-to-r from-slate-50/50 to-white">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Last Payout</p>
        {finance?.lastPayout ? (
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold text-emerald-600 tabular-nums">{formatAmount(finance.lastPayout.amount)}</p>
            <p className="text-xs text-slate-400">Paid {formatDateTime(finance.lastPayout.paymentDate)}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No payouts recorded yet.</p>
        )}
      </div>
    </div>
  );
};

const FinanceEarningsTable = ({ earnings, formatAmount }) => (
  <>
    {/* Desktop table */}
    <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50/70">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <th className="py-2.5 px-4">Date</th>
            <th className="py-2.5 px-4">Student</th>
            <th className="py-2.5 px-4">Hours</th>
            <th className="py-2.5 px-4">Amount</th>
            <th className="py-2.5 px-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {earnings?.length ? earnings.map((row) => (
            <tr key={row.bookingId} className="hover:bg-slate-50/50 transition">
              <td className="py-2.5 px-4 text-slate-600 text-xs">{formatDateTime(row.lessonDate)}</td>
              <td className="py-2.5 px-4 text-slate-800 font-medium">{row.studentName || '\u2014'}</td>
              <td className="py-2.5 px-4 text-slate-500 tabular-nums">{formatNumber(row.durationHours)}</td>
              <td className="py-2.5 px-4 font-semibold text-slate-900 tabular-nums">{formatAmount(row.amount)}</td>
              <td className="py-2.5 px-4"><span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">{row.status}</span></td>
            </tr>
          )) : (
            <tr>
              <td colSpan={5} className="py-6 text-center text-xs text-slate-400">No earnings recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    {/* Mobile cards */}
    <div className="sm:hidden space-y-2">
      {earnings?.length ? earnings.map((row) => (
        <div key={row.bookingId} className="rounded-lg border border-slate-100 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-800">{row.studentName || '\u2014'}</span>
            <span className="text-xs font-bold text-slate-900 tabular-nums">{formatAmount(row.amount)}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-slate-400">{formatDateTime(row.lessonDate)}</span>
            <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-1.5 py-0.5 text-[9px] font-medium uppercase">{row.status}</span>
          </div>
        </div>
      )) : (
        <p className="text-center text-xs text-slate-400 py-4">No earnings recorded yet.</p>
      )}
    </div>
  </>
);

const FinancePaymentsTable = ({ payments, formatAmount }) => (
  <>
    {/* Desktop table */}
    <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50/70">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <th className="py-2.5 px-4">Date</th>
            <th className="py-2.5 px-4">Amount</th>
            <th className="py-2.5 px-4">Description</th>
            <th className="py-2.5 px-4">Method</th>
            <th className="py-2.5 px-4">Reference</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {payments?.length ? payments.map((payment) => (
            <tr key={payment.id} className="hover:bg-slate-50/50 transition">
              <td className="py-2.5 px-4 text-slate-600 text-xs">{formatDateTime(payment.paymentDate)}</td>
              <td className="py-2.5 px-4 font-semibold text-emerald-600 tabular-nums">{formatAmount(payment.amount)}</td>
              <td className="py-2.5 px-4 text-slate-600">{payment.description || 'Instructor payout'}</td>
              <td className="py-2.5 px-4 text-slate-500 capitalize">{payment.method || 'balance'}</td>
              <td className="py-2.5 px-4 text-slate-400 font-mono text-xs">{payment.referenceNumber || '\u2014'}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={5} className="py-6 text-center text-xs text-slate-400">No payout history yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    {/* Mobile cards */}
    <div className="sm:hidden space-y-2">
      {payments?.length ? payments.map((payment) => (
        <div key={payment.id} className="rounded-lg border border-slate-100 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 tabular-nums">{formatAmount(payment.amount)}</span>
            <span className="text-[10px] text-slate-400 capitalize">{payment.method || 'balance'}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-slate-400">{formatDateTime(payment.paymentDate)}</span>
            <span className="text-[10px] text-slate-500">{payment.description || 'Payout'}</span>
          </div>
        </div>
      )) : (
        <p className="text-center text-xs text-slate-400 py-4">No payout history yet.</p>
      )}
    </div>
  </>
);

const FinanceOverview = ({ finance, loading, formatAmount, onTabChange, activeTab }) => {
  const pendingInfo = finance?.pendingThreshold;
  const pendingHint = computePendingHint(pendingInfo, formatAmount);
  const tabs = useMemo(() => ([
    {
      key: 'overview',
      label: 'Overview',
      description: 'High-level performance at a glance',
      content: (
        <FinanceOverviewSummary
          finance={finance}
          loading={loading}
          formatAmount={formatAmount}
          pendingInfo={pendingInfo}
          pendingHint={pendingHint}
        />
      ),
    },
    {
      key: 'earnings',
      label: 'Earnings',
      badge: finance?.recentEarnings?.length ?? 0,
      description: 'Recent completed lessons and earnings breakdown',
      content: <FinanceEarningsTable earnings={finance?.recentEarnings} formatAmount={formatAmount} />,
    },
    {
      key: 'payments',
      label: 'Payments',
      badge: finance?.recentPayments?.length ?? 0,
      description: 'Latest payouts into your account',
      content: <FinancePaymentsTable payments={finance?.recentPayments} formatAmount={formatAmount} />,
    },
  ]), [finance, loading, formatAmount, pendingInfo, pendingHint]);

  const lifetimeEarnings = formatAmount(finance?.totalEarned);
  const hasFinance = Boolean(finance);

  return (
    <section className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-5">
      <header className="flex items-center justify-between mb-2 sm:mb-3">
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-slate-900">Earnings Focus</h2>
          <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">Personal finance summary</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] sm:text-xs font-medium tabular-nums">{lifetimeEarnings}</span>
      </header>
      {loading && !hasFinance ? (
        <div className="space-y-3">
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 bg-slate-100 rounded animate-pulse w-11/12" />
          <div className="h-4 bg-slate-100 rounded animate-pulse w-9/12" />
          <div className="h-48 bg-slate-100 rounded animate-pulse" />
        </div>
      ) : hasFinance ? (
        <FinanceTabs
          tabs={tabs}
          initialKey={activeTab}
          onChange={onTabChange}
        />
      ) : (
        <p className="text-sm text-slate-500">Finance data isn&apos;t available yet.</p>
      )}
    </section>
  );
};

const FinanceTile = ({ label, value, accent, hint }) => (
  <div className="rounded-lg border border-slate-100 px-2.5 py-2 sm:px-3 sm:py-2.5 bg-white hover:bg-slate-50/50 transition">
    <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`mt-0.5 sm:mt-1 text-sm sm:text-lg font-bold tabular-nums truncate ${accent || 'text-slate-900'}`}>{value}</p>
    {hint && <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 truncate">{hint}</p>}
  </div>
);


const DashboardSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
      <div className="h-4 w-28 rounded bg-slate-100" />
      <div className="h-8 w-40 rounded bg-slate-100" />
      <div className="h-4 w-full rounded bg-slate-100" />
      <div className="h-48 w-full rounded bg-slate-100" />
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {placeholderKeys.slice(0, 4).map((key) => (
          <div key={`metric-${key}`} className="h-20 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="space-y-4 xl:col-span-2">
        <div className="h-64 rounded-2xl border border-slate-200 bg-white" />
        <div className="h-64 rounded-2xl border border-slate-200 bg-white" />
      </div>
      <div className="space-y-4">
        {placeholderKeys.slice(0, 3).map((key) => (
          <div key={`nudge-${key}`} className="h-24 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  </div>
);

const QuickActions = ({ actions }) => (
  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
    <h2 className="text-sm font-semibold text-slate-900 mb-2">Quick links</h2>
    <div className="space-y-2">
      {actions.map((action) => (
        <button
          key={action.title}
          type="button"
          onClick={action.onClick}
          className="w-full text-left rounded-lg border border-slate-100 px-3 py-2 bg-white hover:bg-sky-50/50 hover:border-sky-200 transition group"
        >
          <div className="flex items-center gap-2.5">
            {action.icon && <span className="text-sm">{action.icon}</span>}
            <div>
              <p className="text-sm font-medium text-slate-800 group-hover:text-sky-700 transition">{action.title}</p>
              <p className="text-[11px] text-slate-400">{action.description}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  </section>
);

const TopStudentsList = ({ students, loading, onSelect, onViewAll }) => (
  <section className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-5">
    <header className="flex items-center justify-between mb-2 sm:mb-3">
      <h2 className="text-sm sm:text-base font-semibold text-slate-900">Student spotlight</h2>
      <button
        type="button"
        onClick={onViewAll}
        className="text-xs text-sky-500 hover:text-sky-600 font-medium"
      >
        View all &rarr;
      </button>
    </header>
    {loading && !students.length ? (
      <div className="space-y-3">
        {placeholderKeys.map((key) => (
          <div key={key} className="h-14 rounded-xl bg-slate-100/70 animate-pulse" />
        ))}
      </div>
    ) : !students.length ? (
      <div className="rounded-xl bg-slate-50 px-4 py-6 text-center">
        <p className="text-sm text-slate-500">We&apos;ll highlight students here once lessons are booked.</p>
      </div>
    ) : (
      <ul className="space-y-2">
        {students.map((student) => (
          <li key={student.studentId}>
            <button
              type="button"
              onClick={() => onSelect?.(student.studentId)}
              className="w-full text-left rounded-lg sm:rounded-xl border border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3 bg-white hover:bg-sky-50/30 hover:border-sky-200 active:scale-[0.98] sm:hover:-translate-y-0.5 transition group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-sky-100 to-sky-200 flex items-center justify-center text-sky-700 text-[11px] sm:text-xs font-semibold shrink-0">
                    {(student.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition truncate">{student.name}</p>
                    <p className="text-[10px] sm:text-xs text-slate-400">{student.skillLevel || 'Skill level TBD'}</p>
                  </div>
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-slate-500 tabular-nums shrink-0">{student.totalHours}h</span>
              </div>
              {student.progressPercent > 0 && (
                <div className="mt-1.5 sm:mt-2 flex items-center gap-2 ml-[38px] sm:ml-11">
                  <div className="flex-1 h-1 sm:h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-sky-500 rounded-full"
                      style={{ width: `${student.progressPercent}%` }}
                    />
                  </div>
                  <span className="text-[9px] sm:text-[10px] tabular-nums text-slate-400">{student.progressPercent}%</span>
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default InstructorDashboard;
