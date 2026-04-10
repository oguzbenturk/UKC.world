/**
 * AccountSettings
 *
 * Lets any logged-in user update their personal info, upload a profile photo,
 * and change their password.
 */

import { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Typography, Divider, Spin, DatePicker, App } from 'antd';
import { UserOutlined, EditOutlined, LockOutlined, SaveOutlined, CameraOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const MAX_FILE_SIZE_MB = 2;

export default function AccountSettings() {
  const { user, refreshUser } = useAuth();
  const { message } = App.useApp();

  const fileInputRef = useRef(null);

  // Profile photo
  const [uploading, setUploading] = useState(false);

  // Personal info form
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    date_of_birth: null,
    bio: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPassword, setSavingPassword] = useState(false);

  // Initialise form from user object
  useEffect(() => {
    if (!user) return;
    setForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      date_of_birth: user.date_of_birth ? dayjs(user.date_of_birth) : null,
      bio: user.bio || '',
    });
  }, [user]);

  // ── Avatar upload ────────────────────────────────────────────────────────────

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      message.error(`Photo must be smaller than ${MAX_FILE_SIZE_MB} MB`);
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      await apiClient.post('/users/upload-avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      message.success('Profile photo updated');
    } catch {
      message.error('Failed to upload photo');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // ── Personal info save ───────────────────────────────────────────────────────

  const handleProfileSave = async () => {
    if (!user?.id) return;
    setSavingProfile(true);
    try {
      await apiClient.put(`/users/${user.id}`, {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        date_of_birth: form.date_of_birth?.format('YYYY-MM-DD') || null,
        bio: form.bio,
      });
      await refreshUser();
      message.success('Personal information updated');
    } catch {
      message.error('Failed to update personal information');
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Password change ──────────────────────────────────────────────────────────

  const handlePasswordSave = async () => {
    if (!passwords.currentPassword) {
      message.warning('Please enter your current password');
      return;
    }
    if (passwords.newPassword.length < 8) {
      message.warning('New password must be at least 8 characters');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      message.warning('New passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      message.success('Password changed successfully');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to change password';
      message.error(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Avatar display ───────────────────────────────────────────────────────────

  const avatarLetter = (user?.first_name?.[0] || user?.email?.[0] || '?').toUpperCase();

  const AvatarDisplay = () => {
    if (user?.profile_image_url) {
      return (
        <img
          src={user.profile_image_url}
          alt="Profile"
          className="w-20 h-20 rounded-full object-cover border-2 border-sky-100"
        />
      );
    }
    return (
      <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center border-2 border-sky-200">
        <span className="text-2xl font-semibold text-sky-600">{avatarLetter}</span>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="flex justify-center py-12">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Card 1: Profile Photo ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <UserOutlined className="text-sky-500" />
            Profile Photo
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="flex items-center gap-6">
          <div className="relative flex-shrink-0">
            <AvatarDisplay />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-full">
                <Spin size="small" />
              </div>
            )}
          </div>

          <div className="flex-1">
            <Text strong className="block mb-1">Update your photo</Text>
            <Paragraph className="!mb-3 text-sm text-slate-500">
              JPG, PNG or GIF. Max {MAX_FILE_SIZE_MB} MB.
            </Paragraph>
            <Button
              icon={<CameraOutlined />}
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
              disabled={uploading}
            >
              Upload Photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </Card>

      {/* ── Card 2: Personal Information ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <EditOutlined className="text-sky-500" />
            Personal Information
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Text strong className="block mb-1">First Name</Text>
              <Input
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                placeholder="First name"
              />
            </div>
            <div>
              <Text strong className="block mb-1">Last Name</Text>
              <Input
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                placeholder="Last name"
              />
            </div>
          </div>

          <Divider className="!my-2" />

          <div>
            <Text strong className="block mb-1">Email</Text>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email address"
            />
          </div>

          <div>
            <Text strong className="block mb-1">Phone</Text>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Phone number"
            />
          </div>

          <div>
            <Text strong className="block mb-1">Date of Birth</Text>
            <DatePicker
              value={form.date_of_birth}
              onChange={(date) => setForm((f) => ({ ...f, date_of_birth: date }))}
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
              placeholder="Select date of birth"
            />
          </div>

          <div>
            <Text strong className="block mb-1">Bio</Text>
            <TextArea
              rows={3}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Tell us a bit about yourself..."
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleProfileSave}
              loading={savingProfile}
              className="rounded-lg"
            >
              Save Personal Information
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Card 3: Change Password ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <LockOutlined className="text-sky-500" />
            Change Password
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-4">
          <div>
            <Text strong className="block mb-1">Current Password</Text>
            <Input.Password
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              placeholder="Enter current password"
              autoComplete="current-password"
            />
          </div>

          <Divider className="!my-2" />

          <div>
            <Text strong className="block mb-1">New Password</Text>
            <Input.Password
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
            {passwords.newPassword && passwords.newPassword.length < 8 && (
              <Paragraph className="!mb-0 text-xs text-red-500 mt-1">
                Password must be at least 8 characters
              </Paragraph>
            )}
          </div>

          <div>
            <Text strong className="block mb-1">Confirm New Password</Text>
            <Input.Password
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
            {passwords.confirmPassword && passwords.newPassword !== passwords.confirmPassword && (
              <Paragraph className="!mb-0 text-xs text-red-500 mt-1">
                Passwords do not match
              </Paragraph>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handlePasswordSave}
              loading={savingPassword}
              className="rounded-lg"
            >
              Change Password
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
