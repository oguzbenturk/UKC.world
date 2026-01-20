import apiClient from '@/shared/services/apiClient';

export const fetchInstructorDashboard = async () => {
  const { data } = await apiClient.get('/instructors/me/dashboard');
  return data;
};

export const fetchInstructorStudents = async () => {
  const { data } = await apiClient.get('/instructors/me/students');
  return data;
};

export const fetchInstructorStudentProfile = async (studentId) => {
  const { data } = await apiClient.get(`/instructors/me/students/${studentId}/profile`);
  return data;
};

export const updateInstructorStudentProfile = async (studentId, payload) => {
  const { data } = await apiClient.patch(`/instructors/me/students/${studentId}/profile`, payload);
  return data;
};

export const createInstructorStudentProgress = async (studentId, payload) => {
  const { data } = await apiClient.post(`/instructors/me/students/${studentId}/progress`, payload);
  return data;
};

export const deleteInstructorStudentProgress = async (studentId, progressId) => {
  await apiClient.delete(`/instructors/me/students/${studentId}/progress/${progressId}`);
};
