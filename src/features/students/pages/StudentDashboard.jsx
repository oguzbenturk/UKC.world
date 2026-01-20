import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { App, Card, Col, Empty, Row, Skeleton, Tag } from 'antd';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import { analyticsService } from '@/shared/services/analyticsService';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useStudentDashboard } from '../hooks/useStudentDashboard';
import { useUnratedBookings } from '../hooks/useRatings';
import RatingReminderBanner from '../components/RatingReminderBanner';
import RateInstructorModal from '../components/RateInstructorModal';
import InstructorNotesPanel from '../components/InstructorNotesPanel';

const PackageCard = ({ pkg }) => (
  <Card className="h-full shadow-sm" title={pkg.name} extra={pkg.lessonType ? <Tag>{pkg.lessonType}</Tag> : null}>
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between">
        <span>Total hours</span>
        <strong>{pkg.totalHours}</strong>
      </div>
      <div className="flex justify-between">
        <span>Used</span>
        <strong>{pkg.usedHours}</strong>
      </div>
      <div className="flex justify-between">
        <span>Remaining</span>
        <strong>{pkg.remainingHours}</strong>
      </div>
      <div className="flex justify-between">
        <span>Status</span>
        <Tag color={pkg.status === 'active' ? 'blue' : pkg.status === 'used_up' ? 'gold' : 'default'}>{pkg.status}</Tag>
      </div>
      {pkg.expiresAt && (
        <div className="flex justify-between">
          <span>Expires</span>
          <strong>{pkg.expiresAt.split('T')[0]}</strong>
        </div>
      )}
      {pkg.expiryWarning && <Tag color="volcano">Expires soon</Tag>}
    </div>
  </Card>
);

const SessionCard = ({ session }) => {
  // Format date to readable format (e.g., "Jan 19, 2026")
  const formattedDate = useMemo(() => {
    if (!session.date) return 'TBD';
    try {
      const date = typeof session.date === 'string' ? parseISO(session.date) : session.date;
      return format(date, 'MMM d, yyyy');
    } catch {
      return session.date.split('T')[0]; // Fallback to date part only
    }
  }, [session.date]);
  
  return (
    <Card className="shadow-sm" title={session.service?.name ?? 'Upcoming lesson'}>
      <div className="space-y-2 text-sm text-slate-600">
        <div className="flex justify-between">
          <span>Date</span>
          <strong>{formattedDate}</strong>
        </div>
      <div className="flex justify-between">
        <span>Start</span>
        <strong>{session.startTime ? new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}</strong>
      </div>
      <div className="flex justify-between">
        <span>Instructor</span>
        <strong>{session.instructor?.name ?? 'Assigned soon'}</strong>
      </div>
      <Tag>{session.status}</Tag>
      <Tag color={session.paymentStatus === 'paid' ? 'green' : session.paymentStatus === 'pending' ? 'gold' : 'default'}>
        {session.paymentStatus}
      </Tag>
    </div>
  </Card>
  );
};

const RecommendationCard = ({ recommendation, highlight, formatCurrency, convertCurrency, userCurrency }) => {
  const baseCurrency = recommendation.currency || 'EUR';
  const displayPrice = convertCurrency 
    ? convertCurrency(recommendation.price, baseCurrency, userCurrency) 
    : recommendation.price;
  
  // Show dual currency if different
  const showDual = baseCurrency !== userCurrency;
  const priceDisplay = showDual 
    ? `${formatCurrency(recommendation.price, baseCurrency)} / ${formatCurrency(displayPrice, userCurrency)}`
    : formatCurrency(displayPrice, userCurrency);
  
  return (
    <Card
      className={`shadow-sm ${highlight ? 'border border-sky-200' : ''}`}
      title={recommendation.name}
      extra={highlight ? <Tag color="blue">Top pick</Tag> : null}
    >
      <div className="flex flex-col gap-2 text-sm text-slate-600">
        <div className="flex justify-between">
          <span>Level</span>
          <strong>{recommendation.level ?? 'All'}</strong>
        </div>
        <div className="flex justify-between">
          <span>Duration</span>
          <strong>{recommendation.durationHours} h</strong>
        </div>
        {recommendation.price > 0 && (
          <div className="flex justify-between">
            <span>Price</span>
            <strong>{priceDisplay}</strong>
          </div>
        )}
        {highlight && recommendation.fitScoreNormalized ? (
          <div className="flex justify-between">
            <span>Fit score</span>
            <strong>{Math.round(recommendation.fitScoreNormalized)}%</strong>
          </div>
        ) : null}
        {highlight ? (
          <span className="sr-only">This course is recommended as the best match for your recent activity.</span>
        ) : null}
      </div>
    </Card>
  );
};

const PaymentItem = ({ payment, formatCurrency, convertCurrency, userCurrency }) => {
  const createdAt = payment.createdAt ? formatDistanceToNow(parseISO(payment.createdAt), { addSuffix: true }) : '—';
  const paymentCurrency = payment.currency || 'EUR';
  
  // For completed payments, show historical amount (what was actually paid)
  // Don't convert with current exchange rates - preserve the recorded value
  const status = String(payment.status || '').toLowerCase();
  const isCompleted = ['succeeded', 'completed', 'paid'].includes(status);
  
  let amountDisplay;
  if (isCompleted) {
    // Show original recorded amount - historical value
    amountDisplay = payment.amount > 0 ? formatCurrency(payment.amount, paymentCurrency) : payment.amount;
  } else {
    // For pending payments, show dual currency with current rates
    const showDual = paymentCurrency !== userCurrency && payment.amount > 0;
    if (showDual && convertCurrency) {
      const convertedAmount = convertCurrency(payment.amount, paymentCurrency, userCurrency);
      amountDisplay = `${formatCurrency(payment.amount, paymentCurrency)} / ${formatCurrency(convertedAmount, userCurrency)}`;
    } else {
      amountDisplay = payment.amount > 0 ? formatCurrency(payment.amount, paymentCurrency) : payment.amount;
    }
  }
  
  return (
    <li className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm dark:border-slate-700">
      <div>
        <p className="font-medium text-slate-800">
          {payment.description || `Payment for ${payment.serviceName ?? 'lesson'}`}
        </p>
        <p className="text-xs text-slate-500">{createdAt}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold text-slate-900">
          {amountDisplay}
        </p>
        <Tag
          color={payment.status === 'succeeded' ? 'green' : payment.status === 'requires_payment_method' ? 'gold' : 'default'}
        >
          {payment.status}
        </Tag>
      </div>
    </li>
  );
};

const formatRelativeTime = (value) => {
  if (!value) return 'just now';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return formatDistanceToNow(date, { addSuffix: true });
};

const buildStats = (overview, walletSummary, formatCurrency, convertCurrency, userCurrency) => {
  const completedLessons = overview.stats?.completedSessions ?? 0;
  const upcomingLessons = overview.stats?.upcomingSessions ?? 0;
  const totalHours = overview.stats?.totalHours ?? 0;
  
  // Use wallet balance from wallet API (has correct currency)
  const walletBalance = walletSummary?.available ?? 0;
  const walletCurrency = walletSummary?.currency || 'EUR';
  
  // Show dual currency: original + converted (if different)
  let balanceDisplay;
  if (walletCurrency !== userCurrency) {
    const convertedBalance = convertCurrency(walletBalance, walletCurrency, userCurrency);
    const originalFormatted = formatCurrency(walletBalance, walletCurrency);
    const convertedFormatted = formatCurrency(convertedBalance, userCurrency);
    balanceDisplay = `${originalFormatted} / ${convertedFormatted}`;
  } else {
    balanceDisplay = formatCurrency(walletBalance, walletCurrency);
  }

  return [
    { label: 'Completed lessons', value: completedLessons },
    { label: 'Upcoming lessons', value: upcomingLessons, highlight: true },
    { label: 'Total hours', value: totalHours },
    { label: 'Remaining balance', value: balanceDisplay }
  ];
};

const formatNextLessonSummary = (lesson) => {
  if (!lesson) {
    return 'No lessons on the horizon yet—book one to keep the momentum going.';
  }

  const candidate = lesson.startTime || lesson.date;
  if (!candidate) {
    return 'Your next lesson details will appear here once it is scheduled.';
  }

  try {
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
      return `Next lesson on ${candidate}`;
    }
    return `Next lesson ${format(parsed, 'MMM d')} · ${formatRelativeTime(parsed)}`;
  } catch {
    return 'Your next lesson is coming up soon.';
  }
};

const formatLastPaymentSummary = (value) => {
  if (!value) return null;
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return `Last payment ${formatRelativeTime(parsed)}`;
  } catch {
    return null;
  }
};

const UpcomingLessonsSection = ({ sessions }) => {
  const firstSession = sessions?.[0];
  const nextLabel = useMemo(() => {
    if (!firstSession) return null;
    const candidate = firstSession.startTime || firstSession.date;
    if (!candidate) return null;
    try {
      const parsed = new Date(candidate);
      if (Number.isNaN(parsed.getTime())) {
        return candidate;
      }
      return `Next: ${format(parsed, 'MMM d • HH:mm')}`;
    } catch {
      return null;
    }
  }, [firstSession]);

  return (
    <Card className="shadow-sm" title="Upcoming lessons" extra={nextLabel ? <span className="text-xs text-slate-500">{nextLabel}</span> : null}>
      {sessions?.length ? (
        <Row gutter={[16, 16]}>
          {sessions.map((session) => (
            <Col key={session.bookingId} xs={24} lg={12}>
              <SessionCard session={session} />
            </Col>
          ))}
        </Row>
      ) : (
        <Empty description="No upcoming lessons" />
      )}
    </Card>
  );
};

const PaymentsSection = ({ payments, formatCurrency, convertCurrency, userCurrency }) => (
  <Card className="shadow-sm" title="Recent payments">
    {payments?.length ? (
      <ul className="space-y-3">
        {payments.slice(0, 4).map((payment) => (
          <PaymentItem key={payment.id} payment={payment} formatCurrency={formatCurrency} convertCurrency={convertCurrency} userCurrency={userCurrency} />
        ))}
      </ul>
    ) : (
      <Empty description="No payments yet" />
    )}
  </Card>
);

const PackagesSection = ({ packages }) => (
  <Card className="shadow-sm" title="Packages & credits">
    {packages?.length ? (
      <Row gutter={[16, 16]}>
        {packages.map((pkg) => (
          <Col key={pkg.id} xs={24} md={12} lg={8}>
            <PackageCard pkg={pkg} />
          </Col>
        ))}
      </Row>
    ) : (
      <Empty description="You don&apos;t have any packages yet" />
    )}
  </Card>
);

const ProgressSection = ({ progress }) => (
  <Card className="shadow-sm" title="Progress milestones">
    {progress?.length ? (
      <ul className="space-y-3 text-sm">
        {progress.slice(0, 5).map((entry) => (
          <li key={entry.id} className="rounded-xl border border-slate-200 p-3 shadow-sm dark:border-slate-700">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-800">{entry.skillName}</h4>
              <Tag>{entry.levelName ?? 'Level up'}</Tag>
            </div>
            <p className="text-xs text-slate-500">Achieved {entry.dateAchieved ?? entry.createdAt?.split('T')[0]}</p>
            {entry.notes && <p className="mt-2 text-sm text-slate-600">{entry.notes}</p>}
          </li>
        ))}
      </ul>
    ) : (
      <Empty description="Progress entries land here" />
    )}
  </Card>
);



const normalizeFitScore = (rawScore) => {
  if (rawScore == null) return null;
  const numeric = Number(rawScore);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 1) {
    return Math.max(0, Math.min(100, numeric));
  }
  return Math.max(0, Math.min(100, numeric * 100));
};

const RecommendationsGrid = ({ recommendations }) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const personalizedList = useMemo(() => {
    if (!Array.isArray(recommendations)) return [];
    return [...recommendations]
      .map((item) => ({ ...item, fitScoreNormalized: normalizeFitScore(item.fitScore ?? item.score ?? item.matchScore) }))
      .sort((a, b) => (b.fitScoreNormalized ?? 0) - (a.fitScoreNormalized ?? 0));
  }, [recommendations]);

  return (
    <Row gutter={[16, 16]}>
      {personalizedList.map((recommendation, index) => (
        <Col key={recommendation.id ?? `${recommendation.name}-${index}`} xs={24} md={12}>
          <RecommendationCard
            recommendation={recommendation}
            highlight={index === 0 && (recommendation.fitScoreNormalized ?? 0) >= 70}
            formatCurrency={formatCurrency}
            convertCurrency={convertCurrency}
            userCurrency={userCurrency}
          />
        </Col>
      ))}
    </Row>
  );
};

const RecommendationsSection = ({ recommendations }) => (
  <Card className="shadow-sm" title="Recommended for you">
    {recommendations?.length ? (
      <RecommendationsGrid recommendations={recommendations} />
    ) : (
      <Empty description={"We'll suggest new lessons once we know more"} />
    )}
  </Card>
);

const RATE_BOOKING_STORAGE_KEY = 'pendingRateBooking';

const normalizeModalBooking = (booking) => {
  if (!booking) {
    return null;
  }

  const rawBookingId = booking.bookingId ?? booking.id;
  if (!rawBookingId) {
    return null;
  }

  const instructorSource = booking.instructor;
  const instructor = instructorSource
    ? {
        id: instructorSource.id ?? null,
        name:
          instructorSource.name ??
          (typeof instructorSource === 'string' ? instructorSource : null),
        avatar: instructorSource.avatar ?? null
      }
    : null;

  const serviceSource = booking.service;
  const service = (() => {
    if (!serviceSource) {
      return null;
    }

    if (typeof serviceSource === 'string') {
      return { id: null, name: serviceSource, type: null };
    }

    return {
      id: serviceSource.id ?? null,
      name: serviceSource.name ?? serviceSource.title ?? null,
      type: serviceSource.type ?? null
    };
  })();

  return {
    ...booking,
    bookingId: String(rawBookingId),
    instructor,
    service
  };
};

const parseDateLabel = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const derivePerformanceTrend = (overview) => {
  if (!overview) return [];

  const averageRating = overview.stats?.averageRating ?? overview.stats?.averageLessonRating ?? 0;
  const explicitTrend =
    overview.analytics?.performanceTrend || overview.performanceTrend || overview.performance?.trend;

  if (Array.isArray(explicitTrend) && explicitTrend.length > 0) {
    return explicitTrend.map((entry, index) => {
      const label = entry.period || entry.date || `Point ${index + 1}`;
      return {
        label,
        milestones: Number(entry.milestones ?? entry.completedLessons ?? entry.totalLessons) || 0,
        rating: Number(entry.averageRating ?? entry.rating ?? averageRating) || 0
      };
    });
  }

  const progressEntries = Array.isArray(overview.progress) ? overview.progress : [];
  if (!progressEntries.length) {
    return [];
  }

  const sorted = [...progressEntries].sort((a, b) => {
    const aDate = parseDateLabel(a.dateAchieved ?? a.createdAt ?? a.updatedAt);
    const bDate = parseDateLabel(b.dateAchieved ?? b.createdAt ?? b.updatedAt);
    return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
  });

  let cumulative = 0;
  return sorted.map((entry) => {
    cumulative += 1;
    const parsedDate = parseDateLabel(entry.dateAchieved ?? entry.createdAt ?? entry.updatedAt);
    const label = parsedDate ? format(parsedDate, 'MMM d') : entry.skillName ?? `Milestone ${cumulative}`;
    const rating = Number(entry.rating ?? averageRating) || 0;
    return {
      label,
      milestones: cumulative,
      rating
    };
  });
};

const PerformanceTrendSection = ({ data, averageRating }) => {
  const latestPoint = data.length ? data[data.length - 1] : null;
  const summaryText = latestPoint
    ? `Most recent milestone count ${latestPoint.milestones} with an average rating of ${Number(latestPoint.rating).toFixed(1)} stars.`
    : 'Performance trend chart will summarise your completed milestones and ratings over time once data is available.';

  return (
    <Card className="shadow-sm" title="Performance trend">
      {data.length ? (
        <>
          <div
            role="img"
            aria-label={`Chart showing ${data.length} progress points with milestones and average rating trends.`}
            style={{ height: 280 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="milestones" allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: 'Milestones', angle: -90, position: 'insideLeft' }} />
                <YAxis
                  yAxisId="rating"
                  orientation="right"
                  domain={[0, 5]}
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Avg rating', angle: 90, position: 'insideRight' }}
                />
                <RechartsTooltip
                  formatter={(value, name) => {
                    if (name === 'rating') {
                      return [`${Number(value).toFixed(1)} ★`, 'Average rating'];
                    }
                    return [`${value}`, 'Milestones'];
                  }}
                />
                <Legend />
                <Area
                  yAxisId="milestones"
                  type="monotone"
                  dataKey="milestones"
                  stroke="#1677ff"
                  fill="#1677ff22"
                  name="Milestones"
                />
                <Line
                  yAxisId="rating"
                  type="monotone"
                  dataKey="rating"
                  stroke="#52c41a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Average rating"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <span className="sr-only">{summaryText}</span>
        </>
      ) : (
        <Empty description="Performance insights will surface once you log more progress." />
      )}
      {averageRating ? (
        <p className="mt-3 text-xs text-slate-500">
          Current average instructor rating: <span className="font-semibold text-slate-700">{averageRating.toFixed(1)} ★</span>
        </p>
      ) : null}
    </Card>
  );
};

const DashboardSnapshotMeta = ({ lastRefreshedAt, nextLessonSummary }) => {
  const statusId = useId();

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.3em] text-sky-600">Your learning snapshot</p>
      <h2 className="text-2xl font-semibold text-slate-900">Stay on course and enjoy the journey</h2>
      {lastRefreshedAt ? (
        <p id={statusId} className="text-sm text-slate-500" role="status" aria-live="polite">
          Updated {formatRelativeTime(lastRefreshedAt)}
        </p>
      ) : null}
      <p className="text-sm text-slate-600">{nextLessonSummary}</p>
    </div>
  );
};

const DashboardHero = ({ overview }) => {
  const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  const storageCurrency = businessCurrency || 'EUR';
  const { data: walletSummary } = useWalletSummary({ enabled: true, currency: storageCurrency });
  const lastRefreshedAt = overview.meta?.updatedAt ?? overview.student?.lastUpdatedAt;
  const nextLesson = overview.upcomingSessions?.[0] || null;
  const lastPaymentAt = overview.metrics?.lastPayment?.date || overview.student?.account?.lastPaymentAt || null;

  const nextLessonSummary = useMemo(() => formatNextLessonSummary(nextLesson), [nextLesson]);
  const lastPaymentSummary = useMemo(() => formatLastPaymentSummary(lastPaymentAt), [lastPaymentAt]);
  const snapshotStats = useMemo(() => buildStats(overview, walletSummary, formatCurrency, convertCurrency, userCurrency), [overview, walletSummary, formatCurrency, convertCurrency, userCurrency]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <DashboardSnapshotMeta lastRefreshedAt={lastRefreshedAt} nextLessonSummary={nextLessonSummary} />
        {lastPaymentSummary ? (
          <p className="text-sm text-slate-500 lg:text-right">{lastPaymentSummary}</p>
        ) : null}
      </div>
  <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {snapshotStats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-2xl border border-slate-100 bg-white/80 px-5 py-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg ${
              stat.highlight ? 'border-sky-200 bg-sky-50/80' : ''
            }`}
          >
            <p className={`text-xs font-semibold uppercase tracking-wide ${stat.highlight ? 'text-sky-600' : 'text-slate-400'}`}>
              {stat.label}
            </p>
            <p className={`mt-2 text-2xl font-semibold ${stat.highlight ? 'text-sky-700' : 'text-slate-900'}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const DashboardView = ({ overview }) => {
  const performanceTrend = useMemo(() => derivePerformanceTrend(overview), [overview]);
  const averageRating = Number(overview.stats?.averageRating ?? overview.stats?.averageLessonRating) || null;
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

  return (
    <div className="space-y-6">
      <DashboardHero overview={overview} />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <UpcomingLessonsSection sessions={overview.upcomingSessions} />
        </Col>
        <Col xs={24} md={8}>
          <PaymentsSection payments={overview.payments} formatCurrency={formatCurrency} convertCurrency={convertCurrency} userCurrency={userCurrency} />
        </Col>
      </Row>

      <PackagesSection packages={overview.packages} />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <ProgressSection progress={overview.progress} />
        </Col>
        <Col xs={24} lg={8}>
          <RecommendationsSection recommendations={overview.recommendations} />
        </Col>
        <Col xs={24} lg={8}>
          <InstructorNotesPanel notes={overview.instructorNotes} />
        </Col>
      </Row>

      <PerformanceTrendSection data={performanceTrend} averageRating={averageRating} />
    </div>
  );
};

const StudentDashboard = () => {
  const { notification } = App.useApp();
  const context = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const rateBookingId = searchParams.get('rateBooking');

  const { data, isLoading, error, refetch: refetchDashboard } = useStudentDashboard({
    autoRefresh: true,
    refetchIntervalMs: 120_000
  });
  const { data: unratedBookings } = useUnratedBookings({ limit: 10 });

  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const overview = useMemo(() => data ?? context?.overview, [context?.overview, data]);

  useEffect(() => {
    if (overview?.student) {
      analyticsService.track('student_portal_dashboard_viewed', {
        studentId: overview.student.id,
        remainingHours: overview.student.remainderHours,
        upcomingCount: overview.stats?.upcomingSessions ?? 0
      });
    }
  }, [overview]);

  useEffect(() => {
    if (error) {
      notification.error({
        message: 'Unable to load dashboard',
        description: error.message,
        placement: 'bottomRight'
      });
    }
  }, [error, notification]);

  const handleOpenRating = useCallback((booking) => {
    const normalized = normalizeModalBooking(booking);
    if (!normalized) {
      return;
    }
    setSelectedBooking(normalized);
    setIsRatingModalOpen(true);
  }, []);

  useEffect(() => {
    if (!rateBookingId) {
      return;
    }

    const normalizedId = String(rateBookingId);
    const bookingFromList = Array.isArray(unratedBookings)
      ? unratedBookings.find((booking) => String(booking.bookingId) === normalizedId)
      : null;

    let resolvedBooking = normalizeModalBooking(bookingFromList);

    if (!resolvedBooking) {
      try {
        const storedRaw = sessionStorage.getItem(RATE_BOOKING_STORAGE_KEY);
        if (storedRaw) {
          const stored = JSON.parse(storedRaw);
          if (stored?.bookingId && String(stored.bookingId) === normalizedId) {
            resolvedBooking = normalizeModalBooking({
              bookingId: stored.bookingId,
              date: stored.date || null,
              instructor: stored.instructor || null,
              service: stored.service || null
            });
          }
        }
      } catch {
        // ignore storage issues
      }
    }

    if (!resolvedBooking) {
      return;
    }

    handleOpenRating(resolvedBooking);

    try {
      sessionStorage.removeItem(RATE_BOOKING_STORAGE_KEY);
    } catch {
      // ignore storage issues
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('rateBooking');
    setSearchParams(nextParams, { replace: true });
  }, [rateBookingId, unratedBookings, handleOpenRating, searchParams, setSearchParams]);

  if (isLoading && !overview) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (!overview) {
    return <Empty description="Nothing to show yet" />;
  }

  const handleCloseRating = (submitted) => {
    setIsRatingModalOpen(false);
    if (submitted) {
      notification.success({
        message: 'Thanks for your feedback!',
        description: 'Your rating helps us improve your experience.',
        placement: 'bottomRight'
      });
    }
    setSelectedBooking(null);
    if (submitted) {
      refetchDashboard();
    }
  };

  return (
    <>
      <RatingReminderBanner reminders={unratedBookings} onRate={handleOpenRating} />
      <DashboardView overview={overview} />
      <RateInstructorModal
        open={isRatingModalOpen}
        booking={selectedBooking}
        onClose={handleCloseRating}
      />
    </>
  );
};

export default StudentDashboard;
