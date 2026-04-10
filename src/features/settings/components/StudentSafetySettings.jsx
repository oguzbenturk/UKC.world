/**
 * StudentSafetySettings
 *
 * Student emergency contact and medical information settings.
 * Fetches from GET /student/safety and saves via PUT /student/safety.
 */

import { useState, useEffect } from 'react';
import { Card, Select, Input, Button, Typography, Divider, Spin, App } from 'antd';
import { SafetyOutlined, MedicineBoxOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function StudentSafetySettings() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [safety, setSafety] = useState({
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: null,
    medical_notes: '',
    swimming_ability: null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/student/safety');
        if (res.data) {
          setSafety(prev => ({ ...prev, ...res.data }));
        }
      } catch {
        message.error('Failed to load safety settings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const updateField = (key, value) => {
    setSafety(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/student/safety', safety);
      message.success('Safety settings saved');
    } catch {
      message.error('Failed to save safety settings');
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
    <div className="space-y-6">
      {/* Emergency Contact Card */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <SafetyOutlined className="text-sky-500" />
            Emergency Contact
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-5">
          {/* Name */}
          <div>
            <Text strong className="block mb-1">Emergency Contact Name</Text>
            <Input
              value={safety.emergency_contact_name}
              onChange={e => updateField('emergency_contact_name', e.target.value)}
              placeholder="Full name"
            />
          </div>

          <Divider className="!my-3" />

          {/* Phone */}
          <div>
            <Text strong className="block mb-1">Phone Number</Text>
            <Input
              value={safety.emergency_contact_phone}
              onChange={e => updateField('emergency_contact_phone', e.target.value)}
              placeholder="+1 234 567 8900"
            />
          </div>

          <Divider className="!my-3" />

          {/* Relationship */}
          <div>
            <Text strong className="block mb-1">Relationship</Text>
            <Select
              value={safety.emergency_contact_relationship || undefined}
              onChange={val => updateField('emergency_contact_relationship', val ?? null)}
              placeholder="Select relationship"
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="parent">Parent</Select.Option>
              <Select.Option value="spouse">Spouse</Select.Option>
              <Select.Option value="partner">Partner</Select.Option>
              <Select.Option value="sibling">Sibling</Select.Option>
              <Select.Option value="friend">Friend</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Medical Information Card */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <MedicineBoxOutlined className="text-sky-500" />
            Medical Information
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-5">
          <Paragraph className="!mb-0 text-sm text-slate-500">
            This information is shared with your instructor to ensure your safety during lessons.
          </Paragraph>

          {/* Medical Conditions */}
          <div>
            <Text strong className="block mb-1">Medical Conditions</Text>
            <TextArea
              rows={4}
              value={safety.medical_notes}
              onChange={e => updateField('medical_notes', e.target.value)}
              placeholder="Any conditions your instructor should know about: allergies, injuries, medications..."
            />
          </div>

          <Divider className="!my-3" />

          {/* Swimming Ability */}
          <div>
            <Text strong className="block mb-1">Swimming Ability</Text>
            <Paragraph className="!mb-2 text-sm text-slate-500">
              Your swimming proficiency level
            </Paragraph>
            <Select
              value={safety.swimming_ability || undefined}
              onChange={val => updateField('swimming_ability', val ?? null)}
              placeholder="Select swimming ability"
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="none">Non-swimmer</Select.Option>
              <Select.Option value="basic">Basic swimmer</Select.Option>
              <Select.Option value="confident">Confident swimmer</Select.Option>
              <Select.Option value="strong">Strong swimmer</Select.Option>
            </Select>
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
    </div>
  );
}
