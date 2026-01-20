/**
 * UserSettings model for storing user preferences and configurations
 */
class UserSettings {
  /**
   * Create a new UserSettings instance
   * @param {Object} data - The user settings data
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.userId = data.userId || '';
    this.role = data.role || 'student';
    this.displayName = data.displayName || '';
    this.email = data.email || '';
    this.profilePicture = data.profilePicture || '';
    
    // UI preferences
    this.theme = data.theme || 'system'; // system, light, dark
    this.language = data.language || 'en'; // en, es, fr, etc.
    this.notifications = data.notifications || {
      email: true,
      push: true,
      sms: false,
    };
    
    // App settings
    this.defaultView = data.defaultView || 'calendar'; // calendar, list, etc.
    this.calendarSettings = data.calendarSettings || {
      defaultView: 'week',
      startOfWeek: 1, // Monday
      workingHours: {
        start: '09:00',
        end: '17:00',
      },
      showWeekends: true,
    };
    
    // Rental preferences
    this.rentalDefaults = data.rentalDefaults || {
      preferredDuration: 120, // in minutes
      preferredEquipment: [],
      lastRental: null,
    };
    
    // Lesson preferences
    this.lessonPreferences = data.lessonPreferences || {
      preferredInstructors: [],
      skillLevel: 'beginner',
      notes: '',
    };
    
    // Payment information
    this.paymentMethods = data.paymentMethods || [];
    this.defaultPaymentMethod = data.defaultPaymentMethod || null;
    
    // Security settings
    this.requirePasswordForPurchases = data.requirePasswordForPurchases !== undefined 
      ? data.requirePasswordForPurchases 
      : true;
    this.twoFactorAuth = data.twoFactorAuth || {
      enabled: false,
      method: 'none', // none, sms, app, email
    };
    
    // Privacy settings
    this.privacySettings = data.privacySettings || {
      shareProfile: false,
      shareBookingHistory: false,
      allowMarketingEmails: true,
    };
    
    // Last updated
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  /**
   * Validate the user settings data
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];

    if (!this.userId) {
      errors.push('User ID is required');
    }

    const validRoles = ['student', 'instructor', 'manager', 'owner'];
    if (!validRoles.includes(this.role)) {
      errors.push('Invalid user role');
    }

    const validThemes = ['system', 'light', 'dark'];
    if (!validThemes.includes(this.theme)) {
      errors.push('Invalid theme');
    }

    if (this.email && !this.isValidEmail(this.email)) {
      errors.push('Invalid email format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate email format
   * @param {string} email Email address to validate
   * @returns {boolean} Is valid
   */
  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  }

  /**
   * Get full user display name
   * @returns {string} Display name or fallback
   */
  getDisplayName() {
    return this.displayName || this.email || 'User';
  }

  /**
   * Get user avatar URL
   * @returns {string} Avatar URL or default
   */
  getAvatarUrl() {
    return this.profilePicture || 'https://via.placeholder.com/150?text=User';
  }

  /**
   * Convert to a plain object for storage
   * @returns {Object} Plain object
   */
  toJSON() {
    return {
      userId: this.userId,
      role: this.role,
      displayName: this.displayName,
      email: this.email,
      profilePicture: this.profilePicture,
      theme: this.theme,
      language: this.language,
      notifications: this.notifications,
      defaultView: this.defaultView,
      calendarSettings: this.calendarSettings,
      rentalDefaults: this.rentalDefaults,
      lessonPreferences: this.lessonPreferences,
      paymentMethods: this.paymentMethods,
      defaultPaymentMethod: this.defaultPaymentMethod,
      requirePasswordForPurchases: this.requirePasswordForPurchases,
      twoFactorAuth: this.twoFactorAuth,
      privacySettings: this.privacySettings,
      updatedAt: this.updatedAt,
    };
  }
}

export default UserSettings;
