import apiClient from './apiClient';
import { normalizeAuditPayload, withAuditFields } from '../utils/auditTransforms';

export const usersService = {
  async list(params = {}) {
    const { data } = await apiClient.get('/users', { params });
    return normalizeAuditPayload(data);
  },
  async get(id) {
    const { data } = await apiClient.get(`/users/${id}`);
    return withAuditFields(data);
  },
  async create(payload) {
    const { data } = await apiClient.post('/users', payload);
    return withAuditFields(data);
  },
  async update(id, payload) {
    const { data } = await apiClient.patch(`/users/${id}`, payload);
    return withAuditFields(data);
  }
};

export default usersService;
