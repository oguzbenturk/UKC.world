import React from 'react';
import { useTranslation } from 'react-i18next';
import { UserIcon } from '@heroicons/react/24/outline';
import { MIN_WEIGHT, MAX_WEIGHT, WEIGHT_STORAGE_KEY } from '../utils/kiteSize';

const LEGEND_BANDS = [
  { k: 'flat', range: '0–7', bg: 'bg-slate-300' },
  { k: 'light', range: '8–11', bg: 'bg-sky-400' },
  { k: 'beginner', range: '12–15', bg: 'bg-green-500' },
  { k: 'ideal', range: '16–19', bg: 'bg-lime-500' },
  { k: 'strong', range: '20–24', bg: 'bg-amber-500' },
  { k: 'expert', range: '25+', bg: 'bg-rose-500' },
];

const WeightPickerBar = ({ weight, onChange }) => {
  const { t } = useTranslation('common');
  const pct = ((weight - MIN_WEIGHT) / (MAX_WEIGHT - MIN_WEIGHT)) * 100;

  const handleChange = (v) => {
    onChange(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(WEIGHT_STORAGE_KEY, String(v));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-sm">
      <div className="flex flex-col divide-y divide-slate-200/70 md:flex-row md:divide-y-0 md:divide-x">
        {/* Weight picker — compact inline */}
        <div className="flex items-center gap-4 px-4 py-3 md:w-[360px] md:shrink-0">
          <UserIcon className="h-4 w-4 shrink-0 text-[#00a8c4]" />
          <span className="text-[10px] font-gotham-medium uppercase tracking-[0.25em] text-slate-500">
            {t('windReport.kiteSizer.weight')}
          </span>
          <div className="flex-1">
            <div className="relative">
              <div className="relative h-1.5 w-full rounded-full bg-slate-200">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#00a8c4] via-emerald-400 to-amber-400"
                  style={{ width: `${pct}%` }}
                />
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white bg-slate-900 shadow"
                  style={{ left: `${pct}%` }}
                />
              </div>
              <input
                type="range"
                min={MIN_WEIGHT}
                max={MAX_WEIGHT}
                step={1}
                value={weight}
                onChange={(e) => handleChange(Number(e.target.value))}
                className="absolute inset-0 -top-2 h-[200%] w-full cursor-grab opacity-0 active:cursor-grabbing"
                aria-label={t('windReport.kiteSizer.weight')}
              />
            </div>
          </div>
          <span className="font-duotone-bold text-sm text-slate-900 tabular-nums min-w-[48px] text-right">
            {weight} <span className="text-[10px] text-slate-400 font-gotham-medium">kg</span>
          </span>
        </div>

        {/* Legend — inline pills */}
        <div className="flex items-center gap-3 overflow-x-auto px-4 py-3 md:flex-1">
          <span className="text-[10px] font-gotham-medium uppercase tracking-[0.25em] text-slate-500 shrink-0">
            {t('windReport.legend')}
          </span>
          <div className="flex items-center gap-2.5">
            {LEGEND_BANDS.map((b) => (
              <div key={b.k} className="flex shrink-0 items-center gap-1.5">
                <span className={`inline-block h-3 w-4 rounded-sm ${b.bg}`} />
                <span className="text-[10px] font-gotham-medium text-slate-500 tabular-nums">
                  {b.range}
                </span>
                <span className="text-[9px] font-gotham-medium uppercase tracking-wider text-slate-400 hidden lg:inline">
                  {t(`windReport.skill.${b.k}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeightPickerBar;
