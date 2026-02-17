import axios from 'axios';

class WeatherService {
  constructor() {
    this.apiKey = process.env.REACT_APP_WEATHER_API_KEY || 'demo-key';
    this.baseUrl = 'https://api.openweathermap.org/data/2.5';
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Get current weather conditions for kitesurfing location
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} Weather data with kitesurfing conditions
   */
  async getCurrentWeather(lat = 38.3167, lon = 26.2500) { // Default: Urla, Turkey
    const cacheKey = `current_${lat}_${lon}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const response = await axios.get(`${this.baseUrl}/weather`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'metric'
        }
      });

      const weatherData = this.processWeatherData(response.data);
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: weatherData,
        timestamp: Date.now()
      });

      return weatherData;
    } catch (error) {
      console.error('Weather API error:', error);
      return this.getFallbackWeatherData();
    }
  }

  /**
   * Get 5-day weather forecast
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Array>} 5-day forecast data
   */
  async getForecast(lat = 38.3167, lon = 26.2500) {
    const cacheKey = `forecast_${lat}_${lon}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const response = await axios.get(`${this.baseUrl}/forecast`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'metric'
        }
      });

      const forecastData = this.processForecastData(response.data);
      
      this.cache.set(cacheKey, {
        data: forecastData,
        timestamp: Date.now()
      });

      return forecastData;
    } catch (error) {
      console.error('Forecast API error:', error);
      return [];
    }
  }

  /**
   * Process raw weather data into kitesurfing-relevant format
   */
  processWeatherData(rawData) {
    const windSpeed = rawData.wind?.speed * 1.94384 || 0; // Convert m/s to knots
    const windDirection = rawData.wind?.deg || 0;
    const gustSpeed = rawData.wind?.gust ? rawData.wind.gust * 1.94384 : windSpeed * 1.3;

    return {
      location: rawData.name,
      timestamp: new Date(),
      temperature: Math.round(rawData.main.temp),
      feelsLike: Math.round(rawData.main.feels_like),
      humidity: rawData.main.humidity,
      pressure: rawData.main.pressure,
      visibility: rawData.visibility / 1000, // Convert to km
      weather: {
        main: rawData.weather[0].main,
        description: rawData.weather[0].description,
        icon: rawData.weather[0].icon
      },
      wind: {
        speed: Math.round(windSpeed),
        direction: windDirection,
        gust: Math.round(gustSpeed),
        directionText: this.getWindDirectionText(windDirection)
      },
      kitesurfingConditions: this.evaluateKitesurfingConditions({
        windSpeed: Math.round(windSpeed),
        gustSpeed: Math.round(gustSpeed),
        weather: rawData.weather[0].main,
        visibility: rawData.visibility / 1000,
        temperature: rawData.main.temp
      }),
      sunrise: new Date(rawData.sys.sunrise * 1000),
      sunset: new Date(rawData.sys.sunset * 1000)
    };
  }

  /**
   * Process forecast data
   */
  processForecastData(rawData) {
    return rawData.list.map(item => {
      const windSpeed = item.wind?.speed * 1.94384 || 0;
      const gustSpeed = item.wind?.gust ? item.wind.gust * 1.94384 : windSpeed * 1.3;
      
      return {
        datetime: new Date(item.dt * 1000),
        temperature: Math.round(item.main.temp),
        weather: {
          main: item.weather[0].main,
          description: item.weather[0].description,
          icon: item.weather[0].icon
        },
        wind: {
          speed: Math.round(windSpeed),
          direction: item.wind?.deg || 0,
          gust: Math.round(gustSpeed)
        },
        kitesurfingConditions: this.evaluateKitesurfingConditions({
          windSpeed: Math.round(windSpeed),
          gustSpeed: Math.round(gustSpeed),
          weather: item.weather[0].main,
          visibility: item.visibility / 1000,
          temperature: item.main.temp
        })
      };
    });
  }

  /**
   * Evaluate kitesurfing conditions based on weather data
   */
  evaluateKitesurfingConditions({ windSpeed, gustSpeed, weather, visibility, temperature }) {
    let score = 0;
    let conditions = [];
    let safety = 'safe';

    // Wind speed evaluation
    if (windSpeed >= 12 && windSpeed <= 25) {
      score += 40;
      conditions.push('Good wind speed');
    } else if (windSpeed >= 8 && windSpeed < 12) {
      score += 20;
      conditions.push('Light winds - suitable for beginners');
    } else if (windSpeed > 25 && windSpeed <= 35) {
      score += 30;
      conditions.push('Strong winds - advanced only');
      safety = 'caution';
    } else if (windSpeed > 35) {
      score = 0;
      conditions.push('Dangerous wind speeds');
      safety = 'unsafe';
    } else {
      score += 5;
      conditions.push('Insufficient wind');
    }

    // Gust evaluation
    const gustFactor = gustSpeed / windSpeed;
    if (gustFactor > 1.5) {
      score -= 20;
      conditions.push('Gusty conditions - exercise caution');
      if (safety === 'safe') safety = 'caution';
    }

    // Weather conditions
    if (['Clear', 'Clouds'].includes(weather)) {
      score += 30;
      conditions.push('Good weather');
    } else if (['Rain', 'Drizzle'].includes(weather)) {
      score -= 30;
      conditions.push('Wet conditions');
      if (safety === 'safe') safety = 'caution';
    } else if (['Thunderstorm', 'Tornado'].includes(weather)) {
      score = 0;
      conditions.push('Dangerous weather');
      safety = 'unsafe';
    }

    // Visibility
    if (visibility < 1) {
      score -= 40;
      conditions.push('Poor visibility');
      safety = 'unsafe';
    } else if (visibility < 5) {
      score -= 20;
      conditions.push('Limited visibility');
      if (safety === 'safe') safety = 'caution';
    }

    // Temperature (comfort factor)
    if (temperature >= 20 && temperature <= 30) {
      score += 10;
      conditions.push('Comfortable temperature');
    } else if (temperature < 15) {
      score -= 10;
      conditions.push('Cold conditions - wetsuit required');
    }

    // Final scoring
    let rating;
    if (safety === 'unsafe' || score <= 20) {
      rating = 'poor';
    } else if (score <= 50) {
      rating = 'fair';
    } else if (score <= 80) {
      rating = 'good';
    } else {
      rating = 'excellent';
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      rating,
      safety,
      conditions,
      suitable: safety !== 'unsafe' && score > 20,
      recommendedLevel: this.getRecommendedLevel(windSpeed, gustFactor, safety)
    };
  }

  /**
   * Get recommended skill level for current conditions
   */
  getRecommendedLevel(windSpeed, gustFactor, safety) {
    if (safety === 'unsafe') return 'none';
    
    if (windSpeed <= 12 && gustFactor < 1.3) return 'beginner';
    if (windSpeed <= 20 && gustFactor < 1.4) return 'intermediate';
    if (windSpeed <= 30 && gustFactor < 1.5) return 'advanced';
    return 'expert';
  }

  /**
   * Convert wind direction to text
   */
  getWindDirectionText(degrees) {
    const directions = [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  }

  /**
   * Fallback weather data when API is unavailable
   */
  getFallbackWeatherData() {
    return {
      location: 'Weather Service Unavailable',
      timestamp: new Date(),
      temperature: 22,
      feelsLike: 24,
      humidity: 65,
      pressure: 1013,
      visibility: 10,
      weather: {
        main: 'Unknown',
        description: 'Weather data unavailable',
        icon: '01d'
      },
      wind: {
        speed: 15,
        direction: 270,
        gust: 18,
        directionText: 'W'
      },
      kitesurfingConditions: {
        score: 50,
        rating: 'unknown',
        safety: 'caution',
        conditions: ['Weather data unavailable - check local conditions'],
        suitable: false,
        recommendedLevel: 'none'
      },
      sunrise: new Date(),
      sunset: new Date()
    };
  }

  /**
   * Check if conditions are safe for booking
   * @param {Object} weatherData - Weather data object
   * @param {string} skillLevel - Student skill level
   * @returns {Object} Safety assessment
   */
  isBookingSafe(weatherData, skillLevel = 'beginner') {
    const conditions = weatherData.kitesurfingConditions;
    
    if (conditions.safety === 'unsafe') {
      return {
        safe: false,
        reason: 'Unsafe weather conditions',
        details: conditions.conditions
      };
    }

    const levelMap = {
      'beginner': ['beginner'],
      'intermediate': ['beginner', 'intermediate'],
      'advanced': ['beginner', 'intermediate', 'advanced'],
      'expert': ['beginner', 'intermediate', 'advanced', 'expert']
    };

    if (!levelMap[skillLevel]?.includes(conditions.recommendedLevel) && conditions.recommendedLevel !== 'none') {
      return {
        safe: false,
        reason: `Conditions suitable only for ${conditions.recommendedLevel} level`,
        details: conditions.conditions
      };
    }

    return {
      safe: true,
      reason: 'Conditions are suitable',
      details: conditions.conditions
    };
  }
}

export const weatherService = new WeatherService();
export default weatherService;
