import { useEffect, useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { App, DatePicker, Modal, Spin, Form, Input, Alert } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { useOutletContext, useSearchParams } from 'react-router-dom';

const StudentGroupBookingsPage = lazy(() => import('@/features/bookings/pages/StudentGroupBookingsPage'));
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useStudentSchedule } from '../hooks/useStudentDashboard';
import { useStudentBookingMutation } from '../hooks/useStudentMutations';
import { getAvailableSlots } from '@/features/bookings/components/api/calendarApi';
import calendarConfig from '@/config/calendarConfig';

/* ── Helpers ── */

const HALF_HOUR_MINUTES = 30;

// Preset lesson blocks from config — the only slots students can book
const PRESET_SLOTS = calendarConfig.preScheduledSlots;
const PRESET_SLOT_STARTS = PRESET_SLOTS.map((s) => s.start);

const timeStringToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const minutesToTimeString = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

/**
 * Compute available preset lesson blocks for an instructor on a given date.
 * Only returns the 4 standard blocks (09:00, 11:30, 14:00, 16:30) that have
 * ALL required 30-min sub-slots marked as 'available' by the backend.
 */
const computeAvailableStarts = (slots, durationMinutes, isToday) => {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  const stepsRequired = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  const slotByTime = new Map(slots.map((s) => [s.time, s]));
  const nowMinutes = isToday ? (dayjs().hour() * 60 + dayjs().minute()) : null;
  const results = [];

  for (const preset of PRESET_SLOTS) {
    const startMinutes = timeStringToMinutes(preset.start);
    if (startMinutes === null) continue;
    // Skip past slots on today
    if (nowMinutes !== null && startMinutes < nowMinutes + 30) continue;
    // Verify every 30-min sub-slot is available
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
      results.push({ value: preset.start, label: `${preset.start} – ${preset.end}` });
    }
  }
  return results;
};

const formatTimeRange = (startIso, endIso) => {
  if (!startIso) return 'TBD';
  const start = dayjs(startIso);
  const end = endIso ? dayjs(endIso) : start.add(1, 'hour');
  return `${start.format('HH:mm')} – ${end.format('HH:mm')}`;
};

const pickFirst = (...values) => {
  for (const v of values) if (v !== undefined && v !== null && v !== '') return v;
  return null;
};

const resolveLessonName = (l) => pickFirst(l?.service?.name, l?.lessonType, 'Lesson');
const resolveInstructorName = (l) => pickFirst(l?.instructor?.name, l?.instructorName, 'TBD');
const resolveStatus = (l) => pickFirst(l?.status, 'scheduled');
const resolveNotes = (l) => pickFirst(l?.notes, '');
const resolveIdentifier = (l, name) => pickFirst(l?.bookingId, l?.id, l?.startTime, l?.date, name, 'lesson');

const resolveDateLabel = (l) => {
  const raw = pickFirst(l?.startTime, l?.date);
  return raw ? dayjs(raw).format('dddd, MMM D') : 'TBD';
};

const getLessonCardMeta = (lesson) => {
  const lessonName = resolveLessonName(lesson);
  const notes = resolveNotes(lesson);
  return {
    id: resolveIdentifier(lesson, lessonName),
    dateLabel: resolveDateLabel(lesson),
    timeLabel: formatTimeRange(lesson?.startTime, lesson?.endTime),
    lessonName,
    instructorName: resolveInstructorName(lesson),
    status: resolveStatus(lesson),
    hasNotes: Boolean(notes),
    notes,
  };
};

/* ── Status badge ── */
const STATUS_STYLE = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  scheduled: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  pending:   { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.scheduled;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-gotham-medium uppercase tracking-wider ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
};

/* ── Lesson detail modal ── */
const DETAIL_STATUS = {
  completed: { accent: '#10b981', label: 'Completed', icon: '✓' },
  scheduled: { accent: '#00a8c4', label: 'Scheduled', icon: '◉' },
  pending:   { accent: '#f59e0b', label: 'Pending',   icon: '◷' },
  cancelled: { accent: '#ef4444', label: 'Cancelled', icon: '✕' },
  confirmed: { accent: '#00a8c4', label: 'Confirmed', icon: '✓' },
};

const LessonDetailModal = ({ open, lesson, meta, onClose, onReschedule }) => {
  if (!lesson || !meta) return null;
  const canReschedule = meta.status !== 'completed' && meta.status !== 'cancelled';
  const ds = DETAIL_STATUS[meta.status] || DETAIL_STATUS.scheduled;
  const instructorInitial = (meta.instructorName || 'I')[0].toUpperCase();

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      onCancel={onClose}
      width={380}
      centered
      closable={false}
      styles={{
        body: { padding: 0 },
        content: {
          borderRadius: 24,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.03)',
        },
      }}
    >
      {/* ── Accent header ── */}
      <div className="relative pt-7 pb-5 px-6 text-center" style={{ background: `linear-gradient(135deg, ${ds.accent}08, ${ds.accent}04)` }}>
        {/* Close */}
        <button
          type="button" onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/80 backdrop-blur border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {/* Time hero */}
        <p className="text-2xl font-duotone-bold-extended text-slate-900 tabular-nums tracking-tight">{meta.timeLabel}</p>
        <p className="text-sm text-slate-500 mt-0.5 font-gotham-medium">{meta.dateLabel}</p>

        {/* Status chip */}
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 border" style={{ borderColor: `${ds.accent}30`, background: `${ds.accent}0a` }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: ds.accent }} />
          <span className="text-[10px] font-gotham-medium uppercase tracking-widest" style={{ color: ds.accent }}>{ds.label}</span>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

      {/* ── Body ── */}
      <div className="px-6 py-5 space-y-4">
        {/* Lesson name */}
        <div>
          <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-1">Lesson</p>
          <p className="text-[15px] font-duotone-bold text-slate-900">{meta.lessonName}</p>
        </div>

        {/* Instructor row */}
        <div className="flex items-center gap-3">
          {lesson.instructor?.avatar ? (
            <img src={lesson.instructor.avatar} alt={meta.instructorName} className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-duotone-blue to-cyan-600 flex items-center justify-center ring-2 ring-white shadow-sm">
              <span className="text-xs font-duotone-bold text-white">{instructorInitial}</span>
            </div>
          )}
          <div>
            <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Instructor</p>
            <p className="text-sm font-gotham-medium text-slate-800">{meta.instructorName}</p>
          </div>
        </div>

        {/* Duration */}
        {lesson.duration && (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-4 py-2.5">
            <span className="text-xs text-slate-500 font-gotham-medium">Duration</span>
            <span className="text-sm font-duotone-bold text-slate-900">{lesson.duration}h</span>
          </div>
        )}

        {/* Notes */}
        {meta.hasNotes && (
          <div className="rounded-xl bg-amber-50/60 border border-amber-200/50 px-4 py-3">
            <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-amber-600/80 mb-1">Notes</p>
            <p className="text-sm text-slate-700 leading-relaxed">{meta.notes}</p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-6 pb-6 space-y-2">
        {canReschedule && (
          <button
            type="button"
            onClick={() => { onClose(); onReschedule(lesson); }}
            className="group w-full h-11 rounded-2xl text-sm font-duotone-bold tracking-wide text-white overflow-hidden transition-all"
            style={{ background: 'linear-gradient(135deg, #00a8c4, #0891b2)', boxShadow: '0 4px 14px rgba(0,168,196,0.25)' }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <CalendarOutlined />
              Request Reschedule
            </span>
          </button>
        )}
        <button
          type="button" onClick={onClose}
          className="w-full py-2 text-sm font-gotham-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

/* ── Lesson row ── */
const LessonRow = ({ lesson, meta, onRowClick, enableActions, onAction, isFirst }) => {
  const disableReschedule = meta.status === 'completed';

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 hover:bg-slate-50/80 transition-colors cursor-pointer ${isFirst ? 'bg-duotone-blue/[0.03]' : ''}`}
      onClick={() => onRowClick(lesson, meta)}
    >
      {/* Date + time — primary info */}
      <div className="shrink-0 w-[130px]">
        <span className="block text-sm font-duotone-bold text-slate-900 tabular-nums">{meta.timeLabel}</span>
        <span className="block text-[11px] text-slate-500">{meta.dateLabel}</span>
      </div>

      {/* Lesson + instructor — secondary */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="min-w-0">
          <span className="block text-sm text-slate-700 truncate">{meta.lessonName}</span>
          <span className="block text-[11px] text-slate-400 truncate">
            {meta.instructorName}
            {meta.hasNotes && <> — <span className="italic">{meta.notes}</span></>}
          </span>
        </div>
        {isFirst && <span className="shrink-0 rounded bg-duotone-blue px-1.5 py-px text-[8px] font-gotham-medium uppercase tracking-wider text-white leading-normal">Next</span>}
      </div>

      {/* Status */}
      <StatusBadge status={meta.status} />

      {/* Reschedule only — no cancel for students */}
      {enableActions && (
        <div className="shrink-0 hidden sm:flex items-center">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAction('reschedule', lesson); }}
            disabled={disableReschedule}
            className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-gotham-medium text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Reschedule
          </button>
        </div>
      )}
    </div>
  );
};

/* ── Lessons list ── */
const LessonsList = ({ lessons, loading, emptyMessage, enableActions, onAction, onRowClick, markFirst }) => {
  const rows = Array.isArray(lessons) ? lessons.map((l) => ({ lesson: l, meta: getLessonCardMeta(l) })) : [];

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-5 w-5 border-2 border-slate-200 border-t-duotone-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-center text-sm text-slate-400 py-8">{emptyMessage}</p>;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
      {rows.map(({ lesson, meta }, i) => (
        <LessonRow
          key={meta.id}
          lesson={lesson}
          meta={meta}
          enableActions={enableActions}
          onAction={onAction}
          onRowClick={onRowClick}
          isFirst={markFirst && i === 0}
        />
      ))}
    </div>
  );
};

/* ── Reschedule modal ── */
const RescheduleModal = ({ open, booking, onClose, onSubmit, submitting }) => {
  const [form] = Form.useForm();
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  const instructorId = booking?.instructor?.id || booking?.instructorId || booking?.instructor_user_id;
  const bookingDurationHours = Number(booking?.duration) || 2;
  const lessonDuration = bookingDurationHours * 60;
  const lessonName = booking?.service?.name || booking?.lessonType || 'Lesson';
  const instructorName = booking?.instructor?.name || booking?.instructorName || 'your instructor';
  const selectedDateString = selectedDate?.isValid() ? selectedDate.format('YYYY-MM-DD') : null;

  const { data: availabilityData = [], isFetching: availabilityLoading } = useQuery({
    queryKey: ['reschedule', 'availability', selectedDateString, instructorId],
    queryFn: async () => {
      if (!selectedDateString || !instructorId) return [];
      const filters = { instructorIds: [instructorId] };
      const days = await getAvailableSlots(selectedDateString, selectedDateString, filters);
      return Array.isArray(days) ? days : [];
    },
    enabled: open && !!selectedDateString && !!instructorId,
    staleTime: 60_000,
  });

  const availableStarts = useMemo(() => {
    if (!selectedDateString || !instructorId) return [];
    const dayEntry = availabilityData.find((d) => d.date === selectedDateString);
    if (!dayEntry || !Array.isArray(dayEntry.slots)) return [];
    const instructorSlots = dayEntry.slots.filter((s) => String(s.instructorId) === String(instructorId));
    const isToday = selectedDate?.isSame(dayjs(), 'day') ?? false;
    return computeAvailableStarts(instructorSlots, lessonDuration, isToday);
  }, [availabilityData, selectedDateString, instructorId, lessonDuration, selectedDate]);

  useEffect(() => {
    if (open && booking) {
      const currentDate = booking.startTime ? dayjs(booking.startTime) : booking.date ? dayjs(booking.date) : null;
      setSelectedDate(currentDate);
      setSelectedTime(null);
      setTimeout(() => form.setFieldsValue({ reason: '' }), 0);
    } else if (!open) {
      setSelectedDate(null);
      setSelectedTime(null);
    }
  }, [open, booking, form]);

  useEffect(() => {
    if (selectedTime && !availableStarts.some((e) => e.value === selectedTime)) setSelectedTime(null);
  }, [availableStarts, selectedTime]);

  const handleDateChange = useCallback((date) => { setSelectedDate(date); setSelectedTime(null); }, []);

  const handleSubmit = useCallback((values) => {
    if (!selectedDate || !selectedTime) return;
    const [hours, minutes] = selectedTime.split(':').map(Number);
    onSubmit({ newDateTime: selectedDate.hour(hours).minute(minutes), newStartHour: hours + minutes / 60, reason: values.reason || '' });
  }, [selectedDate, selectedTime, onSubmit]);

  const disabledDate = useCallback((current) => current && current.isBefore(dayjs().startOf('day')), []);
  const canSubmit = selectedDate && selectedTime && !submitting;

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-duotone-blue text-white shadow-sm">
            <CalendarOutlined className="text-base" />
          </span>
          <div>
            <h3 className="text-base font-duotone-bold text-slate-900">Request Reschedule</h3>
            <p className="text-xs text-slate-500 font-normal">Choose a new date and time</p>
          </div>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={520}
      footer={
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            <CheckCircleOutlined className="text-emerald-500 mr-1" />
            Manager will confirm your request
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-gotham-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => form.submit()}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg text-sm font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending...' : 'Request Reschedule'}
            </button>
          </div>
        </div>
      }
      styles={{
        header: { padding: '16px 20px 12px', borderBottom: '1px solid #e2e8f0' },
        body: { padding: '16px 20px' },
        footer: { padding: '12px 20px 16px', borderTop: '1px solid #e2e8f0' },
      }}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-[10px] font-gotham-medium text-slate-400 uppercase tracking-wider mb-2">Current Booking</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-duotone-bold text-slate-900">{lessonName}</p>
              <p className="text-xs text-slate-500">with {instructorName}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-gotham-medium text-slate-700">{booking?.date ? dayjs(booking.date).format('MMM D, YYYY') : 'TBD'}</p>
              <p className="text-xs text-slate-500">{booking?.startTime ? dayjs(booking.startTime).format('HH:mm') : 'TBD'}</p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-gotham-medium text-slate-700 mb-2">Select New Date</label>
          <DatePicker value={selectedDate} onChange={handleDateChange} disabledDate={disabledDate} className="w-full" format="dddd, MMMM D, YYYY" placeholder="Pick a date" size="large" />
        </div>

        {selectedDate && (
          <div className="mb-4">
            <label className="block text-sm font-gotham-medium text-slate-700 mb-2">
              <ClockIcon className="inline h-4 w-4 mr-1" />
              Available Time Slots
              {availabilityLoading && <Spin size="small" className="ml-2" />}
            </label>
            {availabilityLoading ? (
              <div className="flex justify-center py-6 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-center">
                  <Spin size="default" />
                  <p className="mt-2 text-xs text-slate-500">Checking availability...</p>
                </div>
              </div>
            ) : availableStarts.length === 0 ? (
              <Alert type="warning" showIcon message="No available slots" description={`${instructorName} has no available slots on ${selectedDate.format('MMM D')}. Try a different date.`} className="rounded-xl" />
            ) : (
              <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-xl">
                <p className="text-xs text-sky-700 mb-3 font-gotham-medium">
                  {availableStarts.length} slot{availableStarts.length > 1 ? 's' : ''} available
                </p>
                <div className="grid gap-2 grid-cols-2">
                  {availableStarts.map((slot) => (
                    <button
                      key={slot.value} type="button" onClick={() => setSelectedTime(slot.value)}
                      className={`px-3 py-2.5 border-2 rounded-xl text-sm font-gotham-medium transition-all duration-150 ${
                        selectedTime === slot.value
                          ? 'bg-duotone-blue text-white border-duotone-blue shadow'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-duotone-blue/40'
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedTime && (() => {
          const selectedSlot = availableStarts.find(s => s.value === selectedTime);
          return (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircleOutlined className="text-emerald-500 text-lg" />
                <div>
                  <p className="text-sm font-duotone-bold text-emerald-800">
                    New time: {selectedDate?.format('dddd, MMM D')} — {selectedSlot?.label || selectedTime}
                  </p>
                  <p className="text-xs text-emerald-600">{bookingDurationHours}h {lessonName} with {instructorName}</p>
                </div>
              </div>
            </div>
          );
        })()}

        <Form.Item label={<span className="text-slate-700 font-gotham-medium">Reason for reschedule (optional)</span>} name="reason" className="mb-0">
          <Input.TextArea rows={2} placeholder="e.g., Schedule conflict, personal emergency..." className="rounded-xl" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

/* ── Main component ── */
const StudentSchedule = () => {
  const { message, notification } = App.useApp();
  const outletContext = useOutletContext() ?? {};
  const overview = outletContext?.overview;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'schedule';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const [action, setAction] = useState({ type: null, booking: null });
  const [detailModal, setDetailModal] = useState({ open: false, lesson: null, meta: null });
  const filters = useMemo(() => ({ limit: 500 }), []);
  const { data, isLoading, error, refetch } = useStudentSchedule(filters);
  const bookingMutation = useStudentBookingMutation();

  const fallbackUpcoming = useMemo(() => {
    if (Array.isArray(overview?.nextLessons)) return overview.nextLessons;
    if (Array.isArray(overview?.upcomingSessions)) return overview.upcomingSessions;
    return [];
  }, [overview]);

  const fallbackPast = useMemo(() => {
    if (Array.isArray(overview?.previousLessons)) return overview.previousLessons;
    return [];
  }, [overview]);

  const scheduleEntries = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.lessons)) return data.lessons;
    if (Array.isArray(data?.results)) return data.results;
    return [];
  }, [data]);

  const lessons = useMemo(() => {
    if (scheduleEntries.length) return scheduleEntries;
    const combined = [...fallbackUpcoming, ...fallbackPast];
    if (!combined.length) return [];
    const unique = new Map();
    combined.forEach((l) => {
      const key = l?.bookingId || l?.id;
      if (!key) return;
      unique.set(key, { bookingId: l.bookingId ?? l.id, ...l });
    });
    return Array.from(unique.values());
  }, [fallbackPast, fallbackUpcoming, scheduleEntries]);

  const { upcomingLessons, pastLessons } = useMemo(() => {
    const now = dayjs();
    const upcoming = [];
    const past = [];
    lessons.forEach((l) => {
      const status = (l?.status || '').toLowerCase();
      const start = l?.startTime ? dayjs(l.startTime) : l?.date ? dayjs(l.date) : null;
      if (['completed', 'cancelled'].includes(status) || (start && start.isBefore(now))) past.push(l);
      else upcoming.push(l);
    });
    return { upcomingLessons: upcoming, pastLessons: past };
  }, [lessons]);

  const sortedUpcoming = useMemo(() => [...upcomingLessons].sort((a, b) => {
    const sa = a?.startTime ? dayjs(a.startTime) : dayjs(a?.date);
    const sb = b?.startTime ? dayjs(b.startTime) : dayjs(b?.date);
    return sa.valueOf() - sb.valueOf();
  }), [upcomingLessons]);

  const sortedPast = useMemo(() => [...pastLessons].sort((a, b) => {
    const sa = a?.startTime ? dayjs(a.startTime) : dayjs(a?.date);
    const sb = b?.startTime ? dayjs(b.startTime) : dayjs(b?.date);
    return sb.valueOf() - sa.valueOf();
  }), [pastLessons]);

  const scheduleSummary = useMemo(() => ({
    total: lessons.length,
    upcoming: sortedUpcoming.length,
    past: sortedPast.length,
  }), [lessons.length, sortedUpcoming.length, sortedPast.length]);

  useEffect(() => {
    if (error) notification.error({ message: 'Failed to load schedule', description: error.message, placement: 'bottomRight' });
  }, [error, notification]);

  const handleAction = (type, booking) => setAction({ type, booking });
  const closeModal = () => setAction({ type: null, booking: null });
  const openDetail = (lesson, meta) => setDetailModal({ open: true, lesson, meta });
  const closeDetail = () => setDetailModal({ open: false, lesson: null, meta: null });

  const handleReschedule = async (values) => {
    if (!action.booking) return;
    if (!values.newDateTime || typeof values.newStartHour !== 'number' || Number.isNaN(values.newStartHour)) {
      notification.error({ message: 'Invalid reschedule data', description: 'Please select both a date and time slot' });
      return;
    }
    try {
      await bookingMutation.mutateAsync({
        bookingId: action.booking.bookingId,
        payload: { action: 'reschedule', newDate: values.newDateTime.format('YYYY-MM-DD'), newStartHour: values.newStartHour, reason: values.reason, notifyManager: true },
      });
      message.success('Reschedule request sent! A manager will confirm your new time.');
      closeModal();
      refetch();
    } catch (e) {
      notification.error({ message: 'Unable to reschedule', description: e.message });
    }
  };

  const nextLesson = sortedUpcoming[0];
  const nextStart = nextLesson?.startTime ? dayjs(nextLesson.startTime) : nextLesson?.date ? dayjs(nextLesson.date) : null;

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {/* ── Header: tabs + stats ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 w-fit mx-auto">
          <button
            type="button" onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-gotham-medium transition-all ${
              activeTab === 'schedule' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            My Schedule
          </button>
          <button
            type="button" onClick={() => setActiveTab('group')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-gotham-medium transition-all ${
              activeTab === 'group' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserGroupIcon className="h-4 w-4" />
            Group Lessons
          </button>
        </div>

        {/* Stats */}
        {activeTab === 'schedule' && (
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-duotone-bold text-slate-900">{scheduleSummary.total}</span>
              <span className="text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400">total</span>
            </div>
            <span className="text-slate-200">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-duotone-bold text-duotone-blue">{scheduleSummary.upcoming}</span>
              <span className="text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400">upcoming</span>
            </div>
            <span className="text-slate-200">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-duotone-bold text-emerald-600">{scheduleSummary.past}</span>
              <span className="text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400">past</span>
            </div>
            {nextLesson && nextStart && (
              <>
                <span className="text-slate-200 hidden sm:inline">|</span>
                <span className="hidden sm:inline text-xs text-slate-500">
                  Next: <span className="font-gotham-medium text-slate-700">{nextStart.format('ddd, MMM D')} {formatTimeRange(nextLesson.startTime, nextLesson.endTime)}</span>
                  {nextLesson.instructor?.name && <> with {nextLesson.instructor.name}</>}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {activeTab === 'group' ? (
        <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-slate-200 border-t-duotone-blue rounded-full animate-spin" /></div>}>
          <StudentGroupBookingsPage />
        </Suspense>
      ) : (
        <>
          {/* ── Upcoming ── */}
          <section>
            <h2 className="font-duotone-bold text-sm uppercase tracking-[0.1em] text-slate-900 mb-2 px-1">
              Upcoming
            </h2>
            <LessonsList
              lessons={sortedUpcoming}
              loading={isLoading}
              emptyMessage="No upcoming lessons yet"
              enableActions
              onAction={handleAction}
              onRowClick={openDetail}
              markFirst
            />
          </section>

          {/* ── Past ── */}
          <section>
            <h2 className="font-duotone-bold text-sm uppercase tracking-[0.1em] text-slate-900 mb-2 px-1">
              Past
            </h2>
            <LessonsList
              lessons={sortedPast}
              loading={isLoading}
              emptyMessage="No lessons recorded yet"
              enableActions={false}
              onAction={handleAction}
              onRowClick={openDetail}
              markFirst={false}
            />
          </section>

          {/* ── Modals ── */}
          <LessonDetailModal
            open={detailModal.open}
            lesson={detailModal.lesson}
            meta={detailModal.meta}
            onClose={closeDetail}
            onReschedule={(lesson) => handleAction('reschedule', lesson)}
          />
          <RescheduleModal open={action.type === 'reschedule'} booking={action.booking} onClose={closeModal} onSubmit={handleReschedule} submitting={bookingMutation.isLoading} />
        </>
      )}
    </div>
  );
};

export default StudentSchedule;
