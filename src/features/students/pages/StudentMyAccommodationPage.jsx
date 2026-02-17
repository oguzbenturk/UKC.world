/**
 * StudentMyAccommodationPage
 * 
 * Page for students to view their accommodation bookings.
 * Shows current/upcoming bookings or a button to browse accommodations.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Spin, Empty, Space, Divider, Modal, message } from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import accommodationApi from '@/shared/services/accommodationApi';

const { Title, Paragraph } = Typography;
const { confirm } = Modal;

// Status configuration
const STATUS_CONFIG = {
  pending: { color: 'orange', icon: <ClockCircleOutlined />, text: 'Pending Confirmation' },
  confirmed: { color: 'blue', icon: <CheckCircleOutlined />, text: 'Confirmed' },
  completed: { color: 'green', icon: <CheckCircleOutlined />, text: 'Completed' },
  cancelled: { color: 'red', icon: <CloseCircleOutlined />, text: 'Cancelled' },
  checked_in: { color: 'green', icon: <HomeOutlined />, text: 'Checked In' },
};

function StudentMyAccommodationPage() {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  usePageSEO({
    title: 'My Accommodation | UKC Academy',
    description: 'View your accommodation bookings and reservations.'
  });

  // Load user's bookings
  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await accommodationApi.getMyBookings();
      setBookings(data || []);
    } catch {
      message.error('Failed to load your bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const formatPrice = (price, currency = 'EUR') => {
    if (!price) return formatCurrency(0, userCurrency);
    const converted = convertCurrency(price, currency, userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  // Handle cancel booking
  const handleCancelBooking = (booking) => {
    confirm({
      title: 'Cancel Booking',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to cancel your booking at ${booking.unit?.name || 'this accommodation'}?`,
      okText: 'Yes, Cancel',
      okType: 'danger',
      cancelText: 'No, Keep It',
      async onOk() {
        try {
          await accommodationApi.cancelBooking(booking.id);
          message.success('Booking cancelled successfully');
          loadBookings();
        } catch {
          message.error('Failed to cancel booking');
        }
      },
    });
  };

  // Separate upcoming and past bookings
  const upcomingBookings = bookings.filter(b => 
    b.status !== 'cancelled' && b.status !== 'completed' && 
    dayjs(b.check_out_date).isAfter(dayjs())
  );
  const pastBookings = bookings.filter(b => 
    b.status === 'completed' || b.status === 'cancelled' ||
    dayjs(b.check_out_date).isBefore(dayjs())
  );

  // Helper to get booking date info
  const getBookingDateInfo = (booking) => {
    const checkIn = dayjs(booking.check_in_date);
    const checkOut = dayjs(booking.check_out_date);
    const nights = checkOut.diff(checkIn, 'day');
    const isUpcoming = checkIn.isAfter(dayjs());
    const isCurrent = checkIn.isBefore(dayjs()) && checkOut.isAfter(dayjs());
    return { checkIn, checkOut, nights, isUpcoming, isCurrent };
  };

  const renderBookingCard = (booking, isPast = false) => {
    const status = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
    const { checkIn, checkOut, nights, isUpcoming, isCurrent } = getBookingDateInfo(booking);
    const cardClass = isCurrent ? 'rounded-xl border-gray-200 hover:shadow-md transition-shadow mb-4 border-l-4 border-l-green-500' : 'rounded-xl border-gray-200 hover:shadow-md transition-shadow mb-4';

    return (
      <Card key={booking.id} className={cardClass}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <HomeOutlined className="text-2xl text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h3 className="text-lg font-semibold text-gray-800">
                    {booking.unit?.name || `Accommodation #${booking.unit_id}`}
                  </h3>
                  <Tag color={status.color} className="rounded-full">
                    {status.icon} {status.text}
                  </Tag>
                  {isCurrent && (
                    <Tag color="green" className="rounded-full">Currently Staying</Tag>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-2 text-gray-600 text-sm mb-2">
                  <CalendarOutlined />
                  <span className="font-medium">{checkIn.format('MMM D, YYYY')}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium">{checkOut.format('MMM D, YYYY')}</span>
                  <span className="text-gray-400">({nights} night{nights !== 1 ? 's' : ''})</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-gray-600">
                    <UserOutlined /> {booking.guests_count} guest{booking.guests_count !== 1 ? 's' : ''}
                  </span>
                  {booking.unit?.type && (
                    <Tag color="blue" className="rounded">{booking.unit.type}</Tag>
                  )}
                </div>

                {booking.notes && (
                  <p className="text-gray-500 text-sm mt-2 line-clamp-2">
                    <strong>Notes:</strong> {booking.notes}
                  </p>
                )}
              </div>
            </div>
          </Col>
          <Col xs={24} md={8} className="text-right">
            <div className="flex flex-col items-end gap-2">
              <div className="text-2xl font-bold text-orange-600">
                {formatPrice(booking.total_price, booking.currency)}
              </div>
              {!isPast && booking.status !== 'cancelled' && isUpcoming && (
                <Button 
                  danger 
                  size="small"
                  onClick={() => handleCancelBooking(booking)}
                >
                  Cancel Booking
                </Button>
              )}
            </div>
          </Col>
        </Row>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <Title level={2} className="!mb-1">
              <HomeOutlined className="mr-2" />
              My Accommodation
            </Title>
            <Paragraph className="text-gray-600 !mb-0">
              View your accommodation bookings and reservations
            </Paragraph>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={() => navigate('/stay/book-accommodation')}
            className="bg-orange-500 hover:bg-orange-600 border-none rounded-lg"
          >
            Book Accommodation
          </Button>
        </div>

        {bookings.length === 0 ? (
          <Card className="rounded-xl shadow-sm">
            <Empty 
              description={
                <div className="text-center">
                  <p className="text-gray-600 mb-2">You don't have any accommodation bookings yet</p>
                  <p className="text-gray-500 text-sm">Browse our accommodation options and book your stay!</p>
                </div>
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              className="py-12"
            >
              <Space direction="vertical" size="middle">
                <Button 
                  type="primary" 
                  size="large"
                  icon={<SearchOutlined />}
                  onClick={() => navigate('/stay/book-accommodation')}
                  className="bg-orange-500 hover:bg-orange-600 border-none"
                >
                  Browse Accommodations
                </Button>
                <div className="flex gap-2 justify-center">
                  <Button onClick={() => navigate('/stay/hotel')}>
                    View Hotel Options
                  </Button>
                  <Button onClick={() => navigate('/stay/home')}>
                    View Home Rentals
                  </Button>
                </div>
              </Space>
            </Empty>
          </Card>
        ) : (
          <>
            {/* Upcoming/Current Bookings */}
            {upcomingBookings.length > 0 && (
              <div className="mb-8">
                <Title level={4} className="mb-4 flex items-center gap-2">
                  <CalendarOutlined className="text-blue-500" />
                  Upcoming & Current Stays
                </Title>
                {upcomingBookings.map(b => renderBookingCard(b, false))}
              </div>
            )}

            {/* Past Bookings */}
            {pastBookings.length > 0 && (
              <div>
                <Title level={4} className="mb-4 flex items-center gap-2">
                  <CheckCircleOutlined className="text-green-500" />
                  Past Stays
                </Title>
                {pastBookings.map(b => renderBookingCard(b, true))}
              </div>
            )}

            {/* Stats */}
            <Divider />
            <div className="text-center text-gray-500">
              <Space size="large">
                <span>Total Bookings: {bookings.length}</span>
                <span>Upcoming: {upcomingBookings.length}</span>
                <span>Past: {pastBookings.length}</span>
              </Space>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StudentMyAccommodationPage;
