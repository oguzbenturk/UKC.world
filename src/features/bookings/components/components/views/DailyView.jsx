import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useCalendar } from '../../contexts/CalendarContext';
import LoadingIndicator from '@/shared/components/ui/LoadingIndicator';
import ErrorIndicator from '@/shared/components/ui/ErrorIndicator';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { Modal } from 'antd';
import { formatParticipantNames, getGroupBookingTooltip } from '@/features/bookings/utils/groupBookingUtils';
import { logger } from '@/shared/utils/logger';
import '../../styles/bookingCalendar.css';
import CalendarDndProvider from '../dnd/CalendarDndProvider';
import { DraggableBooking } from '../dnd/DraggableBooking';
import { SlotDropZone } from '../dnd/SlotDropZone';
import { useToast } from '@/shared/contexts/ToastContext';
import { useForecast } from '@/features/forecast/hooks/useForecast';


// Helper function to format time for display
const formatTime = (timeString) => {
  if (!timeString || typeof timeString !== 'string') return '';
  
  try {
    // Handle different formats
    const parts = timeString.trim().split(':');
    
    // Handle formats like "9" (just hour)
    if (parts.length === 1) {
      const hourNum = parseInt(parts[0], 10);
      if (isNaN(hourNum)) return '';
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const hour12 = hourNum % 12 || 12;
      // Format as "9 AM" - no leading zero
      return `${hour12} ${ampm}`;
    }
    
    // Standard HH:MM or HH:MM:SS format
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    
    if (isNaN(hour) || isNaN(minute)) return timeString; // Return original if parsing fails
    
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    // Format as "9 AM" or "9:30 AM" - no leading zero
    return `${hour12}${minute !== 0 ? `:${minute.toString().padStart(2, '0')}` : ''} ${ampm}`;
  } catch (e) {
  logger.warn('Time formatting error', { error: e, timeString });
    return timeString; // Return original on error
  }
};

// Check if time is valid (not corrupted like '90:02')
const isValidTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return false;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return !isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
};

// Helper to get status-based class for booking cards
const getBookingStatusClass = (status) => {
  switch (status) {
    case 'confirmed':
    case 'pending':
      return 'booking-card-pending';
    case 'checked-in':
      return 'booking-card-checked-in';
    case 'completed':
      return 'booking-card-completed';
    case 'cancelled':
      return 'booking-card-cancelled';
    default:
      return 'booking-card-default';
  }
};

// Add wind helpers
const _getWindClasses = (kn) => {
  if (kn == null) return 'bg-slate-100 text-slate-600';
  if (kn < 8) return 'bg-sky-100 text-sky-700';
  if (kn < 12) return 'bg-green-100 text-green-700';
  if (kn < 16) return 'bg-lime-100 text-lime-700';
  if (kn < 20) return 'bg-yellow-100 text-yellow-800';
  if (kn < 25) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

// Solid wind colors for Windguru-style display (darker backgrounds for white text)
const getWindSolidClasses = (kn) => {
  if (kn == null) return 'bg-slate-500';
  if (kn < 8) return 'bg-sky-500';
  if (kn < 12) return 'bg-green-500';
  if (kn < 16) return 'bg-lime-500';
  if (kn < 20) return 'bg-yellow-500';
  if (kn < 25) return 'bg-orange-500';
  return 'bg-red-500';
};

// Consistent wind arrow using SVG rotated by degrees
const WindArrow = ({ deg = 0, size = 12, className = '' }) => {
  // Most APIs provide direction as the direction FROM which wind is blowing (meteorological).
  // We visualize the direction the wind is GOING TO, so rotate by +180°.
  const flowDeg = ((Number(deg) || 0) + 180) % 360;
  const box = size;
  return (
    <svg
      width={box}
      height={box}
      viewBox="0 0 24 24"
      className={className}
      style={{ transform: `rotate(${flowDeg}deg)` }}
      aria-label={`Wind direction ${Math.round(flowDeg)}°`}
    >
      {/* Simple arrow pointing up by default */}
      <g fill="currentColor">
        <path d="M12 2l4.5 6h-3v8h-3V8h-3L12 2z" />
      </g>
    </svg>
  );
};

// ---- Forecast helpers ----
const extractDayTemperature = (data) => {
  if (!data) return null;
  if ('temperature' in data) return data.temperature;
  if ('tempC' in data) return data.tempC;
  const hrs = data.hours || {};
  const pick = (key) => {
    const hd = hrs[key];
    return hd == null ? undefined : (hd.tempC ?? hd.temperature ?? hd.temp);
  };
  const prefer = ['12:00', '13:00', '14:00'];
  for (let i = 0; i < prefer.length; i++) {
    const val = pick(prefer[i]);
    if (val !== undefined) return val;
  }
  const keys = Object.keys(hrs);
  for (let i = 0; i < keys.length; i++) {
    const val = pick(keys[i]);
    if (val !== undefined) return val;
  }
  return null;
};

// ---- Swap helpers ----
const nameOfInstructor = (instructors, id) => instructors.find(i => String(i.id) === String(id))?.name || 'instructor';
const numToTime = (num) => {
  const h = Math.floor(Number(num) || 0);
  const m = Math.round(((Number(num) || 0) - h) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
};

const handleSwapError409 = (err, instructors, aNew, bNew, showError) => {
  const data = err?.response?.data || {};
  if (data?.side && data?.target) {
    const side = data.side;
    const instrId = data.target.instructor_user_id;
    const instrName = nameOfInstructor(instructors, instrId);
    const t = data.target.start_hour != null ? numToTime(data.target.start_hour) : (side === 'A' ? aNew.timeStart : bNew.timeStart);
    showError(`[409] Swap conflict (${side}): ${instrName} ${t} is blocked by another booking.`);
  } else {
    const aName = nameOfInstructor(instructors, aNew.instructorId);
    const bName = nameOfInstructor(instructors, bNew.instructorId);
    showError(`[409] Swap conflict: ${aName} ${aNew.timeStart} or ${bName} ${bNew.timeStart} is occupied.`);
  }
};

const precheckTargetsSwap = async ({
  findBookingAt,
  checkConflictAt,
  instructors,
  showError,
  aNew,
  bNew,
  aId,
  bId,
  durA,
  durB,
}) => {
  const isOccupiedByOther = (occ, allowedId) => occ && String(occ.id) !== String(allowedId);
  const occA = findBookingAt(aNew.instructorId, aNew.timeStart);
  if (isOccupiedByOther(occA, bId)) {
    showError(`Cannot move to ${aNew.timeStart} (${nameOfInstructor(instructors, aNew.instructorId)}) — target slot is occupied.`);
    return false;
  }
  const occB = findBookingAt(bNew.instructorId, bNew.timeStart);
  if (isOccupiedByOther(occB, aId)) {
    showError(`Cannot move to ${bNew.timeStart} (${nameOfInstructor(instructors, bNew.instructorId)}) — target slot is occupied.`);
    return false;
  }
  const aConflict = await checkConflictAt(aNew.instructorId, aNew.timeStart, { id: aId, duration: durA }, [bId]);
  if (aConflict) {
    showError(aConflict?.conflictDetails?.message || `Cannot move to ${aNew.timeStart} (${nameOfInstructor(instructors, aNew.instructorId)}) — overlap conflict.`);
    return false;
  }
  const bConflict = await checkConflictAt(bNew.instructorId, bNew.timeStart, { id: bId, duration: durB }, [aId]);
  if (bConflict) {
    showError(bConflict?.conflictDetails?.message || `Cannot move to ${bNew.timeStart} (${nameOfInstructor(instructors, bNew.instructorId)}) — overlap conflict.`);
    return false;
  }
  return true;
};

// ---- Time helpers extracted to reduce complexity ----
const parseAmPmToMinutes = (s) => {
  const sLower = s.toLowerCase();
  const isPM = sLower.includes('pm');
  const cleaned = sLower.replace('am', '').replace('pm', '').trim();
  const [hStr, mStr] = cleaned.split(':');
  let hours = parseInt(hStr, 10);
  const minutes = mStr ? parseInt(mStr, 10) : 0;
  if (isNaN(hours) || isNaN(minutes)) return null;
  if (isPM && hours < 12) hours += 12;
  if (!isPM && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const parse24hToMinutes = (s) => {
  const [hh, mm] = s.split(':');
  if (mm === undefined) {
    const hours = parseInt(hh, 10);
    return isNaN(hours) ? null : hours * 60;
  }
  const hours = parseInt(hh, 10);
  const minutes = parseInt(mm, 10);
  return isNaN(hours) || isNaN(minutes) ? null : hours * 60 + minutes;
};

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  try {
    const s = timeStr.trim();
    const sLower = s.toLowerCase();
    if (sLower.includes('am') || sLower.includes('pm')) return parseAmPmToMinutes(s);
    return parse24hToMinutes(s);
  } catch {
    return null;
  }
};

const parseTimeComponents = (timeStr) => {
  try {
    if (!timeStr || typeof timeStr !== 'string') return { hour: 0, minute: 0 };
    const parts = timeStr.trim().split(':');
    const hour = parseInt(parts[0], 10) || 0;
    const minute = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
    return { hour, minute };
  } catch {
    return { hour: 0, minute: 0 };
  }
};

const calculateEndTime = (startTimeStr, durationMinutes) => {
  const { hour, minute } = parseTimeComponents(startTimeStr);
  const startTotalMinutes = hour * 60 + minute;
  const endTotalMinutes = startTotalMinutes + durationMinutes;
  const endHour = Math.floor(endTotalMinutes / 60);
  const endMinute = endTotalMinutes % 60;
  return `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
};

// ---- Swap orchestration small helpers (extracted to reduce complexity in performSwap) ----
const buildSwapPlan = (a, b, target, selectedDate) => {
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const aOld = { instructorId: a.instructorId, timeStart: a.startTime || a.time };
  const bOld = { instructorId: b.instructorId, timeStart: b.startTime || b.time };
  const aNew = { instructorId: target.instructorId, timeStart: target.timeStart };
  const bNew = { instructorId: aOld.instructorId, timeStart: aOld.timeStart };
  return { dateStr, aOld, bOld, aNew, bNew };
};

const isSameTarget = (aOld, aNew) => aNew.instructorId === aOld.instructorId && aNew.timeStart === aOld.timeStart;

const validateSameDurationOrThrow = (a, b) => {
  const durA = parseFloat(a.duration) || 1;
  const durB = parseFloat(b.duration) || 1;
  if (Math.abs(durA - durB) > 0.001) throw new Error('Swap not allowed: different durations');
  return { durA, durB };
};

const lockPair = (ref, aId, bId) => {
  if (ref.current.has(aId) || ref.current.has(bId)) return false;
  ref.current.add(aId);
  ref.current.add(bId);
  return true;
};

const unlockPair = (ref, aId, bId) => {
  ref.current.delete(aId);
  ref.current.delete(bId);
};

const optimisticApplySwap = (a, b, aNew, bNew, dateStr) => {
  window.dispatchEvent(new CustomEvent('booking-updated', { detail: { booking: { ...a, instructorId: aNew.instructorId, startTime: aNew.timeStart, time: aNew.timeStart, date: dateStr } } }));
  window.dispatchEvent(new CustomEvent('booking-updated', { detail: { booking: { ...b, instructorId: bNew.instructorId, startTime: bNew.timeStart, time: bNew.timeStart, date: dateStr } } }));
};

const rollbackSwap = (aId, bId, aOld, bOld, dateStr) => {
  window.dispatchEvent(new CustomEvent('booking-updated', { detail: { booking: { id: aId, instructorId: aOld.instructorId, startTime: aOld.timeStart, time: aOld.timeStart, date: dateStr } } }));
  window.dispatchEvent(new CustomEvent('booking-updated', { detail: { booking: { id: bId, instructorId: bOld.instructorId, startTime: bOld.timeStart, time: bOld.timeStart, date: dateStr } } }));
};

const toTargetPayload = (obj, toStartHour) => ({ instructor_user_id: obj.instructorId, start_hour: toStartHour(obj.timeStart) });

const handleSwapFailure = (err, instructors, aNew, bNew, showError) => {
  const st = err?.response?.status;
  if (st === 409) {
    handleSwapError409(err, instructors, aNew, bNew, showError);
  } else {
    showError(`[${st ?? 'ERR'}] Failed to swap bookings`);
  }
};

/**
 * DailyView Component (Rewritten for Stability and Clarity)
 * Displays a daily schedule with instructors as columns, inspired by modern calendar UIs.
 */
// eslint-disable-next-line complexity
const DailyView = ({ onTimeSlotClick, onBookingClick, displayDate }) => {
  const {
    selectedDate,
    bookings = [],
    instructors = [],
    selectedInstructors = [],
    setSelectedInstructors,
    selectedServices = [],
    setSelectedServices,
    slots = [], // Add slots data from API
    isLoading = false,
    error = null,
    retry,
    refreshData,
    refreshCounter, // Add refreshCounter to force re-renders
    showFilters,
    setShowFilters,
    updateBooking,
    checkBookingConflicts,
    swapBookings,
  } = useCalendar();

  // If a displayDate is provided (e.g., WeekView overlay), use it for rendering and fetching.
  const effectiveDate = useMemo(() => {
    if (!displayDate) return selectedDate;
    const d = new Date(displayDate);
    return isNaN(d.getTime()) ? selectedDate : d;
  }, [displayDate, selectedDate]);
  const { showSuccess, showError } = useToast();
  const { settings: forecastSettings } = useForecast();

  // Wind state
  const [windByHour, setWindByHour] = useState({});
  
  // Temperature state
  const [dayTemperature, setDayTemperature] = useState(null);

  // Increase slot height slightly to make space for wind badge
  const [slotHeight, setSlotHeight] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 56 : 72));
  useEffect(() => {
    const onResize = () => {
      const h = window.innerWidth < 640 ? 52 : 68;
      setSlotHeight((prev) => (prev === h ? prev : h));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch wind data per selectedDate
  useEffect(() => {
    const controller = new AbortController();
    const fetchWind = async () => {
      try {
        const dateStr = format(effectiveDate, 'yyyy-MM-dd');
        const resp = await fetch(`/api/weather/hourly?date=${dateStr}`, { signal: controller.signal });
        if (!resp.ok) throw new Error('Failed to load weather');
        const data = await resp.json();
        setWindByHour(data.hours || {});
        setDayTemperature(extractDayTemperature(data));
      } catch (e) {
        if (e.name !== 'AbortError') {
          setWindByHour({});
          setDayTemperature(null);
        }
      }
    };
    
    // Only fetch wind data if forecast is enabled
    if (selectedDate && forecastSettings?.showForecast) {
      fetchWind();
    } else {
      setWindByHour({}); // Clear wind data when forecast is disabled
      setDayTemperature(null); // Clear temperature data when forecast is disabled
    }
    
    return () => controller.abort();
  }, [effectiveDate, forecastSettings?.showForecast]);

  // Responsive slot height (tighter on mobile)
  // const [slotHeight, setSlotHeight] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 44 : 60));
  // useEffect(() => {
  //   const onResize = () => {
  //     const h = window.innerWidth < 640 ? 44 : 60;
  //     setSlotHeight((prev) => (prev === h ? prev : h));
  //   };
  //   window.addEventListener('resize', onResize);
  //   return () => window.removeEventListener('resize', onResize);
  // }, []);

  // DnD highlight state
  const [dragOverKey, setDragOverKey] = useState(null); // `slot|{instructorId}|{timeStart}` or `card|{bookingId}`

  // Local state for filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);


  // Filter functions
  const toggleInstructor = (instructorId) => {
    setSelectedInstructors(prevSelected => {      if (prevSelected.includes(instructorId)) {
        return prevSelected.filter(id => id !== instructorId);
      } 
      return [...prevSelected, instructorId];
    });
  };

  // Note: service/status filters can be added back when needed
  const clearAllFilters = () => {
    setSelectedInstructors([]);
    setSelectedServices([]);
    setStatusFilter([]);
    setSearchTerm('');
  };
  
  useEffect(() => {
    const handleToggleFilters = () => setShowFilters(prev => !prev);
    window.addEventListener('toggle-filters', handleToggleFilters);
    return () => window.removeEventListener('toggle-filters', handleToggleFilters);
  }, [setShowFilters]);

  // Get instructor initials for display
  const getInstructorInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  // Enhanced search: filter instructors and services based on search term
  const filteredInstructors = useMemo(() => {
    let filtered = instructors;
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(instructor => 
        instructor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        instructor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        instructor.specialties?.some(specialty => 
          specialty.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }
    
    // Apply instructor selection filter - if any instructors are selected, show only those
    if (selectedInstructors.length > 0) {
      filtered = filtered.filter(instructor => selectedInstructors.includes(instructor.id));
    }
    
    return filtered;
  }, [instructors, searchTerm, selectedInstructors]);

  // Filter instructors for display in the calendar columns
  const displayedInstructors = useMemo(() => {
    // If specific instructors are selected via filters, show only those
    // Otherwise, show the search-filtered list
    if (selectedInstructors.length > 0) {
      return instructors.filter(instructor => selectedInstructors.includes(instructor.id));
    }
    return filteredInstructors;
  }, [instructors, selectedInstructors, filteredInstructors]);

  // const filteredServices = useMemo(() => {
  //   if (!searchTerm) return services;
  //   return services.filter(service => 
  //     service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
  //     service.description?.toLowerCase().includes(searchTerm.toLowerCase())
  //   );
  // }, [services, searchTerm]);

  // Generate time slots from API data or use defaults
  const timeSlots = useMemo(() => {
    // First try to get slots from API data for the effective date (overlay may override selectedDate)
    const selectedDateStr = format(effectiveDate, 'yyyy-MM-dd');
    const daySlots = slots.find(day => day.date === selectedDateStr);
    
    if (daySlots && daySlots.slots && daySlots.slots.length > 0) {
      // Extract unique time slots from API data
      const uniqueTimes = [...new Set(daySlots.slots.map(slot => slot.time))].sort();
      return uniqueTimes.map(time => {
        const [hours, minutes] = time.split(':').map(Number);
        const endHour = hours + 1; // Default 1-hour slots
        const endTime = `${endHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        return { start: time, end: endTime };
      });
    }
    
    // Fallback to default time slots if no API data
    return [
      { start: '08:00', end: '09:00' },
      { start: '09:00', end: '10:00' },
      { start: '10:00', end: '11:00' },
      { start: '11:00', end: '12:00' },
      { start: '12:00', end: '13:00' },
      { start: '13:00', end: '14:00' },
      { start: '14:00', end: '15:00' },
      { start: '15:00', end: '16:00' },
      { start: '16:00', end: '17:00' },
      { start: '17:00', end: '18:00' },
      { start: '18:00', end: '19:00' },
      { start: '19:00', end: '20:00' },
      { start: '20:00', end: '21:00' }
    ];
  }, [slots, effectiveDate]);
  
  // Debug: Log time slots structure
  // Temporarily disabled to reduce console noise
  // if (process.env.NODE_ENV === 'development') {
  //   console.log('Time slots debug:', {
  //     totalSlots: timeSlots.length,
  //     firstSlot: timeSlots[0],
  //     slotAtIndex1: timeSlots[1],
  //     slotAtIndex2: timeSlots[2],
  //     slotAtIndex3: timeSlots[3],
  //     allSlots: timeSlots.map((slot, index) => ({ 
  //       index, 
  //       start: slot.start, 
  //       expectedTopPosition: index * 60  // Updated to match new SLOT_HEIGHT
  //     }))
  //   });
  // }

  const dailyBookings = useMemo(() => {
    if (!effectiveDate || !bookings) return [];
    const dateStr = format(effectiveDate, 'yyyy-MM-dd');
    const normalized = bookings.filter((booking) => {
      // Normalize booking date across possible shapes
      let bDate = booking.date || booking.formatted_date || booking.formattedDate;
      if (bDate instanceof Date) bDate = bDate.toISOString().split('T')[0];
      if (typeof bDate === 'string' && bDate.includes('T')) bDate = bDate.split('T')[0];
      return bDate === dateStr;
    });
    return normalized;
  }, [bookings, effectiveDate]);

  // Track when bookings data changes
  useEffect(() => {
    // Bookings data updated - re-render calendar view
  }, [bookings, refreshCounter, effectiveDate]);

  // Check if a time slot is available for a specific instructor
  const isSlotAvailable = useCallback((timeSlot, instructorId) => {
    const selectedDateStr = format(effectiveDate, 'yyyy-MM-dd');
    const daySlots = slots.find(day => day.date === selectedDateStr);
    
    if (!daySlots || !daySlots.slots) {
      // If no API data, assume slot is available (default behavior)
      return true;
    }
    
    // Find the specific slot for this instructor and time
    const slotData = daySlots.slots.find(slot => 
      slot.time === timeSlot.start && 
      slot.instructorId === instructorId
    );
    
    // Return true if slot exists and is available, false if booked or doesn't exist
    return slotData ? slotData.status === 'available' : true;
  }, [slots, effectiveDate]);

  // Advanced booking position calculator that handles all possible cases
  // eslint-disable-next-line complexity
  const getBookingPosition = useCallback((booking) => {
    // Dynamically determine the day start hour from the actual time slots
    const DAY_START_HOUR = timeSlots.length > 0 ? parseInt(timeSlots[0].start.split(':')[0], 10) : 8;
  const DAY_END_HOUR = 21;  // 21:00 - Calendar end time (9 PM)
  const SLOT_HEIGHT = slotHeight;   // Responsive height for 1-hour slot
  const MIN_HEIGHT = Math.max(24, Math.round(slotHeight * 0.55));    // Minimum booking height
    const PRECISE_PIXEL = 1;  // Adjustment for precise positioning
    const DEFAULT_DURATION = 60; // Default to 1 hour for all bookings
    
    // Debug: Log the determined start hour
    // if (process.env.NODE_ENV === 'development') {
    //   console.log('Dynamic start hour debug:', {
    //     bookingId: booking.id,
    //     firstTimeSlot: timeSlots[0]?.start,
    //     determinedStartHour: DAY_START_HOUR,
    //     originalAssumption: 8
    //   });
    // }
    
    try {
      // STEP 1: Extract and normalize time values
  const startTime = booking.startTime || booking.time;
      let endTime = booking.endTime;
      // Convert duration from hours to minutes (database stores in hours)
      let duration = booking.duration ? parseFloat(booking.duration) * 60 : DEFAULT_DURATION;
      
      // Debug: Log duration conversion
      // if (process.env.NODE_ENV === 'development') {
      //   console.log('Duration conversion debug:', {
      //     bookingId: booking.id,
      //     originalDuration: booking.duration,
      //     originalDurationType: typeof booking.duration,
      //     parsedDuration: parseFloat(booking.duration),
      //     finalDurationInMinutes: duration,
      //     DEFAULT_DURATION: DEFAULT_DURATION
      //   });
      // }

      // Handle empty or invalid times
      if (!startTime || typeof startTime !== 'string') {
  logger.warn('Invalid booking time format', { booking });
        return { top: 0, height: SLOT_HEIGHT };
      }
      
      // Handle invalid endTime (like "NaN:NaN")
      if (endTime && (endTime.includes('NaN') || endTime === 'NaN:NaN')) {
  logger.warn('Invalid endTime detected, will calculate from duration', { endTime });
        endTime = null; // Reset to null so it gets calculated from duration
      }
      
      // STEP 2: Parse time values with multiple format support
      const startTotalMinutes = parseTimeToMinutes(startTime);
      let endTotalMinutes = null;
      
      // Debug: Log time parsing details
      // if (process.env.NODE_ENV === 'development') {
      //   console.log('Time parsing debug:', {
      //     bookingId: booking.id,
      //     originalStartTime: startTime,
      //     parsedStartMinutes: startTotalMinutes,
      //     expectedMinutesFor9AM: 540,
      //     expectedMinutesFor11AM: 660
      //   });
      // }
      
      if (startTotalMinutes === null) {
  logger.warn('Could not parse start time', { startTime, booking });
        return { top: 0, height: SLOT_HEIGHT };
      }
      
      // STEP 3: Calculate end time and duration
      if (endTime) {
  endTotalMinutes = parseTimeToMinutes(endTime);
        if (endTotalMinutes) {
          const calculatedDuration = endTotalMinutes - startTotalMinutes;
          
          // Debug: Log duration recalculation
          // if (process.env.NODE_ENV === 'development') {
          //   console.log('Duration recalculation debug:', {
          //     bookingId: booking.id,
          //     endTime: endTime,
          //     endTotalMinutes: endTotalMinutes,
          //     startTotalMinutes: startTotalMinutes,
          //     calculatedDuration: calculatedDuration,
          //     originalDurationInMinutes: duration
          //   });
          // }
          
          if (calculatedDuration <= 2) {
            logger.warn('Unrealistic duration detected, defaulting to 60 minutes', { startTime, endTime });
            duration = DEFAULT_DURATION;
            endTotalMinutes = startTotalMinutes + duration;
          } else {
            duration = calculatedDuration;
          }
          
          if (duration <= 0) {
            logger.warn('End time earlier than start time, defaulting to 60 minutes');
            duration = DEFAULT_DURATION;
            endTotalMinutes = startTotalMinutes + duration;
          }
        } else {
          endTotalMinutes = startTotalMinutes + duration;
        }
      } else {
        endTotalMinutes = startTotalMinutes + duration;
      }
      
      // STEP 4: Apply business logic constraints
      if (duration < 30) duration = 30;
      
      // STEP 5: Calculate position with precise alignment
      const baseStartMinutes = DAY_START_HOUR * 60;
      let minutesFromStart = startTotalMinutes - baseStartMinutes;
      
      if (minutesFromStart < 0) {
        duration += minutesFromStart;
        minutesFromStart = 0;
      }
      
      const totalCalendarMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
      if (minutesFromStart + duration > totalCalendarMinutes) {
        duration = Math.max(30, totalCalendarMinutes - minutesFromStart);
      }
      
      const pixelsPerMinute = SLOT_HEIGHT / 60;
      const top = minutesFromStart * pixelsPerMinute;
      const height = duration * pixelsPerMinute;
      
      // Debug: Log position calculation details
      // if (process.env.NODE_ENV === 'development') {
      //   console.log('Position calculation debug:', {
      //     bookingId: booking.id,
      //     baseStartMinutes: baseStartMinutes,
      //     startTotalMinutes: startTotalMinutes,
      //     minutesFromStart: minutesFromStart,
      //     duration: duration,
      //     pixelsPerMinute: pixelsPerMinute,
      //     calculatedTop: top,
      //     calculatedHeight: height,
      //     finalTop: Math.max(0, Math.round(top)) + PRECISE_PIXEL,
      //     finalHeight: Math.max(MIN_HEIGHT, Math.round(height)) - (PRECISE_PIXEL * 2)
      //   });
      // }
      
      // STEP 6: Apply visual constraints to ensure visibility
      const result = {
        top: Math.max(0, Math.round(top)) + PRECISE_PIXEL, 
        height: Math.max(MIN_HEIGHT, Math.round(height)) - (PRECISE_PIXEL * 2)
      };
      
      return result;
    } catch (error) {
      logger.error('Error calculating booking position', { error, booking });
      return { top: 0, height: SLOT_HEIGHT };
    }
  }, [timeSlots, slotHeight]);

  const getBookingsForInstructor = useCallback((instructorId) => {
    const instructorBookings = dailyBookings.filter(booking => String(booking.instructorId) === String(instructorId));
    
    // Remove duplicates by booking ID (critical bug fix)
    const uniqueBookings = Array.from(
      new Map(instructorBookings.map(b => [b.id, b])).values()
    );
    
    return uniqueBookings;
  }, [dailyBookings]);

  // Helpers for DnD persistence
  const toStartHour = (timeStr) => {
    if (!timeStr) return null;
    try {
      const [h, m] = String(timeStr).split(':').map((n) => parseInt(n, 10) || 0);
      return h + (m / 60);
    } catch {
      return null;
    }
  };

  const findBookingAt = useCallback((instructorId, timeStart) => {
    return dailyBookings.find(
      (b) => String(b.instructorId) === String(instructorId) && (b.startTime || b.time) === timeStart
    );
  }, [dailyBookings]);

  // Prevent overlapping/duplicate updates while backend is processing
  const inFlightUpdatesRef = useRef(new Set());

  const performMove = useCallback(async (booking, target) => {
    logger.debug('DailyView.performMove start', { id: booking?.id, to: target });
    if (inFlightUpdatesRef.current.has(booking.id)) return; // de-dupe rapid drops
    inFlightUpdatesRef.current.add(booking.id);
    const original = {
      id: booking.id,
      instructorId: booking.instructorId,
      startTime: booking.startTime || booking.time,
      time: booking.startTime || booking.time,
      date: booking.date,
    };

    // Optimistic UI: update immediately
    const optimistic = {
      ...booking,
      instructorId: target.instructorId,
      startTime: target.timeStart,
      time: target.timeStart,
      date: format(effectiveDate, 'yyyy-MM-dd'),
    };
    window.dispatchEvent(new CustomEvent('booking-updated', { detail: { booking: optimistic } }));

    try {
      // Persist to backend
      const payload = {
        date: format(effectiveDate, 'yyyy-MM-dd'),
        instructor_user_id: target.instructorId,
        start_hour: toStartHour(target.timeStart),
      };
      await updateBooking(booking.id, payload);
      // Silent sync to reconcile any server-side fields
      await refreshData();
    } catch (err) {
      // Rollback optimistic change on failure
      const rollback = {
        id: original.id,
        instructorId: original.instructorId,
        startTime: original.startTime,
        time: original.time,
        date: original.date,
      };
      window.dispatchEvent(new CustomEvent('booking-updated', { detail: { booking: rollback } }));
      throw err;
    } finally {
      inFlightUpdatesRef.current.delete(booking.id);
    }
  }, [effectiveDate, updateBooking, refreshData]);

  // Helper: check for conflicts using context API (optional)
  const checkConflictAt = useCallback(async (instructorId, timeStart, dragged, excludeIds = []) => {
    if (!checkBookingConflicts) return null;
    const res = await checkBookingConflicts({
      date: format(effectiveDate, 'yyyy-MM-dd'),
      time: timeStart,
      duration: dragged.duration || 1,
      instructorId,
    });
    if (!res?.hasConflict) return null;
    const conflicts = Array.isArray(res.conflicts) ? res.conflicts.filter(c => !excludeIds.includes(c.id)) : [];
    return conflicts.length > 0 ? { ...res, conflicts, hasConflict: true } : null;
  }, [checkBookingConflicts, effectiveDate]);

  const performSwap = useCallback(async (a, b, target) => {
    logger.debug('DailyView.performSwap start', { a: a?.id, b: b?.id, target });
    const { dateStr, aOld, bOld, aNew, bNew } = buildSwapPlan(a, b, target, effectiveDate);
    if (isSameTarget(aOld, aNew)) return;
    const { durA, durB } = validateSameDurationOrThrow(a, b);
    if (!lockPair(inFlightUpdatesRef, a.id, b.id)) return;

    const ok = await precheckTargetsSwap({ findBookingAt, checkConflictAt, instructors, showError, aNew, bNew, aId: a.id, bId: b.id, durA, durB });
    if (!ok) { unlockPair(inFlightUpdatesRef, a.id, b.id); return; }

    optimisticApplySwap(a, b, aNew, bNew, dateStr);
    try {
      const result = await swapBookings(a.id, b.id, toTargetPayload(aNew, toStartHour), toTargetPayload(bNew, toStartHour), dateStr);
      return result;
    } catch (err) {
      rollbackSwap(a.id, b.id, aOld, bOld, dateStr);
      handleSwapFailure(err, instructors, aNew, bNew, showError);
      throw err;
    } finally {
      unlockPair(inFlightUpdatesRef, a.id, b.id);
    }
  }, [effectiveDate, swapBookings, checkConflictAt, instructors, showError, findBookingAt]);

  // Helper: check if a slot is occupied by another booking (excluding dragged one)
  const getOccupyingBooking = useCallback((instructorId, timeStart, excludeId) => {
    const occ = findBookingAt(instructorId, timeStart);
    return occ && occ.id !== excludeId ? occ : null;
  }, [findBookingAt]);

  

  // DnD handlers using dnd-kit
  const handleDragOver = useCallback(({ over }) => {
    if (!over) {
      setDragOverKey(null);
      return;
    }
    const overData = over.data?.current;
    if (overData?.type === 'slot') {
      const { instructorId, timeStart } = overData;
      setDragOverKey(`slot|${instructorId}|${timeStart}`);
    } else if (overData?.type === 'booking') {
      setDragOverKey(`card|${overData.booking?.id}`);
    } else {
      setDragOverKey(null);
    }
  }, []);

  const trySwap = useCallback(async (dragged, other) => {
    const instructorNameA = instructors.find(i => String(i.id) === String(dragged.instructorId))?.name || 'Instructor';
    const instructorNameB = instructors.find(i => String(i.id) === String(other.instructorId))?.name || 'Instructor';
    const tA = dragged.startTime || dragged.time;
    const tB = other.startTime || other.time;
    const displayA = typeof tA === 'string' ? formatTime(tA) : '';
    const displayB = typeof tB === 'string' ? formatTime(tB) : '';
    const content = (
      <div className="space-y-1">
        <div className="text-sm text-gray-700">Swap these two bookings?</div>
        <div className="text-xs text-gray-500">
          {displayA} {instructorNameA} ↔ {displayB} {instructorNameB}
        </div>
      </div>
    );
    const ok = await new Promise((resolve) => {
      const inst = Modal.confirm({
        title: 'Confirm Swap',
        content,
        okText: 'Swap',
        cancelText: 'Cancel',
        centered: true,
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
      // Safety timeout to auto-close lingering modal references in rare cases
      setTimeout(() => {
        if (typeof inst === 'function') {
          try { inst(); } catch {}
        } else if (inst && typeof inst.destroy === 'function') {
          try { inst.destroy(); } catch {}
        }
      }, 30000);
    });
    if (!ok) return false;
    const result = await performSwap(dragged, other, { instructorId: other.instructorId, timeStart: other.startTime || other.time });
    // Show a single generic success message regardless of mode
    if (result === 'swap' || result === 'swap-parking') showSuccess('Swap completed');
    return true;
  }, [performSwap, showSuccess, instructors]);

  const tryMoveToSlot = useCallback(async (dragged, instructorId, timeStart) => {
    const currentStart = dragged.startTime || dragged.time;
    const sameInstructor = String(dragged.instructorId) === String(instructorId);
    const sameTime = currentStart === timeStart;
    if (sameInstructor && sameTime) return false;

    const occupying = getOccupyingBooking(instructorId, timeStart, dragged.id);
    if (occupying) {
      return await trySwap(dragged, occupying);
    }
    const conflictRes = await checkConflictAt(instructorId, timeStart, dragged);
    if (conflictRes) {
      const conflictsExcludingSelf = (conflictRes.conflicts || []).filter(c => c.id !== dragged.id);
      if (conflictsExcludingSelf.length > 0) {
        showError(conflictRes?.conflictDetails?.message || 'This move would overlap another booking.');
        return false;
      }
    }
    await performMove(dragged, { instructorId, timeStart });
    showSuccess('Booking moved');
    return true;
  }, [getOccupyingBooking, trySwap, checkConflictAt, performMove, showError, showSuccess]);

  const handleDragEnd = useCallback(async ({ active, over }) => {
    logger.debug('DailyView.handleDragEnd', { activeId: active?.id, overType: over?.data?.current?.type });
    setDragOverKey(null);
    if (!active || !over) return;
    const activeData = active.data?.current;
    const overData = over.data?.current;
    if (!activeData || activeData.type !== 'booking') return;
    const dragged = activeData.booking;
    const routeDrop = async (type) => {
      if (type === 'booking') {
        const overBookingId = overData.booking?.id;
        const other = dailyBookings.find((b) => String(b.id) === String(overBookingId));
        if (!other || other.id === dragged.id) return;
        return trySwap(dragged, other);
      }
      if (type === 'slot') {
        return tryMoveToSlot(dragged, overData.instructorId, overData.timeStart);
      }
    };
    try {
      await routeDrop(overData?.type);
    } catch (e) {
      logger.error('DailyView dragEnd failed', { error: e });
      showError(e.message || 'Failed to update booking');
    }
  }, [dailyBookings, trySwap, tryMoveToSlot, showError]);

  const TimeSlotCell = ({ slot, index, instructor, instructorBookings }) => {
    const hasBooking = instructorBookings.some(booking => {
      const bookingStart = booking.startTime || booking.time;
      return bookingStart === slot.start;
    });
    const cls = hasBooking 
      ? 'bg-gray-100 cursor-default'
      : 'cursor-pointer hover:bg-green-50 hover:border-green-200';
    return (
      <SlotDropZone
        instructorId={instructor.id}
        timeStart={slot.start}
        className={`time-slot-clickable absolute w-full border-b border-gray-100 transition-colors duration-200 ${cls}`}
        style={{ top: `${index * slotHeight}px`, height: `${slotHeight}px` }}
      >
        {!hasBooking && (
          <button type="button" className="absolute inset-0 w-full h-full" onClick={() => handleTimeSlotClick(instructor, slot)} aria-label={`Book ${slot.start}-${slot.end}`} />
        )}
      </SlotDropZone>
    );
  };

  const TimeColumnCell = ({ slot }) => {
    const hour = parseInt(slot.start.split(':')[0], 10);
    const hour12 = hour % 12 || 12;
    const wind = windByHour[slot.start];
    const showForecast = Boolean(wind && forecastSettings?.showForecast);
    const showDirection = Boolean(showForecast && forecastSettings?.showDirection);
    const showGust = Boolean(showForecast && wind?.gustKn && forecastSettings?.showGustSpeed);
    const justify = showForecast ? 'justify-between' : 'justify-center';
    return (
      <div className={`relative border-b border-gray-100 bg-gray-50 flex items-center w-full ${justify}`} style={{ height: `${slotHeight}px`, padding: '2px 4px' }}>
        {showForecast && (
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex items-center">
              <span className={`px-2 py-0.5 rounded-full text-white text-[10px] font-bold leading-none shadow-sm ${getWindSolidClasses(wind.speedKn)}`}>{wind.speedKn}</span>
              <span className="text-[8px] text-gray-500 ml-1 font-medium">kn</span>
            </div>
            {showGust && (
              <div className="flex items-center">
                <span className={`px-2 py-0.5 rounded-full text-white text-[9px] font-semibold leading-none shadow-sm opacity-90 ${getWindSolidClasses(wind.gustKn)}`}>{wind.gustKn}</span>
                <span className="text-[7px] text-gray-400 ml-1 font-medium">G</span>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col items-center justify-center">
          {showDirection && (
            <div className="mb-1">
              <div className="bg-white/80 rounded-full p-1 shadow-sm border border-gray-200/50">
                <WindArrow deg={wind.dirDeg} className="text-gray-700" size={10} />
              </div>
            </div>
          )}
          <div className="text-[11px] sm:text-sm font-bold text-gray-600 pointer-events-none select-none">
            <span className="leading-none tabular-nums">{hour12}</span>
          </div>
        </div>
      </div>
    );
  };
  
  // Stable callback for handling time slot clicks
  const handleTimeSlotClick = useCallback((instructor, timeSlot) => {
    // Check if the slot is available before allowing booking
    const isAvailable = isSlotAvailable(timeSlot, instructor.id);
    
    if (onTimeSlotClick && isAvailable) {
      onTimeSlotClick({
        instructorId: instructor.id,
        instructorName: instructor.name,
        date: format(effectiveDate, 'yyyy-MM-dd'),
        startTime: timeSlot.start,
        endTime: timeSlot.end,
        status: 'available'
      });
    }
  }, [effectiveDate, onTimeSlotClick, isSlotAvailable]);
  if (isLoading) return <LoadingIndicator message="Loading daily view..." />;
  if (error) return <ErrorIndicator message={error} onRetry={retry} />;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Sticky Header with Filters */}      
  <div className="daily-view-sticky-header sticky top-0 z-20 bg-white border-b border-gray-200">
        {/* Filter Controls Bar */}
        {showFilters && (
          <div className="filters-control-bar px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Clear All Filters Button */}
              {(selectedInstructors.length > 0 || selectedServices.length > 0 || statusFilter.length > 0 || searchTerm) && (
                <button
                  onClick={clearAllFilters}
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-600 hover:text-red-600 transition-colors"
                >
                  <span className="hidden sm:inline">Clear All</span>
                  <span className="sm:hidden">Clear</span>
                </button>
              )}
            </div>
            
            {/* Debug Refresh Button */}
            <button
              onClick={async () => {
                logger.info('Force refresh triggered - clearing cache and fetching fresh data');
                
                // Set force refresh flag
                localStorage.setItem('force_bookings_refresh', 'true');
                
                // Clear localStorage cache
                Object.keys(localStorage).forEach(key => {
                  if (key.includes('cache')) {
                    localStorage.removeItem(key);
                    logger.debug('Cleared cache key', { key });
                  }
                });
                
                // Clear React state cache if available
                if (window.clearCalendarCache) {
                  window.clearCalendarCache();
                }
                
                logger.debug('Current bookings state', {
                  count: bookings.length,
                  dailyCount: dailyBookings.length,
                  selectedDate: format(effectiveDate, 'yyyy-MM-dd')
                });
                
                await refreshData();
                
                logger.info('Refresh completed');
              }}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              🔄 Force Refresh
            </button>
          </div>
        )}
        
        {/* Expanded Filters Panel */}
        {showFilters && (
          <div className="filters-panel p-3 sm:p-4 bg-gray-50 border-b border-gray-200 space-y-3 sm:space-y-4">
            {/* Search Field */}
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search instructors or services..."
                  className="block w-full pl-9 pr-9 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-500"
                      onClick={() => setSearchTerm('')}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* Instructor Filters */}
              {filteredInstructors.length > 0 && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-500 uppercase mb-2">Instructors</h4>
                  <div className="flex flex-wrap gap-2">
                    {filteredInstructors.map(instructor => (
                      <label
                        key={instructor.id}
                        className={`flex items-center cursor-pointer px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors ${
                          selectedInstructors.includes(instructor.id)
                            ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-500'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selectedInstructors.includes(instructor.id)}
                          onChange={() => toggleInstructor(instructor.id)}
                        />
                        <div className="flex items-center min-w-0">
                          <div className={`h-4 w-4 sm:h-5 sm:w-5 rounded-full flex items-center justify-center mr-1.5 sm:mr-2 flex-shrink-0 ${selectedInstructors.includes(instructor.id) ? 'bg-blue-200' : 'bg-gray-200'}`}>
                            <span className="text-[10px] sm:text-xs font-medium">{getInstructorInitials(instructor.name)}</span>
                          </div>
                          <span className="text-xs sm:text-sm truncate">{instructor.name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Calendar Content - Scrollable */}
      <div className="calendar-content-scrollable flex-1 overflow-y-auto">
        {/* Add subtle padding around calendar corners */}
        <div style={{ padding: 5 }}>
        <div className="flex">          {/* Time Column */}
          <div className="daily-view-time-column w-16 sm:w-24 lg:w-28 flex-shrink-0 border-r border-gray-200 sticky left-0 bg-gray-50 z-10">
            {/* Time Column Header - matches instructor header height */}
            <div className="h-12 sm:h-16 border-b border-gray-200 bg-gray-50 flex flex-col items-center justify-center">
              <div className="text-[11px] sm:text-xs font-medium text-gray-500">Time</div>
              {dayTemperature && (
                <div className="text-[10px] sm:text-xs font-bold text-blue-600 mt-1">
                  {Math.round(dayTemperature)}°C
                </div>
              )}
            </div>
            
            {/* Time Slots */}
            {timeSlots.map((slot) => (
              <TimeColumnCell key={slot.start} slot={slot} />
            ))}
          </div>

          {/* Instructor Columns */}
          <CalendarDndProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className="daily-view-instructor-scroll relative flex-1 min-w-0 overflow-x-auto">
              <div className="flex flex-nowrap">
                {displayedInstructors.map((instructor) => {
                  const instructorBookings = getBookingsForInstructor(instructor.id);

                  // Responsive width calculation
                  const getInstructorColumnWidth = () => {
                    const instructorCount = displayedInstructors.length;
                    // Mobile-first: ensure at least 2 columns fit beside the time column (~56px)
                    if (instructorCount <= 2) return 'min-w-[136px] max-w-[164px] sm:min-w-[260px] sm:max-w-[360px]';
                    if (instructorCount <= 4) return 'min-w-[128px] max-w-[156px] sm:min-w-[220px] sm:max-w-[320px]';
                    if (instructorCount <= 8) return 'min-w-[120px] max-w-[148px] sm:min-w-[200px] sm:max-w-[280px]';
                    return 'min-w-[112px] max-w-[140px] sm:min-w-[180px] sm:max-w-[220px]';
                  };

                  return (
                    <div
                      key={instructor.id}
                      className={`${getInstructorColumnWidth()} daily-view-instructor-column border-r border-gray-200 flex-shrink-0`}
                    >
                      {/* Sticky Column Header with Full Name */}
                      <div className="instructor-column-header h-12 sm:h-16 px-2 sm:px-3 py-1.5 sm:py-2 text-center border-b border-gray-200 bg-gray-50 flex items-center justify-center sticky top-0 z-10">
                        <div className="text-xs sm:text-sm font-semibold text-gray-800 truncate">{instructor.name}</div>
                      </div>

                      {/* Time Slots + DnD Container */}
                      <div className="relative bg-white" style={{ height: `${timeSlots.length * slotHeight}px` }}>
                        {/* Time slot grid lines with availability indicators */}
                        {timeSlots.map((slot, index) => (
                          <TimeSlotCell
                            key={slot.start}
                            slot={slot}
                            index={index}
                            instructor={instructor}
                            instructorBookings={instructorBookings}
                          />
                        ))}

                        {/* Booking Cards */}
                        {instructorBookings.map((booking) => {
                          const { top, height } = getBookingPosition(booking);

                          const startTime = booking.startTime || booking.time;
                          let endTimeDisplay = '';
                          const DEFAULT_DURATION = 60;

                          if (booking.endTime && isValidTime(booking.endTime)) {
                            const { hour: startHour, minute: startMinute } = parseTimeComponents(startTime);
                            const { hour: endHour, minute: endMinute } = parseTimeComponents(booking.endTime);
                            const startTotalMinutes = startHour * 60 + startMinute;
                            const endTotalMinutes = endHour * 60 + endMinute;
                            const calculatedDuration = endTotalMinutes - startTotalMinutes;
                            if (calculatedDuration <= 2 || calculatedDuration > 480) {
                              const calculatedEndTime = calculateEndTime(startTime, DEFAULT_DURATION);
                              endTimeDisplay = ` - ${formatTime(calculatedEndTime)}`;
                            } else {
                              endTimeDisplay = ` - ${formatTime(booking.endTime)}`;
                            }
                          } else if (booking.duration) {
                            let durationToUse = parseFloat(booking.duration) || DEFAULT_DURATION;
                            if (durationToUse <= 12) {
                              durationToUse = durationToUse * 60;
                            }
                            const calculatedEndTime = calculateEndTime(startTime, durationToUse);
                            endTimeDisplay = ` - ${formatTime(calculatedEndTime)}`;
                          } else {
                            const calculatedEndTime = calculateEndTime(startTime, DEFAULT_DURATION);
                            endTimeDisplay = ` - ${formatTime(calculatedEndTime)}`;
                          }

                          const bookingStatusClass = getBookingStatusClass(booking.status);
                          const serviceName = booking.serviceName || 'Service';
                          const participantDisplay = formatParticipantNames(booking);
                          const timeDisplay = `${formatTime(startTime)}${endTimeDisplay}`;
                          // Group badge removed per request
                          const tooltipText = getGroupBookingTooltip(booking);

                          return (
                            <DraggableBooking
                              key={`${instructor.id}-${booking.id}`}
                              booking={booking}
                              className={`booking-card ${bookingStatusClass} fixed-layout-card`}
                              style={{ top, height }}
                            >
                              {/* Drop highlight for card swap */}
                              {dragOverKey === `card|${booking.id}` && (
                                <div className="absolute inset-0 ring-2 ring-blue-400 ring-offset-0 pointer-events-none rounded-md" />
                              )}
                              {/* Group indicator removed */}

                              {/* Time in top right - black color, same size as student name */}
                              <div className="absolute top-1 right-2 text-[11px] sm:text-sm text-gray-900 font-medium">
                                {timeDisplay}
                              </div>

                              {/* Main content */}
                              <div
                                className="booking-card-content pt-3 sm:pt-4 pl-1 pr-1"
                                onClick={() => onBookingClick && onBookingClick(booking)}
                                title={tooltipText}
                              >
                                {/* Participant name(s) - bold, slightly below top */}
                                <div className="text-xs sm:text-sm font-bold text-gray-900 truncate leading-tight">
                                  {participantDisplay}
                                </div>

                                {/* Service name - light, below participant name */}
                                <div className="text-[11px] sm:text-xs font-normal text-gray-600 truncate leading-tight mt-0.5 sm:mt-1">
                                  {serviceName}
                                </div>
                              </div>
                            </DraggableBooking>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CalendarDndProvider>
        </div>
        </div>
      </div>
    </div>
  );
};

export default DailyView;

