/**
 * StudentBookingPreferences
 *
 * Student-facing booking preferences card.
 * Fetches from GET /student/booking-preferences and saves via PUT.
 * Booking reminder switches use GET/PUT /notifications/settings (auto-save on toggle).
 */

import { useState, useEffect } from 'react';
import { Card, Form, Select, Switch, Button, Typography, Divider, Spin, App } from 'antd';
import { CalendarOutlined, BellOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Paragraph } = Typography;

export default function StudentBookingPreferences({ isTrustedCustomer = false }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    preferred_discipline: null,
    preferred_lesson_type: null,
    preferred_duration: null,
    preferred_time_slot: null,
    pay_at_center_default: false,
  });
  const [notifSettings, setNotifSettings] = useState({
    booking_reminder_24h: false,
    booking_reminder_1h: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [prefsRes, notifRes] = await Promise.all([
          apiClient.get('/student/booking-preferences'),
          apiClient.get('/notifications/settings'),
        ]);
        if (prefsRes.data) {
          setPrefs(prev => ({ ...prev, ...prefsRes.data }));
        }
        if (notifRes.data) {
          setNotifSettings(prev => ({
            ...prev,
            booking_reminder_24h: notifRes.data.booking_reminder_24h ?? false,
            booking_reminder_1h: notifRes.data.booking_reminder_1h ?? false,
          }));
        }
      } catch {
        message.error('Failed to load booking preferences');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const updatePref = (key, value) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/student/booking-preferences', prefs);
      message.success('Booking preferences saved');
    } catch {
      message.error('Failed to save booking preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleReminderToggle = async (key, value) => {
    const updated = { ...notifSettings, [key]: value };
    setNotifSettings(updated);
    try {
      await apiClient.put('/notifications/settings', updated);
      message.success('Reminder setting updated');
    } catch {
      setNotifSettings(prev => ({ ...prev, [key]: !value }));
      message.error('Failed to update reminder setting');
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
      {/* Booking Preferences Card */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <CalendarOutlined className="text-sky-500" />
            Booking Preferences
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-5">
          {/* Preferred Discipline */}
          <div>
            <Text strong className="block mb-1">Preferred Discipline</Text>
            <Paragraph className="!mb-2 text-sm text-slate-500">
              Your default watersport discipline for new bookings
            </Paragraph>
            <Select
              value={prefs.preferred_discipline || undefined}
              onChange={val => updatePref('preferred_discipline', val)}
              placeholder="Select discipline"
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="kite">Kite</Select.Option>
              <Select.Option value="wing">Wing</Select.Option>
              <Select.Option value="kite_foil">Kite Foil</Select.Option>
              <Select.Option value="e_foil">E-Foil</Select.Option>
            </Select>
          </div>

          <Divider className="!my-3" />

          {/* Preferred Lesson Type */}
          <div>
            <Text strong className="block mb-1">Preferred Lesson Type</Text>
            <Paragraph className="!mb-2 text-sm text-slate-500">
              Your default lesson format
            </Paragraph>
            <Select
              value={prefs.preferred_lesson_type || undefined}
              onChange={val => updatePref('preferred_lesson_type', val)}
              placeholder="Select lesson type"
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="private">Private</Select.Option>
              <Select.Option value="semi_private">Semi-Private</Select.Option>
              <Select.Option value="group">Group</Select.Option>
              <Select.Option value="supervision">Supervision</Select.Option>
            </Select>
          </div>

          <Divider className="!my-3" />

          {/* Preferred Session Duration */}
          <div>
            <Text strong className="block mb-1">Preferred Session Duration</Text>
            <Paragraph className="!mb-2 text-sm text-slate-500">
              Your preferred lesson length
            </Paragraph>
            <Select
              value={prefs.preferred_duration || undefined}
              onChange={val => updatePref('preferred_duration', val)}
              placeholder="Select duration"
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value={60}>60 min (1h)</Select.Option>
              <Select.Option value={90}>90 min (1.5h)</Select.Option>
              <Select.Option value={120}>120 min (2h)</Select.Option>
              <Select.Option value={150}>150 min (2.5h)</Select.Option>
              <Select.Option value={180}>180 min (3h)</Select.Option>
            </Select>
          </div>

          <Divider className="!my-3" />

          {/* Preferred Time of Day */}
          <div>
            <Text strong className="block mb-1">Preferred Time of Day</Text>
            <Paragraph className="!mb-2 text-sm text-slate-500">
              When you prefer to have lessons
            </Paragraph>
            <Select
              value={prefs.preferred_time_slot || undefined}
              onChange={val => updatePref('preferred_time_slot', val)}
              placeholder="Select time preference"
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="morning">Morning</Select.Option>
              <Select.Option value="afternoon">Afternoon</Select.Option>
              <Select.Option value="evening">Evening</Select.Option>
              <Select.Option value="any">Any</Select.Option>
            </Select>
          </div>

          {/* Trusted Customer: Pay at Center Default */}
          {isTrustedCustomer && (
            <>
              <Divider className="!my-3" />
              <div className="flex items-center justify-between py-2">
                <div>
                  <Text strong>Default to Pay at Center</Text>
                  <Paragraph className="!mb-0 text-sm text-slate-500">
                    Automatically select pay at center when booking
                  </Paragraph>
                </div>
                <Switch
                  checked={!!prefs.pay_at_center_default}
                  onChange={val => updatePref('pay_at_center_default', val)}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end mt-5">
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            Save
          </Button>
        </div>
      </Card>

      {/* Booking Reminders Card */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <BellOutlined className="text-sky-500" />
            Booking Reminders
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>24h Reminder</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Get a reminder 24 hours before your lesson
              </Paragraph>
            </div>
            <Switch
              checked={!!notifSettings.booking_reminder_24h}
              onChange={val => handleReminderToggle('booking_reminder_24h', val)}
            />
          </div>
          <Divider className="!my-3" />
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>1h Reminder</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Get a reminder 1 hour before your lesson
              </Paragraph>
            </div>
            <Switch
              checked={!!notifSettings.booking_reminder_1h}
              onChange={val => handleReminderToggle('booking_reminder_1h', val)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
