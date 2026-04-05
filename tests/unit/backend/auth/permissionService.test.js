import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

let permissionService;
let mockPool;

beforeAll(async () => {
  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: mockPool,
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/permissionService.js');
    permissionService = mod.default;
  });
});

afterEach(() => {
  permissionService.clearAllCache();
  jest.clearAllMocks();
});

describe('PermissionService', () => {
  describe('hasPermission', () => {
    test('should grant permission when user has role permission', async () => {
      const mockUser = {
        role_name: 'instructor',
        permissions: {
          'bookings:read': true,
          'bookings:write': false,
        },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await permissionService.hasPermission(
        'user-1',
        'bookings:read'
      );

      expect(result).toBe(true);
    });

    test('should deny permission when user lacks role permission', async () => {
      const mockUser = {
        role_name: 'student',
        permissions: {
          'bookings:read': true,
        },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await permissionService.hasPermission(
        'user-1',
        'bookings:write'
      );

      expect(result).toBe(false);
    });

    test('should deny permission for locked account', async () => {
      const mockUser = {
        role_name: 'admin',
        permissions: { '*': true },
        two_factor_enabled: false,
        account_locked: true,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await permissionService.hasPermission(
        'user-1',
        'system:admin'
      );

      expect(result).toBe(false);
    });

    test('should deny permission for expired account', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const mockUser = {
        role_name: 'admin',
        permissions: { '*': true },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: pastDate,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await permissionService.hasPermission(
        'user-1',
        'system:admin'
      );

      expect(result).toBe(false);
    });

    test('should deny permission for non-existent user', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await permissionService.hasPermission(
        'nonexistent',
        'bookings:read'
      );

      expect(result).toBe(false);
    });

    test('should grant permission for wildcard role permission', async () => {
      const mockUser = {
        role_name: 'admin',
        permissions: { '*': true },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await permissionService.hasPermission(
        'user-1',
        'any:permission'
      );

      expect(result).toBe(true);
    });

    test('should grant permission for scope wildcard', async () => {
      const mockUser = {
        role_name: 'manager',
        permissions: { 'bookings:*': true },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await permissionService.hasPermission(
        'user-1',
        'bookings:read'
      );

      expect(result).toBe(true);
    });

    test('should cache permission result', async () => {
      const mockUser = {
        role_name: 'student',
        permissions: { 'bookings:read': true },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      await permissionService.hasPermission('user-1', 'bookings:read');
      await permissionService.hasPermission('user-1', 'bookings:read');

      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    test('should handle DB errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection error'));

      const result = await permissionService.hasPermission(
        'user-1',
        'bookings:read'
      );

      expect(result).toBe(false);
    });
  });

  describe('checkRolePermission', () => {
    test('should check wildcard permission', () => {
      const permissions = { '*': true };

      const result = permissionService.checkRolePermission(
        permissions,
        'read',
        'bookings'
      );

      expect(result).toBe(true);
    });

    test('should check scope wildcard permission', () => {
      const permissions = { 'bookings:*': true };

      const result = permissionService.checkRolePermission(
        permissions,
        'read',
        'bookings'
      );

      expect(result).toBe(true);
    });

    test('should check specific permission', () => {
      const permissions = { 'bookings:read': true };

      const result = permissionService.checkRolePermission(
        permissions,
        'read',
        'bookings'
      );

      expect(result).toBe(true);
    });

    test('should deny missing permission', () => {
      const permissions = { 'bookings:write': true };

      const result = permissionService.checkRolePermission(
        permissions,
        'read',
        'bookings'
      );

      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    test('should return user permissions with role info', async () => {
      const mockUserPerms = {
        role_name: 'instructor',
        permissions: { 'bookings:read': true },
        role_description: 'Lesson instructors',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUserPerms] });

      const result = await permissionService.getUserPermissions('user-1');

      expect(result.role_name).toBe('instructor');
      expect(result.permissions).toEqual({ 'bookings:read': true });
    });

    test('should return null for non-existent user', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await permissionService.getUserPermissions('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('clearUserCache', () => {
    test('should clear cache for specific user', async () => {
      const mockUser = {
        role_name: 'student',
        permissions: { 'bookings:read': true },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValue({ rows: [mockUser] });

      await permissionService.hasPermission('user-1', 'bookings:read');

      permissionService.clearUserCache('user-1');

      await permissionService.hasPermission('user-1', 'bookings:read');

      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearAllCache', () => {
    test('should clear all cached permissions', async () => {
      const mockUser = {
        role_name: 'student',
        permissions: { 'bookings:read': true },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValue({ rows: [mockUser] });

      await permissionService.hasPermission('user-1', 'bookings:read');
      await permissionService.hasPermission('user-2', 'bookings:write');

      permissionService.clearAllCache();

      await permissionService.hasPermission('user-1', 'bookings:read');
      await permissionService.hasPermission('user-2', 'bookings:write');

      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });
  });

  describe('requirePermission middleware', () => {
    test('should deny request without auth', async () => {
      const middleware = permissionService.requirePermission('bookings:read');

      const req = { user: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should deny request without sufficient permissions', async () => {
      const mockUser = {
        role_name: 'student',
        permissions: { 'bookings:read': true },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const middleware = permissionService.requirePermission('bookings:write');

      const req = {
        user: { id: 'user-1' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('should allow request with sufficient permissions', async () => {
      const mockUser = {
        role_name: 'instructor',
        permissions: { 'bookings:read': true },
        two_factor_enabled: false,
        account_locked: false,
        account_expired_at: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const middleware = permissionService.requirePermission('bookings:read');

      const req = {
        user: { id: 'user-1' },
      };
      const res = {
        status: jest.fn(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requires2FA', () => {
    test('should not require 2FA for non-sensitive operations', async () => {
      const result = await permissionService.requires2FA('user-1', 'bookings:read');

      expect(result).toBe(false);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    test('should require 2FA for sensitive operations when enabled', async () => {
      const mockUser = {
        two_factor_enabled: true,
        role_id: 'admin',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await permissionService.requires2FA(
        'user-1',
        'finances:write'
      );

      expect(result).toBe(true);
    });

    test('should not require 2FA when disabled', async () => {
      const mockUser = {
        two_factor_enabled: false,
        role_id: 'admin',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await permissionService.requires2FA(
        'user-1',
        'users:delete'
      );

      expect(result).toBe(false);
    });

    test('should fail safe by requiring 2FA on error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await permissionService.requires2FA(
        'user-1',
        'system:admin'
      );

      expect(result).toBe(true);
    });

    test('should require 2FA if user not found (fail safe)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await permissionService.requires2FA(
        'nonexistent',
        'finances:write'
      );

      expect(result).toBe(true);
    });
  });
});
