/**
 * InstructorNotificationSettings
 *
 * Notification preferences for instructors.
 * Fetches from GET /notifications/settings; auto-saves on toggle via PUT.
 */

import { useState, useEffect } from 'react';
import { Card, Switch, Typography, Divider, Spin, App } from 'antd';
import {
  BellOutlined,
  CloudOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Paragraph } = Typography;

const DEFAULT_SETTINGS = {
  new_booking_alerts: false,
  booking_updates: false,
  student_checkin_alerts: false,
  schedule_change_alerts: false,
  weather_alerts: false,
  daily_schedule_summary: false,
  email_notifications: false,
  push_notifications: false,
};

export default function InstructorNotificationSettings() {
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
      {/* ── Booking Notifications ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <BellOutlined className="text-sky-500" />
            Booking Notifications
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
                Get notified when a new lesson is booked for you
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.new_booking_alerts}
              onChange={(val) => handleToggle('new_booking_alerts', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Booking Cancellation Alerts */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Booking Cancellation Alerts</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Get notified when a student cancels a lesson
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.booking_updates}
              onChange={(val) => handleToggle('booking_updates', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Student Check-in Alerts */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Student Check-in Alerts</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Get notified when a student checks in for their lesson
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.student_checkin_alerts}
              onChange={(val) => handleToggle('student_checkin_alerts', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Schedule Change Alerts */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Schedule Change Alerts</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Get notified when your schedule is modified by management
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.schedule_change_alerts}
              onChange={(val) => handleToggle('schedule_change_alerts', val)}
            />
          </div>
        </div>
      </Card>

      {/* ── Operations Notifications ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <CloudOutlined className="text-sky-500" />
            Operations Notifications
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-2">
          {/* Weather Alerts */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Weather Alerts</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Receive weather condition alerts affecting your lessons
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.weather_alerts}
              onChange={(val) => handleToggle('weather_alerts', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Daily Schedule Summary */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Daily Schedule Summary</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Receive a summary of tomorrow's lessons each evening
              </Paragraph>
            </div>
            <Switch
              checked={!!settings.daily_schedule_summary}
              onChange={(val) => handleToggle('daily_schedule_summary', val)}
            />
          </div>
        </div>
      </Card>

      {/* ── Delivery Channels ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <GlobalOutlined className="text-sky-500" />
            Delivery Channels
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-2">
          {/* Email */}
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

          {/* Push */}
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
