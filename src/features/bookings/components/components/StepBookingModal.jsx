import { useState, useEffect, Fragment, useCallback, useMemo } from 'react';
import { computeBookingPrice } from '@/shared/utils/pricing';
import { isGroupService } from '@/shared/utils/serviceCapacityFilter';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, UserGroupIcon, GiftIcon } from '@heroicons/react/24/outline';
import { useCalendar } from '../contexts/CalendarContext';
import { getAvailableSlots } from '../api/calendarApi';
import { useToast } from '@/shared/contexts/ToastContext';
import { useBookingForm } from '../../hooks/useBookingForm';
import CustomerPackageManager from '@/features/customers/components/CustomerPackageManager';
import '@/styles/step-booking-modal.css';

// Step components
import UserSelectionStep from './booking-steps/UserSelectionStep';
import TimeInstructorStep from './booking-steps/TimeInstructorStep';
import ServiceSelectionStep from './booking-steps/ServiceSelectionStep';
import ParticipantPackageStep from './booking-steps/ParticipantPackageStep';
import ConfirmationStep from './booking-steps/ConfirmationStep';
import StepErrorBoundary from './StepErrorBoundary';

const HALF_HOUR_MINUTES = 30;

const timeStringToMinutes = (time) => {
  if (!time || typeof time !== 'string') return null;
  const [hourPart, minutePart] = time.split(':');
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const minutesToTimeString = (totalMinutes) => {
  const normalized = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const normalizeDurationMinutes = (durationHours) => {
  const hours = Number(durationHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return HALF_HOUR_MINUTES;
  }
  const steps = Math.max(1, Math.round((hours * 60) / HALF_HOUR_MINUTES));
  return steps * HALF_HOUR_MINUTES;
};

const buildRequiredSlotTimes = (startTime, durationMinutes) => {
  const startMinutes = timeStringToMinutes(startTime);
  if (startMinutes === null) return [];
  const steps = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  const times = [];
  for (let i = 0; i < steps; i++) {
    const minutes = startMinutes + i * HALF_HOUR_MINUTES;
    times.push(minutesToTimeString(minutes));
  }
  return times;
};

const extractInstructorSlots = (availability, date, instructorId) => {
  if (!Array.isArray(availability)) return [];
  const dayData = availability.find((day) => day.date === date);
  if (!dayData || !Array.isArray(dayData.slots)) return [];
  return dayData.slots.filter((slot) => String(slot.instructorId) === String(instructorId));
};

const findAlternativeSlots = (slots, durationMinutes, requestedMinutes) => {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  const stepsNeeded = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  const sortedSlots = [...slots].sort((a, b) => {
    const aMinutes = timeStringToMinutes(a.time) ?? 0;
    const bMinutes = timeStringToMinutes(b.time) ?? 0;
    return aMinutes - bMinutes;
  });

  const suggestions = [];
  for (let i = 0; i <= sortedSlots.length - stepsNeeded; i++) {
    const window = sortedSlots.slice(i, i + stepsNeeded);
    if (!window.every((slot) => slot.status === 'available')) {
      continue;
    }

    const windowStartMinutes = timeStringToMinutes(window[0].time);
    if (windowStartMinutes === null || windowStartMinutes === requestedMinutes) {
      continue;
    }

    const endMinutes = windowStartMinutes + durationMinutes;
    suggestions.push({
      startTime: window[0].time,
      endTime: minutesToTimeString(endMinutes),
      startHour: windowStartMinutes / 60,
      duration: durationMinutes / 60
    });

    if (suggestions.length >= 3) {
      break;
    }
  }

  return suggestions;
};

const preflightCheckGroupSlot = async ({ date, instructorId, startTime, durationHours }) => {
  if (!date || !instructorId || !startTime) {
    return { ok: true };
  }

  try {
    const availability = await getAvailableSlots(date, date, { instructorIds: [instructorId] });
    const relevantSlots = extractInstructorSlots(availability, date, instructorId);

    if (!relevantSlots || relevantSlots.length === 0) {
      return { ok: true };
    }

    const durationMinutes = normalizeDurationMinutes(durationHours);
    const requiredTimes = buildRequiredSlotTimes(startTime, durationMinutes);

    const allAvailable = requiredTimes.every((time) => {
      const slotMatch = relevantSlots.find((slot) => slot.time === time);
      return slotMatch && slotMatch.status === 'available';
    });

    if (allAvailable) {
      return { ok: true };
    }

    const requestedMinutes = timeStringToMinutes(startTime);
    const suggestions = findAlternativeSlots(relevantSlots, durationMinutes, requestedMinutes ?? undefined);
    return {
      ok: false,
      suggestions
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Preflight availability check failed:', error);
    return { ok: true };
  }
};

/**
 * Step-by-step booking modal component
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to close the modal
 * @param {Function} props.onBookingCreated - Optional callback when booking is created
 * @param {Object} props.prefilledCustomer - Optional customer data for pre-filling
 * @param {Object} props.prefilledInstructor - Optional instructor data for pre-filling
 * @param {string} props.prefilledDate - Optional date for pre-filling (YYYY-MM-DD format)
 * @returns {JSX.Element} StepBookingModal component
 */
// eslint-disable-next-line complexity
const StepBookingModal = ({ isOpen, onClose, onBookingCreated, prefilledCustomer, prefilledInstructor, prefilledDate, onSwitchToBulk }) => {
  const { selectedSlot, services, users, instructors, refreshData, createBooking } = useCalendar();
  const { showSuccess, showError } = useToast();
  
  // Initialize booking form with pre-filled data
  // eslint-disable-next-line complexity
  const initialFormData = useMemo(() => {
    const baseData = {
      // Pre-fill customer data if provided
      userId: prefilledCustomer?.id || '',
      userName: prefilledCustomer?.name || prefilledCustomer?.first_name && prefilledCustomer?.last_name 
        ? `${prefilledCustomer.first_name} ${prefilledCustomer.last_name}`.trim() 
        : '',
      userEmail: prefilledCustomer?.email || '',
      userPhone: prefilledCustomer?.phone || '',
      
      // Pre-fill instructor data if provided
      instructorId: prefilledInstructor?.id || '',
      instructorName: prefilledInstructor?.name || '',
      
      // Pre-fill participants array
      participants: prefilledCustomer ? [{
        userId: prefilledCustomer.id,
        userName: prefilledCustomer.name || `${prefilledCustomer.first_name || ''} ${prefilledCustomer.last_name || ''}`.trim(),
        userEmail: prefilledCustomer.email || '',
        userPhone: prefilledCustomer.phone || '',
        isPrimary: true,
        paymentStatus: 'paid', // Pay-and-go: default to paid
        notes: ''
      }] : []
    };

    // Add selected slot data if available
    if (selectedSlot) {
      return {
        ...baseData,
        date: selectedSlot.date || '',
        startTime: selectedSlot.startTime || '',
        endTime: selectedSlot.endTime || '',
        instructorId: selectedSlot.instructorId || baseData.instructorId,
        instructorName: selectedSlot.instructorName || baseData.instructorName,
      };
    }

    // If no selected slot but we have a prefilled date, use it
    if (prefilledDate) {
      return {
        ...baseData,
        date: prefilledDate,
      };
    }

    return baseData;
  }, [prefilledCustomer, prefilledInstructor, prefilledDate, selectedSlot]);

  // Use the optimized booking form hook
  const { 
    formData, 
    updateFormData, 
    resetFormData, 
    validateStep, 
    getValidationMessage, 
    hasUnsavedChanges 
  } = useBookingForm(initialFormData);
  
  // Current step state with centralized loading
  const [currentStep, setCurrentStep] = useState(1);
  const [isStepLoading, setIsStepLoading] = useState(false);
  const totalSteps = 5; // Updated: User -> Service -> Packages -> Time/Instructor -> Confirmation
  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  // Package assignment modal state
  const [isPackageManagerOpen, setIsPackageManagerOpen] = useState(false);
  const [packageManagerCustomer, setPackageManagerCustomer] = useState(null);
  const [showPackageDropdown, setShowPackageDropdown] = useState(false);
  
  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setSubmitStatus(null);
      // Add body class for modal
      document.body.classList.add('modal-open');
    } else {
      // Reset form when modal closes
      resetFormData();
      setCurrentStep(1);
      setSubmitStatus(null);
      setIsSubmitting(false);
      setIsStepLoading(false);
      setShowPackageDropdown(false);
      // Remove body class when modal closes
      document.body.classList.remove('modal-open');
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, resetFormData]);

  // Close package dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showPackageDropdown && !e.target.closest('.relative')) {
        setShowPackageDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showPackageDropdown]);
  
  // Auto-advance to step 2 if customer is pre-filled
  useEffect(() => {
    if (isOpen && prefilledCustomer && currentStep === 1 && formData.participants?.length > 0) {
      const timer = setTimeout(() => {
        setCurrentStep(2);
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, prefilledCustomer, currentStep, formData.participants]);

  // Prevent page refresh during booking process with proper cleanup
  useEffect(() => {
    if (!isOpen || (currentStep === 1 && !isSubmitting)) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isOpen, currentStep, isSubmitting]);

  // Optimized form data updates with useCallback to prevent unnecessary re-renders
  // (updateFormData is now provided by useBookingForm hook)

  // Optimized step navigation with loading states
  const nextStep = useCallback(() => {
    if (!validateStep(currentStep)) {
      setSubmitStatus({ 
        success: false, 
        message: getValidationMessage(currentStep) 
      });
      return;
    }
    
    setIsStepLoading(true);
    setSubmitStatus(null);
    
    setTimeout(() => {
      if (currentStep < totalSteps) {
        setCurrentStep(currentStep + 1);
      }
      setIsStepLoading(false);
    }, 150); // Reduced loading time for better UX
  }, [currentStep, totalSteps, validateStep, getValidationMessage]);
  
  // Navigate to previous step
  const _prevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setSubmitStatus(null); // Clear any error messages when going back
    }
  }, [currentStep]);  
  
  // Enhanced modal close with better UX and state management
  const handleClose = useCallback((forceClose = false) => {
    if (hasUnsavedChanges && !forceClose) {
      const confirmClose = window.confirm(
        'You have unsaved changes that will be lost. Are you sure you want to close?'
      );
      if (!confirmClose) return;
    }

    // Reset all state cleanly
    setCurrentStep(1);
    setSubmitStatus(null);
    setIsSubmitting(false);
    setIsStepLoading(false);
    resetFormData();
    
    onClose();
  }, [hasUnsavedChanges, resetFormData, onClose]);

  // Handle form submission with comprehensive error handling
  // eslint-disable-next-line complexity
  const handleSubmit = useCallback(async () => {
    // Final validation before submission
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) {
      setSubmitStatus({ 
        success: false, 
        message: 'Please complete all required fields before submitting' 
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);
    try {
      
      // Validate required services data
      if (!services || services.length === 0) {
        throw new Error('No services available. Please refresh and try again.');
      }
      
      // Get selected service details with validation
      const selectedService = services.find(service => service.id === formData.serviceId);
      if (!selectedService) {
        throw new Error('Selected service not found. Please refresh and try again.');
      }
      
      const serviceName = selectedService.name;
      // Get booking time and calculate duration with proper validation
      let bookingTime = formData.startTime || selectedSlot?.startTime || selectedSlot?.time;
      let endTime = formData.endTime || selectedSlot?.endTime;
      let bookingDuration = Number(formData.duration) || 1; // Use manual duration from form data first, fallback to 1 hour
      
      // Handle time format validation and extraction
      if (bookingTime && typeof bookingTime === 'string') {
        if (bookingTime.includes('-')) {
          // For time ranges like "09:00-11:00", split and use start time
          const [startTime, extractedEndTime] = bookingTime.split('-').map(t => t.trim());
          bookingTime = startTime;
          endTime = endTime || extractedEndTime;
        }
      }
      
      // Only recalculate duration if no manual duration was provided
      if (!formData.duration && bookingTime && endTime && typeof bookingTime === 'string' && typeof endTime === 'string') {
        try {
          const [startHour, startMinute] = bookingTime.split(':').map(Number);
          const [endHour, endMinute] = endTime.split(':').map(Number);
          
          if (!isNaN(startHour) && !isNaN(startMinute) && !isNaN(endHour) && !isNaN(endMinute)) {
            const startTotalMinutes = (startHour * 60) + startMinute;
            const endTotalMinutes = (endHour * 60) + endMinute;
            bookingDuration = Math.max(0.5, (endTotalMinutes - startTotalMinutes) / 60); // Minimum 30 minutes
            
            // DEBUG: Log the duration calculation
            // console.log('🕐 DURATION DEBUG (calculated from times):', {
            //   startTime: `${startHour}:${startMinute.toString().padStart(2, '0')}`,
            //   endTime: `${endHour}:${endMinute.toString().padStart(2, '0')}`,
            //   startTotalMinutes,
            //   endTotalMinutes,
            //   calculatedDuration: bookingDuration,
            //   usePackageHours: formData.usePackageHours
            // });
          }
        } catch {
          // Fallback to default duration when calculation fails
          bookingDuration = Number(formData.duration) || 1;
        }
      } else if (formData.duration) {
        // Use manual duration from form data
        bookingDuration = Number(formData.duration) || 1;
      }
      
      // Ensure we have valid time data
      if (!bookingTime || !endTime) {
        throw new Error('Invalid time data: Both start and end times are required');
      }
      // DEBUG: Log complete form data to understand package selection
      // Debug data removed for production

      // Prepare booking data for the context with complete validation
        // Compute final pricing: deduct package hours if selected
        const plannedHours = bookingDuration;
        const hourlyRate = Number(selectedService.price || 0);
        const packageHoursAvailable = (formData.usePackageHours && formData.selectedPackage)
          ? Number(formData.selectedPackage.remainingHours || 0)
          : 0;
        const participantsCount = (formData.participants?.length && formData.participants.length > 1)
          ? formData.participants.length
          : 1;
        const finalPrice = computeBookingPrice({
          plannedHours,
          hourlyRate,
          packageHoursAvailable,
          // 0.25h granularity (15 minutes), configurable later if needed
          step: 0.25,
          participants: participantsCount
        });

        const bookingData = {
          date: formData.date || selectedSlot?.date,
          time: bookingTime,
          startTime: bookingTime,
          endTime: endTime,
          duration: bookingDuration,
          instructorId: formData.instructorId,
          instructorName: formData.instructorName,
          serviceId: formData.serviceId,
          serviceName: serviceName,
          userId: formData.isNewUser ? null : formData.userId, // Don't send userId for new users
          user: {
            name: formData.userName,
            email: formData.userEmail || '',
            phone: formData.userPhone || '',
            notes: formData.notes || ''
          },
          price: hourlyRate,
          totalCost: finalPrice,
          usePackageHours: formData.usePackageHours && formData.selectedPackage ? true : false, // Only true if package is selected
          paymentMethod: (formData.usePackageHours && formData.selectedPackage) ? 'package' : 'cash',
          customerPackageId: formData.usePackageHours && formData.selectedPackage ? formData.selectedPackage.id : null, // Include specific package ID
          // Group booking specific data
          isGroupBooking: formData.participants?.length > 1, // Auto-detect based on participant count
          participants: formData.participants || []
        };

        // DEBUG: Log final booking data being prepared
  // Create booking - automatically use group booking endpoint if multiple participants
      let response;
      if (formData.participants?.length > 1) {
        // Call group booking API directly for multiple participants
        const token = localStorage.getItem('token');
        
        // Prepare participants with package information
        const processedParticipants = formData.participants.map(participant => ({
          userId: participant.userId,
          userName: participant.userName,
          userEmail: participant.userEmail,
          userPhone: participant.userPhone,
          isPrimary: participant.isPrimary === true, // Ensure boolean
          usePackage: participant.usePackage === true && participant.selectedPackageId ? true : false, // Only true if package is selected
          // Align field with backend expectation
          customerPackageId: participant.selectedPackageId || participant.customerPackageId,
          paymentStatus: (participant.usePackage && participant.selectedPackageId) ? 'package' : (participant.paymentStatus || 'paid'), // Pay-and-go: default to paid
          manualCashPreference: participant.manualCashPreference === true,
          notes: participant.notes || ''
        }));
        
        const groupBookingData = {
          date: formData.date || selectedSlot?.date,
          start_hour: parseFloat(bookingTime.split(':')[0]) + (parseFloat(bookingTime.split(':')[1]) / 60),
          duration: bookingDuration,
          instructor_user_id: formData.instructorId,
          service_id: formData.serviceId,
          status: 'pending',
          notes: formData.notes || '',
          location: 'TBD',
          participants: processedParticipants,
          allowNegativeBalance: formData.allowNegativeBalance === true // Allow wallet to go negative if explicitly enabled
        };
        
        // Validate data before sending
        if (!groupBookingData.date) {
          throw new Error('Date is required for group booking');
        }
        if (!groupBookingData.instructor_user_id) {
          throw new Error('Instructor is required for group booking');
        }
        if (!groupBookingData.service_id) {
          throw new Error('Service is required for group booking');
        }
        if (groupBookingData.start_hour < 6 || groupBookingData.start_hour > 23) {
          throw new Error(`Invalid time: ${bookingTime}. Must be between 06:00 and 23:00`);
        }
        if (processedParticipants.some(p => !p.userId)) {
          throw new Error('All participants must have a valid user ID');
        }
        
        const availabilityStatus = await preflightCheckGroupSlot({
          date: groupBookingData.date,
          instructorId: groupBookingData.instructor_user_id,
          startTime: bookingTime,
          durationHours: bookingDuration
        });

        if (!availabilityStatus.ok) {
          setSubmitStatus({
            type: 'conflict',
            message: 'The selected time is no longer available. Please choose another available slot.',
            suggestedSlots: availabilityStatus.suggestions || [],
            date: groupBookingData.date
          });

          setCurrentStep(2);
          updateFormData({
            startTime: '',
            endTime: '',
            slotRefreshKey: Date.now()
          });
          return;
        }

        const apiResponse = await fetch('/api/bookings/group', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(groupBookingData)
        });
        
        if (!apiResponse.ok) {
          let errorData = {};
          try {
            errorData = await apiResponse.json();
          } catch {
            // Ignore JSON parse errors and fallback to generic message
          }

          const requestError = new Error(errorData.error || 'Failed to create group booking');
          requestError.status = apiResponse.status;

          if (errorData.details) {
            requestError.details = errorData.details;
          }

          if (errorData.conflicts) {
            requestError.conflicts = errorData.conflicts;
          }

          if (errorData.requiresConfirmation) {
            requestError.requiresConfirmation = errorData.requiresConfirmation;
          }

          throw requestError;
        }
        
        response = await apiResponse.json();
        // Add success indicator for group bookings
        response.isGroupBooking = true;
      } else if (formData.participants?.length === 1) {
        // Single participant booking - use participant data, fallback to main booking data
        const participant = formData.participants[0];
        
        const singleBookingData = {
          ...bookingData,
          userId: participant.userId,
          user: {
            name: participant.userName,
            email: participant.userEmail || '',
            phone: participant.userPhone || '',
            notes: participant.notes || ''
          },
          // Use participant package data if available, otherwise use main booking data
          usePackageHours: (participant.usePackage === true && participant.selectedPackageId) ? true : (bookingData.usePackageHours && formData.selectedPackage),
          customerPackageId: participant.selectedPackageId || (formData.selectedPackage ? bookingData.customerPackageId : null),
          paymentMethod: ((participant.usePackage === true && participant.selectedPackageId) || (bookingData.usePackageHours === true && formData.selectedPackage)) ? 'package' : 'cash'
        };
        
        response = await createBooking(singleBookingData);
      } else {
        // Fallback to existing single booking logic for backwards compatibility
        response = await createBooking(bookingData);
      }
      
      if (!response) {
        throw new Error('No response received from booking creation');
      }

      // Check if there's a conflict (before checking for ID)
      if (response.success === false && response.requiresConfirmation && response.conflictDetails) {
        setSubmitStatus({
          type: 'conflict',
          message: response.error,
          conflictDetails: response.conflictDetails,
          conflicts: response.conflicts || [],
          suggestedSlots: [], // Frontend conflict detection doesn't have suggestions
          date: formData.date
        });
        return; // Don't proceed with success logic
      }
      
      if (!response.id && !response.bookingId) {
        throw new Error('Booking was created but no ID was returned');
      }

      // Success message logic - based on service type, not just participant count
      const isGroupLessonService = isGroupService(selectedService);
      const participantCount = formData.participants?.length || 1;
      
      if (isGroupLessonService && participantCount > 1) {
        // Group lesson with multiple participants
        showSuccess(`Group lesson booked successfully with ${participantCount} participants!`);
      } else if (formData.participants?.length === 1) {
        const participant = formData.participants[0];
        if (participant.usePackage && participant.selectedPackageId) {
          showSuccess(`Lesson booked successfully for ${participant.userName} using package hours!`);
        } else {
          const lessonType = isGroupLessonService ? 'Group lesson' : 'Private lesson';
          showSuccess(`${lessonType} booked successfully for ${participant.userName}!`);
        }
      } else if (formData.usePackageHours && formData.selectedPackage) {
        // Fallback for backwards compatibility
        showSuccess(`Booking created successfully for ${formData.userName}! Package hours were used for this booking.`);
      } else {
        // Standard booking success message
        const lessonType = isGroupLessonService ? 'Group lesson' : 'Private lesson';
        showSuccess(`${lessonType} booked successfully for ${formData.userName}!`);
      }
      
      // Calendar data will be updated automatically by the unified refresh system
      // No manual refresh needed - new booking is added to state immediately
      
      // Call the onBookingCreated callback if provided
      if (onBookingCreated) {
        onBookingCreated();
      }
      
      // Close modal immediately - no delay, no confirmation
      handleClose(true);
    } catch (error) {
      // Error logged for debugging in development
      
      // Handle enhanced backend conflict errors with suggestions
      if (error.isConflictError && error.details) {
        const { details } = error;
        setSubmitStatus({
          type: 'conflict',
          message: details.message,
          conflictingSlot: details.conflictingSlot,
          requestedSlot: details.requestedSlot,
          suggestedSlots: details.suggestedSlots || [],
          date: details.date
        });
        return; // Don't show generic error, let the conflict UI handle it
      }
      
      // Handle 400 status errors as conflicts even if not properly marked
      if (error.status === 400 || (error.message && error.message.includes('conflict'))) {
        setSubmitStatus({
          type: 'conflict',
          message: error.details?.message || error.message || 'Time slot conflict detected',
          conflictDetails: error.details,
          conflicts: error.conflicts || [],
          suggestedSlots: error.details?.suggestedSlots || [],
          date: error.details?.date || formData.date
        });
        return;
      }
      
      // Handle frontend conflict detection fallback (shouldn't happen with backend detection)
      if (error.message === 'Booking conflict detected' || (error.conflictDetails && error.conflicts)) {
        setSubmitStatus({
          type: 'conflict',
          message: error.message || 'Time slot conflict detected',
          conflictDetails: error.conflictDetails,
          conflicts: error.conflicts || [],
          suggestedSlots: [], // Frontend conflict detection doesn't have suggestions
          date: formData.date
        });
        return;
      }
      
      // Handle wallet balance errors specifically
      if (error.message && (error.message.includes('Insufficient wallet balance') || error.message.includes('wallet'))) {
        showError(`Payment failed: ${error.message}. Please ensure participants have sufficient wallet balance or select a different payment method.`);
        return;
      }
      
      // Provide specific error messages based on error type
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.status === 429) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      }
      
      // Show error toast instead of modal message
      showError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    formData,
    services,
    selectedSlot,
    createBooking,
    showSuccess,
    onBookingCreated,
    handleClose,
    showError,
    validateStep,
    updateFormData,
    setCurrentStep
  ]);

  // Enhanced step navigation with better validation UX
  const handleNextStep = useCallback(() => {
    if (validateStep(currentStep)) {
      nextStep();
    } else {
      setSubmitStatus({ 
        success: false, 
        message: getValidationMessage(currentStep) 
      });
    }
  }, [currentStep, nextStep, validateStep, getValidationMessage]);

  // Calculate progress based on current step position (25% per step)
  const calculateProgress = useCallback(() => {
    // Simple step-based progress: each step = 25%
    const totalProgress = (currentStep / totalSteps) * 100;

    return totalProgress;
  }, [currentStep, totalSteps]);

  const progressPercentage = calculateProgress();
  
  // Optimized modal close handling with unsaved changes check
  // Removed unused closeModal

  // Memoized step rendering with error boundaries - Updated to pass navigation props
  const renderCurrentStep = useMemo(() => {
    const stepProps = {
      formData,
      updateFormData,
      services,
      instructors,
      // Remove onNext and onPrev from individual steps - will be handled in fixed footer
      hideNavigation: true // Flag to hide step-specific navigation buttons
    };

    const stepComponents = {
      1: () => (
        <StepErrorBoundary stepName="User Details">
          <UserSelectionStep {...stepProps} users={users} onRefreshUsers={refreshData} />
        </StepErrorBoundary>
      ),
      2: () => (
        <StepErrorBoundary stepName="Time & Instructor">
          <TimeInstructorStep {...stepProps} instructors={instructors} onSwitchToBulk={onSwitchToBulk} />
        </StepErrorBoundary>
      ),
      3: () => (
        <StepErrorBoundary stepName="Service Selection">
          <ServiceSelectionStep {...stepProps} services={services} />
        </StepErrorBoundary>
      ),
      4: () => (
        <StepErrorBoundary stepName="Package Assignment">
          <ParticipantPackageStep {...stepProps} />
        </StepErrorBoundary>
      ),
      5: () => (
        <StepErrorBoundary stepName="Confirmation">
          <ConfirmationStep 
            {...stepProps} 
            hideNavigation={true} // Confirmation step will use the fixed footer
          />
        </StepErrorBoundary>
      )
    };

    return stepComponents[currentStep]?.() || null;
  }, [currentStep, formData, updateFormData, services, instructors, users, refreshData, onSwitchToBulk]);

  // Determine if the current step allows proceeding
  const canProceed = useMemo(() => {
    return validateStep(currentStep);
  }, [currentStep, validateStep]);

  // Get step-specific button text
  const getStepButtonText = useCallback(() => {
    switch (currentStep) {
      case 1:
        const participantCount = formData.participants?.length || 0;
        if (participantCount === 0) {
          return 'Select a customer to continue';
        } else if (participantCount === 1) {
          return 'Continue with Single Booking';
        } else {
          return `Continue with Group Booking (${participantCount} participants)`;
        }
      case 2:
        return 'Continue to Service Selection';
      case 3:
        return 'Continue to Package Selection';
      case 4:
        return 'Review & Confirm Booking';
      case 5:
        return isSubmitting ? 'Creating Booking...' : 'Create Booking';
      default:
        return 'Continue';
    }
  }, [currentStep, formData.participants, isSubmitting]);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="step-booking-modal" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="step-booking-overlay" />
        </Transition.Child>

        <div className="step-booking-overlay">
          <Transition.Child
            as={Fragment}
            enter="step-booking-enter"
            enterFrom="step-booking-enter"
            enterTo="step-booking-enter-active"
            leave="step-booking-exit"
            leaveFrom="step-booking-exit"
            leaveTo="step-booking-exit-active"
          >
            <Dialog.Panel className="step-booking-container">
              {/* Header with Progress */}
              <div className="step-booking-header">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex-1 min-w-0 pr-4">
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">
                      {currentStep === 1 && "Select Customers"}
                      {currentStep === 2 && "Choose Time & Instructor"}
                      {currentStep === 3 && "Service & Payment"}
                      {currentStep === 4 && "Packages & Balance Options"}
                      {currentStep === 5 && "Confirm Booking"}
                    </h2>
                    {/* Subtitle removed per request */}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Assign Package Dropdown - show for all selected customers */}
                    {formData.participants?.length > 0 && formData.participants.some(p => p?.userId) && (
                      <div className="relative">
                        <button
                          type="button"
                          className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-600 hover:text-green-700 border border-transparent hover:border-green-200 rounded-md transition-colors"
                          onClick={() => {
                            const validParticipants = formData.participants.filter(p => p?.userId);
                            if (validParticipants.length === 1) {
                              // Single participant - open directly
                              setPackageManagerCustomer({
                                id: validParticipants[0].userId,
                                name: validParticipants[0].userName,
                                email: validParticipants[0].userEmail
                              });
                              setIsPackageManagerOpen(true);
                            } else {
                              // Multiple participants - show dropdown
                              setShowPackageDropdown(!showPackageDropdown);
                            }
                          }}
                          disabled={isSubmitting}
                          aria-label="Assign Package to Customer"
                        >
                          <GiftIcon className="h-4 w-4" />
                          <span className="whitespace-nowrap">Assign Package</span>
                          {formData.participants.filter(p => p?.userId).length > 1 && (
                            <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          className="sm:hidden inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md transition-colors whitespace-nowrap"
                          onClick={() => {
                            const validParticipants = formData.participants.filter(p => p?.userId);
                            if (validParticipants.length === 1) {
                              setPackageManagerCustomer({
                                id: validParticipants[0].userId,
                                name: validParticipants[0].userName,
                                email: validParticipants[0].userEmail
                              });
                              setIsPackageManagerOpen(true);
                            } else {
                              setShowPackageDropdown(!showPackageDropdown);
                            }
                          }}
                          disabled={isSubmitting}
                          aria-label="Assign Package to Customer"
                        >
                          <GiftIcon className="h-4 w-4" />
                          <span>Package</span>
                        </button>
                        
                        {/* Dropdown for multiple participants */}
                        {showPackageDropdown && formData.participants.filter(p => p?.userId).length > 1 && (
                          <div className="absolute right-0 mt-1 w-56 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                            <div className="py-1">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b">
                                Select customer to assign package:
                              </div>
                              {formData.participants.filter(p => p?.userId).map((participant, index) => (
                                <button
                                  key={participant.userId || index}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors"
                                  onClick={() => {
                                    setPackageManagerCustomer({
                                      id: participant.userId,
                                      name: participant.userName,
                                      email: participant.userEmail
                                    });
                                    setIsPackageManagerOpen(true);
                                    setShowPackageDropdown(false);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <GiftIcon className="h-4 w-4 text-green-500" />
                                    <div>
                                      <div className="font-medium">{participant.userName || 'Unknown'}</div>
                                      <div className="text-xs text-gray-500">{participant.userEmail || ''}</div>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-transparent hover:border-blue-200 rounded-md transition-colors"
                      onClick={() => onSwitchToBulk && onSwitchToBulk()}
                      disabled={isSubmitting}
                      aria-label="Open Multiple Booking Form"
                    >
                      <UserGroupIcon className="h-4 w-4" />
                      <span className="whitespace-nowrap">Multiple Booking Form</span>
                    </button>
                    <button
                      type="button"
                      className="sm:hidden inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors whitespace-nowrap"
                      onClick={() => onSwitchToBulk && onSwitchToBulk()}
                      disabled={isSubmitting}
                      aria-label="Open Multiple Booking Form"
                    >
                      <UserGroupIcon className="h-4 w-4" />
                      <span>Multi</span>
                    </button>
                    <button
                      type="button"
                      className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                      onClick={handleClose}
                      disabled={isSubmitting}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {/* Enhanced Progress Indicator */}
                <div className="step-progress">
                  <div className="step-progress-bar">
                    <div 
                      className="step-progress-fill"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                  <div className="step-labels">
                    <span className={`step-label ${currentStep >= 1 ? (currentStep === 1 ? 'active' : 'completed') : ''}`}>
                      {currentStep > 1 ? '✓ ' : ''}Customers
                    </span>
                    <span className={`step-label ${currentStep >= 2 ? (currentStep === 2 ? 'active' : 'completed') : ''}`}>
                      {currentStep > 2 ? '✓ ' : ''}Time
                    </span>
                    <span className={`step-label ${currentStep >= 3 ? (currentStep === 3 ? 'active' : 'completed') : ''}`}>
                      {currentStep > 3 ? '✓ ' : ''}Service
                    </span>
                    <span className={`step-label ${currentStep >= 4 ? (currentStep === 4 ? 'active' : 'completed') : ''}`}>
                      {currentStep > 4 ? '✓ ' : ''}Packages
                    </span>
                    <span className={`step-label ${currentStep === 5 ? 'active' : ''}`}>
                      Confirm
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="step-booking-content">
                <div className="step-booking-content-inner">
                  {/* Status Messages */}
                  {submitStatus && (
                    <div className={`mb-6 p-4 rounded-lg ${
                      submitStatus.type === 'conflict' 
                        ? 'bg-amber-50 border border-amber-200' 
                        : submitStatus.success 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-red-50 border border-red-200'
                    }`}>
                      {submitStatus.type === 'conflict' ? (
                        <div className="flex items-start">
                          <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="ml-3 flex-1">
                            <h3 className="text-sm font-medium text-amber-800">Time Slot Conflict</h3>
                            <p className="mt-1 text-sm text-amber-700">{submitStatus.message}</p>
                            {submitStatus.suggestedSlots?.length > 0 && (
                              <div className="mt-4">
                                <h4 className="text-sm font-medium text-amber-800 mb-2">Available Times:</h4>
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                  {submitStatus.suggestedSlots.map((slot) => (
                                    <button
                                      key={`${slot.startTime || 'start'}-${slot.endTime || 'end'}`}
                                      onClick={() => {
                                        updateFormData({
                                          time: slot.startTime,
                                          startTime: slot.startTime,
                                          endTime: slot.endTime,
                                          start_hour: slot.startHour,
                                          duration: slot.duration
                                        });
                                        setSubmitStatus(null);
                                      }}
                                      className="w-full text-left px-3 py-2 bg-white border border-amber-300 rounded-md hover:bg-amber-50 transition-colors"
                                    >
                                      <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-amber-800">
                                          {slot.startTime} - {slot.endTime}
                                        </span>
                                        <span className="text-xs text-amber-600">{slot.duration}h</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="mt-4 flex gap-3">
                              <button
                                onClick={() => setSubmitStatus(null)}
                                className="px-3 py-2 text-sm bg-amber-100 text-amber-800 rounded-md hover:bg-amber-200"
                              >
                                Dismiss
                              </button>
                              <button
                                onClick={() => {
                                  setCurrentStep(2);
                                  setSubmitStatus(null);
                                }}
                                className="px-3 py-2 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                              >
                                Choose Different Time
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            {submitStatus.success ? (
                              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <div className="ml-3">
                            <p className={`text-sm ${submitStatus.success ? 'text-green-800' : 'text-red-800'}`}>
                              {submitStatus.message}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step Content */}
                  {isStepLoading ? (
                    <div className="step-booking-loading">
                      <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
                        <p className="text-gray-600">Loading step...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-0">
                      {renderCurrentStep}
                    </div>
                  )}
                </div>
              </div>

              {/* Fixed Footer with Navigation */}
              <div className="step-booking-footer">
                <div className="flex gap-3">
                  {/* Previous Button */}
          {currentStep > 1 && (
                    <button
                      type="button"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                      onClick={_prevStep}
                    >
                      <ChevronLeftIcon className="h-4 w-4 mr-1.5 inline" />
                      Previous
                    </button>
                  )}
                  
                  {/* Next/Submit Button */}
                  <button
                    type="button"
                    className={`${currentStep === 1 ? 'w-full' : 'flex-2'} px-3 py-2 border border-transparent rounded-md shadow-sm text-sm md:text-base font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      canProceed && !isSubmitting && !isStepLoading
                        ? 'bg-blue-600 hover:bg-blue-700' 
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                    onClick={currentStep === 5 ? handleSubmit : handleNextStep}
                    disabled={!canProceed || isSubmitting || isStepLoading}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Creating Booking...
                      </>
                    ) : isStepLoading ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Loading...
                      </>
                    ) : (
                      <>
                        {getStepButtonText()}
                        {currentStep < 4 && <ChevronRightIcon className="h-4 w-4 ml-1.5 inline" />}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>

      {/* Package Manager Modal */}
      {packageManagerCustomer && (
        <CustomerPackageManager
          customer={packageManagerCustomer}
          visible={isPackageManagerOpen}
          onClose={() => {
            setIsPackageManagerOpen(false);
            setPackageManagerCustomer(null);
          }}
          onPackageAssigned={() => {
            // Refresh participant packages if needed
            setIsPackageManagerOpen(false);
            setPackageManagerCustomer(null);
          }}
        />
      )}
    </Transition>
  );
};

export default StepBookingModal;
