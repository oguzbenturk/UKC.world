import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import * as userRelationshipsService from '../../../backend/services/userRelationshipsService.js';

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

  await jest.unstable_mockModule('../../../backend/services/notificationWriter.js', () => ({
    insertNotification: jest.fn().mockResolvedValue({})
  }));
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.connect.mockClear();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

describe('userRelationshipsService.sendFriendRequest', () => {
  test('sends friend request successfully', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'user-2', first_name: 'Jane', last_name: 'Doe', role_name: 'student' }]
      }) // receiver exists
      .mockResolvedValueOnce({ rows: [] }) // no existing relationship
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // insert relationship
      .mockResolvedValueOnce({
        rows: [{ full_name: 'John Doe' }]
      }) // sender name
      .mockResolvedValueOnce({}) // insert notification
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userRelationshipsService.sendFriendRequest(
      'user-1',
      'user-2',
      'Let\'s be friends'
    );

    expect(result.status).toBe('pending');
    expect(result.relationshipId).toBe(1);
  });

  test('throws error when sending to self', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query.mockResolvedValueOnce({}); // BEGIN

    await expect(
      userRelationshipsService.sendFriendRequest('user-1', 'user-1')
    ).rejects.toThrow('cannot send a friend request to yourself');
  });

  test('throws error when receiver not found', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // receiver not found

    await expect(
      userRelationshipsService.sendFriendRequest('user-1', 'user-2')
    ).rejects.toThrow('User not found');
  });

  test('throws error when already connected', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'user-2', role_name: 'student' }]
      }) // receiver exists
      .mockResolvedValueOnce({
        rows: [{ id: 1, status: 'accepted' }]
      }); // already connected

    await expect(
      userRelationshipsService.sendFriendRequest('user-1', 'user-2')
    ).rejects.toThrow('already connected');
  });

  test('throws error when request already sent', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'user-2', role_name: 'student' }]
      }) // receiver exists
      .mockResolvedValueOnce({
        rows: [{ id: 1, status: 'pending', sender_id: 'user-1' }]
      }); // pending request from user-1

    await expect(
      userRelationshipsService.sendFriendRequest('user-1', 'user-2')
    ).rejects.toThrow('already sent a friend request');
  });

  test('auto-accepts mutual friend request', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'user-2', role_name: 'student' }]
      }) // receiver exists
      .mockResolvedValueOnce({
        rows: [{ id: 1, status: 'pending', sender_id: 'user-2' }]
      }) // pending from user-2
      .mockResolvedValueOnce({}) // update to accepted
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userRelationshipsService.sendFriendRequest('user-1', 'user-2');

    expect(result.status).toBe('accepted');
    expect(result.message).toContain('Friend request accepted');
  });

  test('throws error when blocked by user', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'user-2', role_name: 'student' }]
      }) // receiver exists
      .mockResolvedValueOnce({
        rows: [{ id: 1, status: 'blocked' }]
      }); // blocked

    await expect(
      userRelationshipsService.sendFriendRequest('user-1', 'user-2')
    ).rejects.toThrow('Unable to send friend request');
  });

  test('allows resending after decline', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'user-2', role_name: 'student' }]
      }) // receiver exists
      .mockResolvedValueOnce({
        rows: [{ id: 1, status: 'declined', sender_id: 'user-1' }]
      }) // previously declined
      .mockResolvedValueOnce({}) // update to pending
      .mockResolvedValueOnce({
        rows: [{ full_name: 'John Doe' }]
      }) // sender name
      .mockResolvedValueOnce({}) // insert notification
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userRelationshipsService.sendFriendRequest('user-1', 'user-2');

    expect(result.status).toBe('pending');
  });
});

describe('userRelationshipsService.acceptFriendRequest', () => {
  test('accepts friend request successfully', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, receiver_id: 'user-1', sender_id: 'user-2', status: 'pending' }]
      }) // get relationship
      .mockResolvedValueOnce({}) // update relationship
      .mockResolvedValueOnce({}) // update notification
      .mockResolvedValueOnce({
        rows: [{ full_name: 'Alice Smith' }]
      }) // receiver name
      .mockResolvedValueOnce({}) // insert notification
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userRelationshipsService.acceptFriendRequest('user-1', 1);

    expect(result.success).toBe(true);
  });

  test('throws error when request not found', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // no relationship

    await expect(
      userRelationshipsService.acceptFriendRequest('user-1', 999)
    ).rejects.toThrow('Friend request not found');
  });

  test('throws error when not the receiver', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, receiver_id: 'user-2', sender_id: 'user-1' }]
      }); // different receiver

    await expect(
      userRelationshipsService.acceptFriendRequest('user-1', 1)
    ).rejects.toThrow('not authorized');
  });

  test('returns success for already accepted request', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, receiver_id: 'user-1', status: 'accepted' }]
      }); // already accepted

    const result = await userRelationshipsService.acceptFriendRequest('user-1', 1);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Already connected');
  });

  test('throws error for non-pending request', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, receiver_id: 'user-1', status: 'declined' }]
      }); // declined status

    await expect(
      userRelationshipsService.acceptFriendRequest('user-1', 1)
    ).rejects.toThrow('cannot be accepted');
  });
});

describe('userRelationshipsService.declineFriendRequest', () => {
  test('declines friend request successfully', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, receiver_id: 'user-1', status: 'pending' }]
      }) // get relationship
      .mockResolvedValueOnce({}) // update relationship
      .mockResolvedValueOnce({}) // update notification
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userRelationshipsService.declineFriendRequest('user-1', 1);

    expect(result.success).toBe(true);
  });

  test('throws error when request not found', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      userRelationshipsService.declineFriendRequest('user-1', 999)
    ).rejects.toThrow('Friend request not found');
  });

  test('throws error when not the receiver', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, receiver_id: 'user-2' }]
      });

    await expect(
      userRelationshipsService.declineFriendRequest('user-1', 1)
    ).rejects.toThrow('not authorized');
  });

  test('returns success for already declined request', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, receiver_id: 'user-1', status: 'declined' }]
      });

    const result = await userRelationshipsService.declineFriendRequest('user-1', 1);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Already declined');
  });
});

describe('userRelationshipsService.removeFriend', () => {
  test('removes friend successfully', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const result = await userRelationshipsService.removeFriend('user-1', 'user-2');

    expect(result.success).toBe(true);
  });

  test('throws error when not connected', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      userRelationshipsService.removeFriend('user-1', 'user-2')
    ).rejects.toThrow('not connected');
  });

  test('removes relationship in either direction', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await userRelationshipsService.removeFriend('user-1', 'user-2');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('sender_id = $1 AND receiver_id = $2'),
      expect.arrayContaining(['user-1', 'user-2'])
    );
  });
});

describe('userRelationshipsService.blockUser', () => {
  test('blocks user successfully', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // no existing relationship
      .mockResolvedValueOnce({}) // insert blocked relationship
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userRelationshipsService.blockUser('user-1', 'user-2');

    expect(result.success).toBe(true);
  });

  test('updates existing relationship to blocked', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, sender_id: 'user-1' }]
      }) // existing relationship
      .mockResolvedValueOnce({}) // update to blocked
      .mockResolvedValueOnce({}); // COMMIT

    await userRelationshipsService.blockUser('user-1', 'user-2');

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'blocked'"),
      [1]
    );
  });

  test('handles blocking when relationship in opposite direction', async () => {
    mockPool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, sender_id: 'user-2' }]
      }) // relationship from user-2 to user-1
      .mockResolvedValueOnce({}) // delete existing
      .mockResolvedValueOnce({}) // insert with correct direction
      .mockResolvedValueOnce({}); // COMMIT

    await userRelationshipsService.blockUser('user-1', 'user-2');

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_relationships'),
      [1]
    );
  });
});

describe('userRelationshipsService.getFriends', () => {
  test('returns list of accepted friends', async () => {
    const mockFriends = [
      {
        friend_id: 'user-2',
        relationship_id: 1,
        first_name: 'Jane',
        last_name: 'Doe',
        full_name: 'Jane Doe'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockFriends });

    const result = await userRelationshipsService.getFriends('user-1');

    expect(result).toEqual(mockFriends);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'accepted'"),
      ['user-1']
    );
  });

  test('returns empty array when no friends', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await userRelationshipsService.getFriends('user-1');

    expect(result).toEqual([]);
  });
});

describe('userRelationshipsService.getPendingRequests', () => {
  test('returns pending friend requests received', async () => {
    const mockRequests = [
      {
        relationship_id: 1,
        sender_id: 'user-2',
        first_name: 'John',
        last_name: 'Smith',
        full_name: 'John Smith'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockRequests });

    const result = await userRelationshipsService.getPendingRequests('user-1');

    expect(result).toEqual(mockRequests);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      ['user-1']
    );
  });
});

describe('userRelationshipsService.getSentRequests', () => {
  test('returns pending friend requests sent', async () => {
    const mockRequests = [
      {
        relationship_id: 1,
        receiver_id: 'user-2',
        first_name: 'Jane',
        last_name: 'Doe',
        full_name: 'Jane Doe'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockRequests });

    const result = await userRelationshipsService.getSentRequests('user-1');

    expect(result).toEqual(mockRequests);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      ['user-1']
    );
  });
});

describe('userRelationshipsService.areFriends', () => {
  test('returns true when users are friends', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });

    const result = await userRelationshipsService.areFriends('user-1', 'user-2');

    expect(result).toBe(true);
  });

  test('returns false when users are not friends', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await userRelationshipsService.areFriends('user-1', 'user-2');

    expect(result).toBe(false);
  });

  test('checks accepted status only', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await userRelationshipsService.areFriends('user-1', 'user-2');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'accepted'"),
      expect.anything()
    );
  });
});

describe('userRelationshipsService.getRelationshipStatus', () => {
  test('returns relationship status', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        status: 'accepted',
        sender_id: 'user-1',
        relationship_id: 1
      }]
    });

    const result = await userRelationshipsService.getRelationshipStatus('user-1', 'user-2');

    expect(result.status).toBe('accepted');
    expect(result.isSender).toBe(true);
  });

  test('returns none status when no relationship', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await userRelationshipsService.getRelationshipStatus('user-1', 'user-2');

    expect(result.status).toBe('none');
  });

  test('determines isSender correctly', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        status: 'pending',
        sender_id: 'user-2',
        relationship_id: 1
      }]
    });

    const result = await userRelationshipsService.getRelationshipStatus('user-1', 'user-2');

    expect(result.isSender).toBe(false);
  });
});

describe('userRelationshipsService.cancelFriendRequest', () => {
  test('cancels sent friend request', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const result = await userRelationshipsService.cancelFriendRequest('user-1', 1);

    expect(result.success).toBe(true);
  });

  test('throws error when request not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      userRelationshipsService.cancelFriendRequest('user-1', 999)
    ).rejects.toThrow('Friend request not found');
  });

  test('only cancels own pending requests', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await userRelationshipsService.cancelFriendRequest('user-1', 1);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('sender_id = $2'),
      [1, 'user-1']
    );
  });
});
