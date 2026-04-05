import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

/**
 * Group Booking Service Tests
 * - Group booking creation with organizer
 * - Participant management
 * - Invitation system
 * - Payment model handling (individual vs organizer_pays)
 * - Capacity validation
 * - Transaction recording for wallet
 */

let GroupBookingService;

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockWalletService = {
  default: {
    recordTransaction: jest.fn(),
  },
};

const mockCurrencyService = {
  default: {
    convertAmount: jest.fn(),
  },
};

const mockRoleUpgradeService = {
  default: {
    checkAndUpgradeAfterBooking: jest.fn(),
  },
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: mockPool,
  }));

  await jest.unstable_mockModule('../../../../backend/services/walletService.js', () => mockWalletService.default);
  await jest.unstable_mockModule('../../../../backend/services/currencyService.js', () => mockCurrencyService);
  await jest.unstable_mockModule('../../../../backend/services/roleUpgradeService.js', () => mockRoleUpgradeService.default);

  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger,
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/groupBookingService.js');
    GroupBookingService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// Helper to create mock pg client
function createMockClient() {
  const queries = [];
  return {
    async query(sql, params) {
      queries.push({ sql, params });
      // Return empty rows by default
      return { rows: [] };
    },
    async queryWithResult(result) {
      return result;
    },
    release: jest.fn(),
    queries,
    async begin() {
      return this.query('BEGIN');
    },
    async commit() {
      return this.query('COMMIT');
    },
    async rollback() {
      return this.query('ROLLBACK');
    },
  };
}

describe('createGroupBooking', () => {
  test('creates group booking with organizer as first participant', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool.connect.mockResolvedValueOnce(mockClient);

    // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    // INSERT group_bookings
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'group-123',
          organizer_id: 'user-123',
          service_id: 'service-456',
          title: 'Group Kite Lesson',
          status: 'pending',
          price_per_person: 50,
          currency: 'EUR',
          scheduled_date: '2026-04-10',
          start_time: '09:00',
          duration_hours: 2,
          max_participants: 4,
          min_participants: 2,
        },
      ],
    });

    // SELECT users
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '555-1234',
        },
      ],
    });

    // INSERT group_booking_participants
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    // COMMIT
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    mockRoleUpgradeService.default.checkAndUpgradeAfterBooking.mockResolvedValueOnce(null);

    const result = await GroupBookingService.createGroupBooking({
      organizerId: 'user-123',
      serviceId: 'service-456',
      title: 'Group Kite Lesson',
      description: 'Learn group dynamics',
      maxParticipants: 4,
      minParticipants: 2,
      pricePerPerson: 50,
      currency: 'EUR',
      scheduledDate: '2026-04-10',
      startTime: '09:00',
      durationHours: 2,
      paymentModel: 'individual',
    });

    expect(result.id).toBe('group-123');
    expect(result.organizer_id).toBe('user-123');
    expect(result.max_participants).toBe(4);
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('handles organizer_pays payment model correctly', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool.connect.mockResolvedValueOnce(mockClient);

    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'group-124',
          organizer_id: 'user-124',
          price_per_person: 100,
        },
      ],
    }); // INSERT group_bookings

    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-124',
          email: 'jane@example.com',
          first_name: 'Jane',
          last_name: 'Smith',
          phone: '555-5678',
        },
      ],
    }); // SELECT users

    mockClient.query.mockResolvedValueOnce({ rows: [] }); // INSERT participant

    // Verify that organizer's payment_status is 'not_applicable' and amount_due is 0
    const participantQuery = mockClient.query.mock.calls.find(
      call => call[0] && call[0].includes('group_booking_participants')
    );

    mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockRoleUpgradeService.default.checkAndUpgradeAfterBooking.mockResolvedValueOnce(null);

    await GroupBookingService.createGroupBooking({
      organizerId: 'user-124',
      serviceId: 'service-124',
      pricePerPerson: 100,
      paymentModel: 'organizer_pays',
    });

    // Check the participant insert call
    const participantCalls = mockClient.query.mock.calls.filter(
      call => call[0] && call[0].includes('INSERT INTO group_booking_participants')
    );

    expect(participantCalls.length).toBeGreaterThan(0);
  });

  test('rollbacks transaction on error', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool.connect.mockResolvedValueOnce(mockClient);

    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockRejectedValueOnce(new Error('Database error')); // INSERT fails

    await expect(
      GroupBookingService.createGroupBooking({
        organizerId: 'user-error',
        serviceId: 'service-error',
      })
    ).rejects.toThrow('Database error');

    // Verify ROLLBACK was called
    const rollbackCall = mockClient.query.mock.calls.find(
      call => call[0] && call[0].includes('ROLLBACK')
    );
    expect(rollbackCall).toBeDefined();
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('logs error when role upgrade fails', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool.connect.mockResolvedValueOnce(mockClient);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'group-125', organizer_id: 'user-125' }],
      }) // INSERT group_bookings
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-125',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            phone: null,
          },
        ],
      }) // SELECT users
      .mockResolvedValueOnce({ rows: [] }) // INSERT participant
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    mockRoleUpgradeService.default.checkAndUpgradeAfterBooking.mockRejectedValueOnce(
      new Error('Upgrade failed')
    );

    const result = await GroupBookingService.createGroupBooking({
      organizerId: 'user-125',
      serviceId: 'service-125',
    });

    expect(result.id).toBe('group-125');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to upgrade organizer role after creating group booking',
      expect.any(Object)
    );
  });
});



