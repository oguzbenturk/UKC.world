import { useState, useEffect, useRef, useCallback } from 'react';
import { CalendarIcon, ClockIcon, ChevronDownIcon, MagnifyingGlassIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { createPortal } from 'react-dom';
import { getAvailableSlots } from '../../api/calendarApi';
import apiClient from '@/shared/services/apiClient';

/**
 * Step 2: Time and Instructor Selection with Dropdown Menus
 * Allows selecting date, start time, duration, and instructor
 * Features conflict detection and smart recommendations with 30-minute breaks
 */
/* eslint-disable complexity */
const TimeInstructorStep = ({ formData, updateFormData, instructors, onNext, onPrev, hideNavigation = false }) => {
  const [_selectedDate, setSelectedDate] = useState('');
  // Hide custom calendar icon on mobile/touch where native picker already shows its own UI
  const [showDateIcon, setShowDateIcon] = useState(true);
  const [instructorSearchTerm, setInstructorSearchTerm] = useState('');
  const [showInstructorDropdown, setShowInstructorDropdown] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(120); // Default 2 hours in minutes
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [bookingDefaults, setBookingDefaults] = useState(null);
  const [conflictInfo, setConflictInfo] = useState(null);
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const inputRef = useRef(null);
  
  // Load booking defaults from settings
  useEffect(() => {
    const loadBookingDefaults = async () => {
      try {
        const response = await apiClient.get('/settings');
        const settings = response.data;
        if (settings.booking_defaults) {
          setBookingDefaults(settings.booking_defaults);
          setSelectedDuration(settings.booking_defaults.defaultDuration);
        }
      } catch {
        // Use fallback defaults if settings fail to load
        setBookingDefaults({
          defaultDuration: 120,
          allowedDurations: [60, 90, 120, 150, 180, 240]
        });
      }
    };
    
    loadBookingDefaults();
  }, []);

  // Decide whether to show the left calendar icon; on touch/mobile we hide it to prevent overlap
  useEffect(() => {
    try {
      const isCoarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const isSmall = typeof window !== 'undefined' && window.innerWidth <= 480;
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
      if (isCoarse || isSmall || isIOS) {
        setShowDateIcon(false);
      }
    } catch {
      // no-op
    }
  }, []);

  // Generate time slots (8 AM to 8 PM in 30-minute intervals)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Load available slots when date or instructor changes
  const loadAvailableSlots = async (date, instructorId) => {
    if (!date || !instructorId) {
      setAvailableSlots([]);
      return;
    }

    setLoadingSlots(true);
    setSlotsError(null);

    try {
      // API expects startDate and endDate, use same date for both since we're looking at one day
      const slots = await getAvailableSlots(date, date, { instructorIds: [instructorId] });

      // Extract slots for the specific date and instructor
      if (slots && slots.length > 0) {
        const dayData = slots.find(day => day.date === date);
        
        if (dayData && dayData.slots) {
          // Filter slots for the specific instructor
          const instructorSlots = dayData.slots.filter(slot => 
            String(slot.instructorId) === String(instructorId)
          );
          
          // Debug: Log the slot data to understand the format
          
          setAvailableSlots(instructorSlots);
        } else {
          setAvailableSlots([]);
        }
      } else {
        setAvailableSlots([]);
      }
    } catch {
      setSlotsError('Failed to load available time slots');
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Get slot status for a specific time
  const getSlotStatus = useCallback((timeSlot) => {
    // If no instructor is selected or still loading, treat as unavailable
    if (!formData.instructorId || loadingSlots) {
      return 'unavailable';
    }

    // When API returned slot data, treat any time not explicitly available as unavailable
    if (availableSlots.length > 0) {
      // Try to find a direct match for this 30-min slot
      let slot = availableSlots.find(s => s.time === timeSlot);

      // Fuzzy match in case of formatting differences (e.g., leading zeros)
      if (!slot) {
        const timeVariations = [
          timeSlot,
          timeSlot.replace(/^0(\d):/, '$1:'),
          timeSlot.padStart(5, '0')
        ];
        for (const t of timeVariations) {
          slot = availableSlots.find(s => s.time === t);
          if (slot) break;
        }
      }

      // If the API did not explicitly mark this slot as available, consider it unavailable
      return slot ? (slot.status || 'unavailable') : 'unavailable';
    }

    // No slot data: be conservative and mark as unavailable
    // This avoids allowing bookings that might overlap unknown reservations
    if (!slotsError) {
      return 'unavailable';
    }

    return 'unavailable';
  }, [availableSlots, formData.instructorId, loadingSlots, slotsError]);

  // Check if a time range is available
  const isTimeRangeAvailable = useCallback((startTime, durationMinutes) => {
    const startIndex = timeSlots.indexOf(startTime);
    if (startIndex === -1) return false;
    
    const slotsNeeded = durationMinutes / 30;
    const endIndex = startIndex + slotsNeeded;
    
    // Check if all required slots are available
    for (let i = startIndex; i < endIndex; i++) {
      if (i >= timeSlots.length) return false;
      const slotTime = timeSlots[i];
      const status = getSlotStatus(slotTime);
      if (status !== 'available') return false;
    }
    
    return true;
  }, [getSlotStatus, timeSlots]);

  // Find next available time with optional break
  const findNextAvailableTime = useCallback((afterTime, durationMinutes, includeBreak = true) => {
    const breakMinutes = includeBreak ? 30 : 0;
    const afterIndex = timeSlots.indexOf(afterTime);
    if (afterIndex === -1) return null;
    
    // Start searching from after the given time + break
    for (let i = afterIndex + (breakMinutes / 30); i < timeSlots.length; i++) {
      const testTime = timeSlots[i];
      if (isTimeRangeAvailable(testTime, durationMinutes)) {
        return testTime;
      }
    }
    
    return null;
  }, [isTimeRangeAvailable, timeSlots]);

  // Validate the currently selected time range and populate conflict info if invalid
  const validateCurrentSelection = useCallback(() => {
    const startTime = formData.startTime;
    if (!startTime || !selectedDuration) return false;
    const ok = isTimeRangeAvailable(startTime, selectedDuration);
    if (!ok) {
      const nextWithBreak = findNextAvailableTime(startTime, selectedDuration, true);
      const nextWithoutBreak = findNextAvailableTime(startTime, selectedDuration, false);
      setConflictInfo({ requestedTime: startTime, nextWithBreak, nextWithoutBreak });
      setShowConflictWarning(true);
    }
    return ok;
  }, [formData.startTime, isTimeRangeAvailable, selectedDuration, findNextAvailableTime]);

  // Calculate end time based on start time and duration in minutes
  const calculateEndTime = (startTime, durationMinutes) => {
    if (!startTime) return '';
    
    const [hours, minutes] = startTime.split(':').map(Number);
    const startTotalMinutes = hours * 60 + minutes;
    const endTotalMinutes = startTotalMinutes + durationMinutes;
    
    const endHours = Math.floor(endTotalMinutes / 60);
    const endMinutes = endTotalMinutes % 60;
    
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };

  // Handle start time change with conflict detection
  const handleStartTimeChange = (startTime) => {
    if (!startTime || !selectedDuration) return;
    
    const endTime = calculateEndTime(startTime, selectedDuration);
    
    // Check if the selected time range is available
    if (isTimeRangeAvailable(startTime, selectedDuration)) {
      // Time is available, update form data
      updateFormData({
        startTime,
        endTime,
        duration: selectedDuration / 60 // Convert to hours for backward compatibility
      });
      setShowConflictWarning(false);
      setConflictInfo(null);
    } else {
      // Time is not available, find alternatives
      const nextWithBreak = findNextAvailableTime(startTime, selectedDuration, true);
      const nextWithoutBreak = findNextAvailableTime(startTime, selectedDuration, false);
      
      setConflictInfo({
        requestedTime: startTime,
        nextWithBreak,
        nextWithoutBreak
      });
      setShowConflictWarning(true);
    }
  };

  // Accept suggested time
  const acceptSuggestedTime = (suggestedTime) => {
    const endTime = calculateEndTime(suggestedTime, selectedDuration);
    updateFormData({
      startTime: suggestedTime,
      endTime,
      duration: selectedDuration / 60
    });
    setShowConflictWarning(false);
    setConflictInfo(null);
  };

  // Force book at requested time (override conflicts)
  const forceBookTime = () => {
    if (!conflictInfo) return;
    
    const endTime = calculateEndTime(conflictInfo.requestedTime, selectedDuration);
    updateFormData({
      startTime: conflictInfo.requestedTime,
      endTime,
      duration: selectedDuration / 60
    });
    setShowConflictWarning(false);
    setConflictInfo(null);
  };

  // Initialize with form data if available
  useEffect(() => {
    // Set default date if not provided
    if (!formData.date) {
      const defaultDate = format(new Date(), 'yyyy-MM-dd');
      updateFormData({ date: defaultDate });
      setSelectedDate(defaultDate);
    } else {
      setSelectedDate(formData.date);
    }
    
    // Initialize duration from form data or use booking defaults
    if (formData.duration) {
      setSelectedDuration(formData.duration * 60); // Convert hours to minutes
    } else if (formData.startTime && formData.endTime) {
      const startParts = formData.startTime.split(':').map(Number);
      const endParts = formData.endTime.split(':').map(Number);
      const startMinutes = startParts[0] * 60 + startParts[1];
      const endMinutes = endParts[0] * 60 + endParts[1];
      const durationMinutes = endMinutes - startMinutes;
      setSelectedDuration(durationMinutes);
      // Save calculated duration to form data
      updateFormData({ duration: durationMinutes / 60 });
    } else if (bookingDefaults) {
      setSelectedDuration(bookingDefaults.defaultDuration);
      updateFormData({ duration: bookingDefaults.defaultDuration / 60 });
    }
    
    // Initialize instructor search term with selected instructor name
    if (formData.instructorId && instructors.length > 0) {
      const selectedInstructor = instructors.find(instructor => instructor.id === formData.instructorId);
      if (selectedInstructor) {
        setInstructorSearchTerm(selectedInstructor.name);
      }
    } else if (formData.instructorName) {
      setInstructorSearchTerm(formData.instructorName);
    }
  }, [formData.date, formData.startTime, formData.endTime, formData.instructorId, formData.instructorName, formData.duration, instructors, updateFormData, bookingDefaults]);

  // Load available slots when date or instructor changes
  useEffect(() => {
    if (formData.date && formData.instructorId) {
      loadAvailableSlots(formData.date, formData.instructorId);
    } else {
      setAvailableSlots([]);
    }
  }, [formData.date, formData.instructorId, formData.slotRefreshKey]);

  // When slot data, duration, or selected time changes, revalidate selection
  useEffect(() => {
    if (!formData.startTime || !selectedDuration || !availableSlots) {
      return;
    }

    const startTime = formData.startTime;
    const isValid = isTimeRangeAvailable(startTime, selectedDuration);

    if (!isValid) {
      const nextWithBreak = findNextAvailableTime(startTime, selectedDuration, true);
      const nextWithoutBreak = findNextAvailableTime(startTime, selectedDuration, false);

      setConflictInfo(prev => {
        const nextInfo = { requestedTime: startTime, nextWithBreak, nextWithoutBreak };
        if (
          prev &&
          prev.requestedTime === nextInfo.requestedTime &&
          prev.nextWithBreak === nextInfo.nextWithBreak &&
          prev.nextWithoutBreak === nextInfo.nextWithoutBreak
        ) {
          return prev;
        }
        return nextInfo;
      });

      setShowConflictWarning(prev => (prev ? prev : true));
    } else {
      setConflictInfo(prev => (prev ? null : prev));
      setShowConflictWarning(prev => (prev ? false : prev));
    }
  }, [availableSlots, selectedDuration, formData.startTime, isTimeRangeAvailable, findNextAvailableTime]);
  
  // Handle date change
  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    updateFormData({ date: newDate });
  };
  
  // Handle duration change
  const handleDurationChange = (newDurationMinutes) => {
    setSelectedDuration(newDurationMinutes);
    
    // Update form data with new duration
    updateFormData({ duration: newDurationMinutes / 60 });
    
    // Clear selected time when duration changes to force reselection
    if (formData.startTime) {
      updateFormData({
        startTime: '',
        endTime: '',
        duration: newDurationMinutes / 60
      });
    }
    
    // Clear any conflict warnings
    setShowConflictWarning(false);
    setConflictInfo(null);
  };
  
  // Handle instructor selection
  const handleInstructorSelect = (instructor) => {
    updateFormData({
      instructorId: instructor.id,
      instructorName: instructor.name
    });
    setInstructorSearchTerm(instructor.name);
    setShowInstructorDropdown(false);
    
    // Clear any conflict warnings when instructor changes
    setShowConflictWarning(false);
    setConflictInfo(null);
  };

  // Filter instructors based on search term
  const filteredInstructors = instructors.filter(instructor =>
    instructor.name.toLowerCase().includes(instructorSearchTerm.toLowerCase())
  );

  // Handle instructor search input change with debouncing
  const handleInstructorSearchChange = (e) => {
    const value = e.target.value;
    setInstructorSearchTerm(value);
    setShowInstructorDropdown(true);
    
    // Clear selection if user types something different
    if (formData.instructorId && value !== formData.instructorName) {
      updateFormData({
        instructorId: '',
        instructorName: ''
      });
    }
  };

  // Handle instructor search input focus
  const handleInstructorSearchFocus = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      // Prefer showing below unless there's really not enough space
      const minRequiredSpace = 120; // Minimum space needed (about 2 items)
      const maxDropdownHeight = 240; // Maximum dropdown height
      const shouldShowAbove = spaceBelow < minRequiredSpace && spaceAbove > maxDropdownHeight;
      
      setDropdownPosition({
        top: shouldShowAbove ? rect.top + window.scrollY - maxDropdownHeight : rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: Math.max(320, rect.width),
        maxHeight: shouldShowAbove ? Math.min(maxDropdownHeight, spaceAbove - 10) : Math.min(maxDropdownHeight, spaceBelow - 10)
      });
    }
    setShowInstructorDropdown(true);
  };
  
  // Handle instructor dropdown blur with improved timing
  const handleInstructorDropdownBlur = (_e) => {
    // Use setTimeout to allow for clicks on options
    setTimeout(() => {
      setShowInstructorDropdown(false);
    }, 150);
  };

  // Get selected instructor display name
  const getSelectedInstructorName = () => {
    // If user is typing, show search term
    if (instructorSearchTerm) {
      return instructorSearchTerm;
    }
    
    // If instructor is selected and not searching, show instructor name
    if (formData.instructorId) {
      const selectedInstructor = instructors.find(instructor => instructor.id === formData.instructorId);
      return selectedInstructor ? selectedInstructor.name : (formData.instructorName || '');
    }
    
    return '';
  };

  // Get duration options from booking defaults
  const getDurationOptions = () => {
    if (!bookingDefaults) {
      return [
        { value: 60, label: '1 hour' },
        { value: 90, label: '1.5 hours' },
        { value: 120, label: '2 hours' },
        { value: 150, label: '2.5 hours' },
        { value: 180, label: '3 hours' }
      ];
    }
    
    return bookingDefaults.allowedDurations.map(minutes => ({
      value: minutes,
      label: minutes < 60 ? `${minutes} minutes` : 
             minutes % 60 === 0 ? `${minutes / 60} hour${minutes / 60 !== 1 ? 's' : ''}` :
             `${Math.floor(minutes / 60)}.5 hours`
    }));
  };
  
  // Calculate if we can enable the next button
  const isCurrentRangeValid = formData.startTime ? isTimeRangeAvailable(formData.startTime, selectedDuration) : false;
  const isNextEnabled = formData.date && 
                        formData.startTime && 
                        formData.endTime && 
                        formData.instructorId &&
                        isCurrentRangeValid;

  const handleNextClick = () => {
    if (!isCurrentRangeValid) {
      validateCurrentSelection();
      return; // Block progression when invalid
    }
    onNext();
  };

  return (
    <div>
      {/* Date selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Date
        </label>
        <div className="relative overflow-hidden">
          {showDateIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CalendarIcon className="h-5 w-5 text-gray-400" />
            </div>
          )}
          <input
            type="date"
            className={`${showDateIcon ? 'pl-10' : 'pl-3'} w-full max-w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white focus:ring-blue-500 focus:border-blue-500 overflow-hidden`}
            value={formData.date || format(new Date(), 'yyyy-MM-dd')}
            onChange={handleDateChange}
            min={format(new Date(), 'yyyy-MM-dd')}
          />
        </div>
      </div>

      {/* Instructor selection */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Instructor
          </label>
        </div>
        <div className="relative">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
            </div>            
            <input
              ref={inputRef}
              type="text"
              className={`pl-10 pr-10 w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${
                formData.instructorId 
                  ? 'border-green-300 bg-green-50' 
                  : 'border-gray-300 bg-white'
              }`}
              placeholder={instructors.length === 0 ? "Loading instructors..." : "Search instructors..."}
              value={getSelectedInstructorName()}
              onChange={handleInstructorSearchChange}
              onFocus={handleInstructorSearchFocus}
              onBlur={handleInstructorDropdownBlur}
              onClick={() => {
                // Clear search term when clicked to allow new search
                if (formData.instructorId) {
                  setInstructorSearchTerm('');
                  setShowInstructorDropdown(true);
                }
              }}
              disabled={instructors.length === 0}
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              {formData.instructorId ? (
                <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <ChevronDownIcon className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </div>
          {instructors.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              No instructors available. Please contact support if this persists.
            </p>
          )}
        </div>
      </div>

      {/* Duration selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Lesson Duration
        </label>
        <select
          value={selectedDuration}
          onChange={(e) => handleDurationChange(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:ring-blue-500 focus:border-blue-500"
        >
          {getDurationOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Start time selection */}
      {formData.instructorId && formData.date && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Time
          </label>
          
          {loadingSlots ? (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              <span className="ml-2 text-sm text-gray-600">Loading available times...</span>
            </div>
          ) : (
            <select
              value={formData.startTime || ''}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select start time</option>
              {timeSlots.map((timeSlot) => {
                const _status = getSlotStatus(timeSlot);
                const isAvailable = isTimeRangeAvailable(timeSlot, selectedDuration);
                return (
                  <option 
                    key={timeSlot} 
                    value={timeSlot}
                    disabled={!isAvailable}
                  >
                    {timeSlot} {!isAvailable ? '(Unavailable)' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </div>
      )}

      {/* Conflict Warning with Smart Suggestions */}
      {showConflictWarning && conflictInfo && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-start">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-amber-800">Time Conflict Detected</h3>
              <p className="mt-1 text-sm text-amber-700">
                The selected time {conflictInfo.requestedTime} conflicts with existing bookings.
              </p>
              
              <div className="mt-3 space-y-2">
                {conflictInfo.nextWithBreak && (
                  <button
                    onClick={() => acceptSuggestedTime(conflictInfo.nextWithBreak)}
                    className="block w-full text-left p-2 bg-white border border-amber-200 rounded hover:bg-amber-50 transition-colors duration-200"
                  >
                    <span className="font-medium text-amber-800">
                      {conflictInfo.nextWithBreak} - {calculateEndTime(conflictInfo.nextWithBreak, selectedDuration)}
                    </span>
                    <span className="ml-2 text-xs text-amber-600">
                      (Recommended with 30-min break)
                    </span>
                  </button>
                )}
                
                {conflictInfo.nextWithoutBreak && conflictInfo.nextWithoutBreak !== conflictInfo.nextWithBreak && (
                  <button
                    onClick={() => acceptSuggestedTime(conflictInfo.nextWithoutBreak)}
                    className="block w-full text-left p-2 bg-white border border-amber-200 rounded hover:bg-amber-50 transition-colors duration-200"
                  >
                    <span className="font-medium text-amber-800">
                      {conflictInfo.nextWithoutBreak} - {calculateEndTime(conflictInfo.nextWithoutBreak, selectedDuration)}
                    </span>
                    <span className="ml-2 text-xs text-amber-600">
                      (Next available without break)
                    </span>
                  </button>
                )}
                
                <button
                  onClick={forceBookTime}
                  className="block w-full text-left p-2 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors duration-200"
                >
                  <span className="font-medium text-red-800">
                    Force book at {conflictInfo.requestedTime}
                  </span>
                  <span className="ml-2 text-xs text-red-600">
                    (Override conflicts - not recommended)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected time summary */}
      {formData.startTime && formData.endTime && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center text-sm text-green-800">
            <ClockIcon className="h-4 w-4 mr-2" />
            <span className="font-medium">
              {formData.startTime} - {formData.endTime}
            </span>
            <span className="ml-2 text-green-600">
              ({selectedDuration / 60} hour{selectedDuration / 60 !== 1 ? 's' : ''})
            </span>
          </div>
        </div>
      )}

      {/* Instructor selection hint */}
      {!formData.instructorId && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700">
            Please select an instructor to see available time slots.
          </p>
        </div>
      )}
      
      {/* Navigation buttons - Only render if navigation is not hidden */}
      {!hideNavigation && (
        <div className="mt-6 flex justify-between sticky-bottom-actions border-t border-gray-200 pt-3">
          <button
            type="button"
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            onClick={onPrev}
          >
            Back
          </button>
          <button
            type="button"
            className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              isNextEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
            }`}
            onClick={handleNextClick}
            disabled={!isNextEnabled}
          >
            Next
          </button>
        </div>
      )}

      {/* Portal for instructor dropdown to avoid clipping */}
      {showInstructorDropdown && createPortal(
        <div 
          className="fixed bg-white shadow-lg rounded-md py-4 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm z-[9999]"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: Math.max(dropdownPosition.width, 400), // Minimum width for grid
            minWidth: '400px',
            maxHeight: dropdownPosition.maxHeight || '320px'
          }}
        >
          {filteredInstructors.length > 0 ? (
            <div className="px-2 py-1 max-h-72 overflow-y-auto space-y-1">
              {filteredInstructors.map((instructor) => {
                const isSelected = formData.instructorId === instructor.id;
                return (
                  <button
                    type="button"
                    key={instructor.id}
                    className={`w-full flex items-center gap-3 rounded-md border text-left px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      isSelected
                        ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleInstructorSelect(instructor)}
                  >
                    <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      {instructor.profileImage ? (
                        <img
                          src={instructor.profileImage}
                          alt={instructor.name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-slate-600">
                          {instructor.name?.charAt(0) || '?'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {instructor.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {instructor.specialties?.length
                          ? instructor.specialties.slice(0, 2).join(', ')
                          : instructor.email || 'No specialties listed'}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="flex-shrink-0 text-green-600">
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-4 px-4 text-gray-500 text-center">
              No instructors found matching "{instructorSearchTerm}"
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default TimeInstructorStep;
