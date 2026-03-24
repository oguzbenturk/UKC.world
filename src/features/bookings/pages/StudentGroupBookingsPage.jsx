/**
 * Student Group Bookings Page — Redesigned
 *
 * Sections:
 * 1. Partner Invites (accept/decline)
 * 2. My Group Bookings (organized + participating)
 * 3. My Requests (pending solo match requests)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Spin,
  Empty,
  Tag,
  Progress,
  Popconfirm,
  Modal,
  DatePicker,
  TimePicker,
  Input,
  message,
} from 'antd';
import {
  UserGroupIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  EyeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  StarIcon,
  SparklesIcon,
  XMarkIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { acceptGroupBookingById, declineGroupBookingById, suggestTime } from '../services/groupBookingService';
import { getGroupLessonRequests, cancelGroupLessonRequest } from '../services/groupLessonRequestService';
import { usePageSEO } from '@/shared/utils/seo';
import StudentGroupBookingDetailDrawer from '../components/StudentGroupBookingDetailDrawer';

const { Title, Text } = Typography;

const statusColors = {
  pending: 'orange',
  pending_partner: 'volcano',
  confirmed: 'blue',
  in_progress: 'processing',
  completed: 'green',
  cancelled: 'red',
};

const formatDate = (d) => (d ? dayjs(d).format('ddd, MMM D, YYYY') : 'TBD');
const formatTime = (t) => t || 'TBD';

const StudentGroupBookingsPage = () => {
  usePageSEO({ title: 'My Group Lessons', description: 'Manage group lessons and invites' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [suggestModal, setSuggestModal] = useState({ open: false, bookingId: null, title: '', isPartnerInvite: false });
  const [suggestDate, setSuggestDate] = useState(null);
  const [suggestTimeVal, setSuggestTimeVal] = useState(null);
  const [suggestMsg, setSuggestMsg] = useState('');

  /* ─── Data ──────────────────────────────────────────── */
  const { data: invites = [], isLoading: loadingInvites } = useQuery({
    queryKey: ['partner-invites'],
    queryFn: async () => {
      const res = await apiClient.get('/bookings/pending-partner-invites');
      return res.data?.invites || [];
    },
    staleTime: 15_000,
  });

  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['my-group-bookings'],
    queryFn: async () => {
      const res = await apiClient.get('/group-bookings');
      return res.data?.groupBookings || [];
    },
    staleTime: 30_000,
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['my-group-requests'],
    queryFn: async () => {
      const res = await getGroupLessonRequests();
      return res.requests || res || [];
    },
    staleTime: 30_000,
  });

  const isLoading = loadingInvites || loadingBookings || loadingRequests;

  /* ─── Mutations ─────────────────────────────────────── */
  const acceptMutation = useMutation({
    mutationFn: (bookingId) => apiClient.post(`/bookings/${bookingId}/confirm-partner`),
    onSuccess: () => {
      message.success('Invite accepted! The lesson is now pending confirmation.');
      queryClient.invalidateQueries({ queryKey: ['partner-invites'] });
      queryClient.invalidateQueries({ queryKey: ['my-group-bookings'] });
    },
    onError: (err) => message.error(err.response?.data?.error || 'Failed to accept'),
  });

  const declineMutation = useMutation({
    mutationFn: (bookingId) => apiClient.post(`/bookings/${bookingId}/decline-partner`),
    onSuccess: () => {
      message.info('Invite declined. Package hours refunded.');
      queryClient.invalidateQueries({ queryKey: ['partner-invites'] });
    },
    onError: (err) => message.error(err.response?.data?.error || 'Failed to decline'),
  });

  const acceptGroupMutation = useMutation({
    mutationFn: (id) => acceptGroupBookingById(id),
    onSuccess: () => {
      message.success('Group lesson accepted!');
      queryClient.invalidateQueries({ queryKey: ['my-group-bookings'] });
    },
    onError: (err) => message.error(err.response?.data?.error || 'Failed to accept'),
  });

  const declineGroupMutation = useMutation({
    mutationFn: (id) => declineGroupBookingById(id),
    onSuccess: () => {
      message.info('Group lesson declined.');
      queryClient.invalidateQueries({ queryKey: ['my-group-bookings'] });
    },
    onError: (err) => message.error(err.response?.data?.error || 'Failed to decline'),
  });

  const suggestTimeMutation = useMutation({
    mutationFn: ({ id, data }) => suggestTime(id, data),
    onSuccess: () => {
      message.success('Time suggestion sent to organizer!');
      setSuggestModal({ open: false, bookingId: null, title: '', isPartnerInvite: false });
      setSuggestDate(null);
      setSuggestTimeVal(null);
      setSuggestMsg('');
      queryClient.invalidateQueries({ queryKey: ['my-group-bookings'] });
    },
    onError: (err) => message.error(err.response?.data?.error || 'Failed to suggest time'),
  });

  const suggestPartnerTimeMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.post(`/bookings/${id}/suggest-time`, data),
    onSuccess: () => {
      message.success('Time suggestion sent to the organizer!');
      setSuggestModal({ open: false, bookingId: null, title: '', isPartnerInvite: false });
      setSuggestDate(null);
      setSuggestTimeVal(null);
      setSuggestMsg('');
    },
    onError: (err) => message.error(err.response?.data?.error || 'Failed to suggest time'),
  });

  const cancelRequestMutation = useMutation({
    mutationFn: (requestId) => cancelGroupLessonRequest(requestId),
    onSuccess: () => {
      message.success('Request cancelled');
      queryClient.invalidateQueries({ queryKey: ['my-group-requests'] });
    },
    onError: (err) => message.error(err.response?.data?.error || 'Failed to cancel'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spin size="large" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <UserGroupIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <Title level={3} className="!mb-0 !text-slate-800">Group Lessons</Title>
            <Text className="text-slate-500 text-sm">Invites, bookings &amp; requests</Text>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            className="!rounded-xl"
            icon={<SparklesIcon className="w-4 h-4" />}
            onClick={() => navigate('/student/group-bookings/request')}
          >
            Find a Partner
          </Button>
          <Button
            type="primary"
            className="!rounded-xl"
            icon={<PlusIcon className="w-4 h-4" />}
            onClick={() => navigate('/student/group-bookings/create')}
          >
            New Group
          </Button>
        </div>
      </div>

      {/* ─── Section 1: Partner Invites ─────────────────── */}
      {invites.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Pending Invites
          </h4>
          <div className="space-y-3">
            {invites.map((inv) => (
              <div
                key={inv.bookingId}
                className="relative overflow-hidden rounded-2xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                        <UserGroupIcon className="w-3.5 h-3.5" /> Invite
                      </span>
                      <Tag color="volcano" className="!rounded-full !text-xs !m-0">
                        Waiting Your Response
                      </Tag>
                    </div>
                    <p className="text-base font-semibold text-slate-800 mb-1">
                      {inv.bookerName} invited you to a lesson
                    </p>
                    <p className="text-sm text-slate-600 mb-3">{inv.serviceName}</p>

                    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4 text-slate-400" />
                        {formatDate(inv.date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ClockIcon className="w-4 h-4 text-slate-400" />
                        {formatTime(inv.startTime)} &middot; {inv.duration}h
                      </span>
                    </div>

                    {inv.packageRemainingHours != null && (
                      <p className="text-xs text-slate-400 mt-2">
                        {inv.duration}h from your package &middot; {inv.packageRemainingHours}h remaining after
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex sm:flex-col gap-2 sm:justify-center flex-shrink-0">
                    <Button
                      type="primary"
                      size="large"
                      className="!bg-emerald-600 !border-emerald-600 hover:!bg-emerald-500 !rounded-xl !font-semibold !min-w-[120px]"
                      icon={<CheckCircleIcon className="w-4 h-4" />}
                      loading={acceptMutation.isPending}
                      onClick={() => acceptMutation.mutate(inv.bookingId)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="large"
                      className="!rounded-xl !min-w-[120px]"
                      icon={<XMarkIcon className="w-4 h-4" />}
                      loading={declineMutation.isPending}
                      onClick={() => declineMutation.mutate(inv.bookingId)}
                    >
                      Decline
                    </Button>
                    <Button
                      size="large"
                      className="!rounded-xl !min-w-[120px]"
                      icon={<ArrowPathIcon className="w-4 h-4" />}
                      onClick={() => setSuggestModal({ open: true, bookingId: inv.bookingId, title: inv.serviceName || 'Lesson', isPartnerInvite: true })}
                    >
                      Suggest Time
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Section 2: My Group Bookings ──────────────── */}
      <section>
        <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          My Group Bookings
        </h4>
        {bookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span className="text-slate-500">No group bookings yet</span>}
            >
              <Button
                type="primary"
                className="!rounded-xl"
                onClick={() => navigate('/student/group-bookings/create')}
              >
                Create a Group Lesson
              </Button>
            </Empty>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => {
              const isPast = dayjs(b.scheduledDate).isBefore(dayjs(), 'day');
              const participantPct = Math.round(
                (b.participantCount / b.maxParticipants) * 100
              );
              const needsResponse = !b.iAmOrganizer && !['confirmed', 'completed', 'cancelled'].includes(b.status) && b.myStatus !== 'declined';
              return (
                <div
                  key={b.id}
                  className={`bg-white rounded-2xl border ${needsResponse ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'} p-5 hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer ${isPast ? 'opacity-60' : ''}`}
                  onClick={() => setSelectedBookingId(b.id)}
                >
                  {needsResponse && (
                    <div className="mb-3 -mt-1">
                      <Tag color="warning" className="!rounded-full !text-xs !font-semibold">
                        Action Required — Please respond
                      </Tag>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                          <UserGroupIcon className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-base truncate mb-0">
                            {b.title}
                          </p>
                          <p className="text-slate-500 text-sm mb-0 truncate">
                            {b.serviceName}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {b.scheduledDate && (
                          <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            {dayjs(b.scheduledDate).format('MMM D, YYYY')}
                          </span>
                        )}
                        {b.startTime && (
                          <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">
                            <ClockIcon className="w-3.5 h-3.5" />
                            {b.startTime}
                          </span>
                        )}
                        <Tag
                          color={statusColors[b.status] || 'default'}
                          className="!rounded-lg !text-xs !px-2 !m-0"
                        >
                          {b.status?.replace('_', ' ')}
                        </Tag>
                        {b.iAmOrganizer && (
                          <Tag color="gold" className="!rounded-lg !text-xs !px-2 !m-0">
                            <StarIcon className="w-3 h-3 inline mr-0.5" /> Organizer
                          </Tag>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">Participants</span>
                          <span className="text-xs font-medium text-slate-700">
                            {b.participantCount}/{b.maxParticipants}
                            <span className="text-slate-400 ml-1">
                              · {b.paidCount} paid
                            </span>
                          </span>
                        </div>
                        <Progress
                          percent={participantPct}
                          size="small"
                          showInfo={false}
                          strokeColor={participantPct === 100 ? '#10b981' : '#3b82f6'}
                          trailColor="#e2e8f0"
                        />
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-800 mb-0">
                          € {b.pricePerPerson?.toFixed(2)}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            b.myPaymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : b.myPaymentStatus === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {b.myPaymentStatus === 'paid' && (
                            <CheckCircleIcon className="w-3 h-3" />
                          )}
                          {b.myPaymentStatus === 'pending' && (
                            <ExclamationCircleIcon className="w-3 h-3" />
                          )}
                          {b.myPaymentStatus}
                        </span>
                      </div>
                      <Button
                        size="small"
                        className="!rounded-lg"
                        icon={<EyeIcon className="w-3.5 h-3.5" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBookingId(b.id);
                        }}
                      >
                        Details
                      </Button>
                    </div>
                  </div>

                  {/* Action buttons when invited */}
                  {needsResponse && (
                    <div className="mt-4 pt-3 border-t border-amber-100 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="primary"
                        className="!rounded-xl !bg-emerald-600 !border-emerald-600 hover:!bg-emerald-500 !font-semibold"
                        icon={<CheckCircleIcon className="w-4 h-4" />}
                        loading={acceptGroupMutation.isPending}
                        onClick={() => acceptGroupMutation.mutate(b.id)}
                      >
                        Accept
                      </Button>
                      <Popconfirm
                        title="Decline this group lesson?"
                        description="You'll be removed from the group."
                        onConfirm={() => declineGroupMutation.mutate(b.id)}
                      >
                        <Button
                          className="!rounded-xl"
                          icon={<XMarkIcon className="w-4 h-4" />}
                          loading={declineGroupMutation.isPending}
                        >
                          Decline
                        </Button>
                      </Popconfirm>
                      <Button
                        className="!rounded-xl"
                        icon={<ArrowPathIcon className="w-4 h-4" />}
                        onClick={() => setSuggestModal({ open: true, bookingId: b.id, title: b.title, isPartnerInvite: false })}
                      >
                        Suggest Another Time
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Section 3: My Requests ────────────────────── */}
      {requests.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            My Matching Requests
          </h4>
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <SparklesIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm mb-0">
                        {req.service_name || req.serviceName || 'Lesson'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                          <CalendarIcon className="w-3 h-3" />
                          {dayjs(
                            req.preferred_date_start || req.preferredDateStart
                          ).format('MMM D')}
                          {(req.preferred_date_end || req.preferredDateEnd) &&
                            ` – ${dayjs(
                              req.preferred_date_end || req.preferredDateEnd
                            ).format('MMM D')}`}
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                          {req.preferred_time_of_day ||
                            req.preferredTimeOfDay ||
                            'any'}
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                          {req.skill_level || req.skillLevel || 'any'}
                        </span>
                        <Tag
                          color={
                            req.status === 'pending'
                              ? 'orange'
                              : req.status === 'matched'
                              ? 'green'
                              : 'default'
                          }
                          className="!rounded-lg !text-xs !px-2 !m-0"
                        >
                          {req.status}
                        </Tag>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {req.status === 'matched' && req.matched_group_booking_id && (
                      <Button
                        size="small"
                        className="!rounded-lg"
                        icon={<EyeIcon className="w-3.5 h-3.5" />}
                        onClick={() =>
                          setSelectedBookingId(req.matched_group_booking_id)
                        }
                      >
                        View
                      </Button>
                    )}
                    {req.status === 'pending' && (
                      <Popconfirm
                        title="Cancel this request?"
                        onConfirm={() => cancelRequestMutation.mutate(req.id)}
                      >
                        <Button
                          size="small"
                          danger
                          className="!rounded-lg"
                          loading={cancelRequestMutation.isPending}
                          icon={<XMarkIcon className="w-3.5 h-3.5" />}
                        >
                          Cancel
                        </Button>
                      </Popconfirm>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state when nothing at all */}
      {invites.length === 0 && bookings.length === 0 && requests.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="text-slate-500">
                No group lessons or invites yet
              </span>
            }
          >
            <div className="flex gap-2 justify-center mt-2">
              <Button
                className="!rounded-xl"
                icon={<SparklesIcon className="w-4 h-4" />}
                onClick={() => navigate('/student/group-bookings/request')}
              >
                Find a Partner
              </Button>
              <Button
                type="primary"
                className="!rounded-xl"
                icon={<PlusIcon className="w-4 h-4" />}
                onClick={() => navigate('/student/group-bookings/create')}
              >
                Create a Group
              </Button>
            </div>
          </Empty>
        </div>
      )}

      {/* Suggest Time Modal */}
      <Modal
        title={`Suggest Another Time — ${suggestModal.title || 'Group Lesson'}`}
        open={suggestModal.open}
        onCancel={() => { setSuggestModal({ open: false, bookingId: null, title: '', isPartnerInvite: false }); setSuggestDate(null); setSuggestTimeVal(null); setSuggestMsg(''); }}
        okText="Send Suggestion"
        okButtonProps={{
          loading: suggestModal.isPartnerInvite ? suggestPartnerTimeMutation.isPending : suggestTimeMutation.isPending,
          disabled: !suggestDate,
        }}
        onOk={() => {
          const payload = {
            id: suggestModal.bookingId,
            data: {
              suggestedDate: suggestDate?.format('YYYY-MM-DD'),
              suggestedTime: suggestTimeVal?.format('HH:mm'),
              message: suggestMsg || undefined,
            },
          };
          if (suggestModal.isPartnerInvite) {
            suggestPartnerTimeMutation.mutate(payload);
          } else {
            suggestTimeMutation.mutate(payload);
          }
        }}
      >
        <div className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Date *</label>
            <DatePicker
              className="w-full !rounded-xl"
              value={suggestDate}
              onChange={setSuggestDate}
              disabledDate={(d) => d && d.isBefore(dayjs(), 'day')}
              format="YYYY-MM-DD"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Time (optional)</label>
            <TimePicker
              className="w-full !rounded-xl"
              value={suggestTimeVal}
              onChange={setSuggestTimeVal}
              format="HH:mm"
              minuteStep={15}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message (optional)</label>
            <Input.TextArea
              className="!rounded-xl"
              rows={3}
              placeholder="Let the organizer know why this time works better..."
              value={suggestMsg}
              onChange={(e) => setSuggestMsg(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Detail Drawer */}
      <StudentGroupBookingDetailDrawer
        bookingId={selectedBookingId}
        open={!!selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['my-group-bookings'] });
        }}
      />
    </div>
  );
};

export default StudentGroupBookingsPage;