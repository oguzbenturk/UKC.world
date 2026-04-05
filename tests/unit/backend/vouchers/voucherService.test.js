import { jest, describe, test, expect, beforeAll } from '@jest/globals';

let voucherService;
let mockPool;
let mockLogger;

beforeAll(async () => {
  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: mockPool,
  }));

  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger,
  }));

  await jest.unstable_mockModule('../../../../backend/services/walletService.js', () => ({
    recordTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/voucherService.js');
    voucherService = mod;
  });
});

describe('voucherService', () => {
  describe('getVoucherByCode', () => {
    test('should retrieve voucher by code case-insensitive', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'SUMMER20',
        discount_value: 20,
        voucher_type: 'percentage',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockVoucher] });

      const result = await voucherService.getVoucherByCode('summer20');

      expect(result).toEqual(mockVoucher);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPPER(code) = UPPER($1)'),
        ['summer20']
      );
    });

    test('should return null when voucher not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await voucherService.getVoucherByCode('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('getVoucherById', () => {
    test('should retrieve voucher by UUID', async () => {
      const mockVoucher = { id: 'v1', code: 'CODE1', voucher_type: 'fixed_amount' };

      mockPool.query.mockResolvedValueOnce({ rows: [mockVoucher] });

      const result = await voucherService.getVoucherById('v1');

      expect(result).toEqual(mockVoucher);
    });

    test('should return null when voucher ID not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await voucherService.getVoucherById('invalid-id');

      expect(result).toBeNull();
    });
  });

  describe('resolveVoucherLookupCode', () => {
    test('should return code string when given non-UUID input', async () => {
      const result = await voucherService.resolveVoucherLookupCode('PROMO123');

      expect(result).toBe('PROMO123');
    });

    test('should lookup voucher when given valid UUID', async () => {
      const mockVoucher = { code: 'LOOKUP123' };
      mockPool.query.mockResolvedValueOnce({ rows: [mockVoucher] });

      const uuidInput = '12345678-1234-5678-abcd-123456789012';
      const result = await voucherService.resolveVoucherLookupCode(uuidInput);

      expect(result).toBe('LOOKUP123');
    });

    test('should return null for empty input', async () => {
      const result = await voucherService.resolveVoucherLookupCode('');

      expect(result).toBeNull();
    });
  });

  describe('getUserRedemptionCount', () => {
    test('should return count of voucher redemptions by user', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const result = await voucherService.getUserRedemptionCount('voucher-1', 'user-1');

      expect(result).toBe(3);
    });

    test('should return 0 when user has not redeemed voucher', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await voucherService.getUserRedemptionCount('voucher-1', 'user-1');

      expect(result).toBe(0);
    });
  });

  describe('isFirstTimePurchaser', () => {
    test('should return true when user has no prior purchases', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await voucherService.isFirstTimePurchaser('user-1');

      expect(result).toBe(true);
    });

    test('should return false when user has bookings', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'b1' }] });

      const result = await voucherService.isFirstTimePurchaser('user-1');

      expect(result).toBe(false);
    });

    test('should return false when user has packages', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }] });

      const result = await voucherService.isFirstTimePurchaser('user-1');

      expect(result).toBe(false);
    });

    test('should return false when user has rentals', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'r1' }] });

      const result = await voucherService.isFirstTimePurchaser('user-1');

      expect(result).toBe(false);
    });
  });

  describe('isUserAssignedVoucher', () => {
    test('should return true for public vouchers', async () => {
      const publicVoucher = { id: 'v1', visibility: 'public' };
      mockPool.query.mockResolvedValueOnce({ rows: [publicVoucher] });

      const result = await voucherService.isUserAssignedVoucher('v1', 'user-1');

      expect(result).toBe(true);
    });

    test('should return true if user in allowed_user_ids', async () => {
      const privateVoucher = {
        id: 'v1',
        visibility: 'private',
        allowed_user_ids: ['user-1', 'user-2'],
      };
      mockPool.query.mockResolvedValueOnce({ rows: [privateVoucher] });

      const result = await voucherService.isUserAssignedVoucher('v1', 'user-1');

      expect(result).toBe(true);
    });

    test('should return true if user in user_vouchers table', async () => {
      const privateVoucher = {
        id: 'v1',
        visibility: 'private',
        allowed_user_ids: null,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [privateVoucher] })
        .mockResolvedValueOnce({ rows: [{ id: 'uv1' }] });

      const result = await voucherService.isUserAssignedVoucher('v1', 'user-1');

      expect(result).toBe(true);
    });

    test('should return false if private voucher not assigned', async () => {
      const privateVoucher = {
        id: 'v1',
        visibility: 'private',
        allowed_user_ids: ['user-2'],
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [privateVoucher] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await voucherService.isUserAssignedVoucher('v1', 'user-1');

      expect(result).toBe(false);
    });
  });

  describe('isRoleAllowed', () => {
    test('should allow all roles for non-role-based vouchers', () => {
      const voucher = { visibility: 'public' };

      const result = voucherService.isRoleAllowed(voucher, 'instructor');

      expect(result).toBe(true);
    });

    test('should check role list for role_based vouchers', () => {
      const voucher = {
        visibility: 'role_based',
        allowed_roles: ['student', 'instructor'],
      };

      expect(voucherService.isRoleAllowed(voucher, 'student')).toBe(true);
      expect(voucherService.isRoleAllowed(voucher, 'admin')).toBe(false);
    });

    test('should allow all roles when allowed_roles is empty', () => {
      const voucher = {
        visibility: 'role_based',
        allowed_roles: [],
      };

      expect(voucherService.isRoleAllowed(voucher, 'any_role')).toBe(true);
    });
  });

  describe('validateVoucher', () => {
    test('should return valid=false for nonexistent code', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await voucherService.validateVoucher({
        code: 'FAKE',
        userId: 'user-1',
        userRole: 'student',
        context: 'lessons',
        amount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_CODE');
    });

    test('should return valid=false for inactive voucher', async () => {
      const inactiveVoucher = {
        id: 'v1',
        code: 'INACTIVE',
        is_active: false,
        voucher_type: 'percentage',
        discount_value: 20,
        visibility: 'public',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [inactiveVoucher] });

      const result = await voucherService.validateVoucher({
        code: 'INACTIVE',
        userId: 'user-1',
        userRole: 'student',
        context: 'lessons',
        amount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INACTIVE');
    });

    test('should return valid=false for expired voucher', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const expiredVoucher = {
        id: 'v1',
        code: 'EXPIRED',
        is_active: true,
        valid_from: null,
        valid_until: pastDate,
        voucher_type: 'percentage',
        discount_value: 20,
        visibility: 'public',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [expiredVoucher] });

      const result = await voucherService.validateVoucher({
        code: 'EXPIRED',
        userId: 'user-1',
        userRole: 'student',
        context: 'lessons',
        amount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('EXPIRED');
    });

    test('should return valid=false when min purchase amount not met', async () => {
      const voucher = {
        id: 'v1',
        code: 'MINPURCH',
        is_active: true,
        valid_from: null,
        valid_until: null,
        voucher_type: 'percentage',
        discount_value: 20,
        min_purchase_amount: 50,
        max_total_uses: null,
        usage_type: 'single_per_user',
        visibility: 'public',
        currency: 'EUR',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [voucher] });

      const result = await voucherService.validateVoucher({
        code: 'MINPURCH',
        userId: 'user-1',
        userRole: 'student',
        context: 'lessons',
        amount: 30,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('MINIMUM_NOT_MET');
    });

    test('should validate successfully for valid voucher', async () => {
      const voucher = {
        id: 'v1',
        code: 'VALID20',
        is_active: true,
        valid_from: null,
        valid_until: null,
        voucher_type: 'percentage',
        discount_value: 20,
        min_purchase_amount: null,
        max_total_uses: null,
        usage_type: 'single_per_user',
        visibility: 'public',
        applies_to: 'all',
        currency: 'EUR',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [voucher] });

      const result = await voucherService.validateVoucher({
        code: 'VALID20',
        userId: 'user-1',
        userRole: 'student',
        context: 'lessons',
        amount: 100,
      });

      expect(result.valid).toBe(true);
      expect(result.voucher.code).toBe('VALID20');
      expect(result.discount).toBeDefined();
    });

    test('should return valid=false for first-purchase-only voucher used by non-first-timer', async () => {
      const voucher = {
        id: 'v1',
        code: 'FIRSTBUY',
        is_active: true,
        valid_from: null,
        valid_until: null,
        voucher_type: 'percentage',
        discount_value: 20,
        min_purchase_amount: null,
        max_total_uses: null,
        usage_type: 'single_per_user',
        visibility: 'public',
        requires_first_purchase: true,
        applies_to: 'all',
        currency: 'EUR',
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [voucher] })
        .mockResolvedValueOnce({ rows: [{ id: 'b1' }] });

      const result = await voucherService.validateVoucher({
        code: 'FIRSTBUY',
        userId: 'user-1',
        userRole: 'student',
        context: 'lessons',
        amount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('NOT_FIRST_PURCHASE');
    });
  });

  describe('calculateDiscount', () => {
    test('should calculate percentage discount correctly', () => {
      const voucher = {
        voucher_type: 'percentage',
        discount_value: 25,
      };

      const result = voucherService.calculateDiscount(voucher, 100, 'EUR');

      expect(result.type).toBe('percentage');
      expect(result.discountAmount).toBe(25);
      expect(result.finalAmount).toBe(75);
    });

    test('should apply max discount cap for percentage', () => {
      const voucher = {
        voucher_type: 'percentage',
        discount_value: 50,
        max_discount: 20,
      };

      const result = voucherService.calculateDiscount(voucher, 100, 'EUR');

      expect(result.discountAmount).toBe(20);
      expect(result.finalAmount).toBe(80);
    });

    test('should calculate fixed amount discount correctly', () => {
      const voucher = {
        voucher_type: 'fixed_amount',
        discount_value: 15,
        currency: 'EUR',
      };

      const result = voucherService.calculateDiscount(voucher, 100, 'EUR');

      expect(result.discountAmount).toBe(15);
      expect(result.finalAmount).toBe(85);
    });

    test('should not exceed purchase amount for fixed discount', () => {
      const voucher = {
        voucher_type: 'fixed_amount',
        discount_value: 150,
      };

      const result = voucherService.calculateDiscount(voucher, 100, 'EUR');

      expect(result.discountAmount).toBe(100);
      expect(result.finalAmount).toBe(0);
    });

    test('should handle wallet credit type', () => {
      const voucher = {
        voucher_type: 'wallet_credit',
        discount_value: 50,
        currency: 'EUR',
      };

      const result = voucherService.calculateDiscount(voucher, 100, 'EUR');

      expect(result.walletCredit).toBe(50);
      expect(result.finalAmount).toBe(100);
    });

    test('should handle free service type', () => {
      const voucher = {
        voucher_type: 'free_service',
        applies_to_ids: ['service-1', 'service-2'],
        description: 'Free lesson',
      };

      const result = voucherService.calculateDiscount(voucher, 100, 'EUR');

      expect(result.freeService).toBeDefined();
      expect(result.freeService.serviceIds).toContain('service-1');
    });

    test('should handle package upgrade type', () => {
      const metadata = { upgradeLevel: 'premium', bonus: 5 };
      const voucher = {
        voucher_type: 'package_upgrade',
        metadata,
      };

      const result = voucherService.calculateDiscount(voucher, 100, 'EUR');

      expect(result.packageUpgrade).toEqual(metadata);
    });
  });

  describe('redeemVoucher', () => {
    test('should create redemption record and increment total_uses', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'r1', voucher_code_id: 'v1', status: 'applied' }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await voucherService.redeemVoucher({
        voucherId: 'v1',
        userId: 'user-1',
        referenceType: 'booking',
        referenceId: 'b1',
        originalAmount: 100,
        discountAmount: 25,
        currency: 'EUR',
      });

      expect(result.id).toBe('r1');
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    test('should calculate finalAmount correctly when not provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'r1', final_amount: 75 }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await voucherService.redeemVoucher({
        voucherId: 'v1',
        userId: 'user-1',
        referenceType: 'booking',
        referenceId: 'b1',
        originalAmount: 100,
        discountAmount: 25,
      });

      const call = mockPool.query.mock.calls[0];
      expect(call[1]).toContain(75);
    });

    test('should handle error in redemption', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        voucherService.redeemVoucher({
          voucherId: 'v1',
          userId: 'user-1',
          referenceType: 'booking',
          referenceId: 'b1',
          originalAmount: 100,
          discountAmount: 25,
        })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createVoucher', () => {
    test('should create new voucher successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'v1', code: 'NEWCODE', voucher_type: 'percentage' }],
        });

      const result = await voucherService.createVoucher(
        {
          code: 'NEWCODE',
          name: 'New Voucher',
          description: 'Test voucher',
          voucher_type: 'percentage',
          discount_value: 20,
        },
        'admin-1'
      );

      expect(result.code).toBe('NEWCODE');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should reject duplicate voucher code', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'v1', code: 'EXISTING' }],
      });

      await expect(
        voucherService.createVoucher(
          {
            code: 'EXISTING',
            name: 'Duplicate',
            voucher_type: 'percentage',
            discount_value: 20,
          },
          'admin-1'
        )
      ).rejects.toThrow('already exists');
    });

    test('should uppercase voucher code', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ code: 'UPPERCASE', id: 'v1' }],
        });

      await voucherService.createVoucher(
        {
          code: 'lowercase',
          name: 'Test',
          voucher_type: 'percentage',
          discount_value: 20,
        },
        'admin-1'
      );

      const insertCall = mockPool.query.mock.calls[1];
      expect(insertCall[1][0]).toBe('LOWERCASE');
    });
  });

  describe('updateVoucher', () => {
    test('should update allowed fields only', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'v1', is_active: false }],
      });

      await voucherService.updateVoucher('v1', {
        is_active: false,
        name: 'Updated',
        code: 'HACK',
      });

      const call = mockPool.query.mock.calls[0];
      expect(call[0]).not.toContain('code');
      expect(call[0]).toContain('is_active');
      expect(call[0]).toContain('name');
    });
  });

  describe('deleteVoucher', () => {
    test('should soft-delete by setting is_active to false', async () => {
      mockPool.query.mockResolvedValueOnce({});

      await voucherService.deleteVoucher('v1');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = false'),
        ['v1']
      );
    });
  });

  describe('assignVoucherToUser', () => {
    test('should assign voucher to user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'uv1', voucher_code_id: 'v1', user_id: 'user-1' }],
      });

      const result = await voucherService.assignVoucherToUser('v1', 'user-1', 'admin');

      expect(result.id).toBe('uv1');
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('getUserVouchers', () => {
    test('should return only available vouchers when onlyAvailable is true', async () => {
      const mockVouchers = [
        { id: 'v1', code: 'CODE1', is_used: false },
        { id: 'v2', code: 'CODE2', is_used: false },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockVouchers });

      const result = await voucherService.getUserVouchers('user-1', true);

      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_used = false'),
        expect.any(Array)
      );
    });

    test('should return all vouchers when onlyAvailable is false', async () => {
      const mockVouchers = [
        { id: 'v1', code: 'CODE1', is_used: true },
        { id: 'v2', code: 'CODE2', is_used: false },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockVouchers });

      const result = await voucherService.getUserVouchers('user-1', false);

      expect(result).toHaveLength(2);
    });
  });
});
