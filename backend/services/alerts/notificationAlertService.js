import fetch from 'node-fetch';
import notificationMetrics from '../metrics/notificationMetrics.js';
import { logger } from '../../middlewares/errorHandler.js';

const FAILURE_THRESHOLD = Number.parseInt(process.env.NOTIFICATION_ALERT_FAILURE_THRESHOLD ?? '20', 10) || 20;
const FAILURE_WINDOW_MS = Number.parseInt(process.env.NOTIFICATION_ALERT_FAILURE_WINDOW_MS ?? '300000', 10) || 300000;
const BACKLOG_THRESHOLD = Number.parseInt(process.env.NOTIFICATION_ALERT_BACKLOG_THRESHOLD ?? '500', 10) || 500;
const LATENCY_THRESHOLD_MS = Number.parseInt(process.env.NOTIFICATION_ALERT_LATENCY_THRESHOLD_MS ?? '5000', 10) || 5000;
const ALERT_COOLDOWN_MS = Number.parseInt(process.env.NOTIFICATION_ALERT_COOLDOWN_MS ?? '300000', 10) || 300000;

class NotificationAlertService {
  constructor({ webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL, fetchImpl = fetch } = {}) {
    this.webhookUrl = webhookUrl;
    this.fetchImpl = fetchImpl;
    this.failureTimestamps = [];
    this.lastAlerts = new Map();
    this.boundHandlers = {
      failed: (payload) => this.handleFailed(payload),
      dropped: (payload) => this.handleDropped(payload),
      queueDepth: (payload) => this.handleQueueDepth(payload),
      processed: (payload) => this.handleLatency(payload)
    };
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    notificationMetrics.on('failed', this.boundHandlers.failed);
    notificationMetrics.on('dropped', this.boundHandlers.dropped);
    notificationMetrics.on('queueDepth', this.boundHandlers.queueDepth);
    notificationMetrics.on('processed', this.boundHandlers.processed);
    this.initialized = true;
  }

  shutdown() {
    if (!this.initialized) {
      return;
    }

    notificationMetrics.off('failed', this.boundHandlers.failed);
    notificationMetrics.off('dropped', this.boundHandlers.dropped);
    notificationMetrics.off('queueDepth', this.boundHandlers.queueDepth);
    notificationMetrics.off('processed', this.boundHandlers.processed);
    this.initialized = false;
  }

  async handleFailed({ reason, jobType, snapshot, durationMs, waitMs }) {
    const now = Date.now();
    this.failureTimestamps.push(now);
    this.failureTimestamps = this.failureTimestamps.filter((timestamp) => now - timestamp <= FAILURE_WINDOW_MS);

    const count = this.failureTimestamps.length;
    if (count >= FAILURE_THRESHOLD) {
      await this.notifyOnce('failures', {
        title: '⚠️ Notification failures spiking',
        text: `There have been ${count} notification failures in the last ${Math.round(FAILURE_WINDOW_MS / 60000)} minutes. Latest reason: ${reason}. Queue depth: ${snapshot.queueDepth}.`
      });
    }

    if (Number.isFinite(durationMs) && durationMs >= LATENCY_THRESHOLD_MS) {
      await this.notifyOnce('latency-duration', {
        title: '⏱️ Slow notification processing detected',
        text: `${jobType || 'notification'} jobs are taking ${Math.round(durationMs)}ms to complete.`
      });
    }

    if (Number.isFinite(waitMs) && waitMs >= LATENCY_THRESHOLD_MS) {
      await this.notifyOnce('latency-wait', {
        title: '⏳ Notification queue wait time high',
        text: `${jobType || 'notification'} jobs are waiting ${Math.round(waitMs)}ms before execution.`
      });
    }
  }

  async handleDropped({ reason, snapshot }) {
    if (reason !== 'capacity') {
      return;
    }

    await this.notifyOnce('dropped-capacity', {
      title: '🚨 Notification queue dropping jobs',
      text: `Jobs are being dropped due to capacity limits. Current queue depth: ${snapshot.queueDepth}.`
    });
  }

  async handleQueueDepth({ depth }) {
    if (!Number.isFinite(depth) || depth < BACKLOG_THRESHOLD) {
      return;
    }

    await this.notifyOnce('backlog', {
      title: '📈 Notification backlog growing',
      text: `Queue depth reached ${depth}, exceeding the threshold of ${BACKLOG_THRESHOLD}.`
    });
  }

  async handleLatency({ durationMs, waitMs, jobType }) {
    if (Number.isFinite(durationMs) && durationMs >= LATENCY_THRESHOLD_MS) {
      await this.notifyOnce('latency-duration', {
        title: '⏱️ Slow notification processing detected',
        text: `${jobType || 'notification'} jobs are taking ${Math.round(durationMs)}ms to complete.`
      });
    }

    if (Number.isFinite(waitMs) && waitMs >= LATENCY_THRESHOLD_MS) {
      await this.notifyOnce('latency-wait', {
        title: '⏳ Notification queue wait time high',
        text: `${jobType || 'notification'} jobs are waiting ${Math.round(waitMs)}ms before execution.`
      });
    }
  }

  async notifyOnce(key, { title, text }) {
    if (!this.webhookUrl) {
      return false;
    }

    const now = Date.now();
    const lastSent = this.lastAlerts.get(key) ?? 0;
    if (now - lastSent < ALERT_COOLDOWN_MS) {
      return false;
    }

    try {
      this.lastAlerts.set(key, now);
      await this.fetchImpl(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: `*${title}*\n${text}` })
      });
      logger.warn('[notification-alert] Slack alert sent', { key, title });
      return true;
    } catch (error) {
      logger.error('[notification-alert] Failed to send Slack alert', {
        key,
        title,
        error: error?.message
      });
      return false;
    }
  }
}

const notificationAlertService = new NotificationAlertService();
notificationAlertService.initialize();

export { NotificationAlertService, notificationAlertService };
export default notificationAlertService;
