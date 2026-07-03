import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

let pool;
let getAllManagersWithCommissionSettings;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: { query: jest.fn() },
  }));

  const dbModule = await import('../../../backend/db.js');
  pool = dbModule.pool;

  const serviceModule = await import('../../../backend/services/managerCommissionService.js');
  getAllManagersWithCommissionSettings = serviceModule.getAllManagersWithCommissionSettings;
});

describe('ManagerCommissionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllManagersWithCommissionSettings', () => {
    const baseRow = {
      id: 'mgr-1',
      name: 'Manager One',
      email: 'mgr@example.com',
      profile_image_url: null,
      settings_id: null,
    };

    test('paid excludes deductions; pending subtracts both (matches summary math)', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          ...baseRow,
          total_commission: '3071.40',
          total_paid: '2481.00',
          total_deducted: '1084.00',
        }],
      });

      const [mgr] = await getAllManagersWithCommissionSettings();

      expect(mgr.totalEarnedCommission).toBe(3071.4);
      expect(mgr.paidCommission).toBe(2481);
      expect(mgr.deductedCommission).toBe(1084);
      // 3071.40 - 2481 - 1084 = -493.60 → clamped at 0
      expect(mgr.pendingCommission).toBe(0);
    });

    test('pending is earned minus payments and deductions when under-settled', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          ...baseRow,
          total_commission: '1000',
          total_paid: '300',
          total_deducted: '200',
        }],
      });

      const [mgr] = await getAllManagersWithCommissionSettings();

      expect(mgr.pendingCommission).toBe(500);
      expect(mgr.paidCommission).toBe(300);
      expect(mgr.totalEarnedCommission).toBe(1000);
    });

    test('splits payments and deductions by sign in SQL', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await getAllManagersWithCommissionSettings();

      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('CASE WHEN amount > 0 THEN amount ELSE 0 END');
      expect(sql).toContain('CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END');
      expect(sql).not.toContain('SUM(ABS(amount))');
    });
  });
});
