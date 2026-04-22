/**
 * AccountSettings
 *
 * Lets any logged-in user update their personal info, upload a profile photo,
 * and change their password.
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Input, Button, Typography, Divider, Spin, DatePicker, App } from 'antd';
import { UserOutlined, EditOutlined, LockOutlined, SaveOutlined, CameraOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const MAX_FILE_SIZE_MB = 2;

export default function AccountSettings() {
  const { t } = useTranslation(['admin']);
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
      message.error(t('admin:account.profilePhoto.toast.fileTooLarge', { maxMb: MAX_FILE_SIZE_MB }));
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
      message.success(t('admin:account.profilePhoto.toast.updated'));
    } catch {
      message.error(t('admin:account.profilePhoto.toast.uploadError'));
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
      message.success(t('admin:account.personalInfo.toast.saved'));
    } catch {
      message.error(t('admin:account.personalInfo.toast.saveError'));
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Password change ──────────────────────────────────────────────────────────

  const handlePasswordSave = async () => {
    if (!passwords.currentPassword) {
      message.warning(t('admin:account.password.toast.enterCurrent'));
      return;
    }
    if (passwords.newPassword.length < 8) {
      message.warning(t('admin:account.password.toast.minLength'));
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      message.warning(t('admin:account.password.toast.noMatch'));
      return;
    }

    setSavingPassword(true);
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      message.success(t('admin:account.password.toast.changed'));
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const msg = err?.response?.data?.message || t('admin:account.password.toast.changeError');
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
            {t('admin:account.profilePhoto.title')}
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
            <Text strong className="block mb-1">{t('admin:account.profilePhoto.updatePhotoLabel')}</Text>
            <Paragraph className="!mb-3 text-sm text-slate-500">
              {t('admin:account.profilePhoto.uploadDescription', { maxMb: MAX_FILE_SIZE_MB })}
            </Paragraph>
            <Button
              icon={<CameraOutlined />}
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
              disabled={uploading}
            >
              {t('admin:account.profilePhoto.uploadButton')}
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
            {t('admin:account.personalInfo.title')}
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Text strong className="block mb-1">{t('admin:account.personalInfo.firstName')}</Text>
              <Input
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                placeholder={t('admin:account.personalInfo.firstNamePlaceholder')}
              />
            </div>
            <div>
              <Text strong className="block mb-1">{t('admin:account.personalInfo.lastName')}</Text>
              <Input
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                placeholder={t('admin:account.personalInfo.lastNamePlaceholder')}
              />
            </div>
          </div>

          <Divider className="!my-2" />

          <div>
            <Text strong className="block mb-1">{t('admin:account.personalInfo.email')}</Text>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={t('admin:account.personalInfo.emailPlaceholder')}
            />
          </div>

          <div>
            <Text strong className="block mb-1">{t('admin:account.personalInfo.phone')}</Text>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder={t('admin:account.personalInfo.phonePlaceholder')}
            />
          </div>

          <div>
            <Text strong className="block mb-1">{t('admin:account.personalInfo.dateOfBirth')}</Text>
            <DatePicker
              value={form.date_of_birth}
              onChange={(date) => setForm((f) => ({ ...f, date_of_birth: date }))}
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
              placeholder={t('admin:account.personalInfo.dateOfBirth')}
            />
          </div>

          <div>
            <Text strong className="block mb-1">{t('admin:account.personalInfo.bio')}</Text>
            <TextArea
              rows={3}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder={t('admin:account.personalInfo.bioPlaceholder')}
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
              {t('admin:account.personalInfo.save')}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Card 3: Change Password ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <LockOutlined className="text-sky-500" />
            {t('admin:account.password.title')}
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        <div className="space-y-4">
          <div>
            <Text strong className="block mb-1">{t('admin:account.password.currentPassword')}</Text>
            <Input.Password
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              placeholder={t('admin:account.password.currentPassword')}
              autoComplete="current-password"
            />
          </div>

          <Divider className="!my-2" />

          <div>
            <Text strong className="block mb-1">{t('admin:account.password.newPassword')}</Text>
            <Input.Password
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              placeholder={t('admin:account.password.newPassword')}
              autoComplete="new-password"
            />
            {passwords.newPassword && passwords.newPassword.length < 8 && (
              <Paragraph className="!mb-0 text-xs text-red-500 mt-1">
                {t('admin:account.password.toast.minLength')}
              </Paragraph>
            )}
          </div>

          <div>
            <Text strong className="block mb-1">{t('admin:account.password.confirmPassword')}</Text>
            <Input.Password
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
              placeholder={t('admin:account.password.confirmPassword')}
              autoComplete="new-password"
            />
            {passwords.confirmPassword && passwords.newPassword !== passwords.confirmPassword && (
              <Paragraph className="!mb-0 text-xs text-red-500 mt-1">
                {t('admin:account.password.toast.noMatch')}
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
              {t('admin:account.password.save')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
