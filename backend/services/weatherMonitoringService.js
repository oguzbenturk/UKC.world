import cron from 'node-cron';
import axios from 'axios';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { insertNotification } from './notificationWriter.js';

class WeatherMonitoringService {
  constructor() {
    this.isRunning = false;
    this.defaultLocation = {
      lat: process.env.DEFAULT_LAT || '37.7749', // San Francisco default
      lon: process.env.DEFAULT_LON || '-122.4194'
    };
  }

  start() {
    if (this.isRunning) {
      return;
    }

    logger.info('Starting weather monitoring service...');

    // Check weather every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
      await this.checkWeatherConditions();
    });

    // Check for upcoming bookings every hour
    cron.schedule('0 * * * *', async () => {
      await this.checkUpcomingBookings();
    });

    this.isRunning = true;
    logger.info('Weather monitoring service started');
  }

  stop() {
    this.isRunning = false;
    logger.info('Weather monitoring service stopped');
  }

  async checkWeatherConditions() {
    try {
      const API_KEY = process.env.OPENWEATHER_API_KEY;
      if (!API_KEY) {
        logger.warn('OpenWeather API key not configured, skipping weather check');
        return;
      }

      // Get current weather
      const weatherResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?lat=${this.defaultLocation.lat}&lon=${this.defaultLocation.lon}&appid=${API_KEY}&units=metric`
      );

      const weatherData = weatherResponse.data;
      const windSpeed = weatherData.wind?.speed || 0;
      const windGust = weatherData.wind?.gust || windSpeed;
      const temperature = weatherData.main?.temp || 0;

      // Determine if conditions are unsafe
      const isUnsafe = windSpeed < 8 || windSpeed > 25 || windGust > 35 || temperature < 10;

      if (isUnsafe) {
        await this.sendWeatherAlert(weatherData, 'unsafe');
      }

      // Store weather data for historical tracking
      await this.storeWeatherData(weatherData);

      logger.info(`Weather check completed - Wind: ${windSpeed}m/s, Temp: ${temperature}°C, Safe: ${!isUnsafe}`);

    } catch (error) {
      logger.error('Error checking weather conditions:', error);
    }
  }

  async checkUpcomingBookings() {
    try {
      // Get bookings for the next 24 hours
      const result = await pool.query(`
        SELECT b.*, u.name as student_name, u.email as student_email, i.name as instructor_name
        FROM bookings b
        JOIN users u ON b.student_id = u.id
        JOIN users i ON b.instructor_id = i.id
        WHERE b.lesson_date >= NOW() 
        AND b.lesson_date <= NOW() + INTERVAL '24 hours'
        AND b.status IN ('confirmed', 'pending')
        AND b.weather_suitable = true
      `);

      const upcomingBookings = result.rows;

      if (upcomingBookings.length === 0) {
        return;
      }

      // Check weather for each booking
      for (const booking of upcomingBookings) {
        await this.evaluateBookingWeather(booking);
      }

    } catch (error) {
      logger.error('Error checking upcoming bookings:', error);
    }
  }

  async evaluateBookingWeather(booking) {
    try {
      const API_KEY = process.env.OPENWEATHER_API_KEY;
      if (!API_KEY) {
        return;
      }

      // Get forecast for booking time
      const forecastResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${this.defaultLocation.lat}&lon=${this.defaultLocation.lon}&appid=${API_KEY}&units=metric`
      );

      const forecast = forecastResponse.data.list;
      const bookingTime = new Date(booking.lesson_date);
      
      // Find the closest forecast time to the booking
      const closestForecast = forecast.reduce((prev, curr) => {
        const prevTime = new Date(prev.dt * 1000);
        const currTime = new Date(curr.dt * 1000);
        return Math.abs(currTime - bookingTime) < Math.abs(prevTime - bookingTime) ? curr : prev;
      });

      const windSpeed = closestForecast.wind?.speed || 0;
      const windGust = closestForecast.wind?.gust || windSpeed;
      const temperature = closestForecast.main?.temp || 0;

      // Evaluate safety based on student skill level
      const isUnsafe = this.evaluateSafetyForSkill(booking.skill_level || 'beginner', windSpeed, windGust, temperature);

      if (isUnsafe) {
        // Mark booking as weather unsuitable
        await pool.query(
          'UPDATE bookings SET weather_suitable = false WHERE id = $1',
          [booking.id]
        );

        // Send weather warning
        await this.sendBookingWeatherAlert(booking, closestForecast);
      }

    } catch (error) {
      logger.error(`Error evaluating weather for booking ${booking.id}:`, error);
    }
  }

  evaluateSafetyForSkill(skillLevel, windSpeed, windGust, temperature) {
    if (temperature < 10) return true; // Too cold

    switch (skillLevel) {
      case 'beginner':
        return windSpeed < 12 || windSpeed > 18 || windGust > 25;
      case 'intermediate':
        return windSpeed < 10 || windSpeed > 22 || windGust > 30;
      case 'advanced':
        return windSpeed < 8 || windSpeed > 25 || windGust > 35;
      default:
        return windSpeed < 12 || windSpeed > 18 || windGust > 25;
    }
  }

  async sendWeatherAlert(weatherData, severity) {
    try {
      const windSpeed = weatherData.wind?.speed || 0;
      const windGust = weatherData.wind?.gust || windSpeed;
      const temperature = weatherData.main?.temp || 0;

      const title = `⚠️ Weather Alert - ${severity.toUpperCase()}`;
      const message = `Current conditions: Wind ${windSpeed}m/s${windGust > windSpeed ? ` (gusts ${windGust}m/s)` : ''}, ${temperature}°C. Check bookings and stay safe!`;

      // Send to all instructors and managers
      const recipients = await pool.query(
        "SELECT id FROM users WHERE role IN ('instructor', 'manager', 'admin')"
      );

      const eventKey = weatherData?.dt ? `weather:${weatherData.dt}` : `weather:${new Date().toISOString()}`;

      for (const recipient of recipients.rows) {
        await insertNotification({
          userId: recipient.id,
          title,
          message,
          type: 'weather',
          data: { weatherData, severity },
          idempotencyKey: `${eventKey}:user:${recipient.id}`
        });
      }

      logger.info(`Weather alert sent to ${recipients.rows.length} users`);

    } catch (error) {
      logger.error('Error sending weather alert:', error);
    }
  }

  async sendBookingWeatherAlert(booking, forecast) {
    try {
      const windSpeed = forecast.wind?.speed || 0;
      const windGust = forecast.wind?.gust || windSpeed;
      const temperature = forecast.main?.temp || 0;

      const title = '🌤️ Booking Weather Update';
      const message = `Weather conditions for your lesson on ${new Date(booking.lesson_date).toLocaleDateString()} may be unsuitable. Wind: ${windSpeed}m/s, Temp: ${temperature}°C. Please contact us to discuss rescheduling.`;

      // Send to student and instructor
      const recipients = [booking.student_id, booking.instructor_id];

      for (const recipientId of recipients) {
        await insertNotification({
          userId: recipientId,
          title,
          message,
          type: 'booking',
          data: { bookingId: booking.id, forecast },
          idempotencyKey: `booking-weather:${booking.id}:user:${recipientId}`
        });
      }

      logger.info(`Booking weather alert sent for booking ${booking.id}`);

    } catch (error) {
      logger.error('Error sending booking weather alert:', error);
    }
  }

  async storeWeatherData(weatherData) {
    try {
      // Simple weather data storage for historical tracking
      // You could expand this to store in a dedicated weather_data table
      const weatherSnapshot = {
        timestamp: new Date().toISOString(),
        temperature: weatherData.main?.temp || 0,
        windSpeed: weatherData.wind?.speed || 0,
        windGust: weatherData.wind?.gust || 0,
        windDirection: weatherData.wind?.deg || 0,
        humidity: weatherData.main?.humidity || 0,
        pressure: weatherData.main?.pressure || 0,
        visibility: weatherData.visibility || 0,
        cloudCover: weatherData.clouds?.all || 0,
        conditions: weatherData.weather?.[0]?.main || 'Unknown'
      };

      // Store in a simple log format or expand to dedicated table
      logger.info('Weather data stored:', weatherSnapshot);

    } catch (error) {
      logger.error('Error storing weather data:', error);
    }
  }
}

export default new WeatherMonitoringService();
