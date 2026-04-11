import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { App } from 'antd';
import { analyticsService } from '@/shared/services/analyticsService';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useStudentDashboard } from '../hooks/useStudentDashboard';
import { useUnratedBookings } from '../hooks/useRatings';
import RateInstructorModal from '../components/RateInstructorModal';
import NextLessonHero from '../components/dashboard/NextLessonHero';
import StatsStrip from '../components/dashboard/StatsStrip';
import RatingPrompt from '../components/dashboard/RatingPrompt';
import PackageCards from '../components/dashboard/PackageCards';
import QuickLinks from '../components/dashboard/QuickLinks';
import { studentPortalApi } from '../services/studentPortalApi';

/* ── Type badge config (mirrors instructor side) ── */
const REC_TYPE_CONFIG = {
  product:       { label: 'Product',  cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  service:       { label: 'Lesson',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rental:        { label: 'Rental',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  accommodation: { label: 'Room',     cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  custom:        { label: 'Custom',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const REC_LINK = {
  product:       (rec) => rec.itemId ? `/shop/product/${rec.itemId}` : '/shop/browse',
  service:       ()    => '/academy/book-service',
  rental:        ()    => '/rental/book-equipment',
  accommodation: ()    => '/accommodation',
  custom:        ()    => null,
};

const REC_PLACEHOLDER_CLS = {
  product:       'bg-sky-100 text-sky-500',
  service:       'bg-emerald-100 text-emerald-500',
  rental:        'bg-amber-100 text-amber-500',
  accommodation: 'bg-violet-100 text-violet-500',
  custom:        'bg-slate-100 text-slate-400',
};

const InstructorRecommendations = () => {
  const navigate = useNavigate();
  const [recs, setRecs] = useState(null);

  useEffect(() => {
    studentPortalApi.fetchRecommendations()
      .then(data => setRecs(Array.isArray(data) ? data.filter(r => r.source === 'instructor') : []))
      .catch(() => setRecs([]));
  }, []);

  if (!recs || recs.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Recommended for You</h2>
        <p className="text-xs text-slate-500 mt-0.5">Suggestions from your instructor</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {recs.map(rec => {
          const typeConf = REC_TYPE_CONFIG[rec.itemType] || REC_TYPE_CONFIG.custom;
          const link = (REC_LINK[rec.itemType] || REC_LINK.custom)(rec);
          const placeholderCls = REC_PLACEHOLDER_CLS[rec.itemType] || REC_PLACEHOLDER_CLS.custom;
          return (
            <li key={rec.id} className="px-6 py-4">
              <div className="flex items-start gap-4">
                {/* Thumbnail */}
                {rec.itemImage ? (
                  <button
                    type="button"
                    onClick={() => link && navigate(link)}
                    className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-slate-100 shadow-sm ${link ? 'cursor-pointer hover:opacity-90 transition-opacity' : 'cursor-default'}`}
                  >
                    <img src={rec.itemImage} alt={rec.itemName} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <div className={`shrink-0 w-16 h-16 rounded-xl flex items-center justify-center text-lg font-bold ${placeholderCls}`}>
                    {rec.itemName.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${typeConf.cls}`}>
                      {typeConf.label}
                    </span>
                    {link ? (
                      <button
                        type="button"
                        onClick={() => navigate(link)}
                        className="text-sm font-semibold text-sky-700 hover:underline text-left"
                      >
                        {rec.itemName}
                      </button>
                    ) : (
                      <p className="text-sm font-semibold text-slate-900">{rec.itemName}</p>
                    )}
                    {rec.itemPrice != null && (
                      <span className="text-xs font-semibold text-slate-500">€{rec.itemPrice}</span>
                    )}
                  </div>
                  {rec.notes && <p className="text-xs text-slate-500 mt-1 italic">{rec.notes}</p>}
                  {link && (
                    <button
                      type="button"
                      onClick={() => navigate(link)}
                      className="mt-1.5 text-xs font-medium text-sky-600 hover:text-sky-800 transition-colors"
                    >
                      View →
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/* ── Rating modal helpers (unchanged logic) ── */

const RATE_BOOKING_STORAGE_KEY = 'pendingRateBooking';

const normalizeModalBooking = (booking) => {
  if (!booking) return null;
  const rawBookingId = booking.bookingId ?? booking.id;
  if (!rawBookingId) return null;

  const instructorSource = booking.instructor;
  const instructor = instructorSource
    ? {
        id: instructorSource.id ?? null,
        name: instructorSource.name ?? (typeof instructorSource === 'string' ? instructorSource : null),
        avatar: instructorSource.avatar ?? null,
      }
    : null;

  const serviceSource = booking.service;
  const service = (() => {
    if (!serviceSource) return null;
    if (typeof serviceSource === 'string') return { id: null, name: serviceSource, type: null };
    return {
      id: serviceSource.id ?? null,
      name: serviceSource.name ?? serviceSource.title ?? null,
      type: serviceSource.type ?? null,
    };
  })();

  return { ...booking, bookingId: String(rawBookingId), instructor, service };
};

/* ── Loading skeleton ── */

const DashboardSkeleton = () => (
  <div className="space-y-5 animate-pulse">
    <div className="h-40 rounded-3xl bg-slate-200" />
    <div className="flex gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 w-36 shrink-0 rounded-2xl bg-slate-200" />
      ))}
    </div>
    <div className="h-24 rounded-2xl bg-slate-200" />
    <div className="grid grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-2xl bg-slate-200" />
      ))}
    </div>
  </div>
);

/* ── Empty state ── */

const DashboardEmpty = () => (
  <div className="flex flex-col items-center py-16 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50">
      <svg className="h-8 w-8 text-duotone-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    </div>
    <h2 className="mt-4 font-duotone-bold-extended text-lg text-slate-900">Nothing to show yet</h2>
    <p className="mt-1 text-sm text-slate-500">Your dashboard will come alive once you book your first lesson.</p>
  </div>
);

/* ── Main component ── */

const StudentDashboard = () => {
  const { notification } = App.useApp();
  const context = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const rateBookingId = searchParams.get('rateBooking');
  const { businessCurrency } = useCurrency();

  const { data, isLoading, error, refetch: refetchDashboard } = useStudentDashboard({
    autoRefresh: true,
    refetchIntervalMs: 120_000,
  });
  const { data: unratedBookings } = useUnratedBookings({ limit: 10 });

  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const overview = useMemo(() => data ?? context?.overview, [context?.overview, data]);

  // Analytics
  useEffect(() => {
    if (overview?.student) {
      analyticsService.track('student_portal_dashboard_viewed', {
        studentId: overview.student.id,
        remainingHours: overview.student.remainderHours,
        upcomingCount: overview.stats?.upcomingSessions ?? 0,
      });
    }
  }, [overview]);

  // Error toast
  useEffect(() => {
    if (error) {
      notification.error({
        message: 'Unable to load dashboard',
        description: error.message,
        placement: 'bottomRight',
      });
    }
  }, [error, notification]);

  // Rating handlers
  const handleOpenRating = useCallback((booking) => {
    const normalized = normalizeModalBooking(booking);
    if (!normalized) return;
    setSelectedBooking(normalized);
    setIsRatingModalOpen(true);
  }, []);

  // Deep-link: ?rateBooking=ID
  useEffect(() => {
    if (!rateBookingId) return;

    const normalizedId = String(rateBookingId);
    const bookingFromList = Array.isArray(unratedBookings)
      ? unratedBookings.find((b) => String(b.bookingId) === normalizedId)
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
              service: stored.service || null,
            });
          }
        }
      } catch {
        // ignore storage issues
      }
    }

    if (!resolvedBooking) return;

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

  const handleCloseRating = (submitted) => {
    setIsRatingModalOpen(false);
    if (submitted) {
      notification.success({
        message: 'Thanks for your feedback!',
        description: 'Your rating helps us improve your experience.',
        placement: 'bottomRight',
      });
    }
    setSelectedBooking(null);
    if (submitted) {
      refetchDashboard();
    }
  };

  // Loading
  if (isLoading && !overview) {
    return <DashboardSkeleton />;
  }

  // Empty
  if (!overview) {
    return <DashboardEmpty />;
  }

  const nextSession = overview.upcomingSessions?.[0] || null;
  const completionPercent = overview.stats?.completionPercent ?? 0;

  return (
    <div className="space-y-5">
      <NextLessonHero
        nextSession={nextSession}
        completionPercent={completionPercent}
      />

      <RatingPrompt reminders={unratedBookings} onRate={handleOpenRating} />

      <StatsStrip
        stats={overview.stats}
        businessCurrency={businessCurrency}
        upcomingLessons={overview.upcomingSessions || []}
        pastLessons={overview.previousLessons || []}
        upcomingRentalsList={overview.upcomingRentalsList || []}
        pastRentalsList={overview.pastRentalsList || []}
      />

      <PackageCards packages={overview.packages} />

      <InstructorRecommendations />

      <QuickLinks />

      <RateInstructorModal
        open={isRatingModalOpen}
        booking={selectedBooking}
        onClose={handleCloseRating}
      />
    </div>
  );
};

export default StudentDashboard;
