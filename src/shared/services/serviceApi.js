/* eslint-disable no-console */
// src/services/serviceApi.js
import apiClient from './apiClient';
import { normalizeAuditPayload, withAuditFields } from '../utils/auditTransforms';

export const serviceApi = {  // Get all services
  getServices: async (filters = {}) => {
    try {
      const response = await apiClient.get('/services', {
        params: filters
      });
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error('Error fetching services:', error);
      throw error;
    }
  },
  // Get service categories
  getCategories: async () => {
    try {
      const response = await apiClient.get('/services/categories');
  return normalizeAuditPayload(response.data);
    } catch (error) {
      console.error('Error fetching service categories:', error);
      throw error;
    }
  },
  // Get a single service by ID
  getServiceById: async (id) => {
    try {
      const response = await apiClient.get(`/services/${id}`);
  return withAuditFields(response.data);
    } catch (error) {
      console.error(`Error fetching service with ID ${id}:`, error);
      throw error;
    }
  },
  // Create a new service
  createService: async (serviceData) => {
    try {
  const response = await apiClient.post('/services', serviceData);
  return withAuditFields(response.data);
    } catch (error) {
      console.error('Error creating service:', error);
      throw error;
    }
  },
  // Update an existing service
  updateService: async (id, serviceData) => {
    try {
  const response = await apiClient.put(`/services/${id}`, serviceData);
  return withAuditFields(response.data);
    } catch (error) {
      console.error(`Error updating service with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete a service
  deleteService: async (id) => {
    try {
  const response = await apiClient.delete(`/services/${id}`);
  return response.data;
    } catch (error) {
      console.error(`Error deleting service with ID ${id}:`, error);
      throw error;
    }
  },  // Get service categories (full category objects)
  getServiceCategories: async () => {
    try {
      const response = await apiClient.get('/services/categories');
      // Return array of category names for compatibility with existing code
      return response.data.map(category => category.name.toLowerCase());
    } catch (error) {
      console.error('Error fetching service categories:', error);
      // Fallback to the old endpoint if the new one fails
      try {
        const fallbackResponse = await apiClient.get('/services/categories/list');
        return fallbackResponse.data;
      } catch (fallbackError) {
        console.error('Error fetching service categories (fallback):', fallbackError);
        throw fallbackError;
      }
    }
  },

  // Get full service categories (objects with name, type, description, etc.)
  getFullServiceCategories: async () => {
    try {
      const response = await apiClient.get('/services/categories');
      return response.data;
    } catch (error) {
      console.error('Error fetching full service categories:', error);
      throw error;
    }
  },
  
  // Upload service image
  uploadServiceImage: async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      const response = await apiClient.post('/upload/service-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error uploading service image:', error);
      throw error;
    }  }
};
