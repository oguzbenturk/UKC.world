import React from 'react';
import { useTranslation } from 'react-i18next';
import { WR_CHIP, WR_DOT } from '../utils/bandTheme';
import { hhmm } from '../utils/verdict';

const SessionVerdict = ({ summary }) => {
  const { t } = useTranslation('common');
  if (!summary) return null;

  const peakTimeStr = summary.peakHour != null ? hhmm(summary.peakHour) : '—';
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
  const chip = WR_CHIP[band] || WR_CHIP.flat;
  const dot = WR_DOT[band] || WR_DOT.flat;
  const bandLabel = t(`windReport.skill.${band}`);

  const hasWindow = summary.bestStartHour != null;

  return (
    <div className="flex flex-col gap-2">
      {/* Dominant callout: when is the window today */}
      {hasWindow ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-duotone-bold text-[16px] leading-none text-slate-900">
            {t('windReport.card.bestWindow', {
              start: hhmm(summary.bestStartHour),
              end: hhmm(summary.bestEndHour),
              defaultValue: `Best ${hhmm(summary.bestStartHour)}–${hhmm(summary.bestEndHour)}`,
            })}
          </span>
          <span className="font-gotham-medium text-[13px] text-slate-500">
            {t('windReport.card.peak', { peak: summary.peakKn, defaultValue: `peak ${summary.peakKn} kn` })}
          </span>
        </div>
      ) : (
        <span className="font-duotone-bold text-[16px] leading-none text-slate-500">
          {t('windReport.card.noWindow', { defaultValue: 'No clear window today' })}
        </span>
      )}

      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-duotone-bold ${chip}`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        {bandLabel}
      </span>

      <p className="font-gotham-medium text-[14px] leading-snug text-slate-700">
        {sentence}
      </p>
    </div>
  );
};

export default SessionVerdict;
