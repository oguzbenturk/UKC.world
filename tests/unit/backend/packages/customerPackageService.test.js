import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import Decimal from 'decimal.js';

let customerPackageService;

// Hoisted so tests can assert on / reset them regardless of module registry.
const recordLegacyTransactionMock = jest.fn().mockResolvedValue({ id: 'txn-1' });
const recordTransactionMock = jest.fn().mockResolvedValue({ id: 'txn-2' });
const getWalletAccountSummaryMock = jest.fn().mockResolvedValue({ available: 100 });

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
  }));

  await jest.unstable_mockModule('../../../../backend/services/walletService.js', () => ({
    recordLegacyTransaction: recordLegacyTransactionMock,
    recordTransaction: recordTransactionMock,
    getWalletAccountSummary: getWalletAccountSummaryMock,
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/customerPackageService.js');
    customerPackageService = mod;
  });
});

describe('customerPackageService', () => {
  describe('fetchCustomerPackagesByIds', () => {
    test('should fetch packages by IDs', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              id: 'p1',
              customer_id: 'cust-1',
              total_hours: '10',
              used_hours: '3',
              remaining_hours: '7',
              purchase_price: '300',
              currency: 'EUR',
            },
          ],
        }),
      };

      const result = await customerPackageService.fetchCustomerPackagesByIds(mockClient, [
        'p1',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p1');
    });

    test('should return empty array when no packages found', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
      };

      const result = await customerPackageService.fetchCustomerPackagesByIds(mockClient, [
        'nonexistent',
      ]);

      expect(result).toEqual([]);
    });

    test('should return empty array when client is null', async () => {
      const result = await customerPackageService.fetchCustomerPackagesByIds(null, ['p1']);

      expect(result).toEqual([]);
    });

    test('should return empty array when packageIds is empty', async () => {
      const mockClient = { query: jest.fn() };

      const result = await customerPackageService.fetchCustomerPackagesByIds(mockClient, []);

      expect(result).toEqual([]);
    });
  });

  describe('forceDeleteCustomerPackage', () => {
    const packageRow = (overrides = {}) => ({
      id: 'p1',
      customer_id: 'cust-1',
      total_hours: '10',
      used_hours: '0',
      remaining_hours: '10',
      purchase_price: '300',
      currency: 'EUR',
      package_name: 'Monthly Package',
      ...overrides,
    });

    // SQL-aware client stub: answers by statement shape rather than call order,
    // so adding a step to the delete cascade cannot silently shift every mock.
    const createClient = ({ pkg = packageRow(), wasPaid = true, cancelledCharges = [] } = {}) => {
      const query = jest.fn(async (sql) => {
        const text = String(sql);
        if (/FROM customer_packages WHERE id = \$1 FOR UPDATE/.test(text)) {
          return { rows: pkg ? [pkg] : [] };
        }
        if (/transaction_type = 'package_purchase'/.test(text)) {
          return { rows: wasPaid ? [{ id: 'txn-purchase' }] : [] };
        }
        if (/UPDATE wallet_transactions/.test(text)) {
          return { rows: cancelledCharges, rowCount: cancelledCharges.length };
        }
        if (/DELETE FROM customer_packages/.test(text)) {
          return { rows: [pkg], rowCount: 1 };
        }
        if (/preferred_currency/.test(text)) {
          return { rows: [{ preferred_currency: 'EUR' }] };
        }
        return { rows: [], rowCount: 0 };
      });
      return { query };
    };

    const linkedChargeCancelCalls = (client) =>
      client.query.mock.calls.filter(
        ([sql]) => /UPDATE wallet_transactions/.test(String(sql)) && /status = 'cancelled'/.test(String(sql))
      );

    beforeEach(() => {
      recordLegacyTransactionMock.mockClear();
      recordTransactionMock.mockClear();
    });

    test('should delete package and issue partial refund for unused hours', async () => {
      const client = createClient({ pkg: packageRow({ used_hours: '3', remaining_hours: '7' }) });

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client,
        packageId: 'p1',
        actorId: 'admin-1',
        issueRefund: true,
        forceFullRefund: false,
      });

      expect(result.package.id).toBe('p1');
      expect(result.cleanup).toBeDefined();
      // 300 for 10h → 30/h; 3h used → 90 consumed → 210 back.
      expect(result.refundDetails.refundIssued).toBe(true);
      expect(result.refundDetails.refundAmount.toString()).toBe('210');
      expect(recordLegacyTransactionMock).toHaveBeenCalledTimes(1);
      expect(recordLegacyTransactionMock.mock.calls[0][0]).toMatchObject({
        transactionType: 'package_refund',
        amount: 210,
      });
    });

    test('should throw error when client is not provided', async () => {
      await expect(
        customerPackageService.forceDeleteCustomerPackage({
          client: null,
          packageId: 'p1',
        })
      ).rejects.toThrow('Database client is required');
    });

    test('should throw 404 when package not found', async () => {
      const client = createClient({ pkg: null });

      const error = await customerPackageService
        .forceDeleteCustomerPackage({
          client,
          packageId: 'nonexistent',
        })
        .catch((e) => e);

      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('not found');
    });

    test('should skip refund if package was never paid', async () => {
      const client = createClient({ wasPaid: false });

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client,
        packageId: 'p1',
        issueRefund: true,
      });

      expect(result.refundDetails.refundIssued).toBe(false);
      expect(recordLegacyTransactionMock).not.toHaveBeenCalled();
    });

    test('should issue full refund when forceFullRefund is true', async () => {
      const client = createClient({ pkg: packageRow({ used_hours: '5', remaining_hours: '5' }) });

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client,
        packageId: 'p1',
        issueRefund: true,
        forceFullRefund: true,
      });

      expect(result.refundDetails.refundAmount.toString()).toBe('300');
    });

    test('should check expectedCustomerId if provided', async () => {
      const client = createClient();

      const error = await customerPackageService
        .forceDeleteCustomerPackage({
          client,
          packageId: 'p1',
          expectedCustomerId: 'cust-2',
        })
        .catch((e) => e);

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('does not belong');
    });

    test('should calculate partial refund based on remaining hours', async () => {
      const client = createClient({
        pkg: packageRow({ used_hours: '7', remaining_hours: '3', purchase_price: '100' }),
      });

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client,
        packageId: 'p1',
        issueRefund: true,
      });

      expect(result.usageSummary.remainingAmount.toString()).toBe('30');
    });

    // Regression: 2026-09-06, Mercan KS23. A 6H package (500) was upgraded to
    // 10H (780), which wrote a -280 package_price_adjustment. Deleting the
    // purchase transaction from Finances cascaded into this function, which
    // deleted the package but left the -280 as a live debit on a package that
    // no longer existed (and Financial History hides package-orphaned rows).
    test('cascade mode cancels the package\'s remaining purchase and price-adjustment charges', async () => {
      const client = createClient({
        pkg: packageRow({ purchase_price: '780', package_name: 'Kite Beginner 10H' }),
        cancelledCharges: [
          { id: 'adj-1', transaction_type: 'package_price_adjustment', amount: '-280.0000', currency: 'EUR' },
        ],
      });

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client,
        packageId: 'p1',
        actorId: 'admin-1',
        issueRefund: false,
        expectedCustomerId: 'cust-1',
        includeWalletSummary: false,
        cancelLinkedCharges: true,
      });

      const cancels = linkedChargeCancelCalls(client);
      expect(cancels).toHaveLength(1);
      const [sql, params] = cancels[0];
      // Only this wallet, only this package, only still-completed charge rows.
      expect(sql).toMatch(/status = 'completed'/);
      expect(params[1]).toBe('cust-1');
      expect(params[2]).toBe('customer_package');
      expect(params[3]).toBe('p1');
      expect(params[4]).toEqual(expect.arrayContaining(['package_purchase', 'package_price_adjustment']));
      expect(JSON.parse(params[0])).toMatchObject({
        cancellationOrigin: 'customer_package_force_delete_linked_charge',
        cancelledBy: 'admin-1',
        cancelledWithPackageId: 'p1',
      });

      // Cancel-only: no reversal row, no refund — the parent operation owns the money.
      expect(recordLegacyTransactionMock).not.toHaveBeenCalled();
      expect(recordTransactionMock).not.toHaveBeenCalled();
      expect(result.refundDetails.refundIssued).toBe(false);

      // Reported back so the caller can recompute wallet_balances per currency.
      expect(result.cleanup.linkedChargesCancelled).toBe(1);
      expect(result.cleanup.linkedChargeCurrencies).toEqual(['EUR']);

      // The cancel runs before the package row is gone.
      const calls = client.query.mock.calls.map(([q]) => String(q));
      const cancelIdx = calls.findIndex((q) => /UPDATE wallet_transactions/.test(q));
      const deleteIdx = calls.findIndex((q) => /DELETE FROM customer_packages/.test(q));
      expect(cancelIdx).toBeGreaterThan(-1);
      expect(cancelIdx).toBeLessThan(deleteIdx);
    });

    test('cascade mode with nothing left to cancel reports zero', async () => {
      const client = createClient({ cancelledCharges: [] });

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client,
        packageId: 'p1',
        issueRefund: false,
        includeWalletSummary: false,
        cancelLinkedCharges: true,
      });

      expect(linkedChargeCancelCalls(client)).toHaveLength(1);
      expect(result.cleanup.linkedChargesCancelled).toBe(0);
      expect(result.cleanup.linkedChargeCurrencies).toEqual([]);
    });

    test('refund path leaves price-adjustment rows alone (refund is computed from the post-edit price)', async () => {
      const client = createClient({
        pkg: packageRow({ purchase_price: '780', package_name: 'Kite Beginner 10H' }),
      });

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client,
        packageId: 'p1',
        actorId: 'admin-1',
        issueRefund: true,
      });

      // The +780 refund nets against purchase (-500) + upgrade (-280); cancelling
      // the adjustment here would refund the upgrade twice.
      expect(linkedChargeCancelCalls(client)).toHaveLength(0);
      expect(result.cleanup.linkedChargesCancelled).toBe(0);
      expect(recordLegacyTransactionMock).toHaveBeenCalledTimes(1);
      expect(recordLegacyTransactionMock.mock.calls[0][0]).toMatchObject({
        transactionType: 'package_refund',
        amount: 780,
      });
    });
  });

  describe('mapWalletTransactionForResponse', () => {
    test('should map wallet transaction with all fields', () => {
      const mockTransaction = {
        id: 'txn-1',
        user_id: 'user-1',
        balance_id: 'bal-1',
        transaction_type: 'credit',
        status: 'completed',
        direction: 'in',
        currency: 'EUR',
        amount: 100,
        available_delta: 100,
        pending_delta: 0,
        non_withdrawable_delta: 0,
        balance_available_after: 500,
        balance_pending_after: 0,
        balance_non_withdrawable_after: 0,
        description: 'Test transaction',
        related_entity_type: 'booking',
        related_entity_id: 'b1',
        created_by: 'admin-1',
        transaction_date: new Date(),
        created_at: new Date(),
        metadata: { test: true },
      };

      const result =
        customerPackageService.mapWalletTransactionForResponse(mockTransaction);

      expect(result.id).toBe('txn-1');
      expect(result.amount).toBe(100);
      expect(result.currency).toBe('EUR');
      expect(result.description).toBe('Test transaction');
    });

    test('should return null for null transaction', () => {
      const result = customerPackageService.mapWalletTransactionForResponse(null);

      expect(result).toBeNull();
    });

    test('should handle undefined numeric fields', () => {
      const mockTransaction = {
        id: 'txn-1',
        user_id: 'user-1',
        amount: null,
        available_delta: undefined,
      };

      const result =
        customerPackageService.mapWalletTransactionForResponse(mockTransaction);

      expect(result.amount).toBeNull();
      expect(result.available_delta).toBeNull();
    });
  });
});
