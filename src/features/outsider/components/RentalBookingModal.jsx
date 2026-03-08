/**
 * RentalBookingModal
 *
 * Streamlined 3-step flow for booking rental equipment — matching
 * the visual design of QuickBookingModal but tailored for rentals.
 *
 * Step 0 – REVIEW & PAY: rental summary + payment method selection + confirm
 * Step 1 – SCHEDULE: pick date + time (no instructor needed for rentals)
 * Step 2 – DONE: confirmation with rental details
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import dayjs from 'dayjs';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Modal,
  Select,
  Tag,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  ToolOutlined,
  ShoppingOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalizeNumeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDurationLabel = (hours) => {
  if (!Number.isFinite(hours) || hours <= 0) return '';
  if (hours < 24) return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days % 1 === 0 ? days : days.toFixed(1)} day${days !== 1 ? 's' : ''}`;
};

/** Compute a human-friendly duration tag, e.g. "1h", "Half Day", "Full Day", "1 Week" */
const getDurationTag = (hours) => {
  if (!hours) return '';
  if (hours <= 1) return '1h Session';
  if (hours <= 4) return 'Half Day';
  if (hours <= 8) return 'Full Day';
  if (hours >= 168) return '1 Week';
  if (hours >= 24) return `${Math.round(hours / 24)} Day${hours >= 48 ? 's' : ''}`;
  return `${hours}h`;
};

// Default rental pickup times
const DEFAULT_RENTAL_TIMES = [
  { value: '09:00', label: '09:00 — Morning' },
  { value: '10:00', label: '10:00 — Morning' },
  { value: '11:00', label: '11:00 — Late Morning' },
  { value: '12:00', label: '12:00 — Noon' },
  { value: '13:00', label: '13:00 — Afternoon' },
  { value: '14:00', label: '14:00 — Afternoon' },
  { value: '15:00', label: '15:00 — Afternoon' },
  { value: '16:00', label: '16:00 — Late Afternoon' },
];

// ── Sub-components ───────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
const PayStep = ({
  serviceName,
  durationHours,
  description,
  displayPrice,
  priceCurrency,
  formatCurrency,
  paymentMethod,
  setPaymentMethod,
  walletBalance,
  walletCurrency,
  walletInsufficient,
  userCurrency,
  convertCurrency,
  submitting,
  onConfirm,
  canPayLater,
}) => (
  <div className="space-y-4 sm:space-y-5">
    {/* Rental summary card */}
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-orange-50/30 p-4 sm:p-5">
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-orange-500/[0.04]" />
      <div className="relative">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{serviceName}</h3>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Tag color="orange" className="!text-[10px] sm:!text-xs !m-0 !leading-tight">Rental</Tag>
          {durationHours > 0 && (
            <Tag className="!text-[10px] sm:!text-xs !m-0 !leading-tight">{getDurationTag(durationHours)}</Tag>
          )}
          <span className="text-[11px] sm:text-xs text-slate-400">
            <ClockCircleOutlined className="mr-1" />
            {formatDurationLabel(durationHours)}
          </span>
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-slate-500 mt-2 line-clamp-2">{description}</p>
        )}
        <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-end justify-between">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Rental Price</span>
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
            {formatCurrency(displayPrice, priceCurrency)}
          </span>
        </div>
      </div>
    </div>

    {/* Payment method */}
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
      loading={submitting}
      disabled={submitting || (paymentMethod === 'wallet' && walletInsufficient)}
      onClick={onConfirm}
      className="!h-12 sm:!h-14 !rounded-xl !text-sm sm:!text-base !font-bold"
      icon={<ShoppingOutlined />}
    >
      {paymentMethod === 'wallet'
        ? `Pay ${formatCurrency(displayPrice, priceCurrency)}`
        : 'Confirm — Pay Later'}
    </Button>
  </div>
);

const ScheduleStep = ({
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  bookingPending,
  onBookRental,
  onSkip,
}) => (
  <div className="space-y-4 sm:space-y-5">
    {/* Status banner */}
    <div className="rounded-2xl border p-3 sm:p-4 flex items-start sm:items-center gap-2.5 sm:gap-3 bg-green-50 border-green-200">
      <CheckCircleFilled className="shrink-0 mt-0.5 sm:mt-0 text-green-500 text-lg sm:text-xl" />
      <div className="min-w-0">
        <p className="font-semibold text-xs sm:text-sm text-green-800">
          Payment confirmed!
        </p>
        <p className="text-[11px] sm:text-xs mt-0.5 leading-relaxed text-green-600">
          Now pick a date and pickup time for your rental, or skip and arrange later.
        </p>
      </div>
    </div>

    {/* Date */}
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        <CalendarOutlined className="mr-1" /> Rental Date
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

    {/* Time */}
    {selectedDate && (
      <div>
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          <ClockCircleOutlined className="mr-1" /> Pickup Time
        </p>
        <Select
          placeholder="Pick a time"
          className="w-full"
          size="large"
          value={selectedTime}
          onChange={setSelectedTime}
          options={DEFAULT_RENTAL_TIMES}
        />
      </div>
    )}

    {/* Action buttons */}
    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2">
      <Button size="large" block onClick={onSkip} className="!h-11 sm:!h-12 !rounded-xl !text-xs sm:!text-sm">
        Skip — Arrange Later
      </Button>
      <Button
        type="primary"
        size="large"
        block
        disabled={!selectedDate || !selectedTime}
        loading={bookingPending}
        onClick={onBookRental}
        className="!h-11 sm:!h-12 !rounded-xl !font-bold !text-xs sm:!text-sm"
        icon={<CalendarOutlined />}
      >
        Confirm Rental
      </Button>
    </div>
  </div>
);

const DoneStep = ({
  serviceName,
  paymentMethod,
  skipSchedule,
  selectedDateString,
  selectedTime,
  durationHours,
  displayPrice,
  formatCurrency,
  priceCurrency,
  onClose,
}) => (
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
        {skipSchedule
          ? 'Your rental is confirmed. Contact us to arrange pickup.'
          : 'Your rental is booked! Check your dashboard for details.'}
      </p>
    </div>

    <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-3 sm:p-4 text-left space-y-2.5">
      <div className="flex justify-between items-center text-xs sm:text-sm">
        <span className="text-slate-500">Equipment</span>
        <span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{serviceName}</span>
      </div>
      {durationHours > 0 && (
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-slate-500">Duration</span>
          <span className="font-semibold text-slate-800">{formatDurationLabel(durationHours)}</span>
        </div>
      )}
      {displayPrice > 0 && (
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-slate-500">Price</span>
          <span className="font-semibold text-slate-800">{formatCurrency(displayPrice, priceCurrency)}</span>
        </div>
      )}
      <div className="flex justify-between items-center text-xs sm:text-sm">
        <span className="text-slate-500">Payment</span>
        <Tag color={paymentMethod === 'wallet' ? 'green' : 'orange'} className="!m-0 !text-[10px] sm:!text-xs">
          {paymentMethod === 'wallet' ? 'Paid' : 'Pay Later'}
        </Tag>
      </div>
      {!skipSchedule && selectedDateString && (
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-slate-500">Pickup</span>
          <span className="font-semibold text-slate-800">
            {dayjs(selectedDateString).format('ddd, MMM D')} at {selectedTime}
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

// ── Main Component ───────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
const RentalBookingModal = ({
  open,
  onClose,
  serviceId,
  serviceName,
  servicePrice,
  serviceCurrency,
  durationHours,
  serviceDescription,
}) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user, refreshToken } = useAuth();
  const { formatCurrency, userCurrency, convertCurrency } = useCurrency();

  // ── Local state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [submitting, setSubmitting] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [skipSchedule, setSkipSchedule] = useState(false);

  const studentId = user?.userId || user?.id;
  const canPayLater = PAY_AT_CENTER_ALLOWED_ROLES.includes(user?.role);

  // ── Price resolution ──────────────────────────────────────────────────────
  const displayPrice = useMemo(() => {
    const basePrice = normalizeNumeric(servicePrice, 0);
    const baseCurrency = serviceCurrency || 'EUR';
    if (convertCurrency && userCurrency && userCurrency !== baseCurrency) {
      return convertCurrency(basePrice, baseCurrency, userCurrency);
    }
    return basePrice;
  }, [servicePrice, serviceCurrency, userCurrency, convertCurrency]);

  const priceCurrency = userCurrency || serviceCurrency || 'EUR';

  // ── Wallet ────────────────────────────────────────────────────────────────
  const { data: walletSummary } = useWalletSummary({
    userId: studentId,
    enabled: open && !!studentId,
  });
  const walletBalance = normalizeNumeric(walletSummary?.available, 0);
  const walletCurrency = walletSummary?.currency || 'EUR';
  const walletInsufficient = paymentMethod === 'wallet' && displayPrice > walletBalance;

  // ── Reset state when modal opens ──────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep(0);
      setPaymentMethod('wallet');
      setSubmitting(false);
      setSelectedDate(null);
      setSelectedTime(null);
      setSkipSchedule(false);
    }
  }, [open]);

  const selectedDateString = selectedDate?.isValid() ? selectedDate.format('YYYY-MM-DD') : null;

  // ── Booking mutation ──────────────────────────────────────────────────────
  const bookingMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/bookings', payload),
    onSuccess: async (res) => {
      if (res.data?.roleUpgrade?.upgraded) {
        try { await refreshToken(); } catch { /* ignore */ }
      }
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['student-booking'] });
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
      message.success('Rental booked!');
      setStep(2);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Booking failed');
    },
    onSettled: () => setSubmitting(false),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const executeBooking = useCallback((bookingDate, bookingStartHour) => {
    if (!studentId || !serviceId) return;
    const price = normalizeNumeric(servicePrice, 0);
    const dur = normalizeNumeric(durationHours, 1);

    setSubmitting(true);
    bookingMutation.mutate({
      student_user_id: studentId,
      instructor_user_id: null, // Rentals don't need an instructor
      service_id: serviceId,
      date: bookingDate,
      start_hour: bookingStartHour,
      duration: dur,
      status: 'pending',
      notes: `Equipment rental: ${serviceName || 'Rental'}`,
      use_package: false,
      amount: price,
      final_amount: price,
      base_amount: price,
      discount_percent: 0,
      discount_amount: 0,
      payment_method: paymentMethod === 'wallet' ? 'wallet' : 'pay_later',
    });
  }, [studentId, serviceId, servicePrice, durationHours, serviceName, paymentMethod, bookingMutation]);

  const handleConfirmPayment = useCallback(() => {
    if (!studentId || !serviceId) return;
    Modal.confirm({
      title: 'Confirm Rental',
      icon: <ToolOutlined style={{ color: '#f97316' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{serviceName || 'Equipment Rental'}</strong></p>
          {durationHours > 0 && <p style={{ color: '#555' }}>Duration: {formatDurationLabel(durationHours)}</p>}
          <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{formatCurrency(displayPrice, priceCurrency)}</p>
          <p style={{ color: '#888' }}>Payment: {paymentMethod === 'wallet' ? 'Wallet' : 'Pay at Center'}</p>
        </div>
      ),
      okText: 'Confirm & Pay',
      cancelText: 'Go Back',
      centered: true,
      onOk: () => {
        // Move to schedule step - booking will be created when they schedule or skip
        setStep(1);
      },
    });
  }, [studentId, serviceId, serviceName, durationHours, displayPrice, priceCurrency, formatCurrency, paymentMethod]);

  const handleBookRental = useCallback(() => {
    if (!selectedDateString || !selectedTime) return;
    const [h, m] = selectedTime.split(':').map(Number);
    const startHour = h + (m || 0) / 60;

    Modal.confirm({
      title: 'Confirm Rental Schedule',
      icon: <CalendarOutlined style={{ color: '#f97316' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{serviceName || 'Equipment Rental'}</strong></p>
          <p style={{ color: '#555' }}>Date: {dayjs(selectedDateString).format('ddd, MMM D, YYYY')}</p>
          <p style={{ color: '#555' }}>Pickup: {selectedTime}</p>
          {durationHours > 0 && <p style={{ color: '#555' }}>Duration: {formatDurationLabel(durationHours)}</p>}
          <p style={{ fontSize: 16, fontWeight: 700, margin: '8px 0' }}>{formatCurrency(displayPrice, priceCurrency)}</p>
        </div>
      ),
      okText: 'Confirm Rental',
      cancelText: 'Go Back',
      centered: true,
      onOk: () => executeBooking(selectedDateString, startHour),
    });
  }, [selectedDateString, selectedTime, serviceName, durationHours, displayPrice, priceCurrency, formatCurrency, executeBooking]);

  const handleSkipSchedule = useCallback(() => {
    // Create the booking with today's date and noon as default
    const today = dayjs().format('YYYY-MM-DD');
    setSkipSchedule(true);
    executeBooking(today, 12);
  }, [executeBooking]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  // ── Step titles & progress ────────────────────────────────────────────────
  const stepTitles = ['Review & Pay', 'Schedule Pickup', 'Complete'];
  const visibleSteps = [
    { title: 'Review & Pay', idx: 0 },
    { title: 'Schedule Pickup', idx: 1 },
    { title: 'Complete', idx: 2 },
  ];

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
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shrink-0 shadow-sm shadow-orange-500/20">
            <ToolOutlined className="text-white text-sm sm:text-base" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
              {stepTitles[step] || 'Rent Equipment'}
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
                      ? 'bg-orange-500 w-6 sm:w-8'
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
          serviceName={serviceName || 'Equipment Rental'}
          durationHours={durationHours}
          description={serviceDescription}
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
          submitting={submitting}
          onConfirm={handleConfirmPayment}
          canPayLater={canPayLater}
        />
      )}
      {step === 1 && (
        <ScheduleStep
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          selectedTime={selectedTime}
          setSelectedTime={setSelectedTime}
          bookingPending={bookingMutation.isPending}
          onBookRental={handleBookRental}
          onSkip={handleSkipSchedule}
        />
      )}
      {step === 2 && (
        <DoneStep
          serviceName={serviceName || 'Equipment Rental'}
          paymentMethod={paymentMethod}
          skipSchedule={skipSchedule}
          selectedDateString={selectedDateString}
          selectedTime={selectedTime}
          durationHours={durationHours}
          displayPrice={displayPrice}
          formatCurrency={formatCurrency}
          priceCurrency={priceCurrency}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
};

RentalBookingModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  serviceId: PropTypes.string,         // rental service UUID
  serviceName: PropTypes.string,       // e.g. "Full Equipment Rental Service"
  servicePrice: PropTypes.number,      // price in base currency
  serviceCurrency: PropTypes.string,   // e.g. "EUR"
  durationHours: PropTypes.number,     // rental duration in hours
  serviceDescription: PropTypes.string, // optional description
};

export default RentalBookingModal;
