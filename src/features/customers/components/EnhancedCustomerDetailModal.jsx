/* eslint-disable no-console, complexity */
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import {
  Drawer, Tag, Spin, Avatar, Typography, Empty, Button, Space,
  Form, Input, InputNumber, Select, Modal, Alert, Tooltip,
  Checkbox, List, Radio, Switch, Divider, App, DatePicker
} from 'antd';
import dayjs from 'dayjs';
import { message } from '@/shared/utils/antdStatic';
import {
  UserOutlined, MailOutlined, PhoneOutlined,
  CalendarOutlined, ShoppingOutlined, ClockCircleOutlined,
  DollarOutlined, GiftOutlined, PlusOutlined,
  CreditCardOutlined, EditOutlined, DeleteOutlined,
  HomeOutlined, BookOutlined, CloseOutlined,
  PlusCircleOutlined, MinusCircleOutlined,
  FieldTimeOutlined, DashboardOutlined, CrownOutlined,
  LineChartOutlined, FileTextOutlined
} from '@ant-design/icons';
import DataService from '@/shared/services/dataService';
import FinancialService from '../../finances/services/financialService';
import requestThrottle from '@/shared/utils/requestThrottle';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import UserForm from '@/shared/components/ui/UserForm';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import {
  TransactionMobileCard,
  BookingMobileCard,
  RentalMobileCard,
} from '@/components/ui/MobileCardRenderers';
import { CalendarProvider } from '../../bookings/components/contexts/CalendarContext';
import { fetchCustomerDiscounts } from './customerBill/discountApi';
import { indexDiscounts } from './customerBill/billAggregator';

const CustomerPackageManager = lazy(() => import('./CustomerPackageManager'));
const BookingDrawer = lazy(() => import('../../bookings/components/components/BookingDrawer'));
const BookingDetailModal = lazy(() => import('./BookingDetailModal'));
const RentalDetailModal = lazy(() => import('./RentalDetailModal'));
const TransactionDetailModal = lazy(() => import('./TransactionDetailModal'));
const MemberPurchasesSection = lazy(() => import('../../members/components/MemberPurchasesSection'));
const CustomerShopHistory = lazy(() => import('./CustomerShopHistory'));
const CustomerBillModal = lazy(() => import('./CustomerBillModal'));
const CustomerDiscountsTab = lazy(() => import('./CustomerDiscountsTab'));
const ApplyDiscountModal = lazy(() => import('./ApplyDiscountModal'));
const EditPackagePriceModal = lazy(() => import('./EditPackagePriceModal'));

const { Text } = Typography;
const { Option } = Select;

const PACKAGE_STRATEGY_SET = new Set(['delete-all-lessons', 'charge-used']);
const PACKAGE_DEFAULT_STRATEGY = 'delete-all-lessons';

const coerceNumber = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const formatHoursValue = (value) => {
  if (!Number.isFinite(value)) return '0h';
  const safe = Math.max(0, value);
  return `${Number.isInteger(safe) ? safe : safe.toFixed(1)}h`;
};

const extractPackageUsage = (pkg = {}) => {
  const usage = pkg.usageSummary || {};
  const totalHours = coerceNumber(pkg.totalHours ?? pkg.total_hours ?? usage.totalHours ?? usage.total_hours, 0);
  const usedHours = coerceNumber(pkg.usedHours ?? pkg.used_hours ?? usage.usedHours ?? usage.used_hours, 0);
  const rawRemaining = pkg.remainingHours ?? pkg.remaining_hours ?? usage.remainingHours ?? usage.remaining_hours;
  const remainingHours = coerceNumber(rawRemaining, Math.max(0, totalHours - usedHours));
  const purchasePrice = coerceNumber(pkg.purchasePrice ?? pkg.purchase_price ?? usage.purchasePrice ?? usage.purchase_price, 0);
  const pricePerHour = coerceNumber(usage.pricePerHour ?? usage.price_per_hour, totalHours > 0 ? purchasePrice / totalHours : 0);
  const usedAmount = coerceNumber(usage.usedAmount ?? usage.used_amount, usedHours * pricePerHour);
  const remainingAmount = coerceNumber(usage.remainingAmount ?? usage.remaining_amount, remainingHours * pricePerHour);
  return { totalHours, usedHours, remainingHours, purchasePrice, pricePerHour, usedAmount, remainingAmount };
};

const resolveDefaultPackageStrategy = (pkg) => {
  const usage = extractPackageUsage(pkg);
  return usage.usedHours > 0 ? 'charge-used' : PACKAGE_DEFAULT_STRATEGY;
};

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
        [hh, mm] = timeStr.split(':').map(Number);
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

const NAV_ITEMS = [
  { key: 'profile', icon: <UserOutlined />, label: 'Profile' },
  { key: 'packages', icon: <GiftOutlined />, label: 'Packages' },
  { key: 'bookings', icon: <CalendarOutlined />, label: 'Bookings' },
  { key: 'rentals', icon: <ShoppingOutlined />, label: 'Rentals' },
  { key: 'accommodation', icon: <HomeOutlined />, label: 'Accommodation' },
  { key: 'shop', icon: <ShoppingOutlined />, label: 'Shop' },
  { key: 'memberships', icon: <CrownOutlined />, label: 'Memberships' },
  { key: 'discounts', icon: <FieldTimeOutlined />, label: 'Discounts' },
  { key: 'financial', icon: <DollarOutlined />, label: 'Financial' },
];

const SECTION_DESCRIPTIONS = {
  profile: 'Contact information and quick highlights',
  packages: 'Assigned lesson packages',
  bookings: 'Lesson history and scheduling',
  rentals: 'Equipment rental history',
  accommodation: 'Stay and accommodation booking history',
  financial: 'Transactions, balance, and wallet management',
  shop: 'Shop order history',
  memberships: 'Membership purchases',
  discounts: 'Per-line discounts — bulk-apply % off any selection',
};

const EnhancedCustomerDetailModal = ({ customer: customerProp, isOpen, onClose, onUpdate = () => {}, readOnly = false }) => {
  const { user: currentUser } = useAuth();
  const { formatCurrency: fmtCurrency, getCurrencySymbol, businessCurrency, convertCurrency, getSupportedCurrencies } = useCurrency();
  const { modal } = App.useApp();

  // ─── State ────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [customerPackages, setCustomerPackages] = useState([]);
  const [accommodationBookings, setAccommodationBookings] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  // Per-row Apply Discount modal state — set when staff clicks "Discount" on
  // a booking / rental / accommodation / package / membership row.
  const [discountTarget, setDiscountTarget] = useState(null); // { entityType, entityId, originalPrice, currency, description }
  // Per-row Edit Package Price modal state — set when staff clicks "Edit Price"
  // on a customer package row in the Packages tab.
  const [editPriceTarget, setEditPriceTarget] = useState(null); // { packageId, currentPrice, originalPrice, currency, description }
  const hasFetchedRef = useRef(false);

  // Modal states
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [addFundsCurrency, setAddFundsCurrency] = useState(null); // null = will default to storageCurrency on open
  const [addFundsAmount, setAddFundsAmount] = useState(null);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [packageManagerVisible, setPackageManagerVisible] = useState(false);
  const [startAssignFlow, setStartAssignFlow] = useState(false);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingDetailModalVisible, setBookingDetailModalVisible] = useState(false);
  const [rentalDetailModalVisible, setRentalDetailModalVisible] = useState(false);
  const [transactionDetailModalVisible, setTransactionDetailModalVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedRental, setSelectedRental] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [billModalVisible, setBillModalVisible] = useState(false);

  // Dependency delete state
  const [transactionDependencyInfo, setTransactionDependencyInfo] = useState(null);
  const [dependencyModalVisible, setDependencyModalVisible] = useState(false);
  const [dependencyFetchLoading, setDependencyFetchLoading] = useState(false);
  const [dependencyFetchError, setDependencyFetchError] = useState(null);
  const [selectedDependencyBookingIds, setSelectedDependencyBookingIds] = useState([]);
  const [selectedDependencyPackageIds, setSelectedDependencyPackageIds] = useState([]);
  const [selectedDependencyRentalIds, setSelectedDependencyRentalIds] = useState([]);
  const [packageCascadeOptions, setPackageCascadeOptions] = useState({});

  const [paymentForm] = Form.useForm();
  const [chargeForm] = Form.useForm();

  // Local toggle for the Self Student checkbox so the Select can be enabled
  // before an instructor is actually chosen (commit happens on Select change).
  const [selfStudentEnabled, setSelfStudentEnabled] = useState(false);

  // ─── Currency helpers ─────────────────────────────────────────
  const isStaff = useMemo(() => {
    const staffRoles = ['admin', 'manager', 'developer', 'instructor'];
    return currentUser && staffRoles.includes(currentUser.role?.toLowerCase());
  }, [currentUser]);

  const isAdmin = currentUser && ['admin', 'manager'].includes(currentUser.role);
  const storageCurrency = businessCurrency || 'EUR';
  const walletCurrency = useMemo(() => userAccount?.currency || 'EUR', [userAccount?.currency]);
  const currencySymbol = useMemo(() => getCurrencySymbol(storageCurrency), [getCurrencySymbol, storageCurrency]);

  const fmt = useCallback((amount) => {
    const num = Number(amount) || 0;
    if (isStaff && walletCurrency !== storageCurrency) {
      return fmtCurrency(convertCurrency(num, walletCurrency, storageCurrency), storageCurrency);
    }
    return fmtCurrency(num, isStaff ? storageCurrency : walletCurrency);
  }, [fmtCurrency, storageCurrency, walletCurrency, isStaff, convertCurrency]);

  // ─── Auth headers ─────────────────────────────────────────────
  const buildAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);

  // ─── Data Fetching ────────────────────────────────────────────
  const customerId = customerProp?.id;

  const fetchCustomerData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const headers = buildAuthHeaders();
      const [customerResult, lessonsResult, rentalsResult, instructorsResult, balanceResult, transactionsResult, packagesResult, accommodationResult, discountsResult] =
        await Promise.allSettled([
          requestThrottle.execute(() => DataService.getUserById(customerId)),
          DataService.getLessonsByUserId(customerId),
          DataService.getRentalsByUserId(customerId),
          DataService.getInstructors(),
          FinancialService.getUserBalance(customerId, true),
          FinancialService.getUserTransactions(customerId),
          fetch(`/api/services/customer-packages/${customerId}`, { headers }).then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); }),
          fetch(`/api/accommodation/bookings?guestId=${customerId}&limit=200`, { headers }).then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); }),
          fetchCustomerDiscounts(customerId),
        ]);

      if (customerResult.status === 'fulfilled') setCustomer(customerResult.value);
      else { setLoading(false); return; }

      if (lessonsResult.status === 'fulfilled') {
        const arr = lessonsResult.value || [];
        setBookings(Array.from(new Map(arr.map(b => [b.id, b])).values()));
      } else setBookings([]);

      setRentals(rentalsResult.status === 'fulfilled' ? rentalsResult.value || [] : []);
      setInstructors(instructorsResult.status === 'fulfilled' ? instructorsResult.value || [] : []);
      setUserAccount(balanceResult.status === 'fulfilled' ? balanceResult.value : null);
      setTransactions(transactionsResult.status === 'fulfilled' ? transactionsResult.value || [] : []);

      if (packagesResult.status === 'fulfilled') {
        const arr = Array.isArray(packagesResult.value) ? packagesResult.value : [];
        setCustomerPackages(Array.from(new Map(arr.map(p => [p.id, p])).values()));
      } else setCustomerPackages([]);

      setAccommodationBookings(accommodationResult.status === 'fulfilled' && Array.isArray(accommodationResult.value) ? accommodationResult.value : []);
      setDiscounts(discountsResult.status === 'fulfilled' && Array.isArray(discountsResult.value) ? discountsResult.value : []);
    } catch (err) {
      console.error('Error loading customer data', err);
    } finally {
      setLoading(false);
    }
  }, [customerId, buildAuthHeaders]);

  const refreshAllData = useCallback(async () => {
    if (!customerId) return;
    const headers = buildAuthHeaders();
    const [balanceResult, transactionsResult, packagesResult, lessonsResult, rentalsResult, accommodationRefreshResult, discountsResult] = await Promise.allSettled([
      FinancialService.getUserBalance(customerId, true),
      FinancialService.getUserTransactions(customerId),
      fetch(`/api/services/customer-packages/${customerId}`, { headers }).then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); }),
      DataService.getLessonsByUserId(customerId),
      DataService.getRentalsByUserId(customerId),
      fetch(`/api/accommodation/bookings?guestId=${customerId}&limit=200`, { headers }).then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); }),
      fetchCustomerDiscounts(customerId),
    ]);
    if (balanceResult.status === 'fulfilled') setUserAccount(balanceResult.value);
    if (transactionsResult.status === 'fulfilled') setTransactions(transactionsResult.value || []);
    if (packagesResult.status === 'fulfilled') {
      const arr = Array.isArray(packagesResult.value) ? packagesResult.value : [];
      setCustomerPackages(Array.from(new Map(arr.map(p => [p.id, p])).values()));
    }
    if (lessonsResult.status === 'fulfilled') {
      const arr = lessonsResult.value || [];
      setBookings(Array.from(new Map(arr.map(b => [b.id, b])).values()));
    }
    if (rentalsResult.status === 'fulfilled') setRentals(rentalsResult.value || []);
    if (accommodationRefreshResult.status === 'fulfilled' && Array.isArray(accommodationRefreshResult.value)) {
      setAccommodationBookings(accommodationRefreshResult.value);
    }
    if (discountsResult.status === 'fulfilled' && Array.isArray(discountsResult.value)) {
      setDiscounts(discountsResult.value);
    }
  }, [customerId, buildAuthHeaders]);

  // Lightweight refresh: only re-fetch the discount list. Used after
  // ApplyDiscountModal saves so we don't bounce every other dataset.
  const refreshDiscounts = useCallback(async () => {
    if (!customerId) return;
    try {
      const list = await fetchCustomerDiscounts(customerId);
      setDiscounts(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to refresh discounts', err);
    }
  }, [customerId]);

  // Map<`${entity_type}:${entity_id}`, discountRow> — passed to bill aggregator
  // and used by per-tab "Apply Discount" buttons to show existing values.
  const discountsByEntity = useMemo(() => indexDiscounts(discounts), [discounts]);

  // Fetch once on open
  useEffect(() => {
    if (isOpen && customerId && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchCustomerData();
    }
    if (!isOpen) {
      hasFetchedRef.current = false;
      setActiveSection('profile');
      setAddFundsCurrency(null);
      setAddFundsAmount(null);
    }
  }, [isOpen, customerId, fetchCustomerData]);

  // Sync the checkbox with whatever the customer record currently holds.
  useEffect(() => {
    setSelfStudentEnabled(!!customer?.self_student_of_instructor_id);
  }, [customer?.self_student_of_instructor_id]);

  // ─── Computed ─────────────────────────────────────────────────
  const customerFullName = useMemo(() => {
    if (!customer) return '';
    const parts = [customer.first_name ?? customer.firstName, customer.last_name ?? customer.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : customer.name || 'Customer';
  }, [customer]);

  const customerAge = useMemo(() => {
    if (!customer) return null;
    if (customer.age != null) { const a = Number(customer.age); if (Number.isFinite(a)) return Math.max(0, Math.round(a)); }
    const dob = customer.date_of_birth || customer.dateOfBirth;
    if (!dob) return null;
    const bd = new Date(dob);
    if (isNaN(bd.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const mdiff = today.getMonth() - bd.getMonth();
    if (mdiff < 0 || (mdiff === 0 && today.getDate() < bd.getDate())) age -= 1;
    return age >= 0 ? age : null;
  }, [customer]);

  const weightKg = useMemo(() => {
    if (!customer) return null;
    const raw = customer.weight ?? customer.weight_kg ?? customer.weightKg;
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [customer]);

  const ageDisplay = customerAge != null ? `${customerAge} yrs` : null;
  const weightDisplay = weightKg != null ? `${weightKg % 1 === 0 ? weightKg : weightKg.toFixed(1)} kg` : null;

  const stats = useMemo(() => {
    const totalLessons = bookings?.length || 0;
    const completedLessons = bookings?.filter(b => b?.status === 'completed').length || 0;
    const now = new Date();
    const upcomingLessons = bookings?.filter(b => { if (!b || b.status === 'cancelled') return false; const dt = getBookingDateTime(b); return dt ? dt > now : false; }).length || 0;
    const hoursAttended = bookings?.reduce((s, b) => { const d = parseFloat(b?.duration ?? 0); return s + (b?.status === 'completed' && !isNaN(d) ? d : 0); }, 0) || 0;
    const totalRentals = rentals?.length || 0;
    return { totalLessons, completedLessons, upcomingLessons, hoursAttended, totalRentals, attendanceRate: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0 };
  }, [bookings, rentals]);

  const activePackagesCount = useMemo(() => {
    if (!customerPackages?.length) return 0;
    return customerPackages.filter(p => Number(p?.remainingHours ?? p?.remaining_hours ?? 0) > 0).length;
  }, [customerPackages]);

  const totalRemainingHours = useMemo(() => {
    if (!customerPackages?.length) return 0;
    return customerPackages.reduce((s, p) => s + coerceNumber(p?.remainingHours ?? p?.remaining_hours, 0), 0);
  }, [customerPackages]);

  // ─── Action handlers ──────────────────────────────────────────
  const handleAddFunds = async (values) => {
    setPaymentProcessing(true);
    try {
      const inputCurrency = addFundsCurrency || storageCurrency;
      const isConversion = inputCurrency !== storageCurrency;
      // Pass the original amount + currency through to the backend so the Recent
      // Deposits view can show "€X / ₺Y". Backend handles the conversion using
      // the server-side currency_settings rate (source of truth).
      const transactionDate = values.transactionDate?.toISOString() ?? null;
      const result = await FinancialService.addFunds(
        customerId,
        values.amount,
        values.description || 'Account deposit',
        values.paymentMethod,
        values.referenceNumber,
        storageCurrency,
        isConversion ? inputCurrency : null,
        isConversion ? values.amount : null,
        transactionDate
      );
      message.success('Funds added successfully');
      setShowAddFundsModal(false);
      setAddFundsAmount(null);
      setAddFundsCurrency(null);
      paymentForm.resetFields();
      // Immediately update the modal balance from the API response so the profile section
      // reflects the new amount even before refreshAllData completes.
      if (result?.wallet?.available !== undefined) {
        setUserAccount(prev => ({
          ...(prev || {}),
          currentBalance: result.wallet.available,
          availableCredits: result.wallet.available,
          currency: result.wallet.currency || storageCurrency,
        }));
      }
      await refreshAllData();
      onUpdate();
    } catch (err) {
      message.error('Failed to add funds: ' + (err.message || 'Unknown error'));
    } finally { setPaymentProcessing(false); }
  };

  const handleProcessCharge = async (values) => {
    setPaymentProcessing(true);
    try {
      await FinancialService.processCharge(customerId, values.amount, values.description || 'Manual charge', values.relatedEntityId || null, values.relatedEntityType || 'manual', storageCurrency);
      message.success('Charge processed successfully');
      setShowChargeModal(false);
      chargeForm.resetFields();
      await refreshAllData();
      onUpdate();
    } catch (err) {
      message.error('Failed to process charge: ' + (err.message || 'Unknown error'));
    } finally { setPaymentProcessing(false); }
  };

  const handleEditProfile = async (values) => {
    setPaymentProcessing(true);
    try {
      const payload = { ...values, name: `${values.first_name || ''} ${values.last_name || ''}`.trim() };
      delete payload.confirm_password;
      await DataService.updateUser(customerId, payload);
      message.success('Profile updated successfully!');
      setShowEditProfileModal(false);
      await fetchCustomerData();
      onUpdate();
    } catch (err) {
      message.error('Failed to update profile: ' + (err.message || 'Unknown error'));
    } finally { setPaymentProcessing(false); }
  };

  const handleSelfStudentChange = async (instructorId) => {
    if (!customerId) return;
    const previous = customer?.self_student_of_instructor_id ?? null;
    setCustomer(prev => (prev ? { ...prev, self_student_of_instructor_id: instructorId } : prev));
    try {
      await DataService.updateUser(customerId, { self_student_of_instructor_id: instructorId });
      message.success(instructorId ? 'Marked as self-student' : 'Self-student link removed');
      onUpdate();
    } catch (err) {
      setCustomer(prev => (prev ? { ...prev, self_student_of_instructor_id: previous } : prev));
      message.error('Failed to update self-student link: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteBooking = useCallback((booking) => {
    const bookingDate = (() => { try { const d = new Date(booking.date || booking.lesson_date); return isNaN(d.getTime()) ? 'unknown date' : d.toLocaleDateString(); } catch { return 'unknown date'; } })();
    modal.confirm({
      title: 'Delete Booking',
      content: `Delete ${booking.service_name || booking.serviceName || 'lesson'} on ${bookingDate}?`,
      okText: 'Delete', okType: 'danger',
      onOk: async () => {
        try {
          await DataService.deleteBooking(booking.id);
          message.success('Booking deleted');
          await refreshAllData();
          window.dispatchEvent(new CustomEvent('booking-deleted', { detail: { bookingId: booking.id } }));
        } catch (err) { message.error('Failed to delete booking: ' + (err.message || 'Unknown error')); }
      }
    });
  }, [modal, refreshAllData]);

  const handleDeleteRental = useCallback((rental) => {
    modal.confirm({
      title: 'Delete Rental',
      content: `Delete rental for ${rental.equipment_name || 'equipment'}?`,
      okText: 'Delete', okType: 'danger',
      onOk: async () => {
        try {
          await DataService.deleteRental(rental.id);
          message.success('Rental deleted');
          await refreshAllData();
        } catch (err) { message.error('Failed to delete rental: ' + (err.message || 'Unknown error')); }
      }
    });
  }, [modal, refreshAllData]);

  // Transaction delete with dependency awareness
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
    if (!transaction) return;
    setDependencyFetchLoading(true);
    try {
      await DataService.deleteTransaction(transaction.id, { force: options.force, hardDelete: options.hardDelete, cascade: options.cascade, reason: options.reason });
      message.success(options.hardDelete ? 'Transaction permanently deleted' : options.force ? 'Transaction deleted after removing linked records.' : 'Transaction deleted successfully');
      await refreshAllData();
      setTransactionDetailModalVisible(false);
      setSelectedTransaction(null);
      resetTransactionDependencyState();
    } catch (error) {
      if (error.response?.status === 409 && !options.force) {
        const data = error.response.data;
        const deps = data?.dependencies || {};
        const bIds = deps.bookings?.map(b => b.id) || [];
        const pIds = deps.packages?.map(p => p.id) || [];
        const rIds = deps.rentals?.map(r => r.id) || [];
        if (bIds.length || pIds.length || rIds.length) {
          setTransactionDependencyInfo(data);
          setSelectedDependencyBookingIds(bIds);
          setSelectedDependencyPackageIds(pIds);
          setSelectedDependencyRentalIds(rIds);
          setDependencyModalVisible(true);
          setDependencyFetchLoading(false);
          return;
        }
      }
      message.error(error.response?.data?.message || error.message || 'Failed to delete transaction.');
    } finally { setDependencyFetchLoading(false); }
  }, [refreshAllData, resetTransactionDependencyState]);

  const showTransactionDeletionConfirm = useCallback((transaction) => {
    if (!transaction) return;
    modal.confirm({
      title: 'Delete Transaction', width: 500,
      content: (
        <div>
          <p>Choose how to delete this transaction:</p>
          <p className="mt-2 text-gray-500">Amount: <strong>{fmtCurrency(Math.abs(parseFloat(transaction.amount)), transaction.currency || storageCurrency)}</strong></p>
          <p className="mt-1 text-gray-500">Type: <strong>{transaction.transaction_type?.replace(/_/g, ' ')?.toUpperCase()}</strong></p>
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="font-semibold mb-2">Delete Options:</p>
            <ul className="list-disc pl-5 text-sm">
              <li className="mb-1"><strong>Normal Delete:</strong> Creates a reversal transaction</li>
              <li><strong>Hard Delete:</strong> Permanently removes without reversal</li>
            </ul>
          </div>
        </div>
      ),
      okText: 'Hard Delete', okType: 'danger',
      onOk: () => performTransactionDeletion(transaction, { hardDelete: true }),
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <Button onClick={() => { Modal.destroyAll(); performTransactionDeletion(transaction); }}>Normal Delete</Button>
          <OkBtn />
        </>
      )
    });
  }, [storageCurrency, fmtCurrency, performTransactionDeletion, modal]);

  const handleDeleteTransaction = useCallback(async (transaction, options = {}) => {
    if (!transaction) return;
    setSelectedTransaction(transaction);
    if (options.closeDetailModal) setTransactionDetailModalVisible(false);
    setDependencyFetchLoading(true);
    setDependencyFetchError(null);
    try {
      const depData = await FinancialService.getTransactionDependencies(transaction.id);
      const bIds = depData?.dependencies?.bookings?.map(b => b.id) || [];
      const pIds = depData?.dependencies?.packages?.map(p => p.id) || [];
      const rIds = depData?.dependencies?.rentals?.map(r => r.id) || [];
      if (depData?.hasDependencies && (bIds.length || pIds.length || rIds.length)) {
        setTransactionDependencyInfo(depData);
        setSelectedDependencyBookingIds(bIds);
        setSelectedDependencyPackageIds(pIds);
        setSelectedDependencyRentalIds(rIds);
        setDependencyModalVisible(true);
      } else {
        showTransactionDeletionConfirm(transaction);
      }
    } catch (err) {
      message.error(err?.response?.data?.message || err.message || 'Failed to check dependencies.');
    } finally { setDependencyFetchLoading(false); }
  }, [showTransactionDeletionConfirm]);

  const dependencyBookings = useMemo(() => {
    const b = transactionDependencyInfo?.dependencies?.bookings || [];
    return Array.from(new Map(b.map(x => [x.id, x])).values());
  }, [transactionDependencyInfo]);
  const dependencyPackages = useMemo(() => {
    const p = transactionDependencyInfo?.dependencies?.packages || [];
    return Array.from(new Map(p.map(x => [x.id, x])).values());
  }, [transactionDependencyInfo]);
  const dependencyRentals = useMemo(() => transactionDependencyInfo?.dependencies?.rentals || [], [transactionDependencyInfo]);

  const updatePackageCascadeOption = useCallback((packageId, partialUpdate) => {
    if (!packageId) return;
    setPackageCascadeOptions(prev => {
      const current = prev[packageId] || {};
      const next = { ...current, ...partialUpdate };
      if (current.strategy === next.strategy && current.allowNegative === next.allowNegative) return prev;
      return { ...prev, [packageId]: next };
    });
  }, []);

  useEffect(() => {
    if (!dependencyModalVisible) return;
    if (!dependencyPackages.length) { setPackageCascadeOptions(prev => Object.keys(prev).length ? {} : prev); return; }
    setPackageCascadeOptions(prev => {
      const next = {};
      let changed = false;
      dependencyPackages.forEach(pkg => {
        if (!pkg?.id) return;
        const prior = prev[pkg.id];
        const strat = PACKAGE_STRATEGY_SET.has(prior?.strategy) ? prior.strategy : resolveDefaultPackageStrategy(pkg);
        const neg = typeof prior?.allowNegative === 'boolean' ? prior.allowNegative : true;
        next[pkg.id] = { strategy: strat, allowNegative: neg };
        if (!prior || prior.strategy !== strat || prior.allowNegative !== neg) changed = true;
      });
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [dependencyModalVisible, dependencyPackages]);

  const packageStrategySelectionInvalid = useMemo(() => {
    if (selectedDependencyPackageIds.length === 0) return false;
    return selectedDependencyPackageIds.some(id => { const e = packageCascadeOptions[id]; return !e || !PACKAGE_STRATEGY_SET.has(e.strategy); });
  }, [packageCascadeOptions, selectedDependencyPackageIds]);

  const handleDependencyDeleteConfirm = useCallback(async () => {
    if (!selectedTransaction) return;
    if (!selectedDependencyBookingIds.length && !selectedDependencyPackageIds.length && !selectedDependencyRentalIds.length) {
      message.warning('Select at least one linked item.');
      return;
    }
    if (packageStrategySelectionInvalid) { message.warning('Select how each package should be handled.'); return; }
    setDependencyFetchLoading(true);
    setDependencyFetchError(null);
    try {
      for (const bid of selectedDependencyBookingIds) {
        await DataService.deleteBooking(bid);
        window.dispatchEvent(new CustomEvent('booking-deleted', { detail: { bookingId: bid } }));
      }
      const cascade = {};
      if (selectedDependencyPackageIds.length) {
        cascade.packages = selectedDependencyPackageIds.map(pid => {
          const e = packageCascadeOptions[pid];
          const strategy = PACKAGE_STRATEGY_SET.has(e?.strategy) ? e.strategy : resolveDefaultPackageStrategy(dependencyPackages.find(p => p.id === pid)) || PACKAGE_DEFAULT_STRATEGY;
          const payload = { id: pid, strategy };
          if (strategy === 'charge-used') payload.allowNegative = e?.allowNegative !== false;
          return payload;
        }).filter(Boolean);
      }
      if (selectedDependencyRentalIds.length) cascade.rentals = selectedDependencyRentalIds;
      await performTransactionDeletion(selectedTransaction, { force: true, cascade: Object.keys(cascade).length ? cascade : undefined });
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to delete linked records.';
      setDependencyFetchError(msg);
      message.error(msg);
    } finally { setDependencyFetchLoading(false); }
  }, [dependencyPackages, packageCascadeOptions, packageStrategySelectionInvalid, performTransactionDeletion, selectedDependencyBookingIds, selectedDependencyPackageIds, selectedDependencyRentalIds, selectedTransaction]);

  const handleResetWalletBalance = useCallback(() => {
    if (!customerId) return;
    let targetBalance = 0;
    let reason = '';
    modal.confirm({
      title: 'Reset Wallet Balance', width: 500, icon: null,
      content: (
        <div>
          <Alert type="warning" message="This will permanently delete ALL wallet transactions" description="The customer's transaction history will be cleared and replaced with a single balance adjustment." showIcon className="mb-4" />
          <Form layout="vertical">
            <Form.Item label="Target Balance" required>
              <InputNumber style={{ width: '100%' }} placeholder="0" defaultValue={0} onChange={v => { targetBalance = v ?? 0; }} />
            </Form.Item>
            <Form.Item label="Reason (Required)" required>
              <Input.TextArea rows={3} placeholder="Reason for reset" onChange={e => { reason = e.target.value; }} />
            </Form.Item>
          </Form>
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-red-700 text-sm font-medium">⚠️ Warning</p>
            <ul className="text-red-600 text-sm mt-1 list-disc pl-4">
              <li>All {transactions?.length || 0} transactions will be deleted</li>
              <li>This cannot be undone</li>
            </ul>
          </div>
        </div>
      ),
      okText: 'Reset Wallet', okType: 'danger',
      onOk: async () => {
        if (!reason.trim()) { message.error('Please provide a reason'); throw new Error('Reason required'); }
        try {
          await DataService.resetWalletBalance(customerId, { targetBalance: targetBalance || 0, reason: reason.trim(), currency: businessCurrency || 'EUR' });
          message.success('Wallet balance reset successfully');
          await refreshAllData();
        } catch (err) { message.error(`Failed: ${err.response?.data?.message || err.message}`); throw err; }
      }
    });
  }, [customerId, businessCurrency, transactions, refreshAllData, modal]);

  // View detail handlers
  const handleViewBooking = (b) => { setSelectedBooking(b); setBookingDetailModalVisible(true); };
  const handleViewRental = (r) => { setSelectedRental(r); setRentalDetailModalVisible(true); };
  const handleViewTransaction = (t) => { setSelectedTransaction(t); setTransactionDetailModalVisible(true); };

  const getLastUsedInstructor = useCallback(() => {
    if (!bookings?.length) return null;
    const sorted = [...bookings].sort((a, b) => (getBookingDateTime(b) || 0) - (getBookingDateTime(a) || 0)).filter(b => b.instructor_user_id || b.instructor_id);
    if (!sorted.length) return null;
    const last = sorted[0];
    const iid = last.instructor_user_id || last.instructor_id;
    const instructor = instructors.find(i => i.id === iid);
    return instructor ? { id: instructor.id, name: instructor.name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim(), ...instructor } : last.instructor_name ? { id: iid, name: last.instructor_name } : null;
  }, [bookings, instructors]);

  // ─── Helpers ──────────────────────────────────────────────────
  const formatDate = (ds) => {
    if (!ds || ds === 'Invalid Date') return 'N/A';
    try { const d = new Date(ds); return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return 'N/A'; }
  };
  const formatDateOnly = (ds) => {
    if (!ds) return 'N/A';
    try {
      if (typeof ds === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ds)) { const [y, m, d] = ds.split('-'); return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
      const d = new Date(ds); return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return 'N/A'; }
  };
  const getStatusTag = (status) => {
    const map = { active: { color: 'green', label: 'Active' }, completed: { color: 'green', label: 'Completed' }, returned: { color: 'green', label: 'Returned' }, cancelled: { color: 'red', label: 'Cancelled' }, 'no-show': { color: 'red', label: 'No Show' }, pending: { color: 'orange', label: 'Pending' }, scheduled: { color: 'blue', label: 'Scheduled' }, ongoing: { color: 'blue', label: 'Ongoing' }, overdue: { color: 'red', label: 'Overdue' }, confirmed: { color: 'green', label: 'Confirmed' } };
    const { color, label } = map[status?.toLowerCase()] || { color: 'default', label: status };
    return <Tag color={color}>{label}</Tag>;
  };

  // ─── Discount helpers ─────────────────────────────────────────
  // Renders an inline price + discount chip when this entity has a discount
  // row attached. `originalPrice` is the price BEFORE the manual discount.
  const renderDiscountedPrice = useCallback((entityType, entityId, originalPrice, currency) => {
    const cur = currency || storageCurrency;
    const orig = Number(originalPrice) || 0;
    const d = entityId != null ? discountsByEntity.get(`${entityType}:${entityId}`) : null;
    if (!d) return <span className="tabular-nums">{fmtCurrency(orig, cur)}</span>;
    const dAmt = Number(d.amount) || 0;
    const final = Math.max(0, orig - dAmt);
    return (
      <Space size={4} wrap>
        <span className="tabular-nums line-through text-slate-400 text-xs">{fmtCurrency(orig, cur)}</span>
        <span className="tabular-nums font-semibold text-emerald-600">{fmtCurrency(final, cur)}</span>
        <Tag color="orange" className="!m-0">−{Number(d.percent)}%</Tag>
      </Space>
    );
  }, [discountsByEntity, fmtCurrency, storageCurrency]);

  // Opens the ApplyDiscountModal targeted at one entity row.
  const openDiscountForEntity = useCallback(({ entityType, entityId, originalPrice, currency, description }) => {
    setDiscountTarget({ entityType, entityId, originalPrice, currency, description });
  }, []);

  // Opens the EditPackagePriceModal for a customer package row.
  const openEditPriceForPackage = useCallback(({ packageId, currentPrice, originalPrice, currency, description }) => {
    setEditPriceTarget({ packageId, currentPrice, originalPrice, currency, description });
  }, []);

  // ─── Column definitions ───────────────────────────────────────
  const bookingColumns = useMemo(() => [
    { title: 'Date & Time', key: 'datetime', render: (_, r) => { if (r.date && r.startTime) return `${new Date(r.date).toLocaleDateString()} ${r.startTime}`; return formatDate(r.start_time || r.date); } },
    { title: 'Duration', dataIndex: 'duration', key: 'duration', render: d => d ? `${parseFloat(d)} hour${parseFloat(d) !== 1 ? 's' : ''}` : 'N/A' },
    { title: 'Type', dataIndex: 'booking_type', key: 'type', render: t => t?.charAt(0).toUpperCase() + t?.slice(1) || 'Standard' },
    { title: 'Instructor', key: 'instructor', render: (_, r) => { if (r.instructor_name) return r.instructor_name; const iid = r.instructor_id || r.instructor_user_id; const inst = instructors.find(i => i.id === iid); return inst ? (inst.name || `${inst.first_name} ${inst.last_name}`) : 'N/A'; } },
    { title: 'Price', key: 'price', render: (_, r) => {
      const orig = Number(r.final_amount ?? r.amount ?? r.total_price ?? 0);
      if (orig <= 0 && r.payment_status === 'package') return <span className="text-slate-400 text-xs italic">included</span>;
      return renderDiscountedPrice('booking', r.id, orig, r.currency);
    }},
    { title: 'Status', dataIndex: 'status', key: 'status', render: s => getStatusTag(s) },
    { title: 'Payment', key: 'payment', render: (_, r) => {
      if (r.payment_method_display && r.payment_method_display !== 'Package Hours' && r.payment_method_display !== 'Individual Payment' && r.payment_method_display !== 'Paid')
        return <Tag color="blue" icon={<GiftOutlined />}>Package: {r.payment_method_display}</Tag>;
      if (r.payment_method_display === 'Package Hours') return <Tag color="blue" icon={<GiftOutlined />}>{r.customer_package_name ? `Package: ${r.customer_package_name}` : 'Package Hours'}</Tag>;
      if (r.payment_method_display === 'Individual Payment') return <Tag color="green">Individual Payment</Tag>;
      if (r.payment_method_display === 'Balance Payment') return <Tag color="green">Balance Payment</Tag>;
      if (r.payment_status === 'package') return <Tag color="blue" icon={<GiftOutlined />}>{r.customer_package_name ? `Package: ${r.customer_package_name}` : 'Package Hours'}</Tag>;
      return <Tag color="green">Paid</Tag>;
    }},
    { title: 'Actions', key: 'actions', render: (_, r) => (
      <Space size="small">
        <Button type="link" size="small" onClick={() => handleViewBooking(r)}>View</Button>
        {!readOnly && (
          <Button
            type="link"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              const orig = Number(r.final_amount ?? r.amount ?? r.total_price ?? 0);
              openDiscountForEntity({
                entityType: 'booking',
                entityId: r.id,
                originalPrice: orig,
                currency: r.currency,
                description: `${r.service_name || r.serviceName || 'Lesson'} · ${formatDate(r.start_time || r.date)}`,
              });
            }}
          >Discount</Button>
        )}
        {!readOnly && <Button type="link" size="small" danger onClick={() => handleDeleteBooking(r)}>Delete</Button>}
      </Space>
    )}
  ], [instructors, handleDeleteBooking, readOnly, renderDiscountedPrice, openDiscountForEntity]);

  const rentalColumns = useMemo(() => [
    { title: 'Equipment', key: 'equipment', render: (_, r) => {
      if (r.equipment && Array.isArray(r.equipment) && r.equipment.length > 0) return r.equipment.length === 1 ? (r.equipment[0].name || 'Unknown') : `${r.equipment.length} items`;
      return r.equipment_name || 'Unknown Equipment';
    }},
    { title: 'Rental Date', key: 'rental_date', render: (_, r) => formatDate(r.rental_date || r.start_date || r.created_at), sorter: (a, b) => new Date(a.rental_date || a.start_date || 0) - new Date(b.rental_date || b.start_date || 0), defaultSortOrder: 'descend' },
    { title: 'Price', key: 'price', render: (_, r) => {
      const tp = parseFloat(r.total_price);
      const isPackage = !!r.customer_package_id || r.payment_status === 'package';
      if (tp > 0) return (
        <Space size={4}>
          {renderDiscountedPrice('rental', r.id, tp, r.currency || storageCurrency)}
          {isPackage && <span>📦</span>}
        </Space>
      );
      const pkgRate = parseFloat(r.package_daily_rate);
      if (pkgRate > 0) return <span className="text-slate-500">{fmtCurrency(pkgRate, storageCurrency)}/h 📦</span>;
      const eq = r.equipment;
      if (eq && Array.isArray(eq) && eq.length > 0) {
        const rate = parseFloat(eq[0].daily_rate);
        if (rate > 0) return <span className="text-slate-500">{fmtCurrency(rate, storageCurrency)}/h{isPackage ? ' 📦' : ''}</span>;
      }
      return isPackage ? <span className="text-slate-500">📦 Package</span> : 'N/A';
    }},
    { title: 'Status', dataIndex: 'status', key: 'status', render: s => getStatusTag(s) },
    { title: 'Actions', key: 'actions', render: (_, r) => (
      <Space size="small">
        <Button type="link" size="small" onClick={() => handleViewRental(r)}>View</Button>
        {!readOnly && parseFloat(r.total_price) > 0 && !r.customer_package_id && r.payment_status !== 'package' && (
          <Button
            type="link"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              openDiscountForEntity({
                entityType: 'rental',
                entityId: r.id,
                originalPrice: parseFloat(r.total_price) || 0,
                currency: r.currency || storageCurrency,
                description: `Rental · ${formatDate(r.rental_date || r.start_date)}`,
              });
            }}
          >Discount</Button>
        )}
        {!readOnly && <Button type="link" size="small" danger onClick={() => handleDeleteRental(r)}>Delete</Button>}
      </Space>
    )}
  ], [fmtCurrency, storageCurrency, handleDeleteRental, readOnly, renderDiscountedPrice, openDiscountForEntity]);

  const transactionColumns = useMemo(() => [
    { title: 'Date', dataIndex: 'createdAt', key: 'date', render: d => formatDate(d), sorter: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (amount, r) => {
      const txCur = r.currency || walletCurrency;
      if (isStaff && txCur !== storageCurrency) {
        return <Tooltip title={fmtCurrency(amount || 0, txCur)}>{fmtCurrency(convertCurrency(amount || 0, txCur, storageCurrency), storageCurrency)}</Tooltip>;
      }
      return fmtCurrency(amount || 0, txCur);
    }},
    { title: 'Type', dataIndex: 'type', key: 'type', render: t => { const c = t === 'payment' ? 'green' : t === 'refund' ? 'orange' : 'blue'; return <Tag color={c}>{t?.toUpperCase() || 'N/A'}</Tag>; } },
    { title: 'Description', dataIndex: 'description', key: 'desc', render: d => d || 'N/A' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: s => { const c = s === 'completed' ? 'green' : s === 'pending' ? 'orange' : 'red'; return <Tag color={c}>{s?.toUpperCase() || 'N/A'}</Tag>; } },
    { title: 'Actions', key: 'actions', render: (_, r) => (
      <Space size="small">
        <Button type="link" size="small" onClick={() => handleViewTransaction(r)}>View</Button>
        {!readOnly && <Button type="link" size="small" danger onClick={() => handleDeleteTransaction(r)}>Delete</Button>}
      </Space>
    )}
  ], [walletCurrency, isStaff, storageCurrency, fmtCurrency, convertCurrency, handleDeleteTransaction, readOnly]);

  // ─── Render helpers (info row) ────────────────────────────────
  const renderInfoCell = (icon, label, value) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-2 min-w-0">
        <span className="text-gray-400 mt-0.5 text-sm">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</div>
          <div className="text-xs text-gray-800 mt-0.5 truncate">{value}</div>
        </div>
      </div>
    );
  };

  // ─── Section renderers ────────────────────────────────────────
  const renderProfile = () => (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar size={36} src={customer?.profile_image_url || customer?.avatar} icon={!customer?.profile_image_url && <UserOutlined />} className="shadow-sm flex-shrink-0" style={{ backgroundColor: !customer?.profile_image_url ? '#3B82F6' : undefined }} />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate leading-tight">{customerFullName}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {customer?.status && <Tag color={customer.status === 'active' ? 'green' : 'default'} bordered={false} className="rounded-full text-[10px] leading-none px-1.5 py-0 m-0">{customer.status.toUpperCase()}</Tag>}
              {customer?.role && <Tag color={customer.role === 'outsider' ? 'orange' : 'blue'} bordered={false} className="rounded-full text-[10px] leading-none px-1.5 py-0 m-0">{customer.role === 'outsider' ? 'Outsider' : 'Student'}</Tag>}
            </div>
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          {renderInfoCell(<MailOutlined />, 'Email', customer?.email)}
          {renderInfoCell(<PhoneOutlined />, 'Phone', customer?.phone)}
          {renderInfoCell(<HomeOutlined />, 'Address', [customer?.address, customer?.city, customer?.country].filter(Boolean).join(', ') || null)}
          {ageDisplay && renderInfoCell(<FieldTimeOutlined />, 'Age', ageDisplay)}
          {weightDisplay && renderInfoCell(<DashboardOutlined />, 'Weight', weightDisplay)}
          {renderInfoCell(<ClockCircleOutlined />, 'Since', customer?.created_at ? new Date(customer.created_at).toLocaleDateString() : null)}
        </div>
      </div>

      {/* Self-student linkage (admin/manager only) */}
      {isAdmin && (() => {
        const linkedId = customer?.self_student_of_instructor_id || null;
        const teachingStaff = (instructors || []).filter(i => i.role_name === 'instructor' || i.role_name === 'manager');
        const labelOf = (i) => `${i.first_name ?? ''} ${i.last_name ?? ''}`.trim() || i.name || i.email;
        return (
          <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <div className="text-sm font-semibold text-gray-800">Self Student</div>
                <div className="text-[11px] text-gray-500">Link this customer to the instructor who personally brought them in. That instructor will earn a percentage commission (default 45%) on lessons with this student.</div>
              </div>
              <Checkbox
                checked={selfStudentEnabled}
                disabled={readOnly}
                onChange={(e) => {
                  setSelfStudentEnabled(e.target.checked);
                  if (!e.target.checked && linkedId) handleSelfStudentChange(null);
                }}
              >
                Enable
              </Checkbox>
            </div>
            <Select
              showSearch
              allowClear
              placeholder="Select an instructor"
              optionFilterProp="label"
              disabled={readOnly || !selfStudentEnabled}
              value={linkedId || undefined}
              onChange={(val) => handleSelfStudentChange(val || null)}
              style={{ width: '100%' }}
              options={teachingStaff.map(i => ({ value: i.id, label: labelOf(i) }))}
            />
          </div>
        );
      })()}

      {/* Quick highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Balance', value: fmt(userAccount?.currentBalance ?? 0), icon: DollarOutlined, tone: (userAccount?.currentBalance ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-500' },
          { label: 'Lifetime Value', value: fmt(userAccount?.lifetimeValue || 0), icon: LineChartOutlined, tone: 'text-indigo-600' },
          { label: 'Active Packages', value: activePackagesCount, icon: GiftOutlined, tone: 'text-amber-600' },
          { label: 'Hours Attended', value: `${Number(stats.hoursAttended || 0).toFixed(1)} h`, icon: ClockCircleOutlined, tone: 'text-emerald-600' },
          { label: 'Total Lessons', value: stats.totalLessons ?? 0, icon: BookOutlined, tone: 'text-sky-600' },
          { label: 'Total Rentals', value: stats.totalRentals ?? 0, icon: ShoppingOutlined, tone: 'text-amber-500' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white p-3 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Icon className={`text-base ${tone}`} />
            </div>
            <div className={`text-lg font-bold ${label === 'Balance' ? tone : 'text-gray-800'}`}>{value ?? '—'}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Create Bill — staff only (admin / manager / receptionist), not students */}
      {!readOnly && (
        <button
          type="button"
          onClick={() => setBillModalVisible(true)}
          className="w-full rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-sky-50/40 hover:from-cyan-100 hover:to-sky-100/60 transition-colors px-4 py-3 flex items-center justify-between gap-3 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#00a8c4' }}>
              <FileTextOutlined className="text-white text-base" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-800 leading-tight">Create Bill</div>
              <div className="text-[11px] text-gray-500 leading-tight mt-0.5">Duotone Pro Center Urla statement — accommodation, lessons, rentals, shop &amp; more</div>
            </div>
          </div>
          <span className="text-xs font-medium" style={{ color: '#00a8c4' }}>Open →</span>
        </button>
      )}

      {/* Upcoming Lessons */}
      {stats.upcomingLessons > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Upcoming Lessons ({stats.upcomingLessons})</h4>
            {!readOnly && <Button type="primary" size="small" icon={<CalendarOutlined />} onClick={() => setBookingModalVisible(true)}>Schedule</Button>}
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {(() => {
              const upcoming = bookings?.filter(b => { if (!b || b.status === 'cancelled') return false; const dt = getBookingDateTime(b); return dt ? dt > new Date() : false; }).sort((a, b) => (getBookingDateTime(a) || 0) - (getBookingDateTime(b) || 0));
              const displayed = showAllUpcoming ? upcoming : upcoming?.slice(0, 3);
              return (
                <>
                  {displayed?.map(lesson => {
                    const dt = getBookingDateTime(lesson);
                    const inst = instructors.find(i => i.id === (lesson.instructor_user_id || lesson.instructor_id));
                    return (
                      <div key={lesson.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => handleViewBooking(lesson)}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-sm text-gray-800">{lesson.booking_type || 'Standard'} Lesson</div>
                            <div className="text-xs text-gray-600">{dt ? dt.toLocaleDateString() : 'TBD'}{lesson.startTime && ` at ${lesson.startTime}`}</div>
                            <div className="text-xs text-gray-500">Instructor: {inst?.name || lesson.instructor_name || 'TBD'}</div>
                          </div>
                          <div className="text-xs">{getStatusTag(lesson.status)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {upcoming?.length > 3 && (
                    <Button type="link" size="small" onClick={() => setShowAllUpcoming(!showAllUpcoming)}>
                      {showAllUpcoming ? 'Show Less' : `Show All (${upcoming.length})`}
                    </Button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );

  const renderPackages = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{activePackagesCount}</div>
          <div className="text-xs text-gray-500 mt-1">Active Packages</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{formatHoursValue(totalRemainingHours)}</div>
          <div className="text-xs text-gray-500 mt-1">Hours Remaining</div>
        </div>
      </div>
      <Suspense fallback={<div className="p-8 text-center"><Spin /></div>}>
        {customer && (
          <CustomerPackageManager
            visible={false}
            onClose={() => {}}
            customer={customer}
            embedded={true}
            showHeader={false}
            showStats={false}
            disableActions={readOnly}
            onPackageAssigned={async () => { await refreshAllData(); message.success('Package assigned'); }}
            discountsByEntity={discountsByEntity}
            onApplyDiscount={openDiscountForEntity}
            onEditPrice={openEditPriceForPackage}
          />
        )}
      </Suspense>
    </div>
  );

  const renderBookings = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text type="secondary">{bookings?.length || 0} lesson(s)</Text>
        {!readOnly && <Button type="primary" icon={<CalendarOutlined />} size="small" onClick={() => setBookingModalVisible(true)}>Schedule Lesson</Button>}
      </div>
      {bookings?.length > 0 ? (
        <UnifiedResponsiveTable title="Lesson History" density="comfortable" columns={bookingColumns} dataSource={bookings} mobileCardRenderer={BookingMobileCard} rowKey="id" pagination={{ pageSize: 10 }} onRowClick={handleViewBooking} breakpoint={1100} />
      ) : <Empty description="No lessons found" />}
    </div>
  );

  const renderRentals = () => (
    <div className="space-y-4">
      <Text type="secondary">{rentals?.length || 0} rental(s)</Text>
      {rentals?.length > 0 ? (
        <UnifiedResponsiveTable title="Rental History" density="comfortable" columns={rentalColumns} dataSource={rentals} mobileCardRenderer={RentalMobileCard} rowKey="id" pagination={{ pageSize: 10 }} onRowClick={handleViewRental} breakpoint={1100} />
      ) : <Empty description="No rentals found" />}
    </div>
  );

  const renderFinancial = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Text type="secondary">{transactions?.length || 0} transaction(s)</Text>
        {!readOnly && (
          <Space wrap size="small">
            <Button icon={<PlusCircleOutlined />} size="small" onClick={() => setShowAddFundsModal(true)}>Add Balance</Button>
            <Button icon={<MinusCircleOutlined />} size="small" danger onClick={() => setShowChargeModal(true)}>Charge</Button>
            {isAdmin && <Button icon={<DeleteOutlined />} size="small" danger onClick={handleResetWalletBalance}>Reset Wallet</Button>}
          </Space>
        )}
      </div>
      {transactions?.length > 0 ? (
        <UnifiedResponsiveTable title="Financial History" density="comfortable" columns={transactionColumns} dataSource={transactions} mobileCardRenderer={TransactionMobileCard} rowKey="id" pagination={{ pageSize: 10 }} onRowClick={handleViewTransaction} breakpoint={1100} />
      ) : <Empty description="No transactions found" />}
    </div>
  );

  const renderAccommodation = () => {
    // Merge standalone accommodation bookings with package-based accommodation.
    // When a package includes accommodation (all-inclusive, accommodation_lesson, etc.)
    // the check-in/check-out dates are stored in customer_packages rather than
    // always creating a separate accommodation_bookings record.
    const packageAccomRows = (customerPackages || [])
      .filter(p => p.includes_accommodation || p.includesAccommodation || Number(p.accommodation_nights_total || p.accommodationNightsTotal) > 0)
      .map(p => ({
        id: `pkg-${p.id}`,
        _source: 'package',
        unit_name: p.accommodationUnitName || p.accommodation_unit_name || '—',
        check_in_date: p.checkInDate || p.check_in_date || null,
        check_out_date: p.checkOutDate || p.check_out_date || null,
        guests_count: null,
        total_price: p.price || p.purchasePrice || p.purchase_price || 0,
        status: p.status || 'active',
        _nights_total: Number(p.accommodation_nights_total || p.accommodationNightsTotal) || null,
        _package_name: p.packageName || p.package_name || p.lessonType || '—',
      }));

    // Deduplicate: if a standalone booking already covers the same check_in date,
    // prefer the standalone booking and drop the package row.
    const standaloneCheckIns = new Set(
      (accommodationBookings || []).map(b => b.check_in_date).filter(Boolean)
    );
    const filteredPkgRows = packageAccomRows.filter(r => {
      if (!r.check_in_date) return true; // no date → can't deduplicate, show it
      return !standaloneCheckIns.has(r.check_in_date);
    });

    const allRows = [
      ...(accommodationBookings || []).map(b => ({ ...b, _source: 'booking' })),
      ...filteredPkgRows,
    ]
      .filter(r => r.status !== 'cancelled')
      .sort((a, b) => new Date(b.check_in_date || 0) - new Date(a.check_in_date || 0));

    const accomColumns = [
      {
        title: 'Unit',
        key: 'unit',
        render: (_, r) => (
          <div>
            <div>{r.unit_name || r.unit_id || 'Unknown Unit'}</div>
            {r._source === 'package' && (
              <div className="text-[11px] text-gray-400">{r._package_name}</div>
            )}
          </div>
        ),
      },
      {
        title: 'Check-in',
        dataIndex: 'check_in_date',
        key: 'check_in',
        render: d => d ? formatDateOnly(d) : '—',
        sorter: (a, b) => new Date(a.check_in_date || 0) - new Date(b.check_in_date || 0),
        defaultSortOrder: 'descend',
      },
      {
        title: 'Check-out',
        dataIndex: 'check_out_date',
        key: 'check_out',
        render: d => d ? formatDateOnly(d) : '—',
      },
      {
        title: 'Nights',
        key: 'nights',
        render: (_, r) => {
          if (r.check_in_date && r.check_out_date) {
            const diff = Math.round((new Date(r.check_out_date) - new Date(r.check_in_date)) / 86400000);
            return diff > 0 ? diff : '—';
          }
          return r._nights_total || '—';
        },
      },
      {
        title: 'Price',
        dataIndex: 'total_price',
        key: 'price',
        render: (p, r) => r._source === 'package'
          ? <Tooltip title="Price included in package"><span className="text-gray-400 text-xs">Incl. in package</span></Tooltip>
          : renderDiscountedPrice('accommodation_booking', r.id, Number(p) || 0, r.currency || storageCurrency),
      },
      {
        title: 'Source',
        key: 'source',
        render: (_, r) => r._source === 'package'
          ? <Tag color="blue">Package</Tag>
          : <Tag color="green">Direct</Tag>,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: s => getStatusTag(s),
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_, r) => {
          if (r._source !== 'booking' || readOnly) return null;
          const orig = Number(r.total_price) || 0;
          if (orig <= 0) return null;
          return (
            <Button
              type="link"
              size="small"
              onClick={() => openDiscountForEntity({
                entityType: 'accommodation_booking',
                entityId: r.id,
                originalPrice: orig,
                currency: r.currency || storageCurrency,
                description: `${r.unit_name || 'Accommodation'} · ${formatDateOnly(r.check_in_date)}`,
              })}
            >Discount</Button>
          );
        },
      },
    ];

    return (
      <div className="space-y-4">
        <Text type="secondary">{allRows.length} booking(s)</Text>
        {allRows.length > 0 ? (
          <UnifiedResponsiveTable
            title="Accommodation History"
            density="comfortable"
            columns={accomColumns}
            dataSource={allRows}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            breakpoint={1100}
          />
        ) : (
          <Empty description="No accommodation bookings found" />
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'profile': return renderProfile();
      case 'packages': return renderPackages();
      case 'bookings': return renderBookings();
      case 'rentals': return renderRentals();
      case 'accommodation': return renderAccommodation();
      case 'financial': return renderFinancial();
      case 'shop': return <Suspense fallback={<Spin />}><CustomerShopHistory userId={customerId} /></Suspense>;
      case 'memberships': return <Suspense fallback={<Spin />}><MemberPurchasesSection userId={customerId} isAdminView={!readOnly} /></Suspense>;
      case 'discounts': return (
        <Suspense fallback={<Spin />}>
          <CustomerDiscountsTab
            customer={customer}
            bookings={bookings}
            rentals={rentals}
            accommodationBookings={accommodationBookings}
            packages={customerPackages}
            instructors={instructors}
            transactions={transactions}
            discounts={discounts}
            onChanged={refreshDiscounts}
            readOnly={readOnly}
          />
        </Suspense>
      );
      default: return null;
    }
  };

  const dependencySummaryText = useMemo(() => {
    const fmt2 = (c, l) => `${c} ${l}${c === 1 ? '' : 's'}`;
    const parts = [];
    if (dependencyBookings.length) parts.push(fmt2(dependencyBookings.length, 'lesson'));
    if (dependencyPackages.length) parts.push(fmt2(dependencyPackages.length, 'package'));
    if (dependencyRentals.length) parts.push(fmt2(dependencyRentals.length, 'rental'));
    if (!parts.length) return 'linked records';
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  }, [dependencyBookings, dependencyPackages, dependencyRentals]);

  // ─── Responsive drawer width & sidebar toggle ────────────────
  const [drawerWidth, setDrawerWidth] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640) ? '100%' : 960);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  useEffect(() => {
    const onResize = () => setDrawerWidth(window.innerWidth < 640 ? '100%' : 960);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!customerProp) return null;

  // ─── Main Render ──────────────────────────────────────────────
  return (
    <>
      <Drawer
        open={isOpen}
        onClose={onClose}
        width={drawerWidth}
        closable={false}
        destroyOnHidden
        styles={{ body: { padding: 0, display: 'flex', overflow: 'hidden' }, header: { display: 'none' } }}
      >
        <div className="flex h-full w-full relative overflow-hidden">
          {/* ── Icon rail (always 56px, always visible, highest z when collapsed) ── */}
          <div className="w-14 flex-shrink-0 bg-slate-50 border-r border-gray-200 flex flex-col relative z-10">
            {/* Avatar toggle */}
            <div className="p-2 border-b border-gray-200 flex items-center justify-center">
              <button
                onClick={() => setSidebarExpanded(prev => !prev)}
                className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-blue-200 transition-shadow"
                title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                <Avatar size={36} src={customer?.profile_image_url || customer?.avatar || customerProp.profile_image_url || customerProp.avatar} icon={<UserOutlined />} style={{ backgroundColor: '#3B82F6' }} />
              </button>
            </div>

            {/* Icon nav */}
            <nav className="flex-1 py-2 px-1 space-y-0.5 overflow-y-auto">
              {NAV_ITEMS.map(item => (
                <Tooltip key={item.key} title={item.label} placement="right">
                  <button
                    onClick={() => setActiveSection(item.key)}
                    className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors duration-150 cursor-pointer border-0 ${
                      activeSection === item.key
                        ? 'bg-blue-50 text-blue-700 shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 bg-transparent'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                  </button>
                </Tooltip>
              ))}
            </nav>

            {/* Icon quick actions */}
            {!readOnly && (
              <div className="p-1 border-t border-gray-200 space-y-0.5">
                {[
                  { label: 'Book', icon: <CalendarOutlined />, color: 'text-sky-600 hover:bg-sky-50', action: () => setBookingModalVisible(true) },
                  { label: 'Assign Package', icon: <GiftOutlined />, color: 'text-amber-600 hover:bg-amber-50', action: () => { setStartAssignFlow(true); setPackageManagerVisible(true); } },
                  { label: 'Add Balance', icon: <PlusOutlined />, color: 'text-emerald-600 hover:bg-emerald-50', action: () => setShowAddFundsModal(true) },
                  { label: 'Charge', icon: <CreditCardOutlined />, color: 'text-rose-600 hover:bg-rose-50', action: () => setShowChargeModal(true) },
                  { label: 'Edit Profile', icon: <EditOutlined />, color: 'text-slate-500 hover:bg-gray-100', action: () => setShowEditProfileModal(true) },
                ].map(({ label, icon, color, action }) => (
                  <Tooltip key={label} title={label} placement="right">
                    <button onClick={action} className={`w-full flex items-center justify-center py-2 rounded-lg ${color} transition-colors cursor-pointer border-0 bg-transparent`}>
                      <span className="text-base">{icon}</span>
                    </button>
                  </Tooltip>
                ))}
              </div>
            )}

            {/* Close icon */}
            <div className="p-1 border-t border-gray-200">
              <Tooltip title="Close" placement="right">
                <button onClick={onClose} className="w-full flex items-center justify-center py-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer border-0 bg-transparent">
                  <CloseOutlined className="text-sm" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ── Backdrop (covers everything when expanded sidebar is open) ── */}
          <div
            className="absolute inset-0 z-20 transition-opacity duration-200"
            style={{ background: 'rgba(0,0,0,0.15)', opacity: sidebarExpanded ? 1 : 0, pointerEvents: sidebarExpanded ? 'auto' : 'none' }}
            onClick={() => setSidebarExpanded(false)}
          />

          {/* ── Expanded sidebar (slides from left:0, covers icon rail when open) ── */}
          <div
            className="absolute top-0 bottom-0 left-0 z-30 w-[200px] bg-slate-50 border-r border-gray-200 flex flex-col shadow-xl"
            style={{
              transform: sidebarExpanded ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)',
              willChange: 'transform',
            }}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarExpanded(false)}
                  className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-blue-200 transition-shadow"
                >
                  <Avatar size={36} src={customer?.profile_image_url || customer?.avatar || customerProp.profile_image_url || customerProp.avatar} icon={<UserOutlined />} style={{ backgroundColor: '#3B82F6' }} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 truncate">{customerFullName || customerProp.name}</div>
                  <Tag color={customer?.role === 'outsider' ? 'orange' : 'blue'} bordered={false} className="rounded-full text-[10px] mt-0.5 px-1.5 py-0 leading-4">
                    {(customer?.role || customerProp.role || 'student').toUpperCase()}
                  </Tag>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.key}
                  onClick={() => { setActiveSection(item.key); setSidebarExpanded(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 cursor-pointer border-0 text-left ${
                    activeSection === item.key
                      ? 'bg-blue-50 text-blue-700 font-medium shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-normal bg-transparent'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Quick actions */}
            {!readOnly && (
              <div className="p-2 border-t border-gray-200 space-y-1">
                {[
                  { label: 'Book', icon: <CalendarOutlined />, cls: 'text-sky-700 hover:bg-sky-50', action: () => setBookingModalVisible(true) },
                  { label: 'Assign Package', icon: <GiftOutlined />, cls: 'text-amber-700 hover:bg-amber-50', action: () => { setStartAssignFlow(true); setPackageManagerVisible(true); } },
                  { label: 'Add Balance', icon: <PlusOutlined />, cls: 'text-emerald-700 hover:bg-emerald-50', action: () => setShowAddFundsModal(true) },
                  { label: 'Charge', icon: <CreditCardOutlined />, cls: 'text-rose-700 hover:bg-rose-50', action: () => setShowChargeModal(true) },
                  { label: 'Edit Profile', icon: <EditOutlined />, cls: 'text-slate-600 hover:bg-gray-100', action: () => setShowEditProfileModal(true) },
                ].map(({ label, icon, cls, action }) => (
                  <button key={label} onClick={() => { setSidebarExpanded(false); action(); }} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${cls} transition-colors cursor-pointer border-0 bg-transparent text-left`}>
                    {icon} {label}
                  </button>
                ))}
              </div>
            )}

            {/* Close */}
            <div className="p-3 border-t border-gray-200">
              <button onClick={onClose} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer border-0 bg-transparent">
                <CloseOutlined className="text-xs" /> Close
              </button>
            </div>
          </div>

          {/* ── Content area ── */}
          <div className="flex-1 overflow-y-auto bg-gray-50/50">
            <div className="p-3 sm:p-4 md:p-6">
              <div className="mb-3 md:mb-5">
                <h2 className="text-base md:text-lg font-semibold text-gray-900">{NAV_ITEMS.find(n => n.key === activeSection)?.label}</h2>
                <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{SECTION_DESCRIPTIONS[activeSection]}</p>
              </div>
              <Spin spinning={loading}>
                {renderContent()}
              </Spin>
            </div>
          </div>
        </div>
      </Drawer>

      {/* ── Modals ───────────────────────────────────── */}

      {/* Add Funds */}
      <Modal
        title={null}
        open={showAddFundsModal}
        onCancel={() => { setShowAddFundsModal(false); setAddFundsAmount(null); setAddFundsCurrency(null); paymentForm.resetFields(); }}
        footer={null}
        destroyOnHidden
        width={440}
        styles={{ body: { padding: 0 } }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <PlusCircleOutlined className="text-emerald-600 text-base" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-base leading-tight">Add Balance</div>
              <div className="text-xs text-gray-400 leading-tight mt-0.5">
                {customer?.name || customer?.full_name || 'Customer'}'s account
              </div>
            </div>
          </div>
        </div>

        <Form
          form={paymentForm}
          layout="vertical"
          onFinish={handleAddFunds}
          initialValues={{ amount: null, description: '', paymentMethod: 'cash', referenceNumber: '', transactionDate: dayjs() }}
          className="px-6 pt-5 pb-5"
        >
          {/* Amount + Currency Row */}
          <Form.Item label="Amount" required className="mb-4">
            <div className="flex gap-2">
              <Form.Item
                name="amount"
                noStyle
                rules={[
                  { required: true, message: 'Enter amount' },
                  { type: 'number', min: 0.01, message: 'Must be > 0' }
                ]}
              >
                <InputNumber
                  style={{ flex: 1 }}
                  step={50}
                  min={0.01}
                  precision={2}
                  prefix={<span className="text-gray-400 text-sm">{getCurrencySymbol(addFundsCurrency || storageCurrency)}</span>}
                  placeholder="0.00"
                  onChange={(val) => setAddFundsAmount(val)}
                  size="large"
                />
              </Form.Item>
              <Select
                value={addFundsCurrency || storageCurrency}
                onChange={(val) => setAddFundsCurrency(val)}
                style={{ width: 100 }}
                size="large"
                options={getSupportedCurrencies().map(c => ({
                  value: c.value,
                  label: c.value,
                }))}
              />
            </div>

            {/* Conversion preview */}
            {addFundsAmount > 0 && addFundsCurrency && addFundsCurrency !== storageCurrency && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" />
                <span>
                  Will be credited as{' '}
                  <span className="font-semibold text-gray-700">
                    {fmtCurrency(convertCurrency(addFundsAmount, addFundsCurrency, storageCurrency), storageCurrency)}
                  </span>
                  {' '}to the account
                </span>
              </div>
            )}
            {addFundsAmount > 0 && (!addFundsCurrency || addFundsCurrency === storageCurrency) && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span>
                  <span className="font-semibold text-gray-700">
                    {fmtCurrency(addFundsAmount, storageCurrency)}
                  </span>
                  {' '}will be added to the account
                </span>
              </div>
            )}
          </Form.Item>

          <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Enter description' }]} className="mb-4">
            <Input placeholder="e.g., Deposit for lessons" size="large" />
          </Form.Item>

          <div className="flex gap-3">
            <Form.Item name="paymentMethod" label="Payment Method" className="mb-4 flex-1">
              <Select size="large">
                <Option value="cash">Cash</Option>
                <Option value="credit_card">Credit Card</Option>
                <Option value="bank_transfer">Bank Transfer</Option>
                <Option value="paypal">PayPal</Option>
                <Option value="other">Other</Option>
              </Select>
            </Form.Item>
            <Form.Item name="referenceNumber" label="Reference No." className="mb-4 flex-1">
              <Input placeholder="Receipt #, etc." size="large" />
            </Form.Item>
          </div>

          <Form.Item name="transactionDate" label="Payment Date" className="mb-4">
            <DatePicker
              size="large"
              className="w-full"
              format="DD MMM YYYY"
              allowClear={false}
              disabledDate={(current) => current && current.isAfter(dayjs().endOf('day'))}
            />
          </Form.Item>

          <div className="flex gap-2 justify-end pt-1">
            <Button
              size="large"
              onClick={() => { setShowAddFundsModal(false); setAddFundsAmount(null); setAddFundsCurrency(null); paymentForm.resetFields(); }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              size="large"
              htmlType="submit"
              loading={paymentProcessing}
              icon={<PlusCircleOutlined />}
              className="bg-emerald-500 hover:bg-emerald-600 border-emerald-500 hover:border-emerald-600"
            >
              Add Funds
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Charge */}
      <Modal title={<span><MinusCircleOutlined className="text-red-600 mr-2" />Process Charge</span>} open={showChargeModal} onCancel={() => setShowChargeModal(false)} footer={null} destroyOnHidden>
        <Form form={chargeForm} layout="vertical" onFinish={handleProcessCharge} initialValues={{ amount: '', description: 'Manual charge', type: 'service_payment', relatedEntityType: 'manual' }}>
          <Form.Item name="amount" label={`Amount (${currencySymbol})`} rules={[{ required: true, message: 'Enter amount' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]}>
            <InputNumber style={{ width: '100%' }} step={5} min={0.01} precision={2} prefix={currencySymbol} placeholder="Amount" />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Enter description' }]}>
            <Input placeholder="e.g., Additional lesson" />
          </Form.Item>
          <Form.Item name="type" label="Transaction Type"><Select><Option value="service_payment">Service Payment</Option><Option value="rental_payment">Rental Payment</Option><Option value="charge">General Charge</Option></Select></Form.Item>
          <Form.Item name="relatedEntityType" label="Related To"><Select><Option value="manual">Manual Charge</Option><Option value="lesson">Lesson</Option><Option value="rental">Equipment Rental</Option><Option value="package">Package</Option><Option value="other">Other</Option></Select></Form.Item>
          <Form.Item name="relatedEntityId" label="Reference ID"><Input placeholder="Optional ID" /></Form.Item>
          <Alert message={userAccount?.currentBalance < 0 ? "Customer already has negative balance." : "This will deduct from customer balance."} type="warning" showIcon className="mb-4" />
          <Form.Item className="mb-0"><div className="flex justify-end"><Button className="mr-2" onClick={() => setShowChargeModal(false)}>Cancel</Button><Button type="primary" danger htmlType="submit" loading={paymentProcessing} icon={<MinusCircleOutlined />}>Process Charge</Button></div></Form.Item>
        </Form>
      </Modal>

      {/* Edit Profile */}
      <Modal title="Edit Customer Profile" open={showEditProfileModal} onCancel={() => setShowEditProfileModal(false)} footer={null} width={800} destroyOnHidden>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-gray-500 text-sm">Account actions</span>
          <Space size="small">
            <Button size="small" icon={<PlusCircleOutlined />} onClick={() => setShowAddFundsModal(true)}>Add Balance</Button>
            <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => setShowChargeModal(true)}>Charge</Button>
          </Space>
        </div>
        <Divider className="mt-0" />
        <UserForm user={customer} roles={[]} onSuccess={() => setShowEditProfileModal(false)} onCancel={() => setShowEditProfileModal(false)} isModal={true} customSubmit={handleEditProfile} />
      </Modal>

      {/* Package Manager */}
      <Suspense fallback={<Spin size="small" />}>
        {packageManagerVisible && customer && (
          <CustomerPackageManager
            visible={packageManagerVisible}
            onClose={() => { setPackageManagerVisible(false); setStartAssignFlow(false); refreshAllData(); }}
            customer={customer}
            startAssignFlow={startAssignFlow}
            onPackageAssigned={async () => { await refreshAllData(); message.success(`Package assigned to ${customerFullName}`); }}
            discountsByEntity={discountsByEntity}
            onApplyDiscount={openDiscountForEntity}
            onEditPrice={openEditPriceForPackage}
          />
        )}
      </Suspense>

      {/* Booking Drawer */}
      {bookingModalVisible && (
        <CalendarProvider>
          <Suspense fallback={<Spin size="small" />}>
            <BookingDrawer
              isOpen={bookingModalVisible}
              onClose={() => setBookingModalVisible(false)}
              prefilledCustomer={customer}
              prefilledInstructor={getLastUsedInstructor()}
              onBookingCreated={async () => { await refreshAllData(); message.success('Booking created!'); setBookingModalVisible(false); }}
            />
          </Suspense>
        </CalendarProvider>
      )}

      {/* Detail modals */}
      {selectedBooking && (
        <Suspense fallback={<Spin size="small" />}>
          <BookingDetailModal visible={bookingDetailModalVisible} onClose={async () => { setBookingDetailModalVisible(false); setSelectedBooking(null); await refreshAllData(); }} bookingId={selectedBooking.id} onBookingUpdated={async () => { await refreshAllData(); message.success('Booking updated'); }} onBookingDeleted={async () => { await refreshAllData(); message.success('Booking deleted'); }} />
        </Suspense>
      )}
      {selectedRental && (
        <Suspense fallback={<Spin size="small" />}>
          <RentalDetailModal visible={rentalDetailModalVisible} onClose={async () => { setRentalDetailModalVisible(false); setSelectedRental(null); await refreshAllData(); }} rentalId={selectedRental.id} onRentalUpdated={async () => { await refreshAllData(); message.success('Rental updated'); }} onRentalDeleted={async () => { await refreshAllData(); message.success('Rental deleted'); }} />
        </Suspense>
      )}
      {selectedTransaction && (
        <Suspense fallback={<Spin size="small" />}>
          <TransactionDetailModal visible={transactionDetailModalVisible} onClose={async () => { setTransactionDetailModalVisible(false); setSelectedTransaction(null); await refreshAllData(); }} transaction={selectedTransaction} onTransactionUpdated={async () => { await refreshAllData(); message.success('Transaction updated'); }} onTransactionDeleted={async () => { await refreshAllData(); message.success('Transaction deleted'); }} onRequestDelete={handleDeleteTransaction} />
        </Suspense>
      )}

      {/* Customer Bill */}
      {billModalVisible && customer && (
        <Suspense fallback={<Spin size="small" />}>
          <CustomerBillModal
            open={billModalVisible}
            onClose={() => setBillModalVisible(false)}
            customer={customer}
            bookings={bookings}
            rentals={rentals}
            packages={customerPackages}
            accommodationBookings={accommodationBookings}
            transactions={transactions}
            instructors={instructors}
            discountsByEntity={discountsByEntity}
          />
        </Suspense>
      )}

      {/* Apply Discount modal — opened by per-tab "Discount" buttons */}
      {discountTarget && customer?.id && (
        <Suspense fallback={null}>
          <ApplyDiscountModal
            open={!!discountTarget}
            onClose={() => setDiscountTarget(null)}
            onSaved={async () => {
              setDiscountTarget(null);
              await refreshDiscounts();
              message.success('Discount saved');
            }}
            customerId={customer.id}
            entityType={discountTarget.entityType}
            entityId={discountTarget.entityId}
            originalPrice={discountTarget.originalPrice}
            currency={discountTarget.currency}
            description={discountTarget.description}
            existingDiscount={discountsByEntity.get(`${discountTarget.entityType}:${discountTarget.entityId}`) || null}
          />
        </Suspense>
      )}

      {/* Edit Package Price modal — opened by "Edit Price" on a package row */}
      {editPriceTarget && customer?.id && (
        <Suspense fallback={null}>
          <EditPackagePriceModal
            open={!!editPriceTarget}
            onClose={() => setEditPriceTarget(null)}
            onSaved={async () => {
              setEditPriceTarget(null);
              await Promise.all([refreshAllData(), refreshDiscounts()]);
              message.success('Package price updated');
            }}
            packageId={editPriceTarget.packageId}
            currentPrice={editPriceTarget.currentPrice}
            originalPrice={editPriceTarget.originalPrice}
            currency={editPriceTarget.currency}
            description={editPriceTarget.description}
          />
        </Suspense>
      )}

      {/* Dependency Modal */}
      <Modal
        title="Review Linked Items Before Deleting Transaction"
        open={dependencyModalVisible}
        onCancel={() => resetTransactionDependencyState()}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => resetTransactionDependencyState()} disabled={dependencyFetchLoading}>Cancel</Button>,
          <Button key="force" danger onClick={() => { if (!selectedTransaction) return; modal.confirm({ title: 'Delete without removing linked items?', content: 'Linked records will remain and may create inconsistencies.', okText: 'Delete transaction only', okType: 'danger', onOk: () => performTransactionDeletion(selectedTransaction, { force: true }) }); }} disabled={dependencyFetchLoading}>Delete transaction only</Button>,
          <Button key="confirm" type="primary" danger onClick={handleDependencyDeleteConfirm} loading={dependencyFetchLoading} disabled={dependencyFetchLoading || (!selectedDependencyBookingIds.length && !selectedDependencyPackageIds.length && !selectedDependencyRentalIds.length) || packageStrategySelectionInvalid}>Delete selected & transaction</Button>
        ]}
      >
        <Spin spinning={dependencyFetchLoading}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Text>This transaction is linked to {dependencySummaryText}. Select records to remove before deleting.</Text>
            <Alert type="warning" showIcon message="Deleting linked records is permanent" />
            {dependencyFetchError && <Alert type="error" showIcon message={dependencyFetchError} />}
            {(dependencyBookings.length > 0 || dependencyPackages.length > 0 || dependencyRentals.length > 0) ? (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {dependencyBookings.length > 0 && (
                  <div>
                    <Divider orientation="left" className="!mt-2">Lessons ({selectedDependencyBookingIds.length}/{dependencyBookings.length})</Divider>
                    <List dataSource={dependencyBookings} renderItem={b => (
                      <List.Item key={b.id}>
                        <Checkbox checked={selectedDependencyBookingIds.includes(b.id)} onChange={e => setSelectedDependencyBookingIds(prev => e.target.checked ? [...prev.filter(x => x !== b.id), b.id] : prev.filter(x => x !== b.id))}>
                          <Space direction="vertical" size={0}><Text strong>{b.service_name || 'Lesson'}</Text><Text type="secondary">{formatDateOnly(b.date)} {b.start_hour ? `• ${b.start_hour}` : ''} • {b.status?.replace('-', ' ') || 'scheduled'}</Text></Space>
                        </Checkbox>
                      </List.Item>
                    )} />
                  </div>
                )}
                {dependencyPackages.length > 0 && (
                  <div>
                    <Divider orientation="left" className="!mt-0">Packages ({selectedDependencyPackageIds.length}/{dependencyPackages.length})</Divider>
                    <List dataSource={dependencyPackages} renderItem={pkg => {
                      const isChecked = selectedDependencyPackageIds.includes(pkg.id);
                      const usage = extractPackageUsage(pkg);
                      const se = packageCascadeOptions[pkg.id];
                      const sv = se?.strategy || resolveDefaultPackageStrategy(pkg);
                      const an = se?.allowNegative !== false;
                      const dc = usage.usedHours <= 0;
                      return (
                        <List.Item key={pkg.id}>
                          <Space direction="vertical" size="small" style={{ width: '100%' }}>
                            <Checkbox checked={isChecked} onChange={e => setSelectedDependencyPackageIds(prev => e.target.checked ? [...prev.filter(x => x !== pkg.id), pkg.id] : prev.filter(x => x !== pkg.id))}>
                              <Space direction="vertical" size={0}>
                                <Text strong>{pkg.packageName || pkg.lessonServiceName || 'Package'}</Text>
                                <Text type="secondary">{formatHoursValue(usage.usedHours)} used • {formatHoursValue(usage.remainingHours)} remaining</Text>
                              </Space>
                            </Checkbox>
                            {isChecked && (
                              <div className="pl-6">
                                <Radio.Group value={sv} onChange={e => updatePackageCascadeOption(pkg.id, { strategy: e.target.value })}>
                                  <Space direction="vertical" size="small">
                                    <Radio value="charge-used" disabled={dc}><Text strong>Charge used hours</Text></Radio>
                                    <Radio value="delete-all-lessons"><Text strong>Delete lessons & package</Text></Radio>
                                  </Space>
                                </Radio.Group>
                                {sv === 'charge-used' && (
                                  <div className="mt-2 flex items-center gap-2 text-xs">
                                    <Switch checked={an} onChange={c => updatePackageCascadeOption(pkg.id, { allowNegative: c })} />
                                    <Text type="secondary">{an ? 'Allow negative balance' : 'Block if overdraw'}</Text>
                                  </div>
                                )}
                              </div>
                            )}
                          </Space>
                        </List.Item>
                      );
                    }} />
                  </div>
                )}
                {dependencyRentals.length > 0 && (
                  <div>
                    <Divider orientation="left" className="!mt-0">Rentals ({selectedDependencyRentalIds.length}/{dependencyRentals.length})</Divider>
                    <List dataSource={dependencyRentals} renderItem={r => (
                      <List.Item key={r.id}>
                        <Checkbox checked={selectedDependencyRentalIds.includes(r.id)} onChange={e => setSelectedDependencyRentalIds(prev => e.target.checked ? [...prev.filter(x => x !== r.id), r.id] : prev.filter(x => x !== r.id))}>
                          <Space direction="vertical" size={0}><Text strong>{r.equipmentSummary || 'Rental'}</Text><Text type="secondary">{formatDateOnly(r.startDate || r.start_date || r.rental_date)} • {r.status?.replace(/_/g, ' ') || 'pending'}</Text></Space>
                        </Checkbox>
                      </List.Item>
                    )} />
                  </div>
                )}
              </Space>
            ) : <Empty description="No linked records detected." />}
          </Space>
        </Spin>
      </Modal>
    </>
  );
};

export default EnhancedCustomerDetailModal;
