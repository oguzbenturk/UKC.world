import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './booking-list.css';
import {
  Button, Table, Input, Pagination,
  Avatar, Tooltip, Empty, DatePicker, App, Segmented
} from 'antd';
import { useNavigate } from 'react-router-dom';
import DataService from '@/shared/services/dataService';
import { 
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  UserOutlined, CalendarOutlined, AppstoreOutlined, BarsOutlined,
  CheckSquareOutlined
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
  const { t } = useTranslation(['common']);
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
  const [selectedStatuses] = useState([]); // quick status chips
  const [datePreset, setDatePreset] = useState('custom');
  const [cardPage, setCardPage] = useState(1);
  const cardPageSize = 24;
  
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
    setDatePreset('custom');
    setCardPage(1);
    if (!dates || !dates[0] || !dates[1]) {
      const today = dayjs();
      setDateRange([today.subtract(7, 'days'), today.add(30, 'days')]);
      return;
    }
    const start = dayjs(dates[0]);
    const end = dayjs(dates[1]);
    if (start.year() > 2100 || end.year() > 2100) {
      message.warning(t('common:bookings.dateRange.invalidRange'));
      const today = dayjs();
      setDateRange([today.subtract(7, 'days'), today.add(30, 'days')]);
      return;
    }
    if (start.isValid() && end.isValid()) {
      setDateRange([start, end]);
    }
  }, [message]);

  const handlePresetChange = useCallback((preset) => {
    setDatePreset(preset);
    setCardPage(1);
    const today = dayjs();
    switch (preset) {
      case 'today':
        setDateRange([today.startOf('day'), today.endOf('day')]);
        break;
      case 'week':
        setDateRange([today.startOf('week'), today.endOf('week')]);
        break;
      case 'month':
        setDateRange([today.startOf('month'), today.endOf('month')]);
        break;
      case 'all':
        setDateRange(null);
        break;
      default:
        break;
    }
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
      message.error(t('common:bookings.delete.failed'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // Reset card page when filter results change
  useEffect(() => { setCardPage(1); }, [stableBookings.length]);

  const paginatedCards = useMemo(() => {
    const start = (cardPage - 1) * cardPageSize;
    return stableBookings.slice(start, start + cardPageSize);
  }, [stableBookings, cardPage, cardPageSize]);
  
  const handleDelete = (bookingId) => {
    // If multiple rows are selected, prefer bulk delete flow
    if (selectedRowKeys.length > 1) {
      modal.confirm({
        title: t('common:bookings.bulk.deleteConfirmTitle', { count: selectedRowKeys.length }),
        content: t('common:bookings.bulk.deleteConfirmContent'),
        okText: t('common:buttons.delete'),
        okType: 'danger',
        cancelText: t('common:buttons.cancel'),
        onOk: async () => {
          try {
            const resp = await DataService.bulkDeleteBookings(selectedRowKeys, 'Bulk delete via row action');
            const { deleted = [], failed = [], undoToken, undoExpiresAt } = resp || {};
            if (deleted.length) message.success(t('common:bookings.bulk.deletedCount', { count: deleted.length }));
            if (failed.length) message.warning(t('common:bookings.bulk.failedCount', { count: failed.length }));
            setSelectedRowKeys([]);
            setLastUndo(undoToken ? { token: undoToken, expiresAt: undoExpiresAt } : null);
            fetchData();
          } catch (error) {
            logger.error('Bulk delete (via row) failed', { error, selectedRowKeys });
            message.error(t('common:bookings.bulk.failed'));
          }
        }
      });
      return;
    }

    // Otherwise delete only the clicked one
    modal.confirm({
      title: t('common:bookings.delete.confirmTitle'),
      content: t('common:bookings.delete.confirmContent'),
      okText: t('common:bookings.delete.okText'),
      okType: 'danger',
      cancelText: t('common:buttons.cancel'),
      onOk: async () => {
        try {
          await DataService.deleteBooking(bookingId);
          message.success(t('common:bookings.delete.success'));
          fetchData();
          window.dispatchEvent(new CustomEvent('booking-deleted', { detail: { bookingId } }));
        } catch (error) {
          logger.error('Error deleting booking', { error, bookingId });
          message.error(t('common:bookings.delete.failed'));
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
      title: t('common:bookings.bulk.deleteConfirmTitle', { count: selectedRowKeys.length }),
      content: t('common:bookings.bulk.deleteConfirmContent'),
      okText: t('common:buttons.delete'),
      okType: 'danger',
      cancelText: t('common:buttons.cancel'),
      onOk: async () => {
        try {
          const resp = await DataService.bulkDeleteBookings(selectedRowKeys, 'Bulk delete from list view');
          const { deleted = [], failed = [], undoToken, undoExpiresAt } = resp || {};
          if (deleted.length) message.success(t('common:bookings.bulk.deletedCount', { count: deleted.length }));
          if (failed.length) message.warning(t('common:bookings.bulk.failedCount', { count: failed.length }));
          setSelectedRowKeys([]);
          setLastUndo(undoToken ? { token: undoToken, expiresAt: undoExpiresAt } : null);
          fetchData();
        } catch (e) {
          logger.error('Bulk delete failed', e);
          message.error(t('common:bookings.bulk.failed'));
        }
      }
    });
  };

  const handleUndo = async () => {
    if (!lastUndo?.token) return;
    try {
      await DataService.undoDeleteBookings(lastUndo.token);
      message.success(t('common:bookings.undo.success'));
      setLastUndo(null);
      fetchData();
    } catch (e) {
      logger.error('Undo failed', e);
      message.error(t('common:bookings.undo.failed'));
    }
  };
  
  // Columns definition
  const columns = [
    {
      title: t('common:bookings.columns.dateTime'),
      key: 'datetime',
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
      width: 160,
      render: (record) => {
        const start = dayjs().startOf('day').add(record.start_hour, 'hours');
        const end = start.add(record.duration || 1, 'hours');
        return (
          <div>
            <div className="text-sm font-medium text-slate-800 whitespace-nowrap">{dayjs(record.date).format('ddd, MMM D')}</div>
            <div className="text-xs text-slate-400 whitespace-nowrap mt-0.5">{start.format('HH:mm')}–{end.format('HH:mm')} · {record.duration || 1}h</div>
          </div>
        );
      },
    },
    {
      title: t('common:bookings.columns.participant'),
      key: 'user',
      render: (record) => {
        const name = getUserName(record);
        const isGroup = isGroupBooking(record);
        const indicator = getGroupIndicator(record);
        return (
          <Tooltip title={isGroup ? getGroupBookingTooltip(record) : undefined}>
            <div className="flex items-center gap-2">
              <Avatar size={26} icon={<UserOutlined />} className="flex-shrink-0 bg-blue-100 text-blue-600" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate max-w-[130px]">{name}</div>
                {isGroup && indicator && <span className="text-[10px] text-blue-600 font-medium">{indicator}</span>}
              </div>
            </div>
          </Tooltip>
        );
      },
      sorter: (a, b) => getUserName(a).localeCompare(getUserName(b)),
    },
    {
      title: t('common:bookings.columns.instructor'),
      key: 'instructor',
      render: (record) => (
        <span className="text-sm text-slate-700 whitespace-nowrap">{getInstructorName(record)}</span>
      ),
      sorter: (a, b) => getInstructorName(a).localeCompare(getInstructorName(b)),
    },
    {
      title: t('common:bookings.columns.service'),
      dataIndex: 'service_name',
      key: 'service_name',
      render: (service) => (
        <span className="text-sm text-slate-700 max-w-[160px] truncate block" title={service || 'Lesson'}>{service || 'Lesson'}</span>
      ),
    },
    {
      title: t('common:bookings.columns.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const cfg = {
          confirmed: { dot: 'bg-blue-500',    text: 'text-blue-700',   bg: 'bg-blue-50',   label: 'Confirmed'  },
          pending:   { dot: 'bg-amber-500',   text: 'text-amber-700',  bg: 'bg-amber-50',  label: 'Pending'    },
          completed: { dot: 'bg-emerald-500', text: 'text-emerald-700',bg: 'bg-emerald-50',label: 'Completed'  },
          cancelled: { dot: 'bg-red-400',     text: 'text-red-700',    bg: 'bg-red-50',    label: 'Cancelled'  },
          booked:    { dot: 'bg-indigo-500',  text: 'text-indigo-700', bg: 'bg-indigo-50', label: 'Booked'     },
        }[status?.toLowerCase()] || { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50', label: status || 'Unknown' };
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} whitespace-nowrap`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
            {cfg.label}
          </span>
        );
      },
      filters: [
        { text: 'Confirmed', value: 'confirmed' },
        { text: 'Pending', value: 'pending' },
        { text: 'Completed', value: 'completed' },
        { text: 'Cancelled', value: 'cancelled' },
        { text: 'Booked', value: 'booked' },
      ],
      onFilter: (value, record) => (record.status || '').toLowerCase() === value,
      width: 120,
    },
    {
      title: t('common:bookings.columns.createdBy'),
      key: 'createdBy',
      render: (_, record) => {
        const label = record.createdByLabel || 'Unknown';
        const timestamp = record.createdAtFormatted;
        return (
          <Tooltip title={timestamp ? `Created ${timestamp}` : undefined} placement="top">
            <div>
              <div className="text-sm text-slate-700 whitespace-nowrap">{label}</div>
              {timestamp && <div className="text-[11px] text-slate-400 whitespace-nowrap">{timestamp}</div>}
            </div>
          </Tooltip>
        );
      },
      sorter: (a, b) => (a.createdByLabel || '').localeCompare(b.createdByLabel || ''),
      width: 155,
    },
    {
      title: '',
      key: 'actions',
      render: (record) => (
        <div className="flex items-center justify-end gap-0.5">
          <Tooltip title="View / Edit">
            <Button type="text" icon={<EditOutlined />} size="small"
              className="text-slate-400 hover:text-blue-600"
              onClick={() => { setSelectedBooking(record); setIsDetailOpen(true); }}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button type="text" icon={<DeleteOutlined />} size="small" danger
              className="text-slate-300 hover:text-red-500"
              onClick={() => handleDelete(record.id)}
            />
          </Tooltip>
        </div>
      ),
      width: 72,
      align: 'right',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50/60">
      {/* ── Header Bar ──────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3">
          <CalendarViewSwitcher
            currentView="list"
            views={['list', 'day', 'week', 'month']}
            calendarPath="/bookings/calendar"
            size="default"
          />
          <h1 className="text-lg font-bold text-slate-800 tracking-tight hidden sm:block">{t('common:bookings.listView')}</h1>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/bookings/calendar')}
            className="h-8 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 border-0 shadow-sm"
          >
            <span className="hidden sm:inline">{t('common:bookings.newBooking')}</span>
            <span className="sm:hidden">{t('common:bookings.new')}</span>
          </Button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-4">

        {/* ── Toolbar: Search + Filters ──────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Input
            placeholder={t('common:bookings.searchPlaceholder')}
            prefix={<SearchOutlined className="text-slate-400" />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            size="middle"
            className="sm:max-w-xs flex-1"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <RangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              format="MMM DD"
              allowClear
              size="middle"
              className="min-w-0"
              picker="date"
              showTime={false}
              inputReadOnly
              classNames={{ popup: { root: "booking-date-picker-dropdown" } }}
              disabledDate={(current) => current && current > dayjs().add(2, 'years')}
              placeholder={datePreset === 'all' ? [t('common:bookings.dateRange.allDates'), ''] : [t('common:bookings.dateRange.start'), t('common:bookings.dateRange.end')]}
            />
            <div className="flex items-center rounded-lg bg-slate-100/80 p-0.5 gap-0.5">
              {[
                { key: 'today', label: t('common:bookings.presets.today') },
                { key: 'week', label: t('common:bookings.presets.week') },
                { key: 'month', label: t('common:bookings.presets.month') },
                { key: 'all', label: t('common:bookings.presets.all') },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handlePresetChange(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    datePreset === key
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              size="middle"
              options={[
                { label: <BarsOutlined />, value: 'table' },
                { label: <AppstoreOutlined />, value: 'cards' }
              ]}
            />
          </div>
          {stableBookings.length > 0 && (
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap ml-auto hidden sm:block">
              {stableBookings.length} booking{stableBookings.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── Bulk Action Bar ──────────────────────────────── */}
        {selectedRowKeys.length > 1 && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200/60">
            <span className="text-sm font-medium text-blue-700">{t('common:bookings.bulk.selected', { count: selectedRowKeys.length })}</span>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>{t('common:bookings.bulk.clear')}</Button>
            <Button size="small" danger onClick={handleBulkDelete}>{t('common:bookings.bulk.deleteSelected')}</Button>
            {selectedRowKeys.length < allIds.length && (
              <Button type="link" size="small" onClick={() => setSelectedRowKeys(allIds)} icon={<CheckSquareOutlined />}>
                {t('common:bookings.bulk.selectAll', { count: allIds.length })}
              </Button>
            )}
          </div>
        )}

        {/* ── Table View ───────────────────────────────────── */}
        {viewMode === 'table' ? (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <Table
              columns={columns}
              dataSource={stableBookings}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                preserveSelectedRowKeys: true,
                columnWidth: 40,
              }}
              rowKey={buildRowKey}
              loading={{
                spinning: loading,
                indicator: (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-slate-200 border-t-blue-500" />
                    <span className="text-xs text-slate-400">{t('common:bookings.loading')}</span>
                  </div>
                )
              }}
              pagination={{
                showSizeChanger: true,
                pageSizeOptions: ['20', '50', '100', '500'],
                defaultPageSize: 20,
                showTotal: (total, range) => <span className="text-xs text-slate-400">{range[0]}–{range[1]} of {total}</span>,
                className: "px-4 pb-3 pt-2"
              }}
              scroll={{ x: 800 }}
              size="small"
              sticky={{ offsetHeader: 0 }}
              rowClassName="hover:bg-blue-50/30 transition-colors cursor-pointer"
              locale={{ emptyText: <Empty description={t('common:bookings.notFound')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              onRow={(record) => ({
                onClick: (e) => {
                  // Don't open detail when clicking action buttons or checkboxes
                  if (e.target.closest('button') || e.target.closest('.ant-checkbox-wrapper')) return;
                  setSelectedBooking(record);
                  setIsDetailOpen(true);
                }
              })}
            />
          </div>
        ) : (
          /* ── Card View ──────────────────────────────────── */
          <>
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-slate-200 border-t-blue-500" />
                <span className="text-xs text-slate-400">{t('common:bookings.loading')}</span>
              </div>
            ) : stableBookings.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 py-16 text-center">
                <Empty description={t('common:bookings.notFound')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddClick} className="mt-4">{t('common:bookings.createFirst')}</Button>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {paginatedCards.map((booking) => {
                  const start = dayjs().startOf('day').add(booking.start_hour, 'hours');
                  const end = start.add(booking.duration || 1, 'hours');
                  const statusCfg = {
                    confirmed: { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50'    },
                    pending:   { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
                    completed: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
                    cancelled: { dot: 'bg-red-400',     text: 'text-red-600',     bg: 'bg-red-50'     },
                    booked:    { dot: 'bg-indigo-500',  text: 'text-indigo-700',  bg: 'bg-indigo-50'  },
                  }[booking.status?.toLowerCase()] || { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50' };

                  return (
                    <div
                      key={buildRowKey(booking)}
                      className="bg-white rounded-xl border border-slate-200/80 p-4 hover:shadow-md hover:border-slate-300/80 transition-all cursor-pointer group"
                      onClick={() => { setSelectedBooking(booking); setIsDetailOpen(true); }}
                    >
                      {/* Top: Date + Status */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-slate-800">{dayjs(booking.date).format('ddd, MMM D')}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {booking.status || 'Unknown'}
                        </span>
                      </div>

                      {/* Participant + Instructor */}
                      <div className="flex items-center gap-2.5 mb-3">
                        <Avatar size={30} icon={<UserOutlined />} className="bg-blue-100 text-blue-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{getUserName(booking)}</div>
                          <div className="text-xs text-slate-400 truncate">{getInstructorName(booking)}</div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                        <span className="flex items-center gap-1"><CalendarOutlined className="text-blue-400" />{start.format('HH:mm')}–{end.format('HH:mm')}</span>
                        <span>{booking.duration || 1}h</span>
                      </div>

                      {/* Service */}
                      <div className="text-xs text-slate-500 truncate mb-2">
                        {booking.service_name || 'Lesson'}
                      </div>

                      {/* Actions (show on hover) */}
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pt-2 border-t border-slate-100">
                        <Tooltip title="Edit">
                          <Button type="text" size="small" icon={<EditOutlined />} className="text-slate-400 hover:text-blue-600"
                            onClick={(e) => { e.stopPropagation(); setSelectedBooking(booking); setIsDetailOpen(true); }} />
                        </Tooltip>
                        <Tooltip title="Delete">
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} className="text-slate-300 hover:text-red-500"
                            onClick={(e) => { e.stopPropagation(); handleDelete(booking.id); }} />
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
              {stableBookings.length > cardPageSize && (
                <div className="flex justify-center pt-4">
                  <Pagination
                    current={cardPage}
                    pageSize={cardPageSize}
                    total={stableBookings.length}
                    onChange={setCardPage}
                    showSizeChanger={false}
                    size="small"
                  />
                </div>
              )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Booking Detail Modal ─────────────────────────── */}
      <CalendarProvider>
        <BookingDetailModal
          isOpen={isDetailOpen}
          onClose={() => { setIsDetailOpen(false); setSelectedBooking(null); }}
          booking={selectedBooking}
          onServiceUpdate={() => {}}
        />
      </CalendarProvider>

      {/* ── Undo Toast ───────────────────────────────────── */}
      {lastUndo?.token && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-white shadow-xl rounded-2xl px-5 py-3 border border-blue-200 flex items-center gap-4 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-slate-700">{t('common:bookings.undo.deletedMessage')}</span>
            </div>
            <Button type="primary" size="small" onClick={handleUndo} className="bg-blue-500 hover:bg-blue-600 border-0 rounded-lg font-medium">
              {t('common:bookings.undo.undo')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingListView;
