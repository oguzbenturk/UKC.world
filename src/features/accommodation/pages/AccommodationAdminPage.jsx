
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Table,
  Tag,
  Empty,
  Tooltip,
  Tabs,
  Badge,
  Modal,
  Input,
  Skeleton,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  SyncOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import accommodationApi from '@/shared/services/accommodationApi';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);

const STATUS_CONFIG = {
  pending:   { color: 'orange', text: 'Pending' },
  confirmed: { color: 'blue',   text: 'Confirmed' },
  completed: { color: 'green',  text: 'Completed' },
  cancelled: { color: 'default', text: 'Cancelled' },
};

// Helper to compute booking stats
const computeBookingStats = (bookings) => {
  const today = dayjs();

  const activeBookings = bookings.filter((b) => {
    const checkIn = dayjs(b.check_in_date);
    const checkOut = dayjs(b.check_out_date);
    return b.status !== 'cancelled' && checkIn.isSameOrBefore(today, 'day') && checkOut.isAfter(today, 'day');
  });

  const pendingBookings = bookings.filter((b) => b.status === 'pending');

  const hotelRequests = bookings.filter((b) => {
    const cat = (b.unit_category || '').toLowerCase();
    const uType = (b.unit_type || '').toLowerCase();
    return (cat === 'hotel' || (cat === '' && uType === 'room')) && b.status === 'pending';
  });

  const upcomingBookings = bookings.filter((b) => {
    return b.status === 'confirmed' && dayjs(b.check_in_date).isAfter(today, 'day');
  });

  return {
    activeCount: activeBookings.length,
    pendingCount: pendingBookings.length,
    hotelRequestsCount: hotelRequests.length,
    upcomingCount: upcomingBookings.length,
    activeBookings,
    pendingBookings,
    hotelRequests,
    upcomingBookings,
  };
};

function AccommodationAdminPage() {
  usePageSEO({ title: 'Stay Bookings | Calendar', description: 'View accommodation bookings and room status' });

  const { formatCurrency } = useCurrency();
  const [bookings, setBookings] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchText, setSearchText] = useState('');

  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);
      const [standaloneData, packageData, unitsData] = await Promise.allSettled([
        accommodationApi.getBookings({ limit: 500 }),
        accommodationApi.getPackageStays(),
        accommodationApi.getUnits({ limit: 500 }),
      ]);
      const standalone = standaloneData.status === 'fulfilled' ? standaloneData.value : [];
      const packageStays = packageData.status === 'fulfilled' ? packageData.value : [];
      const unitsList = unitsData.status === 'fulfilled'
        ? (Array.isArray(unitsData.value) ? unitsData.value : unitsData.value?.data || [])
        : [];
      setUnits(unitsList);
      setBookings([...standalone, ...packageStays]);
    } catch {
      message.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const stats = useMemo(() => computeBookingStats(bookings), [bookings]);

  // Build a unit ID → name lookup from fetched units
  const unitMap = useMemo(() => {
    const map = {};
    units.forEach(u => { map[u.id] = u.name || u.type || 'Unit'; });
    return map;
  }, [units]);

  // Resolve unit display name: prefer record.unit_name, then lookup, then fallback
  const getUnitName = (record) => {
    if (record.unit_name) return record.unit_name;
    if (record.accommodation_unit_name) return record.accommodation_unit_name;
    if (record.unit_id && unitMap[record.unit_id]) return unitMap[record.unit_id];
    return 'Unassigned';
  };

  // Booking actions
  const handleConfirmBooking = async (bookingId) => {
    try { await accommodationApi.confirmBooking(bookingId); message.success('Booking confirmed'); loadBookings(); }
    catch { message.error('Failed to confirm booking'); }
  };
  const handleCompleteBooking = async (bookingId) => {
    try { await accommodationApi.completeBooking(bookingId); message.success('Booking completed'); loadBookings(); }
    catch { message.error('Failed to complete booking'); }
  };
  const handleCancelBooking = async (bookingId) => {
    try { await accommodationApi.cancelBooking(bookingId); message.success('Booking cancelled'); loadBookings(); }
    catch { message.error('Failed to cancel booking'); }
  };

  const [deletingIds, setDeletingIds] = useState(new Set());
  const handleDeleteBooking = (bookingId) => {
    Modal.confirm({
      title: 'Delete booking',
      content: 'Are you sure you want to permanently delete this booking?',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        if (deletingIds.has(bookingId)) return;
        setDeletingIds(prev => new Set(prev).add(bookingId));
        try {
          await accommodationApi.deleteBooking(bookingId);
          message.success('Booking deleted');
          await loadBookings();
        } catch (err) {
          const status = err?.response?.status;
          if (status === 404) message.warning('Booking not found or already deleted');
          else if (status === 403) message.error('Not authorized to delete this booking');
          else message.error('Failed to delete booking');
        } finally {
          setDeletingIds(prev => { const next = new Set(prev); next.delete(bookingId); return next; });
        }
      }
    });
  };

  // Filter bookings by tab + search
  const getFilteredBookings = () => {
    let result;
    switch (activeTab) {
      case 'active': result = stats.activeBookings; break;
      case 'pending': result = stats.pendingBookings; break;
      case 'hotel_requests': result = stats.hotelRequests; break;
      case 'upcoming': result = stats.upcomingBookings; break;
      case 'completed': result = bookings.filter((b) => b.status === 'completed'); break;
      default: result = bookings;
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(b =>
        b.guest_name?.toLowerCase().includes(q) ||
        b.guest_email?.toLowerCase().includes(q) ||
        getUnitName(b).toLowerCase().includes(q)
      );
    }
    return result;
  };
  const filteredBookings = getFilteredBookings();

  const columns = [
    {
      title: 'Guest',
      key: 'guest',
      width: 180,
      sorter: (a, b) => (a.guest_name || '').localeCompare(b.guest_name || ''),
      render: (_, record) => (
        <div>
          <div className="font-medium text-sm flex items-center gap-1.5">
            {record.guest_name || 'Unknown'}
            {record.booking_source === 'package' && (
              <Tag color="purple" bordered={false} className="rounded-full text-[10px] px-1.5 py-0 leading-4">PKG</Tag>
            )}
          </div>
          <div className="text-xs text-gray-400 truncate max-w-[160px]">{record.guest_email}</div>
          {record.package_name && (
            <div className="text-[11px] text-purple-500 truncate max-w-[160px]">{record.package_name}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Unit',
      key: 'unit',
      width: 160,
      sorter: (a, b) => getUnitName(a).localeCompare(getUnitName(b)),
      render: (_, record) => (
        <div>
          <div className="text-sm font-medium">{getUnitName(record)}</div>
          {record.unit_type && <div className="text-xs text-gray-400 capitalize">{record.unit_type}</div>}
        </div>
      ),
    },
    {
      title: 'Check-in',
      dataIndex: 'check_in_date',
      width: 100,
      sorter: (a, b) => dayjs(a.check_in_date).diff(dayjs(b.check_in_date)),
      render: (date) => <span className="text-sm">{dayjs(date).format('D MMM YY')}</span>,
    },
    {
      title: 'Check-out',
      dataIndex: 'check_out_date',
      width: 100,
      render: (date) => <span className="text-sm">{dayjs(date).format('D MMM YY')}</span>,
    },
    {
      title: 'Nights',
      key: 'nights',
      width: 70,
      align: 'center',
      sorter: (a, b) => dayjs(a.check_out_date).diff(dayjs(a.check_in_date), 'day') - dayjs(b.check_out_date).diff(dayjs(b.check_in_date), 'day'),
      render: (_, record) => dayjs(record.check_out_date).diff(dayjs(record.check_in_date), 'day'),
    },
    {
      title: 'Total',
      dataIndex: 'total_price',
      width: 100,
      sorter: (a, b) => (parseFloat(a.total_price) || 0) - (parseFloat(b.total_price) || 0),
      render: (price) => <span className="font-semibold text-orange-600">{formatCurrency(price, 'EUR')}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (status) => {
        const c = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        return <Tag color={c.color}>{c.text}</Tag>;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <div className="flex gap-1">
          {record.status === 'pending' && (
            <Tooltip title="Confirm"><Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => handleConfirmBooking(record.id)} /></Tooltip>
          )}
          {record.status === 'confirmed' && (
            <Tooltip title="Complete"><Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleCompleteBooking(record.id)} /></Tooltip>
          )}
          {(record.status === 'pending' || record.status === 'confirmed') && (
            <Tooltip title="Cancel"><Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleCancelBooking(record.id)} /></Tooltip>
          )}
          <Tooltip title="Delete">
            <Button size="small" danger loading={deletingIds.has(record.id)} disabled={deletingIds.has(record.id)} icon={<DeleteOutlined />} onClick={() => handleDeleteBooking(record.id)} />
          </Tooltip>
        </div>
      ),
    },
  ];

  if (loading) {
    return <div className="p-6"><Skeleton active /></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <Input
          placeholder="Search guests, units..."
          prefix={<SearchOutlined className="text-gray-400" />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          className="sm:max-w-xs"
          size="large"
        />
        <Button icon={<SyncOutlined />} onClick={loadBookings} loading={loading}>
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        className="mb-4"
        items={[
          { key: 'all', label: `All (${bookings.length})` },
          { key: 'active', label: <span>Active {stats.activeCount > 0 && <Badge count={stats.activeCount} className="ml-1" />}</span> },
          { key: 'pending', label: <span>Pending {stats.pendingCount > 0 && <Badge count={stats.pendingCount} className="ml-1" />}</span> },
          { key: 'hotel_requests', label: <span>Hotel {stats.hotelRequestsCount > 0 && <Badge count={stats.hotelRequestsCount} className="ml-1" style={{ backgroundColor: '#fa8c16' }} />}</span> },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'completed', label: 'Completed' },
        ]}
      />

      {/* Table */}
      <UnifiedTable density="comfortable">
        <Table
          rowKey="id"
          dataSource={filteredBookings}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} bookings` }}
          scroll={{ x: 900 }}
          size="middle"
          locale={{
            emptyText: <Empty description="No bookings found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          }}
        />
      </UnifiedTable>
    </div>
  );
}

export default AccommodationAdminPage;
