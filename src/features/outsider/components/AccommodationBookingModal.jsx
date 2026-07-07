/**
 * AccommodationBookingModal
 *
 * Light booking modal for Stay pages — shares the Duotone-teal design language
 * with StayAccommodationModal (white surfaces, slate neutrals, #00a8c4 accent,
 * font-duotone type, charcoal CTA) so the preview → availability flow reads as
 * one product. Features:
 *  - Custom calendar for check-in / check-out
 *  - Live availability (booked dates disabled)
 *  - Guest count + notes
 *  - Payment method: Wallet or Pay Later (trusted customers only)
 *  - Price estimate (nights × price_per_night)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Spin, Alert, App, Select, Upload, Tag } from 'antd';
import {
  CalendarOutlined,
  TeamOutlined,
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  EditOutlined,
  RocketOutlined,
  InfoCircleOutlined,
  WalletOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  CreditCardOutlined,
  SafetyCertificateOutlined,
  BankOutlined,
  UploadOutlined,
  MinusOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';
import { analyticsService } from '@/shared/services/analyticsService';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';
import apiClient, { resolveApiBaseUrl, getAccessToken } from '@/shared/services/apiClient';
import PromoCodeInput from '@/shared/components/PromoCodeInput';
import { extractUnitMeta, computeAccommodationPrice, resolveNightlyRate } from '@/shared/utils/accommodationPricing';

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function BankDetailsCard({ account }) {
  if (!account) return null;
  const fields = [
    { label: 'Bank', value: account.bankName },
    { label: 'Account Holder', value: account.accountHolder },
    { label: 'IBAN', value: account.iban },
    ...(account.swiftCode ? [{ label: 'SWIFT / BIC', value: account.swiftCode }] : []),
    ...(account.accountNumber ? [{ label: 'Account No.', value: account.accountNumber }] : []),
  ];
  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
        <BankOutlined className="text-xs" style={{ color: '#00a8c4' }} />
        <span className="text-[10px] font-duotone-bold uppercase tracking-wider" style={{ color: '#007a8f' }}>Transfer To</span>
        {account.currency && <Tag className="!m-0 !text-[10px] !font-bold ml-auto !border-slate-200 !bg-white !text-slate-600">{account.currency}</Tag>}
      </div>
      <div className="px-3 py-1 divide-y divide-slate-100">
        {fields.map(({ label, value }) => (
          <div key={label} className="py-2">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-xs text-slate-700 font-mono break-all">{value}</p>
          </div>
        ))}
      </div>
      {account.instructions && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-[10px] text-amber-700 leading-snug">{account.instructions}</p>
        </div>
      )}
    </div>
  );
}

const normalizeNumeric = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// eslint-disable-next-line complexity
const AccommodationBookingModal = ({ open, onClose, unit = {}, onSuccess }) => {
  const { t } = useTranslation(['outsider']);
  const isHotel = (unit?.type || '').toLowerCase() === 'room';
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const { user } = useAuth();
  const { message: msg } = App.useApp();
  const queryClient = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);
  const [guestsCount, setGuestsCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(dayjs().startOf('month'));
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [depositMethod, setDepositMethod] = useState('credit_card');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  const canPayLater = PAY_AT_CENTER_ALLOWED_ROLES.includes(user?.role);
  const studentId = user?.userId || user?.id;

  // Reset when modal opens / unit changes
  useEffect(() => {
    if (open) {
      setCheckIn(null);
      setCheckOut(null);
      setGuestsCount(1);
      setNotes('');
      setCalendarMonth(dayjs().startOf('month'));
      setSelectingCheckOut(false);
      setPaymentMethod('wallet');
      setDepositMethod('bank_transfer');
      setSelectedBankAccountId(null);
      setFileList([]);
      setShowIyzicoModal(false);
      setIyzicoPaymentUrl(null);
      setAppliedVoucher(null);
    }
  }, [open, unit?.id]);

  // ── Wallet ─────────────────────────────────────────────────────────────
  const { data: walletSummary } = useWalletSummary({
    userId: studentId,
    enabled: open && !!studentId,
  });
  const walletBalance = normalizeNumeric(walletSummary?.available, 0);
  const walletCurrency = walletSummary?.currency || 'EUR';

  // ── Fetch unit detail with bookings ────────────────────────────────────
  const { data: unitDetail, isLoading: unitLoading } = useQuery({
    queryKey: ['accommodation-unit-detail', unit?.id],
    queryFn: async () => {
      if (!unit?.id) return null;
      const res = await apiClient.get(`/accommodation/units/${unit.id}`);
      return res.data;
    },
    enabled: open && !!unit?.id,
    staleTime: 30_000,
  });

  // ── Blocked date ranges ────────────────────────────────────────────────
  const bookedRanges = useMemo(() => {
    if (isHotel) return [];
    const bookings = unitDetail?.bookings || unitDetail?.upcoming_bookings || [];
    return bookings
      .filter(b => b.status !== 'cancelled')
      .map(b => ({
        start: dayjs(b.check_in_date).startOf('day'),
        end: dayjs(b.check_out_date).startOf('day'),
      }));
  }, [unitDetail, isHotel]);

  const isDateBooked = useCallback(
    (date) => {
      const d = dayjs(date).startOf('day');
      return bookedRanges.some(r => d.isSameOrAfter(r.start) && d.isBefore(r.end));
    },
    [bookedRanges],
  );

  const rangeOverlaps = useCallback(
    (start, end) => {
      const s = dayjs(start).startOf('day');
      const e = dayjs(end).startOf('day');
      return bookedRanges.some(r => s.isBefore(r.end) && e.isAfter(r.start));
    },
    [bookedRanges],
  );

  // ── Price ──────────────────────────────────────────────────────────────
  const pricePerNight = parseFloat(unit?.price_per_night || unitDetail?.price_per_night || 0);
  const capacity = unit?.capacity || unitDetail?.capacity || 10;
  const nights = checkIn && checkOut ? checkOut.diff(checkIn, 'day') : 0;

  // Extract extended pricing meta from amenities
  const unitMeta = useMemo(
    () => extractUnitMeta({ amenities: unit?.amenities || unitDetail?.amenities || [] }),
    [unit?.amenities, unitDetail?.amenities],
  );

  // Calculate total with weekend / holiday / occupancy / discount pricing
  // (shared engine — matches the server exactly).
  const priceBreakdown = useMemo(
    () => computeAccommodationPrice({ checkIn, checkOut, basePrice: pricePerNight, meta: unitMeta, guests: guestsCount }),
    [checkIn, checkOut, pricePerNight, unitMeta, guestsCount],
  );

  const totalPrice = priceBreakdown.total;
  // Standard nightly rate resolved for the current occupancy (for headline / per-night display).
  const nightlyRate = resolveNightlyRate(unitMeta, pricePerNight, guestsCount);
  // Per-person pricing: nightlyRate is the per-guest rate; the per-night party total is ×guests.
  const isPerPerson = !!priceBreakdown.perPerson;
  const guestMultiplier = priceBreakdown.guestMultiplier || 1;

  const formatPrice = (eurPrice) => {
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return `${eurFormatted} / ${formatCurrency(converted, userCurrency)}`;
  };

  const voucherDisc = appliedVoucher?.discount;
  const effectiveTotalPrice = (voucherDisc && voucherDisc.originalAmount > 0)
    ? Math.max(0, totalPrice * (voucherDisc.finalAmount / voucherDisc.originalAmount))
    : totalPrice;

  const walletInUserCurrency = convertCurrency(walletBalance, walletCurrency, userCurrency);
  const walletInsufficient = paymentMethod === 'wallet' && effectiveTotalPrice > 0 && effectiveTotalPrice > walletBalance;

  const DEPOSIT_PERCENT = 20;
  const depositAmount = parseFloat((effectiveTotalPrice * DEPOSIT_PERCENT / 100).toFixed(2));
  const remainingAmount = parseFloat((effectiveTotalPrice - depositAmount).toFixed(2));
  const isDeposit = paymentMethod === 'deposit';

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['accommodation-booking', 'bank-accounts'],
    queryFn: async () => {
      const res = await apiClient.get('/wallet/bank-accounts');
      return res.data?.results || [];
    },
    enabled: open && !!studentId,
    staleTime: 300_000,
  });
  const selectedAccount = useMemo(() => bankAccounts.find(a => a.id === selectedBankAccountId), [bankAccounts, selectedBankAccountId]);

  const uploadReceipt = (file) => new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('image', file);
    const token = getAccessToken() || localStorage.getItem('token');
    const base = resolveApiBaseUrl();
    const xhr = new XMLHttpRequest();
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) resolve(JSON.parse(xhr.responseText).url);
      else reject(new Error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed'));
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('POST', `${base}/api/upload/wallet-deposit`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });

  // ── Calendar grid ──────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = calendarMonth.startOf('month');
    const startOffset = (firstDay.day() + 6) % 7;
    const startDate = firstDay.subtract(startOffset, 'day');
    const days = [];
    for (let i = 0; i < 42; i++) days.push(startDate.add(i, 'day'));
    return days;
  }, [calendarMonth]);

  const today = dayjs().startOf('day');

  const handleDateClick = (date) => {
    const d = date.startOf('day');
    if (d.isBefore(today)) return;
    if (isDateBooked(d) && !selectingCheckOut) return;

    if (!selectingCheckOut) {
      setCheckIn(d);
      setCheckOut(null);
      setSelectingCheckOut(true);
    } else {
      if (d.isSameOrBefore(checkIn)) {
        setCheckIn(d);
        setCheckOut(null);
        return;
      }
      if (rangeOverlaps(checkIn, d)) {
        msg.warning(t('outsider:accommodationBooking.validation.overlapBooking'));
        return;
      }
      setCheckOut(d);
      setSelectingCheckOut(false);
    }
  };

  // eslint-disable-next-line complexity
  const getDayClass = (date) => {
    const d = date.startOf('day');
    const isPast = d.isBefore(today);
    const isCurrentMonth = d.month() === calendarMonth.month();
    const booked = isDateBooked(d);

    if (isPast) return 'text-slate-300 cursor-not-allowed';
    if (booked) return 'bg-rose-50 text-rose-400 cursor-not-allowed line-through';
    if (checkIn && d.isSame(checkIn, 'day')) return 'bg-[#00a8c4] text-white font-bold rounded-l-lg';
    if (checkOut && d.isSame(checkOut, 'day')) return 'bg-[#00a8c4] text-white font-bold rounded-r-lg';
    if (checkIn && checkOut && d.isAfter(checkIn) && d.isBefore(checkOut)) return 'bg-[#00a8c4]/15 text-[#007a8f]';
    if (selectingCheckOut && checkIn && d.isAfter(checkIn)) {
      return isCurrentMonth
        ? 'text-slate-700 hover:bg-[#00a8c4]/20 cursor-pointer'
        : 'text-slate-300 hover:bg-[#00a8c4]/10 cursor-pointer';
    }
    return isCurrentMonth
      ? 'text-slate-700 hover:bg-slate-100 cursor-pointer'
      : 'text-slate-300 hover:bg-slate-50 cursor-pointer';
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const bookMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiClient.post('/accommodation/bookings', payload);
      return res.data;
    },
    onSuccess: (data) => {
      // Credit card: open Iyzico payment page instead of closing
      if (data?.paymentPageUrl) {
        setIyzicoPaymentUrl(data.paymentPageUrl);
        setShowIyzicoModal(true);
        return;
      }
      analyticsService.track('purchase', { type: 'accommodation', method: paymentMethod });
      msg.success(
        paymentMethod === 'pay_later'
          ? t('outsider:accommodationBooking.toasts.confirmedPayAtCenter')
          : isHotel
            ? t('outsider:accommodationBooking.toasts.hotelRequestSubmitted')
            : t('outsider:accommodationBooking.toasts.stayBooked'),
      );
      queryClient.invalidateQueries({ queryKey: ['accommodation-unit-detail', unit?.id] });
      queryClient.invalidateQueries({ queryKey: ['accommodation'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      onSuccess?.(data);
      onClose();
    },
    onError: (err) => {
      const errMsg = err.response?.data?.error || err.message || 'Failed to submit booking';
      msg.error(errMsg);
    },
  });

  const handleSubmit = async () => {
    if (!checkIn || !checkOut) {
      msg.warning(t('outsider:accommodationBooking.validation.selectDates'));
      return;
    }
    if (nights < 1) {
      msg.warning(t('outsider:accommodationBooking.validation.checkoutAfterCheckin'));
      return;
    }
    if (isDeposit && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0)) {
      msg.error(t('outsider:accommodationBooking.validation.uploadReceipt'));
      return;
    }
    let receiptUrl = null;
    if (isDeposit && depositMethod === 'bank_transfer' && fileList.length > 0) {
      try {
        receiptUrl = await uploadReceipt(fileList[0]);
      } catch (err) {
        msg.error(err.message || 'Failed to upload receipt');
        return;
      }
    }
    bookMutation.mutate({
      unit_id: unit.id,
      check_in_date: checkIn.format('YYYY-MM-DD'),
      check_out_date: checkOut.format('YYYY-MM-DD'),
      guests_count: guestsCount,
      notes: notes || undefined,
      payment_method: isDeposit ? depositMethod : paymentMethod,
      ...(isDeposit ? { deposit_percent: DEPOSIT_PERCENT, deposit_amount: depositAmount } : {}),
      ...(isDeposit && depositMethod === 'bank_transfer' && receiptUrl ? { receipt_url: receiptUrl, bank_account_id: selectedBankAccountId } : {}),
      ...(appliedVoucher?.id ? { voucher_id: appliedVoucher.id } : {}),
    });
  };

  const unitName = unit?.name || unitDetail?.name || 'Accommodation';

  return (
    <>
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={540}
      centered
      destroyOnHidden
      className="accommodation-booking-modal"
      closeIcon={
        <div className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
          <CloseOutlined />
        </div>
      }
      styles={{
        content: {
          backgroundColor: '#ffffff',
          border: '1px solid rgba(15,23,42,0.08)',
          padding: 0,
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(15,23,42,0.25)',
        },
        body: { padding: 0 },
      }}
    >
      {/* ── Header ── */}
      {/* pr-14 keeps the nightly price clear of the modal's close button */}
      <div className="pl-6 pr-14 pt-6 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(0,168,196,0.10)' }}
          >
            <CalendarOutlined className="text-lg" style={{ color: '#00a8c4' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-duotone-bold-extended text-slate-900 m-0 truncate">{unitName}</h3>
            <p className="text-xs text-slate-400 m-0 font-duotone-regular">
              {isHotel ? t('outsider:accommodationBooking.header.requestDates') : t('outsider:accommodationBooking.header.selectAndPay')}
            </p>
          </div>
          {nightlyRate > 0 && (
            <div className="text-right shrink-0">
              <span className="text-lg font-duotone-bold" style={{ color: '#007a8f' }}>{formatPrice(nightlyRate)}</span>
              <span className="text-slate-400 text-xs block font-duotone-regular">
                {t('outsider:accommodationBooking.header.perNight')}{isPerPerson ? ' · per person' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {unitLoading ? (
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      ) : (
        <>
          {/* ── Calendar ── */}
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setCalendarMonth(m => m.subtract(1, 'month'))}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
              >
                <LeftOutlined className="text-xs" />
              </button>
              <span className="text-sm font-duotone-bold-extended text-slate-900 tracking-wide">
                {calendarMonth.format('MMMM YYYY')}
              </span>
              <button
                onClick={() => setCalendarMonth(m => m.add(1, 'month'))}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
              >
                <RightOutlined className="text-xs" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-0 mb-1">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] text-slate-400 font-duotone-bold uppercase py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-0">
              {calendarDays.map((date) => {
                const d = date.startOf('day');
                const isPast = d.isBefore(today);
                const booked = isDateBooked(d);
                const isToday = d.isSame(today, 'day');
                const canClick = !isPast && (!booked || selectingCheckOut);

                return (
                  <button
                    key={d.format('YYYY-MM-DD')}
                    onClick={() => canClick && handleDateClick(date)}
                    disabled={isPast || (booked && !selectingCheckOut)}
                    className={`relative h-9 text-xs font-medium transition-all duration-150 ${getDayClass(date)}`}
                  >
                    {isToday && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#00a8c4]" />
                    )}
                    {d.date()}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#00a8c4]" /> {t('outsider:accommodationBooking.calendar.legend.selected')}
              </div>
              {!isHotel && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-rose-100 border border-rose-200" /> {t('outsider:accommodationBooking.calendar.legend.booked')}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#00a8c4]" /> {t('outsider:accommodationBooking.calendar.legend.today')}
              </div>
            </div>

            {/* Selection hint */}
            <div className="mt-3 text-xs text-center text-slate-400 font-duotone-regular">
              {!checkIn && !selectingCheckOut && t('outsider:accommodationBooking.calendar.hint.selectCheckin')}
              {checkIn && selectingCheckOut && (
                <span>
                  {t('outsider:accommodationBooking.calendar.hint.selectCheckout', { date: checkIn.format('MMM D') })}
                </span>
              )}
              {checkIn && checkOut && (
                <span className="font-duotone-bold" style={{ color: '#007a8f' }}>
                  {t('outsider:accommodationBooking.calendar.hint.rangeSelected', {
                    checkin: checkIn.format('MMM D'),
                    checkout: checkOut.format('MMM D'),
                    nights,
                  })}
                </span>
              )}
            </div>
          </div>

          {/* ── Guest count + Notes ── */}
          <div className="px-6 pb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex items-center gap-2 shrink-0">
                <TeamOutlined className="text-slate-400" />
                <span className="text-xs text-slate-600 font-duotone-bold">{t('outsider:accommodationBooking.guests.label')}</span>
                {/* Clear +/- stepper — the nightly price above updates as this changes */}
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => setGuestsCount(g => Math.max(1, g - 1))}
                    disabled={guestsCount <= 1}
                    aria-label="Fewer guests"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <MinusOutlined className="text-[10px]" />
                  </button>
                  <span className="w-6 text-center text-sm font-duotone-bold text-slate-900 tabular-nums">{guestsCount}</span>
                  <button
                    type="button"
                    onClick={() => setGuestsCount(g => Math.min(capacity, g + 1))}
                    disabled={guestsCount >= capacity}
                    aria-label="More guests"
                    className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-[rgba(0,168,196,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ color: guestsCount >= capacity ? undefined : '#00a8c4' }}
                  >
                    <PlusOutlined className="text-[10px]" />
                  </button>
                </div>
                <span className="text-[10px] text-slate-400">{t('outsider:accommodationBooking.guests.max', { count: capacity })}</span>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                <EditOutlined className="text-slate-400 shrink-0" />
                <Input
                  placeholder={t('outsider:accommodationBooking.guests.notesPlaceholder')}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  size="small"
                  className="!text-xs"
                />
              </div>
            </div>
          </div>

          {/* ── Payment Method ── */}
          <div className="px-6 pb-4">
            <p className="text-[10px] font-duotone-bold uppercase tracking-wider text-slate-400 mb-2">
              {t('outsider:accommodationBooking.payment.method')}
            </p>
            <div className={`grid gap-3 ${canPayLater ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {[
                { key: 'wallet', icon: <WalletOutlined />, label: t('outsider:accommodationBooking.payment.wallet'), sub: formatCurrency(walletInUserCurrency, userCurrency) },
                { key: 'deposit', icon: <SafetyCertificateOutlined />, label: t('outsider:accommodationBooking.payment.deposit', { percent: DEPOSIT_PERCENT }), sub: nights > 0 ? formatPrice(depositAmount) : t('outsider:accommodationBooking.payment.twentyPercent') },
                ...(canPayLater ? [{ key: 'pay_later', icon: <ClockCircleOutlined />, label: t('outsider:accommodationBooking.payment.payLater'), sub: t('outsider:accommodationBooking.payment.atCenter') }] : []),
              ].map(({ key, icon, label, sub }) => {
                const isActive = paymentMethod === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPaymentMethod(key)}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                      isActive ? 'shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    style={isActive ? { borderColor: '#00a8c4', backgroundColor: 'rgba(0,168,196,0.07)' } : undefined}
                  >
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#00a8c4' }}>
                        <CheckOutlined className="text-white text-[8px]" />
                      </div>
                    )}
                    <span className={`text-lg ${isActive ? '' : 'text-slate-400'}`} style={isActive ? { color: '#00a8c4' } : undefined}>{icon}</span>
                    <span className={`text-xs font-duotone-bold leading-tight ${isActive ? '' : 'text-slate-600'}`} style={isActive ? { color: '#007a8f' } : undefined}>{label}</span>
                    <span className={`text-[10px] leading-tight ${isActive ? '' : 'text-slate-400'}`} style={isActive ? { color: 'rgba(0,122,143,0.75)' } : undefined}>{sub}</span>
                  </button>
                );
              })}
            </div>

            {/* Deposit breakdown */}
            {isDeposit && nights > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div className="rounded-lg bg-white border border-slate-200 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-duotone-bold">{t('outsider:accommodationBooking.payment.depositNow')}</span>
                    <span className="text-sm font-duotone-bold" style={{ color: '#007a8f' }}>{formatPrice(depositAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-duotone-bold">{t('outsider:accommodationBooking.payment.payOnArrival')}</span>
                    <span className="text-sm font-duotone-bold text-slate-900">{formatPrice(remainingAmount)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight pt-1">
                    Pay {DEPOSIT_PERCENT}% now to reserve your stay. The remaining {100 - DEPOSIT_PERCENT}% is due on arrival.
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-duotone-bold uppercase tracking-wider text-slate-500 mb-2">{t('outsider:accommodationBooking.payment.payDepositVia')}</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { key: 'bank_transfer', icon: <BankOutlined />, label: t('outsider:accommodationBooking.payment.bankTransfer') },
                    ].map(({ key, icon, label }) => {
                      const active = depositMethod === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDepositMethod(key)}
                          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-all ${
                            active ? 'bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                          style={active ? { borderColor: '#00a8c4' } : undefined}
                        >
                          <span className={`text-sm ${active ? '' : 'text-slate-400'}`} style={active ? { color: '#00a8c4' } : undefined}>{icon}</span>
                          <span className={`text-xs font-duotone-bold ${active ? '' : 'text-slate-500'}`} style={active ? { color: '#007a8f' } : undefined}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {depositMethod === 'bank_transfer' && (
                  <>
                    <Select
                      placeholder={t('outsider:accommodationBooking.payment.chooseBankAccount')}
                      className="w-full"
                      size="large"
                      value={selectedBankAccountId}
                      onChange={setSelectedBankAccountId}
                      options={bankAccounts.map(acc => ({
                        value: acc.id,
                        label: `${acc.bankName} (${acc.currency})${acc.iban ? ` — …${acc.iban.slice(-6)}` : ''}`,
                      }))}
                    />
                    {selectedAccount && <BankDetailsCard account={selectedAccount} />}
                    {selectedAccount && (
                      <div>
                        <p className="text-[10px] font-duotone-bold uppercase tracking-wider text-slate-500 mb-2">{t('outsider:accommodationBooking.payment.uploadReceipt')}</p>
                        <Upload
                          onRemove={(file) => setFileList(prev => prev.filter(f => f.uid !== file.uid))}
                          beforeUpload={(file) => {
                            const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
                            if (!allowed.includes(file.type)) {
                              msg.error('Only JPEG, PNG, or PDF files are accepted.');
                              return Upload.LIST_IGNORE;
                            }
                            setFileList([file]);
                            return false;
                          }}
                          fileList={fileList}
                          maxCount={1}
                          accept=".jpg,.jpeg,.png,.pdf"
                        >
                          <button
                            type="button"
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-dashed text-xs transition-colors hover:bg-[rgba(0,168,196,0.06)]"
                            style={{ borderColor: 'rgba(0,168,196,0.45)', color: '#007a8f', backgroundColor: 'rgba(0,168,196,0.03)' }}
                          >
                            <UploadOutlined /> {t('outsider:accommodationBooking.payment.selectReceipt')}
                          </button>
                        </Upload>
                        <p className="text-[10px] mt-1.5 text-slate-400 leading-tight">
                          Upload your deposit receipt for {formatPrice(depositAmount)} — JPEG, PNG, or PDF accepted.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {walletInsufficient && paymentMethod === 'wallet' && (
              <Alert
                type="warning"
                showIcon
                className="!mt-3 !rounded-xl !text-xs"
                message={t('outsider:accommodationBooking.insufficient.title')}
                description={t('outsider:accommodationBooking.insufficient.description')}
              />
            )}
          </div>

          {/* ── Promo Code ── */}
          <div className="px-6 pb-4">
            <p className="text-[10px] font-duotone-bold uppercase tracking-wider text-slate-400 mb-2">
              {t('outsider:accommodationBooking.payment.promoCode')}
            </p>
            <PromoCodeInput
              context="accommodation"
              amount={totalPrice}
              currency="EUR"
              serviceId={unit?.id}
              appliedVoucher={appliedVoucher}
              onValidCode={(voucherData) => setAppliedVoucher(voucherData)}
              onClear={() => setAppliedVoucher(null)}
              disabled={bookMutation.isPending}
              variant="light"
            />
          </div>

          {/* ── Summary + Submit ── */}
          <div className="px-6 pb-6">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="mb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider font-duotone-bold m-0">{t('outsider:accommodationBooking.summary.total')}</p>
                    <p className="text-slate-400 text-xs m-0 font-duotone-regular">
                      {nights > 0
                        ? (priceBreakdown.weekendNights > 0 || priceBreakdown.holidayNights > 0)
                          ? `${nights} night${nights !== 1 ? 's' : ''} (${t('outsider:accommodationBooking.summary.mixedRates')})`
                          : isPerPerson && guestsCount > 1
                            ? `${formatPrice(nightlyRate)} × ${guestsCount} guests × ${nights} night${nights !== 1 ? 's' : ''}`
                            : `${formatPrice(nightlyRate)} × ${nights} night${nights !== 1 ? 's' : ''}`
                        : t('outsider:accommodationBooking.summary.selectDates')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-duotone-bold-extended text-slate-900 tracking-tight">
                      {nights > 0 ? formatPrice(effectiveTotalPrice) : '—'}
                    </span>
                    {nights > 0 && isPerPerson && guestsCount > 1 && (
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        {formatPrice(effectiveTotalPrice / guestsCount)} per person
                      </span>
                    )}
                  </div>
                </div>
                {nights > 0 && (priceBreakdown.weekendNights > 0 || priceBreakdown.holidayNights > 0 || priceBreakdown.discount) && (
                  <div className="mt-2 space-y-1 text-xs text-slate-400">
                    {priceBreakdown.weekendNights > 0 && (
                      <div className="flex justify-between">
                        <span>{priceBreakdown.weekendNights} weekend night{priceBreakdown.weekendNights !== 1 ? 's' : ''}</span>
                        <span>{formatPrice((priceBreakdown.weekendRate ?? unitMeta.weekend_price) * guestMultiplier)}/night</span>
                      </div>
                    )}
                    {priceBreakdown.holidayNights > 0 && (
                      <div className="flex justify-between">
                        <span>{priceBreakdown.holidayNights} holiday night{priceBreakdown.holidayNights !== 1 ? 's' : ''}</span>
                        <span>special rate</span>
                      </div>
                    )}
                    {(nights - priceBreakdown.weekendNights - priceBreakdown.holidayNights) > 0 && (priceBreakdown.weekendNights > 0 || priceBreakdown.holidayNights > 0) && (
                      <div className="flex justify-between">
                        <span>{nights - priceBreakdown.weekendNights - priceBreakdown.holidayNights} standard night{(nights - priceBreakdown.weekendNights - priceBreakdown.holidayNights) !== 1 ? 's' : ''}</span>
                        <span>{formatPrice((priceBreakdown.standardRate ?? pricePerNight) * guestMultiplier)}/night</span>
                      </div>
                    )}
                    {priceBreakdown.discount && (
                      <div className="flex justify-between text-emerald-600">
                        <span>{t('outsider:accommodationBooking.summary.discount', { nights: priceBreakdown.discount.min_nights })}</span>
                        <span>−{priceBreakdown.discount.discount_type === 'percentage'
                          ? `${priceBreakdown.discount.discount_value}%`
                          : formatPrice(priceBreakdown.discount.discount_value * nights)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {(() => {
                const submitDisabled =
                  !checkIn || !checkOut || nights < 1 ||
                  (paymentMethod === 'wallet' && walletInsufficient) ||
                  (isDeposit && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0));
                return (
              <button
                disabled={submitDisabled || bookMutation.isPending}
                onClick={handleSubmit}
                className={`
                  w-full h-12 rounded-xl text-base font-duotone-bold transition-all duration-200
                  flex items-center justify-center gap-2
                  ${submitDisabled
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'hover:scale-[1.01] active:scale-[0.99] shadow-md'}
                `}
                style={submitDisabled ? undefined : {
                  backgroundColor: '#4b4f54',
                  color: '#00a8c4',
                  border: '1px solid rgba(0,168,196,0.5)',
                  boxShadow: '0 0 12px rgba(0,168,196,0.25)',
                }}
              >
                {bookMutation.isPending ? (
                  <Spin size="small" className="[&_.ant-spin-dot-item]:!bg-[#00a8c4]" />
                ) : (
                  <>
                    <RocketOutlined />
                    {isDeposit
                      ? t('outsider:accommodationBooking.submit.payDeposit', { amount: nights > 0 ? formatPrice(depositAmount) : '' })
                      : paymentMethod === 'pay_later'
                        ? t('outsider:accommodationBooking.submit.confirmPayLater')
                        : paymentMethod === 'credit_card'
                          ? t('outsider:accommodationBooking.submit.payWithCard', { amount: nights > 0 ? formatPrice(effectiveTotalPrice) : '' })
                          : isHotel
                            ? t('outsider:accommodationBooking.submit.requestBooking')
                            : t('outsider:accommodationBooking.submit.pay', { amount: nights > 0 ? formatPrice(effectiveTotalPrice) : '' })}
                  </>
                )}
              </button>
                );
              })()}

              <p className="text-center text-slate-400 text-[10px] mt-3 flex items-center justify-center gap-1 m-0 font-duotone-regular">
                <InfoCircleOutlined />
                {isDeposit
                  ? `Pay ${DEPOSIT_PERCENT}% now, remaining ${100 - DEPOSIT_PERCENT}% on arrival.`
                  : paymentMethod === 'pay_later'
                    ? 'Balance will be collected at the center upon check-in.'
                    : paymentMethod === 'credit_card'
                      ? 'You\'ll be redirected to a secure payment page.'
                      : isHotel
                        ? 'Request — we\'ll check hotel availability and confirm.'
                        : 'Funds will be reserved from your wallet.'}
              </p>
            </div>
          </div>
        </>
      )}

    </Modal>

      <IyzicoPaymentModal
        visible={showIyzicoModal}
        paymentPageUrl={iyzicoPaymentUrl}
        socketEventName="booking:payment_confirmed"
        onSuccess={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          analyticsService.track('purchase', { type: 'accommodation', method: 'card' });
          msg.success(t('outsider:accommodationBooking.toasts.paymentSuccess'));
          queryClient.invalidateQueries({ queryKey: ['accommodation-unit-detail', unit?.id] });
          queryClient.invalidateQueries({ queryKey: ['accommodation'] });
          queryClient.invalidateQueries({ queryKey: ['wallet'] });
          onSuccess?.();
          onClose();
        }}
        onClose={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
        }}
      />
    </>
  );
};

export default AccommodationBookingModal;
