/**
 * Manager "Today" dashboard — one Today-first screen for managers (replaces the
 * former Manager Home; the analytics dashboard stays reachable as Reports at
 * /admin/dashboard).
 * Design boards: canvas "Manager dashboard — proposal" (ManagerDashboard,
 * ManagerDashboardMobile, ManagerDashboardBusy .dc.html).
 * Data: GET /api/manager/today (backend/services/managerTodayService.js) + the
 * instructor dashboard's wind spot/threshold settings and forecast.
 *
 * Desktop: header with quick actions → Needs action | Right now + money tiles
 * → Instructors today (capacity by hour in busy season) | rentals, stays, gear.
 * Mobile: header + action tiles → Right now → Needs action → money → instructors
 * → rentals, stays, gear.
 */
import { lazy, Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { CalendarProvider } from '@/features/bookings/components/contexts/CalendarContext';
import { ErrorState, SkeletonBlock } from '@/features/instructor/earnings/components/ui';
import { useIsDesktop } from '@/features/instructor/earnings/useEarnings';
import { useWindReport, useWindSettings } from '@/features/instructor/dashboard/useDashboard';
import { managerTodayKeys } from '../today/managerTodayApi';
import { useConfirmLessons, useManagerToday, useManagerTodayRealtime, useMinuteTick } from '../today/useManagerToday';
import { firstNameOf } from '../today/managerTodayFormat';
import TodayHeader from '../today/components/TodayHeader';
import NeedsAction from '../today/components/NeedsAction';
import RightNow from '../today/components/RightNow';
import MoneyTiles from '../today/components/MoneyTiles';
import InstructorsToday from '../today/components/InstructorsToday';
import OpsStrip from '../today/components/OpsStrip';

const BookingDrawer = lazy(() => import('@/features/bookings/components/components/BookingDrawer'));

function useSpotName(spot) {
  const { t, i18n } = useTranslation(['common']);
  const key = `common:windReport.spots.${spot}`;
  return i18n.exists?.(key) ? t(key) : spot;
}

function TodaySkeleton({ isDesktop }) {
  const { t } = useTranslation(['manager']);
  return (
    <div role="status" aria-live="polite" data-testid="manager-today-skeleton" className="flex flex-col gap-4">
      <span className="sr-only">{t('manager:today.loading')}</span>
      {isDesktop ? (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <SkeletonBlock className="h-80 rounded-2xl" />
            <SkeletonBlock className="h-80 rounded-2xl" />
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <SkeletonBlock className="h-64 rounded-2xl" />
            <SkeletonBlock className="h-64 rounded-2xl" />
          </div>
        </>
      ) : (
        <>
          <SkeletonBlock className="h-44 rounded-3xl" />
          <SkeletonBlock className="h-56 rounded-2xl" />
          <SkeletonBlock className="h-40 rounded-2xl" />
        </>
      )}
    </div>
  );
}

function NewBookingDrawer({ open, onClose, onCreated }) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <CalendarProvider>
        <BookingDrawer isOpen={open} onClose={onClose} onBookingCreated={onCreated} />
      </CalendarProvider>
    </Suspense>
  );
}

export default function ManagerTodayDashboard() {
  const { t } = useTranslation(['manager']);
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  useMinuteTick();
  useManagerTodayRealtime();

  const query = useManagerToday();
  const { settings: windSettings, ready: windReady } = useWindSettings();
  const windQuery = useWindReport(windSettings.spot, windReady);
  const spotName = useSpotName(windSettings.spot);
  const { confirmOne, confirmMany, confirming } = useConfirmLessons();
  const [bookingOpen, setBookingOpen] = useState(false);
  const openNewBooking = useCallback(() => setBookingOpen(true), []);

  const data = query.data;
  const name = user?.first_name || firstNameOf(user?.name);

  let body;
  if (data) {
    const needsAction = (
      <NeedsAction actions={data.actions} confirming={confirming} onConfirm={confirmOne} onConfirmAll={confirmMany} isDesktop={isDesktop} />
    );
    const rightNow = <RightNow data={data} windQuery={windQuery} windSettings={windSettings} spotName={spotName} isDesktop={isDesktop} />;
    const money = <MoneyTiles data={data} isDesktop={isDesktop} />;
    const instructors = <InstructorsToday data={data} isDesktop={isDesktop} />;
    const ops = <OpsStrip data={data} isDesktop={isDesktop} />;
    // Desktop: two independent columns so a short queue never leaves a gap.
    body = isDesktop ? (
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">{needsAction}{instructors}</div>
        <div className="flex min-w-0 flex-col gap-5">{rightNow}{money}{ops}</div>
      </div>
    ) : (
      <>
        {rightNow}
        {needsAction}
        {money}
        {instructors}
        {ops}
      </>
    );
  } else if (query.isError) {
    body = (
      <ErrorState
        title={t('manager:today.error.title')}
        body={t('manager:today.error.body')}
        retryLabel={t('manager:today.error.retry')}
        onRetry={() => query.refetch()}
      />
    );
  } else {
    body = <TodaySkeleton isDesktop={isDesktop} />;
  }

  return (
    <div
      data-testid="manager-today"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      className={`mx-auto flex w-full flex-col ${isDesktop ? 'max-w-7xl gap-5 p-6 xl:p-8' : 'max-w-xl gap-3.5 px-4 pb-8 pt-4'}`}
    >
      <TodayHeader name={name} data={data} isDesktop={isDesktop} onNewBooking={openNewBooking} />
      {body}
      <NewBookingDrawer
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onCreated={() => {
          setBookingOpen(false);
          queryClient.invalidateQueries({ queryKey: managerTodayKeys.all });
        }}
      />
    </div>
  );
}
