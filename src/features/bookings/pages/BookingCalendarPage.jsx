import React from 'react';
import ModernCalendar from '../components/components/ModernCalendar';
import { CalendarProvider } from '../components/contexts/CalendarContext';

/**
 * BookingCalendarPage component that renders the modern booking calendar in a page layout
 * 
 * @returns {JSX.Element} BookingCalendarPage component
 */
const BookingCalendarPage = () => {
  return (
    <div className="page-container px-0 w-full h-full">
      <CalendarProvider>
        <ModernCalendar />
      </CalendarProvider>
    </div>
  );
};

export default BookingCalendarPage;
