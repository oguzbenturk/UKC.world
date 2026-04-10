/**
 * Student Group Bookings Page
 *
 * Sections:
 * 1. Partner Invites (accept/decline)
 * 2. My Group Bookings (organized + participating)
 * 3. My Requests (pending solo match requests)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, DatePicker, TimePicker, Input, Popconfirm } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserGroupIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  CheckCircleIcon,
  StarIcon,
  SparklesIcon,
  XMarkIcon,
  ArrowPathIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { acceptGroupBookingById, declineGroupBookingById, suggestTime } from '../services/groupBookingService';
import { getGroupLessonRequests, cancelGroupLessonRequest } from '../services/groupLessonRequestService';
import { usePageSEO } from '@/shared/utils/seo';
import StudentGroupBookingDetailDrawer from '../components/StudentGroupBookingDetailDrawer';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';

/* ── Status config ── */
const STATUS = {
  pending:         { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  pending_partner: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  confirmed:       { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  in_progress:     { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed:       { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled:       { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
  matched:         { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const StatusPill = ({ status }) => {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-gotham-medium uppercase tracking-wider ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {(status || '').replace('_', ' ')}
    </span>
  );
};

const formatDate = (d) => (d ? dayjs(d).format('ddd, MMM D') : 'TBD');

/* ── Invite card ── */
const InviteCard = ({ inv, onAccept, onDecline, onSuggest, accepting, declining }) => (
  <div className="rounded-xl border-2 border-duotone-blue/20 bg-gradient-to-r from-duotone-blue/[0.03] to-transparent p-4">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 shrink-0 rounded-xl bg-duotone-blue/10 flex items-center justify-center">
        <UserGroupIcon className="w-5 h-5 text-duotone-blue" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-duotone-bold text-slate-900">{inv.bookerName} invited you</span>
          <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-px text-[9px] font-gotham-medium uppercase tracking-wider">Action needed</span>
        </div>
        <p className="text-sm text-slate-600 mb-2">{inv.serviceName}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" />{formatDate(inv.date)}</span>
          <span className="inline-flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" />{inv.startTime || 'TBD'} &middot; {inv.duration}h</span>
        </div>
        {inv.packageRemainingHours != null && (
          <p className="text-[11px] text-slate-400 mt-1.5">{inv.duration}h from your package &middot; {inv.packageRemainingHours}h remaining</p>
        )}
        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={() => onAccept(inv.bookingId)} disabled={accepting}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-gotham-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50">
            <CheckCircleIcon className="w-3.5 h-3.5" /> Accept
          </button>
          <button type="button" onClick={() => onDecline(inv.bookingId)} disabled={declining}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-gotham-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50">
            <XMarkIcon className="w-3.5 h-3.5" /> Decline
          </button>
          <button type="button" onClick={() => onSuggest(inv)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-gotham-medium text-duotone-blue border border-duotone-blue/30 bg-white hover:bg-duotone-blue/5 transition-colors">
            <ArrowPathIcon className="w-3.5 h-3.5" /> Suggest Time
          </button>
        </div>
      </div>
    </div>
  </div>
);

/* ── Booking row ── */
const BookingRow = ({ b, onClick, onAccept, onDecline, onSuggest, acceptLoading, declineLoading, formatPrice }) => {
  const isPast = dayjs(b.scheduledDate).isBefore(dayjs(), 'day');
  const pct = b.maxParticipants ? Math.round((b.participantCount / b.maxParticipants) * 100) : 0;
  const needsResponse = !b.iAmOrganizer && !['confirmed', 'completed', 'cancelled'].includes(b.status) && ['pending_acceptance', 'invited'].includes(b.myStatus);

  return (
    <div
      className={`group px-4 py-3 hover:bg-slate-50/80 transition-colors cursor-pointer ${isPast ? 'opacity-50' : ''}`}
      onClick={() => onClick(b.id)}
    >
      {needsResponse && (
        <div className="mb-2">
          <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-[9px] font-gotham-medium uppercase tracking-wider">Action Required</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        {/* Date block */}
        <div className="shrink-0 w-[100px]">
          {b.scheduledDate && <span className="block text-sm font-duotone-bold text-slate-900">{dayjs(b.scheduledDate).format('MMM D')}</span>}
          {b.startTime && <span className="block text-[11px] text-slate-500">{b.startTime}</span>}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-gotham-medium text-slate-800 truncate">{b.title}</span>
            {b.iAmOrganizer && (
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-amber-100 text-amber-700 px-1.5 py-px text-[8px] font-gotham-medium uppercase tracking-wider">
                <StarIcon className="w-2.5 h-2.5" /> Organizer
              </span>
            )}
          </div>
          <span className="block text-[11px] text-slate-400 truncate">{b.serviceName} &middot; {b.participantCount}/{b.maxParticipants} joined</span>
        </div>

        {/* Participants bar */}
        <div className="hidden sm:block shrink-0 w-20">
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : '#00a8c4' }} />
          </div>
        </div>

        {/* Price + status */}
        <div className="shrink-0 text-right">
          <span className="block text-sm font-duotone-bold text-slate-900">{formatPrice(b.pricePerPerson)}</span>
          <StatusPill status={b.status} />
        </div>

        <ChevronRightIcon className="w-4 h-4 text-slate-300 shrink-0 group-hover:text-slate-500 transition-colors" />
      </div>

      {/* Inline actions when response needed */}
      {needsResponse && (
        <div className="flex flex-wrap gap-2 mt-2.5 ml-[112px]" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => onAccept(b.id)} disabled={acceptLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-gotham-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50">
            <CheckCircleIcon className="w-3.5 h-3.5" /> Accept
          </button>
          <Popconfirm title="Decline this group lesson?" description="You'll be removed from the group." onConfirm={() => onDecline(b.id)}>
            <button type="button" disabled={declineLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-gotham-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50">
              <XMarkIcon className="w-3.5 h-3.5" /> Decline
            </button>
          </Popconfirm>
          <button type="button" onClick={() => onSuggest(b)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-gotham-medium text-duotone-blue border border-duotone-blue/30 bg-white hover:bg-duotone-blue/5 transition-colors">
            <ArrowPathIcon className="w-3.5 h-3.5" /> Suggest Time
          </button>
        </div>
      )}
    </div>
  );
};

/* ── Request row ── */
const RequestRow = ({ req, onView, onCancel, cancelling }) => (
  <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors">
    <div className="w-8 h-8 shrink-0 rounded-lg bg-violet-100 flex items-center justify-center">
      <SparklesIcon className="w-4 h-4 text-violet-600" />
    </div>
    <div className="flex-1 min-w-0">
      <span className="block text-sm font-gotham-medium text-slate-800 truncate">{req.service_name || req.serviceName || 'Lesson'}</span>
      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
        <span className="text-[11px] text-slate-500">
          {dayjs(req.preferred_date_start || req.preferredDateStart).format('MMM D')}
          {(req.preferred_date_end || req.preferredDateEnd) && ` – ${dayjs(req.preferred_date_end || req.preferredDateEnd).format('MMM D')}`}
        </span>
        <span className="text-slate-300">&middot;</span>
        <span className="text-[11px] text-slate-500">{req.preferred_time_of_day || req.preferredTimeOfDay || 'any time'}</span>
        <span className="text-slate-300">&middot;</span>
        <span className="text-[11px] text-slate-500">{req.skill_level || req.skillLevel || 'any level'}</span>
      </div>
    </div>
    <StatusPill status={req.status} />
    <div className="shrink-0 flex items-center gap-1.5">
      {req.status === 'matched' && req.matched_group_booking_id && (
        <button type="button" onClick={() => onView(req.matched_group_booking_id)}
          className="px-2.5 py-1 rounded-lg text-[11px] font-gotham-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
          View
        </button>
      )}
      {req.status === 'pending' && (
        <Popconfirm title="Cancel this request?" onConfirm={() => onCancel(req.id)}>
          <button type="button" disabled={cancelling}
            className="px-2.5 py-1 rounded-lg text-[11px] font-gotham-medium text-red-500 border border-red-200 bg-white hover:bg-red-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
        </Popconfirm>
      )}
    </div>
  </div>
);

/* ── Main ── */
const StudentGroupBookingsPage = () => {
  usePageSEO({ title: 'My Group Lessons', description: 'Manage group lessons and invites' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userCurrency, convertCurrency, formatCurrency } = useCurrency();
  const { refreshToken } = useAuth();
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [suggestModal, setSuggestModal] = useState({ open: false, bookingId: null, title: '', isPartnerInvite: false });
  const [suggestDate, setSuggestDate] = useState(null);
  const [suggestTimeVal, setSuggestTimeVal] = useState(null);
  const [suggestMsg, setSuggestMsg] = useState('');

  /* ─── Data ─── */
  const { data: invites = [], isLoading: loadingInvites } = useQuery({
    queryKey: ['partner-invites'],
    queryFn: async () => { const res = await apiClient.get('/bookings/pending-partner-invites'); return res.data?.invites || []; },
    staleTime: 15_000,
  });
  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['my-group-bookings'],
    queryFn: async () => { const res = await apiClient.get('/group-bookings'); return res.data?.groupBookings || []; },
    staleTime: 30_000,
  });
  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['my-group-requests'],
    queryFn: async () => { const res = await getGroupLessonRequests(); return res.requests || res || []; },
    staleTime: 30_000,
  });
  const isLoading = loadingInvites || loadingBookings || loadingRequests;

  /* ─── Mutations ─── */
  const invalidate = (...keys) => keys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));

  const acceptMutation = useMutation({
    mutationFn: (id) => apiClient.post(`/bookings/${id}/confirm-partner`),
    onSuccess: () => { message.success('Invite accepted!'); invalidate('partner-invites', 'my-group-bookings'); },
    onError: (e) => message.error(e.response?.data?.error || 'Failed to accept'),
  });
  const declineMutation = useMutation({
    mutationFn: (id) => apiClient.post(`/bookings/${id}/decline-partner`),
    onSuccess: () => { message.info('Invite declined.'); invalidate('partner-invites'); },
    onError: (e) => message.error(e.response?.data?.error || 'Failed to decline'),
  });
  const acceptGroupMutation = useMutation({
    mutationFn: (id) => acceptGroupBookingById(id),
    onSuccess: async (data) => {
      message.success('Group lesson accepted!');
      if (data?.roleUpgrade?.upgraded && refreshToken) await refreshToken();
      invalidate('my-group-bookings');
    },
    onError: (e) => message.error(e.response?.data?.error || 'Failed to accept'),
  });
  const declineGroupMutation = useMutation({
    mutationFn: (id) => declineGroupBookingById(id),
    onSuccess: () => { message.info('Group lesson declined.'); invalidate('my-group-bookings'); },
    onError: (e) => message.error(e.response?.data?.error || 'Failed to decline'),
  });
  const suggestTimeMutation = useMutation({
    mutationFn: ({ id, data }) => suggestTime(id, data),
    onSuccess: () => { message.success('Time suggestion sent!'); closeSuggestModal(); invalidate('my-group-bookings'); },
    onError: (e) => message.error(e.response?.data?.error || 'Failed to suggest time'),
  });
  const suggestPartnerTimeMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.post(`/bookings/${id}/suggest-time`, data),
    onSuccess: () => { message.success('Time suggestion sent!'); closeSuggestModal(); },
    onError: (e) => message.error(e.response?.data?.error || 'Failed to suggest time'),
  });
  const cancelRequestMutation = useMutation({
    mutationFn: (id) => cancelGroupLessonRequest(id),
    onSuccess: () => { message.success('Request cancelled'); invalidate('my-group-requests'); },
    onError: (e) => message.error(e.response?.data?.error || 'Failed to cancel'),
  });

  const openSuggest = (item, isPartner = false) => setSuggestModal({ open: true, bookingId: item.bookingId || item.id, title: item.serviceName || item.title || 'Lesson', isPartnerInvite: isPartner });
  const closeSuggestModal = () => { setSuggestModal({ open: false, bookingId: null, title: '', isPartnerInvite: false }); setSuggestDate(null); setSuggestTimeVal(null); setSuggestMsg(''); };
  const handleSuggestSubmit = () => {
    const payload = { id: suggestModal.bookingId, data: { suggestedDate: suggestDate?.format('YYYY-MM-DD'), suggestedTime: suggestTimeVal?.format('HH:mm'), message: suggestMsg || undefined } };
    if (suggestModal.isPartnerInvite) suggestPartnerTimeMutation.mutate(payload);
    else suggestTimeMutation.mutate(payload);
  };

  const fmtPrice = (v) => formatCurrency && convertCurrency ? formatCurrency(convertCurrency(v || 0, 'EUR', userCurrency), userCurrency) : `€${(v || 0).toFixed(2)}`;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 border-2 border-slate-200 border-t-duotone-blue rounded-full animate-spin" />
      </div>
    );
  }

  const hasNothing = invites.length === 0 && bookings.length === 0 && requests.length === 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* ── Actions bar ── */}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => navigate('/student/group-bookings/request')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-gotham-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
          <SparklesIcon className="w-4 h-4 text-violet-500" /> Find a Partner
        </button>
        <button type="button" onClick={() => navigate('/student/group-bookings/create')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors">
          <PlusIcon className="w-4 h-4" /> New Group
        </button>
      </div>

      {/* ── Invites ── */}
      {invites.length > 0 && (
        <section>
          <h2 className="font-duotone-bold text-sm uppercase tracking-[0.1em] text-slate-900 mb-2 px-1">Pending Invites</h2>
          <div className="space-y-2">
            {invites.map((inv) => (
              <InviteCard
                key={inv.bookingId} inv={inv}
                onAccept={(id) => acceptMutation.mutate(id)}
                onDecline={(id) => declineMutation.mutate(id)}
                onSuggest={(item) => openSuggest(item, true)}
                accepting={acceptMutation.isPending}
                declining={declineMutation.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Bookings ── */}
      <section>
        <h2 className="font-duotone-bold text-sm uppercase tracking-[0.1em] text-slate-900 mb-2 px-1">My Group Bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">No group bookings yet</p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
            {bookings.map((b) => (
              <BookingRow
                key={b.id} b={b}
                onClick={setSelectedBookingId}
                onAccept={(id) => acceptGroupMutation.mutate(id)}
                onDecline={(id) => declineGroupMutation.mutate(id)}
                onSuggest={(item) => openSuggest(item)}
                acceptLoading={acceptGroupMutation.isPending}
                declineLoading={declineGroupMutation.isPending}
                formatPrice={fmtPrice}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Requests ── */}
      {requests.length > 0 && (
        <section>
          <h2 className="font-duotone-bold text-sm uppercase tracking-[0.1em] text-slate-900 mb-2 px-1">My Matching Requests</h2>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
            {requests.map((req) => (
              <RequestRow
                key={req.id} req={req}
                onView={setSelectedBookingId}
                onCancel={(id) => cancelRequestMutation.mutate(id)}
                cancelling={cancelRequestMutation.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Empty state ── */}
      {hasNothing && (
        <div className="rounded-xl border border-slate-200 bg-white py-14 px-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
            <UserGroupIcon className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm text-slate-500 mb-4">No group lessons or invites yet</p>
          <div className="flex gap-2 justify-center">
            <button type="button" onClick={() => navigate('/student/group-bookings/request')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-gotham-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              <SparklesIcon className="w-4 h-4 text-violet-500" /> Find a Partner
            </button>
            <button type="button" onClick={() => navigate('/student/group-bookings/create')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors">
              <PlusIcon className="w-4 h-4" /> Create a Group
            </button>
          </div>
        </div>
      )}

      {/* ── Suggest Time Modal ── */}
      <Modal
        title={null}
        open={suggestModal.open}
        onCancel={closeSuggestModal}
        width={400}
        centered
        closable={false}
        footer={null}
        styles={{ body: { padding: 0 }, content: { borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.12)' } }}
      >
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-duotone-bold text-base text-slate-900">Suggest Another Time</h3>
            <button type="button" onClick={closeSuggestModal}
              className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">{suggestModal.title}</p>
        </div>
        <div className="px-6 pb-4 space-y-4">
          <div>
            <label className="block text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-1.5">Preferred Date *</label>
            <DatePicker className="w-full !rounded-xl" value={suggestDate} onChange={setSuggestDate} disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} format="YYYY-MM-DD" />
          </div>
          <div>
            <label className="block text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-1.5">Preferred Time</label>
            <TimePicker className="w-full !rounded-xl" value={suggestTimeVal} onChange={setSuggestTimeVal} format="HH:mm" minuteStep={15} />
          </div>
          <div>
            <label className="block text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-1.5">Message</label>
            <Input.TextArea className="!rounded-xl" rows={2} placeholder="Let the organizer know why this time works better..." value={suggestMsg} onChange={(e) => setSuggestMsg(e.target.value)} />
          </div>
        </div>
        <div className="px-6 pb-6 space-y-2">
          <button
            type="button" onClick={handleSuggestSubmit} disabled={!suggestDate || suggestTimeMutation.isPending || suggestPartnerTimeMutation.isPending}
            className="w-full h-10 rounded-xl text-sm font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send Suggestion
          </button>
          <button type="button" onClick={closeSuggestModal} className="w-full py-2 text-sm font-gotham-medium text-slate-400 hover:text-slate-600 transition-colors">
            Cancel
          </button>
        </div>
      </Modal>

      {/* ── Detail Drawer ── */}
      <StudentGroupBookingDetailDrawer
        bookingId={selectedBookingId}
        open={!!selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onUpdated={() => invalidate('my-group-bookings')}
      />
    </div>
  );
};

export default StudentGroupBookingsPage;
