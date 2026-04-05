/**
 * Family API Service
 * 
 * Frontend service for family member management
 * Handles CRUD operations for family members
 */

import apiClient from '@/shared/services/apiClient';

const mapError = (error) => {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  return error?.message || 'Unexpected error occurred';
};

const familyApi = {
  /**
   * Get all family members for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of family members
   */
  async getFamilyMembers(userId) {
    try {
      const response = await apiClient.get(`/students/${userId}/family`);
      return response.data?.data || [];
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  /**
   * Get a single family member by ID
   * @param {string} userId - User ID
   * @param {string} memberId - Family member ID
   * @returns {Promise<Object>} - Family member data
   */
  async getFamilyMember(userId, memberId) {
    try {
      const response = await apiClient.get(`/students/${userId}/family/${memberId}`);
      return response.data?.data || null;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  /**
   * Fetch combined activity timeline for a family member
   * @param {string} userId - User ID
  * @param {string} memberId - Family member ID
  * @param {Object} params - Optional query params ({ limit, offset, types, startDate, endDate })
   * @returns {Promise<Object>} - Activity payload with pagination metadata
   */
  async getFamilyMemberActivity(userId, memberId, params = {}) {
    try {
      const query = {};
      if (params.limit !== undefined) {
        query.limit = params.limit;
      }
      if (params.offset !== undefined) {
        query.offset = params.offset;
      }
      if (params.types !== undefined && params.types !== null) {
        query.types = Array.isArray(params.types) ? params.types.join(',') : params.types;
      }
      const toIsoString = (value) => {
        if (!value) {
          return undefined;
        }

        if (typeof value === 'string') {
          return value;
        }

        if (value instanceof Date) {
          return value.toISOString();
        }

        if (typeof value?.toISOString === 'function') {
          return value.toISOString();
        }

        if (typeof value?.toDate === 'function') {
          const dateValue = value.toDate();
          return Number.isNaN(dateValue.getTime()) ? undefined : dateValue.toISOString();
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
      };

      const startDateIso = toIsoString(params.startDate);
      if (startDateIso) {
        query.startDate = startDateIso;
      }

      const endDateIso = toIsoString(params.endDate);
      if (endDateIso) {
        query.endDate = endDateIso;
      }

      const response = await apiClient.get(`/students/${userId}/family/${memberId}/activity`, {
        params: query
      });

      return response.data?.data || {
        items: [],
        total: 0,
        count: 0,
        limit: params.limit ?? null,
        offset: params.offset ?? 0,
        hasMore: false
      };
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  /**
   * Create a new family member
   * @param {string} userId - User ID
   * @param {Object} memberData - Family member data
   * @returns {Promise<Object>} - Created family member
   */
  async createFamilyMember(userId, memberData) {
    try {
      const response = await apiClient.post(`/students/${userId}/family`, memberData);
      return response.data?.data || null;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  /**
   * Update a family member
   * @param {string} userId - User ID
   * @param {string} memberId - Family member ID
   * @param {Object} updates - Updated data
   * @returns {Promise<Object>} - Updated family member
   */
  async updateFamilyMember(userId, memberId, updates) {
    try {
      const response = await apiClient.put(`/students/${userId}/family/${memberId}`, updates);
      return response.data?.data || null;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  /**
   * Delete a family member (soft delete)
   * @param {string} userId - User ID
   * @param {string} memberId - Family member ID
   * @returns {Promise<Object>} - Deletion confirmation
   */
  async deleteFamilyMember(userId, memberId) {
    try {
      const response = await apiClient.delete(`/students/${userId}/family/${memberId}`);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  /**
   * Export family members to CSV
   * @param {string} userId - User ID
   * @returns {Promise<Blob>} - CSV file blob
   */
  async exportFamilyMembers(userId) {
    try {
      const response = await apiClient.get(`/students/${userId}/family/export`, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  /**
   * Calculate age from date of birth
   * @param {string} dateOfBirth - Date string (YYYY-MM-DD)
   * @returns {number} - Age in years
   */
  calculateAge(dateOfBirth) {
    if (!dateOfBirth) return 0;
    
    const birth = new Date(dateOfBirth);
    const today = new Date();
    
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  },

  /**
   * Format date for display
   * @param {string} date - ISO date string
   * @returns {string} - Formatted date
   */
  formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return 'Invalid date';
    
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },

  /**
   * Validate family member data before submission
   * @param {Object} data - Family member data
   * @returns {Object} - { valid: boolean, errors: Array<string> }
   */
  validateFamilyMember(data) {
    const errors = [];

    if (!data.full_name || data.full_name.trim().length < 2) {
      errors.push('Full name must be at least 2 characters');
    }

    if (data.full_name && data.full_name.length > 255) {
      errors.push('Full name must be less than 255 characters');
    }

    // Age validation - only enforce under-18 rule for child-type relationships
    const childRelationships = ['son', 'daughter', 'child', 'sibling'];
    const isChildRelationship = childRelationships.includes(data.relationship);

    if (!data.date_of_birth) {
      errors.push('Date of birth is required');
    } else {
      const age = this.calculateAge(data.date_of_birth);
      if (isChildRelationship && age >= 18) {
        errors.push('This family member must be under 18 years old');
      }
      if (age < 0) {
        errors.push('Date of birth cannot be in the future');
      }
    }

    if (!data.relationship) {
      errors.push('Relationship is required');
    }

    if (data.medical_notes && data.medical_notes.length > 2000) {
      errors.push('Medical notes must be less than 2000 characters');
    }

    if (data.emergency_contact && data.emergency_contact.length > 50) {
      errors.push('Emergency contact must be less than 50 characters');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

export default familyApi;
