import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const supportQueryKeys = {
  tickets: ['admin-support-tickets'],
  statistics: ['admin-support-statistics'],
};

export const useSupportTickets = (filters = {}) => {
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.priority) params.priority = filters.priority;

  return useQuery({
    queryKey: [...supportQueryKeys.tickets, params],
    queryFn: async () => {
      const { data } = await axios.get('/api/admin/support-tickets', { params });
      return data.data;
    },
  });
};

export const useSupportStatistics = () =>
  useQuery({
    queryKey: supportQueryKeys.statistics,
    queryFn: async () => {
      const { data } = await axios.get('/api/admin/support-tickets/statistics');
      return data.data;
    },
  });

export const useUpdateTicketStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, status }) =>
      axios.patch(`/api/admin/support-tickets/${ticketId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportQueryKeys.tickets });
      qc.invalidateQueries({ queryKey: supportQueryKeys.statistics });
    },
  });
};

export const useAddTicketNote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, note, type }) =>
      axios.post(`/api/admin/support-tickets/${ticketId}/notes`, { note, type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportQueryKeys.tickets });
    },
  });
};
