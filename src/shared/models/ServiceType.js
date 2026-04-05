import authService from '../services/auth/authService';

class ServiceType {
  /**
   * Find all service types
   * 
   * @param {Object} options - Query options
   * @param {boolean} options.activeOnly - If true, only return active service types
   * @param {string} options.category - Filter by category
   * @returns {Promise<Array>} Array of service types
   */
  static async findAll(options = {}) {
    try {
      let url = '/service-types';
      const params = new URLSearchParams();
      
      if (options.activeOnly) {
        params.append('activeOnly', 'true');
      }
      
      if (options.category) {
        params.append('category', options.category);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await authService.apiClient.get(url);
      return response.data || [];
    } catch (error) {
      console.error('Error fetching service types:', error);
      throw error;
    }
  }

  /**
   * Find service type by ID
   * 
   * @param {string} id - Service type UUID
   * @returns {Promise<Object|null>} Service type object or null if not found
   */
  static async findById(id) {
    try {
      const response = await authService.apiClient.get(`/service-types/${id}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`Error fetching service type with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find service types by category
   * 
   * @param {string} category - The category to filter by
   * @param {boolean} activeOnly - If true, only return active service types
   * @returns {Promise<Array>} Array of service types
   */
  static async findByCategory(category, activeOnly = false) {
    try {
      const params = new URLSearchParams({
        category,
        ...(activeOnly && { activeOnly: 'true' })
      });

      const response = await authService.apiClient.get(`/service-types?${params.toString()}`);
      return response.data || [];
    } catch (error) {
      console.error(`Error fetching service types for category ${category}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all unique categories
   * 
   * @returns {Promise<Array>} Array of unique category strings
   */
  static async getCategories() {
    try {
      const response = await authService.apiClient.get('/service-types/categories');
      return response.data || [];
    } catch (error) {
      console.error('Error fetching service type categories:', error);
      throw error;
    }
  }

  /**
   * Save a service type (create or update)
   * 
   * @param {Object} serviceTypeData - Service type data to save
   * @returns {Promise<Object>} Saved service type
   */
  static async save(serviceTypeData) {
    try {
      if (serviceTypeData.id) {
        // Update existing service type
        const response = await authService.apiClient.put(
          `/service-types/${serviceTypeData.id}`,
          serviceTypeData
        );
        return response.data;
      } else {
        // Create new service type
        const response = await authService.apiClient.post('/service-types', serviceTypeData);
        return response.data;
      }
    } catch (error) {
      console.error('Error saving service type:', error);
      throw error;
    }
  }

  /**
   * Delete a service type
   * 
   * @param {string} id - Service type UUID to delete
   * @returns {Promise<void>}
   */
  static async delete(id) {
    try {
      await authService.apiClient.delete(`/service-types/${id}`);
    } catch (error) {
      // Check if error is due to dependencies
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 
          'This service type cannot be deleted because it is in use.');
      }
      console.error(`Error deleting service type ${id}:`, error);
      throw error;
    }
  }
}

export default ServiceType;
