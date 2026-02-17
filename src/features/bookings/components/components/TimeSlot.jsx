import React, { useState } from 'react';
import '../styles/TimeRangeSlots.css';
import '../styles/TimeSlot.css'; // Import the new eye-friendly styles

/**
 * TimeSlot component for displaying individual booking slots or time range blocks
 * Enhanced with eye-friendly styling and better visual hierarchy
 * 
 * @param {Object} props - Component props
 * @param {Object} props.slot - Slot data
 * @param {Function} props.onClick - Click handler
 * @param {Boolean} [props.compact=false] - Display in compact mode
 * @param {Boolean} [props.expanded=false] - Display in expanded mode
 * @returns {JSX.Element} TimeSlot component
 */
const TimeSlot = ({ slot, onClick, compact = false, expanded = false }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  
  const { 
    time, 
    status, 
    instructor, 
    instructorId, 
    instructorName,
    studentName,
    serviceType,
    isPreScheduledBlock
  } = slot;
  
  // Check if this is a time range slot
  const isTimeRange = time && time.includes('-');
  
  // Determine CSS classes based on status and display mode
  const slotClasses = [
    'time-slot',
    `status-${status}`,
    compact ? 'compact' : '',
    expanded ? 'expanded' : '',
    isTimeRange ? 'time-range-slot' : '',
    showConfirm ? 'show-confirm' : ''
  ].filter(Boolean).join(' ');
  
  // Determine if the slot is interactive
  const isInteractive = status === 'available';
    // Format the time for display (e.g., "09:00" -> "09.00" or "09:00-11:00" -> "09.00-11.00")
  const formatDisplayTime = (time) => {
    if (!time) return '';
    
    // Check if it's a time range (contains a hyphen)
    if (time.includes('-')) {
      const [startTime, endTime] = time.split('-');
      const formattedStartTime = formatDisplayTime(startTime);
      const formattedEndTime = formatDisplayTime(endTime);
      return `${formattedStartTime}-${formattedEndTime}`;
    }
    
    // Replace colon with dot for display
    return time.replace(':', '.');
  };
  
  // Calculate duration from start-end time
  const calculateDuration = () => {
    if (!isTimeRange) return '1 hour';
    
    const [startTime, endTime] = time.split('-');
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const durationHours = endHour - startHour;
    const durationMinutes = endMinute - startMinute;
    const totalMinutes = (durationHours * 60) + durationMinutes;
    
    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else if (totalMinutes % 60 === 0) {
      return `${totalMinutes / 60} ${totalMinutes === 60 ? 'hour' : 'hours'}`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
  };
  
  // Handle slot click
  const handleClick = () => {
    if (!isInteractive) return;
    
    if (isPreScheduledBlock && !showConfirm) {
      // First click - show confirmation
      setShowConfirm(true);
    } else {
      // Second click or not a pre-scheduled block
      setShowConfirm(false);
      if (onClick) {
        onClick(slot);
      }
    }
  };
  
  // Handle confirmation cancel
  const handleCancel = (e) => {
    e.stopPropagation();
    setShowConfirm(false);
  };
  
  // Handle confirmation confirm
  const handleConfirm = (e) => {
    e.stopPropagation();
    setShowConfirm(false);
    if (onClick) {
      onClick(slot);
    }
  };

  return (
    <div 
      className={slotClasses}
      onClick={handleClick}
      tabIndex={isInteractive ? 0 : -1}
      role={isInteractive ? "button" : "presentation"}
      aria-disabled={!isInteractive}
    >
      {/* Time display */}
      {!compact && (
        <div className="slot-time">{formatDisplayTime(time)}</div>
      )}
      
      {/* Status indicator */}
      <div className="slot-status-indicator"></div>
      
      {/* Content based on display mode */}      <div className="slot-content">
        {compact ? (
          /* Compact mode (for month view) */
          <>
            <div className="slot-time slot-range">{formatDisplayTime(time)}</div>
            {status === 'booked' && studentName && (
              <div className="slot-student">{studentName}</div>
            )}
          </>
        ) : (
          /* Standard/expanded mode */
          <>
            {status === 'booked' && studentName && (
              <div className="slot-student">{studentName}</div>
            )}
            {status === 'booked' && serviceType && (
              <div className="slot-service">{serviceType}</div>
            )}
          </>
        )}
      </div>
        {/* Confirmation overlay */}
      {showConfirm && (
        <div className="slot-confirm-overlay">
          <div className="slot-confirm-message">
            Book {formatDisplayTime(time)}?
          </div>
          <div className="slot-confirm-buttons">
            <button 
              className="slot-confirm-button confirm"
              onClick={handleConfirm}
            >
              Book
            </button>
            <button
              className="slot-confirm-button cancel"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeSlot;
