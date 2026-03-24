import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, message } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import realTimeService from '@/shared/services/realTimeService';
import apiClient from '@/shared/services/apiClient';

const formatTime = (timeStr) => timeStr || 'TBD';

const formatDate = (dateStr) => {
  if (!dateStr) return 'TBD';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

const PartnerInviteModal = () => {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Also check for pending partner invites on mount (in case user missed the real-time event)
  const loadPendingInvites = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const res = await apiClient.get('/bookings/pending-partner-invites');
      const invites = res.data?.invites || [];
      if (invites.length > 0) {
        setInvite(invites[0]);
        setVisible(true);
      }
    } catch {
      // Silently fail
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const timer = setTimeout(loadPendingInvites, 2000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, user, loadPendingInvites]);

  // Listen for real-time partner invite events
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const handler = (data) => {
      setInvite(data);
      setVisible(true);
    };
    realTimeService.on('booking:partner_invite', handler);
    return () => realTimeService.off('booking:partner_invite', handler);
  }, [isAuthenticated, user]);

  const handleAccept = useCallback(async () => {
    if (!invite?.bookingId) return;
    setLoading(true);
    try {
      await apiClient.post(`/bookings/${invite.bookingId}/confirm-partner`);
      message.success('Lesson accepted! It will appear on the calendar for confirmation.');
      setVisible(false);
      setInvite(null);
      queryClient.invalidateQueries({ queryKey: ['partner-invites'] });
      queryClient.invalidateQueries({ queryKey: ['my-group-bookings'] });
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to accept invite');
    } finally {
      setLoading(false);
    }
  }, [invite]);

  const handleDecline = useCallback(async () => {
    if (!invite?.bookingId) return;
    setLoading(true);
    try {
      await apiClient.post(`/bookings/${invite.bookingId}/decline-partner`);
      message.info('Invite declined. Package hours have been refunded.');
      setVisible(false);
      setInvite(null);
      queryClient.invalidateQueries({ queryKey: ['partner-invites'] });
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to decline invite');
    } finally {
      setLoading(false);
    }
  }, [invite]);

  if (!visible || !invite) return null;

  return (
    <Modal
      open={visible}
      closable={false}
      maskClosable={false}
      keyboard={false}
      centered
      width={440}
      title={null}
      footer={null}
      styles={{
        content: { padding: 0, overflow: 'hidden', borderRadius: 12 },
        body: { padding: 0 },
        mask: { backdropFilter: 'blur(4px)' }
      }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <UserOutlined className="text-blue-500 text-lg" />
          </div>
          <div>
            <h3 className="text-gray-900 text-lg font-bold m-0">Lesson Invite</h3>
            <p className="text-gray-500 text-sm m-0">
              {invite.bookerName || 'Your friend'} wants to book a lesson with you
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-gray-100 mx-6" />

      {/* Details */}
      <div className="px-6 py-5">
        <div className="space-y-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <UserOutlined className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0 font-medium uppercase tracking-wide">Lesson</p>
              <p className="text-sm text-gray-900 font-semibold mb-0">{invite.serviceName || 'Group Lesson'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <CalendarOutlined className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0 font-medium uppercase tracking-wide">Date</p>
              <p className="text-sm text-gray-900 font-semibold mb-0">{formatDate(invite.date)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <ClockCircleOutlined className="text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0 font-medium uppercase tracking-wide">Time &amp; Duration</p>
              <p className="text-sm text-gray-900 font-semibold mb-0">
                {formatTime(invite.startTime)} &middot; {invite.duration || 1}h
              </p>
            </div>
          </div>
        </div>

        {invite.packageRemainingHours != null && (
          <p className="text-xs text-gray-400 text-center mb-4">
            {invite.duration || 1}h will be deducted from your package ({invite.packageRemainingHours}h remaining)
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            size="large"
            block
            icon={<CloseCircleOutlined />}
            loading={loading}
            onClick={handleDecline}
            className="!h-11 !rounded-xl"
          >
            Decline
          </Button>
          <Button
            type="primary"
            size="large"
            block
            icon={<CheckCircleOutlined />}
            loading={loading}
            onClick={handleAccept}
            className="!bg-gray-900 !border-gray-900 hover:!bg-gray-800 !h-11 !font-semibold !rounded-xl"
          >
            Accept
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PartnerInviteModal;
