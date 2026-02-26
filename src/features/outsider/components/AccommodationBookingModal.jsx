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
import { Modal, InputNumber, Input, Spin, Alert, App } from 'antd';
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
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';
import apiClient from '@/shared/services/apiClient';

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  const totalPrice = nights * pricePerNight;

  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const walletInUserCurrency = convertCurrency(walletBalance, walletCurrency, userCurrency);
  const walletInsufficient = paymentMethod === 'wallet' && totalPrice > 0 && totalPrice > walletBalance;

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

  const handleSubmit = () => {
    if (!checkIn || !checkOut) {
      msg.warning('Please select check-in and check-out dates.');
      return;
    }
    if (nights < 1) {
      msg.warning('Check-out must be at least 1 day after check-in.');
      return;
    }
    bookMutation.mutate({
      unit_id: unit.id,
      check_in_date: checkIn.format('YYYY-MM-DD'),
      check_out_date: checkOut.format('YYYY-MM-DD'),
      guests_count: guestsCount,
      notes: notes || undefined,
      payment_method: paymentMethod,
    });
  };

  const unitName = unit?.name || unitDetail?.name || 'Accommodation';

  return (
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
            <div className={`grid gap-3 ${canPayLater ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* Wallet */}
              <button
                type="button"
                onClick={() => setPaymentMethod('wallet')}
                className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all text-center ${
                  paymentMethod === 'wallet'
                    ? 'border-blue-500 bg-blue-500/10 shadow-sm shadow-blue-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                }`}
              >
                {paymentMethod === 'wallet' && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                    <CheckOutlined className="text-white text-[8px]" />
                  </div>
                )}
                <WalletOutlined className={`text-xl ${paymentMethod === 'wallet' ? 'text-blue-400' : 'text-white/40'}`} />
                <span className={`text-sm font-semibold ${paymentMethod === 'wallet' ? 'text-blue-400' : 'text-white/60'}`}>
                  Wallet
                </span>
                <span className={`text-xs ${paymentMethod === 'wallet' ? 'text-blue-400/70' : 'text-white/30'}`}>
                  {formatCurrency(walletInUserCurrency, userCurrency)}
                </span>
              </button>

              {/* Pay Later — trusted customers only */}
              {canPayLater && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('pay_later')}
                  className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all text-center ${
                    paymentMethod === 'pay_later'
                      ? 'border-sky-500 bg-sky-500/10 shadow-sm shadow-sky-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                  }`}
                >
                  {paymentMethod === 'pay_later' && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-sky-500 flex items-center justify-center">
                      <CheckOutlined className="text-white text-[8px]" />
                    </div>
                  )}
                  <ClockCircleOutlined className={`text-xl ${paymentMethod === 'pay_later' ? 'text-sky-400' : 'text-white/40'}`} />
                  <span className={`text-sm font-semibold ${paymentMethod === 'pay_later' ? 'text-sky-400' : 'text-white/60'}`}>
                    Pay Later
                  </span>
                  <span className={`text-xs ${paymentMethod === 'pay_later' ? 'text-sky-400/70' : 'text-white/30'}`}>
                    At the center
                  </span>
                </button>
              )}
            </div>

            {walletInsufficient && paymentMethod === 'wallet' && (
              <Alert
                type="warning"
                showIcon
                className="!mt-3 !rounded-xl !text-xs !bg-amber-500/10 !border-amber-500/20 [&_.ant-alert-message]:!text-amber-400 [&_.ant-alert-description]:!text-amber-400/70 [&_.anticon]:!text-amber-400"
                message="Insufficient wallet balance"
                description={`You need ${formatPrice(totalPrice)} but have ${formatCurrency(walletInUserCurrency, userCurrency)}. ${canPayLater ? 'Switch to Pay Later or top up your wallet.' : 'Please top up your wallet first.'}`}
              />
            )}
          </div>

          {/* ── Summary + Submit ── */}
          <div className="px-6 pb-6">
            <div className="bg-[#13151a] rounded-2xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider font-semibold m-0">Total</p>
                  <p className="text-white/30 text-xs m-0">
                    {nights > 0
                      ? `${formatPrice(pricePerNight)} × ${nights} night${nights !== 1 ? 's' : ''}`
                      : 'Select dates'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-white tracking-tight">
                    {nights > 0 ? formatPrice(totalPrice) : '—'}
                  </span>
                </div>
              </div>

              <button
                disabled={!checkIn || !checkOut || nights < 1 || bookMutation.isPending || (paymentMethod === 'wallet' && walletInsufficient)}
                onClick={handleSubmit}
                className={`
                  w-full h-12 rounded-xl text-base font-bold border-none transition-all duration-200
                  flex items-center justify-center gap-2
                  ${(!checkIn || !checkOut || nights < 1 || (paymentMethod === 'wallet' && walletInsufficient))
                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                    : paymentMethod === 'pay_later'
                      ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/20 hover:from-sky-400 hover:to-sky-500 active:scale-[0.98]'
                      : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 hover:from-blue-400 hover:to-blue-500 active:scale-[0.98]'
                  }
                `}
              >
                {bookMutation.isPending ? (
                  <Spin size="small" className="[&_.ant-spin-dot-item]:!bg-white" />
                ) : (
                  <>
                    <RocketOutlined />
                    {paymentMethod === 'pay_later'
                      ? 'Confirm — Pay Later'
                      : isHotel
                        ? 'Request Booking'
                        : `Pay ${nights > 0 ? formatPrice(totalPrice) : ''}`}
                  </>
                )}
              </button>

              <p className="text-center text-white/30 text-[10px] mt-3 flex items-center justify-center gap-1 m-0">
                <InfoCircleOutlined />
                {paymentMethod === 'pay_later'
                  ? 'Balance will be collected at the center upon check-in.'
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
  );
};

export default AccommodationBookingModal;
