import { useMemo, useState, useRef } from 'react';
import { useCalendar } from '../../contexts/CalendarContext';
import { format, addDays, startOfWeek, isSameDay, isSameMonth } from 'date-fns';
import calendarConfig from '@/config/calendarConfig';
import { getGroupBookingTooltip } from '@/features/bookings/utils/groupBookingUtils';
import '../../styles/bookingCalendar.css';
import '../../styles/modernBookingCards.css';
import { useToast } from '@/shared/contexts/ToastContext';
import CalendarDndProvider from '../dnd/CalendarDndProvider';
import { DraggableBooking } from '../dnd/DraggableBooking';
import { DayDropZone } from '../dnd/DayDropZone';
import DailyView from './DailyView';

/**
 * Calculate duration between two time strings (HH:MM format)
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {number} Duration in minutes
 */
// Note: duration calc available in other views if needed; omitted here to keep file lean.

/**
 * Week view calendar component with grid-based layout
 * @param {Object} props - Component props
 * @param {Function} props.onTimeSlotClick - Callback when a time slot is clicked
 * @param {Function} props.onBookingClick - Callback when a booking is clicked
 * @returns {JSX.Element} WeekView component
 */
const WeekView = ({ onBookingClick, onTimeSlotClick }) => {
  const { 
    selectedDate, 
    setSelectedDate,
  // setView, // not used in this view
  // slots, 
    bookings,
    selectedInstructors,
    selectedServices,
  // formatDate, // not used in this view
    updateBooking
  } = useCalendar();
  const { showSuccess, showError } = useToast();

  // Instructor colors removed in favor of status-based styling

  // DnD state
  const [dragOverDay, setDragOverDay] = useState(null);
  const gridRef = useRef(null);
  const dayRefs = useRef({});

  // Held booking state for DailyView overlay
  const [heldBooking, setHeldBooking] = useState(null);
  const [showDailyViewOverlay, setShowDailyViewOverlay] = useState(false);
  const [targetDate, setTargetDate] = useState(null);

  // Use the same status-to-class mapping as DailyView
  const getBookingStatusClass = (status, checkInStatus) => {
    if (checkInStatus === 'checked-in') return 'booking-card-checked-in';
    switch (status) {
      case 'confirmed':
      case 'pending':
        return 'booking-card-pending';
      case 'completed':
        return 'booking-card-completed';
      case 'cancelled':
        return 'booking-card-cancelled';
      default:
        return 'booking-card-default';
    }
  };

  const toStartHour = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h + m / 60;
  };

  const performSwap = async (a, b) => {
    const durA = parseFloat(a.duration) || 1;
    const durB = parseFloat(b.duration) || 1;
    if (Math.abs(durA - durB) > 0.001) throw new Error('Swap not allowed: different durations');
    const newA = {
      date: b.date || b.formatted_date,
      instructor_user_id: b.instructorId,
      start_hour: toStartHour(b.startTime || b.time),
    };
    const newB = {
      date: a.date || a.formatted_date,
      instructor_user_id: a.instructorId,
      start_hour: toStartHour(a.startTime || a.time),
    };
    await updateBooking(a.id, newA);
    await updateBooking(b.id, newB);
  };

  // dnd-kit handlers
  const handleDragOver = ({ active, over }) => {
    if (!active || !over) return;
    const overId = over.id?.toString();
    if (overId?.startsWith('day:')) {
      setDragOverDay(over.data?.current?.dateStr || null);
      return;
    }
    if (overId?.startsWith('booking:')) {
      setDragOverDay(null);
    }
  };

  const trySwapBookings = async (a, b) => {
    if (!b || a.id === b.id) return false;
    const ok = window.confirm('Swap these two bookings?');
    if (!ok) return false;
    await performSwap(a, b);
    showSuccess('Bookings swapped');
    return true;
  };

  const isDayTarget = (id) => id?.startsWith('day:');
  const isBookingTarget = (id) => id?.startsWith('booking:');

  const handleDragEnd = async ({ active, over }) => {
    setDragOverDay(null);
    if (!active || !over) return;
    const a = active.data?.current?.booking;
    if (!a) return;
    const overId = over.id?.toString();
    try {
      if (isDayTarget(overId)) {
        const dateStr = over.data?.current?.dateStr;
        // Instead of directly moving the booking, hold it and open DailyView overlay
        setHeldBooking(a);
        setTargetDate(dateStr);
        setSelectedDate(new Date(dateStr)); // Set the calendar context date for DailyView
        setShowDailyViewOverlay(true);
        return;
      }
      if (isBookingTarget(overId)) {
        const b = over.data?.current?.booking;
        await trySwapBookings(a, b);
      }
    } catch (err) {
      showError(err.message || 'Drag action failed');
    }
  };

  // Handle overlay close - reset held booking state
  const handleOverlayClose = () => {
    setHeldBooking(null);
    setTargetDate(null);
    setShowDailyViewOverlay(false);
  };

  // Handle successful booking placement in DailyView
  const handleBookingPlaced = async () => {
    // Close the overlay and reset state
    handleOverlayClose();
    showSuccess('Booking moved successfully');
  };
  // Generate time slots from API data or use defaults

  // Get days of the current week
  const weekDays = useMemo(() => {
    const days = [];
    const firstDayOfWeek = calendarConfig.ui.firstDayOfWeek || 1; // 1 = Monday (default)
    const start = startOfWeek(selectedDate, { weekStartsOn: firstDayOfWeek });
    
    // Create array of 9 consecutive days (3x3 grid)
    for (let i = 0; i < 9; i++) {
      const currentDay = addDays(start, i);
      const dayStr = format(currentDay, 'yyyy-MM-dd');
      
      days.push({
        date: currentDay,
        dateStr: dayStr,
        isCurrentMonth: isSameMonth(currentDay, selectedDate),
        isToday: isSameDay(currentDay, new Date()),
        dayName: format(currentDay, 'EEE'),
        dayNumber: format(currentDay, 'd')
      });
    }
    
    return days;
  }, [selectedDate]);
  
  // Get filtered bookings
  const filteredBookings = useMemo(() => {
    let filtered = [...bookings];
    
    // Filter by instructor if any selected
    if (selectedInstructors.length > 0) {
      filtered = filtered.filter(booking => 
        selectedInstructors.includes(booking.instructorId)
      );
    }
    
    // Filter by service if any selected
    if (selectedServices.length > 0) {
      filtered = filtered.filter(booking => 
        selectedServices.includes(booking.serviceId)
      );
    }
    
    return filtered;
  }, [bookings, selectedInstructors, selectedServices]);
  
  // Get bookings for a specific day
  const getBookingsForDay = (dayStr) => {
    const dayBookings = filteredBookings.filter(booking => booking.date === dayStr);
    
    // Remove duplicates by booking ID (critical bug fix)
    const uniqueBookings = Array.from(
      new Map(dayBookings.map(b => [b.id, b])).values()
    );
    
    return uniqueBookings;
  };

  // (Removed obsolete slot helpers to keep file focused)
  
  // Handle day click - open DailyView modal for the selected date
  const handleDayClick = (day, event) => {
    // Prevent event bubbling if clicked on a booking
    if (event && event.target.closest('.booking-card, [data-booking-id]')) {
      return;
    }
    // Do NOT change global selectedDate so the date navigator stays anchored
    setTargetDate(day.dateStr);
    setShowDailyViewOverlay(true);
  };

  // Handle booking click
  const handleBookingClick = (booking, event) => {
    event.stopPropagation();
    if (onBookingClick) {
      onBookingClick(booking);
    }
  };

  // Deprecated: using booking-card-* classes for consistency

  const getFullTimeRange = (booking) => {
    const start = booking.startTime || booking.time || '';
    const end = booking.endTime || '';
    if (start && end) return `${start} - ${end}`;
    return start || end || '';
  };

  const getParticipantFullNames = (booking) => {
    if (Array.isArray(booking.participants) && booking.participants.length > 0) {
      return booking.participants
        .map((p) => p?.userName || p?.name)
        .filter(Boolean);
    }
    const single = booking.userName || booking.studentName;
    return single ? [single] : ['Participant'];
  };

  return (
    <div className="week-view bg-white rounded-lg shadow-sm">
      <CalendarDndProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div ref={gridRef} className="grid grid-cols-3 relative">
          {weekDays.map((day) => {
            const dayBookings = getBookingsForDay(day.dateStr).sort((a, b) => (a.startTime || a.time || '00:00').localeCompare(b.startTime || b.time || '00:00'));
            const maxVisible = 6;
            const visible = dayBookings.slice(0, maxVisible);
            return (
              <div
                key={day.dateStr}
                className={`month-day relative min-h-[120px] border-r border-b border-gray-100 p-1 cursor-pointer transition-all duration-200 hover:bg-gray-50 ${day.isToday ? 'bg-blue-50 ring-2 ring-blue-200' : ''} ${!day.isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'text-gray-900'}`}
                ref={(el) => { dayRefs.current[day.dateStr] = el; }}
                onClick={(event) => handleDayClick(day, event)}
                role="button"
                tabIndex={0}
                aria-label={`${format(day.date, 'EEEE, MMMM d, yyyy')} - ${dayBookings.length} bookings`}
              >
                <DayDropZone dateStr={day.dateStr} className="absolute inset-0" />
                {dragOverDay === day.dateStr && (
                  <div className="absolute inset-0 ring-2 ring-blue-400 rounded-md pointer-events-none" />
                )}
                <div className="month-day-header absolute top-1 left-1 flex items-baseline gap-1">
                  <span className={`day-number text-xs md:text-sm font-medium ${day.isToday ? 'text-blue-600 font-bold' : ''}`}>{day.dayNumber}</span>
                  <span className="text-[10px] md:text-xs text-gray-500">{day.dayName}</span>
                </div>
                <div className="month-day-content pt-5">
                  <div className="space-y-1 px-0">
                    {visible.map((booking) => {
                      const statusClass = getBookingStatusClass(booking.status, booking.checkInStatus);
                      const participantNames = getParticipantFullNames(booking);
                      const shownNames = participantNames.slice(0, 2);
                      const extraCount = Math.max(0, participantNames.length - shownNames.length);
                      const timeText = getFullTimeRange(booking).replace(/\s*-\s*/, '-');
                      const instructorText = booking.instructorName;
                      const tooltip = getGroupBookingTooltip(booking);
                      const isHeld = heldBooking && heldBooking.id === booking.id;
                      return (
                        <DraggableBooking booking={booking} key={`${day.dateStr}-${booking.id}`} className="w-full">
                          <div
                            className={`relative block w-full min-w-0 items-center gap-2 px-1.5 md:px-2 py-1 rounded-sm cursor-pointer ${statusClass} ${isHeld ? 'opacity-50 ring-2 ring-orange-400 ring-dashed' : ''}`}
                            onClick={(e) => handleBookingClick(booking, e)}
                            title={isHeld ? 'This booking is being moved...' : tooltip}
                          >
                            {isHeld && (
                              <div className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs px-1 py-0.5 rounded-full text-[10px] font-bold">
                                HELD
                              </div>
                            )}
                            <div className="relative z-[1] min-w-0">
                              <div className="min-w-0">
                                {shownNames.map((n, idx) => (
                                  <div key={`${booking.id}-name-${idx}`} className="text-[11px] text-gray-900 leading-tight tracking-wide truncate min-w-0 max-w-full">
                                    {n}
                                  </div>
                                ))}
                                {extraCount > 0 && (
                                  <div className="text-[11px] text-gray-500 leading-tight">+{extraCount} more</div>
                                )}
                                {timeText && (
                                  <div className="text-[11px] text-gray-700 leading-tight">{timeText}</div>
                                )}
                                {instructorText && (
                                  <div className="text-[11px] text-gray-600 leading-tight truncate min-w-0 max-w-full">{instructorText}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </DraggableBooking>
                      );
                    })}
                    
                    {/* Always add one empty row for new bookings */}
                    <div 
                      className="relative block w-full min-w-0 px-1.5 md:px-2 py-2 rounded-sm cursor-pointer hover:bg-gray-50 transition-all duration-200"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDayClick(day, event);
                      }}
                      title="Click to add a new booking"
                    >
                      {/* Empty slot - invisible but clickable */}
                      <div className="h-4" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CalendarDndProvider>

      {/* DailyView Overlay for precise booking placement or new booking creation */}
      {showDailyViewOverlay && targetDate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden mx-4">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {heldBooking ? 'Place booking' : 'Create new booking'} on {format(new Date(targetDate), 'EEEE, MMMM d, yyyy')}
                </h2>
                {heldBooking ? (
                  <>
                    <p className="text-sm text-gray-600 mt-1">
                      Booking: {heldBooking.studentName || heldBooking.userName || 'Booking'} 
                      {heldBooking.serviceName && ` - ${heldBooking.serviceName}`}
                    </p>
                    <p className="text-xs text-orange-600 mt-1">
                      💡 Click on a time slot below to place the booking, or close to cancel
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-600 mt-1">
                    💡 Click on a time slot below to create a new booking
                  </p>
                )}
              </div>
              <button 
                onClick={handleOverlayClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close overlay"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Held booking display - only show if there's a held booking */}
            {heldBooking && (
              <div className="p-3 bg-yellow-50 border-b border-yellow-200">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-yellow-800">
                    📌 Held Booking:
                  </div>
                  <div className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded-full text-sm font-medium">
                    {heldBooking.studentName || heldBooking.userName || 'Booking'} 
                    {heldBooking.startTime && ` at ${heldBooking.startTime}`}
                    {heldBooking.serviceName && ` - ${heldBooking.serviceName}`}
                  </div>
                </div>
              </div>
            )}
            
            <div className="overflow-y-auto max-h-[calc(90vh-160px)]">
              <DailyView 
                displayDate={targetDate}
                onTimeSlotClick={async (timeSlot) => {
                  try {
                    if (heldBooking && timeSlot) {
                      // Handle placing held booking
                      // Convert startTime (like "09:00") to start_hour (like 9.0)
                      let startHour;
                      if (timeSlot.startTime) {
                        const [hours, minutes] = timeSlot.startTime.split(':').map(Number);
                        startHour = hours + (minutes / 60);
                      } else if (timeSlot.hour !== undefined) {
                        startHour = timeSlot.hour;
                      } else {
                        // Fallback
                        startHour = 9.0;
                      }

                      // Move the held booking to the selected time slot
                      await updateBooking(heldBooking.id, {
                        date: targetDate,
                        instructor_user_id: timeSlot.instructorId || heldBooking.instructorId,
                        start_hour: startHour,
                      });
                      handleBookingPlaced();
                    } else if (!heldBooking && timeSlot) {
                      // Handle creating new booking
                      // Close the overlay and trigger booking creation with the selected time slot
                      handleOverlayClose();
                      
                      // Call the onTimeSlotClick prop if provided (for parent component to handle booking creation)
                      if (onTimeSlotClick) {
                        onTimeSlotClick({
                          ...timeSlot,
                          date: targetDate
                        });
                      } else {
                        showSuccess('Time slot selected! Please implement booking creation.');
                      }
                    }
                  } catch (err) {
                    showError(err.message || 'Failed to handle time slot selection');
                  }
                }}
                onBookingClick={onBookingClick}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeekView;
