import { useMemo, useState } from 'react';
import { Card, Typography, Empty, Button, Row, Col, Tag, Modal, Form, Input, DatePicker, Select, InputNumber, Upload, Table, Dropdown, Popconfirm } from 'antd';
import { CalendarOutlined, PlusOutlined, UploadOutlined, UserOutlined, MoreOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import CalendarViewSwitcher from '@/shared/components/CalendarViewSwitcher';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useData } from '@/shared/hooks/useData';
import { message } from '@/shared/utils/antdStatic';
import dayjs from 'dayjs';

const { Text } = Typography;
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

  return (
    <div className="flex flex-col h-full">
      {/* Header with View Switcher */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: View Switcher */}
          <CalendarViewSwitcher
            currentView={view}
            onViewChange={setView}
            views={['list', 'calendar']}
            size="large"
          />

          {/* Center: Title */}
          <div className="text-lg font-semibold text-slate-800">
            Events Calendar
          </div>

          {/* Right: Create Event Button */}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
            className="h-10 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 border-0 shadow-md hover:shadow-lg"
          >
            <span className="hidden sm:inline">Create Event</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Hero Section */}
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                <CalendarOutlined /> Events Calendar
              </div>
              <h1 className="text-3xl font-semibold">Events Management</h1>
              <p className="text-sm text-white/75">
                Create and manage special events: parties, diving trips, yoga sessions, workshops, and more
              </p>
            </div>
          </div>
        </div>

        {/* Event Type Tags */}
        <Card className="rounded-2xl shadow-sm">
          <div className="flex flex-wrap gap-2 mb-4">
            <Text className="text-slate-500 mr-2">Event Types:</Text>
            {eventTypes.map((type) => (
              <Tag key={type.value} color={type.color} className="cursor-pointer hover:opacity-80">
                {type.label}
              </Tag>
            ))}
          </div>
        </Card>

        {/* Content - Show Events List for Admin */}
        {hasEvents ? (
          <Card className="rounded-2xl shadow-sm">
            <div className="mb-4">
              <Typography.Title level={4}>Your Events</Typography.Title>
              <Text className="text-slate-500">Manage and monitor event registrations</Text>
            </div>
            <Row gutter={[16, 16]}>
              {events.map((event) => (
                <Col xs={24} sm={12} lg={8} key={event.id}>
                  <Card
                    className="hover:shadow-md transition-shadow"
                    title={<span className="text-sm">{event.name}</span>}
                    extra={
                      <div className="flex items-center gap-2">
                        <Tag color={event.status === 'scheduled' ? 'green' : 'red'} className="m-0">
                          {event.status === 'scheduled' ? 'Active' : 'Inactive'}
                        </Tag>
                        <Dropdown
                          menu={{
                            items: getEventActions(event).filter(item => item.key !== 'delete'),
                          }}
                          trigger={['click']}
                        >
                          <Button type="text" icon={<MoreOutlined />} size="small" />
                        </Dropdown>
                        <Popconfirm
                          title="Delete Event"
                          description="Are you sure you want to delete this event? This action cannot be undone."
                          onConfirm={() => handleDeleteEvent(event.id)}
                          okText="Yes, Delete"
                          cancelText="Cancel"
                          okButtonProps={{ danger: true }}
                        >
                          <Button type="text" icon={<DeleteOutlined />} size="small" danger />
                        </Popconfirm>
                      </div>
                    }
                  >
                    <div className="space-y-2">
                      <div className="text-sm text-slate-600">
                        <CalendarOutlined className="mr-2" />
                        {dayjs(event.start_at).format('MMM D, YYYY HH:mm')}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2 text-violet-600 font-semibold">
                          <UserOutlined />
                          <span>{event.registration_count || 0} registered</span>
                        </div>
                        {event.capacity && (
                          <Text className="text-xs text-slate-500">/ {event.capacity} max</Text>
                        )}
                      </div>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => handleViewRegistrations(event)}
                        className="p-0"
                      >
                        View Registrations →
                      </Button>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        ) : (
          <Card className="rounded-2xl shadow-sm">
            <Empty
              image={<CalendarOutlined className="text-6xl text-slate-300" />}
              description={
                <div className="space-y-2">
                  <Text className="text-slate-500">No Events Scheduled</Text>
                  <p className="text-xs text-slate-400">
                    Create your first event to start organizing parties, diving trips, yoga sessions, and more
                  </p>
                </div>
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                Create Your First Event
              </Button>
            </Empty>
          </Card>
        )}
      </div>

      {/* Create/Edit Event Modal */}
      <Modal
        title={editingEvent ? 'Edit Event' : 'Create New Event'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingEvent(null);
          form.resetFields();
          setUploadedImageUrl(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateEvent}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Event Name"
            rules={[{ required: true, message: 'Please enter event name' }]}
          >
            <Input placeholder="e.g., Beach Party, Morning Yoga, Night Dive" />
          </Form.Item>

          <Form.Item
            name="type"
            label="Event Type"
            rules={[{ required: true, message: 'Please select event type' }]}
          >
            <Select placeholder="Select event type" options={eventTypes} />
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="Date & Time"
            rules={[{ required: true, message: 'Please select date and time' }]}
          >
            <RangePicker showTime className="w-full" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="maxParticipants"
                label="Max Participants"
              >
                <InputNumber min={1} max={500} className="w-full" placeholder="Leave empty for unlimited" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="price"
                label="Price (per person)"
              >
                <InputNumber min={0} className="w-full" placeholder="0 for free events" prefix="€" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="location"
            label="Location"
          >
            <Input placeholder="e.g., Main Beach, Studio A, Dive Center" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea rows={3} placeholder="Event details, what to bring, requirements..." />
          </Form.Item>

          <Form.Item
            label="Event Image"
            extra="Upload an image to represent this event (JPEG, PNG, GIF, WebP - Max 5MB)"
          >
            <Upload
              listType="picture-card"
              maxCount={1}
              beforeUpload={handleImageUpload}
              onRemove={handleRemoveImage}
              accept="image/*"
              disabled={uploading}
            >
              {!uploadedImageUrl && (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
          </Form.Item>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={() => {
              setIsModalOpen(false);
              setEditingEvent(null);
              form.resetFields();
              setUploadedImageUrl(null);
            }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={createEventMutation.isPending || updateEventMutation.isPending}>
              {editingEvent ? 'Update Event' : 'Create Event'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Registrations Modal */}
      <Modal
        title={
          <div className="space-y-1">
            <div className="font-semibold text-lg">{selectedEvent?.name}</div>
            <div className="text-sm text-slate-500 font-normal">
              {selectedEvent?.registration_count || 0} Registered Participants
            </div>
          </div>
        }
        open={registrationsModalOpen}
        onCancel={() => setRegistrationsModalOpen(false)}
        footer={null}
        width={700}
      >
        <Table
          loading={registrationsLoading}
          dataSource={registrations}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'user_name',
              key: 'user_name',
              render: (name) => <span className="font-medium">{name}</span>,
            },
            {
              title: 'Email',
              dataIndex: 'user_email',
              key: 'user_email',
            },
            {
              title: 'Registered',
              dataIndex: 'registered_at',
              key: 'registered_at',
              render: (date) => dayjs(date).format('MMM D, YYYY HH:mm'),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (status) => (
                <Tag color={status === 'registered' ? 'green' : 'default'}>
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
