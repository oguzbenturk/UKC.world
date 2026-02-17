import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';

let NotificationAlertService;
let notificationAlertService;
let fetchMock;

describe('NotificationAlertService', () => {
  beforeEach(async () => {
    jest.resetModules();
    process.env.NOTIFICATION_ALERT_FAILURE_THRESHOLD = '2';
    process.env.NOTIFICATION_ALERT_BACKLOG_THRESHOLD = '3';
    process.env.NOTIFICATION_ALERT_LATENCY_THRESHOLD_MS = '100';

    const module = await import('../services/alerts/notificationAlertService.js');
    ({ NotificationAlertService, notificationAlertService } = module);
    notificationAlertService.shutdown();

    fetchMock = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete process.env.NOTIFICATION_ALERT_FAILURE_THRESHOLD;
    delete process.env.NOTIFICATION_ALERT_BACKLOG_THRESHOLD;
    delete process.env.NOTIFICATION_ALERT_LATENCY_THRESHOLD_MS;
    jest.clearAllMocks();
  });

  test('sends Slack alert when failures exceed threshold', async () => {
    const service = new NotificationAlertService({
      webhookUrl: 'https://hooks.slack/test',
      fetchImpl: fetchMock
    });

    await service.handleFailed({
      reason: 'boom',
      jobType: 'test',
      snapshot: { queueDepth: 10 },
      durationMs: 50,
      waitMs: 0
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await service.handleFailed({
      reason: 'boom',
      jobType: 'test',
      snapshot: { queueDepth: 12 },
      durationMs: 50,
      waitMs: 0
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toContain('Notification failures spiking');
  });

  test('sends backlog alert when queue depth crosses defined threshold', async () => {
    const service = new NotificationAlertService({
      webhookUrl: 'https://hooks.slack/test',
      fetchImpl: fetchMock
    });

    await service.handleQueueDepth({ depth: 2 });
    expect(fetchMock).not.toHaveBeenCalled();

    await service.handleQueueDepth({ depth: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toContain('Notification backlog growing');
  });
});
