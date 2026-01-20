// src/pages/CustomerProfilePage.jsx - Updated
/* eslint-disable no-console, complexity */
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Card, Spin, Alert, Typography, Button, Tabs, Tag, 
  Avatar, Row, Col, Space, Tooltip, Empty,
  Form, Input, Select, Divider, InputNumber, Modal,
  Checkbox, List, Radio, Switch
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  UserOutlined, ArrowLeftOutlined, EditOutlined, 
  CalendarOutlined, ShoppingOutlined, ClockCircleOutlined,
  PlusCircleOutlined, MinusCircleOutlined, DollarOutlined,
  GiftOutlined, PlusOutlined, CreditCardOutlined, AppstoreOutlined,
  MailOutlined, PhoneOutlined, HomeOutlined, LineChartOutlined,
  BookOutlined, DeleteOutlined,
  FieldTimeOutlined,
  DashboardOutlined,
  CrownOutlined
} from '@ant-design/icons';
import DataService from '@/shared/services/dataService';
import FinancialService from '../../finances/services/financialService';
import requestThrottle from '@/shared/utils/requestThrottle';
const CustomerPackageManager = lazy(() => import('../components/CustomerPackageManager'));
const StepBookingModal = lazy(() => import('../../bookings/components/components/StepBookingModal'));
const BookingDetailModal = lazy(() => import('../components/BookingDetailModal'));
const RentalDetailModal = lazy(() => import('../components/RentalDetailModal'));
const TransactionDetailModal = lazy(() => import('../components/TransactionDetailModal'));
const MemberPurchasesSection = lazy(() => import('../../members/components/MemberPurchasesSection'));
import UserForm from '@/shared/components/ui/UserForm';
import { CalendarProvider } from '../../bookings/components/contexts/CalendarContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import FloatingActionLauncher from '@/shared/components/FloatingActionLauncher';

import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import {
  TransactionMobileCard,
  BookingMobileCard,
  RentalMobileCard,
  ActivityMobileCard
} from '@/components/ui/MobileCardRenderers';

const { Text } = Typography;
const { Option } = Select;

const PACKAGE_STRATEGY_SET = new Set(['delete-all-lessons', 'charge-used']);
const PACKAGE_DEFAULT_STRATEGY = 'delete-all-lessons';

const coerceNumber = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return fallback;
};

const formatHoursValue = (value) => {
  if (!Number.isFinite(value)) {
    return '0h';
  }
  const safeValue = Math.max(0, value);
  return `${Number.isInteger(safeValue) ? safeValue : safeValue.toFixed(1)}h`;
};

const extractPackageUsage = (pkg = {}) => {
  const usage = pkg.usageSummary || {};
  const totalHours = coerceNumber(
    pkg.totalHours ?? pkg.total_hours ?? usage.totalHours ?? usage.total_hours,
    0
  );
  const usedHours = coerceNumber(
    pkg.usedHours ?? pkg.used_hours ?? usage.usedHours ?? usage.used_hours,
    0
  );
  const rawRemaining = pkg.remainingHours ?? pkg.remaining_hours ?? usage.remainingHours ?? usage.remaining_hours;
  const remainingHours = coerceNumber(rawRemaining, Math.max(0, totalHours - usedHours));
  const purchasePrice = coerceNumber(
    pkg.purchasePrice ?? pkg.purchase_price ?? usage.purchasePrice ?? usage.purchase_price,
    0
  );
  const pricePerHour = coerceNumber(
    usage.pricePerHour ?? usage.price_per_hour,
    totalHours > 0 ? purchasePrice / totalHours : 0
  );
  const usedAmount = coerceNumber(usage.usedAmount ?? usage.used_amount, usedHours * pricePerHour);
  const remainingAmount = coerceNumber(
    usage.remainingAmount ?? usage.remaining_amount,
    remainingHours * pricePerHour
  );

  return {
    totalHours,
    usedHours,
    remainingHours,
    purchasePrice,
    pricePerHour,
    usedAmount,
    remainingAmount
  };
};

const resolveDefaultPackageStrategy = (pkg) => {
  const usage = extractPackageUsage(pkg);
  return usage.usedHours > 0 ? 'charge-used' : PACKAGE_DEFAULT_STRATEGY;
};

function CustomerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { state: locationState, pathname } = location;
  const openModalTarget = locationState?.openModal;
  const { user: currentUser } = useAuth();
  const { formatCurrency, getCurrencySymbol, businessCurrency, convertCurrency, userCurrency } = useCurrency();

  const [customer, setCustomer] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  
  // Check if current user is staff (admin/manager/instructor/developer)
  // Staff members see everything in EUR (base currency) for consistency
  const isStaffViewing = useMemo(() => {
    const staffRoles = ['admin', 'manager', 'developer', 'instructor'];
    return currentUser && staffRoles.includes(currentUser.role?.toLowerCase());
  }, [currentUser]);
  
  // IMPORTANT: All financial data in the database is stored in EUR (base currency)
  // The "source currency" is always EUR regardless of customer's preferred currency
  const storageCurrency = businessCurrency || 'EUR'; // Base currency = EUR
  
  // Customer's preferred display currency (only used when customer views their own data)
  const customerPreferredCurrency = useMemo(() => {
    return customer?.preferred_currency || businessCurrency || 'EUR';
  }, [customer?.preferred_currency, businessCurrency]);

  // Display currency: Staff sees EUR, customers see their preferred currency
  const displayCurrency = useMemo(() => {
    if (isStaffViewing) {
      return storageCurrency; // Staff always see EUR (how data is stored)
    }
    return customerPreferredCurrency; // Customers see their preferred currency
  }, [isStaffViewing, storageCurrency, customerPreferredCurrency]);

  // For admin, we can show a secondary converted value in base currency
  const isAdminViewing = currentUser && ['admin', 'manager'].includes(currentUser.role);
  const adminBaseCurrency = businessCurrency || 'EUR';
  
  // Format helper - formats amounts for display
  // CRITICAL: All amounts in DB are in EUR. Convert only for non-staff users.
  const formatInCustomerCurrency = useCallback((amount) => {
    const amountNum = Number(amount) || 0;
    
    if (isStaffViewing) {
      // Staff viewing: amounts are in EUR, display as EUR (no conversion)
      return formatCurrency(amountNum, storageCurrency);
    }
    
    // Customer viewing: convert from EUR to their preferred currency
    if (customerPreferredCurrency !== storageCurrency) {
      const converted = convertCurrency(amountNum, storageCurrency, customerPreferredCurrency);
      return formatCurrency(converted, customerPreferredCurrency);
    }
    
    return formatCurrency(amountNum, displayCurrency);
  }, [formatCurrency, storageCurrency, customerPreferredCurrency, displayCurrency, isStaffViewing, convertCurrency]);

  // For admin: show converted value in customer's currency as secondary info
  const formatConvertedForAdmin = useCallback((amount) => {
    if (!isAdminViewing || customerPreferredCurrency === adminBaseCurrency) {
      return null; // No need to show converted value
    }
    // Show what the customer would see in their currency
    const converted = convertCurrency(amount || 0, storageCurrency, customerPreferredCurrency);
    return formatCurrency(converted, customerPreferredCurrency);
  }, [isAdminViewing, customerPreferredCurrency, adminBaseCurrency, convertCurrency, formatCurrency, storageCurrency]);
  
  const currencySymbol = useMemo(() => getCurrencySymbol(displayCurrency), [getCurrencySymbol, displayCurrency]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [instructors, setInstructors] = useState([]);
  // userAccount is already declared above
  const [transactions, setTransactions] = useState([]);
  const [customerPackages, setCustomerPackages] = useState([]);

  const buildAuthHeaders = useCallback(() => {
    const baseHeaders = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        baseHeaders.Authorization = `Bearer ${token}`;
      }
    }
    return baseHeaders;
  }, []);

  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [paymentForm] = Form.useForm();
  const [refundForm] = Form.useForm();
  const [chargeForm] = Form.useForm();
  const [editProfileForm] = Form.useForm();
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState(() => {
    const savedTab = localStorage.getItem('customerProfile_lastTab');
    return savedTab || 'total';
  });

  const handleTabSwitchWithScroll = useCallback((tabKey) => {
    setActiveTabKey(tabKey);
    localStorage.setItem('customerProfile_lastTab', tabKey);
    setTimeout(() => {
      const tabsElement = document.querySelector('.ant-tabs');
      if (tabsElement) {
        tabsElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 100);
  }, []);

  const [packageManagerVisible, setPackageManagerVisible] = useState(false);
  const [startAssignFlow, setStartAssignFlow] = useState(false);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);

  const [bookingDetailModalVisible, setBookingDetailModalVisible] = useState(false);
  const [rentalDetailModalVisible, setRentalDetailModalVisible] = useState(false);
  const [transactionDetailModalVisible, setTransactionDetailModalVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedRental, setSelectedRental] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionDependencyInfo, setTransactionDependencyInfo] = useState(null);
  const [dependencyModalVisible, setDependencyModalVisible] = useState(false);
  const [dependencyFetchLoading, setDependencyFetchLoading] = useState(false);
  const [dependencyFetchError, setDependencyFetchError] = useState(null);
  const [selectedDependencyBookingIds, setSelectedDependencyBookingIds] = useState([]);
  const [selectedDependencyPackageIds, setSelectedDependencyPackageIds] = useState([]);
  const [selectedDependencyRentalIds, setSelectedDependencyRentalIds] = useState([]);
  const [packageCascadeOptions, setPackageCascadeOptions] = useState({});

  const updatePackageCascadeOption = useCallback((packageId, partialUpdate) => {
    if (!packageId) {
      return;
    }

    setPackageCascadeOptions((prev) => {
      const current = prev[packageId] || {};
      const nextEntry = { ...current, ...partialUpdate };

      if (
        current.strategy === nextEntry.strategy &&
        current.allowNegative === nextEntry.allowNegative
      ) {
        return prev;
      }

      return {
        ...prev,
        [packageId]: nextEntry
      };
    });
  }, []);

  const [isPackagesExpanded, setIsPackagesExpanded] = useState(true);
  const [isUpcomingLessonsExpanded, setIsUpcomingLessonsExpanded] = useState(true);

  useEffect(() => {
    if (!openModalTarget) {
      return;
    }

    switch (openModalTarget) {
      case 'addFunds':
        setShowAddFundsModal(true);
        break;
      case 'charge':
        setShowChargeModal(true);
        break;
      case 'assignPackage':
        setStartAssignFlow(true);
        setPackageManagerVisible(true);
        break;
      case 'managePackages':
        setStartAssignFlow(false);
        setPackageManagerVisible(true);
        break;
      default:
        break;
    }

    navigate(pathname, { replace: true, state: {} });
  }, [navigate, openModalTarget, pathname]);

  const customerFullName = useMemo(() => {
    if (!customer) {
      return '';
    }

    const primaryParts = [
      customer.first_name ?? customer.firstName,
      customer.last_name ?? customer.lastName
    ].filter(Boolean);

    if (primaryParts.length > 0) {
      return primaryParts.join(' ');
    }

    return customer.name || customer.fullName || 'Customer';
  }, [customer]);

  const customerAge = useMemo(() => {
    if (!customer) {
      return null;
    }

    if (customer.age !== undefined && customer.age !== null) {
      const directAge = Number(customer.age);
      if (Number.isFinite(directAge)) {
        return Math.max(0, Math.round(directAge));
      }
    }

    const dob = customer.date_of_birth || customer.dateOfBirth;
    if (!dob) {
      return null;
    }

    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) {
      return null;
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  }, [customer]);

  const customerWeightKg = useMemo(() => {
    if (!customer) {
      return null;
    }

    const rawWeight = customer.weight ?? customer.weight_kg ?? customer.weightKg;
    if (rawWeight === undefined || rawWeight === null || rawWeight === '') {
      return null;
    }

    const numeric = Number(rawWeight);
    return Number.isFinite(numeric) ? numeric : null;
  }, [customer]);

  const ageDisplay = useMemo(() => {
    if (customerAge === null || customerAge === undefined) {
      return null;
    }
    return `${customerAge} yrs`;
  }, [customerAge]);

  const weightDisplay = useMemo(() => {
    if (customerWeightKg === null || customerWeightKg === undefined) {
      return null;
    }
    const decimals = customerWeightKg % 1 === 0 ? 0 : 1;
    return `${customerWeightKg.toFixed(decimals)} kg`;
  }, [customerWeightKg]);

  const quickActions = useMemo(() => {
    if (!customer) {
      return [];
    }

    return [
      {
        key: 'make-booking',
        label: 'Make a booking',
        description: 'Schedule a new session',
        icon: CalendarOutlined,
        iconClassName: 'text-sky-500',
        onClick: () => setBookingModalVisible(true)
      },
      {
        key: 'assign-package',
        label: 'Assign a package',
        description: 'Start a package plan',
        icon: GiftOutlined,
        iconClassName: 'text-amber-500',
        onClick: () => {
          setStartAssignFlow(true);
          setPackageManagerVisible(true);
        }
      },
      {
        key: 'manage-packages',
        label: 'Manage packages',
        icon: AppstoreOutlined,
        iconClassName: 'text-indigo-500',
        onClick: () => {
          setStartAssignFlow(false);
          setPackageManagerVisible(true);
        }
      },
      {
        key: 'add-balance',
        label: 'Add balance',
        icon: PlusOutlined,
        iconClassName: 'text-emerald-500',
        onClick: () => setShowAddFundsModal(true)
      },
      {
        key: 'charge',
        label: 'Charge customer',
        icon: CreditCardOutlined,
        iconClassName: 'text-rose-500',
        onClick: () => setShowChargeModal(true)
      },
      {
        key: 'edit-profile',
        label: 'Edit profile',
        icon: EditOutlined,
        iconClassName: 'text-slate-500',
        onClick: () => setShowEditProfileModal(true)
      },
      {
        key: 'view-overview',
        label: 'Customer overview',
        icon: UserOutlined,
        iconClassName: 'text-blue-500',
        onClick: () => navigate(`/customers/${id}`, { state: { fromProfile: true } })
      }
    ];
  }, [customer, id, navigate]);

  // Package history UI removed per request
  useEffect(() => {
    const fetchData = async () => {
      if (!id || id === 'undefined') {
        setError('Invalid customer ID.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const headers = buildAuthHeaders();

        const [
          customerResult,
          lessonsResult,
          rentalsResult,
          instructorsResult,
          balanceResult,
          transactionsResult,
          packagesResult
        ] = await Promise.allSettled([
          requestThrottle.execute(() => DataService.getUserById(id)),
          DataService.getLessonsByUserId(id),
          DataService.getRentalsByUserId(id),
          DataService.getInstructors(),
          FinancialService.getUserBalance(id, true),
          FinancialService.getUserTransactions(id),
          fetch(`/api/services/customer-packages/${id}`, { headers }).then((response) => {
            if (!response.ok) {
              throw new Error(`Failed to load customer packages: ${response.status}`);
            }
            return response.json();
          })
        ]);

        if (customerResult.status === 'fulfilled') {
          setCustomer(customerResult.value);
        } else {
          throw customerResult.reason || new Error('Failed to load customer data.');
        }

        if (lessonsResult.status === 'fulfilled') {
          const bookingsArr = lessonsResult.value || [];
          const uniqueBookings = Array.from(new Map(bookingsArr.map(b => [b.id, b])).values());
          setBookings(uniqueBookings);
        } else {
          setBookings([]);
          console.error('Error fetching customer lessons:', lessonsResult.reason);
        }

        setRentals(rentalsResult.status === 'fulfilled' ? rentalsResult.value || [] : []);
        if (rentalsResult.status === 'rejected') {
          console.error('Error fetching customer rentals:', rentalsResult.reason);
        }

        setInstructors(instructorsResult.status === 'fulfilled' ? instructorsResult.value || [] : []);
        if (instructorsResult.status === 'rejected') {
          console.error('Error fetching instructors:', instructorsResult.reason);
        }

        if (balanceResult.status === 'fulfilled') {
          setUserAccount(balanceResult.value);
        } else {
          console.error('Error fetching financial data:', balanceResult.reason);
          setUserAccount(null);
        }

        setTransactions(transactionsResult.status === 'fulfilled' ? transactionsResult.value || [] : []);
        if (transactionsResult.status === 'rejected') {
          console.error('Error fetching transactions:', transactionsResult.reason);
        }

        if (packagesResult.status === 'fulfilled') {
          const arr = Array.isArray(packagesResult.value) ? packagesResult.value : [];
          const unique = Array.from(new Map(arr.map(p => [p.id, p])).values());
          setCustomerPackages(unique);
        } else {
          console.error('Error fetching customer packages:', packagesResult.reason);
          setCustomerPackages([]);
        }
      } catch (err) {
        console.error('Error loading customer data:', err);
        setError(`Failed to load customer data: ${err.message || 'Please try again.'}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [buildAuthHeaders, id]);

  // Centralized function to refresh all financial and customer data
  const refreshAllCustomerData = useCallback(async () => {
    if (!id) {
      return;
    }

    const headers = buildAuthHeaders();

    const [
      balanceResult,
      transactionsResult,
      packagesResult,
      lessonsResult,
      rentalsResult
    ] = await Promise.allSettled([
      FinancialService.getUserBalance(id, true),
      FinancialService.getUserTransactions(id),
      fetch(`/api/services/customer-packages/${id}`, { headers }).then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load customer packages: ${response.status}`);
        }
        return response.json();
      }),
      DataService.getLessonsByUserId(id),
      DataService.getRentalsByUserId(id)
    ]);

    if (balanceResult.status === 'fulfilled') {
      setUserAccount(balanceResult.value);
    } else {
      console.error('Error refreshing financial data:', balanceResult.reason);
    }

    if (transactionsResult.status === 'fulfilled') {
      setTransactions(transactionsResult.value || []);
    } else {
      console.error('Error refreshing transactions:', transactionsResult.reason);
    }

    if (packagesResult.status === 'fulfilled') {
      const arr = Array.isArray(packagesResult.value) ? packagesResult.value : [];
      const unique = Array.from(new Map(arr.map(p => [p.id, p])).values());
      setCustomerPackages(unique);
    } else {
      console.error('Error refreshing customer packages:', packagesResult.reason);
    }

    if (lessonsResult.status === 'fulfilled') {
      const bookingsArr = lessonsResult.value || [];
      const uniqueBookings = Array.from(new Map(bookingsArr.map(b => [b.id, b])).values());
      setBookings(uniqueBookings);
    } else {
      console.error('Error refreshing customer lessons:', lessonsResult.reason);
    }

    if (rentalsResult.status === 'fulfilled') {
      setRentals(rentalsResult.value || []);
    } else {
      console.error('Error refreshing customer rentals:', rentalsResult.reason);
    }
  }, [buildAuthHeaders, id]);

  // Refresh data when page becomes visible (user switches back to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && id) {
        refreshAllCustomerData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [id, refreshAllCustomerData]);
  
  /**
   * Calculate statistics for a customer based on their bookings
   */
  const stats = useMemo(() => {
    const totalLessons = bookings?.length || 0;
    const completedLessons = bookings?.filter((b) => b && b.status === 'completed').length || 0;
    const canceledLessons = bookings?.filter((b) => b && b.status === 'cancelled').length || 0;
    const noShowLessons = bookings?.filter((b) => b && b.status === 'no-show').length || 0;
    const now = new Date();
    const upcomingLessons = bookings?.filter((b) => {
      if (!b || b.status === 'cancelled') return false;
      const dt = getBookingDateTime(b);
      return dt ? dt > now : false;
    }).length || 0;
    const hoursAttended =
      bookings?.reduce((sum, b) => {
        const dur = parseFloat(b?.duration ?? 0);
        return sum + (b?.status === 'completed' && !Number.isNaN(dur) ? dur : 0);
      }, 0) || 0;

    const totalRentals = rentals?.length || 0;
    const activeRentals = rentals?.filter((r) => r && (r.status === 'active' || r.status === 'ongoing')).length || 0;
    const completedRentals = rentals?.filter((r) => r && (r.status === 'completed' || r.status === 'returned')).length || 0;

    return {
      totalLessons,
      completedLessons,
      canceledLessons,
      noShowLessons,
      upcomingLessons,
      hoursAttended,
      attendanceRate: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      totalRentals,
      activeRentals,
      completedRentals
    };
  }, [bookings, rentals]);

  const handleScrollToPackages = useCallback(() => {
    setIsPackagesExpanded(true);

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const section = document.getElementById('customer-package-summary');
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }, []);

  const activePackagesCount = useMemo(() => {
    if (!customerPackages || customerPackages.length === 0) {
      return 0;
    }

    return customerPackages.filter((pkg) => {
      const remaining = pkg?.remainingHours ?? pkg?.remaining_hours ?? 0;
      return Number(remaining) > 0;
    }).length;
  }, [customerPackages]);

  const quickHighlights = useMemo(() => {
    const balanceRaw = userAccount?.currentBalance ?? 0;
    const balanceValue = formatInCustomerCurrency(balanceRaw);
    const balanceTone = balanceRaw >= 0 ? 'text-emerald-600' : 'text-rose-500';

    const lifetimeValue = formatInCustomerCurrency(userAccount?.lifetimeValue || 0);
    const lastPaymentDisplay = userAccount?.lastPaymentDate
      ? new Date(userAccount.lastPaymentDate).toLocaleDateString()
      : '—';
    const hoursAttendedDisplay = `${Number(stats.hoursAttended || 0).toFixed(1)} h`;

    return [
      {
        key: 'balance',
        label: 'Current Balance',
        value: balanceValue,
        icon: DollarOutlined,
        toneClass: balanceTone
      },
      {
        key: 'lifetimeValue',
        label: 'Lifetime Value',
        value: lifetimeValue,
        icon: LineChartOutlined,
        toneClass: 'text-indigo-600'
      },
      {
        key: 'lastPayment',
        label: 'Last Payment',
        value: lastPaymentDisplay,
        icon: CreditCardOutlined,
        toneClass: 'text-slate-800',
        onClick: () => handleTabSwitchWithScroll('financial'),
        ctaLabel: 'Click to view'
      },
      {
        key: 'activePackages',
        label: 'Active Packages',
        value: activePackagesCount,
        icon: GiftOutlined,
        toneClass: 'text-amber-600',
        onClick: handleScrollToPackages,
        ctaLabel: 'Click to view'
      },
      {
        key: 'hoursAttended',
        label: 'Hours Attended',
        value: hoursAttendedDisplay,
        icon: ClockCircleOutlined,
        toneClass: 'text-emerald-600'
      },
      {
        key: 'totalLessons',
        label: 'Total Lessons',
        value: stats.totalLessons ?? 0,
        icon: BookOutlined,
        toneClass: 'text-sky-600',
        onClick: () => handleTabSwitchWithScroll('bookings'),
        ctaLabel: 'Click to view'
      },
      {
        key: 'totalRentals',
        label: 'Total Rentals',
        value: stats.totalRentals ?? 0,
        icon: ShoppingOutlined,
        toneClass: 'text-amber-500',
        onClick: () => handleTabSwitchWithScroll('rentals'),
        ctaLabel: 'Click to view'
      }
    ];
  }, [activePackagesCount, formatInCustomerCurrency, handleScrollToPackages, handleTabSwitchWithScroll, stats.hoursAttended, stats.totalLessons, stats.totalRentals, userAccount]);

  const dependencyBookings = useMemo(() => {
    const bookings = transactionDependencyInfo?.dependencies?.bookings || [];
    return Array.from(new Map(bookings.map(b => [b.id, b])).values());
  }, [transactionDependencyInfo]);

  const dependencyPackages = useMemo(() => {
    const packages = transactionDependencyInfo?.dependencies?.packages || [];
    return Array.from(new Map(packages.map(p => [p.id, p])).values());
  }, [transactionDependencyInfo]);

  const dependencyRentals = useMemo(
    () => transactionDependencyInfo?.dependencies?.rentals || [],
    [transactionDependencyInfo]
  );

  useEffect(() => {
    if (!dependencyModalVisible) {
      return;
    }

    if (!dependencyPackages.length) {
      setPackageCascadeOptions((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }

    setPackageCascadeOptions((prev) => {
      const next = {};
      let changed = false;

      dependencyPackages.forEach((pkg) => {
        if (!pkg?.id) {
          return;
        }

        const prior = prev[pkg.id];
        const defaultStrategy = resolveDefaultPackageStrategy(pkg);
        const normalizedStrategy = PACKAGE_STRATEGY_SET.has(prior?.strategy)
          ? prior.strategy
          : defaultStrategy;
        const allowNegative = typeof prior?.allowNegative === 'boolean' ? prior.allowNegative : true;

        next[pkg.id] = { strategy: normalizedStrategy, allowNegative };

        if (!prior || prior.strategy !== normalizedStrategy || prior.allowNegative !== allowNegative) {
          changed = true;
        }
      });

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [dependencyModalVisible, dependencyPackages]);

  const dependencySummaryText = useMemo(() => {
    const formatPart = (count, label) => `${count} ${label}${count === 1 ? '' : 's'}`;
    const parts = [];

    if (dependencyBookings.length > 0) {
      parts.push(formatPart(dependencyBookings.length, 'lesson'));
    }

    if (dependencyPackages.length > 0) {
      parts.push(formatPart(dependencyPackages.length, 'package'));
    }

    if (dependencyRentals.length > 0) {
      parts.push(formatPart(dependencyRentals.length, 'rental'));
    }

    if (parts.length === 0) {
      return 'linked records';
    }

    if (parts.length === 1) {
      return parts[0];
    }

    if (parts.length === 2) {
      return `${parts[0]} and ${parts[1]}`;
    }

    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  }, [dependencyBookings, dependencyPackages, dependencyRentals]);

  const hasAnyDependencies =
    dependencyBookings.length > 0 ||
    dependencyPackages.length > 0 ||
    dependencyRentals.length > 0;

  const hasDependencySelections =
    selectedDependencyBookingIds.length > 0 ||
    selectedDependencyPackageIds.length > 0 ||
    selectedDependencyRentalIds.length > 0;

  const packageStrategySelectionInvalid = useMemo(() => {
    if (selectedDependencyPackageIds.length === 0) {
      return false;
    }

    return selectedDependencyPackageIds.some((pkgId) => {
      const entry = packageCascadeOptions[pkgId];
      return !entry || !PACKAGE_STRATEGY_SET.has(entry.strategy);
    });
  }, [packageCascadeOptions, selectedDependencyPackageIds]);

  const dependencyConfirmDisabled =
    dependencyFetchLoading || !hasDependencySelections || packageStrategySelectionInvalid;

  // Function to reload customer packages and financial data
  const reloadCustomerPackages = async () => {
    await refreshAllCustomerData();
  };

  // (ReloadAllData helper removed as unused)

  // Payment/Financial Functions
  const handleAddFunds = async (values) => {
    setPaymentProcessing(true);
    try {
      await FinancialService.addFunds(
        id,
        values.amount,
        values.description || 'Account deposit',
        values.paymentMethod,
        values.referenceNumber
      );
      
      message.success('Funds added successfully');
      setShowAddFundsModal(false);
      paymentForm.resetFields();
      
      // Refresh all customer data
      await refreshAllCustomerData();
    } catch (err) {
      message.error('Failed to add funds: ' + (err.message || 'Unknown error'));
    } finally {
      setPaymentProcessing(false);
    }
  };
  
  const handleProcessRefund = async (values) => {
    setPaymentProcessing(true);
    try {
      await FinancialService.processRefund(
        id,
        values.amount,
        values.relatedEntityId || null,
        values.relatedEntityType || 'manual',
        values.description || 'Manual refund'
      );
      
      message.success('Refund processed successfully');
      setShowRefundModal(false);
      refundForm.resetFields();
      
      // Refresh all customer data
      await refreshAllCustomerData();
    } catch (err) {
      console.error('Error processing refund:', err);
      message.error('Failed to process refund: ' + (err.message || 'Unknown error'));
    } finally {
      setPaymentProcessing(false);
    }
  };
  
  const handleProcessCharge = async (values) => {
    setPaymentProcessing(true);
    try {
      await FinancialService.processPayment(
        id,
        values.amount,
        values.type || 'service_payment',
        values.relatedEntityId || null,
        values.relatedEntityType || 'manual',
        values.description || 'Manual charge'
      );
      
      message.success('Charge processed successfully');
      setShowChargeModal(false);
      chargeForm.resetFields();
      
      // Refresh all customer data
      await refreshAllCustomerData();
    } catch (err) {
      console.error('Error processing charge:', err);
      message.error('Failed to process charge: ' + (err.message || 'Unknown error'));
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Edit profile handler
  const handleEditProfile = async (values) => {
    setPaymentProcessing(true);
    try {
      const payload = {
        ...values,
        name: `${values.first_name || ''} ${values.last_name || ''}`.trim(),
      };

      // Remove confirm_password if it exists
      if (payload.confirm_password) {
        delete payload.confirm_password;
      }

  await DataService.updateUser(id, payload);
  message.success('Profile updated successfully!');

  // Refresh customer data
  await refreshAllCustomerData();
    } catch (err) {
      message.error('Failed to update profile: ' + (err.message || 'Unknown error'));
    } finally {
      setPaymentProcessing(false);
    }
  };
  
  // Detail modal handlers
  const handleViewBooking = (booking) => {
    setSelectedBooking(booking);
    setBookingDetailModalVisible(true);
  };
  
  const handleViewRental = (rental) => {
    setSelectedRental(rental);
    setRentalDetailModalVisible(true);
  };
  
  const handleViewTransaction = (transaction) => {
    setSelectedTransaction(transaction);
    setTransactionDetailModalVisible(true);
  };

  // Booking update/delete handlers
  const handleBookingUpdated = async (_updatedBooking) => {
    await refreshAllCustomerData();
    message.success('Booking updated successfully');
  };

  const handleBookingDeleted = async (_deletedBookingId) => {
    await refreshAllCustomerData();
    message.success('Booking deleted successfully');
  };

  // Rental update/delete handlers
  const handleRentalUpdated = async (_updatedRental) => {
    await refreshAllCustomerData();
    message.success('Rental updated successfully');
  };

  const handleRentalDeleted = async (_deletedRentalId) => {
    await refreshAllCustomerData();
    message.success('Rental deleted successfully');
  };

  // Delete handlers for customer profile tables
  const resetTransactionDependencyState = useCallback(() => {
    setTransactionDependencyInfo(null);
    setDependencyModalVisible(false);
    setDependencyFetchError(null);
    setSelectedDependencyBookingIds([]);
    setSelectedDependencyPackageIds([]);
    setSelectedDependencyRentalIds([]);
    setDependencyFetchLoading(false);
    setPackageCascadeOptions({});
  }, []);

  const performTransactionDeletion = useCallback(async (transaction, options = {}) => {
    if (!transaction) {
      return;
    }

    setDependencyFetchLoading(true);

    try {
      await DataService.deleteTransaction(transaction.id, {
        force: options.force,
        hardDelete: options.hardDelete,
        cascade: options.cascade,
        reason: options.reason
      });
      message.success(options.hardDelete ? 'Transaction permanently deleted (no reversal created)' : options.force ? 'Transaction deleted after removing linked records.' : 'Transaction deleted successfully');
      await refreshAllCustomerData();
      setTransactionDetailModalVisible(false);
      setSelectedTransaction(null);
      resetTransactionDependencyState();
    } catch (error) {
      if (error.response?.status === 409 && !options.force) {
        const responseData = error.response.data;
        const dependencies = responseData?.dependencies || {};
        const bookingIds = dependencies.bookings?.map((booking) => booking.id) || [];
        const packageIds = dependencies.packages?.map((pkg) => pkg.id) || [];
        const rentalIds = dependencies.rentals?.map((rental) => rental.id) || [];
        const hasDependencies = bookingIds.length || packageIds.length || rentalIds.length;

        if (hasDependencies) {
          setTransactionDependencyInfo(responseData);
          setSelectedDependencyBookingIds(bookingIds);
          setSelectedDependencyPackageIds(packageIds);
          setSelectedDependencyRentalIds(rentalIds);
          setDependencyModalVisible(true);
          setDependencyFetchLoading(false);
          return;
        }
      }

      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete transaction.';
      message.error(errorMessage);
    } finally {
      setDependencyFetchLoading(false);
    }
  }, [refreshAllCustomerData, resetTransactionDependencyState]);

  const showTransactionDeletionConfirm = useCallback((transaction) => {
    if (!transaction) {
      return;
    }

    // Check if this is a reversal transaction (corrupted chain)
    const isReversalChain = transaction.transaction_type?.toLowerCase().includes('reversal');
    
    // Always show both delete options
    Modal.confirm({
      title: isReversalChain ? 'Delete Reversal Transaction' : 'Delete Transaction',
      width: 500,
      content: (
        <div>
          {isReversalChain ? (
            <>
              <p>This appears to be part of a reversal chain. Normal deletion will create another reversal.</p>
              <p style={{ marginTop: 8 }}><strong>Recommended:</strong> Use "Hard Delete" to permanently remove without creating a new reversal.</p>
            </>
          ) : (
            <p>Choose how to delete this transaction:</p>
          )}
          <p style={{ marginTop: 8, color: '#666' }}>
            Amount: <strong>{formatCurrency(Math.abs(parseFloat(transaction.amount)), transaction.currency || storageCurrency)}</strong>
          </p>
          <p style={{ marginTop: 4, color: '#666' }}>
            Type: <strong>{transaction.transaction_type?.replace(/_/g, ' ')?.toUpperCase()}</strong>
          </p>
          <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Delete Options:</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
              <li style={{ marginBottom: 4 }}>
                <strong>Normal Delete:</strong> Creates a reversal transaction to balance the books
              </li>
              <li>
                <strong>Hard Delete:</strong> Permanently removes without reversal (use for corrupted/duplicate data)
              </li>
            </ul>
          </div>
        </div>
      ),
      okText: 'Hard Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => performTransactionDeletion(transaction, { hardDelete: true }),
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <Button onClick={() => {
            Modal.destroyAll();
            performTransactionDeletion(transaction);
          }}>Normal Delete</Button>
          <OkBtn />
        </>
      )
    });
  }, [storageCurrency, formatCurrency, performTransactionDeletion]);

  const handleDeleteTransaction = useCallback(async (transaction, options = {}) => {
    if (!transaction) {
      return;
    }

    setSelectedTransaction(transaction);

    if (options.closeDetailModal) {
      setTransactionDetailModalVisible(false);
    }

    setDependencyFetchLoading(true);
    setDependencyFetchError(null);

    try {
      const dependencyData = await FinancialService.getTransactionDependencies(transaction.id);

      const bookingIds = dependencyData?.dependencies?.bookings?.map((booking) => booking.id) || [];
      const packageIds = dependencyData?.dependencies?.packages?.map((pkg) => pkg.id) || [];
      const rentalIds = dependencyData?.dependencies?.rentals?.map((rental) => rental.id) || [];

      const hasDependencies = Boolean(
        (bookingIds.length > 0) ||
        (packageIds.length > 0) ||
        (rentalIds.length > 0)
      );

      if (dependencyData?.hasDependencies && hasDependencies) {
        setTransactionDependencyInfo(dependencyData);
        setSelectedDependencyBookingIds(bookingIds);
        setSelectedDependencyPackageIds(packageIds);
        setSelectedDependencyRentalIds(rentalIds);
        setDependencyModalVisible(true);
      } else {
        showTransactionDeletionConfirm(transaction);
      }
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error.message || 'Failed to check transaction dependencies.';
      message.error(errorMessage);
    } finally {
      setDependencyFetchLoading(false);
    }
  }, [showTransactionDeletionConfirm]);

  const handleDependencyModalCancel = useCallback(() => {
    resetTransactionDependencyState();
  }, [resetTransactionDependencyState]);

  const handleDependencyDeleteConfirm = useCallback(async () => {
    if (!selectedTransaction) {
      return;
    }

    const hasBookingSelections = selectedDependencyBookingIds.length > 0;
    const hasPackageSelections = selectedDependencyPackageIds.length > 0;
    const hasRentalSelections = selectedDependencyRentalIds.length > 0;

    if (!hasBookingSelections && !hasPackageSelections && !hasRentalSelections) {
      message.warning('Please choose at least one linked item to remove before deleting the transaction.');
      return;
    }

    if (packageStrategySelectionInvalid) {
      message.warning('Select how each selected package should be handled before continuing.');
      return;
    }

    setDependencyFetchLoading(true);
    setDependencyFetchError(null);

    try {
      if (hasBookingSelections) {
        for (const bookingId of selectedDependencyBookingIds) {
          await DataService.deleteBooking(bookingId);
          window.dispatchEvent(new CustomEvent('booking-deleted', { detail: { bookingId } }));
        }
      }

      const cascadePayload = {};
      if (hasPackageSelections) {
        const packagePayloads = selectedDependencyPackageIds
          .map((packageId) => {
            const strategyEntry = packageCascadeOptions[packageId];
            const strategy = PACKAGE_STRATEGY_SET.has(strategyEntry?.strategy)
              ? strategyEntry.strategy
              : resolveDefaultPackageStrategy(
                  dependencyPackages.find((pkg) => pkg.id === packageId)
                ) || PACKAGE_DEFAULT_STRATEGY;

            const payload = { id: packageId, strategy };

            if (strategy === 'charge-used') {
              payload.allowNegative = strategyEntry?.allowNegative !== false;
            }

            return payload;
          })
          .filter(Boolean);

        if (packagePayloads.length > 0) {
          cascadePayload.packages = packagePayloads;
        }
      }
      if (hasRentalSelections) {
        cascadePayload.rentals = selectedDependencyRentalIds;
      }

      await performTransactionDeletion(selectedTransaction, {
        force: true,
        cascade: Object.keys(cascadePayload).length > 0 ? cascadePayload : undefined
      });
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error.message || 'Failed to delete linked records.';
      setDependencyFetchError(errorMessage);
      message.error(errorMessage);
    } finally {
      setDependencyFetchLoading(false);
    }
  }, [
    dependencyPackages,
    packageCascadeOptions,
    packageStrategySelectionInvalid,
    performTransactionDeletion,
    selectedDependencyBookingIds,
    selectedDependencyPackageIds,
    selectedDependencyRentalIds,
    selectedTransaction
  ]);

  const handleDeleteBooking = (booking) => {
    Modal.confirm({
      title: 'Delete Booking',
      content: `Are you sure you want to delete this booking for ${booking.service_name || 'lesson'} on ${new Date(booking.lesson_date).toLocaleDateString()}?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await DataService.deleteBooking(booking.id);
          message.success('Booking deleted successfully');
          await refreshAllCustomerData();
          // Dispatch custom event for real-time updates
          window.dispatchEvent(new CustomEvent('booking-deleted', { detail: { bookingId: booking.id } }));
        } catch (error) {
          console.error('Error deleting booking:', error);
          message.error('Failed to delete booking: ' + (error.message || 'Unknown error'));
        }
      }
    });
  };

  const handleDeleteRental = (rental) => {
    Modal.confirm({
      title: 'Delete Rental',
      content: `Are you sure you want to delete this rental for ${rental.equipment_name || 'equipment'} on ${new Date(rental.rental_date || rental.start_date || rental.created_at).toLocaleDateString()}?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await DataService.deleteRental(rental.id);
          message.success('Rental deleted successfully');
          await refreshAllCustomerData();
        } catch (error) {
          console.error('Error deleting rental:', error);
          message.error('Failed to delete rental: ' + (error.message || 'Unknown error'));
        }
      }
    });
  };

  // Transaction handlers
  const handleTransactionUpdated = async (_updatedTransaction) => {
    await refreshAllCustomerData();
    message.success('Transaction updated successfully');
  };

  const handleTransactionDeleted = async (_deletedTransactionId) => {
    await refreshAllCustomerData();
    message.success('Transaction deleted successfully');
  };
  
  // Reset wallet balance handler
  const handleResetWalletBalance = useCallback(() => {
    if (!id) return;
    
    let targetBalance = 0;
    let reason = '';
    
    Modal.confirm({
      title: 'Reset Wallet Balance',
      width: 500,
      icon: null,
      content: (
        <div>
          <Alert 
            type="warning" 
            message="This will permanently delete ALL wallet transactions"
            description="Use this to clean up corrupted wallet data. The customer's transaction history will be cleared and replaced with a single balance adjustment."
            showIcon
            className="mb-4"
          />
          <Form layout="vertical">
            <Form.Item label="Target Balance" required>
              <InputNumber 
                style={{ width: '100%' }}
                placeholder="Enter target balance (0 for zero balance)"
                defaultValue={0}
                onChange={(value) => { targetBalance = value ?? 0; }}
                formatter={(value) => `${getCurrencySymbol(businessCurrency)} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value.replace(new RegExp(`${getCurrencySymbol(businessCurrency)}\\s?|(,*)`, 'g'), '')}
              />
            </Form.Item>
            <Form.Item label="Reason (Required)" required>
              <Input.TextArea 
                rows={3}
                placeholder="Enter reason for reset (e.g., 'Fixing corrupted balance from duplicate refunds')"
                onChange={(e) => { reason = e.target.value; }}
              />
            </Form.Item>
          </Form>
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-red-700 text-sm font-medium">⚠️ Warning</p>
            <ul className="text-red-600 text-sm mt-1 list-disc pl-4">
              <li>All {transactions?.length || 0} transaction records will be deleted</li>
              <li>This cannot be undone</li>
              <li>A new balance adjustment will be created with your reason</li>
            </ul>
          </div>
        </div>
      ),
      okText: 'Reset Wallet',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        if (!reason.trim()) {
          message.error('Please provide a reason for the reset');
          throw new Error('Reason required');
        }
        
        try {
          await DataService.resetWalletBalance(id, {
            targetBalance: targetBalance || 0,
            reason: reason.trim(),
            currency: businessCurrency || 'EUR'
          });
          message.success('Wallet balance has been reset successfully');
          await refreshAllCustomerData();
        } catch (error) {
          console.error('Error resetting wallet:', error);
          message.error(`Failed to reset wallet: ${error.response?.data?.message || error.message}`);
          throw error;
        }
      }
    });
  }, [id, businessCurrency, transactions, refreshAllCustomerData]);

  const formatDate = (dateString) => {
    if (!dateString || dateString === 'Invalid Date' || dateString === 'null' || dateString === 'undefined') {
      return 'N/A';
    }
    
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'N/A';
    }
  };

  const formatDateOnly = (dateString) => {
    if (!dateString || dateString === 'Invalid Date' || dateString === 'null' || dateString === 'undefined') {
      return 'N/A';
    }
    
    try {
      // If it's just a date string (YYYY-MM-DD), parse it as local date
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [year, month, day] = dateString.split('-');
        const date = new Date(year, month - 1, day); // month is 0-indexed
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'N/A';
    }
  };
  
  // Build a Date from booking's date and time fields (handles startTime vs start_time)
  function getBookingDateTime(record) {
    if (!record) return null;
    const dateStr = record.date || record.formatted_date;
    const timeStr = record.startTime || record.start_time || null;
    if (!dateStr) return null;
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
        const [y, m, d] = String(dateStr).split('-').map(Number);
        let hh = 0, mm = 0;
        if (typeof timeStr === 'string' && /^\d{2}:\d{2}$/.test(timeStr)) {
          const [h, mnt] = timeStr.split(':').map(Number);
          hh = h; mm = mnt;
        }
        const dt = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
      const dt = new Date(dateStr);
      return isNaN(dt.getTime()) ? null : dt;
    } catch {
      return null;
    }
  }
  
  const getStatusTag = (status) => {
    const statusMap = {
      'active': { color: 'green', label: 'Active' },
      'completed': { color: 'green', label: 'Completed' },
      'returned': { color: 'green', label: 'Returned' },
      'cancelled': { color: 'red', label: 'Cancelled' },
      'no-show': { color: 'red', label: 'No Show' },
      'pending': { color: 'orange', label: 'Pending' },
      'scheduled': { color: 'blue', label: 'Scheduled' },
      'ongoing': { color: 'blue', label: 'Ongoing' },
      'overdue': { color: 'red', label: 'Overdue' },
      'confirmed': { color: 'green', label: 'Confirmed' },
    };
    
    const { color, label } = statusMap[status?.toLowerCase()] || { color: 'default', label: status };
    
    return <Tag color={color}>{label}</Tag>;
  };
  
  /**
   * Get the last used instructor from customer booking history
   * @returns {Object|null} Last instructor object or null if none found
   */
  const getLastUsedInstructor = () => {
    if (!bookings || bookings.length === 0) return null;

    // Sort bookings by date (most recent first) and find the most recent one with an instructor
    const sortedBookings = [...bookings]
      .sort((a, b) => {
        const dateA = getBookingDateTime(a) || 0;
        const dateB = getBookingDateTime(b) || 0;
        return dateB - dateA; // Most recent first
      })
      .filter(booking => booking.instructor_user_id || booking.instructor_id);

    if (sortedBookings.length === 0) return null;

    const lastBooking = sortedBookings[0];
    const instructorId = lastBooking.instructor_user_id || lastBooking.instructor_id;

    // Find the instructor in the instructors list
    const instructor = instructors.find(inst => inst.id === instructorId);
    
    if (instructor) {
      return {
        id: instructor.id,
        name: instructor.name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim(),
        // Include the instructor data for easy access
        ...instructor
      };
    }

    // If instructor not found in list but we have the booking data
    if (lastBooking.instructor_name) {
      return {
        id: instructorId,
        name: lastBooking.instructor_name
      };
    }

    return null;
  };

  // Booking History Table Columns
  const bookingColumns = [
    {
      title: 'Date & Time',
      key: 'datetime',
      render: (_, record) => {
        // Combine date and startTime for display
        if (record.date && record.startTime) {
          const dateStr = new Date(record.date).toLocaleDateString();
          return `${dateStr} ${record.startTime}`;
        } else if (record.start_time) {
          return formatDate(record.start_time);
        } else if (record.date) {
          return formatDate(record.date);
        }
        return 'N/A';
      },
      sorter: (a, b) => {
        const dateA = new Date(a.date || a.start_time || 0);
        const dateB = new Date(b.date || b.start_time || 0);
        return dateA - dateB;
      },
    },
    {
      title: 'User(s)',
      key: 'users',
      render: (_, record) => {
        // Show primary name and indicate group size if applicable
        const base = record.student_name || record.userName || 'N/A';
        const count = Array.isArray(record.participants) ? record.participants.length : (record.group_size || 0);
        if (count && count > 1) {
          return (
            <span>
              {base} <Tag color="blue">+{count - 1}</Tag>
            </span>
          );
        }
        return base;
      }
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      render: (duration) => {
        if (!duration) return 'N/A';
        
        // Parse duration as number to handle both string and number formats
        const durationNum = parseFloat(duration);
        
        // Format based on the value - database stores hours as decimal
        if (durationNum === 1) {
          return `${durationNum} hour`;
        } else if (durationNum > 0) {
          return `${durationNum} hours`;
        } else {
          return 'N/A';
        }
      },
    },
    {
      title: 'Type',
      dataIndex: 'booking_type',
      key: 'booking_type',
      render: (type) => type?.charAt(0).toUpperCase() + type?.slice(1) || 'Standard',
    },
    {
      title: 'Instructor',
      key: 'instructor',
      render: (_, record) => {
        // First try the instructor_name from the joined query
        if (record.instructor_name) {
          return record.instructor_name;
        }
        // Fallback to finding instructor by ID
        if (record.instructor_id || record.instructor_user_id) {
          const instructorId = record.instructor_id || record.instructor_user_id;
          const instructor = instructors.find(i => i.id === instructorId);
          return instructor ? (instructor.name || `${instructor.first_name} ${instructor.last_name}`) : 'Not assigned';
        }
        return 'Not assigned';
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status),
    },
    {
      title: 'Payment',
      key: 'payment',
      render: (_, record) => {
        // Check if the payment_method_display already contains the package name
        if (record.payment_method_display && 
            record.payment_method_display !== 'Package Hours' && 
            record.payment_method_display !== 'Individual Payment' && 
            record.payment_method_display !== 'Paid') {
          // This means payment_method_display contains the actual package name
          return (
            <Tag color="blue" icon={<GiftOutlined />}>
              Package: {record.payment_method_display}
            </Tag>
          );
        }
        
        // Check backend payment_method_display field first
        if (record.payment_method_display === 'Package Hours') {
          // Try to get the actual package name from available fields
          const packageName = record.customer_package_name || record.packageName || record.package_name;
          if (packageName) {
            return (
              <Tag color="blue" icon={<GiftOutlined />}>
                Package: {packageName}
              </Tag>
            );
          }
          // If no specific package name but payment_status is 'package', show service-based package
          if (record.payment_status === 'package' && record.service_name) {
            return (
              <Tag color="blue" icon={<GiftOutlined />}>
                Package: {record.service_name}
              </Tag>
            );
          }
          // Generic fallback for packages without specific names
          return (
            <Tag color="blue" icon={<GiftOutlined />}>
              Package Hours
            </Tag>
          );
        } else if (record.payment_method_display === 'Individual Payment') {
          return (
            <Tag color="green">
              Individual Payment
            </Tag>
          );
        } else if (record.payment_method_display && (() => {
          const n = parseFloat(String(record.payment_method_display).replace(/[^0-9.-]/g, ''));
          return !isNaN(n) && n < 0;
        })()) {
          return (
            <Tag color="orange">
              {record.payment_method_display}
            </Tag>
          );
        } else if (record.payment_method_display === 'Balance Payment') {
          return (
            <Tag color="green">
              Balance Payment
            </Tag>
          );
        } else if (record.payment_method_display && record.payment_method_display !== 'Individual Payment' && record.payment_method_display !== 'Paid') {
          // This handles specific package names from the backend query (cp.package_name)
          return (
            <Tag color="blue" icon={<GiftOutlined />}>
              Package: {record.payment_method_display}
            </Tag>
          );
        }
        
        // Fallback logic for older data or missing field
        if (record.paymentMethod === 'Package Hours' || record.isPackagePayment) {
          const packageName = record.customer_package_name || record.packageName || record.package_name;
          if (packageName) {
            return (
              <Tag color="blue" icon={<GiftOutlined />}>
                Package: {packageName}
              </Tag>
            );
          }
          // Fallback to service name for package payments
          if (record.service_name) {
            return (
              <Tag color="blue" icon={<GiftOutlined />}>
                Package: {record.service_name}
              </Tag>
            );
          }
          return (
            <Tag color="blue" icon={<GiftOutlined />}>
              Package Hours
            </Tag>
          );
        } else if (record.payment_status === 'package') {
          const packageName = record.customer_package_name || record.packageName || record.package_name;
          if (packageName) {
            return (
              <Tag color="blue" icon={<GiftOutlined />}>
                Package: {packageName}
              </Tag>
            );
          }
          // Fallback to service name for package payments
          if (record.service_name) {
            return (
              <Tag color="blue" icon={<GiftOutlined />}>
                Package: {record.service_name}
              </Tag>
            );
          }
          return (
            <Tag color="blue" icon={<GiftOutlined />}>
              Package Hours
            </Tag>
          );
        } else if (record.paymentMethod === 'Individual Payment') {
          return (
            <Tag color="green">
              Individual Payment
            </Tag>
          );
        } else if (record.paymentMethod && (() => {
          const n = parseFloat(String(record.paymentMethod).replace(/[^0-9.-]/g, ''));
          return !isNaN(n) && n < 0;
        })()) {
          return (
            <Tag color="orange">
              Balance: {record.paymentMethod}
            </Tag>
          );
        } else if (record.paymentMethod === 'Balance Payment') {
          return (
            <Tag color="green">
              Balance Payment
            </Tag>
          );
        } else if (record.package_id) {
          return (
            <Tag color="blue" icon={<GiftOutlined />}>
              Package ({record.package_hours_used || 0}h)
            </Tag>
          );
        } else if (record.payment_method === 'balance') {
          return (
            <Tag color="blue">
              Balance ({formatInCustomerCurrency(Number(record.final_amount || record.amount || 0))})
            </Tag>
          );
        } else {
          // Pay-and-go: default to Paid
          return <Tag color="green">Paid</Tag>;
        }
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleViewBooking(record)}>
            View
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDeleteBooking(record)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ];
  
  // Rental History Table Columns
  const rentalColumns = [
    {
      title: 'Equipment',
      dataIndex: 'equipment',
      key: 'equipment',
      render: (equipment, record) => {
        // New backend returns equipment as array
        if (equipment && Array.isArray(equipment) && equipment.length > 0) {
          if (equipment.length === 1) {
            // Single item, show its name
            return equipment[0].name || 'Unknown Equipment';
          } else {
            // Multiple items, show names or count
            return (
              <Tooltip 
                title={
                  <div>
                    {equipment.map((item) => (
                      <div key={item.id || `${item.name || 'item'}-${String(item.serial || item.code || Math.random()).slice(0,6)}`}>
                        {item.name || 'Item'}
                      </div>
                    ))}
                  </div>
                }
              >
                <span>{`${equipment.length} equipment items`}</span>
              </Tooltip>
            );
          }
        }
        
        // Fallback: If we have equipment_details with items (legacy)
        if (record.equipment_details && Object.values(record.equipment_details).length > 0) {
          const equipmentItems = Object.values(record.equipment_details);
          
          if (equipmentItems.length === 1) {
            return equipmentItems[0].name || 'Unknown Equipment';
          } else {
            return (
              <Tooltip 
                title={
                  <div>
                    {equipmentItems.map((item) => (
                      <div key={item.id || `${item.name || 'item'}-${String(item.serial || item.code || Math.random()).slice(0,6)}`}>
                        {item.name || 'Item'}
                      </div>
                    ))}
                  </div>
                }
              >
                <span>{`${equipmentItems.length} equipment items`}</span>
              </Tooltip>
            );
          }
        }
        
        // Fallback: If we have equipment_names array (legacy)
        if (record.equipment_names && Array.isArray(record.equipment_names) && record.equipment_names.length > 0) {
          if (record.equipment_names.length === 1) {
            return record.equipment_names[0] || 'Unknown Equipment';
          } else {
            return (
              <Tooltip 
                title={
                  <div>
                    {record.equipment_names.map((name) => (
                      <div key={`${name || 'item'}-${name?.length || 0}`}>{name || 'Item'}</div>
                    ))}
                  </div>
                }
              >
                <span>{`${record.equipment_names.length} equipment items`}</span>
              </Tooltip>
            );
          }
        }
        
        // Final fallbacks for older data structure
        return record.equipment_name || 
               (record.equipment_ids?.length > 0 ? `${record.equipment_ids.length} items` : 'Unknown Equipment');
      },
    },
    {
      title: 'Rental Date',
      dataIndex: 'rental_date',
      key: 'rental_date',
      render: (text, record) => {
        // Try different date fields in order of reliability
        const date = record.rental_date || record.start_date || record.created_at;
        return formatDate(date);
      },
      sorter: (a, b) => {
        const dateA = new Date(a.rental_date || a.start_date || a.created_at || 0);
        const dateB = new Date(b.rental_date || b.start_date || b.created_at || 0);
        return dateA - dateB;
      },
      defaultSortOrder: 'descend',
    },
    {
      title: 'Duration',
      dataIndex: 'duration_hours',
      key: 'duration',
      render: (durationHours, record) => {
        // Use duration_hours from backend if available and reasonable
        if (durationHours && durationHours > 0 && durationHours <= 12) {
          return `${Math.round(durationHours)}h`;
        }
        
        // For half-day rentals, show 4h regardless of calculated duration
        if (record.equipment && Array.isArray(record.equipment)) {
          const hasHalfDay = record.equipment.some(item => 
            item.name && item.name.toLowerCase().includes('half day')
          );
          if (hasHalfDay) {
            return '4h';
          }
          
          const hasFullDay = record.equipment.some(item => 
            item.name && item.name.toLowerCase().includes('full day')
          );
          if (hasFullDay) {
            return '8h';
          }
        }
        
        // Fallback: Use the duration from the record if available
        if (record.duration) {
          // If duration is provided in hours or minutes
          if (typeof record.duration === 'number') {
            // Check if it's likely in minutes (> 24 would be very long for hours)
            if (record.duration > 24) {
              return `${Math.floor(record.duration / 60)}h`;
            } else {
              return `${record.duration}h`;
            }
          }
          // If duration is already a string
          return record.duration;
        }
        
        // For half-day or full-day rentals, show standard durations
        if (record.rental_type === 'half_day' || record.half_day) {
          return '4h';
        } else if (record.rental_type === 'full_day') {
          return '8h';
        }
        
        // Default to 4h for completed rentals where we can't determine duration
        return '4h';
      },
    },
    {
      title: 'Price',
      dataIndex: 'total_price',
      key: 'total_price',
      render: (price) => {
        const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
        if (numericPrice && numericPrice > 0) {
          return formatCurrency(numericPrice, displayCurrency);
        }
        return 'N/A';
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleViewRental(record)}>
            View
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDeleteRental(record)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ];
    if (loading) {
    return (
      <div className="p-4 md:p-6 flex justify-center items-center min-h-[calc(100vh-120px)]">
        <div className="text-center">
          <Spin size="large" />
          <div className="mt-3">Loading customer profile...</div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          action={
            <Button onClick={() => navigate('/customers')}>Back to Customers</Button>
          }
        />
      </div>
    );
  }
  
  if (!customer) {
    return (
      <div className="p-4 md:p-6">
        <Alert 
          message="Customer not found." 
          type="warning" 
          showIcon 
          action={
            <Button onClick={() => navigate('/customers')}>Back to Customers</Button>
          }
        />
      </div>
    );
  }
  

  // Package history table removed
  
  return (
    <div className="p-4 md:p-6">
      <section className="mb-6">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50 shadow-sm">
          <div
            className="absolute -right-24 top-[-40px] h-56 w-56 rounded-full bg-sky-200/30 blur-3xl md:-right-12 md:top-[-60px]"
            aria-hidden="true"
          />
          <div
            className="absolute -left-24 bottom-[-48px] h-48 w-48 rounded-full bg-indigo-100/40 blur-2xl md:-left-10"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-6 px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-5">
                <Avatar
                  size={80}
                  src={customer.profile_image_url || customer.avatar}
                  icon={<UserOutlined />}
                  className="mb-4 shadow-sm ring-4 ring-white sm:mb-0"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
                      {customerFullName || 'Customer Profile'}
                    </h1>
                    {customer.status && (
                      <Tag
                        color={customer.status === 'active' ? 'green' : 'default'}
                        className="px-2 py-1 text-xs font-medium"
                      >
                        {customer.status.toUpperCase()}
                      </Tag>
                    )}
                  </div>
                  <p className="mt-1 text-base text-slate-600 sm:text-lg">Customer Profile</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600 sm:gap-3 sm:text-sm">
                    {customer.email && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 shadow-sm backdrop-blur">
                        <MailOutlined className="text-sky-500" />
                        <span className="max-w-[160px] truncate sm:max-w-none" title={customer.email}>
                          {customer.email}
                        </span>
                      </span>
                    )}
                    {customer.phone && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 shadow-sm backdrop-blur">
                        <PhoneOutlined className="text-emerald-500" />
                        <span className="max-w-[140px] truncate sm:max-w-none" title={customer.phone}>
                          {customer.phone}
                        </span>
                      </span>
                    )}
                    {(customer.address || customer.city) && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 shadow-sm backdrop-blur">
                        <HomeOutlined className="text-indigo-500" />
                        <span className="max-w-[180px] truncate sm:max-w-none" title={customer.address || customer.city}>
                          {customer.address || customer.city}
                        </span>
                      </span>
                    )}
                    {ageDisplay && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 shadow-sm backdrop-blur">
                        <FieldTimeOutlined className="text-purple-500" />
                        <span>{ageDisplay}</span>
                      </span>
                    )}
                    {weightDisplay && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 shadow-sm backdrop-blur">
                        <DashboardOutlined className="text-rose-500" />
                        <span>{weightDisplay}</span>
                      </span>
                    )}
                    {(customer.created_at || customer.createdAt) && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 shadow-sm backdrop-blur">
                        <ClockCircleOutlined className="text-amber-500" />
                        <span>
                          Customer since{' '}
                          {new Date(customer.created_at || customer.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => setShowEditProfileModal(true)}
                className="self-start shadow-sm md:self-center"
              >
                Edit Profile
              </Button>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {quickHighlights.map(({ key, label, value, icon: Icon, toneClass, onClick, ctaLabel }) => {
                const clickable = typeof onClick === 'function';
                const TileElement = clickable ? 'button' : 'div';

                return (
                  <TileElement
                    key={key}
                    type={clickable ? 'button' : undefined}
                    onClick={clickable ? onClick : undefined}
                    className={`group rounded-2xl border border-white/60 bg-white/80 px-4 py-4 shadow-sm backdrop-blur ${
                      clickable
                        ? 'text-left transition hover:border-sky-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer'
                        : ''
                    }`}
                    aria-label={clickable ? `${label} – click to view` : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-inner">
                        <Icon className={`text-lg ${toneClass}`} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                        <p className={`text-lg font-semibold text-slate-800 ${key === 'balance' ? toneClass : ''}`}>
                          {value ?? '—'}
                        </p>
                      </div>
                    </div>
                    {ctaLabel && (
                      <span
                        className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
                          clickable ? 'text-sky-600 group-hover:text-sky-700' : 'text-slate-400'
                        }`}
                      >
                        {ctaLabel}
                      </span>
                    )}
                  </TileElement>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      
      <Row gutter={[16, 16]} className="mb-6">
        {/* Activity Stats Cards */}
        <Col xs={24}>
          <Row gutter={[16, 16]}>
            {/* Financial Overview moved into profile card above */}

            {/* Package Summary Card */}
            <Col xs={24}>
              <Card 
                id="customer-package-summary"
                variant="outlined" 
                className="shadow-md"
              >
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-3">Package Summary</h3>
                  <Space wrap>
                    <Button 
                      type="primary" 
                      icon={<PlusCircleOutlined />} 
                      onClick={() => { setStartAssignFlow(true); setPackageManagerVisible(true); }}
                      size="small"
                    >
                      Assign Package
                    </Button>
                  </Space>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <Text type="secondary">Active Packages</Text>
                    <p className="text-xl font-semibold text-blue-600">
                      {customerPackages?.filter(pkg => pkg.remainingHours > 0).length || 0}
                    </p>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <Text type="secondary">Total Hours Remaining</Text>
                    <p className="text-xl font-semibold text-green-600">
                      {customerPackages?.reduce((total, pkg) => total + (pkg.remainingHours || 0), 0).toFixed(1) || '0.0'} hrs
                    </p>
                  </div>
                </div>

                {/* Package Grid (reused from CustomerPackageManager) */}
                {customer && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setIsPackagesExpanded(!isPackagesExpanded)}
                      className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-sky-300 transition-colors"
                    >
                      <h4 className="font-medium text-gray-700">Customer Packages</h4>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">
                          {customerPackages?.length || 0} packages
                        </span>
                        <span className="text-lg text-gray-400">
                          {isPackagesExpanded ? '−' : '+'}
                        </span>
                      </div>
                    </button>
                    {isPackagesExpanded && (
                      <div className="max-h-[420px] overflow-y-auto">
                        <CustomerPackageManager 
                          embedded 
                          visible={false}
                          onClose={() => {}}
                          customer={{ id: customer.id, name: customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim(), email: customer.email }}
                          onPackageAssigned={refreshAllCustomerData}
                          showHeader={false}
                          showStats={false}
                          showToolbar={false}
                          forceViewMode="grid"
                          disableActions={false}
                        />
                      </div>
                    )}
                  </div>
                )}

                {(!customerPackages || customerPackages.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-lg mb-2">📦</div>
                    <div>No packages assigned to this customer</div>
                    <div className="text-sm">Click "Assign Package" to get started</div>
                  </div>
                )}
              </Card>
            </Col>

            {/* Upcoming Lessons Card */}
            <Col xs={24}>
              <Card 
                variant="outlined" 
                className="shadow-md"
              >
                <div className="mb-4">
                  <button
                    onClick={() => setIsUpcomingLessonsExpanded(!isUpcomingLessonsExpanded)}
                    className="w-full text-left flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-sky-300 transition-colors"
                  >
                    <h3 className="text-lg font-semibold">Upcoming Lessons</h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">
                        {stats.upcomingLessons} lessons
                      </span>
                      <span className="text-lg text-gray-400">
                        {isUpcomingLessonsExpanded ? '−' : '+'}
                      </span>
                    </div>
                  </button>
                  
                  {isUpcomingLessonsExpanded && (
                    <div className="mt-3">
                      <Space wrap>
                        <Button 
                          type="primary" 
                          icon={<CalendarOutlined />} 
                          onClick={() => setBookingModalVisible(true)}
                          size="small"
                        >
                          Schedule New Lesson
                        </Button>
                      </Space>
                    </div>
                  )}
                </div>

                {isUpcomingLessonsExpanded && (
                  <>
                    {/* Upcoming Lessons Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <Text type="secondary">Total Upcoming</Text>
                    <p className="text-xl font-semibold text-blue-600">
                      {stats.upcomingLessons}
                    </p>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <Text type="secondary">Next Lesson</Text>
                    <p className="text-xl font-semibold text-green-600">
                      {(() => {
                        const upcomingBookings = bookings?.filter((b) => {
                          if (!b || b.status === 'cancelled') return false;
                          const now = new Date();
                          const dt = getBookingDateTime(b);
                          return dt ? dt > now : false;
                        }).sort((a, b) => {
                          const dateA = getBookingDateTime(a) || 0;
                          const dateB = getBookingDateTime(b) || 0;
                          return dateA - dateB; // Earliest first
                        });
                        
                        if (upcomingBookings && upcomingBookings.length > 0) {
                          const nextLesson = upcomingBookings[0];
                          const dt = getBookingDateTime(nextLesson);
                          return dt ? new Date(dt).toLocaleDateString() : 'TBD';
                        }
                        return 'No lessons scheduled';
                      })()}
                    </p>
                  </div>
                </div>

                {/* Upcoming Lessons List */}
                {(() => {
                  const upcomingBookings = bookings?.filter((b) => {
                    if (!b || b.status === 'cancelled') return false;
                    const now = new Date();
                    const dt = getBookingDateTime(b);
                    return dt ? dt > now : false;
                  }).sort((a, b) => {
                    const dateA = getBookingDateTime(a) || 0;
                    const dateB = getBookingDateTime(b) || 0;
                    return dateA - dateB; // Earliest first
                  });

                  if (!upcomingBookings || upcomingBookings.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        <div className="text-lg mb-2">📅</div>
                        <div>No upcoming lessons scheduled</div>
                        <div className="text-sm">Click "Schedule New Lesson" to get started</div>
                      </div>
                    );
                  }

                  const displayedLessons = showAllUpcoming ? upcomingBookings : upcomingBookings.slice(0, 3);

                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium text-gray-700">Scheduled Lessons</h4>
                        {upcomingBookings.length > 3 && (
                          <Button 
                            type="link" 
                            size="small"
                            onClick={() => setShowAllUpcoming(!showAllUpcoming)}
                          >
                            {showAllUpcoming ? 'Show Less' : `Show All (${upcomingBookings.length})`}
                          </Button>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {displayedLessons.map(lesson => {
                          const dt = getBookingDateTime(lesson);
                          const instructor = instructors.find(i => i.id === (lesson.instructor_user_id || lesson.instructor_id));
                          
                          return (
                            <div key={lesson.id} className="p-3 bg-blue-50 rounded border border-blue-200">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-medium text-gray-800">
                                    {lesson.booking_type || 'Standard'} Lesson
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    Date: {dt ? new Date(dt).toLocaleDateString() : 'TBD'} 
                                    {lesson.startTime && ` at ${lesson.startTime}`}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Instructor: {instructor?.name || lesson.instructor_name || 'TBD'}
                                  </div>
                                </div>
                                <div className="ml-4 text-right">
                                  <div className="text-xs">
                                    {getStatusTag(lesson.status)}
                                  </div>
                                  <Button 
                                    type="link" 
                                    size="small"
                                    onClick={() => handleViewBooking(lesson)}
                                  >
                                    View Details
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                </>
                )}

              </Card>
            </Col>
            
            {/* Removed Attendance Rate and Total Rentals mini dashboard */}
            
            <Col xs={24}>              <Card variant="outlined" className="shadow-md mt-4">
                <Tabs 
                  activeKey={activeTabKey}
                  onChange={handleTabSwitchWithScroll}
                  items={[
                    {
                      key: "total",
                      label: (
                        <span>
                          <ClockCircleOutlined /> Total History
                        </span>
                      ),
                      children: (
                        (bookings.length > 0 || rentals.length > 0) ? (
                          <UnifiedResponsiveTable 
                            title="All Activity" 
                            density="comfortable"
                            columns={[
                          {
                            title: 'Date',
                            dataIndex: 'date',
                            key: 'date',
                            render: (date) => formatDateOnly(date),
                          },
                          {
                            title: 'Type',
                            dataIndex: 'type',
                            key: 'type',
                            render: (type) => (
                              <Tag color={type === 'lesson' ? 'blue' : 'orange'}>
                                {type.toUpperCase()}
                              </Tag>
                            ),
                          },
                          {
                            title: 'Description',
                            dataIndex: 'description',
                            key: 'description',
                          },
                          {
                            title: 'Status',
                            dataIndex: 'status',
                            key: 'status',
                            render: (status) => getStatusTag(status),
                          },
                          {
                            title: 'Actions',
                            key: 'actions',
                            render: (_, record) => (
                              <Button 
                                type="link" 
                                size="small"
                                onClick={() => {
                                  if (record.type === 'lesson') {
                                    handleViewBooking(record);
                                  } else if (record.type === 'rental') {
                                    handleViewRental(record);
                                  }
                                }}
                              >
                                View Details
                              </Button>
                            ),
                          },
                        ]}
                        dataSource={[
                          ...(bookings || []).filter(booking => booking && booking.id).map(booking => ({
                            id: booking.id,
                            date: booking.date, // Use the date field from backend
                            type: 'lesson',
                            description: `${booking.booking_type || 'Standard'} Lesson`,
                            status: booking.status,
                          })),
                          ...(rentals || []).filter(rental => rental && rental.id).map(rental => ({
                            id: rental.id,
                            date: rental.rental_date,
                            type: 'rental',
                            description: `${rental.equipment_name || 'Equipment'} Rental`,
                            status: rental.status,
                          })),
                        ]}
                        mobileCardRenderer={ActivityMobileCard}
                        rowKey="id"
                        pagination={{ pageSize: 5 }}
                        onRowClick={(record) => {
                          if (record?.type === 'lesson') {
                            const full = (bookings || []).find(b => b && b.id === record.id) || record;
                            handleViewBooking(full);
                          } else if (record?.type === 'rental') {
                            const full = (rentals || []).find(r => r && r.id === record.id) || record;
                            handleViewRental(full);
                          }
                        }}
                          />
                        ) : (
                          <Empty description="No activity history found" />
                        )
                      )
                    },
                    {
                      key: "bookings",
                      label: (
                        <span>
                          <CalendarOutlined /> Lesson History
                        </span>
                      ),
                      children: (
                        bookings.length > 0 ? (
                          <UnifiedResponsiveTable 
                            title="Lesson History" 
                            density="comfortable"
                            columns={bookingColumns} 
                              dataSource={bookings} 
                            mobileCardRenderer={BookingMobileCard}
                            rowKey="id"
                            pagination={{ pageSize: 5 }}
                            onRowClick={(record) => handleViewBooking(record)}
                          />
                        ) : (
                          <Empty description="No lesson history found" />
                        )
                      )
                    },
                    {
                      key: "rentals",
                      label: (
                        <span>
                          <ShoppingOutlined /> Rental History
                        </span>
                      ),
                      children: (
                        rentals.length > 0 ? (
                          <UnifiedResponsiveTable 
                            title="Rental History" 
                            density="comfortable"
                            columns={rentalColumns} 
                            dataSource={rentals} 
                            mobileCardRenderer={RentalMobileCard}
                            rowKey="id"
                            pagination={{ pageSize: 5 }}
                            onRowClick={(record) => handleViewRental(record)}
                          />
                        ) : (
                          <Empty description="No rental history found" />
                        )
                      )
                    },
                    // Package History tab removed
                    {
                      key: "financial",
                      label: (
                        <span>
                          <DollarOutlined /> Financial History
                        </span>
                      ),
                      children: (
                        <div>
                          {/* Reset Wallet Button - Admin only */}
                          <div className="mb-4 flex justify-between items-center">
                            <div>
                              <Text type="secondary">
                                {transactions?.length || 0} transaction(s) found
                              </Text>
                            </div>
                            <Button 
                              danger
                              onClick={handleResetWalletBalance}
                              icon={<DeleteOutlined />}
                            >
                              Reset Wallet / Clear All Data
                            </Button>
                          </div>
                          
                          <UnifiedResponsiveTable 
                            title="Financial History" 
                            density="comfortable"
                            columns={[
                            {
                              title: 'Date',
                              dataIndex: 'createdAt',
                              key: 'createdAt',
                              render: (date) => {
                                if (!date || date === 'Invalid Date' || date === 'null' || date === 'undefined') {
                                  return 'N/A';
                                }
                                try {
                                  const dateObj = new Date(date);
                                  if (isNaN(dateObj.getTime())) {
                                    return 'N/A';
                                  }
                                  return dateObj.toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  });
                                } catch (error) {
                                  console.error('Date formatting error:', error);
                                  return 'N/A';
                                }
                              },
                              sorter: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
                            },
                            {
                              title: 'Amount',
                              dataIndex: 'amount',
                              key: 'amount',
                              render: (amount, record) => formatCurrency(amount || 0, record.currency || storageCurrency),
                              sorter: (a, b) => (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0),
                            },
                            {
                              title: 'Type',
                              dataIndex: 'type',
                              key: 'type',
                              render: (type) => {
                                const color = type === 'payment' ? 'green' : type === 'refund' ? 'orange' : 'blue';
                                return <Tag color={color}>{type?.toUpperCase() || 'N/A'}</Tag>;
                              },
                            },
                            {
                              title: 'Description',
                              dataIndex: 'description',
                              key: 'description',
                              render: (desc) => desc || 'N/A',
                            },
                            {
                              title: 'Status',
                              dataIndex: 'status',
                              key: 'status',
                              render: (status) => {
                                const color = status === 'completed' ? 'green' : status === 'pending' ? 'orange' : 'red';
                                return <Tag color={color}>{status?.toUpperCase() || 'N/A'}</Tag>;
                              },
                            },
                            {
                              title: 'Actions',
                              key: 'actions',
                              render: (_, record) => (
                                <Space size="small">
                                  <Button 
                                    type="link" 
                                    size="small" 
                                    onClick={() => handleViewTransaction && handleViewTransaction(record)}
                                  >
                                    View
                                  </Button>
                                  <Button 
                                    type="link" 
                                    size="small" 
                                    danger
                                    onClick={() => handleDeleteTransaction && handleDeleteTransaction(record)}
                                  >
                                    Delete
                                  </Button>
                                </Space>
                              ),
                            },
                          ]}
                          dataSource={transactions}
                          mobileCardRenderer={TransactionMobileCard}
                          rowKey="id"
                          pagination={{ pageSize: 10 }}
                          onRowClick={handleViewTransaction}
                        />
                        </div>
                      )
                    },
                    {
                      key: "memberships",
                      label: (
                        <span>
                          <CrownOutlined /> Memberships
                        </span>
                      ),
                      children: (
                        <Suspense fallback={<Spin />}>
                          <MemberPurchasesSection 
                            userId={parseInt(id, 10)} 
                            isAdminView={true}
                          />
                        </Suspense>
                      )
                    }
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>
      
      <Modal
        title="Review Linked Items Before Deleting Transaction"
        open={dependencyModalVisible}
        onCancel={handleDependencyModalCancel}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={handleDependencyModalCancel} disabled={dependencyFetchLoading}>
            Cancel
          </Button>,
          <Button
            key="force"
            danger
            onClick={() => {
              if (!selectedTransaction) {
                return;
              }
              Modal.confirm({
                title: 'Delete transaction without removing linked items?',
                content:
                  'The linked lessons, packages, or rentals will remain active and may create inconsistencies. Continue deleting the transaction only?',
                okText: 'Delete transaction only',
                okType: 'danger',
                cancelText: 'Cancel',
                onOk: () => performTransactionDeletion(selectedTransaction, { force: true })
              });
            }}
            disabled={dependencyFetchLoading}
          >
            Delete transaction only
          </Button>,
          <Button
            key="confirm"
            type="primary"
            danger
            onClick={handleDependencyDeleteConfirm}
            loading={dependencyFetchLoading}
            disabled={dependencyConfirmDisabled}
          >
            Delete selected items & transaction
          </Button>
        ]}
      >
        <Spin spinning={dependencyFetchLoading}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Text>
              {selectedTransaction
                ? `Transaction ${formatCurrency(
                    Math.abs(parseFloat(selectedTransaction.amount || 0)),
                    selectedTransaction.currency || businessCurrency
                  )} is linked to ${dependencySummaryText}. Select the records you also want to remove before deleting the transaction.`
                : `This transaction is linked to ${dependencySummaryText}. Select the records you also want to remove before deleting the transaction.`}
            </Text>
            <Alert
              type="warning"
              showIcon
              message="Deleting linked lessons, packages, or rentals is permanent"
              description="Affected instructors will be notified, reserved slots will open up, and package/rental balances will be adjusted. Unselect any records you want to keep."
            />
            {packageStrategySelectionInvalid && selectedDependencyPackageIds.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                message="Select how each package should be handled"
                description="Choose whether to charge for used hours or delete the lessons before continuing."
              />
            ) : null}
            {dependencyFetchError ? (
              <Alert type="error" showIcon message={dependencyFetchError} />
            ) : null}
            {hasAnyDependencies ? (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {dependencyBookings.length > 0 && (
                  <div>
                    <Divider orientation="left" className="!mt-2">
                      Lessons ({selectedDependencyBookingIds.length}/{dependencyBookings.length})
                    </Divider>
                    <List
                      dataSource={dependencyBookings}
                      renderItem={(booking) => {
                        const isChecked = selectedDependencyBookingIds.includes(booking.id);
                        const dateLabel = formatDateOnly(booking.date) || formatDate(booking.start_hour) || 'N/A';
                        const timeLabel = booking.start_hour || booking.start_time;
                        const statusLabel = booking.status ? booking.status.replace('-', ' ') : 'scheduled';

                        return (
                          <List.Item key={booking.id}>
                            <Checkbox
                              checked={isChecked}
                              onChange={(event) => {
                                const { checked } = event.target;
                                setSelectedDependencyBookingIds((prev) => {
                                  if (checked) {
                                    return prev.includes(booking.id) ? prev : [...prev, booking.id];
                                  }
                                  return prev.filter((idValue) => idValue !== booking.id);
                                });
                              }}
                            >
                              <Space direction="vertical" size={0}>
                                <Text strong>{booking.service_name || 'Lesson'}</Text>
                                <Text type="secondary">
                                  {dateLabel}
                                  {timeLabel ? ` • ${timeLabel}` : ''}
                                  {` • ${statusLabel}`}
                                </Text>
                              </Space>
                            </Checkbox>
                          </List.Item>
                        );
                      }}
                    />
                  </div>
                )}
                {dependencyPackages.length > 0 && (
                  <div>
                    <Divider orientation="left" className="!mt-0">
                      Packages ({selectedDependencyPackageIds.length}/{dependencyPackages.length})
                    </Divider>
                    <List
                      dataSource={dependencyPackages}
                      renderItem={(pkg) => {
                        const isChecked = selectedDependencyPackageIds.includes(pkg.id);
                        const usage = extractPackageUsage(pkg);
                        const packageNames = [pkg.lessonServiceName, pkg.packageName]
                          .filter(Boolean)
                          .filter((value, index, array) => array.indexOf(value) === index);
                        const strategyEntry = packageCascadeOptions[pkg.id];
                        const strategyValue = strategyEntry?.strategy || resolveDefaultPackageStrategy(pkg);
                        const allowNegative = strategyEntry?.allowNegative !== false;
                        const disableChargeUsed = usage.usedHours <= 0;
                        const currencyForPackage = pkg.currency || businessCurrency;

                        return (
                          <List.Item key={pkg.id}>
                            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                              <Checkbox
                                checked={isChecked}
                                onChange={(event) => {
                                  const { checked } = event.target;
                                  setSelectedDependencyPackageIds((prev) => {
                                    if (checked) {
                                      return prev.includes(pkg.id) ? prev : [...prev, pkg.id];
                                    }
                                    return prev.filter((idValue) => idValue !== pkg.id);
                                  });
                                }}
                              >
                                <Space direction="vertical" size={0}>
                                  <Text strong>{pkg.packageName || pkg.lessonServiceName || 'Package'}</Text>
                                  {packageNames.length > 0 ? (
                                    <Text type="secondary">{packageNames.join(' • ')}</Text>
                                  ) : null}
                                  <Text type="secondary">
                                    {formatHoursValue(usage.usedHours)} used • {formatHoursValue(usage.remainingHours)} remaining
                                  </Text>
                                  <Text type="secondary">
                                    Consumed value {formatCurrency(Math.abs(usage.usedAmount) || 0, currencyForPackage)} • Remaining value {formatCurrency(Math.abs(usage.remainingAmount) || 0, currencyForPackage)}
                                  </Text>
                                  {pkg.status ? (
                                    <Text type="secondary">{pkg.status.replace(/_/g, ' ')}</Text>
                                  ) : null}
                                </Space>
                              </Checkbox>
                              {isChecked ? (
                                <div className="pl-6">
                                  <Radio.Group
                                    value={strategyValue}
                                    onChange={(event) => updatePackageCascadeOption(pkg.id, { strategy: event.target.value })}
                                  >
                                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                      <Radio value="charge-used" disabled={disableChargeUsed}>
                                        <Space direction="vertical" size={0}>
                                          <Text strong>Charge used hours only</Text>
                                          <Text type="secondary">
                                            Keep assigned lessons and debit {formatCurrency(Math.abs(usage.usedAmount) || 0, currencyForPackage)} for {formatHoursValue(usage.usedHours)} consumed.
                                          </Text>
                                          {disableChargeUsed ? (
                                            <Text type="secondary">No usage recorded yet for this package.</Text>
                                          ) : null}
                                        </Space>
                                      </Radio>
                                      <Radio value="delete-all-lessons">
                                        <Space direction="vertical" size={0}>
                                          <Text strong>Delete lessons & package</Text>
                                          <Text type="secondary">
                                            Remove every lesson tied to this package. No additional wallet charge will be applied.
                                          </Text>
                                        </Space>
                                      </Radio>
                                    </Space>
                                  </Radio.Group>
                                  {strategyValue === 'charge-used' ? (
                                    <div className="mt-2 flex items-center gap-2 text-xs">
                                      <Switch
                                        checked={allowNegative}
                                        onChange={(checked) => updatePackageCascadeOption(pkg.id, { allowNegative: checked })}
                                      />
                                      <Text type="secondary">
                                        {allowNegative
                                          ? 'Allow wallet to go negative if needed to settle this charge.'
                                          : 'Block the charge if it would overdraw the wallet.'}
                                      </Text>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </Space>
                          </List.Item>
                        );
                      }}
                    />
                  </div>
                )}
                {dependencyRentals.length > 0 && (
                  <div>
                    <Divider orientation="left" className="!mt-0">
                      Rentals ({selectedDependencyRentalIds.length}/{dependencyRentals.length})
                    </Divider>
                    <List
                      dataSource={dependencyRentals}
                      renderItem={(rental) => {
                        const isChecked = selectedDependencyRentalIds.includes(rental.id);
                        const startLabel = formatDateOnly(rental.startDate || rental.start_date || rental.rental_date || rental.createdAt);
                        const endLabel = rental.endDate
                          ? formatDateOnly(rental.endDate)
                          : null;
                        const rangeLabel = startLabel && endLabel && startLabel !== endLabel
                          ? `${startLabel} → ${endLabel}`
                          : startLabel;
                        const amountLabel = formatCurrency(
                          Math.abs(Number.parseFloat(rental.totalPrice || rental.total_price || 0) || 0),
                          rental.currency || businessCurrency
                        );
                        const statusLabel = rental.status ? rental.status.replace(/_/g, ' ') : 'pending';

                        return (
                          <List.Item key={rental.id}>
                            <Checkbox
                              checked={isChecked}
                              onChange={(event) => {
                                const { checked } = event.target;
                                setSelectedDependencyRentalIds((prev) => {
                                  if (checked) {
                                    return prev.includes(rental.id) ? prev : [...prev, rental.id];
                                  }
                                  return prev.filter((idValue) => idValue !== rental.id);
                                });
                              }}
                            >
                              <Space direction="vertical" size={0}>
                                <Text strong>{rental.equipmentSummary || 'Rental'}</Text>
                                {rangeLabel ? <Text type="secondary">{rangeLabel}</Text> : null}
                                <Text type="secondary">
                                  {amountLabel}
                                  {` • ${statusLabel}`}
                                </Text>
                              </Space>
                            </Checkbox>
                          </List.Item>
                        );
                      }}
                    />
                  </div>
                )}
              </Space>
            ) : (
              <Empty description="No linked records detected." />
            )}
          </Space>
        </Spin>
      </Modal>

  {/* Package Details Modal removed */}

      {/* Add Funds Modal */}
      <Modal
        title={
          <div className="flex items-center">
            <PlusCircleOutlined className="text-green-600 mr-2" />
            <span>Add Balance to Account</span>
          </div>
        }
        open={showAddFundsModal}
        onCancel={() => setShowAddFundsModal(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={paymentForm}
          layout="vertical"
          onFinish={handleAddFunds}
          initialValues={{
            amount: '',
            description: '',
            paymentMethod: 'cash',
            referenceNumber: ''
          }}
        >
          <Form.Item
            name="amount"
            label={`Amount (${currencySymbol})`}
            rules={[
              { required: true, message: 'Please enter the amount' },
              { type: 'number', min: 0.01, message: 'Amount must be greater than 0' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              step={5}
              min={0.01}
              precision={2}
              prefix={currencySymbol}
              placeholder="Enter amount"
            />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Please enter a description' }]}
          >
            <Input placeholder="e.g., Deposit for lessons, Account credit" />
          </Form.Item>
          
          <Form.Item
            name="paymentMethod"
            label="Payment Method"
          >
            <Select>
              <Option value="cash">Cash</Option>
              <Option value="credit_card">Credit Card</Option>
              <Option value="bank_transfer">Bank Transfer</Option>
              <Option value="paypal">PayPal</Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="referenceNumber"
            label="Reference Number"
          >
            <Input placeholder="Transaction ID, receipt number, etc." />
          </Form.Item>
          
          <Form.Item className="mb-0">
            <div className="flex justify-end">
              <Button 
                style={{ marginRight: 8 }} 
                onClick={() => setShowAddFundsModal(false)}
              >
                Cancel
              </Button>
              <Button 
                type="primary"
                htmlType="submit"
                loading={paymentProcessing}
                icon={<PlusCircleOutlined />}
              >
                Add Funds
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* Refund Modal */}
      <Modal
        title={
          <div className="flex items-center">
            <DollarOutlined className="text-blue-600 mr-2" />
            <span>Process Refund</span>
          </div>
        }
        open={showRefundModal}
        onCancel={() => setShowRefundModal(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={refundForm}
          layout="vertical"
          onFinish={handleProcessRefund}
          initialValues={{
            amount: '',
            description: 'Manual refund',
            relatedEntityType: 'manual'
          }}
        >
          <Form.Item
            name="amount"
            label={`Refund Amount (${currencySymbol})`}
            rules={[
              { required: true, message: 'Please enter the refund amount' },
              { type: 'number', min: 0.01, message: 'Amount must be greater than 0' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              step={5}
              min={0.01}
              precision={2}
              prefix={currencySymbol}
              placeholder="Enter refund amount"
            />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Refund Reason"
            rules={[{ required: true, message: 'Please enter a reason for the refund' }]}
          >
            <Input placeholder="e.g., Canceled lesson, Service issue" />
          </Form.Item>
          
          <Form.Item
            name="relatedEntityType"
            label="Related To"
          >
            <Select>
              <Option value="manual">Manual Refund</Option>
              <Option value="lesson">Lesson</Option>
              <Option value="rental">Equipment Rental</Option>
              <Option value="package">Lesson Package</Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="relatedEntityId"
            label="Reference ID"
          >
            <Input placeholder="Booking ID, Rental ID, etc. (optional)" />
          </Form.Item>
          
          <Form.Item className="mb-0">
            <div className="flex justify-end">
              <Button 
                style={{ marginRight: 8 }} 
                onClick={() => setShowRefundModal(false)}
              >
                Cancel
              </Button>
              <Button 
                type="primary"
                htmlType="submit"
                loading={paymentProcessing}
                icon={<DollarOutlined />}
              >
                Process Refund
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* Charge Modal */}
      <Modal
        title={
          <div className="flex items-center">
            <MinusCircleOutlined className="text-red-600 mr-2" />
            <span>Process Charge</span>
          </div>
        }
        open={showChargeModal}
        onCancel={() => setShowChargeModal(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={chargeForm}
          layout="vertical"
          onFinish={handleProcessCharge}
          initialValues={{
            amount: '',
            description: 'Manual charge',
            type: 'service_payment',
            relatedEntityType: 'manual'
          }}
        >
          <Form.Item
            name="amount"
            label={`Charge Amount (${currencySymbol})`}
            rules={[
              { required: true, message: 'Please enter the charge amount' },
              { type: 'number', min: 0.01, message: 'Amount must be greater than 0' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              step={5}
              min={0.01}
              precision={2}
              prefix={currencySymbol}
              placeholder="Enter charge amount"
            />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Charge Description"
            rules={[{ required: true, message: 'Please enter a description for the charge' }]}
          >
            <Input placeholder="e.g., Additional lesson, Equipment repair" />
          </Form.Item>
          
          <Form.Item
            name="type"
            label="Transaction Type"
          >
            <Select>
              <Option value="service_payment">Service Payment</Option>
              <Option value="rental_payment">Rental Payment</Option>
              <Option value="charge">General Charge</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="relatedEntityType"
            label="Related To"
          >
            <Select>
              <Option value="manual">Manual Charge</Option>
              <Option value="lesson">Lesson</Option>
              <Option value="rental">Equipment Rental</Option>
              <Option value="package">Lesson Package</Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="relatedEntityId"
            label="Reference ID"
          >
            <Input placeholder="Booking ID, Rental ID, etc. (optional)" />
          </Form.Item>
          
          <Alert
            message="Note"
            description={
              userAccount?.currentBalance < 0 
                ? "This customer's account already has a negative balance. This charge will increase their outstanding balance."
                : "This will deduct funds from the customer's account balance."
            }
            type="warning"
            showIcon
            className="mb-4"
          />
          
          <Form.Item className="mb-0">
            <div className="flex justify-end">
              <Button 
                style={{ marginRight: 8 }} 
                onClick={() => setShowChargeModal(false)}
              >
                Cancel
              </Button>
              <Button 
                type="primary"
                danger
                htmlType="submit"
                loading={paymentProcessing}
                icon={<MinusCircleOutlined />}
              >
                Process Charge
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <FloatingActionLauncher
        title="Customer actions"
        subtitle={customerFullName}
        actions={quickActions}
        backAction={{
          onClick: () => navigate('/customers'),
          icon: ArrowLeftOutlined,
          tooltip: 'Back to customers',
          ariaLabel: 'Back to customers'
        }}
      />

      {/* Package Manager Modal */}
      <Suspense fallback={<Spin size="small" />}>
        {packageManagerVisible && (
          <CustomerPackageManager
            visible={packageManagerVisible}
            onClose={() => {
              setPackageManagerVisible(false);
              setStartAssignFlow(false);
              // Refresh financial data when closing package manager
              reloadCustomerPackages();
            }}
            customer={customer}
            startAssignFlow={startAssignFlow}
            onPackageAssigned={(_packageData) => {
              // Reload customer packages to reflect changes
              reloadCustomerPackages();
              message.success(`Package assigned to ${customer.name}`);
            }}
          />
        )}
      </Suspense>

      {/* Customer Step Booking Modal */}
      {bookingModalVisible && (
        <CalendarProvider>
          <Suspense fallback={<Spin size="small" />}>
            <StepBookingModal
              isOpen={bookingModalVisible}
              onClose={() => setBookingModalVisible(false)}
              prefilledCustomer={customer}
              prefilledInstructor={getLastUsedInstructor()}
              onBookingCreated={async (_booking) => {
                // Refresh all customer data after booking creation
                await refreshAllCustomerData();
                message.success('Booking created successfully!');
                setBookingModalVisible(false);
              }}
            />
          </Suspense>
        </CalendarProvider>
      )}

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <Suspense fallback={<Spin size="small" />}>
          <BookingDetailModal
            visible={bookingDetailModalVisible}
            onClose={async () => {
              setBookingDetailModalVisible(false);
              setSelectedBooking(null);
              // Refresh data in case changes were made
              await refreshAllCustomerData();
            }}
            bookingId={selectedBooking.id}
            onBookingUpdated={handleBookingUpdated}
            onBookingDeleted={handleBookingDeleted}
          />
        </Suspense>
      )}

      {/* Rental Detail Modal */}
      {selectedRental && (
        <Suspense fallback={<Spin size="small" />}>
          <RentalDetailModal
            visible={rentalDetailModalVisible}
            onClose={async () => {
              setRentalDetailModalVisible(false);
              setSelectedRental(null);
              // Refresh data in case changes were made
              await refreshAllCustomerData();
            }}
            rentalId={selectedRental.id}
            onRentalUpdated={handleRentalUpdated}
            onRentalDeleted={handleRentalDeleted}
          />
        </Suspense>
      )}

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <Suspense fallback={<Spin size="small" />}>
          <TransactionDetailModal
            visible={transactionDetailModalVisible}
            onClose={async () => {
              setTransactionDetailModalVisible(false);
              setSelectedTransaction(null);
              // Refresh data in case changes were made
              await refreshAllCustomerData();
            }}
            transaction={selectedTransaction}
            onTransactionUpdated={handleTransactionUpdated}
            onTransactionDeleted={handleTransactionDeleted}
            onRequestDelete={handleDeleteTransaction}
          />
        </Suspense>
      )}

      {/* Edit Profile Modal */}
      <Modal
        title="Edit Customer Profile"
        open={showEditProfileModal}
        onCancel={() => {
          setShowEditProfileModal(false);
          editProfileForm.resetFields();
        }}
        footer={null}
        width={800}
        destroyOnHidden
      >
        {/* Inline financial actions within edit form context */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-gray-500 text-sm">Account actions</span>
          <Space size="small" wrap={false}>
            <Button 
              size="small"
              icon={<PlusCircleOutlined />} 
              onClick={() => setShowAddFundsModal(true)}
            >
              Add Balance
            </Button>
            <Button 
              size="small"
              danger
              icon={<MinusCircleOutlined />} 
              onClick={() => setShowChargeModal(true)}
            >
              Charge
            </Button>
          </Space>
        </div>
        <Divider className="mt-0" />
        <UserForm
          user={customer}
          roles={[]}
          onSuccess={() => {
            setShowEditProfileModal(false);
            editProfileForm.resetFields();
          }}
          onCancel={() => {
            setShowEditProfileModal(false);
            editProfileForm.resetFields();
          }}
          isModal={true}
          customSubmit={handleEditProfile}
        />
      </Modal>
    </div>
  );
}

export default CustomerProfilePage;