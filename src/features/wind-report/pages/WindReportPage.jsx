import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { UkcBrandDot } from '@/shared/components/ui/UkcBrandDot';
import { useAllReports } from '../hooks/useAllReports';
import SpotCard from '../components/SpotCard';
import WeightPickerBar from '../components/WeightPickerBar';
import { initialWeight } from '../utils/kiteSize';

const WindFlowBackdrop = () => (
  <svg
    aria-hidden
    className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] w-full opacity-[0.06]"
    preserveAspectRatio="none"
    viewBox="0 0 1440 360"
  >
    <defs>
      <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#00a8c4" stopOpacity="0" />
        <stop offset="40%" stopColor="#00a8c4" stopOpacity="1" />
        <stop offset="100%" stopColor="#00a8c4" stopOpacity="0" />
      </linearGradient>
    </defs>
    {Array.from({ length: 12 }).map((_, i) => {
      const y = 20 + i * 28;
      const offset = (i % 3) * 60;
      return (
        <path
          key={i}
          d={`M${-80 + offset} ${y} Q 360 ${y - 14} 720 ${y} T 1520 ${y}`}
          stroke="url(#flowGrad)"
          strokeWidth="1"
          fill="none"
        />
      );
    })}
  </svg>
);

const WindReportPage = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { data, isLoading, error } = useAllReports();

  const profileWeight = user?.weight || user?.weight_kg || user?.weightKg || null;
  const [weight, setWeight] = React.useState(() => initialWeight(profileWeight));

  const reports = data?.reports;
  const spotNames = reports?.map((r) => t(r.spot.nameKey)).join(' · ');

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-white via-sky-50/30 to-white">
      <WindFlowBackdrop />

      <div className="relative mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
        {/* Compact operational header */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-gotham-medium uppercase tracking-[0.3em] text-slate-500">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span>Live · {t('windReport.sources.servedBy')}</span>
            </div>
            <h1 className="font-duotone-bold-extended text-[32px] leading-[0.95] tracking-tight text-slate-900 sm:text-[36px]">
              {t('windReport.title')}
              <UkcBrandDot style={{ width: '0.22em', height: '0.22em', top: '-0.04em', marginLeft: '0.1em' }} />
            </h1>
            {spotNames && (
              <p className="mt-1 font-gotham-medium text-[12px] tracking-wide text-slate-500">
                {spotNames}
              </p>
            )}
          </div>
        </header>

        {/* Unified toolbar: weight + legend */}
        <div className="mb-5">
          <WeightPickerBar weight={weight} onChange={setWeight} />
        </div>

        {isLoading && (
          <div className="rounded-xl border border-slate-200 bg-white/60 p-12 text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[#00a8c4] border-t-transparent" />
            <p className="text-sm font-gotham-medium text-slate-500">{t('windReport.loading')}</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
            <p className="font-gotham-medium text-sm text-rose-700">{t('windReport.error')}</p>
          </div>
        )}

        {reports && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {reports.map((report) => (
              <SpotCard
                key={report.spot.id}
                report={report}
                weight={weight}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WindReportPage;
