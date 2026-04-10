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
    <div className="w-full h-full flex flex-col overflow-hidden">
      <CalendarProvider>
        <ModernCalendar />
      </CalendarProvider>
    </div>
  );
};

export default BookingCalendarPage;
