import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tag, Table, Input, Popconfirm, Tooltip, Drawer, Form, InputNumber, Select, DatePicker, Empty, Modal, Upload } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CalendarOutlined,
  TeamOutlined, SearchOutlined, EnvironmentOutlined, CloseOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, DollarOutlined,
  LoadingOutlined, PictureOutlined,
} from '@ant-design/icons';
import { serviceApi } from '@/shared/services/serviceApi';
import { resolvePublicUploadUrl } from '@/shared/utils/mediaUrl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useData } from '@/shared/hooks/useData';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { message } from '@/shared/utils/antdStatic';
import dayjs from 'dayjs';
import { usePageSEO } from '@/shared/utils/seo';
import GoogleReviewsStrip from '@/shared/components/ui/GoogleReviewsStrip';
import ContactOptionsBanner from '@/features/outsider/components/ContactOptionsBanner';
import { useImageAccent } from '@/features/outsider/hooks/useImageAccent';

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

const EVENT_TYPE_THEMES = {
  party:       { gradient: 'from-pink-500 to-rose-500',    emoji: '🎉' },
  diving:      { gradient: 'from-blue-600 to-cyan-500',    emoji: '🤿' },
  yoga:        { gradient: 'from-green-500 to-emerald-500', emoji: '🧘' },
  workshop:    { gradient: 'from-orange-500 to-amber-500', emoji: '🛠️' },
  competition: { gradient: 'from-red-500 to-rose-600',     emoji: '🏆' },
  training:    { gradient: 'from-cyan-500 to-sky-500',     emoji: '💪' },
  excursion:   { gradient: 'from-violet-500 to-purple-600', emoji: '🗺️' },
  other:       { gradient: 'from-slate-500 to-slate-700',  emoji: '⭐' },
};

const getTypeColor = (type) => EVENT_TYPES.find(t => t.value === type)?.color || 'default';
const getTypeLabel = (type) => EVENT_TYPES.find(t => t.value === type)?.label || type || 'Other';

function EventCard({ event, isRegistered, isFull, isPast, currencySymbol, onCardClick }) {
  const [imageVisible, setImageVisible] = useState(true);
  const theme = EVENT_TYPE_THEMES[event.event_type] || EVENT_TYPE_THEMES.other;
  const resolvedSrc = event.image_url ? resolvePublicUploadUrl(event.image_url) : '';
  const hasCover = !!(resolvedSrc && imageVisible);
  const accentSrc = hasCover ? resolvedSrc : '';
  const { bottomHex } = useImageAccent(accentSrc, 'blue');

  const isPaid = event.price && Number(event.price) > 0;
  const spotsLeft = event.capacity ? event.capacity - (event.registration_count || 0) : null;
  const fillPct = event.capacity ? Math.min(100, ((event.registration_count || 0) / event.capacity) * 100) : 0;

  const dateLine = event.start_at ? dayjs(event.start_at).format('MMM D').toUpperCase() : 'TBD';
  const timeLine = event.start_at ? dayjs(event.start_at).format('ddd · HH:mm').toUpperCase() : '';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(event)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(event); } }}
      className={`group relative flex min-h-[360px] flex-col overflow-hidden rounded-3xl transition-[transform,box-shadow,border-color] duration-300 cursor-pointer hover:-translate-y-1 border ${
        isRegistered
          ? 'border-emerald-500/70 bg-[#1a1f26]/60 shadow-[0_0_12px_rgba(16,185,129,0.45),0_0_28px_rgba(16,185,129,0.2)] hover:border-emerald-500/85 hover:shadow-[0_0_18px_rgba(16,185,129,0.6),0_0_40px_rgba(16,185,129,0.25)] md:bg-[#1a1f26]/92 md:shadow-[0_2px_20px_rgba(0,0,0,0.35),0_0_12px_rgba(16,185,129,0.35)] md:hover:shadow-[0_8px_28px_rgba(16,185,129,0.35),0_0_0_1px_rgba(16,185,129,0.4)]'
          : 'border-[rgba(30,58,138,0.5)] bg-[#1a1f26]/60 shadow-[0_0_10px_rgba(30,58,138,0.3),0_0_25px_rgba(30,58,138,0.15)] backdrop-blur-sm hover:border-[rgba(30,58,138,0.75)] hover:shadow-[0_0_15px_rgba(30,58,138,0.45),0_0_35px_rgba(30,58,138,0.2)] md:border-[rgba(30,58,138,0.55)] md:bg-[#1a1f26]/92 md:shadow-[0_2px_20px_rgba(0,0,0,0.35)] md:hover:border-[rgba(30,58,138,0.85)] md:hover:shadow-[0_8px_28px_rgba(30,58,138,0.25),0_0_0_1px_rgba(30,58,138,0.35)]'
      }`}
    >
      {/* Image / gradient area — 70% */}
      <div className="relative min-h-[200px] flex-[7] overflow-hidden rounded-t-3xl">
        {hasCover && (
          <img
            src={resolvedSrc}
            alt={event.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 max-md:group-hover:scale-[1.03] md:transition-none"
            loading="lazy"
            onError={() => setImageVisible(false)}
          />
        )}

        {/* Fallback gradient when no image */}
        <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${theme.gradient} ${hasCover ? 'hidden' : ''}`}>
          <span className="text-8xl opacity-30 select-none">{theme.emoji}</span>
        </div>

        {/* Bottom fade — blends image into the lower panel */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(to top, ${bottomHex} 0%, ${bottomHex}e6 6%, ${bottomHex}99 14%, rgba(0,0,0,0.14) 38%, transparent 68%)`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(180,220,240,0.06)_0%,transparent_65%)]" />

        {/* Top-left: registered / full / past badge */}
        <div className="absolute left-2.5 top-2.5 z-20 flex flex-col items-start gap-1.5">
          {isRegistered && (
            <div className="flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm">
              <CheckCircleOutlined className="text-[10px]" /> GOING
            </div>
          )}
          {!isRegistered && isFull && (
            <div className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm">
              SOLD OUT
            </div>
          )}
          {isPast && (
            <div className="rounded-full bg-slate-600/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm">
              PAST
            </div>
          )}
        </div>

        {/* Top-right: date / type / price badge */}
        <div className="absolute right-2.5 top-2.5 z-20 max-w-[46%] rounded-lg bg-black/85 px-2 py-1.5 text-right text-white shadow-md backdrop-blur-sm md:bg-slate-950/90">
          <p className="font-duotone-bold-extended text-[9px] uppercase leading-tight tracking-wide text-white/95">
            {dateLine}
          </p>
          <p className="mt-0.5 font-duotone-regular text-[8px] uppercase leading-snug tracking-wide text-white/75">
            {timeLine}
          </p>
          {isPaid ? (
            <>
              <p className="mt-0.5 font-duotone-regular text-[7px] uppercase tracking-[0.18em] text-white/55">FROM</p>
              <p className="font-duotone-bold-extended text-sm italic leading-none text-white">
                {currencySymbol}{Number(event.price).toFixed(0)}
              </p>
            </>
          ) : (
            <p className="mt-1 font-duotone-bold-extended text-sm italic leading-none text-emerald-400">FREE</p>
          )}
        </div>
      </div>

      {/* Bottom info panel — 30% */}
      <div
        className="relative z-10 flex min-h-0 flex-[3] flex-col justify-center rounded-b-3xl px-3 py-3 text-center sm:px-4 sm:py-3.5"
        style={{ backgroundColor: bottomHex }}
      >
        <p className="mb-1 font-duotone-regular text-[9px] uppercase tracking-[0.18em] text-white/50 sm:text-[10px]">
          {getTypeLabel(event.event_type)}
        </p>
        <h3 className="font-duotone-bold-extended text-sm uppercase leading-snug tracking-wide text-white line-clamp-2 break-words sm:text-base">
          {event.name}
        </h3>
        {event.description ? (
          <p className="mx-auto mt-1.5 max-w-md font-duotone-regular text-[10px] uppercase leading-snug tracking-wide text-white/75 line-clamp-2 sm:text-[11px]">
            {event.description}
          </p>
        ) : event.location ? (
          <p className="mx-auto mt-1.5 font-duotone-regular text-[10px] uppercase leading-snug tracking-wide text-white/75 sm:text-[11px]">
            {event.location}
          </p>
        ) : null}

        {/* Capacity bar */}
        {event.capacity > 0 && (
          <div className="mt-2">
            <div className="h-0.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isFull ? 'bg-red-400/70' : 'bg-white/35'}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <p className="mt-1 text-[9px] font-duotone-regular uppercase tracking-wide text-white/40">
              {isFull ? 'SOLD OUT' : `${spotsLeft} SPOT${spotsLeft !== 1 ? 'S' : ''} LEFT`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventsPage() {
  usePageSEO({
    title: 'Events | Plannivo',
    description: 'Upcoming community events, social gatherings, competitions, and special experiences.',
    path: '/services/events',
  });
  const navigate = useNavigate();
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
  const [imageUrl, setImageUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
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
    staleTime: 120_000,
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
    staleTime: 30_000,
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
    staleTime: 120_000,
  });
  const myRegEventIds = useMemo(() => {
    if (!myRegistrations) return new Set();
    return new Set(myRegistrations.filter(r => r.status === 'registered').map(r => r.event_id));
  }, [myRegistrations]);

  // ── Drawer helpers ────────────────────────────────────────────
  const openCreate = () => {
    setEditingEvent(null);
    setImageUrl(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (event) => {
    setEditingEvent(event);
    setImageUrl(event.image_url || null);
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
    setImageUrl(null);
    form.resetFields();
  };

  const handleImageUpload = async ({ file, onSuccess, onError }) => {
    try {
      setImageUploading(true);
      const data = await serviceApi.uploadServiceImage(file);
      const url = data?.imageUrl || data?.url;
      if (!url) throw new Error('No image URL returned');
      setImageUrl(url);
      message.success('Image uploaded');
      onSuccess?.(data, file);
    } catch (e) {
      message.error(e?.response?.data?.error || e?.message || 'Failed to upload image');
      onError?.(e);
    } finally {
      setImageUploading(false);
    }
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
      image_url: imageUrl || null,
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
        <div className="flex items-center gap-2.5">
          {record.image_url ? (
            <img
              src={resolvePublicUploadUrl(record.image_url)}
              alt=""
              className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-slate-100"
            />
          ) : (
            <div className={`w-9 h-9 rounded-lg flex-shrink-0 bg-gradient-to-br ${(EVENT_TYPE_THEMES[record.event_type] || EVENT_TYPE_THEMES.other).gradient} flex items-center justify-center text-lg`}>
              {(EVENT_TYPE_THEMES[record.event_type] || EVENT_TYPE_THEMES.other).emoji}
            </div>
          )}
          <div>
            <div className="font-medium text-sm text-slate-800">{typeof name === 'string' ? name : ''}</div>
            {record.location && typeof record.location === 'string' && (
              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                <EnvironmentOutlined /> {record.location}
              </div>
            )}
          </div>
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
    const upcomingEvents = events.filter(e => e.status === 'scheduled');
    return (
      <div className="min-h-screen bg-[#f4f6f8] selection:bg-sky-400/30 font-sans" style={{ overflowX: 'clip' }}>
        {/* Background radial gradients */}
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background: [
              'radial-gradient(ellipse 80% 50% at 90% 10%, rgba(56,189,248,0.14) 0%, transparent 70%)',
              'radial-gradient(ellipse 60% 60% at 10% 50%, rgba(139,92,246,0.10) 0%, transparent 70%)',
              'radial-gradient(ellipse 70% 40% at 60% 90%, rgba(14,165,233,0.09) 0%, transparent 70%)',
            ].join(', ')
          }}
        />

        {/* Hero */}
        <div className="relative z-10 pt-6 pb-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-4">
            <div className="mb-4 flex justify-center">
              <span className="font-gotham-bold text-3xl text-white/80" style={{ letterSpacing: '0.05em' }}>Plannivo</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-duotone-bold-extended text-slate-900 mb-4 uppercase">
              Community{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-violet-500">Events</span>
            </h1>
            <p className="text-lg md:text-xl font-duotone-regular text-slate-500 max-w-3xl mx-auto leading-relaxed">
              Join the crew. From beach parties and diving trips to workshops and competitions — there&apos;s always something happening.
            </p>

          </div>
        </div>

        {/* Event Cards Grid */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="text-sm text-slate-400">Loading events...</div>
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center shadow-sm">
              <div className="text-6xl mb-4">🗓️</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">No upcoming events</h3>
              <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
                No events are scheduled right now. Check back soon or contact us to stay in the loop.
              </p>
              <button
                onClick={() => navigate('/contact')}
                className="mt-6 px-6 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Contact Us
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcomingEvents.map(event => {
                const isRegistered = myRegEventIds.has(event.id);
                const isFull = event.capacity && (event.registration_count || 0) >= event.capacity;
                const isPast = dayjs(event.start_at).isBefore(dayjs());
                return (
                  <EventCard
                    key={event.id}
                    event={event}
                    isRegistered={isRegistered}
                    isFull={isFull}
                    isPast={isPast}
                    currencySymbol={currencySymbol}
                    onCardClick={setConfirmEvent}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Google Reviews */}
        <div className="relative z-10">
          <GoogleReviewsStrip />
        </div>

        {/* Contact section */}
        <div className="relative z-10 py-16 sm:py-20 bg-[#f4f6f8] border-t border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended mb-3 text-slate-900">
              Want to know about upcoming events?
            </h2>
            <p className="text-slate-500 font-duotone-regular mb-8 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Get in touch and we&apos;ll keep you posted on everything happening at UKC this season.
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => navigate('/contact')}
                className="h-12 px-10 text-base font-duotone-bold rounded-md shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
                style={{ backgroundColor: '#4b4f54', color: '#1E3A8A', border: '1px solid rgba(30,58,138,0.5)', boxShadow: '0 0 12px rgba(30,58,138,0.2)' }}
              >
                Contact Us
              </button>
            </div>
            <ContactOptionsBanner variant="light" />
          </div>
        </div>

        {/* Event detail / join / cancel modal */}
        <Modal
          open={!!confirmEvent}
          onCancel={() => setConfirmEvent(null)}
          footer={null}
          centered
          width={460}
          destroyOnClose
          closeIcon={null}
          styles={{ content: { padding: 0, overflow: 'hidden', borderRadius: 20 }, body: { padding: 0 } }}
        >
          {confirmEvent && (() => {
            const ev = confirmEvent;
            const isAlreadyRegistered = myRegEventIds.has(ev.id);
            const evIsFull = ev.capacity && (ev.registration_count || 0) >= ev.capacity;
            const evIsPast = dayjs(ev.start_at).isBefore(dayjs());
            const isPaid = ev.price && Number(ev.price) > 0;
            const spotsLeft = ev.capacity ? ev.capacity - (ev.registration_count || 0) : null;
            const evTheme = EVENT_TYPE_THEMES[ev.event_type] || EVENT_TYPE_THEMES.other;
            const coverSrc = ev.image_url ? resolvePublicUploadUrl(ev.image_url) : null;

            return (
              <div>
                {/* ── Image / gradient header ── */}
                <div className={`relative h-52 overflow-hidden ${coverSrc ? '' : `bg-gradient-to-br ${evTheme.gradient}`}`}>
                  {coverSrc && (
                    <img src={coverSrc} alt={ev.name} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {!coverSrc && (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-9xl opacity-20 select-none">{evTheme.emoji}</span>
                    </div>
                  )}
                  {/* Gradient fade to white at the bottom */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

                  {/* Close button — top-right, standalone */}
                  <button
                    onClick={() => setConfirmEvent(null)}
                    className="absolute right-3 top-3 z-20 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                  >
                    <CloseOutlined className="text-xs" />
                  </button>

                  {/* Event type badge — top-left */}
                  <div className="absolute left-4 top-4 z-10">
                    <span className="inline-block bg-black/50 backdrop-blur-sm border border-white/15 text-white text-[10px] font-duotone-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                      {getTypeLabel(ev.event_type)}
                    </span>
                  </div>

                  {/* Title + price — bottom overlay */}
                  <div className="absolute bottom-4 left-4 right-4 z-10">
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-duotone-bold-extended text-xl uppercase text-white leading-snug drop-shadow-sm line-clamp-2">
                          {ev.name}
                        </h3>
                        {isAlreadyRegistered && (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[10px] font-duotone-bold uppercase tracking-wide text-white">
                            <CheckCircleOutlined className="text-[9px]" /> You&apos;re going
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {isPaid
                          ? <span className="font-duotone-bold-extended text-sm text-white bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-lg tabular-nums">
                              {currencySymbol}{Number(ev.price).toFixed(0)}
                            </span>
                          : <span className="font-duotone-bold-extended text-sm text-white bg-emerald-500/85 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                              FREE
                            </span>
                        }
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Body ── */}
                <div className="bg-white px-5 pt-4 pb-2 space-y-3">
                  {ev.description && (
                    <p className="font-duotone-regular text-sm text-slate-500 leading-relaxed">
                      {ev.description}
                    </p>
                  )}

                  <div className="space-y-2">
                    {ev.start_at && (
                      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                        <CalendarOutlined className="flex-shrink-0 text-base" style={{ color: '#1E3A8A' }} />
                        <div>
                          <p className="font-duotone-bold text-sm text-slate-800">
                            {dayjs(ev.start_at).format('dddd, MMMM D, YYYY')}
                          </p>
                          <p className="font-duotone-regular text-xs text-slate-400">
                            {dayjs(ev.start_at).format('HH:mm')}{ev.end_at ? ` – ${dayjs(ev.end_at).format('HH:mm')}` : ''}
                          </p>
                        </div>
                      </div>
                    )}
                    {ev.location && (
                      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                        <EnvironmentOutlined className="flex-shrink-0 text-base" style={{ color: '#1E3A8A' }} />
                        <p className="font-duotone-regular text-sm text-slate-700">{ev.location}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                      <TeamOutlined className="flex-shrink-0 text-base" style={{ color: '#1E3A8A' }} />
                      <p className="font-duotone-regular text-sm text-slate-700">
                        {ev.registration_count || 0} registered
                        {ev.capacity ? ` / ${ev.capacity} spots` : ''}
                        {spotsLeft !== null && spotsLeft > 0 && (
                          <span className="font-duotone-bold ml-1.5" style={{ color: '#1E3A8A' }}>
                            · {spotsLeft} left
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {isPaid && !isAlreadyRegistered && !evIsPast && (
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <DollarOutlined className="text-amber-500 flex-shrink-0 text-base mt-0.5" />
                      <div>
                        <p className="font-duotone-bold text-xs uppercase tracking-wide text-amber-800">Paid event</p>
                        <p className="font-duotone-regular text-xs text-amber-600 mt-0.5 leading-relaxed">
                          {currencySymbol}{Number(ev.price).toFixed(0)} per person — collected by the academy.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Footer / actions ── */}
                <div className="border-t border-slate-100 bg-slate-50 px-5 pt-4 pb-5">
                  {evIsPast ? (
                    <p className="text-center font-duotone-regular text-sm text-slate-400 py-1">
                      This event has passed
                    </p>
                  ) : isAlreadyRegistered ? (
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => setConfirmEvent(null)}
                          className="flex-1 h-12 rounded-xl font-duotone-bold text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                        >
                          Close
                        </button>
                        <Popconfirm
                          title="Cancel your registration?"
                          onConfirm={() => { selfUnregisterMutation.mutate(ev.id); setConfirmEvent(null); }}
                          okButtonProps={{ danger: true }}
                          placement="top"
                        >
                          <button
                            disabled={selfUnregisterMutation.isPending}
                            className="flex-1 h-12 rounded-xl font-duotone-bold text-sm text-red-500 border border-red-200 bg-white hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {selfUnregisterMutation.isPending ? 'Cancelling...' : 'Cancel Registration'}
                          </button>
                        </Popconfirm>
                      </div>
                    </div>
                  ) : evIsFull ? (
                    <p className="text-center font-duotone-regular text-sm text-amber-600 py-1">
                      This event is full
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <button
                        onClick={() => { selfRegisterMutation.mutate(ev.id); setConfirmEvent(null); }}
                        disabled={selfRegisterMutation.isPending}
                        className="w-full h-12 rounded-xl font-duotone-bold text-base shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                        style={{
                          backgroundColor: '#4b4f54',
                          color: '#1E3A8A',
                          border: '1px solid rgba(30,58,138,0.5)',
                          boxShadow: '0 0 12px rgba(30,58,138,0.25)',
                        }}
                      >
                        {selfRegisterMutation.isPending ? 'Joining...' : 'Confirm & Join'}
                      </button>
                      <p className="text-center font-duotone-regular text-[11px] text-slate-400">
                        You can cancel your registration at any time.
                      </p>
                    </div>
                  )}
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

              <Form.Item label={<span className="text-xs font-medium text-slate-600">Cover Photo</span>}>
                <div className="flex items-start gap-3">
                  <Upload
                    name="image"
                    listType="picture-card"
                    showUploadList={false}
                    accept="image/*"
                    customRequest={handleImageUpload}
                    disabled={imageUploading}
                    beforeUpload={(file) => {
                      if (!file.type?.startsWith('image/')) {
                        message.error('Please upload an image file');
                        return Upload.LIST_IGNORE;
                      }
                      if (file.size / 1024 / 1024 > 5) {
                        message.error('Image must be smaller than 5MB');
                        return Upload.LIST_IGNORE;
                      }
                      return true;
                    }}
                    className="!w-[104px] !h-[104px]"
                  >
                    {imageUrl ? (
                      <img
                        src={resolvePublicUploadUrl(imageUrl)}
                        alt="Event cover"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 gap-1">
                        {imageUploading ? <LoadingOutlined className="text-xl" /> : <PictureOutlined className="text-xl" />}
                        <span className="text-[11px]">{imageUploading ? 'Uploading...' : 'Upload'}</span>
                      </div>
                    )}
                  </Upload>
                  <div className="flex-1 pt-1">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Shown on the event card. JPG or PNG, max 5 MB. If not set, a gradient based on event type is shown.
                    </p>
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl(null)}
                        className="mt-2 text-[11px] text-red-400 hover:text-red-600 transition-colors"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>
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
