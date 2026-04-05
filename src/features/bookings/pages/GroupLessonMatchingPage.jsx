import { useState } from 'react';
import {
  Typography,
  Button,
  Table,
  Tag,
  Select,
  Space,
  Empty,
  Avatar,
  Spin
} from 'antd';
import {
  ArrowPathIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { usePageSEO } from '@/shared/utils/seo';
import { useSearchParams } from 'react-router-dom';

const BookingDetailModal = lazy(() => import('@/features/customers/components/BookingDetailModal'));

const { Title, Text } = Typography;

const paymentDot = (status) => {
  const colors = { paid: 'bg-emerald-500', pending: 'bg-amber-400', not_applicable: 'bg-slate-300' };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] || 'bg-slate-300'} mr-1`} />;
};

const GroupLessonMatchingPage = () => {
  usePageSEO({
    title: 'Group Bookings',
    description: 'View pending group bookings'
  });

  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ status: 'pending', serviceId: null });
  const [searchParams] = useSearchParams();
  const [selectedBookingId, setSelectedBookingId] = useState(null); // calendar booking id for BookingDetailModal

  // -- Queries ---------------------------------------------------------

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', 'group-lesson-requests', filters],
    queryFn: async () => {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.serviceId) params.serviceId = filters.serviceId;
      const res = await apiClient.get('/group-lesson-requests', { params });
      const all = res.data?.requests || res.data || [];
      // STRICT FILTER: Only show actual group bookings, no solo requests
      return all.filter(r => r.source === 'group_booking');
    },
    staleTime: 30_000,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['admin', 'services-lessons'],
    queryFn: async () => {
      const res = await apiClient.get('/services', { params: { category: 'lesson' } });
      const data = Array.isArray(res.data) ? res.data : res.data?.services || [];
      return data.filter(s => s.status === 'active' || !s.status);
    },
    staleTime: 300_000,
  });

  // -- Helpers ---------------------------------------------------------

  const statusColor = (s) => ({
    pending: 'orange',
    pending_partner: 'volcano',
    matched: 'green',
    confirmed: 'blue',
    full: 'cyan',
    cancelled: 'default',
    expired: 'red',
  }[s] || 'default');

  const statusLabel = (s) => ({
    pending_partner: 'Waiting Partner',
  }[s] || s);

  // -- Table columns ---------------------------------------------------

  const columns = [
    {
      title: 'Group Name / Lesson',
      dataIndex: 'user_name', // for group bookings, it maps organizer name
      render: (_, r) => (
        <div className="leading-tight">
          <span className="text-xs font-bold text-slate-800 block truncate">{r.title || 'Group Booking'}</span>
          <span className="text-[11px] text-slate-500 block truncate">{r.service_name || r.serviceName || '-'}</span>
          <span className="text-[10px] text-slate-400 block truncate">Org: {r.user_name || r.userName || 'Unknown'}</span>
        </div>
      ),
    },
    {
      title: 'Participants',
      dataIndex: 'participants',
      width: 180,
      render: (raw) => {
        const participants = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
        if (!Array.isArray(participants) || participants.length === 0) return <span className="text-[11px] text-slate-400">-</span>;
        return (
          <div className="leading-tight space-y-0.5">
            {participants.map((p, i) => (
              <div key={i} className="flex items-center gap-0.5 truncate">
                {paymentDot(p.payment_status)}
                <span className={`text-[11px] truncate ${p.is_organizer ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                  {p.name || 'Unknown'}{p.is_organizer ? ' ?' : ''}
                </span>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: 'Schedule',
      dataIndex: 'preferred_date_start',
      width: 150,
      render: (start, r) => {
        const s = start || r.preferredDateStart || r.scheduled_date;
        const time = r.preferred_time_of_day || r.preferredTimeOfDay || r.start_time;
        const dur = r.preferred_duration_hours || r.preferredDurationHours || r.duration_hours;
        return (
          <div className="leading-tight">
            <span className="text-xs font-medium text-slate-700 block">{s ? dayjs(s).format('MMM D, YYYY') : '-'}</span>
            <span className="text-[11px] text-slate-500 block">
              {time ? time.substring(0, 5) : 'any'}{dur ? ` � ${dur}h` : ''}
            </span>
          </div>
        );
      },
      sorter: (a, b) => dayjs(a.preferred_date_start || a.scheduled_date || a.created_at).unix() - dayjs(b.preferred_date_start || b.scheduled_date || b.created_at).unix(),
    },
    {
      title: 'Instructor / Price',
      dataIndex: 'instructor_name',
      width: 140,
      render: (name, r) => {
        const n = name || r.instructorName;
        const p = r.price_per_person || r.pricePerPerson;
        const c = r.currency || 'EUR';
        const sym = { EUR: '�', USD: '$', TRY: '?', GBP: '�' }[c] || c;
        return (
          <div className="leading-tight">
            <span className={`text-xs block truncate ${n ? 'text-slate-700' : 'text-slate-400'}`}>{n || 'Unassigned'}</span>
            {(p || p === 0) && <span className="text-[11px] font-bold text-emerald-600 block">{sym}{Number(p).toFixed(0)}/pp</span>}
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (s) => <Tag color={statusColor(s)} className="!text-[11px] !m-0 !font-medium uppercase tracking-wide">{statusLabel(s)}</Tag>,
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      width: 100,
      render: (d, r) => <span className="text-[11px] text-slate-400">{dayjs(d || r.createdAt).format('MMM D, HH:mm')}</span>,
      sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
    },
  ];

  // -- Render ----------------------------------------------------------

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Avatar
            size={56}
            className="bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100"
            icon={<UserGroupIcon className="w-7 h-7" />}
          />
          <div>
            <Title level={3} className="!mb-0 !font-bold text-slate-800">Pending Group Bookings</Title>
            <Text type="secondary" className="text-sm">Manage group bookings submitted by users.</Text>
          </div>
        </div>

        <Space wrap size="middle">
          <Select
            value={filters.status}
            onChange={(v) => setFilters(f => ({ ...f, status: v }))}
            style={{ width: 140 }}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'full', label: 'Full' },
              { value: 'matched', label: 'Matched' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'expired', label: 'Expired' },
            ]}
          />
          <Select
            value={filters.serviceId}
            onChange={(v) => setFilters(f => ({ ...f, serviceId: v }))}
            allowClear
            placeholder="All lesson types"
            style={{ width: 180 }}
            options={services.map(s => ({ value: s.id, label: s.name || s.title }))}
          />
          <Button icon={<ArrowPathIcon className="w-4 h-4" />} onClick={() => refetch()} className="!rounded-lg">
            Refresh
          </Button>
        </Space>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-24"><Spin size="large" /></div>
        ) : requests.length === 0 ? (
          <div className="py-24">
            <Empty 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span className="text-slate-500">
                  No {filters.status ? filters.status : ''} group bookings found
                </span>
              } 
            />
          </div>
        ) : (
          <Table
            dataSource={requests}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 20, showSizeChanger: true, size: 'small' }}
            size="middle"
            rowClassName="cursor-pointer hover:bg-slate-50 transition-colors"
            onRow={(record) => ({
              onClick: () => {
                // calendar_booking_id comes from the backend JOIN with bookings table
                const bookingId = record.calendar_booking_id || record.calendarBookingId;
                if (bookingId) setSelectedBookingId(bookingId);
              },
            })}
          />
        )}
      </div>

      {/* Booking detail modal — same as the calendar view */}
      <Suspense fallback={null}>
        {selectedBookingId && (
          <BookingDetailModal
            visible
            bookingId={selectedBookingId}
            onClose={() => setSelectedBookingId(null)}
            onBookingUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ['admin', 'group-lesson-requests'] });
              setSelectedBookingId(null);
            }}
            onBookingDeleted={() => {
              queryClient.invalidateQueries({ queryKey: ['admin', 'group-lesson-requests'] });
              setSelectedBookingId(null);
            }}
          />
        )}
      </Suspense>
    </div>
  );
};

export default GroupLessonMatchingPage;
