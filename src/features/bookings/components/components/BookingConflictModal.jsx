import { Fragment } from 'react';
// eslint-disable-next-line no-unused-vars
import { Dialog, Transition } from '@headlessui/react';
// eslint-disable-next-line no-unused-vars
import { ExclamationTriangleIcon, ClockIcon, UserIcon } from '@heroicons/react/24/outline';

/**
 * Modal for handling booking conflicts
 * Shows conflicting bookings and allows user to force create or cancel
 */
const BookingConflictModal = ({ 
  isOpen, 
  onClose, 
  conflicts, 
  conflictDetails, 
  newBookingData,
  onForceCreate,
  onCancel 
}) => {
  if (!conflicts || conflicts.length === 0) return null;

  const formatTime = (timeString) => {
    if (!timeString) return '';
    try {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours, 10);
      const minute = parseInt(minutes, 10) || 0;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return `${hour12}${minute !== 0 ? `:${minute.toString().padStart(2, '0')}` : ''} ${ampm}`;
    } catch {
      return timeString;
    }
  };

  const getConflictIcon = (conflict) => {
    switch (conflict.status) {
      case 'confirmed':
        return <ClockIcon className="h-5 w-5 text-orange-500" />;
      case 'checked-in':
        return <UserIcon className="h-5 w-5 text-blue-500" />;
      case 'completed':
        return <ClockIcon className="h-5 w-5 text-green-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-orange-100 text-orange-800';
      case 'checked-in':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center space-x-3 mb-4">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
                  </div>
                  <div>
                    <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                      Booking Conflict Detected
                    </Dialog.Title>
                    <p className="text-sm text-gray-500">
                      {conflictDetails?.message}
                    </p>
                  </div>
                </div>

                {/* New Booking Info */}
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">New Booking Request:</h4>
                  <div className="text-sm text-blue-800">
                    <p>Date: {newBookingData?.date ? new Date(newBookingData.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}</p>
                    <p>Time: {formatTime(newBookingData?.time)}</p>
                    <p>Duration: {newBookingData?.duration || 60} minutes</p>
                    <p>Service: {newBookingData?.serviceName}</p>
                    <p>Student: {newBookingData?.userName || newBookingData?.user?.name}</p>
                  </div>
                </div>

                {/* Conflicting Bookings */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Conflicting Bookings:</h4>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {conflicts.map((conflict, index) => (
                      <div key={conflict.id || index} className="p-3 border border-red-200 rounded-lg bg-red-50">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-2">
                            {getConflictIcon(conflict)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-red-900">
                                {conflict.serviceName}
                              </p>
                              <p className="text-sm text-red-700">
                                Student: {conflict.studentName}
                              </p>
                              <p className="text-xs text-red-600">
                                Time: {formatTime(conflict.startTime)}
                                {conflict.endTime && ` - ${formatTime(conflict.endTime)}`}
                              </p>
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(conflict.status)}`}>
                            {conflict.status}
                          </span>
                        </div>
                        {conflict.overlapType === 'exact' && (
                          <div className="mt-2 text-xs text-red-600 font-medium">
                            ⚠️ Exact time overlap
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Warning Message */}
                <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Warning:</strong> Creating this booking will result in overlapping appointments. 
                    This may cause scheduling conflicts and confusion for instructors and students.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    type="button"
                    className="flex-1 inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                    onClick={onCancel}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="flex-1 inline-flex justify-center rounded-md border border-transparent bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition-colors"
                    onClick={onForceCreate}
                  >
                    Create Anyway
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default BookingConflictModal;
