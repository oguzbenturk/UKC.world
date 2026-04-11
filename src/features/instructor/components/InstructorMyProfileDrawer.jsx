// src/features/instructor/components/InstructorMyProfileDrawer.jsx
// src/features/instructor/components/InstructorMyProfileDrawer.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Drawer, Avatar, Tag, Spin, Tooltip, Form, Input, DatePicker, Button, Empty, Progress, Select, Modal
} from 'antd';
import {
  UserOutlined, MailOutlined, PhoneOutlined, CalendarOutlined,
  TeamOutlined, DollarOutlined, BookOutlined, ThunderboltOutlined,
  TrophyOutlined, IdcardOutlined, EditOutlined, SaveOutlined,
  CloseOutlined, BarChartOutlined, EnvironmentOutlined, ArrowRightOutlined,
  LockOutlined, CameraOutlined, CheckCircleFilled, ClockCircleOutlined,
  SafetyCertificateOutlined, PlusOutlined, StopOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/shared/hooks/useAuth';
import { useInstructorDashboard } from '../hooks/useInstructorDashboard';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useData } from '@/shared/hooks/useData';
import { message } from '@/shared/utils/antdStatic';
import { logger } from '@/shared/utils/logger';
import { useInstructorAvailability } from '../hooks/useInstructorAvailability';

// ── Nav items ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'info',         icon: <UserOutlined />,              label: 'Profile'    },
  { key: 'skills',       icon: <ThunderboltOutlined />,        label: 'Skills'     },
  { key: 'lessons',      icon: <BookOutlined />,               label: 'Upcoming'   },
  { key: 'students',     icon: <TeamOutlined />,               label: 'Students'   },
  { key: 'earnings',     icon: <BarChartOutlined />,           label: 'Earnings'   },
  { key: 'availability', icon: <CalendarOutlined />,           label: 'Time Off'   },
  { key: 'security',     icon: <LockOutlined />,               label: 'Security'   },
];

const SECTION_DESCRIPTIONS = {
  info:         'View and edit your personal information',
  skills:       'Your skills and certifications',
  lessons:      'Upcoming scheduled lessons',
  students:     'Your student roster at a glance',
  earnings:     'Earnings overview and recent payouts',
  availability: 'Request time off and view your availability schedule',
  security:     'Change your password and review account security',
};

// ── Helpers ────────────────────────────────────────────────────────────────
const profileImageKeys = [
  'profile_image_url','profileImageUrl','avatar_url','avatarUrl',
  'avatar','photoUrl','photo_url','imageUrl','image_url',
];

const getProfileImage = (user) => {
  if (!user) return null;
  for (const k of profileImageKeys) {
    const v = user[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
};

const getDisplayName = (user) => {
  if (!user) return 'Instructor';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return full || user.name || user.email || 'Instructor';
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// ── InfoCell ───────────────────────────────────────────────────────────────
const InfoCell = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-slate-400 mt-0.5 text-sm flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-tight">{label}</div>
        <div className="text-sm text-slate-700 mt-0.5 break-all">{value}</div>
      </div>
    </div>
  );
};

// ── Password strength checker ──────────────────────────────────────────────
const PASSWORD_CHECKS = [
  { label: 'At least 8 characters',       test: (v) => v.length >= 8 },
  { label: 'One uppercase letter',         test: (v) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter',         test: (v) => /[a-z]/.test(v) },
  { label: 'One number',                   test: (v) => /\d/.test(v) },
  { label: 'One special character (@$!%*?&)', test: (v) => /[@$!%*?&]/.test(v) },
];

function PasswordStrength({ value = '' }) {
  const passed = PASSWORD_CHECKS.filter((c) => c.test(value)).length;
  const pct = (passed / PASSWORD_CHECKS.length) * 100;
  const color = passed <= 1 ? '#ef4444' : passed <= 3 ? '#f59e0b' : passed === 4 ? '#3b82f6' : '#10b981';
  if (!value) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <Progress percent={pct} showInfo={false} strokeColor={color} size="small" />
      <div className="grid grid-cols-1 gap-0.5">
        {PASSWORD_CHECKS.map((c) => {
          const ok = c.test(value);
          return (
            <div key={c.label} className="flex items-center gap-1.5">
              <CheckCircleFilled className={`text-[10px] ${ok ? 'text-emerald-500' : 'text-slate-300'}`} />
              <span className={`text-[11px] ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>{c.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Profile section ────────────────────────────────────────────────────────
function ProfileSection({ user, onSaved }) {
  const { apiClient } = useData();
  const { refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();
  const fileInputRef = useRef(null);

  const startEdit = () => {
    form.setFieldsValue({
      first_name:    user?.first_name    || '',
      last_name:     user?.last_name     || '',
      email:         user?.email         || '',
      phone:         user?.phone         || '',
      date_of_birth: user?.date_of_birth ? dayjs(user.date_of_birth) : null,
      bio:           user?.bio           || '',
      city:          user?.city          || '',
      country:       user?.country       || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await apiClient.put(`/users/${user.id}`, {
        first_name:    values.first_name,
        last_name:     values.last_name,
        email:         values.email,
        phone:         values.phone         || null,
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : null,
        bio:           values.bio           || null,
        city:          values.city          || null,
        country:       values.country       || null,
      });
      await refreshUser();
      message.success('Profile updated');
      setEditing(false);
      onSaved?.();
    } catch (err) {
      if (err?.errorFields) return;
      logger.error('Failed to update profile', { error: String(err) });
      message.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      message.error('Image must be under 2MB');
      return;
    }
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);
      await apiClient.post('/users/upload-avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      message.success('Profile photo updated');
    } catch (err) {
      logger.error('Avatar upload failed', { error: String(err) });
      message.error('Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const profileImage = getProfileImage(user);
  const statusColor  = user?.status === 'active' ? 'green' : 'red';

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-indigo-50/40 border border-slate-200 p-5">
        <div className="flex items-center gap-4">
          {/* Avatar with upload overlay */}
          <div className="relative flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Spin spinning={uploading} size="small">
              <div
                className="relative group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                title="Change profile photo"
              >
                <Avatar
                  size={64}
                  src={profileImage || undefined}
                  icon={!profileImage ? <UserOutlined /> : undefined}
                  className="shadow-md ring-2 ring-white"
                  style={{ backgroundColor: !profileImage ? '#6366f1' : undefined }}
                />
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <CameraOutlined className="text-white text-base" />
                </div>
              </div>
            </Spin>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900 truncate">{getDisplayName(user)}</h3>
            <p className="text-xs text-slate-500 truncate mt-0.5">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Tag color={statusColor} bordered={false} className="rounded-full text-xs m-0">
                {(user?.status || 'active').toUpperCase()}
              </Tag>
              {user?.is_freelance && (
                <Tag color="purple" bordered={false} className="rounded-full text-xs m-0">Freelance</Tag>
              )}
              {user?.role && (
                <Tag color="blue" bordered={false} className="rounded-full text-xs m-0">
                  {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </Tag>
              )}
            </div>
          </div>

          {!editing && (
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={startEdit}
              className="text-indigo-600 hover:bg-indigo-50 flex-shrink-0"
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-4">Edit Profile</p>
          <Form form={form} layout="vertical" size="middle">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'Required' }]} className="!mb-3">
                <Input placeholder="First name" />
              </Form.Item>
              <Form.Item name="last_name" label="Last Name" rules={[{ required: true, message: 'Required' }]} className="!mb-3">
                <Input placeholder="Last name" />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]} className="!mb-3">
                <Input placeholder="email@example.com" />
              </Form.Item>
              <Form.Item name="phone" label="Phone" className="!mb-3">
                <Input placeholder="+1 234 567 8900" />
              </Form.Item>
              <Form.Item name="date_of_birth" label="Date of Birth" className="!mb-3">
                <DatePicker className="w-full" format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item name="city" label="City" className="!mb-3">
                <Input placeholder="City" />
              </Form.Item>
              <Form.Item name="country" label="Country" className="!mb-3">
                <Input placeholder="Country" />
              </Form.Item>
            </div>
            <Form.Item name="bio" label="Bio" className="!mb-4">
              <Input.TextArea rows={3} placeholder="Tell students a bit about yourself…" />
            </Form.Item>
            <div className="flex gap-2 justify-end">
              <Button icon={<CloseOutlined />} onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>Save changes</Button>
            </div>
          </Form>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-4">Personal Information</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
            <InfoCell icon={<MailOutlined />}          label="Email"         value={user?.email} />
            <InfoCell icon={<PhoneOutlined />}          label="Phone"         value={user?.phone} />
            <InfoCell icon={<CalendarOutlined />}       label="Date of Birth" value={user?.date_of_birth ? fmtDate(user.date_of_birth) : null} />
            <InfoCell icon={<EnvironmentOutlined />}    label="Location"      value={[user?.city, user?.country].filter(Boolean).join(', ') || null} />
            <InfoCell icon={<CalendarOutlined />}       label="Member Since"  value={user?.created_at ? fmtDate(user.created_at) : null} />
            <InfoCell icon={<IdcardOutlined />}         label="Role"          value={user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : null} />
          </div>
        </div>
      )}

      {!editing && user?.bio && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Biography</p>
          <p className="text-sm text-slate-600 leading-relaxed">{user.bio}</p>
        </div>
      )}
    </div>
  );
}

// ── Skills section ─────────────────────────────────────────────────────────
function SkillsSection({ user }) {
  const hasContent = user?.specializations?.length > 0 || user?.certificates?.length > 0 || user?.languages?.length > 0;
  if (!hasContent) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No skills or certifications on file" className="py-10" />;
  }
  return (
    <div className="space-y-4">
      {user?.specializations?.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5"><TrophyOutlined /> Specializations</p>
          <div className="flex flex-wrap gap-1.5">{user.specializations.map((s) => <Tag key={s} color="green" bordered={false} className="rounded-full">{s}</Tag>)}</div>
        </div>
      )}
      {user?.certificates?.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5"><IdcardOutlined /> Certificates</p>
          <div className="flex flex-wrap gap-1.5">{user.certificates.map((c) => <Tag key={c} color="purple" bordered={false} className="rounded-full">{c}</Tag>)}</div>
        </div>
      )}
      {user?.languages?.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Languages</p>
          <div className="flex flex-wrap gap-1.5">{user.languages.map((l) => <Tag key={l} color="cyan" bordered={false} className="rounded-full">{l}</Tag>)}</div>
        </div>
      )}
    </div>
  );
}

// ── Upcoming lessons section ───────────────────────────────────────────────
function LessonsSection({ lessons = [] }) {
  const statusColor = { pending: 'orange', confirmed: 'blue', completed: 'green', cancelled: 'red' };
  if (!lessons.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No upcoming lessons scheduled" className="py-10" />;
  }
  return (
    <div className="space-y-2">
      {lessons.map((lesson) => (
        <div key={lesson.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
              <BookOutlined className="text-sky-600 text-sm" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800 truncate">{lesson.studentName}</div>
              <div className="text-xs text-slate-500">{fmtDateTime(lesson.startTime)} · {lesson.durationHours}h</div>
            </div>
          </div>
          <Tag color={statusColor[lesson.status] || 'default'} bordered={false} className="rounded-full text-xs flex-shrink-0">
            {lesson.status || 'pending'}
          </Tag>
        </div>
      ))}
    </div>
  );
}

// ── Students section ───────────────────────────────────────────────────────
function StudentsSection({ studentStats = {}, inactiveStudents = [], inactiveWindowDays = 30, onClose, navigate }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{studentStats.uniqueStudents ?? '—'}</div>
          <div className="text-xs text-slate-500 mt-1">Total Students</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{studentStats.activeThisMonth ?? '—'}</div>
          <div className="text-xs text-slate-500 mt-1">Active This Month</div>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Inactive {inactiveWindowDays}+ days</p>
          <Button
            type="link" size="small" icon={<ArrowRightOutlined />}
            onClick={() => { onClose(); navigate('/instructor/students'); }}
            className="text-indigo-600 p-0 h-auto"
          >
            View all
          </Button>
        </div>
        {inactiveStudents.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
            All students have been active recently
          </div>
        ) : (
          <div className="space-y-2">
            {inactiveStudents.map((s) => (
              <div key={s.studentId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar size={32} icon={<UserOutlined />} className="bg-slate-200 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{s.name}</div>
                    <div className="text-xs text-slate-500">Last: {s.lastLessonAt ? fmtDate(s.lastLessonAt) : 'Never'} · {s.completedLessons} completed</div>
                  </div>
                </div>
                <Tag color="orange" bordered={false} className="rounded-full text-xs flex-shrink-0">Inactive</Tag>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Earnings section ───────────────────────────────────────────────────────
function EarningsSection({ finance = {}, formatAmt }) {
  const { recentEarnings = [], recentPayments = [] } = finance;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-4">Earnings Balance</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-sm font-bold text-slate-800">{formatAmt(finance.totalEarned || 0)}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Total Earned</div>
          </div>
          <div>
            <div className="text-sm font-bold text-emerald-600">{formatAmt(finance.totalPaid || 0)}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Paid Out</div>
          </div>
          <div>
            <div className={`text-sm font-bold ${(finance.pending || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {formatAmt(finance.pending || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Pending</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-xl font-bold text-sky-600">{(finance.totalHours || 0).toFixed(1)}h</div>
          <div className="text-xs text-slate-500 mt-1">Total Hours</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-xl font-bold text-emerald-600">{formatAmt(finance.monthToDate || 0)}</div>
          <div className="text-xs text-slate-500 mt-1">This Month</div>
        </div>
      </div>

      {recentEarnings.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Recent Earnings</p>
          <div className="space-y-2">
            {recentEarnings.map((e, i) => (
              <div key={e.bookingId || i} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{e.studentName || '—'}</div>
                  <div className="text-xs text-slate-500">{fmtDate(e.lessonDate)} · {e.durationHours}h</div>
                </div>
                <div className="text-sm font-semibold text-emerald-600 flex-shrink-0">+{formatAmt(e.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentPayments.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Recent Payouts</p>
          <div className="space-y-2">
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{p.description || p.type || 'Payout'}</div>
                  <div className="text-xs text-slate-500">{fmtDate(p.paymentDate)}{p.method ? ` · ${p.method}` : ''}</div>
                </div>
                <div className="text-sm font-semibold text-slate-700 flex-shrink-0">{formatAmt(p.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentEarnings.length === 0 && recentPayments.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No earnings data yet" className="py-6" />
      )}
    </div>
  );
}

// ── Security section ───────────────────────────────────────────────────────
// ── AvailabilitySection ────────────────────────────────────────────────────

const TYPE_LABELS = {
  off_day:   'Off Day',
  vacation:  'Vacation',
  sick_leave: 'Sick Leave',
  custom:    'Custom',
};
const TYPE_COLORS = {
  off_day:   'orange',
  vacation:  'blue',
  sick_leave: 'red',
  custom:    'purple',
};
const STATUS_COLORS = {
  pending:   'warning',
  approved:  'success',
  rejected:  'error',
  cancelled: 'default',
};

function AvailabilitySection() {
  const { entries, loading, error, load, requestOff, cancel } = useInstructorAvailability();
  const [form] = Form.useForm();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => { load({ from: dayjs().format('YYYY-MM-DD') }); }, [load]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const [start, end] = values.dateRange;
      await requestOff({
        start_date: start.format('YYYY-MM-DD'),
        end_date: end.format('YYYY-MM-DD'),
        type: values.type,
        reason: values.reason || undefined,
      });
      message.success('Time-off request submitted');
      form.resetFields();
      setShowForm(false);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = (id) => {
    Modal.confirm({
      title: 'Cancel this request?',
      icon: <ExclamationCircleOutlined />,
      content: 'The request will be marked as cancelled.',
      okText: 'Yes, cancel it',
      okType: 'danger',
      onOk: async () => {
        setCancellingId(id);
        try {
          await cancel(id);
          message.success('Request cancelled');
        } catch (err) {
          message.error(err?.response?.data?.error || 'Failed to cancel request');
        } finally {
          setCancellingId(null);
        }
      },
    });
  };

  const upcoming = entries.filter((e) => e.status !== 'cancelled' && e.status !== 'rejected');
  const past = entries.filter((e) => e.status === 'cancelled' || e.status === 'rejected');

  return (
    <div className="space-y-4">
      {/* Request form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <CalendarOutlined /> Request Time Off
          </p>
          <Button
            size="small"
            type={showForm ? 'default' : 'primary'}
            icon={showForm ? <CloseOutlined /> : <PlusOutlined />}
            onClick={() => setShowForm((v) => !v)}
            className={showForm ? '' : '!bg-indigo-600 !border-indigo-600 hover:!bg-indigo-700'}
          >
            {showForm ? 'Cancel' : 'New Request'}
          </Button>
        </div>

        {showForm && (
          <Form form={form} layout="vertical" size="middle">
            <Form.Item
              name="dateRange"
              label="Date Range"
              rules={[{ required: true, message: 'Select a date range' }]}
              className="!mb-3"
            >
              <DatePicker.RangePicker
                className="w-full"
                disabledDate={(d) => d && d.isBefore(dayjs(), 'day')}
                format="DD MMM YYYY"
              />
            </Form.Item>

            <Form.Item
              name="type"
              label="Type"
              initialValue="off_day"
              rules={[{ required: true }]}
              className="!mb-3"
            >
              <Select options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>

            <Form.Item name="reason" label="Reason (optional)" className="!mb-4">
              <Input.TextArea rows={2} placeholder="Optional note for your manager" maxLength={300} showCount />
            </Form.Item>

            <Button
              type="primary"
              loading={submitting}
              onClick={handleSubmit}
              className="!bg-indigo-600 !border-indigo-600 hover:!bg-indigo-700 w-full"
            >
              Submit Request
            </Button>
          </Form>
        )}
      </div>

      {/* Entries list */}
      {error && <p className="text-red-500 text-sm px-1">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-8"><Spin /></div>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <Empty description="No time-off requests yet" className="py-8" />
      ) : (
        <div className="space-y-2">
          {upcoming.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-1">Upcoming</p>
              {upcoming.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Tag color={TYPE_COLORS[entry.type] || 'default'} className="!text-xs !m-0">
                        {TYPE_LABELS[entry.type] || entry.type}
                      </Tag>
                      <Tag color={STATUS_COLORS[entry.status] || 'default'} className="!text-xs !m-0">
                        {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                      </Tag>
                    </div>
                    <p className="text-sm font-medium text-slate-700 mt-1">
                      {dayjs(entry.start_date).format('D MMM YYYY')}
                      {entry.start_date !== entry.end_date && (
                        <> &mdash; {dayjs(entry.end_date).format('D MMM YYYY')}</>
                      )}
                    </p>
                    {entry.reason && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{entry.reason}</p>
                    )}
                  </div>
                  {entry.status === 'pending' && (
                    <Button
                      size="small"
                      danger
                      icon={<StopOutlined />}
                      loading={cancellingId === entry.id}
                      onClick={() => handleCancel(entry.id)}
                      className="flex-shrink-0"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </>
          )}

          {past.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-1 mt-3">Past / Cancelled</p>
              {past.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 opacity-60">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Tag color={TYPE_COLORS[entry.type] || 'default'} className="!text-xs !m-0">
                      {TYPE_LABELS[entry.type] || entry.type}
                    </Tag>
                    <Tag color={STATUS_COLORS[entry.status] || 'default'} className="!text-xs !m-0">
                      {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                    </Tag>
                  </div>
                  <p className="text-sm text-slate-600">
                    {dayjs(entry.start_date).format('D MMM YYYY')}
                    {entry.start_date !== entry.end_date && (
                      <> &mdash; {dayjs(entry.end_date).format('D MMM YYYY')}</>
                    )}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SecuritySection({ user }) {
  const { apiClient } = useData();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [newPwValue, setNewPwValue] = useState('');

  const handleChangePassword = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await apiClient.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('Password changed successfully');
      form.resetFields();
      setNewPwValue('');
    } catch (err) {
      if (err?.errorFields) return;
      const errMsg = err?.response?.data?.error || 'Failed to change password';
      message.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Password change form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
          <LockOutlined /> Change Password
        </p>
        <Form form={form} layout="vertical" size="middle">
          <Form.Item
            name="currentPassword"
            label="Current Password"
            rules={[{ required: true, message: 'Please enter your current password' }]}
            className="!mb-4"
          >
            <Input.Password placeholder="Your current password" prefix={<LockOutlined className="text-slate-300" />} />
          </Form.Item>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item
              name="newPassword"
              label="New Password"
              rules={[
                { required: true, message: 'Please enter a new password' },
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve();
                    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
                    if (regex.test(value)) return Promise.resolve();
                    return Promise.reject(new Error('Password does not meet requirements'));
                  },
                },
              ]}
              className="!mb-1"
            >
              <Input.Password
                placeholder="New password"
                prefix={<LockOutlined className="text-slate-300" />}
                onChange={(e) => setNewPwValue(e.target.value)}
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="Confirm New Password"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Please confirm your new password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
              className="!mb-4"
            >
              <Input.Password
                placeholder="Confirm new password"
                prefix={<LockOutlined className="text-slate-300" />}
              />
            </Form.Item>
          </div>

          <PasswordStrength value={newPwValue} />

          <div className="flex justify-end mt-4">
            <Button
              type="primary"
              icon={<LockOutlined />}
              loading={saving}
              onClick={handleChangePassword}
            >
              Update Password
            </Button>
          </div>
        </Form>
      </div>

      {/* Account info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
          <SafetyCertificateOutlined /> Account Security
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IdcardOutlined className="text-slate-400 text-sm" />
              <span className="text-sm text-slate-600">Account Status</span>
            </div>
            <Tag
              color={user?.status === 'active' ? 'green' : 'red'}
              bordered={false}
              className="rounded-full text-xs m-0"
            >
              {(user?.status || 'active').toUpperCase()}
            </Tag>
          </div>

          {user?.created_at && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClockCircleOutlined className="text-slate-400 text-sm" />
                <span className="text-sm text-slate-600">Member Since</span>
              </div>
              <span className="text-sm text-slate-500">{fmtDate(user.created_at)}</span>
            </div>
          )}

          {user?.last_login_at && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SafetyCertificateOutlined className="text-slate-400 text-sm" />
                <span className="text-sm text-slate-600">Last Login</span>
              </div>
              <span className="text-sm text-slate-500">{fmtDateTime(user.last_login_at)}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LockOutlined className="text-slate-400 text-sm" />
              <span className="text-sm text-slate-600">Two-Factor Auth</span>
            </div>
            <Tag
              color={user?.two_factor_enabled ? 'green' : 'default'}
              bordered={false}
              className="rounded-full text-xs m-0"
            >
              {user?.two_factor_enabled ? 'ENABLED' : 'DISABLED'}
            </Tag>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main drawer component ──────────────────────────────────────────────────
const InstructorMyProfileDrawer = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const isInstructor = isAuthenticated && ['instructor', 'manager']
    .includes(user?.role?.toLowerCase());
  const { data: dashData, loading: dashLoading } = useInstructorDashboard(0, { enabled: isInstructor });
  const { businessCurrency, formatCurrency } = useCurrency();

  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('info');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : 960
  );

  useEffect(() => {
    if (!isInstructor) return undefined;
    const handleOpen = () => { setActiveSection('info'); setOpen(true); };
    window.addEventListener('instructorProfile:open', handleOpen);
    return () => window.removeEventListener('instructorProfile:open', handleOpen);
  }, [isInstructor]);

  useEffect(() => {
    const onResize = () => setDrawerWidth(window.innerWidth < 640 ? '100%' : 960);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSidebarExpanded(false);
  }, []);

  const formatAmt = useCallback((amount) => {
    try { return formatCurrency(amount, businessCurrency || 'EUR'); }
    catch { return `€${Number(amount || 0).toFixed(2)}`; }
  }, [formatCurrency, businessCurrency]);

  if (!isInstructor) return null;

  const profileImage = getProfileImage(user);
  const statusColor  = user?.status === 'active' ? 'green' : 'red';

  const renderContent = () => {
    switch (activeSection) {
      case 'info':
        return <ProfileSection user={user} onSaved={refreshUser} />;
      case 'skills':
        return <SkillsSection user={user} />;
      case 'lessons':
        return (
          <Spin spinning={dashLoading && !dashData}>
            <LessonsSection lessons={dashData?.upcomingLessons || []} />
          </Spin>
        );
      case 'students':
        return (
          <Spin spinning={dashLoading && !dashData}>
            <StudentsSection
              studentStats={dashData?.studentStats || {}}
              inactiveStudents={dashData?.lessonInsights?.inactiveStudents || []}
              inactiveWindowDays={dashData?.lessonInsights?.inactiveWindowDays || 30}
              onClose={handleClose}
              navigate={navigate}
            />
          </Spin>
        );
      case 'earnings':
        return (
          <Spin spinning={dashLoading && !dashData}>
            <EarningsSection finance={dashData?.finance || {}} formatAmt={formatAmt} />
          </Spin>
        );
      case 'availability':
        return <AvailabilitySection />;
      case 'security':
        return <SecuritySection user={user} />;
      default:
        return null;
    }
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={drawerWidth}
      closable={false}
      destroyOnHidden
      styles={{ body: { padding: 0, display: 'flex', overflow: 'hidden' }, header: { display: 'none' } }}
    >
      <div className="flex h-full w-full relative overflow-hidden">

        {/* ── Icon rail (always 56px) ── */}
        <div className="w-14 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col relative z-10">
          {/* Avatar toggle */}
          <div className="p-2 border-b border-slate-200 flex items-center justify-center">
            <button
              onClick={() => setSidebarExpanded((prev) => !prev)}
              className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-indigo-200 transition-shadow"
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Avatar
                size={36}
                src={profileImage || undefined}
                icon={!profileImage ? <UserOutlined /> : undefined}
                style={{ backgroundColor: !profileImage ? '#6366f1' : undefined }}
              />
            </button>
          </div>

          {/* Icon nav */}
          <nav className="flex-1 py-2 px-1 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <Tooltip key={item.key} title={item.label} placement="right">
                <button
                  onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors duration-150 cursor-pointer border-0 ${
                    activeSection === item.key
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 bg-transparent'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                </button>
              </Tooltip>
            ))}
          </nav>

          {/* Close */}
          <div className="p-1 border-t border-slate-200">
            <Tooltip title="Close" placement="right">
              <button
                onClick={handleClose}
                className="w-full flex items-center justify-center py-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer border-0 bg-transparent"
              >
                <CloseOutlined className="text-sm" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* ── Backdrop ── */}
        <div
          className="absolute inset-0 z-20 transition-opacity duration-200"
          style={{
            background: 'rgba(0,0,0,0.15)',
            opacity: sidebarExpanded ? 1 : 0,
            pointerEvents: sidebarExpanded ? 'auto' : 'none',
          }}
          onClick={() => setSidebarExpanded(false)}
        />

        {/* ── Expanded sidebar ── */}
        <div
          className="absolute top-0 bottom-0 left-0 z-30 w-[200px] bg-slate-50 border-r border-slate-200 flex flex-col shadow-xl"
          style={{
            transform: sidebarExpanded ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)',
            willChange: 'transform',
          }}
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarExpanded(false)}
                className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-indigo-200 transition-shadow"
              >
                <Avatar
                  size={36}
                  src={profileImage || undefined}
                  icon={!profileImage ? <UserOutlined /> : undefined}
                  style={{ backgroundColor: !profileImage ? '#6366f1' : undefined }}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{getDisplayName(user)}</div>
                <Tag color={statusColor} bordered={false} className="rounded-full text-[10px] mt-0.5 px-1.5 py-0 leading-4">
                  {(user?.status || 'active').toUpperCase()}
                </Tag>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => { setActiveSection(item.key); setSidebarExpanded(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 cursor-pointer border-0 text-left ${
                  activeSection === item.key
                    ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-normal bg-transparent'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Close */}
          <div className="p-3 border-t border-slate-200">
            <button
              onClick={handleClose}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer border-0 bg-transparent"
            >
              <CloseOutlined className="text-xs" /> Close
            </button>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          <div className="p-3 sm:p-4 md:p-6">
            <div className="mb-4 md:mb-5">
              <h2 className="text-base md:text-lg font-semibold text-slate-900">
                {NAV_ITEMS.find((n) => n.key === activeSection)?.label}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                {SECTION_DESCRIPTIONS[activeSection]}
              </p>
            </div>
            {renderContent()}
          </div>
        </div>

      </div>
    </Drawer>
  );
};

export default InstructorMyProfileDrawer;
