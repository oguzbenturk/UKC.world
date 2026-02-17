/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarApiErrors } from '../api/calendarApi';
import { format, startOfDay, endOfWeek, endOfMonth, startOfWeek, endOfDay, startOfMonth } from 'date-fns';
import calendarConfig from '@/config/calendarConfig';
import DataService from '@/shared/services/dataService';
import { getAuthHeaders } from '@/shared/utils/authUtils';
import { autoLoginWithRetry } from '@/shared/utils/autoLogin';
import { logger } from '@/shared/utils/logger';
import eventBus from '@/shared/utils/eventBus';
import { realTimeService } from '@/shared/services/realTimeService';

// Enhanced in-memory cache for performance optimization
const dataCache = {
  bookings: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 }, // 2 minutes TTL (reduced)
  instructors: { data: null, timestamp: 0, ttl: 60 * 60 * 1000 }, // 1 hour TTL 
  services: { data: null, timestamp: 0, ttl: 60 * 60 * 1000 }, // 1 hour TTL 
  users: { data: null, timestamp: 0, ttl: 30 * 60 * 1000 }, // 30 minutes TTL 
};

// Debounce utility for performance
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

// Cache utilities
const getCachedData = (key) => {
  const cached = dataCache[key];
  
  // Return null if cache entry doesn't exist, is undefined, or has no data
  if (!cached || cached.data === undefined || cached.data === null) {
    return null;
  }
  
  const now = Date.now();
  if ((now - cached.timestamp) < cached.ttl) {
    return cached.data;
  }
  
  return null;
};

const setCachedData = (key, data) => {
  dataCache[key] = {
    data,
    timestamp: Date.now(),
    ttl: dataCache[key].ttl
  };
};

const invalidateCache = (key) => {
  if (key) {
    dataCache[key].timestamp = 0;
  } else {
    // Invalidate all cache
    Object.keys(dataCache).forEach(k => {
      dataCache[k].timestamp = 0;
    });
  }
};

// Optimized booking data standardizer - ensures consistent data structure across all views
/* eslint-disable complexity */
const standardizeBookingData = (rawBooking) => {
  if (!rawBooking) return null;
  
  // Early return for already standardized bookings
  if (rawBooking._standardized) return rawBooking;
  
  // Normalize date with fallbacks and consistent YYYY-MM-DD format
  let normalizedDate = rawBooking.date || rawBooking.formatted_date || rawBooking.formattedDate;
  if (normalizedDate) {
    if (normalizedDate instanceof Date) {
      normalizedDate = normalizedDate.toISOString().split('T')[0];
    } else if (typeof normalizedDate === 'string' && normalizedDate.includes('T')) {
      normalizedDate = normalizedDate.split('T')[0];
    }
  }

  // Extract and standardize time values with optimized approach
  let startTime = rawBooking.startTime || rawBooking.time || rawBooking.start_time;
  
  // Handle backend decimal format (start_hour) conversion
  if (!startTime && rawBooking.start_hour !== undefined) {
    startTime = standardizeTimeFormat(rawBooking.start_hour);
  }
  
  let endTime = rawBooking.endTime || rawBooking.end_time;
  
  // Ensure time values are properly formatted or set defaults (optimized)
  startTime = startTime && startTime !== 'undefined' ? 
    (standardizeTimeFormat(startTime) || '09:00') : '09:00';
    
  if (!endTime || endTime === 'undefined') {
    // Calculate end time based on duration if available (optimized calculation)
    const duration = Number(rawBooking.duration) || 1;
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = (hours * 60) + minutes + (duration * 60);
    const endHours = Math.floor(totalMinutes / 60);
    const endMins = totalMinutes % 60;
    endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  } else {
    endTime = standardizeTimeFormat(endTime) || '10:00';
  }
  
  // Create standardized object with performance optimizations
  const standardized = {
    id: rawBooking.id,
  date: normalizedDate || rawBooking.date,
    startTime,
    endTime,
    time: startTime, // For backward compatibility
    start_hour: startTime, // Include original backend field name
    duration: Number(rawBooking.duration) || 1, // Ensure numeric
    instructorId: rawBooking.instructorId || rawBooking.instructor_user_id,
    instructor_user_id: rawBooking.instructor_user_id || rawBooking.instructorId,
    studentId: rawBooking.studentId || rawBooking.student_user_id,
    student_user_id: rawBooking.student_user_id || rawBooking.studentId,
    service_id: rawBooking.service_id,
  // Normalized display fields
  serviceName: rawBooking.serviceName || rawBooking.service_name,
  studentName: rawBooking.studentName || rawBooking.student_name || rawBooking.userName,
  instructorName: rawBooking.instructorName || rawBooking.instructor_name,
  // Provide snake_case aliases for legacy components
  service_name: rawBooking.service_name || rawBooking.serviceName,
  student_name: rawBooking.student_name || rawBooking.studentName || rawBooking.userName,
  instructor_name: rawBooking.instructor_name || rawBooking.instructorName,
    status: rawBooking.status || 'pending',
    notes: rawBooking.notes || '',
  // Monetary fields (keep all for consumers)
  final_amount: Number(rawBooking.final_amount) || 0,
  amount: Number(rawBooking.amount) || 0,
  price: Number(rawBooking.price || rawBooking.amount || rawBooking.final_amount) || 0,
  // Payment/package indicators
  payment_status: rawBooking.payment_status || rawBooking.paymentStatus,
  customer_package_id: rawBooking.customer_package_id || rawBooking.customerPackageId || null,
    instructor_commission: Number(rawBooking.instructor_commission) || 0,
    participants: rawBooking.participants || [], // Preserve participants array from backend
    createdAt: rawBooking.createdAt || rawBooking.created_at,
    updatedAt: rawBooking.updatedAt || rawBooking.updated_at,
    _standardized: true // Mark as standardized to avoid re-processing
  };
  
  return standardized;
};
/* eslint-enable complexity */

// Time format standardizer - ensures consistent HH:MM format
const standardizeTimeFormat = (timeInput) => {
  if (!timeInput) return null;
  
  // If it's already in HH:MM format, return as is
  if (typeof timeInput === 'string' && timeInput.includes(':')) {
    return timeInput;
  }
  
  // If it's a decimal hour (e.g., 9.5), convert to HH:MM
  if (typeof timeInput === 'number') {
    const hours = Math.floor(timeInput);
    const minutes = Math.round((timeInput - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  return timeInput;
};

// Helper function to filter out cancelled bookings consistently
const filterActiveBookings = (bookings) => {
  if (!Array.isArray(bookings)) return [];
  const activeBookings = bookings.filter(booking => booking.status !== 'cancelled');
  return activeBookings;
};

// Create context
const CalendarContext = createContext(null); // Context for calendar state and operations

// Error messages for different error types
const ErrorMessages = {
  [CalendarApiErrors.NETWORK_ERROR]: 'Unable to connect to the server. Please check your internet connection.',
  [CalendarApiErrors.VALIDATION_ERROR]: 'Invalid data provided. Please check your inputs.',
  [CalendarApiErrors.SERVER_ERROR]: 'Server error. Please try again later.',
  [CalendarApiErrors.AUTH_ERROR]: 'Your session has expired. Please log in again.',
  DEFAULT: 'An unexpected error occurred. Please try again.'
};

/**
 * Custom hook to use the calendar context
 * @returns {Object} Calendar context
 */
export const useCalendar = () => {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider');
  }
  return context;
};

/**
 * Calendar context provider component - Optimized for performance
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
function CalendarProvider({ children }) {
  // Get URL search parameters and navigation
  const [searchParams, setSearchParams] = useSearchParams();
  const urlView = searchParams.get('view');
  const urlDate = searchParams.get('date');
  const urlBookingId = searchParams.get('bookingId');
  
  // ==========================================
  // SECTION 1: CALENDAR VIEW STATE
  // ==========================================
  // Initialize view from URL parameter or default
  const initialView = urlView && ['daily', 'weekly', 'monthly'].includes(urlView) ? 
    (urlView === 'weekly' ? 'week' : urlView === 'monthly' ? 'month' : 'day') : 
    (calendarConfig.ui.defaultView || 'week');
  
  // Initialize date from URL parameter or default to today
  const initialDate = urlDate ? (() => {
    try {
      const parsed = new Date(urlDate);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    } catch {
      return new Date();
    }
  })() : new Date();
    
  const [view, setViewState] = useState(initialView);
  
  // Enhanced setView function that also updates URL
  const setView = useCallback((newView) => {
    setViewState(newView);
    
    // Update URL parameter to match view (only when on calendar page)
    if (window.location.pathname.includes('/bookings/calendar')) {
      const viewParam = newView === 'week' ? 'weekly' : newView === 'month' ? 'monthly' : 'daily';
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.set('view', viewParam);
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [highlightedBookingId, setHighlightedBookingId] = useState(urlBookingId);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // ==========================================
  // SECTION 2: DATA STATE
  // ==========================================
  const [slots, _setSlots] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [services, setServices] = useState([]);
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);

  // ==========================================
  // SECTION 3: UI STATE
  // ==========================================
  const [isLoading, _setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const _fetchingRef = useRef(false);
  const [refreshCounter, setRefreshCounter] = useState(0); // Force refresh trigger
  const deletedBookingsRef = useRef(new Set()); // Track deleted booking IDs
  const bookingsRef = useRef([]); // Keep latest bookings for event handlers
  // const _lastDateRangeRef = useRef(null); // previously used to track last fetched date range
  
  // ==========================================
  // SECTION 3.5: URL PARAMETER SYNC
  // ==========================================
  // Update view when URL parameters change (only from external navigation)
  useEffect(() => {
    if (urlView && ['daily', 'weekly', 'monthly'].includes(urlView)) {
      const newView = urlView === 'weekly' ? 'week' : urlView === 'monthly' ? 'month' : 'day';
      if (newView !== view) {
        setViewState(newView); // Use setViewState to avoid URL update loop
      }
    }
  }, [urlView, view]);
  
  // Update selectedDate when URL date parameter changes
  useEffect(() => {
    if (urlDate) {
      try {
        const parsed = new Date(urlDate);
        if (!isNaN(parsed.getTime())) {
          setSelectedDate(parsed);
        }
      } catch (error) {
        // Invalid date in URL, ignore
      }
    }
  }, [urlDate]);
  
  // ==========================================
  // SECTION 4: FILTER STATE
  // ==========================================
  const [selectedInstructors, setSelectedInstructors] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  // ==========================================
  // SECTION 5: ERROR HANDLING
  // ==========================================
  const handleApiError = (error) => {
    let errorMessage = ErrorMessages.DEFAULT;
    if (error.type && ErrorMessages[error.type]) {
      errorMessage = ErrorMessages[error.type];
    }
    setError(errorMessage);
    // API Error logged for debugging
    if (import.meta.env.MODE === 'development') {
      logger.error('CalendarContext API Error:', { error });
    }
  };

  // ==========================================
  // SECTION 6: UNIFIED CALENDAR REFRESH SYSTEM
  // ==========================================
  
  /**
   * Unified calendar data update system - INSTANT UPDATES ONLY
   * No loading states, just instant data updates
   */
  const updateCalendarData = useCallback(async (options = {}) => {
    const {
      reason = 'update',
      newBooking = null,
      deletedBookingId = null,
      forceFullSync = false
    } = options;
    
  try {
      // Handle new booking addition - INSTANT
      if (newBooking) {
        setBookings(currentBookings => {
          // Check if booking already exists to prevent duplicates
          const existingBooking = currentBookings.find(b => b.id === newBooking.id);
          if (existingBooking) {
            const updatedBookings = currentBookings.map(b => 
              b.id === newBooking.id ? { ...b, ...newBooking } : b
            );
            setCachedData('bookings', filterActiveBookings(updatedBookings));
            localStorage.setItem('bookings_cache_timestamp', Date.now().toString());
            return updatedBookings;
          }
          
          const updatedBookings = [...currentBookings, newBooking];
          const filteredBookings = filterActiveBookings(updatedBookings);
          
          setCachedData('bookings', filteredBookings);
          localStorage.setItem('bookings_cache_timestamp', Date.now().toString());
          return filteredBookings;
        });
        
        // Force a re-render by updating refresh counter
        setRefreshCounter(prev => prev + 1);
        return;
      }
      
      // Handle booking deletion - INSTANT
      if (deletedBookingId) {
        setBookings(currentBookings => {
          const updatedBookings = currentBookings.filter(booking => booking.id !== deletedBookingId);
          setCachedData('bookings', filterActiveBookings(updatedBookings));
          localStorage.setItem('bookings_cache_timestamp', Date.now().toString());
          return filterActiveBookings(updatedBookings);
        });
        return;
      }
      
      // Handle silent background sync - NO LOADING, only update bookings
      if (forceFullSync || reason === 'silent' || reason === 'booking-updated') {
        // Only fetch bookings for silent updates to avoid excessive calls
        try {
          const freshBookingsData = await DataService.getBookings();
          const standardizedBookings = freshBookingsData
            .map(booking => {
              try {
                return standardizeBookingData(booking);
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          
          // Update state silently
          const filteredBookings = filterActiveBookings(standardizedBookings);
          setBookings(filteredBookings);
          setCachedData('bookings', filteredBookings);
          localStorage.setItem('bookings_cache_timestamp', Date.now().toString());
        } catch {
          // Silent failure
        }
        return;
      }
      
  } catch (error) {
      // Don't show error to user for silent operations
      if (reason === 'manual') {
        handleApiError(error);
      }
    }
  }, []);

  /**
   * Instant refresh functions - NO loading states
   */
  const _refreshCalendar = useCallback(async () => {
    updateCalendarData({ reason: 'silent', forceFullSync: true });
  }, [updateCalendarData]);

  const silentRefreshBookings = useCallback(async () => {
    return updateCalendarData({ reason: 'silent' });
  }, [updateCalendarData]);

  /**
   * Global booking operation event handlers - using unified update system
   */
  useEffect(() => {
    const handleBookingOperation = (event) => {
      // Use unified update system based on operation type
      setTimeout(() => {
        if (event.type === 'booking-created' && event.detail?.booking) {
          updateCalendarData({
            reason: 'booking-created',
            newBooking: event.detail.booking,
          });
        } else if (event.type === 'booking-updated' && event.detail?.booking) {
          // Optimistic: merge updated booking into state instantly using latest ref
          const updatedBooking = event.detail.booking;
          const idToMatch = String(updatedBooking.id || updatedBooking.bookingId);
          const current = bookingsRef.current || [];
          const idx = current.findIndex(b => String(b.id) === idToMatch);
          if (idx !== -1) {
            const next = [...current];
            next[idx] = { ...next[idx], ...updatedBooking };
            setBookings(next);
            setCachedData('bookings', filterActiveBookings(next));
            localStorage.setItem('bookings_cache_timestamp', Date.now().toString());
            // Follow-up: debounce a light silent refresh to reconcile server-side fields
            clearTimeout(window.__bookingUpdatedDebounce);
            window.__bookingUpdatedDebounce = setTimeout(() => {
              updateCalendarData({ reason: 'silent' });
            }, 400);
          }
        } else if (event.type === 'booking-deleted' && event.detail?.bookingId) {
          updateCalendarData({
            reason: 'booking-deleted',
            deletedBookingId: event.detail.bookingId,
          });
        } else {
          updateCalendarData({ reason: event.type });
        }
      }, 100);
    };

    window.addEventListener('booking-created', handleBookingOperation);
    window.addEventListener('booking-updated', handleBookingOperation);
    window.addEventListener('booking-deleted', handleBookingOperation);
    window.addEventListener('calendar-refresh-needed', handleBookingOperation);

    return () => {
      window.removeEventListener('booking-created', handleBookingOperation);
      window.removeEventListener('booking-updated', handleBookingOperation);
      window.removeEventListener('booking-deleted', handleBookingOperation);
      window.removeEventListener('calendar-refresh-needed', handleBookingOperation);
    };
  }, [updateCalendarData]);

  // Subscribe to global bookings:changed events (from anywhere) and silently refresh
  useEffect(() => {
    let cooldown = false;
    const unsub = eventBus.on('bookings:changed', () => {
      if (cooldown) return;
      cooldown = true;
      // Perform a silent refresh and release cooldown shortly after to debounce bursts
      updateCalendarData({ reason: 'silent', forceFullSync: true });
      setTimeout(() => { cooldown = false; }, 500);
    });
    return () => { unsub && unsub(); };
  }, [updateCalendarData]);

  // Subscribe to backend real-time booking events to refresh on actual DB changes
  useEffect(() => {
    // Handlers
    const handleRtCreated = (payload) => {
      try {
        const standardized = standardizeBookingData(payload);
        updateCalendarData({ reason: 'booking-created-rt', newBooking: standardized });
        // Follow up with a silent full sync to reconcile any server-calculated fields
        setTimeout(() => updateCalendarData({ reason: 'silent', forceFullSync: true }), 1500);
      } catch {
        // Fallback to silent refresh if standardization fails
        updateCalendarData({ reason: 'silent', forceFullSync: true });
      }
    };

    const handleRtUpdated = () => {
      // Debounced silent sync to avoid fighting with optimistic updates
      clearTimeout(window.__rtUpdatedDebounce);
      window.__rtUpdatedDebounce = setTimeout(() => {
        updateCalendarData({ reason: 'silent' });
      }, 500);
    };

    const handleRtDeleted = (payload) => {
      const id = payload?.id || payload?.bookingId;
      if (id) {
        updateCalendarData({ reason: 'booking-deleted-rt', deletedBookingId: id });
      } else {
        updateCalendarData({ reason: 'silent', forceFullSync: true });
      }
    };

    // Attach listeners when socket is available
    realTimeService.on('booking:created', handleRtCreated);
    realTimeService.on('booking:updated', handleRtUpdated);
    realTimeService.on('booking:deleted', handleRtDeleted);

    return () => {
      realTimeService.off('booking:created', handleRtCreated);
      realTimeService.off('booking:updated', handleRtUpdated);
      realTimeService.off('booking:deleted', handleRtDeleted);
    };
  }, [updateCalendarData]);

  /**
   * Check for booking conflicts before creating a new booking
   * @param {Object} newBookingData - The new booking data to check
   * @returns {Promise<Object>} Conflict check result with details
   */
  /* eslint-disable complexity */
  const checkBookingConflicts = useCallback(async (newBookingData) => {
    try {
      const { date, time, duration = 1, instructorId } = newBookingData; // Default 1 hour
      
      if (!date || !time || !instructorId) {
        return { hasConflict: false, conflicts: [] };
      }

      // Parse the new booking time
      const parseTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes; // Convert to minutes from midnight
      };

      const newStartMinutes = parseTime(time);
      const newEndMinutes = newStartMinutes + (parseFloat(duration) * 60); // Convert hours to minutes - use parseFloat for decimals

      // Fetch fresh bookings data from API to avoid stale state issues
  const freshBookingsData = await DataService.getBookings();
      
      const existingBookings = freshBookingsData.filter(booking => 
        booking.date === date && 
        booking.instructor_user_id === instructorId &&
        booking.status !== 'cancelled' // Ignore cancelled bookings
      );

      const conflicts = [];

      for (const booking of existingBookings) {
        // Handle different time field formats from API
        let bookingStartTime;
        if (booking.start_hour !== undefined) {
          // Convert decimal hour to HH:MM format
          const hours = Math.floor(booking.start_hour);
          const minutes = Math.round((booking.start_hour - hours) * 60);
          bookingStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        } else {
          bookingStartTime = booking.startTime || booking.time;
        }
        
        if (!bookingStartTime) {
          continue;
        }

        const existingStartMinutes = parseTime(bookingStartTime);
        const existingDuration = parseFloat(booking.duration) * 60 || 60; // Convert hours to minutes - use parseFloat for decimals
        const existingEndMinutes = existingStartMinutes + existingDuration;

        // Check for overlap
        const hasOverlap = (
          (newStartMinutes < existingEndMinutes && newEndMinutes > existingStartMinutes)
        );

        if (hasOverlap) {
          conflicts.push({
            id: booking.id,
            studentName: booking.studentName,
            serviceName: booking.serviceName,
            startTime: bookingStartTime,
            endTime: booking.endTime,
            status: booking.status,
            overlapType: newStartMinutes === existingStartMinutes ? 'exact' : 'partial'
          });
        }
      }

    return {
        hasConflict: conflicts.length > 0,
        conflicts,
        conflictDetails: conflicts.length > 0 ? {
          count: conflicts.length,
          message: `Found ${conflicts.length} conflicting booking${conflicts.length > 1 ? 's' : ''} for this time slot`
        } : null
      };
    } catch (error) {
      return { hasConflict: false, conflicts: [], error: error.message };
    }
  }, []);
  /* eslint-enable complexity */

  /**
   * Helper function to process successful group booking creation
   */
  /* eslint-disable complexity */
  const processGroupBookingSuccess = useCallback(async (result, bookingData, participants) => {
    // Calculate end time for the booking
    const startTimeStr = bookingData.time || bookingData.startTime;
    let endTime = null;
    if (startTimeStr) {
      const [hours, minutes] = startTimeStr.split(':').map(Number);
      const duration = Number(bookingData.duration) || 1;
      const endHours = hours + Math.floor(duration);
      const endMins = minutes + Math.round((duration % 1) * 60);
      endTime = `${(endHours + Math.floor(endMins / 60)).toString().padStart(2, '0')}:${(endMins % 60).toString().padStart(2, '0')}`;
    }

    // Create standardized booking object for frontend state
    const newBooking = standardizeBookingData({
      id: result.bookingId || result.id || `booking-${Date.now()}`,
      date: bookingData.date,
      time: bookingData.time || bookingData.startTime,
      startTime: bookingData.time || bookingData.startTime,
      endTime: endTime,
      duration: bookingData.duration || 1,
      instructorId: bookingData.instructorId,
      instructor_user_id: bookingData.instructorId,
      instructorName: bookingData.instructorName || instructors.find(i => i.id === bookingData.instructorId)?.name || 'Unknown Instructor',
      serviceId: bookingData.serviceId,
      service_id: bookingData.serviceId,
      serviceName: services.find(s => s.id === bookingData.serviceId)?.name || 'Unknown Service',
      userName: participants[0]?.name || 'Group Booking',
      studentName: participants[0]?.name || 'Group Booking',
      status: 'pending',
      checkInStatus: 'pending',
      notes: bookingData.notes || '',
      participants: participants,
      createdAt: new Date().toISOString(),
      ...result
    });

    logger.debug('Adding new booking to calendar state', { newBooking });
    logger.debug('Current bookings before adding', { count: bookings.length });

    // Use unified calendar update system with immediate state update
    await updateCalendarData({
      reason: 'booking-created',
      newBooking: newBooking
    });
    
    logger.debug('Current bookings after adding', { count: bookings.length });

    // Trigger a background refresh to sync with server data
    setTimeout(() => {
      updateCalendarData({ reason: 'silent', forceFullSync: true });
    }, 2000); // Delay to ensure server has processed and our instant update is visible

    // Dispatch a custom event to notify other components
    window.dispatchEvent(new CustomEvent('booking-created', {
      detail: { booking: newBooking }
    }));

  // Also notify via internal event bus for components not listening to DOM events
  eventBus.emit('bookings:changed', { reason: 'create', booking: newBooking });

    return newBooking;
  }, [instructors, services, updateCalendarData, bookings.length]);
  /* eslint-enable complexity */

  /**
   * Create a group booking with multiple participants and individual package consumption
   */
  /* eslint-disable complexity, max-depth */
  const createGroupBooking = useCallback(async (bookingData) => {
    try {
    logger.debug('Creating group booking', { participants: bookingData.participants?.length });
      
      // Calculate start_hour from time
      let start_hour = 9; // Default fallback
      if (bookingData.time || bookingData.startTime) {
        const timeStr = bookingData.time || bookingData.startTime;
        const [hours, minutes] = timeStr.split(':').map(Number);
        start_hour = hours + (minutes / 60); // Convert to decimal hours
      }

      // Enhanced authentication with auto-login retry (moved before user operations)
      let authHeaders;
      try {
        authHeaders = await getAuthHeaders();
        logger.debug('Authentication headers obtained for group booking');
      } catch (authError) {
        logger.warn('Initial auth failed, trying auto-login with retry...', { error: authError });
        
        // Try auto-login with retry mechanism
        const autoLoginSuccess = await autoLoginWithRetry(3);
        if (autoLoginSuccess) {
          logger.debug('Auto-login successful, getting new auth headers');
          authHeaders = await getAuthHeaders();
        } else {
          throw new Error('Authentication failed: Could not auto-login after multiple attempts');
        }
      }

      // First, prepare participants data - use existing userIds if available
  logger.debug('Preparing participants for group booking...');
      const participantsWithUserIds = [];
      
      for (let i = 0; i < bookingData.participants.length; i++) {
        const participant = bookingData.participants[i];
        
        // Check if participant already has a userId (existing customer)
        if (participant.userId) {
          logger.debug('Participant already has userId', { index: i + 1, userId: participant.userId });
          
          participantsWithUserIds.push({
            userId: participant.userId,
            userName: participant.userName || participant.name,
            userEmail: participant.userEmail || participant.email,
            userPhone: participant.userPhone || participant.phone,
            name: participant.userName || participant.name,
            email: participant.userEmail || participant.email,
            phone: participant.userPhone || participant.phone,
            isPrimary: participant.isPrimary === true,
            usePackage: participant.usePackage === true,
            customerPackageId: participant.selectedPackageId || null,
            amount: participant.usePackage ? 0 : (bookingData.servicePrice || bookingData.price || 0)
          });
          
          continue; // Skip user creation/lookup for existing customers
        }
        
        // For new users without userId, attempt to create/lookup
  logger.debug('Participant needs user creation/lookup...', { index: i + 1 });
        const participantData = {
          name: participant.userName || participant.name,
          email: participant.userEmail || participant.email,
          phone: participant.userPhone || participant.phone,
        };

        // Validate required participant data
        if (!participantData.name || !participantData.email) {
          throw new Error(`Participant ${i + 1} is missing required name or email`);
        }

        try {
          // Create/lookup user via the calendar booking endpoint helper
          const userResponse = await fetch('/api/users/find-or-create', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              name: participantData.name,
              email: participantData.email,
              phone: participantData.phone
            })
          });

          let userId;
          if (userResponse.ok) {
            const userData = await userResponse.json();
            userId = userData.userId || userData.id;
            logger.debug('User created/found for participant', { email: participantData.email, userId });
          } else {
            // If the endpoint doesn't exist, we'll let the backend handle it
            // by providing the user data and letting it create the user
            logger.warn('User lookup endpoint not available, backend will create user', { email: participantData.email });
            userId = null; // Backend will need to handle this
          }

          participantsWithUserIds.push({
            userId: userId,
            userName: participantData.name,
            userEmail: participantData.email,
            userPhone: participantData.phone,
            name: participantData.name,
            email: participantData.email,
            phone: participantData.phone,
            isPrimary: participant.isPrimary === true,
            usePackage: participant.usePackage === true,
            customerPackageId: participant.selectedPackageId || null,
            amount: participant.usePackage ? 0 : (bookingData.servicePrice || bookingData.price || 0)
          });

        } catch (userError) {
          logger.error('Failed to create/lookup user for participant', { index: i + 1, error: userError });
          // Add participant without userId, let backend handle it
          participantsWithUserIds.push({
            userId: null,
            userName: participantData.name,
            userEmail: participantData.email,
            userPhone: participantData.phone,
            name: participantData.name,
            email: participantData.email,
            phone: participantData.phone,
            isPrimary: participant.isPrimary === true,
            usePackage: participant.usePackage === true,
            customerPackageId: participant.selectedPackageId || null,
            amount: participant.usePackage ? 0 : (bookingData.servicePrice || bookingData.price || 0)
          });
        }
      }

      // Prepare participants data for the group booking endpoint
      const participants = participantsWithUserIds;

      const groupPayload = {
        date: bookingData.date,
        time: bookingData.time || bookingData.startTime,
        start_hour: start_hour,
        duration: Number(bookingData.duration) || 1,
        instructor_user_id: bookingData.instructorId,  // Backend expects instructor_user_id
        service_id: bookingData.serviceId,             // Backend expects service_id
        participants: participants,
        notes: bookingData.notes || '',
        location: 'TBD'
      };

  logger.debug('Group booking payload', { groupPayload });

      // REMOVED: Enhanced authentication with auto-login retry (moved earlier)
      // let authHeaders;
      /*try {
        authHeaders = await getAuthHeaders();
        console.log('✅ Authentication headers obtained');
      } catch (authError) {
        console.log('⚠️ Initial auth failed, trying auto-login with retry...');
        
        // Try auto-login with retry mechanism
        const autoLoginSuccess = await autoLoginWithRetry(3);
        if (autoLoginSuccess) {
          console.log('✅ Auto-login successful, getting new auth headers');
          authHeaders = await getAuthHeaders();
        } else {
          throw new Error('Authentication failed: Could not auto-login after multiple attempts');
        }
      }*/

  // duplicate payload log removed

      // Call the group booking endpoint with proper auth
      const response = await fetch('/api/bookings/group', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(groupPayload)
      });

      // Enhanced error handling
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        // If it's a 401 error, try one more time with fresh authentication
        if (response.status === 401) {
          logger.warn('Got 401 error, attempting one final auth retry...');
          
          // Clear existing auth and try auto-login one more time
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          
          const finalLoginAttempt = await autoLoginWithRetry(2);
          if (finalLoginAttempt) {
            logger.debug('Final auth attempt successful, retrying request...');
            const newAuthHeaders = await getAuthHeaders();
            
            const retryResponse = await fetch('/api/bookings/group', {
              method: 'POST',
              headers: newAuthHeaders,
              body: JSON.stringify(groupPayload)
            });
            
            if (retryResponse.ok) {
              const result = await retryResponse.json();
              logger.info('Group booking created successfully on retry', { result });
              return await processGroupBookingSuccess(result, bookingData, participants);
            } else {
              const retryErrorData = await retryResponse.json().catch(() => ({ error: 'Retry failed' }));
              throw new Error(`Group booking failed on retry: ${retryErrorData.error || retryResponse.statusText}`);
            }
          } else {
            throw new Error('Authentication failed: Could not authenticate after 401 error');
          }
        } else {
          // Handle other error types
          const enhancedError = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
          enhancedError.details = errorData.details;
          enhancedError.isConflictError = errorData.error === 'Time slot unavailable' || response.status === 400;
          enhancedError.status = response.status;
          throw enhancedError;
        }
      }

      const result = await response.json();
      logger.info('Group booking created successfully', { result });

      return await processGroupBookingSuccess(result, bookingData, participants);

    } catch (error) {
      logger.error('Group booking creation failed', { error });
      handleApiError(error);
      throw error;
    }
  }, [processGroupBookingSuccess]);
  /* eslint-enable complexity, max-depth */


  /**
   * Create a new booking with conflict detection
   * @param {Object} bookingData - The booking data to create
   * @param {boolean} forceCreate - If true, skip conflict detection
   * @returns {Promise<Object>} Result of booking creation
   */
  /* eslint-disable complexity */
  const createBooking = useCallback(async (bookingData, _forceCreate = false) => {
    try {
      // Calculate start_hour from time
      let start_hour = 9; // Default fallback
      if (bookingData.time || bookingData.startTime) {
        const timeStr = bookingData.time || bookingData.startTime;
        const [hours, minutes] = timeStr.split(':').map(Number);
        start_hour = hours + (minutes / 60); // Convert to decimal hours
      }
      
      // Check if this is a multi-participant booking that should use the group endpoint
      const isGroupBooking = bookingData.participants && bookingData.participants.length > 1;
      
      // Only use group endpoint for actual multi-participant bookings
      // Single participant bookings with packages should use regular booking flow
      if (isGroupBooking) {
        logger.debug('Multi-participant booking detected, using group endpoint');
        return await createGroupBooking(bookingData);
      }
      
      logger.debug('Single participant booking, using regular booking flow');

      // For single bookings, extract package information from multiple sources
      let usePackage = bookingData.usePackageHours === true && (bookingData.customerPackageId || bookingData.selectedPackage?.id);
      let packageId = bookingData.customerPackageId || bookingData.selectedPackage?.id || null;
      
  logger.debug('Package extraction from booking data', {
        usePackageHours: bookingData.usePackageHours,
        customerPackageId: bookingData.customerPackageId,
        selectedPackageId: bookingData.selectedPackage?.id,
        extractedPackageId: packageId,
        extractedUsePackage: usePackage
      });
      
      // Check if participant has package information (fallback)
      if (bookingData.participants && bookingData.participants.length > 0) {
        const primaryParticipant = bookingData.participants.find(p => p.isPrimary) || bookingData.participants[0];
        // Only use participant package if both usePackage is true AND they have a selected package
        if (primaryParticipant.usePackage === true && primaryParticipant.selectedPackageId) {
          usePackage = true;
          packageId = primaryParticipant.selectedPackageId || packageId;
          logger.debug('Package info from participant', {
            participantUsePackage: primaryParticipant.usePackage,
            participantPackageId: primaryParticipant.selectedPackageId,
            finalPackageId: packageId
          });
        }
      }

      // Prepare API payload matching the backend endpoint format
      const apiPayload = {
        date: bookingData.date,
        time: bookingData.time || bookingData.startTime,
        duration: Number(bookingData.duration) || 1,
        instructorId: bookingData.instructorId,
        serviceId: bookingData.serviceId,
        start_hour: start_hour,
        user: {
          name: bookingData.user?.name || bookingData.userName || '',
          email: bookingData.user?.email || bookingData.userEmail || '',
          phone: bookingData.user?.phone || bookingData.userPhone || '',
          notes: bookingData.user?.notes || bookingData.notes || ''
        },
        // Package usage logic: enhanced to check participant package info
        use_package: usePackage,
        customerPackageId: packageId,
        // Additional fields to reduce NULL values
        amount: bookingData.servicePrice || bookingData.price || 0,
        finalAmount: bookingData.totalCost || bookingData.servicePrice || bookingData.price || 0,
        paymentStatus: 'paid', // Pay-and-go: default to paid
        checkinStatus: 'pending',
        checkoutStatus: 'pending',
        allowNegativeBalance: bookingData.allowNegativeBalance === true // Allow wallet to go negative if explicitly enabled
      };

      // Debug logging for package consumption
      logger.debug('Package consumption debug', {
        usePackageHours: bookingData.usePackageHours,
        usePackage: usePackage,
        packageId: packageId,
        selectedPackage: bookingData.selectedPackage,
        participants: bookingData.participants?.map(p => ({
          name: p.userName,
          usePackage: p.usePackage,
          selectedPackageId: p.selectedPackageId
        }))
      });
      // Enhanced authentication with auto-login retry
      let authHeaders;
      try {
        authHeaders = await getAuthHeaders();
        logger.debug('Authentication headers obtained for single booking');
      } catch (authError) {
        logger.warn('Initial auth failed for single booking, trying auto-login with retry...', { error: authError });
        
        // Try auto-login with retry mechanism
        const autoLoginSuccess = await autoLoginWithRetry(3);
        if (autoLoginSuccess) {
          logger.debug('Auto-login successful, getting new auth headers for single booking');
          authHeaders = await getAuthHeaders();
        } else {
          throw new Error('Authentication failed: Could not auto-login after multiple attempts');
        }
      }
      
      // Add delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Call the backend API with authentication
      
      const response = await fetch('/api/bookings/calendar', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(apiPayload)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // Create enhanced error with detailed information
        const enhancedError = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        enhancedError.details = errorData.details;
        enhancedError.isConflictError = errorData.error === 'Time slot unavailable' || response.status === 400;
        enhancedError.status = response.status;
        
        throw enhancedError;
      }
      
  const result = await response.json();
      
      // Create standardized booking object for frontend state
      const newBooking = standardizeBookingData({
        id: result.bookingId || result.id || `booking-${Date.now()}`,
        date: bookingData.date,
        time: bookingData.time || bookingData.startTime,
        startTime: bookingData.time || bookingData.startTime,
        endTime: bookingData.endTime,
        duration: Number(bookingData.duration) || 1,
        instructorId: bookingData.instructorId,
        instructor_user_id: bookingData.instructorId,
        instructorName: bookingData.instructorName || instructors.find(i => i.id === bookingData.instructorId)?.name || 'Unknown Instructor',
        serviceId: bookingData.serviceId,
        service_id: bookingData.serviceId,
        serviceName: services.find(s => s.id === bookingData.serviceId)?.name || 'Unknown Service',
        userName: bookingData.user?.name || bookingData.userName,
        studentName: bookingData.user?.name || bookingData.studentName,
        status: 'pending', // Use actual backend status
        checkInStatus: 'pending',
        notes: bookingData.user?.notes || bookingData.notes || '',
        createdAt: new Date().toISOString(),
        ...result
      });
      
  logger.debug('Adding new single booking to calendar state', { newBooking });
      
      // Use unified calendar update system
      await updateCalendarData({
        reason: 'booking-created',
        newBooking: newBooking
      });
      
      // Trigger a background refresh to sync with server data
      setTimeout(() => {
        updateCalendarData({ reason: 'silent', forceFullSync: true });
      }, 2000); // Delay to ensure server has processed and our instant update is visible

      // Dispatch a custom event to notify other components
      window.dispatchEvent(new CustomEvent('booking-created', {
        detail: { booking: newBooking }
      }));
  eventBus.emit('bookings:changed', { reason: 'create', booking: newBooking });
      
      return newBooking;
    } catch (error) {
      handleApiError(error);
      throw error;
    }
  }, [instructors, services, updateCalendarData, createGroupBooking]);
  /* eslint-enable complexity */

  /**
   * Deletes a booking by its ID and refreshes the data.
   */
  const deleteBooking = useCallback(async (bookingId) => {
    if (!bookingId) throw new Error('Booking ID is required for deletion');
    
    try {
      // Track this booking as deleted to prevent it from reappearing
      deletedBookingsRef.current.add(bookingId);
      
      // Immediately remove the booking from current state to prevent ghost booking
      setBookings(prevBookings => {
        const filtered = prevBookings.filter(booking => booking.id !== bookingId);
        // Also filter out any cancelled bookings while we're at it
        return filterActiveBookings(filtered);
      });
      
      // Perform the actual deletion
  await DataService.deleteBooking(bookingId);
      
      // Clear all cache immediately to prevent stale data
      invalidateCache();
      localStorage.removeItem('bookings_cache_timestamp');
      localStorage.removeItem('force_bookings_refresh');
      
      // Use unified calendar update system for deletion
      await updateCalendarData({
        reason: 'booking-deleted',
        deletedBookingId: bookingId
      });

  // Notify listeners that bookings changed
  eventBus.emit('bookings:changed', { reason: 'delete', bookingId });
      
      // Force React re-render by updating refresh counter
      setRefreshCounter(prev => prev + 1);
      
      // Clean up deleted bookings tracker after 5 minutes to prevent memory leaks
      setTimeout(() => {
        deletedBookingsRef.current.delete(bookingId);
      }, 5 * 60 * 1000);
      
    } catch (err) {
      // If deletion failed, remove from deleted tracking and restore state
      deletedBookingsRef.current.delete(bookingId);
  logger.error('Booking deletion failed, will restore state via full refresh', { error: err });
      // Instead of calling refreshData directly, force a full refresh by updating the counter
      setRefreshCounter(prev => prev + 1);
      handleApiError(err);
    }
  }, [updateCalendarData]);

  /**
   * Updates a booking and refreshes the data with retry logic.
   */
  const updateBooking = useCallback(async (bookingId, updateData, retryCount = 0) => {
    const maxRetries = 2;
    const retryDelay = 1000 * (retryCount + 1); // Exponential backoff
    
    try {
      await DataService.updateBooking(bookingId, updateData);
      
      // Force a fresh fetch of bookings data on next refresh
      localStorage.setItem('force_bookings_refresh', 'true');
      
      // Invalidate bookings cache to ensure fresh data
      invalidateCache('bookings');
      
      // Use unified calendar update system for updates
      await updateCalendarData({
        reason: 'booking-updated'
      });

  // Notify listeners that bookings changed
  eventBus.emit('bookings:changed', { reason: 'update', bookingId });
      
    } catch (err) {
      logger.warn(`Update booking attempt ${retryCount + 1} failed`, { error: err });
      
      // Check if it's a rate limiting error and retry
      if (err.response?.status === 429 && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return updateBooking(bookingId, updateData, retryCount + 1);
      }
      
      // Check if it's a server error and retry
      if (err.response?.status >= 500 && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return updateBooking(bookingId, updateData, retryCount + 1);
      }
      
      handleApiError(err);
      throw err; // Re-throw to allow caller to handle
    }
  }, [updateCalendarData]);

  /**
   * Atomically swap two bookings using backend transaction
   */
  const swapBookings = useCallback(async (aId, bId, aTarget, bTarget, date, retryCount = 0) => {
    const maxRetries = 1;
    const retryDelay = 800 * (retryCount + 1);

    try {
      const res = await DataService.swapBookingsAuto(aId, bId, aTarget, bTarget, date);
      const mode = res?.mode === 'parking' ? 'swap-parking' : 'swap';
      invalidateCache('bookings');
      await updateCalendarData({ reason: 'booking-updated' });
      eventBus.emit('bookings:changed', { reason: mode, aId, bId });
      return mode;
    } catch (err) {
      const retriable = err?.response?.status === 429 || (err?.response?.status ?? 0) >= 500;
      if (retriable && retryCount < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelay));
        return swapBookings(aId, bId, aTarget, bTarget, date, retryCount + 1);
      }
      handleApiError(err);
      throw err;
    }
  }, [updateCalendarData]);

  // ==========================================
  // SECTION 7: DATE & VIEW UTILITIES
  // ==========================================
  
  /**
   * Format date to YYYY-MM-DD
   */
  const formatDate = (date) => {
    return format(date, 'yyyy-MM-dd');
  };
  
  /**
   * Get start and end date for the current view
   */
  const getDateRangeForView = useCallback(() => {
    const currentDate = new Date(selectedDate);
    let startDate, endDate;
    
    switch (view) {
      case 'month':
        startDate = startOfMonth(currentDate);
        endDate = endOfMonth(currentDate);
        break;
      case 'week':
        startDate = startOfWeek(currentDate, { weekStartsOn: calendarConfig.ui.firstDayOfWeek || 1 });
        endDate = endOfWeek(currentDate, { weekStartsOn: calendarConfig.ui.firstDayOfWeek || 1 });
        break;
      case 'day':
        startDate = startOfDay(currentDate);
        endDate = endOfDay(currentDate);
        break;
      default:
        startDate = currentDate;
        endDate = currentDate;
    }
      return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd')
    };
  }, [view, selectedDate]);

  // ==========================================
  // SECTION 8: DATA FETCHING & REFRESH
  // ==========================================
  /**
   * Main data refresh function - loads all calendar data
   */  
  const refreshData = useCallback(async () => {
    try {
      logger.info('Loading calendar data...');
      
      // Load all data in parallel
      const [bookingsData, usersData, instructorsData, servicesData] = await Promise.all([
        DataService.getBookings().catch(err => {
          logger.warn('Failed to load bookings', { error: err });
          return getCachedData('bookings') || [];
        }),
        DataService.getUsersWithStudentRole().catch(err => {
          logger.warn('Failed to load users', { error: err });
          return getCachedData('users') || [];
        }),
        DataService.getInstructors().catch(err => {
          logger.warn('Failed to load instructors', { error: err });
          return getCachedData('instructors') || [];
        }),
        DataService.getServices().catch(err => {
          logger.warn('Failed to load services', { error: err });
          return getCachedData('services') || [];
        })
      ]);
      
      // Process bookings data - simplified approach
      if (bookingsData && bookingsData.length >= 0) {
        const standardizedBookings = bookingsData
          .map(booking => {
            try {
              return standardizeBookingData(booking);
            } catch (error) {
              logger.warn('Failed to standardize booking', { id: booking?.id || 'unknown', error: error.message });
              return null;
            }
          })
          .filter(Boolean);
        
        const filteredBookings = filterActiveBookings(standardizedBookings);
        setBookings(filteredBookings);
        setCachedData('bookings', filteredBookings);
      }
      
      // Update users (customers)
      if (usersData && usersData.length >= 0) {
        setUsers(usersData);
        setCachedData('users', usersData);
      }
      
      // Update instructors
      if (instructorsData && instructorsData.length >= 0) {
        setInstructors(instructorsData);
        setCachedData('instructors', instructorsData);
      }
      
      // Update services
      if (servicesData && servicesData.length >= 0) {
        setServices(servicesData);
        setCachedData('services', servicesData);
      }
      
      localStorage.setItem('bookings_cache_timestamp', Date.now().toString());
    logger.info('Calendar data loaded successfully');
      
    } catch (error) {
    logger.error('Failed to load calendar data', { error });
      handleApiError(error);
    }
  }, []);

  // Debounced refresh function to prevent excessive API calls
  const debouncedRefreshData = useMemo(
    () => debounce(refreshData, 300), // 300ms debounce
    [refreshData]
  );

  // Keep latest bookings in a ref for event handlers without adding it to deps
  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  // Initial data load and refresh only when selectedDate changes or manual refresh triggered
  // Removed 'view' dependency to prevent unnecessary refreshes on view switching
  useEffect(() => {
    // Load cached data immediately for better UX
    const cachedBookings = getCachedData('bookings');
    const cachedUsers = getCachedData('users');
    const cachedInstructors = getCachedData('instructors');
    const cachedServices = getCachedData('services');
    
    if (cachedBookings && cachedBookings.length > 0) {
      // Enrich cached bookings with legacy aliases and package flags to avoid N/A flashes
      const enriched = cachedBookings.map(b => ({
        ...b,
        service_name: b.service_name || b.serviceName,
        student_name: b.student_name || b.studentName || b.userName,
        instructor_name: b.instructor_name || b.instructorName,
        payment_status: b.payment_status || b.paymentStatus,
        customer_package_id: b.customer_package_id || b.customerPackageId || null,
      }));
      setBookings(filterActiveBookings(enriched));
    }
    if (cachedUsers && cachedUsers.length > 0) {
      setUsers(cachedUsers);
    }
    if (cachedInstructors && cachedInstructors.length > 0) {
      setInstructors(cachedInstructors);
    }
    if (cachedServices && cachedServices.length > 0) {
      setServices(cachedServices);
    }
    
    // Always refresh data to ensure we have the latest information
    // Use a small delay to avoid overriding instant updates
    logger.debug('Loading fresh calendar data...');
    setTimeout(() => {
      debouncedRefreshData();
    }, 100);
  }, [selectedDate, debouncedRefreshData]); // Only refresh when date changes or on initial load

  /**
   * Get pre-scheduled slots for a specific date
   * @param {Date} date - Date to get slots for
   * @returns {Array} Array of slot objects
   */
  const getPreScheduledSlotsForDate = (date) => {
    const dateString = formatDate(date);
    const dayData = slots.find(s => s.date === dateString);
    return dayData ? dayData.slots : [];
  };
  /**
   * Reset any errors and refresh data
   */
  const retry = () => {
    setError(null);
    refreshData();
  };

  /**
   * Clear cache and force refresh - useful for troubleshooting
   */
  const clearCacheAndRefresh = useCallback(() => {
    invalidateCache(); // Clear all cache
    refreshData();
  }, [refreshData]);

  // Expose cache clearing function globally for debugging
  React.useEffect(() => {
    // Force clear users cache on mount to ensure we get the updated customer list
    invalidateCache('users');
    // Removed extra booking-updated listener that caused duplicate refreshes
    
    window.clearCalendarCache = () => {
      invalidateCache();
      localStorage.removeItem('bookings_cache_timestamp');
      localStorage.removeItem('force_bookings_refresh');
      deletedBookingsRef.current.clear(); // Clear deleted bookings tracker
    };
    
    window.debugCalendarState = () => {
      logger.debug('Calendar Debug State', {
        bookings: bookings.length,
        cachedBookings: getCachedData('bookings')?.length,
        deletedBookings: Array.from(deletedBookingsRef.current),
        cacheAge: Date.now() - (localStorage.getItem('bookings_cache_timestamp') || 0),
        forceRefresh: localStorage.getItem('force_bookings_refresh'),
        isLoading,
        refreshCounter,
        selectedDate: selectedDate.toISOString(),
        currentView: view
      });
      
      // Show today's bookings specifically
      const todaysBookings = bookings.filter(b => b.date === format(new Date(), 'yyyy-MM-dd'));
      logger.debug("Today's bookings", todaysBookings.map(b => ({
        id: b.id,
        date: b.date,
        startTime: b.startTime,
        studentName: b.studentName,
        status: b.status
      })));
    };
    
    window.debugTodaysBookings = () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const todaysBookings = bookings.filter(b => b.date === today);
      logger.debug(`Bookings for ${today}`, todaysBookings);
      return todaysBookings;
    };
    
    return () => {
      // Cleanup globals on unmount
      delete window.clearCalendarCache;
      delete window.debugCalendarState;
      delete window.debugTodaysBookings;
    };
  }, [bookings, isLoading, refreshCounter, refreshData, selectedDate, view]);

  // ==========================================
  // SECTION 9: CONTEXT VALUE & PROVIDER
  // ==========================================
    // Organized context value with grouped exports
  const value = {
    // View State
    view,
    setView, // For external navigation with URL sync
    setViewState, // For internal view changes without URL sync
    selectedDate,
    setSelectedDate,
    selectedSlot,
    setSelectedSlot,
      // Data State
    slots,
    instructors,
    services,
    users, // Users with student role (customers) for booking purposes
    bookings,
    
    // UI State
    isLoading,
    error,
    refreshCounter, // Add refreshCounter to force re-renders
    
    // Filter State
    selectedInstructors,
    setSelectedInstructors,
    selectedServices,
    setSelectedServices,
    showFilters,
    setShowFilters,
      // Operations
    createBooking,
    createGroupBooking,
    checkBookingConflicts,
    refreshData,
    silentRefreshBookings,
    retry,
    deleteBooking,
    updateBooking,
  swapBookings,
    clearCacheAndRefresh,
    getPreScheduledSlotsForDate,
    formatDate,
  getDateRangeForView,
  };
    return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}

// Add displayName for better debugging
CalendarProvider.displayName = 'CalendarProvider';

// Export CalendarContext as named export for useCalendar hook
export { CalendarContext };

// Export CalendarProvider as named export for consistent imports
export { CalendarProvider };

// Make CalendarProvider the default export for Vite Fast Refresh compatibility
export default CalendarProvider;
