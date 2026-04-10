import { useState, useMemo } from 'react';
import { Button, Tag, Table, Input, Popconfirm, Tooltip, Drawer, Form, InputNumber, Select, DatePicker, Empty, Modal } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CalendarOutlined,
  TeamOutlined, SearchOutlined, EnvironmentOutlined, CloseOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, DollarOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useData } from '@/shared/hooks/useData';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { message } from '@/shared/utils/antdStatic';
import dayjs from 'dayjs';
import { usePageSEO } from '@/shared/utils/seo';

const EVENT_TYPES = [
  { value: 'party', label: 'Party / Social Event', color: 'magenta' },
  { value: 'diving', label: 'Diving Trip', color: 'blue' },
  { value: 'yoga', label: 'Yoga Session', color: 'green' },
  { value: 'workshop', label: 'Workshop', color: 'orange' },
  { value: 'competition', label: 'Competition', color: 'red' },
  { value: 'training', label: 'Group Training', color: 'cyan' },
  { value: 'excursion', label: 'Excursion / Trip', color: 'geekblue' },
  { value: 'other', label: 'Other', color: 'default' },
];

const ADMIN_ROLES = ['admin', 'manager', 'developer'];

const getTypeColor = (type) => EVENT_TYPES.find(t => t.value === type)?.color || 'default';
const getTypeLabel = (type) => EVENT_TYPES.find(t => t.value === type)?.label || type || 'Other';

export default function EventsPage() {
  usePageSEO({
    title: 'Events | UKC. Duotone Pro Center Urla',
    description: 'Upcoming community events, social gatherings, competitions, and special experiences at UKC. Duotone Pro Center Urla.',
    path: '/services/events',
  });
  const { apiClient, usersWithStudentRole } = useData();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { getCurrencySymbol } = useCurrency();
  const rawSymbol = getCurrencySymbol();
  const currencySymbol = typeof rawSymbol === 'string' ? rawSymbol : '€';
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [regDrawerOpen, setRegDrawerOpen] = useState(false);
  const [regEvent, setRegEvent] = useState(null);
  const [addUserId, setAddUserId] = useState(null);
  const [confirmEvent, setConfirmEvent] = useState(null); // event to confirm registration
  const [form] = Form.useForm();

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  // ── Fetch events ──────────────────────────────────────────────
  const { data: rawEvents, isLoading } = useQuery({
    queryKey: ['events', 'list', isAdmin ? 'admin' : 'public'],
    queryFn: async () => {
      if (!apiClient) return [];
      const endpoint = isAdmin ? '/events' : '/events/public';
      const res = await apiClient.get(endpoint);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!apiClient,
  });
  const events = Array.isArray(rawEvents) ? rawEvents : [];

  // ── Fetch registrations for selected event ────────────────────
  const { data: rawRegistrations, isLoading: regsLoading } = useQuery({
    queryKey: ['events', 'registrations', regEvent?.id],
    queryFn: async () => {
      if (!apiClient || !regEvent?.id) return [];
      const res = await apiClient.get(`/events/${regEvent.id}/registrations`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!apiClient && !!regEvent?.id,
  });
  const registrations = Array.isArray(rawRegistrations) ? rawRegistrations : [];

  // ── Stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = events.filter(e => e.status === 'scheduled');
    const totalRegs = events.reduce((s, e) => s + (e.registration_count || 0), 0);
    const upcoming = events.filter(e => e.status === 'scheduled' && dayjs(e.start_at).isAfter(dayjs()));
    const totalRevenue = events.reduce((s, e) => s + ((Number(e.price) || 0) * (e.registration_count || 0)), 0);
    return { total: events.length, active: active.length, upcoming: upcoming.length, totalRegs, totalRevenue };
  }, [events]);

  // ── Filtered events ───────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = events;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.name?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.event_type?.toLowerCase().includes(q)
      );
    }
    if (typeFilter) {
      list = list.filter(e => e.event_type === typeFilter);
    }
    return list;
  }, [events, search, typeFilter]);

  // ── Mutations ─────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiClient.post('/events', payload);
      return res.data;
    },
    onSuccess: () => {
      message.success('Event created');
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      closeDrawer();
    },
    onError: () => message.error('Failed to create event'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await apiClient.put(`/events/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      message.success('Event updated');
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      closeDrawer();
    },
    onError: () => message.error('Failed to update event'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => apiClient.delete(`/events/${id}`),
    onSuccess: () => {
      message.success('Event deleted');
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
    onError: () => message.error('Failed to delete event'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => apiClient.put(`/events/${id}`, { status }),
    onSuccess: () => {
      message.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
    onError: () => message.error('Failed to update status'),
  });

  const adminRegisterMutation = useMutation({
    mutationFn: async ({ eventId, userId }) => {
      const res = await apiClient.post(`/events/${eventId}/registrations`, { user_id: userId });
      return res.data;
    },
    onSuccess: () => {
      message.success('Participant added');
      queryClient.invalidateQueries({ queryKey: ['events', 'registrations', regEvent?.id] });
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      setAddUserId(null);
    },
    onError: (err) => {
      const errMsg = err?.response?.data?.error;
      message.error(typeof errMsg === 'string' ? errMsg : 'Failed to add participant');
    },
  });

  const adminUnregisterMutation = useMutation({
    mutationFn: async ({ eventId, userId }) => {
      const res = await apiClient.delete(`/events/${eventId}/registrations/${userId}`);
      return res.data;
    },
    onSuccess: () => {
      message.success('Participant removed');
      queryClient.invalidateQueries({ queryKey: ['events', 'registrations', regEvent?.id] });
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
    onError: () => message.error('Failed to remove participant'),
  });

  // ── Self-registration mutations (for non-admin users) ────────
  const selfRegisterMutation = useMutation({
    mutationFn: async (eventId) => {
      const res = await apiClient.post(`/events/${eventId}/register`);
      return res.data;
    },
    onSuccess: () => {
      message.success('You have been registered!');
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['myEventRegistrations'] });
    },
    onError: (err) => {
      const errMsg = err?.response?.data?.error;
      message.error(typeof errMsg === 'string' ? errMsg : 'Failed to register');
    },
  });

  const selfUnregisterMutation = useMutation({
    mutationFn: async (eventId) => {
      const res = await apiClient.delete(`/events/${eventId}/register`);
      return res.data;
    },
    onSuccess: () => {
      message.success('Registration cancelled');
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['myEventRegistrations'] });
    },
    onError: () => message.error('Failed to cancel registration'),
  });

  // Fetch user's own registrations (for non-admin view)
  const { data: myRegistrations } = useQuery({
    queryKey: ['myEventRegistrations'],
    queryFn: async () => {
      if (!apiClient) return [];
      const res = await apiClient.get('/events/my-events');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!apiClient && !isAdmin,
  });
  const myRegEventIds = useMemo(() => {
    if (!myRegistrations) return new Set();
    return new Set(myRegistrations.filter(r => r.status === 'registered').map(r => r.event_id));
  }, [myRegistrations]);

  // ── Drawer helpers ────────────────────────────────────────────
  const openCreate = () => {
    setEditingEvent(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (event) => {
    setEditingEvent(event);
    form.setFieldsValue({
      name: event.name,
      event_type: event.event_type,
      start_at: event.start_at ? dayjs(event.start_at) : null,
      end_at: event.end_at ? dayjs(event.end_at) : null,
      capacity: event.capacity,
      price: event.price ? Number(event.price) : null,
      location: event.location,
      description: event.description,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingEvent(null);
    form.resetFields();
  };

  const openRegistrations = (event) => {
    setRegEvent(event);
    setAddUserId(null);
    setRegDrawerOpen(true);
  };

  const closeRegDrawer = () => {
    setRegDrawerOpen(false);
    setRegEvent(null);
    setAddUserId(null);
  };

  const handleSubmit = (values) => {
    const payload = {
      name: values.name,
      event_type: values.event_type || 'other',
      start_at: values.start_at ? values.start_at.toISOString() : null,
      end_at: values.end_at ? values.end_at.toISOString() : null,
      capacity: values.capacity || null,
      price: values.price || null,
      location: values.location || null,
      description: values.description || null,
      status: 'scheduled',
    };

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Build user options for the add participant Select, excluding already-registered users
  const userOptions = useMemo(() => {
    const registeredIds = new Set(registrations.map(r => r.user_id));
    const allUsers = Array.isArray(usersWithStudentRole) ? usersWithStudentRole : [];
    return allUsers
      .filter(u => !registeredIds.has(u.id))
      .map(u => ({
        value: u.id,
        label: `${u.name || 'Unnamed'}${u.email ? ` (${u.email})` : ''}`,
      }));
  }, [usersWithStudentRole, registrations]);

  // ── Table columns ─────────────────────────────────────────────
  const columns = [
    {
      title: 'Event',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name, record) => (
        <div>
          <div className="font-medium text-sm text-slate-800">{typeof name === 'string' ? name : ''}</div>
          {record.location && typeof record.location === 'string' && (
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <EnvironmentOutlined /> {record.location}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'event_type',
      key: 'type',
      width: 140,
      render: (type) => (
        <Tag color={getTypeColor(type)} className="text-[10px]">{getTypeLabel(type)}</Tag>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'start_at',
      key: 'date',
      width: 140,
      sorter: (a, b) => dayjs(a.start_at).unix() - dayjs(b.start_at).unix(),
      render: (date) => date ? (
        <span className="text-xs text-slate-600">{dayjs(date).format('MMM D, YYYY HH:mm')}</span>
      ) : <span className="text-xs text-slate-300">Not set</span>,
    },
    {
      title: 'Capacity',
      key: 'capacity',
      width: 90,
      align: 'center',
      render: (_, record) => (
        <span className="text-xs">
          <span className="font-medium">{record.registration_count || 0}</span>
          {record.capacity ? <span className="text-slate-400"> / {record.capacity}</span> : null}
        </span>
      ),
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 80,
      align: 'right',
      render: (price) => price && Number(price) > 0
        ? <span className="text-xs font-medium">{currencySymbol}{Number(price).toFixed(0)}</span>
        : <span className="text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">Free</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => {
        const s = typeof status === 'string' ? status : '';
        return (
          <Tag color={s === 'scheduled' ? 'green' : 'red'} className="text-[10px]">
            {s === 'scheduled' ? 'Active' : 'Inactive'}
          </Tag>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Tooltip title="Edit">
            <button onClick={() => openEdit(record)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
              <EditOutlined className="text-xs" />
            </button>
          </Tooltip>
          <Tooltip title={record.status === 'scheduled' ? 'Deactivate' : 'Activate'}>
            <button
              onClick={() => toggleStatusMutation.mutate({ id: record.id, status: record.status === 'scheduled' ? 'cancelled' : 'scheduled' })}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${record.status === 'scheduled' ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            </button>
          </Tooltip>
          <Tooltip title="Registrations">
            <button onClick={() => openRegistrations(record)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-colors">
              <TeamOutlined className="text-xs" />
            </button>
          </Tooltip>
          <Popconfirm title="Delete this event?" onConfirm={() => deleteMutation.mutate(record.id)} okButtonProps={{ danger: true }}>
            <Tooltip title="Delete">
              <button className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <DeleteOutlined className="text-xs" />
              </button>
            </Tooltip>
          </Popconfirm>
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────
  if (!isAdmin) {
    // ── Public / Instructor / Student view ────────────────────
    const upcomingEvents = filtered.filter(e => e.status === 'scheduled');
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-600 mb-1.5">
              <CalendarOutlined /> Events
            </div>
            <h1 className="text-lg font-semibold text-slate-800">Upcoming Events</h1>
            <p className="text-xs text-slate-400 mt-0.5">Browse and join community events</p>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search events..."
                prefix={<SearchOutlined className="text-slate-300" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded-lg"
                allowClear
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setTypeFilter(null)}
                  className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${!typeFilter ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                >
                  All
                </button>
                {EVENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTypeFilter(typeFilter === t.value ? null : t.value)}
                    className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${typeFilter === t.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Event Cards */}
          {isLoading ? (
            <div className="text-center py-12 text-sm text-slate-400">Loading events...</div>
          ) : upcomingEvents.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <CalendarOutlined className="text-4xl text-slate-200 mb-3" />
              <div className="text-sm text-slate-400">No upcoming events</div>
              <p className="text-xs text-slate-300 mt-1">Check back soon for new events!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingEvents.map(event => {
                const isRegistered = myRegEventIds.has(event.id);
                const isFull = event.capacity && (event.registration_count || 0) >= event.capacity;
                const isPast = dayjs(event.start_at).isBefore(dayjs());
                return (
                  <div key={event.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                    {/* Card header with type tag */}
                    <div className="px-4 pt-4 pb-2">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Tag color={getTypeColor(event.event_type)} className="text-[10px] m-0">{getTypeLabel(event.event_type)}</Tag>
                        {event.price && Number(event.price) > 0
                          ? <span className="text-sm font-semibold text-slate-700">{currencySymbol}{Number(event.price).toFixed(0)}</span>
                          : <span className="text-[10px] text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">Free</span>
                        }
                      </div>
                      <h3 className="text-sm font-semibold text-slate-800 leading-snug">{event.name}</h3>
                      {event.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{event.description}</p>
                      )}
                    </div>

                    {/* Details */}
                    <div className="px-4 py-2 space-y-1.5">
                      {event.start_at && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <CalendarOutlined className="text-slate-300" />
                          <span>{dayjs(event.start_at).format('ddd, MMM D · HH:mm')}</span>
                          {event.end_at && <span className="text-slate-300">– {dayjs(event.end_at).format('HH:mm')}</span>}
                        </div>
                      )}
                      {event.location && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <EnvironmentOutlined className="text-slate-300" />
                          <span>{event.location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <TeamOutlined className="text-slate-300" />
                        <span>{event.registration_count || 0} registered{event.capacity ? ` / ${event.capacity} spots` : ''}</span>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="px-4 pb-4 pt-2">
                      {isPast ? (
                        <div className="w-full py-2 text-xs text-center text-slate-400 bg-slate-50 rounded-lg">Event has passed</div>
                      ) : isRegistered ? (
                        <Popconfirm title="Cancel your registration?" onConfirm={() => selfUnregisterMutation.mutate(event.id)} okButtonProps={{ danger: true }}>
                          <button className="w-full py-2 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                            <CheckCircleOutlined /> Registered — Click to Cancel
                          </button>
                        </Popconfirm>
                      ) : isFull ? (
                        <div className="w-full py-2 text-xs text-center text-amber-600 bg-amber-50 rounded-lg font-medium">Event is Full</div>
                      ) : (
                        <button
                          onClick={() => setConfirmEvent(event)}
                          className="w-full py-2 text-xs font-medium text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 rounded-lg transition-all shadow-sm"
                        >
                          Join Event
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Join Event Confirmation Modal ─────────────────────── */}
        <Modal
          open={!!confirmEvent}
          onCancel={() => setConfirmEvent(null)}
          footer={null}
          centered
          width={440}
          destroyOnClose
        >
          {confirmEvent && (() => {
            const ev = confirmEvent;
            const isPaid = ev.price && Number(ev.price) > 0;
            const spotsLeft = ev.capacity ? ev.capacity - (ev.registration_count || 0) : null;
            return (
              <div className="space-y-4">
                {/* Event header */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag color={getTypeColor(ev.event_type)} className="text-[10px] m-0">{getTypeLabel(ev.event_type)}</Tag>
                    {isPaid
                      ? <span className="text-sm font-semibold text-slate-700">{currencySymbol}{Number(ev.price).toFixed(0)}</span>
                      : <span className="text-[10px] text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">Free</span>
                    }
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">{ev.name}</h3>
                  {ev.description && (
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{ev.description}</p>
                  )}
                </div>

                {/* Event details */}
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  {ev.start_at && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <CalendarOutlined className="text-slate-400" />
                      <span>{dayjs(ev.start_at).format('dddd, MMMM D, YYYY · HH:mm')}</span>
                      {ev.end_at && <span className="text-slate-400">– {dayjs(ev.end_at).format('HH:mm')}</span>}
                    </div>
                  )}
                  {ev.location && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <EnvironmentOutlined className="text-slate-400" />
                      <span>{ev.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <TeamOutlined className="text-slate-400" />
                    <span>
                      {ev.registration_count || 0} registered
                      {ev.capacity ? ` / ${ev.capacity} spots` : ''}
                      {spotsLeft !== null && <span className="text-sky-500 ml-1">({spotsLeft} left)</span>}
                    </span>
                  </div>
                </div>

                {/* Payment warning for paid events */}
                {isPaid && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2.5">
                    <DollarOutlined className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-amber-800">This is a paid event</div>
                      <p className="text-[11px] text-amber-600 mt-0.5 leading-relaxed">
                        The participation fee is <strong>{currencySymbol}{Number(ev.price).toFixed(0)} per person</strong>.
                        By joining, you agree to pay this amount. Payment will be collected by the academy.
                      </p>
                    </div>
                  </div>
                )}

                {/* Confirmation note */}
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  By clicking confirm, you will be added to the participant list for this event. You can cancel your registration at any time.
                </p>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setConfirmEvent(null)}
                    className="flex-1 py-2.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      selfRegisterMutation.mutate(ev.id);
                      setConfirmEvent(null);
                    }}
                    disabled={selfRegisterMutation.isPending}
                    className="flex-1 py-2.5 text-sm text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 rounded-lg transition-all shadow-sm disabled:opacity-50 font-medium"
                  >
                    {selfRegisterMutation.isPending ? 'Joining...' : 'Confirm & Join'}
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      </div>
    );
  }

  // ── Admin / Manager view ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-600 mb-1.5">
              <CalendarOutlined /> Event Manager
            </div>
            <h1 className="text-lg font-semibold text-slate-800">Community Events</h1>
            <p className="text-xs text-slate-400 mt-0.5">Create, manage, and track community events and registrations</p>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            className="h-9 rounded-lg bg-gradient-to-r from-slate-700 to-slate-800 border-0 shadow-sm text-sm"
          >
            <span className="hidden sm:inline">New Event</span>
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <CalendarOutlined /> Total
            </div>
            <div className="text-xl font-bold text-slate-800">{stats.total}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
            </div>
            <div className="text-xl font-bold text-emerald-600">{stats.active}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sky-400 text-xs mb-1">
              <CalendarOutlined /> Upcoming
            </div>
            <div className="text-xl font-bold text-sky-600">{stats.upcoming}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <TeamOutlined /> Registrations
            </div>
            <div className="text-xl font-bold text-slate-700">{stats.totalRegs}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search events..."
              prefix={<SearchOutlined className="text-slate-300" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded-lg"
              allowClear
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTypeFilter(null)}
                className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${!typeFilter ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
              >
                All
              </button>
              {EVENT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(typeFilter === t.value ? null : t.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${typeFilter === t.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Events Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="small"
            pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => `${total} events` }}
            locale={{
              emptyText: (
                <div className="py-10 text-center">
                  <CalendarOutlined className="text-3xl text-slate-200 mb-3" />
                  <div className="text-sm text-slate-400">No events found</div>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate} className="mt-3 rounded-lg bg-slate-700 border-0">
                    Create Event
                  </Button>
                </div>
              ),
            }}
          />
        </div>
      </div>

      {/* ── Create/Edit Drawer ─────────────────────────────────── */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        width={isMobile ? '100%' : 420}
        closable={false}
        destroyOnHidden
        styles={{ body: { padding: 0 }, header: { display: 'none' } }}
      >
        <div className="flex flex-col h-full">
          {/* Drawer header */}
          <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{editingEvent ? 'Edit Event' : 'New Event'}</h2>
                <p className="text-xs text-white/60 mt-0.5">
                  {editingEvent ? 'Update event settings' : 'Configure a new community event'}
                </p>
              </div>
              <button onClick={closeDrawer} className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors text-white">
                <CloseOutlined />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
              <Form.Item
                name="name"
                label={<span className="text-xs font-medium text-slate-600">Event Name *</span>}
                rules={[{ required: true, message: 'Enter event name' }]}
              >
                <Input placeholder="e.g., Beach Party, Morning Yoga" className="rounded-lg" size="large" />
              </Form.Item>

              <Form.Item
                name="event_type"
                label={<span className="text-xs font-medium text-slate-600">Event Type *</span>}
                rules={[{ required: true, message: 'Select type' }]}
              >
                <Select
                  placeholder="Select type..."
                  options={EVENT_TYPES}
                  className="w-full"
                  size="large"
                  optionRender={(opt) => (
                    <div className="flex items-center gap-2">
                      <Tag color={opt.data.color} className="m-0">{opt.data.label}</Tag>
                    </div>
                  )}
                />
              </Form.Item>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item
                  name="start_at"
                  label={<span className="text-xs font-medium text-slate-600">Start Date & Time *</span>}
                  rules={[{ required: true, message: 'Select start date' }]}
                >
                  <DatePicker showTime format="YYYY-MM-DD HH:mm" className="w-full rounded-lg" size="large" placeholder="Start" />
                </Form.Item>
                <Form.Item
                  name="end_at"
                  label={<span className="text-xs font-medium text-slate-600">End Date & Time</span>}
                >
                  <DatePicker showTime format="YYYY-MM-DD HH:mm" className="w-full rounded-lg" size="large" placeholder="End (optional)" />
                </Form.Item>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item
                  name="capacity"
                  label={<span className="text-xs font-medium text-slate-600">Max Participants</span>}
                >
                  <InputNumber min={1} max={500} className="w-full rounded-lg" size="large" placeholder="Unlimited" />
                </Form.Item>
                <Form.Item
                  name="price"
                  label={<span className="text-xs font-medium text-slate-600">Price (per person)</span>}
                >
                  <InputNumber min={0} className="w-full rounded-lg" size="large" placeholder="0 = Free" prefix={currencySymbol} />
                </Form.Item>
              </div>

              <Form.Item
                name="location"
                label={<span className="text-xs font-medium text-slate-600">Default Location</span>}
              >
                <Input placeholder="e.g., Main Beach, Studio A" className="rounded-lg" size="large" prefix={<EnvironmentOutlined className="text-slate-300" />} />
              </Form.Item>

              <Form.Item
                name="description"
                label={<span className="text-xs font-medium text-slate-600">Description</span>}
              >
                <Input.TextArea rows={3} placeholder="Event details, what to bring..." className="rounded-lg" />
              </Form.Item>
            </Form>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 px-5 py-3 bg-white flex items-center gap-3">
            <button onClick={closeDrawer} className="flex-1 py-2.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={() => form.submit()}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 py-2.5 text-sm text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 rounded-lg transition-all shadow-sm disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingEvent ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Drawer>

      {/* ── Registrations Drawer ───────────────────────────────── */}
      <Drawer
        open={regDrawerOpen}
        onClose={closeRegDrawer}
        width={isMobile ? '100%' : 480}
        closable={false}
        destroyOnHidden
        styles={{ body: { padding: 0 }, header: { display: 'none' } }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{regEvent?.name || 'Event'}</h2>
                <p className="text-xs text-white/60 mt-0.5">
                  {registrations.length} registration{registrations.length !== 1 ? 's' : ''}
                  {regEvent?.capacity ? ` / ${regEvent.capacity} capacity` : ''}
                </p>
              </div>
              <button onClick={closeRegDrawer} className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors text-white">
                <CloseOutlined />
              </button>
            </div>
          </div>

          {/* Add Participant */}
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
            <label className="text-xs font-medium text-slate-600 block mb-2">Add Participant</label>
            <div className="flex gap-2">
              <Select
                showSearch
                allowClear
                placeholder="Search users..."
                className="flex-1"
                size="large"
                value={addUserId}
                onChange={setAddUserId}
                options={userOptions}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                notFoundContent={<span className="text-xs text-slate-400">No users found</span>}
              />
              <button
                onClick={() => {
                  if (addUserId && regEvent?.id) {
                    adminRegisterMutation.mutate({ eventId: regEvent.id, userId: addUserId });
                  }
                }}
                disabled={!addUserId || adminRegisterMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 rounded-lg transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <PlusOutlined />
                Add
              </button>
            </div>
          </div>

          {/* Registrations list */}
          <div className="flex-1 overflow-y-auto">
            {regsLoading ? (
              <div className="p-8 text-center">
                <div className="text-sm text-slate-400">Loading registrations...</div>
              </div>
            ) : registrations.length === 0 ? (
              <div className="p-8">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span className="text-sm text-slate-400">No registrations yet</span>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {registrations.map((reg) => (
                  <div key={reg.id || reg.user_id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {(reg.user_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{typeof reg.user_name === 'string' ? reg.user_name : 'Unknown User'}</div>
                        <div className="text-[11px] text-slate-400 truncate">{typeof reg.user_email === 'string' ? reg.user_email : 'No email'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px] text-slate-300 hidden sm:block">
                        {reg.registered_at ? dayjs(reg.registered_at).format('MMM D, HH:mm') : ''}
                      </span>
                      <Popconfirm
                        title="Remove this participant?"
                        onConfirm={() => adminUnregisterMutation.mutate({ eventId: regEvent.id, userId: reg.user_id })}
                        okButtonProps={{ danger: true }}
                      >
                        <Tooltip title="Remove">
                          <button className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <CloseOutlined className="text-xs" />
                          </button>
                        </Tooltip>
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
