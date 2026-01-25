/* eslint-disable complexity */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Table,
  Tag,
  Space,
  Statistic,
  Spin,
  Empty,
  Tooltip,
  Tabs,
  Badge,
  message,
} from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import accommodationApi from '@/shared/services/accommodationApi';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);

// Helper to compute booking stats
const computeBookingStats = (bookings) => {
  const today = dayjs();
  
  const activeBookings = bookings.filter((b) => {
    const checkIn = dayjs(b.check_in_date);
    const checkOut = dayjs(b.check_out_date);
    return (
      b.status !== 'cancelled' &&
      checkIn.isSameOrBefore(today, 'day') &&
      checkOut.isAfter(today, 'day')
    );
  });

  const pendingBookings = bookings.filter((b) => b.status === 'pending');
  
  const upcomingBookings = bookings.filter((b) => {
    const checkIn = dayjs(b.check_in_date);
    return b.status === 'confirmed' && checkIn.isAfter(today, 'day');
  });

  const monthStart = today.startOf('month');
  const monthEnd = today.endOf('month');
  const monthlyRevenue = bookings
    .filter((b) => {
      const checkIn = dayjs(b.check_in_date);
      return b.status !== 'cancelled' && checkIn.isBetween(monthStart, monthEnd, 'day', '[]');
    })
    .reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);

  return {
    activeCount: activeBookings.length,
    pendingCount: pendingBookings.length,
    upcomingCount: upcomingBookings.length,
    monthlyRevenue,
    activeBookings,
    pendingBookings,
    upcomingBookings,
  };
};

function AccommodationAdminPage() {
  usePageSEO({
    title: 'Stay Bookings | Calendar',
    description: 'View accommodation bookings and room status',
  });

  const { formatCurrency } = useCurrency();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Load bookings
  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await accommodationApi.getBookings({ limit: 200 });
      setBookings(data);
    } catch {
      message.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Stats
  const stats = useMemo(() => computeBookingStats(bookings), [bookings]);

  // Handle booking actions
  const handleConfirmBooking = async (bookingId) => {
    try {
      await accommodationApi.confirmBooking(bookingId);
      message.success('Booking confirmed');
      loadBookings();
    } catch {
      message.error('Failed to confirm booking');
    }
  };

  const handleCompleteBooking = async (bookingId) => {
    try {
      await accommodationApi.completeBooking(bookingId);
      message.success('Booking completed');
      loadBookings();
    } catch {
      message.error('Failed to complete booking');
    }
  };

  const handleCancelBooking = async (bookingId) => {
    try {
      await accommodationApi.cancelBooking(bookingId);
      message.success('Booking cancelled');
      loadBookings();
    } catch {
      message.error('Failed to cancel booking');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Guest',
      key: 'guest',
      width: 200,
      render: (_, record) => (
        <div>
          <div className="font-medium flex items-center gap-2">
            <UserOutlined className="text-gray-400" />
            {record.guest_name || 'Unknown'}
          </div>
          <div className="text-xs text-gray-500">{record.guest_email}</div>
        </div>
      ),
    },
    {
      title: 'Room',
      key: 'room',
      width: 180,
      render: (_, record) => (
        <div>
          <div className="font-medium flex items-center gap-2">
            <HomeOutlined className="text-orange-500" />
            {record.unit_name || `Unit #${record.unit_id}`}
          </div>
          <div className="text-xs text-gray-500">{record.unit_type}</div>
        </div>
      ),
    },
    {
      title: 'Check-in',
      dataIndex: 'check_in_date',
      width: 130,
      render: (date) => dayjs(date).format('MMM D, YYYY'),
      sorter: (a, b) => dayjs(a.check_in_date).diff(dayjs(b.check_in_date)),
    },
    {
      title: 'Check-out',
      dataIndex: 'check_out_date',
      width: 130,
      render: (date) => dayjs(date).format('MMM D, YYYY'),
    },
    {
      title: 'Nights',
      key: 'nights',
      width: 80,
      render: (_, record) => {
        const nights = dayjs(record.check_out_date).diff(dayjs(record.check_in_date), 'day');
        return <span className="text-gray-600">{nights}</span>;
      },
    },
    {
      title: 'Guests',
      dataIndex: 'guests_count',
      width: 80,
      render: (count) => (
        <span className="flex items-center gap-1">
          <TeamOutlined className="text-gray-400" />
          {count}
        </span>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'total_price',
      width: 120,
      render: (price) => (
        <span className="font-semibold text-orange-600">{formatCurrency(price, 'EUR')}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (status) => {
        const config = {
          pending: { color: 'orange', icon: <ClockCircleOutlined />, text: 'Pending' },
          confirmed: { color: 'blue', icon: <CheckCircleOutlined />, text: 'Confirmed' },
          completed: { color: 'green', icon: <CheckCircleOutlined />, text: 'Completed' },
          cancelled: { color: 'default', icon: <CloseCircleOutlined />, text: 'Cancelled' },
        };
        const c = config[status] || config.pending;
        return (
          <Tag color={c.color} className="rounded-full">
            {c.icon} {c.text}
          </Tag>
        );
      },
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Confirmed', value: 'confirmed' },
        { text: 'Completed', value: 'completed' },
        { text: 'Cancelled', value: 'cancelled' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.status === 'pending' && (
            <Tooltip title="Confirm booking">
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleConfirmBooking(record.id)}
              >
                Confirm
              </Button>
            </Tooltip>
          )}
          {record.status === 'confirmed' && (
            <Tooltip title="Mark as completed">
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleCompleteBooking(record.id)}
              >
                Complete
              </Button>
            </Tooltip>
          )}
          {(record.status === 'pending' || record.status === 'confirmed') && (
            <Tooltip title="Cancel booking">
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleCancelBooking(record.id)}
              >
                Cancel
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Filter bookings by tab
  const getFilteredBookings = () => {
    switch (activeTab) {
      case 'active':
        return stats.activeBookings;
      case 'pending':
        return stats.pendingBookings;
      case 'upcoming':
        return stats.upcomingBookings;
      case 'completed':
        return bookings.filter((b) => b.status === 'completed');
      default:
        return bookings;
    }
  };

  const filteredBookings = getFilteredBookings();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                <HomeOutlined className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-0">Stay Bookings</h1>
                <p className="text-sm text-gray-500">Accommodation reservations calendar</p>
              </div>
            </div>
            <Button icon={<SyncOutlined />} onClick={loadBookings} loading={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={12} sm={6}>
            <Card className="rounded-xl border-0 shadow-sm">
              <Statistic
                title={<span className="text-gray-600 text-sm">Active Stays</span>}
                value={stats.activeCount}
                prefix={<EnvironmentOutlined className="text-green-500" />}
                valueStyle={{ fontSize: '24px' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="rounded-xl border-0 shadow-sm">
              <Statistic
                title={<span className="text-gray-600 text-sm">Pending</span>}
                value={stats.pendingCount}
                prefix={<ClockCircleOutlined className="text-orange-500" />}
                valueStyle={{ fontSize: '24px', color: stats.pendingCount > 0 ? '#faad14' : undefined }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="rounded-xl border-0 shadow-sm">
              <Statistic
                title={<span className="text-gray-600 text-sm">Upcoming</span>}
                value={stats.upcomingCount}
                prefix={<CalendarOutlined className="text-blue-500" />}
                valueStyle={{ fontSize: '24px' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="rounded-xl border-0 shadow-sm">
              <Statistic
                title={<span className="text-gray-600 text-sm">Monthly Revenue</span>}
                value={stats.monthlyRevenue}
                prefix={<DollarOutlined className="text-orange-500" />}
                formatter={(val) => formatCurrency(val, 'EUR')}
                valueStyle={{ fontSize: '20px', color: '#fa8c16' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Bookings Table */}
        <Card className="rounded-xl shadow-sm">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'all',
                label: 'All Bookings',
                children: null,
              },
              {
                key: 'active',
                label: (
                  <span>
                    Active Stays
                    {stats.activeCount > 0 && (
                      <Badge count={stats.activeCount} className="ml-2" />
                    )}
                  </span>
                ),
                children: null,
              },
              {
                key: 'pending',
                label: (
                  <span>
                    Pending
                    {stats.pendingCount > 0 && (
                      <Badge count={stats.pendingCount} className="ml-2" />
                    )}
                  </span>
                ),
                children: null,
              },
              {
                key: 'upcoming',
                label: 'Upcoming',
                children: null,
              },
              {
                key: 'completed',
                label: 'Completed',
                children: null,
              },
            ]}
          />

          {loading ? (
            <div className="flex justify-center py-12">
              <Spin size="large" />
            </div>
          ) : filteredBookings.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No bookings found"
              className="py-12"
            />
          ) : (
            <Table
              dataSource={filteredBookings}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 20, showSizeChanger: true }}
              scroll={{ x: 1200 }}
              className="mt-4"
            />
          )}
        </Card>
      </div>
    </div>
  );
}

export default AccommodationAdminPage;
