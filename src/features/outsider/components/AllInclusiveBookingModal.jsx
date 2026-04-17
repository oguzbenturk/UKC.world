/**
 * AllInclusiveBookingModal
 * 
 * Multi-step booking modal for All-Inclusive experience packages.
 * Steps:
 *   1. Check-in / Check-out date selection (calendar grid like hotel page)
 *   2. Rental day selection (auto-filled for each accommodation day)
 *   3. Lesson scheduling (instructor availability per day, 2h slots)
 *   4. Payment method (wallet / external / pay later for trusted customers)
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Tag, Steps, Spin, Input, Select, Tooltip, Alert, App } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  LeftOutlined,
  RightOutlined,
  WalletOutlined,
  CreditCardOutlined,
  ClockCircleOutlined,
  ShoppingOutlined,
  UserOutlined,
  CarOutlined,
  BookOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isBetween from 'dayjs/plugin/isBetween';

import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { getAvailableSlots, getInstructors } from '@/features/bookings/components/api/calendarApi';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';
import { getUnit as getAccommodationUnit } from '@/shared/services/accommodationApi';
import calendarConfig from '@/config/calendarConfig';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

// Predefined lesson block start times — slots are only offered at these exact times
const PRESET_SLOT_STARTS = calendarConfig.preScheduledSlots.map((s) => s.start);

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);

const HALF_HOUR_MINUTES = 30;
const LESSON_DURATION_HOURS = 2; // Each lesson block is 2h
const LESSON_DURATION_MINUTES = LESSON_DURATION_HOURS * 60;

/** Backend voucher validate accepts optional UUID `serviceId` only */
const VOUCHER_SERVICE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;



const timeStringToMinutes = (time) => {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
};

const findClosestTime = (targetTime, slots) => {
  if (!slots || slots.length === 0) return null;
  const targetMin = timeStringToMinutes(targetTime);
  let closest = slots[0].value;
  let closestDiff = Math.abs(timeStringToMinutes(slots[0].value) - targetMin);
  for (let i = 1; i < slots.length; i++) {
    const diff = Math.abs(timeStringToMinutes(slots[i].value) - targetMin);
    if (diff < closestDiff) { closest = slots[i].value; closestDiff = diff; }
  }
  return closest;
};

const minutesToTimeString = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Given instructor slots for a single day, compute which preset start times
 * can accommodate a contiguous block of `durationMinutes`.
 * Only offers the 4 business-defined lesson blocks (09:00, 11:30, 14:00, 16:30).
 */
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

// Helper to get package price in specific currency
const getPackagePriceInCurrency = (pkg, targetCurrency, convertCurrencyFn) => {
  if (!pkg) return { price: 0, currency: 'EUR' };
  if (targetCurrency && pkg.prices && Array.isArray(pkg.prices)) {
    const cp = pkg.prices.find((p) => (p.currencyCode || p.currency_code) === targetCurrency);
    if (cp?.price > 0) return { price: cp.price, currency: targetCurrency };
  }
  const baseCurrency = pkg.currency || 'EUR';
  const basePrice = pkg.price || 0;
  if (convertCurrencyFn && targetCurrency && targetCurrency !== baseCurrency) {
    return { price: convertCurrencyFn(basePrice, baseCurrency, targetCurrency), currency: targetCurrency };
  }
  return { price: basePrice, currency: baseCurrency };
};

/**
 * Check if a given date falls within any booked range.
 * bookedRanges = [{ checkIn: dayjs, checkOut: dayjs }, ...]
 */
const isDateBooked = (date, bookedRanges) => {
  if (!bookedRanges || bookedRanges.length === 0) return false;
  const d = date.startOf('day');
  return bookedRanges.some((range) => {
    // A check-in date overlaps if it falls within [range.checkIn, range.checkOut)
    return d.isSameOrAfter(range.checkIn) && d.isBefore(range.checkOut);
  });
};

/**
 * Check if a date range [start, start+nights) overlaps any booked range.
 */
const doesRangeOverlapBookings = (start, nights, bookedRanges) => {
  if (!bookedRanges || bookedRanges.length === 0) return false;
  const end = start.add(nights, 'day');
  return bookedRanges.some((range) => {
    return start.isBefore(range.checkOut) && end.isAfter(range.checkIn);
  });
};

/**
 * Find the first available check-in date (starting from today) where
 * a contiguous block of `nights` days is available.
 */
const findFirstAvailableDate = (bookedRanges, nights) => {
  const today = dayjs().startOf('day');
  // Search up to 365 days ahead
  for (let i = 0; i < 365; i++) {
    const candidate = today.add(i, 'day');
    if (!doesRangeOverlapBookings(candidate, nights || 1, bookedRanges)) {
      return candidate;
    }
  }
  return today; // fallback
};

/* ─────────────────────── DateStep ─────────────────────── */
const DateStep = ({ checkIn, checkOut, onDateChange, accommodationNights, bookedRanges = [], loadingAvailability = false, initialMonth }) => {
  const { message } = App.useApp();
  const today = dayjs().startOf('day');
  const [calendarMonth, setCalendarMonth] = useState(initialMonth || dayjs().startOf('month'));
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);

  // When initialMonth changes (e.g. after availability loads), jump to it
  useEffect(() => {
    if (initialMonth) {
      setCalendarMonth(initialMonth.startOf('month'));
    }
  }, [initialMonth]);

  const calendarDays = useMemo(() => {
    const firstDay = calendarMonth.startOf('month');
    const startOffset = (firstDay.day() + 6) % 7;
    const startDate = firstDay.subtract(startOffset, 'day');
    return Array.from({ length: 42 }, (_, i) => startDate.add(i, 'day'));
  }, [calendarMonth]);

  /** Returns true if the date is blocked (past, booked, or would cause overlap) */
  const isBlocked = useCallback((date) => {
    const d = date.startOf('day');
    if (d.isBefore(today)) return true;
    if (isDateBooked(d, bookedRanges)) return true;
    return false;
  }, [today, bookedRanges]);

  const handleDateClick = (date) => {
    const d = date.startOf('day');
    if (d.isBefore(today)) return;

    // Fixed-night packages: clicking any date sets check-in and auto-calculates check-out
    if (accommodationNights > 0) {
      if (isDateBooked(d, bookedRanges)) {
        message.warning('This date is already booked. Please select a different date.');
        return;
      }
      if (doesRangeOverlapBookings(d, accommodationNights, bookedRanges)) {
        message.warning('Not enough consecutive available nights from this date. Please try another.');
        return;
      }
      const autoCheckOut = d.add(accommodationNights, 'day');
      onDateChange(d, autoCheckOut);
      setSelectingCheckOut(false);
      return;
    }

    // Variable-night packages: manual check-in / check-out selection
    if (!selectingCheckOut) {
      if (isDateBooked(d, bookedRanges)) {
        message.warning('This date is already booked. Please select a different date.');
        return;
      }
      onDateChange(d, null);
      setSelectingCheckOut(true);
    } else {
      if (d.isSameOrBefore(checkIn)) {
        if (isDateBooked(d, bookedRanges)) {
          message.warning('This date is already booked.');
          return;
        }
        onDateChange(d, null);
        return;
      }
      const nights = d.diff(checkIn, 'day');
      if (doesRangeOverlapBookings(checkIn, nights, bookedRanges)) {
        message.warning('Your selected range overlaps with an existing booking. Please choose different dates.');
        return;
      }
      onDateChange(checkIn, d);
      setSelectingCheckOut(false);
    }
  };

  // eslint-disable-next-line complexity
  const getDayClass = (date) => {
    const d = date.startOf('day');
    const base = 'w-full aspect-square flex items-center justify-center text-sm transition-all ';

    if (d.isBefore(today)) return base + 'text-slate-300 cursor-not-allowed';

    // Booked dates shown with distinct styling
    if (isDateBooked(d, bookedRanges)) return base + 'bg-red-100 text-red-600/80 cursor-not-allowed line-through';

    // When NOT selecting check-out, dim dates where a full stay can't fit
    if (!selectingCheckOut && accommodationNights > 0 && doesRangeOverlapBookings(d, accommodationNights, bookedRanges)) {
      return base + 'text-slate-300 cursor-not-allowed';
    }

    // When selecting check-out, dim dates beyond the allowed range
    if (selectingCheckOut && checkIn && accommodationNights > 0) {
      const maxCheckOut = checkIn.add(accommodationNights, 'day');
      if (d.isAfter(maxCheckOut)) return base + 'text-slate-300 cursor-not-allowed';
    }

    if (d.month() !== calendarMonth.month()) return base + 'text-slate-400 hover:bg-slate-100 cursor-pointer';

    if (checkIn && d.isSame(checkIn, 'day')) return base + 'bg-duotone-blue text-white font-duotone-bold rounded-l-lg cursor-pointer';
    if (checkOut && d.isSame(checkOut, 'day')) return base + 'bg-duotone-blue text-white font-duotone-bold rounded-r-lg cursor-pointer';
    if (checkIn && checkOut && d.isAfter(checkIn) && d.isBefore(checkOut)) return base + 'bg-duotone-blue/15 text-duotone-blue font-duotone-bold cursor-pointer';

    return base + 'text-slate-800 hover:bg-slate-100 cursor-pointer font-duotone-regular';
  };

  const nights = checkIn && checkOut ? checkOut.diff(checkIn, 'day') : 0;

  if (loadingAvailability) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Spin size="large" />
        <p className="text-slate-500 text-sm font-duotone-regular">Checking availability...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-center">
        <p className="text-slate-600 text-sm font-duotone-regular">
          {accommodationNights > 0
            ? <>Select your check-in date <span className="text-duotone-blue font-duotone-bold">({accommodationNights} nights — check-out auto-calculated)</span></>
            : 'Select your check-in and check-out dates'
          }
        </p>
      </div>

      {bookedRanges.length > 0 && (
        <div className="mb-3 flex items-center justify-center gap-4 text-xs text-slate-500 font-duotone-regular">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" /> Booked
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-duotone-blue" /> Selected
          </span>
        </div>
      )}

      {/* Calendar header */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setCalendarMonth((m) => m.subtract(1, 'month'))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
          <LeftOutlined />
        </button>
        <span className="text-slate-900 font-duotone-bold-extended">{calendarMonth.format('MMMM YYYY')}</span>
        <button type="button" onClick={() => setCalendarMonth((m) => m.add(1, 'month'))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
          <RightOutlined />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <div key={d} className="text-center text-xs text-slate-400 py-1 font-duotone-medium-condensed">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map((date) => (
          <button key={date.format('YYYY-MM-DD')} onClick={() => handleDateClick(date)} className={getDayClass(date)} disabled={isBlocked(date)}>
            {date.date()}
          </button>
        ))}
      </div>

      {/* Selection summary */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {checkIn && <Tag className="!bg-duotone-blue/10 !border-duotone-blue/40 !text-sky-800 !text-xs font-duotone-regular">Check-in: {checkIn.format('DD MMM YYYY')}</Tag>}
        {checkOut && <Tag className="!bg-duotone-blue/10 !border-duotone-blue/40 !text-sky-800 !text-xs font-duotone-regular">Check-out: {checkOut.format('DD MMM YYYY')}</Tag>}
        {nights > 0 && <Tag className="!bg-emerald-50 !border-emerald-200 !text-emerald-800 !text-xs font-duotone-regular">{nights} night{nights > 1 ? 's' : ''}</Tag>}
      </div>

      {selectingCheckOut && checkIn && (
        <p className="text-center text-duotone-blue text-xs mt-2 font-duotone-bold">Now click your check-out date</p>
      )}
    </div>
  );
};

/* ─────────────────────── RentalStep ─────────────────────── */
const RentalStep = ({ checkIn, checkOut, rentalDays, rentalSelections, onRentalChange, rentalServiceName }) => {
  const { message } = App.useApp();
  // Build array of selectable dates: accommodation dates + extra days to cover rental period
  // If rental days > accommodation nights, extend the range before/after
  const selectableDates = useMemo(() => {
    if (!checkIn || !checkOut) return [];
    const accommodationNights = checkOut.diff(checkIn, 'day');
    const dates = [];
    // Start 1 day before check-in to give flexibility
    const extraDaysBefore = rentalDays > accommodationNights ? 1 : 0;
    // Extend after check-out if rental days exceed accommodation nights
    const extraDaysAfter = Math.max(0, rentalDays - accommodationNights);

    let d = checkIn.subtract(extraDaysBefore, 'day');
    const endDate = checkOut.add(extraDaysAfter, 'day');
    while (d.isBefore(endDate)) {
      dates.push(d);
      d = d.add(1, 'day');
    }
    return dates;
  }, [checkIn, checkOut, rentalDays]);

  const selectedCount = rentalSelections.filter(Boolean).length;

  // Initialize rental selections array to match selectable dates length (all unselected)
  useEffect(() => {
    if (selectableDates.length === 0) return;
    // Only initialize if the array length doesn't match (dates changed)
    if (rentalSelections.length !== selectableDates.length) {
      const newSelections = selectableDates.map(() => false);
      onRentalChange(newSelections);
    }
  }, [selectableDates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = (idx) => {
    const newSelections = [...rentalSelections];
    if (newSelections[idx]) {
      // Un-select
      newSelections[idx] = false;
    } else {
      // Can only select up to rentalDays
      if (selectedCount >= rentalDays) {
        message.warning(`You can select up to ${rentalDays} rental day(s) from your package.`);
        return;
      }
      newSelections[idx] = true;
    }
    onRentalChange(newSelections);
  };

  return (
    <div>
      <div className="mb-4 text-center">
        <p className="text-slate-600 text-sm font-duotone-regular">
          Select which days you want equipment rental
        </p>
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
          <Tag className="!bg-orange-50 !border-orange-200 !text-orange-800 !text-xs font-duotone-regular">
            <CarOutlined className="mr-1" />
            {rentalServiceName || 'Equipment Rental'}
          </Tag>
          <Tag className="!bg-slate-100 !border-slate-200 !text-slate-800 !text-xs font-duotone-regular">
            {selectedCount} / {rentalDays} days selected
          </Tag>
        </div>
      </div>

      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {selectableDates.map((date, idx) => {
          const isSelected = !!rentalSelections[idx];
          return (
            <button
              type="button"
              key={date.format('YYYY-MM-DD')}
              onClick={() => toggleDay(idx)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                isSelected
                  ? 'border-orange-300 bg-orange-50 text-orange-900'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3 font-duotone-regular">
                <CalendarOutlined className={isSelected ? 'text-orange-600' : 'text-slate-400'} />
                <span className="font-duotone-bold text-slate-900">{date.format('ddd, DD MMM YYYY')}</span>
              </div>
              {isSelected ? (
                <Tag className="!bg-orange-600 !text-white !border-orange-600 !m-0 font-duotone-bold">Rental</Tag>
              ) : (
                <span className="text-xs text-slate-500 font-duotone-regular">Click to add</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ─────────────────────── LessonStep ─────────────────────── */
const LessonStep = ({
  checkIn,
  checkOut,
  totalHours,
  lessonSchedule,
  onLessonScheduleChange,
  lessonServiceName,
}) => {
  const [instructors, setInstructors] = useState([]);
  const [loadingInstructors, setLoadingInstructors] = useState(true);
  const [slotsCache, setSlotsCache] = useState({}); // { 'YYYY-MM-DD_instructorId': availableStarts[] }
  const slotsCacheRef = useRef(slotsCache);
  slotsCacheRef.current = slotsCache;
  const [loadingSlots, setLoadingSlots] = useState({});
  const [globalInstructorId, setGlobalInstructorId] = useState(null);

  // Build array of dates between check-in and check-out (inclusive)
  // Students can take lessons on arrival day, full days, AND departure day
  const accommodationDates = useMemo(() => {
    if (!checkIn || !checkOut) return [];
    const dates = [];
    let d = checkIn;
    while (d.isSameOrBefore(checkOut, 'day')) {
      dates.push(d);
      d = d.add(1, 'day');
    }
    return dates;
  }, [checkIn, checkOut]);

  // How many 2h lesson blocks in total?
  const totalBlocks = Math.ceil((totalHours || 0) / LESSON_DURATION_HOURS);
  const scheduledBlocks = lessonSchedule.filter((s) => s.instructorId && s.time).length;
  const remainingHours = Math.max(0, (totalHours || 0) - scheduledBlocks * LESSON_DURATION_HOURS);

  // Fetch instructors on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingInstructors(true);
        const data = await getInstructors(true, 'public_booking');
        if (!cancelled) setInstructors(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setInstructors([]);
      } finally {
        if (!cancelled) setLoadingInstructors(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Initialize lesson schedule when dates change
  useEffect(() => {
    if (accommodationDates.length === 0) return;
    // Distribute blocks across days: 1 block (2h) per day until hours run out
    if (lessonSchedule.length === 0) {
      const schedule = [];
      let blocksLeft = totalBlocks;
      for (const date of accommodationDates) {
        if (blocksLeft <= 0) break;
        schedule.push({
          date: date.format('YYYY-MM-DD'),
          instructorId: null,
          time: null,
        });
        blocksLeft--;
      }
      // If more blocks than days, add additional blocks on earlier days
      let dayIdx = 0;
      while (blocksLeft > 0) {
        schedule.push({
          date: accommodationDates[dayIdx % accommodationDates.length].format('YYYY-MM-DD'),
          instructorId: null,
          time: null,
        });
        blocksLeft--;
        dayIdx++;
      }
      onLessonScheduleChange(schedule);
    }
  }, [accommodationDates.length, totalBlocks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch available slots for a given day + instructor
  const fetchSlots = useCallback(async (dateStr, instructorId) => {
    const key = `${dateStr}_${instructorId}`;
    if (slotsCacheRef.current[key]) return; // ref avoids stale closure & unstable callback identity

    setLoadingSlots((prev) => ({ ...prev, [key]: true }));
    try {
      const days = await getAvailableSlots(dateStr, dateStr, { instructorIds: [instructorId] });
      const dayData = Array.isArray(days) && days.length > 0 ? days[0] : null;
      const instrSlots = dayData?.slots?.filter((s) => s.instructorId === instructorId) || [];
      const isToday = dayjs(dateStr).isSame(dayjs(), 'day');
      const starts = computeAvailableStarts(instrSlots, LESSON_DURATION_MINUTES, isToday);

      setSlotsCache((prev) => ({ ...prev, [key]: starts }));
    } catch {
      setSlotsCache((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingSlots((prev) => ({ ...prev, [key]: false }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- dedup check uses slotsCacheRef to avoid re-creating callback on every cache update

  // Auto-fill time for blocks when their slots load after a time was already picked on another block
  useEffect(() => {
    const hasPendingBlock = lessonSchedule.some((b) => !b.time && b.instructorId);
    if (!hasPendingBlock) return;

    const pickedTime = lessonSchedule.find((b) => b.time)?.time;
    if (!pickedTime) return;

    let changed = false;
    const updated = lessonSchedule.map((block) => {
      if (block.time || !block.instructorId) return block;
      const key = `${block.date}_${block.instructorId}`;
      const slots = slotsCache[key];
      if (!slots || slots.length === 0) return block;

      if (slots.some((s) => s.value === pickedTime)) {
        changed = true;
        return { ...block, time: pickedTime };
      }
      const closest = findClosestTime(pickedTime, slots);
      if (!closest) return block;
      changed = true;
      return { ...block, time: closest };
    });
    if (changed) onLessonScheduleChange(updated);
  }, [slotsCache]); // eslint-disable-line react-hooks/exhaustive-deps -- only trigger on new slots arriving; lessonSchedule/onLessonScheduleChange are stable or would cause loops

  const handleGlobalInstructorChange = (instructorId) => {
    setGlobalInstructorId(instructorId || null);
    const updated = lessonSchedule.map((b) => ({ ...b, instructorId: instructorId || null, time: null }));
    onLessonScheduleChange(updated);
    if (instructorId) {
      const uniqueDates = [...new Set(updated.map((b) => b.date))];
      uniqueDates.forEach((dateStr) => fetchSlots(dateStr, instructorId));
    }
  };

  const handleInstructorChange = (blockIdx, instructorId) => {
    // Propagate to all blocks that don't yet have an instructor
    const updated = lessonSchedule.map((block, i) => {
      if (i === blockIdx) return { ...block, instructorId, time: null };
      if (!block.instructorId) return { ...block, instructorId: instructorId || null, time: null };
      return block;
    });
    onLessonScheduleChange(updated);
    if (instructorId) {
      setGlobalInstructorId(instructorId);
      const uniqueDates = [...new Set(updated.filter((b) => b.instructorId === instructorId).map((b) => b.date))];
      uniqueDates.forEach((dateStr) => fetchSlots(dateStr, instructorId));
    }
  };

  const handleTimeChange = (blockIdx, time) => {
    const updated = lessonSchedule.map((block, i) => {
      if (i === blockIdx) return { ...block, time };
      if (!block.time && block.instructorId) {
        const key = `${block.date}_${block.instructorId}`;
        const slots = slotsCache[key];
        if (!slots) return block; // slots not loaded yet — leave null
        if (slots.some((s) => s.value === time)) return { ...block, time };
        const closest = findClosestTime(time, slots);
        return closest ? { ...block, time: closest } : block;
      }
      return block;
    });
    onLessonScheduleChange(updated);
  };

  const addBlock = (dateStr) => {
    const newBlock = { date: dateStr, instructorId: globalInstructorId || null, time: null };
    onLessonScheduleChange([...lessonSchedule, newBlock]);
    if (globalInstructorId) {
      fetchSlots(dateStr, globalInstructorId);
    }
  };

  const removeBlock = (blockIdx) => {
    const updated = lessonSchedule.filter((_, i) => i !== blockIdx);
    onLessonScheduleChange(updated);
  };

  // Group lessons by date
  const groupedByDate = useMemo(() => {
    const groups = {};
    lessonSchedule.forEach((block, idx) => {
      if (!groups[block.date]) groups[block.date] = [];
      groups[block.date].push({ ...block, idx });
    });
    return groups;
  }, [lessonSchedule]);

  if (loadingInstructors) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spin size="large" />
        <span className="ml-3 text-slate-500 font-duotone-regular">Loading instructors...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-center">
        <p className="text-slate-600 text-sm font-duotone-regular">
          Schedule your {LESSON_DURATION_HOURS}h lesson blocks with available instructors
        </p>
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
          <Tag className="!bg-emerald-50 !border-emerald-200 !text-emerald-800 !text-xs font-duotone-regular">
            <BookOutlined className="mr-1" />
            {lessonServiceName || 'Lesson'}
          </Tag>
          <Tag className="!bg-slate-100 !border-slate-200 !text-slate-800 !text-xs font-duotone-regular">
            {scheduledBlocks * LESSON_DURATION_HOURS}h / {totalHours}h scheduled
          </Tag>
          {remainingHours > 0 && (
            <Tag className="!bg-red-50 !border-red-200 !text-red-800 !text-xs font-duotone-regular">
              {remainingHours}h remaining
            </Tag>
          )}
        </div>
      </div>

      {/* Single global instructor selector */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          <UserOutlined className="mr-1" /> Instructor
        </p>
        <Select
          placeholder="Select instructor for all lessons"
          value={globalInstructorId || undefined}
          onChange={handleGlobalInstructorChange}
          className="w-full"
          size="large"
          showSearch
          optionFilterProp="label"
          options={instructors.map((inst) => ({
            value: inst.id,
            label: inst.name || inst.fullName || `${inst.firstName || ''} ${inst.lastName || ''}`.trim() || 'Instructor',
          }))}
        />
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {accommodationDates.map((date) => {
          const dateStr = date.format('YYYY-MM-DD');
          const blocks = groupedByDate[dateStr] || [];
          return (
            <div key={dateStr} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-slate-900 font-duotone-bold text-sm">
                  <CalendarOutlined className="mr-2 text-duotone-blue" />
                  {date.format('ddd, DD MMM YYYY')}
                </span>
                <Button
                  size="small"
                  type="dashed"
                  onClick={() => addBlock(dateStr)}
                  className="!border-slate-300 !text-slate-600 hover:!text-slate-900 hover:!border-duotone-blue"
                >
                  + Add Lesson
                </Button>
              </div>

              {blocks.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-2 font-duotone-regular">No lessons scheduled for this day</p>
              ) : (
                <div className="space-y-2">
                  {blocks.map((block) => {
                    const cacheKey = `${block.date}_${block.instructorId}`;
                    const slots = slotsCache[cacheKey] || [];
                    const isLoadingSlot = !!loadingSlots[cacheKey];

                    return (
                      <div key={block.idx} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-white rounded-lg p-2 border border-slate-100">
                        <div className="flex-1 min-w-0">
                          {!globalInstructorId ? (
                            <span className="text-slate-400 text-xs px-2 font-duotone-regular">Pick an instructor above first</span>
                          ) : isLoadingSlot ? (
                            <div className="flex items-center gap-2 text-slate-500 text-xs px-2 font-duotone-regular">
                              <Spin size="small" /> Loading times...
                            </div>
                          ) : slots.length > 0 ? (
                            <Select
                              placeholder="Select time"
                              value={block.time || undefined}
                              onChange={(val) => handleTimeChange(block.idx, val)}
                              className="w-full [&_.ant-select-selector]:!bg-white [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selection-item]:!text-slate-900 [&_.ant-select-selection-placeholder]:!text-slate-400"
                              suffixIcon={<ClockCircleOutlined className="text-slate-400" />}
                              options={slots.map((s) => ({
                                value: s.value,
                                label: s.label,
                              }))}
                            />
                          ) : (
                            <span className="text-red-600 text-xs px-2 font-duotone-regular">No available slots</span>
                          )}
                        </div>
                        <Tooltip title="Remove this lesson block">
                          <Button
                            size="small"
                            danger
                            type="text"
                            onClick={() => removeBlock(block.idx)}
                            className="!text-red-600 hover:!text-red-700 flex-shrink-0"
                          >
                            ✕
                          </Button>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ─────────────────────── PaymentStep ─────────────────────── */
// eslint-disable-next-line complexity
const PaymentStep = ({
  selectedPackage,
  walletBalance,
  selectedPaymentMethod,
  onPaymentMethodChange,
  appliedVoucher,
  onVoucherApplied,
  onVoucherRemoved,
  isTrustedCustomer,
  formatCurrency,
  userCurrency,
  getDisplayPrice,
  isPurchasing = false,
}) => {
  const packagePriceEur = Number(selectedPackage?.price) || 0;
  const voucherServiceId =
    selectedPackage?.id != null && VOUCHER_SERVICE_UUID_RE.test(String(selectedPackage.id))
      ? String(selectedPackage.id)
      : undefined;

  return (
    <div className="space-y-5">
      {/* Price summary card */}
      <div className="rounded-2xl border border-[rgba(30,58,138,0.35)] bg-gradient-to-br from-duotone-blue/10 to-duotone-blue/5 p-4">
        <p className="text-xs font-duotone-bold-extended uppercase tracking-wider text-slate-600 mb-1">Total Price</p>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-2xl font-duotone-bold text-slate-900">{getDisplayPrice()}</span>
          {appliedVoucher && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-duotone-bold">
              <CheckCircleOutlined className="text-[10px]" /> Discount Applied
            </span>
          )}
        </div>
      </div>

      {/* Promo Code */}
      <div>
        <p className="text-xs font-duotone-bold-extended uppercase tracking-wider text-slate-500 mb-2">Promo Code</p>
        <PromoCodeInput
          variant="light"
          context="packages"
          amount={packagePriceEur}
          currency="EUR"
          serviceId={voucherServiceId}
          appliedVoucher={appliedVoucher}
          onValidCode={onVoucherApplied}
          onClear={onVoucherRemoved}
          disabled={isPurchasing}
        />
      </div>

      {/* Payment Method — card buttons like QuickBookingModal */}
      <div>
        <p className="text-xs font-duotone-bold-extended uppercase tracking-wider text-slate-500 mb-2">Payment Method</p>
        <div className={`grid gap-2 ${isTrustedCustomer ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {/* Wallet */}
          <button
            type="button"
            onClick={() => onPaymentMethodChange('wallet')}
            className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all text-center ${
              selectedPaymentMethod === 'wallet'
                ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-500/15'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
            }`}
          >
            {selectedPaymentMethod === 'wallet' && (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                <CheckCircleOutlined className="text-white text-[8px]" />
              </div>
            )}
            <WalletOutlined className={`text-xl ${selectedPaymentMethod === 'wallet' ? 'text-blue-600' : 'text-slate-500'}`} />
            <span className={`text-sm font-duotone-bold ${selectedPaymentMethod === 'wallet' ? 'text-blue-800' : 'text-slate-700'}`}>Wallet</span>
            <span className={`text-[10px] font-duotone-regular ${selectedPaymentMethod === 'wallet' ? 'text-blue-700' : 'text-slate-600'}`}>
              {formatCurrency(walletBalance, userCurrency)}
            </span>
          </button>

          {/* Card (Iyzico) */}
          <button
            type="button"
            onClick={() => onPaymentMethodChange('credit_card')}
            className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all text-center ${
              selectedPaymentMethod === 'credit_card'
                ? 'border-purple-500 bg-purple-50 shadow-md shadow-purple-500/15'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
            }`}
          >
            {selectedPaymentMethod === 'credit_card' && (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center">
                <CheckCircleOutlined className="text-white text-[8px]" />
              </div>
            )}
            <CreditCardOutlined className={`text-xl ${selectedPaymentMethod === 'credit_card' ? 'text-purple-600' : 'text-slate-500'}`} />
            <span className={`text-sm font-duotone-bold ${selectedPaymentMethod === 'credit_card' ? 'text-purple-900' : 'text-slate-700'}`}>Card</span>
            <span className={`text-[10px] font-duotone-regular ${selectedPaymentMethod === 'credit_card' ? 'text-purple-800' : 'text-slate-600'}`}>
              Credit / Debit Card
            </span>
          </button>

          {/* Pay Later — trusted only */}
          {isTrustedCustomer && (
            <button
              type="button"
              onClick={() => onPaymentMethodChange('pay_later')}
              className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all text-center ${
                selectedPaymentMethod === 'pay_later'
                  ? 'border-orange-500 bg-orange-50 shadow-md shadow-orange-500/15'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
              }`}
            >
              {selectedPaymentMethod === 'pay_later' && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-orange-600 flex items-center justify-center">
                  <CheckCircleOutlined className="text-white text-[8px]" />
                </div>
              )}
              <CalendarOutlined className={`text-xl ${selectedPaymentMethod === 'pay_later' ? 'text-orange-600' : 'text-slate-500'}`} />
              <span className={`text-sm font-duotone-bold ${selectedPaymentMethod === 'pay_later' ? 'text-orange-900' : 'text-slate-700'}`}>Pay Later</span>
              <span className={`text-[10px] font-duotone-regular ${selectedPaymentMethod === 'pay_later' ? 'text-orange-800' : 'text-slate-600'}`}>
                At the center
              </span>
            </button>
          )}
        </div>
      </div>


    </div>
  );
};

/* ═══════════════════════ MAIN MODAL ═══════════════════════ */
// eslint-disable-next-line complexity
const AllInclusiveBookingModal = ({
  open,
  onCancel,
  selectedPackage,
  walletBalance = 0,
  onPurchase,
  isPurchasing = false,
}) => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { userCurrency, formatCurrency, convertCurrency } = useCurrency();

  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Dates
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);

  // Accommodation availability
  const [bookedRanges, setBookedRanges] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [initialCalendarMonth, setInitialCalendarMonth] = useState(null);
  const [unitUnavailable, setUnitUnavailable] = useState(false);

  // Step 2: Rentals
  const [rentalSelections, setRentalSelections] = useState([]);

  // Step 3: Lessons
  const [lessonSchedule, setLessonSchedule] = useState([]);

  // Step 4: Payment
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('wallet');
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  // Package properties
  const accommodationNights = Number(selectedPackage?.accommodationNights || selectedPackage?.accommodation_nights || 0);
  const rentalDays = Number(selectedPackage?.rentalDays || selectedPackage?.rental_days || 0);
  const totalHours = Number(selectedPackage?.totalHours || selectedPackage?.total_hours || 0);
  const includesLessons = selectedPackage?.includesLessons !== false && totalHours > 0;
  const includesRental = !!selectedPackage?.includesRental && rentalDays > 0;
  const includesAccommodation = !!selectedPackage?.includesAccommodation;
  const rentalServiceName = selectedPackage?.rentalServiceName || selectedPackage?.rental_service_name || 'Equipment Rental';
  const lessonServiceName = selectedPackage?.lessonServiceName || selectedPackage?.lesson_service_name || 'Lesson';

  // Determine which steps to show based on package contents
  const steps = useMemo(() => {
    const s = [];
    if (includesAccommodation) s.push({ key: 'dates', title: 'Dates', icon: <CalendarOutlined /> });
    if (includesRental) s.push({ key: 'rentals', title: 'Rentals', icon: <CarOutlined /> });
    if (includesLessons) s.push({ key: 'lessons', title: 'Lessons', icon: <BookOutlined /> });
    s.push({ key: 'payment', title: 'Payment', icon: <WalletOutlined /> });
    return s;
  }, [includesAccommodation, includesRental, includesLessons]);

  const currentStepKey = steps[currentStep]?.key;

  // Trusted customer check
  const isTrustedCustomer = useMemo(() => {
    if (!user?.role) return false;
    return PAY_AT_CENTER_ALLOWED_ROLES.includes(user.role);
  }, [user?.role]);

  // Get display price (dual: EUR first, then local currency)
  const getDisplayPrice = useCallback(() => {
    const eurBase = Number(selectedPackage?.price) || 0;
    const disc = appliedVoucher?.discount;
    let eurFinal = eurBase;
    if (disc && typeof disc.finalAmount === 'number') {
      eurFinal = disc.finalAmount;
    }
    const eurFormatted = formatCurrency(eurFinal, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const { price, currency } = getPackagePriceInCurrency(selectedPackage, userCurrency, convertCurrency);
    if (currency === 'EUR') return eurFormatted;
    let localFinal = price;
    if (disc && typeof disc.finalAmount === 'number' && eurBase > 0) {
      localFinal = price * (disc.finalAmount / eurBase);
    }
    return `${eurFormatted} (~${formatCurrency(localFinal, currency)})`;
  }, [selectedPackage, userCurrency, convertCurrency, appliedVoucher, formatCurrency]);

  // Fetch accommodation unit availability when modal opens
  useEffect(() => {
    if (!open || !includesAccommodation) return;

    const unitId = selectedPackage?.accommodationUnitId || selectedPackage?.accommodation_unit_id;
    if (!unitId) {
      setUnitUnavailable(true);
      setLoadingAvailability(false);
      return;
    }

    let cancelled = false;
    setLoadingAvailability(true);
    setUnitUnavailable(false);

    (async () => {
      try {
        const unitData = await getAccommodationUnit(unitId);

        if (cancelled) return;

        // Check if unit is available
        if (unitData.status && unitData.status !== 'Available') {
          setUnitUnavailable(true);
          setLoadingAvailability(false);
          return;
        }

        // Parse booked ranges from the unit's upcoming bookings (future only)
        const bookings = unitData.upcoming_bookings || unitData.bookings || [];
        const ranges = bookings
          .filter((b) => b.status !== 'cancelled' && b.status !== 'completed')
          .map((b) => ({
            checkIn: dayjs(b.check_in_date).startOf('day'),
            checkOut: dayjs(b.check_out_date).startOf('day'),
          }));

        setBookedRanges(ranges);

        // Find first available date and set calendar to that month
        const firstAvailable = findFirstAvailableDate(ranges, accommodationNights || 1);
        setInitialCalendarMonth(firstAvailable.startOf('month'));
        setLoadingAvailability(false);
      } catch {
        if (!cancelled) {
          // Availability fetch failed — fall back to showing all dates
          setBookedRanges([]);
          setInitialCalendarMonth(dayjs().startOf('month'));
          setLoadingAvailability(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [open, includesAccommodation, selectedPackage?.accommodationUnitId, selectedPackage?.accommodation_unit_id, accommodationNights]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setCheckIn(null);
      setCheckOut(null);
      setRentalSelections([]);
      setLessonSchedule([]);
      setSelectedPaymentMethod('wallet');
      setAppliedVoucher(null);
      setBookedRanges([]);
      setInitialCalendarMonth(null);
      setUnitUnavailable(false);
    }
  }, [open]);

  // Validation per step
  const canAdvanceFromStep = (stepKey) => {
    switch (stepKey) {
      case 'dates':
        if (!checkIn || !checkOut) {
          message.warning('Please select both check-in and check-out dates.');
          return false;
        }
        if (accommodationNights > 0) {
          const selectedNights = checkOut.diff(checkIn, 'day');
          if (selectedNights !== accommodationNights) {
            message.warning(`Your package includes exactly ${accommodationNights} night(s). Please select ${accommodationNights} night(s).`);
            return false;
          }
        }
        return true;

      case 'rentals': {
        const selectedCount = rentalSelections.filter(Boolean).length;
        if (selectedCount === 0) {
          message.warning('Please select at least one rental day.');
          return false;
        }
        return true;
      }

      case 'lessons': {
        const scheduled = lessonSchedule.filter((s) => s.instructorId && s.time).length;
        const totalBlocks = Math.ceil(totalHours / LESSON_DURATION_HOURS);
        if (scheduled < totalBlocks) {
          message.warning(`Please schedule all ${totalBlocks} lesson block(s) (${totalHours}h total). You have ${scheduled} scheduled.`);
          return false;
        }
        return true;
      }

      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!canAdvanceFromStep(currentStepKey)) return;
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const handlePrev = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const handlePurchase = async () => {
    // Build rental dates array
    const rentalDatesArray = [];
    if (includesRental && checkIn) {
      rentalSelections.forEach((selected, idx) => {
        if (selected) {
          rentalDatesArray.push(checkIn.add(idx, 'day').format('YYYY-MM-DD'));
        }
      });
    }

    // Build lesson bookings array
    const lessonBookings = lessonSchedule
      .filter((s) => s.instructorId && s.time)
      .map((s) => ({
        date: s.date,
        instructorId: s.instructorId,
        startTime: s.time,
        duration: LESSON_DURATION_HOURS,
      }));

    onPurchase({
      packageId: selectedPackage.id,
      paymentMethod: selectedPaymentMethod,
      checkInDate: checkIn?.format('YYYY-MM-DD'),
      checkOutDate: checkOut?.format('YYYY-MM-DD'),
      voucherId: appliedVoucher?.id,
      rentalDates: rentalDatesArray,
      lessonBookings,
    });
  };

  const brandModalContentStyle = {
    background: 'rgba(255,255,255,0.98)',
    border: '1px solid rgba(30,58,138,0.5)',
    borderRadius: 24,
    boxShadow: '0 20px 40px -12px rgba(30,58,138,0.25)',
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-3 text-slate-900 font-duotone-bold text-base">
          <ShoppingOutlined className="text-duotone-blue text-lg" />
          <span>Book All-Inclusive Package</span>
        </div>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={640}
      destroyOnHidden
      className="all-inclusive-modal"
      styles={{
        content: brandModalContentStyle,
        header: { background: 'transparent', borderBottom: '1px solid #e2e8f0', marginBottom: 0, paddingBottom: 16 },
      }}
    >
      {selectedPackage && (
        <div>
          {/* Package summary bar */}
          <div className="mb-4 p-3 rounded-xl border border-[rgba(30,58,138,0.25)] bg-duotone-blue/5 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-slate-900 font-duotone-bold text-sm">{selectedPackage.name}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {includesLessons && <Tag className="!bg-emerald-50 !border-emerald-200 !text-emerald-800 !text-xs font-duotone-regular">Lessons {totalHours}h</Tag>}
                {includesRental && <Tag className="!bg-orange-50 !border-orange-200 !text-orange-800 !text-xs font-duotone-regular">Rental {rentalDays}d</Tag>}
                {includesAccommodation && <Tag className="!bg-sky-50 !border-sky-200 !text-sky-800 !text-xs font-duotone-regular">Stay {accommodationNights}n</Tag>}
              </div>
            </div>
            <span className="text-duotone-blue font-duotone-bold text-lg">{getDisplayPrice()}</span>
          </div>

          {/* Unit unavailable alert */}
          {unitUnavailable && includesAccommodation && (
            <Alert
              type="error"
              showIcon
              className="mb-4 !rounded-xl"
              message="Accommodation Unavailable"
              description="The accommodation unit linked to this package is currently unavailable. Please contact support or try a different package."
            />
          )}

          {/* Step indicator */}
          <Steps
            current={currentStep}
            size="small"
            className="mb-6 [&_.ant-steps-item-title]:!text-slate-500 [&_.ant-steps-item-active_.ant-steps-item-title]:!text-duotone-blue [&_.ant-steps-item-finish_.ant-steps-item-title]:!text-emerald-600 [&_.ant-steps-item-wait_.ant-steps-item-icon]:!border-slate-300 [&_.ant-steps-item-wait_.ant-steps-item-icon]:!text-slate-400 [&_.ant-steps-item-finish_.ant-steps-item-icon]:!border-emerald-500 [&_.ant-steps-item-finish_.ant-steps-item-icon]:!text-emerald-600 [&_.ant-steps-item-process_.ant-steps-item-icon]:!border-duotone-blue [&_.ant-steps-item-process_.ant-steps-item-icon]:!text-duotone-blue [&_.ant-steps-item-tail::after]:!bg-slate-200"
            items={steps.map((s) => ({ title: s.title, icon: s.icon }))}
          />

          {/* Step content */}
          <div className="min-h-[300px]">
            {currentStepKey === 'dates' && (
              <DateStep
                checkIn={checkIn}
                checkOut={checkOut}
                onDateChange={(ci, co) => { setCheckIn(ci); setCheckOut(co); }}
                accommodationNights={accommodationNights}
                bookedRanges={bookedRanges}
                loadingAvailability={loadingAvailability}
                initialMonth={initialCalendarMonth}
              />
            )}

            {currentStepKey === 'rentals' && (
              <RentalStep
                checkIn={checkIn}
                checkOut={checkOut}
                rentalDays={rentalDays}
                rentalSelections={rentalSelections}
                onRentalChange={setRentalSelections}
                rentalServiceName={rentalServiceName}
              />
            )}

            {currentStepKey === 'lessons' && (
              <LessonStep
                checkIn={checkIn}
                checkOut={checkOut}
                totalHours={totalHours}
                lessonSchedule={lessonSchedule}
                onLessonScheduleChange={setLessonSchedule}
                lessonServiceName={lessonServiceName}
              />
            )}

            {currentStepKey === 'payment' && includesLessons && !selectedPackage?.lessonServiceId && (
              <Alert
                type="warning"
                showIcon
                className="mb-4 !rounded-xl"
                message="Lesson service not configured"
                description="This package does not have a lesson service linked. Your lesson schedule will be saved but lesson bookings may not be created automatically. Please contact staff to confirm your lessons."
              />
            )}

            {currentStepKey === 'payment' && (
              <PaymentStep
                selectedPackage={selectedPackage}
                walletBalance={walletBalance}
                selectedPaymentMethod={selectedPaymentMethod}
                onPaymentMethodChange={setSelectedPaymentMethod}
                appliedVoucher={appliedVoucher}
                onVoucherApplied={setAppliedVoucher}
                onVoucherRemoved={() => setAppliedVoucher(null)}
                isTrustedCustomer={isTrustedCustomer}
                formatCurrency={formatCurrency}
                userCurrency={userCurrency}
                getDisplayPrice={getDisplayPrice}
                isPurchasing={isPurchasing}
              />
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
            <Button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="!border-slate-300 !text-slate-600 hover:!text-slate-900 hover:!border-slate-400 font-duotone-regular"
              icon={<LeftOutlined />}
            >
              Back
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button
                type="primary"
                onClick={handleNext}
                className="!bg-duotone-blue !border-duotone-blue hover:!bg-sky-600 hover:!border-sky-600 !text-white !font-duotone-bold"
                icon={<RightOutlined />}
                iconPosition="end"
              >
                Next
              </Button>
            ) : (
              <Button
                type="primary"
                size="large"
                loading={isPurchasing}
                onClick={() => {
                  Modal.confirm({
                    title: <span className="text-slate-900 font-duotone-bold">Confirm Purchase</span>,
                    icon: <CheckCircleOutlined className="text-duotone-blue" />,
                    content: (
                      <div className="mt-2 space-y-2 font-duotone-regular text-slate-600">
                        <p className="text-slate-900 font-duotone-bold">{selectedPackage?.name}</p>
                        <p className="text-lg font-duotone-bold text-slate-900">{getDisplayPrice()}</p>
                        {checkIn && checkOut && (
                          <p className="text-slate-500 text-sm">
                            Dates: {checkIn.format('DD MMM')} — {checkOut.format('DD MMM YYYY')}
                          </p>
                        )}
                        <p className="text-slate-500 text-sm">
                          Payment: {selectedPaymentMethod === 'wallet' ? 'Wallet' : selectedPaymentMethod === 'credit_card' ? 'Card' : 'Pay Later'}
                        </p>
                      </div>
                    ),
                    okText: 'Confirm & Pay',
                    cancelText: 'Go Back',
                    centered: true,
                    onOk: handlePurchase,
                    styles: {
                      content: brandModalContentStyle,
                      header: { background: 'transparent', borderBottom: '1px solid #e2e8f0' },
                    },
                    okButtonProps: { className: '!bg-duotone-blue !border-duotone-blue hover:!bg-sky-600 !text-white font-duotone-bold' },
                    cancelButtonProps: { className: '!text-slate-600 !border-slate-300 font-duotone-regular' },
                  });
                }}
                className="!bg-duotone-blue !border-duotone-blue hover:!bg-sky-600 hover:!border-sky-600 !text-white !font-duotone-bold"
                icon={<CheckCircleOutlined />}
              >
                Complete Purchase
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AllInclusiveBookingModal;
