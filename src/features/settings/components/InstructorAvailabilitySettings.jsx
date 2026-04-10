/**
 * InstructorAvailabilitySettings
 *
 * Two sections:
 *   A) Weekly Working Hours — GET/PUT /instructors/me/working-hours
 *   B) Time-Off Requests   — via useInstructorAvailability hook
 */

import { useState, useEffect } from 'react';
import {
  Card,
  Switch,
  Select,
  Button,
  Typography,
  Divider,
  Spin,
  Modal,
  App,
  Badge,
  DatePicker,
  Input,
  Tag,
} from 'antd';
import {
  CalendarOutlined,
  PlusOutlined,
  CloseOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useInstructorAvailability } from '@/features/instructor/hooks/useInstructorAvailability';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

// ── helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Generate time options every 30 min from 06:00 to 22:00 */
const TIME_OPTIONS = (() => {
  const options = [];
  for (let h = 6; h <= 22; h++) {
    options.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 22) options.push(`${String(h).padStart(2, '0')}:30`);
  }
  return options;
})();

const DEFAULT_HOURS = DAY_LABELS.map((_, dayIndex) => ({
  day_of_week: dayIndex,
  is_working: dayIndex >= 1 && dayIndex <= 5, // Mon-Fri working
  start_time: '09:00',
  end_time: '17:00',
}));

const TYPE_LABEL = {
  off_day: 'Off Day',
  vacation: 'Vacation',
  sick_leave: 'Sick Leave',
};

const STATUS_COLOR = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
};

function formatDateRange(start, end) {
  const s = dayjs(start);
  const e = dayjs(end);
  const fmt = 'MMM D';
  if (s.isSame(e, 'day')) return s.format(fmt);
  return `${s.format(fmt)} – ${e.format(fmt)}`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function InstructorAvailabilitySettings() {
  const { message } = App.useApp();

  // ── Section A state ────────────────────────────────────────────────────────
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hours, setHours] = useState(DEFAULT_HOURS);

  // ── Section B state ────────────────────────────────────────────────────────
  const availability = useInstructorAvailability();
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'off_day',
    start_date: '',
    end_date: '',
    notes: '',
  });

  // ── Load working hours ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/instructors/me/working-hours');
        const data = res.data;
        if (!data || data.length === 0) {
          setHours(DEFAULT_HOURS);
        } else {
          // Ensure all 7 days present; fill gaps with defaults
          const byDay = {};
          data.forEach((d) => {
            byDay[d.day_of_week] = d;
          });
          setHours(
            DEFAULT_HOURS.map((def) => ({
              ...def,
              ...(byDay[def.day_of_week] || {}),
            }))
          );
        }
      } catch {
        message.error('Failed to load working hours');
      } finally {
        setHoursLoading(false);
      }
    };
    load();
  }, []);

  // ── Load time-off entries ──────────────────────────────────────────────────
  useEffect(() => {
    availability.load({ status: undefined });
  }, []);

  // ── Working hours helpers ──────────────────────────────────────────────────
  const updateHour = (dayIndex, key, value) => {
    setHours((prev) =>
      prev.map((row) =>
        row.day_of_week === dayIndex ? { ...row, [key]: value } : row
      )
    );
  };

  const handleSaveHours = async () => {
    setHoursSaving(true);
    try {
      await apiClient.put('/instructors/me/working-hours', hours);
      message.success('Working hours saved');
    } catch {
      message.error('Failed to save working hours');
    } finally {
      setHoursSaving(false);
    }
  };

  // ── Time-off helpers ───────────────────────────────────────────────────────
  const handleCancel = async (id) => {
    try {
      await availability.cancel(id);
      message.success('Time-off request cancelled');
    } catch {
      message.error('Failed to cancel request');
    }
  };

  const handleSubmitRequest = async () => {
    if (!form.start_date || !form.end_date) {
      message.warning('Please select a date range');
      return;
    }
    setSubmitting(true);
    try {
      await availability.requestOff(form);
      message.success('Time-off request submitted');
      setModalOpen(false);
      setForm({ type: 'off_day', start_date: '', end_date: '', notes: '' });
    } catch {
      message.error('Failed to submit time-off request');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Section A: Weekly Working Hours ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <CalendarOutlined className="text-sky-500" />
            Weekly Working Hours
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        {hoursLoading ? (
          <div className="flex justify-center py-10">
            <Spin size="large" />
          </div>
        ) : (
          <div className="space-y-3">
            {hours.map((row, i) => (
              <div key={row.day_of_week}>
                {i > 0 && <Divider className="!my-3" />}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Day label */}
                  <div className="w-28 shrink-0">
                    <Text strong>{DAY_LABELS[row.day_of_week]}</Text>
                  </div>

                  {/* Working toggle */}
                  <Switch
                    checked={!!row.is_working}
                    onChange={(val) =>
                      updateHour(row.day_of_week, 'is_working', val)
                    }
                    checkedChildren="Working"
                    unCheckedChildren="Off"
                  />

                  {/* Time selects (only when working) */}
                  {row.is_working && (
                    <div className="flex items-center gap-2 ml-2">
                      <Select
                        value={row.start_time || '09:00'}
                        onChange={(val) =>
                          updateHour(row.day_of_week, 'start_time', val)
                        }
                        style={{ width: 90 }}
                        size="small"
                        options={TIME_OPTIONS.map((t) => ({
                          label: t,
                          value: t,
                        }))}
                      />
                      <Text className="text-slate-400">to</Text>
                      <Select
                        value={row.end_time || '17:00'}
                        onChange={(val) =>
                          updateHour(row.day_of_week, 'end_time', val)
                        }
                        style={{ width: 90 }}
                        size="small"
                        options={TIME_OPTIONS.map((t) => ({
                          label: t,
                          value: t,
                        }))}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="flex justify-end mt-5">
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveHours}
                loading={hoursSaving}
              >
                Save Hours
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Section B: Time-Off Requests ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <CalendarOutlined className="text-sky-500" />
            Time-Off Requests
          </span>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={() => setModalOpen(true)}
          >
            Request Time Off
          </Button>
        }
        className="rounded-xl shadow-sm"
      >
        {availability.loading ? (
          <div className="flex justify-center py-10">
            <Spin size="large" />
          </div>
        ) : availability.entries.length === 0 ? (
          <Paragraph className="text-slate-400 text-center py-6">
            No time-off requests yet.
          </Paragraph>
        ) : (
          <div className="space-y-2">
            {availability.entries.map((entry, i) => (
              <div key={entry.id}>
                {i > 0 && <Divider className="!my-2" />}
                <div className="flex items-center justify-between flex-wrap gap-2 py-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Text strong>
                      {formatDateRange(entry.start_date, entry.end_date)}
                    </Text>
                    <Tag color="blue">{TYPE_LABEL[entry.type] ?? entry.type}</Tag>
                    <Badge
                      color={STATUS_COLOR[entry.status] ?? 'default'}
                      text={
                        <Text className="capitalize text-sm">
                          {entry.status}
                        </Text>
                      }
                    />
                  </div>
                  {entry.status === 'pending' && (
                    <Button
                      size="small"
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => handleCancel(entry.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Request Time-Off Modal ── */}
      <Modal
        title="Request Time Off"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmitRequest}
        okText="Submit Request"
        confirmLoading={submitting}
        destroyOnClose
      >
        <div className="space-y-4 mt-4">
          <div>
            <Text strong className="block mb-1">Type</Text>
            <Select
              value={form.type}
              onChange={(val) => setForm((f) => ({ ...f, type: val }))}
              style={{ width: '100%' }}
              options={[
                { label: 'Off Day', value: 'off_day' },
                { label: 'Vacation', value: 'vacation' },
                { label: 'Sick Leave', value: 'sick_leave' },
              ]}
            />
          </div>

          <div>
            <Text strong className="block mb-1">Date Range</Text>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              onChange={(_, dateStrings) => {
                setForm((f) => ({
                  ...f,
                  start_date: dateStrings[0],
                  end_date: dateStrings[1],
                }));
              }}
            />
          </div>

          <div>
            <Text strong className="block mb-1">Notes (optional)</Text>
            <TextArea
              rows={3}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="Any additional information..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
