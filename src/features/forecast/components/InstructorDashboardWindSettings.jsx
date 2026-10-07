// Settings → Forecast: "Instructor dashboard wind" (admin / manager).
// Edits settings key `instructor_dashboard` = { wind_spot, wind_min_kn, wind_max_kn }
// that drives the wind card on the instructor "My day" dashboard
// (src/features/instructor/dashboard). Backend: PUT /api/settings/instructor_dashboard
// (validated + admin/manager only, backend/routes/settings.js).
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import { message } from '@/shared/utils/antdStatic';
import { fetchSpots } from '@/features/wind-report/services/windReportService';
import { dashboardKeys } from '@/features/instructor/dashboard/dashboardApi';
import { DEFAULT_WIND } from '@/features/instructor/dashboard/dashboardFormat';
import { WIND_KN_LIMITS, validateWindForm } from './instructorWindForm';

const settingsKey = ['settings', 'instructor_dashboard'];

const fetchInstructorDashboardSetting = async () => {
  const { data } = await apiClient.get('/settings');
  return data?.instructor_dashboard ?? null;
};

const toForm = (raw) => ({
  spot: raw?.wind_spot || DEFAULT_WIND.spot,
  min: String(raw?.wind_min_kn ?? DEFAULT_WIND.minKn),
  max: String(raw?.wind_max_kn ?? DEFAULT_WIND.maxKn),
});

const inputClass = 'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function KnotsField({ id, hintId, label, value, onChange, invalid, error }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={WIND_KN_LIMITS.min}
        max={WIND_KN_LIMITS.max}
        step={1}
        value={value}
        onChange={onChange}
        aria-invalid={invalid}
        aria-describedby={hintId}
        className={inputClass}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function useSpotOptions(currentSpot) {
  const { t, i18n } = useTranslation(['common']);
  const spotsQuery = useQuery({ queryKey: ['weather', 'spots'], queryFn: fetchSpots, staleTime: 60 * 60_000, retry: false });
  const ids = spotsQuery.data?.length ? spotsQuery.data.map((s) => s.id) : [DEFAULT_WIND.spot];
  if (currentSpot && !ids.includes(currentSpot)) ids.push(currentSpot);
  return ids.map((id) => {
    const key = `common:windReport.spots.${id}`;
    return { id, label: i18n.exists?.(key) ? t(key) : id };
  });
}

export default function InstructorDashboardWindSettings() {
  const { t } = useTranslation(['admin']);
  const queryClient = useQueryClient();
  const ids = { spot: useId(), min: useId(), max: useId(), hint: useId() };

  const settingQuery = useQuery({ queryKey: settingsKey, queryFn: fetchInstructorDashboardSetting, retry: false });
  const [form, setForm] = useState(() => toForm(null));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (settingQuery.data !== undefined && !touched) setForm(toForm(settingQuery.data));
  }, [settingQuery.data, touched]);

  const save = useMutation({
    mutationFn: async (value) => {
      const { data } = await apiClient.put('/settings/instructor_dashboard', { value });
      return data;
    },
    onSuccess: (data) => {
      message.success(t('admin:settings.instructorWind.saved'));
      setTouched(false);
      queryClient.setQueryData(settingsKey, data?.setting?.value ?? null);
      // The instructor dashboard reads the same key — refresh its wind card.
      queryClient.invalidateQueries({ queryKey: dashboardKeys.settings });
    },
    onError: (error) => {
      message.error(error?.response?.data?.error || t('admin:settings.instructorWind.saveError'));
    },
  });

  const errors = validateWindForm(form);
  const invalid = Object.keys(errors).length > 0;
  const limits = { min: WIND_KN_LIMITS.min, max: WIND_KN_LIMITS.max };

  const spotOptions = useSpotOptions(form.spot);

  const update = (field) => (event) => {
    setTouched(true);
    setForm((cur) => ({ ...cur, [field]: event.target.value }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (invalid || save.isPending) return;
    save.mutate({ wind_spot: form.spot, wind_min_kn: Number(form.min), wind_max_kn: Number(form.max) });
  };

  const rangeError = t('admin:settings.instructorWind.errorRange', limits);

  return (
    <section
      aria-labelledby={`${ids.spot}-title`}
      data-testid="instructor-wind-settings"
      className="rounded-lg border border-blue-100 bg-blue-50/40 p-4"
    >
      <h3 id={`${ids.spot}-title`} className="text-base font-semibold text-gray-900">
        {t('admin:settings.instructorWind.title')}
      </h3>
      <p className="mt-1 text-sm text-gray-600">{t('admin:settings.instructorWind.description')}</p>
      {settingQuery.isError && (
        <p role="status" className="mt-2 text-sm text-amber-700">{t('admin:settings.instructorWind.loadError')}</p>
      )}

      <form onSubmit={submit} noValidate className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={ids.spot} className="mb-1 block text-sm font-medium text-gray-700">
            {t('admin:settings.instructorWind.spot')}
          </label>
          <select id={ids.spot} value={form.spot} onChange={update('spot')} className={inputClass}>
            {spotOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <KnotsField id={ids.min} hintId={ids.hint} label={t('admin:settings.instructorWind.minKn')} value={form.min} onChange={update('min')} invalid={Boolean(errors.min || errors.order)} error={errors.min ? rangeError : null} />
        <KnotsField id={ids.max} hintId={ids.hint} label={t('admin:settings.instructorWind.maxKn')} value={form.max} onChange={update('max')} invalid={Boolean(errors.max || errors.order)} error={errors.max ? rangeError : null} />

        <div className="flex flex-col gap-2 sm:col-span-3 sm:flex-row sm:items-center sm:justify-between">
          <p id={ids.hint} className={`text-xs ${errors.order ? 'text-red-600' : 'text-gray-500'}`} role={errors.order ? 'alert' : undefined}>
            {errors.order ? t('admin:settings.instructorWind.errorOrder') : t('admin:settings.instructorWind.rangeHint', limits)}
          </p>
          <button
            type="submit"
            disabled={invalid || save.isPending || settingQuery.isLoading}
            className="inline-flex min-h-[40px] items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending ? t('admin:settings.instructorWind.saving') : t('admin:settings.instructorWind.save')}
          </button>
        </div>
      </form>
    </section>
  );
}
