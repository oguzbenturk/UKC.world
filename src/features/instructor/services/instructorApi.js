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

export const fetchStudentGoals = async (studentId) => {
  const { data } = await apiClient.get(`/instructors/me/students/${studentId}/goals`);
  return data.goals || [];
};

export const createStudentGoal = async (studentId, payload) => {
  const { data } = await apiClient.post(`/instructors/me/students/${studentId}/goals`, payload);
  return data;
};

export const updateStudentGoal = async (studentId, goalId, payload) => {
  const { data } = await apiClient.patch(`/instructors/me/students/${studentId}/goals/${goalId}`, payload);
  return data;
};

export const deleteStudentGoal = async (studentId, goalId) => {
  await apiClient.delete(`/instructors/me/students/${studentId}/goals/${goalId}`);
};
