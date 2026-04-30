import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from 'antd';
import { XMarkIcon, PencilSquareIcon, TrashIcon, CheckCircleIcon, CheckIcon, ClockIcon, CurrencyDollarIcon, UserCircleIcon, CalendarDaysIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useCalendar } from '../contexts/CalendarContext';
import { useData } from '@/shared/hooks/useData';
import globalRequestThrottle from '@/shared/utils/requestThrottle';
import { useToast } from '@/shared/contexts/ToastContext';
import { logger } from '@/shared/utils/logger';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';

const EnhancedCustomerDetailModal = lazy(() => import('@/features/customers/components/EnhancedCustomerDetailModal'));
const EnhancedInstructorDetailModal = lazy(() => import('@/features/instructors/components/EnhancedInstructorDetailModal'));

function EditField({ icon: Icon, label, hint, children }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-slate-500 mb-1.5">
        {Icon ? <Icon className="h-3 w-3 text-sky-500" /> : null}
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block mt-1 text-[11px] text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

function CreatedBySection({ booking }) {
  const createdByLabel = booking.createdByLabel || booking.created_by_name || booking.createdByName || null;
  const createdAtRaw = booking.createdAt || booking.created_at || null;

  let createdAtFormatted = booking.createdAtFormatted || null;
  if (!createdAtFormatted && createdAtRaw) {
    const d = new Date(createdAtRaw);
    if (!isNaN(d.getTime())) {
      try { createdAtFormatted = format(d, 'MMM dd, yyyy HH:mm'); } catch { /* leave null */ }
    }
  }

  if (!createdByLabel && !createdAtFormatted) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center">
          <UserCircleIcon className="h-4 w-4 text-slate-400 mr-2" />
          Created by
        </h4>
      </div>
      <div className="p-4">
        {createdByLabel && (
          <p className="text-sm font-medium text-slate-800 m-0">{createdByLabel}</p>
        )}
        {createdAtFormatted && (
          <p className="text-xs text-slate-500 mt-0.5 m-0">{createdAtFormatted}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Modal for viewing and editing booking details
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to close the modal
 * @param {Object} props.booking - Booking data to display
 * @returns {JSX.Element} BookingDetailModal component
 */
const BookingDetailModal = ({ isOpen, onClose, booking, onServiceUpdate }) => {
  const { t } = useTranslation(['common']);
  const { deleteBooking, updateBooking, refreshData } = useCalendar();
  const { showSuccess, showError } = useToast();
  const { getCurrencySymbol, businessCurrency } = useCurrency();
  const currencySymbol = getCurrencySymbol(businessCurrency);
  const { user } = useAuth();
  const canModifyBooking = ['manager', 'admin', 'developer'].includes(user?.role?.toLowerCase?.() || '');
  // Instructors see duration/rate/commission but not the total booking amount.
  const isInstructor = user?.role?.toLowerCase?.() === 'instructor';
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
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
    instructor_commission_type: 'fixed',
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
    } catch {
      return dateString;
    }
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'yyyy-MM-dd');
    } catch (error) {
      logger.error('Error formatting date for input', { error: String(error) });
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
  } catch {
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
    } catch {
      return '';
    }
  };
  
  useEffect(() => {
    if (booking) {

      setCheckInStatus(booking.checkInStatus || booking.status || 'pending');
      setEditForm({
        notes: booking.notes || '',
        serviceName: booking.serviceName || booking.service_name || '',
        duration: Number(booking.duration) || 1,
        date: formatDateForInput(booking.date) || '',
        price: booking.final_amount || booking.amount || booking.price || 0, // Use final_amount as priority
        instructor_commission: booking.instructor_commission || 0,
        instructor_commission_type: booking.commission_type || 'fixed',
        service_id: booking.service_id || null,
        instructor_id: booking.instructor_user_id || booking.instructorId || null
      });
      setCheckoutForm({
        actualDuration: Number(booking.actualDuration) || Number(booking.duration) || 1,
        notes: ''
      });
    }
    setIsEditing(false);
    setIsDeleting(false);
    setIsProcessing(false);
    setIsCheckingOut(false);
    setCheckoutAction('completed');
  }, [booking]);
  
  // Get cached data from contexts
  const { instructors: cachedInstructors } = useData();
  const { services: cachedServices } = useCalendar();

  // Fetch services and instructors when modal opens - use cached data when available
  useEffect(() => {
    const fetchServicesAndInstructors = async () => {
      // First try to use cached data from contexts
      if (cachedInstructors?.length > 0) {
        setInstructors(cachedInstructors);
      }
      
      if (cachedServices?.length > 0) {
        setServices(cachedServices);
        return; // Skip API calls if we have cached data
      }
      
      setIsDataLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        };

        // Use throttling for API calls
        const servicesResponse = await globalRequestThrottle.execute(() => 
          fetch('/api/services', { headers })
        );
        const instructorsResponse = await globalRequestThrottle.execute(() => 
          fetch('/api/instructors', { headers })
        );
        
        if (servicesResponse.ok) {
          const servicesData = await servicesResponse.json();
          setServices(servicesData);
        } else {
          logger.error('Failed to fetch services', { statusText: servicesResponse.statusText });
        }

        if (instructorsResponse.ok) {
          const instructorsData = await instructorsResponse.json();
          setInstructors(instructorsData);
        } else {
          logger.error('Failed to fetch instructors', { statusText: instructorsResponse.statusText });
        }

      } catch (error) {
        logger.error('Failed to fetch services or instructors', { error: String(error) });
      } finally {
        setIsDataLoading(false);
      }
    };

    if (isOpen && booking) {
      fetchServicesAndInstructors();
    }
  }, [isOpen, booking, cachedInstructors, cachedServices]);
  // Ensure form values are properly set when services and instructors data becomes available
  useEffect(() => {
    if (booking && services.length > 0 && instructors.length > 0) {
      const selectedInstructor = instructors.find(i => i.id === (booking.instructor_user_id || booking.instructorId));
      
      setEditForm(prev => ({
        ...prev,
        service_id: booking.service_id || null,
        instructor_id: booking.instructor_user_id || booking.instructorId || null,
        // Use booking's individual price, not service price
        price: booking.final_amount || booking.amount || booking.price || 0,
        instructor_commission: booking.instructor_commission || (selectedInstructor?.commission_rate) || 0,
        instructor_commission_type: booking.commission_type || selectedInstructor?.commission_type || 'fixed'
      }));
    }
  }, [booking, services, instructors]);

  // Update commission when instructor changes (but not price)
  useEffect(() => {
    if (!isEditing) return;

    const selectedInstructor = instructors.find(i => i.id === editForm.instructor_id);
    if (selectedInstructor && editForm.instructor_commission === 0) {
      setEditForm(prev => ({
        ...prev,
        instructor_commission: selectedInstructor.commission_rate || 0,
        instructor_commission_type: selectedInstructor.commission_type || 'fixed'
      }));
    }
  }, [editForm.instructor_id, editForm.instructor_commission, instructors, isEditing]);

  // Handle check-in status change
  const handleUpdateStatus = async (status) => {
    if (!booking || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      await updateBooking(booking.id, { status: status });
      
      // Show success message based on status
      const statusMessage = status === 'confirmed' ? 'checked-in' : status;
      showSuccess(`Booking ${statusMessage} successfully!`);
      
      setCheckInStatus(status);
      const merged = { ...booking, status };
      window.dispatchEvent(
        new CustomEvent('booking-updated', {
          detail: { booking: merged, bookingId: booking.id, action: 'status-update', newStatus: status },
        }),
      );
      
      setIsProcessing(false);
    } catch (error) {
      setIsProcessing(false);
      
      // Show specific error messages
      let errorMessage = 'Status update failed';
      let errorCode = 'UNKNOWN';
      
      if (error.response?.status === 429) {
        errorMessage = 'Status update failed - Too many requests';
        errorCode = 'RATE_LIMIT';
      } else if (error.response?.status === 400) {
        errorMessage = 'Status update failed - Invalid data';
        errorCode = 'BAD_REQUEST';
      } else if (error.response?.status === 404) {
        errorMessage = 'Status update failed - Booking not found';
        errorCode = 'NOT_FOUND';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Status update failed - Server error';
        errorCode = 'SERVER_ERROR';
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        errorMessage = 'Status update failed - Network error';
        errorCode = 'NETWORK_ERROR';
      }
      
      showError(`${errorMessage} (Error code: ${errorCode})`);
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
  };  // Handle checkout with actual duration and proper error handling
  const handleCheckout = async () => {
    if (!booking || isProcessing) return;
    
    // Validation
    if (!checkoutForm.actualDuration || checkoutForm.actualDuration <= 0) {
      showError(t('common:bookings.detail.checkoutInvalidDuration'));
      return;
    }
    
    setIsProcessing(true);
    
    const updatePayload = { 
      status: 'completed', // Use valid status from constraint
      duration: checkoutForm.actualDuration, // Use the correct database field name
      checkout_status: 'checked-out', // Fixed: use valid constraint value
      checkout_notes: checkoutForm.notes,
      checkout_time: new Date().toISOString()
    };
    
    try {
      // Wait for the backend response before showing any notification
      await updateBooking(booking.id, updatePayload);
      
      // Only show success if backend succeeds
      showSuccess(t('common:bookings.detail.checkoutSuccess', { action: checkoutAction, duration: checkoutForm.actualDuration }));
      
      // Dispatch event to notify other components about the booking update
      window.dispatchEvent(new CustomEvent('booking-updated', {
        detail: { bookingId: booking.id, action: 'checkout', status: checkoutAction }
      }));
      
      // Close form after successful update
      setIsProcessing(false);
      setIsCheckingOut(false);
      onClose();
      
    } catch (error) {
      setIsProcessing(false);
      
      // Show specific error messages based on error type
      let errorMessage = 'Check-out failed';
      let errorCode = 'UNKNOWN';
      
      if (error.response?.status === 429) {
        errorMessage = 'Check-out failed - Too many requests';
        errorCode = 'RATE_LIMIT';
      } else if (error.response?.status === 400) {
        errorMessage = 'Check-out failed - Invalid data';
        errorCode = 'BAD_REQUEST';
      } else if (error.response?.status === 404) {
        errorMessage = 'Check-out failed - Booking not found';
        errorCode = 'NOT_FOUND';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Check-out failed - Server error';
        errorCode = 'SERVER_ERROR';
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        errorMessage = 'Check-out failed - Network error';
        errorCode = 'NETWORK_ERROR';
      } else {
        errorMessage = 'Check-out failed - Unknown error';
        errorCode = 'UNKNOWN';
      }
      
      showError(`${errorMessage} (Error code: ${errorCode})`);
    }
  };
  
  // Handle booking update
  const handleUpdateBooking = async () => {
    if (!booking || isProcessing) return;

    setIsProcessing(true);

    try {
      const { serviceName: _serviceName, instructor_id, price, ...rest } = editForm;
      const numericAmount = parseFloat(price) || 0;

      // Backend reads `amount` (not `price`); also clear stale `final_amount`
      // so the display recomputes from the new amount.
      const finalPayload = {
        ...rest,
        amount: numericAmount,
        final_amount: numericAmount,
        instructor_user_id: instructor_id
      };

      await updateBooking(booking.id, finalPayload);

      showSuccess(t('common:bookings.detail.updateSuccess'));

      Object.assign(booking, finalPayload, {
        commission_type: finalPayload.instructor_commission_type
      });

      setEditForm(prev => ({
        ...prev,
        ...rest,
        price: numericAmount,
        instructor_id
      }));

      window.dispatchEvent(new CustomEvent('booking-updated', {
        detail: { bookingId: booking.id, updatedBooking: { ...booking } }
      }));

      if (onServiceUpdate) {
        await onServiceUpdate();
      }
      if (refreshData) {
        refreshData().catch(() => {});
      }

      setTimeout(() => {
        setIsProcessing(false);
        setIsEditing(false);
      }, 1000);
    } catch (error) {
      setIsProcessing(false);

      const status = error.response?.status;
      const serverMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      let prefix = 'Booking update failed';
      if (status === 429) prefix = 'Booking update failed — too many requests';
      else if (status === 400) prefix = 'Booking update failed — invalid data';
      else if (status === 404) prefix = 'Booking update failed — booking not found';
      else if (status >= 500) prefix = 'Booking update failed — server error';
      else if (error.code === 'NETWORK_ERROR' || !error.response) prefix = 'Booking update failed — network error';

      logger.error('Booking update failed', { status, serverMsg, error });
      showError(serverMsg ? `${prefix}: ${serverMsg}` : prefix);
    }
  };
    // Handle booking deletion
  const handleDeleteBooking = async () => {
    if (!booking || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      // Wait for the CalendarContext deleteBooking to fully complete
      await deleteBooking(booking.id);
      
      // Force an additional refresh to ensure calendar is up to date
      await refreshData();
      
      showSuccess(t('common:bookings.detail.deleteSuccess'));
      
      // Dispatch event to notify other components about the booking deletion
      window.dispatchEvent(new CustomEvent('booking-updated', {
        detail: { bookingId: booking.id, action: 'delete' }
      }));
      
      // Give extra time for calendar to refresh before closing modal
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 1500); // Increased from 1000ms to 1500ms
    } catch (error) {
  logger.error('Booking deletion failed', { error: String(error) });
      setIsProcessing(false);
      
      // Show specific error messages
      let errorMessage = 'Booking deletion failed';
      let errorCode = 'UNKNOWN';
      
      if (error.response?.status === 429) {
        errorMessage = 'Booking deletion failed - Too many requests';
        errorCode = 'RATE_LIMIT';
      } else if (error.response?.status === 400) {
        errorMessage = 'Booking deletion failed - Invalid request';
        errorCode = 'BAD_REQUEST';
      } else if (error.response?.status === 404) {
        errorMessage = 'Booking deletion failed - Booking not found';
        errorCode = 'NOT_FOUND';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Booking deletion failed - Server error';
        errorCode = 'SERVER_ERROR';
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        errorMessage = 'Booking deletion failed - Network error';
        errorCode = 'NETWORK_ERROR';
      }
      
      showError(`${errorMessage} (Error code: ${errorCode})`);
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
      
      showSuccess(t('common:bookings.detail.cancelSuccess'));
      
      // Dispatch event to notify other components about the booking cancellation
      window.dispatchEvent(new CustomEvent('booking-updated', {
        detail: { bookingId: booking.id, action: 'cancel', reason: cancelForm.reason }
      }));
      
      setTimeout(() => {
        setIsProcessing(false);
        setIsCancelling(false);
        onClose();
      }, 1000);
    } catch (error) {
      setIsProcessing(false);
  logger.error('Error cancelling booking', { error: String(error) });
      showError(t('common:bookings.detail.cancelFailed'));
    }
  };

  // Detect package bookings robustly across different data shapes
  // IMPORTANT: A booking should ONLY show as "package" if a package was actually used/deducted
  const isPackageBooking = (b) => {
    if (!b) return false;
    
    // Primary check: customer_package_id must exist AND payment_status must be 'package'
    // This ensures the booking was explicitly marked as using package hours
    const hasPackageId = !!b.customer_package_id;
    const hasPackageStatus = b.payment_status === 'package';
    
    // Only return true if BOTH conditions are met
    // This prevents false positives from stale/incorrect flags
    return hasPackageId && hasPackageStatus;
  };

  // Calculate display price — always return the real amount, even for package bookings
  const getDisplayPrice = () => {
    // Use backend calculated final_amount as the definitive source
    if (booking.final_amount && parseFloat(booking.final_amount) > 0) {
      return parseFloat(booking.final_amount);
    }

    // Fallback to amount field
    if (booking.amount && parseFloat(booking.amount) > 0) {
      return parseFloat(booking.amount);
    }

    // Last resort: use service base price (but this shouldn't happen for confirmed bookings)
    if (services.length > 0 && booking.service_id) {
      const selectedService = services.find((s) => s.id === booking.service_id);
      if (selectedService && selectedService.price) {
        return parseFloat(selectedService.price);
      }
    }

    return 0;
  };

  // Get package display info
  const getPackageDisplayInfo = () => {
    if (isPackageBooking(booking)) {
      const packageName = booking.package_name || null;
      const totalHours = parseFloat(booking.package_total_hours);
      const packagePrice = parseFloat(booking.package_price);
      const pricePerHour = (Number.isFinite(totalHours) && totalHours > 0 && Number.isFinite(packagePrice))
        ? packagePrice / totalHours
        : null;
      // Always derive total from per-hour × duration — booking.final_amount can be stale
      // (e.g. duration changed after creation but final_amount wasn't recomputed)
      const bookingDuration = Number(booking.actualDuration) || Number(booking.duration) || 1;
      const totalPrice = pricePerHour != null ? pricePerHour * bookingDuration : null;
      return {
        subtitle: packageName && packageName !== 'Package Hours' ? `Package: ${packageName}` : 'Paid with Package',
        pricePerHour,
        totalPrice,
      };
    }

    return null;
  };

  // Helper function to format commission display with correct unit
  // For fixed commissions the stored value is per-hour, so multiply by duration
  const formatCommissionDisplay = (commissionValue, { withTotal = true } = {}) => {
    if (!commissionValue) return null;

    // Prefer the commission_type resolved on the booking (matches the priority
    // chain: booking custom → service-specific → category rate → instructor default).
    // Fall back to the instructor's default only when the booking didn't carry one.
    const instructorId = booking.instructor_user_id || booking.instructorId || booking.instructor_id;
    const instructor = instructors.find(i => i.id === instructorId);
    const rawType = booking.commission_type || instructor?.commission_type;
    const isFixed = rawType === 'fixed' || rawType === 'fixed_amount';
    const duration = Number(booking.actualDuration) || Number(booking.duration) || 1;

    if (isFixed) {
      const total = Number(commissionValue) * duration;
      return `${currencySymbol}${total}`;
    }

    return `${commissionValue}%`;
  };
  
  if (!booking) return null;
  
  return (
  <>
    <Drawer
      open={isOpen}
      onClose={!isProcessing ? onClose : undefined}
      width={typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : 560}
      placement="right"
      closable={false}
      destroyOnHidden
      styles={{ body: { padding: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }, header: { display: 'none' } }}
    >
      {/* Header — sticky, integrated into the body scroll surface */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold tracking-[0.2em] uppercase mb-2 text-sky-600/80">
                {t('common:bookings.detail.title')}
              </div>
              <h2 className="text-[19px] leading-tight font-semibold text-slate-900 m-0 truncate">
                {booking?.service_name || booking?.serviceName || t('common:bookings.detail.viewAndManage')}
              </h2>
              {(booking?.date || booking?.startTime || booking?.start_hour || booking?.time) && (
                <p className="mt-1.5 text-[13px] text-slate-500 m-0 flex items-center gap-1.5 flex-wrap">
                  {booking?.date && <span>{formatDate(booking.date)}</span>}
                  {booking?.date && (booking?.startTime || booking?.start_hour || booking?.time) && (
                    <span className="text-slate-300" aria-hidden>·</span>
                  )}
                  {(booking?.startTime || booking?.start_hour || booking?.time) && (
                    <span className="tabular-nums">
                      {formatTime(booking.startTime || booking.start_hour || booking.time)}
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing}
              aria-label="Close"
              className="shrink-0 -mt-1 -mr-1 w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 bg-transparent border-0 cursor-pointer"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-sky-200/70 to-transparent" />
      </div>

      {/* Content */}
      <div className="p-5">
                {isDeleting ? (
                  <div className="space-y-3">                    <div className="bg-red-50 border-l-4 border-red-400 rounded-lg p-3">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        </div>                        <div className="ml-4">
                          <h3 className="text-base font-medium text-red-800">{t('common:bookings.detail.confirmDeleteTitle')}</h3>
                          <p className="text-red-700 mt-1 text-sm">
                            {t('common:bookings.detail.confirmDeleteDesc')}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2">                      <button
                        type="button"
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                        onClick={() => setIsDeleting(false)}
                        disabled={isProcessing}
                      >
                        {t('common:bookings.detail.back')}
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
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            {t('common:bookings.detail.deletingLabel')}
                          </div>
                        ) : (
                          t('common:bookings.detail.deleteBooking')
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
                          <h3 className="text-base font-medium text-orange-800">{t('common:bookings.detail.cancelBookingTitle')}</h3>
                          <p className="text-orange-700 mt-1 text-sm">
                            {t('common:bookings.detail.cancelDesc')}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('common:bookings.detail.cancelReason')}
                        </label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 resize-none"
                          rows="3"
                          placeholder={t('common:bookings.detail.cancelReasonPlaceholder')}
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
                        {t('common:bookings.detail.back')}
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
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            {t('common:bookings.detail.cancellingLabel')}
                          </div>
                        ) : (
                          t('common:bookings.detail.cancelBooking')
                        )}
                      </button>
                    </div>
                  </div>
                ) : isEditing ? (
                  isDataLoading ? (
                    <div className="flex justify-center items-center p-8">
                      <div className="flex flex-col items-center space-y-3">
                        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <p className="text-gray-600 font-medium text-sm">{t('common:bookings.detail.loadingForm')}</p>
                      </div>
                    </div>
                  ) : (() => {
                      const selectedInstructor = instructors.find(i => i.id === editForm.instructor_id);
                      const commissionType = editForm.instructor_commission_type
                        || selectedInstructor?.commission_type
                        || 'fixed';
                      const isPercentage = commissionType === 'percent' || commissionType === 'percentage';
                      const groupSize = Math.max(Number(booking.group_size) || 1, 1);
                      const numericPrice = parseFloat(editForm.price) || 0;
                      const perPersonPrice = groupSize > 1 ? numericPrice / groupSize : null;
                      const fmt2 = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                      return (
                        <div className="space-y-5">
                          {/* Eyebrow header */}
                          <div>
                            <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-sky-600/80 flex items-center gap-1.5">
                              <PencilSquareIcon className="h-3 w-3" />
                              {t('common:bookings.detail.editTitle')}
                            </div>
                            <p className="text-[13px] text-slate-500 mt-1.5 m-0">
                              {t('common:bookings.detail.editSubtitle')}
                            </p>
                          </div>

                          {/* Core fields — 2-column grid */}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                            <EditField icon={InformationCircleIcon} label={t('common:bookings.detail.service')}>
                              <select
                                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
                                value={editForm.service_id || ''}
                                onChange={(e) => handleEditFormChange('service_id', e.target.value)}
                                disabled={isProcessing}
                              >
                                <option value="" disabled>{t('common:bookings.detail.selectService')}</option>
                                {services.map(service => (
                                  <option key={service.id} value={service.id}>{service.name}</option>
                                ))}
                              </select>
                            </EditField>

                            <EditField icon={UserCircleIcon} label={t('common:bookings.columns.instructor')}>
                              <select
                                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
                                value={editForm.instructor_id || ''}
                                onChange={(e) => handleEditFormChange('instructor_id', e.target.value)}
                                disabled={isProcessing}
                              >
                                <option value="" disabled>{t('common:bookings.detail.selectInstructor')}</option>
                                {instructors.map(instructor => (
                                  <option key={instructor.id} value={instructor.id}>{instructor.name}</option>
                                ))}
                              </select>
                            </EditField>

                            <EditField icon={CalendarDaysIcon} label={t('common:bookings.detail.dateLabel')}>
                              <input
                                type="date"
                                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-800 tabular-nums focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
                                value={editForm.date}
                                onChange={(e) => handleEditFormChange('date', e.target.value)}
                                disabled={isProcessing}
                              />
                            </EditField>

                            <EditField icon={ClockIcon} label={t('common:bookings.detail.durationHours')}>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  className="w-full h-10 pl-3 pr-12 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-800 tabular-nums focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
                                  value={editForm.duration === 0 ? '' : editForm.duration}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      handleEditFormChange('duration', '');
                                    } else {
                                      const numValue = parseFloat(value);
                                      if (!isNaN(numValue) && numValue >= 0) {
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
                                <span className="absolute inset-y-0 right-3 flex items-center text-[11px] font-medium uppercase tracking-wider text-slate-400 pointer-events-none">
                                  hrs
                                </span>
                              </div>
                            </EditField>
                          </div>

                          {/* Notes */}
                          <EditField label={t('common:bookings.detail.notes')}>
                            <textarea
                              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
                              rows="3"
                              placeholder={t('common:bookings.detail.addNotesPlaceholder')}
                              value={editForm.notes}
                              onChange={(e) => handleEditFormChange('notes', e.target.value)}
                              disabled={isProcessing}
                            />
                          </EditField>

                          {/* Money panel — price + commission, the visual anchor */}
                          <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/60 to-white p-4 space-y-4">
                            {/* Price row */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-slate-500 flex items-center gap-1.5">
                                  <CurrencyDollarIcon className="h-3 w-3 text-sky-500" />
                                  {t('common:bookings.detail.bookingPrice')}
                                </span>
                                {groupSize > 1 ? (
                                  <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded-full">
                                    {groupSize} × participants
                                  </span>
                                ) : null}
                              </div>
                              <div className="relative">
                                <span className="absolute inset-y-0 left-3.5 flex items-center text-slate-400 text-base font-semibold pointer-events-none">
                                  {currencySymbol}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="w-full h-12 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-900 tabular-nums focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
                                  value={editForm.price === 0 ? '' : editForm.price}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      handleEditFormChange('price', '');
                                    } else {
                                      const numValue = parseFloat(value);
                                      if (!isNaN(numValue) && numValue >= 0) {
                                        handleEditFormChange('price', numValue);
                                      }
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      handleEditFormChange('price', 0);
                                    }
                                  }}
                                  disabled={isProcessing}
                                  placeholder="0.00"
                                />
                              </div>
                              <p className="mt-1.5 text-[11px] text-slate-500 tabular-nums">
                                {groupSize > 1 ? (
                                  <>
                                    <span className="text-slate-700 font-medium">
                                      {currencySymbol}{fmt2(perPersonPrice)}
                                    </span>
                                    <span className="text-slate-400"> / participant — splits across {groupSize}</span>
                                  </>
                                ) : (
                                  t('common:bookings.detail.individualBookingPrice')
                                )}
                              </p>
                            </div>

                            <div className="border-t border-sky-100/70" />

                            {/* Commission row */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-slate-500 flex items-center gap-1.5">
                                  <UserCircleIcon className="h-3 w-3 text-sky-500" />
                                  {t('common:bookings.detail.instructorCommission')}
                                </span>
                                {/* % / fixed segmented toggle */}
                                <div className="inline-flex items-center rounded-full bg-white border border-slate-200 p-0.5 text-[11px] font-semibold">
                                  <button
                                    type="button"
                                    onClick={() => handleEditFormChange('instructor_commission_type', 'percentage')}
                                    disabled={isProcessing}
                                    className={`px-2.5 py-0.5 rounded-full transition-colors ${
                                      isPercentage
                                        ? 'bg-slate-900 text-white'
                                        : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                  >
                                    %
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditFormChange('instructor_commission_type', 'fixed')}
                                    disabled={isProcessing}
                                    className={`px-2.5 py-0.5 rounded-full transition-colors ${
                                      !isPercentage
                                        ? 'bg-slate-900 text-white'
                                        : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                  >
                                    {currencySymbol}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-stretch gap-2">
                                <div className="relative flex-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max={isPercentage ? "100" : undefined}
                                    step={isPercentage ? "1" : "0.01"}
                                    className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-900 tabular-nums focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
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
                                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-sm font-semibold pointer-events-none">
                                    {isPercentage ? '%' : currencySymbol}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-sky-600 hover:border-sky-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  onClick={() => {
                                    if (selectedInstructor) {
                                      handleEditFormChange('instructor_commission', selectedInstructor.commission_rate || 0);
                                    }
                                  }}
                                  disabled={isProcessing || !editForm.instructor_id}
                                  title={t('common:bookings.detail.resetToDefault')}
                                >
                                  {t('common:bookings.detail.reset')}
                                </button>
                              </div>
                              <p className="mt-1.5 text-[11px] text-slate-500">
                                {isPercentage
                                  ? t('common:bookings.detail.percentageCommission')
                                  : t('common:bookings.detail.fixedCommission')}
                              </p>
                            </div>
                          </div>

                          {/* Action bar */}
                          <div className="flex justify-end gap-2 pt-3 mt-1 border-t border-slate-100">
                            <button
                              type="button"
                              className="h-10 px-4 rounded-lg text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                              onClick={() => setIsEditing(false)}
                              disabled={isProcessing}
                            >
                              {t('common:bookings.detail.cancel')}
                            </button>
                            <button
                              type="button"
                              className={`h-10 px-5 rounded-lg text-[13px] font-semibold text-white inline-flex items-center gap-1.5 transition-colors ${
                                isProcessing || isDataLoading
                                  ? 'bg-slate-300 cursor-not-allowed'
                                  : 'bg-sky-600 hover:bg-sky-700 shadow-[0_1px_2px_rgba(2,132,199,0.25)]'
                              }`}
                              onClick={handleUpdateBooking}
                              disabled={isProcessing || isDataLoading}
                            >
                              {isProcessing ? (
                                <>
                                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  {t('common:bookings.detail.savingLabel')}
                                </>
                              ) : (
                                <>
                                  <CheckIcon className="h-3.5 w-3.5" />
                                  {t('common:bookings.detail.save')}
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })()
                ) : isCheckingOut ? (
                  <div className="space-y-4">
                    {/* Checkout Form Header */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-purple-100/50 rounded-full -mr-8 -mt-8" />
                      <div className="relative">
                        <h4 className="text-base font-bold text-gray-900 flex items-center mb-1">
                          <div className="bg-purple-100 p-1.5 rounded-md shadow-sm border border-purple-200 mr-2">
                            <svg className="h-3 w-3 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                          </div>
                          {t('common:bookings.detail.completeBooking')}
                        </h4>
                        <p className="text-gray-600 ml-8 text-xs">{t('common:bookings.detail.checkoutSubtitle')}</p>
                      </div>
                    </div>

                    {/* Checkout Action Selection */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                      <label className="block text-sm font-bold text-gray-800 mb-3">
                        {t('common:bookings.detail.completionStatus')}
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="checkoutAction"
                            value="completed"
                            checked={checkoutAction === 'completed'}
                            onChange={(e) => setCheckoutAction(e.target.value)}
                            className="mr-2 text-green-600 focus:ring-green-500"
                          />
                          <span className="text-sm font-medium text-gray-900">{t('common:bookings.detail.completedSuccessfully')}</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="checkoutAction"
                            value="cancelled"
                            checked={checkoutAction === 'cancelled'}
                            onChange={(e) => setCheckoutAction(e.target.value)}
                            className="mr-2 text-red-600 focus:ring-red-500"
                          />
                          <span className="text-sm font-medium text-gray-900">{t('common:bookings.statusLabels.cancelled')}</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="checkoutAction"
                            value="no-show"
                            checked={checkoutAction === 'no-show'}
                            onChange={(e) => setCheckoutAction(e.target.value)}
                            className="mr-2 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-sm font-medium text-gray-900">{t('common:bookings.detail.noShow')}</span>
                        </label>
                      </div>
                    </div>

                    {/* Actual Duration */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                      <label className="block text-sm font-bold text-gray-800 mb-2">
                        {t('common:bookings.detail.actualDuration')}
                      </label>
                      <div className="flex items-stretch gap-2">
                        <button
                          type="button"
                          aria-label="Decrease duration"
                          className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-md bg-white text-gray-700 text-lg font-bold hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => {
                            const current = parseFloat(checkoutForm.actualDuration) || 0;
                            const next = Math.max(0.5, Math.round((current - 0.5) * 2) / 2);
                            handleCheckoutFormChange('actualDuration', next);
                          }}
                          disabled={isProcessing || (parseFloat(checkoutForm.actualDuration) || 0) <= 0.5}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.5"
                          step="0.5"
                          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 hover:border-gray-300 text-gray-900 font-medium text-center"
                          value={checkoutForm.actualDuration ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              handleCheckoutFormChange('actualDuration', '');
                              return;
                            }
                            const parsed = parseFloat(raw);
                            handleCheckoutFormChange('actualDuration', Number.isNaN(parsed) ? '' : parsed);
                          }}
                          onBlur={(e) => {
                            const parsed = parseFloat(e.target.value);
                            if (Number.isNaN(parsed) || parsed <= 0) {
                              handleCheckoutFormChange('actualDuration', 0.5);
                            }
                          }}
                          disabled={isProcessing}
                        />
                        <button
                          type="button"
                          aria-label="Increase duration"
                          className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-md bg-white text-gray-700 text-lg font-bold hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => {
                            const current = parseFloat(checkoutForm.actualDuration) || 0;
                            const next = Math.round((current + 0.5) * 2) / 2;
                            handleCheckoutFormChange('actualDuration', next);
                          }}
                          disabled={isProcessing}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        Original duration: {Number(booking.duration) || 1} hour{(Number(booking.duration) || 1) !== 1 ? 's' : ''}
                      </p>
                    </div>

                    {/* Completion Notes */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                      <label className="block text-sm font-bold text-gray-800 mb-2">
                        {t('common:bookings.detail.completionNotes')}
                      </label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 hover:border-gray-300 text-gray-900 resize-none"
                        rows="3"
                        placeholder={t('common:bookings.detail.completionNotesPlaceholder')}
                        value={checkoutForm.notes}
                        onChange={(e) => handleCheckoutFormChange('notes', e.target.value)}
                        disabled={isProcessing}
                      />
                    </div>

                    {/* Checkout Action Buttons */}
                    <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
                      <button
                        type="button"
                        className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all duration-200 hover:border-gray-400"
                        onClick={() => setIsCheckingOut(false)}
                        disabled={isProcessing}
                      >
                        {t('common:bookings.detail.cancel')}
                      </button>
                      <button
                        type="button"
                        className={`px-4 py-1.5 border border-transparent rounded-md shadow-sm text-xs font-bold text-white transition-all duration-200 ${
                          isProcessing
                            ? 'bg-gray-400 cursor-not-allowed border-gray-400'
                            : 'bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-500 '
                        }`}
                        onClick={handleCheckout}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <div className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-1 h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 004 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('common:bookings.detail.completingLabel')}
                          </div>
                        ) : (
                          <>
                            <CheckIcon className="h-3 w-3 mr-1 inline" />
                            {t('common:bookings.detail.completeBooking')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (<div className="space-y-4">
                    {/* Booking Overview */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div>
                            <h3 className="text-base font-bold text-slate-900 mb-1">{booking.service_name || t('common:bookings.detail.title')}</h3>
                            <p className="text-sm text-slate-600 font-medium flex items-center">
                              <CalendarDaysIcon className="h-3.5 w-3.5 mr-1 text-slate-400" />
                              {formatDate(booking.date)}
                            </p>
                            <p className="text-slate-500 font-medium flex items-center text-xs mt-0.5">
                              <ClockIcon className="h-3 w-3 mr-1" />
                              {formatTime(booking.startTime || booking.start_hour || booking.time)} - {calculateEndTime(booking.startTime || booking.start_hour || booking.time, booking.duration)}
                            </p>
                        </div>
                        {!isInstructor && (
                          <div className="text-right">
                            <p className="text-xl font-bold text-slate-900 mb-0.5">
                              {(() => {
                                const packageInfo = getPackageDisplayInfo();
                                const price = packageInfo && packageInfo.totalPrice != null
                                  ? packageInfo.totalPrice
                                  : getDisplayPrice();
                                return (
                                  <span className={packageInfo ? 'text-green-600' : ''}>
                                    {`${currencySymbol}${price.toFixed(2)}`}
                                  </span>
                                );
                              })()}
                            </p>
                            <p className="text-xs text-slate-500 font-medium">
                              {(() => {
                                const packageInfo = getPackageDisplayInfo();
                                if (packageInfo) {
                                  return packageInfo.subtitle;
                                }
                                return t('common:bookings.detail.total');
                              })()}
                            </p>
                            {(() => {
                              const packageInfo = getPackageDisplayInfo();
                              if (packageInfo && packageInfo.pricePerHour != null) {
                                return (
                                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                    {`${currencySymbol}${packageInfo.pricePerHour.toFixed(2)} / hour`}
                                  </p>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Status Badges */}
                      <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold shadow-sm ${
                            booking.status === 'confirmed' ? 'bg-green-100 text-green-800 border border-green-200' :
                            booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                            booking.status === 'checked-in' ? 'bg-blue-100 text-blue-800 border border-blue-200' :                            booking.status === 'completed' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            booking.status === 'cancelled' ? 'bg-red-100 text-red-800 border border-red-200' :
                            booking.status === 'no-show' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                            'bg-gray-100 text-gray-800 border border-gray-200'
                          }`}>
                            <div className={`w-2 h-2 rounded-full mr-1 ${
                              booking.status === 'confirmed' ? 'bg-green-500' :
                              booking.status === 'pending' ? 'bg-yellow-500' :
                              booking.status === 'checked-in' ? 'bg-blue-500' :                              booking.status === 'completed' ? 'bg-purple-500' :
                              booking.status === 'cancelled' ? 'bg-red-500' :
                              booking.status === 'no-show' ? 'bg-orange-500' :
                              'bg-gray-500'
                            }`} />
                            {booking.status ? booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('-', ' ') : 'Pending'}
                          </span>
                          {booking.instructor_commission && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                              <CurrencyDollarIcon className="h-3 w-3 mr-0.5" />
                              {formatCommissionDisplay(booking.instructor_commission)}
                            </span>
                          )}
                      </div>
                    </div>                    {/* Details Grid */}
                    <div className="grid grid-cols-1 gap-3">
                      {/* People Card */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700 flex items-center">
                            <UserCircleIcon className="h-4 w-4 text-slate-400 mr-2" />
                            {t('common:bookings.detail.people')}
                          </h4>
                        </div>
                        <div className="p-3 space-y-2">
                          {/* Show participants if it's a group booking */}
                          {booking.participants && booking.participants.length > 0 ? (
                            <div className="space-y-2">
                              <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                                {t('common:bookings.detail.participantsCount', { count: booking.participants.length })}
                              </div>
                              {booking.participants.map((participant, index) => (
                                <div key={participant.userId || index} className="flex items-center space-x-2">
                                  <div className="bg-gray-100 rounded-md p-1.5 shadow-sm">
                                    <svg className="h-3 w-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-xs font-bold text-gray-900">
                                      <button
                                        type="button"
                                        className="hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                                        onClick={() => setSelectedCustomer({ id: participant.userId, name: participant.userName, email: participant.userEmail })}
                                      >
                                        {participant.userName}
                                      </button>
                                      {participant.isPrimary && (
                                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                          {t('common:bookings.detail.primary')}
                                        </span>
                                      )}
                                    </p>
                                    {participant.userEmail && (
                                      <p className="text-xs text-gray-500">{participant.userEmail}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            /* Single participant fallback */
                            <div className="flex items-center space-x-2">
                              <div className="bg-gray-100 rounded-md p-1.5 shadow-sm">
                                <svg className="h-3 w-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{t('common:bookings.detail.student')}</p>
                                <p className="text-xs font-bold text-gray-900">
                                  <button
                                    type="button"
                                    className="hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                                    onClick={() => setSelectedCustomer({ id: booking.student_user_id || booking.studentId, name: booking.student_name })}
                                  >
                                    {booking.student_name || 'N/A'}
                                  </button>
                                </p>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center space-x-2">
                            <div className="bg-gray-100 rounded-md p-1.5 shadow-sm">
                              <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{t('common:bookings.columns.instructor')}</p>
                              <p className="text-xs font-bold text-gray-900">
                                <button
                                  type="button"
                                  className="hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                                  onClick={() => setSelectedInstructor({ id: booking.instructor_user_id || booking.instructorId, name: booking.instructor_name })}
                                >
                                  {booking.instructor_name || 'N/A'}
                                </button>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Details Card */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700 flex items-center">
                            <InformationCircleIcon className="h-4 w-4 text-slate-400 mr-2" />
                            {t('common:bookings.detail.details')}
                          </h4>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <div className="bg-gray-100 rounded-md p-1.5 shadow-sm">
                              <svg className="h-3 w-3 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{t('common:bookings.columns.service')}</p>
                              <p className="text-xs font-bold text-gray-900">{booking.service_name || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="bg-gray-100 rounded-md p-1.5 shadow-sm">
                              <ClockIcon className="h-3 w-3 text-orange-600" />
                            </div>                            <div>
                              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{t('common:bookings.detail.duration')}</p>
                              <p className="text-xs font-bold text-gray-900">
                                {Number(booking.actualDuration) || Number(booking.duration) || 1} hour{(Number(booking.actualDuration) || Number(booking.duration) || 1) !== 1 ? 's' : ''}
                                {booking.actualDuration && booking.actualDuration !== booking.duration && (
                                  <span className="text-xs text-gray-500 ml-1">(was {booking.duration}h)</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {booking.instructor_commission && (
                            <div className="flex items-center space-x-2">
                              <div className="bg-gray-100 rounded-md p-1.5 shadow-sm">
                                <CurrencyDollarIcon className="h-3 w-3 text-blue-600" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{t('common:bookings.detail.commission')}</p>
                                <p className="text-xs font-bold text-gray-900">
                                  {formatCommissionDisplay(booking.instructor_commission)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <CreatedBySection booking={booking} />

                    {/* Notes */}
                    {booking.notes && (
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700 flex items-center">
                            <svg className="h-4 w-4 text-slate-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            {t('common:bookings.detail.notes')}
                          </h4>
                        </div>
                        <div className="p-4">
                          <p className="text-slate-600 whitespace-pre-wrap text-sm">{booking.notes}</p>
                        </div>
                      </div>                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-2 pt-4 border-t border-slate-200">
                      {canModifyBooking && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="flex items-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:bg-gray-400 transition-colors"
                          onClick={() => setIsEditing(true)}
                          disabled={isProcessing}
                        >
                          <PencilSquareIcon className="h-3.5 w-3.5 mr-1" />
                          {t('common:bookings.detail.edit')}
                        </button>

                        {booking.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="flex items-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 transition-colors"
                            onClick={() => setIsCancelling(true)}
                            disabled={isProcessing}
                          >
                            <XMarkIcon className="h-3.5 w-3.5 mr-1" />
                            {t('common:bookings.detail.cancelAction')}
                          </button>
                        )}

                        <button
                          type="button"
                          className="flex items-center px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 transition-colors"
                          onClick={() => setIsDeleting(true)}
                          disabled={isProcessing}
                        >
                          <TrashIcon className="h-3.5 w-3.5 mr-1" />
                          {t('common:bookings.detail.deleteAction')}
                        </button>
                      </div>
                      )}

                      {/* Status Actions */}
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          // Check if this is a group booking (multiple participants)
                          const isGroupBooking = booking.participants && booking.participants.length > 1;
                          
                          if (isGroupBooking) {
                            // For group bookings: Always show all relevant buttons
                            return (
                              <>
                                {/* Confirm Button - always available for group bookings unless already confirmed */}
                                {checkInStatus !== 'confirmed' && checkInStatus !== 'checked-in' && checkInStatus !== 'completed' && (
                                  <button
                                    type="button"
                                    className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 transition-all duration-200"
                                    onClick={() => handleUpdateStatus('confirmed')}
                                    disabled={isProcessing}
                                  >
                                    {isProcessing ? (
                                      <>
                                        <svg className="animate-spin -ml-1 mr-0.5 h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        {t('common:bookings.detail.confirmingLabel')}
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircleIcon className="h-3 w-3 mr-0.5" />
                                        {t('common:bookings.detail.confirm')}
                                      </>
                                    )}
                                  </button>
                                )}

                                {/* Check-In Button - always available for group bookings unless checked-in or completed */}
                                {checkInStatus !== 'checked-in' && checkInStatus !== 'completed' && (
                                  <button
                                    type="button"
                                    className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-lg text-xs font-semibold text-white bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 transition-all duration-200"
                                    onClick={() => handleUpdateStatus('checked-in')}
                                    disabled={isProcessing}
                                  >
                                    {isProcessing ? t('common:bookings.detail.checkingInLabel') : (
                                      <>
                                        <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                        </svg>
                                        {t('common:bookings.detail.checkIn')}
                                      </>
                                    )}
                                  </button>
                                )}

                                {/* Check-Out Button - always available for group bookings unless already completed */}
                                {checkInStatus !== 'completed' && (
                                  <button
                                    type="button"
                                    className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 transition-all duration-200"
                                    onClick={() => setIsCheckingOut(true)}
                                    disabled={isProcessing}
                                  >
                                    {isProcessing ? t('common:bookings.detail.processingLabel') : (
                                      <>
                                        <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        {t('common:bookings.detail.checkOut')}
                                      </>
                                    )}
                                  </button>
                                )}
                              </>
                            );
                          } else {
                            // For private bookings: Use sequential logic (existing behavior)
                            return (
                              <>
                                {checkInStatus === 'pending' && (
                                  <button
                                    type="button"
                                    className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 transition-all duration-200"
                                    onClick={() => handleUpdateStatus('confirmed')}
                                    disabled={isProcessing}
                                  >
                                    {isProcessing ? (
                                      <>
                                        <svg className="animate-spin -ml-1 mr-0.5 h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 004 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('common:bookings.detail.confirmingLabel')}
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircleIcon className="h-3 w-3 mr-0.5" />
                                        {t('common:bookings.detail.confirm')}
                                      </>
                                    )}
                                  </button>
                                )}

                                {checkInStatus === 'confirmed' && (
                                  <>
                                    <button
                                      type="button"
                                      className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-lg text-xs font-semibold text-white bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 transition-all duration-200"
                                      onClick={() => handleUpdateStatus('checked-in')}
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? t('common:bookings.detail.checkingInLabel') : (
                                        <>
                                          <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                          </svg>
                                          {t('common:bookings.detail.checkIn')}
                                        </>
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 transition-all duration-200"
                                      onClick={() => setIsCheckingOut(true)}
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? t('common:bookings.detail.processingLabel') : (
                                        <>
                                          <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3v1" />
                                          </svg>
                                          {t('common:bookings.detail.checkOut')}
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}

                                {checkInStatus === 'checked-in' && (
                                  <button
                                    type="button"
                                    className="flex items-center justify-center px-3 py-1.5 border border-transparent rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 transition-all duration-200"
                                    onClick={() => setIsCheckingOut(true)}
                                    disabled={isProcessing}
                                  >
                                    {isProcessing ? t('common:bookings.detail.processingLabel') : (
                                      <>
                                        <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        {t('common:bookings.detail.checkOut')}
                                      </>
                                    )}
                                  </button>
                                )}
                              </>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                )}
      </div>
    </Drawer>

    {selectedCustomer && (
      <Suspense fallback={null}>
        <EnhancedCustomerDetailModal
          customer={selectedCustomer}
          isOpen={!!selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onUpdate={() => {}}
        />
      </Suspense>
    )}

    {selectedInstructor && (
      <Suspense fallback={null}>
        <EnhancedInstructorDetailModal
          instructor={selectedInstructor}
          isOpen={!!selectedInstructor}
          onClose={() => setSelectedInstructor(null)}
          onUpdate={() => {}}
        />
      </Suspense>
    )}
  </>
  );
};

export default BookingDetailModal;
