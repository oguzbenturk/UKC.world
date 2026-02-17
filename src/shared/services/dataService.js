// src/services/dataService.js
import apiClient from './apiClient';

// Lightweight debug helper gated by localStorage flag to appease linters
function dbg(...args) {
  try {
    if (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('DEBUG_DATA') === '1') {
      // eslint-disable-next-line no-console
      console.log('[DataService]', ...args);
    }
  } catch {
    // ignore
  }
}
import { retryApiCall } from '../utils/retryUtils';
import { extractAuditFields } from '../utils/auditTransforms';

function normalizeBooking(booking) {
  const dateSource = booking.formatted_date || booking.date;
  let dateStr = undefined;
  if (dateSource) {
    if (typeof dateSource === 'string') {
      dateStr = dateSource.includes('T') ? dateSource.split('T')[0] : dateSource;
    } else if (dateSource instanceof Date) {
      dateStr = dateSource.toISOString().split('T')[0];
    } else {
      try {
        dateStr = String(dateSource);
      } catch {
        dateStr = booking.date;
      }
    }
  }
  const startTime = booking.startTime ?? booking.start_time ?? null;
  const endTime = booking.endTime ?? booking.end_time ?? null;
  const auditFields = extractAuditFields(booking);
  return {
    ...booking,
    date: dateStr || booking.date,
    formatted_date: dateStr || booking.formatted_date || booking.date,
    startTime,
    endTime,
    start_time: startTime,
    end_time: endTime,
    ...auditFields,
  };
}

const toLowerSafe = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

const TRANSACTION_CATEGORY_FALLBACK = 'other';

const deriveTransactionCategory = (type, entityType) => {
  const normalizedEntity = toLowerSafe(entityType);
  const normalizedType = toLowerSafe(type);

  if (['lesson', 'booking', 'class'].includes(normalizedEntity)) {
    return 'lesson';
  }

  if (normalizedEntity === 'rental' || normalizedType.includes('rental')) {
    return 'rental';
  }

  if (normalizedEntity === 'package' || normalizedType.includes('package')) {
    return 'package';
  }

  if (normalizedType.includes('refund')) {
    return 'refund';
  }

  if (normalizedType.includes('credit')) {
    return 'credit';
  }

  if (normalizedType.includes('charge') || normalizedType.includes('debit')) {
    return 'charge';
  }

  if (normalizedType.includes('payment') || normalizedEntity === 'service') {
    return 'payment';
  }

  if (normalizedEntity) {
    return normalizedEntity;
  }

  if (normalizedType) {
    return normalizedType;
  }

  return TRANSACTION_CATEGORY_FALLBACK;
};

const toNumberSafe = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pickFirstDefined = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }
  return null;
};

const normalizeTransactionRecord = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const sourceType = pickFirstDefined(raw.type);
  const entityType = pickFirstDefined(raw.entity_type, raw.entityType);
  const category = deriveTransactionCategory(sourceType, entityType);
  const transactionDate = pickFirstDefined(
    raw.transaction_date,
    raw.transactionDate,
    raw.created_at,
    raw.createdAt
  );
  const referenceNumber = pickFirstDefined(raw.reference_number, raw.reference);
  const createdById = pickFirstDefined(raw.created_by, raw.createdBy);
  const createdByName = pickFirstDefined(raw.created_by_name, raw.createdByName);
  const userId = pickFirstDefined(raw.user_id, raw.userId);
  const paymentMethod = pickFirstDefined(raw.payment_method, raw.paymentMethod);
  const bookingId = pickFirstDefined(raw.booking_id, raw.bookingId);
  const rentalId = pickFirstDefined(raw.rental_id, raw.rentalId);
  const currency = pickFirstDefined(raw.currency, 'EUR');
  const status = pickFirstDefined(raw.status, 'completed');
  const createdAt = pickFirstDefined(raw.created_at, raw.createdAt);
  const updatedAt = pickFirstDefined(raw.updated_at, raw.updatedAt);

  return {
    id: raw.id,
    userId,
    amount: toNumberSafe(raw.amount, 0),
    type: sourceType || category || TRANSACTION_CATEGORY_FALLBACK,
    category,
    description: raw.description || '',
    paymentMethod,
    reference: referenceNumber,
    bookingId,
    rentalId,
    date: transactionDate,
    transactionDate,
    currency,
    entityType,
    status,
    createdBy: createdById,
    createdByName,
    createdAt,
    updatedAt,
    raw,
  };
};

const normalizeCascadePackageEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return undefined;
  }

  const normalized = new Map();

  entries.filter(Boolean).forEach((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      const key = String(entry);
      if (!normalized.has(key)) {
        normalized.set(key, key);
      }
      return;
    }

    if (entry && typeof entry === 'object') {
      const packageId = entry.id || entry.packageId || entry.package_id;
      if (!packageId) {
        return;
      }

      const payload = { id: packageId };
      if (entry.strategy && typeof entry.strategy === 'string') {
        payload.strategy = entry.strategy;
      }
      if (typeof entry.allowNegative === 'boolean') {
        payload.allowNegative = entry.allowNegative;
      }

      normalized.set(packageId, payload);
    }
  });

  if (normalized.size === 0) {
    return undefined;
  }

  return Array.from(normalized.values());
};

async function _fetchBookingsViaProxy(studentId, debugEnabled) {
  const token = (typeof window !== 'undefined') ? localStorage.getItem('token') : null;
  const url = `/api/bookings?student_id=${encodeURIComponent(studentId)}&_ts=${Date.now()}${debugEnabled ? '&_debug=1' : ''}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    dbg('fetch fallback failed', res.status, res.statusText);
    return [];
  }
  const json = await res.json();
  if (!Array.isArray(json)) {
    dbg('fetch fallback returned non-array payload');
    return [];
  }
  dbg(`← /bookings (fetch fallback) returned ${json.length} bookings`);
  return json.map(normalizeBooking);
}

/**
 * Data service that provides access to backend PostgreSQL data via REST API.
 * Replaces Firebase/Supabase functionality.
 */
class DataService {
  // === Users & Authentication ===
  
  /**
   * Login with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} - User data and token
   */
  static async login(email, password) {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      
      // Store token in localStorage
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
  dbg('Login failed:', error?.message || error);
      throw error;
    }
  }
  
  /**
   * Logout current user
   */
  static logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
  
  /**
   * Get current authenticated user
   * @returns {Object|null} - User data or null if not authenticated
   */
  static getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  // === Dashboard ===

  /**
   * Fetch aggregated dashboard summary metrics
   * @param {{ startDate?: string, endDate?: string }} params
   * @returns {Promise<Object>}
   */
  static async getDashboardSummary(params = {}) {
    try {
      const response = await apiClient.get('/dashboard/summary', { params });
      return response.data;
    } catch (error) {
      dbg('Error getting dashboard summary:', error?.message || error);
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object>} - User data
   */
  static async getUserById(id) {
    try {
      // If 'new' is passed as id, we're in the new user workflow
      if (id === 'new') { // This check might be more relevant for forms
        return null;
      }
      const response = await apiClient.get(`/users/${id}`);
      return response.data;
    } catch (error) {
  dbg(`Error getting user ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Get all roles
   * @returns {Promise<Array>} - Array of roles
   */
  static async getRoles() {
    try {
      const response = await apiClient.get('/roles'); // Assuming an endpoint /roles
      return response.data;
    } catch (error) {
  dbg('Error getting roles:', error?.message || error);
      throw error;
    }
  }
  
  /**
   * Create a new user
   * @param {Object} userData - User data to create
   * @returns {Promise<Object>} - Created user data
   */
  static async createUser(userData) {
    try {
      const response = await apiClient.post('/users', userData);
      return response.data;
    } catch (error) {
      // Check for specific error types
      if (error.response && error.response.status === 409) {
        // 409 Conflict - Email already exists
        throw new Error('This email address is already registered. Please use a different email.');
      } else {
        // Default error message for other types of errors
        throw error;
      }
    }
  }
  
  /**
   * Update a user by ID
   * @param {string} id - User ID
   * @param {Object} userData - Updated user data
   * @returns {Promise<Object>} - Updated user data
   */
  static async updateUser(id, userData) {
    try {
      const response = await apiClient.put(`/users/${id}`, userData);
      return response.data;
    } catch (error) {
  dbg(`Error updating user ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  // === Bookings ===
    /**
   * Get all bookings
   * @param {Object} filters - Optional filter parameters
   * @returns {Promise<Array>} - Array of bookings
   */
  static async getBookings(filters = {}) {
    try {      
      // Get bookings with optional filters (no cache busting needed since backend cache is removed)
      const params = { 
        ...filters
      };
      
      // Get bookings with optional filters
      const response = await apiClient.get('/bookings', { params });
      
      // Show detailed information about the raw bookings
      if (Array.isArray(response.data) && response.data.length > 0) {
        // Raw booking data available
        
        // Check if we have date fields
  const _dateFields = response.data.map(booking => ({ 
          date: booking.date,
          formatted_date: booking.formatted_date,
          raw_date_type: booking.date ? typeof booking.date : 'undefined' 
        }));
        // Date fields analyzed
      }
      
      // Normalize date format to YYYY-MM-DD
      if (Array.isArray(response.data)) {
        const normalizedData = response.data.map(booking => {
          // Check if date is available either directly or in formatted_date field from backend
          const dateSource = booking.formatted_date || booking.date;
          let dateStr = null;
          
          if (dateSource) {
            // If date is a string with time component, extract just the date part
            if (typeof dateSource === 'string') {
              dateStr = dateSource.includes('T') ? dateSource.split('T')[0] : dateSource;
              // Converting string date to normalized format
            } else if (dateSource instanceof Date) {
              dateStr = dateSource.toISOString().split('T')[0];
              // Converting Date object to string
            } else {
              dateStr = String(dateSource);
              // Converting unknown date type to string
            }
                
            const normalizedBooking = { 
              ...booking, 
              date: dateStr,
              // Keep formatted_date as a backup
              formatted_date: dateStr 
            };

            return normalizedBooking;
          }
          return booking;
        });
        // Normalized ${normalizedData.length} bookings
        if (normalizedData.length > 0) {
          /* // Sample booking available - Commenting out problematic block
            id: normalizedData[0].id,
            date: normalizedData[0].date,
            instructor: normalizedData[0].instructor_name,
            student: normalizedData[0].student_name
          });
          */
          
          // All normalized dates processed
          const _allDates = normalizedData.map(b => b.date).filter(Boolean);
          // ${allDates.length} booking dates available
        }
        
        return normalizedData.map((item) => normalizeBooking(item));
      }
      
      return (Array.isArray(response.data) ? response.data : []).map((item) => normalizeBooking(item));
    } catch (error) {
  dbg('Error getting bookings:', error?.message || error);
      throw error;
    }
  }
  
  /**
   * Get booking by ID
   * @param {string} id - Booking ID
   * @returns {Promise<Object>} - Booking data
   */
  static async getBooking(id) {
    try {
      const response = await apiClient.get(`/bookings/${id}`);
      return response.data;
    } catch (error) {
  dbg(`Error getting booking ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  /**
   * Create new booking
   * @param {Object} bookingData - Booking data
   * @returns {Promise<Object>} - Created booking
   */
  static async createBooking(bookingData) {
    try {
      const response = await apiClient.post('/bookings', bookingData);
      return response.data;
    } catch (error) {
  dbg('Error creating booking:', error?.message || error);
      throw error;
    }
  }
  
  /**
   * Update booking
   * @param {string} id - Booking ID
   * @param {Object} bookingData - Updated booking data
   * @returns {Promise<Object>} - Updated booking
   */
  static async updateBooking(id, bookingData) {
    try {
      const response = await apiClient.put(`/bookings/${id}`, bookingData);
      return response.data;
    } catch (error) {
  dbg(`Error updating booking ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  /**
   * Delete booking
   * @param {string} id - Booking ID
   * @returns {Promise<Object>} - Response message
   */
  static async deleteBooking(id) {
    try {
      const response = await apiClient.delete(`/bookings/${id}`); // Corrected path from /api/bookings to /bookings
      return response.data;
    } catch (error) {
  dbg(`Error deleting booking ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Bulk delete bookings with auto-reconciliation
   * @param {Array<string>} ids
   * @param {string} reason
   * @returns {Promise<{deleted: string[], failed: Array, undoToken: string, undoExpiresAt: string}>}
   */
  static async bulkDeleteBookings(ids, reason = 'Bulk deletion from UI') {
    try {
      const response = await apiClient.post('/bookings/bulk-delete', { ids, reason });
      return response.data;
    } catch (error) {
  dbg('Error bulk deleting bookings:', error?.message || error);
      throw error;
    }
  }

  /**
   * Undo a recent bulk delete using an undo token
   * @param {string} token
   * @returns {Promise<{restored: string[]}>}
   */
  static async undoDeleteBookings(token) {
    try {
      const response = await apiClient.post('/bookings/undo-delete', { token });
      return response.data;
    } catch (error) {
  dbg('Error undoing delete:', error?.message || error);
      throw error;
    }
  }

  /**
   * Restore the most recently soft-deleted booking
   */
  static async restoreLatestBooking() {
    try {
      const response = await apiClient.post('/bookings/restore-latest');
      return response.data;
    } catch (error) {
  dbg('Error restoring latest booking:', error?.message || error);
      throw error;
    }
  }

  /**
   * Restore a soft-deleted booking by id
   */
  static async restoreBookingById(id) {
    try {
      const response = await apiClient.post(`/bookings/${id}/restore`);
      return response.data;
    } catch (error) {
  dbg(`Error restoring booking ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  /**
   * Get lessons for a specific student
   * @param {string} id - Student ID
   * @returns {Promise<Array>} - Array of lessons/bookings
   */
  static async getLessonsByUserId(id) {
    try {
      dbg(`→ GET /bookings?student_id=${id}`);
      const debugEnabled = (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('DEBUG_DATA') === '1');
      const { data } = await apiClient.get('/bookings', { params: { student_id: id, _ts: Date.now(), ...(debugEnabled ? { _debug: '1' } : {}) } });
      if (Array.isArray(data)) {
        dbg(`← /bookings returned ${data.length} bookings`);
        return data.map(normalizeBooking);
      }
      return await _fetchBookingsViaProxy(id, debugEnabled);
    } catch (error) {
  const status = error?.response?.status;
  const body = error?.response?.data;
  dbg(`Error fetching lessons for student ${id}:`, { status, body, message: error.message });
      // Fallback on error as well using proxy fetch
      const debugEnabled2 = (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('DEBUG_DATA') === '1');
      return await _fetchBookingsViaProxy(id, debugEnabled2);
    }
  }
    /**
   * Get rentals for a specific user
   * @param {string} id - User ID
   * @returns {Promise<Array>} - Array of rentals
   */
  static async getRentalsByUserId(id) {
    try {
      // Debug: log outgoing request
  dbg(`→ GET /rentals/user/${id}`);
      const response = await apiClient.get(`/rentals/user/${id}`);
      // Debug: log response size and sample
      if (Array.isArray(response.data)) {
        dbg(`← /rentals/user/${id} returned ${response.data.length} rentals`);
        if (response.data.length > 0) {
          dbg('sample rental:', response.data[0]);
        }
      } else {
        dbg(`← /rentals/user/${id} returned non-array payload`);
      }
      return response.data;
    } catch (error){
  const status = error?.response?.status;
  const body = error?.response?.data;
  dbg(`Error fetching rentals for user ${id}:`, { status, body, message: error.message });
      throw error;
    }
  }

  /**
   * Get active rentals (manager/admin scope)
   * @returns {Promise<Array>} - Array of active rentals
   */
  static async getActiveRentals() {
    try {
      const response = await apiClient.get('/rentals/active');
      return response.data;
    } catch (error) {
  dbg('Error fetching active rentals:', error?.message || error);
      throw error;
    }
  }

  /**
   * Get recent transactions with optional filters
   * @param {Object} params - Query parameters (limit, type, etc.)
   * @returns {Promise<Array>} - Array of transactions
   */
  static async getTransactions(params = {}) {
    try {
      const response = await apiClient.get('/finances/transactions', { params });
      if (!Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .map((row) => normalizeTransactionRecord(row))
        .filter((record) => record !== null)
        .map((record) => ({
          ...record,
          category: record.category || TRANSACTION_CATEGORY_FALLBACK,
        }));
    } catch (error) {
  dbg('Error fetching transactions:', error?.message || error);
      throw error;
    }
  }

  // === Equipment ===
  
  /**
   * Get all equipment
   * @param {Object} filters - Optional filter parameters
   * @returns {Promise<Array>} - Array of equipment
   */  static async getEquipment(filters = {}) {
    try {
      const response = await retryApiCall(() => apiClient.get('/equipment', { params: filters }));
      return response.data;
    } catch (error) {
  dbg('Error getting equipment:', error?.message || error);
      throw error;
    }
  }
  
  /**
   * Get equipment by ID
   * @param {string} id - Equipment ID
   * @returns {Promise<Object>} - Equipment data
   */
  static async getEquipmentById(id) {
    try {
      const response = await apiClient.get(`/equipment/${id}`);
      return response.data;
    } catch (error) {
  dbg(`Error getting equipment ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  /**
   * Create new equipment
   * @param {Object} equipmentData - Equipment data
   * @returns {Promise<Object>} - Created equipment
   */
  static async createEquipment(equipmentData) {
    try {
      const response = await apiClient.post('/equipment', equipmentData);
      return response.data;
    } catch (error) {
  dbg('Error creating equipment:', error?.message || error);
      throw error;
    }
  }
  
  /**
   * Update equipment
   * @param {string} id - Equipment ID
   * @param {Object} equipmentData - Updated equipment data
   * @returns {Promise<Object>} - Updated equipment
   */
  static async updateEquipment(id, equipmentData) {
    try {
      const response = await apiClient.put(`/equipment/${id}`, equipmentData);
      return response.data;
    } catch (error) {
  dbg(`Error updating equipment ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  /**
   * Delete equipment
   * @param {string} id - Equipment ID
   * @returns {Promise<Object>} - Response message
   */
  static async deleteEquipment(id) {
    try {
      const response = await apiClient.delete(`/equipment/${id}`);
      return response.data;
    } catch (error) {
  dbg(`Error deleting equipment ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  // === Instructors (based on users with instructor role) ===
  
  /**
   * Get all instructors
   * @returns {Promise<Array>} - Array of instructors
   */  static async getInstructors() {
    try {
      const response = await retryApiCall(() => apiClient.get('/instructors'));
      return response.data;
    } catch (error) {
  dbg('Error getting instructors:', error?.message || error);
      throw error;
    }
  }
  
  /**
   * Get instructor by ID
   * @param {string} id - Instructor ID
   * @returns {Promise<Object>} - Instructor data
   */
  static async getInstructorById(id) {
    try {
      const response = await apiClient.get(`/instructors/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
  /**
   * Create a new instructor
   * @param {Object} instructorData - Instructor data to create
   * @returns {Promise<Object>} - Created instructor data
   */
  static async createInstructor(instructorData) {
    try {
      // The role_id should be provided in instructorData from InstructorFormPage.jsx
      // We'll just pass the instructorData as is to the API
      
      // Create the user with instructor role through the users endpoint
      const response = await apiClient.post('/users', instructorData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
    // === Users with student role ===
    /**
   * Get all users regardless of role
   * @returns {Promise<Array>} - Array of all users
   */
  static async getAllUsers() {
    try {
      const response = await retryApiCall(() => apiClient.get('/users/for-booking'));
      return response.data;
    } catch (error) {
  dbg('Error getting all users:', error?.message || error);
      throw error;
    }
  }

  /**
   * Get all users with student role
   * @returns {Promise<Array>} - Array of users
   */  static async getUsersWithStudentRole() {
    try {
      const response = await retryApiCall(() => apiClient.get('/users/students'));
      return response.data;
    } catch (error) {
  dbg('Error getting users with student role:', error?.message || error);
      throw error;
    }
  }/**
   * Get user with student role by ID
   * @param {string} id - User ID
   * @returns {Promise<Object>} - User data
   */
  static async getUserWithStudentRoleById(id) {
    try {
      const response = await apiClient.get(`/users/${id}/student-details`);
      return response.data;
    } catch (error) {
  dbg(`Error getting user with student role ${id}:`, error?.message || error);
      throw error;
    }
  }
    /**
   * Import users with student role via CSV data
   * @param {Object} payload - Contains csvData string
   * @returns {Promise<Object>} - Import summary
   */
  static async importUsersWithStudentRole(payload) {
    try {
      const response = await apiClient.post('/users/import-students', payload);
      return response.data;
    } catch (error) {
  dbg('Error importing users with student role:', error?.message || error);
      throw error;
    }
  }
    /**
   * Delete a user by ID
   * @param {string} id - User ID
   * @param {Object} options - Delete options
   * @param {boolean} options.force - Force delete even with related data
   * @param {boolean} options.deleteAllData - Delete all user data before deleting user
   * @returns {Promise<Object>} - Deletion result
   */
  static async deleteUser(id, options = {}) {
    try {
      const params = {};
      if (options.force) {
        params.force = true;
      }
      if (options.deleteAllData) {
        params.deleteAllData = true;
      }
      const response = await apiClient.delete(`/users/${id}`, { params });
      return response.data;
    } catch (error) {
      dbg('Error deleting user:', error?.message || error);
      throw error;
    }
  }

  /**
   * Get user related data summary (for deletion preview)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Related data summary with counts and samples
   */
  static async getUserRelatedData(userId) {
    try {
      const response = await apiClient.get(`/users/${userId}/related-data`);
      return response.data;
    } catch (error) {
      dbg('Error fetching user related data:', error?.message || error);
      throw error;
    }
  }
    /**
   * Create a new user with student role
   * @param {Object} userData - User data to create
   * @returns {Promise<Object>} - Created user data
   */
static async createUserWithStudentRole(userData) {
  try {
    // Get the student role ID (use the correct UUID from backend constants)
    const studentRoleId = 'b8073752-02c0-40d6-8cba-24bb7dc95e23'; // Student role ID      // Prepare user data with the role ID
      const userDataWithRole = {
        ...userData,
        role_id: studentRoleId,
        // Generate a temporary password (should be changed later)
        password: 'changeme123' 
      };
      
      // Create the user with student role
      const response = await apiClient.post('/users', userDataWithRole);
      return response.data;
    } catch (error) {
  dbg('Error creating user with student role:', error?.message || error);      throw error;
    }
  }

  /**
   * Update a user by ID
   * @param {string} id - User ID
   * @param {Object} userData - Updated user data
   * @returns {Promise<Object>} - Updated user data
   */
  static async updateUserById(id, userData) {
    try {
      const response = await apiClient.put(`/users/${id}`, userData);
      return response.data;
    } catch (error) {
  dbg(`Error updating user ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  // === Individual Record Operations ===
  
  /**
   * Get individual rental by ID
   * @param {string} id - Rental ID
   * @returns {Promise<Object>} - Rental data
   */
  static async getRental(id) {
    try {
      const response = await apiClient.get(`/rentals/${id}`);
      return response.data;
    } catch (error) {
  dbg(`Error fetching rental ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Update rental
   * @param {string} id - Rental ID
   * @param {Object} data - Updated rental data
   * @returns {Promise<Object>} - Updated rental data
   */
  static async updateRental(id, data) {
    try {
      const response = await apiClient.put(`/rentals/${id}`, data);
      return response.data;
    } catch (error) {
  dbg(`Error updating rental ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Delete rental
   * @param {string} id - Rental ID
   * @returns {Promise<Object>} - Response message
   */
  static async deleteRental(id) {
    try {
      const response = await apiClient.delete(`/rentals/${id}`);
      return response.data;
    } catch (error) {
  dbg(`Error deleting rental ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Update booking
   * @param {string} id - Booking ID
   * @param {Object} data - Updated booking data
   * @returns {Promise<Object>} - Updated booking data
   */
  static async updateBooking(id, data) {
    try {
      const response = await apiClient.put(`/bookings/${id}`, data);
      return response.data;
    } catch (error) {
  dbg(`Error updating booking ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Atomically swap two bookings within a single transaction
   * @param {string} aId - First booking ID
   * @param {string} bId - Second booking ID
   * @param {{ instructor_user_id?: string, instructorId?: string, start_hour: number }} aTarget - Target for A
   * @param {{ instructor_user_id?: string, instructorId?: string, start_hour: number }} bTarget - Target for B
   * @param {string} [date] - Optional date override (YYYY-MM-DD)
   */
  static async swapBookings(aId, bId, aTarget, bTarget, date) {
    try {
      const payload = {
        a_id: aId,
        b_id: bId,
        a: aTarget,
        b: bTarget,
        ...(date ? { date } : {}),
      };
      const response = await apiClient.post('/bookings/swap', payload);
      return response.data;
    } catch (error) {
      dbg('swapBookings error', error?.response?.status, error?.response?.data || error?.message);
      throw error;
    }
  }

  static async swapBookingsWithParking(aId, bId, aTarget, bTarget, date) {
    try {
      const payload = {
        a_id: aId,
        b_id: bId,
        a: aTarget,
        b: bTarget,
        ...(date ? { date } : {}),
      };
      const response = await apiClient.post('/bookings/swap-with-parking', payload);
      return response.data;
    } catch (error) {
      dbg('swapBookingsWithParking error', error?.response?.status, error?.response?.data || error?.message);
      throw error;
    }
  }

  /**
   * Unified swap endpoint: tries direct swap first, then parking fallback, server-side
   */
  static async swapBookingsAuto(aId, bId, aTarget, bTarget, date) {
    try {
      const payload = {
        a_id: aId,
        b_id: bId,
        a: aTarget,
        b: bTarget,
        ...(date ? { date } : {}),
      };
      const response = await apiClient.post('/bookings/swap-auto', payload);
      return response.data; // { a, b, mode: 'direct'|'parking' }
    } catch (error) {
      dbg('swapBookingsAuto error', error?.response?.status, error?.response?.data || error?.message);
      throw error;
    }
  }

  /**
   * Get all services
   * @param {Object} filters - Filter parameters
   * @returns {Promise<Array>} - Array of services
   */
  static async getServices(filters = {}) {
    try {
      const response = await apiClient.get('/services', { params: filters });
      return response.data;
    } catch (error) {
  dbg('Error fetching services:', error?.message || error);
      throw error;
    }
  }

  /**
   * Get a specific transaction by ID
   * @param {string} id - Transaction ID
   * @returns {Promise<Object>} - Transaction data
   */
  static async getTransaction(id) {
    try {
      const response = await apiClient.get(`/finances/transactions/${id}`);
      return response.data;
    } catch (error) {
  dbg(`Error fetching transaction ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Update a transaction
   * @param {string} id - Transaction ID
   * @param {Object} data - Updated transaction data
   * @returns {Promise<Object>} - Updated transaction data
   */
  static async updateTransaction(id, data) {
    try {
      const response = await apiClient.put(`/finances/transactions/${id}`, data);
      return response.data;
    } catch (error) {
  dbg(`Error updating transaction ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Delete a transaction
   * @param {string} id - Transaction ID
   * @param {Object} options - Delete options
   * @param {boolean} options.force - Force delete even with dependencies
   * @param {boolean} options.hardDelete - Permanently delete without creating reversal transaction
   * @param {string} options.reason - Reason for deletion
   * @param {Object} options.cascade - Cascade deletion options
   * @returns {Promise<Object>} - Deletion result
   */
  static async deleteTransaction(id, options = {}) {
    try {
      const params = {};
      const data = {};

      if (options.force) {
        params.force = true;
      }

      if (options.hardDelete) {
        params.hardDelete = true;
      }

      if (options.reason) {
        data.reason = options.reason;
      }

      if (options.cascade && typeof options.cascade === 'object') {
        const cascadePayload = {};

        const normalizedPackages = normalizeCascadePackageEntries(options.cascade.packages);
        if (normalizedPackages) {
          cascadePayload.packages = normalizedPackages;
        }

        if (Array.isArray(options.cascade.rentals)) {
          cascadePayload.rentals = [...new Set(options.cascade.rentals.filter(Boolean))];
        }

        if (Array.isArray(options.cascade.bookings)) {
          cascadePayload.bookings = [...new Set(options.cascade.bookings.filter(Boolean))];
        }

        if (Object.keys(cascadePayload).length > 0) {
          data.cascade = cascadePayload;
        }
      }

      const response = await apiClient.delete(`/finances/transactions/${id}`, {
        params,
        data: Object.keys(data).length ? data : undefined
      });
      return response.data;
    } catch (error) {
  dbg(`Error deleting transaction ${id}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Reset a user's wallet balance (ADMIN ONLY)
   * Deletes all transactions and sets balance to specified amount
   * @param {string} userId - User ID
   * @param {Object} options - Reset options
   * @param {number} options.targetBalance - Target balance to set (default 0)
   * @param {string} options.reason - Required reason for audit trail
   * @param {string} options.currency - Currency (default EUR)
   * @returns {Promise<Object>} - Reset result
   */
  static async resetWalletBalance(userId, options = {}) {
    try {
      const response = await apiClient.post(`/finances/accounts/${userId}/reset-balance`, {
        targetBalance: options.targetBalance ?? 0,
        reason: options.reason,
        currency: options.currency || 'EUR'
      });
      return response.data;
    } catch (error) {
      dbg(`Error resetting wallet balance for ${userId}:`, error?.message || error);
      throw error;
    }
  }

  // === High-performance customers list ===
  /**
   * Get customers list with keyset pagination and aggregated fields
   * @param {Object} params { q?: string, limit?: number, cursor?: string, balance?: 'all'|'paid'|'package'|'pending' }
   * @returns {Promise<{items: Array, nextCursor: string|null}>}
   */
  static async getCustomersList(params = {}) {
    try {
      const response = await apiClient.get('/users/customers/list', { params });
      return response.data;
    } catch (error) {
  dbg('Error fetching customers list:', error?.message || error);
      throw error;
    }
  }
}

export default DataService;
