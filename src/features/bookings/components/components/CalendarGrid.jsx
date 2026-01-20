import React, { useMemo } from 'react';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  MinusCircleIcon 
} from '@heroicons/react/24/outline';
import { useCalendar } from '../contexts/CalendarContext';
import MonthView from './views/MonthView';
import WeekView from './views/WeekView';
import DailyView from './views/DailyView';

/**
 * Calendar grid component that renders different views based on current selection
 * @param {Object} props - Component props
 * @param {Function} props.onTimeSlotClick - Callback when a time slot is clicked
 * @param {Function} props.onBookingClick - Callback when a booking is clicked
 * @returns {JSX.Element} CalendarGrid component
 */
const CalendarGrid = ({ onTimeSlotClick, onBookingClick }) => {
  const { 
    view,
    selectedDate,
    slots,
    isLoading,
    error,
    selectedInstructors,
    setSelectedSlot
  } = useCalendar();

  // Handle time slot click to set selected slot in context
  const handleSlotClick = (slot) => {
    setSelectedSlot(slot);
    onTimeSlotClick(slot);
  };

  // Determine which instructors to display (all active instructors if none selected)
  const activeInstructors = useMemo(() => {
    return selectedInstructors;
  }, [selectedInstructors]);
  
  // Render loading state
  if (isLoading) {
    return (
      <div className="calendar-loading">
        <div className="loading-spinner"></div>
        <p>Loading calendar data...</p>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="calendar-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>        <p>Error loading calendar: {error}</p>        <button className="btn-retry">Retry</button>
      </div>
    );
  }
  // Render appropriate view based on selection
  const renderCalendarView = () => {    switch (view) {
      case 'month':
        return <MonthView onTimeSlotClick={handleSlotClick} onBookingClick={onBookingClick} />;
      case 'week':
        return <WeekView onTimeSlotClick={handleSlotClick} onBookingClick={onBookingClick} />;
      case 'day':
        // Use our new daily view component
        return <DailyView onTimeSlotClick={handleSlotClick} onBookingClick={onBookingClick} />;
      default:
        return <MonthView onTimeSlotClick={handleSlotClick} onBookingClick={onBookingClick} />;
    }
  };

  return (
    <div className="calendar-grid-wrapper" role="grid" aria-label="Booking Calendar">
      {renderCalendarView()}
        {/* Legend for slot status */}
      <div className="calendar-legend">
        <div className="legend-item">
          <span className="legend-color available"></span>
          <CheckCircleIcon className="w-4 h-4 text-green-600" />
          <span className="legend-label">Available</span>
        </div>
        <div className="legend-item">
          <span className="legend-color booked"></span>
          <XCircleIcon className="w-4 h-4 text-red-600" />
          <span className="legend-label">Booked</span>
        </div>
        <div className="legend-item">
          <span className="legend-color unavailable"></span>
          <MinusCircleIcon className="w-4 h-4 text-gray-500" />
          <span className="legend-label">Unavailable</span>
        </div>
      </div>
    </div>
  );
};

export default CalendarGrid;
