import { CheckCircleIcon, CalendarDaysIcon, UserCircleIcon, AcademicCapIcon } from '@heroicons/react/24/outline';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { computeBookingPrice, getPricingBreakdown } from '@/shared/utils/pricing';
import { useEffect, useRef, useState } from 'react';
import { Checkbox, Alert, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

/**
 * S        <div className="flex items-start mb-4">
          <div className="flex-shrink-0 mt-1">
            <CheckCircleIcon className="h-5 w-5 text-gray-500" />
          </div>
          <div className="ml-3">
            <h5 className="text-sm font-medium text-gray-700">{paymentInfo.label}</h5>
            <p className="text-sm text-gray-600">{paymentInfo.description}</p>
            <p className="text-xs text-gray-500">{paymentInfo.subInfo}</p>
            <p className="text-sm font-medium text-gray-900">{paymentInfo.price}</p>
          </div>
        </div>firmation Step
 * Shows a summary of all booking details and allows final submission
 * 
 * @param {Object} props - Component props
 * @param {Object} props.formData - Current form data
 * @param {Function} props.updateFormData - Function to update form data
 * @param {Function} props.onSubmit - Function to submit the booking
 * @param {Function} props.onPrev - Function to move to previous step
 * @param {boolean} props.hideNavigation - Whether to hide step navigation buttons
 * @param {Boolean} props.isSubmitting - Whether the form is currently submitting
 * @returns {JSX.Element} ConfirmationStep component
 */
// eslint-disable-next-line complexity
const ConfirmationStep = ({ formData, updateFormData, onSubmit, onPrev, isSubmitting, hideNavigation = false }) => {
  const [allowNegativeBalance, setAllowNegativeBalance] = useState(formData.allowNegativeBalance || false);
  
  // Format price for display with fallback
  const { formatCurrency, businessCurrency } = useCurrency();
  const currencyCode = formData?.currency || businessCurrency || 'EUR';
  const formatPrice = (price) => {
    const num = Number(price);
    if (!isFinite(num)) return formatCurrency(0, currencyCode);
    return formatCurrency(num, currencyCode);
  };
  const fetchingRef = useRef(false);
  
  // Format date for display with error handling
  const formatDate = (dateString) => {
    if (!dateString) return 'Not selected';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Error formatting date:', error);
      return 'Invalid date';
    }
  };
  
  // Calculate duration in hours for package calculations
  const calculateDurationInHours = () => {
    if (!formData.startTime || !formData.endTime) return 1; // Default 1 hour
    
    try {
      const startTimeParts = formData.startTime.split(':').map(Number);
      const endTimeParts = formData.endTime.split(':').map(Number);
      
      if (startTimeParts.length !== 2 || endTimeParts.length !== 2) return 1;
      
      const [startHour, startMinute] = startTimeParts;
      const [endHour, endMinute] = endTimeParts;
      
      if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) return 1;
      
      const startTotalMinutes = (startHour * 60) + startMinute;
      const endTotalMinutes = (endHour * 60) + endMinute;
      
      if (endTotalMinutes <= startTotalMinutes) return 1;
      
      const durationInHours = (endTotalMinutes - startTotalMinutes) / 60;
      return Math.max(0.5, durationInHours); // Minimum 30 minutes
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Error calculating duration in hours:', error);
      return 1; // Default fallback
    }
  };
    // Calculate time duration with proper validation
  const calculateTimeDuration = () => {
    if (!formData.startTime || !formData.endTime) return 'Not specified';
    
    try {
      const startTimeParts = formData.startTime.split(':');
      const endTimeParts = formData.endTime.split(':');
      
      if (startTimeParts.length !== 2 || endTimeParts.length !== 2) {
        return 'Invalid time format';
      }
      
      const [startHour, startMinute] = startTimeParts.map(Number);
      const [endHour, endMinute] = endTimeParts.map(Number);
      
      if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
        return 'Invalid time values';
      }
      
      const startTotalMinutes = (startHour * 60) + startMinute;
      const endTotalMinutes = (endHour * 60) + endMinute;
      
      if (endTotalMinutes <= startTotalMinutes) {
        return 'Invalid time range';
      }
      
      const durationInMinutes = endTotalMinutes - startTotalMinutes;
      const hours = Math.floor(durationInMinutes / 60);
      const minutes = durationInMinutes % 60;
      
      if (hours === 0) {
        return `${minutes} minutes`;
      } else if (minutes === 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
      } else {
        return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minutes`;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Error calculating duration:', error);
      return 'Unable to calculate';
    }
  };
    // Calculate booking total with validation
  const participantsCount = formData.participants?.length && formData.participants.length > 1 ? formData.participants.length : 1;
  const durationHours = formData.serviceDuration || calculateDurationInHours();
  const baseTotal = Number(formData.servicePrice) || 0;
  // Derive per-person hourly rate from total price set earlier at service selection
  const hourlyRatePerPerson = durationHours > 0 
    ? (baseTotal / (durationHours * participantsCount)) 
    : 0;
  const packageHoursAvailable = (formData.usePackageHours && formData.selectedPackage)
    ? Number(formData.selectedPackage.remainingHours || 0)
    : 0;
  const finalTotal = computeBookingPrice({
    plannedHours: durationHours,
    hourlyRate: hourlyRatePerPerson,
    packageHoursAvailable,
    step: 0.25,
    participants: participantsCount
  });
  const breakdown = getPricingBreakdown({
    plannedHours: durationHours,
    hourlyRate: hourlyRatePerPerson,
    packageHoursAvailable,
    step: 0.25,
    participants: participantsCount
  });
  const duration = calculateTimeDuration();
  const _isValidBooking = (formData.participants?.length > 0 || formData.userName) && 
                        formData.date && formData.startTime && 
                        formData.endTime && formData.instructorName && formData.serviceName;

  // AUTO-FETCH REMOVED - Package selection is now 100% manual via ParticipantPackageStep
  // Users must explicitly select packages; system will not auto-assign packages

  // Determine payment method and display information for multi-participant bookings
  // eslint-disable-next-line complexity
  const getPaymentDisplayInfo = () => {
    if (formData.participants?.length > 1) {
      // Group booking payment logic
      // Only consider a participant as using package if they have both usePackage=true AND an actual package selected
      const packageUsers = formData.participants.filter(p => p.usePackage && p.selectedPackageId);
      const cashUsers = formData.participants.filter(p => !p.usePackage || !p.selectedPackageId);
      const perPersonTotal = participantsCount > 0 ? (baseTotal / participantsCount) : baseTotal;
      
      if (packageUsers.length === formData.participants.length) {
        return {
          label: 'Package Payment (All Participants)',
          description: `${formData.participants.length} participants using package hours`,
          subInfo: `Duration: ${duration}`,
          price: formatPrice(0),
          total: formatPrice(0)
        };
      } else if (packageUsers.length > 0) {
        const cashTotal = cashUsers.length * perPersonTotal;
        return {
          label: 'Mixed Payment',
          description: `${packageUsers.length} using packages, ${cashUsers.length} paying cash`,
          subInfo: `Duration: ${duration}`,
          price: formatPrice(baseTotal),
          total: formatPrice(cashTotal)
        };
      } else {
        const totalCost = baseTotal;
        return {
          label: 'Cash Payment (All Participants)',
          description: `${formData.participants.length} participants`,
          subInfo: `Duration: ${duration} × ${formData.participants.length} participants`,
          price: formatPrice(baseTotal),
          total: formatPrice(totalCost)
        };
      }
    } else {
      // Single participant or legacy booking logic
      const isPackagePayment = formData.usePackageHours && formData.selectedPackage;
      const participant = formData.participants?.[0];
      // For single-participant flow we REQUIRE explicit participant flags to use a package.
      const participantUsesPackage = Boolean(participant?.usePackage) && Boolean(participant?.selectedPackageId);
      // Prefer participant-level selection; only fall back to form-level if there is no participant
      const selectedPackageId = participant?.selectedPackageId || participant?.customerPackageId || (participant ? null : (isPackagePayment ? formData.selectedPackage?.id : null));
      const usePackage = participant ? (participantUsesPackage && !!selectedPackageId) : isPackagePayment;
      
      if (usePackage) {
        const pkg = participant ? (participant.selectedPackage || participant.availablePackages?.[0]) : formData.selectedPackage;
        const allCovered = breakdown.chargeableHours === 0;
        return allCovered ? {
          label: 'Package Payment',
          description: `Using ${breakdown.usedFromPackage}h from ${pkg?.packageName || pkg?.package_name || 'Package'}`,
          subInfo: `${pkg?.remainingHours || pkg?.remaining_hours || 0}h remaining before booking`,
          price: formatPrice(0),
          total: formatPrice(0)
        } : {
          label: 'Mixed Payment',
          description: `${breakdown.usedFromPackage}h from package, pay ${breakdown.chargeableHours}h`,
          subInfo: `Duration: ${duration}`,
          price: formatPrice(baseTotal),
          total: formatPrice(finalTotal)
        };
      }
      // Cash only
      return {
        label: 'Cash Payment',
        description: formData.serviceName,
        subInfo: `Duration: ${duration}`,
        price: formatPrice(baseTotal),
        total: formatPrice(baseTotal)
      };
    }
  };

  const paymentInfo = getPaymentDisplayInfo();
  const isPackagePayment = paymentInfo.label.includes('Package');

  return (
    <div>
      <h4 className="text-md font-semibold mb-4">Review Booking Details</h4>
      
      {/* Summary sections */}
      <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-4">
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0 mt-1">
            <CalendarDaysIcon className="h-5 w-5 text-gray-500" />
          </div>
          <div className="ml-3">
            <h5 className="text-sm font-medium text-gray-700">Date & Time</h5>
            <p className="text-sm text-gray-600">{formatDate(formData.date)}</p>
            <p className="text-sm text-gray-600">{formData.startTime} - {formData.endTime} ({calculateTimeDuration()})</p>
          </div>
        </div>
        
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0 mt-1">
            <UserCircleIcon className="h-5 w-5 text-gray-500" />
          </div>
          <div className="ml-3">
            <h5 className="text-sm font-medium text-gray-700">
              {formData.participants?.length > 1 ? `Participants (${formData.participants.length})` : 'Customer'}
            </h5>
            {formData.participants && formData.participants.length > 0 ? (
              <div className="space-y-2">
                {formData.participants.map((participant) => (
                  <div key={participant.userId} className="border-l-2 border-blue-200 pl-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600 font-medium">{participant.userName}</p>
                      {participant.isPrimary && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">Primary</span>
                      )}
                    </div>
                    {participant.userEmail && <p className="text-xs text-gray-500">{participant.userEmail}</p>}
                    {participant.usePackage && participant.selectedPackageId && (
                      <p className="text-xs text-green-600">Using package hours</p>
                    )}
                    {formData.participants.length > 1 && (
                      <p className="text-xs text-gray-500">Payment: {participant.paymentStatus}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Fallback for backwards compatibility
              <div>
                <p className="text-sm text-gray-600">{formData.userName}</p>
                {formData.userEmail && <p className="text-sm text-gray-500">{formData.userEmail}</p>}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0 mt-1">
            <AcademicCapIcon className="h-5 w-5 text-gray-500" />
          </div>
          <div className="ml-3">
            <h5 className="text-sm font-medium text-gray-700">Instructor</h5>
            <p className="text-sm text-gray-600">{formData.instructorName}</p>
          </div>
        </div>
        
        <div className="flex items-start">
          <div className="flex-shrink-0 mt-1">
            <CheckCircleIcon className="h-5 w-5 text-gray-500" />
          </div>
          <div className="ml-3">
            <h5 className="text-sm font-medium text-gray-700">{paymentInfo.label}</h5>
            <p className="text-sm text-gray-600">{paymentInfo.description}</p>
            {isPackagePayment && (
              <div className="mt-1">
                <p className="text-xs text-green-600">{paymentInfo.subInfo}</p>
                <p className="text-xs text-gray-500">Package expires: {formData.selectedPackage?.expiryDate ? new Date(formData.selectedPackage.expiryDate).toLocaleDateString() : 'No expiry'}</p>
              </div>
            )}
            {!isPackagePayment && (
              <p className="text-xs text-gray-500">{paymentInfo.subInfo}</p>
            )}
            <p className="text-sm font-medium text-gray-900">{paymentInfo.price}</p>
          </div>
        </div>
      </div>
      
      {/* Notes section if there are any */}
      {formData.notes && (
        <div className="mb-4">
          <h5 className="text-sm font-medium text-gray-700 mb-1">Special Requirements:</h5>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <p className="text-sm text-gray-600">{formData.notes}</p>
          </div>
        </div>
      )}
      
      {/* Total and booking options */}
      <div className="border-t border-gray-200 pt-4 mb-4">
        <div className="flex justify-between items-center mb-4">
          <h5 className="text-base font-medium text-gray-900">Total</h5>
          <span className="text-lg font-semibold text-gray-900">{paymentInfo.total}</span>
        </div>
        
        {/* Allow Negative Balance Option */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <Checkbox
            checked={allowNegativeBalance}
            onChange={(e) => {
              const checked = e.target.checked;
              setAllowNegativeBalance(checked);
              updateFormData({ allowNegativeBalance: checked });
            }}
          >
            <span className="font-medium text-gray-900">Allow Negative Balance</span>
            <Tooltip title="When enabled, participants can book even if they don't have sufficient wallet balance. They will go into debt.">
              <InfoCircleOutlined className="ml-2 text-gray-400" />
            </Tooltip>
          </Checkbox>
          {allowNegativeBalance && (
            <Alert
              message="Negative balance enabled - participants can go into debt"
              type="warning"
              showIcon
              className="mt-3"
            />
          )}
        </div>
        
  {/* Check-in status controls removed per request */}
      </div>
      
      {/* Navigation buttons */}
      {!hideNavigation && (
        <div className="mt-6 flex justify-between">
          <button
            type="button"
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            onClick={onPrev}
            disabled={isSubmitting}
          >
            Previous
          </button>
          <button
            type="button"
            className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              isSubmitting 
                ? 'bg-blue-400' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Confirming...' : 'Confirm Booking'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ConfirmationStep;
