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
  Modal,
  Tag,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleFilled,
  CheckOutlined,
  CreditCardOutlined,
  LeftOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  ShoppingOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';
import { IyzicoCheckout } from '@/features/finances';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalizeNumeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const buildCalendarCells = (monthStart) => {
  const start = monthStart.startOf('month');
  const daysInMonth = start.daysInMonth();
  // dayjs: 0=Sun, 1=Mon … convert to Mon-first (Mon=0, Sun=6)
  const rawDay = start.day();
  const firstOffset = rawDay === 0 ? 6 : rawDay - 1;
  const cells = Array(firstOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(start.date(d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

// ── Sub-components ───────────────────────────────────────────────────────────

const DateStep = ({
  serviceName,
  description,
  dailyPrice,
  priceCurrency,
  formatCurrency,
  selectedDays,
  toggleDay,
  onClearDays,
  numberOfDays,
  maxDays,
  totalPrice,
  onContinue,
  isPackage,
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => dayjs().startOf('month'));
  const today = dayjs().startOf('day');
  const cells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);
  const atMax = maxDays !== null && numberOfDays >= maxDays;

  const selectWeekdays = () => {
    // Add all non-past weekdays (Mon–Fri) in the currently visible month, up to cap
    const start = currentMonth.startOf('month');
    const end = currentMonth.endOf('month');
    for (let d = start; !d.isAfter(end); d = d.add(1, 'day')) {
      const dow = d.day(); // 0=Sun, 6=Sat
      if (dow !== 0 && dow !== 6 && !d.isBefore(today)) {
        toggleDay(d.format('YYYY-MM-DD'));
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Rental summary card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-orange-50/30 p-4 sm:p-5">
        <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-orange-500/[0.04]" />
        <div className="relative">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{serviceName}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Tag color="orange" className="!text-[10px] sm:!text-xs !m-0 !leading-tight">{isPackage ? 'Package' : 'Rental'}</Tag>
            {!isPackage && (
              <Tag className="!text-[10px] sm:!text-xs !m-0 !leading-tight">
                {formatCurrency(dailyPrice, priceCurrency)} / day
              </Tag>
            )}
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-slate-500 mt-2 line-clamp-2">{description}</p>
          )}
        </div>
      </div>

      {/* Calendar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setCurrentMonth(m => m.subtract(1, 'month'))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <LeftOutlined className="text-xs" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">
              {currentMonth.format('MMMM YYYY')}
            </span>
            <button
              type="button"
              onClick={selectWeekdays}
              className="text-[10px] font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-md px-1.5 py-0.5 transition-colors"
            >
              Weekdays
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCurrentMonth(m => m.add(1, 'month'))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <RightOutlined className="text-xs" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAY_LABELS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="aspect-square" />;
            const dayStr = day.format('YYYY-MM-DD');
            const isPast = day.isBefore(today);
            const isSelected = selectedDays.has(dayStr);
            const isToday = day.isSame(today);
            const isWeekend = day.day() === 0 || day.day() === 6;
            const isDisabled = isPast || (atMax && !isSelected);

            return (
              <div key={dayStr} className="aspect-square p-0.5">
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => toggleDay(dayStr)}
                  className={[
                    'w-full h-full rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center justify-center',
                    isPast
                      ? 'text-slate-300 cursor-not-allowed'
                      : isSelected
                        ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20 scale-95'
                        : atMax
                          ? 'text-slate-300 cursor-not-allowed'
                          : isToday
                            ? 'ring-2 ring-orange-400 ring-offset-1 text-orange-600 font-bold hover:bg-orange-50'
                            : isWeekend
                              ? 'text-slate-400 hover:bg-slate-100'
                              : 'text-slate-700 hover:bg-orange-50 hover:text-orange-600',
                  ].join(' ')}
                >
                  {day.date()}
                </button>
              </div>
            );
          })}
        </div>

        {/* Selection counter */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {maxDays ? (
            <>
              <div className="flex gap-0.5">
                {Array.from({ length: maxDays }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1 w-4 rounded-full transition-all ${
                      idx < numberOfDays ? 'bg-orange-500' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <span className={`text-[10px] font-semibold ${atMax ? 'text-orange-600' : 'text-slate-400'}`}>
                {numberOfDays}/{maxDays} days
              </span>
            </>
          ) : (
            <p className="text-[10px] text-slate-400">
              {numberOfDays === 0
                ? 'Tap days to select — tap again to deselect'
                : `${numberOfDays} day${numberOfDays !== 1 ? 's' : ''} selected`}
            </p>
          )}
        </div>
      </div>

      {/* Price breakdown — shows when dates selected */}
      {numberOfDays > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
          {isPackage ? (
            <div className="flex justify-between items-center text-xs sm:text-sm text-slate-500 mb-3">
              <span>Package price ({maxDays} days)</span>
              <span className="font-semibold text-slate-700">{formatCurrency(totalPrice, priceCurrency)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center text-xs sm:text-sm text-slate-500 mb-2">
                <span>Daily rate</span>
                <span>{formatCurrency(dailyPrice, priceCurrency)}</span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm text-slate-500 mb-3">
                <span>Duration</span>
                <span>{numberOfDays} day{numberOfDays !== 1 ? 's' : ''}</span>
              </div>
            </>
          )}
          <div className="border-t border-slate-200/60 pt-3 flex justify-between items-end">
            <button
              type="button"
              onClick={onClearDays}
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
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
};

// eslint-disable-next-line complexity
const PayStep = ({
  serviceName,
  numberOfDays,
  dailyPrice,
  totalPrice,
  finalTotal,
  insuranceRate,
  insuranceAccepted,
  onInsuranceToggle,
  insuranceAmount,
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
  appliedVoucher,
  onVoucherApplied,
  onVoucherRemoved,
  serviceId,
  isPackage,
  maxDays,
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
          {isPackage ? (
            <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
              <span>Package — {maxDays} days</span>
            </div>
          ) : (
            <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
              <span>{formatCurrency(dailyPrice, priceCurrency)} × {numberOfDays} day{numberOfDays !== 1 ? 's' : ''}</span>
            </div>
          )}
          {insuranceAccepted && insuranceAmount > 0 && (
            <div className="flex justify-between items-center text-xs text-slate-500 mt-1">
              <span>Insurance ({insuranceRate}%)</span>
              <span className="text-emerald-600">+{formatCurrency(insuranceAmount, priceCurrency)}</span>
            </div>
          )}
          <div className="flex items-end justify-between mt-1">
            <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Total</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
              {formatCurrency(finalTotal, priceCurrency)}
            </span>
          </div>
        </div>
      </div>
    </div>

    {/* Insurance */}
    {insuranceRate != null && insuranceRate > 0 && (
      <div>
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Equipment Insurance
        </p>
        <button
          type="button"
          onClick={onInsuranceToggle}
          className={`w-full flex items-center gap-3 p-3 sm:p-4 rounded-xl border-2 transition-all text-left ${
            insuranceAccepted
              ? 'border-emerald-500 bg-emerald-50 shadow-sm shadow-emerald-500/10'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            insuranceAccepted ? 'bg-emerald-500' : 'bg-slate-100'
          }`}>
            <SafetyCertificateOutlined className={`text-base ${insuranceAccepted ? 'text-white' : 'text-slate-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs sm:text-sm font-semibold leading-tight ${insuranceAccepted ? 'text-emerald-700' : 'text-slate-700'}`}>
              Add equipment insurance
            </p>
            <p className={`text-[10px] sm:text-xs mt-0.5 ${insuranceAccepted ? 'text-emerald-500' : 'text-slate-400'}`}>
              {insuranceRate}% of rental cost — {formatCurrency(insuranceAmount, priceCurrency)} added to your total
            </p>
          </div>
          <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            insuranceAccepted ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'
          }`}>
            {insuranceAccepted && <CheckOutlined className="text-white text-[10px]" />}
          </div>
        </button>
      </div>
    )}

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

    {/* Promo Code */}
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Promo Code
      </p>
      <PromoCodeInput
        context="rentals"
        amount={totalPrice}
        currency={priceCurrency}
        serviceId={serviceId}
        appliedVoucher={appliedVoucher}
        onValidCode={onVoucherApplied}
        onClear={onVoucherRemoved}
        disabled={submitting}
        variant="light"
      />
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
        ? `Pay ${formatCurrency(finalTotal, priceCurrency)}`
        : paymentMethod === 'credit_card'
          ? `Pay ${formatCurrency(finalTotal, priceCurrency)} with Card`
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
  isPackage = false,
  packageId,
  packageName,
  insuranceRate = null,
}) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user, refreshToken } = useAuth();
  const { formatCurrency, userCurrency, convertCurrency } = useCurrency();

  // ── Local state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [submitting, setSubmitting] = useState(false);

  const [selectedDays, setSelectedDays] = useState(() => new Set());
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [iyzicoDepositId, setIyzicoDepositId] = useState(null);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [insuranceAccepted, setInsuranceAccepted] = useState(false);

  const studentId = user?.userId || user?.id;
  const canPayLater = PAY_AT_CENTER_ALLOWED_ROLES.includes(user?.role);

  // ── Selected days → derived values ───────────────────────────────────────
  const numberOfDays = selectedDays.size;
  const sortedDays = useMemo(() => Array.from(selectedDays).sort(), [selectedDays]);
  const startDate = sortedDays.length > 0 ? dayjs(sortedDays[0]) : null;
  const endDate = sortedDays.length > 0 ? dayjs(sortedDays[sortedDays.length - 1]) : null;
  const startDateLabel = startDate ? startDate.format('MMM D') : '';
  const endDateLabel = endDate ? endDate.format('MMM D') : '';

  // Max selectable days derived from service duration (e.g. 168h → 7 days)
  const maxDays = durationHours >= 24 ? Math.round(durationHours / 24) : null;

  const toggleDay = useCallback((dayStr) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayStr)) {
        next.delete(dayStr);
      } else if (!maxDays || next.size < maxDays) {
        next.add(dayStr);
      }
      return next;
    });
  }, [maxDays]);

  const clearDays = useCallback(() => setSelectedDays(new Set()), []);

  // ── Price resolution ──────────────────────────────────────────────────────
  const packageTotalDays = isPackage && maxDays ? maxDays : null;

  const dailyPrice = useMemo(() => {
    const basePrice = normalizeNumeric(servicePrice, 0);
    const baseCurrency = serviceCurrency || 'EUR';
    const converted = (convertCurrency && userCurrency && userCurrency !== baseCurrency)
      ? convertCurrency(basePrice, baseCurrency, userCurrency)
      : basePrice;
    // For packages the stored price is the total; derive per-day for display
    if (isPackage && packageTotalDays > 0) return converted / packageTotalDays;
    return converted;
  }, [servicePrice, serviceCurrency, userCurrency, convertCurrency, isPackage, packageTotalDays]);

  // For packages: total is always the fixed package price regardless of days selected
  const packageTotalPrice = useMemo(() => {
    if (!isPackage) return null;
    const basePrice = normalizeNumeric(servicePrice, 0);
    if (convertCurrency && userCurrency && userCurrency !== (serviceCurrency || 'EUR')) {
      return convertCurrency(basePrice, serviceCurrency || 'EUR', userCurrency);
    }
    return basePrice;
  }, [isPackage, servicePrice, serviceCurrency, userCurrency, convertCurrency]);

  const totalPrice = isPackage ? (packageTotalPrice ?? 0) : dailyPrice * numberOfDays;
  const priceCurrency = userCurrency || serviceCurrency || 'EUR';

  // ── Insurance ─────────────────────────────────────────────────────────────
  const effectiveInsuranceRate = insuranceRate != null && insuranceRate > 0 ? insuranceRate : null;
  const insuranceAmount = effectiveInsuranceRate && totalPrice > 0
    ? parseFloat((totalPrice * effectiveInsuranceRate / 100).toFixed(2))
    : 0;
  const finalTotal = totalPrice + (insuranceAccepted ? insuranceAmount : 0);

  // ── Wallet ────────────────────────────────────────────────────────────────
  const { data: walletSummary } = useWalletSummary({
    currency: userCurrency,
    enabled: open && !!studentId,
  });
  // Aggregate ALL wallet currency rows (EUR + TRY etc.) into a single display amount
  const walletBalance = useMemo(() => {
    const allBalances = walletSummary?.balances;
    if (Array.isArray(allBalances) && allBalances.length > 0) {
      return allBalances.reduce((sum, row) => {
        const amt = Number(row.available) || 0;
        if (amt === 0) return sum;
        if (row.currency === userCurrency || !convertCurrency) return sum + amt;
        return sum + convertCurrency(amt, row.currency, userCurrency);
      }, 0);
    }
    return normalizeNumeric(walletSummary?.available, 0);
  }, [walletSummary, convertCurrency, userCurrency]);
  const walletCurrency = userCurrency || 'EUR';
  const walletInsufficient = paymentMethod === 'wallet' && finalTotal > walletBalance;

  // ── Reset state when modal opens ──────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep(0);
      setPaymentMethod('wallet');
      setSubmitting(false);
      setSelectedDays(new Set());
      setIyzicoPaymentUrl(null);
      setIyzicoDepositId(null);
      setShowIyzicoModal(false);
      setAppliedVoucher(null);
      setInsuranceAccepted(false);
    }
  }, [open]);

  // ── Rental creation is handled inline in handleConfirmPayment ───────────

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleContinueToPayment = useCallback(() => {
    if (numberOfDays === 0) return;
    setStep(1);
  }, [numberOfDays]);

  const handleConfirmPayment = useCallback(() => {
    if (!studentId || !serviceId || numberOfDays === 0) return;
    const rawTotal = normalizeNumeric(servicePrice, 0);
    // For packages: split the fixed total evenly across the booked days
    const unitPrice = isPackage && numberOfDays > 0
      ? parseFloat((rawTotal / numberOfDays).toFixed(2))
      : rawTotal;

    Modal.confirm({
      title: 'Confirm Rental',
      icon: <ToolOutlined style={{ color: '#f97316' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{isPackage ? (packageName || serviceName || 'Rental Package') : (serviceName || 'Equipment Rental')}</strong></p>
          <p style={{ color: '#555' }}>{startDate.format('ddd, MMM D')} → {endDate.format('ddd, MMM D')} ({numberOfDays} day{numberOfDays !== 1 ? 's' : ''})</p>
          {numberOfDays > 1 && (
            <p style={{ color: '#888', fontSize: 12 }}>{numberOfDays} separate rentals will be created</p>
          )}
          {insuranceAccepted && insuranceAmount > 0 && (
            <p style={{ color: '#059669', fontSize: 12 }}>Insurance ({effectiveInsuranceRate}%): +{formatCurrency(insuranceAmount, priceCurrency)}</p>
          )}
          <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{formatCurrency(finalTotal, priceCurrency)}</p>
          <p style={{ color: '#888' }}>Payment: {paymentMethod === 'wallet' ? 'Wallet' : paymentMethod === 'credit_card' ? 'Credit Card' : 'Pay at Center'}</p>
        </div>
      ),
      okText: 'Confirm & Pay',
      cancelText: 'Go Back',
      centered: true,
      onOk: async () => {
        setSubmitting(true);
        try {
          // Create one rental per selected day so each can be managed individually
          // Split finalTotal (base + optional insurance) evenly across days
          const unitTotal = numberOfDays > 0 ? parseFloat((finalTotal / numberOfDays).toFixed(2)) : unitPrice;
          let lastRes = null;
          for (const dayStr of sortedDays) {
            const day = dayjs(dayStr);
            const res = await apiClient.post('/rentals', {
              user_id: studentId,
              equipment_ids: [serviceId],
              rental_date: dayStr,
              start_date: dayStr,
              end_date: dayStr,
              rental_days: 1,
              total_price: unitTotal,
              payment_status: 'unpaid',
              notes: `Equipment rental: ${isPackage ? (packageName || serviceName || 'Package') : (serviceName || 'Rental')} — ${day.format('ddd, MMM D')}${insuranceAccepted ? ' (incl. insurance)' : ''}`,
              currency: serviceCurrency || 'EUR',
              payment_method: paymentMethod,
              ...(isPackage && packageId ? { customer_package_id: packageId } : {}),
              ...(appliedVoucher?.id ? { voucher_id: appliedVoucher.id } : {}),
              ...(insuranceAccepted && insuranceAmount > 0 ? {
                insurance_rate: effectiveInsuranceRate,
                insurance_amount: parseFloat((insuranceAmount / numberOfDays).toFixed(2)),
              } : {}),
            });
            lastRes = res;
          }
          // Handle credit card flow (only first response will have the URL)
          if (lastRes?.data?.paymentPageUrl) {
            setIyzicoPaymentUrl(lastRes.data.paymentPageUrl);
            setIyzicoDepositId(lastRes.data.depositId || null);
            setShowIyzicoModal(true);
            setSubmitting(false);
            return;
          }
          if (lastRes?.data?.roleUpgrade?.upgraded) {
            try { await refreshToken(); } catch { /* ignore */ }
          }
          queryClient.invalidateQueries({ queryKey: ['wallet'] });
          queryClient.invalidateQueries({ queryKey: ['rentals'] });
          queryClient.invalidateQueries({ queryKey: ['student-booking'] });
          queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
          message.success(`${numberOfDays} rental${numberOfDays !== 1 ? 's' : ''} booked!`);
          setStep(2);
        } catch (err) {
          message.error(err.response?.data?.error || err.message || 'Booking failed');
        } finally {
          setSubmitting(false);
        }
      },
    });
  }, [studentId, serviceId, numberOfDays, sortedDays, servicePrice, startDate, endDate, serviceName, packageName, totalPrice, finalTotal, insuranceAccepted, insuranceAmount, effectiveInsuranceRate, priceCurrency, formatCurrency, paymentMethod, serviceCurrency, isPackage, packageId, appliedVoucher, message, queryClient, refreshToken]);

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
          selectedDays={selectedDays}
          toggleDay={toggleDay}
          onClearDays={clearDays}
          numberOfDays={numberOfDays}
          maxDays={maxDays}
          totalPrice={totalPrice}
          onContinue={handleContinueToPayment}
          isPackage={isPackage}
        />
      )}
      {step === 1 && (
        <PayStep
          serviceName={serviceName || 'Equipment Rental'}
          numberOfDays={numberOfDays}
          dailyPrice={dailyPrice}
          totalPrice={totalPrice}
          finalTotal={finalTotal}
          insuranceRate={effectiveInsuranceRate}
          insuranceAccepted={insuranceAccepted}
          onInsuranceToggle={() => setInsuranceAccepted(v => !v)}
          insuranceAmount={insuranceAmount}
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
          appliedVoucher={appliedVoucher}
          onVoucherApplied={(voucherData) => setAppliedVoucher(voucherData)}
          onVoucherRemoved={() => setAppliedVoucher(null)}
          serviceId={serviceId}
          isPackage={isPackage}
          maxDays={maxDays}
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
