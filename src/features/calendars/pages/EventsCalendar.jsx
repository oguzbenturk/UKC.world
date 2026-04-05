import { useMemo, useState } from 'react';
import { Button, Tag, Modal, Form, Input, DatePicker, Select, InputNumber, Upload, Table, Drawer, Popconfirm, Tooltip, Empty } from 'antd';
import { CalendarOutlined, PlusOutlined, UploadOutlined, UserOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined, EnvironmentOutlined, DollarOutlined, TeamOutlined, ClockCircleOutlined, PictureOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import CalendarViewSwitcher from '@/shared/components/CalendarViewSwitcher';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useData } from '@/shared/hooks/useData';
import { message } from '@/shared/utils/antdStatic';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { RangePicker } = DatePicker;

/**
 * EventsCalendar - Manage special events like parties, diving trips, yoga sessions, etc.
 * This page allows creating, scheduling, and managing custom events
 */
const EventsCalendar = () => {
  const navigate = useNavigate();
  const { apiClient } = useData();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [registrationsModalOpen, setRegistrationsModalOpen] = useState(false);
  const [view, setView] = useState('calendar');
  const [form] = Form.useForm();
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  const eventTypes = [
    { value: 'party', label: 'Party / Social Event', color: 'magenta' },
    { value: 'diving', label: 'Diving Trip', color: 'blue' },
    { value: 'yoga', label: 'Yoga Session', color: 'green' },
    { value: 'workshop', label: 'Workshop', color: 'orange' },
    { value: 'competition', label: 'Competition', color: 'red' },
    { value: 'training', label: 'Group Training', color: 'cyan' },
    { value: 'excursion', label: 'Excursion / Trip', color: 'purple' },
    { value: 'other', label: 'Other', color: 'default' },
  ];

  const { data: events = [] } = useQuery({
    queryKey: ['events', 'list'],
    queryFn: async () => {
      if (!apiClient) return [];
      const response = await apiClient.get('/events');
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!apiClient,
  });

  const { data: registrations = [], isLoading: registrationsLoading } = useQuery({
    queryKey: ['event-registrations', selectedEvent?.id],
    queryFn: async () => {
      if (!apiClient || !selectedEvent?.id) return [];
      const response = await apiClient.get(`/events/${selectedEvent.id}/registrations`);
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!apiClient && !!selectedEvent?.id,
  });

  const handleViewRegistrations = (event) => {
    setSelectedEvent(event);
    setRegistrationsModalOpen(true);
  };

  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setUploadedImageUrl(event.image_url);
    form.setFieldsValue({
      name: event.name,
      type: event.event_type,
      dateRange: event.start_at && event.end_at ? [dayjs(event.start_at), dayjs(event.end_at)] : null,
      maxParticipants: event.capacity,
      price: event.price,
      location: event.location,
      description: event.description,
    });
    setIsModalOpen(true);
  };

  const handleToggleStatus = (event) => {
    const newStatus = event.status === 'scheduled' ? 'cancelled' : 'scheduled';
    updateEventStatusMutation.mutate({ eventId: event.id, status: newStatus });
  };

  const handleDeleteEvent = (eventId) => {
    deleteEventMutation.mutate(eventId);
  };

  const getEventActions = (event) => [
    {
      key: 'edit',
      label: 'Edit Event',
      icon: <EditOutlined />,
      onClick: () => handleEditEvent(event),
    },
    {
      key: 'toggle',
      label: event.status === 'scheduled' ? 'Deactivate' : 'Activate',
      icon: event.status === 'scheduled' ? <StopOutlined /> : <CheckCircleOutlined />,
      onClick: () => handleToggleStatus(event),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: 'Delete Event',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => {}, // Handled by Popconfirm
    },
  ];

  const createEventMutation = useMutation({
    mutationFn: async (payload) => {
      if (!apiClient) throw new Error('API client not ready');
      const response = await apiClient.post('/events', payload);
      return response.data;
    },
    onSuccess: () => {
      message.success({
        content: (
          <span>
            Event created successfully!{' '}
            <Button type="link" size="small" onClick={() => navigate('/services/events')} className="p-0 h-auto">
              View Events
            </Button>
          </span>
        ),
        duration: 5,
      });
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      setIsModalOpen(false);
      form.resetFields();
      setUploadedImageUrl(null);
      setEditingEvent(null);
    },
    onError: () => {
      message.error('Failed to create event');
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ eventId, payload }) => {
      if (!apiClient) throw new Error('API client not ready');
      const response = await apiClient.put(`/events/${eventId}`, payload);
      return response.data;
    },
    onSuccess: () => {
      message.success('Event updated successfully');
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      setIsModalOpen(false);
      form.resetFields();
      setUploadedImageUrl(null);
      setEditingEvent(null);
    },
    onError: () => {
      message.error('Failed to update event');
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId) => {
      if (!apiClient) throw new Error('API client not ready');
      await apiClient.delete(`/events/${eventId}`);
    },
    onSuccess: () => {
      message.success('Event deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.error || 'Failed to delete event';
      message.error(errorMsg);
    },
  });

  const updateEventStatusMutation = useMutation({
    mutationFn: async ({ eventId, status }) => {
      if (!apiClient) throw new Error('API client not ready');
      const response = await apiClient.put(`/events/${eventId}`, { status });
      return response.data;
    },
    onSuccess: (_, variables) => {
      const statusLabel = variables.status === 'scheduled' ? 'activated' : 'deactivated';
      message.success(`Event ${statusLabel} successfully`);
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
    onError: () => {
      message.error('Failed to update event status');
    },
  });

  const handleImageUpload = async (file) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await apiClient.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const imageUrl = response.data?.url;
      setUploadedImageUrl(imageUrl);
      message.success('Image uploaded successfully');
      return false;
    } catch (error) {
      console.error('Upload error:', error);
      message.error('Failed to upload image');
      return false;
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setUploadedImageUrl(null);
  };

  const handleCreateEvent = async (values) => {
    const [start, end] = values.dateRange || [];
    const payload = {
      name: values.name,
      event_type: values.type || null,
      start_at: start ? start.toISOString() : null,
      end_at: end ? end.toISOString() : null,
      capacity: values.maxParticipants || null,
      price: values.price || null,
      location: values.location || null,
      description: values.description || null,
      status: 'scheduled',
      image_url: uploadedImageUrl || null,
    };

    if (editingEvent) {
      // Update existing event
      updateEventMutation.mutate({ eventId: editingEvent.id, payload });
    } else {
      // Create new event
      createEventMutation.mutate(payload);
    }
  };

  const hasEvents = useMemo(() => events.length > 0, [events.length]);
  const { getCurrencySymbol } = useCurrency();
  const currencySymbol = getCurrencySymbol();

  // Group events by status
  const scheduledEvents = useMemo(() => events.filter(e => e.status === 'scheduled'), [events]);
  const cancelledEvents = useMemo(() => events.filter(e => e.status !== 'scheduled'), [events]);

  const getTypeColor = (type) => {
    const found = eventTypes.find(t => t.value === type);
    return found?.color || 'default';
  };
  const getTypeLabel = (type) => {
    const found = eventTypes.find(t => t.value === type);
    return found?.label || type || 'Event';
  };

  const isUpcoming = (event) => dayjs(event.start_at).isAfter(dayjs());
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <CalendarViewSwitcher
            currentView={view}
            onViewChange={setView}
            views={['list', 'calendar']}
            size="large"
          />
          <h1 className="text-base sm:text-lg font-semibold text-slate-800 hidden sm:block">Events</h1>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditingEvent(null); form.resetFields(); setUploadedImageUrl(null); setIsModalOpen(true); }}
            className="h-9 rounded-lg bg-gradient-to-r from-slate-700 to-slate-800 border-0 shadow-sm hover:shadow-md text-sm"
          >
            <span className="hidden sm:inline">Create Event</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Stats bar */}
        {hasEvents && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <div className="text-xl font-bold text-slate-800">{events.length}</div>
              <div className="text-xs text-slate-500">Total Events</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <div className="text-xl font-bold text-emerald-600">{scheduledEvents.length}</div>
              <div className="text-xs text-slate-500">Active</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <div className="text-xl font-bold text-slate-700">
                {events.reduce((sum, e) => sum + (e.registration_count || 0), 0)}
              </div>
              <div className="text-xs text-slate-500">Registrations</div>
            </div>
          </div>
        )}

        {/* Events Grid */}
        {hasEvents ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((event) => {
              const upcoming = isUpcoming(event);
              const isCancelled = event.status !== 'scheduled';
              const capacityPercent = event.capacity ? Math.round(((event.registration_count || 0) / event.capacity) * 100) : null;
              return (
                <div
                  key={event.id}
                  className={`bg-white rounded-xl border overflow-hidden transition-all hover:shadow-md ${isCancelled ? 'opacity-60 border-slate-200' : 'border-slate-200'}`}
                >
                  {/* Card image or gradient */}
                  {event.image_url ? (
                    <div className="h-32 bg-slate-100 relative">
                      <img src={event.image_url} alt={event.name} className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2 flex gap-1.5">
                        <Tag color={getTypeColor(event.event_type)} className="m-0 text-[10px] rounded-full px-2">
                          {getTypeLabel(event.event_type)}
                        </Tag>
                      </div>
                      <div className="absolute top-2 right-2">
                        <Tag color={isCancelled ? 'red' : upcoming ? 'green' : 'default'} className="m-0 text-[10px] rounded-full px-2">
                          {isCancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past'}
                        </Tag>
                      </div>
                    </div>
                  ) : (
                    <div className={`h-20 relative ${isCancelled ? 'bg-gradient-to-r from-slate-200 to-slate-300' : 'bg-gradient-to-r from-slate-600 to-slate-700'}`}>
                      <div className="absolute top-2 left-2 flex gap-1.5">
                        <Tag color={getTypeColor(event.event_type)} className="m-0 text-[10px] rounded-full px-2">
                          {getTypeLabel(event.event_type)}
                        </Tag>
                      </div>
                      <div className="absolute top-2 right-2">
                        <Tag color={isCancelled ? 'red' : upcoming ? 'green' : 'default'} className="m-0 text-[10px] rounded-full px-2">
                          {isCancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past'}
                        </Tag>
                      </div>
                    </div>
                  )}

                  {/* Card body */}
                  <div className="p-3.5 space-y-2.5">
                    <h3 className="font-semibold text-sm text-slate-800 truncate">{event.name}</h3>

                    <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <ClockCircleOutlined className="text-slate-400" />
                        <span>{dayjs(event.start_at).format('MMM D, YYYY · HH:mm')}</span>
                        {event.end_at && (
                          <span className="text-slate-300">– {dayjs(event.end_at).format('HH:mm')}</span>
                        )}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1.5">
                          <EnvironmentOutlined className="text-slate-400" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                    </div>

                    {/* Registration bar */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                        <TeamOutlined />
                        <span>{event.registration_count || 0}{event.capacity ? ` / ${event.capacity}` : ''}</span>
                      </div>
                      {event.price > 0 && (
                        <span className="text-emerald-600 font-semibold">{currencySymbol}{Number(event.price).toFixed(0)}</span>
                      )}
                      {(!event.price || event.price === 0 || event.price === '0' || event.price === '0.00') && (
                        <span className="text-emerald-600 font-medium text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded-full">Free</span>
                      )}
                    </div>

                    {/* Capacity progress bar */}
                    {capacityPercent !== null && (
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${capacityPercent >= 90 ? 'bg-red-400' : capacityPercent >= 60 ? 'bg-amber-400' : 'bg-slate-400'}`}
                          style={{ width: `${Math.min(capacityPercent, 100)}%` }}
                        />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100">
                      <Tooltip title="View Registrations">
                        <button
                          onClick={() => handleViewRegistrations(event)}
                          className="flex-1 flex items-center justify-center gap-1 text-[11px] text-slate-600 hover:bg-slate-50 rounded-lg py-1.5 transition-colors"
                        >
                          <EyeOutlined /> Registrations
                        </button>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <button
                          onClick={() => handleEditEvent(event)}
                          className="flex items-center justify-center w-7 h-7 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <EditOutlined className="text-xs" />
                        </button>
                      </Tooltip>
                      <Tooltip title={event.status === 'scheduled' ? 'Deactivate' : 'Activate'}>
                        <button
                          onClick={() => handleToggleStatus(event)}
                          className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                            event.status === 'scheduled'
                              ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                              : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'
                          }`}
                        >
                          {event.status === 'scheduled' ? <StopOutlined className="text-xs" /> : <CheckCircleOutlined className="text-xs" />}
                        </button>
                      </Tooltip>
                      <Popconfirm
                        title="Delete this event?"
                        description="This action cannot be undone."
                        onConfirm={() => handleDeleteEvent(event.id)}
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                      >
                        <Tooltip title="Delete">
                          <button
                            className="flex items-center justify-center w-7 h-7 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <DeleteOutlined className="text-xs" />
                          </button>
                        </Tooltip>
                      </Popconfirm>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                <CalendarOutlined className="text-2xl text-slate-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-700">No Events Yet</h3>
                <p className="text-sm text-slate-400 mt-1">Create your first event to get started</p>
              </div>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => { setEditingEvent(null); form.resetFields(); setUploadedImageUrl(null); setIsModalOpen(true); }}
                className="rounded-lg bg-gradient-to-r from-slate-700 to-slate-800 border-0"
              >
                Create Event
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Event Drawer */}
      <Drawer
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEvent(null);
          form.resetFields();
          setUploadedImageUrl(null);
        }}
        width={isMobile ? '100%' : 480}
        closable={false}
        destroyOnHidden
        styles={{ body: { padding: 0 }, header: { display: 'none' } }}
      >
        <div className="flex flex-col h-full">
          {/* Drawer header */}
          <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{editingEvent ? 'Edit Event' : 'Create Event'}</h2>
                <p className="text-xs text-white/70 mt-0.5">
                  {editingEvent ? 'Update event details' : 'Set up a new event for your community'}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingEvent(null);
                  form.resetFields();
                  setUploadedImageUrl(null);
                }}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors text-white"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleCreateEvent}
              className="space-y-0"
              requiredMark={false}
            >
              {/* Event Name */}
              <Form.Item
                name="name"
                label={<span className="text-xs font-medium text-slate-600">Event Name *</span>}
                rules={[{ required: true, message: 'Enter a name' }]}
              >
                <Input
                  placeholder="e.g., Beach Party, Morning Yoga, Night Dive"
                  className="rounded-lg"
                  size="large"
                />
              </Form.Item>

              {/* Event Type */}
              <Form.Item
                name="type"
                label={<span className="text-xs font-medium text-slate-600">Event Type *</span>}
                rules={[{ required: true, message: 'Select a type' }]}
              >
                <Select
                  placeholder="Select type..."
                  options={eventTypes}
                  className="w-full"
                  size="large"
                  optionRender={(option) => (
                    <div className="flex items-center gap-2">
                      <Tag color={option.data.color} className="m-0">{option.data.label}</Tag>
                    </div>
                  )}
                />
              </Form.Item>

              {/* Date & Time */}
              <Form.Item
                name="dateRange"
                label={<span className="text-xs font-medium text-slate-600">Date & Time *</span>}
                rules={[{ required: true, message: 'Select date and time' }]}
              >
                <RangePicker
                  showTime={{ format: 'HH:mm' }}
                  format="MMM D, YYYY HH:mm"
                  className="w-full rounded-lg"
                  size="large"
                  placeholder={['Start', 'End']}
                />
              </Form.Item>

              {/* Capacity & Price row */}
              <div className="grid grid-cols-2 gap-3">
                <Form.Item
                  name="maxParticipants"
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

              {/* Location */}
              <Form.Item
                name="location"
                label={<span className="text-xs font-medium text-slate-600">Location</span>}
              >
                <Input
                  placeholder="e.g., Main Beach, Studio A, Dive Center"
                  className="rounded-lg"
                  size="large"
                  prefix={<EnvironmentOutlined className="text-slate-300" />}
                />
              </Form.Item>

              {/* Description */}
              <Form.Item
                name="description"
                label={<span className="text-xs font-medium text-slate-600">Description</span>}
              >
                <TextArea
                  rows={3}
                  placeholder="Event details, what to bring, requirements..."
                  className="rounded-lg"
                />
              </Form.Item>

              {/* Image Upload */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-600 mb-2">Event Image</label>
                {uploadedImageUrl ? (
                  <div className="relative rounded-xl overflow-hidden h-36 border border-slate-200 group">
                    <img src={uploadedImageUrl} alt="Event" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <Upload
                    listType="picture-card"
                    maxCount={1}
                    beforeUpload={handleImageUpload}
                    onRemove={handleRemoveImage}
                    accept="image/*"
                    disabled={uploading}
                    showUploadList={false}
                    className="[&_.ant-upload]:!rounded-xl [&_.ant-upload]:!border-dashed [&_.ant-upload]:!border-slate-300 [&_.ant-upload]:!w-full [&_.ant-upload]:!h-24"
                  >
                    <div className="flex items-center gap-2 text-slate-400">
                      <PictureOutlined className="text-lg" />
                      <span className="text-xs">{uploading ? 'Uploading...' : 'Click to upload image'}</span>
                    </div>
                  </Upload>
                )}
              </div>
            </Form>
          </div>

          {/* Drawer footer */}
          <div className="border-t border-slate-200 px-5 py-3 bg-white flex items-center gap-3">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setEditingEvent(null);
                form.resetFields();
                setUploadedImageUrl(null);
              }}
              className="flex-1 py-2.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => form.submit()}
              disabled={createEventMutation.isPending || updateEventMutation.isPending}
              className="flex-1 py-2.5 text-sm text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 rounded-lg transition-all shadow-sm disabled:opacity-50"
            >
              {(createEventMutation.isPending || updateEventMutation.isPending) ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
            </button>
          </div>
        </div>
      </Drawer>

      {/* Registrations Modal */}
      <Modal
        title={
          <div className="space-y-1">
            <div className="font-semibold text-base">{selectedEvent?.name}</div>
            <div className="text-xs text-slate-500 font-normal">
              {selectedEvent?.registration_count || 0} registered participants
            </div>
          </div>
        }
        open={registrationsModalOpen}
        onCancel={() => setRegistrationsModalOpen(false)}
        footer={null}
        width={600}
      >
        <Table
          loading={registrationsLoading}
          dataSource={registrations}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'user_name',
              key: 'user_name',
              render: (name) => <span className="font-medium text-sm">{name}</span>,
            },
            {
              title: 'Email',
              dataIndex: 'user_email',
              key: 'user_email',
              ellipsis: true,
              render: (email) => <span className="text-xs text-slate-500">{email}</span>,
            },
            {
              title: 'Registered',
              dataIndex: 'registered_at',
              key: 'registered_at',
              render: (date) => <span className="text-xs">{dayjs(date).format('MMM D, YYYY HH:mm')}</span>,
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 90,
              render: (status) => (
                <Tag color={status === 'registered' ? 'green' : 'default'} className="text-[10px]">
                  {status}
                </Tag>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default EventsCalendar;
