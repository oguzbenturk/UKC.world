// src/shared/contexts/BookingContext.jsx - Optimized context implementation
import React, { createContext, useContext, useReducer, useMemo, useCallback } from 'react';
import DataService from '../services/dataService';

// Separate contexts for better performance - only re-renders when needed
const BookingStateContext = createContext();
const BookingDispatchContext = createContext();

// Action types
const BOOKING_ACTIONS = {
  SET_BOOKINGS: 'SET_BOOKINGS',
  ADD_BOOKING: 'ADD_BOOKING',
  UPDATE_BOOKING: 'UPDATE_BOOKING',
  DELETE_BOOKING: 'DELETE_BOOKING',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_FILTER: 'SET_FILTER'
};

const bookingReducer = (state, action) => {
  switch (action.type) {
    case BOOKING_ACTIONS.SET_BOOKINGS:
      return { 
        ...state, 
        bookings: action.payload, 
        loading: false,
        error: null 
      };
    
    case BOOKING_ACTIONS.ADD_BOOKING:
      return { 
        ...state, 
        bookings: [...state.bookings, action.payload],
        error: null
      };
    
    case BOOKING_ACTIONS.UPDATE_BOOKING:
      return {
        ...state,
        bookings: state.bookings.map(booking =>
          booking.id === action.payload.id ? action.payload : booking
        ),
        error: null
      };
    
    case BOOKING_ACTIONS.DELETE_BOOKING:
      return {
        ...state,
        bookings: state.bookings.filter(booking => booking.id !== action.payload),
        error: null
      };
    
    case BOOKING_ACTIONS.SET_LOADING:
      return { ...state, loading: action.payload };
    
    case BOOKING_ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    
    case BOOKING_ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };
    
    case BOOKING_ACTIONS.SET_FILTER:
      return { ...state, filter: { ...state.filter, ...action.payload } };
    
    default:
      return state;
  }
};

const initialState = {
  bookings: [],
  loading: false,
  error: null,
  filter: {
    dateRange: null,
    instructorId: null,
    status: null,
    serviceType: null
  }
};

export const BookingProvider = ({ children }) => {
  const [state, dispatch] = useReducer(bookingReducer, initialState);

  // Memoized selectors for better performance
  const selectors = useMemo(() => ({
    getAllBookings: () => state.bookings,
    
    getBookingsByDate: (date) => 
      state.bookings.filter(booking => booking.date === date),
    
    getBookingsByDateRange: (startDate, endDate) =>
      state.bookings.filter(booking => {
        const bookingDate = new Date(booking.date);
        return bookingDate >= new Date(startDate) && bookingDate <= new Date(endDate);
      }),
    
    getBookingsByInstructor: (instructorId) =>
      state.bookings.filter(booking => booking.instructor_user_id === instructorId),
    
    getBookingsByService: (serviceId) =>
      state.bookings.filter(booking => booking.service_id === serviceId),
    
    getBookingsByStatus: (status) =>
      state.bookings.filter(booking => booking.status === status),
    
    getUpcomingBookings: () => {
      const today = new Date().toISOString().split('T')[0];
      return state.bookings.filter(booking => booking.date >= today);
    },
    
    getTodaysBookings: () => {
      const today = new Date().toISOString().split('T')[0];
      return state.bookings.filter(booking => booking.date === today);
    },
    
    getBookingById: (id) =>
      state.bookings.find(booking => booking.id === id),
    
    getBookingStats: () => {
      const total = state.bookings.length;
      const confirmed = state.bookings.filter(b => b.status === 'confirmed').length;
      const pending = state.bookings.filter(b => b.status === 'pending').length;
      const cancelled = state.bookings.filter(b => b.status === 'cancelled').length;
      
      return { total, confirmed, pending, cancelled };
    },
    
    getFilteredBookings: () => {
      let filtered = state.bookings;
      
      if (state.filter.dateRange) {
        const { start, end } = state.filter.dateRange;
        filtered = filtered.filter(booking => {
          const bookingDate = new Date(booking.date);
          return bookingDate >= new Date(start) && bookingDate <= new Date(end);
        });
      }
      
      if (state.filter.instructorId) {
        filtered = filtered.filter(booking => 
          booking.instructor_user_id === state.filter.instructorId
        );
      }
      
      if (state.filter.status) {
        filtered = filtered.filter(booking => booking.status === state.filter.status);
      }
      
      if (state.filter.serviceType) {
        filtered = filtered.filter(booking => booking.service_type === state.filter.serviceType);
      }
      
      return filtered;
    }
  }), [state.bookings, state.filter]);

  // Memoized action creators
  const actions = useMemo(() => ({
    setBookings: (bookings) => 
      dispatch({ type: BOOKING_ACTIONS.SET_BOOKINGS, payload: bookings }),
    
    addBooking: (booking) => 
      dispatch({ type: BOOKING_ACTIONS.ADD_BOOKING, payload: booking }),
    
    updateBooking: (booking) => 
      dispatch({ type: BOOKING_ACTIONS.UPDATE_BOOKING, payload: booking }),
    
    deleteBooking: (bookingId) => 
      dispatch({ type: BOOKING_ACTIONS.DELETE_BOOKING, payload: bookingId }),
    
    setLoading: (loading) => 
      dispatch({ type: BOOKING_ACTIONS.SET_LOADING, payload: loading }),
    
    setError: (error) => 
      dispatch({ type: BOOKING_ACTIONS.SET_ERROR, payload: error }),
    
    clearError: () => 
      dispatch({ type: BOOKING_ACTIONS.CLEAR_ERROR }),
    
    setFilter: (filter) => 
      dispatch({ type: BOOKING_ACTIONS.SET_FILTER, payload: filter }),
    
    clearFilter: () => 
      dispatch({ type: BOOKING_ACTIONS.SET_FILTER, payload: initialState.filter })
  }), []);

  // Async action creators with error handling
  const asyncActions = useMemo(() => ({
    fetchBookings: useCallback(async () => {
      try {
        actions.setLoading(true);
        actions.clearError();
        const bookings = await DataService.getBookings();
        actions.setBookings(bookings);
      } catch (error) {
        console.error('Error fetching bookings:', error);
        actions.setError(error.message || 'Failed to fetch bookings');
      }
    }, [actions]),
    
    createBooking: useCallback(async (bookingData) => {
      try {
        actions.clearError();
        const newBooking = await DataService.createBooking(bookingData);
        actions.addBooking(newBooking);
        return newBooking;
      } catch (error) {
        console.error('Error creating booking:', error);
        actions.setError(error.message || 'Failed to create booking');
        throw error;
      }
    }, [actions]),
    
    updateBookingData: useCallback(async (id, bookingData) => {
      try {
        actions.clearError();
        const updatedBooking = await DataService.updateBooking(id, bookingData);
        actions.updateBooking(updatedBooking);
        return updatedBooking;
      } catch (error) {
        console.error('Error updating booking:', error);
        actions.setError(error.message || 'Failed to update booking');
        throw error;
      }
    }, [actions]),
    
    removeBooking: useCallback(async (id) => {
      try {
        actions.clearError();
        await DataService.deleteBooking(id);
        actions.deleteBooking(id);
      } catch (error) {
        console.error('Error deleting booking:', error);
        actions.setError(error.message || 'Failed to delete booking');
        throw error;
      }
    }, [actions])
  }), [actions]);

  // Combine state and selectors for the state context
  const stateValue = useMemo(() => ({
    ...state,
    ...selectors
  }), [state, selectors]);

  // Combine actions for the dispatch context
  const dispatchValue = useMemo(() => ({
    ...actions,
    ...asyncActions
  }), [actions, asyncActions]);

  return (
    <BookingStateContext.Provider value={stateValue}>
      <BookingDispatchContext.Provider value={dispatchValue}>
        {children}
      </BookingDispatchContext.Provider>
    </BookingStateContext.Provider>
  );
};

// Custom hooks for consuming the contexts
export const useBookingState = () => {
  const context = useContext(BookingStateContext);
  if (!context) {
    throw new Error('useBookingState must be used within a BookingProvider');
  }
  return context;
};

export const useBookingDispatch = () => {
  const context = useContext(BookingDispatchContext);
  if (!context) {
    throw new Error('useBookingDispatch must be used within a BookingProvider');
  }
  return context;
};

// Combined hook for components that need both
export const useBooking = () => {
  return {
    ...useBookingState(),
    ...useBookingDispatch()
  };
};

// Export action types for use in components
export { BOOKING_ACTIONS };
