import { Card, Tag, Progress, Button } from 'antd';
import { useRef } from 'react';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { 
  EyeOutlined, 
  CalendarOutlined, 
  DollarOutlined,
  UserOutlined,
  ShoppingOutlined 
} from '@ant-design/icons';

/**
 * Mobile Card Renderer for Transaction History
 */
export const TransactionMobileCard = ({ record, onRowClick }) => {
  const startX = useRef(0); const startY = useRef(0); const moved = useRef(false); const threshold = 10;
  const onStart = (x, y) => { startX.current = x; startY.current = y; moved.current = false; };
  const onMove = (x, y) => { if (Math.abs(x - startX.current) > threshold || Math.abs(y - startY.current) > threshold) moved.current = true; };
  const { formatCurrency, businessCurrency } = useCurrency();
  const displayCurrency = record.currency || businessCurrency || 'EUR';
  const statusTag = (status) => (
    <Tag color={status === 'completed' ? 'green' : status === 'pending' ? 'orange' : 'red'}>
      {status?.toUpperCase()}
    </Tag>
  );
  const getAmountColor = (amount) => {
    const numericAmount = parseFloat(amount);
    return numericAmount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const getTypeColor = (type) => {
    const colors = {
      payment: 'green',
      refund: 'orange',
      credit: 'blue',
      adjustment: 'purple',
      package: 'cyan'
    };
    return colors[type] || 'default';
  };

  const formatPaymentMethod = (method) => {
    if (!method) return 'N/A';
    try {
      return String(method)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return String(method);
    }
  };

  const getPaymentMethodLabel = (rec) => {
    const methodRaw = rec.payment_method || rec.paymentMethod;
    if (methodRaw) return formatPaymentMethod(methodRaw);
    const t = String(rec.type || '').toLowerCase();
    if (['refund', 'booking_deleted_refund', 'package_refund'].includes(t)) return 'Refund';
    if (['payment', 'credit'].includes(t)) return 'Account Credit';
    if (['booking_charge', 'charge', 'booking_charge'].includes(t)) return 'Account Balance';
    return '—';
  };

  const dateValue = record.createdAt || record.created_at || record.transaction_date || record.date;

  return (
    <Card
      onMouseDown={(e) => onStart(e.clientX, e.clientY)}
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      onTouchStart={(e) => { const t = e.touches?.[0]; if (t) onStart(t.clientX, t.clientY); }}
      onTouchMove={(e) => { const t = e.touches?.[0]; if (t) onMove(t.clientX, t.clientY); }}
      className="mb-3 shadow-sm hover:shadow-md transition-shadow"
      size="small"
      actions={[
        <Button
          key="view"
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            if (!moved.current) onRowClick && onRowClick(record);
          }}
        >
          View Details
        </Button>
      ]}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <DollarOutlined className="text-gray-500" />
            <div>
              <div className="font-medium text-gray-900">
                {record.description}
              </div>
              <div className="text-xs text-gray-500">
                {dateValue ? new Date(dateValue).toLocaleDateString() : '—'}
              </div>
            </div>
          </div>
          <div className={`font-bold text-lg ${getAmountColor(record.amount)}`}>
            {formatCurrency(Math.abs(parseFloat(record.amount)), displayCurrency)}
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Type:</span>
            <div>
              <Tag color={getTypeColor(record.type)} className="mt-1">
                {record.type.toUpperCase()}
              </Tag>
            </div>
          </div>
          <div>
            <span className="text-gray-500">Payment Method:</span>
            <div className="text-gray-900 mt-1">
              {getPaymentMethodLabel(record)}
            </div>
          </div>
          <div>
            <span className="text-gray-500">Status:</span>
            <div className="mt-1">{statusTag(record.status)}</div>
          </div>
          <div>
            <span className="text-gray-500">Balance Impact:</span>
            <div className={`font-medium mt-1 ${getAmountColor(record.amount)}`}>
              {parseFloat(record.amount) >= 0 ? 'Credit' : 'Debit'}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

/**
 * Mobile Card Renderer for Booking History
 */
export const BookingMobileCard = ({ record, onRowClick }) => {
  const startX = useRef(0); const startY = useRef(0); const moved = useRef(false); const threshold = 10;
  const onStart = (x, y) => { startX.current = x; startY.current = y; moved.current = false; };
  const onMove = (x, y) => { if (Math.abs(x - startX.current) > threshold || Math.abs(y - startY.current) > threshold) moved.current = true; };
  const { formatCurrency, businessCurrency } = useCurrency();
  const displayCurrency = record.currency || businessCurrency || 'EUR';
  const getStatusColor = (status) => {
    const colors = {
      confirmed: 'green',
      pending: 'orange',
      cancelled: 'red',
      completed: 'blue',
      'no-show': 'gray'
    };
    return colors[status] || 'default';
  };

  const roundHours = (val) => {
    if (val === null || val === undefined) return null;
    const num = parseFloat(val);
    if (!isFinite(num)) return null;
    const fixed = Math.round(num * 10) / 10;
    return fixed % 1 === 0 ? String(fixed) : fixed.toFixed(1);
  };

  const formatBookingDateTime = (rec) => {
    const tryParse = (v) => {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    // 1) Direct datetime field
    let d = rec.date_time ? tryParse(rec.date_time) : null;

    // 2) Compose from date + startTime/start_time
    if (!d && rec.date && (rec.startTime || rec.start_time)) {
      const timeStr = rec.startTime || rec.start_time; // HH:mm or full datetime
      if (/^\d{2}:\d{2}$/.test(String(timeStr))) {
        // Build local datetime
        const [y, m, day] = String(rec.date).split('-').map(Number);
        const [hh, mm] = String(timeStr).split(':').map(Number);
        d = new Date(y, (m || 1) - 1, day || 1, hh, mm, 0);
      } else {
        d = tryParse(timeStr);
      }
    }

    // 3) Fallback to just date
    if (!d && rec.date) d = tryParse(rec.date);

    if (!d) return { date: '—', time: '—' };
    return {
      date: d.toLocaleDateString(),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  const { date, time } = formatBookingDateTime(record);
  const duration = roundHours(record.duration ?? record.hours);
  const priceVal = (() => {
    const p = record.total_price ?? record.price;
    const num = parseFloat(p);
    if (!isFinite(num)) return null;
    return formatCurrency(num, displayCurrency);
  })();
  const studentLabel = (() => {
    if (Array.isArray(record.participants) && record.participants.length > 0) {
      return record.participants.map((p) => p.name || p.full_name || p.email).filter(Boolean).join(', ');
    }
    if (record.student_name) return record.student_name;
    if (record.userName) return record.userName;
    if (record.group_size && record.group_size > 1) return `${record.group_size} participants`;
    return '—';
  })();

  return (
    <Card
      onMouseDown={(e) => onStart(e.clientX, e.clientY)}
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      onTouchStart={(e) => { const t = e.touches?.[0]; if (t) onStart(t.clientX, t.clientY); }}
      onTouchMove={(e) => { const t = e.touches?.[0]; if (t) onMove(t.clientX, t.clientY); }}
      className="mb-3 shadow-sm hover:shadow-md transition-shadow"
      size="small"
      actions={[
        <Button
          key="view"
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            if (!moved.current) onRowClick && onRowClick(record);
          }}
        >
          View Details
        </Button>
      ]}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <CalendarOutlined className="text-blue-500" />
            <div>
              <div className="font-medium text-gray-900">
                {record.service_type || record.lesson_type}
              </div>
              <div className="text-xs text-gray-500">
                {date} at {time}
              </div>
            </div>
          </div>
          <Tag color={getStatusColor(record.status)}>
            {record.status?.toUpperCase()}
          </Tag>
        </div>

        {/* Student / Participants */}
        <div className="bg-gray-50 rounded-md p-2">
          <div className="text-xs text-gray-500 mb-1">Student:</div>
          <div className="flex items-center gap-1">
            <UserOutlined className="text-gray-400" />
            <span className="text-sm text-gray-700">
              {studentLabel}
            </span>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Duration:</span>
            <div className="text-gray-900 mt-1">{(duration ?? 'N/A')}h</div>
          </div>
          <div>
            <span className="text-gray-500">Instructor:</span>
            <div className="text-gray-900 mt-1">
              {record.instructor_name || 'N/A'}
            </div>
          </div>
      <div>
            <span className="text-gray-500">Price:</span>
            <div className="text-gray-900 font-medium mt-1">
              {priceVal || 'N/A'}
            </div>
          </div>
          <div>
            <span className="text-gray-500">Payment:</span>
            <div className="mt-1">
              <Tag color={record.payment_status === 'paid' ? 'green' : record.payment_status === 'pending' ? 'orange' : 'red'}>
                {record.payment_status?.toUpperCase() || 'UNKNOWN'}
              </Tag>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

/**
 * Mobile Card Renderer for Rental History
 */
export const RentalMobileCard = ({ record, onRowClick }) => {
  const startX = useRef(0); const startY = useRef(0); const moved = useRef(false); const threshold = 10;
  const onStart = (x, y) => { startX.current = x; startY.current = y; moved.current = false; };
  const onMove = (x, y) => { if (Math.abs(x - startX.current) > threshold || Math.abs(y - startY.current) > threshold) moved.current = true; };
  const { formatCurrency, businessCurrency } = useCurrency();
  const displayCurrency = record.currency || businessCurrency || 'EUR';
  const getStatusColor = (s) => ({ active: 'green', returned: 'blue', overdue: 'red', cancelled: 'gray' }[s] || 'default');

  const safeDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  };

  const roundHours = (val) => {
    if (val === null || val === undefined) return null;
    const num = parseFloat(val);
    if (!isFinite(num)) return null;
    const fixed = Math.round(num * 10) / 10;
    return fixed % 1 === 0 ? String(fixed) : fixed.toFixed(1);
  };

  const durationHours = roundHours(record.duration_hours ?? record.duration);
  const hoursUsed = roundHours(record.hours_used);
  const progressPercent = () => {
    if (!hoursUsed || !durationHours) return 0;
    const pct = (parseFloat(hoursUsed) / parseFloat(durationHours)) * 100;
    return Math.min(pct, 100);
  };
  const priceVal = (() => {
    const p = record.total_price ?? record.price;
    const num = parseFloat(p);
    return isFinite(num) ? formatCurrency(num, displayCurrency) : null;
  })();

  return (
    <Card
      onMouseDown={(e) => onStart(e.clientX, e.clientY)}
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      onTouchStart={(e) => { const t = e.touches?.[0]; if (t) onStart(t.clientX, t.clientY); }}
      onTouchMove={(e) => { const t = e.touches?.[0]; if (t) onMove(t.clientX, t.clientY); }}
      className="mb-3 shadow-sm hover:shadow-md transition-shadow"
      size="small"
      actions={[
        <Button
          key="view"
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            if (!moved.current) onRowClick && onRowClick(record);
          }}
        >
          View Details
        </Button>
      ]}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <ShoppingOutlined className="text-purple-500" />
            <div>
              <div className="font-medium text-gray-900">
                {record.equipment_name || record.item_name}
              </div>
              <div className="text-xs text-gray-500">
        Rented: {safeDate(record.rental_date || record.start_date || record.created_at)}
              </div>
            </div>
          </div>
          <Tag color={getStatusColor(record.status)}>
            {record.status?.toUpperCase()}
          </Tag>
        </div>

        {/* Duration Progress */}
  {durationHours ? (
          <div className="bg-gray-50 rounded-md p-2">
            <div className="text-xs text-gray-500 mb-2">Rental Duration</div>
            <Progress
    percent={progressPercent()}
              size="small"
              status={record.status === 'overdue' ? 'exception' : 'normal'}
        format={() => `${hoursUsed || 0}h / ${durationHours}h`}
            />
          </div>
    ) : null}

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Duration:</span>
            <div className="text-gray-900 mt-1">
        {(durationHours ?? 'N/A')}h
            </div>
          </div>
          <div>
            <span className="text-gray-500">Price:</span>
            <div className="text-gray-900 font-medium mt-1">
  {priceVal || 'N/A'}
            </div>
          </div>
          {record.return_date && (
            <>
              <div>
                <span className="text-gray-500">Returned:</span>
                <div className="text-gray-900 mt-1">{safeDate(record.return_date)}</div>
              </div>
              <div>
                <span className="text-gray-500">Condition:</span>
                <div className="text-gray-900 mt-1">
                  {record.return_condition || 'Good'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};

/**
 * Mobile Card Renderer for Combined Activity (Bookings + Rentals)
 */
export const ActivityMobileCard = ({ record, onRowClick }) => {
  const startX = useRef(0); const startY = useRef(0); const moved = useRef(false); const threshold = 10;
  const onStart = (x, y) => { startX.current = x; startY.current = y; moved.current = false; };
  const onMove = (x, y) => { if (Math.abs(x - startX.current) > threshold || Math.abs(y - startY.current) > threshold) moved.current = true; };
  const isRental = record.type === 'rental';
  const IconComponent = isRental ? ShoppingOutlined : CalendarOutlined;
  const iconColor = isRental ? 'text-purple-500' : 'text-blue-500';

  return (
    <Card
      onMouseDown={(e) => onStart(e.clientX, e.clientY)}
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      onTouchStart={(e) => { const t = e.touches?.[0]; if (t) onStart(t.clientX, t.clientY); }}
      onTouchMove={(e) => { const t = e.touches?.[0]; if (t) onMove(t.clientX, t.clientY); }}
      className="mb-3 shadow-sm hover:shadow-md transition-shadow"
      size="small"
      actions={[
        <Button
          key="view"
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            if (!moved.current) onRowClick && onRowClick(record);
          }}
        >
          View Details
        </Button>
      ]}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <IconComponent className={iconColor} />
            <div>
              <div className="font-medium text-gray-900">
                {record.description}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(record.date).toLocaleDateString()}
              </div>
            </div>
          </div>
          <Tag color={record.type === 'lesson' ? 'blue' : 'orange'}>
            {record.type?.toUpperCase()}
          </Tag>
        </div>

        {/* Status */}
        <div className="text-center">
          <Tag 
            color={
              record.status === 'confirmed' || record.status === 'active' ? 'green' :
              record.status === 'pending' ? 'orange' :
              record.status === 'cancelled' || record.status === 'returned' ? 'gray' : 'red'
            }
          >
            {record.status?.toUpperCase()}
          </Tag>
        </div>
      </div>
    </Card>
  );
};
