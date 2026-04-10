/**
 * GroupLessonRequestPage
 *
 * Form for students who want a group lesson but don't have a partner.
 * They submit preferences, and management matches them.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Select, DatePicker, Input } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ArrowLeftIcon,
  SparklesIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useQuery, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { createGroupLessonRequest } from '../services/groupLessonRequestService';
import { usePageSEO } from '@/shared/utils/seo';

const { RangePicker } = DatePicker;

const TIMES = [
  { value: 'any', label: 'Any time' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

const DURATIONS = [
  { value: 0.5, label: '30 min' },
  { value: 1, label: '1 hour' },
  { value: 1.5, label: '1.5 hours' },
  { value: 2, label: '2 hours' },
  { value: 3, label: '3 hours' },
];

const LEVELS = [
  { value: 'beginner', emoji: '\u{1F331}', label: 'Beginner' },
  { value: 'intermediate', emoji: '\u{1F3C4}', label: 'Intermediate' },
  { value: 'advanced', emoji: '\u{1F3C6}', label: 'Advanced' },
];

const GroupLessonRequestPage = () => {
  usePageSEO({ title: 'Request Group Lesson', description: 'Request to be matched with another student for a group lesson' });
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitted, setSubmitted] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState('beginner');
  const [selectedTime, setSelectedTime] = useState('any');

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['group-request', 'services'],
    queryFn: async () => {
      const res = await apiClient.get('/services', { params: { category: 'lesson' } });
      const data = Array.isArray(res.data) ? res.data : res.data?.services || [];
      const GROUP_CATEGORIES = ['group', 'semi-private', 'semi private'];
      return data.filter(s => {
        const isActive = s.status === 'active' || !s.status;
        const cat = (s.lessonCategoryTag || s.lesson_category_tag || '').toLowerCase();
        return isActive && GROUP_CATEGORIES.includes(cat);
      });
    },
    staleTime: 300_000,
  });

  const submitMutation = useMutation({
    mutationFn: (values) => {
      const dateRange = values.dateRange;
      return createGroupLessonRequest({
        serviceId: values.serviceId,
        preferredDateStart: dateRange[0].format('YYYY-MM-DD'),
        preferredDateEnd: dateRange[1] ? dateRange[1].format('YYYY-MM-DD') : null,
        preferredTimeOfDay: selectedTime,
        preferredDurationHours: values.preferredDurationHours || 1,
        skillLevel: selectedLevel,
        notes: values.notes || null,
      });
    },
    onSuccess: () => { setSubmitted(true); message.success("Request submitted! We'll match you with a partner soon."); },
    onError: (err) => message.error(err.response?.data?.error || err.message || 'Failed to submit request'),
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      submitMutation.mutate(values);
    } catch { message.warning('Please fill in all required fields'); }
  };

  const goBack = () => navigate('/student/schedule?tab=group');

  /* ── Success state ── */
  if (submitted) {
    return (
      <div className="max-w-md mx-auto pt-16 text-center">
        <div
          className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-5"
          style={{ animation: 'rateSuccessPop 400ms cubic-bezier(.34,1.56,.64,1) forwards' }}
        >
          <CheckCircleIcon className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="font-duotone-bold text-xl text-slate-900 mb-2">Request Submitted!</h2>
        <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
          We'll review your preferences and match you with a compatible partner. You'll be notified once a match is found.
        </p>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={goBack}
            className="px-4 py-2.5 rounded-xl text-sm font-gotham-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
            View My Requests
          </button>
          <button type="button" onClick={() => { setSubmitted(false); form.resetFields(); setSelectedLevel('beginner'); setSelectedTime('any'); }}
            className="px-4 py-2.5 rounded-xl text-sm font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors">
            Submit Another
          </button>
        </div>
        <style>{`@keyframes rateSuccessPop { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }`}</style>
      </div>
    );
  }

  /* ── Form ── */
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
          <SparklesIcon className="w-5 h-5 text-violet-500" />
          <h1 className="font-duotone-bold text-xl text-slate-900">Find a Partner</h1>
        </div>
        <p className="text-sm text-slate-500">Don't have a partner? Tell us your preferences and we'll match you.</p>
      </div>

      {/* How it works */}
      <div className="rounded-xl bg-violet-50/50 border border-violet-200/50 px-4 py-3 mb-5">
        <p className="text-xs text-violet-700 font-gotham-medium mb-1">How it works</p>
        <p className="text-xs text-violet-600/80 leading-relaxed">
          Submit your lesson preferences and we'll match you with another student who has similar preferences. Once matched, you'll both be notified.
        </p>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Form form={form} layout="vertical" requiredMark={false}>
          {/* Lesson type */}
          <Form.Item name="serviceId" label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">What would you like to learn?</span>}
            rules={[{ required: true, message: 'Please select a lesson type' }]} className="mb-4">
            <Select placeholder="Choose a lesson type" loading={servicesLoading} showSearch optionFilterProp="label" size="large" className="!rounded-xl"
              options={services.map(s => ({ value: s.id, label: s.name || s.title }))} />
          </Form.Item>

          {/* Dates */}
          <Form.Item name="dateRange" label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">When are you available?</span>}
            rules={[{ required: true, message: 'Please select dates' }]} className="mb-4">
            <RangePicker className="w-full" size="large" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')}
              format="ddd, MMM D" placeholder={['From', 'To (optional)']} allowEmpty={[false, true]} />
          </Form.Item>

          {/* Preferred time — custom buttons */}
          <div className="mb-4">
            <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-2">Preferred time</p>
            <div className="grid grid-cols-4 gap-2">
              {TIMES.map(t => (
                <button key={t.value} type="button" onClick={() => setSelectedTime(t.value)}
                  className={`py-2 rounded-xl text-xs font-gotham-medium transition-all border-2 ${
                    selectedTime === t.value
                      ? 'border-duotone-blue bg-duotone-blue/5 text-duotone-blue'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <Form.Item name="preferredDurationHours" initialValue={2}
            label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Session duration</span>} className="mb-4">
            <Select size="large" className="!rounded-xl" options={DURATIONS} />
          </Form.Item>

          {/* Skill level — custom buttons */}
          <div className="mb-4">
            <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-2">Your skill level</p>
            <div className="grid grid-cols-3 gap-2">
              {LEVELS.map(l => (
                <button key={l.value} type="button" onClick={() => setSelectedLevel(l.value)}
                  className={`py-3 rounded-xl text-sm font-gotham-medium transition-all border-2 ${
                    selectedLevel === l.value
                      ? 'border-duotone-blue bg-duotone-blue/5 text-duotone-blue'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  {l.emoji} {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <Form.Item name="notes" label={<span className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Anything else? (optional)</span>} className="mb-5">
            <Input.TextArea placeholder="e.g., I prefer a specific instructor, I'm flexible on dates..." rows={3} maxLength={500} className="!rounded-xl" />
          </Form.Item>

          {/* Submit */}
          <button type="button" onClick={handleSubmit} disabled={submitMutation.isPending}
            className="w-full h-12 rounded-2xl text-sm font-duotone-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #00a8c4, #0891b2)', boxShadow: '0 4px 14px rgba(0,168,196,0.25)' }}>
            {submitMutation.isPending ? 'Submitting...' : 'Submit Request'}
          </button>
        </Form>
      </div>
    </div>
  );
};

export default GroupLessonRequestPage;
