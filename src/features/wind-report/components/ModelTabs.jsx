import React from 'react';
import { MODEL_LABEL, GHOST_MODELS } from '../utils/models';

// Model switcher above the forecast grid. Mix is the default; GFS is a muted "reference"
// tab. When accuracy data exists (Gülbahçe, after ~7 days), each tab shows its ±kn error.
const ModelTabs = ({ models = [], active, onSelect, accuracy = {}, t }) => {
  if (!models.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t('windReport.grid.model', { defaultValue: 'Forecast model' })}>
      {models.map((m) => {
        const isActive = m.key === active;
        const ghost = GHOST_MODELS.includes(m.key);
        const mae = accuracy[m.key];
        const label = m.key === 'mix' ? t('windReport.models.mix', { defaultValue: 'UKC Mix' }) : (MODEL_LABEL[m.key] || m.name);
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(m.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-gotham-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] ${
              isActive
                ? 'bg-[#00a8c4] text-white shadow-[0_4px_12px_-4px_rgba(0,168,196,0.5)]'
                : ghost
                ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:text-slate-600'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
            {mae != null && (
              <span
                title={t('windReport.models.accuracyTip', { defaultValue: 'Avg error vs beach station, last 14 days' })}
                className={`rounded-full px-1.5 py-px text-[10.5px] font-gotham-bold tabular-nums ${
                  isActive ? 'bg-white/25 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
                }`}
              >
                ±{mae}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ModelTabs;
