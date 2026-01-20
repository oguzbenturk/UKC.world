/* eslint-disable no-console, complexity, no-unused-vars, react/self-closing-comp */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { XMarkIcon, PencilSquareIcon, TrashIcon, CheckCircleIcon, CheckIcon, ClockIcon, CurrencyDollarIcon, UserCircleIcon, CalendarDaysIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useCalendar } from '../contexts/CalendarContext';

/**
 * Modal for viewing and editing booking details
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to close the modal
 * @param {Object} props.booking - Booking data to display
 * @returns {JSX.Element} BookingDetailModal component
 */
const BookingDetailModal = ({ isOpen, onClose, booking }) => {
  const { deleteBooking, updateBooking } = useCalendar();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState('pending');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutAction, setCheckoutAction] = useState('completed');
  const [checkoutForm, setCheckoutForm] = useState({
    actualDuration: 0,
    notes: ''
  });
  const [cancelForm, setCancelForm] = useState({
    reason: ''
  });
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    notes: '',
    serviceName: '',
    duration: 0,
    date: '',
    price: 0,
    instructor_commission: 0,
    service_id: null,
    instructor_id: null
  });
  
  const [services, setServices] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return format(date, 'EEEE, MMMM d, yyyy');
    } catch (error) {
      return dateString;
    }
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'yyyy-MM-dd');
    } catch (error) {
      console.error("Error formatting date for input:", error);
      if (typeof dateString === 'string') {
        return dateString.split('T')[0];
      }
      return '';
    }
  };

  // Format time for display
  const formatTime = (timeString) => {
    if (!timeString || typeof timeString !== 'string') return '';
    
    try {
      const parts = timeString.trim().split(':');
      const hour = parseInt(parts[0], 10);
      const minute = parts.length > 1 ? parseInt(parts[1], 10) : 0;
      
      if (isNaN(hour) || isNaN(minute)) return timeString;
      
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } catch (e) {
      return timeString;
    }
  };

  // Calculate end time from start time and duration
  const calculateEndTime = (startTimeStr, durationMinutes) => {
    try {
      if (!startTimeStr || !durationMinutes) return '';
      
      const parts = startTimeStr.trim().split(':');
      const hour = parseInt(parts[0], 10);
      const minute = parts.length > 1 ? parseInt(parts[1], 10) : 0;
      
      if (isNaN(hour) || isNaN(minute)) return '';
      
      let duration = parseFloat(durationMinutes);
      if (isNaN(duration)) return '';
      
      if (duration <= 12) {
        duration = duration * 60;
      }
      
      const startTotalMinutes = hour * 60 + minute;
      const endTotalMinutes = startTotalMinutes + duration;
      const endHour = Math.floor(endTotalMinutes / 60) % 24;
      const endMinute = endTotalMinutes % 60;
      
      return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    } catch (error) {
      return '';
    }
  };

  useEffect(() => {
    if (booking) {
      setCheckInStatus(booking.checkInStatus || booking.status || 'pending');
      setEditForm({
        notes: booking.notes || '',
        serviceName: booking.serviceName || '',
        duration: booking.duration || 1,
        date: formatDateForInput(booking.date) || '',
        price: booking.price || booking.amount || 0,
        instructor_commission: booking.instructor_commission || 0,
        service_id: booking.service_id || null,
        instructor_id: booking.instructor_user_id || booking.instructorId || null
      });
      setCheckoutForm({
        actualDuration: booking.duration || 1,
        notes: ''
      });
    }
    setIsEditing(false);
    setIsDeleting(false);
    setIsProcessing(false);
    setIsCheckingOut(false);
    setCheckoutAction('completed');
  }, [booking]);

  // Fetch services and instructors when modal opens
  useEffect(() => {
    const fetchServicesAndInstructors = async () => {
      setIsDataLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        };

        const servicesResponse = await fetch('/api/services', { headers });
        const instructorsResponse = await fetch('/api/instructors', { headers });
        
        if (servicesResponse.ok) {
          const servicesData = await servicesResponse.json();
          setServices(servicesData);
        } else {
          console.error("Failed to fetch services", servicesResponse.statusText);
        }

        if (instructorsResponse.ok) {
          const instructorsData = await instructorsResponse.json();
          setInstructors(instructorsData);
        } else {
          console.error("Failed to fetch instructors", instructorsResponse.statusText);
        }

      } catch (error) {
        console.error("Failed to fetch services or instructors", error);
      } finally {
        setIsDataLoading(false);
      }
    };

    if (isOpen && booking) {
      fetchServicesAndInstructors();
    }
  }, [isOpen, booking]);

  // Ensure form values are properly set when services and instructors data becomes available
  useEffect(() => {
    if (booking && services.length > 0 && instructors.length > 0) {
      setEditForm(prev => ({
        ...prev,
        service_id: booking.service_id || null,
        instructor_id: booking.instructor_user_id || booking.instructorId || null
      }));
    }
  }, [booking, services, instructors]);

  // Update price and commission when service or instructor changes
  useEffect(() => {
    if (!isEditing) return;

    const selectedService = services.find(s => s.id === editForm.service_id);
    if (selectedService) {
      setEditForm(prev => ({ ...prev, price: selectedService.price || 0 }));
    }

    const selectedInstructor = instructors.find(i => i.id === editForm.instructor_id);
    if (selectedInstructor && editForm.instructor_commission === 0) {
      setEditForm(prev => ({ ...prev, instructor_commission: selectedInstructor.commission_rate || 0 }));
    }
  }, [editForm.service_id, editForm.instructor_id, services, instructors, isEditing, editForm.instructor_commission]);

  // Handle check-in status change
  const handleUpdateStatus = async (status) => {
    if (!booking || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      await updateBooking(booking.id, { status: status });
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error updating booking status:', error);
      setIsProcessing(false);
    }
  };

  // Handle form input change
  const handleEditFormChange = (field, value) => {
    let parsedValue = value;
    if ((field === 'service_id' || field === 'instructor_id') && value) {
      parsedValue = parseInt(value, 10);
    } else if ((field === 'service_id' || field === 'instructor_id') && !value) {
      parsedValue = null;
    }

    setEditForm(prev => ({
      ...prev,
      [field]: parsedValue
    }));
  };

  // Handle checkout form input change
  const handleCheckoutFormChange = (field, value) => {
    setCheckoutForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle checkout with actual duration
  const handleCheckout = async () => {
    if (!booking || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      await updateBooking(booking.id, { 
        status: checkoutAction,
        actualDuration: checkoutForm.actualDuration,
        completionNotes: checkoutForm.notes
      });
      
      setTimeout(() => {
        setIsProcessing(false);
        setIsCheckingOut(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error completing booking:', error);
      setIsProcessing(false);
    }
  };
  
  // Handle booking update
  const handleUpdateBooking = async () => {
    if (!booking || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      const { serviceName, instructor_id, ...payload } = editForm;
      
      const finalPayload = {
        ...payload,
        instructor_user_id: instructor_id
      };

      await updateBooking(booking.id, finalPayload);
      
      // Update the booking object with the new values for immediate display
      Object.assign(booking, finalPayload);
      
      // Re-initialize the form with updated booking data
      setEditForm(prev => ({
        ...prev,
        ...finalPayload,
        instructor_id: instructor_id
      }));
      
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent('booking-updated', {
        detail: { bookingId: booking.id, updatedBooking: { ...booking, ...finalPayload } }
      }));
      
      setTimeout(() => {
        setIsProcessing(false);
        setIsEditing(false);
      }, 1000);
    } catch (error) {
      console.error('Error updating booking:', error);
      setIsProcessing(false);
    }
  };
  
  // Handle booking deletion
  const handleDeleteBooking = async () => {
    if (!booking || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      await deleteBooking(booking.id);
      
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error deleting booking:', error);
      setIsProcessing(false);
    }
  };
  
  // Handle booking cancellation
  const handleCancelBooking = async () => {
    if (!booking || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/bookings/${booking.id}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: cancelForm.reason || 'Cancelled by staff'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to cancel booking');
      }
      
      setTimeout(() => {
        setIsProcessing(false);
        setIsCancelling(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error cancelling booking:', error);
      setIsProcessing(false);
    }
  };

  // Detect package-paid bookings
  const isPackageBooking = (b) => !!(b?.package_name || b?.customer_package_id || b?.usePackageHours || b?.payment_status === 'package' || b?.payment_method_display === 'Package Hours');

  if (!booking) return null;
  
  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog 
        as="div" 
        className="fixed inset-0 z-10 overflow-y-auto" 
        onClose={!isProcessing ? onClose : () => {}}
      >
        <div className="min-h-screen px-4 text-center">
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black opacity-30" />
          </TransitionChild>

          <span className="inline-block h-screen align-middle" aria-hidden="true">
            &#8203;
          </span>
          
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="inline-block w-full max-w-3xl p-0 my-4 overflow-hidden text-left align-middle transition-all transform bg-white shadow-2xl rounded-xl border border-gray-100">
              {/* Enhanced Header with Gradient */}
              <div className="relative bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-b border-gray-100">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5"></div>
                <div className="relative flex justify-between items-center px-4 py-3">
                  <DialogTitle as="h3" className="text-lg font-bold leading-6 text-gray-900 flex items-center">
                    <div className="bg-white/80 backdrop-blur-sm p-2 rounded-lg shadow-sm border border-white/20 mr-3">
                      <CalendarDaysIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <span className="text-gray-900">Booking Details</span>
                      <p className="text-xs font-normal text-gray-600 mt-0.5">
                        {booking?.id ? `Booking #${booking.id}` : 'View and manage booking information'}
                      </p>
                    </div>
                  </DialogTitle>
                  <button
                    type="button"
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white/50 backdrop-blur-sm rounded-lg transition-all duration-200 border border-transparent hover:border-white/20 shadow-sm"
                    onClick={onClose}
                    disabled={isProcessing}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Content with Enhanced Background */}
              <div className="px-4 py-4 bg-gradient-to-b from-gray-50/30 to-white min-h-[300px]">
                {isDeleting ? (
                  <div className="space-y-3">
                    <div className="bg-red-50 border-l-4 border-red-400 rounded-lg p-3">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        </div>
                        <div className="ml-4">
                          <h3 className="text-base font-medium text-red-800">Confirm Deletion</h3>
                          <p className="text-red-700 mt-1 text-sm">
                            Are you sure you want to delete this booking? This action cannot be undone and will permanently remove all booking data.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                        onClick={() => setIsDeleting(false)}
                        disabled={isProcessing}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={`px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-all duration-200 ${
                          isProcessing 
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : 'bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500'
                        }`}
                        onClick={handleDeleteBooking}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <div className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Deleting...
                          </div>
                        ) : (
                          'Delete Booking'
                        )}
                      </button>
                    </div>
                  </div>
                ) : isCancelling ? (
                  <div className="space-y-3">
                    <div className="bg-orange-50 border-l-4 border-orange-400 rounded-lg p-3">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="h-6 w-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="ml-4">
                          <h3 className="text-base font-medium text-orange-800">Cancel Booking</h3>
                          <p className="text-orange-700 mt-1 text-sm">
                            This will mark the booking as cancelled and may restore package hours to the customer.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cancellation Reason (Optional)
                        </label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 resize-none"
                          rows="3"
                          placeholder="Enter reason for cancellation..."
                          value={cancelForm.reason}
                          onChange={(e) => setCancelForm({ reason: e.target.value })}
                          disabled={isProcessing}
                        />
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                        onClick={() => setIsCancelling(false)}
                        disabled={isProcessing}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className={`px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-all duration-200 ${
                          isProcessing 
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : 'bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500'
                        }`}
                        onClick={handleCancelBooking}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <div className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Cancelling...
                          </div>
                        ) : (
                          'Cancel Booking'
                        )}
                      </button>
                    </div>
                  </div>
                ) : isEditing ? (
                  isDataLoading ? (
                    <div className="flex justify-center items-center p-8">
                      <div className="flex flex-col items-center space-y-3">
                        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-gray-600 font-medium text-sm">Loading form data...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Compact Edit Form Header */}
                      <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-lg p-4 border border-blue-100/50 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full -mr-8 -mt-8"></div>
                        <div className="relative">
                          <h4 className="text-base font-bold text-gray-900 flex items-center mb-1">
                            <div className="bg-white/80 backdrop-blur-sm p-1.5 rounded-md shadow-sm border border-white/20 mr-2">
                              <PencilSquareIcon className="h-3 w-3 text-blue-600" />
                            </div>
                            Edit Booking
                          </h4>
                          <p className="text-gray-600 ml-8 text-xs">Update booking information</p>
                        </div>
                      </div>

                      {/* Compact Form Fields */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {/* Service Selection */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-gray-800 flex items-center">
                            <div className="bg-blue-100 p-1 rounded-sm mr-1">
                              <InformationCircleIcon className="h-3 w-3 text-blue-600" />
                            </div>
                            Service
                          </label>
                          <select
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200 hover:border-gray-300 text-gray-900 font-medium text-xs"
                            value={editForm.service_id || ''}
                            onChange={(e) => handleEditFormChange('service_id', e.target.value)}
                            disabled={isProcessing}
                          >
                            <option value="" disabled>Select a service</option>
                            {services.map(service => (
                              <option key={service.id} value={service.id}>{service.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Instructor Selection */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-gray-800 flex items-center">
                            <div className="bg-green-100 p-1 rounded-sm mr-1">
                              <UserCircleIcon className="h-3 w-3 text-green-600" />
                            </div>
                            Instructor
                          </label>
                          <select
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200 hover:border-gray-300 text-gray-900 font-medium text-xs"
                            value={editForm.instructor_id || ''}
                            onChange={(e) => handleEditFormChange('instructor_id', e.target.value)}
                            disabled={isProcessing}
                          >
                            <option value="" disabled>Select an instructor</option>
                            {instructors.map(instructor => (
                              <option key={instructor.id} value={instructor.id}>{instructor.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Date */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-gray-800 flex items-center">
                            <div className="bg-purple-100 p-1 rounded-sm mr-1">
                              <CalendarDaysIcon className="h-3 w-3 text-purple-600" />
                            </div>
                            Date
                          </label>
                          <input
                            type="date"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300 text-gray-900 font-medium text-xs"
                            value={editForm.date}
                            onChange={(e) => handleEditFormChange('date', e.target.value)}
                            disabled={isProcessing}
                          />
                        </div>

                        {/* Duration */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-gray-800 flex items-center">
                            <div className="bg-orange-100 p-1 rounded-sm mr-1">
                              <ClockIcon className="h-3 w-3 text-orange-600" />
                            </div>
                            Duration (hours)
                          </label>
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300 text-gray-900 font-medium text-xs"
                            value={editForm.duration === 0 ? '' : editForm.duration}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '') {
                                handleEditFormChange('duration', '');
                              } else {
                                const numValue = parseFloat(value);
                                if (!isNaN(numValue) && numValue >= 0.5) {
                                  handleEditFormChange('duration', numValue);
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const value = e.target.value;
                              if (value === '' || parseFloat(value) < 0.5) {
                                handleEditFormChange('duration', 1);
                              }
                            }}
                            disabled={isProcessing}
                            placeholder="1"
                          />
                        </div>
                      </div>

                      {/* Compact Notes */}
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-800 flex items-center">
                          <div className="bg-gray-100 p-1 rounded-sm mr-1">
                            <svg className="h-3 w-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </div>
                          Notes
                        </label>
                        <textarea
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300 text-gray-900 resize-none text-xs"
                          rows="2"
                          placeholder="Add notes..."
                          value={editForm.notes}
                          onChange={(e) => handleEditFormChange('notes', e.target.value)}
                          disabled={isProcessing}
                        ></textarea>
                      </div>

                      {/* Compact Price and Commission Section */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {/* Price Card */}
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200/50 rounded-md p-2 shadow-sm relative overflow-hidden">
                          <label className="block text-xs font-bold text-gray-800 mb-1 flex items-center">
                            <div className="bg-white/80 p-0.5 rounded-sm shadow-sm border border-white/20 mr-1">
                              <CurrencyDollarIcon className="h-3 w-3 text-green-600" />
                            </div>
                            Price
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-1.5 flex items-center pointer-events-none">
                              <span className="text-gray-600 text-xs font-bold">$</span>
                            </div>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full pl-5 pr-2 py-1.5 border border-green-300/50 bg-white/80 rounded-md shadow-sm focus:ring-1 focus:ring-green-500 focus:border-green-500 text-xs font-bold text-gray-900"
                              value={editForm.price}
                              onChange={(e) => handleEditFormChange('price', parseFloat(e.target.value))}
                              disabled
                            />
                          </div>
                          <div className="flex items-center mt-1 text-green-700">
                            <CheckIcon className="h-2 w-2 mr-0.5" />
                            <p className="text-xs font-semibold">Auto-set</p>
                          </div>
                        </div>

                        {/* Commission Card */}
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/50 rounded-md p-2 shadow-sm relative overflow-hidden">
                          <label className="block text-xs font-bold text-gray-800 mb-1 flex items-center">
                            <div className="bg-white/80 p-0.5 rounded-sm shadow-sm border border-white/20 mr-1">
                              <UserCircleIcon className="h-3 w-3 text-blue-600" />
                            </div>
                            Commission
                          </label>
                          <div className="space-y-1">
                            <div className="flex space-x-1">
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  className="w-full px-2 py-1.5 border border-blue-300/50 bg-white/80 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs font-bold text-gray-900"
                                  value={editForm.instructor_commission === 0 ? '' : editForm.instructor_commission}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      handleEditFormChange('instructor_commission', '');
                                    } else {
                                      const numValue = parseFloat(value);
                                      if (!isNaN(numValue)) {
                                        handleEditFormChange('instructor_commission', numValue);
                                      }
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      handleEditFormChange('instructor_commission', 0);
                                    }
                                  }}
                                  disabled={isProcessing}
                                  placeholder="0"
                                />
                                <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none">
                                  <span className="text-gray-600 text-xs font-bold">%</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="px-2 py-1.5 bg-white/80 border border-blue-300/50 rounded-md text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-0.5 shadow-sm"
                                onClick={() => {
                                  const selectedInstructor = instructors.find(i => i.id === editForm.instructor_id);
                                  if (selectedInstructor) {
                                    handleEditFormChange('instructor_commission', selectedInstructor.commission_rate || 0);
                                  }
                                }}
                                disabled={isProcessing || !editForm.instructor_id}
                                title="Reset to instructor's default rate"
                              >
                                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>Reset</span>
                              </button>
                            </div>
                            <p className="text-xs text-blue-700 font-semibold flex items-center">
                              <svg className="h-2.5 w-2.5 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Custom rate
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Compact Action Buttons */}
                      <div className="flex justify-end space-x-2 pt-2 border-t border-gray-100">
                        <button
                          type="button"
                          className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all duration-200 hover:border-gray-400"
                          onClick={() => setIsEditing(false)}
                          disabled={isProcessing}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={`px-4 py-1.5 border border-transparent rounded-md shadow-sm text-xs font-bold text-white transition-all duration-200 ${
                            isProcessing || isDataLoading
                              ? 'bg-gray-400 cursor-not-allowed border-gray-400' 
                              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-lg hover:shadow-xl'
                          }`}
                          onClick={handleUpdateBooking}
                          disabled={isProcessing || isDataLoading}
                        >
                          {isProcessing ? (
                            <div className="flex items-center">
                              <svg className="animate-spin -ml-1 mr-1 h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Saving...
                            </div>
                          ) : (
                            <>
                              <CheckIcon className="h-3 w-3 mr-1 inline" />
                              Save
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {/* Compact Booking Overview */}
                    <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-lg p-4 border border-blue-100/50 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full -mr-10 -mt-10"></div>
                      
                      <div className="relative flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="bg-white/80 backdrop-blur-sm p-2 rounded-lg shadow-lg border border-white/20">
                            <CalendarDaysIcon className="h-6 w-6 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">{booking.serviceName || 'Booking Details'}</h3>
                            <p className="text-sm text-blue-600 font-semibold flex items-center">
                              <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatDate(booking.date)}
                            </p>
                            <p className="text-gray-600 font-medium flex items-center text-xs">
                              <ClockIcon className="h-3 w-3 mr-1" />
                              {formatTime(booking.start_hour)} - {calculateEndTime(booking.start_hour, booking.duration)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900 mb-1">
                            {isPackageBooking(booking) ? (
                              <span className="text-green-600">Package Hours</span>
                            ) : (
                              `$${parseFloat(booking.price || booking.amount || 0).toFixed(2)}`
                            )}
                          </p>
                          <p className="text-xs text-gray-600 font-semibold">
                            {isPackageBooking(booking) ? 'Paid with Package Hours' : 'Total'}
                          </p>
                        </div>
                      </div>

                      {/* Compact Status */}
                      <div className="relative flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold shadow-sm ${
                            booking.status === 'confirmed' ? 'bg-green-100 text-green-800 border border-green-200' :
                            booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                            booking.status === 'checked-in' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            booking.status === 'completed' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            'bg-gray-100 text-gray-800 border border-gray-200'
                          }`}>
                            <div className={`w-2 h-2 rounded-full mr-1 ${
                              booking.status === 'confirmed' ? 'bg-green-500' :
                              booking.status === 'pending' ? 'bg-yellow-500' :
                              booking.status === 'checked-in' ? 'bg-blue-500' :
                              booking.status === 'completed' ? 'bg-purple-500' :
                              'bg-gray-500'
                            }`} />
                            {booking.status ? booking.status.charAt(0).toUpperCase() + booking.status.slice(1) : 'Pending'}
                          </span>
                          {booking.instructor_commission && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              <CurrencyDollarIcon className="h-3 w-3 mr-0.5" />
                              {booking.instructor_commission}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Compact Details Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {/* People Card */}
                      <div className="bg-white rounded-md border border-gray-100 shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-3 py-2 border-b border-gray-100">
                          <h4 className="text-sm font-bold text-gray-900 flex items-center">
                            <div className="bg-white p-1 rounded-md shadow-sm border border-gray-200 mr-2">
                              <UserCircleIcon className="h-3 w-3 text-blue-600" />
                            </div>
                            People
                          </h4>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-md p-1.5 shadow-sm">
                              <svg className="h-3 w-3 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Student</p>
                              <p className="text-xs font-bold text-gray-900">{booking.studentName || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="bg-gradient-to-br from-green-100 to-green-200 rounded-md p-1.5 shadow-sm">
                              <svg className="h-3 w-3 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Instructor</p>
                              <p className="text-xs font-bold text-gray-900">{booking.instructorName || 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Details Card */}
                      <div className="bg-white rounded-md border border-gray-100 shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-gray-50 to-purple-50 px-3 py-2 border-b border-gray-100">
                          <h4 className="text-sm font-bold text-gray-900 flex items-center">
                            <div className="bg-white p-1 rounded-md shadow-sm border border-gray-200 mr-2">
                              <InformationCircleIcon className="h-3 w-3 text-purple-600" />
                            </div>
                            Details
                          </h4>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <div className="bg-gradient-to-br from-purple-100 to-purple-200 rounded-md p-1.5 shadow-sm">
                              <svg className="h-3 w-3 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Service</p>
                              <p className="text-xs font-bold text-gray-900">{booking.serviceName || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="bg-gradient-to-br from-orange-100 to-orange-200 rounded-md p-1.5 shadow-sm">
                              <ClockIcon className="h-3 w-3 text-orange-700" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Duration</p>
                              <p className="text-xs font-bold text-gray-900">{booking.duration || 1} hour{(booking.duration || 1) !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          {booking.instructor_commission && (
                            <div className="flex items-center space-x-2">
                              <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-md p-1.5 shadow-sm">
                                <CurrencyDollarIcon className="h-3 w-3 text-blue-700" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Commission</p>
                                <p className="text-xs font-bold text-gray-900">{booking.instructor_commission}%</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Compact Notes */}
                    {booking.notes && (
                      <div className="bg-white rounded-md border border-gray-100 shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-gray-50 to-indigo-50 px-3 py-2 border-b border-gray-100">
                          <h4 className="text-sm font-bold text-gray-900 flex items-center">
                            <div className="bg-white p-1 rounded-md shadow-sm border border-gray-200 mr-2">
                              <svg className="h-3 w-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </div>
                            Notes
                          </h4>
                        </div>
                        <div className="p-3">
                          <p className="text-gray-700 whitespace-pre-wrap text-sm">{booking.notes}</p>
                        </div>
                      </div>
                    )}

                    {/* Compact Action Buttons */}
                    <div className="flex flex-col lg:flex-row lg:justify-between space-y-2 lg:space-y-0 lg:space-x-2 pt-3 border-t border-gray-100">
                      {/* Primary Actions */}
                      <div className="flex space-x-1">
                        <button
                          type="button"
                          className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-md shadow-lg text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-200"
                          onClick={() => setIsEditing(true)}
                          disabled={isProcessing}
                        >
                          <PencilSquareIcon className="h-3 w-3 mr-0.5" />
                          Edit
                        </button>
                        
                        {booking.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-md shadow-lg text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-200"
                            onClick={() => setIsCancelling(true)}
                            disabled={isProcessing}
                          >
                            <XMarkIcon className="h-3 w-3 mr-0.5" />
                            Cancel
                          </button>
                        )}
                        
                        <button
                          type="button"
                          className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-md shadow-lg text-xs font-bold text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-200"
                          onClick={() => setIsDeleting(true)}
                          disabled={isProcessing}
                        >
                          <TrashIcon className="h-3 w-3 mr-0.5" />
                          Delete
                        </button>
                      </div>

                      {/* Status Actions */}
                      <div className="flex space-x-1">
                        {checkInStatus === 'pending' && (
                          <button
                            type="button"
                            className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-md shadow-lg text-xs font-bold text-white bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-200"
                            onClick={() => handleUpdateStatus('confirmed')}
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-0.5 h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Confirming...
                              </>
                            ) : (
                              <>
                                <CheckCircleIcon className="h-3 w-3 mr-0.5" />
                                Confirm
                              </>
                            )}
                          </button>
                        )}

                        {checkInStatus === 'confirmed' && (
                          <button
                            type="button"
                            className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-md shadow-lg text-xs font-bold text-white bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-200"
                            onClick={() => handleUpdateStatus('checked-in')}
                            disabled={isProcessing}
                          >
                            {isProcessing ? 'Checking In...' : (
                              <>
                                <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                </svg>
                                Check-In
                              </>
                            )}
                          </button>
                        )}

                        {checkInStatus === 'checked-in' && (
                          <button
                            type="button"
                            className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-md shadow-lg text-xs font-bold text-white bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-200"
                            onClick={() => setIsCheckingOut(true)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? 'Processing...' : (
                              <>
                                <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                Check-Out
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};

export default BookingDetailModal;
