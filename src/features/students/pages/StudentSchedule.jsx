import { useEffect, useMemo, useState, useCallback } from 'react';
import { App, Button, DatePicker, Empty, Modal, Spin, Tag, Tooltip, Form, Input, Alert } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useStudentSchedule } from '../hooks/useStudentDashboard';
import { useStudentBookingMutation } from '../hooks/useStudentMutations';
import { getAvailableSlots } from '@/features/bookings/components/api/calendarApi';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

const statusColorMap = {
  completed: 'green',
  scheduled: 'blue',
  pending: 'gold',
  cancelled: 'red'
};

const HALF_HOUR_MINUTES = 30;

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

const computeAvailableStarts = (slots, durationMinutes, isToday) => {
  if (!Array.isArray(slots) || slots.length === 0) {
    return [];
  }
  const stepsRequired = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  const sortedSlots = [...slots].sort((a, b) => {
    const aMinutes = timeStringToMinutes(a.time) ?? 0;
    const bMinutes = timeStringToMinutes(b.time) ?? 0;
    return aMinutes - bMinutes;
  });

  const nowMinutes = isToday ? (dayjs().hour() * 60 + dayjs().minute()) : null;
  const results = [];

  for (let index = 0; index <= sortedSlots.length - stepsRequired; index += 1) {
    const window = sortedSlots.slice(index, index + stepsRequired);
    if (!window.every((slot) => slot.status === 'available')) {
      continue;
    }
    const startMinutes = timeStringToMinutes(window[0].time);
    if (startMinutes === null) {
      continue;
    }
    if (nowMinutes !== null && startMinutes < nowMinutes + 30) {
      continue;
    }
    const endMinutes = startMinutes + durationMinutes;
    const label = `${window[0].time} – ${minutesToTimeString(endMinutes)}`;
    if (!results.some((entry) => entry.value === window[0].time)) {
      results.push({ value: window[0].time, label });
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
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

const resolveLessonName = (lesson) => pickFirst(lesson?.service?.name, lesson?.lessonType, 'Lesson');
const resolveInstructorName = (lesson) => pickFirst(lesson?.instructor?.name, lesson?.instructorName, 'TBD');
const resolveStatus = (lesson) => pickFirst(lesson?.status, 'scheduled');
const resolveNotes = (lesson) => pickFirst(lesson?.notes, '');
const resolveIdentifier = (lesson, lessonName) =>
  pickFirst(lesson?.bookingId, lesson?.id, lesson?.startTime, lesson?.date, lessonName, 'lesson');

const resolveDateLabel = (lesson) => {
  const rawDate = pickFirst(lesson?.startTime, lesson?.date);
  return rawDate ? dayjs(rawDate).format('dddd, MMM D') : 'TBD';
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

const ScheduleTable = ({
  title,
  actions,
  data,
  loading,
  emptyMessage,
  enableActions = true,
  onAction = () => {}
}) => {
  const rows = Array.isArray(data)
    ? data.map((lesson) => ({ lesson, meta: getLessonCardMeta(lesson) }))
    : [];

  return (
    <UnifiedTable title={title} actions={actions} stickyFirstCol density="comfortable">
      {({ densityRow }) => (
        <div className="max-h-[520px] overflow-x-auto">
          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-8">
              <Spin />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex justify-center py-10">
              <Empty description={emptyMessage} />
            </div>
          ) : (
            <Spin spinning={loading} size="small">
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="bg-white">
                    <th className="sticky left-0 top-0 z-20 border-b border-slate-200 px-3 py-3 text-left font-semibold text-slate-800 shadow-[2px_0_0_rgba(0,0,0,0.04)] bg-white">
                      Lesson
                    </th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold text-slate-800">Time</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold text-slate-800">Instructor</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-center font-semibold text-slate-800">Status</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold text-slate-800">Notes</th>
                    {enableActions ? (
                      <th className="border-b border-slate-200 px-3 py-3 text-right font-semibold text-slate-800">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ lesson, meta }, index) => {
                    const isStriped = index % 2 === 0;
                    const rowBg = isStriped ? 'bg-slate-50' : 'bg-white';
                    const stickyBg = isStriped ? '#f8fafc' : '#ffffff';
                    const dateParts = meta.dateLabel.split(',');
                    const dayLabel = dateParts[0] ?? meta.dateLabel;
                    const dateLabel = dateParts[1]?.trim() ?? '';
                    const dayDateLabel = dateLabel ? `${dayLabel} · ${dateLabel}` : dayLabel;
                    const disableCancel = meta.status === 'cancelled' || meta.status === 'completed';
                    const disableReschedule = meta.status === 'completed';

                    return (
                      <tr key={meta.id} className={`${rowBg} hover:bg-slate-100 transition-colors`}>
                        <td
                          className={`px-3 ${densityRow} align-top`}
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 15,
                            background: stickyBg,
                            boxShadow: '2px 0 0 rgba(0,0,0,0.04)',
                            minWidth: '140px',
                            maxWidth: '200px'
                          }}
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-slate-900 truncate" title={meta.lessonName}>
                              {meta.lessonName}
                            </span>
                            <span className="text-[11px] uppercase tracking-wide text-slate-500 truncate" title={dayDateLabel}>
                              {dayDateLabel}
                            </span>
                          </div>
                        </td>
                        <td className={`px-3 ${densityRow} align-top text-sm text-slate-700`}>{meta.timeLabel}</td>
                        <td className={`px-3 ${densityRow} align-top text-sm text-slate-700`}>{meta.instructorName}</td>
                        <td className={`px-3 ${densityRow} align-top`}>
                          <div className="flex justify-center">
                            <Tag color={statusColorMap[meta.status] ?? 'default'} className="m-0 font-semibold capitalize">
                              {meta.status}
                            </Tag>
                          </div>
                        </td>
                        <td className={`px-3 ${densityRow} align-top text-sm text-slate-600`}>
                          {meta.hasNotes ? (
                            <Tooltip title={meta.notes}>
                              <span className="block max-w-[180px] truncate" aria-label={meta.notes}>
                                {meta.notes}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        {enableActions ? (
                          <td className={`px-3 ${densityRow} align-top text-right`}>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Button
                                size="small"
                                type="default"
                                icon={<CalendarOutlined />}
                                onClick={() => onAction('reschedule', lesson)}
                                disabled={disableReschedule}
                              >
                                Reschedule
                              </Button>
                              <Tooltip title="Cancel this lesson">
                                <Button
                                  size="small"
                                  danger
                                  onClick={() => onAction('cancel', lesson)}
                                  disabled={disableCancel}
                                >
                                  Cancel
                                </Button>
                              </Tooltip>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Spin>
          )}
        </div>
      )}
    </UnifiedTable>
  );
};

const RescheduleModal = ({ open, booking, onClose, onSubmit, submitting }) => {
  const [form] = Form.useForm();
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  // Get instructor ID and lesson duration from the booking
  const instructorId = booking?.instructor?.id || booking?.instructorId || booking?.instructor_user_id;
  const lessonDuration = booking?.duration ? Number(booking.duration) * 60 : 60; // duration is in hours, convert to minutes
  const lessonName = booking?.service?.name || booking?.lessonType || 'Lesson';
  const instructorName = booking?.instructor?.name || booking?.instructorName || 'your instructor';

  const selectedDateString = selectedDate?.isValid() ? selectedDate.format('YYYY-MM-DD') : null;

  // Fetch availability for selected date and instructor
  const { data: availabilityData = [], isFetching: availabilityLoading } = useQuery({
    queryKey: ['reschedule', 'availability', selectedDateString, instructorId],
    queryFn: async () => {
      if (!selectedDateString || !instructorId) {
        return [];
      }
      const filters = { instructorIds: [instructorId] };
      const days = await getAvailableSlots(selectedDateString, selectedDateString, filters);
      return Array.isArray(days) ? days : [];
    },
    enabled: open && !!selectedDateString && !!instructorId,
    staleTime: 60_000
  });

  // Compute available time slots
  const availableStarts = useMemo(() => {
    if (!selectedDateString || !instructorId) {
      return [];
    }
    const dayEntry = availabilityData.find((day) => day.date === selectedDateString);
    if (!dayEntry || !Array.isArray(dayEntry.slots)) {
      return [];
    }
    const instructorSlots = dayEntry.slots.filter(
      (slot) => String(slot.instructorId) === String(instructorId)
    );
    const isSelectedDayToday = selectedDate?.isSame(dayjs(), 'day') ?? false;
    return computeAvailableStarts(instructorSlots, lessonDuration, isSelectedDayToday);
  }, [availabilityData, selectedDateString, instructorId, lessonDuration, selectedDate]);

  // Reset form when modal opens
  useEffect(() => {
    if (open && booking) {
      const currentDate = booking.startTime ? dayjs(booking.startTime) : booking.date ? dayjs(booking.date) : null;
      setSelectedDate(currentDate);
      setSelectedTime(null);
      // Delay form operations to ensure form is mounted
      setTimeout(() => {
        form.setFieldsValue({ reason: '' });
      }, 0);
    } else if (!open) {
      setSelectedDate(null);
      setSelectedTime(null);
    }
  }, [open, booking, form]);

  // Clear selected time if it's no longer available
  useEffect(() => {
    if (selectedTime && !availableStarts.some((entry) => entry.value === selectedTime)) {
      setSelectedTime(null);
    }
  }, [availableStarts, selectedTime]);

  const handleDateChange = useCallback((date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

  const handleSubmit = useCallback((values) => {
    if (!selectedDate || !selectedTime) {
      return;
    }
    // Parse time to get hours for newStartHour
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const newStartHour = hours + minutes / 60;
    
    onSubmit({
      newDateTime: selectedDate.hour(hours).minute(minutes),
      newStartHour,
      reason: values.reason || ''
    });
  }, [selectedDate, selectedTime, onSubmit]);

  const disabledDate = useCallback((current) => {
    // Disable dates in the past
    return current && current.isBefore(dayjs().startOf('day'));
  }, []);

  const canSubmit = selectedDate && selectedTime && !submitting;

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
            <CalendarOutlined className="text-base" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Request Reschedule</h3>
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
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              onClick={() => form.submit()}
              loading={submitting}
              disabled={!canSubmit}
              className="bg-gradient-to-r from-sky-500 to-indigo-600 border-none"
            >
              Request Reschedule
            </Button>
          </div>
        </div>
      }
      styles={{
        header: { padding: '16px 20px 12px', borderBottom: '1px solid #e2e8f0' },
        body: { padding: '16px 20px' },
        footer: { padding: '12px 20px 16px', borderTop: '1px solid #e2e8f0' }
      }}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        {/* Current Booking Info */}
        <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Current Booking</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{lessonName}</p>
              <p className="text-xs text-slate-600">with {instructorName}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">
                {booking?.date ? dayjs(booking.date).format('MMM D, YYYY') : 'TBD'}
              </p>
              <p className="text-xs text-slate-500">
                {booking?.startTime ? dayjs(booking.startTime).format('HH:mm') : 'TBD'}
              </p>
            </div>
          </div>
        </div>

        {/* Date Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Select New Date
          </label>
          <DatePicker
            value={selectedDate}
            onChange={handleDateChange}
            disabledDate={disabledDate}
            className="w-full"
            format="dddd, MMMM D, YYYY"
            placeholder="Pick a date"
            size="large"
          />
        </div>

        {/* Time Slots */}
        {selectedDate && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
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
              <Alert
                type="warning"
                showIcon
                message="No available slots"
                description={`${instructorName} has no available slots on ${selectedDate.format('MMM D')}. Please try a different date.`}
                className="rounded-xl"
              />
            ) : (
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                <p className="text-xs text-sky-700 mb-3">
                  {availableStarts.length} slot{availableStarts.length > 1 ? 's' : ''} available on {selectedDate.format('MMM D')}
                </p>
                <div className="grid gap-2 grid-cols-3 sm:grid-cols-4">
                  {availableStarts.map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setSelectedTime(slot.value)}
                      className={`px-3 py-2 border-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        selectedTime === slot.value
                          ? 'bg-sky-500 text-white border-sky-500 shadow-md'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      {slot.value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selected Time Summary */}
        {selectedTime && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircleOutlined className="text-emerald-500 text-lg" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  New time: {selectedDate?.format('dddd, MMM D')} at {selectedTime}
                </p>
                <p className="text-xs text-emerald-600">
                  Duration: {lessonDuration} minutes with {instructorName}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Reason */}
        <Form.Item 
          label={<span className="text-slate-700">Reason for reschedule (optional)</span>} 
          name="reason"
          className="mb-0"
        >
          <Input.TextArea 
            rows={2} 
            placeholder="e.g., Schedule conflict, personal emergency..." 
            className="rounded-lg"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const CancelModal = ({ open, booking, onConfirm, onClose, submitting }) => (
  <Modal
    title="Cancel lesson"
    open={open}
    onCancel={onClose}
    onOk={onConfirm}
    okText="Cancel lesson"
    okButtonProps={{ danger: true, loading: submitting }}
  >
    <p className="text-sm text-slate-600">
      Are you sure you want to cancel the lesson on{' '}
      <strong>{dayjs(booking?.date).format('dddd, MMM D')}</strong> at{' '}
      <strong>{dayjs(booking?.startTime).format('HH:mm')}</strong>?
    </p>
    <p className="mt-3 text-xs text-slate-500">
      We&apos;ll notify the team and help you find another slot if needed.
    </p>
  </Modal>
);

const StudentSchedule = () => {
  const { message, notification } = App.useApp();
  const outletContext = useOutletContext() ?? {};
  const overview = outletContext?.overview;
  const [action, setAction] = useState({ type: null, booking: null });
  const filters = useMemo(
    () => ({
      limit: 500
    }),
    []
  );
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
    if (scheduleEntries.length) {
      return scheduleEntries;
    }
    const combined = [...fallbackUpcoming, ...fallbackPast];
    if (!combined.length) {
      return [];
    }
    const uniqueById = new Map();
    combined.forEach((lesson) => {
      const key = lesson?.bookingId || lesson?.id;
      if (!key) return;
      uniqueById.set(key, {
        bookingId: lesson.bookingId ?? lesson.id,
        ...lesson
      });
    });
    return Array.from(uniqueById.values());
  }, [fallbackPast, fallbackUpcoming, scheduleEntries]);

  const { upcomingLessons, pastLessons } = useMemo(() => {
    const now = dayjs();
    const upcoming = [];
    const past = [];

    lessons.forEach((lesson) => {
      const status = (lesson?.status || '').toLowerCase();
      const startMoment = lesson?.startTime ? dayjs(lesson.startTime) : lesson?.date ? dayjs(lesson.date) : null;
      const isPastStatus = ['completed', 'cancelled'].includes(status);
      const hasStarted = startMoment ? startMoment.isBefore(now) : false;

      if (isPastStatus || hasStarted) {
        past.push(lesson);
      } else {
        upcoming.push(lesson);
      }
    });

    return { upcomingLessons: upcoming, pastLessons: past };
  }, [lessons]);

  const sortedUpcomingLessons = useMemo(() => {
    return [...upcomingLessons].sort((a, b) => {
      const startA = a?.startTime ? dayjs(a.startTime) : a?.date ? dayjs(`${a.date}T00:00:00`) : dayjs.invalid();
      const startB = b?.startTime ? dayjs(b.startTime) : b?.date ? dayjs(`${b.date}T00:00:00`) : dayjs.invalid();
      return startA.valueOf() - startB.valueOf();
    });
  }, [upcomingLessons]);

  const sortedPastLessons = useMemo(() => {
    return [...pastLessons].sort((a, b) => {
      const startA = a?.startTime ? dayjs(a.startTime) : a?.date ? dayjs(`${a.date}T00:00:00`) : dayjs.invalid();
      const startB = b?.startTime ? dayjs(b.startTime) : b?.date ? dayjs(`${b.date}T00:00:00`) : dayjs.invalid();
      return startB.valueOf() - startA.valueOf();
    });
  }, [pastLessons]);

  const scheduleSummary = useMemo(() => ({
    totalLessons: lessons.length,
    upcomingCount: sortedUpcomingLessons.length,
    pastCount: sortedPastLessons.length
  }), [lessons.length, sortedPastLessons.length, sortedUpcomingLessons.length]);

  useEffect(() => {
    if (error) {
      notification.error({
        message: 'Failed to load schedule',
        description: error.message,
        placement: 'bottomRight'
      });
    }
  }, [error, notification]);

  const handleAction = (type, booking) => setAction({ type, booking });

  const closeModal = () => setAction({ type: null, booking: null });

  const handleReschedule = async (values) => {
    if (!action.booking) return;
    
    // Debug log to see what values are being passed
    console.log('handleReschedule received:', JSON.stringify(values, null, 2));
    console.log('newDateTime:', values.newDateTime);
    console.log('newStartHour:', values.newStartHour, 'type:', typeof values.newStartHour);
    
    // Guard against missing values
    if (!values.newDateTime || typeof values.newStartHour !== 'number' || Number.isNaN(values.newStartHour)) {
      console.error('Invalid reschedule values:', { 
        newDateTime: values.newDateTime, 
        newStartHour: values.newStartHour,
        typeOfNewStartHour: typeof values.newStartHour
      });
      notification.error({
        message: 'Invalid reschedule data',
        description: 'Please select both a date and time slot'
      });
      return;
    }

    const newDate = values.newDateTime.format('YYYY-MM-DD');
    const newStartHour = values.newStartHour;
    
    console.log('Sending to backend:', { newDate, newStartHour });

    try {
      await bookingMutation.mutateAsync({
        bookingId: action.booking.bookingId,
        payload: {
          action: 'reschedule',
          newDate,
          newStartHour,
          reason: values.reason,
          notifyManager: true // Flag to trigger manager notification
        }
      });
      message.success('Reschedule request sent! A manager will confirm your new time.');
      closeModal();
      refetch();
    } catch (mutationError) {
      notification.error({
        message: 'Unable to reschedule',
        description: mutationError.message
      });
    }
  };

  const handleCancel = async () => {
    if (!action.booking) return;
    try {
      await bookingMutation.mutateAsync({
        bookingId: action.booking.bookingId,
        payload: { action: 'cancel' }
      });
      message.success('Lesson cancelled');
      closeModal();
      refetch();
    } catch (mutationError) {
      notification.error({
        message: 'Unable to cancel lesson',
        description: mutationError.message
      });
    }
  };

  const nextLesson = sortedUpcomingLessons[0];
  const nextLessonStart = nextLesson?.startTime ? dayjs(nextLesson.startTime) : nextLesson?.date ? dayjs(`${nextLesson.date}T00:00:00`) : null;
  const nextLessonSummary = nextLessonStart
    ? `${nextLessonStart.format('dddd, MMM D')} · ${formatTimeRange(nextLesson.startTime, nextLesson.endTime)}`
    : 'We will let you know once a lesson is scheduled.';
  const nextLessonInstructor = nextLesson?.instructor?.name;

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <section className="overflow-hidden rounded-[22px] border border-slate-200/70 bg-gradient-to-br from-sky-50 via-white to-indigo-50/40 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          {/* Left: Title & Stats */}
          <div className="flex-1 space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 text-white shadow">
                <CalendarDaysIcon className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">My Schedule</h1>
                <p className="text-sm text-slate-500">Track upcoming lessons and review past sessions</p>
              </div>
            </div>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
              <article className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-center shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{scheduleSummary.totalLessons}</p>
                <p className="text-[11px] text-slate-500">lessons</p>
              </article>
              <article className="rounded-2xl border border-sky-200/80 bg-sky-50/80 p-4 text-center shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-600">Upcoming</p>
                <p className="mt-1 text-2xl font-bold text-sky-700">{scheduleSummary.upcomingCount}</p>
                <p className="text-[11px] text-sky-600/70">scheduled</p>
              </article>
              <article className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4 text-center shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600">Completed</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{scheduleSummary.pastCount}</p>
                <p className="text-[11px] text-emerald-600/70">finished</p>
              </article>
            </div>
          </div>

          {/* Right: Next Lesson Card */}
          <div className="w-full max-w-xs rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm lg:w-72">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Next lesson</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {nextLesson ? nextLesson.service?.name || 'Lesson' : 'No upcoming lesson'}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
                <ClockCircleOutlined className="text-lg" />
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">{nextLessonSummary}</p>
            {nextLessonInstructor ? (
              <p className="mt-1 text-xs text-slate-500">with {nextLessonInstructor}</p>
            ) : null}
          </div>
        </div>
      </section>

      <ScheduleTable
        title="Upcoming lessons"
        data={sortedUpcomingLessons}
        loading={isLoading}
        emptyMessage="No upcoming lessons yet"
        enableActions
        onAction={handleAction}
      />

      <ScheduleTable
        title="Past lessons"
        data={sortedPastLessons}
        loading={isLoading}
        emptyMessage="No lessons recorded yet"
        enableActions={false}
      />

      <RescheduleModal
        open={action.type === 'reschedule'}
        booking={action.booking}
        onClose={closeModal}
        onSubmit={handleReschedule}
        submitting={bookingMutation.isLoading}
      />

      <CancelModal
        open={action.type === 'cancel'}
        booking={action.booking}
        onClose={closeModal}
        onConfirm={handleCancel}
        submitting={bookingMutation.isLoading}
      />
    </div>
  );
};

export default StudentSchedule;
