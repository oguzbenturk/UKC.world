// Unit tests for BookingCard component
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import BookingCard from '../BookingCard';

describe('BookingCard', () => {
  const mockBooking = {
    id: 'booking-123',
    date: '2026-02-15',
    time: '10:00',
    duration: 2,
    status: 'confirmed',
    service_name: 'Wing Foil Lesson',
    student_name: 'John Doe',
    instructor_name: 'Alice Waves',
    final_amount: 100
  };

  it('should render booking information', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText(/Wing Foil Lesson/i)).toBeInTheDocument();
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice Waves/i)).toBeInTheDocument();
  });

  it('should display booking date and time', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText(/2026-02-15/i)).toBeInTheDocument();
    expect(screen.getByText(/10:00/i)).toBeInTheDocument();
  });

  it('should show confirmed status', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
  });

  it('should display price', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText(/100/)).toBeInTheDocument();
  });

  it('should handle cancelled status with different styling', () => {
    const cancelledBooking = { ...mockBooking, status: 'cancelled' };
    renderWithProviders(<BookingCard booking={cancelledBooking} />);

    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });

  it('should call onClick when booking card is clicked', async () => {
    const mockOnClick = vi.fn();
    const { user } = renderWithProviders(
      <BookingCard booking={mockBooking} onClick={mockOnClick} />
    );

    const card = screen.getByText(/Wing Foil Lesson/i).closest('div');
    await user.click(card);

    expect(mockOnClick).toHaveBeenCalledWith(mockBooking);
  });
});
