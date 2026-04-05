import React, { useState, useEffect } from 'react';
import { weatherService } from '../../shared/services/weatherService';
import { Card, Alert, Spin, Tag, Progress } from 'antd';
import { 
  CloudOutlined, 
  EyeOutlined, 
  ThermometerOutlined,
  DashboardOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';

const WeatherDashboard = ({ location = { lat: 38.3167, lon: 26.2500 } }) => {
  const [currentWeather, setCurrentWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    loadWeatherData();
    // Refresh every 10 minutes
    const interval = setInterval(loadWeatherData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [location]);

  const loadWeatherData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [current, forecastData] = await Promise.all([
        weatherService.getCurrentWeather(location.lat, location.lon),
        weatherService.getForecast(location.lat, location.lon)
      ]);
      
      setCurrentWeather(current);
      setForecast(forecastData.slice(0, 8)); // Next 24 hours (3-hour intervals)
      setLastUpdate(new Date());
    } catch (err) {
      setError('Failed to load weather data');
      console.error('Weather loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConditionColor = (safety) => {
    switch (safety) {
      case 'safe': return 'green';
      case 'caution': return 'orange';
      case 'unsafe': return 'red';
      default: return 'gray';
    }
  };

  const getConditionIcon = (safety) => {
    switch (safety) {
      case 'safe': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'caution': return <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />;
      case 'unsafe': return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      default: return <DashboardOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const formatTime = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  };

  if (loading && !currentWeather) {
    return (
      <Card className="weather-dashboard">
        <div className="text-center py-8">
          <Spin size="large" />
          <p className="mt-4 text-gray-600">Loading weather data...</p>
        </div>
      </Card>
    );
  }

  if (error && !currentWeather) {
    return (
      <Card className="weather-dashboard">
        <Alert
          message="Weather Service Error"
          description={error}
          type="error"
          showIcon
          action={
            <button 
              onClick={loadWeatherData}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="weather-dashboard space-y-6">
      {/* Current Conditions */}
      <Card 
        title={
          <div className="flex items-center justify-between">
            <span className="flex items-center">
              <CloudOutlined className="mr-2" />
              Current Weather - {currentWeather?.location}
            </span>
            <span className="text-sm text-gray-500">
              Updated: {lastUpdate ? formatTime(lastUpdate) : 'Never'}
            </span>
          </div>
        }
        className="shadow-lg"
      >
        {currentWeather && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Weather Overview */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <img
                  src={`https://openweathermap.org/img/wn/${currentWeather.weather.icon}@2x.png`}
                  alt={currentWeather.weather.description}
                  className="w-16 h-16"
                />
                <div>
                  <div className="text-3xl font-bold">{currentWeather.temperature}°C</div>
                  <div className="text-gray-600 capitalize">{currentWeather.weather.description}</div>
                  <div className="text-sm text-gray-500">Feels like {currentWeather.feelsLike}°C</div>
                </div>
              </div>
            </div>

            {/* Wind Conditions */}
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-700">Wind Conditions</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Speed:</span>
                  <span className="font-medium">{currentWeather.wind.speed} knots</span>
                </div>
                <div className="flex justify-between">
                  <span>Gusts:</span>
                  <span className="font-medium">{currentWeather.wind.gust} knots</span>
                </div>
                <div className="flex justify-between">
                  <span>Direction:</span>
                  <span className="font-medium">{currentWeather.wind.direction}° ({currentWeather.wind.directionText})</span>
                </div>
              </div>
            </div>

            {/* Additional Info */}
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-700">Additional Info</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Humidity:</span>
                  <span>{currentWeather.humidity}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Visibility:</span>
                  <span>{currentWeather.visibility} km</span>
                </div>
                <div className="flex justify-between">
                  <span>Pressure:</span>
                  <span>{currentWeather.pressure} hPa</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Kitesurfing Conditions */}
      {currentWeather?.kitesurfingConditions && (
        <Card 
          title={
            <span className="flex items-center">
              {getConditionIcon(currentWeather.kitesurfingConditions.safety)}
              <span className="ml-2">Kitesurfing Conditions</span>
            </span>
          }
          className="shadow-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Condition Score */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span>Condition Score</span>
                  <span className="font-medium">{currentWeather.kitesurfingConditions.score}/100</span>
                </div>
                <Progress 
                  percent={currentWeather.kitesurfingConditions.score} 
                  strokeColor={getConditionColor(currentWeather.kitesurfingConditions.safety)}
                  showInfo={false}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Tag color={getConditionColor(currentWeather.kitesurfingConditions.safety)} className="uppercase">
                  {currentWeather.kitesurfingConditions.rating}
                </Tag>
                <Tag color={currentWeather.kitesurfingConditions.suitable ? 'green' : 'red'}>
                  {currentWeather.kitesurfingConditions.suitable ? 'Suitable' : 'Not Suitable'}
                </Tag>
              </div>

              <div>
                <span className="font-medium">Recommended Level: </span>
                <Tag color="blue" className="capitalize">
                  {currentWeather.kitesurfingConditions.recommendedLevel}
                </Tag>
              </div>
            </div>

            {/* Conditions List */}
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-700">Current Conditions</h4>
              <ul className="space-y-1">
                {currentWeather.kitesurfingConditions.conditions.map((condition, index) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="w-2 h-2 bg-gray-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    {condition}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Safety Alert */}
          {currentWeather.kitesurfingConditions.safety === 'unsafe' && (
            <Alert
              message="Unsafe Conditions"
              description="Current weather conditions are not safe for kitesurfing. All bookings should be cancelled."
              type="error"
              showIcon
              className="mt-4"
            />
          )}
          {currentWeather.kitesurfingConditions.safety === 'caution' && (
            <Alert
              message="Caution Required"
              description="Weather conditions require extra caution. Only suitable for experienced riders."
              type="warning"
              showIcon
              className="mt-4"
            />
          )}
        </Card>
      )}

      {/* 24-Hour Forecast */}
      {forecast.length > 0 && (
        <Card title="24-Hour Forecast" className="shadow-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {forecast.map((item, index) => (
              <div key={index} className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium mb-2">
                  {formatTime(item.datetime)}
                </div>
                <img
                  src={`https://openweathermap.org/img/wn/${item.weather.icon}.png`}
                  alt={item.weather.description}
                  className="w-8 h-8 mx-auto mb-2"
                />
                <div className="text-sm font-medium mb-1">
                  {item.temperature}°C
                </div>
                <div className="text-xs text-gray-600 mb-2">
                  {item.wind.speed} kts
                </div>
                <Tag 
                  size="small" 
                  color={getConditionColor(item.kitesurfingConditions.safety)}
                  className="text-xs"
                >
                  {item.kitesurfingConditions.rating}
                </Tag>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="text-center">
        <button
          onClick={loadWeatherData}
          disabled={loading}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Refreshing...' : 'Refresh Weather Data'}
        </button>
      </div>
    </div>
  );
};

export default WeatherDashboard;
