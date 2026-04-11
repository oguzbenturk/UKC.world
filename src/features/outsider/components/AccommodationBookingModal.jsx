/**
 * AccommodationBookingModal
 *
 * Polished dark-themed booking modal for Stay pages with:
 *  - Custom calendar for check-in / check-out
 *  - Live availability (booked dates disabled)
 *  - Guest count + notes
 *  - Payment method: Wallet or Pay Later (trusted customers only)
 *  - Price estimate (nights × price_per_night)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, InputNumber, Input, Spin, Alert, App, Select, Upload, Tag } from 'antd';
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
} from '@ant-design/icons';
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';
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
    <div className="mt-2 rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-500/10">
        <BankOutlined className="text-violet-400 text-xs" />
        <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Transfer To</span>
        {account.currency && <Tag color="purple" className="!m-0 !text-[10px] !font-bold ml-auto">{account.currency}</Tag>}
      </div>
      <div className="px-3 py-1 divide-y divide-violet-500/10">
        {fields.map(({ label, value }) => (
          <div key={label} className="py-2">
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-xs text-white/80 font-mono break-all">{value}</p>
          </div>
        ))}
      </div>
      {account.instructions && (
        <div className="px-3 py-2 bg-amber-500/5 border-t border-amber-500/10">
          <p className="text-[10px] text-amber-400/80 leading-snug">{account.instructions}</p>
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
      setDepositMethod('credit_card');
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
  const unitMeta = useMemo(() => {
    const amenities = unit?.amenities || unitDetail?.amenities || [];
    if (!Array.isArray(amenities)) return {};
    const entry = amenities.find(a => typeof a === 'string' && a.startsWith('__meta__'));
    if (!entry) return {};
    try { return JSON.parse(entry.slice(8)); } catch { return {}; }
  }, [unit?.amenities, unitDetail?.amenities]);

  // Calculate total with weekend / holiday / discount pricing
  const priceBreakdown = useMemo(() => {
    if (!checkIn || !checkOut || nights <= 0) return { total: 0, weekendNights: 0, holidayNights: 0, discount: null };
    const weekendPrice = unitMeta.weekend_price ? parseFloat(unitMeta.weekend_price) : null;
    const holidays = Array.isArray(unitMeta.holiday_pricing) ? unitMeta.holiday_pricing : [];
    const discounts = Array.isArray(unitMeta.custom_discounts) ? unitMeta.custom_discounts : [];

    let subtotal = 0;
    let weekendNights = 0;
    let holidayNights = 0;

    for (let i = 0; i < nights; i++) {
      const nightDate = checkIn.add(i, 'day');
      const dateStr = nightDate.format('YYYY-MM-DD');
      const dayOfWeek = nightDate.day(); // 0=Sun, 5=Fri, 6=Sat

      const holidayMatch = holidays.find(h =>
        h.start_date && h.end_date && h.price_per_night &&
        dateStr >= h.start_date && dateStr <= h.end_date
      );

      if (holidayMatch) {
        subtotal += parseFloat(holidayMatch.price_per_night);
        holidayNights++;
      } else if (weekendPrice && (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6)) {
        subtotal += weekendPrice;
        weekendNights++;
      } else {
        subtotal += pricePerNight;
      }
    }

    // Apply best matching length-of-stay discount
    let discount = null;
    if (discounts.length > 0) {
      const eligible = discounts
        .filter(d => d.min_nights && nights >= d.min_nights && d.discount_value > 0)
        .sort((a, b) => (b.min_nights || 0) - (a.min_nights || 0));
      if (eligible.length > 0) discount = eligible[0];
    }

    let total = subtotal;
    if (discount) {
      if (discount.discount_type === 'percentage') {
        total = subtotal * (1 - discount.discount_value / 100);
      } else {
        total = subtotal - (discount.discount_value * nights);
      }
      total = Math.max(0, total);
    }

    return { total: Math.round(total * 100) / 100, subtotal, weekendNights, holidayNights, discount };
  }, [checkIn, checkOut, nights, pricePerNight, unitMeta]);

  const totalPrice = priceBreakdown.total;

  const formatPrice = (eurPrice) => {
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return `${eurFormatted} (~${formatCurrency(converted, userCurrency)})`;
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
        msg.warning('Selected range overlaps with an existing booking.');
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

    if (isPast) return 'text-white/15 cursor-not-allowed';
    if (booked) return 'bg-red-500/20 text-red-400/60 cursor-not-allowed line-through';
    if (checkIn && d.isSame(checkIn, 'day')) return 'bg-blue-500 text-white font-bold rounded-l-lg';
    if (checkOut && d.isSame(checkOut, 'day')) return 'bg-blue-500 text-white font-bold rounded-r-lg';
    if (checkIn && checkOut && d.isAfter(checkIn) && d.isBefore(checkOut)) return 'bg-blue-500/20 text-blue-300';
    if (selectingCheckOut && checkIn && d.isAfter(checkIn)) {
      return isCurrentMonth
        ? 'text-white hover:bg-blue-500/30 cursor-pointer'
        : 'text-white/30 hover:bg-blue-500/20 cursor-pointer';
    }
    return isCurrentMonth
      ? 'text-white hover:bg-white/10 cursor-pointer'
      : 'text-white/20 hover:bg-white/5 cursor-pointer';
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
      msg.success(
        paymentMethod === 'pay_later'
          ? 'Booking confirmed — pay at the center.'
          : isHotel
            ? 'Hotel booking request submitted!'
            : 'Stay booked successfully!',
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
      msg.warning('Please select check-in and check-out dates.');
      return;
    }
    if (nights < 1) {
      msg.warning('Check-out must be at least 1 day after check-in.');
      return;
    }
    if (isDeposit && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0)) {
      msg.error('Please select a bank account and upload your deposit receipt.');
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
        <div className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
          <CloseOutlined />
        </div>
      }
      styles={{
        content: {
          backgroundColor: '#0d1118',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 0,
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
        },
        body: { padding: 0 },
      }}
    >
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <CalendarOutlined className="text-white text-lg" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white m-0 truncate">{unitName}</h3>
            <p className="text-xs text-white/40 m-0">
              {isHotel ? 'Request your preferred dates' : 'Select dates & pay'}
            </p>
          </div>
          {pricePerNight > 0 && (
            <div className="text-right shrink-0">
              <span className="text-blue-400 text-lg font-bold">{formatPrice(pricePerNight)}</span>
              <span className="text-white/30 text-xs block">/ night</span>
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
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <LeftOutlined className="text-xs" />
              </button>
              <span className="text-sm font-bold text-white tracking-wide">
                {calendarMonth.format('MMMM YYYY')}
              </span>
              <button
                onClick={() => setCalendarMonth(m => m.add(1, 'month'))}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <RightOutlined className="text-xs" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-0 mb-1">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] text-white/30 font-semibold uppercase py-1">
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
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                    )}
                    {d.date()}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-[10px] text-white/40">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-500" /> Selected
              </div>
              {!isHotel && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/40" /> Booked
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-blue-400" /> Today
              </div>
            </div>

            {/* Selection hint */}
            <div className="mt-3 text-xs text-center text-white/40">
              {!checkIn && !selectingCheckOut && 'Select your check-in date'}
              {checkIn && selectingCheckOut && (
                <span>
                  Check-in: <span className="text-blue-400 font-semibold">{checkIn.format('MMM D')}</span> — now select check-out
                </span>
              )}
              {checkIn && checkOut && (
                <span className="text-blue-300">
                  {checkIn.format('MMM D')} — {checkOut.format('MMM D')} ({nights} night{nights !== 1 ? 's' : ''})
                </span>
              )}
            </div>
          </div>

          {/* ── Guest count + Notes ── */}
          <div className="px-6 pb-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <TeamOutlined className="text-white/40" />
                <span className="text-xs text-white/60">Guests</span>
                <InputNumber
                  min={1}
                  max={capacity}
                  value={guestsCount}
                  onChange={v => setGuestsCount(v || 1)}
                  size="small"
                  className="!w-16 !bg-white/5 !border-white/10 [&_.ant-input-number-input]:!text-white"
                />
                <span className="text-[10px] text-white/30">max {capacity}</span>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <EditOutlined className="text-white/40" />
                <Input
                  placeholder="Notes (optional)"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  size="small"
                  className="!bg-white/5 !border-white/10 !text-white placeholder:!text-white/20 !text-xs"
                />
              </div>
            </div>
          </div>

          {/* ── Payment Method ── */}
          <div className="px-6 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">
              Payment Method
            </p>
            <div className={`grid gap-3 ${canPayLater ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {[
                { key: 'wallet', icon: <WalletOutlined />, label: 'Wallet', sub: formatCurrency(walletInUserCurrency, userCurrency), color: 'blue-500', textColor: 'text-blue-400' },
                { key: 'credit_card', icon: <CreditCardOutlined />, label: 'Card', sub: 'Iyzico', color: 'emerald-500', textColor: 'text-emerald-400' },
                { key: 'deposit', icon: <SafetyCertificateOutlined />, label: `Deposit ${DEPOSIT_PERCENT}%`, sub: nights > 0 ? formatPrice(depositAmount) : '20% now', color: 'violet-500', textColor: 'text-violet-400' },
                ...(canPayLater ? [{ key: 'pay_later', icon: <ClockCircleOutlined />, label: 'Pay Later', sub: 'At center', color: 'sky-500', textColor: 'text-sky-400' }] : []),
              ].map(({ key, icon, label, sub, color, textColor }) => {
                const isActive = paymentMethod === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPaymentMethod(key)}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                      isActive
                        ? `border-${color} bg-${color}/10 shadow-sm`
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    {isActive && (
                      <div className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-${color} flex items-center justify-center`}>
                        <CheckOutlined className="text-white text-[8px]" />
                      </div>
                    )}
                    <span className={`text-lg ${isActive ? textColor : 'text-white/40'}`}>{icon}</span>
                    <span className={`text-xs font-semibold leading-tight ${isActive ? textColor : 'text-white/60'}`}>{label}</span>
                    <span className={`text-[10px] leading-tight ${isActive ? `${textColor}/70` : 'text-white/30'}`}>{sub}</span>
                  </button>
                );
              })}
            </div>

            {/* Deposit breakdown */}
            {isDeposit && nights > 0 && (
              <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 space-y-3">
                <div className="rounded-lg bg-violet-500/10 border border-violet-500/15 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-violet-300 font-semibold">Deposit Now</span>
                    <span className="text-sm font-bold text-violet-200">{formatPrice(depositAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-violet-300 font-semibold">Pay on Arrival</span>
                    <span className="text-sm font-bold text-violet-200">{formatPrice(remainingAmount)}</span>
                  </div>
                  <p className="text-[10px] text-violet-400/70 leading-tight pt-1">
                    Pay {DEPOSIT_PERCENT}% now to reserve your stay. The remaining {100 - DEPOSIT_PERCENT}% is due on arrival.
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80 mb-2">Pay deposit via</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'credit_card', icon: <CreditCardOutlined />, label: 'Card' },
                      { key: 'bank_transfer', icon: <BankOutlined />, label: 'Bank Transfer' },
                    ].map(({ key, icon, label }) => {
                      const active = depositMethod === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDepositMethod(key)}
                          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-all ${
                            active ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          <span className={`text-sm ${active ? 'text-violet-400' : 'text-white/30'}`}>{icon}</span>
                          <span className={`text-xs font-semibold ${active ? 'text-violet-300' : 'text-white/50'}`}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {depositMethod === 'bank_transfer' && (
                  <>
                    <Select
                      placeholder="Choose bank account to transfer to…"
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
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80 mb-2">Upload Receipt</p>
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
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 text-violet-400 text-xs hover:bg-violet-500/10 transition-colors"
                          >
                            <UploadOutlined /> Select Receipt (JPEG, PNG or PDF)
                          </button>
                        </Upload>
                        <p className="text-[10px] mt-1.5 text-violet-400/60 leading-tight">
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
                className="!mt-3 !rounded-xl !text-xs !bg-amber-500/10 !border-amber-500/20 [&_.ant-alert-message]:!text-amber-400 [&_.ant-alert-description]:!text-amber-400/70 [&_.anticon]:!text-amber-400"
                message="Insufficient wallet balance"
                description={`You need ${formatPrice(effectiveTotalPrice)} but have ${formatCurrency(walletInUserCurrency, userCurrency)}. ${canPayLater ? 'Switch to Pay Later or top up your wallet.' : 'Please top up your wallet first.'}`}
              />
            )}
          </div>

          {/* ── Promo Code ── */}
          <div className="px-6 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">
              Promo Code
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
              variant="dark"
            />
          </div>

          {/* ── Summary + Submit ── */}
          <div className="px-6 pb-6">
            <div className="bg-[#13151a] rounded-2xl p-4 border border-white/5">
              <div className="mb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white/40 text-xs uppercase tracking-wider font-semibold m-0">Total</p>
                    <p className="text-white/30 text-xs m-0">
                      {nights > 0
                        ? (priceBreakdown.weekendNights > 0 || priceBreakdown.holidayNights > 0)
                          ? `${nights} night${nights !== 1 ? 's' : ''} (mixed rates)`
                          : `${formatPrice(pricePerNight)} × ${nights} night${nights !== 1 ? 's' : ''}`
                        : 'Select dates'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-white tracking-tight">
                      {nights > 0 ? formatPrice(effectiveTotalPrice) : '—'}
                    </span>
                  </div>
                </div>
                {nights > 0 && (priceBreakdown.weekendNights > 0 || priceBreakdown.holidayNights > 0 || priceBreakdown.discount) && (
                  <div className="mt-2 space-y-1 text-xs text-white/30">
                    {priceBreakdown.weekendNights > 0 && (
                      <div className="flex justify-between">
                        <span>{priceBreakdown.weekendNights} weekend night{priceBreakdown.weekendNights !== 1 ? 's' : ''}</span>
                        <span>{formatPrice(unitMeta.weekend_price)}/night</span>
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
                        <span>{formatPrice(pricePerNight)}/night</span>
                      </div>
                    )}
                    {priceBreakdown.discount && (
                      <div className="flex justify-between text-green-400/70">
                        <span>Discount ({priceBreakdown.discount.min_nights}+ nights)</span>
                        <span>−{priceBreakdown.discount.discount_type === 'percentage'
                          ? `${priceBreakdown.discount.discount_value}%`
                          : formatPrice(priceBreakdown.discount.discount_value * nights)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                disabled={
                  !checkIn || !checkOut || nights < 1 || bookMutation.isPending ||
                  (paymentMethod === 'wallet' && walletInsufficient) ||
                  (isDeposit && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0))
                }
                onClick={handleSubmit}
                className={`
                  w-full h-12 rounded-xl text-base font-bold border-none transition-all duration-200
                  flex items-center justify-center gap-2
                  ${(!checkIn || !checkOut || nights < 1 || (paymentMethod === 'wallet' && walletInsufficient) || (isDeposit && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0)))
                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                    : isDeposit
                      ? 'bg-gradient-to-r from-violet-500 to-violet-600 text-white shadow-lg shadow-violet-500/20 hover:from-violet-400 hover:to-violet-500 active:scale-[0.98]'
                      : paymentMethod === 'pay_later'
                        ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/20 hover:from-sky-400 hover:to-sky-500 active:scale-[0.98]'
                        : paymentMethod === 'credit_card'
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.98]'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 hover:from-blue-400 hover:to-blue-500 active:scale-[0.98]'
                  }
                `}
              >
                {bookMutation.isPending ? (
                  <Spin size="small" className="[&_.ant-spin-dot-item]:!bg-white" />
                ) : (
                  <>
                    <RocketOutlined />
                    {isDeposit
                      ? `Pay Deposit ${nights > 0 ? formatPrice(depositAmount) : ''}`
                      : paymentMethod === 'pay_later'
                        ? 'Confirm — Pay Later'
                        : paymentMethod === 'credit_card'
                          ? `Pay ${nights > 0 ? formatPrice(effectiveTotalPrice) : ''} with Card`
                          : isHotel
                            ? 'Request Booking'
                            : `Pay ${nights > 0 ? formatPrice(effectiveTotalPrice) : ''}`}
                  </>
                )}
              </button>

              <p className="text-center text-white/30 text-[10px] mt-3 flex items-center justify-center gap-1 m-0">
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

      <style>{`
        .accommodation-booking-modal .ant-modal-content {
          padding: 0;
          background: transparent;
        }
        .accommodation-booking-modal .ant-input-number {
          background: rgba(255,255,255,0.05) !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .accommodation-booking-modal .ant-input-number-input {
          color: white !important;
        }
        .accommodation-booking-modal .ant-input-number-handler-wrap {
          background: rgba(255,255,255,0.05) !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .accommodation-booking-modal .ant-input-number-handler {
          border-color: rgba(255,255,255,0.1) !important;
          color: white !important;
        }
      `}</style>
    </Modal>

      <IyzicoPaymentModal
        visible={showIyzicoModal}
        paymentPageUrl={iyzicoPaymentUrl}
        socketEventName="booking:payment_confirmed"
        onSuccess={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          msg.success('Payment successful! Your booking has been confirmed.');
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
