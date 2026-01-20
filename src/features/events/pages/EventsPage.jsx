import { useMemo, useState } from 'react';
import { Card, Tag, Typography, Segmented, Empty, Row, Col, Button } from 'antd';
import { CalendarOutlined, EnvironmentOutlined, UserOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useData } from '@/shared/hooks/useData';
import { message } from '@/shared/utils/antdStatic';

const { Title, Text } = Typography;

const statusColors = {
  scheduled: 'blue',
  cancelled: 'red',
  completed: 'green',
};

const typeLabels = {
  party: 'Party / Social',
  diving: 'Diving Trip',
  yoga: 'Yoga Session',
  workshop: 'Workshop',
  competition: 'Competition',
  training: 'Group Training',
  excursion: 'Excursion / Trip',
  other: 'Other',
};

const EventsPage = () => {
  const { apiClient, user } = useData();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', 'public'],
    queryFn: async () => {
      if (!apiClient) return [];
      const response = await apiClient.get('/events/public');
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!apiClient,
  });

  // Fetch registration status for each event
  const { data: registrations = {} } = useQuery({
    queryKey: ['event-registrations', user?.id],
    queryFn: async () => {
      if (!apiClient || !user?.id) return {};
      const registrationMap = {};
      
      for (const event of events) {
        try {
          const response = await apiClient.get(`/events/${event.id}/my-registration`);
          registrationMap[event.id] = response.data;
        } catch {
          registrationMap[event.id] = { registered: false };
        }
      }
      
      return registrationMap;
    },
    enabled: !!apiClient && !!user?.id && events.length > 0,
  });

  const registerMutation = useMutation({
    mutationFn: async (eventId) => {
      if (!apiClient) throw new Error('API client not ready');
      const response = await apiClient.post(`/events/${eventId}/register`);
      return { eventId, data: response.data };
    },
    onSuccess: ({ eventId }) => {
      message.success('Successfully registered for event!');
      
      // Immediately update the registrations cache to show "Registered" button
      queryClient.setQueryData(['event-registrations', user?.id], (old = {}) => ({
        ...old,
        [eventId]: { registered: true }
      }));
      
      // Invalidate queries to refresh from server
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations', user?.id] });
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.error || 'Failed to register';
      message.error(errorMsg);
    },
  });

  const unregisterMutation = useMutation({
    mutationFn: async (eventId) => {
      if (!apiClient) throw new Error('API client not ready');
      const response = await apiClient.delete(`/events/${eventId}/register`);
      return { eventId, data: response.data };
    },
    onSuccess: ({ eventId }) => {
      message.success('Registration cancelled successfully');
      
      // Immediately update the registrations cache
      queryClient.setQueryData(['event-registrations', user?.id], (old = {}) => ({
        ...old,
        [eventId]: { registered: false }
      }));
      
      // Invalidate queries to refresh from server
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations', user?.id] });
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.error || 'Failed to cancel registration';
      message.error(errorMsg);
    },
  });

  const filteredEvents = useMemo(() => {
    const now = dayjs();
    if (filter === 'upcoming') {
      return events.filter((event) => dayjs(event.start_at).isAfter(now));
    }
    if (filter === 'past') {
      return events.filter((event) => dayjs(event.start_at).isBefore(now));
    }
    return events;
  }, [events, filter]);

  const getEventTypeColor = (type) => {
    const colors = {
      party: 'magenta',
      diving: 'blue',
      yoga: 'green',
      workshop: 'orange',
      competition: 'red',
      training: 'cyan',
      excursion: 'purple',
      other: 'default',
    };
    return colors[type] || 'default';
  };

  return (
    <div className="space-y-6 p-6">
      <Card className="rounded-3xl border border-slate-200 shadow-sm" styles={{ body: { padding: 24 } }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <CalendarOutlined /> Events Overview
            </div>
            <Title level={2} className="!mb-0 text-slate-900">Scheduled Events</Title>
            <Text className="text-slate-500">
              View upcoming and past events scheduled for the center.
            </Text>
          </div>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { label: 'Upcoming', value: 'upcoming' },
              { label: 'Past', value: 'past' },
              { label: 'All', value: 'all' },
            ]}
          />
        </div>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        {filteredEvents.length === 0 && !isLoading ? (
          <Empty
            image={<CalendarOutlined className="text-6xl text-slate-300" />}
            description={
              <div className="space-y-2">
                <Text className="text-slate-500">No events found</Text>
                <p className="text-xs text-slate-400">Scheduled events will appear here.</p>
              </div>
            }
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredEvents.map((event) => (
              <Col xs={24} sm={12} lg={8} xl={6} key={event.id}>
                <Card
                  hoverable
                  className="h-full overflow-hidden rounded-xl"
                  cover={
                    event.image_url ? (
                      <div className="h-48 overflow-hidden bg-slate-50 flex items-center justify-center">
                        <img
                          alt={event.name}
                          src={event.image_url}
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="h-48 bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600 flex items-center justify-center">
                        <CalendarOutlined className="text-6xl text-white opacity-50" />
                      </div>
                    )
                  }
                >
                  <div className="space-y-3">
                    {/* Event Type Tag */}
                    <Tag color={getEventTypeColor(event.event_type)} className="text-xs">
                      {typeLabels[event.event_type] || event.event_type}
                    </Tag>

                    {/* Event Name */}
                    <h3 className="font-semibold text-lg text-slate-900 line-clamp-2">
                      {event.name}
                    </h3>

                    {/* Date & Time */}
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <ClockCircleOutlined />
                      <span>{dayjs(event.start_at).format('MMM D, YYYY HH:mm')}</span>
                    </div>

                    {/* Location */}
                    {event.location && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <EnvironmentOutlined />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}

                    {/* Capacity & Registrations */}
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      {event.capacity ? (
                        <div className="flex items-center gap-2">
                          <UserOutlined />
                          <span>
                            {event.registration_count || 0}/{event.capacity} registered
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <UserOutlined />
                          <span>{event.registration_count || 0} registered</span>
                        </div>
                      )}
                    </div>

                    {/* Price & Status */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      {event.price ? (
                        <span className="font-semibold text-violet-600">
                          €{parseFloat(event.price).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">Free</span>
                      )}
                      <Tag color={statusColors[event.status] || 'default'}>
                        {event.status}
                      </Tag>
                    </div>

                    {/* Description */}
                    {event.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-2">
                        {event.description}
                      </p>
                    )}

                    {/* Register/Unregister Button */}
                    <div className="pt-3 border-t border-slate-100">
                      {registrations[event.id]?.registered ? (
                        <Button
                          danger
                          block
                          icon={<CloseCircleOutlined />}
                          onClick={() => unregisterMutation.mutate(event.id)}
                          loading={unregisterMutation.isPending}
                        >
                          Cancel Registration
                        </Button>
                      ) : (
                        <Button
                          type="primary"
                          block
                          onClick={() => registerMutation.mutate(event.id)}
                          loading={registerMutation.isPending}
                          disabled={event.capacity && event.registration_count >= event.capacity}
                          className="bg-gradient-to-r from-violet-500 to-purple-600 border-0"
                        >
                          {event.capacity && event.registration_count >= event.capacity
                            ? 'Event Full'
                            : 'Register Now'}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>
    </div>
  );
};

export default EventsPage;
