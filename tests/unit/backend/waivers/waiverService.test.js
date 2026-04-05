import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

/**
 * Waiver Service Tests
 * - Signature submission and storage
 * - Waiver status checking
 * - Version management
 * - Expiry logic (365 days)
 * - Family member support
 */

let WaiverService;
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
};

const mockAuditLog = {
  logWaiverModification: jest.fn(),
};

const mockNotification = {
  dispatchWaiverSigned: jest.fn(),
};

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: mockPool,
  }));

  await jest.unstable_mockModule('../../../../backend/services/auditLogService.js', () => mockAuditLog);
  await jest.unstable_mockModule('../../../../backend/services/waiverNotificationService.js', () => mockNotification);


  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/waiverService.js');
    WaiverService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('submitWaiver', () => {
  test('successfully submits waiver for user', async () => {
    const waiverData = {
      user_id: 'user-123',
      family_member_id: null,
      signer_user_id: 'user-123',
      waiver_version: '1.0',
      language_code: 'en',
      signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      agreed_to_terms: true,
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'v1', version_number: '1.0', is_active: true }],
    }); // version check

    mockPool.query.mockResolvedValueOnce({
      rows: [],
    }); // existing waiver check

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'waiver-123',
          user_id: 'user-123',
          family_member_id: null,
          signer_user_id: 'user-123',
          waiver_version: '1.0',
          language_code: 'en',
          signature_image_url: '/uploads/signatures/test.png',
          ip_address: '192.168.1.1',
          agreed_to_terms: true,
          photo_consent: false,
          signed_at: new Date(),
          created_at: new Date(),
        },
      ],
    }); // insert waiver

    const result = await WaiverService.submitWaiver(waiverData);

    expect(result).toHaveProperty('id');
    expect(result.waiver_version).toBe('1.0');
    expect(result.agreed_to_terms).toBe(true);
    expect(mockPool.query).toHaveBeenCalled();
  });

  test('rejects waiver submission when version not found', async () => {
    const waiverData = {
      user_id: 'user-123',
      family_member_id: null,
      signer_user_id: 'user-123',
      waiver_version: '99.0',
      language_code: 'en',
      signature_data: 'data:image/png;base64,iVBORw0KGgo=',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      agreed_to_terms: true,
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [],
    }); // version not found

    await expect(WaiverService.submitWaiver(waiverData)).rejects.toThrow(
      /Waiver version 99.0 \(en\) not found/
    );
  });

  test('rejects submission with neither user_id nor family_member_id', async () => {
    const waiverData = {
      user_id: null,
      family_member_id: null,
      signer_user_id: 'user-123',
      waiver_version: '1.0',
      language_code: 'en',
      signature_data: 'data:image/png;base64,iVBORw0KGgo=',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      agreed_to_terms: true,
      photo_consent: false,
    };

    await expect(WaiverService.submitWaiver(waiverData)).rejects.toThrow(
      /Must provide either user_id OR family_member_id/
    );
  });

  test('returns existing waiver if signed recently with same version', async () => {
    const now = Date.now();
    const recentDate = new Date(now - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    const waiverData = {
      user_id: 'user-123',
      family_member_id: null,
      signer_user_id: 'user-123',
      waiver_version: '1.0',
      language_code: 'en',
      signature_data: 'data:image/png;base64,iVBORw0KGgo=',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      agreed_to_terms: true,
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'v1', version_number: '1.0', is_active: true }],
    }); // version check

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'waiver-existing' }],
    }); // find existing waiver

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          signed_at: recentDate,
          waiver_version: '1.0',
          signature_image_url: '/uploads/signatures/test.png',
        },
      ],
    }); // get existing waiver details

    const result = await WaiverService.submitWaiver(waiverData);

    expect(result.already_signed).toBe(true);
    expect(result.message).toBe('Waiver already signed recently');
  });

  test('allows re-signing if version changed', async () => {
    const now = Date.now();
    const recentDate = new Date(now - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    const waiverData = {
      user_id: 'user-123',
      family_member_id: null,
      signer_user_id: 'user-123',
      waiver_version: '2.0',
      language_code: 'en',
      signature_data: 'data:image/png;base64,iVBORw0KGgo=',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      agreed_to_terms: true,
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'v2', version_number: '2.0', is_active: true }],
    }); // version check

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'waiver-existing' }],
    }); // find existing waiver

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          signed_at: recentDate,
          waiver_version: '1.0', // different version
          signature_image_url: '/uploads/signatures/old.png',
        },
      ],
    }); // get existing waiver with old version

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'waiver-new',
          waiver_version: '2.0',
          signature_image_url: '/uploads/signatures/new.png',
          signed_at: new Date(),
        },
      ],
    }); // insert new waiver

    const result = await WaiverService.submitWaiver(waiverData);

    expect(result.id).toBe('waiver-new');
    expect(result.waiver_version).toBe('2.0');
  });

  test('rejects when signing for family member without ownership', async () => {
    const waiverData = {
      user_id: null,
      family_member_id: 'child-456',
      signer_user_id: 'hacker-999',
      waiver_version: '1.0',
      language_code: 'en',
      signature_data: 'data:image/png;base64,iVBORw0KGgo=',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      agreed_to_terms: true,
      photo_consent: false,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'v1', version_number: '1.0', is_active: true }],
    }); // version check

    mockPool.query.mockResolvedValueOnce({
      rows: [{ parent_user_id: 'user-123' }],
    }); // family member exists but different parent

    await expect(WaiverService.submitWaiver(waiverData)).rejects.toThrow(
      /You can only sign waivers for your own family members/
    );
  });

  test('successfully submits for family member when parent owns them', async () => {
    const waiverData = {
      user_id: null,
      family_member_id: 'child-456',
      signer_user_id: 'user-123',
      waiver_version: '1.0',
      language_code: 'en',
      signature_data: 'data:image/png;base64,iVBORw0KGgo=',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      agreed_to_terms: true,
      photo_consent: true,
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'v1', version_number: '1.0', is_active: true }],
    }); // version check

    mockPool.query.mockResolvedValueOnce({
      rows: [{ parent_user_id: 'user-123' }],
    }); // family member owned by signer

    mockPool.query.mockResolvedValueOnce({
      rows: [],
    }); // no existing waiver

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'waiver-child',
          family_member_id: 'child-456',
          user_id: null,
          signer_user_id: 'user-123',
          photo_consent: true,
        },
      ],
    }); // insert waiver

    const result = await WaiverService.submitWaiver(waiverData);

    expect(result.family_member_id).toBe('child-456');
    expect(result.photo_consent).toBe(true);
  });
});

describe('needsToSignWaiver', () => {
  test('returns true when no waiver exists', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await WaiverService.needsToSignWaiver('user-123', 'user');

    expect(result).toBe(true);
  });

  test('returns false for valid recent waiver', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'w1', signed_at: recent, waiver_version: '1.0' }],
    }); // get recent waiver

    mockPool.query.mockResolvedValueOnce({
      rows: [{ version_number: '1.0' }],
    }); // check latest version is same

    const result = await WaiverService.needsToSignWaiver('user-123', 'user');

    expect(result).toBe(false);
  });

  test('returns true when waiver expired (> 365 days)', async () => {
    const now = new Date();
    const expired = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000); // 400 days ago

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'w1', signed_at: expired, waiver_version: '1.0' }],
    });

    const result = await WaiverService.needsToSignWaiver('user-123', 'user');

    expect(result).toBe(true);
  });

  test('returns true when newer version available', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'w1', signed_at: recent, waiver_version: '1.0' }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ version_number: '2.0' }], // newer version available
    });

    const result = await WaiverService.needsToSignWaiver('user-123', 'user');

    expect(result).toBe(true);
  });

  test('supports family_member type', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [],
    });

    const result = await WaiverService.needsToSignWaiver('family-child-789', 'family_member');

    expect(result).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('family_member_id'),
      ['family-child-789']
    );
  });
});

describe('checkWaiverStatus', () => {
  test('returns hasSigned false when no waiver found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await WaiverService.checkWaiverStatus('user-123', 'user');

    expect(result.hasSigned).toBe(false);
    expect(result.needsToSign).toBe(true);
    expect(result.message).toContain('No waiver found');
  });

  test('returns correct status for valid recent waiver', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'w1',
          signed_at: recent,
          waiver_version: '1.0',
          language_code: 'en',
          photo_consent: true,
          signature_image_url: '/uploads/signatures/test.png',
        },
      ],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ version_number: '1.0' }],
    });

    const result = await WaiverService.checkWaiverStatus('user-123', 'user');

    expect(result.hasSigned).toBe(true);
    expect(result.needsToSign).toBe(false);
    expect(result.isExpired).toBe(false);
    expect(result.photoConsent).toBe(true);
  });

  test('returns expired status for old waiver', async () => {
    const now = new Date();
    const expired = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'w1',
          signed_at: expired,
          waiver_version: '1.0',
          language_code: 'en',
          photo_consent: false,
          signature_image_url: '/uploads/signatures/old.png',
        },
      ],
    });

    const result = await WaiverService.checkWaiverStatus('user-123', 'user');

    expect(result.hasSigned).toBe(true);
    expect(result.needsToSign).toBe(true);
    expect(result.isExpired).toBe(true);
  });

  test('indicates new version available', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'w1',
          signed_at: recent,
          waiver_version: '1.0',
          language_code: 'en',
          photo_consent: false,
          signature_image_url: '/uploads/signatures/test.png',
        },
      ],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ version_number: '2.0' }],
    });

    const result = await WaiverService.checkWaiverStatus('user-123', 'user');

    expect(result.needsNewVersion).toBe(true);
    expect(result.currentVersion).toBe('1.0');
    expect(result.latestVersion).toBe('2.0');
  });
});

describe('getWaiverHistory', () => {
  test('returns list of waivers ordered by signed_at DESC', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'w2',
          waiver_version: '2.0',
          language_code: 'en',
          signed_at: new Date('2026-04-03'),
          signature_image_url: '/uploads/signatures/new.png',
          photo_consent: true,
        },
        {
          id: 'w1',
          waiver_version: '1.0',
          language_code: 'en',
          signed_at: new Date('2025-04-03'),
          signature_image_url: '/uploads/signatures/old.png',
          photo_consent: false,
        },
      ],
    });

    const result = await WaiverService.getWaiverHistory('user-123', 'user');

    expect(result).toHaveLength(2);
    expect(result[0].waiver_version).toBe('2.0');
    expect(result[1].waiver_version).toBe('1.0');
  });

  test('returns empty array when no history', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await WaiverService.getWaiverHistory('user-123', 'user');

    expect(result).toEqual([]);
  });
});

describe('getLatestActiveVersion', () => {
  test('returns latest active version for language', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'v2',
          version_number: '2.0',
          language_code: 'en',
          content: 'Version 2 content',
          is_active: true,
        },
      ],
    });

    const result = await WaiverService.getLatestActiveVersion('en');

    expect(result.version_number).toBe('2.0');
    expect(result.is_active).toBe(true);
  });

  test('returns null when no active version', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await WaiverService.getLatestActiveVersion('en');

    expect(result).toBeNull();
  });
});

describe('createWaiverVersion', () => {
  test('creates new waiver version and deactivates others', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // deactivate others

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'v3',
          version_number: '3.0',
          language_code: 'en',
          content: 'New content',
          is_active: true,
        },
      ],
    }); // insert new version

    const result = await WaiverService.createWaiverVersion({
      version_number: '3.0',
      language_code: 'en',
      content: 'New content',
      is_active: true,
      effective_date: new Date('2026-04-04'),
      created_by: 'admin-123',
    });

    expect(result.version_number).toBe('3.0');
    expect(result.is_active).toBe(true);
  });
});

describe('deleteWaiverById', () => {
  test('deletes waiver and signature file', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ signature_image_url: '/uploads/signatures/test.png' }],
    }); // find waiver

    mockPool.query.mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    }); // delete waiver

    const result = await WaiverService.deleteWaiverById('waiver-123');

    expect(result).toBe(true);
  });

  test('returns false when waiver not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await WaiverService.deleteWaiverById('nonexistent');

    expect(result).toBe(false);
  });
});

describe('getSignerDetails', () => {
  test('returns signer user details', async () => {
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

    const result = await WaiverService.getSignerDetails('user-123');

    expect(result.first_name).toBe('John');
    expect(result.email).toBe('john@example.com');
  });

  test('returns null when user not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await WaiverService.getSignerDetails('nonexistent');

    expect(result).toBeNull();
  });
});
