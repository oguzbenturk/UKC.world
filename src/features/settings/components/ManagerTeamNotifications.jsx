/**
 * ManagerTeamNotifications
 *
 * Team activity and delivery notification preferences for managers.
 * Fetches from GET /notifications/settings; auto-saves on toggle via PUT.
 */

import { useState, useEffect } from 'react';
import { Card, Switch, Typography, Divider, Spin, App } from 'antd';
import { TeamOutlined, BellOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Paragraph } = Typography;

const DEFAULT_SETTINGS = {
  new_booking_alerts: false,
  staff_alerts: false,
  daily_ops_summary: false,
  support_ticket_alerts: false,
  email_notifications: false,
  push_notifications: false,
};

export default function ManagerTeamNotifications() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/notifications/settings');
        if (res.data) {
          setSettings((prev) => ({ ...prev, ...res.data }));
        }
      } catch {
        message.error('Failed to load notification settings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleToggle = async (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await apiClient.put('/notifications/settings', updated);
    } catch {
      // Revert on failure
      setSettings((prev) => ({ ...prev, [key]: !value }));
      message.error('Failed to update notification setting');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Team Activity Notifications ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <TeamOutlined className="text-sky-500" />
            Team Activity Notifications
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-2">
          {/* New Booking Alerts */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>New Booking Alerts</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Get notified when a new booking is created
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.new_booking_alerts}
              onChange={(val) => handleToggle('new_booking_alerts', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Instructor Time-Off Requests */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Instructor Time-Off Requests</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Instructor time-off requests and system warnings
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.staff_alerts}
              onChange={(val) => handleToggle('staff_alerts', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Daily Operations Summary */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Daily Operations Summary</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Receive a daily summary of bookings, attendance, and operations
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.daily_ops_summary}
              onChange={(val) => handleToggle('daily_ops_summary', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Support Ticket Alerts */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Support Ticket Alerts</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Get notified when a new support ticket is raised
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.support_ticket_alerts}
              onChange={(val) => handleToggle('support_ticket_alerts', val)}
            />
          </div>
        </div>
      </Card>

      {/* ── Delivery Preferences ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <BellOutlined className="text-sky-500" />
            Delivery Preferences
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-2">
          {/* Email Notifications */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Email Notifications</Text>
            </div>
            <Switch
              checked={!!settings.email_notifications}
              onChange={(val) => handleToggle('email_notifications', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Push Notifications */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Push Notifications</Text>
            </div>
            <Switch
              checked={!!settings.push_notifications}
              onChange={(val) => handleToggle('push_notifications', val)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
