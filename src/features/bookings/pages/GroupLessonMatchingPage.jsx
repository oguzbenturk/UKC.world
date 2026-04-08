import { useState, useEffect } from 'react';
import {
  Typography,
  Button,
  Table,
  Tag,
  Select,
  Space,
  Empty,
  Avatar,
  Spin,
  Tooltip
} from 'antd';
import {
  ArrowPathIcon,
  UserGroupIcon,
  StarIcon
} from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { usePageSEO } from '@/shared/utils/seo';
import { useSearchParams } from 'react-router-dom';
import GroupBookingDetailDrawer from '../components/GroupBookingDetailDrawer';

const { Title, Text } = Typography;

const paymentDot = (status) => {
  const colors = { paid: 'bg-emerald-500', pending: 'bg-amber-400', not_applicable: 'bg-slate-300' };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] || 'bg-slate-300'} mr-1`} />;
};

const statusDot = (status) => {
  const colors = { accepted: 'bg-cyan-400', invited: 'bg-blue-400', declined: 'bg-red-400', paid: 'bg-emerald-500' };
  return colors[status] ? <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status]} ml-1`} /> : null;
};

const getCurrencySymbol = (c) => ({ EUR: '\u20AC', USD: '$', TRY: '\u20BA', GBP: '\u00A3', CHF: 'CHF' }[c || 'EUR'] || c || '\u20AC');

const GroupLessonMatchingPage = () => {
  usePageSEO({
    title: 'Group Bookings',
    description: 'View pending group bookings'
  });

  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ status: 'pending', serviceId: null });
  const [searchParams] = useSearchParams();
  const [selectedGroupBookingId, setSelectedGroupBookingId] = useState(null);

  // Auto-open drawer when groupBookingId is present in URL (e.g. from notification click)
  useEffect(() => {
    const idFromUrl = searchParams.get('groupBookingId');
    if (idFromUrl) {
      setSelectedGroupBookingId(idFromUrl);
    }
  }, [searchParams]);

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
      dataIndex: 'user_name',
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
      width: 200,
      render: (raw) => {
        const participants = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
        if (!Array.isArray(participants) || participants.length === 0) return <span className="text-[11px] text-slate-400">-</span>;
        return (
          <div className="leading-tight space-y-0.5">
            {participants.map((p, i) => (
              <div key={i} className="flex items-center gap-0.5">
                {paymentDot(p.payment_status)}
                <span className={`text-[11px] truncate max-w-[120px] ${p.is_organizer ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                  {p.name || 'Unknown'}
                </span>
                {p.is_organizer && (
                  <Tooltip title="Organizer">
                    <StarIcon className="w-3 h-3 text-amber-500 shrink-0" />
                  </Tooltip>
                )}
                {statusDot(p.status)}
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
              {time ? time.substring(0, 5) : 'any'}{dur ? ` \u00B7 ${dur}h` : ''}
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
        const sym = getCurrencySymbol(r.currency);
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
            scroll={{ x: 900 }}
            rowClassName="cursor-pointer hover:bg-slate-50 transition-colors"
            onRow={(record) => ({
              onClick: () => {
                if (record.id) setSelectedGroupBookingId(record.id);
              },
            })}
          />
        )}
      </div>

      {/* Group Booking Detail Drawer */}
      <GroupBookingDetailDrawer
        isOpen={!!selectedGroupBookingId}
        onClose={() => setSelectedGroupBookingId(null)}
        groupBookingId={selectedGroupBookingId}
        onUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'group-lesson-requests'] });
          setSelectedGroupBookingId(null);
        }}
      />
    </div>
  );
};

export default GroupLessonMatchingPage;
