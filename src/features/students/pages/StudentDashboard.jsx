import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
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
import InstructorNotesFeed from '../components/dashboard/InstructorNotesFeed';
import QuickLinks from '../components/dashboard/QuickLinks';

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

      <StatsStrip stats={overview.stats} businessCurrency={businessCurrency} />

      <PackageCards packages={overview.packages} />

      <InstructorNotesFeed notes={overview.instructorNotes} />

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
