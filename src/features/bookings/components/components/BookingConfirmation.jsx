import React from 'react';
import '../styles/BookingConfirmation.css';
import { CheckCircleIcon, CalendarIcon, ShareIcon } from '@heroicons/react/24/outline';

/**
 * Booking confirmation component to display after a successful booking
 * 
 * @param {Object} props - Component props
 * @param {Object} props.booking - Details of the completed booking
 * @param {Function} props.onClose - Function to close the confirmation
 * @param {Function} props.onAddToCalendar - Function to add the booking to calendar
 * @returns {JSX.Element} BookingConfirmation component
 */
const BookingConfirmation = ({ booking, onClose, onAddToCalendar }) => {
  // Backward compatibility for old prop name
  const bookingDetails = booking || {};
  
  const { 
    date, 
    startTime, 
    endTime,
    time,
    duration, 
    instructorName,
    instructorId,
    serviceName,
    serviceId,
    userName,
    userId,
    bookingId,
    notes,
    checkInStatus
  } = bookingDetails;
  
  // Format the date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Calculate end time based on start time and duration for backwards compatibility
  const calculateEndTime = (startTime, durationHours) => {
    if (!startTime || !durationHours) return '';
    
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = (hours * 60) + minutes + (durationHours * 60);
    
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };
  
  // For backward compatibility
  const calculatedEndTime = calculateEndTime(time, duration);
  const timeDisplay = endTime || (calculatedEndTime ? `${time} - ${calculatedEndTime}` : time) || 
                     (startTime && endTime ? `${startTime} - ${endTime}` : '');
  
  /**
   * Create URL to add event to Google Calendar
   */
  const createGoogleCalendarLink = () => {
    // Format event details for Google Calendar
    const eventName = `Kitesurfing: ${serviceName || 'Lesson'}`;
    const startDateTime = formatGoogleCalendarDateTime(date, startTime || time);
    const endDateTime = formatGoogleCalendarDateTime(date, endTime || calculatedEndTime || time);
    const location = "Kitesurfing School Beach Location";
    const details = `Instructor: ${instructorName || 'TBD'}\n` +
                    `User: ${userName || 'TBD'}\n` +
                    `Service: ${serviceName || 'Kitesurfing Lesson'}\n` +
                    `Notes: ${notes || 'None'}`;
    
    // Construct Google Calendar URL
    const baseUrl = 'https://calendar.google.com/calendar/render';
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: eventName,
      dates: `${startDateTime}/${endDateTime}`,
      details: details,
      location: location,
      sf: true,
      output: 'xml'
    });
    
    return `${baseUrl}?${params.toString()}`;
  };
  
  /**
   * Format date and time for Google Calendar URL
   * @param {string} date - Date string in YYYY-MM-DD format
   * @param {string} time - Time string in HH:MM format
   * @returns {string} Formatted date and time for Google Calendar (YYYYMMDDTHHMMssZ)
   */
  const formatGoogleCalendarDateTime = (date, time) => {
    if (!date || !time) return '';
    
    const [hours, minutes] = time.split(':');
    const dateObj = new Date(date);
    dateObj.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0);
    
    return dateObj.toISOString().replace(/-|:|\.\d+/g, '');
  };
  
  /**
   * Share booking details (basic implementation)
   */
  const shareBooking = async () => {
    const shareText = `My kitesurfing lesson is booked for ${formatDate(date)} at ${startTime || time} with ${instructorName}.`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Kitesurfing Lesson',
          text: shareText
        });
      } catch (error) {
        console.error('Error sharing:', error);
        // Fallback for unsupported browsers
        copyToClipboard(shareText);
      }
    } else {
      // Fallback for unsupported browsers
      copyToClipboard(shareText);
    }
  };
  
  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   */
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Booking details copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });  };    return (
    <div className="booking-confirmation-content w-full mx-auto overflow-hidden transition-all duration-300 ease-in-out">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4 animate-pulse">
          <CheckCircleIcon className="h-8 w-8 text-green-600" aria-hidden="true" />
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 confirmation-title">Booking Confirmed!</h3>
        <p className="mt-2 text-sm text-gray-500 confirmation-message">
          Your kitesurfing lesson has been successfully booked.
        </p>
      </div>
        
      {/* Booking details */}
      <div className="mt-6 bg-gray-50 p-4 rounded-md text-left confirmation-details">
        <div className="confirmation-detail-item mb-2">
          <div className="confirmation-detail-label text-xs text-gray-500">Student:</div>
          <div className="confirmation-detail-value text-sm font-medium">{userName}</div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-2">
          <div className="confirmation-detail-item">
            <div className="confirmation-detail-label text-xs text-gray-500">Date:</div>
            <div className="confirmation-detail-value text-sm font-medium">{formatDate(date)}</div>
          </div>
          
          <div className="confirmation-detail-item">
            <div className="confirmation-detail-label text-xs text-gray-500">Time:</div>
            <div className="confirmation-detail-value text-sm font-medium">
              {startTime || time} {endTime ? `- ${endTime}` : ''}
            </div>
          </div>
        </div>
        
        {instructorName && (
          <div className="confirmation-detail-item mb-2">
            <div className="confirmation-detail-label text-xs text-gray-500">Instructor:</div>
            <div className="confirmation-detail-value text-sm font-medium">{instructorName}</div>
          </div>
        )}
        
        {serviceName && (
          <div className="confirmation-detail-item mb-2">
            <div className="confirmation-detail-label text-xs text-gray-500">Service:</div>
            <div className="confirmation-detail-value text-sm font-medium">{serviceName}</div>
          </div>
        )}
        
        {notes && (
          <div className="confirmation-detail-item mb-2">
            <div className="confirmation-detail-label text-xs text-gray-500">Notes:</div>
            <div className="confirmation-detail-value text-sm">{notes}</div>
          </div>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="mt-6 grid grid-cols-2 gap-3 confirmation-actions">
        <a
          href={createGoogleCalendarLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 confirmation-action-btn confirmation-calendar-btn"
        >
          <CalendarIcon className="mr-2 h-5 w-5 text-gray-500" />
          Add to Calendar
        </a>
        <button
          type="button"
          onClick={shareBooking}
          className="inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 confirmation-action-btn"
        >
          <ShareIcon className="mr-2 h-5 w-5 text-gray-500" />
          Share
        </button>
        
        {/* Close button */}
        <div className="col-span-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 confirmation-action-btn confirmation-close-action"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmation;
