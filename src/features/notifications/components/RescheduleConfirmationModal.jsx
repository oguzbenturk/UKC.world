import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Tag } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserSwitchOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
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

/** Change row: icon + label + old → new */
const ChangeRow = ({ icon, label, oldValue, newValue }) => (
  <div className="flex items-start gap-3">
    {icon}
    <div>
      <p className="text-xs text-gray-500 mb-0.5 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-400 line-through">{oldValue}</p>
      <p className="text-sm text-gray-900 font-semibold">{newValue}</p>
    </div>
  </div>
);

/** Header banner */
const RescheduleHeader = ({ count, currentIndex }) => (
  <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-5 rounded-t-lg">
    <div className="flex items-center gap-3">
      <div className="bg-white/20 rounded-full p-2">
        <InfoCircleOutlined className="text-white text-xl" />
      </div>
      <div>
        <h3 className="text-white text-lg font-bold m-0">Lesson Rescheduled</h3>
        <p className="text-white/80 text-sm m-0 mt-0.5">
          {count > 1 ? `${currentIndex + 1} of ${count} updates` : 'Your lesson details have changed'}
        </p>
      </div>
    </div>
  </div>
);

/** Changes detail panel */
const ChangesPanel = ({ current }) => {
  const hasDateChange = current.old_date && current.new_date && current.old_date !== current.new_date;
  const hasTimeChange = current.old_start_hour != null && current.new_start_hour != null &&
    Number(current.old_start_hour) !== Number(current.new_start_hour);
  const hasInstructorChange = current.old_instructor_id !== current.new_instructor_id &&
    (current.old_instructor_name || current.new_instructor_name);

  return (
    <div className="space-y-3 bg-gray-50 rounded-xl p-4">
      {hasDateChange && (
        <ChangeRow
          icon={<CalendarOutlined className="text-amber-500 text-lg mt-0.5" />}
          label="Date"
          oldValue={formatDate(current.old_date)}
          newValue={formatDate(current.new_date)}
        />
      )}
      {hasTimeChange && (
        <ChangeRow
          icon={<ClockCircleOutlined className="text-blue-500 text-lg mt-0.5" />}
          label="Time"
          oldValue={formatTime(current.old_start_hour)}
          newValue={formatTime(current.new_start_hour)}
        />
      )}
      {hasInstructorChange && (
        <ChangeRow
          icon={<UserSwitchOutlined className="text-purple-500 text-lg mt-0.5" />}
          label="Instructor"
          oldValue={current.old_instructor_name || 'TBD'}
          newValue={current.new_instructor_name || 'TBD'}
        />
      )}
    </div>
  );
};

/** Inner content rendered inside the Modal */
const RescheduleModalContent = ({ current, notifications, currentIndex, confirming, onConfirm, onConfirmAll }) => (
  <>
    <RescheduleHeader count={notifications.length} currentIndex={currentIndex} />

    <div className="px-6 py-5">
      <div className="flex items-center gap-2 mb-4">
        <Tag color="blue" className="text-sm font-medium px-3 py-0.5">
          {current.service_name || current.service_name_live || 'Lesson'}
        </Tag>
        {current.changed_by_name && (
          <span className="text-xs text-gray-400">Updated by {current.changed_by_name}</span>
        )}
      </div>

      <ChangesPanel current={current} />

      {current.message && (
        <p className="text-sm text-gray-500 mt-4 leading-relaxed">{current.message}</p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <Button
          type="primary"
          size="large"
          block
          icon={<CheckCircleOutlined />}
          loading={confirming}
          onClick={onConfirm}
          className="!bg-emerald-600 !border-emerald-600 hover:!bg-emerald-500 !h-11 !font-semibold"
        >
          {notifications.length > 1 ? 'Got It — Next' : 'Got It — Confirm'}
        </Button>
        {notifications.length > 1 && (
          <Button size="large" block loading={confirming} onClick={onConfirmAll} className="!h-10">
            Confirm All ({notifications.length})
          </Button>
        )}
      </div>
    </div>
  </>
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
      width={480}
      title={null}
      footer={null}
      className="reschedule-confirmation-modal"
      styles={{
        body: { padding: 0 },
        mask: { backdropFilter: 'blur(4px)' }
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
