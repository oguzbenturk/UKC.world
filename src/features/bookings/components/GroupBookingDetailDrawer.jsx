/**
 * GroupBookingDetailDrawer (Admin / Manager)
 *
 * Drawer for viewing and managing a group booking.
 * Actions: edit details, assign instructor, confirm & schedule, add participant, cancel.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Drawer,
  Button,
  Tag,
  Avatar,
  Spin,
  Select,
  DatePicker,
  InputNumber,
  Input,
  Popconfirm,
  App,
  Divider,
  Empty
} from 'antd';
import {
  XMarkIcon,
  PencilSquareIcon,
  UserGroupIcon,
  CalendarIcon,
  ClockIcon,
  UserIcon,
  CheckCircleIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';

/* ------------------------------------------------------------------ */
/* Helper functions                                                    */
/* ------------------------------------------------------------------ */

const buildUpdates = (editForm, booking) => {
  const updates = {};
  if (editForm.instructorId !== (booking.instructorId || null)) updates.instructorId = editForm.instructorId;
  if (editForm.scheduledDate !== booking.scheduledDate) updates.scheduledDate = editForm.scheduledDate;
  if (editForm.startTime !== booking.startTime) updates.startTime = editForm.startTime;
  if (editForm.endTime !== booking.endTime) updates.endTime = editForm.endTime;
  if (editForm.durationHours !== booking.durationHours) updates.durationHours = editForm.durationHours;
  if (editForm.pricePerPerson !== booking.pricePerPerson) updates.pricePerPerson = editForm.pricePerPerson;
  if (editForm.title !== booking.title) updates.title = editForm.title;
  if (editForm.notes !== (booking.notes || '')) updates.notes = editForm.notes;
  return updates;
};

const statusColor = (s) => ({
  pending: 'orange', open: 'blue', full: 'cyan', confirmed: 'green',
  in_progress: 'processing', completed: 'green', cancelled: 'red',
  invited: 'blue', accepted: 'cyan', paid: 'green', declined: 'red',
}[s] || 'default');

const paymentColor = (s) => ({
  pending: 'orange', paid: 'green', refunded: 'purple',
  covered_by_organizer: 'blue', not_applicable: 'default',
}[s] || 'default');

const getCurrencySymbol = (c) => ({ EUR: '€', USD: '$', TRY: '₺', GBP: '£', CHF: 'CHF' }[c || 'EUR'] || c || '€');

const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = 7; h <= 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      opts.push({ value: time, label: time });
    }
  }
  return opts;
})();

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

const DrawerHeader = ({ booking, isEditing, setIsEditing, refetch, onClose }) => (
  <div className="sticky top-0 bg-white z-10 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
        <UserGroupIcon className="w-4.5 h-4.5 text-white" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-800 truncate m-0">
          {booking?.title || 'Group Booking'}
        </h3>
        <div className="flex items-center gap-1.5 mt-0.5">
          {booking && <Tag color={statusColor(booking.status)} className="!text-[10px] !rounded-full !px-2 !py-0 !m-0">{booking.status}</Tag>}
          {booking?.paymentModel === 'organizer_pays' && (
            <Tag color="purple" className="!text-[10px] !rounded-full !px-2 !py-0 !m-0">Organizer Pays</Tag>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1.5">
      {booking && !['confirmed', 'cancelled', 'completed'].includes(booking.status) && (
        <Button type="text" size="small" icon={<PencilSquareIcon className="w-4 h-4" />}
          onClick={() => setIsEditing(!isEditing)} className={isEditing ? '!text-blue-600' : ''}>
          {isEditing ? 'Cancel Edit' : 'Edit'}
        </Button>
      )}
      <Button type="text" size="small" icon={<ArrowPathIcon className="w-4 h-4" />} onClick={() => refetch()} />
      <Button type="text" size="small" icon={<XMarkIcon className="w-4.5 h-4.5" />} onClick={onClose} />
    </div>
  </div>
);

const DetailsView = ({ booking, currSym }) => (
  <div className="grid grid-cols-2 gap-3">
    <div className="col-span-2">
      <label className="text-xs text-slate-500 block mb-1">Title</label>
      <span className="text-sm font-medium text-slate-800">{booking.title}</span>
    </div>
    <div>
      <label className="text-xs text-slate-500 block mb-1">Service</label>
      <span className="text-sm text-slate-800">{booking.serviceName}</span>
    </div>
    <div>
      <label className="text-xs text-slate-500 block mb-1">Instructor</label>
      <span className={`text-sm ${booking.instructorName ? 'text-slate-800' : 'text-red-500'}`}>
        {booking.instructorName || 'Not assigned'}
      </span>
    </div>
    <div>
      <label className="text-xs text-slate-500 block mb-1">Date</label>
      <span className="text-sm text-slate-800 flex items-center gap-1">
        <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
        {booking.scheduledDate ? dayjs(booking.scheduledDate).format('ddd, MMM D, YYYY') : '—'}
      </span>
    </div>
    <div>
      <label className="text-xs text-slate-500 block mb-1">Start Time</label>
      <span className="text-sm text-slate-800 flex items-center gap-1">
        <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
        {booking.startTime ? String(booking.startTime).substring(0, 5) : '—'}
        {booking.endTime ? ` – ${String(booking.endTime).substring(0, 5)}` : ''}
      </span>
    </div>
    <div>
      <label className="text-xs text-slate-500 block mb-1">Duration</label>
      <span className="text-sm text-slate-800">{booking.durationHours}h</span>
    </div>
    <div>
      <label className="text-xs text-slate-500 block mb-1">Price / Person</label>
      <span className="text-sm font-semibold text-emerald-600">{currSym}{booking.pricePerPerson?.toFixed(2)}</span>
    </div>
    <div>
      <label className="text-xs text-slate-500 block mb-1">Organizer</label>
      <span className="text-sm text-slate-800">{booking.organizerName}</span>
      {booking.organizerEmail && <span className="text-xs text-slate-400 block">{booking.organizerEmail}</span>}
    </div>
    <div className="col-span-2">
      <label className="text-xs text-slate-500 block mb-1">Notes</label>
      <span className="text-sm text-slate-600">{booking.notes || '—'}</span>
    </div>
  </div>
);

const DetailsEdit = ({ editForm, setEditForm, instructors, currSym, saving, onSave, onCancelEdit }) => (
  <div>
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="text-xs text-slate-500 block mb-1">Title</label>
        <Input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} size="small" />
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Instructor</label>
        <Select value={editForm.instructorId} onChange={(v) => setEditForm(f => ({ ...f, instructorId: v }))}
          allowClear placeholder="Select instructor" size="small" className="w-full"
          options={instructors.map(i => ({ value: i.id, label: `${i.first_name || ''} ${i.last_name || ''}`.trim() || i.name || i.email }))} />
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Date</label>
        <DatePicker value={editForm.scheduledDate ? dayjs(editForm.scheduledDate) : null}
          onChange={(d) => setEditForm(f => ({ ...f, scheduledDate: d ? d.format('YYYY-MM-DD') : null }))}
          size="small" className="w-full" />
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Start Time</label>
        <Select value={editForm.startTime ? String(editForm.startTime).substring(0, 5) : undefined}
          onChange={(v) => setEditForm(f => ({ ...f, startTime: v }))}
          size="small" className="w-full" placeholder="Select time" options={TIME_OPTIONS} />
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Duration</label>
        <InputNumber value={editForm.durationHours} onChange={(v) => setEditForm(f => ({ ...f, durationHours: v }))}
          min={0.5} max={8} step={0.5} size="small" className="w-full"
          formatter={(v) => `${v}h`} parser={(v) => v.replace('h', '')} />
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Price / Person</label>
        <InputNumber value={editForm.pricePerPerson} onChange={(v) => setEditForm(f => ({ ...f, pricePerPerson: v }))}
          min={0} step={5} size="small" className="w-full" prefix={currSym} />
      </div>
      <div className="col-span-2">
        <label className="text-xs text-slate-500 block mb-1">Notes</label>
        <Input.TextArea value={editForm.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} size="small" />
      </div>
    </div>
    <div className="flex justify-end mt-3 gap-2">
      <Button size="small" onClick={onCancelEdit}>Cancel</Button>
      <Button type="primary" size="small" loading={saving} onClick={onSave}>Save Changes</Button>
    </div>
  </div>
);

const DetailsSection = ({ booking, isEditing, editForm, setEditForm, instructors, currSym, saving, onSave, onCancelEdit }) => (
  <div>
    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Lesson Details</h4>
    {isEditing
      ? <DetailsEdit editForm={editForm} setEditForm={setEditForm} instructors={instructors} currSym={currSym} saving={saving} onSave={onSave} onCancelEdit={onCancelEdit} />
      : <DetailsView booking={booking} currSym={currSym} />}
  </div>
);

const ParticipantRow = ({ p, currSym, bookingStatus, onRemove }) => (
  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar size={30} className="bg-blue-100 text-blue-600 flex-shrink-0" icon={<UserIcon className="w-3.5 h-3.5" />} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-800 truncate">{p.fullName || p.email || 'Pending'}</span>
          {p.isOrganizer && <Tag color="gold" className="!text-[10px] !rounded-full !px-1.5 !py-0 !m-0">Org</Tag>}
        </div>
        {p.email && <span className="text-xs text-slate-400 block truncate">{p.email}</span>}
      </div>
    </div>
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <Tag color={statusColor(p.status)} className="!text-[10px] !rounded-full !px-2 !m-0">{p.status}</Tag>
      <Tag color={paymentColor(p.paymentStatus)} className="!text-[10px] !rounded-full !px-2 !m-0">
        {p.paymentStatus}
        {p.paymentStatus === 'paid' && p.amountPaid > 0 ? ` ${currSym}${p.amountPaid?.toFixed(0)}` : ''}
      </Tag>
      {!p.isOrganizer && bookingStatus !== 'cancelled' && (
        <Popconfirm title="Remove participant?" description="If they've paid, they'll be refunded."
          onConfirm={() => onRemove(p.id)} okText="Remove" cancelText="No">
          <Button type="text" danger size="small" icon={<TrashIcon className="w-3.5 h-3.5" />} className="!p-0.5" />
        </Popconfirm>
      )}
    </div>
  </div>
);

const ParticipantsSection = ({ booking, currSym, addParticipantOpen, setAddParticipantOpen,
  addEmail, setAddEmail, adding, onAddParticipant, onRemoveParticipant }) => (
  <div>
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider m-0">
        Participants ({booking.participantCount}/{booking.maxParticipants})
      </h4>
      {!['cancelled', 'completed'].includes(booking.status) && (
        <Button type="link" size="small" icon={<PlusIcon className="w-3.5 h-3.5" />}
          onClick={() => setAddParticipantOpen(!addParticipantOpen)}>Add</Button>
      )}
    </div>
    {addParticipantOpen && (
      <div className="flex gap-2 mb-3">
        <Input placeholder="Enter user email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
          onPressEnter={onAddParticipant} size="small" className="flex-1" />
        <Button type="primary" size="small" loading={adding} onClick={onAddParticipant}>Add</Button>
      </div>
    )}
    <div className="space-y-2">
      {booking.participants?.map(p => (
        <ParticipantRow key={p.id} p={p} currSym={currSym} bookingStatus={booking.status} onRemove={onRemoveParticipant} />
      ))}
      {(!booking.participants || booking.participants.length === 0) && (
        <div className="text-center py-4 text-slate-400 text-sm">No participants yet</div>
      )}
    </div>
    <div className="flex gap-2 mt-3 flex-wrap">
      <Tag color="cyan" className="!rounded-full !text-xs">
        {booking.participants?.filter(p => p.status === 'accepted').length || 0} Accepted
      </Tag>
      <Tag color="green" className="!rounded-full !text-xs">{booking.paidCount || 0} Paid</Tag>
      <Tag color="orange" className="!rounded-full !text-xs">
        {booking.participants?.filter(p => p.paymentStatus === 'pending').length || 0} Unpaid
      </Tag>
      <span className="text-xs text-slate-400 ml-auto">
        Total: {currSym}{((booking.pricePerPerson || 0) * (booking.participantCount || 0)).toFixed(2)}
      </span>
    </div>
  </div>
);

const ActionsSection = ({ booking, hasInstructor, isConfirmable, confirming, cancelling, onConfirm, onCancel }) => (
  <div>
    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Actions</h4>
    <div className="space-y-2">
      {(!booking.bookingId || booking.bookingStatus === 'pending') && !['cancelled', 'completed'].includes(booking.status) && (
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
          {!hasInstructor && (
            <div className="flex items-center gap-2 mb-2 text-amber-600 text-xs">
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              <span>Assign an instructor before confirming</span>
            </div>
          )}
          <Button type="primary" block loading={confirming} disabled={!isConfirmable || !hasInstructor}
            icon={<CheckCircleIcon className="w-4 h-4" />} onClick={onConfirm} className="!rounded-lg !font-semibold">
            Confirm & Create Calendar Event
          </Button>
          <p className="text-xs text-slate-500 mt-1.5 mb-0 text-center">
            Creates a booking in the calendar for {booking.participantCount} participant(s)
          </p>
        </div>
      )}
      {booking.bookingStatus === 'confirmed' && booking.bookingId && (
        <div className="p-3 rounded-lg border border-green-200 bg-green-50/50 text-center">
          <CheckCircleIcon className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-sm font-medium text-green-800 mb-1">Confirmed & Scheduled</p>
          <p className="text-xs text-green-600 mb-0">This group has a calendar booking</p>
        </div>
      )}
      {!['cancelled', 'completed'].includes(booking.status) && (
        <Popconfirm title="Cancel this group booking?" description="All participants will be notified. Paid participants will be refunded."
          onConfirm={onCancel} okText="Yes, Cancel" cancelText="No" okButtonProps={{ danger: true, loading: cancelling }}>
          <Button danger block className="!rounded-lg">Cancel Group Booking</Button>
        </Popconfirm>
      )}
    </div>
  </div>
);

const DeadlinesSection = ({ booking }) => {
  if (!booking.registrationDeadline && !booking.paymentDeadline) return null;
  return (
    <>
      <Divider className="!my-2" />
      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Deadlines</h4>
        <div className="flex gap-6 text-sm">
          {booking.registrationDeadline && (
            <div>
              <span className="text-xs text-slate-400 block">Registration</span>
              <span className="text-slate-700">{dayjs(booking.registrationDeadline).format('MMM D, YYYY HH:mm')}</span>
            </div>
          )}
          {booking.paymentDeadline && (
            <div>
              <span className="text-xs text-slate-400 block">Payment</span>
              <span className="text-slate-700">{dayjs(booking.paymentDeadline).format('MMM D, YYYY HH:mm')}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const DrawerBody = ({ booking, isEditing, editForm, setEditForm, instructors, currSym,
  saving, onSave, onCancelEdit, addParticipantOpen, setAddParticipantOpen,
  addEmail, setAddEmail, adding, onAddParticipant, onRemoveParticipant,
  hasInstructor, isConfirmable, confirming, cancelling, onConfirm, onCancel }) => (
  <div className="space-y-5">
    <DetailsSection booking={booking} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm}
      instructors={instructors} currSym={currSym} saving={saving} onSave={onSave} onCancelEdit={onCancelEdit} />
    <Divider className="!my-2" />
    <ParticipantsSection booking={booking} currSym={currSym}
      addParticipantOpen={addParticipantOpen} setAddParticipantOpen={setAddParticipantOpen}
      addEmail={addEmail} setAddEmail={setAddEmail} adding={adding}
      onAddParticipant={onAddParticipant} onRemoveParticipant={onRemoveParticipant} />
    <Divider className="!my-2" />
    <ActionsSection booking={booking} hasInstructor={hasInstructor} isConfirmable={isConfirmable}
      confirming={confirming} cancelling={cancelling} onConfirm={onConfirm} onCancel={onCancel} />
    <DeadlinesSection booking={booking} />
    <div className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">
      Created {booking.createdAt ? dayjs(booking.createdAt).format('MMM D, YYYY [at] HH:mm') : '—'}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

const useGroupBookingActions = (groupBookingId, { booking, editForm, message, refetch, onUpdate, onClose, setIsEditing, setAddEmail, setAddParticipantOpen }) => {
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const updates = buildUpdates(editForm, booking);
      if (Object.keys(updates).length === 0) { setIsEditing(false); return; }
      await apiClient.patch(`/group-bookings/${groupBookingId}`, updates);
      message.success('Group booking updated');
      setIsEditing(false);
      refetch();
      onUpdate?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      const body = {};
      if (editForm.instructorId && editForm.instructorId !== booking?.instructorId) {
        body.instructorId = editForm.instructorId;
      }
      const res = await apiClient.post(`/group-bookings/${groupBookingId}/confirm`, body);
      message.success(res.data?.message || 'Group booking confirmed & scheduled!');
      refetch();
      onUpdate?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to confirm');
    } finally {
      setConfirming(false);
    }
  };

  const handleAddParticipant = async (email) => {
    if (!email?.trim()) return;
    try {
      setAdding(true);
      await apiClient.post(`/group-bookings/${groupBookingId}/add-participant`, { email: email.trim() });
      message.success('Participant added');
      setAddEmail('');
      setAddParticipantOpen(false);
      refetch();
      onUpdate?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to add participant');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveParticipant = async (participantId) => {
    try {
      await apiClient.delete(`/group-bookings/${groupBookingId}/participants/${participantId}`);
      message.success('Participant removed');
      refetch();
      onUpdate?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to remove');
    }
  };

  const handleCancel = async () => {
    try {
      setCancelling(true);
      await apiClient.delete(`/group-bookings/${groupBookingId}`, { data: { reason: 'Cancelled by admin' } });
      message.success('Group booking cancelled');
      onClose();
      onUpdate?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  return { saving, confirming, adding, cancelling, handleSave, handleConfirm, handleAddParticipant, handleRemoveParticipant, handleCancel };
};

const GroupBookingDetailDrawer = ({ isOpen, onClose, groupBookingId, onUpdate }) => {
  const { message } = App.useApp();

  const [isEditing, setIsEditing] = useState(false);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [editForm, setEditForm] = useState({});

  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'group-booking-detail', groupBookingId],
    queryFn: () => apiClient.get(`/group-bookings/${groupBookingId}`).then(r => r.data?.groupBooking || null),
    enabled: !!groupBookingId && isOpen,
    staleTime: 10_000,
  });

  const { data: instructors = [] } = useQuery({
    queryKey: ['admin', 'instructors-for-drawer'],
    queryFn: () => apiClient.get('/users/instructors').then(r => r.data?.instructors || r.data || []),
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!booking) return;
    setEditForm({
      instructorId: booking.instructorId || null,
      scheduledDate: booking.scheduledDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      durationHours: booking.durationHours,
      pricePerPerson: booking.pricePerPerson,
      title: booking.title,
      notes: booking.notes || '',
    });
  }, [booking]);

  useEffect(() => {
    if (isOpen) return;
    setIsEditing(false);
    setAddParticipantOpen(false);
    setAddEmail('');
  }, [isOpen]);

  const currSym = useMemo(() => getCurrencySymbol(booking?.currency), [booking?.currency]);
  const hasInstructor = Boolean(editForm.instructorId || booking?.instructorId);
  const hasParticipants = booking?.participantCount > 0 ||
    booking?.participants?.some(p => p.status === 'accepted' || p.status === 'paid');
  const isConfirmable = (!booking?.bookingId || booking?.bookingStatus === 'pending') && !['cancelled', 'completed'].includes(booking?.status) && hasParticipants;

  const actions = useGroupBookingActions(groupBookingId, { booking, editForm, message, refetch, onUpdate, onClose, setIsEditing, setAddEmail, setAddParticipantOpen });

  const bodyProps = {
    booking, isEditing, editForm, setEditForm, instructors, currSym,
    saving: actions.saving, onSave: actions.handleSave, onCancelEdit: () => setIsEditing(false),
    addParticipantOpen, setAddParticipantOpen, addEmail, setAddEmail, adding: actions.adding,
    onAddParticipant: () => actions.handleAddParticipant(addEmail),
    onRemoveParticipant: actions.handleRemoveParticipant,
    hasInstructor, isConfirmable, confirming: actions.confirming, cancelling: actions.cancelling,
    onConfirm: actions.handleConfirm, onCancel: actions.handleCancel,
  };

  const content = isLoading
    ? <div className="flex justify-center py-16"><Spin size="large" /></div>
    : booking ? <DrawerBody {...bodyProps} /> : <Empty description="Group booking not found" />;

  return (
    <Drawer open={isOpen} onClose={onClose} width={560}
      placement="right" closable={false} destroyOnHidden
      styles={{ body: { padding: 0 }, header: { display: 'none' } }}>
      <DrawerHeader booking={booking} isEditing={isEditing} setIsEditing={setIsEditing} refetch={refetch} onClose={onClose} />
      <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 64px)' }}>
        {content}
      </div>
    </Drawer>
  );
};

export default GroupBookingDetailDrawer;
