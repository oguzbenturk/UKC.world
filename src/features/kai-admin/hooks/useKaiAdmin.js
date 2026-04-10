import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';

export function useKaiConversations(filters = {}) {
  const { page = 1, limit = 25, userRole, search, dateFrom, dateTo } = filters;
  return useQuery({
    queryKey: ['kai-conversations', page, limit, userRole, search, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', limit);
      if (userRole) params.set('userRole', userRole);
      if (search) params.set('search', search);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const { data } = await apiClient.get(`/admin/kai/conversations?${params}`);
      return data;
    },
  });
}

export function useKaiConversation(sessionId) {
  return useQuery({
    queryKey: ['kai-conversation', sessionId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/admin/kai/conversations/${sessionId}`);
      return data;
    },
    enabled: !!sessionId,
  });
}

export function useKaiStats() {
  return useQuery({
    queryKey: ['kai-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/kai/stats');
      return data;
    },
  });
}

export function useFlagConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, flagType, note }) => {
      const { data } = await apiClient.post(`/admin/kai/conversations/${sessionId}/flag`, { flagType, note });
      return data;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['kai-conversation', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['kai-conversations'] });
    },
  });
}
