import { useState, useEffect, useCallback, memo } from 'react';
import { useForm } from 'react-hook-form';
import authService from '@/shared/services/auth/authService';
import PageHeader from '@/shared/components/layout/PageHeader';
import ErrorIndicator from '@/shared/components/ui/ErrorIndicator';
import apiClient from '@/shared/services/apiClient';
import FinanceSettingsView from '@/features/finances/components/FinanceSettingsView';
import CurrencySelector from '@/shared/components/ui/CurrencySelector';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import DataService from '@/shared/services/dataService';
import { loadInstructorColors, setInstructorColor } from '@/shared/utils/instructorColors';
import ForecastSettings from '@/features/forecast/components/ForecastSettings';
import { useToast } from '@/shared/contexts/ToastContext';
import CurrencyManagementSection from '../components/CurrencyManagementSection';

const CalendarSettingsSection = memo(function CalendarSettingsSection({ isLoading }) {
  const [instructors, setInstructors] = useState([]);
  const [colorsMap, setColorsMap] = useState({});
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3B82F6');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await DataService.getInstructors();
        setInstructors(list || []);
      } catch {
        // ignore
      }
      setColorsMap(loadInstructorColors());
    })();
  }, []);

  useEffect(() => {
    if (!selectedInstructor) return;
    const existing = colorsMap[String(selectedInstructor)];
    if (existing) setSelectedColor(existing);
  }, [selectedInstructor, colorsMap]);

  const onSave = async () => {
    if (!selectedInstructor || !selectedColor) return;
    setSaving(true);
    try {
      const next = setInstructorColor(selectedInstructor, selectedColor, colorsMap);
      setColorsMap(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6">
  <p className="mt-1 text-sm text-gray-600">Choose a highlight color per instructor for Monthly and 9x9 views. The color appears subtly on slot cards.</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Instructor</label>
          <select
            value={selectedInstructor}
            onChange={(e) => setSelectedInstructor(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="">Select an instructor…</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>{i.name || i.full_name || `Instructor #${i.id}`}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => setSelectedColor(e.target.value)}
            className="h-10 w-full p-0 border border-gray-300 rounded-md"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={isLoading || saving || !selectedInstructor}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Preview grid */}
      {instructors.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Current Colors</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {instructors.map((i) => {
              const c = colorsMap[String(i.id)];
              return (
                <div key={i.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 bg-white">
                  <div className="min-w-0 mr-3">
                    <div className="text-sm font-medium text-slate-900 truncate">{i.name || i.full_name || `Instructor #${i.id}`}</div>
                    <div className="text-xs text-slate-500 truncate">{c || 'Default palette'}</div>
                  </div>
                  <div className="h-6 w-6 rounded-md border" style={{ backgroundColor: c || '#E5E7EB' }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

const BusinessCurrencySection = memo(function BusinessCurrencySection({ businessSettings, isLoading, onSave }) {
  const { businessCurrency, setBusinessCurrency, getCurrencySymbol, getSupportedCurrencies } = useCurrency();
  const currencyCount = getSupportedCurrencies()?.length || 0;
  
  return (
    <div>
      <h3 className="text-lg font-medium leading-6 text-gray-900">Business Currency</h3>
      <p className="mt-1 text-sm text-gray-600">
        Choose the default currency for new services, bookings, and transactions. Existing records keep their original currency.
      </p>
      {currencyCount <= 1 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
          Only one currency is active. Go to Admin {">"} Currencies to activate more currencies so they appear here.
        </div>
      )}
      <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Currency</label>
          <CurrencySelector
            value={businessSettings?.preferred_currency?.code || businessCurrency || businessSettings?.defaultCurrency}
            onChange={(val) => setBusinessCurrency(val)}
            style={{ width: '100%' }}
          />
          <p className="mt-1 text-xs text-gray-500">Used as default for future records. Current: {getCurrencySymbol(businessCurrency || 'EUR')} ({businessCurrency || 'EUR'})</p>
        </div>
        <div className="flex justify-end sm:justify-start">
          <button
            onClick={() => onSave(businessCurrency)}
            disabled={isLoading}
            className="w-full sm:w-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Preferred Currency'}
          </button>
        </div>
      </div>
    </div>
  );
});

const BookingDefaultsSection = memo(function BookingDefaultsSection({ businessSettings, isLoading, onSubmit }) {
  return (
    <div>
      <h3 className="text-lg font-medium leading-6 text-gray-900">Booking Defaults</h3>
      <p className="mt-1 text-sm text-gray-600">
        Configure default booking duration and available options for your business
      </p>
      <form onSubmit={onSubmit} className="mt-4 sm:mt-5 space-y-4 sm:space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Booking Duration (minutes)
            </label>
            <select
              name="defaultDuration"
              defaultValue={businessSettings?.booking_defaults?.defaultDuration || 120}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
            >
              <option value={60}>1 hour (60 minutes)</option>
              <option value={90}>1.5 hours (90 minutes)</option>
              <option value={120}>2 hours (120 minutes)</option>
              <option value={150}>2.5 hours (150 minutes)</option>
              <option value={180}>3 hours (180 minutes)</option>
              <option value={240}>4 hours (240 minutes)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              This will be the default duration shown when creating new bookings
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Available Duration Options
            </label>
            <div className="space-y-2 sm:space-y-3">
              {[60, 90, 120, 150, 180, 240].map(value => (
                <label key={value} className="flex items-center">
                  <input
                    type="checkbox"
                    name="allowedDurations"
                    value={value}
                    defaultChecked={
                      businessSettings?.booking_defaults?.allowedDurations?.includes(value) ?? [60, 90, 120, 150, 180].includes(value)
                    }
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{value === 60 ? '1 hour' : value === 90 ? '1.5 hours' : `${value / 60} hours`}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Select which duration options customers can choose from
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full sm:w-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Booking Defaults'}
          </button>
        </div>
      </form>
    </div>
  );
});

const PasswordChangeSection = memo(function PasswordChangeSection({ isLoading, onSubmit }) {
  return (
    <div>
      <h3 className="text-lg font-medium leading-6 text-gray-900">Change Password</h3>
      <form onSubmit={onSubmit} className="mt-4 sm:mt-5 space-y-4 sm:space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Current Password
          </label>
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            New Password
          </label>
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Confirm New Password
          </label>
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
          />
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full sm:w-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isLoading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
});

// Reusable settings section wrapper
const SettingsSection = ({ title, isOpen, onToggle, children }) => (
  <div className="bg-white shadow rounded-lg overflow-hidden">
    <button
      type="button"
      className="w-full flex items-center justify-between px-4 py-3 text-left"
      onClick={onToggle}
    >
      <span className="text-base sm:text-lg font-medium text-gray-900">{title}</span>
      <span className="text-sm text-slate-500">{isOpen ? 'Hide' : 'Show'}</span>
    </button>
    {isOpen && children}
  </div>
);

const Settings = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [openSection, setOpenSection] = useState('forecast');
  const { showSuccess } = useToast();

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: {
      email: '',
      name: '',
      phone: '',
      notifications_enabled: true,
      language: 'en',
      timezone: 'UTC',
      theme: 'light'
    }
  });

  // Load user settings and business settings
  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await apiClient.get('/settings');
        const settings = response.data;
        
        // Store business settings separately
        setBusinessSettings(settings);
        
        // Update form with user settings (if available)
        if (settings.user_settings) {
          setValue('email', settings.user_settings.email || '');
          setValue('name', settings.user_settings.name || '');
          setValue('phone', settings.user_settings.phone || '');
          setValue('notifications_enabled', settings.user_settings.notifications_enabled !== false);
          setValue('language', settings.user_settings.language || 'en');
          setValue('timezone', settings.user_settings.timezone || 'UTC');
          setValue('theme', settings.user_settings.theme || 'light');
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading settings:', error);
        setError('Failed to load settings. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [setValue]);

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError(null);

    try {
      await authService.apiClient.put('/settings', data);
      showSuccess('Settings updated successfully');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error updating settings:', err);
      setError(err.message || 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBookingDefaultsSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const defaultDuration = parseInt(formData.get('defaultDuration'));
    const allowedDurations = formData.getAll('allowedDurations').map(d => parseInt(d));

    if (!allowedDurations.includes(defaultDuration)) {
      setError('Default duration must be one of the allowed durations');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiClient.put('/settings/booking_defaults', {
        value: {
          defaultDuration,
          allowedDurations
        }
      });
      showSuccess('Booking defaults updated successfully');
      
      // Refresh settings
      const response = await apiClient.get('/settings');
      setBusinessSettings(response.data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error updating booking defaults:', err);
      setError(err.message || 'Failed to update booking defaults');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    const currentPassword = e.target.currentPassword.value;
    const newPassword = e.target.newPassword.value;
    const confirmPassword = e.target.confirmPassword.value;

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await authService.apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword
      });
      showSuccess('Password changed successfully');
      e.target.reset();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error changing password:', err);
      setError(err.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreferredCurrencySave = useCallback(async (code) => {
    try {
      setIsLoading(true);
      setError(null);
      await apiClient.put('/settings/preferred_currency', {
        value: {
          code: code || 'EUR',
          effectiveFrom: new Date().toISOString()
        }
      });
      showSuccess('Preferred currency updated');
      const response = await apiClient.get('/settings');
      setBusinessSettings(response.data);
    } catch (e) {
      setError(e?.message || 'Failed to update preferred currency');
    } finally {
      setIsLoading(false);
    }
  }, [showSuccess]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        <PageHeader
          title="Configuration"
          description="Manage your account settings and business preferences"
        />

        {error && (
          <div className="mb-4">
            <ErrorIndicator message={error} />
          </div>
        )}

        <div className="mt-6 sm:mt-8 space-y-3">
          {/* Forecast Settings */}
          <SettingsSection
            title="Forecast Settings"
            isOpen={openSection === 'forecast'}
            onToggle={() => setOpenSection(openSection === 'forecast' ? null : 'forecast')}
          >
            <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6 border-t border-slate-100">
              <p className="mt-1 text-sm text-gray-600">
                Configure wind forecast settings including units, data sources, and display options
              </p>
              <div className="mt-4 sm:mt-6">
                <ForecastSettings onSave={() => {
                  showSuccess('Forecast settings saved successfully!');
                }} />
              </div>
            </div>
          </SettingsSection>

          {/* Finance Settings */}
          <SettingsSection
            title="Finance Settings"
            isOpen={openSection === 'finance'}
            onToggle={() => setOpenSection(openSection === 'finance' ? null : 'finance')}
          >
            <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6 border-t border-slate-100">
              <p className="mt-1 text-sm text-gray-600">
                Configure calculation rates and payment fees for both cash and accrual accounting modes
              </p>
              <div className="mt-4 sm:mt-6">
                <FinanceSettingsView />
              </div>
            </div>
          </SettingsSection>

          {/* Calendar Settings */}
          <SettingsSection
            title="Calendar"
            isOpen={openSection === 'calendar'}
            onToggle={() => setOpenSection(openSection === 'calendar' ? null : 'calendar')}
          >
            <div className="border-t border-slate-100">
              <CalendarSettingsSection isLoading={isLoading} />
            </div>
          </SettingsSection>

          {/* Business Currency */}
          <SettingsSection
            title="Business Currency"
            isOpen={openSection === 'currency'}
            onToggle={() => setOpenSection(openSection === 'currency' ? null : 'currency')}
          >
            <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6 border-t border-slate-100">
              <BusinessCurrencySection 
                businessSettings={businessSettings} 
                isLoading={isLoading} 
                onSave={handlePreferredCurrencySave} 
              />
            </div>
          </SettingsSection>

          {/* Exchange Rates Management */}
          <SettingsSection
            title="Exchange Rates"
            isOpen={openSection === 'exchangeRates'}
            onToggle={() => setOpenSection(openSection === 'exchangeRates' ? null : 'exchangeRates')}
          >
            <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6 border-t border-slate-100">
              <CurrencyManagementSection />
            </div>
          </SettingsSection>

          {/* Booking Defaults */}
          <SettingsSection
            title="Booking Defaults"
            isOpen={openSection === 'booking'}
            onToggle={() => setOpenSection(openSection === 'booking' ? null : 'booking')}
          >
            <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6 border-t border-slate-100">
              <BookingDefaultsSection 
                businessSettings={businessSettings}
                isLoading={isLoading}
                onSubmit={handleBookingDefaultsSubmit}
              />
            </div>
          </SettingsSection>

          {/* Profile Settings */}
          <SettingsSection
            title="Profile Settings"
            isOpen={openSection === 'profile'}
            onToggle={() => setOpenSection(openSection === 'profile' ? null : 'profile')}
          >
            <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6 border-t border-slate-100">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                    <input
                      type="text"
                      autoComplete="name"
                      {...register('name', { required: 'Name is required' })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
                    />
                    {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
                  </div>

                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      autoComplete="email"
                      {...register('email', { required: 'Email is required' })}
                      disabled
                      className="w-full rounded-md border-gray-300 bg-gray-50 shadow-sm text-base sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                    <input
                      type="tel"
                      autoComplete="tel"
                      {...register('phone')}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                    <select
                      {...register('language')}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                    <select
                      {...register('timezone')}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Chicago">Central Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Theme</label>
                    <select
                      {...register('theme')}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base sm:text-sm"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center pt-2">
                  <input
                    type="checkbox"
                    {...register('notifications_enabled')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-700">
                    Enable email notifications
                  </label>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full sm:w-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </SettingsSection>

          {/* Password Change */}
          <SettingsSection
            title="Change Password"
            isOpen={openSection === 'password'}
            onToggle={() => setOpenSection(openSection === 'password' ? null : 'password')}
          >
            <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6 border-t border-slate-100">
              <PasswordChangeSection isLoading={isLoading} onSubmit={handlePasswordChange} />
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
};

export default Settings;