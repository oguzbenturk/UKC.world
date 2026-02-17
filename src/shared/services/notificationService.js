class NotificationService {
  constructor() {
    // In development, don't require service worker for notifications
    this.isSupported = 'Notification' in window && (import.meta.env.DEV || 'serviceWorker' in navigator);
    this.permission = this.isSupported ? Notification.permission : 'denied';
    this.subscribers = [];
    this.weatherAlerts = [];
  }

  /**
   * Initialize the notification service
   */
  async init() {
    if (!this.isSupported) {
      console.warn('Push notifications are not supported in this browser');
      return false;
    }

    try {
      // Service worker completely disabled to prevent caching issues
      console.log('Service Worker registration disabled for development');
      
      // Request notification permission
      await this.requestPermission();
      
      return this.permission === 'granted';
    } catch (error) {
      console.error('Notification service initialization failed:', error);
      return false;
    }
  }

  /**
   * Request notification permission
   */
  async requestPermission() {
    if (!this.isSupported) return false;

    if (this.permission === 'default') {
      this.permission = await Notification.requestPermission();
    }

    return this.permission === 'granted';
  }

  /**
   * Show a browser notification
   * @param {string} title - Notification title
   * @param {Object} options - Notification options
   */
  async showNotification(title, options = {}) {
    if (!this.isSupported || this.permission !== 'granted') {
      console.warn('Notifications not available or not permitted');
      return null;
    }

    const defaultOptions = {
      icon: '/images/logo/icon-192.png',
      badge: '/images/logo/icon-72.png',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      tag: 'plannivo',
      ...options
    };

    try {
      // Use service worker if available, otherwise fallback to regular notification
      if ('serviceWorker' in navigator && !import.meta.env.DEV) {
        const registration = await navigator.serviceWorker.ready;
        return registration.showNotification(title, defaultOptions);
      } else {
        return new Notification(title, defaultOptions);
      }
    } catch (error) {
      console.error('Failed to show notification:', error);
      // Fallback to regular notification
      try {
        return new Notification(title, defaultOptions);
      } catch (fallbackError) {
        console.error('Fallback notification also failed:', fallbackError);
        return null;
      }
    }
  }

  /**
   * Show weather alert notification
   * @param {Object} weatherData - Weather data
   * @param {string} alertType - Type of alert (warning, danger, info)
   */
  async showWeatherAlert(weatherData, alertType = 'warning') {
    const conditions = weatherData.kitesurfingConditions;
    let title, body, icon;

    switch (alertType) {
      case 'danger':
        title = '⚠️ Dangerous Weather Alert';
        body = `Unsafe conditions detected: ${conditions.conditions.join(', ')}`;
        icon = '/images/weather/storm.png';
        break;
      case 'warning':
        title = '⚡ Weather Warning';
        body = `Caution required: ${conditions.conditions.join(', ')}`;
        icon = '/images/weather/warning.png';
        break;
      case 'improvement':
        title = '🌤️ Weather Improved';
        body = `Conditions are now suitable for kitesurfing (${conditions.rating})`;
        icon = '/images/weather/sunny.png';
        break;
      default:
        title = '🌊 Weather Update';
        body = `Current conditions: ${conditions.rating}`;
        icon = '/images/weather/info.png';
    }

    const options = {
      body,
      icon,
      tag: `weather-${alertType}`,
      requireInteraction: alertType === 'danger',
      actions: this.getWeatherActions(alertType),
      data: {
        type: 'weather',
        alertType,
        weather: weatherData,
        timestamp: Date.now()
      }
    };

    return this.showNotification(title, options);
  }

  /**
   * Show booking notification
   * @param {Object} booking - Booking data
   * @param {string} notificationType - Type of notification
   */
  async showBookingNotification(booking, notificationType) {
    let title, body, icon, actions;

    switch (notificationType) {
      case 'cancellation_required':
        title = '❌ Booking Cancellation Required';
        body = `Lesson for ${booking.student_name} must be cancelled due to unsafe weather`;
        icon = '/images/notifications/cancel.png';
        actions = [
          { action: 'cancel', title: 'Cancel Booking' },
          { action: 'reschedule', title: 'Reschedule' },
          { action: 'view', title: 'View Details' }
        ];
        break;
      case 'weather_warning':
        title = '⚠️ Weather Caution for Booking';
        body = `Lesson for ${booking.student_name} requires extra caution`;
        icon = '/images/notifications/warning.png';
        actions = [
          { action: 'view', title: 'View Weather' },
          { action: 'contact', title: 'Contact Student' }
        ];
        break;
      case 'reminder':
        title = '📅 Lesson Reminder';
        body = `Upcoming lesson with ${booking.student_name} in 1 hour`;
        icon = '/images/notifications/reminder.png';
        actions = [
          { action: 'view', title: 'View Details' },
          { action: 'check_weather', title: 'Check Weather' }
        ];
        break;
      case 'new_booking':
        title = '🆕 New Booking';
        body = `New lesson booked with ${booking.student_name}`;
        icon = '/images/notifications/new.png';
        actions = [
          { action: 'view', title: 'View Booking' },
          { action: 'accept', title: 'Accept' }
        ];
        break;
      default:
        title = '📋 Booking Update';
        body = `Update for lesson with ${booking.student_name}`;
        icon = '/images/notifications/update.png';
    }

    const options = {
      body,
      icon,
      tag: `booking-${booking.id}`,
      requireInteraction: notificationType === 'cancellation_required',
      actions,
      data: {
        type: 'booking',
        notificationType,
        booking,
        timestamp: Date.now()
      }
    };

    return this.showNotification(title, options);
  }

  /**
   * Get weather-specific actions
   */
  getWeatherActions(alertType) {
    switch (alertType) {
      case 'danger':
        return [
          { action: 'view_bookings', title: 'View Bookings' },
          { action: 'cancel_all', title: 'Cancel All' }
        ];
      case 'warning':
        return [
          { action: 'view_details', title: 'View Details' },
          { action: 'check_bookings', title: 'Check Bookings' }
        ];
      default:
        return [
          { action: 'view', title: 'View Weather' }
        ];
    }
  }

  /**
   * Schedule a notification for later
   * @param {string} title - Notification title
   * @param {Object} options - Notification options
   * @param {Date} when - When to show the notification
   */
  scheduleNotification(title, options, when) {
    const delay = when.getTime() - Date.now();
    
    if (delay <= 0) {
      return this.showNotification(title, options);
    }

    return setTimeout(() => {
      this.showNotification(title, options);
    }, delay);
  }

  /**
   * Schedule booking reminders
   * @param {Object} booking - Booking data
   */
  scheduleBookingReminders(booking) {
    const bookingTime = new Date(booking.start_time);
    const now = new Date();

    // 24 hour reminder
    const reminder24h = new Date(bookingTime.getTime() - 24 * 60 * 60 * 1000);
    if (reminder24h > now) {
      this.scheduleNotification(
        '📅 Lesson Tomorrow',
        {
          body: `Don't forget your lesson with ${booking.student_name} tomorrow`,
          tag: `reminder-24h-${booking.id}`,
          data: { type: 'reminder', booking, period: '24h' }
        },
        reminder24h
      );
    }

    // 1 hour reminder
    const reminder1h = new Date(bookingTime.getTime() - 60 * 60 * 1000);
    if (reminder1h > now) {
      this.scheduleNotification(
        '⏰ Lesson in 1 Hour',
        {
          body: `Lesson with ${booking.student_name} starts in 1 hour`,
          tag: `reminder-1h-${booking.id}`,
          requireInteraction: true,
          actions: [
            { action: 'check_weather', title: 'Check Weather' },
            { action: 'view_details', title: 'View Details' }
          ],
          data: { type: 'reminder', booking, period: '1h' }
        },
        reminder1h
      );
    }
  }

  /**
   * Clear notifications by tag
   */
  async clearNotifications(tag) {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const notifications = await registration.getNotifications({ tag });
      notifications.forEach(notification => notification.close());
    }
  }

  /**
   * Get all active notifications
   */
  async getActiveNotifications() {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      return registration.getNotifications();
    }
    return [];
  }

  /**
   * Handle notification click events
   */
  handleNotificationClick(event) {
    const notification = event.notification;
    const data = notification.data;

    notification.close();

    // Handle different notification types
    switch (data?.type) {
      case 'weather':
        this.handleWeatherNotificationClick(event.action, data);
        break;
      case 'booking':
        this.handleBookingNotificationClick(event.action, data);
        break;
      case 'reminder':
        this.handleReminderNotificationClick(event.action, data);
        break;
    }
  }

  /**
   * Handle weather notification clicks
   */
  handleWeatherNotificationClick(action, data) {
    switch (action) {
      case 'view_bookings':
        this.navigateToBookings();
        break;
      case 'cancel_all':
        this.showCancelAllBookingsDialog();
        break;
      case 'view_details':
        this.navigateToWeather();
        break;
      default:
        this.navigateToWeather();
    }
  }

  /**
   * Handle booking notification clicks
   */
  handleBookingNotificationClick(action, data) {
    const booking = data.booking;
    
    switch (action) {
      case 'cancel':
        this.showCancelBookingDialog(booking);
        break;
      case 'reschedule':
        this.showRescheduleDialog(booking);
        break;
      case 'contact':
        this.openContactStudent(booking);
        break;
      case 'view':
      default:
        this.navigateToBooking(booking.id);
    }
  }

  /**
   * Handle reminder notification clicks
   */
  handleReminderNotificationClick(action, data) {
    const booking = data.booking;
    
    switch (action) {
      case 'check_weather':
        this.navigateToWeather();
        break;
      case 'view_details':
        this.navigateToBooking(booking.id);
        break;
      default:
        this.navigateToBooking(booking.id);
    }
  }

  /**
   * Navigation helpers (these should integrate with your routing system)
   */
  navigateToBookings() {
    window.open('/bookings', '_blank');
  }

  navigateToWeather() {
    window.open('/weather', '_blank');
  }

  navigateToBooking(bookingId) {
    window.open(`/bookings/${bookingId}`, '_blank');
  }

  showCancelBookingDialog(booking) {
    // This should integrate with your UI system
    console.log('Show cancel booking dialog for:', booking);
  }

  showRescheduleDialog(booking) {
    // This should integrate with your UI system
    console.log('Show reschedule dialog for:', booking);
  }

  showCancelAllBookingsDialog() {
    // This should integrate with your UI system
    console.log('Show cancel all bookings dialog');
  }

  openContactStudent(booking) {
    // This should integrate with your communication system
    if (booking.student_phone) {
      window.open(`tel:${booking.student_phone}`);
    } else if (booking.student_email) {
      window.open(`mailto:${booking.student_email}`);
    }
  }

  /**
   * Test notification functionality
   */
  async testNotification() {
    return this.showNotification('🧪 Test Notification', {
      body: 'If you can see this, notifications are working!',
      tag: 'test',
      requireInteraction: false
    });
  }
}

// Create service worker content for push notifications
export const serviceWorkerContent = `
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const data = event.notification.data;
  const action = event.action;
  
  // Send message to main thread
  event.waitUntil(
    self.clients.matchAll().then(function(clients) {
      if (clients.length > 0) {
        clients[0].postMessage({
          type: 'notification_click',
          action: action,
          data: data
        });
      } else {
        // Open app if no clients are available
        self.clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('push', function(event) {
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/images/logo/icon-192.png',
    badge: '/images/logo/icon-72.png',
    vibrate: [200, 100, 200],
    tag: 'plannivo'
  };

  event.waitUntil(
    self.registration.showNotification('Plannivo', options)
  );
});
`;

export const notificationService = new NotificationService();
export default notificationService;
