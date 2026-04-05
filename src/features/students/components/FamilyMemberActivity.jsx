import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Empty,
  Segmented,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography
} from 'antd';
import {
  AuditOutlined,
  CalendarOutlined,
  FileProtectOutlined,
  HistoryOutlined,
  ReloadOutlined,
  ShoppingOutlined
} from '@ant-design/icons';
import familyApi from '../services/familyApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const PAGE_SIZE = 20;

const createDefaultState = () => ({
  items: [],
  total: 0,
  offset: 0,
  limit: PAGE_SIZE,
  hasMore: false
});

const createDefaultFilters = () => ({
  type: 'all',
  dateRange: [null, null]
});

const TYPE_FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Bookings', value: 'booking' },
  { label: 'Rentals', value: 'rental' },
  { label: 'Waivers', value: 'waiver' },
  { label: 'Admin', value: 'audit' }
];

const iconByType = {
  booking: <CalendarOutlined />,
  rental: <ShoppingOutlined />,
  waiver: <FileProtectOutlined />,
  audit: <AuditOutlined />
};

const colorByType = {
  booking: 'blue',
  rental: 'purple',
  waiver: 'green',
  audit: 'gold'
};

const toBoundaryIsoString = (value, boundary = 'start') => {
  if (!value) {
    return null;
  }

  const extractFromDayInstance = () => {
    if (!value.isValid()) {
      return null;
    }

    const method = boundary === 'start' ? 'startOf' : 'endOf';
    const normalized = typeof value[method] === 'function' ? value[method]('day') : value;

    if (typeof normalized?.toISOString === 'function') {
      return normalized.toISOString();
    }

    if (typeof normalized?.toDate === 'function') {
      const asDate = normalized.toDate();
      return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
    }

    return null;
  };

  if (typeof value?.isValid === 'function') {
    return extractFromDayInstance();
  }

  const jsDate = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(jsDate.getTime())) {
    return null;
  }

  if (boundary === 'start') {
    jsDate.setHours(0, 0, 0, 0);
  } else {
    jsDate.setHours(23, 59, 59, 999);
  }

  return jsDate.toISOString();
};

const formatDateTime = (value) => {
  if (!value) {
    return 'Unknown';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const toNumberOrNull = (value) => {
  if (value === null || typeof value === 'undefined') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const renderBookingMetadata = (metadata, formatCurrency) => {
  const amount = toNumberOrNull(metadata.finalAmount ?? metadata.amount);
  const currency = metadata.currency || 'EUR';
  return (
    <Space direction="vertical" size={2} className="text-xs text-slate-600">
      {metadata.serviceName && (
        <Text type="secondary">Service: {metadata.serviceName}</Text>
      )}
      {metadata.instructorName && (
        <Text type="secondary">Instructor: {metadata.instructorName}</Text>
      )}
      {(metadata.startAt || metadata.endAt) && (
        <Space direction="vertical" size={0}>
          {metadata.startAt && (
            <Text type="secondary">Starts: {formatDateTime(metadata.startAt)}</Text>
          )}
          {metadata.endAt && (
            <Text type="secondary">Ends: {formatDateTime(metadata.endAt)}</Text>
          )}
        </Space>
      )}
      {(metadata.location || metadata.notes) && (
        <Space direction="vertical" size={0}>
          {metadata.location && (
            <Text type="secondary">Location: {metadata.location}</Text>
          )}
          {metadata.notes && (
            <Text type="secondary">Notes: {metadata.notes}</Text>
          )}
        </Space>
      )}
      <Space size={4} wrap>
        {metadata.paymentStatus && (
          <Tag color="processing">{metadata.paymentStatus}</Tag>
        )}
        {metadata.participantType && (
          <Tag>{metadata.participantType}</Tag>
        )}
        {amount !== null && (
          <Tag color="geekblue">{formatCurrency ? formatCurrency(amount, currency) : `€${amount.toFixed(2)}`}</Tag>
        )}
      </Space>
    </Space>
  );
};

const renderRentalMetadata = (metadata, formatCurrency) => {
  const equipmentNames = Array.isArray(metadata.equipmentNames)
    ? metadata.equipmentNames.filter(Boolean)
    : [];
  const totalPrice = toNumberOrNull(metadata.totalPrice);
  const currency = metadata.currency || 'EUR';

  return (
    <Space direction="vertical" size={2} className="text-xs text-slate-600">
      {equipmentNames.length > 0 && (
        <Space size={4} wrap>
          {equipmentNames.map((name) => (
            <Tag key={name}>{name}</Tag>
          ))}
        </Space>
      )}
      {(metadata.startAt || metadata.endAt) && (
        <Space direction="vertical" size={0}>
          {metadata.startAt && (
            <Text type="secondary">From: {formatDateTime(metadata.startAt)}</Text>
          )}
          {metadata.endAt && (
            <Text type="secondary">Until: {formatDateTime(metadata.endAt)}</Text>
          )}
        </Space>
      )}
      {metadata.notes && (
        <Text type="secondary">Notes: {metadata.notes}</Text>
      )}
      <Space size={4} wrap>
        {metadata.paymentStatus && (
          <Tag color="processing">{metadata.paymentStatus}</Tag>
        )}
        {metadata.participantType && (
          <Tag>{metadata.participantType}</Tag>
        )}
        {totalPrice !== null && (
          <Tag color="geekblue">{formatCurrency ? formatCurrency(totalPrice, currency) : `€${totalPrice.toFixed(2)}`}</Tag>
        )}
      </Space>
    </Space>
  );
};

const renderWaiverMetadata = (metadata) => (
  <Space direction="vertical" size={2} className="text-xs text-slate-600">
    <Space size={4} wrap>
      {metadata.languageCode && (
        <Tag color="blue">{metadata.languageCode.toUpperCase()}</Tag>
      )}
      {metadata.agreedToTerms && <Tag color="green">Agreed to Terms</Tag>}
      {metadata.photoConsent && <Tag color="gold">Photo Consent</Tag>}
    </Space>
    {metadata.signedAt && (
      <Text type="secondary">Signed: {formatDateTime(metadata.signedAt)}</Text>
    )}
    {(metadata.signedBy || metadata.signedByEmail) && (
      <Text type="secondary">
        Signed by: {metadata.signedBy || 'Guardian'}
        {metadata.signedByEmail ? ` (${metadata.signedByEmail})` : ''}
      </Text>
    )}
  </Space>
);

const renderAuditMetadata = (metadata) => {
  const nestedMetadata = metadata.metadata && typeof metadata.metadata === 'object'
    ? metadata.metadata
    : null;

  return (
    <Space direction="vertical" size={2} className="text-xs text-slate-600">
      {metadata.eventType && (
        <Text type="secondary">Event: {metadata.eventType}</Text>
      )}
      {(metadata.resourceType || metadata.resourceId) && (
        <Text type="secondary">
          Resource: {metadata.resourceType || 'N/A'}
          {metadata.resourceId ? ` (${metadata.resourceId})` : ''}
        </Text>
      )}
      {(metadata.actorName || metadata.actorEmail) && (
        <Text type="secondary">
          Actor: {metadata.actorName || 'System'}
          {metadata.actorEmail ? ` (${metadata.actorEmail})` : ''}
        </Text>
      )}
      {nestedMetadata && Object.keys(nestedMetadata).length > 0 && (
        <Text type="secondary" className="block">
          Details: {JSON.stringify(nestedMetadata)}
        </Text>
      )}
    </Space>
  );
};

const renderMetadata = (event, formatCurrency) => {
  const metadata = event?.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  switch (event.type) {
    case 'booking':
      return renderBookingMetadata(metadata, formatCurrency);
    case 'rental':
      return renderRentalMetadata(metadata, formatCurrency);
    case 'waiver':
      return renderWaiverMetadata(metadata);
    case 'audit':
      return renderAuditMetadata(metadata);
    default:
      return null;
  }
};

const FamilyMemberActivity = ({ open, onClose, userId, member }) => {
  const [state, setState] = useState(createDefaultState);
  const [filters, setFilters] = useState(createDefaultFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { formatCurrency } = useCurrency();
  
  // Use ref to avoid infinite loops - filters changes shouldn't trigger useEffect via loadActivity dependency
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const memberId = member?.id;
  const drawerTitle = member?.full_name ? `${member.full_name}'s Activity` : 'Family Activity';
  const hasActiveFilters = filters.type !== 'all' || (filters.dateRange?.[0] && filters.dateRange?.[1]);

  const handleTypeChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      type: value
    }));
  };

  const handleDateRangeChange = (nextRange) => {
    setFilters((prev) => ({
      ...prev,
      dateRange: Array.isArray(nextRange) ? nextRange : [null, null]
    }));
  };

  const handleResetFilters = () => {
    setFilters(createDefaultFilters);
  };

  const loadActivity = useCallback(async (requestedOffset = 0) => {
    if (!userId || !memberId) {
      return;
    }

    if (requestedOffset === 0) {
      setState(createDefaultState);
    }

    setLoading(true);
    setError(null);

    // Use ref to get current filters without adding to dependencies
    const currentFilters = filtersRef.current;
    
    const queryOptions = {
      limit: PAGE_SIZE,
      offset: requestedOffset
    };

    if (currentFilters.type !== 'all') {
      queryOptions.types = currentFilters.type;
    }

    const [rangeStart, rangeEnd] = Array.isArray(currentFilters.dateRange) ? currentFilters.dateRange : [null, null];
    if (rangeStart && rangeEnd) {
      const startIso = toBoundaryIsoString(rangeStart, 'start');
      const endIso = toBoundaryIsoString(rangeEnd, 'end');
      if (startIso) {
        queryOptions.startDate = startIso;
      }
      if (endIso) {
        queryOptions.endDate = endIso;
      }
    }

    try {
      const data = await familyApi.getFamilyMemberActivity(userId, memberId, queryOptions);

      setState((prev) => {
        const newItems = Array.isArray(data.items) ? data.items : [];
        const mergedItems = requestedOffset === 0 ? newItems : [...(prev.items || []), ...newItems];
        const returnedCount = data.count ?? newItems.length;
        const nextOffset = requestedOffset + returnedCount;
        const total = typeof data.total === 'number' ? data.total : mergedItems.length;
        const hasMore = typeof data.hasMore === 'boolean' ? data.hasMore : nextOffset < total;

        return {
          items: mergedItems,
          total,
          offset: nextOffset,
          limit: data.limit ?? PAGE_SIZE,
          hasMore
        };
      });
    } catch (apiError) {
      setError(apiError.message || 'Unable to load activity history');
    } finally {
      setLoading(false);
    }
  }, [memberId, userId]);

  useEffect(() => {
    if (!open) {
      setState(createDefaultState);
      setFilters(createDefaultFilters);
      setError(null);
      setLoading(false);
      return;
    }

    if (userId && memberId) {
      loadActivity(0);
    }
  }, [open, userId, memberId, loadActivity]);

  const handleLoadMore = () => {
    loadActivity(state.offset);
  };

  const handleRefresh = () => {
    loadActivity(0);
  };

  const timelineItems = state.items.map((event) => {
    const type = event.type || 'activity';
    const icon = iconByType[type] || <HistoryOutlined />;
    const color = colorByType[type] || 'blue';
    const label = formatDateTime(event.occurredAt || event.createdAt);

    return {
      color,
      dot: icon,
      label,
      children: (
        <div className="family-activity-item">
          <Space direction="vertical" size={4} className="w-full">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Text strong>{event.title || type}</Text>
              {event.status && <Tag color="blue">{event.status}</Tag>}
            </div>
            {event.subtitle && (
              <Text type="secondary">{event.subtitle}</Text>
            )}
            {renderMetadata(event, formatCurrency)}
          </Space>
        </div>
      )
    };
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={480}
      title={drawerTitle}
      destroyOnHidden
      extra={(
        <Button type="link" icon={<ReloadOutlined />} onClick={handleRefresh} disabled={loading || !memberId}>
          Refresh
        </Button>
      )}
    >
      {error && (
        <Alert
          type="error"
          message="Failed to load activity"
          description={error}
          showIcon
          closable
          onClose={() => setError(null)}
          className="mb-3"
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          options={TYPE_FILTER_OPTIONS}
          value={filters.type}
          onChange={handleTypeChange}
          size="middle"
        />
        <RangePicker
          value={filters.dateRange}
          onChange={handleDateRangeChange}
          allowClear
          format="MMM D, YYYY"
          style={{ minWidth: 240 }}
        />
        {hasActiveFilters && (
          <Button type="link" size="small" onClick={handleResetFilters}>
            Reset filters
          </Button>
        )}
      </div>

      <Spin spinning={loading && state.items.length === 0} tip="Fetching activity...">
        {state.items.length > 0 ? (
          <>
            <Timeline mode="left" items={timelineItems} className="pr-2" />
            {state.hasMore && (
              <div className="mt-4 flex justify-center">
                <Button onClick={handleLoadMore} loading={loading} disabled={loading}>
                  Load older activity
                </Button>
              </div>
            )}
          </>
        ) : (
          !loading && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No activity recorded yet"
            />
          )
        )}
      </Spin>
    </Drawer>
  );
};

FamilyMemberActivity.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  userId: PropTypes.string,
  member: PropTypes.shape({
    id: PropTypes.string,
    full_name: PropTypes.string
  })
};

FamilyMemberActivity.defaultProps = {
  userId: undefined,
  member: undefined
};

export default FamilyMemberActivity;
