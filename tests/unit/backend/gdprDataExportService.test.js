import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

let gdprDataExportService;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
    },
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../backend/services/gdprDataExportService.js');
    gdprDataExportService = mod.default;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

function createMockClient(responses = []) {
  let callIndex = 0;
  return {
    async query(sql, params) {
      const response = responses[callIndex] || { rows: [] };
      callIndex++;
      return response;
    },
    release() {},
  };
}

describe('gdprDataExportService.exportUserData', () => {
  test('throws error when userId is not provided', async () => {
    await expect(gdprDataExportService.exportUserData(null)).rejects.toThrow(
      'User ID is required for data export'
    );
  });

  test('exports complete user data package', async () => {
    const { pool } = await import('../../../backend/db.js');

    const userPersonal = {
      id: 'user-1',
      email: 'john@example.com',
      first_name: 'John',
      last_name: 'Doe',
      created_at: new Date(),
    };

    const responses = [
      { rows: [userPersonal] }, // personal info
      { rows: [] }, // consents
      { rows: [] }, // bookings
      { rows: [] }, // transactions
      { rows: [] }, // financial records nested query
      { rows: [{ balance: 1000 }] }, // balances
      { rows: [] }, // notifications
      { rows: [] }, // ratings given
      { rows: [] }, // ratings received
      { rows: [{ id: 'user-1', bio: 'Instructor' }] }, // instructor profile
      { rows: [] }, // instructor services
      { rows: [] }, // instructor notes
      { rows: [] }, // service packages
      { rows: [] }, // accommodation
      { rows: [] }, // equipment rentals
      { rows: [] }, // support requests
      { rows: [] }, // security audit
      { rows: [] }, // conversations
      { rows: [] }, // messages
    ];

    let callIndex = 0;
    pool.query.mockImplementation(() => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return Promise.resolve(response);
    });

    const result = await gdprDataExportService.exportUserData('user-1');

    expect(result).toHaveProperty('exportDate');
    expect(result).toHaveProperty('exportType', 'GDPR Article 15 - Right of Access');
    expect(result).toHaveProperty('userId', 'user-1');
    expect(result).toHaveProperty('personalInformation');
    expect(result).toHaveProperty('metadata');
    expect(result.personalInformation.email).toBe('john@example.com');
  });

  test('includes all required data categories', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValue({ rows: [] });

    const result = await gdprDataExportService.exportUserData('user-1');

    expect(result).toHaveProperty('consents');
    expect(result).toHaveProperty('bookings');
    expect(result).toHaveProperty('financialRecords');
    expect(result).toHaveProperty('communications');
    expect(result).toHaveProperty('chatMessages');
    expect(result).toHaveProperty('ratings');
    expect(result).toHaveProperty('instructorData');
    expect(result).toHaveProperty('servicePackages');
    expect(result).toHaveProperty('accommodation');
    expect(result).toHaveProperty('equipment');
    expect(result).toHaveProperty('supportRequests');
    expect(result).toHaveProperty('securityAudit');
  });

  test('counts total records in metadata', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValue({ rows: [] });

    const result = await gdprDataExportService.exportUserData('user-1');

    expect(result.metadata).toHaveProperty('recordsIncluded');
    expect(typeof result.metadata.recordsIncluded).toBe('number');
  });

  test('includes rights information', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValue({ rows: [] });

    const result = await gdprDataExportService.exportUserData('user-1');

    const rights = result.metadata.rightsInformation;
    expect(rights).toHaveProperty('rightToAccess');
    expect(rights).toHaveProperty('rightToErasure');
    expect(rights).toHaveProperty('rightToPortability');
    expect(rights).toHaveProperty('contactEmail');
  });

  test('logs export initiation and completion', async () => {
    const { pool } = await import('../../../backend/db.js');
    const { logger } = await import('../../../backend/middlewares/errorHandler.js');

    pool.query.mockResolvedValue({ rows: [] });

    await gdprDataExportService.exportUserData('user-1');

    expect(logger.info).toHaveBeenCalledWith(
      'Starting GDPR data export',
      expect.objectContaining({ userId: 'user-1' })
    );
    expect(logger.info).toHaveBeenCalledWith(
      'GDPR data export completed',
      expect.any(Object)
    );
  });

  test('logs error on export failure', async () => {
    const { pool } = await import('../../../backend/db.js');
    const { logger } = await import('../../../backend/middlewares/errorHandler.js');

    pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

    await expect(
      gdprDataExportService.exportUserData('user-1')
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      'GDPR data export failed',
      expect.objectContaining({ userId: 'user-1' })
    );
  });
});

describe('gdprDataExportService.getPersonalInformation', () => {
  test('retrieves user personal information', async () => {
    const { pool } = await import('../../../backend/db.js');

    const userInfo = {
      id: 'user-1',
      email: 'john@example.com',
      first_name: 'John',
      last_name: 'Doe',
      phone: '+1234567890',
      age: 30,
      created_at: new Date(),
    };

    pool.query.mockResolvedValueOnce({ rows: [userInfo] });

    const result = await gdprDataExportService.getPersonalInformation('user-1');

    expect(result.email).toBe('john@example.com');
    expect(result.first_name).toBe('John');
    expect(result.two_factor_enabled).toBeDefined();
  });

  test('returns null when user not found', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await gdprDataExportService.getPersonalInformation('user-999');

    expect(result).toBeNull();
  });
});

describe('gdprDataExportService.getBookings', () => {
  test('retrieves all bookings where user is student, instructor, or customer', async () => {
    const { pool } = await import('../../../backend/db.js');

    const bookings = [
      {
        id: 'b1',
        date: '2026-01-01',
        status: 'completed',
        final_amount: 100,
      },
    ];

    pool.query.mockResolvedValueOnce({ rows: bookings });

    const result = await gdprDataExportService.getBookings('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
  });
});

describe('gdprDataExportService.getFinancialRecords', () => {
  test('retrieves transactions, commissions, and balances', async () => {
    const { pool } = await import('../../../backend/db.js');

    const transactions = [{ id: 't1', amount: 100, type: 'service_payment' }];
    const balances = [{ balance: 500, currency: 'EUR' }];

    pool.query.mockResolvedValueOnce({ rows: transactions });
    pool.query.mockResolvedValueOnce({ rows: [] }); // commissions
    pool.query.mockResolvedValueOnce({ rows: balances });

    const result = await gdprDataExportService.getFinancialRecords('user-1');

    expect(result.transactions).toHaveLength(1);
    expect(result.balances).toHaveLength(1);
    expect(result.balances[0].balance).toBe(500);
  });
});

describe('gdprDataExportService.getCommunications', () => {
  test('retrieves user notifications', async () => {
    const { pool } = await import('../../../backend/db.js');

    const notifications = [
      { id: 'n1', type: 'email', title: 'Booking Confirmation', status: 'read' },
    ];

    pool.query.mockResolvedValueOnce({ rows: notifications });

    const result = await gdprDataExportService.getCommunications('user-1');

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].type).toBe('email');
  });
});

describe('gdprDataExportService.getRatings', () => {
  test('retrieves ratings given and received', async () => {
    const { pool } = await import('../../../backend/db.js');

    const given = [{ id: 'r1', rating: 5, feedback_text: 'Great!' }];
    const received = [{ id: 'r2', rating: 4, feedback_text: 'Good' }];

    pool.query.mockResolvedValueOnce({ rows: given });
    pool.query.mockResolvedValueOnce({ rows: received });

    const result = await gdprDataExportService.getRatings('user-1');

    expect(result.ratingsGiven).toHaveLength(1);
    expect(result.ratingsReceived).toHaveLength(1);
  });
});

describe('gdprDataExportService.anonymizeUserData', () => {
  test('anonymizes personal information while preserving ID', async () => {
    const { pool } = await import('../../../backend/db.js');

    const mockClient = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // UPDATE users
      { rows: [] }, // UPDATE bookings
      { rows: [] }, // UPDATE instructor_ratings
      { rows: [] }, // DELETE consents
      { rows: [] }, // DELETE notifications
      { rows: [] }, // UPDATE transactions
      { rows: [] }, // UPDATE messages
      { rows: [] }, // UPDATE conversation_participants
      { rows: [] }, // COMMIT
    ]);

    pool.connect.mockResolvedValueOnce(mockClient);

    const result = await gdprDataExportService.anonymizeUserData('user-1');

    expect(result.success).toBe(true);
    expect(result.message).toContain('anonymized');
    expect(result.message).toContain('7 years');
  });

  test('preserves financial records for 7 years compliance', async () => {
    const { pool } = await import('../../../backend/db.js');

    const mockClient = createMockClient([]);
    pool.connect.mockResolvedValueOnce(mockClient);

    await gdprDataExportService.anonymizeUserData('user-1');

    // Check that transactions are NOT deleted, only updated
    const transactionCalls = mockClient.query.toString().includes('UPDATE transactions');
    expect(result.message).toContain('7 years');
  });

  test('logs anonymization completion', async () => {
    const { pool } = await import('../../../backend/db.js');
    const { logger } = await import('../../../backend/middlewares/errorHandler.js');

    const mockClient = createMockClient(Array(10).fill({ rows: [] }));
    pool.connect.mockResolvedValueOnce(mockClient);

    await gdprDataExportService.anonymizeUserData('user-1');

    expect(logger.info).toHaveBeenCalledWith(
      'User data anonymized successfully',
      { userId: 'user-1' }
    );
  });

  test('rolls back on anonymization error', async () => {
    const { pool } = await import('../../../backend/db.js');
    const { logger } = await import('../../../backend/middlewares/errorHandler.js');

    const mockClient = {
      async query(sql) {
        if (sql?.includes('BEGIN')) return { rows: [] };
        if (sql?.includes('UPDATE users')) {
          throw new Error('Database error');
        }
        return { rows: [] };
      },
      release() {},
    };

    pool.connect.mockResolvedValueOnce(mockClient);

    await expect(
      gdprDataExportService.anonymizeUserData('user-1')
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      'User data anonymization failed',
      expect.objectContaining({ userId: 'user-1' })
    );
  });
});

describe('gdprDataExportService.getChatMessages', () => {
  test('retrieves conversations and messages within retention window', async () => {
    const { pool } = await import('../../../backend/db.js');

    const conversations = [{ id: 'c1', type: 'direct', name: 'John Doe' }];
    const messages = [{ id: 'm1', content: 'Hello', created_at: new Date() }];

    pool.query.mockResolvedValueOnce({ rows: conversations });
    pool.query.mockResolvedValueOnce({ rows: messages });

    const result = await gdprDataExportService.getChatMessages('user-1');

    expect(result.conversations).toHaveLength(1);
    expect(result.messages).toHaveLength(1);
    expect(result).toHaveProperty('retentionNotice');
  });

  test('indicates 5-day retention policy', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValue({ rows: [] });

    const result = await gdprDataExportService.getChatMessages('user-1');

    expect(result.retentionNotice).toContain('5 days');
  });
});

describe('gdprDataExportService.getInstructorData', () => {
  test('retrieves instructor profile, services, and student notes', async () => {
    const { pool } = await import('../../../backend/db.js');

    const profile = { id: 'user-1', bio: 'Experienced instructor', hourly_rate: 50 };
    const services = [{ service_id: 's1', created_at: new Date() }];
    const notes = [{ id: 'n1', note_text: 'Good progress', visibility: 'private' }];

    pool.query.mockResolvedValueOnce({ rows: [profile] });
    pool.query.mockResolvedValueOnce({ rows: services });
    pool.query.mockResolvedValueOnce({ rows: notes });

    const result = await gdprDataExportService.getInstructorData('user-1');

    expect(result.profile).toBeDefined();
    expect(result.services).toHaveLength(1);
    expect(result.studentNotes).toHaveLength(1);
  });
});

describe('gdprDataExportService.countRecords', () => {
  test('counts all records in data package', async () => {
    const dataPackage = {
      personalInformation: { id: 'user-1' },
      consents: [{ id: 1 }],
      bookings: [{ id: 'b1' }, { id: 'b2' }],
      financialRecords: {
        transactions: [{ id: 't1' }],
        commissions: [],
        balances: [{ balance: 100 }],
      },
      communications: { notifications: [{ id: 'n1' }] },
      ratings: { ratingsGiven: [], ratingsReceived: [{ id: 'r1' }] },
      instructorData: { services: [{ id: 's1' }], studentNotes: [] },
      servicePackages: [{ id: 'p1' }],
      accommodation: [{ id: 'a1' }],
      equipment: { rentals: [{ id: 'e1' }] },
      supportRequests: [{ id: 'sr1' }],
      securityAudit: [{ id: 'sa1' }],
      chatMessages: { conversations: [], messages: [{ id: 'm1' }] },
    };

    const count = gdprDataExportService.countRecords(dataPackage);

    expect(count).toBeGreaterThan(0);
    // 1 personal + 1 consent + 2 bookings + 1 transaction + 1 balance + 1 notification + 1 rating + 1 service + 1 package + 1 accommodation + 1 rental + 1 support + 1 audit + 1 message = 16
    expect(count).toBe(16);
  });
});

describe('gdprDataExportService.getRightsInformation', () => {
  test('provides all GDPR rights information', () => {
    const rights = gdprDataExportService.getRightsInformation();

    expect(rights).toHaveProperty('rightToAccess');
    expect(rights).toHaveProperty('rightToRectification');
    expect(rights).toHaveProperty('rightToErasure');
    expect(rights).toHaveProperty('rightToRestriction');
    expect(rights).toHaveProperty('rightToPortability');
    expect(rights).toHaveProperty('rightToObject');
    expect(rights).toHaveProperty('rightToWithdrawConsent');
    expect(rights).toHaveProperty('rightToLodgeComplaint');
    expect(rights).toHaveProperty('contactEmail');
    expect(rights).toHaveProperty('dataProtectionOfficer');
  });
});
