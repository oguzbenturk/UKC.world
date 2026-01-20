import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import socketService from './socketService.js';

class NotificationRealtimeService {
  constructor() {
    this.client = null;
    this.isListening = false;
    this.retryTimer = null;
    this.channelName = 'notification_events';
    this.reconnectDelayMs = 5000;
    this.failedAttempts = 0;
    this.maxFailedAttempts = 3; // Stop retrying after 3 failures
  }

  async initialize() {
    if (this.isListening) {
      return;
    }

    if (!pool) {
      logger.warn('Notification realtime listener skipped because database pool is unavailable.');
      return;
    }

    try {
      this.client = await pool.connect();
      await this.client.query(`LISTEN ${this.channelName}`);

      this.client.on('notification', (message) => {
        if (message?.channel !== this.channelName) {
          return;
        }
        this.handleNotification(message.payload);
      });

      this.client.on('error', (error) => {
        logger.error('Notification realtime listener encountered an error:', error);
        this.restart();
      });

      this.client.on('end', () => {
        logger.warn('Notification realtime listener connection ended. Attempting to restart.');
        this.restart();
      });

      this.isListening = true;
      this.failedAttempts = 0; // Reset counter on success
      logger.info('📡 Notification realtime listener initialized');
    } catch (error) {
      this.failedAttempts++;
      if (this.failedAttempts >= this.maxFailedAttempts) {
        logger.warn(`Notification realtime listener disabled after ${this.failedAttempts} failed attempts`);
        return; // Stop retrying
      }
      logger.error('Failed to initialize notification realtime listener:', error);
      this.restart();
    }
  }

  async shutdown() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.client) {
      try {
        await this.client.query(`UNLISTEN ${this.channelName}`);
      } catch (error) {
        logger.warn('Failed to unlisten notification channel during shutdown:', error.message);
      }
      this.client.release();
      this.client = null;
    }

    this.isListening = false;
  }

  restart() {
    if (this.retryTimer) {
      return;
    }

    this.isListening = false;

    if (this.client) {
      try {
        this.client.release();
      } catch (error) {
        logger.warn('Error releasing notification listener client:', error.message);
      }
      this.client = null;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.initialize().catch((error) => {
        logger.error('Failed to restart notification realtime listener:', error);
        this.restart();
      });
    }, this.reconnectDelayMs);
  }

  handleNotification(payloadText) {
    if (!payloadText) {
      return;
    }

    try {
      const payload = JSON.parse(payloadText);
      const { operation, notification } = payload || {};
      if (!notification?.user_id) {
        return;
      }

      const eventName = operation === 'INSERT' ? 'notification:new' : 'notification:update';
      const channel = `user:${notification.user_id}`;

      // Only emit to user-specific channel to avoid duplicate notifications
      socketService.emitToChannel(channel, eventName, { notification });
    } catch (error) {
      logger.warn('Failed to process notification realtime payload:', error.message);
    }
  }
}

const notificationRealtimeService = new NotificationRealtimeService();
export default notificationRealtimeService;
