// src/shared/hooks/useRealTime.js
import { useState, useEffect, useCallback } from 'react';
import { realTimeService } from '../services/realTimeService';

/**
 * Main hook for real-time functionality
 */
export const useRealTime = () => {
  const [status, setStatus] = useState(realTimeService.getStatus());

  useEffect(() => {
    // Auto-connect if user is authenticated (check localStorage instead of API)
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser && !status.isConnected && !status.isConnecting) {
      realTimeService.connect();
    }

    // Update status periodically
    const interval = setInterval(() => {
      setStatus(realTimeService.getStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const connect = useCallback(() => {
    realTimeService.connect();
  }, []);

  const disconnect = useCallback(() => {
    realTimeService.disconnect();
    setStatus(realTimeService.getStatus());
  }, []);

  return {
    ...status,
    connect,
    disconnect
  };
};

/**
 * Hook for listening to specific real-time events
 */
export const useRealTimeEvents = (events = []) => {
  const [eventData, setEventData] = useState({});

  useEffect(() => {
    const handleEvent = (eventName) => (data) => {
      setEventData(prev => ({
        ...prev,
        [eventName]: {
          data,
          timestamp: Date.now()
        }
      }));
    };

    // Set up event listeners
    const handlers = {};
    events.forEach(event => {
      handlers[event] = handleEvent(event);
      realTimeService.on(event, handlers[event]);
    });

    // Cleanup
    return () => {
      events.forEach(event => {
        if (handlers[event]) {
          realTimeService.off(event, handlers[event]);
        }
      });
    };
  }, [events]);

  return eventData;
};

/**
 * Hook for real-time data synchronization
 */
export const useRealTimeSync = (eventName, onUpdate) => {
  useEffect(() => {
    if (!eventName || !onUpdate) return;

    const handleUpdate = (data) => {
      onUpdate(data);
    };

    realTimeService.on(eventName, handleUpdate);

    return () => {
      realTimeService.off(eventName, handleUpdate);
    };
  }, [eventName, onUpdate]);
};

/**
 * Hook for dashboard real-time updates
 */
export const useDashboardRealTime = () => {
  const [updates, setUpdates] = useState({});

  useEffect(() => {
    const handleDashboardRefresh = () => {
      setUpdates(prev => ({
        ...prev,
        refresh: Date.now()
      }));
    };

    const handleStatsUpdate = (data) => {
      setUpdates(prev => ({
        ...prev,
        stats: data,
        lastUpdate: Date.now()
      }));
    };

    const handleBookingUpdate = (data) => {
      setUpdates(prev => ({
        ...prev,
        bookings: data,
        lastUpdate: Date.now()
      }));
    };

    // Set up listeners
    realTimeService.on('dashboard:refresh', handleDashboardRefresh);
    realTimeService.on('stats:updated', handleStatsUpdate);
    realTimeService.on('booking:created', handleBookingUpdate);
    realTimeService.on('booking:updated', handleBookingUpdate);
    realTimeService.on('booking:deleted', handleBookingUpdate);

    return () => {
      realTimeService.off('dashboard:refresh', handleDashboardRefresh);
      realTimeService.off('stats:updated', handleStatsUpdate);
      realTimeService.off('booking:created', handleBookingUpdate);
      realTimeService.off('booking:updated', handleBookingUpdate);
      realTimeService.off('booking:deleted', handleBookingUpdate);
    };
  }, []);

  return updates;
};

export default useRealTime;