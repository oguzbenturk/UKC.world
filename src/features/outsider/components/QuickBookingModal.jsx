/**
 * QuickBookingModal
 *
 * Streamlined 3-step flow for purchasing a lesson package and optionally
 * booking the first session — all in one modal.
 *
 * Step 0 – REVIEW & PAY: package summary + payment method selection + buy
 * Step 1 – SCHEDULE: pick instructor → date → time (skippable)
 * Step 2 – DONE: confirmation with remaining sessions & quick links
 *
 * For standalone services (no package), just books a single lesson session.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import dayjs from 'dayjs';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Modal,
  Select,
  Spin,
  Tag,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  RocketOutlined,
  ShoppingOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';
import { getAvailableSlots } from '@/features/bookings/components/api/calendarApi';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';
import calendarConfig from '@/config/calendarConfig';

const HALF_HOUR_MINUTES = 30;
const DEFAULT_DURATION_OPTIONS = [30, 60, 90, 120];

// Predefined lesson block start times — slots are only offered at these exact times
const PRESET_SLOT_STARTS = calendarConfig.preScheduledSlots.map((s) => s.start);

const formatDurationLabel = (minutes) => {
  if (!Number.isFinite(minutes)) return '';
  const totalHours = minutes / 60;
  if (totalHours >= 1) return `${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h`;
  return `${minutes}m`;
};

const normalizeNumeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const timeStringToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

const minutesToTimeString = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const computeAvailableStarts = (slots, durationMinutes, isToday) => {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  const stepsRequired = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  // Index slots by time for O(1) lookup
  const slotByTime = new Map(slots.map((s) => [s.time, s]));
  const nowMinutes = isToday ? dayjs().hour() * 60 + dayjs().minute() : null;
  const results = [];

  // Only offer the business-defined lesson blocks as start times
  for (const startTime of PRESET_SLOT_STARTS) {
    const startMinutes = timeStringToMinutes(startTime);
    if (startMinutes === null) continue;
    // Skip past slots on today
    if (nowMinutes !== null && startMinutes < nowMinutes + 30) continue;
    // Verify every 30-min sub-slot within the window is available
    let allAvailable = true;
    for (let step = 0; step < stepsRequired; step++) {
      const slotTime = minutesToTimeString(startMinutes + step * HALF_HOUR_MINUTES);
      const slot = slotByTime.get(slotTime);
      if (!slot || slot.status !== 'available') {
        allAvailable = false;
        break;
      }
    }
    if (allAvailable) {
      const endTime = minutesToTimeString(startMinutes + durationMinutes);
      results.push({ value: startTime, label: `${startTime} – ${endTime}` });
    }
  }
  return results;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the best price for the given package in the user's currency.
 */
const resolvePkgPrice = (pkg, userCurrency, convertCurrency) => {
  if (!pkg) return { price: 0, currency: 'EUR' };
  if (userCurrency && Array.isArray(pkg.prices)) {
    const match = pkg.prices.find(
      (p) => p.currencyCode === userCurrency || p.currency_code === userCurrency
    );
    if (match && match.price > 0) return { price: match.price, currency: userCurrency };
  }
  const base = pkg.currency || 'EUR';
  const basePrice = pkg.price || 0;
  if (convertCurrency && userCurrency && userCurrency !== base) {
    return { price: convertCurrency(basePrice, base, userCurrency), currency: userCurrency };
  }
  return { price: basePrice, currency: base };
};

// ── Sub-components ───────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
const PayStep = ({ packageData, packageName, totalSessions, durationHours, displayPrice, priceCurrency, formatCurrency, paymentMethod, setPaymentMethod, walletBalance, walletCurrency, walletInsufficient, userCurrency, convertCurrency, purchasing, onPurchase, canPayLater, onCreateGroupLesson, onCreateGroupWithFriend }) => {
  const isGroupPackage = packageData?.lessonCategoryTag?.toLowerCase() === 'group';

  return (
  <div className="space-y-4 sm:space-y-5">
    {/* Package summary card */}
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 p-4 sm:p-5">
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-blue-500/[0.04]" />
      <div className="relative">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{packageName}</h3>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {packageData?.lessonCategoryTag && (
            <Tag color="blue" className="!text-[10px] sm:!text-xs !m-0 !leading-tight">{packageData.lessonCategoryTag}</Tag>
          )}
          {packageData?.levelTag && (
            <Tag className="!text-[10px] sm:!text-xs !m-0 !leading-tight">{packageData.levelTag}</Tag>
          )}
          <span className="text-[11px] sm:text-xs text-slate-400">
            <ClockCircleOutlined className="mr-1" />
            {durationHours}h · {totalSessions} session{totalSessions !== 1 ? 's' : ''}
          </span>
        </div>
        {packageData?.description && (
          <p className="text-xs sm:text-sm text-slate-500 mt-2 line-clamp-2">{packageData.description}</p>
        )}
        <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-end justify-between">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Package Total</span>
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
            {formatCurrency(displayPrice, priceCurrency)}
          </span>
        </div>
      </div>
    </div>

    {isGroupPackage ? (
      <>
        {/* Group package — must go through group flow, no direct payment */}
        <Alert
          type="info"
          showIcon
          className="!rounded-xl"
          message="This is a group lesson package"
          description="Group lessons require at least 2 people. Choose how you'd like to proceed below."
        />

        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <Button
            type="primary"
            size="large"
            block
            className="!h-12 !rounded-xl !font-bold"
            icon={<TeamOutlined />}
            onClick={onCreateGroupWithFriend}
          >
            I have a friend — Create Group
          </Button>
          <Button
            size="large"
            block
            className="!h-12 !rounded-xl !font-bold !border-violet-300 !text-violet-600 hover:!bg-violet-50"
            onClick={onCreateGroupLesson}
          >
            I'm alone — Find me a partner
          </Button>
        </div>
      </>
    ) : (
      <>
        {/* Non-group (private) package — normal payment flow */}
        <div>
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Payment Method
          </p>
          <div className={`grid gap-2 ${canPayLater ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={() => setPaymentMethod('wallet')}
              className={`relative flex flex-col items-center gap-1 sm:gap-1.5 p-3 sm:p-4 rounded-xl border-2 transition-all text-center ${
                paymentMethod === 'wallet'
                  ? 'border-blue-500 bg-blue-50 shadow-sm shadow-blue-500/10'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {paymentMethod === 'wallet' && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <CheckOutlined className="text-white text-[8px]" />
                </div>
              )}
              <WalletOutlined className={`text-lg sm:text-xl ${paymentMethod === 'wallet' ? 'text-blue-500' : 'text-slate-400'}`} />
              <span className={`text-xs sm:text-sm font-semibold ${paymentMethod === 'wallet' ? 'text-blue-700' : 'text-slate-600'}`}>Wallet</span>
              <span className={`text-[10px] sm:text-xs ${paymentMethod === 'wallet' ? 'text-blue-500' : 'text-slate-400'}`}>
                {formatCurrency(
                  convertCurrency ? convertCurrency(walletBalance, walletCurrency, userCurrency) : walletBalance,
                  userCurrency
                )}
              </span>
            </button>
            {canPayLater && (
              <button
                type="button"
                onClick={() => setPaymentMethod('pay_later')}
                className={`relative flex flex-col items-center gap-1 sm:gap-1.5 p-3 sm:p-4 rounded-xl border-2 transition-all text-center ${
                  paymentMethod === 'pay_later'
                    ? 'border-orange-500 bg-orange-50 shadow-sm shadow-orange-500/10'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {paymentMethod === 'pay_later' && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
                    <CheckOutlined className="text-white text-[8px]" />
                  </div>
                )}
                <CreditCardOutlined className={`text-lg sm:text-xl ${paymentMethod === 'pay_later' ? 'text-orange-500' : 'text-slate-400'}`} />
                <span className={`text-xs sm:text-sm font-semibold ${paymentMethod === 'pay_later' ? 'text-orange-700' : 'text-slate-600'}`}>Pay Later</span>
                <span className={`text-[10px] sm:text-xs ${paymentMethod === 'pay_later' ? 'text-orange-500' : 'text-slate-400'}`}>
                  At the center
                </span>
              </button>
            )}
          </div>

          {walletInsufficient && paymentMethod === 'wallet' && (
            <Alert
              type="warning"
              showIcon
              className="!mt-3 !rounded-xl !text-xs"
              message="Insufficient wallet balance"
              description="Switch to Pay Later or top up your wallet first."
            />
          )}
        </div>

        <Button
          type="primary"
          size="large"
          block
          loading={purchasing}
          disabled={purchasing || (paymentMethod === 'wallet' && walletInsufficient)}
          onClick={onPurchase}
          className="!h-12 sm:!h-14 !rounded-xl !text-sm sm:!text-base !font-bold"
          icon={<ShoppingOutlined />}
        >
          {paymentMethod === 'wallet'
            ? `Pay ${formatCurrency(displayPrice, priceCurrency)}`
            : 'Confirm — Pay Later'}
        </Button>

        {/* Group Lesson Options */}
        <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">
            <TeamOutlined className="mr-1" />
            Prefer a group lesson?
          </p>
          <div className="flex items-center justify-center gap-1">
            <Button
              type="link"
              size="small"
              className="!text-xs !font-semibold !text-blue-600"
              onClick={onCreateGroupWithFriend}
            >
              I have a friend →
            </Button>
            <span className="text-xs text-slate-300">|</span>
            <Button
              type="link"
              size="small"
              className="!text-xs !font-semibold !text-violet-600"
              onClick={onCreateGroupLesson}
            >
              Find me a partner →
            </Button>
          </div>
        </div>
      </>
    )}
  </div>
  );
};

const ScheduleStep = ({ isExistingPackage, existingPackageRemaining, durationOptions, selectedDurationMinutes, setSelectedDurationMinutes, instructorsData, instructorsLoading, selectedInstructorId, setSelectedInstructorId, selectedDate, setSelectedDate, selectedDateString, selectedTime, setSelectedTime, slotsLoading, availableStarts, bookingPending, onBookSession, onSkip, setResetDateAndTime }) => (
  <div className="space-y-4 sm:space-y-5">
    {/* Status banner */}
    <div className={`rounded-2xl border p-3 sm:p-4 flex items-start sm:items-center gap-2.5 sm:gap-3 ${
      isExistingPackage
        ? 'bg-blue-50 border-blue-200'
        : 'bg-green-50 border-green-200'
    }`}>
      <CheckCircleFilled className={`shrink-0 mt-0.5 sm:mt-0 ${
        isExistingPackage ? 'text-blue-500 text-lg sm:text-xl' : 'text-green-500 text-lg sm:text-xl'
      }`} />
      <div className="min-w-0">
        <p className={`font-semibold text-xs sm:text-sm ${
          isExistingPackage ? 'text-blue-800' : 'text-green-800'
        }`}>
          {isExistingPackage ? 'You have an active package!' : 'Package purchased!'}
        </p>
        <p className={`text-[11px] sm:text-xs mt-0.5 leading-relaxed ${
          isExistingPackage ? 'text-blue-600' : 'text-green-600'
        }`}>
          {isExistingPackage
            ? `${existingPackageRemaining}h remaining — schedule a session below.`
            : 'Now schedule your first session, or skip and book later.'}
        </p>
      </div>
    </div>

    {/* Duration selector */}
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        <ClockCircleOutlined className="mr-1" /> Session Duration
      </p>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {durationOptions.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => setSelectedDurationMinutes(minutes)}
            className={`px-2 py-2.5 sm:px-3 sm:py-2 border-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              selectedDurationMinutes === minutes
                ? 'bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-500/20'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            {formatDurationLabel(minutes)}
          </button>
        ))}
      </div>
    </div>

    {/* Instructor */}
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        <UserOutlined className="mr-1" /> Instructor
      </p>
      {instructorsLoading ? (
        <div className="flex justify-center py-4"><Spin size="small" /></div>
      ) : (
        <Select
          placeholder="Choose your instructor"
          className="w-full"
          size="large"
          value={selectedInstructorId}
          onChange={(val) => {
            setSelectedInstructorId(val);
            setResetDateAndTime();
          }}
          options={instructorsData.map((inst) => ({
            value: inst.id,
            label: `${inst.first_name || ''} ${inst.last_name || ''}`.trim() || inst.name || inst.email,
          }))}
        />
      )}
    </div>

    {/* Date */}
    {selectedInstructorId && (
      <div>
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          <CalendarOutlined className="mr-1" /> Date
        </p>
        <DatePicker
          className="w-full"
          size="large"
          value={selectedDate}
          onChange={(val) => {
            setSelectedDate(val);
            setSelectedTime(null);
          }}
          disabledDate={(current) => current && current.isBefore(dayjs(), 'day')}
          format="ddd, MMM D, YYYY"
          inputReadOnly
        />
      </div>
    )}

    {/* Time */}
    {selectedInstructorId && selectedDateString && (
      <div>
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          <ClockCircleOutlined className="mr-1" /> Time Slot
        </p>
        {slotsLoading ? (
          <div className="flex justify-center py-4"><Spin size="small" /></div>
        ) : availableStarts.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="No available slots for this date."
            description="Try another date or a different instructor."
            className="!rounded-xl !text-xs"
          />
        ) : (
          <Select
            placeholder="Pick a time slot"
            className="w-full"
            size="large"
            value={selectedTime}
            onChange={setSelectedTime}
            options={availableStarts}
          />
        )}
      </div>
    )}

    {/* Action buttons — stack on mobile */}
    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2">
      <Button size="large" block onClick={onSkip} className="!h-11 sm:!h-12 !rounded-xl !text-xs sm:!text-sm">
        Skip — Book Later
      </Button>
      <Button
        type="primary"
        size="large"
        block
        disabled={!selectedInstructorId || !selectedDateString || !selectedTime}
        loading={bookingPending}
        onClick={onBookSession}
        className="!h-11 sm:!h-12 !rounded-xl !font-bold !text-xs sm:!text-sm"
        icon={<CalendarOutlined />}
      >
        Book Session
      </Button>
    </div>
  </div>
);

// eslint-disable-next-line complexity
const DoneStep = ({ packageName, paymentMethod, skipSchedule, selectedDateString, selectedTime, purchasedPackage, durationHours, perSessionHours, isExistingPackage, onClose }) => {
  const remaining = purchasedPackage?.remainingHours ?? (durationHours || 0);
  const usedBooking = !skipSchedule;

  return (
    <div className="text-center space-y-4 sm:space-y-5 py-2 sm:py-4">
      {/* Success icon with pulse ring */}
      <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 relative">
        <div className="absolute inset-0 rounded-full bg-green-200/50 animate-pulse" />
        <div className="relative w-full h-full rounded-full bg-gradient-to-br from-green-100 to-emerald-50 flex items-center justify-center border-2 border-green-200 shadow-sm shadow-green-500/10">
          <CheckCircleFilled className="text-green-500 text-2xl sm:text-4xl" />
        </div>
      </div>

      <div className="px-2">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">All Done!</h3>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          {usedBooking
            ? (isExistingPackage
              ? 'Your session is booked from your existing package.'
              : 'Package purchased & your first session is booked.')
            : (isExistingPackage
              ? 'No session booked — schedule anytime from your dashboard.'
              : 'Package purchased — book sessions anytime from your dashboard.')}
        </p>
      </div>

      <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-3 sm:p-4 text-left space-y-2.5">
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-slate-500">Package</span>
          <span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{packageName}</span>
        </div>
        {!isExistingPackage && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Payment</span>
            <Tag color={paymentMethod === 'wallet' ? 'green' : 'orange'} className="!m-0 !text-[10px] sm:!text-xs">
              {paymentMethod === 'wallet' ? 'Paid' : 'Pay Later'}
            </Tag>
          </div>
        )}
        {isExistingPackage && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Source</span>
            <Tag color="blue" className="!m-0 !text-[10px] sm:!text-xs">Existing Package</Tag>
          </div>
        )}
        {usedBooking && selectedDateString && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Session</span>
            <span className="font-semibold text-slate-800">
              {dayjs(selectedDateString).format('ddd, MMM D')} at {selectedTime}
            </span>
          </div>
        )}
        {remaining > 0 && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Remaining</span>
            <span className="font-semibold text-emerald-600">
              {usedBooking ? remaining - (perSessionHours || 1) : remaining}h left
            </span>
          </div>
        )}
      </div>

      <Button
        type="primary"
        size="large"
        block
        onClick={onClose}
        className="!h-11 sm:!h-12 !rounded-xl !font-bold !text-sm"
      >
        Done
      </Button>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
const QuickBookingModal = ({ open, onClose, packageData, serviceId, durationHours }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshToken } = useAuth();
  const { formatCurrency, userCurrency, convertCurrency } = useCurrency();

  // ── Local state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [purchasing, setPurchasing] = useState(false);
  const [purchasedPackage, setPurchasedPackage] = useState(null);
  const [isExistingPackage, setIsExistingPackage] = useState(false);

  const [selectedInstructorId, setSelectedInstructorId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [skipSchedule, setSkipSchedule] = useState(false);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(60);

  const studentId = user?.userId || user?.id;

  // Determine if user can use pay_later based on role
  const canPayLater = PAY_AT_CENTER_ALLOWED_ROLES.includes(user?.role);

  // Per-session default: total package hours / sessions count
  const sessionsCount = packageData?.sessionsCount || 1;
  const defaultPerSessionMinutes = sessionsCount > 0
    ? Math.round(((durationHours || 1) / sessionsCount) * 60)
    : 60;

  // The actual duration used for availability + booking
  const activeDurationMinutes = selectedDurationMinutes || defaultPerSessionMinutes;
  const activeDurationHours = activeDurationMinutes / 60;

  // ── Fetch user's existing customer packages ───────────────────────────────
  const { data: ownedPackages = [] } = useQuery({
    queryKey: ['quick-booking', 'owned-packages', studentId],
    queryFn: async () => {
      const res = await apiClient.get(`/services/customer-packages/${studentId}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: open && !!studentId,
    staleTime: 120_000,
  });

  // Find a matching active customer package by service_package_id
  const matchingOwnedPackage = useMemo(() => {
    if (!packageData?.id || !ownedPackages.length) return null;
    return ownedPackages.find((cp) => {
      const isActive = (cp.status || '').toLowerCase() === 'active';
      const hasHours = (parseFloat(cp.remainingHours ?? cp.remaining_hours) || 0) > 0;
      const matchesPackage =
        String(cp.servicePackageId || cp.service_package_id) === String(packageData.id);
      return isActive && hasHours && matchesPackage;
    }) || null;
  }, [packageData?.id, ownedPackages]);

  // Reset all state when modal opens
  useEffect(() => {
    if (open) {
      setPaymentMethod('wallet');
      setPurchasing(false);
      setSelectedInstructorId(null);
      setSelectedDate(null);
      setSelectedTime(null);
      setSkipSchedule(false);
      setSelectedDurationMinutes(null);
      // Initial step detection happens in the effect below once ownedPackages load
      setStep(0);
      setPurchasedPackage(null);
      setIsExistingPackage(false);
    }
  }, [open]);

  // Once owned packages are loaded, check for an existing matching package
  const hasDetectedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hasDetectedRef.current = false;
      return;
    }
    // Only run detection once per open
    if (hasDetectedRef.current) return;
    // Wait for ownedPackages to be fetched (non-empty or query settled)
    if (matchingOwnedPackage) {
      hasDetectedRef.current = true;
      setStep(1);
      setPurchasedPackage(matchingOwnedPackage);
      setIsExistingPackage(true);
    }
  }, [open, matchingOwnedPackage]);

  // ── Booking defaults (for allowed durations) ─────────────────────────────
  const { data: bookingDefaults } = useQuery({
    queryKey: ['quick-booking', 'booking-defaults'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/settings');
        return response.data?.booking_defaults ?? null;
      } catch { return null; }
    },
    enabled: open,
    staleTime: 300_000,
    retry: false,
  });

  // ── Duration options ─────────────────────────────────────────────────────
  const remainingHours = purchasedPackage?.remainingHours ?? (durationHours || 0);
  const remainingMinutes = remainingHours * 60;

  const durationOptions = useMemo(() => {
    const candidateSet = new Set();
    if (Array.isArray(bookingDefaults?.allowedDurations)) {
      bookingDefaults.allowedDurations.forEach((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) {
          candidateSet.add(Math.max(HALF_HOUR_MINUTES, Math.round(n / HALF_HOUR_MINUTES) * HALF_HOUR_MINUTES));
        }
      });
    }
    if (defaultPerSessionMinutes > 0) candidateSet.add(defaultPerSessionMinutes);
    if (candidateSet.size === 0) DEFAULT_DURATION_OPTIONS.forEach((d) => candidateSet.add(d));
    // Cap at remaining package hours
    const maxMinutes = remainingMinutes > 0 ? remainingMinutes : Infinity;
    return Array.from(candidateSet)
      .filter((m) => Number.isFinite(m) && m >= HALF_HOUR_MINUTES && m <= maxMinutes)
      .sort((a, b) => a - b);
  }, [bookingDefaults, defaultPerSessionMinutes, remainingMinutes]);

  // Pre-select default duration once options are available
  useEffect(() => {
    if (step === 1 && durationOptions.length > 0 && !selectedDurationMinutes) {
      const preferred = durationOptions.includes(defaultPerSessionMinutes)
        ? defaultPerSessionMinutes
        : durationOptions[0];
      setSelectedDurationMinutes(preferred);
    }
  }, [step, durationOptions, defaultPerSessionMinutes, selectedDurationMinutes]);

  const { data: walletSummary } = useWalletSummary({
    userId: studentId,
    enabled: open && !!studentId,
  });
  const walletBalance = normalizeNumeric(walletSummary?.available, 0);
  const walletCurrency = walletSummary?.currency || 'EUR';

  const { price: displayPrice, currency: priceCurrency } = useMemo(
    () => resolvePkgPrice(packageData, userCurrency, convertCurrency),
    [packageData, userCurrency, convertCurrency]
  );
  const walletInsufficient = paymentMethod === 'wallet' && displayPrice > walletBalance;

  const { data: instructorsData = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['quick-booking', 'instructors'],
    queryFn: () => apiClient.get('/instructors').then((r) => r.data),
    enabled: open && step === 1,
    staleTime: 300_000,
  });

  const selectedDateString = selectedDate?.isValid() ? selectedDate.format('YYYY-MM-DD') : null;
  const { data: availabilityData, isLoading: slotsLoading } = useQuery({
    queryKey: ['quick-booking', 'slots', selectedDateString, selectedInstructorId],
    queryFn: async () => {
      const filters = { instructorIds: [selectedInstructorId] };
      return getAvailableSlots(selectedDateString, selectedDateString, filters);
    },
    enabled: open && step === 1 && !!selectedDateString && !!selectedInstructorId,
    staleTime: 60_000,
  });

  const availableStarts = useMemo(() => {
    if (!availabilityData?.length) return [];
    const dayData = availabilityData.find((d) => d.date === selectedDateString);
    if (!dayData?.slots) return [];
    const instructorSlots = dayData.slots.filter((s) => s.instructorId === selectedInstructorId);
    const isToday = dayjs().format('YYYY-MM-DD') === selectedDateString;
    return computeAvailableStarts(instructorSlots, activeDurationMinutes, isToday);
  }, [availabilityData, selectedDateString, selectedInstructorId, activeDurationMinutes]);

  const purchaseMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/services/packages/purchase', payload),
    onSuccess: async (res) => {
      setPurchasedPackage(res.data.customerPackage);
      setIsExistingPackage(false); // freshly purchased, not existing
      if (res.data.roleUpgrade?.upgraded) {
        try { await refreshToken(); } catch { /* ignore */ }
      }
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['student-booking'] });
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['quick-booking', 'owned-packages'] });
      message.success('Package purchased!');
      setStep(1);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Purchase failed');
    },
    onSettled: () => setPurchasing(false),
  });

  const bookingMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/bookings', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-booking'] });
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['quick-booking', 'owned-packages'] });
      queryClient.invalidateQueries({ queryKey: ['customer-packages'] });
      message.success('Lesson booked!');
      setStep(2);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Booking failed');
    },
  });

  const handlePurchase = useCallback(() => {
    if (!packageData?.id || !studentId) return;
    setPurchasing(true);
    purchaseMutation.mutate({
      packageId: packageData.id,
      paymentMethod: paymentMethod === 'wallet' ? 'wallet' : 'pay_later',
    });
  }, [packageData, studentId, paymentMethod, purchaseMutation]);

  const handleBookSession = useCallback(() => {
    if (!studentId || !selectedInstructorId || !selectedDateString || !selectedTime) return;
    const [h, m] = selectedTime.split(':').map(Number);
    const startHour = h + (m || 0) / 60;
    const pkgName = packageData?.name || 'Quick Booking';

    bookingMutation.mutate({
      student_user_id: studentId, instructor_user_id: selectedInstructorId,
      service_id: serviceId || null, date: selectedDateString,
      start_hour: startHour, duration: activeDurationHours,
      status: 'pending', notes: `Booked via package: ${pkgName}`,
      use_package: true,
      customer_package_id: purchasedPackage?.id || null,
      selected_package_id: purchasedPackage?.id || null,
      amount: 0, final_amount: 0, base_amount: 0,
      package_hours_applied: activeDurationHours,
      package_chargeable_hours: activeDurationHours,
      discount_percent: 0, discount_amount: 0, payment_method: 'wallet',
    });
  }, [studentId, selectedInstructorId, selectedDateString, selectedTime, serviceId, activeDurationHours, packageData, purchasedPackage, bookingMutation]);

  const handleSkipSchedule = useCallback(() => {
    setSkipSchedule(true);
    setStep(2);
  }, []);

  const handleCreateGroupLesson = useCallback(() => {
    onClose();
    navigate('/student/group-bookings/request', {
      state: { serviceId, packageData, durationHours }
    });
  }, [onClose, navigate, serviceId, packageData, durationHours]);

  const handleCreateGroupWithFriend = useCallback(() => {
    onClose();
    navigate('/student/group-bookings/create', {
      state: { serviceId, packageData, durationHours }
    });
  }, [onClose, navigate, serviceId, packageData, durationHours]);

  const handleClose = useCallback(() => onClose(), [onClose]);
  const handleResetDateAndTime = useCallback(() => { setSelectedDate(null); setSelectedTime(null); }, []);
  const handleDurationChange = useCallback((minutes) => {
    setSelectedDurationMinutes(minutes);
    setSelectedTime(null); // reset time when duration changes (different slots)
  }, []);

  const totalSessions = packageData?.sessionsCount || Math.round(durationHours || 1);
  const packageName = packageData?.name || 'Lesson';

  // Dynamic step titles based on whether user already owns the package
  const stepTitles = isExistingPackage
    ? ['—', 'Schedule Session', 'Complete']
    : ['Review & Pay', 'Schedule Session', 'Complete'];

  // Number of visible steps for the progress indicator
  const visibleSteps = isExistingPackage
    ? [{ title: 'Schedule Session', idx: 1 }, { title: 'Complete', idx: 2 }]
    : [{ title: 'Review & Pay', idx: 0 }, { title: 'Schedule Session', idx: 1 }, { title: 'Complete', idx: 2 }];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={520}
      centered
      destroyOnHidden
      closable={step < 2}
      maskClosable={step === 0}
      style={{ maxWidth: '94vw' }}
      styles={{
        content: { borderRadius: 16, padding: '16px 16px 20px' },
        header: { marginBottom: 0, paddingBottom: 12 },
      }}
      title={
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
            <RocketOutlined className="text-white text-sm sm:text-base" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
              {stepTitles[step] || 'Quick Booking'}
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-400 leading-tight mt-0.5">
              Step {visibleSteps.findIndex(s => s.idx === step) + 1} of {visibleSteps.length}
            </p>
          </div>
          {/* Progress bar */}
          <div className="flex gap-1 sm:gap-1.5 ml-auto">
            {visibleSteps.map(({ title, idx }) => (
              <div
                key={title}
                className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                  idx < step
                    ? 'bg-green-500 w-4 sm:w-5'
                    : idx === step
                      ? 'bg-blue-500 w-6 sm:w-8'
                      : 'bg-slate-200 w-3 sm:w-4'
                }`}
                title={title}
              />
            ))}
          </div>
        </div>
      }
    >
      {step === 0 && (
        <PayStep
          packageData={packageData}
          packageName={packageName}
          totalSessions={totalSessions}
          durationHours={durationHours}
          displayPrice={displayPrice}
          priceCurrency={priceCurrency}
          formatCurrency={formatCurrency}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          walletBalance={walletBalance}
          walletCurrency={walletCurrency}
          walletInsufficient={walletInsufficient}
          userCurrency={userCurrency}
          convertCurrency={convertCurrency}
          purchasing={purchasing}
          onPurchase={handlePurchase}
          canPayLater={canPayLater}
          onCreateGroupLesson={handleCreateGroupLesson}
          onCreateGroupWithFriend={handleCreateGroupWithFriend}
        />
      )}
      {step === 1 && (
        <ScheduleStep
          isExistingPackage={isExistingPackage}
          existingPackageRemaining={matchingOwnedPackage ? (parseFloat(matchingOwnedPackage.remainingHours ?? matchingOwnedPackage.remaining_hours) || 0) : 0}
          durationOptions={durationOptions}
          selectedDurationMinutes={activeDurationMinutes}
          setSelectedDurationMinutes={handleDurationChange}
          instructorsData={instructorsData}
          instructorsLoading={instructorsLoading}
          selectedInstructorId={selectedInstructorId}
          setSelectedInstructorId={setSelectedInstructorId}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          selectedDateString={selectedDateString}
          selectedTime={selectedTime}
          setSelectedTime={setSelectedTime}
          slotsLoading={slotsLoading}
          availableStarts={availableStarts}
          bookingPending={bookingMutation.isPending}
          onBookSession={handleBookSession}
          onSkip={handleSkipSchedule}
          setResetDateAndTime={handleResetDateAndTime}
        />
      )}
      {step === 2 && (
        <DoneStep
          packageName={packageName}
          paymentMethod={paymentMethod}
          skipSchedule={skipSchedule}
          selectedDateString={selectedDateString}
          selectedTime={selectedTime}
          purchasedPackage={purchasedPackage}
          durationHours={durationHours}
          perSessionHours={activeDurationHours}
          isExistingPackage={isExistingPackage}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
};

QuickBookingModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  packageData: PropTypes.object,   // raw package row from API (with id, name, price, prices, etc.)
  serviceId: PropTypes.string,     // resolved lesson service UUID
  durationHours: PropTypes.number, // selected duration in hours
};

export default QuickBookingModal;
