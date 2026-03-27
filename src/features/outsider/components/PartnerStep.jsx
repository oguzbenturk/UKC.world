/**
 * PartnerStep
 *
 * Inline step inside QuickBookingModal for group lesson packages.
 * Two paths:
 *   1. "I have a friend" — schedule lesson, then generate a shareable invite link
 *   2. "Find me a partner" — submits a simplified partner-matching request
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Select,
  Spin,
  Typography,
  message,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  CheckOutlined,
  LinkOutlined,
  TeamOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createGroupBooking } from '@/features/bookings/services/groupBookingService';
import { createGroupLessonRequest } from '@/features/bookings/services/groupLessonRequestService';
import apiClient from '@/shared/services/apiClient';
import { getAvailableSlots } from '@/features/bookings/components/api/calendarApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import calendarConfig from '@/config/calendarConfig';
import { useAuth } from '@/shared/hooks/useAuth';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const PartnerStep = ({ serviceId, packageData, durationHours, onDone, onBack, ownedPackage, partnerInfo, onProceedToSchedule }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null | 'friend' | 'find'
  const { formatCurrency, userCurrency, convertCurrency } = useCurrency();
  const [createdGroupId, setCreatedGroupId] = useState(null);

  // ── "I have a friend" state ──
  const [inviteLink, setInviteLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selectedInstructorId, setSelectedInstructorId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  // ── "Find me a partner" state ──
  const [submitted, setSubmitted] = useState(false);

  // ── Shared data ──
  // Price per person = 0 so backend calculates from service (same as private bookings)
  const pricePerPerson = 0;
  const displayPrice = packageData?.price ? parseFloat(packageData.price) : 0;
  const dualPrice = (() => {
    const eurFormatted = formatCurrency(displayPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const converted = convertCurrency ? convertCurrency(displayPrice, 'EUR', userCurrency) : displayPrice;
    return `${eurFormatted} (~${formatCurrency(converted, userCurrency)})`;
  })();

  // Total hours for the selected package (used in both 'friend' and 'find' flows)
  const packageDurationHours = packageData?.totalHours || packageData?.duration_hours ||
    packageData?.durationHours || packageData?.hours || null;;

  // ── Instructors ──
  const { data: instructorsData = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['partner-step', 'instructors'],
    queryFn: () => apiClient.get('/instructors').then((r) => r.data.filter(i => !i.is_freelance)),
    enabled: mode === 'friend',
    staleTime: 300_000,
  });

  // ── Slots ──
  const dateString = selectedDate?.isValid() ? selectedDate.format('YYYY-MM-DD') : null;
  const { data: availabilityData, isLoading: slotsLoading } = useQuery({
    queryKey: ['partner-step', 'slots', dateString, selectedInstructorId],
    queryFn: async () => {
      const filters = { instructorIds: [selectedInstructorId] };
      return getAvailableSlots(dateString, dateString, filters);
    },
    enabled: !!dateString && !!selectedInstructorId && mode === 'friend',
    staleTime: 60_000,
  });

  const PRESET_SLOT_STARTS = calendarConfig.preScheduledSlots.map((s) => s.start);
  const perSessionHours = durationHours && packageData?.sessionsCount
    ? Math.max(2, durationHours / packageData.sessionsCount)
    : 2;
  const sessionDurationMinutes = perSessionHours * 60;

  const availableStarts = useMemo(() => {
    if (!availabilityData?.length) return [];
    const dayData = availabilityData.find(d => d.date === dateString);
    if (!dayData?.slots) return [];
    const instructorSlots = dayData.slots.filter(s => s.instructorId === selectedInstructorId);
    const freeSet = new Set(instructorSlots.filter(s => s.status === 'available').map(s => s.time));
    const stepsRequired = Math.max(1, Math.round(sessionDurationMinutes / 30));
    return PRESET_SLOT_STARTS
      .filter(start => {
        const startMins = start.split(':').reduce((h, m) => parseInt(h) * 60 + parseInt(m), 0);
        for (let i = 0; i < stepsRequired; i++) {
          const mins = startMins + i * 30;
          const t = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
          if (!freeSet.has(t)) return false;
        }
        if (dayjs().format('YYYY-MM-DD') === dateString) {
          const nowMins = dayjs().hour() * 60 + dayjs().minute();
          if (startMins <= nowMins) return false;
        }
        return true;
      })
      .map(t => ({ value: t, label: t }));
  }, [availabilityData, dateString, selectedInstructorId, sessionDurationMinutes, PRESET_SLOT_STARTS]);

  // ── "I have a friend" — create group + generate link ──
  const friendMutation = useMutation({
    mutationFn: async () => {
      const result = await createGroupBooking({
        serviceId,
        packageId: packageData?.id || null,
        ownedPackageId: ownedPackage?.id || null,
        title: `${packageData?.name || 'Group Lesson'}`,
        maxParticipants: 2,
        pricePerPerson,
        currency: 'EUR',
        scheduledDate: selectedDate.format('YYYY-MM-DD'),
        startTime: selectedTime,
        durationHours: sessionDurationMinutes / 60,
        instructorId: selectedInstructorId,
        generateLink: true,
      });
      return result;
    },
    onSuccess: (data) => {
      const link = data.inviteLink?.inviteUrl || data.inviteLink?.token;
      if (link) {
        const fullUrl = `${window.location.origin}${link.startsWith('/') ? link : `/${link}`}`;
        setInviteLink(fullUrl);
      }
      if (data.groupBooking?.id) {
        setCreatedGroupId(data.groupBooking.id);
      }
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Failed to create group');
    },
  });

  // ── "Find me a partner" — submit request ──
  const findMutation = useMutation({
    mutationFn: (values) => createGroupLessonRequest({
      serviceId,
      preferredDateStart: values.dateStart,
      preferredDateEnd: values.dateEnd || null,
      skillLevel: values.skillLevel || 'beginner',
      notes: values.notes || null,
      preferredDurationHours: values.durationHours || undefined,
    }),
    onSuccess: () => {
      setSubmitted(true);
      message.success('Request submitted! We\'ll match you with a partner.');
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Failed to submit request');
    },
  });

  const handleCopyLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      message.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS
      const input = document.createElement('input');
      input.value = inviteLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      message.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [inviteLink]);

  // ── Owned package overview (student already has this package) ──
  if (ownedPackage && !mode) {
    const remaining = parseFloat(ownedPackage.remainingHours ?? ownedPackage.remaining_hours) || 0;
    const total = parseFloat(ownedPackage.totalHours ?? ownedPackage.total_hours) || 0;
    const used = total - remaining;
    const pkgName = ownedPackage.packageName || ownedPackage.package_name || packageData?.name || 'Group Package';

    return (
      <div className="space-y-4">
        {/* Package info */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <TeamOutlined className="text-blue-600 text-sm" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 text-sm truncate">{pkgName}</p>
              <p className="text-xs text-slate-500">Your group package</p>
            </div>
          </div>
          <div className="flex justify-between text-sm pt-1 border-t border-blue-200/60">
            <Text type="secondary">Remaining</Text>
            <Text strong className="text-blue-600">{remaining}h / {total}h</Text>
          </div>
          {used > 0 && (
            <div className="w-full bg-blue-200/50 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
            </div>
          )}
        </div>

        {/* Partner info or partner finding */}
        {partnerInfo ? (
          <>
            <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <UserOutlined className="text-purple-600 text-base" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-sm">{partnerInfo.partnerName}</p>
                  <p className="text-xs text-purple-600 mt-0.5">
                    <CheckOutlined className="mr-1" />
                    Confirmed partner
                    {partnerInfo.partnerRemainingHours != null && ` • ${partnerInfo.partnerRemainingHours}h remaining`}
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="primary"
              size="large"
              block
              className="!h-12 !rounded-xl !font-bold"
              icon={<CalendarOutlined />}
              onClick={() => onProceedToSchedule?.()}
            >
              Book a Lesson
            </Button>
          </>
        ) : (
          <>
            <Alert
              type="warning"
              showIcon
              className="!rounded-xl"
              message="No partner yet"
              description="You need a partner to book this lesson. Invite a friend or let us find you one."
            />

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setMode('friend')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
                  <TeamOutlined className="text-blue-600 text-lg" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">I have a friend</p>
                  <p className="text-xs text-slate-500 mt-0.5">Create a link and share it with your friend</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('find')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/50 transition-all text-left group"
              >
                <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center shrink-0 group-hover:bg-violet-200 transition-colors">
                  <SearchOutlined className="text-violet-600 text-lg" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">Find me a partner</p>
                  <p className="text-xs text-slate-500 mt-0.5">We'll match you with another student</p>
                </div>
              </button>
            </div>
          </>
        )}

        {onBack && (
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            className="!mt-2"
          >
            Back
          </Button>
        )}
      </div>
    );
  }

  // ── Mode selection (no package owned yet) ──
  if (!mode) {
    return (
      <div className="space-y-4">
        <Alert
          type="info"
          showIcon
          className="!rounded-xl"
          message="Shared Lesson"
          description="This package requires at least 2 people. Invite a friend or let us find you a partner."
        />

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode('friend')}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
              <TeamOutlined className="text-blue-600 text-lg" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">I have a friend</p>
              <p className="text-xs text-slate-500 mt-0.5">Create a link and share it with your friend</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('find')}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/50 transition-all text-left group"
          >
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center shrink-0 group-hover:bg-violet-200 transition-colors">
              <SearchOutlined className="text-violet-600 text-lg" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Find me a partner</p>
              <p className="text-xs text-slate-500 mt-0.5">We'll match you with another student</p>
            </div>
          </button>
        </div>

        {onBack && (
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            className="!mt-2"
          >
            Back to package
          </Button>
        )}
      </div>
    );
  }

  // ── "I have a friend" flow ──
  if (mode === 'friend') {
    // Link generated — show it
    if (inviteLink) {
      const instructorObj = instructorsData.find((i) => i.id === selectedInstructorId);
      const instructorName = instructorObj
        ? (`${instructorObj.first_name || ''} ${instructorObj.last_name || ''}`.trim() || instructorObj.name || instructorObj.email)
        : null;

      return (
        <div className="space-y-4">
          <div className="text-center py-2">
            <div className="w-14 h-14 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-3">
              <CheckOutlined className="text-green-600 text-2xl" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Group Created!</h3>
            <p className="text-sm text-slate-500 mt-1">Share this link with your friend to join</p>
          </div>

          {/* Scheduled lesson details */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
            {instructorName && (
              <div className="flex justify-between text-sm">
                <Text type="secondary"><UserOutlined className="mr-1" />Instructor</Text>
                <Text strong>{instructorName}</Text>
              </div>
            )}
            {selectedDate && (
              <div className="flex justify-between text-sm">
                <Text type="secondary"><CalendarOutlined className="mr-1" />Date</Text>
                <Text strong>{selectedDate.format('ddd, MMM D, YYYY')}</Text>
              </div>
            )}
            {selectedTime && (
              <div className="flex justify-between text-sm">
                <Text type="secondary"><ClockCircleOutlined className="mr-1" />Time</Text>
                <Text strong>{selectedTime}</Text>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <Text type="secondary">Price per person</Text>
              <Text strong className="text-green-600">{dualPrice}</Text>
            </div>
            {packageDurationHours && (
              <div className="flex justify-between text-sm">
                <Text type="secondary">Package hours</Text>
                <Text strong className="text-blue-600">{packageDurationHours}h total</Text>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <LinkOutlined className="text-slate-400 shrink-0" />
            <input
              readOnly
              value={inviteLink}
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 truncate"
            />
            <Button
              type="primary"
              size="small"
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={handleCopyLink}
              className="!rounded-lg shrink-0"
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <Alert
            type="warning"
            showIcon
            className="!rounded-xl"
            message="Link expires in 24 hours"
            description="Your friend needs to create an account and accept the invitation before booking."
          />

          <Button
            type="primary"
            block
            size="large"
            className="!h-12 !rounded-xl !font-bold"
            onClick={() => {
              onDone?.();
              navigate('/student/group-bookings');
            }}
          >
            My Group Bookings
          </Button>

          <Button
            block
            size="large"
            className="!h-12 !rounded-xl !font-bold"
            onClick={() => onDone?.()}
          >
            Done
          </Button>
        </div>
      );
    }

    // Generate link — scheduling form
    return (
      <div className="space-y-4">
        <div className="text-center py-1">
          <h3 className="text-base font-bold text-slate-900">Schedule Your Group Lesson</h3>
          <p className="text-xs text-slate-500 mt-0.5">Pick instructor, date & time — your friend will see these details</p>
        </div>

        {/* Package summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <Text type="secondary">Package</Text>
            <Text strong className="text-right max-w-[60%] truncate">{packageData?.name || 'Group Lesson'}</Text>
          </div>
          <div className="flex justify-between text-sm">
            <Text type="secondary">Price per person</Text>
            <Text strong className="text-green-600">{dualPrice}</Text>
          </div>
          <div className="flex justify-between text-sm">
            <Text type="secondary">Group size</Text>
            <Text strong>2 people</Text>
          </div>
          {packageDurationHours && (
            <div className="flex justify-between text-sm">
              <Text type="secondary">Package hours</Text>
              <Text strong className="text-blue-600">{packageDurationHours}h total</Text>
            </div>
          )}
        </div>

        {/* Instructor */}
        <div>
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            <UserOutlined className="mr-1" /> Instructor
          </p>
          {instructorsLoading ? (
            <div className="flex justify-center py-3"><Spin size="small" /></div>
          ) : (
            <Select
              placeholder="Choose instructor"
              className="w-full"
              size="large"
              value={selectedInstructorId}
              onChange={(val) => {
                if (val === '__any__') {
                  const randomIdx = Math.floor(Math.random() * instructorsData.length);
                  setSelectedInstructorId(instructorsData[randomIdx].id);
                } else {
                  setSelectedInstructorId(val);
                }
                setSelectedTime(null);
              }}
              options={[
                { value: '__any__', label: '🎲 Any available instructor' },
                ...instructorsData.map((inst) => ({
                  value: inst.id,
                  label: `${inst.first_name || ''} ${inst.last_name || ''}`.trim() || inst.name || inst.email,
                })),
              ]}
            />
          )}
        </div>

        {/* Date & Time */}
        {selectedInstructorId && (
          <div>
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              <CalendarOutlined className="mr-1" /> Date & Time
            </p>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker
                className="w-full"
                size="large"
                value={selectedDate}
                onChange={(val) => { setSelectedDate(val); setSelectedTime(null); }}
                disabledDate={(current) => current && current.isBefore(dayjs(), 'day')}
                format="ddd, MMM D"
                inputReadOnly
                placeholder="Pick date"
              />
              {dateString ? (
                slotsLoading ? (
                  <div className="flex items-center justify-center h-10"><Spin size="small" /></div>
                ) : availableStarts.length === 0 ? (
                  <Select placeholder="No slots" disabled className="w-full" size="large" />
                ) : (
                  <Select
                    placeholder="Pick time"
                    className="w-full"
                    size="large"
                    value={selectedTime}
                    onChange={setSelectedTime}
                    options={availableStarts}
                  />
                )
              ) : (
                <Select placeholder="Pick date first" disabled className="w-full" size="large" />
              )}
            </div>
          </div>
        )}

        <Button
          type="primary"
          size="large"
          block
          className="!h-12 !rounded-xl !font-bold"
          icon={<LinkOutlined />}
          loading={friendMutation.isPending}
          disabled={!selectedInstructorId || !selectedDate || !selectedTime}
          onClick={() => friendMutation.mutate()}
        >
          Generate Invite Link
        </Button>

        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => { setMode(null); setSelectedInstructorId(null); setSelectedDate(null); setSelectedTime(null); }}
        >
          Back
        </Button>
      </div>
    );
  }

  // ── "Find me a partner" flow ──
  if (mode === 'find') {
    if (submitted) {
      return (
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-3">
              <CheckOutlined className="text-green-600 text-2xl" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Request Submitted!</h3>
            <p className="text-sm text-slate-500 mt-1">
              We'll match you with a compatible partner and notify you.
            </p>
          </div>
          <Button
            type="primary"
            block
            size="large"
            className="!h-12 !rounded-xl !font-bold"
            onClick={() => onDone?.()}
          >
            Done
          </Button>
        </div>
      );
    }

    return <FindPartnerForm
      serviceId={serviceId}
      packageData={packageData}
      onSubmit={(values) => findMutation.mutate(values)}
      submitting={findMutation.isPending}
      onBack={() => setMode(null)}
    />;
  }

  return null;
};

/** Simplified "Find me a partner" form — inline within modal */
const FindPartnerForm = ({ serviceId, packageData, onSubmit, submitting, onBack }) => {
  const { user } = useAuth();
  const [dateStart, setDateStart] = useState(null);
  const [dateEnd, setDateEnd] = useState(null);
  const [skillLevel, setSkillLevel] = useState('beginner');
  const [notes, setNotes] = useState('');

  // Pre-fill from auth user profile; editable if missing
  const [weight, setWeight] = useState(user?.weight ?? null);
  const [dateOfBirth, setDateOfBirth] = useState(
    user?.date_of_birth ? dayjs(user.date_of_birth) : null
  );
  const [phone, setPhone] = useState(user?.phone || '');

  const handleSubmit = async () => {
    if (!dateStart) {
      message.warning('Please select at least a start date');
      return;
    }
    if (!weight) {
      message.warning('Please enter your weight so we can find the best match');
      return;
    }
    if (!dateOfBirth) {
      message.warning('Please enter your date of birth so we can find the best match');
      return;
    }
    // If profile fields changed, update them silently
    const profileChanged =
      weight !== user?.weight ||
      (dateOfBirth && dateOfBirth.format('YYYY-MM-DD') !== user?.date_of_birth) ||
      (phone && phone !== user?.phone);
    if (profileChanged) {
      try {
        await apiClient.put(`/users/${user.id}`, {
          weight,
          date_of_birth: dateOfBirth.format('YYYY-MM-DD'),
          ...(phone ? { phone } : {}),
        });
      } catch {
        // Non-fatal
      }
    }
    onSubmit({
      dateStart: dateStart.format('YYYY-MM-DD'),
      dateEnd: dateEnd ? dateEnd.format('YYYY-MM-DD') : null,
      skillLevel,
      notes,
      durationHours: packageDurationHours,
    });
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-1">
        <h3 className="text-base font-bold text-slate-900">Find a Partner</h3>
        <p className="text-xs text-slate-500 mt-0.5">Tell us your preferences and we'll match you</p>
      </div>

      {/* Package info — read-only, shown if available */}
      {packageData?.name && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200">
          <span className="text-xs font-semibold text-blue-700 flex-1 truncate">
            {packageData.name}
          </span>
          {packageDurationHours && (
            <span className="text-xs text-blue-500 font-medium whitespace-nowrap">
              {packageDurationHours}h lesson
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
            Your weight (kg) *
          </label>
          <InputNumber
            className="w-full !rounded-xl"
            min={20}
            max={300}
            step={0.5}
            value={weight}
            onChange={setWeight}
            placeholder="e.g. 70"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
            Date of birth *
          </label>
          <DatePicker
            className="w-full !rounded-xl"
            value={dateOfBirth}
            onChange={setDateOfBirth}
            format="YYYY-MM-DD"
            placeholder="YYYY-MM-DD"
            disabledDate={(d) => d && d.isAfter(dayjs().subtract(5, 'year'))}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
          Phone number
        </label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 234 567 8900"
          className="!rounded-xl"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
          When are you available? *
        </label>
        <RangePicker
          className="w-full"
          value={[dateStart, dateEnd]}
          onChange={(dates) => {
            setDateStart(dates?.[0] || null);
            setDateEnd(dates?.[1] || null);
          }}
          disabledDate={(d) => d && d.isBefore(dayjs(), 'day')}
          format="ddd, MMM D"
          placeholder={['From', 'To (optional)']}
          allowEmpty={[false, true]}
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
          Your skill level
        </label>
        <Radio.Group
          value={skillLevel}
          onChange={(e) => setSkillLevel(e.target.value)}
          className="w-full"
        >
          <div className="grid grid-cols-3 gap-2">
            <Radio.Button value="beginner" className="!text-center !rounded-lg !text-xs sm:!text-sm">
              🌱 Beginner
            </Radio.Button>
            <Radio.Button value="intermediate" className="!text-center !rounded-lg !text-xs sm:!text-sm">
              🏄 Intermediate
            </Radio.Button>
            <Radio.Button value="advanced" className="!text-center !rounded-lg !text-xs sm:!text-sm">
              🏆 Advanced
            </Radio.Button>
          </div>
        </Radio.Group>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
          Notes (optional)
        </label>
        <Input.TextArea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else we should know?"
          rows={2}
          maxLength={500}
          className="!rounded-xl"
        />
      </div>

      <Button
        type="primary"
        size="large"
        block
        className="!h-12 !rounded-xl !font-bold"
        icon={<SearchOutlined />}
        loading={submitting}
        onClick={handleSubmit}
      >
        Submit Request
      </Button>

      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={onBack}
      >
        Back
      </Button>
    </div>
  );
};

export default PartnerStep;
