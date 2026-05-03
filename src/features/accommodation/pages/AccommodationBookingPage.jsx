import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Empty,
  Spin,
  Tag,
  message,
} from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import accommodationApi from '@/shared/services/accommodationApi';
import { usePageSEO } from '@/shared/utils/seo';

// Customer-facing accommodation page. Originally exposed a Browse-rooms tab
// alongside My Bookings, but that flow now lives elsewhere — this route is
// reachable from the dashboard "Stay" tile and should land users straight on
// their existing bookings.
function AccommodationBookingPage() {
  usePageSEO({
    title: 'My Accommodation Bookings',
    description: 'View and manage your accommodation bookings',
  });

  const [myBookings, setMyBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  const loadMyBookings = useCallback(async () => {
    try {
      setBookingsLoading(true);
      const data = await accommodationApi.getMyBookings();
      setMyBookings(data);
    } catch {
      message.error('Failed to load your bookings');
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMyBookings();
  }, [loadMyBookings]);

  const handleCancelBooking = async (bookingId) => {
    try {
      await accommodationApi.cancelBooking(bookingId);
      message.success('Booking cancelled');
      loadMyBookings();
    } catch {
      message.error('Failed to cancel booking');
    }
  };

  const renderMyBooking = (booking) => {
    const statusConfig = {
      pending: { color: 'orange', icon: <ClockCircleOutlined />, text: 'Pending Confirmation' },
      confirmed: { color: 'blue', icon: <CheckCircleOutlined />, text: 'Confirmed' },
      completed: { color: 'green', icon: <CheckCircleOutlined />, text: 'Completed' },
      cancelled: { color: 'red', icon: <CloseCircleOutlined />, text: 'Cancelled' },
    };

    const status = statusConfig[booking.status] || statusConfig.pending;
    const checkIn = dayjs(booking.check_in_date);
    const checkOut = dayjs(booking.check_out_date);
    const nights = checkOut.diff(checkIn, 'day');

    return (
      <Card
        key={booking.id}
        className="rounded-xl border-gray-200 hover:shadow-md transition-shadow"
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <HomeOutlined className="text-2xl text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {booking.unit?.name || `Unit #${booking.unit_id}`}
                </h3>
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
                  <Tag color={status.color} className="rounded-full">
                    {status.icon} {status.text}
                  </Tag>
                </div>
                {booking.notes && (
                  <p className="text-gray-500 text-sm mt-3 p-3 bg-gray-50 rounded-lg">
                    {booking.notes}
                  </p>
                )}
              </div>
            </div>
          </Col>
          <Col xs={24} md={8} className="md:text-right flex flex-col justify-between">
            <div>
              <div className="text-3xl font-bold text-orange-600">
                ₺{parseFloat(booking.total_price).toFixed(2)}
              </div>
              <div className="text-gray-500 text-sm">Total Price</div>
            </div>
            {(booking.status === 'pending' || booking.status === 'confirmed') && (
              <Button
                danger
                size="large"
                className="mt-4 rounded-lg"
                onClick={() => handleCancelBooking(booking.id)}
              >
                Cancel Booking
              </Button>
            )}
          </Col>
        </Row>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
            <CalendarOutlined className="text-orange-500" />
            My Accommodation Bookings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Your check-ins, check-outs, and pending requests.
          </p>
        </div>

        {bookingsLoading ? (
          <div className="flex justify-center py-20">
            <Spin size="large" />
          </div>
        ) : myBookings.length === 0 ? (
          <Card className="rounded-xl shadow-sm">
            <Empty
              description="You haven't made any bookings yet"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              className="py-12"
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {myBookings.map(renderMyBooking)}
          </div>
        )}
      </div>
    </div>
  );
}

export default AccommodationBookingPage;
