// API client for the instructor "My day" dashboard.
// Backend: backend/routes/instructorToday.js (GET /instructors/me/today, /me/week).
// Lesson actions reuse the existing booking + notes endpoints as-is.
import apiClient from '@/shared/services/apiClient';
import { fetchSpotReport } from '@/features/wind-report/services/windReportService';

const BASE = '/instructors/me';

export const fetchToday = async (date) => {
  const { data } = await apiClient.get(`${BASE}/today`, date ? { params: { date } } : undefined);
  return data;
};

export const fetchWeek = async (start) => {
  const { data } = await apiClient.get(`${BASE}/week`, start ? { params: { start } } : undefined);
  return data;
};

// GET /settings (any authenticated user). The dashboard only needs the
// `instructor_dashboard` key: { wind_spot, wind_min_kn, wind_max_kn }.
export const fetchDashboardSettings = async () => {
  const { data } = await apiClient.get('/settings');
  return data?.instructor_dashboard ?? null;
};

export const fetchWindReport = (spotId) => fetchSpotReport(spotId);

// Check-in / check-out go through PUT /bookings/:id (ownership is enforced there).
// Same field values the calendar's booking detail modal writes.
export const checkInLesson = async (bookingId) => {
  const { data } = await apiClient.put(`/bookings/${bookingId}`, {
    status: 'checked-in',
    checkin_status: 'checked-in',
    checkin_time: new Date().toISOString(),
  });
  return data;
};

export const checkOutLesson = async (bookingId) => {
  const { data } = await apiClient.put(`/bookings/${bookingId}`, {
    status: 'completed',
    checkout_status: 'checked-out',
    checkout_time: new Date().toISOString(),
  });
  return data;
};

export const addStudentNote = async ({ studentId, bookingId, note, visibility }) => {
  const { data } = await apiClient.post(`${BASE}/students/${studentId}/notes`, { note, bookingId, visibility });
  return data;
};
