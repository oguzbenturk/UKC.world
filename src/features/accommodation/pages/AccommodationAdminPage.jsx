
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button, Table, Tag, Empty, Popover, Tabs, Badge,
  Modal, Input, Skeleton, message, Tooltip,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, SearchOutlined,
  SyncOutlined, DeleteOutlined, LeftOutlined, RightOutlined,
  PlusOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import accommodationApi from '@/shared/services/accommodationApi';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import { useTranslation } from 'react-i18next';
import QuickAccommodationModal from '@/features/dashboard/components/QuickAccommodationModal';

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);

const WINDOW_DAYS = 35;
const DAY_W = 44;
const SIDEBAR_W = 180;
const ROW_H = 60;
const BAR_H = 36;
const BAR_TOP_OFFSET = (ROW_H - BAR_H) / 2;

const STATUS_CFG = {
  pending:   { antColor: 'orange', label: 'Pending',   barBg: 'rgba(251,191,36,0.12)',  barBgHover: 'rgba(251,191,36,0.22)', barFg: '#92400E', barBorder: 'rgba(217,119,6,0.25)',  barLeft: '#F59E0B' },
  confirmed: { antColor: 'blue',   label: 'Confirmed', barBg: 'rgba(37,99,235,0.09)',   barBgHover: 'rgba(37,99,235,0.17)',  barFg: '#1E3A8A', barBorder: 'rgba(37,99,235,0.22)',  barLeft: '#3B82F6' },
  completed: { antColor: 'green',  label: 'Completed', barBg: 'rgba(5,150,105,0.09)',   barBgHover: 'rgba(5,150,105,0.17)',  barFg: '#064E3B', barBorder: 'rgba(5,150,105,0.22)',  barLeft: '#10B981' },
  cancelled: { antColor: 'default',label: 'Cancelled', barBg: 'rgba(148,163,184,0.07)', barBgHover: 'rgba(148,163,184,0.14)',barFg: '#64748B', barBorder: 'rgba(148,163,184,0.2)', barLeft: '#94A3B8' },
};

function getInitials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ─── BookingBar ───────────────────────────────────────────────────────────────
function BookingBar({ booking, getUnitName, formatCurrency, onConfirm, onComplete, onCancel, onEdit, onDelete, isDeleting, left, width }) {
  const { t } = useTranslation(['manager']);
  const cfg = STATUS_CFG[booking.status] || STATUS_CFG.pending;
  const nights = dayjs(booking.check_out_date).diff(dayjs(booking.check_in_date), 'day');
  const narrow = width < 72;
  const veryNarrow = width < 36;

  const popContent = (
    <div style={{ width: 256 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', lineHeight: 1.2 }}>{booking.guest_name || 'Unknown'}</div>
          {booking.guest_email && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{booking.guest_email}</div>}
        </div>
        <Tag color={cfg.antColor} style={{ margin: 0 }}>{t(`manager:accommodation.admin.status.${booking.status}`, { defaultValue: cfg.label })}</Tag>
      </div>
      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: '#334155' }}>
          {getUnitName(booking)}
          {booking.unit_type && <span style={{ color: '#94A3B8', fontWeight: 400 }}> · {booking.unit_type}</span>}
        </div>
        <div style={{ color: '#64748B', marginTop: 3 }}>
          {dayjs(booking.check_in_date).format('D MMM')} → {dayjs(booking.check_out_date).format('D MMM')}
          <span style={{ color: '#94A3B8' }}> ({nights}n)</span>
        </div>
        {booking.total_price && (
          <div style={{ color: '#D97706', fontWeight: 700, marginTop: 3 }}>{formatCurrency(booking.total_price, 'EUR')}</div>
        )}
        {booking.package_name && (
          <div style={{ color: '#7C3AED', fontSize: 11, marginTop: 2 }}>📦 {booking.package_name}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {booking.status === 'pending' && (
          <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => onConfirm(booking.id)}>{t('manager:accommodation.admin.actions.confirm')}</Button>
        )}
        {booking.status === 'confirmed' && (
          <Button size="small" icon={<CheckCircleOutlined />} onClick={() => onComplete(booking.id)}>{t('manager:accommodation.admin.actions.complete')}</Button>
        )}
        {(booking.status === 'pending' || booking.status === 'confirmed') && (
          <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => onCancel(booking.id)}>{t('manager:accommodation.admin.actions.cancel')}</Button>
        )}
        {booking.booking_source !== 'package' && (booking.status === 'pending' || booking.status === 'confirmed') && (
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(booking)}>{t('manager:accommodation.admin.actions.edit', { defaultValue: 'Edit' })}</Button>
        )}
        <Button size="small" danger icon={<DeleteOutlined />} loading={isDeleting} onClick={() => onDelete(booking.id)}>{t('manager:accommodation.admin.actions.delete')}</Button>
      </div>
    </div>
  );

  return (
    <Popover content={popContent} trigger="click" placement="top" arrow={{ pointAtCenter: true }}>
      <div
        style={{
          position: 'absolute',
          left: left + 2,
          width: Math.max(width - 4, 8),
          top: BAR_TOP_OFFSET,
          height: BAR_H,
          background: cfg.barBg,
          borderRadius: 6,
          border: `1px solid ${cfg.barBorder}`,
          borderLeft: `3px solid ${cfg.barLeft}`,
          display: 'flex', alignItems: 'center',
          paddingLeft: veryNarrow ? 2 : narrow ? 5 : 8,
          paddingRight: veryNarrow ? 2 : narrow ? 4 : 8,
          cursor: 'pointer', overflow: 'hidden', gap: 5, zIndex: 2,
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          transition: 'background 0.12s, transform 0.1s, box-shadow 0.1s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = cfg.barBgHover;
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = cfg.barBg;
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
        }}
      >
        {!veryNarrow && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: cfg.barLeft, flexShrink: 0, opacity: 0.8,
          }} />
        )}
        {!veryNarrow && (
          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: cfg.barFg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
              {narrow ? getInitials(booking.guest_name) : (booking.guest_name?.split(' ')[0] || 'Guest')}
            </div>
            {!narrow && nights > 0 && (
              <div style={{ fontSize: 9, color: cfg.barFg, opacity: 0.55, whiteSpace: 'nowrap', lineHeight: 1.2, marginTop: 1 }}>
                {nights}n · {dayjs(booking.check_in_date).format('D MMM')}
              </div>
            )}
          </div>
        )}
      </div>
    </Popover>
  );
}

// ─── TimelineView ─────────────────────────────────────────────────────────────
function TimelineView({ filteredBookings, allBookings, units, windowStart, getUnitName, formatCurrency, onConfirm, onComplete, onCancel, onEdit, onDelete, deletingIds }) {
  const { t } = useTranslation(['manager']);
  const today = dayjs().startOf('day');
  const todayColOffset = today.diff(windowStart, 'day');

  const unitRows = useMemo(() => {
    const seen = new Set();
    const rows = [];
    units.forEach(u => {
      const name = u.name || u.type || `Unit ${u.id}`;
      if (!seen.has(name)) { seen.add(name); rows.push({ name, type: u.type }); }
    });
    allBookings.forEach(b => {
      const name = getUnitName(b);
      if (!seen.has(name)) { seen.add(name); rows.push({ name, type: b.unit_type }); }
    });
    return rows;
  }, [units, allBookings, getUnitName]);

  const barsByUnit = useMemo(() => {
    const map = new Map();
    filteredBookings.forEach(b => {
      const name = getUnitName(b);
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(b);
    });
    return map;
  }, [filteredBookings, getUnitName]);

  const days = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => windowStart.add(i, 'day')), [windowStart]);

  const monthGroups = useMemo(() => {
    const groups = [];
    let cur = null;
    days.forEach(day => {
      const m = day.format('MMM YYYY');
      if (!cur || cur.label !== m) { cur = { label: m, count: 1 }; groups.push(cur); }
      else cur.count++;
    });
    return groups;
  }, [days]);

  const getBarProps = useCallback((booking) => {
    const ciOffset = dayjs(booking.check_in_date).startOf('day').diff(windowStart, 'day');
    const coOffset = dayjs(booking.check_out_date).startOf('day').diff(windowStart, 'day');
    const s = Math.max(0, ciOffset), e = Math.min(WINDOW_DAYS, coOffset);
    if (e <= s) return null;
    return { left: s * DAY_W, width: (e - s) * DAY_W };
  }, [windowStart]);

  if (unitRows.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 80, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
        <div style={{ fontSize: 15, color: '#64748B' }}>{t('manager:accommodation.admin.noUnits')}</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8EEF4', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: SIDEBAR_W + WINDOW_DAYS * DAY_W }}>

          {/* Month row */}
          <div style={{ display: 'flex', borderBottom: '1px solid #EDF2F7', background: '#F5F7FA' }}>
            <div style={{ width: SIDEBAR_W, flexShrink: 0, borderRight: '1px solid #EDF2F7' }} />
            {monthGroups.map((g, i) => (
              <div key={i} style={{ width: g.count * DAY_W, padding: '5px 12px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', borderRight: '1px solid #EDF2F7', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {g.label}
              </div>
            ))}
          </div>

          {/* Day header */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', position: 'sticky', top: 0, zIndex: 6, boxShadow: '0 1px 0 #E2E8F0' }}>
            <div style={{ width: SIDEBAR_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', padding: '7px 16px', fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center' }}>
              {t('manager:accommodation.admin.unitRoom')}
            </div>
            {days.map((day, i) => {
              const isToday = day.isSame(today, 'day');
              const isWeekend = day.day() === 0 || day.day() === 6;
              return (
                <div key={i} style={{
                  width: DAY_W, flexShrink: 0, textAlign: 'center', padding: '5px 0 6px',
                  fontSize: 11, fontWeight: isToday ? 800 : 400,
                  color: isToday ? '#0284C7' : isWeekend ? '#B0BEC5' : '#64748B',
                  background: isToday ? 'rgba(2,132,199,0.07)' : 'transparent',
                  borderRight: `1px solid ${isToday ? 'rgba(2,132,199,0.12)' : '#F0F4F8'}`,
                  position: 'relative',
                }}>
                  <div style={{ letterSpacing: isToday ? '-0.01em' : 0 }}>{day.format('D')}</div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', marginTop: 1, letterSpacing: '0.04em', opacity: isToday ? 0.9 : 0.6 }}>{day.format('dd')}</div>
                  {isToday && <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 18, height: 2, borderRadius: 1, background: '#0284C7' }} />}
                </div>
              );
            })}
          </div>

          {/* Unit rows */}
          {unitRows.map((unit, idx) => {
            const bars = barsByUnit.get(unit.name) || [];
            const isEven = idx % 2 === 0;
            const rowBg = isEven ? '#ffffff' : '#FAFBFD';
            return (
              <div key={unit.name} style={{ display: 'flex', borderBottom: '1px solid #F0F4F8', minHeight: ROW_H, background: rowBg }}>
                <div style={{
                  width: SIDEBAR_W, flexShrink: 0, padding: '0 16px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  borderRight: '1px solid #E8EEF4', position: 'sticky', left: 0, zIndex: 4,
                  background: rowBg,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', lineHeight: 1.3 }}>{unit.name}</div>
                  {unit.type && <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'capitalize', marginTop: 2, letterSpacing: '0.02em' }}>{unit.type}</div>}
                </div>

                <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
                  {days.map((day, i) => {
                    const isToday = day.isSame(today, 'day');
                    const isWeekend = day.day() === 0 || day.day() === 6;
                    return (
                      <div key={i} style={{
                        width: DAY_W, flexShrink: 0, height: ROW_H,
                        borderRight: `1px solid ${isToday ? 'rgba(2,132,199,0.12)' : '#F0F4F8'}`,
                        background: isToday ? 'rgba(2,132,199,0.05)' : isWeekend ? 'rgba(241,245,249,0.6)' : 'transparent',
                      }} />
                    );
                  })}

                  {todayColOffset >= 0 && todayColOffset < WINDOW_DAYS && (
                    <div style={{
                      position: 'absolute',
                      left: todayColOffset * DAY_W + DAY_W / 2 - 1,
                      top: 0, bottom: 0, width: 2,
                      background: 'rgba(2,132,199,0.25)',
                      pointerEvents: 'none', zIndex: 1,
                    }} />
                  )}

                  {bars.map(booking => {
                    const bp = getBarProps(booking);
                    if (!bp) return null;
                    return (
                      <BookingBar key={booking.id} booking={booking}
                        getUnitName={getUnitName} formatCurrency={formatCurrency}
                        onConfirm={onConfirm} onComplete={onComplete}
                        onCancel={onCancel} onEdit={onEdit} onDelete={onDelete}
                        isDeleting={deletingIds.has(booking.id)}
                        left={bp.left} width={bp.width}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, padding: '9px 16px', borderTop: '1px solid #F0F4F8', background: '#FAFBFD', flexWrap: 'wrap', alignItems: 'center' }}>
            {Object.entries(STATUS_CFG).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B' }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: v.barBg, border: `1px solid ${v.barBorder}`, borderLeft: `3px solid ${v.barLeft}` }} />
                {t(`manager:accommodation.admin.status.${k}`, { defaultValue: v.label })}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94A3B8' }}>
              <div style={{ width: 2, height: 12, borderRadius: 1, background: 'rgba(2,132,199,0.4)' }} />
              {t('manager:accommodation.admin.today')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function AccommodationAdminPage() {
  const { t } = useTranslation(['manager']);
  usePageSEO({ title: 'Stay Bookings | Calendar', description: 'View accommodation bookings and room status' });

  const { formatCurrency } = useCurrency();
  const [bookings, setBookings] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState('timeline');
  const [windowStart, setWindowStart] = useState(() => dayjs().subtract(7, 'day').startOf('day'));
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

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
      message.error(t('manager:accommodation.admin.messages.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const stats = useMemo(() => {
    const today = dayjs();
    const activeBookings = bookings.filter(b => {
      const ci = dayjs(b.check_in_date), co = dayjs(b.check_out_date);
      return b.status !== 'cancelled' && ci.isSameOrBefore(today, 'day') && co.isAfter(today, 'day');
    });
    const pendingBookings = bookings.filter(b => b.status === 'pending');
    const hotelRequests = bookings.filter(b => {
      const cat = (b.unit_category || '').toLowerCase(), uType = (b.unit_type || '').toLowerCase();
      return (cat === 'hotel' || (cat === '' && uType === 'room')) && b.status === 'pending';
    });
    const upcomingBookings = bookings.filter(b => b.status === 'confirmed' && dayjs(b.check_in_date).isAfter(today, 'day'));
    const revenue = bookings.filter(b => b.status === 'completed').reduce((s, b) => s + (parseFloat(b.total_price) || 0), 0);
    return { activeCount: activeBookings.length, pendingCount: pendingBookings.length, hotelRequestsCount: hotelRequests.length, upcomingCount: upcomingBookings.length, revenue, activeBookings, pendingBookings, hotelRequests, upcomingBookings };
  }, [bookings]);

  const unitMap = useMemo(() => {
    const map = {};
    units.forEach(u => { map[u.id] = u.name || u.type || 'Unit'; });
    return map;
  }, [units]);

  const getUnitName = useCallback((record) => {
    if (record.unit_name) return record.unit_name;
    if (record.accommodation_unit_name) return record.accommodation_unit_name;
    if (record.unit_id && unitMap[record.unit_id]) return unitMap[record.unit_id];
    return t('manager:accommodation.admin.unassigned');
  }, [unitMap]);

  const handleConfirmBooking = async (id) => {
    try { await accommodationApi.confirmBooking(id); message.success(t('manager:accommodation.admin.messages.confirmed')); loadBookings(); }
    catch { message.error(t('manager:accommodation.admin.messages.confirmError')); }
  };
  const handleCompleteBooking = async (id) => {
    try { await accommodationApi.completeBooking(id); message.success(t('manager:accommodation.admin.messages.completed')); loadBookings(); }
    catch { message.error(t('manager:accommodation.admin.messages.completeError')); }
  };
  const handleCancelBooking = async (id) => {
    try { await accommodationApi.cancelBooking(id); message.success(t('manager:accommodation.admin.messages.cancelled')); loadBookings(); }
    catch { message.error(t('manager:accommodation.admin.messages.cancelError')); }
  };
  const handleEditBooking = (booking) => {
    setEditingBooking(booking);
  };
  const handleDeleteBooking = (id) => {
    Modal.confirm({
      title: t('manager:accommodation.admin.deleteConfirm.title'),
      content: t('manager:accommodation.admin.deleteConfirm.content'),
      okText: t('manager:accommodation.admin.deleteConfirm.ok'), okType: 'danger',
      onOk: async () => {
        if (deletingIds.has(id)) return;
        setDeletingIds(prev => new Set(prev).add(id));
        try {
          await accommodationApi.deleteBooking(id);
          message.success(t('manager:accommodation.admin.messages.deleted'));
          await loadBookings();
        } catch (err) {
          const s = err?.response?.status;
          if (s === 404) message.warning(t('manager:accommodation.admin.messages.notFound'));
          else if (s === 403) message.error(t('manager:accommodation.admin.messages.unauthorized'));
          else message.error(t('manager:accommodation.admin.messages.deleteError'));
        } finally {
          setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        }
      }
    });
  };

  const filteredBookings = useMemo(() => {
    let result;
    switch (activeTab) {
      case 'active':        result = stats.activeBookings; break;
      case 'pending':       result = stats.pendingBookings; break;
      case 'hotel_requests':result = stats.hotelRequests; break;
      case 'upcoming':      result = stats.upcomingBookings; break;
      case 'completed':     result = bookings.filter(b => b.status === 'completed'); break;
      default:              result = bookings;
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
  }, [activeTab, searchText, bookings, stats, getUnitName]);

  const columns = [
    {
      title: t('manager:accommodation.admin.columns.guest'), key: 'guest', width: 180,
      sorter: (a, b) => (a.guest_name || '').localeCompare(b.guest_name || ''),
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: '#0F172A' }}>
            {r.guest_name || 'Unknown'}
            {r.booking_source === 'package' && <Tag color="purple" bordered={false} style={{ borderRadius: 20, fontSize: 9, padding: '0 5px', lineHeight: '16px', margin: 0 }}>PKG</Tag>}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{r.guest_email}</div>
          {r.package_name && <div style={{ fontSize: 10, color: '#7C3AED', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{r.package_name}</div>}
        </div>
      ),
    },
    {
      title: t('manager:accommodation.admin.columns.unit'), key: 'unit', width: 160,
      sorter: (a, b) => getUnitName(a).localeCompare(getUnitName(b)),
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>{getUnitName(r)}</div>
          {r.unit_type && <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'capitalize' }}>{r.unit_type}</div>}
        </div>
      ),
    },
    {
      title: t('manager:accommodation.admin.columns.checkIn'), dataIndex: 'check_in_date', width: 100,
      sorter: (a, b) => dayjs(a.check_in_date).diff(dayjs(b.check_in_date)),
      render: d => <span style={{ fontSize: 13, color: '#334155' }}>{dayjs(d).format('D MMM YY')}</span>,
    },
    {
      title: t('manager:accommodation.admin.columns.checkOut'), dataIndex: 'check_out_date', width: 100,
      render: d => <span style={{ fontSize: 13, color: '#334155' }}>{dayjs(d).format('D MMM YY')}</span>,
    },
    {
      title: t('manager:accommodation.admin.columns.nights'), key: 'nights', width: 70, align: 'center',
      sorter: (a, b) => dayjs(a.check_out_date).diff(dayjs(a.check_in_date), 'day') - dayjs(b.check_out_date).diff(dayjs(b.check_in_date), 'day'),
      render: (_, r) => <span style={{ fontWeight: 600, color: '#334155' }}>{dayjs(r.check_out_date).diff(dayjs(r.check_in_date), 'day')}</span>,
    },
    {
      title: t('manager:accommodation.admin.columns.total'), dataIndex: 'total_price', width: 100,
      sorter: (a, b) => (parseFloat(a.total_price) || 0) - (parseFloat(b.total_price) || 0),
      render: p => <span style={{ fontWeight: 700, color: '#D97706' }}>{formatCurrency(p, 'EUR')}</span>,
    },
    {
      title: t('manager:accommodation.admin.columns.status'), dataIndex: 'status', width: 110,
      render: s => { const c = STATUS_CFG[s] || STATUS_CFG.pending; return <Tag color={c.antColor}>{t(`manager:accommodation.admin.status.${s}`, { defaultValue: c.label })}</Tag>; },
    },
    {
      title: '', key: 'actions', width: 140,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {r.status === 'pending' && <Tooltip title={t('manager:accommodation.admin.actions.confirm')}><Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => handleConfirmBooking(r.id)} /></Tooltip>}
          {r.status === 'confirmed' && <Tooltip title={t('manager:accommodation.admin.actions.complete')}><Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleCompleteBooking(r.id)} /></Tooltip>}
          {(r.status === 'pending' || r.status === 'confirmed') && <Tooltip title={t('manager:accommodation.admin.actions.cancel')}><Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleCancelBooking(r.id)} /></Tooltip>}
          {r.booking_source !== 'package' && (r.status === 'pending' || r.status === 'confirmed') && <Tooltip title={t('manager:accommodation.admin.actions.edit', { defaultValue: 'Edit' })}><Button size="small" icon={<EditOutlined />} onClick={() => handleEditBooking(r)} /></Tooltip>}
          <Tooltip title={t('manager:accommodation.admin.actions.delete')}><Button size="small" danger loading={deletingIds.has(r.id)} disabled={deletingIds.has(r.id)} icon={<DeleteOutlined />} onClick={() => handleDeleteBooking(r.id)} /></Tooltip>
        </div>
      ),
    },
  ];

  const tabItems = [
    { key: 'all', label: t('manager:accommodation.admin.tabs.all', { count: bookings.length }) },
    { key: 'active', label: <span>{t('manager:accommodation.admin.tabs.active')} {stats.activeCount > 0 && <Badge count={stats.activeCount} style={{ marginLeft: 4 }} />}</span> },
    { key: 'pending', label: <span>{t('manager:accommodation.admin.tabs.pending')} {stats.pendingCount > 0 && <Badge count={stats.pendingCount} style={{ marginLeft: 4 }} />}</span> },
    { key: 'hotel_requests', label: <span>{t('manager:accommodation.admin.tabs.hotelRequests')} {stats.hotelRequestsCount > 0 && <Badge count={stats.hotelRequestsCount} style={{ marginLeft: 4, backgroundColor: '#f59e0b' }} />}</span> },
    { key: 'upcoming', label: t('manager:accommodation.admin.tabs.upcoming') },
    { key: 'completed', label: t('manager:accommodation.admin.tabs.completed') },
  ];

  if (loading) return <div style={{ padding: 32 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", padding: '24px 24px 40px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {t('manager:accommodation.admin.pageTitle')}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>{t('manager:accommodation.admin.pageSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#E2E8F0', borderRadius: 8, padding: 2, gap: 2 }}>
            {[{ key: 'timeline', label: `⊟ ${t('manager:accommodation.admin.timeline')}` }, { key: 'list', label: `≡ ${t('manager:accommodation.admin.list')}` }].map(v => (
              <button key={v.key} onClick={() => setViewMode(v.key)} style={{
                padding: '5px 12px', border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: viewMode === v.key ? '#fff' : 'transparent',
                color: viewMode === v.key ? '#0284C7' : '#64748B',
                boxShadow: viewMode === v.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
              }}>{v.label}</button>
            ))}
          </div>
          <Button icon={<SyncOutlined />} onClick={loadBookings} style={{ borderRadius: 8 }}>{t('manager:accommodation.admin.refresh')}</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setNewBookingOpen(true)}
            style={{ borderRadius: 8, background: '#0284C7', borderColor: '#0284C7' }}
          >
            {t('manager:accommodation.admin.newBooking')}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: t('manager:accommodation.admin.stats.inHouse'),  value: stats.activeCount,                    sub: t('manager:accommodation.admin.stats.inHouseSub'),    accent: '#0284C7', bg: 'rgba(2,132,199,0.06)',   icon: '🏠' },
          { label: t('manager:accommodation.admin.stats.pending'),   value: stats.pendingCount,                   sub: t('manager:accommodation.admin.stats.pendingSub'),     accent: '#D97706', bg: 'rgba(217,119,6,0.06)',   icon: '⏳' },
          { label: t('manager:accommodation.admin.stats.upcoming'),  value: stats.upcomingCount,                  sub: t('manager:accommodation.admin.stats.upcomingSub'),    accent: '#059669', bg: 'rgba(5,150,105,0.06)',   icon: '📅' },
          { label: t('manager:accommodation.admin.stats.revenue'),   value: formatCurrency(stats.revenue, 'EUR'), sub: t('manager:accommodation.admin.stats.revenueSub'), accent: '#7C3AED', bg: 'rgba(124,58,237,0.06)', icon: '💰' },
        ].map(s => (
          <div key={s.label} style={{
            flex: '1 1 140px', background: '#fff', borderRadius: 12, padding: '14px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.accent, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{s.value}</div>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{s.icon}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '4px 16px 0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ flex: 1, minWidth: 0 }} />
        <Input
          placeholder={t('manager:accommodation.admin.searchPlaceholder')}
          prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          allowClear
          style={{ width: 220, borderRadius: 8, marginBottom: 8, flexShrink: 0 }}
        />
      </div>

      {/* Timeline navigation */}
      {viewMode === 'timeline' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Button size="small" icon={<LeftOutlined />} onClick={() => setWindowStart(d => d.subtract(7, 'day'))} style={{ borderRadius: 6 }}>{t('manager:accommodation.admin.prevWeek')}</Button>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            {windowStart.format('D MMM')} – {windowStart.add(WINDOW_DAYS - 1, 'day').format('D MMM YYYY')}
          </span>
          <Button size="small" icon={<RightOutlined />} onClick={() => setWindowStart(d => d.add(7, 'day'))} style={{ borderRadius: 6 }}>{t('manager:accommodation.admin.nextWeek')}</Button>
          <Button size="small" onClick={() => setWindowStart(dayjs().subtract(7, 'day').startOf('day'))} style={{ borderRadius: 6, fontSize: 11, color: '#0284C7', borderColor: '#BAE6FD' }}>
            {t('manager:accommodation.admin.jumpToday')}
          </Button>
          <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 4 }}>
            · {t('manager:accommodation.admin.bookingsShown', { count: filteredBookings.length })}
          </span>
        </div>
      )}

      {/* Content */}
      {viewMode === 'timeline' ? (
        <TimelineView
          filteredBookings={filteredBookings}
          allBookings={bookings}
          units={units}
          windowStart={windowStart}
          getUnitName={getUnitName}
          formatCurrency={formatCurrency}
          onConfirm={handleConfirmBooking}
          onComplete={handleCompleteBooking}
          onCancel={handleCancelBooking}
          onEdit={handleEditBooking}
          onDelete={handleDeleteBooking}
          deletingIds={deletingIds}
        />
      ) : (
        <UnifiedTable density="comfortable">
          <Table
            rowKey="id"
            dataSource={filteredBookings}
            columns={columns}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: total => t('manager:accommodation.admin.pagination.showTotal', { count: total }) }}
            scroll={{ x: 900 }}
            size="middle"
            locale={{ emptyText: <Empty description={t('manager:accommodation.admin.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </UnifiedTable>
      )}

      {newBookingOpen && (
        <QuickAccommodationModal
          open={newBookingOpen}
          onClose={() => setNewBookingOpen(false)}
          onSuccess={() => {
            setNewBookingOpen(false);
            loadBookings();
          }}
        />
      )}

      {editingBooking && (
        <QuickAccommodationModal
          open={!!editingBooking}
          editBooking={editingBooking}
          onClose={() => setEditingBooking(null)}
          onSuccess={() => {
            setEditingBooking(null);
            loadBookings();
          }}
        />
      )}
    </div>
  );
}

export default AccommodationAdminPage;
