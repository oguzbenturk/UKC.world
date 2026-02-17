import { useState, useEffect, Fragment, useCallback, useMemo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
  XMarkIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon,
  ClockIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { useCalendar } from '../contexts/CalendarContext';
import { useToast } from '@/shared/contexts/ToastContext';
import { format, parseISO } from 'date-fns';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

/**
 * Bulk Booking Assistant - Wizard for creating multiple bookings efficiently
 * 
 * This component provides a streamlined workflow for:
 * - Same service/instructor across multiple time slots
 * - Same time slot for multiple participants
 * - Batch booking for recurring sessions
 */
const BulkBookingAssistant = ({ isOpen, onClose, onBookingsCreated, onSwitchToSingle }) => {
  const { services, instructors, users, createBooking } = useCalendar();
  const { showSuccess, showError } = useToast();
  const { formatCurrency, businessCurrency } = useCurrency();

  // Wizard steps
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Bulk booking configuration
  const [bulkConfig, setBulkConfig] = useState({
    // Step 1: Type and basic settings
    type: 'time_slots', // 'time_slots', 'participants', 'recurring'
    serviceId: '',
    instructorId: '',
    
    // Step 2: Time configuration
    baseDate: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:00',
    timeSlots: [], // For time_slots type
    
    // Step 3: Participants
    participants: [], // Array of user objects
    
    // Step 4: Additional settings
    paymentMethod: 'cash',
    notes: '',
    usePackageHours: false
  });

  // Generated bookings preview
  const [bookingsPreviews, setBookingsPreviews] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setBulkConfig({
        type: 'time_slots',
        serviceId: '',
        instructorId: '',
        baseDate: format(new Date(), 'yyyy-MM-dd'),
        startTime: '09:00',
        endTime: '10:00',
        timeSlots: [],
        participants: [],
        paymentMethod: 'cash',
        notes: '',
        usePackageHours: false
      });
      setBookingsPreviews([]);
    }
  }, [isOpen]);

  // Update bulk config
  const updateConfig = useCallback((updates) => {
    setBulkConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Generate booking previews
  const generatePreviews = useCallback(() => {
    const { type, serviceId, instructorId, participants, timeSlots, baseDate, startTime, endTime } = bulkConfig;
    
    if (!serviceId || !instructorId) return [];

    const service = services?.find(s => s.id === serviceId);
    const instructor = instructors?.find(i => i.id === instructorId);
    
    if (!service || !instructor) return [];

    // Ensure participants is always an array
    const safeParticipants = Array.isArray(participants) ? participants : [];
    const safeTimeSlots = Array.isArray(timeSlots) ? timeSlots : [];

    let previews = [];

    switch (type) {
      case 'time_slots':
        // Multiple time slots, single participant (first selected)
        const primaryParticipant = safeParticipants[0];
        if (primaryParticipant && safeTimeSlots.length > 0) {
          previews = safeTimeSlots.map((slot, index) => ({
            id: `preview-${index}`,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            serviceName: service.name,
            instructorName: instructor.name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim(),
            participantName: primaryParticipant.name || `${primaryParticipant.first_name || ''} ${primaryParticipant.last_name || ''}`.trim(),
            participantCount: 1,
            participants: [primaryParticipant]
          }));
        }
        break;
        
      case 'participants':
        // Single time slot, multiple participants
        if (safeParticipants.length > 0) {
          previews = safeParticipants.map((participant, index) => ({
            id: `preview-${index}`,
            date: baseDate,
            startTime,
            endTime,
            serviceName: service.name,
            instructorName: instructor.name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim(),
            participantName: participant.name || `${participant.first_name || ''} ${participant.last_name || ''}`.trim(),
            participantCount: 1,
            participants: [participant]
          }));
        }
        break;
        
      case 'recurring':
        // Recurring sessions for primary participant
        const recurringParticipant = safeParticipants[0];
        if (recurringParticipant && safeTimeSlots.length > 0) {
          previews = safeTimeSlots.map((slot, index) => ({
            id: `preview-${index}`,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            serviceName: service.name,
            instructorName: instructor.name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim(),
            participantName: recurringParticipant.name || `${recurringParticipant.first_name || ''} ${recurringParticipant.last_name || ''}`.trim(),
            participantCount: 1,
            participants: [recurringParticipant],
            isRecurring: true
          }));
        }
        break;
      default:
        break;
    }

    return previews;
  }, [bulkConfig, services, instructors]);

  // Update previews when config changes
  useEffect(() => {
    if (currentStep === 4) {
      const previews = generatePreviews();
      setBookingsPreviews(previews);
    }
  }, [currentStep, generatePreviews]);

  // Step navigation
  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Submit all bookings
  const handleSubmitBookings = async () => {
    if (bookingsPreviews.length === 0) return;

    setIsSubmitting(true);
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const preview of bookingsPreviews) {
        try {
          const bookingData = {
            participants: preview.participants.map(p => ({
              userId: p.id,
              userName: p.name || `${p.first_name} ${p.last_name}`,
              userEmail: p.email
            })),
            date: preview.date,
            startTime: preview.startTime,
            endTime: preview.endTime,
            instructorId: bulkConfig.instructorId,
            serviceId: bulkConfig.serviceId,
            paymentMethod: bulkConfig.paymentMethod,
            notes: bulkConfig.notes,
            usePackageHours: bulkConfig.usePackageHours
          };

          const result = await createBooking(bookingData);
          results.push({ success: true, data: result, preview });
          successCount++;
        } catch (error) {
          results.push({ success: false, error: error.message, preview });
          errorCount++;
        }
      }

      // Show results
      if (successCount > 0) {
        showSuccess(`Successfully created ${successCount} booking${successCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
      }
      
      if (errorCount > 0 && successCount === 0) {
        showError(`Failed to create bookings: ${results.find(r => !r.success)?.error || 'Unknown error'}`);
      }

      // Call completion callback
      if (onBookingsCreated && successCount > 0) {
        onBookingsCreated(results.filter(r => r.success));
      }

      // Close modal if all successful
      if (errorCount === 0) {
        onClose();
      }
    } catch (error) {
      showError('Failed to create bookings: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <Step1BookingType bulkConfig={bulkConfig} updateConfig={updateConfig} services={services} instructors={instructors} />;
      case 2:
        return <Step2TimeConfiguration bulkConfig={bulkConfig} updateConfig={updateConfig} />;
      case 3:
        return <Step3Participants bulkConfig={bulkConfig} updateConfig={updateConfig} users={users} />;
      case 4:
        return <Step4Preview bookingsPreviews={bookingsPreviews} bulkConfig={bulkConfig} updateConfig={updateConfig} />;
      default:
        return null;
    }
  };

  // Validate current step
  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 1:
        return bulkConfig.serviceId && bulkConfig.instructorId && bulkConfig.type;
      case 2:
        return bulkConfig.type === 'participants' ? 
          (bulkConfig.baseDate && bulkConfig.startTime && bulkConfig.endTime) :
          (bulkConfig.timeSlots.length > 0);
      case 3:
        return bulkConfig.participants.length > 0;
      case 4:
        return bookingsPreviews.length > 0;
      default:
        return false;
    }
  }, [currentStep, bulkConfig, bookingsPreviews]);

  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50 overflow-y-auto" onClose={onClose}>
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

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <Dialog.Title as="h3" className="text-2xl font-bold text-gray-900">
                      Bulk Booking Assistant
                    </Dialog.Title>
                    <p className="text-sm text-gray-600 mt-1">
                      Create multiple bookings efficiently
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-transparent hover:border-blue-200 rounded-md transition-colors"
                      onClick={() => onSwitchToSingle && onSwitchToSingle()}
                      aria-label="Switch to Single Booking"
                    >
                      <UserGroupIcon className="h-4 w-4 rotate-180" />
                      <span className="whitespace-nowrap">Switch to Single</span>
                    </button>
                    <button
                      type="button"
                      className="sm:hidden inline-flex items-center justify-center p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-full transition-colors"
                      onClick={() => onSwitchToSingle && onSwitchToSingle()}
                      aria-label="Switch to Single Booking"
                    >
                      <UserGroupIcon className="h-4 w-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      onClick={onClose}
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                  <div className="flex justify-between text-sm font-medium text-gray-600 mb-2">
                    <span>Step {currentStep} of {totalSteps}</span>
                    <span>{Math.round(progressPercentage)}% Complete</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span className={currentStep >= 1 ? 'text-blue-600 font-medium' : ''}>Type</span>
                    <span className={currentStep >= 2 ? 'text-blue-600 font-medium' : ''}>Time</span>
                    <span className={currentStep >= 3 ? 'text-blue-600 font-medium' : ''}>Participants</span>
                    <span className={currentStep >= 4 ? 'text-blue-600 font-medium' : ''}>Preview</span>
                  </div>
                </div>

                {/* Step Content */}
                <div className="min-h-[400px] mb-8">
                  {renderStepContent()}
                </div>

                {/* Footer Navigation */}
                <div className="flex justify-between items-center pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      currentStep === 1 
                        ? 'text-gray-400 cursor-not-allowed' 
                        : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                    }`}
                    onClick={prevStep}
                    disabled={currentStep === 1}
                  >
                    <ChevronLeftIcon className="h-4 w-4 mr-2" />
                    Previous
                  </button>

                  <div className="text-sm text-gray-500">
                    {currentStep === 4 && bookingsPreviews.length > 0 && (
                      `${bookingsPreviews.length} booking${bookingsPreviews.length > 1 ? 's' : ''} ready`
                    )}
                  </div>

                  {currentStep < totalSteps ? (
                    <button
                      type="button"
                      className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        canProceed 
                          ? 'text-white bg-blue-600 hover:bg-blue-700' 
                          : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                      }`}
                      onClick={nextStep}
                      disabled={!canProceed}
                    >
                      Next
                      <ChevronRightIcon className="h-4 w-4 ml-2" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`flex items-center px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                        canProceed && !isSubmitting
                          ? 'text-white bg-green-600 hover:bg-green-700' 
                          : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                      }`}
                      onClick={handleSubmitBookings}
                      disabled={!canProceed || isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Creating Bookings...
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="h-4 w-4 mr-2" />
                          Create All Bookings
                        </>
                      )}
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

// Step 1: Booking Type Selection
const Step1BookingType = ({ bulkConfig, updateConfig, services, instructors }) => {
  const bookingTypes = [
    {
      id: 'time_slots',
      title: 'Multiple Time Slots',
      description: 'Same service & instructor, different times',
      icon: ClockIcon,
      example: 'Book John for Private Lessons at 9am, 10am, 11am'
    },
    {
      id: 'participants',
      title: 'Multiple Participants',
      description: 'Same time slot, different customers',
      icon: UserGroupIcon,
      example: 'Book 3 students for Group Lesson at 2pm today'
    },
    {
      id: 'recurring',
      title: 'Recurring Sessions',
      description: 'Same customer, multiple scheduled sessions',
      icon: CalendarDaysIcon,
      example: 'Book Sarah for Weekly Private Lessons (Mon/Wed/Fri)'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Choose Booking Type</h4>
        <p className="text-sm text-gray-600">Select how you want to create multiple bookings</p>
      </div>

      {/* Booking Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {bookingTypes.map((type) => {
          const Icon = type.icon;
          const isSelected = bulkConfig.type === type.id;
          
          return (
            <button
              key={type.id}
              type="button"
              className={`p-4 border-2 rounded-lg text-left transition-all ${
                isSelected 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => updateConfig({ type: type.id })}
            >
              <div className="flex items-center mb-3">
                <Icon className={`h-6 w-6 mr-3 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                <h5 className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                  {type.title}
                </h5>
              </div>
              <p className={`text-sm mb-2 ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}>
                {type.description}
              </p>
              <p className={`text-xs italic ${isSelected ? 'text-blue-600' : 'text-gray-500'}`}>
                {type.example}
              </p>
            </button>
          );
        })}
      </div>

      {/* Service & Instructor Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Service *
          </label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={bulkConfig.serviceId}
            onChange={(e) => updateConfig({ serviceId: e.target.value })}
          >
            <option value="">Select a service...</option>
            {services?.map(service => (
              <option key={service.id} value={service.id}>
                {service.name} - {service.duration}h - {formatCurrency(service.price, service.currency || businessCurrency)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Instructor *
          </label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={bulkConfig.instructorId}
            onChange={(e) => updateConfig({ instructorId: e.target.value })}
          >
            <option value="">Select an instructor...</option>
            {instructors?.map(instructor => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name || `${instructor.first_name} ${instructor.last_name}`}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

// Step 2: Time Configuration  
const Step2TimeConfiguration = ({ bulkConfig, updateConfig }) => {
  const [newTimeSlot, setNewTimeSlot] = useState({
    date: bulkConfig.baseDate,
    startTime: bulkConfig.startTime,
    endTime: bulkConfig.endTime
  });

  const addTimeSlot = () => {
    if (newTimeSlot.date && newTimeSlot.startTime && newTimeSlot.endTime) {
      const newSlots = [...bulkConfig.timeSlots, { ...newTimeSlot, id: Date.now() }];
      updateConfig({ timeSlots: newSlots });
    }
  };

  const removeTimeSlot = (id) => {
    const newSlots = bulkConfig.timeSlots.filter(slot => slot.id !== id);
    updateConfig({ timeSlots: newSlots });
  };

  if (bulkConfig.type === 'participants') {
    return (
      <div className="space-y-6">
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Set Time Slot</h4>
          <p className="text-sm text-gray-600">All participants will be booked for this time</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={bulkConfig.baseDate}
              onChange={(e) => updateConfig({ baseDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Time *</label>
            <input
              type="time"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={bulkConfig.startTime}
              onChange={(e) => updateConfig({ startTime: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Time *</label>
            <input
              type="time"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={bulkConfig.endTime}
              onChange={(e) => updateConfig({ endTime: e.target.value })}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Add Time Slots</h4>
        <p className="text-sm text-gray-600">
          {bulkConfig.type === 'recurring' ? 'Schedule recurring sessions' : 'Add multiple time slots for bookings'}
        </p>
      </div>

      {/* Add New Time Slot */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h5 className="font-medium text-gray-900 mb-3">Add Time Slot</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={newTimeSlot.date}
              onChange={(e) => setNewTimeSlot(prev => ({ ...prev, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <input
              type="time"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={newTimeSlot.startTime}
              onChange={(e) => setNewTimeSlot(prev => ({ ...prev, startTime: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
            <input
              type="time"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={newTimeSlot.endTime}
              onChange={(e) => setNewTimeSlot(prev => ({ ...prev, endTime: e.target.value }))}
            />
          </div>
        </div>
        <button
          type="button"
          className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          onClick={addTimeSlot}
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Time Slot
        </button>
      </div>

      {/* Current Time Slots */}
      {bulkConfig.timeSlots.length > 0 && (
        <div>
          <h5 className="font-medium text-gray-900 mb-3">
            Scheduled Time Slots ({bulkConfig.timeSlots.length})
          </h5>
          <div className="space-y-2">
            {bulkConfig.timeSlots.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-900">
                    {format(parseISO(slot.date), 'MMM dd, yyyy')}
                  </span>
                  <span className="text-sm text-gray-600">
                    {slot.startTime} - {slot.endTime}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-red-600 hover:text-red-800 transition-colors"
                  onClick={() => removeTimeSlot(slot.id)}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Step 3: Participants Selection
const Step3Participants = ({ bulkConfig, updateConfig, users }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = users?.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    const name = (user.name || `${user.first_name} ${user.last_name}`).toLowerCase();
    const email = (user.email || '').toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower);
  }) || [];

  const addParticipant = (user) => {
    if (!bulkConfig.participants.find(p => p.id === user.id)) {
      updateConfig({ 
        participants: [...bulkConfig.participants, user] 
      });
    }
  };

  const removeParticipant = (userId) => {
    updateConfig({ 
      participants: bulkConfig.participants.filter(p => p.id !== userId) 
    });
  };

  const maxParticipants = bulkConfig.type === 'participants' ? 10 : 1;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Select Participants</h4>
        <p className="text-sm text-gray-600">
          {bulkConfig.type === 'participants' 
            ? 'Choose multiple customers for the same time slot'
            : 'Choose the customer for these bookings'
          }
        </p>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search customers by name or email..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Selected Participants */}
      {bulkConfig.participants.length > 0 && (
        <div>
          <h5 className="font-medium text-gray-900 mb-3">
            Selected Participants ({bulkConfig.participants.length})
          </h5>
          <div className="space-y-2">
            {bulkConfig.participants.map(participant => (
              <div key={participant.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div>
                  <span className="font-medium text-blue-900">
                    {participant.name || `${participant.first_name} ${participant.last_name}`}
                  </span>
                  <span className="text-sm text-blue-600 ml-2">
                    {participant.email}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-red-600 hover:text-red-800 transition-colors"
                  onClick={() => removeParticipant(participant.id)}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Users */}
      {bulkConfig.participants.length < maxParticipants && (
        <div>
          <h5 className="font-medium text-gray-900 mb-3">Available Customers</h5>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {filteredUsers.map(user => {
              const isSelected = bulkConfig.participants.find(p => p.id === user.id);
              if (isSelected) return null;

              return (
                <button
                  key={user.id}
                  type="button"
                  className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-left"
                  onClick={() => addParticipant(user)}
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {user.name || `${user.first_name} ${user.last_name}`}
                    </span>
                    <span className="text-sm text-gray-600 ml-2">
                      {user.email}
                    </span>
                  </div>
                  <PlusIcon className="h-4 w-4 text-blue-600" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Step 4: Preview and Settings
const Step4Preview = ({ bookingsPreviews, bulkConfig, updateConfig }) => {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Review Bookings</h4>
        <p className="text-sm text-gray-600">
          Review and configure the bookings that will be created
        </p>
      </div>

      {/* Additional Settings */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h5 className="font-medium text-gray-900 mb-3">Booking Settings</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={bulkConfig.paymentMethod}
              onChange={(e) => updateConfig({ paymentMethod: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="package">Package Hours</option>
            </select>
          </div>
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={bulkConfig.usePackageHours}
                onChange={(e) => updateConfig({ usePackageHours: e.target.checked })}
              />
              <span className="ml-2 text-sm text-gray-700">Use Package Hours</span>
            </label>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            placeholder="Add any notes for all bookings..."
            value={bulkConfig.notes}
            onChange={(e) => updateConfig({ notes: e.target.value })}
          />
        </div>
      </div>

      {/* Booking Previews */}
      <div>
        <h5 className="font-medium text-gray-900 mb-3">
          Bookings to Create ({bookingsPreviews.length})
        </h5>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {bookingsPreviews.map((preview, index) => (
            <div key={preview.id} className="p-3 bg-white border border-gray-200 rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm font-medium text-gray-900">
                      {format(parseISO(preview.date), 'MMM dd, yyyy')}
                    </span>
                    <span className="text-sm text-gray-600">
                      {preview.startTime} - {preview.endTime}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 mt-1">
                    <span className="text-sm text-blue-600">{preview.serviceName}</span>
                    <span className="text-sm text-gray-600">{preview.instructorName}</span>
                    <span className="text-sm text-green-600">{preview.participantName}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500">#{index + 1}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BulkBookingAssistant;
