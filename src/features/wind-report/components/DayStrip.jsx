import React from 'react';
import { useTranslation } from 'react-i18next';
import HourCell from './HourCell';
import { SESSION_START, SESSION_END, DAY_START, DAY_END } from '../utils/verdict';

const parseDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const CELL = 40;
const GAP = 3;

const DayStrip = ({ dateLocal, rows, selectedKey, onSelectHour, locale = 'en' }) => {
  const { t } = useTranslation('common');
  const date = parseDate(dateLocal);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let badge = null;
  if (date.getTime() === today.getTime()) badge = t('windReport.when.today');
  else if (date.getTime() === tomorrow.getTime()) badge = t('windReport.when.tomorrow');

  const weekday = date.toLocaleDateString(locale, { weekday: 'short' });
  const dayNumber = date.getDate();
  const monthShort = date.toLocaleDateString(locale, { month: 'short' });

  // Daylight cells 08:00-20:00
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  const HOURS_LEN = DAY_END - DAY_START + 1;
  const cells = Array.from({ length: HOURS_LEN }).map((_, idx) => {
    const h = DAY_START + idx;
    return byHour.get(h) || {
      hour: h,
      timeLocal: `${String(h).padStart(2, '0')}:00`,
      dateLocal,
      wspdKn: null,
      gustKn: null,
      dirDeg: null,
      dirText: '—',
      tempC: null,
    };
  });

  const sessionStartIdx = SESSION_START - DAY_START;
  const sessionLeft = sessionStartIdx * (CELL + GAP) - 2;
  const sessionWidth = (SESSION_END - SESSION_START + 1) * (CELL + GAP) + 1;

  return (
    <div className="flex items-center gap-4">
      {/* Day label */}
      <div className="flex min-w-[72px] shrink-0 flex-col items-start gap-0.5 pr-1">
        {badge ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-gotham-medium uppercase tracking-[0.2em] text-[#00a8c4]">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[#00a8c4]" />
            {badge}
          </span>
        ) : (
          <span className="text-[9px] font-gotham-medium uppercase tracking-[0.2em] text-slate-400">
            {weekday}
          </span>
        )}
        <div className="flex items-baseline gap-1">
          <span className="font-duotone-bold-extended text-xl leading-none text-slate-900 tabular-nums">
            {dayNumber}
          </span>
          <span className="text-[9px] font-gotham-medium uppercase tracking-wider text-slate-400">
            {monthShort}
          </span>
        </div>
      </div>

      {/* Hour row */}
      <div className="relative flex-1 overflow-x-auto">
        {/* Session band — subtle on the sky gradient */}
        <div
          className="pointer-events-none absolute top-0 h-full rounded-md bg-amber-200/35 ring-1 ring-amber-300/40"
          style={{ left: `${sessionLeft}px`, width: `${sessionWidth}px` }}
        />
        <div className="relative flex" style={{ gap: `${GAP}px` }}>
          {cells.map((h) => {
            const key = `${dateLocal}:${h.hour}`;
            return (
              <HourCell
                key={key}
                hour={{ ...h, dateLocal }}
                selected={key === selectedKey}
                onSelect={onSelectHour}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DayStrip;
