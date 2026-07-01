import React from 'react';
import { useTranslation } from 'react-i18next';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/shared/hooks/useAuth';
import { UkcBrandDot } from '@/shared/components/ui/UkcBrandDot';
import { useAllReports } from '../hooks/useAllReports';
import SpotCard from '../components/SpotCard';
import PwsLiveStation from '../components/PwsLiveStation';
import WindHistoryCard from '../components/WindHistoryCard';
import WeightPickerBar from '../components/WeightPickerBar';
import { Eyebrow } from '../components/Typo';
import { initialWeight } from '../utils/kiteSize';
import { dailySummary, groupByDay, rideabilityScore, hhmm } from '../utils/verdict';

const WindReportPage = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { data, isLoading, error } = useAllReports();

  const profileWeight = user?.weight || user?.weight_kg || user?.weightKg || null;
  const [weight, setWeight] = React.useState(() => initialWeight(profileWeight));

  const reports = data?.reports;

  // Rank spots by how rideable today is; pin the home beach (Gülbahçe) first.
  const ranked = React.useMemo(() => {
    if (!reports) return [];
    const scored = reports.map((report) => {
      if (report.error || !report.forecast) return { report, score: -Infinity, summary: null };
      const days = groupByDay(report.forecast.hours || []);
      const summary = days[0] ? dailySummary(days[0].rows) : null;
      return { report, score: rideabilityScore(summary), summary };
    });
    scored.sort((a, b) => {
      const ag = a.report.spot?.id === 'gulbahce';
      const bg = b.report.spot?.id === 'gulbahce';
      if (ag !== bg) return ag ? -1 : 1;
      return b.score - a.score;
    });
    return scored;
  }, [reports]);

  const { featured, rest } = React.useMemo(() => {
    const f = ranked.find((x) => x.report.spot?.id === 'gulbahce') || ranked[0] || null;
    return { featured: f, rest: ranked.filter((x) => x !== f) };
  }, [ranked]);

  // The single best ride across all spots today.
  const best = React.useMemo(() => {
    const cand = ranked.filter((x) => x.summary && x.score > -Infinity);
    if (!cand.length) return null;
    return cand.reduce((m, x) => (x.score > m.score ? x : m), cand[0]);
  }, [ranked]);

  const bestRideable = best && best.summary && best.summary.key !== 'tooLight';

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-white via-sky-50/30 to-white">
      <div className="relative mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
        {/* Compact header */}
        <header className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" />
            <Eyebrow>{t('windReport.live.label', { defaultValue: 'Live now' })}</Eyebrow>
            <span className="text-slate-300">·</span>
            <Eyebrow className="normal-case tracking-normal text-slate-500">
              {t('windReport.sources.servedByPws', { defaultValue: 'via Weather Underground' })}
            </Eyebrow>
          </div>
          <h1 className="font-duotone-bold-extended text-[32px] leading-[0.95] tracking-normal text-slate-900 sm:text-[36px]">
            {t('windReport.title')}
            <UkcBrandDot style={{ width: '0.22em', height: '0.22em', top: '-0.04em', marginLeft: '0.1em' }} />
          </h1>
        </header>

        {/* Live hero */}
        <PwsLiveStation weight={weight} />

        {/* Live-station history — recorded server-side, never deleted, gaps when offline */}
        <WindHistoryCard />

        {/* Weight setter + colour legend */}
        <div className="mb-5">
          <WeightPickerBar weight={weight} onChange={setWeight} />
        </div>

        {/* Best today — cross-spot answer */}
        {best && (
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-50 to-white px-4 py-3 ring-1 ring-cyan-100">
            <SparklesIcon className="h-5 w-5 shrink-0 text-[#00a8c4]" />
            <div className="min-w-0">
              <Eyebrow className="text-[#00a8c4]">{t('windReport.bestToday.label', { defaultValue: 'Best today' })}</Eyebrow>
              {bestRideable ? (
                <p className="font-duotone-bold text-[16px] leading-tight text-slate-900">
                  {t(best.report.spot.nameKey)}
                  <span className="font-gotham-medium text-[14px] text-slate-500">
                    {' — '}
                    {t('windReport.bestToday.peaks', {
                      peak: best.summary.peakKn,
                      time: hhmm(best.summary.peakHour),
                      defaultValue: `peaks ${best.summary.peakKn} kn @ ${hhmm(best.summary.peakHour)}`,
                    })}
                  </span>
                </p>
              ) : (
                <p className="font-duotone-bold text-[16px] leading-tight text-slate-600">
                  {t('windReport.bestToday.none', { defaultValue: 'Nothing rideable today across the spots.' })}
                </p>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="rounded-xl border border-slate-200 bg-white/60 p-12 text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[#00a8c4] border-t-transparent motion-reduce:animate-none" />
            <p className="text-sm font-gotham-medium text-slate-500">{t('windReport.loading')}</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
            <p className="font-gotham-medium text-sm text-rose-700">{t('windReport.error')}</p>
          </div>
        )}

        {reports && (
          <div className="flex flex-col gap-4">
            {/* Featured home spot — full width, open by default */}
            {featured && (
              <SpotCard
                key={featured.report.spot.id}
                report={featured.report}
                weight={weight}
                index={0}
                featured
                defaultOpen
                maxDays={10}
              />
            )}
            {/* The rest, ranked best-first */}
            {rest.length > 0 && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {rest.map((x, i) => (
                  <SpotCard
                    key={x.report.spot.id}
                    report={x.report}
                    weight={weight}
                    index={i + 1}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WindReportPage;
