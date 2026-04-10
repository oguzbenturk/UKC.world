/**
 * InstructorTeachingPreferences
 *
 * Teaching preference settings for instructors.
 * Fetches from GET /instructors/me/preferences, saves via PUT.
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
  InputNumber,
  Input,
  Checkbox,
  App,
} from 'antd';
import { BookOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const DURATION_OPTIONS = [
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
];

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Türkçe', value: 'tr' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Français', value: 'fr' },
  { label: 'Español', value: 'es' },
];

const DEFAULT_PREFS = {
  max_group_size: 4,
  preferred_durations: [],
  teaching_languages: [],
  auto_accept_bookings: false,
  note_template: '',
};

export default function InstructorTeachingPreferences() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/instructors/me/preferences');
        if (res.data) {
          setPrefs((prev) => ({ ...prev, ...res.data }));
        }
      } catch {
        message.error('Failed to load teaching preferences');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const updatePref = (key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/instructors/me/preferences', prefs);
      message.success('Teaching preferences saved');
    } catch {
      message.error('Failed to save teaching preferences');
    } finally {
      setSaving(false);
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
    <Card
      title={
        <span className="flex items-center gap-2">
          <BookOutlined className="text-sky-500" />
          Teaching Preferences
        </span>
      }
      className="rounded-xl shadow-sm"
    >
      <div className="space-y-5">
        {/* Max Students Per Group Lesson */}
        <div>
          <Text strong className="block mb-1">
            Max Students Per Group Lesson
          </Text>
          <Paragraph className="!mb-2 text-sm text-slate-500">
            Maximum number of students for group lessons
          </Paragraph>
          <InputNumber
            min={2}
            max={8}
            value={prefs.max_group_size}
            onChange={(val) => updatePref('max_group_size', val)}
          />
        </div>

        <Divider className="!my-3" />

        {/* Preferred Lesson Durations */}
        <div>
          <Text strong className="block mb-1">
            Preferred Lesson Durations
          </Text>
          <Paragraph className="!mb-2 text-sm text-slate-500">
            Durations you're comfortable teaching
          </Paragraph>
          <Checkbox.Group
            options={DURATION_OPTIONS}
            value={prefs.preferred_durations ?? []}
            onChange={(vals) => updatePref('preferred_durations', vals)}
          />
        </div>

        <Divider className="!my-3" />

        {/* Teaching Languages */}
        <div>
          <Text strong className="block mb-1">Teaching Languages</Text>
          <Paragraph className="!mb-2 text-sm text-slate-500">
            Languages you can teach in
          </Paragraph>
          <Select
            mode="multiple"
            value={prefs.teaching_languages ?? []}
            onChange={(vals) => updatePref('teaching_languages', vals)}
            placeholder="Select languages"
            style={{ width: '100%' }}
            options={LANGUAGE_OPTIONS}
          />
        </div>

        <Divider className="!my-3" />

        {/* Auto-accept Bookings */}
        <div className="flex items-center justify-between py-1">
          <div>
            <Text strong>Auto-accept Bookings</Text>
            <Paragraph className="!mb-0 text-sm text-slate-500">
              Automatically confirm new booking requests without manual review
            </Paragraph>
          </div>
          <Switch
            checked={!!prefs.auto_accept_bookings}
            onChange={(val) => updatePref('auto_accept_bookings', val)}
          />
        </div>

        <Divider className="!my-3" />

        {/* Lesson Notes Template */}
        <div>
          <Text strong className="block mb-1">Lesson Notes Template</Text>
          <Paragraph className="!mb-2 text-sm text-slate-500">
            Default template for post-lesson notes
          </Paragraph>
          <TextArea
            rows={4}
            value={prefs.note_template ?? ''}
            onChange={(e) => updatePref('note_template', e.target.value)}
            placeholder="e.g., Student showed good progress on upwind riding. Next focus: board control..."
          />
        </div>
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
  );
}
