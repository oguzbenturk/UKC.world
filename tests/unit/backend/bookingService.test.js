import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

let bookingService;
let pool;
let cacheService;
let appendCreatedBy;

beforeAll(async () => {
  // Setup ESM mocks before importing the service
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: { query: jest.fn() },
  }));

  await jest.unstable_mockModule('../../../backend/services/cacheService.js', () => ({
    cacheService: {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    },
  }));

  await jest.unstable_mockModule('../../../backend/utils/auditUtils.js', () => ({
    appendCreatedBy: jest.fn(),
  }));

  // Import the service after mocks are set up
  const bookingServiceModule = await import('../../../backend/services/bookingService.js');
  bookingService = bookingServiceModule.bookingService;

  const dbModule = await import('../../../backend/db.js');
  pool = dbModule.pool;

  const cacheModule = await import('../../../backend/services/cacheService.js');
  cacheService = cacheModule.cacheService;

  const auditModule = await import('../../../backend/utils/auditUtils.js');
  appendCreatedBy = auditModule.appendCreatedBy;
});

describe('BookingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    cacheService.get.mockResolvedValue(null);
    cacheService.set.mockResolvedValue(undefined);
    cacheService.del.mockResolvedValue(undefined);
    appendCreatedBy.mockReturnValue({ columns: [], values: [] });
  });

  describe('getBookingsByDateRange', () => {
    test('returns bookings for valid date range', async () => {
      const mockBookings = [
        {
          id: 1,
          date: '2026-04-04',
          start_hour: 9,
          duration: 2,
          status: 'confirmed',
          final_amount: 100,
          student_name: 'John Doe',
          instructor_name: 'Jane Smith',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockBookings });

      const result = await bookingService.getBookingsByDateRange(
        '2026-04-04',
        '2026-04-05'
      );

      expect(result).toEqual(mockBookings);
      expect(pool.query).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });

    test('returns cached bookings if cache hit', async () => {
      const mockBookings = [{ id: 1, date: '2026-04-04' }];
      cacheService.get.mockResolvedValue(mockBookings);

      const result = await bookingService.getBookingsByDateRange(
        '2026-04-04',
        '2026-04-05'
      );

      expect(result).toEqual(mockBookings);
      expect(pool.query).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    test('filters by status when provided', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await bookingService.getBookingsByDateRange(
        '2026-04-04',
        '2026-04-05',
        null,
        'confirmed'
      );

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain("AND b.status = ");
      expect(callArgs[1]).toContain('confirmed');
    });

    test('filters by instructor when provided', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await bookingService.getBookingsByDateRange(
        '2026-04-04',
        '2026-04-05',
        123
      );

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain('AND b.instructor_user_id');
      expect(callArgs[1]).toContain(123);
    });

    test('excludes cancelled bookings by default', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await bookingService.getBookingsByDateRange(
        '2026-04-04',
        '2026-04-05',
        null,
        null
      );

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain("AND b.status != 'cancelled'");
    });

    test('includes cancelled bookings when status filter is set', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await bookingService.getBookingsByDateRange(
        '2026-04-04',
        '2026-04-05',
        null,
        'cancelled'
      );

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain('AND b.status = ');
    });

    test('handles database error gracefully', async () => {
      const error = new Error('Database connection failed');
      pool.query.mockRejectedValue(error);

      await expect(
        bookingService.getBookingsByDateRange('2026-04-04', '2026-04-05')
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getInstructorAvailability', () => {
    test('returns available slots for empty schedule', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.getInstructorAvailability(1, '2026-04-04');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('hour');
      expect(result[0]).toHaveProperty('time');
    });

    test('excludes booked hours from availability', async () => {
      const bookedSlots = [
        { start_hour: '9', duration: '2' },
        { start_hour: '14', duration: '1.5' },
      ];
      pool.query.mockResolvedValue({ rows: bookedSlots });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.getInstructorAvailability(1, '2026-04-04');

      // Hour 9, 10 should be excluded (9 + 2 hour duration)
      const hour9 = result.find(s => s.hour === 9);
      const hour10 = result.find(s => s.hour === 10);
      expect(hour9).toBeUndefined();
      expect(hour10).toBeUndefined();
    });

    test('caches availability results', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      cacheService.get.mockResolvedValue(null);

      await bookingService.getInstructorAvailability(1, '2026-04-04');

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('availability:instructor:1:'),
        expect.any(Array),
        600
      );
    });

    test('returns cached availability', async () => {
      const mockAvailability = [
        { hour: 8, time: '08:00' },
        { hour: 9, time: '09:00' },
      ];
      cacheService.get.mockResolvedValue(mockAvailability);

      const result = await bookingService.getInstructorAvailability(1, '2026-04-04');

      expect(result).toEqual(mockAvailability);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('createBooking', () => {
    test('creates booking with all required fields', async () => {
      const bookingData = {
        student_user_id: 1,
        instructor_user_id: 2,
        service_id: 3,
        date: '2026-04-04',
        start_hour: 9,
        duration: 2,
        final_amount: 100,
        status: 'pending',
        created_by: 10,
      };

      const createdBooking = { id: 1, ...bookingData };
      pool.query.mockResolvedValue({ rows: [createdBooking] });
      appendCreatedBy.mockReturnValue({
        columns: ['student_user_id', 'instructor_user_id', 'service_id', 'date', 'start_hour', 'duration', 'final_amount', 'status', 'created_at', 'updated_at', 'created_by'],
        values: [1, 2, 3, '2026-04-04', 9, 2, 100, 'pending', expect.any(Date), expect.any(Date), 10],
      });

      const result = await bookingService.createBooking(bookingData);

      expect(result.id).toBe(1);
      expect(result.student_user_id).toBe(1);
      expect(pool.query).toHaveBeenCalled();
      expect(cacheService.del).toHaveBeenCalled();
    });

    test('defaults status to pending when not provided', async () => {
      const bookingData = {
        student_user_id: 1,
        instructor_user_id: 2,
        service_id: 3,
        date: '2026-04-04',
        start_hour: 9,
        duration: 2,
      };

      pool.query.mockResolvedValue({ rows: [{ id: 1, ...bookingData, status: 'pending' }] });
      appendCreatedBy.mockReturnValue({
        columns: ['student_user_id', 'instructor_user_id', 'service_id', 'date', 'start_hour', 'duration', 'notes', 'final_amount', 'status', 'created_at', 'updated_at'],
        values: [1, 2, 3, '2026-04-04', 9, 2, '', 0, 'pending', expect.any(Date), expect.any(Date)],
      });

      await bookingService.createBooking(bookingData);

      // Verify the values contain 'pending' status
      const callArgs = appendCreatedBy.mock.calls[0];
      expect(callArgs[1]).toContain('pending');
    });

    test('defaults final_amount to 0 when not provided', async () => {
      const bookingData = {
        student_user_id: 1,
        instructor_user_id: 2,
        service_id: 3,
        date: '2026-04-04',
        start_hour: 9,
        duration: 2,
      };

      pool.query.mockResolvedValue({ rows: [{ id: 1, ...bookingData, final_amount: 0 }] });
      appendCreatedBy.mockReturnValue({
        columns: ['student_user_id', 'instructor_user_id', 'service_id', 'date', 'start_hour', 'duration', 'notes', 'final_amount', 'status', 'created_at', 'updated_at'],
        values: [1, 2, 3, '2026-04-04', 9, 2, '', 0, 'pending', expect.any(Date), expect.any(Date)],
      });

      await bookingService.createBooking(bookingData);

      const callArgs = appendCreatedBy.mock.calls[0];
      expect(callArgs[1]).toContain(0); // final_amount should be 0
    });

    test('includes family_member_id when provided', async () => {
      const bookingData = {
        student_user_id: 1,
        instructor_user_id: 2,
        service_id: 3,
        date: '2026-04-04',
        start_hour: 9,
        duration: 2,
        family_member_id: 5,
      };

      pool.query.mockResolvedValue({ rows: [{ id: 1, ...bookingData }] });
      appendCreatedBy.mockReturnValue({
        columns: ['student_user_id', 'instructor_user_id', 'service_id', 'date', 'start_hour', 'duration', 'notes', 'final_amount', 'status', 'created_at', 'updated_at', 'family_member_id'],
        values: [1, 2, 3, '2026-04-04', 9, 2, '', 0, 'pending', expect.any(Date), expect.any(Date), 5],
      });

      await bookingService.createBooking(bookingData);

      const callArgs = appendCreatedBy.mock.calls[0];
      expect(callArgs[0]).toContain('family_member_id');
      expect(callArgs[1]).toContain(5);
    });

    test('invalidates caches after creating booking', async () => {
      const bookingData = {
        student_user_id: 1,
        instructor_user_id: 2,
        service_id: 3,
        date: '2026-04-04',
        start_hour: 9,
        duration: 2,
      };

      pool.query.mockResolvedValue({ rows: [{ id: 1, ...bookingData }] });
      appendCreatedBy.mockReturnValue({
        columns: ['student_user_id', 'instructor_user_id', 'service_id', 'date', 'start_hour', 'duration', 'notes', 'final_amount', 'status', 'created_at', 'updated_at'],
        values: [1, 2, 3, '2026-04-04', 9, 2, '', 0, 'pending', expect.any(Date), expect.any(Date)],
      });

      await bookingService.createBooking(bookingData);

      expect(cacheService.del).toHaveBeenCalled();
    });

    test('handles database error when creating booking', async () => {
      const bookingData = {
        student_user_id: 1,
        instructor_user_id: 2,
        service_id: 3,
        date: '2026-04-04',
        start_hour: 9,
        duration: 2,
      };

      pool.query.mockRejectedValue(new Error('Constraint violation'));

      await expect(bookingService.createBooking(bookingData))
        .rejects.toThrow('Constraint violation');
    });
  });

  describe('updateBookingStatus', () => {
    test('updates booking status successfully', async () => {
      const existingBooking = {
        id: 1,
        date: '2026-04-04',
        instructor_user_id: 2,
        student_user_id: 1,
        status: 'pending',
      };

      const updatedBooking = { ...existingBooking, status: 'confirmed' };

      // First call returns existing booking, second returns updated booking
      pool.query
        .mockResolvedValueOnce({ rows: [existingBooking] })
        .mockResolvedValueOnce({ rows: [updatedBooking] });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.updateBookingStatus(1, 'confirmed', 10);

      expect(result.status).toBe('confirmed');
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(cacheService.del).toHaveBeenCalled();
    });

    test('throws error if booking not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      cacheService.get.mockResolvedValue(null);

      await expect(bookingService.updateBookingStatus(999, 'confirmed', 10))
        .rejects.toThrow('Booking not found');
    });

    test('invalidates caches after status update', async () => {
      const existingBooking = {
        id: 1,
        date: '2026-04-04',
        instructor_user_id: 2,
        student_user_id: 1,
        status: 'pending',
      };

      const updatedBooking = { ...existingBooking, status: 'cancelled' };

      pool.query
        .mockResolvedValueOnce({ rows: [existingBooking] })
        .mockResolvedValueOnce({ rows: [updatedBooking] });
      cacheService.get.mockResolvedValue(null);

      await bookingService.updateBookingStatus(1, 'cancelled', 10);

      expect(cacheService.del).toHaveBeenCalledWith(expect.stringContaining('bookings:*'));
      expect(cacheService.del).toHaveBeenCalledWith(expect.stringContaining('user_bookings:'));
    });
  });

  describe('getBookingById', () => {
    test('returns booking by ID', async () => {
      const mockBooking = {
        id: 1,
        date: '2026-04-04',
        status: 'confirmed',
        student_name: 'John Doe',
        instructor_name: 'Jane Smith',
      };

      pool.query.mockResolvedValue({ rows: [mockBooking] });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.getBookingById(1);

      expect(result).toEqual(mockBooking);
      expect(cacheService.set).toHaveBeenCalled();
    });

    test('returns cached booking', async () => {
      const mockBooking = { id: 1, date: '2026-04-04' };
      cacheService.get.mockResolvedValue(mockBooking);

      const result = await bookingService.getBookingById(1);

      expect(result).toEqual(mockBooking);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('returns null when booking not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.getBookingById(999);

      expect(result).toBeNull();
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('getUserBookings', () => {
    test('returns student bookings', async () => {
      const mockBookings = [
        { id: 1, student_user_id: 1, date: '2026-04-04' },
        { id: 2, student_user_id: 1, date: '2026-04-03' },
      ];

      pool.query.mockResolvedValue({ rows: mockBookings });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.getUserBookings(1, 'student', 20, 0);

      expect(result).toEqual(mockBookings);
      expect(pool.query.mock.calls[0][0]).toContain('student_user_id');
    });

    test('returns instructor bookings', async () => {
      const mockBookings = [
        { id: 1, instructor_user_id: 2, date: '2026-04-04' },
      ];

      pool.query.mockResolvedValue({ rows: mockBookings });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.getUserBookings(2, 'instructor', 20, 0);

      expect(result).toEqual(mockBookings);
      expect(pool.query.mock.calls[0][0]).toContain('instructor_user_id');
    });

    test('returns manager bookings as instructor', async () => {
      const mockBookings = [{ id: 1, instructor_user_id: 2 }];
      pool.query.mockResolvedValue({ rows: mockBookings });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.getUserBookings(2, 'manager', 20, 0);

      expect(result).toEqual(mockBookings);
    });

    test('respects limit and offset', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      cacheService.get.mockResolvedValue(null);

      await bookingService.getUserBookings(1, 'student', 10, 5);

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[1]).toContain(10); // limit
      expect(callArgs[1]).toContain(5);  // offset
    });

    test('caches user bookings', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      cacheService.get.mockResolvedValue(null);

      await bookingService.getUserBookings(1, 'student', 20, 0);

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('user_bookings:1:student'),
        expect.any(Array),
        300
      );
    });

    test('returns cached user bookings', async () => {
      const mockBookings = [{ id: 1 }];
      cacheService.get.mockResolvedValue(mockBookings);

      const result = await bookingService.getUserBookings(1, 'student', 20, 0);

      expect(result).toEqual(mockBookings);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('getBookingStats', () => {
    test('returns booking statistics', async () => {
      const mockStats = {
        total_bookings: '10',
        confirmed_bookings: '7',
        pending_bookings: '2',
        cancelled_bookings: '1',
        confirmed_revenue: '500.00',
        average_booking_value: '50.00',
      };

      pool.query.mockResolvedValue({ rows: [mockStats] });
      cacheService.get.mockResolvedValue(null);

      const result = await bookingService.getBookingStats('2026-04-01', '2026-04-30');

      expect(result).toEqual(mockStats);
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('booking_stats:'),
        mockStats,
        1800
      );
    });

    test('returns cached stats', async () => {
      const mockStats = { total_bookings: '10' };
      cacheService.get.mockResolvedValue(mockStats);

      const result = await bookingService.getBookingStats('2026-04-01', '2026-04-30');

      expect(result).toEqual(mockStats);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('invalidateBookingCaches', () => {
    test('deletes all relevant cache patterns', async () => {
      await bookingService.invalidateBookingCaches('2026-04-04', 2, 1);

      expect(cacheService.del).toHaveBeenCalledWith('bookings:*');
      expect(cacheService.del).toHaveBeenCalledWith('availability:instructor:2:*');
      expect(cacheService.del).toHaveBeenCalledWith('user_bookings:2:*');
      expect(cacheService.del).toHaveBeenCalledWith('user_bookings:1:*');
      expect(cacheService.del).toHaveBeenCalledWith('booking:*');
    });
  });
});
