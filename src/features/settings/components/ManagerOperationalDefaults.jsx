/**
 * ManagerOperationalDefaults
 *
 * Booking operational defaults for managers.
 * Fetches from GET /settings; saves individual keys via PUT /settings/:key.
 */

import { useState, useEffect } from 'react';
import { Card, Switch, InputNumber, Button, Typography, Divider, Spin, Tag, App } from 'antd';
import { ToolOutlined, SafetyOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Paragraph } = Typography;

export default function ManagerOperationalDefaults() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [savingBuffer, setSavingBuffer] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/settings');
        const data = res.data ?? {};
        setSettings(data);
        setBufferMinutes(data.booking_buffer_minutes ?? 0);
      } catch {
        message.error('Failed to load business settings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleToggle = async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await apiClient.put(`/settings/${key}`, { value });
    } catch {
      // Revert on failure
      setSettings((prev) => ({ ...prev, [key]: !value }));
      message.error('Failed to update setting');
    }
  };

  const handleSaveBuffer = async () => {
    setSavingBuffer(true);
    try {
      await apiClient.put('/settings/booking_buffer_minutes', { value: bufferMinutes });
      setSettings((prev) => ({ ...prev, booking_buffer_minutes: bufferMinutes }));
      message.success('Booking buffer time saved');
    } catch {
      message.error('Failed to save booking buffer time');
    } finally {
      setSavingBuffer(false);
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
      {/* ── Booking Operations ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <ToolOutlined className="text-sky-500" />
            Booking Operations
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-2">
          {/* Booking Buffer Time */}
          <div className="flex items-center justify-between py-2 flex-wrap gap-3">
            <div className="flex-1 min-w-0">
              <Text strong>Booking Buffer Time</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Minimum gap between consecutive bookings (in minutes)
              </Paragraph>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <InputNumber
                min={0}
                max={60}
                step={5}
                value={bufferMinutes}
                onChange={(val) => setBufferMinutes(val ?? 0)}
                addonAfter="min"
                style={{ width: 120 }}
              />
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveBuffer}
                loading={savingBuffer}
              >
                Save
              </Button>
            </div>
          </div>

          <Divider className="!my-2" />

          {/* Auto-confirm Trusted Customer Bookings */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Auto-confirm Trusted Customer Bookings</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Trusted customers' bookings are confirmed automatically
              </Paragraph>
            </div>
            <Switch
              checked={!!(settings.auto_confirm_trusted_customer ?? false)}
              onChange={(val) => handleToggle('auto_confirm_trusted_customer', val)}
            />
          </div>

          <Divider className="!my-2" />

          {/* Auto-assign Equipment */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Text strong>Auto-assign Equipment</Text>
              <Paragraph className="!mb-0 text-sm text-slate-500">
                Automatically assign available equipment based on student level
              </Paragraph>
            </div>
            <Switch
              checked={!!(settings.auto_assign_equipment ?? false)}
              onChange={(val) => handleToggle('auto_assign_equipment', val)}
            />
          </div>
        </div>
      </Card>

      {/* ── Safety Requirements (read-only) ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <SafetyOutlined className="text-sky-500" />
            Safety Requirements
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <Paragraph className="text-slate-500 mb-4">
          These settings are managed by your administrator.
        </Paragraph>

        <div className="flex items-center justify-between py-2">
          <div>
            <Text strong>Waiver Required</Text>
          </div>
          <Tag color={(settings.require_waiver ?? false) ? 'orange' : 'default'}>
            {(settings.require_waiver ?? false)
              ? 'Required for all students'
              : 'Optional'}
          </Tag>
        </div>
      </Card>
    </div>
  );
}
