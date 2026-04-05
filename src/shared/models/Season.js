// src/models/Season.js
import authService from '../services/auth/authService';

class Season {
  /**
   * Find all seasons
   * @returns {Promise<Array>} Array of seasons
   */
  static async findAll() {
    try {
      const response = await authService.apiClient.get('/seasons');
      return response.data || [];
    } catch (error) {
      console.error('Error fetching seasons:', error);
      throw error;
    }
  }

  /**
   * Find season by ID
   * @param {string} id - Season UUID
   * @returns {Promise<Object|null>} Season object or null if not found
   */
  static async findById(id) {
    try {
      const response = await authService.apiClient.get(`/seasons/${id}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`Error fetching season with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Save a season (create or update)
   * @param {Object} seasonData - Season data to save
   * @returns {Promise<Object>} Saved season
   */
  static async save(seasonData) {
    try {
      if (seasonData.id) {
        // Update existing season
        const response = await authService.apiClient.put(
          `/seasons/${seasonData.id}`,
          seasonData
        );
        return response.data;
      } else {
        // Create new season
        const response = await authService.apiClient.post('/seasons', seasonData);
        return response.data;
      }
    } catch (error) {
      console.error('Error saving season:', error);
      throw error;
    }
  }

  /**
   * Delete a season
   * @param {string} id - Season UUID to delete
   * @returns {Promise<void>}
   */
  static async delete(id) {
    try {
      await authService.apiClient.delete(`/seasons/${id}`);
    } catch (error) {
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 
          'This season cannot be deleted because it is in use.');
      }
      console.error(`Error deleting season ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get current active season
   * @returns {Promise<Object|null>} Current season or null if no active season
   */
  static async getCurrentSeason() {
    try {
      const response = await authService.apiClient.get('/seasons/current');
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('Error fetching current season:', error);
      throw error;
    }
  }
}

export default Season;