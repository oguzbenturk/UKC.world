import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Drawer, Tag, Spin, Avatar, Typography, Tooltip, Form, Switch,
  InputNumber, Select, Input, Divider, Row, Col, Table, Button,
  Empty, Progress, Statistic, Card, Segmented, DatePicker
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserOutlined, MailOutlined, CalendarOutlined,
  DollarOutlined, SettingOutlined, BarChartOutlined,
  CloseOutlined, CheckCircleOutlined, ClockCircleOutlined,
  PercentageOutlined, SaveOutlined, ThunderboltOutlined,
  RightOutlined
} from '@ant-design/icons';
import {
  getManagerSettings,
  getManagerCommissionsAdmin,
  getManagerSummaryAdmin,
  updateManagerSettings,
} from '../services/managerCommissionApi';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';
import InstructorSkillsManager from '@/features/instructors/components/InstructorSkillsManager';
import InstructorServiceCommission from '@/features/instructors/components/InstructorServiceCommission';
import PayrollDashboard from '@/features/instructors/components/PayrollDashboard';
import ManagerPayments from './ManagerPayments';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;

const NAV_ITEMS = [
  { key: 'info', icon: <UserOutlined />, label: 'Profile' },
  { key: 'skills', icon: <ThunderboltOutlined />, label: 'Skills' },
  { key: 'commissions', icon: <SettingOutlined />, label: 'Commissions' },
  { key: 'earnings', icon: <BarChartOutlined />, label: 'Earnings' },
  { key: 'history', icon: <DollarOutlined />, label: 'History' },
  { key: 'payroll', icon: <CalendarOutlined />, label: 'Payments' },
];

const SECTION_DESCRIPTIONS = {
  info: 'Manager profile and quick stats',
  skills: 'Teaching skills and qualifications',
  commissions: 'Configure salary type and commission rates',
  earnings: 'Manager & instructor earnings overview',
  history: 'Bookings, rentals & commission details',
  payroll: 'Payments and transaction history',
};

const SOURCE_COLOR = { booking: 'blue', rental: 'green', accommodation: 'purple', shop: 'orange', membership: 'cyan', package: 'magenta' };
const STATUS_TAG = {
  paid: { color: 'green', icon: <CheckCircleOutlined /> },
  pending: { color: 'gold', icon: <ClockCircleOutlined /> },
  cancelled: { color: 'red', icon: null },
};

const SALARY_TYPE_MAP = {
  commission: { color: 'blue', icon: <PercentageOutlined />, label: 'Commission Based' },
  fixed_per_lesson: { color: 'green', icon: <DollarOutlined />, label: 'Fixed Per Lesson' },
  monthly_salary: { color: 'purple', icon: <DollarOutlined />, label: 'Monthly Salary' },
};

const CATEGORY_DEFS = [
  { key: 'bookings', label: 'Bookings', color: '#1890ff' },
  { key: 'rentals', label: 'Rentals', color: '#52c41a' },
  { key: 'accommodation', label: 'Accommodation', color: '#722ed1' },
  { key: 'shop', label: 'Shop', color: '#fa8c16' },
  { key: 'membership', label: 'Membership', color: '#13c2c2' },
  { key: 'packages', label: 'Packages', color: '#eb2f96' },
];

// Category breakdown is now computed from summary endpoint in renderEarnings()

// ─── Main Component ──────────────────────────────────────────────
const EnhancedManagerDetailPanel = ({ manager, isOpen, onClose, onUpdate = () => {} }) => {
  const [activeSection, setActiveSection] = useState('info');
  const [loading, setLoading] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640) ? '100%' : 1040);

  // Data
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [instructorCommission, setInstructorCommission] = useState(null);
  const [instructorEarnings, setInstructorEarnings] = useState({ total: 0, paid: 0, lessons: [] });

  // History filters
  const [historySourceType, setHistorySourceType] = useState(null);
  const [historyStatus, setHistoryStatus] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  // Earnings date range
  const [earningsDateRange, setEarningsDateRange] = useState({ startDate: null, endDate: null });
  const [earningsQuickRange, setEarningsQuickRange] = useState(null);

  // Instructor/Manager sub-tab toggles
  const [commissionTab, setCommissionTab] = useState('manager');
  const [earningsOpen, setEarningsOpen] = useState({});
  const [categoryToggles, setCategoryToggles] = useState({
    bookingRate: false, rentalRate: false, accommodationRate: false,
    shopRate: false, membershipRate: false, packageRate: false,
  });

  const [form] = Form.useForm();
  const salaryType = Form.useWatch('salaryType', form);
  const hasFetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!manager?.id) return;
    setLoading(true);
    try {
      const commOpts = { limit: 0 };
      const summaryOpts = {};
      if (earningsDateRange.startDate) {
        commOpts.startDate = earningsDateRange.startDate;
        summaryOpts.startDate = earningsDateRange.startDate;
      }
      if (earningsDateRange.endDate) {
        commOpts.endDate = earningsDateRange.endDate;
        summaryOpts.endDate = earningsDateRange.endDate;
      }
      const [settingsRes, commissionsRes, summaryRes, instrCommRes, instrEarnRes] = await Promise.allSettled([
        getManagerSettings(manager.id),
        getManagerCommissionsAdmin(manager.id, commOpts),
        getManagerSummaryAdmin(manager.id, summaryOpts),
        apiClient.get(`/instructor-commissions/instructors/${manager.id}/commissions`),
        apiClient.get(`/finances/instructor-earnings/${manager.id}`),
      ]);
      if (settingsRes.status === 'fulfilled' && settingsRes.value.success) setSettings(settingsRes.value.data);
      if (commissionsRes.status === 'fulfilled' && commissionsRes.value.success) setCommissions(commissionsRes.value.data || []);
      if (summaryRes.status === 'fulfilled' && summaryRes.value.success) setSummary(summaryRes.value.data);
      if (instrCommRes.status === 'fulfilled' && instrCommRes.value?.data) setInstructorCommission(instrCommRes.value.data);
      if (instrEarnRes.status === 'fulfilled' && instrEarnRes.value?.data) {
        const ed = instrEarnRes.value.data;
        const lessons = ed.earnings || [];
        const total = lessons.reduce((s, e) => s + parseFloat(e.total_earnings || 0), 0);
        const paid = (ed.payrollHistory || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
        setInstructorEarnings({ total, paid, lessons });
      }
    } catch { /* best effort */ } finally {
      setLoading(false);
    }
  }, [manager?.id, earningsDateRange]);

  // Responsive
  useEffect(() => {
    const onResize = () => setDrawerWidth(window.innerWidth < 640 ? '100%' : 1040);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch once on open — fetchData intentionally excluded from deps to prevent
  // infinite re-render loop (setEarningsDateRange creates new object → fetchData
  // recreated → effect re-runs → loop). The hasFetchedRef guards against stale calls.
  useEffect(() => {
    if (isOpen && manager?.id && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchData();
    }
    if (!isOpen) {
      hasFetchedRef.current = false;
      setActiveSection('info');
      setSidebarExpanded(false);
      setEarningsDateRange({ startDate: null, endDate: null });
      setEarningsQuickRange(null);
    }
  }, [isOpen, manager?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when date range changes (skip initial)
  const dateRangeInitRef = useRef(true);
  useEffect(() => {
    if (dateRangeInitRef.current) { dateRangeInitRef.current = false; return; }
    if (isOpen && manager?.id) fetchData();
  }, [earningsDateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate form when settings change or section switches to commissions
  useEffect(() => {
    if (activeSection === 'commissions' && settings) {
      form.setFieldsValue({
        salaryType: settings.salaryType || 'commission',
        bookingRate: settings.bookingRate || null,
        rentalRate: settings.rentalRate || null,
        accommodationRate: settings.accommodationRate || null,
        packageRate: settings.packageRate || null,
        shopRate: settings.shopRate || null,
        membershipRate: settings.membershipRate || null,
        fixedSalaryAmount: settings.fixedSalaryAmount || null,
        perLessonAmount: settings.perLessonAmount || null,
      });
      setCategoryToggles({
        bookingRate: parseFloat(settings.bookingRate) > 0,
        rentalRate: parseFloat(settings.rentalRate) > 0,
        accommodationRate: parseFloat(settings.accommodationRate) > 0,
        shopRate: parseFloat(settings.shopRate) > 0,
        membershipRate: parseFloat(settings.membershipRate) > 0,
        packageRate: parseFloat(settings.packageRate) > 0,
      });
    }
  }, [activeSection, settings, form]);

  if (!manager) return null;

  const managerName = manager.name || `${manager.first_name || ''} ${manager.last_name || ''}`.trim() || manager.email;

  // ─── Commission Save ──────────────────────────────────────────
  const handleSaveCommissions = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const isCommission = values.salaryType === 'commission';

      const res = await updateManagerSettings(manager.id, {
        salaryType: values.salaryType,
        commissionType: 'per_category',
        defaultRate: 0,
        bookingRate: isCommission && categoryToggles.bookingRate ? (values.bookingRate || 0) : 0,
        rentalRate: isCommission && categoryToggles.rentalRate ? (values.rentalRate || 0) : 0,
        accommodationRate: isCommission && categoryToggles.accommodationRate ? (values.accommodationRate || 0) : 0,
        packageRate: isCommission && categoryToggles.packageRate ? (values.packageRate || 0) : 0,
        shopRate: isCommission && categoryToggles.shopRate ? (values.shopRate || 0) : 0,
        membershipRate: isCommission && categoryToggles.membershipRate ? (values.membershipRate || 0) : 0,
        fixedSalaryAmount: values.salaryType === 'monthly_salary' ? values.fixedSalaryAmount : null,
        perLessonAmount: values.salaryType === 'fixed_per_lesson' ? values.perLessonAmount : null,
      });

      if (res.success) {
        message.success('Commission settings saved');
        // Re-fetch settings
        const updated = await getManagerSettings(manager.id);
        if (updated.success) setSettings(updated.data);
        onUpdate();
      } else {
        message.error(res.error || 'Failed to save settings');
      }
    } catch (error) {
      if (!error.errorFields) message.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ─── Info Section ──────────────────────────────────────────────
  const renderInfo = () => {
    const totalEarned = parseFloat(summary?.totalEarned ?? summary?.total_earned ?? 0);
    const pending = parseFloat(summary?.pending?.amount ?? summary?.pendingAmount ?? manager.pendingCommission ?? 0);
    const paid = parseFloat(summary?.paid?.amount ?? summary?.paidAmount ?? manager.paidCommission ?? 0);
    const salaryType = settings?.salaryType || 'commission';
    const salaryInfo = SALARY_TYPE_MAP[salaryType] || SALARY_TYPE_MAP.commission;

    return (
      <div className="space-y-5">
        {/* Header card */}
        <div className="rounded-xl bg-gradient-to-br from-slate-50 to-indigo-50/40 p-5">
          <div className="flex items-center gap-4">
            <Avatar
              size={56}
              src={manager.profileImage}
              icon={!manager.profileImage && <UserOutlined />}
              className="shadow-sm flex-shrink-0"
              style={{ backgroundColor: !manager.profileImage ? '#6366F1' : undefined }}
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{managerName}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Tag color="purple" bordered={false} className="rounded-full text-xs">MANAGER</Tag>
                <Tag color={salaryInfo.color} bordered={false} className="rounded-full text-xs" icon={salaryInfo.icon}>{salaryInfo.label}</Tag>
              </div>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-1">
          {manager.email && (
            <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
              <span className="text-gray-400 mt-0.5 text-base"><MailOutlined /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Email</div>
                <div className="text-sm text-gray-800 mt-0.5">{manager.email}</div>
              </div>
            </div>
          )}
          {manager.created_at && (
            <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
              <span className="text-gray-400 mt-0.5 text-base"><CalendarOutlined /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Joined</div>
                <div className="text-sm text-gray-800 mt-0.5">{new Date(manager.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          )}
          {settings && (
            <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
              <span className="text-gray-400 mt-0.5 text-base"><PercentageOutlined /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Manager Commission</div>
                <div className="text-sm text-gray-800 mt-0.5">
                  {salaryType === 'commission' ? (() => {
                    const cats = [
                      { label: 'Bookings', rate: settings.bookingRate },
                      { label: 'Rentals', rate: settings.rentalRate },
                      { label: 'Accom.', rate: settings.accommodationRate },
                      { label: 'Shop', rate: settings.shopRate },
                      { label: 'Membership', rate: settings.membershipRate },
                      { label: 'Packages', rate: settings.packageRate },
                    ].filter(c => parseFloat(c.rate) > 0);
                    return cats.length > 0
                      ? cats.map(c => `${c.label} ${c.rate}%`).join(', ')
                      : 'No categories configured';
                  })() :
                    salaryType === 'fixed_per_lesson' ? `${formatCurrency(settings.perLessonAmount || 0, 'EUR')}/lesson` :
                    `${formatCurrency(settings.fixedSalaryAmount || 0, 'EUR')}/month`}
                </div>
              </div>
            </div>
          )}
          {instructorCommission?.defaultCommission && (
            <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
              <span className="text-gray-400 mt-0.5 text-base"><ThunderboltOutlined /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Lesson Commission</div>
                <div className="text-sm text-gray-800 mt-0.5">
                  {instructorCommission.defaultCommission.type === 'percentage'
                    ? `${instructorCommission.defaultCommission.value}%`
                    : `${formatCurrency(instructorCommission.defaultCommission.value, 'EUR')}/h`}
                </div>
                {instructorCommission.commissions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {instructorCommission.commissions.map(c => (
                      <Tag key={c.serviceId} className="text-xs" color="blue">
                        {c.serviceName}: {c.commissionType === 'percentage' ? `${c.commissionValue}%` : `€${c.commissionValue}/h`}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
            <div className="text-xl font-bold text-green-600">{formatCurrency(paid, 'EUR')}</div>
            <div className="text-xs text-gray-500 mt-1">Paid</div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
            <div className="text-xl font-bold text-amber-600">{formatCurrency(pending, 'EUR')}</div>
            <div className="text-xs text-gray-500 mt-1">Pending</div>
          </div>
        </div>

        {/* Income breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-center">
            <div className="text-xl font-bold text-indigo-600">{formatCurrency(instructorEarnings.total, 'EUR')}</div>
            <div className="text-xs text-gray-500 mt-1">Instructor Income</div>
          </div>
          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 text-center">
            <div className="text-xl font-bold text-purple-600">{formatCurrency(totalEarned, 'EUR')}</div>
            <div className="text-xs text-gray-500 mt-1">Manager Income</div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-center">
            <div className="text-xl font-bold text-emerald-600">{formatCurrency(instructorEarnings.total + totalEarned, 'EUR')}</div>
            <div className="text-xs text-gray-500 mt-1">Total Income</div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Skills Section ─────────────────────────────────────────────
  const renderSkills = () => (
    <InstructorSkillsManager instructorId={manager.id} />
  );

  // ─── Commissions (Edit) Section ────────────────────────────────
  const renderCommissions = () => (
    <div className="space-y-5">
      <Segmented
        value={commissionTab}
        onChange={setCommissionTab}
        options={[
          { label: 'Manager Commission', value: 'manager' },
          { label: 'Instructor Commission', value: 'instructor' },
        ]}
        block
      />
      {commissionTab === 'instructor' ? (
        <InstructorServiceCommission instructorId={manager.id} />
      ) : (
      <Form form={form} layout="vertical" initialValues={{ salaryType: 'commission', commissionType: 'per_category', defaultRate: 10 }}>
        {/* ── Salary Model (compact) ── */}
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <DollarOutlined className="text-indigo-500 text-base" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700">Salary Model</div>
                <div className="text-[11px] text-gray-400">How this manager gets paid</div>
              </div>
            </div>
            <Form.Item name="salaryType" className="mb-0" rules={[{ required: true }]}>
              <Select style={{ width: 180 }} popupMatchSelectWidth={false}>
                <Option value="commission"><PercentageOutlined className="mr-1" />Commission %</Option>
                <Option value="fixed_per_lesson"><ThunderboltOutlined className="mr-1" />Per Lesson €</Option>
                <Option value="monthly_salary"><CalendarOutlined className="mr-1" />Monthly Salary</Option>
              </Select>
            </Form.Item>
          </div>
        </div>

        {/* ── Monthly Salary ── */}
        {salaryType === 'monthly_salary' && (
          <div className="rounded-xl border border-gray-100 bg-white p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                <CalendarOutlined className="text-purple-500 text-base" />
              </div>
              <div className="text-sm font-semibold text-gray-700">Monthly Amount</div>
            </div>
            <Form.Item name="fixedSalaryAmount" className="mb-0" rules={[{ required: true, message: 'Enter amount' }, { type: 'number', min: 0 }]}>
              <InputNumber min={0} step={50} addonAfter="€ / month" style={{ width: '100%' }} placeholder="e.g. 2000" size="large" />
            </Form.Item>
          </div>
        )}

        {/* ── Per Lesson ── */}
        {salaryType === 'fixed_per_lesson' && (
          <div className="rounded-xl border border-gray-100 bg-white p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                <ThunderboltOutlined className="text-green-500 text-base" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700">Per Lesson Amount</div>
                <div className="text-[11px] text-gray-400">Fixed amount per completed booking</div>
              </div>
            </div>
            <Form.Item name="perLessonAmount" className="mb-0" rules={[{ required: true, message: 'Enter amount' }, { type: 'number', min: 0 }]}>
              <InputNumber min={0} step={5} addonAfter="€ / lesson" style={{ width: '100%' }} placeholder="e.g. 25" size="large" />
            </Form.Item>
          </div>
        )}

        {/* ── Commission: per-category rates with toggles ── */}
        {salaryType === 'commission' && (
          <div className="rounded-xl border border-gray-100 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <PercentageOutlined className="text-blue-500 text-base" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700">Commission Rates</div>
                <div className="text-[11px] text-gray-400">Toggle on to enable commission for each category</div>
              </div>
            </div>

            {[
              { name: 'bookingRate', label: 'Bookings', color: '#1890ff', desc: 'Private & group lessons' },
              { name: 'rentalRate', label: 'Rentals', color: '#52c41a', desc: 'Equipment rentals' },
              { name: 'accommodationRate', label: 'Accommodation', color: '#722ed1', desc: 'Room & stay bookings' },
              { name: 'shopRate', label: 'Shop / Sales', color: '#fa8c16', desc: 'Merch & product sales' },
              { name: 'membershipRate', label: 'Membership', color: '#13c2c2', desc: 'Recurring memberships' },
              { name: 'packageRate', label: 'Packages', color: '#eb2f96', desc: 'Bundled service packages' },
            ].map(cat => (
              <div key={cat.name} className={`rounded-lg border p-3 transition-all ${
                categoryToggles[cat.name] ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/60'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <div>
                      <div className={`text-sm font-medium ${categoryToggles[cat.name] ? 'text-gray-800' : 'text-gray-400'}`}>{cat.label}</div>
                      <div className="text-[11px] text-gray-400">{cat.desc}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {categoryToggles[cat.name] && (
                      <Form.Item name={cat.name} className="mb-0" rules={[{ required: true, message: 'Set rate' }, { type: 'number', min: 0.1, max: 100, message: '0.1–100%' }]}>
                        <InputNumber min={0.1} max={100} step={0.5} addonAfter="%" style={{ width: 110 }} placeholder="%" />
                      </Form.Item>
                    )}
                    <Switch
                      size="small"
                      checked={categoryToggles[cat.name]}
                      onChange={(checked) => {
                        setCategoryToggles(prev => ({ ...prev, [cat.name]: checked }));
                        if (!checked) form.setFieldsValue({ [cat.name]: 0 });
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveCommissions} block size="large" className="rounded-xl h-12">
          Save Settings
        </Button>
      </Form>
      )}
    </div>
  );

  // ─── Earnings Section ──────────────────────────────────────────
  // Helper: compute days between two date strings
  const computeDays = (start, end) => {
    if (!start || !end) return null;
    const ms = new Date(end) - new Date(start);
    const days = Math.round(ms / 86400000);
    return days > 0 ? days : null;
  };

  // Shared column helpers — used in both Earnings and History tables
  const getDetails = (r) => ({ ...r.metadata, ...r.source_details }); // source_details overrides metadata

  const colCustomer = (label = 'Customer') => ({
    title: label, key: 'customer', ellipsis: true,
    render: (_, r) => {
      const d = getDetails(r);
      const participantNames = d.participant_names || d.participantNames;
      const groupSize = parseInt(d.group_size || d.groupSize) || 1;
      const name = participantNames || d.student_name || d.studentName || d.customer_name || d.customerName || d.guest_name || d.guestName || '—';
      return groupSize > 1
        ? <Text className="text-xs text-gray-600">{name} <Tag color="purple" bordered={false} className="rounded-full m-0 text-[10px]">{groupSize}ppl</Tag></Text>
        : <Text className="text-xs text-gray-600">{name}</Text>;
    },
  });
  const colCommission = {
    title: 'Comm.', key: 'commission', width: 90, align: 'right',
    render: (_, r) => <span className="font-medium text-emerald-700">{formatCurrency(r.commission_amount || r.commissionAmount || 0, 'EUR')}</span>,
  };
  const colRate = {
    title: 'Rate', key: 'rate', width: 60, align: 'center',
    render: (_, r) => { const rate = r.commission_rate || r.commissionRate; return rate ? `${rate}%` : '—'; },
  };
  const colAmount = {
    title: 'Amount', key: 'sourceAmount', width: 85, align: 'right',
    render: (_, r) => { const amt = r.source_amount || r.sourceAmount; return amt ? formatCurrency(amt, 'EUR') : '—'; },
  };
  const colStatus = {
    title: 'Status', dataIndex: 'status', key: 'status', width: 80,
    render: val => { const info = STATUS_TAG[val] || STATUS_TAG.pending; return <Tag color={info.color} icon={info.icon} bordered={false} className="capitalize rounded-full m-0 text-[11px]">{val}</Tag>; },
  };
  const colDate = (label = 'Date') => ({
    title: label, key: 'date', width: 90,
    render: (_, r) => {
      const d = getDetails(r);
      const dt = d.date || d.start_date || d.startDate || d.check_in || d.checkIn || r.source_date || r.created_at;
      return dt ? new Date(dt).toLocaleDateString() : '—';
    },
  });

  // Bookings columns
  const bookingColumns = [
    colDate(),
    colCustomer('Student'),
    { title: 'Service', key: 'service', ellipsis: true, render: (_, r) => {
      const d = getDetails(r); return <Text className="text-xs text-gray-600">{d.service_name || d.serviceName || '—'}</Text>;
    }},
    { title: 'Dur.', key: 'duration', width: 55, align: 'center', render: (_, r) => {
      const d = getDetails(r); const dur = d.duration || d.hours; return dur ? `${dur}h` : '—';
    }},
    colAmount, colRate, colCommission, colStatus,
  ];

  // Rentals columns
  const rentalColumns = [
    colDate('Start'),
    colCustomer(),
    { title: 'Equipment', key: 'equipment', ellipsis: true, render: (_, r) => {
      const d = getDetails(r); return <Text className="text-xs text-gray-600">{d.equipment_name || d.equipmentName || '—'}</Text>;
    }},
    { title: 'Period', key: 'period', width: 60, align: 'center', render: (_, r) => {
      const d = getDetails(r);
      const days = computeDays(d.start_date || d.startDate, d.end_date || d.endDate);
      return days ? `${days}d` : '—';
    }},
    colAmount, colRate, colCommission, colStatus,
  ];

  // Accommodation columns
  const accomColumns = [
    { title: 'Check-in', key: 'checkin', width: 90, render: (_, r) => {
      const d = getDetails(r); const dt = d.check_in || d.checkIn || r.source_date;
      return dt ? new Date(dt).toLocaleDateString() : '—';
    }},
    colCustomer('Guest'),
    { title: 'Nights', key: 'nights', width: 55, align: 'center', render: (_, r) => {
      const d = getDetails(r);
      const n = computeDays(d.check_in || d.checkIn, d.check_out || d.checkOut);
      return n ? `${n}` : '—';
    }},
    colAmount, colRate, colCommission, colStatus,
  ];

  // Shop columns
  const shopColumns = [
    colDate(),
    colCustomer(),
    { title: 'Order', key: 'order', width: 105, ellipsis: true, render: (_, r) => {
      const d = getDetails(r); return <Text className="text-xs text-gray-600">{d.order_number || d.orderNumber || '—'}</Text>;
    }},
    { title: 'Items', key: 'items', width: 50, align: 'center', render: (_, r) => {
      const d = getDetails(r); return d.item_count || d.itemCount || '—';
    }},
    colAmount, colRate, colCommission, colStatus,
  ];

  // Membership columns
  const membershipColumns = [
    colDate(),
    colCustomer(),
    { title: 'Membership', key: 'offering', ellipsis: true, render: (_, r) => {
      const d = getDetails(r); return <Text className="text-xs text-gray-600">{d.offering_name || d.offeringName || '—'}</Text>;
    }},
    { title: 'Days', key: 'days', width: 55, align: 'center', render: (_, r) => {
      const d = getDetails(r); return d.duration_days || d.durationDays || '—';
    }},
    colAmount, colRate, colCommission, colStatus,
  ];

  // Package columns
  const packageColumns = [
    colDate(),
    colCustomer(),
    { title: 'Package', key: 'packageName', ellipsis: true, render: (_, r) => {
      const d = getDetails(r); return <Text className="text-xs text-gray-600">{d.package_name || d.packageName || '—'}</Text>;
    }},
    { title: 'Hours', key: 'hours', width: 55, align: 'center', render: (_, r) => {
      const d = getDetails(r); return d.total_hours || d.totalHours || '—';
    }},
    colAmount, colRate, colCommission, colStatus,
  ];

  // Category table renderer
  const renderCategoryTable = (title, icon, color, borderColor, records, columns, { collapsible = false, isOpen = true, onToggle, rowKeyField = 'id', durationFn } = {}) => {
    const totalAmt = records.reduce((s, c) => s + parseFloat(c.commission_amount || c.commissionAmount || c.total_earnings || 0), 0);
    const totalHours = durationFn ? records.reduce((s, c) => s + (parseFloat(durationFn(c)) || 0), 0) : null;
    return (
      <div className={`rounded-xl border ${borderColor} bg-white overflow-hidden`}>
        <div
          className={`px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2 ${collapsible ? 'cursor-pointer select-none hover:bg-gray-50/80 transition-colors' : 'border-b border-gray-100'}`}
          onClick={collapsible ? onToggle : undefined}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {collapsible && (
              <RightOutlined className={`text-[10px] text-gray-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
            )}
            <span className={`${color} flex-shrink-0`}>{icon}</span>
            <h4 className="text-xs sm:text-sm font-semibold text-gray-800 truncate">{title}</h4>
            <Tag bordered={false} className="rounded-full ml-0.5 text-[11px]">{records.length}</Tag>
            {totalHours > 0 && (
              <Tag bordered={false} color="default" className="rounded-full ml-0 text-[11px] text-gray-500">{totalHours}h</Tag>
            )}
          </div>
          <span className={`text-xs sm:text-sm font-bold ${color} flex-shrink-0`}>{formatCurrency(totalAmt, 'EUR')}</span>
        </div>
        {(collapsible ? isOpen : true) && (
          records.length === 0 ? (
            <div className="px-5 py-3 border-t border-gray-100">
              <Empty description={`No ${title.toLowerCase()} commissions`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            <div className="border-t border-gray-100">
              <Table columns={columns} dataSource={records} rowKey={rowKeyField} size="small"
                scroll={{ x: 'max-content' }} pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }} />
            </div>
          )
        )}
      </div>
    );
  };

  const renderEarnings = () => {
    // Use summary endpoint (aggregates ALL records from DB)
    const totalEarned = parseFloat(summary?.totalEarned ?? summary?.total_earned ?? 0);
    const paidAmt = parseFloat(summary?.paid?.amount ?? 0);
    const pendingAmt = parseFloat(summary?.pending?.amount ?? 0);
    const paidPercent = totalEarned > 0 ? Math.round((paidAmt / totalEarned) * 100) : 0;

    // Build category breakdown from summary
    const bd = summary?.breakdown || {};
    const categoryData = CATEGORY_DEFS
      .map(d => {
        const bk = d.key === 'packages' ? bd.packages : bd[d.key];
        return { category: d.label, amount: bk?.amount || 0, color: d.color };
      })
      .filter(c => c.amount > 0);

    return (
      <div className="space-y-5">
        {/* ── Manager Earnings ── */}
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Manager Earnings</div>

        {/* Date range filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            type={earningsQuickRange === 'thisYear' ? 'primary' : 'default'}
            onClick={() => {
              setEarningsQuickRange('thisYear');
              setEarningsDateRange({
                startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
                endDate: dayjs().format('YYYY-MM-DD'),
              });
            }}
            className={`rounded-lg ${earningsQuickRange === 'thisYear' ? '' : 'border-slate-200 bg-white/70 hover:bg-slate-50'}`}
          >
            This Year
          </Button>
          <Button
            size="small"
            type={earningsQuickRange === 'all' ? 'primary' : 'default'}
            onClick={() => {
              setEarningsQuickRange('all');
              setEarningsDateRange({ startDate: null, endDate: null });
            }}
            className={`rounded-lg ${earningsQuickRange === 'all' ? '' : 'border-slate-200 bg-white/70 hover:bg-slate-50'}`}
          >
            All Time
          </Button>
          <DatePicker.RangePicker
            size="small"
            value={earningsDateRange.startDate && earningsDateRange.endDate
              ? [dayjs(earningsDateRange.startDate), dayjs(earningsDateRange.endDate)]
              : null}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setEarningsQuickRange(null);
                setEarningsDateRange({
                  startDate: dates[0].format('YYYY-MM-DD'),
                  endDate: dates[1].format('YYYY-MM-DD'),
                });
              } else {
                setEarningsQuickRange('all');
                setEarningsDateRange({ startDate: null, endDate: null });
              }
            }}
            allowClear
            className="rounded-lg"
            placeholder={['Start', 'End']}
          />
        </div>

        {/* Total + Paid / Pending */}
        <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-3 sm:p-5">
          <div className="text-xs text-gray-400 mb-1">Total Earned{earningsQuickRange === 'thisYear' ? ' (This Year)' : earningsDateRange.startDate ? ` (${earningsDateRange.startDate} – ${earningsDateRange.endDate})` : ' (All Time)'}</div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{formatCurrency(totalEarned, 'EUR')}</div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${paidPercent}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="rounded-lg bg-white/70 p-2 sm:p-2.5 text-center">
              <div className="text-sm sm:text-base font-bold text-green-600">{formatCurrency(paidAmt, 'EUR')}</div>
              <div className="text-[11px] text-gray-400">Paid</div>
            </div>
            <div className="rounded-lg bg-white/70 p-2 sm:p-2.5 text-center">
              <div className="text-sm sm:text-base font-bold text-amber-600">{formatCurrency(pendingAmt, 'EUR')}</div>
              <div className="text-[11px] text-gray-400">Pending</div>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        {categoryData.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-3 sm:p-5 space-y-2">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 sm:mb-2">By Category</div>
            {categoryData.map(cat => (
              <div key={cat.category} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-xs sm:text-sm text-gray-600 flex-1">{cat.category}</span>
                <span className="text-xs sm:text-sm font-semibold text-gray-800">{formatCurrency(cat.amount, 'EUR')}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Instructor Earnings ── */}
        <Divider className="!my-4" />
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Instructor Earnings</div>
        <PayrollDashboard instructor={{ id: manager.id }} defaultPeriod="all_time" />
      </div>
    );
  };

  // ─── History Section ───────────────────────────────────────────
  const filteredCommissions = commissions.filter(c => {
    if (historySourceType && (c.source_type || c.sourceType) !== historySourceType) return false;
    if (historyStatus && c.status !== historyStatus) return false;
    if (historySearch) {
      const q = historySearch.toLowerCase();
      const searchable = [
        c.booking_reference, c.reference, c.id,
        c.customer_name, c.notes, c.description,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  // Instructor lesson columns for History
  const instructorLessonColumns = [
    { title: 'Date', key: 'date', width: 90, render: (_, r) => r.lesson_date ? new Date(r.lesson_date).toLocaleDateString() : '—' },
    { title: 'Student', key: 'student', ellipsis: true, render: (_, r) => <Text className="text-xs text-gray-600">{r.student_name || '—'}</Text> },
    { title: 'Service', key: 'service', ellipsis: true, render: (_, r) => <Text className="text-xs text-gray-600">{r.service_name || '—'}</Text> },
    { title: 'Dur.', key: 'duration', width: 55, align: 'center', render: (_, r) => r.lesson_duration ? `${r.lesson_duration}h` : '—' },
    { title: 'Amount', key: 'amount', width: 85, align: 'right', render: (_, r) => formatCurrency(parseFloat(r.lesson_amount || 0), 'EUR') },
    { title: 'Earning', key: 'earning', width: 90, align: 'right', render: (_, r) => <span className="font-medium text-indigo-700">{formatCurrency(parseFloat(r.total_earnings || 0), 'EUR')}</span> },
    { title: 'Status', key: 'status', width: 80, render: (_, r) => {
      const s = r.payment_status || 'completed';
      return <Tag color={s === 'paid' ? 'green' : s === 'completed' ? 'blue' : 'gold'} bordered={false} className="capitalize rounded-full m-0 text-[11px]">{s}</Tag>;
    }},
  ];

  const renderHistory = () => {
    const activeFiltered = filteredCommissions.filter(c => c.status !== 'cancelled');
    const bookingRecords = activeFiltered.filter(c => (c.source_type || c.sourceType) === 'booking');
    const rentalRecords = activeFiltered.filter(c => (c.source_type || c.sourceType) === 'rental');
    const accomRecords = activeFiltered.filter(c => (c.source_type || c.sourceType) === 'accommodation');
    const shopRecords = activeFiltered.filter(c => (c.source_type || c.sourceType) === 'shop');
    const membershipRecords = activeFiltered.filter(c => (c.source_type || c.sourceType) === 'membership');
    const packageRecords = activeFiltered.filter(c => (c.source_type || c.sourceType) === 'package');

    // Filter instructor lessons by search
    let instrLessons = instructorEarnings.lessons || [];
    if (historySearch) {
      const q = historySearch.toLowerCase();
      instrLessons = instrLessons.filter(l =>
        [l.student_name, l.service_name, l.booking_id].filter(Boolean).join(' ').toLowerCase().includes(q)
      );
    }

    // When source filter is set, only show matching sections
    const showInstructorLessons = !historySourceType || historySourceType === 'instructor_lesson';
    const showCommissions = !historySourceType || (historySourceType !== 'instructor_lesson');

    const commGetDuration = (r) => { const d = getDetails(r); return d.duration || d.hours || 0; };

    const commissionCategories = showCommissions ? [
      { key: 'booking', title: 'Manager Comm. — Lessons', icon: <CalendarOutlined />, color: 'text-blue-600', borderColor: 'border-blue-100', records: bookingRecords, columns: bookingColumns, durationFn: commGetDuration },
      { key: 'rental', title: 'Manager Comm. — Rentals', icon: <ClockCircleOutlined />, color: 'text-amber-600', borderColor: 'border-amber-100', records: rentalRecords, columns: rentalColumns },
      { key: 'accommodation', title: 'Manager Comm. — Accommodation', icon: <DollarOutlined />, color: 'text-purple-600', borderColor: 'border-purple-100', records: accomRecords, columns: accomColumns },
      { key: 'shop', title: 'Manager Comm. — Shop / Sales', icon: <DollarOutlined />, color: 'text-orange-600', borderColor: 'border-orange-100', records: shopRecords, columns: shopColumns },
      { key: 'membership', title: 'Manager Comm. — Membership', icon: <DollarOutlined />, color: 'text-cyan-600', borderColor: 'border-cyan-100', records: membershipRecords, columns: membershipColumns },
      { key: 'package', title: 'Manager Comm. — Packages', icon: <DollarOutlined />, color: 'text-pink-600', borderColor: 'border-pink-100', records: packageRecords, columns: packageColumns },
    ].filter(cat => cat.records.length > 0) : [];

    const hasAny = commissionCategories.length > 0 || (showInstructorLessons && instrLessons.length > 0);

    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Select allowClear placeholder="Source type" value={historySourceType} onChange={v => { setHistorySourceType(v); setHistoryPage(1); }} style={{ width: 180 }}>
            <Option value="instructor_lesson">Instructor Lessons</Option>
            <Option value="booking">Mgr Comm. — Booking</Option>
            <Option value="rental">Mgr Comm. — Rental</Option>
            <Option value="accommodation">Mgr Comm. — Accommodation</Option>
            <Option value="package">Mgr Comm. — Package</Option>
            <Option value="shop">Mgr Comm. — Shop</Option>
            <Option value="membership">Mgr Comm. — Membership</Option>
          </Select>
          <Input.Search
            placeholder="Search..."
            allowClear
            value={historySearch}
            onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1); }}
            style={{ width: 180 }}
          />
          {historySourceType !== 'instructor_lesson' && (
            <Select allowClear placeholder="Status" value={historyStatus} onChange={v => { setHistoryStatus(v); setHistoryPage(1); }} style={{ width: 130 }}>
              <Option value="pending">Pending</Option>
              <Option value="paid">Paid</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          )}
        </div>

        {!hasAny ? (
          <Empty description="No records found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="space-y-4">
            {/* Instructor Lessons (taught by this manager) */}
            {showInstructorLessons && instrLessons.length > 0 && (
              renderCategoryTable('Instructor Lessons', <ThunderboltOutlined />, 'text-indigo-600', 'border-indigo-100', instrLessons, instructorLessonColumns, {
                collapsible: true,
                isOpen: earningsOpen.instructor_lesson ?? true,
                onToggle: () => setEarningsOpen(prev => ({ ...prev, instructor_lesson: !(prev.instructor_lesson ?? true) })),
                rowKeyField: 'booking_id',
                durationFn: r => r.lesson_duration || 0,
              })
            )}

            {/* Manager commission categories */}
            {commissionCategories.map(cat => (
              <div key={cat.key}>
                {renderCategoryTable(cat.title, cat.icon, cat.color, cat.borderColor, cat.records, cat.columns, {
                  collapsible: true,
                  isOpen: earningsOpen[cat.key] ?? true,
                  onToggle: () => setEarningsOpen(prev => ({ ...prev, [cat.key]: !(prev[cat.key] ?? true) })),
                  durationFn: cat.durationFn,
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderPayroll = () => (
    <ManagerPayments manager={manager} onPaymentSuccess={() => fetchData()} />
  );

  // ─── Content Router ────────────────────────────────────────────
  const renderContent = () => {
    switch (activeSection) {
      case 'info': return renderInfo();
      case 'skills': return renderSkills();
      case 'commissions': return renderCommissions();
      case 'earnings': return renderEarnings();
      case 'history': return renderHistory();
      case 'payroll': return renderPayroll();
      default: return null;
    }
  };

  // ─── Drawer ────────────────────────────────────────────────────
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
        {/* ── Icon rail ── */}
        <div className="w-14 flex-shrink-0 bg-slate-50 border-r border-gray-200 flex flex-col relative z-10">
          <div className="p-2 border-b border-gray-200 flex items-center justify-center">
            <button
              onClick={() => setSidebarExpanded(prev => !prev)}
              className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-indigo-200 transition-shadow"
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Avatar
                size={36}
                src={manager.profileImage}
                icon={!manager.profileImage && <UserOutlined />}
                style={{ backgroundColor: !manager.profileImage ? '#6366F1' : undefined }}
              />
            </button>
          </div>
          <nav className="flex-1 py-2 px-1 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map(item => (
              <Tooltip key={item.key} title={item.label} placement="right">
                <button
                  onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors duration-150 cursor-pointer border-0 ${
                    activeSection === item.key
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 bg-transparent'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                </button>
              </Tooltip>
            ))}
          </nav>
          <div className="p-1 border-t border-gray-200">
            <Tooltip title="Close" placement="right">
              <button onClick={onClose} className="w-full flex items-center justify-center py-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer border-0 bg-transparent">
                <CloseOutlined className="text-sm" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* ── Backdrop ── */}
        <div
          className="absolute inset-0 z-20 transition-opacity duration-200"
          style={{ background: 'rgba(0,0,0,0.15)', opacity: sidebarExpanded ? 1 : 0, pointerEvents: sidebarExpanded ? 'auto' : 'none' }}
          onClick={() => setSidebarExpanded(false)}
        />

        {/* ── Expanded sidebar ── */}
        <div
          className="absolute top-0 bottom-0 left-0 z-30 w-[200px] bg-slate-50 border-r border-gray-200 flex flex-col shadow-xl"
          style={{ transform: sidebarExpanded ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)', willChange: 'transform' }}
        >
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarExpanded(false)} className="border-0 bg-transparent p-0 cursor-pointer flex-shrink-0 rounded-full hover:ring-2 hover:ring-indigo-200 transition-shadow">
                <Avatar size={36} src={manager.profileImage} icon={!manager.profileImage && <UserOutlined />} style={{ backgroundColor: !manager.profileImage ? '#6366F1' : undefined }} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800 truncate">{managerName}</div>
                <Tag color="purple" bordered={false} className="rounded-full text-[10px] mt-0.5 px-1.5 py-0 leading-4">MANAGER</Tag>
              </div>
            </div>
          </div>
          <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
            {NAV_ITEMS.map(item => (
              <button
                key={item.key}
                onClick={() => { setActiveSection(item.key); setSidebarExpanded(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 cursor-pointer border-0 text-left ${
                  activeSection === item.key
                    ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-normal bg-transparent'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-gray-200">
            <button onClick={onClose} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer border-0 bg-transparent">
              <CloseOutlined className="text-xs" /> Close
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

export default EnhancedManagerDetailPanel;
