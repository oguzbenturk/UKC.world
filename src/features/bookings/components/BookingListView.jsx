import { useState, useEffect, useCallback, useMemo } from 'react';
import './booking-list.css';
import { 
  Button, Table, Space, Input, Card, 
  Avatar, Tag, Segmented, Tooltip, Empty, DatePicker, App
} from 'antd';
import { useNavigate } from 'react-router-dom';
import DataService from '@/shared/services/dataService';
import { 
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  UserOutlined, CalendarOutlined, AppstoreOutlined, BarsOutlined,
  ThunderboltOutlined, CheckSquareOutlined
} from '@ant-design/icons';
import { logger } from '@/shared/utils/logger';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { CalendarProvider } from './contexts/CalendarContext';
import BookingDetailModal from './components/BookingDetailModal';
import { 
  formatParticipantNames, 
  getGroupBookingTooltip, 
  isGroupBooking, 
  getGroupIndicator 
} from '../utils/groupBookingUtils';

import CalendarViewSwitcher from '@/shared/components/CalendarViewSwitcher';

// Enable isBetween plugin for dayjs
dayjs.extend(isBetween);

const { RangePicker } = DatePicker;

const BookingListView = () => {
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const [bookings, setBookings] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [usersWithStudentRole, setUsersWithStudentRole] = useState([]);
  const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
  const [dateRange, setDateRange] = useState(() => {
    const today = dayjs();
    return [
      today.subtract(7, 'days'),
      today.add(30, 'days')
    ];
  });
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [lastUndo, setLastUndo] = useState(null); // { token, expiresAt }
  const [tableSize] = useState('middle'); // small | middle | large
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [visibleCols] = useState({
    date: true,
    time: true,
    user: true,
    instructor: true,
    service_name: true,
    duration: true,
    status: true,
    createdBy: true,
    actions: true,
  });
  const [selectedStatuses] = useState([]); // quick status chips
  
  // Debounce search input to reduce re-renders during typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Remove unused functions and destructuring
  // Build indexed lookups for users and instructors to avoid O(n) finds
  const userMap = useMemo(() => {
    const map = new Map();
    usersWithStudentRole.forEach((user) => {
      if (user?.id) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        map.set(user.id, { name, email: user.email });
      }
    });
    return map;
  }, [usersWithStudentRole]);

  const instructorMap = useMemo(() => {
    const map = new Map();
    instructors.forEach((instructor) => {
      if (instructor?.id) {
        map.set(instructor.id, instructor.name || 'Unknown Instructor');
      }
    });
    return map;
  }, [instructors]);

  const actorDirectory = useMemo(() => {
    const directory = {};

    usersWithStudentRole.forEach((user) => {
      if (!user || typeof user !== 'object') return;
      const id = user.id || user.user_id || user.userId;
      if (!id) return;
      const nameParts = [user.first_name, user.last_name].filter(Boolean);
      const label = nameParts.length ? nameParts.join(' ') : user.name || user.full_name || user.email;
      if (label) {
        directory[String(id)] = label;
      }
    });

    instructors.forEach((instructor) => {
      if (!instructor || typeof instructor !== 'object') return;
      const id = instructor.id || instructor.user_id || instructor.userId;
      if (!id) return;
      const label = instructor.name || instructor.full_name || instructor.email;
      if (label) {
        directory[String(id)] = label;
      }
    });

    return directory;
  }, [usersWithStudentRole, instructors]);

  const resolveActorLabel = useCallback((actorId, preferredLabel) => {
    if (typeof preferredLabel === 'string' && preferredLabel.trim()) {
      return preferredLabel.trim();
    }

    if (!actorId) {
      return 'System automation';
    }

    const key = String(actorId);
    if (actorDirectory[key]) {
      return actorDirectory[key];
    }

    const normalized = key.toLowerCase();
    if (normalized === '00000000-0000-0000-0000-000000000000' || normalized === 'system') {
      return 'System automation';
    }

    return key.length > 16 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key;
  }, [actorDirectory]);

  const formatTimestamp = useCallback((value) => {
    if (!value) return null;
    const d = dayjs(value);
    if (!d.isValid()) return null;
    return d.format('MMM DD, YYYY HH:mm');
  }, []);

  const buildRowKey = useCallback((booking) => (
    booking?.id
    || booking?.booking_id
    || booking?._id
    || `${booking?.date || 'na'}-${booking?.start_hour || 'na'}-${booking?.student_user_id || 'na'}-${booking?.instructor_user_id || 'na'}-${booking?.service_id || 'na'}`
  ), []);

  const handleDateRangeChange = useCallback((dates) => {
    if (!dates || !dates[0] || !dates[1]) {
      // Reset to default if cleared
      const today = dayjs();
      setDateRange([
        today.subtract(7, 'days'),
        today.add(30, 'days')
      ]);
      return;
    }
    
    // Ensure dates are valid dayjs objects
    const start = dayjs(dates[0]);
    const end = dayjs(dates[1]);
    
    // Validate year is reasonable (not in far future)
    if (start.year() > 2100 || end.year() > 2100) {
      message.warning('Invalid date range detected. Resetting to defaults.');
      const today = dayjs();
      setDateRange([
        today.subtract(7, 'days'),
        today.add(30, 'days')
      ]);
      return;
    }
    
    if (start.isValid() && end.isValid()) {
      setDateRange([start, end]);
    }
  }, [message]);

  const handleTodayClick = useCallback(() => {
    const today = dayjs();
    setDateRange([
      today.startOf('day'),
      today.endOf('day')
    ]);
  }, []);

  const decorateBookingWithAudit = useCallback((booking) => {
    if (!booking || typeof booking !== 'object') {
      return booking;
    }

    const createdBy = booking.createdBy ?? booking.created_by ?? null;
    const createdByName = booking.createdByName ?? booking.created_by_name ?? null;
    const createdAt = booking.createdAt ?? booking.created_at ?? null;
    const updatedAt = booking.updatedAt ?? booking.updated_at ?? null;

    return {
      ...booking,
      createdBy,
      createdByName,
      createdAt,
      updatedAt,
      createdByLabel: resolveActorLabel(createdBy, createdByName),
      createdAtFormatted: formatTimestamp(createdAt),
    };
  }, [formatTimestamp, resolveActorLabel]);

  const enrichedBookings = useMemo(() => bookings.map(decorateBookingWithAudit), [bookings, decorateBookingWithAudit]);

  const getUserName = useCallback((booking) => {
    if (booking.participants && booking.participants.length > 0) {
      return formatParticipantNames(booking);
    }
    const userData = userMap.get(booking.student_user_id);
    if (userData?.name) return userData.name;
    return booking.student_name || 'Unknown User';
  }, [userMap]);

  const getInstructorName = useCallback((booking) => {
    return instructorMap.get(booking.instructor_user_id) || 'Unknown Instructor';
  }, [instructorMap]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [bookingsData, instructorsData, usersData] = await Promise.all([
        DataService.getBookings(),
        DataService.getInstructors(),
        DataService.getUsersWithStudentRole()
      ]);

      // Deduplicate bookings by stable id to avoid duplicate keys in tables
      const dedupedBookings = [];
      const seenIds = new Set();
      (bookingsData || []).forEach((booking) => {
        const key = booking?.id || booking?.booking_id || booking?._id;
        if (key) {
          if (seenIds.has(key)) return;
          seenIds.add(key);
        }
        dedupedBookings.push(booking);
      });

      setBookings(dedupedBookings);
      setInstructors(instructorsData);
      setUsersWithStudentRole(usersData);
    } catch (error) {
      logger.error('Error fetching bookings list data', { error });
      message.error('Failed to load bookings data');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debug date range
  useEffect(() => {
    if (dateRange && dateRange[0] && dateRange[1]) {
      // eslint-disable-next-line no-console
      console.log('📅 Date Range:', {
        start: dateRange[0].format('YYYY-MM-DD'),
        end: dateRange[1].format('YYYY-MM-DD'),
        startYear: dateRange[0].year(),
        endYear: dateRange[1].year()
      });
    }
  }, [dateRange]);

  // close view dropdown on outside click / escape
  useEffect(() => {
    const onDown = (e) => {
      if (showViewDropdown && !e.target.closest('.list-view-dropdown')) setShowViewDropdown(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && showViewDropdown) setShowViewDropdown(false);
    };
    if (showViewDropdown) {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('keydown', onKey);
      };
    }
  }, [showViewDropdown]);

  // Refresh list when a booking is updated from modal (calendar emits an event)
  useEffect(() => {
    const onUpdated = () => fetchData();
    window.addEventListener('booking-updated', onUpdated);
    return () => window.removeEventListener('booking-updated', onUpdated);
  }, [fetchData]);

  const filteredBookings = useMemo(() => {
    let filtered = enrichedBookings;

    if (dateRange && dateRange[0] && dateRange[1]) {
      filtered = filtered.filter((booking) => {
        const bookingDate = dayjs(booking.date);
        return bookingDate.isBetween(dateRange[0], dateRange[1], 'day', '[]');
      });
    }

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();

      const matchesSearch = (booking) => {
        const haystack = [
          getUserName(booking),
          getInstructorName(booking),
          booking.service_name,
          booking.status,
          booking.createdByLabel,
          booking.createdAtFormatted,
        ];

        if (booking.participants?.length) {
          haystack.push(
            booking.participants
              .map((participant) => participant.userName || participant.name || '')
              .join(' ')
          );
        }

        if (booking.student_email) {
          haystack.push(booking.student_email);
        }

        return haystack.some(
          (value) => typeof value === 'string' && value.toLowerCase().includes(searchLower)
        );
      };

      filtered = filtered.filter(matchesSearch);
    }

    if (selectedStatuses.length) {
      const normalizedStatuses = selectedStatuses.map((status) => status.toLowerCase());
      filtered = filtered.filter((booking) =>
        normalizedStatuses.includes((booking.status || '').toLowerCase())
      );
    }

    return filtered;
  }, [enrichedBookings, dateRange, getInstructorName, getUserName, debouncedSearch, selectedStatuses]);

  const stableBookings = useMemo(() => {
    const seen = new Set();
    return filteredBookings.filter((booking) => {
      const key = buildRowKey(booking);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredBookings, buildRowKey]);

  const allIds = useMemo(() => stableBookings.map((b) => b.id), [stableBookings]);
  
  const handleDelete = (bookingId) => {
    // If multiple rows are selected, prefer bulk delete flow
    if (selectedRowKeys.length > 1) {
      modal.confirm({
        title: `Delete ${selectedRowKeys.length} selected bookings?`,
        content: 'This will reconcile package hours/balances. You can undo within 10 seconds.',
        okText: 'Delete',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: async () => {
          try {
            const resp = await DataService.bulkDeleteBookings(selectedRowKeys, 'Bulk delete via row action');
            const { deleted = [], failed = [], undoToken, undoExpiresAt } = resp || {};
            if (deleted.length) message.success(`${deleted.length} bookings deleted`);
            if (failed.length) message.warning(`${failed.length} failed to delete`);
            setSelectedRowKeys([]);
            setLastUndo(undoToken ? { token: undoToken, expiresAt: undoExpiresAt } : null);
            fetchData();
          } catch (error) {
            logger.error('Bulk delete (via row) failed', { error, selectedRowKeys });
            message.error('Bulk delete failed');
          }
        }
      });
      return;
    }

    // Otherwise delete only the clicked one
    modal.confirm({
      title: 'Are you sure you want to delete this booking?',
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await DataService.deleteBooking(bookingId);
          message.success('Booking deleted successfully');
          fetchData();
          window.dispatchEvent(new CustomEvent('booking-deleted', { detail: { bookingId } }));
        } catch (error) {
          logger.error('Error deleting booking', { error, bookingId });
          message.error('Failed to delete booking');
        }
      }
    });
  };
  
  const handleAddClick = () => {
    navigate('/bookings/calendar');
  };

  const handleBulkDelete = async () => {
    if (!selectedRowKeys.length) return;
    modal.confirm({
      title: `Delete ${selectedRowKeys.length} selected bookings?`,
      content: 'This will reconcile package hours/balances. You can undo within 10 seconds.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const resp = await DataService.bulkDeleteBookings(selectedRowKeys, 'Bulk delete from list view');
          const { deleted = [], failed = [], undoToken, undoExpiresAt } = resp || {};
          if (deleted.length) message.success(`${deleted.length} bookings deleted`);
          if (failed.length) message.warning(`${failed.length} failed to delete`);
          setSelectedRowKeys([]);
          setLastUndo(undoToken ? { token: undoToken, expiresAt: undoExpiresAt } : null);
          fetchData();
        } catch (e) {
          logger.error('Bulk delete failed', e);
          message.error('Bulk delete failed');
        }
      }
    });
  };

  const handleUndo = async () => {
    if (!lastUndo?.token) return;
    try {
      await DataService.undoDeleteBookings(lastUndo.token);
      message.success('Undo completed');
      setLastUndo(null);
      fetchData();
    } catch (e) {
      logger.error('Undo failed', e);
      message.error('Undo failed or expired');
    }
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    return dayjs(dateString).format('MMM DD, YYYY');
  };

  const formatTime = (startHour, duration) => {
    const start = dayjs().startOf('day').add(startHour, 'hours');
    const end = start.add(duration || 1, 'hours');
    return `${start.format('HH:mm')} - ${end.format('HH:mm')}`;
  };
  
  const getStatusBadge = (status) => {
    const statusMap = {
      confirmed: { label: 'Confirmed', className: 'status-confirmed' },
      pending: { label: 'Pending', className: 'status-pending' },
      completed: { label: 'Completed', className: 'status-completed' },
      cancelled: { label: 'Cancelled', className: 'status-cancelled' },
      booked: { label: 'Booked', className: 'status-booked' }
    };
    
    const { label, className } = statusMap[status] || { label: status || 'Unknown', className: 'status-badge' };
    return <Tag className={`status-badge ${className}`}>{label}</Tag>;
  };

  // Columns definition
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => formatDate(date),
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
      width: 120,
    },
    {
      title: 'Time',
      key: 'time',
      render: (record) => (
        <span className="time-display">
          {formatTime(record.start_hour, record.duration)}
        </span>
      ),
      width: 120,
    },
    {
      title: 'User',
      key: 'user',
      render: (record) => {
        const name = getUserName(record);
        const isGroup = isGroupBooking(record);
        const indicator = getGroupIndicator(record);
        const content = (
          <div className="user-cell">
            <Avatar size="small" icon={<UserOutlined />} className="mr-2" />
            <div>
              <div className="user-name">{name}</div>
              {isGroup && indicator ? <Tag color="blue" className="ml-2">{indicator}</Tag> : null}
            </div>
          </div>
        );
        return isGroup ? (
          <Tooltip title={getGroupBookingTooltip(record)}>{content}</Tooltip>
        ) : content;
      },
  sorter: (a, b) => getUserName(a).localeCompare(getUserName(b)),
    },
    {
      title: 'Instructor',
      key: 'instructor',
      render: (record) => getInstructorName(record),
  sorter: (a, b) => getInstructorName(a).localeCompare(getInstructorName(b)),
    },
    {
      title: 'Service',
      dataIndex: 'service_name',
      key: 'service_name',
      render: (service) => service || 'Lesson',
    },
    {
      title: <div className="text-center font-semibold">Duration</div>,
      dataIndex: 'duration',
      key: 'duration',
      render: (duration) => (
        <div className="text-center">
          <span className="font-medium">{duration || 1}h</span>
        </div>
      ),
      width: 100,
      align: 'center',
    },
    {
      title: <div className="text-center font-semibold">Status</div>,
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <div className="flex justify-center">
          {getStatusBadge(status)}
        </div>
      ),
      filters: [
        { text: 'Confirmed', value: 'confirmed' },
        { text: 'Pending', value: 'pending' },
        { text: 'Completed', value: 'completed' },
        { text: 'Cancelled', value: 'cancelled' },
        { text: 'Booked', value: 'booked' },
      ],
      onFilter: (value, record) => (record.status || '').toLowerCase() === value,
      width: 130,
      align: 'center',
    },
    {
      title: 'Created By',
      key: 'createdBy',
      dataIndex: 'createdByLabel',
      render: (_, record) => {
        const label = record.createdByLabel || 'Unknown';
        const timestamp = record.createdAtFormatted;

        return (
          <Tooltip
            title={timestamp ? `Created ${timestamp}` : 'Created via automation'}
            placement="top"
          >
            <div className="flex flex-col">
              <span className="font-medium text-gray-800">{label}</span>
              {timestamp && (
                <span className="text-xs text-gray-500">{timestamp}</span>
              )}
            </div>
          </Tooltip>
        );
      },
      sorter: (a, b) => (a.createdByLabel || '').localeCompare(b.createdByLabel || ''),
      width: 160,
    },
    {
      title: <div className="text-center font-semibold">Actions</div>,
      key: 'actions',
      render: (record) => (
        <div className="flex justify-center">
          <Space size="middle" className="action-buttons">
            <Tooltip title="Edit booking">
              <Button 
                type="text" 
                icon={<EditOutlined />} 
                size="small"
                onClick={() => { setSelectedBooking(record); setIsDetailOpen(true); }}
              />
            </Tooltip>
            <Tooltip title="Delete booking">
              <Button 
                type="text" 
                icon={<DeleteOutlined />} 
                size="small"
                danger
                onClick={() => handleDelete(record.id)}
              />
            </Tooltip>
          </Space>
        </div>
      ),
      width: 120,
      align: 'center',
    },
  ];

  // Column visibility controls and utilities
  const visibleColumns = (columns || []).filter(col => {
    const key = col.key || col.dataIndex;
    return key ? visibleCols[key] !== false : true;
  });

  return (
    <div className="bookings-page bg-gray-50 min-h-screen">
      {/* Top bar with view switcher */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left: View Switcher */}
          <CalendarViewSwitcher
            currentView="list"
            views={['list', 'day', 'week', 'month']}
            calendarPath="/bookings/calendar"
            size="large"
          />

          {/* Center: Title */}
          <div className="text-lg font-semibold text-slate-800">
            Lessons Calendar
          </div>

          {/* Right: New Booking button */}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/bookings/calendar')}
            className="h-10 rounded-xl shadow-md"
          >
            <span className="hidden sm:inline">New Booking</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      <div className="p-6">
        <div className="max-w-7xl mx-auto">

        {/* Search and Filters */}
        <Card className="filters-card mb-6">
          <div className="space-y-6">
            {/* Main filters row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Date Range</label>
                <div className="flex gap-2">
                  <RangePicker
                    value={dateRange}
                    onChange={handleDateRangeChange}
                    format="MMM DD, YYYY"
                    allowClear={false}
                    size="middle"
                    className="flex-1 min-w-0"
                    picker="date"
                    showTime={false}
                    inputReadOnly
                    classNames={{ popup: { root: "booking-date-picker-dropdown" } }}
                    disabledDate={(current) => {
                      // Prevent selecting dates too far in the future
                      const maxDate = dayjs().add(2, 'years');
                      return current && current > maxDate;
                    }}
                    placeholder={['Start', 'End']}
                  />
                  <Button 
                    onClick={handleTodayClick}
                    size="middle"
                    type="primary"
                    icon={<CalendarOutlined />}
                    title="Show today's bookings only"
                  >
                    Today
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">View Mode</label>
                <div className="flex items-center gap-3 text-[13px]">
                  <Segmented
                    value={viewMode}
                    onChange={setViewMode}
                    options={[
                      { label: 'Table', value: 'table', icon: <BarsOutlined /> },
                      { label: 'Cards', value: 'cards', icon: <AppstoreOutlined /> }
                    ]}
                    size="middle"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Content */}
        {viewMode === 'table' ? (
          <Card className="table-card shadow-sm border-0 rounded-xl">
            {/* Search bar at top */}
            <div className="search-top p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="max-w-md mx-auto">
                <Input
                  placeholder="Search by learner, instructor, service, or creator..."
                  prefix={<SearchOutlined className="text-slate-400" />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                  size="large"
                  className="rounded-lg"
                />
                {searchText && (
                  <div className="flex justify-center mt-2">
                    <Tag closable onClose={() => setSearchText('')} className="bg-blue-50 border-blue-200">
                      Search: {searchText}
                    </Tag>
                  </div>
                )}
              </div>
            </div>
            
            {selectedRowKeys.length > 1 && (
              <div className="bulkbar flex items-center justify-start px-2 pt-3 pb-2 gap-3">
                <div className="flex items-center gap-2">
                  <Button onClick={() => setSelectedRowKeys([])} className="h-8">
                    Clear Selection
                  </Button>
                  <Button danger onClick={handleBulkDelete} className="h-8">
                    Delete Selected ({selectedRowKeys.length})
                  </Button>
                </div>
                <div className="text-sm text-gray-600">
                  {selectedRowKeys.length} selected
                </div>
                {selectedRowKeys.length < allIds.length && selectedRowKeys.length > 0 && (
                  <Button type="link" size="small" onClick={() => setSelectedRowKeys(allIds)} icon={<CheckSquareOutlined />}>
                    Select all {allIds.length} results
                  </Button>
                )}
              </div>
            )}
            <Table
              columns={visibleColumns}
              dataSource={stableBookings}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                preserveSelectedRowKeys: true,
                fixed: true,
                columnWidth: 40,
              }}
              rowKey={buildRowKey}
              loading={{
                spinning: loading,
                indicator: (
                  <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    <span className="text-sm text-gray-500">Loading bookings...</span>
                  </div>
                )
              }}
              pagination={{
                total: stableBookings.length,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => 
                  `${range[0]}-${range[1]} of ${total} bookings`,
                className: "mt-4 px-4 pb-4"
              }}
              scroll={{ x: 1000 }}
              size={tableSize}
              sticky={{ offsetHeader: 0 }}
              rowClassName={(_, index) => index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
              className="rounded-lg"
              locale={{
                emptyText: (
                  <Empty
                    description="No bookings found"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                )
              }}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {stableBookings.map((booking) => (
              <Card
                key={buildRowKey(booking)}
                className="shadow-sm hover:shadow-md transition-shadow duration-200 border-0 rounded-xl"
                styles={{ body: { padding: '20px' } }}
              >
                {/* Status and Actions */}
                <div className="flex justify-between items-start mb-4">
                  {getStatusBadge(booking.status)}
                  <Space size="small">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => { setSelectedBooking(booking); setIsDetailOpen(true); }}
                      className="text-gray-500 hover:text-blue-600"
                    />
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(booking.id)}
                      className="text-gray-500 hover:text-red-500"
                    />
                  </Space>
                </div>

                {/* User Info */}
                <div className="flex items-center space-x-3 mb-4">
                  <Avatar 
                    icon={<UserOutlined />} 
                    className="bg-blue-500"
                    size={40}
                  />
                  <div>
                    <h3 className="font-semibold text-gray-800 text-sm">{getUserName(booking)}</h3>
                    <p className="text-gray-500 text-xs">{getInstructorName(booking)}</p>
                  </div>
                </div>

                {/* Date and Time */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center space-x-2 text-gray-600">
                    <CalendarOutlined className="text-blue-500" />
                    <span className="text-sm">{formatDate(booking.date)}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-600">
                    <ThunderboltOutlined className="text-green-500" />
                    <span className="text-sm">{formatTime(booking.start_hour, booking.duration)}</span>
                  </div>
                  <div className="text-gray-600 text-sm">
                    <span className="font-medium">Service:</span> {booking.service_name || 'Lesson'}
                  </div>
                </div>

                {/* Duration */}
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500 text-center">
                    Duration: {booking.duration || 1} hour{(booking.duration || 1) > 1 ? 's' : ''}
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-500 text-center">
                  <div className="font-semibold text-gray-700">Created by</div>
                  <div>{booking.createdByLabel || 'Unknown'}</div>
                  {booking.createdAtFormatted && (
                    <div className="text-[11px] text-gray-400">{booking.createdAtFormatted}</div>
                  )}
                </div>
              </Card>
            ))}
            {filteredBookings.length === 0 && !loading && (
              <div className="col-span-full">
                <Card className="text-center py-12 shadow-sm border-0 rounded-xl">
                  <Empty
                    description="No bookings found"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddClick}
                    className="mt-4"
                  >
                    Create First Booking
                  </Button>
                </Card>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
      {/* Calendar booking detail modal for editing, wrapped with provider for context */}
      <CalendarProvider>
        <BookingDetailModal
          isOpen={isDetailOpen}
          onClose={() => { setIsDetailOpen(false); setSelectedBooking(null); }}
          booking={selectedBooking}
          onServiceUpdate={() => {}}
        />
      </CalendarProvider>

      {lastUndo?.token && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-white shadow-xl rounded-2xl px-6 py-4 border-2 border-blue-200 flex items-center space-x-4 backdrop-blur-sm bg-white/95">
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="font-medium text-gray-800">Bookings deleted successfully</span>
            </div>
            <Button 
              type="primary" 
              size="small" 
              onClick={handleUndo}
              className="bg-blue-500 hover:bg-blue-600 border-0 rounded-lg font-medium"
            >
              Undo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingListView;
