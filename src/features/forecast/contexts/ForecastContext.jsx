import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/shared/utils/logger';
import { getWindClasses } from '../utils/windClasses';
import { ForecastContext } from './context';

export const ForecastProvider = ({ children }) => {
  const [settings, setSettings] = useState({
    windUnit: 'knts',
    defaultLocation: '',
    dataSource: 'windguru',
    updateInterval: 60,
    showForecast: true, // Main toggle for forecast display
    showDirection: true,
    showGustSpeed: false,
    colorCoding: true,
    locations: []
  });
  
  const [windData, setWindData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Define loadSettings function first
  const loadSettings = useCallback(() => {
    try {
      const stored = localStorage.getItem('forecastSettings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings(prev => ({ ...prev, ...parsed }));
      }
    } catch (error) {
      logger.error('Error loading forecast settings:', error);
    }
  }, []);

  // Load settings from localStorage on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Listen for settings changes from other components
  useEffect(() => {
    const handleSettingsChange = (event) => {
      setSettings(event.detail);
    };

    window.addEventListener('forecastSettingsChanged', handleSettingsChange);
    return () => window.removeEventListener('forecastSettingsChanged', handleSettingsChange);
  }, []);

  const saveSettings = useCallback((newSettings) => {
    try {
      const updated = { ...settings, ...newSettings, updatedAt: new Date().toISOString() };
      localStorage.setItem('forecastSettings', JSON.stringify(updated));
      setSettings(updated);
      
      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('forecastSettingsChanged', { 
        detail: updated 
      }));
      
      return updated;
    } catch (error) {
      logger.error('Error saving forecast settings:', error);
      throw error;
    }
  }, [settings]);

  // Wind unit conversion utilities
  // Convert to Beaufort scale - defined first to avoid hoisting issues
  const convertToBeaufort = useCallback((knots) => {
    if (knots < 1) return 0;
    if (knots <= 3) return 1;
    if (knots <= 6) return 2;
    if (knots <= 10) return 3;
    if (knots <= 16) return 4;
    if (knots <= 21) return 5;
    if (knots <= 27) return 6;
    if (knots <= 33) return 7;
    if (knots <= 40) return 8;
    if (knots <= 47) return 9;
    if (knots <= 55) return 10;
    if (knots <= 63) return 11;
    return 12;
  }, []);

  const convertWindSpeed = useCallback((speedKnots, toUnit) => {
    if (!speedKnots || speedKnots === 0) return 0;
    
    switch (toUnit) {
      case 'kmh':
        return Math.round(speedKnots * 1.852);
      case 'mph':
        return Math.round(speedKnots * 1.151);
      case 'beaufort':
        return convertToBeaufort(speedKnots);
      case 'knts':
      default:
        return speedKnots;
    }
  }, [convertToBeaufort]);

  const getWindUnitLabel = useCallback((unit) => {
    switch (unit) {
      case 'kmh': return 'km/h';
      case 'mph': return 'mph';
      case 'beaufort': return 'bf';
      case 'knts':
      default: return 'knts';
    }
  }, []);

  // Fetch wind data for a specific date
  const fetchWindData = useCallback(async (date, location = null) => {
    setIsLoading(true);
    
    try {
      const spotId = location || settings.defaultLocation;
      const params = new URLSearchParams({
        date: typeof date === 'string' ? date : date.toISOString().split('T')[0]
      });

      if (spotId) {
        params.append('spotId', spotId);
      }

      const response = await fetch(`/api/weather/hourly?${params}`);
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Convert wind speeds to user's preferred unit
      const convertedData = {};
      Object.keys(data.hours || {}).forEach(hour => {
        const hourData = data.hours[hour];
        convertedData[hour] = {
          ...hourData,
          speedKn: hourData.speedKn,
          speedConverted: convertWindSpeed(hourData.speedKn, settings.windUnit),
          gustKn: hourData.gustKn,
          gustConverted: hourData.gustKn ? convertWindSpeed(hourData.gustKn, settings.windUnit) : null,
          unit: settings.windUnit,
          unitLabel: getWindUnitLabel(settings.windUnit)
        };
      });

      setWindData(convertedData);
      setLastUpdate(new Date());
      
      return convertedData;
    } catch (error) {
      logger.error('Error fetching wind data:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [settings.defaultLocation, settings.windUnit, convertWindSpeed, getWindUnitLabel]);

  // Get wind color classes - wrapped utility function
  const getWindClassesWithSettings = useCallback((speed, unit = settings.windUnit) => {
    return getWindClasses(speed, unit);
  }, [settings.windUnit]);

  // Auto-refresh wind data based on update interval
  useEffect(() => {
    if (!lastUpdate || !settings.updateInterval) return;

    const intervalMs = settings.updateInterval * 60 * 1000;
    const timeoutId = setTimeout(() => {
      const today = new Date().toISOString().split('T')[0];
      fetchWindData(today).catch(error => {
        logger.warn('Auto-refresh wind data failed:', error);
      });
    }, intervalMs);

    return () => clearTimeout(timeoutId);
  }, [lastUpdate, settings.updateInterval, fetchWindData]);

  const value = {
    // Settings
    settings,
    saveSettings,
    loadSettings,
    
    // Wind data
    windData,
    fetchWindData,
    isLoading,
    lastUpdate,
    
    // Utilities
    convertWindSpeed,
    getWindUnitLabel,
    getWindClasses: getWindClassesWithSettings,
    
    // Constants
    windUnits: [
      { value: 'knts', label: 'Knots', shortLabel: 'kn' },
      { value: 'kmh', label: 'km/h', shortLabel: 'km/h' },
      { value: 'mph', label: 'mph', shortLabel: 'mph' },
      { value: 'beaufort', label: 'Beaufort', shortLabel: 'bf' }
    ]
  };

  return (
    <ForecastContext.Provider value={value}>
      {children}
    </ForecastContext.Provider>
  );
};

export default ForecastProvider;