import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
// eslint-disable-next-line no-unused-vars
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
// eslint-disable-next-line no-unused-vars
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useCalendar } from '../contexts/CalendarContext';
// eslint-disable-next-line no-unused-vars
import BookingConfirmation from './BookingConfirmation';
// eslint-disable-next-line no-unused-vars
import BookingConflictModal from './BookingConflictModal';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

/**
 * Booking modal component for making new reservations
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to close the modal
 * @returns {JSX.Element} BookingModal component
 */
const BookingModal = ({ isOpen, onClose }) => {
  const { selectedSlot, services, users, createBooking } = useCalendar();
  const { formatCurrency, businessCurrency } = useCurrency();
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    serviceId: '',
    userId: '', // Add userId for student selection
    notes: ''
  });
  
  // Conflict detection state
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState(null);
  const [pendingBookingData, setPendingBookingData] = useState(null);
    // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  
  // Booking confirmation state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  
  // Reset form when the modal opens with a new slot
  useEffect(() => {
    if (isOpen && selectedSlot) {
      setFormData({
        name: '',
        email: '',
        phone: '',
        serviceId: '',
        userId: '', // Reset userId as well
        notes: ''
      });
      setSubmitStatus(null);
      setShowConfirmation(false);
      setConfirmedBooking(null);
    }
  }, [isOpen, selectedSlot]);
  
  /**
   * Handle form input changes
   * @param {Event} e - Change event
   */  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  /**
   * Handle adding booking to calendar
   */
  const handleAddToCalendar = () => {
    if (!confirmedBooking) return;
    
    const { date, time, serviceName, instructorName } = confirmedBooking;
    
    // Calculate end time
    const duration = confirmedBooking.duration || 1;
    const [startHour, startMin] = time.split(':').map(Number);
    const startDate = new Date(date);
    startDate.setHours(startHour, startMin, 0);
    
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + Math.floor(duration));
    endDate.setMinutes(startDate.getMinutes() + Math.round((duration % 1) * 60));
    
    // Format dates for Google Calendar link
    const formatDateForGCal = (date) => {
      return date.toISOString().replace(/-|:|\.\d+/g, '');
    };
    
    const startDateStr = formatDateForGCal(startDate);
    const endDateStr = formatDateForGCal(endDate);
    
    // Create Google Calendar link
    const text = `Kitesurfing Lesson`;
    const details = `${serviceName || 'Kitesurfing Lesson'} with ${instructorName || 'instructor'}`;
    const location = 'Kitesurfing School';
    
    const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${startDateStr}/${endDateStr}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
    
    window.open(googleCalendarUrl, '_blank');
  };
  /**
   * Calculate booking duration from time inputs
   */
  const calculateBookingDuration = (bookingTime, endTime) => {
    let bookingDuration = 1; // Default duration in hours
    
    if (bookingTime && endTime && typeof bookingTime === 'string' && typeof endTime === 'string') {
      try {
        const [startHour, startMinute] = bookingTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        
        if (!isNaN(startHour) && !isNaN(startMinute) && !isNaN(endHour) && !isNaN(endMinute)) {
          const startTotalMinutes = (startHour * 60) + startMinute;
          const endTotalMinutes = (endHour * 60) + endMinute;
          bookingDuration = Math.max(0.5, (endTotalMinutes - startTotalMinutes) / 60); // Minimum 30 minutes
        }
      } catch {
        // Fallback to default duration when calculation fails
        bookingDuration = 1;
      }
    }
    
    return bookingDuration;
  };

  /**
   * Prepare booking data for submission
   */
  const prepareBookingData = (selectedService, bookingTime, endTime, bookingDuration) => {
    const serviceName = selectedService.name;
    const servicePrice = selectedService.price || 0;
    
    return {
      date: formData.date || selectedSlot?.date,
      time: bookingTime,
      startTime: bookingTime,
      endTime: endTime,
      duration: bookingDuration,
      instructorId: formData.instructorId,
      instructorName: formData.instructorName,
      serviceId: formData.serviceId,
      serviceName: serviceName,
      userId: formData.isNewUser ? null : formData.userId,
      user: {
        name: formData.userName,
        email: formData.userEmail || '',
        phone: formData.userPhone || '',
        notes: formData.notes || ''
      },
      price: servicePrice,
      totalCost: servicePrice * bookingDuration,
      usePackageHours: formData.usePackageHours || false,
      paymentMethod: formData.usePackageHours ? 'package' : 'cash',
      customerPackageId: formData.usePackageHours && formData.selectedPackage ? formData.selectedPackage.id : null,
      isGroupBooking: formData.participants?.length > 1,
      participants: formData.participants || []
    };
  };

  /**
   * Handle group booking submission
   */
  const handleGroupBooking = async (bookingData) => {
    const token = localStorage.getItem('token');
    
    const processedParticipants = formData.participants.map(participant => ({
      userId: participant.userId,
      userName: participant.userName,
      userEmail: participant.userEmail,
      userPhone: participant.userPhone,
      isPrimary: participant.isPrimary,
      usePackage: participant.usePackage || false,
      selectedPackageId: participant.selectedPackageId,
      paymentStatus: participant.usePackage ? 'package' : (participant.paymentStatus || 'paid'), // Pay-and-go: default to paid
      notes: participant.notes || ''
    }));
    
    const groupBookingData = {
      date: formData.date || selectedSlot?.date,
      start_hour: parseFloat(bookingData.startTime.split(':')[0]) + (parseFloat(bookingData.startTime.split(':')[1]) / 60),
      duration: bookingData.duration,
      instructor_user_id: formData.instructorId,
      service_id: formData.serviceId,
      status: 'pending',
      notes: formData.notes || '',
      location: 'TBD',
      participants: processedParticipants
    };
    
    const apiResponse = await fetch('/api/bookings/group', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(groupBookingData)
    });
    
    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      throw new Error(errorData.error || 'Failed to create group booking');
    }
    
    const response = await apiResponse.json();
    response.isGroupBooking = true;
    return response;
  };

  /**
   * Handle single participant booking
   */
  const handleSingleParticipantBooking = async (bookingData) => {
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
      usePackageHours: (participant.usePackage === true || bookingData.usePackageHours === true) ? true : false,
      customerPackageId: participant.selectedPackageId || bookingData.customerPackageId,
      paymentMethod: (participant.usePackage === true || bookingData.usePackageHours === true) ? 'package' : 'cash'
    };
    
    return await createBooking(singleBookingData);
  };

  /**
   * Handle successful booking creation
   */
  // eslint-disable-next-line complexity
  const handleBookingSuccess = async (response) => {
    
    // Success message logic
    if (formData.participants?.length > 1) {
      const participantCount = formData.participants.length;
      setSubmitStatus({
        success: true,
        message: `Group booking created successfully with ${participantCount} participants!`
      });
    } else if (formData.participants?.length === 1) {
      const participant = formData.participants[0];
      if (participant.usePackage) {
        setSubmitStatus({
          success: true,
          message: `Booking created successfully for ${participant.userName}! Package hours were used for this booking.`
        });
      } else {
        setSubmitStatus({
          success: true,
          message: `Booking created successfully for ${participant.userName}!`
        });
      }
    } else if (formData.usePackageHours) {
      setSubmitStatus({
        success: true,
        message: `Booking created successfully for ${formData.userName}! Package hours were used for this booking.`
      });
    } else {
      setSubmitStatus({
        success: true,
        message: `Booking created successfully for ${formData.userName}!`
      });
    }

    // Store confirmed booking details for the confirmation component
    const bookingId = response.id || response.bookingId || 'TMP-' + Date.now().toString(36);
    setConfirmedBooking({
      bookingId,
      date: selectedSlot?.date,
      time: formData.startTime || selectedSlot?.startTime || selectedSlot?.time,
      duration: 1,
      instructorName: selectedSlot?.instructorName || selectedSlot?.instructor,
      serviceName: services.find(s => s.id === formData.serviceId)?.name,
      userName: formData.name
    });

    // Dispatch global refresh event
    window.dispatchEvent(new CustomEvent('booking-created', { detail: { bookingId } }));
    
    // Show confirmation component
    setShowConfirmation(true);
    
    // Reset form
    setFormData({
      name: '',
      email: '',
      phone: '',
      serviceId: '',
      userId: '',
      notes: ''
    });
  };

  /**
   * Handle booking submission errors
   */
  // eslint-disable-next-line complexity
  const handleBookingError = (error) => {
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
      return;
    }
    
    // Handle 400 status errors as conflicts
    if (error.status === 400 || (error.message && error.message.includes('conflict'))) {
      setSubmitStatus({
        type: 'conflict',
        message: error.message || 'Time slot conflict detected',
        conflictDetails: error.details,
        conflicts: [],
        suggestedSlots: [],
        date: formData.date
      });
      return;
    }
    
    // Handle frontend conflict detection fallback
    if (error.message === 'Booking conflict detected' || (error.conflictDetails && error.conflicts)) {
      setSubmitStatus({
        type: 'conflict',
        message: error.message || 'Time slot conflict detected',
        conflictDetails: error.conflictDetails,
        conflicts: error.conflicts || [],
        suggestedSlots: [],
        date: formData.date
      });
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
    
    setSubmitStatus({
      success: false,
      message: errorMessage
    });
  };

  /**
   * Handle form submission with comprehensive error handling
   */
  // eslint-disable-next-line complexity
  const handleSubmit = async (e, _forceCreate = false) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name || !formData.email || !formData.phone || !formData.serviceId) {
      setSubmitStatus({
        success: false,
        message: 'Please fill in all required fields'
      });
      return;
    }
    
    if (!selectedSlot) {
      setSubmitStatus({
        success: false,
        message: 'No time slot selected'
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitStatus(null);
      
      // Validate required services data
      if (!services || services.length === 0) {
        throw new Error('No services available. Please refresh and try again.');
      }
      
      // Get selected service details with validation
      const selectedService = services.find(service => service.id === formData.serviceId);
      if (!selectedService) {
        throw new Error('Selected service not found. Please refresh and try again.');
      }
      
      // Get booking time and calculate duration with proper validation
      let bookingTime = formData.startTime || selectedSlot?.startTime || selectedSlot?.time;
      let endTime = formData.endTime || selectedSlot?.endTime;
      
      // Handle time format validation and extraction
      if (bookingTime && typeof bookingTime === 'string' && bookingTime.includes('-')) {
        const [startTime, extractedEndTime] = bookingTime.split('-').map(t => t.trim());
        bookingTime = startTime;
        endTime = endTime || extractedEndTime;
      }
      
      // Calculate duration
      const bookingDuration = calculateBookingDuration(bookingTime, endTime);
      
      // Ensure we have valid time data
      if (!bookingTime || !endTime) {
        throw new Error('Invalid time data: Both start and end times are required');
      }
      
      // Prepare booking data for the context with complete validation
      const bookingData = prepareBookingData(selectedService, bookingTime, endTime, bookingDuration);

      // Create booking - automatically use group booking endpoint if multiple participants
      let response;
      
      if (formData.participants?.length > 1) {
        response = await handleGroupBooking(bookingData);
      } else if (formData.participants?.length === 1) {
        response = await handleSingleParticipantBooking(bookingData);
      } else {
        response = await createBooking(bookingData);
      }
      
      if (!response) {
        throw new Error('No response received from booking creation');
      }

      // Handle conflicts
      if (response.success === false && response.requiresConfirmation && response.conflictDetails) {
        setSubmitStatus({
          type: 'conflict',
          message: response.error,
          conflictDetails: response.conflictDetails,
          conflicts: response.conflicts || [],
          suggestedSlots: [],
          date: formData.date
        });
        return;
      }

      if (!response.id && !response.bookingId) {
        throw new Error('Booking was created but no ID was returned');
      }
    
      // Handle success
      await handleBookingSuccess(response);
      
    } catch (error) {
      handleBookingError(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  /**
   * Handle closing the confirmation
   */
  const handleConfirmationClose = () => {
    setShowConfirmation(false);
    onClose();
  };

  /**
   * Close conflict modal and clear pending state
   */
  const handleCancelConflict = () => {
    setShowConflictModal(false);
    setConflictData(null);
    setPendingBookingData(null);
  };

  /**
   * Force create booking after conflict confirmation
   */
  const handleForceCreate = async () => {
    if (!pendingBookingData) {
      handleCancelConflict();
      return;
    }
    
    try {
      setIsSubmitting(true);
      setSubmitStatus(null);
      
      const response = await createBooking(pendingBookingData, true);

      if (response && !response.success) {
        throw new Error(response.error || 'Failed to create booking');
      }

      // Success: close conflict modal and show confirmation
      setShowConflictModal(false);
      const bookingId = response.id || 'TMP-' + Date.now().toString(36);
      
      setSubmitStatus({
        success: true,
        message: 'Your booking was successful! You will receive a confirmation email shortly.'
      });

      const { date, startTime: time, duration, instructorName, serviceName } = pendingBookingData;
      setConfirmedBooking({
        bookingId,
        date,
        time,
        duration,
        instructorName,
        serviceName,
        userName: formData.name
      });

      window.dispatchEvent(new CustomEvent('booking-created', { detail: { bookingId } }));
      setShowConfirmation(true);

      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        serviceId: '',
        userId: '',
        notes: ''
      });
      
      // Clear conflict state
      setConflictData(null);
      setPendingBookingData(null);
    } catch (error) {
      setSubmitStatus({
        success: false,
        message: error.response?.data?.error || error.message || 'Something went wrong. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };
    /**
   * Format a date for display
   * @param {string} dateString - Date string in YYYY-MM-DD format
   * @returns {string} Formatted date string
   */
  const formatBookingDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };
  
  /**
   * Format time range for display
   * @param {string} timeRange - Time range string (e.g., "09:00-11:00")
   * @returns {string} Formatted time range with duration
   */  const formatTimeRange = (timeInput, endTimeInput) => {
    // Check if we're dealing with a time range string like "09:00-11:00"
    if (timeInput && typeof timeInput === 'string' && timeInput.includes('-')) {
      const [start, end] = timeInput.split('-');
      return `${start.trim()} - ${end.trim()}`;
    }
    
    // If we have explicit start and end times
    if (timeInput && endTimeInput) {
      try {
        const startTime = typeof timeInput === 'string' ? parseISO(timeInput) : timeInput;
        const endTime = typeof endTimeInput === 'string' ? parseISO(endTimeInput) : endTimeInput;
        return `${format(startTime, 'HH:mm')} - ${format(endTime, 'HH:mm')}`;
      } catch {
        return 'Invalid time format';
      }
    }
    
    // If we just have one time
    if (timeInput) {
      return timeInput;
    }
    
    return '';
  };
      if (!isOpen) return null;

  // Show confirmation if booking was successful
  // The main modal now includes both the booking form and confirmation dialog
  // but only one will be shown at a time based on state
  return (
  <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="booking-modal-overlay" onClose={onClose}>
        <TransitionChild
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </TransitionChild>
        
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              {/* Show either the booking form or confirmation based on state */}
              {showConfirmation && confirmedBooking ? (
                <div className="booking-confirmation-wrapper w-full max-w-md">
                  {/* Pass confirmedBooking to BookingConfirmation */}
                  <BookingConfirmation 
                    booking={confirmedBooking}
                    onClose={handleConfirmationClose}
                    onAddToCalendar={handleAddToCalendar}
                  />
                </div>
              ) : (
                <DialogPanel
                  className="booking-modal"
                  role="dialog"
                  aria-labelledby="booking-modal-title"
                  aria-describedby="booking-modal-description"
                >
                  <button 
                    className="modal-close-btn" 
                    onClick={onClose}
                    aria-label="Close booking form"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
        
        <div className="booking-modal-header">
          <h2 id="booking-modal-title">Book Your Kitesurfing Lesson</h2>
          {selectedSlot && (
            <p id="booking-modal-description" className="booking-details">
              <span className="booking-date">{formatBookingDate(selectedSlot.date)}</span>
              <span className="booking-time">
                {formatTimeRange(selectedSlot.time)}
              </span>
              {selectedSlot.instructor && 
                <span className="booking-instructor">with {selectedSlot.instructor}</span>}
              {selectedSlot.instructorName && !selectedSlot.instructor && 
                <span className="booking-instructor">with {selectedSlot.instructorName}</span>}
            </p>
          )}        </div>
        
        {submitStatus && (
          <div className={`submit-status ${submitStatus.success ? 'success' : 'error'}`}>
            {submitStatus.message}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="booking-form">
          <div className="form-group">
            <label htmlFor="name">Full Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              placeholder="Enter your full name"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="email">Email Address *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              placeholder="Enter your email"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="phone">Phone Number *</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              placeholder="Enter your phone number"
            />          </div>
          
          <div className="form-group">
            <label htmlFor="userId">Select Customer *</label>
            <select
              id="userId"
              name="userId"
              value={formData.userId}
              onChange={handleChange}
              required
              disabled={isSubmitting}
            >
              <option value="">Select a customer</option>
              {users.map((user) => {
                const isStudent = (user.role_name || user.role || '').toLowerCase() === 'student';
                const balanceInfo = isStudent ? ` - ${user.remaining_hours || 0} hours remaining` : '';
                return (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.email}){balanceInfo}
                  </option>
                );
              })}
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="serviceId">Service Type *</label>
            <select
              id="serviceId"
              name="serviceId"
              value={formData.serviceId}
              onChange={handleChange}
              required
              disabled={isSubmitting}
            >
              <option value="">Select a service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} - {formatCurrency(service.price, service.currency || businessCurrency)}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="notes">Additional Notes</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="Any special requests or information"
              rows="3"
            />
          </div>
            <div className="form-actions">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Book Now'}
            </button>          </div>
        </form>
                </DialogPanel>
              )}
            </TransitionChild>
          </div>
        </div>
      </Dialog>
      
      {/* Booking Conflict Modal */}
      <BookingConflictModal
        isOpen={showConflictModal}
        onClose={handleCancelConflict}
        conflicts={conflictData?.conflicts}
        conflictDetails={conflictData?.conflictDetails}
        newBookingData={pendingBookingData}
        onForceCreate={handleForceCreate}
        onCancel={handleCancelConflict}
      />
    </Transition>
  );
};

export default BookingModal;
