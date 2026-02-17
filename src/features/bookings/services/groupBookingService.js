/**
 * Group Booking Service - Frontend API Client
 */

import apiClient from '@/shared/services/apiClient';

/**
 * Create a new group booking
 */
export const createGroupBooking = async (data) => {
  const response = await apiClient.post('/group-bookings', data);
  return response.data;
};

/**
 * Get all group bookings for the current user
 */
export const getGroupBookings = async () => {
  const response = await apiClient.get('/group-bookings');
  return response.data;
};

/**
 * Get group booking details
 */
export const getGroupBookingDetails = async (id) => {
  const response = await apiClient.get(`/group-bookings/${id}`);
  return response.data;
};

/**
 * Invite participants to a group booking
 */
export const inviteParticipants = async (groupBookingId, participants) => {
  const response = await apiClient.post(`/group-bookings/${groupBookingId}/invite`, {
    participants
  });
  return response.data;
};

/**
 * Get invitation details by token (public)
 */
export const getInvitationDetails = async (token) => {
  const response = await apiClient.get(`/group-bookings/invitation/${token}`);
  return response.data;
};

/**
 * Accept an invitation
 */
export const acceptInvitation = async (token) => {
  const response = await apiClient.post(`/group-bookings/invitation/${token}/accept`);
  return response.data;
};

/**
 * Accept a group booking invitation (for registered users - new flow)
 */
export const acceptGroupBookingById = async (groupBookingId) => {
  const response = await apiClient.post(`/group-bookings/${groupBookingId}/accept`);
  return response.data;
};

/**
 * Decline an invitation
 */
export const declineInvitation = async (token, reason = null) => {
  const response = await apiClient.post(`/group-bookings/invitation/${token}/decline`, {
    reason
  });
  return response.data;
};

/**
 * Decline a group booking invitation (for registered users - new flow)
 */
export const declineGroupBookingById = async (groupBookingId, reason = null) => {
  const response = await apiClient.post(`/group-bookings/${groupBookingId}/decline`, {
    reason
  });
  return response.data;
};

/**
 * Pay for group booking participation
 */
export const payForGroupBooking = async (groupBookingId, paymentMethod, packageData = null) => {
  const response = await apiClient.post(`/group-bookings/${groupBookingId}/pay`, {
    paymentMethod,
    ...packageData
  });
  return response.data;
};

/**
 * Organizer pays for all participants (organizer_pays model)
 */
export const payForAllParticipants = async (groupBookingId, paymentMethod, externalReference = null) => {
  const response = await apiClient.post(`/group-bookings/${groupBookingId}/pay-all`, {
    paymentMethod,
    externalReference
  });
  return response.data;
};

/**
 * Cancel a group booking
 */
export const cancelGroupBooking = async (groupBookingId, reason = null) => {
  const response = await apiClient.delete(`/group-bookings/${groupBookingId}`, {
    data: { reason }
  });
  return response.data;
};

/**
 * Remove a participant from a group booking
 */
export const removeParticipant = async (groupBookingId, participantId) => {
  const response = await apiClient.delete(
    `/group-bookings/${groupBookingId}/participants/${participantId}`
  );
  return response.data;
};

export default {
  createGroupBooking,
  getGroupBookings,
  getGroupBookingDetails,
  inviteParticipants,
  getInvitationDetails,
  acceptInvitation,
  acceptGroupBookingById,
  declineInvitation,
  declineGroupBookingById,
  payForGroupBooking,
  payForAllParticipants,
  cancelGroupBooking,
  removeParticipant
};
