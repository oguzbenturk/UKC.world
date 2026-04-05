import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

/**
 * Waiver Notification Service Tests
 * - Waiver signed notifications (in-app + email)
 * - Pending waiver reminders
 * - User/family member lookups
 */

let WaiverNotificationService;
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
};

const mockNotificationWriter = {
  insertNotification: jest.fn(),
};

const mockEmailService = {
  sendEmail: jest.fn(),
};

const mockEmailTemplates = {
  buildWaiverConfirmationEmail: jest.fn(),
};

const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
};

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: mockPool,
  }));

  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger,
  }));

  await jest.unstable_mockModule('../../../../backend/services/notificationWriter.js', () => mockNotificationWriter);
  await jest.unstable_mockModule('../../../../backend/services/emailService.js', () => mockEmailService);
  await jest.unstable_mockModule('../../../../backend/services/emailTemplates/waiverConfirmation.js', () => mockEmailTemplates);

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/waiverNotificationService.js');
    WaiverNotificationService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('dispatchWaiverSigned', () => {
  test('dispatches in-app notification for waiver signed', async () => {
    const waiver = {
      id: 'waiver-123',
      waiver_version: '1.0',
      signed_at: new Date('2026-04-04'),
      signature_image_url: '/uploads/signatures/test.png',
      signature_public_url: 'https://cdn.example.com/test.png',
      photo_consent: true,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
        },
      ],
    }); // fetch signer

    mockPool.query.mockResolvedValueOnce({
      rows: [], // no target user
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [], // no family member
    });

    mockNotificationWriter.insertNotification.mockResolvedValueOnce({ id: 'notif-123' });
    mockEmailService.sendEmail.mockResolvedValueOnce({ success: true });
    mockEmailTemplates.buildWaiverConfirmationEmail.mockReturnValueOnce({
      subject: 'Waiver signed',
      html: '<p>Waiver signed</p>',
      text: 'Waiver signed',
    });

    await WaiverNotificationService.dispatchWaiverSigned({
      waiver,
      signerUserId: 'user-123',
      targetUserId: null,
      familyMemberId: null,
    });

    expect(mockNotificationWriter.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        title: 'Waiver signed successfully',
        type: 'waiver',
        data: expect.objectContaining({
          waiverId: 'waiver-123',
          waiverVersion: '1.0',
        }),
      })
    );

    expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'john@example.com',
        userId: 'user-123',
        notificationType: 'waiver_signed',
        skipConsentCheck: true,
      })
    );
  });

  test('includes family member name in notification', async () => {
    const waiver = {
      id: 'waiver-child',
      waiver_version: '1.0',
      signed_at: new Date('2026-04-04'),
      signature_image_url: '/uploads/signatures/child.png',
      signature_public_url: null,
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'parent-123',
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
        },
      ],
    }); // signer

    mockPool.query.mockResolvedValueOnce({
      rows: [], // no target user
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'child-456',
          full_name: 'Tommy Smith',
          relationship: 'son',
        },
      ],
    }); // family member

    mockNotificationWriter.insertNotification.mockResolvedValueOnce({ id: 'notif-123' });
    mockEmailService.sendEmail.mockResolvedValueOnce({ success: true });
    mockEmailTemplates.buildWaiverConfirmationEmail.mockReturnValueOnce({
      subject: 'Waiver signed for Tommy',
      html: '<p>Waiver signed</p>',
      text: 'Waiver signed',
    });

    await WaiverNotificationService.dispatchWaiverSigned({
      waiver,
      signerUserId: 'parent-123',
      targetUserId: null,
      familyMemberId: 'child-456',
    });

    expect(mockNotificationWriter.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Tommy Smith'),
      })
    );

    expect(mockEmailTemplates.buildWaiverConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        familyMemberName: 'Tommy Smith',
      })
    );
  });

  test('skips email if signer has no email', async () => {
    const waiver = {
      id: 'waiver-123',
      waiver_version: '1.0',
      signed_at: new Date(),
      signature_image_url: '/uploads/signatures/test.png',
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          first_name: 'John',
          last_name: 'Doe',
          email: null, // no email
        },
      ],
    });

    mockPool.query.mockResolvedValueOnce({ rows: [] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    mockNotificationWriter.insertNotification.mockResolvedValueOnce({ id: 'notif-123' });

    await WaiverNotificationService.dispatchWaiverSigned({
      waiver,
      signerUserId: 'user-123',
    });

    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  test('handles missing signer ID gracefully', async () => {
    await WaiverNotificationService.dispatchWaiverSigned({
      waiver: { id: 'waiver-123' },
      signerUserId: null,
    });

    expect(mockNotificationWriter.insertNotification).not.toHaveBeenCalled();
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  test('passes signature public URL to email template', async () => {
    const waiver = {
      id: 'waiver-123',
      waiver_version: '1.0',
      signed_at: new Date(),
      signature_image_url: '/uploads/signatures/test.png',
      signature_public_url: 'https://cdn.example.com/test.png',
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
        },
      ],
    });

    mockPool.query.mockResolvedValueOnce({ rows: [] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    mockNotificationWriter.insertNotification.mockResolvedValueOnce({});
    mockEmailService.sendEmail.mockResolvedValueOnce({});
    mockEmailTemplates.buildWaiverConfirmationEmail.mockReturnValueOnce({
      subject: 'test',
      html: 'test',
      text: 'test',
    });

    await WaiverNotificationService.dispatchWaiverSigned({
      waiver,
      signerUserId: 'user-123',
    });

    expect(mockEmailTemplates.buildWaiverConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        signaturePreviewUrl: 'https://cdn.example.com/test.png',
      })
    );
  });

  test('ignores invalid signature URLs in email', async () => {
    const waiver = {
      id: 'waiver-123',
      waiver_version: '1.0',
      signed_at: new Date(),
      signature_image_url: '/uploads/signatures/test.png',
      signature_public_url: 'not-a-url',
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
        },
      ],
    });

    mockPool.query.mockResolvedValueOnce({ rows: [] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    mockNotificationWriter.insertNotification.mockResolvedValueOnce({});
    mockEmailService.sendEmail.mockResolvedValueOnce({});
    mockEmailTemplates.buildWaiverConfirmationEmail.mockReturnValueOnce({
      subject: 'test',
      html: 'test',
      text: 'test',
    });

    await WaiverNotificationService.dispatchWaiverSigned({
      waiver,
      signerUserId: 'user-123',
    });

    expect(mockEmailTemplates.buildWaiverConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        signaturePreviewUrl: null,
      })
    );
  });

  test('logs warning when notification insertion fails', async () => {
    const waiver = {
      id: 'waiver-123',
      waiver_version: '1.0',
      signed_at: new Date(),
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          first_name: 'John',
          email: 'john@example.com',
        },
      ],
    });

    mockPool.query.mockResolvedValueOnce({ rows: [] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    mockNotificationWriter.insertNotification.mockRejectedValueOnce(
      new Error('Database error')
    );

    mockEmailService.sendEmail.mockResolvedValueOnce({});
    mockEmailTemplates.buildWaiverConfirmationEmail.mockReturnValueOnce({
      subject: 'test',
      html: 'test',
      text: 'test',
    });

    await WaiverNotificationService.dispatchWaiverSigned({
      waiver,
      signerUserId: 'user-123',
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to insert waiver signed notification',
      expect.any(Object)
    );
  });

  test('logs error when email sending fails', async () => {
    const waiver = {
      id: 'waiver-123',
      waiver_version: '1.0',
      signed_at: new Date(),
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          first_name: 'John',
          email: 'john@example.com',
        },
      ],
    });

    mockPool.query.mockResolvedValueOnce({ rows: [] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    mockNotificationWriter.insertNotification.mockResolvedValueOnce({});
    mockEmailService.sendEmail.mockRejectedValueOnce(
      new Error('Email service down')
    );
    mockEmailTemplates.buildWaiverConfirmationEmail.mockReturnValueOnce({
      subject: 'test',
      html: 'test',
      text: 'test',
    });

    await WaiverNotificationService.dispatchWaiverSigned({
      waiver,
      signerUserId: 'user-123',
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to send waiver confirmation email',
      expect.any(Object)
    );
  });
});

describe('dispatchWaiverPendingReminder', () => {
  test('sends pending waiver reminder notification', async () => {
    mockNotificationWriter.insertNotification.mockResolvedValueOnce({ id: 'notif-456' });

    await WaiverNotificationService.dispatchWaiverPendingReminder({
      userId: 'user-123',
      scope: 'user',
      latestVersion: '2.0',
    });

    expect(mockNotificationWriter.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        title: 'Action needed: Waiver pending',
        type: 'waiver',
        data: expect.objectContaining({
          scope: 'user',
          latestVersion: '2.0',
        }),
      })
    );
  });

  test('uses custom message when provided', async () => {
    mockNotificationWriter.insertNotification.mockResolvedValueOnce({});

    const customMsg = 'Your family member needs a waiver signature before booking';

    await WaiverNotificationService.dispatchWaiverPendingReminder({
      userId: 'user-123',
      scope: 'family_member',
      message: customMsg,
    });

    expect(mockNotificationWriter.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: customMsg,
      })
    );
  });

  test('uses default message when not provided', async () => {
    mockNotificationWriter.insertNotification.mockResolvedValueOnce({});

    await WaiverNotificationService.dispatchWaiverPendingReminder({
      userId: 'user-123',
    });

    expect(mockNotificationWriter.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Your liability waiver needs attention. Please review and sign to keep booking lessons.',
      })
    );
  });

  test('skips if no userId provided', async () => {
    await WaiverNotificationService.dispatchWaiverPendingReminder({
      userId: null,
      scope: 'user',
    });

    expect(mockNotificationWriter.insertNotification).not.toHaveBeenCalled();
  });

  test('creates idempotency key with scope and version', async () => {
    mockNotificationWriter.insertNotification.mockResolvedValueOnce({});

    await WaiverNotificationService.dispatchWaiverPendingReminder({
      userId: 'user-123',
      scope: 'user',
      latestVersion: '2.0',
    });

    expect(mockNotificationWriter.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'waiver-pending:user-123:user:2.0',
      })
    );
  });

  test('logs warning when notification insertion fails', async () => {
    mockNotificationWriter.insertNotification.mockRejectedValueOnce(
      new Error('DB error')
    );

    await WaiverNotificationService.dispatchWaiverPendingReminder({
      userId: 'user-123',
      scope: 'user',
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to insert waiver pending reminder',
      expect.any(Object)
    );
  });

  test('includes custom CTA href if provided', async () => {
    mockNotificationWriter.insertNotification.mockResolvedValueOnce({});

    const customHref = '/settings/legal';

    await WaiverNotificationService.dispatchWaiverPendingReminder({
      userId: 'user-123',
      ctaHref: customHref,
    });

    expect(mockNotificationWriter.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cta: expect.objectContaining({
            href: customHref,
          }),
        }),
      })
    );
  });
});
