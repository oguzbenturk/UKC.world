/**
 * UserSettings Page
 * 
 * Unified settings hub with left sidebar navigation.
 * Personal preferences for all users; admin/business tabs for managers/admins.
 */

import { useState, useEffect, useCallback, memo, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const FORM_CONTEXTS = [
  { key: 'staff_booking', label: 'Staff Booking Wizard', description: 'Instructor picker when staff create a new booking' },
  { key: 'customer_modal', label: 'Customer Booking Modal', description: 'Booking from a customer profile page' },
  { key: 'public_booking', label: 'Public Booking Form', description: 'Outsider / guest booking form' },
];

const CalendarSettingsSection = memo(function CalendarSettingsSection() {
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
      message.error('Closing time must be after opening time');
      return;
    }
    setSavingWH(true);
    try {
      await apiClient.put('/settings/calendar_working_hours', { value: workingHours });
      // Apply immediately to in-memory config
      const { applyWorkingHours } = await import('@/config/calendarConfig');
      applyWorkingHours(workingHours.start, workingHours.end);
      message.success('Working hours saved');
    } catch {
      message.error('Failed to save working hours');
    } finally {
      setSavingWH(false);
    }
  };

  const onSaveFormVisibility = async () => {
    setSavingFV(true);
    try {
      await apiClient.put('/settings/instructor_form_visibility', { value: formVisibility });
      message.success('Instructor visibility saved');
    } catch {
      message.error('Failed to save instructor visibility');
    } finally {
      setSavingFV(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Working Hours ── */}
      <Card
        title={<span className="flex items-center gap-2"><CalendarOutlined className="text-sky-500" />Working Hours</span>}
        className="rounded-xl shadow-sm"
      >
        <Paragraph className="text-slate-600 mb-4">
          Set the daily opening and closing times for the booking calendar and available time slots.
        </Paragraph>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <Text strong className="block mb-2">Opens at</Text>
            <Select
              value={workingHours.start}
              onChange={v => setWorkingHours(prev => ({ ...prev, start: v }))}
              style={{ width: '100%' }}
              options={HOUR_OPTIONS.filter(o => o.value < '23:00')}
            />
          </div>
          <div>
            <Text strong className="block mb-2">Closes at</Text>
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
            Save Working Hours
          </Button>
        </div>
      </Card>

      {/* ── Instructor Visibility per Form ── */}
      <Card
        title={<span className="flex items-center gap-2"><TeamOutlined className="text-sky-500" />Instructor Visibility per Form</span>}
        className="rounded-xl shadow-sm"
      >
        <Paragraph className="text-slate-600 mb-4">
          Restrict which instructors appear in each booking form. Leave empty to show all instructors.
        </Paragraph>
        <div className="space-y-5">
          {FORM_CONTEXTS.map(({ key, label, description }) => (
            <div key={key}>
              <Text strong className="block mb-1">{label}</Text>
              <Paragraph className="!mb-2 text-sm text-slate-500">{description}</Paragraph>
              <Select
                mode="multiple"
                placeholder="All instructors (no restriction)"
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
            Save Visibility
          </Button>
        </div>
      </Card>

    </div>
  );
});

// Business Currency Section
const BusinessCurrencySection = memo(function BusinessCurrencySection({ onSave }) {
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
      message.success('Business currency updated');
    } catch (e) {
      message.error('Failed to update currency');
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
        message.success('Registration currencies updated');
        setAllowedRegistrationCurrencies(currencies);
      } else {
        message.error('Failed to update registration currencies');
      }
    } catch (error) {
      message.error('Failed to update registration currencies');
    } finally {
      setLoadingRegCurrencies(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <Title level={5} className="!mb-2">Default Business Currency</Title>
        <Paragraph className="text-slate-600 mb-4">
          This currency is used as the default for new services, bookings, and transactions. Existing records keep their original currency.
        </Paragraph>
        {currencyCount <= 1 && (
          <Alert
            type="warning"
            message="Only one currency is active. Go to Admin > Currencies to activate more currencies."
            className="rounded-lg mb-4"
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div>
            <Text strong className="block mb-2">Preferred Currency</Text>
            <CurrencySelector
              value={businessCurrency}
              onChange={(val) => setBusinessCurrency(val)}
              style={{ width: '100%' }}
            />
            <Text type="secondary" className="text-xs mt-1 block">
              Current: {getCurrencySymbol(businessCurrency || 'EUR')} ({businessCurrency || 'EUR'})
            </Text>
          </div>
          <div className="flex justify-end sm:justify-start">
            <Button type="primary" onClick={handleSave} loading={saving}>
              Save Preferred Currency
            </Button>
          </div>
        </div>
      </div>

      <Divider />

      <div>
        <Title level={5} className="!mb-2">Registration Currency Options</Title>
        <Paragraph className="text-slate-600 mb-4">
          Control which currencies users can select when creating a new account. Only active currencies can be selected.
        </Paragraph>
        
        <div className="space-y-4">
          <div>
            <Text strong className="block mb-2">Allowed Currencies for New Users</Text>
            <Select
              mode="multiple"
              placeholder={currenciesLoading ? "Loading currencies..." : "Select currencies available during registration"}
              value={allowedRegistrationCurrencies}
              onChange={updateRegistrationCurrencies}
              style={{ width: '100%' }}
              loading={loadingRegCurrencies || currenciesLoading}
              disabled={currenciesLoading}
              notFoundContent={currenciesLoading ? "Loading..." : "No currencies available"}
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
            message="Registration Currencies"
            description={`New users can choose from: ${allowedRegistrationCurrencies.join(', ')}`}
            className="rounded-lg"
          />
        </div>
      </div>
    </div>
  );
});

// Booking Defaults Section
const BookingDefaultsSection = memo(function BookingDefaultsSection({ businessSettings }) {
  const [saving, setSaving] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(businessSettings?.booking_defaults?.defaultDuration || 120);
  const [allowedDurations, setAllowedDurations] = useState(
    businessSettings?.booking_defaults?.allowedDurations || [60, 90, 120, 150, 180]
  );
  const { message } = App.useApp();

  const handleSubmit = async () => {
    if (!allowedDurations.includes(defaultDuration)) {
      message.error('Default duration must be one of the allowed durations');
      return;
    }

    setSaving(true);
    try {
      await apiClient.put('/settings/booking_defaults', {
        value: { defaultDuration, allowedDurations }
      });
      message.success('Booking defaults updated');
    } catch (err) {
      message.error('Failed to update booking defaults');
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
        Configure default booking duration and available options.
      </Paragraph>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Text strong className="block mb-2">Default Duration</Text>
          <Select value={defaultDuration} onChange={setDefaultDuration} style={{ width: '100%' }}>
            <Option value={60}>1 hour</Option>
            <Option value={90}>1.5 hours</Option>
            <Option value={120}>2 hours</Option>
            <Option value={150}>2.5 hours</Option>
            <Option value={180}>3 hours</Option>
            <Option value={240}>4 hours</Option>
          </Select>
        </div>
        <div>
          <Text strong className="block mb-2">Available Durations</Text>
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
                  {value === 60 ? '1 hour' : value === 90 ? '1.5 hours' : `${value / 60} hours`}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button type="primary" onClick={handleSubmit} loading={saving}>
          Save Booking Defaults
        </Button>
      </div>
    </div>
  );
});

const UserSettings = () => {
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
      message.success('Currency preference updated successfully');
    } catch (error) {
      message.error('Failed to update currency preference');
    } finally {
      setSavingCurrency(false);
    }
  }, [selectedCurrency, refreshUser, message]);

  usePageSEO({
    title: 'Settings | Plannivo',
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
      message.success('Settings saved successfully');
    } catch (error) {
      message.error('Failed to save settings');
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
      message.success('Notification settings updated');
    } catch (error) {
      // Revert on error
      setNotificationSettings(prev => ({ ...prev, [key]: !value }));
      message.error('Failed to update notification settings');
    }
  };

  // Tab configuration for sidebar navigation — must be before early returns
  const tabConfig = useMemo(() => {
    const tabs = [
      { key: 'general', label: 'General', icon: <UserOutlined />, group: 'Personal' },
    ];
    // Manager-accessible tabs (subset of admin)
    if (isAdmin || isManager) {
      tabs.push(
        { key: 'calendar', label: 'Calendar', icon: <CalendarOutlined />, group: 'Business' },
        { key: 'booking-defaults', label: 'Booking Defaults', icon: <ToolOutlined />, group: 'Business' },
      );
    }
    // Admin-only tabs
    if (isAdmin) {
      tabs.push(
        { key: 'forecast', label: 'Forecast', icon: <CloudOutlined />, group: 'Business' },
{ key: 'finance', label: 'Finance', icon: <DollarOutlined />, group: 'Business' },
        { key: 'currency', label: 'Currency', icon: <DollarOutlined />, group: 'Business' },
        { key: 'services', label: 'Service Creation', icon: <AppstoreOutlined />, group: 'Services' },
        { key: 'roles', label: 'Roles & Permissions', icon: <TeamOutlined />, group: 'Access' },
        { key: 'waivers', label: 'Waivers', icon: <SafetyOutlined />, group: 'Legal' },
        { key: 'legal', label: 'Legal Documents', icon: <FileTextOutlined />, group: 'Legal' },
        { key: 'refunds', label: 'Payment Refunds', icon: <RollbackOutlined />, group: 'Payments' },
        { key: 'bank-accounts', label: 'Bank Accounts', icon: <BankOutlined />, group: 'Payments' },
        { key: 'kai-logs', label: 'Kai Logs', icon: <RobotOutlined />, group: 'AI' },
      );
    }
    // Deleted Bookings: manager + admin
    if (isAdmin || isManager) {
      tabs.push(
        { key: 'deleted-bookings', label: 'Deleted Bookings', icon: <DeleteOutlined />, group: 'Operations' },
      );
    }
    // Student tabs
    if (isStudent) {
      tabs.push(
        { key: 'safety', label: 'Safety & Medical', icon: <MedicineBoxOutlined />, group: 'Personal' },
      );
    }
    // Instructor tabs
    if (isInstructor) {
      tabs.push(
        { key: 'availability', label: 'Availability', icon: <CalendarOutlined />, group: 'Schedule' },
        { key: 'teaching-prefs', label: 'Teaching Preferences', icon: <BookOutlined />, group: 'Teaching' },
        { key: 'instructor-notifications', label: 'Notifications', icon: <BellOutlined />, group: 'Personal' },
      );
    }
    // Manager-specific tabs
    if (isManager) {
      tabs.push(
        { key: 'team-notifications', label: 'Team Notifications', icon: <TeamOutlined />, group: 'Operations' },
        { key: 'operational-defaults', label: 'Operational Defaults', icon: <ToolOutlined />, group: 'Operations' },
      );
    }
    return tabs;
  }, [isAdmin, isManager, isStudent, isInstructor]);

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
        <div className="text-slate-500">Loading settings...</div>
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
              title={<span className="flex items-center gap-2"><BellOutlined className="text-sky-500" />Notification Preferences</span>}
              className="rounded-xl shadow-sm"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Text strong>Email Notifications</Text>
                    <Paragraph className="!mb-0 text-sm text-slate-500">Receive booking confirmations and updates via email</Paragraph>
                  </div>
                  <Switch checked={settings.emailNotifications} onChange={(checked) => updateSetting('emailNotifications', checked)} />
                </div>
                <Divider className="!my-3" />
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Text strong>SMS Notifications</Text>
                    <Paragraph className="!mb-0 text-sm text-slate-500">Get text messages for important updates</Paragraph>
                  </div>
                  <Switch checked={settings.smsNotifications} onChange={(checked) => updateSetting('smsNotifications', checked)} />
                </div>
                <Divider className="!my-3" />
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Text strong>Push Notifications</Text>
                    <Paragraph className="!mb-0 text-sm text-slate-500">Receive real-time notifications in your browser</Paragraph>
                  </div>
                  <Switch checked={settings.pushNotifications} onChange={(checked) => updateSetting('pushNotifications', checked)} />
                </div>
                {isStaff && (
                  <>
                    <Divider className="!my-3" />
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <Text strong>New Booking Alerts</Text>
                        <Paragraph className="!mb-0 text-sm text-slate-500">Get notified when students request new bookings</Paragraph>
                      </div>
                      <Switch checked={notificationSettings.new_booking_alerts} onChange={(checked) => updateNotificationSetting('new_booking_alerts', checked)} />
                    </div>
                  </>
                )}
              </div>
            </Card>


            <Card
              title={<span className="flex items-center gap-2"><GlobalOutlined className="text-sky-500" />Language & Region</span>}
              className="rounded-xl shadow-sm"
            >
              <div>
                <Text strong className="block mb-2">Language</Text>
                <Paragraph className="!mb-3 text-sm text-slate-500">Choose your preferred language for the interface</Paragraph>
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
                Save Personal Settings
              </Button>
            </div>
          </div>
        );

      case 'calendar':
        return (isAdmin || isManager) ? <CalendarSettingsSection /> : null;

      case 'forecast':
        return isAdmin ? <ForecastSettings onSave={() => message.success('Forecast settings saved!')} /> : null;

case 'finance':
        return isAdmin ? <FinanceSettingsView /> : null;

      case 'currency':
        return isAdmin ? (
          <div className="space-y-8">
            <BusinessCurrencySection onSave={handlePreferredCurrencySave} />
            <Divider />
            <div>
              <Title level={5} className="!mb-2">Exchange Rates</Title>
              <Paragraph className="text-slate-600 mb-4">
                Manage exchange rates relative to EUR (base currency). Enable auto-update to fetch rates automatically.
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
          <Title level={4} className="!mb-0">Settings</Title>
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
              <Title level={4} className="!mb-0">Settings</Title>
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
            Logged in as <strong className="text-gray-700">{user?.email}</strong>
            {isAdmin && <span className="ml-1 text-sky-600">(Admin)</span>}
            {isManager && !isAdmin && <span className="ml-1 text-sky-600">(Manager)</span>}
            {isInstructor && <span className="ml-1 text-emerald-600">(Instructor)</span>}
            {isStudent && <span className="ml-1 text-violet-600">(Student)</span>}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
            {/* Content header */}
            <div className="mb-6">
              <Title level={3} className="!mb-1">{activeTabLabel}</Title>
              <Paragraph className="text-slate-500 !mb-0">
                {(activeTab === 'account' || activeTab === 'general') && (isAdmin
                  ? 'Manage your account, personal preferences, and notification settings'
                  : 'Manage your account details, preferences, and notification settings')}
                {activeTab === 'calendar' && 'Configure instructor colors for calendar views'}
                {activeTab === 'forecast' && 'Configure wind forecast settings including units, data sources, and display options'}
{activeTab === 'finance' && 'Configure calculation rates and payment fees'}
                {activeTab === 'currency' && 'Manage business currency, registration currencies, and exchange rates'}
                {activeTab === 'booking-defaults' && 'Configure default booking duration and available options'}
                {activeTab === 'services' && 'Manage service categories and types'}
                {activeTab === 'roles' && 'Manage user roles and permissions'}
                {activeTab === 'waivers' && 'Manage waiver templates and submissions'}
                {activeTab === 'legal' && 'Manage terms of service, privacy policy, and legal documents'}
                {activeTab === 'deleted-bookings' && 'View and manage deleted bookings'}
                {activeTab === 'refunds' && 'Process and track payment refunds'}
                {activeTab === 'bank-accounts' && 'Manage bank accounts for payments'}
                {activeTab === 'booking-prefs' && 'Set your default preferences for booking lessons'}
                {activeTab === 'instructor-prefs' && 'Choose your preferred instructor and lesson language'}
                {activeTab === 'safety' && 'Provide emergency contact and medical information for your safety'}
                {activeTab === 'availability' && 'Manage your weekly working hours and time-off requests'}
                {activeTab === 'teaching-prefs' && 'Configure your teaching preferences and specializations'}
                {activeTab === 'instructor-notifications' && 'Choose which notifications you receive as an instructor'}
                {activeTab === 'team-notifications' && 'Configure team activity and operational notifications'}
                {activeTab === 'operational-defaults' && 'Set default values for daily booking operations'}
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
