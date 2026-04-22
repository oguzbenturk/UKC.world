import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Typography, Button, Tag, Form, Input, Select, Upload, Empty, Spin, Drawer, Space, Divider, Descriptions, Image, Avatar, Checkbox, Tabs, Tooltip } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { PlusOutlined, ToolOutlined, CameraOutlined, MessageOutlined, SendOutlined, LockOutlined, CheckOutlined, ClockCircleOutlined, CheckCircleOutlined, FireOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { useData } from '@/shared/hooks/useData';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';
import SparePartsOrders from '@/features/admin/pages/SparePartsOrders';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import CareLandingPage from '@/features/outsider/pages/CareLandingPage';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const parsePhotos = (photos) => {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos;
  if (typeof photos === 'string') {
    if (photos.startsWith('[')) {
      try { return JSON.parse(photos); } catch { return []; }
    }
    return [photos];
  }
  return [];
};

/**
 * RepairChat - Chat component for repair request conversations
 */
const RepairChat = ({ repairId, isAdmin, userId }) => {
  const { t } = useTranslation(['instructor']);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const chatEndRef = useRef(null);

  const fetchComments = async () => {
    if (!repairId) return;
    setLoading(true);
    try {
      const response = await apiClient.get(`/repair-requests/${repairId}/comments`);
      setComments(response.data.data);
    } catch (error) {
      // Silently fail - might be a new table not yet migrated
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [repairId]);

  useEffect(() => {
    // Scroll to bottom when comments change
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await apiClient.post(`/repair-requests/${repairId}/comments`, {
        message: newMessage.trim(),
        isInternal: isInternal
      });
      setNewMessage('');
      setIsInternal(false);
      fetchComments();
    } catch (error) {
      message.error(t('instructor:repairs.failedSendMessage'));
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getInitials = (firstName, lastName) => {
    return `${(firstName || '')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase() || '?';
  };

  const getAvatarColor = (role) => {
    const colors = {
      admin: '#f56a00',
      manager: '#7265e6',
      instructor: '#00a2ae',
      student: '#87d068',
      outsider: '#108ee9'
    };
    return colors[role] || '#666';
  };

  return (
    <div className="flex flex-col h-[350px]">
      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 rounded-lg">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spin size="small" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageOutlined className="text-3xl mb-2" />
            <Text className="text-gray-400">{t('instructor:repairs.noMessages')}</Text>
            <Text className="text-xs text-gray-400">{t('instructor:repairs.startConversation')}</Text>
          </div>
        ) : (
          <>
            {comments.map((comment) => {
              const isOwnMessage = comment.user_id === userId;
              const isStaff = ['admin', 'manager'].includes(comment.user_role);
              
              return (
                <div
                  key={comment.id}
                  className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar
                    size={32}
                    style={{ backgroundColor: getAvatarColor(comment.user_role), flexShrink: 0 }}
                  >
                    {getInitials(comment.first_name, comment.last_name)}
                  </Avatar>
                  <div className={`max-w-[75%] ${isOwnMessage ? 'text-right' : ''}`}>
                    <div className={`text-xs text-gray-500 mb-1 flex items-center gap-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                      <span className="font-medium">{comment.first_name} {comment.last_name}</span>
                      {isStaff && <Tag size="small" className="text-[10px] px-1 py-0">{t('instructor:repairs.staffTag')}</Tag>}
                      {comment.is_internal && (
                        <Tag icon={<LockOutlined />} color="purple" className="text-[10px] px-1 py-0">{t('instructor:repairs.internalTag')}</Tag>
                      )}
                    </div>
                    <div
                      className={`inline-block p-3 rounded-2xl ${
                        isOwnMessage
                          ? 'bg-blue-500 text-white rounded-tr-sm'
                          : comment.is_internal
                          ? 'bg-purple-100 border border-purple-300 rounded-tl-sm'
                          : 'bg-white border rounded-tl-sm'
                      }`}
                    >
                      <Text className={isOwnMessage ? 'text-white' : ''}>
                        {comment.message}
                      </Text>
                    </div>
                    <div className={`text-[10px] text-gray-400 mt-1 ${isOwnMessage ? 'text-right' : ''}`}>
                      {dayjs(comment.created_at).format('MMM D, h:mm A')}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </>
        )}
      </div>

      {/* Message input area */}
      <div className="mt-3 pt-3 border-t">
        <div className="flex gap-2">
          <TextArea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t('instructor:repairs.typeMessage')}
            autoSize={{ minRows: 1, maxRows: 3 }}
            className="flex-1"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={sending}
            disabled={!newMessage.trim()}
          />
        </div>
        {isAdmin && (
          <div className="mt-2">
            <Checkbox
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="text-xs"
            >
              <span className="text-xs text-gray-500">
                <LockOutlined className="mr-1" />
                {t('instructor:repairs.internal')}
              </span>
            </Checkbox>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Mobile Card ─────────────────────────────────────────────────────────────
const RepairMobileCard = ({ record, onAction, isAdmin, staffUsers = [] }) => {
  const { t } = useTranslation(['instructor']);
  const priorityColor = { urgent: 'red', high: 'orange', medium: 'gold', low: 'blue' };
  const statusColors = { pending: 'orange', in_progress: 'blue', completed: 'green', cancelled: 'default' };
  const assignee = staffUsers.find(u => u.id === record.assigned_to);
  return (
    <Card size="small" className="mb-2">
      <div className="flex justify-between items-start mb-2">
        <Space>
          {record.photos && parsePhotos(record.photos)[0]
            ? <Avatar shape="square" src={parsePhotos(record.photos)[0]} />
            : <Avatar shape="square" icon={<ToolOutlined />} />}
          <div>
            <div className="font-medium">{record.item_name}</div>
            <div className="text-xs text-gray-500 capitalize">{record.equipment_type} • {record.location}</div>
            {assignee && <div className="text-xs text-blue-500 mt-0.5">→ {assignee.first_name} {assignee.last_name}</div>}
          </div>
        </Space>
        <Tag color={priorityColor[record.priority] || 'blue'}>{record.priority}</Tag>
      </div>
      <div className="flex justify-between items-center mt-3">
        <Tag color={statusColors[record.status]}>{record.status?.toUpperCase().replace('_', ' ')}</Tag>
        <Button size="small" icon={<MessageOutlined />} onClick={() => onAction('view', record)}>{t('instructor:dashboard.view')}</Button>
      </div>
    </Card>
  );
};

/**
 * RepairsPage - Submit and track repair requests
 * Admin/manager: repairman workflow view (no New Request button)
 * Other roles: customer view with submit and track
 */
const ADMIN_REPAIR_ROLES = ['admin', 'manager'];
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

const RepairsPage = () => {
  const { user } = useAuth();

  // Non-admin/manager users see the outsider Care landing page
  if (!ADMIN_REPAIR_ROLES.includes(user?.role)) {
    return <CareLandingPage />;
  }

  return <RepairsAdminPage />;
};

const RepairsAdminPage = () => {
  const { t } = useTranslation(['instructor']);
  const { user } = useAuth();
  const { usersWithStudentRole = [] } = useData();

  const queryClient = useQueryClient();
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('pending');

  // Customer create drawer
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Detail drawer
  const [selectedRepair, setSelectedRepair] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Inline drawer edit
  const [drawerUpdating, setDrawerUpdating] = useState(false);
  const [drawerNotes, setDrawerNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);

  // Staff for assign-to
  const [staffUsers, setStaffUsers] = useState([]);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const priorityOptions = [
    { value: 'low',    label: 'Low',    color: 'blue' },
    { value: 'medium', label: 'Medium', color: 'gold' },
    { value: 'high',   label: 'High',   color: 'orange' },
    { value: 'urgent', label: 'Urgent', color: 'red' },
  ];
  const statusOptions = [
    { value: 'pending',     label: 'Pending',     color: 'orange' },
    { value: 'in_progress', label: 'In Progress', color: 'blue' },
    { value: 'completed',   label: 'Completed',   color: 'green' },
    { value: 'cancelled',   label: 'Cancelled',   color: 'default' },
  ];
  const statusColors = {
    pending: 'orange', in_progress: 'blue', completed: 'green', cancelled: 'default',
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const { data: repairs = [], isLoading: loading } = useQuery({
    queryKey: ['repairs'],
    queryFn: async () => {
      const res = await apiClient.get('/repair-requests');
      return [...res.data.data].sort((a, b) => {
        const pd = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
        return pd !== 0 ? pd : new Date(b.created_at) - new Date(a.created_at);
      });
    },
    staleTime: 60_000,
  });

  const fetchRepairs = () => queryClient.invalidateQueries({ queryKey: ['repairs'] });

  const fetchStaffUsers = async () => {
    try {
      const res = await apiClient.get('/users');
      const data = res.data?.data || res.data || [];
      setStaffUsers(data.filter(u => ['admin', 'manager', 'instructor'].includes(u.role)));
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    if (isAdmin) fetchStaffUsers();
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleViewDetails = (record) => {
    setSelectedRepair(record);
    setDrawerNotes(record.notes || '');
    setNotesDirty(false);
    setDetailDrawerOpen(true);
  };

  const handleQuickStatusChange = async (repairId, newStatus) => {
    try {
      await apiClient.patch(`/repair-requests/${repairId}`, { status: newStatus });
      message.success(t('instructor:repairs.statusUpdated'));
      fetchRepairs();
      if (selectedRepair?.id === repairId) {
        setSelectedRepair(prev => ({ ...prev, status: newStatus }));
      }
    } catch {
      message.error(t('instructor:repairs.failedStatus'));
    }
  };

  const handleQuickFieldChange = async (repairId, field, value) => {
    try {
      await apiClient.patch(`/repair-requests/${repairId}`, { [field]: value });
      message.success(t('instructor:repairs.updated'));
      fetchRepairs();
      if (selectedRepair?.id === repairId) {
        const stateKey = field === 'assignedTo' ? 'assigned_to' : field;
        setSelectedRepair(prev => ({ ...prev, [stateKey]: value }));
      }
    } catch {
      message.error(t('instructor:repairs.failedUpdate'));
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedRepair) return;
    setDrawerUpdating(true);
    try {
      await apiClient.patch(`/repair-requests/${selectedRepair.id}`, { notes: drawerNotes });
      message.success(t('instructor:repairs.notesSaved'));
      setNotesDirty(false);
      fetchRepairs();
      setSelectedRepair(prev => ({ ...prev, notes: drawerNotes }));
    } catch {
      message.error(t('instructor:repairs.failedNotes'));
    } finally {
      setDrawerUpdating(false);
    }
  };

  const handleSubmitRepair = async (values) => {
    try {
      const photos = fileList.map(f => f.response?.url || f.url).filter(Boolean);
      await apiClient.post('/repair-requests', {
        equipmentType: values.equipmentType,
        itemName: values.itemName,
        description: values.description,
        priority: values.priority,
        location: values.location,
        photos,
        ...(isAdmin && values.userId ? { userId: values.userId } : {}),
      });
      message.success(t('instructor:repairs.submitted'));
      setIsModalOpen(false);
      form.resetFields();
      setFileList([]);
      fetchRepairs();
    } catch {
      message.error(t('instructor:repairs.failedSubmit'));
    }
  };

  const uploadProps = {
    name: 'image',
    listType: 'picture-card',
    fileList,
    onChange: ({ fileList: newFileList }) => setFileList(newFileList),
    customRequest: async ({ file, onSuccess, onError, onProgress }) => {
      try {
        const formData = new FormData();
        formData.append('image', file);
        const token = localStorage.getItem('token');
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.total) onProgress?.({ percent: Math.round((e.loaded / e.total) * 100) });
        });
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) onSuccess?.(JSON.parse(xhr.responseText));
          else onError?.(new Error('Upload failed'));
        });
        xhr.addEventListener('error', () => onError?.(new Error('Upload failed')));
        xhr.open('POST', '/api/upload/repair-image');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      } catch (err) { onError?.(err); }
    },
    beforeUpload: (file) => {
      const isImg = file.type.startsWith('image/');
      const isSmall = file.size / 1024 / 1024 < 5;
      if (!isImg) message.error(t('instructor:repairs.form.imageOnly'));
      if (!isSmall) message.error(t('instructor:repairs.form.imageTooLarge'));
      return isImg && isSmall;
    },
  };

  // ── KPI ────────────────────────────────────────────────────────────────────
  const kpi = {
    pending:     repairs.filter(r => r.status === 'pending').length,
    in_progress: repairs.filter(r => r.status === 'in_progress').length,
    completed:   repairs.filter(r => r.status === 'completed').length,
    urgent:      repairs.filter(r => r.priority === 'urgent' && r.status !== 'completed' && r.status !== 'cancelled').length,
  };

  // ── Admin table columns ────────────────────────────────────────────────────
  const adminColumns = [
    {
      title: t('instructor:repairs.columns.item'),
      key: 'item',
      render: (_, record) => (
        <div>
          <div className="font-medium text-sm">{record.item_name}</div>
          <div className="text-xs text-gray-400 capitalize">
            {record.equipment_type}{record.location ? ` · ${record.location}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: t('instructor:repairs.columns.submittedBy'),
      key: 'submitted_by',
      render: (_, record) => (
        <Space size={4}>
          <span className="text-sm">{record.user_name || record.guest_name || '—'}</span>
          {!record.user_id && <Tag color="teal" className="text-xs">{t('instructor:repairs.guest')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('instructor:repairs.columns.priority'),
      dataIndex: 'priority',
      key: 'priority',
      render: (priority) => {
        const opt = priorityOptions.find(p => p.value === priority);
        return <Tag color={opt?.color}>{opt?.label || priority}</Tag>;
      },
    },
    {
      title: t('instructor:repairs.columns.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => (
        <Select
          value={status}
          size="small"
          style={{ width: 130 }}
          onChange={(val) => handleQuickStatusChange(record.id, val)}
          options={statusOptions}
        />
      ),
    },
    {
      title: t('instructor:repairs.columns.assignedTo'),
      key: 'assigned_to',
      render: (_, record) => (
        <Select
          value={record.assigned_to || null}
          size="small"
          allowClear
          placeholder={t('instructor:repairs.unassigned')}
          style={{ width: 145 }}
          onChange={(val) => handleQuickFieldChange(record.id, 'assignedTo', val || null)}
          options={staffUsers.map(u => ({
            value: u.id,
            label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          }))}
        />
      ),
    },
    {
      title: t('instructor:repairs.columns.date'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => <span className="text-xs text-gray-500">{dayjs(date).format('MMM D, YY')}</span>,
    },
    {
      title: t('instructor:repairs.columns.actions'),
      key: 'actions',
      render: (_, record) => (
        <Space size={4}>
          {record.status === 'pending' && (
            <Tooltip title={t('instructor:repairs.acceptTooltip')}>
              <Button
                size="small"
                type="primary"
                icon={<ClockCircleOutlined />}
                onClick={() => handleQuickStatusChange(record.id, 'in_progress')}
              >
                {t('instructor:repairs.accept')}
              </Button>
            </Tooltip>
          )}
          {record.status === 'in_progress' && (
            <Tooltip title={t('instructor:repairs.doneTooltip')}>
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleQuickStatusChange(record.id, 'completed')}
                className="bg-green-600 border-green-600"
              >
                {t('instructor:repairs.done')}
              </Button>
            </Tooltip>
          )}
          <Tooltip title={t('instructor:repairs.viewTooltip')}>
            <Button size="small" icon={<MessageOutlined />} onClick={() => handleViewDetails(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Customer table columns ─────────────────────────────────────────────────
  const customerColumns = [
    { title: t('instructor:repairs.columns.equipment'), dataIndex: 'equipment_type', key: 'equipment_type' },
    { title: t('instructor:repairs.columns.item'), dataIndex: 'item_name', key: 'item_name' },
    {
      title: t('instructor:repairs.columns.priority'),
      dataIndex: 'priority',
      key: 'priority',
      render: (priority) => {
        const opt = priorityOptions.find(p => p.value === priority);
        return <Tag color={opt?.color}>{opt?.label || priority}</Tag>;
      },
    },
    {
      title: t('instructor:repairs.columns.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={statusColors[status]}>{status?.replace('_', ' ').toUpperCase()}</Tag>
      ),
    },
    {
      title: t('instructor:repairs.columns.submitted'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => dayjs(date).format('MMM D, YYYY'),
    },
    {
      title: '',
      key: 'actions',
      render: (_, record) => (
        <Button type="text" size="small" icon={<MessageOutlined />} onClick={() => handleViewDetails(record)} />
      ),
    },
  ];

  // ── Admin tab builder ──────────────────────────────────────────────────────
  const buildAdminTab = (key, label, data, tagColor) => ({
    key,
    label: <span>{label} <Tag color={tagColor} className="ml-1">{data.length}</Tag></span>,
    children: (
      <Card className="rounded-2xl shadow-sm">
        <Spin spinning={loading}>
          {data.length > 0 ? (
            <UnifiedResponsiveTable
              dataSource={data}
              columns={adminColumns}
              rowKey="id"
              pagination={{ pageSize: 15 }}
              mobileCardRenderer={(props) => (
                <RepairMobileCard
                  {...props}
                  isAdmin
                  staffUsers={staffUsers}
                  onAction={(action, record) => { if (action === 'view') handleViewDetails(record); }}
                />
              )}
            />
          ) : (
            <Empty
              image={<ToolOutlined className="text-5xl text-slate-300" />}
              description={<span className="text-slate-400">{t('instructor:repairs.noRepairRequestsAdmin', { label })}</span>}
            />
          )}
        </Spin>
      </Card>
    ),
  });

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">

      {/* ── Admin / Repairman View ────────────────────────────────────────── */}
      {isAdmin ? (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                <ToolOutlined className="text-orange-500" /> {t('instructor:repairs.workshopTitle')}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {t('instructor:repairs.workshopSubtitle')}
              </p>
            </div>
            <Button icon={<ReloadOutlined />} onClick={fetchRepairs} loading={loading}>
              {t('instructor:repairs.refresh')}
            </Button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="rounded-2xl shadow-sm border-0 bg-orange-50" size="small">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
                  <ClockCircleOutlined className="text-orange-500 text-lg" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-600">{kpi.pending}</div>
                  <div className="text-xs text-slate-500">{t('instructor:repairs.kpiPending')}</div>
                </div>
              </div>
            </Card>
            <Card className="rounded-2xl shadow-sm border-0 bg-blue-50" size="small">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                  <ToolOutlined className="text-blue-500 text-lg" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{kpi.in_progress}</div>
                  <div className="text-xs text-slate-500">{t('instructor:repairs.kpiInProgress')}</div>
                </div>
              </div>
            </Card>
            <Card className="rounded-2xl shadow-sm border-0 bg-green-50" size="small">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCircleOutlined className="text-green-500 text-lg" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{kpi.completed}</div>
                  <div className="text-xs text-slate-500">{t('instructor:repairs.kpiCompleted')}</div>
                </div>
              </div>
            </Card>
            <Card className="rounded-2xl shadow-sm border-0 bg-red-50" size="small">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                  <FireOutlined className="text-red-500 text-lg" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{kpi.urgent}</div>
                  <div className="text-xs text-slate-500">{t('instructor:repairs.kpiUrgentActive')}</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              buildAdminTab('pending', t('instructor:repairs.tabPending'), repairs.filter(r => r.status === 'pending'), 'orange'),
              buildAdminTab('in_progress', t('instructor:repairs.tabInProgress'), repairs.filter(r => r.status === 'in_progress'), 'blue'),
              buildAdminTab('completed', t('instructor:repairs.tabCompleted'), repairs.filter(r => r.status === 'completed'), 'green'),
              buildAdminTab('all', t('instructor:repairs.tabAll'), repairs, 'default'),
              { key: 'spare-parts', label: t('instructor:repairs.tabSpareParts'), children: <SparePartsOrders /> },
            ]}
          />
        </>
      ) : (
        /* ── Customer View ───────────────────────────────────────────────── */
        <>
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 p-6 text-white shadow-lg">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                <ToolOutlined /> {t('instructor:repairs.careCenterLabel')}
              </div>
              <h1 className="text-3xl font-semibold">{t('instructor:repairs.equipmentCareTitle')}</h1>
              <p className="text-sm text-white/75">{t('instructor:repairs.equipmentCareSubtitle')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="rounded-2xl shadow-sm text-center" size="small">
              <div className="text-xl font-bold text-orange-500">{kpi.pending}</div>
              <div className="text-xs text-slate-500">{t('instructor:repairs.kpiPending')}</div>
            </Card>
            <Card className="rounded-2xl shadow-sm text-center" size="small">
              <div className="text-xl font-bold text-blue-500">{kpi.in_progress}</div>
              <div className="text-xs text-slate-500">{t('instructor:repairs.kpiInProgress')}</div>
            </Card>
            <Card className="rounded-2xl shadow-sm text-center" size="small">
              <div className="text-xl font-bold text-green-500">{kpi.completed}</div>
              <div className="text-xs text-slate-500">{t('instructor:repairs.kpiCompleted')}</div>
            </Card>
            <Card className="rounded-2xl shadow-sm text-center" size="small">
              <div className="text-xl font-bold text-slate-500">{repairs.length}</div>
              <div className="text-xs text-slate-500">{t('instructor:repairs.kpiTotal')}</div>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)} className="h-11 rounded-2xl">
              {t('instructor:repairs.newRepairRequest')}
            </Button>
          </div>

          <Card className="rounded-2xl shadow-sm">
            <h4 className="text-base font-semibold text-slate-800 mb-4">{t('instructor:repairs.myRepairRequests')}</h4>
            <Spin spinning={loading}>
              {repairs.length > 0 ? (
                <UnifiedResponsiveTable
                  dataSource={repairs}
                  columns={customerColumns}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  mobileCardRenderer={(props) => (
                    <RepairMobileCard
                      {...props}
                      isAdmin={false}
                      onAction={(action, record) => { if (action === 'view') handleViewDetails(record); }}
                    />
                  )}
                />
              ) : (
                <Empty
                  image={<ToolOutlined className="text-6xl text-slate-300" />}
                  description={
                    <div className="space-y-2">
                      <p className="text-slate-500">{t('instructor:repairs.noRepairRequests')}</p>
                      <p className="text-xs text-slate-400">{t('instructor:repairs.noRepairRequestsDesc')}</p>
                    </div>
                  }
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                    {t('instructor:repairs.submitFirstRequest')}
                  </Button>
                </Empty>
              )}
            </Spin>
          </Card>
        </>
      )}

      {/* ── Create Repair Request Drawer ───────────────────────────────────── */}
      <Drawer
        open={isModalOpen}
        onClose={() => { setIsModalOpen(false); form.resetFields(); setFileList([]); }}
        width={480}
        closable={false}
        destroyOnHidden
        styles={{
          body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
          header: { display: 'none' },
        }}
      >
        <div className="flex-shrink-0 bg-gradient-to-r from-orange-500 to-red-500 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg shadow-sm ring-1 ring-white/10">
                <ToolOutlined className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">{t('instructor:repairs.newRepairDrawerTitle')}</h2>
                <p className="text-orange-200 text-xs mt-0.5">{t('instructor:repairs.newRepairDrawerSubtitle')}</p>
              </div>
            </div>
            <button
              onClick={() => { setIsModalOpen(false); form.resetFields(); setFileList([]); }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white border-0 cursor-pointer transition-colors text-base"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <Form form={form} layout="vertical" onFinish={handleSubmitRepair}>
            {isAdmin && (
              <Form.Item name="userId" label={t('instructor:repairs.form.submitOnBehalf')} extra={t('instructor:repairs.form.submitOnBehalfExtra')}>
                <Select
                  showSearch allowClear placeholder={t('instructor:repairs.form.searchCustomer')} optionFilterProp="label"
                  options={usersWithStudentRole.map(u => ({
                    value: u.id,
                    label: `${u.first_name} ${u.last_name}`.trim() || u.email,
                  }))}
                />
              </Form.Item>
            )}
            <Form.Item name="equipmentType" label={t('instructor:repairs.form.brandAndModel')} rules={[{ required: true, message: t('instructor:repairs.form.required') }]}>
              <Input placeholder={t('instructor:repairs.form.brandPlaceholder')} />
            </Form.Item>
            <Form.Item name="itemName" label={t('instructor:repairs.form.itemName')} rules={[{ required: true, message: t('instructor:repairs.form.required') }]}>
              <Input placeholder={t('instructor:repairs.form.itemNamePlaceholder')} />
            </Form.Item>
            <Form.Item name="description" label={t('instructor:repairs.form.whatsWrong')} rules={[{ required: true, message: t('instructor:repairs.form.required') }]}>
              <TextArea rows={3} placeholder={t('instructor:repairs.form.whatsWrongPlaceholder')} />
            </Form.Item>
            <Form.Item name="photos" label={t('instructor:repairs.form.photosOptional')}>
              <Upload {...uploadProps}>
                {fileList.length >= 4 ? null : (
                  <div><CameraOutlined /><div style={{ marginTop: 8 }}>{t('instructor:repairs.form.upload')}</div></div>
                )}
              </Upload>
            </Form.Item>
            <Form.Item name="priority" label={t('instructor:repairs.form.priority')} rules={[{ required: true, message: t('instructor:repairs.form.required') }]}>
              <Select placeholder={t('instructor:repairs.form.priorityPlaceholder')} options={priorityOptions} />
            </Form.Item>
            <Form.Item name="location" label={t('instructor:repairs.form.location')}>
              <Input placeholder={t('instructor:repairs.form.locationPlaceholder')} />
            </Form.Item>
            <Form.Item className="!mb-0">
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <Button onClick={() => { setIsModalOpen(false); form.resetFields(); setFileList([]); }} className="flex-1 rounded-xl !h-10">
                  {t('instructor:repairs.form.cancel')}
                </Button>
                <Button type="primary" htmlType="submit" className="flex-1 rounded-xl !h-10 bg-gradient-to-r from-orange-500 to-red-500 border-0 shadow-md font-semibold">
                  {t('instructor:repairs.submitRepair')}
                </Button>
              </div>
            </Form.Item>
          </Form>
        </div>
      </Drawer>

      {/* ── Repair Detail Drawer ───────────────────────────────────────────── */}
      <Drawer
        title={
          <div className="flex items-center gap-2">
            <ToolOutlined className="text-orange-500" />
            <span>{selectedRepair?.item_name || t('instructor:repairs.detailsTitle')}</span>
            {selectedRepair && (
              <Tag color={priorityOptions.find(p => p.value === selectedRepair.priority)?.color} className="ml-1">
                {selectedRepair.priority}
              </Tag>
            )}
          </div>
        }
        placement="right"
        width={580}
        onClose={() => setDetailDrawerOpen(false)}
        open={detailDrawerOpen}
        destroyOnHidden
      >
        {selectedRepair && (
          <div className="space-y-5">

            {/* ── Admin inline controls ── */}
            {isAdmin && (
              <Card size="small" className="rounded-xl bg-slate-50 border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">{t('instructor:repairs.columns.status')}</div>
                    <Select
                      value={selectedRepair.status}
                      style={{ width: '100%' }}
                      onChange={(val) => handleQuickStatusChange(selectedRepair.id, val)}
                      options={statusOptions}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">{t('instructor:repairs.columns.priority')}</div>
                    <Select
                      value={selectedRepair.priority}
                      style={{ width: '100%' }}
                      onChange={(val) => handleQuickFieldChange(selectedRepair.id, 'priority', val)}
                      options={priorityOptions}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">{t('instructor:repairs.columns.assignedTo')}</div>
                    <Select
                      value={selectedRepair.assigned_to || null}
                      style={{ width: '100%' }}
                      allowClear
                      placeholder={t('instructor:repairs.unassigned')}
                      onChange={(val) => handleQuickFieldChange(selectedRepair.id, 'assignedTo', val || null)}
                      options={staffUsers.map(u => ({
                        value: u.id,
                        label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
                      }))}
                    />
                  </div>
                </div>
                <Divider className="my-3" />
                <div>
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <LockOutlined /> {t('instructor:repairs.workshopNotes')}
                  </div>
                  <TextArea
                    value={drawerNotes}
                    onChange={(e) => { setDrawerNotes(e.target.value); setNotesDirty(true); }}
                    rows={3}
                    placeholder={t('instructor:repairs.workshopNotesPlaceholder')}
                  />
                  {notesDirty && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<SaveOutlined />}
                      loading={drawerUpdating}
                      onClick={handleSaveNotes}
                      className="mt-2"
                    >
                      {t('instructor:repairs.saveNotes')}
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {/* ── Request info ── */}
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('instructor:repairs.detailFields.equipment')}>{selectedRepair.equipment_type}</Descriptions.Item>
              <Descriptions.Item label={t('instructor:repairs.detailFields.item')}>{selectedRepair.item_name}</Descriptions.Item>
              <Descriptions.Item label={t('instructor:repairs.detailFields.submittedBy')}>
                <Space size={4}>
                  {selectedRepair.user_name || selectedRepair.guest_name || 'Unknown'}
                  {!selectedRepair.user_id && <Tag color="teal">{t('instructor:repairs.guest')}</Tag>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label={t('instructor:repairs.detailFields.email')}>{selectedRepair.user_email || t('instructor:repairs.detailFields.na')}</Descriptions.Item>
              {!selectedRepair.user_id && selectedRepair.guest_phone && (
                <Descriptions.Item label={t('instructor:repairs.detailFields.phone')}>{selectedRepair.guest_phone}</Descriptions.Item>
              )}
              {!selectedRepair.user_id && selectedRepair.tracking_token && (
                <Descriptions.Item label={t('instructor:repairs.detailFields.trackingToken')}>
                  <span className="font-mono text-xs text-teal-600 break-all">{selectedRepair.tracking_token}</span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('instructor:repairs.detailFields.location')}>{selectedRepair.location || t('instructor:repairs.detailFields.locationNotSpecified')}</Descriptions.Item>
              <Descriptions.Item label={t('instructor:repairs.detailFields.submitted')}>{dayjs(selectedRepair.created_at).format('MMM DD, YYYY HH:mm')}</Descriptions.Item>
              {selectedRepair.updated_at && (
                <Descriptions.Item label={t('instructor:repairs.detailFields.lastUpdated')}>{dayjs(selectedRepair.updated_at).format('MMM DD, YYYY HH:mm')}</Descriptions.Item>
              )}
            </Descriptions>

            {/* ── Description ── */}
            <div>
              <Text strong>{t('instructor:repairs.descriptionLabel')}</Text>
              <Paragraph className="mt-2 p-3 bg-gray-50 rounded-lg">{selectedRepair.description}</Paragraph>
            </div>

            {/* ── Workshop notes shown to customer if present ── */}
            {!isAdmin && selectedRepair.notes && (
              <div>
                <Text strong className="flex items-center gap-2">
                  <MessageOutlined /> {t('instructor:repairs.workshopUpdate')}
                </Text>
                <Paragraph className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  {selectedRepair.notes}
                </Paragraph>
              </div>
            )}

            {/* ── Photos ── */}
            {parsePhotos(selectedRepair.photos).length > 0 && (
              <div>
                <Text strong>{t('instructor:repairs.photosLabel')}</Text>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Image.PreviewGroup>
                    {parsePhotos(selectedRepair.photos).map((photo, i) => (
                      <Image key={i} width={100} height={100} src={photo} className="object-cover rounded-lg" />
                    ))}
                  </Image.PreviewGroup>
                </div>
              </div>
            )}

            {/* ── Chat ── */}
            <Divider orientation="left">
              <MessageOutlined className="mr-2" />
              {isAdmin ? t('instructor:repairs.customerCommunication') : t('instructor:repairs.conversation')}
            </Divider>
            <RepairChat repairId={selectedRepair.id} isAdmin={isAdmin} userId={user?.id} />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default RepairsPage;
