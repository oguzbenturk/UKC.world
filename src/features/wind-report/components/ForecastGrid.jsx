import React from 'react';
import { getWindBand } from '../utils/windBands';
import { WR_SOFT, WR_ON_FILL, WR_HEX } from '../utils/bandTheme';
import { dayColumns, daySourceLabel, starRating, cloudPct, rainMm } from '../utils/forecastGrid';

// Dense Windguru-style forecast: hours (06–22) as columns grouped by day, with wind /
// gusts / direction / temp / clouds+rain / rating rows. Wind + gust cells are coloured
// by wind band but always show the number (colour never stands alone). Horizontally
// scrollable; sticky row labels.

const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

const Arrow = ({ deg, color = '#475569' }) => (
  <svg width="13" height="13" viewBox="0 0 12 12" className="mx-auto block" aria-hidden="true">
    <g transform={`rotate(${((deg ?? 0) + 180) % 360} 6 6)`}>
      <path d="M6 0.8 L9.4 10.2 L6 8.1 L2.6 10.2 Z" fill={color} />
    </g>
  </svg>
);

const ForecastGrid = ({ days = [], modelName = '', selectedKey, onSelectHour, locale = 'en', t }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nowHour = new Date().getHours();

  const dayMeta = (dateLocal) => {
    const date = parseDate(dateLocal);
    const isToday = date.getTime() === today.getTime();
    let badge = null;
    if (isToday) badge = t('windReport.when.today', { defaultValue: 'Today' });
    else if (date.getTime() === tomorrow.getTime()) badge = t('windReport.when.tomorrow', { defaultValue: 'Tomorrow' });
    return { isToday, badge, weekday: date.toLocaleDateString(locale, { weekday: 'short' }), dayNumber: date.getDate() };
  };

  // Flatten to [{ dateLocal, meta, cols }] with only renderable hours.
  const grid = days
    .map((d) => ({ dateLocal: d.dateLocal, meta: dayMeta(d.dateLocal), rows: d.rows, cols: dayColumns(d.rows) }))
    .filter((d) => d.cols.length);

  if (!grid.length) return null;

  const RowLabel = ({ children }) => (
    <th scope="row" className="sticky left-0 z-10 bg-white pr-3 text-left text-[11px] font-gotham-medium text-slate-500 whitespace-nowrap shadow-[6px_0_8px_-6px_rgba(15,23,42,0.14)]">
      {children}
    </th>
  );

  const cellBand = (kn) => {
    const b = getWindBand(kn);
    return b ? `${WR_SOFT[b]} ${WR_ON_FILL[b]}` : 'bg-slate-50 text-slate-400';
  };

  return (
    <div className="overflow-x-auto pb-1" style={{ scrollSnapType: 'x proximity' }}>
      <table className="border-separate border-spacing-0 tabular-nums">
        <tbody>
          {/* Day + hour header */}
          <tr>
            <RowLabel><span className="sr-only">{t('windReport.metrics.hourly', { defaultValue: 'Hourly forecast' })}</span></RowLabel>
            {grid.map((d) => (
              <th key={`h-${d.dateLocal}`} colSpan={d.cols.length} className="border-l-2 border-slate-200 px-1 pb-1.5 pt-2 text-left align-bottom" style={{ scrollSnapAlign: 'start' }}>
                <span className="font-duotone-bold-extended text-[15px] leading-none text-slate-900">
                  {d.meta.badge ? <span className="text-[#00a8c4]">{d.meta.badge}</span> : d.meta.weekday} {d.meta.dayNumber}
                </span>
                <span className="ml-2 rounded-full border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[9.5px] font-gotham-medium uppercase tracking-wide text-cyan-700 align-middle">
                  {daySourceLabel(d.rows, modelName)}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            <RowLabel />
            {grid.flatMap((d) => d.cols.map((r, i) => {
              const key = `${d.dateLocal}:${r.hour}`;
              const isNow = d.meta.isToday && r.hour === nowHour;
              const selected = key === selectedKey;
              return (
                <th key={`hh-${key}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} px-0 pb-1 pt-0.5`}>
                  <button
                    type="button"
                    onClick={() => onSelectHour?.({ ...r, dateLocal: d.dateLocal })}
                    aria-pressed={selected}
                    className={`min-w-[30px] rounded px-1 text-[11px] font-gotham-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] ${
                      isNow ? 'text-[#00a8c4]' : selected ? 'text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    {String(r.hour).padStart(2, '0')}
                  </button>
                </th>
              );
            }))}
          </tr>

          {/* Wind */}
          <tr>
            <RowLabel>{t('windReport.metrics.wind', { defaultValue: 'Wind' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => {
              const selected = `${d.dateLocal}:${r.hour}` === selectedKey;
              return (
                <td key={`w-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} p-[1px]`}>
                  <div className={`flex h-7 min-w-[30px] items-center justify-center rounded-md text-[12.5px] font-gotham-bold ${cellBand(r.wspdKn)} ${selected ? 'ring-2 ring-[#00a8c4] ring-inset' : ''}`}>
                    {r.wspdKn == null ? '–' : Math.round(r.wspdKn)}
                  </div>
                </td>
              );
            }))}
          </tr>

          {/* Gusts */}
          <tr>
            <RowLabel>{t('windReport.metrics.gusts', { defaultValue: 'Gusts' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => (
              <td key={`g-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} p-[1px]`}>
                <div className={`flex h-7 min-w-[30px] items-center justify-center rounded-md text-[12px] font-gotham-medium opacity-90 ${cellBand(r.gustKn)}`}>
                  {r.gustKn == null ? '–' : Math.round(r.gustKn)}
                </div>
              </td>
            )))}
          </tr>

          {/* Direction */}
          <tr>
            <RowLabel>{t('windReport.metrics.direction', { defaultValue: 'Direction' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => (
              <td key={`d-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} py-0.5`}>
                <Arrow deg={r.dirDeg} color={WR_HEX[getWindBand(r.wspdKn)] || '#475569'} />
              </td>
            )))}
          </tr>

          {/* Temp */}
          <tr>
            <RowLabel>{t('windReport.metrics.temp', { defaultValue: 'Temp' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => (
              <td key={`t-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} py-1 text-center text-[11.5px] font-gotham-medium text-slate-600`}>
                {r.tempC == null ? '' : Math.round(r.tempC)}
              </td>
            )))}
          </tr>

          {/* Clouds / rain */}
          <tr>
            <RowLabel>{t('windReport.grid.sky', { defaultValue: 'Sky' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => {
              const c = cloudPct(r); const rain = rainMm(r);
              return (
                <td key={`c-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} py-1 text-center`}>
                  <div className="text-[10.5px] font-gotham-medium text-slate-400">{c == null ? '' : `${Math.round(c)}%`}</div>
                  {rain != null && rain >= 0.1 && (
                    <div className="text-[10px] font-gotham-bold text-sky-600">{rain < 1 ? rain.toFixed(1) : Math.round(rain)}</div>
                  )}
                </td>
              );
            }))}
          </tr>

          {/* Rating */}
          <tr>
            <RowLabel>{t('windReport.grid.rating', { defaultValue: 'Rating' })}</RowLabel>
            {grid.flatMap((d) => d.cols.map((r, i) => {
              const s = starRating(r.wspdKn);
              return (
                <td key={`r-${d.dateLocal}-${r.hour}`} className={`${i === 0 ? 'border-l-2 border-slate-200' : ''} pb-2 pt-0.5 text-center text-[10px] leading-none tracking-tight ${s ? 'text-amber-500' : 'text-slate-300'}`}>
                  {s ? '★'.repeat(s) : '–'}
                </td>
              );
            }))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default ForecastGrid;
