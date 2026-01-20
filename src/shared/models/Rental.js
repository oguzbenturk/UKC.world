/* eslint-disable no-console */
import authService from '../services/auth/authService';
import apiClient from '../services/apiClient';  // Fallback API client
import { normalizeAuditPayload, withAuditFields } from '../utils/auditTransforms';

class Rental {
  /**
   * Get the appropriate API client (use authService.apiClient when available, or fallback to direct apiClient)
   * @param {Object} clientOverride - Optional API client to use instead of default
   * @returns {Object} API client instance
   */
  static getClient(clientOverride = null) {
    if (clientOverride) {
      return clientOverride;
    }
    // Use authService.apiClient if available, otherwise fallback to direct apiClient
    return (authService && authService.apiClient) ? authService.apiClient : apiClient;
  }

  /**
   * Find all active rentals
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<Array>} Array of active rentals
   */
  static async findActive(clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.get('/rentals/active');
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error('Error fetching active rentals:', error);
      throw error;
    }
  }

  /**
   * Find all overdue rentals
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<Array>} Array of overdue rentals
   */
  static async findOverdue(clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.get('/rentals/overdue');
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error('Error fetching overdue rentals:', error);
      throw error;
    }
  }

  /**
   * Find rental by ID
   * @param {string} id - Rental ID
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<Object>} Rental data
   */
  static async findById(id, clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.get(`/rentals/${id}`);
  return withAuditFields(response.data);
    } catch (error) {
      console.error(`Error fetching rental with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new rental
   * @param {Object} rentalData - Rental data
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<Object>} Created rental
   */
  static async create(rentalData, clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.post('/rentals', rentalData);
  return withAuditFields(response.data);
    } catch (error) {
      console.error('Error creating rental:', error);
      throw error;
    }
  }

  /**
   * Update a rental
   * @param {string} id - Rental ID
   * @param {Object} updateData - Data to update
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<Object>} Updated rental
   */
  static async update(id, updateData, clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.put(`/rentals/${id}`, updateData);
  return withAuditFields(response.data);
    } catch (error) {
      console.error(`Error updating rental with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Mark a rental as returned
   * @param {string} id - Rental ID
   * @returns {Promise<Object>} Updated rental
   */
  static async markReturned(id) {
    try {
      const client = this.getClient();
  const response = await client.patch(`/rentals/${id}/return`);
  return withAuditFields(response.data);
    } catch (error) {
      console.error(`Error marking rental ${id} as returned:`, error);
      throw error;
    }
  }

  /**
   * Mark a rental's deposit as returned
   * @param {string} id - Rental ID
   * @returns {Promise<Object>} Updated rental
   */
  static async markDepositReturned(id) {
    try {
      const client = this.getClient();
  const response = await client.patch(`/rentals/${id}/deposit-returned`);
  return withAuditFields(response.data);
    } catch (error) {
      console.error(`Error marking deposit returned for rental ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find rentals by customer ID
   * @param {string} customerId - Customer ID
   * @returns {Promise<Array>} Array of rentals
   */
  static async findByCustomer(customerId) {
    try {
      const client = this.getClient();
  const response = await client.get(`/rentals/customer/${customerId}`);
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error(`Error fetching rentals for customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Find rentals by equipment ID
   * @param {string} equipmentId - Equipment ID
   * @returns {Promise<Array>} Array of rentals
   */
  static async findByEquipment(equipmentId) {
    try {
      const client = this.getClient();
  const response = await client.get(`/rentals/equipment/${equipmentId}`);
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error(`Error fetching rentals for equipment ${equipmentId}:`, error);
      throw error;
    }
  }

  /**
   * Find all upcoming rentals
   * @returns {Promise<Array>} Array of upcoming rentals
   */
  /**
   * Find all upcoming rentals
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<Array>} Array of upcoming rentals
   */
  static async findUpcoming(clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.get('/rentals/upcoming');
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error('Error fetching upcoming rentals:', error);
      throw error;
    }
  }

  /**
   * Find all completed rentals
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<Array>} Array of completed rentals
   */
  static async findCompleted(clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.get('/rentals/completed');
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error('Error fetching completed rentals:', error);
      throw error;
    }
  }

  /**
   * Mark a rental as completed
   * @param {string} id - Rental ID
   * @returns {Promise<Object>} Updated rental
   */
  static async markCompleted(id) {
    try {
      const client = this.getClient();
  const response = await client.patch(`/rentals/${id}/complete`);
  return withAuditFields(response.data);
    } catch (error) {
      console.error(`Error marking rental ${id} as completed:`, error);
      throw error;
    }
  }

  /**
   * Mark a rental as active
   * @param {string} id - Rental ID
   * @returns {Promise<Object>} Updated rental
   */
  static async markActive(id) {
    try {
      const client = this.getClient();
  const response = await client.patch(`/rentals/${id}/activate`);
  return withAuditFields(response.data);
    } catch (error) {
      console.error(`Error marking rental ${id} as active:`, error);
      throw error;
    }
  }

  /**
   * Delete a rental
   * @param {string} id - Rental ID
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<void>}
   */
  static async delete(id, clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
      await client.delete(`/rentals/${id}`);
    } catch (error) {
      console.error(`Error deleting rental ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find recent rentals (limited number, ordered by creation date)
   * @param {Object} clientOverride - Optional API client to use
   * @param {number} limit - Maximum number of rentals to return (default: 20)
   * @returns {Promise<Array>} Array of recent rentals
   */
  static async findRecent(clientOverride = null, limit = 20) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.get(`/rentals/recent?limit=${limit}`);
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error('Error fetching recent rentals:', error);
      throw error;
    }
  }

  /**
   * Find all rentals (no status filter)
   * @param {Object} clientOverride - Optional API client to use
   * @returns {Promise<Array>} Array of all rentals
   */
  static async findAll(clientOverride = null) {
    try {
      const client = this.getClient(clientOverride);
  const response = await client.get('/rentals');
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error('Error fetching all rentals:', error);
      throw error;
    }
  }
}

export default Rental;