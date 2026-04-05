import { describe, expect, it } from 'vitest';
import { filterActiveBookings } from '@/features/bookings/components/contexts/CalendarContext';

describe('filterActiveBookings', () => {
  it('returns empty array for non-array input', () => {
    expect(filterActiveBookings(null)).toEqual([]);
    expect(filterActiveBookings(undefined)).toEqual([]);
    expect(filterActiveBookings('string')).toEqual([]);
  });

  it('excludes cancelled bookings', () => {
    const bookings = [
      { id: '1', status: 'confirmed', service_category: 'lesson' },
      { id: '2', status: 'cancelled', service_category: 'lesson' },
    ];
    const result = filterActiveBookings(bookings);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('excludes pending_payment bookings', () => {
    const bookings = [
      { id: '1', status: 'confirmed', service_category: 'lesson' },
      { id: '2', status: 'pending_payment', service_category: 'lesson' },
      { id: '3', status: 'pending', service_category: 'lesson' },
    ];
    const result = filterActiveBookings(bookings);
    expect(result).toHaveLength(2);
    const ids = result.map((b) => b.id);
    expect(ids).toContain('1');
    expect(ids).toContain('3');
    expect(ids).not.toContain('2');
  });

  it('preserves confirmed, pending, completed, and other valid statuses', () => {
    const bookings = [
      { id: '1', status: 'confirmed' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'completed' },
      { id: '4', status: 'no_show' },
      { id: '5', status: 'checked-in' },
    ];
    const result = filterActiveBookings(bookings);
    expect(result).toHaveLength(5);
  });

  it('excludes rental bookings', () => {
    const bookings = [
      { id: '1', status: 'confirmed', service_category: 'lesson' },
      { id: '2', status: 'confirmed', service_category: 'rental' },
      { id: '3', status: 'confirmed', service_name: 'Equipment Rental' },
    ];
    const result = filterActiveBookings(bookings);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('handles mixed statuses correctly', () => {
    const bookings = [
      { id: '1', status: 'confirmed' },
      { id: '2', status: 'cancelled' },
      { id: '3', status: 'pending_payment' },
      { id: '4', status: 'pending' },
      { id: '5', status: 'confirmed', service_category: 'rental' },
    ];
    const result = filterActiveBookings(bookings);
    expect(result).toHaveLength(2);
    const ids = result.map((b) => b.id);
    expect(ids).toEqual(['1', '4']);
  });
});
