/**
 * LessonMatchUpsTab — Admin view for "Find a Partner" solo requests
 *
 * Shows all requests from group_lesson_requests (source='request').
 * Admin can select multiple students and match them into a group booking.
 */

import { useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Empty,
  Spin,
  Popconfirm,
  message,
  Typography,
} from 'antd';
import {
  ArrowPathIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { CalendarProvider } from '@/features/bookings/components/contexts/CalendarContext';
import BookingDrawer from '@/features/bookings/components/components/BookingDrawer';

const { Title, Text } = Typography;

const statusConfig = {
  pending:   { color: 'orange', label: 'Pending' },
  matched:   { color: 'green',  label: 'Matched' },
  cancelled: { color: 'default', label: 'Cancelled' },
};

// --- Main Tab -------------------------------------------------------------
const LessonMatchUpsTab = () => {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId]             = useState(null);
  const [selectedRowKeys, setSelectedRowKeys]   = useState([]);
  const [bookingDrawerOpen, setBookingDrawerOpen] = useState(false);

  const { data: matchups = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', 'lesson-matchups'],
    queryFn: async () => {
      const res = await apiClient.get('/group-lesson-requests', {
        params: { status: '' },
      });
      const all = res.data?.requests || res.data || [];
      return all.filter(r => r.source === 'request');
    },
    staleTime: 15_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (requestId) => {
      setDeletingId(requestId);
      return apiClient.delete('/group-lesson-requests/' + requestId);
    },
    onSuccess: () => {
      message.success('Request cancelled');
      queryClient.invalidateQueries({ queryKey: ['admin', 'lesson-matchups'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'group-lesson-requests'] });
    },
    onError: (err) => {
      message.error((err.response && err.response.data && err.response.data.message) || 'Failed to cancel');
    },
    onSettled: () => setDeletingId(null),
  });

  const selectedRows = matchups.filter(r => selectedRowKeys.includes(r.id));

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    getCheckboxProps: (record) => ({
      disabled: record.status !== 'pending',
    }),
  };

  const columns = [
    {
      title: 'Student',
      dataIndex: 'user_name',
      width: 190,
      render: (name, r) => (
        <div className="leading-tight">
          <span className="text-sm font-medium text-slate-800 block truncate">
            {name || r.first_name || 'Unknown'}
          </span>
          {r.phone && (
            <span className="text-xs text-slate-500 block">{r.phone}</span>
          )}
          {(r.weight || r.date_of_birth) && (
            <span className="text-[10px] text-slate-400 block">
              {r.weight ? (r.weight + 'kg') : ''}
              {r.weight && r.date_of_birth ? ' · ' : ''}
              {r.date_of_birth ? ('b. ' + dayjs(r.date_of_birth).format('MMM D, YYYY')) : ''}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Package',
      dataIndex: 'service_name',
      width: 170,
      render: (svc, r) => (
        <div className="leading-tight">
          <span className="text-sm text-slate-700 block truncate">{svc || '-'}</span>
          {r.preferred_duration_hours ? (
            <Tag color="blue" className="!text-[10px] !m-0 !mt-0.5">
              {r.preferred_duration_hours}h
            </Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Availability',
      dataIndex: 'preferred_date_start',
      width: 150,
      render: (start, r) => {
        const from = start || r.preferredDateStart;
        const to   = r.preferred_date_end || r.preferredDateEnd;
        return (
          <div className="leading-tight">
            <span className="text-sm text-slate-700 block">
              {from ? dayjs(from).format('MMM D') : 'Any'}
              {to ? (' to ' + dayjs(to).format('MMM D')) : ''}
            </span>
            {r.skill_level && (
              <Tag color="volcano" className="!text-[10px] !m-0 !mt-0.5">
                {r.skill_level}
              </Tag>
            )}
          </div>
        );
      },
      sorter: (a, b) =>
        dayjs(a.preferred_date_start || a.created_at).unix() -
        dayjs(b.preferred_date_start || b.created_at).unix(),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      width: 150,
      render: (notes) => notes
        ? <span className="text-xs text-slate-500 line-clamp-2">{notes}</span>
        : <span className="text-xs text-slate-300">-</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (s) => {
        const cfg = statusConfig[s] || { color: 'default', label: s };
        return <Tag color={cfg.color} className="!text-xs !m-0">{cfg.label}</Tag>;
      },
      filters: [
        { text: 'Pending',   value: 'pending' },
        { text: 'Matched',   value: 'matched' },
        { text: 'Cancelled', value: 'cancelled' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      width: 85,
      render: (d) => (
        <span className="text-xs text-slate-400">
          {d ? dayjs(d).format('MMM D') : '-'}
        </span>
      ),
      sorter: (a, b) =>
        dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: '',
      key: 'actions',
      width: 44,
      render: (_, record) => (
        <Popconfirm
          title="Cancel this request?"
          description="The student won't be matched for this lesson."
          okText="Cancel it"
          okButtonProps={{ danger: true, size: 'small' }}
          onConfirm={(e) => { if (e) e.stopPropagation(); deleteMutation.mutate(record.id); }}
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<TrashIcon className="w-3.5 h-3.5" />}
            loading={deletingId === record.id}
            onClick={(e) => e.stopPropagation()}
            className="!rounded-lg"
          />
        </Popconfirm>
      ),
    },
  ];

  const pendingCount = matchups.filter(m => m.status === 'pending').length;

  return (
    <div className="max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <Title level={3} className="!mb-0">Lesson Match Ups</Title>
          <Text type="secondary" className="text-sm">
            {pendingCount > 0
              ? (pendingCount + ' student' + (pendingCount !== 1 ? 's' : '') + ' waiting for a partner')
              : 'No pending partner requests'}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {selectedRowKeys.length >= 2 && (
            <Button
              type="primary"
              icon={<UserGroupIcon className="w-4 h-4" />}
              onClick={() => setBookingDrawerOpen(true)}
              className="!rounded-xl !font-semibold"
            >
              Match {selectedRowKeys.length} Students
            </Button>
          )}
          <Button
            icon={<ArrowPathIcon className="w-4 h-4" />}
            onClick={() => refetch()}
            className="!rounded-xl"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats pills */}
      {!isLoading && matchups.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-sm">
            <span className="font-medium text-orange-700">{pendingCount}</span>
            <span className="text-orange-500">Pending</span>
          </div>
          {matchups.filter(m => m.status === 'matched').length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-sm">
              <span className="font-medium text-green-700">{matchups.filter(m => m.status === 'matched').length}</span>
              <span className="text-green-500">Matched</span>
            </div>
          )}
          {selectedRowKeys.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-300 text-sm">
              <span className="font-medium text-blue-700">{selectedRowKeys.length}</span>
              <span className="text-blue-500">selected</span>
              {selectedRowKeys.length >= 2 && (
                <button
                  onClick={() => setBookingDrawerOpen(true)}
                  className="text-blue-600 font-semibold underline underline-offset-2 ml-1"
                >
                  Match them
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spin size="large" /></div>
      ) : matchups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Empty description="No partner requests yet" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <Table
            dataSource={matchups}
            columns={columns}
            rowKey="id"
            rowSelection={rowSelection}
            pagination={{ pageSize: 20, showSizeChanger: true, size: 'small' }}
            size="small"
            rowClassName={(r) =>
              selectedRowKeys.includes(r.id)
                ? 'bg-blue-50'
                : 'hover:bg-slate-50 transition-colors'
            }
          />
        </div>
      )}

      {bookingDrawerOpen && (
        <CalendarProvider>
          <BookingDrawer
            isOpen={bookingDrawerOpen}
            onClose={() => setBookingDrawerOpen(false)}
            prefilledParticipants={selectedRows}
            prefilledServiceId={selectedRows[0]?.service_id || null}
            onBookingCreated={async (booking) => {
              // Mark the matched requests as 'matched' and link them to the new booking
              try {
                await apiClient.post('/group-lesson-requests/mark-matched', {
                  requestIds: selectedRowKeys,
                  bookingId: booking?.id || booking?.bookingId || null,
                });
              } catch (err) {
                // Booking was created — just warn that status update failed
                message.warning('Booking created, but failed to mark students as matched. Please refresh.');
                console.error('[mark-matched] error:', err?.response?.data || err?.message);
              }
              setBookingDrawerOpen(false);
              setSelectedRowKeys([]);
              queryClient.invalidateQueries({ queryKey: ['admin', 'lesson-matchups'] });
              queryClient.invalidateQueries({ queryKey: ['admin', 'group-lesson-requests'] });
              message.success('Students matched and booking created!');
            }}
          />
        </CalendarProvider>
      )}
    </div>
  );
};

export default LessonMatchUpsTab;
