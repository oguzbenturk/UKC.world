import axios from '../services/auth/apiClient';

class Customer {
  constructor(data = {}) {
    this.id = data.id || null;
    this.firstName = data.firstName || '';
    this.lastName = data.lastName || '';
    this.email = data.email || '';
    this.phone = data.phone || '';
    this.address = data.address || '';
    this.skillLevel = data.skillLevel || 'beginner';
    this.certifications = data.certifications || [];
    this.preferences = data.preferences || {
      equipment: [],
      lessonTypes: [],
      preferredInstructors: []
    };
    this.emergencyContact = data.emergencyContact || {
      name: '',
      phone: '',
      relationship: ''
    };
    this.notes = data.notes || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // Validate customer data
  validate() {
    const errors = {};
    
    if (!this.firstName) errors.firstName = 'First name is required';
    if (!this.lastName) errors.lastName = 'Last name is required';
    if (!this.email) errors.email = 'Email is required';
    if (!this.phone) errors.phone = 'Phone number is required';
    
    // Email format validation
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (this.email && !emailRegex.test(this.email)) {
      errors.email = 'Invalid email format';
    }

    // Phone format validation (basic)
    const phoneRegex = /^\+?[\d\s-]{10,}$/;
    if (this.phone && !phoneRegex.test(this.phone)) {
      errors.phone = 'Invalid phone number format';
    }

    // Skill level validation
    const validSkillLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
    if (!validSkillLevels.includes(this.skillLevel)) {
      errors.skillLevel = 'Invalid skill level';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  // CRUD Operations
  static async create(customerData) {
    try {
      const customer = new Customer(customerData);
      const validation = customer.validate();
      
      if (!validation.isValid) {
        throw new Error('Invalid customer data: ' + JSON.stringify(validation.errors));
      }

      const response = await axios.post('/api/customers', customer);
      return new Customer(response.data);
    } catch (error) {
      throw new Error(`Failed to create customer: ${error.message}`);
    }
  }

  static async getById(id) {
    try {
      const response = await axios.get(`/api/customers/${id}`);
      return new Customer(response.data);
    } catch (error) {
      throw new Error(`Failed to fetch customer: ${error.message}`);
    }
  }

  static async update(id, customerData) {
    try {
      const customer = new Customer(customerData);
      const validation = customer.validate();
      
      if (!validation.isValid) {
        throw new Error('Invalid customer data: ' + JSON.stringify(validation.errors));
      }

      const response = await axios.put(`/api/customers/${id}`, customer);
      return new Customer(response.data);
    } catch (error) {
      throw new Error(`Failed to update customer: ${error.message}`);
    }
  }

  static async delete(id) {
    try {
      await axios.delete(`/api/customers/${id}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete customer: ${error.message}`);
    }
  }

  // Get customer rental history
  static async getRentalHistory(id) {
    try {
      const response = await axios.get(`/api/customers/${id}/rentals`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch rental history: ${error.message}`);
    }
  }

  // Get customer lesson history
  static async getLessonHistory(id) {
    try {
      const response = await axios.get(`/api/customers/${id}/lessons`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch lesson history: ${error.message}`);
    }
  }

  // Update customer skill level
  static async updateSkillLevel(id, skillLevel, certifications = []) {
    try {
      const response = await axios.patch(`/api/customers/${id}/skill-level`, {
        skillLevel,
        certifications
      });
      return new Customer(response.data);
    } catch (error) {
      throw new Error(`Failed to update skill level: ${error.message}`);
    }
  }

  // Update customer preferences
  static async updatePreferences(id, preferences) {
    try {
      const response = await axios.patch(`/api/customers/${id}/preferences`, preferences);
      return new Customer(response.data);
    } catch (error) {
      throw new Error(`Failed to update preferences: ${error.message}`);
    }
  }

  // Get customer statistics
  static async getStatistics(id) {
    try {
      const response = await axios.get(`/api/customers/${id}/statistics`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch customer statistics: ${error.message}`);
    }
  }

  // Search customers
  static async search(query) {
    try {
      const response = await axios.get('/api/customers/search', {
        params: { q: query }
      });
      return response.data.map(customer => new Customer(customer));
    } catch (error) {
      throw new Error(`Failed to search customers: ${error.message}`);
    }
  }
}

export default Customer;
