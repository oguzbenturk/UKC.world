/**
 * LessonMatchUpsTab — Admin view for pending lesson match-ups
 *
 * Shows all pending / pending_partner bookings from the bookings table
 * that were created as group/partner lessons (via the partner invite flow).
 * Admin can view details or delete (with full refund/cleanup).
 */

import { useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Empty,
  Spin,
  Avatar,
  Popconfirm,
  message,
  Typography,
} from 'antd';
import {
  ArrowPathIcon,
  TrashIcon,
  ClockIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';

const { Title, Text } = Typography;

const statusConfig = {
  pending: { color: 'orange', label: 'Pending' },
  pending_partner: { color: 'volcano', label: 'Waiting Partner' },
  confirmed: { color: 'blue', label: 'Confirmed' },
  cancelled: { color: 'default', label: 'Cancelled' },
};

const LessonMatchUpsTab = () => {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState(null);

  const { data: matchups = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', 'lesson-matchups'],
    queryFn: async () => {
      const res = await apiClient.get('/group-lesson-requests', {
        params: { status: '' },
      });
      const all = res.data?.requests || res.data || [];
      // Only show pending_partner lesson_booking source items (awaiting partner to accept)
      return all.filter(r => r.source === 'lesson_booking' && r.status === 'pending_partner');
    },
    staleTime: 15_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (bookingId) => {
      setDeletingId(bookingId);
      return apiClient.delete(`/bookings/${bookingId}`, {
        data: { reason: 'Admin deleted from Lesson Match Ups' },
      });
    },
    onSuccess: (res) => {
      const data = res.data;
      const parts = [];
      if (data.totalHoursRestored > 0) parts.push(`${data.totalHoursRestored}h restored to packages`);
      if (data.balanceRefunded > 0) parts.push(`€${data.balanceRefunded} refunded`);
      message.success(`Lesson deleted${parts.length ? ': ' + parts.join(', ') : ''}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'lesson-matchups'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'group-lesson-requests'] });
      queryClient.invalidateQueries({ queryKey: ['partner-invites'] });
    },
    onError: (err) => {
      message.error(err.response?.data?.message || 'Failed to delete booking');
    },
    onSettled: () => setDeletingId(null),
  });

  const columns = [
    {
      title: 'Student',
      dataIndex: 'user_name',
      width: 180,
      render: (name, r) => (
        <div className="leading-tight">
          <span className="text-sm font-medium text-slate-800 block truncate">
            {name || r.userName || 'Unknown'}
          </span>
          <span className="text-xs text-slate-400 block truncate">
            {r.service_name || r.serviceName || '—'}
          </span>
        </div>
      ),
    },
    {
      title: 'Participants',
      dataIndex: 'participants',
      width: 200,
      render: (raw) => {
        const participants = typeof raw === 'string'
          ? (() => { try { return JSON.parse(raw); } catch { return []; } })()
          : raw;
        if (!Array.isArray(participants) || participants.length === 0) {
          return <span className="text-xs text-slate-400">—</span>;
        }
        return (
          <div className="leading-tight space-y-0.5">
            {participants.map((p, i) => {
              const paidColor = p.payment_status === 'paid' || p.payment_status === 'package'
                ? 'bg-emerald-500'
                : p.payment_status === 'pending' ? 'bg-amber-400' : 'bg-slate-300';
              return (
                <div key={p.name || `p-${i}`} className="flex items-center gap-1 truncate">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${paidColor} flex-shrink-0`} />
                  <span className="text-xs text-slate-600 truncate">
                    {p.name || 'Unknown'}
                  </span>
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      title: 'Schedule',
      dataIndex: 'preferred_date_start',
      width: 150,
      render: (start, r) => {
        const d = start || r.preferredDateStart;
        const time = r.preferred_time_of_day || r.preferredTimeOfDay || r.start_time;
        const dur = r.preferred_duration_hours || r.preferredDurationHours || r.duration_hours;
        return (
          <div className="leading-tight">
            <span className="text-sm text-slate-700 block">
              {d ? dayjs(d).format('MMM D, YYYY') : 'TBD'}
            </span>
            <span className="text-xs text-slate-400 block">
              {time || 'any'}{dur ? ` · ${dur}h` : ''}
            </span>
          </div>
        );
      },
      sorter: (a, b) =>
        dayjs(a.preferred_date_start || a.created_at).unix() -
        dayjs(b.preferred_date_start || b.created_at).unix(),
    },
    {
      title: 'Instructor',
      dataIndex: 'instructor_name',
      width: 130,
      render: (name) => (
        <span className={`text-sm ${name ? 'text-slate-700' : 'text-slate-400 italic'}`}>
          {name || 'Unassigned'}
        </span>
      ),
    },
    {
      title: 'Price',
      dataIndex: 'price_per_person',
      width: 90,
      render: (p, r) => {
        const price = p || r.pricePerPerson;
        if (!price && price !== 0) return <span className="text-xs text-slate-400">—</span>;
        const c = r.currency || 'EUR';
        const sym = { EUR: '€', USD: '$', TRY: '₺', GBP: '£' }[c] || c;
        return <span className="text-sm font-medium text-slate-700">{sym}{Number(price).toFixed(0)}</span>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (s) => {
        const cfg = statusConfig[s] || { color: 'default', label: s };
        return <Tag color={cfg.color} className="!text-xs !m-0">{cfg.label}</Tag>;
      },
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Waiting Partner', value: 'pending_partner' },
        { text: 'Confirmed', value: 'confirmed' },
        { text: 'Cancelled', value: 'cancelled' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      width: 90,
      render: (d) => (
        <span className="text-xs text-slate-500">
          {d ? dayjs(d).format('MMM D') : '—'}
        </span>
      ),
      sorter: (a, b) =>
        dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="Delete this lesson?"
          description="Package hours will be refunded. Payments will be returned to wallet. This cannot be undone."
          okText="Delete & Refund"
          okButtonProps={{ danger: true }}
          onConfirm={() => deleteMutation.mutate(record.id)}
        >
          <Button
            size="small"
            danger
            icon={<TrashIcon className="w-3.5 h-3.5" />}
            loading={deletingId === record.id}
            className="!rounded-lg"
          >
            Delete
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const pendingCount = matchups.filter(
    (m) => m.status === 'pending' || m.status === 'pending_partner'
  ).length;

  return (
    <div className="max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Avatar
            size={48}
            className="bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center"
            icon={<ClockIcon className="w-6 h-6" />}
          />
          <div>
            <Title level={3} className="!mb-0">Lesson Match Ups</Title>
            <Text type="secondary">
              {pendingCount > 0
                ? `${pendingCount} lesson${pendingCount > 1 ? 's' : ''} waiting for confirmation`
                : 'All lessons confirmed or matched'}
            </Text>
          </div>
        </div>
        <Button
          icon={<ArrowPathIcon className="w-4 h-4" />}
          onClick={() => refetch()}
          className="!rounded-xl"
        >
          Refresh
        </Button>
      </div>

      {/* Stats pills */}
      {!isLoading && matchups.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-sm">
            <span className="font-medium text-orange-700">{matchups.length}</span>
            <span className="text-orange-500">Waiting for partner</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-sm">
            <UserGroupIcon className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-700">{matchups.length}</span>
            <span className="text-slate-500">Total</span>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spin size="large" /></div>
      ) : matchups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Empty description="No lesson match-ups found" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <Table
            dataSource={matchups}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 20, showSizeChanger: true, size: 'small' }}
            size="small"
          />
        </div>
      )}
    </div>
  );
};

export default LessonMatchUpsTab;
