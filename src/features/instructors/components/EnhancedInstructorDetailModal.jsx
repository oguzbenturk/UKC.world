import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, Tag, Spin, Avatar, Typography, Switch, Tooltip, Form, DatePicker, Select, Button, Empty, Modal } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserOutlined, MailOutlined, PhoneOutlined,
  CalendarOutlined, TrophyOutlined, EnvironmentOutlined,
  DollarOutlined, WalletOutlined, IdcardOutlined,
  BarChartOutlined, CloseOutlined, ThunderboltOutlined,
  PlusOutlined, CheckOutlined, StopOutlined, DeleteOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  fetchInstructorAvailability,
  createInstructorAvailabilityBlock,
  updateAvailabilityStatus,
  deleteInstructorAvailabilityEntry,
} from '@/features/instructor/services/instructorAvailabilityApi';
import InstructorServiceCommission from './InstructorServiceCommission';
import InstructorSkillsManager from './InstructorSkillsManager';
import InstructorPayments from './InstructorPayments';
import PayrollDashboard from './PayrollDashboard';
import { useData } from '@/shared/hooks/useData';
import { logger } from '@/shared/utils/logger';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { formatCurrency } from '@/shared/utils/formatters';

const { Text } = Typography;

const NAV_ICONS = [
  { key: 'info',         icon: <UserOutlined /> },
  { key: 'skills',       icon: <ThunderboltOutlined /> },
  { key: 'commissions',  icon: <DollarOutlined /> },
  { key: 'dashboard',    icon: <BarChartOutlined /> },
  { key: 'payments',     icon: <WalletOutlined /> },
  { key: 'availability', icon: <CalendarOutlined /> },
];

// ── Constants shared with the admin availability UI ───────────────────────
const TYPE_LABELS = {
  off_day:    'Off Day',
  vacation:   'Vacation',
  sick_leave: 'Sick Leave',
  custom:     'Custom',
};
const TYPE_COLORS = {
  off_day:    'orange',
  vacation:   'blue',
  sick_leave: 'red',
  custom:     'purple',
};
const STATUS_COLORS = {
  pending:   'warning',
  approved:  'success',
  rejected:  'error',
  cancelled: 'default',
};

// ── Admin availability panel ──────────────────────────────────────────────
function AdminAvailabilityPanel({ instructorId }) {
  const { t } = useTranslation(['instructor']);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchInstructorAvailability(instructorId, { from: dayjs().subtract(30, 'day').format('YYYY-MM-DD') });
      setEntries(data);
    } catch (err) {
      message.error(t('instructor:instructorsList.detailModal.failedToLoadAvailability'));
    } finally {
      setLoading(false);
    }
  }, [instructorId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const [start, end] = values.dateRange;
      const entry = await createInstructorAvailabilityBlock(instructorId, {
        start_date: start.format('YYYY-MM-DD'),
        end_date: end.format('YYYY-MM-DD'),
        type: values.type,
        reason: values.reason || undefined,
      });
      setEntries((prev) => [entry, ...prev]);
      message.success(t('instructor:instructorsList.detailModal.availabilityBlockCreated'));
      form.resetFields();
      setShowForm(false);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || t('instructor:instructorsList.detailModal.failedToCreateBlock'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (entryId, status) => {
    setActionId(entryId);
    try {
      const updated = await updateAvailabilityStatus(instructorId, entryId, status);
      setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      message.success(t('instructor:instructorsList.detailModal.requestStatus', { status }));
    } catch (err) {
      message.error(err?.response?.data?.error || t('instructor:instructorsList.detailModal.failedToUpdateStatus'));
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = (entryId) => {
    Modal.confirm({
      title: t('instructor:instructorsList.detailModal.deleteAvailabilityTitle'),
      icon: <ExclamationCircleOutlined />,
      okText: t('instructor:instructorsList.detailModal.deleteOk'),
      okType: 'danger',
      onOk: async () => {
        setActionId(entryId);
        try {
          await deleteInstructorAvailabilityEntry(instructorId, entryId);
          setEntries((prev) => prev.filter((e) => e.id !== entryId));
          message.success(t('instructor:instructorsList.detailModal.entryDeleted'));
        } catch (err) {
          message.error(err?.response?.data?.error || t('instructor:instructorsList.detailModal.failedToDelete'));
        } finally {
          setActionId(null);
        }
      },
    });
  };

  const pending = entries.filter((e) => e.status === 'pending');
  const rest = entries.filter((e) => e.status !== 'pending');

  return (
    <div className="space-y-4">
      {/* Create new block */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <CalendarOutlined /> {t('instructor:instructorsList.detailModal.createAvailabilityBlock')}
          </p>
          <Button
            size="small"
            type={showForm ? 'default' : 'primary'}
            icon={showForm ? <CloseOutlined /> : <PlusOutlined />}
            onClick={() => setShowForm((v) => !v)}
            className={showForm ? '' : '!bg-indigo-600 !border-indigo-600 hover:!bg-indigo-700'}
          >
            {showForm ? t('instructor:instructorsList.detailModal.cancel') : t('instructor:instructorsList.detailModal.newBlock')}
          </Button>
        </div>

        {showForm && (
          <Form form={form} layout="vertical" size="middle">
            <Form.Item name="dateRange" label={t('instructor:instructorsList.detailModal.dateRange')} rules={[{ required: true, message: t('instructor:instructorsList.detailModal.selectDateRange') }]} className="!mb-3">
              <DatePicker.RangePicker className="w-full" format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="type" label={t('instructor:instructorsList.detailModal.type')} initialValue="off_day" rules={[{ required: true }]} className="!mb-3">
              <Select options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
            <Form.Item name="reason" label={t('instructor:instructorsList.detailModal.reasonOptional')} className="!mb-4">
              <Form.Item name="reason" noStyle>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder={t('instructor:instructorsList.detailModal.reasonPlaceholder')} maxLength={300} />
              </Form.Item>
            </Form.Item>
            <Button type="primary" loading={submitting} onClick={handleCreate} className="!bg-indigo-600 !border-indigo-600 hover:!bg-indigo-700 w-full">
              {t('instructor:instructorsList.detailModal.createBlockAutoApproved')}
            </Button>
          </Form>
        )}
      </div>

      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 flex items-center gap-1.5">
            {t('instructor:instructorsList.detailModal.pendingRequests', { count: pending.length })}
          </p>
          {pending.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-amber-200 bg-white p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Tag color={TYPE_COLORS[entry.type] || 'default'} className="!text-xs !m-0">{TYPE_LABELS[entry.type] || entry.type}</Tag>
                  <Tag color="warning" className="!text-xs !m-0">Pending</Tag>
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {dayjs(entry.start_date).format('D MMM YYYY')}
                  {entry.start_date !== entry.end_date && <> &mdash; {dayjs(entry.end_date).format('D MMM YYYY')}</>}
                </p>
                {entry.reason && <p className="text-xs text-slate-400 mt-0.5 truncate">{entry.reason}</p>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <Button size="small" type="primary" icon={<CheckOutlined />} loading={actionId === entry.id}
                  onClick={() => handleStatusChange(entry.id, 'approved')}
                  className="!bg-green-600 !border-green-600 hover:!bg-green-700">
                  {t('instructor:instructorsList.detailModal.approve')}
                </Button>
                <Button size="small" danger icon={<StopOutlined />} loading={actionId === entry.id}
                  onClick={() => handleStatusChange(entry.id, 'rejected')}>
                  {t('instructor:instructorsList.detailModal.reject')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All entries */}
      {loading ? (
        <div className="flex justify-center py-8"><Spin /></div>
      ) : rest.length === 0 && pending.length === 0 ? (
        <Empty description={t('instructor:instructorsList.detailModal.noAvailabilityEntries')} className="py-8" />
      ) : rest.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-1">{t('instructor:instructorsList.detailModal.allEntries')}</p>
          {rest.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Tag color={TYPE_COLORS[entry.type] || 'default'} className="!text-xs !m-0">{TYPE_LABELS[entry.type] || entry.type}</Tag>
                  <Tag color={STATUS_COLORS[entry.status] || 'default'} className="!text-xs !m-0">
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </Tag>
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {dayjs(entry.start_date).format('D MMM YYYY')}
                  {entry.start_date !== entry.end_date && <> &mdash; {dayjs(entry.end_date).format('D MMM YYYY')}</>}
                </p>
                {entry.reason && <p className="text-xs text-slate-400 mt-0.5 truncate">{entry.reason}</p>}
                {entry.reviewed_by_name && (
                  <p className="text-[10px] text-slate-400 mt-0.5">{t('instructor:instructorsList.detailModal.reviewedBy', { name: entry.reviewed_by_name })}</p>
                )}
              </div>
              <Button size="small" danger icon={<DeleteOutlined />} loading={actionId === entry.id}
                onClick={() => handleDelete(entry.id)}>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EnhancedInstructorDetailModal = ({
  instructor,
  isOpen,
  onClose,
  onUpdate = () => {},
  initialTab = 'info',
}) => {
  const { t } = useTranslation(['instructor']);
  const { businessCurrency } = useCurrency();

  const NAV_ITEMS = NAV_ICONS.map(({ key, icon }) => ({
    key, icon,
    label: t(`instructor:instructorsList.detailModal.navItems.${key}`),
  }));
  const SECTION_DESCRIPTIONS = {
    info: t('instructor:instructorsList.detailModal.sectionDescriptions.info'),
    skills: t('instructor:instructorsList.detailModal.sectionDescriptions.skills'),
    commissions: t('instructor:instructorsList.detailModal.sectionDescriptions.commissions'),
    dashboard: t('instructor:instructorsList.detailModal.sectionDescriptions.dashboard'),
    payments: t('instructor:instructorsList.detailModal.sectionDescriptions.payments'),
    availability: t('instructor:instructorsList.detailModal.sectionDescriptions.availability'),
  };
  const [activeSection, setActiveSection] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [instructorServices, setInstructorServices] = useState([]);
  const [recentLessons, setRecentLessons] = useState([]);
  const [earningsBalance, setEarningsBalance] = useState(null);
  const { apiClient } = useData();
  const hasFetchedRef = useRef(false);
  const [isFreelance, setIsFreelance] = useState(false);
  const [freelanceLoading, setFreelanceLoading] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640) ? '100%' : 960);

  const instructorPaymentsRef = useRef(null);
  const payrollDashboardRef = useRef(null);
  const serviceCommissionRef = useRef(null);

  const fetchInstructorData = useCallback(async () => {
    if (!instructor?.id) return;
    setLoading(true);
    try {
      const [servicesRes, lessonsRes, earningsRes] = await Promise.allSettled([
        apiClient.get(`/instructors/${instructor.id}/services`),
        apiClient.get(`/instructors/${instructor.id}/lessons?limit=10000`),
        apiClient.get(`/finances/instructor-earnings/${instructor.id}`),
      ]);
      if (servicesRes.status === 'fulfilled') setInstructorServices(servicesRes.value.data || []);
      if (lessonsRes.status === 'fulfilled') setRecentLessons(lessonsRes.value.data || []);
      if (earningsRes.status === 'fulfilled') {
        const { earnings = [], payrollHistory = [] } = earningsRes.value.data || {};
        const totalEarned = earnings.reduce((s, e) => s + parseFloat(e.total_earnings || 0), 0);
        const totalPaid = payrollHistory.reduce((s, p) => s + Math.abs(parseFloat(p.amount || 0)), 0);
        setEarningsBalance({ totalEarned, totalPaid, balance: totalEarned - totalPaid });
      }
    } catch (error) {
      logger.error('Error fetching instructor data', { error: String(error) });
    } finally {
      setLoading(false);
    }
  }, [apiClient, instructor?.id]);

  // Sync freelance state when instructor changes
  useEffect(() => {
    if (instructor) setIsFreelance(!!instructor.is_freelance);
  }, [instructor]);

  // Responsive drawer width
  useEffect(() => {
    const onResize = () => setDrawerWidth(window.innerWidth < 640 ? '100%' : 960);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch once on open, not on every re-render
  useEffect(() => {
    if (isOpen && instructor?.id && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchInstructorData();
    }
    if (!isOpen) {
      hasFetchedRef.current = false;
    }
  }, [isOpen, instructor?.id, fetchInstructorData]);

  // Sync active section when drawer opens with a specific initialTab
  useEffect(() => {
    if (isOpen) setActiveSection(initialTab || 'info');
  }, [isOpen, initialTab]);

  const refreshActiveSection = useCallback(async () => {
    await fetchInstructorData();
    if (activeSection === 'payments' && instructorPaymentsRef.current?.refreshData) {
      await instructorPaymentsRef.current.refreshData();
    }
    if (activeSection === 'dashboard' && payrollDashboardRef.current?.refreshData) {
      await payrollDashboardRef.current.refreshData();
    }
    if (activeSection === 'commissions' && serviceCommissionRef.current?.refreshData) {
      await serviceCommissionRef.current.refreshData();
    }
    onUpdate();
  }, [fetchInstructorData, activeSection, onUpdate]);

  const handleFreelanceToggle = useCallback(async (checked) => {
    if (!instructor?.id) return;
    setFreelanceLoading(true);
    try {
      await apiClient.put(`/users/${instructor.id}`, { is_freelance: checked });
      setIsFreelance(checked);
      instructor.is_freelance = checked;
      onUpdate();
      message.success(checked ? t('instructor:instructorsList.detailModal.markedAsFreelance') : t('instructor:instructorsList.detailModal.removedFreelanceStatus'));
    } catch (err) {
      logger.error('Failed to update freelance status', { error: String(err) });
      message.error(t('instructor:instructorsList.detailModal.failedToUpdateFreelance'));
    } finally {
      setFreelanceLoading(false);
    }
  }, [apiClient, instructor, onUpdate]);

  if (!instructor) return null;

  const statusColor = instructor.status === 'active' ? 'green' : 'red';

  const renderInfoCell = (icon, label, value) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-2 min-w-0">
        <span className="text-gray-400 mt-0.5 text-sm flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-tight">{label}</div>
          <div className="text-sm text-gray-800 mt-0.5 truncate">{value}</div>
        </div>
      </div>
    );
  };

  const renderInfoRow = (icon, label, value) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
        <span className="text-gray-400 mt-0.5 text-base">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</div>
          <div className="text-sm text-gray-800 mt-0.5">{value}</div>
        </div>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="space-y-5">
      {/* Profile header card */}
      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/40 p-5">
        <div className="flex items-center gap-4">
          <Avatar
            size={56}
            src={instructor.profile_image_url}
            icon={!instructor.profile_image_url && <UserOutlined />}
            className="shadow-sm flex-shrink-0"
            style={{ backgroundColor: !instructor.profile_image_url ? '#3B82F6' : undefined }}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 truncate">{instructor.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Tag color={statusColor} bordered={false} className="rounded-full text-xs">{(instructor.status || 'active').toUpperCase()}</Tag>
              {instructor.level && <Tag color="blue" bordered={false} className="rounded-full text-xs">{instructor.level}</Tag>}
            </div>
          </div>
        </div>
      </div>

      {/* Contact info — 3-column compact grid */}
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
          {renderInfoCell(<MailOutlined />, t('instructor:instructorsList.detailModal.email'), instructor.email)}
          {renderInfoCell(<PhoneOutlined />, t('instructor:instructorsList.detailModal.phone'), instructor.phone)}
          {renderInfoCell(<CalendarOutlined />, t('instructor:instructorsList.detailModal.dateOfBirth'), instructor.date_of_birth)}
          {renderInfoCell(<EnvironmentOutlined />, t('instructor:instructorsList.detailModal.location'),
            [instructor.city, instructor.country].filter(Boolean).join(', ') || null
          )}
          {renderInfoCell(<CalendarOutlined />, t('instructor:instructorsList.detailModal.joined'),
            instructor.created_at ? new Date(instructor.created_at).toLocaleDateString() : null
          )}
          {instructor.hourly_rate && renderInfoCell(<DollarOutlined />, t('instructor:instructorsList.detailModal.hourlyRate'),
            `${formatCurrency(Number(instructor.hourly_rate) || 0, businessCurrency || 'EUR')}/hour`
          )}
        </div>
        {/* Freelance toggle — full width row */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm"><IdcardOutlined /></span>
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{t('instructor:instructorsList.detailModal.freelanceLabel')}</div>
              <div className="text-xs text-gray-500 mt-0.5">{t('instructor:instructorsList.detailModal.freelanceDesc')}</div>
            </div>
          </div>
          <Switch
            checked={isFreelance}
            onChange={handleFreelanceToggle}
            loading={freelanceLoading}
            size="small"
          />
        </div>
      </div>

      {/* Tags section */}
      {(instructor.specializations?.length > 0 || instructor.certificates?.length > 0 || instructor.languages?.length > 0) && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 space-y-4">
          {instructor.specializations?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <TrophyOutlined /> {t('instructor:instructorsList.detailModal.specializations')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {instructor.specializations.map((spec) => (
                  <Tag key={spec} color="green" bordered={false} className="rounded-full">{spec}</Tag>
                ))}
              </div>
            </div>
          )}
          {instructor.certificates?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <IdcardOutlined /> {t('instructor:instructorsList.detailModal.certificates')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {instructor.certificates.map((cert) => (
                  <Tag key={cert} color="purple" bordered={false} className="rounded-full">{cert}</Tag>
                ))}
              </div>
            </div>
          )}
          {instructor.languages?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                {t('instructor:instructorsList.detailModal.languages')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {instructor.languages.map((lang) => (
                  <Tag key={lang} color="cyan" bordered={false} className="rounded-full">{lang}</Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{instructorServices.length}</div>
          <div className="text-xs text-gray-500 mt-1">{t('instructor:instructorsList.detailModal.servicesAssigned')}</div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{recentLessons.length}</div>
          <div className="text-xs text-gray-500 mt-1">{t('instructor:instructorsList.detailModal.totalLessons')}</div>
        </div>
      </div>

      {/* Assigned services list */}
      {instructorServices.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{t('instructor:instructorsList.detailModal.assignedServices')}</div>
          <div className="flex flex-wrap gap-1.5">
            {instructorServices.map((svc) => (
              <Tag key={svc.id} color="blue" bordered={false} className="rounded-full">{svc.name}</Tag>
            ))}
          </div>
        </div>
      )}

      {/* Balance card */}
      {earningsBalance !== null && (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{t('instructor:instructorsList.detailModal.earningsBalance')}</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-sm font-bold text-gray-800">{formatCurrency(earningsBalance.totalEarned, businessCurrency || 'EUR')}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{t('instructor:instructorsList.detailModal.totalEarned')}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-green-600">{formatCurrency(earningsBalance.totalPaid, businessCurrency || 'EUR')}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{t('instructor:instructorsList.detailModal.paidOut')}</div>
            </div>
            <div>
              <div className={`text-sm font-bold ${earningsBalance.balance > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                {formatCurrency(earningsBalance.balance, businessCurrency || 'EUR')}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">{t('instructor:instructorsList.detailModal.available')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Bio & notes */}
      {instructor.bio && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{t('instructor:instructorsList.detailModal.biography')}</div>
          <Text className="text-sm text-gray-700 leading-relaxed">{instructor.bio}</Text>
        </div>
      )}
      {instructor.notes && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{t('instructor:instructorsList.detailModal.notes')}</div>
          <Text className="text-sm text-gray-700 leading-relaxed">{instructor.notes}</Text>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'info':
        return renderProfile();
      case 'skills':
        return (
          <InstructorSkillsManager
            instructorId={instructor.id}
            onSave={refreshActiveSection}
          />
        );
      case 'commissions':
        return (
          <InstructorServiceCommission
            ref={serviceCommissionRef}
            instructorId={instructor.id}
            onSave={() => {
              message.success(t('instructor:instructorsList.detailModal.commissionSaved'));
              refreshActiveSection();
            }}
          />
        );
      case 'dashboard':
        return <PayrollDashboard ref={payrollDashboardRef} instructor={instructor} />;
      case 'payments':
        return (
          <InstructorPayments
            ref={instructorPaymentsRef}
            instructor={instructor}
            onPaymentSuccess={refreshActiveSection}
          />
        );
      case 'availability':
        return <AdminAvailabilityPanel instructorId={instructor.id} />;
      default:
        return null;
    }
  };

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      width={drawerWidth}
      closable={false}
      destroyOnHidden
      styles={{ body: { padding: 0, display: 'flex', overflow: 'hidden' }, header: { display: 'none' } }}
    >
      <div className="flex h-full w-full relative overflow-hidden">
        {/* ── Icon rail (always 56px, always visible) ── */}
        <div className="w-14 flex-shrink-0 bg-slate-50 border-r border-gray-200 flex flex-col relative z-10">
          {/* Avatar toggle */}
          <div className="p-2 border-b border-gray-200 flex items-center justify-center">
            <button
              onClick={() => setSidebarExpanded(prev => !prev)}
              className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-blue-200 transition-shadow"
              title={sidebarExpanded ? t('instructor:instructorsList.detailModal.collapseSidebar') : t('instructor:instructorsList.detailModal.expandSidebar')}
            >
              <Avatar
                size={36}
                src={instructor.profile_image_url}
                icon={!instructor.profile_image_url && <UserOutlined />}
                style={{ backgroundColor: !instructor.profile_image_url ? '#3B82F6' : undefined }}
              />
            </button>
          </div>

          {/* Icon nav */}
          <nav className="flex-1 py-2 px-1 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map(item => (
              <Tooltip key={item.key} title={item.label} placement="right">
                <button
                  onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors duration-150 cursor-pointer border-0 ${
                    activeSection === item.key
                      ? 'bg-blue-50 text-blue-700 shadow-sm'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 bg-transparent'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                </button>
              </Tooltip>
            ))}
          </nav>

          {/* Close icon */}
          <div className="p-1 border-t border-gray-200">
            <Tooltip title={t('instructor:instructorsList.detailModal.close')} placement="right">
              <button onClick={onClose} className="w-full flex items-center justify-center py-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer border-0 bg-transparent">
                <CloseOutlined className="text-sm" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* ── Backdrop (when expanded sidebar is open) ── */}
        <div
          className="absolute inset-0 z-20 transition-opacity duration-200"
          style={{ background: 'rgba(0,0,0,0.15)', opacity: sidebarExpanded ? 1 : 0, pointerEvents: sidebarExpanded ? 'auto' : 'none' }}
          onClick={() => setSidebarExpanded(false)}
        />

        {/* ── Expanded sidebar (slides from left) ── */}
        <div
          className="absolute top-0 bottom-0 left-0 z-30 w-[200px] bg-slate-50 border-r border-gray-200 flex flex-col shadow-xl"
          style={{
            transform: sidebarExpanded ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)',
            willChange: 'transform',
          }}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarExpanded(false)}
                className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-blue-200 transition-shadow"
              >
                <Avatar
                  size={36}
                  src={instructor.profile_image_url}
                  icon={!instructor.profile_image_url && <UserOutlined />}
                  style={{ backgroundColor: !instructor.profile_image_url ? '#3B82F6' : undefined }}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800 truncate">{instructor.name}</div>
                <Tag color={statusColor} bordered={false} className="rounded-full text-[10px] mt-0.5 px-1.5 py-0 leading-4">
                  {(instructor.status || 'active').toUpperCase()}
                </Tag>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
            {NAV_ITEMS.map(item => (
              <button
                key={item.key}
                onClick={() => { setActiveSection(item.key); setSidebarExpanded(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 cursor-pointer border-0 text-left ${
                  activeSection === item.key
                    ? 'bg-blue-50 text-blue-700 font-medium shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-normal bg-transparent'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Close */}
          <div className="p-3 border-t border-gray-200">
            <button onClick={onClose} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer border-0 bg-transparent">
              <CloseOutlined className="text-xs" /> {t('instructor:instructorsList.detailModal.close')}
            </button>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          <div className="p-3 sm:p-4 md:p-6">
            <div className="mb-3 md:mb-5">
              <h2 className="text-base md:text-lg font-semibold text-gray-900">
                {NAV_ITEMS.find(n => n.key === activeSection)?.label}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
                {SECTION_DESCRIPTIONS[activeSection]}
              </p>
            </div>
            <Spin spinning={loading && activeSection === 'info'}>
              {renderContent()}
            </Spin>
          </div>
        </div>
      </div>
    </Drawer>
  );
};

export default EnhancedInstructorDetailModal;
