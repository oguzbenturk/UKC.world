import authService from '../services/auth/authService';

class ServicePackage {
  /**
   * Find all service packages with their associated services
   * @returns {Promise<Array>} Array of service packages with services
   */
  static async findWithServices() {
    try {
      const response = await authService.apiClient.get('/service-packages?include=services');
      return response.data || [];
    } catch (error) {
      console.error('Error fetching service packages:', error);
      throw error;
    }
  }

  /**
   * Find service package by ID
   * @param {string} id - Package UUID
   * @returns {Promise<Object|null>} Service package object or null if not found
   */
  static async findById(id) {
    try {
      const response = await authService.apiClient.get(`/service-packages/${id}?include=services`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`Error fetching service package with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Save a service package (create or update)
   * @param {Object} packageData - Service package data to save
   * @returns {Promise<Object>} Saved service package
   */
  static async save(packageData) {
    try {
      if (packageData.id) {
        // Update existing package
        const response = await authService.apiClient.put(
          `/service-packages/${packageData.id}`,
          packageData
        );
        return response.data;
      } else {
        // Create new package
        const response = await authService.apiClient.post('/service-packages', packageData);
        return response.data;
      }
    } catch (error) {
      console.error('Error saving service package:', error);
      throw error;
    }
  }

  /**
   * Delete a service package
   * @param {string} id - Package UUID to delete
   * @returns {Promise<void>}
   */
  static async delete(id) {
    try {
      await authService.apiClient.delete(`/service-packages/${id}`);
    } catch (error) {
      console.error(`Error deleting service package ${id}:`, error);
      throw error;
    }
  }
}

export default ServicePackage;

