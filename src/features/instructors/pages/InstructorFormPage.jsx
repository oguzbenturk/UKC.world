import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Spin, DatePicker, Upload, Select } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ArrowLeftOutlined, UserOutlined, MailOutlined, PhoneOutlined,
  LockOutlined, CalendarOutlined, EnvironmentOutlined,
  CameraOutlined, SaveOutlined, TeamOutlined,
  BookOutlined, CheckOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import { useData } from '@/shared/hooks/useData';
import { useInstructorRoleId } from '@/shared/hooks/useInstructorRoleId';
import apiClient from '@/shared/services/apiClient';

const { Option } = Select;

const DISCIPLINES = [
  { tag: 'kite',      label: 'Kite',      emoji: '🪁', bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     check: 'bg-sky-500 border-sky-500' },
  { tag: 'wing',      label: 'Wing',      emoji: '🪂', bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  check: 'bg-violet-500 border-violet-500' },
  { tag: 'kite_foil', label: 'Kite Foil', emoji: '🏄', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', check: 'bg-emerald-500 border-emerald-500' },
  { tag: 'efoil',     label: 'E-Foil',    emoji: '⚡', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   check: 'bg-amber-500 border-amber-500' },
  { tag: 'premium',   label: 'Premium',   emoji: '⭐', bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    check: 'bg-rose-500 border-rose-500' },
];
const LESSON_CATS = [
  { value: 'private',      label: 'Private' },
  { value: 'semi-private', label: 'Semi-Private' },
  { value: 'group',        label: 'Group' },
  { value: 'supervision',  label: 'Supervision' },
];
const SKILL_LEVELS = [
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced',     label: 'Advanced' },
];
const AVAILABLE_CURRENCIES = [
  { value: 'EUR', label: '🇪🇺 Euro (EUR)' },
  { value: 'USD', label: '🇺🇸 US Dollar (USD)' },
  { value: 'TRY', label: '🇹🇷 Turkish Lira (TL)' },
];

const Label = ({ children, required }) => (
  <span className="text-xs font-medium text-slate-500">
    {children}{required && <span className="text-red-400 ml-0.5">*</span>}
  </span>
);

const SectionCard = ({ icon, iconBg, title, badge, children }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-lg ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{title}</h3>
      </div>
      {badge}
    </div>
    {children}
  </div>
);

const InstructorFormPage = () => {
  const [form] = Form.useForm();
  const { id } = useParams();
  const navigate = useNavigate();
  const { addInstructor, updateInstructor, fetchInstructorById, loading: dataLoading } = useData();
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const { instructorRoleId, loading: instructorRoleLoading, error: instructorRoleError } = useInstructorRoleId(!id);
  const [skills, setSkills] = useState([]);
  const [changePassword, setChangePassword] = useState(false);

  const watchedFirst = Form.useWatch('first_name', form);
  const watchedLast  = Form.useWatch('last_name',  form);

  const postAvatarUpload = useCallback(async (file, progressCb) => {
    const formData = new FormData();
    if (id) formData.append('targetUserId', id);
    formData.append('avatar', file);
    return apiClient.post('/users/upload-avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: ({ total, loaded }) => {
        if (total && progressCb) progressCb(Math.round((loaded / total) * 100));
      },
    });
  }, [id]);

  const syncStoredAvatar = useCallback((targetId, url) => {
    if (!targetId || !url) return;
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed.id === targetId) {
        localStorage.setItem('user', JSON.stringify({ ...parsed, profile_image_url: url }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (id) {
      setIsEditing(true);
      setLoading(true);
      Promise.all([
        fetchInstructorById(id),
        apiClient.get(`/instructors/${id}/skills`).catch(() => ({ data: [] })),
      ])
        .then(([data, skillsRes]) => {
          if (data) {
            form.setFieldsValue({
              ...data,
              date_of_birth: data.date_of_birth ? moment(data.date_of_birth) : null,
            });
            if (data.profile_image_url) setAvatarUrl(data.profile_image_url);
          }
          setSkills(Array.isArray(skillsRes?.data) ? skillsRes.data : []);
        })
        .catch(() => message.error('Failed to fetch instructor details'))
        .finally(() => setLoading(false));
    }
  }, [id, form, fetchInstructorById]);

  const handleAvatarUpload = (info) => {
    if (info.file.status === 'uploading' && info.file.originFileObj) {
      const url = URL.createObjectURL(info.file.originFileObj);
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(url);
    }
    if (info.file.status === 'error') {
      if (avatarPreviewUrl) { URL.revokeObjectURL(avatarPreviewUrl); setAvatarPreviewUrl(null); }
      message.error(`${info.file.name} upload failed.`);
    }
  };

  useEffect(() => {
    return () => { if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl); };
  }, [avatarPreviewUrl]);

  const toggleDiscipline = (tag) => {
    setSkills(prev => {
      const exists = prev.find(s => s.discipline_tag === tag);
      if (exists) return prev.filter(s => s.discipline_tag !== tag);
      return [...prev, { discipline_tag: tag, lesson_categories: ['private'], max_level: 'beginner' }];
    });
  };

  const updateSkill = (tag, field, value) => {
    setSkills(prev => prev.map(s =>
      s.discipline_tag === tag ? { ...s, [field]: value } : s
    ));
  };

  const handleFinish = async (values) => {
    if (!id) {
      if (instructorRoleLoading) {
        message.warning('Loading roles… please try again in a moment.');
        return;
      }
      if (!instructorRoleId) {
        message.error(
          instructorRoleError?.message || 'Could not resolve instructor role. Check Roles in settings or try again.'
        );
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        ...values,
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : null,
        profile_image_url: avatarUrl,
        name: `${values.first_name} ${values.last_name}`.trim(),
      };
      if (!id) {
        payload.role_id = instructorRoleId;
      }
      delete payload.confirm_password;

      // Only send password if creating or explicitly changing it
      if (isEditing && !changePassword) {
        delete payload.password;
      }

      let instructorId = id;
      if (isEditing) {
        await updateInstructor(id, payload);
      } else {
        const created = await addInstructor(payload);
        instructorId = created?.id;
      }

      if (instructorId) {
        try {
          await apiClient.put(`/instructors/${instructorId}/skills`, { skills });
        } catch (skillErr) {
          console.warn('Skills save failed:', skillErr);
          message.warning('Profile saved, but skills could not be saved.');
        }
      }

      message.success(isEditing ? 'Instructor updated successfully!' : 'Instructor created successfully!');
      navigate('/instructors');
    } catch (error) {
      setLoading(false);
      message.error(`Failed to save: ${error.response?.data?.error || error.message}`);
    }
  };

  const displayAvatar = avatarPreviewUrl || avatarUrl;
  const initials = `${(watchedFirst || '')[0] || ''}${(watchedLast || '')[0] || ''}`.toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">

      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/instructors')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            <ArrowLeftOutlined className="text-sm" />
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <h1 className="text-sm font-semibold text-slate-800">
            {isEditing ? 'Edit Instructor' : 'New Instructor'}
          </h1>
        </div>
      </div>

      <Spin spinning={loading || dataLoading}>
        <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">

            {/* ── Avatar & Name ────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-5">
                <Upload
                  name="avatar"
                  showUploadList={false}
                  onChange={handleAvatarUpload}
                  customRequest={async ({ file, onSuccess, onError, onProgress }) => {
                    try {
                      const response = await postAvatarUpload(file, (percent) => {
                        onProgress?.({ percent });
                      });
                      const bust = response.data?.cacheBust || Date.now();
                      const newUrl = response.data?.url ? `${response.data.url}?v=${bust}` : null;
                      if (newUrl) {
                        setAvatarUrl(newUrl);
                        form.setFieldsValue({ profile_image_url: newUrl });
                        syncStoredAvatar(response.data?.targetUserId || response.data?.user?.id, newUrl);
                      }
                      onSuccess?.(response.data);
                    } catch (err) { onError?.(err); }
                  }}
                >
                  <div className="relative cursor-pointer group">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-sky-50 to-indigo-50 border-2 border-slate-100 shadow-sm transition-shadow group-hover:shadow-md">
                      {displayAvatar ? (
                        <img src={displayAvatar} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-2xl font-bold bg-gradient-to-br from-sky-400 to-indigo-500 bg-clip-text text-transparent">{initials}</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-sky-500 hover:bg-sky-600 rounded-lg flex items-center justify-center shadow-md shadow-sky-200 transition-all group-hover:scale-110">
                      <CameraOutlined className="text-white" style={{ fontSize: 11 }} />
                    </div>
                  </div>
                </Upload>
                <div className="flex-1 min-w-0">
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.first_name !== cur.first_name || prev.last_name !== cur.last_name}>
                    {({ getFieldValue }) => {
                      const name = `${getFieldValue('first_name') || ''} ${getFieldValue('last_name') || ''}`.trim();
                      return <p className="text-base font-semibold text-slate-800 truncate">{name || 'New Instructor'}</p>;
                    }}
                  </Form.Item>
                  <p className="text-xs text-slate-400 mt-0.5">Click avatar to upload a photo</p>
                </div>
              </div>
            </div>

            {/* ── Personal Details ─────────────────────────────── */}
            <SectionCard
              icon={<UserOutlined className="text-sky-500 text-xs" />}
              iconBg="bg-sky-50"
              title="Personal Details"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                <Form.Item name="first_name" label={<Label required>First Name</Label>} rules={[{ required: true, message: 'Required' }]}>
                  <Input prefix={<UserOutlined className="text-slate-300" />} placeholder="Alex" className="rounded-lg" />
                </Form.Item>
                <Form.Item name="last_name" label={<Label required>Last Name</Label>} rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="Johnson" className="rounded-lg" />
                </Form.Item>
                <Form.Item name="email" label={<Label required>Email</Label>} rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
                  <Input prefix={<MailOutlined className="text-slate-300" />} placeholder="instructor@academy.com" className="rounded-lg" />
                </Form.Item>
                <Form.Item name="phone" label={<Label>Phone</Label>}>
                  <Input prefix={<PhoneOutlined className="text-slate-300" />} placeholder="+1 555 000 0000" className="rounded-lg" />
                </Form.Item>
                <Form.Item name="date_of_birth" label={<Label>Date of Birth</Label>}>
                  <DatePicker style={{ width: '100%' }} placeholder="Select date" className="rounded-lg" suffixIcon={<CalendarOutlined className="text-slate-300" />} />
                </Form.Item>
                <Form.Item name="preferred_currency" label={<Label>Preferred Currency</Label>} initialValue="EUR">
                  <Select>
                    {AVAILABLE_CURRENCIES.map(c => (
                      <Option key={c.value} value={c.value}>{c.label}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
            </SectionCard>

            {/* ── Password ─────────────────────────────────────── */}
            <SectionCard
              icon={<LockOutlined className="text-amber-500 text-xs" />}
              iconBg="bg-amber-50"
              title={isEditing ? 'Change Password' : 'Account Password'}
              badge={isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setChangePassword(p => {
                      if (!p === false) {
                        form.setFieldsValue({ password: undefined, confirm_password: undefined });
                      }
                      return !p;
                    });
                  }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${
                    changePassword
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {changePassword ? 'Cancel' : 'Change'}
                </button>
              )}
            >
              {(!isEditing || changePassword) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                  <Form.Item
                    name="password"
                    label={<Label required={!isEditing}>New Password</Label>}
                    rules={[
                      ...(!isEditing ? [{ required: true, message: 'Password is required' }] : []),
                      { min: 8, message: 'Min. 8 characters' },
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Min. 8 characters" className="rounded-lg" />
                  </Form.Item>
                  <Form.Item
                    name="confirm_password"
                    label={<Label required={!isEditing}>Confirm Password</Label>}
                    dependencies={['password']}
                    rules={[
                      ...(!isEditing ? [{ required: true, message: 'Please confirm password' }] : []),
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) return Promise.resolve();
                          return Promise.reject(new Error('Passwords do not match'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Repeat password" className="rounded-lg" />
                  </Form.Item>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Click "Change" to set a new password for this instructor.</p>
              )}
            </SectionCard>

            {/* ── Teaching Skills ──────────────────────────────── */}
            <SectionCard
              icon={<BookOutlined className="text-violet-500 text-xs" />}
              iconBg="bg-violet-50"
              title="Disciplines"
              badge={
                <span className="text-[10px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                  {skills.length} selected
                </span>
              }
            >
              <div className="space-y-2">
                {DISCIPLINES.map(({ tag, label, emoji, bg, border, text, check }) => {
                  const skill = skills.find(s => s.discipline_tag === tag);
                  const active = !!skill;
                  return (
                    <div
                      key={tag}
                      className={`rounded-xl border-2 transition-all duration-200 ${
                        active
                          ? `${border} ${bg}`
                          : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleDiscipline(tag)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          active ? check : 'border-slate-200 bg-white'
                        }`}>
                          {active && <CheckOutlined className="text-white" style={{ fontSize: 10 }} />}
                        </div>
                        <span className="text-lg leading-none">{emoji}</span>
                        <span className={`text-sm font-semibold ${active ? text : 'text-slate-500'}`}>{label}</span>
                      </button>

                      {active && (
                        <div className="px-4 pb-3 grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Max Level</p>
                            <Select
                              value={skill.max_level}
                              onChange={(val) => updateSkill(tag, 'max_level', val)}
                              size="small"
                              style={{ width: '100%' }}
                            >
                              {SKILL_LEVELS.map(l => (
                                <Option key={l.value} value={l.value}>{l.label}</Option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Lesson Types</p>
                            <Select
                              mode="multiple"
                              value={skill.lesson_categories}
                              onChange={(val) => updateSkill(tag, 'lesson_categories', val.length ? val : ['private'])}
                              size="small"
                              style={{ width: '100%' }}
                              placeholder="Types..."
                              maxTagCount="responsive"
                            >
                              {LESSON_CATS.map(c => (
                                <Option key={c.value} value={c.value}>{c.label}</Option>
                              ))}
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* ── Location ─────────────────────────────────────── */}
            <SectionCard
              icon={<EnvironmentOutlined className="text-emerald-500 text-xs" />}
              iconBg="bg-emerald-50"
              title="Location"
            >
              <Form.Item name="address" label={<Label>Street Address</Label>} className="mb-3">
                <Input.TextArea rows={2} placeholder="123 Main Street, Apt 4B" className="resize-none rounded-lg" />
              </Form.Item>
              <div className="grid grid-cols-3 gap-x-4">
                <Form.Item name="city" label={<Label>City</Label>}>
                  <Input placeholder="Barcelona" className="rounded-lg" />
                </Form.Item>
                <Form.Item name="postal_code" label={<Label>Postal Code</Label>}>
                  <Input placeholder="08001" className="rounded-lg" />
                </Form.Item>
                <Form.Item name="country" label={<Label>Country</Label>}>
                  <Input placeholder="Spain" className="rounded-lg" />
                </Form.Item>
              </div>
            </SectionCard>

            {/* ── Settings ─────────────────────────────────────── */}
            <SectionCard
              icon={<TeamOutlined className="text-sky-500 text-xs" />}
              iconBg="bg-sky-50"
              title="Settings"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Form.Item name="status" label={<Label>Status</Label>} initialValue="active">
                  <Select>
                    <Option value="active">Active</Option>
                    <Option value="inactive">Inactive</Option>
                    <Option value="on_leave">On Leave</Option>
                  </Select>
                </Form.Item>
                <Form.Item name="level" label={<Label>Level</Label>}>
                  <Select placeholder="Select level">
                    <Option value="Beginner">Beginner</Option>
                    <Option value="Intermediate">Intermediate</Option>
                    <Option value="Advanced">Advanced</Option>
                    <Option value="Expert">Expert</Option>
                  </Select>
                </Form.Item>
              </div>
            </SectionCard>

          </div>

          {/* ── Sticky Footer ──────────────────────────────────── */}
          <div className="fixed bottom-0 inset-x-0 z-20 bg-white/90 backdrop-blur-md border-t border-slate-100 shadow-[0_-4px_20px_rgba(15,23,42,0.05)]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate('/instructors')}
                className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading || (!id && instructorRoleLoading)}
                disabled={!id && !instructorRoleLoading && !instructorRoleId}
                icon={<SaveOutlined />}
                size="middle"
                className="rounded-xl font-semibold px-6 shadow-md shadow-sky-200/50"
                style={{
                  background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
                  border: 'none',
                  height: 36,
                }}
              >
                {isEditing ? 'Save Changes' : 'Create Instructor'}
              </Button>
            </div>
          </div>
        </Form>
      </Spin>
    </div>
  );
};

export default InstructorFormPage;
