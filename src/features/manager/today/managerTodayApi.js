// API client for the manager "Today" dashboard.
// Backend: backend/routes/managerToday.js (GET /manager/today). Lesson
// confirmation reuses the staff-only PATCH /bookings/:id/status endpoint.
import apiClient from '@/shared/services/apiClient';

export const managerTodayKeys = {
  all: ['manager-today'],
  day: (date) => ['manager-today', date || 'today'],
};

export const fetchManagerToday = async (date) => {
  const { data } = await apiClient.get('/manager/today', date ? { params: { date } } : undefined);
  return data;
};

export const confirmLesson = async (bookingId) => {
  const { data } = await apiClient.patch(`/bookings/${bookingId}/status`, { status: 'confirmed' });
  return data;
};
