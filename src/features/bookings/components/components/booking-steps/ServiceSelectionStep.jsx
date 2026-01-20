import { useState } from 'react';
import { computeBookingPrice, getServicePriceInCurrency } from '@/shared/utils/pricing';
import eventBus from '@/shared/utils/eventBus';
import _CustomerPackageManager from '@/features/customers/components/CustomerPackageManager';
import _MultiCustomerPackageManager from '@/features/customers/components/MultiCustomerPackageManager';
import AssignPackageModal from './AssignPackageModal';
import { useCustomerPackages } from '@/shared/hooks/useCustomerPackages';
import { UsersIcon as _UsersIcon } from '@heroicons/react/24/outline';
import { filterServicesByCapacity } from '@/shared/utils/serviceCapacityFilter.js';

/**
 * Step 3: Service Selection
 * Allows selecting the type of kitesurfing service with enhanced package integration
 * Supports both single-user and multi-user bookings
 * 
 * @param {Object} props - Component props
 * @param {Object} props.formData - Current form data (includes participants array for multi-user)
 * @param {Function} props.updateFormData - Function to update form data
 * @param {Array} props.services - List of available services
 * @param {Function} props.onNext - Function to move to next step
 * @param {Function} props.onPrev - Function to move to previous step
 * @param {string} props.nextButtonText - Optional custom text for the next button
 * @param {boolean} props.hideNavigation - Whether to hide step navigation buttons
 * @param {string} props.customerId - Legacy customer ID for backward compatibility (single-user mode)
 * @param {Function} props.showSuccess - Function to show success messages
 * @param {Function} props.showError - Function to show error messages
 * @returns {JSX.Element} ServiceSelectionStep component
 */
// eslint-disable-next-line complexity
const ServiceSelectionStep = (props) => {
  const { 
    formData, 
    updateFormData, 
    services, 
    onNext,
    onPrev,
    nextButtonText = "Next",
    hideNavigation = false,
    customerId, // Legacy prop for backward compatibility
    showSuccess,
    showError 
  } = props;
  // Backward-compat fallbacks if parent still passes underscored props
  const _onNext = onNext || props._onNext;
  const _onPrev = onPrev || props._onPrev;
  const _nextButtonText = nextButtonText || props._nextButtonText || 'Next';
  const [_loadingPackages, _setLoadingPackages] = useState(false);
  
  // Get participants from formData (multi-user support)
  const participants = formData.participants || [];
  const isGroupBooking = participants.length > 1;
  const primaryCustomerId = participants.length > 0 ? participants[0].userId : customerId;
  
  // No local selectedPackage syncing needed with simplified UI
  
  // Calculate participant count - ensure at least 1 for single bookings
  const participantCount = Math.max(participants.length, 1);

  // Load customer's packages and helpers
  const { packages, loading, error: _packagesError, fetchCustomerPackages } = useCustomerPackages(primaryCustomerId);

  // Local state: open Assign Package modal inline instead of navigating away
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [simpleAssignModalOpen, setSimpleAssignModalOpen] = useState(false);
  const [assignTargetParticipant, setAssignTargetParticipant] = useState(null);
  // Removed manual participant picker; multi-assign opens directly with all participants
  const [assignQueue, setAssignQueue] = useState([]); // array of participant objects
  const [assignIndex, setAssignIndex] = useState(0);
  const [multiAssignOpen, setMultiAssignOpen] = useState(false);

  // Helper: only lesson services (exclude rentals/others)
  // Openers for assignment modals
  const openAssignForPrimary = () => {
    if (!primaryCustomerId) return;
    setAssignTargetParticipant(participants[0] || null);
    setSimpleAssignModalOpen(true);
  };
  const openAssignForAll = () => {
    if (!isGroupBooking || participants.length < 2) {
      openAssignForPrimary();
      return;
    }
    setAssignQueue(participants);
    setAssignIndex(0);
    setAssignTargetParticipant(null);
    setMultiAssignOpen(true);
  };
  const isLessonService = (service) => {
    const name = (service?.name || '').toLowerCase();
    const category = (service?.category || '').toLowerCase();
    const positive = ['lesson', 'private', 'supervision', 'group', 'kite', 'kitesurf'];
    const negative = ['rental', 'rent', 'shop', 'repair', 'storage'];
    const hasPositive = positive.some((k) => name.includes(k) || category.includes(k));
    const hasNegative = negative.some((k) => name.includes(k) || category.includes(k));
    return hasPositive && !hasNegative;
  };

  // Services available based on capacity, then restricted to lessons only
  const availableServices = filterServicesByCapacity(services || [], participantCount).filter(isLessonService);
  // Search query for services
  const [serviceSearch, setServiceSearch] = useState('');
  const filteredServices = (() => {
    const q = (serviceSearch || '').trim().toLowerCase();
    if (!q) return availableServices;
    return availableServices.filter((s) => {
      const name = (s?.name || '').toLowerCase();
      const category = (s?.category || '').toLowerCase();
      const discipline = (s?.disciplineTag || '').toLowerCase();
      const lessonCategory = (s?.lessonCategoryTag || '').toLowerCase();
      return (
        name.includes(q) ||
        category.includes(q) ||
        discipline.includes(q) ||
        lessonCategory.includes(q)
      );
    });
  })();

  // Load related packages for the currently selected service category
  // Package selection UI removed - users will select packages in the dedicated Packages step

  // Render a single service card block to keep map callback simple
  const renderServiceCard = (service) => {
    const isSelected = formData.serviceId === service.id;
    const serviceCategory = getServiceCategory(service);
  const bookingDuration = getBookingDuration();
  const packageHoursAvailable = (isSelected && formData.selectedPackage && formData.paymentMethod === 'package')
    ? (formData.selectedPackage.remainingHours || 0)
    : 0;
  const calculatedPrice = computeBookingPrice({
    plannedHours: bookingDuration,
    hourlyRate: service.price,
    packageHoursAvailable,
    step: 0.25,
    participants: isGroupBooking ? participants.length : 1
  });

    return (
      <div key={service.id} className="space-y-2">
        {/* Compact Service Card */}
        <div
          className={`p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:scale-[1.01] ${
            isSelected
              ? 'bg-blue-50 border-blue-500 shadow-md'
              : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm'
          }`}
          onClick={() => handleServiceSelect(service)}
        >
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <h5 className="text-base font-semibold text-gray-900 mb-2">{service.name}</h5>

              <div className="flex flex-wrap gap-2 mb-2">
                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                  {bookingDuration} hour{bookingDuration > 1 ? 's' : ''}
                </span>
                {serviceCategory !== 'lesson' && serviceCategory !== 'private' && (
                  <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium capitalize">
                    {serviceCategory} lesson
                  </span>
                )}
              </div>

              {isGroupBooking && (
                <div className="flex items-center text-blue-600 font-medium mb-2 text-sm">
                  <_UsersIcon className="w-4 h-4 mr-1" />
                  {participantCount} participant{participantCount > 1 ? 's' : ''}
                </div>
              )}

              <div className="text-lg font-bold text-gray-900">{formatPrice(calculatedPrice)}</div>

              {/* Package selection removed - users will select packages in the dedicated Packages step */}
            </div>

            <div
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {isSelected ? '✓ Selected' : 'Select'}
            </div>
          </div>
        </div>

  {/* Payment panel removed; toggles are inline on the service card */}
      </div>
    );
  };

  // Load related packages when packages or service selection changes
  // Removed related package loading effect

  // Handle payment method changes - ensure packages don't disappear
  // Removed manual payment method toggling: default is cash unless a package is explicitly selected

  // Check if service category matches package types
  const getServiceCategory = (service) => {
    const serviceName = service.name.toLowerCase();
    const serviceCategory = (service.category || '').toLowerCase();
    
    if (serviceName.includes('private') || serviceCategory.includes('private')) {
      return 'private';
    }
    if (serviceName.includes('supervision') || serviceCategory.includes('supervision')) {
      return 'supervision';
    }
    if (serviceName.includes('group') || serviceCategory.includes('group')) {
      return 'group';
    }
    return 'lesson'; // default
  };
  
  // Get actual booking duration from the time slot
  const getBookingDuration = () => {
    const startTime = formData.startTime || formData.time;
    const endTime = formData.endTime;
    
    if (startTime && endTime && typeof startTime === 'string' && typeof endTime === 'string') {
      try {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        
        if (!isNaN(startHour) && !isNaN(startMinute) && !isNaN(endHour) && !isNaN(endMinute)) {
          const startTotalMinutes = (startHour * 60) + startMinute;
          const endTotalMinutes = (endHour * 60) + endMinute;
          return Math.max(0.5, (endTotalMinutes - startTotalMinutes) / 60); // Minimum 30 minutes
        }
      } catch {
        // Fallback to default duration when calculation fails
      }
    }
    
    return 1; // Default to 1 hour if calculation fails
  };
  
  // Handle service selection with enhanced package matching
  const handleServiceSelect = (service) => {
    // If the same service is selected, deselect it
    if (formData.serviceId === service.id) {
      updateFormData({
        serviceId: null,
        serviceName: '',
        servicePrice: 0,
        serviceDuration: 0,
        serviceCategory: '',
        durationMismatchWarning: false,
        paymentOptions: null,
        usePackageHours: false,
        paymentMethod: null,
        selectedPackage: null,
        customerPackageId: null,
        manualCashPreference: formData.manualCashPreference,
      });
      return;
    }

    const serviceCategory = getServiceCategory(service);
    
    // Calculate actual booking duration from time slot
    const bookingDuration = getBookingDuration();
    
    // Check if selected service duration matches the time slot duration
    const durationMismatch = Math.abs(service.duration - bookingDuration) > 0.25;
    
    // Calculate price based on actual booking duration and group size
    const actualPrice = service.price * bookingDuration * (isGroupBooking ? participants.length : 1);
    
    // Get payment options for this service using actual booking duration (strict matching)
    const paymentOptions = getPaymentOptionsForService(service, bookingDuration, actualPrice);
    const manualCashPreference = formData.manualCashPreference === true;
    const { nextPackage: selectedPackage, autoApplied: autoAppliedPackage } = resolvePackageForService({
      service,
      bookingDuration,
      currentPackage: formData.selectedPackage,
      manualCashPreference,
      paymentOptions
    });

    // Default to direct payment unless a package is explicitly selected
    const desiredMethod = selectedPackage ? 'package' : 'cash';
    const participantUpdates = syncPrimaryParticipantWithPackage(desiredMethod === 'package', selectedPackage);

    updateFormData({
      serviceId: service.id,
      serviceName: service.name,
      serviceType: service.service_type || service.serviceType, // For package filtering (private/group/semi-private)
      servicePrice: actualPrice, // Use calculated price based on duration
      serviceDuration: bookingDuration, // Use actual booking duration
      serviceCategory: serviceCategory,
      durationMismatchWarning: durationMismatch,
      paymentOptions: paymentOptions,
      usePackageHours: desiredMethod === 'package',
      paymentMethod: desiredMethod,
      customerPackageId: selectedPackage ? (selectedPackage.customerPackageId || selectedPackage.id || null) : null,
  manualCashPreference: desiredMethod === 'cash' ? manualCashPreference : false,
      selectedPackage,
      // Don't reset package selection when service changes - let auto-selection handle it
      ...(participantUpdates ? { participants: participantUpdates } : {})
    });

    // No automatic package application - user must pick a package explicitly.
  };

  const syncPrimaryParticipantWithPackage = (shouldUsePackage, pkg) => {
    if (!Array.isArray(formData.participants) || formData.participants.length === 0) {
      return null;
    }
    // For group bookings, package usage is managed per participant in MultiUserSelectionStep
    if (formData.participants.length > 1) {
      return null;
    }

    const packageId = pkg?.customerPackageId || pkg?.id || pkg?.packageId || null;

    return formData.participants.map((participant, index) => {
      const isPrimary = index === 0 || participant.isPrimary;

      if (!isPrimary) {
        return shouldUsePackage
          ? participant
          : { ...participant, customerPackageId: null };
      }

      if (!shouldUsePackage) {
        const isPackageStatus = participant.paymentStatus === 'package';
        return {
          ...participant,
          usePackage: false,
          selectedPackageId: null,
          customerPackageId: null,
          paymentStatus: isPackageStatus ? 'paid' : (participant.paymentStatus || 'paid') // Pay-and-go: default to paid
        };
      }

      if (!packageId) {
        return participant;
      }

      return {
        ...participant,
        usePackage: true,
        selectedPackageId: packageId,
        customerPackageId: packageId,
        paymentStatus: 'package'
      };
    });
  };

  // Package selection handlers removed - users select packages in the dedicated Packages step

  // Removed duplicate package helpers per simplified UI

  // Strict package-to-service matcher
  const normalize = (s = '') => (s || '').toString().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const hasAny = (str, keywords) => {
    const n = normalize(str);
    return keywords.some(k => n.includes(k));
  };
  const LEVEL_TAGS = ['premium','advanced','intermediate','beginner'];
  const addLevelFromSrc = (tags, src) => {
    if (hasAny(src, ['premium'])) tags.add('premium');
    if (hasAny(src, ['advanced','advance'])) tags.add('advanced');
    if (hasAny(src, ['intermediate'])) tags.add('intermediate');
    if (hasAny(src, ['beginner'])) tags.add('beginner');
  };
  // const CATEGORY_TAGS removed (unused)

  // eslint-disable-next-line complexity
  const inferServiceTags = (service) => {
    const tags = new Set();
    // Prefer structured fields if available
    const dTag = (service?.disciplineTag || '').toLowerCase();
    const cTag = (service?.lessonCategoryTag || '').toLowerCase();
    const lTag = (service?.levelTag || '').toLowerCase();
    if (['foil','wing','kite'].includes(dTag)) tags.add(dTag);
    if (['group','semi-private','private','supervision'].includes(cTag)) tags.add(cTag);
    if (LEVEL_TAGS.includes(lTag)) tags.add(lTag);
    // Fallback to parsing if missing
    if (tags.size === 0) {
      const name = normalize(service?.name);
      const category = normalize(service?.category);
      const src = `${name} ${category}`;
      if (hasAny(src, ['foil'])) tags.add('foil');
      if (hasAny(src, ['wing'])) tags.add('wing');
      if (hasAny(src, ['kite','kitesurf','kitesurfing'])) tags.add('kite');
      if (hasAny(src, ['group'])) tags.add('group');
      if (hasAny(src, ['semi private','semi-private'])) tags.add('semi-private');
      if (hasAny(src, ['private']) && !tags.has('semi-private')) tags.add('private');
      if (hasAny(src, ['supervision'])) tags.add('supervision');
      addLevelFromSrc(tags, src);
    }
    return tags;
  };

  // eslint-disable-next-line complexity
  const inferPackageTags = (pkg) => {
    const tags = new Set();
    const dTag = (pkg?.disciplineTag || '').toLowerCase();
    const cTag = (pkg?.lessonCategoryTag || '').toLowerCase();
    const lTag = (pkg?.levelTag || '').toLowerCase();
    if (['foil','wing','kite'].includes(dTag)) tags.add(dTag);
    if (['group','semi-private','private','supervision'].includes(cTag)) tags.add(cTag);
    if (LEVEL_TAGS.includes(lTag)) tags.add(lTag);
    if (tags.size === 0) {
      const type = normalize(pkg?.lessonType);
      const name = normalize(pkg?.packageName);
      const src = `${name} ${type}`;
      if (hasAny(src, ['foil'])) tags.add('foil');
      if (hasAny(src, ['wing'])) tags.add('wing');
      if (hasAny(src, ['kite','kitesurf','kitesurfing'])) tags.add('kite');
      if (hasAny(src, ['group'])) tags.add('group');
      if (hasAny(src, ['semi private','semi-private'])) tags.add('semi-private');
      if (hasAny(src, ['private']) && !tags.has('semi-private')) tags.add('private');
      if (hasAny(src, ['supervision'])) tags.add('supervision');
      addLevelFromSrc(tags, src);
    }
    return tags;
  };

  const disciplineOk = (sTags, pTags) => {
    const d = ['foil','wing','kite'].find(t => sTags.has(t)) || null;
  if (d) return pTags.has(d);
  // If service doesn't specify a discipline, accept any package
  return true;
  };

  const categoryOk = (sTags, pTags) => {
  const c = ['group','semi-private','private','supervision'].find(t => sTags.has(t)) || null;
  if (c) return pTags.has(c);
  // If service doesn't specify a category, accept any package category
  return true;
  };

  const levelOk = (sTags, pTags) => {
  const l = LEVEL_TAGS.find(t => sTags.has(t)) || null;
  if (l) return pTags.has(l);
  // If service doesn't specify a level, accept any package level
  return true;
  };

  const matchesServicePackage = (service, pkg) => {
    if (!pkg || pkg.status !== 'active' || (pkg.remainingHours || 0) <= 0) return false;
    const sTags = inferServiceTags(service);
    const pTags = inferPackageTags(pkg);
    return disciplineOk(sTags, pTags) && categoryOk(sTags, pTags) && levelOk(sTags, pTags);
  };

  const isActivePkg = (pkg) => String(pkg?.status || '').toLowerCase() === 'active' && (pkg?.remainingHours ?? pkg?.remaining_hours ?? 0) > 0;
  const getActivePackagesForService = (service) => (packages || []).filter(pkg => isActivePkg(pkg) && matchesServicePackage(service, pkg));

  const getEligiblePackagesForDuration = (service, requiredHours) => {
    if (!service || !requiredHours) return [];
    return getActivePackagesForService(service).filter((pkg) => {
      const remaining = Number(pkg.remainingHours ?? pkg.remaining_hours ?? 0);
      return remaining >= requiredHours;
    });
  };

  // Do NOT auto-apply packages. Selection must always be explicit by the user.
  const resolvePackageForService = ({ service, bookingDuration, currentPackage, manualCashPreference, paymentOptions }) => {
    // IMPORTANT: Always return null for package unless user explicitly clicks a package button.
    // We do NOT preserve currentPackage even if it matches, because package selection must be
    // an explicit action on each new booking to avoid confusion.
    const nextPackage = null;
    const autoApplied = false;

    return { nextPackage, autoApplied };
  };

  const getPaymentOptionsForService = (service, serviceDuration, servicePrice) => {
    const matchingHours = getActivePackagesForService(service).reduce((sum, p) => sum + (p.remainingHours || 0), 0);
    const canUsePackage = matchingHours >= serviceDuration;
    return {
      canUsePackage,
      availableHours: matchingHours,
      requiredHours: serviceDuration,
      cashPrice: servicePrice,
      packagePayment: canUsePackage ? `${serviceDuration} hours from package` : null
    };
  };

  // Helper functions for package assignment modal
  // Removed package assignment modal and actions per simplified UI

  // Helper function for formatting currency
  const formatPrice = (price) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
  currency: (window.__APP_CURRENCY__ && window.__APP_CURRENCY__.business) || 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(price || 0);
  };

  return (
    <div className="relative max-w-full">
      <div className="space-y-4">
        {/* Service Selection Header */}
        <div className="text-center">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            Choose Your Service
          </h3>
          {isGroupBooking && (
            <p className="text-sm text-blue-600 font-medium">
              Group Booking for {participants.length} participants
            </p>
          )}
        </div>
        {/* Header bar: search only (package assignment moved to dedicated step) */}
        <div className="flex items-center justify-between gap-3 mb-2">
          {/* Search input */}
          <div className="flex-1">
            <label htmlFor="service-search" className="sr-only">Search services</label>
            <input
              id="service-search"
              type="text"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              placeholder="Search services (e.g., private, group, supervision)"
              className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Debug Panel - Development Only */}
        {process.env.NODE_ENV === 'development' && (
          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-1 text-sm">🔧 Debug Info</h4>
            <div className="space-y-1 text-xs text-yellow-700">
              <div>Services: {services.length} → Filtered: {filteredServices.length} → Available: {availableServices.length}</div>
              <div>Participants: {participantCount} | Group: {isGroupBooking ? 'Yes' : 'No'}</div>
              <div>Primary Customer ID: {primaryCustomerId || 'MISSING!'}</div>
              <div>Packages loaded: {packages.length} | Loading: {loading ? 'Yes' : 'No'}</div>
            </div>
          </div>
        )}

        {/* Group Participants */}
        {isGroupBooking && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center mb-2">
              <_UsersIcon className="h-4 w-4 text-blue-600 mr-2" />
              <span className="font-medium text-blue-800 text-sm">Selected Participants</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {participants.map((participant) => (
                <div key={participant.userId} className="inline-flex items-center px-2 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                  {participant.userName}
                  {participant.isPrimary && (
                    <span className="ml-1 text-xs text-blue-600">(Primary)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Service List */}
        <div className="space-y-3">
          {availableServices.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🏄‍♂️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Services Available
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {isGroupBooking 
                  ? `No group services available for ${participantCount} participants.`
                  : 'No individual services available.'
                }
              </p>
              <p className="text-xs text-gray-500">
                Please contact an administrator to add {isGroupBooking ? 'group' : 'individual'} services.
              </p>
            </div>
          ) : (
            filteredServices.length > 0 ? (
              filteredServices.map(renderServiceCard)
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">🔎</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No matches for "{serviceSearch}"
                </h3>
                <p className="text-sm text-gray-600">
                  Try a different search term or clear the search box.
                </p>
              </div>
            )
          )}
        </div>

        {/* Status message when no service is selected */}
        {!formData.serviceId && (
          <div className="mt-4 p-3 text-center bg-amber-50 border border-amber-200 rounded-lg">
            <div className="text-lg mb-1">⚠️</div>
            <p className="text-sm font-medium text-amber-800">
              Please select a lesson service to continue
            </p>
          </div>
        )}

        {/* Navigation */}
        {!hideNavigation && (
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => _onPrev && _onPrev()}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!formData.serviceId}
              onClick={() => _onNext && _onNext()}
              className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                formData.serviceId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {_nextButtonText || 'Next'}
            </button>
          </div>
        )}

  {/* Package Assignment Modal removed */}
      {/* Inline Package Manager Modal */}
  {/* Participant picker removed: multi-manager opens directly for group bookings */}

      {/* Simple Assign Package Modal - Direct package assignment */}
      {simpleAssignModalOpen && (
        (() => {
          const selectedService = (services || []).find(s => s.id === formData.serviceId) || null;
          return (
        <AssignPackageModal
          visible={simpleAssignModalOpen}
          onClose={() => {
            setSimpleAssignModalOpen(false);
            setAssignTargetParticipant(null);
          }}
          customer={{
            id: (assignTargetParticipant?.userId) || primaryCustomerId,
            name: (assignTargetParticipant?.userName) || (participants[0]?.userName) || 'Customer',
            email: (assignTargetParticipant?.userEmail) || participants[0]?.userEmail || ''
          }}
          service={selectedService}
          restrictParticipants={isGroupBooking ? participants : null}
          onPackageAssigned={() => {
            fetchCustomerPackages(true);
            setSimpleAssignModalOpen(false);
            setAssignTargetParticipant(null);
          }}
        />
          );
        })()
      )}

      {/* Original Package Manager Modal - kept for compatibility */}
      {assignModalOpen && (
        <_CustomerPackageManager
          key={(assignTargetParticipant?.userId) || 'primary'}
          visible={assignModalOpen}
          onClose={() => {
            // Cancel the queue and close
            setAssignModalOpen(false);
            setAssignTargetParticipant(null);
            setAssignQueue([]);
            setAssignIndex(0);
          }}
          customer={{
            id: (assignTargetParticipant?.userId) || primaryCustomerId,
            name: (assignTargetParticipant?.userName) || (participants[0]?.userName) || 'Customer',
            email: (assignTargetParticipant?.userEmail) || participants[0]?.userEmail || ''
          }}
          onPackageAssigned={() => {
            // If multiple participants were selected, move to the next one; otherwise close
            if (assignQueue.length > 0 && assignIndex < assignQueue.length - 1) {
              const nextIndex = assignIndex + 1;
              setAssignIndex(nextIndex);
              setAssignTargetParticipant(assignQueue[nextIndex]);
              // keep modal open and remount via key
            } else {
              fetchCustomerPackages(true);
              setAssignModalOpen(false);
              setAssignTargetParticipant(null);
              setAssignQueue([]);
              setAssignIndex(0);
            }
          }}
        />
      )}

      {multiAssignOpen && assignQueue.length > 1 && (
        <_MultiCustomerPackageManager
          visible={multiAssignOpen}
          onClose={() => { 
            setMultiAssignOpen(false); 
            setAssignQueue([]); 
            // force refresh in case internal events were missed
            eventBus.emit('packages:changed', { reason: 'close-multi', customers: participants.map(p=>p.userId) });
          }}
          customers={assignQueue.map(p => ({ id: p.userId, name: p.userName, email: p.userEmail }))}
          title={`Assign Packages (${assignQueue.length})`}
        />
      )}
      </div>
    </div>
  );
};

export default ServiceSelectionStep;

