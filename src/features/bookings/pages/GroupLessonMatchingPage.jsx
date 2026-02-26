/**
 * GroupLessonMatchingPage (Admin / Manager)
 *
 * Shows all pending group-lesson requests.
 * Managers select 2+ compatible requests and create a group booking (match).
 */

import { useState, useMemo } from 'react';
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
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { matchGroupLessonRequests } from '@/features/bookings/services/groupLessonRequestService';
import { usePageSEO } from '@/shared/utils/seo';

const { Title, Text } = Typography;

const GroupLessonMatchingPage = () => {
  usePageSEO({
    title: 'Group Lesson Requests',
    description: 'Match students who requested group lessons'
  });

  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState([]);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchForm] = Form.useForm();
  const [filters, setFilters] = useState({ status: 'pending', serviceId: null, skillLevel: null });

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

  const statusColor = (s) => ({
    pending: 'orange',
    matched: 'green',
    cancelled: 'default',
    expired: 'red',
  }[s] || 'default');

  const skillIcon = (lvl) => ({
    beginner: '🌱',
    intermediate: '🏄',
    advanced: '🏆',
    any: '🎯',
  }[lvl] || '');

  // -- Table columns ---------------------------------------------------

  const columns = [
    {
      title: '',
      dataIndex: 'id',
      width: 48,
      render: (id, record) => record.status === 'pending' ? (
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
      title: 'Student',
      dataIndex: 'user_name',
      render: (name, r) => (
        <div>
          <Text strong>{name || r.userName || 'Unknown'}</Text>
          {(r.user_email || r.userEmail) && (
            <Text type="secondary" className="block text-xs">{r.user_email || r.userEmail}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Lesson',
      dataIndex: 'service_name',
      render: (name, r) => name || r.serviceName || '—',
    },
    {
      title: 'Dates',
      dataIndex: 'preferred_date_start',
      render: (start, r) => {
        const s = start || r.preferredDateStart;
        const e = r.preferred_date_end || r.preferredDateEnd;
        return (
          <span>
            {dayjs(s).format('MMM D')}
            {e ? ` – ${dayjs(e).format('MMM D')}` : ''}
          </span>
        );
      },
    },
    {
      title: 'Time',
      dataIndex: 'preferred_time_of_day',
      render: (t, r) => <Tag>{t || r.preferredTimeOfDay || 'any'}</Tag>,
    },
    {
      title: 'Duration',
      dataIndex: 'preferred_duration_hours',
      render: (d, r) => `${d || r.preferredDurationHours || 1}h`,
    },
    {
      title: 'Skill',
      dataIndex: 'skill_level',
      render: (lvl, r) => {
        const l = lvl || r.skillLevel || 'any';
        return <span>{skillIcon(l)} {l}</span>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s) => <Tag color={statusColor(s)}>{s}</Tag>,
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      ellipsis: true,
      render: (n) => n || '—',
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      render: (d, r) => dayjs(d || r.createdAt).format('MMM D, HH:mm'),
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
            <Text type="secondary">Match students who want a group lesson partner</Text>
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
            pagination={{ pageSize: 20 }}
            size="middle"
            scroll={{ x: 1000 }}
            rowClassName={(r) => selectedIds.includes(r.id) ? 'bg-blue-50' : ''}
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
    </div>
  );
};

export default GroupLessonMatchingPage;
