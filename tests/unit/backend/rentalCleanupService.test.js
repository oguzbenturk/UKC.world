import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import * as rentalCleanupService from '../../../backend/services/rentalCleanupService.js';

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

  await jest.unstable_mockModule('../../../backend/services/walletService.js', () => ({
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
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.connect.mockClear();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
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
  test('deletes rental and returns cleanup info', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 'customer-1',
          total_price: '100',
          currency: 'EUR'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{ equipment_id: 1, name: 'Board' }]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 'customer-1',
          total_price: '100',
          equipment_list: [{ name: 'Board' }]
        }]
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
    const { recordLegacyTransaction } = await import('../../../backend/services/walletService.js');

    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100' }]
      });

    await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: true,
      includeWalletSummary: false
    });

    expect(recordLegacyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'customer-1',
        amount: 100,
        transactionType: 'rental_refund',
        direction: 'credit'
      })
    );
  });

  test('skips refund when issueRefund is false', async () => {
    const { recordLegacyTransaction } = await import('../../../backend/services/walletService.js');

    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100' }]
      });

    await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: false,
      includeWalletSummary: false
    });

    expect(recordLegacyTransaction).not.toHaveBeenCalled();
  });

  test('returns refund details in response', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '150.50', currency: 'EUR' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '150.50' }]
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

  test('clears equipment references', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' }]
      })
      .mockResolvedValueOnce({
        rows: [
          { equipment_id: 1, name: 'Board' },
          { equipment_id: 2, name: 'Harness' }
        ]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100' }]
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
    const { getWalletAccountSummary } = await import('../../../backend/services/walletService.js');

    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100' }]
      });

    const result = await rentalCleanupService.forceDeleteRental({
      client: mockClient,
      rentalId: 1,
      issueRefund: false,
      includeWalletSummary: true
    });

    expect(getWalletAccountSummary).toHaveBeenCalledWith('customer-1');
    expect(result.walletSummary).toBeDefined();
  });

  test('handles zero rental price', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '0', currency: 'EUR' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '0' }]
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
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '-100', currency: 'EUR' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '-100' }]
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
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100', currency: 'EUR' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'customer-1', total_price: '100' }]
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
