import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * Customer Package Entitlement Tests
 * 
 * Tests the package entitlement logic:
 * - normalizePackageRow: correct field mapping and calculations
 * - forceDeleteCustomerPackage: refund vs no-refund (pay_later), cleanup
 * - Package usage tracking: hours consumed, remaining hours
 * - Pay Later: negative wallet balance, pending status, no refund on cancel
 */

const mockQuery = jest.fn();
const mockConnect = jest.fn();

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

await jest.unstable_mockModule('../db.js', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect
  }
}));

await jest.unstable_mockModule('../services/walletService.js', () => ({
  recordLegacyTransaction: jest.fn(async () => ({ id: 'txn-mock', amount: 100 })),
  recordTransaction: jest.fn(async () => ({ id: 'txn-mock-2' })),
  getWalletAccountSummary: jest.fn(async () => ({
    available: 500,
    totalSpent: 100,
    currency: 'EUR'
  }))
}));

await jest.unstable_mockModule('../middlewares/errorHandler.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const { forceDeleteCustomerPackage, fetchCustomerPackagesByIds } =
  await import('../services/customerPackageService.js');

const { recordLegacyTransaction, getWalletAccountSummary } =
  await import('../services/walletService.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

// ============================================
// 1. Package normalization (via fetchCustomerPackagesByIds)
// ============================================
describe('Package normalization via fetchCustomerPackagesByIds', () => {
  test('returns empty array for null client', async () => {
    const result = await fetchCustomerPackagesByIds(null, ['id-1']);
    expect(result).toEqual([]);
  });

  test('returns empty array for empty packageIds', async () => {
    const result = await fetchCustomerPackagesByIds(mockClient, []);
    expect(result).toEqual([]);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test('correctly normalizes DB rows with usage calculations', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        id: 'pkg-1',
        customer_id: 'user-1',
        service_package_id: 'sp-1',
        package_name: 'Surf 10h',
        lesson_service_name: 'Surfing',
        total_hours: '10',
        used_hours: '3',
        remaining_hours: '7',
        purchase_price: '200',
        currency: 'EUR',
        purchase_date: '2026-01-01',
        expiry_date: '2026-12-31',
        status: 'active',
        notes: null,
        last_used_date: '2026-02-15',
        created_at: '2026-01-01',
        updated_at: '2026-02-15'
      }]
    });

    const result = await fetchCustomerPackagesByIds(mockClient, ['pkg-1']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pkg-1');
    expect(result[0].customerId).toBe('user-1');
    expect(result[0].totalHours).toBe(10);
    expect(result[0].usedHours).toBe(3);
    expect(result[0].remainingHours).toBe(7);
    expect(result[0].purchasePrice).toBe(200);
    expect(result[0].pricePerHour).toBe(20); // 200/10
    expect(result[0].usageSummary.usedAmount).toBe(60);  // 3 * 20
    expect(result[0].usageSummary.remainingAmount).toBe(140); // 7 * 20
  });

  test('handles zero total hours without division error', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        id: 'pkg-2',
        total_hours: '0',
        used_hours: '0',
        remaining_hours: '0',
        purchase_price: '0'
      }]
    });

    const result = await fetchCustomerPackagesByIds(mockClient, ['pkg-2']);
    expect(result[0].pricePerHour).toBe(0);
    expect(result[0].usageSummary.usedAmount).toBe(0);
  });

  test('handles null/undefined numeric fields gracefully', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        id: 'pkg-3',
        total_hours: null,
        used_hours: undefined,
        remaining_hours: 'not-a-number',
        purchase_price: ''
      }]
    });

    const result = await fetchCustomerPackagesByIds(mockClient, ['pkg-3']);
    expect(result[0].totalHours).toBe(0);
    expect(result[0].usedHours).toBe(0);
    expect(result[0].remainingHours).toBe(0);
    expect(result[0].purchasePrice).toBe(0);
  });
});

// ============================================
// 3. forceDeleteCustomerPackage — paid package
// ============================================
describe('forceDeleteCustomerPackage — paid package', () => {
  const basePkg = {
    id: 'pkg-paid',
    customer_id: 'user-1',
    package_name: 'Surf 10h',
    total_hours: '10',
    used_hours: '4',
    remaining_hours: '6',
    purchase_price: '200',
    currency: 'EUR',
    status: 'active'
  };

  test('issues partial refund for remaining hours', async () => {
    // Package found
    mockClient.query
      .mockResolvedValueOnce({ rows: [basePkg] })        // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 'txn-1' }] }) // payment check → was paid
      .mockResolvedValueOnce({ rows: [] })                 // participant cleanup
      .mockResolvedValueOnce({ rows: [] })                 // booking cleanup
      .mockResolvedValueOnce({ rows: [basePkg] });         // DELETE RETURNING

    const result = await forceDeleteCustomerPackage({
      client: mockClient,
      packageId: 'pkg-paid',
      actorId: 'admin-1',
      issueRefund: true,
      includeWalletSummary: false
    });

    expect(result.package).toBeDefined();
    expect(result.refundDetails).toBeDefined();
    // recordLegacyTransaction should be called with partial refund
    expect(recordLegacyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'package_refund',
        direction: 'credit'
      })
    );
  });

  test('throws 404 when package not found', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await expect(
      forceDeleteCustomerPackage({
        client: mockClient,
        packageId: 'nonexistent',
        issueRefund: false
      })
    ).rejects.toThrow('Customer package not found');
  });

  test('throws 400 when expectedCustomerId does not match', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [basePkg] })        // SELECT
      .mockResolvedValueOnce({ rows: [] });               // payment check

    await expect(
      forceDeleteCustomerPackage({
        client: mockClient,
        packageId: 'pkg-paid',
        expectedCustomerId: 'wrong-user',
        issueRefund: false
      })
    ).rejects.toThrow('Package does not belong');
  });
});

// ============================================
// 4. forceDeleteCustomerPackage — pay_later (no refund)
// ============================================
describe('forceDeleteCustomerPackage — pay_later (no refund)', () => {
  const payLaterPkg = {
    id: 'pkg-paylater',
    customer_id: 'user-2',
    package_name: 'Kite 5h',
    total_hours: '5',
    used_hours: '0',
    remaining_hours: '5',
    purchase_price: '150',
    currency: 'EUR',
    status: 'active',
    notes: 'Purchased via Pay Later'
  };

  test('skips refund when no payment transaction exists', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [payLaterPkg] })     // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] })                 // payment check → NOT paid
      .mockResolvedValueOnce({ rows: [] })                 // participant cleanup
      .mockResolvedValueOnce({ rows: [] })                 // booking cleanup
      .mockResolvedValueOnce({ rows: [payLaterPkg] });     // DELETE RETURNING

    await forceDeleteCustomerPackage({
      client: mockClient,
      packageId: 'pkg-paylater',
      issueRefund: true // Request refund, but should be overridden
    });

    // recordLegacyTransaction should NOT be called (no refund for unpaid package)
    expect(recordLegacyTransaction).not.toHaveBeenCalled();
  });
});

// ============================================
// 5. Package usage summary calculations (via fetch)
// ============================================
describe('Package usage summary calculations', () => {
  test('fully used package has 0 remaining', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        id: 'pkg-full',
        total_hours: '10',
        used_hours: '10',
        remaining_hours: '0',
        purchase_price: '300'
      }]
    });

    const result = await fetchCustomerPackagesByIds(mockClient, ['pkg-full']);
    expect(result[0].usageSummary.remainingHours).toBe(0);
    expect(result[0].usageSummary.remainingAmount).toBe(0);
    expect(result[0].usageSummary.usedAmount).toBe(300);
  });

  test('unused package has full amount remaining', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        id: 'pkg-new',
        total_hours: '8',
        used_hours: '0',
        remaining_hours: '8',
        purchase_price: '240'
      }]
    });

    const result = await fetchCustomerPackagesByIds(mockClient, ['pkg-new']);
    expect(result[0].usageSummary.remainingAmount).toBe(240);
    expect(result[0].usageSummary.usedAmount).toBe(0);
  });
});
