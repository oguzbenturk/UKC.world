import React, { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useCalendar } from '../../bookings/components/contexts/CalendarContext';
import { useToast } from '../../../shared/contexts/ToastContext';
import PackageBookingService from '../../../shared/services/packageBookingService';

// Step components
import UserSelectionStep from '../../bookings/components/components/booking-steps/UserSelectionStep';
import TimeInstructorStep from '../../bookings/components/components/booking-steps/TimeInstructorStep';
import ServiceSelectionStep from '../../bookings/components/components/booking-steps/ServiceSelectionStep';
import ConfirmationStep from '../../bookings/components/components/booking-steps/ConfirmationStep';

/**
 * Customer-specific step-by-step booking modal component
 * Copy of StepBookingModal.jsx for customer profile use
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to close the modal
 * @param {Function} props.onBookingCreated - Callback when booking is created
 * @returns {JSX.Element} CustomerStepBookingModal component
 */
const CustomerStepBookingModal = ({ isOpen, onClose, onBookingCreated }) => {
  const { selectedSlot, services, users, instructors, refreshData, createBooking, isLoading } = useCalendar();
  const { showSuccess, showError } = useToast();
  
  // Current step state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;
  
  // Loading states for each step
  const [stepLoading, setStepLoading] = useState({
    1: false, // User selection
    2: false, // Time/Instructor
    3: false, // Service selection
    4: false  // Confirmation
  });
  // Form data state with proper initialization
  const [formData, setFormData] = useState({
    userId: '',
    userName: '',
    userEmail: '',
    userPhone: '',
    date: '',
    startTime: '',
    endTime: '',
    instructorId: '',
    instructorName: '',
    serviceId: '',
    serviceName: '',
    servicePrice: 0,
    notes: '',
    isNewUser: false
  });
    // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  
  // Reset form when the modal opens with a new slot
  useEffect(() => {
    if (isOpen) {      if (selectedSlot) {
        // Pre-populate with selected time slot data if available
        setFormData({
          userId: '',
          userName: '',
          userEmail: '',
          userPhone: '',
          date: selectedSlot.date || '',
          startTime: selectedSlot.startTime || '',
          endTime: selectedSlot.endTime || '',
          instructorId: selectedSlot.instructorId || '',
          instructorName: selectedSlot.instructorName || '',
          serviceId: '',
          serviceName: '',
          servicePrice: 0,
          notes: '',
          isNewUser: false
        });
      } else {
        // Clear all form data when opening without a selected slot
        setFormData({
          userId: '',
          userName: '',
          userEmail: '',
          userPhone: '',
          date: '',
          startTime: '',
          endTime: '',
          instructorId: '',
          instructorName: '',
          serviceId: '',
          serviceName: '',
          servicePrice: 0,
          notes: '',
          isNewUser: false
        });      }
        setCurrentStep(1);
      setSubmitStatus(null);
    }
  }, [isOpen, selectedSlot]);
  
  // Prevent page refresh during booking process
  useEffect(() => {
    if (isOpen && (currentStep > 1 || isSubmitting)) {
      const handleBeforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = '';
        return '';
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [isOpen, currentStep, isSubmitting]);

  // Handle form data updates
  const updateFormData = (newData) => {
    setFormData(prevData => ({
      ...prevData,
      ...newData
    }));
  };
  // Navigate to next step with validation and loading state
  const nextStep = () => {
    if (!validateStep(currentStep)) {
      setSubmitStatus({ 
        success: false, 
        message: getValidationMessage(currentStep) 
      });
      return;
    }
    
    setStepLoading(prev => ({ ...prev, [currentStep]: true }));
    
    // Simulate brief loading for UX
    setTimeout(() => {
      if (currentStep < totalSteps) {
        setCurrentStep(currentStep + 1);
        setSubmitStatus(null); // Clear any previous validation messages
      }
      setStepLoading(prev => ({ ...prev, [currentStep]: false }));
    }, 200);
  };
  
  // Navigate to previous step
  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };  // Handle form submission with comprehensive error handling
  const handleSubmit = async () => {
    // Final validation before submission
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
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
      const servicePrice = selectedService.price || 0;
        // Get booking time and calculate duration with proper validation
      let bookingTime = formData.startTime || selectedSlot?.startTime || selectedSlot?.time;
      let endTime = formData.endTime || selectedSlot?.endTime;
      let bookingDuration = Number(formData.duration) || 1; // Default duration in hours
      
      // Handle time format validation and extraction
      if (bookingTime && typeof bookingTime === 'string') {
        if (bookingTime.includes('-')) {
          // For time ranges like "09:00-11:00", split and use start time
          const [startTime, extractedEndTime] = bookingTime.split('-').map(t => t.trim());
          bookingTime = startTime;
          endTime = endTime || extractedEndTime;
        }
      }
      
      // Calculate duration if both start and end times are available
      if (bookingTime && endTime && typeof bookingTime === 'string' && typeof endTime === 'string') {
        try {
          const [startHour, startMinute] = bookingTime.split(':').map(Number);
          const [endHour, endMinute] = endTime.split(':').map(Number);
          
          if (!isNaN(startHour) && !isNaN(startMinute) && !isNaN(endHour) && !isNaN(endMinute)) {
            const startTotalMinutes = (startHour * 60) + startMinute;
            const endTotalMinutes = (endHour * 60) + endMinute;
            bookingDuration = Math.max(0.5, (endTotalMinutes - startTotalMinutes) / 60); // Minimum 30 minutes
          }
        } catch (error) {
          console.warn('Error calculating duration, using default:', error);
          bookingDuration = Number(formData.duration) || 1;
        }
      }
      
      // Ensure we have valid time data
      if (!bookingTime || !endTime) {
        throw new Error('Invalid time data: Both start and end times are required');
      }
        // Prepare booking data for the context with complete validation
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
        price: servicePrice,
        totalCost: servicePrice * bookingDuration,
        usePackageHours: formData.usePackageHours || false, // Include package usage info
        paymentMethod: formData.usePackageHours ? 'package' : 'cash'
      };

      // Create the booking through the CalendarContext
      const response = await createBooking(bookingData);
      
      if (!response) {
        throw new Error('No response received from booking creation');
      }
      
      if (!response.id && !response.bookingId) {
        console.error('CustomerStepBookingModal: Response missing ID:', response);
        throw new Error('Booking was created but no ID was returned');
      }

      // If using package hours, deduct them after successful booking
      if (formData.usePackageHours && formData.userId) {
        try {
          const packageUsage = await PackageBookingService.usePackageHoursForBooking(
            formData.userId,
            bookingDuration,
            {
              date: bookingData.date,
              serviceName: bookingData.serviceName,
              bookingId: response.id || response.bookingId
            }
          );
          
          // Show detailed success message
          const successMessage = `Booking created successfully for ${formData.userName}! Used ${packageUsage.totalHoursUsed} hours from ${packageUsage.packagesUsed} package(s).`;
          showSuccess(successMessage);
        } catch (packageError) {
          console.error('Error using package hours:', packageError);
          // Don't fail the booking for package errors - just log them
          showError(`Booking created successfully, but there was an issue with package hour usage: ${packageError.message}`);
        }
      } else {
        // Standard cash payment success message
        showSuccess(`Booking created successfully for ${formData.userName}!`);
      }
      
      // Call onBookingCreated callback if provided
      if (onBookingCreated) {
        onBookingCreated(response);
      }
      
      // Note: Calendar updates automatically via createBooking's local state update
      // No need for manual refresh as it causes jarring UI updates
      
      // Close modal immediately - no delay, no confirmation
      handleClose(true);
    } catch (error) {
      console.error('CustomerStepBookingModal: Error submitting booking:', error);
      
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
  };
  
  // Validation functions
  const validateStep = (step) => {
    switch (step) {
      case 1:
        return formData.userId && formData.userName;
      case 2:
        return formData.date && formData.startTime && formData.endTime && formData.instructorId;
      case 3:
        return formData.serviceId;
      case 4:
        return true; // Final validation before submission
      default:
        return false;
    }
  };

  const getValidationMessage = (step) => {
    switch (step) {
      case 1:
        return 'Please select a user or add a new user';
      case 2:
        return 'Please select date, time, and instructor';
      case 3:
        return 'Please select a service';
      default:
        return 'Please complete all required fields';
    }
  };
  // Navigate to next step with validation and better UX
  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      nextStep();
    } else {
      setSubmitStatus({ 
        success: false, 
        message: getValidationMessage(currentStep) 
      });
    }
  };
  
  // Calculate step completion percentage
  const completionPercentage = ((currentStep - 1) / (totalSteps - 1)) * 100;
  
  // Get current step component
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:        return (
          <UserSelectionStep 
            formData={formData}
            updateFormData={updateFormData}
            users={users || []} 
            onNext={handleNextStep}
            onRefreshUsers={refreshData}
          />
        );
      case 2:
        return (
          <TimeInstructorStep 
            formData={formData}
            updateFormData={updateFormData}
            instructors={instructors || []}
            onNext={handleNextStep}
            onPrev={prevStep}
          />
        );
      case 3:
        return (
          <ServiceSelectionStep 
            formData={formData}
            updateFormData={updateFormData}
            services={services || []}
            onNext={handleNextStep}
            onPrev={prevStep}
            customerId={formData.userId} // Pass customerId for package lookup
          />
        );
      case 4:
        return (
          <ConfirmationStep 
            formData={formData}
            updateFormData={updateFormData}
            onSubmit={handleSubmit}
            onPrev={prevStep}
            isSubmitting={isSubmitting}
          />
        );
      default:
        return null;    }
  };
  // Handle modal close with confirmation if data exists
  const handleClose = (forceClose = false) => {
    if (currentStep > 1 && !forceClose) {
      const confirmClose = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmClose) return;
    }
      // Reset everything when closing
    setCurrentStep(1);
    setSubmitStatus(null);
    setIsSubmitting(false);
    setStepLoading({ 1: false, 2: false, 3: false, 4: false });
    
    onClose();
  };
  return (
    <Transition show={isOpen} as={Fragment}>      <Dialog 
        as="div" 
        className="fixed inset-0 z-50 overflow-y-auto" 
        onClose={handleClose}
      >
        <div className="min-h-screen px-4 text-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          {/* This element is to trick the browser into centering the modal contents. */}
          <span className="inline-block h-screen align-middle" aria-hidden="true">
            &#8203;
          </span>
            <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">              {/* Modal header */}
              <div className="flex justify-between items-center mb-4">                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  New Booking - Customer Profile
                </h3>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-500"
                  onClick={handleClose}
                >
                  <span className="sr-only">Close</span>
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
                {/* Progress indicator */}
              <div className="mb-6">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                    style={{ width: `${completionPercentage}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-2 text-sm text-gray-500">
                  <span>Step {currentStep} of {totalSteps}</span>
                  <span>{Math.round(completionPercentage)}% Complete</span>
                </div>
              </div>
                {/* Validation/Error Messages */}
              {submitStatus && (
                <div className={`mb-4 p-3 rounded-md ${
                  submitStatus.success 
                    ? 'bg-green-50 border border-green-200 text-green-800' 
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  {submitStatus.message}
                </div>
              )}              <div className="mt-4">
                {renderCurrentStep()}
              </div>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
};

export { CustomerStepBookingModal as default };
