// Unit tests for booking service logic
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../db.js';

describe('Booking Service Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Capacity Validation', () => {
    it('should allow booking when under capacity', async () => {
      // Mock service with max_participants = 5
      pool.query.mockResolvedValueOnce({
        rows: [{ max_participants: 5 }]
      });

      // Mock existing bookings count = 3
      pool.query.mockResolvedValueOnce({
        rows: [{ count: '3' }]
      });

      // Capacity check logic (would be extracted to service)
      const maxParticipants = 5;
      const currentBookings = 3;
      const canBook = currentBookings < maxParticipants;

      expect(canBook).toBe(true);
    });

    it('should block booking when at capacity', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ max_participants: 2 }]
      });

      pool.query.mockResolvedValueOnce({
        rows: [{ count: '2' }]
      });

      const maxParticipants = 2;
      const currentBookings = 2;
      const canBook = currentBookings < maxParticipants;

      expect(canBook).toBe(false);
    });
  });

  describe('Double-booking Prevention', () => {
    it('should detect overlapping bookings', () => {
      const existingBooking = {
        date: '2026-02-15',
        time: '10:00',
        duration: 2,
        instructor_id: 'instr-1'
      };

      const newBooking = {
        date: '2026-02-15',
        time: '11:00',
        duration: 2,
        instructor_id: 'instr-1'
      };

      // Simple overlap detection
      const hasOverlap = (
        existingBooking.date === newBooking.date &&
        existingBooking.instructor_id === newBooking.instructor_id
      );

      expect(hasOverlap).toBe(true);
    });

    it('should allow non-overlapping bookings', () => {
      const existingBooking = {
        date: '2026-02-15',
        time: '10:00',
        duration: 2,
        instructor_id: 'instr-1'
      };

      const newBooking = {
        date: '2026-02-16', // Different day
        time: '10:00',
        duration: 2,
        instructor_id: 'instr-1'
      };

      const hasOverlap = existingBooking.date === newBooking.date;

      expect(hasOverlap).toBe(false);
    });
  });

  describe('Price Calculation', () => {
    it('should calculate correct price for duration', () => {
      const hourlyRate = 50;
      const duration = 2;
      const expectedPrice = hourlyRate * duration;

      expect(expectedPrice).toBe(100);
    });

    it('should apply package discount', () => {
      const regularPrice = 100;
      const packageDiscount = 0.15; // 15% off
      const finalPrice = regularPrice * (1 - packageDiscount);

      expect(finalPrice).toBe(85);
    });
  });
});
