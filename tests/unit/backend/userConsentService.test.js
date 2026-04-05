import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import * as userConsentService from '../../../backend/services/userConsentService.js';

let mockPool;
let mockClient;

beforeAll(async () => {
  mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn()
  };

  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue(mockClient)
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
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.connect.mockClear();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

describe('userConsentService.getConsentStatus', () => {
  test('throws error when userId not provided', async () => {
    await expect(
      userConsentService.getConsentStatus(null)
    ).rejects.toThrow('userId is required');
  });

  test('returns consent status for existing user', async () => {
    const mockConsent = {
      user_id: 'user-1',
      terms_version: '2025-10-01',
      terms_accepted_at: '2026-04-01T10:00:00Z',
      marketing_email_opt_in: true,
      marketing_sms_opt_in: false,
      marketing_whatsapp_opt_in: true,
      created_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockConsent] });

    const result = await userConsentService.getConsentStatus('user-1');

    expect(result).toHaveProperty('termsVersion');
    expect(result).toHaveProperty('termsAcceptedAt');
    expect(result).toHaveProperty('communicationPreferences');
    expect(result.termsVersion).toBe('2025-10-01');
  });

  test('returns default consent for new user', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await userConsentService.getConsentStatus('user-1');

    expect(result.termsVersion).toBeNull();
    expect(result.termsAcceptedAt).toBeNull();
    expect(result.requiresTermsAcceptance).toBe(true);
  });

  test('flags requiresTermsAcceptance when terms outdated', async () => {
    const mockConsent = {
      user_id: 'user-1',
      terms_version: '2024-01-01',
      terms_accepted_at: '2024-01-01T10:00:00Z',
      marketing_email_opt_in: false,
      marketing_sms_opt_in: false,
      marketing_whatsapp_opt_in: false
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockConsent] });

    const result = await userConsentService.getConsentStatus('user-1');

    expect(result.requiresTermsAcceptance).toBe(true);
  });

  test('does not require terms acceptance when latest version accepted', async () => {
    const mockConsent = {
      user_id: 'user-1',
      terms_version: '2025-10-01',
      terms_accepted_at: '2026-04-01T10:00:00Z',
      marketing_email_opt_in: false,
      marketing_sms_opt_in: false,
      marketing_whatsapp_opt_in: false
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockConsent] });

    const result = await userConsentService.getConsentStatus('user-1');

    expect(result.requiresTermsAcceptance).toBe(false);
  });

  test('returns communication preferences', async () => {
    const mockConsent = {
      user_id: 'user-1',
      terms_version: '2025-10-01',
      terms_accepted_at: '2026-04-01T10:00:00Z',
      marketing_email_opt_in: true,
      marketing_sms_opt_in: true,
      marketing_whatsapp_opt_in: false
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockConsent] });

    const result = await userConsentService.getConsentStatus('user-1');

    expect(result.communicationPreferences.email).toBe(true);
    expect(result.communicationPreferences.sms).toBe(true);
    expect(result.communicationPreferences.whatsapp).toBe(false);
  });

  test('defaults communication preferences to false', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await userConsentService.getConsentStatus('user-1');

    expect(result.communicationPreferences.email).toBe(false);
    expect(result.communicationPreferences.sms).toBe(false);
    expect(result.communicationPreferences.whatsapp).toBe(false);
  });
});

describe('userConsentService.updateUserConsent', () => {
  test('throws error when userId not provided', async () => {
    await expect(
      userConsentService.updateUserConsent({ userId: null })
    ).rejects.toThrow('userId is required');
  });

  test('throws error when terms acceptance required but not provided', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT existing

    const error = await userConsentService.updateUserConsent({
      userId: 'user-1',
      acceptTerms: false
    }).catch(e => e);

    expect(error.code).toBe('CONSENT_TERMS_REQUIRED');
  });

  test('accepts terms and updates consent', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: null,
          terms_accepted_at: null,
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: new Date().toISOString(),
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userConsentService.updateUserConsent({
      userId: 'user-1',
      acceptTerms: true
    });

    expect(result.termsVersion).toBe('2025-10-01');
    expect(result.termsAcceptedAt).toBeDefined();
    expect(result.requiresTermsAcceptance).toBe(false);
  });

  test('throws error for invalid terms version', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] });

    const error = await userConsentService.updateUserConsent({
      userId: 'user-1',
      acceptTerms: true,
      termsVersion: '2024-01-01'
    }).catch(e => e);

    expect(error.code).toBe('CONSENT_TERMS_VERSION_MISMATCH');
  });

  test('updates marketing email preference', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: true,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userConsentService.updateUserConsent({
      userId: 'user-1',
      allowEmail: true
    });

    expect(result.communicationPreferences.email).toBe(true);
  });

  test('updates marketing SMS preference', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: true,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userConsentService.updateUserConsent({
      userId: 'user-1',
      allowSms: true
    });

    expect(result.communicationPreferences.sms).toBe(true);
  });

  test('updates marketing WhatsApp preference', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: true
        }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userConsentService.updateUserConsent({
      userId: 'user-1',
      allowWhatsapp: true
    });

    expect(result.communicationPreferences.whatsapp).toBe(true);
  });

  test('creates waiver record when acceptWaiver is true', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({
        rows: [] // no existing waivers
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    await userConsentService.updateUserConsent({
      userId: 'user-1',
      acceptTerms: true,
      acceptWaiver: true
    });

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO liability_waivers'),
      expect.anything()
    );
  });

  test('does not create duplicate waiver if recent one exists', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 1 }] // existing recent waiver
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    await userConsentService.updateUserConsent({
      userId: 'user-1',
      acceptTerms: true,
      acceptWaiver: true
    });

    const insertCalls = mockClient.query.mock.calls.filter(call =>
      call[0].includes('INSERT INTO liability_waivers')
    );

    expect(insertCalls).toHaveLength(0);
  });

  test('rolls back transaction on error', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('Database error'));

    await userConsentService.updateUserConsent({
      userId: 'user-1',
      acceptTerms: false
    }).catch(() => {});

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('releases client after operation', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] });

    await userConsentService.updateUserConsent({
      userId: 'user-1',
      acceptTerms: false
    }).catch(() => {});

    expect(mockClient.release).toHaveBeenCalled();
  });

  test('handles multiple preference updates simultaneously', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: false,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: false
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: true,
          marketing_sms_opt_in: true,
          marketing_whatsapp_opt_in: true
        }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userConsentService.updateUserConsent({
      userId: 'user-1',
      allowEmail: true,
      allowSms: true,
      allowWhatsapp: true
    });

    expect(result.communicationPreferences.email).toBe(true);
    expect(result.communicationPreferences.sms).toBe(true);
    expect(result.communicationPreferences.whatsapp).toBe(true);
  });

  test('preserves existing preferences when only updating some', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: true,
          marketing_sms_opt_in: false,
          marketing_whatsapp_opt_in: true
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          terms_version: '2025-10-01',
          terms_accepted_at: '2026-04-01T10:00:00Z',
          marketing_email_opt_in: true,
          marketing_sms_opt_in: true,
          marketing_whatsapp_opt_in: true
        }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userConsentService.updateUserConsent({
      userId: 'user-1',
      allowSms: true
    });

    expect(result.communicationPreferences.email).toBe(true);
    expect(result.communicationPreferences.sms).toBe(true);
    expect(result.communicationPreferences.whatsapp).toBe(true);
  });
});
