// TanStack Query hooks for the manager "Today" dashboard.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import realTimeService from '@/shared/services/realTimeService';
import { message } from '@/shared/utils/antdStatic';
import { confirmLesson, fetchManagerToday, managerTodayKeys } from './managerTodayApi';

export function useManagerToday(date) {
  return useQuery({
    queryKey: managerTodayKeys.day(date),
    queryFn: () => fetchManagerToday(date),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// Bookings change from the calendar, instructors and other devices — refresh on socket events.
export function useManagerTodayRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: managerTodayKeys.all });
    realTimeService.on('booking:updated', handler);
    return () => realTimeService.off('booking:updated', handler);
  }, [queryClient]);
}

/**
 * Confirm one pending lesson, or every listed one in turn ("Confirm all").
 * `confirming` holds the ids in flight so their buttons can show progress.
 */
export function useConfirmLessons() {
  const { t } = useTranslation(['manager']);
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(() => new Set());
  const mutation = useMutation({ mutationFn: confirmLesson });
  const { mutateAsync } = mutation;

  const run = useCallback(async (ids) => {
    if (!ids.length) return;
    setConfirming((prev) => new Set([...prev, ...ids]));
    let ok = 0;
    let failed = 0;
    // Sequential: each confirmation sends notifications and touches the same rows.
    for (const id of ids) {
      try {
        await mutateAsync(id);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setConfirming((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    queryClient.invalidateQueries({ queryKey: managerTodayKeys.all });
    if (ok) message.success(t('manager:today.toast.confirmed', { count: ok }));
    if (failed) message.error(t('manager:today.toast.confirmFailed', { count: failed }));
  }, [mutateAsync, queryClient, t]);

  return {
    confirmOne: useCallback((id) => run([id]), [run]),
    confirmMany: run,
    confirming,
  };
}

/** Re-render every minute so "now" stays current. */
export function useMinuteTick() {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return tick;
}
