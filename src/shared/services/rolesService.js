import apiClient from './apiClient';
import { normalizeAuditPayload, withAuditFields } from '../utils/auditTransforms';

export const rolesService = {
  async list() {
    const { data } = await apiClient.get('/roles');
    return normalizeAuditPayload(data);
  },
  async get(id) {
    const { data } = await apiClient.get(`/roles/${id}`);
    return withAuditFields(data);
  },
  async create(payload) {
    const { data } = await apiClient.post('/roles', payload);
    return withAuditFields(data);
  },
  async update(id, payload) {
    const { data } = await apiClient.patch(`/roles/${id}`, payload);
    return withAuditFields(data);
  },
  async remove(id) {
    await apiClient.delete(`/roles/${id}`);
  },
  async assign(roleId, userId) {
    const { data } = await apiClient.patch(`/roles/${roleId}/assign`, { user_id: userId });
    return withAuditFields(data);
  }
};

export default rolesService;
