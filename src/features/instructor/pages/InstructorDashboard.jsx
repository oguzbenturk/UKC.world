/**
 * Instructor dashboard — "My day".
 * Design boards: earnings-canvas Dashboard.dc.html (mobile 390px) and
 * DashboardDesktop.dc.html (desktop bento). Data: GET /instructors/me/today +
 * /me/week (backend/routes/instructorToday.js), the public wind forecast, the
 * earnings summary (ready-for-payout) and the ratings hook.
 *
 * Mobile order: greeting → wind → next lesson → needs attention → today →
 * this week → payout + rating. Desktop: greeting with attention chips and
 * "New booking", then next lesson | wind, today | payout · rating · week.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { usePullToRefresh } from '@/shared/hooks/usePullToRefresh';
import { analyticsService } from '@/shared/services/analyticsService';
import { canCloseLessons } from '@/shared/utils/roleUtils';
import { CalendarProvider } from '@/features/bookings/components/contexts/CalendarContext';
import { ErrorState } from '../earnings/components/ui';
import { primaryButtonClass } from '../earnings/components/earningsStyles';
import { useIsDesktop } from '../earnings/useEarnings';
import { firstName, lessonStates } from '../dashboard/dashboardFormat';
import {
  dashboardKeys,
  useBookingRealtime,
  useChatBridge,
  useLessonStatusActions,
  useMinuteTick,
  useToday,
  useWeek,
  useWindReport,
  useWindSettings,
} from '../dashboard/useDashboard';
import Greeting from '../dashboard/components/Greeting';
import WindCard from '../dashboard/components/WindCard';
import NextLessonCard from '../dashboard/components/NextLessonCard';
import TodayTimeline from '../dashboard/components/TodayTimeline';
import WeekStrip from '../dashboard/components/WeekStrip';
import LessonDrawer from '../dashboard/components/LessonDrawer';
import DashboardSkeleton from '../dashboard/components/DashboardSkeleton';
import { AttentionChips, AttentionList } from '../dashboard/components/Attention';
import { PayoutMiniCard, RatingMiniCard } from '../dashboard/components/SideCards';
import { PlusIcon } from '../dashboard/components/DashboardIcons';

const BookingDrawer = lazy(() => import('@/features/bookings/components/components/BookingDrawer'));

function useSpotName(spot) {
  const { t, i18n } = useTranslation(['instructor']);
  const key = `common:windReport.spots.${spot}`;
  return i18n.exists?.(key) ? t(key) : spot;
}

function useDrawerState(lessons) {
  const [state, setState] = useState({ lessonId: null, note: false });
  const lesson = useMemo(() => lessons.find((l) => l.id === state.lessonId) || null, [lessons, state.lessonId]);
  const open = useCallback((target, { note = false } = {}) => {
    if (target?.id) setState({ lessonId: target.id, note });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, lessonId: null })), []);
  return { lesson, initialNote: state.note, isOpen: Boolean(state.lessonId), open, close };
}

/** Server attention items + the chat widget's unread total (client side). */
function useAttention(day, lessons, chat, openLesson) {
  const items = useMemo(() => {
    const list = [...(day?.attention ?? [])];
    if (chat.unread > 0) list.push({ kind: 'unread_messages', count: chat.unread });
    return list;
  }, [day?.attention, chat.unread]);

  const onSelect = useCallback((item) => {
    if (item.kind === 'unread_messages') {
      chat.openInbox();
      return;
    }
    const target = lessons.find((l) => l.id === item.bookingId);
    if (target) openLesson(target);
  }, [chat, lessons, openLesson]);

  return { items, onSelect };
}

function useViewTracking(queryClient) {
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    analyticsService.track('instructor_dashboard_viewed');
  }, []);
  usePullToRefresh(() => {
    analyticsService.track('instructor_dashboard_pull_refresh');
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  }, { threshold: 90, maxScroll: 30 });
}

function LessonsError({ query, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  return (
    <ErrorState
      className={isDesktop ? 'lg:col-span-2' : ''}
      title={t('instructor:myDay.error.title')}
      body={t('instructor:myDay.error.body')}
      retryLabel={t('instructor:myDay.error.retry')}
      onRetry={() => query.refetch()}
    />
  );
}

function NewBookingButton({ onClick }) {
  const { t } = useTranslation(['instructor']);
  return (
    <button type="button" onClick={onClick} className={`${primaryButtonClass} h-11 text-sm`}>
      <PlusIcon size={18} />
      {t('instructor:myDay.newBooking')}
    </button>
  );
}

function DesktopLayout({ sections, wind, weekQuery }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      {sections ? sections.next : <DashboardSkeleton isDesktop />}
      {wind}
      {sections?.timeline}
      <div className="flex min-w-0 flex-col gap-5">
        <PayoutMiniCard isDesktop />
        <RatingMiniCard isDesktop />
        <WeekStrip query={weekQuery} isDesktop />
      </div>
    </div>
  );
}

function MobileLayout({ sections, wind, weekQuery, attention }) {
  return (
    <>
      {wind}
      {sections ? (
        <>
          {sections.next}
          <AttentionList items={attention.items} onSelect={attention.onSelect} />
          {sections.timeline}
        </>
      ) : <DashboardSkeleton />}
      <WeekStrip query={weekQuery} />
      <div className="grid grid-cols-2 gap-2.5">
        <PayoutMiniCard />
        <RatingMiniCard />
      </div>
    </>
  );
}

function NewBookingDrawer({ open, user, onClose, onCreated }) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <CalendarProvider>
        <BookingDrawer
          isOpen={open}
          onClose={onClose}
          prefilledInstructor={{ id: user?.id, name: user?.name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() }}
          onBookingCreated={onCreated}
        />
      </CalendarProvider>
    </Suspense>
  );
}

export default function InstructorDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  useMinuteTick();
  useBookingRealtime();
  useViewTracking(queryClient);

  const todayQuery = useToday();
  const weekQuery = useWeek();
  const { settings: windSettings, ready: windSettingsReady } = useWindSettings();
  const windQuery = useWindReport(windSettings.spot, windSettingsReady);
  const spotName = useSpotName(windSettings.spot);
  const { checkIn, checkOut, busy } = useLessonStatusActions();
  const chat = useChatBridge();
  const [bookingOpen, setBookingOpen] = useState(false);

  const day = todayQuery.data;
  const lessons = useMemo(() => day?.lessons ?? [], [day]);
  const states = useMemo(() => lessonStates(lessons, day?.nextLessonId), [lessons, day?.nextLessonId]);
  const nextLesson = lessons.find((l) => l.id === day?.nextLessonId) || null;
  const drawer = useDrawerState(lessons);
  const attention = useAttention(day, lessons, chat, drawer.open);

  const openNewBooking = useCallback(() => {
    analyticsService.track('instructor_dashboard_new_booking');
    setBookingOpen(true);
  }, []);

  // Only staff (e.g. a manager viewing this page) may check a lesson out.
  const canClose = canCloseLessons(user?.role);
  const lessonActions = {
    busy,
    canClose,
    onCheckIn: (lesson) => checkIn.mutate(lesson.id),
    onCheckOut: (lesson) => checkOut.mutate(lesson.id),
    onMessage: chat.messageStudent,
    openingFor: chat.openingFor,
  };

  let sections = null;
  if (day) {
    sections = {
      next: (
        <NextLessonCard
          lesson={nextLesson}
          date={day.date}
          isDesktop={isDesktop}
          hadLessons={lessons.length > 0}
          busy={busy}
          canClose={canClose}
          openingChat={chat.openingFor}
          onCheckIn={lessonActions.onCheckIn}
          onCheckOut={lessonActions.onCheckOut}
          onOpen={drawer.open}
          onMessage={chat.messageStudent}
        />
      ),
      timeline: <TodayTimeline lessons={lessons} states={states} isDesktop={isDesktop} onOpen={drawer.open} onNewBooking={openNewBooking} />,
    };
  } else if (todayQuery.isError) {
    sections = { next: <LessonsError query={todayQuery} isDesktop={isDesktop} />, timeline: null };
  }

  const wind = <WindCard query={windQuery} settings={windSettings} date={day?.date} isDesktop={isDesktop} spotName={spotName} />;

  return (
    <div
      data-testid="instructor-dashboard"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      className={`mx-auto flex w-full flex-col ${isDesktop ? 'max-w-7xl gap-5 p-6 xl:p-8' : 'max-w-xl gap-3.5 px-4 pb-8 pt-4'}`}
    >
      <Greeting
        name={firstName(user)}
        date={day?.date}
        summary={day?.summary}
        isDesktop={isDesktop}
        actions={isDesktop ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <AttentionChips items={attention.items} onSelect={attention.onSelect} />
            <NewBookingButton onClick={openNewBooking} />
          </div>
        ) : null}
      />

      {isDesktop
        ? <DesktopLayout sections={sections} wind={wind} weekQuery={weekQuery} />
        : <MobileLayout sections={sections} wind={wind} weekQuery={weekQuery} attention={attention} />}

      <LessonDrawer
        lesson={drawer.lesson}
        open={drawer.isOpen}
        onClose={drawer.close}
        isDesktop={isDesktop}
        initialNote={drawer.initialNote}
        {...lessonActions}
      />

      <NewBookingDrawer
        open={bookingOpen}
        user={user}
        onClose={() => setBookingOpen(false)}
        onCreated={() => {
          setBookingOpen(false);
          queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
        }}
      />
    </div>
  );
}
