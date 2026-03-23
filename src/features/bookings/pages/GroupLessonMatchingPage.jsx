/**
 * GroupLessonMatchingPage (Admin / Manager)
 *
 * Shows all pending group-lesson requests.
 * Managers select 2+ compatible requests and create a group booking (match).
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Card,
  Typography,
  Button,
  Table,
  Tag,
  Select,
  Space,
  message,
  Modal,
  Form,
  DatePicker,
  TimePicker,
  InputNumber,
  Empty,
  Alert,
  Checkbox,
  Avatar,
  Spin
} from 'antd';
import {
  SparklesIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { matchGroupLessonRequests } from '@/features/bookings/services/groupLessonRequestService';
import { usePageSEO } from '@/shared/utils/seo';
import { useSearchParams } from 'react-router-dom';
import GroupBookingDetailDrawer from '@/features/bookings/components/GroupBookingDetailDrawer';

const { Title, Text } = Typography;

const paymentDot = (status) => {
  const colors = { paid: 'bg-emerald-500', pending: 'bg-amber-400', not_applicable: 'bg-slate-300' };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] || 'bg-slate-300'} mr-1`} />;
};

const GroupLessonMatchingPage = () => {
  usePageSEO({
    title: 'Group Lesson Requests',
    description: 'Match students who requested group lessons'
  });

  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState([]);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchForm] = Form.useForm();
  const [filters, setFilters] = useState({ status: '', serviceId: null, skillLevel: null });
  const [searchParams] = useSearchParams();
  const groupBookingIdFromUrl = searchParams.get('groupBookingId');
  const [drawerBookingId, setDrawerBookingId] = useState(null);

  // Auto-open detail drawer when navigated from notification
  useEffect(() => {
    if (groupBookingIdFromUrl && !drawerBookingId) {
      setDrawerBookingId(groupBookingIdFromUrl);
    }
  }, [groupBookingIdFromUrl]);

  // -- Queries ---------------------------------------------------------

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', 'group-lesson-requests', filters],
    queryFn: async () => {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.serviceId) params.serviceId = filters.serviceId;
      if (filters.skillLevel) params.skillLevel = filters.skillLevel;
      const res = await apiClient.get('/group-lesson-requests', { params });
      return res.data?.requests || res.data || [];
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

  const { data: instructors = [] } = useQuery({
    queryKey: ['admin', 'instructors-list'],
    queryFn: async () => {
      const res = await apiClient.get('/users/instructors');
      return res.data?.instructors || res.data || [];
    },
    staleTime: 300_000,
  });

  // -- Match mutation --------------------------------------------------

  const matchMutation = useMutation({
    mutationFn: async (values) => {
      return matchGroupLessonRequests({
        requestIds: selectedIds,
        groupDetails: {
          serviceId: values.serviceId,
          scheduledDate: values.date.format('YYYY-MM-DD'),
          startTime: values.startTime.format('HH:mm'),
          durationHours: values.durationHours || 1,
          pricePerPerson: values.pricePerPerson ?? 0,
          maxParticipants: values.maxParticipants || selectedIds.length,
          instructorId: values.instructorId || null,
          title: values.title || 'Group Lesson',
          notes: values.notes || null,
        },
      });
    },
    onSuccess: () => {
      message.success(`Matched ${selectedIds.length} requests into a group booking!`);
      setMatchModalOpen(false);
      setSelectedIds([]);
      matchForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['admin', 'group-lesson-requests'] });
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Matching failed');
    },
  });

  // -- Helpers ---------------------------------------------------------

  const selectedRows = useMemo(
    () => requests.filter(r => selectedIds.includes(r.id)),
    [requests, selectedIds]
  );

  const allSameService = useMemo(() => {
    if (selectedRows.length < 2) return false;
    const sid = selectedRows[0].service_id || selectedRows[0].serviceId;
    return selectedRows.every(r => (r.service_id || r.serviceId) === sid);
  }, [selectedRows]);

  const canMatch = selectedIds.length >= 2 && allSameService;

  // Stats
  const stats = useMemo(() => {
    const soloRequests = requests.filter(r => r.source === 'request');
    const groupBookings = requests.filter(r => r.source === 'group_booking');
    const lessonBookings = requests.filter(r => r.source === 'lesson_booking');
    const pendingGroups = groupBookings.filter(r => r.status === 'pending');
    const waitingPartner = lessonBookings.filter(r => r.status === 'pending_partner');
    const totalParticipants = groupBookings.reduce((sum, r) => sum + (parseInt(r.participant_count, 10) || 0), 0);
    return { soloRequests: soloRequests.length, groupBookings: groupBookings.length, lessonBookings: lessonBookings.length, pendingGroups: pendingGroups.length, waitingPartner: waitingPartner.length, totalParticipants };
  }, [requests]);

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
      title: '',
      dataIndex: 'id',
      width: 36,
      render: (id, record) => record.source !== 'group_booking' && record.status === 'pending' ? (
        <Checkbox
          checked={selectedIds.includes(id)}
          onChange={(e) => {
            setSelectedIds(prev =>
              e.target.checked ? [...prev, id] : prev.filter(x => x !== id)
            );
          }}
        />
      ) : null,
    },
    {
      title: 'Type',
      dataIndex: 'source',
      width: 120,
      render: (source, r) => source === 'group_booking' ? (
        <Tag color="blue" className="!rounded-full !text-[11px] !m-0">
          <UserGroupIcon className="w-3 h-3 inline mr-0.5" />
          Group ({r.participant_count || 0})
        </Tag>
      ) : source === 'lesson_booking' ? (
        <Tag color={r.status === 'pending_partner' ? 'volcano' : 'green'} className="!rounded-full !text-[11px] !m-0">
          Lesson{r.status === 'pending_partner' ? ' ⏳' : ''}
        </Tag>
      ) : (
        <Tag color="purple" className="!rounded-full !text-[11px] !m-0">Solo</Tag>
      ),
      filters: [
        { text: 'Solo Requests', value: 'request' },
        { text: 'Group Bookings', value: 'group_booking' },
        { text: 'Lesson Bookings', value: 'lesson_booking' },
      ],
      onFilter: (value, record) => record.source === value,
    },
    {
      title: 'Student / Lesson',
      dataIndex: 'user_name',
      width: 200,
      ellipsis: true,
      render: (name, r) => (
        <div className="leading-tight">
          <span className="text-xs font-medium text-slate-800 block truncate">{name || r.userName || 'Unknown'}</span>
          <span className="text-[11px] text-slate-400 block truncate">{r.service_name || r.serviceName || '—'}</span>
          {r.source === 'group_booking' && r.title && (
            <span className="text-[11px] text-blue-400 block truncate">{r.title}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Participants',
      dataIndex: 'participants',
      width: 180,
      render: (raw) => {
        const participants = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
        if (!Array.isArray(participants) || participants.length === 0) return <span className="text-[11px] text-slate-400">—</span>;
        return (
          <div className="leading-tight space-y-0.5">
            {participants.map((p, i) => (
              <div key={i} className="flex items-center gap-0.5 truncate">
                {paymentDot(p.payment_status)}
                <span className={`text-[11px] truncate ${p.is_organizer ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                  {p.name || 'Unknown'}{p.is_organizer ? ' ★' : ''}
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
      width: 140,
      render: (start, r) => {
        const s = start || r.preferredDateStart;
        const time = r.preferred_time_of_day || r.preferredTimeOfDay;
        const dur = r.preferred_duration_hours || r.preferredDurationHours || r.duration_hours;
        return (
          <div className="leading-tight">
            <span className="text-xs text-slate-700 block">{s ? dayjs(s).format('MMM D, YYYY') : '—'}</span>
            <span className="text-[11px] text-slate-400 block">
              {time || 'any'}{dur ? ` · ${dur}h` : ''}
            </span>
          </div>
        );
      },
      sorter: (a, b) => dayjs(a.preferred_date_start || a.created_at).unix() - dayjs(b.preferred_date_start || b.created_at).unix(),
    },
    {
      title: 'Instructor / Price',
      dataIndex: 'instructor_name',
      width: 130,
      ellipsis: true,
      render: (name, r) => {
        const n = name || r.instructorName;
        const p = r.price_per_person || r.pricePerPerson;
        const c = r.currency || 'EUR';
        const sym = { EUR: '€', USD: '$', TRY: '₺', GBP: '£' }[c] || c;
        return (
          <div className="leading-tight">
            <span className={`text-xs block truncate ${n ? 'text-slate-700' : 'text-slate-400'}`}>{n || 'Unassigned'}</span>
            {(p || p === 0) && <span className="text-[11px] font-medium text-emerald-600 block">{sym}{Number(p).toFixed(0)}/pp</span>}
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s) => <Tag color={statusColor(s)} className="!text-[11px] !m-0">{statusLabel(s)}</Tag>,
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      width: 90,
      render: (d, r) => <span className="text-xs text-slate-500">{dayjs(d || r.createdAt).format('MMM D')}</span>,
      sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
    },
  ];

  // -- Open match modal with prefill -----------------------------------

  const openMatchModal = () => {
    if (!canMatch) return;
    const first = selectedRows[0];
    matchForm.setFieldsValue({
      serviceId: first.service_id || first.serviceId,
      durationHours: first.preferred_duration_hours || first.preferredDurationHours || 1,
      maxParticipants: selectedIds.length,
      title: `${first.service_name || first.serviceName || 'Group'} Lesson`,
    });
    setMatchModalOpen(true);
  };

  // -- Render ----------------------------------------------------------

  return (
    <div className="max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Avatar
            size={48}
            className="bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center"
            icon={<SparklesIcon className="w-6 h-6" />}
          />
          <div>
            <Title level={3} className="!mb-0">Group Lesson Requests</Title>
            <Text type="secondary">View group bookings and match solo students</Text>
          </div>
        </div>

        <Space wrap>
          <Select
            value={filters.status}
            onChange={(v) => setFilters(f => ({ ...f, status: v }))}
            style={{ width: 140 }}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'pending_partner', label: 'Waiting Partner' },
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
          <Select
            value={filters.skillLevel}
            onChange={(v) => setFilters(f => ({ ...f, skillLevel: v }))}
            allowClear
            placeholder="Any skill"
            style={{ width: 140 }}
            options={[
              { value: 'beginner', label: '🌱 Beginner' },
              { value: 'intermediate', label: '🏄 Intermediate' },
              { value: 'advanced', label: '🏆 Advanced' },
            ]}
          />
          <Button icon={<ArrowPathIcon className="w-4 h-4" />} onClick={() => refetch()}>
            Refresh
          </Button>
        </Space>
      </div>

      {/* Stats Bar */}
      {!isLoading && requests.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200 text-sm">
            <SparklesIcon className="w-4 h-4 text-purple-500" />
            <span className="font-medium text-purple-700">{stats.soloRequests}</span>
            <span className="text-purple-500">Solo Requests</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-sm">
            <UserGroupIcon className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-blue-700">{stats.groupBookings}</span>
            <span className="text-blue-500">Group Bookings</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-sm">
            <span className="font-medium text-green-700">{stats.lessonBookings}</span>
            <span className="text-green-500">Lesson Bookings</span>
          </div>
          {stats.waitingPartner > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-sm">
              <span className="font-medium text-orange-700">{stats.waitingPartner}</span>
              <span className="text-orange-500">Waiting Partner</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-sm">
            <span className="font-medium text-slate-700">{stats.totalParticipants}</span>
            <span className="text-slate-500">Total Participants</span>
          </div>
        </div>
      )}

      {/* Selection bar */}
      {selectedIds.length > 0 && (
        <Alert
          type={canMatch ? 'success' : 'warning'}
          className="mb-4"
          showIcon
          message={
            canMatch
              ? `${selectedIds.length} requests selected — ready to match!`
              : selectedIds.length < 2
                ? 'Select at least 2 requests to match'
                : 'Selected requests must be for the same lesson type'
          }
          action={
            <Space>
              <Button size="small" onClick={() => setSelectedIds([])}>Clear</Button>
              <Button
                type="primary"
                size="small"
                disabled={!canMatch}
                icon={<CheckCircleIcon className="w-4 h-4" />}
                onClick={openMatchModal}
              >
                Match Selected
              </Button>
            </Space>
          }
        />
      )}

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-16"><Spin size="large" /></div>
        ) : requests.length === 0 ? (
          <Empty description="No group lesson requests found" />
        ) : (
          <Table
            dataSource={requests}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 20, showSizeChanger: true, size: 'small' }}
            size="small"
            rowClassName={(r) => `${selectedIds.includes(r.id) ? 'bg-blue-50' : ''} ${r.source === 'group_booking' ? 'cursor-pointer' : ''}`}
            onRow={(record) => ({
              onClick: () => {
                if (record.source === 'group_booking') setDrawerBookingId(record.id);
              },
            })}
          />
        )}
      </Card>

      {/* Match Modal */}
      <Modal
        title="Create Group Booking from Requests"
        open={matchModalOpen}
        onCancel={() => setMatchModalOpen(false)}
        onOk={() => matchForm.validateFields().then(v => matchMutation.mutate(v))}
        confirmLoading={matchMutation.isPending}
        okText="Match & Create Booking"
        width={540}
      >
        <Alert
          type="info"
          className="mb-4"
          message={`Matching ${selectedIds.length} students into a group booking`}
          description="A group booking will be created and all selected students will be added as participants."
        />
        <Form form={matchForm} layout="vertical">
          <Form.Item name="title" label="Booking title" rules={[{ required: true }]}>
            <Select
              showSearch
              allowClear
              placeholder="e.g. Group Kite Lesson"
              options={services.map(s => ({ value: `${s.name || s.title} Group`, label: `${s.name || s.title} Group` }))}
              mode={undefined}
            />
          </Form.Item>
          <Form.Item name="serviceId" label="Lesson type" rules={[{ required: true }]}>
            <Select
              options={services.map(s => ({ value: s.id, label: s.name || s.title }))}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker className="w-full" disabledDate={d => d && d.isBefore(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="startTime" label="Start time" rules={[{ required: true }]}>
              <TimePicker className="w-full" format="HH:mm" minuteStep={15} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="durationHours" label="Duration (h)" initialValue={1}>
              <InputNumber min={0.5} max={8} step={0.5} className="w-full" />
            </Form.Item>
            <Form.Item name="pricePerPerson" label="Price / person (€)" initialValue={0}>
              <InputNumber min={0} step={5} className="w-full" />
            </Form.Item>
            <Form.Item name="maxParticipants" label="Max participants">
              <InputNumber min={2} max={20} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="instructorId" label="Instructor (optional)">
            <Select
              allowClear
              placeholder="Assign later"
              showSearch
              optionFilterProp="label"
              options={instructors.map(i => ({
                value: i.id,
                label: `${i.first_name || i.firstName || ''} ${i.last_name || i.lastName || ''}`.trim() || i.name || i.email,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Group Booking Detail Drawer */}
      <GroupBookingDetailDrawer
        isOpen={!!drawerBookingId}
        onClose={() => setDrawerBookingId(null)}
        groupBookingId={drawerBookingId}
        onUpdate={() => queryClient.invalidateQueries({ queryKey: ['admin', 'group-lesson-requests'] })}
      />
    </div>
  );
};

export default GroupLessonMatchingPage;
