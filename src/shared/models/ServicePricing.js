import authService from '../services/auth/authService';

class ServicePricing {
  /**
   * Get the complete pricing matrix
   * @returns {Promise<Object>} Pricing matrix object
   */
  static async getPricingMatrix() {
    try {
      const response = await authService.apiClient.get('/service-pricing/matrix');
      return response.data;
    } catch (error) {
      console.error('Error fetching pricing matrix:', error);
      throw error;
    }
  }

  /**
   * Save pricing configuration
   * @param {Object} pricingData - Pricing data to save
   * @returns {Promise<Object>} Saved pricing configuration
   */
  static async save(pricingData) {
    try {
      if (pricingData.id) {
        // Update existing pricing
        const response = await authService.apiClient.put(
          `/service-pricing/${pricingData.id}`,
          pricingData
        );
        return response.data;
      } else {
        // Create new pricing
        const response = await authService.apiClient.post('/service-pricing', pricingData);
        return response.data;
      }
    } catch (error) {
      console.error('Error saving service pricing:', error);
      throw error;
    }
  }

  /**
   * Delete a pricing configuration
   * @param {string} id - Pricing UUID to delete
   * @returns {Promise<void>}
   */
  static async delete(id) {
    try {
      await authService.apiClient.delete(`/service-pricing/${id}`);
    } catch (error) {
      console.error(`Error deleting service pricing ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get pricing for a specific service type and season
   * @param {string} serviceTypeId - Service type UUID
   * @param {string} seasonId - Season UUID
   * @returns {Promise<Object|null>} Pricing object or null if not found
   */
  static async findByServiceAndSeason(serviceTypeId, seasonId) {
    try {
      const response = await authService.apiClient.get(
        `/service-pricing/find?serviceTypeId=${serviceTypeId}&seasonId=${seasonId}`
      );
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('Error fetching service pricing:', error);
      throw error;
    }
  }
}

export default ServicePricing;
