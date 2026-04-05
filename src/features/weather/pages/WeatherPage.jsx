import React, { useState, useEffect } from 'react';
import { useFeatures } from '../../../shared/contexts/FeaturesContext';
import WeatherDashboard from '../components/WeatherDashboard';
import { 
  CloudIcon, 
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

const SafetyGuidelines = () => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
        <InformationCircleIcon className="h-5 w-5 mr-2 text-blue-500" />
        Safety Guidelines
      </h3>
      
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-medium text-green-800 mb-2 flex items-center">
              <CheckCircleIcon className="h-4 w-4 mr-1" />
              Beginner Safe
            </h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• Wind: 12-18 m/s</li>
              <li>• Gusts: &lt;25 m/s</li>
              <li>• Temperature: &gt;15°C</li>
              <li>• Good visibility</li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-medium text-yellow-800 mb-2 flex items-center">
              <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
              Intermediate
            </h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Wind: 10-22 m/s</li>
              <li>• Gusts: &lt;30 m/s</li>
              <li>• Temperature: &gt;12°C</li>
              <li>• Moderate conditions</li>
            </ul>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2 flex items-center">
              <CloudIcon className="h-4 w-4 mr-1" />
              Advanced
            </h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Wind: 8-25 m/s</li>
              <li>• Gusts: &lt;35 m/s</li>
              <li>• Temperature: &gt;10°C</li>
              <li>• All conditions</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="font-medium text-red-800 mb-2">⚠️ Dangerous Conditions</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-red-700">
            <ul className="space-y-1">
              <li>• Wind &lt;8 m/s or &gt;25 m/s</li>
              <li>• Gusts &gt;35 m/s</li>
              <li>• Temperature &lt;10°C</li>
            </ul>
            <ul className="space-y-1">
              <li>• Thunderstorms</li>
              <li>• Poor visibility (&lt;1km)</li>
              <li>• Strong offshore winds</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const BookingAlerts = () => {
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [weatherAlerts, setWeatherAlerts] = useState([]);

  useEffect(() => {
    // Mock data - in real app, this would come from API
    setUpcomingBookings([
      {
        id: 1,
        student_name: 'John Smith',
        lesson_date: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        lesson_type: 'Beginner Lesson',
        weather_suitable: true
      },
      {
        id: 2,
        student_name: 'Sarah Johnson',
        lesson_date: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
        lesson_type: 'Advanced Lesson',
        weather_suitable: false
      }
    ]);

    setWeatherAlerts([
      {
        id: 1,
        type: 'warning',
        message: 'Strong wind gusts expected this afternoon (30+ m/s)',
        timestamp: new Date()
      }
    ]);
  }, []);

  return (
    <div className="space-y-6">
      {weatherAlerts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-medium text-yellow-800 mb-2 flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
            Weather Alerts
          </h3>
          <div className="space-y-2">
            {weatherAlerts.map(alert => (
              <div key={alert.id} className="text-sm text-yellow-700">
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Upcoming Bookings & Weather Impact
        </h3>
        
        {upcomingBookings.length === 0 ? (
          <p className="text-slate-500">No upcoming bookings in the next 24 hours</p>
        ) : (
          <div className="space-y-3">
            {upcomingBookings.map(booking => (
              <div 
                key={booking.id} 
                className={`p-4 rounded-lg border ${
                  booking.weather_suitable 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{booking.student_name}</p>
                    <p className="text-sm text-slate-600">
                      {booking.lesson_type} • {booking.lesson_date.toLocaleTimeString()}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    booking.weather_suitable
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {booking.weather_suitable ? 'Weather OK' : 'Weather Risk'}
                  </div>
                </div>
                {!booking.weather_suitable && (
                  <p className="text-sm text-red-600 mt-2">
                    ⚠️ Consider rescheduling due to unsafe weather conditions
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const WeatherPage = () => {
  const { weather, refreshWeather } = useFeatures();
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    // Initial weather load
    refreshWeather();

    // Set up auto-refresh every 30 minutes
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        refreshWeather();
      }, 30 * 60 * 1000); // 30 minutes
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Weather & Safety Dashboard</h1>
            <p className="text-slate-600 mt-2">
              Real-time weather conditions and safety assessments for business operations
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 shadow-sm focus:border-sky-300 focus:ring focus:ring-sky-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-slate-600">Auto-refresh</span>
            </label>
            
            <button
              onClick={refreshWeather}
              disabled={weather.loading}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {weather.loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </>
              ) : (
                <>
                  <CloudIcon className="h-4 w-4 mr-2" />
                  Refresh
                </>
              )}
            </button>
          </div>
        </div>
        
        {weather.lastUpdated && (
          <p className="text-sm text-slate-500 mt-2">
            Last updated: {weather.lastUpdated.toLocaleString()}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main weather dashboard */}
        <div className="lg:col-span-2">
          <WeatherDashboard />
        </div>

        {/* Side panel with alerts and bookings */}
        <div className="space-y-6">
          <BookingAlerts />
        </div>
      </div>

      {/* Safety guidelines */}
      <div className="mt-8">
        <SafetyGuidelines />
      </div>

      {weather.error && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
            <p className="text-red-800">Error loading weather data: {weather.error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherPage;
