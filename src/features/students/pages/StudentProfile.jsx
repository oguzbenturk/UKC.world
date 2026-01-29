import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Card,
  Col,
  Divider,
  Empty,
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CrownOutlined,
  DollarOutlined,
  ScheduleOutlined,
  ShoppingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import DataService from '@/shared/services/dataService';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import {
  ActivityMobileCard,
  BookingMobileCard,
  RentalMobileCard,
  TransactionMobileCard,
} from '@/components/ui/MobileCardRenderers';

const { Text } = Typography;

const statusMap = {
  active: { color: 'green', label: 'Active' },
  completed: { color: 'green', label: 'Completed' },
  returned: { color: 'green', label: 'Returned' },
  cancelled: { color: 'red', label: 'Cancelled' },
};

const getStatusTag = (status) => {
  if (!status) return <Tag>Unknown</Tag>;
  const key = String(status).toLowerCase();
  const meta = statusMap[key];
  if (!meta) return <Tag>{status}</Tag>;
  return <Tag color={meta.color}>{meta.label}</Tag>;
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateOnly = (value) => {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'N/A';
};

const formatDateTime = (value) => {
  const date = toDate(value);
  return date
    ? date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A';
};

const getBookingDateTime = (record) => {
  if (!record) return null;
  const dateStr = record.date || record.formatted_date;
  const timeStr = record.startTime || record.start_time || null;
  if (!dateStr) return null;
  const baseDate = toDate(dateStr);
  if (!baseDate) return null;
  if (!timeStr || typeof timeStr !== 'string') return baseDate;
  const [hours, minutes] = timeStr.split(':').map((n) => Number.parseInt(n, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return baseDate;
  const withTime = new Date(baseDate);
  withTime.setHours(hours, minutes, 0, 0);
  return withTime;
};

const renderPaymentTag = (record) => {
  const label =
    record.payment_method_display ||
    record.paymentMethod ||
    record.payment_method ||
    (record.isPackagePayment ? 'Package Hours' : null);
  if (!label) return <Tag color="default">N/A</Tag>;
  const normalized = String(label).toLowerCase();
  if (normalized.includes('package')) return <Tag color="blue">{label}</Tag>;
  // Pay-and-go: removed 'unpaid' check - all payments are considered paid
  if (normalized.includes('balance') || normalized.includes('credit') || normalized.startsWith('€-')) {
    return <Tag color="orange">{label}</Tag>;
  }
  return <Tag color="green">{label}</Tag>;
};

const buildActivityRows = (bookings = [], rentals = []) => {
  const bookingRows = bookings.map((booking) => {
    const dt = getBookingDateTime(booking);
    const price = booking.final_amount ?? booking.amount ?? booking.total_price ?? 0;
    return {
      id: `booking-${booking.id}`,
      type: 'lesson',
      date: dt ? dt.toISOString() : booking.date,
      description: `${booking.booking_type || 'Lesson'}`,
      status: booking.status,
      total_price: price,
      currency: booking.currency,
      reference: booking,
    };
  });

  const rentalRows = rentals.map((rental) => ({
    id: `rental-${rental.id}`,
    type: 'rental',
    date: rental.rental_date || rental.start_date || rental.created_at,
    description: `${rental.equipment_name || 'Equipment'} Rental`,
    status: rental.status,
    total_price: rental.total_price ?? rental.cost ?? rental.amount ?? 0,
    currency: rental.currency,
    reference: rental,
  }));

  return [...bookingRows, ...rentalRows].sort((a, b) => {
    const aDate = toDate(a.date);
    const bDate = toDate(b.date);
    return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
  });
};

const buildProfileFields = (student = {}) => [
  { label: 'Email', value: student.email || 'Not provided' },
  { label: 'Phone', value: student.phone || 'Not provided' },
  { label: 'Preferred Language', value: student.language ? student.language.toUpperCase() : 'Not set' },
  { label: 'Customer Since', value: student.createdAt ? formatDateOnly(student.createdAt) : 'Unknown' },
];

const buildAccountHighlights = (account = {}, formatCurrency, currency, storageCurrency, convertCurrency) => {
  const showDual = currency !== storageCurrency && convertCurrency;
  const formatDual = (amount) => {
    if (!showDual) return formatCurrency(amount, currency);
    const converted = convertCurrency(amount, storageCurrency, currency);
    return `${formatCurrency(amount, storageCurrency)} / ${formatCurrency(converted, currency)}`;
  };
  return [
    {
      label: 'Current Balance',
      value: formatDual(account.balance || 0),
      valueClass: (account.balance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      label: 'Lifetime Value',
      value: formatDual(account.totalSpent || account.lifetimeValue || 0),
      valueClass: 'text-blue-600',
    },
    {
      label: 'Last Payment',
      value: account.lastPaymentAt ? formatDateOnly(account.lastPaymentAt) : 'No payments yet',
      valueClass: 'text-gray-800',
    },
  ];
};

const buildStatCards = (stats = {}) => [
  { label: 'Hours Attended', value: `${(stats.hoursAttended ?? 0).toFixed(1)} h`, valueClass: 'text-emerald-600' },
  { label: 'Attendance Rate', value: `${stats.attendanceRate ?? 0}%`, valueClass: 'text-indigo-600' },
  { label: 'Total Lessons', value: stats.totalLessons ?? 0, valueClass: 'text-indigo-600' },
  { label: 'Total Rentals', value: stats.totalRentals ?? 0, valueClass: 'text-amber-600' },
];

const useStudentTables = (displayCurrency, formatCurrency, storageCurrency, convertCurrency) => {
  const showDualCurrency = displayCurrency !== storageCurrency && convertCurrency;
  
  const formatDualPrice = useMemo(() => (value, baseCurrency = storageCurrency) => {
    if (!showDualCurrency) return formatCurrency(value, displayCurrency);
    const converted = convertCurrency(value, baseCurrency, displayCurrency);
    return `${formatCurrency(value, baseCurrency)} / ${formatCurrency(converted, displayCurrency)}`;
  }, [showDualCurrency, formatCurrency, storageCurrency, displayCurrency, convertCurrency]);

  const bookingColumns = useMemo(
    () => [
      {
        title: 'Date & Time',
        key: 'datetime',
        render: (_, record) => {
          const dt = getBookingDateTime(record);
          if (!dt) return formatDateOnly(record.date);
          const dateStr = dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          return (
            <span>
              {dateStr}
              <br />
              <span className="text-xs text-gray-500">{timeStr}</span>
            </span>
          );
        },
        sorter: (a, b) => {
          const dtA = getBookingDateTime(a);
          const dtB = getBookingDateTime(b);
          return (dtA?.getTime() || 0) - (dtB?.getTime() || 0);
        },
      },
      {
        title: 'Service',
        dataIndex: 'service_name',
        key: 'service_name',
        render: (value, record) => value || record.serviceName || record.service_name || 'Lesson',
      },
      {
        title: 'Instructor',
        dataIndex: 'instructor_name',
        key: 'instructor',
        render: (value, record) => value || record.instructorName || 'Not assigned',
      },
      {
        title: 'Duration',
        dataIndex: 'duration',
        key: 'duration',
        render: (value) => {
          const duration = Number.parseFloat(value ?? 0);
          if (!Number.isFinite(duration) || duration <= 0) return 'N/A';
          return `${duration} ${duration === 1 ? 'hour' : 'hours'}`;
        },
      },
      {
        title: 'Price',
        dataIndex: 'total_price',
        key: 'total_price',
        render: (value, record) => {
          const price = Number(value || record.totalPrice || record.price || record.final_amount || record.amount || 0);
          if (!Number.isFinite(price)) return 'N/A';
          const baseCurrency = record.currency || storageCurrency;
          return formatDualPrice(price, baseCurrency);
        },
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status) => getStatusTag(status),
      },
      {
        title: 'Payment',
        key: 'payment',
        render: (_, record) => renderPaymentTag(record),
      },
    ],
    [formatDualPrice, storageCurrency],
  );

  const rentalColumns = useMemo(
    () => [
      {
        title: 'Equipment',
        dataIndex: 'equipment',
        key: 'equipment',
        render: (equipment, record) => {
          if (Array.isArray(equipment) && equipment.length > 0) {
            return equipment.length === 1 ? equipment[0].name : `${equipment.length} items`;
          }
          if (Array.isArray(record.equipment_names) && record.equipment_names.length > 0) {
            return record.equipment_names.length === 1 ? record.equipment_names[0] : `${record.equipment_names.length} items`;
          }
          if (record.equipment_name) return record.equipment_name;
          return 'Equipment';
        },
      },
      {
        title: 'Rental Date',
        dataIndex: 'rental_date',
        key: 'rental_date',
        render: (value, record) => formatDateTime(value || record.start_date || record.created_at),
        sorter: (a, b) => {
          const dateA = toDate(a.rental_date || a.start_date || a.created_at);
          const dateB = toDate(b.rental_date || b.start_date || b.created_at);
          return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
        },
      },
      {
        title: 'Duration',
        dataIndex: 'duration_hours',
        key: 'duration_hours',
        render: (value, record) => {
          if (Number.isFinite(value) && value > 0) return `${Math.round(value)}h`;
          if (record.duration) return record.duration;
          return 'N/A';
        },
      },
      {
        title: 'Price',
        dataIndex: 'total_price',
        key: 'total_price',
        render: (value) => (Number.isFinite(Number(value)) ? formatDualPrice(Number(value)) : 'N/A'),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status) => getStatusTag(status),
      },
    ],
    [displayCurrency, formatCurrency],
  );

  const financialColumns = useMemo(
    () => [
      {
        title: 'Date',
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value) => formatDateTime(value),
        sorter: (a, b) => {
          const dateA = toDate(a.createdAt);
          const dateB = toDate(b.createdAt);
          return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
        },
      },
      {
        title: 'Amount',
        dataIndex: 'amount',
        key: 'amount',
        render: (value, record) => {
          const baseCurrency = record.currency || storageCurrency;
          const amount = Number(value || 0);
          
          // For completed transactions, show historical amount (what was actually paid)
          // Don't convert with current exchange rates
          const status = String(record.status || '').toLowerCase();
          const isCompleted = ['completed', 'succeeded', 'paid'].includes(status);
          
          if (isCompleted) {
            return formatCurrency(amount, baseCurrency);
          }
          
          // For pending transactions, show dual currency
          return formatDualPrice(amount, baseCurrency);
        },
        sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status) => {
          const lower = String(status || '').toLowerCase();
          const color = lower === 'succeeded' || lower === 'completed' ? 'green' : lower === 'pending' ? 'orange' : 'default';
          return <Tag color={color}>{status ? status.toUpperCase() : 'N/A'}</Tag>;
        },
      },
      {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        render: (value) => value || 'Payment',
      },
    ],
    [displayCurrency, formatCurrency],
  );

  const membershipColumns = useMemo(
    () => [
      {
        title: 'Purchased',
        dataIndex: 'purchased_at',
        key: 'purchased_at',
        render: (value) => formatDateTime(value),
        sorter: (a, b) => {
          const dateA = toDate(a.purchased_at);
          const dateB = toDate(b.purchased_at);
          return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
        },
      },
      {
        title: 'Membership',
        key: 'offering',
        render: (_, record) => (
          <div>
            <div style={{ fontWeight: 500 }}>{record.offering_name || record.current_offering_name}</div>
            {record.icon && <span style={{ fontSize: '12px' }}>{record.icon} </span>}
          </div>
        ),
      },
      {
        title: 'Price',
        dataIndex: 'offering_price',
        key: 'offering_price',
        render: (value, record) => {
          const baseCurrency = record.offering_currency || storageCurrency;
          return formatDualPrice(Number(value || 0), baseCurrency);
        },
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status) => {
          const lower = String(status || '').toLowerCase();
          const color = lower === 'active' ? 'green' : lower === 'expired' ? 'orange' : 'default';
          return <Tag color={color}>{status ? status.toUpperCase() : 'N/A'}</Tag>;
        },
      },
      {
        title: 'Expires',
        dataIndex: 'expires_at',
        key: 'expires_at',
        render: (value) => value ? formatDateOnly(value) : 'No expiry',
      },
    ],
    [displayCurrency, formatCurrency, storageCurrency, formatDualPrice],
  );

  const shopColumns = useMemo(
    () => [
      {
        title: 'Date',
        dataIndex: 'created_at',
        key: 'date',
        render: (val) => formatDateTime(val),
        sorter: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      },
      {
        title: 'Item',
        dataIndex: 'metadata',
        key: 'item',
        render: (metadata, record) => metadata?.product_name || record.description || 'Product',
      },
      {
        title: 'Quantity',
        dataIndex: 'metadata',
        key: 'quantity',
        render: (metadata) => metadata?.quantity || 1,
      },
      {
        title: 'Price',
        dataIndex: 'amount',
        key: 'amount',
        render: (val, record) => {
          const price = Math.abs(Number(val || 0));
          return formatDualPrice(price, record.currency || storageCurrency);
        },
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status) => (
          <Tag color={status === 'completed' ? 'green' : 'orange'}>
            {status ? status.toUpperCase() : 'UNKNOWN'}
          </Tag>
        ),
      },
    ],
    [formatDualPrice, storageCurrency],
  );

  const eventColumns = useMemo(
    () => [
      {
        title: 'Event',
        dataIndex: 'title',
        key: 'title',
        render: (value) => value || 'Event',
      },
      {
        title: 'Date',
        dataIndex: 'start_at',
        key: 'start_at',
        render: (value) => formatDateTime(value),
        sorter: (a, b) => {
          const dateA = toDate(a.start_at);
          const dateB = toDate(b.start_at);
          return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
        },
      },
      {
        title: 'Location',
        dataIndex: 'location',
        key: 'location',
        render: (value) => value || 'TBA',
      },
      {
        title: 'Price',
        dataIndex: 'price',
        key: 'price',
        render: (value, record) => {
          const price = Number(value || 0);
          if (price === 0) return <Tag color="green">Free</Tag>;
          const baseCurrency = record.currency || storageCurrency;
          return formatDualPrice(price, baseCurrency);
        },
      },
      {
        title: 'Registration',
        dataIndex: 'status',
        key: 'status',
        render: (status) => {
          const lower = String(status || '').toLowerCase();
          const color = lower === 'registered' ? 'green' : lower === 'cancelled' ? 'red' : 'default';
          return <Tag color={color}>{status ? status.toUpperCase() : 'N/A'}</Tag>;
        },
      },
    ],
    [formatDualPrice, storageCurrency],
  );

  return { bookingColumns, rentalColumns, financialColumns, membershipColumns, shopColumns, eventColumns, formatDualPrice };
};

const useStudentActivity = (studentId) => {
  const [bookings, setBookings] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [shopHistory, setShopHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!studentId) {
      setBookings([]);
      setRentals([]);
      setMemberships([]);
      setShopHistory([]);
      setEvents([]);
      setLoading(false);
      setError(null);
      return () => {};
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [lessonData, rentalData, membershipData, shopData, eventData] = await Promise.all([
          DataService.getLessonsByUserId(studentId),
          DataService.getRentalsByUserId(studentId).catch(() => []),
          apiClient.get('/member-offerings/my-purchases').then((res) => res.data).catch(() => []),
          apiClient.get(`/students/${studentId}/shop-history`).then((res) => res.data).catch(() => []),
          apiClient.get('/events/my-events').then((res) => res.data).catch(() => []),
        ]);

        if (!cancelled) {
          setBookings(Array.isArray(lessonData) ? lessonData : []);
          setRentals(Array.isArray(rentalData) ? rentalData : []);
          setMemberships(Array.isArray(membershipData) ? membershipData : []);
          setShopHistory(Array.isArray(shopData) ? shopData : []);
          setEvents(Array.isArray(eventData) ? eventData : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load profile details.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return { bookings, rentals, memberships, shopHistory, events, loading, error };
};

const ProfileInfoCard = ({ student, stats, account, formatCurrency, displayCurrency, storageCurrency, convertCurrency }) => {
  const profileFields = useMemo(() => buildProfileFields(student), [student]);
  const accountHighlights = useMemo(
    () => buildAccountHighlights(account, formatCurrency, displayCurrency, storageCurrency, convertCurrency),
    [account, displayCurrency, formatCurrency, storageCurrency, convertCurrency],
  );
  const statCards = useMemo(() => buildStatCards(stats), [stats]);

  return (
    <Card variant="outlined" className="h-full rounded-3xl border border-slate-200/80 shadow-sm">
      <div className="flex flex-col items-center mb-4">
        <Avatar size={80} src={student.avatar || student.profile_image_url} icon={<UserOutlined />} className="mb-2" />
        <div className="text-base font-semibold text-gray-900 text-center">
          {student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim()}
        </div>
        <Tag color="blue" className="mt-1">
          {student.level ? student.level.toUpperCase() : 'STUDENT'}
        </Tag>
      </div>

      <div className="space-y-3 mt-4">
        {profileFields.map(({ label, value }) => (
          <div key={label}>
            <Text type="secondary">{label}</Text>
            <p>{value}</p>
          </div>
        ))}

        <Divider className="my-3" />

        <div className="grid grid-cols-1 gap-3">
          {accountHighlights.map(({ label, value, valueClass }) => (
            <div key={label} className="bg-white p-4 rounded-lg shadow-sm border">
              <Text type="secondary">{label}</Text>
              <p className={`text-xl font-semibold ${valueClass}`}>{value}</p>
            </div>
          ))}
        </div>

        <Divider className="my-3" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {statCards.map(({ label, value, valueClass }) => (
            <div key={label} className="bg-white p-4 rounded-lg shadow-sm border">
              <Text type="secondary">{label}</Text>
              <p className={`text-xl font-semibold ${valueClass}`}>{value}</p>
            </div>
          ))}
        </div>

        {student.notes && (
          <div>
            <Text type="secondary">Notes</Text>
            <p>{student.notes}</p>
          </div>
        )}
      </div>
    </Card>
  );
};

const PackagesCard = ({ packages }) => {
  // Debug: Log packages to see what data we're receiving
  console.log('PackagesCard packages:', packages);
  if (packages && packages.length > 0) {
    console.log('First package full object:', JSON.stringify(packages[0], null, 2));
  }
  
  return (
    <Card variant="outlined" className="rounded-3xl border border-slate-200/80 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Package Summary</h3>
        <Tag color="cyan">View only</Tag>
      </div>
      {packages.length > 0 ? (
        <div className="space-y-3">
          {packages.map((pkg) => {
            console.log('Rendering package:', pkg.name, {
              includesRental: pkg.includesRental,
              rentalDaysTotal: pkg.rentalDaysTotal,
              includesAccommodation: pkg.includesAccommodation,
              accommodationNightsTotal: pkg.accommodationNightsTotal
            });
            
            const utilisation = pkg.utilisation ?? (pkg.totalHours > 0
              ? Math.round(((pkg.usedHours || 0) / pkg.totalHours) * 100)
              : 0);
            
            // Determine what the package includes
            const includesLessons = pkg.includesLessons !== false && (pkg.totalHours || 0) > 0;
            const includesRental = pkg.includesRental && (pkg.rentalDaysTotal || 0) > 0;
            const includesAccommodation = pkg.includesAccommodation && (pkg.accommodationNightsTotal || 0) > 0;
            
            return (
              <div
                key={pkg.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{pkg.name}</div>
                  <div className="text-sm text-gray-500">
                    {pkg.lessonType || 'General package'}
                    {includesRental && ' + Rental'}
                    {includesAccommodation && ' + Accommodation'}
                  </div>
                </div>
                <Space size="small">
                  <Tag color={pkg.status === 'active' ? 'green' : pkg.status === 'used_up' ? 'red' : 'blue'}>
                    {pkg.status ? pkg.status.replace('_', ' ').toUpperCase() : 'ACTIVE'}
                  </Tag>
                  {pkg.expiresAt && (
                    <Tag color={pkg.expiryWarning ? 'red' : 'default'}>
                      Expires {formatDateOnly(pkg.expiresAt)}
                    </Tag>
                  )}
                </Space>
              </div>
              
              {/* Lesson Hours Section */}
              {includesLessons && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm border-t border-slate-100 pt-3">
                  <div>
                    <Text type="secondary">🎓 Total Hours</Text>
                    <p className="font-medium">{(pkg.totalHours ?? 0).toFixed(1)}</p>
                  </div>
                  <div>
                    <Text type="secondary">Used</Text>
                    <p className="font-medium">{(pkg.usedHours ?? 0).toFixed(1)}</p>
                  </div>
                  <div>
                    <Text type="secondary">Remaining</Text>
                    <p className="font-medium text-blue-600">{(pkg.remainingHours ?? 0).toFixed(1)}</p>
                  </div>
                  <div>
                    <Text type="secondary">Utilisation</Text>
                    <p className="font-medium">{utilisation}%</p>
                  </div>
                </div>
              )}
              
              {/* Rental Days Section */}
              {includesRental && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm border-t border-slate-100 pt-3">
                  <div>
                    <Text type="secondary">🏄 Total Days</Text>
                    <p className="font-medium">{(pkg.rentalDaysTotal ?? 0).toFixed(0)}</p>
                  </div>
                  <div>
                    <Text type="secondary">Used</Text>
                    <p className="font-medium">{(pkg.rentalDaysUsed ?? 0).toFixed(0)}</p>
                  </div>
                  <div>
                    <Text type="secondary">Remaining</Text>
                    <p className="font-medium text-green-600">{(pkg.rentalDaysRemaining ?? 0).toFixed(0)}</p>
                  </div>
                  {pkg.rentalServiceName && (
                    <div>
                      <Text type="secondary">Equipment</Text>
                      <p className="font-medium text-xs">{pkg.rentalServiceName}</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Accommodation Nights Section */}
              {includesAccommodation && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm border-t border-slate-100 pt-3">
                  <div>
                    <Text type="secondary">🏨 Total Nights</Text>
                    <p className="font-medium">{pkg.accommodationNightsTotal ?? 0}</p>
                  </div>
                  <div>
                    <Text type="secondary">Used</Text>
                    <p className="font-medium">{pkg.accommodationNightsUsed ?? 0}</p>
                  </div>
                  <div>
                    <Text type="secondary">Remaining</Text>
                    <p className="font-medium text-orange-600">{pkg.accommodationNightsRemaining ?? 0}</p>
                  </div>
                  {pkg.accommodationUnitName && (
                    <div>
                      <Text type="secondary">Unit</Text>
                      <p className="font-medium text-xs">{pkg.accommodationUnitName}</p>
                    </div>
                  )}
                </div>
              )}
              </div>
            );
          })}
        </div>
      ) : (
        <Empty description="No packages assigned" />
      )}
    </Card>
  );
};

const UpcomingLessonsCard = ({ sessions }) => (
  <Card variant="outlined" className="rounded-3xl border border-slate-200/80 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-semibold">Upcoming Lessons</h3>
      <Tag color="cyan">View only</Tag>
    </div>
    {sessions.length > 0 ? (
      <div className="space-y-3">
        {sessions.map((session) => {
          const start = toDate(session.startTime);
          const serviceName = session.service?.name || 'Lesson';
          const instructorName = session.instructor?.name || 'Instructor';
          return (
            <div
              key={session.bookingId}
              className="rounded-xl border border-sky-100 bg-sky-50 p-4 shadow-sm"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium text-gray-900">{serviceName}</div>
                  <div className="text-sm text-gray-600">
                    {start ? formatDateTime(start) : 'Scheduled'}
                  </div>
                  <div className="text-xs text-gray-500">Instructor: {instructorName}</div>
                </div>
                <div className="text-right">{getStatusTag(session.status)}</div>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <Empty description="No upcoming lessons" />
    )}
  </Card>
);

const HistorySection = ({
  activityRows,
  bookings,
  rentals,
  memberships,
  shopHistory,
  events,
  transactions,
  bookingColumns,
  rentalColumns,
  shopColumns,
  membershipColumns,
  eventColumns,
  financialColumns,
  formatDualPrice,
  storageCurrency,
}) => (
  <Card variant="outlined" className="rounded-3xl border border-slate-200/80 shadow-sm">
    <Tabs
      defaultActiveKey="total"
      items={[
        {
          key: 'total',
          label: (
            <span>
              <ClockCircleOutlined /> Total History
            </span>
          ),
          children:
            activityRows.length > 0 ? (
              <UnifiedResponsiveTable
                title="All Activity"
                density="comfortable"
                columns={[
                  {
                    title: 'Date',
                    dataIndex: 'date',
                    key: 'date',
                    render: (value) => formatDateOnly(value),
                    sorter: (a, b) => {
                      const dateA = toDate(a.date);
                      const dateB = toDate(b.date);
                      return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
                    },
                  },
                  {
                    title: 'Type',
                    dataIndex: 'type',
                    key: 'type',
                    render: (type) => (
                      <Tag color={type === 'lesson' ? 'blue' : 'orange'}>{type.toUpperCase()}</Tag>
                    ),
                  },
                  {
                    title: 'Description',
                    dataIndex: 'description',
                    key: 'description',
                  },
                  {
                    title: 'Price',
                    dataIndex: 'price',
                    key: 'price',
                    render: (value, record) => {
                      const price = Number(value || record.total_price || record.totalPrice || 0);
                      if (!Number.isFinite(price)) return 'N/A';
                      const baseCurrency = record.currency || storageCurrency;
                      return formatDualPrice(price, baseCurrency);
                    },
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (status) => getStatusTag(status),
                  },
                ]}
                dataSource={activityRows}
                mobileCardRenderer={ActivityMobileCard}
                rowKey="id"
                pagination={{ pageSize: 5 }}
              />
            ) : (
              <Empty description="No activity history" />
            ),
        },
        {
          key: 'lessons',
          label: (
            <span>
              <CalendarOutlined /> Lesson History
            </span>
          ),
          children:
            bookings.length > 0 ? (
              <UnifiedResponsiveTable
                title="Lesson History"
                density="comfortable"
                columns={bookingColumns}
                dataSource={bookings}
                mobileCardRenderer={BookingMobileCard}
                rowKey="id"
                pagination={{ pageSize: 5 }}
              />
            ) : (
              <Empty description="No lesson history" />
            ),
        },
        {
          key: 'rentals',
          label: (
            <span>
              <ShoppingOutlined /> Rental History
            </span>
          ),
          children:
            rentals.length > 0 ? (
              <UnifiedResponsiveTable
                title="Rental History"
                density="comfortable"
                columns={rentalColumns}
                dataSource={rentals}
                mobileCardRenderer={RentalMobileCard}
                rowKey="id"
                pagination={{ pageSize: 5 }}
              />
            ) : (
              <Empty description="No rental history" />
            ),
        },
        {
          key: 'shop',
          label: (
            <span>
              <ShoppingOutlined /> Shop History
            </span>
          ),
          children:
            shopHistory && shopHistory.length > 0 ? (
              <UnifiedResponsiveTable
                title="Shop Purchases"
                density="comfortable"
                columns={shopColumns}
                dataSource={shopHistory}
                mobileCardRenderer={TransactionMobileCard}
                rowKey="id"
                pagination={{ pageSize: 5 }}
              />
            ) : (
              <Empty description="No shop purchases" />
            ),
        },
        {
          key: 'memberships',
          label: (
            <span>
              <CrownOutlined /> Membership History
            </span>
          ),
          children:
            memberships.length > 0 ? (
              <UnifiedResponsiveTable
                title="Membership Purchases"
                density="comfortable"
                columns={membershipColumns}
                dataSource={memberships}
                mobileCardRenderer={TransactionMobileCard}
                rowKey="id"
                pagination={{ pageSize: 5 }}
              />
            ) : (
              <Empty description="No membership purchases" />
            ),
        },
        {
          key: 'events',
          label: (
            <span>
              <ScheduleOutlined /> Event History
            </span>
          ),
          children:
            events && events.length > 0 ? (
              <UnifiedResponsiveTable
                title="Event Registrations"
                density="comfortable"
                columns={eventColumns}
                dataSource={events}
                mobileCardRenderer={TransactionMobileCard}
                rowKey="id"
                pagination={{ pageSize: 5 }}
              />
            ) : (
              <Empty description="No event registrations" />
            ),
        },
        {
          key: 'financial',
          label: (
            <span>
              <DollarOutlined /> Financial History
            </span>
          ),
          children:
            transactions.length > 0 ? (
              <UnifiedResponsiveTable
                title="Financial History"
                density="comfortable"
                columns={financialColumns}
                dataSource={transactions}
                mobileCardRenderer={TransactionMobileCard}
                rowKey="id"
                pagination={{ pageSize: 10 }}
              />
            ) : (
              <Empty description="No payments recorded" />
            ),
        },
      ]}
    />
  </Card>
);

const parseNumericAmount = (value) => {
  const parsedAmount = Number.parseFloat(`${value ?? 0}`);
  return Number.isFinite(parsedAmount) ? parsedAmount : 0;
};

const buildServiceDescription = (type, serviceName) => {
  if (!serviceName) return null;
  if (type === 'refund') return `Refund for ${serviceName}`;
  if (type === 'charge') return `Charge for ${serviceName}`;
  return `Payment for ${serviceName}`;
};

const buildGenericDescription = (type) => {
  if (type === 'refund') return 'Refund';
  if (type === 'charge') return 'Charge';
  if (type === 'pending') return 'Pending payment';
  return 'Payment';
};

const resolvePaymentType = (payment, amount) => payment?.type || (amount >= 0 ? 'credit' : 'charge');

const resolvePaymentStatus = (payment, type) => payment?.status || (type === 'pending' ? 'pending' : 'completed');

const resolvePaymentDescription = (payment, type, serviceName) => {
  if (payment?.description) return payment.description;
  return buildServiceDescription(type, serviceName) || buildGenericDescription(type);
};

const StudentProfileContent = ({
  student,
  stats,
  account,
  formatCurrency,
  displayCurrency,
  storageCurrency,
  convertCurrency,
  packages,
  upcomingSessions,
  activityRows,
  bookings,
  rentals,
  memberships,
  shopHistory,
  events,
  transactions,
  bookingColumns,
  rentalColumns,
  shopColumns,
  membershipColumns,
  eventColumns,
  financialColumns,
  formatDualPrice
}) => (
  <div className="space-y-6">
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <ProfileInfoCard
          student={student}
          stats={stats}
          account={account}
          formatCurrency={formatCurrency}
          displayCurrency={displayCurrency}
          storageCurrency={storageCurrency}
          convertCurrency={convertCurrency}
        />
      </Col>

      <Col xs={24} lg={16}>
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <PackagesCard packages={packages} />
          </Col>
          <Col xs={24}>
            <UpcomingLessonsCard sessions={upcomingSessions} />
          </Col>
        </Row>
      </Col>
    </Row>

    <Row gutter={[16, 16]}>
      <Col xs={24}>
        <Alert
          type="info"
          showIcon
          message="Looking for family members?"
          description="Manage family details from the sidebar by navigating to Profile → Family."
        />
      </Col>
    </Row>

    <HistorySection
      activityRows={activityRows}
      bookings={bookings}
      rentals={rentals}
      memberships={memberships}
      shopHistory={shopHistory}
      events={events}
      transactions={transactions}
      bookingColumns={bookingColumns}
      rentalColumns={rentalColumns}
      shopColumns={shopColumns}
      membershipColumns={membershipColumns}
      eventColumns={eventColumns}
      financialColumns={financialColumns}
      formatDualPrice={formatDualPrice}
      storageCurrency={storageCurrency}
    />
  </div>
);

// eslint-disable-next-line complexity
const normalizePaymentEntry = (payment, index, displayCurrency) => {
  const amount = parseNumericAmount(payment?.amount);
  const normalizedType = resolvePaymentType(payment, amount);
  const normalizedStatus = resolvePaymentStatus(payment, normalizedType);
  const serviceName = payment?.serviceName ?? payment?.service_name ?? null;
  const description = resolvePaymentDescription(payment, normalizedType, serviceName);

  return {
    id: payment?.id ?? payment?.paymentIntentId ?? `payment-${index}`,
    createdAt: payment?.createdAt ?? payment?.created_at ?? null,
    amount,
    currency: payment?.currency ?? displayCurrency,
    status: normalizedStatus,
    type: normalizedType,
    description,
    bookingId: payment?.bookingId ?? payment?.booking_id ?? null,
    rentalId: payment?.rentalId ?? payment?.rental_id ?? null,
    paymentMethod: payment?.paymentMethod ?? payment?.payment_method ?? null,
    referenceNumber: payment?.referenceNumber ?? payment?.reference_number ?? null,
    serviceName,
    source: payment?.source ?? null,
  };
};

const useStudentDisplayData = (overview, bookings, rentals, businessCurrency) => {
  const displayCurrency = useMemo(
    () => businessCurrency || overview?.student?.preferredCurrency || 'EUR',
    [businessCurrency, overview?.student?.preferredCurrency],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const lessonList = bookings || [];
    const rentalList = rentals || [];

    const totalLessons = lessonList.length;
    const completedLessons = lessonList.filter((lesson) => lesson?.status === 'completed').length;
    const canceledLessons = lessonList.filter((lesson) => lesson?.status === 'cancelled').length;
    const noShowLessons = lessonList.filter((lesson) => lesson?.status === 'no-show').length;
    const upcomingLessons = lessonList.filter((lesson) => {
      if (!lesson || lesson.status === 'cancelled') return false;
      const dt = getBookingDateTime(lesson);
      return dt ? dt > now : false;
    }).length;
    const hoursAttended = lessonList.reduce((sum, lesson) => {
      const duration = Number.parseFloat(lesson?.duration ?? 0);
      if (lesson?.status === 'completed' && Number.isFinite(duration)) {
        return sum + duration;
      }
      return sum;
    }, 0);
    const totalRentals = rentalList.length;

    return {
      totalLessons,
      completedLessons,
      canceledLessons,
      noShowLessons,
      upcomingLessons,
      hoursAttended,
      attendanceRate: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      totalRentals,
    };
  }, [bookings, rentals]);

  const transactions = useMemo(() => {
    const payments = overview?.payments || [];
    return payments.map((payment, index) => normalizePaymentEntry(payment, index, displayCurrency));
  }, [overview?.payments, displayCurrency]);

  return {
    displayCurrency,
    stats,
    transactions,
    account: overview?.student?.account || {},
    packages: overview?.packages || [],
    upcomingSessions: overview?.upcomingSessions || [],
  };
};

const StudentProfile = () => {
  const { overview } = useOutletContext() || {};
  const { user } = useAuth();
  const { formatCurrency, businessCurrency, userCurrency, convertCurrency } = useCurrency();

  // Storage currency is always EUR
  const storageCurrency = businessCurrency || 'EUR';

  const studentId = overview?.student?.id || user?.id;
  const { bookings, rentals, memberships, shopHistory, events, loading: dataLoading, error } = useStudentActivity(studentId);

  const { displayCurrency, stats, transactions, account, packages, upcomingSessions } = useStudentDisplayData(
    overview,
    bookings,
    rentals,
    businessCurrency,
  );

  const activityRows = useMemo(() => buildActivityRows(bookings, rentals), [bookings, rentals]);
  const { bookingColumns, rentalColumns, membershipColumns, financialColumns, shopColumns, eventColumns, formatDualPrice } = useStudentTables(displayCurrency, formatCurrency, storageCurrency, convertCurrency);

  if (!overview && dataLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[300px]">
        <Spin size="large" />
      </div>
    );
  }

  if (!overview || !overview.student) {
    return (
      <div className="p-6">
        <Alert message="Profile unavailable" type="warning" showIcon />
      </div>
    );
  }

  const student = overview.student;

  return (
    <div className="p-4 md:p-6">
      {error && (
        <Alert
          className="mb-4"
          message="We had trouble loading some of your history"
          description={error}
          type="warning"
          showIcon
        />
      )}

      <Spin spinning={dataLoading} tip="Loading your activity...">
        <StudentProfileContent
          student={student}
          stats={stats}
          account={account}
          formatCurrency={formatCurrency}
          displayCurrency={displayCurrency}
          storageCurrency={storageCurrency}
          convertCurrency={convertCurrency}
          packages={packages}
          upcomingSessions={upcomingSessions}
          activityRows={activityRows}
          bookings={bookings}
          rentals={rentals}
          memberships={memberships}
          shopHistory={shopHistory}
          events={events}
          transactions={transactions}
          bookingColumns={bookingColumns}
          rentalColumns={rentalColumns}
          shopColumns={shopColumns}
          membershipColumns={membershipColumns}
          eventColumns={eventColumns}
          financialColumns={financialColumns}
          formatDualPrice={formatDualPrice}
        />
      </Spin>
    </div>
  );
};

export default StudentProfile;
