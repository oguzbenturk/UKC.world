/**
 * Group Booking Create Page
 *
 * Multi-step form: Lesson Details → Group Settings → Invite Friends
 */

import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, InputNumber, Select, DatePicker } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserGroupIcon,
  AcademicCapIcon,
  ArrowLeftIcon,
  CurrencyEuroIcon,
  SparklesIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useQuery, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { createGroupBooking } from '../services/groupBookingService';
import { getAvailableSlots } from '../components/api/calendarApi';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { usePageSEO } from '@/shared/utils/seo';
import calendarConfig from '@/config/calendarConfig';

const PRESET_SLOTS = calendarConfig.preScheduledSlots;
const HALF_HOUR = 30;

const timeToMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const GROUP_CATEGORIES = ['group', 'semi-private', 'semi private'];

const STEP_LABELS = ['Lesson Details', 'Group Settings', 'Review & Create'];

const StepIndicator = ({ current }) => (
  <div className="flex items-center justify-center gap-2 mb-6">
    {STEP_LABELS.map((label, i) => (
      <div key={label} className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-gotham-medium transition-all ${
          i === current
            ? 'bg-duotone-blue text-white'
            : i < current
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-400'
        }`}>
          {i < current ? (
            <CheckCircleIcon className="w-3.5 h-3.5" />
          ) : (
            <span className="w-4 text-center">{i + 1}</span>
          )}
          <span className="hidden sm:inline">{label}</span>
        </div>
        {i < STEP_LABELS.length - 1 && <div className={`w-6 h-px ${i < current ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
      </div>
    ))}
  </div>
);

const GroupBookingCreatePage = () => {
  usePageSEO({ title: 'Create Group Lesson', description: 'Organize a group lesson and invite friends' });
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshToken } = useAuth();
  const { formatCurrency, userCurrency } = useCurrency();
  const [form] = Form.useForm();
  const prefill = useMemo(() => location.state || {}, [location.state]);
  const [currentStep, setCurrentStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [paymentModel, setPaymentModel] = useState('individual');
  const [bookingType, setBookingType] = useState('package'); // 'package' | 'individual'
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [selectedServiceId, setSelectedServiceId] = useState(prefill.serviceId || null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedInstructorId, setSelectedInstructorId] = useState(null);

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['group-create', 'services'],
    queryFn: async () => {
      const res = await apiClient.get('/services', { params: { category: 'lesson' } });
      const data = Array.isArray(res.data) ? res.data : res.data?.services || [];
      return data.filter(s => {
        const isActive = s.status === 'active' || !s.status;
        const cat = (s.lessonCategoryTag || s.lesson_category_tag || '').toLowerCase();
        return isActive && GROUP_CATEGORIES.includes(cat);
      });
    },
    staleTime: 300_000,
  });

  const { data: instructors = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['group-create', 'instructors'],
    queryFn: async () => { const res = await apiClient.get('/instructors'); return Array.isArray(res.data) ? res.data : res.data?.instructors || []; },
    staleTime: 300_000,
  });

  const { data: packages = [], isLoading: packagesLoading } = useQuery({
    queryKey: ['group-create', 'packages-public'],
    queryFn: async () => {
      const res = await apiClient.get('/services/packages/public');
      return (Array.isArray(res.data) ? res.data : []).filter(p => p.includesLessons !== false);
    },
    staleTime: 300_000,
  });

  // Fetch availability for selected date + instructor
  const dateString = selectedDate?.isValid() ? selectedDate.format('YYYY-MM-DD') : null;
  const { data: availabilityData = [] } = useQuery({
    queryKey: ['group-create', 'availability', dateString, selectedInstructorId],
    queryFn: async () => {
      const filters = selectedInstructorId ? { instructorIds: [selectedInstructorId] } : {};
      const days = await getAvailableSlots(dateString, dateString, filters);
      return Array.isArray(days) ? days : [];
    },
    enabled: !!dateString,
    staleTime: 60_000,
  });

  // Compute which preset slots are available
  const timeSlotOptions = useMemo(() => {
    const durationMin = 2 * 60; // 2h standard
    const stepsNeeded = durationMin / HALF_HOUR;
    const isToday = selectedDate?.isSame(dayjs(), 'day');
    const nowMin = isToday ? dayjs().hour() * 60 + dayjs().minute() : null;

    // Build a map of available 30-min slots from the API
    const dayEntry = availabilityData.find(d => d.date === dateString);
    const slots = dayEntry?.slots || [];
    // If instructor selected, filter to their slots; otherwise use all
    const relevantSlots = selectedInstructorId
      ? slots.filter(s => String(s.instructorId) === String(selectedInstructorId))
      : slots;
    const slotByTime = new Map(relevantSlots.map(s => [s.time, s]));

    return PRESET_SLOTS.map(preset => {
      const startMin = timeToMin(preset.start);
      // Skip past slots today
      if (nowMin !== null && startMin < nowMin + 30) return { value: preset.start, label: `${preset.start} – ${preset.end}`, disabled: true };
      // If no date selected yet, show all as available (we don't know yet)
      if (!dateString) return { value: preset.start, label: `${preset.start} – ${preset.end}`, disabled: false };
      // Check every 30-min sub-slot
      let available = true;
      for (let step = 0; step < stepsNeeded; step++) {
        const t = minToTime(startMin + step * HALF_HOUR);
        const slot = slotByTime.get(t);
        // If no instructor selected, check if ANY instructor has this slot available
        if (!selectedInstructorId) {
          const anyAvailable = slots.some(s => s.time === t && s.status === 'available');
          if (!anyAvailable && slots.length > 0) { available = false; break; }
        } else {
          if (!slot || slot.status !== 'available') { available = false; break; }
        }
      }
      return { value: preset.start, label: `${preset.start} – ${preset.end}`, disabled: !available };
    });
  }, [availabilityData, dateString, selectedDate, selectedInstructorId]);

  const selectedService = useMemo(() => services.find(s => s.id === selectedServiceId), [services, selectedServiceId]);

  const selectedPackage = useMemo(() => packages.find(p => p.id === selectedPackageId), [packages, selectedPackageId]);

  // Only show packages linked to the service chosen in step 1
  const filteredPackages = useMemo(() => {
    if (!selectedServiceId) return [];
    return packages.filter(p => String(p.lessonServiceId || '') === String(selectedServiceId));
  }, [packages, selectedServiceId]);

  // For individual: 2h × service hourly rate, locked. For package: package price.
  const individualPrice = useMemo(() => {
    const hourlyRate = Number(selectedService?.price || selectedService?.base_price || 0);
    return hourlyRate * 2;
  }, [selectedService]);

  const pricePerPerson = useMemo(() => {
    if (bookingType === 'package' && selectedPackage) return Number(selectedPackage.price || 0);
    if (bookingType === 'individual') return individualPrice;
    return 0;
  }, [bookingType, selectedPackage, individualPrice]);

  const createMutation = useMutation({
    mutationFn: async (values) => {
      const dur = bookingType === 'package' && selectedPackage
        ? Number(selectedPackage.duration_hours || selectedPackage.total_hours || values.durationHours || 2)
        : (values.durationHours || 2);
      // date may be a dayjs object or string depending on whether step 0 is mounted
      const dateVal = values.date;
      const scheduledDate = dateVal && typeof dateVal === 'object' && dateVal.format
        ? dateVal.format('YYYY-MM-DD')
        : typeof dateVal === 'string' ? dayjs(dateVal).format('YYYY-MM-DD') : selectedDate?.format('YYYY-MM-DD');
      return createGroupBooking({
        serviceId: values.serviceId || selectedServiceId,
        instructorId: values.instructorId || selectedInstructorId || null,
        title: values.title,
        description: values.description || null,
        maxParticipants: values.maxParticipants || 2,
        minParticipants: values.minParticipants || 2,
        pricePerPerson: bookingType === 'individual' ? individualPrice : (values.pricePerPerson || pricePerPerson),
        currency: userCurrency || 'EUR',
        scheduledDate,
        startTime: values.startTime,
        endTime: values.endTime || null,
        durationHours: dur,
        paymentModel,
        packageId: bookingType === 'package' ? selectedPackageId : undefined,
        createPackageForParticipants: paymentModel === 'organizer_pays',
        generateLink: true,
        notes: values.notes || null,
      });
    },
    onSuccess: async (data) => {
      if (data?.roleUpgrade?.upgraded && refreshToken) await refreshToken();
      message.success('Group lesson created!');
      navigate(`/student/group-bookings/${data.groupBooking.id}`);
    },
    onError: (err) => { message.error(err.response?.data?.error || 'Failed to create group lesson'); setCreating(false); },
  });

  const handleSubmit = async () => {
    try {
      // Fields were already validated in step 0 and 1 via handleNext.
      // Use getFieldsValue (not validateFields) since form items from previous steps are unmounted.
      const values = form.getFieldsValue(true);
      if (!values.serviceId || !values.title || !values.startTime) {
        message.warning('Missing required fields. Please go back and fill them in.');
        return;
      }
      setCreating(true);
      createMutation.mutate(values);
    } catch {
      message.warning('Please fill in all required fields');
    }
  };

  const handleNext = async () => {
    try {
      if (currentStep === 0) await form.validateFields(['serviceId', 'title', 'date', 'startTime', 'durationHours']);
      else if (currentStep === 1) {
        if (bookingType === 'package' && !selectedPackageId) { message.warning('Please select a package'); return; }
        const fieldsToValidate = ['maxParticipants', 'minParticipants'];
        if (bookingType === 'package') fieldsToValidate.push('pricePerPerson');
        await form.validateFields(fieldsToValidate);
      }
      setCurrentStep(prev => prev + 1);
    } catch { message.warning('Please fill in all required fields'); }
  };

  const goBack = () => navigate('/student/schedule?tab=group');

  return (
    <div className="max-w-xl mx-auto">
      {/* Back */}
      <button type="button" onClick={goBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-gotham-medium mb-4 transition-colors">
        <ArrowLeftIcon className="w-4 h-4" /> Back to Group Lessons
      </button>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <UserGroupIcon className="w-5 h-5 text-duotone-blue" />
          <h1 className="font-duotone-bold text-xl text-slate-900">Create Group Lesson</h1>
        </div>
        <p className="text-sm text-slate-500">Organize a lesson and invite friends to join</p>
      </div>

      {/* Steps */}
      <StepIndicator current={currentStep} />

      {/* Form card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
        <Form form={form} layout="vertical" requiredMark={false}>

          {/* ── Step 0: Lesson Details ── */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <Form.Item name="title" rules={[{ required: true, message: 'Give your group a name' }]}
                label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Group Name</span>}
                initialValue={prefill.packageData?.name ? `${prefill.packageData.name} — Group` : ''}>
                <Input placeholder="e.g., Weekend Kite Session" size="large" maxLength={100} className="!rounded-xl" />
              </Form.Item>

              <Form.Item name="serviceId" rules={[{ required: true, message: 'Select a lesson type' }]}
                label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Lesson Type</span>}
                initialValue={prefill.serviceId}>
                <Select placeholder="Choose a lesson type" size="large" loading={servicesLoading} showSearch optionFilterProp="label" className="!rounded-xl"
                  onChange={(val) => { setSelectedServiceId(val); setSelectedPackageId(null); }}
                  options={services.map(s => ({ value: s.id, label: s.name || s.title }))} />
              </Form.Item>

              <Form.Item name="instructorId"
                label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Preferred Instructor (optional)</span>}>
                <Select placeholder="Any instructor" size="large" loading={instructorsLoading} allowClear showSearch optionFilterProp="label" className="!rounded-xl"
                  onChange={(val) => { setSelectedInstructorId(val || null); form.setFieldValue('startTime', undefined); }}
                  options={instructors.map(i => ({ value: i.id, label: `${i.first_name || ''} ${i.last_name || ''}`.trim() || i.name || i.email }))} />
              </Form.Item>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="date" rules={[{ required: true, message: 'Pick a date' }]}
                  label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Date</span>}>
                  <DatePicker className="w-full !rounded-xl" size="large" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} format="ddd, MMM D"
                    onChange={(d) => { setSelectedDate(d); form.setFieldValue('startTime', undefined); }} />
                </Form.Item>

                <Form.Item name="startTime" rules={[{ required: true, message: 'Pick a time' }]}
                  label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Time Slot</span>}>
                  <Select placeholder="Select time" size="large" className="!rounded-xl"
                    options={timeSlotOptions.map(opt => ({
                      value: opt.value,
                      label: opt.disabled
                        ? <span className="text-slate-400 line-through">{opt.label}</span>
                        : <span className="text-slate-800">{opt.label}</span>,
                      disabled: opt.disabled,
                    }))}
                  />
                </Form.Item>
              </div>

              <Form.Item name="durationHours" rules={[{ required: true }]} initialValue={prefill.durationHours || 2}
                label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Duration</span>}>
                <Select size="large" className="!rounded-xl" options={[
                  { value: 1, label: '1 hour' }, { value: 1.5, label: '1.5 hours' }, { value: 2, label: '2 hours' }, { value: 3, label: '3 hours' },
                ]} />
              </Form.Item>

              <Form.Item name="description"
                label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Description (optional)</span>}>
                <Input.TextArea placeholder="What will you be doing? Any notes for participants..." rows={2} maxLength={500} className="!rounded-xl" />
              </Form.Item>
            </div>
          )}

          {/* ── Step 1: Group Settings ── */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Booking type — package or individual */}
              <div>
                <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-2">Booking Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'package', title: 'Package', desc: 'Select a lesson package with set pricing' },
                    { value: 'individual', title: '2h Individual', desc: `2h × ${formatCurrency(Number(selectedService?.price || 0), 'EUR')}/h = ${formatCurrency(individualPrice, 'EUR')} per person` },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => { setBookingType(opt.value); setSelectedPackageId(null); form.setFieldValue('pricePerPerson', opt.value === 'individual' ? individualPrice : 0); }}
                      className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${
                        bookingType === opt.value ? 'border-duotone-blue bg-duotone-blue/5' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <p className={`text-sm font-duotone-bold ${bookingType === opt.value ? 'text-duotone-blue' : 'text-slate-800'}`}>{opt.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Package selector */}
              {bookingType === 'package' && (
                <div>
                  <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-2">Select Package</p>
                  {packagesLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="h-5 w-5 border-2 border-slate-200 border-t-duotone-blue rounded-full animate-spin" />
                    </div>
                  ) : filteredPackages.length === 0 ? (
                    <p className="text-sm text-slate-400 py-3">No packages available for this lesson type.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {filteredPackages.map(pkg => {
                        const isSelected = selectedPackageId === pkg.id;
                        const name = pkg.name || pkg.title || 'Package';
                        const hours = pkg.total_hours || pkg.duration_hours || pkg.sessions_count || '';
                        const price = Number(pkg.price || 0);
                        return (
                          <button key={pkg.id} type="button" onClick={() => { setSelectedPackageId(pkg.id); form.setFieldValue('pricePerPerson', price); }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                              isSelected ? 'border-duotone-blue bg-duotone-blue/5' : 'border-slate-100 hover:border-slate-200'
                            }`}>
                            <div className="min-w-0">
                              <p className={`text-sm truncate ${isSelected ? 'font-duotone-bold text-duotone-blue' : 'font-gotham-medium text-slate-800'}`}>{name}</p>
                              {hours && <p className="text-[11px] text-slate-400">{hours}h total</p>}
                            </div>
                            <span className={`shrink-0 text-sm font-duotone-bold ${isSelected ? 'text-duotone-blue' : 'text-slate-600'}`}>
                              {formatCurrency(price, 'EUR')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Payment model */}
              <div>
                <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-2">Payment Model</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'individual', title: 'Everyone Pays', desc: 'Each pays their share' },
                    { value: 'organizer_pays', title: 'I Pay for All', desc: 'You cover everyone' },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setPaymentModel(opt.value)}
                      className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${
                        paymentModel === opt.value ? 'border-duotone-blue bg-duotone-blue/5' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <p className={`text-sm font-duotone-bold ${paymentModel === opt.value ? 'text-duotone-blue' : 'text-slate-800'}`}>{opt.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="maxParticipants" rules={[{ required: true }]} initialValue={2}
                  label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Max Participants</span>}>
                  <InputNumber min={2} max={30} size="large" className="w-full !rounded-xl" />
                </Form.Item>
                <Form.Item name="minParticipants" rules={[{ required: true }]} initialValue={2}
                  label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Min to Confirm</span>}>
                  <InputNumber min={2} max={30} size="large" className="w-full !rounded-xl" />
                </Form.Item>
              </div>

              {/* Price — read-only for individual, editable for package */}
              <div>
                <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-2">Price per Person</p>
                {bookingType === 'individual' ? (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">2h × {formatCurrency(Number(selectedService?.price || 0), 'EUR')}/h</span>
                      <span className="text-lg font-duotone-bold text-slate-900">{formatCurrency(individualPrice, 'EUR')}</span>
                    </div>
                  </div>
                ) : (
                  <Form.Item name="pricePerPerson" rules={[{ required: true, message: 'Set price' }]} noStyle>
                    <InputNumber min={0} step={5} size="large" className="w-full !rounded-xl"
                      prefix={<CurrencyEuroIcon className="w-4 h-4 text-slate-400" />}
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(v) => v.replace(/,/g, '')} />
                  </Form.Item>
                )}
                {bookingType === 'package' && selectedPackage && (
                  <p className="text-[11px] text-emerald-600 mt-1">From package: {selectedPackage.name}</p>
                )}
              </div>

              {/* Cost summary for "I Pay for All" */}
              {paymentModel === 'organizer_pays' && pricePerPerson > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-amber-600 mb-1.5">You will pay</p>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-amber-800">{form.getFieldValue('maxParticipants') || 2} participants × {formatCurrency(pricePerPerson, 'EUR')}</span>
                    <span className="text-lg font-duotone-bold text-amber-900">{formatCurrency(pricePerPerson * (form.getFieldValue('maxParticipants') || 2), 'EUR')}</span>
                  </div>
                  <p className="text-[11px] text-amber-600 mt-1">A package will be activated for each participant's account.</p>
                </div>
              )}

              <Form.Item name="notes"
                label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Notes (optional)</span>}>
                <Input.TextArea placeholder="Special requirements or instructions..." rows={2} maxLength={500} className="!rounded-xl" />
              </Form.Item>
            </div>
          )}

          {/* ── Step 2: Review & Create ── */}
          {currentStep === 2 && (() => {
            const v = form.getFieldsValue();
            const svc = selectedService;
            const pkg = selectedPackage;
            const dateLabel = v.date ? dayjs(v.date).format('ddd, MMM D, YYYY') : 'TBD';
            const timeSlot = PRESET_SLOTS.find(s => s.start === v.startTime);
            const timeLabel = timeSlot ? `${timeSlot.start} – ${timeSlot.end}` : v.startTime || 'TBD';
            const price = bookingType === 'individual' ? individualPrice : (v.pricePerPerson || 0);
            const instructor = instructors.find(i => i.id === v.instructorId);
            const instructorLabel = instructor ? `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim() || instructor.name : 'Any instructor';

            return (
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
                  {[
                    { label: 'Group Name', value: v.title },
                    { label: 'Lesson', value: svc?.name || 'Not selected' },
                    { label: 'Instructor', value: instructorLabel },
                    { label: 'Date & Time', value: `${dateLabel} — ${timeLabel}` },
                    { label: 'Duration', value: `${v.durationHours || 2}h` },
                    { label: 'Booking Type', value: bookingType === 'package' ? `Package: ${pkg?.name || 'Selected'}` : '2h Individual Lesson' },
                    { label: 'Price / Person', value: formatCurrency(price, 'EUR') },
                    { label: 'Payment', value: paymentModel === 'organizer_pays' ? 'You pay for all' : 'Everyone pays' },
                    { label: 'Participants', value: `${v.minParticipants || 2} – ${v.maxParticipants || 2}` },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[11px] font-gotham-medium text-slate-400 uppercase tracking-wider">{row.label}</span>
                      <span className="text-sm font-gotham-medium text-slate-800 text-right">{row.value}</span>
                    </div>
                  ))}
                </div>

                {paymentModel === 'organizer_pays' && price > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-amber-800">Total you pay</span>
                      <span className="text-lg font-duotone-bold text-amber-900">{formatCurrency(price * (v.maxParticipants || 2), 'EUR')}</span>
                    </div>
                  </div>
                )}

                {/* Invite link info */}
                <div className="rounded-xl bg-duotone-blue/5 border border-duotone-blue/20 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <SparklesIcon className="w-4 h-4 text-duotone-blue" />
                    <p className="text-xs text-duotone-blue font-gotham-medium">Invite link</p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    After creating, you'll get a shareable invite link. Send it to friends so they can join — even without an account. You can also invite more people later from the group details page.
                  </p>
                </div>
              </div>
            );
          })()}
        </Form>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        {currentStep > 0 ? (
          <button type="button" onClick={() => setCurrentStep(prev => prev - 1)}
            className="px-4 py-2.5 rounded-xl text-sm font-gotham-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
            Previous
          </button>
        ) : <div />}

        {currentStep < 2 ? (
          <button type="button" onClick={handleNext}
            className="px-5 py-2.5 rounded-xl text-sm font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors">
            Next
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={creating || createMutation.isPending}
            className="px-5 py-2.5 rounded-xl text-sm font-duotone-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #00a8c4, #0891b2)', boxShadow: '0 4px 14px rgba(0,168,196,0.25)' }}>
            {creating || createMutation.isPending ? 'Creating...' : 'Create Group Lesson'}
          </button>
        )}
      </div>
    </div>
  );
};

export default GroupBookingCreatePage;
