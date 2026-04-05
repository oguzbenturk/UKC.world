import apiClient from './apiClient.js';

class ConsentService {
  async getStatus() {
    const response = await apiClient.get('/user-consents/me');
    return response.data;
  }

  async updateStatus(payload) {
    const response = await apiClient.post('/user-consents/me', payload);
    return response.data;
  }
}

const consentService = new ConsentService();
export default consentService;
