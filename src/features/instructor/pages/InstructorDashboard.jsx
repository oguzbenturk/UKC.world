import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstructorDashboard } from '../hooks/useInstructorDashboard';
import { useInstructorStudents } from '../hooks/useInstructorStudents';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { usePullToRefresh } from '@/shared/hooks/usePullToRefresh';
import { analyticsService } from '@/shared/services/analyticsService';
import EarningsTrendCard from '../components/EarningsTrendCard';
import HeroCarousel from '../components/HeroCarousel';
import SummaryMetricStrip from '../components/SummaryMetricStrip';
import FinanceTabs from '../components/FinanceTabs';
import UpcomingLessonsAccordion from '../components/UpcomingLessonsAccordion';
import StudentCheckInPanel from '../components/StudentCheckInPanel';
import LessonStatusHeatmap from '../components/LessonStatusHeatmap';
import FloatingQuickAction from '../components/FloatingQuickAction';
import SurveyCard from '../components/SurveyCard';
import InstructorRatingsCard from '../components/InstructorRatingsCard';

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
            onClick: () => navigate('/finances'),
          },
        }
        : {
          secondary: {
            label: 'View finance tips',
            onClick: () => navigate('/resources/instructor-finance'),
          },
        },
    });
  }

  if (nextLesson) {
    slides.push({
      id: 'next-lesson',
      eyebrow: 'Next on your calendar',
      title: `${nextLesson.studentName} at ${formatDateTime(nextLesson.startTime)}`,
      body: 'Tap to jump into the booking board for last-minute adjustments and notes.',
      pill: {
        label: "Today's focus",
        variant: 'bg-emerald-500 text-white',
      },
      cta: {
        primary: {
          label: 'Open booking board',
          onClick: () => navigate('/bookings'),
        },
        secondary: {
          label: 'Message student',
          onClick: () => window.dispatchEvent(new CustomEvent('instructor-dashboard:compose-message', {
            detail: { studentId: nextLesson.studentId },
          })),
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
      textClass: 'text-emerald-600 dark:text-emerald-300',
    },
    {
      title: "Today's Lessons",
      value: numberNoDecimals.format(todaysLessonsCount),
      hint: `${numberNoDecimals.format(data.upcomingLessons?.length ?? 0)} upcoming overall`,
      dotClass: 'bg-sky-500',
      textClass: 'text-sky-600 dark:text-sky-300',
    },
    {
      title: 'Next Lesson',
      value: nextLesson ? formatDateTime(nextLesson.startTime) : 'None scheduled',
      hint: nextLesson?.studentName ? `With ${nextLesson.studentName}` : 'Stay ready for new bookings',
      dotClass: 'bg-violet-500',
      textClass: 'text-violet-600 dark:text-violet-300',
    },
    {
      title: 'Pending Payout',
      value: formatAmount(data.finance?.pending),
      hint: pendingHint,
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-600 dark:text-amber-300',
    },
  ];
};

const buildQuickActions = (navigate) => ([
  {
    title: 'Manage Students',
    description: 'Review levels, notes, and progress',
    onClick: () => navigate('/instructor/students'),
  },
  {
    title: 'Lesson Calendar',
    description: 'Adjust availability and reschedule',
    onClick: () => navigate('/bookings/calendar'),
  },
  {
    title: 'Bookings Board',
    description: 'See all upcoming and past lessons',
    onClick: () => navigate('/bookings'),
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

  const quickActions = useMemo(() => buildQuickActions(navigate), [navigate]);

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

  const nudgeMessages = useMemo(
    () => buildNudgeMessages(
      pendingThresholdInfo,
      inactiveStudents,
      formatAmount,
      navigate,
      data?.lessonInsights?.inactiveWindowDays,
    ),
    [pendingThresholdInfo, inactiveStudents, formatAmount, navigate, data?.lessonInsights?.inactiveWindowDays],
  );

  const isRefreshing = loading && !!data;
  const showSkeleton = loading && !data;

  const handleStudentNavigate = useCallback((studentId) => {
    if (!studentId) return;
    navigate(`/instructor/students/${studentId}`);
  }, [navigate]);

  const handleCreateBooking = useCallback(() => {
    analyticsService.track('instructor_dashboard_fab_clicked');
    navigate('/bookings/new');
  }, [navigate]);

  const handleSurveyStart = useCallback(() => {
    analyticsService.track('instructor_dashboard_survey_clicked');
  }, []);

  if (showSkeleton) {
    return (
      <div className="space-y-6 p-4 md:p-6 pb-24 md:pb-10">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
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
      nudgeMessages={nudgeMessages}
      onSurveyStart={handleSurveyStart}
      topStudents={topStudents}
      studentsLoading={studentsLoading}
      onStudentNavigate={handleStudentNavigate}
      inactiveStudents={inactiveStudents}
      statusBreakdown={statusBreakdown}
      onCreateBooking={handleCreateBooking}
    />
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
  nudgeMessages,
  onSurveyStart,
  topStudents,
  studentsLoading,
  onStudentNavigate,
  inactiveStudents,
  statusBreakdown,
  onCreateBooking,
}) => (
  <div className="space-y-6 p-4 md:p-6 pb-24 md:pb-10">
    <HeroSection
      name={instructorName}
      nextLesson={nextLesson}
      onRefresh={onRefresh}
      refreshing={refreshing}
      lastUpdated={lastUpdated}
      slides={heroSlides}
    />

    {error && (
      <div className="rounded border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
    )}
    {studentsError && (
      <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">{studentsError}</div>
    )}

    <SummaryMetricStrip cards={summaryCards} loading={loading && !dataAvailable} />

    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="space-y-6 xl:col-span-2">
        <FinanceOverview
          finance={financeSummary}
          loading={loading}
          formatAmount={formatAmount}
          onTabChange={onFinanceTabChange}
          activeTab={financeTab}
        />
        <UpcomingLessonsAccordion groupedLessons={groupedLessons} loading={loading} />
      </div>
      <aside className="space-y-6">
        <QuickActions actions={quickActions} />
        {nudgeMessages.length > 0 && (
          <div className="space-y-3">
            {nudgeMessages.map((nudge) => (
              <NudgeCard key={nudge.id} {...nudge} />
            ))}
          </div>
        )}
        <SurveyCard onSurveyStart={onSurveyStart} />
      </aside>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" id="instructor-checkin">
      <div className="space-y-6 xl:col-span-2">
        <TopStudentsList
          students={topStudents}
          loading={studentsLoading}
          onSelect={onStudentNavigate}
        />
        <StudentCheckInPanel
          students={inactiveStudents}
          loading={loading}
          onSelect={onStudentNavigate}
        />
      </div>
      <div className="space-y-6">
        <LessonStatusHeatmap breakdown={statusBreakdown} />
        <InstructorRatingsCard limit={5} />
      </div>
    </div>

    <FloatingQuickAction label="Create booking" onClick={onCreateBooking} />
  </div>
);

const HeroSection = ({ name, nextLesson, onRefresh, refreshing, lastUpdated, slides }) => (
  <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6 md:p-8 space-y-6">
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instructor Dashboard</p>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Welcome back, {name}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl">
          {nextLesson ? (
            <>
              Your next lesson is with <span className="font-semibold text-slate-900 dark:text-white">{nextLesson.studentName}</span> at {formatDateTime(nextLesson.startTime)}.
            </>
          ) : (
            <>You&apos;re all caught up. Use the quick actions to plan what&apos;s next.</>
          )}
        </p>
        <p className="text-xs text-slate-400">Tip: Pull down from the top on mobile to refresh instantly.</p>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : 'Refresh data'}
        </button>
        {lastUpdated && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
    <HeroCarousel slides={slides} />
  </section>
);

const FinanceOverviewSummary = ({ finance, loading, formatAmount, pendingInfo, pendingHint }) => {
  const effectivePendingHint = pendingInfo?.meetsThreshold ? 'Eligible to request payout now.' : pendingHint;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
        <FinanceTile label="Total Earned" value={formatAmount(finance?.totalEarned)} accent="text-emerald-600 dark:text-emerald-400" />
        <FinanceTile label="Month to Date" value={formatAmount(finance?.monthToDate)} accent="text-sky-600 dark:text-sky-400" />
        <FinanceTile label="Pending" value={formatAmount(finance?.pending)} accent="text-amber-600 dark:text-amber-400" hint={effectivePendingHint} />
        <FinanceTile label="Total Paid Out" value={formatAmount(finance?.totalPaid)} accent="text-violet-600 dark:text-violet-400" hint={`Net payments ${formatAmount(finance?.netPayments)}`} />
      </div>

      <EarningsTrendCard
        timeseries={finance?.timeseries}
        loading={loading}
        formatCurrency={formatAmount}
        pendingThreshold={pendingInfo}
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50">
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Last Payout</p>
        {finance?.lastPayout ? (
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatAmount(finance.lastPayout.amount)}</p>
            <p className="text-xs text-slate-500 mt-1">Paid {formatDateTime(finance.lastPayout.paymentDate)}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No payouts recorded yet.</p>
        )}
      </div>
    </div>
  );
};

const FinanceEarningsTable = ({ earnings, formatAmount }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="text-xs uppercase tracking-wide text-slate-500">
        <tr className="text-left">
          <th className="py-2 pr-4">Date</th>
          <th className="py-2 pr-4">Student</th>
          <th className="py-2 pr-4">Hours</th>
          <th className="py-2 pr-4">Amount</th>
          <th className="py-2 pr-4">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {earnings?.length ? earnings.map((row) => (
          <tr key={row.bookingId}>
            <td className="py-2 pr-4 text-slate-700 dark:text-slate-200">{formatDateTime(row.lessonDate)}</td>
            <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{row.studentName || '—'}</td>
            <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{formatNumber(row.durationHours)}</td>
            <td className="py-2 pr-4 font-semibold text-slate-900 dark:text-white">{formatAmount(row.amount)}</td>
            <td className="py-2 pr-4"><span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs capitalize text-slate-600 dark:text-slate-300">{row.status}</span></td>
          </tr>
        )) : (
          <tr>
            <td colSpan={5} className="py-4 text-center text-xs text-slate-500">No earnings recorded yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const FinancePaymentsTable = ({ payments, formatAmount }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="text-xs uppercase tracking-wide text-slate-500">
        <tr className="text-left">
          <th className="py-2 pr-4">Date</th>
          <th className="py-2 pr-4">Amount</th>
          <th className="py-2 pr-4">Description</th>
          <th className="py-2 pr-4">Method</th>
          <th className="py-2 pr-4">Reference</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {payments?.length ? payments.map((payment) => (
          <tr key={payment.id}>
            <td className="py-2 pr-4 text-slate-700 dark:text-slate-200">{formatDateTime(payment.paymentDate)}</td>
            <td className="py-2 pr-4 font-semibold text-emerald-600 dark:text-emerald-300">{formatAmount(payment.amount)}</td>
            <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{payment.description || 'Instructor payout'}</td>
            <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{payment.method || 'balance'}</td>
            <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">{payment.referenceNumber || '—'}</td>
          </tr>
        )) : (
          <tr>
            <td colSpan={5} className="py-4 text-center text-xs text-slate-500">No payout history yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
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
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Earnings Focus</h2>
          <p className="text-xs text-slate-500">Personal finance summary</p>
        </div>
        <span className="text-xs text-slate-500">{lifetimeEarnings} lifetime</span>
      </header>
      {loading && !hasFinance ? (
        <div className="space-y-3">
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-11/12" />
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-9/12" />
          <div className="h-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
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
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900/40">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-2 text-xl font-semibold text-slate-900 dark:text-white ${accent}`}>{value}</p>
    {hint && <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">{hint}</p>}
  </div>
);

const NudgeCard = ({ title, body, action }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-5 space-y-3">
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coaching tip</p>
    </div>
    <div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{body}</p>
    </div>
    {action ? (
      <button
        type="button"
        onClick={action.onClick}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white"
      >
        {action.label}
        <span aria-hidden="true">→</span>
      </button>
    ) : null}
  </div>
);

const DashboardSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-6 space-y-4">
      <div className="h-4 w-28 rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-8 w-40 rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-48 w-full rounded bg-slate-100 dark:bg-slate-800" />
    </div>
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {placeholderKeys.slice(0, 4).map((key) => (
          <div key={`metric-${key}`} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="space-y-4 xl:col-span-2">
        <div className="h-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70" />
        <div className="h-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70" />
      </div>
      <div className="space-y-4">
        {placeholderKeys.slice(0, 3).map((key) => (
          <div key={`nudge-${key}`} className="h-24 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70" />
        ))}
      </div>
    </div>
  </div>
);

const QuickActions = ({ actions }) => (
  <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6 h-full">
    <header className="mb-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Quick links</h2>
      <p className="text-xs text-slate-500">Jump straight into common instructor workflows.</p>
    </header>
    <div className="space-y-3">
      {actions.map((action) => (
        <button
          key={action.title}
          type="button"
          onClick={action.onClick}
          className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900/60 dark:hover:bg-slate-800 transition"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{action.title}</p>
          <p className="text-xs text-slate-500 mt-1">{action.description}</p>
        </button>
      ))}
    </div>
  </section>
);

const TopStudentsList = ({ students, loading, onSelect }) => (
  <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6">
    <header className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Student spotlight</h2>
      <button
        type="button"
        onClick={() => onSelect && students?.[0]?.studentId && onSelect(students[0].studentId)}
        className="text-xs text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
      >
        View roster
      </button>
    </header>
    {loading && !students.length ? (
      <div className="space-y-3">
        {placeholderKeys.map((key) => (
          <div key={key} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
    ) : !students.length ? (
      <p className="text-sm text-slate-500">We&apos;ll highlight students here once lessons are booked.</p>
    ) : (
      <ul className="space-y-3">
        {students.map((student) => (
          <li key={student.studentId}>
            <button
              type="button"
              onClick={() => onSelect?.(student.studentId)}
              className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900/60 dark:hover:bg-slate-800 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{student.name}</p>
                  <p className="text-xs text-slate-500">{student.skillLevel || 'Skill level TBD'}</p>
                </div>
                <span className="text-xs text-slate-500">{student.totalHours}h</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-sky-500"
                    style={{ width: `${student.progressPercent}%` }}
                  />
                </div>
                <span className="text-[10px] uppercase tracking-wide text-slate-500">{student.progressPercent}%</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default InstructorDashboard;
