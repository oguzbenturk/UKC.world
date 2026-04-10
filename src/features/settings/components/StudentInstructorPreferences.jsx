/**
 * StudentInstructorPreferences
 *
 * Student-facing instructor preference settings.
 * Fetches booking-preferences (shared endpoint) and instructor list.
 * Saves via PUT /student/booking-preferences.
 */

import { useState, useEffect } from 'react';
import { Card, Select, Switch, Button, Typography, Divider, Spin, App } from 'antd';
import { TeamOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Paragraph } = Typography;

export default function StudentInstructorPreferences() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [instructors, setInstructors] = useState([]);
  const [prefs, setPrefs] = useState({
    preferred_instructor_id: null,
    preferred_lesson_languages: [],
    auto_assign_instructor: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [prefsRes, instructorsRes] = await Promise.all([
          apiClient.get('/student/booking-preferences'),
          apiClient.get('/instructors'),
        ]);
        if (prefsRes.data) {
          setPrefs(prev => ({
            ...prev,
            preferred_instructor_id: prefsRes.data.preferred_instructor_id ?? null,
            preferred_lesson_languages: prefsRes.data.preferred_lesson_languages ?? [],
            auto_assign_instructor: prefsRes.data.auto_assign_instructor ?? false,
          }));
        }
        if (instructorsRes.data) {
          const list = Array.isArray(instructorsRes.data)
            ? instructorsRes.data
            : instructorsRes.data.instructors || [];
          setInstructors(list);
        }
      } catch {
        message.error('Failed to load instructor preferences');
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
      message.success('Instructor preferences saved');
    } catch {
      message.error('Failed to save instructor preferences');
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

  const instructorOptions = instructors.map(i => ({
    value: i.id,
    label: i.name || i.full_name || `Instructor #${i.id}`,
  }));

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'tr', label: 'Türkçe' },
    { value: 'de', label: 'Deutsch' },
    { value: 'fr', label: 'Français' },
    { value: 'es', label: 'Español' },
  ];

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <TeamOutlined className="text-sky-500" />
          Instructor Preferences
        </span>
      }
      className="rounded-xl shadow-sm"
    >
      <div className="space-y-5">
        {/* Preferred Instructor */}
        <div>
          <Text strong className="block mb-1">Preferred Instructor</Text>
          <Paragraph className="!mb-2 text-sm text-slate-500">
            We'll try to assign this instructor to your bookings when available
          </Paragraph>
          <Select
            showSearch
            optionFilterProp="label"
            options={instructorOptions}
            value={prefs.preferred_instructor_id || undefined}
            onChange={val => updatePref('preferred_instructor_id', val ?? null)}
            placeholder="Select an instructor"
            allowClear
            style={{ width: '100%' }}
          />
        </div>

        <Divider className="!my-3" />

        {/* Language Preference */}
        <div>
          <Text strong className="block mb-1">Language Preference</Text>
          <Paragraph className="!mb-2 text-sm text-slate-500">
            Preferred language for your lessons
          </Paragraph>
          <Select
            mode="multiple"
            options={languageOptions}
            value={prefs.preferred_lesson_languages}
            onChange={val => updatePref('preferred_lesson_languages', val)}
            placeholder="Select languages"
            style={{ width: '100%' }}
          />
        </div>

        <Divider className="!my-3" />

        {/* Auto-assign Switch */}
        <div className="flex items-center justify-between py-2">
          <div>
            <Text strong>Auto-assign Preferred Instructor</Text>
            <Paragraph className="!mb-0 text-sm text-slate-500">
              Automatically select your preferred instructor when booking
            </Paragraph>
          </div>
          <Switch
            checked={!!prefs.auto_assign_instructor}
            onChange={val => updatePref('auto_assign_instructor', val)}
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
