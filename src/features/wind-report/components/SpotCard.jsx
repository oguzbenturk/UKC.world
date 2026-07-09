import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Disclosure } from '@headlessui/react';
import { ArrowUpRightIcon, MapPinIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import ForecastGrid from './ForecastGrid';
import ModelTabs from './ModelTabs';
import { useSpotModelSeries } from '../hooks/useSpotModelSeries';
import { useModelAccuracy } from '../hooks/useModelAccuracy';
import { MIX_KEY } from '../utils/models';
import SessionVerdict from './SessionVerdict';
import HourDetail from './HourDetail';
import KiteRecommendation from './KiteRecommendation';
import { Eyebrow } from './Typo';
import { dailySummary, groupByDay, hhmm } from '../utils/verdict';

const REGION_LABEL = { izmir: 'İzmir', canakkale: 'Çanakkale' };

const SpotCard = ({ report, weight, index = 0, featured = false, defaultOpen = false, maxDays = 3 }) => {
  const { t, i18n } = useTranslation('common');
  const reduce = useReducedMotion();
  const locale = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  const spot = report?.spot;
  const baseForecast = report?.forecast;

  // Model tabs: Mix ships in the page payload (baseForecast); any other model is fetched
  // on demand and swapped in. All hooks run unconditionally (rules-of-hooks safe).
  const [model, setModel] = React.useState(MIX_KEY);
  const isGulbahce = spot?.id === 'gulbahce';
  const { data: modelData } = useSpotModelSeries(spot?.id, model, model !== MIX_KEY);
  const { data: accuracyData } = useModelAccuracy(spot?.id, isGulbahce);

  const forecast = model === MIX_KEY ? baseForecast : (modelData?.forecast || baseForecast);
  const accuracy = React.useMemo(
    () => Object.fromEntries((accuracyData?.models || []).map((m) => [m.key, m.maeKn])),
    [accuracyData]
  );

  const days = React.useMemo(() => groupByDay(forecast?.hours || []).slice(0, maxDays), [forecast, maxDays]);
  const todaySummary = React.useMemo(() => (days[0] ? dailySummary(days[0].rows) : null), [days]);

  // Default (and reset) the selected hour from the BASE (mix) forecast only, so switching
  // model tabs never clobbers an hour the user picked to cross-compare across models.
  const defaultKey = React.useMemo(() => {
    const baseDays = groupByDay(baseForecast?.hours || []).slice(0, maxDays);
    const baseSummary = baseDays[0] ? dailySummary(baseDays[0].rows) : null;
    if (!baseSummary || baseSummary.peakHour == null || !baseDays[0]) return null;
    return `${baseDays[0].dateLocal}:${baseSummary.peakHour}`;
  }, [baseForecast, maxDays]);

  const [selectedKey, setSelectedKey] = React.useState(defaultKey);
  React.useEffect(() => { setSelectedKey(defaultKey); }, [defaultKey]);

  const selectedHour = React.useMemo(() => {
    if (!selectedKey) return null;
    for (const d of days) {
      for (const r of d.rows) {
        if (`${d.dateLocal}:${r.hour}` === selectedKey) return { ...r, dateLocal: d.dateLocal };
      }
    }
    return null;
  }, [selectedKey, days]);

  if (!spot) return null;

  if (report.error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-duotone-bold text-base text-amber-800">{t(spot.nameKey)}</h3>
        <p className="mt-1 font-gotham-medium text-sm text-amber-700">{report.error}</p>
      </div>
    );
  }

  const isAway = spot.region === 'canakkale';
  const regionLabel = REGION_LABEL[spot.region] || spot.region;

  const initDate = forecast?.model?.initUtcIso ? new Date(forecast.model.initUtcIso) : null;
  const initStr = initDate
    ? `${initDate.getUTCDate()} ${initDate.toLocaleDateString(locale, { month: 'short' })} ${String(initDate.getUTCHours()).padStart(2, '0')}z`
    : '';

  const summaryWind = todaySummary?.avgKn ?? null;

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-2xl bg-white transition-shadow ${
        featured
          ? 'ring-2 ring-[#00a8c4]/30 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_44px_-14px_rgba(0,168,196,0.18)]'
          : 'ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-6px_rgba(15,23,42,0.06)]'
      }`}
    >
      <Disclosure defaultOpen={defaultOpen}>
        {({ open }) => (
          <>
            {/* ── SUMMARY ROW (always visible, the glanceable answer) ── */}
            <Disclosure.Button className="block w-full px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] focus-visible:ring-inset sm:px-6 sm:py-5">
              {featured && (
                <Eyebrow className="mb-1 block text-[#00a8c4]">
                  {t('windReport.featured.yourBeach', { defaultValue: 'Your beach' })}
                </Eyebrow>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                {/* left: name + region + water */}
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-gotham-medium text-[13px] text-slate-600">{regionLabel}</span>
                    {isAway && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-gotham-medium text-slate-500">
                        {t('windReport.region.away', { defaultValue: 'away' })}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                      <MapPinIcon className="h-3.5 w-3.5" />
                      {spot.lat.toFixed(2)}°N
                    </span>
                    {spot.water && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-gotham-medium text-slate-600 ring-1 ring-slate-200">
                        {t(`windReport.water.${spot.water}`)}
                      </span>
                    )}
                  </div>
                  <h2 className="font-duotone-bold-extended text-[26px] leading-[0.98] tracking-normal text-slate-900 sm:text-[28px]">
                    {t(spot.nameKey)}
                  </h2>
                  <div className="mt-3 max-w-md">
                    <SessionVerdict summary={todaySummary} />
                  </div>
                </div>

                {/* right: compact kite + expand caret */}
                <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <div className="flex flex-col sm:items-end">
                    <Eyebrow>{t('windReport.kiteSizer.recommended', { defaultValue: 'Recommended' })}</Eyebrow>
                    <KiteRecommendation weight={weight} windKn={summaryWind ?? 15} compact />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[12px] font-gotham-medium text-slate-600 ring-1 ring-slate-200">
                    {open
                      ? t('windReport.card.hide', { defaultValue: 'Hide' })
                      : t('windReport.card.forecast', { defaultValue: '3-day forecast' })}
                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </span>
                </div>
              </div>
            </Disclosure.Button>

            {/* ── EXPANDED: full timeline ── */}
            <Disclosure.Panel>
              <div className="border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Eyebrow>{t('windReport.metrics.hourly')}</Eyebrow>
                  <ModelTabs
                    models={forecast?.models || []}
                    active={model}
                    onSelect={setModel}
                    accuracy={accuracy}
                    t={t}
                  />
                </div>

                <ForecastGrid
                  days={days}
                  modelName={forecast?.model?.name}
                  selectedKey={selectedKey}
                  onSelectHour={(h) => setSelectedKey(`${h.dateLocal}:${h.hour}`)}
                  locale={locale}
                  t={t}
                />

                {/* selected-hour kite (tracks the tapped hour) */}
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                  <KiteRecommendation
                    weight={weight}
                    windKn={selectedHour?.wspdKn ?? todaySummary?.avgKn ?? 15}
                    timeLabel={selectedHour ? hhmm(selectedHour.hour) : null}
                  />
                </div>
              </div>

              <HourDetail hour={selectedHour} />

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-5 py-2.5 sm:px-6">
                <span className="text-[11px] font-gotham-medium text-slate-500">
                  {t('windReport.sources.servedBy')} · {forecast?.model?.name} {forecast?.model?.resolution}
                  {initStr ? ` · init ${initStr}` : ''}
                </span>
                <a
                  href={`https://www.windguru.cz/${spot.windguruSpotId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-gotham-medium text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] rounded"
                >
                  <span>#{spot.windguruSpotId}</span>
                  <ArrowUpRightIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            </Disclosure.Panel>
          </>
        )}
      </Disclosure>
    </motion.article>
  );
};

export default SpotCard;
