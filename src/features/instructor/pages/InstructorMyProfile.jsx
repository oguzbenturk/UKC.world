// src/features/instructor/pages/InstructorMyProfile.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar, Tag, Spin, Tooltip, Form, Input, DatePicker, Button, Empty, Select
} from 'antd';
import {
  UserOutlined, MailOutlined, PhoneOutlined, CalendarOutlined,
  TeamOutlined, DollarOutlined, ClockCircleOutlined, BookOutlined,
  ThunderboltOutlined, TrophyOutlined, IdcardOutlined, EditOutlined,
  SaveOutlined, CloseOutlined, BarChartOutlined, WalletOutlined,
  EnvironmentOutlined, ArrowRightOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/shared/hooks/useAuth';
import { useInstructorDashboard } from '../hooks/useInstructorDashboard';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useData } from '@/shared/hooks/useData';
import { message } from '@/shared/utils/antdStatic';
import { logger } from '@/shared/utils/logger';

// ── Nav items ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'info',     icon: <UserOutlined />,      label: 'Profile'   },
  { key: 'skills',   icon: <ThunderboltOutlined />, label: 'Skills'   },
  { key: 'lessons',  icon: <BookOutlined />,       label: 'Upcoming'  },
  { key: 'students', icon: <TeamOutlined />,        label: 'Students'  },
  { key: 'earnings', icon: <BarChartOutlined />,    label: 'Earnings'  },
];

const SECTION_DESCRIPTIONS = {
  info:     'View and edit your personal information',
  skills:   'Your skills and certifications',
  lessons:  'Upcoming scheduled lessons',
  students: 'Your student roster at a glance',
  earnings: 'Earnings overview and recent payouts',
};

// ── Helpers ────────────────────────────────────────────────────────────────
const profileImageCandidateKeys = [
  'profile_image_url', 'profileImageUrl', 'avatar_url', 'avatarUrl', 'avatar',
  'photoUrl', 'photo_url', 'imageUrl', 'image_url',
];

const getProfileImage = (user) => {
  if (!user) return null;
  for (const key of profileImageCandidateKeys) {
    const v = user[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
};

const getDisplayName = (user) => {
  if (!user) return 'Instructor';
  const composed = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return composed || user.name || user.email || 'Instructor';
};

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ── Info cell (same pattern as the modal) ─────────────────────────────────
const InfoCell = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-gray-400 mt-0.5 text-sm flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-tight">{label}</div>
        <div className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 break-all">{value}</div>
      </div>
    </div>
  );
};

// ── Profile section ────────────────────────────────────────────────────────
function ProfileSection({ user, onSaved }) {
  const { apiClient } = useData();
  const { refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const startEdit = () => {
    form.setFieldsValue({
      first_name: user?.first_name || '',
      last_name:  user?.last_name  || '',
      email:      user?.email      || '',
      phone:      user?.phone      || '',
      date_of_birth: user?.date_of_birth ? dayjs(user.date_of_birth) : null,
      bio:        user?.bio        || '',
      city:       user?.city       || '',
      country:    user?.country    || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        first_name:    values.first_name,
        last_name:     values.last_name,
        email:         values.email,
        phone:         values.phone || null,
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : null,
        bio:           values.bio || null,
        city:          values.city || null,
        country:       values.country || null,
      };
      await apiClient.put(`/users/${user.id}`, payload);
      await refreshUser();
      message.success('Profile updated');
      setEditing(false);
      onSaved?.();
    } catch (err) {
      if (err?.errorFields) return; // validation error, stay open
      logger.error('Failed to update profile', { error: String(err) });
      message.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const profileImage = getProfileImage(user);
  const statusColor  = user?.status === 'active' ? 'green' : 'red';

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/40 dark:from-slate-800 dark:to-slate-800/40 p-5">
        <div className="flex items-center gap-4">
          <Avatar
            size={56}
            src={profileImage || undefined}
            icon={!profileImage ? <UserOutlined /> : undefined}
            className="shadow-sm flex-shrink-0"
            style={{ backgroundColor: !profileImage ? '#3B82F6' : undefined }}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {getDisplayName(user)}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Tag color={statusColor} bordered={false} className="rounded-full text-xs">
                {(user?.status || 'active').toUpperCase()}
              </Tag>
              {user?.is_freelance && (
                <Tag color="purple" bordered={false} className="rounded-full text-xs">Freelance</Tag>
              )}
            </div>
          </div>
          {!editing && (
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={startEdit}
              className="text-blue-600 hover:bg-blue-50"
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        /* ── Edit form ── */
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <Form form={form} layout="vertical" size="middle">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item
                name="first_name"
                label="First Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="First name" />
              </Form.Item>
              <Form.Item
                name="last_name"
                label="Last Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="Last name" />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
              >
                <Input placeholder="email@example.com" />
              </Form.Item>
              <Form.Item name="phone" label="Phone">
                <Input placeholder="+1 234 567 8900" />
              </Form.Item>
              <Form.Item name="date_of_birth" label="Date of Birth">
                <DatePicker className="w-full" format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item name="city" label="City">
                <Input placeholder="City" />
              </Form.Item>
              <Form.Item name="country" label="Country" className="sm:col-span-1">
                <Input placeholder="Country" />
              </Form.Item>
            </div>
            <Form.Item name="bio" label="Bio">
              <Input.TextArea rows={3} placeholder="Tell students a bit about yourself…" />
            </Form.Item>
            <div className="flex gap-2 justify-end">
              <Button
                icon={<CloseOutlined />}
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSave}
              >
                Save changes
              </Button>
            </div>
          </Form>
        </div>
      ) : (
        /* ── Read-only info grid ── */
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
            <InfoCell icon={<MailOutlined />}        label="Email"         value={user?.email} />
            <InfoCell icon={<PhoneOutlined />}        label="Phone"         value={user?.phone} />
            <InfoCell icon={<CalendarOutlined />}     label="Date of Birth" value={user?.date_of_birth ? formatDate(user.date_of_birth) : null} />
            <InfoCell icon={<EnvironmentOutlined />}  label="Location"      value={[user?.city, user?.country].filter(Boolean).join(', ') || null} />
            <InfoCell icon={<CalendarOutlined />}     label="Member Since"  value={user?.created_at ? formatDate(user.created_at) : null} />
            <InfoCell icon={<IdcardOutlined />}       label="Role"          value={user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : null} />
          </div>
        </div>
      )}

      {/* Bio */}
      {!editing && user?.bio && (
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Biography</div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{user.bio}</p>
        </div>
      )}
    </div>
  );
}

// ── Skills section ─────────────────────────────────────────────────────────
function SkillsSection({ user }) {
  const hasContent = (
    user?.specializations?.length > 0 ||
    user?.certificates?.length > 0 ||
    user?.languages?.length > 0
  );

  if (!hasContent) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No skills or certifications on file"
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-4">
      {user?.specializations?.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <TrophyOutlined /> Specializations
          </div>
          <div className="flex flex-wrap gap-1.5">
            {user.specializations.map((s) => (
              <Tag key={s} color="green" bordered={false} className="rounded-full">{s}</Tag>
            ))}
          </div>
        </div>
      )}
      {user?.certificates?.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <IdcardOutlined /> Certificates
          </div>
          <div className="flex flex-wrap gap-1.5">
            {user.certificates.map((c) => (
              <Tag key={c} color="purple" bordered={false} className="rounded-full">{c}</Tag>
            ))}
          </div>
        </div>
      )}
      {user?.languages?.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Languages</div>
          <div className="flex flex-wrap gap-1.5">
            {user.languages.map((l) => (
              <Tag key={l} color="cyan" bordered={false} className="rounded-full">{l}</Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upcoming lessons section ───────────────────────────────────────────────
function LessonsSection({ lessons = [] }) {
  const statusColor = { pending: 'orange', confirmed: 'blue', completed: 'green', cancelled: 'red' };

  if (!lessons.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No upcoming lessons scheduled"
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-2">
      {lessons.map((lesson) => (
        <div
          key={lesson.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center flex-shrink-0">
              <BookOutlined className="text-sky-600 dark:text-sky-400 text-sm" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                {lesson.studentName}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formatDateTime(lesson.startTime)} · {lesson.durationHours}h
              </div>
            </div>
          </div>
          <Tag
            color={statusColor[lesson.status] || 'default'}
            bordered={false}
            className="rounded-full text-xs flex-shrink-0"
          >
            {lesson.status || 'pending'}
          </Tag>
        </div>
      ))}
    </div>
  );
}

// ── Students section ───────────────────────────────────────────────────────
function StudentsSection({ studentStats = {}, inactiveStudents = [], inactiveWindowDays = 30, navigate }) {
  return (
    <div className="space-y-5">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{studentStats.uniqueStudents ?? '—'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Students</div>
        </div>
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{studentStats.activeThisMonth ?? '—'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Active This Month</div>
        </div>
      </div>

      {/* Inactive students */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Inactive {inactiveWindowDays}+ days
          </div>
          <Button
            type="link"
            size="small"
            icon={<ArrowRightOutlined />}
            onClick={() => navigate('/instructor/students')}
            className="text-blue-600 p-0 h-auto"
          >
            View all
          </Button>
        </div>
        {inactiveStudents.length === 0 ? (
          <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-6 text-center text-sm text-gray-400">
            All students have been active recently
          </div>
        ) : (
          <div className="space-y-2">
            {inactiveStudents.map((s) => (
              <div
                key={s.studentId}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar size={32} icon={<UserOutlined />} className="bg-slate-200 dark:bg-slate-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{s.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Last lesson: {s.lastLessonAt ? formatDate(s.lastLessonAt) : 'Never'}
                      &nbsp;·&nbsp;{s.completedLessons} completed
                    </div>
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
      {/* Balance grid */}
      <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Earnings Balance</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatAmt(finance.totalEarned || 0)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Total Earned</div>
          </div>
          <div>
            <div className="text-sm font-bold text-green-600">{formatAmt(finance.totalPaid || 0)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Paid Out</div>
          </div>
          <div>
            <div className={`text-sm font-bold ${(finance.pending || 0) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {formatAmt(finance.pending || 0)}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Pending</div>
          </div>
        </div>
      </div>

      {/* Supplementary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center">
          <div className="text-xl font-bold text-sky-600">{(finance.totalHours || 0).toFixed(1)}h</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Hours</div>
        </div>
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center">
          <div className="text-xl font-bold text-emerald-600">{formatAmt(finance.monthToDate || 0)}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">This Month</div>
        </div>
      </div>

      {/* Recent earnings */}
      {recentEarnings.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Recent Earnings</div>
          <div className="space-y-2">
            {recentEarnings.map((e, i) => (
              <div
                key={e.bookingId || i}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{e.studentName || '—'}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(e.lessonDate)} · {e.durationHours}h
                  </div>
                </div>
                <div className="text-sm font-semibold text-emerald-600 flex-shrink-0">+{formatAmt(e.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent payouts */}
      {recentPayments.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Recent Payouts</div>
          <div className="space-y-2">
            {recentPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {p.description || p.type || 'Payout'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(p.paymentDate)}{p.method ? ` · ${p.method}` : ''}
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-shrink-0">{formatAmt(p.amount)}</div>
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

// ── Main page ──────────────────────────────────────────────────────────────
export default function InstructorMyProfile() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { data: dashData, loading: dashLoading } = useInstructorDashboard();
  const { businessCurrency } = useCurrency();
  const { formatCurrency } = useCurrency();

  const [activeSection, setActiveSection] = useState('info');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const profileImage = getProfileImage(user);
  const statusColor  = user?.status === 'active' ? 'green' : 'red';

  const formatAmt = useCallback((amount) => {
    try {
      return formatCurrency(amount, businessCurrency || 'EUR');
    } catch {
      return `€${Number(amount || 0).toFixed(2)}`;
    }
  }, [formatCurrency, businessCurrency]);

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
      default:
        return null;
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px)] w-full relative overflow-hidden bg-gray-50/50 dark:bg-slate-900">

      {/* ── Icon rail (always 56px) ── */}
      <div className="w-14 flex-shrink-0 bg-slate-50 dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col relative z-10">
        {/* Avatar — click to expand sidebar */}
        <div className="p-2 border-b border-gray-200 dark:border-slate-700 flex items-center justify-center">
          <button
            onClick={() => setSidebarExpanded((prev) => !prev)}
            className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-blue-200 transition-shadow"
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Avatar
              size={36}
              src={profileImage || undefined}
              icon={!profileImage ? <UserOutlined /> : undefined}
              style={{ backgroundColor: !profileImage ? '#3B82F6' : undefined }}
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
                    ? 'bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 bg-transparent dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
              </button>
            </Tooltip>
          ))}
        </nav>
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
        className="absolute top-0 bottom-0 left-0 z-30 w-[200px] bg-slate-50 dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col shadow-xl"
        style={{
          transform: sidebarExpanded ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)',
          willChange: 'transform',
        }}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarExpanded(false)}
              className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-blue-200 transition-shadow"
            >
              <Avatar
                size={36}
                src={profileImage || undefined}
                icon={!profileImage ? <UserOutlined /> : undefined}
                style={{ backgroundColor: !profileImage ? '#3B82F6' : undefined }}
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                {getDisplayName(user)}
              </div>
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
                  ? 'bg-blue-50 text-blue-700 font-medium shadow-sm dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-normal bg-transparent dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 sm:p-4 md:p-6 max-w-2xl">
          <div className="mb-4 md:mb-5">
            <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">
              {NAV_ITEMS.find((n) => n.key === activeSection)?.label}
            </h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 hidden sm:block">
              {SECTION_DESCRIPTIONS[activeSection]}
            </p>
          </div>
          {renderContent()}
        </div>
      </div>

    </div>
  );
}
