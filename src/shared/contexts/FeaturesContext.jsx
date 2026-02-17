import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { weatherService } from '../services/weatherService';
import { notificationService } from '../services/notificationService';
import { paymentService } from '../services/paymentService';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../utils/logger';

// Initial state
const initialState = {
  weather: {
    current: null,
    forecast: [],
    loading: false,
    error: null,
    lastUpdated: null
  },
  notifications: {
    list: [],
    unreadCount: 0,
    loading: false,
    subscribed: false
  },
  payments: {
    processing: false,
    error: null,
    history: []
  },
  feedback: {
    submitting: false,
    error: null
  }
};

// Action types
const ACTIONS = {
  // Weather actions
  WEATHER_LOADING: 'WEATHER_LOADING',
  WEATHER_SUCCESS: 'WEATHER_SUCCESS',
  WEATHER_ERROR: 'WEATHER_ERROR',
  FORECAST_SUCCESS: 'FORECAST_SUCCESS',
  
  // Notification actions
  NOTIFICATIONS_LOADING: 'NOTIFICATIONS_LOADING',
  NOTIFICATIONS_SUCCESS: 'NOTIFICATIONS_SUCCESS',
  NOTIFICATIONS_ERROR: 'NOTIFICATIONS_ERROR',
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  NOTIFICATION_SUBSCRIBED: 'NOTIFICATION_SUBSCRIBED',
  NEW_NOTIFICATION: 'NEW_NOTIFICATION',
  
  // Payment actions
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  PAYMENT_HISTORY_SUCCESS: 'PAYMENT_HISTORY_SUCCESS',
  
  // Feedback actions
  FEEDBACK_SUBMITTING: 'FEEDBACK_SUBMITTING',
  FEEDBACK_SUCCESS: 'FEEDBACK_SUCCESS',
  FEEDBACK_ERROR: 'FEEDBACK_ERROR'
};

// Reducer
function featuresReducer(state, action) {
  switch (action.type) {
    case ACTIONS.WEATHER_LOADING:
      return {
        ...state,
        weather: { ...state.weather, loading: true, error: null }
      };
    
    case ACTIONS.WEATHER_SUCCESS:
      return {
        ...state,
        weather: {
          ...state.weather,
          loading: false,
          current: action.payload,
          lastUpdated: new Date(),
          error: null
        }
      };
    
    case ACTIONS.FORECAST_SUCCESS:
      return {
        ...state,
        weather: {
          ...state.weather,
          forecast: action.payload,
          lastUpdated: new Date()
        }
      };
    
    case ACTIONS.WEATHER_ERROR:
      return {
        ...state,
        weather: { ...state.weather, loading: false, error: action.payload }
      };
    
    case ACTIONS.NOTIFICATIONS_LOADING:
      return {
        ...state,
        notifications: { ...state.notifications, loading: true }
      };
    
    case ACTIONS.NOTIFICATIONS_SUCCESS:
      return {
        ...state,
        notifications: {
          ...state.notifications,
          loading: false,
          list: action.payload.notifications,
          unreadCount: action.payload.notifications.filter(n => !n.read_at).length
        }
      };
    
    case ACTIONS.NOTIFICATION_READ:
      return {
        ...state,
        notifications: {
          ...state.notifications,
          list: state.notifications.list.map(n => 
            n.id === action.payload ? { ...n, read_at: new Date() } : n
          ),
          unreadCount: Math.max(0, state.notifications.unreadCount - 1)
        }
      };
    
    case ACTIONS.NOTIFICATION_SUBSCRIBED:
      return {
        ...state,
        notifications: { ...state.notifications, subscribed: action.payload }
      };
    
    case ACTIONS.NEW_NOTIFICATION:
      return {
        ...state,
        notifications: {
          ...state.notifications,
          list: [action.payload, ...state.notifications.list],
          unreadCount: state.notifications.unreadCount + 1
        }
      };
    
    case ACTIONS.PAYMENT_PROCESSING:
      return {
        ...state,
        payments: { ...state.payments, processing: true, error: null }
      };
    
    case ACTIONS.PAYMENT_SUCCESS:
      return {
        ...state,
        payments: { ...state.payments, processing: false, error: null }
      };
    
    case ACTIONS.PAYMENT_ERROR:
      return {
        ...state,
        payments: { ...state.payments, processing: false, error: action.payload }
      };
    
    case ACTIONS.PAYMENT_HISTORY_SUCCESS:
      return {
        ...state,
        payments: { ...state.payments, history: action.payload }
      };
    
    case ACTIONS.FEEDBACK_SUBMITTING:
      return {
        ...state,
        feedback: { ...state.feedback, submitting: true, error: null }
      };
    
    case ACTIONS.FEEDBACK_SUCCESS:
      return {
        ...state,
        feedback: { ...state.feedback, submitting: false, error: null }
      };
    
    case ACTIONS.FEEDBACK_ERROR:
      return {
        ...state,
        feedback: { ...state.feedback, submitting: false, error: action.payload }
      };
    
    default:
      return state;
  }
}

// Context
const FeaturesContext = createContext();

// Provider component
export const FeaturesProvider = ({ children }) => {
  const [state, dispatch] = useReducer(featuresReducer, initialState);
  const { user, isAuthenticated } = useAuth();

  // Weather functions
  const loadWeather = async (lat, lon) => {
    dispatch({ type: ACTIONS.WEATHER_LOADING });
    try {
      const weatherData = await weatherService.getCurrentWeather(lat, lon);
      dispatch({ type: ACTIONS.WEATHER_SUCCESS, payload: weatherData });
      
      // Also load forecast
      const forecastData = await weatherService.getForecast(lat, lon);
      dispatch({ type: ACTIONS.FORECAST_SUCCESS, payload: forecastData });
    } catch (error) {
      logger.error('Error loading weather:', error);
      dispatch({ type: ACTIONS.WEATHER_ERROR, payload: error.message });
    }
  };

  const refreshWeather = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          loadWeather(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          logger.warn('Geolocation error, using default location:', error);
          // Default to San Francisco coordinates
          loadWeather(37.7749, -122.4194);
        }
      );
    } else {
      // Default location if geolocation not available
      loadWeather(37.7749, -122.4194);
    }
  };

  // Notification functions
  const loadNotifications = async () => {
    if (!isAuthenticated) return;
    
    dispatch({ type: ACTIONS.NOTIFICATIONS_LOADING });
    try {
      const response = await fetch('/api/notifications/user', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        dispatch({ type: ACTIONS.NOTIFICATIONS_SUCCESS, payload: data });
      }
    } catch (error) {
      logger.error('Error loading notifications:', error);
    }
  };

  const markNotificationAsRead = async (notificationId) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        dispatch({ type: ACTIONS.NOTIFICATION_READ, payload: notificationId });
      }
    } catch (error) {
      logger.error('Error marking notification as read:', error);
    }
  };

  const subscribeToNotifications = async () => {
    try {
      const subscription = await notificationService.requestPermission();
      if (subscription) {
        dispatch({ type: ACTIONS.NOTIFICATION_SUBSCRIBED, payload: true });
      }
    } catch (error) {
      logger.error('Error subscribing to notifications:', error);
    }
  };

  // Payment functions
  const createPaymentIntent = async (amount, currency, bookingId, description) => {
    dispatch({ type: ACTIONS.PAYMENT_PROCESSING });
    try {
      const paymentIntent = await paymentService.createPaymentIntent({
        amount,
        currency,
        bookingId,
        description
      });
      
      dispatch({ type: ACTIONS.PAYMENT_SUCCESS });
      return paymentIntent;
    } catch (error) {
      logger.error('Error creating payment intent:', error);
      dispatch({ type: ACTIONS.PAYMENT_ERROR, payload: error.message });
      throw error;
    }
  };

  const processPayment = async (paymentIntentId, paymentMethodId) => {
    dispatch({ type: ACTIONS.PAYMENT_PROCESSING });
    try {
      const result = await paymentService.confirmPayment(paymentIntentId, paymentMethodId);
      dispatch({ type: ACTIONS.PAYMENT_SUCCESS });
      return result;
    } catch (error) {
      logger.error('Error processing payment:', error);
      dispatch({ type: ACTIONS.PAYMENT_ERROR, payload: error.message });
      throw error;
    }
  };

  const loadPaymentHistory = async () => {
    try {
      const response = await fetch('/api/payments/history', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const history = await response.json();
        dispatch({ type: ACTIONS.PAYMENT_HISTORY_SUCCESS, payload: history });
      }
    } catch (error) {
      logger.error('Error loading payment history:', error);
    }
  };

  // Feedback functions
  const submitFeedback = async (feedbackData) => {
    dispatch({ type: ACTIONS.FEEDBACK_SUBMITTING });
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(feedbackData)
      });
      
      if (response.ok) {
        const result = await response.json();
        dispatch({ type: ACTIONS.FEEDBACK_SUCCESS });
        return result;
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit feedback');
      }
    } catch (error) {
      logger.error('Error submitting feedback:', error);
      dispatch({ type: ACTIONS.FEEDBACK_ERROR, payload: error.message });
      throw error;
    }
  };

  // Initialize features on mount
  useEffect(() => {
    if (isAuthenticated) {
      // Load initial data
      refreshWeather();
      loadNotifications();
      loadPaymentHistory();
      
      // Subscribe to notifications if supported
      if (notificationService.isSupported()) {
        subscribeToNotifications();
      }
    }
  }, [isAuthenticated]);

  // Listen for new notifications
  useEffect(() => {
    const handleNewNotification = (notification) => {
      dispatch({ type: ACTIONS.NEW_NOTIFICATION, payload: notification });
    };

    notificationService.on('notification', handleNewNotification);
    
    return () => {
      notificationService.off('notification', handleNewNotification);
    };
  }, []);

  const value = {
    ...state,
    
    // Weather methods
    loadWeather,
    refreshWeather,
    
    // Notification methods
    loadNotifications,
    markNotificationAsRead,
    subscribeToNotifications,
    
    // Payment methods
    createPaymentIntent,
    processPayment,
    loadPaymentHistory,
    
    // Feedback methods
    submitFeedback
  };

  return (
    <FeaturesContext.Provider value={value}>
      {children}
    </FeaturesContext.Provider>
  );
};

// Hook to use features context
export const useFeatures = () => {
  const context = useContext(FeaturesContext);
  if (!context) {
    throw new Error('useFeatures must be used within a FeaturesProvider');
  }
  return context;
};
