import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Divider,
  Empty,
  Form,
  Input,
  List,
  Modal,
  notification,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { SearchOutlined, UserOutlined, PlusOutlined, CalendarOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { serviceApi } from '@/shared/services/serviceApi';
import accommodationApi from '@/shared/services/accommodationApi';
import familyApi from '../services/familyApi';
import FamilyMemberModal from './FamilyMemberModal';
import apiClient from '@/shared/services/apiClient';
import { getAvailableSlots } from '@/features/bookings/components/api/calendarApi';
import { studentPortalQueryKeys } from '../hooks/useStudentDashboard';
import { computeBookingPrice, getPricingBreakdown, getPackagePriceInCurrency } from '@/shared/utils/pricing';
import { createGroupBooking } from '@/features/bookings/services/groupBookingService';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

const { Text, Title } = Typography;

const STEP_CONFIG = [
  { key: 'service', title: 'Service' },
  { key: 'participant', title: 'Participant' },
  { key: 'package', title: 'Package' },
  { key: 'instructor', title: 'Instructor' },
  { key: 'schedule', title: 'Schedule' },
  { key: 'confirm', title: 'Confirm' }
];

const GROUP_STEP_CONFIG = [
  { key: 'service', title: 'Service' },
  { key: 'participant', title: 'Type' },
  { key: 'group_participants', title: 'Participants' },
  { key: 'package', title: 'Package' },
  { key: 'instructor', title: 'Instructor' },
  { key: 'schedule', title: 'Schedule' },
  { key: 'confirm', title: 'Confirm' }
];

const HALF_HOUR_MINUTES = 30;
const PROCESSOR_OPTIONS = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'paytr', label: 'PayTR' },
  { value: 'binance_pay', label: 'Binance Pay' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'paypal', label: 'PayPal' }
];

const normalizeText = (value) => (value ?? '').toString().trim().toLowerCase();

const getPackageRemainingHours = (pkg) => normalizeNumeric(pkg?.remaining_hours ?? pkg?.remainingHours, 0);

const getPackageDisplayName = (pkg) => (
  pkg?.package_name
  || pkg?.packageName
  || pkg?.lesson_service_name
  || pkg?.lessonServiceName
  || pkg?.name
  || 'Package'
);

const getPackageId = (pkg) => (
  pkg?.id
  ?? pkg?.customer_package_id
  ?? pkg?.package_id
  ?? pkg?.servicePackageId
  ?? null
);

const isActivePackage = (pkg) => normalizeText(pkg?.status || 'active') === 'active' && getPackageRemainingHours(pkg) > 0;

const toNormalizedList = (...values) => values.map(normalizeText).filter((value) => value.length > 0);

const hasFuzzyOverlap = (leftValues, rightValues) => (
  leftValues.some((left) => rightValues.some((right) => left.includes(right) || right.includes(left)))
);

const serviceMatchesCategory = (service, category) => {
  if (!service) {
    return false;
  }
  const normalizedCategory = normalizeText(category);
  if (!normalizedCategory) {
    return false;
  }
  const candidates = toNormalizedList(
    service.category,
    service.discipline,
    service.lessonCategory,
    service.lessonCategoryTag,
    service.disciplineTag,
    service.type,
    service.serviceType
  );
  return candidates.some((value) => value.includes(normalizedCategory));
};

// Extract lesson type from name (private, group, semi-private, etc.)
// Premium/Standard are quality modifiers, not lesson types
const extractLessonType = (text) => {
  const normalized = normalizeText(text);
  if (normalized.includes('semiprivate') || normalized.includes('semi-private') || normalized.includes('semi private')) {
    return 'semiprivate';
  }
  if (normalized.includes('private')) {
    return 'private';
  }
  if (normalized.includes('group')) {
    return 'group';
  }
  return null;
};

const matchesServicePackage = (service, pkg, forPurchase = false) => {
  if (!service || !pkg) {
    return false;
  }

  // For owned packages, check if active and has remaining hours
  // For purchase packages, skip the remaining hours check
  if (!forPurchase && !isActivePackage(pkg)) {
    return false;
  }

  // Don't match rental services with lesson packages
  const serviceCategory = normalizeText(service.category || '');
  const isRentalService = serviceCategory.includes('rental');
  
  // If this is a rental service, skip matching with lesson packages
  if (isRentalService) {
    return false;
  }

  const serviceName = normalizeText(service.name);
  const packageServiceName = normalizeText(
    pkg.lesson_service_name || pkg.lessonServiceName || ''
  );
  // Separate display name used for generic packages
  const packageDisplayName = normalizeText(
    pkg.package_name || pkg.packageName || pkg.name || ''
  );

  // ── 1. Best match: exact service name vs package's lesson_service_name ──
  if (serviceName && packageServiceName && serviceName === packageServiceName) {
    return true;
  }

  // ── 2. Discipline gate: if BOTH have a discipline tag, they MUST match ──
  //    This prevents "Wing Private" from matching a "Kite Private" package.
  const serviceDiscipline = normalizeText(service.disciplineTag || service.discipline || '');
  const packageDiscipline = normalizeText(pkg.disciplineTag || pkg.discipline || '');
  
  if (serviceDiscipline && packageDiscipline && serviceDiscipline !== packageDiscipline) {
    return false;   // hard reject — disciplines differ
  }

  // ── 3. Lesson category / type gate ──
  //    e.g. "private" vs "group" — must match if both present
  const serviceLessonCat = normalizeText(service.lessonCategoryTag || '');
  const packageLessonCat = normalizeText(pkg.lessonCategoryTag || '');

  let serviceLessonType = extractLessonType(service.name);
  if (!serviceLessonType) {
    const serviceType = normalizeText(service.service_type || service.serviceType || '');
    if (serviceType === 'private' || serviceType === 'group' || serviceType === 'semiprivate') {
      serviceLessonType = serviceType;
    }
  }
  if (!serviceLessonType && serviceLessonCat) {
    serviceLessonType = serviceLessonCat;
  }

  const packageLessonType = extractLessonType(packageServiceName || packageDisplayName);
  const effectivePackageLessonType = packageLessonType || packageLessonCat || null;

  if (serviceLessonType && effectivePackageLessonType) {
    if (serviceLessonType !== effectivePackageLessonType) {
      return false;   // hard reject — lesson types differ
    }
  }

  // ── 4. Positive match: discipline matched (or one is absent) + lesson type matched ──
  //    We need at least one positive signal to confirm the match.
  const disciplineOk = !serviceDiscipline || !packageDiscipline || serviceDiscipline === packageDiscipline;
  const lessonTypeOk = serviceLessonType && effectivePackageLessonType && serviceLessonType === effectivePackageLessonType;
  const disciplineMatch = serviceDiscipline && packageDiscipline && serviceDiscipline === packageDiscipline;

  // If both discipline and lessonType match → strong match
  if (disciplineMatch && lessonTypeOk) {
    return true;
  }

  // If discipline matches and no lesson type info → match
  if (disciplineMatch && (!serviceLessonType || !effectivePackageLessonType)) {
    return true;
  }

  // If lesson type matches and no discipline info on package → match (generic package)
  if (lessonTypeOk && !packageDiscipline) {
    return true;
  }

  // ── 5. Generic package fallback ──
  // If the package has NO specific lesson_service_name AND no discipline tag,
  // it might be a generic "lesson" package that can cover any lesson service.
  const hasSpecificName = packageServiceName && packageServiceName !== packageDisplayName;
  if (!hasSpecificName && !packageDiscipline && !packageLessonCat) {
    const pkgCategories = toNormalizedList(pkg.category, pkg.lesson_type, pkg.lessonType);
    const svcCategories = toNormalizedList(service.category, service.lessonCategory);
    if (pkgCategories.length > 0 && svcCategories.length > 0) {
      return pkgCategories.some((pc) => svcCategories.some((sc) => pc === sc));
    }
  }

  return false;
};

const getProcessorLabel = (method) => PROCESSOR_OPTIONS.find((option) => option.value === method)?.label || method;

const roundCurrency = (value) => Number.parseFloat((Number(value) || 0).toFixed(2));

const timeStringToMinutes = (time) => {
  if (!time || typeof time !== 'string') return null;
  const [hours, minutes] = time.split(':').map((value) => Number(value));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const minutesToTimeString = (totalMinutes) => {
  const normalized = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const computeAvailableStarts = (slots, durationMinutes, isToday) => {
  if (!Array.isArray(slots) || slots.length === 0) {
    return [];
  }
  const stepsRequired = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  const sortedSlots = [...slots].sort((a, b) => {
    const aMinutes = timeStringToMinutes(a.time) ?? 0;
    const bMinutes = timeStringToMinutes(b.time) ?? 0;
    return aMinutes - bMinutes;
  });

  const nowMinutes = isToday ? (dayjs().hour() * 60 + dayjs().minute()) : null;
  const results = [];

  for (let index = 0; index <= sortedSlots.length - stepsRequired; index += 1) {
    const window = sortedSlots.slice(index, index + stepsRequired);
    if (!window.every((slot) => slot.status === 'available')) {
      continue;
    }
    const startMinutes = timeStringToMinutes(window[0].time);
    if (startMinutes === null) {
      continue;
    }
    if (nowMinutes !== null && startMinutes < nowMinutes + 30) {
      continue;
    }
    const endMinutes = startMinutes + durationMinutes;
    const label = `${window[0].time} – ${minutesToTimeString(endMinutes)}`;
    if (!results.some((entry) => entry.value === window[0].time)) {
      results.push({ value: window[0].time, label });
    }
  }

  return results;
};

const normalizeNumeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const computeAge = (dateOfBirth) => {
  if (!dateOfBirth) {
    return null;
  }
  const birth = dayjs(dateOfBirth);
  if (!birth.isValid()) {
    return null;
  }
  return Math.max(0, dayjs().diff(birth, 'year'));
};

const formatDurationLabel = (minutes) => {
  if (!Number.isFinite(minutes)) {
    return '';
  }
  const totalHours = minutes / 60;
  if (totalHours >= 1) {
    return `${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h`;
  }
  return `${minutes}m`;
};

const buildWalletPaymentSummary = ({ formattedFinalAmount, walletInsufficient, formattedWallet, formattedWalletAfterCharge }) => ({
  title: 'Wallet payment',
  tag: walletInsufficient ? { color: 'red', text: 'Add funds' } : { color: 'green', text: 'Instant charge' },
  lines: [
    { text: `We will charge ${formattedFinalAmount} from your wallet now.` },
    {
      text: walletInsufficient
        ? `Balance available: ${formattedWallet}`
        : `Balance after charge: ${formattedWalletAfterCharge}`,
      type: walletInsufficient ? 'danger' : 'secondary'
    }
  ]
});

const buildPackagePaymentSummary = ({
  selectedPackage,
  packageHoursUsed,
  packageRemainingAfterBooking,
  roundedFinalAmount,
  formattedFinalAmount
}) => {
  const packageName = selectedPackage ? getPackageDisplayName(selectedPackage) : 'your package';
  const lines = [];

  if (packageHoursUsed > 0) {
    lines.push({ text: `${packageHoursUsed.toFixed(2)}h will be used from ${packageName}.` });
    if (Number.isFinite(packageRemainingAfterBooking)) {
      lines.push({
        text: `Hours remaining afterwards: ${packageRemainingAfterBooking.toFixed(2)}h`,
        type: 'secondary'
      });
    }
    lines.push({
      text: roundedFinalAmount > 0
        ? `You will also pay ${formattedFinalAmount} today.`
        : 'No additional payment required.',
      type: roundedFinalAmount > 0 ? 'warning' : 'secondary'
    });
  } else {
    lines.push({
      text: `This package does not cover the session. You will pay ${formattedFinalAmount}.`,
      type: 'warning'
    });
  }

  const tag = packageHoursUsed > 0
    ? (roundedFinalAmount > 0 ? { color: 'gold', text: 'Partial coverage' } : { color: 'green', text: 'Fully covered' })
    : { color: 'orange', text: 'Check package' };

  return { title: 'Package hours', tag, lines };
};

const buildProcessorPaymentSummary = ({ processorLabel, selectedProcessor, processorInfo, formattedFinalAmount }) => {
  const descriptor = processorLabel || selectedProcessor || 'external';
  const hasReference = processorInfo?.method === selectedProcessor && Boolean(processorInfo?.reference);
  return {
    title: `${descriptor} payment`,
    tag: hasReference ? { color: 'blue', text: 'Awaiting review' } : { color: 'red', text: 'Reference required' },
    lines: [
      {
        text: `Complete payment via ${descriptor} and share the transaction reference with our team.`,
        type: 'secondary'
      },
      hasReference
        ? { text: `Reference: ${processorInfo.reference}`, type: 'secondary' }
        : { text: 'Enter the payment reference so we can reconcile it.', type: 'danger' },
      { text: `Amount recorded for this booking: ${formattedFinalAmount}.`, type: 'secondary' }
    ]
  };
};

const buildPayLaterSummary = ({ formattedFinalAmount }) => ({
  title: 'Pay at the center',
  tag: { color: 'blue', text: 'Due on arrival' },
  lines: [
    { text: 'We will reserve your slot now and collect payment when you arrive.', type: 'secondary' },
    { text: `Amount to settle in-person: ${formattedFinalAmount}.`, type: 'secondary' }
  ]
});

const getServerMessage = (error) => {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  if (error?.message) {
    return error.message;
  }
  return 'Failed to create booking';
};

const parseBookingError = (error) => {
  return getServerMessage(error);
};

const submitBooking = async ({ payload, mutation, messageApi }) => {
  try {
    await mutation.mutateAsync(payload);
  } catch (error) {
    const serverMessage = parseBookingError(error);
    messageApi.error(serverMessage || 'Failed to create booking');
  }
};

const createBookingPayload = ({
  studentId,
  instructorId,
  serviceId,
  date,
  startHour,
  durationHours,
  notes,
  usePackage,
  dueAmount,
  participantType,
  familyMemberId,
  packageId,
  baseAmount,
  packageHoursUsed,
  packageChargeableHours,
  isProcessorPayment,
  paymentMethod,
  selectedProcessor,
  processorInfo,
  currency,
}) => {
  const payload = {
    student_user_id: studentId,
    instructor_user_id: instructorId || null, // Allow null for rentals/accommodations
    service_id: serviceId,
    date,
    start_hour: startHour,
    duration: durationHours,
    status: 'pending',
    notes,
    use_package: usePackage,
    amount: dueAmount,
    final_amount: dueAmount,
    discount_percent: 0,
    discount_amount: 0,
    family_member_id: null,
    customer_package_id: packageId,
    selected_package_id: packageId,
    base_amount: baseAmount,
    package_hours_applied: 0,
    package_chargeable_hours: packageChargeableHours,
    payment_method: isProcessorPayment ? 'external' : paymentMethod,
    external_payment_processor: selectedProcessor,
    external_payment_reference: processorInfo?.reference ?? null,
    external_payment_note: processorInfo?.note ?? null,
    wallet_currency: currency,
    currency: currency,
  };

  if (participantType === 'family') {
    payload.family_member_id = familyMemberId ?? null;
  }

  if (usePackage) {
    payload.package_hours_applied = packageHoursUsed;
  }

  return payload;
};

// Stable empty object for default initialData to prevent re-renders
const EMPTY_INITIAL_DATA = {};

// eslint-disable-next-line complexity
const StudentBookingWizard = ({ open, onClose, initialData = EMPTY_INITIAL_DATA }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshToken } = useAuth();
  const { formatCurrency, userCurrency, convertCurrency, businessCurrency } = useCurrency();

  const [currentStep, setCurrentStep] = useState(0);
  const [participantType, setParticipantType] = useState('self');
  const [selectedFamilyId, setSelectedFamilyId] = useState(null);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [selectedInstructorId, setSelectedInstructorId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(60);
  const [scheduleStep, setScheduleStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [notes, setNotes] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [instructorSearch, setInstructorSearch] = useState('');
  const lastServiceIdRef = useRef(null);
  const [processorModal, setProcessorModal] = useState(null);
  const [processorInfo, setProcessorInfo] = useState({});
  const [processorForm] = Form.useForm();
  const previousPaymentMethodRef = useRef('wallet');
  const [preferredCategory, setPreferredCategory] = useState(null);
  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [familyModalSubmitting, setFamilyModalSubmitting] = useState(false);
  const [selectedServiceCategory, setSelectedServiceCategory] = useState(null);
  // Buy package feature states
  const [showBuyPackages, setShowBuyPackages] = useState(false);
  const [selectedBuyCategory, setSelectedBuyCategory] = useState(null);
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState('wallet');
  const [purchaseProcessor, setPurchaseProcessor] = useState(null);
  const [purchaseProcessorForm] = Form.useForm();
  
  // Track mounted state for cleanup operations
  const isComponentMounted = useRef(false);
  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
    };
  }, []);

  // Reset purchase form when buy packages mode is opened
  useEffect(() => {
    if (showBuyPackages && purchaseProcessorForm) {
      // Delay slightly to ensure form is connected to DOM
      const t = setTimeout(() => {
        if (isComponentMounted.current) {
          try {
            purchaseProcessorForm.resetFields();
          } catch (e) {
            // Ignore if still not mounted
          }
        }
      }, 50);
      return () => clearTimeout(t);
    }
  }, [showBuyPackages, purchaseProcessorForm]);
  
  // Accommodation date selection for package purchase
  const [accommodationDateModal, setAccommodationDateModal] = useState(null); // null or package object
  const [accommodationDates, setAccommodationDates] = useState({ checkIn: null, checkOut: null });
  
  // Promo code / voucher state
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  
  // Group booking states
  const [creatingGroupBooking, setCreatingGroupBooking] = useState(false);
  
  // Group participants - selected registered users
  const [selectedGroupParticipants, setSelectedGroupParticipants] = useState([]); // Array of user IDs
  const [participantSearchQuery, setParticipantSearchQuery] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customersData, setCustomersData] = useState([]);

  const studentId = user?.id ?? null;
  const studentName = user?.first_name
    ? `${user.first_name} ${user?.last_name ?? ''}`.trim()
    : user?.name ?? 'Student';
  
  // Use the user's preferred currency from profile, fallback to context userCurrency
  const customerCurrency = user?.preferred_currency || user?.preferredCurrency || userCurrency || 'EUR';

  // eslint-disable-next-line complexity
  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setParticipantType('self');
      setSelectedFamilyId(null);
      setSelectedServiceId(null);
      setSelectedInstructorId(null);
      setSelectedDate(null);
      setSelectedTime(null);
      setSelectedDurationMinutes(60);
      setPaymentMethod('wallet');
      setSelectedPackageId(null);
      setNotes('');
      setServiceSearch('');
      setInstructorSearch('');
      setProcessorModal(null);
      setProcessorInfo({});
      setPreferredCategory(null);
      setSelectedServiceCategory(null);
      // Reset buy package states
      setShowBuyPackages(false);
      setSelectedBuyCategory(null);
      setPurchasePaymentMethod('wallet');
      setPurchaseProcessor(null);
      // Reset promo code
      setAppliedVoucher(null);
      // Reset group booking states
      setSelectedGroupParticipants([]);
      setParticipantSearchQuery('');
      return;
    }

    setCurrentStep(Number.isFinite(initialData.step) ? Math.max(0, Math.min(STEP_CONFIG.length - 1, initialData.step)) : 0);
    setParticipantType(initialData.familyMemberId ? 'family' : 'self');
    setSelectedFamilyId(initialData.familyMemberId ?? null);
    setSelectedServiceId(initialData.serviceId ?? null);
    setSelectedInstructorId(initialData.instructorId ?? null);
    setSelectedDate(initialData.date ? dayjs(initialData.date) : null);
    setSelectedTime(initialData.time ?? null);
    if (initialData.durationMinutes) {
      const normalizedDuration = Math.max(
        HALF_HOUR_MINUTES,
        Math.round(Number(initialData.durationMinutes) / HALF_HOUR_MINUTES) * HALF_HOUR_MINUTES
      );
      if (Number.isFinite(normalizedDuration)) {
        setSelectedDurationMinutes(normalizedDuration);
      }
    } else if (initialData.durationHours) {
      const raw = Number(initialData.durationHours) * 60;
      const normalized = Math.max(
        HALF_HOUR_MINUTES,
        Math.round(raw / HALF_HOUR_MINUTES) * HALF_HOUR_MINUTES
      );
      if (Number.isFinite(normalized)) {
        setSelectedDurationMinutes(normalized);
      }
    }
    setPaymentMethod(initialData.paymentMethod ?? 'wallet');
    setSelectedPackageId(initialData.packageId ?? null);
    setNotes(initialData.notes ?? '');
    setServiceSearch('');
    setInstructorSearch('');
    setProcessorModal(null);
    setProcessorInfo({});
    setPreferredCategory(initialData.preferredCategory ? normalizeText(initialData.preferredCategory) : null);
    // Handle serviceCategory from initial data (e.g., from lesson info pages)
    if (initialData.serviceCategory) {
      setSelectedServiceCategory(initialData.serviceCategory);
    }
    // Note: discipline is no longer used to pre-fill search - category filtering is sufficient
    // Handle showBuyPackages flag from FAB
    if (initialData.showBuyPackages) {
      setShowBuyPackages(true);
      setCurrentStep(2); // Go to package step (now step 2 after swap)
    }
  }, [open, initialData, processorForm]);

  const { data: bookingDefaults } = useQuery({
    queryKey: ['student-booking', 'booking-defaults'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/settings');
        return response.data?.booking_defaults ?? null;
      } catch (error) {
        if (error?.response?.status === 403 || error?.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: open,
    staleTime: 300_000,
    retry: false
  });

  const { data: servicesData = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['student-booking', 'services'],
    queryFn: () => serviceApi.getServices(),
    enabled: open,
    staleTime: 300_000
  });

  // Fetch accommodation units
  const { data: accommodationUnits = [], isLoading: accommodationsLoading } = useQuery({
    queryKey: ['student-booking', 'accommodations'],
    queryFn: async () => {
      const units = await accommodationApi.getUnits({ status: 'Available' });
      // Transform accommodation units to match service structure
      return units.map(unit => ({
        id: unit.id,
        name: unit.name,
        category: 'accommodation',
        service_type: unit.type,
        price: parseFloat(unit.price_per_night || 0),
        currency: 'TRY', // Default currency
        duration: 1440, // 1 day in minutes
        description: unit.description,
        capacity: unit.capacity,
        amenities: unit.amenities,
        image_url: unit.image_url,
        images: unit.images,
        isAccommodation: true // Flag to identify accommodation units
      }));
    },
    enabled: open,
    staleTime: 300_000
  });

  const isValidService = (service) => {
    if (service?.isPackage) return false;
    if (!service?.name || service.name.toLowerCase() === 'test') return false;
    if (!service?.price || service.price <= 0) return false;
    if (!service?.duration || service.duration <= 0) return false;
    return true;
  };

  // Service category options for filtering
  const SERVICE_CATEGORIES = [
    { key: 'lesson', label: 'Lessons', icon: '🎓', description: 'Kitesurfing & water sports lessons' },
    { key: 'rental', label: 'Rental Equipment', icon: '🏄', description: 'Rent boards, kites, wetsuits & gear' },
    { key: 'accommodation', label: 'Accommodation', icon: '🏨', description: 'Stay at our beachfront facilities' },
  ];

  // Helper to determine service category
  const getServiceCategoryKey = (service) => {
    if (!service) return 'lesson';
    
    // Check if this is an accommodation unit (from accommodation_units table)
    if (service?.isAccommodation || service?.category === 'accommodation') {
      return 'accommodation';
    }
    
    const name = (service?.name || '').toLowerCase();
    const category = (service?.category || '').toLowerCase();
    const serviceType = (service?.serviceType || service?.service_type || '').toLowerCase();
    const disciplineTag = (service?.disciplineTag || service?.discipline_tag || '').toLowerCase();
    const description = (service?.description || '').toLowerCase();
    
    // Check for rental - match both singular and plural forms
    // Database has "rentals" (plural) in category field
    if (name.includes('rental') || name.includes('rent') || name.includes('hire') ||
        category.includes('rental') || category.includes('rentals') ||
        serviceType.includes('rental') || serviceType.includes('rentals') ||
        name.includes('equipment only') || name.includes('gear rental') ||
        description.includes('rental') || description.includes('equipment hire')) {
      return 'rental';
    }
    
    // Default to lesson (most services are lessons)
    return 'lesson';
  };

  const { data: instructorsData = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['student-booking', 'instructors'],
    queryFn: async () => {
      const response = await apiClient.get('/instructors');
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: open,
    staleTime: 300_000
  });

  const { data: familyMembers = [], isLoading: familyLoading, refetch: refetchFamilyMembers } = useQuery({
    queryKey: ['student-booking', 'family', studentId],
    queryFn: () => familyApi.getFamilyMembers(studentId),
    enabled: open && !!studentId,
    staleTime: 300_000
  });

  // Handler for adding a new family member
  const handleAddFamilyMember = useCallback(async (formData) => {
    if (!studentId) return;
    setFamilyModalSubmitting(true);
    try {
      await familyApi.createFamilyMember(studentId, formData);
      message.success('Family member added successfully');
      setFamilyModalOpen(false);
      // Refetch family members to update the list
      await refetchFamilyMembers();
    } catch (error) {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to add family member';
      message.error(errorMessage);
    } finally {
      setFamilyModalSubmitting(false);
    }
  }, [studentId, message, refetchFamilyMembers]);

  // Listen for family member deletion events from other components
  useEffect(() => {
    const handleFamilyMemberDeleted = (event) => {
      const { userId } = event.detail || {};
      // If the deleted member belongs to this student, refetch
      if (userId === studentId) {
        refetchFamilyMembers();
        // Clear selection if the deleted member was selected
        if (selectedFamilyId && selectedFamilyId === event.detail?.memberId) {
          setSelectedFamilyId(null);
          setParticipantType('self');
        }
      }
    };

    window.addEventListener('family:memberDeleted', handleFamilyMemberDeleted);
    return () => {
      window.removeEventListener('family:memberDeleted', handleFamilyMemberDeleted);
    };
  }, [studentId, selectedFamilyId, refetchFamilyMembers]);

  // Fetch registered customers for group participant selection
  // Fetch friends for group participant selection (only show accepted connections)
  const { data: registeredCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['student-booking', 'friends', participantSearchQuery],
    queryFn: async () => {
      const response = await apiClient.get('/users/customers/list', {
        params: { q: participantSearchQuery, limit: 50, friendsOnly: 'true' }
      });
      // Filter out the current user from the list (shouldn't be in friends but just in case)
      const items = response.data?.items || response.data || [];
      return items.filter(c => c.id !== studentId);
    },
    enabled: open && participantType === 'group',
    staleTime: 60_000
  });

  const { data: packagesData = [], isLoading: _packagesLoading, refetch: refetchPackages } = useQuery({
    queryKey: ['student-booking', 'packages', studentId],
    queryFn: async () => {
      const response = await apiClient.get(`/services/customer-packages/${studentId}`);
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: open && !!studentId,
    staleTime: 120_000
  });

  // Package categories for buying
  const BUY_PACKAGE_CATEGORIES = [
    { key: 'lesson', label: 'Lessons', icon: '🎓', description: 'Kitesurfing & water sports lesson packages' },
    { key: 'rental', label: 'Rental Equipment', icon: '🏄', description: 'Rent boards, kites, wetsuits & gear' },
    { key: 'accommodation', label: 'Accommodation', icon: '🏨', description: 'Stay at our beachfront facilities' },
    { key: 'lesson_rental', label: 'Lessons + Rental', icon: '🎯', description: 'Learn with equipment included' },
    { key: 'accommodation_rental', label: 'Accommodation + Rental', icon: '🏖️', description: 'Combined stay and equipment rental' },
    { key: 'accommodation_lesson', label: 'Accommodation + Lessons', icon: '🏄‍♂️', description: 'Stay and learn packages' },
    { key: 'all_inclusive', label: 'All Inclusive', icon: '⭐', description: 'Complete package: Stay, lessons & equipment' },
  ];

  // Fetch available packages for purchase
  const { data: availablePackagesForPurchase = [], isLoading: purchasePackagesLoading } = useQuery({
    queryKey: ['student-booking', 'available-packages', selectedBuyCategory],
    queryFn: async () => {
      const params = selectedBuyCategory ? `?category=${selectedBuyCategory}` : '';
      const response = await apiClient.get(`/services/packages/available${params}`);
      return response.data || [];
    },
    enabled: open && showBuyPackages && !!selectedBuyCategory,
    staleTime: 60_000
  });

  // Package purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async ({ packageId, paymentMethod: pmtMethod, externalPaymentProcessor, externalPaymentReference, externalPaymentNote, checkInDate, checkOutDate, voucherId }) => {
      const response = await apiClient.post('/services/packages/purchase', {
        packageId,
        paymentMethod: pmtMethod,
        externalPaymentProcessor,
        externalPaymentReference,
        externalPaymentNote,
        checkInDate,
        checkOutDate,
        voucherId
      });
      return response.data;
    },
    onSuccess: async (data) => {
      let description = `You have successfully purchased "${data.customerPackage.packageName}".`;
      
      // Add voucher discount info if applied
      if (data.voucher) {
        description += ` Promo code "${data.voucher.code}" saved you ${data.voucher.discountApplied.toFixed(2)}!`;
        if (data.voucher.walletCreditApplied) {
          description += ` Plus ${data.voucher.walletCreditApplied.toFixed(2)} ${data.voucher.walletCurrency} added to your wallet!`;
        }
      }
      
      // Add accommodation booking info if present
      if (data.accommodationBooking) {
        description += ` Accommodation confirmed at ${data.accommodationBooking.unitName} for ${data.accommodationBooking.nights} night(s).`;
      }
      
      if (data.wallet) {
        description += ` Your new wallet balance is ${formatCurrency(data.wallet.newBalance, data.wallet.currency)}.`;
      } else if (data.externalPayment) {
        description += ` Payment via ${data.externalPayment.processor} recorded.`;
      } else if (data.paymentMethod === 'pay_later') {
        description += ' Payment is pending.';
      }

      notification.success({
        message: 'Package Purchased!',
        description,
        duration: 5,
      });
      
      // Refresh packages and wallet
      await refetchPackages();
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['customer-packages'] });
      
      // Reset buy package states and go back to package selection
      setShowBuyPackages(false);
      setSelectedBuyCategory(null);
      setPurchasePaymentMethod('wallet');
      setPurchaseProcessor(null);
      try { purchaseProcessorForm.resetFields(); } catch { /* form may not be mounted */ }
      setAccommodationDates({ checkIn: null, checkOut: null });
      setAccommodationDateModal(null);
      
      // Auto-select the newly purchased package
      if (data.customerPackage?.id) {
        setPaymentMethod('package');
        setSelectedPackageId(data.customerPackage.id);
      }
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to purchase package';
      const errorData = error.response?.data;
      const errorCode = errorData?.code;
      
      if (errorData?.required && errorData?.available !== undefined) {
        notification.error({
          message: 'Insufficient Balance',
          description: `You need ${formatCurrency(errorData.required, errorData.currency)} but only have ${formatCurrency(errorData.available, errorData.currency)} available. Please add funds or choose another payment method.`,
          duration: 6,
        });
      } else if (errorCode === 'DATES_UNAVAILABLE') {
        notification.error({
          message: 'Accommodation Not Available',
          description: 'The accommodation is not available for your selected dates. Please choose different dates.',
          duration: 6,
        });
        // Reset dates so user can try again
        setAccommodationDates({ checkIn: null, checkOut: null });
      } else if (errorCode === 'DATES_REQUIRED') {
        notification.error({
          message: 'Dates Required',
          description: 'Please select check-in and check-out dates for this accommodation package.',
          duration: 5,
        });
      } else if (errorCode === 'NO_UNIT_ASSIGNED') {
        notification.error({
          message: 'Configuration Error',
          description: 'This package does not have an accommodation unit assigned. Please contact support.',
          duration: 6,
        });
      } else {
        notification.error({
          message: 'Purchase Failed',
          description: errorMessage,
          duration: 5,
        });
      }
    }
  });

  const handlePurchasePackage = async (pkg, dates = null) => {
    // Check if package includes accommodation
    const includesAccommodation = pkg.includesAccommodation || 
      pkg.packageType === 'accommodation' || 
      pkg.package_type === 'accommodation' ||
      pkg.packageType === 'accommodation_rental' || 
      pkg.package_type === 'accommodation_rental' ||
      pkg.packageType === 'accommodation_lesson' || 
      pkg.package_type === 'accommodation_lesson' ||
      pkg.packageType === 'all_inclusive' ||
      pkg.package_type === 'all_inclusive';

    // If package includes accommodation and dates not provided, show date selection modal
    if (includesAccommodation && !dates) {
      setAccommodationDates({ checkIn: null, checkOut: null });
      setAccommodationDateModal(pkg);
      return;
    }

    const walletBal = normalizeNumeric(walletSummary?.available, 0);
    // Get price in user's wallet currency (use user's preferred_currency)
    const { price: pkgPrice, currency: pkgCurrency } = getPackagePriceInCurrency(pkg, customerCurrency);

    // Validate wallet payment
    if (purchasePaymentMethod === 'wallet' && walletBal < pkgPrice) {
      notification.error({
        message: 'Insufficient Balance',
        description: `You need ${formatCurrency(pkgPrice, pkgCurrency)} but only have ${formatCurrency(walletBal, pkgCurrency)} available.`,
      });
      return;
    }

    // Validate external payment
    let externalPaymentReference = null;
    let externalPaymentNote = null;

    if (purchasePaymentMethod === 'external') {
      if (!purchaseProcessor) {
        notification.error({
          message: 'Select Payment Processor',
          description: 'Please select a payment processor.',
        });
        return;
      }

      try {
        const values = await purchaseProcessorForm.validateFields();
        externalPaymentReference = values.reference;
        externalPaymentNote = values.note;
      } catch {
        return; // Form validation failed
      }
    }

    // Calculate nights for accommodation
    const nightsSelected = dates?.checkIn && dates?.checkOut 
      ? dates.checkOut.diff(dates.checkIn, 'day')
      : 0;

    // Show confirmation modal
    Modal.confirm({
      title: 'Confirm Package Purchase',
      icon: <span className="text-xl">📦</span>,
      content: (
        <div className="space-y-2 mt-3">
          <div className="flex justify-between">
            <Text strong>Package:</Text>
            <Text>{pkg.name}</Text>
          </div>
          <div className="flex justify-between">
            <Text strong>Price:</Text>
            <Text className="text-sky-600 font-semibold">{formatCurrency(pkgPrice, pkgCurrency)}</Text>
          </div>
          {dates && (
            <>
              <div className="flex justify-between">
                <Text strong>Check-in:</Text>
                <Text>{dates.checkIn.format('DD MMM YYYY')}</Text>
              </div>
              <div className="flex justify-between">
                <Text strong>Check-out:</Text>
                <Text>{dates.checkOut.format('DD MMM YYYY')}</Text>
              </div>
              <div className="flex justify-between">
                <Text strong>Nights:</Text>
                <Text>{nightsSelected}</Text>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <Text strong>Payment:</Text>
            <Text>{purchasePaymentMethod === 'wallet' ? '💳 Wallet' : '🏦 Card/External'}</Text>
          </div>
          {purchasePaymentMethod === 'wallet' && (
            <div className="flex justify-between">
              <Text strong>Balance after:</Text>
              <Text>{formatCurrency(walletBal - pkgPrice, pkgCurrency)}</Text>
            </div>
          )}
        </div>
      ),
      okText: 'Confirm Purchase',
      cancelText: 'Cancel',
      okButtonProps: { type: 'primary' },
      onOk: async () => {
        await purchaseMutation.mutateAsync({
          packageId: pkg.id,
          paymentMethod: purchasePaymentMethod,
          externalPaymentProcessor: purchaseProcessor,
          externalPaymentReference,
          externalPaymentNote,
          // Include accommodation dates if provided
          checkInDate: dates?.checkIn ? dates.checkIn.format('YYYY-MM-DD') : null,
          checkOutDate: dates?.checkOut ? dates.checkOut.format('YYYY-MM-DD') : null,
          // Include voucher/promo code if applied
          voucherId: appliedVoucher?.id || null
        });
      }
    });
  };

  const { data: walletSummary } = useWalletSummary({ 
    enabled: open,
    currency: businessCurrency || 'EUR' // Fetch wallet in storage currency (EUR), not customer currency
  });

  const availableServices = useMemo(() => {
    if (!Array.isArray(servicesData)) {
      return [];
    }

    // Combine regular services with accommodation units
    let base = [
      ...servicesData.filter(isValidService),
      ...accommodationUnits // Already validated in query transform
    ].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));

    // Filter by participant type
    if (participantType === 'self') {
      // For individual bookings, exclude group services
      base = base.filter((service) => {
        const serviceType = normalizeText(service.service_type || service.serviceType || '');
        const serviceName = normalizeText(service.name || '');
        return serviceType !== 'group' && !serviceName.includes('group');
      });
    } else if (participantType === 'group') {
      // For group bookings, only show group services
      base = base.filter((service) => {
        const serviceType = normalizeText(service.service_type || service.serviceType || '');
        const serviceName = normalizeText(service.name || '');
        return serviceType === 'group' || serviceName.includes('group');
      });
    }

    // Filter by selected service category if one is chosen
    if (selectedServiceCategory) {
      base = base.filter((service) => getServiceCategoryKey(service) === selectedServiceCategory);
    }

    // If a package is selected, filter to show only matching services
    if (paymentMethod === 'package' && selectedPackageId) {
      const selectedPkg = packagesData.find((pkg) => String(getPackageId(pkg)) === String(selectedPackageId));
      if (selectedPkg) {
        const matchingServices = base.filter((service) => matchesServicePackage(service, selectedPkg));
        // If we found matching services, use them; otherwise show all (with warning in UI)
        if (matchingServices.length > 0) {
          base = matchingServices;
        }
      }
    }

    const normalizedCategory = normalizeText(preferredCategory);
    if (!normalizedCategory) {
      return base;
    }

    const matching = [];
    const remainder = [];
    base.forEach((service) => {
      if (serviceMatchesCategory(service, normalizedCategory)) {
        matching.push(service);
      } else {
        remainder.push(service);
      }
    });

    return [...matching, ...remainder];
  }, [servicesData, accommodationUnits, preferredCategory, selectedServiceCategory, paymentMethod, selectedPackageId, packagesData, participantType]);

  useEffect(() => {
    if (!open || !preferredCategory || selectedServiceId) {
      return;
    }

    const normalized = normalizeText(preferredCategory);
    const candidate = availableServices.find((service) => serviceMatchesCategory(service, normalized));
    if (candidate) {
      setSelectedServiceId(candidate.id);
    }
  }, [open, preferredCategory, availableServices, selectedServiceId]);

  const selectedService = useMemo(
    () => availableServices.find((service) => service.id === selectedServiceId) || null,
    [availableServices, selectedServiceId]
  );

  // Helper to check if instructor is required for current service
  const isInstructorRequired = useMemo(() => {
    if (!selectedService) return true; // Default to required until service is selected
    const categoryKey = getServiceCategoryKey(selectedService);
    // Only lessons require an instructor, rentals and accommodations don't
    return categoryKey === 'lesson';
  }, [selectedService]);

  // Helper to check if schedule step is needed - rentals are instant, don't need date/time selection
  const isScheduleRequired = useMemo(() => {
    if (!selectedService) return true; // Default to required until service is selected
    const categoryKey = getServiceCategoryKey(selectedService);
    // Lessons and accommodations need scheduling, rentals are instant
    return categoryKey !== 'rental';
  }, [selectedService]);

  const selectedInstructor = useMemo(
    () => instructorsData.find((instructor) => instructor.id === selectedInstructorId) || null,
    [instructorsData, selectedInstructorId]
  );

  const selectedFamilyMember = useMemo(
    () => familyMembers.find((member) => member.id === selectedFamilyId) || null,
    [familyMembers, selectedFamilyId]
  );

  const baseServiceDurationMinutes = useMemo(() => {
    if (!selectedService) {
      return null;
    }
    const durationHours = normalizeNumeric(selectedService.duration, 0);
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      return null;
    }
    const rawMinutes = durationHours * 60;
    const normalized = Math.round(rawMinutes);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return null;
    }
    const remainder = normalized % HALF_HOUR_MINUTES;
    return remainder === 0 ? normalized : normalized + (HALF_HOUR_MINUTES - remainder);
  }, [selectedService]);

  const durationOptions = useMemo(() => {
    const candidateSet = new Set();

    if (Array.isArray(bookingDefaults?.allowedDurations)) {
      bookingDefaults.allowedDurations.forEach((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return;
        }
        const normalized = Math.max(
          HALF_HOUR_MINUTES,
          Math.round(numeric / HALF_HOUR_MINUTES) * HALF_HOUR_MINUTES
        );
        if (Number.isFinite(normalized)) {
          candidateSet.add(normalized);
        }
      });
    }

    if (baseServiceDurationMinutes) {
      candidateSet.add(baseServiceDurationMinutes);
    }

    if (candidateSet.size === 0) {
      [60, 90, 120].forEach((fallback) => candidateSet.add(fallback));
    }

    const result = Array.from(candidateSet).filter((value) => Number.isFinite(value) && value >= HALF_HOUR_MINUTES);
    result.sort((a, b) => a - b);
    return result;
  }, [bookingDefaults, baseServiceDurationMinutes]);

  useEffect(() => {
    const fallback = baseServiceDurationMinutes || durationOptions[0] || HALF_HOUR_MINUTES;
    if (selectedServiceId !== lastServiceIdRef.current) {
      lastServiceIdRef.current = selectedServiceId ?? null;
      if (Number.isFinite(fallback) && fallback !== selectedDurationMinutes) {
        setSelectedDurationMinutes(fallback);
      }
      return;
    }

    if (!durationOptions.includes(selectedDurationMinutes)) {
      if (Number.isFinite(fallback) && fallback !== selectedDurationMinutes) {
        setSelectedDurationMinutes(fallback);
      }
    }
  }, [selectedServiceId, baseServiceDurationMinutes, durationOptions, selectedDurationMinutes]);

  // Pre-select first duration option on initial mount when durationOptions are available
  useEffect(() => {
    if (durationOptions.length > 0 && !selectedDurationMinutes) {
      setSelectedDurationMinutes(durationOptions[0]);
    }
  }, [durationOptions, selectedDurationMinutes]);

  // Multi-currency price lookup: Use price from user's wallet currency if available
  const { servicePrice, serviceCurrency } = useMemo(() => {
    if (!selectedService) {
      return { servicePrice: 0, serviceCurrency: undefined };
    }
    
    // Determine user's wallet currency - prioritize user's preferred currency
    const walletCurrency = walletSummary?.currency || customerCurrency;
    
    // Look for price in user's wallet currency from the prices array
    if (walletCurrency && selectedService.prices && Array.isArray(selectedService.prices)) {
      const currencyPrice = selectedService.prices.find(
        p => p.currencyCode === walletCurrency || p.currency_code === walletCurrency
      );
      if (currencyPrice && currencyPrice.price > 0) {
        return {
          servicePrice: normalizeNumeric(currencyPrice.price, 0),
          serviceCurrency: walletCurrency
        };
      }
    }
    
    // Fallback to default service price/currency
    return {
      servicePrice: normalizeNumeric(selectedService.price, 0),
      serviceCurrency: selectedService?.currency || undefined
    };
  }, [selectedService, walletSummary?.currency, customerCurrency]);
  const walletBalance = normalizeNumeric(walletSummary?.available, 0);

  const selectedDateString = selectedDate?.isValid() ? selectedDate.format('YYYY-MM-DD') : null;

  const { data: availabilityData = [], isFetching: availabilityLoading } = useQuery({
    queryKey: ['student-booking', 'availability', selectedDateString, selectedInstructorId],
    queryFn: async () => {
      // For rentals/accommodations without instructor, return empty array (availability check not needed)
      if (!isInstructorRequired) {
        return [];
      }
      if (!selectedDateString || !selectedInstructorId) {
        return [];
      }
      const filters = { instructorIds: [selectedInstructorId] };
      const days = await getAvailableSlots(selectedDateString, selectedDateString, filters);
      return Array.isArray(days) ? days : [];
    },
    enabled: open && !!selectedDateString && (isInstructorRequired ? !!selectedInstructorId : true),
    staleTime: 60_000
  });

  const availableStarts = useMemo(() => {
    // For rentals/accommodations without instructor, allow any time slot
    if (!isInstructorRequired) {
      // Generate standard time slots from 8 AM to 8 PM
      const slots = [];
      for (let hour = 8; hour <= 20; hour += 0.5) {
        const intHour = Math.floor(hour);
        const minutes = hour % 1 ? 30 : 0;
        const timeStr = `${intHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        slots.push({ value: timeStr, label: timeStr, available: true });
      }
      return slots;
    }
    
    if (!selectedDateString || !selectedInstructorId) {
      return [];
    }
    const dayEntry = availabilityData.find((day) => day.date === selectedDateString);
    if (!dayEntry || !Array.isArray(dayEntry.slots)) {
      return [];
    }
    const instructorSlots = dayEntry.slots.filter(
      (slot) => String(slot.instructorId) === String(selectedInstructorId)
    );
    const isSelectedDayToday = selectedDate?.isSame(dayjs(), 'day') ?? false;
    const durationForAvailability = selectedDurationMinutes || HALF_HOUR_MINUTES;
    return computeAvailableStarts(instructorSlots, durationForAvailability, isSelectedDayToday);
  }, [availabilityData, selectedDateString, selectedInstructorId, selectedDurationMinutes, selectedDate, isInstructorRequired]);

  useEffect(() => {
    if (selectedTime && !availableStarts.some((entry) => entry.value === selectedTime)) {
      setSelectedTime(null);
    }
  }, [availableStarts, selectedTime]);

  const packagesWithBalance = useMemo(() => {
    if (!Array.isArray(packagesData)) {
      return [];
    }
    return packagesData
      .map((pkg) => ({
        ...pkg,
        id: getPackageId(pkg),
        remainingHours: getPackageRemainingHours(pkg)
      }))
      .filter((pkg) => isActivePackage(pkg) && pkg.id)
      .sort((a, b) => {
        if (b.remainingHours !== a.remainingHours) {
          return b.remainingHours - a.remainingHours;
        }
        return getPackageDisplayName(a).localeCompare(getPackageDisplayName(b));
      });
  }, [packagesData]);

  const hasPackages = packagesWithBalance.length > 0;

  const matchingPackages = useMemo(() => {
    if (!selectedService) {
      return [];
    }
    
    let filtered = packagesWithBalance.filter((pkg) => matchesServicePackage(selectedService, pkg));
    
    // Filter packages by participant type
    if (participantType === 'self') {
      // For individual bookings, exclude group packages
      filtered = filtered.filter((pkg) => {
        const packageServiceName = normalizeText(pkg.lesson_service_name || pkg.lessonServiceName || '');
        return !packageServiceName.includes('group');
      });
    } else if (participantType === 'group') {
      // For group bookings, only show group packages
      filtered = filtered.filter((pkg) => {
        const packageServiceName = normalizeText(pkg.lesson_service_name || pkg.lessonServiceName || '');
        return packageServiceName.includes('group');
      });
    }
    
    return filtered;
  }, [packagesWithBalance, selectedService, participantType]);

  const selectedPackage = useMemo(
    () => packagesWithBalance.find((pkg) => String(pkg.id) === String(selectedPackageId)) || null,
    [packagesWithBalance, selectedPackageId]
  );

  useEffect(() => {
    if (paymentMethod !== 'package') {
      return;
    }
    
    // If current selected package doesn't match the service, clear it
    if (selectedPackageId && matchingPackages.length > 0) {
      const currentPackageMatches = matchingPackages.some(
        (pkg) => String(pkg.id) === String(selectedPackageId)
      );
      if (!currentPackageMatches) {
        setSelectedPackageId(null);
        return;
      }
    }
    
    // Auto-select if no package selected
    if (!selectedPackageId) {
      if (matchingPackages.length === 1) {
        setSelectedPackageId(matchingPackages[0].id);
        return;
      }
      // Only fallback to all packages if there are no matching packages
      if (matchingPackages.length === 0 && packagesWithBalance.length === 1) {
        setSelectedPackageId(packagesWithBalance[0].id);
      }
    }
  }, [paymentMethod, matchingPackages, packagesWithBalance, selectedPackageId]);

  const bookingDurationHours = useMemo(() => {
    const minutes = Number(selectedDurationMinutes) || HALF_HOUR_MINUTES;
    const hours = minutes / 60;
    return Number.isFinite(hours) ? Number(hours.toFixed(2)) : 1;
  }, [selectedDurationMinutes]);

  const baseServiceHours = useMemo(() => (
    baseServiceDurationMinutes ? baseServiceDurationMinutes / 60 : null
  ), [baseServiceDurationMinutes]);

  const baseHourlyRate = useMemo(() => {
    if (!selectedService) {
      return 0;
    }
    const denominator = baseServiceHours && baseServiceHours > 0 ? baseServiceHours : 1;
    const rate = servicePrice / denominator;
    return Number.isFinite(rate) ? Number(rate.toFixed(2)) : 0;
  }, [selectedService, servicePrice, baseServiceHours]);

  const pricingInput = useMemo(() => {
    if (!selectedService || bookingDurationHours <= 0) {
      return null;
    }
    const packageHoursAvailable = paymentMethod === 'package'
      ? Number(selectedPackage?.remainingHours ?? 0)
      : 0;
    return {
      plannedHours: bookingDurationHours,
      hourlyRate: baseHourlyRate,
      packageHoursAvailable,
      step: 0.25,
      participants: 1
    };
  }, [selectedService, bookingDurationHours, baseHourlyRate, paymentMethod, selectedPackage]);

  const pricingBreakdown = useMemo(
    () => (pricingInput ? getPricingBreakdown(pricingInput) : null),
    [pricingInput]
  );

  const finalAmount = useMemo(
    () => (pricingInput ? computeBookingPrice(pricingInput) : servicePrice),
    [pricingInput, servicePrice]
  );

  const roundedFinalAmount = useMemo(() => roundCurrency(finalAmount), [finalAmount]);
  const walletAfterCharge = useMemo(() => (
    paymentMethod === 'wallet'
      ? roundCurrency(walletBalance - roundedFinalAmount)
      : walletBalance
  ), [paymentMethod, walletBalance, roundedFinalAmount]);
  const walletInsufficient = paymentMethod === 'wallet' && roundedFinalAmount > walletBalance;
  
  // Storage currency is always EUR (base/business currency)
  // Service prices and amounts are already in EUR, wallet is in EUR
  // For customer display: convert FROM EUR TO userCurrency
  const storageCurrency = businessCurrency || 'EUR';
  const displayFinalAmount = convertCurrency ? convertCurrency(roundedFinalAmount, storageCurrency, userCurrency) : roundedFinalAmount;
  const displayWallet = convertCurrency ? convertCurrency(walletBalance, storageCurrency, userCurrency) : walletBalance;
  const displayWalletAfterCharge = convertCurrency ? convertCurrency(walletAfterCharge, storageCurrency, userCurrency) : walletAfterCharge;
  
  // Show dual currency if storage currency differs from user currency
  const showDualCurrency = storageCurrency !== userCurrency;
  const formattedFinalAmount = showDualCurrency 
    ? `${formatCurrency(roundedFinalAmount, storageCurrency)} / ${formatCurrency(displayFinalAmount, userCurrency)}`
    : formatCurrency(displayFinalAmount, userCurrency);
  const formattedWallet = showDualCurrency 
    ? `${formatCurrency(walletBalance, storageCurrency)} / ${formatCurrency(displayWallet, userCurrency)}`
    : formatCurrency(displayWallet, userCurrency);
  const formattedWalletAfterCharge = showDualCurrency 
    ? `${formatCurrency(walletAfterCharge, storageCurrency)} / ${formatCurrency(displayWalletAfterCharge, userCurrency)}`
    : formatCurrency(displayWalletAfterCharge, userCurrency);
  const packageHoursUsed = paymentMethod === 'package' && pricingBreakdown ? pricingBreakdown.usedFromPackage : 0;
  const packageChargeableHours = pricingBreakdown?.chargeableHours ?? bookingDurationHours;
  const isProcessorPayment = typeof paymentMethod === 'string' && paymentMethod.startsWith('processor:');
  const selectedProcessor = isProcessorPayment ? paymentMethod.split(':')[1] : null;
  const processorLabel = selectedProcessor ? getProcessorLabel(selectedProcessor) : null;
  const processorModalVisible = Boolean(processorModal);
  const processorModalLabel = processorModalVisible ? getProcessorLabel(processorModal) : null;
  const recommendedPackage = useMemo(() => {
    if (selectedPackageId) {
      return null;
    }
    return matchingPackages[0] ?? null;
  }, [matchingPackages, selectedPackageId]);
  const packageRemainingAfterBooking = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }
    if (!packageHoursUsed) {
      return selectedPackage.remainingHours;
    }
    const remaining = selectedPackage.remainingHours - packageHoursUsed;
    return Number.isFinite(remaining) ? Number(remaining.toFixed(2)) : null;
  }, [selectedPackage, packageHoursUsed]);
  const baseAmount = roundCurrency(servicePrice);
  const dueAmount = paymentMethod === 'pay_later' ? 0 : roundedFinalAmount;
  const packageIdToSend = paymentMethod === 'package' ? (selectedPackage?.id ?? selectedPackageId) : null;
  const processorNoteText = useMemo(() => {
    if (!isProcessorPayment || !processorInfo?.reference) {
      return '';
    }
    const descriptor = processorLabel || selectedProcessor;
    const extra = processorInfo.note ? ` — ${processorInfo.note}` : '';
    return `Payment via ${descriptor}: ${processorInfo.reference}${extra}`;
  }, [isProcessorPayment, processorInfo, processorLabel, selectedProcessor]);
  const combinedNotes = useMemo(() => {
    const baseNote = notes?.trim() || '';
    return [baseNote, processorNoteText].filter(Boolean).join('\n\n');
  }, [notes, processorNoteText]);
  const paymentSummary = useMemo(() => {
    if (paymentMethod === 'wallet') {
      return buildWalletPaymentSummary({
        formattedFinalAmount,
        walletInsufficient,
        formattedWallet,
        formattedWalletAfterCharge
      });
    }

    if (paymentMethod === 'package') {
      return buildPackagePaymentSummary({
        selectedPackage,
        packageHoursUsed,
        packageRemainingAfterBooking,
        roundedFinalAmount,
        formattedFinalAmount
      });
    }

    if (isProcessorPayment) {
      return buildProcessorPaymentSummary({
        processorLabel,
        selectedProcessor,
        processorInfo,
        formattedFinalAmount
      });
    }

    if (paymentMethod === 'pay_later') {
      return buildPayLaterSummary({ formattedFinalAmount });
    }

    return null;
  }, [
    paymentMethod,
    formattedFinalAmount,
    walletInsufficient,
    formattedWallet,
    formattedWalletAfterCharge,
    selectedPackage,
    packageHoursUsed,
    packageRemainingAfterBooking,
    roundedFinalAmount,
    isProcessorPayment,
    processorInfo,
    processorLabel,
    selectedProcessor
  ]);

  const paymentSelectOptions = useMemo(() => {
    const options = [
      {
        value: 'wallet',
        label: (
          <Space align="baseline" className="w-full justify-between">
            <Text>Wallet</Text>
            <Tag color={walletInsufficient ? 'red' : 'green'}>
              {walletInsufficient ? 'Add funds' : 'Instant'}
            </Tag>
          </Space>
        ),
        display: 'Wallet'
      }
    ];

    if (hasPackages) {
      options.push({
        value: 'package',
        label: (
          <Space align="baseline" className="w-full justify-between">
            <Text>Use package hours</Text>
            <Tag color={matchingPackages.length > 0 ? 'green' : 'blue'}>
              {matchingPackages.length > 0 ? 'Matches service' : 'Select package'}
            </Tag>
          </Space>
        ),
        display: 'Use package hours'
      });
    }

    PROCESSOR_OPTIONS.forEach((option) => {
      const tag = processorInfo?.method === option.value
        ? (processorInfo?.reference
          ? { color: 'green', text: 'Reference saved' }
          : { color: 'red', text: 'Reference needed' })
        : { color: 'blue', text: 'Manual payment' };

      options.push({
        value: `processor:${option.value}`,
        label: (
          <Space align="baseline" className="w-full justify-between">
            <Text>{option.label}</Text>
            <Tag color={tag.color}>{tag.text}</Tag>
          </Space>
        ),
        display: option.label
      });
    });

    // Pay at Center option - available for all customers
    options.push({
      value: 'pay_later',
      label: (
        <Space align="baseline" className="w-full justify-between">
          <Text>Pay at Reception (Cash/Card)</Text>
          <Tag color="blue">Due on arrival</Tag>
        </Space>
      ),
      display: 'Pay at Reception (Cash/Card)'
    });

    return options;
  }, [walletInsufficient, hasPackages, matchingPackages.length, processorInfo]);
  const startHourDecimal = useMemo(() => {
    const minutes = timeStringToMinutes(selectedTime);
    if (minutes === null) {
      return 0;
    }
    return Number((minutes / 60).toFixed(2));
  }, [selectedTime]);
  const participantLabel = useMemo(
    () => (participantType === 'self' ? studentName : selectedFamilyMember?.full_name || studentName),
    [participantType, studentName, selectedFamilyMember]
  );
  const instructorLabel = useMemo(() => {
    if (!selectedInstructor) {
      return '';
    }
    if (selectedInstructor.name) {
      return selectedInstructor.name;
    }
    return `${selectedInstructor.first_name || ''} ${selectedInstructor.last_name || ''}`.trim();
  }, [selectedInstructor]);
  const durationLabel = useMemo(
    () => formatDurationLabel(selectedDurationMinutes || HALF_HOUR_MINUTES),
    [selectedDurationMinutes]
  );

  const handleParticipantSelect = (type, familyId = null) => {
    setParticipantType(type);
    setSelectedFamilyId(type === 'family' ? familyId : null);
  };

  const handleServiceSelect = (serviceId) => {
    setSelectedServiceId(serviceId);
    setPreferredCategory(null);
    // reset downstream selections when service changes
    setSelectedInstructorId(null);
    setSelectedDate(null);
    setSelectedTime(null);
  };

  const handleInstructorSelect = (instructorId) => {
    setSelectedInstructorId(instructorId);
    setSelectedDate(null);
    setSelectedTime(null);
  };

  const openProcessorModal = (method) => {
    if (!method) {
      return;
    }
    previousPaymentMethodRef.current = paymentMethod;
    setProcessorModal(method);
    processorForm.setFieldsValue({
      reference: processorInfo.method === method ? processorInfo.reference : '',
      note: processorInfo.method === method ? processorInfo.note : ''
    });
  };

  const handlePaymentMethodChange = (value) => {
    if (typeof value !== 'string') {
      return;
    }
    if (value.startsWith('processor:')) {
      const method = value.split(':')[1];
      setPaymentMethod(value);
      openProcessorModal(method);
      return;
    }

    setPaymentMethod(value);
    previousPaymentMethodRef.current = value;
    setProcessorModal(null);
    try { processorForm.resetFields(); } catch { /* form may not be mounted */ }
    if (value !== 'package') {
      setSelectedPackageId(null);
    } else if (packagesWithBalance.length === 1) {
      setSelectedPackageId(packagesWithBalance[0].id);
    }
    if (!value.startsWith('processor:')) {
      setProcessorInfo({});
    }
  };

  const handleProcessorModalCancel = () => {
    const fallback = processorInfo.method ? `processor:${processorInfo.method}` : previousPaymentMethodRef.current || 'wallet';
    setProcessorModal(null);
    try { processorForm.resetFields(); } catch { /* form may not be mounted */ }
    setPaymentMethod(fallback);
  };

  const handleProcessorModalOk = async () => {
    try {
      const values = await processorForm.validateFields();
      const method = processorModal;
      if (!method) {
        return;
      }
      const reference = values.reference?.trim() || '';
      const note = values.note?.trim() || '';
      setProcessorInfo({ method, reference, note });
      const nextValue = `processor:${method}`;
      setPaymentMethod(nextValue);
      previousPaymentMethodRef.current = nextValue;
      setProcessorModal(null);
      try { processorForm.resetFields(); } catch { /* form may not be mounted */ }
    } catch {
      // Leave modal open so the user can correct validation errors
    }
  };

  const renderRecommendedPackageCard = () => {
    if (!recommendedPackage) {
      return null;
    }
    const recommendedName = getPackageDisplayName(recommendedPackage);
    const remainingLabel = Number.isFinite(recommendedPackage.remainingHours)
      ? `${recommendedPackage.remainingHours.toFixed(2)}h`
      : 'hours unavailable';

    return (
      <Card size="small" className="border-sky-200 bg-sky-50">
        <Space direction="vertical" size={4}>
          <Text strong>Suggested package match</Text>
          <Text type="secondary">{recommendedName} · {remainingLabel} remaining</Text>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              handlePaymentMethodChange('package');
              setSelectedPackageId(recommendedPackage.id);
            }}
          >
            Apply this package
          </Button>
        </Space>
      </Card>
    );
  };

  const renderBookingOverview = () => {
    // Get payment method display label
    const getPaymentMethodLabel = () => {
      if (paymentMethod === 'wallet') return 'Wallet';
      if (paymentMethod === 'package') return selectedPackage ? getPackageDisplayName(selectedPackage) : 'Package';
      if (paymentMethod === 'pay_later') return 'Pay at Center';
      if (isProcessorPayment) return processorLabel || 'External Payment';
      return paymentMethod;
    };

    // For group bookings, show group-specific info
    if (participantType === 'group') {
      // Get selected participants' names for display
      const selectedParticipantNames = (registeredCustomers || [])
        .filter(c => selectedGroupParticipants.includes(c.id))
        .map(c => c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email);

      return (
        <div className="space-y-2">
          <Title level={5} className="mb-2">Group Booking Details</Title>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <Text type="secondary" className="text-xs block mb-1">Service</Text>
              <Text strong>{selectedService?.name}</Text>
            </div>
            <div>
              <Text type="secondary" className="text-xs block mb-1">Instructor</Text>
              <Text strong>{instructorLabel}</Text>
            </div>
            <div>
              <Text type="secondary" className="text-xs block mb-1">Duration</Text>
              <Text strong>{durationLabel}</Text>
            </div>
            <div>
              <Text type="secondary" className="text-xs block mb-1">Participants</Text>
              <Text strong>{selectedGroupParticipants.length} selected</Text>
            </div>
            <div>
              <Text type="secondary" className="text-xs block mb-1">Date</Text>
              <Text strong>{selectedDateString}</Text>
            </div>
            <div>
              <Text type="secondary" className="text-xs block mb-1">Time</Text>
              <Text strong>{selectedTime}</Text>
            </div>
            <div className="col-span-2 pt-1 border-t border-gray-100">
              <Text type="secondary" className="text-xs block mb-1">Payment Method</Text>
              <Text strong>{getPaymentMethodLabel()}</Text>
            </div>
            {selectedParticipantNames.length > 0 && (
              <div className="col-span-2">
                <Text type="secondary" className="text-xs block mb-1">Selected Participants</Text>
                <div className="flex flex-wrap gap-1">
                  {selectedParticipantNames.map((name, idx) => (
                    <Tag key={idx} color="blue">{name}</Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Alert
            type="info"
            showIcon
            className="mt-3"
            message="Participants will need to accept the invitation before this lesson is confirmed."
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Title level={5} className="mb-2">Booking Details</Title>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <Text type="secondary" className="text-xs block mb-1">Participant</Text>
            <Text strong>{participantLabel}</Text>
          </div>
          <div>
            <Text type="secondary" className="text-xs block mb-1">Service</Text>
            <Text strong>{selectedService?.name}</Text>
          </div>
          <div>
            <Text type="secondary" className="text-xs block mb-1">Instructor</Text>
            <Text strong>{instructorLabel}</Text>
          </div>
          <div>
            <Text type="secondary" className="text-xs block mb-1">Duration</Text>
            <Text strong>{durationLabel}</Text>
          </div>
          <div>
            <Text type="secondary" className="text-xs block mb-1">Date</Text>
            <Text strong>{selectedDateString}</Text>
          </div>
          <div>
            <Text type="secondary" className="text-xs block mb-1">Time</Text>
            <Text strong>{selectedTime}</Text>
          </div>
          <div className="col-span-2 pt-1 border-t border-gray-100">
            <Text type="secondary" className="text-xs block mb-1">Payment Method</Text>
            <Text strong>{getPaymentMethodLabel()}</Text>
          </div>
        </div>
      </div>
    );
  };

  const renderPaymentSummary = () => {
    if (!paymentSummary) {
      return null;
    }
    return (
      <Card size="small" className="bg-gray-50">
        <Space direction="vertical" size={4} className="w-full">
          <Space align="start" className="w-full justify-between">
            <Text strong>{paymentSummary.title}</Text>
            {paymentSummary.tag ? <Tag color={paymentSummary.tag.color}>{paymentSummary.tag.text}</Tag> : null}
          </Space>
          {paymentSummary.lines.map((line) => (
            <Text key={`${paymentSummary.title}-${line.text}-${line.type || 'default'}`} type={line.type}>
              {line.text}
            </Text>
          ))}
        </Space>
      </Card>
    );
  };

  const renderPackageSelector = () => {
    if (paymentMethod !== 'package') {
      return null;
    }

    // Show only matching packages, or all packages if none match (with warning)
    const displayPackages = matchingPackages.length > 0 ? matchingPackages : packagesWithBalance;
    const showingAllPackages = matchingPackages.length === 0 && packagesWithBalance.length > 0;

    return (
      <Space direction="vertical" size={4} className="w-full">
        <Text type="secondary">
          {showingAllPackages
            ? 'No packages match this service. Showing all available packages:'
            : 'Select a package with remaining hours'}
        </Text>
        <Radio.Group
          onChange={(event) => setSelectedPackageId(event.target.value)}
          value={selectedPackageId}
          className="flex flex-col gap-2"
        >
          {displayPackages.map((pkg) => (
            <Radio key={pkg.id} value={pkg.id}>
              {getPackageDisplayName(pkg)}
              <Text type="secondary" className="ml-2">
                {Number(pkg.remainingHours).toFixed(2)}h remaining
              </Text>
            </Radio>
          ))}
        </Radio.Group>
        {showingAllPackages ? (
          <Alert
            type="warning"
            showIcon
            message="No packages match this service"
            description="You can still select a package, but the backend may reject it if hours are insufficient."
          />
        ) : null}
      </Space>
    );
  };

  const renderProcessorActions = () => {
    if (!isProcessorPayment || !selectedProcessor) {
      return null;
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="small" onClick={() => openProcessorModal(selectedProcessor)}>
          {processorInfo?.reference ? 'Edit payment details' : 'Enter payment details'}
        </Button>
        {processorInfo?.reference ? (
          <Text type="secondary">Stored reference: {processorInfo.reference}</Text>
        ) : null}
      </div>
    );
  };

  const renderWalletWarning = () => {
    if (!(paymentMethod === 'wallet' && walletInsufficient)) {
      return null;
    }
    return (
      <Alert
        type="warning"
        showIcon
        message="Wallet balance is lower than the amount due. Choose another payment option or top up your wallet."
      />
    );
  };

  const renderPaymentOptions = () => (
    <div className="space-y-2">
      <Title level={5} className="mb-2">Payment Method</Title>
      <Select
        value={paymentMethod}
        onChange={handlePaymentMethodChange}
        className="w-full"
        optionLabelProp="display"
        popupMatchSelectWidth
        options={paymentSelectOptions}
      />

      {renderPackageSelector()}
      {renderProcessorActions()}
      {renderWalletWarning()}
    </div>
  );

  const renderNotesSection = () => (
    <div className="space-y-2">
      <Title level={5} className="mb-2">Additional Notes (Optional)</Title>
      <Input.TextArea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Add details for your instructor"
        autoSize={{ minRows: 2, maxRows: 4 }}
        size="small"
      />
    </div>
  );

  const renderPricingDetails = () => {
    if (!pricingBreakdown) {
      return null;
    }
    return (
      <div className="space-y-1 text-xs bg-gray-50 p-2 rounded border border-gray-200">
        <Text strong className="text-xs">Pricing Breakdown</Text>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <Text type="secondary" className="text-xs">Planned: {pricingBreakdown.plannedHours.toFixed(2)}h</Text>
          <Text type="secondary" className="text-xs">Package: {pricingBreakdown.usedFromPackage.toFixed(2)}h</Text>
          <Text type="secondary" className="text-xs">Chargeable: {pricingBreakdown.chargeableHours.toFixed(2)}h</Text>
          <Text type="secondary" className="text-xs">Rate: {formatCurrency(convertCurrency ? convertCurrency(baseHourlyRate, serviceCurrency, userCurrency) : baseHourlyRate, userCurrency)}</Text>
        </div>
      </div>
    );
  };

  const renderErrorBanner = () => (
    mutation.isError ? <Alert type="error" message="Could not create booking" showIcon /> : null
  );

  const stepValidators = [
    // Step 0: Service
    () => !!selectedService,
    // Step 1: Participant - group is always valid as it will show modal
    () => participantType === 'self' || participantType === 'group' || !!selectedFamilyId,
    // Step 2: Package - payment method must be selected
    () => !!paymentMethod && (paymentMethod !== 'package' || !!selectedPackageId),
    // Step 3: Instructor
    () => !!selectedInstructor,
    // Step 4: Schedule
    () => !!selectedDateString && !!selectedTime,
    // Step 5: Confirm
    () => {
      if (paymentMethod === 'wallet') {
        return roundedFinalAmount <= walletBalance;
      }
      if (paymentMethod === 'package') {
        return !!selectedPackageId;
      }
      if (isProcessorPayment) {
        return (
          processorInfo?.method === selectedProcessor
          && Boolean(processorInfo?.reference)
        );
      }
      return true;
    }
  ];

  const isStepValid = (stepIndex) => {
    const stepConfig = participantType === 'group' ? GROUP_STEP_CONFIG : STEP_CONFIG;
    const stepKey = stepConfig[stepIndex]?.key;
    
    switch (stepKey) {
      case 'participant':
        return participantType === 'self' || participantType === 'group' || !!selectedFamilyId;
      case 'group_participants':
        // At least one participant must be selected for group booking
        return selectedGroupParticipants.length > 0;
      case 'service':
        return !!selectedService;
      case 'package':
        return !!paymentMethod && (paymentMethod !== 'package' || !!selectedPackageId);
      case 'instructor':
        // Instructor is only required for lessons, not for rentals or accommodations
        return !isInstructorRequired || !!selectedInstructor;
      case 'schedule':
        // Schedule is only required for lessons and accommodations, not for rentals
        return !isScheduleRequired || (!!selectedDateString && !!selectedTime);
      case 'confirm':
        if (paymentMethod === 'wallet') {
          return roundedFinalAmount <= walletBalance;
        }
        if (paymentMethod === 'package') {
          return !!selectedPackageId;
        }
        if (isProcessorPayment) {
          return processorInfo?.method === selectedProcessor && Boolean(processorInfo?.reference);
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    const stepConfig = participantType === 'group' ? GROUP_STEP_CONFIG : STEP_CONFIG;
    if (currentStep >= stepConfig.length - 1) {
      return;
    }
    if (!isStepValid(currentStep)) {
      return;
    }
    
    let nextStep = currentStep + 1;
    
    // Skip instructor step if not required (rental/accommodation)
    if (!isInstructorRequired && stepConfig[nextStep]?.key === 'instructor') {
      nextStep++; // Skip instructor step
    }
    
    // Skip schedule step if not required (rental only)
    if (!isScheduleRequired && stepConfig[nextStep]?.key === 'schedule') {
      nextStep++; // Skip schedule step
    }
    
    setCurrentStep(Math.min(nextStep, stepConfig.length - 1));
  };

  const handleBack = () => {
    // If in buy packages mode, exit it first before going back
    if (showBuyPackages) {
      setShowBuyPackages(false);
      setSelectedBuyCategory(null);
      return;
    }
    
    // If on service step (step 0) and a category is selected, go back to category selection first
    if (currentStep === 0 && selectedServiceCategory) {
      setSelectedServiceCategory(null);
      setSelectedServiceId(null);
      setServiceSearch('');
      return;
    }
    
    let prevStep = currentStep - 1;
    const stepConfig = participantType === 'group' ? GROUP_STEP_CONFIG : STEP_CONFIG;
    
    // Skip schedule step if going back and it's not required (rental only)
    if (!isScheduleRequired && stepConfig[prevStep]?.key === 'schedule') {
      prevStep--; // Skip back over schedule step
    }
    
    // Skip instructor step if going back and it's not required (rental/accommodation)
    if (!isInstructorRequired && stepConfig[prevStep]?.key === 'instructor') {
      prevStep--; // Skip back over instructor step
    }
    
    setCurrentStep(Math.max(prevStep, 0));
  };

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await apiClient.post('/bookings', payload);
      return response.data;
    },
    onSuccess: async (data) => {
      message.success('Your booking request has been submitted.');
      
      // Check if user was upgraded from outsider to student
      if (data?.roleUpgrade?.upgraded) {
        message.info(data.roleUpgrade.message || 'You have been upgraded to a student account!', 5);
        // Refresh token to get new JWT with updated role
        await refreshToken();
        // Navigate to student dashboard after role upgrade
        navigate('/student/dashboard');
      }
      
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: ['student-portal', 'schedule'] }),
        queryClient.invalidateQueries({ predicate: ({ queryKey }) => Array.isArray(queryKey) && queryKey[0] === 'wallet' }),
        queryClient.invalidateQueries({ predicate: ({ queryKey }) => Array.isArray(queryKey) && queryKey[0] === 'notifications' })
      ]);
      onClose();
    }
  });

  const handleSubmit = async () => {
    // Validate required fields
    if (!studentId || !selectedService) {
      return;
    }
    
    // Only validate instructor if required (lessons)
    if (isInstructorRequired && !selectedInstructor) {
      return;
    }
    
    // Only validate schedule if required (lessons and accommodations)
    if (isScheduleRequired && (!selectedDateString || !selectedTime)) {
      return;
    }
    
    const stepConfig = participantType === 'group' ? GROUP_STEP_CONFIG : STEP_CONFIG;
    const finalStepIndex = stepConfig.length - 1;
    if (!isStepValid(finalStepIndex)) {
      return;
    }

    // Handle group booking
    if (participantType === 'group') {
      try {
        setCreatingGroupBooking(true);

        // Calculate end time
        const startMinutes = timeStringToMinutes(selectedTime);
        const endMinutes = startMinutes + selectedDurationMinutes;
        const endTimeString = minutesToTimeString(endMinutes);

        // Get price - try multiple sources
        let priceValue = 0;
        if (selectedService?.price && !isNaN(parseFloat(selectedService.price))) {
          priceValue = parseFloat(selectedService.price);
        } else if (selectedService?.price_per_session && !isNaN(parseFloat(selectedService.price_per_session))) {
          priceValue = parseFloat(selectedService.price_per_session);
        } else if (selectedService?.pricePerSession && !isNaN(parseFloat(selectedService.pricePerSession))) {
          priceValue = parseFloat(selectedService.pricePerSession);
        } else if (selectedService?.prices && selectedService.prices.length > 0) {
          const firstPrice = selectedService.prices[0];
          priceValue = parseFloat(firstPrice?.price || firstPrice?.amount || 0);
        } else if (roundedFinalAmount && !isNaN(parseFloat(roundedFinalAmount))) {
          priceValue = parseFloat(roundedFinalAmount);
        }

        // Build payload with participant IDs (registered users)
        const groupPayload = {
          serviceId: selectedService?.id,
          instructorId: selectedInstructor?.id || null, // Allow null for rentals/accommodations
          title: `Group ${selectedService?.name || 'Lesson'} Session`,
          description: notes || '',
          participantIds: selectedGroupParticipants, // Array of user IDs
          pricePerPerson: priceValue,
          currency: serviceCurrency || selectedService?.currency || 'EUR',
          scheduledDate: selectedDateString,
          startTime: selectedTime,
          endTime: endTimeString,
          durationHours: bookingDurationHours || 1,
          notes: combinedNotes || '',
          packageId: paymentMethod === 'package' ? selectedPackageId : null,
        };

        // Validate required fields before sending
        if (!groupPayload.serviceId) {
          throw new Error('Please select a service');
        }
        if (!groupPayload.participantIds || groupPayload.participantIds.length === 0) {
          throw new Error('Please select at least one participant');
        }
        if (groupPayload.pricePerPerson === null || groupPayload.pricePerPerson === undefined || isNaN(groupPayload.pricePerPerson)) {
          throw new Error('Invalid price per person');
        }
        if (!groupPayload.scheduledDate) {
          throw new Error('Please select a date');
        }
        if (!groupPayload.startTime) {
          throw new Error('Please select a time');
        }

        const response = await createGroupBooking(groupPayload);

        const groupId = response?.groupBooking?.id || response?.data?.groupBooking?.id;
        
        if (!groupId) {
          throw new Error('Group booking created but ID not returned');
        }

        message.success('Group booking created! Participants will be notified to accept.');
        
        Modal.success({
          title: '✅ Group Booking Created!',
          width: 600,
          okText: 'Close',
          content: (
            <div className="space-y-4 mt-4">
              <Alert
                type="success"
                showIcon
                message="Invitation notifications sent!"
                description={`${selectedGroupParticipants.length} participant(s) will receive notifications to accept or decline this group lesson.`}
              />
              
              <Alert
                type="info"
                showIcon
                message="Next Steps"
                description={
                  <div className="mt-2 space-y-1 text-xs">
                    <p>• All participants will receive a notification to accept or decline.</p>
                    <p>• Once <strong>all participants accept</strong>, the lesson will appear on the calendar for admin approval.</p>
                    <p>• You can track acceptance status in your Group Bookings section.</p>
                  </div>
                }
              />
            </div>
          ),
          onOk: () => {
            onClose();
          }
        });

        onClose();
      } catch (error) {
        console.error('Group booking error:', error);
        message.error(error.response?.data?.error || error.message || 'Failed to create group booking');
      } finally {
        setCreatingGroupBooking(false);
      }
      return;
    }

    // Handle regular booking (self/family)
    const isPackagePayment = paymentMethod === 'package';

    // For rentals without scheduling, use current date/time as defaults
    const bookingDate = isScheduleRequired ? selectedDateString : dayjs().format('YYYY-MM-DD');
    const bookingStartHour = isScheduleRequired ? startHourDecimal : 12; // Default to noon for instant rentals
    const bookingDuration = isScheduleRequired ? bookingDurationHours : 1; // Default 1 hour for instant rentals

    const payload = createBookingPayload({
      studentId,
      instructorId: selectedInstructor?.id || null, // Allow null for rentals/accommodations
      serviceId: selectedService.id,
      date: bookingDate,
      startHour: bookingStartHour,
      durationHours: bookingDuration,
      notes: combinedNotes,
      usePackage: isPackagePayment,
      dueAmount,
      participantType,
      familyMemberId: selectedFamilyId,
      packageId: packageIdToSend,
      baseAmount,
      packageHoursUsed,
      packageChargeableHours,
      isProcessorPayment,
      paymentMethod,
      selectedProcessor,
      processorInfo,
      currency: serviceCurrency,
    });

    await submitBooking({
      payload,
      mutation,
      messageApi: message,
    });
  };

  const renderParticipantStep = () => (
    <div className="space-y-2">
      <div>
        <Title level={5} className="mb-1 text-sm">Who is this lesson for?</Title>
        <Text type="secondary" className="text-xs">Select yourself, group, or a family member</Text>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-1 md:grid-cols-2">
        {/* 1. Myself */}
        <button
          onClick={() => handleParticipantSelect('self')}
          className={`p-2 border-2 rounded-lg transition-all duration-200 text-left hover:shadow-sm ${
            participantType === 'self'
              ? 'bg-sky-50 border-sky-500 shadow-sm'
              : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <Title level={5} className="mb-0.5 text-xs">Myself</Title>
              <Text type="secondary" className="text-xs">Your profile</Text>
            </div>
            {participantType === 'self' && (
              <div className="ml-1 flex-shrink-0 w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs">✓</div>
            )}
          </div>
        </button>

        {/* 2. Group */}
        <button
          onClick={() => handleParticipantSelect('group')}
          className={`p-2 border-2 rounded-lg transition-all duration-200 text-left hover:shadow-sm ${
            participantType === 'group'
              ? 'bg-sky-50 border-sky-500 shadow-sm'
              : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <Title level={5} className="mb-0.5 text-xs">Group</Title>
              <Text type="secondary" className="text-xs">Multiple participants</Text>
            </div>
            {participantType === 'group' && (
              <div className="ml-1 flex-shrink-0 w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs">✓</div>
            )}
          </div>
        </button>

        {/* 3. Family members */}
        {Array.isArray(familyMembers) && familyMembers.length > 0
          ? familyMembers.map((member) => {
            const isSelected = participantType === 'family' && selectedFamilyId === member.id;
            const age = computeAge(member.date_of_birth);
            return (
              <button
                key={member.id}
                onClick={() => handleParticipantSelect('family', member.id)}
                className={`p-2 border-2 rounded-lg transition-all duration-200 text-left hover:shadow-sm ${
                  isSelected
                    ? 'bg-sky-50 border-sky-500 shadow-sm'
                    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <Title level={5} className="mb-0.5 text-xs">{member.full_name}</Title>
                    <div className="flex flex-wrap gap-0.5">
                      {age !== null && <Tag className="text-xs">{age} years</Tag>}
                      {member.relationship && <Tag color="blue" className="text-xs">{member.relationship}</Tag>}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="ml-1 flex-shrink-0 w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs">✓</div>
                  )}
                </div>
              </button>
            );
          })
          : (
            <button
              onClick={() => setFamilyModalOpen(true)}
              className="p-2 border-2 border-dashed border-gray-300 rounded-lg transition-all duration-200 text-left hover:shadow-sm hover:bg-gray-50 hover:border-gray-400"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Title level={5} className="mb-0.5 text-xs">Family Member</Title>
                  <Text type="secondary" className="text-xs">Add one to continue</Text>
                </div>
                <div className="ml-1 flex-shrink-0 w-4 h-4 rounded-full border-2 border-gray-300 text-gray-400 flex items-center justify-center text-xs">+</div>
              </div>
            </button>
          )}
      </div>

      {Array.isArray(familyMembers) && familyMembers.length === 0 && (
        <Text type="secondary" className="text-xs text-center py-1">
          No family members.{' '}
          <Button 
            type="link" 
            size="small" 
            className="p-0 h-auto"
            onClick={() => setFamilyModalOpen(true)}
          >
            Add one
          </Button>{' '}
          to continue.
        </Text>
      )}

      {familyLoading && <Spin size="small" />}
    </div>
  );

  // Group Participants Step - Select from registered customers
  const renderGroupParticipantsStep = () => {
    const selectedCustomers = (registeredCustomers || []).filter(c => 
      selectedGroupParticipants.includes(c.id)
    );
    
    const availableCustomers = (registeredCustomers || []).filter(c => 
      !selectedGroupParticipants.includes(c.id)
    );

    const handleAddParticipant = (customerId) => {
      if (!selectedGroupParticipants.includes(customerId)) {
        setSelectedGroupParticipants([...selectedGroupParticipants, customerId]);
      }
    };

    const handleRemoveParticipant = (customerId) => {
      setSelectedGroupParticipants(selectedGroupParticipants.filter(id => id !== customerId));
    };

    return (
      <div className="space-y-4">
        <div>
          <Title level={5} className="mb-1">Select Group Participants</Title>
          <Text type="secondary">Choose registered customers to join this group lesson. Each participant will need to accept the invitation before the lesson is confirmed.</Text>
        </div>

        {/* Selected Participants */}
        {selectedGroupParticipants.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <Text strong className="text-green-700 block mb-2">
              Selected Participants ({selectedGroupParticipants.length})
            </Text>
            <div className="flex flex-wrap gap-2">
              {selectedCustomers.map(customer => (
                <Tag 
                  key={customer.id}
                  closable 
                  onClose={() => handleRemoveParticipant(customer.id)}
                  className="flex items-center gap-1 px-3 py-1"
                  color="green"
                >
                  <span>{customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email}</span>
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search customers by name or email..."
            value={participantSearchQuery}
            onChange={(e) => setParticipantSearchQuery(e.target.value)}
            allowClear
          />
        </div>

        {/* Customer List */}
        <div className="border rounded-lg max-h-64 overflow-y-auto">
          {customersLoading ? (
            <div className="p-4 text-center">
              <Spin size="small" />
              <Text type="secondary" className="ml-2">Loading customers...</Text>
            </div>
          ) : availableCustomers.length === 0 ? (
            <Empty 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                participantSearchQuery 
                  ? "No customers found matching your search" 
                  : "No available customers"
              }
              className="py-4"
            />
          ) : (
            <List
              dataSource={availableCustomers}
              renderItem={(customer) => (
                <List.Item
                  key={customer.id}
                  className="cursor-pointer hover:bg-blue-50 px-4 py-2 transition-colors"
                  onClick={() => handleAddParticipant(customer.id)}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <UserOutlined className="text-blue-600" />
                      </div>
                      <div>
                        <Text strong className="block">
                          {customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown'}
                        </Text>
                        <Text type="secondary" className="text-xs">{customer.email}</Text>
                      </div>
                    </div>
                    <Button type="link" size="small" icon={<PlusOutlined />}>
                      Add
                    </Button>
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>

        {/* Info Alert */}
        <Alert
          type="info"
          showIcon
          message="How Group Booking Works"
          description={
            <div className="space-y-1 mt-2 text-xs">
              <p>• Only your <strong>friends/connections</strong> can be invited to group lessons.</p>
              <p>• Selected participants will receive a notification to accept or decline.</p>
              <p>• The lesson will only appear on the calendar for approval once <strong>all participants accept</strong>.</p>
              <p>• Each participant must have a valid group package or be prepared to purchase one.</p>
            </div>
          }
        />

        {/* No friends warning */}
        {!customersLoading && registeredCustomers.length === 0 && (
          <Alert
            type="warning"
            showIcon
            message="No Friends Found"
            description={
              <div className="text-xs mt-1">
                <p className="mb-2">You need to connect with other students before inviting them to group lessons.</p>
                <Button 
                  type="primary" 
                  size="small"
                  onClick={() => navigate('/student/friends')}
                >
                  Manage Friends
                </Button>
              </div>
            }
          />
        )}

        {selectedGroupParticipants.length === 0 && registeredCustomers.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message="Please select at least one participant to continue"
          />
        )}
      </div>
    );
  };

  // Package/Payment Step - Let users choose payment method before selecting service
  const renderPackageStep = () => {
    // If in buy package mode, show the buy flow
    if (showBuyPackages) {
      const walletBal = normalizeNumeric(walletSummary?.available, 0);
      
      // Auto-select 'lesson' category since it's the only one
      if (!selectedBuyCategory) {
        setSelectedBuyCategory('lesson');
      }
      
      return (
        <div className="space-y-4">
          {/* Header with back button */}
          <div className="flex items-center gap-2">
            <Button
              type="text"
              size="small"
              icon={<span className="text-lg">←</span>}
              onClick={() => {
                setShowBuyPackages(false);
                setSelectedBuyCategory(null);
                setPurchasePaymentMethod('wallet');
                setPurchaseProcessor(null);
                try { purchaseProcessorForm.resetFields(); } catch { /* form may not be mounted */ }
              }}
            />
            <Title level={5} className="mb-0">Buy Lesson Packages</Title>
          </div>

          {/* Payment method for purchase */}
          <Card size="small" className="bg-gray-50">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Text strong className="text-sm">Payment Method</Text>
                    <Tag color="green">Balance: {formatCurrency(walletBal)}</Tag>
                  </div>
                  <Radio.Group
                    value={purchasePaymentMethod}
                    onChange={(e) => {
                      setPurchasePaymentMethod(e.target.value);
                      if (e.target.value !== 'external') {
                        setPurchaseProcessor(null);
                        try { purchaseProcessorForm.resetFields(); } catch { /* form may not be mounted */ }
                      }
                    }}
                    className="w-full"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Radio.Button value="wallet">💳 Wallet</Radio.Button>
                      <Radio.Button value="cash">💵 Cash</Radio.Button>
                      <Radio.Button value="external">🏦 Card/External</Radio.Button>
                    </div>
                  </Radio.Group>

                  {/* External payment details */}
                  {purchasePaymentMethod === 'external' && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <Text strong className="block mb-2 text-sm">External Payment Details</Text>
                      <div className="mb-2">
                        <Text className="block mb-1 text-xs">Payment Processor</Text>
                        <Radio.Group
                          value={purchaseProcessor}
                          onChange={(e) => setPurchaseProcessor(e.target.value)}
                          buttonStyle="solid"
                          size="small"
                        >
                          {PROCESSOR_OPTIONS.map((opt) => (
                            <Radio.Button key={opt.value} value={opt.value}>
                              {opt.label}
                            </Radio.Button>
                          ))}
                        </Radio.Group>
                      </div>
                      <Form form={purchaseProcessorForm} layout="vertical" size="small">
                        <Form.Item
                          name="reference"
                          label="Payment Reference"
                          rules={[{ required: true, message: 'Enter payment reference' }]}
                          className="mb-2"
                        >
                          <Input placeholder="Transaction ID" />
                        </Form.Item>
                        <Form.Item name="note" label="Note (Optional)" className="mb-0">
                          <Input placeholder="Any additional notes" />
                        </Form.Item>
                      </Form>
                    </div>
                  )}
                </div>
              </Card>

              {/* Available packages */}
              {purchasePackagesLoading ? (
                <div className="text-center py-8">
                  <Spin />
                  <Text type="secondary" className="block mt-2">Loading packages...</Text>
                </div>
              ) : (() => {
                // Filter packages to match the selected service (if any)
                const filteredPackages = selectedService 
                  ? availablePackagesForPurchase.filter(pkg => {
                      // Use the same matching logic as for owned packages, but mark forPurchase=true
                      const matches = matchesServicePackage(selectedService, pkg, true);
                      console.log('Package matching debug:', {
                        serviceName: selectedService.name,
                        serviceType: selectedService.service_type || selectedService.serviceType,
                        packageName: pkg.name,
                        packageLessonServiceName: pkg.lesson_service_name || pkg.lessonServiceName,
                        matches
                      });
                      return matches;
                    })
                  : availablePackagesForPurchase;

                if (filteredPackages.length === 0) {
                  return (
                    <div className="text-center py-6">
                      <Empty 
                        description={
                          selectedService 
                            ? `No packages available for "${selectedService.name}"`
                            : "No packages available in this category"
                        } 
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                      {selectedService && availablePackagesForPurchase.length > 0 && (
                        <Text type="secondary" className="text-xs mt-2 block">
                          {availablePackagesForPurchase.length} other package{availablePackagesForPurchase.length !== 1 ? 's' : ''} available for different lesson types
                        </Text>
                      )}
                    </div>
                  );
                }

                return (
                  <>
                    <div className="grid gap-3">
                      {filteredPackages.map((pkg) => {
                    const { price: pkgPrice, currency: pkgCurrency } = getPackagePriceInCurrency(pkg, customerCurrency);
                    // Convert to user's display currency
                    const displayPkgPrice = convertCurrency ? convertCurrency(pkgPrice, pkgCurrency, userCurrency) : pkgPrice;
                    // Show dual currency if different
                    const showDualPkgPrice = pkgCurrency !== userCurrency;
                    const pkgPriceDisplay = showDualPkgPrice 
                      ? `${formatCurrency(pkgPrice, pkgCurrency)} / ${formatCurrency(displayPkgPrice, userCurrency)}`
                      : formatCurrency(displayPkgPrice, userCurrency);
                    const canAffordWithWallet = walletBal >= pkgPrice;
                    const isLoading = purchaseMutation.isPending;
                    
                    return (
                      <Card key={pkg.id} size="small" className="border-gray-200 hover:border-sky-300 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <Title level={5} className="mb-0 text-sm">{pkg.name}</Title>
                            <Text type="secondary" className="text-xs block">{pkg.lessonServiceName}</Text>
                            <div className="flex items-center gap-2 mt-2">
                              <Tag color="blue">{pkg.totalHours}h</Tag>
                              {pkg.sessionsCount && <Tag>{pkg.sessionsCount} sessions</Tag>}
                            </div>
                          </div>
                          <div className="text-right">
                            <Title level={4} className="mb-1 text-sky-600">
                              {pkgPriceDisplay}
                            </Title>
                            <Button
                              type="primary"
                              size="small"
                              loading={isLoading}
                              disabled={purchasePaymentMethod === 'wallet' && !canAffordWithWallet}
                              onClick={() => handlePurchasePackage(pkg)}
                            >
                              {purchasePaymentMethod === 'wallet' && !canAffordWithWallet ? 'Insufficient' : 'Buy Now'}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                    </div>
                  </>
                );
              })()}
        </div>
      );
    }

    // Normal package step view
    // Filter packages to show only those matching the selected service
    const displayPackages = selectedService ? matchingPackages : packagesWithBalance;
    const hasMatchingPackages = displayPackages.length > 0;

    return (
      <div className="space-y-4">
        {/* Show currently owned packages (filtered by service) */}
        {hasMatchingPackages ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Title level={5} className="mb-0.5 text-sm">Your Package Hours</Title>
                <Text type="secondary" className="text-xs">
                  {selectedService 
                    ? `Packages matching "${selectedService.name}"`
                    : 'Use pre-purchased lesson hours for your booking'
                  }
                </Text>
              </div>
            </div>
            <div className="grid gap-2">
              {displayPackages.slice(0, 3).map((pkg) => (
                <Card 
                  key={pkg.id} 
                  size="small" 
                  className={`cursor-pointer transition-all duration-200 ${
                    paymentMethod === 'package' && selectedPackageId === pkg.id
                      ? 'border-sky-500 bg-sky-50 shadow-sm'
                      : 'border-gray-200 hover:border-sky-300 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setPaymentMethod('package');
                    setSelectedPackageId(pkg.id);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Text strong className="text-sm">{getPackageDisplayName(pkg)}</Text>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Tag color="green" className="text-xs">
                          {Number(pkg.remainingHours).toFixed(1)}h remaining
                        </Tag>
                      </div>
                    </div>
                    {paymentMethod === 'package' && selectedPackageId === pkg.id && (
                      <div className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs">✓</div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
            {displayPackages.length > 3 && (
              <Text type="secondary" className="text-xs">
                +{displayPackages.length - 3} more packages available
              </Text>
            )}
          </div>
        ) : null}

        {/* Buy More Packages - Optional section (always shown) */}
        <Card size="small" className="bg-gradient-to-r from-blue-50 to-sky-50 border-blue-200">
          <div className="py-2">
            <div className="flex items-start gap-3">
              <div className="text-2xl">💡</div>
              <div className="flex-1">
                <Title level={5} className="mb-1 text-sm">
                  {hasMatchingPackages ? 'Buy More Packages (Optional)' : 'Save with Packages (Optional)'}
                </Title>
                <Text type="secondary" className="text-xs block mb-2">
                  {selectedService 
                    ? `Buy packages for "${selectedService.name}" to save money on multiple lessons.`
                    : 'You can book individual lessons now, or buy a package to save money on multiple lessons.'
                  }
                </Text>
                <Button 
                  type="link"
                  size="small"
                  className="px-0"
                  onClick={() => setShowBuyPackages(true)}
                >
                  {hasMatchingPackages ? 'Buy More Packages →' : 'View Packages →'}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Note about continuing without packages */}
        {!hasMatchingPackages && (
          <Alert
            type="info"
            showIcon
            message="You can continue booking without a package"
            description="Individual lesson payment will be processed at the next steps."
            className="text-xs"
          />
        )}
      </div>
    );
  };

  const filteredServices = useMemo(() => {
    const q = (serviceSearch || '').trim().toLowerCase();
    if (!q) return availableServices;
    return availableServices.filter((service) => {
      const name = (service?.name || '').toLowerCase();
      const category = (service?.category || '').toLowerCase();
      const description = (service?.description || '').toLowerCase();
      const discipline = (service?.disciplineTag || '').toLowerCase();
      return (
        name.includes(q)
        || category.includes(q)
        || description.includes(q)
        || discipline.includes(q)
      );
    });
  }, [availableServices, serviceSearch]);

  const filteredInstructors = useMemo(() => {
    const q = (instructorSearch || '').trim().toLowerCase();
    if (!q) return instructorsData;
    return instructorsData.filter((instructor) => {
      const name = (instructor?.name || `${instructor?.first_name || ''} ${instructor?.last_name || ''}`.trim()).toLowerCase();
      const email = (instructor?.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [instructorsData, instructorSearch]);

  const renderServiceStep = () => (
    <div className="space-y-3">
      {/* Service Category Selection - Show first if no category selected */}
      {!selectedServiceCategory ? (
        <>
          <div>
            <Title level={5} className="mb-1">What would you like to book?</Title>
            <Text type="secondary" className="text-sm">Choose a category to see available options</Text>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {SERVICE_CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                onClick={() => {
                  setSelectedServiceCategory(cat.key);
                  setSelectedServiceId(null);
                  setServiceSearch('');
                }}
                className="p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md hover:border-sky-400 border-gray-200 bg-white hover:bg-sky-50"
              >
                <div className="flex items-center gap-4">
                  <div className="text-3xl">{cat.icon}</div>
                  <div className="flex-1">
                    <Title level={5} className="mb-0 text-base">{cat.label}</Title>
                    <Text type="secondary" className="text-xs">{cat.description}</Text>
                  </div>
                  <div className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-sky-500 hover:text-white transition-colors">
                    Select
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Service Selection Header with back button */}
          <div className="flex items-center gap-2 mb-2">
            <Button
              type="text"
              size="small"
              icon={<span className="text-lg">←</span>}
              onClick={() => {
                setSelectedServiceCategory(null);
                setSelectedServiceId(null);
                setServiceSearch('');
              }}
              className="px-2"
            />
            <div className="flex-1">
              <Title level={5} className="mb-0">
                {SERVICE_CATEGORIES.find(c => c.key === selectedServiceCategory)?.icon}{' '}
                {SERVICE_CATEGORIES.find(c => c.key === selectedServiceCategory)?.label}
              </Title>
              <Text type="secondary" className="text-xs">Select a service from this category</Text>
            </div>
          </div>

          {/* Package Filter Notice */}
          {paymentMethod === 'package' && selectedPackageId && (
            <Alert
              type="info"
              showIcon
              className="text-xs"
              message={
                <span>
                  Showing services compatible with your selected package: <strong>{selectedPackage ? getPackageDisplayName(selectedPackage) : 'Package'}</strong>
                </span>
              }
            />
          )}

          {/* Search Bar */}
          <div>
            <Input
              prefix={<svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
              placeholder="Search services..."
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              size="small"
              allowClear
              className="mb-2"
            />
            {filteredServices.length > 0 && (
              <Text type="secondary" className="text-xs">
                Found {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''}
              </Text>
            )}
          </div>

          {/* Services List */}
          {servicesLoading ? (
            <Spin size="small" />
          ) : availableServices.length === 0 ? (
            <Empty 
              description={`No ${SERVICE_CATEGORIES.find(c => c.key === selectedServiceCategory)?.label.toLowerCase() || 'services'} available`}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="link" size="small" onClick={() => setSelectedServiceCategory(null)}>
                ← Back to categories
              </Button>
            </Empty>
          ) : filteredServices.length === 0 ? (
            <Empty
              description="No matching services"
              style={{ marginTop: 24, marginBottom: 24 }}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" size="small" onClick={() => setServiceSearch('')}>
                Clear Search
              </Button>
            </Empty>
          ) : (
            <div className="space-y-2 pr-1 max-h-[300px] overflow-y-auto">
              {filteredServices.map((service) => {
                const isSelected = selectedServiceId === service.id;
                // Convert service price to user's preferred currency for display
                const rawPrice = normalizeNumeric(service.price, 0);
                const baseCurr = service.currency || businessCurrency || 'EUR';
                const displayPrice = convertCurrency ? convertCurrency(rawPrice, baseCurr, userCurrency) : rawPrice;
                // Show dual currency if different
                const showDual = baseCurr !== userCurrency;
                const priceDisplay = showDual 
                  ? `${formatCurrency(rawPrice, baseCurr)} / ${formatCurrency(displayPrice, userCurrency)}`
                  : formatCurrency(displayPrice, userCurrency);
                const durationLabel = formatDurationLabel(normalizeNumeric(service.duration, 1) * 60);
                const category = service.category || service.disciplineTag || 'Service';

                return (
                  <div
                    key={service.id}
                    onClick={() => handleServiceSelect(service.id)}
                    className={`p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-sm ${
                      isSelected
                        ? 'bg-sky-50 border-sky-500 shadow-sm'
                        : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <Title level={5} className="mb-1 text-sm">{service.name}</Title>
                        {service.description && (
                          <Text type="secondary" className="text-xs mb-2 block">{service.description}</Text>
                        )}
                        <div className="flex flex-wrap gap-1">
                          <Tag color="blue" className="text-xs">{durationLabel}</Tag>
                          <Tag color="cyan" className="text-xs">{category}</Tag>
                          <Tag className="text-xs font-semibold">{priceDisplay}</Tag>
                        </div>
                      </div>
                      <div
                        className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-semibold ${
                          isSelected ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {isSelected ? '✓' : 'Select'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Matching Packages Info */}
          {selectedServiceId && matchingPackages.length > 0 && (
            <Alert
              type="success"
              showIcon
              message="Compatible Packages"
              description={`${matchingPackages.length} package${matchingPackages.length !== 1 ? 's' : ''} match this service`}
              className="mb-0 text-xs"
            />
          )}
        </>
      )}
    </div>
  );

  const renderInstructorStep = () => (
    <div className="space-y-3">
      <div>
        <Title level={5} className="mb-1">Who will teach you?</Title>
        <Text type="secondary" className="text-sm">Choose your preferred instructor for this lesson</Text>
      </div>

      {/* Search Bar */}
      <div>
        <Input
          prefix={<svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
          placeholder="Search by name or email..."
          value={instructorSearch}
          onChange={(e) => setInstructorSearch(e.target.value)}
          size="small"
          allowClear
          className="mb-2"
        />
        {filteredInstructors.length > 0 && (
          <Text type="secondary" className="text-xs">
            Found {filteredInstructors.length} instructor{filteredInstructors.length !== 1 ? 's' : ''}
          </Text>
        )}
      </div>

      {/* Instructors List */}
      {instructorsLoading ? (
        <Spin size="small" />
      ) : instructorsData.length === 0 ? (
        <Empty description="No instructors available" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : filteredInstructors.length === 0 ? (
        <Empty
          description="No matching instructors"
          style={{ marginTop: 24, marginBottom: 24 }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" size="small" onClick={() => setInstructorSearch('')}>
            Clear Search
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 pr-1">
          {filteredInstructors.map((instructor) => {
            const isSelected = selectedInstructorId === instructor.id;
            const displayName = instructor.name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim();

            return (
              <button
                key={instructor.id}
                onClick={() => handleInstructorSelect(instructor.id)}
                className={`p-3 border-2 rounded-lg transition-all duration-200 text-left hover:shadow-sm ${
                  isSelected
                    ? 'bg-sky-50 border-sky-500 shadow-sm'
                    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <Title level={5} className="mb-1 text-sm">{displayName}</Title>
                    {instructor.email && (
                      <Text type="secondary" className="text-xs block mb-1 truncate">{instructor.email}</Text>
                    )}
                    {instructor.specialization && (
                      <Tag color="blue" className="text-xs">{instructor.specialization}</Tag>
                    )}
                  </div>
                  {isSelected && (
                    <div className="ml-1 flex-shrink-0 w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs">✓</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderCalendarGrid = (calendarMonth, calendarDays, today) => {
    return (
      <div className="border border-gray-200 rounded-lg p-2 bg-white">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-gray-600 h-6 flex items-center justify-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const isSelected = selectedDate && day.isSame(selectedDate, 'day');
            const isCurrentMonth = day.isSame(calendarMonth, 'month');
            const isDisabled = day.isBefore(today.startOf('day'));

            return (
              <button
                key={day.format('YYYY-MM-DD')}
                onClick={() => {
                  if (!isDisabled) {
                    setSelectedDate(day);
                    setScheduleStep(3);
                  }
                }}
                disabled={isDisabled}
                className={`h-7 text-xs font-medium rounded transition-colors duration-200 ${
                  isSelected
                    ? 'bg-sky-500 text-white'
                    : isCurrentMonth
                      ? isDisabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'border border-gray-200 hover:bg-sky-50'
                      : 'text-gray-300'
                }`}
              >
                {day.date()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderScheduleStep = () => {
    const today = dayjs();
    const calendarMonth = selectedDate?.startOf('month') || today.startOf('month');
    const calendarDays = [];
    const startDay = calendarMonth.startOf('week');
    for (let i = 0; i < 42; i++) {
      calendarDays.push(startDay.add(i, 'day'));
    }

    const durationSelected = Boolean(selectedDurationMinutes);
    const dateSelected = Boolean(selectedDateString);

    return (
      <div className="space-y-3">
        {renderDurationStep()}
        {renderDateStep(durationSelected, dateSelected, calendarMonth, calendarDays, today)}
        {renderTimeStep(dateSelected)}
      </div>
    );
  };

  const renderDurationStep = () => (
    <div>
      <button
        onClick={() => setScheduleStep(1)}
        className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Title level={5} className="mb-0">Step 1: Select Duration</Title>
        <span className={`text-sm font-medium ${scheduleStep === 1 ? 'text-sky-500' : 'text-gray-400'}`}>
          {scheduleStep === 1 ? '▼' : '▶'}
        </span>
      </button>

      {scheduleStep === 1 && (
        <div className="mt-2 p-3 bg-sky-50 border border-sky-200 rounded-lg">
          <div className="grid gap-1 grid-cols-4 sm:grid-cols-5 md:grid-cols-6">
            {durationOptions.map((minutes) => (
              <button
                key={minutes}
                onClick={() => {
                  setSelectedDurationMinutes(minutes);
                  setScheduleStep(2);
                }}
                className={`px-2 py-1 border-2 rounded text-xs font-medium transition-all duration-200 ${
                  selectedDurationMinutes === minutes
                    ? 'bg-sky-500 text-white border-sky-500'
                    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                {formatDurationLabel(minutes)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderDateStep = (durationSelected, dateSelected, calendarMonth, calendarDays, today) => (
    <div>
      <button
        onClick={() => durationSelected && setScheduleStep(2)}
        disabled={!durationSelected}
        className={`w-full flex items-center justify-between p-3 border rounded-lg transition-colors ${
          durationSelected
            ? 'border-gray-200 hover:bg-gray-50 cursor-pointer'
            : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
        }`}
      >
        <Title level={5} className="mb-0">Step 2: Select Date</Title>
        <span className={`text-sm font-medium ${scheduleStep === 2 ? 'text-sky-500' : 'text-gray-400'}`}>
          {scheduleStep === 2 ? '▼' : '▶'}
        </span>
      </button>

      {scheduleStep === 2 && durationSelected && (
        <div className="mt-2 p-3 bg-sky-50 border border-sky-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedDate((selectedDate || today).subtract(1, 'month'))}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              ← Prev
            </button>
            <span className="text-xs font-medium px-2">
              {calendarMonth.format('MMM YYYY')}
            </span>
            <button
              onClick={() => setSelectedDate((selectedDate || today).add(1, 'month'))}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
          {renderCalendarGrid(calendarMonth, calendarDays, today)}
        </div>
      )}
    </div>
  );

  const renderTimeStep = (dateSelected) => (
    <div>
      <button
        onClick={() => dateSelected && setScheduleStep(3)}
        disabled={!dateSelected}
        className={`w-full flex items-center justify-between p-3 border rounded-lg transition-colors ${
          dateSelected
            ? 'border-gray-200 hover:bg-gray-50 cursor-pointer'
            : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
        }`}
      >
        <Title level={5} className="mb-0">Step 3: Select Time</Title>
        <span className={`text-sm font-medium ${scheduleStep === 3 ? 'text-sky-500' : 'text-gray-400'}`}>
          {scheduleStep === 3 ? '▼' : '▶'}
        </span>
      </button>

      {scheduleStep === 3 && dateSelected && (
        <div className="mt-2 p-3 bg-sky-50 border border-sky-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Text type="secondary" className="text-xs">
              {selectedDate?.format('MMM D, YYYY')}
            </Text>
            {availabilityLoading && <Spin size="small" />}
          </div>

          {availabilityLoading ? (
            <div className="flex justify-center py-4">
              <Spin size="small" />
            </div>
          ) : availableStarts.length === 0 ? (
            <Empty description="No slots available" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="grid gap-1 grid-cols-4 sm:grid-cols-5 md:grid-cols-6 pr-1">
              {availableStarts.map((slot) => (
                <button
                  key={slot.value}
                  onClick={() => setSelectedTime(slot.value)}
                  className={`px-2 py-1 border-2 rounded text-xs font-medium transition-all duration-200 ${
                    selectedTime === slot.value
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  {slot.value}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderConfirmStep = () => (
    <div className="space-y-3">
      {/* Booking Details - Compact 2-column layout */}
      {renderBookingOverview()}

      {/* Payment Summary */}
      {renderPaymentSummary()}

      {/* Promo Code Input */}
      {paymentMethod !== 'package' && (
        <div className="space-y-2">
          <Title level={5} className="mb-2">Have a Promo Code?</Title>
          <PromoCodeInput
            context="lessons"
            amount={finalAmount}
            currency={customerCurrency}
            serviceId={selectedServiceId}
            appliedVoucher={appliedVoucher}
            onValidCode={(voucherData) => setAppliedVoucher(voucherData)}
            onClear={() => setAppliedVoucher(null)}
            disabled={mutation.isLoading}
          />
        </div>
      )}

      {/* Additional Notes - Optional/Collapsible */}
      {renderNotesSection()}

      {/* Pricing Breakdown - Only if package payment */}
      {paymentMethod === 'package' && renderPricingDetails()}

      {/* Error Banner */}
      {renderErrorBanner()}
    </div>
  );

  const renderStepContent = () => {
    const stepConfig = participantType === 'group' ? GROUP_STEP_CONFIG : STEP_CONFIG;
    const stepKey = stepConfig[currentStep]?.key;
    
    switch (stepKey) {
      case 'participant':
        return renderParticipantStep();
      case 'group_participants':
        return renderGroupParticipantsStep();
      case 'service':
        return renderServiceStep();
      case 'package':
        return renderPackageStep();
      case 'instructor':
        // Skip rendering if instructor not required
        if (!isInstructorRequired) {
          return null;
        }
        return renderInstructorStep();
      case 'schedule':
        // Skip rendering if schedule not required
        if (!isScheduleRequired) {
          return null;
        }
        return renderScheduleStep();
      case 'confirm':
        return renderConfirmStep();
      default:
        return null;
    }
  };

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <Button onClick={onClose} disabled={mutation.isLoading || creatingGroupBooking}>
        Cancel
      </Button>
      <div className="flex items-center gap-3">
        {currentStep > 0 && (
          <Button onClick={handleBack} disabled={mutation.isLoading || creatingGroupBooking}>
            ← Back
          </Button>
        )}
        {currentStep < (participantType === 'group' ? GROUP_STEP_CONFIG.length - 1 : STEP_CONFIG.length - 1) ? (
          <Button 
            type="primary" 
            onClick={handleNext} 
            disabled={!isStepValid(currentStep) || mutation.isLoading || creatingGroupBooking}
          >
            Next →
          </Button>
        ) : participantType === 'group' ? (
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={creatingGroupBooking}
            disabled={!isStepValid(currentStep) || creatingGroupBooking}
          >
            Create Group Booking
          </Button>
        ) : (
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={mutation.isLoading}
            disabled={!isStepValid(5) || mutation.isLoading}
          >
            Confirm Booking
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        onCancel={() => {
          if (!mutation.isLoading) {
            onClose();
          }
        }}
        title="Book a service"
        width={Math.min(600, window.innerWidth - 32)}
        footer={footer}
        destroyOnHidden
        maskClosable={!mutation.isLoading}
        styles={{ body: { padding: '0px', display: 'flex', flexDirection: 'column' } }}
      >
        <div className="flex-shrink-0 overflow-hidden border-b px-4 pt-4 pb-3">
          <StepNavigator 
            currentStep={currentStep} 
            participantType={participantType}
            selectedService={selectedService}
            isInstructorRequired={isInstructorRequired}
            isScheduleRequired={isScheduleRequired}
          />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
          {renderStepContent()}
        </div>
      </Modal>

      <Modal
        open={processorModalVisible}
        onCancel={handleProcessorModalCancel}
        onOk={handleProcessorModalOk}
        okText="Save details"
        cancelButtonProps={{ disabled: mutation.isLoading }}
        okButtonProps={{ type: 'primary' }}
        maskClosable={false}
        title={processorModalLabel ? `Confirm ${processorModalLabel} payment` : 'Confirm external payment'}
        destroyOnHidden
        width={500}
      >
        <Form form={processorForm} layout="vertical" size="small">
          <Form.Item
            name="reference"
            label="Transaction reference"
            rules={[{ required: true, message: 'Reference is required to track the payment.' }]}
          >
            <Input placeholder="receipt number or payment ID" autoComplete="off" size="small" />
          </Form.Item>
          <Form.Item name="note" label="Notes">
            <Input.TextArea rows={2} placeholder="Optional additional details" size="small" />
          </Form.Item>
        </Form>
        <Alert
          type="info"
          showIcon
          className="mt-3 text-xs"
          message={`Amount due: ${formattedFinalAmount}`}
          description="We will attach this reference to your booking so the team can reconcile the payment quickly."
        />
      </Modal>

      {/* Family Member Modal - for adding family members inline */}
      {familyModalOpen && (
        <FamilyMemberModal
          open={familyModalOpen}
          member={null}
          onSubmit={handleAddFamilyMember}
          onCancel={() => setFamilyModalOpen(false)}
          submitting={familyModalSubmitting}
        />
      )}

      {/* Accommodation Date Selection Modal */}
      <Modal
        open={!!accommodationDateModal}
        title={
          <div className="flex items-center gap-2">
            <CalendarOutlined className="text-orange-500" />
            <span>Select Stay Dates</span>
          </div>
        }
        onCancel={() => {
          setAccommodationDateModal(null);
          setAccommodationDates({ checkIn: null, checkOut: null });
        }}
        okText="Continue to Purchase"
        cancelText="Cancel"
        okButtonProps={{
          disabled: !accommodationDates.checkIn || !accommodationDates.checkOut
        }}
        onOk={() => {
          if (!accommodationDates.checkIn || !accommodationDates.checkOut) {
            notification.error({
              message: 'Select Dates',
              description: 'Please select both check-in and check-out dates.'
            });
            return;
          }
          const pkg = accommodationDateModal;
          setAccommodationDateModal(null);
          handlePurchasePackage(pkg, accommodationDates);
        }}
      >
        {accommodationDateModal && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg">
              <Title level={5} className="!mb-1">{accommodationDateModal.name}</Title>
              <Text type="secondary">{accommodationDateModal.lessonServiceName || accommodationDateModal.lesson_service_name}</Text>
              {accommodationDateModal.accommodationNights > 0 && (
                <div className="mt-2">
                  <Tag color="orange">Includes {accommodationDateModal.accommodationNights} nights accommodation</Tag>
                </div>
              )}
            </div>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <Text type="secondary" className="block mb-3 text-sm">
                {accommodationDateModal.accommodationNights > 0 
                  ? `This package includes ${accommodationDateModal.accommodationNights} nights of accommodation`
                  : 'Select your check-in and check-out dates'}
              </Text>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Text className="text-xs text-gray-500 block mb-1">Check-in</Text>
                  <DatePicker
                    value={accommodationDates.checkIn}
                    onChange={(date) => setAccommodationDates(prev => ({ ...prev, checkIn: date }))}
                    placeholder="Check-in date"
                    className="w-full"
                    disabledDate={(current) => current && current < dayjs().startOf('day')}
                    format="DD MMM YYYY"
                  />
                </div>
                <div>
                  <Text className="text-xs text-gray-500 block mb-1">Check-out</Text>
                  <DatePicker
                    value={accommodationDates.checkOut}
                    onChange={(date) => setAccommodationDates(prev => ({ ...prev, checkOut: date }))}
                    placeholder="Check-out date"
                    className="w-full"
                    disabledDate={(current) => {
                      if (!accommodationDates.checkIn) return current && current < dayjs().startOf('day');
                      return current && current <= accommodationDates.checkIn;
                    }}
                    format="DD MMM YYYY"
                  />
                </div>
              </div>
              {accommodationDates.checkIn && accommodationDates.checkOut && (
                <div className="mt-3 text-center">
                  <Tag color="orange" className="text-sm">
                    {accommodationDates.checkOut.diff(accommodationDates.checkIn, 'day')} night{accommodationDates.checkOut.diff(accommodationDates.checkIn, 'day') > 1 ? 's' : ''}
                  </Tag>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

StudentBookingWizard.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  initialData: PropTypes.shape({
    step: PropTypes.number,
    serviceId: PropTypes.string,
    instructorId: PropTypes.string,
    familyMemberId: PropTypes.string,
    date: PropTypes.string,
    time: PropTypes.string,
    paymentMethod: PropTypes.oneOf(['wallet', 'package', 'pay_later']),
    packageId: PropTypes.string,
    notes: PropTypes.string,
    durationMinutes: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    durationHours: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    preferredCategory: PropTypes.string,
  }),
};

export default StudentBookingWizard;

const StepNavigator = ({ currentStep, participantType, selectedService, isInstructorRequired, isScheduleRequired }) => {
  const stepConfig = participantType === 'group' ? GROUP_STEP_CONFIG : STEP_CONFIG;
  
  // Filter out steps that aren't needed based on service type
  const visibleSteps = stepConfig.filter(step => {
    // Always show these steps
    if (step.key === 'service' || step.key === 'participant' || step.key === 'package' || step.key === 'confirm' || step.key === 'group_participants') {
      return true;
    }
    // Only show instructor step if required (lessons only)
    if (step.key === 'instructor') {
      return isInstructorRequired;
    }
    // Only show schedule step if required (lessons and accommodations)
    if (step.key === 'schedule') {
      return isScheduleRequired;
    }
    return true;
  });
  
  // Map current step index to visible step index
  const currentStepKey = stepConfig[currentStep]?.key;
  const visibleCurrentIndex = visibleSteps.findIndex(s => s.key === currentStepKey);
  const displayCurrentStep = visibleCurrentIndex >= 0 ? visibleCurrentIndex : 0;
  
  return (
    <nav className="mb-3 overflow-x-auto">
      <ol className="flex min-w-full items-center gap-2 sm:gap-3">
        {visibleSteps.map((step, index) => {
          const isCurrent = index === displayCurrentStep;
          const isCompleted = index < displayCurrentStep;
          const circleBase = 'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-200';
          const labelBase = 'text-xs font-medium uppercase tracking-tight whitespace-nowrap hidden sm:inline';
          const circleClasses = isCurrent
            ? 'border-sky-500 bg-sky-500 text-white shadow'
            : isCompleted
              ? 'border-sky-400 bg-sky-50 text-sky-600'
              : 'border-slate-200 bg-white text-slate-400';
          const labelClasses = isCurrent
            ? 'text-slate-900'
            : isCompleted
              ? 'text-slate-600'
              : 'text-slate-400';

          return (
            <li key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-1 sm:gap-2">
                <span className={`${circleBase} ${circleClasses}`} aria-hidden>
                  {isCompleted ? '✓' : index + 1}
                </span>
                <span className={`${labelBase} ${labelClasses}`}>{step.title}</span>
              </div>
              {index < visibleSteps.length - 1 ? (
                <span
                  className={`ml-1 sm:ml-2 h-px flex-1 rounded ${isCompleted ? 'bg-sky-200' : 'bg-slate-200'}`}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
