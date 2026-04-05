import React, { useState } from 'react';
import { CalendarProvider } from '../contexts/CalendarContext';
import CalendarHeader from './CalendarHeader';
import CalendarGrid from './CalendarGrid';
import CalendarFilters from './CalendarFilters';
import BookingModal from './BookingModal';
import BookingDetailModal from './BookingDetailModal';
import '../styles/bookingCalendar.css';
import '../styles/EnhancedCalendarStyles.css'; // Import enhanced eye-friendly styles

/**
 * Main booking calendar component
 * @returns {JSX.Element} BookingCalendar component
 */
const BookingCalendar = () => {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isBookingDetailModalOpen, setIsBookingDetailModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  // Handle time slot click
  const handleTimeSlotClick = (slot) => {
    // Only allow booking available slots
    if (slot && slot.status === 'available') {
      // We'll set the selected slot in context inside CalendarGrid
      setIsBookingModalOpen(true);
    }
  };

  // Handle booking click to show details
  const handleBookingClick = (booking) => {
    setSelectedBooking(booking);
    setIsBookingDetailModalOpen(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setIsBookingModalOpen(false);
  };

  // Handle booking detail modal close
  const handleBookingDetailModalClose = () => {
    setIsBookingDetailModalOpen(false);
    setSelectedBooking(null);
  };
  return (
    <CalendarProvider>
      <div className="booking-calendar-container">
        <div className="booking-calendar-wrapper">
          <CalendarHeader />
          <div className="booking-calendar-content calendar-content-transition">
            <CalendarGrid 
              onTimeSlotClick={handleTimeSlotClick} 
              onBookingClick={handleBookingClick}
            />
            <CalendarFilters />
          </div>
        </div>
        
        <BookingModal 
          isOpen={isBookingModalOpen} 
          onClose={handleModalClose} 
        />
        
        <BookingDetailModal 
          isOpen={isBookingDetailModalOpen}
          onClose={handleBookingDetailModalClose}
          booking={selectedBooking}
          onServiceUpdate={() => {}} // Empty callback for calendar view
        />
      </div>
    </CalendarProvider>
  );
};

export default BookingCalendar;
