/**
 * Model for instructor earnings
 */
class InstructorEarning {
  /**
   * Constructor
   * @param {Object} data - Instructor earning data
   * @param {string} data.id - Unique ID (optional, set when retrieved from database)
   * @param {string} data.instructorId - Instructor ID
   * @param {string} data.periodStart - Start date of earning period
   * @param {string} data.periodEnd - End date of earning period
   * @param {Array} data.lessons - Lessons included in this earning period
   * @param {number} data.commissionRate - Instructor commission rate (0-1)
   * @param {number} data.totalEarnings - Total earnings amount (calculated)
   * @param {string} data.paymentStatus - Payment status (pending, paid)
   * @param {string} data.paymentDate - Date when payment was processed
   * @param {string} data.currency - Currency code
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.instructorId = data.instructorId || '';
    this.periodStart = data.periodStart || '';
    this.periodEnd = data.periodEnd || '';
    this.lessons = data.lessons || [];
    this.commissionRate = data.commissionRate !== undefined ? data.commissionRate : 0.5;
    this.totalEarnings = data.totalEarnings || 0;
    this.paymentStatus = data.paymentStatus || 'pending';
    this.paymentDate = data.paymentDate || null;
    this.currency = data.currency || 'EUR';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  /**
   * Calculate total earnings based on lessons and commission rate
   * @returns {number} - Total earnings
   */
  calculateTotalEarnings() {
    let total = 0;
    
    this.lessons.forEach(lesson => {
      if (lesson.amount) {
        total += lesson.amount * this.commissionRate;
      }
    });
    
  this.totalEarnings = Math.round(total * 100) / 100;
    return this.totalEarnings;
  }

  /**
   * Add a lesson to the earnings
   * @param {Object} lesson - Lesson to add
   * @param {string} lesson.bookingId - Booking ID
   * @param {string} lesson.date - Lesson date
   * @param {number} lesson.duration - Lesson duration
   * @param {number} lesson.amount - Lesson amount
   */
  addLesson(lesson) {
    if (!lesson.bookingId || !lesson.date || !lesson.amount) {
      throw new Error('Invalid lesson data');
    }
    
    // Check if lesson already exists
    const existingIndex = this.lessons.findIndex(l => l.bookingId === lesson.bookingId);
    if (existingIndex >= 0) {
      // Update existing lesson
      this.lessons[existingIndex] = { ...this.lessons[existingIndex], ...lesson };
    } else {
      // Add new lesson
      this.lessons.push(lesson);
    }
    
    // Recalculate total earnings
    this.calculateTotalEarnings();
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Mark earnings as paid
   */
  markAsPaid() {
    this.paymentStatus = 'paid';
    this.paymentDate = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Validate earning data
   * @returns {Object} - Validation result
   */
  validate() {
    const errors = [];
    
    if (!this.instructorId) {
      errors.push('Instructor ID is required');
    }
    
    if (!this.periodStart || !this.periodEnd) {
      errors.push('Period start and end dates are required');
    }
    
    if (this.periodStart && this.periodEnd) {
      const start = new Date(this.periodStart);
      const end = new Date(this.periodEnd);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push('Invalid period dates');
      } else if (start > end) {
        errors.push('Period start date cannot be after end date');
      }
    }
    
    if (this.commissionRate < 0 || this.commissionRate > 1) {
      errors.push('Commission rate must be between 0 and 1');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to Firebase format
   * @returns {Object} - Object for Firebase
   */
  toFirebase() {
    return {
      instructorId: this.instructorId,
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
      lessons: this.lessons,
      commissionRate: this.commissionRate,
      totalEarnings: this.totalEarnings,
      paymentStatus: this.paymentStatus,
      paymentDate: this.paymentDate,
      currency: this.currency,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Create from Firebase data
   * @param {string} id - Document ID
   * @param {Object} data - Firebase data
   * @returns {InstructorEarning} - InstructorEarning instance
   */
  static fromFirebase(id, data) {
    return new InstructorEarning({
      id,
      instructorId: data.instructorId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      lessons: data.lessons || [],
      commissionRate: data.commissionRate,
      totalEarnings: data.totalEarnings,
      paymentStatus: data.paymentStatus,
      paymentDate: data.paymentDate,
      currency: data.currency,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
  }

  /**
   * Get total lesson hours
   * @returns {number} - Total hours
   */
  getTotalHours() {
    return this.lessons.reduce((total, lesson) => {
      return total + (lesson.duration || 0);
    }, 0);
  }

  /**
   * Get total lessons count
   * @returns {number} - Lessons count
   */
  getLessonsCount() {
    return this.lessons.length;
  }

  /**
   * Get average earning per hour
   * @returns {number} - Average earning per hour
   */
  getAverageEarningPerHour() {
    const totalHours = this.getTotalHours();
    if (totalHours === 0) return 0;
    return this.totalEarnings / totalHours;
  }

  /**
   * Check if earnings have been paid
   * @returns {boolean} - Is paid
   */
  isPaid() {
    return this.paymentStatus === 'paid';
  }

  /**
   * Get formatted payment status
   * @returns {string} - Formatted status
   */
  getFormattedStatus() {
    return this.paymentStatus.charAt(0).toUpperCase() + this.paymentStatus.slice(1);
  }
}

export default InstructorEarning;