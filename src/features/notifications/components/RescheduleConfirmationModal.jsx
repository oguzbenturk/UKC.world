import { useState, useEffect, useCallback } from 'react';
import { Modal } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserSwitchOutlined,
  CheckOutlined,
  SwapOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import {
  fetchPendingReschedules,
  confirmReschedule,
} from '../api/rescheduleApi';
import { useAuth } from '@/shared/hooks/useAuth';
import realTimeService from '@/shared/services/realTimeService';

const formatTime = (h) => {
  if (h == null) return 'TBD';
  const hr = Math.floor(Number(h));
  const min = Math.round((Number(h) - hr) * 60);
  return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'TBD';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const ChangeRow = ({ icon, label, oldValue, newValue }) => (
  <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid #f1f5f9' }}>
    <div
      className="flex items-center justify-center shrink-0 mt-0.5"
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'rgba(0, 168, 196, 0.08)',
        color: '#00a8c4',
        fontSize: 15,
      }}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-slate-400 mb-1 font-medium uppercase tracking-wider m-0">{label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-400 line-through">{oldValue}</span>
        <SwapOutlined className="text-[10px] text-slate-300" />
        <span className="text-sm text-slate-800 font-semibold">{newValue}</span>
      </div>
    </div>
  </div>
);

const RescheduleModalContent = ({ current, notifications, currentIndex, confirming, onConfirm, onConfirmAll }) => (
  <div>
    {/* Header */}
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-1">
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'rgba(0, 168, 196, 0.1)',
            border: '1px solid rgba(0, 168, 196, 0.15)',
          }}
        >
          <CalendarOutlined style={{ fontSize: 18, color: '#00a8c4' }} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800 m-0">Lesson Rescheduled</h3>
          <p className="text-xs text-slate-400 m-0 mt-0.5">
            {notifications.length > 1 ? `${currentIndex + 1} of ${notifications.length} updates` : 'Your lesson details have changed'}
          </p>
        </div>
      </div>
    </div>

    {/* Divider */}
    <div style={{ height: 1, background: '#f1f5f9', margin: '0 24px' }} />

    {/* Body */}
    <div className="px-6 py-4">
      {/* Lesson name + updater */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-md"
          style={{
            background: 'rgba(0, 168, 196, 0.08)',
            color: '#0891b2',
            border: '1px solid rgba(0, 168, 196, 0.12)',
          }}
        >
          {current.service_name || current.service_name_live || 'Lesson'}
        </span>
        {current.changed_by_name && (
          <span className="text-[11px] text-slate-400">Updated by {current.changed_by_name}</span>
        )}
      </div>

      {/* Changes */}
      <div>
        {current.old_date && current.new_date && current.old_date !== current.new_date && (
          <ChangeRow
            icon={<CalendarOutlined />}
            label="Date"
            oldValue={formatDate(current.old_date)}
            newValue={formatDate(current.new_date)}
          />
        )}
        {current.old_start_hour != null && current.new_start_hour != null &&
          Number(current.old_start_hour) !== Number(current.new_start_hour) && (
          <ChangeRow
            icon={<ClockCircleOutlined />}
            label="Time"
            oldValue={formatTime(current.old_start_hour)}
            newValue={formatTime(current.new_start_hour)}
          />
        )}
        {current.old_instructor_id !== current.new_instructor_id &&
          (current.old_instructor_name || current.new_instructor_name) && (
          <ChangeRow
            icon={<UserSwitchOutlined />}
            label="Instructor"
            oldValue={current.old_instructor_name || 'TBD'}
            newValue={current.new_instructor_name || 'TBD'}
          />
        )}
      </div>

      {current.message && (
        <p className="text-sm text-slate-500 mt-3 mb-0 leading-relaxed">{current.message}</p>
      )}
    </div>

    {/* Footer */}
    <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
      <button
        disabled={confirming}
        onClick={onConfirm}
        style={{
          width: '100%',
          height: 44,
          borderRadius: 10,
          border: 'none',
          background: '#00a8c4',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: confirming ? 'not-allowed' : 'pointer',
          opacity: confirming ? 0.7 : 1,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
        onMouseOver={(e) => { if (!confirming) e.currentTarget.style.background = '#0097b0'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = '#00a8c4'; }}
      >
        {confirming ? <LoadingOutlined /> : <CheckOutlined />}
        {notifications.length > 1 ? 'Got It — Next' : 'Got It — Confirm'}
      </button>
      {notifications.length > 1 && (
        <button
          disabled={confirming}
          onClick={onConfirmAll}
          style={{
            width: '100%',
            height: 40,
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            background: '#fff',
            color: '#64748b',
            fontSize: 13,
            fontWeight: 500,
            cursor: confirming ? 'not-allowed' : 'pointer',
            opacity: confirming ? 0.7 : 1,
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => { if (!confirming) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; } }}
          onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
          {confirming && <LoadingOutlined style={{ marginRight: 6 }} />}
          Confirm All ({notifications.length})
        </button>
      )}
    </div>
  </div>
);

const RescheduleConfirmationModal = () => {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadPending = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const pending = await fetchPendingReschedules();
      if (pending.length > 0) {
        setNotifications(pending);
        setCurrentIndex(0);
        setVisible(true);
      }
    } catch {
      // Silently fail — don't block the user
    }
  }, [isAuthenticated, user]);

  // Load on mount (first login) — with debounce to avoid showing during page load
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const timer = setTimeout(loadPending, 1500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, user, loadPending]);

  // Listen for real-time reschedule events
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const handler = () => loadPending();
    realTimeService.on('booking:rescheduled', handler);
    return () => realTimeService.off('booking:rescheduled', handler);
  }, [isAuthenticated, user, loadPending]);

  const current = notifications[currentIndex];

  const handleConfirm = useCallback(async () => {
    if (!current) return;
    setConfirming(true);
    try {
      await confirmReschedule(current.id);
      const remaining = notifications.filter((_, i) => i !== currentIndex);
      if (remaining.length === 0) {
        setVisible(false);
        setNotifications([]);
      } else {
        setNotifications(remaining);
        setCurrentIndex(Math.min(currentIndex, remaining.length - 1));
      }
    } catch {
      // Keep showing; user can try again
    } finally {
      setConfirming(false);
    }
  }, [current, notifications, currentIndex]);

  const handleConfirmAll = useCallback(async () => {
    setConfirming(true);
    try {
      // Confirm each one sequentially
      for (const notif of notifications) {
        await confirmReschedule(notif.id);
      }
      setVisible(false);
      setNotifications([]);
    } catch {
      // partial success — reload
      await loadPending();
    } finally {
      setConfirming(false);
    }
  }, [notifications, loadPending]);

  if (!visible || !current) return null;

  return (
    <Modal
      open={visible}
      closable={false}
      maskClosable={false}
      keyboard={false}
      centered
      width={420}
      title={null}
      footer={null}
      className="reschedule-confirmation-modal"
      styles={{
        body: { padding: 0 },
        content: { borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)' },
        mask: { background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(4px)' },
      }}
    >
      <RescheduleModalContent
        current={current}
        notifications={notifications}
        currentIndex={currentIndex}
        confirming={confirming}
        onConfirm={handleConfirm}
        onConfirmAll={handleConfirmAll}
      />
    </Modal>
  );
};

export default RescheduleConfirmationModal;
