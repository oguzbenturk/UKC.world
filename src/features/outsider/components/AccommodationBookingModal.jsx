/**
 * AccommodationBookingModal
 *
 * Full-featured accommodation booking modal with:
 *  - Check-in / check-out date selection
 *  - Live availability (dates with existing bookings are disabled)
 *  - Guest count selection (up to unit capacity)
 *  - Price calculation (nights × price_per_night)
 *  - Submission to POST /accommodation/bookings
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, InputNumber, Input, message, Spin } from 'antd';
import {
  CalendarOutlined,
  TeamOutlined,
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  EditOutlined,
  RocketOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// eslint-disable-next-line complexity
const AccommodationBookingModal = ({ open, onClose, unit = {}, onSuccess }) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const queryClient = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────
  const [checkIn, setCheckIn] = useState(null);       // dayjs
  const [checkOut, setCheckOut] = useState(null);      // dayjs
  const [guestsCount, setGuestsCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(dayjs().startOf('month'));
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);

  // Reset when modal opens / unit changes
  useEffect(() => {
    if (open) {
      setCheckIn(null);
      setCheckOut(null);
      setGuestsCount(1);
      setNotes('');
      setCalendarMonth(dayjs().startOf('month'));
      setSelectingCheckOut(false);
    }
  }, [open, unit?.id]);

  // ── Fetch unit details with upcoming bookings ──────────────────────────
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

  // ── Blocked date ranges from existing bookings ─────────────────────────
  const bookedRanges = useMemo(() => {
    const bookings = unitDetail?.bookings || unitDetail?.upcoming_bookings || [];
    return bookings
      .filter(b => b.status !== 'cancelled')
      .map(b => ({
        start: dayjs(b.check_in_date).startOf('day'),
        end:   dayjs(b.check_out_date).startOf('day'),
      }));
  }, [unitDetail]);

  const isDateBooked = useCallback((date) => {
    const d = dayjs(date).startOf('day');
    return bookedRanges.some(r => d.isSameOrAfter(r.start) && d.isBefore(r.end));
  }, [bookedRanges]);

  // Check if a range overlaps with any existing booking
  const rangeOverlaps = useCallback((start, end) => {
    const s = dayjs(start).startOf('day');
    const e = dayjs(end).startOf('day');
    return bookedRanges.some(r => s.isBefore(r.end) && e.isAfter(r.start));
  }, [bookedRanges]);

  // ── Price calculation ──────────────────────────────────────────────────
  const pricePerNight = parseFloat(unit?.price_per_night || unitDetail?.price_per_night || 0);
  const capacity = unit?.capacity || unitDetail?.capacity || 10;
  const nights = checkIn && checkOut ? checkOut.diff(checkIn, 'day') : 0;
  const totalPrice = nights * pricePerNight;

  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  // ── Calendar grid ──────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = calendarMonth.startOf('month');
    // Monday-based: 0=Mon ... 6=Sun
    const startOffset = (firstDay.day() + 6) % 7;
    const startDate = firstDay.subtract(startOffset, 'day');
    const days = [];
    for (let i = 0; i < 42; i++) {
      days.push(startDate.add(i, 'day'));
    }
    return days;
  }, [calendarMonth]);

  const today = dayjs().startOf('day');

  const handleDateClick = (date) => {
    const d = date.startOf('day');
    if (d.isBefore(today)) return;
    if (isDateBooked(d) && !selectingCheckOut) return;

    if (!selectingCheckOut) {
      // Selecting check-in
      setCheckIn(d);
      setCheckOut(null);
      setSelectingCheckOut(true);
    } else {
      // Selecting check-out
      if (d.isSameOrBefore(checkIn)) {
        // Clicked before check-in — restart
        setCheckIn(d);
        setCheckOut(null);
        return;
      }
      // Check for overlap in the range
      if (rangeOverlaps(checkIn, d)) {
        message.warning('Selected range overlaps with an existing booking. Please choose different dates.');
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

    // Check-in highlight
    if (checkIn && d.isSame(checkIn, 'day')) {
      return 'bg-blue-500 text-white font-bold rounded-l-lg';
    }
    // Check-out highlight
    if (checkOut && d.isSame(checkOut, 'day')) {
      return 'bg-blue-500 text-white font-bold rounded-r-lg';
    }
    // In-between range
    if (checkIn && checkOut && d.isAfter(checkIn) && d.isBefore(checkOut)) {
      return 'bg-blue-500/20 text-blue-300';
    }
    // Hover hint during check-out selection
    if (selectingCheckOut && checkIn && d.isAfter(checkIn)) {
      return isCurrentMonth
        ? 'text-white hover:bg-blue-500/30 cursor-pointer'
        : 'text-white/30 hover:bg-blue-500/20 cursor-pointer';
    }

    return isCurrentMonth
      ? 'text-white hover:bg-white/10 cursor-pointer'
      : 'text-white/20 hover:bg-white/5 cursor-pointer';
  };

  // ── Submit booking ─────────────────────────────────────────────────────
  const bookMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiClient.post('/accommodation/bookings', payload);
      return res.data;
    },
    onSuccess: (data) => {
      message.success('Accommodation booked successfully! Your booking is pending confirmation.');
      queryClient.invalidateQueries({ queryKey: ['accommodation-unit-detail', unit?.id] });
      queryClient.invalidateQueries({ queryKey: ['accommodation'] });
      onSuccess?.(data);
      onClose();
    },
    onError: (err) => {
      const msg = err.response?.data?.error || err.message || 'Failed to create booking';
      message.error(msg);
    },
  });

  const handleSubmit = () => {
    if (!checkIn || !checkOut) {
      message.warning('Please select check-in and check-out dates.');
      return;
    }
    if (nights < 1) {
      message.warning('Check-out must be at least 1 day after check-in.');
      return;
    }

    // Show confirmation dialog before deducting from wallet
    Modal.confirm({
      title: 'Confirm Booking Payment',
      content: (
        <div className="space-y-2 mt-2">
          <p><strong>{unitName}</strong></p>
          <p>{checkIn.format('MMM D, YYYY')} → {checkOut.format('MMM D, YYYY')} ({nights} night{nights !== 1 ? 's' : ''})</p>
          <p>{guestsCount} guest{guestsCount !== 1 ? 's' : ''}</p>
          <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-orange-800 font-semibold m-0">
              💳 {formatPrice(totalPrice)} will be deducted from your wallet
            </p>
            <p className="text-orange-600 text-xs m-0 mt-1">
              If admin declines, the amount will be refunded automatically.
            </p>
          </div>
        </div>
      ),
      okText: 'Confirm & Pay',
      cancelText: 'Go Back',
      centered: true,
      onOk: () => {
        bookMutation.mutate({
          unit_id: unit.id,
          check_in_date: checkIn.format('YYYY-MM-DD'),
          check_out_date: checkOut.format('YYYY-MM-DD'),
          guests_count: guestsCount,
          notes: notes || undefined,
        });
      },
    });
  };

  const unitName = unit?.name || unitDetail?.name || 'Accommodation';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      centered
      destroyOnClose
      className="accommodation-booking-modal"
      closeIcon={
        <div className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
          <CloseOutlined />
        </div>
      }
      styles={{
        content: {
          backgroundColor: '#13151a',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 0,
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
        },
        body: { padding: 0 },
      }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <CalendarOutlined className="text-blue-400 text-lg" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white m-0">Book {unitName}</h3>
            <p className="text-xs text-white/40 m-0">Select your dates to check availability</p>
          </div>
        </div>
      </div>

      {unitLoading ? (
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      ) : (
        <>
          {/* Calendar */}
          <div className="px-6 pt-5 pb-3">
            {/* Month nav */}
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
                    className={`
                      relative h-9 text-xs font-medium transition-all duration-150
                      ${getDayClass(date)}
                    `}
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
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/40" /> Booked
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-blue-400" /> Today
              </div>
            </div>

            {/* Selection hint */}
            <div className="mt-3 text-xs text-center text-white/40">
              {!checkIn && !selectingCheckOut && 'Select your check-in date'}
              {checkIn && selectingCheckOut && (
                <span>Check-in: <span className="text-blue-400 font-semibold">{checkIn.format('MMM D')}</span> — now select check-out</span>
              )}
              {checkIn && checkOut && (
                <span className="text-blue-300">
                  {checkIn.format('MMM D')} — {checkOut.format('MMM D')} ({nights} night{nights !== 1 ? 's' : ''})
                </span>
              )}
            </div>
          </div>

          {/* Guest count + Notes */}
          <div className="px-6 pb-3 space-y-3">
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

          {/* Summary + Submit */}
          <div className="px-6 pb-6">
            <div className="bg-[#0f1013] rounded-2xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider font-semibold m-0">Total</p>
                  <p className="text-white/30 text-xs m-0">
                    {nights > 0
                      ? `${formatPrice(pricePerNight)} x ${nights} night${nights !== 1 ? 's' : ''}`
                      : 'Select dates'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-white tracking-tight">
                    {nights > 0 ? formatPrice(totalPrice) : '—'}
                  </span>
                </div>
              </div>

              <Button
                block
                size="large"
                type="primary"
                icon={<RocketOutlined />}
                loading={bookMutation.isPending}
                disabled={!checkIn || !checkOut || nights < 1}
                onClick={handleSubmit}
                className="!h-12 !rounded-xl !text-base !font-bold !border-none shadow-lg transition-transform active:scale-95 !bg-blue-600 hover:!bg-blue-500"
              >
                {bookMutation.isPending ? 'Booking...' : 'Confirm Booking'}
              </Button>

              <p className="text-center text-white/30 text-[10px] mt-3 flex items-center justify-center gap-1 m-0">
                <InfoCircleOutlined /> Your booking will be pending until confirmed by management.
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
