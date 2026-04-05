import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

/**
 * Group Lesson Request Service Tests
 * - Create lesson requests
 * - List user and admin requests
 * - Match multiple requests into group booking
 * - Cancel requests (user and admin)
 * - Expire old requests
 * - Multi-source queries (requests, group bookings, lesson bookings)
 */

let GroupLessonRequestService;

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockGroupBookingService = {
  createGroupBooking: jest.fn(),
  addParticipantsByUserIds: jest.fn(),
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

  await jest.unstable_mockModule('../../../../backend/services/groupBookingService.js', () => mockGroupBookingService);

  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger,
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/groupLessonRequestService.js');
    GroupLessonRequestService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('createGroupLessonRequest', () => {
  test('creates new group lesson request with defaults', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'req-123',
          user_id: 'user-123',
          service_id: 'service-456',
          preferred_date_start: '2026-04-10',
          preferred_date_end: null,
          preferred_time_of_day: 'any',
          preferred_duration_hours: 1,
          skill_level: 'beginner',
          notes: null,
          status: 'pending',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const result = await GroupLessonRequestService.createGroupLessonRequest({
      userId: 'user-123',
      serviceId: 'service-456',
      preferredDateStart: '2026-04-10',
      skillLevel: 'beginner',
    });

    expect(result.id).toBe('req-123');
    expect(result.status).toBe('pending');
    expect(result.preferred_duration_hours).toBe(1);
  });

  test('creates request with custom duration and notes', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'req-124',
          user_id: 'user-124',
          service_id: 'service-457',
          preferred_date_start: '2026-04-15',
          preferred_date_end: '2026-04-20',
          preferred_duration_hours: 2,
          skill_level: 'intermediate',
          notes: 'Prefer morning lessons',
          status: 'pending',
        },
      ],
    });

    const result = await GroupLessonRequestService.createGroupLessonRequest({
      userId: 'user-124',
      serviceId: 'service-457',
      preferredDateStart: '2026-04-15',
      preferredDateEnd: '2026-04-20',
      preferredDurationHours: 2,
      skillLevel: 'intermediate',
      notes: 'Prefer morning lessons',
    });

    expect(result.preferred_duration_hours).toBe(2);
    expect(result.notes).toBe('Prefer morning lessons');
  });
});

describe('getUserRequests', () => {
  test('returns user requests ordered by creation date', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'req-200',
          user_id: 'user-200',
          service_id: 'service-200',
          service_name: 'Beginner Kite',
          status: 'pending',
          created_at: '2026-04-04',
        },
        {
          id: 'req-199',
          user_id: 'user-200',
          service_id: 'service-199',
          service_name: 'Advanced Kite',
          status: 'matched',
          created_at: '2026-04-03',
        },
      ],
    });

    const result = await GroupLessonRequestService.getUserRequests('user-200');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('req-200');
    expect(result[0].service_name).toBe('Beginner Kite');
  });

  test('returns empty array when user has no requests', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await GroupLessonRequestService.getUserRequests('user-none');

    expect(result).toEqual([]);
  });
});

describe('getAllRequests', () => {
  test('returns pending requests by default', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'req-300',
          user_id: 'user-300',
          status: 'pending',
          source: 'request',
        },
      ],
    }); // group lesson requests

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'gb-300',
          user_id: 'user-301',
          status: 'pending',
          source: 'group_booking',
        },
      ],
    }); // student group bookings

    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'b-300',
          user_id: 'user-302',
          status: 'pending',
          source: 'lesson_booking',
        },
      ],
    }); // lesson bookings

    const result = await GroupLessonRequestService.getAllRequests({ status: 'pending' });

    expect(result).toHaveLength(3);
    expect(result.map(r => r.source)).toContain('request');
    expect(result.map(r => r.source)).toContain('group_booking');
    expect(result.map(r => r.source)).toContain('lesson_booking');
  });

  test('filters by service ID', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'req-301', service_id: 'service-100' }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'gb-301', service_id: 'service-100' }],
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'b-301', service_id: 'service-100' }],
    });

    await GroupLessonRequestService.getAllRequests({
      status: 'pending',
      serviceId: 'service-100',
    });

    // Verify service filter was applied to each query
    const calls = mockPool.query.mock.calls;
    expect(calls[0][1]).toContain('service-100');
  });

  test('filters by skill level', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'req-302', skill_level: 'intermediate' },
        { id: 'req-303', skill_level: 'any' },
      ],
    });

    mockPool.query.mockResolvedValueOnce({ rows: [] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await GroupLessonRequestService.getAllRequests({
      status: 'pending',
      skillLevel: 'intermediate',
    });

    expect(mockPool.query).toHaveBeenCalled();
  });
});

describe('cancelRequest', () => {
  test('cancels request by owner', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'req-400',
          user_id: 'user-400',
          status: 'cancelled',
        },
      ],
    });

    const result = await GroupLessonRequestService.cancelRequest('req-400', 'user-400');

    expect(result.status).toBe('cancelled');
  });

  test('rejects cancel by non-owner', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      GroupLessonRequestService.cancelRequest('req-401', 'wrong-user')
    ).rejects.toThrow('Request not found or already processed');
  });

  test('rejects cancel of non-pending request', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      GroupLessonRequestService.cancelRequest('req-402', 'user-402')
    ).rejects.toThrow('Request not found or already processed');
  });
});

describe('adminCancelRequest', () => {
  test('allows admin to cancel any pending request', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'req-500',
          user_id: 'user-500',
          status: 'cancelled',
        },
      ],
    });

    const result = await GroupLessonRequestService.adminCancelRequest('req-500');

    expect(result.status).toBe('cancelled');
  });

  test('rejects cancel of non-existent request', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      GroupLessonRequestService.adminCancelRequest('nonexistent')
    ).rejects.toThrow('Request not found or already processed');
  });
});

describe('matchRequests', () => {
  test('matches 2+ requests into group booking', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool.connect.mockResolvedValueOnce(mockClient);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'req-600',
            user_id: 'user-600',
            service_id: 'service-600',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
            preferred_date_start: '2026-04-15',
            preferred_duration_hours: 1,
          },
          {
            id: 'req-601',
            user_id: 'user-601',
            service_id: 'service-600',
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@example.com',
            preferred_date_start: '2026-04-15',
            preferred_duration_hours: 1,
          },
        ],
      }) // SELECT requests
      .mockResolvedValueOnce({
        rows: [{ base_price: 50 }],
      }) // SELECT service
      .mockResolvedValueOnce({
        rows: [],
      }) // UPDATE requests
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    mockGroupBookingService.createGroupBooking.mockResolvedValueOnce({
      id: 'gb-600',
    });

    mockGroupBookingService.addParticipantsByUserIds.mockResolvedValueOnce(null);

    const result = await GroupLessonRequestService.matchRequests({
      requestIds: ['req-600', 'req-601'],
      matchedBy: 'admin-123',
    });

    expect(result.groupBooking.id).toBe('gb-600');
    expect(result.matchedRequests).toHaveLength(2);
    expect(result.matchedRequests[0].name).toBe('John Doe');
  });

  test('rejects matching fewer than 2 requests', async () => {
    await expect(
      GroupLessonRequestService.matchRequests({
        requestIds: ['req-solo'],
        matchedBy: 'admin-456',
      })
    ).rejects.toThrow('At least 2 requests are required');
  });

  test('rejects when requests have different service IDs', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool.connect.mockResolvedValueOnce(mockClient);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'req-602',
            service_id: 'service-602',
            user_id: 'user-602',
          },
          {
            id: 'req-603',
            service_id: 'service-603', // different service!
            user_id: 'user-603',
          },
        ],
      });

    await expect(
      GroupLessonRequestService.matchRequests({
        requestIds: ['req-602', 'req-603'],
        matchedBy: 'admin-789',
      })
    ).rejects.toThrow('All requests must be for the same lesson type');

    expect(mockClient.release).toHaveBeenCalled();
  });

  test('uses provided scheduled date over request preference', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool.connect.mockResolvedValueOnce(mockClient);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'req-610',
            user_id: 'user-610',
            service_id: 'service-610',
            preferred_date_start: '2026-04-10', // request pref
            preferred_duration_hours: 1,
            first_name: 'Test',
            last_name: 'User',
            email: 'test@example.com',
          },
          {
            id: 'req-611',
            user_id: 'user-611',
            service_id: 'service-610',
            preferred_date_start: '2026-04-10',
            preferred_duration_hours: 1,
            first_name: 'Test2',
            last_name: 'User2',
            email: 'test2@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ base_price: 50 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockGroupBookingService.createGroupBooking.mockResolvedValueOnce({
      id: 'gb-610',
    });

    mockGroupBookingService.addParticipantsByUserIds.mockResolvedValueOnce(null);

    await GroupLessonRequestService.matchRequests({
      requestIds: ['req-610', 'req-611'],
      matchedBy: 'admin-111',
      scheduledDate: '2026-04-20', // override
    });

    expect(mockGroupBookingService.createGroupBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledDate: '2026-04-20',
      })
    );
  });

  test('uses service base_price when no price provided', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool.connect.mockResolvedValueOnce(mockClient);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'req-620',
            user_id: 'user-620',
            service_id: 'service-620',
            preferred_date_start: '2026-04-25',
            preferred_duration_hours: 1,
            first_name: 'A',
            last_name: 'B',
            email: 'a@example.com',
          },
          {
            id: 'req-621',
            user_id: 'user-621',
            service_id: 'service-620',
            preferred_date_start: '2026-04-25',
            preferred_duration_hours: 1,
            first_name: 'C',
            last_name: 'D',
            email: 'c@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ base_price: 75.50 }], // service price with decimal
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockGroupBookingService.createGroupBooking.mockResolvedValueOnce({
      id: 'gb-620',
    });

    mockGroupBookingService.addParticipantsByUserIds.mockResolvedValueOnce(null);

    await GroupLessonRequestService.matchRequests({
      requestIds: ['req-620', 'req-621'],
      matchedBy: 'admin-222',
      // No pricePerPerson provided
    });

    expect(mockGroupBookingService.createGroupBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        pricePerPerson: 75.50,
      })
    );
  });
});

describe('getRequestById', () => {
  test('returns request with service and user details', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'req-700',
          user_id: 'user-700',
          service_id: 'service-700',
          service_name: 'Kite Surfing 101',
          first_name: 'Mike',
          last_name: 'Johnson',
          email: 'mike@example.com',
        },
      ],
    });

    const result = await GroupLessonRequestService.getRequestById('req-700');

    expect(result.id).toBe('req-700');
    expect(result.service_name).toBe('Kite Surfing 101');
    expect(result.first_name).toBe('Mike');
  });

  test('returns null when request not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await GroupLessonRequestService.getRequestById('nonexistent');

    expect(result).toBeNull();
  });
});

describe('expirePendingRequests', () => {
  test('expires pending requests older than specified days', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'req-800' }, { id: 'req-801' }],
    });

    const result = await GroupLessonRequestService.expirePendingRequests(30);

    expect(result).toBe(2);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Expired 2 old group lesson requests'
    );
  });

  test('returns 0 when no requests to expire', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await GroupLessonRequestService.expirePendingRequests(30);

    expect(result).toBe(0);
  });

  test('uses default 30 days when not specified', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await GroupLessonRequestService.expirePendingRequests();

    const call = mockPool.query.mock.calls[0];
    expect(call[1][0]).toBe(30);
  });

  test('respects custom expiration days', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await GroupLessonRequestService.expirePendingRequests(60);

    const call = mockPool.query.mock.calls[0];
    expect(call[1][0]).toBe(60);
  });
});
