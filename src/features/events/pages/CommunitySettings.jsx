import { useState, useMemo } from 'react';
import { Button, Tag, Table, Input, Popconfirm, Tooltip, Drawer, Form, InputNumber, Select, DatePicker } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CalendarOutlined,
  TeamOutlined, SearchOutlined, EnvironmentOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useData } from '@/shared/hooks/useData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { message } from '@/shared/utils/antdStatic';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

const EVENT_TYPES = [
  { value: 'party', label: 'Party / Social Event', color: 'magenta' },
  { value: 'diving', label: 'Diving Trip', color: 'blue' },
  { value: 'yoga', label: 'Yoga Session', color: 'green' },
  { value: 'workshop', label: 'Workshop', color: 'orange' },
  { value: 'competition', label: 'Competition', color: 'red' },
  { value: 'training', label: 'Group Training', color: 'cyan' },
  { value: 'excursion', label: 'Excursion / Trip', color: 'purple' },
  { value: 'other', label: 'Other', color: 'default' },
];

const getTypeColor = (type) => EVENT_TYPES.find(t => t.value === type)?.color || 'default';
const getTypeLabel = (type) => EVENT_TYPES.find(t => t.value === type)?.label || type || 'Other';

export default function CommunitySettings() {
  const { t } = useTranslation(['manager']);
  const { apiClient } = useData();
  const queryClient = useQueryClient();
  const { getCurrencySymbol } = useCurrency();
  const currencySymbol = getCurrencySymbol();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form] = Form.useForm();

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  // Fetch events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', 'list'],
    queryFn: async () => {
      if (!apiClient) return [];
      const res = await apiClient.get('/events');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!apiClient,
  });

  // Stats
  const stats = useMemo(() => {
    const active = events.filter(e => e.status === 'scheduled');
    const totalRegs = events.reduce((s, e) => s + (e.registration_count || 0), 0);
    const upcoming = events.filter(e => e.status === 'scheduled' && dayjs(e.start_at).isAfter(dayjs()));
    const totalRevenue = events.reduce((s, e) => s + ((Number(e.price) || 0) * (e.registration_count || 0)), 0);
    return { total: events.length, active: active.length, upcoming: upcoming.length, totalRegs, totalRevenue };
  }, [events]);

  // Filtered events
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

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiClient.post('/events', payload);
      return res.data;
    },
    onSuccess: () => {
      message.success(t('manager:events.messages.created'));
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      closeDrawer();
    },
    onError: () => message.error(t('manager:events.messages.createError')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await apiClient.put(`/events/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      message.success(t('manager:events.messages.updated'));
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      closeDrawer();
    },
    onError: () => message.error(t('manager:events.messages.updateError')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => apiClient.delete(`/events/${id}`),
    onSuccess: () => {
      message.success(t('manager:events.messages.deleted'));
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
    onError: () => message.error(t('manager:events.messages.deleteError')),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => apiClient.put(`/events/${id}`, { status }),
    onSuccess: () => {
      message.success(t('manager:events.messages.statusUpdated'));
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
    onError: () => message.error(t('manager:events.messages.statusError')),
  });

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

  // Table columns
  const columns = [
    {
      title: t('manager:events.columns.event'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name, record) => (
        <div>
          <div className="font-medium text-sm text-slate-800">{name}</div>
          {record.location && (
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <EnvironmentOutlined /> {record.location}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('manager:events.columns.type'),
      dataIndex: 'event_type',
      key: 'type',
      width: 140,
      render: (type) => (
        <Tag color={getTypeColor(type)} className="text-[10px]">{getTypeLabel(type)}</Tag>
      ),
    },
    {
      title: t('manager:events.columns.date'),
      dataIndex: 'start_at',
      key: 'date',
      width: 140,
      sorter: (a, b) => dayjs(a.start_at).unix() - dayjs(b.start_at).unix(),
      render: (date) => date ? (
        <span className="text-xs text-slate-600">{dayjs(date).format('MMM D, YYYY HH:mm')}</span>
      ) : <span className="text-xs text-slate-300">{t('manager:events.notSet')}</span>,
    },
    {
      title: t('manager:events.columns.capacity'),
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
      title: t('manager:events.columns.price'),
      dataIndex: 'price',
      key: 'price',
      width: 80,
      align: 'right',
      render: (price) => price && Number(price) > 0
        ? <span className="text-xs font-medium">{currencySymbol}{Number(price).toFixed(0)}</span>
        : <span className="text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">Free</span>,
    },
    {
      title: t('manager:events.columns.status'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => (
        <Tag color={status === 'scheduled' ? 'green' : 'red'} className="text-[10px]">
          {status === 'scheduled' ? t('manager:events.status.active') : t('manager:events.status.inactive')}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Tooltip title={t('manager:events.tooltips.edit')}>
            <button onClick={() => openEdit(record)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
              <EditOutlined className="text-xs" />
            </button>
          </Tooltip>
          <Tooltip title={record.status === 'scheduled' ? t('manager:events.tooltips.deactivate') : t('manager:events.tooltips.activate')}>
            <button
              onClick={() => toggleStatusMutation.mutate({ id: record.id, status: record.status === 'scheduled' ? 'cancelled' : 'scheduled' })}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${record.status === 'scheduled' ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            </button>
          </Tooltip>
          <Popconfirm title={t('manager:events.deleteConfirm')} onConfirm={() => deleteMutation.mutate(record.id)} okButtonProps={{ danger: true }}>
            <Tooltip title={t('manager:events.tooltips.delete')}>
              <button className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <DeleteOutlined className="text-xs" />
              </button>
            </Tooltip>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">{t('manager:events.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('manager:events.subtitle')}</p>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            className="h-9 rounded-lg bg-gradient-to-r from-slate-700 to-slate-800 border-0 shadow-sm text-sm"
          >
            <span className="hidden sm:inline">{t('manager:events.newEvent')}</span>
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <CalendarOutlined /> {t('manager:events.stats.total')}
            </div>
            <div className="text-xl font-bold text-slate-800">{stats.total}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {t('manager:events.stats.active')}
            </div>
            <div className="text-xl font-bold text-emerald-600">{stats.active}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <TeamOutlined /> {t('manager:events.stats.registrations')}
            </div>
            <div className="text-xl font-bold text-slate-700">{stats.totalRegs}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              {currencySymbol} {t('manager:financePages.shop.stats.totalRevenue')}
            </div>
            <div className="text-xl font-bold text-slate-700">{currencySymbol}{stats.totalRevenue.toLocaleString()}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder={t('manager:events.form.placeholders.name')}
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
            pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => t('manager:events.table.showTotal', { count: total }) }}
            locale={{
              emptyText: (
                <div className="py-10 text-center">
                  <CalendarOutlined className="text-3xl text-slate-200 mb-3" />
                  <div className="text-sm text-slate-400">{t('manager:events.table.empty')}</div>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate} className="mt-3 rounded-lg bg-slate-700 border-0">
                    {t('manager:events.table.createFirst')}
                  </Button>
                </div>
              ),
            }}
          />
        </div>
      </div>

      {/* Create/Edit Drawer */}
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
                <h2 className="text-lg font-semibold">{editingEvent ? t('manager:events.form.editTitle') : t('manager:events.form.createTitle')}</h2>
                <p className="text-xs text-white/60 mt-0.5">
                  {editingEvent ? t('manager:events.form.updateSettings') : t('manager:events.form.configureNew')}
                </p>
              </div>
              <button onClick={closeDrawer} className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors text-white">
                ✕
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
              <Form.Item
                name="name"
                label={<span className="text-xs font-medium text-slate-600">{t('manager:events.form.fields.name')}</span>}
                rules={[{ required: true, message: t('manager:events.form.validation.enterName') }]}
              >
                <Input placeholder={t('manager:events.form.placeholders.name')} className="rounded-lg" size="large" />
              </Form.Item>

              <Form.Item
                name="event_type"
                label={<span className="text-xs font-medium text-slate-600">{t('manager:events.form.fields.type')}</span>}
                rules={[{ required: true, message: t('manager:events.form.validation.selectType') }]}
              >
                <Select
                  placeholder={t('manager:events.form.placeholders.type')}
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
                  label={<span className="text-xs font-medium text-slate-600">{t('manager:events.form.fields.startAt')}</span>}
                  rules={[{ required: true, message: t('manager:events.form.validation.selectStart') }]}
                >
                  <DatePicker showTime format="YYYY-MM-DD HH:mm" className="w-full rounded-lg" size="large" placeholder={t('manager:events.form.placeholders.name')} />
                </Form.Item>
                <Form.Item
                  name="end_at"
                  label={<span className="text-xs font-medium text-slate-600">{t('manager:events.form.fields.endAt')}</span>}
                >
                  <DatePicker showTime format="YYYY-MM-DD HH:mm" className="w-full rounded-lg" size="large" placeholder={t('manager:events.form.placeholders.endAt')} />
                </Form.Item>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item
                  name="capacity"
                  label={<span className="text-xs font-medium text-slate-600">{t('manager:events.form.fields.capacity')}</span>}
                >
                  <InputNumber min={1} max={500} className="w-full rounded-lg" size="large" placeholder={t('manager:events.form.placeholders.capacity')} />
                </Form.Item>
                <Form.Item
                  name="price"
                  label={<span className="text-xs font-medium text-slate-600">{t('manager:events.form.fields.price')}</span>}
                >
                  <InputNumber min={0} className="w-full rounded-lg" size="large" placeholder={t('manager:events.form.placeholders.price')} prefix={currencySymbol} />
                </Form.Item>
              </div>

              <Form.Item
                name="location"
                label={<span className="text-xs font-medium text-slate-600">{t('manager:events.form.fields.location')}</span>}
              >
                <Input placeholder={t('manager:events.form.placeholders.location')} className="rounded-lg" size="large" prefix={<EnvironmentOutlined className="text-slate-300" />} />
              </Form.Item>

              <Form.Item
                name="description"
                label={<span className="text-xs font-medium text-slate-600">{t('manager:events.form.fields.description')}</span>}
              >
                <Input.TextArea rows={3} placeholder={t('manager:events.form.placeholders.description')} className="rounded-lg" />
              </Form.Item>
            </Form>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 px-5 py-3 bg-white flex items-center gap-3">
            <button onClick={closeDrawer} className="flex-1 py-2.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              {t('manager:events.form.cancel')}
            </button>
            <button
              onClick={() => form.submit()}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 py-2.5 text-sm text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 rounded-lg transition-all shadow-sm disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) ? t('manager:events.form.saving') : editingEvent ? t('manager:events.form.update') : t('manager:events.form.save')}
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
