import React from 'react';
import { useCalendar } from '../contexts/CalendarContext';

/**
 * Calendar header component with navigation and view controls
 * @returns {JSX.Element} CalendarHeader component
 */
const CalendarHeader = () => {
  const { 
    view, 
    setView, 
    selectedDate, 
    navigateNext, 
    navigatePrevious, 
    goToToday 
  } = useCalendar();

  /**
   * Format the currently selected date range for display
   * @returns {string} Formatted date range 
   */
  const getFormattedDateRange = () => {
    // Always use Turkish locale for date formatting
    const options = { month: 'long', day: 'numeric', year: 'numeric' };
    
    switch (view) {
      case 'month':
        return selectedDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
      case 'week': {
        const startOfWeek = new Date(selectedDate);
        const day = selectedDate.getDay();
        startOfWeek.setDate(selectedDate.getDate() - day);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        return `${startOfWeek.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} - ${endOfWeek.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      }
      case 'day':
        // Format: "Friday, May 23, 2023" -> "23 Mayıs 2023"
        return selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      default:
        return selectedDate.toLocaleDateString('tr-TR', options);
    }
  };

  return (
    <header className="calendar-header">
      <div className="calendar-title">
        <h1>Kitesurfing Lessons</h1>
      </div>
      
      <div className="calendar-controls">
        <div className="calendar-navigation">
          <button 
            className="btn-nav" 
            onClick={goToToday} 
            aria-label="Go to today"
          >
            Today
          </button>
          <button 
            className="btn-nav" 
            onClick={navigatePrevious} 
            aria-label="Previous"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <div className="calendar-date-range" aria-live="polite">
            {getFormattedDateRange()}
          </div>
          <button 
            className="btn-nav" 
            onClick={navigateNext} 
            aria-label="Next"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};

export default CalendarHeader;
