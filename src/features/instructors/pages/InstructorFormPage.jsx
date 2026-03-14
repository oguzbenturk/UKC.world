import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Spin, DatePicker, Upload, Select } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ArrowLeftOutlined, UserOutlined, MailOutlined, PhoneOutlined,
  LockOutlined, CalendarOutlined, EnvironmentOutlined,
  CameraOutlined, SaveOutlined, TeamOutlined, DollarOutlined,
  BookOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import { useData } from '@/shared/hooks/useData';
import { ROLE_IDS } from '@/shared/constants/roles';
import apiClient from '@/shared/services/apiClient';

const { Option } = Select;

// ── Section header component ──────────────────────────────────────────────────
const SectionHeader = ({ icon, title }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex-shrink-0 text-xs">
      {icon}
    </div>
    <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{title}</h3>
  </div>
);

// ── Form section card ─────────────────────────────────────────────────────────
const FormSection = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 ${className}`}>
    {children}
  </div>
);

// ── Teaching skills constants ─────────────────────────────────────────────────
const DISCIPLINES = [
  { tag: 'kite',      label: 'Kite',      emoji: '🪁' },
  { tag: 'wing',      label: 'Wing',      emoji: '🪂' },
  { tag: 'kite_foil', label: 'Kite Foil', emoji: '🏄' },
  { tag: 'efoil',     label: 'E-Foil',    emoji: '⚡' },
  { tag: 'premium',   label: 'Premium',   emoji: '⭐' },
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

const InstructorFormPage = () => {
  const [form] = Form.useForm();
  const { id } = useParams();
  const navigate = useNavigate();
  const { addInstructor, updateInstructor, fetchInstructorById, loading: dataLoading } = useData();
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [skills, setSkills] = useState([]);

  // useWatch avoids calling form.getFieldValue() outside a mounted <Form> (fixes antd warning)
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
    setLoading(true);
    try {
      const payload = {
        ...values,
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : null,
        profile_image_url: avatarUrl,
        name: `${values.first_name} ${values.last_name}`.trim(),
        role_id: ROLE_IDS.instructor,
      };
      delete payload.status;
      delete payload.confirm_password;

      let instructorId = id;
      if (isEditing) {
        await updateInstructor(id, payload);
      } else {
        const created = await addInstructor(payload);
        instructorId = created?.id;
      }

      // Save teaching skills
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
    <div className="min-h-screen bg-slate-50/60 pb-20">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/instructors')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeftOutlined />
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div>
            <h1 className="text-sm font-semibold text-slate-900 leading-tight">
              {isEditing ? 'Edit Instructor' : 'New Instructor'}
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              {isEditing ? 'Update profile information' : 'Add a new instructor to your team'}
            </p>
          </div>
        </div>
      </div>

      <Spin spinning={loading || dataLoading}>
        <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-3">

            {/* ── Avatar Section ──────────────────────────────────── */}
            <FormSection>
              <div className="flex items-center gap-4">
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
                  <div className="relative cursor-pointer flex-shrink-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-sky-100 to-indigo-100 border border-slate-200 shadow-sm">
                      {displayAvatar ? (
                        <img src={displayAvatar} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-xl font-bold text-sky-400">{initials}</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-sky-500 hover:bg-sky-600 rounded-md flex items-center justify-center shadow transition-colors">
                      <CameraOutlined className="text-white" style={{ fontSize: 10 }} />
                    </div>
                  </div>
                </Upload>
                <div>
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.first_name !== cur.first_name || prev.last_name !== cur.last_name}>
                    {({ getFieldValue }) => {
                      const name = `${getFieldValue('first_name') || ''} ${getFieldValue('last_name') || ''}`.trim();
                      return <p className="text-sm font-semibold text-slate-700">{name || 'New Instructor'}</p>;
                    }}
                  </Form.Item>
                  <p className="text-xs text-slate-400 mt-0.5">Click photo to upload · JPG/PNG, max 5 MB</p>
                </div>
              </div>
            </FormSection>

            {/* ── Personal Information ─────────────────────────────── */}
            <FormSection>
              <SectionHeader icon={<UserOutlined />} title="Personal Information" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                <Form.Item name="first_name" label={<span className="text-xs font-medium text-slate-600">First Name <span className="text-red-400">*</span></span>} rules={[{ required: true, message: 'Required' }]}>
                  <Input prefix={<UserOutlined className="text-slate-300" />} placeholder="Alex" />
                </Form.Item>
                <Form.Item name="last_name" label={<span className="text-xs font-medium text-slate-600">Last Name <span className="text-red-400">*</span></span>} rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="Johnson" />
                </Form.Item>
                <Form.Item name="email" label={<span className="text-xs font-medium text-slate-600">Email <span className="text-red-400">*</span></span>} rules={[{ required: true, type: 'email', message: 'Valid email required' }]} className="sm:col-span-2">
                  <Input prefix={<MailOutlined className="text-slate-300" />} placeholder="instructor@example.com" />
                </Form.Item>
                <Form.Item name="phone" label={<span className="text-xs font-medium text-slate-600">Phone</span>}>
                  <Input prefix={<PhoneOutlined className="text-slate-300" />} placeholder="+1 555 000 0000" />
                </Form.Item>
                <Form.Item name="date_of_birth" label={<span className="text-xs font-medium text-slate-600">Date of Birth</span>}>
                  <DatePicker style={{ width: '100%' }} placeholder="Select date" suffixIcon={<CalendarOutlined className="text-slate-300" />} />
                </Form.Item>
              </div>
            </FormSection>

            {/* ── Account Security (create only) ───────────────────── */}
            {!isEditing && (
              <FormSection>
                <SectionHeader icon={<LockOutlined />} title="Account Security" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                  <Form.Item
                    name="password"
                    label={<span className="text-xs font-medium text-slate-600">Password <span className="text-red-400">*</span></span>}
                    rules={[{ required: true, message: 'Password is required' }, { min: 8, message: 'Min. 8 characters' }]}
                  >
                    <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Min. 8 characters" />
                  </Form.Item>
                  <Form.Item
                    name="confirm_password"
                    label={<span className="text-xs font-medium text-slate-600">Confirm Password <span className="text-red-400">*</span></span>}
                    dependencies={['password']}
                    rules={[
                      { required: true, message: 'Please confirm password' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) return Promise.resolve();
                          return Promise.reject(new Error('Passwords do not match'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Repeat password" />
                  </Form.Item>
                </div>
              </FormSection>
            )}

            {/* ── Teaching Skills ──────────────────────────────────── */}
            <FormSection>
              <SectionHeader icon={<BookOutlined />} title="Teaching Skills" />
              <p className="text-xs text-slate-400 -mt-1 mb-3">Select the disciplines this instructor can teach</p>
              <div className="space-y-1.5">
                {DISCIPLINES.map(({ tag, label, emoji }) => {
                  const skill = skills.find(s => s.discipline_tag === tag);
                  const active = !!skill;
                  return (
                    <div
                      key={tag}
                      className={`rounded-lg border transition-colors ${
                        active ? 'border-sky-200 bg-sky-50/60' : 'border-slate-100 bg-slate-50/40'
                      }`}
                    >
                      {/* Toggle row */}
                      <button
                        type="button"
                        onClick={() => toggleDiscipline(tag)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          active ? 'border-sky-500 bg-sky-500' : 'border-slate-300 bg-white'
                        }`}>
                          {active && <span className="text-white leading-none" style={{ fontSize: 9 }}>✓</span>}
                        </div>
                        <span className="text-sm leading-none">{emoji}</span>
                        <span className={`text-xs font-semibold leading-none ${
                          active ? 'text-sky-700' : 'text-slate-400'
                        }`}>{label}</span>
                      </button>

                      {/* Expanded options */}
                      {active && (
                        <div className="px-3 pb-2.5 grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 mb-1">Max Level</p>
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
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 mb-1">Lesson Types</p>
                            <Select
                              mode="multiple"
                              value={skill.lesson_categories}
                              onChange={(val) => updateSkill(tag, 'lesson_categories', val.length ? val : ['private'])}
                              size="small"
                              style={{ width: '100%' }}
                              placeholder="Types…"
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
            </FormSection>

            {/* ── Location + Settings (combined row) ───────────────── */}
            <FormSection>
              <SectionHeader icon={<EnvironmentOutlined />} title="Location" />
              <Form.Item name="address" label={<span className="text-xs font-medium text-slate-600">Street Address</span>} className="mb-3">
                <Input.TextArea rows={2} placeholder="123 Main Street, Apt 4B" className="resize-none" />
              </Form.Item>
              <div className="grid grid-cols-3 gap-x-3">
                <Form.Item name="city" label={<span className="text-xs font-medium text-slate-600">City</span>}>
                  <Input placeholder="Barcelona" />
                </Form.Item>
                <Form.Item name="postal_code" label={<span className="text-xs font-medium text-slate-600">Postal Code</span>}>
                  <Input placeholder="08001" />
                </Form.Item>
                <Form.Item name="country" label={<span className="text-xs font-medium text-slate-600">Country</span>}>
                  <Input placeholder="Spain" />
                </Form.Item>
              </div>
            </FormSection>

            <FormSection>
              <SectionHeader icon={<TeamOutlined />} title="Settings" />
              <div className="grid grid-cols-2 gap-x-3">
                <Form.Item name="level" label={<span className="text-xs font-medium text-slate-600">Level</span>}>
                  <Select placeholder="Select level">
                    <Option value="Beginner">Beginner</Option>
                    <Option value="Intermediate">Intermediate</Option>
                    <Option value="Advanced">Advanced</Option>
                    <Option value="Expert">Expert</Option>
                  </Select>
                </Form.Item>
                <Form.Item name="preferred_currency" label={<span className="text-xs font-medium text-slate-600">Currency</span>} initialValue="EUR">
                  <Select>
                    <Option value="EUR">🇪🇺 EUR</Option>
                    <Option value="USD">🇺🇸 USD</Option>
                    <Option value="GBP">🇬🇧 GBP</Option>
                    <Option value="TRY">🇹🇷 TRY</Option>
                  </Select>
                </Form.Item>
              </div>
            </FormSection>

          </div>

          {/* ── Sticky Footer Actions ────────────────────────────────── */}
          <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur-sm border-t border-slate-100 shadow-[0_-2px_12px_rgba(15,23,42,0.07)]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate('/instructors')}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<SaveOutlined />}
                size="small"
                className="rounded-lg font-semibold"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%)',
                  border: 'none',
                  height: 30,
                  paddingInline: 16,
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
