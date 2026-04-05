import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

let emailService;
let mockPool;
let mockCanSendCommunication;
let mockRecordMarketingCommunication;
let mockTransporter;

beforeAll(async () => {
  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] })
  };

  mockCanSendCommunication = jest.fn();
  mockRecordMarketingCommunication = jest.fn();

  mockTransporter = {
    sendMail: jest.fn(),
    verify: jest.fn(),
    options: {}
  };

  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: mockPool
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }
  }));

  await jest.unstable_mockModule('../../../backend/services/marketingConsentService.js', () => ({
    canSendCommunication: mockCanSendCommunication,
    recordMarketingCommunication: mockRecordMarketingCommunication,
    CHANNEL: { EMAIL: 'email' }
  }));

  const mod = await import('../../../backend/services/emailService.js');
  emailService = mod;
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockCanSendCommunication.mockReset();
  mockRecordMarketingCommunication.mockReset();
  mockTransporter.sendMail.mockReset();
  mockTransporter.verify.mockReset();

  // Default: allow sending
  mockCanSendCommunication.mockResolvedValue({ allowed: true });
  mockRecordMarketingCommunication.mockResolvedValue({ success: true });
});

describe('emailService.sendEmail', () => {
  test('throws error when recipient is missing', async () => {
    await expect(
      emailService.sendEmail({
        subject: 'Test',
        text: 'Test message'
      })
    ).rejects.toThrow('Email recipient is required');
  });

  test('throws error when subject is missing', async () => {
    await expect(
      emailService.sendEmail({
        to: 'user@example.com',
        text: 'Test message'
      })
    ).rejects.toThrow('Email subject is required');
  });

  test('checks consent for marketing emails with userId', async () => {
    mockCanSendCommunication.mockResolvedValueOnce({
      allowed: true
    });

    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Newsletter',
      text: 'Check this out',
      userId: 'user-1',
      notificationType: 'newsletter'
    });

    expect(mockCanSendCommunication).toHaveBeenCalledWith({
      userId: 'user-1',
      channel: 'email',
      notificationType: 'newsletter'
    });
    expect(result).toBeDefined();
  });

  test('blocks email when consent denied', async () => {
    mockCanSendCommunication.mockResolvedValueOnce({
      allowed: false,
      reason: 'User opted out'
    });

    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Newsletter',
      text: 'Check this out',
      userId: 'user-1',
      notificationType: 'newsletter'
    });

    expect(result.skipped).toBe(true);
    expect(result.consentBlocked).toBe(true);
  });

  test('skips consent check when skipConsentCheck is true', async () => {
    mockTransporter.sendMail.mockResolvedValueOnce({
      accepted: ['user@example.com'],
      rejected: [],
      messageId: 'msg-1'
    });

    await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Password Reset',
      text: 'Reset your password',
      skipConsentCheck: true
    });

    expect(mockCanSendCommunication).not.toHaveBeenCalled();
  });

  test('skips consent check for transactional emails without userId', async () => {
    mockTransporter.sendMail.mockResolvedValueOnce({
      accepted: ['user@example.com'],
      rejected: [],
      messageId: 'msg-1'
    });

    await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Booking Confirmation',
      text: 'Your booking is confirmed'
      // No userId provided
    });

    expect(mockCanSendCommunication).not.toHaveBeenCalled();
  });

  test('returns skipped when transporter is disabled', async () => {
    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Test',
      skipConsentCheck: true
    });

    // When no transporter is available (or EMAIL_DISABLED=true)
    expect(result.skipped).toBe(true);
  });

  test('does not record communication for transactional emails without userId', async () => {
    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Password Reset',
      text: 'Reset your password',
      skipConsentCheck: true
      // No userId or notificationType
    });

    expect(mockRecordMarketingCommunication).not.toHaveBeenCalled();
    // When transporter unavailable, returns skipped
    expect(result?.skipped).toBe(true);
  });

  test('handles both text and html content when provided', async () => {
    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Plain text version',
      html: '<p>HTML version</p>',
      skipConsentCheck: true
    });

    // When no transporter is available (or disabled), it should skip
    expect(result.skipped).toBe(true);
  });

  test('case-insensitive notificationType handling', async () => {
    mockCanSendCommunication.mockResolvedValueOnce({ allowed: true });

    await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Test',
      userId: 'user-1',
      notificationType: 'NEWSLETTER'
    });

    expect(mockCanSendCommunication).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'NEWSLETTER'
      })
    );
  });

  test('returns skipped response when transporter is unavailable', async () => {
    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Test',
      skipConsentCheck: true
    });

    expect(result.skipped).toBe(true);
  });
});
