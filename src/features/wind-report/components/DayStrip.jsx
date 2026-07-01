import React from 'react';
import { useTranslation } from 'react-i18next';
import WindCurve from './WindCurve';
import { dailySummary } from '../utils/verdict';

const parseDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// One day = a compact date label on the left + the day's wind curve on the right.
// (Replaces the old horizontally-scrolling row of 40px number cells.)
const DayStrip = ({ dateLocal, rows, selectedKey, onSelectHour, locale = 'en', showAxis = false }) => {
  const { t } = useTranslation('common');
  const date = parseDate(dateLocal);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isToday = date.getTime() === today.getTime();
  let badge = null;
  if (isToday) badge = t('windReport.when.today');
  else if (date.getTime() === tomorrow.getTime()) badge = t('windReport.when.tomorrow');

  const weekday = date.toLocaleDateString(locale, { weekday: 'short' });
  const dayNumber = date.getDate();

  const summary = React.useMemo(() => dailySummary(rows), [rows]);
  const nowHour = isToday ? new Date().getHours() : null;

  return (
    <div className="flex items-stretch gap-3">
      {/* Day label */}
      <div className="flex w-[52px] shrink-0 flex-col justify-center">
        {badge ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-gotham-medium uppercase tracking-[0.1em] text-[#00a8c4]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00a8c4]" />
            {badge}
          </span>
        ) : (
          <span className="text-[11px] font-gotham-medium uppercase tracking-[0.1em] text-slate-500">
            {weekday}
          </span>
        )}
        <span className="font-duotone-bold-extended text-2xl leading-none text-slate-900 tabular-nums">
          {dayNumber}
        </span>
      </div>

      {/* Curve */}
      <div className="min-w-0 flex-1">
        <WindCurve
          dateLocal={dateLocal}
          rows={rows}
          selectedKey={selectedKey}
          onSelectHour={onSelectHour}
          bestStartHour={summary?.bestStartHour}
          bestEndHour={summary?.bestEndHour}
          peakHour={summary?.peakHour}
          nowHour={nowHour}
          showAxis={showAxis}
          t={t}
        />
      </div>
    </div>
  );
};

export default DayStrip;
