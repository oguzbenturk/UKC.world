import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useCalendar } from '../../contexts/CalendarContext';
import LoadingIndicator from '@/shared/components/ui/LoadingIndicator';
import ErrorIndicator from '@/shared/components/ui/ErrorIndicator';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isToday 
} from 'date-fns';
import calendarConfig from '@/config/calendarConfig';
import { formatParticipantNamesCompact, getGroupBookingTooltip } from '@/features/bookings/utils/groupBookingUtils';
import '../../styles/bookingCalendar.css';
import { useToast } from '@/shared/contexts/ToastContext';
import CalendarDndProvider from '../dnd/CalendarDndProvider';
import { DraggableBooking } from '../dnd/DraggableBooking';
import { DayDropZone } from '../dnd/DayDropZone';

/**
 * Modern month view calendar component with enhanced functionality
 * @param {Object} props - Component props
 * @param {Function} props.onTimeSlotClick - Callback when a time slot is clicked
 * @param {Function} props.onBookingClick - Callback when a booking is clicked
 * @returns {JSX.Element} MonthView component
 */
const MonthView = ({ onBookingClick }) => {
  const { 
    selectedDate, 
    bookings,
    selectedInstructors,
    selectedServices,
    setSelectedDate,
    isLoading,
    error,
    retry,
    updateBooking,
    checkBookingConflicts
  } = useCalendar();
  
  const { showSuccess, showError } = useToast();

  // DnD helpers for month view
  const [dragOverDay, setDragOverDay] = useState(null);
  // Track expanded day (overlay panel)
  const [expandedDay, setExpandedDay] = useState(null); // dateStr
  const [overlayStyle, setOverlayStyle] = useState(null);
  const gridRef = useRef(null);
  const dayRefs = useRef({});
  const overlayRef = useRef(null);
  const justClosedRef = useRef(false);
  // Responsive check for mobile to adjust max visible rows
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Instructor color system removed; month dots use a neutral color.

  const toStartHour = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h + m / 60;
  };

  const performMove = async (booking, targetDateStr) => {
    const startTime = booking.startTime || booking.time;
    const startHour = toStartHour(startTime);
    if (startHour == null) throw new Error('Invalid start time');
    await updateBooking(booking.id, {
      date: targetDateStr,
      instructor_user_id: booking.instructorId,
      start_hour: startHour,
    });
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
  // Get calendar days for the month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const firstDayOfWeek = calendarConfig.ui.firstDayOfWeek || 1; // 1 = Monday (default)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: firstDayOfWeek });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: firstDayOfWeek });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd }).map(date => ({
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      isCurrentMonth: isSameMonth(date, selectedDate),
      isToday: isToday(date),
      dayNumber: format(date, 'd'),
      dayName: format(date, 'EEE')
    }));
  }, [selectedDate]);
  // Filter bookings based on selected filters
  const filteredBookings = useMemo(() => {
    let filtered = [...bookings];
    
    // Filter by instructor if any selected
    if (selectedInstructors.length > 0) {
      filtered = filtered.filter(booking => 
        selectedInstructors.includes(booking.instructorId || booking.instructor_user_id)
      );
    }
    
    // Filter by service if any selected
    if (selectedServices.length > 0) {
      filtered = filtered.filter(booking => 
        selectedServices.includes(booking.serviceId || booking.service_id)
      );
    }
    
    return filtered;
  }, [bookings, selectedInstructors, selectedServices]);  // Get bookings for a specific day (optimized without excessive logging)
  const getBookingsForDay = useCallback((dayStr) => {
    // Normalize date format: convert both to YYYY-MM-DD format
    const normalizedDayStr = dayStr.includes('T') ? dayStr.split('T')[0] : dayStr;
    
    const matchingBookings = filteredBookings.filter(booking => {
      // Handle different possible date formats in bookings
      let bookingDate;
      
      if (booking.date) {
        if (typeof booking.date === 'string') {
          bookingDate = booking.date.includes('T') ? booking.date.split('T')[0] : booking.date;
        } else if (booking.date instanceof Date) {
          bookingDate = booking.date.toISOString().split('T')[0];
        }
      } else if (booking.formatted_date) {
        bookingDate = booking.formatted_date;
      }
      
      // If we have dates in both formats, compare them
      if (bookingDate && normalizedDayStr) {
        return bookingDate === normalizedDayStr;
      }
      return false;
    });
    
    // Remove duplicates by booking ID (critical bug fix)
    const uniqueBookings = Array.from(
      new Map(matchingBookings.map(b => [b.id, b])).values()
    );
    
    return uniqueBookings;
  }, [filteredBookings]);

  // Get booking summary for a day
  const getDaySummary = (dayStr) => {
    const dayBookings = getBookingsForDay(dayStr);
    const totalBookings = dayBookings.length;
    const confirmedBookings = dayBookings.filter(b => b.status === 'confirmed').length;
    const checkedInBookings = dayBookings.filter(b => b.checkInStatus === 'checked-in').length;
    
    // Calculate total available slots per day based on operating hours
    const operatingHours = calendarConfig.operatingHours.end - calendarConfig.operatingHours.start;
    const totalSlots = operatingHours; // 1-hour slots from start to end
    const availableSlots = Math.max(0, totalSlots - totalBookings);
    
    return {
      total: totalBookings,
      confirmed: confirmedBookings,
      checkedIn: checkedInBookings,
      available: availableSlots,
      totalSlots: totalSlots,
      bookings: dayBookings
    };
  };

  // Handle day click
  const handleDayClick = (day) => {
    // Desktop/tablet: no overlay; simply select the day
    if (!isMobile) {
      setSelectedDate(day.date);
      return;
    }
    if (justClosedRef.current) {
      justClosedRef.current = false;
      return;
    }
    setSelectedDate(day.date);
    if (expandedDay && expandedDay !== day.dateStr) {
      setExpandedDay(null);
      return;
    }
    toggleDayExpanded(day.dateStr);
  };
  
  const calcOverlay = (dateStr) => {
    const gridEl = gridRef.current;
    const cellEl = dayRefs.current[dateStr];
    if (!gridEl || !cellEl) return null;
    const gridRect = gridEl.getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();
    const colWidth = cellRect.width;
    const desiredCols = 4; // ~4x wider
    const gridWidth = gridRect.width;
  const width = Math.min(gridWidth, colWidth * desiredCols);
    let left = cellRect.left - gridRect.left;
    // Ensure overlay fits within grid horizontally
    if (left + width > gridWidth) left = Math.max(0, gridWidth - width);
    const top = cellRect.top - gridRect.top;
    return { left, top, width };
  };

  const toggleDayExpanded = (dateStr) => {
    setExpandedDay((prev) => {
      const next = prev === dateStr ? null : dateStr;
      // compute style when expanding
      setTimeout(() => {
        if (next) setOverlayStyle(calcOverlay(next)); else setOverlayStyle(null);
      }, 0);
      return next;
    });
  };

  const openDayExpanded = (dateStr) => {
    // Always open the overlay for the given day; do not toggle off
    setExpandedDay(dateStr);
    setTimeout(() => {
      setOverlayStyle(calcOverlay(dateStr));
    }, 0);
  };

  useEffect(() => {
    const onResize = () => {
      if (expandedDay) setOverlayStyle(calcOverlay(expandedDay));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expandedDay]);

  useEffect(() => {
    if (!expandedDay) return;
    const onDocClick = (e) => {
      if (!overlayRef.current) return;
      if (!overlayRef.current.contains(e.target)) {
        setExpandedDay(null);
        // Prevent the same click from opening another popup
        justClosedRef.current = true;
        setTimeout(() => { justClosedRef.current = false; }, 0);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setExpandedDay(null);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [expandedDay]);

  // Handle booking click
  const handleBookingClick = (booking, event) => {
    event.stopPropagation();
    if (onBookingClick) {
      onBookingClick(booking);
    }
  };

  // Get status color based on booking status
  // Removed legacy status color block styling in favor of dot + text rows

  // Dot color now derived in getPillClasses; legacy helper removed

  // Using formatBookingTimeRangeDot for time rendering

  // Show loading indicator
  if (isLoading) {
    return <LoadingIndicator message="Loading calendar data..." />;
  }

  // Show error indicator
  if (error) {
    return <ErrorIndicator message={error} onRetry={retry} />;
  }

  // dnd-kit handlers
  const handleDragOver = ({ active, over }) => {
    if (!active || !over) {
      setDragOverDay(null);
      return;
    }
    const overId = over.id ? String(over.id) : '';
    if (overId.startsWith('day:')) {
      setDragOverDay(over.data?.current?.dateStr || null);
    } else {
      setDragOverDay(null);
    }
  };

  const tryMoveToDay = async (booking, dateStr) => {
    if (!dateStr) return false;
    if (checkBookingConflicts) {
      const res = await checkBookingConflicts({
        date: dateStr,
        time: booking.startTime || booking.time,
        duration: parseFloat(booking.duration) || 1,
        instructorId: booking.instructorId,
      });
      if (res?.hasConflict) {
        const conflictsExclSelf = (res.conflicts || []).filter(c => c.id !== booking.id);
        if (conflictsExclSelf.length > 0) {
          showError(res?.conflictDetails?.message || 'This move would overlap another booking.');
          return false;
        }
      }
    }
    await performMove(booking, dateStr);
    showSuccess('Booking moved');
    return true;
  };

  const trySwapBookings = async (a, b) => {
    if (!b || a.id === b.id) return false;
    const ok = window.confirm('Swap these two bookings?');
    if (!ok) return false;
    await performSwap(a, b);
    showSuccess('Bookings swapped');
    return true;
  };

  const getFullTimeRange = (booking) => {
    const start = booking.startTime || booking.time || '';
    const end = booking.endTime || '';
    if (start && end) return `${start} - ${end}`;
    return start || end || '';
  };

  const handleDragEnd = async ({ active, over }) => {
    setDragOverDay(null);
    if (!active || !over) return;
    const a = active.data?.current?.booking;
    if (!a) return;
    const overId = over.id ? String(over.id) : '';
    try {
      if (overId.startsWith('day:')) {
        await tryMoveToDay(a, over.data?.current?.dateStr);
      } else if (overId.startsWith('booking:')) {
        await trySwapBookings(a, over.data?.current?.booking);
      }
    } catch (err) {
      showError(err.message || 'Drag action failed');
    }
  };

  return (
    <div className="month-view bg-white rounded-lg shadow-sm">
      <CalendarDndProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      {/* Month grid header with day names */}
      <div className="month-grid-header grid grid-cols-7 border-b border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="month-day-name p-3 text-center text-sm font-medium text-gray-600 bg-gray-50">
            {day}
          </div>
        ))}
      </div>
      
      {/* Month grid with calendar days */}
  <div ref={gridRef} className="month-grid grid grid-cols-7 relative">
    {calendarDays.map((day) => {
          const summary = getDaySummary(day.dateStr);
          const maxVisible = isMobile ? 4 : 6;
          
          return (
            <div 
      key={day.dateStr}
              className={`
                month-day relative min-h-[120px] border-r border-b border-gray-100 p-1 cursor-pointer
                transition-all duration-200 hover:bg-gray-50
                ${day.isToday ? 'bg-blue-50 ring-2 ring-blue-200' : ''}
                ${!day.isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'text-gray-900'}
              `}
              ref={(el) => { dayRefs.current[day.dateStr] = el; }}
              onClick={() => handleDayClick(day)}
              role="button"
              tabIndex="0"
              aria-label={`${format(day.date, 'EEEE, MMMM d, yyyy')} - ${summary.available} available slots`}
            >
      <DayDropZone dateStr={day.dateStr} className="absolute inset-0" />
              {dragOverDay === day.dateStr && (
                <div className="absolute inset-0 ring-2 ring-blue-400 rounded-md pointer-events-none" />
              )}
              {/* Day header (absolute top-left to free width) */}
              <div className="month-day-header absolute top-1 left-1">
                <span className={`day-number text-xs md:text-sm font-medium ${day.isToday ? 'text-blue-600 font-bold' : ''}`}>
                  {day.dayNumber}
                </span>
              </div>
              
              {/* Day content */}
              <div className="month-day-content pt-5">
                {day.isCurrentMonth ? (
                  <div className="space-y-1 px-0">
                    {/* Apple-like compact rows */}
                    {(() => {
                      const dayBookings = summary.bookings
                        .sort((a, b) => (a.startTime || a.time || '00:00').localeCompare(b.startTime || b.time || '00:00'));
                      const visible = dayBookings.slice(0, maxVisible);
                      const overflow = Math.max(0, dayBookings.length - visible.length);

                      const getStatusClass = (booking) => {
                        if (booking.checkInStatus === 'checked-in') return 'booking-card-checked-in';
                        switch (booking.status) {
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

                      return (
                        <>
                          {visible.map((booking) => {
                            const nameOnly = formatParticipantNamesCompact(booking);
                            const timeText = getFullTimeRange(booking);
                            const instructorText = booking.instructorName;
                            const statusClass = getStatusClass(booking);
                            const tooltipText = getGroupBookingTooltip(booking);
                            return (
                              <DraggableBooking booking={booking} key={booking.id} className="w-full">
                                  <div
                                  className={`relative block w-full min-w-0 items-center gap-2 px-1.5 md:px-2 py-1 rounded-sm cursor-pointer ${statusClass}`}
                                  onClick={(e) => {
                                    if (isMobile) {
                                      e.stopPropagation();
                                      openDayExpanded(day.dateStr);
                                    } else {
                                      handleBookingClick(booking, e);
                                    }
                                  }}
                                  title={tooltipText}
                                >
                                  <div className="relative z-[1] min-w-0">
                                    {isMobile ? (
                                      <span className={'text-[10px] md:text-[11px] text-gray-900 leading-tight tracking-wide truncate min-w-0 max-w-full'}>
                                        {nameOnly}
                                      </span>
                                    ) : (
                                      <div className="min-w-0">
                                        <div className="text-[11px] text-gray-900 leading-tight tracking-wide truncate min-w-0 max-w-full">{nameOnly}</div>
                                        {timeText && (
                                          <div className="text-[11px] text-gray-700 leading-tight">{timeText}</div>
                                        )}
                                        {instructorText && (
                                          <div className="text-[11px] text-gray-600 leading-tight">{instructorText}</div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </DraggableBooking>
                            );
                          })}
                          {overflow > 0 && isMobile && (
                            <button
                              type="button"
                              className="w-full text-[11px] text-blue-600 hover:text-blue-700 text-left px-1 py-0.5"
                              onClick={(e) => { e.stopPropagation(); openDayExpanded(day.dateStr); }}
                            >
                              +{overflow} more
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  // Different month days
                  <div className="text-xs text-gray-400">
                    {/* Show minimal info for different month */}
                  </div>
                )}
              </div>
            </div>
          );
        })}
  </div>
  {/* Expanded overlay panel */}
  {isMobile && expandedDay && overlayStyle && (
    <div className="absolute z-50" style={{ left: overlayStyle.left, top: overlayStyle.top, width: overlayStyle.width }}>
      <div ref={overlayRef} className="bg-white border border-blue-200 shadow-xl rounded-md p-2 md:p-3" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-700">{format(new Date(expandedDay), 'EEEE, MMM d')}</div>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-xs text-blue-600 hover:text-blue-700" onClick={() => setExpandedDay(null)}>Close</button>
          </div>
        </div>
        <div className="space-y-1 max-h-[50vh] overflow-auto pr-1">
          {getDaySummary(expandedDay).bookings
            .sort((a, b) => (a.startTime || a.time || '00:00').localeCompare(b.startTime || b.time || '00:00'))
            .map((booking) => {
              const nameText = formatParticipantNamesCompact(booking);
              const timeText = getFullTimeRange(booking);
              const tooltipText = getGroupBookingTooltip(booking);
              const statusClass = (() => {
                if (booking.checkInStatus === 'checked-in') return 'booking-card-checked-in';
                switch (booking.status) {
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
              })();
              return (
                <DraggableBooking booking={booking} key={`expanded-${booking.id}`} className="w-full">
                  <div
                    className={`relative w-full flex items-start gap-2 px-2 py-1 rounded-md cursor-pointer ${statusClass}`}
                    onClick={(e) => handleBookingClick(booking, e)}
                    title={tooltipText}
                  >
                    <div className="relative z-[1] flex-1 whitespace-normal break-words">
                      <div className="text-[11px] text-gray-900 tracking-wide leading-tight">{nameText}</div>
                      {timeText && (
                        <div className="text-[11px] text-gray-700 leading-tight">{timeText}</div>
                      )}
                      {booking.instructorName && (
                        <div className="text-[11px] text-gray-600 leading-tight">{booking.instructorName}</div>
                      )}
                    </div>
                  </div>
                </DraggableBooking>
              );
            })}
        </div>
      </div>
    </div>
  )}
  </CalendarDndProvider>
    </div>
  );
};

export default MonthView;
