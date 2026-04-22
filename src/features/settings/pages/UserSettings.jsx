/**
 * UserSettings Page
 * 
 * Unified settings hub with left sidebar navigation.
 * Personal preferences for all users; admin/business tabs for managers/admins.
 */

import { useState, useEffect, useCallback, memo, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Switch, Select, Button, Typography, Divider, Alert, Spin, App } from 'antd';
import {
  BellOutlined,
  GlobalOutlined,
  SaveOutlined,
  SettingOutlined,
  CalendarOutlined,
  CloudOutlined,
  DollarOutlined,
  NotificationOutlined,
  ToolOutlined,
  UserOutlined,
  AppstoreOutlined,
  TeamOutlined,
  SafetyOutlined,
  FileTextOutlined,
  DeleteOutlined,
  RollbackOutlined,
  BankOutlined,
  BookOutlined,
  MedicineBoxOutlined,
  LockOutlined,
  CameraOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import CurrencySelector from '@/shared/components/ui/CurrencySelector';
import { studentPortalApi } from '@/features/students/services/studentPortalApi';
import apiClient from '@/shared/services/apiClient';
import { usePageSEO } from '@/shared/utils/seo';
import DataService from '@/shared/services/dataService';

// Inline admin components
import FinanceSettingsView from '@/features/finances/components/FinanceSettingsView';
import ForecastSettings from '@/features/forecast/components/ForecastSettings';
import CurrencyManagementSection from '@/features/dashboard/components/CurrencyManagementSection';

// Lazy-loaded admin page components
const Categories = lazy(() => import('@/features/services/pages/Categories'));
const RolesAdmin = lazy(() => import('@/features/admin/pages/RolesAdmin'));
const WaiverManagement = lazy(() => import('@/features/admin/pages/WaiverManagement'));
const LegalDocumentsPage = lazy(() => import('./LegalDocumentsPage'));
const DeletedBookingsPage = lazy(() => import('@/components/admin/DeletedBookingsPage'));
const PaymentRefunds = lazy(() => import('@/features/finances/pages/PaymentRefunds'));
const BankAccountsAdmin = lazy(() => import('@/features/finances/pages/BankAccountsAdmin'));
const KaiSessionsPage = lazy(() => import('@/features/admin/pages/KaiSessionsPage'));

// Lazy-loaded role-specific setting components
const StudentSafetySettings = lazy(() => import('@/features/settings/components/StudentSafetySettings'));
const InstructorAvailabilitySettings = lazy(() => import('@/features/settings/components/InstructorAvailabilitySettings'));
const InstructorTeachingPreferences = lazy(() => import('@/features/settings/components/InstructorTeachingPreferences'));
const InstructorNotificationSettings = lazy(() => import('@/features/settings/components/InstructorNotificationSettings'));
const ManagerTeamNotifications = lazy(() => import('@/features/settings/components/ManagerTeamNotifications'));
const ManagerOperationalDefaults = lazy(() => import('@/features/settings/components/ManagerOperationalDefaults'));
const AccountSettings = lazy(() => import('@/features/settings/components/AccountSettings'));

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// Calendar Settings Section for Admin
const HOUR_OPTIONS = (() => {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const value = `${hh}:${mm}`;
      const period = h < 12 ? 'AM' : 'PM';
      const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${displayH}:${mm} ${period}`;
      opts.push({ value, label });
    }
  }
  return opts;
})();

const FORM_CONTEXT_KEYS = ['staff_booking', 'customer_modal', 'public_booking'];

const CalendarSettingsSection = memo(function CalendarSettingsSection() {
  const { t } = useTranslation(['admin']);
  const [instructors, setInstructors] = useState([]);

  // Working hours state — HH:MM strings
  const [workingHours, setWorkingHours] = useState({ start: '08:00', end: '21:00' });
  const [savingWH, setSavingWH] = useState(false);

  // Instructor form visibility state
  const [formVisibility, setFormVisibility] = useState({ staff_booking: [], customer_modal: [], public_booking: [] });
  const [savingFV, setSavingFV] = useState(false);

  const { message } = App.useApp();

  useEffect(() => {
    (async () => {
      try {
        const list = await DataService.getInstructors();
        setInstructors(list || []);
      } catch {
        // ignore
      }

      // Load saved settings
      try {
        const res = await apiClient.get('/settings');
        if (res.data?.calendar_working_hours) {
          const wh = res.data.calendar_working_hours;
          // Migrate old integer format (e.g. { start: 8, end: 21 }) to HH:MM strings
          const toHHMM = (v) => typeof v === 'number'
            ? `${String(v).padStart(2, '0')}:00`
            : v;
          setWorkingHours({ start: toHHMM(wh.start), end: toHHMM(wh.end) });
        }
        if (res.data?.instructor_form_visibility) {
          setFormVisibility(prev => ({ ...prev, ...res.data.instructor_form_visibility }));
        }
      } catch {
        // use defaults
      }
    })();
  }, []);

  const onSaveWorkingHours = async () => {
    if (workingHours.end <= workingHours.start) { // string comparison works for HH:MM
      message.error(t('admin:settings.calendarSection.toast.closingAfterOpening'));
      return;
    }
    setSavingWH(true);
    try {
      await apiClient.put('/settings/calendar_working_hours', { value: workingHours });
      // Apply immediately to in-memory config
      const { applyWorkingHours } = await import('@/config/calendarConfig');
      applyWorkingHours(workingHours.start, workingHours.end);
      message.success(t('admin:settings.calendarSection.toast.workingHoursSaved'));
    } catch {
      message.error(t('admin:settings.calendarSection.toast.workingHoursError'));
    } finally {
      setSavingWH(false);
    }
  };

  const onSaveFormVisibility = async () => {
    setSavingFV(true);
    try {
      await apiClient.put('/settings/instructor_form_visibility', { value: formVisibility });
      message.success(t('admin:settings.calendarSection.toast.visibilitySaved'));
    } catch {
      message.error(t('admin:settings.calendarSection.toast.visibilityError'));
    } finally {
      setSavingFV(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Working Hours ── */}
      <Card
        title={<span className="flex items-center gap-2"><CalendarOutlined className="text-sky-500" />{t('admin:settings.calendarSection.workingHours')}</span>}
        className="rounded-xl shadow-sm"
      >
        <Paragraph className="text-slate-600 mb-4">
          {t('admin:settings.calendarSection.workingHoursDescription')}
        </Paragraph>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <Text strong className="block mb-2">{t('admin:settings.calendarSection.opensAt')}</Text>
            <Select
              value={workingHours.start}
              onChange={v => setWorkingHours(prev => ({ ...prev, start: v }))}
              style={{ width: '100%' }}
              options={HOUR_OPTIONS.filter(o => o.value < '23:00')}
            />
          </div>
          <div>
            <Text strong className="block mb-2">{t('admin:settings.calendarSection.closesAt')}</Text>
            <Select
              value={workingHours.end}
              onChange={v => setWorkingHours(prev => ({ ...prev, end: v }))}
              style={{ width: '100%' }}
              options={HOUR_OPTIONS.filter(o => o.value > '00:00')}
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button type="primary" onClick={onSaveWorkingHours} loading={savingWH} icon={<SaveOutlined />}>
            {t('admin:settings.calendarSection.saveWorkingHours')}
          </Button>
        </div>
      </Card>

      {/* ── Instructor Visibility per Form ── */}
      <Card
        title={<span className="flex items-center gap-2"><TeamOutlined className="text-sky-500" />{t('admin:settings.calendarSection.instructorVisibility')}</span>}
        className="rounded-xl shadow-sm"
      >
        <Paragraph className="text-slate-600 mb-4">
          {t('admin:settings.calendarSection.instructorVisibilityDescription')}
        </Paragraph>
        <div className="space-y-5">
          {FORM_CONTEXT_KEYS.map((key) => (
            <div key={key}>
              <Text strong className="block mb-1">{t(`admin:settings.calendarSection.formContexts.${key}.label`)}</Text>
              <Paragraph className="!mb-2 text-sm text-slate-500">{t(`admin:settings.calendarSection.formContexts.${key}.description`)}</Paragraph>
              <Select
                mode="multiple"
                placeholder={t('admin:settings.calendarSection.allInstructors')}
                value={formVisibility[key] || []}
                onChange={ids => setFormVisibility(prev => ({ ...prev, [key]: ids }))}
                style={{ width: '100%' }}
                allowClear
                optionFilterProp="label"
                options={instructors.map(i => ({
                  value: i.id,
                  label: i.name || i.full_name || `Instructor #${i.id}`,
                }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <Button type="primary" onClick={onSaveFormVisibility} loading={savingFV} icon={<SaveOutlined />}>
            {t('admin:settings.calendarSection.saveVisibility')}
          </Button>
        </div>
      </Card>

    </div>
  );
});

// Business Currency Section
const BusinessCurrencySection = memo(function BusinessCurrencySection({ onSave }) {
  const { t } = useTranslation(['admin']);
  const { businessCurrency, setBusinessCurrency, getCurrencySymbol, getSupportedCurrencies, currencies, loading: currenciesLoading } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [allowedRegistrationCurrencies, setAllowedRegistrationCurrencies] = useState([]);
  const [loadingRegCurrencies, setLoadingRegCurrencies] = useState(false);
  const { message } = App.useApp();
  const currencyCount = getSupportedCurrencies()?.length || 0;

  // Load registration currency settings
  useEffect(() => {
    const loadRegistrationSettings = async () => {
      try {
        const response = await fetch('/api/settings', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setAllowedRegistrationCurrencies(data.allowed_registration_currencies || ['EUR', 'USD', 'TRY']);
        }
      } catch (error) {
        console.error('Failed to load registration settings');
      }
    };
    loadRegistrationSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(businessCurrency);
      message.success(t('admin:settings.currencySection.toast.currencyUpdated'));
    } catch (e) {
      message.error(t('admin:settings.currencySection.toast.currencyError'));
    } finally {
      setSaving(false);
    }
  };

  // Update registration currencies
  const updateRegistrationCurrencies = async (currencies) => {
    setLoadingRegCurrencies(true);
    try {
      const response = await fetch('/api/settings/allowed_registration_currencies', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ value: currencies })
      });
      
      if (response.ok) {
        message.success(t('admin:settings.currencySection.toast.currencyUpdated'));
        setAllowedRegistrationCurrencies(currencies);
      } else {
        message.error(t('admin:settings.currencySection.toast.currencyError'));
      }
    } catch (error) {
      message.error(t('admin:settings.currencySection.toast.currencyError'));
    } finally {
      setLoadingRegCurrencies(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <Title level={5} className="!mb-2">{t('admin:settings.currencySection.defaultTitle')}</Title>
        <Paragraph className="text-slate-600 mb-4">
          {t('admin:settings.currencySection.defaultDescription')}
        </Paragraph>
        {currencyCount <= 1 && (
          <Alert
            type="warning"
            message={t('admin:settings.currencySection.oneCurrencyWarning')}
            className="rounded-lg mb-4"
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div>
            <Text strong className="block mb-2">{t('admin:settings.currencySection.preferredCurrency')}</Text>
            <CurrencySelector
              value={businessCurrency}
              onChange={(val) => setBusinessCurrency(val)}
              style={{ width: '100%' }}
            />
            <Text type="secondary" className="text-xs mt-1 block">
              {t('admin:settings.currencySection.currentCurrency', { symbol: getCurrencySymbol(businessCurrency || 'EUR'), code: businessCurrency || 'EUR' })}
            </Text>
          </div>
          <div className="flex justify-end sm:justify-start">
            <Button type="primary" onClick={handleSave} loading={saving}>
              {t('admin:settings.currencySection.savePreferredCurrency')}
            </Button>
          </div>
        </div>
      </div>

      <Divider />

      <div>
        <Title level={5} className="!mb-2">{t('admin:settings.currencySection.registrationTitle')}</Title>
        <Paragraph className="text-slate-600 mb-4">
          {t('admin:settings.currencySection.registrationDescription')}
        </Paragraph>

        <div className="space-y-4">
          <div>
            <Text strong className="block mb-2">{t('admin:settings.currencySection.allowedCurrencies')}</Text>
            <Select
              mode="multiple"
              placeholder={currenciesLoading ? t('admin:settings.currencySection.loadingPlaceholder') : t('admin:settings.currencySection.registrationCurrenciesPlaceholder')}
              value={allowedRegistrationCurrencies}
              onChange={updateRegistrationCurrencies}
              style={{ width: '100%' }}
              loading={loadingRegCurrencies || currenciesLoading}
              disabled={currenciesLoading}
              notFoundContent={currenciesLoading ? t('admin:settings.currencySection.loadingPlaceholder') : undefined}
            >
              {currencies
                .filter(c => c.is_active)
                .map(c => (
                  <Select.Option key={c.currency_code} value={c.currency_code}>
                    {c.symbol} {c.currency_name} ({c.currency_code})
                  </Select.Option>
                ))}
            </Select>
          </div>

          <Alert
            type="info"
            message={t('admin:settings.currencySection.registrationInfo')}
            description={t('admin:settings.currencySection.registrationInfoDescription', { currencies: allowedRegistrationCurrencies.join(', ') })}
            className="rounded-lg"
          />
        </div>
      </div>
    </div>
  );
});

// Booking Defaults Section
const BookingDefaultsSection = memo(function BookingDefaultsSection({ businessSettings }) {
  const { t } = useTranslation(['admin']);
  const [saving, setSaving] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(businessSettings?.booking_defaults?.defaultDuration || 120);
  const [allowedDurations, setAllowedDurations] = useState(
    businessSettings?.booking_defaults?.allowedDurations || [60, 90, 120, 150, 180]
  );
  const { message } = App.useApp();

  const handleSubmit = async () => {
    if (!allowedDurations.includes(defaultDuration)) {
      message.error(t('admin:settings.bookingDefaults.toast.durationMismatch'));
      return;
    }

    setSaving(true);
    try {
      await apiClient.put('/settings/booking_defaults', {
        value: { defaultDuration, allowedDurations }
      });
      message.success(t('admin:settings.bookingDefaults.toast.saved'));
    } catch (err) {
      message.error(t('admin:settings.bookingDefaults.toast.error'));
    } finally {
      setSaving(false);
    }
  };

  const toggleDuration = (value) => {
    if (allowedDurations.includes(value)) {
      setAllowedDurations(allowedDurations.filter(d => d !== value));
    } else {
      setAllowedDurations([...allowedDurations, value].sort((a, b) => a - b));
    }
  };

  return (
    <div className="space-y-4">
      <Paragraph className="text-slate-600">
        {t('admin:settings.bookingDefaults.description')}
      </Paragraph>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Text strong className="block mb-2">{t('admin:settings.bookingDefaults.defaultDuration')}</Text>
          <Select value={defaultDuration} onChange={setDefaultDuration} style={{ width: '100%' }}>
            {[60, 90, 120, 150, 180, 240].map(v => (
              <Option key={v} value={v}>{t(`admin:settings.bookingDefaults.durations.${v}`)}</Option>
            ))}
          </Select>
        </div>
        <div>
          <Text strong className="block mb-2">{t('admin:settings.bookingDefaults.availableDurations')}</Text>
          <div className="space-y-2">
            {[60, 90, 120, 150, 180, 240].map(value => (
              <label key={value} className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowedDurations.includes(value)}
                  onChange={() => toggleDuration(value)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">
                  {t(`admin:settings.bookingDefaults.durations.${value}`)}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button type="primary" onClick={handleSubmit} loading={saving}>
          {t('admin:settings.bookingDefaults.save')}
        </Button>
      </div>
    </div>
  );
});

const UserSettings = () => {
  const { t } = useTranslation(['admin']);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'general';
  const { user, refreshUser } = useAuth();
  const { message } = App.useApp();
  const { userCurrency, getSupportedCurrencies } = useCurrency();
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [settings, setSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  // Notification settings from /notifications/settings API
  const [notificationSettings, setNotificationSettings] = useState({
    new_booking_alerts: true,
  });

  // Check if user is admin or manager
  const isAdmin = useMemo(() => {
    const role = (user?.role || user?.role_name || '').toLowerCase();
    return ['admin', 'manager'].includes(role);
  }, [user]);

  // Check if user is staff (admin, manager, or instructor)
  const isStaff = useMemo(() => {
    const role = (user?.role || user?.role_name || '').toLowerCase();
    return ['admin', 'manager', 'instructor', 'owner'].includes(role);
  }, [user]);

  const userRole = useMemo(() => (user?.role || user?.role_name || '').toLowerCase(), [user]);
  const isStudent = useMemo(() => ['student', 'trusted_customer'].includes(userRole), [userRole]);
  const isTrustedCustomer = useMemo(() => userRole === 'trusted_customer', [userRole]);
  const isInstructor = useMemo(() => userRole === 'instructor', [userRole]);
  const isManager = useMemo(() => userRole === 'manager', [userRole]);

  // Initialize selected currency from user profile
  useEffect(() => {
    if (user?.preferred_currency || user?.preferredCurrency) {
      setSelectedCurrency(user.preferred_currency || user.preferredCurrency);
    } else {
      setSelectedCurrency(userCurrency || 'EUR');
    }
  }, [user, userCurrency]);

  // Save preferred currency for non-staff users
  const handleCurrencySave = useCallback(async () => {
    if (!selectedCurrency) return;
    setSavingCurrency(true);
    try {
      await studentPortalApi.updateProfile({ preferredCurrency: selectedCurrency });
      await refreshUser();
      message.success(t('admin:settings.currencySection.toast.preferredUpdated'));
    } catch (error) {
      message.error(t('admin:settings.currencySection.toast.preferredError'));
    } finally {
      setSavingCurrency(false);
    }
  }, [selectedCurrency, refreshUser, message]);

  usePageSEO({
    title: `${t('admin:settings.title')} | Plannivo`,
    description: 'Manage your account settings and preferences'
  });

  // Load user preferences and business settings (for admins)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load user preferences
        try {
          const response = await apiClient.get('/users/preferences');
          if (response.data) {
            setSettings(prev => ({ ...prev, ...response.data }));
          }
        } catch {
          // Use defaults if no preferences saved
        }

        // Load notification settings (for staff - new booking alerts toggle)
        if (isStaff) {
          try {
            const notifResponse = await apiClient.get('/notifications/settings');
            if (notifResponse.data) {
              setNotificationSettings(prev => ({ ...prev, ...notifResponse.data }));
            }
          } catch {
            // Use defaults
          }
        }

        // Load business settings for admins
        if (isAdmin) {
          try {
            const bizResponse = await apiClient.get('/settings');
            setBusinessSettings(bizResponse.data);
          } catch {
            // ignore
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [isAdmin, isStaff]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/users/preferences', settings);
      message.success(t('admin:account.personalInfo.toast.saved'));
    } catch (error) {
      message.error(t('admin:account.personalInfo.toast.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreferredCurrencySave = useCallback(async (code) => {
    await apiClient.put('/settings/preferred_currency', {
      value: {
        code: code || 'EUR',
        effectiveFrom: new Date().toISOString()
      }
    });
    const response = await apiClient.get('/settings');
    setBusinessSettings(response.data);
  }, []);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Update notification settings (for staff-specific settings like new_booking_alerts)
  const updateNotificationSetting = async (key, value) => {
    const newSettings = { ...notificationSettings, [key]: value };
    setNotificationSettings(newSettings);
    
    try {
      await apiClient.put('/notifications/settings', newSettings);
      message.success(t('admin:settings.notifications.title'));
    } catch (error) {
      // Revert on error
      setNotificationSettings(prev => ({ ...prev, [key]: !value }));
      message.error(t('admin:settings.notifications.title'));
    }
  };

  // Tab configuration for sidebar navigation — must be before early returns
  const tabConfig = useMemo(() => {
    const tabs = [
      { key: 'general', label: t('admin:settings.tabs.general'), icon: <UserOutlined />, group: t('admin:settings.groups.personal') },
    ];
    // Manager-accessible tabs (subset of admin)
    if (isAdmin || isManager) {
      tabs.push(
        { key: 'calendar', label: t('admin:settings.tabs.calendar'), icon: <CalendarOutlined />, group: t('admin:settings.groups.business') },
        { key: 'booking-defaults', label: t('admin:settings.tabs.bookingDefaults'), icon: <ToolOutlined />, group: t('admin:settings.groups.business') },
      );
    }
    // Admin-only tabs
    if (isAdmin) {
      tabs.push(
        { key: 'forecast', label: t('admin:settings.tabs.forecast'), icon: <CloudOutlined />, group: t('admin:settings.groups.business') },
        { key: 'finance', label: t('admin:settings.tabs.finance'), icon: <DollarOutlined />, group: t('admin:settings.groups.business') },
        { key: 'currency', label: t('admin:settings.tabs.currency'), icon: <DollarOutlined />, group: t('admin:settings.groups.business') },
        { key: 'services', label: t('admin:settings.tabs.services'), icon: <AppstoreOutlined />, group: t('admin:settings.groups.services') },
        { key: 'roles', label: t('admin:settings.tabs.roles'), icon: <TeamOutlined />, group: t('admin:settings.groups.access') },
        { key: 'waivers', label: t('admin:settings.tabs.waivers'), icon: <SafetyOutlined />, group: t('admin:settings.groups.legal') },
        { key: 'legal', label: t('admin:settings.tabs.legal'), icon: <FileTextOutlined />, group: t('admin:settings.groups.legal') },
        { key: 'refunds', label: t('admin:settings.tabs.refunds'), icon: <RollbackOutlined />, group: t('admin:settings.groups.payments') },
        { key: 'bank-accounts', label: t('admin:settings.tabs.bankAccounts'), icon: <BankOutlined />, group: t('admin:settings.groups.payments') },
        { key: 'kai-logs', label: t('admin:settings.tabs.kaiLogs'), icon: <RobotOutlined />, group: t('admin:settings.groups.ai') },
      );
    }
    // Deleted Bookings: manager + admin
    if (isAdmin || isManager) {
      tabs.push(
        { key: 'deleted-bookings', label: t('admin:settings.tabs.deletedBookings'), icon: <DeleteOutlined />, group: t('admin:settings.groups.operations') },
      );
    }
    // Student tabs
    if (isStudent) {
      tabs.push(
        { key: 'safety', label: t('admin:settings.tabs.safety'), icon: <MedicineBoxOutlined />, group: t('admin:settings.groups.personal') },
      );
    }
    // Instructor tabs
    if (isInstructor) {
      tabs.push(
        { key: 'availability', label: t('admin:settings.tabs.availability'), icon: <CalendarOutlined />, group: t('admin:settings.groups.schedule') },
        { key: 'teaching-prefs', label: t('admin:settings.tabs.teachingPrefs'), icon: <BookOutlined />, group: t('admin:settings.groups.teaching') },
        { key: 'instructor-notifications', label: t('admin:settings.tabs.instructorNotifications'), icon: <BellOutlined />, group: t('admin:settings.groups.personal') },
      );
    }
    // Manager-specific tabs
    if (isManager) {
      tabs.push(
        { key: 'team-notifications', label: t('admin:settings.tabs.teamNotifications'), icon: <TeamOutlined />, group: t('admin:settings.groups.operations') },
        { key: 'operational-defaults', label: t('admin:settings.tabs.operationalDefaults'), icon: <ToolOutlined />, group: t('admin:settings.groups.operations') },
      );
    }
    return tabs;
  }, [isAdmin, isManager, isStudent, isInstructor, t]);

  const groupedTabs = useMemo(() => {
    const groups = [];
    const seen = new Set();
    for (const tab of tabConfig) {
      if (!seen.has(tab.group)) {
        seen.add(tab.group);
        groups.push({ label: tab.group, items: tabConfig.filter(t => t.group === tab.group) });
      }
    }
    return groups;
  }, [tabConfig]);

  const setActiveTab = useCallback((tab) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  const activeTabLabel = tabConfig.find(t => t.key === activeTab)?.label || 'General';

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Spin size="large" />
        <div className="text-slate-500">{t('admin:settings.loading')}</div>
      </div>
    );
  }

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'account':
      case 'general':
        return (
          <div className="space-y-6">
            <AccountSettings />

            <Card
              title={<span className="flex items-center gap-2"><BellOutlined className="text-sky-500" />{t('admin:settings.notifications.title')}</span>}
              className="rounded-xl shadow-sm"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Text strong>{t('admin:settings.notifications.email')}</Text>
                    <Paragraph className="!mb-0 text-sm text-slate-500">{t('admin:settings.notifications.emailDescription')}</Paragraph>
                  </div>
                  <Switch checked={settings.emailNotifications} onChange={(checked) => updateSetting('emailNotifications', checked)} />
                </div>
                <Divider className="!my-3" />
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Text strong>{t('admin:settings.notifications.sms')}</Text>
                    <Paragraph className="!mb-0 text-sm text-slate-500">{t('admin:settings.notifications.smsDescription')}</Paragraph>
                  </div>
                  <Switch checked={settings.smsNotifications} onChange={(checked) => updateSetting('smsNotifications', checked)} />
                </div>
                <Divider className="!my-3" />
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Text strong>{t('admin:settings.notifications.push')}</Text>
                    <Paragraph className="!mb-0 text-sm text-slate-500">{t('admin:settings.notifications.pushDescription')}</Paragraph>
                  </div>
                  <Switch checked={settings.pushNotifications} onChange={(checked) => updateSetting('pushNotifications', checked)} />
                </div>
                {isStaff && (
                  <>
                    <Divider className="!my-3" />
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <Text strong>{t('admin:settings.notifications.newBookingAlerts')}</Text>
                        <Paragraph className="!mb-0 text-sm text-slate-500">{t('admin:settings.notifications.newBookingAlertsDescription')}</Paragraph>
                      </div>
                      <Switch checked={notificationSettings.new_booking_alerts} onChange={(checked) => updateNotificationSetting('new_booking_alerts', checked)} />
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card
              title={<span className="flex items-center gap-2"><GlobalOutlined className="text-sky-500" />{t('admin:settings.languageRegion.title')}</span>}
              className="rounded-xl shadow-sm"
            >
              <div>
                <Text strong className="block mb-2">{t('admin:settings.languageRegion.languageLabel')}</Text>
                <Paragraph className="!mb-3 text-sm text-slate-500">{t('admin:settings.languageRegion.languageDescription')}</Paragraph>
                <Select value={settings.language} onChange={(value) => updateSetting('language', value)} style={{ width: '100%' }}>
                  <Option value="en">English</Option>
                  <Option value="tr">Türkçe</Option>
                  <Option value="de">Deutsch</Option>
                  <Option value="fr">Français</Option>
                  <Option value="es">Español</Option>
                </Select>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button type="primary" size="large" icon={<SaveOutlined />} onClick={handleSave} loading={saving} className="rounded-lg">
                {t('admin:settings.savePersonalSettings')}
              </Button>
            </div>
          </div>
        );

      case 'calendar':
        return (isAdmin || isManager) ? <CalendarSettingsSection /> : null;

      case 'forecast':
        return isAdmin ? <ForecastSettings onSave={() => message.success(t('admin:settings.tabs.forecast'))} /> : null;

case 'finance':
        return isAdmin ? <FinanceSettingsView /> : null;

      case 'currency':
        return isAdmin ? (
          <div className="space-y-8">
            <BusinessCurrencySection onSave={handlePreferredCurrencySave} />
            <Divider />
            <div>
              <Title level={5} className="!mb-2">{t('admin:settings.currencySection.exchangeRates')}</Title>
              <Paragraph className="text-slate-600 mb-4">
                {t('admin:settings.currencySection.exchangeRatesDescription')}
              </Paragraph>
              <CurrencyManagementSection />
            </div>
          </div>
        ) : null;

      case 'booking-defaults':
        return (isAdmin || isManager) ? <BookingDefaultsSection businessSettings={businessSettings} /> : null;

      case 'services':
        return isAdmin ? <Categories /> : null;

      case 'roles':
        return isAdmin ? <RolesAdmin /> : null;

      case 'waivers':
        return isAdmin ? <WaiverManagement /> : null;

      case 'legal':
        return isAdmin ? <LegalDocumentsPage /> : null;

      case 'deleted-bookings':
        return (isAdmin || isManager) ? <DeletedBookingsPage /> : null;

      case 'refunds':
        return isAdmin ? <PaymentRefunds /> : null;

      case 'bank-accounts':
        return isAdmin ? <BankAccountsAdmin /> : null;

      case 'kai-logs':
        return isAdmin ? <KaiSessionsPage /> : null;

      // Student settings
      case 'safety':
        return isStudent ? <StudentSafetySettings /> : null;

      // Instructor settings
      case 'availability':
        return isInstructor ? <InstructorAvailabilitySettings /> : null;
      case 'teaching-prefs':
        return isInstructor ? <InstructorTeachingPreferences /> : null;
      case 'instructor-notifications':
        return isInstructor ? <InstructorNotificationSettings /> : null;

      // Manager settings
      case 'team-notifications':
        return isManager ? <ManagerTeamNotifications /> : null;
      case 'operational-defaults':
        return isManager ? <ManagerOperationalDefaults /> : null;

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Mobile tab selector */}
      <div className="md:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <SettingOutlined className="text-sky-500 text-lg" />
          <Title level={4} className="!mb-0">{t('admin:settings.title')}</Title>
        </div>
        <Select
          value={activeTab}
          onChange={setActiveTab}
          style={{ width: '100%' }}
          options={tabConfig.map(t => ({ value: t.key, label: t.label }))}
        />
      </div>

      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-60 border-r border-gray-200 bg-white flex-shrink-0 sticky top-0 h-screen">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <SettingOutlined className="text-sky-500 text-xl" />
              <Title level={4} className="!mb-0">{t('admin:settings.title')}</Title>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {groupedTabs.map(group => (
              <div key={group.label} className="mb-1">
                <div className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {group.label}
                </div>
                {group.items.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                      activeTab === tab.key
                        ? 'bg-sky-50 text-sky-700 border-r-2 border-sky-500 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <span className={activeTab === tab.key ? 'text-sky-500' : 'text-gray-400'}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-100 text-xs text-gray-500">
            {t('admin:settings.loggedInAs')} <strong className="text-gray-700">{user?.email}</strong>
            {isAdmin && <span className="ml-1 text-sky-600">{t('admin:settings.roleLabels.admin')}</span>}
            {isManager && !isAdmin && <span className="ml-1 text-sky-600">{t('admin:settings.roleLabels.manager')}</span>}
            {isInstructor && <span className="ml-1 text-emerald-600">{t('admin:settings.roleLabels.instructor')}</span>}
            {isStudent && <span className="ml-1 text-violet-600">{t('admin:settings.roleLabels.student')}</span>}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
            {/* Content header */}
            <div className="mb-6">
              <Title level={3} className="!mb-1">{activeTabLabel}</Title>
              <Paragraph className="text-slate-500 !mb-0">
                {(activeTab === 'account' || activeTab === 'general') && t(isAdmin ? 'admin:settings.tabDescriptions.generalAdmin' : 'admin:settings.tabDescriptions.general')}
                {activeTab === 'calendar' && t('admin:settings.tabDescriptions.calendar')}
                {activeTab === 'forecast' && t('admin:settings.tabDescriptions.forecast')}
                {activeTab === 'finance' && t('admin:settings.tabDescriptions.finance')}
                {activeTab === 'currency' && t('admin:settings.tabDescriptions.currency')}
                {activeTab === 'booking-defaults' && t('admin:settings.tabDescriptions.bookingDefaults')}
                {activeTab === 'services' && t('admin:settings.tabDescriptions.services')}
                {activeTab === 'roles' && t('admin:settings.tabDescriptions.roles')}
                {activeTab === 'waivers' && t('admin:settings.tabDescriptions.waivers')}
                {activeTab === 'legal' && t('admin:settings.tabDescriptions.legal')}
                {activeTab === 'deleted-bookings' && t('admin:settings.tabDescriptions.deletedBookings')}
                {activeTab === 'refunds' && t('admin:settings.tabDescriptions.refunds')}
                {activeTab === 'bank-accounts' && t('admin:settings.tabDescriptions.bankAccounts')}
                {activeTab === 'booking-prefs' && t('admin:settings.tabDescriptions.bookingPrefs')}
                {activeTab === 'instructor-prefs' && t('admin:settings.tabDescriptions.instructorPrefs')}
                {activeTab === 'safety' && t('admin:settings.tabDescriptions.safety')}
                {activeTab === 'availability' && t('admin:settings.tabDescriptions.availability')}
                {activeTab === 'teaching-prefs' && t('admin:settings.tabDescriptions.teachingPrefs')}
                {activeTab === 'instructor-notifications' && t('admin:settings.tabDescriptions.instructorNotifications')}
                {activeTab === 'team-notifications' && t('admin:settings.tabDescriptions.teamNotifications')}
                {activeTab === 'operational-defaults' && t('admin:settings.tabDescriptions.operationalDefaults')}
              </Paragraph>
            </div>

            <Suspense fallback={<div className="flex justify-center py-12"><Spin size="large" /></div>}>
              {renderTabContent()}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export default UserSettings;
