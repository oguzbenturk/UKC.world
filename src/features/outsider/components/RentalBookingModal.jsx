/**
 * RentalBookingModal
 *
 * 3-step flow for booking rental equipment:
 *
 * Step 0 – SELECT DATES: pick rental date range + see live price (daily_rate × days)
 * Step 1 – REVIEW & PAY: summary + payment method selection + confirm
 * Step 2 – DONE: confirmation with rental dates
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
  Tag,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleFilled,
  CheckOutlined,
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
import { IyzicoCheckout } from '@/features/finances';

const { RangePicker } = DatePicker;

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalizeNumeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ── Sub-components ───────────────────────────────────────────────────────────

const DateStep = ({
  serviceName,
  description,
  dailyPrice,
  priceCurrency,
  formatCurrency,
  dateRange,
  setDateRange,
  numberOfDays,
  totalPrice,
  onContinue,
}) => (
  <div className="space-y-4 sm:space-y-5">
    {/* Rental summary card */}
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-orange-50/30 p-4 sm:p-5">
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-orange-500/[0.04]" />
      <div className="relative">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{serviceName}</h3>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Tag color="orange" className="!text-[10px] sm:!text-xs !m-0 !leading-tight">Rental</Tag>
          <Tag className="!text-[10px] sm:!text-xs !m-0 !leading-tight">
            {formatCurrency(dailyPrice, priceCurrency)} / day
          </Tag>
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-slate-500 mt-2 line-clamp-2">{description}</p>
        )}
      </div>
    </div>

    {/* Date range picker */}
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        <CalendarOutlined className="mr-1" /> Select Rental Dates
      </p>
      <RangePicker
        className="w-full"
        size="large"
        value={dateRange}
        onChange={setDateRange}
        disabledDate={(current) => current && current.isBefore(dayjs(), 'day')}
        format="ddd, MMM D"
        inputReadOnly
        placeholder={['Start date', 'End date']}
      />
    </div>

    {/* Price breakdown — shows when dates selected */}
    {numberOfDays > 0 && (
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
        <div className="flex justify-between items-center text-xs sm:text-sm text-slate-500 mb-2">
          <span>Daily rate</span>
          <span>{formatCurrency(dailyPrice, priceCurrency)}</span>
        </div>
        <div className="flex justify-between items-center text-xs sm:text-sm text-slate-500 mb-3">
          <span>Duration</span>
          <span>{numberOfDays} day{numberOfDays !== 1 ? 's' : ''}</span>
        </div>
        <div className="border-t border-slate-200/60 pt-3 flex justify-between items-end">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Total</span>
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
            {formatCurrency(totalPrice, priceCurrency)}
          </span>
        </div>
      </div>
    )}

    <Button
      type="primary"
      size="large"
      block
      disabled={numberOfDays === 0}
      onClick={onContinue}
      className="!h-12 sm:!h-14 !rounded-xl !text-sm sm:!text-base !font-bold"
      icon={<CalendarOutlined />}
    >
      {numberOfDays > 0
        ? `Continue — ${numberOfDays} day${numberOfDays !== 1 ? 's' : ''}`
        : 'Select dates to continue'}
    </Button>
  </div>
);

// eslint-disable-next-line complexity
const PayStep = ({
  serviceName,
  numberOfDays,
  dailyPrice,
  totalPrice,
  priceCurrency,
  formatCurrency,
  startDateLabel,
  endDateLabel,
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
    {/* Booking summary */}
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-orange-50/30 p-4 sm:p-5">
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-orange-500/[0.04]" />
      <div className="relative">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{serviceName}</h3>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Tag color="orange" className="!text-[10px] sm:!text-xs !m-0 !leading-tight">Rental</Tag>
          <Tag className="!text-[10px] sm:!text-xs !m-0 !leading-tight">
            {numberOfDays} day{numberOfDays !== 1 ? 's' : ''}
          </Tag>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 mt-2">
          <CalendarOutlined className="mr-1" />
          {startDateLabel} → {endDateLabel}
        </p>
        <div className="mt-3 pt-3 border-t border-slate-200/60">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>{formatCurrency(dailyPrice, priceCurrency)} × {numberOfDays} day{numberOfDays !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Total</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
              {formatCurrency(totalPrice, priceCurrency)}
            </span>
          </div>
        </div>
      </div>
    </div>

    {/* Payment method */}
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Payment Method
      </p>
      <div className={`grid gap-2 ${canPayLater ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
        <button
          type="button"
          onClick={() => setPaymentMethod('credit_card')}
          className={`relative flex flex-col items-center gap-1 sm:gap-1.5 p-3 sm:p-4 rounded-xl border-2 transition-all text-center ${
            paymentMethod === 'credit_card'
              ? 'border-emerald-500 bg-emerald-50 shadow-sm shadow-emerald-500/10'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          {paymentMethod === 'credit_card' && (
            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckOutlined className="text-white text-[8px]" />
            </div>
          )}
          <CreditCardOutlined className={`text-lg sm:text-xl ${paymentMethod === 'credit_card' ? 'text-emerald-500' : 'text-slate-400'}`} />
          <span className={`text-xs sm:text-sm font-semibold ${paymentMethod === 'credit_card' ? 'text-emerald-700' : 'text-slate-600'}`}>Credit Card</span>
          <span className={`text-[10px] sm:text-xs ${paymentMethod === 'credit_card' ? 'text-emerald-500' : 'text-slate-400'}`}>
            Iyzico
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
          description="Switch to Credit Card or top up your wallet first."
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
        ? `Pay ${formatCurrency(totalPrice, priceCurrency)}`
        : paymentMethod === 'credit_card'
          ? `Pay ${formatCurrency(totalPrice, priceCurrency)} with Card`
          : 'Confirm — Pay Later'}
    </Button>
  </div>
);

const DoneStep = ({
  serviceName,
  paymentMethod,
  startDateLabel,
  endDateLabel,
  numberOfDays,
  totalPrice,
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
        Your rental is booked! Check your dashboard for details.
      </p>
    </div>

    <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-3 sm:p-4 text-left space-y-2.5">
      <div className="flex justify-between items-center text-xs sm:text-sm">
        <span className="text-slate-500">Equipment</span>
        <span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{serviceName}</span>
      </div>
      <div className="flex justify-between items-center text-xs sm:text-sm">
        <span className="text-slate-500">Dates</span>
        <span className="font-semibold text-slate-800">
          {startDateLabel} → {endDateLabel}
        </span>
      </div>
      <div className="flex justify-between items-center text-xs sm:text-sm">
        <span className="text-slate-500">Duration</span>
        <span className="font-semibold text-slate-800">{numberOfDays} day{numberOfDays !== 1 ? 's' : ''}</span>
      </div>
      {totalPrice > 0 && (
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-slate-500">Total</span>
          <span className="font-semibold text-slate-800">{formatCurrency(totalPrice, priceCurrency)}</span>
        </div>
      )}
      <div className="flex justify-between items-center text-xs sm:text-sm">
        <span className="text-slate-500">Payment</span>
        <Tag color={paymentMethod === 'wallet' ? 'green' : paymentMethod === 'credit_card' ? 'cyan' : 'orange'} className="!m-0 !text-[10px] sm:!text-xs">
          {paymentMethod === 'wallet' ? 'Paid' : paymentMethod === 'credit_card' ? 'Card Paid' : 'Pay Later'}
        </Tag>
      </div>
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

  const [dateRange, setDateRange] = useState(null);
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [iyzicoDepositId, setIyzicoDepositId] = useState(null);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);

  const studentId = user?.userId || user?.id;
  const canPayLater = PAY_AT_CENTER_ALLOWED_ROLES.includes(user?.role);

  // ── Date range → day count ────────────────────────────────────────────────
  const startDate = dateRange?.[0] || null;
  const endDate = dateRange?.[1] || null;
  const numberOfDays = (startDate && endDate) ? endDate.diff(startDate, 'day') + 1 : 0;
  const startDateLabel = startDate ? startDate.format('MMM D') : '';
  const endDateLabel = endDate ? endDate.format('MMM D') : '';

  // ── Price resolution ──────────────────────────────────────────────────────
  const dailyPrice = useMemo(() => {
    const basePrice = normalizeNumeric(servicePrice, 0);
    const baseCurrency = serviceCurrency || 'EUR';
    if (convertCurrency && userCurrency && userCurrency !== baseCurrency) {
      return convertCurrency(basePrice, baseCurrency, userCurrency);
    }
    return basePrice;
  }, [servicePrice, serviceCurrency, userCurrency, convertCurrency]);

  const totalPrice = dailyPrice * numberOfDays;
  const priceCurrency = userCurrency || serviceCurrency || 'EUR';

  // ── Wallet ────────────────────────────────────────────────────────────────
  const { data: walletSummary } = useWalletSummary({
    userId: studentId,
    enabled: open && !!studentId,
  });
  const walletBalance = normalizeNumeric(walletSummary?.available, 0);
  const walletCurrency = walletSummary?.currency || 'EUR';
  const walletInsufficient = paymentMethod === 'wallet' && totalPrice > walletBalance;

  // ── Reset state when modal opens ──────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep(0);
      setPaymentMethod('wallet');
      setSubmitting(false);
      setDateRange(null);
      setIyzicoPaymentUrl(null);
      setIyzicoDepositId(null);
      setShowIyzicoModal(false);
    }
  }, [open]);

  // ── Rental creation mutation (POST /rentals) ──────────────────────────────
  const rentalMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/rentals', payload),
    onSuccess: async (res) => {
      // For credit card payments, show the Iyzico payment modal
      if (res.data?.paymentPageUrl) {
        setIyzicoPaymentUrl(res.data.paymentPageUrl);
        setIyzicoDepositId(res.data.depositId || null);
        setShowIyzicoModal(true);
        setSubmitting(false);
        return;
      }

      if (res.data?.roleUpgrade?.upgraded) {
        try { await refreshToken(); } catch { /* ignore */ }
      }
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
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

  const handleContinueToPayment = useCallback(() => {
    if (numberOfDays === 0) return;
    setStep(1);
  }, [numberOfDays]);

  const handleConfirmPayment = useCallback(() => {
    if (!studentId || !serviceId || numberOfDays === 0) return;
    const price = normalizeNumeric(servicePrice, 0) * numberOfDays;
    const startStr = startDate.format('YYYY-MM-DD');
    const endStr = endDate.format('YYYY-MM-DD');

    Modal.confirm({
      title: 'Confirm Rental',
      icon: <ToolOutlined style={{ color: '#f97316' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{serviceName || 'Equipment Rental'}</strong></p>
          <p style={{ color: '#555' }}>{startDate.format('ddd, MMM D')} → {endDate.format('ddd, MMM D')} ({numberOfDays} day{numberOfDays !== 1 ? 's' : ''})</p>
          <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{formatCurrency(totalPrice, priceCurrency)}</p>
          <p style={{ color: '#888' }}>Payment: {paymentMethod === 'wallet' ? 'Wallet' : paymentMethod === 'credit_card' ? 'Credit Card' : 'Pay at Center'}</p>
        </div>
      ),
      okText: 'Confirm & Pay',
      cancelText: 'Go Back',
      centered: true,
      onOk: () => {
        setSubmitting(true);
        rentalMutation.mutate({
          user_id: studentId,
          equipment_ids: [serviceId],
          rental_date: startStr,
          start_date: startStr,
          end_date: endStr,
          rental_days: numberOfDays,
          total_price: price,
          payment_status: paymentMethod === 'pay_later' ? 'unpaid' : 'unpaid',
          notes: `Equipment rental: ${serviceName || 'Rental'} (${numberOfDays} day${numberOfDays !== 1 ? 's' : ''})`,
          currency: serviceCurrency || 'EUR',
          payment_method: paymentMethod,
        });
      },
    });
  }, [studentId, serviceId, numberOfDays, servicePrice, startDate, endDate, serviceName, totalPrice, priceCurrency, formatCurrency, paymentMethod, rentalMutation, serviceCurrency]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  // ── Step titles & progress ────────────────────────────────────────────────
  const stepTitles = ['Select Dates', 'Review & Pay', 'Complete'];
  const visibleSteps = [
    { title: 'Select Dates', idx: 0 },
    { title: 'Review & Pay', idx: 1 },
    { title: 'Complete', idx: 2 },
  ];

  return (
    <>
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
              Step {step + 1} of {visibleSteps.length}
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
        <DateStep
          serviceName={serviceName || 'Equipment Rental'}
          description={serviceDescription}
          dailyPrice={dailyPrice}
          priceCurrency={priceCurrency}
          formatCurrency={formatCurrency}
          dateRange={dateRange}
          setDateRange={setDateRange}
          numberOfDays={numberOfDays}
          totalPrice={totalPrice}
          onContinue={handleContinueToPayment}
        />
      )}
      {step === 1 && (
        <PayStep
          serviceName={serviceName || 'Equipment Rental'}
          numberOfDays={numberOfDays}
          dailyPrice={dailyPrice}
          totalPrice={totalPrice}
          priceCurrency={priceCurrency}
          formatCurrency={formatCurrency}
          startDateLabel={startDateLabel}
          endDateLabel={endDateLabel}
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
      {step === 2 && (
        <DoneStep
          serviceName={serviceName || 'Equipment Rental'}
          paymentMethod={paymentMethod}
          startDateLabel={startDateLabel}
          endDateLabel={endDateLabel}
          numberOfDays={numberOfDays}
          totalPrice={totalPrice}
          formatCurrency={formatCurrency}
          priceCurrency={priceCurrency}
          onClose={handleClose}
        />
      )}
    </Modal>

    {/* Iyzico Credit Card Payment Modal */}
    <IyzicoCheckout
      visible={showIyzicoModal}
      paymentPageUrl={iyzicoPaymentUrl}
      depositId={iyzicoDepositId}
      onSuccess={() => {
        setShowIyzicoModal(false);
        setIyzicoPaymentUrl(null);
        setIyzicoDepositId(null);
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        queryClient.invalidateQueries({ queryKey: ['rentals'] });
        queryClient.invalidateQueries({ queryKey: ['student-booking'] });
        queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
        message.success('Payment confirmed! Rental booked.');
        setStep(2);
      }}
      onClose={() => {
        setShowIyzicoModal(false);
        setIyzicoPaymentUrl(null);
        setIyzicoDepositId(null);
      }}
      onError={(msg) => {
        setShowIyzicoModal(false);
        setIyzicoPaymentUrl(null);
        setIyzicoDepositId(null);
        message.error(msg || 'Payment failed');
      }}
    />
    </>
  );
};

RentalBookingModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  serviceId: PropTypes.string,
  serviceName: PropTypes.string,
  servicePrice: PropTypes.number,
  serviceCurrency: PropTypes.string,
  durationHours: PropTypes.number,
  serviceDescription: PropTypes.string,
};

export default RentalBookingModal;
