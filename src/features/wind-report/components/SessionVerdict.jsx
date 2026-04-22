import React from 'react';
import { useTranslation } from 'react-i18next';

// Skill chip styles optimised for a light sky background
const SKILL_STYLES = {
  flat:     { bg: 'bg-slate-100 ring-1 ring-slate-200',     text: 'text-slate-700',   dot: 'bg-slate-400' },
  light:    { bg: 'bg-sky-50 ring-1 ring-sky-200',          text: 'text-sky-700',     dot: 'bg-sky-500' },
  beginner: { bg: 'bg-emerald-50 ring-1 ring-emerald-200',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
  ideal:    { bg: 'bg-lime-50 ring-1 ring-lime-200',        text: 'text-lime-800',    dot: 'bg-lime-500' },
  strong:   { bg: 'bg-amber-50 ring-1 ring-amber-200',      text: 'text-amber-800',   dot: 'bg-amber-500' },
  expert:   { bg: 'bg-rose-50 ring-1 ring-rose-200',        text: 'text-rose-700',    dot: 'bg-rose-500' },
};

const SessionVerdict = ({ summary }) => {
  const { t } = useTranslation('common');
  if (!summary) return null;

  const peakTimeStr = summary.peakHour != null ? `${String(summary.peakHour).padStart(2, '0')}:00` : '—';
  const sentence = t(`windReport.verdict.${summary.key}`, {
    dir: summary.dirText,
    avg: summary.avgKn,
    peak: summary.peakKn,
    start: summary.startKn,
    end: summary.endKn,
    peakTime: peakTimeStr,
    peakGust: summary.peakGustKn,
  });

  const band = summary.skillBand;
  const style = SKILL_STYLES[band] || SKILL_STYLES.flat;
  const bandLabel = t(`windReport.skill.${band}`);

  return (
    <div className="flex flex-col gap-2">
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-duotone-bold uppercase tracking-[0.2em] ${style.bg} ${style.text}`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {bandLabel}
      </span>
      <p className="font-gotham-medium text-[13.5px] leading-snug text-slate-700">
        {sentence}
      </p>
    </div>
  );
};

export default SessionVerdict;
