import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

let roleUpgradeService;
let mockPool;
let mockLogger;

beforeAll(async () => {
  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
  };

  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: mockPool,
  }));

  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger,
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/roleUpgradeService.js');
    roleUpgradeService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('roleUpgradeService', () => {
  describe('isOutsiderRole', () => {
    test('should return true when user is outsider', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ role_name: 'outsider' }],
      });

      const result = await roleUpgradeService.isOutsiderRole('user-1');

      expect(result).toBe(true);
    });

    test('should return false when user is not outsider', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ role_name: 'student' }],
      });

      const result = await roleUpgradeService.isOutsiderRole('user-1');

      expect(result).toBe(false);
    });

    test('should handle case-insensitive role names', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ role_name: 'OUTSIDER' }],
      });

      const result = await roleUpgradeService.isOutsiderRole('user-1');

      expect(result).toBe(true);
    });

    test('should return false when user not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await roleUpgradeService.isOutsiderRole('nonexistent');

      expect(result).toBe(false);
    });

    test('should handle DB errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await roleUpgradeService.isOutsiderRole('user-1');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('upgradeOutsiderToStudent', () => {
    test('should upgrade outsider user to student', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              role_id: 'role-outsider',
              current_role: 'outsider',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'role-student' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await roleUpgradeService.upgradeOutsiderToStudent('user-1');

      expect(result.success).toBe(true);
      expect(result.newRole).toBe('student');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should return success if user is already student', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            role_id: 'role-student',
            current_role: 'student',
          },
        ],
      });

      const result = await roleUpgradeService.upgradeOutsiderToStudent('user-1');

      expect(result.success).toBe(true);
      expect(result.newRole).toBe('student');
    });

    test('should return success if user is instructor', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            role_id: 'role-instructor',
            current_role: 'instructor',
          },
        ],
      });

      const result = await roleUpgradeService.upgradeOutsiderToStudent('user-1');

      expect(result.success).toBe(true);
      expect(result.newRole).toBe('instructor');
    });

    test('should fail if user not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await roleUpgradeService.upgradeOutsiderToStudent(
        'nonexistent'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    test('should fail if student role not configured', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              role_id: 'role-outsider',
              current_role: 'outsider',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await roleUpgradeService.upgradeOutsiderToStudent('user-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Student role not configured');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle DB errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection error'));

      const result = await roleUpgradeService.upgradeOutsiderToStudent('user-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to upgrade');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should support custom database client', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'user-1',
                role_id: 'role-outsider',
                current_role: 'outsider',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [{ id: 'role-student' }],
          })
          .mockResolvedValueOnce({ rows: [] }),
      };

      const result = await roleUpgradeService.upgradeOutsiderToStudent('user-1', {
        client: mockClient,
      });

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    test('should update user.updated_at timestamp', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              role_id: 'role-outsider',
              current_role: 'outsider',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'role-student' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await roleUpgradeService.upgradeOutsiderToStudent('user-1');

      const updateCall = mockPool.query.mock.calls[2];
      expect(updateCall[0]).toContain('updated_at = NOW()');
    });
  });

  describe('checkAndUpgradeAfterBooking', () => {
    test('should upgrade outsider user after first booking', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ role_name: 'outsider' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              role_id: 'role-outsider',
              current_role: 'outsider',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'role-student' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await roleUpgradeService.checkAndUpgradeAfterBooking(
        'user-1'
      );

      expect(result.upgraded).toBe(true);
      expect(result.newRole).toBe('student');
    });

    test('should not upgrade non-outsider user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ role_name: 'student' }],
      });

      const result = await roleUpgradeService.checkAndUpgradeAfterBooking(
        'user-1'
      );

      expect(result.upgraded).toBe(false);
      expect(result.newRole).toBeUndefined();
    });

    test('should return upgraded=false on error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await roleUpgradeService.checkAndUpgradeAfterBooking(
        'user-1'
      );

      expect(result.upgraded).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should support custom database client', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [{ role_name: 'outsider' }],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'user-1',
                role_id: 'role-outsider',
                current_role: 'outsider',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [{ id: 'role-student' }],
          })
          .mockResolvedValueOnce({ rows: [] }),
      };

      const result = await roleUpgradeService.checkAndUpgradeAfterBooking(
        'user-1',
        { client: mockClient }
      );

      expect(result.upgraded).toBe(true);
      expect(mockClient.query).toHaveBeenCalled();
    });

    test('should handle upgrade failure gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ role_name: 'outsider' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              role_id: 'role-outsider',
              current_role: 'outsider',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await roleUpgradeService.checkAndUpgradeAfterBooking(
        'user-1'
      );

      expect(result.upgraded).toBe(false);
    });
  });

  describe('default export', () => {
    test('should export all functions', () => {
      const exported = roleUpgradeService.default;

      expect(exported.isOutsiderRole).toBeDefined();
      expect(exported.upgradeOutsiderToStudent).toBeDefined();
      expect(exported.checkAndUpgradeAfterBooking).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    test('should handle upgrade flow: new user books lesson', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ role_name: 'outsider' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              role_id: 'role-outsider',
              current_role: 'outsider',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'role-student' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await roleUpgradeService.checkAndUpgradeAfterBooking(
        'user-1'
      );

      expect(result.upgraded).toBe(true);
      expect(result.newRole).toBe('student');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('upgraded')
      );
    });

    test('should not upgrade if user already booked', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ role_name: 'student' }],
      });

      const result = await roleUpgradeService.checkAndUpgradeAfterBooking(
        'user-1'
      );

      expect(result.upgraded).toBe(false);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });
});
