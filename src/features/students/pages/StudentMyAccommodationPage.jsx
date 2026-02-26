/**
 * StudentMyAccommodationPage — "My Stay"
 *
 * Dark-themed page for students to view their stay bookings.
 * Shows current/upcoming bookings or a prompt to browse options.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tag, Spin, Modal, message, App } from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  ExclamationCircleOutlined,
  EnvironmentOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import accommodationApi from '@/shared/services/accommodationApi';

const { confirm } = Modal;

/* ─── Status styles ─── */
const STATUS_CONFIG = {
  pending:    { color: 'orange', icon: <ClockCircleOutlined />, text: 'Pending' },
  confirmed:  { color: 'blue',   icon: <CheckCircleOutlined />, text: 'Confirmed' },
  completed:  { color: 'green',  icon: <CheckCircleOutlined />, text: 'Completed' },
  cancelled:  { color: 'red',    icon: <CloseCircleOutlined />, text: 'Cancelled' },
  checked_in: { color: 'green',  icon: <HomeOutlined />,        text: 'Checked In' },
};

/* ─── Stat pill component ─── */
const StatPill = ({ label, value, accent = 'blue' }) => {
  const colors = {
    blue:    'from-blue-500/20 to-blue-600/10 text-blue-400',
    sky:     'from-sky-500/20 to-sky-600/10 text-sky-400',
    emerald: 'from-emerald-500/20 to-emerald-600/10 text-emerald-400',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[accent]} rounded-xl px-5 py-3 text-center`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
};

// eslint-disable-next-line complexity
function StudentMyAccommodationPage() {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const { message: msg } = App.useApp();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  usePageSEO({
    title: 'My Stay | UKC Academy',
    description: 'View your stay bookings and reservations.',
  });

  /* ─── Data ─── */
  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await accommodationApi.getMyBookings();
      setBookings(data || []);
    } catch {
      msg.error('Failed to load your bookings');
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const formatPrice = (price, currency = 'EUR') => {
    if (!price) return formatCurrency(0, userCurrency);
    return formatCurrency(convertCurrency(price, currency, userCurrency), userCurrency);
  };

  /* ─── Cancel ─── */
  const handleCancelBooking = (booking) => {
    confirm({
      title: 'Cancel Booking',
      icon: <ExclamationCircleOutlined />,
      content: `Cancel your booking at ${booking.unit?.name || 'this accommodation'}?`,
      okText: 'Yes, Cancel',
      okType: 'danger',
      cancelText: 'Keep It',
      async onOk() {
        try {
          await accommodationApi.cancelBooking(booking.id);
          msg.success('Booking cancelled');
          loadBookings();
        } catch {
          msg.error('Failed to cancel booking');
        }
      },
    });
  };

  /* ─── Derived data ─── */
  const upcomingBookings = bookings.filter(
    (b) => b.status !== 'cancelled' && b.status !== 'completed' && dayjs(b.check_out_date).isAfter(dayjs()),
  );
  const pastBookings = bookings.filter(
    (b) => b.status === 'completed' || b.status === 'cancelled' || dayjs(b.check_out_date).isBefore(dayjs()),
  );

  const getDateInfo = (booking) => {
    const checkIn = dayjs(booking.check_in_date);
    const checkOut = dayjs(booking.check_out_date);
    const nights = checkOut.diff(checkIn, 'day');
    const isUpcoming = checkIn.isAfter(dayjs());
    const isCurrent = checkIn.isBefore(dayjs()) && checkOut.isAfter(dayjs());
    return { checkIn, checkOut, nights, isUpcoming, isCurrent };
  };

  /* ─── Booking card ─── */
  const renderBookingCard = (booking, isPast = false) => {
    const status = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
    const { checkIn, checkOut, nights, isUpcoming, isCurrent } = getDateInfo(booking);

    return (
      <div
        key={booking.id}
        className={`
          relative rounded-2xl border border-white/10 bg-[#1f2230] p-5
          transition-all duration-200 hover:border-white/20 hover:shadow-lg hover:shadow-black/20
          ${isCurrent ? 'ring-1 ring-emerald-500/50' : ''}
        `}
      >
        {/* Current-stay badge */}
        {isCurrent && (
          <span className="absolute -top-2.5 left-4 rounded-full bg-emerald-500 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white shadow">
            Currently Staying
          </span>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Icon */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
            <HomeOutlined className="text-2xl text-white" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h3 className="text-base font-semibold text-white truncate">
                {booking.unit?.name || `Stay #${booking.unit_id}`}
              </h3>
              <Tag color={status.color} className="!rounded-full !text-xs !border-0">
                {status.icon} {status.text}
              </Tag>
              {booking.unit?.type && (
                <Tag className="!rounded-full !text-xs !border-0 !bg-sky-500/20 !text-sky-400">
                  {booking.unit.type}
                </Tag>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400 mb-2">
              <span className="flex items-center gap-1">
                <CalendarOutlined className="text-blue-400" />
                <span className="text-gray-200 font-medium">{checkIn.format('MMM D')}</span>
                <ArrowRightOutlined className="text-[10px] text-gray-600 mx-0.5" />
                <span className="text-gray-200 font-medium">{checkOut.format('MMM D, YYYY')}</span>
              </span>
              <span className="text-gray-600">|</span>
              <span>{nights} night{nights !== 1 ? 's' : ''}</span>
              <span className="text-gray-600">|</span>
              <span className="flex items-center gap-1">
                <UserOutlined className="text-sky-500" /> {booking.guests_count} guest{booking.guests_count !== 1 ? 's' : ''}
              </span>
            </div>

            {booking.notes && (
              <p className="text-gray-500 text-xs mt-1 line-clamp-2 italic">
                {booking.notes}
              </p>
            )}
          </div>

          {/* Price & action */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:min-w-[110px]">
            <span className="text-xl font-bold text-blue-400">
              {formatPrice(booking.total_price, booking.currency)}
            </span>
            {!isPast && booking.status !== 'cancelled' && isUpcoming && (
              <button
                onClick={() => handleCancelBooking(booking)}
                className="text-xs text-red-400/80 hover:text-red-400 transition-colors underline underline-offset-2"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1118] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  /* ─── Main render ─── */
  return (
    <div className="relative min-h-screen bg-[#0d1118] overflow-hidden">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[450px] w-[450px] rounded-full bg-sky-500/5 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/20">
                <HomeOutlined className="text-lg text-white" />
              </span>
              My Stay
            </h1>
            <p className="text-gray-500 mt-1 ml-[52px]">Your bookings &amp; reservations</p>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={() => navigate('/stay/book-accommodation')}
            className="!bg-blue-500 hover:!bg-blue-600 !border-0 !rounded-xl !font-semibold !shadow-lg !shadow-blue-500/20"
          >
            Book a Stay
          </Button>
        </div>

        {bookings.length === 0 ? (
          /* ── Empty state ── */
          <div className="rounded-2xl border border-white/10 bg-[#1f2230] p-12 text-center">
            <div className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center">
              <EnvironmentOutlined className="text-4xl text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">No stays yet</h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              Browse our accommodation options and book your perfect stay!
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                type="primary"
                size="large"
                icon={<SearchOutlined />}
                onClick={() => navigate('/stay/book-accommodation')}
                className="!bg-blue-500 hover:!bg-blue-600 !border-0 !rounded-xl !font-semibold"
              >
                Browse Stays
              </Button>
              <Button
                size="large"
                onClick={() => navigate('/stay/hotel')}
                className="!bg-white/5 !text-gray-300 hover:!bg-white/10 !border-white/10 !rounded-xl"
              >
                Hotel Options
              </Button>
              <Button
                size="large"
                onClick={() => navigate('/stay/home')}
                className="!bg-white/5 !text-gray-300 hover:!bg-white/10 !border-white/10 !rounded-xl"
              >
                Home Rentals
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Stats row ── */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <StatPill label="Total" value={bookings.length} accent="blue" />
              <StatPill label="Upcoming" value={upcomingBookings.length} accent="sky" />
              <StatPill label="Past" value={pastBookings.length} accent="emerald" />
            </div>

            {/* ── Upcoming / Current ── */}
            {upcomingBookings.length > 0 && (
              <section className="mb-10">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CalendarOutlined className="text-sky-400" />
                  Upcoming &amp; Current
                </h2>
                <div className="flex flex-col gap-4">
                  {upcomingBookings.map((b) => renderBookingCard(b, false))}
                </div>
              </section>
            )}

            {/* ── Past ── */}
            {pastBookings.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CheckCircleOutlined className="text-emerald-400" />
                  Past Stays
                </h2>
                <div className="flex flex-col gap-4">
                  {pastBookings.map((b) => renderBookingCard(b, true))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default StudentMyAccommodationPage;
