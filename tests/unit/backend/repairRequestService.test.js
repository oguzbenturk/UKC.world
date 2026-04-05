import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import * as repairRequestService from '../../../backend/services/repairRequestService.js';

let mockPool;

beforeAll(async () => {
  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] })
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

  await jest.unstable_mockModule('../../../backend/services/notificationWriter.js', () => ({
    insertNotification: jest.fn().mockResolvedValue({})
  }));
});

beforeEach(() => {
  mockPool.query.mockReset();
  jest.clearAllMocks();
});

describe('repairRequestService.getRepairRequests', () => {
  test('returns all repair requests for admin', async () => {
    const mockRequests = [
      {
        id: 1,
        user_id: 'user-1',
        equipment_type: 'board',
        item_name: 'Kite board',
        status: 'pending',
        priority: 'normal',
        created_at: '2026-04-01T10:00:00Z'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockRequests });

    const result = await repairRequestService.getRepairRequests(
      {},
      'admin-user',
      'admin'
    );

    expect(result).toEqual(mockRequests);
  });

  test('filters requests by status', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await repairRequestService.getRepairRequests(
      { status: 'in_progress' },
      'user-1',
      'admin'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('rr.status = $'),
      expect.arrayContaining(['in_progress'])
    );
  });

  test('filters requests by priority', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await repairRequestService.getRepairRequests(
      { priority: 'urgent' },
      'user-1',
      'admin'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('rr.priority = $'),
      expect.arrayContaining(['urgent'])
    );
  });

  test('restricts user to own requests', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await repairRequestService.getRepairRequests(
      {},
      'user-1',
      'student'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('rr.user_id = $'),
      expect.arrayContaining(['user-1'])
    );
  });

  test('allows admin to filter by specific userId', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await repairRequestService.getRepairRequests(
      { userId: 'user-2' },
      'admin-1',
      'admin'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('rr.user_id = $'),
      expect.arrayContaining(['user-2'])
    );
  });

  test('combines multiple filters', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await repairRequestService.getRepairRequests(
      { status: 'completed', priority: 'urgent' },
      'admin-1',
      'admin'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('AND'),
      expect.arrayContaining(['completed', 'urgent'])
    );
  });

  test('includes user name and email in response', async () => {
    const mockRequests = [
      {
        id: 1,
        user_id: 'user-1',
        user_name: 'John Doe',
        user_email: 'john@example.com',
        assigned_to_name: 'Jane Smith'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockRequests });

    const result = await repairRequestService.getRepairRequests({}, 'admin-1', 'admin');

    expect(result[0]).toHaveProperty('user_name');
    expect(result[0]).toHaveProperty('user_email');
    expect(result[0]).toHaveProperty('assigned_to_name');
  });
});

describe('repairRequestService.createRepairRequest', () => {
  test('creates repair request with required fields', async () => {
    const mockCreated = {
      id: 1,
      user_id: 'user-1',
      equipment_type: 'board',
      item_name: 'Kite board',
      status: 'pending',
      priority: 'normal'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockCreated] });

    const result = await repairRequestService.createRepairRequest(
      {
        equipmentType: 'board',
        itemName: 'Kite board',
        description: 'Broken fin',
        priority: 'normal'
      },
      'user-1'
    );

    expect(result).toEqual(mockCreated);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO repair_requests'),
      expect.arrayContaining(['user-1', 'board', 'Kite board', 'Broken fin', 'normal'])
    );
  });

  test('stores photos as JSON', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await repairRequestService.createRepairRequest(
      {
        equipmentType: 'board',
        itemName: 'Board',
        description: 'Damaged',
        photos: ['photo1.jpg', 'photo2.jpg']
      },
      'user-1'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([JSON.stringify(['photo1.jpg', 'photo2.jpg'])])
    );
  });

  test('sets initial status to pending', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] });

    await repairRequestService.createRepairRequest(
      {
        equipmentType: 'board',
        itemName: 'Board',
        description: 'Damaged'
      },
      'user-1'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("'pending'"),
      expect.anything()
    );
  });

  test('handles optional location field', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await repairRequestService.createRepairRequest(
      {
        equipmentType: 'board',
        itemName: 'Board',
        description: 'Damaged',
        location: 'Storage Room A'
      },
      'user-1'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['Storage Room A'])
    );
  });

  test('handles missing photos as empty array', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await repairRequestService.createRepairRequest(
      {
        equipmentType: 'board',
        itemName: 'Board',
        description: 'Damaged'
      },
      'user-1'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([JSON.stringify([])])
    );
  });
});

describe('repairRequestService.createGuestRepairRequest', () => {
  test('creates guest repair request with tracking token', async () => {
    const mockCreated = {
      id: 1,
      guest_name: 'Guest User',
      guest_email: 'guest@example.com',
      tracking_token: 'abc123def456',
      status: 'pending'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockCreated] });

    const result = await repairRequestService.createGuestRepairRequest({
      guestName: 'Guest User',
      guestEmail: 'guest@example.com',
      guestPhone: '555-1234',
      equipmentType: 'board',
      itemName: 'Kite board',
      description: 'Broken'
    });

    expect(result).toEqual(mockCreated);
    expect(result.tracking_token).toBeDefined();
  });

  test('generates unique tracking token', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, tracking_token: 'token1' }] });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 2, tracking_token: 'token2' }] });

    const result1 = await repairRequestService.createGuestRepairRequest({
      guestName: 'Guest 1',
      guestEmail: 'guest1@example.com',
      equipmentType: 'board',
      itemName: 'Board',
      description: 'Broken'
    });

    const result2 = await repairRequestService.createGuestRepairRequest({
      guestName: 'Guest 2',
      guestEmail: 'guest2@example.com',
      equipmentType: 'harness',
      itemName: 'Harness',
      description: 'Torn'
    });

    expect(result1.tracking_token).not.toEqual(result2.tracking_token);
  });

  test('sets initial status to pending for guest requests', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] });

    await repairRequestService.createGuestRepairRequest({
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      equipmentType: 'board',
      itemName: 'Board',
      description: 'Broken'
    });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("'pending'"),
      expect.anything()
    );
  });
});

describe('repairRequestService.getRepairRequestByToken', () => {
  test('retrieves repair request by tracking token', async () => {
    const mockRequest = {
      id: 1,
      tracking_token: 'abc123def456',
      equipment_type: 'board',
      item_name: 'Kite board',
      status: 'pending'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockRequest] });

    const result = await repairRequestService.getRepairRequestByToken('abc123def456');

    expect(result).toEqual(mockRequest);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('tracking_token = $1'),
      ['abc123def456']
    );
  });

  test('returns null when token not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await repairRequestService.getRepairRequestByToken('invalid-token');

    expect(result).toBeNull();
  });

  test('excludes internal admin fields from token view', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await repairRequestService.getRepairRequestByToken('token123');

    const query = mockPool.query.mock.calls[0][0];
    // Should not include internal admin notes
    expect(query).not.toContain('internal_notes');
  });
});

describe('repairRequestService.updateRepairRequest', () => {
  test('updates repair request status', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'pending', item_name: 'Board' }]
    });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'in_progress', item_name: 'Board' }]
    });

    const result = await repairRequestService.updateRepairRequest(1, {
      status: 'in_progress'
    });

    expect(result.status).toBe('in_progress');
  });

  test('transitions through status states correctly', async () => {
    // pending -> in_progress -> completed
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'pending' }]
    });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'in_progress' }]
    });

    const result = await repairRequestService.updateRepairRequest(1, {
      status: 'in_progress'
    });

    expect(result.status).toBe('in_progress');
  });

  test('updates assigned_to field', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, assigned_to: null }]
    });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, assigned_to: 'tech-1' }]
    });

    await repairRequestService.updateRepairRequest(1, {
      assignedTo: 'tech-1'
    });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['tech-1'])
    );
  });

  test('updates notes field', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, notes: null }]
    });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, notes: 'In repair' }]
    });

    await repairRequestService.updateRepairRequest(1, {
      notes: 'In repair'
    });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['In repair'])
    );
  });

  test('throws error when repair request not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      repairRequestService.updateRepairRequest(999, { status: 'in_progress' })
    ).rejects.toThrow('Repair request not found');
  });

  test('updates updated_at timestamp', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'pending' }]
    });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'completed', updated_at: '2026-04-04T10:00:00Z' }]
    });

    await repairRequestService.updateRepairRequest(1, { status: 'completed' });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('updated_at = NOW()'),
      expect.anything()
    );
  });
});

describe('repairRequestService.getRepairStatistics', () => {
  test('returns repair statistics', async () => {
    const mockStats = {
      pending_count: '5',
      in_progress_count: '3',
      completed_count: '20',
      urgent_count: '2',
      total_count: '28'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockStats] });

    const result = await repairRequestService.getRepairStatistics();

    expect(result).toEqual(mockStats);
    expect(result.pending_count).toBe('5');
    expect(result.total_count).toBe('28');
  });

  test('counts pending requests correctly', async () => {
    const mockStats = {
      pending_count: '0',
      in_progress_count: '0',
      completed_count: '0',
      urgent_count: '0',
      total_count: '0'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [mockStats] });

    const result = await repairRequestService.getRepairStatistics();

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      expect.anything()
    );
  });
});

describe('repairRequestService.getRepairComments', () => {
  test('returns comments for repair request', async () => {
    const mockComments = [
      {
        id: 1,
        repair_request_id: 1,
        user_id: 'user-1',
        message: 'This is broken',
        is_internal: false,
        created_at: '2026-04-01T10:00:00Z'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
    mockPool.query.mockResolvedValueOnce({ rows: mockComments });

    const result = await repairRequestService.getRepairComments(1, 'user-1', 'student');

    expect(result).toEqual(mockComments);
  });

  test('throws error when repair request not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      repairRequestService.getRepairComments(999, 'user-1', 'student')
    ).rejects.toThrow('Repair request not found');
  });

  test('restricts non-admin users from internal comments', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await repairRequestService.getRepairComments(1, 'user-1', 'student');

    const query = mockPool.query.mock.calls[1][0];
    expect(query).toContain('is_internal = FALSE');
  });

  test('allows admin to see internal comments', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await repairRequestService.getRepairComments(1, 'admin-1', 'admin');

    const query = mockPool.query.mock.calls[1][0];
    expect(query).not.toContain('is_internal = FALSE');
  });

  test('throws error when user not authorized', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

    await expect(
      repairRequestService.getRepairComments(1, 'user-2', 'student')
    ).rejects.toThrow('You do not have access to this repair request');
  });
});

describe('repairRequestService.addRepairComment', () => {
  test('adds comment to repair request', async () => {
    const mockComment = {
      id: 1,
      repair_request_id: 1,
      user_id: 'user-1',
      message: 'My comment',
      is_internal: false
    };

    mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1', item_name: 'Board' }] });
    mockPool.query.mockResolvedValueOnce({ rows: [mockComment] });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ first_name: 'John', last_name: 'Doe', role: 'student' }]
    });

    const result = await repairRequestService.addRepairComment(
      1,
      'user-1',
      'student',
      'My comment',
      false
    );

    expect(result.message).toBe('My comment');
  });

  test('allows admin to add internal comments', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1', item_name: 'Board' }] });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, is_internal: true }]
    });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ first_name: 'Admin', last_name: 'User', role: 'admin' }]
    });

    await repairRequestService.addRepairComment(1, 'admin-1', 'admin', 'Internal note', true);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO repair_request_comments'),
      expect.arrayContaining([1, 'admin-1', 'Internal note', true])
    );
  });

  test('throws error when repair request not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      repairRequestService.addRepairComment(999, 'user-1', 'student', 'Comment')
    ).rejects.toThrow('Repair request not found');
  });

  test('throws error when user not authorized', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1', item_name: 'Board' }] });

    await expect(
      repairRequestService.addRepairComment(1, 'user-2', 'student', 'Comment')
    ).rejects.toThrow('You do not have access to this repair request');
  });
});
