import { useState, useEffect, useRef, useCallback } from 'react';
import { Drawer, Tag, Spin, Avatar, Typography, Switch, Tooltip } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserOutlined, MailOutlined, PhoneOutlined,
  CalendarOutlined, TrophyOutlined, EnvironmentOutlined,
  DollarOutlined, WalletOutlined, IdcardOutlined,
  BarChartOutlined, CloseOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import InstructorServiceCommission from './InstructorServiceCommission';
import InstructorSkillsManager from './InstructorSkillsManager';
import InstructorPayments from './InstructorPayments';
import PayrollDashboard from './PayrollDashboard';
import { useData } from '@/shared/hooks/useData';
import { logger } from '@/shared/utils/logger';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { formatCurrency } from '@/shared/utils/formatters';

const { Text } = Typography;

const NAV_ITEMS = [
  { key: 'info', icon: <UserOutlined />, label: 'Profile' },
  { key: 'skills', icon: <ThunderboltOutlined />, label: 'Skills' },
  { key: 'commissions', icon: <DollarOutlined />, label: 'Commissions' },
  { key: 'dashboard', icon: <BarChartOutlined />, label: 'Earnings' },
  { key: 'payments', icon: <WalletOutlined />, label: 'Payroll' },
];

const SECTION_DESCRIPTIONS = {
  info: 'Personal information and details',
  skills: 'Manage instructor skills and certifications',
  commissions: 'Manage commission rates and category overrides',
  dashboard: 'Earnings overview and analytics',
  payments: 'Payment history and payroll management',
};

const EnhancedInstructorDetailModal = ({
  instructor,
  isOpen,
  onClose,
  onUpdate = () => {}
}) => {
  const { businessCurrency } = useCurrency();
  const [activeSection, setActiveSection] = useState('info');
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
        apiClient.get(`/instructors/${instructor.id}/lessons?limit=5`),
        apiClient.get(`/finances/instructor-earnings/${instructor.id}`),
      ]);
      if (servicesRes.status === 'fulfilled') setInstructorServices(servicesRes.value.data || []);
      if (lessonsRes.status === 'fulfilled') setRecentLessons(lessonsRes.value.data || []);
      if (earningsRes.status === 'fulfilled') {
        const { earnings = [], payrollHistory = [] } = earningsRes.value.data || {};
        const totalEarned = earnings.reduce((s, e) => s + parseFloat(e.total_earnings || 0), 0);
        const totalPaid = payrollHistory.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
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
      message.success(checked ? 'Marked as freelance' : 'Removed freelance status');
    } catch (err) {
      logger.error('Failed to update freelance status', { error: String(err) });
      message.error('Failed to update freelance status');
    } finally {
      setFreelanceLoading(false);
    }
  }, [apiClient, instructor, onUpdate]);

  if (!instructor) return null;

  const statusColor = instructor.status === 'active' ? 'green' : 'red';

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

      {/* Contact info */}
      <div className="rounded-xl border border-gray-100 bg-white px-5 py-1">
        {renderInfoRow(<MailOutlined />, 'Email', instructor.email)}
        {renderInfoRow(<PhoneOutlined />, 'Phone', instructor.phone)}
        {renderInfoRow(<CalendarOutlined />, 'Date of Birth', instructor.date_of_birth)}
        {renderInfoRow(<EnvironmentOutlined />, 'Address',
          [instructor.address, instructor.city, instructor.country].filter(Boolean).join(', ') || null
        )}
        {renderInfoRow(<CalendarOutlined />, 'Joined',
          instructor.created_at ? new Date(instructor.created_at).toLocaleDateString() : null
        )}
        {instructor.hourly_rate && renderInfoRow(<DollarOutlined />, 'Hourly Rate',
          `${formatCurrency(Number(instructor.hourly_rate) || 0, businessCurrency || 'EUR')}/hour`
        )}
        {/* Freelance toggle */}
        <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-base"><IdcardOutlined /></span>
            <div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Freelance</div>
              <div className="text-xs text-gray-500 mt-0.5">Freelance instructors only appear in the calendar when they have bookings</div>
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
                <TrophyOutlined /> Specializations
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
                <IdcardOutlined /> Certificates
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
                Languages
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
          <div className="text-xs text-gray-500 mt-1">Services Assigned</div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{recentLessons.length}</div>
          <div className="text-xs text-gray-500 mt-1">Recent Lessons</div>
        </div>
      </div>

      {/* Balance card */}
      {earningsBalance !== null && (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Earnings Balance</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-sm font-bold text-gray-800">{formatCurrency(earningsBalance.totalEarned, businessCurrency || 'EUR')}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Total Earned</div>
            </div>
            <div>
              <div className="text-sm font-bold text-green-600">{formatCurrency(earningsBalance.totalPaid, businessCurrency || 'EUR')}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Paid Out</div>
            </div>
            <div>
              <div className={`text-sm font-bold ${earningsBalance.balance > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                {formatCurrency(earningsBalance.balance, businessCurrency || 'EUR')}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">Available</div>
            </div>
          </div>
        </div>
      )}

      {/* Bio & notes */}
      {instructor.bio && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Biography</div>
          <Text className="text-sm text-gray-700 leading-relaxed">{instructor.bio}</Text>
        </div>
      )}
      {instructor.notes && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Notes</div>
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
              message.success('Commission settings saved');
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
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
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
            <Tooltip title="Close" placement="right">
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

export default EnhancedInstructorDetailModal;
