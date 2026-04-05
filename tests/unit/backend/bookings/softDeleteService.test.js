import { jest, describe, test, expect, beforeAll } from '@jest/globals';

let SoftDeleteService;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: {
      connect: jest.fn(),
    },
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/softDeleteService.js');
    SoftDeleteService = mod.default;
  });
});

describe('SoftDeleteService', () => {
  describe('softDeleteBooking', () => {
    test('should soft-delete booking with backup', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'b1',
              student_user_id: 'u1',
              instructor_user_id: 'u2',
              service_id: 's1',
              student_name: 'John',
              instructor_name: 'Jane',
              service_name: 'Lesson',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ backed_up_at: new Date().toISOString() }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const result = await SoftDeleteService.softDeleteBooking(
        'b1',
        'admin-1',
        'User requested',
        { custom: 'metadata' }
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('b1');
      expect(result.relatedRecords).toBe(0);
    });

    test('should handle booking not found', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const error = await SoftDeleteService.softDeleteBooking(
        'nonexistent',
        'admin-1'
      ).catch((e) => e);

      expect(error.message).toContain('not found');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should rollback on error', async () => {
      const mockClient = {
        query: jest.fn().mockRejectedValueOnce(new Error('DB error')),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const error = await SoftDeleteService.softDeleteBooking(
        'b1',
        'admin-1'
      ).catch((e) => e);

      expect(error).toBeDefined();
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should set status to deleted', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'b1',
              student_user_id: 'u1',
              instructor_user_id: 'u2',
              service_id: 's1',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ backed_up_at: new Date().toISOString() }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await SoftDeleteService.softDeleteBooking('b1', 'admin-1');

      const updateCall = mockClient.query.mock.calls.find((call) =>
        call[0].includes("status = 'deleted'")
      );
      expect(updateCall).toBeDefined();
    });

    test('should schedule hard delete 90 days from now', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'b1',
              student_user_id: 'u1',
              instructor_user_id: 'u2',
              service_id: 's1',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ backed_up_at: new Date().toISOString() }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const result = await SoftDeleteService.softDeleteBooking('b1', 'admin-1');

      expect(result.scheduledHardDeleteAt).toBeDefined();
      const daysToDelete = Math.floor(
        (result.scheduledHardDeleteAt - new Date()) / (1000 * 60 * 60 * 24)
      );
      expect(daysToDelete).toBeGreaterThan(88);
      expect(daysToDelete).toBeLessThanOrEqual(90);
    });
  });

  describe('restoreBooking', () => {
    test('should restore soft-deleted booking', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'b1',
              hard_deleted_at: null,
              original_data: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const result = await SoftDeleteService.restoreBooking(
        'b1',
        'admin-1',
        'Admin request'
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('b1');
    });

    test('should fail if backup not found', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const error = await SoftDeleteService.restoreBooking(
        'nonexistent',
        'admin-1'
      ).catch((e) => e);

      expect(error.message).toContain('not found');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should restore status to confirmed', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'b1', hard_deleted_at: null }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await SoftDeleteService.restoreBooking('b1', 'admin-1');

      const updateCall = mockClient.query.mock.calls.find(
        (call) =>
          call[0].includes("status = 'confirmed'") &&
          call[0].includes('bookings')
      );
      expect(updateCall).toBeDefined();
    });
  });

  describe('getDeletedBookings', () => {
    test('should retrieve list of soft-deleted bookings', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              id: 'b1',
              deleted_at: new Date().toISOString(),
              scheduled_hard_delete_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              original_data: '{}',
            },
          ],
        }),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const result = await SoftDeleteService.getDeletedBookings(50, 0);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b1');
    });

    test('should parse original_data JSON', async () => {
      const originalData = {
        id: 'b1',
        service_id: 's1',
        amount: 100,
      };

      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              id: 'b1',
              deleted_at: new Date().toISOString(),
              scheduled_hard_delete_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              original_data: JSON.stringify(originalData),
            },
          ],
        }),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const result = await SoftDeleteService.getDeletedBookings();

      expect(result[0].original_data).toEqual(originalData);
    });

    test('should calculate days until hard delete', async () => {
      const now = new Date();
      const scheduledDelete = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              id: 'b1',
              deleted_at: now.toISOString(),
              scheduled_hard_delete_at: scheduledDelete.toISOString(),
              original_data: '{}',
            },
          ],
        }),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      const result = await SoftDeleteService.getDeletedBookings();

      expect(result[0].daysUntilHardDelete).toBeGreaterThanOrEqual(29);
      expect(result[0].daysUntilHardDelete).toBeLessThanOrEqual(30);
    });
  });
});
