import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { 
  Cog6ToothIcon, 
  MapPinIcon, 
  GlobeAltIcon, 
  ChartBarIcon,
  PlusIcon,
  TrashIcon 
} from '@heroicons/react/24/outline';
import { logger } from '@/shared/utils/logger';

/**
 * Forecast Settings Component
 * Allows users to configure wind forecast preferences
 */
const ForecastSettings = ({ onSave }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [newLocationUrl, setNewLocationUrl] = useState('');
  const [error, setError] = useState('');

  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      windUnit: 'knts', // knts, kmh, mph, beaufort
      defaultLocation: '',
      dataSource: 'windguru', // windguru, openmeteo
      updateInterval: 60, // minutes
      showForecast: true, // Main toggle for forecast display
      showDirection: true,
      showGustSpeed: false,
      colorCoding: true
    }
  });

  const dataSource = watch('dataSource');

  // Load saved settings on mount
  const loadForecastSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settings = localStorage.getItem('forecastSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        Object.keys(parsed).forEach(key => {
          setValue(key, parsed[key]);
        });
        if (parsed.locations) {
          setLocations(parsed.locations);
        }
      }
    } catch (err) {
      logger.error('Error loading forecast settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [setValue]);

  useEffect(() => {
    loadForecastSettings();
  }, [loadForecastSettings]);

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    
    try {
      const settings = {
        ...data,
        locations,
        updatedAt: new Date().toISOString()
      };

      // Save to localStorage for now (can be extended to backend later)
      localStorage.setItem('forecastSettings', JSON.stringify(settings));
      
      // Trigger callback to parent component
      if (onSave) {
        onSave(settings);
      }

      // Dispatch custom event for other components to listen
      window.dispatchEvent(new CustomEvent('forecastSettingsChanged', { 
        detail: settings 
      }));
      
    } catch (err) {
      logger.error('Error saving forecast settings:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const extractSpotFromWindguruUrl = (url) => {
    try {
      // Extract spot ID from Windguru URL
      // Examples: 
      // https://www.windguru.cz/574666
      // https://micro.windguru.cz/?s=574666&m=all&tz=auto
      const patterns = [
        /windguru\.cz\/(\d+)/,
        /[?&]s=(\d+)/
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1];
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const addLocation = () => {
    if (!newLocationUrl.trim()) {
      setError('Please enter a valid Windguru URL');
      return;
    }

    const spotId = extractSpotFromWindguruUrl(newLocationUrl);
    if (!spotId) {
      setError('Invalid Windguru URL. Please check the format.');
      return;
    }

    // Check if location already exists
    if (locations.some(loc => loc.spotId === spotId)) {
      setError('This location is already added.');
      return;
    }

    const newLocation = {
      id: Date.now().toString(),
      spotId,
      name: `Windguru Spot ${spotId}`, // Will be enhanced to fetch actual name
      url: newLocationUrl.trim(),
      addedAt: new Date().toISOString()
    };

    setLocations(prev => [...prev, newLocation]);
    setNewLocationUrl('');
    setError('');
  };

  const removeLocation = (locationId) => {
    setLocations(prev => prev.filter(loc => loc.id !== locationId));
  };

  const windUnitOptions = [
    { value: 'knts', label: 'Knots (kn)', description: 'Nautical miles per hour' },
    { value: 'kmh', label: 'Kilometers/hour (km/h)', description: 'Metric speed unit' },
    { value: 'mph', label: 'Miles/hour (mph)', description: 'Imperial speed unit' },
    { value: 'beaufort', label: 'Beaufort Scale', description: 'Wind force scale 0-12' }
  ];

  const dataSourceOptions = [
    { value: 'windguru', label: 'Windguru', description: 'Professional wind forecasting' },
    { value: 'openmeteo', label: 'Open-Meteo', description: 'Free weather API' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <ChartBarIcon className="h-6 w-6 text-blue-600" />
        <h3 className="text-lg font-medium text-gray-900">Forecast Settings</h3>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Wind Unit Selection */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Wind Speed Unit
          </label>
          <div className="space-y-3">
            {windUnitOptions.map(option => (
              <label key={option.value} className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  value={option.value}
                  {...register('windUnit', { required: true })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{option.label}</div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Data Source Selection */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            <GlobeAltIcon className="inline h-4 w-4 mr-1" />
            Data Source
          </label>
          <div className="space-y-3">
            {dataSourceOptions.map(option => (
              <label key={option.value} className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  value={option.value}
                  {...register('dataSource', { required: true })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{option.label}</div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Location Management */}
        {dataSource === 'windguru' && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <MapPinIcon className="inline h-4 w-4 mr-1" />
              Windguru Locations
            </label>
            
            {/* Add New Location */}
            <div className="mb-4">
              <div className="flex space-x-2">
                <input
                  type="url"
                  value={newLocationUrl}
                  onChange={(e) => setNewLocationUrl(e.target.value)}
                  placeholder="https://www.windguru.cz/574666 or https://micro.windguru.cz/?s=574666"
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
                <button
                  type="button"
                  onClick={addLocation}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm flex items-center space-x-1"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>Add</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Add Windguru spot URLs like: https://www.windguru.cz/574666 (Urla Gülbahçe example)
              </p>
            </div>

            {/* Location List */}
            {locations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Added Locations:</h4>
                {locations.map(location => (
                  <div key={location.id} className="flex items-center justify-between p-3 bg-white rounded border">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{location.name}</div>
                      <div className="text-xs text-gray-500">Spot ID: {location.spotId}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLocation(location.id)}
                      className="p-1 text-red-600 hover:text-red-800"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Default Location Selection */}
            {locations.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Location
                </label>
                <select
                  {...register('defaultLocation')}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                >
                  <option value="">Select default location...</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.spotId}>
                      {location.name} (Spot {location.spotId})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Display Options */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            <Cog6ToothIcon className="inline h-4 w-4 mr-1" />
            Display Options
          </label>
          
          <div className="space-y-3">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                {...register('showForecast')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium text-gray-900">Enable forecast overlay in calendar</span>
            </label>
            
            <div className="border-l-2 border-gray-200 pl-4 space-y-3">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  {...register('showDirection')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Show wind direction arrows</span>
              </label>

              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  {...register('showGustSpeed')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Show gust speeds</span>
              </label>

              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  {...register('colorCoding')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Color-coded wind strength</span>
              </label>
            </div>
          </div>
        </div>

        {/* Update Interval */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Update Interval (minutes)
          </label>
          <select
            {...register('updateInterval', { required: true })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={180}>3 hours</option>
          </select>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Cog6ToothIcon className="h-4 w-4" />
                <span>Save Forecast Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ForecastSettings;