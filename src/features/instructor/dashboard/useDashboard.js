// TanStack Query hooks for the instructor "My day" dashboard.
import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import realTimeService from '@/shared/services/realTimeService';
import { message } from '@/shared/utils/antdStatic';
import { ChatWidgetContext } from '@/features/chat/context/chatWidgetContextInstance';
import { earningsKeys } from '../earnings/useEarnings';
import {
  addStudentNote,
  checkInLesson,
  checkOutLesson,
  dashboardKeys,
  fetchDashboardSettings,
  fetchToday,
  fetchWeek,
  fetchWindReport,
} from './dashboardApi';
import { resolveWindSettings } from './dashboardFormat';

export { dashboardKeys };

export function useToday() {
  return useQuery({
    queryKey: dashboardKeys.today(),
    queryFn: () => fetchToday(),
    staleTime: 30_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useWeek() {
  return useQuery({
    queryKey: dashboardKeys.week(),
    queryFn: () => fetchWeek(),
    staleTime: 60_000,
  });
}

/**
 * Wind spot + verdict thresholds from settings; defaults when unset or unreadable.
 * Admins change them in Settings → Forecast ("Instructor dashboard wind"), which
 * invalidates `dashboardKeys.settings`; other devices pick it up within 5 min.
 */
export function useWindSettings() {
  const query = useQuery({
    queryKey: dashboardKeys.settings,
    queryFn: fetchDashboardSettings,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { settings: resolveWindSettings(query.data), ready: !query.isLoading };
}

export function useWindReport(spot, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.wind(spot),
    queryFn: () => fetchWindReport(spot),
    enabled: Boolean(spot) && enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

// Lessons change from the calendar / other devices too — refresh on socket events.
export function useBookingRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    realTimeService.on('booking:updated', handler);
    return () => realTimeService.off('booking:updated', handler);
  }, [queryClient]);
}

/** Re-render every minute so "in 1 h 20 min" and the timeline stay current. */
export function useMinuteTick() {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

const useInvalidateDay = () => {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    queryClient.invalidateQueries({ queryKey: earningsKeys.all });
  }, [queryClient]);
};

/** Check in / check out with toast feedback. */
export function useLessonStatusActions() {
  const { t } = useTranslation(['instructor']);
  const invalidate = useInvalidateDay();
  const checkIn = useMutation({
    mutationFn: checkInLesson,
    onSuccess: () => {
      message.success(t('instructor:myDay.toast.checkedIn'));
      invalidate();
    },
    onError: () => message.error(t('instructor:myDay.toast.actionError')),
  });
  const checkOut = useMutation({
    mutationFn: checkOutLesson,
    onSuccess: () => {
      message.success(t('instructor:myDay.toast.checkedOut'));
      invalidate();
    },
    onError: () => message.error(t('instructor:myDay.toast.actionError')),
  });
  return { checkIn, checkOut, busy: checkIn.isPending || checkOut.isPending };
}

export function useAddNote() {
  const { t } = useTranslation(['instructor']);
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: addStudentNote,
    onSuccess: () => {
      message.success(t('instructor:myDay.toast.noteSaved'));
      invalidate();
    },
    onError: () => message.error(t('instructor:myDay.toast.noteError')),
  });
}

/**
 * Chat bridge: unread total + "message this student" through the app-wide chat
 * widget (POST /chat/conversations/direct → open the thread). Falls back to the
 * /chat page when the widget isn't mounted.
 */
export function useChatBridge() {
  const { t } = useTranslation(['instructor']);
  const navigate = useNavigate();
  const chat = useContext(ChatWidgetContext);
  const [openingFor, setOpeningFor] = useState(null);

  const messageStudent = useCallback(async (userId) => {
    if (!userId) return;
    if (!chat?.openConversationWith) {
      navigate('/chat');
      return;
    }
    setOpeningFor(userId);
    try {
      await chat.openConversationWith(userId);
    } catch {
      message.error(t('instructor:myDay.toast.chatError'));
    } finally {
      setOpeningFor(null);
    }
  }, [chat, navigate, t]);

  const openInbox = useCallback(() => {
    if (chat?.toggleOpen) {
      if (!chat.isOpen) chat.toggleOpen();
      return;
    }
    navigate('/chat');
  }, [chat, navigate]);

  return { unread: Number(chat?.unreadTotal) || 0, messageStudent, openInbox, openingFor };
}
