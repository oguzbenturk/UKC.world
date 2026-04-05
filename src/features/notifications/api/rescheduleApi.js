import apiClient from '@/shared/services/apiClient';

/**
 * Fetch pending reschedule notifications for the current student.
 */
export async function fetchPendingReschedules() {
  const { data } = await apiClient.get('/reschedule-notifications/pending');
  return data.rescheduleNotifications || [];
}

/**
 * Confirm (acknowledge) a single reschedule notification.
 */
export async function confirmReschedule(notificationId) {
  const { data } = await apiClient.patch(`/reschedule-notifications/${notificationId}/confirm`);
  return data;
}

/**
 * Dismiss a single reschedule notification.
 */
export async function dismissReschedule(notificationId) {
  const { data } = await apiClient.patch(`/reschedule-notifications/${notificationId}/dismiss`);
  return data;
}

/**
 * Confirm all pending reschedule notifications at once.
 */
export async function confirmAllReschedules() {
  const { data } = await apiClient.post('/reschedule-notifications/confirm-all');
  return data;
}

export default {
  fetchPendingReschedules,
  confirmReschedule,
  dismissReschedule,
  confirmAllReschedules,
};
