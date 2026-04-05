import { weatherService } from '../weatherService';
import { bookingService } from '../bookingService';

class WeatherBookingService {
  constructor() {
    this.weatherCheckInterval = 30 * 60 * 1000; // 30 minutes
    this.autoCheckEnabled = true;
    this.notificationCallbacks = [];
  }

  /**
   * Register callback for weather notifications
   */
  onWeatherNotification(callback) {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Remove notification callback
   */
  removeNotificationCallback(callback) {
    const index = this.notificationCallbacks.indexOf(callback);
    if (index > -1) {
      this.notificationCallbacks.splice(index, 1);
    }
  }

  /**
   * Send notification to all registered callbacks
   */
  notifySubscribers(notification) {
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('Notification callback error:', error);
      }
    });
  }

  /**
   * Check if a booking should be cancelled based on weather conditions
   * @param {Object} booking - Booking object
   * @param {Object} weatherData - Current weather data
   * @returns {Object} Cancellation assessment
   */
  shouldCancelBooking(booking, weatherData) {
    const conditions = weatherData.kitesurfingConditions;
    const studentLevel = booking.student_level || 'beginner';

    // Always cancel if unsafe
    if (conditions.safety === 'unsafe') {
      return {
        shouldCancel: true,
        reason: 'unsafe_conditions',
        message: 'Unsafe weather conditions detected',
        severity: 'high',
        details: conditions.conditions
      };
    }

    // Check if conditions are suitable for student level
    const safetyCheck = weatherService.isBookingSafe(weatherData, studentLevel);
    if (!safetyCheck.safe) {
      return {
        shouldCancel: true,
        reason: 'unsuitable_level',
        message: safetyCheck.reason,
        severity: 'medium',
        details: safetyCheck.details
      };
    }

    // Check for caution conditions
    if (conditions.safety === 'caution' && studentLevel === 'beginner') {
      return {
        shouldCancel: true,
        reason: 'caution_beginner',
        message: 'Conditions require caution - not suitable for beginners',
        severity: 'medium',
        details: conditions.conditions
      };
    }

    return {
      shouldCancel: false,
      reason: 'conditions_suitable',
      message: 'Weather conditions are suitable for the lesson',
      severity: 'low',
      details: conditions.conditions
    };
  }

  /**
   * Get booking recommendations based on weather
   * @param {Date} date - Target date
   * @param {string} skillLevel - Student skill level
   * @returns {Promise<Object>} Booking recommendations
   */
  async getBookingRecommendations(date, skillLevel = 'beginner') {
    try {
      const weather = await weatherService.getCurrentWeather();
      const forecast = await weatherService.getForecast();
      
      // Find forecast for the target date
      const targetForecast = forecast.find(item => {
        const forecastDate = new Date(item.datetime);
        return forecastDate.toDateString() === date.toDateString();
      });

      const weatherToCheck = targetForecast || weather;
      const safetyCheck = weatherService.isBookingSafe(weatherToCheck, skillLevel);

      return {
        date,
        skillLevel,
        weather: weatherToCheck,
        recommendation: {
          suitable: safetyCheck.safe,
          reason: safetyCheck.reason,
          conditions: safetyCheck.details,
          bestTime: this.findBestTimeSlot(forecast, date, skillLevel),
          alternatives: this.findAlternativeDates(forecast, skillLevel)
        }
      };
    } catch (error) {
      console.error('Error getting booking recommendations:', error);
      return {
        date,
        skillLevel,
        weather: null,
        recommendation: {
          suitable: false,
          reason: 'Weather data unavailable',
          conditions: ['Unable to assess weather conditions'],
          bestTime: null,
          alternatives: []
        }
      };
    }
  }

  /**
   * Find the best time slot for a given date
   */
  findBestTimeSlot(forecast, targetDate, skillLevel) {
    const dayForecast = forecast.filter(item => {
      const forecastDate = new Date(item.datetime);
      return forecastDate.toDateString() === targetDate.toDateString();
    });

    if (dayForecast.length === 0) return null;

    const suitableSlots = dayForecast.filter(item => {
      const safetyCheck = weatherService.isBookingSafe(item, skillLevel);
      return safetyCheck.safe;
    });

    if (suitableSlots.length === 0) return null;

    // Find slot with best conditions (highest score)
    const bestSlot = suitableSlots.reduce((best, current) => {
      return current.kitesurfingConditions.score > best.kitesurfingConditions.score ? current : best;
    });

    return {
      time: bestSlot.datetime,
      conditions: bestSlot.kitesurfingConditions,
      wind: bestSlot.wind,
      weather: bestSlot.weather
    };
  }

  /**
   * Find alternative dates with better conditions
   */
  findAlternativeDates(forecast, skillLevel) {
    const alternatives = [];
    const processedDates = new Set();

    forecast.forEach(item => {
      const dateStr = new Date(item.datetime).toDateString();
      
      if (processedDates.has(dateStr)) return;
      processedDates.add(dateStr);

      const safetyCheck = weatherService.isBookingSafe(item, skillLevel);
      if (safetyCheck.safe && item.kitesurfingConditions.score > 60) {
        alternatives.push({
          date: new Date(item.datetime),
          score: item.kitesurfingConditions.score,
          conditions: item.kitesurfingConditions,
          wind: item.wind
        });
      }
    });

    return alternatives
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // Top 3 alternatives
  }

  /**
   * Check all upcoming bookings for weather-related cancellations
   * @param {Array} bookings - Array of upcoming bookings
   * @returns {Promise<Array>} Array of cancellation recommendations
   */
  async checkUpcomingBookings(bookings) {
    try {
      const weather = await weatherService.getCurrentWeather();
      const forecast = await weatherService.getForecast();
      const recommendations = [];

      for (const booking of bookings) {
        const bookingDate = new Date(booking.start_time);
        const now = new Date();
        
        // Only check bookings in the next 48 hours
        const timeDiff = bookingDate.getTime() - now.getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        
        if (hoursDiff < 0 || hoursDiff > 48) continue;

        // Find relevant weather data
        let relevantWeather = weather;
        if (hoursDiff > 3) { // Use forecast for bookings more than 3 hours away
          const forecastItem = forecast.find(item => {
            const diff = Math.abs(new Date(item.datetime).getTime() - bookingDate.getTime());
            return diff < 3 * 60 * 60 * 1000; // Within 3 hours
          });
          if (forecastItem) relevantWeather = forecastItem;
        }

        const cancellationCheck = this.shouldCancelBooking(booking, relevantWeather);
        
        if (cancellationCheck.shouldCancel) {
          recommendations.push({
            booking,
            weather: relevantWeather,
            cancellation: cancellationCheck,
            alternatives: await this.findRescheduleOptions(booking)
          });
        }
      }

      return recommendations;
    } catch (error) {
      console.error('Error checking upcoming bookings:', error);
      return [];
    }
  }

  /**
   * Find reschedule options for a cancelled booking
   */
  async findRescheduleOptions(booking) {
    const forecast = await weatherService.getForecast();
    const skillLevel = booking.student_level || 'beginner';
    const alternatives = this.findAlternativeDates(forecast, skillLevel);

    return alternatives.map(alt => ({
      ...alt,
      timeSlots: this.getAvailableTimeSlots(alt.date)
    }));
  }

  /**
   * Get available time slots for a date (placeholder - integrate with booking system)
   */
  getAvailableTimeSlots(date) {
    // This should integrate with your booking system
    const baseSlots = [
      '09:00', '10:30', '12:00', '13:30', '15:00', '16:30'
    ];

    return baseSlots.map(time => ({
      time,
      available: true // This should check actual availability
    }));
  }

  /**
   * Start automatic weather monitoring
   */
  startWeatherMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      if (!this.autoCheckEnabled) return;

      try {
        // Get upcoming bookings (this should integrate with your booking service)
        const upcomingBookings = await this.getUpcomingBookings();
        const recommendations = await this.checkUpcomingBookings(upcomingBookings);

        if (recommendations.length > 0) {
          this.notifySubscribers({
            type: 'weather_alert',
            timestamp: new Date(),
            recommendations,
            summary: `${recommendations.length} booking(s) may need cancellation due to weather`
          });
        }
      } catch (error) {
        console.error('Weather monitoring error:', error);
      }
    }, this.weatherCheckInterval);
  }

  /**
   * Stop automatic weather monitoring
   */
  stopWeatherMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Get upcoming bookings (placeholder - integrate with your booking service)
   */
  async getUpcomingBookings() {
    // This should integrate with your actual booking service
    // For now, return empty array
    try {
      // Example: return await bookingService.getUpcomingBookings();
      return [];
    } catch (error) {
      console.error('Error fetching upcoming bookings:', error);
      return [];
    }
  }

  /**
   * Create weather-based notification
   */
  createWeatherNotification(type, booking, weather, message) {
    return {
      id: Date.now() + Math.random(),
      type,
      timestamp: new Date(),
      booking,
      weather,
      message,
      read: false,
      actions: this.getNotificationActions(type, booking)
    };
  }

  /**
   * Get available actions for a notification type
   */
  getNotificationActions(type, booking) {
    switch (type) {
      case 'cancellation_required':
        return [
          { id: 'cancel', label: 'Cancel Booking', variant: 'danger' },
          { id: 'reschedule', label: 'Reschedule', variant: 'primary' },
          { id: 'ignore', label: 'Ignore Warning', variant: 'secondary' }
        ];
      case 'caution_warning':
        return [
          { id: 'confirm', label: 'Proceed with Caution', variant: 'warning' },
          { id: 'cancel', label: 'Cancel Booking', variant: 'danger' },
          { id: 'contact_student', label: 'Contact Student', variant: 'primary' }
        ];
      default:
        return [];
    }
  }
}

export const weatherBookingService = new WeatherBookingService();
export default weatherBookingService;
