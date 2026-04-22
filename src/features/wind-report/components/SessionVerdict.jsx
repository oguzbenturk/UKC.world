import React from 'react';
import { useTranslation } from 'react-i18next';

// Skill chip styles optimised for dark background
const SKILL_STYLES = {
  flat:     { bg: 'bg-slate-500/30',  text: 'text-slate-100', dot: 'bg-slate-300' },
  light:    { bg: 'bg-sky-500/25',    text: 'text-sky-100',   dot: 'bg-sky-300' },
  beginner: { bg: 'bg-emerald-500/25',text: 'text-emerald-100', dot: 'bg-emerald-300' },
  ideal:    { bg: 'bg-lime-400/25',   text: 'text-lime-100',  dot: 'bg-lime-300' },
  strong:   { bg: 'bg-amber-500/25',  text: 'text-amber-100', dot: 'bg-amber-300' },
  expert:   { bg: 'bg-rose-500/25',   text: 'text-rose-100',  dot: 'bg-rose-300' },
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
      <p className="font-gotham-medium text-[13.5px] leading-snug text-slate-200">
        {sentence}
      </p>
    </div>
  );
};

export default SessionVerdict;
