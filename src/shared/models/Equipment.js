import axios from '../services/auth/apiClient';

class Equipment {
  constructor(data = {}) {
    this.id = data.id || null;
    this.type = data.type || ''; // kite, board, harness, wetsuit, etc.
    this.name = data.name || '';
    this.brand = data.brand || '';
    this.model = data.model || '';
    this.size = data.size || '';
    this.year = data.year || new Date().getFullYear();
    this.specifications = data.specifications || {
      skill_level: 'beginner', // beginner, intermediate, advanced
      wind_range: {
        min: 0,
        max: 0
      },
      weight_range: {
        min: 0,
        max: 0
      }
    };
    this.condition = data.condition || 'new'; // new, good, fair, poor
    this.status = data.status || 'available'; // available, rented, maintenance, retired
    this.maintenanceHistory = data.maintenanceHistory || [];
    this.rentalHistory = data.rentalHistory || [];
    this.pricing = data.pricing || {
      hourly: 0,
      daily: 0,
      weekly: 0,
      deposit: 0
    };
    this.location = data.location || '';
    this.notes = data.notes || '';
    this.purchaseDate = data.purchaseDate || null;
    this.purchasePrice = data.purchasePrice || 0;
    this.serialNumber = data.serialNumber || '';
    this.lastInspection = data.lastInspection || null;
    this.nextInspection = data.nextInspection || null;
  }

  // Validate equipment data
  validate() {
    const errors = {};

    if (!this.type) errors.type = 'Equipment type is required';
    if (!this.name) errors.name = 'Equipment name is required';
    if (!this.brand) errors.brand = 'Brand is required';
    if (!this.size) errors.size = 'Size is required';

    // Validate pricing
    if (this.pricing.hourly < 0) errors.hourlyPrice = 'Hourly price cannot be negative';
    if (this.pricing.daily < 0) errors.dailyPrice = 'Daily price cannot be negative';
    if (this.pricing.deposit < 0) errors.deposit = 'Deposit cannot be negative';

    // Validate specifications
    if (this.specifications.wind_range.min < 0) {
      errors.minWindRange = 'Minimum wind range cannot be negative';
    }
    if (this.specifications.wind_range.max <= this.specifications.wind_range.min) {
      errors.maxWindRange = 'Maximum wind range must be greater than minimum';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  // CRUD Operations
  static async create(equipmentData) {
    try {
      const equipment = new Equipment(equipmentData);
      const validation = equipment.validate();
      
      if (!validation.isValid) {
        throw new Error('Invalid equipment data: ' + JSON.stringify(validation.errors));
      }

      const response = await axios.post('/api/equipment', equipment);
      return new Equipment(response.data);
    } catch (error) {
      throw new Error(`Failed to create equipment: ${error.message}`);
    }
  }

  static async getById(id) {
    try {
      const response = await axios.get(`/api/equipment/${id}`);
      return new Equipment(response.data);
    } catch (error) {
      throw new Error(`Failed to fetch equipment: ${error.message}`);
    }
  }

  static async update(id, equipmentData) {
    try {
      const equipment = new Equipment(equipmentData);
      const validation = equipment.validate();
      
      if (!validation.isValid) {
        throw new Error('Invalid equipment data: ' + JSON.stringify(validation.errors));
      }

      const response = await axios.put(`/api/equipment/${id}`, equipment);
      return new Equipment(response.data);
    } catch (error) {
      throw new Error(`Failed to update equipment: ${error.message}`);
    }
  }

  static async delete(id) {
    try {
      await axios.delete(`/api/equipment/${id}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete equipment: ${error.message}`);
    }
  }

  // Equipment Availability
  static async checkAvailability(equipmentId, startDate, endDate) {
    try {
      const response = await axios.get(`/api/equipment/${equipmentId}/availability`, {
        params: { startDate, endDate }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to check equipment availability: ${error.message}`);
    }
  }

  // Maintenance Operations
  static async recordMaintenance(id, maintenanceData) {
    try {
      const response = await axios.post(`/api/equipment/${id}/maintenance`, maintenanceData);
      return new Equipment(response.data);
    } catch (error) {
      throw new Error(`Failed to record maintenance: ${error.message}`);
    }
  }

  static async getMaintenanceHistory(id) {
    try {
      const response = await axios.get(`/api/equipment/${id}/maintenance`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch maintenance history: ${error.message}`);
    }
  }

  // Rental Operations
  static async startRental(id, rentalData) {
    try {
      const response = await axios.post(`/api/equipment/${id}/rentals`, rentalData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to start rental: ${error.message}`);
    }
  }

  static async endRental(id, rentalId, returnData) {
    try {
      const response = await axios.put(`/api/equipment/${id}/rentals/${rentalId}`, returnData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to end rental: ${error.message}`);
    }
  }

  static async getRentalHistory(id) {
    try {
      const response = await axios.get(`/api/equipment/${id}/rentals`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch rental history: ${error.message}`);
    }
  }

  // Equipment Search and Filtering
  static async search(params) {    try {
      const response = await axios.get('/api/equipment/search', { params });
      return response.data.map(item => new Equipment(item));
    } catch (error) {
      throw new Error(`Failed to search equipment: ${error.message}`);
    }
  }

  // Equipment Statistics
  static async getStatistics(id) {
    try {
      const response = await axios.get(`/api/equipment/${id}/statistics`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch equipment statistics: ${error.message}`);
    }
  }
}

