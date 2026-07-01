import React from 'react';
import { useTranslation } from 'react-i18next';
import { Popover } from '@headlessui/react';
import { UserIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { MIN_WEIGHT, MAX_WEIGHT, WEIGHT_STORAGE_KEY } from '../utils/kiteSize';
import { WR_FILL } from '../utils/bandTheme';
import { Eyebrow, DataLabel } from './Typo';

const LEGEND_BANDS = [
  { k: 'flat', range: '0–7' },
  { k: 'light', range: '8–11' },
  { k: 'beginner', range: '12–15' },
  { k: 'ideal', range: '16–19' },
  { k: 'strong', range: '20–24' },
  { k: 'expert', range: '25+' },
];

const WeightPickerBar = ({ weight, onChange }) => {
  const { t } = useTranslation('common');
  const pct = ((weight - MIN_WEIGHT) / (MAX_WEIGHT - MIN_WEIGHT)) * 100;

  const handleChange = (v) => {
    onChange(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(WEIGHT_STORAGE_KEY, String(v));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
        {/* Weight slider */}
        <div className="flex flex-1 items-center gap-3">
          <UserIcon className="h-4 w-4 shrink-0 text-[#00a8c4]" />
          <Eyebrow className="shrink-0">{t('windReport.kiteSizer.weight')}</Eyebrow>
          <div className="relative flex-1">
            <div className="relative h-2 w-full rounded-full bg-slate-200">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#00a8c4] via-sky-400 to-amber-400"
                style={{ width: `${pct}%` }}
              />
              <input
                type="range"
                min={MIN_WEIGHT}
                max={MAX_WEIGHT}
                step={1}
                value={weight}
                onChange={(e) => handleChange(Number(e.target.value))}
                aria-label={t('windReport.kiteSizer.weight')}
                aria-valuetext={`${weight} kg`}
                className="peer absolute inset-0 -top-2 h-[200%] w-full cursor-grab opacity-0 active:cursor-grabbing"
              />
              {/* visible thumb — 24px target, shows keyboard focus via peer */}
              <div
                className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-slate-900 shadow transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#00a8c4] peer-focus-visible:ring-offset-2"
                style={{ left: `${pct}%` }}
              />
            </div>
          </div>
          <span className="min-w-[52px] text-right font-duotone-bold text-[15px] text-slate-900 tabular-nums">
            {weight} <DataLabel as="span">kg</DataLabel>
          </span>
        </div>

        {/* Legend → popover */}
        <Popover className="relative shrink-0">
          <Popover.Button className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-gotham-medium text-slate-600 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4]">
            <QuestionMarkCircleIcon className="h-4 w-4" />
            {t('windReport.colors.title', { defaultValue: 'What the colors mean' })}
          </Popover.Button>
          <Popover.Panel className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <Eyebrow className="mb-2 block">{t('windReport.legend', { defaultValue: 'Wind scale' })}</Eyebrow>
            <ul className="space-y-1.5">
              {LEGEND_BANDS.map((b) => (
                <li key={b.k} className="flex items-center gap-2.5">
                  <span className={`inline-block h-4 w-5 rounded ${WR_FILL[b.k]}`} />
                  <span className="w-12 text-[12px] font-gotham-medium text-slate-700 tabular-nums">{b.range}</span>
                  <span className="text-[12px] font-gotham-medium text-slate-500">{t(`windReport.skill.${b.k}`)}</span>
                </li>
              ))}
            </ul>
          </Popover.Panel>
        </Popover>
      </div>
    </div>
  );
};

export default WeightPickerBar;
