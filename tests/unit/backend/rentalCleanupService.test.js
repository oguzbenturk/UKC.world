import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';
import { stubExports } from '../../helpers/esmMockExports.js';

const WALLET_SERVICE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/services/walletService.js');

// Imported AFTER the mocks are registered (beforeAll). A static top-level import
// is evaluated before unstable_mockModule runs, so the service would bind the
// REAL walletService/db and the refund assertions could never observe the mock.
let rentalCleanupService;
let walletServiceMock;
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
      warn: jest.fn(),
      debug: jest.fn()
    }
  }));

  await jest.unstable_mockModule('../../../backend/services/walletService.js', () => stubExports(WALLET_SERVICE_PATH, {
    recordLegacyTransaction: jest.fn().mockResolvedValue({
      id: 1,
      amount: 100,
      transactionType: 'rental_refund'
    }),
    getWalletAccountSummary: jest.fn().mockResolvedValue({
      balance: 100,
      currency: 'EUR'
    })
  }));

  rentalCleanupService = await import('../../../backend/services/rentalCleanupService.js');
  walletServiceMock = await import('../../../backend/services/walletService.js');
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.connect.mockClear();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  walletServiceMock.recordLegacyTransaction.mockClear();
  walletServiceMock.getWalletAccountSummary.mockClear();
});

describe('rentalCleanupService.normalizeRentalRow', () => {
  test('normalizes rental row with all fields', () => {
    const row = {
      id: 1,
      user_id: 'customer-1',
      customer_name: 'John Doe',
      customer_email: 'john@example.com',
      start_date: '2026-04-01',
      end_date: '2026-04-05',
      status: 'active',
      payment_status: 'paid',
      total_price: '150.50',
      currency: 'EUR',
      notes: 'Weekend rental',
      created_at: '2026-03-31T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z',
      equipment_list: [
        { id: 1, name: 'Board', serviceType: 'equipment', dailyRate: '50' }
      ]
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);

    expect(normalized.id).toBe(1);
    expect(normalized.customerId).toBe('customer-1');
    expect(normalized.customerName).toBe('John Doe');
    expect(normalized.status).toBe('active');
    expect(normalized.totalPrice).toBe(150.50);
    expect(normalized.currency).toBe('EUR');
  });

  test('handles null row', () => {
    const result = rentalCleanupService.normalizeRentalRow(null);
    expect(result).toBeNull();
  });

  test('defaults currency to EUR', () => {
    const row = {
      id: 1,
      user_id: 'customer-1',
      total_price: '100',
      equipment_list: []
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);
    expect(normalized.currency).toBe('EUR');
  });

  test('converts string prices to numbers', () => {
    const row = {
      id: 1,
      total_price: '123.45',
      equipment_list: []
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);
    expect(normalized.totalPrice).toBe(123.45);
    expect(typeof normalized.totalPrice).toBe('number');
  });

  test('handles zero total price', () => {
    const row = {
      id: 1,
      total_price: '0',
      equipment_list: []
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);
    expect(normalized.totalPrice).toBe(0);
  });

  test('normalizes equipment list correctly', () => {
    const row = {
      id: 1,
      equipment_list: [
        { id: 1, name: 'Board', serviceType: 'equipment', dailyRate: '50' },
        { id: 2, name: 'Harness', serviceType: 'equipment', dailyRate: '25' }
      ]
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);
    expect(normalized.equipment).toHaveLength(2);
    expect(normalized.equipment[0].name).toBe('Board');
    expect(normalized.equipment[0].dailyRate).toBe(50);
  });

  test('creates equipment summary string', () => {
    const row = {
      id: 1,
      equipment_list: [
        { id: 1, name: 'Board' },
        { id: 2, name: 'Harness' }
      ]
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);
    expect(normalized.equipmentSummary).toBe('Board, Harness');
  });

  test('handles empty equipment list', () => {
    const row = {
      id: 1,
      equipment_list: []
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);
    expect(normalized.equipment).toEqual([]);
    expect(normalized.equipmentSummary).toBeNull();
  });

  test('uses rental_date as fallback for start_date', () => {
    const row = {
      id: 1,
      rental_date: '2026-04-01',
      equipment_list: []
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);
    expect(normalized.startDate).toBe('2026-04-01');
  });

  test('handles missing customer info gracefully', () => {
    const row = {
      id: 1,
      customer_name: null,
      customer_email: null,
      equipment_list: []
    };

    const normalized = rentalCleanupService.normalizeRentalRow(row);
    expect(normalized.customerName).toBeNull();
    expect(normalized.customerEmail).toBeNull();
  });
});

describe('rentalCleanupService.fetchRentalsByIds', () => {
  test('fetches rentals by ID array', async () => {
    const mockRentals = [
      {
        id: 1,
        user_id: 'customer-1',
        customer_name: 'John',
        equipment_list: []
      }
    ];

    mockClient.query.mockResolvedValueOnce({ rows: mockRentals });

    const result = await rentalCleanupService.fetchRentalsByIds(mockClient, [1, 2]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('returns empty array for no IDs', async () => {
    const result = await rentalCleanupService.fetchRentalsByIds(mockClient, []);
    expect(result).toEqual([]);
  });

  test('returns empty array for null client', async () => {
    const result = await rentalCleanupService.fetchRentalsByIds(null, [1, 2]);
    expect(result).toEqual([]);
  });

  test('returns empty array for non-array IDs', async () => {
    const result = await rentalCleanupService.fetchRentalsByIds(mockClient, 'not-an-array');
    expect(result).toEqual([]);
  });

  test('normalizes returned rental rows', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          user_id: 'customer-1',
          total_price: '100.50',
          equipment_list: [{ name: 'Board' }]
        }
      ]
    });

    const result = await rentalCleanupService.fetchRentalsByIds(mockClient, [1]);

    expect(result[0].totalPrice).toBe(100.50);
    expect(result[0].equipment).toBeDefined();
  });
});

describe('rentalCleanupService.forceDeleteRental', () => {
  // forceDeleteRental's query flow (since 2026-06-01 / 2026-08-13):
  //   SELECT rental FOR UPDATE → SELECT rental_equipment → DELETE rental_equipment
  //   → SUM(available_delta) wallet footprint (fc61e99: refund what the WALLET
  //     actually lost, not total_price) → UPDATE manager_commissions (63f4db3)
  //   → DELETE rentals RETURNING *.
  // Route mocks by SQL so the tests don't depend on exact call order.
  const routeRentalDeleteQueries = ({ rental, equipment = [], netDelta = 0, deleted = null }) => {
    mockClient.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM rentals WHERE id = $1 FOR UPDATE')) return { rows: rental ? [rental] : [] };
      if (text.includes('FROM rental_equipment re')) return { rows: equipment };
      if (text.includes('DELETE FROM rental_equipment')) return { rows: [], rowCount: equipment.length };
      if (text.includes('SUM(available_delta)')) return { rows: [{ net_delta: String(netDelta) }] };
      if (text.includes('UPDATE manager_commissions')) return { rows: [], rowCount: 0 };
      if (text.includes('DELETE FROM rentals')) return { rows: deleted ? [deleted] : [] };
      return { rows: [] };
    });
  };

  test('deletes rental and returns cleanup info', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' },
      equipment: [{ equipment_id: 1, name: 'Board' }],
      netDelta: -100,
      deleted: { id: 1, user_id: 'customer-1', total_price: '100', equipment_list: [{ name: 'Board' }] }
    });

    const result = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: true,
      includeWalletSummary: false
    });

    expect(result).toHaveProperty('rental');
    expect(result).toHaveProperty('cleanup');
    expect(result).toHaveProperty('refundDetails');
  });

  test('throws error when client not provided', async () => {
    await expect(
      rentalCleanupService.forceDeleteRental({ client: null, rentalId: 1 })
    ).rejects.toThrow('Database client is required');
  });

  test('throws 404 error when rental not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const error = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 999
    }).catch(e => e);

    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Rental not found');
  });

  test('throws 400 error when rental does not belong to customer', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 1, user_id: 'customer-1' }]
    });

    const error = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      expectedCustomerId: 'customer-2'
    }).catch(e => e);

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('does not belong');
  });

  test('issues refund when requested', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' },
      netDelta: -100, // wallet-funded: the wallet was debited the full 100
      deleted: { id: 1, user_id: 'customer-1', total_price: '100' }
    });

    await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: true,
      includeWalletSummary: false
    });

    expect(walletServiceMock.recordLegacyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'customer-1',
        amount: 100,
        transactionType: 'rental_refund',
        direction: 'credit'
      })
    );
  });

  test('does not refund a rental whose wallet was never net-debited (cash/card paid)', async () => {
    // Regression guard for fc61e99 (2026-08-12 phantom-credit case): a cash-paid
    // rental has zero wallet footprint, so deleting it must not credit total_price.
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '78', currency: 'EUR' },
      netDelta: 0,
      deleted: { id: 1, user_id: 'customer-1', total_price: '78' }
    });

    const result = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: true,
      includeWalletSummary: false
    });

    expect(walletServiceMock.recordLegacyTransaction).not.toHaveBeenCalled();
    expect(result.refundDetails.refundIssued).toBe(false);
    expect(result.refundDetails.refundAmount).toBe(0);
  });

  test('skips refund when issueRefund is false', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' },
      netDelta: -100,
      deleted: { id: 1, user_id: 'customer-1', total_price: '100' }
    });

    await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: false,
      includeWalletSummary: false
    });

    expect(walletServiceMock.recordLegacyTransaction).not.toHaveBeenCalled();
  });

  test('returns refund details in response', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '150.50', currency: 'EUR' },
      netDelta: -150.5,
      deleted: { id: 1, user_id: 'customer-1', total_price: '150.50' }
    });

    const result = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: true,
      includeWalletSummary: false
    });

    expect(result.refundDetails.originalAmount).toBe(150.50);
    expect(result.refundDetails.refundAmount).toBe(150.50);
    expect(result.refundDetails.refundIssued).toBe(true);
  });

  test('cancels the pending manager commission before deleting the rental', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' },
      deleted: { id: 1, user_id: 'customer-1', total_price: '100' }
    });

    await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: false,
      includeWalletSummary: false
    });

    const sqls = mockClient.query.mock.calls.map(([sql]) => String(sql));
    const commissionIdx = sqls.findIndex((s) => s.includes('UPDATE manager_commissions'));
    const deleteIdx = sqls.findIndex((s) => s.includes('DELETE FROM rentals'));
    expect(commissionIdx).toBeGreaterThan(-1);
    expect(commissionIdx).toBeLessThan(deleteIdx);
  });

  test('clears equipment references', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' },
      equipment: [
        { equipment_id: 1, name: 'Board' },
        { equipment_id: 2, name: 'Harness' }
      ],
      deleted: { id: 1, user_id: 'customer-1', total_price: '100' }
    });

    const result = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: false,
      includeWalletSummary: false
    });

    expect(result.cleanup.equipmentReferencesCleared).toBe(2);
  });

  test('includes wallet summary when requested', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' },
      deleted: { id: 1, user_id: 'customer-1', total_price: '100' }
    });

    const result = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: false,
      includeWalletSummary: true
    });

    expect(walletServiceMock.getWalletAccountSummary).toHaveBeenCalledWith('customer-1');
    expect(result.walletSummary).toBeDefined();
  });

  test('handles zero rental price', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '0', currency: 'EUR' },
      deleted: { id: 1, user_id: 'customer-1', total_price: '0' }
    });

    const result = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: true,
      includeWalletSummary: false
    });

    expect(result.refundDetails.refundAmount).toBe(0);
    expect(result.refundDetails.refundIssued).toBe(false);
  });

  test('handles negative rental price as absolute value', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '-100', currency: 'EUR' },
      deleted: { id: 1, user_id: 'customer-1', total_price: '-100' }
    });

    const result = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: true,
      includeWalletSummary: false
    });

    expect(result.refundDetails.originalAmount).toBe(100);
  });

  test('locks rental row for update', async () => {
    routeRentalDeleteQueries({
      rental: { id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' },
      deleted: { id: 1, user_id: 'customer-1', total_price: '100' }
    });

    await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: false,
      includeWalletSummary: false
    });

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      [1]
    );
  });
});
