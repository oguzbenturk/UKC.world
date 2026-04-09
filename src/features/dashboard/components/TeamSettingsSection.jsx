import { useState, useEffect, useCallback } from 'react';
import { Switch, Button, Checkbox, Modal, Input, Spin, message } from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  StarOutlined,
  StarFilled,
  EditOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import DataService from '@/shared/services/dataService';

const { TextArea } = Input;

const FIELD_OPTIONS = [
  { label: 'Bio', value: 'bio' },
  { label: 'Specializations', value: 'specializations' },
  { label: 'Languages', value: 'languages' },
  { label: 'Experience (Joined Date)', value: 'experience' },
];

const getDisplayName = (member) => {
  if (member.first_name || member.last_name) {
    return `${member.first_name || ''} ${member.last_name || ''}`.trim();
  }
  return member.name || 'Team Member';
};

const getInitials = (member) => {
  const name = getDisplayName(member);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || 'T')[0].toUpperCase();
};

const TeamSettingsSection = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);
  const [globalSettings, setGlobalSettings] = useState({
    visible_fields: ['bio', 'specializations', 'languages', 'experience'],
    booking_link_enabled: true,
  });
  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [customBioText, setCustomBioText] = useState('');
  const [draggedIdx, setDraggedIdx] = useState(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/team-settings');
      if (data.members && data.members.length > 0) {
        setMembers(data.members);
      } else {
        // Auto-initialize from instructor list
        const instructors = await DataService.getInstructors();
        const initialized = (instructors || []).map((inst, idx) => ({
          instructor_id: inst.id,
          name: inst.name,
          first_name: inst.first_name,
          last_name: inst.last_name,
          profile_image_url: inst.profile_image_url,
          avatar_url: inst.avatar_url,
          email: inst.email,
          visible: true,
          display_order: idx,
          featured: false,
          custom_bio: null,
        }));
        setMembers(initialized);
      }
      if (data.global) {
        setGlobalSettings(data.global);
      }
    } catch (err) {
      console.error('Failed to load team settings', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        members: members.map((m, idx) => ({
          instructor_id: m.instructor_id,
          visible: m.visible,
          display_order: idx,
          featured: m.featured,
          custom_bio: m.custom_bio || null,
        })),
        global: globalSettings,
      };
      await apiClient.put('/team-settings', payload);
      message.success('Team settings saved');
    } catch (err) {
      console.error('Failed to save team settings', err);
      message.error('Failed to save team settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = (idx) => {
    setMembers((prev) => prev.map((m, i) => i === idx ? { ...m, visible: !m.visible } : m));
  };

  const toggleFeatured = (idx) => {
    setMembers((prev) => prev.map((m, i) => i === idx ? { ...m, featured: !m.featured } : m));
  };

  const openBioModal = (idx) => {
    setEditingMember(idx);
    setCustomBioText(members[idx].custom_bio || '');
    setBioModalOpen(true);
  };

  const saveBio = () => {
    setMembers((prev) => prev.map((m, i) => i === editingMember ? { ...m, custom_bio: customBioText || null } : m));
    setBioModalOpen(false);
    setEditingMember(null);
  };

  const handleDragStart = (idx) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    setMembers((prev) => {
      const next = [...prev];
      const [removed] = next.splice(draggedIdx, 1);
      next.splice(idx, 0, removed);
      return next;
    });
    setDraggedIdx(idx);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-medium leading-6 text-gray-900">Team Page Settings</h3>
      <p className="mt-1 text-sm text-gray-600">
        Configure how your team appears on the public Team page.
      </p>

      {/* Global Settings */}
      <div className="mt-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Global Settings</h4>

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-medium text-gray-700">Show "Book a Lesson" button</div>
            <div className="text-xs text-gray-500">Display a CTA on the team page and instructor drawer</div>
          </div>
          <Switch
            checked={globalSettings.booking_link_enabled}
            onChange={(checked) => setGlobalSettings((prev) => ({ ...prev, booking_link_enabled: checked }))}
          />
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Visible fields on public team page</div>
          <Checkbox.Group
            options={FIELD_OPTIONS}
            value={globalSettings.visible_fields}
            onChange={(vals) => setGlobalSettings((prev) => ({ ...prev, visible_fields: vals }))}
          />
        </div>
      </div>

      {/* Instructor List */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Instructors ({members.length})
        </h4>
        <p className="text-xs text-gray-500 mb-3">Drag to reorder. Changes take effect after saving.</p>

        <div className="space-y-2">
          {members.map((member, idx) => {
            const avatarUrl = member.profile_image_url || member.avatar_url;
            const name = getDisplayName(member);

            return (
              <div
                key={member.instructor_id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 bg-white rounded-lg border transition-colors ${
                  draggedIdx === idx ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                } ${!member.visible ? 'opacity-50' : ''}`}
              >
                <MenuOutlined className="text-gray-400 cursor-grab active:cursor-grabbing" />

                <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-gray-500">{getInitials(member)}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{name}</div>
                  {member.custom_bio && (
                    <div className="text-xs text-blue-500 truncate">Custom bio set</div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleVisibility(idx)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title={member.visible ? 'Hide from team page' : 'Show on team page'}
                  >
                    {member.visible ? (
                      <EyeOutlined className="text-gray-600" />
                    ) : (
                      <EyeInvisibleOutlined className="text-gray-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFeatured(idx)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title={member.featured ? 'Remove featured' : 'Mark as featured'}
                  >
                    {member.featured ? (
                      <StarFilled className="text-amber-500" />
                    ) : (
                      <StarOutlined className="text-gray-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBioModal(idx)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title="Edit public bio"
                  >
                    <EditOutlined className="text-gray-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <Button
          type="primary"
          onClick={handleSave}
          loading={saving}
        >
          Save Team Settings
        </Button>
      </div>

      {/* Custom Bio Modal */}
      <Modal
        title={editingMember !== null ? `Edit Public Bio — ${getDisplayName(members[editingMember])}` : 'Edit Public Bio'}
        open={bioModalOpen}
        onOk={saveBio}
        onCancel={() => setBioModalOpen(false)}
        okText="Set Bio"
      >
        <p className="text-sm text-gray-500 mb-3">
          Override this instructor's bio on the public Team page. Leave empty to use their default bio.
        </p>
        <TextArea
          rows={4}
          value={customBioText}
          onChange={(e) => setCustomBioText(e.target.value)}
          placeholder="Enter custom public bio..."
          maxLength={500}
          showCount
        />
      </Modal>
    </div>
  );
};

export default TeamSettingsSection;
